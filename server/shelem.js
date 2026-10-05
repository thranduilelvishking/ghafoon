'use strict';
// Shelem rules engine (see SHELEM_RULES.md). Pure game logic, no I/O, no timers.
//
// Cards are integers: 0..51 as in Ghafoon (suit = id / 13 | 0 with 0=S 1=H 2=C 3=D, rank = id % 13 + 2, Ace high),
// plus 52 = Black Joker and 53 = Color Joker in the Joker format. A Joker belongs to the Hokm suit, whatever it is,
// and ranks above the Ace of Hokm (Black 15, Color 16).

const crypto = require('crypto');
const { suitOf, rankOf, makeCard, left, teamOf, freshDeck, fullShuffle, stackedShuffle, MIX_LINKS, GameError } = require('./engine');

const BLACK = 52;
const COLOR = 53;
const isJoker = (c) => c >= 52;

const FORMATS = {
  classic: { jokers: false, widow: 4, ace: 10, minBid: 100, maxBid: 165, total: 165, win: 800 },
  ace: { jokers: false, widow: 4, ace: 15, minBid: 120, maxBid: 185, total: 185, win: 1000 },
  joker: { jokers: true, widow: 6, ace: 15, minBid: 120, maxBid: 230, total: 230, win: 1250 },
};

const TARGET_MIN = 200;
const TARGET_MAX = 5000;
const randInt = (n) => crypto.randomInt(n);

function defaultOptions(format = 'classic') {
  return { format, topHokm: false, target: FORMATS[format].win };
}

// Checks what the host sent from the lobby and returns clean options (throws GameError when it makes no sense).
function cleanOptions(raw, old = defaultOptions()) {
  const o = { ...old };
  if (raw.format !== undefined) {
    if (!FORMATS[raw.format]) throw new GameError('unknown format');
    if (raw.format !== o.format) o.target = FORMATS[raw.format].win; // each format starts from its own target
    o.format = raw.format;
  }
  if (raw.topHokm !== undefined) o.topHokm = !!raw.topHokm;
  if (raw.target !== undefined) {
    const n = Number(raw.target);
    if (!Number.isInteger(n) || n < TARGET_MIN || n > TARGET_MAX) throw new GameError('bad target score');
    o.target = n;
  }
  return o;
}

function cardPoints(c, cfg) {
  if (c === COLOR) return 25;
  if (c === BLACK) return 20;
  const r = rankOf(c);
  if (r === 14) return cfg.ace;
  if (r === 10) return 10;
  if (r === 5) return 5;
  return 0;
}

// Hokm strength of a card (only meaningful for Hokm cards and Jokers): 2..14, Black Joker 15, Color Joker 16.
const hokmRank = (c) => (c === COLOR ? 16 : c === BLACK ? 15 : rankOf(c));
const isHokmCard = (c, hokm) => isJoker(c) || suitOf(c) === hokm;

// plays: [{ seat, card }] in order; the first card decides the led suit (a Joker means Hokm was led).
function trickWinner(plays, hokm) {
  const led = plays[0].card;
  const ledKey = isHokmCard(led, hokm) ? 'H' : suitOf(led);
  let best = plays[0];
  const beats = (a, b) => { // does a beat b?
    const ah = isHokmCard(a.card, hokm);
    const bh = isHokmCard(b.card, hokm);
    if (ah && bh) return hokmRank(a.card) > hokmRank(b.card);
    if (ah) return true;
    if (bh) return false;
    return suitOf(a.card) === ledKey && (suitOf(b.card) !== ledKey || rankOf(a.card) > rankOf(b.card));
  };
  for (const p of plays.slice(1)) if (beats(p, best)) best = p;
  return best.seat;
}

class ShelemGame {
  constructor(options = defaultOptions(), { rand = randInt, dealer } = {}) {
    this.opts = { ...options };
    this.cfg = FORMATS[options.format];
    this.rand = rand;
    this.scores = [0, 0];
    this.round = 0;
    this.dealer = dealer === undefined ? rand(4) : dealer;
    this.phase = 'idle'; // bid | widow | play | trickEnd | roundEnd | gameOver
    this.winner = null;
    this.redeals = 0;
  }

  get target() { return this.opts.target; }
  get loseAt() { return -(this.opts.target / 2); }
  get topCard() { return this.cfg.jokers ? COLOR : null; } // Classic/Ace-15: the Ace of Hokm, known once Hokm is

