import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { renderArtwork, type ArtworkSpec, type FrameStyle } from './artworks';
import type { Exhibition } from './store';

const ROOM = { width: 18, depth: 28, height: 5.4 };
const EYE_HEIGHT = 1.68;
const PLAYER_RADIUS = 0.42;

interface GalleryOptions {
  canvas: HTMLCanvasElement;
  minimap: HTMLCanvasElement;
  exhibition: Exhibition;
  onHover: (art: ArtworkSpec | null, x: number, y: number) => void;
  onSelect: (art: ArtworkSpec) => void;
}

interface Pose {
  position: THREE.Vector3;
  yaw: number;
  pitch: number;
}

interface Tween {
  fromPosition: THREE.Vector3;
  toPosition: THREE.Vector3;
  fromYaw: number;
  toYaw: number;
  fromPitch: number;
  toPitch: number;
  elapsed: number;
  duration: number;
  onDone?: () => void;
}

interface Bench {
  x: number;
  z: number;
  halfX: number;
  halfZ: number;
}

interface ArtworkObject {
  group: THREE.Group;
  spotlight: THREE.SpotLight;
  fixture: THREE.Mesh;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpAngle(a: number, b: number, t: number): number {
  let delta = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return a + delta * t;
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

const FRAME_COLORS: Record<
  FrameStyle,
  { color: number; roughness: number; metalness: number }
> = {
  walnut: { color: 0x35241a, roughness: 0.58, metalness: 0.05 },
  black: { color: 0x121115, roughness: 0.46, metalness: 0.16 },
  brass: { color: 0x9d7a3f, roughness: 0.34, metalness: 0.82 },
  ivory: { color: 0xded3c1, roughness: 0.62, metalness: 0.02 },
};

function makeFloorTexture(): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#2b2824';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 90; i += 1) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 30 + Math.random() * 240;
    const light = Math.random() > 0.5;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
    gradient.addColorStop(0, light ? 'rgba(120,108,92,0.08)' : 'rgba(0,0,0,0.12)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  for (let i = 0; i < 2400; i += 1) {
    const shade = Math.random();
    ctx.fillStyle =
      shade > 0.5
        ? `rgba(255,245,225,${Math.random() * 0.03})`
        : `rgba(0,0,0,${Math.random() * 0.05})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 1.4, 1.4);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 5);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function makeShadowTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.08,
    size / 2,
    size / 2,
    size * 0.5,
  );
  gradient.addColorStop(0, 'rgba(0,0,0,0.55)');
  gradient.addColorStop(0.55, 'rgba(0,0,0,0.22)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function textTexture(
  draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => void,
  width: number,
  height: number,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, width, height);
  draw(ctx, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

export class Gallery {
  private readonly canvas: HTMLCanvasElement;
  private readonly minimap: HTMLCanvasElement;
  private readonly onHover: GalleryOptions['onHover'];
  private readonly onSelect: GalleryOptions['onSelect'];

  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly clock = new THREE.Clock();
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly interactive: THREE.Object3D[] = [];
  private readonly artGroups = new Map<string, THREE.Group>();
  private readonly artworkObjects = new Map<string, ArtworkObject>();
  private readonly benches: Bench[] = [];
  private exhibition: Exhibition;
  private artworks: ArtworkSpec[] = [];
  private artworkById = new Map<string, ArtworkSpec>();
  private sign: THREE.Mesh | null = null;

  private readonly keys = new Set<string>();
  private moveInput = { x: 0, y: 0 };

  private yaw = 0;
  private pitch = 0;
  private bobPhase = 0;
  private enabled = false;
  private hoveredId: string | null = null;
  private focusedId: string | null = null;
  private savedPose: Pose | null = null;
  private tween: Tween | null = null;

  private dragging = false;
  private pointerId: number | null = null;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private dragDistance = 0;

  private readonly tmpForward = new THREE.Vector3();
  private readonly tmpRight = new THREE.Vector3();
  private readonly tmpDirection = new THREE.Vector3();

  constructor(options: GalleryOptions) {
    this.canvas = options.canvas;
    this.minimap = options.minimap;
    this.onHover = options.onHover;
    this.onSelect = options.onSelect;
    this.exhibition = options.exhibition;
    this.artworks = options.exhibition.artworks.slice();
    this.artworkById = new Map(this.artworks.map((art) => [art.id, art]));

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0908);
    this.scene.fog = new THREE.FogExp2(0x0a0908, 0.013);

    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.08,
      120,
    );
    this.applyProjection();
    this.camera.position.set(0, EYE_HEIGHT, 11.6);
    this.camera.rotation.order = 'YXZ';

    this.setupEnvironment();
    this.buildRoom();
    this.buildArtworks();
    this.buildSignage();
    this.buildBenches();
    this.bindEvents();

    this.renderer.setAnimationLoop(this.animate);
  }

  private setupEnvironment(): void {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const environment = new RoomEnvironment();
    const envTexture = pmrem.fromScene(environment, 0.04).texture;
    this.scene.environment = envTexture;
    this.scene.environmentIntensity = 0.45;
    environment.dispose();
    pmrem.dispose();
  }

  private buildRoom(): void {
    const wallMaterial = new THREE.MeshStandardMaterial({
      color: 0xe7e2d9,
      roughness: 0.93,
      metalness: 0,
    });
    const darkTrim = new THREE.MeshStandardMaterial({
      color: 0x1a1816,
      roughness: 0.5,
      metalness: 0.2,
    });

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(ROOM.width, ROOM.depth),
      new THREE.MeshStandardMaterial({
        map: makeFloorTexture(),
        color: 0xbdb6aa,
        roughness: 0.34,
        metalness: 0.12,
        envMapIntensity: 0.5,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(ROOM.width, ROOM.depth),
      new THREE.MeshStandardMaterial({
        color: 0x161514,
        roughness: 0.96,
        metalness: 0,
      }),
    );
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = ROOM.height;
    this.scene.add(ceiling);

    const leftWall = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, ROOM.height, ROOM.depth),
      wallMaterial,
    );
    leftWall.position.set(-ROOM.width / 2 - 0.1, ROOM.height / 2, 0);
    leftWall.receiveShadow = true;
    this.scene.add(leftWall);

    const rightWall = leftWall.clone();
    rightWall.position.x = ROOM.width / 2 + 0.1;
    this.scene.add(rightWall);

    const backWall = new THREE.Mesh(
      new THREE.BoxGeometry(ROOM.width, ROOM.height, 0.2),
      wallMaterial,
    );
    backWall.position.set(0, ROOM.height / 2, -ROOM.depth / 2 - 0.1);
    backWall.receiveShadow = true;
    this.scene.add(backWall);

    const frontWall = backWall.clone();
    frontWall.position.z = ROOM.depth / 2 + 0.1;
    this.scene.add(frontWall);

    const baseboardGeometry = new THREE.BoxGeometry(1, 0.14, 0.035);
    const runs: Array<{ position: THREE.Vector3; rotation: number; length: number }> = [
      {
        position: new THREE.Vector3(-ROOM.width / 2 + 0.02, 0.07, 0),
        rotation: Math.PI / 2,
        length: ROOM.depth,
      },
      {
        position: new THREE.Vector3(ROOM.width / 2 - 0.02, 0.07, 0),
        rotation: Math.PI / 2,
        length: ROOM.depth,
      },
      {
        position: new THREE.Vector3(0, 0.07, -ROOM.depth / 2 + 0.02),
        rotation: 0,
        length: ROOM.width,
      },
      {
        position: new THREE.Vector3(0, 0.07, ROOM.depth / 2 - 0.02),
        rotation: 0,
        length: ROOM.width,
      },
    ];
    for (const run of runs) {
      const board = new THREE.Mesh(baseboardGeometry, darkTrim);
      board.scale.x = run.length;
      board.position.copy(run.position);
      board.rotation.y = run.rotation;
      this.scene.add(board);
    }

    const lightMaterial = new THREE.MeshStandardMaterial({
      color: 0xfff4e2,
      emissive: 0xffe8c8,
      emissiveIntensity: 3.2,
      roughness: 1,
    });
    for (const x of [-4.6, 4.6]) {
      for (const z of [-8.5, 0.5, 9.5]) {
        const panel = new THREE.Mesh(
          new THREE.BoxGeometry(0.34, 0.045, 4.2),
          lightMaterial,
        );
        panel.position.set(x, ROOM.height - 0.035, z);
        this.scene.add(panel);
      }
    }

    const fillPositions: Array<[number, number, number]> = [
      [-4.6, 4.75, -8.5],
      [4.6, 4.75, -8.5],
      [-4.6, 4.75, 0.5],
      [4.6, 4.75, 0.5],
      [-4.6, 4.75, 9.5],
      [4.6, 4.75, 9.5],
    ];
    for (const [x, y, z] of fillPositions) {
      const light = new THREE.PointLight(0xffe9cd, 9, 13, 1.7);
      light.position.set(x, y, z);
      this.scene.add(light);
    }

    this.scene.add(new THREE.AmbientLight(0xfff6ea, 0.4));
    const hemisphere = new THREE.HemisphereLight(0xfff2e0, 0x2c251d, 0.42);
    this.scene.add(hemisphere);
  }

  private createArtworkTexture(art: ArtworkSpec): THREE.Texture {
    const anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    if (art.image) {
      const texture = new THREE.TextureLoader().load(
        art.image,
        (loaded) => {
          loaded.colorSpace = THREE.SRGBColorSpace;
          loaded.anisotropy = anisotropy;
          loaded.needsUpdate = true;
        },
        undefined,
        () => {
          texture.image = renderArtwork(art) as unknown as HTMLImageElement;
          texture.needsUpdate = true;
        },
      );
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = anisotropy;
      return texture;
    }

    const texture = new THREE.CanvasTexture(renderArtwork(art));
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = anisotropy;
    return texture;
  }

  private disposeObject(root: THREE.Object3D): void {
    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry?.dispose();
      const material = mesh.material as THREE.Material & { map?: THREE.Texture | null };
      if (Array.isArray(material)) {
        for (const item of material as Array<THREE.Material & { map?: THREE.Texture | null }>) {
          item.map?.dispose();
          item.dispose();
        }
      } else if (material) {
        material.map?.dispose();
        material.dispose();
      }
    });
  }

  private clearArtworks(): void {
    for (const item of this.artworkObjects.values()) {
      this.scene.remove(item.group);
      this.disposeObject(item.group);
      this.scene.remove(item.spotlight);
      this.scene.remove(item.spotlight.target);
      item.spotlight.dispose();
      this.scene.remove(item.fixture);
      this.disposeObject(item.fixture);
    }
    this.artworkObjects.clear();
    this.artGroups.clear();
    this.interactive.length = 0;
  }

  private clearSignage(): void {
    if (!this.sign) return;
    this.scene.remove(this.sign);
    this.disposeObject(this.sign);
    this.sign = null;
  }

  private buildArtworks(): void {
    for (const [index, art] of this.artworks.entries()) {
      const texture = this.createArtworkTexture(art);

      const group = new THREE.Group();
      const frameSpec = FRAME_COLORS[art.frame];
      const frameMaterial = new THREE.MeshStandardMaterial({
        color: frameSpec.color,
        roughness: frameSpec.roughness,
        metalness: frameSpec.metalness,
      });

      const frame = new THREE.Mesh(
        new THREE.BoxGeometry(art.width + 0.16, art.height + 0.16, 0.1),
        frameMaterial,
      );
      frame.position.z = 0.05;
      frame.castShadow = true;
      frame.receiveShadow = true;
      frame.userData.art = art;
      group.add(frame);
      this.interactive.push(frame);

      const matboard = new THREE.Mesh(
        new THREE.PlaneGeometry(art.width + 0.07, art.height + 0.07),
        new THREE.MeshStandardMaterial({
          color: 0xece7dc,
          roughness: 0.9,
        }),
      );
      matboard.position.z = 0.101;
      group.add(matboard);

      const artMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(art.width, art.height),
        new THREE.MeshStandardMaterial({
          map: texture,
          roughness: 0.78,
          metalness: 0.01,
          envMapIntensity: 0.25,
        }),
      );
      artMesh.position.z = 0.106;
      artMesh.userData.art = art;
      group.add(artMesh);
      this.interactive.push(artMesh);

      const plaqueTexture = textTexture(
        (ctx, width, height) => {
          ctx.fillStyle = 'rgba(16, 14, 12, 0.94)';
          ctx.fillRect(0, 0, width, height);
          ctx.strokeStyle = 'rgba(201, 165, 91, 0.55)';
          ctx.lineWidth = 4;
          ctx.strokeRect(3, 3, width - 6, height - 6);
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = '#efe7d8';
          ctx.font = '600 32px Inter, sans-serif';
          ctx.fillText(art.title.toUpperCase(), width / 2, height * 0.38, width - 44);
          ctx.fillStyle = 'rgba(239, 231, 216, 0.62)';
          ctx.font = '400 23px Inter, sans-serif';
          ctx.fillText(`${art.artist} · ${art.year}`, width / 2, height * 0.7, width - 44);
        },
        512,
        160,
      );

      const plaque = new THREE.Mesh(
        new THREE.PlaneGeometry(0.5, 0.156),
        new THREE.MeshBasicMaterial({
          map: plaqueTexture,
          transparent: true,
          toneMapped: false,
        }),
      );
      plaque.position.set(art.width / 2 - 0.25, -art.height / 2 - 0.235, 0.04);
      group.add(plaque);

      const normal = new THREE.Vector3(0, 0, 1);
      let x = 0;
      let z = 0;
      if (art.wall === 'left') {
        x = -ROOM.width / 2 + 0.005;
        z = art.at;
        group.rotation.y = Math.PI / 2;
      } else if (art.wall === 'right') {
        x = ROOM.width / 2 - 0.005;
        z = art.at;
        group.rotation.y = -Math.PI / 2;
      } else {
        x = art.at;
        z = -ROOM.depth / 2 + 0.005;
      }

      group.position.set(x, 2.15, z);
      normal.applyQuaternion(group.quaternion);
      this.scene.add(group);
      this.artGroups.set(art.id, group);

      const target = new THREE.Vector3(x, 2.1, z);
      const spotPosition = target.clone().addScaledVector(normal, 2.5);
      spotPosition.y = ROOM.height - 0.42;

      const spotlight = new THREE.SpotLight(0xffeccf, 88, 13, 0.5, 0.9, 1.5);
      spotlight.position.copy(spotPosition);
      spotlight.target.position.copy(target);
      spotlight.castShadow = index % 4 === 1;
      if (spotlight.castShadow) {
        spotlight.shadow.mapSize.set(1024, 1024);
        spotlight.shadow.bias = -0.0006;
        spotlight.shadow.normalBias = 0.02;
        spotlight.shadow.camera.near = 0.4;
        spotlight.shadow.camera.far = 13;
      }
      this.scene.add(spotlight);
      this.scene.add(spotlight.target);

      const fixture = new THREE.Mesh(
        new THREE.CylinderGeometry(0.055, 0.075, 0.3, 16),
        new THREE.MeshStandardMaterial({
          color: 0x141312,
          roughness: 0.35,
          metalness: 0.7,
        }),
      );
      fixture.position.copy(spotPosition);
      fixture.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        this.tmpDirection.copy(target).sub(spotPosition).normalize(),
      );
      this.scene.add(fixture);

      this.artworkObjects.set(art.id, { group, spotlight, fixture });
    }
  }

  private buildSignage(): void {
    this.clearSignage();
    const { title, artist, hall } = this.exhibition.settings;
    const texture = textTexture(
      (ctx, width, height) => {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#2a2620';
        ctx.font = '300 156px Fraunces, Georgia, serif';
        ctx.fillText(title.toUpperCase(), width / 2, height * 0.4, width - 160);

        ctx.strokeStyle = 'rgba(154, 112, 48, 0.9)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(width / 2 - 220, height * 0.66);
        ctx.lineTo(width / 2 + 220, height * 0.66);
        ctx.stroke();

        ctx.fillStyle = 'rgba(42, 38, 32, 0.58)';
        ctx.font = '400 40px Inter, sans-serif';
        ctx.fillText(
          `${artist.toUpperCase()}  ·  ${hall.toUpperCase()}`,
          width / 2,
          height * 0.8,
          width - 200,
        );
      },
      2048,
      512,
    );

    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(9.6, 2.4),
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        toneMapped: false,
      }),
    );
    sign.position.set(0, 4.32, -ROOM.depth / 2 + 0.02);
    this.scene.add(sign);
    this.sign = sign;
  }

  setExhibition(exhibition: Exhibition): void {
    this.focusedId = null;
    this.savedPose = null;
    this.tween = null;
    this.setHovered(null);
    this.clearArtworks();
    this.exhibition = exhibition;
    this.artworks = exhibition.artworks.slice();
    this.artworkById = new Map(this.artworks.map((art) => [art.id, art]));
    this.buildArtworks();
    this.buildSignage();
  }

  private buildBenches(): void {
    const wood = new THREE.MeshStandardMaterial({
      color: 0x4a3527,
      roughness: 0.55,
      metalness: 0.08,
    });
    const steel = new THREE.MeshStandardMaterial({
      color: 0x191817,
      roughness: 0.35,
      metalness: 0.7,
    });
    const shadowTexture = makeShadowTexture();

    for (const [x, z] of [
      [-4.1, 6.2],
      [4.1, -2.4],
    ] as Array<[number, number]>) {
      const group = new THREE.Group();

      const seat = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.16, 0.78), wood);
      seat.position.y = 0.46;
      seat.castShadow = true;
      seat.receiveShadow = true;
      group.add(seat);

      for (const side of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.44, 0.62), steel);
        leg.position.set(side * 1.08, 0.22, 0);
        leg.castShadow = true;
        group.add(leg);
      }

      group.position.set(x, 0, z);
      this.scene.add(group);

      const shadow = new THREE.Mesh(
        new THREE.PlaneGeometry(3.6, 1.5),
        new THREE.MeshBasicMaterial({
          map: shadowTexture,
          transparent: true,
          depthWrite: false,
          opacity: 0.9,
        }),
      );
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.set(x, 0.006, z);
      this.scene.add(shadow);

      this.benches.push({ x, z, halfX: 1.5, halfZ: 0.42 });
    }
  }

  private bindEvents(): void {
    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
    this.canvas.addEventListener('pointermove', this.handlePointerMove);
    this.canvas.addEventListener('pointerup', this.handlePointerUp);
    this.canvas.addEventListener('pointercancel', this.handlePointerUp);
    this.canvas.addEventListener('pointerleave', this.handlePointerLeave);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('blur', this.handleBlur);
  }

  private handlePointerDown = (event: PointerEvent): void => {
    if (!this.enabled || this.isLocked() || event.button > 0) return;
    this.dragging = true;
    this.pointerId = event.pointerId;
    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;
    this.dragDistance = 0;
    this.setHovered(null);
    this.canvas.setPointerCapture(event.pointerId);
    this.canvas.classList.add('is-dragging');
  };

  private handlePointerMove = (event: PointerEvent): void => {
    if (this.dragging && event.pointerId === this.pointerId) {
      const dx = event.clientX - this.lastPointerX;
      const dy = event.clientY - this.lastPointerY;
      this.lastPointerX = event.clientX;
      this.lastPointerY = event.clientY;
      this.dragDistance += Math.abs(dx) + Math.abs(dy);

      const sensitivity = event.pointerType === 'touch' ? 0.0045 : 0.0031;
      this.yaw -= dx * sensitivity;
      this.pitch = clamp(this.pitch - dy * sensitivity * 0.82, -1.12, 1.12);
      return;
    }

    if (!this.enabled || this.isLocked()) return;
    this.updateHover(event.clientX, event.clientY);
  };

  private handlePointerUp = (event: PointerEvent): void => {
    if (!this.dragging || event.pointerId !== this.pointerId) return;
    this.dragging = false;
    this.pointerId = null;
    this.canvas.classList.remove('is-dragging');
    if (this.canvas.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId);
    }

    if (!this.enabled || this.isLocked()) return;
    if (this.dragDistance < 8) {
      const art = this.pickArtwork(event.clientX, event.clientY);
      if (art) {
        this.setHovered(null);
        this.onSelect(art);
      }
    }
  };

  private handlePointerLeave = (): void => {
    if (!this.dragging) this.setHovered(null);
  };

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.enabled) return;
    const code = event.code;
    if (
      code === 'KeyW' ||
      code === 'KeyA' ||
      code === 'KeyS' ||
      code === 'KeyD' ||
      code === 'ArrowUp' ||
      code === 'ArrowDown' ||
      code === 'ArrowLeft' ||
      code === 'ArrowRight' ||
      code === 'ShiftLeft' ||
      code === 'ShiftRight'
    ) {
      this.keys.add(code);
      if (code.startsWith('Arrow')) event.preventDefault();
    }
  };

  private handleKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
  };

  private handleBlur = (): void => {
    this.keys.clear();
    this.moveInput = { x: 0, y: 0 };
    this.dragging = false;
  };

  private applyProjection(): void {
    const aspect = window.innerWidth / window.innerHeight;
    this.camera.aspect = aspect;
    this.camera.fov = aspect < 0.85 ? 76 : 60;
    this.camera.updateProjectionMatrix();
  }

  private handleResize = (): void => {
    this.applyProjection();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
  };

  private updateHover(clientX: number, clientY: number): void {
    const art = this.pickArtwork(clientX, clientY);
    const nextId = art?.id ?? null;
    if (nextId !== this.hoveredId) {
      this.setHovered(nextId);
    }
    if (art) this.onHover(art, clientX, clientY);
  }

  private pickArtwork(clientX: number, clientY: number): ArtworkSpec | null {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.interactive, false);
    if (hits.length === 0) return null;
    return (hits[0].object.userData.art as ArtworkSpec | undefined) ?? null;
  }

  private setHovered(id: string | null): void {
    if (id === this.hoveredId) return;
    this.hoveredId = id;
    this.canvas.classList.toggle('is-hovering-art', id !== null);
    if (!id) this.onHover(null, 0, 0);
  }

  private isLocked(): boolean {
    return this.focusedId !== null || this.tween !== null;
  }

  setMoveInput(x: number, y: number): void {
    this.moveInput.x = clamp(x, -1, 1);
    this.moveInput.y = clamp(y, -1, 1);
  }

  enable(): void {
    this.enabled = true;
    this.clock.getDelta();
  }

  disable(): void {
    this.enabled = false;
    this.keys.clear();
    this.setHovered(null);
  }

  focus(id: string): void {
    const art = this.artworkById.get(id);
    const group = this.artGroups.get(id);
    if (!art || !group) return;

    if (!this.savedPose) {
      this.savedPose = {
        position: this.camera.position.clone(),
        yaw: this.yaw,
        pitch: this.pitch,
      };
    }
    this.focusedId = id;
    this.setHovered(null);

    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(group.quaternion);
    const portraitFactor = this.camera.aspect < 0.85 ? 1.35 : 1;
    const distance = clamp(art.width * 1.45 + 1.5, 3, 5.2) * portraitFactor;
    const target = new THREE.Vector3(group.position.x, 2.12, group.position.z);
    const cameraPosition = target
      .clone()
      .addScaledVector(normal, distance)
      .setY(2.0);

    const direction = target.clone().sub(cameraPosition).normalize();
    const targetYaw = Math.atan2(-direction.x, -direction.z);
    const targetPitch = Math.asin(clamp(direction.y, -1, 1));

    this.startTween(
      cameraPosition,
      targetYaw,
      targetPitch,
      0.95,
      undefined,
    );
  }

  unfocus(): void {
    if (!this.savedPose || !this.focusedId) return;
    const pose = this.savedPose;
    this.savedPose = null;
    this.startTween(pose.position.clone(), pose.yaw, pose.pitch, 0.9, () => {
      this.focusedId = null;
      this.camera.position.y = EYE_HEIGHT;
    });
  }

  private startTween(
    position: THREE.Vector3,
    yaw: number,
    pitch: number,
    duration: number,
    onDone?: () => void,
  ): void {
    this.tween = {
      fromPosition: this.camera.position.clone(),
      toPosition: position.clone(),
      fromYaw: this.yaw,
      toYaw: yaw,
      fromPitch: this.pitch,
      toPitch: pitch,
      elapsed: 0,
      duration,
      onDone,
    };
  }

  private updateTween(dt: number): void {
    const tween = this.tween;
    if (!tween) return;
    tween.elapsed = Math.min(tween.duration, tween.elapsed + dt);
    const t = easeInOutCubic(tween.elapsed / tween.duration);
    this.camera.position.lerpVectors(tween.fromPosition, tween.toPosition, t);
    this.yaw = lerpAngle(tween.fromYaw, tween.toYaw, t);
    this.pitch = lerp(tween.fromPitch, tween.toPitch, t);
    if (tween.elapsed >= tween.duration) {
      this.tween = null;
      tween.onDone?.();
    }
  }

  private updateMovement(dt: number): void {
    const forwardInput =
      (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0) -
      (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0) +
      this.moveInput.y;
    const strafeInput =
      (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0) -
      (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0) +
      this.moveInput.x;

    let forward = clamp(forwardInput, -1, 1);
    let strafe = clamp(strafeInput, -1, 1);
    const magnitude = Math.hypot(forward, strafe);
    if (magnitude > 1) {
      forward /= magnitude;
      strafe /= magnitude;
    }

    this.tmpForward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.tmpRight.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    const running = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    const speed = running ? 5.1 : 3.1;
    const moving = magnitude > 0.01;

    if (moving) {
      this.camera.position.addScaledVector(this.tmpForward, forward * speed * dt);
      this.camera.position.addScaledVector(this.tmpRight, strafe * speed * dt);
      this.bobPhase += dt * (running ? 1.35 : 1);
    }

    const limitX = ROOM.width / 2 - 0.55;
    const limitZ = ROOM.depth / 2 - 0.55;
    this.camera.position.x = clamp(this.camera.position.x, -limitX, limitX);
    this.camera.position.z = clamp(this.camera.position.z, -limitZ, limitZ);
    this.resolveCollisions();

    this.camera.position.y = EYE_HEIGHT + (moving ? Math.sin(this.bobPhase * 9) * 0.011 : 0);
  }

  private resolveCollisions(): void {
    for (const bench of this.benches) {
      const dx = this.camera.position.x - bench.x;
      const dz = this.camera.position.z - bench.z;
      const overlapX = bench.halfX + PLAYER_RADIUS - Math.abs(dx);
      const overlapZ = bench.halfZ + PLAYER_RADIUS - Math.abs(dz);
      if (overlapX > 0 && overlapZ > 0) {
        if (overlapX < overlapZ) {
          this.camera.position.x += Math.sign(dx || 1) * overlapX;
        } else {
          this.camera.position.z += Math.sign(dz || 1) * overlapZ;
        }
      }
    }
  }

  private updateHoverAnimation(dt: number): void {
    const lerpFactor = Math.min(1, dt * 10);
    for (const [id, group] of this.artGroups) {
      const target = id === this.hoveredId ? 1.022 : 1;
      const scale = lerp(group.scale.x, target, lerpFactor);
      group.scale.setScalar(scale);
    }
  }

  private drawMinimap(): void {
    const ctx = this.minimap.getContext('2d');
    if (!ctx) return;
    const width = this.minimap.width;
    const height = this.minimap.height;
    ctx.clearRect(0, 0, width, height);

    const margin = 20;
    const scale = Math.min(
      (width - margin * 2) / ROOM.width,
      (height - margin * 2) / ROOM.depth,
    );
    const roomWidth = ROOM.width * scale;
    const roomHeight = ROOM.depth * scale;
    const originX = (width - roomWidth) / 2;
    const originY = (height - roomHeight) / 2;

    const mapX = (x: number) => originX + (x + ROOM.width / 2) * scale;
    const mapZ = (z: number) => originY + (z + ROOM.depth / 2) * scale;

    ctx.fillStyle = 'rgba(12, 11, 10, 0.66)';
    ctx.strokeStyle = 'rgba(236, 226, 208, 0.28)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(originX, originY, roomWidth, roomHeight, 8);
    ctx.fill();
    ctx.stroke();

    for (const art of this.artworks) {
      let x = 0;
      let z = 0;
      if (art.wall === 'left') {
        x = -ROOM.width / 2;
        z = art.at;
      } else if (art.wall === 'right') {
        x = ROOM.width / 2;
        z = art.at;
      } else {
        x = art.at;
        z = -ROOM.depth / 2;
      }
      const isFocus = art.id === this.focusedId || art.id === this.hoveredId;
      ctx.beginPath();
      ctx.arc(mapX(x), mapZ(z), isFocus ? 8 : 5, 0, Math.PI * 2);
      ctx.fillStyle = isFocus ? '#d9b877' : 'rgba(217, 184, 119, 0.5)';
      ctx.fill();
    }

    const px = mapX(this.camera.position.x);
    const pz = mapZ(this.camera.position.z);
    const direction = this.tmpDirection.set(0, 0, -1).applyEuler(this.camera.rotation);
    const angle = Math.atan2(direction.x, -direction.z);

    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.lineTo(7, 8);
    ctx.lineTo(0, 4);
    ctx.lineTo(-7, 8);
    ctx.closePath();
    ctx.fillStyle = '#f2eadb';
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = 'rgba(242, 234, 219, 0.4)';
    ctx.font = '600 18px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(this.exhibition.settings.title.toUpperCase(), width / 2, height - 10, width - 24);
  }

  private animate = (): void => {
    const rawDt = this.clock.getDelta();
    const dt = Math.min(rawDt, 0.05);

    if (this.tween) {
      this.updateTween(Math.min(rawDt, 0.25));
    } else if (this.enabled && !this.focusedId) {
      this.updateMovement(dt);
    } else {
      this.camera.position.y = Math.max(this.camera.position.y, EYE_HEIGHT - 0.2);
    }

    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    this.updateHoverAnimation(dt);
    this.renderer.render(this.scene, this.camera);
    this.drawMinimap();
  };
}
