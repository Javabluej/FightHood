export type CharacterId = 'modi' | 'rahul' | 'didi' | 'trump' | 'yogi' | 'nitin' | 'mbapu' | string;

export type StageId = 'sansad' | 'jantar' | 'road' | string;

export type CpuDifficulty = 'easy' | 'normal' | 'hard';

export type AttackHeight = 'high' | 'mid' | 'low';

export type FighterState =
  | 'idle'
  | 'walk'
  | 'crouch'
  | 'jump'
  | 'attack'
  | 'hitstun'
  | 'blockstun'
  | 'knockdown'
  | 'getup'
  | 'ko'
  | 'super'
  | 'frozen'
  | 'victory'
  | 'intro';

export type AttackPhase = 'startup' | 'active' | 'recovery' | null;

export interface CombatMove {
  id: string;
  name?: string;
  startup: number;
  active: number;
  recovery: number;
  damage: number;
  height: AttackHeight;
  reach: number;
  hitstun: number;
  blockstun: number;
  knockdown: boolean;
  launch: number;
  push: number;
  lunge: number;
  air?: boolean;
  crouching?: boolean;
  grab?: boolean;
  chains?: Record<string, string>;
}

export interface FighterLook {
  skin: number;
  skinShade: number;
  hair: number;
  hairStyle: string;
  beard: number;
  beardStyle: string;
  brows: number;
  topStyle: string;
  top: number;
  jacket: number;
  pants: number;
  shoes: number;
  glasses: boolean;
  shoulders: number;
  belly: number;
  scale: number;
}

export interface FighterStats {
  walkFwd: number;
  walkBack: number;
  jumpV: number;
  jumpVx: number;
  damageMul: number;
}

export interface FighterMoveNames {
  special1: string;
  special2: string;
  finisher: string;
  sweep: string;
  uppercut: string;
  grab: string;
  roundhouse: string;
  jab?: string;
  cross?: string;
  kick?: string;
  lowJab?: string;
}

export interface FighterDance {
  label: string;
  colors: number[];
}

export interface FighterDefinition {
  id: CharacterId;
  name: string;
  fullName: string;
  party: string;
  accent: string;
  look: FighterLook;
  stats: FighterStats;
  moveNames: FighterMoveNames;
  superName: string;
  superDesc: string;
  introLine: string;
  winLine: string;
  hitLine?: string;
  hurtLine?: string;
  facePhoto: string;
  modelId?: string;
  moves?: Partial<Record<string, CombatMove>>;
  maxHealth?: number;
  grabDamage?: number;
  peaceGoalSeconds?: number;
  superId?: 'modi' | 'rahul' | 'didi' | 'trump' | 'yogi' | 'nitin' | 'mbapu' | 'kenny' | 'pratham';
  attackPoses?: Record<string, { windup: Partial<import('../animation/kinematics').Pose>; strike: Partial<import('../animation/kinematics').Pose> }>;
  modelHeight?: number;
  forearmScale?: number;
  dance: FighterDance;
  audioCues?: string[];
}

export interface InputState {
  moveX: number;
  up: boolean;
  down: boolean;
  punch: boolean;
  kick: boolean;
  grab: boolean;
  super: boolean;
}

export interface HitResult {
  attacker: import('../combat/Fighter').Fighter;
  defender: import('../combat/Fighter').Fighter;
  moveId: string;
  blocked: boolean;
  grab?: 'connect' | 'break';
  damage: number;
  knockdown: boolean;
  ko: boolean;
  x: number;
  y: number;
}

export interface StageDefinition {
  id: StageId;
  name: string;
  subtitle: string;
  theme: {
    skyTop: number;
    skyMid: number;
    skyBottom: number;
    fog: number;
    fogNear: number;
    fogFar: number;
    ground: number;
    platformSide: number;
    sunColor: number;
    sunIntensity: number;
    sunPos: [number, number, number];
    hemiSky: number;
    hemiGround: number;
    hemiIntensity: number;
    sunDisc: [number, number, number];
    sunDiscColor: number;
    exposure: number;
    floorRoughness: number;
  };
}

