// index.js
// WebSocket server bootstrap. Deploy target: Render.

const { WebSocketServer } = require('ws');
const crypto = require('crypto');
const { RoomManager } = require('./RoomManager');
const { MessageType, parseMessage, makeMessage } = require('./MessageSchema');

const PORT = process.env.PORT || 8080;
const roomManager = new RoomManager();

const wss = new WebSocketServer({ port: PORT });

console.log(`Who Saw Me? server listening on port ${PORT}`);

wss.on('connection', (socket) => {
  const playerId = crypto.randomUUID();
  let currentRoomCode = null;

  socket.on('message', (raw) => {
    const msg = parseMessage(raw.toString());
    if (!msg) return;

    switch (msg.type) {
      case MessageType.CREATE_ROOM: {
        const room = roomManager.createRoom();
        currentRoomCode = room.roomCode;
        room.addPlayer(playerId, socket, msg.payload?.name);
        socket.send(makeMessage(MessageType.ROOM_JOINED, {
          playerId,
          ...room.getLobbySnapshot(),
        }));
        break;
      }

      case MessageType.JOIN_ROOM: {
        const room = roomManager.getRoom(msg.payload?.roomCode);
        if (!roomManager.canJoin(room)) {
          socket.send(makeMessage(MessageType.ROOM_ERROR, {
            reason: room ? 'room_full' : 'room_not_found',
          }));
          return;
        }
        currentRoomCode = room.roomCode;
        room.addPlayer(playerId, socket, msg.payload?.name);
        socket.send(makeMessage(MessageType.ROOM_JOINED, {
          playerId,
          ...room.getLobbySnapshot(),
        }));
        break;
      }

      case MessageType.READY_UP: {
        const room = roomManager.getRoom(currentRoomCode);
        room?.setReady(playerId, !!msg.payload?.ready);
        break;
      }

      case MessageType.PLAYER_STATE: {
        const room = roomManager.getRoom(currentRoomCode);
        room?.handlePlayerState(playerId, msg.payload);
        break;
      }

      case MessageType.PAINT_UPDATE: {
        const room = roomManager.getRoom(currentRoomCode);
        room?.handlePaintUpdate(playerId, msg.payload);
        break;
      }

      case MessageType.TAG_ATTEMPT: {
        const room = roomManager.getRoom(currentRoomCode);
        room?.handleTagAttempt(playerId, msg.payload);
        break;
      }

      case MessageType.LEAVE_ROOM: {
        const room = roomManager.getRoom(currentRoomCode);
        room?.removePlayer(playerId);
        roomManager.removeRoomIfEmpty(currentRoomCode);
        currentRoomCode = null;
        break;
      }

      default:
        break;
    }
  });

  socket.on('close', () => {
    if (!currentRoomCode) return;
    const room = roomManager.getRoom(currentRoomCode);
    room?.removePlayer(playerId);
    roomManager.removeRoomIfEmpty(currentRoomCode);
  });
});
