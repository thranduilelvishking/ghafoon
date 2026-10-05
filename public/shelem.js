'use strict';
// Shelem screens: the lobby options and the game table. It shares the page, the helpers (h, t, send, cardEl, ...) and the
// table markup with app.js, which calls renderShelemOptions() from the lobby and renderShelemGame() in a Shelem room.

const SH_FORMATS = {
  classic: { win: 800, minBid: 100, maxBid: 165, widow: 4 },
  ace: { win: 1000, minBid: 120, maxBid: 185, widow: 4 },
  joker: { win: 1250, minBid: 120, maxBid: 230, widow: 6 },
};
const isJokerCard = (c) => c >= 52;
// numbers with a sign always read left to right, even inside a Persian sentence
const ltr = (x) => `\u2066${x}\u2069`;
const sgn = (n) => ltr(`${n < 0 ? '−' : '+'}${num(Math.abs(n))}`);

let shBid = 0; // the number on the bidding stepper
let shJoker = null; // a Joker the player is about to lead: waiting for the Hokm suit
let shRound = 0;
let shRedeals = 0;

// ------------------------------------------------------------- lobby options

function renderShelemOptions() {
  const box = $('sh-opts');
  const on = S.game === 'shelem' && S.options;
  box.classList.toggle('hidden', !on);
  if (!on) return;
  // a field the host is typing in is left alone, so a re-render cannot take the cursor away
  if (box.contains(document.activeElement) && document.activeElement.tagName === 'INPUT' && document.activeElement.type === 'number') return;
  const o = S.options;
  const host = S.host === S.you;
  const set = (patch) => send({ t: 'options', ...patch });
  const fmtBtn = (key) => h('button', {
    class: `fmt ${o.format === key ? 'on' : ''}`, type: 'button', disabled: !host, 'aria-pressed': String(o.format === key),
    onclick: () => set({ format: key }),
  }, h('b', {}, t('sh.fmt.' + key)), h('span', {}, t(`sh.fmt.${key}.d`)));
  const win = o.target;
  const target = h('input', { type: 'number', min: 200, max: 5000, step: 50, value: win, disabled: !host, dir: 'ltr', 'aria-label': t('sh.target') });
  target.addEventListener('change', () => set({ target: Number(target.value) }));
  box.replaceChildren(
    h('h3', {}, t('sh.opts')),
    h('div', { class: 'fmts', role: 'group', 'aria-label': t('sh.format') }, ['classic', 'ace', 'joker'].map(fmtBtn)),
    h('label', { class: 'opt check', title: t('sh.top.d') },
      h('input', { type: 'checkbox', checked: o.topHokm, disabled: !host, onchange: (e) => set({ topHokm: e.target.checked }) }),
      h('span', {}, h('b', {}, t('sh.top')), h('small', {}, t('sh.top.d')))),
    h('label', { class: 'opt' }, h('b', {}, t('sh.target')), target,
      h('small', {}, t('sh.target.d', { win: num(win), lose: ltr(`−${num(win / 2)}`) }))),
    ...(host ? [] : [h('p', { class: 'sub' }, t('sh.hostOnly'))]));
}

// ------------------------------------------------------------- game

function renderShelemGame() {
  if (S.round !== shRound) { selected = new Set(); shJoker = null; shRound = S.round; }
  if (S.phase !== 'widow') selected = new Set();
  if (S.phase !== 'play' || S.turn !== S.you) shJoker = null;
  if (S.redeals > shRedeals && S.phase === 'bid') toast(t('sh.redeal'), true);
  shRedeals = S.redeals;
  $('g-code').textContent = S.room;
  renderShelemScore();
  renderShelemTable();
  renderShelemStatus();
  renderShelemActions();
  renderShelemHand();
  renderShelemOverlay();
  if (S.phase === 'play' && prevPhase === 'widow' && S.hokm == null) { /* the first card has not been led yet */ }
  if (S.hokm != null && S.firstTrick && S.plays.length === 1 && S.leader === S.plays[0].seat) showShelemBanner();
  prevPhase = S.phase;
}

