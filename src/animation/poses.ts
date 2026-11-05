import { Fighter } from '../combat/Fighter';
import {
  clamp01,
  createZeroPose,
  easeInOutCubic,
  easeOutCubic,
  lerpPose,
  mergePose,
  Pose,
  solveLegIK,
  solveLegs,
  solveSingleLeg,
  HIP_BASE_Y,
} from './kinematics';

export const GUARD_ARMS: Partial<Pose> = {
  lShF: 0.95,
  lShO: 0.18,
  lShT: 0.15,
  lEl: 1.35,
  lHand: 0,
  rShF: 0.85,
  rShO: 0.22,
  rShT: 0.15,
  rEl: 1.45,
  rHand: 0,
};

export const PEACE_ARMS: Partial<Pose> = {
  lShF: 0.45,
  lShO: 0.15,
  lShT: -0.85,
  lEl: 1.65,
  lHand: 1,
  lWf: 1.1,
  lWr: 0,
  rShF: 0.45,
  rShO: 0.15,
  rShT: -0.85,
  rEl: 1.65,
  rHand: 1,
  rWf: 1.1,
  rWr: 0,
};

/**
 * Standard Idle Stance with character-specific nuances and dynamic breathing
 */
export function getBaseIdlePose(time: number, charId: string = 'modi'): Pose {
  const breath = Math.sin(time * 4.2) * 0.012;
  const sway = Math.sin(time * 1.3);
  const armBob = Math.sin(time * 4.2 + 0.9);
  const rootY = -0.07 + breath;

  const base = mergePose(createZeroPose(), {
    rootY,
    hipsT: -0.25 + sway * 0.04,
    hipsS: sway * 0.025,
    spineF: 0.1 + breath * 1.5,
    spineT: -0.05 - sway * 0.03,
    spineS: -sway * 0.02,
    chestF: 0.04,
    headF: -0.08 - breath,
    headT: 0.3 + Math.sin(time * 0.7) * 0.05,
    lThO: 0.06,
    rThO: 0.1,
    ...GUARD_ARMS,
    ...solveLegs(rootY, 0.24 + sway * 0.015, -0.26 + sway * 0.015),
  });

  base.lShF += armBob * 0.04;
  base.rShF -= armBob * 0.035;
  base.lEl += armBob * 0.05;

  if (charId === 'modi') {
    base.spineF = 0.05 + breath;
  } else if (charId === 'didi') {
    base.spineF = 0.02 + breath;
    base.headF = -0.14 - breath;
    base.rootY += Math.max(0, Math.sin(time * 6.3)) * 0.008;
  } else if (charId === 'trump') {
    base.spineF = -0.02 + breath;
    base.chestF = -0.04;
    base.headF = -0.18 - breath;
    base.hipsS = Math.sin(time * 1.3) * 0.02;
  } else if (charId === 'yogi') {
    base.spineF = 0.03 + breath * 0.6;
    base.chestF = 0;
    base.headF = -0.05 - breath * 0.5;
    base.rootY -= breath * 0.4;
  } else {
    base.rootY += Math.max(0, Math.sin(time * 4.2)) * 0.012;
  }

  return base;
}

/**
 * Natural Forward/Backward Walk Cycle
 */
export function getWalkPose(time: number, walkDistance: number, moveRel: number, charId: string = 'modi'): Pose {
  const idle = getBaseIdlePose(time, charId);
  const phase = (walkDistance / 0.55) * Math.PI;
  const dir = moveRel >= 0 ? 1 : -1;
  const sinPhase = Math.sin(phase) * dir;
  const cosPhase = Math.cos(phase);
  const rootY = -0.07 + Math.abs(cosPhase) * 0.025;

  return mergePose(idle, {
    rootY,
    ...solveLegs(
      rootY,
      0.24 + sinPhase * 0.13,
      -0.26 - sinPhase * 0.13,
      Math.max(0, cosPhase) * 0.06,
      Math.max(0, -cosPhase) * 0.06
    ),
    hipsT: idle.hipsT + sinPhase * 0.08,
    spineT: -0.05 - sinPhase * 0.1,
    spineF: idle.spineF + dir * 0.05,
    spineS: cosPhase * 0.03,
    lShF: idle.lShF - sinPhase * 0.08,
    rShF: idle.rShF + sinPhase * 0.08,
  });
}

