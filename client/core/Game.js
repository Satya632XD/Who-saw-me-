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

function playGunSound() {
  if (!playGunSound.audioCtx) {
    playGunSound.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  const ctx = playGunSound.audioCtx;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(150, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.15);
  gain.gain.setValueAtTime(0.3, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.15);
}

class PaintSplatManager {
  constructor(scene) {
    this.scene = scene;
    this.splats = [];
    this.splatColors = [0x39ff14, 0x00bfff, 0xffdd00, 0xff0066, 0xcc33ff, 0xff4500];
  }
  spawn(position, normal) {
    const color = this.splatColors[Math.floor(Math.random() * this.splatColors.length)];
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(64, 64, 10, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
    gradient.addColorStop(0.3, `#${new THREE.Color(color).getHexString()}`);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, blending: THREE.NormalBlending, depthTest: true, depthWrite: false });
    const sprite = new THREE.Sprite(material);
    sprite.position.copy(position.clone().addScaledVector(normal, 0.02));
    sprite.scale.set(0.3, 0.3, 1);
    this.scene.add(sprite);
    const startTime = performance.now();
    this.splats.push({ sprite, startTime });
  }
  update(now) {
    for (let i = this.splats.length - 1; i >= 0; i--) {
      const s = this.splats[i];
      const age = (now - s.startTime) / 1000;
      if (age > 3) {
        this.scene.remove(s.sprite);
        s.sprite.material.map.dispose();
        s.sprite.material.dispose();
        this.splats.splice(i, 1);
        continue;
      }
      const alpha = 1 - age / 3;
      s.sprite.material.opacity = alpha;
      s.sprite.scale.setScalar(0.3 + age * 0.2);
    }
  }
}

