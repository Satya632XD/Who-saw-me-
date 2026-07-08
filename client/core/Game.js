// Game.js
// Top-level orchestrator. Owns the game state machine (lobby/prep/hunt/end),
// the main render loop, and wires network events to scene/UI updates.

import * as THREE from 'three';
import { NetworkClient } from './NetworkClient.js';
import { MessageType, GamePhase } from './MessageSchema.js';
import { SceneManager } from '../render/SceneManager.js';
import { PlayerMesh } from '../render/PlayerMesh.js';
import { PlayerController } from '../movement/PlayerController.js';
import { PaintSystem, PaintTool } from '../paint/PaintSystem.js';
import { MaterialControls } from '../paint/MaterialControls.js';
import { HUD } from '../ui/HUD.js';

const SERVER_URL = window.WHOSAWME_SERVER_URL || 'ws://localhost:8080';
const NETWORK_SEND_HZ = 15;

export class Game {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.sceneManager = new SceneManager(this.canvas);
    this.hud = new HUD(document.getElementById('ui-root'));
    this.network = new NetworkClient(SERVER_URL);

    this.localPlayerId = null;
    this.localRole = null;
    this.phase = GamePhase.LOBBY;

    this.remotePlayers = new Map(); // playerId -> { mesh, controllerState }
    this.localMesh = null;
    this.localController = null;
    this.paintSystem = null;

    this._lastFrameTime = performance.now();
    this._lastNetworkSend = 0;

