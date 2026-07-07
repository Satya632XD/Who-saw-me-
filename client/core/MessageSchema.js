// MessageSchema.js
// Defines the wire format for all client<->server messages.
// Keep this file identical (copy-paste) on the client side since there's
// no bundler to share modules across client/server in this deployment setup.

const MessageType = {
  // Client -> Server
  JOIN_ROOM: 'join_room',
  CREATE_ROOM: 'create_room',
  LEAVE_ROOM: 'leave_room',
  PLAYER_INPUT: 'player_input',       // movement intent
  PLAYER_STATE: 'player_state',       // position/rotation reconciliation
  PAINT_UPDATE: 'paint_update',       // texture patch applied during prep
  TAG_ATTEMPT: 'tag_attempt',         // seeker tries to tag a hider
  READY_UP: 'ready_up',

  // Server -> Client
  ROOM_JOINED: 'room_joined',
  ROOM_ERROR: 'room_error',
  PLAYER_JOINED: 'player_joined',
  PLAYER_LEFT: 'player_left',
  PHASE_CHANGE: 'phase_change',       // lobby | prep | hunt | end
  TIMER_UPDATE: 'timer_update',
  STATE_SYNC: 'state_sync',           // authoritative snapshot of all players
  PAINT_BROADCAST: 'paint_broadcast', // relay another player's paint stroke
  TAG_RESULT: 'tag_result',
  ROUND_END: 'round_end',
  ROLE_ASSIGNED: 'role_assigned',
};

const GamePhase = {
  LOBBY: 'lobby',
  PREP: 'prep',
  HUNT: 'hunt',
  END: 'end',
};

const Role = {
  HIDER: 'hider',
  SEEKER: 'seeker',
  ELIMINATED: 'eliminated',
};

function makeMessage(type, payload = {}) {
  return JSON.stringify({ type, payload, ts: Date.now() });
}

function parseMessage(raw) {
  try {
    const msg = JSON.parse(raw);
    if (!msg || typeof msg.type !== 'string') return null;
    return msg;
  } catch (e) {
    return null;
  }
}

export { MessageType, GamePhase, Role, makeMessage, parseMessage };
