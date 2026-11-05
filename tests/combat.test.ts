import test from 'node:test';
import assert from 'node:assert/strict';
import { Fighter } from '../src/combat/Fighter.ts';
import { MODI_DEFINITION } from '../src/characters/roster/modi.ts';
import { COMBAT_MOVES } from '../src/combat/moves.ts';
import { canHit, resolveCombatHit, comboScale } from '../src/combat/collision.ts';
import { resolvePushboxCollision, FIXED_DELTA_TIME } from '../src/combat/physics.ts';
import { getPoseForFighter } from '../src/animation/poses.ts';
import { Bot } from '../src/ai/Bot.ts';
const neutral = { moveX: 0, up: false, down: false, punch: false, kick: false, grab: false, super: false };
const pair = () => { const a = new Fighter(MODI_DEFINITION, true, 'left'); const b = new Fighter(MODI_DEFINITION, false, 'right'); a.x = 0; b.x = 1; return [a, b]; };
const active = (a: Fighter, id = 'jab') => { a.startAttack(id); a.currentAttack!.frame = a.currentAttack!.move.startup; };

test('neutral animation clocks advance; attacks and hits restart their clocks', () => {
 const [a,b] = pair(); for(let i=0;i<60;i++) a.update(neutral,b); assert.equal(a.stateFrames,60);
 a.update({...neutral,moveX:1},b); for(let i=0;i<20;i++) a.update({...neutral,moveX:1},b); assert.equal(a.stateFrames,20);
 a.startAttack('jab'); a.stateFrames=10; a.startAttack('cross'); assert.equal(a.stateFrames,0);
});
for(const [id,move] of Object.entries(COMBAT_MOVES)) test(`${id}: startup, active frames, completion and finite poses`, () => {
 const [a,b] = pair(); a.startAttack(id); const frames=[];
 for(let i=0;i<move.startup+move.active+move.recovery;i++) {
  if(a.isAttackActive) frames.push(a.currentAttack!.frame);
  assert.ok(Object.values(getPoseForFighter(a,i/60).pose).every(Number.isFinite));
  a.update(neutral,b);
 }
 assert.deepEqual(frames,Array.from({length:move.active},(_,i)=>move.startup+i)); assert.equal(a.currentAttack,null);
});
test('one hit per attack, damage clamped, KO stays terminal', () => {
 const [a,b]=pair(); active(a); const hit=resolveCombatHit(a,b); assert.ok(hit && hit.damage>0); assert.equal(resolveCombatHit(a,b),null);
 b.health=1; active(a); resolveCombatHit(a,b); assert.equal(b.health,0); assert.equal(b.state,'ko'); assert.equal(b.airborne,true);
 for(let i=0;i<120;i++) b.update({...neutral,punch:true},a); assert.equal(b.state,'ko'); assert.equal(b.y,0); assert.equal(b.currentAttack,null);
 b.takeDamage(-1000); assert.equal(b.health,100); b.addMeter(-1000); assert.equal(b.meter,0);
});
test('lethal throws cannot recover from knockout',()=> {const[a,b]=pair(); b.health=1; active(a,'grab'); assert.ok(resolveCombatHit(a,b)?.ko); assert.equal(b.state,'ko');});
test('guard during blockstun and low/standing guard rules',()=>{
 const[a,b]=pair(); b.facing=-1; b.update({...neutral,moveX:1},a); active(a); assert.equal(resolveCombatHit(a,b)?.blocked,true);
 active(a); assert.equal(resolveCombatHit(a,b)?.blocked,true); assert.equal(b.health,100);
 b.resetRound(); b.x=1; b.update({...neutral,down:true,moveX:1},a); active(a,'sweep'); assert.equal(resolveCombatHit(a,b)?.blocked,true);
 b.resetRound(); b.x=1; b.update({...neutral,moveX:1},a); active(a,'sweep'); assert.equal(resolveCombatHit(a,b)?.blocked,false);
});
test('hit geometry rejects behind, out of reach, high vs crouch, low vs air',()=>{
 const[a,b]=pair(); active(a); b.x=-1; assert.equal(canHit(a,b),false); b.x=4; assert.equal(canHit(a,b),false);
 b.x=1; b.crouching=true; active(a,'roundhouse'); assert.equal(canHit(a,b),false);
 b.crouching=false;b.y=1;b.airborne=true;active(a,'sweep');assert.equal(canHit(a,b),false);
 a.y=3;active(a,'airKick');assert.equal(canHit(a,b),false);
});
test('grab tech separates fighters without damage',()=>{const[a,b]=pair(); active(a,'grab'); b.startAttack('grab');const hit=resolveCombatHit(a,b);assert.equal(hit?.grab,'break');assert.equal(b.health,100);assert.equal(a.state,'blockstun');});
test('combo chains consume one input and reset after timeout',()=>{const[a,b]=pair();active(a);a.currentAttack!.hasHit=true;a.update({...neutral,punch:true},b);assert.equal(a.currentAttack?.move.id,'cross');for(let i=0;i<50;i++)a.update(neutral,b);assert.equal(a.currentAttack,null); b.comboHits=5;b.comboTimer=1;b.update(neutral,a);assert.equal(b.comboHits,0);assert.equal(comboScale(100),0.5);});
test('round reset clears input, locomotion, stun and attack flags',()=>{const[a]=pair();a.holdingBack=true;a.crouching=true;a.walkDistance=10;a.startAttack('kick');a.resetRound();assert.equal(a.holdingBack,false);assert.equal(a.walkDistance,0);assert.equal(a.currentAttack,null);assert.equal(a.health,100);});
test('snapshots restore attack frame, velocity and recovery flags exactly',()=>{const[a,b]=pair();active(a,'kick');a.airborne=true;a.y=1;a.stunFrames=10;a.currentAttack!.hasHit=true;const s=a.getSnapshot();b.applySnapshot(s,true);assert.deepEqual(b.getSnapshot(),s);});
test('physics and jump yield identical results at 30, 60 and 120 render FPS',()=>{
 const run=(fps:number)=>{const[a,b]=pair();let accumulator=0,tick=0;for(let f=0;f<fps;f++){accumulator+=1/fps;while(accumulator+1e-9>=FIXED_DELTA_TIME){a.update({...neutral,moveX:1,up:tick++===0},b);accumulator-=FIXED_DELTA_TIME;}}return[a.x,a.y,a.vx,a.vy];};assert.deepEqual(run(30),run(60));assert.deepEqual(run(60),run(120));
});
test('pushboxes retain separation at both walls',()=>{for(const sign of [-1,1]){const[a,b]=pair();a.x=sign*6.45;b.x=sign*6.4;resolvePushboxCollision(a,b);assert.ok(Math.abs(a.x)<=6.45&&Math.abs(b.x)<=6.45);assert.ok(Math.abs(a.x-b.x)>.719);}});
test('CPU queued buttons fire once and difficulties respect their reaction delay',()=>{
 for(const difficulty of ['easy','normal','hard'] as const){const[a,b]=pair();const bot=new Bot(difficulty);bot.reset();active(b);const input=bot.think(a,b,1/60);assert.equal(input.punch,false);assert.equal(input.grab,false);}
 const[a,b]=pair();const bot=new Bot('normal'); (bot as any).setPlan('attack',1,[{at:0,button:'punch'},{at:.1,button:'kick'}]);let punches=0,kicks=0;for(let i=0;i<12;i++){const input=bot.think(a,b,1/60);punches+=Number(input.punch);kicks+=Number(input.kick);}assert.equal(punches,1);assert.equal(kicks,1);
});

