'use strict';
// Bots for Shelem. Bidding is a Monte-Carlo guess (deal the unseen cards at random, take the widow, discard, play it out
// with the same card-play policy); the card play is a plain greedy policy that watches the cards already gone.

const { suitOf, rankOf, teamOf, left } = require('./engine');
const S = require('./shelem');

const { BLACK, COLOR, isJoker, cardPoints, hokmRank, isHokmCard, trickWinner, ShelemGame, FORMATS } = S;

const rnd = Math.random;
const shuffle = (a) => {
  const d = a.slice();
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
};

// How good a suit looks as Hokm for this hand (Jokers always count as Hokm cards).
function suitScore(hand, suit) {
  let sc = 0;
  for (const c of hand) {
    if (isJoker(c)) sc += c === COLOR ? 9 : 8;
    else if (suitOf(c) === suit) sc += 3 + ({ 14: 6, 13: 4, 12: 3, 11: 2, 10: 1 }[rankOf(c)] || 0);
  }
  return sc;
}
function bestHokm(hand) {
  let best = 0;
  for (let s = 1; s < 4; s++) if (suitScore(hand, s) > suitScore(hand, best)) best = s;
  return best;
}

// Which n cards of the hand (widow already added) to put face down: low cards of short side suits, never Hokm cards or
// Jokers if it can be avoided. Point cards in the discard still count for the Hakem's team, so that is not a loss.
function chooseDiscards(hand, n, hokm) {
  const len = [0, 0, 0, 0];
  for (const c of hand) if (!isJoker(c)) len[suitOf(c)]++;
  const keep = (c) => {
    if (isJoker(c)) return 1000;
    const r = rankOf(c);
    let k = r + 3 * len[suitOf(c)];
    if (r === 14) k += 40;
    if (r === 13 && len[suitOf(c)] >= 2) k += 8;
    if (suitOf(c) === hokm) k += 100;
    return k;
  };
  return hand.slice().sort((a, b) => keep(a) - keep(b)).slice(0, n);
}

// ------------------------------------------------------------------ card play

function playedSet(g) {
  const set = new Set();
  for (const t of g.trickLog) for (const p of t.plays) set.add(p.card);
  for (const p of g.plays) set.add(p.card);
  return set;
}

const strength = (c, hokm) => (isHokmCard(c, hokm) ? 100 + hokmRank(c) : rankOf(c));

// Is c the best card still out in its suit (or in Hokm), counting the cards in my own hand as mine?
function isMaster(c, hand, played, hokm, cfg) {
  const all = [];
  for (let x = 0; x < 52; x++) all.push(x);
  if (cfg.jokers) all.push(BLACK, COLOR);
  const out = all.filter((x) => !played.has(x) && !hand.includes(x));
  if (isHokmCard(c, hokm)) return !out.some((x) => isHokmCard(x, hokm) && hokmRank(x) > hokmRank(c));
  return !out.some((x) => !isJoker(x) && suitOf(x) === suitOf(c) && rankOf(x) > rankOf(c));
}

// Returns { card, hokm } (hokm only matters for the first card of the round).
function choosePlay(g, seat) {
  const hand = g.hands[seat];
  const legal = g.legalFor(seat);
  const cfg = g.cfg;
  const played = playedSet(g);

  if (g.firstTrick && g.plays.length === 0) {
    const hk = bestHokm(hand);
    if (cfg.jokers && legal.includes(COLOR)) return { card: COLOR, hokm: hk };
    const inHokm = legal.filter((c) => !isJoker(c) && suitOf(c) === hk).sort((a, b) => rankOf(b) - rankOf(a));
    if (inHokm.length) return { card: inHokm[0] };
    const any = legal.slice().sort((a, b) => rankOf(b) - rankOf(a))[0];
    return { card: any, hokm: isJoker(any) ? hk : undefined };
  }

  const hokm = g.hokm;
  const me = teamOf(seat);
  const points = (c) => cardPoints(c, cfg);

  if (g.plays.length === 0) {
    // leading
    const hokmCards = legal.filter((c) => isHokmCard(c, hokm));
    const hokmOut = (() => {
      for (let x = 0; x < 52; x++) if (suitOf(x) === hokm && !played.has(x) && !hand.includes(x)) return true;
      if (cfg.jokers) for (const j of [BLACK, COLOR]) if (!played.has(j) && !hand.includes(j)) return true;
      return false;
    })();
    const topHokm = hokmCards.filter((c) => isMaster(c, hand, played, hokm, cfg)).sort((a, b) => strength(b, hokm) - strength(a, hokm))[0];
    if (topHokm !== undefined && hokmOut) return { card: topHokm };
    const masters = legal.filter((c) => !isHokmCard(c, hokm) && isMaster(c, hand, played, hokm, cfg));
    if (masters.length) return { card: masters.sort((a, b) => points(b) - points(a) || rankOf(b) - rankOf(a))[0] };
    if (topHokm !== undefined) return { card: topHokm };
    // otherwise give up a low card from the shortest side suit
    const len = [0, 0, 0, 0];
    for (const c of hand) if (!isJoker(c) && suitOf(c) !== hokm) len[suitOf(c)]++;
    const side = legal.filter((c) => !isHokmCard(c, hokm));
    const pool = side.length ? side : legal;
    pool.sort((a, b) => (isHokmCard(a, hokm) ? 99 : len[suitOf(a)]) - (isHokmCard(b, hokm) ? 99 : len[suitOf(b)])
      || points(a) - points(b) || strength(a, hokm) - strength(b, hokm));
    return { card: pool[0] };
  }

  // following
  const current = trickWinner(g.plays, hokm);
  const winCard = g.plays.find((p) => p.seat === current).card;
  const partnerWins = teamOf(current) === me;
  const last = g.plays.length === 3;
  const wins = (c) => trickWinner(g.plays.concat([{ seat, card: c }]), hokm) === seat;
  const winners = legal.filter(wins).sort((a, b) => strength(a, hokm) - strength(b, hokm));
  const dump = () => legal.slice().sort((a, b) => points(b) - points(a) || strength(a, hokm) - strength(b, hokm));
  const lowest = () => legal.slice().sort((a, b) => (isHokmCard(a, hokm) ? 1 : 0) - (isHokmCard(b, hokm) ? 1 : 0)
    || points(a) - points(b) || strength(a, hokm) - strength(b, hokm));
  if (partnerWins) {
    if (last) return { card: dump()[0] };
    if (isMaster(winCard, hand, played, hokm, cfg)) {
      const nonTop = dump().filter((c) => !winners.includes(c) || points(c) > 0);
      return { card: (nonTop.length ? nonTop : dump())[0] };
    }
    if (winners.length) return { card: winners[0] };
    return { card: lowest()[0] };
  }
  if (winners.length) return { card: winners[0] };
  return { card: lowest()[0] };
}

