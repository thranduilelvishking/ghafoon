'use strict';
// Bot-only self-play. Usable from tests and from the command line (node test/sim.js 200).
const { Game, rankOf, suitOf } = require('../server/engine');
const bots = require('../server/bots');

function playBotRound(g, stats) {
  const played = new Set();
  while (g.phase === 'draw') g.finishDraw();
  while (g.phase === 'reading') {
    const s = g.turn;
    g.bid(s, bots.chooseBid(g.hands[s], g.highest));
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
    const card = bots.choosePlay({
      seat: s, hand: g.hands[s], plays: g.plays, hokm: g.hokm, hakem: g.hakem,
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
  const stats = { rounds: 0, made: 0, forced: 0, readings: {}, tricksPlayed: 0 };
  for (let i = 0; i < n; i++) playGame(stats);
  console.log('games', n, 'rounds', stats.rounds);
  console.log('made %', ((100 * stats.made) / stats.rounds).toFixed(1));
  console.log('forced-7 %', ((100 * stats.forced) / stats.rounds).toFixed(1));
  console.log('avg tricks played', (stats.tricksPlayed / stats.rounds).toFixed(1));
  console.log('readings', stats.readings);
}
