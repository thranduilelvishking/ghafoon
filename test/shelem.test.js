'use strict';
const test = require('node:test');
const assert = require('node:assert');
const S = require('../server/shelem');
const B = require('../server/shelemBots');
const { makeCard } = require('../server/engine');

const { ShelemGame, FORMATS, BLACK, COLOR } = S;
const SP = 0; const HE = 1; const CL = 2; const DI = 3;
const C = (suit, rank) => makeCard(suit, rank);

function game(format = 'classic', extra = {}) {
  const g = new ShelemGame({ ...S.defaultOptions(format), ...extra }, { dealer: 3 });
  g.startRound();
  return g;
}

test('the whole deck is worth 100 / 120 / 165 card points', () => {
  for (const [f, total] of [['classic', 100], ['ace', 120], ['joker', 165]]) {
    const cfg = FORMATS[f];
    const cards = Array.from({ length: 52 }, (_, i) => i).concat(cfg.jokers ? [BLACK, COLOR] : []);
    assert.strictEqual(cards.reduce((a, c) => a + S.cardPoints(c, cfg), 0), total, f);
    assert.strictEqual(cfg.total, total + 65, `${f} round total adds 13 tricks of 5`);
  }
});

test('deal: 12 each, widow of 4 (6 with Jokers), no duplicates', () => {
  for (const [f, w] of [['classic', 4], ['ace', 4], ['joker', 6]]) {
    const g = game(f);
    assert.ok(g.hands.every((h) => h.length === 12));
    assert.strictEqual(g.widow.length, w);
    assert.strictEqual(new Set([...g.hands.flat(), ...g.widow]).size, 48 + w);
    assert.strictEqual(g.turn, 0, 'the player after the dealer (3) speaks first');
  }
});

test('the first deal and a redeal are thorough shuffles', () => {
  const g = game();
  assert.strictEqual(g.shuffleInfo.kind, 'full');
  g.bid(0, 0); g.bid(1, 0); g.bid(2, 0);
  assert.strictEqual(g.shuffleInfo.kind, 'full');
});

test('bidding: steps of 5 from the opening bid, must beat the highest, three passes make the Hakem', () => {
  const g = game();
  assert.throws(() => g.bid(0, 95));
  assert.throws(() => g.bid(0, 103));
  assert.throws(() => g.bid(0, 170));
  g.bid(0, 100);
  assert.throws(() => g.bid(1, 100));
  g.bid(1, 105);
  g.bid(2, 0);
  g.bid(3, 0);
  assert.strictEqual(g.turn, 0, 'passed players are skipped');
  g.bid(0, 0);
  assert.strictEqual(g.hakem, 1);
  assert.strictEqual(g.highest, 105);
  assert.strictEqual(g.phase, 'widow');
  assert.strictEqual(g.hands[1].length, 16);
  assert.strictEqual(game('ace').cfg.minBid, 120);
  assert.throws(() => game('ace').bid(0, 115));
});

test('the maximum bid ends the bidding at once', () => {
  const g = game();
  g.bid(0, 165);
  assert.strictEqual(g.hakem, 0);
  assert.strictEqual(g.phase, 'widow');
});

test('first three pass: redeal by the same dealer, whatever the 4th would say', () => {
  const g = game();
  const hands = g.hands.map((h) => h.join());
  g.bid(0, 0); g.bid(1, 0);
  g.bid(2, 0);
  assert.strictEqual(g.phase, 'bid');
  assert.strictEqual(g.redeals, 1);
  assert.strictEqual(g.dealer, 3);
  assert.strictEqual(g.round, 1, 'a redeal is not a new round');
  assert.strictEqual(g.turn, 0);
  assert.notDeepStrictEqual(g.hands.map((h) => h.join()), hands);
  // a 4th player who bids after two passes does not cause a redeal
  g.bid(0, 0); g.bid(1, 100); g.bid(2, 0); g.bid(3, 0);
  assert.strictEqual(g.hakem, 1);
});

function playing(format, hands, { hakem = 0, bid = 100, hokm = null, topHokm = false } = {}) {
  const g = game(format, { topHokm });
  g.hands = hands.map((h) => h.slice());
  g.hakem = hakem; g.highest = bid; g.highSeat = hakem;
  g.phase = 'play'; g.leader = hakem; g.turn = hakem; g.plays = []; g.trickLog = [];
  g.hokm = hokm;
  return g;
}