function showShelemBanner() {
  const b = $('banner');
  b.replaceChildren(
    h('span', { class: 'w' }, t('sh.ban.hokm')),
    h('span', { class: `s ${isRed(S.hokm) ? 'red' : ''}` }, SUITS[S.hokm]),
    h('div', { class: 'by' }, t('sh.ban.by', { name: nm(S.plays[0].seat), suit: suitName(S.hokm) })));
  b.classList.remove('raise', 'long');
  b.classList.add('hidden');
  void b.offsetWidth;
  b.classList.remove('hidden');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => b.classList.add('hidden'), 2400);
}

function renderShelemScore() {
  const my = S.you % 2;
  $('scoreboard').replaceChildren(
    h('div', { class: 'team us' }, h('span', { class: 'lab' }, t('score.us')), h('span', { class: 'big' }, iso(num(S.scores[my])))),
    h('div', { class: 'goal' }, t('score.to', { n: S.target })),
    h('div', { class: 'team them' }, h('span', { class: 'lab' }, t('score.them')), h('span', { class: 'big' }, iso(num(S.scores[1 - my])))),
  );
}

function shSeatPlate(i) {
  const rel = (i - S.you + 4) % 4;
  const info = S.seats[i];
  const badges = [];
  if (i === S.dealer) badges.push(h('span', { class: 'badge dealer' }, t('badge.dealer')));
  if (info.kind === 'bot') badges.push(h('span', { class: 'badge bot' }, t('badge.bot')));
  if (info.kind === 'away') badges.push(h('span', { class: 'badge bot' }, t('badge.away')));
  let chip = null;
  if (S.phase === 'bid') {
    const b = S.bids[i];
    if (b === 0) chip = h('div', { class: 'chip pass' }, t('chip.pass'));
    else if (b != null) chip = h('div', { class: 'chip' }, num(b));
    else if (S.turn === i) chip = h('div', { class: 'chip wait' }, '…');
    if (b != null && b > 0 && !S.passed[i]) chip = h('div', { class: 'chip' }, num(b));
  } else if (S.hakem === i) {
    chip = h('div', { class: 'chip' }, num(S.highest));
  }
  const crown = S.hakem === i && S.phase !== 'bid' ? CROWN() : null;
  const turn = (S.phase === 'bid' || S.phase === 'play') && S.turn === i || (S.phase === 'widow' && S.hakem === i);
  const backs = rel === 0 ? null : h('div', { class: 'backs' }, Array.from({ length: Math.min(S.counts[i], 18) }, () => h('div', { class: 'back' })));
  return h('div', { class: `seat ${POS[rel]}` },
    backs,
    h('div', { class: `plate t${i % 2 === S.you % 2 ? 0 : 1} ${turn ? 'turn' : ''}`, title: crown ? t('crown.title') : null },
      crown || chip ? h('div', { class: 'over' }, crown, chip) : null,
      sayEl(i, 'say'),
      h('div', { class: 'nm' }, dispName(info) + (i === S.you ? t('plate.you') : '')),
      h('div', { class: 'badges' }, badges),
      rel === 0 ? null : h('div', { class: 'cnt' }, t('plate.cards', { n: S.counts[i] })),
    ),
  );
}

function renderShelemTable() {
  const seatAt = [];
  for (let i = 0; i < 4; i++) seatAt[(i - S.you + 4) % 4] = shSeatPlate(i);
  $('trow').replaceChildren(seatAt[2]);
  $('seat-left').replaceChildren(seatAt[1]);
  $('seat-right').replaceChildren(seatAt[3]);
  $('seat-me').replaceChildren(seatAt[0]);

  const center = $('center');
  center.replaceChildren();
  const plays = S.phase === 'trickEnd' && S.lastTrick ? S.lastTrick.plays : S.plays || [];
  for (const p of plays) {
    const rel = (p.seat - S.you + 4) % 4;
    center.append(h('div', { class: `slot ${POS[rel]} ${S.trickWinner === p.seat ? 'win' : ''}` }, cardEl(p.card)));
  }

  const info = $('info');
  info.replaceChildren();
  if (S.hokm != null) {
    info.append(h('div', { class: 'hokm-box' },
      h('div', { class: 'lab' }, t('info.hokm')),
      h('div', { class: `big ${isRed(S.hokm) ? 'red' : ''}` }, SUITS[S.hokm])));
  }
  if (S.hakem != null && S.phase !== 'bid') {
    const my = S.you % 2;
    info.append(h('div', { class: 'tricks-box' },
      h('div', {}, t('sh.info.need', { name: nm(S.hakem), bid: S.highest })),
      h('div', {}, t('sh.info.tricks', { a: S.tricks[my], b: S.tricks[1 - my] }))));
  }
  const last = $('last');
  last.replaceChildren();
  if (S.lastTrick && S.phase === 'play') {
    last.append(t('info.last'), h('div', { class: 'cards' }, S.lastTrick.plays.map((p) => cardEl(p.card, `tiny ${p.seat === S.lastTrick.winner ? 'win' : ''}`))));
  }
}

