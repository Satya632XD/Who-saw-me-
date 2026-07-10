import * as THREE from 'three';

export class SceneManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e); // Will be hidden by walls & ceiling

    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(0, 5, 10);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.props = []; // collision objects

    this._addLighting();
    this._buildMap();

    window.addEventListener('resize', () => this._onResize());
  }

  _addLighting() {
    // Ambient fill
    const ambient = new THREE.AmbientLight(0x8888cc, 0.6);
    this.scene.add(ambient);

    // Main directional light (sun-like)
    const sun = new THREE.DirectionalLight(0xffeedd, 1.0);
    sun.position.set(5, 10, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 50;
    sun.shadow.camera.left = -20;
    sun.shadow.camera.right = 20;
    sun.shadow.camera.top = 20;
    sun.shadow.camera.bottom = -20;
    sun.shadow.bias = -0.001;
    this.scene.add(sun);
  }

  _buildMap() {
    // Materials
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x48c9b0, roughness: 0.7 }); // turquoise
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x4a7c3a, roughness: 0.9 }); // grass green
    const ceilMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, emissive: 0x222222, emissiveIntensity: 0.1 });

    // ===== Outer structure =====
    // Floor
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(28, 28), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Ceiling (flat, just below room height)
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(28, 28), ceilMat);
    ceiling.position.y = 3;
    ceiling.rotation.x = Math.PI / 2;
    ceiling.receiveShadow = true;
    this.scene.add(ceiling);
    this.props.push(ceiling); // collidable

    // Outer walls
    const createWall = (x, z, w, d, h = 3) => {
      const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
      box.position.set(x, h / 2, z);
      box.castShadow = true;
      box.receiveShadow = true;
      this.scene.add(box);
      this.props.push(box);
      return box;
    };

    createWall(0, -14, 28, 0.2);
    createWall(0, 14, 28, 0.2);
    createWall(-14, 0, 0.2, 28);
    createWall(14, 0, 0.2, 28);

    // Interior walls dividing into 4x2 rooms
    const createInterior = (x, z, w, d) => {
      const box = new THREE.Mesh(new THREE.BoxGeometry(w, 2.6, d), wallMat);
      box.position.set(x, 1.3, z);
      box.castShadow = true;
      box.receiveShadow = true;
      this.scene.add(box);
      this.props.push(box);
      return box;
    };

    // Vertical walls
    createInterior(-7, -14, 0.2, 6);
    createInterior(-7, -2, 0.2, 6);
    createInterior(-7, 10, 0.2, 6);
    createInterior(7, -14, 0.2, 6);
    createInterior(7, -2, 0.2, 6);
    createInterior(7, 10, 0.2, 6);
    // Horizontal walls
    createInterior(-14, -7, 6, 0.2);
    createInterior(-2, -7, 6, 0.2);
    createInterior(10, -7, 6, 0.2);
    createInterior(-14, 7, 6, 0.2);
    createInterior(-2, 7, 6, 0.2);
    createInterior(10, 7, 6, 0.2);

    // Ceiling LED panels (emissive squares)
    const panelGeo = new THREE.PlaneGeometry(0.4, 0.4);
    const panelMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.8 });
    for (let x = -12; x <= 12; x += 3) {
      for (let z = -12; z <= 12; z += 3) {
        const panel = new THREE.Mesh(panelGeo, panelMat);
        panel.position.set(x, 2.95, z);
        panel.rotation.x = -Math.PI / 2;
        this.scene.add(panel);
      }
    }

    // Hanging clouds (white fluffy spheres)
    const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
    const addCloud = (x, y, z, scale) => {
      const group = new THREE.Group();
      for (let i = 0; i < 5; i++) {
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.2 * scale, 6, 6), cloudMat);
        ball.position.set(Math.sin(i * 1.2) * 0.4, Math.cos(i * 1.2) * 0.2, 0);
        group.add(ball);
      }
      group.position.set(x, y, z);
      this.scene.add(group);
      // Not collidable
    };
    addCloud(-8, 2.5, -10, 1.5);
    addCloud(4, 2.6, 9, 1.8);
    addCloud(-10, 2.4, 5, 1.3);
    addCloud(10, 2.5, -8, 1.6);

    // ============ THEMED ROOMS ============
    const roomCenter = (col, row) => new THREE.Vector3(-10.5 + col * 7, 0, -10.5 + row * 7);

    const createProp = (geo, mat, pos, rotY = 0, collidable = true) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(pos);
      mesh.rotation.y = rotY;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      if (collidable) this.props.push(mesh);
      return mesh;
    };

    // ---- ROOM 0 (col 0, row 0): Dinosaur Fossil Exhibit ----
    const r0 = roomCenter(0, 0);
    const boneMat = new THREE.MeshStandardMaterial({ color: 0xd4c1a3, roughness: 0.5 });
    // Neck
    createProp(new THREE.CylinderGeometry(0.1, 0.15, 1.2, 6), boneMat, r0.clone().add(new THREE.Vector3(0, 0.8, 0.2)));
    // Body
    createProp(new THREE.BoxGeometry(0.3, 0.4, 0.8), boneMat, r0.clone().add(new THREE.Vector3(0, 0.4, 0)));
    // Tail
    createProp(new THREE.CylinderGeometry(0.08, 0.02, 0.9, 6), boneMat, r0.clone().add(new THREE.Vector3(0, 0.3, -0.6)));
    // Large skull
    const skullGeo = new THREE.SphereGeometry(0.35, 8, 8);
    const skull = new THREE.Mesh(skullGeo, new THREE.MeshStandardMaterial({ color: 0xeeeecc, roughness: 0.3 }));
    skull.position.copy(r0.clone().add(new THREE.Vector3(0, 1.1, 0.7)));
    skull.scale.set(1.2, 0.9, 1.5);
    this.scene.add(skull); this.props.push(skull);
    // Scattered small bones
    for (let i = 0; i < 5; i++) {
      createProp(new THREE.BoxGeometry(0.1, 0.1, 0.3),
        new THREE.MeshStandardMaterial({ color: 0xb4a58a, roughness: 0.5 }),
        r0.clone().add(new THREE.Vector3((Math.random()-0.5)*2, 0.05, (Math.random()-0.5)*2)));
    }

    // ---- ROOM 1 (1,0): Teddy Bear & Toys ----
    const r1 = roomCenter(1, 0);
    const bearMat = new THREE.MeshStandardMaterial({ color: 0xc47e5a, roughness: 0.6 });
    // Bear head
    createProp(new THREE.SphereGeometry(0.25, 8, 8), bearMat, r1.clone().add(new THREE.Vector3(-0.5, 0.65, 0.3)));
    // Bear body
    createProp(new THREE.BoxGeometry(0.35, 0.4, 0.25), bearMat, r1.clone().add(new THREE.Vector3(-0.5, 0.25, 0.3)));
    // Ears
    createProp(new THREE.SphereGeometry(0.08, 6, 6), bearMat, r1.clone().add(new THREE.Vector3(-0.65, 0.85, 0.3)));
    createProp(new THREE.SphereGeometry(0.08, 6, 6), bearMat, r1.clone().add(new THREE.Vector3(-0.35, 0.85, 0.3)));
    // Colorful blocks
    const blockColors = [0xff4444, 0x44ff44, 0x4444ff, 0xffff44];
    blockColors.forEach((col, i) => {
      createProp(new THREE.BoxGeometry(0.3, 0.3, 0.3),
        new THREE.MeshStandardMaterial({ color: col, roughness: 0.3 }),
        r1.clone().add(new THREE.Vector3(0.7, 0.15, -0.5 + i*0.4)));
    });
    // Toy truck
    const truckBody = new THREE.BoxGeometry(0.4, 0.2, 0.5);
    createProp(truckBody, new THREE.MeshStandardMaterial({ color: 0x3377ff, roughness: 0.3 }), r1.clone().add(new THREE.Vector3(1.0, 0.1, 0.8)));
    const wheelGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.1, 8);
    createProp(wheelGeo, new THREE.MeshStandardMaterial({ color: 0x222222 }), r1.clone().add(new THREE.Vector3(0.85, 0.1, 0.65)), 0);
    createProp(wheelGeo, new THREE.MeshStandardMaterial({ color: 0x222222 }), r1.clone().add(new THREE.Vector3(1.15, 0.1, 0.65)), 0);

    // ---- ROOM 2 (2,0): Balloon Room ----
    const r2 = roomCenter(2, 0);
    const balloonCols = [0xff69b4, 0x00ced1, 0xffd700, 0x7cfc00];
    balloonCols.forEach((col, i) => {
      // String
      createProp(new THREE.CylinderGeometry(0.02, 0.02, 0.7, 6),
        new THREE.MeshStandardMaterial({ color: 0xdddddd }),
        r2.clone().add(new THREE.Vector3(-0.8 + i*0.5, 0.65, 0.2)));
      // Balloon
      createProp(new THREE.SphereGeometry(0.25, 10, 10),
        new THREE.MeshStandardMaterial({ color: col, roughness: 0.2 }),
        r2.clone().add(new THREE.Vector3(-0.8 + i*0.5, 1.1, 0.2)));
    });
    // Gift box
    createProp(new THREE.BoxGeometry(0.5, 0.5, 0.5),
      new THREE.MeshStandardMaterial({ color: 0xff88ff, roughness: 0.3 }),
      r2.clone().add(new THREE.Vector3(0.5, 0.25, -0.3)));
    // Balloon arch (curved)
    const archMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    for (let a = -0.5; a <= 0.5; a += 0.1) {
      const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), archMat);
      sphere.position.copy(r2.clone().add(new THREE.Vector3(a, 0.8 + Math.sin(a*3)*0.2, -1.0)));
      this.scene.add(sphere); this.props.push(sphere);
    }

    // ---- ROOM 3 (3,0): FARM ROOM (the main reference) ----
    const r3 = roomCenter(3, 0);
    // Cow
    const cowBodyGeo = new THREE.BoxGeometry(0.8, 0.6, 1.3);
    const cowBody = new THREE.Mesh(cowBodyGeo, new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.5 }));
    cowBody.position.copy(r3.clone().add(new THREE.Vector3(-1.8, 0.4, -1.0)));
    this.scene.add(cowBody); this.props.push(cowBody);
    const cowHead = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.5),
      new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.5 }));
    cowHead.position.copy(r3.clone().add(new THREE.Vector3(-1.8, 0.7, 0.2)));
    this.scene.add(cowHead); this.props.push(cowHead);
    // Black patches
    const patch = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.25),
      new THREE.MeshStandardMaterial({ color: 0x222222 }));
    patch.position.copy(cowBody.position.clone().add(new THREE.Vector3(0.15, 0.1, 0)));
    this.scene.add(patch); this.props.push(patch);
    // Hay bales stacked
    const hayMat = new THREE.MeshStandardMaterial({ color: 0xcdaf6f, roughness: 0.9 });
    for (let i = 0; i < 9; i++) {
      const bale = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.5), hayMat);
      bale.position.copy(r3.clone().add(new THREE.Vector3(-2.0 + (i%3)*0.6, 0.2 + Math.floor(i/3)*0.45, -0.5 + Math.floor(i/3)*0.6)));
      this.scene.add(bale); this.props.push(bale);
    }
    // White wooden fence
    for (let i = 0; i < 6; i++) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, 0.04),
        new THREE.MeshStandardMaterial({ color: 0xffffff }));
      rail.position.copy(r3.clone().add(new THREE.Vector3(-0.8, 0.65, -1.5 + i*0.45)));
      this.scene.add(rail); this.props.push(rail);
    }
    // Hot‑air balloon (striped)
    const balloonBase = new THREE.Mesh(new THREE.SphereGeometry(0.7, 16, 16),
      new THREE.MeshStandardMaterial({ color: 0x3399ff, roughness: 0.2 }));
    balloonBase.position.copy(r3.clone().add(new THREE.Vector3(1.8, 1.5, 1.0)));
    this.scene.add(balloonBase); this.props.push(balloonBase);
    // Stripes (torus)
    const stripeMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    for (let s = -0.6; s <= 0.6; s += 0.3) {
      const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.71, 0.04, 8, 32), stripeMat);
      stripe.position.copy(balloonBase.position);
      stripe.rotation.x = Math.PI / 2;
      this.scene.add(stripe);
    }
    // Basket
    createProp(new THREE.CylinderGeometry(0.3, 0.3, 0.3, 8),
      new THREE.MeshStandardMaterial({ color: 0xa0764a }),
      balloonBase.position.clone().add(new THREE.Vector3(0, -0.85, 0)));
    // Red barn (large)
    const barn = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.2, 1.5),
      new THREE.MeshStandardMaterial({ color: 0xcc0000, roughness: 0.5 }));
    barn.position.copy(r3.clone().add(new THREE.Vector3(1.5, 0.6, -1.0)));
    this.scene.add(barn); this.props.push(barn);
    // Barn roof
    const roofGeo = new THREE.ConeGeometry(1.1, 0.6, 4);
    const roof = new THREE.Mesh(roofGeo, new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.7 }));
    roof.position.copy(barn.position.clone().add(new THREE.Vector3(0, 0.9, 0)));
    this.scene.add(roof); this.props.push(roof);
    // Green storage crates
    for (let i = 0; i < 4; i++) {
      createProp(new THREE.BoxGeometry(0.4, 0.4, 0.4),
        new THREE.MeshStandardMaterial({ color: 0x338833, roughness: 0.6 }),
        r3.clone().add(new THREE.Vector3(-0.5 + i*0.5, 0.2, 1.5)));
    }
    // Silo (metal tank)
    const silo = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.2, 10),
      new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.3, metalness: 0.7 }));
    silo.position.copy(r3.clone().add(new THREE.Vector3(-1.2, 0.6, 1.8)));
    this.scene.add(silo); this.props.push(silo);

    // ---- ROOM 4 (0,1): Art Studio ----
    const r4 = roomCenter(0, 1);
    const paintingColors = [0xffaacc, 0xaaccff, 0xccffaa, 0xffccaa];
    for (let i = 0; i < 4; i++) {
      const painting = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.7),
        new THREE.MeshStandardMaterial({ color: paintingColors[i], side: THREE.DoubleSide }));
      painting.position.copy(r4.clone().add(new THREE.Vector3(-1.2 + i*0.8, 1.0, -0.5)));
      painting.rotation.y = Math.PI / 2;
      this.scene.add(painting); this.props.push(painting);
    }
    // Easel
    const legMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa });
    const leg1 = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9), legMat);
    leg1.position.set(0, 0.45, 0.2);
    const leg2 = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9), legMat);
    leg2.position.set(0.3, 0.45, -0.2);
    const leg3 = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9), legMat);
    leg3.position.set(-0.3, 0.45, -0.2);
    const easel = new THREE.Group();
    easel.add(leg1); easel.add(leg2); easel.add(leg3);
    easel.position.copy(r4.clone().add(new THREE.Vector3(0.8, 0, 0.8)));
    this.scene.add(easel); this.props.push(leg1, leg2, leg3);

    // ---- ROOM 5 (1,1): Kitchenette ----
    const r5 = roomCenter(1, 1);
    const counter = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.9, 0.6),
      new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.3 }));
    counter.position.copy(r5.clone().add(new THREE.Vector3(-0.5, 0.45, -0.5)));
    this.scene.add(counter); this.props.push(counter);
    const sink = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.2 }));
    sink.position.copy(counter.position.clone().add(new THREE.Vector3(0, 0.5, 0)));
    this.scene.add(sink); this.props.push(sink);
    const fridge = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.5, 0.7),
      new THREE.MeshStandardMaterial({ color: 0xeeeeff, roughness: 0.2 }));
    fridge.position.copy(r5.clone().add(new THREE.Vector3(1.2, 0.75, -0.7)));
    this.scene.add(fridge); this.props.push(fridge);
    const oven = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.8, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.4 }));
    oven.position.copy(r5.clone().add(new THREE.Vector3(-1.2, 0.4, 0.8)));
    this.scene.add(oven); this.props.push(oven);

    // ---- ROOM 6 (2,1): Gym ----
    const r6 = roomCenter(2, 1);
    const matMat = new THREE.MeshStandardMaterial({ color: 0x3355aa, roughness: 0.8 });
    for (let i = 0; i < 3; i++) {
      const mat = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.05, 1.8), matMat);
      mat.position.copy(r6.clone().add(new THREE.Vector3(-1.0 + i*1.0, 0.025, 0.5)));
      this.scene.add(mat); this.props.push(mat);
    }
    // Exercise ball
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 16),
      new THREE.MeshStandardMaterial({ color: 0xff6600, roughness: 0.3 }));
    ball.position.copy(r6.clone().add(new THREE.Vector3(0.8, 0.4, -0.8)));
    this.scene.add(ball); this.props.push(ball);
    // Dumbbell
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6),
      new THREE.MeshStandardMaterial({ color: 0x888888 }));
    bar.position.copy(r6.clone().add(new THREE.Vector3(-0.5, 0.1, -0.5)));
    this.scene.add(bar); this.props.push(bar);
    const weight1 = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.1),
      new THREE.MeshStandardMaterial({ color: 0x444444 }));
    weight1.position.copy(bar.position.clone().add(new THREE.Vector3(0.3, 0, 0)));
    this.scene.add(weight1); this.props.push(weight1);
    const weight2 = weight1.clone();
    weight2.position.copy(bar.position.clone().add(new THREE.Vector3(-0.3, 0, 0)));
    this.scene.add(weight2); this.props.push(weight2);

    // ---- ROOM 7 (3,1): Library ----
    const r7 = roomCenter(3, 1);
    const bookMat = new THREE.MeshStandardMaterial({ color: 0x6b4c3b, roughness: 0.5 });
    for (let i = 0; i < 3; i++) {
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 0.3), bookMat);
      shelf.position.copy(r7.clone().add(new THREE.Vector3(-1.5, 0.6, -1.0 + i*1.0)));
      this.scene.add(shelf); this.props.push(shelf);
    }
    const desk = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.7, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x8b4513 }));
    desk.position.copy(r7.clone().add(new THREE.Vector3(1.0, 0.35, 0.3)));
    this.scene.add(desk); this.props.push(desk);
    const chair = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x444444 }));
    chair.position.copy(desk.position.clone().add(new THREE.Vector3(0, -0.3, 0.8)));
    this.scene.add(chair); this.props.push(chair);

    // Scattered crates/barrels for extra cover
    for (let i = 0; i < 12; i++) {
      const size = 0.4 + Math.random() * 0.4;
      const box = new THREE.Mesh(new THREE.BoxGeometry(size, size, size),
        new THREE.MeshStandardMaterial({ color: Math.random() * 0xffffff, roughness: 0.5 }));
      box.position.set(
        (Math.random() - 0.5) * 24,
        size / 2,
        (Math.random() - 0.5) * 24
      );
      this.scene.add(box);
      this.props.push(box);
    }
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  render() { this.renderer.render(this.scene, this.camera); }
}
