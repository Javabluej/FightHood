import * as THREE from 'three';
import { GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { FighterDefinition } from '../types';
import { Fighter } from '../combat/Fighter';
import { createZeroPose, normalizeAngle, Pose, POSE_KEYS, HIP_BASE_Y } from './kinematics';
import { createPrathamModel } from './PrathamModel';
import { createKennyModel } from './KennyModel';
import { getPoseForFighter } from './poses';
import { prepareAvatarMaterial } from './materials';

interface Joint {
  bone: THREE.Bone;
  rest: THREE.Quaternion;
  P: THREE.Quaternion;
  Pinv: THREE.Quaternion;
}

const BONE_NAMES = [
  'Hips',
  'Spine',
  'Spine1',
  'Spine2',
  'Neck',
  'Head',
  'LeftArm',
  'LeftForeArm',
  'RightArm',
  'RightForeArm',
  'LeftUpLeg',
  'LeftLeg',
  'LeftFoot',
  'RightUpLeg',
  'RightLeg',
  'RightFoot',
];

const FINGER_GROUPS = ['Index', 'Middle', 'Ring', 'Pinky'];
const FIST_ANGLES = [1.45, 1.6, 1.05];
const OPEN_ANGLES = [0.18, 0.22, 0.12];

const X_AXIS = new THREE.Vector3(1, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

function findBone(root: THREE.Object3D, name: string): THREE.Bone | null {
  const r = new RegExp(`^${name}(_\\d+)?$`);
  let found: THREE.Bone | null = null;
  root.traverse((child) => {
    if (!found && (child as THREE.Bone).isBone && r.test(child.name)) {
      found = child as THREE.Bone;
    }
  });
  return found;
}

// Shared Draco & GLTF Loader Singleton & Cache to prevent OOM / multiple worker threads
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('/draco/');
dracoLoader.setWorkerLimit(1);

const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);

const gltfCache = new Map<string, Promise<GLTF>>();

export function getCachedGLTF(charId: string): Promise<GLTF> {
  const modelPath = `/models/${charId}.glb`;
  let promise = gltfCache.get(modelPath);
  if (!promise) {
    promise = gltfLoader.loadAsync(modelPath).catch((err) => {
      gltfCache.delete(modelPath);
      throw err;
    });
    gltfCache.set(modelPath, promise);
  }
  return promise;
}

export async function preloadAllFighterModels(): Promise<void> {
  const roster = ['modi', 'rahul', 'didi', 'trump', 'yogi', 'nitin', 'mbapu'];
  for (const id of roster) {
    try {
      await getCachedGLTF(id);
      await new Promise((r) => setTimeout(r, 150));
    } catch {
      // ignore
    }
  }
}

export class ModelRig {
  public root: THREE.Group;
  public body: THREE.Group;
  public model: THREE.Object3D | null = null;
  public definition: FighterDefinition;
  public isPlayer2: boolean;
  public scale: number = 1.0;
  public yaw: number = 0;
  public ready: Promise<boolean>;

  private joints: Record<string, Joint> = {};
  private fingersL: Joint[][] = [];
  private fingersR: Joint[][] = [];
  private thumbL: Joint[] = [];
  private thumbR: Joint[] = [];
  private hands: { l: THREE.Bone | null; r: THREE.Bone | null } = { l: null, r: null };
  private handRest: { l: THREE.Quaternion; r: THREE.Quaternion } = {
    l: new THREE.Quaternion(),
    r: new THREE.Quaternion(),
  };

  private currentPose: Pose = createZeroPose();
  private hipsRestPos: THREE.Vector3 = new THREE.Vector3(0, 0.93, 0);
  private contactShadow: THREE.Mesh;
  private animTimer: number = 0;
  private breathT: number = Math.random() * 10;
  private loaded: boolean = false;
  private disposed = false;
  private ownsModel = false;
  private ownedTextures: THREE.Texture[] = [];

  private A0L: THREE.Quaternion = new THREE.Quaternion().setFromAxisAngle(
    Z_AXIS,
    -THREE.MathUtils.degToRad(82)
  );
  private A0R: THREE.Quaternion = new THREE.Quaternion().setFromAxisAngle(
    Z_AXIS,
    THREE.MathUtils.degToRad(82)
  );
  private A0Linv: THREE.Quaternion = this.A0L.clone().invert();
  private A0Rinv: THREE.Quaternion = this.A0R.clone().invert();

  // Temporary math reuse to avoid GC overhead
  private tmpEuler: THREE.Euler = new THREE.Euler();
  private tmpQuatA: THREE.Quaternion = new THREE.Quaternion();
  private tmpQuatB: THREE.Quaternion = new THREE.Quaternion();

  constructor(definition: FighterDefinition, isPlayer2: boolean = false) {
    this.definition = definition;
    this.isPlayer2 = isPlayer2;

    this.root = new THREE.Group();
    this.root.rotation.order = 'ZYX';
    this.body = new THREE.Group();
    this.root.add(this.body);

    // Initial orientation
    this.yaw = isPlayer2 ? -Math.PI / 2 + 0.22 : Math.PI / 2 - 0.22;
    this.root.rotation.set(0, 0, 0);

    // Contact Blob Shadow
    this.contactShadow = this.createContactShadow();
    this.root.add(this.contactShadow);

    // Initial Stand-in Mesh
    this.createStandIn();

    // Load Skinned GLB
    this.ready = this.loadModel();
  }

  private createContactShadow(): THREE.Mesh {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, 'rgba(0,0,0,1)');
      grad.addColorStop(0.5, 'rgba(0,0,0,0.55)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 64, 64);
    }
    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      opacity: 0.55,
    });
    const geo = new THREE.CircleGeometry(0.44, 32);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.012;
    mesh.renderOrder = -1;
    return mesh;
  }

  private createStandIn(): void {
    const standin = new THREE.Group();
    standin.name = 'standin';
    const color = parseInt(this.definition.accent.replace('#', '0x'), 16) || 0xff7722;
    const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
    const skinMat = new THREE.MeshStandardMaterial({
      color: this.definition.look.skin || 0xe5b89a,
      roughness: 0.7,
    });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.55, 0.28), bodyMat);
    torso.position.y = 1.05;
    torso.castShadow = true;
    standin.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 16), skinMat);
    head.position.y = 1.48;
    head.castShadow = true;
    standin.add(head);

    this.body.add(standin);
  }

  private async loadModel(): Promise<boolean> {
    try {
      const modelId = this.definition.modelId ?? this.definition.id;
      this.ownsModel = modelId === 'kenny' || modelId === 'pratham';
      const gltf = await getCachedGLTF(this.ownsModel ? 'rahul' : modelId);
      if (this.disposed) return false;
      let clonedScene = SkeletonUtils.clone(gltf.scene);
      if (this.ownsModel) {
        const texture = await new THREE.TextureLoader().loadAsync(`/textures/${modelId}/head-albedo.png`);
        if (this.disposed) { texture.dispose(); return false; }
        this.ownedTextures.push(texture);
        clonedScene = modelId === 'pratham' ? createPrathamModel(clonedScene, texture, this.isPlayer2) : createKennyModel(clonedScene, texture, this.isPlayer2);
      }

      // Remove stand-in
      const standin = this.body.getObjectByName('standin');
      if (standin) {
        this.disposeStandIn(standin);
        this.body.remove(standin);
      }

      this.model = clonedScene;

      // Shadows & Materials
      const materials = new Map<THREE.Material, THREE.Material>();
      this.model.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.frustumCulled = false;

          if (mesh.material) {
            const wasArray = Array.isArray(mesh.material);
            const mats = wasArray ? (mesh.material as THREE.Material[]) : [mesh.material as THREE.Material];
            const updated = mats.map((m) => {
              let prepared = materials.get(m);
              if (!prepared) {
                prepared = prepareAvatarMaterial(m, mesh.name, this.isPlayer2);
                materials.set(m, prepared);
              }
              return prepared;
            });
            mesh.material = wasArray ? updated : updated[0];
          }
        }
      });
      // Custom models already own their input materials; replace and release them.
      if (this.ownsModel) materials.forEach((_prepared, source) => source.dispose());

      // Compute Model Scale from actual armature leg height
      this.model.updateMatrixWorld(true);
      const leftUpLeg = findBone(this.model, 'LeftUpLeg');
      const legWorldY = leftUpLeg ? leftUpLeg.getWorldPosition(new THREE.Vector3()).y : HIP_BASE_Y;
      this.scale = HIP_BASE_Y / (legWorldY || HIP_BASE_Y);

      const heightMult = this.definition.modelHeight ?? 1.0;
      this.body.scale.setScalar(this.scale * heightMult);
      this.body.add(this.model);
      this.model.updateMatrixWorld(true);

      // Populate Joints
      for (const name of BONE_NAMES) {
        this.initJoint(name);
      }

      // Populate Fingers & Hands
      for (const side of ['Left', 'Right'] as const) {
        const fingerList = side === 'Left' ? this.fingersL : this.fingersR;
        fingerList.length = 0;
        for (const group of FINGER_GROUPS) {
          const chain = [1, 2, 3]
            .map((idx) => this.initJoint(`${side}Hand${group}${idx}`))
            .filter((j): j is Joint => !!j);
          fingerList.push(chain);
        }

        const thumbChain = [1, 2, 3]
          .map((idx) => this.initJoint(`${side}HandThumb${idx}`))
          .filter((j): j is Joint => !!j);
        if (side === 'Left') this.thumbL = thumbChain;
        else this.thumbR = thumbChain;

        const handBone = findBone(this.model, `${side}Hand`);
        if (side === 'Left') {
          this.hands.l = handBone;
          if (handBone) this.handRest.l.copy(handBone.quaternion);
        } else {
          this.hands.r = handBone;
          if (handBone) this.handRest.r.copy(handBone.quaternion);
        }
      }

      // Read Hips Rest Position
      if (this.joints['Hips']) {
        this.hipsRestPos.copy(this.joints['Hips'].bone.position);
      }

      this.root.rotation.set(0, this.yaw, 0);

      // Initial resting pose
      this.loaded = true;
      this.applyPose(this.currentPose);
      return true;
    } catch (err) {
      console.warn(`[ModelRig] Could not load GLB for ${this.definition.id}, standin active:`, err);
      return false;
    }
  }

  private initJoint(name: string): Joint | null {
    if (!this.model) return null;
    const bone = findBone(this.model, name);
    if (!bone || !bone.parent) return null;

    const parentWorldQ = new THREE.Quaternion();
    bone.parent.getWorldQuaternion(parentWorldQ);

    const modelWorldQ = new THREE.Quaternion();
    this.model.getWorldQuaternion(modelWorldQ);

    const parentModelQ = modelWorldQ.clone().invert().multiply(parentWorldQ);

    const joint: Joint = {
      bone,
      rest: bone.quaternion.clone(),
      P: parentModelQ,
      Pinv: parentModelQ.clone().invert(),
    };
    this.joints[name] = joint;
    return joint;
  }

  private setJointRotation(joint: Joint | undefined, rotation: THREE.Quaternion): void {
    if (!joint) return;
    joint.bone.quaternion
      .copy(joint.Pinv)
      .multiply(rotation)
      .multiply(joint.P)
      .multiply(joint.rest);
  }

  private fromEuler(x: number, y: number, z: number, scale: number = 1.0): THREE.Quaternion {
    this.tmpEuler.set(x * scale, y * scale, z * scale, 'XYZ');
    return this.tmpQuatA.setFromEuler(this.tmpEuler);
  }

  private applyHands(pose: Pose): void {
    const applyChain = (fingers: Joint[][], thumb: Joint[], curl: number, sign: number) => {
      const c = Math.max(0, Math.min(1, curl));
      for (let i = 0; i < fingers.length; i++) {
        const chain = fingers[i];
        const spread = 0.92 + i * 0.05;
        for (let j = 0; j < chain.length; j++) {
          const angle = (FIST_ANGLES[j] * (1 - c) + OPEN_ANGLES[j] * c) * spread;
          this.tmpQuatB.setFromAxisAngle(Z_AXIS, sign * angle);
          this.setJointRotation(chain[j], this.tmpQuatB);
        }
      }
      for (let i = 0; i < thumb.length; i++) {
        const angle = (1 - c) * [0.55, 0.5, 0.4][i] + c * 0.05;
        this.tmpQuatB.setFromAxisAngle(X_AXIS, angle);
        this.tmpQuatA.setFromAxisAngle(Y_AXIS, sign * (1 - c) * (i === 0 ? 0.35 : 0));
        this.setJointRotation(thumb[i], this.tmpQuatB.multiply(this.tmpQuatA));
      }
    };

    applyChain(this.fingersL, this.thumbL, pose.lHand, -1);
    applyChain(this.fingersR, this.thumbR, pose.rHand, 1);

    if (this.hands.l) {
      this.hands.l.quaternion
        .copy(this.handRest.l)
        .multiply(this.tmpQuatA.setFromAxisAngle(Z_AXIS, pose.lWf))
        .multiply(this.tmpQuatB.setFromAxisAngle(Y_AXIS, pose.lWr));
    }
    if (this.hands.r) {
      this.hands.r.quaternion
        .copy(this.handRest.r)
        .multiply(this.tmpQuatA.setFromAxisAngle(Z_AXIS, -pose.rWf))
        .multiply(this.tmpQuatB.setFromAxisAngle(Y_AXIS, -pose.rWr));
    }
  }

  public applyPose(pose: Pose): void {
    if (!this.loaded) return;

    const j = this.joints;
    const s = this.scale;
    const r = Math.sin(this.breathT * 2.1) * 0.018;

    if (j.Hips) {
      j.Hips.bone.position.set(
        this.hipsRestPos.x,
        this.hipsRestPos.y + pose.rootY / s,
        this.hipsRestPos.z + pose.rootZ / s
      );
      this.setJointRotation(j.Hips, this.fromEuler(pose.hipsF, pose.hipsT, pose.hipsS));
    }

    this.setJointRotation(j.Spine, this.fromEuler(pose.spineF, pose.spineT, pose.spineS, 0.5));
    this.setJointRotation(j.Spine1, this.fromEuler(pose.spineF, pose.spineT, pose.spineS, 0.5));
    this.setJointRotation(j.Spine2, this.fromEuler(pose.chestF - r, pose.chestT, 0));
    this.setJointRotation(j.Neck, this.fromEuler(pose.headF, pose.headT, pose.headS, 0.4));
    this.setJointRotation(j.Head, this.fromEuler(pose.headF + r * 0.5, pose.headT, pose.headS, 0.6));

    // Left Arm Kinematics
    this.tmpEuler.set(-pose.lShF, pose.lShT, pose.lShO, 'XYZ');
    const lSh = this.tmpQuatA.setFromEuler(this.tmpEuler).multiply(this.A0L);
    this.setJointRotation(j.LeftArm, lSh);

    this.tmpQuatB.setFromAxisAngle(X_AXIS, -pose.lEl);
    const lEl = this.tmpQuatA.copy(this.A0Linv).multiply(this.tmpQuatB).multiply(this.A0L);
    this.setJointRotation(j.LeftForeArm, lEl);

    // Right Arm Kinematics
    this.tmpEuler.set(-pose.rShF, -pose.rShT, -pose.rShO, 'XYZ');
    const rSh = this.tmpQuatA.setFromEuler(this.tmpEuler).multiply(this.A0R);
    this.setJointRotation(j.RightArm, rSh);

    this.tmpQuatB.setFromAxisAngle(X_AXIS, -pose.rEl);
    const rEl = this.tmpQuatA.copy(this.A0Rinv).multiply(this.tmpQuatB).multiply(this.A0R);
    this.setJointRotation(j.RightForeArm, rEl);

    // Left Leg Kinematics
    this.setJointRotation(j.LeftUpLeg, this.fromEuler(-pose.lThF, 0, pose.lThO));
    this.tmpQuatB.setFromAxisAngle(X_AXIS, pose.lKn);
    this.setJointRotation(j.LeftLeg, this.tmpQuatB);
    this.tmpQuatB.setFromAxisAngle(X_AXIS, pose.lAnk);
    this.setJointRotation(j.LeftFoot, this.tmpQuatB);

    // Right Leg Kinematics
    this.setJointRotation(j.RightUpLeg, this.fromEuler(-pose.rThF, 0, -pose.rThO));
    this.tmpQuatB.setFromAxisAngle(X_AXIS, pose.rKn);
    this.setJointRotation(j.RightLeg, this.tmpQuatB);
    this.tmpQuatB.setFromAxisAngle(X_AXIS, pose.rAnk);
    this.setJointRotation(j.RightFoot, this.tmpQuatB);

    // Hand and Fingers
    this.applyHands(pose);
  }

  public resetPose(basePose?: Pose): void {
    const target = basePose || createZeroPose();
    for (const k of POSE_KEYS) {
      this.currentPose[k] = target[k];
    }
    this.applyPose(this.currentPose);
  }

  public snapVertical(): void {
    this.currentPose.hipsF = 0;
    this.currentPose.hipsT = 0;
    this.currentPose.hipsS = 0;
    this.currentPose.rootY = 0;
    this.currentPose.rootZ = 0;
    this.applyPose(this.currentPose);
  }

  public blendTo(target: Pose, rate: number, dt: number): void {
    const alpha = 1 - Math.exp(-rate * dt);
    for (const k of POSE_KEYS) {
      this.currentPose[k] += (target[k] - this.currentPose[k]) * alpha;
    }
    this.breathT += dt;
    this.applyPose(this.currentPose);
  }

  public setTransform(x: number, y: number, facing: number, dt: number, inwardAngle: number = 0.22): void {
    this.root.position.set(x, y, 0);
    const targetYaw = facing > 0 ? Math.PI / 2 - inwardAngle : -Math.PI / 2 + inwardAngle;
    const yawDiff = Math.abs(normalizeAngle(targetYaw - this.yaw));
    // Turn around snappily when changing facing direction
    const rate = yawDiff > 1.2 ? 48 : 24;
    const alpha = dt <= 0 ? 1 : 1 - Math.exp(-rate * dt);
    this.yaw = normalizeAngle(this.yaw + normalizeAngle(targetYaw - this.yaw) * alpha);
    this.root.rotation.set(0, this.yaw, 0);
    this.updateContactShadow();
  }

  private updateContactShadow(): void {
    const y = this.root.position.y;
    this.contactShadow.position.set(0, -y + 0.012, 0);
    const reach = Math.max(0, 1 - y / 1.6);
    this.contactShadow.scale.setScalar(0.6 + reach * 0.4);
    (this.contactShadow.material as THREE.MeshBasicMaterial).opacity = 0.55 * reach;
    this.contactShadow.visible = Math.abs(this.root.rotation.z) < 0.4;
  }

  public update(fighter: Fighter, dt: number): void {
    this.animTimer += dt;
    this.setTransform(fighter.x, fighter.y, fighter.facing, dt);

    // If in super cinematic, SuperDirector blends and handles poses directly
    if (fighter.state === 'super' || fighter.state === 'frozen') return;

    const { pose, rate } = getPoseForFighter(fighter, this.animTimer);
    if (fighter.state === 'attack') {
      // Attack poses already interpolate authored keyframes using simulation frames.
      // A second smoothing filter delayed the visible strike beyond its hit window.
      this.resetPose(pose);
    } else {
      this.blendTo(pose, rate, dt);
    }
  }

  public handWorld(side: 'l' | 'r', target: THREE.Vector3): THREE.Vector3 {
    const bone = side === 'l' ? this.hands.l : this.hands.r;
    if (bone) {
      return bone.getWorldPosition(target);
    }
    const offX = side === 'l' ? -0.3 : 0.3;
    return target.set(this.root.position.x + offX, this.root.position.y + 1.1, this.root.position.z);
  }

  public headWorld(target: THREE.Vector3): THREE.Vector3 {
    const head = this.joints['Head']?.bone;
    if (head) {
      return head.getWorldPosition(target);
    }
    return target.set(this.root.position.x, this.root.position.y + 1.5, this.root.position.z);
  }

  private disposeStandIn(root: THREE.Object3D): void {
    root.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => material.dispose());
      }
    });
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const standin = this.body.getObjectByName('standin');
    if (standin) this.disposeStandIn(standin);
    this.root.removeFromParent();
    if (this.model) {
      this.model.traverse((child) => {
        const mesh = child as THREE.SkinnedMesh;
        if (mesh.skeleton) mesh.skeleton.dispose();
        if (this.ownsModel && mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((m) => m.dispose());
          } else {
            mesh.material.dispose();
          }
        }
      });
    }
    this.ownedTextures.forEach(texture => texture.dispose());
    this.ownedTextures = [];
    (this.contactShadow.material as THREE.MeshBasicMaterial).map?.dispose();
    this.contactShadow.geometry.dispose();
    (this.contactShadow.material as THREE.Material).dispose();
  }
}