/**
 * Crouching Stance
 */
export function getCrouchPose(time: number, charId: string = 'modi', holdingBack: boolean = false): Pose {
  const rootY = -0.42 + Math.sin(time * 4) * 0.008;
  return mergePose(getBaseIdlePose(time, charId), {
    rootY,
    spineF: 0.42,
    headF: -0.3,
    lShF: holdingBack ? 1.3 : 1.0,
    lEl: holdingBack ? 2.2 : 1.7,
    rShF: holdingBack ? 1.1 : 0.8,
    rEl: 2.2,
    ...solveLegs(rootY, 0.3, -0.18),
  });
}

/**
 * High Defensive Block
 */
export function getBlockPose(time: number, charId: string = 'modi'): Pose {
  return mergePose(getBaseIdlePose(time, charId), {
    spineF: 0.18,
    headF: 0.2,
    lShF: 1.35,
    lShO: -0.05,
    lEl: 2.4,
    rShF: 1.25,
    rShO: -0.05,
    rEl: 2.45,
  });
}

/**
 * Airborne Jump Pose
 */
export function getJumpPose(vy: number, charId: string = 'modi'): Pose {
  const norm = clamp01(1 - Math.abs(vy) / 8);
  return mergePose(getBaseIdlePose(0, charId), {
    rootY: 0,
    spineF: 0.15,
    lThF: 0.5 + norm * 0.7,
    lKn: 0.6 + norm * 1.2,
    lAnk: 0.3,
    rThF: 0.2 + norm * 0.6,
    rKn: 0.8 + norm * 1.0,
    rAnk: 0.3,
    lShF: 1.3,
    lEl: 1.6,
    rShF: 1.0,
    rEl: 1.9,
  });
}

/**
 * Attack Keyframes Definitions
 */
