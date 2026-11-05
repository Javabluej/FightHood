import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { mergePose, HIP_BASE_Y, UPPER_LEG, LOWER_LEG } from '../src/animation/kinematics.ts';
import { getBaseIdlePose, getPoseForFighter } from '../src/animation/poses.ts';
import { createKennyModel } from '../src/animation/KennyModel.ts';
import { KENNY_DEFINITION } from '../src/characters/roster/kenny.ts';
import { MODI_DEFINITION } from '../src/characters/roster/modi.ts';
import { MBAPU_DEFINITION } from '../src/characters/roster/mbapu.ts';
import { NITIN_DEFINITION } from '../src/characters/roster/nitin.ts';
import { Fighter } from '../src/combat/Fighter.ts';
import { COMBAT_MOVES } from '../src/combat/moves.ts';

test('cinematic hip offsets preserve planted foot height', () => {
  const base = getBaseIdlePose(0, 'rahul');
  const foot = (pose: typeof base, side: 'l'|'r') => HIP_BASE_Y + pose.rootY - UPPER_LEG * Math.cos(pose[`${side}ThF`]) - LOWER_LEG * Math.cos(pose[`${side}ThF`] - pose[`${side}Kn`]);
  for (const rootY of [0, -0.15, -0.3]) {
    const pose = mergePose(base, {rootY});
    for (const side of ['l','r'] as const) assert.ok(Math.abs(foot(base,side)-foot(pose,side))<1e-5);
  }
  const explicit = mergePose(base,{rootY:0,lThF:1.5,lKn:.2});
  assert.equal(explicit.lThF,1.5);assert.equal(explicit.lKn,.2);
});

test('Kenny customizes owned human geometry, face texture and glasses with valid attack poses', () => {
  const source=new THREE.Group();
  const hips=new THREE.Bone();hips.name='Hips';source.add(hips);
  const headBone=new THREE.Bone();headBone.name='Head_1';hips.add(headBone);
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(.2,.3,.2),new THREE.MeshStandardMaterial());mesh.name='Head';source.add(mesh);
  const originalGeometry=mesh.geometry;const texture=new THREE.Texture();
  const model=createKennyModel(source,texture);
  assert.notEqual(mesh.geometry,originalGeometry,'custom geometry owns its changes');
  assert.equal((mesh.material as THREE.MeshStandardMaterial).map,texture);
  assert.ok(model.getObjectByName('KennyGlasses'));
  const fighter=new Fighter(KENNY_DEFINITION,true,'left');
  for(const id of Object.keys(COMBAT_MOVES)) {
    fighter.startAttack(id);
    for(let frame=0;frame<40;frame++) {
      fighter.currentAttack!.frame=frame;
      assert.ok(Object.values(getPoseForFighter(fighter,frame/60).pose).every(Number.isFinite));
    }
  }
  assert.equal(KENNY_DEFINITION.superId,'kenny');
  const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
  model.traverse(part=>{if(part instanceof THREE.Mesh){geometries.add(part.geometry);(Array.isArray(part.material)?part.material:[part.material]).forEach(m=>materials.add(m));}});
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
});

test('Bapu and Nitin voices play once; super completion is deterministic across render rates', async () => {
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>null,setItem:()=>{}}});
  Object.defineProperty(globalThis,'window',{configurable:true,value:{innerWidth:960,innerHeight:540}});
  const { SuperDirector }=await import('../src/cinematics/SuperDirector.ts');
  const { soundEngine }=await import('../src/audio/AudioManager.ts');
  const original=soundEngine.playSound;
  try {
    for(const definition of [MBAPU_DEFINITION,NITIN_DEFINITION]) {
      const results=[];
      for(const fps of [30,60,120]) {
        const calls:string[]=[];
        soundEngine.playSound=async key=>{calls.push(key);};
        const attacker=new Fighter(definition,true,'left'),defender=new Fighter(MODI_DEFINITION,false,'right');
        attacker.forceState('super');defender.forceState('frozen');
        const rig=()=>({root:new THREE.Group(),snapVertical(){},resetPose(){},blendTo(){},setTransform(){},headWorld(v:THREE.Vector3){return v.set(0,1.6,0);},handWorld(_side:string,v:THREE.Vector3){return v.set(0,1.2,0);}});
        const scene=new THREE.Scene();let finished=0;const speech:string[]=[];
        const context={scene,camera:new THREE.PerspectiveCamera(),attacker,defender,attRig:rig(),defRig:rig(),ui:{setVignette(){},showSuperBanner:async()=>{},showSpeech(text:string){speech.push(text);},showFlash(){}},onFinish(){finished++;}};
        const director=new SuperDirector(context as unknown as ConstructorParameters<typeof SuperDirector>[0]);
        await Promise.all([director.play(),director.play()]);
        assert.equal(calls.filter(key=>key===definition.id).length,1,`${definition.id} voice at ${fps} FPS`);
        for(let i=0;i<fps*15;i++)director.update(1/fps);
        assert.equal(finished,1);assert.equal(scene.children.length,0);assert.equal(defender.airborne,false);
        assert.ok(defender.health<100);
        if(definition.id==='mbapu')assert.equal(speech.filter(line=>line.includes('Main hil nahi sakta')).length,1);
        results.push([attacker.x,attacker.y,defender.x,defender.y,defender.health]);
      }
      assert.deepEqual(results[0],results[1]);assert.deepEqual(results[1],results[2]);
    }
  } finally {soundEngine.playSound=original;}
});
