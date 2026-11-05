import { AttackPhase, CombatMove, FighterDefinition, FighterState, InputState } from '../types';
import { COMBAT_MOVES, getMoveTotalFrames, resolveMove } from './moves';
import { clampStagePosition, FIXED_DELTA_TIME, GRAVITY, STAGE_BOUND_X, STAGE_FLOOR_Y } from './physics';

export interface ActiveAttack {
  move: CombatMove;
  frame: number;
  hasHit: boolean;
  blocked: boolean;
}

export interface FighterSnapshot {
  bufferedButton?: string | null;
  bufferTimer?: number;
  comboTimer?: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: number;
  hp: number;
  meter: number;
  state: FighterState;
  peaceful: boolean;
  peaceCharge: number;
  stunFrames: number;
  invulnerableFrames: number;
  airborne: boolean;
  crouching: boolean;
  holdingBack: boolean;
  walkDistance: number;
  moveRel: number;
  attackHasHit: boolean;
  attackBlocked: boolean;
  stateFrames: number;
  attackId?: string | null;
  attackFrame?: number;
  comboHits?: number;
}

export class Fighter {
  public id: string;
  public definition: FighterDefinition;
  public isPlayer: boolean;
  public side: 'left' | 'right';

  // Position & Physics
  public x: number = 0;
  public y: number = 0;
  public vx: number = 0;
  public vy: number = 0;
  public facing: number = 1; // 1 = facing right, -1 = facing left

  // Combat Stats
  public health: number = 100;
  public maxHealth: number = 100;
  public meter: number = 0;
  public maxMeter: number = 100;
  public wins: number = 0;

  // States
  public state: FighterState = 'idle';
  public stateFrames: number = 0;
  public stunFrames: number = 0;
  public invulnerableFrames: number = 0;
  public comboHits: number = 0;
  public comboTimer: number = 0;

  // Attack execution
  public currentAttack: ActiveAttack | null = null;
  public bufferedButton: string | null = null;
  public bufferTimer: number = 0;

  // Peace / Ahimsa boss mode
  public peaceful: boolean = false;
  public peaceCharge = 0;

  // Flags derived from input & state
  public holdingBack: boolean = false;
  public crouching: boolean = false;
  public airborne: boolean = false;
  public wantsSuper: boolean = false;
  public walkDistance: number = 0;
  public moveRel: number = 0;
  public lastHitHeight: 'high' | 'mid' | 'low' = 'mid';

  public get grounded(): boolean {
    return !this.airborne && this.y <= STAGE_FLOOR_Y;
  }

  constructor(definition: FighterDefinition, isPlayer: boolean, side: 'left' | 'right') {
    this.id = definition.id;
    this.definition = definition;
    this.maxHealth = definition.maxHealth ?? 100;
    this.health = this.maxHealth;
    this.isPlayer = isPlayer;
    this.side = side;
    this.resetPosition();
  }

  public resetPosition(): void {
    this.x = this.side === 'left' ? -2.2 : 2.2;
    this.y = STAGE_FLOOR_Y;
    this.vx = 0;
    this.vy = 0;
    this.facing = this.side === 'left' ? 1 : -1;
    this.state = 'idle';
    this.stateFrames = 0;
    this.currentAttack = null;
    this.stunFrames = 0;
    this.invulnerableFrames = 0;
    this.airborne = false;
    this.holdingBack = false;
    this.crouching = false;
    this.wantsSuper = false;
    this.walkDistance = 0;
    this.moveRel = 0;
    this.lastHitHeight = 'mid';
    this.peaceCharge = 0;
    this.peaceful = false;
  }

  public resetRound(): void {
    this.resetPosition();
    this.health = this.maxHealth;
    this.comboHits = 0;
    this.comboTimer = 0;
    this.bufferedButton = null;
    this.bufferTimer = 0;
  }

  public get isAttackActive(): boolean {
    if (!this.currentAttack) return false;
    const { move, frame } = this.currentAttack;
    return frame >= move.startup && frame < move.startup + move.active;
  }

  public get attackPhase(): AttackPhase {
    if (!this.currentAttack) return null;
    const { move, frame } = this.currentAttack;
    if (frame < move.startup) return 'startup';
    if (frame < move.startup + move.active) return 'active';
    return 'recovery';
  }

  public get canBlock(): boolean {
    return this.actionable || this.state === 'blockstun';
  }