export function getMovePoseDef(
  moveId: string,
  charId: string = 'modi'
): { windup: Partial<Pose>; strike: Partial<Pose> } {
  switch (moveId) {
    case 'jab':
      return {
        windup: { lShF: 1.2, lEl: 2.1, spineT: -0.1 },
        strike: {
          lShF: 1.58,
          lShO: -0.12,
          lShT: 0,
          lEl: 0.05,
          spineT: -0.38,
          hipsT: -0.35,
          rootZ: 0.06,
          headT: 0.4,
        },
      };

    case 'cross':
      return {
        windup: { rShF: 0.8, rEl: 2.3, spineT: -0.3 },
        strike: {
          rShF: 1.6,
          rShO: -0.3,
          rEl: 0.05,
          spineT: 0.45,
          hipsT: 0.15,
          rootZ: 0.1,
          lShF: 1.0,
          lEl: 2.2,
          headT: 0,
        },
      };

    case 'kick': {
      const y = -0.03;
      return {
        windup: { rThF: 1.3, rKn: 1.9, spineF: -0.05, rootY: y },
        strike: {
          rootY: y,
          rThF: 1.45,
          rKn: 0.15,
          rAnk: 0.2,
          spineF: -0.22,
          hipsT: 0.1,
          ...solveSingleLeg(y, 0.06),
        },
      };
    }

    case 'finisher':
    case 'special2': {
      const y = -0.02;
      const rot = charId === 'rahul' && moveId === 'special2' ? 0.9 : 0.6;
      return {
        windup: {
          rThF: 1.1,
          rThO: 0.4,
          rKn: 2.0,
          hipsT: rot * 0.5,
          spineT: -0.3,
          rootY: y,
        },
        strike: {
          rootY: y,
          rThF: 1.5,
          rThO: 0.75,
          rKn: 0.05,
          rAnk: 0.2,
          hipsT: rot,
          spineF: -0.38,
          spineS: 0.15,
          spineT: -0.2,
          lShO: 0.6,
          lShF: 0.6,
          lEl: 1.0,
          rShO: 0.5,
          rEl: 1.2,
          ...solveSingleLeg(y, -0.02),
        },
      };
    }

    case 'uppercut': {
      const y = -0.3;
      return {
        windup: {
          rootY: y,
          ...solveLegs(y, 0.32, -0.3),
          spineF: 0.4,
          spineT: -0.25,
          lShF: 0.2,
          lShO: 0.1,
          lEl: 1.7,
        },
        strike: {
          rootY: 0.03,
          ...solveLegs(0.03, 0.16, -0.3),
          spineF: -0.28,
          spineT: -0.3,
          hipsT: -0.4,
          lShF: 2.85,
          lShO: -0.1,
          lEl: 0.45,
          rShF: 0.9,
          rEl: 2.2,
          headF: -0.35,
          rootZ: 0.05,
        },
      };
    }

    case 'roundhouse':
      return {
        windup: {
          rootY: 0,
          hipsT: -0.9,
          spineT: 0.3,
          rThF: 0.7,
          rThO: 0.3,
          rKn: 1.7,
          ...solveSingleLeg(0, 0.05),
        },
        strike: {
          rootY: 0,
          hipsT: 1.1,
          spineT: -0.45,
          spineF: -0.5,
          spineS: 0.25,
          rThF: 1.75,
          rThO: 1.0,
          rKn: 0.05,
          rAnk: 0.2,
          lShF: 0.5,
          lShO: 1.0,
          lEl: 0.5,
          rShF: 0.3,
          rShO: 0.9,
          rEl: 0.6,
          headT: 0.6,
          ...solveSingleLeg(0, 0),
        },
      };

    case 'lowJab': {
      const y = -0.42;
      return {
        windup: { lShF: 0.9, lEl: 2.0, rootY: y, spineF: 0.42 },
        strike: {
          rootY: y,
          spineF: 0.5,
          lShF: 1.2,
          lShO: -0.1,
          lEl: 0.08,
          spineT: -0.35,
          ...solveLegs(y, 0.3, -0.18),
        },
      };
    }

    case 'sweep': {
      const y = -0.55;
      const legR = solveLegIK(HIP_BASE_Y + y, -0.32);
      return {
        windup: {
          rootY: -0.45,
          spineF: 0.5,
          hipsT: -0.3,
          ...solveLegs(-0.45, 0.3, -0.2),
        },
        strike: {
          rootY: y,
          spineF: 0.6,
          hipsT: 0.55,
          spineT: -0.4,
          lThF: 1.12,
          lThO: 0.35,
          lKn: 0.05,
          lAnk: 0.9,
          rThF: legR.thF,
          rKn: legR.kn,
          rAnk: legR.thF - legR.kn,
          lShF: 0.6,
          lShO: 0.6,
          lEl: 0.6,
          rShF: 0.4,
          rShO: 0.3,
          rEl: 0.5,
        },
      };
    }

    case 'special1':
      return charId === 'modi' || charId === 'didi' || charId === 'trump' || charId === 'yogi'
        ? {
            windup: { rShF: 0.2, rEl: 2.0, rHand: 1, spineT: -0.4, rootY: -0.12 },
            strike: {
              rShF: 1.55,
              rShO: -0.2,
              rShT: -0.4,
              rEl: 0,
              rHand: 1,
              spineT: 0.5,
              spineF: 0.2,
              hipsT: 0.2,
              rootZ: 0.15,
              rootY: -0.12,
              ...solveLegs(-0.12, 0.42, -0.36),
              headT: 0.05,
            },
          }
        : {
            windup: {
              rShF: 0.3,
              rEl: 1.6,
              rootY: -0.25,
              spineF: 0.35,
              spineT: -0.3,
              ...solveLegs(-0.25, 0.3, -0.3),
            },
            strike: {
              rShF: 2.75,
              rShO: -0.15,
              rEl: 0.6,
              spineF: -0.25,
              spineT: 0.35,
              rootY: 0.02,
              rootZ: 0.08,
              ...solveLegs(0.02, 0.2, -0.3),
              headF: -0.3,
            },
          };

    case 'grab':
      return {
        windup: {
          lShF: 0.9,
          lEl: 1.4,
          rShF: 0.9,
          rEl: 1.4,
          spineF: 0.05,
          lHand: 1,
          rHand: 1,
        },
        strike: {
          lShF: 1.5,
          lShO: -0.15,
          lEl: 0.25,
          rShF: 1.5,
          rShO: -0.15,
          rEl: 0.25,
          lHand: 1,
          rHand: 1,
          spineF: 0.28,
          spineT: 0,
          hipsT: -0.1,
          rootZ: 0.1,
          headT: 0.2,
        },
      };

    case 'landing':
      return { windup: {}, strike: {} };

    case 'airPunch':
      return {
        windup: { lShF: 0.9, lEl: 2.0 },
        strike: {
          lShF: 1.25,
          lShO: -0.1,
          lEl: 0.05,
          spineT: -0.3,
          spineF: 0.2,
        },
      };

    case 'airKick':
      return {
        windup: { lThF: 1.4, lKn: 1.9 },
        strike: {
          lThF: 1.15,
          lKn: 0.05,
          lAnk: 0.3,
          rThF: 0.6,
          rKn: 1.7,
          spineF: -0.2,
          lShF: 0.4,
          lShO: 0.5,
          rShF: 1.2,
          rEl: 1.8,
        },
      };

    default:
      return {
        windup: { rShF: 0.8, rEl: 2.0 },
        strike: { rShF: 1.5, rEl: 0.1 },
      };
  }
}

