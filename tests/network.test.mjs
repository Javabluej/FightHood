import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import WebSocket from 'ws';
import { once } from 'node:events';

test('real room server: join, relay, host authority, replacement cleanup, disconnect', { timeout: 10000 }, async () => {
  const proc = spawn(process.execPath, ['server/roomServer.js'], { env: { ...process.env, PORT: '0' }, stdio: ['ignore','pipe','pipe'] });
  const clients = [];
  try {
    const output = await once(proc.stdout, 'data');
    const port = Number(output[0].toString().match(/port (\d+)/)[1]);
    const connect = async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}`); const inbox = [];
      ws.on('message', raw => inbox.push(JSON.parse(raw)));
      await once(ws,'open'); clients.push(ws);
      return { ws, inbox, send: data => ws.send(JSON.stringify(data)) };
    };
    const message = async (client, type) => {
      const deadline = Date.now()+2000;
      while(Date.now()<deadline) {
        const index=client.inbox.findIndex(m=>m.type===type);
        if(index>=0) return client.inbox.splice(index,1)[0];
        await new Promise(r=>setTimeout(r,10));
      }
      throw Error(`Timed out waiting for ${type}`);
    };
    const host=await connect(), guest=await connect(), third=await connect();
    host.send({type:'create_room'});const first=(await message(host,'room_created')).code;assert.match(first,/^[A-Z2-9]{4}$/);
    guest.send({type:'join_room',code:first});assert.equal((await message(guest,'room_joined')).role,'guest');await message(host,'room_joined');
    third.send({type:'join_room',code:first});assert.match((await message(third,'error')).message,/full/);
    guest.send({type:'input_frame',frame:1,input:{moveX:-1,punch:true}});const input=await message(host,'input_frame');assert.equal(input.input.punch,true);assert.equal(input.input.kick,false);
    guest.send({type:'match_start',stage:'sansad',p1Char:'modi',p2Char:'rahul'});
    await new Promise(r=>setTimeout(r,50));assert.equal(host.inbox.some(m=>m.type==='match_start'),false);
    host.send({type:'match_start',stage:'road',p1Char:'modi',p2Char:'rahul'});assert.equal((await message(guest,'match_start')).stage,'road');
    guest.send({type:'net_event',event:'pause',paused:true});assert.equal((await message(host,'net_event')).paused,true);
    host.send({type:'create_room'});const next=(await message(host,'room_created')).code;assert.notEqual(first,next);await message(guest,'peer_disconnect');
    third.send({type:'join_room',code:first});assert.match((await message(third,'error')).message,/not found/);
    guest.send({type:'join_room',code:next});await message(guest,'room_joined');await message(host,'room_joined');
    guest.ws.close();await message(host,'peer_disconnect');
    host.ws.send('{bad JSON');assert.equal((await message(host,'error')).message,'Invalid message.');
  } finally { for(const client of clients) client.terminate(); proc.kill(); }
});
