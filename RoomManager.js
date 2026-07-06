// RoomManager.js
// Handles room code generation, creation, and lookup.

const { GameRoom } = require('./GameRoom');

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars (0/O, 1/I)
const CODE_LENGTH = 5;
const MAX_PLAYERS_PER_ROOM = 8;

class RoomManager {
  constructor() {
    this.rooms = new Map(); // roomCode -> GameRoom
  }

  generateCode() {
    let code;
    do {
      code = Array.from({ length: CODE_LENGTH }, () =>
        CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
      ).join('');
    } while (this.rooms.has(code));
    return code;
  }

  createRoom() {
    const code = this.generateCode();
    const room = new GameRoom(code);
    this.rooms.set(code, room);
    return room;
  }

  getRoom(code) {
    return this.rooms.get((code || '').toUpperCase());
  }

  canJoin(room) {
    return room && room.players.size < MAX_PLAYERS_PER_ROOM;
  }

  removeRoomIfEmpty(code) {
    const room = this.rooms.get(code);
    if (room && room.players.size === 0) {
      this.rooms.delete(code);
    }
  }
}

module.exports = { RoomManager, MAX_PLAYERS_PER_ROOM };