  public get actionable(): boolean {
    return this.state === 'idle' || this.state === 'walk' || this.state === 'crouch';
  }

  public get invulnerable(): boolean {
    return (
      this.invulnerableFrames > 0 ||
      this.state === 'knockdown' ||
      this.state === 'getup' ||
      this.state === 'ko' ||
      this.state === 'victory' ||
      this.state === 'super'
    );
  }

  public get isLow(): boolean {
    return this.crouching || this.state === 'crouch';
  }

  public forceState(newState: FighterState): void {
    if (this.state !== newState) {
      this.state = newState;
      this.stateFrames = 0;
    }
  }

  public addMeter(amount: number): void {
    this.meter = Math.max(0, Math.min(this.maxMeter, this.meter + amount));
  }

  public consumeSuper(): boolean {
    if (this.meter >= 100) {
      this.meter = 0;
      return true;
    }
    return false;
  }

  public takeDamage(amount: number): void {
    this.health = Math.max(0, Math.min(this.maxHealth, this.health - amount));
  }

  public applyHit(move: CombatMove, damage: number, attackerFacing: number): void {
    this.health = Math.max(0, this.health - damage);
    this.comboHits += 1;
    this.comboTimer = 35;
    this.currentAttack = null;
    this.stateFrames = 0;
    this.lastHitHeight = move.height;

    if (this.health <= 0) {
      this.forceState('ko');
      this.vx = attackerFacing * (move.knockdown ? 4.5 : 2.5);
      this.vy = move.knockdown ? 6.0 : 3.0;
      this.airborne = true;
      return;
    }

    if (move.knockdown || this.airborne) {
      this.forceState('knockdown');
      this.vx = attackerFacing * (move.push * 0.9 + 1.5);
      this.vy = move.launch > 0 ? move.launch : 4.5;
      this.stunFrames = 30;
      this.airborne = true;
    } else {
      this.forceState('hitstun');
      this.vx = attackerFacing * move.push;
      this.stunFrames = move.hitstun;
    }
  }

  public applyBlock(move: CombatMove, attackerFacing: number): void {
    this.currentAttack = null;
    this.forceState('blockstun');
    this.stateFrames = 0;
    this.stunFrames = move.blockstun;
    this.vx = attackerFacing * (move.push * 0.6);
  }

  public startAttack(moveId: string): void {
    const move = this.definition.moves?.[moveId] ?? COMBAT_MOVES[moveId];
    if (!move) return;

    if (this.health <= 0 || this.state === 'ko') return;
    this.forceState('attack');
    this.stateFrames = 0;
    this.currentAttack = {
      move,
      frame: 0,
      hasHit: false,
      blocked: false,
    };
    // Apply initial lunge
    if (move.lunge > 0 && !this.airborne) {
      this.vx = this.facing * move.lunge * 3.5;
    }
  }

  public update(inputs: InputState, opponent: Fighter): void {
    this.stateFrames++;
    if (!this.actionable && this.state !== 'jump' && this.state !== 'attack') {
      this.bufferedButton = null;
      this.bufferTimer = 0;
    }
    this.wantsSuper = inputs.super;

    // Manage combo hit decay
    if (this.comboTimer > 0) {
      this.comboTimer--;
      if (this.comboTimer <= 0) {
        this.comboHits = 0;
      }
    }

    // Manage invulnerability
    if (this.invulnerableFrames > 0) {
      this.invulnerableFrames--;
    }

    // Determine facing direction when actionable
    if (this.actionable) {
      const dx = opponent.x - this.x;
      if (Math.abs(dx) > 0.05) {
        this.facing = dx > 0 ? 1 : -1;
      }
    }

    // Input direction relative to facing
    this.moveRel = inputs.moveX * this.facing;
    this.holdingBack = this.moveRel < -0.1;
    this.crouching = !this.airborne && (this.actionable || this.state === 'blockstun'
      ? inputs.down : !!this.currentAttack?.move.crouching);
    if (this.state === 'walk') {
      this.walkDistance += Math.abs(this.vx) * FIXED_DELTA_TIME;
    }

    // Buffer attack inputs
    if (inputs.punch) this.bufferInput('punch');
    else if (inputs.kick) this.bufferInput('kick');
    else if (inputs.grab) this.bufferInput('grab');

    if (this.bufferTimer > 0) {
      this.bufferTimer--;
      if (this.bufferTimer <= 0) {
        this.bufferedButton = null;
      }
    }

    // Execute state logic
    switch (this.state) {
      case 'idle':
      case 'walk':
      case 'crouch':
        this.handleNeutralState(inputs, opponent);
        break;

      case 'jump':
        this.handleJumpState(inputs);
        break;

      case 'attack':
        this.handleAttackState(inputs);
        break;

      case 'hitstun':
      case 'blockstun':
        this.handleStunState();
        break;

      case 'knockdown':
        this.handleKnockdownState();
        break;

      case 'getup':
        this.handleGetupState();
        break;

      case 'ko':
      case 'victory':
      case 'super':
      case 'intro':
      case 'frozen':
        // Handled externally or stays stationary
        break;
    }

    // Apply physics
    this.integratePhysics();
  }

