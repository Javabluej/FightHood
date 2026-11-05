import * as THREE from 'three';
import { StageDefinition, StageId } from '../types';

export const STAGE_DEFINITIONS: Record<StageId, StageDefinition> = {
  sansad: {
    id: 'sansad',
    name: 'SANSAD BHAVAN',
    subtitle: 'Parliament at sunset',
    theme: {
      skyTop: 0x1b2b3a,
      skyMid: 0xe8701c,
      skyBottom: 0xffd673,
      fog: 0xe9a066,
      fogNear: 28,
      fogFar: 75,
      ground: 0x8a6a4a,
      platformSide: 0x8c3b1e,
      sunColor: 0xffe8cf,
      sunIntensity: 2.6,
      sunPos: [-6, 12, 9],
      hemiSky: 0xfff0d8,
      hemiGround: 0x817366,
      hemiIntensity: 1.25,
      sunDisc: [-30, 9, -80],
      sunDiscColor: 0xfff0a4,
      exposure: 1.05,
      floorRoughness: 0.62,
    },
  },
  jantar: {
    id: 'jantar',
    name: 'JANTAR MANTAR',
    subtitle: 'Protest ground, New Delhi',
    theme: {
      skyTop: 0x2f6f84,
      skyMid: 0x93c0da,
      skyBottom: 0xf2dfc0,
      fog: 0xd8caa2,
      fogNear: 35,
      fogFar: 110,
      ground: 0x5d8a5a,
      platformSide: 0xa8463a,
      sunColor: 0xfff198,
      sunIntensity: 2.8,
      sunPos: [7, 16, 10],
      hemiSky: 0xdceeff,
      hemiGround: 0x6b5326,
      hemiIntensity: 1.2,
      sunDisc: [25, 12, -75],
      sunDiscColor: 0xfffce0,
      exposure: 1.0,
      floorRoughness: 0.75,
    },
  },
  road: {
    id: 'road',
    name: 'DESI SADAK',
    subtitle: 'Gali, thela aur traffic',
    theme: {
      skyTop: 0x181824,
      skyMid: 0x6e3c28,
      skyBottom: 0xdb8848,
      fog: 0xaa5c32,
      fogNear: 24,
      fogFar: 70,
      ground: 0x333338,
      platformSide: 0x555555,
      sunColor: 0xff9944,
      sunIntensity: 2.4,
      sunPos: [0, 10, 8],
      hemiSky: 0xffaa66,
      hemiGround: 0x222222,
      hemiIntensity: 1.1,
      sunDisc: [0, 6, -65],
      sunDiscColor: 0xffaa55,
      exposure: 1.1,
      floorRoughness: 0.85,
    },
  },
};

export class StageRenderer {
  public scene: THREE.Scene;
  public group: THREE.Group;
  public currentStageId: StageId = 'sansad';
  private builtStage: StageId | null = null;

  // Lighting & Environment
  private dirLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private skyMesh: THREE.Mesh;
  private floorMesh: THREE.Mesh;
  private sunDiscMesh: THREE.Mesh;

  // Visual effects
  private crowdGroup: THREE.Group;
  private flags: Array<{ mesh: THREE.Mesh; basePositions: Float32Array; phase: number }> = [];
  private cameraFlashes: Array<{ sprite: THREE.Sprite; life: number }> = [];
  private stageSpecificGroup: THREE.Group;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.scene.add(this.group);

    // Directional Sunlight with Shadows
    this.dirLight = new THREE.DirectionalLight(0xffffff, 2.5);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.width = 2048;
    this.dirLight.shadow.mapSize.height = 2048;
    this.dirLight.shadow.bias = -0.00015;
    this.dirLight.shadow.normalBias = 0.025;
    this.dirLight.shadow.camera.near = 0.5;
    this.dirLight.shadow.camera.far = 50;
    this.dirLight.shadow.camera.left = -10;
    this.dirLight.shadow.camera.right = 10;
    this.dirLight.shadow.camera.top = 10;
    this.dirLight.shadow.camera.bottom = -2;
    this.group.add(this.dirLight);

    // Ambient Hemisphere Light
    this.hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
    this.group.add(this.hemiLight);
    // Soft front fill preserves skin/fabric detail on either facing direction.
    const fill = new THREE.DirectionalLight(0xe6efff, 1.1);
    fill.position.set(0, 4, 8);
    this.group.add(fill);

