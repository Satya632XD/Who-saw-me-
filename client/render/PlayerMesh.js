import * as THREE from 'three';

const CANVAS_SIZE = 512;

const PROPORTIONS = {
  hipsY: 0.95,
  spineLength: 0.5,
  headRadius: 0.16,
  neckLength: 0.08,
  shoulderWidth: 0.28,       // widened so arms are clearly outside torso
  hipWidth: 0.19,
  upperArmLength: 0.32,
  lowerArmLength: 0.28,
  upperLegLength: 0.42,
  lowerLegLength: 0.4,
  limbRadius: 0.075,
  torsoRadiusTop: 0.19,
  torsoRadiusBottom: 0.16,
};

const POSES = {
  standing: {
    hipsYOffset: 0, spine: { x: 0, y: 0, z: 0 },
    leftShoulder: { x: 0, y: 0, z: 0.05 },
    rightShoulder: { x: 0, y: 0, z: -0.05 },
    leftElbow: { x: 0, y: 0, z: 0 },
    rightElbow: { x: 0, y: 0, z: 0 },
    leftHip: { x: 0, y: 0, z: 0 }, rightHip: { x: 0, y: 0, z: 0 },
    leftKnee: { x: 0, y: 0, z: 0 }, rightKnee: { x: 0, y: 0, z: 0 },
    rootRotationX: 0,
  },
  sitting: {
    hipsYOffset: -0.45,
    spine: { x: 0.05, y: 0, z: 0 },
    leftShoulder: { x: 0.1, y: 0, z: 0.1 }, rightShoulder: { x: 0.1, y: 0, z: -0.1 },
    leftElbow: { x: 0.3, y: 0, z: 0 }, rightElbow: { x: 0.3, y: 0, z: 0 },
    leftHip: { x: -1.5, y: 0, z: 0 }, rightHip: { x: -1.5, y: 0, z: 0 },
    leftKnee: { x: 1.5, y: 0, z: 0 }, rightKnee: { x: 1.5, y: 0, z: 0 },
    rootRotationX: 0,
  },
  kneeling: {
    hipsYOffset: -0.55,
    spine: { x: 0.05, y: 0, z: 0 },
    leftShoulder: { x: 0.05, y: 0, z: 0.08 }, rightShoulder: { x: 0.05, y: 0, z: -0.08 },
    leftElbow: { x: 0.1, y: 0, z: 0 }, rightElbow: { x: 0.1, y: 0, z: 0 },
    leftHip: { x: -1.9, y: 0, z: 0 }, rightHip: { x: -0.3, y: 0, z: 0 },
    leftKnee: { x: 2.4, y: 0, z: 0 }, rightKnee: { x: 2.4, y: 0, z: 0 },
    rootRotationX: 0,
  },
  laying: {
    hipsYOffset: -0.85,
    spine: { x: 0, y: 0, z: 0 },
    leftShoulder: { x: 0, y: 0, z: 0.1 }, rightShoulder: { x: 0, y: 0, z: -0.1 },
    leftElbow: { x: 0, y: 0, z: 0 }, rightElbow: { x: 0, y: 0, z: 0 },
    leftHip: { x: 0, y: 0, z: 0 }, rightHip: { x: 0, y: 0, z: 0 },
    leftKnee: { x: 0, y: 0, z: 0 }, rightKnee: { x: 0, y: 0, z: 0 },
    rootRotationX: -Math.PI / 2,
  },
  curled: {
    hipsYOffset: -0.8,
    spine: { x: 0.9, y: 0, z: 0 },
    leftShoulder: { x: 1.2, y: 0, z: 0.3 }, rightShoulder: { x: 1.2, y: 0, z: -0.3 },
    leftElbow: { x: 1.8, y: 0, z: 0 }, rightElbow: { x: 1.8, y: 0, z: 0 },
    leftHip: { x: -2.1, y: 0, z: 0 }, rightHip: { x: -2.1, y: 0, z: 0 },
    leftKnee: { x: 2.3, y: 0, z: 0 }, rightKnee: { x: 2.3, y: 0, z: 0 },
    rootRotationX: -Math.PI / 2,
  },
  crawling: {
    hipsYOffset: -0.55,
    spine: { x: 0.3, y: 0, z: 0 },
    leftShoulder: { x: -1.4, y: 0, z: 0.15 }, rightShoulder: { x: -1.4, y: 0, z: -0.15 },
    leftElbow: { x: 0.2, y: 0, z: 0 }, rightElbow: { x: 0.2, y: 0, z: 0 },
    leftHip: { x: -1.3, y: 0, z: 0 }, rightHip: { x: -1.3, y: 0, z: 0 },
    leftKnee: { x: 1.6, y: 0, z: 0 }, rightKnee: { x: 1.6, y: 0, z: 0 },
    rootRotationX: 0,
  },
};

