import * as THREE from 'three';

const ROOM_SIZE = 6.9;
const HALF_BUILDING = 14;
const CEILING_Y = 4.6;
const WALL_HEIGHT = 4.6;

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export class SceneManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x101722);
    this.scene.fog = new THREE.Fog(0x101722, 20, 48);

    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.08, 160);
    this.camera.position.set(0, 3, 8);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.props = [];            // kept for compatibility
    this.interactables = [];     // objects used for raycasts / painting / shooting
    this.collisionProps = [];    // static colliders for movement / camera
    this.spawnPoints = [];
    this._tmpV = new THREE.Vector3();
    this._tmpV2 = new THREE.Vector3();
    this._tmpV3 = new THREE.Vector3();
    this._raycaster = new THREE.Raycaster();
    this._camLookTarget = new THREE.Vector3();

    this._createAssets();
    this._addLighting();
    this._buildMap();

    window.addEventListener('resize', () => this._onResize());
  }

  _createAssets() {
    this.geoms = {
      boxSmall: new THREE.BoxGeometry(1, 1, 1),
      boxFlat: new THREE.BoxGeometry(1, 0.2, 1),
      boxTall: new THREE.BoxGeometry(1, 2, 1),
      cylinder8: new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
      cylinder12: new THREE.CylinderGeometry(0.5, 0.5, 1, 12),
      cylinder24: new THREE.CylinderGeometry(0.5, 0.5, 1, 24),
      sphere: new THREE.SphereGeometry(0.5, 12, 12),
      plane: new THREE.PlaneGeometry(1, 1),
      cone4: new THREE.ConeGeometry(1, 1, 4),
      torus: new THREE.TorusGeometry(0.5, 0.09, 10, 22),
      capsule: new THREE.CapsuleGeometry(0.45, 1.0, 4, 8),
    };

    const makeMat = (color, opts = {}) => new THREE.MeshStandardMaterial({
      color,
      roughness: opts.roughness ?? 0.7,
      metalness: opts.metalness ?? 0.0,
      emissive: opts.emissive ?? 0x000000,
      emissiveIntensity: opts.emissiveIntensity ?? 0,
      side: opts.side ?? THREE.FrontSide,
    });

    this.mats = {
      wall: makeMat(0x5db7a7, { roughness: 0.86 }),
      wallTrim: makeMat(0x34495e, { roughness: 0.8 }),
      floorDefault: makeMat(0x496f3f, { roughness: 1 }),
      ceiling: makeMat(0xeef2ff, { roughness: 0.5 }),
      panel: makeMat(0xf7fbff, { emissive: 0xbfdcff, emissiveIntensity: 0.8, roughness: 0.15 }),
      white: makeMat(0xffffff, { roughness: 0.45 }),
      black: makeMat(0x111111, { roughness: 0.8 }),
      gray: makeMat(0x9fa4a8, { roughness: 0.6 }),
      wood: makeMat(0x9d6b39, { roughness: 0.95 }),
      darkWood: makeMat(0x6a4327, { roughness: 0.92 }),
      red: makeMat(0xd4463d, { roughness: 0.72 }),
      blue: makeMat(0x3a8cff, { roughness: 0.55 }),
      green: makeMat(0x3a9b4f, { roughness: 0.8 }),
      yellow: makeMat(0xffd25a, { roughness: 0.75 }),
      orange: makeMat(0xff9d3c, { roughness: 0.75 }),
      pink: makeMat(0xff77bb, { roughness: 0.7 }),
      purple: makeMat(0x9a6cff, { roughness: 0.7 }),
      teal: makeMat(0x39c7b7, { roughness: 0.7 }),
      sand: makeMat(0xd7c08b, { roughness: 1 }),
      stone: makeMat(0x7f8d93, { roughness: 1 }),
      tile: makeMat(0xecf3f6, { roughness: 0.65 }),
      gym: makeMat(0x2d4a84, { roughness: 0.9 }),
      carpet: makeMat(0xa06d47, { roughness: 1 }),
      grass: makeMat(0x4a8338, { roughness: 1 }),
      skyBlue: makeMat(0x87c9ff, { roughness: 0.45 }),
      museumStone: makeMat(0xa4b0b7, { roughness: 0.9 }),
      artFloor: makeMat(0xf2f2ed, { roughness: 0.95 }),
      balloon: makeMat(0xffffff, { roughness: 0.3 }),
    };
  }

  _addLighting() {
    const ambient = new THREE.HemisphereLight(0xd8f0ff, 0x28313b, 1.25);
    this.scene.add(ambient);

    const fill = new THREE.AmbientLight(0xffffff, 0.28);
    this.scene.add(fill);

    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(8, 11, 7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 40;
    sun.shadow.camera.left = -20;
    sun.shadow.camera.right = 20;
    sun.shadow.camera.top = 20;
    sun.shadow.camera.bottom = -20;
    sun.shadow.bias = -0.0006;
    this.scene.add(sun);

    const spots = [
      [-11, 4.25, -11], [-3, 4.25, -11], [5, 4.25, -11], [12, 4.25, -11],
      [-11, 4.25, -3],  [-3, 4.25, -3],  [5, 4.25, -3],  [12, 4.25, -3],
      [-11, 4.25, 5],   [-3, 4.25, 5],   [5, 4.25, 5],   [12, 4.25, 5],
    ];
    for (const [x, y, z] of spots) {
      const light = new THREE.PointLight(0xf3fbff, 1.1, 12, 2);
      light.position.set(x, y, z);
      this.scene.add(light);
    }
  }

  _buildMap() {
    this._buildArchitecture();
    this._buildCeilingDetails();
    this._buildHallwayProps();
    this._buildDinosaurRoom();
    this._buildToyRoom();
    this._buildBalloonRoom();
    this._buildFarmRoom();
    this._buildArtRoom();
    this._buildKitchen();
    this._buildGym();
    this._buildLibrary();
    this._seedSpawnPoints();
  }

  _buildArchitecture() {
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x31463d, roughness: 1 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(28, 28), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const shellMat = this.mats.wall;
    const wallT = 0.35;

    const makeWall = (x, y, z, w, h, d, collidable = true, mat = shellMat) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      if (collidable) this._registerCollider(mesh);
      return mesh;
    };

    // outer shell
    makeWall(0, WALL_HEIGHT / 2, -HALF_BUILDING, 28, WALL_HEIGHT, wallT);
    makeWall(0, WALL_HEIGHT / 2, HALF_BUILDING, 28, WALL_HEIGHT, wallT);
    makeWall(-HALF_BUILDING, WALL_HEIGHT / 2, 0, wallT, WALL_HEIGHT, 28);
    makeWall(HALF_BUILDING, WALL_HEIGHT / 2, 0, wallT, WALL_HEIGHT, 28);

    // internal walls with doorway gaps to keep rooms connected
    const wallY = WALL_HEIGHT / 2;
    const doorwayW = 1.4;
    const segment = (x, z, w, d) => makeWall(x, wallY, z, w, WALL_HEIGHT, d);

    // vertical partitions between columns
    const verticalXs = [-7, 7];
    for (const x of verticalXs) {
      segment(x, -11.6, 0.2, 4.8);
      segment(x, -2.3, 0.2, 4.8);
      segment(x, 7.2, 0.2, 4.8);
    }

    // horizontal partition between rows
    segment(-11.5, -7, 4.8, 0.2);
    segment(-2.2, -7, 4.8, 0.2);
    segment(7.1, -7, 4.8, 0.2);
    segment(11.6, -7, 4.8, 0.2);

    // door frames / trim around openings
    const doorMat = this.mats.wallTrim;
    const addFrame = (x, y, z, w, h, d) => makeWall(x, y, z, w, h, d, true, doorMat);
    // a few visible arch frames
    addFrame(-7, 2.0, -7, 0.28, 2.2, 1.6);
    addFrame(7, 2.0, -7, 0.28, 2.2, 1.6);
    addFrame(0, 2.0, -7, 1.6, 2.2, 0.28);

    // decorative floor borders
    const borderMat = new THREE.MeshStandardMaterial({ color: 0x1c2830, roughness: 0.9 });
    const border = (x, z, w, d) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), borderMat);
      m.position.set(x, 0.025, z);
      m.receiveShadow = true;
      this.scene.add(m);
    };
    border(0, -13.8, 27.2, 0.2);
    border(0, 13.8, 27.2, 0.2);
    border(-13.8, 0, 0.2, 27.2);
    border(13.8, 0, 0.2, 27.2);

    // room floor decals
    const roomFloors = [
      { x: -10.5, z: -10.5, mat: new THREE.MeshStandardMaterial({ color: 0x9cc96f, roughness: 1 }) },
      { x: -3.5, z: -10.5, mat: new THREE.MeshStandardMaterial({ color: 0xeaf5ff, roughness: 0.95 }) },
      { x: 3.5, z: -10.5, mat: new THREE.MeshStandardMaterial({ color: 0xffd5f2, roughness: 1 }) },
      { x: 10.5, z: -10.5, mat: new THREE.MeshStandardMaterial({ color: 0x88b06c, roughness: 1 }) },
      { x: -10.5, z: -3.5, mat: new THREE.MeshStandardMaterial({ color: 0xf1e8dd, roughness: 0.95 }) },
      { x: -3.5, z: -3.5, mat: new THREE.MeshStandardMaterial({ color: 0xe9edf3, roughness: 0.85 }) },
      { x: 3.5, z: -3.5, mat: new THREE.MeshStandardMaterial({ color: 0xcfd7dd, roughness: 0.85 }) },
      { x: 10.5, z: -3.5, mat: new THREE.MeshStandardMaterial({ color: 0xe7dcc7, roughness: 0.95 }) },
    ];
    for (const room of roomFloors) {
      const pad = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 6.4), room.mat);
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(room.x, 0.01, room.z);
      pad.receiveShadow = true;
      this.scene.add(pad);
    }
  }

  _buildCeilingDetails() {
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(28, 28), this.mats.ceiling);
    ceiling.position.set(0, CEILING_Y, 0);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.receiveShadow = true;
    this.scene.add(ceiling);
    this._registerCollider(ceiling); // camera collision

    const panelGeo = new THREE.PlaneGeometry(0.95, 0.55);
    const beamGeo = new THREE.BoxGeometry(28, 0.08, 0.25);
    const ventGeo = new THREE.BoxGeometry(1.0, 0.08, 0.45);

    for (let x = -12; x <= 12; x += 4) {
      for (let z = -12; z <= 12; z += 4) {
        const panel = new THREE.Mesh(panelGeo, this.mats.panel);
        panel.rotation.x = Math.PI / 2;
        panel.position.set(x, CEILING_Y - 0.03, z);
        this.scene.add(panel);
      }
    }

    for (const z of [-11, -3, 5, 13]) {
      const beam = new THREE.Mesh(beamGeo, this.mats.white);
      beam.position.set(0, CEILING_Y - 0.12, z > 12 ? 12 : z);
      this.scene.add(beam);
    }

    for (const x of [-10, -2, 6, 12]) {
      const vent = new THREE.Mesh(ventGeo, this.mats.gray);
      vent.position.set(x, CEILING_Y - 0.08, -12);
      this.scene.add(vent);
    }

    // fluffy hanging clouds in toy / farm / balloon rooms
    this._createCloud(-10, 3.65, -10, 1.2);
    this._createCloud(4, 3.75, -9, 1.4);
    this._createCloud(10, 3.7, -11, 1.25);
    this._createCloud(-1, 3.75, -2.5, 1.15);
  }

  _buildHallwayProps() {
    const positions = [
      [-10.5, -7.0], [-3.5, -7.0], [3.5, -7.0], [10.5, -7.0],
      [0, -10.5], [0, -3.5], [0, 3.5],
    ];
    for (const [x, z] of positions) {
      this._createBench(x - 0.9, 0, z + 0.1, 0.9, 0.45);
      this._createPlant(x + 0.95, 0, z - 0.15, 0.55);
      this._createSign(x, 2.0, z + 1.2, 1.1, 0.45, 'MUSEUM', 0x23313f);
      this._createPedestal(x, 0, z - 1.0, 0.55, 0.95);
    }
    this._createCrateStack(-1.5, 0, -1.7, 2, 2, 0x8b5c2f);
    this._createCrateStack(1.8, 0, 1.7, 1, 3, 0x587d3c);
    this._createDisplayShelf(0.0, 0, -0.2, 1.3, 0.42, 3, 0x3a4a57);
  }

  _buildDinosaurRoom() {
    const c = this._roomCenter(0, 0);
    const stoneFloor = new THREE.MeshStandardMaterial({ color: 0x778086, roughness: 1 });
    this._placeFloor(c.x, c.z, stoneFloor);

    this._createMuseumSign(c.x - 1.8, 1.9, c.z - 2.6, 2.0, 0.7, 'DINOSAURS', 0x3d4c58);
    this._createExcavationPit(c.x + 1.25, 0, c.z + 1.35, 2.0, 1.1);
    this._createSkeleton(c.x - 0.2, 0, c.z + 0.7, 1.0);

    this._createRockPile(c.x - 2.2, 0, c.z - 1.8, 6, 0.28);
    this._createBonePile(c.x + 1.9, 0, c.z - 1.7, 7, 0.24);
    this._createFossilSlab(c.x - 2.25, 0.02, c.z + 2.0, 1.3, 0.65);
    this._createFossilSlab(c.x + 2.0, 0.02, c.z + 2.1, 1.15, 0.55);

    this._createDisplayShelf(c.x - 2.1, 0, c.z + 0.9, 0.7, 0.35, 3, 0x45545f);
    this._createDisplayShelf(c.x + 2.05, 0, c.z - 0.1, 0.65, 0.35, 2, 0x45545f);
    this._createPedestal(c.x + 0.2, 0, c.z - 2.1, 0.7, 0.9);
    this._createPedestal(c.x + 1.8, 0, c.z - 0.8, 0.6, 0.9);
    this._createPedestal(c.x - 1.9, 0, c.z + 1.8, 0.6, 0.9);

    this._createSpotlight(c.x - 2.2, 3.8, c.z - 2.2, -0.3, 0.8);
    this._createSpotlight(c.x + 2.2, 3.8, c.z - 2.0, 0.2, 0.75);
    this._createCrateStack(c.x - 0.1, 0, c.z - 2.5, 2, 1, 0x70523a);
    this._createSign(c.x + 1.8, 1.9, c.z + 2.6, 1.5, 0.5, 'FOSSILS', 0x4b5b68);
  }

  _buildToyRoom() {
    const c = this._roomCenter(1, 0);
    this._placeFloor(c.x, c.z, new THREE.MeshStandardMaterial({ color: 0xffecd1, roughness: 1 }));
    this._createMuseumSign(c.x, 1.9, c.z - 2.6, 2.2, 0.7, 'TOY ROOM', 0x6c4fa8);

    this._createTeddyBear(c.x - 2.1, 0, c.z - 1.7, 0.95);
    this._createTeddyBear(c.x - 0.9, 0, c.z - 0.3, 0.8);
    this._createToyCar(c.x + 1.5, 0, c.z + 1.7, 0.7, 0xff4a4a);
    this._createToyTrain(c.x + 1.8, 0, c.z - 1.1, 1.0);

    this._createBlockTower(c.x - 0.1, 0, c.z + 1.6, 4);
    this._createGiftPile(c.x + 2.1, 0, c.z - 2.0, 5);
    this._createToyShelf(c.x - 2.2, 0, c.z + 1.0, 1.0, 0.45);
    this._createToyShelf(c.x + 0.9, 0, c.z - 2.1, 1.0, 0.45);
    this._createToyRobot(c.x + 0.4, 0, c.z + 0.7, 1.1);
    this._createPuzzleSpread(c.x - 0.2, 0, c.z - 1.8);
    this._createBalloonCluster(c.x - 2.3, 0, c.z + 2.1, 0.8, 4, true);
    this._createBalloonCluster(c.x + 2.0, 0, c.z + 2.2, 0.7, 4, false);
    this._createSign(c.x + 1.8, 1.85, c.z + 2.3, 1.4, 0.45, 'PLAY', 0x9d61ff);
  }

  _buildBalloonRoom() {
    const c = this._roomCenter(2, 0);
    this._placeFloor(c.x, c.z, new THREE.MeshStandardMaterial({ color: 0xf9d9ea, roughness: 1 }));
    this._createMuseumSign(c.x, 1.9, c.z - 2.6, 2.3, 0.7, 'BIRTHDAY PARTY', 0x9d3b73);

    this._createBalloonArch(c.x - 0.2, 0, c.z - 1.4, 3.2);
    this._createBalloonCluster(c.x - 2.4, 0, c.z + 0.8, 0.95, 6, true);
    this._createBalloonCluster(c.x + 1.8, 0, c.z + 0.7, 0.95, 6, false);
    this._createGiftPile(c.x + 1.8, 0, c.z - 2.0, 6);
    this._createBirthdayTable(c.x - 0.1, 0, c.z + 1.8, 1.9);
    this._createCake(c.x - 0.1, 0.9, c.z + 1.8, 0.5);
    this._createPartyHat(c.x - 1.4, 0, c.z + 1.9, 0.5);
    this._createPartyHat(c.x + 1.2, 0, c.z + 1.5, 0.5);
    this._createStreamer(c.x - 2.5, 3.5, c.z - 2.2, 5);
    this._createStreamer(c.x + 2.5, 3.5, c.z - 2.3, 5);
    this._createSign(c.x, 1.86, c.z + 2.4, 1.4, 0.45, 'CELEBRATE', 0xd24f8b);
  }

  _buildFarmRoom() {
    const c = this._roomCenter(3, 0);
    this._placeFloor(c.x, c.z, new THREE.MeshStandardMaterial({ color: 0x6b9d4d, roughness: 1 }));
    this._createMuseumSign(c.x, 1.9, c.z - 2.6, 2.0, 0.7, 'FARM BARN', 0x7a3e28);

    this._createBarn(c.x + 1.6, 0, c.z - 0.8, 2.2, 1.9);
    this._createCow(c.x - 1.9, 0, c.z - 1.2, 1.2);
    this._createHayStack(c.x - 1.5, 0, c.z + 1.7, 3);
    this._createHayStack(c.x - 0.1, 0, c.z + 1.8, 2);
    this._createFenceRow(c.x - 2.5, c.z - 2.0, 5, 0.7);
    this._createSilo(c.x + 2.4, 0, c.z + 1.7, 1.7);
    this._createCrateStack(c.x + 0.0, 0, c.z + 1.5, 2, 2, 0x3f7f3d);
    this._createBarrel(c.x + 1.9, 0, c.z + 1.9, 0.6);
    this._createBarrel(c.x - 2.0, 0, c.z - 2.0, 0.6);
    this._createWagonWheel(c.x + 2.15, 0, c.z - 2.0, 0.55);
    this._createFeedBucket(c.x - 0.8, 0, c.z - 2.2, 0.3);
    this._createFeedBucket(c.x - 2.2, 0, c.z - 0.4, 0.3);
    this._createBalloonCluster(c.x + 0.8, 0, c.z - 1.8, 0.7, 3, false);
    this._createCloud(c.x - 1.1, 3.75, c.z - 0.8, 1.3);
    this._createCloud(c.x + 1.4, 3.7, c.z + 1.1, 1.2);
    this._createSign(c.x - 2.2, 1.85, c.z + 2.2, 1.3, 0.45, 'HAY', 0x3f6e3f);
  }

  _buildArtRoom() {
    const c = this._roomCenter(0, 1);
    this._placeFloor(c.x, c.z, new THREE.MeshStandardMaterial({ color: 0xf4efe9, roughness: 1 }));
    this._createMuseumSign(c.x - 0.1, 1.9, c.z - 2.6, 2.1, 0.7, 'ART STUDIO', 0x9e567c);

    this._createEasel(c.x - 2.0, 0, c.z - 1.2, 0.9);
    this._createEasel(c.x - 0.7, 0, c.z + 0.6, 0.95);
    this._createEasel(c.x + 1.0, 0, c.z - 0.4, 0.9);
    this._createArtTable(c.x + 1.8, 0, c.z + 1.4, 1.7, 0.7);
    this._createPaintBucket(c.x - 2.3, 0, c.z + 1.5, 0.35, 0xff6a4d);
    this._createPaintBucket(c.x - 1.4, 0, c.z + 1.8, 0.35, 0x5bc0ff);
    this._createPaintBucket(c.x + 0.0, 0, c.z + 1.8, 0.35, 0xffd84d);
    this._createClaySculpture(c.x + 2.3, 0, c.z - 1.9, 0.9);
    this._createFrameWall(c.x - 1.2, c.z - 2.1);
    this._createFrameWall(c.x + 0.5, c.z - 2.2);
    this._createPaletteStack(c.x + 2.2, 0, c.z + 0.2, 4);
    this._createDisplayShelf(c.x - 2.2, 0, c.z + 0.5, 0.8, 0.38, 3, 0x7b5e49);
    this._createPaintSplatDecals(c.x - 0.8, c.z - 0.6, 6);
    this._createSign(c.x + 1.8, 1.86, c.z + 2.35, 1.35, 0.45, 'CREATE', 0xcc6a96);
  }

  _buildKitchen() {
    const c = this._roomCenter(1, 1);
    this._placeFloor(c.x, c.z, this.mats.tile);
    this._createMuseumSign(c.x, 1.9, c.z - 2.6, 1.9, 0.7, 'KITCHEN', 0x607288);

    this._createCabinetRun(c.x - 2.2, c.z - 1.8, 3, 0.75);
    this._createSinkCounter(c.x - 1.2, c.z + 0.7);
    this._createFridge(c.x + 2.1, c.z - 0.8, 1.45);
    this._createOven(c.x + 0.9, c.z + 1.7, 1.0);
    this._createDiningTable(c.x - 0.1, c.z + 1.8, 1.9, 1.0);
    this._createChair(c.x - 1.2, c.z + 2.3, 0.45);
    this._createChair(c.x + 1.0, c.z + 2.3, 0.45);
    this._createChair(c.x - 1.2, c.z + 1.2, 0.45);
    this._createChair(c.x + 1.0, c.z + 1.2, 0.45);
    this._createShelf(c.x + 2.0, c.z + 1.8, 3, 0.45);
    this._createPot(c.x - 2.0, 0, c.z + 1.8, 0.35);
    this._createPot(c.x + 1.9, 0, c.z + 0.2, 0.35);
    this._createBoxStack(c.x - 0.2, c.z - 2.0, 4, 0xead9b5);
    this._createSign(c.x + 1.7, 1.86, c.z - 2.2, 1.4, 0.45, 'KITCHEN', 0x607288);
  }

  _buildGym() {
    const c = this._roomCenter(2, 1);
    this._placeFloor(c.x, c.z, new THREE.MeshStandardMaterial({ color: 0x344a82, roughness: 1 }));
    this._createMuseumSign(c.x, 1.9, c.z - 2.6, 1.9, 0.7, 'GYM', 0x4d6ec9);

    this._createMatStrip(c.x - 2.0, c.z - 1.7, 3);
    this._createMatStrip(c.x - 0.2, c.z - 1.7, 3);
    this._createMatStrip(c.x + 1.6, c.z - 1.7, 2);
    this._createBenchPress(c.x - 1.8, c.z + 1.1, 1.2);
    this._createDumbbellRack(c.x + 0.9, c.z + 0.8, 4);
    this._createExerciseBall(c.x + 2.2, c.z - 1.7, 0.55, 0xff7a2f);
    this._createExerciseBall(c.x - 0.6, c.z + 1.8, 0.45, 0x50d0ff);
    this._createRopeStack(c.x - 2.4, c.z + 1.8, 0.9);
    this._createFoamBlockPile(c.x + 2.2, c.z + 1.7, 5);
    this._createPullUpFrame(c.x + 1.9, c.z - 0.2, 1.55);
    this._createLocker(c.x - 2.3, c.z - 0.2, 4);
    this._createSign(c.x - 1.8, 1.85, c.z + 2.35, 1.3, 0.45, 'FITNESS', 0x4d6ec9);
  }

  _buildLibrary() {
    const c = this._roomCenter(3, 1);
    this._placeFloor(c.x, c.z, new THREE.MeshStandardMaterial({ color: 0xd2b48c, roughness: 1 }));
    this._createMuseumSign(c.x, 1.9, c.z - 2.6, 2.0, 0.7, 'LIBRARY', 0x6d563e);

    this._createBookshelf(c.x - 2.1, c.z - 1.8, 3, 1.35, 0.35);
    this._createBookshelf(c.x - 0.2, c.z - 1.8, 3, 1.35, 0.35);
    this._createBookshelf(c.x + 1.8, c.z - 1.8, 3, 1.35, 0.35);
    this._createReadingTable(c.x - 1.0, c.z + 0.8, 1.3);
    this._createReadingTable(c.x + 1.2, c.z + 0.8, 1.3);
    this._createReadingLamp(c.x - 1.4, c.z + 0.4, 0.55);
    this._createReadingLamp(c.x + 1.0, c.z + 0.4, 0.55);
    this._createBookStack(c.x - 2.4, c.z + 1.8, 5);
    this._createBookStack(c.x + 0.2, c.z + 1.8, 4);
    this._createBookCart(c.x + 2.2, c.z + 0.8, 0.7);
    this._createChair(c.x - 0.9, c.z + 1.9, 0.45);
    this._createChair(c.x + 1.0, c.z + 1.9, 0.45);
    this._createSign(c.x + 1.7, 1.85, c.z + 2.35, 1.45, 0.45, 'READ', 0x6d563e);
  }

  // --------------------------- reusable helpers ---------------------------

  _roomCenter(col, row) {
    return new THREE.Vector3(-10.5 + col * 7, 0, -10.5 + row * 7);
  }

  _placeFloor(x, z, material) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 6.4), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.014, z);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    return mesh;
  }

  _registerCollider(mesh) {
    mesh.userData.isCollider = true;
    mesh.userData.bounds = new THREE.Box3().setFromObject(mesh);
    this.collisionProps.push(mesh);
    this.props.push(mesh);
    this.interactables.push(mesh);
  }

  _registerInteractive(mesh, collidable = false) {
    this.scene.add(mesh);
    this.props.push(mesh);
    this.interactables.push(mesh);
    if (collidable) this._registerCollider(mesh);
    return mesh;
  }

  _createBox(x, y, z, w, h, d, material, collidable = true, rotY = 0) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotY;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    if (collidable) this._registerCollider(mesh);
    else {
      this.props.push(mesh);
      this.interactables.push(mesh);
    }
    return mesh;
  }

  _createCylinder(x, y, z, rTop, rBottom, h, material, collidable = true, rotX = 0, rotZ = 0, rotY = 0) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, 10), material);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rotX, rotY, rotZ);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    if (collidable) this._registerCollider(mesh);
    else {
      this.props.push(mesh);
      this.interactables.push(mesh);
    }
    return mesh;
  }

  _createSphere(x, y, z, r, material, collidable = true) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 12), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    if (collidable) this._registerCollider(mesh);
    else {
      this.props.push(mesh);
      this.interactables.push(mesh);
    }
    return mesh;
  }

  _createPlane(x, y, z, w, h, material, collidable = false, rotY = 0, rotX = -Math.PI / 2) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rotX, rotY, 0);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    this.scene.add(mesh);
    this.props.push(mesh);
    this.interactables.push(mesh);
    if (collidable) this._registerCollider(mesh);
    return mesh;
  }

  _createCloud(x, y, z, scale = 1) {
    const group = new THREE.Group();
    const count = 6;
    for (let i = 0; i < count; i++) {
      const puff = new THREE.Mesh(
        new THREE.SphereGeometry(0.22 * scale, 8, 8),
        this.mats.white
      );
      puff.position.set(Math.cos(i * 1.1) * 0.35 * scale, Math.sin(i * 0.8) * 0.08 * scale, Math.sin(i * 1.4) * 0.18 * scale);
      puff.castShadow = true;
      puff.receiveShadow = true;
      group.add(puff);
    }
    group.position.set(x, y, z);
    this.scene.add(group);
    return group;
  }

  _createMuseumSign(x, y, z, w, h, text, color = 0x33404d) {
    return this._createSign(x, y, z, w, h, text, color);
  }

  _createSign(x, y, z, w, h, text, color = 0x33404d) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = `#${new THREE.Color(color).getHexString()}`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 8;
    ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
    ctx.fillStyle = 'white';
    ctx.font = 'bold 34px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    sign.position.set(x, y, z);
    sign.rotation.y = Math.PI / 2;
    sign.castShadow = false;
    sign.receiveShadow = true;
    this.scene.add(sign);
    this.props.push(sign);
    this.interactables.push(sign);
    return sign;
  }

  _createBench(x, y, z, w = 1, h = 0.45) {
    const group = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, 0.34), this.mats.wood);
    seat.position.y = 0.33;
    group.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(w, 0.48, 0.08), this.mats.darkWood);
    back.position.set(0, 0.62, -0.13);
    group.add(back);
    const legGeo = new THREE.BoxGeometry(0.08, 0.34, 0.08);
    const legs = [[-w/2+0.08, 0.16, -0.12], [w/2-0.08, 0.16, -0.12], [-w/2+0.08, 0.16, 0.12], [w/2-0.08, 0.16, 0.12]];
    for (const [lx, ly, lz] of legs) {
      const leg = new THREE.Mesh(legGeo, this.mats.darkWood);
      leg.position.set(lx, ly, lz);
      group.add(leg);
    }
    group.position.set(x, y, z);
    this.scene.add(group);
    return group;
  }

  _createPlant(x, y, z, scale = 1) {
    const group = new THREE.Group();
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * scale, 0.28 * scale, 0.3 * scale, 8), this.mats.wood);
    pot.position.y = 0.15 * scale;
    group.add(pot);
    for (let i = 0; i < 5; i++) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.16 * scale, 8, 8), this.mats.green);
      leaf.position.set(Math.cos(i * 1.2) * 0.14 * scale, 0.42 * scale + Math.sin(i) * 0.1 * scale, Math.sin(i * 1.2) * 0.14 * scale);
      group.add(leaf);
    }
    group.position.set(x, y, z);
    this.scene.add(group);
    return group;
  }

  _createPedestal(x, y, z, w = 0.6, h = 1.0) {
    return this._createBox(x, y + h / 2, z, w, h, w, this.mats.museumStone, true);
  }

  _createCrateStack(x, y, z, rows = 2, cols = 2, color = 0x8b5c2f) {
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.95 });
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        this._createBox(
          x + c * 0.55,
          y + 0.27 + r * 0.55,
          z + (r % 2) * 0.03,
          0.5,
          0.5,
          0.5,
          mat,
          true
        );
      }
    }
  }

  _createDisplayShelf(x, y, z, w = 1.0, d = 0.35, levels = 3, color = 0x3c4f5a) {
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
    const h = 1.15 + 0.45 * (levels - 1);
    this._createBox(x, y + h / 2, z, w, h, d, mat, true);
    for (let i = 1; i < levels; i++) {
      this._createBox(x, y + 0.2 + i * 0.45, z, w * 0.95, 0.06, d * 0.92, this.mats.gray, false);
    }
  }

  _createRockPile(x, y, z, count = 6, scale = 0.25) {
    for (let i = 0; i < count; i++) {
      this._createSphere(
        x + Math.cos(i * 0.9) * 0.35,
        y + scale * (0.45 + (i % 3) * 0.08),
        z + Math.sin(i * 1.2) * 0.28,
        scale * (0.7 + (i % 2) * 0.15),
        this.mats.stone,
        true
      );
    }
  }

  _createBonePile(x, y, z, count = 6, scale = 0.18) {
    for (let i = 0; i < count; i++) {
      this._createBox(
        x + Math.cos(i * 1.05) * 0.3,
        y + 0.08,
        z + Math.sin(i * 1.3) * 0.25,
        0.45 * scale + 0.15,
        0.09,
        0.11,
        this.mats.white,
        true,
        i * 0.3
      );
    }
  }

  _createFossilSlab(x, y, z, w, d) {
    this._createBox(x, y + 0.06, z, w, 0.12, d, this.mats.gray, true);
    this._createPlane(x, y + 0.08, z, w * 0.84, d * 0.84, new THREE.MeshStandardMaterial({ color: 0x56616a, roughness: 1 }), false);
  }

  _createSpotlight(x, y, z, rotY, intensity = 0.75) {
    const lamp = new THREE.SpotLight(0xffffff, intensity, 10, Math.PI / 5, 0.4, 1);
    lamp.position.set(x, y, z);
    lamp.target.position.set(x + Math.sin(rotY) * 0.2, 0, z + Math.cos(rotY) * 0.2);
    this.scene.add(lamp);
    this.scene.add(lamp.target);
    const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.22, 8), this.mats.black);
    housing.position.set(x, y, z);
    housing.rotation.z = Math.PI / 2;
    this.scene.add(housing);
    return lamp;
  }

  _createExcavationPit(x, y, z, w, d) {
    this._createBox(x, 0.05, z, w, 0.1, d, this.mats.sand, true);
    this._createBox(x, 0.2, z, w * 0.9, 0.08, d * 0.9, new THREE.MeshStandardMaterial({ color: 0x9f8657, roughness: 1 }), false);
    for (let i = 0; i < 4; i++) {
      this._createSphere(x + Math.cos(i) * 0.4, 0.18, z + Math.sin(i * 1.4) * 0.3, 0.12, this.mats.stone, true);
    }
  }

  _createSkeleton(x, y, z, scale = 1) {
    const boneMat = this.mats.white;
    const addBone = (bx, by, bz, w, h, d, rx = 0, ry = 0, rz = 0) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), boneMat);
      mesh.position.set(bx, by, bz);
      mesh.rotation.set(rx, ry, rz);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this._registerCollider(mesh);
      return mesh;
    };
    addBone(x, y + 1.1 * scale, z + 0.2, 0.35 * scale, 0.42 * scale, 0.22 * scale, 0.2, 0.1, -0.1); // skull
    addBone(x, y + 0.85 * scale, z, 0.2 * scale, 0.55 * scale, 0.16 * scale, 0, 0, 0.15);
    addBone(x, y + 0.55 * scale, z - 0.2, 0.34 * scale, 0.16 * scale, 0.52 * scale, 0, 0, 0);
    addBone(x - 0.45 * scale, y + 0.7 * scale, z + 0.2, 0.12 * scale, 0.55 * scale, 0.12 * scale, 0.2, 0, 0.9);
    addBone(x + 0.45 * scale, y + 0.7 * scale, z + 0.2, 0.12 * scale, 0.55 * scale, 0.12 * scale, 0.2, 0, -0.9);
    addBone(x - 0.35 * scale, y + 0.18 * scale, z - 0.1, 0.12 * scale, 0.7 * scale, 0.12 * scale, 0.4, 0, 0.1);
    addBone(x + 0.35 * scale, y + 0.18 * scale, z - 0.1, 0.12 * scale, 0.7 * scale, 0.12 * scale, -0.4, 0, -0.1);
    addBone(x, y + 0.1 * scale, z - 0.55 * scale, 0.16 * scale, 0.18 * scale, 0.45 * scale, 0.25, 0, 0);
    addBone(x - 0.15 * scale, y + 0.0, z - 0.9 * scale, 0.1 * scale, 0.08 * scale, 0.28 * scale, 0, 0, 0.15);
    addBone(x + 0.15 * scale, y + 0.0, z - 0.9 * scale, 0.1 * scale, 0.08 * scale, 0.28 * scale, 0, 0, -0.15);
  }

  _createTeddyBear(x, y, z, scale = 1) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5 * scale, 0.6 * scale, 0.38 * scale), new THREE.MeshStandardMaterial({ color: 0xc8865f, roughness: 0.85 }));
    body.position.y = 0.48 * scale;
    group.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.23 * scale, 12, 12), body.material);
    head.position.set(0, 0.95 * scale, 0);
    group.add(head);
    const earL = new THREE.Mesh(new THREE.SphereGeometry(0.08 * scale, 10, 10), body.material);
    earL.position.set(-0.15 * scale, 1.15 * scale, 0.08 * scale);
    group.add(earL);
    const earR = earL.clone();
    earR.position.x = 0.15 * scale;
    group.add(earR);
    const armGeo = new THREE.BoxGeometry(0.12 * scale, 0.32 * scale, 0.12 * scale);
    const legGeo = new THREE.BoxGeometry(0.13 * scale, 0.28 * scale, 0.13 * scale);
    const armL = new THREE.Mesh(armGeo, body.material);
    armL.position.set(-0.3 * scale, 0.55 * scale, 0);
    armL.rotation.z = 0.4;
    group.add(armL);
    const armR = armL.clone();
    armR.position.x = 0.3 * scale;
    armR.rotation.z = -0.4;
    group.add(armR);
    const legL = new THREE.Mesh(legGeo, body.material);
    legL.position.set(-0.12 * scale, 0.15 * scale, 0);
    group.add(legL);
    const legR = legL.clone();
    legR.position.x = 0.12 * scale;
    group.add(legR);
    group.position.set(x, y, z);
    this.scene.add(group);
    return group;
  }

  _createToyCar(x, y, z, scale = 1, color = 0xff4a4a) {
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
    this._createBox(x, y + 0.14 * scale, z, 0.7 * scale, 0.18 * scale, 0.35 * scale, mat, true);
    this._createBox(x - 0.1 * scale, y + 0.27 * scale, z, 0.32 * scale, 0.18 * scale, 0.26 * scale, mat, true);
    this._createCylinder(x - 0.24 * scale, y + 0.05 * scale, z - 0.18 * scale, 0.08 * scale, 0.08 * scale, 0.08 * scale, this.mats.black, true, Math.PI / 2);
    this._createCylinder(x + 0.24 * scale, y + 0.05 * scale, z - 0.18 * scale, 0.08 * scale, 0.08 * scale, 0.08 * scale, this.mats.black, true, Math.PI / 2);
    this._createCylinder(x - 0.24 * scale, y + 0.05 * scale, z + 0.18 * scale, 0.08 * scale, 0.08 * scale, 0.08 * scale, this.mats.black, true, Math.PI / 2);
    this._createCylinder(x + 0.24 * scale, y + 0.05 * scale, z + 0.18 * scale, 0.08 * scale, 0.08 * scale, 0.08 * scale, this.mats.black, true, Math.PI / 2);
  }

  _createToyTrain(x, y, z, scale = 1) {
    this._createBox(x, y + 0.12 * scale, z, 0.75 * scale, 0.22 * scale, 0.34 * scale, new THREE.MeshStandardMaterial({ color: 0x3667e3, roughness: 0.4 }), true);
    this._createBox(x + 0.42 * scale, y + 0.17 * scale, z, 0.36 * scale, 0.28 * scale, 0.28 * scale, new THREE.MeshStandardMaterial({ color: 0xff8b2d, roughness: 0.45 }), true);
    this._createCylinder(x - 0.28 * scale, y + 0.03 * scale, z - 0.18 * scale, 0.07 * scale, 0.07 * scale, 0.08 * scale, this.mats.black, true, Math.PI / 2);
    this._createCylinder(x + 0.05 * scale, y + 0.03 * scale, z - 0.18 * scale, 0.07 * scale, 0.07 * scale, 0.08 * scale, this.mats.black, true, Math.PI / 2);
  }

  _createBlockTower(x, y, z, count = 4) {
    const colors = [0xff4f4f, 0x4f9dff, 0x4fff7a, 0xffe34f];
    for (let i = 0; i < count; i++) {
      this._createBox(x, y + 0.18 * i, z, 0.35, 0.35, 0.35, new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: 0.5 }), true, i * 0.2);
    }
  }

  _createGiftPile(x, y, z, count = 5) {
    const colors = [0xff7ac8, 0x50d0ff, 0xffc84f, 0x9d61ff];
    for (let i = 0; i < count; i++) {
      this._createBox(
        x + Math.cos(i * 0.9) * 0.35,
        y + 0.12 * (i % 2),
        z + Math.sin(i * 1.2) * 0.28,
        0.32 + (i % 2) * 0.08,
        0.24 + (i % 3) * 0.06,
        0.32 + (i % 2) * 0.06,
        new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: 0.55 }),
        true,
        i * 0.25
      );
    }
  }

  _createToyShelf(x, y, z, w = 1, d = 0.45) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x87654f, roughness: 0.85 });
    this._createBox(x, y + 0.9, z, w, 1.8, d, mat, true);
    for (let i = 0; i < 3; i++) {
      this._createBox(x, y + 0.4 + i * 0.45, z, w * 0.92, 0.05, d * 0.9, this.mats.gray, false);
    }
  }

  _createToyRobot(x, y, z, scale = 1) {
    this._createBox(x, y + 0.35 * scale, z, 0.42 * scale, 0.7 * scale, 0.32 * scale, new THREE.MeshStandardMaterial({ color: 0x6ad6ff, roughness: 0.35 }), true);
    this._createSphere(x, y + 0.8 * scale, z, 0.14 * scale, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 }), true);
    this._createCylinder(x - 0.18 * scale, y + 0.12 * scale, z, 0.05 * scale, 0.05 * scale, 0.35 * scale, this.mats.gray, true);
    this._createCylinder(x + 0.18 * scale, y + 0.12 * scale, z, 0.05 * scale, 0.05 * scale, 0.35 * scale, this.mats.gray, true);
  }

  _createPuzzleSpread(x, y, z) {
    for (let i = 0; i < 6; i++) {
      this._createBox(x + Math.cos(i) * 0.45, y + 0.02, z + Math.sin(i * 1.2) * 0.32, 0.18, 0.03, 0.14, new THREE.MeshStandardMaterial({ color: 0x4fb2ff, roughness: 0.7 }), true, i * 0.2);
    }
  }

  _createBalloonCluster(x, y, z, scale = 1, count = 5, pastel = false) {
    const palette = pastel
      ? [0xffb6c1, 0xadd8e6, 0xffe4a6, 0xc1f0c2]
      : [0xff5ca8, 0x50d0ff, 0xffd84d, 0x9d61ff];
    for (let i = 0; i < count; i++) {
      const col = palette[i % palette.length];
      this._createCylinder(x + i * 0.06, y + 0.38 * scale, z, 0.02, 0.02, 0.75 * scale, this.mats.white, false);
      this._createSphere(
        x + Math.cos(i * 1.8) * 0.12 * scale,
        y + 0.95 * scale + Math.sin(i) * 0.08,
        z + Math.sin(i * 1.4) * 0.12 * scale,
        0.18 * scale,
        new THREE.MeshStandardMaterial({ color: col, roughness: 0.22 }),
        true
      );
    }
  }

  _createBalloonArch(x, y, z, width = 3) {
    const steps = 15;
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      const px = x + (t - 0.5) * width;
      const py = y + 0.55 + Math.sin(t * Math.PI) * 1.6;
      this._createSphere(px, py, z, 0.18, new THREE.MeshStandardMaterial({ color: [0xff5ca8, 0x50d0ff, 0xffd84d, 0x9d61ff][i % 4], roughness: 0.25 }), true);
    }
  }

  _createBirthdayTable(x, y, z, w = 1.8) {
    this._createBox(x, y + 0.4, z, w, 0.8, 0.65, this.mats.wood, true);
    this._createBox(x, y + 0.82, z, w * 0.96, 0.08, 0.62, this.mats.pink, false);
  }

  _createCake(x, y, z, scale = 1) {
    this._createCylinder(x, y + 0.1 * scale, z, 0.22 * scale, 0.22 * scale, 0.2 * scale, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 }), true);
    this._createCylinder(x, y + 0.26 * scale, z, 0.18 * scale, 0.18 * scale, 0.14 * scale, new THREE.MeshStandardMaterial({ color: 0xff88cc, roughness: 0.4 }), true);
    this._createSphere(x, y + 0.4 * scale, z, 0.04 * scale, new THREE.MeshStandardMaterial({ color: 0xffdd66, emissive: 0xffdd66, emissiveIntensity: 0.5 }), true);
  }

  _createPartyHat(x, y, z, scale = 1) {
    this._createCylinder(x, y + 0.32 * scale, z, 0.0, 0.18 * scale, 0.6 * scale, new THREE.MeshStandardMaterial({ color: 0x7ac7ff, roughness: 0.5 }), true);
  }

  _createStreamer(x, y, z, count = 4) {
    for (let i = 0; i < count; i++) {
      this._createBox(x + i * 0.25, y - i * 0.08, z + Math.sin(i) * 0.2, 0.06, 0.8, 0.04, new THREE.MeshStandardMaterial({ color: [0xff5ca8, 0x50d0ff, 0xffd84d, 0x9d61ff][i % 4], roughness: 0.65 }), false, i * 0.3);
    }
  }

  _createBarn(x, y, z, w = 2.1, h = 1.8) {
    this._createBox(x, y + h / 2, z, w, h, 1.4, this.mats.red, true);
    this._createPlane(x, y + h * 0.55, z + 0.71, w * 0.86, h * 0.6, new THREE.MeshStandardMaterial({ color: 0x6d1111, roughness: 0.8 }), false);
    this._createBox(x, y + h * 0.7, z + 0.01, w * 0.45, h * 0.35, 0.08, this.mats.white, true);
    this._createBox(x, y + 0.45, z + 0.72, w * 0.7, 0.08, 0.08, this.mats.white, false);
  }

  _createCow(x, y, z, scale = 1) {
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.85 });
    const patchMat = this.mats.black;
    this._createBox(x, y + 0.42 * scale, z, 0.95 * scale, 0.7 * scale, 1.2 * scale, bodyMat, true);
    this._createBox(x + 0.55 * scale, y + 0.55 * scale, z + 0.15 * scale, 0.42 * scale, 0.4 * scale, 0.5 * scale, bodyMat, true);
    this._createSphere(x - 0.3 * scale, y + 0.76 * scale, z + 0.3 * scale, 0.08 * scale, bodyMat, true);
    this._createSphere(x + 0.12 * scale, y + 0.76 * scale, z + 0.3 * scale, 0.08 * scale, bodyMat, true);
    this._createBox(x + 0.18 * scale, y + 0.42 * scale, z - 0.14 * scale, 0.22 * scale, 0.18 * scale, 0.22 * scale, patchMat, true);
    this._createBox(x - 0.1 * scale, y + 0.36 * scale, z + 0.35 * scale, 0.18 * scale, 0.14 * scale, 0.18 * scale, patchMat, true);
  }

  _createHayStack(x, y, z, rows = 2) {
    const mat = this.mats.sand;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < 2; c++) {
        this._createBox(x + c * 0.56, y + 0.22 + r * 0.43, z + (r % 2) * 0.06, 0.5, 0.38, 0.46, mat, true);
      }
    }
  }

  _createFenceRow(x, z, count = 5, y = 0.7) {
    for (let i = 0; i < count; i++) {
      this._createBox(x + i * 0.58, y, z, 0.08, 0.55, 0.08, this.mats.white, true);
      this._createBox(x + i * 0.58, y + 0.22, z, 0.6, 0.06, 0.05, this.mats.white, false);
      this._createBox(x + i * 0.58, y + 0.42, z, 0.6, 0.06, 0.05, this.mats.white, false);
    }
  }

  _createSilo(x, y, z, h = 1.6) {
    this._createCylinder(x, y + h / 2, z, 0.45, 0.45, h, new THREE.MeshStandardMaterial({ color: 0xbec4c8, roughness: 0.35, metalness: 0.55 }), true);
    this._createCylinder(x, y + h + 0.18, z, 0.28, 0.3, 0.32, new THREE.MeshStandardMaterial({ color: 0xa9b1b8, roughness: 0.35, metalness: 0.55 }), true);
  }

  _createBarrel(x, y, z, scale = 1) {
    this._createCylinder(x, y + 0.34 * scale, z, 0.23 * scale, 0.28 * scale, 0.68 * scale, this.mats.darkWood, true);
    this._createBox(x, y + 0.34 * scale, z, 0.5 * scale, 0.04 * scale, 0.5 * scale, this.mats.gray, false);
  }

  _createWagonWheel(x, y, z, scale = 1) {
    this._createCylinder(x, y + 0.28 * scale, z, 0.22 * scale, 0.22 * scale, 0.08 * scale, new THREE.MeshStandardMaterial({ color: 0x6f482e, roughness: 0.8 }), true, Math.PI / 2);
    for (let i = 0; i < 6; i++) {
      this._createBox(
        x + Math.cos((Math.PI * 2 * i) / 6) * 0.15 * scale,
        y + 0.28 * scale,
        z + Math.sin((Math.PI * 2 * i) / 6) * 0.15 * scale,
        0.22 * scale,
        0.03 * scale,
        0.04 * scale,
        this.mats.gray,
        true,
        i * 0.5
      );
    }
  }

  _createFeedBucket(x, y, z, scale = 1) {
    this._createCylinder(x, y + 0.18 * scale, z, 0.1 * scale, 0.13 * scale, 0.28 * scale, new THREE.MeshStandardMaterial({ color: 0x8a9eb1, roughness: 0.55 }), true);
  }

  _createFrameWall(x, z) {
    this._createPlane(x, 1.5, z, 1.0, 0.7, new THREE.MeshStandardMaterial({ color: 0xe9cfd8, roughness: 0.75 }), false, Math.PI / 2, 0);
    this._createBox(x, 1.5, z + 0.01, 1.1, 0.05, 0.05, this.mats.white, false);
  }

  _createEasel(x, y, z, scale = 1) {
    const legMat = this.mats.wood;
    this._createCylinder(x - 0.12 * scale, y + 0.46 * scale, z, 0.03 * scale, 0.03 * scale, 0.9 * scale, legMat, true, 0, 0, 0.1);
    this._createCylinder(x + 0.12 * scale, y + 0.46 * scale, z, 0.03 * scale, 0.03 * scale, 0.9 * scale, legMat, true, 0, 0, -0.1);
    this._createCylinder(x, y + 0.54 * scale, z - 0.14 * scale, 0.03 * scale, 0.03 * scale, 0.9 * scale, legMat, true, 0.1, 0, 0);
    this._createPlane(x, y + 1.0 * scale, z + 0.02 * scale, 0.55 * scale, 0.75 * scale, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), false);
  }

  _createArtTable(x, y, z, w = 1.6, d = 0.7) {
    this._createBox(x, y + 0.42, z, w, 0.82, d, this.mats.wood, true);
    this._createBox(x, y + 0.83, z, w * 0.96, 0.07, d * 0.96, this.mats.white, false);
  }

  _createPaintBucket(x, y, z, scale = 1, color = 0xff6a4d) {
    this._createCylinder(x, y + 0.18 * scale, z, 0.12 * scale, 0.15 * scale, 0.3 * scale, new THREE.MeshStandardMaterial({ color, roughness: 0.6 }), true);
  }

  _createClaySculpture(x, y, z, scale = 1) {
    this._createSphere(x, y + 0.45 * scale, z, 0.22 * scale, new THREE.MeshStandardMaterial({ color: 0xb38b73, roughness: 1 }), true);
    this._createBox(x + 0.15 * scale, y + 0.2 * scale, z, 0.16 * scale, 0.4 * scale, 0.2 * scale, new THREE.MeshStandardMaterial({ color: 0xa3745e, roughness: 1 }), true, 0.2);
  }

  _createPaletteStack(x, y, z, count = 3) {
    for (let i = 0; i < count; i++) {
      this._createPlane(x + i * 0.2, y + 0.05, z + i * 0.08, 0.22, 0.14, new THREE.MeshStandardMaterial({ color: [0xffc84f, 0x50d0ff, 0xff6a4d][i % 3], roughness: 0.8 }), false, 0.4 * i, Math.PI / 2);
    }
  }

  _createPaintSplatDecals(x, z, count = 5) {
    for (let i = 0; i < count; i++) {
      this._createPlane(x + Math.cos(i) * 0.6, 0.03, z + Math.sin(i * 1.4) * 0.45, 0.35, 0.35, new THREE.MeshStandardMaterial({ color: [0xff6a4d, 0x4fa9ff, 0xffd84d, 0x7c5cff][i % 4], roughness: 1, transparent: true, opacity: 0.65 }), false, i * 0.3);
    }
  }

  _createCabinetRun(x, z, count = 3, height = 0.8) {
    for (let i = 0; i < count; i++) {
      this._createBox(x + i * 0.76, 0.4, z, 0.7, height, 0.58, this.mats.gray, true);
      this._createBox(x + i * 0.76, 0.82, z, 0.68, 0.05, 0.55, this.mats.white, false);
    }
  }

  _createSinkCounter(x, z) {
    this._createBox(x, 0.45, z, 1.5, 0.9, 0.65, this.mats.tile, true);
    this._createBox(x, 0.95, z, 0.5, 0.1, 0.45, this.mats.gray, false);
  }

  _createFridge(x, z, h = 1.45) {
    this._createBox(x, h / 2, z, 0.82, h, 0.72, new THREE.MeshStandardMaterial({ color: 0xf0f7fb, roughness: 0.3 }), true);
    this._createBox(x, h * 0.5, z + 0.36, 0.78, 0.04, 0.05, this.mats.gray, false);
  }

  _createOven(x, z, h = 1.0) {
    this._createBox(x, h / 2, z, 0.72, h, 0.62, new THREE.MeshStandardMaterial({ color: 0x454545, roughness: 0.55 }), true);
    this._createBox(x, h * 0.68, z + 0.31, 0.38, 0.15, 0.04, this.mats.black, false);
  }

  _createDiningTable(x, z, w = 1.8, d = 0.9) {
    this._createBox(x, 0.4, z, w, 0.8, d, this.mats.wood, true);
  }

  _createChair(x, z, scale = 1) {
    this._createBox(x, 0.22 * scale, z, 0.36 * scale, 0.44 * scale, 0.36 * scale, this.mats.darkWood, true);
    this._createBox(x, 0.58 * scale, z - 0.12 * scale, 0.36 * scale, 0.6 * scale, 0.06 * scale, this.mats.darkWood, true);
  }

  _createShelf(x, z, levels = 3, d = 0.45) {
    this._createBox(x, 0.9, z, 1.0, 1.8, d, this.mats.wood, true);
    for (let i = 0; i < levels; i++) {
      this._createBox(x, 0.24 + i * 0.46, z, 0.96, 0.05, d * 0.92, this.mats.gray, false);
    }
  }

  _createPot(x, y, z, scale = 1) {
    this._createCylinder(x, y + 0.16 * scale, z, 0.11 * scale, 0.15 * scale, 0.28 * scale, new THREE.MeshStandardMaterial({ color: 0x7b4e31, roughness: 0.9 }), true);
  }

  _createBoxStack(x, z, count = 4, color = 0xcbb68a) {
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.95 });
    for (let i = 0; i < count; i++) {
      this._createBox(x + (i % 2) * 0.56, 0.22 + Math.floor(i / 2) * 0.45, z, 0.5, 0.42, 0.45, mat, true);
    }
  }

  _createMatStrip(x, z, count = 3) {
    for (let i = 0; i < count; i++) {
      this._createBox(x + i * 0.6, 0.03, z, 0.52, 0.05, 1.6, new THREE.MeshStandardMaterial({ color: 0x163f7a, roughness: 1 }), true);
    }
  }

  _createBenchPress(x, z, scale = 1) {
    this._createBox(x, 0.12 * scale, z, 1.5 * scale, 0.12 * scale, 0.45 * scale, new THREE.MeshStandardMaterial({ color: 0x2c3350, roughness: 0.75 }), true);
    this._createBox(x, 0.48 * scale, z, 1.65 * scale, 0.08 * scale, 0.08 * scale, this.mats.gray, true);
    this._createCylinder(x - 0.82 * scale, 0.12 * scale, z, 0.12 * scale, 0.12 * scale, 0.2 * scale, this.mats.black, true, Math.PI / 2);
    this._createCylinder(x + 0.82 * scale, 0.12 * scale, z, 0.12 * scale, 0.12 * scale, 0.2 * scale, this.mats.black, true, Math.PI / 2);
  }

  _createDumbbellRack(x, z, count = 4) {
    for (let i = 0; i < count; i++) {
      this._createBox(x + i * 0.34, 0.15, z, 0.22, 0.12, 0.12, this.mats.gray, true);
      this._createCylinder(x + i * 0.34, 0.15, z, 0.06, 0.06, 0.3, this.mats.black, true, Math.PI / 2);
    }
  }

  _createExerciseBall(x, z, scale = 1, color = 0xff7a2f) {
    this._createSphere(x, scale * 0.36, z, 0.36 * scale, new THREE.MeshStandardMaterial({ color, roughness: 0.35 }), true);
  }

  _createRopeStack(x, z, scale = 1) {
    for (let i = 0; i < 4; i++) {
      this._createCylinder(x, 0.12 + i * 0.16, z, 0.04 * scale, 0.04 * scale, 0.28 * scale, new THREE.MeshStandardMaterial({ color: 0x8b6a4c, roughness: 1 }), true, 0.8, 0, i * 0.3);
    }
  }

  _createFoamBlockPile(x, z, count = 5) {
    const colors = [0x5fe1ff, 0x67d46d, 0xffd84d, 0xff7a93];
    for (let i = 0; i < count; i++) {
      this._createBox(x + (i % 2) * 0.45, 0.16 + Math.floor(i / 2) * 0.34, z + (i % 3) * 0.08, 0.4, 0.3, 0.4, new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: 0.85 }), true, i * 0.2);
    }
  }

  _createPullUpFrame(x, z, h = 1.6) {
    this._createBox(x, h / 2, z, 0.1, h, 1.2, this.mats.gray, true);
    this._createBox(x, h - 0.1, z, 1.2, 0.1, 0.08, this.mats.gray, true);
    this._createBox(x - 0.5, 0.2, z, 0.1, 0.4, 0.1, this.mats.gray, true);
    this._createBox(x + 0.5, 0.2, z, 0.1, 0.4, 0.1, this.mats.gray, true);
  }

  _createLocker(x, z, count = 4) {
    for (let i = 0; i < count; i++) {
      this._createBox(x, 0.9, z + i * 0.52, 0.8, 1.8, 0.45, this.mats.gray, true);
    }
  }

  _createBookshelf(x, z, rows = 3, h = 1.35, d = 0.35) {
    this._createBox(x, h / 2, z, 1.15, h, d, this.mats.wood, true);
    for (let i = 0; i < rows; i++) {
      this._createBox(x, 0.24 + i * 0.42, z, 1.1, 0.05, d * 0.92, this.mats.gray, false);
      for (let b = 0; b < 5; b++) {
        const colors = [0xff6a4d, 0x4fa9ff, 0xffd84d, 0x9d61ff, 0x4fd96f];
        this._createBox(x - 0.34 + b * 0.17, 0.14 + i * 0.42, z, 0.12, 0.24, 0.06, new THREE.MeshStandardMaterial({ color: colors[(i + b) % colors.length], roughness: 0.8 }), true, b * 0.1);
      }
    }
  }

  _createReadingTable(x, z, scale = 1) {
    this._createBox(x, 0.4 * scale, z, 1.2 * scale, 0.8 * scale, 0.8 * scale, this.mats.wood, true);
  }

  _createReadingLamp(x, z, scale = 1) {
    this._createCylinder(x, 0.45 * scale, z, 0.03 * scale, 0.03 * scale, 0.9 * scale, this.mats.gray, true);
    this._createSphere(x, 1.0 * scale, z, 0.08 * scale, new THREE.MeshStandardMaterial({ color: 0xffffe0, emissive: 0xffffc4, emissiveIntensity: 0.3 }), true);
  }

  _createBookStack(x, z, count = 4) {
    const colors = [0x7c4b3c, 0x4b6fbf, 0xd14f5a, 0x4fa96a];
    for (let i = 0; i < count; i++) {
      this._createBox(x + Math.cos(i) * 0.2, 0.06 + i * 0.08, z + Math.sin(i * 1.1) * 0.14, 0.28, 0.05, 0.18, new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: 0.7 }), true, i * 0.18);
    }
  }

  _createBookCart(x, z, scale = 1) {
    this._createBox(x, 0.25 * scale, z, 0.5 * scale, 0.5 * scale, 0.32 * scale, this.mats.gray, true);
    this._createBox(x, 0.5 * scale, z, 0.55 * scale, 0.04 * scale, 0.34 * scale, this.mats.gray, false);
  }

  _seedSpawnPoints() {
    this.spawnPoints = [
      new THREE.Vector3(-10.5, 0, -10.5),
      new THREE.Vector3(-3.5, 0, -10.5),
      new THREE.Vector3(3.5, 0, -10.5),
      new THREE.Vector3(10.5, 0, -10.5),
      new THREE.Vector3(-10.5, 0, -3.5),
      new THREE.Vector3(-3.5, 0, -3.5),
      new THREE.Vector3(3.5, 0, -3.5),
      new THREE.Vector3(10.5, 0, -3.5),
      new THREE.Vector3(0, 0, -7.0),
      new THREE.Vector3(0, 0, 0),
    ];
  }

  getSpawnPoint() {
    const p = this.spawnPoints[Math.floor(Math.random() * this.spawnPoints.length)];
    return p ? p.clone() : new THREE.Vector3(0, 0, 0);
  }

  updateCamera(controller, deltaSeconds = 1 / 60) {
    if (!controller) return;
    const target = controller.position;
    const yaw = controller.cameraYaw;
    const pitch = controller.cameraPitch;
    const mode = controller.cameraMode || 'third';

    const headY = controller.keys && controller.keys.crouch ? 1.15 : 1.52;
    const head = this._camLookTarget.set(target.x, target.y + headY, target.z);

    if (mode === 'first') {
      const lookDir = new THREE.Vector3(
        Math.sin(yaw) * Math.cos(pitch),
        Math.sin(pitch),
        Math.cos(yaw) * Math.cos(pitch)
      );
      const desired = head.clone().addScaledVector(lookDir, 1);
      this.camera.position.lerp(head, clamp(deltaSeconds * 18, 0.08, 1));
      this.camera.lookAt(desired);
      return;
    }

    const forward = new THREE.Vector3(
      Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      Math.cos(yaw) * Math.cos(pitch)
    ).normalize();
    const behind = forward.clone().multiplyScalar(-4.7);
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)).normalize();
    const desired = head.clone()
      .add(behind)
      .addScaledVector(right, 0.8)
      .addScaledVector(new THREE.Vector3(0, 1, 0), 0.55);

    const safe = this._resolveCameraCollision(head, desired);
    this.camera.position.lerp(safe, clamp(deltaSeconds * 14, 0.08, 1));
    this.camera.lookAt(head.x, head.y + 0.12, head.z);
  }

  _resolveCameraCollision(origin, desired) {
    const dir = desired.clone().sub(origin);
    const distance = dir.length();
    if (distance < 0.001) return desired.clone();
    dir.multiplyScalar(1 / distance);

    const offsets = [
      [0, 0],
      [0.18, 0],
      [-0.18, 0],
      [0, 0.16],
      [0, -0.12],
    ];
    let maxDist = distance;
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().subVectors(desired, origin).cross(up).normalize();
    for (const [ox, oy] of offsets) {
      const start = origin.clone().addScaledVector(right, ox).addScaledVector(up, oy);
      this._raycaster.set(start, dir);
      this._raycaster.far = distance;
      const hits = this._raycaster.intersectObjects(this.collisionProps, false);
      if (hits.length > 0) {
        maxDist = Math.min(maxDist, Math.max(0.2, hits[0].distance - 0.18));
      }
    }
    const safe = origin.clone().addScaledVector(dir, clamp(maxDist, 0.2, distance));
    safe.y = clamp(safe.y, 0.35, CEILING_Y - 0.35);
    return safe;
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
