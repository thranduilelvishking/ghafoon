'use strict';
// Ghafoon rules engine. Pure game logic, no I/O, no timers.
//
// Cards are integers 0..51: suit = id / 13 | 0 (0=S 1=H 2=C 3=D), rank = id % 13 + 2 (2..14, Ace high).

const crypto = require('crypto');

const SUITS = ['S', 'H', 'C', 'D'];
const WIN_SCORE = 104;
const SHEET = 13;

const suitOf = (c) => (c / 13) | 0;
const rankOf = (c) => (c % 13) + 2;
const makeCard = (suit, rank) => suit * 13 + (rank - 2);

const left = (s) => (s + 1) % 4;
const right = (s) => (s + 3) % 4;
const partner = (s) => (s + 2) % 4;
const teamOf = (s) => s % 2;

// ---------------------------------------------------------------- shuffling

const randInt = (n) => crypto.randomInt(n);

function freshDeck() {
  return Array.from({ length: 52 }, (_, i) => i);
}

// Thorough shuffle. Only used before the very first deal of a game.
function fullShuffle(deck = freshDeck(), rand = randInt) {
  const d = deck.slice();
  for (let i = d.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

// Shuffle used between rounds. The pile coming in is the previous round's cards
// in the order they were collected: the bag, then each trick stacked on top of the
// last, then whatever was left in hands. We do NOT riffle or randomise it. We only
// cut the pile one or two times, at arbitrary positions (so a break may land
// in the middle of a trick). Whatever hands come out of the deal are whatever the
// stacks and breaks produce; nothing evaluates or steers them.
function stackedShuffle(pile, rand = randInt) {
  if (pile.length !== 52) throw new Error('pile must have 52 cards');
  let d = pile.slice();
  const cuts = 1 + rand(2); // 1 or 2 breaks
  for (let i = 0; i < cuts; i++) {
    const at = 8 + rand(37); // keep cuts away from the very ends of the pile
    d = d.slice(at).concat(d.slice(0, at));
  }
  return { deck: d, cuts };
}

// ---------------------------------------------------------------- dealing

// First round only: cards are dealt face up one at a time, starting at seat 0.
// The first player to receive an Ace is the Sardast.
function firstAceDraw(deck, startSeat = 0) {
  const reveals = [];
  for (let i = 0; i < deck.length; i++) {
    const seat = (startSeat + i) % 4;
    reveals.push({ seat, card: deck[i] });
    if (rankOf(deck[i]) === 14) return { seat, reveals };
  }
  throw new Error('no ace in deck');
}

// 12 cards to the Sardast then 1 to the yard, then the same for the left opponent,
// the Sardast's partner and the dealer.
function deal(deck, sardast) {
  const hands = [[], [], [], []];
  const yard = [];
  let p = 0;
  let seat = sardast;
  for (let n = 0; n < 4; n++) {
    hands[seat] = deck.slice(p, p + 12);
    p += 12;
    yard.push(deck[p++]);
    seat = left(seat);
  }
  return { hands, yard };
}

// ---------------------------------------------------------------- trick logic

function trickWinner(plays, hokm) {
  const ledSuit = suitOf(plays[0].card);
  let best = plays[0];
  for (const p of plays.slice(1)) {
    const ps = suitOf(p.card);
    const bs = suitOf(best.card);
    if (ps === hokm) {
      if (bs !== hokm || rankOf(p.card) > rankOf(best.card)) best = p;
    } else if (bs !== hokm && ps === ledSuit && rankOf(p.card) > rankOf(best.card)) {
      best = p;
    }
  }
  return best.seat;
}

function legalCards(hand, plays) {
  if (!plays.length) return hand.slice();
  const led = suitOf(plays[0].card);
  const follow = hand.filter((c) => suitOf(c) === led);
  return follow.length ? follow : hand.slice();
}

// ---------------------------------------------------------------- game

class GameError extends Error {}

class Game {
  constructor({ rand = randInt } = {}) {
    this.rand = rand;
    this.reset();
  }

  reset() {
    this.scores = [0, 0];
    this.round = 0;
    this.sardast = 0;
    this.pile = null;
    this.phase = 'idle'; // idle | draw | reading | hakem | play | trickEnd | roundEnd | gameOver
    this.winner = null;
    this.roundResult = null;
    this.draw = null;
    this.shuffleInfo = null;
    this.hands = [[], [], [], []];
  }

  get dealer() {
    return right(this.sardast);
  }

  // Starts the next round: decides the Sardast, shuffles and deals.
  startRound() {
    if (this.phase === 'gameOver') throw new GameError('game over');
    let deck;
    this.draw = null;
    if (this.round === 0) {
      const first = fullShuffle(freshDeck(), this.rand);
      this.draw = firstAceDraw(first);
      this.sardast = this.draw.seat;
      deck = fullShuffle(freshDeck(), this.rand);
      this.shuffleInfo = { kind: 'full' };
    } else {
      const s = stackedShuffle(this.pile, this.rand);
      deck = s.deck;
      this.shuffleInfo = { kind: 'stacked', cuts: s.cuts };
    }
    this.round++;
    const { hands, yard } = deal(deck, this.sardast);
    this.hands = hands;
    this.yard = yard;
    this.originalOrder = hands.map((h) => h.slice());
    this.bids = [null, null, null, null];
    this.highest = 0;
    this.highSeat = null;
    this.bidCount = 0;
    this.turn = this.sardast;
    this.hakem = null;
    this.reading = 0;
    this.forced = false;
    this.hokm = null;
    this.bag = [];
    this.tricks = [0, 0];
    this.trickLog = [];
    this.plays = [];
    this.leader = null;
    this.lastTrick = null;
    this.roundResult = null;
    this.pendingEnd = null;
    this.phase = this.draw ? 'draw' : 'reading';
  }

  // The draw reveal is over; bidding begins.
  finishDraw() {
    if (this.phase !== 'draw') throw new GameError('not drawing');
    this.phase = 'reading';
  }

  // value: 0 = pass, 7..12, 13 = sheet
  bid(seat, value) {
    if (this.phase !== 'reading') throw new GameError('not reading phase');
    if (seat !== this.turn) throw new GameError('not your turn');
    if (!Number.isInteger(value)) throw new GameError('bad reading');
    if (value < 7) value = 0;
    if (value > SHEET) throw new GameError('bad reading');
    if (value !== 0 && value <= this.highest) throw new GameError('reading must be higher than the current highest');
    this.bids[seat] = value;
    this.bidCount++;
    if (value) {
      this.highest = value;
      this.highSeat = seat;
    }
    if (value === SHEET || this.bidCount === 4) {
      if (this.highSeat === null) {
        // everyone passed: the Sardast is forced to 7
        this.highSeat = this.sardast;
        this.highest = 7;
        this.forced = true;
      } else {
        this.forced = false;
      }
      this.hakem = this.highSeat;
      this.reading = this.highest;
      this.hands[this.hakem] = this.hands[this.hakem].concat(this.yard);
      this.phase = 'hakem';
      this.turn = this.hakem;
    } else {
      this.turn = left(seat);
    }
  }

  // The Hakem discards 4 cards into the bag and names Hokm.
  hakemDone(seat, discards, hokm) {
    if (this.phase !== 'hakem') throw new GameError('not hakem phase');
    if (seat !== this.hakem) throw new GameError('you are not the hakem');
    if (!Number.isInteger(hokm) || hokm < 0 || hokm > 3) throw new GameError('bad hokm');
    if (!Array.isArray(discards) || discards.length !== 4 || new Set(discards).size !== 4) {
      throw new GameError('discard exactly 4 cards');
    }
    const hand = this.hands[seat];
    if (!discards.every((c) => hand.includes(c))) throw new GameError('card not in hand');
    this.hands[seat] = hand.filter((c) => !discards.includes(c));
    this.bag = discards.slice();
    this.hokm = hokm;
    this.tricks[teamOf(seat)] = 1; // the bag counts as a trick for the Hakem's team
    this.leader = this.reading === SHEET ? this.hakem : this.sardast;
    this.turn = this.leader;
    this.plays = [];
    this.phase = 'play';
  }

  legalFor(seat) {
    if (this.phase !== 'play' || seat !== this.turn) return [];
    return legalCards(this.hands[seat], this.plays);
  }

  play(seat, card) {
    if (this.phase !== 'play') throw new GameError('not play phase');
    if (seat !== this.turn) throw new GameError('not your turn');
    if (!this.hands[seat].includes(card)) throw new GameError('card not in hand');
    if (!legalCards(this.hands[seat], this.plays).includes(card)) throw new GameError('you must follow suit');
    this.hands[seat] = this.hands[seat].filter((c) => c !== card);
    this.plays.push({ seat, card });
    if (this.plays.length < 4) {
      this.turn = left(seat);
      return;
    }
    const winner = trickWinner(this.plays, this.hokm);
    const team = teamOf(winner);
    this.tricks[team]++;
    this.lastTrick = { plays: this.plays.slice(), winner };
    this.trickLog.push(this.lastTrick);
    this.turn = null;
    this.phase = 'trickEnd';
    this.trickWinner = winner;

    const hakemTeam = teamOf(this.hakem);
    const oppTeam = 1 - hakemTeam;
    if (this.tricks[hakemTeam] >= this.reading) this.pendingEnd = 'made';
    else if (this.tricks[oppTeam] >= 14 - this.reading) this.pendingEnd = 'busted';
    else this.pendingEnd = null;
  }

  // Called once the finished trick has been shown: next trick, or end of round.
  afterTrick() {
    if (this.phase !== 'trickEnd') throw new GameError('no finished trick');
    if (this.pendingEnd) {
      this.finishRound(this.pendingEnd);
      return;
    }
    this.leader = this.trickWinner;
    this.turn = this.leader;
    this.plays = [];
    this.phase = 'play';
  }

  finishRound(outcome) {
    const hakemTeam = teamOf(this.hakem);
    const oppTeam = 1 - hakemTeam;
    const sheet = this.reading === SHEET;
    let scoringTeam;
    let points;
    if (outcome === 'made') {
      scoringTeam = hakemTeam;
      points = sheet ? 26 : this.reading;
    } else {
      scoringTeam = oppTeam;
      points = sheet ? 26 : 2 * this.reading;
    }
    this.scores[scoringTeam] += points;
    this.roundResult = {
      outcome,
      hakem: this.hakem,
      hakemTeam,
      reading: this.reading,
      forced: !!this.forced,
      scoringTeam,
      points,
      tricks: this.tricks.slice(),
    };

    // Collect the cards for the next shuffle: bag, then the tricks in the order they
    // were played (each trick's 4 cards together), then any cards still in hands.
    const pile = this.bag.slice();
    for (const t of this.trickLog) for (const p of t.plays) pile.push(p.card);
    for (let i = 0, s = this.sardast; i < 4; i++, s = left(s)) pile.push(...this.hands[s]);
    this.pile = pile;

    if (this.scores[scoringTeam] >= WIN_SCORE) {
      this.winner = scoringTeam;
      this.phase = 'gameOver';
    } else {
      this.phase = 'roundEnd';
    }
  }

  // Moves on from a finished round: decides the next Sardast.
  nextRound() {
    if (this.phase !== 'roundEnd') throw new GameError('round not finished');
    const myTeam = teamOf(this.sardast);
    if (this.scores[myTeam] < this.scores[1 - myTeam]) this.sardast = left(this.sardast);
    this.startRound();
  }
}

module.exports = {
  SUITS, WIN_SCORE, SHEET,
  suitOf, rankOf, makeCard, left, right, partner, teamOf,
  freshDeck, fullShuffle, stackedShuffle, firstAceDraw, deal,
  trickWinner, legalCards, Game, GameError,
};
