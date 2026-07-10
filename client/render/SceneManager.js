// client/render/SceneManager.js
import * as THREE from 'three';

export class SceneManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e); // dark indoor feel

    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(0, 5, 10);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;

    this._addLighting();
    this._addMap();           // custom multi‑room map
    window.addEventListener('resize', () => this._onResize());
  }

  _addLighting() {
    const ambient = new THREE.AmbientLight(0x404066, 0.7);
    this.scene.add(ambient);

    const overhead = new THREE.DirectionalLight(0xffeedd, 0.9);
    overhead.position.set(5, 8, 5);
    overhead.castShadow = true;
    overhead.shadow.mapSize.set(1024, 1024);
    this.scene.add(overhead);
  }

  _addMap() {
    this.props = []; // everything that blocks movement and can be sampled

    // ---- walls, floor, ceiling ----
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x8b7355, roughness: 0.7 });
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x4a3c31, roughness: 0.9 });
    const ceilMat = new THREE.MeshStandardMaterial({ color: 0x2c2c3a, roughness: 0.6 });

    // floor
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // ceiling
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), ceilMat);
    ceil.position.y = 3;
    ceil.rotation.x = Math.PI / 2;
    ceil.receiveShadow = true;
    this.scene.add(ceil);

    // outer walls (thin boxes)
    const addWall = (x, z, w, d, h = 3) => {
      const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
      box.position.set(x, h / 2, z);
      box.castShadow = true;
      box.receiveShadow = true;
      this.scene.add(box);
      this.props.push(box);
      return box;
    };

    // map outline: 28x28 rooms area, walls around edges
    addWall(0, -15, 30, 0.2); // north wall
    addWall(0, 15, 30, 0.2);  // south wall
    addWall(-15, 0, 0.2, 30); // west wall
    addWall(15, 0, 0.2, 30);  // east wall

    // interior walls dividing into rooms (3x3 grid)
    const addInteriorWall = (x, z, w, d) => addWall(x, z, w, d, 2.6);
    // vertical walls
    addInteriorWall(-5, -15, 0.2, 6);   // left column
    addInteriorWall(-5, -3, 0.2, 6);
    addInteriorWall(-5, 9, 0.2, 6);
    addInteriorWall(5, -15, 0.2, 6);
    addInteriorWall(5, -3, 0.2, 6);
    addInteriorWall(5, 9, 0.2, 6);
    // horizontal walls
    addInteriorWall(-15, -5, 6, 0.2);
    addInteriorWall(-3, -5, 6, 0.2);
    addInteriorWall(9, -5, 6, 0.2);
    addInteriorWall(-15, 5, 6, 0.2);
    addInteriorWall(-3, 5, 6, 0.2);
    addInteriorWall(9, 5, 6, 0.2);

    // open doorways by placing thinner “gap” walls (invisible no‑collide)
    // We simply leave gaps in the interior walls – they are 6m wide, so rooms connect through the centre.

    // ---- props in each room ----
    const createProp = (geo, mat, pos, rotY = 0) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(pos);
      mesh.rotation.y = rotY;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.props.push(mesh);
      return mesh;
    };

    const roomCenter = (col, row) => new THREE.Vector3(-10 + col * 10, 0, -10 + row * 10);

    // Room (0,0): Dinosaur fossil (simplified)
    const fossilGroup = new THREE.Group();
    fossilGroup.position.copy(roomCenter(0, 0));
    const boneMat = new THREE.MeshStandardMaterial({ color: 0xc4b69d, roughness: 0.4 });
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.15, 1.2, 6), boneMat);
    neck.position.set(0, 0.8, 0.2);
    fossilGroup.add(neck);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, 0.8), boneMat);
    body.position.set(0, 0.4, 0);
    fossilGroup.add(body);
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.02, 0.9, 6), boneMat);
    tail.position.set(0, 0.3, -0.6);
    fossilGroup.add(tail);
    this.scene.add(fossilGroup);
    // add individual colliders
    fossilGroup.children.forEach(c => {
      c.castShadow = true; c.receiveShadow = true;
      this.props.push(c);
    });

    // Room (0,1): Toys – teddy bear (spheres + cylinders) and coloured blocks
    const toyPos = roomCenter(0, 1);
    const bearMat = new THREE.MeshStandardMaterial({ color: 0xd4956b, roughness: 0.5 });
    const bearHead = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 8), bearMat);
    bearHead.position.copy(toyPos.clone().add(new THREE.Vector3(-0.5, 0.65, 0.3)));
    this.scene.add(bearHead); this.props.push(bearHead);
    const bearBody = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.4, 0.25), bearMat);
    bearBody.position.copy(toyPos.clone().add(new THREE.Vector3(-0.5, 0.25, 0.3)));
    this.scene.add(bearBody); this.props.push(bearBody);
    const blockColors = [0xff4444, 0x44ff44, 0x4444ff, 0xffff44];
    blockColors.forEach((col, i) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3),
        new THREE.MeshStandardMaterial({ color: col, roughness: 0.3 }));
      b.position.copy(toyPos.clone().add(new THREE.Vector3(0.7, 0.15, -0.5 + i * 0.4)));
      this.scene.add(b); this.props.push(b);
    });

    // Room (0,2): Balloons
    const balloonPos = roomCenter(0, 2);
    const balloonColors = [0xff69b4, 0x00ced1, 0xffd700, 0x7cfc00];
    balloonColors.forEach((col, i) => {
      const string = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.7, 6),
        new THREE.MeshStandardMaterial({ color: 0xdddddd }));
      string.position.copy(balloonPos.clone().add(new THREE.Vector3(-0.8 + i * 0.5, 0.65, 0.2)));
      this.scene.add(string); this.props.push(string);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 10),
        new THREE.MeshStandardMaterial({ color: col, roughness: 0.2 }));
      ball.position.copy(string.position.clone().add(new THREE.Vector3(0, 0.55, 0)));
      this.scene.add(ball); this.props.push(ball);
    });

    // Room (1,0): Table and beds
    const roomPos = roomCenter(1, 0);
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.6 });
    // table
    const tableTop = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.8), woodMat);
    tableTop.position.copy(roomPos.clone().add(new THREE.Vector3(-0.8, 0.65, -0.4)));
    this.scene.add(tableTop); this.props.push(tableTop);
    for (let dx = -0.5; dx <= 0.5; dx += 1) {
      for (let dz = -0.3; dz <= 0.3; dz += 0.6) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.6, 6), woodMat);
        leg.position.copy(tableTop.position.clone().add(new THREE.Vector3(dx, -0.34, dz)));
        this.scene.add(leg); this.props.push(leg);
      }
    }
    // bed
    const bedFrame = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.15, 1.9), woodMat);
    bedFrame.position.copy(roomPos.clone().add(new THREE.Vector3(1.0, 0.15, 0.3)));
    this.scene.add(bedFrame); this.props.push(bedFrame);
    const mattress = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.1, 1.8),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }));
    mattress.position.copy(bedFrame.position.clone().add(new THREE.Vector3(0, 0.13, 0)));
    this.scene.add(mattress); this.props.push(mattress);
    const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.08, 0.5),
      new THREE.MeshStandardMaterial({ color: 0xeeeeff, roughness: 0.8 }));
    pillow.position.copy(bedFrame.position.clone().add(new THREE.Vector3(0, 0.2, 0.7)));
    this.scene.add(pillow); this.props.push(pillow);

    // Room (1,2): Paintings on the walls
    const paintRoom = roomCenter(1, 2);
    const paintingCols = [0xffaaaa, 0xaaffaa, 0xaaaaff];
    paintingCols.forEach((col, i) => {
      const frame = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.8),
        new THREE.MeshStandardMaterial({ color: col, side: THREE.DoubleSide }));
      frame.position.copy(paintRoom.clone().add(new THREE.Vector3(-0.6 + i * 0.6, 1.4, 0)));
      frame.rotation.y = Math.PI / 2; // face outward
      this.scene.add(frame); this.props.push(frame);
    });

    // other rooms fill with simple crates / barrels
    const addRandomCrates = (center, count) => {
      for (let i = 0; i < count; i++) {
        const size = 0.3 + Math.random() * 0.3;
        const box = new THREE.Mesh(new THREE.BoxGeometry(size, size, size),
          new THREE.MeshStandardMaterial({ color: Math.random() * 0xffffff, roughness: 0.5 }));
        box.position.copy(center.clone().add(new THREE.Vector3(
          (Math.random() - 0.5) * 2, size / 2, (Math.random() - 0.5) * 2
        )));
        this.scene.add(box);
        this.props.push(box);
      }
    };
    addRandomCrates(roomCenter(2, 0), 5);
    addRandomCrates(roomCenter(2, 1), 4);
    addRandomCrates(roomCenter(2, 2), 6);
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