    this.hud.showLobby();
    this._bindLobbyUI();
  }

  async start() {
    await this.network.connect();
    this._bindNetworkEvents();
    this._loop();
  }

  _bindLobbyUI() {
    this.hud.bindLobbyActions({
      onCreateRoom: (name) => {
        this.hud.setLobbyStatus('Creating room...');
        this.network.send(MessageType.CREATE_ROOM, { name });
      },
      onJoinRoom: (name, code) => {
        this.hud.setLobbyStatus(`Joining ${code}...`);
        this.network.send(MessageType.JOIN_ROOM, { name, roomCode: code });
      },
      onReady: () => {
        this.network.send(MessageType.READY_UP, { ready: true });
        this.hud.setLobbyStatus('Waiting for other players...');
      },
    });
  }

  _bindNetworkEvents() {
    this.network.on(MessageType.ROOM_JOINED, (payload) => {
      this.localPlayerId = payload.playerId;
      this.hud.setLobbyStatus(`Room ${payload.roomCode} — share this code!`);
      this.hud.setPlayerList(payload.players);
      this.hud.showReadyButton();
      this._spawnLocalPlayer();
    });

    this.network.on(MessageType.ROOM_ERROR, (payload) => {
      this.hud.setLobbyStatus(`Error: ${payload.reason}`);
    });

    this.network.on(MessageType.PLAYER_JOINED, () => {
      // Full player_list refresh happens via room_joined on rejoin;
      // for v1 we just note the count changed.
    });

    this.network.on(MessageType.PLAYER_LEFT, (payload) => {
      const remote = this.remotePlayers.get(payload.playerId);
      if (remote) {
        this.sceneManager.scene.remove(remote.mesh.getObject3D());
        this.remotePlayers.delete(payload.playerId);
      }
    });

    this.network.on(MessageType.ROLE_ASSIGNED, (payload) => {
      this.localRole = payload.role;
      this.hud.setRole(this.localRole);
    });

    this.network.on(MessageType.PHASE_CHANGE, (payload) => {
      this.phase = payload.phase;
      this._onPhaseChange(payload.phase);
    });

    this.network.on(MessageType.TIMER_UPDATE, (payload) => {
      this.hud.setTimer(payload.remainingMs);
    });

    this.network.on(MessageType.STATE_SYNC, (payload) => {
      this._updateRemotePlayer(payload);
    });

    this.network.on(MessageType.PAINT_BROADCAST, (payload) => {
      const remote = this.remotePlayers.get(payload.playerId);
      if (remote) {
        this.paintSystem.applyRemoteStroke(remote.mesh, payload.stroke);
      }
    });

    this.network.on(MessageType.TAG_RESULT, (payload) => {
      if (payload.targetId === this.localPlayerId && payload.success) {
        this.hud.setPhaseBanner('You were tagged!');
      }
    });

    this.network.on(MessageType.ROUND_END, (payload) => {
      this.hud.setPhaseBanner(`Round over: ${payload.reason} (${payload.survivorCount} survived)`);
    });
  }

  _spawnLocalPlayer() {
    this.localMesh = new PlayerMesh();
    this.sceneManager.scene.add(this.localMesh.getObject3D());
    this.localController = new PlayerController(this.localMesh, this.sceneManager.camera);

    this.paintSystem = new PaintSystem(this.sceneManager, this.localMesh, (stroke) => {
      this.network.send(MessageType.PAINT_UPDATE, { stroke });
    });

    const metalnessSlider = this.hud.getMetalnessSlider();
    const roughnessSlider = this.hud.getRoughnessSlider();
    this.materialControls = new MaterialControls(this.localMesh, metalnessSlider, roughnessSlider);

    this.hud.onToolChange((tool) => this.paintSystem.setTool(tool));
    this.hud.onColorChange((hex) => this.paintSystem.setBrushColor(hex));
    this.hud.onBrushSizeChange((size) => this.paintSystem.setBrushSize(size));
    this.hud.onPoseChange((poseName) => {
      this.localMesh.setPose(poseName);
      // Locking a pose during prep should also freeze normal locomotion
      // input for standing-only poses so the character doesn't visually
      // fight the pose while still being able to slide around hidden.
      this.localController.setPoseLocked(poseName !== 'standing');
    });

    this._bindPaintInput();
    this._bindTouchControls();
  }

  _bindTouchControls() {
    this.hud.showTouchControls(true);
    this.hud.bindTouchControls({
      onMove: (x, y) => this.localController.setTouchMove(x, y),
      onLookDelta: (dx) => {
        this.localController.setYaw(this.localController.yaw - dx * 0.005);
      },
      onJump: () => this.localController.setTouchJump(),
      onSprint: (active) => this.localController.setTouchSprint(active),
      onCrouch: (active) => this.localController.setTouchCrouch(active),
    });
  }

  _bindPaintInput() {
    this.canvas.addEventListener('click', (e) => {
      if (this.phase !== GamePhase.PREP) return;

      const ndcX = (e.clientX / window.innerWidth) * 2 - 1;
      const ndcY = -(e.clientY / window.innerHeight) * 2 + 1;

      if (this.hud.getActiveTool() === PaintTool.EYEDROPPER) {
        const hit = this.paintSystem.raycastFromScreen(
          ndcX, ndcY, this.sceneManager.props, this.sceneManager.camera
        );
        if (hit) {
          const sampled = this.paintSystem.sampleColorFromObject(hit.object);
          if (sampled) this.hud.setColorPicker(sampled);
        }
        return;
      }

      const selfHit = this.paintSystem.raycastFromScreen(
        ndcX, ndcY, this.localMesh.getPaintableMeshes(), this.sceneManager.camera
      );
      if (selfHit && selfHit.uv) {
        this.paintSystem.handlePaintInputOnSelf(selfHit.uv);
      }
    });
  }

  _onPhaseChange(phase) {
    if (phase === GamePhase.PREP) {
      this.hud.showGameHUD();
      this.hud.setPhaseBanner('Preparation Phase — hide and camouflage!');
      this.hud.showPaintToolbar(this.localRole === 'hider');
      this.hud.setLookZoneEnabled(false);
    } else if (phase === GamePhase.HUNT) {
      this.hud.setPhaseBanner('Hunt Phase — seekers are loose!');
      this.hud.showPaintToolbar(false);
      this.hud.setLookZoneEnabled(true);
    } else if (phase === GamePhase.END) {
      this.hud.showPaintToolbar(false);
    } else if (phase === GamePhase.LOBBY) {
      this.hud.showLobby();
    }
  }

  _updateRemotePlayer(payload) {
    // The server broadcasts state for every player including ourselves;
    // skip it here since our own mesh is already driven locally by
    // localController for zero-latency movement. Without this check a
    // second "ghost" copy of the local player spawns and desyncs from
    // the real one whenever position updates lag behind local prediction.
    if (payload.playerId === this.localPlayerId) return;

    let remote = this.remotePlayers.get(payload.playerId);
    if (!remote) {
      const mesh = new PlayerMesh();
      this.sceneManager.scene.add(mesh.getObject3D());
      remote = { mesh };
      this.remotePlayers.set(payload.playerId, remote);
    }
    const obj = remote.mesh.getObject3D();
    obj.position.set(payload.position.x, payload.position.y, payload.position.z);
    obj.rotation.y = payload.rotation;
    remote.mesh.setCrouching(payload.crouching);
  }

  _attemptTag(targetPlayerId) {
    if (this.localRole !== 'seeker' || this.phase !== GamePhase.HUNT) return;
    this.network.send(MessageType.TAG_ATTEMPT, { targetId: targetPlayerId });
  }

  _loop = () => {
    requestAnimationFrame(this._loop);
    const now = performance.now();
    const deltaSeconds = Math.min((now - this._lastFrameTime) / 1000, 0.1);
    this._lastFrameTime = now;

    if (this.localController) {
      const colliders = this.sceneManager.props;
      this.localController.update(deltaSeconds, colliders);

      if (now - this._lastNetworkSend > 1000 / NETWORK_SEND_HZ) {
        this._lastNetworkSend = now;
        this.network.send(MessageType.PLAYER_STATE, this.localController.getState());
      }

      // Simple third-person-ish camera follow.
      const targetPos = this.localController.position;
      this.sceneManager.camera.position.set(
        targetPos.x - Math.sin(this.localController.yaw) * 8,
        targetPos.y + 4,
        targetPos.z - Math.cos(this.localController.yaw) * 8
      );
      this.sceneManager.camera.lookAt(targetPos.x, targetPos.y + 1.2, targetPos.z);
    }

    this.sceneManager.render();
  };
}