/**
 * Procedural Attack Motion Interpolation
 */
export function getAttackPose(fighter: Fighter, time: number): Pose {
  const attack = fighter.currentAttack;
  if (!attack) return getBaseIdlePose(time, fighter.definition.id);

  const move = attack.move;
  const charId = fighter.definition.id;
  const base = fighter.airborne
    ? getJumpPose(fighter.vy, charId)
    : fighter.crouching || move.crouching
    ? getCrouchPose(time, charId, false)
    : getBaseIdlePose(time, charId);

  const moveDef = fighter.definition.attackPoses?.[move.id] ?? getMovePoseDef(move.id, charId);
  const windup = mergePose(base, moveDef.windup);
  const strike = mergePose(base, moveDef.strike);

  const frame = attack.frame;
  if (frame <= move.startup) {
    const p = frame / Math.max(1, move.startup);
    return p < 0.6
      ? lerpPose(base, windup, easeOutCubic(p / 0.6))
      : lerpPose(windup, strike, easeOutCubic((p - 0.6) / 0.4));
  }

  if (frame <= move.startup + move.active) {
    return strike;
  }

  const recoveryProgress = (frame - move.startup - move.active) / Math.max(1, move.recovery);
  return lerpPose(strike, base, easeInOutCubic(recoveryProgress));
}

/**
 * Hit Stun Reaction with directional shockwave
 */
export function getHitstunPose(fighter: Fighter, time: number): Pose {
  const charId = fighter.definition.id;
  const base = getBaseIdlePose(time, charId);
  const frames = fighter.stateFrames;
  const startup = clamp01(frames / 4);
  const decay = clamp01((frames - 4) / Math.max(1, fighter.stunFrames));
  const recoil = Math.sin(frames * 0.9) * Math.exp(-frames * 0.18) * 0.25;
  const blend = (1 - decay * 0.75) * easeOutCubic(startup);

  const isLow = fighter.lastHitHeight === 'low';
  const isHigh = fighter.lastHitHeight === 'high';
  const rootY = isLow ? -0.18 : -0.1;

  const hitPose = mergePose(base, {
    spineF: isLow ? 0.55 : isHigh ? -0.5 : -0.3,
    spineT: base.spineT + (isHigh ? 0.25 : 0.1),
    chestF: isLow ? 0.2 : -0.2,
    headF: isLow ? 0.45 : isHigh ? -0.7 : -0.45,
    headT: base.headT + (isHigh ? 0.35 : 0.15),
    headS: 0.25 + recoil,
    lShF: 0.45,
    lShO: 0.55,
    lEl: 0.75,
    rShF: 0.25,
    rShO: 0.7,
    rEl: 0.55,
    rootY,
    ...solveLegs(rootY, 0.16, -0.34),
    lHand: 1,
    rHand: 1,
  });

  const res = lerpPose(base, hitPose, blend);
  res.spineS += recoil * 0.4;
  return res;
}

/**
 * Knockdown & Floor Poses
 */
function getAirKnockdownPose(fighter: Fighter): Pose {
  const t = clamp01(fighter.stateFrames / 20);
  return mergePose(createZeroPose(), {
    rootY: -0.1,
    hipsF: -0.4 - t * 1.0,
    spineF: -0.3,
    headF: -0.5,
    lShF: 2.2,
    lShO: 0.7,
    lEl: 0.5,
    lHand: 1,
    rShF: 2.0,
    rShO: 0.8,
    rEl: 0.6,
    rHand: 1,
    lThF: 0.7,
    lKn: 0.9,
    rThF: 0.4,
    rKn: 0.6,
  });
}

