'use strict';
// HTTP + WebSocket server. Rooms hold up to 4 humans; empty or abandoned seats are played by bots.

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { Game, GameError, left } = require('./engine');
const bots = require('./bots');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const PORT = +process.env.PORT || 3000;

const BOT_NAMES = ['Arash', 'Bahar', 'Cyrus', 'Dara'];
const TIMING = {
  draw: 5500,
  trickEnd: 1500,
  roundEndMax: 25000,
  botBid: 900,
  botHakem: 2200,
  botHokm: 1600,
  botPlay: 750,
  botVote: 1300,
  voteMax: 25000,
  roomIdleDelete: 5 * 60 * 1000,
  takeoverAfter: 60 * 1000,
  ...(process.env.GHAFOON_FAST ? { draw: 50, trickEnd: 20, roundEndMax: 100, botBid: 5, botHakem: 5, botHokm: 5, botPlay: 5, botVote: 5, voteMax: 100 } : {}),
};

const rooms = new Map();

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
function newCode() {
  for (;;) {
    let c = '';
    for (let i = 0; i < 4; i++) c += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
    if (!rooms.has(c)) return c;
  }
}

const cleanName = (n) => String(n || '').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 14);

class Room {
  constructor(code) {
    this.code = code;
    this.seats = [0, 1, 2, 3].map(() => ({ human: null })); // human: { token, name, ws, awaySince }
    this.game = null;
    this.mode = 'lobby'; // lobby | game
    this.timer = null;
    this.ready = new Set();
    this.deleteTimer = null;
  }

  // ---- seats
  humanSeats() {
    return this.seats.map((s, i) => (s.human ? i : -1)).filter((i) => i >= 0);
  }
  isConnected(i) {
    const h = this.seats[i].human;
    return !!(h && h.ws && h.ws.readyState === 1);
  }
  isBot(i) {
    return !this.isConnected(i);
  }
  anyConnected() {
    return [0, 1, 2, 3].some((i) => this.isConnected(i));
  }
  hostSeat() {
    for (let i = 0; i < 4; i++) if (this.isConnected(i)) return i;
    return -1;
  }
  seatName(i) {
    const h = this.seats[i].human;
    return h ? h.name : BOT_NAMES[i];
  }
  findToken(token) {
    if (!token) return -1;
    return this.seats.findIndex((s) => s.human && s.human.token === token);
  }

  addHuman(name, ws, wantSeat) {
    let seat = -1;
    if (this.mode === 'lobby') {
      if (wantSeat >= 0 && !this.seats[wantSeat].human) seat = wantSeat;
      else seat = this.seats.findIndex((s) => !s.human);
    } else {
      // join a running game by replacing a bot (or a long-absent player)
      seat = this.seats.findIndex((s) => !s.human);
      if (seat < 0) {
        const now = Date.now();
        seat = this.seats.findIndex((s, i) => !this.isConnected(i) && s.human.awaySince && now - s.human.awaySince > TIMING.takeoverAfter);
      }
    }
    if (seat < 0) return -1;
    const token = crypto.randomBytes(12).toString('hex');
    this.seats[seat].human = { token, name: this.uniqueName(name || `Player ${seat + 1}`, -1), ws, awaySince: null };
    ws.ctx = { room: this, token };
    return seat;
  }

  // Names are unique within a room (case-insensitive): a second "Sara" becomes "Sara 2".
  uniqueName(name, exceptSeat) {
    const taken = new Set(this.seats.map((s, i) => (s.human && i !== exceptSeat ? s.human.name.toLowerCase() : null)));
    BOT_NAMES.forEach((n) => taken.add(n.toLowerCase()));
    let out = name;
    for (let n = 2; taken.has(out.toLowerCase()); n++) out = `${name.slice(0, 11)} ${n}`;
    return out;
  }

  attach(seat, ws) {
    const h = this.seats[seat].human;
    if (h.ws && h.ws !== ws) {
      h.ws.ctx = null;
      try { h.ws.close(); } catch (e) { /* already closed */ }
    }
    h.ws = ws;
    h.awaySince = null;
    ws.ctx = { room: this, token: h.token };
  }

  detach(ws) {
    const seat = this.findToken(ws.ctx && ws.ctx.token);
    if (seat < 0) return;
    const h = this.seats[seat].human;
    if (h.ws !== ws) return;
    h.ws = null;
    if (this.mode === 'lobby') this.seats[seat].human = null;
    else h.awaySince = Date.now();
    this.ready.delete(seat);
    this.afterMembershipChange();
  }

