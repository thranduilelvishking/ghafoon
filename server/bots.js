'use strict';
// Bot players. They see only what a human at their seat would see.

const { suitOf, rankOf, legalCards, trickWinner, partner, teamOf, SHEET } = require('./engine');

const ACE = 14;
const KING = 13;
const QUEEN = 12;
const JACK = 11;

const bySuit = (hand) => {
  const s = [[], [], [], []];
  for (const c of hand) s[suitOf(c)].push(c);
  for (const l of s) l.sort((a, b) => rankOf(b) - rankOf(a));
  return s;
};

// Rough expected number of tricks this hand takes by itself with `hokm` as trump.
function estimateTricks(hand, hokm) {
  const suits = bySuit(hand);
  const trumps = suits[hokm];
  const tlen = trumps.length;
  const has = (list, r) => list.some((c) => rankOf(c) === r);
  let est = 0;

  for (const c of trumps) {
    const r = rankOf(c);
    if (r === ACE) est += 1;
    else if (r === KING) est += tlen >= 2 ? 0.9 : 0.5;
    else if (r === QUEEN) est += tlen >= 3 ? 0.75 : 0.35;
    else if (r === JACK) est += tlen >= 4 ? 0.6 : 0.25;
    else if (r === 10) est += tlen >= 5 ? 0.45 : 0.15;
  }
  est += Math.max(0, tlen - 4) * 0.8;

  let ruffs = 0;
  for (let s = 0; s < 4; s++) {
    if (s === hokm) continue;
    const l = suits[s];
    const hasA = has(l, ACE);
    const hasK = has(l, KING);
    if (hasA) est += l.length <= 4 ? 0.95 : 0.8;
    if (hasK) est += l.length >= 2 ? (hasA ? 0.9 : 0.5) : 0.2;
    if (has(l, QUEEN)) est += hasA && hasK ? 0.8 : (hasA || hasK) && l.length >= 3 ? 0.3 : 0.1;
    if (l.length > 4) est += (l.length - 4) * 0.25;
    ruffs += l.length === 0 ? 1.2 : l.length === 1 ? 0.7 : l.length === 2 ? 0.3 : 0;
  }
  est += Math.min(ruffs, Math.max(0, tlen - 1) * 0.8);
  return est;
}

// How much a card is worth keeping when choosing the bag.
function keepValue(card, hand, hokm) {
  const r = rankOf(card);
  const s = suitOf(card);
  const len = hand.filter((c) => suitOf(c) === s).length;
  if (s === hokm) return 60 + r;
  if (r === ACE) return 90;
  if (r === KING) return 40 + (len >= 2 ? 10 : 0);
  if (r === QUEEN) return len >= 3 ? 30 : 12;
  return r + len; // low cards from short suits go first, which creates voids to ruff with
}

function chooseDiscards(hand16, hokm) {
  return hand16
    .slice()
    .sort((a, b) => keepValue(a, hand16, hokm) - keepValue(b, hand16, hokm))
    .slice(0, 4);
}

function bestHokm(hand) {
  let best = 0;
  let bestEst = -1;
  for (let s = 0; s < 4; s++) {
    const e = estimateTricks(hand, s);
    if (e > bestEst) {
      bestEst = e;
      best = s;
    }
  }
  return { hokm: best, est: bestEst };
}

// ---------------------------------------------------------------- reading

const BID_MARGIN = 0.0;

function chooseBid(hand, highest) {
  const { est } = bestHokm(hand);
  // +1 for the bag, ~2.7 expected from the partner, a bit for the extra yard cards.
  const total = est + 1 + 2.7 + 0.5 - BID_MARGIN;
  let value = Math.floor(total);
  if (value >= SHEET) value = 12; // bots never gamble on a sheet
  if (value < 7 || value <= highest) return 0;
  return value;
}

function chooseHakem(hand16) {
  let best = null;
  for (let s = 0; s < 4; s++) {
    const discards = chooseDiscards(hand16, s);
    const rest = hand16.filter((c) => !discards.includes(c));
    const est = estimateTricks(rest, s);
    if (!best || est > best.est) best = { hokm: s, discards, est };
  }
  return { hokm: best.hokm, discards: best.discards };
}

// ---------------------------------------------------------------- play

