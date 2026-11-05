import * as THREE from 'three';
import { createPrathamUltimate } from './pratham';
import { createKennyUltimate } from './kenny';
import { Fighter } from '../combat/Fighter';
import { ModelRig } from '../animation/ModelRig';
import { UIManager } from '../ui/UIManager';
import { soundEngine } from '../audio/AudioManager';
import { Pose, mergePose, createZeroPose, lerpPose, easeOutCubic, easeInOutCubic } from '../animation/kinematics';
import { FIXED_DELTA_TIME } from '../combat/physics';
import { getBaseIdlePose, getKnockdownPose } from '../animation/poses';

export interface SuperContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  ui: UIManager;
  attacker: Fighter;
  defender: Fighter;
  attRig: ModelRig;
  defRig: ModelRig;
  boss?: boolean;
  onFinish: () => void;
}

export class SuperDirector {
  private ctx: SuperContext;
  private timer: number = 0;
  private duration: number = 4.2;
  private props: THREE.Object3D[] = [];
  private disposed: boolean = false;
  private ready = false;
  private started = false;
  private accumulator = 0;
  private onStepUpdate: ((t: number, dt: number) => void) | null = null;
  private charId: string;
  private staging: { elapsed: number; a: number; d: number; targetA: number; targetD: number } | null = null;

  constructor(ctx: SuperContext) {
    this.ctx = ctx;
    this.charId = ctx.attacker.definition.superId ?? ctx.attacker.definition.id;
  }

  public async play(): Promise<void> {
    if (this.started || this.disposed) return;
    this.started = true;
    const { attacker, defender, attRig, defRig, ui } = this.ctx;
    const facing = attacker.facing;
    const center = THREE.MathUtils.clamp((attacker.x + defender.x) / 2, -3.2, 3.2);
    this.staging = { elapsed: 0, a: attacker.x, d: defender.x, targetA: center - facing * 1.8, targetD: center + facing * 1.8 };
    defender.facing = -facing;

    // Reset both fighters to upright ground positions to eliminate any residual knockdown tilt
    attacker.y = 0;
    attacker.vy = 0;
    attacker.airborne = false;
    defender.y = 0;
    defender.vy = 0;
    defender.airborne = false;
    attRig.snapVertical();
    attRig.resetPose(getBaseIdlePose(0, attacker.definition.id));
    defRig.snapVertical();
    defRig.resetPose(getBaseIdlePose(0, defender.definition.id));

    // 1. Play Character's Satire Voice Dialogue
    soundEngine.playSound(this.charId, 1.4);

    // 2. Dim arena & show Super Move Announcement Banner
    ui.setVignette(true);
    await ui.showSuperBanner(attacker.definition, 1400);
    if (this.disposed) return;
    attacker.x = this.staging.targetA;
    defender.x = this.staging.targetD;
    this.syncTransforms();
    this.staging = null;

    // 3. Setup Character-Specific Cinematic Props & Choreography
    switch (this.charId) {
      case 'modi':
        this.setupMitraChakra();
        break;
      case 'rahul':
        this.setupAlooSeSona();
        break;
      case 'didi':
        this.setupJaduHobe();
        break;
      case 'trump':
        this.setupTariffTsunami();
        break;
      case 'yogi':
        await this.setupDozerKaDhamaka();
        break;
      case 'nitin':
        this.setupGaddhaBlast();
        break;
      case 'pratham': {
        const ultimate = createPrathamUltimate(this.ctx);
        this.props.push(...ultimate.props);
        this.duration = ultimate.duration;
        this.onStepUpdate = ultimate.update;
        break;
      }
      case 'kenny': {
        const ultimate = createKennyUltimate(this.ctx);
        this.props.push(...ultimate.props);
        this.duration = ultimate.duration;
        this.onStepUpdate = ultimate.update;
        break;
      }
      case 'mbapu':
        this.setupManchChhodo();
        break;
      default:
        this.setupMitraChakra();
        break;
    }
    if (this.disposed) return;
    this.timer = 0;
    this.ready = true;
  }

  private syncTransforms(): void {
    const { attacker, defender, attRig, defRig } = this.ctx;
    attRig.setTransform(attacker.x, attacker.y, attacker.facing, 0);
    defRig.setTransform(defender.x, defender.y, defender.facing, 0);
  }

  /** Called after camera tracking so dialogue stays attached during lifts/zoom. */
  public refreshScreenEffects(): void {
    for (const [fighter, rig] of [[this.ctx.attacker, this.ctx.attRig], [this.ctx.defender, this.ctx.defRig]] as const) {
      const position = rig.headWorld(new THREE.Vector3()); position.y += 0.45;
      const point = this.toScreen(position);
      this.ctx.ui.positionSpeech?.(`fighter-${fighter.side}`, point.x, point.y);
    }
    this.ctx.ui.separateSpeechBubbles?.();
  }

  private toScreen(pos: THREE.Vector3): { x: number; y: number } {
    const v = pos.clone().project(this.ctx.camera);
    return {
      x: ((v.x + 1) / 2) * window.innerWidth,
      y: ((-v.y + 1) / 2) * window.innerHeight,
    };
  }

  private showSpeechOnHead(rig: ModelRig, text: string, className: string = ''): void {
    const headWorld = new THREE.Vector3();
    rig.headWorld(headWorld);
    headWorld.y += 0.45;
    const s = this.toScreen(headWorld);
    this.ctx.ui.showSpeech(text, s.x, s.y, className, `fighter-${rig === this.ctx.attRig ? this.ctx.attacker.side : this.ctx.defender.side}`);
  }

