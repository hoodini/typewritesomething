import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// Constants for the typewriter
const TYPEWRITER_COLOR = 0x2a2a2a; // Dark charcoal
const ACCENT_COLOR = 0x8b4513; // Saddle brown for wood accents
const METAL_COLOR = 0x4a4a4a; // Metallic gray
const KEY_COLOR = 0x1a1a1a; // Black keys

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

export class TypewriterScene3D {
  private scene: THREE.Scene;

  private camera: THREE.PerspectiveCamera;

  private renderer: THREE.WebGLRenderer;

  private container: HTMLElement;

  private animationId: number | null = null;

  private controls!: OrbitControls;

  // Typewriter components
  private typewriterBody!: THREE.Group;

  private platen!: THREE.Mesh; // The roller that holds the paper

  private paper!: THREE.Mesh;

  private paperCanvas!: HTMLCanvasElement;

  private paperTexture!: THREE.CanvasTexture;

  private paperCtx!: CanvasRenderingContext2D;

  private carriage!: THREE.Group;

  private typeBars: Map<string, TypeBar> = new Map();

  private keys: Map<string, THREE.Mesh> = new Map();

  // Paper state
  private paperPosition = { x: 50, y: 80 }; // Current typing position on paper

  private lineHeight = 24;

  private charWidth = 14;

  // Animation state
  private inkSplatters: InkSplatter[] = [];

  private carriageTargetX = 0;

  private carriageCurrentX = 0;

  // Audio
  private audioContext: AudioContext | null = null;