test('Jokers rank above the Ace of Hokm and belong to Hokm', () => {
  const plays = [{ seat: 0, card: C(SP, 14) }, { seat: 1, card: BLACK }, { seat: 2, card: C(HE, 14) }, { seat: 3, card: COLOR }];
  assert.strictEqual(S.trickWinner(plays, SP), 3);
  assert.strictEqual(S.trickWinner(plays.slice(0, 3), SP), 1, 'Black Joker beats the Ace of Hokm');
  assert.strictEqual(S.trickWinner([{ seat: 0, card: C(HE, 5) }, { seat: 1, card: C(HE, 9) }, { seat: 2, card: C(CL, 14) }, { seat: 3, card: C(DI, 14) }], SP), 1, 'off-suit never wins');
  assert.strictEqual(S.trickWinner([{ seat: 0, card: C(HE, 5) }, { seat: 1, card: C(SP, 2) }, { seat: 2, card: C(HE, 14) }, { seat: 3, card: C(SP, 3) }], SP), 3, 'highest Boridan wins');
});

test('first card sets Hokm; a Joker lead needs a named suit; Jokers cannot follow another suit', () => {
  const g = playing('joker', [[BLACK, C(HE, 3)], [C(HE, 9), BLACK + 1], [C(HE, 8)], [C(HE, 7)]]);
  assert.throws(() => g.play(0, BLACK), /name the Hokm/);
  g.play(0, BLACK, SP);
  assert.strictEqual(g.hokm, SP);
  // Spades (Hokm) were led: Joker counts as following; seat 1 holds a Joker and a heart: must play the Joker
  assert.deepStrictEqual(g.legalFor(1), [COLOR]);
  const g2 = playing('joker', [[C(HE, 3), C(SP, 4)], [C(HE, 9), COLOR], [C(CL, 8)], [C(CL, 7)]]);
  g2.play(0, C(HE, 3));
  assert.strictEqual(g2.hokm, HE);
  const g3 = playing('joker', [[C(CL, 3), C(SP, 4)], [C(CL, 9), COLOR], [C(HE, 8)], [C(HE, 7)]], { hokm: null });
  g3.play(0, C(CL, 3));
  assert.deepStrictEqual(g3.legalFor(1), [C(CL, 9), COLOR].filter((c) => c === C(CL, 9) || c === COLOR), 'clubs are Hokm here, so both follow');
  const g4 = playing('joker', [[C(CL, 3), C(SP, 4)], [C(SP, 9), COLOR], [C(HE, 8)], [C(HE, 7)]]);
  g4.hokm = HE; g4.firstTrick; g4.trickLog = [{}]; // Hokm is hearts; clubs led and seat 1 has no club: anything goes
  g4.play(0, C(CL, 3));
  assert.deepStrictEqual(g4.legalFor(1).sort(), [C(SP, 9), COLOR].sort());
  const g5 = playing('joker', [[C(CL, 3), C(SP, 4)], [C(CL, 9), COLOR], [C(HE, 8)], [C(HE, 7)]]);
  g5.hokm = HE; g5.trickLog = [{}];
  g5.play(0, C(CL, 3));
  assert.deepStrictEqual(g5.legalFor(1), [C(CL, 9)], 'a Joker cannot follow a non-Hokm suit while you hold that suit');
});

test('Top Hokm must fall: the holder must play it in the first trick', () => {
  // Classic: Hakem leads a spade, seat 2 holds the Ace of spades
  const g = playing('classic', [[C(SP, 5), C(HE, 3)], [C(SP, 9), C(HE, 4)], [C(SP, 14), C(SP, 2)], [C(SP, 7), C(HE, 5)]], { topHokm: true });
  g.play(0, C(SP, 5));
  g.play(1, C(SP, 9));
  assert.deepStrictEqual(g.legalFor(2), [C(SP, 14)]);
  assert.throws(() => g.play(2, C(SP, 2)));
  g.play(2, C(SP, 14));
  g.play(3, C(SP, 7));
  assert.strictEqual(g.trickWinner, 2, 'the team holding it takes trick 1');
  // the Hakem holding the Ace of a suit must lead that Ace if he leads that suit
  const h = playing('classic', [[C(SP, 14), C(SP, 5), C(HE, 3)], [], [], []], { topHokm: true });
  assert.deepStrictEqual(h.legalFor(0).sort(), [C(SP, 14), C(HE, 3)].sort());
  assert.throws(() => h.play(0, C(SP, 5)));
  // Joker format: the Color Joker is the top card
  const j = playing('joker', [[C(SP, 5), COLOR], [C(SP, 9), BLACK], [C(SP, 2)], [C(SP, 7)]], { topHokm: true });
  assert.deepStrictEqual(j.legalFor(0), [COLOR]);
  j.play(0, COLOR, HE);
  assert.strictEqual(j.hokm, HE);
  // option off: free choice
  const f = playing('classic', [[C(SP, 14), C(SP, 5)], [], [], []]);
  assert.strictEqual(f.legalFor(0).length, 2);
});

