import * as THREE from 'three';
import type { SuperContext } from './SuperDirector';
import { getBaseIdlePose } from '../animation/poses';
import { mergePose, easeOutCubic } from '../animation/kinematics';
import { soundEngine } from '../audio/AudioManager';

/** An attendance check, a red ABSENT stamp and a ruler shockwave. */
export function createKennyUltimate(ctx: SuperContext) {
  const { scene, attacker, defender, attRig, defRig, ui } = ctx;
  const props: THREE.Object3D[] = [];
  const add = <T extends THREE.Object3D>(object: T): T => { scene.add(object); props.push(object); return object; };
  const mid = (attacker.x + defender.x) / 2;
  const facing = attacker.facing;
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 512;
  const ink = canvas.getContext('2d')!;
  ink.fillStyle = '#173c32'; ink.fillRect(0, 0, 1024, 512);
  ink.strokeStyle = '#c9b488'; ink.lineWidth = 18; ink.strokeRect(9, 9, 1006, 494);
  ink.fillStyle = '#f4edd9'; ink.textAlign = 'center';
  ink.font = 'bold 66px sans-serif'; ink.fillText('SOFTWARE ENGINEERING', 512, 105);
  ink.font = '34px monospace'; ink.fillText('KENNY\'S ATTENDANCE REGISTER', 512, 173);
  ink.fillRect(70, 212, 884, 3);
  ink.font = 'bold 45px sans-serif'; ink.fillText(defender.definition.name, 512, 287);
  ink.font = '30px monospace'; ink.fillText('NO ATTENDANCE FOR U, PA!', 512, 359);
  const board = add(new THREE.Mesh(new THREE.PlaneGeometry(3.7, 1.85), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), side: THREE.DoubleSide })));
  board.position.set(mid, -2, -0.75);

  const stampCanvas = document.createElement('canvas'); stampCanvas.width = 512; stampCanvas.height = 192;
  const stampInk = stampCanvas.getContext('2d')!;
  stampInk.strokeStyle = '#ff493e'; stampInk.lineWidth = 12; stampInk.strokeRect(12, 12, 488, 168);
  stampInk.fillStyle = '#ff493e'; stampInk.font = 'bold 105px sans-serif'; stampInk.textAlign = 'center'; stampInk.fillText('ABSENT', 256, 134);
  const stamp = add(new THREE.Mesh(new THREE.PlaneGeometry(1.95, 0.73), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(stampCanvas), transparent: true, depthWrite: false, side: THREE.DoubleSide })));
  stamp.position.set(defender.x, 3.5, 0.3); stamp.rotation.z = -0.16; stamp.visible = false;
  const ruler = add(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.75, 0.035), new THREE.MeshStandardMaterial({ color: 0xe3b86b })));
  const wave = add(new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 8, 40), new THREE.MeshBasicMaterial({ color: 0xf49c96, transparent: true, opacity: 0.9 })));
  wave.visible = false;
  let warning = false, dismissed = false, impact = false;
  const duration = 5.1;
  return {
    props, duration,
    update(t: number, dt: number) {
      board.position.y = t < 1 ? -2 + easeOutCubic(t) * 3.75 : 1.75;
      if (t > 4.3) board.position.y = 1.75 - easeOutCubic((t - 4.3) / 0.8) * 3.75;
      attRig.blendTo(mergePose(getBaseIdlePose(t, 'kenny'), {
        rShF: t < 2.6 ? 1.45 : 2.1, rEl: t < 2.6 ? 0.35 : 0.6,
        rHand: 0, lShF: 0.65, lEl: 1.8, spineF: 0.08, headF: -0.1,
      }), 20, dt);
      attRig.handWorld('r', ruler.position); ruler.position.y += 0.18;
      ruler.rotation.z = facing * (t < 2.6 ? -0.25 : 0.6);
      const say = (text: string, rig = attRig) => {
        const point = rig.headWorld(new THREE.Vector3()); point.y += 0.45; point.project(ctx.camera);
        ui.showSpeech(text, (point.x + 1) * window.innerWidth / 2, (1 - point.y) * window.innerHeight / 2, '', `fighter-${rig === attRig ? attacker.side : defender.side}`);
      };
      if (t >= 0.2 && !warning) { warning = true; say('No attendance for u, pa. Listen to class!'); soundEngine.playSound('pen_scribble'); }
      if (t >= 1.7 && !dismissed) { dismissed = true; say('What r u looking down there?'); stamp.visible = true; soundEngine.playSound('stamp_slam'); }
      if (stamp.visible) stamp.position.y = 3.5 - easeOutCubic(Math.min(1, (t - 1.7) / 0.5)) * 2.2;
      if (t >= 2.8 && !impact) {
        impact = true; defender.takeDamage(32); defender.currentAttack = null;
        defender.forceState('knockdown'); defender.stunFrames = 36;
        defender.vx = facing * 3.8; defender.vy = 5.8; defender.airborne = true;
        wave.visible = true; wave.position.set(defender.x, 1, 0.15);
        say("I don't give a damn."); ui.showFlash('rgba(244,156,150,.6)', 250);
        soundEngine.playSound('thud');
      }
      if (wave.visible) {
        const progress = Math.min(1, (t - 2.8) / 1.2);
        wave.scale.setScalar(1 + progress * 7);
        wave.material.opacity = 0.9 * (1 - progress);
      }
      if (t > 4) stamp.visible = false;
    },
  };
}
