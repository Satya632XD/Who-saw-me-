// PlayerMesh.js
// Builds an original jointed humanoid (hips -> spine/torso -> head,
// shoulder -> upper/lower arm, hip -> upper/lower leg), all driven by
// a single shared CanvasTexture that the paint system draws onto for
// camouflage. Joints are plain THREE.Group hierarchies (not a real
// bone skeleton) so pose presets are just target-rotation snapshots
// per joint — enough for lockable hiding poses without needing a
// rigged/animated skeleton system.

import * as THREE from 'three';

const CANVAS_SIZE = 512;

// Proportions tuned to read as "human-like" without going photoreal:
// slightly larger head-to-body ratio than realistic (reads better at
// a distance / on small phone screens), clear shoulder width, distinct
// hips, two-segment limbs with visible joints.
const PROPORTIONS = {
  hipsY: 0.95,
  spineLength: 0.5,
  headRadius: 0.16,
  neckLength: 0.08,
  shoulderWidth: 0.34,
  hipWidth: 0.19,
  upperArmLength: 0.32,
  lowerArmLength: 0.28,
  upperLegLength: 0.42,
  lowerLegLength: 0.4,
  limbRadius: 0.075,
  torsoRadiusTop: 0.19,
  torsoRadiusBottom: 0.16,
};