function shLedSuit() {
  const first = S.plays[0].card;
  return isJokerCard(first) ? S.hokm : suitOf(first);
}

function renderShelemStatus() {
  const me = S.you;
  let msg = '';
  switch (S.phase) {
    case 'bid': msg = S.turn === me ? t('sh.st.myBid') : t('sh.st.theyBid', { name: nm(S.turn) }); break;
    case 'widow':
      msg = S.hakem === me
        ? t('sh.st.widowMe', { bid: S.highest, n: S.widowSize })
        : t('sh.st.widowOther', { name: nm(S.hakem), bid: S.highest });
      break;
    case 'play':
      if (S.turn === me) {
        if (S.plays.length === 0) msg = t(S.firstTrick ? 'sh.st.leadFirst' : 'st.lead');
        else msg = t('st.follow', { suit: suitName(shLedSuit()) });
        if (S.options.topHokm && S.firstTrick && (S.legal || []).length === 1) msg = t('sh.st.mustTop');
        if (COARSE) msg += armed != null ? t('st.tapAgain') : t('st.tapTwice');
      } else if (S.firstTrick && S.plays.length === 0) msg = t('sh.st.leadFirstOther', { name: nm(S.turn) });
      else msg = t('st.theirTurn', { name: nm(S.turn) });
      break;
    case 'trickEnd': msg = t('st.trick', { name: nm(S.trickWinner) }); break;
    default: msg = '';
  }
  $('status').textContent = msg;
  placeStatus();
}

function renderShelemActions() {
  const box = $('actions');
  box.replaceChildren();
  if (S.phase === 'bid' && S.turn === S.you) {
    const f = SH_FORMATS[S.options.format];
    const lo = Math.max(f.minBid, S.highest + 5);
    if (shBid < lo) shBid = lo;
    if (shBid > f.maxBid) shBid = f.maxBid;
    const step = (d) => h('button', {
      class: 'small', type: 'button', disabled: shBid + d < lo || shBid + d > f.maxBid,
      onclick: () => { shBid += d; renderShelemActions(); },
    }, `${d < 0 ? '−' : '+'}${num(Math.abs(d))}`);
    box.append(h('div', { class: 'group' },
      h('span', { class: 'lab' }, t('sh.bid')),
      step(-25), step(-5), h('b', { class: 'bidnum' }, num(shBid)), step(5), step(25),
      h('button', { class: 'primary', type: 'button', disabled: lo > f.maxBid, onclick: () => send({ t: 'bid', value: shBid }) }, t('sh.bidBtn', { n: shBid })),
      h('button', { class: 'bidbtn', type: 'button', onclick: () => send({ t: 'bid', value: 0 }) }, t('sh.pass'))));
  } else if (S.phase === 'widow' && S.hakem === S.you) {
    box.append(h('div', { class: 'group' },
      h('span', { class: 'lab' }, t('sh.putDown', { c: selected.size, n: S.widowSize })),
      h('button', { class: 'primary', disabled: selected.size !== S.widowSize, onclick: () => send({ t: 'discard', discards: [...selected] }) }, t('sh.putBtn'))));
  } else if (shJoker != null) {
    const g = h('div', { class: 'group' }, h('span', { class: 'lab' }, t('sh.jokerSuit')));
    for (let s = 0; s < 4; s++) {
      g.append(h('button', {
        class: `suitbtn ${isRed(s) ? 'red' : ''}`, title: suitName(s),
        onclick: () => { const c = shJoker; shJoker = null; send({ t: 'play', card: c, hokm: s }); },
      }, SUITS[s]));
    }
    g.append(h('button', { class: 'small', onclick: () => { shJoker = null; renderShelemActions(); renderShelemHand(); } }, t('raise.cancel')));
    box.append(g);
  }
}

// hands: Jokers first (they are the top Hokm cards), then the suits, high cards first
const shSortKey = (c) => (isJokerCard(c) ? [-1, -c] : [suitOf(c), -rankOf(c)]);

