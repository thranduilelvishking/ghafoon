'use strict';
// HTTP + WebSocket server. Rooms hold up to 4 humans; empty or abandoned seats are played by bots.

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { Game, GameError, left } = require('./engine');
const bots = require('./bots');
const shelem = require('./shelem');
const shelemBots = require('./shelemBots');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const PORT = +process.env.PORT || 3000;

const BOT_NAMES = ['Arash', 'Bahar', 'Cyrus', 'Dara'];
const TIMING = {
  draw: 3000,
  trickEnd: 900,
  roundEndMax: 25000,
  botBid: 500,
  botHakem: 1200,
  botHokm: 900,
  botPlay: 450,
  botVote: 800,
  voteMax: 25000,
  roomIdleDelete: 5 * 60 * 1000,
  takeoverAfter: 60 * 1000,
  ...(process.env.GHAFOON_FAST ? { draw: 50, trickEnd: 20, roundEndMax: 100, botBid: 5, botHakem: 5, botHokm: 5, botPlay: 5, botVote: 5, voteMax: 100 } : {}),
};

const CHAT_MAX = 200; // characters per message
const CHAT_BURST = 5; // at most this many messages per CHAT_WINDOW ms from one person
const CHAT_WINDOW = 10000;

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
    this.kind = 'ghafoon'; // which game this room plays: ghafoon | shelem (chosen when the room is created)
    this.options = null; // Shelem only: { format, topHokm, target }, set by the host in the lobby
    this.mode = 'lobby'; // lobby | game
    this.timer = null;
    this.ready = new Set();
    this.deleteTimer = null;
    this.hostToken = null;
    this.swaps = []; // pending seat-swap requests: { from: token, to: token, at }
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
  // The host is whoever created the room (tracked by their token, so moving seats does not change it).
  // If they are gone, the role passes to the first person still connected and stays with them.
  hostSeat() {
    let i = [0, 1, 2, 3].find((k) => this.isConnected(k) && this.seats[k].human.token === this.hostToken);
    if (i === undefined) {
      i = [0, 1, 2, 3].find((k) => this.isConnected(k));
      if (i === undefined) return -1;
      this.hostToken = this.seats[i].human.token;
    }
    return i;
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

  // ---- chat: people only (bots stay quiet). Plain text, trimmed and capped, with a small rate limit.
  chatSend(seat, raw) {
    const h = this.seats[seat].human;
    const text = String(raw == null ? '' : raw).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX);
    if (!text) return;
    const now = Date.now();
    h.chatTimes = (h.chatTimes || []).filter((t) => now - t < CHAT_WINDOW);
    if (h.chatTimes.length >= CHAT_BURST) throw new GameError('You are sending messages too fast');
    h.chatTimes.push(now);
    const msg = { name: h.name, seat, text, at: now }; // not stored: late joiners see nothing
    for (let i = 0; i < 4; i++) if (this.isConnected(i)) send(this.seats[i].human.ws, { t: 'chat', msg });
  }


  // ---- seat swaps (lobby only): ask the person sitting there, nothing moves unless they accept
  dropSwaps(token) {
    this.swaps = this.swaps.filter((r) => r.from !== token && r.to !== token);
  }

  // Notices carry a code and a name so each player can read them in their own language; `msg` is the English text.
  notifyToken(token, code, name) {
    const text = {
      swapAsk: `${name} would like to swap seats with you`,
      swapDone: `${name} swapped seats with you`,
      swapNo: `${name} would rather stay where they are`,
    }[code];
    const i = this.findToken(token);
    if (i >= 0 && this.isConnected(i)) send(this.seats[i].human.ws, { t: 'notice', code, name, msg: text });
  }

  swapRequest(seat, target) {
    if (this.mode !== 'lobby') throw new GameError('seats can only be changed in the lobby');
    if (!Number.isInteger(target) || target < 0 || target > 3 || target === seat) throw new GameError('pick another seat');
    const other = this.seats[target].human;
    if (!other) throw new GameError('that seat is empty: just sit there');
    const me = this.seats[seat].human;
    this.swaps = this.swaps.filter((r) => r.from !== me.token); // one open request at a time
    this.swaps.push({ from: me.token, to: other.token, at: Date.now() });
    this.notifyToken(other.token, 'swapAsk', me.name);
  }

  swapCancel(seat) {
    const me = this.seats[seat].human;
    this.swaps = this.swaps.filter((r) => r.from !== me.token);
  }

  swapReply(seat, fromSeat, accept) {
    if (this.mode !== 'lobby') throw new GameError('seats can only be changed in the lobby');
    const me = this.seats[seat].human;
    const asker = Number.isInteger(fromSeat) && fromSeat >= 0 && fromSeat < 4 ? this.seats[fromSeat].human : null;
    const req = asker && this.swaps.find((r) => r.to === me.token && r.from === asker.token && Date.now() - r.at < 90000);
    if (!req) throw new GameError('that request is no longer open');
    this.swaps = this.swaps.filter((r) => r !== req);
    if (!accept) return this.notifyToken(asker.token, 'swapNo', me.name);
    this.seats[seat].human = asker;
    this.seats[fromSeat].human = me;
    this.dropSwaps(me.token);
    this.dropSwaps(asker.token);
    this.notifyToken(asker.token, 'swapDone', me.name);
  }

  detach(ws) {
    const seat = this.findToken(ws.ctx && ws.ctx.token);
    if (seat < 0) return;
    const h = this.seats[seat].human;
    if (h.ws !== ws) return;
    h.ws = null;
    if (this.mode === 'lobby') { this.dropSwaps(h.token); this.seats[seat].human = null; }
    else h.awaySince = Date.now();
    this.ready.delete(seat);
    this.afterMembershipChange();
  }

  remove(seat) {
    if (this.seats[seat].human) this.dropSwaps(this.seats[seat].human.token);
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
    const v = { t: 'state', room: this.code, you: me, host: this.hostSeat(), mode: this.mode, seats, game: this.kind };
    if (this.kind === 'shelem') v.options = this.options;
    const g = this.game;
    if (this.mode === 'lobby') {
      const now = Date.now();
      this.swaps = this.swaps.filter((r) => now - r.at < 90000);
      const myToken = this.seats[me].human && this.seats[me].human.token;
      v.swapIn = this.swaps.filter((r) => r.to === myToken).map((r) => this.findToken(r.from)).filter((i) => i >= 0);
      const out = this.swaps.find((r) => r.from === myToken);
      v.swapOut = out ? this.findToken(out.to) : -1;
    }
    if (this.mode !== 'game' || !g) return v;
    if (this.kind === 'shelem') return this.shelemView(v, g, me);
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

  shelemView(v, g, me) {
    return Object.assign(v, {
      phase: g.phase,
      round: g.round,
      scores: g.scores,
      dealer: g.dealer,
      turn: g.turn,
      hakem: g.hakem,
      bids: g.bids,
      passed: g.passed,
      highest: g.highest,
      highSeat: g.highSeat,
      redeals: g.redeals,
      hokm: g.hokm,
      hand: g.hands[me],
      counts: g.hands.map((h) => h.length),
      legal: g.legalFor(me),
      plays: g.plays,
      leader: g.leader,
      tricks: g.tricks,
      firstTrick: g.firstTrick,
      lastTrick: g.lastTrick,
      trickWinner: g.phase === 'trickEnd' ? g.trickWinner : null,
      roundResult: g.roundResult,
      ready: [...this.ready],
      winner: g.winner,
      target: g.target,
      widowSize: g.cfg.widow,
    });
  }

  // ---- game flow
  startGame() {
    this.game = this.kind === 'shelem' ? new shelem.ShelemGame(this.options) : new Game();
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
    if (this.kind === 'shelem') return this.tickShelem(g, jitter);
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

  tickShelem(g, jitter) {
    switch (g.phase) {
      case 'bid':
        if (this.isBot(g.turn)) this.after(TIMING.botBid + jitter(), () => this.shelemBotStep('bid'));
        return;
      case 'widow':
        if (this.isBot(g.hakem)) this.after(TIMING.botHakem + jitter(), () => this.shelemBotStep('widow'));
        return;
      case 'play':
        if (this.isBot(g.turn)) this.after(TIMING.botPlay + jitter(), () => this.shelemBotStep('play'));
        return;
      case 'trickEnd':
        return this.after(TIMING.trickEnd, () => { if (g.phase === 'trickEnd') { g.afterTrick(); this.changed(); } });
      case 'roundEnd':
        if (this.allReady()) return this.nextRound();
        return this.after(TIMING.roundEndMax, () => this.nextRound());
      default:
    }
  }

  shelemBotStep(expected) {
    const g = this.game;
    if (!g || g.phase !== expected) return;
    if (g.phase === 'bid') {
      const s = g.turn;
      if (!this.isBot(s)) return;
      g.bid(s, shelemBots.chooseBid(g, s));
    } else if (g.phase === 'widow') {
      const s = g.hakem;
      if (!this.isBot(s)) return;
      g.hakemDiscard(s, shelemBots.chooseWidowDiscards(g, s));
    } else if (g.phase === 'play') {
      const s = g.turn;
      if (!this.isBot(s)) return;
      const { card, hokm } = shelemBots.choosePlay(g, s);
      g.play(s, card, hokm);
    }
    this.changed();
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
        this.dropSwaps(this.seats[seat].human.token);
        this.seats[to].human = this.seats[seat].human;
        this.seats[seat].human = null;
        return this.changed();
      }
      case 'chat':
        this.chatSend(seat, msg.text);
        return;
      case 'swap':
        this.swapRequest(seat, msg.seat);
        return this.changed();
      case 'swapCancel':
        this.swapCancel(seat);
        return this.changed();
      case 'swapReply':
        this.swapReply(seat, msg.seat, !!msg.accept);
        return this.changed();
      case 'start':
        if (this.mode !== 'lobby') return;
        if (seat !== this.hostSeat()) throw new GameError('only the host can start the game');
        return this.startGame();
      case 'options': {
        if (this.mode !== 'lobby' || this.kind !== 'shelem') return;
        if (seat !== this.hostSeat()) throw new GameError('only the host can change the options');
        this.options = shelem.cleanOptions(msg, this.options);
        return this.changed();
      }
      case 'bid':
        if (!g) return;
        g.bid(seat, msg.value);
        return this.changed();
      case 'discard':
        if (!g) return;
        g.hakemDiscard(seat, msg.discards);
        return this.changed();
      case 'hokm':
        if (!g || this.kind === 'shelem') return;
        g.chooseHokm(seat, msg.hokm);
        return this.changed();
      case 'raise':
        if (!g || this.kind === 'shelem') return;
        g.declareRaise(seat, msg.to);
        return this.changed();
      case 'vote':
        if (!g || this.kind === 'shelem') return;
        g.voteRaise(seat, !!msg.yes);
        return this.changed();
      case 'contract':
        if (!g || this.kind === 'shelem') return;
        g.chooseContract(seat, msg.contract, msg.hokm);
        return this.changed();
      case 'play':
        if (!g) return;
        if (this.kind === 'shelem') g.play(seat, msg.card, msg.hokm);
        else g.play(seat, msg.card);
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
    if (msg.game === 'shelem') { room.kind = 'shelem'; room.options = shelem.defaultOptions(); }
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
  if (msg.create) room.hostToken = room.seats[seat].human.token;
  send(ws, { t: 'joined', room: room.code, token: room.seats[seat].human.token, seat });
  clearTimeout(room.deleteTimer);
  room.deleteTimer = null;
  if (msg.create && msg.solo && room.kind === 'ghafoon') return room.startGame(); // Shelem always opens in the lobby, for its options
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