    // Sky Dome with Gradient Shader
    const skyGeo = new THREE.SphereGeometry(120, 32, 16);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        topColor: { value: new THREE.Color() },
        midColor: { value: new THREE.Color() },
        bottomColor: { value: new THREE.Color() },
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPos.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 midColor;
        uniform vec3 bottomColor;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition).y;
          vec3 col = h > 0.0 
            ? mix(midColor, topColor, pow(h, 0.7)) 
            : mix(midColor, bottomColor, pow(abs(h), 0.7));
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.skyMesh = new THREE.Mesh(skyGeo, skyMat);
    this.group.add(this.skyMesh);

    // Sun Disc
    const sunGeo = new THREE.CircleGeometry(4, 32);
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xffeedd, side: THREE.DoubleSide });
    this.sunDiscMesh = new THREE.Mesh(sunGeo, sunMat);
    this.group.add(this.sunDiscMesh);

    // Fighting Platform / Floor
    const floorGeo = new THREE.PlaneGeometry(36, 16);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x8a6a4a,
      roughness: 0.65,
      metalness: 0.1,
    });
    this.floorMesh = new THREE.Mesh(floorGeo, floorMat);
    this.floorMesh.rotation.x = -Math.PI / 2;
    this.floorMesh.receiveShadow = true;
    this.group.add(this.floorMesh);

    // Platform Border Curbs
    const curbMat = new THREE.MeshStandardMaterial({ color: 0x5a2a1a, roughness: 0.8 });
    const curbGeo = new THREE.BoxGeometry(36, 0.3, 0.4);
    const curbFront = new THREE.Mesh(curbGeo, curbMat);
    curbFront.position.set(0, -0.15, 3.2);
    curbFront.receiveShadow = true;
    this.group.add(curbFront);

    // Crowd Spectators & Placards
    this.crowdGroup = new THREE.Group();
    this.group.add(this.crowdGroup);
    this.buildSpectators();

    // Waving Indian Tricolor Flags
    this.buildFlags();

    // Camera Flashes in audience
    const flashCanvas = document.createElement('canvas');
    flashCanvas.width = flashCanvas.height = 32;
    const flashContext = flashCanvas.getContext('2d')!;
    const glow = flashContext.createRadialGradient(16, 16, 0, 16, 16, 16);
    glow.addColorStop(0, 'rgba(255,255,255,1)');
    glow.addColorStop(0.25, 'rgba(255,255,255,.8)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    flashContext.fillStyle = glow;
    flashContext.fillRect(0, 0, 32, 32);
    const flashTexture = new THREE.CanvasTexture(flashCanvas);
    for (let i = 0; i < 10; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: flashTexture, transparent: true, opacity: 0, depthWrite: false,
        blending: THREE.AdditiveBlending,
      }));
      sprite.visible = false;
      sprite.scale.setScalar(0.55);
      this.group.add(sprite);
      this.cameraFlashes.push({ sprite, life: 0 });
    }

    // Stage Specific Geometry Group
    this.stageSpecificGroup = new THREE.Group();
    this.group.add(this.stageSpecificGroup);

    // Set Initial Stage
    this.setStage('sansad');
  }

  private buildSpectators(): void {
    const crowdCount = 180;
    const bodyGeo = new THREE.CylinderGeometry(0.18, 0.22, 0.8, 8);
    const headGeo = new THREE.SphereGeometry(0.15, 8, 8);

    const colors = [0xff9933, 0xffffff, 0x138808, 0x2e9bff, 0xe0262f, 0xf05a00, 0xffd700, 0xaaaaaa];

    const bodies = new THREE.InstancedMesh(bodyGeo, new THREE.MeshStandardMaterial({ roughness: 0.8 }), crowdCount);
    const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshStandardMaterial({ color: 0xdeb887, roughness: 0.8 }), crowdCount);
    const transform = new THREE.Object3D();
    const color = new THREE.Color();
    this.crowdGroup.add(bodies, heads);
    for (let i = 0; i < crowdCount; i++) {
      const tier = i % 4;
      const side = (i % 2 === 0 ? 1 : -1);
      const row = Math.floor(i / 8);

      const x = side * (8.5 + tier * 0.9 + (Math.random() - 0.5) * 0.3);
      const z = -1.5 - row * 0.45;
      const y = tier * 0.45 + 0.4;

      const col = colors[Math.floor(Math.random() * colors.length)];
      transform.position.set(x, y, z);
      transform.updateMatrix();
      bodies.setMatrixAt(i, transform.matrix);
      bodies.setColorAt(i, color.setHex(col));
      transform.position.y += 0.55;
      transform.updateMatrix();
      heads.setMatrixAt(i, transform.matrix);

      // Placard for some fans
      if (i % 7 === 0) {
        const placardPole = new THREE.Mesh(
          new THREE.CylinderGeometry(0.02, 0.02, 1.4),
          new THREE.MeshBasicMaterial({ color: 0xdddddd })
        );
        placardPole.position.set(x, y + 0.8, z + 0.1);
        const placardBoard = new THREE.Mesh(
          new THREE.BoxGeometry(0.6, 0.4, 0.02),
          new THREE.MeshBasicMaterial({ color: 0xfff6c0 })
        );
        placardBoard.position.set(x, y + 1.4, z + 0.1);
        this.crowdGroup.add(placardPole, placardBoard);
      }
    }
  }

  private buildFlags(): void {
    const flagCanvas = document.createElement('canvas');
    flagCanvas.width = 128;
    flagCanvas.height = 80;
    const ctx = flagCanvas.getContext('2d')!;
    // Saffron
    ctx.fillStyle = '#FF9933';
    ctx.fillRect(0, 0, 128, 26.6);
    // White
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 26.6, 128, 26.6);
    // Green
    ctx.fillStyle = '#138808';
    ctx.fillRect(0, 53.2, 128, 26.8);
    // Ashoka Chakra
    ctx.strokeStyle = '#000080';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(64, 40, 8, 0, Math.PI * 2);
    ctx.stroke();

    const flagTex = new THREE.CanvasTexture(flagCanvas);

    const positions: [number, number][] = [
      [-8, -5],
      [8, -5],
      [-5, -8],
      [5, -8],
      [-10.5, 3.5],
      [10.5, 3.5],
    ];

    for (const [x, z] of positions) {
      // Flagpole
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.06, 6, 8),
        new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.6, roughness: 0.3 })
      );
      pole.position.set(x, 2.7, z);
      pole.castShadow = true;
      this.group.add(pole);

      // Flag cloth
      const clothGeo = new THREE.PlaneGeometry(1.8, 1.2, 16, 8);
      clothGeo.translate(0.9, 0, 0);
      const clothMat = new THREE.MeshStandardMaterial({
        map: flagTex,
        side: THREE.DoubleSide,
        roughness: 0.8,
      });
      const cloth = new THREE.Mesh(clothGeo, clothMat);
      cloth.position.set(x + 0.05, 5, z);
      this.group.add(cloth);

      this.flags.push({
        mesh: cloth,
        basePositions: Float32Array.from(clothGeo.attributes.position.array),
        phase: Math.random() * 6,
      });
    }
  }

  public setStage(stageId: StageId): void {
    const stage = STAGE_DEFINITIONS[stageId] || STAGE_DEFINITIONS.sansad;
    if (this.builtStage === stage.id) return;
    this.builtStage = stage.id;
    this.currentStageId = stage.id;
    const theme = stage.theme;

    // Update Lighting
    this.dirLight.color.set(theme.sunColor);
    this.dirLight.intensity = theme.sunIntensity;
    this.dirLight.position.set(...theme.sunPos);

    this.hemiLight.color.set(theme.hemiSky);
    this.hemiLight.groundColor.set(theme.hemiGround);
    this.hemiLight.intensity = theme.hemiIntensity;

    // Update Sky Shader Uniforms
    const skyMat = this.skyMesh.material as THREE.ShaderMaterial;
    skyMat.uniforms.topColor.value.set(theme.skyTop);
    skyMat.uniforms.midColor.value.set(theme.skyMid);
    skyMat.uniforms.bottomColor.value.set(theme.skyBottom);

    // Update Sun Disc
    this.sunDiscMesh.position.set(...theme.sunDisc);
    this.sunDiscMesh.lookAt(0, 0, 0);
    (this.sunDiscMesh.material as THREE.MeshBasicMaterial).color.set(theme.sunDiscColor);

    // Update Floor
    (this.floorMesh.material as THREE.MeshStandardMaterial).color.set(theme.ground);
    (this.floorMesh.material as THREE.MeshStandardMaterial).roughness = theme.floorRoughness;

    // Update Fog
    this.scene.fog = new THREE.Fog(theme.fog, theme.fogNear, theme.fogFar);

    // Rebuild Stage-Specific Scenery
    this.buildStageSpecificScenery(stage.id);
  }

  private buildStageSpecificScenery(stageId: StageId): void {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.stageSpecificGroup.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        geometries.add(child.geometry);
        (Array.isArray(child.material) ? child.material : [child.material]).forEach((m) => materials.add(m));
      }
    });
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    // Clear previous stage geometry
    while (this.stageSpecificGroup.children.length > 0) {
      const child = this.stageSpecificGroup.children[0];
      this.stageSpecificGroup.remove(child);
    }

    if (stageId === 'sansad') {
      // Build Parliament House Columns & Dome
      const pillarGeo = new THREE.CylinderGeometry(0.35, 0.4, 7, 16);
      const pillarMat = new THREE.MeshStandardMaterial({ color: 0xdeb887, roughness: 0.7 });

      for (let i = -14; i <= 14; i += 2.5) {
        const pillar = new THREE.Mesh(pillarGeo, pillarMat);
        pillar.position.set(i, 3.5, -12);
        pillar.castShadow = true;
        pillar.receiveShadow = true;
        this.stageSpecificGroup.add(pillar);
      }

      // Architrave roof beam
      const beam = new THREE.Mesh(
        new THREE.BoxGeometry(32, 1.2, 2.5),
        pillarMat
      );
      beam.position.set(0, 7.5, -12);
      this.stageSpecificGroup.add(beam);

      // Central Dome
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(6, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0xcca065, roughness: 0.6 })
      );
      dome.position.set(0, 8.1, -16);
      this.stageSpecificGroup.add(dome);
    } else if (stageId === 'jantar') {
      // Jantar Mantar Samrat Yantra sundial ramp & masonry
      const rampGeo = new THREE.BoxGeometry(3, 8, 16);
      const redStoneMat = new THREE.MeshStandardMaterial({ color: 0xa8463a, roughness: 0.8 });
      const ramp = new THREE.Mesh(rampGeo, redStoneMat);
      ramp.position.set(0, 3.0, -14);
      ramp.rotation.x = 0.4;
      this.stageSpecificGroup.add(ramp);

      // Circular observatory walls
      const wallGeo = new THREE.CylinderGeometry(6, 6, 3, 24, 1, true, 0, Math.PI);
      const wall = new THREE.Mesh(wallGeo, redStoneMat);
      wall.position.set(10, 1.5, -12);
      wall.rotation.y = Math.PI / 4;
      this.stageSpecificGroup.add(wall);
    } else if (stageId === 'road') {
      // Desi Sadak Thelas, Street Lamps, and Highway Barriers
      const barrierGeo = new THREE.BoxGeometry(2.5, 0.8, 0.4);
      const barrierMat = new THREE.MeshStandardMaterial({ color: 0xee9900, roughness: 0.7 });

      for (let i = -12; i <= 12; i += 4) {
        const barrier = new THREE.Mesh(barrierGeo, barrierMat);
        barrier.position.set(i, 0.4, -6);
        this.stageSpecificGroup.add(barrier);
      }

      // Street Lamp
      const lampPole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.12, 7),
        new THREE.MeshStandardMaterial({ color: 0x333333 })
      );
      lampPole.position.set(-9, 3.5, -5);
      const lampHead = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 0.3, 0.5),
        new THREE.MeshBasicMaterial({ color: 0xffea88 })
      );
      lampHead.position.set(-9, 7.1, -4.8);
      this.stageSpecificGroup.add(lampPole, lampHead);
    }
  }

  public update(dt: number, time: number): void {
    // Animate waving flags
    for (const flag of this.flags) {
      const posAttr = flag.mesh.geometry.attributes.position as THREE.BufferAttribute;
      const base = flag.basePositions;
      const phase = flag.phase;

      for (let i = 0; i < posAttr.count; i++) {
        const x = base[i * 3];
        const y = base[i * 3 + 1];
        // Wave increases along the length of the flag cloth
        const wave = Math.sin(time * 6 + x * 3 + phase) * 0.12 * (x / 1.8);
        posAttr.setXYZ(i, x, y, wave);
      }
      posAttr.needsUpdate = true;
    }

    // Animate random camera flashes in the crowd
    for (const flash of this.cameraFlashes) {
      if (flash.life > 0) {
        flash.life -= dt;
        flash.sprite.material.opacity = Math.max(0, flash.life / 0.15);
        if (flash.life <= 0) flash.sprite.visible = false;
      } else if (Math.random() < 1 - Math.pow(1 - 0.035, dt * 60)) {
        // Trigger a new camera flash
        flash.sprite.position.set(
          (Math.random() - 0.5) * 22,
          1.5 + Math.random() * 3,
          -4 - Math.random() * 8
        );
        flash.sprite.material.opacity = 1;
        flash.sprite.visible = true;
        flash.life = 0.15;
      }
    }
  }
}

