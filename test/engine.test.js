'use strict';
const test = require('node:test');
const assert = require('node:assert');
const E = require('../server/engine');
const { playGame } = require('./sim');

const C = (suit, rank) => E.makeCard(suit, rank); // suit 0=S 1=H 2=C 3=D
const S = 0, H = 1, K = 2, D = 3;

// A game forced into a known state, skipping the shuffle.
function setup({ sardast = 0, hands, yard = [], scores = [0, 0] } = {}) {
  const g = new E.Game();
  g.startRound();
  g.finishDraw && g.phase === 'draw' && g.finishDraw();
  g.sardast = sardast;
  if (hands) g.hands = hands.map((h) => h.slice());
  g.yard = yard;
  g.scores = scores;
  g.bids = [null, null, null, null];
  g.highest = 0; g.highSeat = null; g.bidCount = 0; g.turn = sardast;
  g.phase = 'reading';
  return g;
}

test('deal gives 12 cards each plus 4 in the yard, no duplicates', () => {
  const { hands, yard } = E.deal(E.fullShuffle(), 2);
  assert.ok(hands.every((h) => h.length === 12));
  assert.strictEqual(yard.length, 4);
  assert.strictEqual(new Set([...hands.flat(), ...yard]).size, 52);
});

test('deal order: sardast first, 12 then 1 to the yard', () => {
  const deck = E.freshDeck();
  const { hands, yard } = E.deal(deck, 1);
  assert.deepStrictEqual(hands[1], deck.slice(0, 12));
  assert.strictEqual(yard[0], deck[12]);
  assert.deepStrictEqual(hands[2], deck.slice(13, 25));
  assert.deepStrictEqual(hands[3], deck.slice(26, 38));
  assert.deepStrictEqual(hands[0], deck.slice(39, 51));
  assert.strictEqual(yard[3], deck[51]);
});

test('first ace draw: first player to receive an ace', () => {
  const deck = E.freshDeck().filter((c) => E.rankOf(c) !== 14);
  // seat 0,1,2,3,0 ... put an ace at index 6 -> seat 2
  deck.splice(6, 0, C(S, 14));
  const r = E.firstAceDraw(deck, 0);
  assert.strictEqual(r.seat, 2);
  assert.strictEqual(r.reveals.length, 7);
});

test('reading: equal reading rejected, must be higher', () => {
  const g = setup({ hands: [[], [], [], []] });
  g.bid(0, 8);
  assert.throws(() => g.bid(1, 8));
  assert.throws(() => g.bid(1, 7));
  g.bid(1, 9);
  assert.strictEqual(g.highest, 9);
});

test('reading: below 7 is a pass, each player reads once, order is clockwise', () => {
  const g = setup({ sardast: 2, hands: [[], [], [], []] });
  assert.throws(() => g.bid(0, 7)); // not their turn
  g.bid(2, 3);
  assert.strictEqual(g.bids[2], 0);
  assert.strictEqual(g.turn, 3);
});

test('sheet by the sardast ends reading at once and the hakem leads', () => {
  const hands = [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], [], [], []];
  const g = setup({ sardast: 0, hands, yard: [20, 21, 22, 23] });
  g.bid(0, 13);
  assert.strictEqual(g.phase, 'hakem');
  assert.strictEqual(g.hakem, 0);
  assert.strictEqual(g.hands[0].length, 16);
  g.hakemDone(0, [1, 2, 3, 4], H);
  assert.strictEqual(g.leader, 0);
});

test('sheet by the last reader works, sardast leads normal rounds', () => {
  const g = setup({ sardast: 1, hands: [[], [], [], []], yard: [1, 2, 3, 4] });
  g.bid(1, 7); g.bid(2, 0); g.bid(3, 0); g.bid(0, 13);
  assert.strictEqual(g.hakem, 0);
  assert.strictEqual(g.reading, 13);
});

test('everyone passes: sardast is forced to 7', () => {
  const g = setup({ sardast: 3, hands: [[], [], [], []], yard: [1, 2, 3, 4] });
  for (let i = 0; i < 4; i++) g.bid(g.turn, 0);
  assert.strictEqual(g.phase, 'hakem');
  assert.strictEqual(g.hakem, 3);
  assert.strictEqual(g.reading, 7);
  assert.strictEqual(g.forced, true);
});

test('hakem may discard hokm cards and aces; bag counts as a trick', () => {
  const hand = [C(H, 14), C(H, 13), C(S, 14), C(S, 2), 40, 41, 42, 43, 44, 45, 46, 47];
  const g = setup({ sardast: 0, hands: [hand, [], [], []], yard: [C(K, 2), C(K, 3), C(K, 4), C(K, 5)] });
  g.bid(0, 8); g.bid(1, 0); g.bid(2, 0); g.bid(3, 0);
  g.hakemDone(0, [C(H, 14), C(H, 13), C(S, 14), C(S, 2)], H);
  assert.strictEqual(g.tricks[0], 1);
  assert.strictEqual(g.hands[0].length, 12);
  assert.throws(() => g.hakemDone(0, [1, 2, 3, 4], H)); // already done
});

