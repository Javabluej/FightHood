import * as THREE from 'three';
import type { SuperContext } from './SuperDirector';
import { getBaseIdlePose } from '../animation/poses';
import { mergePose, easeOutCubic } from '../animation/kinematics';
import { soundEngine } from '../audio/AudioManager';

export const PRATHAM_ULTIMATE_DAMAGE = 32;

/** Calls are ignored and blocked only inside this fictional combat cinematic. */
export function createPrathamUltimate(ctx: SuperContext) {
  const {scene,attacker,defender,attRig,ui}=ctx;
  const props:THREE.Object3D[]=[];
  const add=<T extends THREE.Object3D>(object:T):T=>{scene.add(object);props.push(object);return object;};
  const phone=add(new THREE.Group());phone.name='PrathamCallScreen';
  const body=new THREE.Mesh(new THREE.BoxGeometry(1.28,2.18,.11),new THREE.MeshStandardMaterial({color:0x141b24,roughness:.45,metalness:.25}));
  phone.add(body);
  const canvas=document.createElement('canvas');canvas.width=640;canvas.height=1080;
  const ink=canvas.getContext('2d')!;
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const screen=new THREE.Mesh(new THREE.PlaneGeometry(1.18,2.04),new THREE.MeshBasicMaterial({map:texture}));screen.position.z=.058;phone.add(screen);
  const draw=(status:string,subtitle:string,action:string,color:string)=>{
    phone.userData.callState=status;
    ink.fillStyle='#101b2b';ink.fillRect(0,0,640,1080);
    ink.textAlign='center';ink.fillStyle='#9fb9d0';ink.font='28px sans-serif';ink.fillText('DO NOT DISTURB',320,95);
    ink.fillStyle=color;ink.beginPath();ink.arc(320,305,105,0,Math.PI*2);ink.fill();
    ink.fillStyle='#ffffff';ink.font='bold 78px sans-serif';ink.fillText(defender.definition.name.slice(0,2),320,333);
    ink.font='bold 36px sans-serif';ink.fillText(defender.definition.name,320,485);
    ink.font='bold 45px sans-serif';ink.fillStyle=color;ink.fillText(status,320,600);
    ink.fillStyle='#c8d4df';ink.font='29px sans-serif';ink.fillText(subtitle,320,665);
    ink.fillStyle=color;ink.fillRect(95,815,450,110);
    ink.fillStyle='#101b2b';ink.font='bold 40px sans-serif';ink.fillText(action,320,884);
    texture.needsUpdate=true;
  };
  draw('INCOMING CALL','Calling Pratham...','IGNORE','#81c5b4');
  const held=add(new THREE.Group());held.name='PrathamHandset';
  held.add(new THREE.Mesh(new THREE.BoxGeometry(.072,.145,.013),new THREE.MeshStandardMaterial({color:0x151a20,roughness:.5})));
  const smallScreen=new THREE.Mesh(new THREE.PlaneGeometry(.062,.12),new THREE.MeshBasicMaterial({color:0x81c5b4}));smallScreen.position.z=.008;held.add(smallScreen);
  const heart=new THREE.Group();heart.name='PrathamBrokenHeart';add(heart);heart.visible=false;
  const shape=new THREE.Shape();shape.moveTo(0,.16);shape.bezierCurveTo(-.28,.56,-.72,.17,0,-.56);shape.lineTo(0,.16);
  const heartMaterial=new THREE.MeshStandardMaterial({color:0xeb6681,emissive:0x4c1425,roughness:.5});
  const halves=[-1,1].map(sign=>{const mesh=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:.07,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.015,bevelThickness:.015}),heartMaterial);mesh.scale.x=sign;heart.add(mesh);return mesh;});
  const wave=add(new THREE.Mesh(new THREE.TorusGeometry(.3,.035,8,40),new THREE.MeshBasicMaterial({color:0xeb6681,transparent:true,opacity:1})));wave.visible=false;
  const mid=(attacker.x+defender.x)/2;
  let first=false,ignored=false,blocked=false,impact=false,outro=false,ring=0;
  const say=(text:string)=>{
    const point=attRig.headWorld(new THREE.Vector3());point.y+=.45;point.project(ctx.camera);
    ui.showSpeech(text,(point.x+1)*window.innerWidth/2,(1-point.y)*window.innerHeight/2,'',`fighter-${attacker.side}`);
  };
  return {props,duration:6.1,update(t:number,dt:number){
    phone.position.set(mid,-1.4+easeOutCubic(Math.min(1,t/.8))*3.1,-.3);
    phone.rotation.z=t<1.6?Math.sin(t*25)*.025:0;
    if(t>5.3)phone.position.y=1.7-easeOutCubic((t-5.3)/.8)*3.1;
    attRig.blendTo(mergePose(getBaseIdlePose(t,'pratham'),{rShF:t<2.6?1.42:.65,rEl:1.2,rHand:1,lShF:.45,lEl:1.3,headF:t<1.6?.28:-.05,headT:t<1.6?-.1:.6}),18,dt);
    attRig.handWorld('r',held.position);held.position.y+=.06;held.rotation.y=attacker.facing*.6;
    if(t<1.6&&Math.floor(t/.55)>ring){ring=Math.floor(t/.55);soundEngine.playSound('ui_select',.5);}
    if(t>=.2&&!first){first=true;say('why bro ignoring');}
    if(t>=1.6&&!ignored){ignored=true;draw('CALL IGNORED','Not answering, bro.','BLOCK CONTACT','#e9b078');say('U hurted me bro');soundEngine.playSound('ui_back');}
    if(t>=2.8&&!blocked){blocked=true;draw('CONTACT BLOCKED','Calls will not connect.','BLOCKED','#eb6681');say('Full studiid pa ?');soundEngine.playSound('snap');}
    if(t>=3.35&&!impact){
      impact=true;heart.visible=true;heart.position.set(defender.x,1.25,.2);
      wave.visible=true;wave.position.copy(heart.position);
      defender.takeDamage(PRATHAM_ULTIMATE_DAMAGE);defender.currentAttack=null;defender.forceState('knockdown');
      defender.stunFrames=36;defender.vx=attacker.facing*4;defender.vy=5.6;defender.airborne=true;
      ui.showFlash('rgba(235,102,129,.55)',250);soundEngine.playSound('thud');
    }
    if(impact){const p=Math.min(1,(t-3.35)/1.5);halves.forEach((part,i)=>{part.position.x=(i===0?-1:1)*p*.75;part.position.y=-p*.4;part.rotation.z=(i===0?1:-1)*p*.5;});heart.scale.setScalar(1-p*.4);wave.scale.setScalar(1+p*6);wave.material.opacity=1-p;}
    if(t>=4.6&&!outro){outro=true;say('sometimes its good for health to get hurted');}
    if(t>5.2)heart.visible=false;
  }};
}
