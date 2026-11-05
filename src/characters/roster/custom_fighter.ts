import { FighterDefinition } from '../../types';

export const CHAIWALA_FIGHTER: FighterDefinition = {
  id: 'chaiwala',
  modelId: 'modi', // Explicit existing-model reuse; supply a custom GLB for an original appearance.
  superId: 'modi', // Reuse an implemented choreography until a chai super is authored.
  name: 'CHAI BHAIYA',
  fullName: 'Kullad Commander',
  party: 'Team Chai Tapri',
  accent: '#e67e22',
  look: {
    skin: 12880482,
    skinShade: 11039052,
    hair: 2038295,
    hairStyle: 'side-part',
    beard: 2038295,
    beardStyle: 'stubble-grey',
    brows: 2038295,
    topStyle: 'kurta-jacket',
    top: 15985362,
    jacket: 15764004,
    pants: 16184038,
    shoes: 3875862,
    glasses: false,
    shoulders: 1.0,
    belly: 1.0,
    scale: 1.0,
  },
  stats: {
    walkFwd: 2.3,
    walkBack: 1.8,
    jumpV: 7.8,
    jumpVx: 2.5,
    damageMul: 1.04,
  },
  moveNames: {
    special1: 'GARAM CHAI SPLASH!',
    special2: 'KULLAD SMASH!',
    finisher: 'MASALA CHAI TSUNAMI!',
    sweep: 'TRAY SLIDE SWEEP!',
    uppercut: 'STEAM UPPERCUT!',
    grab: 'TAPRI HEADBUTT!',
    roundhouse: 'CARDAMOM ROUNDHOUSE!',
  },
  superName: 'CHAI CHAKRA',
  superDesc: 'Uses the implemented chakra cinematic for 30 damage. Custom chai assets are not supplied.',
  introLine: 'Garam chai, garam muqqe!',
  winLine: 'Chai piyo, khush raho!',
  facePhoto: '/faces/modi.png', // Fallback or custom face
  dance: { label: 'TAPRI DANCE!', colors: [15105570, 16777215, 1280008] },
  audioCues: ['chai_ting', 'cup_break', 'whoosh', 'thud', 'boom'],
};