  startRound() {
    if (this.phase === 'gameOver') throw new GameError('game over');
    // Same mechanics as Ghafoon: the first deal (and a redeal after everybody passed) is a thorough shuffle; every later
    // round stacks the previous round's cards (discard, then the tricks as they fell) and only cuts them once or twice.
    let deck;
    if (this.pile) {
      const s = stackedShuffle(this.pile, this.rand, MIX_LINKS);
      deck = s.deck;
      this.shuffleInfo = { kind: 'stacked', cuts: s.cuts };
    } else {
      deck = fullShuffle(freshDeck().concat(this.cfg.jokers ? [BLACK, COLOR] : []), this.rand);
      this.shuffleInfo = { kind: 'full' };
    }
    this.pile = null;
    // 12 cards to the first bidder, then one to the widow, and the same for the next players; the rest of the widow comes last
    this.hands = [[], [], [], []];
    this.widow = [];
    let p = 0;
    let seat = left(this.dealer);
    for (let n = 0; n < 4; n++) {
      this.hands[seat] = deck.slice(p, p + 12);
      p += 12;
      const give = n < 3 ? 1 : this.cfg.widow - 3;
      this.widow.push(...deck.slice(p, p + give));
      p += give;
      seat = left(seat);
    }
    this.round++;
    this.bids = [null, null, null, null]; // null = not spoken yet, 0 = passed
    this.passed = [false, false, false, false];
    this.spoken = 0;
    this.highest = 0;
    this.highSeat = null;
    this.turn = left(this.dealer);
    this.hakem = null;
    this.hokm = null;
    this.discard = [];
    this.plays = [];
    this.trickLog = [];
    this.lastTrick = null;
    this.trickWinner = null;
    this.leader = null;
    this.tricks = [0, 0]; // the Hakem's discard counts as a trick for their team
    this.points = [0, 0]; // card points taken
    this.roundResult = null;
    this.phase = 'bid';
  }

  // value: 0 = pass, otherwise a multiple of 5 from the opening bid up to the maximum
  bid(seat, value) {
    if (this.phase !== 'bid') throw new GameError('not bidding phase');
    if (seat !== this.turn) throw new GameError('not your turn');
    if (!Number.isInteger(value) || value < 0) throw new GameError('bad bid');
    const { minBid, maxBid } = this.cfg;
    if (value !== 0) {
      if (value % 5 !== 0 || value < minBid || value > maxBid) throw new GameError('bad bid');
      if (value <= this.highest) throw new GameError('bid must be higher than the current highest');
    }
    this.bids[seat] = value;
    this.spoken++;
    if (value === 0) this.passed[seat] = true;
    else {
      this.highest = value;
      this.highSeat = seat;
      if (value === maxBid) for (let i = 0; i < 4; i++) if (i !== seat) this.passed[i] = true; // nobody can beat it
    }
    const out = this.passed.filter(Boolean).length;
    if (this.highSeat === null && this.spoken >= 3) {
      // the first three to speak all passed: cancelled, same dealer deals again, whatever the 4th would have said
      this.redeals++;
      this.pile = null; // a redeal is a thorough shuffle
      this.startRound();
      this.round--; // a redeal is not a new round
      return;
    }
    if (out === 3) {
      this.hakem = this.passed.findIndex((p) => !p);
      this.hands[this.hakem] = this.hands[this.hakem].concat(this.widow);
      this.phase = 'widow';
      this.turn = this.hakem;
      return;
    }
    let s = left(seat);
    while (this.passed[s]) s = left(s);
    this.turn = s;
  }

  // The Hakem has picked up the widow and puts the same number of cards face down. They count as one trick for the
  // Hakem's team, point cards included.
  hakemDiscard(seat, cards) {
    if (this.phase !== 'widow') throw new GameError('not the discard phase');
    if (seat !== this.hakem) throw new GameError('you are not the hakem');
    const n = this.cfg.widow;
    if (!Array.isArray(cards) || cards.length !== n || new Set(cards).size !== n) throw new GameError(`pick exactly ${n} cards`);
    if (!cards.every((c) => this.hands[seat].includes(c))) throw new GameError('you do not hold that card');
    this.hands[seat] = this.hands[seat].filter((c) => !cards.includes(c));
    this.discard = cards.slice();
    const team = teamOf(seat);
    this.tricks[team] += 1;
    this.points[team] += cards.reduce((a, c) => a + cardPoints(c, this.cfg), 0);
    this.phase = 'play';
    this.leader = this.hakem;
    this.turn = this.hakem;
    this.plays = [];
  }

  get firstTrick() { return this.trickLog.length === 0; }

  // The top Hokm card that must fall in the first trick (when the option is on), or null if none applies.
  mustFall(seat) {
    if (!this.opts.topHokm || !this.firstTrick) return null;
    const hand = this.hands[seat];
    if (this.cfg.jokers) return hand.includes(COLOR) ? COLOR : null;
    if (this.hokm === null) return null;
    const ace = makeCard(this.hokm, 14);
    return hand.includes(ace) ? ace : null;
  }