// ctx: { seat, hand, plays, hokm, hakem, reading, tricks, played:Set }
function choosePlay(ctx) {
  const { seat, hand, plays, hokm, played } = ctx;
  const legal = legalCards(hand, plays);
  if (legal.length === 1) return legal[0];

  const mine = new Set(hand);
  // cards not yet seen by me (still in other hands, or in the bag)
  const higherUnseen = (card) => {
    const s = suitOf(card);
    let n = 0;
    for (let r = rankOf(card) + 1; r <= ACE; r++) {
      const c = s * 13 + (r - 2);
      if (!mine.has(c) && !played.has(c)) n++;
    }
    return n;
  };
  const lowest = (cards) => cards.reduce((a, b) => (rankOf(a) <= rankOf(b) ? a : b));
  const highest = (cards) => cards.reduce((a, b) => (rankOf(a) >= rankOf(b) ? a : b));
  const myTeamHakem = teamOf(ctx.hakem) === teamOf(seat);
  const suitLen = (s) => hand.filter((c) => suitOf(c) === s).length;

  // ---- leading
  if (!plays.length) {
    const nonTrump = legal.filter((c) => suitOf(c) !== hokm);
    const trumps = legal.filter((c) => suitOf(c) === hokm);
    // a card nobody can beat
    const sure = legal.filter((c) => higherUnseen(c) === 0 && (suitOf(c) === hokm || !trumpsOutside(ctx, suitOf(c))));
    if (sure.length) return highest(sure);
    if (myTeamHakem && trumps.length && trumps.some((c) => higherUnseen(c) <= 1)) {
      return highest(trumps); // draw the opponents' trumps out
    }
    const aces = nonTrump.filter((c) => rankOf(c) === ACE);
    if (aces.length) return aces[0];
    if (nonTrump.length) {
      // lead low from the shortest suit
      const shortest = nonTrump.reduce((a, b) => (suitLen(suitOf(a)) <= suitLen(suitOf(b)) ? a : b));
      const sameSuit = nonTrump.filter((c) => suitOf(c) === suitOf(shortest));
      return lowest(sameSuit);
    }
    return lowest(trumps);
  }

  // ---- following
  const led = suitOf(plays[0].card);
  const winnerSeat = trickWinner(plays, hokm);
  const winnerCard = plays.find((p) => p.seat === winnerSeat).card;
  const partnerWinning = winnerSeat === partner(seat);
  const lastToPlay = plays.length === 3;
  const follows = legal.every((c) => suitOf(c) === led) && suitOf(legal[0]) === led;

  const beats = (c) => trickWinner([...plays, { seat, card: c }], hokm) === seat;

  if (follows) {
    if (partnerWinning && (lastToPlay || higherUnseen(winnerCard) === 0)) return lowest(legal);
    const winners = legal.filter(beats);
    if (winners.length) {
      if (lastToPlay) return lowest(winners);
      const safe = winners.filter((c) => higherUnseen(c) === 0);
      if (safe.length) return lowest(safe);
      if (partnerWinning) return lowest(legal);
      // opponents still to play: commit a strong card, or save the trick-takers
      const strong = winners.filter((c) => rankOf(c) >= QUEEN || higherUnseen(c) <= 1);
      if (strong.length) return lowest(strong);
    }
    return lowest(legal);
  }

  // void in the led suit: ruff, or throw away something useless
  const trumpsInHand = legal.filter((c) => suitOf(c) === hokm);
  const discardable = legal.filter((c) => suitOf(c) !== hokm);
  const pickDiscard = () => {
    if (!discardable.length) return lowest(legal);
    // give up the suit we hold the least of, lowest card first
    const worst = discardable.reduce((a, b) => {
      const la = suitLen(suitOf(a));
      const lb = suitLen(suitOf(b));
      if (la !== lb) return la < lb ? a : b;
      return rankOf(a) <= rankOf(b) ? a : b;
    });
    return lowest(discardable.filter((c) => suitOf(c) === suitOf(worst)));
  };
  if (partnerWinning && (lastToPlay || suitOf(winnerCard) === hokm)) return pickDiscard();
  if (trumpsInHand.length) {
    const winners = trumpsInHand.filter(beats);
    if (winners.length) return lowest(winners);
  }
  return pickDiscard();
}

// Could an opponent still ruff this suit? Only when trumps are unaccounted for.
function trumpsOutside(ctx, suit) {
  const { hand, played, hokm } = ctx;
  if (suit === hokm) return false;
  for (let r = 2; r <= ACE; r++) {
    const c = hokm * 13 + (r - 2);
    if (!hand.includes(c) && !played.has(c)) return true;
  }
  return false;
}

module.exports = { estimateTricks, chooseBid, chooseHakem, chooseDiscards, choosePlay, bestHokm };
