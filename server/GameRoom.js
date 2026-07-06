// GameRoom.js
// Holds authoritative state for a single game room: players, phase, timer,
// tag validation. One instance per active room.

const { MessageType, GamePhase, Role, makeMessage } = require('./MessageSchema');

const PREP_DURATION_MS = 60 * 1000;
const HUNT_DURATION_MS = 3 * 60 * 1000;
const END_DURATION_MS = 10 * 1000;
const MIN_PLAYERS_TO_START = 2;
const TAG_RANGE = 2.2; // world units, matches server-side distance check

class GameRoom {
  constructor(roomCode) {
    this.roomCode = roomCode;
    this.players = new Map(); // playerId -> playerState
    this.phase = GamePhase.LOBBY;
    this.phaseEndsAt = null;
    this.tickInterval = null;
    this.timerBroadcastInterval = null;
  }

  addPlayer(playerId, socket, name) {
    this.players.set(playerId, {
      id: playerId,
      socket,
      name: name || `Player${playerId.slice(0, 4)}`,
      role: null,
      position: { x: 0, y: 0, z: 0 },
      rotation: 0,
      crouching: false,
      ready: false,
      alive: true,
      paintData: null, // last known texture patch summary, not full canvas
    });
    this.broadcast(MessageType.PLAYER_JOINED, {
      playerId,
      name: this.players.get(playerId).name,
      count: this.players.size,
    }, playerId);
  }

  removePlayer(playerId) {
    this.players.delete(playerId);
    this.broadcast(MessageType.PLAYER_LEFT, { playerId, count: this.players.size });
    if (this.players.size === 0) {
      this.stopTimers();
    }
  }

  setReady(playerId, ready) {
    const p = this.players.get(playerId);
    if (!p) return;
    p.ready = ready;
    const allReady = this.players.size >= MIN_PLAYERS_TO_START &&
      [...this.players.values()].every(pl => pl.ready);
    if (allReady && this.phase === GamePhase.LOBBY) {
      this.startPrepPhase();
    }
  }

  assignRoles() {
    const ids = [...this.players.keys()];
    // Roughly 1 seeker per 4 hiders, minimum 1 seeker.
    const seekerCount = Math.max(1, Math.floor(ids.length / 4));
    const shuffled = ids.sort(() => Math.random() - 0.5);
    const seekerIds = new Set(shuffled.slice(0, seekerCount));

    for (const id of ids) {
      const p = this.players.get(id);
      p.role = seekerIds.has(id) ? Role.SEEKER : Role.HIDER;
      p.alive = true;
      p.socket.send(makeMessage(MessageType.ROLE_ASSIGNED, { role: p.role }));
    }
  }

  startPrepPhase() {
    this.assignRoles();
    this.phase = GamePhase.PREP;
    this.phaseEndsAt = Date.now() + PREP_DURATION_MS;
    this.broadcast(MessageType.PHASE_CHANGE, {
      phase: this.phase,
      durationMs: PREP_DURATION_MS,
    });
    this.startTimerBroadcast();
    this.scheduleNextPhase(PREP_DURATION_MS, () => this.startHuntPhase());
  }

  startHuntPhase() {
    this.phase = GamePhase.HUNT;
    this.phaseEndsAt = Date.now() + HUNT_DURATION_MS;
    this.broadcast(MessageType.PHASE_CHANGE, {
      phase: this.phase,
      durationMs: HUNT_DURATION_MS,
    });
    this.scheduleNextPhase(HUNT_DURATION_MS, () => this.endRound('timeout'));
  }

  endRound(reason) {
    this.phase = GamePhase.END;
    this.phaseEndsAt = Date.now() + END_DURATION_MS;
    const survivors = [...this.players.values()].filter(
      p => p.role === Role.HIDER && p.alive
    );
    this.broadcast(MessageType.ROUND_END, {
      reason,
      survivorIds: survivors.map(p => p.id),
      survivorCount: survivors.length,
    });
    this.scheduleNextPhase(END_DURATION_MS, () => this.resetToLobby());
  }