function finish(format, { hakem = 0, bid = 100, hakemPts, hakemTricks, defPts, defTricks, scores = [0, 0] }) {
  const g = game(format);
  g.hakem = hakem; g.highest = bid; g.highSeat = hakem;
  const ht = hakem % 2;
  g.points = [0, 0]; g.tricks = [0, 0];
  g.points[ht] = hakemPts; g.tricks[ht] = hakemTricks;
  g.points[1 - ht] = defPts; g.tricks[1 - ht] = defTricks;
  g.scores = scores.slice();
  g.finishRound();
  return g;
}

test('scoring: made the bid, failed, Yasa, Shelem (Classic)', () => {
  // Hakem bids 120: 105 + 4 tricks... example from the rules: totals 125 / 40
  let g = finish('classic', { bid: 120, hakemPts: 80, hakemTricks: 9, defPts: 20, defTricks: 4 }); // 80+45=125, 20+20=40
  assert.deepStrictEqual(g.roundResult.totals, [125, 40]);
  assert.strictEqual(g.roundResult.outcome, 'made');
  assert.deepStrictEqual(g.scores, [125, 40]);
  g = finish('classic', { bid: 120, hakemPts: 60, hakemTricks: 9, defPts: 40, defTricks: 4 }); // 105 / 60
  assert.strictEqual(g.roundResult.outcome, 'failed');
  assert.deepStrictEqual(g.scores, [-120, 60]);
  g = finish('classic', { bid: 120, hakemPts: 40, hakemTricks: 7, defPts: 60, defTricks: 6 }); // 75 / 90
  assert.strictEqual(g.roundResult.outcome, 'yasa');
  assert.deepStrictEqual(g.scores, [-240, 90]);
  g = finish('classic', { bid: 100, hakemPts: 100, hakemTricks: 13, defPts: 0, defTricks: 0 });
  assert.strictEqual(g.roundResult.outcome, 'shelem');
  assert.deepStrictEqual(g.scores, [330, 0]);
  // exactly the bid counts as made; 82 is not Yasa, 80 is (Classic)
  g = finish('classic', { bid: 100, hakemPts: 35, hakemTricks: 13 - 6, defPts: 65, defTricks: 6 }); // 70 / 95
  assert.strictEqual(g.roundResult.outcome, 'yasa');
  g = finish('classic', { bid: 100, hakemPts: 45, hakemTricks: 8, defPts: 55, defTricks: 5 }); // 85 / 80
  assert.strictEqual(g.roundResult.outcome, 'failed');
  g = finish('classic', { hakem: 1, bid: 100, hakemPts: 60, hakemTricks: 8, defPts: 40, defTricks: 5 }); // team 1 takes 100
  assert.strictEqual(g.roundResult.outcome, 'made');
  assert.deepStrictEqual(g.scores, [65, 100]);
});

test('scoring: Shelem is double the round total in every format; Joker Yasa threshold is 115', () => {
  assert.strictEqual(finish('ace', { bid: 120, hakemPts: 120, hakemTricks: 13, defPts: 0, defTricks: 0 }).scores[0], 370);
  assert.strictEqual(finish('joker', { bid: 120, hakemPts: 165, hakemTricks: 13, defPts: 0, defTricks: 0 }).scores[0], 460);
  // Joker: a 115-115 split is a failed bid, not Yasa; 110 is Yasa
  let g = finish('joker', { bid: 130, hakemPts: 50, hakemTricks: 13 - 5, defPts: 115, defTricks: 5 }); // 90? use explicit totals below
  g = finish('joker', { bid: 130, hakemPts: 115 - 5 * 7, hakemTricks: 7, defPts: 115 - 5 * 6, defTricks: 6 });
  assert.deepStrictEqual(g.roundResult.totals, [115, 115]);
  assert.strictEqual(g.roundResult.outcome, 'failed');
  g = finish('joker', { bid: 130, hakemPts: 110 - 35, hakemTricks: 7, defPts: 120 - 30, defTricks: 6 });
  assert.strictEqual(g.roundResult.outcome, 'yasa');
});