function getFloorLiePose(time: number, shudder: number = 0): Pose {
  return mergePose(createZeroPose(), {
    rootY: -(HIP_BASE_Y - 0.13),
    hipsF: -Math.PI / 2,
    spineF: 0.04,
    headF: -0.15 + Math.sin(time * 30) * shudder,
    headT: 0.5,
    lShF: 0.3,
    lShO: 1.1,
    lEl: 0.4,
    lHand: 1,
    rShF: 0.5,
    rShO: 1.0,
    rEl: 0.7,
    rHand: 1,
    lThF: 0.15,
    lThO: 0.15,
    lKn: 0.2,
    lAnk: 0.4,
    rThF: 0.35,
    rThO: 0.1,
    rKn: 0.7,
    rAnk: 0.4,
  });
}

export function getKnockdownPose(fighter: Fighter, time: number): Pose {
  if (fighter.airborne) return getAirKnockdownPose(fighter);
  const downProgress = clamp01((fighter.stateFrames || 1) / 8);
  return lerpPose(getAirKnockdownPose(fighter), getFloorLiePose(time), easeOutCubic(downProgress));
}

export function getGetupPose(fighter: Fighter, time: number): Pose {
  const p = Math.min(1, fighter.stateFrames / 24);
  const crouch = mergePose(getCrouchPose(time, fighter.definition.id, true), {
    rootY: -0.6,
    hipsF: -0.4,
    spineF: 0.8,
  });
  return p < 0.5
    ? lerpPose(getFloorLiePose(time), crouch, easeInOutCubic(p / 0.5))
    : lerpPose(crouch, getBaseIdlePose(time, fighter.definition.id), easeInOutCubic((p - 0.5) / 0.5));
}

export function getGrabHoldPose(time: number, charId: string = 'modi'): Pose {
  return mergePose(getBaseIdlePose(time, charId), {
    rootY: -0.1,
    spineF: -0.2,
    headF: -0.35,
    lShF: 0.8,
    lShO: 0.7,
    lEl: 1.3,
    lHand: 1,
    rShF: 0.9,
    rShO: 0.6,
    rEl: 1.4,
    rHand: 1,
  });
}

export function getIntroPose(time: number, charId: string = 'modi'): Pose {
  const base = getBaseIdlePose(time, charId);
  if (charId === 'modi') {
    const bob = Math.sin(time * 2) * 0.08;
    return mergePose(base, {
      rootY: 0,
      ...solveLegs(0, 0.1, -0.1),
      hipsT: 0,
      spineT: 0,
      spineF: -0.05,
      headT: 0.6,
      headF: -0.1,
      lShF: 0.5 + bob,
      lShO: 1.0,
      lShT: 0.6,
      lEl: 0.5,
      lHand: 1,
      rShF: 0.5 - bob,
      rShO: 1.0,
      rShT: 0.6,
      rEl: 0.5,
      rHand: 1,
    });
  }
  if (charId === 'didi') {
    const sway = Math.sin(time * 9) * 0.22;
    return mergePose(base, {
      rootY: 0,
      ...solveLegs(0, 0.1, -0.12),
      hipsT: 0.1,
      hipsS: 0.05,
      spineT: 0.05,
      spineS: -0.05,
      headT: 0.45,
      headF: -0.18,
      headS: sway * 0.25,
      rShF: 1.45,
      rShO: 0.05,
      rShT: sway,
      rEl: 0.55,
      rHand: 0.35,
      lShF: -0.15,
      lShO: 0.55,
      lShT: -0.4,
      lEl: 1.75,
      lHand: 0,
    });
  }
  if (charId === 'trump') {
    const bob = Math.sin(time * 3.2);
    return mergePose(base, {
      rootY: 0,
      ...solveLegs(0, 0.12, -0.12),
      hipsT: 0,
      spineT: 0.05,
      spineF: -0.06,
      chestF: -0.05,
      headT: 0.55,
      headF: -0.22 + Math.abs(bob) * 0.05,
      headS: bob * 0.06,
      lShF: 1.05,
      lShO: 0.25 + bob * 0.22,
      lShT: 0.35,
      lEl: 1.1,
      lHand: 1,
      rShF: 1.05,
      rShO: 0.25 + bob * 0.22,
      rShT: 0.35,
      rEl: 1.1,
      rHand: 1,
    });
  }
  return mergePose(base, {
    rootY: 0,
    ...solveLegs(0, 0.12, -0.12),
    hipsT: 0,
    spineT: 0.1,
    headT: 0.6,
    rShF: 1.3,
    rShO: 0.3,
    rShT: 0,
    rEl: 1.4,
    rHand: 1,
    lShF: 0.1,
    lShO: 0.15,
    lEl: 0.2,
    lHand: 1,
  });
}