  constructor(containerId: string) {
    const el = document.getElementById(containerId);
    if (!el) throw new Error(`Container ${containerId} not found`);
    this.container = el;

    // Scene setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e); // Dark blue ambient

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      45,
      this.container.clientWidth / this.container.clientHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, 8, 12);
    this.camera.lookAt(0, 2, 0);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    });
    this.renderer.setSize(
      this.container.clientWidth,
      this.container.clientHeight
    );
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    // Orbit controls for camera rotation
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.target.set(0, 3, 0); // Focus on typewriter center
    this.controls.minDistance = 5;
    this.controls.maxDistance = 30;
    this.controls.maxPolarAngle = Math.PI / 2; // Don't go below the desk

    // Initialize
    this.setupLights();
    this.createTypewriter();
    this.setupEventListeners();

    // Start animation loop
    this.animate();
  }

  private setupLights(): void {
    // Ambient light for overall illumination
    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambient);

    // Main key light (warm desk lamp feel)
    const keyLight = new THREE.SpotLight(0xfff5e6, 1.5);
    keyLight.position.set(-5, 15, 10);
    keyLight.angle = Math.PI / 4;
    keyLight.penumbra = 0.5;
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    this.scene.add(keyLight);

    // Fill light
    const fillLight = new THREE.DirectionalLight(0xe6f0ff, 0.3);
    fillLight.position.set(5, 5, -5);
    this.scene.add(fillLight);

    // Rim light for drama
    const rimLight = new THREE.PointLight(0xff9966, 0.5);
    rimLight.position.set(-10, 5, -5);
    this.scene.add(rimLight);
  }

  private createTypewriter(): void {
    this.typewriterBody = new THREE.Group();

    // Main body (base)
    this.createBody();

    // Keyboard section
    this.createKeyboard();

    // Type bar basket (the semi-circular array of type bars)
    this.createTypeBarBasket();

    // Platen (roller) and carriage
    this.createPlatenAndCarriage();

    // Paper
    this.createPaper();

    // Decorative elements
    this.createDecorations();

    this.typewriterBody.position.y = 0;
    this.scene.add(this.typewriterBody);

    // Floor/desk surface
    const deskGeometry = new THREE.PlaneGeometry(30, 30);
    const deskMaterial = new THREE.MeshStandardMaterial({
      color: 0x3d2b1f,
      roughness: 0.8,
      metalness: 0.1,
    });
    const desk = new THREE.Mesh(deskGeometry, deskMaterial);
    desk.rotation.x = -Math.PI / 2;
    desk.position.y = -0.5;
    desk.receiveShadow = true;
    this.scene.add(desk);
  }

  private createBody(): void {
    // Main typewriter body - curved vintage design
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
      bevelSize: 0.1,
      bevelSegments: 3,
    };

    const bodyGeometry = new THREE.ExtrudeGeometry(bodyShape, extrudeSettings);
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: TYPEWRITER_COLOR,
      roughness: 0.3,
      metalness: 0.7,
    });

    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.rotation.x = -Math.PI / 2;
    body.position.set(0, 0, -3);
    body.castShadow = true;
    body.receiveShadow = true;
    this.typewriterBody.add(body);
  }

  private createKeyboard(): void {
    const keyboardGroup = new THREE.Group();

    // Key layout (QWERTY simplified)
    const rows = ['1234567890', 'QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];

    const keyGeometry = new THREE.CylinderGeometry(0.25, 0.28, 0.15, 16);
    const keyMaterial = new THREE.MeshStandardMaterial({
      color: KEY_COLOR,
      roughness: 0.4,
      metalness: 0.6,
    });

    rows.forEach((row, rowIndex) => {
      const rowOffset = rowIndex * 0.15; // Stagger offset
      const y = 3.2 - rowIndex * 0.1;
      const z = 2.5 - rowIndex * 0.6;

      for (let i = 0; i < row.length; i += 1) {
        const char = row[i];
        const x = (i - row.length / 2 + 0.5) * 0.55 + rowOffset * 0.3;

        const key = new THREE.Mesh(keyGeometry.clone(), keyMaterial.clone());
        key.position.set(x, y, z);
        key.rotation.x = (Math.PI / 8) * (rowIndex + 1);
        key.castShadow = true;

        // Add letter label on key (using a small plane with texture would be better)
        this.keys.set(char, key);
        keyboardGroup.add(key);
      }
    });

    // Space bar
    const spaceGeometry = new THREE.BoxGeometry(3, 0.15, 0.4);
    const spaceBar = new THREE.Mesh(spaceGeometry, keyMaterial.clone());
    spaceBar.position.set(0, 2.8, 4);
    spaceBar.rotation.x = Math.PI / 6;
    this.keys.set(' ', spaceBar);
    keyboardGroup.add(spaceBar);

    this.typewriterBody.add(keyboardGroup);
  }

  private createTypeBarBasket(): void {
    const basketGroup = new THREE.Group();

    // Characters for type bars
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const barCount = chars.length;
    const arcAngle = Math.PI * 0.7; // Arc span

    for (let i = 0; i < barCount; i += 1) {
      const char = chars[i];
      const angle = -arcAngle / 2 + (arcAngle * i) / (barCount - 1);

      // Pivot group for rotation animation
      const pivotGroup = new THREE.Group();
      pivotGroup.position.set(0, 3.5, -1);

      // Type bar arm
      const barGeometry = new THREE.BoxGeometry(0.08, 2.2, 0.05);
      const barMaterial = new THREE.MeshStandardMaterial({
        color: METAL_COLOR,
        roughness: 0.3,
        metalness: 0.8,
      });

      const bar = new THREE.Mesh(barGeometry, barMaterial);
      bar.position.y = 1.1; // Offset from pivot

      // Type slug (the letter at the end)
      const slugGeometry = new THREE.BoxGeometry(0.12, 0.2, 0.12);
      const slugMaterial = new THREE.MeshStandardMaterial({
        color: 0x666666,
        roughness: 0.2,
        metalness: 0.9,
      });
      const slug = new THREE.Mesh(slugGeometry, slugMaterial);
      slug.position.y = 2.2;

      pivotGroup.add(bar);
      pivotGroup.add(slug);

      // Position around the arc
      pivotGroup.rotation.z = angle;
      pivotGroup.rotation.x = Math.PI / 3; // Angle back at rest

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

    // Platen (the rubber roller)
    const platenGeometry = new THREE.CylinderGeometry(0.5, 0.5, 9, 32);
    const platenMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      roughness: 0.9,
      metalness: 0.1,
    });

    this.platen = new THREE.Mesh(platenGeometry, platenMaterial);
    this.platen.rotation.z = Math.PI / 2;
    this.platen.position.set(0, 5.5, -1.2);
    this.platen.castShadow = true;

    this.carriage.add(this.platen);

    // Platen knobs
    const knobGeometry = new THREE.CylinderGeometry(0.3, 0.35, 0.3, 16);
    const knobMaterial = new THREE.MeshStandardMaterial({
      color: ACCENT_COLOR,
      roughness: 0.6,
      metalness: 0.3,
    });

    const leftKnob = new THREE.Mesh(knobGeometry, knobMaterial);
    leftKnob.rotation.z = Math.PI / 2;
    leftKnob.position.set(-4.7, 5.5, -1.2);

    const rightKnob = new THREE.Mesh(knobGeometry, knobMaterial);
    rightKnob.rotation.z = Math.PI / 2;
    rightKnob.position.set(4.7, 5.5, -1.2);

    this.carriage.add(leftKnob);
    this.carriage.add(rightKnob);

    // Paper guide rails
    const railGeometry = new THREE.BoxGeometry(10, 0.1, 0.3);
    const railMaterial = new THREE.MeshStandardMaterial({
      color: METAL_COLOR,
      roughness: 0.3,
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
    // Create canvas for paper texture (where we draw the typed text)
    this.paperCanvas = document.createElement('canvas');
    this.paperCanvas.width = 512;
    this.paperCanvas.height = 640;
    this.paperCtx = this.paperCanvas.getContext('2d')!;

    // Initialize paper with slight texture
    this.clearPaper();

    // Create texture from canvas
    this.paperTexture = new THREE.CanvasTexture(this.paperCanvas);
    this.paperTexture.needsUpdate = true;

    // Paper mesh
    const paperGeometry = new THREE.PlaneGeometry(4, 5);
    const paperMaterial = new THREE.MeshStandardMaterial({
      map: this.paperTexture,
      roughness: 0.9,
      metalness: 0,
      side: THREE.DoubleSide,
    });

    this.paper = new THREE.Mesh(paperGeometry, paperMaterial);
    this.paper.position.set(0, 6.5, -1.2);
    this.paper.rotation.x = -Math.PI / 12; // Slight tilt following platen curve
    this.paper.castShadow = true;
    this.paper.receiveShadow = true;

    this.carriage.add(this.paper);
  }

  private clearPaper(): void {
    // Off-white paper background
    this.paperCtx.fillStyle = '#faf8f5';
    this.paperCtx.fillRect(
      0,
      0,
      this.paperCanvas.width,
      this.paperCanvas.height
    );

    // Add subtle paper texture
    const imageData = this.paperCtx.getImageData(
      0,
      0,
      this.paperCanvas.width,
      this.paperCanvas.height
    );
    const { data } = imageData;
    for (let i = 0; i < data.length; i += 4) {
      const noise = (Math.random() - 0.5) * 6;
      data[i] = Math.min(255, Math.max(245, data[i] + noise));
      data[i + 1] = Math.min(255, Math.max(245, data[i + 1] + noise));
      data[i + 2] = Math.min(255, Math.max(245, data[i + 2] + noise));
    }
    this.paperCtx.putImageData(imageData, 0, 0);

    // Reset typing position
    this.paperPosition = { x: 50, y: 80 };
  }

  private createDecorations(): void {
    // Brand name plate
    const plateGeometry = new THREE.BoxGeometry(2, 0.3, 0.05);
    const plateMaterial = new THREE.MeshStandardMaterial({
      color: 0xc4a35a,
      roughness: 0.3,
      metalness: 0.8,
    });
    const plate = new THREE.Mesh(plateGeometry, plateMaterial);
    plate.position.set(0, 3.3, 0.5);
    plate.rotation.x = Math.PI / 6;
    this.typewriterBody.add(plate);

    // Carriage return lever
    const leverGeometry = new THREE.CylinderGeometry(0.08, 0.08, 2, 8);
    const leverMaterial = new THREE.MeshStandardMaterial({
      color: METAL_COLOR,
      roughness: 0.3,
      metalness: 0.8,
    });
    const lever = new THREE.Mesh(leverGeometry, leverMaterial);
    lever.position.set(5.5, 5.5, -1.2);
    lever.rotation.z = Math.PI / 4;
    this.typewriterBody.add(lever);

    // Lever handle
    const handleGeometry = new THREE.SphereGeometry(0.2, 16, 16);
    const handleMaterial = new THREE.MeshStandardMaterial({
      color: ACCENT_COLOR,
      roughness: 0.5,
      metalness: 0.3,
    });
    const handle = new THREE.Mesh(handleGeometry, handleMaterial);
    handle.position.set(6.2, 6.2, -1.2);
    this.typewriterBody.add(handle);

    // Ribbon spools
    const spoolGeometry = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 16);
    const spoolMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      roughness: 0.7,
      metalness: 0.3,
    });

    const leftSpool = new THREE.Mesh(spoolGeometry, spoolMaterial);
    leftSpool.position.set(-1.5, 4.2, -0.8);
    this.typewriterBody.add(leftSpool);

    const rightSpool = new THREE.Mesh(spoolGeometry, spoolMaterial);
    rightSpool.position.set(1.5, 4.2, -0.8);
    this.typewriterBody.add(rightSpool);

    // Ink ribbon between spools
    const ribbonGeometry = new THREE.BoxGeometry(2.5, 0.02, 0.3);
    const ribbonMaterial = new THREE.MeshStandardMaterial({
      color: 0x0a0a0a,
      roughness: 0.9,
      metalness: 0,
    });
    const ribbon = new THREE.Mesh(ribbonGeometry, ribbonMaterial);
    ribbon.position.set(0, 4.2, -0.8);
    this.typewriterBody.add(ribbon);
  }

  private setupEventListeners(): void {
    // Handle window resize
    window.addEventListener('resize', () => {
      const width = this.container.clientWidth;
      const height = this.container.clientHeight;

      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);
    });
  }

  /**
   * Called when a key is pressed - triggers the type bar animation
   */
  public typeCharacter(char: string): void {
    const upperChar = char.toUpperCase();

    // Animate the key press
    const key = this.keys.get(upperChar) || this.keys.get(char);
    if (key) {
      this.animateKeyPress(key);
    }

    // Animate the type bar strike
    const typeBar = this.typeBars.get(upperChar);
    if (typeBar && !typeBar.isAnimating) {
      this.animateTypeBarStrike(typeBar, char);
    } else {
      // For characters without type bars (special chars, space)
      this.printCharacter(char);
    }

    // Play sound
    this.playTypeSound();
  }

  // eslint-disable-next-line class-methods-use-this
  private animateKeyPress(key: THREE.Mesh): void {
    const originalY = key.position.y;
    const pressDepth = 0.1;

    // Quick press down - mutating Three.js object position is intentional
    const pressDown = () => {
      // eslint-disable-next-line no-param-reassign
      key.position.y = originalY - pressDepth;
      setTimeout(() => {
        // eslint-disable-next-line no-param-reassign
        key.position.y = originalY;
      }, 80);
    };

    pressDown();
  }

  private animateTypeBarStrike(typeBar: TypeBar, char: string): void {
    // Animation state mutations are intentional for type bar animation
    // eslint-disable-next-line no-param-reassign
    typeBar.isAnimating = true;
    // eslint-disable-next-line no-param-reassign
    typeBar.targetRotation = -Math.PI / 6; // Strike position

    // After striking, print the character and return
    setTimeout(() => {
      this.printCharacter(char);

      // Ink splatter effect
      this.createInkSplatter(char);

      // Return to rest
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

    // Draw character on paper canvas
    this.paperCtx.fillStyle = '#150904';
    // Use Courier New as fallback - it's more universally available
    this.paperCtx.font = 'bold 18px "Courier New", Courier, monospace';
    this.paperCtx.textBaseline = 'top';

    // Add slight randomness for typewriter imperfection
    const offsetX = (Math.random() - 0.5) * 2;
    const offsetY = (Math.random() - 0.5) * 2;
    const rotation = (Math.random() - 0.5) * 0.05;

    this.paperCtx.save();
    this.paperCtx.translate(
      this.paperPosition.x + offsetX,
      this.paperPosition.y + offsetY
    );
    this.paperCtx.rotate(rotation);
    this.paperCtx.fillText(char, 0, 0);
    this.paperCtx.restore();

    // Debug: log that character was printed
    // console.log(`Printed: ${char} at (${this.paperPosition.x}, ${this.paperPosition.y})`);

    // Update texture
    this.paperTexture.needsUpdate = true;

    // Move typing position (carriage moves left, so position on paper moves right)
    this.paperPosition.x += this.charWidth;

    // Auto line wrap
    if (this.paperPosition.x > this.paperCanvas.width - 50) {
      this.handleNewline();
    }

    // Move carriage
    this.carriageTargetX -= 0.15;
    if (this.carriageTargetX < -3) {
      this.carriageTargetX = -3;
    }
  }

  private handleNewline(): void {
    this.paperPosition.x = 50;
    this.paperPosition.y += this.lineHeight;

    // Reset carriage position
    this.carriageTargetX = 0;

    // Scroll paper if needed
    if (this.paperPosition.y > this.paperCanvas.height - 50) {
      this.scrollPaper();
    }

    // Play carriage return sound
    this.playCarriageSound();
  }

  private scrollPaper(): void {
    // Get current paper content
    const imageData = this.paperCtx.getImageData(
      0,
      this.lineHeight * 2,
      this.paperCanvas.width,
      this.paperCanvas.height - this.lineHeight * 2
    );

    // Clear and redraw shifted up
    this.clearPaper();
    this.paperCtx.putImageData(imageData, 0, 0);

    // Reset position to continue typing
    this.paperPosition.y = this.paperCanvas.height - 100;
  }

  private createInkSplatter(char: string): void {
    // Create small ink dots around the character for realism
    const baseX = this.paperPosition.x;
    const baseY = this.paperPosition.y;

    this.paperCtx.fillStyle = 'rgba(21, 9, 4, 0.3)';

    for (let i = 0; i < 3; i += 1) {
      const splatterX = baseX + (Math.random() - 0.5) * 8;
      const splatterY = baseY + (Math.random() - 0.5) * 8;
      const size = Math.random() * 1.5 + 0.5;

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

    // Mechanical click sound
    oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(
      200,
      this.audioContext.currentTime + 0.05
    );

    gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(
      0.01,
      this.audioContext.currentTime + 0.05
    );

    oscillator.start(this.audioContext.currentTime);
    oscillator.stop(this.audioContext.currentTime + 0.05);
  }

  private playCarriageSound(): void {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
    }

    // Carriage return "ding" and slide sound
    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    // Bell "ding"
    oscillator.frequency.setValueAtTime(1200, this.audioContext.currentTime);
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(0.2, this.audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(
      0.01,
      this.audioContext.currentTime + 0.3
    );

    oscillator.start(this.audioContext.currentTime);
    oscillator.stop(this.audioContext.currentTime + 0.3);
  }

  /**
   * Handle backspace
   */
  public backspace(): void {
    this.paperPosition.x = Math.max(50, this.paperPosition.x - this.charWidth);
    this.carriageTargetX = Math.min(0, this.carriageTargetX + 0.15);
  }

  /**
   * Handle newline from external call
   */
  public newline(): void {
    this.handleNewline();
  }

  /**
   * Reset the paper
   */
  public reset(): void {
    this.clearPaper();
    this.paperTexture.needsUpdate = true;
    this.carriageTargetX = 0;
    this.carriageCurrentX = 0;
    this.carriage.position.x = 0;
  }

  /**
   * Main animation loop
   */
  private animate = (): void => {
    this.animationId = requestAnimationFrame(this.animate);

    // Animate type bars - forEach callback mutations are intentional
    this.typeBars.forEach((typeBar) => {
      if (typeBar.currentRotation !== typeBar.targetRotation) {
        const diff = typeBar.targetRotation - typeBar.currentRotation;
        // eslint-disable-next-line no-param-reassign
        typeBar.currentRotation += diff * 0.3;
        // eslint-disable-next-line no-param-reassign
        typeBar.pivotGroup.rotation.x = typeBar.currentRotation;
      }
    });

    // Animate carriage movement
    if (this.carriageCurrentX !== this.carriageTargetX) {
      const diff = this.carriageTargetX - this.carriageCurrentX;
      this.carriageCurrentX += diff * 0.1;
      this.carriage.position.x = this.carriageCurrentX;
    }

    // Update orbit controls
    this.controls.update();

    this.renderer.render(this.scene, this.camera);
  };

  /**
   * Cleanup
   */
  public dispose(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }

    this.controls.dispose();
    this.renderer.dispose();
    this.container.removeChild(this.renderer.domElement);

    if (this.audioContext) {
      this.audioContext.close();
    }
  }

  /**
   * Get the paper canvas for export
   */
  public getPaperCanvas(): HTMLCanvasElement {
    return this.paperCanvas;
  }
}
