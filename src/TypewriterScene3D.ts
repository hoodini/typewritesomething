import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

// ============================================
// DESIGN SYSTEM COLORS (from Figma)
// ============================================
const MATTE_GUNMETAL = 0x4b5052; // Typewriter body
const OXIDIZED_BRASS = 0x8a7c4f; // Accents
const FOREST_GREEN = 0x2a4b3a; // Enamel paint (housing option)
const BURGUNDY_LEATHER = 0x6b1e2f; // Alternate housing / ribbon

// Derived colors
const KEY_COLOR = 0x2a2a2a; // Dark key caps
const DESK_WOOD = 0x3d2b1f; // Dark wood desk

interface TypeBar {
  mesh: THREE.Mesh;
  character: string;
  pivotGroup: THREE.Group;
  isAnimating: boolean;
  targetRotation: number;
  currentRotation: number;
}

interface InkSplatter {
  position: THREE.Vector2;
  character: string;
  timestamp: number;
}

// Camera preset positions
interface CameraPreset {
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
}

// Vignette shader
const VignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    offset: { value: 1.0 },
    darkness: { value: 1.0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float offset;
    uniform float darkness;
    varying vec2 vUv;
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec2 uv = (vUv - vec2(0.5)) * vec2(offset);
      float vignette = 1.0 - dot(uv, uv);
      texel.rgb = mix(texel.rgb, texel.rgb * vignette, darkness);
      gl_FragColor = texel;
    }
  `,
};

// Color grading shader (warm shadows, lifted blacks)
const ColorGradingShader = {
  uniforms: {
    tDiffuse: { value: null },
    warmth: { value: 0.1 },
    liftBlacks: { value: 0.05 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float warmth;
    uniform float liftBlacks;
    varying vec2 vUv;
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      // Warm shadows
      texel.r += warmth * (1.0 - texel.r);
      texel.b -= warmth * 0.5 * texel.b;
      // Lift blacks
      texel.rgb = mix(vec3(liftBlacks), vec3(1.0), texel.rgb);
      gl_FragColor = texel;
    }
  `,
};

export class TypewriterScene3D {
  private scene: THREE.Scene;

  private camera: THREE.PerspectiveCamera;

  private renderer: THREE.WebGLRenderer;

  private composer!: EffectComposer;

  private container: HTMLElement;

  private animationId: number | null = null;

  private controls!: OrbitControls;

  // Typewriter components
  private typewriterBody!: THREE.Group;

  private platen!: THREE.Mesh;

  private paper!: THREE.Mesh;

  private paperCanvas!: HTMLCanvasElement;

  private paperTexture!: THREE.CanvasTexture;

  private paperCtx!: CanvasRenderingContext2D;

  private carriage!: THREE.Group;

  private typeBars: Map<string, TypeBar> = new Map();

  private keys: Map<string, THREE.Mesh> = new Map();

  // Paper state (doubled for 1024x1280 canvas)
  private paperPosition = { x: 100, y: 160 };

  private lineHeight = 48;

  private charWidth = 28;

  // Animation state
  private inkSplatters: InkSplatter[] = [];

  private carriageTargetX = 0;

  private carriageCurrentX = 0;

  // Camera presets
  private cameraPresets: Record<string, CameraPreset> = {
    default: {
      position: new THREE.Vector3(0, 10, 14),
      target: new THREE.Vector3(0, 4, 0),
      fov: 40,
    },
    focus: {
      position: new THREE.Vector3(0, 8, 6),
      target: new THREE.Vector3(0, 5.5, -1),
      fov: 35,
    },
    desk: {
      position: new THREE.Vector3(-8, 12, 16),
      target: new THREE.Vector3(0, 3, 0),
      fov: 50,
    },
  };

  // Audio
  private audioContext: AudioContext | null = null;

  // Ink density (0.7-1.0 for variation)
  private inkDensity = 1.0;

  constructor(containerId: string) {
    const el = document.getElementById(containerId);
    if (!el) throw new Error(`Container ${containerId} not found`);
    this.container = el;

    // Scene setup - clean bright studio look matching design system
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x2a2a2a); // Neutral dark gray, not black

