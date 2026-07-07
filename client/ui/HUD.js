// HUD.js
// Manages all DOM overlay UI: lobby form, in-game HUD (timer/role), and
// the paint toolbar shown during the prep phase.

export class HUD {
  constructor(rootEl) {
    this.root = rootEl;
    this._buildLobbyScreen();
    this._buildGameHUD();
    this._buildPaintToolbar();
    this._buildTouchControls();
  }

  _buildTouchControls() {
    this.touchControls = document.createElement('div');
    this.touchControls.id = 'touch-controls';
    this.touchControls.style.display = 'none';
    this.touchControls.innerHTML = `
      <div id="joystick-zone" style="position:absolute; left:24px; bottom:100px; width:130px; height:130px; border-radius:50%; background:rgba(255,255,255,0.15); touch-action:none;">
        <div id="joystick-stick" style="position:absolute; left:35px; top:35px; width:60px; height:60px; border-radius:50%; background:rgba(255,255,255,0.5);"></div>
      </div>
      <div id="look-zone" style="position:absolute; right:0; top:0; width:55%; height:100%; touch-action:none; pointer-events:none;"></div>
      <button id="jump-btn" style="position:absolute; right:100px; bottom:110px; width:64px; height:64px; border-radius:50%; background:rgba(255,255,255,0.3); border:2px solid rgba(255,255,255,0.5); color:white; font-weight:700;">JUMP</button>
      <button id="crouch-btn" style="position:absolute; right:24px; bottom:190px; width:56px; height:56px; border-radius:50%; background:rgba(255,255,255,0.3); border:2px solid rgba(255,255,255,0.5); color:white; font-size:11px; font-weight:700;">CROUCH</button>
      <button id="sprint-btn" style="position:absolute; right:24px; bottom:40px; width:56px; height:56px; border-radius:50%; background:rgba(255,255,255,0.3); border:2px solid rgba(255,255,255,0.5); color:white; font-size:11px; font-weight:700;">SPRINT</button>
    `;
    this.root.appendChild(this.touchControls);
  }

  showTouchControls(show) {
    this.touchControls.style.display = show ? 'block' : 'none';
  }

  // During prep phase we disable the look-drag zone so screen taps reach
  // the canvas underneath for painting; re-enable it for the hunt phase.
  setLookZoneEnabled(enabled) {
    const lookZone = this.touchControls.querySelector('#look-zone');
    lookZone.style.pointerEvents = enabled ? 'auto' : 'none';
  }

  // Wires the joystick/look/jump/crouch/sprint UI to a PlayerController-like
  // callback object: { onMove(x,y), onLookDelta(dx), onJump(), onSprint(active), onCrouch(active) }
  bindTouchControls({ onMove, onLookDelta, onJump, onSprint, onCrouch }) {
    const zone = this.touchControls.querySelector('#joystick-zone');
    const stick = this.touchControls.querySelector('#joystick-stick');
    const lookZone = this.touchControls.querySelector('#look-zone');
    const jumpBtn = this.touchControls.querySelector('#jump-btn');
    const crouchBtn = this.touchControls.querySelector('#crouch-btn');
    const sprintBtn = this.touchControls.querySelector('#sprint-btn');

    const zoneRadius = 65;
    let joystickTouchId = null;

    zone.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      joystickTouchId = t.identifier;
      e.preventDefault();
    }, { passive: false });

    zone.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== joystickTouchId) continue;
        const rect = zone.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        let dx = t.clientX - cx;
        let dy = t.clientY - cy;
        const dist = Math.min(Math.sqrt(dx * dx + dy * dy), zoneRadius);
        const angle = Math.atan2(dy, dx);
        dx = Math.cos(angle) * dist;
        dy = Math.sin(angle) * dist;
        stick.style.left = `${35 + dx}px`;
        stick.style.top = `${35 + dy}px`;
        // Normalize: x right-positive, y forward when dragging up (screen -y).
        onMove(dx / zoneRadius, -dy / zoneRadius);
      }
      e.preventDefault();
    }, { passive: false });

    const resetJoystick = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== joystickTouchId) continue;
        joystickTouchId = null;
        stick.style.left = '35px';
        stick.style.top = '35px';
        onMove(0, 0);
      }
    };
    zone.addEventListener('touchend', resetJoystick);
    zone.addEventListener('touchcancel', resetJoystick);

    // Look/camera drag zone (right side of screen).
    let lookTouchId = null;
    let lastX = 0;
    lookZone.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      lookTouchId = t.identifier;
      lastX = t.clientX;
      e.preventDefault();
    }, { passive: false });

    lookZone.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== lookTouchId) continue;
        const dx = t.clientX - lastX;
        lastX = t.clientX;
        onLookDelta(dx);
      }
      e.preventDefault();
    }, { passive: false });

    lookZone.addEventListener('touchend', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === lookTouchId) lookTouchId = null;
      }
    });

    jumpBtn.addEventListener('touchstart', (e) => { onJump(); e.preventDefault(); }, { passive: false });

    sprintBtn.addEventListener('touchstart', (e) => { onSprint(true); e.preventDefault(); }, { passive: false });
    sprintBtn.addEventListener('touchend', (e) => { onSprint(false); e.preventDefault(); }, { passive: false });

    crouchBtn.addEventListener('touchstart', (e) => { onCrouch(true); e.preventDefault(); }, { passive: false });
    crouchBtn.addEventListener('touchend', (e) => { onCrouch(false); e.preventDefault(); }, { passive: false });
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
