import { FighterDefinition } from '../../types';
import { COMBAT_MOVES } from '../../combat/moves';

export const PRATHAM_DEFINITION: FighterDefinition = {
  id:'pratham', modelId:'pratham', superId:'pratham', name:'PRATHAM', fullName:'Pratham',
  party:'Team Do Not Disturb', accent:'#80b9d7', facePhoto:'/faces/pratham.png',
  look:{skin:0xb6805c,skinShade:0x8b5b40,hair:0x171b20,hairStyle:'side-part',beard:0x1c2024,beardStyle:'short',brows:0x171b20,topStyle:'hoodie',top:0xe8dfce,jacket:0xe8dfce,pants:0x353b43,shoes:0x20252b,glasses:true,shoulders:1.1,belly:1.08,scale:1},
  stats:{walkFwd:2.35,walkBack:1.95,jumpV:7.6,jumpVx:2.5,damageMul:1},
  grabDamage:14,
  moves:{special1:{...COMBAT_MOVES.special1,name:'MISSED CALL!',damage:12,startup:11},special2:{...COMBAT_MOVES.special2,name:'DO NOT DISTURB!',damage:14}},
  moveNames:{jab:'LEFT ON READ!',cross:'MISSED CALL!',kick:'DECLINE KICK!',lowJab:'SILENT MODE!',special1:'MISSED CALL!',special2:'DO NOT DISTURB!',finisher:'CONTACT REMOVED!',sweep:'GHOSTED!',uppercut:'HURTED UPPERCUT!',grab:'BLOCK CONTACT!',roundhouse:'AIRPLANE MODE!'},
  superName:'ULTIMATE HURTING',
  superDesc:'Pratham ignores the call, blocks the contact and breaks the opponent’s heart for 32 damage.',
  introLine:'why bro ignoring', hitLine:'Full studiid pa ?', hurtLine:'U hurted me bro',
  winLine:'sometimes its good for health to get hurted',
  dance:{label:'DO NOT DISTURB.',colors:[0x80b9d7,0xe8dfce,0xe66f82]},
};