export class PlayerMesh {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = CANVAS_SIZE;
    this.canvas.height = CANVAS_SIZE;
    this.ctx = this.canvas.getContext('2d');
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.material = new THREE.MeshStandardMaterial({
      map: this.texture,
      roughness: 0.8,
      metalness: 0.0,
    });

    this.group = new THREE.Group();
    this.rig = new THREE.Group();
    this.group.add(this.rig);
    this.crouching = false;
    this.baseScale = 1;
    this.currentPose = 'standing';
    this._walkCycleTime = 0;
    this._buildBody();
    this.setPose('standing');
  }

  _capsule(radius, length) { return new THREE.CapsuleGeometry(radius, length, 4, 8); }
  _jointCap(radius, parentGroup) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.15, 10, 10), this.material);
    cap.castShadow = true;
    parentGroup.add(cap);
    return cap;
  }

  _buildBody() {
    const p = PROPORTIONS;
    this.hips = new THREE.Group();
    this.hips.position.y = p.hipsY;
    this.rig.add(this.hips);

    const hipsMesh = new THREE.Mesh(
      new THREE.BoxGeometry(p.hipWidth * 2.1, 0.16, 0.16),
      this.material
    );
    hipsMesh.castShadow = true;
    this.hips.add(hipsMesh);

    this.spine = new THREE.Group();
    this.hips.add(this.spine);
    const torsoGeo = new THREE.CylinderGeometry(p.torsoRadiusTop, p.torsoRadiusBottom, p.spineLength, 8);
    this.torso = new THREE.Mesh(torsoGeo, this.material);
    this.torso.position.y = p.spineLength / 2;
    this.torso.castShadow = true;
    this.spine.add(this.torso);

    this._jointCap(p.torsoRadiusBottom * 0.9, this.hips).position.y = 0.02;

    this.neck = new THREE.Group();
    this.neck.position.y = p.spineLength;
    this.spine.add(this.neck);
    this._jointCap(p.torsoRadiusTop * 0.7, this.neck);

    this.head = new THREE.Mesh(new THREE.SphereGeometry(p.headRadius, 16, 16), this.material);
    this.head.position.y = p.neckLength + p.headRadius;
    this.head.castShadow = true;
    this.neck.add(this.head);

    const buildArm = (side) => {
      const sign = side === 'left' ? 1 : -1;
      const shoulder = new THREE.Group();
      shoulder.position.set(sign * p.shoulderWidth, p.spineLength - 0.05, 0);
      this.spine.add(shoulder);
      this._jointCap(p.limbRadius * 1.4, shoulder);

      const upperArm = new THREE.Mesh(this._capsule(p.limbRadius, p.upperArmLength), this.material);
      upperArm.position.y = -p.upperArmLength / 2;
      upperArm.castShadow = true;
      shoulder.add(upperArm);

      const elbow = new THREE.Group();
      elbow.position.y = -p.upperArmLength;
      shoulder.add(elbow);
      this._jointCap(p.limbRadius * 0.85, elbow);

      const lowerArm = new THREE.Mesh(this._capsule(p.limbRadius * 0.85, p.lowerArmLength), this.material);
      lowerArm.position.y = -p.lowerArmLength / 2;
      lowerArm.castShadow = true;
      elbow.add(lowerArm);

      return { shoulder, elbow };
    };

    const leftArm = buildArm('left');
    this.leftShoulder = leftArm.shoulder;
    this.leftElbow = leftArm.elbow;
    const rightArm = buildArm('right');
    this.rightShoulder = rightArm.shoulder;
    this.rightElbow = rightArm.elbow;

    const buildLeg = (side) => {
      const sign = side === 'left' ? 1 : -1;
      const hipJoint = new THREE.Group();
      hipJoint.position.set(sign * p.hipWidth, 0, 0);
      this.hips.add(hipJoint);
      this._jointCap(p.limbRadius * 1.05, hipJoint);

      const upperLeg = new THREE.Mesh(this._capsule(p.limbRadius * 1.05, p.upperLegLength), this.material);
      upperLeg.position.y = -p.upperLegLength / 2;
      upperLeg.castShadow = true;
      hipJoint.add(upperLeg);

      const knee = new THREE.Group();
      knee.position.y = -p.upperLegLength;
      hipJoint.add(knee);
      this._jointCap(p.limbRadius * 0.9, knee);

      const lowerLeg = new THREE.Mesh(this._capsule(p.limbRadius * 0.9, p.lowerLegLength), this.material);
      lowerLeg.position.y = -p.lowerLegLength / 2;
      lowerLeg.castShadow = true;
      knee.add(lowerLeg);

      return { hipJoint, knee };
    };

    const leftLeg = buildLeg('left');
    this.leftHip = leftLeg.hipJoint;
    this.leftKnee = leftLeg.knee;
    const rightLeg = buildLeg('right');
    this.rightHip = rightLeg.hipJoint;
    this.rightKnee = rightLeg.knee;
  }

  setPose(poseName) {
    const pose = POSES[poseName];
    if (!pose) return;
    this.currentPose = poseName;
    const applyRot = (joint, rot) => { if (joint && rot) joint.rotation.set(rot.x, rot.y, rot.z); };
    applyRot(this.spine, pose.spine);
    applyRot(this.leftShoulder, pose.leftShoulder);
    applyRot(this.rightShoulder, pose.rightShoulder);
    applyRot(this.leftElbow, pose.leftElbow);
    applyRot(this.rightElbow, pose.rightElbow);
    applyRot(this.leftHip, pose.leftHip);
    applyRot(this.rightHip, pose.rightHip);
    applyRot(this.leftKnee, pose.leftKnee);
    applyRot(this.rightKnee, pose.rightKnee);
    this.hips.position.y = PROPORTIONS.hipsY + pose.hipsYOffset;
    this.rig.rotation.x = pose.rootRotationX || 0;
  }

  getAvailablePoses() { return Object.keys(POSES); }

  attachGun() {
    if (this.gun) return;
    const gunGroup = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.4, metalness: 0.5 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.42), bodyMat);
    body.position.z = 0.16;
    gunGroup.add(body);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.34, 10), bodyMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = 0.42;
    gunGroup.add(barrel);
    const tipMat = new THREE.MeshStandardMaterial({ color: 0x39ff14, emissive: 0x39ff14, emissiveIntensity: 1.2, roughness: 0.3 });
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 10), tipMat);
    tip.rotation.x = Math.PI / 2;
    tip.position.z = 0.6;
    gunGroup.add(tip);
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.26, 10),
      new THREE.MeshStandardMaterial({ color: 0xff2a6d, roughness: 0.35, metalness: 0.2 }));
    tank.position.set(0, -0.17, 0.02);
    gunGroup.add(tank);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.08), bodyMat);
    grip.position.set(0, -0.1, -0.05);
    gunGroup.add(grip);
    gunGroup.position.set(0, -PROPORTIONS.lowerArmLength - 0.05, 0.05);
    gunGroup.rotation.x = -Math.PI / 2.3;
    gunGroup.scale.setScalar(1.6);
    this.rightElbow.add(gunGroup);
    this.gun = gunGroup;
    return gunGroup;
  }

  getGunMuzzleWorldPosition() {
    if (!this.gun) return null;
    const tip = new THREE.Vector3(0, 0, 0.6 * 1.6);
    this.gun.updateWorldMatrix(true, false);
    return this.gun.localToWorld(tip);
  }

  removeGun() {
    if (this.gun) {
      this.rightElbow.remove(this.gun);
      this.gun = null;
    }
  }

  updateWalkCycle(deltaSeconds, speedFraction) {
    if (this.currentPose !== 'standing') return;
    if (speedFraction > 0.02) {
      this._walkCycleTime += deltaSeconds * (4 + speedFraction * 4);
      const swing = Math.sin(this._walkCycleTime) * 0.5 * speedFraction;
      const counterSwing = Math.sin(this._walkCycleTime + Math.PI) * 0.5 * speedFraction;
      this.leftShoulder.rotation.x = swing;
      this.rightShoulder.rotation.x = counterSwing;
      this.leftHip.rotation.x = counterSwing;
      this.rightHip.rotation.x = swing;
      this.leftKnee.rotation.x = Math.max(0, -counterSwing) * 1.2;
      this.rightKnee.rotation.x = Math.max(0, -swing) * 1.2;
    } else {
      const ease = Math.min(1, deltaSeconds * 8);
      this.leftShoulder.rotation.x *= (1 - ease);
      this.rightShoulder.rotation.x *= (1 - ease);
      this.leftHip.rotation.x *= (1 - ease);
      this.rightHip.rotation.x *= (1 - ease);
      this.leftKnee.rotation.x *= (1 - ease);
      this.rightKnee.rotation.x *= (1 - ease);
    }
  }

  setCrouching(crouching) {
    this.crouching = crouching;
    // Pose is now managed externally; we just track the flag.
  }

  paintAt(u, v, color, brushSize) {
    const x = u * CANVAS_SIZE;
    const y = (1 - v) * CANVAS_SIZE;
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.arc(x, y, brushSize, 0, Math.PI * 2);
    this.ctx.fill();
    this.texture.needsUpdate = true;
  }

  fillAll(color) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    this.texture.needsUpdate = true;
  }

  setMetalness(value) { this.material.metalness = THREE.MathUtils.clamp(value, 0, 1); }
  setRoughness(value) { this.material.roughness = THREE.MathUtils.clamp(value, 0, 1); }

  getObject3D() { return this.group; }

  getPaintableMeshes() {
    const meshes = [this.torso, this.head];
    this.hips.traverse((child) => { if (child.isMesh && !meshes.includes(child)) meshes.push(child); });
    return meshes;
  }
}
