import { CpuDifficulty, InputState } from '../types';
import { Fighter } from '../combat/Fighter';

interface AiProfile {
  breakChance: number;
  reaction: number;
  blockChance: number;
  punishChance: number;
  aggression: number;
  superChance: number;
}

const AI_PROFILES: Record<CpuDifficulty, AiProfile> = {
  easy: {
    breakChance: 0.08,
    reaction: 0.42,
    blockChance: 0.18,
    punishChance: 0.2,
    aggression: 0.45,
    superChance: 0.35,
  },
  normal: {
    breakChance: 0.3,
    reaction: 0.26,
    blockChance: 0.45,
    punishChance: 0.5,
    aggression: 0.65,
    superChance: 0.7,
  },
  hard: {
    breakChance: 0.6,
    reaction: 0.14,
    blockChance: 0.75,
    punishChance: 0.85,
    aggression: 0.8,
    superChance: 1.0,
  },
};

type PlanKind = 'wait' | 'approach' | 'retreat' | 'block' | 'lowBlock' | 'attack' | 'jumpIn' | 'super';

interface QueuedButton {
  at: number;
  button: 'punch' | 'kick' | 'grab';
  forward?: boolean;
  down?: boolean;
  fired?: boolean;
}

interface AiPlan {
  kind: PlanKind;
  duration: number;
  buttons: QueuedButton[];
}

export class Bot {
  public difficulty: CpuDifficulty;
  private profile: AiProfile;
  private plan: AiPlan = { kind: 'wait', duration: 0, buttons: [] };
  private planElapsed: number = 0;
  private sinceDecision: number = 99;

  constructor(difficulty: CpuDifficulty = 'normal') {
    this.difficulty = difficulty;
    this.profile = AI_PROFILES[difficulty] || AI_PROFILES.normal;
  }

  public setDifficulty(difficulty: CpuDifficulty): void {
    this.difficulty = difficulty;
    this.profile = AI_PROFILES[difficulty] || AI_PROFILES.normal;
    this.reset();
  }

  public reset(): void {
    this.plan = { kind: 'wait', duration: 0, buttons: [] };
    this.planElapsed = 0;
    this.sinceDecision = 0;
  }

  public think(bot: Fighter, opponent: Fighter, dt: number): InputState {
    this.planElapsed += dt;
    this.sinceDecision += dt;

    if (this.sinceDecision >= this.profile.reaction && this.planElapsed >= this.plan.duration) {
      this.decide(bot, opponent);
    }

    return this.executePlan(bot, opponent);
  }

  private setPlan(kind: PlanKind, duration: number, buttons: QueuedButton[] = []): void {
    this.plan = { kind, duration, buttons };
    this.planElapsed = 0;
  }

  private decide(bot: Fighter, opponent: Fighter): void {
    this.sinceDecision = 0;
    const dist = Math.abs(opponent.x - bot.x);
    const rng = Math.random();

    // 1. Super attack when SHAKTI is full
    if (
      !bot.peaceful &&
      bot.meter >= 100 &&
      opponent.state !== 'knockdown' &&
      opponent.state !== 'getup' &&
      rng < this.profile.superChance
    ) {
      this.setPlan('super', 0.2);
      return;
    }

    // 2. React to Opponent Attacks (Block, Anti-Air, Grab Tech)
    if (opponent.currentAttack) {
      const oppAttack = opponent.currentAttack.move;

      // Grab break
      if (oppAttack.grab && dist < 1.4 && rng < this.profile.breakChance) {
        this.setPlan('attack', 0.2, [{ at: 0, button: 'grab' }]);
        return;
      }

      // Block incoming hit
      if (dist < oppAttack.reach + 0.6 && rng < this.profile.blockChance) {
        const isLow = oppAttack.height === 'low';
        this.setPlan(isLow ? 'lowBlock' : 'block', 0.35);
        return;
      }
    }

    // 3. Anti-Air when opponent is jumping
    if (opponent.state === 'jump' && opponent.y > 0.2 && dist < 2.2) {
      if (rng < this.profile.punishChance && dist < 1.5) {
        // Anti-air punch
        this.setPlan('attack', 0.35, [{ at: 0, button: 'punch' }]);
        return;
      } else if (rng < this.profile.blockChance) {
        this.setPlan('block', 0.4);
        return;
      }
    }

    // 4. Punish Whiffed Recoveries or Getups
    if (
      (opponent.attackPhase === 'recovery' || opponent.state === 'getup') &&
      dist < 1.8 &&
      rng < this.profile.punishChance
    ) {
      this.planAttack(dist);
      return;
    }

    // 5. Far Distance: Approach, Jump-in, or Wait
    if (dist > 2.0) {
      if (dist < 3.4 && rng < 0.15 * this.profile.aggression) {
        this.setPlan('jumpIn', 0.8, [{ at: 0.25, button: 'kick' }]);
      } else if (rng < 0.2) {
        this.setPlan('wait', 0.2 + rng * 0.3);
      } else {
        this.setPlan('approach', 0.3 + rng * 0.4);
      }
      return;
    }

    // 6. Close / Neutral Distance: Attack, Retreat, or Guard
    if (rng < this.profile.aggression) {
      this.planAttack(dist);
    } else if (rng < this.profile.aggression + 0.2) {
      this.setPlan('retreat', 0.25 + rng * 0.25);
    } else if (rng < this.profile.aggression + 0.35) {
      this.setPlan('block', 0.3);
    } else {
      this.setPlan('wait', 0.2);
    }
  }

  private planAttack(dist: number): void {
    const roll = Math.random();
    if (dist < 1.1 && roll < 0.25) {
      // Close range Grab
      this.setPlan('attack', 0.3, [{ at: 0, button: 'grab' }]);
    } else if (dist < 1.3 && roll < 0.5) {
      // Light combo starter: punch -> kick
      this.setPlan('attack', 0.5, [
        { at: 0, button: 'punch' },
        { at: 0.15, button: 'kick' },
      ]);
    } else if (roll < 0.75) {
      // Forward special attack
      this.setPlan('attack', 0.4, [{ at: 0, button: 'punch', forward: true }]);
    } else {
      // Low sweep
      this.setPlan('attack', 0.35, [{ at: 0, button: 'kick', down: true }]);
    }
  }

  private executePlan(bot: Fighter, opponent: Fighter): InputState {
    const input: InputState = {
      moveX: 0,
      up: false,
      down: false,
      punch: false,
      kick: false,
      grab: false,
      super: false,
    };

    const towardOpponent = opponent.x > bot.x ? 1 : -1;
    const awayFromOpponent = -towardOpponent;

    switch (this.plan.kind) {
      case 'approach':
        input.moveX = towardOpponent;
        break;

      case 'retreat':
        input.moveX = awayFromOpponent;
        break;

      case 'block':
        input.moveX = awayFromOpponent; // Hold back to block
        break;

      case 'lowBlock':
        input.moveX = awayFromOpponent;
        input.down = true; // Hold down-back to low block
        break;

      case 'jumpIn':
        input.up = true;
        input.moveX = towardOpponent;
        break;

      case 'super':
        input.super = true;
        break;

      case 'attack':
        break;

      case 'wait':
      default:
        break;
    }

    for (const btn of this.plan.buttons) {
      if (!btn.fired && this.planElapsed >= btn.at) {
        btn.fired = true;
        input[btn.button] = true;
        if (btn.forward) input.moveX = towardOpponent;
        if (btn.down) input.down = true;
      }
    }
    return input;
  }
}

