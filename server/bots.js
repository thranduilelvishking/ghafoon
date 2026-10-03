'use strict';
// Bot players. They see only what a human at their seat would see.

const { suitOf, rankOf, legalCards, trickWinner, cardStrength, partner, teamOf, SHEET } = require('./engine');

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

// The old rule of thumb: own expected tricks plus fixed allowances for the bag, partner and yard.
// Kept as a fallback (and for comparison in tests).
function chooseBidHeuristic(hand, highest) {
  const { est } = bestHokm(hand);
  const total = est + 1 + 2.7 + 0.5;
  let value = Math.floor(total);
  if (value >= SHEET) value = 12; // bots never gamble on a sheet
  if (value < 7 || value <= highest) return 0;
  return value;
}

// How a person actually reads a hand: "I can't guarantee 8, but the four yard cards, the bag and my partner
// will probably get me there, so I'll risk 10." The bot deals the unseen cards out at random many times
// (a random partner, random opponents, a random 4-card yard), takes the yard, bags its worst four cards and names
// its best suit exactly as it would for real, plays the round out, and bids the highest reading it made in
// at least `risk` of those deals. Nothing here peeks at anyone's real cards.
// Why 0.7: a bust gives the opponents double the reading while making it scores the reading once, so a bid has to
// come off about two times in three to pay. In bot-vs-bot games (80 each): 0.4 won 25% against the old formula,
// 0.5 won 33%, 0.65 won 69%, 0.7 won 71% (and 80% against 0.6); 0.8 vs 0.7 was a coin flip.
const BID_RISK = 0.7; // the reading it makes about 70% of the time; 0.5 is bolder and loses games, see below
const BID_SAMPLES = 70;

function simulateHakemTricks(hands, hakem, hokm, leader) {
  const played = new Set();
  const trickLog = [];
  const counts = [0, 0];
  counts[teamOf(hakem)] = 1; // the bag
  let lead = leader;
  for (let t = 0; t < 12; t++) {
    const plays = [];
    let seat = lead;
    for (let k = 0; k < 4; k++) {
      const hand = hands[seat];
      const card = choosePlay({ seat, hand, plays, hokm, mode: 'normal', hakem, reading: 0, tricks: counts, played, trickLog });
      hands[seat] = hand.filter((c) => c !== card);
      plays.push({ seat, card });
      seat = (seat + 1) % 4;
    }
    const winner = trickWinner(plays, hokm);
    counts[teamOf(winner)]++;
    plays.forEach((p) => played.add(p.card));
    trickLog.push({ plays, winner });
    lead = winner;
  }
  return counts[teamOf(hakem)];
}

