// PlayerController.js
// Translates keyboard input into character movement. v1 supports walk,
// sprint, jump, and crouch. Wall-clinging/climbing are deferred to v2.

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
    this.yaw = 0;
    // Pitch is vertical look angle in radians, clamped so the camera can't
    // flip past straight up/down. 0 = looking level.
    this.pitch = 0;
    this.PITCH_LIMIT = Math.PI / 2 - 0.05;

    // 'third' = follow-cam behind the character. 'first' = camera at the
    // character's head, character mesh hidden from its own view.
    this.cameraMode = 'third';

    this.keys = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      sprint: false,
      crouch: false,
      jump: false,
    };
    this.poseLocked = false;

    // When true, all movement/jump input is ignored — used to freeze
    // seekers during the Prep phase while hiders are still free to move.
    this.movementLocked = false;

    this.isGrounded = true;
    this.verticalVelocity = 0;

    // Touch joystick state: moveVector is a normalized -1..1 x/y from the
    // on-screen stick, used instead of the boolean WASD keys when active.
    this.touchMoveVector = { x: 0, y: 0 };
    this.touchActive = false;

    this._bindInput();
  }

  _bindInput() {
    const keyMap = {
      KeyW: 'forward',
      ArrowUp: 'forward',
      KeyS: 'backward',
      ArrowDown: 'backward',
      KeyA: 'left',
      ArrowLeft: 'left',
      KeyD: 'right',
      ArrowRight: 'right',
      ShiftLeft: 'sprint',
      ShiftRight: 'sprint',
      ControlLeft: 'crouch',
      KeyC: 'crouch',
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

  // Called by the on-screen joystick UI with a normalized vector
  // (x: -1 left..1 right, y: -1 back..1 forward).
  setTouchMove(x, y) {
    this.touchMoveVector.x = x;
    this.touchMoveVector.y = y;
    this.touchActive = (x !== 0 || y !== 0);
  }

  setTouchJump() {
    this.keys.jump = true;
  }

  setTouchSprint(active) {
    this.keys.sprint = active;
  }

  setTouchCrouch(active) {
    this.keys.crouch = active;
  }

  // While locked into a non-standing pose (sitting, laying, curled, etc.)
  // during prep, we still allow slow repositioning but suppress the
  // crouch auto-pose-swap so the chosen pose doesn't get overridden.
  setPoseLocked(locked) {
    this.poseLocked = locked;
  }

  setYaw(yaw) {
    this.yaw = yaw;
  }

  // Adjusts pitch by a delta (radians) and clamps it. Positive delta looks
  // up, negative looks down — matches natural drag-up-to-look-up feel.
  addPitch(delta) {
    this.pitch = Math.max(-this.PITCH_LIMIT, Math.min(this.PITCH_LIMIT, this.pitch + delta));
  }

  setCameraMode(mode) {
    this.cameraMode = mode === 'first' ? 'first' : 'third';
  }

  toggleCameraMode() {
    this.cameraMode = this.cameraMode === 'first' ? 'third' : 'first';
    return this.cameraMode;
  }

  // Freezes/unfreezes all movement and jump input. Used to keep seekers
  // locked in place during Prep while hiders move freely.
  setMovementLocked(locked) {
    this.movementLocked = locked;
  }

  update(deltaSeconds, colliders = []) {
    const speed = this.keys.crouch
      ? CROUCH_SPEED
      : this.keys.sprint
        ? SPRINT_SPEED
        : WALK_SPEED;

    const forward = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const right = new THREE.Vector3(-Math.cos(this.yaw), 0, Math.sin(this.yaw));

    const moveDir = new THREE.Vector3();
    if (!this.movementLocked) {
      if (this.keys.forward) moveDir.add(forward);
      if (this.keys.backward) moveDir.sub(forward);
      if (this.keys.right) moveDir.add(right);
      if (this.keys.left) moveDir.sub(right);

      // Touch joystick: y is forward/back push, x is left/right push.
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
    this.mesh.getObject3D().position.copy(this.position);
    this.mesh.getObject3D().rotation.y = this.yaw;
  }

  _collides(nextPosition, colliders) {
    // Minimal AABB-vs-point collision check against box colliders.
    // Sufficient for v1 prop avoidance; replace with proper capsule
    // collision if movement feels too permissive.
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
      rotation: this.yaw,
      crouching: this.keys.crouch,
    };
  }
}