  resetToLobby() {
    this.phase = GamePhase.LOBBY;
    this.stopTimers();
    for (const p of this.players.values()) {
      p.ready = false;
      p.role = null;
      p.alive = true;
    }
    this.broadcast(MessageType.PHASE_CHANGE, { phase: this.phase });
  }

  scheduleNextPhase(delayMs, fn) {
    clearTimeout(this._phaseTimeout);
    this._phaseTimeout = setTimeout(fn, delayMs);
  }

  startTimerBroadcast() {
    clearInterval(this.timerBroadcastInterval);
    this.timerBroadcastInterval = setInterval(() => {
      if (!this.phaseEndsAt) return;
      const remainingMs = Math.max(0, this.phaseEndsAt - Date.now());
      this.broadcast(MessageType.TIMER_UPDATE, { remainingMs, phase: this.phase });
      if (remainingMs <= 0 && this.phase !== GamePhase.LOBBY) {
        // safety net; scheduleNextPhase should have already fired
      }
    }, 1000);
  }

  stopTimers() {
    clearInterval(this.timerBroadcastInterval);
    clearTimeout(this._phaseTimeout);
    this.phaseEndsAt = null;
  }

  // --- Gameplay message handlers ---

  handlePlayerState(playerId, payload) {
    const p = this.players.get(playerId);
    if (!p) return;
    // Trust client position for v1 (client-authoritative movement),
    // but clamp to sane bounds as a minimal anti-cheat baseline.
    const { x, y, z } = payload.position || {};
    if ([x, y, z].some(v => typeof v !== 'number' || Math.abs(v) > 500)) return;
    p.position = { x, y, z };
    p.rotation = typeof payload.rotation === 'number' ? payload.rotation : p.rotation;
    p.crouching = !!payload.crouching;

    this.broadcast(MessageType.STATE_SYNC, {
      playerId,
      position: p.position,
      rotation: p.rotation,
      crouching: p.crouching,
    }, playerId);
  }

  handlePaintUpdate(playerId, payload) {
    const p = this.players.get(playerId);
    if (!p || this.phase !== GamePhase.PREP) return;
    // Relay the paint stroke to others; server doesn't store full canvas data,
    // just forwards for real-time visual sync between clients.
    this.broadcast(MessageType.PAINT_BROADCAST, {
      playerId,
      stroke: payload.stroke,
    }, playerId);
  }

  handleTagAttempt(seekerId, payload) {
    const seeker = this.players.get(seekerId);
    if (!seeker || seeker.role !== Role.SEEKER || this.phase !== GamePhase.HUNT) return;

    const target = this.players.get(payload.targetId);
    if (!target || target.role !== Role.HIDER || !target.alive) return;

    const dx = seeker.position.x - target.position.x;
    const dy = seeker.position.y - target.position.y;
    const dz = seeker.position.z - target.position.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    const success = dist <= TAG_RANGE;
    if (success) {
      target.alive = false;
      target.role = Role.ELIMINATED;
    }

    this.broadcast(MessageType.TAG_RESULT, {
      seekerId,
      targetId: target.id,
      success,
    });

    const remainingHiders = [...this.players.values()].filter(
      p => p.role === Role.HIDER && p.alive
    );
    if (success && remainingHiders.length === 0) {
      this.endRound('all_tagged');
    }
  }

  broadcast(type, payload, excludePlayerId = null) {
    const msg = makeMessage(type, payload);
    for (const [id, p] of this.players) {
      if (id === excludePlayerId) continue;
      if (p.socket.readyState === 1 /* OPEN */) {
        p.socket.send(msg);
      }
    }
  }

  getLobbySnapshot() {
    return {
      roomCode: this.roomCode,
      phase: this.phase,
      players: [...this.players.values()].map(p => ({
        id: p.id,
        name: p.name,
        ready: p.ready,
        role: p.role,
      })),
    };
  }
}

module.exports = { GameRoom, MIN_PLAYERS_TO_START };