function chooseBid(hand, highest, ctx) {
  if (!ctx || ctx.seat == null || ctx.sardast == null) return chooseBidHeuristic(hand, highest);
  const { seat, sardast } = ctx;
  const risk = ctx.risk != null ? ctx.risk : BID_RISK;
  const samples = ctx.samples || BID_SAMPLES;
  const mine = new Set(hand);
  const unseen = [];
  for (let c = 0; c < 52; c++) if (!mine.has(c)) unseen.push(c);
  const made = new Array(14).fill(0); // made[r] = deals in which the team took at least r tricks
  for (let n = 0; n < samples; n++) {
    for (let i = unseen.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [unseen[i], unseen[j]] = [unseen[j], unseen[i]];
    }
    const yard = unseen.slice(0, 4);
    const hands = [null, null, null, null];
    hands[seat] = hand.concat(yard);
    for (let k = 1; k <= 3; k++) hands[(seat + k) % 4] = unseen.slice(4 + (k - 1) * 12, 4 + k * 12);
    const { hokm, discards } = chooseHakem(hands[seat]);
    hands[seat] = hands[seat].filter((c) => !discards.includes(c));
    const tricks = simulateHakemTricks(hands, seat, hokm, sardast);
    for (let r = 7; r <= tricks && r <= 12; r++) made[r]++;
  }
  let value = 0;
  for (let r = 7; r <= 12; r++) if (made[r] / samples >= risk) value = r;
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

// Who has shown out of which suit: a player who did not follow the led suit is void in it.
function knownVoids(trickLog, plays) {
  const voids = [new Set(), new Set(), new Set(), new Set()];
  for (const t of [...(trickLog || []), { plays }]) {
    if (!t.plays.length) continue;
    const led = suitOf(t.plays[0].card);
    for (const p of t.plays) if (suitOf(p.card) !== led) voids[p.seat].add(led);
  }
  return voids;
}

// Play for the Sheet contracts without a trump suit (saras / naras / tak-naras).
// The bidder must take every trick, so the other team only needs one: both sides just try to win tricks
// safely, using the contract's own card order (cardStrength) and a count of the cards still unseen.
function noTrumpPlay(ctx) {
  const { seat, hand, plays, played } = ctx;
  const mode = ctx.mode || 'normal';
  const legal = legalCards(hand, plays);
  if (legal.length === 1) return legal[0];

  const str = (c) => cardStrength(c, mode);
  const mine = new Set(hand);
  const higherUnseen = (card) => {
    const s = suitOf(card);
    let n = 0;
    for (let r = 2; r <= ACE; r++) {
      const c = s * 13 + (r - 2);
      if (!mine.has(c) && !played.has(c) && str(c) > str(card)) n++;
    }
    return n;
  };
  const weakest = (cards) => cards.reduce((a, b) => (str(a) <= str(b) ? a : b));
  const strongest = (cards) => cards.reduce((a, b) => (str(a) >= str(b) ? a : b));

  if (!plays.length) {
    // lead the card that is hardest to beat
    return legal.reduce((a, b) => {
      const ha = higherUnseen(a);
      const hb = higherUnseen(b);
      if (ha !== hb) return ha < hb ? a : b;
      return str(a) >= str(b) ? a : b;
    });
  }

  const led = suitOf(plays[0].card);
  if (suitOf(legal[0]) !== led) return weakest(legal); // cannot win this trick: keep the strong cards
  const winnerSeat = trickWinner(plays, null, mode);
  const winnerCard = plays.find((p) => p.seat === winnerSeat).card;
  const lastToPlay = plays.length === 3;
  const partnerWinning = winnerSeat === partner(seat);
  const beats = (c) => trickWinner([...plays, { seat, card: c }], null, mode) === seat;

  if (partnerWinning && (lastToPlay || higherUnseen(winnerCard) === 0)) return weakest(legal);
  const winners = legal.filter(beats);
  if (winners.length) {
    if (lastToPlay) return weakest(winners);
    const safe = winners.filter((c) => higherUnseen(c) === 0);
    if (safe.length) return weakest(safe);
    return strongest(winners); // others still to play: make our win as hard to beat as possible
  }
  return weakest(legal);
}

// ctx: { seat, hand, plays, hokm, hakem, reading, tricks, played:Set, trickLog? }
function choosePlay(ctx) {
  if (ctx.hokm == null) return noTrumpPlay(ctx);
  const { seat, hand, plays, hokm, played } = ctx;
  const legal = legalCards(hand, plays);
  if (legal.length === 1) return legal[0];

  const mine = new Set(hand);
  const voids = knownVoids(ctx.trickLog, plays);
  const cardsLeft = (suit) => {
    // cards of a suit that are neither in my hand nor already played
    let n = 0;
    for (let r = 2; r <= ACE; r++) {
      const c = suit * 13 + (r - 2);
      if (!mine.has(c) && !played.has(c)) n++;
    }
    return n;
  };
  const trumpsUnseen = cardsLeft(hokm);
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
  const partnerSeat = partner(seat);

  // opponents still to act in this trick
  const playedSeats = new Set(plays.map((p) => p.seat));
  const remOpp = [0, 1, 2, 3].filter((x) => x !== seat && !playedSeats.has(x) && teamOf(x) !== teamOf(seat));
  // an opponent who is known to be out of `suit` can ruff it if trumps are still out there
  const canRuff = (x, suit) => suit !== hokm && voids[x].has(suit) && !voids[x].has(hokm) && trumpsUnseen > 0;

  // chance that this currently-winning card of my partner gets beaten by someone still to play
  const beatenChance = (card) => {
    const suit = suitOf(card);
    const led = suitOf(plays[0].card);
    if (!remOpp.length) return 0;
    if (suit !== led && suit !== hokm) return 1;
    if (remOpp.some((x) => canRuff(x, led) && suit !== hokm)) return 1;
    const holders = remOpp.filter((x) => !voids[x].has(suit)).length; // opponents who could hold a higher card
    const hu = higherUnseen(card);
    if (!hu || !holders) return 0;
    return 1 - Math.pow(1 - holders / 3, hu);
  };
  const SAFE = 0.35;

  // an opponent known to be void in this suit would ruff my lead
  const exposed = (suit) => suit !== hokm && trumpsUnseen > 0 &&
    [0, 1, 2, 3].some((x) => teamOf(x) !== teamOf(seat) && canRuff(x, suit));

  // ---- leading
  if (!plays.length) {
    const nonTrump = legal.filter((c) => suitOf(c) !== hokm);
    const trumps = legal.filter((c) => suitOf(c) === hokm);
    const unexposed = nonTrump.filter((c) => !exposed(suitOf(c)));
    const sure = legal.filter((c) => higherUnseen(c) === 0 && (suitOf(c) === hokm || !exposed(suitOf(c)) && !trumpsOutside(ctx, suitOf(c))));
    if (sure.length) return highest(sure);
    if (myTeamHakem && trumps.length && trumps.some((c) => higherUnseen(c) <= 1)) {
      return highest(trumps); // draw the opponents' trumps out
    }
    // give my partner a ruff: lead low in a suit they are void in (if they still have trumps)
    if (!voids[partnerSeat].has(hokm)) {
      const forPartner = unexposed.filter((c) => voids[partnerSeat].has(suitOf(c)) && rankOf(c) < ACE);
      if (forPartner.length) return lowest(forPartner);
    }
    const aces = unexposed.filter((c) => rankOf(c) === ACE);
    if (aces.length) return aces[0];
    const pool = unexposed.length ? unexposed : nonTrump;
    if (pool.length) {
      // lead low from the shortest suit
      const shortest = pool.reduce((a, b) => (suitLen(suitOf(a)) <= suitLen(suitOf(b)) ? a : b));
      return lowest(pool.filter((c) => suitOf(c) === suitOf(shortest)));
    }
    return lowest(trumps);
  }

  // ---- following
  const led = suitOf(plays[0].card);
  const winnerSeat = trickWinner(plays, hokm);
  const winnerCard = plays.find((p) => p.seat === winnerSeat).card;
  const partnerWinning = winnerSeat === partnerSeat;
  const lastToPlay = plays.length === 3;
  const follows = suitOf(legal[0]) === led;
  const partnerSafe = partnerWinning && (lastToPlay || beatenChance(winnerCard) < SAFE);

  const beats = (c) => trickWinner([...plays, { seat, card: c }], hokm) === seat;

  if (follows) {
    if (partnerSafe) return lowest(legal);
    const winners = legal.filter(beats);
    if (winners.length) {
      if (lastToPlay) return lowest(winners);
      const safe = winners.filter((c) => higherUnseen(c) === 0 && !remOpp.some((x) => canRuff(x, led)));
      if (safe.length) return lowest(safe);
      if (partnerWinning) return lowest(legal); // not certain, but not worth wasting a high card either
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
    // give up the suit we hold the least of, lowest card first (never a lone ace/king if avoidable)
    const worst = discardable.reduce((a, b) => {
      const la = suitLen(suitOf(a)) + (rankOf(a) >= KING ? 5 : 0);
      const lb = suitLen(suitOf(b)) + (rankOf(b) >= KING ? 5 : 0);
      if (la !== lb) return la < lb ? a : b;
      return rankOf(a) <= rankOf(b) ? a : b;
    });
    return lowest(discardable.filter((c) => suitOf(c) === suitOf(worst)));
  };
  if (partnerSafe) return pickDiscard();
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

// ---------------------------------------------------------------- raising the reading

// Plays the rest of a round out from a given position and returns how many tricks the Hakem's team ends up with.
function simulateFrom(st) {
  const { hands, hakem, hokm, mode, played, trickLog } = st;
  const counts = st.tricks.slice();
  let plays = st.plays.slice();
  let seat = st.turn;
  for (;;) {
    while (plays.length < 4) {
      const card = choosePlay({ seat, hand: hands[seat], plays, hokm, mode, hakem, reading: 0, tricks: counts, played, trickLog });
      hands[seat] = hands[seat].filter((c) => c !== card);
      plays.push({ seat, card });
      seat = (seat + 1) % 4;
    }
    const winner = trickWinner(plays, hokm, mode);
    counts[teamOf(winner)]++;
    plays.forEach((p) => played.add(p.card));
    trickLog.push({ plays, winner });
    plays = [];
    seat = winner;
    if (hands[seat].length === 0) break;
  }
  return counts[teamOf(hakem)];
}

// Deals the cards this seat cannot see out at random (respecting who has already shown a void) and plays the
// round to the end, `samples` times. Returns the Hakem team's final trick counts, one per deal.
// ctx: { seat, hand, plays, turn, hokm, mode, hakem, tricks, played:Set, trickLog, counts:[4 hand sizes], bag? }
function sampleOutcomes(ctx, samples) {
  const { seat, hand, plays, hokm, hakem, played, trickLog, counts } = ctx;
  const mode = ctx.mode || 'normal';
  const known = new Set([...hand, ...played, ...plays.map((p) => p.card), ...(ctx.bag || [])]);
  const pool = [];
  for (let c = 0; c < 52; c++) if (!known.has(c)) pool.push(c);
  const others = [0, 1, 2, 3].filter((x) => x !== seat);
  const voids = knownVoids(trickLog, plays);
  const out = [];
  for (let n = 0; n < samples; n++) {
    let hands = null;
    for (let attempt = 0; attempt < 25; attempt++) {
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      hands = [null, null, null, null];
      hands[seat] = hand.slice();
      let at = 0;
      for (const o of others) { hands[o] = pool.slice(at, at + counts[o]); at += counts[o]; }
      if (others.every((o) => !hands[o].some((c) => voids[o].has(suitOf(c))))) break;
    }
    out.push(simulateFrom({ hands, hakem, hokm, mode, plays, turn: ctx.turn, played: new Set(played), trickLog: trickLog.slice(), tricks: ctx.tricks }));
  }
  return out;
}

const RAISE_SURE = 0.9; // a bot Hakem only raises when it makes the new reading in about 9 of 10 deals
const VOTE_ACCEPT_BELOW = 0.9; // a bot opponent says YES unless the Hakem makes the raise in 9 of 10 deals

// A Hakem bot's raise: the highest reading it is nearly sure to make, or 0. Only after two tricks have been played.
function chooseRaise(ctx) {
  if (ctx.maxRaise <= ctx.reading || ctx.trickLog.length < 2) return 0;
  const res = sampleOutcomes(ctx, 60);
  for (let r = ctx.maxRaise; r > ctx.reading; r--) {
    if (res.filter((t) => t >= r).length / res.length >= RAISE_SURE) return r;
  }
  return 0;
}

// An opponent bot's answer to a raise. Refusing hands the Hakem their old reading on the spot, accepting risks double
// the new reading against us, so we accept unless the Hakem is almost certain to make it.
function chooseVote(ctx) {
  const res = sampleOutcomes(ctx, 60);
  return res.filter((t) => t >= ctx.raiseTo).length / res.length < VOTE_ACCEPT_BELOW;
}

module.exports = { estimateTricks, chooseRaise, chooseVote, sampleOutcomes, chooseBid, chooseBidHeuristic, chooseHakem, chooseDiscards, choosePlay, bestHokm };
