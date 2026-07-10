
// HUD.js
// Manages all DOM overlay UI: lobby screen, in-game HUD, and paint controls.

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
      <button id="camera-toggle-btn" style="position:absolute; left:24px; top:24px; padding:8px 14px; border-radius:20px; background:rgba(255,255,255,0.3); border:2px solid rgba(255,255,255,0.5); color:white; font-size:12px; font-weight:700; pointer-events:auto;">1ST/3RD</button>
      <button id="shoot-btn" style="display:none; position:absolute; right:100px; bottom:190px; width:64px; height:64px; border-radius:50%; background:rgba(220,60,60,0.55); border:2px solid rgba(255,255,255,0.6); color:white; font-size:11px; font-weight:700; pointer-events:auto;">SHOOT</button>
      <div id="crosshair" style="display:none; position:absolute; left:50%; top:50%; width:18px; height:18px; margin:-9px 0 0 -9px; border:2px solid rgba(255,255,255,0.8); border-radius:50%; pointer-events:none;"></div>
    `;
    this.root.appendChild(this.touchControls);
  }

  showTouchControls(show) {
    this.touchControls.style.display = show ? 'block' : 'none';
  }

  setLookZoneEnabled(enabled) {
    const lookZone = this.touchControls.querySelector('#look-zone');
    lookZone.style.pointerEvents = enabled ? 'auto' : 'none';
  }

  bindTouchControls({ onMove, onLookDelta, onJump, onSprint, onCrouch, onCameraToggle, onShoot }) {
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

    let lookTouchId = null;
    let lastX = 0;
    let lastY = 0;
    lookZone.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      lookTouchId = t.identifier;
      lastX = t.clientX;
      lastY = t.clientY;
      e.preventDefault();
    }, { passive: false });

    lookZone.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== lookTouchId) continue;
        const dx = t.clientX - lastX;
        const dy = t.clientY - lastY;
        lastX = t.clientX;
        lastY = t.clientY;
        onLookDelta(dx, dy);
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

    const cameraToggleBtn = this.touchControls.querySelector('#camera-toggle-btn');
    cameraToggleBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (onCameraToggle) onCameraToggle();
    }, { passive: false });

    const shootBtn = this.touchControls.querySelector('#shoot-btn');
    shootBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (onShoot) onShoot();
    }, { passive: false });
  }

  setWeaponUIVisible(visible) {
    this.touchControls.querySelector('#shoot-btn').style.display = visible ? 'block' : 'none';
    this.touchControls.querySelector('#crosshair').style.display = visible ? 'block' : 'none';
  }

  flashCrosshair(hit) {
    const crosshair = this.touchControls.querySelector('#crosshair');
    const color = hit ? 'rgba(80,220,80,0.9)' : 'rgba(220,80,80,0.9)';
    crosshair.style.borderColor = color;
    clearTimeout(this._crosshairResetTimeout);
    this._crosshairResetTimeout = setTimeout(() => {
      crosshair.style.borderColor = 'rgba(255,255,255,0.8)';
    }, 200);
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
      <button id="paint-toggle-btn" style="display:none; margin:0 auto 8px; padding:8px 12px; border-radius:999px; border:none; background:rgba(30,40,55,0.88); color:white; font-size:12px; font-weight:800;">Paint: OFF</button>
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
    this.paintToolbar.style.flexDirection = 'column';
    this.paintToolbar.style.gap = '8px';
    this.paintToolbar.innerHTML = `
      <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
        <button data-tool="brush" class="tool-btn active">Brush</button>
        <button data-tool="fill" class="tool-btn">Fill</button>
        <button data-tool="eyedropper" class="tool-btn">Eyedropper</button>
        <input id="color-picker" type="color" value="#ffffff" />
        <input id="brush-size" type="range" min="4" max="60" value="18" />
      </div>
      <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
        <label>Metalness <input id="metalness-slider" type="range" min="0" max="1" step="0.01" value="0" /></label>
        <label>Roughness <input id="roughness-slider" type="range" min="0" max="1" step="0.01" value="0.8" /></label>
      </div>
      <div id="pose-row" style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
        <span style="font-size:12px; color:#aaa;">Pose:</span>
        <button data-pose="standing" class="tool-btn pose-btn active">Stand</button>
        <button data-pose="sitting" class="tool-btn pose-btn">Sit</button>
        <button data-pose="kneeling" class="tool-btn pose-btn">Kneel</button>
        <button data-pose="laying" class="tool-btn pose-btn">Lay</button>
        <button data-pose="curled" class="tool-btn pose-btn">Curl</button>
        <button data-pose="crawling" class="tool-btn pose-btn">Crawl</button>
      </div>
    `;
    this.root.appendChild(this.paintToolbar);
  }

  bindPaintToggle(callback) {
    this.gameHUD.querySelector('#paint-toggle-btn').addEventListener('click', () => callback());
  }

  setPaintToggleState(active) {
    const btn = this.gameHUD.querySelector('#paint-toggle-btn');
    btn.textContent = active ? 'Paint: ON' : 'Paint: OFF';
    btn.classList.toggle('active', active);
  }

  showPaintToggle(show) {
    this.gameHUD.querySelector('#paint-toggle-btn').style.display = show ? 'inline-block' : 'none';
  }

  onPoseChange(callback) {
    this.paintToolbar.querySelectorAll('.pose-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.paintToolbar.querySelectorAll('.pose-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        callback(btn.dataset.pose);
      });
    });
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
    list.innerHTML = players.map(p => `<div class="player-row">${p.name} ${p.ready ? '✓' : ''}</div>`).join('');
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
    this.gameHUD.querySelector('#timer-display').textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
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
    const active = this.paintToolbar.querySelector('[data-tool].active');
    return active ? active.dataset.tool : 'brush';
  }

  onToolChange(callback) {
    this.paintToolbar.querySelectorAll('[data-tool]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.paintToolbar.querySelectorAll('[data-tool]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        callback(btn.dataset.tool);
      });
    });
  }

  onColorChange(callback) {
    this.paintToolbar.querySelector('#color-picker').addEventListener('input', (e) => callback(e.target.value));
  }

  onBrushSizeChange(callback) {
    this.paintToolbar.querySelector('#brush-size').addEventListener('input', (e) => callback(parseInt(e.target.value, 10)));
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
    this.lobbyScreen.querySelector('#ready-btn').addEventListener('click', () => onReady());
  }
}
