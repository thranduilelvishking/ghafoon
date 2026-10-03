'use strict';
process.env.SIM_BID_SAMPLES = process.env.SIM_BID_SAMPLES || '10'; // quicker bot bidding in tests
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

test('stacked shuffle preserves the pile order apart from the light overhand and the cuts', () => {
  const pile = E.fullShuffle();
  const broken = Math.round(E.MIX_LINKS * 51);
  for (let i = 0; i < 200; i++) {
    const { deck, cuts } = E.stackedShuffle(pile);
    let adjacent = 0; // adjacent pairs of the pile that are still adjacent
    for (let j = 0; j < 51; j++) {
      const at = pile.indexOf(deck[j]);
      if (pile[(at + 1) % 52] === deck[j + 1]) adjacent++;
    }
    assert.ok(adjacent >= 51 - broken - cuts, `adjacent ${adjacent}`);
    assert.ok(adjacent <= 51 - broken + 2, `adjacent ${adjacent}: the overhand should break about ${broken} links`);
  }
});

test('with mix 0 only the cuts disturb the pile', () => {
  const pile = E.fullShuffle();
  for (let i = 0; i < 100; i++) {
    const { deck, cuts } = E.stackedShuffle(pile, undefined, 0);
    let adjacent = 0;
    for (let j = 0; j < 51; j++) if (pile[(pile.indexOf(deck[j]) + 1) % 52] === deck[j + 1]) adjacent++;
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

// ------------------------------------------------------------ Sheet contracts: Saras / Naras / Tak-Naras

const T = (...cards) => cards.map((card, i) => ({ seat: i, card }));

test('saras: no trump, highest card of the led suit wins, off-suit never wins', () => {
  // hearts are NOT trump here, so the 2 of hearts cannot take a spade trick
  assert.strictEqual(E.trickWinner(T(C(S, 5), C(H, 14), C(S, 9), C(S, 7)), null), 2);
  assert.strictEqual(E.trickWinner(T(C(S, 14), C(S, 13), C(K, 14), C(S, 2)), null), 0);
});

test('naras: lowest card of the led suit wins; Ace is high so it loses', () => {
  assert.strictEqual(E.trickWinner(T(C(S, 9), C(S, 3), C(S, 14), C(S, 12)), null, 'naras'), 1);
  assert.strictEqual(E.trickWinner(T(C(S, 14), C(S, 13), C(S, 12), C(S, 11)), null, 'naras'), 3); // Ace is worst
  assert.strictEqual(E.trickWinner(T(C(S, 2), C(S, 3), C(S, 4), C(S, 5)), null, 'naras'), 0); // the 2 is best
});

test('naras: following suit still decides everything (a 2 of clubs cannot beat a 3 of spades)', () => {
  assert.strictEqual(E.trickWinner(T(C(S, 3), C(K, 2), C(S, 8), C(D, 2)), null, 'naras'), 0);
});

test('tak-naras: Ace counts as 1, so it is the best card; then 2, 3 ... King is worst', () => {
  assert.strictEqual(E.trickWinner(T(C(S, 9), C(S, 3), C(S, 14), C(S, 2)), null, 'taknaras'), 2);
  assert.strictEqual(E.trickWinner(T(C(S, 13), C(S, 12), C(S, 11), C(S, 10)), null, 'taknaras'), 3);
  assert.strictEqual(E.trickWinner(T(C(S, 2), C(S, 14), C(K, 14), C(D, 14)), null, 'taknaras'), 1);
});

test('hokm still works the old way when a hokm is given', () => {
  assert.strictEqual(E.trickWinner(T(C(S, 14), C(H, 2), C(S, 13), C(H, 3)), H), 3);
});

function sheetGame(sardast = 0) {
  const hand = Array.from({ length: 12 }, (_, i) => i);
  const g = setup({ sardast, hands: [[], [], [], []].map((_, i) => (i === sardast ? hand : [])), yard: [20, 21, 22, 23] });
  g.bid(sardast, 13);
  g.hakemDiscard(sardast, [0, 1, 2, 3]);
  return g;
}

test('sheet: hakem can choose hokm, saras, naras or tak-naras', () => {
  for (const [contract, mode, hokm] of [['hokm', 'normal', 2], ['saras', 'normal', null], ['naras', 'naras', null], ['taknaras', 'taknaras', null]]) {
    const g = sheetGame();
    g.chooseContract(0, contract, contract === 'hokm' ? 2 : undefined);
    assert.strictEqual(g.phase, 'play');
    assert.strictEqual(g.contract, contract);
    assert.strictEqual(g.mode, mode);
    assert.strictEqual(g.hokm, hokm);
    assert.strictEqual(g.leader, 0); // the hakem leads a sheet
    assert.strictEqual(g.reading, 13);
  }
});

test('contract validation: hokm needs a suit; only a sheet may skip hokm; bad names refused', () => {
  const g = sheetGame();
  assert.throws(() => g.chooseContract(0, 'hokm'));
  assert.throws(() => g.chooseContract(0, 'hokm', 7));
  assert.throws(() => g.chooseContract(0, 'banana'));
  assert.throws(() => g.chooseContract(1, 'naras'), /not the hakem|you are not/);
  // a non-sheet reading cannot go without hokm
  const hand = Array.from({ length: 12 }, (_, i) => i);
  const g2 = setup({ sardast: 0, hands: [hand, [], [], []], yard: [20, 21, 22, 23] });
  g2.bid(0, 12); g2.bid(1, 0); g2.bid(2, 0); g2.bid(3, 0);
  g2.hakemDiscard(0, [0, 1, 2, 3]);
  for (const c of ['saras', 'naras', 'taknaras']) assert.throws(() => g2.chooseContract(0, c), /only a Sheet/);
  g2.chooseContract(0, 'hokm', 1);
  assert.strictEqual(g2.phase, 'play');
});

test('naras sheet: opponents winning a single trick busts the hakem for 26', () => {
  const g = sheetGame();
  g.chooseContract(0, 'naras');
  // set up a trick: the hakem leads the 9 of spades, opponent seat 1 answers with the 4 (lower, so it wins)
  g.hands = [[C(S, 9)], [C(S, 4)], [C(S, 7)], [C(S, 8)]];
  g.tricks = [1, 0];
  [0, 1, 2, 3].forEach((s) => g.play(s, g.hands[s][0]));
  assert.strictEqual(g.trickWinner, 1);
  g.afterTrick();
  assert.strictEqual(g.roundResult.contract, 'naras');
  assert.deepStrictEqual(g.scores, [0, 26]);
});

test('tak-naras sheet made: scores 26 for the hakem team', () => {
  const g = sheetGame();
  g.chooseContract(0, 'taknaras');
  g.hands = [[C(S, 14)], [C(S, 13)], [C(S, 12)], [C(S, 11)]]; // the Ace is the best card
  g.tricks = [12, 0];
  [0, 1, 2, 3].forEach((s) => g.play(s, g.hands[s][0]));
  assert.strictEqual(g.trickWinner, 0);
  g.afterTrick();
  assert.deepStrictEqual(g.scores, [26, 0]);
});

test('following suit is mandatory in every contract', () => {
  for (const contract of ['saras', 'naras', 'taknaras']) {
    const g = sheetGame();
    g.chooseContract(0, contract);
    g.hands = [[C(S, 9)], [C(S, 4), C(H, 2)], [C(S, 7)], [C(S, 8)]];
    g.play(0, C(S, 9));
    assert.throws(() => g.play(1, C(H, 2)), /follow suit/);
  }
});

// ------------------------------------------------------------ the Hakem raises the reading

// seat 0 is Hakem with `reading`, play has started, `tricks` is [hakem team, opponents]
function raiseGame({ reading = 10, tricks = [1, 0], hakem = 0 } = {}) {
  const g = toPlay({ reading, hakem, hands: [[C(S, 14), C(S, 2)], [C(S, 13), C(S, 3)], [C(S, 12), C(S, 4)], [C(S, 11), C(S, 5)]], hokm: H });
  g.tricks = tricks.slice();
  g.trickLog = [];
  return g;
}

test('raise options start above the current reading and stop at what is still reachable', () => {
  const g = raiseGame({ reading: 10, tricks: [1, 0] });
  assert.deepStrictEqual(g.raiseOptions(0), [11, 12, 13]);
  // opponents already hold 2 tricks: 12 would need them to hold fewer than 2, so only 11 is possible
  g.tricks = [4, 2];
  assert.deepStrictEqual(g.raiseOptions(0), [11]);
  assert.throws(() => g.declareRaise(0, 12), /cannot reach/);
  // 3 tricks for the opponents: 10 already busts at 4, and nothing above 10 is reachable
  g.tricks = [4, 3];
  assert.deepStrictEqual(g.raiseOptions(0), []);
  assert.strictEqual(g.canRaise(0), false);
});

test('raise options never include the current reading or anything lower', () => {
  for (const reading of [7, 9, 10, 12]) {
    const g = raiseGame({ reading, tricks: [1, 0] });
    for (const o of g.raiseOptions(0)) assert.ok(o > reading);
    assert.throws(() => g.declareRaise(0, reading), /higher/);
    assert.throws(() => g.declareRaise(0, reading - 1), /higher/);
  }
  assert.deepStrictEqual(raiseGame({ reading: 13, tricks: [1, 0] }).raiseOptions(0), []);
  assert.deepStrictEqual(raiseGame({ reading: 12, tricks: [1, 0] }).raiseOptions(0), [13]);
  assert.deepStrictEqual(raiseGame({ reading: 12, tricks: [1, 1] }).raiseOptions(0), []);
});

test('only the Hakem can raise, and only once, only during play', () => {
  const g = raiseGame();
  assert.throws(() => g.declareRaise(1, 11), /only the hakem/);
  assert.throws(() => g.declareRaise(2, 11), /only the hakem/); // not even the Hakem's partner
  g.declareRaise(0, 11);
  assert.strictEqual(g.phase, 'raiseVote');
  assert.throws(() => g.declareRaise(0, 12), /once|cannot raise/);
  // no cards can be played while the vote is open
  assert.throws(() => g.play(0, C(S, 14)), /not play phase/);
  const r = raiseGame();
  r.phase = 'reading';
  assert.throws(() => r.declareRaise(0, 11), /cannot raise/);
  assert.strictEqual(r.canRaise(0), false);
});

test('one YES makes the raise stand even if the other opponent says NO', () => {
  for (const order of [[1, 3], [3, 1]]) {
    const g = raiseGame({ reading: 10 });
    g.declareRaise(0, 12);
    g.voteRaise(order[0], false);
    assert.strictEqual(g.phase, 'raiseVote'); // still waiting for the other opponent
    g.voteRaise(order[1], true);
    assert.strictEqual(g.phase, 'play');
    assert.strictEqual(g.reading, 12);
    assert.strictEqual(g.originalReading, 10);
    assert.deepStrictEqual(g.lastRaise, { from: 10, to: 12, accepted: true });
  }
});

test('a YES from either opponent is enough straight away', () => {
  const g = raiseGame({ reading: 10 });
  g.declareRaise(0, 11);
  g.voteRaise(3, true);
  assert.strictEqual(g.phase, 'play');
  assert.strictEqual(g.reading, 11);
  assert.throws(() => g.voteRaise(1, true), /no raise/);
});

test('both NO: the round ends at once and the Hakem team scores the ORIGINAL reading', () => {
  const g = raiseGame({ reading: 10, tricks: [3, 1] });
  g.scores = [5, 5];
  g.declareRaise(0, 12);
  g.voteRaise(1, false);
  assert.strictEqual(g.phase, 'raiseVote');
  g.voteRaise(3, false);
  assert.strictEqual(g.phase, 'roundEnd');
  assert.strictEqual(g.reading, 10);
  assert.deepStrictEqual(g.scores, [15, 5]);
  assert.strictEqual(g.roundResult.outcome, 'made');
  assert.strictEqual(g.roundResult.raiseRefused, true);
  assert.strictEqual(g.roundResult.refusedTo, 12);
  assert.strictEqual(g.roundResult.points, 10);
});

test('only the opponents vote, each once', () => {
  const g = raiseGame();
  g.declareRaise(0, 11);
  assert.throws(() => g.voteRaise(0, true), /only the opponents/);
  assert.throws(() => g.voteRaise(2, true), /only the opponents/);
  g.voteRaise(1, false);
  assert.throws(() => g.voteRaise(1, true), /already/);
});

test('after an accepted raise the made / bust thresholds follow the new reading', () => {
  // reading 10 raised to 12: the opponents now bust the Hakem with 14 - 12 = 2 tricks (it was 4)
  const g = raiseGame({ reading: 10, tricks: [3, 1] });
  g.declareRaise(0, 12);
  g.voteRaise(1, true);
  g.hands = [[C(S, 2)], [C(S, 14)], [C(S, 3)], [C(S, 4)]]; // seat 1 will take this trick: opponents 1 -> 2 tricks
  g.plays = []; g.turn = 0;
  [0, 1, 2, 3].forEach((s) => g.play(s, g.hands[s][0]));
  assert.strictEqual(g.pendingEnd, 'busted');
  g.afterTrick();
  assert.strictEqual(g.roundResult.reading, 12);
  assert.strictEqual(g.roundResult.raisedFrom, 10);
  assert.deepStrictEqual(g.scores, [0, 24]); // opponents score twice the raised reading
});

test('an accepted raise that the Hakem then makes scores the raised reading', () => {
  const g = raiseGame({ reading: 10, tricks: [10, 0] });
  g.declareRaise(0, 12);
  g.voteRaise(3, true);
  g.tricks = [11, 0];
  g.hands = [[C(S, 14)], [C(S, 2)], [C(S, 3)], [C(S, 4)]];
  g.plays = []; g.turn = 0;
  [0, 1, 2, 3].forEach((s) => g.play(s, g.hands[s][0]));
  assert.strictEqual(g.pendingEnd, 'made'); // 12 tricks reached
  g.afterTrick();
  assert.deepStrictEqual(g.scores, [12, 0]);
});

test('raising to ALL (13) turns the round into a sheet for scoring: 26 either way', () => {
  const g = raiseGame({ reading: 10, tricks: [3, 0] });
  g.declareRaise(0, 13);
  g.voteRaise(1, true);
  assert.strictEqual(g.reading, 13);
  g.hands = [[C(S, 2)], [C(S, 14)], [C(S, 3)], [C(S, 4)]];
  g.plays = []; g.turn = 0;
  [0, 1, 2, 3].forEach((s) => g.play(s, g.hands[s][0]));
  g.afterTrick(); // opponents took a trick: bust at 14 - 13 = 1
  assert.deepStrictEqual(g.scores, [0, 26]);
});

test('a raise can be made between tricks (during trickEnd) and resumes there', () => {
  const g = raiseGame({ reading: 8, tricks: [3, 1] });
  g.hands = [[C(S, 14)], [C(S, 2)], [C(S, 3)], [C(S, 4)]];
  g.plays = []; g.turn = 0;
  [0, 1, 2, 3].forEach((s) => g.play(s, g.hands[s][0]));
  assert.strictEqual(g.phase, 'trickEnd');
  assert.strictEqual(g.canRaise(0), true);
  g.declareRaise(0, 10);
  g.voteRaise(1, true);
  assert.strictEqual(g.phase, 'trickEnd');
  assert.strictEqual(g.reading, 10);
});

test('no raise once the round is already decided (made or bust pending)', () => {
  const g = raiseGame({ reading: 8, tricks: [7, 0] });
  g.hands = [[C(S, 14)], [C(S, 2)], [C(S, 3)], [C(S, 4)]];
  g.plays = []; g.turn = 0;
  [0, 1, 2, 3].forEach((s) => g.play(s, g.hands[s][0]));
  assert.strictEqual(g.pendingEnd, 'made');
  assert.strictEqual(g.canRaise(0), false);
  assert.throws(() => g.declareRaise(0, 9), /cannot raise/);
});

test('refusing a raise mid-trick still collects all 52 cards for the next shuffle', () => {
  const g = new E.Game();
  g.startRound();
  while (g.phase === 'draw') g.finishDraw();
  g.bid(g.turn, 7);
  for (let i = 0; i < 3; i++) g.bid(g.turn, 0);
  const hakem = g.hakem;
  g.hakemDiscard(hakem, g.hands[hakem].slice(0, 4));
  g.chooseContract(hakem, 'hokm', 1);
  // play two cards of the first trick, then raise and get refused
  g.play(g.turn, E.legalCards(g.hands[g.turn], g.plays)[0]);
  g.play(g.turn, E.legalCards(g.hands[g.turn], g.plays)[0]);
  assert.strictEqual(g.phase, 'play');
  g.declareRaise(hakem, 8);
  for (const o of g.opponentsOfHakem()) g.voteRaise(o, false);
  assert.strictEqual(g.phase, 'roundEnd');
  assert.strictEqual(new Set(g.pile).size, 52);
  assert.strictEqual(g.pile.length, 52);
  g.nextRound(); // and the next round starts fine
  assert.strictEqual(g.phase, 'reading');
});
