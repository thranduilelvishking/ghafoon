'use strict';
// Bot-only self-play. Usable from tests and from the command line (node test/sim.js 200).
const { Game, rankOf, suitOf } = require('../server/engine');
const bots = require('../server/bots');

// What a bot at `seat` can see when it thinks about a raise (mirrors Room.raiseCtx in the server).
function raiseCtx(g, seat) {
  const complete = g.phase === 'trickEnd' || (g.phase === 'raiseVote' && g.raise.resume === 'trickEnd');
  const played = new Set();
  for (const t of g.trickLog) for (const p of t.plays) played.add(p.card);
  return {
    seat, hand: g.hands[seat], plays: complete ? [] : g.plays, turn: complete ? g.trickWinner : g.turn,
    hokm: g.hokm, mode: g.mode, hakem: g.hakem, tricks: g.tricks, played, trickLog: g.trickLog,
    counts: g.hands.map((h) => h.length), bag: seat === g.hakem ? g.bag : [], reading: g.reading, maxRaise: g.maxRaise(),
  };
}

// Lets the Hakem bot raise if it wants to and the opponent bots answer; returns true if a raise was declared.
function maybeRaise(g, stats) {
  if (!g.canRaise(g.hakem)) return false;
  const to = bots.chooseRaise(raiseCtx(g, g.hakem));
  if (!to) return false;
  g.declareRaise(g.hakem, to);
  if (stats) stats.raises++;
  for (const o of g.opponentsOfHakem()) {
    if (g.phase !== 'raiseVote') break; // a YES settles it
    g.voteRaise(o, bots.chooseVote({ ...raiseCtx(g, o), raiseTo: g.raise.to }));
  }
  if (stats) {
    if (g.lastRaise.accepted) stats.raiseAccepted++;
    else stats.raiseRefused++;
  }
  return true;
}

function playBotRound(g, stats) {
  const played = new Set();
  while (g.phase === 'draw') g.finishDraw();
  while (g.phase === 'reading') {
    const s = g.turn;
    g.bid(s, bots.chooseBid(g.hands[s], g.highest, { seat: s, sardast: g.sardast }));
  }
  const { hokm, discards } = bots.chooseHakem(g.hands[g.hakem]);
  g.hakemDone(g.hakem, discards, hokm);
  discards.forEach((c) => played.add(c)); // hakem knows own bag; others don't, but harmless for stats
  played.clear();
  while (g.phase === 'play' || g.phase === 'trickEnd') {
    if (g.phase === 'trickEnd') {
      g.lastTrick.plays.forEach((p) => played.add(p.card));
      g.afterTrick();
      continue;
    }
    const s = g.turn;
    if (s === g.hakem && maybeRaise(g, stats)) {
      if (g.phase === 'roundEnd' || g.phase === 'gameOver') break; // refused: the round is over
      continue;
    }
    const card = bots.choosePlay({
      seat: s, hand: g.hands[s], plays: g.plays, hokm: g.hokm, mode: g.mode, hakem: g.hakem,
      reading: g.reading, tricks: g.tricks, played, trickLog: g.trickLog,
    });
    g.play(s, card);
  }
  if (stats) {
    const r = g.roundResult;
    stats.rounds++;
    stats.readings[r.reading] = (stats.readings[r.reading] || 0) + 1;
    if (r.outcome === 'made') stats.made++;
    if (r.forced) stats.forced++;
    if (r.raisedFrom != null) { stats.raisedRounds = (stats.raisedRounds || 0) + 1; if (r.outcome === 'made') stats.raisedMade = (stats.raisedMade || 0) + 1; }
    stats.tricksPlayed += g.trickLog.length;
  }
}

function playGame(stats) {
  const g = new Game();
  g.startRound();
  let guard = 0;
  while (g.phase !== 'gameOver') {
    playBotRound(g, stats);
    if (g.phase === 'roundEnd') g.nextRound();
    if (++guard > 500) throw new Error('game does not end');
  }
  return g;
}

module.exports = { playGame, playBotRound };

if (require.main === module) {
  const n = +process.argv[2] || 100;
  const stats = { rounds: 0, made: 0, forced: 0, readings: {}, tricksPlayed: 0, raises: 0, raiseAccepted: 0, raiseRefused: 0 };
  for (let i = 0; i < n; i++) playGame(stats);
  console.log('games', n, 'rounds', stats.rounds);
  console.log('made %', ((100 * stats.made) / stats.rounds).toFixed(1));
  console.log('forced-7 %', ((100 * stats.forced) / stats.rounds).toFixed(1));
  console.log('avg tricks played', (stats.tricksPlayed / stats.rounds).toFixed(1));
  console.log('readings', stats.readings);
  console.log('accepted raises that were then made:', stats.raisedMade || 0, 'of', stats.raisedRounds || 0);
  console.log('raises', stats.raises, '(accepted', stats.raiseAccepted + ', refused', stats.raiseRefused + ')');
}
