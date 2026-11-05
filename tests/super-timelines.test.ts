import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CharacterRegistry } from '../src/characters/registry.ts';
import { Fighter } from '../src/combat/Fighter.ts';
import { prepareAvatarMaterial } from '../src/animation/materials.ts';
import type { Pose } from '../src/animation/kinematics.ts';

Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>null,setItem(){}}});
Object.defineProperty(globalThis,'window',{configurable:true,value:{innerWidth:960,innerHeight:540}});
const ink = new Proxy({}, { get: (_target,key) => key === 'measureText' ? () => ({width:100}) : () => {}, set: () => true });
Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>({width:0,height:0,getContext:()=>ink})}});
const {SuperDirector}=await import('../src/cinematics/SuperDirector.ts');
const {soundEngine}=await import('../src/audio/AudioManager.ts');

function fixture(id: string, facing=1, center=0, boss=false, hp=100) {
  const attacker=new Fighter(CharacterRegistry.get(id)!,true,'left');
  const defender=new Fighter(CharacterRegistry.get('modi')!,false,'right');
  attacker.x=center-facing*.38;defender.x=center+facing*.38;attacker.facing=facing;defender.facing=-facing;
  attacker.forceState('super');defender.forceState('frozen');defender.health=hp;
  const rig=()=>({
    root:new THREE.Group(),snapVertical(){},
    resetPose(pose:Pose){assert.ok(Object.values(pose).every(Number.isFinite));},
    blendTo(pose:Pose){assert.ok(Object.values(pose).every(Number.isFinite));},
    setTransform(x:number,y:number){this.root.position.set(x,y,0);},
    headWorld(target:THREE.Vector3){return target.copy(this.root.position).add(new THREE.Vector3(0,1.6,0));},
    handWorld(_side:string,target:THREE.Vector3){return target.copy(this.root.position).add(new THREE.Vector3(facing*.4,1.25,.15));},
  });
  const scene=new THREE.Scene(),speech:string[]=[],sounds:string[]=[];
  let finished=0;
  soundEngine.playSound=async key=>{sounds.push(key);};
  const context={scene,camera:new THREE.PerspectiveCamera(),attacker,defender,attRig:rig(),defRig:rig(),boss,
    ui:{setVignette(){},showSuperBanner:async()=>{},showSpeech(line:string){speech.push(line);},showFlash(){}},onFinish(){finished++;}};
  const director=new SuperDirector(context as unknown as ConstructorParameters<typeof SuperDirector>[0]);
  return {...context,director,speech,sounds,finished:()=>finished};
}

test('avatar skin/fabric keep detail without mutating cached materials or recoloring skin',()=>{
  const source=new THREE.MeshStandardMaterial({metalness:1,roughness:.2});source.name='yogi_head';
  const skin=prepareAvatarMaterial(source,'Head',true) as THREE.MeshStandardMaterial;
  assert.equal(skin.metalness,0);assert.equal(source.metalness,1);assert.equal(skin.color.getHex(),source.color.getHex());
  assert.equal(skin.shadowSide,THREE.FrontSide);assert.ok(skin.roughness>=.65);
  skin.dispose();source.dispose();
});

test('all nine supers: deterministic damage, finite poses, synchronized transforms and cleanup in both directions at both corners',async()=>{
  const original=soundEngine.playSound;
  try {
    for(const id of ['modi','rahul','didi','trump','yogi','nitin','mbapu','kenny','pratham']) {
      for(const facing of [1,-1]) for(const center of [-5.8,0,5.8]) {
        const outcomes=[];
        for(const fps of [30,60,120]) {
          const f=fixture(id,facing,center);await Promise.all([f.director.play(),f.director.play()]);
          assert.ok(Math.abs(f.attacker.x-f.defender.x)>=3.59,'props have room at close range and corners');
          let impacts=0,health=100;
          for(let frame=0;frame<fps*12;frame++) {
            f.director.update(1/fps);
            if(f.defender.health!==health){impacts++;health=f.defender.health;}
            assert.equal(f.attRig.root.position.x,f.attacker.x);assert.equal(f.attRig.root.position.y,f.attacker.y);
            assert.equal(f.defRig.root.position.x,f.defender.x);assert.equal(f.defRig.root.position.y,f.defender.y);
            assert.ok(Math.abs(f.attacker.x)<=6.45&&Math.abs(f.defender.x)<=6.45);
          }
          assert.equal(impacts,1,`${id} damages once`);assert.equal(f.defender.health,id==='kenny'||id==='pratham'?68:70);
          assert.equal(f.sounds.filter(key=>key===id).length,1,`${id} entry voice once`);
          assert.equal(f.finished(),1);assert.equal(f.scene.children.length,0);
          assert.equal(f.attRig.root.visible,true);assert.equal(f.defRig.root.visible,true);
          assert.equal(f.defender.state,'getup');assert.equal(f.defender.airborne,false);
          if(id==='yogi')assert.equal(f.speech.filter(line=>line.includes('kahan se')).length,1);
          outcomes.push([f.attacker.x,f.attacker.y,f.defender.x,f.defender.y,f.defender.health]);
        }
        assert.deepEqual(outcomes[0],outcomes[1],`${id}: 30 vs 60`);assert.deepEqual(outcomes[1],outcomes[2],`${id}: 60 vs 120`);
      }
    }
  } finally {soundEngine.playSound=original;}
});