  private bufferInput(button: string): void {
    this.bufferedButton = button;
    this.bufferTimer = 9; // 9 frames buffer window matching reference
  }

  private handleNeutralState(inputs: InputState, opponent: Fighter): void {
    // Super check
    if (inputs.super && this.meter >= 100) {
      this.consumeSuper();
      this.forceState('super');
      return;
    }

    // Buffered attack check
    if (this.bufferedButton) {
      const isForward = inputs.moveX * this.facing > 0.3;
      const moveId = resolveMove(
        this.bufferedButton as 'punch' | 'kick' | 'grab',
        this.crouching,
        isForward,
        false
      );
      this.bufferedButton = null;
      this.bufferTimer = 0;
      this.startAttack(moveId);
      return;
    }

    // Jump check
    if (inputs.up && !this.airborne) {
      this.forceState('jump');
      this.vy = this.definition.stats.jumpV;
      this.vx = inputs.moveX * this.definition.stats.jumpVx;
      this.airborne = true;
      return;
    }

    // Crouch check
    if (inputs.down) {
      this.forceState('crouch');
      this.vx *= 0.7;
      return;
    }

    // Movement check
    if (Math.abs(inputs.moveX) > 0.1) {
      this.forceState('walk');
      const isFwd = inputs.moveX * this.facing > 0;
      const speed = isFwd ? this.definition.stats.walkFwd : this.definition.stats.walkBack;
      this.vx = Math.sign(inputs.moveX) * speed;
    } else {
      this.forceState('idle');
      this.vx = 0;
    }
  }

  private handleJumpState(inputs: InputState): void {
    // Air attack buffering
    if (this.bufferedButton === 'grab') {
      this.bufferedButton = null;
      this.bufferTimer = 0;
    }
    if (this.bufferedButton && this.currentAttack === null) {
      const moveId = resolveMove(
        this.bufferedButton as 'punch' | 'kick' | 'grab',
        false,
        false,
        true
      );
      this.bufferedButton = null;
      this.startAttack(moveId);
    }
  }

  private handleAttackState(inputs?: InputState): void {
    if (!this.currentAttack) {
      this.forceState('idle');
      return;
    }

    this.currentAttack.frame++;
    const totalFrames = getMoveTotalFrames(this.currentAttack.move);

    // Dynamic combo cancels:
    // Can cancel as soon as a hit confirms (hasHit) OR when active frames finish (recovery cancel)
    const canCancel =
      (this.currentAttack.hasHit ||
        this.currentAttack.frame >= this.currentAttack.move.startup + this.currentAttack.move.active) &&
      this.bufferedButton &&
      this.currentAttack.move.chains;

    if (canCancel && this.bufferedButton && this.currentAttack.move.chains) {
      let nextMove = this.currentAttack.move.chains[this.bufferedButton];

      // Branch into directional variations
      if (inputs && inputs.moveX * this.facing > 0.3) {
        if (this.bufferedButton === 'punch') nextMove = 'special1';
        else if (this.bufferedButton === 'kick') nextMove = 'finisher';
      } else if (inputs && inputs.down) {
        if (this.bufferedButton === 'punch') nextMove = 'lowJab';
        else if (this.bufferedButton === 'kick') nextMove = 'sweep';
      }

      if (nextMove) {
        this.bufferedButton = null;
        this.bufferTimer = 0;
        this.startAttack(nextMove);
        return;
      }
    }

    if (this.currentAttack.frame >= totalFrames) {
      this.currentAttack = null;
      this.forceState(this.airborne ? 'jump' : 'idle');
    }
  }

  private handleStunState(): void {
    this.stunFrames--;
    if (this.stunFrames <= 0) {
      this.forceState('idle');
    }
  }