test('hakem must discard exactly four cards they hold', () => {
  const hand = Array.from({ length: 12 }, (_, i) => i);
  const g = setup({ sardast: 0, hands: [hand, [], [], []], yard: [20, 21, 22, 23] });
  g.bid(0, 7); g.bid(1, 0); g.bid(2, 0); g.bid(3, 0);
  assert.throws(() => g.hakemDone(0, [0, 1, 2], H));
  assert.throws(() => g.hakemDone(0, [0, 1, 2, 30], H));
  assert.throws(() => g.hakemDone(0, [0, 1, 2, 2], H));
});

function toPlay({ hands, hokm = H, reading = 7, hakem = 0, sardast = 0 }) {
  const g = setup({ sardast, hands, yard: [] });
  g.phase = 'play';
  g.hakem = hakem; g.reading = reading; g.hokm = hokm;
  g.tricks = [0, 0]; g.tricks[hakem % 2] = 1;
  g.bag = [100, 101, 102, 103]; g.trickLog = []; g.plays = [];
  g.leader = sardast; g.turn = sardast;
  return g;
}

test('must follow suit; void players may play anything', () => {
  const g = toPlay({ hands: [[C(S, 5)], [C(S, 9), C(H, 2)], [C(D, 3)], [C(K, 3)]] });
  g.play(0, C(S, 5));
  assert.throws(() => g.play(1, C(H, 2)));
  g.play(1, C(S, 9));
  g.play(2, C(D, 3)); // void: ok
});

test('highest led suit wins; off-suit non-hokm never wins', () => {
  assert.strictEqual(E.trickWinner([{ seat: 0, card: C(S, 5) }, { seat: 1, card: C(D, 14) }, { seat: 2, card: C(S, 6) }, { seat: 3, card: C(K, 14) }], H), 2);
});

test('boridan then sarbor, winner leads next trick', () => {
  const plays = [{ seat: 0, card: C(S, 14) }, { seat: 1, card: C(H, 3) }, { seat: 2, card: C(H, 9) }, { seat: 3, card: C(S, 2) }];
  assert.strictEqual(E.trickWinner(plays, H), 2);
  const g = toPlay({ hands: [[C(S, 14), C(S, 3)], [C(H, 3), C(H, 4)], [C(H, 9), C(K, 4)], [C(S, 2), C(K, 5)]] });
  plays.forEach((p) => g.play(p.seat, p.card));
  g.afterTrick();
  assert.strictEqual(g.turn, 2);
  assert.strictEqual(g.phase, 'play');
});

test('round ends the moment the hakem team reaches its reading', () => {
  const g = toPlay({ reading: 7, hands: [[C(S, 14)], [C(S, 2)], [C(S, 3)], [C(S, 4)]] });
  g.tricks = [6, 0]; // 6 incl. bag
  [0, 1, 2, 3].forEach((s) => g.play(s, g.hands[s][0]));
  assert.strictEqual(g.pendingEnd, 'made');
  g.afterTrick();
  assert.strictEqual(g.scores[0], 7);
  assert.strictEqual(g.phase, 'roundEnd');
});

test('hakem busted at 14 - reading: opponents score double', () => {
  const g = toPlay({ reading: 9, hands: [[C(S, 2)], [C(S, 14)], [C(S, 3)], [C(S, 4)]] });
  g.tricks = [1, 4]; // opponents need 5 for a 9
  [0, 1, 2, 3].forEach((s) => g.play(s, g.hands[s][0]));
  assert.strictEqual(g.pendingEnd, 'busted');
  g.afterTrick();
  assert.deepStrictEqual(g.scores, [0, 18]);
});

test('sheet made scores 26, sheet busted scores 26 for opponents', () => {
  let g = toPlay({ reading: 13, hands: [[C(S, 14)], [C(S, 2)], [C(S, 3)], [C(S, 4)]] });
  g.tricks = [12, 0];
  [0, 1, 2, 3].forEach((s) => g.play(s, g.hands[s][0]));
  g.afterTrick();
  assert.deepStrictEqual(g.scores, [26, 0]);
  g = toPlay({ reading: 13, hands: [[C(S, 2)], [C(S, 14)], [C(S, 3)], [C(S, 4)]] });
  [0, 1, 2, 3].forEach((s) => g.play(s, g.hands[s][0]));
  g.afterTrick();
  assert.deepStrictEqual(g.scores, [0, 26]);
});

test('reaching 104 ends the game immediately', () => {
  const g = toPlay({ reading: 7, hands: [[C(S, 14)], [C(S, 2)], [C(S, 3)], [C(S, 4)]] });
  g.scores = [100, 50];
  g.tricks = [6, 0];
  [0, 1, 2, 3].forEach((s) => g.play(s, g.hands[s][0]));
  g.afterTrick();
  assert.strictEqual(g.phase, 'gameOver');
  assert.strictEqual(g.winner, 0);
});

