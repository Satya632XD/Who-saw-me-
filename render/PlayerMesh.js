// PlayerMesh.js
// Builds a simple original humanoid mesh (capsule body + sphere head,
// placeholder geometry) with a single unwrapped CanvasTexture that the
// paint system draws onto directly for camouflage.

import * as THREE from 'three';

const CANVAS_SIZE = 512;

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

    this.group = new THREE.Group();
    this._buildBody();

    this.crouching = false;
    this.baseScale = 1;
  }

  _buildBody() {
    // Torso
    const torsoGeo = new THREE.CapsuleGeometry(0.35, 0.9, 4, 8);
    this.torso = new THREE.Mesh(torsoGeo, this.material);
    this.torso.position.y = 1.1;
    this.torso.castShadow = true;
    this.group.add(this.torso);

    // Head
    const headGeo = new THREE.SphereGeometry(0.28, 16, 16);
    this.head = new THREE.Mesh(headGeo, this.material);
    this.head.position.y = 1.85;
    this.head.castShadow = true;
    this.group.add(this.head);

    // Arms
    const armGeo = new THREE.CapsuleGeometry(0.1, 0.6, 4, 8);
    this.leftArm = new THREE.Mesh(armGeo, this.material);
    this.leftArm.position.set(-0.5, 1.15, 0);
    this.leftArm.castShadow = true;
    this.group.add(this.leftArm);

    this.rightArm = new THREE.Mesh(armGeo, this.material);
    this.rightArm.position.set(0.5, 1.15, 0);
    this.rightArm.castShadow = true;
    this.group.add(this.rightArm);

    // Legs
    const legGeo = new THREE.CapsuleGeometry(0.13, 0.7, 4, 8);
    this.leftLeg = new THREE.Mesh(legGeo, this.material);
    this.leftLeg.position.set(-0.18, 0.4, 0);
    this.leftLeg.castShadow = true;
    this.group.add(this.leftLeg);

    this.rightLeg = new THREE.Mesh(legGeo, this.material);
    this.rightLeg.position.set(0.18, 0.4, 0);
    this.rightLeg.castShadow = true;
    this.group.add(this.rightLeg);
  }

  setCrouching(crouching) {
    if (this.crouching === crouching) return;
    this.crouching = crouching;
    const scaleY = crouching ? 0.6 : 1.0;
    this.group.scale.y = this.baseScale * scaleY;
  }

  paintAt(u, v, color, brushSize) {
    // u,v in [0,1] UV space mapped from an eyedropper/brush raycast hit.
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
}