  private handleKnockdownState(): void {
    // When landing on ground, start knockdown timer
    if (!this.airborne) {
      this.stunFrames--;
      if (this.stunFrames <= 0) {
        this.forceState('getup');
        this.stunFrames = 24;
        this.invulnerableFrames = 26;
      }
    }
  }

  private handleGetupState(): void {
    this.stunFrames--;
    if (this.stunFrames <= 0) {
      this.y = 0;
      this.vy = 0;
      this.airborne = false;
      this.forceState('idle');
    }
  }

  public advanceLockedPhysics(): void {
    this.stateFrames++;
    this.integratePhysics();
  }

  private integratePhysics(): void {
    // During super cinematic, kinematic positioning is managed by SuperDirector
    if (this.state === 'super') return;

    // Vertical gravity
    if (this.airborne || this.y > STAGE_FLOOR_Y || this.vy !== 0) {
      this.vy -= GRAVITY * FIXED_DELTA_TIME;
      this.y += this.vy * FIXED_DELTA_TIME;

      if (this.y <= STAGE_FLOOR_Y) {
        this.y = STAGE_FLOOR_Y;
        this.vy = 0;
        this.airborne = false;

        // If landing during jump or attack
        if (this.state === 'jump' || (this.state === 'attack' && this.currentAttack?.move.air)) {
          this.currentAttack = null;
          this.forceState('idle');
        }
      }
    }

    // Horizontal velocity
    this.x += this.vx * FIXED_DELTA_TIME;

    // Apply ground friction
    if (!this.airborne && this.state !== 'walk') {
      this.vx *= 0.82;
      if (Math.abs(this.vx) < 0.05) this.vx = 0;
    }

    // Boundary clamp
    this.x = clampStagePosition(this.x);
  }

  public getSnapshot(): FighterSnapshot {
    return {
      bufferedButton: this.bufferedButton,
      bufferTimer: this.bufferTimer,
      comboTimer: this.comboTimer,
      x: this.x,
      y: this.y,
      vx: this.vx,
      vy: this.vy,
      facing: this.facing,
      hp: this.health,
      meter: this.meter,
      state: this.state,
      peaceful: this.peaceful,
      peaceCharge: this.peaceCharge,
      stateFrames: this.stateFrames,
      stunFrames: this.stunFrames,
      invulnerableFrames: this.invulnerableFrames,
      airborne: this.airborne,
      crouching: this.crouching,
      holdingBack: this.holdingBack,
      walkDistance: this.walkDistance,
      moveRel: this.moveRel,
      attackHasHit: this.currentAttack?.hasHit ?? false,
      attackBlocked: this.currentAttack?.blocked ?? false,
      attackId: this.currentAttack ? this.currentAttack.move.id : null,
      attackFrame: this.currentAttack ? this.currentAttack.frame : 0,
      comboHits: this.comboHits,
    };
  }

  public applySnapshot(snap: FighterSnapshot, _isLocalControlled: boolean): void {
    this.bufferedButton = snap.bufferedButton ?? null;
    this.bufferTimer = snap.bufferTimer ?? 0;
    this.comboTimer = snap.comboTimer ?? 0;
    this.x = snap.x;
    this.y = snap.y;
    this.vx = snap.vx;
    this.vy = snap.vy;
    this.facing = snap.facing;
    this.health = Math.max(0, Math.min(this.maxHealth, snap.hp));
    this.meter = Math.max(0, Math.min(this.maxMeter, snap.meter));
    this.state = snap.state;
    this.peaceful = snap.peaceful;
    this.peaceCharge = snap.peaceCharge;
    this.stateFrames = snap.stateFrames;
    this.stunFrames = snap.stunFrames;
    this.invulnerableFrames = snap.invulnerableFrames;
    this.airborne = snap.airborne;
    this.crouching = snap.crouching;
    this.holdingBack = snap.holdingBack;
    this.walkDistance = snap.walkDistance;
    this.moveRel = snap.moveRel;
    this.comboHits = snap.comboHits ?? 0;
    this.currentAttack = snap.attackId && (this.definition.moves?.[snap.attackId] ?? COMBAT_MOVES[snap.attackId]) ? {
      move: this.definition.moves?.[snap.attackId] ?? COMBAT_MOVES[snap.attackId], frame: snap.attackFrame ?? 0,
      hasHit: snap.attackHasHit, blocked: snap.attackBlocked,
    } : null;
  }
}