test('sardast stays on tie, passes left when behind (old sardast becomes dealer)', () => {
  const g = toPlay({ reading: 7, sardast: 0, hands: [[C(S, 14)], [C(S, 2)], [C(S, 3)], [C(S, 4)]] });
  g.scores = [13, 20];
  g.tricks = [6, 0];
  [0, 1, 2, 3].forEach((s) => g.play(s, g.hands[s][0]));
  g.afterTrick(); // team 0 scores 7 -> 20-20
  assert.deepStrictEqual(g.scores, [20, 20]);
  g.pile = E.freshDeck();
  g.nextRound();
  assert.strictEqual(g.sardast, 0); // tie: stays
  // now behind
  const g2 = toPlay({ reading: 7, sardast: 0, hakem: 1, hands: [[C(S, 2)], [C(S, 14)], [C(S, 3)], [C(S, 4)]] });
  g2.scores = [10, 10]; g2.tricks = [0, 6];
  [0, 1, 2, 3].forEach((s) => g2.play(s, g2.hands[s][0]));
  g2.afterTrick(); // team 1 scores 7
  g2.pile = E.freshDeck();
  g2.nextRound();
  assert.strictEqual(g2.sardast, 1);
  assert.strictEqual(g2.dealer, 0);
});

// ------------------------------------------------------------ shuffling

test('stacked shuffle keeps every card, does only 1-2 cuts', () => {
  const pile = E.fullShuffle();
  for (let i = 0; i < 200; i++) {
    const { deck, cuts } = E.stackedShuffle(pile);
    assert.ok(cuts === 1 || cuts === 2);
    assert.deepStrictEqual(deck.slice().sort((a, b) => a - b), E.freshDeck());
  }
});

test('stacked shuffle preserves the pile order apart from the breaks', () => {
  const pile = E.fullShuffle();
  for (let i = 0; i < 200; i++) {
    const { deck, cuts } = E.stackedShuffle(pile);
    let adjacent = 0; // adjacent pairs of the pile that are still adjacent
    for (let j = 0; j < 51; j++) {
      const at = pile.indexOf(deck[j]);
      if (pile[(at + 1) % 52] === deck[j + 1]) adjacent++;
    }
    // a cyclic rotation keeps 51 pairs per cut region boundary: at most 2 cuts break 2 links
    assert.ok(adjacent >= 51 - cuts, `adjacent ${adjacent}`);
  }
});

test('stacked shuffle yields clumpier hands than a full shuffle (void/long suit counts)', () => {
  const stats = (hands) => {
    let voidsOrLong = 0;
    for (const h of hands) {
      const n = [0, 0, 0, 0];
      h.forEach((c) => n[E.suitOf(c)]++);
      if (n.some((x) => x === 0 || x >= 6)) voidsOrLong++;
    }
    return voidsOrLong;
  };
  let full = 0, stacked = 0, hands = 0;
  for (let i = 0; i < 150; i++) {
    const g = new E.Game();
    g.startRound(); g.finishDraw();
    // play bot rounds so that the pile is shaped by real tricks
    const sim = require('./sim');
    for (let r = 0; r < 3 && g.phase !== 'gameOver'; r++) {
      sim.playBotRound(g);
      if (g.phase === 'roundEnd') {
        g.nextRound();
        stacked += stats(g.hands);
        hands += 4;
        full += stats(E.deal(E.fullShuffle(), 0).hands);
      }
    }
  }
  assert.ok(stacked / hands > full / hands, `stacked ${stacked / hands} vs full ${full / hands}`);
});

test('bot-only games always complete and conserve all 52 cards each round', () => {
  for (let i = 0; i < 25; i++) {
    const g = playGame();
    assert.strictEqual(g.phase, 'gameOver');
    assert.ok(Math.max(...g.scores) >= 104);
    assert.strictEqual(new Set(g.pile).size, 52);
  }
});

test('hakem flow is two steps: discard first (bag), then name hokm', () => {
  const hand = Array.from({ length: 12 }, (_, i) => i);
  const g = setup({ sardast: 1, hands: [[], hand, [], []], yard: [20, 21, 22, 23] });
  g.bid(1, 8); g.bid(2, 0); g.bid(3, 0); g.bid(0, 0);
  assert.strictEqual(g.phase, 'hakem');
  assert.throws(() => g.chooseHokm(1, H), /discard first/);
  assert.throws(() => g.hakemDiscard(2, [0, 1, 2, 3]), /not the hakem|you are not/);
  g.hakemDiscard(1, [0, 1, 2, 3]);
  assert.strictEqual(g.phase, 'hokm');
  assert.strictEqual(g.hands[1].length, 12);
  assert.strictEqual(g.tricks[1], 1);
  assert.strictEqual(g.hokm, null);
  assert.throws(() => g.hakemDiscard(1, [4, 5, 6, 7]));
  assert.throws(() => g.chooseHokm(1, 9));
  assert.throws(() => g.chooseHokm(0, H));
  g.chooseHokm(1, K);
  assert.strictEqual(g.phase, 'play');
  assert.strictEqual(g.hokm, K);
  assert.strictEqual(g.turn, 1); // sardast leads
});
