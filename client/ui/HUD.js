// HUD.js
// Manages all DOM overlay UI: lobby form, in-game HUD (timer/role), and
// the paint toolbar shown during the prep phase.

export class HUD {
  constructor(rootEl) {
    this.root = rootEl;
    this._buildLobbyScreen();
    this._buildGameHUD();
    this._buildPaintToolbar();
  }

  _buildLobbyScreen() {
    this.lobbyScreen = document.createElement('div');
    this.lobbyScreen.id = 'lobby-screen';
    this.lobbyScreen.innerHTML = `
      <div class="lobby-panel">
        <h1>Who Saw Me?</h1>
        <input id="name-input" type="text" placeholder="Your name" maxlength="16" />
        <button id="create-room-btn">Create Room</button>
        <div class="join-row">
          <input id="room-code-input" type="text" placeholder="Room code" maxlength="5" />
          <button id="join-room-btn">Join</button>
        </div>
        <div id="lobby-status"></div>
        <div id="player-list"></div>
        <button id="ready-btn" style="display:none;">Ready</button>
      </div>
    `;
    this.root.appendChild(this.lobbyScreen);
  }

  _buildGameHUD() {
    this.gameHUD = document.createElement('div');
    this.gameHUD.id = 'game-hud';
    this.gameHUD.style.display = 'none';
    this.gameHUD.innerHTML = `
      <div id="phase-banner"></div>
      <div id="timer-display">--:--</div>
      <div id="role-indicator"></div>
    `;
    this.root.appendChild(this.gameHUD);
  }

  _buildPaintToolbar() {
    this.paintToolbar = document.createElement('div');
    this.paintToolbar.id = 'paint-toolbar';
    this.paintToolbar.style.display = 'none';
    this.paintToolbar.innerHTML = `
      <button data-tool="brush" class="tool-btn active">Brush</button>
      <button data-tool="fill" class="tool-btn">Fill</button>
      <button data-tool="eyedropper" class="tool-btn">Eyedropper</button>
      <input id="color-picker" type="color" value="#ffffff" />
      <input id="brush-size" type="range" min="4" max="60" value="18" />
      <label>Metalness <input id="metalness-slider" type="range" min="0" max="1" step="0.01" value="0" /></label>
      <label>Roughness <input id="roughness-slider" type="range" min="0" max="1" step="0.01" value="0.8" /></label>
    `;
    this.root.appendChild(this.paintToolbar);
  }

  showLobby() {
    this.lobbyScreen.style.display = 'flex';
    this.gameHUD.style.display = 'none';
    this.paintToolbar.style.display = 'none';
  }

  showGameHUD() {
    this.lobbyScreen.style.display = 'none';
    this.gameHUD.style.display = 'block';
  }

  setPlayerList(players) {
    const list = this.lobbyScreen.querySelector('#player-list');
    list.innerHTML = players
      .map(p => `<div class="player-row">${p.name} ${p.ready ? '✓' : ''}</div>`)
      .join('');
  }

  setLobbyStatus(text) {
    this.lobbyScreen.querySelector('#lobby-status').textContent = text;
  }

  showReadyButton() {
    this.lobbyScreen.querySelector('#ready-btn').style.display = 'inline-block';
  }

  setPhaseBanner(text) {
    this.gameHUD.querySelector('#phase-banner').textContent = text;
  }

  setTimer(remainingMs) {
    const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    this.gameHUD.querySelector('#timer-display').textContent =
      `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  setRole(role) {
    const el = this.gameHUD.querySelector('#role-indicator');
    el.textContent = role ? role.toUpperCase() : '';
    el.className = role === 'seeker' ? 'role-seeker' : 'role-hider';
  }

  showPaintToolbar(show) {
    this.paintToolbar.style.display = show ? 'flex' : 'none';
  }

  getActiveTool() {
    const active = this.paintToolbar.querySelector('.tool-btn.active');
    return active ? active.dataset.tool : 'brush';
  }

  onToolChange(callback) {
    this.paintToolbar.querySelectorAll('.tool-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.paintToolbar.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        callback(btn.dataset.tool);
      });
    });
  }

  onColorChange(callback) {
    this.paintToolbar.querySelector('#color-picker').addEventListener('input', (e) => {
      callback(e.target.value);
    });
  }

  onBrushSizeChange(callback) {
    this.paintToolbar.querySelector('#brush-size').addEventListener('input', (e) => {
      callback(parseInt(e.target.value, 10));
    });
  }

  setColorPicker(hex) {
    this.paintToolbar.querySelector('#color-picker').value = hex;
  }

  getMetalnessSlider() {
    return this.paintToolbar.querySelector('#metalness-slider');
  }

  getRoughnessSlider() {
    return this.paintToolbar.querySelector('#roughness-slider');
  }

  bindLobbyActions({ onCreateRoom, onJoinRoom, onReady }) {
    this.lobbyScreen.querySelector('#create-room-btn').addEventListener('click', () => {
      const name = this.lobbyScreen.querySelector('#name-input').value.trim();
      onCreateRoom(name);
    });
    this.lobbyScreen.querySelector('#join-room-btn').addEventListener('click', () => {
      const name = this.lobbyScreen.querySelector('#name-input').value.trim();
      const code = this.lobbyScreen.querySelector('#room-code-input').value.trim();
      onJoinRoom(name, code);
    });
    this.lobbyScreen.querySelector('#ready-btn').addEventListener('click', () => {
      onReady();
    });
  }
}
