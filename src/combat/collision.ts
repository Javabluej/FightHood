import { AttackHeight, CombatMove, HitResult } from '../types';
import { CORNER_PUSH_THRESHOLD } from './physics';
import { Fighter, ActiveAttack } from './Fighter';

export const GRAB_BASE_DAMAGE: Record<string, number> = {
  modi: 16,
  rahul: 13,
  didi: 15,
  trump: 12,
  yogi: 14,
  nitin: 13,
  mbapu: 14,
};

export const HIT_HEIGHT_Y: Record<AttackHeight, number> = {
  high: 1.55,
  mid: 1.15,
  low: 0.35,
};

export function getAttackHeight(fighter: Fighter): AttackHeight | null {
  if (!fighter.currentAttack) return null;
  return fighter.currentAttack.move.air ? 'mid' : fighter.currentAttack.move.height;
}

export function canHit(attacker: Fighter, defender: Fighter): boolean {
  const attack = attacker.currentAttack;
  if (!attack || attack.hasHit || !attacker.isAttackActive || defender.invulnerable) {
    return false;
  }

  // Reach check in direction of facing
  const relativeX = (defender.x - attacker.x) * attacker.facing;
  const extraReach = attack.move.id !== 'grab' && attacker.definition.id === 'mbapu' ? 0.35 : 0;

  if (
    relativeX < -0.15 ||
    relativeX > attack.move.reach + extraReach + 0.34 ||
    (attack.move.grab && (defender.state === 'hitstun' || defender.state === 'blockstun' || defender.airborne || defender.y > 0.01))
  ) {
    return false;
  }

  const height = getAttackHeight(attacker);
  if (!height) return false;

  if (attack.move.grab) return attacker.grounded && defender.grounded;

  // Jumpers evade low attacks
  if (defender.y > 0.25 && height === 'low') return false;
  // Crouchers evade high attacks
  if (defender.isLow && height === 'high') return false;
  const strikeY = attacker.y + HIT_HEIGHT_Y[height];
  const hurtTop = defender.y + (defender.isLow ? 1.05 : 1.85) * (defender.definition.modelHeight ?? 1);
  if (strikeY + 0.18 < defender.y || strikeY - 0.18 > hurtTop) return false;

  return true;
}

export function canBlock(defender: Fighter, attackHeight: AttackHeight): boolean {
  if (!defender.canBlock || !defender.holdingBack || defender.airborne) {
    return false;
  }
  // Low block guards against low attacks
  if (defender.crouching) {
    return attackHeight === 'low';
  }
  // Standing block guards against high and mid attacks
  return attackHeight === 'high' || attackHeight === 'mid';
}

export function comboScale(hits: number): number {
  return Math.max(0.5, Math.pow(0.88, hits));
}

export function calculateDamage(attacker: Fighter, defender: Fighter, rawDamage: number): number {
  const bossScaling = defender.definition.id === 'mbapu' ? 0.8 : 1.0;
  return Math.max(
    1,
    Math.round(rawDamage * attacker.definition.stats.damageMul * comboScale(defender.comboHits) * bossScaling)
  );
}

export function applyCornerPush(attacker: Fighter, defender: Fighter, pushAmount: number): void {
  if (Math.abs(defender.x) >= CORNER_PUSH_THRESHOLD) {
    // If defender is against the corner, attacker gets pushed back!
    attacker.vx = -attacker.facing * pushAmount;
  }
}

interface HitCandidate { attack: ActiveAttack; height: AttackHeight; blocked: boolean }

function captureHit(attacker: Fighter, defender: Fighter): HitCandidate | null {
  if (!canHit(attacker, defender)) return null;
  const height = getAttackHeight(attacker)!;
  return { attack: attacker.currentAttack!, height, blocked: canBlock(defender, height) };
}

