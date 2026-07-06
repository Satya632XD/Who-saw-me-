// main.js
// Entry point. Set window.WHOSAWME_SERVER_URL before this script loads
// (see index.html) to point at your deployed Render WebSocket server.

import { Game } from './core/Game.js';

const game = new Game();
game.start().catch((err) => {
  console.error('Failed to connect to game server:', err);
  const status = document.querySelector('#lobby-status');
  if (status) status.textContent = 'Could not connect to server. Is it running?';
});
