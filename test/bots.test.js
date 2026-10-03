'use strict';
const test = require('node:test');
const assert = require('node:assert');
const E = require('../server/engine');
const bots = require('../server/bots');

const C = (suit, rank) => E.makeCard(suit, rank);
const S = 0, H = 1, K = 2, D = 3; // hokm is hearts in these tests

function ctx(over) {
  return { hokm: H, hakem: 0, reading: 8, tricks: [1, 0], played: new Set(), trickLog: [], ...over };
}

test('void bot does not ruff when partner is almost surely winning (K of spades, A already gone)', () => {
  // seat 0 (partner) led K♠, seat 1 played a low spade, I'm seat 2 and void in spades; seat 3 still to play
  const hand = [C(H, 3), C(K, 2), C(D, 5)];
  const played = new Set([C(S, 14)]);
  const card = bots.choosePlay(ctx({
    seat: 2, hand, played,
    plays: [{ seat: 0, card: C(S, 13) }, { seat: 1, card: C(S, 4) }],
  }));
  assert.notStrictEqual(E.suitOf(card), H, 'should not trump partner’s winner');
});

test('void bot still ruffs when partner is likely to lose the trick', () => {
  // partner led Q♠ with A♠ and K♠ unseen and two opponents behind... (only one behind here, but both unseen)
  const hand = [C(H, 3), C(K, 2), C(D, 5)];
  const card = bots.choosePlay(ctx({
    seat: 1, hand,
    plays: [{ seat: 3, card: C(S, 12) }], // partner of seat 1 is seat 3
  }));
  assert.strictEqual(E.suitOf(card), H, 'should ruff');
});

test('void bot ruffs when an opponent behind is known to be void (would ruff partner)', () => {
  // seat 3 showed out of spades earlier, so partner's K♠ is not safe
  const hand = [C(H, 3), C(H, 9), C(K, 2)];
  const trickLog = [{ plays: [{ seat: 2, card: C(S, 5) }, { seat: 3, card: C(D, 2) }, { seat: 0, card: C(S, 9) }, { seat: 1, card: C(S, 3) }], winner: 0 }];
  const played = new Set([C(S, 14), C(S, 5), C(D, 2), C(S, 9), C(S, 3)]);
  const card = bots.choosePlay(ctx({
    seat: 2, hand, played, trickLog,
    plays: [{ seat: 0, card: C(S, 13) }, { seat: 1, card: C(S, 4) }],
  }));
  assert.strictEqual(E.suitOf(card), H, 'should ruff because seat 3 can ruff too');
});

test('bot plays low when its partner is already winning and it is last', () => {
  const hand = [C(S, 14), C(S, 2)];
  const card = bots.choosePlay(ctx({
    seat: 3, hand,
    plays: [{ seat: 0, card: C(S, 10) }, { seat: 1, card: C(S, 3) }, { seat: 2, card: C(S, 12) }],
  }));
  // partner of seat 3 is seat 1 who is not winning (seat 2 played Q), so the bot should win cheaply with the ace
  assert.strictEqual(card, C(S, 14));
});