test('the discard is a trick for the Hakem team, point cards included', () => {
  const g = game();
  g.bid(0, 100); g.bid(1, 0); g.bid(2, 0); g.bid(3, 0);
  const pick = g.hands[0].slice(0, 4);
  assert.throws(() => g.hakemDiscard(0, pick.slice(0, 3)));
  assert.throws(() => g.hakemDiscard(1, pick));
  g.hakemDiscard(0, pick);
  assert.strictEqual(g.tricks[0], 1);
  assert.strictEqual(g.points[0], pick.reduce((a, c) => a + S.cardPoints(c, g.cfg), 0));
  assert.strictEqual(g.hands[0].length, 12);
  assert.strictEqual(g.turn, 0, 'the Hakem leads the first trick');
});

test('winning: reach the target, or the other team falls to minus half', () => {
  let g = finish('classic', { bid: 100, hakemPts: 70, hakemTricks: 8, defPts: 10, defTricks: 5, scores: [700, 0] });
  assert.strictEqual(g.phase, 'gameOver');
  assert.strictEqual(g.winner, 0);
  assert.strictEqual(g.target, 800);
  g = finish('classic', { bid: 100, hakemPts: 40, hakemTricks: 7, defPts: 60, defTricks: 6, scores: [-200, 0] }); // Hakem team: -200 - 200 = -400
  assert.strictEqual(g.phase, 'gameOver');
  assert.strictEqual(g.winner, 1);
  g = finish('classic', { bid: 100, hakemPts: 70, hakemTricks: 8, defPts: 10, defTricks: 5, scores: [100, 100] });
  assert.strictEqual(g.phase, 'roundEnd');
  // both pass the target in one round: the higher total wins
  g = finish('classic', { bid: 100, hakemPts: 60, hakemTricks: 9, defPts: 40, defTricks: 4, scores: [700, 770] }); // 105 -> 805, 60 -> 830
  assert.strictEqual(g.phase, 'gameOver');
  assert.strictEqual(g.winner, 1);
  // a different target changes the losing line to minus half
  const custom = new ShelemGame(S.cleanOptions({ target: 500 }));
  assert.strictEqual(custom.target, 500);
  assert.strictEqual(custom.loseAt, -250);
});

test('options: format resets the target, targets are validated', () => {
  const o = S.defaultOptions();
  assert.deepStrictEqual(o, { format: 'classic', topHokm: false, target: 800 });
  assert.strictEqual(S.cleanOptions({ format: 'joker' }, o).target, 1250);
  assert.strictEqual(S.cleanOptions({ format: 'ace', target: 600 }, o).target, 600);
  assert.strictEqual(S.cleanOptions({ topHokm: true }, o).topHokm, true);
  assert.throws(() => S.cleanOptions({ format: 'poker' }, o));
  assert.throws(() => S.cleanOptions({ target: 12 }, o));
  assert.throws(() => S.cleanOptions({ target: 'abc' }, o));
});

test('bots play complete games in every format, with and without Top Hokm must fall', () => {
  for (const f of ['classic', 'ace', 'joker']) {
    for (const topHokm of [false, true]) {
      const g = new ShelemGame({ ...S.defaultOptions(f), topHokm, target: 400 });
      g.startRound();
      let steps = 0;
      while (g.phase !== 'gameOver' && steps++ < 20000) {
        if (g.phase === 'bid') g.bid(g.turn, B.chooseBid(g, g.turn));
        else if (g.phase === 'widow') g.hakemDiscard(g.hakem, B.chooseWidowDiscards(g, g.hakem));
        else if (g.phase === 'play') { const s = g.turn; const m = B.choosePlay(g, s); g.play(s, m.card, m.hokm); }
        else if (g.phase === 'trickEnd') g.afterTrick();
        else if (g.phase === 'roundEnd') {
          const r = g.roundResult;
          assert.strictEqual(r.totals[0] + r.totals[1], g.cfg.total, 'every point is taken by somebody');
          const piled = g.pile.slice();
          assert.strictEqual(piled.length, g.cfg.jokers ? 54 : 52, 'the whole deck is collected');
          assert.deepStrictEqual(piled.slice(0, g.cfg.widow), g.discard, 'the discard is at the bottom of the stack');
          g.nextRound();
          assert.strictEqual(g.shuffleInfo.kind, 'stacked', 'later rounds are stacked and cut, not shuffled');
          assert.strictEqual(new Set([...g.hands.flat(), ...g.widow]).size, piled.length);
        }
      }
      assert.strictEqual(g.phase, 'gameOver', `${f} topHokm=${topHokm} finished`);
    }
  }
});
