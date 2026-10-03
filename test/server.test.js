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
  const c = { ws, state: null, joined: null, errors: [], notices: [], noticeCodes: [], chat: [], chatLog: null, played: new Set(), auto, states: 0 };
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
    if (m.t === 'notice') { c.notices.push(m.msg); c.noticeCodes.push([m.code, m.name]); }
    if (m.t === 'chat') c.chat.push(m.msg);
    if (m.t === 'chatLog') c.chatLog = m.msgs;
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

test('the host is whoever created the room, even after moving seats; the role passes on only when they leave', async () => {
  const { server, port } = await listen();
  const a = await client(port, { auto: false });
  a.send({ t: 'join', create: true, name: 'Creator' });
  await a.waitFor((x) => x.joined);
  // the creator moves to seat 2, so the next arrival gets seat 0 (a lower seat number than the creator)
  a.send({ t: 'sit', seat: 2 });
  await a.waitFor((x) => x.state && x.state.you === 2);
  const b = await client(port, { auto: false });
  b.send({ t: 'join', room: a.joined.room, name: 'Friend' });
  await b.waitFor((x) => x.joined);
  assert.strictEqual(b.joined.seat, 0);
  await a.waitFor((x) => x.state.seats[0].name === 'Friend');
  assert.strictEqual(a.state.host, 2, 'the creator stays host');
  assert.strictEqual(b.state.host, 2);
  b.send({ t: 'start' });
  await new Promise((r) => setTimeout(r, 60));
  assert.ok(b.errors.length > 0, 'the friend cannot start');
  assert.strictEqual(a.state.mode, 'lobby');
  // the creator leaves: the friend becomes host and can start
  a.send({ t: 'leave' });
  await b.waitFor((x) => x.state.host === 0 && x.state.seats[2].kind === 'empty');
  b.send({ t: 'start' });
  await b.waitFor((x) => x.state.mode === 'game');
  b.ws.close(); a.ws.close();
  server.close();
});


async function lobbyOf(port, names) {
  const first = await client(port, { auto: false });
  first.send({ t: 'join', create: true, name: names[0] });
  await first.waitFor((x) => x.joined);
  const all = [first];
  for (const n of names.slice(1)) {
    const c = await client(port, { auto: false });
    c.send({ t: 'join', room: first.joined.room, name: n });
    await c.waitFor((x) => x.joined);
    all.push(c);
  }
  await first.waitFor((x) => x.state.seats.filter((s) => s.kind === 'human').length === names.length);
  return all;
}
const settle = () => new Promise((r) => setTimeout(r, 80));

test('seats: new players fill the first empty slots in order, and anyone can take an empty slot', async () => {
  const { server, port } = await listen();
  const [a, b, c] = await lobbyOf(port, ['Ann', 'Bo', 'Cy']);
  assert.deepStrictEqual([a, b, c].map((x) => x.joined.seat), [0, 1, 2]);
  b.send({ t: 'sit', seat: 3 });
  await a.waitFor((x) => x.state.seats[3].name === 'Bo' && x.state.seats[1].kind === 'empty');
  b.send({ t: 'sit', seat: 2 }); // taken: ignored
  await settle();
  assert.strictEqual(a.state.seats[3].name, 'Bo');
  [a, b, c].forEach((x) => x.ws.close());
  server.close();
});

test('swap: the other person must accept, and then the two really trade places (token and host stay)', async () => {
  const { server, port } = await listen();
  const [a, b] = await lobbyOf(port, ['Ann', 'Bo']);
  a.send({ t: 'swap', seat: 1 });
  await b.waitFor((x) => x.state.swapIn && x.state.swapIn.includes(0));
  assert.strictEqual(a.state.swapOut, 1);
  assert.strictEqual(a.state.seats[0].name, 'Ann'); // nothing has moved yet
  assert.ok(b.notices.some((n) => /Ann would like to swap/.test(n)));
  assert.deepStrictEqual(b.noticeCodes[0], ['swapAsk', 'Ann'], 'notices carry a code and a name so each player can read them in their own language');
  b.send({ t: 'swapReply', seat: 0, accept: true });
  await a.waitFor((x) => x.state.seats[0].name === 'Bo' && x.state.seats[1].name === 'Ann');
  assert.strictEqual(a.state.you, 1);
  assert.strictEqual(b.state.you, 0);
  assert.strictEqual(a.state.host, 1, 'the creator is still the host after swapping');
  assert.strictEqual(a.state.swapOut, -1);
  assert.deepStrictEqual(b.state.swapIn, []);
  assert.ok(a.notices.some((n) => /swapped seats/.test(n)));
  a.send({ t: 'start' });
  await a.waitFor((x) => x.state.mode === 'game');
  [a, b].forEach((x) => x.ws.close());
  server.close();
});

test('swap: a decline moves nobody, a cancel withdraws the request', async () => {
  const { server, port } = await listen();
  const [a, b] = await lobbyOf(port, ['Ann', 'Bo']);
  a.send({ t: 'swap', seat: 1 });
  await b.waitFor((x) => x.state.swapIn.length === 1);
  b.send({ t: 'swapReply', seat: 0, accept: false });
  await a.waitFor((x) => x.state.swapOut === -1);
  assert.strictEqual(a.state.seats[0].name, 'Ann');
  assert.ok(a.notices.some((n) => /stay where they are/.test(n)));
  a.send({ t: 'swap', seat: 1 });
  await b.waitFor((x) => x.state.swapIn.length === 1);
  a.send({ t: 'swapCancel' });
  await b.waitFor((x) => x.state.swapIn.length === 0);
  b.send({ t: 'swapReply', seat: 0, accept: true }); // nothing to accept any more
  await settle();
  assert.ok(b.errors.some((e) => /no longer open/.test(e)));
  assert.strictEqual(a.state.seats[0].name, 'Ann');
  [a, b].forEach((x) => x.ws.close());
  server.close();
});

