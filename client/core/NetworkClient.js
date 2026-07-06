// NetworkClient.js
// Thin wrapper around WebSocket: connect, send typed messages, dispatch
// incoming messages to registered handlers by type.

import { makeMessage, parseMessage } from './MessageSchema.js';

export class NetworkClient {
  constructor(serverUrl) {
    this.serverUrl = serverUrl;
    this.socket = null;
    this.handlers = new Map(); // type -> [callbacks]
    this.playerId = null;
    this._reconnectAttempts = 0;
    this._maxReconnectAttempts = 5;
    this._connected = false;
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.socket = new WebSocket(this.serverUrl);

      this.socket.onopen = () => {
        this._connected = true;
        this._reconnectAttempts = 0;
        resolve();
      };

      this.socket.onmessage = (event) => {
        const msg = parseMessage(event.data);
        if (!msg) return;
        const callbacks = this.handlers.get(msg.type) || [];
        for (const cb of callbacks) cb(msg.payload);
      };

      this.socket.onclose = () => {
        this._connected = false;
        this._tryReconnect();
      };

      this.socket.onerror = (err) => {
        if (!this._connected) reject(err);
      };
    });
  }

  _tryReconnect() {
    if (this._reconnectAttempts >= this._maxReconnectAttempts) return;
    this._reconnectAttempts++;
    const delay = Math.min(1000 * 2 ** this._reconnectAttempts, 10000);
    setTimeout(() => {
      this.connect().catch(() => {});
    }, delay);
  }

  on(type, callback) {
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type).push(callback);
  }

  off(type, callback) {
    const list = this.handlers.get(type);
    if (!list) return;
    this.handlers.set(type, list.filter(cb => cb !== callback));
  }

  send(type, payload) {
    if (!this._connected || this.socket.readyState !== WebSocket.OPEN) return;
    this.socket.send(makeMessage(type, payload));
  }

  isConnected() {
    return this._connected;
  }
}
