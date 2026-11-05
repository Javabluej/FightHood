import { FighterDefinition } from '../../types';
import { COMBAT_MOVES } from '../../combat/moves';

export const KENNY_DEFINITION: FighterDefinition = {
  id: 'kenny', modelId: 'kenny', superId: 'kenny',
  name: 'KENNY', fullName: 'Professor Kenny', party: 'Software Engineering · Strict Faculty',
  accent: '#f49c96', facePhoto: '/faces/kenny.png',
  look: {
    skin: 0xad7653, skinShade: 0x87563d, hair: 0x25201e, hairStyle: 'side-part',
    beard: 0x25201e, beardStyle: 'short', brows: 0x25201e,
    topStyle: 'shirt-vest', top: 0xef9c99, jacket: 0x23272b, pants: 0x363a42,
    shoes: 0x191b20, glasses: true, shoulders: 1, belly: 1.1, scale: 1,
  },
  stats: { walkFwd: 2.2, walkBack: 1.8, jumpV: 7.5, jumpVx: 2.4, damageMul: 1.03 },
  grabDamage: 15,
  moves: {
    special1: { ...COMBAT_MOVES.special1, name: 'PAY ATTENTION!', reach: 1.2, damage: 13 },
    special2: { ...COMBAT_MOVES.special2, name: 'SURPRISE VIVA!', startup: 14, damage: 14 },
  },
  moveNames: {
    jab: 'CHALK CHECK!', cross: 'CODE REVIEW!', kick: 'DEADLINE KICK!', lowJab: 'POP QUIZ!',
    special1: 'PAY ATTENTION!', special2: 'SURPRISE VIVA!', finisher: 'FINAL EVALUATION!',
    sweep: 'BACKLOG SWEEP!', uppercut: 'VIVA UPPERCUT!', grab: 'COME TO THE BOARD!', roundhouse: 'SEMESTER END!',
  },
  superName: 'NO ATTENDANCE FOR U, PA!',
  superDesc: 'Listen to class! Kenny opens the attendance register, stamps ABSENT and delivers a 32-damage final warning.',
  introLine: 'What r u looking down there?', winLine: "I don't give a damn.",
  hitLine: "I don't give a damn.",
  dance: { label: 'CLASS DISMISSED.', colors: [0xf49c96, 0x23272b, 0xffffff] },
};