export class Game {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.sceneManager = new SceneManager(this.canvas);
    this.hud = new HUD(document.getElementById('ui-root'));
    this.network = new NetworkClient(SERVER_URL);
    this.splatManager = new PaintSplatManager(this.sceneManager.scene);
    this.localPlayerId = null;
    this.localRole = null;
    this.phase = GamePhase.LOBBY;
    this.remotePlayers = new Map();
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
    this.network.on(MessageType.PLAYER_JOINED, () => {});
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
      this._applyMovementLock();
      this._applyWeaponVisibility();
      if (this.localMesh) {
        if (this.localRole === 'seeker') this.localMesh.attachGun();
        else this.localMesh.removeGun();
      }
    });
    this.network.on(MessageType.PHASE_CHANGE, (payload) => {
      this.phase = payload.phase;
      this._onPhaseChange(payload.phase);
      this._applyMovementLock();
      this._applyWeaponVisibility();
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
        if (this.localMesh) this.localMesh.getObject3D().visible = false;
      }
      if (payload.success) {
        const remote = this.remotePlayers.get(payload.targetId);
        if (remote) {
          remote.mesh.getObject3D().visible = false;
          remote.eliminated = true;
        }
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
    this._applyMovementLock();
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
      this.localController.setPoseLocked(poseName !== 'standing');
    });
    this._bindPaintInput();
    this._bindTouchControls();
  }

  _bindTouchControls() {
    this.hud.showTouchControls(true);
    this.hud.bindTouchControls({
      onMove: (x, y) => this.localController.setTouchMove(x, y),
      onLookDelta: (dx, dy) => {
        this.localController.addCameraYaw(-dx * 0.005);
        this.localController.addCameraPitch(-dy * 0.005);
      },
      onJump: () => this.localController.setTouchJump(),
      onSprint: (active) => this.localController.setTouchSprint(active),
      onCrouch: (active) => this.localController.setTouchCrouch(active),
      onCameraToggle: () => this.localController.toggleCameraMode(),
      onShoot: () => this._shoot(),
    });
    let dragging = false, lastMouseX = 0, lastMouseY = 0;
    this.canvas.addEventListener('mousedown', (e) => {
      dragging = true; lastMouseX = e.clientX; lastMouseY = e.clientY;
    });
    window.addEventListener('mouseup', () => { dragging = false; });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastMouseX, dy = e.clientY - lastMouseY;
      lastMouseX = e.clientX; lastMouseY = e.clientY;
      this.localController.addCameraYaw(-dx * 0.005);
      this.localController.addCameraPitch(-dy * 0.005);
    });
  }

  _bindPaintInput() {
    this.canvas.addEventListener('click', (e) => {
      if (this.phase !== GamePhase.PREP) return;
      const ndcX = (e.clientX / window.innerWidth) * 2 - 1;
      const ndcY = -(e.clientY / window.innerHeight) * 2 + 1;
      if (this.hud.getActiveTool() === PaintTool.EYEDROPPER) {
        const hit = this.paintSystem.raycastFromScreen(ndcX, ndcY, this.sceneManager.props, this.sceneManager.camera);
        if (hit) {
          const sampled = this.paintSystem.sampleColorFromObject(hit.object);
          if (sampled) this.hud.setColorPicker(sampled);
        }
        return;
      }
      const selfHit = this.paintSystem.raycastFromScreen(ndcX, ndcY, this.localMesh.getPaintableMeshes(), this.sceneManager.camera);
      if (selfHit && selfHit.uv) {
        this.paintSystem.handlePaintInputOnSelf(selfHit.uv);
      }
    });
  }

  _applyMovementLock() {
    if (!this.localController) return;
    const shouldLock = this.localRole === 'seeker' && this.phase === GamePhase.PREP;
    this.localController.setMovementLocked(shouldLock);
  }

  _applyWeaponVisibility() {
    const visible = this.localRole === 'seeker' && this.phase === GamePhase.HUNT;
    this.hud.setWeaponUIVisible(visible);
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
      if (this.localMesh) this.localMesh.getObject3D().visible = true;
      for (const remote of this.remotePlayers.values()) {
        remote.mesh.getObject3D().visible = true;
        remote.eliminated = false;
      }
    }
  }

  _updateRemotePlayer(payload) {
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
    if (payload.pose) remote.mesh.setPose(payload.pose);
  }

  _shoot() {
    if (this.localRole !== 'seeker' || this.phase !== GamePhase.HUNT) return;
    playGunSound();
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera({ x: 0, y: 0 }, this.sceneManager.camera);
    const allTargets = [...this.sceneManager.props];
    for (const remote of this.remotePlayers.values()) {
      if (!remote.eliminated) allTargets.push(remote.mesh.getObject3D());
    }
    const hits = raycaster.intersectObjects(allTargets, true);
    let hitPlayer = null, closestDist = Infinity, wallHit = null;
    for (const hit of hits) {
      if (hit.distance < closestDist) {
        let obj = hit.object;
        while (obj) {
          for (const [pid, remote] of this.remotePlayers) {
            if (remote.eliminated) continue;
            if (remote.mesh.getObject3D() === obj) {
              hitPlayer = pid;
              closestDist = hit.distance;
              break;
            }
          }
          obj = obj.parent;
        }
        if (!hitPlayer && hit.distance < closestDist) {
          wallHit = hit;
          closestDist = hit.distance;
        }
      }
    }
    this.hud.flashCrosshair(!!hitPlayer);
    if (hitPlayer) {
      this.network.send(MessageType.TAG_ATTEMPT, { targetId: hitPlayer });
    } else if (wallHit) {
      this.splatManager.spawn(wallHit.point, wallHit.face.normal);
    }
  }

  _loop = () => {
    requestAnimationFrame(this._loop);
    const now = performance.now();
    const deltaSeconds = Math.min((now - this._lastFrameTime) / 1000, 0.1);
    this._lastFrameTime = now;
    this.splatManager.update(now);
    if (this.localController) {
      const colliders = this.sceneManager.props;
      this.localController.update(deltaSeconds, colliders);
      if (now - this._lastNetworkSend > 1000 / NETWORK_SEND_HZ) {
        this._lastNetworkSend = now;
        this.network.send(MessageType.PLAYER_STATE, this.localController.getState());
      }
      const targetPos = this.localController.position;
      const camYaw = this.localController.cameraYaw;
      const camPitch = this.localController.cameraPitch;
      const headHeight = 1.6;
      if (this.localController.cameraMode === 'first') {
        this.localMesh.getObject3D().visible = false;
        const camPos = new THREE.Vector3(targetPos.x, targetPos.y + headHeight, targetPos.z);
        this.sceneManager.camera.position.copy(camPos);
        const lookDir = new THREE.Vector3(
          Math.sin(camYaw) * Math.cos(camPitch),
          Math.sin(camPitch),
          Math.cos(camYaw) * Math.cos(camPitch)
        );
        this.sceneManager.camera.lookAt(camPos.clone().add(lookDir));
      } else {
        this.localMesh.getObject3D().visible = true;
        const distance = 8;
        const horizontalDist = distance * Math.cos(camPitch);
        const height = targetPos.y + 4 + distance * Math.sin(camPitch);
        this.sceneManager.camera.position.set(
          targetPos.x - Math.sin(camYaw) * horizontalDist,
          height,
          targetPos.z - Math.cos(camYaw) * horizontalDist
        );
        this.sceneManager.camera.lookAt(targetPos.x, targetPos.y + 1.2, targetPos.z);
      }
    }
    this.sceneManager.render();
  };
}
