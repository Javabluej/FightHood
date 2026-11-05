export interface Pose {
  rootY: number;
  rootZ: number;
  hipsF: number;
  hipsT: number;
  hipsS: number;
  spineF: number;
  spineT: number;
  spineS: number;
  chestF: number;
  chestT: number;
  headF: number;
  headT: number;
  headS: number;
  lShF: number;
  lShO: number;
  lShT: number;
  lEl: number;
  lHand: number;
  lWf: number;
  lWr: number;
  rShF: number;
  rShO: number;
  rShT: number;
  rEl: number;
  rHand: number;
  rWf: number;
  rWr: number;
  lThF: number;
  lThO: number;
  lKn: number;
  lAnk: number;
  rThF: number;
  rThO: number;
  rKn: number;
  rAnk: number;
}

export const POSE_KEYS: (keyof Pose)[] = [
  'rootY',
  'rootZ',
  'hipsF',
  'hipsT',
  'hipsS',
  'spineF',
  'spineT',
  'spineS',
  'chestF',
  'chestT',
  'headF',
  'headT',
  'headS',
  'lShF',
  'lShO',
  'lShT',
  'lEl',
  'lHand',
  'lWf',
  'lWr',
  'rShF',
  'rShO',
  'rShT',
  'rEl',
  'rHand',
  'rWf',
  'rWr',
  'lThF',
  'lThO',
  'lKn',
  'lAnk',
  'rThF',
  'rThO',
  'rKn',
  'rAnk',
];

export function createZeroPose(): Pose {
  const p: any = {};
  for (const k of POSE_KEYS) {
    p[k] = 0;
  }
  return p as Pose;
}

export function clonePose(p: Pose): Pose {
  return { ...p };
}

export function mergePose(base: Pose, delta: Partial<Pose>): Pose {
  const result = { ...base, ...delta };
  // Raising the hips without updating the knees made cinematic stances float.
  // Preserve each planted foot when a pose changes only the root height.
  if (delta.rootY !== undefined && delta.rootY !== base.rootY) {
    for (const side of ['l', 'r'] as const) {
      if (delta[`${side}ThF`] !== undefined || delta[`${side}Kn`] !== undefined) continue;
      const thigh = base[`${side}ThF`], knee = base[`${side}Kn`];
      const z = UPPER_LEG * Math.sin(thigh) + LOWER_LEG * Math.sin(thigh - knee);
      const offset = HIP_BASE_Y + base.rootY - HIP_OFFSET - UPPER_LEG * Math.cos(thigh) - LOWER_LEG * Math.cos(thigh - knee);
      const dy = Math.max(0.05, HIP_BASE_Y + delta.rootY - HIP_OFFSET - offset);
      const maxZ = Math.sqrt(Math.max(0, (UPPER_LEG + LOWER_LEG - 1e-6) ** 2 - dy ** 2));
      const plantedZ = Math.max(-maxZ, Math.min(maxZ, z));
      const leg = solveLegIK(HIP_BASE_Y + delta.rootY, plantedZ, offset);
      result[`${side}ThF`] = leg.thF;
      result[`${side}Kn`] = leg.kn;
      result[`${side}Ank`] = leg.thF - leg.kn;
    }
  }
  return result;
}

export function lerpPose(a: Pose, b: Pose, t: number, out: Pose = createZeroPose()): Pose {
  for (const k of POSE_KEYS) {
    out[k] = a[k] + (b[k] - a[k]) * t;
  }
  return out;
}

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export function easeOutCubic(x: number): number {
  return 1 - Math.pow(1 - clamp01(x), 3);
}

export function easeInOutCubic(x: number): number {
  const t = clamp01(x);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function normalizeAngle(rad: number): number {
  return Math.atan2(Math.sin(rad), Math.cos(rad));
}

// FightKaro IK constants
export const UPPER_LEG = 0.45; // Je
export const LOWER_LEG = 0.45; // Ye
export const HIP_OFFSET = 0.07; // Xe
export const HIP_BASE_Y = 0.97; // Ze

export function solveLegIK(legY: number, legZ: number, offset: number = 0): { thF: number; kn: number } {
  const dy = Math.max(0.05, legY - HIP_OFFSET - offset);
  const dz = legZ;
  const maxReach = UPPER_LEG + LOWER_LEG - 1e-6;
  const reach = Math.min(maxReach, Math.max(0.05, Math.hypot(dy, dz)));
  const cosKnee = (UPPER_LEG * UPPER_LEG + LOWER_LEG * LOWER_LEG - reach * reach) / (2 * UPPER_LEG * LOWER_LEG);
  const kn = Math.PI - Math.acos(Math.max(-1, Math.min(1, cosKnee)));
  const angle = Math.atan2(dz, dy);
  const cosThigh = (UPPER_LEG * UPPER_LEG + reach * reach - LOWER_LEG * LOWER_LEG) / (2 * UPPER_LEG * reach);
  const thF = angle + Math.acos(Math.max(-1, Math.min(1, cosThigh)));
  return { thF, kn };
}

export function solveLegs(
  rootY: number,
  leftZ: number,
  rightZ: number,
  leftOff: number = 0,
  rightOff: number = 0
): {
  lThF: number;
  lKn: number;
  lAnk: number;
  rThF: number;
  rKn: number;
  rAnk: number;
} {
  const hipY = HIP_BASE_Y + rootY;
  const l = solveLegIK(hipY, leftZ, leftOff);
  const r = solveLegIK(hipY, rightZ, rightOff);
  return {
    lThF: l.thF,
    lKn: l.kn,
    lAnk: l.thF - l.kn,
    rThF: r.thF,
    rKn: r.kn,
    rAnk: r.thF - r.kn,
  };
}

export function solveSingleLeg(rootY: number, z: number): { lThF: number; lKn: number; lAnk: number } {
  const hipY = HIP_BASE_Y + rootY;
  const s = solveLegIK(hipY, z);
  return { lThF: s.thF, lKn: s.kn, lAnk: s.thF - s.kn };
}