  legalFor(seat) {
    if (this.phase !== 'play' || seat !== this.turn) return [];
    const hand = this.hands[seat];
    if (this.plays.length === 0) {
      if (this.firstTrick && this.opts.topHokm) {
        if (this.cfg.jokers) return hand.includes(COLOR) ? [COLOR] : hand.slice();
        // the Hakem leads the Ace of any suit he holds, because that suit is then Hokm and its Ace must fall
        return hand.filter((c) => rankOf(c) === 14 || !hand.includes(makeCard(suitOf(c), 14)));
      }
      return hand.slice();
    }
    const first = this.plays[0].card;
    const hokmLed = isHokmCard(first, this.hokm);
    const follows = hand.filter((c) => (hokmLed ? isHokmCard(c, this.hokm) : !isJoker(c) && suitOf(c) === suitOf(first)));
    const legal = follows.length ? follows : hand.slice();
    const top = this.mustFall(seat);
    return top !== null && legal.includes(top) ? [top] : legal;
  }

  // hokm is only needed when the Hakem opens the first trick with a Joker: he names the suit then.
  play(seat, card, hokm) {
    if (this.phase !== 'play') throw new GameError('not the play phase');
    if (seat !== this.turn) throw new GameError('not your turn');
    if (!this.hands[seat].includes(card)) throw new GameError('you do not hold that card');
    if (this.firstTrick && this.plays.length === 0) {
      let h = hokm;
      if (isJoker(card)) {
        if (!Number.isInteger(h) || h < 0 || h > 3) throw new GameError('name the Hokm suit for the Joker');
      } else h = suitOf(card);
      this.hokm = h;
    }
    if (!this.legalFor(seat).includes(card)) {
      if (this.firstTrick && this.plays.length === 0) this.hokm = null;
      throw new GameError(this.opts.topHokm && this.firstTrick ? 'the top Hokm card must be played first' : 'you must follow suit');
    }
    this.hands[seat] = this.hands[seat].filter((c) => c !== card);
    this.plays.push({ seat, card });
    if (this.plays.length < 4) {
      this.turn = left(seat);
      return;
    }
    const winner = trickWinner(this.plays, this.hokm);
    this.trickWinner = winner;
    this.lastTrick = { plays: this.plays.slice(), winner };
    this.phase = 'trickEnd';
  }

  afterTrick() {
    if (this.phase !== 'trickEnd') throw new GameError('no trick to finish');
    const team = teamOf(this.trickWinner);
    this.tricks[team]++;
    this.points[team] += this.plays.reduce((a, p) => a + cardPoints(p.card, this.cfg), 0);
    this.trickLog.push(this.lastTrick);
    this.leader = this.trickWinner;
    this.turn = this.leader;
    this.plays = [];
    if (this.hands[0].length === 0) this.finishRound();
    else this.phase = 'play';
  }

  // Each team's total is its card points plus 5 per trick (the discard is one trick for the Hakem's team).
  teamTotals() {
    return [0, 1].map((t) => this.points[t] + 5 * this.tricks[t]);
  }

  finishRound() {
    const ht = teamOf(this.hakem);
    const dt = 1 - ht;
    const totals = this.teamTotals();
    const bid = this.highest;
    const { total } = this.cfg;
    let outcome;
    const delta = [0, 0];
    delta[dt] = totals[dt]; // the defenders always keep what they took
    if (this.tricks[ht] === 13) {
      outcome = 'shelem';
      delta[ht] = 2 * total;
    } else if (totals[ht] >= bid) {
      outcome = 'made';
      delta[ht] = totals[ht];
    } else if (totals[ht] * 2 < total) {
      outcome = 'yasa';
      delta[ht] = -2 * bid;
    } else {
      outcome = 'failed';
      delta[ht] = -bid;
    }
    this.scores[0] += delta[0];
    this.scores[1] += delta[1];
    // the cards for the next shuffle: the discard first, then every trick in the order it was played
    this.pile = this.discard.slice();
    for (const t of this.trickLog) for (const pl of t.plays) this.pile.push(pl.card);
    this.roundResult = {
      outcome, hakem: this.hakem, hakemTeam: ht, bid, totals, delta, tricks: this.tricks.slice(), points: this.points.slice(),
      shelemBonus: outcome === 'shelem' ? 2 * total : 0,
    };
    // a team wins by reaching the target, or when the other falls to minus half of it
    const wins = [0, 1].filter((t) => this.scores[t] >= this.target || this.scores[1 - t] <= this.loseAt);
    if (wins.length) {
      this.winner = wins.length === 2
        ? (this.scores[0] === this.scores[1] ? ht : this.scores[0] > this.scores[1] ? 0 : 1) // both passed: the higher total, a tie goes to the Hakem's team
        : wins[0];
      this.phase = 'gameOver';
    } else this.phase = 'roundEnd';
  }

  nextRound() {
    if (this.phase !== 'roundEnd') throw new GameError('round not finished');
    this.dealer = left(this.dealer);
    this.startRound();
  }
}

module.exports = {
  FORMATS, BLACK, COLOR, isJoker, TARGET_MIN, TARGET_MAX, defaultOptions, cleanOptions, cardPoints,
  hokmRank, isHokmCard, trickWinner, ShelemGame,
};