/** Capture simultaneous strikes before either hit interrupts the other fighter. */
export function resolveCombatExchange(p1: Fighter, p2: Fighter): [HitResult | null, HitResult | null] {
  const first = captureHit(p1, p2);
  const second = captureHit(p2, p1);
  if (first && second && !first.attack.move.grab && !second.attack.move.grab) {
    return [resolveCombatHit(p1, p2, first), resolveCombatHit(p2, p1, second)];
  }
  return [resolveCombatHit(p1, p2), resolveCombatHit(p2, p1)];
}

export function resolveCombatHit(attacker: Fighter, defender: Fighter, candidate = captureHit(attacker, defender)): HitResult | null {
  if (!candidate || candidate.attack.hasHit) return null;
  const { attack, height } = candidate;
  attack.hasHit = true;
  const facing = attacker.facing;
  const isBlocked = candidate.blocked;
  const hitY = defender.y + (attack.move.air ? 1.35 : HIT_HEIGHT_Y[height]);
  const hitX = defender.x - facing * 0.25;

  // Handle GRAB moves
  if (attack.move.grab) {
    const defenderAttemptingGrab =
      !!defender.currentAttack?.move.grab && defender.attackPhase !== 'recovery';

    // Grab break / tech
    if (defender.bufferedButton === 'grab' || defenderAttemptingGrab) {
      attacker.currentAttack = null;
      attacker.bufferedButton = null;
      attacker.forceState('blockstun');
      attacker.stunFrames = 14;
      attacker.vx = -facing * 2.6;

      defender.currentAttack = null;
      defender.bufferedButton = null;
      defender.forceState('blockstun');
      defender.stunFrames = 14;
      defender.vx = facing * 2.6;

      return {
        attacker,
        defender,
        moveId: 'grab',
        blocked: true,
        grab: 'break',
        damage: 0,
        knockdown: false,
        ko: false,
        x: (attacker.x + defender.x) / 2,
        y: 1.2,
      };
    }

    // Grab successfully connected (unblockable throw)
    const baseDmg = attacker.definition.grabDamage ?? GRAB_BASE_DAMAGE[attacker.definition.id] ?? 14;
    const damage = calculateDamage(attacker, defender, baseDmg);

    defender.takeDamage(damage);
    defender.forceState(defender.health <= 0 ? 'ko' : 'knockdown');
    defender.stunFrames = 30;
    defender.invulnerableFrames = 12;
    defender.vx = attacker.facing * 5.2;
    defender.vy = 4.5;
    defender.airborne = true;

    attacker.addMeter(8);
    defender.addMeter(5);
    defender.comboHits++;
    attacker.comboTimer = 75;
    defender.comboTimer = 75;

    return {
      attacker,
      defender,
      moveId: 'grab',
      blocked: false,
      grab: 'connect',
      damage,
      knockdown: true,
      ko: defender.health <= 0,
      x: hitX,
      y: 1.2,
    };
  }

  // Handle BLOCKED attack
  if (isBlocked) {
    attack.blocked = true;
    defender.applyBlock(attack.move, facing);
    attacker.addMeter(2);
    defender.addMeter(3);
    applyCornerPush(attacker, defender, attack.move.push * 0.6);

    return {
      attacker,
      defender,
      moveId: attack.move.id,
      blocked: true,
      damage: 0,
      knockdown: false,
      ko: false,
      x: hitX,
      y: hitY,
    };
  }

  // Handle CONNECTED HIT
  const damage = calculateDamage(attacker, defender, attack.move.damage);
  defender.applyHit(attack.move, damage, facing);

  attacker.addMeter(damage * 0.9 + 2);
  defender.addMeter(damage * 0.6);
  applyCornerPush(attacker, defender, attack.move.push * 0.8);

  return {
    attacker,
    defender,
    moveId: attack.move.id,
    blocked: false,
    damage,
    knockdown: defender.state === 'knockdown',
    ko: defender.state === 'ko',
    x: hitX,
    y: hitY,
  };
}

