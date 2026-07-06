// SceneManager.js
// Owns the Three.js scene, camera, renderer, and a simple placeholder map.

import * as THREE from 'three';

export class SceneManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);

    this.camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, 5, 10);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;

    this._addLighting();
    this._addPlaceholderMap();

    window.addEventListener('resize', () => this._onResize());
  }

  _addLighting() {
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffffff, 1.0);
    sun.position.set(20, 30, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -30;
    sun.shadow.camera.right = 30;
    sun.shadow.camera.top = 30;
    sun.shadow.camera.bottom = -30;
    this.scene.add(sun);
  }

  _addPlaceholderMap() {
    // Minimal original placeholder map: a ground plane plus a scatter of
    // boxes to hide against/near. Replace with real map loading later.
    const groundGeo = new THREE.PlaneGeometry(100, 100);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x4a7c3a });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.ground = ground;

    this.props = [];
    const propColors = [0xaa5533, 0x888888, 0x3355aa, 0xdddddd, 0x996633];
    for (let i = 0; i < 14; i++) {
      const size = 1 + Math.random() * 2;
      const geo = new THREE.BoxGeometry(size, size, size);
      const mat = new THREE.MeshStandardMaterial({
        color: propColors[i % propColors.length],
        roughness: 0.6 + Math.random() * 0.3,
        metalness: Math.random() * 0.3,
      });
      const box = new THREE.Mesh(geo, mat);
      box.position.set(
        (Math.random() - 0.5) * 60,
        size / 2,
        (Math.random() - 0.5) * 60
      );
      box.castShadow = true;
      box.receiveShadow = true;
      this.scene.add(box);
      this.props.push(box);
    }
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
