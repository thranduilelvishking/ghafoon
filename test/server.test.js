'use strict';
process.env.GHAFOON_FAST = '1';
const test = require('node:test');
const assert = require('node:assert');
const WebSocket = require('ws');
const { createServer, rooms } = require('../server/server');
const bots = require('../server/bots');

function listen() {
  return new Promise((resolve) => {
    const server = createServer();
    server.listen(0, () => resolve({ server, port: server.address().port }));
  });
}

// A scripted "human": it reacts to state messages by using the bot brain.
function client(port, { auto = true } = {}) {
  const ws = new WebSocket(`ws://localhost:${port}/ws`);
  const c = { ws, state: null, joined: null, errors: [], played: new Set(), auto, states: 0 };
  const send = (o) => ws.send(JSON.stringify(o));
  c.send = send;
  c.waitFor = (pred, ms = 20000) => new Promise((resolve, reject) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (pred(c)) { clearInterval(iv); resolve(); }
      else if (Date.now() - t0 > ms) { clearInterval(iv); reject(new Error('timeout; phase=' + (c.state && c.state.phase))); }
    }, 5);
  });
  ws.on('message', (data) => {
    const m = JSON.parse(data);
    if (m.t === 'joined') c.joined = m;
    if (m.t === 'error') c.errors.push(m.msg);
    if (m.t !== 'state') return;
    c.state = m;
    c.states++;
    if (!c.auto || m.mode !== 'game') return;
    const me = m.you;
    if (m.phase === 'reading' && m.turn === me) send({ t: 'bid', value: bots.chooseBid(m.hand, m.highest) });
    else if (m.phase === 'hakem' && m.hakem === me) {
      const { hokm, discards } = bots.chooseHakem(m.hand);
      c.planned = hokm;
      send({ t: 'discard', discards });
    } else if (m.phase === 'hokm' && m.hakem === me) send({ t: 'hokm', hokm: c.planned }); else if (m.phase === 'play' && m.turn === me) {
      const played = new Set();
      send({ t: 'play', card: bots.choosePlay({ seat: me, hand: m.hand, plays: m.plays, hokm: m.hokm, hakem: m.hakem, reading: m.reading, tricks: m.tricks, played: c.played }) });
    } else if (m.phase === 'roundEnd') send({ t: 'ready' });
  });
  return new Promise((resolve) => ws.on('open', () => resolve(c)));
}

test('solo human + 3 bots play a whole game over websockets', async () => {
  const { server, port } = await listen();
  const c = await client(port);
  // track played cards for the brain
  c.ws.on('message', (d) => {
    const m = JSON.parse(d);
    if (m.t === 'state' && m.mode === 'game') {
      if (m.lastTrick) m.lastTrick.plays.forEach((p) => c.played.add(p.card));
      if (m.phase === 'draw') c.played.clear();
    }
  });
  c.send({ t: 'join', create: true, solo: true, name: 'Reza' });
  await c.waitFor((x) => x.state && x.state.phase === 'gameOver', 60000);
  assert.ok(Math.max(...c.state.scores) >= 104);
  assert.deepStrictEqual(c.errors, []);
  assert.strictEqual(c.state.seats.filter((s) => s.kind === 'bot').length, 3);
  c.send({ t: 'lobby' });
  await c.waitFor((x) => x.state.mode === 'lobby');
  c.ws.close();
  server.close();
});

test('lobby: second human joins by code, sits, host starts; hidden info stays hidden', async () => {
  const { server, port } = await listen();
  const a = await client(port, { auto: false });
  a.send({ t: 'join', create: true, name: 'A' });
  await a.waitFor((x) => x.joined);
  const b = await client(port, { auto: false });
  b.send({ t: 'join', room: a.joined.room.toLowerCase(), name: 'B' });
  await b.waitFor((x) => x.joined);
  assert.strictEqual(b.joined.seat, 1);
  b.send({ t: 'sit', seat: 2 });
  await b.waitFor((x) => x.state.you === 2 || (x.state.seats[2].name === 'B'));
  b.send({ t: 'start' });
  await new Promise((r) => setTimeout(r, 50));
  assert.ok(b.errors.length > 0, 'non-host cannot start');
  a.send({ t: 'start' });
  await a.waitFor((x) => x.state.mode === 'game');
  await b.waitFor((x) => x.state.mode === 'game');
  assert.strictEqual(a.state.hand.length, 12);
  assert.notDeepStrictEqual(a.state.hand, b.state.hand);
  assert.strictEqual(a.state.hokm, null);
  assert.ok(!('yard' in a.state));
  a.ws.close(); b.ws.close();
  server.close();
});

test('disconnected human is replaced by a bot, can reconnect with token', async () => {
  const { server, port } = await listen();
  const a = await client(port);
  a.send({ t: 'join', create: true, solo: true, name: 'A' });
  await a.waitFor((x) => x.state && x.state.mode === 'game');
  const { room, token, seat } = a.joined;
  a.ws.close();
  await new Promise((r) => setTimeout(r, 100));
  const r = rooms.get(room);
  assert.ok(r, 'room survives while game is running');
  assert.ok(r.isBot(seat));
  const b = await client(port);
  b.send({ t: 'join', room, token, name: 'A' });
  await b.waitFor((x) => x.joined);
  assert.strictEqual(b.joined.seat, seat);
  assert.ok(!r.isBot(seat));
  // new player joins mid-game into a bot seat
  const c = await client(port, { auto: false });
  c.send({ t: 'join', room, name: 'C' });
  await c.waitFor((x) => x.joined);
  assert.notStrictEqual(c.joined.seat, seat);
  b.ws.close(); c.ws.close();
  server.close();
});

test('unknown room is rejected', async () => {
  const { server, port } = await listen();
  const a = await client(port, { auto: false });
  a.send({ t: 'join', room: 'ZZZZ', name: 'A' });
  await a.waitFor((x) => x.errors.length);
  assert.match(a.errors[0], /not found/i);
  a.ws.close();
  server.close();
});

test('names: duplicates get a suffix, rename works, empty name falls back to the seat number', async () => {
  const { server, port } = await listen();
  const a = await client(port, { auto: false });
  a.send({ t: 'join', create: true, name: 'Sara' });
  await a.waitFor((x) => x.joined);
  const b = await client(port, { auto: false });
  b.send({ t: 'join', room: a.joined.room, name: 'sara' });
  await b.waitFor((x) => x.joined);
  const c = await client(port, { auto: false });
  c.send({ t: 'join', room: a.joined.room, name: '' });
  await c.waitFor((x) => x.joined);
  await a.waitFor((x) => x.state.seats[2].kind === 'human');
  assert.deepStrictEqual(a.state.seats.slice(0, 3).map((s) => s.name), ['Sara', 'sara 2', 'Player 3']);
  // rename: collides with Sara -> suffix; bot names are reserved too
  b.send({ t: 'rename', name: 'SARA' });
  await a.waitFor((x) => x.state.seats[1].name === 'SARA 2');
  b.send({ t: 'rename', name: 'Arash' });
  await a.waitFor((x) => x.state.seats[1].name === 'Arash 2');
  b.send({ t: 'rename', name: '   ' });
  await new Promise((r) => setTimeout(r, 50));
  assert.ok(b.errors.length > 0);
  assert.strictEqual(a.state.seats[1].name, 'Arash 2');
  a.ws.close(); b.ws.close(); c.ws.close();
  server.close();
});