test('Yatra potato is held during windup, reaches the hopper depth and disappears before gold; gears rotate in the panel plane',async()=>{
  const original=soundEngine.playSound;
  try {
    const f=fixture('rahul');await f.director.play();
    f.director.update(3.4);
    const potato=f.scene.getObjectByName('YatraPotato')!,machine=f.scene.getObjectByName('YatraMachine')!;
    assert.equal(f.defRig.root.visible,false);assert.ok(potato.position.distanceTo(f.attRig.handWorld('r',new THREE.Vector3()))<1e-8);
    f.director.update(.6833333333);
    assert.ok(Math.abs(potato.position.z-machine.position.z)<.08,'potato enters the actual hopper at z=-.6');
    f.director.update(.04);assert.equal(potato.visible,false);
    f.director.update(.7);const gear=f.scene.getObjectByName('YatraGear')!;
    assert.equal(gear.rotation.x,Math.PI/2);assert.equal(gear.rotation.z,0);assert.ok(gear.rotation.y>0);
    f.director.update(1.4);assert.equal(f.defRig.root.visible,true);assert.equal(f.defender.health,70);
    f.director.finish(false);
  } finally {soundEngine.playSound=original;}
});

test('Mitra Chakra leaves the raised hand continuously instead of teleporting down at release',async()=>{
  const original=soundEngine.playSound;
  try {
    for(const facing of [1,-1]) {
      const f=fixture('modi',facing);await f.director.play();f.director.update(2.4);
      const chakra=f.scene.getObjectByName('MitraChakra')!,before=chakra.position.clone();
      f.director.update(1/60);assert.ok(chakra.position.distanceTo(before)<.05);
      f.director.finish(false);
    }
  } finally {soundEngine.playSound=original;}
});

test('Toll Man launches above the floor and the explosion fades; Mbapu lands continuously and uses configured boss damage',async()=>{
  const original=soundEngine.playSound;
  try {
    const n=fixture('nitin');await n.director.play();n.director.update(7.23);
    assert.equal(n.defender.airborne,true);assert.ok(n.defender.y>0);n.director.update(5);assert.equal(n.finished(),1);
    for(const boss of [false,true]) {
      const b=fixture('mbapu',1,0,boss);await b.director.play();b.director.update(5.3);
      let previous=b.attacker.y;
      for(let i=0;i<45;i++){b.director.update(1/60);assert.ok(Math.abs(b.attacker.y-previous)<.12);previous=b.attacker.y;}
      b.director.update(3);assert.equal(b.defender.health,boss?60:70);
    }
  } finally {soundEngine.playSound=original;}
});

test('supers preserve lethal KO and cancellation cannot add late props or damage',async()=>{
  const original=soundEngine.playSound;
  try {
    for(const id of ['modi','rahul','didi','trump','yogi','nitin','mbapu','kenny','pratham']) {
      const f=fixture(id,1,0,false,5);await f.director.play();f.director.update(12);
      assert.equal(f.defender.health,0);assert.equal(f.defender.state,'ko');assert.equal(f.finished(),1);
      const cancelled=fixture(id);const pending=cancelled.director.play();cancelled.director.finish(false);await pending;
      cancelled.director.update(15);assert.equal(cancelled.scene.children.length,0);assert.equal(cancelled.defender.health,100);assert.equal(cancelled.finished(),0);
    }
  } finally {soundEngine.playSound=original;}
});