    // Camera - cinematic 3/4 view
    const preset = this.cameraPresets.default;
    this.camera = new THREE.PerspectiveCamera(
      preset.fov,
      this.container.clientWidth / this.container.clientHeight,
      0.1,
      100
    );
    this.camera.position.copy(preset.position);
    this.camera.lookAt(preset.target);

    // Renderer with enhanced settings
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(
      this.container.clientWidth,
      this.container.clientHeight
    );
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0; // Balanced exposure
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.container.appendChild(this.renderer.domElement);

    // Setup post-processing
    this.setupPostProcessing();

    // Orbit controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.target.copy(preset.target);
    this.controls.minDistance = 5;
    this.controls.maxDistance = 25;
    this.controls.maxPolarAngle = Math.PI / 2;
    this.controls.enablePan = true;
    this.controls.enableZoom = true;
    this.controls.rotateSpeed = 0.5;
    this.controls.zoomSpeed = 0.8;
    // Disable right-click pan to allow context menu
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: undefined as unknown as THREE.MOUSE, // Allow right-click for context menu
    };

    // Mobile optimizations
    if (this.isMobileDevice()) {
      this.renderer.shadowMap.type = THREE.BasicShadowMap;
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    }

    // Initialize scene
    this.setupLights();
    this.createEnvironment();
    this.createTypewriter();
    this.setupEventListeners();

    // Start animation
    this.animate();
  }

  private setupPostProcessing(): void {
    this.composer = new EffectComposer(this.renderer);

    // Render pass
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    // Very subtle bloom for brass highlights only
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(
        this.container.clientWidth,
        this.container.clientHeight
      ),
      0.15, // strength - very subtle
      0.3, // radius
      0.9 // threshold - only bright highlights
    );
    this.composer.addPass(bloomPass);

    // Very subtle vignette - just a touch
    const vignettePass = new ShaderPass(VignetteShader);
    vignettePass.uniforms.offset.value = 1.2;
    vignettePass.uniforms.darkness.value = 0.2; // Much less dark
    this.composer.addPass(vignettePass);

    // Minimal color grading - almost none
    const colorGradingPass = new ShaderPass(ColorGradingShader);
    colorGradingPass.uniforms.warmth.value = 0.02; // Almost no warmth
    colorGradingPass.uniforms.liftBlacks.value = 0.01;
    this.composer.addPass(colorGradingPass);
  }

  private setupLights(): void {
    // Strong ambient light for overall brightness
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambient);

    // Hemisphere light - bright studio lighting
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8);
    this.scene.add(hemiLight);

    // Main key light - balanced white with slight warmth
    const keyLight = new THREE.DirectionalLight(0xfff8f0, 1.0);
    keyLight.position.set(-3, 12, 8);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.bias = -0.0001;
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 30;
    keyLight.shadow.camera.left = -10;
    keyLight.shadow.camera.right = 10;
    keyLight.shadow.camera.top = 10;
    keyLight.shadow.camera.bottom = -10;
    this.scene.add(keyLight);

    // Paper spotlight - gentle illumination on typing area
    const paperLight = new THREE.SpotLight(0xffffff, 0.8);
    paperLight.position.set(0, 10, 2);
    paperLight.target.position.set(0, 5.5, -1.2);
    paperLight.angle = Math.PI / 6;
    paperLight.penumbra = 0.5;
    paperLight.castShadow = false;
    this.scene.add(paperLight);
    this.scene.add(paperLight.target);

    // Fill light from the right - neutral
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.8);
    fillLight.position.set(5, 6, 10);
    this.scene.add(fillLight);

    // Rim light for brass highlights - slightly warm
    const rimLight = new THREE.DirectionalLight(0xfff0e0, 0.6);
    rimLight.position.set(-5, 5, -8);
    this.scene.add(rimLight);

    // Front fill for visibility
    const frontFill = new THREE.DirectionalLight(0xffffff, 0.5);
    frontFill.position.set(0, 5, 15);
    this.scene.add(frontFill);
  }

  private createEnvironment(): void {
    // Dark wooden desk with warm wood grain
    const deskGeometry = new THREE.PlaneGeometry(40, 40);
    const deskMaterial = new THREE.MeshStandardMaterial({
      color: DESK_WOOD,
      roughness: 0.75,
      metalness: 0.0,
    });
    const desk = new THREE.Mesh(deskGeometry, deskMaterial);
    desk.rotation.x = -Math.PI / 2;
    desk.position.y = -0.5;
    desk.receiveShadow = true;
    this.scene.add(desk);

    // Subtle desk edge highlight
    const deskEdgeGeometry = new THREE.BoxGeometry(12, 0.1, 8);
    const deskEdgeMaterial = new THREE.MeshStandardMaterial({
      color: 0x2a1f15,
      roughness: 0.8,
      metalness: 0.0,
    });
    const deskEdge = new THREE.Mesh(deskEdgeGeometry, deskEdgeMaterial);
    deskEdge.position.set(0, -0.45, 2);
    this.scene.add(deskEdge);
  }

  private createTypewriter(): void {
    this.typewriterBody = new THREE.Group();

    this.createBody();
    this.createKeyboard();
    this.createTypeBarBasket();
    this.createPlatenAndCarriage();
    this.createPaper();
    this.createDecorations();

    this.typewriterBody.position.y = 0;
    this.scene.add(this.typewriterBody);
  }

  private createBody(): void {
    // Main body - Forest Green enamel as per design system
    const bodyShape = new THREE.Shape();
    bodyShape.moveTo(-4, 0);
    bodyShape.quadraticCurveTo(-4.5, 1.5, -4, 3);
    bodyShape.lineTo(4, 3);
    bodyShape.quadraticCurveTo(4.5, 1.5, 4, 0);
    bodyShape.lineTo(-4, 0);

    const extrudeSettings = {
      steps: 1,
      depth: 6,
      bevelEnabled: true,
      bevelThickness: 0.2,
      bevelSize: 0.15,
      bevelSegments: 4,
    };

    const bodyGeometry = new THREE.ExtrudeGeometry(bodyShape, extrudeSettings);

    // Forest Green enamel - glossy with subtle orange peel
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: FOREST_GREEN,
      roughness: 0.2, // Glossy enamel
      metalness: 0.0,
    });

    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.rotation.x = -Math.PI / 2;
    body.position.set(0, 0, -3);
    body.castShadow = true;
    body.receiveShadow = true;
    this.typewriterBody.add(body);

    // Metal frame underneath - Matte Gunmetal
    const frameGeometry = new THREE.BoxGeometry(8.5, 0.3, 6.5);
    const frameMaterial = new THREE.MeshStandardMaterial({
      color: MATTE_GUNMETAL,
      roughness: 0.6,
      metalness: 0.9,
    });
    const frame = new THREE.Mesh(frameGeometry, frameMaterial);
    frame.position.set(0, -0.15, 0);
    frame.castShadow = true;
    this.typewriterBody.add(frame);
  }

  private createKeyboard(): void {
    const keyboardGroup = new THREE.Group();
    const rows = ['1234567890', 'QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];

    rows.forEach((row, rowIndex) => {
      const rowOffset = rowIndex * 0.12;
      const y = 3.1 - rowIndex * 0.15;
      const z = 2.2 - rowIndex * 0.55;

      for (let i = 0; i < row.length; i += 1) {
        const char = row[i];
        const x = (i - row.length / 2 + 0.5) * 0.52 + rowOffset * 0.25;

        const keyGroup = new THREE.Group();

        // Chrome/brass outer ring
        const ringGeometry = new THREE.TorusGeometry(0.22, 0.035, 12, 32);
        const ringMaterial = new THREE.MeshStandardMaterial({
          color: OXIDIZED_BRASS,
          roughness: 0.35,
          metalness: 0.85,
        });
        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
        ring.rotation.x = Math.PI / 2;
        keyGroup.add(ring);

        // Glass-like key cap with dark backing
        const keyGeometry = new THREE.CylinderGeometry(0.18, 0.19, 0.12, 24);
        const keyMaterial = new THREE.MeshStandardMaterial({
          color: KEY_COLOR,
          roughness: 0.4,
          metalness: 0.2,
          transparent: true,
          opacity: 0.95,
        });
        const key = new THREE.Mesh(keyGeometry, keyMaterial);
        key.position.y = -0.02;
        keyGroup.add(key);

        // Character label on key (using canvas texture)
        this.addKeyLabel(keyGroup, char);

        keyGroup.position.set(x, y, z);
        keyGroup.rotation.x = (Math.PI / 10) * (rowIndex + 1);
        keyGroup.castShadow = true;

        this.keys.set(char, key);
        keyboardGroup.add(keyGroup);
      }
    });

    // Space bar with brass frame
    const spaceGroup = new THREE.Group();

    const frameGeometry = new THREE.BoxGeometry(3.0, 0.06, 0.45);
    const frameMaterial = new THREE.MeshStandardMaterial({
      color: OXIDIZED_BRASS,
      roughness: 0.35,
      metalness: 0.85,
    });
    const spaceFrame = new THREE.Mesh(frameGeometry, frameMaterial);
    spaceGroup.add(spaceFrame);

    const spaceGeometry = new THREE.BoxGeometry(2.85, 0.1, 0.38);
    const spaceMaterial = new THREE.MeshStandardMaterial({
      color: KEY_COLOR,
      roughness: 0.5,
      metalness: 0.2,
    });
    const spaceBar = new THREE.Mesh(spaceGeometry, spaceMaterial);
    spaceBar.position.y = 0.02;
    spaceGroup.add(spaceBar);

    spaceGroup.position.set(0, 2.6, 3.5);
    spaceGroup.rotation.x = Math.PI / 8;
    this.keys.set(' ', spaceBar);
    keyboardGroup.add(spaceGroup);

    this.typewriterBody.add(keyboardGroup);
  }

  // eslint-disable-next-line class-methods-use-this
  private addKeyLabel(keyGroup: THREE.Group, char: string): void {
    // Create canvas for key label
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;

    // Transparent background
    ctx.clearRect(0, 0, 64, 64);

    // Draw character
    ctx.fillStyle = '#E8E0D0';
    ctx.font = 'bold 36px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(char, 32, 32);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    const labelGeometry = new THREE.PlaneGeometry(0.28, 0.28);
    const labelMaterial = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    });
    const label = new THREE.Mesh(labelGeometry, labelMaterial);
    label.position.y = 0.05;
    label.rotation.x = -Math.PI / 2;
    keyGroup.add(label);
  }

  private createTypeBarBasket(): void {
    const basketGroup = new THREE.Group();
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const barCount = chars.length;
    const arcAngle = Math.PI * 0.7;

    for (let i = 0; i < barCount; i += 1) {
      const char = chars[i];
      const angle = -arcAngle / 2 + (arcAngle * i) / (barCount - 1);

      const pivotGroup = new THREE.Group();
      pivotGroup.position.set(0, 3.5, -1);

      // Type bar arm - gunmetal
      const barGeometry = new THREE.BoxGeometry(0.06, 2.2, 0.04);
      const barMaterial = new THREE.MeshStandardMaterial({
        color: MATTE_GUNMETAL,
        roughness: 0.4,
        metalness: 0.85,
      });
      const bar = new THREE.Mesh(barGeometry, barMaterial);
      bar.position.y = 1.1;

      // Type slug with ink residue look
      const slugGeometry = new THREE.BoxGeometry(0.1, 0.18, 0.1);
      const slugMaterial = new THREE.MeshStandardMaterial({
        color: 0x4a4a4a,
        roughness: 0.3,
        metalness: 0.9,
      });
      const slug = new THREE.Mesh(slugGeometry, slugMaterial);
      slug.position.y = 2.2;

      pivotGroup.add(bar);
      pivotGroup.add(slug);
      pivotGroup.rotation.z = angle;
      pivotGroup.rotation.x = Math.PI / 3;

      this.typeBars.set(char, {
        mesh: bar,
        character: char,
        pivotGroup,
        isAnimating: false,
        targetRotation: Math.PI / 3,
        currentRotation: Math.PI / 3,
      });

      basketGroup.add(pivotGroup);
    }

    this.typewriterBody.add(basketGroup);
  }

  private createPlatenAndCarriage(): void {
    this.carriage = new THREE.Group();

    // Platen (rubber roller) - dark with slight wear
    const platenGeometry = new THREE.CylinderGeometry(0.5, 0.5, 9, 32);
    const platenMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      roughness: 0.85,
      metalness: 0.05,
    });
    this.platen = new THREE.Mesh(platenGeometry, platenMaterial);
    this.platen.rotation.z = Math.PI / 2;
    this.platen.position.set(0, 5.5, -1.2);
    this.platen.castShadow = true;
    this.carriage.add(this.platen);

    // Platen knobs - oxidized brass
    const knobGeometry = new THREE.CylinderGeometry(0.3, 0.35, 0.3, 16);
    const knobMaterial = new THREE.MeshStandardMaterial({
      color: OXIDIZED_BRASS,
      roughness: 0.45,
      metalness: 0.7,
    });

    const leftKnob = new THREE.Mesh(knobGeometry, knobMaterial);
    leftKnob.rotation.z = Math.PI / 2;
    leftKnob.position.set(-4.7, 5.5, -1.2);
    this.carriage.add(leftKnob);

    const rightKnob = new THREE.Mesh(knobGeometry, knobMaterial);
    rightKnob.rotation.z = Math.PI / 2;
    rightKnob.position.set(4.7, 5.5, -1.2);
    this.carriage.add(rightKnob);

    // Paper guide rails - brass
    const railGeometry = new THREE.BoxGeometry(10, 0.08, 0.25);
    const railMaterial = new THREE.MeshStandardMaterial({
      color: OXIDIZED_BRASS,
      roughness: 0.4,
      metalness: 0.8,
    });

    const frontRail = new THREE.Mesh(railGeometry, railMaterial);
    frontRail.position.set(0, 5.8, -0.6);
    this.carriage.add(frontRail);

    const backRail = new THREE.Mesh(railGeometry, railMaterial);
    backRail.position.set(0, 5.8, -1.8);
    this.carriage.add(backRail);

    this.typewriterBody.add(this.carriage);
  }

  private createPaper(): void {
    this.paperCanvas = document.createElement('canvas');
    this.paperCanvas.width = 1024;
    this.paperCanvas.height = 1280;
    this.paperCtx = this.paperCanvas.getContext('2d')!;

    this.clearPaper();

    this.paperTexture = new THREE.CanvasTexture(this.paperCanvas);
    this.paperTexture.needsUpdate = true;

    // Paper with subtle fiber texture
    const paperGeometry = new THREE.PlaneGeometry(4, 5);
    const paperMaterial = new THREE.MeshStandardMaterial({
      map: this.paperTexture,
      side: THREE.FrontSide,
      roughness: 0.8,
      metalness: 0.0,
    });

    this.paper = new THREE.Mesh(paperGeometry, paperMaterial);
    this.paper.position.set(0, 6.5, -1.0);
    this.paper.rotation.x = -Math.PI / 15;
    this.carriage.add(this.paper);
  }

  private clearPaper(): void {
    // Aged cream paper - #F2E8C9
    this.paperCtx.fillStyle = '#F2E8C9';
    this.paperCtx.fillRect(
      0,
      0,
      this.paperCanvas.width,
      this.paperCanvas.height
    );

    // Add fiber texture noise
    const imageData = this.paperCtx.getImageData(
      0,
      0,
      this.paperCanvas.width,
      this.paperCanvas.height
    );
    const { data } = imageData;
    for (let i = 0; i < data.length; i += 4) {
      const noise = (Math.random() - 0.5) * 10;
      data[i] = Math.min(248, Math.max(230, data[i] + noise));
      data[i + 1] = Math.min(238, Math.max(220, data[i + 1] + noise));
      data[i + 2] = Math.min(210, Math.max(185, data[i + 2] + noise));
    }
    this.paperCtx.putImageData(imageData, 0, 0);

    this.paperPosition = { x: 50, y: 80 };
  }

  private createDecorations(): void {
    // Brand plate - oxidized brass
    const plateGeometry = new THREE.BoxGeometry(2.2, 0.35, 0.04);
    const plateMaterial = new THREE.MeshStandardMaterial({
      color: OXIDIZED_BRASS,
      roughness: 0.4,
      metalness: 0.75,
    });
    const plate = new THREE.Mesh(plateGeometry, plateMaterial);
    plate.position.set(0, 3.3, 0.5);
    plate.rotation.x = Math.PI / 6;
    plate.castShadow = true;
    this.typewriterBody.add(plate);

    // Carriage return lever
    const leverGroup = new THREE.Group();

    const leverGeometry = new THREE.CylinderGeometry(0.05, 0.05, 1.5, 8);
    const leverMaterial = new THREE.MeshStandardMaterial({
      color: MATTE_GUNMETAL,
      roughness: 0.4,
      metalness: 0.85,
    });
    const lever = new THREE.Mesh(leverGeometry, leverMaterial);
    lever.rotation.z = Math.PI / 3;
    lever.position.set(-0.5, 0.5, 0);

    const handleGeometry = new THREE.SphereGeometry(0.14, 16, 16);
    const handleMaterial = new THREE.MeshStandardMaterial({
      color: OXIDIZED_BRASS,
      roughness: 0.45,
      metalness: 0.7,
    });
    const handle = new THREE.Mesh(handleGeometry, handleMaterial);
    handle.position.set(-1.1, 0.9, 0);

    leverGroup.add(lever);
    leverGroup.add(handle);
    leverGroup.position.set(-4.5, 5.5, -1.2);
    this.carriage.add(leverGroup);

    // Ribbon spools with burgundy red ribbon
    const spoolGeometry = new THREE.CylinderGeometry(0.35, 0.35, 0.25, 16);
    const spoolMaterial = new THREE.MeshStandardMaterial({
      color: KEY_COLOR,
      roughness: 0.6,
      metalness: 0.3,
    });

    const leftSpool = new THREE.Mesh(spoolGeometry, spoolMaterial);
    leftSpool.position.set(-1.5, 4.2, -0.8);
    this.typewriterBody.add(leftSpool);

    const rightSpool = new THREE.Mesh(spoolGeometry, spoolMaterial);
    rightSpool.position.set(1.5, 4.2, -0.8);
    this.typewriterBody.add(rightSpool);

    // Red ribbon wrap
    const ribbonWrapGeometry = new THREE.CylinderGeometry(0.28, 0.28, 0.22, 16);
    const ribbonWrapMaterial = new THREE.MeshStandardMaterial({
      color: BURGUNDY_LEATHER,
      roughness: 0.75,
      metalness: 0.05,
    });

    const leftRibbon = new THREE.Mesh(ribbonWrapGeometry, ribbonWrapMaterial);
    leftRibbon.position.set(-1.5, 4.2, -0.8);
    this.typewriterBody.add(leftRibbon);

    const rightRibbon = new THREE.Mesh(ribbonWrapGeometry, ribbonWrapMaterial);
    rightRibbon.position.set(1.5, 4.2, -0.8);
    this.typewriterBody.add(rightRibbon);

    // Ribbon between spools
    const ribbonGeometry = new THREE.BoxGeometry(2.5, 0.015, 0.22);
    const ribbonMaterial = new THREE.MeshStandardMaterial({
      color: BURGUNDY_LEATHER,
      roughness: 0.85,
      metalness: 0,
    });
    const ribbon = new THREE.Mesh(ribbonGeometry, ribbonMaterial);
    ribbon.position.set(0, 4.2, -0.8);
    this.typewriterBody.add(ribbon);

    // Margin bell (hidden, decorative)
    const bellGeometry = new THREE.SphereGeometry(
      0.15,
      16,
      12,
      0,
      Math.PI * 2,
      0,
      Math.PI / 2
    );
    const bellMaterial = new THREE.MeshStandardMaterial({
      color: OXIDIZED_BRASS,
      roughness: 0.3,
      metalness: 0.8,
    });
    const bell = new THREE.Mesh(bellGeometry, bellMaterial);
    bell.position.set(3.8, 5.3, -1.2);
    bell.rotation.x = Math.PI;
    this.typewriterBody.add(bell);
  }

  // eslint-disable-next-line class-methods-use-this
  private isMobileDevice(): boolean {
    return (
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      ) || window.innerWidth < 768
    );
  }

  private contextMenuCallback: ((e: MouseEvent) => void) | null = null;

  private setupEventListeners(): void {
    window.addEventListener('resize', () => {
      const width = this.container.clientWidth;
      const height = this.container.clientHeight;

      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);
      this.composer.setSize(width, height);
    });

    this.renderer.domElement.addEventListener('contextmenu', (e) => {
      if (this.contextMenuCallback) {
        e.preventDefault();
        this.contextMenuCallback(e);
      }
    });

    // Camera preset shortcuts - use F1, F2, F3 to avoid conflict with typing
    window.addEventListener('keydown', (e) => {
      if (e.key === 'F1' && !e.repeat) {
        e.preventDefault();
        this.setCameraPreset('default');
      }
      if (e.key === 'F2' && !e.repeat) {
        e.preventDefault();
        this.setCameraPreset('focus');
      }
      if (e.key === 'F3' && !e.repeat) {
        e.preventDefault();
        this.setCameraPreset('desk');
      }
    });
  }

  public setCameraPreset(presetName: string): void {
    const preset = this.cameraPresets[presetName];
    if (!preset) return;

    // Animate camera transition
    const startPos = this.camera.position.clone();
    const startTarget = this.controls.target.clone();
    const startFov = this.camera.fov;

    const duration = 800;
    const startTime = performance.now();

    const animateCamera = () => {
      const elapsed = performance.now() - startTime;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - (1 - t) ** 3; // easeOutCubic

      this.camera.position.lerpVectors(startPos, preset.position, eased);
      this.controls.target.lerpVectors(startTarget, preset.target, eased);
      this.camera.fov = startFov + (preset.fov - startFov) * eased;
      this.camera.updateProjectionMatrix();

      if (t < 1) {
        requestAnimationFrame(animateCamera);
      }
    };

    animateCamera();
  }

  public onContextMenu(callback: (e: MouseEvent) => void): void {
    this.contextMenuCallback = callback;
  }

  public typeCharacter(char: string): void {
    const upperChar = char.toUpperCase();

    const key = this.keys.get(upperChar) || this.keys.get(char);
    if (key) {
      this.animateKeyPress(key);
    }

    const typeBar = this.typeBars.get(upperChar);
    if (typeBar && !typeBar.isAnimating) {
      this.animateTypeBarStrike(typeBar, char);
    } else {
      this.printCharacter(char);
    }

    this.playTypeSound();
  }

  // eslint-disable-next-line class-methods-use-this
  private animateKeyPress(key: THREE.Mesh): void {
    const originalY = key.position.y;
    const pressDepth = 0.08;

    // eslint-disable-next-line no-param-reassign
    key.position.y = originalY - pressDepth;
    setTimeout(() => {
      // eslint-disable-next-line no-param-reassign
      key.position.y = originalY;
    }, 80);
  }

  private animateTypeBarStrike(typeBar: TypeBar, char: string): void {
    // eslint-disable-next-line no-param-reassign
    typeBar.isAnimating = true;
    // eslint-disable-next-line no-param-reassign
    typeBar.targetRotation = -Math.PI / 6;

    setTimeout(() => {
      this.printCharacter(char);
      this.createInkSplatter(char);
      // eslint-disable-next-line no-param-reassign
      typeBar.targetRotation = Math.PI / 3;

      setTimeout(() => {
        // eslint-disable-next-line no-param-reassign
        typeBar.isAnimating = false;
      }, 100);
    }, 50);
  }

  private printCharacter(char: string): void {
    if (char === '\n' || char === 'Enter') {
      this.handleNewline();
      return;
    }

    // Variable ink density (0.7-1.0)
    this.inkDensity = 0.7 + Math.random() * 0.3;
    const alpha = Math.floor(this.inkDensity * 255)
      .toString(16)
      .padStart(2, '0');
    this.paperCtx.fillStyle = `#150904${alpha}`;

    // Prestige Elite style (using Courier New as fallback) - 36px for 1024x1280 canvas
    this.paperCtx.font = 'bold 36px "Courier New", Courier, monospace';
    this.paperCtx.textBaseline = 'top';

    // Typewriter imperfections (doubled for larger canvas)
    const offsetX = (Math.random() - 0.5) * 5;
    const offsetY = (Math.random() - 0.5) * 4;
    const rotation = (Math.random() - 0.5) * 0.06;

    this.paperCtx.save();
    this.paperCtx.translate(
      this.paperPosition.x + offsetX,
      this.paperPosition.y + offsetY
    );
    this.paperCtx.rotate(rotation);
    this.paperCtx.fillText(char, 0, 0);

    // Occasional double-strike ghost (5% chance)
    if (Math.random() < 0.05) {
      this.paperCtx.fillStyle = `#15090420`;
      this.paperCtx.fillText(char, 1, 1);
    }

    this.paperCtx.restore();

    this.paperTexture.needsUpdate = true;
    this.paperPosition.x += this.charWidth;

    if (this.paperPosition.x > this.paperCanvas.width - 100) {
      this.handleNewline();
    }

    this.carriageTargetX -= 0.15;
    if (this.carriageTargetX < -3) {
      this.carriageTargetX = -3;
    }
  }

  private handleNewline(): void {
    this.paperPosition.x = 100;
    this.paperPosition.y += this.lineHeight;
    this.carriageTargetX = 0;

    if (this.paperPosition.y > this.paperCanvas.height - 100) {
      this.scrollPaper();
    }

    this.playCarriageSound();
  }

  private scrollPaper(): void {
    const imageData = this.paperCtx.getImageData(
      0,
      this.lineHeight * 2,
      this.paperCanvas.width,
      this.paperCanvas.height - this.lineHeight * 2
    );
    this.clearPaper();
    this.paperCtx.putImageData(imageData, 0, 0);
    this.paperPosition.y = this.paperCanvas.height - 200;
  }

  private createInkSplatter(char: string): void {
    const baseX = this.paperPosition.x;
    const baseY = this.paperPosition.y;

    this.paperCtx.fillStyle = 'rgba(21, 9, 4, 0.2)';

    for (let i = 0; i < 2; i += 1) {
      const splatterX = baseX + (Math.random() - 0.5) * 6;
      const splatterY = baseY + (Math.random() - 0.5) * 6;
      const size = Math.random() * 1.2 + 0.3;

      this.paperCtx.beginPath();
      this.paperCtx.arc(splatterX, splatterY, size, 0, Math.PI * 2);
      this.paperCtx.fill();
    }

    this.inkSplatters.push({
      position: new THREE.Vector2(baseX, baseY),
      character: char,
      timestamp: Date.now(),
    });

    this.paperTexture.needsUpdate = true;
  }

  private playTypeSound(): void {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
    }

    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    oscillator.frequency.setValueAtTime(
      800 + Math.random() * 200,
      this.audioContext.currentTime
    );
    oscillator.frequency.exponentialRampToValueAtTime(
      200,
      this.audioContext.currentTime + 0.04
    );

    gainNode.gain.setValueAtTime(0.25, this.audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(
      0.01,
      this.audioContext.currentTime + 0.04
    );

    oscillator.start(this.audioContext.currentTime);
    oscillator.stop(this.audioContext.currentTime + 0.04);
  }

  private playCarriageSound(): void {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
    }

    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    oscillator.frequency.setValueAtTime(1200, this.audioContext.currentTime);
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(0.15, this.audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(
      0.01,
      this.audioContext.currentTime + 0.25
    );

    oscillator.start(this.audioContext.currentTime);
    oscillator.stop(this.audioContext.currentTime + 0.25);
  }

  public backspace(): void {
    this.paperPosition.x = Math.max(50, this.paperPosition.x - this.charWidth);
    this.carriageTargetX = Math.min(0, this.carriageTargetX + 0.15);
  }

  public newline(): void {
    this.handleNewline();
  }

  public reset(): void {
    this.clearPaper();
    this.paperTexture.needsUpdate = true;
    this.carriageTargetX = 0;
    this.carriageCurrentX = 0;
    this.carriage.position.x = 0;
  }

  private animate = (): void => {
    this.animationId = requestAnimationFrame(this.animate);

    // Animate type bars
    this.typeBars.forEach((typeBar) => {
      if (typeBar.currentRotation !== typeBar.targetRotation) {
        const diff = typeBar.targetRotation - typeBar.currentRotation;
        // eslint-disable-next-line no-param-reassign
        typeBar.currentRotation += diff * 0.3;
        // eslint-disable-next-line no-param-reassign
        typeBar.pivotGroup.rotation.x = typeBar.currentRotation;
      }
    });

    // Animate carriage
    if (this.carriageCurrentX !== this.carriageTargetX) {
      const diff = this.carriageTargetX - this.carriageCurrentX;
      this.carriageCurrentX += diff * 0.1;
      this.carriage.position.x = this.carriageCurrentX;
    }

    this.controls.update();

    // Render with post-processing
    this.composer.render();
  };

  public dispose(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }

    this.controls.dispose();
    this.renderer.dispose();
    this.composer.dispose();
    this.container.removeChild(this.renderer.domElement);

    if (this.audioContext) {
      this.audioContext.close();
    }
  }

  public getPaperCanvas(): HTMLCanvasElement {
    return this.paperCanvas;
  }
}