// ------------------------------------------------------------------ bidding

function simulate(opts, seat, hand, bidLevel) {
  const cfg = FORMATS[opts.format];
  const all = [];
  for (let x = 0; x < 52; x++) all.push(x);
  if (cfg.jokers) all.push(BLACK, COLOR);
  const unseen = shuffle(all.filter((c) => !hand.includes(c)));
  const g = new ShelemGame(opts, { dealer: (seat + 3) % 4 });
  g.startRound();
  g.hands = [0, 1, 2, 3].map(() => []);
  g.hands[seat] = hand.slice();
  let k = 0;
  for (let i = 1; i < 4; i++) g.hands[(seat + i) % 4] = unseen.slice(k, k += 12);
  g.widow = unseen.slice(k);
  g.hakem = seat;
  g.highest = bidLevel;
  g.hands[seat] = g.hands[seat].concat(g.widow);
  const hk = bestHokm(g.hands[seat]);
  g.phase = 'widow';
  g.hakemDiscard(seat, chooseDiscards(g.hands[seat], cfg.widow, hk));
  let guard = 0;
  while (g.phase === 'play' || g.phase === 'trickEnd') {
    if (g.phase === 'trickEnd') { g.afterTrick(); continue; }
    const s = g.turn;
    const { card, hokm } = choosePlay(g, s);
    g.play(s, card, g.firstTrick && g.plays.length === 0 ? (hokm === undefined ? hk : hokm) : undefined);
    if (++guard > 80) break;
  }
  return g.roundResult;
}

const memo = new WeakMap(); // game -> Map(seat key -> the highest bid worth making)

function bestBid(g, seat) {
  let m = memo.get(g);
  if (!m) { m = new Map(); memo.set(g, m); }
  const key = `${g.round}:${g.redeals}:${seat}`;
  if (m.has(key)) return m.get(key);
  const { minBid, maxBid } = g.cfg;
  const results = [];
  for (let i = 0; i < 36; i++) results.push(simulate(g.opts, seat, g.hands[seat], minBid));
  const totals = results.map((r) => r.totals[teamOf(seat)]);
  const shelems = results.map((r) => r.outcome === 'shelem');
  let best = 0;
  for (let b = minBid; b <= maxBid; b += 5) {
    const made = totals.filter((t, i) => t >= b || shelems[i]).length / totals.length;
    if (made >= 0.62) best = b;
  }
  m.set(key, best);
  return best;
}

function chooseBid(g, seat) {
  const best = bestBid(g, seat);
  const need = Math.max(g.cfg.minBid, g.highest + 5);
  if (best < need) return 0;
  if (g.highSeat !== null && teamOf(g.highSeat) === teamOf(seat) && best < g.highest + 25) return 0; // leave my partner's bid alone
  if (g.highest === 0) return best;
  return Math.min(best, g.highest + 5 * (1 + Math.floor(rnd() * 3)));
}

function chooseWidowDiscards(g, seat) {
  const hand = g.hands[seat];
  return chooseDiscards(hand, g.cfg.widow, bestHokm(hand));
}

module.exports = { bestHokm, chooseDiscards, choosePlay, chooseBid, chooseWidowDiscards, simulate };