export function getVictoryPose(time: number, charId: string = 'modi'): Pose {
  const beat = (time * 132) / 60;
  const base = getBaseIdlePose(time, charId);

  if (charId === 'modi') {
    const cycle = beat % 4;
    const dir = Math.floor(beat) % 2 === 0 ? 1 : -1;
    const frac = beat % 1;
    const rootY = -0.08 + Math.abs(Math.sin(beat * Math.PI)) * 0.05;
    const vBase = mergePose(base, { hipsT: 0, spineT: 0, headT: 0.6, headF: -0.05 });
    if (cycle < 2) {
      const step = dir * 0.14;
      return mergePose(vBase, {
        rootY,
        ...solveLegs(rootY, 0.12 + step, -0.12 + step),
        lShF: 0.8 + Math.sin(frac * Math.PI) * 0.4,
        lEl: 1.4,
        rShF: 0.8 - Math.sin(frac * Math.PI) * 0.4,
        rEl: 1.4,
      });
    }
  }

  // Celebratory general dance
  const danceSwing = Math.sin(time * 6.0);
  return mergePose(base, {
    rootY: 0,
    lShF: 1.4 + danceSwing * 0.3,
    lEl: 0.3,
    rShF: 1.4 - danceSwing * 0.3,
    rEl: 0.3,
    spineS: danceSwing * 0.12,
    headF: -0.2,
  });
}

/**
 * Master Pose Selector for Active Fighter State
 */
export function getPoseForFighter(
  fighter: Fighter,
  time: number,
  threatened: boolean = false
): { pose: Pose; rate: number } {
  const charId = fighter.definition.id;
  const t = time + (fighter.side === 'left' ? 0 : 0.7);

  let pose: Pose;
  let rate = 14;

  if (fighter.peaceful) return { pose: mergePose(getBaseIdlePose(t, charId), PEACE_ARMS), rate: 14 };

  switch (fighter.state) {
    case 'idle':
      pose = fighter.holdingBack && threatened ? getBlockPose(t, charId) : getBaseIdlePose(t, charId);
      break;

    case 'walk':
      pose =
        fighter.holdingBack && threatened
          ? getBlockPose(t, charId)
          : getWalkPose(t, fighter.walkDistance, fighter.moveRel, charId);
      break;

    case 'crouch':
      pose = getCrouchPose(t, charId, fighter.holdingBack);
      break;

    case 'jump':
      pose =
        fighter.currentAttack && fighter.attackPhase !== 'recovery'
          ? getAttackPose(fighter, t)
          : getJumpPose(fighter.vy, charId);
      break;

    case 'attack':
      pose = getAttackPose(fighter, t);
      rate = 30;
      break;

    case 'hitstun':
      pose = getHitstunPose(fighter, t);
      rate = 32;
      break;

    case 'blockstun':
      pose = fighter.crouching ? getCrouchPose(t, charId, true) : getBlockPose(t, charId);
      rate = 32;
      break;

    case 'knockdown':
    case 'ko':
      pose = getKnockdownPose(fighter, t);
      rate = 10;
      break;

    case 'getup':
      pose = getGetupPose(fighter, t);
      break;

    case 'victory':
      pose = getVictoryPose(t, charId);
      rate = 22;
      break;

    case 'intro':
      pose = getIntroPose(t, charId);
      break;

    case 'frozen':
      pose = getGrabHoldPose(t, charId);
      break;

    case 'super':
      pose = getBaseIdlePose(t, charId);
      rate = 20;
      break;

    default:
      pose = getBaseIdlePose(t, charId);
  }

  return { pose, rate };
}
