import * as THREE from 'three';

const WALK_SPEED = 4.0;
const SPRINT_SPEED = 7.5;
const CROUCH_SPEED = 2.0;
const JUMP_VELOCITY = 6.0;
const GRAVITY = -18.0;
const GROUND_Y = 0;

export class PlayerController {
  constructor(playerMesh, camera) {
    this.mesh = playerMesh;
    this.camera = camera;
    this.velocity = new THREE.Vector3();
    this.position = new THREE.Vector3(0, GROUND_Y, 0);
    this.cameraYaw = 0;          // horizontal orbit angle
    this.cameraPitch = 0.3;      // slight downward default
    this.PITCH_LIMIT = Math.PI / 2 - 0.05;
    this.cameraMode = 'third';
    this.keys = {
      forward: false, backward: false, left: false, right: false,
      sprint: false, crouch: false, jump: false,
    };
    this.poseLocked = false;
    this.movementLocked = false;
    this.isGrounded = true;
    this.verticalVelocity = 0;
    this.touchMoveVector = { x: 0, y: 0 };
    this.touchActive = false;
    this._bindInput();
  }

  _bindInput() {
    const keyMap = {
      KeyW: 'forward', ArrowUp: 'forward',
      KeyS: 'backward', ArrowDown: 'backward',
      KeyA: 'left', ArrowLeft: 'left',
      KeyD: 'right', ArrowRight: 'right',
      ShiftLeft: 'sprint', ShiftRight: 'sprint',
      ControlLeft: 'crouch', KeyC: 'crouch',
      Space: 'jump',
    };
    window.addEventListener('keydown', (e) => {
      const action = keyMap[e.code];
      if (action) this.keys[action] = true;
    });
    window.addEventListener('keyup', (e) => {
      const action = keyMap[e.code];
      if (action) this.keys[action] = false;
    });
  }

  setTouchMove(x, y) {
    this.touchMoveVector.x = x;
    this.touchMoveVector.y = y;
    this.touchActive = (x !== 0 || y !== 0);
  }
  setTouchJump() { this.keys.jump = true; }
  setTouchSprint(active) { this.keys.sprint = active; }
  setTouchCrouch(active) { this.keys.crouch = active; }
  setPoseLocked(locked) { this.poseLocked = locked; }
  addCameraYaw(delta) { this.cameraYaw += delta; }
  addCameraPitch(delta) {
    this.cameraPitch = Math.max(-this.PITCH_LIMIT, Math.min(this.PITCH_LIMIT, this.cameraPitch + delta));
  }
  setCameraMode(mode) { this.cameraMode = mode === 'first' ? 'first' : 'third'; }
  toggleCameraMode() {
    this.cameraMode = this.cameraMode === 'first' ? 'third' : 'first';
    return this.cameraMode;
  }
  setMovementLocked(locked) { this.movementLocked = locked; }

  update(deltaSeconds, colliders = []) {
    const speed = this.keys.crouch
      ? CROUCH_SPEED
      : this.keys.sprint ? SPRINT_SPEED : WALK_SPEED;

    // Forward and right relative to camera view
    const forward = new THREE.Vector3(Math.sin(this.cameraYaw), 0, Math.cos(this.cameraYaw));
    const right = new THREE.Vector3(Math.cos(this.cameraYaw), 0, -Math.sin(this.cameraYaw));

    const moveDir = new THREE.Vector3();
    if (!this.movementLocked) {
      if (this.keys.forward) moveDir.add(forward);
      if (this.keys.backward) moveDir.sub(forward);
      if (this.keys.right) moveDir.add(right);
      if (this.keys.left) moveDir.sub(right);
      if (this.touchActive) {
        moveDir.add(forward.clone().multiplyScalar(this.touchMoveVector.y));
        moveDir.add(right.clone().multiplyScalar(this.touchMoveVector.x));
      }
    }

    const wasMoving = moveDir.lengthSq() > 0;
    if (wasMoving) {
      moveDir.normalize().multiplyScalar(speed * deltaSeconds);
      const nextPosition = this.position.clone().add(moveDir);
      if (!this._collides(nextPosition, colliders)) {
        this.position.copy(nextPosition);
      }
    }
    this.mesh.updateWalkCycle(deltaSeconds, wasMoving ? speed / SPRINT_SPEED : 0);

    // Jump / gravity
    if (this.isGrounded && this.keys.jump && !this.movementLocked) {
      this.verticalVelocity = JUMP_VELOCITY;
      this.isGrounded = false;
    }
    this.keys.jump = false;
    this.verticalVelocity += GRAVITY * deltaSeconds;
    this.position.y += this.verticalVelocity * deltaSeconds;

    if (this.position.y <= GROUND_Y) {
      this.position.y = GROUND_Y;
      this.verticalVelocity = 0;
      this.isGrounded = true;
    }

    if (!this.poseLocked) {
      this.mesh.setCrouching(this.keys.crouch);
    }
    // Face the movement direction or camera direction
    this.mesh.getObject3D().rotation.y = wasMoving ? Math.atan2(moveDir.x, moveDir.z) : this.cameraYaw;
    this.mesh.getObject3D().position.copy(this.position);
  }

  _collides(nextPosition, colliders) {
    const radius = 0.4;
    for (const box of colliders) {
      const bbox = new THREE.Box3().setFromObject(box);
      bbox.expandByScalar(radius);
      if (bbox.containsPoint(nextPosition)) return true;
    }
    return false;
  }

  getState() {
    return {
      position: { x: this.position.x, y: this.position.y, z: this.position.z },
      rotation: this.mesh.getObject3D().rotation.y,
      crouching: this.keys.crouch,
    };
  }
}
