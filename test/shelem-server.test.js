'use strict';
process.env.GHAFOON_FAST = '1';
const test = require('node:test');
const assert = require('node:assert');
const WebSocket = require('ws');
const { createServer } = require('../server/server');

function listen() {
  return new Promise((resolve) => {
    const server = createServer();
    server.listen(0, () => resolve({ server, port: server.address().port }));
  });
}

// A scripted human for Shelem: always passes in the bidding, plays the first legal card, clicks "next round".
function client(port, { play = false } = {}) {
  const ws = new WebSocket(`ws://localhost:${port}/ws`);
  const c = { ws, state: null, joined: null, errors: [] };
  c.send = (o) => ws.send(JSON.stringify(o));
  c.waitFor = (pred, ms = 30000) => new Promise((resolve, reject) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (pred(c)) { clearInterval(iv); resolve(); } else if (Date.now() - t0 > ms) { clearInterval(iv); reject(new Error('timeout; phase=' + (c.state && c.state.phase))); }
    }, 5);
  });
  ws.on('message', (data) => {
    const m = JSON.parse(data);
    if (m.t === 'joined') c.joined = m;
    if (m.t === 'error') c.errors.push(m.msg);
    if (m.t !== 'state') return;
    c.state = m;
    if (!play || m.mode !== 'game') return;
    if (m.phase === 'bid' && m.turn === m.you) c.send({ t: 'bid', value: 0 });
    else if (m.phase === 'play' && m.turn === m.you) c.send({ t: 'play', card: m.legal[0], hokm: 0 });
    else if (m.phase === 'roundEnd') c.send({ t: 'ready' });
  });
  return new Promise((resolve) => ws.on('open', () => resolve(c)));
}
const settle = () => new Promise((r) => setTimeout(r, 80));

test('Shelem room: the choice is made at creation, options are set in the lobby by the host only', async () => {
  const { server, port } = await listen();
  const a = await client(port);
  a.send({ t: 'join', create: true, solo: true, name: 'A', game: 'shelem' });
  await a.waitFor((x) => x.state);
  await settle();
  assert.strictEqual(a.state.game, 'shelem');
  assert.strictEqual(a.state.mode, 'lobby', 'Shelem opens in the lobby even for quick play');
  assert.deepStrictEqual(a.state.options, { format: 'classic', topHokm: false, target: 800 });
  const b = await client(port);
  b.send({ t: 'join', room: a.joined.room, name: 'B' });
  await b.waitFor((x) => x.state);
  assert.strictEqual(b.state.game, 'shelem', 'joining by code uses the room game');
  a.send({ t: 'options', format: 'joker', topHokm: true });
  await b.waitFor((x) => x.state.options.format === 'joker');
  assert.deepStrictEqual(b.state.options, { format: 'joker', topHokm: true, target: 1250 });
  a.send({ t: 'options', target: 600 });
  await b.waitFor((x) => x.state.options.target === 600);
  b.send({ t: 'options', format: 'classic' });
  a.send({ t: 'options', target: 5 });
  await settle();
  assert.ok(b.errors.length === 1 && a.errors.length === 1);
  assert.strictEqual(a.state.options.format, 'joker');
  assert.strictEqual(a.state.options.target, 600);
  a.send({ t: 'start' });
  await a.waitFor((x) => x.state.mode === 'game');
  assert.strictEqual(a.state.phase, 'bid');
  assert.strictEqual(a.state.hand.length, 12);
  assert.strictEqual(a.state.widowSize, 6);
  assert.ok(!('widow' in a.state));
  // options cannot be changed once the game runs
  a.send({ t: 'options', format: 'classic' });
  await settle();
  assert.strictEqual(a.state.options.format, 'joker');
  a.ws.close(); b.ws.close();
  server.close();
});

test('Ghafoon rooms are unchanged: no options, quick play starts at once', async () => {
  const { server, port } = await listen();
  const a = await client(port);
  a.send({ t: 'join', create: true, solo: true, name: 'A' });
  await a.waitFor((x) => x.state && x.state.mode === 'game');
  assert.strictEqual(a.state.game, 'ghafoon');
  assert.ok(!('options' in a.state));
  a.ws.close();
  server.close();
});

test('a human who always passes plays a whole Shelem game against bots', async () => {
  const { server, port } = await listen();
  const a = await client(port, { play: true });
  a.send({ t: 'join', create: true, solo: true, name: 'A', game: 'shelem' });
  await a.waitFor((x) => x.state);
  a.send({ t: 'options', target: 300, format: 'ace' });
  await settle();
  a.send({ t: 'start' });
  await a.waitFor((x) => x.state.phase === 'gameOver', 90000);
  assert.deepStrictEqual(a.errors, []);
  assert.ok(a.state.winner === 0 || a.state.winner === 1);
  assert.ok(Math.max(...a.state.scores) >= 300 || Math.min(...a.state.scores) <= -150);
  assert.ok(a.state.roundResult.totals[0] + a.state.roundResult.totals[1] === 185);
  a.send({ t: 'lobby' });
  await a.waitFor((x) => x.state.mode === 'lobby');
  assert.strictEqual(a.state.options.target, 300, 'the options are kept for the next game');
  a.ws.close();
  server.close();
});