  remove(seat) {
    this.seats[seat].human = null;
    this.ready.delete(seat);
  }

  afterMembershipChange() {
    if (!this.anyConnected()) {
      clearTimeout(this.timer);
      this.timer = null;
      if (this.mode === 'lobby') return this.destroy();
      if (!this.deleteTimer) {
        this.deleteTimer = setTimeout(() => this.destroy(), TIMING.roomIdleDelete);
      }
      return this.broadcast();
    }
    clearTimeout(this.deleteTimer);
    this.deleteTimer = null;
    this.changed();
  }

  destroy() {
    clearTimeout(this.timer);
    clearTimeout(this.deleteTimer);
    rooms.delete(this.code);
  }

  // ---- state
  changed() {
    this.broadcast();
    this.tick();
  }

  broadcast() {
    for (let i = 0; i < 4; i++) {
      if (this.isConnected(i)) send(this.seats[i].human.ws, this.view(i));
    }
  }

  view(me) {
    const seats = this.seats.map((s, i) => ({
      name: this.seatName(i),
      kind: !s.human ? (this.mode === 'lobby' ? 'empty' : 'bot') : this.isConnected(i) ? 'human' : 'away',
    }));
    const v = { t: 'state', room: this.code, you: me, host: this.hostSeat(), mode: this.mode, seats };
    const g = this.game;
    if (this.mode !== 'game' || !g) return v;
    const shown = ['play', 'trickEnd', 'roundEnd', 'gameOver', 'raiseVote'].includes(g.phase);
    Object.assign(v, {
      phase: g.phase,
      round: g.round,
      scores: g.scores,
      sardast: g.sardast,
      dealer: g.dealer,
      hakem: g.hakem,
      reading: g.reading,
      forced: g.forced,
      bids: g.bids,
      highest: g.highest,
      turn: g.turn,
      hokm: shown ? g.hokm : null,
      contract: shown ? g.contract : null,
      trickMode: g.mode,
      hand: g.hands[me],
      counts: g.hands.map((h) => h.length),
      legal: g.legalFor(me),
      plays: g.plays,
      leader: g.leader,
      tricks: g.tricks,
      lastTrick: g.lastTrick,
      trickWinner: g.phase === 'trickEnd' ? g.trickWinner : null,
      roundResult: g.roundResult,
      draw: g.phase === 'draw' ? g.draw : null,
      shuffleInfo: g.shuffleInfo,
      ready: [...this.ready],
      winner: g.winner,
      canRaise: g.canRaise(me),
      raiseOptions: g.raiseOptions(me),
      raised: g.raised,
      originalReading: g.originalReading,
      raise: g.raise ? { from: g.raise.from, to: g.raise.to, votes: g.raise.votes } : null,
      canVote: g.phase === 'raiseVote' && g.opponentsOfHakem().includes(me) && g.raise.votes[me] === undefined,
      lastRaise: g.lastRaise,
    });
    return v;
  }

  // ---- game flow
  startGame() {
    this.game = new Game();
    this.mode = 'game';
    this.ready.clear();
    this.game.startRound();
    this.changed();
  }

  backToLobby() {
    clearTimeout(this.timer);
    this.timer = null;
    this.game = null;
    this.mode = 'lobby';
    this.ready.clear();
    // keep only connected humans in the lobby
    for (let i = 0; i < 4; i++) if (!this.isConnected(i)) this.seats[i].human = null;
    if (!this.anyConnected()) return this.destroy();
    this.changed();
  }

