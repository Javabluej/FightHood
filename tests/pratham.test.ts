import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createPrathamModel } from '../src/animation/PrathamModel.ts';
import { PRATHAM_DEFINITION } from '../src/characters/roster/pratham.ts';
import { MODI_DEFINITION } from '../src/characters/roster/modi.ts';
import { Fighter } from '../src/combat/Fighter.ts';
import { CharacterRegistry } from '../src/characters/registry.ts';
import { getPoseForFighter } from '../src/animation/poses.ts';
import { COMBAT_MOVES } from '../src/combat/moves.ts';

test('Pratham is playable with the requested exact dialogue and all standard attack poses',()=>{
  assert.equal(CharacterRegistry.get('pratham'),PRATHAM_DEFINITION);
  assert.ok(CharacterRegistry.getPlayableRoster().includes(PRATHAM_DEFINITION));
  assert.equal(PRATHAM_DEFINITION.introLine,'why bro ignoring');
  assert.equal(PRATHAM_DEFINITION.hitLine,'Full studiid pa ?');
  assert.equal(PRATHAM_DEFINITION.hurtLine,'U hurted me bro');
  assert.equal(PRATHAM_DEFINITION.winLine,'sometimes its good for health to get hurted');
  const fighter=new Fighter(PRATHAM_DEFINITION,true,'left');
  for(const id of Object.keys(COMBAT_MOVES)) {fighter.startAttack(id);for(let frame=0;frame<40;frame++){fighter.currentAttack!.frame=frame;assert.ok(Object.values(getPoseForFighter(fighter,frame/60).pose).every(Number.isFinite));}}
});

test('Pratham model owns changes and preserves skin weights, with a hood and rounded black glasses',()=>{
  const source=new THREE.Group();
  for(const name of ['Head_1','Spine2_1']){const bone=new THREE.Bone();bone.name=name;source.add(bone);}
  const material=new THREE.MeshStandardMaterial();
  const head=new THREE.Mesh(new THREE.BoxGeometry(.2,.3,.2),material);head.name='Head';source.add(head);
  const torso=new THREE.Mesh(new THREE.BoxGeometry(.4,.7,.25).translate(0,1.2,0),material);torso.name='OutfitTop';source.add(torso);
  const weights=new Float32Array(head.geometry.getAttribute('position').count*4);weights.forEach((_,i)=>{if(i%4===0)weights[i]=1;});
  head.geometry.setAttribute('skinWeight',new THREE.BufferAttribute(weights,4));
  const original=head.geometry, texture=new THREE.Texture();
  const result=createPrathamModel(source,texture);
  assert.notEqual(head.geometry,original);assert.deepEqual(head.geometry.getAttribute('skinWeight').array,weights);
  assert.equal((head.material as THREE.MeshStandardMaterial).map,texture);
  assert.ok(result.getObjectByName('PrathamGlasses'));assert.ok(result.getObjectByName('PrathamHood'));assert.ok(result.getObjectByName('HoodiePocket'));
  const cloth=torso.material as THREE.MeshStandardMaterial;assert.equal(cloth.map,null);assert.equal(cloth.vertexColors,true);
  const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
  result.traverse(part=>{if(part instanceof THREE.Mesh){geometries.add(part.geometry);(Array.isArray(part.material)?part.material:[part.material]).forEach(m=>materials.add(m));}});
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());texture.dispose();original.dispose();material.dispose();
});

test('Ultimate Hurting ignores then blocks calls, speaks all four lines and damages once at 30/60/120 FPS',async()=>{
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>null,setItem:()=>{}}});
  Object.defineProperty(globalThis,'window',{configurable:true,value:{innerWidth:960,innerHeight:540}});
  const drawn:string[]=[];
  const ink={fillStyle:'',textAlign:'',font:'',fillRect(){},beginPath(){},arc(){},fill(){},fillText(text:string){drawn.push(text);}};
  Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>({width:0,height:0,getContext:()=>ink})}});
  const {SuperDirector}=await import('../src/cinematics/SuperDirector.ts');
  const {soundEngine}=await import('../src/audio/AudioManager.ts');const original=soundEngine.playSound;soundEngine.playSound=async()=>{};
  try {
    const results=[];
    for(const fps of [30,60,120]){
      const attacker=new Fighter(PRATHAM_DEFINITION,true,'left'),defender=new Fighter(MODI_DEFINITION,false,'right');
      attacker.forceState('super');defender.forceState('frozen');
      const rig=()=>({root:new THREE.Group(),snapVertical(){},resetPose(){},blendTo(){},setTransform(){},headWorld(v:THREE.Vector3){return v.set(0,1.6,0);},handWorld(_side:string,v:THREE.Vector3){return v.set(0,1.2,0);}});
      const scene=new THREE.Scene(),spoken:string[]=[];let completed=0;
      const context={scene,camera:new THREE.PerspectiveCamera(),attacker,defender,attRig:rig(),defRig:rig(),ui:{setVignette(){},showSuperBanner:async()=>{},showSpeech(text:string){spoken.push(text);},showFlash(){}},onFinish(){completed++;}};
      const director=new SuperDirector(context as unknown as ConstructorParameters<typeof SuperDirector>[0]);await director.play();
      for(let i=0;i<fps*8;i++)director.update(1/fps);
      assert.deepEqual(spoken,['why bro ignoring','U hurted me bro','Full studiid pa ?','sometimes its good for health to get hurted']);
      assert.equal(defender.health,68);assert.equal(defender.airborne,false);assert.equal(completed,1);assert.equal(scene.children.length,0);
      assert.ok(drawn.includes('CALL IGNORED'));assert.ok(drawn.includes('CONTACT BLOCKED'));
      results.push([defender.health,defender.x,defender.y]);
    }
    assert.deepEqual(results[0],results[1]);assert.deepEqual(results[1],results[2]);
  }finally{soundEngine.playSound=original;}
});