test('swap: moving away or leaving cancels your request; you cannot swap with an empty seat or yourself', async () => {
  const { server, port } = await listen();
  const [a, b, c] = await lobbyOf(port, ['Ann', 'Bo', 'Cy']);
  a.send({ t: 'swap', seat: 3 }); // empty seat
  a.send({ t: 'swap', seat: 0 }); // yourself
  await settle();
  assert.strictEqual(a.errors.length, 2);
  a.send({ t: 'swap', seat: 1 });
  await b.waitFor((x) => x.state.swapIn.length === 1);
  a.send({ t: 'sit', seat: 3 }); // moves away: the request is gone
  await b.waitFor((x) => x.state.swapIn.length === 0);
  c.send({ t: 'swap', seat: 1 });
  await b.waitFor((x) => x.state.swapIn.length === 1);
  c.send({ t: 'leave' });
  await b.waitFor((x) => x.state.swapIn.length === 0);
  [a, b].forEach((x) => x.ws.close());
  server.close();
});

test('swap: answering one request clears the others that involve the same people', async () => {
  const { server, port } = await listen();
  const [a, b, c] = await lobbyOf(port, ['Ann', 'Bo', 'Cy']);
  a.send({ t: 'swap', seat: 1 });
  c.send({ t: 'swap', seat: 1 });
  await b.waitFor((x) => x.state.swapIn.length === 2);
  b.send({ t: 'swapReply', seat: 0, accept: true }); // Bo takes Ann's seat 0, Ann goes to seat 1
  await b.waitFor((x) => x.state.you === 0);
  await settle();
  assert.deepStrictEqual(a.state.seats.slice(0, 3).map((s) => s.name), ['Bo', 'Ann', 'Cy']);
  assert.deepStrictEqual(a.state.swapIn, []);
  assert.strictEqual(c.state.swapOut, -1, "Cy's request to the person who moved is dropped");
  [a, b, c].forEach((x) => x.ws.close());
  server.close();
});


test('chat: messages reach everybody in the room, cleaned up and capped; late joiners get the history', async () => {
  const { server, port } = await listen();
  const [a, b] = await lobbyOf(port, ['Ann', 'Bo']);
  a.send({ t: 'chat', text: '  hello\u0007   there \n  friend  ' });
  await b.waitFor((x) => x.chat.length === 1);
  assert.strictEqual(b.chat[0].text, 'hello there friend');
  assert.strictEqual(b.chat[0].name, 'Ann');
  assert.strictEqual(b.chat[0].seat, 0);
  await a.waitFor((x) => x.chat.length === 1); // the sender sees their own message too
  a.send({ t: 'chat', text: '   ' });
  a.send({ t: 'chat' });
  a.send({ t: 'chat', text: 'x'.repeat(500) });
  await b.waitFor((x) => x.chat.length === 2);
  assert.strictEqual(b.chat[1].text.length, 200);
  await settle();
  assert.strictEqual(b.chat.length, 2, 'empty messages are ignored');
  // a third person joins later and receives the history
  const c = await client(port, { auto: false });
  c.send({ t: 'join', room: a.joined.room, name: 'Cy' });
  await c.waitFor((x) => x.chatLog);
  assert.deepStrictEqual(c.chatLog.map((m) => m.text.slice(0, 11)), ['hello there', 'xxxxxxxxxxx']);
  // chat markup is just text: the server never interprets it
  b.send({ t: 'chat', text: '<img src=x onerror=alert(1)>' });
  await a.waitFor((x) => x.chat.length === 3);
  assert.strictEqual(a.chat[2].text, '<img src=x onerror=alert(1)>');
  [a, b, c].forEach((x) => x.ws.close());
  server.close();
});

test('chat: sending too many messages too fast is refused, and strangers outside the room cannot chat', async () => {
  const { server, port } = await listen();
  const [a, b] = await lobbyOf(port, ['Ann', 'Bo']);
  for (let i = 0; i < 8; i++) a.send({ t: 'chat', text: 'spam ' + i });
  await settle(); await settle();
  assert.strictEqual(b.chat.length, 5, 'only the first five get through');
  assert.ok(a.errors.some((e) => /too fast/.test(e)));
  b.send({ t: 'chat', text: 'still fine' }); // another person has their own allowance
  await a.waitFor((x) => x.chat.length === 6);
  const stranger = await client(port, { auto: false }); // never joined a room
  stranger.send({ t: 'chat', text: 'hi from outside' });
  await settle();
  assert.strictEqual(a.chat.length, 6);
  [a, b, stranger].forEach((x) => x.ws.close());
  server.close();
});

test('chat keeps working during a game', async () => {
  const { server, port } = await listen();
  const [a, b] = await lobbyOf(port, ['Ann', 'Bo']);
  a.send({ t: 'start' });
  await b.waitFor((x) => x.state.mode === 'game');
  b.send({ t: 'chat', text: 'good luck' });
  await a.waitFor((x) => x.chat.some((m) => m.text === 'good luck'));
  assert.strictEqual(a.chat.find((m) => m.text === 'good luck').seat, 1);
  [a, b].forEach((x) => x.ws.close());
  server.close();
});