test('configured fighters can supply health, custom moves, poses and snapshot attacks',()=>{
 const definition={...MODI_DEFINITION,id:'test-fighter',maxHealth:150,moves:{custom:{...COMBAT_MOVES.jab,id:'custom',damage:20}},attackPoses:{custom:{windup:{lEl:2},strike:{lEl:0.1}}}};
 const a=new Fighter(definition,true,'left'),b=new Fighter(definition,false,'right');a.startAttack('custom');a.currentAttack!.frame=5;
 assert.equal(a.health,150);assert.equal(a.currentAttack!.move.damage,20);assert.ok(Math.abs(getPoseForFighter(a,0).pose.lEl-.1)<1e-9);b.applySnapshot(a.getSnapshot(),false);assert.deepEqual(a.getSnapshot(),b.getSnapshot());
});
test('peace victory charges only valid defense and attacking resets progress',async()=>{
 const {updatePeaceCharge}=await import('../src/combat/peace.ts');const[a,b]=pair();b.definition={...b.definition,peaceGoalSeconds:.1};a.holdingBack=true;
 for(let i=0;i<6;i++) updatePeaceCharge(a,b,neutral,1/60);
 assert.ok(a.peaceCharge>.09);assert.equal(updatePeaceCharge(a,b,{...neutral,punch:true},1/60),false);assert.equal(a.peaceCharge,0);
 a.x=-5;updatePeaceCharge(a,b,neutral,1);assert.equal(a.peaceCharge,0);a.x=0;assert.equal(updatePeaceCharge(a,b,neutral,1),true);
 a.resetRound();assert.equal(a.peaceCharge,0);assert.equal(a.peaceful,false);
});
test('super energy is consumed once and empty meter cannot be reused',()=>{const[a]=pair();a.meter=99;assert.equal(a.consumeSuper(),false);a.addMeter(5);assert.equal(a.consumeSuper(),true);assert.equal(a.meter,0);assert.equal(a.consumeSuper(),false);});
test('air attacks land and recovery cannot stay stuck in attack',()=>{const[a,b]=pair();a.y=.05;a.airborne=true;a.vy=-1;a.startAttack('airKick');a.update(neutral,b);a.update(neutral,b);assert.equal(a.y,0);assert.equal(a.airborne,false);assert.equal(a.currentAttack,null);assert.equal(a.state,'idle');});
test('knockdown and getup finish with grounded, actionable fighters',()=>{const[a,b]=pair();b.applyHit(COMBAT_MOVES.uppercut,10,1);for(let i=0;i<240;i++)b.update(neutral,a);assert.equal(b.state,'idle');assert.equal(b.y,0);assert.equal(b.airborne,false);});

test('simultaneous active strikes trade without player-one priority',async()=>{const {resolveCombatExchange}=await import('../src/combat/collision.ts');const[a,b]=pair();a.health=1;b.health=1;active(a);active(b);const hits=resolveCombatExchange(a,b);assert.ok(hits.every(Boolean));assert.equal(a.health,0);assert.equal(b.health,0);assert.equal(a.state,'ko');assert.equal(b.state,'ko');});

test('ground throws catch crouching defenders but respect stun and air protection',()=>{const[a,b]=pair();b.crouching=true;active(a,'grab');assert.equal(canHit(a,b),true);b.state='blockstun';assert.equal(canHit(a,b),false);b.state='idle';a.airborne=true;a.y=1;assert.equal(canHit(a,b),false);});