function renderShelemHand() {
  const box = $('hand');
  const picking = S.phase === 'widow' && S.hakem === S.you;
  const myTurn = S.phase === 'play' && S.turn === S.you;
  const legal = new Set(S.legal || []);
  if (!myTurn || !(S.hand || []).includes(armed)) armed = null;
  box.classList.toggle('pick', picking);
  const cards = (S.hand || []).slice().sort((a, b) => { const x = shSortKey(a); const y = shSortKey(b); return x[0] - y[0] || x[1] - y[1]; });
  const suitKey = (c) => (isJokerCard(c) ? -1 : suitOf(c));
  const els = cards.map((c, idx) => {
    const cls = [];
    let onclick = null;
    if (picking) {
      if (selected.has(c)) cls.push('sel');
      onclick = () => {
        if (selected.has(c)) selected.delete(c);
        else if (selected.size < S.widowSize) selected.add(c);
        renderShelemHand();
        renderShelemActions();
      };
    } else if (myTurn) {
      if (legal.has(c)) {
        cls.push('legal');
        if (armed === c || shJoker === c) cls.push('sel');
        onclick = () => {
          if (COARSE && armed !== c) { armed = c; renderShelemHand(); renderShelemStatus(); return; }
          armed = null;
          if (isJokerCard(c) && S.firstTrick && S.plays.length === 0) { shJoker = c; renderShelemActions(); renderShelemHand(); } // name the suit first
          else send({ t: 'play', card: c });
        };
      } else cls.push('dim');
    }
    const el = cardEl(c, cls.join(' '));
    el.dataset.gap = idx > 0 && suitKey(c) !== suitKey(cards[idx - 1]) ? '1' : '';
    if (onclick) el.addEventListener('click', onclick);
    return el;
  });
  layoutHand(box, els);
}

function renderShelemOverlay() {
  const ov = $('overlay');
  if (S.phase !== 'roundEnd' && S.phase !== 'gameOver') { ov.classList.add('hidden'); return; }
  const r = S.roundResult;
  const my = S.you % 2;
  const us = r.hakemTeam === my;
  const headline = t(`sh.end.${r.outcome}${us ? 'Us' : 'Them'}`, { bid: r.bid });
  const modal = h('div', { class: `modal ${r.outcome === 'shelem' ? 'shelem' : ''}` });
  if (S.phase === 'gameOver') {
    const won = S.winner === my;
    modal.append(h('div', { class: 'big' }, t(won ? 'end.win' : 'end.lose')),
      h('div', { class: 'sub' }, t(won ? 'sh.end.wonSub' : 'sh.end.lostSub')));
  } else modal.append(h('h2', {}, t('end.round', { n: S.round })));
  const col = (team, cls) => h('div', { class: cls },
    h('div', { class: 'sub' }, t(team === my ? 'score.us' : 'score.them')),
    h('div', { class: 'n' }, iso(num(S.scores[team]))),
    h('div', { class: `plus ${r.delta[team] < 0 ? 'minus' : ''}` }, sgn(r.delta[team])));
  modal.append(
    h('div', {}, headline, ' ', t('sh.end.hakemWas', { name: nm(r.hakem) })),
    h('div', { class: 'sub' }, t('sh.end.points', { a: r.totals[my], b: r.totals[1 - my] })),
    h('div', { class: 'vs' }, col(my, 'us'), col(1 - my, 'them')));
  if (S.phase === 'roundEnd') {
    const iReady = S.ready.includes(S.you);
    const waiting = S.seats.map((x, i) => i).filter((i) => S.seats[i].kind === 'human' && !S.ready.includes(i));
    modal.append(h('button', { class: 'primary', disabled: iReady, onclick: () => send({ t: 'ready' }) }, t(iReady ? 'end.waitOthers' : 'end.next')));
    if (iReady && waiting.length) modal.append(h('div', { class: 'sub' }, t('end.waitNames', { names: waiting.map(nm).join(I18N.isFa() ? '، ' : ', ') })));
  } else {
    modal.append(h('button', { class: 'primary', onclick: () => send({ t: 'lobby' }) }, t('end.lobby')),
      h('button', { onclick: leave }, t('end.leave')));
  }
  ov.replaceChildren(modal);
  ov.classList.remove('hidden');
}