// Pose presets: rotation targets (radians) for each joint, keyed by
// pose name. Only joints listed are touched; unlisted joints hold
// their current rotation. All poses also set a hipsY offset used to
// sink/raise the whole rig (e.g. kneeling, laying down).
const POSES = {
  standing: {
    hipsYOffset: 0,
    spine: { x: 0, y: 0, z: 0 },
    leftShoulder: { x: 0, y: 0, z: 0.05 },
    rightShoulder: { x: 0, y: 0, z: -0.05 },
    leftElbow: { x: 0, y: 0, z: 0 },
    rightElbow: { x: 0, y: 0, z: 0 },
    leftHip: { x: 0, y: 0, z: 0 },
    rightHip: { x: 0, y: 0, z: 0 },
    leftKnee: { x: 0, y: 0, z: 0 },
    rightKnee: { x: 0, y: 0, z: 0 },
    rootRotationX: 0,
  },
  sitting: {
    hipsYOffset: -0.45,
    spine: { x: 0.05, y: 0, z: 0 },
    leftShoulder: { x: 0.1, y: 0, z: 0.1 },
    rightShoulder: { x: 0.1, y: 0, z: -0.1 },
    leftElbow: { x: 0.3, y: 0, z: 0 },
    rightElbow: { x: 0.3, y: 0, z: 0 },
    leftHip: { x: -1.5, y: 0, z: 0 },
    rightHip: { x: -1.5, y: 0, z: 0 },
    leftKnee: { x: 1.5, y: 0, z: 0 },
    rightKnee: { x: 1.5, y: 0, z: 0 },
    rootRotationX: 0,
  },
  kneeling: {
    hipsYOffset: -0.55,
    spine: { x: 0.05, y: 0, z: 0 },
    leftShoulder: { x: 0.05, y: 0, z: 0.08 },
    rightShoulder: { x: 0.05, y: 0, z: -0.08 },
    leftElbow: { x: 0.1, y: 0, z: 0 },
    rightElbow: { x: 0.1, y: 0, z: 0 },
    leftHip: { x: -1.9, y: 0, z: 0 },
    rightHip: { x: -0.3, y: 0, z: 0 },
    leftKnee: { x: 2.4, y: 0, z: 0 },
    rightKnee: { x: 2.4, y: 0, z: 0 },
    rootRotationX: 0,
  },
  laying: {
    hipsYOffset: -0.85,
    spine: { x: 0, y: 0, z: 0 },
    leftShoulder: { x: 0, y: 0, z: 0.1 },
    rightShoulder: { x: 0, y: 0, z: -0.1 },
    leftElbow: { x: 0, y: 0, z: 0 },
    rightElbow: { x: 0, y: 0, z: 0 },
    leftHip: { x: 0, y: 0, z: 0 },
    rightHip: { x: 0, y: 0, z: 0 },
    leftKnee: { x: 0, y: 0, z: 0 },
    rightKnee: { x: 0, y: 0, z: 0 },
    rootRotationX: -Math.PI / 2,
  },
  curled: {
    hipsYOffset: -0.8,
    spine: { x: 0.9, y: 0, z: 0 },
    leftShoulder: { x: 1.2, y: 0, z: 0.3 },
    rightShoulder: { x: 1.2, y: 0, z: -0.3 },
    leftElbow: { x: 1.8, y: 0, z: 0 },
    rightElbow: { x: 1.8, y: 0, z: 0 },
    leftHip: { x: -2.1, y: 0, z: 0 },
    rightHip: { x: -2.1, y: 0, z: 0 },
    leftKnee: { x: 2.3, y: 0, z: 0 },
    rightKnee: { x: 2.3, y: 0, z: 0 },
    rootRotationX: -Math.PI / 2,
  },
  crawling: {
    hipsYOffset: -0.55,
    spine: { x: 0.3, y: 0, z: 0 },
    leftShoulder: { x: -1.4, y: 0, z: 0.15 },
    rightShoulder: { x: -1.4, y: 0, z: -0.15 },
    leftElbow: { x: 0.2, y: 0, z: 0 },
    rightElbow: { x: 0.2, y: 0, z: 0 },
    leftHip: { x: -1.3, y: 0, z: 0 },
    rightHip: { x: -1.3, y: 0, z: 0 },
    leftKnee: { x: 1.6, y: 0, z: 0 },
    rightKnee: { x: 1.6, y: 0, z: 0 },
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
    this.texture.needsUpdate = true;

    this.material = new THREE.MeshStandardMaterial({
      map: this.texture,
      roughness: 0.8,
      metalness: 0.0,
    });

    // Root group: this is what PlayerController moves/rotates for
    // yaw and world position. Poses that reorient the whole body
    // (e.g. laying down) rotate `this.rig` inside root instead, so
    // world position/yaw stays independent of pose.
    this.group = new THREE.Group();
    this.rig = new THREE.Group();
    this.group.add(this.rig);

    this.crouching = false;
    this.baseScale = 1;
    this.currentPose = 'standing';

    this._buildBody();
    this.setPose('standing');
  }

  _capsule(radius, length) {
    return new THREE.CapsuleGeometry(radius, length, 4, 8);
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
    const torsoGeo = new THREE.CylinderGeometry(
      p.torsoRadiusTop, p.torsoRadiusBottom, p.spineLength, 8
    );
    this.torso = new THREE.Mesh(torsoGeo, this.material);
    this.torso.position.y = p.spineLength / 2;
    this.torso.castShadow = true;
    this.spine.add(this.torso);

    this.neck = new THREE.Group();
    this.neck.position.y = p.spineLength;
    this.spine.add(this.neck);

    this.head = new THREE.Mesh(new THREE.SphereGeometry(p.headRadius, 16, 16), this.material);
    this.head.position.y = p.neckLength + p.headRadius;
    this.head.castShadow = true;
    this.neck.add(this.head);

    const buildArm = (side) => {
      const sign = side === 'left' ? 1 : -1;
      const shoulder = new THREE.Group();
      shoulder.position.set(sign * p.shoulderWidth, p.spineLength - 0.05, 0);
      this.spine.add(shoulder);

      const upperArm = new THREE.Mesh(
        this._capsule(p.limbRadius, p.upperArmLength), this.material
      );
      upperArm.position.y = -p.upperArmLength / 2;
      upperArm.castShadow = true;
      shoulder.add(upperArm);

      const elbow = new THREE.Group();
      elbow.position.y = -p.upperArmLength;
      shoulder.add(elbow);

      const lowerArm = new THREE.Mesh(
        this._capsule(p.limbRadius * 0.85, p.lowerArmLength), this.material
      );
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

      const upperLeg = new THREE.Mesh(
        this._capsule(p.limbRadius * 1.05, p.upperLegLength), this.material
      );
      upperLeg.position.y = -p.upperLegLength / 2;
      upperLeg.castShadow = true;
      hipJoint.add(upperLeg);

      const knee = new THREE.Group();
      knee.position.y = -p.upperLegLength;
      hipJoint.add(knee);

      const lowerLeg = new THREE.Mesh(
        this._capsule(p.limbRadius * 0.9, p.lowerLegLength), this.material
      );
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

    const applyRot = (joint, rot) => {
      if (!joint || !rot) return;
      joint.rotation.set(rot.x, rot.y, rot.z);
    };

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

  getAvailablePoses() {
    return Object.keys(POSES);
  }

  setCrouching(crouching) {
    if (this.crouching === crouching) return;
    this.crouching = crouching;
    if (crouching && this.currentPose === 'standing') {
      this.setPose('kneeling');
    } else if (!crouching && this.currentPose === 'kneeling') {
      this.setPose('standing');
    }
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

  setMetalness(value) {
    this.material.metalness = THREE.MathUtils.clamp(value, 0, 1);
  }

  setRoughness(value) {
    this.material.roughness = THREE.MathUtils.clamp(value, 0, 1);
  }

  getObject3D() {
    return this.group;
  }

  // Returns all paintable meshes for raycasting (brush/eyedropper hit-testing),
  // replacing the old hardcoded [torso, head] pair now that there are more parts.
  getPaintableMeshes() {
    const meshes = [this.torso, this.head];
    this.hips.traverse((child) => {
      if (child.isMesh && !meshes.includes(child)) meshes.push(child);
    });
    return meshes;
  }
}
