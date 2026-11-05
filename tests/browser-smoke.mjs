import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
const delay = ms => new Promise(r => setTimeout(r, ms));
const base = 'http://127.0.0.1:3173';
const production = process.argv.includes('--preview');
const supersOnly = process.argv.includes('--supers-only');
const networkOnly = process.argv.includes('--network-only');
const brandingOnly = process.argv.includes('--branding-only');
const requestedFighter = process.argv.find(arg=>arg.startsWith('--fighter='))?.split('=')[1];
const phaseEvidence = [];
const processes = [], sockets = [], errors = [], requests = [], warnings = [], probes = [], logs = [];
const profile = await mkdtemp(path.join(tmpdir(), 'fightkaro-smoke-'));
const out = path.resolve('test-results');
const reportPath = path.join(out, brandingOnly ? 'browser-report-branding.json' : networkOnly ? 'browser-report-network.json' : supersOnly ? 'browser-report-super-phases.json' : production ? 'browser-report-production.json' : 'browser-report.json');
await mkdir(out,{recursive:true});
await writeFile(reportPath,JSON.stringify({passed:false,status:'running'}));
const launch = (command,args,env={}) => { const child=spawn(command,args,{env:{...process.env,...env},stdio:['ignore','pipe','pipe']});processes.push(child);child.on('error',e=>errors.push(String(e)));child.stdout.on('data',()=>{});child.stderr.on('data',data=>{if(/ERROR|FATAL/.test(data.toString())) warnings.push(data.toString().slice(0,1000));});return child; };
const until = async (fn,label,timeout=15000) => {const end=Date.now()+timeout;let last;while(Date.now()<end){try{const value=await fn();if(value)return value;}catch(e){last=e;}await delay(100);}throw Error(`Timeout: ${label}${last?`: ${last}`:''}`);};
function cdp(ws) {
 let id=0;const pending=new Map();
 ws.on('message',data=>{const msg=JSON.parse(data);if(msg.id){const p=pending.get(msg.id);if(!p)return;pending.delete(msg.id);clearTimeout(p.timeout);msg.error?p.reject(Error(JSON.stringify(msg.error))):p.resolve(msg.result);}else if(msg.method==='Runtime.exceptionThrown'){errors.push(JSON.stringify(msg.params.exceptionDetails));}else if(msg.method==='Runtime.consoleAPICalled'&&['error','warning'].includes(msg.params.type)){warnings.push(msg.params.args.map(arg=>arg.value??arg.description).join(' '));}else if(msg.method==='Runtime.consoleAPICalled'){logs.push(msg.params.args.map(arg=>arg.value??arg.description).join(' '));}else if(msg.method==='Network.loadingFailed'){warnings.push(JSON.stringify(msg.params));}else if(msg.method==='Network.responseReceived'&&msg.params.response.status>=400){requests.push(msg.params.response.url);}});
 return (method,params={})=>new Promise((resolve,reject)=>{const key=++id;const timeout=setTimeout(()=>{pending.delete(key);reject(Error(`CDP timeout ${method}: ${params.expression?.slice(0,180) ?? ''}`));},15000);pending.set(key,{resolve,reject,timeout});ws.send(JSON.stringify({id:key,method,params}));});
}
try {
 launch(process.execPath,['node_modules/vite/bin/vite.js',...(production ? ['preview'] : []),'--host','127.0.0.1','--port','3173','--strictPort'],{VITE_MULTIPLAYER_URL:'ws://127.0.0.1:18188'});
 launch(process.execPath,['server/roomServer.js'],{PORT:production?'8080':'18188'});
 await until(async()=> (await fetch(base)).ok,'Vite');
 launch(process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',[
 ...(process.env.HEADFUL ? [] : ['--headless=new']),'--disable-gpu-vsync','--mute-audio','--no-first-run','--no-default-browser-check',
 '--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows',
 '--enable-unsafe-swiftshader','--remote-debugging-port=9447',`--user-data-dir=${profile}`,base]);
 const tab = async (url,create=false) => {
  if(create) await fetch(`http://127.0.0.1:9447/json/new?${encodeURIComponent(url)}`,{method:'PUT'});
  const targets=await until(async()=>{const list=await(await fetch('http://127.0.0.1:9447/json')).json();return list.filter(t=>t.type==='page'&&t.url.startsWith(base));},'Chrome targets');
  const target=create?targets.find(t=>!sockets.some(s=>s.target===t.id)):targets[0];
  const ws=new WebSocket(target.webSocketDebuggerUrl);ws.target=target.id;sockets.push(ws);await new Promise(r=>ws.on('open',r));const send=cdp(ws);
  await send('Runtime.enable');await send('Network.enable');await send('Emulation.setFocusEmulationEnabled',{enabled:true});await send('Emulation.setDeviceMetricsOverride',{width:960,height:540,deviceScaleFactor:1,mobile:false});
  const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
  probes.push(evaluate);
  await until(()=>evaluate('!!window.__ENGINE__'),'engine');
  return {send,evaluate,ready:async()=>{try{return await until(()=>evaluate(`window.__ENGINE__.state==='fighting'`),'fight intro');}catch(error){throw Error(`${error.message}; state=${await evaluate('JSON.stringify({state:window.__ENGINE__.state,screen:window.__ENGINE__.ui.currentScreen,lifecycle:window.__ENGINE__.lifecycle,paused:window.__ENGINE__.isPaused,frames:window.__ENGINE__.frameCount})')}`);}}};
 };
 const host=await tab(base); const e=host.evaluate;
 await delay(500);
 assert.equal(await e('document.title'),'College Hood — Political Satire Fighter');
 assert.equal(await e(`document.querySelectorAll('a[href*="instagram.com"],a[href^="mailto:"]').length`),0,'original contact and social links removed');
 assert.equal(await e(`document.documentElement.classList.contains('legal-accepted')`),false,'notice requires user click');
 await e(`document.getElementById('legal-ok').click();document.getElementById('title').click()`);
 assert.equal(await e(`window.__ENGINE__.ui.currentScreen`),'select');
 await host.send('Input.dispatchKeyEvent',{type:'keyDown',key:'t',code:'KeyT'});await host.send('Input.dispatchKeyEvent',{type:'keyUp',key:'t',code:'KeyT'});
 assert.equal(await e(`window.__ENGINE__.ui.selectedStage`),'jantar');
 if(brandingOnly){
   const result=await host.send('Page.captureScreenshot',{format:'png'});await writeFile(path.join(out,'college-hood-select.png'),Buffer.from(result.data,'base64'));
   assert.equal(await e(`document.querySelector('#title .logo').textContent.trim()`),'COLLEGE HOOD');
   assert.equal(await e(`fetch('/manifest.webmanifest').then(r=>r.json()).then(m=>m.name)`),'College Hood');
   assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
   await writeFile(reportPath,JSON.stringify({passed:true,scope:'College Hood title, manifest, removed contacts, character selection and stage control',errors,missingAssets:requests},null,2));console.log('PASS College Hood branding and selection');
 } else {
 await e(`document.getElementById('fight-btn').click()`);await host.ready();
 await until(()=>e(`window.__ENGINE__.rig1.loaded&&window.__ENGINE__.rig2.loaded`),'both character rigs loaded');
 await e(`window.__ENGINE__.cpuBot.think=()=>({moveX:0,up:false,down:false,punch:false,kick:false,grab:false,super:false})`);
 const x=await e('window.__ENGINE__.fighter1.x');
 await host.send('Input.dispatchKeyEvent',{type:'keyDown',key:'d',code:'KeyD'});await delay(250);await host.send('Input.dispatchKeyEvent',{type:'keyUp',key:'d',code:'KeyD'});
 assert.ok(await e('window.__ENGINE__.fighter1.x')>x,'real keyboard moves fighter');
 await e(`window.__ENGINE__.fighter1.x=0;window.__ENGINE__.fighter2.x=1;window.__ENGINE__.fighter1.forceState('idle')`);
 await host.send('Input.dispatchKeyEvent',{type:'keyDown',key:'j',code:'KeyJ'});await host.send('Input.dispatchKeyEvent',{type:'keyUp',key:'j',code:'KeyJ'});await delay(450);
 assert.ok(await e('window.__ENGINE__.fighter2.health')<100,'keyboard punch applies damage');
 await e(`document.getElementById('pause-btn').click()`);const timer=await e('window.__ENGINE__.roundTimeLeft');await delay(350);assert.equal(await e('window.__ENGINE__.roundTimeLeft'),timer);await e(`document.getElementById('resume-btn').click()`);
 const screenshot=async(name,client=host)=>{const result=await client.send('Page.captureScreenshot',{format:'png'});await writeFile(path.join(out,name),Buffer.from(result.data,'base64'));};
 const speechOverlaps=()=>e(`(()=>{const boxes=[...document.querySelectorAll('#popups .speech[data-speaker]')].map(b=>b.getBoundingClientRect());return boxes.length===2&&Math.min(boxes[0].right,boxes[1].right)>Math.max(boxes[0].left,boxes[1].left)+1&&Math.min(boxes[0].bottom,boxes[1].bottom)>Math.max(boxes[0].top,boxes[1].top)+1;})()`);
 await screenshot('gameplay.png');
 // Every roster asset loads, every super completes, damage happens once and fighters recover.
 const fullRoster=['modi','rahul','didi','trump','yogi','nitin','mbapu','kenny','pratham'];
 assert.ok(!requestedFighter||fullRoster.includes(requestedFighter),'valid --fighter');
 const roster=networkOnly?[]:requestedFighter?[requestedFighter]:fullRoster;
 for(const id of roster){
  await e(`window.__ENGINE__.startMatch('${id}','rahul','sansad','normal')`);await host.ready();
  await until(()=>e(`window.__ENGINE__.rig1.loaded&&window.__ENGINE__.rig2.loaded`),`${id} model`);
  if(id==='kenny'||id==='pratham'||id==='yogi'){
    assert.equal(await e(`document.querySelectorAll('[data-tile="${id}"]').length`),1);await screenshot(`${id}-gameplay.png`);
    await e(`(()=>{const g=window.__ENGINE__;const update=g.rig1.update,camera=g.updateCamera,position=g.camera.position.clone(),rotation=g.camera.quaternion.clone(),rootPosition=g.rig1.root.position.clone(),rootRotation=g.rig1.root.quaternion.clone();const background=g.scene.background;const hemi=g.stageRenderer.hemiLight.clone(),key=g.stageRenderer.dirLight.clone();hemi.color.set('#ffffff');hemi.groundColor.set('#817369');hemi.intensity=2;key.color.set('#ffffff');key.intensity=2;key.position.set(2,3,4);g.scene.add(hemi,key);g.stageRenderer.group.visible=false;g.scene.background=g.stageRenderer.floorMesh.material.color.clone().set('#32373d');g.isPaused=true;g.rig1.update=()=>{};g.updateCamera=()=>{};g.rig1.root.position.set(0,0,0);g.rig1.root.rotation.set(0,0,0);g.rig1.resetPose();g.rig2.root.visible=false;g.camera.position.set(0,1.6,1.55);g.camera.lookAt(0,1.6,0);const elements=[...document.querySelectorAll('#hud,#popups,#announce,#sound-btn')];elements.forEach(el=>el.style.visibility='hidden');g.__restorePreview=()=>{g.rig1.update=update;g.updateCamera=camera;g.camera.position.copy(position);g.camera.quaternion.copy(rotation);g.rig1.root.position.copy(rootPosition);g.rig1.root.quaternion.copy(rootRotation);g.rig2.root.visible=true;g.stageRenderer.group.visible=true;g.scene.background=background;g.scene.remove(hemi,key);hemi.dispose();key.dispose();g.isPaused=false;elements.forEach(el=>el.style.visibility='');delete g.__restorePreview;};})()`);
    if(id==='pratham')await e(`window.__ENGINE__.camera.position.set(0,1.68,1.2);window.__ENGINE__.camera.lookAt(0,1.68,0)`);
    await screenshot(`${id}-model-closeup.png`);await e('window.__ENGINE__.__restorePreview()');
  }
  if(id==='pratham')await e(`{const g=window.__ENGINE__;g.__spoken=[];const original=g.ui.showSpeech.bind(g.ui);g.ui.showSpeech=(text,...args)=>{g.__spoken.push(text);original(text,...args);};g.__restoreSpeech=()=>{g.ui.showSpeech=original;delete g.__restoreSpeech;};}`);
  await e(`{const g=window.__ENGINE__;g.fighter1.meter=100;g.triggerSuper(g.fighter1,g.fighter2);}`);
  await until(()=>e(`!!window.__ENGINE__.superDirector?.ready`),`${id} cinematic ready: ${await e('JSON.stringify({state:window.__ENGINE__.state,fighter:window.__ENGINE__.fighter1.state,meter:window.__ENGINE__.fighter1.meter})')}`);
  assert.equal(await e('window.__ENGINE__.fighter1.meter'),0);
  if(id==='modi'){await e('window.__ENGINE__.ui.onPauseFight()');const time=await e('window.__ENGINE__.superDirector.timer');await delay(300);assert.equal(await e('window.__ENGINE__.superDirector.timer'),time,'paused super clock');await e('window.__ENGINE__.ui.onResumeFight()');}
  await e(`window.__ENGINE__.isPaused=true`);
  const phases={modi:[1.3,2.3,2.9,3.8],rahul:[2.2,3.4,4.05,5.3,6.7,8.2],didi:[2.3,5.5,7.6,8.9],trump:[1.3,3.8,4.8,5.7],yogi:[.7,2.4,2.7,3.4,4.4,5.8],nitin:[2.1,4.5,7.05,7.5,8.5],mbapu:[1.7,3.3,4.8,5.7,6.6],kenny:[1.8,3.2,4.7],pratham:[1.1,1.9,2.9,3.8,5.6]}[id];
  for(const time of phases){
    await e(`new Promise(resolve=>{const g=window.__ENGINE__;while(g.superDirector&&g.superDirector.timer+1/60<${time}){g.superDirector.update(1/60);g.updateCamera(1/60);}requestAnimationFrame(()=>requestAnimationFrame(resolve));})`);
    const phase=await e(`(()=>{const g=window.__ENGINE__;let finite=true;g.scene.traverse(o=>{finite=finite&&[...o.position.toArray(),...o.quaternion.toArray(),...o.scale.toArray()].every(Number.isFinite);});return {id:'${id}',time:g.superDirector?.timer,hp:g.fighter2.health,visible:g.rig2.root.visible,finite,callState:g.scene.getObjectByName('PrathamCallScreen')?.userData.callState,headMetalness:g.rig1.model.getObjectByName('Head')?.material?.metalness};})()`);
    assert.equal(phase.finite,true,`${id} finite transforms at ${time}`);if(id==='yogi')assert.equal(phase.headMetalness,0,'Dozer face is not metallic');
    if(id==='pratham'&&time===2.9)assert.equal(phase.callState,'CONTACT BLOCKED');
    // Let the actual UI flash transition settle while simulation stays paused.
    await delay(520);
    assert.equal(await speechOverlaps(),false,`${id} dialogue stays readable at ${time}`);
    phaseEvidence.push(phase);await screenshot(`super-${id}-${time.toFixed(2)}.png`);
  }
  await e(`{const g=window.__ENGINE__;for(let i=0;i<900&&g.superDirector;i++)g.superDirector.update(1/60);g.isPaused=false;}`);
  assert.equal(await e('window.__ENGINE__.state'),'fighting');assert.ok(await e('window.__ENGINE__.fighter2.health')<100,`${id} super deals damage`);
  assert.equal(await e('window.__ENGINE__.rig2.root.visible'),true);if(id==='kenny')assert.equal(await e('window.__ENGINE__.fighter2.health'),68,'attendance ultimate applies exactly 32 damage');if(id==='pratham'){assert.equal(await e('window.__ENGINE__.fighter2.health'),68);const lines=await e('window.__ENGINE__.__spoken');for(const line of ['U hurted me bro','why bro ignoring','Full studiid pa ?','sometimes its good for health to get hurted'])assert.ok(lines.includes(line),line);await e('window.__ENGINE__.__restoreSpeech()');}console.log(`PASS ${id} rig and super`);
 }
 // Mirrored, close-range corner starts use the same staging and complete safely.
 for(const id of roster){
  await e(`window.__ENGINE__.startMatch('${id}','modi','${id==='yogi'?'jantar':id==='mbapu'?'road':'sansad'}','normal')`);await host.ready();
  await until(()=>e('window.__ENGINE__.rig1.loaded&&window.__ENGINE__.rig2.loaded'),`${id} mirrored model`);
  await e(`{const g=window.__ENGINE__;g.fighter1.x=6.1;g.fighter2.x=5.3;g.fighter1.facing=-1;g.fighter2.facing=1;g.fighter1.meter=100;g.triggerSuper(g.fighter1,g.fighter2);}`);
  await until(()=>e('!!window.__ENGINE__.superDirector?.ready'),`${id} mirrored ready`);
  await e(`{const g=window.__ENGINE__;g.isPaused=true;for(let i=0;i<210;i++){g.superDirector.update(1/60);g.updateCamera(1/60);}}`);
  assert.equal(await e('window.__ENGINE__.fighter1.facing'),-1);
  await delay(520);assert.equal(await speechOverlaps(),false,`${id} mirrored dialogue`);await screenshot(`super-${id}-mirrored-corner.png`);
  await e(`{const g=window.__ENGINE__;for(let i=0;i<900&&g.superDirector;i++)g.superDirector.update(1/60);g.isPaused=false;}`);
  assert.equal(await e('window.__ENGINE__.rig2.root.visible'),true);assert.equal(await e('window.__ENGINE__.fighter2.health'),id==='pratham'||id==='kenny'?68:70);
 }
 if(!networkOnly){
 // Exercise the real requestAnimationFrame loop through the whole Yatra sequence.
 await e(`window.__ENGINE__.startMatch('rahul','modi','sansad','normal')`);await host.ready();
 await until(()=>e('window.__ENGINE__.rig1.loaded&&window.__ENGINE__.rig2.loaded'),'real-time Yatra models');
 await e(`{const g=window.__ENGINE__;g.fighter1.meter=100;g.triggerSuper(g.fighter1,g.fighter2);}`);
 await until(()=>e('!!window.__ENGINE__.superDirector?.ready'),'real-time Yatra ready');
 await until(()=>e('window.__ENGINE__.superDirector?.timer>4.15'),'real-time potato enters hopper');
 assert.equal(await e(`window.__ENGINE__.scene.getObjectByName('YatraPotato').visible`),false);
 await until(()=>e(`window.__ENGINE__.state==='fighting'&&!window.__ENGINE__.superDirector`),'real-time Yatra finish',15000);
 await until(()=>e(`window.__ENGINE__.fighter2.state==='idle'`),'real-time defender recovery');
 assert.equal(await e('window.__ENGINE__.fighter2.health'),70);console.log('PASS mirrored corner supers and real-time Yatra recovery');
 }
 if(supersOnly){assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);await writeFile(reportPath,JSON.stringify({passed:true,scope:'rendered super timelines, mirrored corners and real-time Yatra recovery',roster,phaseEvidence,errors,missingAssets:requests,warnings},null,2));console.log('PASS rendered ultimate phases');process.exitCode=0;}
 if(!supersOnly){
 // Result, rematch, timeout, boss defense and an actual CPU approach.
 await e(`window.__ENGINE__.startMatch('modi','rahul','sansad','normal')`);await host.ready();
 await e(`{const g=window.__ENGINE__;g.fighter1.wins=1;g.fighter2.health=0;g.fighter2.forceState('ko');g.handleKo();}`);
 await until(()=>e(`window.__ENGINE__.ui.currentScreen==='result'`),'result newspaper');
 assert.equal(await e(`document.getElementById('result-title').textContent`),'YOU WIN!');await screenshot('result.png');
 await e(`document.getElementById('rematch-btn').click()`);await host.ready();
 assert.equal(await e('window.__ENGINE__.fighter1.wins'),0);assert.equal(await e('window.__ENGINE__.fighter2.health'),100);
 await e(`{const g=window.__ENGINE__;g.fighter1.health=80;g.fighter2.health=40;g.roundTimeLeft=0;}`);
 await until(()=>e('window.__ENGINE__.currentRound===2'),'timeout starts next round');await host.ready();assert.equal(await e('window.__ENGINE__.fighter1.wins'),1);
 await e(`window.__ENGINE__.startMatch('modi','mbapu','sansad','normal')`);await host.ready();
 await e(`{const g=window.__ENGINE__;g.fighter1.x=0;g.fighter2.x=1;g.fighter1.peaceCharge=11.99;g.fighter1.holdingBack=true;g.input.pollInputs=()=>({moveX:-1,up:false,down:false,punch:false,kick:false,grab:false,super:false});g.fixedUpdate();delete g.input.pollInputs;}`);
 await until(()=>e(`window.__ENGINE__.ui.currentScreen==='result'`),'peaceful boss victory');assert.equal(await e(`document.getElementById('result-title').textContent`),'SHANTI KI JEET');
 await e(`window.__ENGINE__.startMatch('modi','rahul','road','hard')`);await host.ready();
 await e(`delete window.__ENGINE__.cpuBot.think`);const cpuX=await e('window.__ENGINE__.fighter2.x');await delay(1500);assert.ok(await e('window.__ENGINE__.fighter2.x')<cpuX,'CPU approaches from starting range');
 await e(`window.__ENGINE__.cpuBot.think=()=>({moveX:0,up:false,down:false,punch:false,kick:false,grab:false,super:false})`);
 const metrics=await e(`({drawCalls:window.__ENGINE__.renderer.info.render.calls,geometries:window.__ENGINE__.renderer.info.memory.geometries,textures:window.__ENGINE__.renderer.info.memory.textures})`);
 console.log('Render metrics:',metrics);
 for(let i=0;i<3;i++){await e(`window.__ENGINE__.startMatch('modi','rahul','road','normal')`);await host.ready();}
 const afterRematches=await e(`({geometries:window.__ENGINE__.renderer.info.memory.geometries,textures:window.__ENGINE__.renderer.info.memory.textures})`);
 assert.ok(afterRematches.geometries<=metrics.geometries+4,'geometry count stable through rematches');
 assert.ok(afterRematches.textures<=metrics.textures+4,'texture count stable through rematches');
 // Cancelling an intro/super cannot resurrect a match or create late props.
 await e(`{const g=window.__ENGINE__;g.startMatch('modi','rahul','sansad','normal');g.ui.onQuitToSelect();g.ui.showScreen('select');}`);await delay(1900);assert.equal(await e('window.__ENGINE__.state'),'idle');
 await e(`window.__ENGINE__.startMatch('modi','rahul','road','normal')`);await host.ready();
 await e(`{const g=window.__ENGINE__;g.fighter1.meter=100;g.triggerSuper(g.fighter1,g.fighter2);g.ui.onQuitToSelect();g.ui.showScreen('select');}`);await delay(1700);assert.equal(await e('window.__ENGINE__.state'),'idle');
 // True two-client online flow.
 const guest=await tab(`${base}/?guest=1`,true);await delay(350);await guest.evaluate(`document.getElementById('legal-ok')?.click();window.__ENGINE__.ui.showScreen('select')`);
 await e(`window.__ENGINE__.ui.onHostRoom()`);const code=await until(()=>e('window.__ENGINE__.netClient.roomCode'),'room code');
 await guest.evaluate(`window.__ENGINE__.ui.onJoinRoom('${code}')`);
 await until(()=>e('window.__ENGINE__.isOnline'),'host online');await until(()=>guest.evaluate('window.__ENGINE__.isGuest'),'guest online');
 await e(`window.__ENGINE__.ui.onStartFight()`);await host.ready();await guest.ready();
 await until(()=>guest.evaluate('window.__ENGINE__.fighter1.stateFrames>5'),`guest snapshots, host: ${await e('JSON.stringify({frame:window.__ENGINE__.frameCount,state:window.__ENGINE__.state,frames:window.__ENGINE__.fighter1.stateFrames})')}`);
 // Add 80ms in each direction to the actual room connection. Guest motion
 // must start before its command can reach the host and settle after release.
 await guest.evaluate(`{const g=window.__ENGINE__;const send=g.netClient.sendInput.bind(g.netClient),receive=g.netClient.onSnapshot;g.__restoreLag=()=>{g.netClient.sendInput=send;g.netClient.onSnapshot=receive;};g.netClient.sendInput=(...args)=>setTimeout(()=>send(...args),80);g.netClient.onSnapshot=snap=>setTimeout(()=>receive(snap),80);}`);
 const guestStart=await guest.evaluate('window.__ENGINE__.fighter2.x');
 await guest.send('Input.dispatchKeyEvent',{type:'keyDown',key:'d',code:'KeyD'});await delay(50);
 assert.ok(await guest.evaluate('window.__ENGINE__.fighter2.x')>guestStart+.01,'guest movement predicts before 160ms network round trip');
 await delay(350);await guest.send('Input.dispatchKeyEvent',{type:'keyUp',key:'d',code:'KeyD'});
 await delay(700);
 assert.ok(Math.abs(await guest.evaluate('window.__ENGINE__.fighter2.x')-await e('window.__ENGINE__.fighter2.x'))<.2,'guest converges after delayed movement stops');
 await guest.evaluate('window.__ENGINE__.__restoreLag()');await delay(200);console.log('PASS guest prediction with 160ms injected round trip');
 await host.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});await host.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape'});await until(()=>guest.evaluate('window.__ENGINE__.isPaused'),'synchronized pause');
 await e(`document.getElementById('resume-btn').click()`);await until(()=>guest.evaluate('!window.__ENGINE__.isPaused'),'synchronized resume');
 await e(`{const g=window.__ENGINE__;g.fighter1.x=0;g.fighter2.x=1;g.fighter1.forceState('idle');g.fighter2.forceState('idle');g.fighter2.health=100;g.fighter1.startAttack('jab');}`);await delay(600);
 const hostHP=await e('window.__ENGINE__.fighter2.health');assert.ok(hostHP<100);await until(async()=>await guest.evaluate('window.__ENGINE__.fighter2.health')===hostHP,'authoritative health');
 await screenshot('online.png',guest);
 // Host super completion and mirror-match result stay authoritative on both clients.
 await e(`{const g=window.__ENGINE__;g.fighter1.forceState('idle');g.fighter2.forceState('idle');g.fighter1.meter=100;g.broadcastSnapshot();}`);await delay(100);
 await host.send('Input.dispatchKeyEvent',{type:'keyDown',key:'l',code:'KeyL'});await host.send('Input.dispatchKeyEvent',{type:'keyUp',key:'l',code:'KeyL'});
 await until(()=>e('!!window.__ENGINE__.superDirector?.ready'),'online super ready');
 await e(`{const g=window.__ENGINE__;for(let i=0;i<900&&g.superDirector;i++)g.superDirector.update(1/60);}`);
 await until(()=>guest.evaluate(`window.__ENGINE__.state==='fighting'&&!window.__ENGINE__.superDirector`),'guest super finishes with host');
 await until(async()=>await guest.evaluate('window.__ENGINE__.fighter2.health')===await e('window.__ENGINE__.fighter2.health'),'super health synchronized');
 await e(`{const g=window.__ENGINE__;g.ui.selectedP1='modi';g.ui.selectedP2='modi';g.ui.onStartFight();}`);await host.ready();await guest.ready();
 await e(`{const g=window.__ENGINE__;g.fighter2.wins=1;g.fighter1.health=0;g.fighter1.forceState('ko');g.handleKo();}`);
 await until(()=>guest.evaluate(`window.__ENGINE__.ui.currentScreen==='result'`),'mirror guest result');
 assert.equal(await guest.evaluate(`document.getElementById('result-title').textContent`),'YOU WIN!');
 await e(`document.getElementById('rematch-btn').click()`);await host.ready();await guest.ready();
 assert.equal(await guest.evaluate('window.__ENGINE__.fighter1.wins'),0);
 await guest.evaluate(`window.__ENGINE__.netClient.disconnect()`);await until(()=>e('window.__ENGINE__.isPaused'),'disconnect pauses match');
 // Mobile emulation exercises pointer cancellation and visible, unique controls.
 const mobile=await tab(`${base}/?mobile=1`,true);
 await mobile.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
 await mobile.send('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:1,mobile:true});
 await mobile.send('Page.reload');await until(()=>mobile.evaluate('!!window.__ENGINE__'),'mobile engine');await delay(500);
 await mobile.evaluate(`document.getElementById('legal-ok')?.click();window.__ENGINE__.ui.showScreen('select');document.getElementById('fight-btn').click()`);await mobile.ready();
 assert.equal(await mobile.evaluate(`document.querySelectorAll('#virtual-touch-pad').length`),1);
 assert.equal(await mobile.evaluate(`getComputedStyle(document.getElementById('touch')).display`),'none');
 await mobile.evaluate(`{const g=window.__ENGINE__;g.cpuBot.think=()=>({moveX:0,up:false,down:false,punch:false,kick:false,grab:false,super:false});g.fighter1.x=0;g.fighter2.x=1;g.fighter1.forceState('idle');g.fighter2.forceState('idle');}`);
 const touchButton=await mobile.evaluate(`(()=>{const b=[...document.querySelectorAll('#virtual-touch-pad button')].find(b=>b.textContent==='P').getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2,id:1};})()`);
 const mobileHP=await mobile.evaluate('window.__ENGINE__.fighter2.health');
 await mobile.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touchButton]});await delay(300);
 await mobile.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
 assert.ok(await mobile.evaluate('window.__ENGINE__.fighter2.health')<mobileHP,'real mobile touch punch deals damage');
 assert.equal(await mobile.evaluate(`window.__ENGINE__.input.heldKeys.has('KeyJ')`),false,'touch cancellation releases punch');
 await screenshot('mobile.png',mobile);
 assert.deepEqual(errors,[],'no uncaught browser errors');assert.deepEqual(requests,[],'no missing assets');
 console.log(`PASS browser: menus, combat, pause, ${networkOnly?'network regression with injected latency':'9 models/supers'}, results, rematch, CPU, two-client rooms, snapshots, online supers, disconnect, mobile touch`);
 await writeFile(reportPath,JSON.stringify({errors,missingAssets:requests,renderMetrics:metrics,afterRematches,phaseEvidence,mode:production?'production':'development',headful:!!process.env.HEADFUL,warnings,passed:true},null,2));
 }
 }
} catch (error) { const states=[];for(const probe of probes){try{states.push(await probe(`JSON.stringify({ready:document.readyState,url:location.href,body:document.body?.innerText.slice(-500),resources:performance.getEntriesByType('resource').map(r=>r.name).slice(-12)})`));}catch(e){states.push(String(e));}}const diagnostic={passed:false,error:String(error),errors,requests,warnings,logs,states};await writeFile(reportPath,JSON.stringify(diagnostic,null,2));console.error('Browser diagnostics:', diagnostic); throw error; } finally {
 for(const ws of sockets) ws.close();for(const child of processes) child.kill();await delay(300);await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