  after(ms, fn) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      try {
        fn();
      } catch (e) {
        console.error('room', this.code, e);
      }
    }, ms);
  }

  tick() {
    clearTimeout(this.timer);
    this.timer = null;
    const g = this.game;
    if (this.mode !== 'game' || !g || !this.anyConnected()) return;
    const phase = g.phase;
    const jitter = () => (process.env.GHAFOON_FAST ? 0 : Math.random() * 400);
    switch (phase) {
      case 'draw':
        return this.after(TIMING.draw, () => { if (g.phase === 'draw') { g.finishDraw(); this.changed(); } });
      case 'reading':
        if (this.isBot(g.turn)) this.after(TIMING.botBid + jitter(), () => this.botStep(phase));
        return;
      case 'hakem':
        if (this.isBot(g.hakem)) this.after(TIMING.botHakem + jitter(), () => this.botStep(phase));
        return;
      case 'hokm':
        if (this.isBot(g.hakem)) this.after(TIMING.botHokm + jitter(), () => this.botStep(phase));
        return;
      case 'play':
        if (this.isBot(g.turn)) this.after(TIMING.botPlay + jitter(), () => this.botStep(phase));
        return;
      case 'raiseVote': {
        const pending = g.opponentsOfHakem().filter((x) => g.raise.votes[x] === undefined);
        if (pending.some((x) => this.isBot(x))) return this.after(TIMING.botVote + jitter(), () => this.botVoteStep(false));
        // only people left to answer: if they sit on it for too long, answer for them
        if (pending.length) return this.after(TIMING.voteMax, () => this.botVoteStep(true));
        return;
      }
      case 'trickEnd':
        return this.after(TIMING.trickEnd, () => { if (g.phase === 'trickEnd') { g.afterTrick(); this.changed(); } });
      case 'roundEnd':
        if (this.allReady()) return this.nextRound();
        return this.after(TIMING.roundEndMax, () => this.nextRound());
      default:
    }
  }

  allReady() {
    return [0, 1, 2, 3].every((i) => !this.isConnected(i) || this.ready.has(i));
  }

  nextRound() {
    const g = this.game;
    if (!g || g.phase !== 'roundEnd') return;
    this.ready.clear();
    g.nextRound();
    this.changed();
  }

  // What a bot at `seat` knows when it thinks about a raise (nothing about anyone else's cards).
  raiseCtx(seat) {
    const g = this.game;
    const complete = g.phase === 'trickEnd' || (g.phase === 'raiseVote' && g.raise.resume === 'trickEnd');
    const played = new Set();
    for (const t of g.trickLog) for (const p of t.plays) played.add(p.card);
    return {
      seat, hand: g.hands[seat], plays: complete ? [] : g.plays, turn: complete ? g.trickWinner : g.turn,
      hokm: g.hokm, mode: g.mode, hakem: g.hakem, tricks: g.tricks, played, trickLog: g.trickLog,
      counts: g.hands.map((h) => h.length), bag: seat === g.hakem ? g.bag : [],
      reading: g.reading, maxRaise: g.maxRaise(),
    };
  }

  botVoteStep(force) {
    const g = this.game;
    if (!g || g.phase !== 'raiseVote') return;
    const seat = g.opponentsOfHakem().find((x) => g.raise.votes[x] === undefined && (force || this.isBot(x)));
    if (seat === undefined) return;
    const yes = bots.chooseVote({ ...this.raiseCtx(seat), raiseTo: g.raise.to });
    g.voteRaise(seat, yes);
    this.changed();
  }

  botStep(expectedPhase) {
    const g = this.game;
    if (!g || g.phase !== expectedPhase) return;
    if (g.phase === 'reading') {
      const s = g.turn;
      if (!this.isBot(s)) return;
      g.bid(s, bots.chooseBid(g.hands[s], g.highest, { seat: s, sardast: g.sardast }));
    } else if (g.phase === 'hakem') {
      const s = g.hakem;
      if (!this.isBot(s)) return;
      const { hokm, discards } = bots.chooseHakem(g.hands[s]);
      this.plannedHokm = { round: g.round, hokm }; // the suit the bag was chosen for
      g.hakemDiscard(s, discards);
    } else if (g.phase === 'hokm') {
      const s = g.hakem;
      if (!this.isBot(s)) return;
      const plan = this.plannedHokm && this.plannedHokm.round === g.round ? this.plannedHokm.hokm : bots.bestHokm(g.hands[s]).hokm;
      g.chooseHokm(s, plan);
    } else if (g.phase === 'play') {
      const s = g.turn;
      if (!this.isBot(s)) return;
      if (s === g.hakem && g.canRaise(s)) {
        const to = bots.chooseRaise(this.raiseCtx(s));
        if (to) {
          g.declareRaise(s, to);
          return this.changed();
        }
      }
      const played = new Set();
      for (const t of g.trickLog) for (const p of t.plays) played.add(p.card);
      for (const p of g.plays) played.add(p.card);
      const card = bots.choosePlay({
        seat: s, hand: g.hands[s], plays: g.plays, hokm: g.hokm, mode: g.mode, hakem: g.hakem,
        reading: g.reading, tricks: g.tricks, played, trickLog: g.trickLog,
      });
      g.play(s, card);
    }
    this.changed();
  }

  // ---- messages from humans
  handle(ws, msg) {
    const seat = this.findToken(ws.ctx.token);
    if (seat < 0) return;
    const g = this.game;
    switch (msg.t) {
      case 'rename': {
        const name = cleanName(msg.name);
        if (!name) throw new GameError('Enter a name');
        this.seats[seat].human.name = this.uniqueName(name, seat);
        return this.changed();
      }
      case 'sit': {
        if (this.mode !== 'lobby') return;
        const to = msg.seat;
        if (!Number.isInteger(to) || to < 0 || to > 3 || this.seats[to].human) return;
        this.seats[to].human = this.seats[seat].human;
        this.seats[seat].human = null;
        return this.changed();
      }
      case 'start':
        if (this.mode !== 'lobby') return;
        if (seat !== this.hostSeat()) throw new GameError('only the host can start the game');
        return this.startGame();
      case 'bid':
        if (!g) return;
        g.bid(seat, msg.value);
        return this.changed();
      case 'discard':
        if (!g) return;
        g.hakemDiscard(seat, msg.discards);
        return this.changed();
      case 'hokm':
        if (!g) return;
        g.chooseHokm(seat, msg.hokm);
        return this.changed();
      case 'raise':
        if (!g) return;
        g.declareRaise(seat, msg.to);
        return this.changed();
      case 'vote':
        if (!g) return;
        g.voteRaise(seat, !!msg.yes);
        return this.changed();
      case 'contract':
        if (!g) return;
        g.chooseContract(seat, msg.contract, msg.hokm);
        return this.changed();
      case 'play':
        if (!g) return;
        g.play(seat, msg.card);
        return this.changed();
      case 'ready':
        if (!g || g.phase !== 'roundEnd') return;
        this.ready.add(seat);
        return this.changed();
      case 'lobby':
        if (g && g.phase === 'gameOver') return this.backToLobby();
        return;
      case 'leave':
        this.leave(ws, seat);
        return;
      default:
    }
  }

  leave(ws, seat) {
    ws.ctx = null;
    this.remove(seat);
    send(ws, { t: 'left' });
    this.afterMembershipChange();
  }
}