  // ==========================================
  // 1. MODI: MITRA CHAKRA
  // ==========================================
  private setupMitraChakra(): void {
    const { scene, attacker, defender, attRig, defRig, ui } = this.ctx;
    this.duration = 4.2;

    soundEngine.playSound('charge_chakra', 1.0);
    soundEngine.playSound('bed_chakra', 0.8);
    this.showSpeechOnHead(attRig, 'Mitra Chakra, Mitron!');

    // Create 3D Chakra Mesh (Horizontal saw-toothed disc)
    const chakraRoot = new THREE.Group();
    chakraRoot.name = 'MitraChakra';
    const spinner = new THREE.Group();
    chakraRoot.add(spinner);

    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xffaa00,
      emissive: 0xff7700,
      emissiveIntensity: 0.9,
      metalness: 0.8,
      roughness: 0.25,
    });
    const brightMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffcc33,
      emissiveIntensity: 1.4,
      metalness: 0.4,
      roughness: 0.15,
    });

    // Outer Torus Ring
    spinner.add(new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.05, 10, 48), goldMat));
    // Inner Ring
    spinner.add(new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.03, 8, 36), brightMat));
    // Core
    spinner.add(new THREE.Mesh(new THREE.CircleGeometry(0.2, 32), brightMat));

    // 16 Spokes
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2;
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.48, 0.02), goldMat);
      spoke.position.set(Math.cos(angle) * 0.45, Math.sin(angle) * 0.45, 0);
      spoke.rotation.z = angle - Math.PI / 2;
      spinner.add(spoke);
    }

    // 24 Outer Saw Teeth
    const toothGeo = new THREE.ConeGeometry(0.08, 0.22, 4);
    for (let i = 0; i < 24; i++) {
      const angle = (i / 24) * Math.PI * 2;
      const tooth = new THREE.Mesh(toothGeo, brightMat);
      tooth.position.set(Math.cos(angle) * 0.95, Math.sin(angle) * 0.95, 0);
      tooth.rotation.z = angle - Math.PI / 2 - 0.4;
      spinner.add(tooth);
    }

    // Glowing Point Light
    const chakraLight = new THREE.PointLight(0xff9900, 4, 8);
    chakraRoot.add(chakraLight);

    // Initial horizontal orientation (flat saw-blade hovering parallel to ground)
    chakraRoot.rotation.x = -Math.PI / 2;
    chakraRoot.scale.setScalar(0.01);
    scene.add(chakraRoot);
    this.props.push(chakraRoot);

    const startY = attacker.y;
    const targetX = defender.x;
    const releasePosition = new THREE.Vector3();
    let thrown = false;

    this.onStepUpdate = (t: number, dt: number) => {
      // 0.0s - 1.4s: Caster floats into the sky, horizontal chakra grows above hand
      if (t < 1.4) {
        const p = t / 1.4;
        attacker.y = startY + easeOutCubic(p) * 1.8;
        chakraRoot.scale.setScalar(0.05 + easeOutCubic(p) * 1.15);

        spinner.rotation.z += 10 * dt;
        chakraRoot.rotation.set(-Math.PI / 2 + Math.sin(t * 1.7) * 0.04, 0, Math.cos(t * 1.3) * 0.04);

        // Caster pose: float with right hand raised high
        const pose = mergePose(getBaseIdlePose(t, 'modi'), {
          rootY: 0,
          hipsF: 0,
          hipsT: 0,
          hipsS: 0,
          spineF: -0.15,
          rShF: 2.8,
          rShO: 0.2,
          rEl: 0.1,
          rHand: 1,
          lShF: 0.3,
          lEl: 0.4,
          lHand: 1,
          lThF: 0.2,
          lKn: 0.3,
          rThF: 0.3,
          rKn: 0.45,
        });
        attRig.blendTo(pose, 18, dt);
        attRig.setTransform(attacker.x, attacker.y, attacker.facing, 0);
        const handPos = attRig.handWorld('r', new THREE.Vector3());
        chakraRoot.position.copy(handPos).add(new THREE.Vector3(0.1 * attacker.facing, 0.28, 0));
      }
      // 1.4s - 2.4s: Wind up and hold horizontal spinning chakra
      else if (t < 2.4) {
        attacker.y = startY + 1.8;
        chakraRoot.scale.setScalar(1.2 + Math.sin(t * 12) * 0.05);
        spinner.rotation.z += 18 * dt;
        chakraRoot.rotation.set(-Math.PI / 2 + Math.sin(t * 1.7) * 0.04, 0, Math.cos(t * 1.3) * 0.04);

        const pose = mergePose(getBaseIdlePose(t, 'modi'), {
          rootY: 0,
          hipsF: 0,
          hipsT: 0,
          hipsS: 0,
          rShF: 2.4,
          rShO: 0.45,
          rEl: 0.6,
          spineT: -0.4 * attacker.facing,
          headT: 0.5 * attacker.facing,
        });
        attRig.blendTo(pose, 22, dt);
        const handPos = attRig.handWorld('r', new THREE.Vector3());
        chakraRoot.position.copy(handPos).add(new THREE.Vector3(0.15 * attacker.facing, 0.3, 0));
      }
      // 2.4s - 3.2s: Hurl chakra horizontally at target
      else if (t < 3.2) {
        attacker.y = startY + 1.8;
        if (!thrown) {
          thrown = true;
          releasePosition.copy(chakraRoot.position);
          soundEngine.playSound('whoosh', 1.2);
          soundEngine.playSound('release_chakra', 1.2);
        }
        const throwP = (t - 2.4) / 0.8;
        const throwEase = easeInOutCubic(throwP);
        chakraRoot.position.lerpVectors(releasePosition, new THREE.Vector3(targetX, defender.y + 1.1, 0), throwEase);
        chakraRoot.position.y += Math.sin(throwEase * Math.PI) * 0.5;
        spinner.rotation.z += 28 * dt;

        // Maintain horizontal orientation with subtle throw tilt
        const throwTilt = -0.18 * attacker.facing;
        chakraRoot.rotation.set(
          -Math.PI / 2 + Math.sin(t * 1.7) * 0.04,
          0,
          throwTilt + Math.cos(t * 1.3) * 0.04
        );

        // Throw follow-through pose
        const throwPose = mergePose(getBaseIdlePose(t, 'modi'), {
          rootY: 0,
          hipsF: 0,
          hipsT: 0,
          hipsS: 0,
          rShF: 1.4,
          rShO: -0.2,
          rEl: 0.05,
          spineF: 0.35,
          spineT: 0.4 * attacker.facing,
          headF: 0.1,
        });
        attRig.blendTo(throwPose, 20, dt);
      }
      // 3.2s - 4.2s: Impact explosion & float back down
      else {
        if (chakraRoot.visible) {
          chakraRoot.visible = false;
          ui.showFlash('rgba(255, 180, 50, 0.85)', 400);
          soundEngine.playSound('boom', 1.3);
          soundEngine.playSound('hit_3', 1.2);

          // Launch defender into knockdown
          defender.health = Math.max(0, defender.health - 30);
          defender.forceState('knockdown');
          defender.vx = attacker.facing * 4.5;
          defender.vy = 6.2;
          defender.airborne = true;
          defender.stunFrames = 40;
        }

        // Float back down to earth
        const landP = (t - 3.2) / 1.0;
        attacker.y = THREE.MathUtils.lerp(startY + 1.8, startY, easeInOutCubic(landP));
        attRig.blendTo(getBaseIdlePose(t, 'modi'), 14, dt);
      }
    };
  }

  // ==========================================
  // 2. RAHUL: ALOO SE SONA (Reference Parity)
  // ==========================================
  private setupAlooSeSona(): void {
    const { scene, attacker, defender, attRig, defRig, ui } = this.ctx;
    const facing = attacker.facing;

    // Authored local timeline; the public reference confirms the sequence,
    // but does not publish frame timings.
    const ZAP = 0.75;
    const ALOO = 1.2;
    const RISE = 1.5;
    const PICK = 2.55;
    const WINDUP = 3.25;
    const TOSS = 3.55;
    const IN = 4.1;
    const OUT = 6.1;
    const END = 8.7;
    this.duration = END;

    soundEngine.playSound('aloolelo', 1.0);

    // 1. Build Retro Machine
    const machine = new THREE.Group();
    machine.name = 'YatraMachine';
    const machineBody = new THREE.Group();
    machine.add(machineBody);

    const darkBaseMat = new THREE.MeshStandardMaterial({ color: 0x23262e, metalness: 0.6, roughness: 0.5 });
    const blueBodyMat = new THREE.MeshStandardMaterial({ color: 0x2e9bff, metalness: 0.75, roughness: 0.35 });
    const goldTrimMat = new THREE.MeshStandardMaterial({
      color: 0xffcc00,
      emissive: 0x775500,
      emissiveIntensity: 0.35,
      metalness: 0.9,
      roughness: 0.25,
    });

    // Dark base
    const baseMesh = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.18, 0.9), darkBaseMat);
    baseMesh.position.set(0, 0.09, 0);
    machineBody.add(baseMesh);

    // Blue metallic main cabinet
    const bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(1.05, 1.0, 0.75), blueBodyMat);
    bodyMesh.position.set(0, 0.68, 0);
    machineBody.add(bodyMesh);

    // Gold trim bands
    const trimBottom = new THREE.Mesh(new THREE.BoxGeometry(1.09, 0.07, 0.79), goldTrimMat);
    trimBottom.position.set(0, 0.22, 0);
    machineBody.add(trimBottom);

    const trimTop = new THREE.Mesh(new THREE.BoxGeometry(1.09, 0.07, 0.79), goldTrimMat);
    trimTop.position.set(0, 1.16, 0);
    machineBody.add(trimTop);

    // 8 Corner rivets
    const rivetGeo = new THREE.SphereGeometry(0.025, 6, 4);
    for (const rx of [-0.46, 0.46]) {
      for (const ry of [0.32, 0.6, 0.88, 1.06]) {
        const rivet = new THREE.Mesh(rivetGeo, goldTrimMat);
        rivet.position.set(rx, ry, 0.38);
        machineBody.add(rivet);
      }
    }

    // Top funnel hopper (funnel where potato enters)
    const hopper = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.16, 0.42, 20, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x6a7584, metalness: 0.8, roughness: 0.3, side: THREE.DoubleSide })
    );
    hopper.position.set(-facing * 0.12, 1.42, 0);
    machineBody.add(hopper);

    const hopperRim = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.03, 8, 28), goldTrimMat);
    hopperRim.rotation.x = Math.PI / 2;
    hopperRim.position.set(-facing * 0.12, 1.63, 0);
    machineBody.add(hopperRim);

    // Angled exhaust chimney
    const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.55, 10), darkBaseMat);
    chimney.position.set(facing * 0.36, 1.45, -0.18);
    chimney.rotation.z = -facing * 0.15;
    machineBody.add(chimney);

    // Output gold chute (angled downwards on facing side)
    const chute = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.42), goldTrimMat);
    chute.position.set(facing * 0.7, 0.42, 0);
    chute.rotation.z = facing * -0.45;
    machineBody.add(chute);

    // 2 Interlocking spinning gears on front panel
    const gearMat1 = goldTrimMat;
    const gearMat2 = darkBaseMat;
    const createGear = (radius: number, mat: THREE.Material, teeth: number) => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.03, 20), mat));
      for (let i = 0; i < teeth; i++) {
        const a = (i / teeth) * Math.PI * 2;
        const tooth = new THREE.Mesh(new THREE.BoxGeometry(radius * 0.35, 0.03, radius * 0.25), mat);
        tooth.position.set(Math.cos(a) * radius, 0, Math.sin(a) * radius);
        tooth.rotation.y = -a;
        g.add(tooth);
      }
      g.rotation.x = Math.PI / 2;
      return g;
    };
    const gear1 = createGear(0.16, gearMat1, 10);
    gear1.name = 'YatraGear';
    gear1.position.set(0.22, 0.76, 0.4);
    machineBody.add(gear1);

    const gear2 = createGear(0.1, gearMat2, 7);
    gear2.position.set(0.37, 0.52, 0.4);
    machineBody.add(gear2);

    // Glowing front window (transitions from dark blue to intense gold)
    const windowMat = new THREE.MeshBasicMaterial({ color: 0x3df0ff });
    const windowMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), windowMat);
    windowMesh.position.set(-0.18, 0.72, 0.385);
    machineBody.add(windowMesh);

    // Dual blinking lamps (red and amber/green)
    const lampMat1 = new THREE.MeshBasicMaterial({ color: 0xff3333 });
    const lampMesh1 = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), lampMat1);
    lampMesh1.position.set(-0.45, 1.24, 0.3);
    machineBody.add(lampMesh1);

    const lampMat2 = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
    const lampMesh2 = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), lampMat2);
    lampMesh2.position.set(0.45, 1.24, 0.3);
    machineBody.add(lampMesh2);

    // Machine internal light
    const machineLight = new THREE.PointLight(0xffdd00, 0, 5, 2);
    machineLight.position.set(0, 0.8, 0.8);
    machine.add(machineLight);

    // Machine positioning (placed between fighters, starts underground at y = -2.0)
    const sep = Math.abs(defender.x - attacker.x);
    const machineX = attacker.x + facing * Math.min(1.5, Math.max(0.8, sep * 0.45));
    machine.position.set(machineX, -2.0, -0.6);
    scene.add(machine);
    this.props.push(machine);

    // 2. Cyan Energy Zap Beam
    const zapMat = new THREE.MeshBasicMaterial({ color: 0x55ccff, transparent: true, opacity: 0 });
    const zapBolt = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 6, 1, true), zapMat);
    zapBolt.visible = false;
    scene.add(zapBolt);
    this.props.push(zapBolt);

    // 3. 3D Potato Mesh
    const potatoGeo = new THREE.SphereGeometry(0.32, 16, 16);
    potatoGeo.scale(1.3, 0.85, 0.9);
    const potatoMat = new THREE.MeshStandardMaterial({ color: 0x9e6834, roughness: 0.85 });
    const potato = new THREE.Mesh(potatoGeo, potatoMat);
    potato.name = 'YatraPotato';
    potato.position.set(defender.x, 0.42, 0.1);
    potato.visible = false;
    scene.add(potato);
    this.props.push(potato);

    // 4. Gold Fountain (Bars & Coins)
    const goldGroup = new THREE.Group();
    goldGroup.name = 'YatraGold';
    const goldBarMat = new THREE.MeshStandardMaterial({
      color: 0xffd700,
      emissive: 0xaa8800,
      emissiveIntensity: 0.6,
      metalness: 0.95,
      roughness: 0.15,
    });
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.12, 0.16), goldBarMat);
        bar.position.set((c - 1) * 0.28, r * 0.13, (Math.random() - 0.5) * 0.2);
        goldGroup.add(bar);
      }
    }
    const coinGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.02, 16);
    for (let i = 0; i < 16; i++) {
      const coin = new THREE.Mesh(coinGeo, goldBarMat);
      coin.position.set((Math.random() - 0.5) * 0.8, 0.4 + Math.random() * 0.6, (Math.random() - 0.5) * 0.4);
      coin.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      goldGroup.add(coin);
    }
    goldGroup.position.set(machineX + facing * 0.95, 0.35, 0);
    goldGroup.scale.setScalar(0.01);
    goldGroup.visible = false;
    scene.add(goldGroup);
    this.props.push(goldGroup);

    // Dialogue State Trackers
    let line1Spoken = false;
    let line2Spoken = false;
    let line3Spoken = false;
    let zapped = false;
    let goldProduced = false;
    let gearAngle = 0;

    const hopperTopWorld = new THREE.Vector3();
    const throwStart = new THREE.Vector3();
    let thrown = false;

    this.onStepUpdate = (t: number, dt: number) => {
      // Dialogue follows the local simulation clock.
      if (t >= 0.15 && !line1Spoken) {
        line1Spoken = true;
        this.showSpeechOnHead(attRig, 'Ek aisi machine lagaunga...');
      }
      if (t >= TOSS - 0.1 && !line2Spoken) {
        line2Spoken = true;
        this.showSpeechOnHead(attRig, 'Is side se aloo ghusega...');
      }
      if (t >= IN + 0.9 && !line3Spoken) {
        line3Spoken = true;
        this.showSpeechOnHead(attRig, '...us side se SONA niklega!');
      }

      // Machine Entrance: Rises from underground
      if (t < RISE) {
        machine.position.y = -2.0;
      } else if (t < RISE + 0.6) {
        const riseP = (t - RISE) / 0.6;
        machine.position.y = THREE.MathUtils.lerp(-2.0, 0.0, easeOutCubic(riseP));
      } else {
        machine.position.y = 0.0;
      }

      // Rahul Caster Animations across phases
      if (t < ZAP + 0.3) {
        // Pointing forward pose
        const pose = mergePose(getBaseIdlePose(t, 'rahul'), {
          rootY: 0,
          hipsF: 0,
          hipsT: 0,
          hipsS: 0,
          spineT: -0.15,
          headT: -0.05,
          rShF: 1.55,
          rShO: 0.05,
          rEl: 0.05,
          rHand: 0,
          lShF: 0.25,
          lEl: 0.5,
        });
        attRig.blendTo(pose, 22, dt);
      } else if (t < PICK) {
        // Present pose
        const pose = mergePose(getBaseIdlePose(t, 'rahul'), {
          rootY: 0,
          hipsF: 0,
          hipsT: 0,
          hipsS: 0,
          headF: -0.12,
          spineF: -0.05,
          rShF: 1.15,
          rShO: 1.05,
          rEl: 0.3,
          rHand: 1,
          lShF: 1.15,
          lShO: 1.05,
          lEl: 0.3,
          lHand: 1,
        });
        attRig.blendTo(pose, 18, dt);
      } else if (t < WINDUP) {
        // Catch pose
        const pose = mergePose(getBaseIdlePose(t, 'rahul'), {
          rootY: 0,
          hipsF: 0,
          hipsT: 0,
          hipsS: 0,
          spineF: 0.08,
          rShF: 1.05,
          rShO: 0.15,
          rEl: 0.95,
          rHand: 1,
          lShF: 1.0,
          lShO: 0.15,
          lEl: 0.95,
          lHand: 1,
        });
        attRig.blendTo(pose, 20, dt);
      } else if (t < TOSS) {
        // Windup pose
        const pose = mergePose(getBaseIdlePose(t, 'rahul'), {
          rootY: 0,
          hipsF: 0,
          hipsT: 0,
          hipsS: 0,
          spineT: 0.3,
          spineF: -0.12,
          headT: -0.15,
          rShF: 2.75,
          rShO: 0.35,
          rEl: 0.65,
          rHand: 1,
          lShF: 1.0,
          lShO: 0.2,
          lEl: 0.4,
        });
        attRig.blendTo(pose, 24, dt);
      } else if (t < IN) {
        // Throw follow-through pose
        const pose = mergePose(getBaseIdlePose(t, 'rahul'), {
          rootY: 0,
          hipsF: 0,
          hipsT: 0,
          hipsS: 0,
          spineT: -0.25,
          spineF: 0.2,
          rShF: 1.35,
          rShO: 0.05,
          rEl: 0.1,
          rHand: 1,
          lShF: 0.5,
          lEl: 0.6,
        });
        attRig.blendTo(pose, 26, dt);
      } else {
        // Return to confident idle
        attRig.blendTo(getBaseIdlePose(t, 'rahul'), 16, dt);
      }

      // Zap Phase: Laser beam and potato transformation
      if (t >= ZAP && t < ALOO) {
        const handPos = new THREE.Vector3();
        attRig.handWorld('r', handPos);
        const chestPos = new THREE.Vector3(defender.x, 1.2, 0);

        zapBolt.visible = true;
        zapBolt.position.copy(handPos).add(chestPos).multiplyScalar(0.5);
        zapBolt.scale.set(1, handPos.distanceTo(chestPos), 1);
        zapBolt.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), chestPos.sub(handPos).normalize());
        zapMat.opacity = Math.random() < 0.75 ? 0.95 : 0.3;
      } else {
        zapBolt.visible = false;
      }

      // Potato appearance & animation
      if (t >= ALOO && !zapped) {
        zapped = true;
        defRig.root.visible = false;
        potato.visible = true;
        potato.position.set(defender.x, 0.42, 0.1);
        soundEngine.playSound('poof', 1.0);
        ui.showFlash('rgba(190, 240, 255, 0.45)', 150);
      }

      if (potato.visible) {
        if (t < PICK) {
          // Potato hovering slightly
          potato.rotation.y += 4.8 * dt;
          potato.position.y = 0.42 + Math.sin(t * 12) * 0.06;
        } else if (t < WINDUP) {
          // Potato moves toward Rahul's hand
          const p = easeInOutCubic(Math.min(1, (t - PICK) / (WINDUP - PICK)));
          const handPos = new THREE.Vector3();
          attRig.handWorld('r', handPos);
          potato.position.lerpVectors(new THREE.Vector3(defender.x, 0.42, 0.1), handPos, p);
          potato.position.y += Math.sin(p * Math.PI) * 0.7;
          potato.rotation.y += 12 * dt;
        } else if (t < TOSS) {
          // Hold the potato through the windup instead of continuing a homing arc.
          attRig.handWorld('r', potato.position);
        } else if (t < IN) {
          // Potato thrown in parabola arc into the machine's hopper funnel!
          const p = (t - TOSS) / (IN - TOSS);
          if (!thrown) { thrown = true; throwStart.copy(potato.position); }
          hopperRim.getWorldPosition(hopperTopWorld);
          potato.position.lerpVectors(throwStart, hopperTopWorld, p);
          potato.position.y += Math.sin(p * Math.PI) * 1.3;
          potato.rotation.x += 21 * dt;
          potato.rotation.z += 12 * dt;
          potato.scale.setScalar(1 - p * 0.7);
        } else {
          // GULP into hopper!
          potato.visible = false;
          soundEngine.playSound('poof', 0.8);
        }
      }

      // Machine Processing Phase: rumbling, gears spinning, chimney steam, blinking lamps
      if (t >= IN && t < OUT) {
        const processP = (t - IN) / (OUT - IN);
        const rumbleAmt = 0.015 + processP * 0.025;
        machine.position.x = machineX + (Math.random() - 0.5) * rumbleAmt;
        machineBody.rotation.z = Math.sin(t * 40) * 0.015 * (0.4 + processP);

        gearAngle += dt * (6 + processP * 24);
        gear1.rotation.y = gearAngle;
        gear2.rotation.y = -gearAngle * 1.5;

        // Blinking indicator lamps
        const blink = Math.floor(t * (6 + processP * 12)) % 2 === 0;
        lampMat1.color.setHex(blink ? 0xff2222 : 0x550000);
        lampMat2.color.setHex(blink ? 0x00ff55 : 0x005511);

        // Window transition to molten gold
        windowMat.color.lerpColors(new THREE.Color(0x3df0ff), new THREE.Color(0xffcc00), processP);
        machineLight.intensity = 1.0 + processP * 4.0 + Math.random() * 0.5;
      }

      // Gold Eruption Phase
      if (t >= OUT && !goldProduced) {
        goldProduced = true;
        goldGroup.visible = true;
        goldGroup.scale.setScalar(1.2);
        soundEngine.playSound('coins', 1.3);
        soundEngine.playSound('kaching', 1.4);
        ui.showFlash('rgba(255, 230, 80, 0.85)', 400);

        // Defender expelled from machine into knockdown flight
        defRig.root.visible = true;
        defender.x = machineX + facing * 0.8;
        defender.y = 0.5;
        defender.health = Math.max(0, defender.health - 30);
        defender.forceState('knockdown');
        defender.vx = facing * 4.5;
        defender.vy = 5.8;
        defender.airborne = true;
        defender.stunFrames = 36;
      }

      // Gold shimmer during eruption
      if (goldGroup.visible) {
        goldGroup.rotation.y += 1.2 * dt;
      }

      if (t >= OUT) { machine.position.x = machineX; machineBody.rotation.z = 0; machineLight.intensity = 0; }

      // Machine smooth sink: sinks down through the floor rather than disappearing abruptly!
      if (t >= END - 0.9) {
        const sinkP = Math.min(1, (t - (END - 0.9)) / 0.9);
        machine.position.y = -THREE.MathUtils.lerp(0.0, 2.2, easeInOutCubic(sinkP));
        goldGroup.scale.setScalar(Math.max(0.01, 1.2 * (1 - sinkP)));
      }
    };
  }

  // ==========================================
  // 3. DIDI: JADU HOBE
  // ==========================================
  private setupJaduHobe(): void {
    const { scene, attacker, defender, attRig, defRig, ui } = this.ctx;
    const facing = attacker.facing;
    this.duration = 9.2;

    soundEngine.playSound('bed_jadu', 1.0);
    this.showSpeechOnHead(attRig, 'Dharna hobe! Humba humba, ramba ramba!');

    // Magic ritual circle on floor under defender
    const circleGroup = new THREE.Group();
    const circleMat = new THREE.MeshBasicMaterial({ color: 0x22ee66, side: THREE.DoubleSide, transparent: true, opacity: 0.75 });
    const circleMesh = new THREE.Mesh(new THREE.RingGeometry(0.3, 1.25, 32), circleMat);
    circleMesh.rotation.x = -Math.PI / 2;
    circleMesh.position.set(defender.x, 0.02, 0);
    circleGroup.add(circleMesh);
    scene.add(circleGroup);
    this.props.push(circleGroup);

    // Iron Cauldron Pot
    const pot = new THREE.Group();
    const ironMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.85, roughness: 0.4 });
    const brewMat = new THREE.MeshStandardMaterial({ color: 0x33ff55, emissive: 0x22cc44, emissiveIntensity: 1.2, roughness: 0.2 });

    const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.58, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.65), ironMat);
    bowl.rotation.x = Math.PI;
    bowl.position.y = 0.55;
    pot.add(bowl);

    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.05, 12, 32), ironMat);
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = 0.55;
    pot.add(rim);

    // Cauldron handles
    for (const side of [-1, 1]) {
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.025, 8, 16), ironMat);
      handle.position.set(side * 0.58, 0.45, 0);
      handle.rotation.y = (side * Math.PI) / 2;
      pot.add(handle);
    }

    const liquid = new THREE.Mesh(new THREE.CircleGeometry(0.5, 32), brewMat);
    liquid.rotation.x = -Math.PI / 2;
    liquid.position.y = 0.52;
    pot.add(liquid);

    // Wooden Ladle
    const ladle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.95, 8), new THREE.MeshStandardMaterial({ color: 0x7c4e24 }));
    ladle.position.set(0.1, 0.82, 0);
    ladle.rotation.z = 0.35;
    pot.add(ladle);

    const brewLight = new THREE.PointLight(0x33ff55, 4, 7);
    brewLight.position.set(0, 0.75, 0);
    pot.add(brewLight);

    pot.position.set(attacker.x + 0.68 * facing, 0, 0.15);
    scene.add(pot);
    this.props.push(pot);

    // 5 Orbiting Magic Spirits
    const spirits: THREE.Mesh[] = [];
    const spiritMat = new THREE.MeshBasicMaterial({ color: 0x88ffaa });
    for (let i = 0; i < 5; i++) {
      const sp = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), spiritMat);
      scene.add(sp);
      this.props.push(sp);
      spirits.push(sp);
    }

    // 3 Tossed Items (Chappal, Rosogolla, Ballot Paper)
    const chappalMat = new THREE.MeshStandardMaterial({ color: 0x334466 });
    const chappal = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 0.28), chappalMat);
    chappal.visible = false;
    scene.add(chappal);
    this.props.push(chappal);

    const sweetMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
    const sweet = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 12), sweetMat);
    sweet.visible = false;
    scene.add(sweet);
    this.props.push(sweet);

    const ballotMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.9 });
    const ballot = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.005, 0.28), ballotMat);
    ballot.visible = false;
    scene.add(ballot);
    this.props.push(ballot);

    // Green Frog Mesh for Metamorphosis
    const frog = new THREE.Group();
    const frogMat = new THREE.MeshStandardMaterial({ color: 0x22aa33, roughness: 0.6 });
    const frogEyeMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const frogPupilMat = new THREE.MeshBasicMaterial({ color: 0x111111 });

    const frogBody = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 16), frogMat);
    frogBody.scale.set(1.15, 0.85, 1.25);
    frogBody.position.y = 0.22;
    frog.add(frogBody);

    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 12), frogEyeMat);
      eye.position.set(s * 0.15, 0.42, 0.16);
      frog.add(eye);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), frogPupilMat);
      pupil.position.set(s * 0.16, 0.44, 0.23);
      frog.add(pupil);
    }
    frog.position.set(defender.x, 0, 0);
    frog.visible = false;
    scene.add(frog);
    this.props.push(frog);

    let chappalTossed = false;
    let sweetTossed = false;
    let ballotTossed = false;
    let boiled = false;
    let poofed = false;
    let unpoofed = false;

    this.onStepUpdate = (t: number, dt: number) => {
      // Orbiting spirits around pot
      for (let i = 0; i < spirits.length; i++) {
        const angle = t * 3.5 + (i / spirits.length) * Math.PI * 2;
        spirits[i].position.set(
          pot.position.x + Math.cos(angle) * 0.75,
          pot.position.y + 0.65 + Math.sin(t * 4 + i) * 0.2,
          pot.position.z + Math.sin(angle) * 0.75
        );
      }

      // Stirring ladle and boiling liquid
      ladle.rotation.z = Math.sin(t * 7) * 0.35 + 0.2;
      liquid.position.y = 0.52 + Math.sin(t * 12) * 0.015;

      // Caster stirring animation pose
      const stirPose = mergePose(getBaseIdlePose(t, 'didi'), {
        rootY: 0,
        hipsF: 0,
        hipsT: 0,
        hipsS: 0,
        lShF: 0.95 + Math.sin(t * 6) * 0.15,
        lEl: 1.5,
        rShF: 0.95 - Math.sin(t * 6) * 0.15,
        rEl: 1.5,
        spineF: 0.2,
      });
      attRig.blendTo(stirPose, 20, dt);

      // Item 1: Chappal Toss (1.9s)
      if (t >= 1.9 && t < 2.5) {
        if (!chappalTossed) {
          chappalTossed = true;
          chappal.visible = true;
          this.showSpeechOnHead(attRig, 'CHAPPAL!');
          soundEngine.playSound('slap', 1.2);
        }
        const p = (t - 1.9) / 0.6;
        chappal.position.x = THREE.MathUtils.lerp(attacker.x + 0.2 * facing, pot.position.x, p);
        chappal.position.y = THREE.MathUtils.lerp(1.2, 0.55, p) + Math.sin(p * Math.PI) * 0.6;
        chappal.rotation.z += 12 * dt;
      } else if (t >= 2.5 && chappal.visible) {
        chappal.visible = false;
        soundEngine.playSound('plop', 1.1);
      }

      // Item 2: Rosogolla Toss (3.2s)
      if (t >= 3.2 && t < 3.8) {
        if (!sweetTossed) {
          sweetTossed = true;
          sweet.visible = true;
          this.showSpeechOnHead(attRig, 'ROSOGOLLA!');
          soundEngine.playSound('whoosh', 1.1);
        }
        const p = (t - 3.2) / 0.6;
        sweet.position.x = THREE.MathUtils.lerp(attacker.x + 0.2 * facing, pot.position.x, p);
        sweet.position.y = THREE.MathUtils.lerp(1.2, 0.55, p) + Math.sin(p * Math.PI) * 0.5;
      } else if (t >= 3.8 && sweet.visible) {
        sweet.visible = false;
        soundEngine.playSound('plop', 1.1);
      }

      // Item 3: Ballot Paper Toss (4.5s)
      if (t >= 4.5 && t < 5.1) {
        if (!ballotTossed) {
          ballotTossed = true;
          ballot.visible = true;
          this.showSpeechOnHead(attRig, 'BALLOT PAPER!');
          soundEngine.playSound('snap', 1.2);
        }
        const p = (t - 4.5) / 0.6;
        ballot.position.x = THREE.MathUtils.lerp(attacker.x + 0.2 * facing, pot.position.x, p);
        ballot.position.y = THREE.MathUtils.lerp(1.2, 0.55, p) + Math.sin(p * Math.PI) * 0.55;
        ballot.rotation.y += 10 * dt;
      } else if (t >= 5.1 && ballot.visible) {
        ballot.visible = false;
        soundEngine.playSound('plop', 1.1);
      }

      // 6.45s: Violent Boil & Eruption
      if (t >= 6.45 && !boiled) {
        boiled = true;
        soundEngine.playSound('bed_jadu', 1.2);
        this.showSpeechOnHead(attRig, 'Jadu hobe! Khela hobe!');
        brewLight.intensity = 8;
        ui.showFlash('rgba(80, 255, 120, 0.65)', 300);
      }

      // 7.0s: Poof defender into Frog
      if (t >= 7.0 && !poofed) {
        poofed = true;
        defRig.root.visible = false;
        frog.visible = true;
        soundEngine.playSound('poof', 1.2);
        soundEngine.playSound('frog', 1.3);
        ui.showFlash('rgba(50, 255, 100, 0.8)', 300);
        this.showSpeechOnHead(defRig, 'Ribbit! Main frog ban gaya?!');
      }

      // 7.0s - 8.35s: Frog hops in panic
      if (frog.visible && t < 8.35) {
        const hopP = ((t - 7.0) * 3) % 1;
        frog.position.y = Math.sin(hopP * Math.PI) * 0.65;
        frog.rotation.y += 0.05;
      }

      // 8.35s: UNPOOF & Launch
      if (t >= 8.35 && !unpoofed) {
        unpoofed = true;
        frog.visible = false;
        defRig.root.visible = true;
        soundEngine.playSound('release_jadu', 1.3);
        soundEngine.playSound('boom', 1.2);
        ui.showFlash('rgba(255, 120, 200, 0.85)', 400);

        defender.health = Math.max(0, defender.health - 30);
        defender.forceState('knockdown');
        defender.vx = facing * 4.8;
        defender.vy = 6.0;
        defender.airborne = true;
        defender.stunFrames = 38;
      }

      // 8.4s - 9.2s: Pot and ritual circle smoothly sink into floor
      if (t >= 8.4) {
        const sinkP = (t - 8.4) / 0.8;
        pot.position.y = -sinkP * 1.8;
        circleGroup.scale.setScalar(Math.max(0.01, 1 - sinkP));
      }
    };
  }

  // ==========================================
  // 4. TRUMP: TARIFF TSUNAMI
  // ==========================================
  private setupTariffTsunami(): void {
    const { scene, attacker, defender, attRig, defRig, ui } = this.ctx;
    const facing = attacker.facing;
    this.duration = 7.4;

    soundEngine.playSound('bed_tariff', 1.0);
    soundEngine.playSound('pen_scribble', 1.1);
    this.showSpeechOnHead(attRig, 'Nobody knows tariffs better than me, believe me!');

    // Presidential Executive Desk
    const desk = new THREE.Group();
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x3d2010, roughness: 0.6 });
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.9, roughness: 0.25 });
    const paperMat = new THREE.MeshStandardMaterial({ color: 0xffffee, roughness: 0.8 });

    // Desktop
    const desktop = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.1, 0.8), woodMat);
    desktop.position.y = 0.85;
    desk.add(desktop);

    // Desk Base & Pillars
    const baseL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.8, 0.7), woodMat);
    baseL.position.set(-0.55, 0.4, 0);
    desk.add(baseL);
    const baseR = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.8, 0.7), woodMat);
    baseR.position.set(0.55, 0.4, 0);
    desk.add(baseR);

    // Gold Presidential Emblem on Front
    const emblem = new THREE.Mesh(new THREE.CircleGeometry(0.2, 24), goldMat);
    emblem.position.set(0, 0.5, 0.36);
    desk.add(emblem);

    // Executive Order Document
    const doc = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.01, 0.45), paperMat);
    doc.position.set(0, 0.91, 0.05);
    desk.add(doc);

    desk.position.set(attacker.x + 0.5 * facing, -2.0, 0);
    scene.add(desk);
    this.props.push(desk);

    // Golden Sharpie Pen
    const pen = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.22, 8), goldMat);
    pen.position.set(attacker.x + 0.35 * facing, 0.95, 0.1);
    pen.rotation.z = 0.4;
    pen.visible = false;
    scene.add(pen);
    this.props.push(pen);

    // Swarm of 16 TARIFF Crates
    const crates: THREE.Mesh[] = [];
    const crateMat = new THREE.MeshStandardMaterial({ color: 0x996633, roughness: 0.8 });
    for (let i = 0; i < 16; i++) {
      const cr = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.36), crateMat);
      cr.visible = false;
      scene.add(cr);
      this.props.push(cr);
      crates.push(cr);
    }

    // Giant Presidential Brass Stamp
    const stampGroup = new THREE.Group();
    const stampBody = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.65, 0.45, 24), goldMat);
    stampGroup.add(stampBody);
    const stampHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 0.85, 16), woodMat);
    stampHandle.position.y = 0.65;
    stampGroup.add(stampHandle);

    stampGroup.position.set(defender.x, 6.0, 0);
    stampGroup.visible = false;
    scene.add(stampGroup);
    this.props.push(stampGroup);

    let signed = false;
    let cratesActive = false;
    let stamped = false;

    this.onStepUpdate = (t: number, dt: number) => {
      // 0.0s - 0.6s: Desk rises from floor
      if (t < 0.6) {
        const p = t / 0.6;
        desk.position.y = THREE.MathUtils.lerp(-2.0, 0, easeOutCubic(p));
      } else {
        desk.position.y = 0;
      }

      // 0.6s - 2.0s: Trump signs executive order with pen scribbling
      if (t >= 0.6 && t < 2.0) {
        pen.visible = true;
        pen.position.x = attacker.x + 0.35 * facing + Math.sin(t * 25) * 0.04;
        pen.position.y = 0.94;

        const signPose = mergePose(getBaseIdlePose(t, 'trump'), {
          rootY: 0,
          hipsF: 0,
          hipsT: 0,
          hipsS: 0,
          spineF: 0.35,
          headF: 0.25,
          rShF: 0.9,
          rEl: 1.6,
          rHand: 0,
        });
        attRig.blendTo(signPose, 20, dt);
      }

      // 2.0s: Trump holds up signed order
      if (t >= 2.0 && t < 3.2) {
        pen.visible = false;
        if (!signed) {
          signed = true;
          this.showSpeechOnHead(attRig, 'Signed and sealed! 50% TARIFF!');
          soundEngine.playSound('coins', 1.2);
        }
        const holdPose = mergePose(getBaseIdlePose(t, 'trump'), {
          rootY: 0,
          hipsF: 0,
          hipsT: 0,
          hipsS: 0,
          spineF: -0.1,
          rShF: 2.2,
          rEl: 0.3,
          rHand: 1,
        });
        attRig.blendTo(holdPose, 18, dt);
      }

      // 3.2s - 5.0s: Crates vortex around defender
      if (t >= 3.2 && t < 5.0) {
        if (!cratesActive) {
          cratesActive = true;
          for (const c of crates) c.visible = true;
          this.showSpeechOnHead(defRig, "Wait, you're taxing my attacks?!");
          soundEngine.playSound('crate_crash', 1.2);
        }
        for (let i = 0; i < crates.length; i++) {
          const angle = (t - 3.2) * 8 + (i / crates.length) * Math.PI * 2;
          const radius = 0.85 + Math.sin(t * 4 + i) * 0.2;
          crates[i].position.set(
            defender.x + Math.cos(angle) * radius,
            0.4 + (i / crates.length) * 1.4,
            Math.sin(angle) * radius
          );
          crates[i].rotation.x += 5 * dt;
          crates[i].rotation.y += 6 * dt;
        }
      }

      // Show the descent before its impact; previously it teleported to the floor.
      if (t >= 4.6 && t < 5) {
        stampGroup.visible = true;
        stampGroup.position.y = THREE.MathUtils.lerp(4, 0.45, easeInOutCubic((t - 4.6) / 0.4));
      }
      // 5.0s: Giant Presidential Stamp Slams Down
      if (t >= 5.0) {
        if (!stamped) {
          stamped = true;
          stampGroup.visible = true;
          for (const c of crates) c.visible = false;

          soundEngine.playSound('stamp_slam', 1.4);
          soundEngine.playSound('release_tariff', 1.3);
          soundEngine.playSound('boom', 1.2);
          ui.showFlash('rgba(255, 215, 0, 0.85)', 400);
          this.showSpeechOnHead(attRig, 'TREMENDOUS! AMERICA FIRST!');

          defender.health = Math.max(0, defender.health - 30);
          defender.forceState('knockdown');
          defender.vx = facing * 4.6;
          defender.vy = 5.5;
          defender.airborne = true;
          defender.stunFrames = 36;
        }
        stampGroup.position.y = 0.45;
      }

      // 6.5s - 7.4s: Desk and stamp sink into ground
      if (t >= 6.5) {
        const p = (t - 6.5) / 0.9;
        desk.position.y = -p * 2.0;
        stampGroup.position.y = 0.45 - p * 2.0;
      }
    };
  }

  // ==========================================
  // 5. YOGI: DOZER KA DHAMAKA
  // ==========================================
  private async setupDozerKaDhamaka(): Promise<void> {
    const { scene, attacker, defender, attRig, defRig, ui } = this.ctx;
    const facing = attacker.facing;
    this.duration = 6.8;

    soundEngine.playSound('eye_zing', 1.2);
    soundEngine.playSound('engine_loop', 1.0);
    soundEngine.playSound('horn_long', 1.0);
    this.showSpeechOnHead(attRig, 'Bulldozer taiyaar hai! Full power!');

    // Laser eye beams
    const laserMat = new THREE.MeshBasicMaterial({ color: 0xff0022 });
    const laserL = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.5, 8), laserMat);
    const laserR = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.5, 8), laserMat);
    laserL.rotation.z = (-Math.PI / 2) * facing;
    laserR.rotation.z = (-Math.PI / 2) * facing;
    laserL.position.set(attacker.x + 0.15 * facing, 1.45, 0.08);
    laserR.position.set(attacker.x + 0.15 * facing, 1.45, -0.08);
    scene.add(laserL, laserR);
    this.props.push(laserL, laserR);

    // Build Detailed Bulldozer Model
    const dozer = new THREE.Group();
    dozer.name = 'DozerVehicle';
    const yellowMat = new THREE.MeshStandardMaterial({ color: 0xf5a500, metalness: 0.5, roughness: 0.35 });
    const blackMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.8, roughness: 0.5 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x112233, metalness: 0.9, roughness: 0.1, transparent: true, opacity: 0.7 });

    // Chassis
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.75, 1.4), yellowMat);
    chassis.position.y = 0.55;
    dozer.add(chassis);

    // Cabin
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.95, 1.1), yellowMat);
    cabin.position.set(-0.35 * facing, 1.4, 0);
    dozer.add(cabin);

    // Cabin Windows
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.5, 1.12), glassMat);
    win.position.set(-0.35 * facing, 1.45, 0);
    dozer.add(win);

    // Roof Beacon Siren
    const sirenMat = new THREE.MeshStandardMaterial({ color: 0xff3300, emissive: 0xff2200, emissiveIntensity: 1.5 });
    const siren = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.15, 12), sirenMat);
    siren.position.set(-0.35 * facing, 1.95, 0);
    dozer.add(siren);
    const sirenLight = new THREE.PointLight(0xff4400, 3, 5);
    sirenLight.position.set(-0.35 * facing, 2.05, 0);
    dozer.add(sirenLight);

    // Caterpillar Tracks
    for (const z of [-0.78, 0.78]) {
      const track = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.45, 0.28), blackMat);
      track.position.set(0, 0.25, z);
      dozer.add(track);
      for (let w = -1.1; w <= 1.1; w += 0.55) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.32, 12), blackMat);
        wheel.rotation.x = Math.PI / 2;
        wheel.position.set(w, 0.25, z);
        dozer.add(wheel);
      }
    }

    // Heavy Bulldozer Blade / Bucket
    const bladeGroup = new THREE.Group();
    bladeGroup.name = 'DozerBucket';
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.95, 1.6), blackMat);
    blade.position.set(1.45 * facing, 0.55, 0);
    bladeGroup.add(blade);
    for (const z of [-0.7, 0.7]) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.3, 8), yellowMat);
      arm.rotation.z = (-Math.PI / 3) * facing;
      arm.position.set(0.75 * facing, 0.6, z);
      bladeGroup.add(arm);
    }
    dozer.add(bladeGroup);

    // Exhaust Pipe
    const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.6, 8), blackMat);
    exhaust.position.set(0.45 * facing, 1.25, 0.55);
    dozer.add(exhaust);

    const startX = attacker.x - facing * 4.5;
    const targetX = defender.x - facing * 1.45;
    dozer.position.set(startX, 0, 0);
    scene.add(dozer);
    this.props.push(dozer);

    let slam1 = false;
    let slam2 = false;
    let slam3 = false;
    let reversed = false;
    let warningSpoken = false;

    this.onStepUpdate = (t: number, dt: number) => {
      // Rotating siren light
      sirenLight.intensity = Math.sin(t * 18) > 0 ? 4 : 0.5;

      // 0.0s - 1.2s: Yogi laser eyes and pointing pose
      if (t < 1.2) {
        const pointPose = mergePose(getBaseIdlePose(t, 'yogi'), {
          rootY: 0,
          hipsF: 0,
          hipsT: 0,
          hipsS: 0,
          rShF: 1.8,
          rEl: 0.1,
          rHand: 1,
          headF: -0.1,
        });
        attRig.blendTo(pointPose, 20, dt);
        const head = attRig.headWorld(new THREE.Vector3());
        const target = defRig.headWorld(new THREE.Vector3());
        [laserL, laserR].forEach((laser, index) => {
          const start = head.clone(); start.x += facing * 0.1; start.z += index === 0 ? 0.06 : -0.06;
          const direction = target.clone().sub(start);
          laser.position.copy(start).addScaledVector(direction, 0.5);
          laser.scale.y = direction.length() / 2.5;
          laser.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
        });
      } else {
        laserL.visible = false;
        laserR.visible = false;
        attRig.blendTo(getBaseIdlePose(t, 'yogi'), 14, dt);
      }

      // 1.2s - 2.5s: Bulldozer charges into arena
      if (t >= 1.2 && t < 2.5) {
        const p = (t - 1.2) / 1.3;
        dozer.position.x = THREE.MathUtils.lerp(startX, targetX, easeOutCubic(p));
        if (t >= 1.8 && !warningSpoken) {
          warningSpoken = true;
          this.showSpeechOnHead(defRig, 'Arre, yeh bulldozer kahan se aa gaya?!');
        }
      } else if (t >= 2.5 && t < 5.0) {
        dozer.position.x = targetX;
      }

      // Lift, then drop onto the opponent at each impact cue.
      if (t < 2.48) bladeGroup.position.y = 1.1 * easeOutCubic(THREE.MathUtils.clamp((t - 1.8) / 0.6, 0, 1));
      else if (t < 2.65) bladeGroup.position.y = 1.1 * (1 - easeInOutCubic((t - 2.48) / 0.17));
      else if (t < 4.05) {
        const cycle = (t - 2.65) % 0.7;
        bladeGroup.position.y = cycle < 0.5 ? easeOutCubic(cycle / 0.5) : 1 - easeInOutCubic((cycle - 0.5) / 0.2);
      } else bladeGroup.position.y = 0;

      // Slam 1 (2.65s)
      if (t >= 2.65 && t < 3.35) {
        if (!slam1) {
          slam1 = true;
          soundEngine.playSound('thud', 1.2);
          ui.showFlash('rgba(255, 180, 50, 0.4)', 150);
        }
      }

      // Slam 2 (3.35s)
      if (t >= 3.35 && t < 4.05) {
        if (!slam2) {
          slam2 = true;
          soundEngine.playSound('metal_crunch', 1.2);
          ui.showFlash('rgba(255, 140, 20, 0.5)', 200);
        }
      }

      // Slam 3 - CRUSH (4.05s)
      if (t >= 4.05 && !slam3) {
        slam3 = true;
        soundEngine.playSound('metal_crunch', 1.4);
        soundEngine.playSound('release_bulldozer', 1.3);
        soundEngine.playSound('boom', 1.3);
        ui.showFlash('rgba(255, 100, 20, 0.85)', 400);
        this.showSpeechOnHead(attRig, 'Demolition complete!');

        defender.health = Math.max(0, defender.health - 30);
        defender.forceState('knockdown');
        defender.vx = facing * 5.0;
        defender.vy = 6.2;
        defender.airborne = true;
        defender.stunFrames = 38;
      }

      // 5.0s - 6.8s: Bulldozer reverses away with beeps
      if (t >= 5.0) {
        if (!reversed) {
          reversed = true;
          soundEngine.playSound('reverse_beeps', 1.1);
        }
        dozer.position.x -= facing * 2.8 * dt;
      }
    };
  }

  // ==========================================
  // 6. NITIN: GADDHA BLAST
  // ==========================================
  private setupGaddhaBlast(): void {
    const { scene, attacker, defender, attRig, defRig, ui } = this.ctx;
    const facing = attacker.facing;
    this.duration = 9.2;

    this.showSpeechOnHead(attRig, 'National Highway rules: Gaddha bharna padega!');

    // Pothole Crater under defender
    const pothole = new THREE.Group();
    const holeMat = new THREE.MeshBasicMaterial({ color: 0x0a0a0a, side: THREE.DoubleSide });
    const holeMesh = new THREE.Mesh(new THREE.CircleGeometry(0.85, 32), holeMat);
    holeMesh.rotation.x = -Math.PI / 2;
    holeMesh.position.set(defender.x, 0.02, 0);
    pothole.add(holeMesh);

    // Asphalt Rubble Chunks
    const rubbleMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.9 });
    for (let i = 0; i < 10; i++) {
      const chunk = new THREE.Mesh(new THREE.DodecahedronGeometry(0.09 + Math.random() * 0.06), rubbleMat);
      const angle = (i / 10) * Math.PI * 2;
      chunk.position.set(defender.x + Math.cos(angle) * 0.85, 0.04, Math.sin(angle) * 0.85);
      pothole.add(chunk);
    }
    scene.add(pothole);
    this.props.push(pothole);

    // Retro E20 Biofuel Machine
    const pump = new THREE.Group();
    const greenMat = new THREE.MeshStandardMaterial({ color: 0x117733, metalness: 0.6, roughness: 0.4 });
    const fuelMat = new THREE.MeshStandardMaterial({ color: 0x33ff66, emissive: 0x22cc44, emissiveIntensity: 1.1, transparent: true, opacity: 0.85 });

    const pumpBody = new THREE.Mesh(new THREE.BoxGeometry(0.65, 1.2, 0.55), greenMat);
    pumpBody.position.y = 0.6;
    pump.add(pumpBody);

    const fuelTank = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.7, 16), fuelMat);
    fuelTank.position.set(0, 0.7, 0.28);
    pump.add(fuelTank);

    // Hose Nozzle
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.45, 8), new THREE.MeshStandardMaterial({ color: 0x222222 }));
    nozzle.position.set(0.35 * facing, 0.55, 0);
    nozzle.rotation.z = (-Math.PI / 4) * facing;
    pump.add(nozzle);

    pump.position.set(attacker.x + 0.65 * facing, -1.8, 0);
    scene.add(pump);
    this.props.push(pump);

    // Glowing Biofuel Stream
    const streamMat = new THREE.MeshBasicMaterial({ color: 0x44ff77 });
    const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 8), streamMat);
    stream.name = 'E20Stream';
    stream.visible = false;
    scene.add(stream);
    this.props.push(stream);

    // Matchstick & Flame
    const matchGroup = new THREE.Group();
    const matchStick = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.14, 0.015), new THREE.MeshStandardMaterial({ color: 0xddccaa }));
    matchGroup.add(matchStick);
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xff6600 });
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), flameMat);
    flame.position.y = 0.07;
    matchGroup.add(flame);
    const flameLight = new THREE.PointLight(0xff6600, 2, 3);
    flameLight.position.y = 0.07;
    matchGroup.add(flameLight);
    matchGroup.visible = false;
    scene.add(matchGroup);
    this.props.push(matchGroup);

    // Fireball Explosion Dome
    const fireball = new THREE.Mesh(
      new THREE.SphereGeometry(1.4, 24, 24),
      new THREE.MeshStandardMaterial({ color: 0xff3300, emissive: 0xff6600, emissiveIntensity: 2.2, roughness: 0.1, transparent: true, depthWrite: false })
    );
    fireball.position.set(defender.x, 0.5, 0);
    fireball.visible = false;
    scene.add(fireball);
    this.props.push(fireball);

    let cracked = false;
    let sunk = false;
    let machineUp = false;
    let poured = false;
    let matchLit = false;
    let flicked = false;
    let exploded = false;
    const matchStart = new THREE.Vector3();

    this.onStepUpdate = (t: number, dt: number) => {
      // 1.1s: Road cracks under defender
      if (t >= 1.1 && !cracked) {
        cracked = true;
        soundEngine.playSound('boom', 0.9);
        this.showSpeechOnHead(defRig, 'Arre yeh rasta toot raha hai!');
      }

      // 1.9s: Defender drops down into pothole
      if (t >= 1.1 && t < 7.2) {
        defender.y = -0.55 * easeInOutCubic(Math.min(1, (t - 1.1) / 0.8));
      }

      // 2.85s: E20 machine rises
      if (t >= 2.85 && t < 3.55) {
        const p = (t - 2.85) / 0.7;
        pump.position.y = THREE.MathUtils.lerp(-1.8, 0, easeOutCubic(p));
      } else if (t >= 3.55 && t < 5.75) {
        pump.position.y = 0;
      }

      // 3.55s - 5.5s: Pouring E20 biofuel into pothole
      if (t >= 3.55 && t < 5.5) {
        if (!poured) {
          poured = true;
          this.showSpeechOnHead(attRig, 'Sugarcane to E20 fuel, 100% swadeshi!');
          soundEngine.playSound('plop', 1.2);
        }
        stream.visible = true;
        const source = nozzle.getWorldPosition(new THREE.Vector3());
        const target = new THREE.Vector3(defender.x, 0.04, 0);
        const direction = target.clone().sub(source);
        stream.position.copy(source).addScaledVector(direction, 0.5);
        stream.scale.y = direction.length() / 0.9;
        stream.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
      } else {
        stream.visible = false;
      }

      // 5.75s: Machine lowers
      if (t >= 5.75 && t < 6.4) {
        const p = (t - 5.75) / 0.65;
        pump.position.y = -p * 1.8;
      }

      // 6.05s: Nitin pulls out match & strikes flame (6.8s)
      if (t >= 6.8 && t < 7.2) {
        if (!matchLit) {
          matchLit = true;
          matchGroup.visible = true;
          soundEngine.playSound('snap', 1.3);
          this.showSpeechOnHead(attRig, 'Fastag balance zero. Boom.');
          attRig.handWorld('r', matchStart);
        }
        const p = (t - 6.8) / 0.4;
        matchGroup.position.lerpVectors(matchStart, new THREE.Vector3(defender.x, 0.05, 0), p);
        matchGroup.position.y += Math.sin(p * Math.PI) * 0.45;
        matchGroup.rotation.z = -facing * p * Math.PI * 2;
      }

      if (t < 7.05) {
        attRig.blendTo(mergePose(getBaseIdlePose(t, 'nitin'), {
          rShF: t >= 3.55 && t < 5.5 ? 1.2 : 0.65, rEl: 1.1,
          headF: t >= 3.55 && t < 5.5 ? 0.2 : 0, lEl: 1.3,
        }), 18, dt);
      }

      // 7.05s: Nitin coolly turns around facing away
      if (t >= 7.05) {
        const coolPose = mergePose(getBaseIdlePose(t, 'nitin'), {
          rootY: 0,
          hipsF: 0,
          hipsT: 0.8 * facing,
          spineT: 0.6 * facing,
          rShF: 0.5,
          rEl: 1.2,
          rHand: 1,
        });
        attRig.blendTo(coolPose, 20, dt);
      }

      // 7.2s: Explosion!
      if (t >= 7.2 && !exploded) {
        exploded = true;
        matchGroup.visible = false;
        fireball.visible = true;
        fireball.scale.setScalar(0.2);

        soundEngine.playSound('whoosh', 1.3);
        soundEngine.playSound('boom', 1.4);
        soundEngine.playSound('hit_3', 1.3);
        ui.showFlash('rgba(255, 90, 10, 0.95)', 450);

        defender.health = Math.max(0, defender.health - 30);
        // A below-floor starting point would immediately cancel the launch.
        defender.y = 0.05;
        defender.forceState('knockdown');
        defender.vx = facing * 5.0;
        defender.vy = 7.2;
        defender.airborne = true;
        defender.stunFrames = 42;
      }

      if (fireball.visible) {
        const blastP = Math.min(1, (t - 7.2) / 0.8);
        fireball.scale.setScalar(0.2 + blastP * 1.6);
        (fireball.material as THREE.MeshStandardMaterial).opacity = 1 - blastP;
        if (blastP >= 1) fireball.visible = false;
      }

      // 7.5s - 9.0s: Nitin cool slow-motion walk away
      if (t >= 7.5) {
        attacker.x -= facing * 0.45 * dt;
      }
    };
  }

  // ==========================================
  // 7. MBAPU: MANCH CHHODO
  // ==========================================
  private setupManchChhodo(): void {
    const { scene, attacker, defender, attRig, defRig, ui } = this.ctx;
    const facing = attacker.facing;
    this.duration = 7.5;

    soundEngine.playSound('charkha', 1.1);
    this.showSpeechOnHead(attRig, 'Shanti se bada koi mukka nahi.');

    // Glowing Wheel of Light (Charkha)
    const wheel = new THREE.Group();
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xffd700, emissive: 0xffaa00, emissiveIntensity: 1.0, metalness: 0.8, roughness: 0.2 });
    const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

    wheel.add(new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.045, 12, 48), goldMat));
    wheel.add(new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.03, 8, 32), goldMat));

    for (let i = 0; i < 24; i++) {
      const angle = (i / 24) * Math.PI * 2;
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.02, 1.15, 0.02), whiteMat);
      spoke.position.set(Math.cos(angle) * 0.55, Math.sin(angle) * 0.55, 0);
      spoke.rotation.z = angle - Math.PI / 2;
      wheel.add(spoke);
    }
    const auraLight = new THREE.PointLight(0xfff0aa, 5, 9);
    wheel.add(auraLight);

    wheel.position.set(attacker.x - facing * 0.5, 2.4, -1.2);
    scene.add(wheel);
    this.props.push(wheel);

    // 16-Layer Khadi Cocoon around defender
    const cocoon = new THREE.Group();
    const clothMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f0, roughness: 0.9, transparent: true, opacity: 0.95 });
    for (let i = 0; i < 16; i++) {
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.12, 16), clothMat);
      ring.position.y = (i - 7.5) * 0.11 + 0.9;
      ring.scale.setScalar(0.01);
      cocoon.add(ring);
    }
    cocoon.position.set(defender.x, 0, 0);
    scene.add(cocoon);
    this.props.push(cocoon);

    // 80 Swirling Salt Storm Particles
    const saltParticles: THREE.Mesh[] = [];
    const saltMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (let i = 0; i < 80; i++) {
      const sp = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), saltMat);
      sp.visible = false;
      scene.add(sp);
      this.props.push(sp);
      saltParticles.push(sp);
    }

    let cocoonFormed = false;
    let released = false;
    let defenderLineSpoken = false;

    this.onStepUpdate = (t: number, dt: number) => {
      wheel.rotation.z += 16 * dt;

      // 0.4s - 2.0s: Mbapu levitates cross-legged into the air
      if (t < 2.0) {
        attacker.y = Math.min(1.5, t * 0.75);
        const floatPose = mergePose(getBaseIdlePose(t, 'mbapu'), {
          rootY: 0,
          hipsF: 0,
          hipsT: 0,
          hipsS: 0,
          lShF: 0.6,
          lEl: 0.8,
          rShF: 0.6,
          rEl: 0.8,
          spineF: -0.1,
        });
        attRig.blendTo(floatPose, 16, dt);
      }

      // 2.0s: Charkha rotates and speech triggers
      if (t >= 2.0 && t < 4.0) {
        if (!cocoonFormed) {
          cocoonFormed = true;
          this.showSpeechOnHead(attRig, 'Charkha ghoomega, satya jeetega.');

        }
        // Cocoon layers wrap around defender
        const wrapP = (t - 2.0) / 2.0;
        cocoon.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.scale.setScalar(wrapP * 1.15);
          }
        });
      }

      if (t >= 3 && !defenderLineSpoken) {
        defenderLineSpoken = true;
        this.showSpeechOnHead(defRig, 'Main hil nahi sakta! Yeh kapda kaisa hai?!');
      }

      // 4.0s - 5.8s: Swirling salt storm hurricane gale
      if (t >= 4.0 && t < 6.0) {
        for (let i = 0; i < saltParticles.length; i++) {
          saltParticles[i].visible = true;
          const angle = (t - 4.0) * 10 + (i / saltParticles.length) * Math.PI * 2;
          const r = 0.85 + Math.sin(t * 5 + i) * 0.3;
          saltParticles[i].position.set(
            defender.x + Math.cos(angle) * r,
            0.3 + (i / saltParticles.length) * 1.8,
            Math.sin(angle) * r
          );
        }
      }

      // 5.8s: Mbapu lands and releases Ahimsa Palm Strike at 6.0s
      if (t >= 5.3 && t < 6.0) {
        attacker.y = 1.5 * (1 - easeInOutCubic((t - 5.3) / 0.7));
        const palmPose = mergePose(getBaseIdlePose(t, 'mbapu'), {
          rootY: 0,
          hipsF: 0,
          hipsT: 0,
          hipsS: 0,
          rShF: 2.2,
          rEl: 0.1,
          rHand: 1,
        });
        attRig.blendTo(palmPose, 24, dt);
      }

      // 6.0s: Release Shockwave & shatter cocoon
      if (t >= 6.0 && !released) {
        released = true;
        attacker.y = 0;
        cocoon.visible = false;
        for (const sp of saltParticles) sp.visible = false;

        soundEngine.playSound('shabash', 1.4);
        soundEngine.playSound('release_chakra', 1.3);
        soundEngine.playSound('boom', 1.3);
        ui.showFlash('rgba(255, 255, 255, 0.95)', 400);
        this.showSpeechOnHead(attRig, 'Ahimsa Palm Strike!');

        defender.health = Math.max(0, defender.health - (this.ctx.boss ? 40 : 30));
        defender.forceState('knockdown');
        defender.vx = facing * 5.4;
        defender.vy = 6.2;
        defender.airborne = true;
        defender.stunFrames = 40;
      }

      // 6.8s - 7.5s: Charkha wheel fades peacefully
      if (t >= 6.8) {
        const fadeP = (t - 6.8) / 0.7;
        wheel.scale.setScalar(Math.max(0.01, 1 - fadeP));
      }
    };
  }

  // ==========================================
  // Step Loop & Cleanup
  // ==========================================
  public update(dt: number): void {
    if (this.disposed || !Number.isFinite(dt) || dt <= 0) return;
    if (!this.ready) {
      if (this.staging) {
        const { attacker, defender } = this.ctx;
        this.staging.elapsed += dt;
        const p = easeInOutCubic(Math.min(1, this.staging.elapsed / 0.8));
        attacker.x = THREE.MathUtils.lerp(this.staging.a, this.staging.targetA, p);
        defender.x = THREE.MathUtils.lerp(this.staging.d, this.staging.targetD, p);
        this.syncTransforms();
      }
      return;
    }
    this.accumulator += dt;
    while (this.accumulator + 1e-9 >= FIXED_DELTA_TIME && !this.disposed) {
      this.accumulator -= FIXED_DELTA_TIME;
      this.timer += FIXED_DELTA_TIME;
      this.ctx.attRig.setTransform(this.ctx.attacker.x, this.ctx.attacker.y, this.ctx.attacker.facing, FIXED_DELTA_TIME);
      this.ctx.defRig.setTransform(this.ctx.defender.x, this.ctx.defender.y, this.ctx.defender.facing, FIXED_DELTA_TIME);
      this.onStepUpdate?.(this.timer, FIXED_DELTA_TIME);
      const { defender, defRig } = this.ctx;
      if (defender.state === 'knockdown') {
        // Choreography launches now actually fall and land during the cinematic.
        defender.advanceLockedPhysics();
        defRig.blendTo(getKnockdownPose(defender, this.timer), 24, FIXED_DELTA_TIME);
      }
      if (this.timer >= this.duration - 0.45 && this.ctx.attacker.y === 0) {
        this.ctx.attRig.blendTo(getBaseIdlePose(this.timer, this.ctx.attacker.definition.id), 22, FIXED_DELTA_TIME);
      }
      // Choreography and physics can both move a fighter in this step. Commit
      // their final transforms before rendering or reading prop attachments.
      this.syncTransforms();
      if (this.timer + 1e-9 >= this.duration && !defender.airborne) this.finish();
    }
  }

  public finish(notify = true): void {
    if (this.disposed) return;
    this.disposed = true;

    // Clean up all 3D props
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    for (const prop of this.props) {
      this.ctx.scene.remove(prop);
      prop.traverse((child) => {
        const m = child as THREE.Mesh;
        if (child instanceof THREE.Light) child.dispose();
        if (m.geometry) geometries.add(m.geometry);
        if (m.material) {
          for (const material of Array.isArray(m.material) ? m.material : [m.material]) {
            materials.add(material);
            const textured = material as THREE.MeshBasicMaterial;
            if (textured.map) textures.add(textured.map);
          }
        }
      });
    }
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
    textures.forEach(texture => texture.dispose());
    this.props = [];

    // Ensure models are visible
    this.ctx.attRig.root.visible = true;
    this.ctx.defRig.root.visible = true;

    // Snap both rigs upright and reset poses cleanly
    this.ctx.attRig.snapVertical();
    this.ctx.attRig.resetPose(getBaseIdlePose(0, this.ctx.attacker.definition.id));
    this.ctx.defRig.snapVertical();
    this.ctx.defRig.resetPose(getBaseIdlePose(0, this.ctx.defender.definition.id));

    // Reset positions and states
    this.ctx.attacker.x = Math.max(-6.45, Math.min(6.45, this.ctx.attacker.x));
    this.ctx.defender.x = Math.max(-6.45, Math.min(6.45, this.ctx.defender.x));
    this.ctx.attacker.vx = 0;
    this.ctx.defender.vx = 0;
    this.ctx.defender.currentAttack = null;
    this.ctx.attacker.y = 0;
    this.ctx.attacker.vy = 0;
    this.ctx.attacker.airborne = false;
    this.ctx.attacker.forceState('idle');
    this.ctx.attacker.currentAttack = null;

    // Reset defender physics & state
    this.ctx.defender.y = 0;
    this.ctx.defender.vy = 0;
    this.ctx.defender.airborne = false;
    if (this.ctx.defender.health <= 0) {
      this.ctx.defender.forceState('ko');
    } else {
      this.ctx.defender.forceState('getup');
      this.ctx.defender.stateFrames = 0;
      this.ctx.defender.stunFrames = 24;
      this.ctx.defender.invulnerableFrames = 18;
    }

    this.ctx.defRig.resetPose(getKnockdownPose(this.ctx.defender, this.timer));
    this.syncTransforms();
    this.ctx.ui.setVignette(false);
    if (notify) this.ctx.onFinish();
  }
}
