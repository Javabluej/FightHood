import { WebSocketServer, WebSocket } from 'ws';
import { randomInt } from 'node:crypto';

const PORT = Number(process.env.PORT || 8080);
const wss = new WebSocketServer({ port: PORT, maxPayload: 32 * 1024 });
const rooms = new Map();
const memberships = new Map();
const send = (ws, message) => {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
};
const error = (ws, message) => send(ws, { type: 'error', message });
function leave(ws) {
  const membership = memberships.get(ws);
  if (!membership) return;
  const room = rooms.get(membership.code);
  memberships.delete(ws);
  if (!room) return;
  const peer = membership.role === 'host' ? room.guest : room.host;
  memberships.delete(peer);
  send(peer, { type: 'peer_disconnect' });
  rooms.delete(membership.code);
}
function roomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do { code = Array.from({ length: 4 }, () => chars[randomInt(chars.length)]).join(''); } while (rooms.has(code));
  return code;
}
const validId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(value);
const hostEvents = new Set(['hit', 'super_trigger', 'super_end', 'round_start', 'round_over', 'match_over']);

wss.on('listening', () => console.log(`[College Hood Multiplayer Server] listening on port ${wss.address().port}`));
wss.on('connection', ws => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('error', () => leave(ws));
  ws.on('close', () => leave(ws));
  ws.on('message', data => {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return error(ws, 'Invalid message.'); }
    if (!msg || typeof msg !== 'object') return error(ws, 'Invalid message.');
    if (msg.type === 'create_room') {
      leave(ws);
      const code = roomCode();
      rooms.set(code, { host: ws, guest: null });
      memberships.set(ws, { code, role: 'host' });
      return send(ws, { type: 'room_created', code });
    }
    if (msg.type === 'join_room') {
      const code = typeof msg.code === 'string' ? msg.code.trim().toUpperCase() : '';
      const room = rooms.get(code);
      if (!room) return error(ws, `Room "${code}" not found.`);
      if (room.host === ws || room.guest) return error(ws, 'Room is already full or belongs to you.');
      leave(ws);
      room.guest = ws;
      memberships.set(ws, { code, role: 'guest' });
      send(ws, { type: 'room_joined', code, role: 'guest' });
      return send(room.host, { type: 'room_joined', code, role: 'host' });
    }
    const member = memberships.get(ws);
    const room = member && rooms.get(member.code);
    if (!room) return error(ws, 'Join a room first.');
    const host = member.role === 'host';
    const peer = host ? room.guest : room.host;
    if (msg.type === 'input_frame') {
      if (host) return; // Only guest inputs drive the remote host-controlled fighter.
      const input = msg.input;
      if (!input || !Number.isSafeInteger(msg.frame) || ![-1, 0, 1].includes(input.moveX)) return;
      const clean = { moveX: input.moveX };
      for (const key of ['up', 'down', 'punch', 'kick', 'grab', 'super']) clean[key] = input[key] === true;
      return send(peer, { type: 'input_frame', frame: msg.frame, input: clean });
    }
    if (msg.type === 'lobby_sync') {
      const state = msg.state;
      if (!state || !validId(state.hostChar) || !validId(state.guestChar) || !validId(state.stage)) return;
      return send(peer, { type: 'lobby_sync', state: { hostChar: state.hostChar, guestChar: state.guestChar, stage: state.stage } });
    }
    if (msg.type === 'match_start') {
      if (!host || !room.guest || !validId(msg.stage) || !validId(msg.p1Char) || !validId(msg.p2Char)) return;
      return send(peer, { type: 'match_start', stage: msg.stage, p1Char: msg.p1Char, p2Char: msg.p2Char });
    }
    if (msg.type === 'sync_snapshot') {
      if (!host || !Number.isSafeInteger(msg.frame) || !Number.isFinite(msg.timer)) return;
      for (const fighter of [msg.f1, msg.f2]) {
        if (!fighter || !['x', 'y', 'vx', 'vy', 'hp', 'meter', 'stateFrames'].every(key => Number.isFinite(fighter[key]))) return;
      }
      return send(peer, msg);
    }
    if (msg.type === 'rematch') return send(peer, { type: 'rematch' });
    if (msg.type === 'net_event') {
      if (msg.event === 'pause') return send(peer, { type: 'net_event', event: 'pause', paused: msg.paused === true });
      if (['rematch', 'return_to_select'].includes(msg.event) || (host && hostEvents.has(msg.event))) return send(peer, msg);
    }
  });
});
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { leave(ws); ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);
heartbeat.unref();
wss.on('close', () => clearInterval(heartbeat));