function send(ws, obj) {
  if (ws.readyState === 1) ws.send(JSON.stringify(obj));
}

function handleJoin(ws, msg) {
  if (ws.ctx) return send(ws, { t: 'error', msg: 'already in a room' });
  const name = cleanName(msg.name);
  let room;
  let seat = -1;
  if (msg.create) {
    room = new Room(newCode());
    rooms.set(room.code, room);
  } else {
    room = rooms.get(String(msg.room || '').toUpperCase().trim());
    if (!room) return send(ws, { t: 'error', msg: 'Room not found', fatal: true });
    seat = room.findToken(msg.token);
  }
  if (seat >= 0) {
    room.attach(seat, ws);
  } else {
    seat = room.addHuman(name, ws, -1);
    if (seat < 0) {
      if (msg.create) rooms.delete(room.code);
      return send(ws, { t: 'error', msg: 'Room is full', fatal: true });
    }
  }
  send(ws, { t: 'joined', room: room.code, token: room.seats[seat].human.token, seat });
  clearTimeout(room.deleteTimer);
  room.deleteTimer = null;
  if (msg.create && msg.solo) return room.startGame();
  room.changed();
}

function serveStatic(req, res) {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    return res.end('ok');
  }
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403);
    return res.end('forbidden');
  }
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      return res.end('not found');
    }
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(data);
  });
}

function createServer() {
  const server = http.createServer(serveStatic);
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });
  wss.on('connection', (ws) => {
    ws.ctx = null;
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('message', (data) => {
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch (e) {
        return;
      }
      if (!msg || typeof msg !== 'object') return;
      try {
        if (msg.t === 'join') handleJoin(ws, msg);
        else if (ws.ctx) ws.ctx.room.handle(ws, msg);
      } catch (e) {
        if (e instanceof GameError) send(ws, { t: 'error', msg: e.message });
        else console.error(e);
      }
    });
    ws.on('close', () => {
      if (ws.ctx) ws.ctx.room.detach(ws);
    });
  });
  const ping = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) { ws.terminate(); continue; }
      ws.isAlive = false;
      ws.ping();
    }
  }, 20000);
  wss.on('close', () => clearInterval(ping));
  server.on('close', () => clearInterval(ping));
  return server;
}

module.exports = { createServer, rooms, left };

if (require.main === module) {
  createServer().listen(PORT, () => console.log(`Ghafoon listening on http://localhost:${PORT}`));
}
