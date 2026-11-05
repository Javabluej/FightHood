import test from 'node:test';
import assert from 'node:assert/strict';
import { Fighter } from '../src/combat/Fighter.ts';
import { CharacterRegistry } from '../src/characters/registry.ts';
import { GuestPrediction } from '../src/multiplayer/Prediction.ts';
const neutral={moveX:0,up:false,down:false,punch:false,kick:false,grab:false,super:false};
const pair=()=>[new Fighter(CharacterRegistry.get('modi')!,true,'left'),new Fighter(CharacterRegistry.get('rahul')!,false,'right')];

test('guest input responds immediately and acknowledged inputs are not replayed twice',()=>{
  const [remote,local]=pair(),[hostRemote,hostLocal]=pair(),p=new GuestPrediction();
  const start=local.x;
  const input={...neutral,moveX:1};
  for(let i=0;i<12;i++)p.predict(local,remote,input);
  assert.ok(local.x>start+.2,'movement without waiting for any packet');
  for(let i=0;i<6;i++)hostLocal.update(input,hostRemote);
  p.reconcile(6,6,remote,local,hostRemote.getSnapshot(),hostLocal.getSnapshot(),true);
  const expected=new Fighter(hostLocal.definition,false,'right');expected.applySnapshot(hostLocal.getSnapshot(),true);
  for(let i=0;i<6;i++)expected.update(input,hostRemote);
  assert.equal(local.x,expected.x);
  assert.equal(local.health,hostLocal.health);
});

test('prediction survives 150–450ms round-trip delay plus jitter, converges after release and never predicts damage',()=>{
 for(const delay of [4,13]) {
  const [remote,local]=pair(),[h1,h2]=pair(),p=new GuestPrediction();
  const commands:Array<{at:number,seq:number,input:typeof neutral}>=[],snapshots:Array<{at:number,frame:number,ack:number,f1:ReturnType<Fighter['getSnapshot']>,f2:ReturnType<Fighter['getSnapshot']>}>=[];
  let ack=0,held={...neutral};
  for(let tick=0;tick<240;tick++) {
    const input={...neutral,moveX:tick<60?1:0,punch:tick===80,up:tick===100};
    commands.push({at:tick+delay+(tick%5===0?2:0),seq:p.predict(local,remote,input),input});
    for(const command of commands.filter(c=>c.at<=tick&&c.seq>ack).sort((a,b)=>a.seq-b.seq)){held={...command.input,punch:held.punch||command.input.punch};ack=command.seq;}
    h2.update(held,h1);held={...held,punch:false,up:false};
    if(tick===90)h2.takeDamage(13);
    if(tick%2===0)snapshots.push({at:tick+delay+1+(tick%7===0?2:0),frame:tick,ack,f1:h1.getSnapshot(),f2:h2.getSnapshot()});
    for(const snap of snapshots.filter(s=>s.at===tick))p.reconcile(snap.frame,snap.ack,remote,local,snap.f1,snap.f2,true);
    p.decay(1/60);
    assert.ok(Number.isFinite(local.x)&&Number.isFinite(local.y));
    if(tick<90)assert.equal(local.health,100);
  }
  assert.ok(Math.abs(local.x-h2.x)<.01);assert.equal(local.health,87);assert.equal(local.y,0);
  assert.equal(p.reconcile(-1,0,remote,local,h1.getSnapshot(),h2.getSnapshot(),true),false);
 }
});

test('snapshots preserve combo buffers and cinematic reconciliation clears speculative actions',()=>{
  const [remote,local]=pair(),p=new GuestPrediction();local.bufferedButton='kick';local.bufferTimer=7;local.comboTimer=12;
  const snap=local.getSnapshot();local.bufferedButton=null;local.applySnapshot(snap,true);
  assert.equal(local.bufferedButton,'kick');assert.equal(local.bufferTimer,7);assert.equal(local.comboTimer,12);
  p.predict(local,remote,{...neutral,punch:true});p.clearPending();
  p.reconcile(1,0,remote,local,remote.getSnapshot(),{...snap,state:'frozen',bufferedButton:null},false);
  assert.equal(local.state,'frozen');assert.equal(local.bufferedButton,null);
  p.reset();assert.equal(p.predict(local,remote,neutral),1);
});

test('predicted movement respects the opponent pushbox without moving the authoritative opponent',()=>{
  const [remote,local]=pair(),p=new GuestPrediction();remote.x=0;local.x=.8;
  for(let i=0;i<40;i++)p.predict(local,remote,{...neutral,moveX:-1});
  assert.equal(remote.x,0);assert.ok(local.x>=.72);
});
