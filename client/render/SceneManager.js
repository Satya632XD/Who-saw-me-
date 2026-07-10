import * as THREE from 'three';

export class SceneManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e); // won't be visible – ceiling covers everything

    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(0, 5, 10);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;

    this._addLighting();
    this._addMap();
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
    this.props = [];

    // Materials
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x48c9b0, roughness: 0.6 }); // turquoise
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x4a7c3a, roughness: 0.9 }); // grass‑like green
    const ceilMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });

    // --- Floor ---
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(28, 28), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // --- Ceiling (flat, solid) ---
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(28, 28), ceilMat);
    ceiling.position.y = 3;
    ceiling.rotation.x = Math.PI / 2;
    ceiling.receiveShadow = true;
    this.scene.add(ceiling);
    // Ceiling as collider (block jumping out)
    this.props.push(ceiling);

    // --- Outer walls ---
    const addWall = (x, z, w, d, h = 3) => {
      const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
      box.position.set(x, h / 2, z);
      box.castShadow = true;
      box.receiveShadow = true;
      this.scene.add(box);
      this.props.push(box);
      return box;
    };

    // Outer perimeter
    addWall(0, -14, 28, 0.2);  // north
    addWall(0, 14, 28, 0.2);   // south
    addWall(-14, 0, 0.2, 28);  // west
    addWall(14, 0, 0.2, 28);   // east

    // Interior grid walls (dividing into 8 rooms: 4x2 grid, doorway in each)
    const addInterior = (x, z, w, d) => addWall(x, z, w, d, 2.6);
    // vertical walls between columns
    addInterior(-7, -14, 0.2, 6);
    addInterior(-7, -2, 0.2, 6);
    addInterior(-7, 10, 0.2, 6);
    addInterior(7, -14, 0.2, 6);
    addInterior(7, -2, 0.2, 6);
    addInterior(7, 10, 0.2, 6);
    // horizontal walls between rows
    addInterior(-14, -7, 6, 0.2);
    addInterior(-2, -7, 6, 0.2);
    addInterior(10, -7, 6, 0.2);
    addInterior(-14, 7, 6, 0.2);
    addInterior(-2, 7, 6, 0.2);
    addInterior(10, 7, 6, 0.2);

    // --- Helper to place props ---
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

    // Room centers (col, row) where col=0..3, row=0..1, mapping to world X = -10.5 + col*7, Z = -10.5 + row*7
    const roomCenter = (col, row) => new THREE.Vector3(-10.5 + col * 7, 0, -10.5 + row * 7);

    // ===== ROOM 1 (0,0): Dinosaur Fossil Exhibit =====
    const r = roomCenter(0, 0);
    const boneMat = new THREE.MeshStandardMaterial({ color: 0xc4b69d, roughness: 0.4 });
    // Neck
    createProp(new THREE.CylinderGeometry(0.1, 0.15, 1.2, 6), boneMat, r.clone().add(new THREE.Vector3(0, 0.8, 0.2)));
    // Body
    createProp(new THREE.BoxGeometry(0.3, 0.4, 0.8), boneMat, r.clone().add(new THREE.Vector3(0, 0.4, 0)));
    // Tail
    createProp(new THREE.CylinderGeometry(0.08, 0.02, 0.9, 6), boneMat, r.clone().add(new THREE.Vector3(0, 0.3, -0.6)));
    // Skull (large)
    const skullBase = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.7), new THREE.MeshStandardMaterial({ color: 0xddddcc, roughness: 0.3 }));
    skullBase.position.copy(r.clone().add(new THREE.Vector3(0, 1.1, 0.7)));
    this.scene.add(skullBase); this.props.push(skullBase);
    // Small bones on ground
    for (let i = 0; i < 4; i++) {
      const small = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.3),
        new THREE.MeshStandardMaterial({ color: 0xb4a58a, roughness: 0.5 }));
      small.position.copy(r.clone().add(new THREE.Vector3((Math.random()-0.5)*2, 0.05, (Math.random()-0.5)*2)));
      this.scene.add(small); this.props.push(small);
    }

    // ===== ROOM 2 (1,0): Toys (teddy bear + blocks) =====
    const r2 = roomCenter(1, 0);
    const toyMat = new THREE.MeshStandardMaterial({ color: 0xd4956b, roughness: 0.5 });
    // Teddy bear head
    createProp(new THREE.SphereGeometry(0.25, 8, 8), toyMat, r2.clone().add(new THREE.Vector3(-0.5, 0.65, 0.3)));
    // Body
    createProp(new THREE.BoxGeometry(0.35, 0.4, 0.25), toyMat, r2.clone().add(new THREE.Vector3(-0.5, 0.25, 0.3)));
    // Ears
    createProp(new THREE.SphereGeometry(0.08, 6, 6), toyMat, r2.clone().add(new THREE.Vector3(-0.65, 0.85, 0.3)));
    createProp(new THREE.SphereGeometry(0.08, 6, 6), toyMat, r2.clone().add(new THREE.Vector3(-0.35, 0.85, 0.3)));
    // Colorful blocks
    const cols = [0xff4444, 0x44ff44, 0x4444ff, 0xffff44];
    cols.forEach((col, i) => {
      createProp(new THREE.BoxGeometry(0.3, 0.3, 0.3),
        new THREE.MeshStandardMaterial({ color: col, roughness: 0.3 }),
        r2.clone().add(new THREE.Vector3(0.7, 0.15, -0.5 + i*0.4)));
    });

    // ===== ROOM 3 (2,0): Balloon Room =====
    const r3 = roomCenter(2, 0);
    const balloonCols = [0xff69b4, 0x00ced1, 0xffd700, 0x7cfc00];
    balloonCols.forEach((col, i) => {
      // String
      createProp(new THREE.CylinderGeometry(0.02, 0.02, 0.7, 6),
        new THREE.MeshStandardMaterial({ color: 0xdddddd }),
        r3.clone().add(new THREE.Vector3(-0.8 + i*0.5, 0.65, 0.2)));
      // Balloon
      createProp(new THREE.SphereGeometry(0.25, 10, 10),
        new THREE.MeshStandardMaterial({ color: col, roughness: 0.2 }),
        r3.clone().add(new THREE.Vector3(-0.8 + i*0.5, 1.1, 0.2)));
    });
    // Gift box
    createProp(new THREE.BoxGeometry(0.5, 0.5, 0.5),
      new THREE.MeshStandardMaterial({ color: 0xff88ff, roughness: 0.3 }),
      r3.clone().add(new THREE.Vector3(0.5, 0.25, -0.3)));

    // ===== ROOM 4 (3,0): FARM ROOM (the one you described in detail) =====
    const r4 = roomCenter(3, 0);
    const hayMat = new THREE.MeshStandardMaterial({ color: 0xcdaf6f, roughness: 0.9 });
    const cowMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.4 });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.7 });
    // Cow statue (simplified)
    const cowBody = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 1.3), cowMat);
    cowBody.position.copy(r4.clone().add(new THREE.Vector3(-1.8, 0.4, -1.0)));
    this.scene.add(cowBody); this.props.push(cowBody);
    const cowHead = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.5), cowMat);
    cowHead.position.copy(r4.clone().add(new THREE.Vector3(-1.8, 0.7, 0.2)));
    this.scene.add(cowHead); this.props.push(cowHead);
    // Black patches
    const patch1 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshStandardMaterial({ color: 0x222222 }));
    patch1.position.copy(cowBody.position.clone().add(new THREE.Vector3(0.2, 0, 0)));
    this.scene.add(patch1); this.props.push(patch1);
    // Hay bales
    for (let i = 0; i < 9; i++) {
      const bale = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.5), hayMat);
      bale.position.copy(r4.clone().add(new THREE.Vector3(-2.0 + (i%3)*0.6, 0.2, -0.5 + Math.floor(i/3)*0.6)));
      this.scene.add(bale); this.props.push(bale);
    }
    // White fence
    for (let i = 0; i < 5; i++) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.05),
        new THREE.MeshStandardMaterial({ color: 0xffffff }));
      rail.position.copy(r4.clone().add(new THREE.Vector3(-0.5, 0.6, -1.5 + i*0.5)));
      this.scene.add(rail); this.props.push(rail);
    }
    // Hot‑air balloon (striped)
    const balloonBase = new THREE.Mesh(new THREE.SphereGeometry(0.7, 16, 16),
      new THREE.MeshStandardMaterial({ color: 0x3399ff, roughness: 0.2 }));
    balloonBase.position.copy(r4.clone().add(new THREE.Vector3(1.8, 1.5, 1.0)));
    this.scene.add(balloonBase); this.props.push(balloonBase);
    // White stripe
    const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.05, 8, 32),
      new THREE.MeshStandardMaterial({ color: 0xffffff }));
    stripe.position.copy(balloonBase.position);
    stripe.rotation.x = Math.PI/2;
    this.scene.add(stripe); this.props.push(stripe);
    // Basket
    createProp(new THREE.CylinderGeometry(0.3, 0.3, 0.3, 8),
      new THREE.MeshStandardMaterial({ color: 0xa0764a }),
      balloonBase.position.clone().add(new THREE.Vector3(0, -0.85, 0)));
    // Red barn
    const barn = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.2, 1.5),
      new THREE.MeshStandardMaterial({ color: 0xcc0000, roughness: 0.5 }));
    barn.position.copy(r4.clone().add(new THREE.Vector3(1.5, 0.6, -1.0)));
    this.scene.add(barn); this.props.push(barn);
    // Roof
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.1, 0.6, 4),
      new THREE.MeshStandardMaterial({ color: 0x333333 }));
    roof.position.copy(barn.position.clone().add(new THREE.Vector3(0, 0.9, 0)));
    this.scene.add(roof); this.props.push(roof);

    // ===== ROOM 5 (0,1): Art Room (paintings, easels) =====
    const r5 = roomCenter(0, 1);
    for (let i = 0; i < 4; i++) {
      const painting = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.7),
        new THREE.MeshStandardMaterial({ color: 0xffaacc, side: THREE.DoubleSide }));
      painting.position.copy(r5.clone().add(new THREE.Vector3(-1.2 + i*0.8, 1.0, -0.5)));
      painting.rotation.y = Math.PI/2;
      this.scene.add(painting); this.props.push(painting);
    }
    // Easel (triangle)
    const easel = new THREE.Group();
    const leg1 = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9),
      new THREE.MeshStandardMaterial({ color: 0xaaaaaa }));
    leg1.position.set(0, 0.45, 0.2); easel.add(leg1);
    const leg2 = leg1.clone(); leg2.position.set(0.3, 0.45, -0.2); easel.add(leg2);
    const leg3 = leg1.clone(); leg3.position.set(-0.3, 0.45, -0.2); easel.add(leg3);
    easel.position.copy(r5.clone().add(new THREE.Vector3(0.8, 0, 0.8)));
    this.scene.add(easel); this.props.push(leg1, leg2, leg3);

    // ===== ROOM 6 (1,1): Kitchenette =====
    const r6 = roomCenter(1, 1);
    const counter = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.9, 0.6),
      new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.3 }));
    counter.position.copy(r6.clone().add(new THREE.Vector3(-0.5, 0.45, -0.5)));
    this.scene.add(counter); this.props.push(counter);
    // Sink
    const sink = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.2 }));
    sink.position.copy(counter.position.clone().add(new THREE.Vector3(0, 0.5, 0)));
    this.scene.add(sink); this.props.push(sink);
    // Fridge
    const fridge = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.5, 0.7),
      new THREE.MeshStandardMaterial({ color: 0xeeeeff, roughness: 0.2 }));
    fridge.position.copy(r6.clone().add(new THREE.Vector3(1.2, 0.75, -0.7)));
    this.scene.add(fridge); this.props.push(fridge);
    // Oven
    const oven = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.8, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.4 }));
    oven.position.copy(r6.clone().add(new THREE.Vector3(-1.2, 0.4, 0.8)));
    this.scene.add(oven); this.props.push(oven);

    // ===== ROOM 7 (2,1): Gym =====
    const r7 = roomCenter(2, 1);
    const matMat = new THREE.MeshStandardMaterial({ color: 0x3355aa, roughness: 0.8 });
    // Yoga mats
    for (let i = 0; i < 3; i++) {
      const mat = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.05, 1.8), matMat);
      mat.position.copy(r7.clone().add(new THREE.Vector3(-1.0 + i*1.0, 0.025, 0.5)));
      this.scene.add(mat); this.props.push(mat);
    }
    // Exercise ball
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 16),
      new THREE.MeshStandardMaterial({ color: 0xff6600, roughness: 0.3 }));
    ball.position.copy(r7.clone().add(new THREE.Vector3(0.8, 0.4, -0.8)));
    this.scene.add(ball); this.props.push(ball);
    // Dumbbell
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6),
      new THREE.MeshStandardMaterial({ color: 0x888888 }));
    bar.position.copy(r7.clone().add(new THREE.Vector3(-0.5, 0.1, -0.5)));
    this.scene.add(bar); this.props.push(bar);
    const weight1 = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.1),
      new THREE.MeshStandardMaterial({ color: 0x444444 }));
    weight1.position.copy(bar.position.clone().add(new THREE.Vector3(0.3, 0, 0)));
    this.scene.add(weight1); this.props.push(weight1);
    const weight2 = weight1.clone();
    weight2.position.copy(bar.position.clone().add(new THREE.Vector3(-0.3, 0, 0)));
    this.scene.add(weight2); this.props.push(weight2);

    // ===== ROOM 8 (3,1): Library =====
    const r8 = roomCenter(3, 1);
    const bookMat = new THREE.MeshStandardMaterial({ color: 0x6b4c3b, roughness: 0.5 });
    // Bookshelves along walls
    for (let i = 0; i < 3; i++) {
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 0.3), bookMat);
      shelf.position.copy(r8.clone().add(new THREE.Vector3(-1.5, 0.6, -1.0 + i*1.0)));
      this.scene.add(shelf); this.props.push(shelf);
    }
    // Desk
    const desk = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.7, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x8b4513 }));
    desk.position.copy(r8.clone().add(new THREE.Vector3(1.0, 0.35, 0.3)));
    this.scene.add(desk); this.props.push(desk);
    // Chair
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x444444 }));
    seat.position.copy(desk.position.clone().add(new THREE.Vector3(0, -0.3, 0.8)));
    this.scene.add(seat); this.props.push(seat);

    // Additional scattered crates/barrels for cover
    for (let i = 0; i < 10; i++) {
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

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
