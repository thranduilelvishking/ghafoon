'use strict';
// Ghafoon browser client. The server is authoritative; this renders the last state it sent.

const SUITS = ['♠', '♥', '♣', '♦'];
const SUIT_NAMES = ['Spades', 'Hearts', 'Clubs', 'Diamonds'];
const isRed = (s) => s === 1 || s === 3;
const suitOf = (c) => (c / 13) | 0;
const rankOf = (c) => (c % 13) + 2;
const RANK_LABEL = { 14: 'A', 13: 'K', 12: 'Q', 11: 'J' };
const rankLabel = (r) => RANK_LABEL[r] || String(r);
const POS = ['p0', 'p1', 'p2', 'p3'];
const CONTRACT_INFO = {
  hokm: { label: 'Hokm', rule: 'Trump suit: name one suit as Hokm.' },
  saras: { label: 'Saras', rule: 'No trump. The highest card of the led suit wins.' },
  naras: { label: 'Naras', rule: 'No trump. The lowest card of the led suit wins (Ace is high, so it loses).' },
  taknaras: { label: 'Tak-Naras', rule: 'No trump. The lowest card wins and the Ace counts as 1, so the Ace wins.' },
};
const SHORT_RULE = { saras: 'highest wins', naras: 'lowest wins', taknaras: 'lowest wins, Ace = 1' }; // relative to me: bottom, left, top, right

const $ = (id) => document.getElementById(id);

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

// ------------------------------------------------------------- connection

let ws = null;
let S = null; // last state
let session = load(); // { room, token }
let pendingJoin = null;
let retry = 0;
let selected = new Set();
let pickedHokm = null;
let pickedContract = null;
let drawAnim = null;
let drawTimer = null;
let lastRound = 0;

function load() {
  try { return JSON.parse(localStorage.getItem('ghafoon-session')) || null; } catch (e) { return null; }
}
function save(s) {
  session = s;
  try { s ? localStorage.setItem('ghafoon-session', JSON.stringify(s)) : localStorage.removeItem('ghafoon-session'); } catch (e) { /* storage unavailable */ }
}
function myName() {
  const n = $('name').value.trim();
  try { localStorage.setItem('ghafoon-name', n); } catch (e) { /* ignore */ }
  return n;
}
// Returns the name, or shows a hint and returns '' when the player has not typed one.
function requireName() {
  const n = myName();
  if (!n) {
    $('home-msg').textContent = 'Pick a name first';
    $('name').focus();
  }
  return n;
}

function connect(then) {
  if (ws && ws.readyState <= 1) { if (then) { ws.readyState === 1 ? then() : (pendingJoin = then); } return; }
  pendingJoin = then || null;
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  ws.onopen = () => {
    retry = 0;
    if (pendingJoin) { const f = pendingJoin; pendingJoin = null; f(); }
    else if (session) send({ t: 'join', room: session.room, token: session.token, name: myName() });
  };
  ws.onmessage = (e) => onMessage(JSON.parse(e.data));
  ws.onclose = () => {
    if (session) {
      retry++;
      setTimeout(() => connect(), Math.min(5000, 400 * retry));
      if (S) toast('Connection lost, reconnecting…');
    }
  };
}
function send(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }

function onMessage(m) {
  if (m.t === 'joined') {
    save({ room: m.room, token: m.token });
    history.replaceState(null, '', `#${m.room}`);
  } else if (m.t === 'state') {
    S = m;
    render();
  } else if (m.t === 'error') {
    if (m.fatal) {
      save(null);
      S = null;
      history.replaceState(null, '', location.pathname);
      render();
      $('home-msg').textContent = m.msg;
    } else toast(m.msg);
  } else if (m.t === 'left') {
    save(null);
    S = null;
    history.replaceState(null, '', location.pathname);
    render();
  }
}

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.add('hidden'), 2600);
}

// ------------------------------------------------------------- home / lobby actions

$('name').value = (() => { try { return localStorage.getItem('ghafoon-name') || ''; } catch (e) { return ''; } })();
$('btn-solo').onclick = () => { const name = requireName(); if (name) connect(() => send({ t: 'join', create: true, solo: true, name })); };
$('btn-create').onclick = () => { const name = requireName(); if (name) connect(() => send({ t: 'join', create: true, name })); };
$('btn-join').onclick = () => {
  const name = requireName();
  if (!name) return;
  const room = $('code').value.trim().toUpperCase();
  if (room.length !== 4) { $('home-msg').textContent = 'Enter the 4-letter room code'; return; }
  connect(() => send({ t: 'join', room, name }));
};
$('name').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-create').click(); });
$('name').addEventListener('input', () => { $('home-msg').textContent = ''; });
$('lobby-name').addEventListener('change', () => {
  const n = $('lobby-name').value.trim();
  if (!n) return;
  try { localStorage.setItem('ghafoon-name', n); } catch (e) { /* ignore */ }
  send({ t: 'rename', name: n });
});
$('code').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-join').click(); });
$('btn-copy').onclick = () => {
  const el = $('share-link');
  el.select();
  (navigator.clipboard ? navigator.clipboard.writeText(el.value) : Promise.reject()).catch(() => document.execCommand('copy'));
  toast('Link copied');
};
$('btn-start').onclick = () => send({ t: 'start' });
const leave = () => send({ t: 'leave' });
$('btn-leave-lobby').onclick = leave;
$('btn-leave').onclick = () => { if (confirm('Leave the game? A bot will take your seat.')) leave(); };

// ------------------------------------------------------------- rendering

function show(id) {
  for (const s of ['home', 'lobby', 'game']) $(s).classList.toggle('hidden', s !== id);
}

function render() {
  if (!S) {
    show('home');
    $('overlay').classList.add('hidden');
    return;
  }
  if (S.mode === 'lobby') { renderLobby(); return; }
  show('game');
  renderGame();
}

function renderLobby() {
  show('lobby');
  $('overlay').classList.add('hidden');
  $('lobby-code').textContent = S.room;
  $('share-link').value = `${location.origin}/#${S.room}`;
  const nameBox = $('lobby-name');
  if (document.activeElement !== nameBox) nameBox.value = S.seats[S.you].name;

  // Same view as the game: you at the bottom, your partner across, opponents left and right.
  const myTeam = S.you % 2;
  const seatEls = S.seats.map((s, i) => {
    const rel = (i - S.you + 4) % 4;
    const me = i === S.you;
    const mine = i % 2 === myTeam;
    const role = me ? 'You' : rel === 2 ? 'Your partner' : 'Opponent';
    return h('div', {
      class: `lseat ${POS[rel]} ${mine ? 'us' : 'them'} ${s.kind === 'empty' ? 'empty' : ''} ${me ? 'me' : ''}`,
      role: s.kind === 'empty' ? 'button' : null,
      tabindex: s.kind === 'empty' ? '0' : null,
      onclick: s.kind === 'empty' ? () => send({ t: 'sit', seat: i }) : null,
    },
      h('div', { class: 'role' }, role),
      h('div', { class: 'nm' }, s.kind === 'empty' ? 'Empty' : s.name),
      h('div', { class: 'sub' }, s.kind === 'empty' ? 'Bot, tap to sit' : s.kind === 'human' ? 'Player' : s.kind),
    );
  });
  const partnerSeat = (S.you + 2) % 4;
  const named = (i) => (S.seats[i].kind === 'empty' ? 'bot' : S.seats[i].name);
  const mid = h('div', { class: 'lmid' },
    h('div', { class: 'vsline us' }, `${S.seats[S.you].name} + ${named(partnerSeat)}`),
    h('div', { class: 'vs' }, 'vs'),
    h('div', { class: 'vsline them' }, `${named((S.you + 1) % 4)} + ${named((S.you + 3) % 4)}`));
  $('lobby-seats').replaceChildren(...seatEls, mid);

  const host = S.host === S.you;
  $('btn-start').disabled = !host;
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  $('lobby-msg').textContent = local
    ? `You are on ${location.host}, so this link only works on your own PC. Friends can open your public address instead and type the code ${S.room}.`
    : host ? '' : 'Waiting for the host to start…';
}

const nameOf = (i) => S.seats[i].name;
const teamClass = (i) => (i % 2 === S.you % 2 ? 'us' : 'them');

function cardEl(c, cls = '') {
  const s = suitOf(c);
  return h('div', { class: `card ${isRed(s) ? 'red' : ''} ${cls}`, 'data-c': c },
    h('div', { class: 'corner' }, h('span', { class: 'r' }, rankLabel(rankOf(c))), h('span', { class: 's' }, SUITS[s])),
    h('span', { class: 'pip' }, SUITS[s]));
}

let prevPhase = null;

function renderGame() {
  if (S.round !== lastRound) { selected = new Set(); pickedHokm = null; pickedContract = null; lastRound = S.round; }
  if (S.phase !== 'hakem') selected = new Set();
  if (S.phase !== 'hokm') { pickedHokm = null; pickedContract = null; }
  $('g-code').textContent = S.room;
  renderScore();
  renderTable();
  renderStatus();
  renderActions();
  renderHand();
  renderOverlay();
  if (S.phase === 'play' && (prevPhase === 'hokm' || prevPhase === 'hakem') && S.contract != null) showHokmBanner();
  prevPhase = S.phase;
}

let bannerTimer = null;
function showHokmBanner() {
  const b = $('banner');
  if (S.contract === 'hokm') {
    b.replaceChildren(
      h('span', { class: 'w' }, 'Hokm'),
      h('span', { class: `s ${isRed(S.hokm) ? 'red' : ''}` }, SUITS[S.hokm]),
      h('div', { class: 'by' }, `${nameOf(S.hakem)} named ${SUIT_NAMES[S.hokm]}`));
  } else {
    const c = CONTRACT_INFO[S.contract];
    b.replaceChildren(
      h('span', { class: 'w' }, c.label),
      h('div', { class: 'rule' }, c.rule),
      h('div', { class: 'by' }, `${nameOf(S.hakem)} plays Sheet`));
  }
  b.classList.toggle('long', S.contract !== 'hokm');
  b.classList.add('hidden');
  void b.offsetWidth; // restart the animation
  b.classList.remove('hidden');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => b.classList.add('hidden'), S.contract === 'hokm' ? 2700 : 3600);
}

function renderScore() {
  const my = S.you % 2;
  const mine = S.scores[my];
  const theirs = S.scores[1 - my];
  $('scoreboard').replaceChildren(
    h('div', { class: 'team us' }, h('span', { class: 'lab' }, 'Us'), h('span', { class: 'big' }, mine)),
    h('div', { class: 'goal' }, 'to 104'),
    h('div', { class: 'team them' }, h('span', { class: 'lab' }, 'Them'), h('span', { class: 'big' }, theirs)),
  );
}

const CROWN = () => {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 34 26');
  svg.setAttribute('class', 'crown');
  svg.setAttribute('aria-label', 'Hakem');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', 'M3 21 L1.5 6 L10 13 L17 2 L24 13 L32.5 6 L31 21 Z');
  path.setAttribute('fill', '#f2c94c');
  path.setAttribute('stroke', '#a87b0f');
  path.setAttribute('stroke-width', '1.6');
  path.setAttribute('stroke-linejoin', 'round');
  const band = document.createElementNS(ns, 'rect');
  band.setAttribute('x', '3'); band.setAttribute('y', '21'); band.setAttribute('width', '28'); band.setAttribute('height', '4');
  band.setAttribute('rx', '1.5'); band.setAttribute('fill', '#d4a017'); band.setAttribute('stroke', '#a87b0f'); band.setAttribute('stroke-width', '1.2');
  svg.append(path, band);
  return svg;
};

function seatPlate(i) {
  const rel = (i - S.you + 4) % 4;
  const info = S.seats[i];
  const badges = [];
  if (i === S.sardast) badges.push(h('span', { class: 'badge sardast' }, 'Sardast'));
  if (i === S.dealer) badges.push(h('span', { class: 'badge dealer' }, 'Dealer'));
  if (info.kind === 'bot') badges.push(h('span', { class: 'badge bot' }, 'Bot'));
  if (info.kind === 'away') badges.push(h('span', { class: 'badge bot' }, 'Away, bot'));

  // big, bold reading above the bubble while reading; afterwards only the Hakem keeps theirs, with a crown
  const hakemKnown = S.hakem != null && S.phase !== 'reading' && S.phase !== 'draw';
  let chip = null;
  if (S.phase === 'reading' || S.phase === 'draw') {
    const b = S.bids[i];
    if (b == null) { if (S.turn === i && S.phase === 'reading') chip = h('div', { class: 'chip wait' }, '…'); }
    else if (b === 0) chip = h('div', { class: 'chip pass' }, 'PASS');
    else if (b === 13) chip = h('div', { class: 'chip sheet' }, 'SHEET');
    else chip = h('div', { class: 'chip' }, b);
  } else if (hakemKnown && i === S.hakem) {
    chip = S.reading === 13 ? h('div', { class: 'chip sheet' }, 'SHEET') : h('div', { class: 'chip' }, S.reading);
  }
  const crown = hakemKnown && i === S.hakem ? CROWN() : null;

  const turn = ((S.phase === 'reading' || S.phase === 'play') && S.turn === i) || ((S.phase === 'hakem' || S.phase === 'hokm') && S.hakem === i);
  const backs = rel === 0 ? null : h('div', { class: 'backs' }, Array.from({ length: Math.min(S.counts[i], 16) }, () => h('div', { class: 'back' })));
  return h('div', { class: `seat ${POS[rel]}` },
    backs,
    h('div', { class: `plate t${i % 2 === S.you % 2 ? 0 : 1} ${turn ? 'turn' : ''}`, title: crown ? 'Hakem' : null },
      crown || chip ? h('div', { class: 'over' }, crown, chip) : null,
      h('div', { class: 'nm' }, info.name + (i === S.you ? ' (you)' : '')),
      h('div', { class: 'badges' }, badges),
      rel === 0 ? null : h('div', { class: 'cnt' }, `${S.counts[i]} cards`),
    ),
  );
}

function renderTable() {
  const seatAt = [];
  for (let i = 0; i < 4; i++) seatAt[(i - S.you + 4) % 4] = seatPlate(i);
  $('trow').replaceChildren(seatAt[2]);
  $('seat-left').replaceChildren(seatAt[1]);
  $('seat-right').replaceChildren(seatAt[3]);
  $('seat-me').replaceChildren(seatAt[0]);

  const center = $('center');
  center.replaceChildren();
  if (S.phase === 'draw' && S.draw) {
    center.append(...drawPiles());
  } else {
    const plays = S.phase === 'trickEnd' && S.lastTrick ? S.lastTrick.plays : S.plays || [];
    for (const p of plays) {
      const rel = (p.seat - S.you + 4) % 4;
      center.append(h('div', { class: `slot ${POS[rel]} ${S.trickWinner === p.seat ? 'win' : ''}` }, cardEl(p.card)));
    }
  }

  // info panel
  const info = $('info');
  info.replaceChildren();
  if (S.contract === 'hokm') {
    info.append(h('div', { class: 'hokm-box' },
      h('div', { class: 'lab' }, 'Hokm'),
      h('div', { class: `big ${isRed(S.hokm) ? 'red' : ''}` }, `${SUITS[S.hokm]} ${SUIT_NAMES[S.hokm]}`)));
  } else if (S.contract) {
    info.append(h('div', { class: 'hokm-box', title: CONTRACT_INFO[S.contract].rule },
      h('div', { class: 'lab' }, SHORT_RULE[S.contract]),
      h('div', { class: 'big' }, CONTRACT_INFO[S.contract].label)));
  }
  if (S.hakem != null && S.reading && S.phase !== 'reading' && S.phase !== 'draw') {
    const hteam = S.hakem % 2;
    const need = S.reading;
    const bust = 14 - S.reading;
    const mineIsHakem = hteam === S.you % 2;
    const hk = mineIsHakem ? 'us' : 'them';
    const ok = mineIsHakem ? 'them' : 'us';
    info.append(h('div', { class: 'tricks-box', title: 'The bag counts as a trick for the hakem team' },
      h('div', {}, `${nameOf(S.hakem)} reads ${need === 13 ? 'Sheet' : need}`),
      h('div', { class: hk }, `${mineIsHakem ? 'Us' : 'Them'} (hakem): ${S.tricks[hteam]} / ${need}`),
      h('div', { class: ok }, `${mineIsHakem ? 'Them' : 'Us'} (bust): ${S.tricks[1 - hteam]} / ${bust}`),
    ));
  } else if (S.round > 1 && S.shuffleInfo && S.shuffleInfo.kind === 'stacked' && S.phase === 'reading') {
    info.append(h('div', { class: 'tricks-box' }, `Stacks kept, cut ${S.shuffleInfo.cuts}×`));
  }

  const last = $('last');
  last.replaceChildren();
  if (S.lastTrick && S.phase === 'play') {
    last.append('Last trick', h('div', { class: 'cards' }, S.lastTrick.plays.map((p) => cardEl(p.card, `tiny ${p.seat === S.lastTrick.winner ? 'win' : ''}`))));
  }
}

function drawPiles() {
  const reveals = S.draw.reveals;
  if (!drawAnim || drawAnim.round !== S.round) {
    drawAnim = { round: S.round, start: Date.now(), step: Math.max(60, Math.min(260, 4200 / reveals.length)) };
  }
  const n = Math.min(reveals.length, Math.floor((Date.now() - drawAnim.start) / drawAnim.step) + 1);
  if (n < reveals.length && !drawTimer) drawTimer = setInterval(() => { if (S && S.phase === 'draw') renderTable(); else stopDrawTimer(); }, 80);
  if (n >= reveals.length && !drawAnim.done) { drawAnim.done = true; stopDrawTimer(); renderStatus(); }
  const piles = [[], [], [], []];
  reveals.slice(0, n).forEach((r) => piles[r.seat].push(r.card));
  const els = piles.map((cards, i) => {
    const rel = (i - S.you + 4) % 4;
    return h('div', { class: `dslot ${POS[rel]}` }, h('div', { class: 'drawpile' }, cards.map((c) => cardEl(c, 'mini'))));
  });
  return els;
}
function stopDrawTimer() { clearInterval(drawTimer); drawTimer = null; }

function renderStatus() {
  const me = S.you;
  let msg = '';
  let msg0 = '';
  switch (S.phase) {
    case 'draw':
      msg = drawAnim && S.draw && drawAnim.round === S.round && drawAnim.done
        ? `${nameOf(S.draw.seat)} gets the first Ace and reads first`
        : 'Drawing for the first Ace…';
      break;
    case 'reading': msg = S.turn === me ? 'Your turn to read' : `${nameOf(S.turn)} is reading…`; break;
    case 'hakem':
      msg = S.hakem === me
        ? `You are the Hakem with ${S.reading === 13 ? 'Sheet' : S.reading}${S.forced ? ' (forced 7)' : ''}: pick 4 cards for the bag, then press Discard`
        : `${nameOf(S.hakem)} is picking the bag…`;
      break;
    case 'hokm':
      msg = S.hakem === me
        ? (S.reading === 13 ? 'Sheet! Choose how to play: Hokm, Naras, Saras or Tak-Naras' : 'Now pick the Hokm suit and press Hokm')
        : (S.reading === 13 ? `${nameOf(S.hakem)} is choosing: Hokm, Naras, Saras or Tak-Naras…` : `${nameOf(S.hakem)} is choosing Hokm…`);
      break;
    case 'play':
      if (S.contract && S.contract !== 'hokm') msg0 = `${CONTRACT_INFO[S.contract].label}: ${SHORT_RULE[S.contract]}. `;
      if (S.turn === me) {
        msg = S.plays.length ? `Your turn: follow ${SUIT_NAMES[suitOf(S.plays[0].card)]} if you can` : 'Your lead: play any card';
        if (COARSE) msg += armed != null ? ' (tap again to play)' : ' (tap a card twice)';
      } else msg = `${nameOf(S.turn)} to play`;
      break;
    case 'trickEnd': msg = `${nameOf(S.trickWinner)} takes the trick`; break;
    default: msg = '';
  }
  $('status').textContent = msg0 + msg;
}

function renderActions() {
  const box = $('actions');
  box.replaceChildren();
  if (S.phase === 'reading' && S.turn === S.you) {
    const g = h('div', { class: 'group' }, h('span', { class: 'lab' }, 'Read:'));
    for (let v = 7; v <= 12; v++) g.append(h('button', { class: 'bidbtn', disabled: v <= S.highest, onclick: () => send({ t: 'bid', value: v }) }, v));
    g.append(h('button', { class: 'bidbtn', disabled: 13 <= S.highest, onclick: () => send({ t: 'bid', value: 13 }) }, 'Sheet'));
    g.append(h('button', { class: 'bidbtn', onclick: () => send({ t: 'bid', value: 0 }) }, 'Pass'));
    box.append(g);
  } else if (S.phase === 'hakem' && S.hakem === S.you) {
    box.append(h('div', { class: 'group' },
      h('span', { class: 'lab' }, `Bag: ${selected.size} / 4 cards`),
      h('button', { class: 'primary', disabled: selected.size !== 4, onclick: () => send({ t: 'discard', discards: [...selected] }) }, 'Discard')));
  } else if (S.phase === 'hokm' && S.hakem === S.you) {
    const sheet = S.reading === 13;
    if (!sheet) pickedContract = 'hokm';
    const suitRow = () => {
      const g = h('div', { class: 'group' }, h('span', { class: 'lab' }, 'Hokm suit:'));
      for (let s = 0; s < 4; s++) {
        g.append(h('button', {
          class: `suitbtn ${isRed(s) ? 'red' : ''} ${pickedHokm === s ? 'on' : ''}`,
          title: SUIT_NAMES[s],
          onclick: () => { pickedHokm = s; renderActions(); },
        }, SUITS[s]));
      }
      return g;
    };
    if (sheet) {
      const g = h('div', { class: 'group' });
      for (const key of ['hokm', 'naras', 'saras', 'taknaras']) {
        g.append(h('button', {
          class: `cbtn ${pickedContract === key ? 'on' : ''}`,
          onclick: () => { pickedContract = key; renderActions(); },
        }, CONTRACT_INFO[key].label));
      }
      box.append(g);
    }
    if (pickedContract === 'hokm') box.append(suitRow());
    const ready = pickedContract != null && (pickedContract !== 'hokm' || pickedHokm != null);
    const label = pickedContract ? CONTRACT_INFO[pickedContract].label : 'Choose';
    const go = h('button', {
      class: 'primary', disabled: !ready,
      onclick: () => send({ t: 'contract', contract: pickedContract, hokm: pickedContract === 'hokm' ? pickedHokm : undefined }),
    }, sheet ? `Play ${label}` : 'Hokm');
    box.append(go);
    if (sheet && pickedContract) box.append(h('div', { class: 'hint' }, CONTRACT_INFO[pickedContract].rule));
  }
}

const COARSE = window.matchMedia && matchMedia('(pointer: coarse)').matches;
let armed = null; // touch screens: first tap raises a card, second tap plays it
const SUIT_GAP = 6;

function renderHand() {
  const box = $('hand');
  const picking = S.phase === 'hakem' && S.hakem === S.you;
  const myTurn = S.phase === 'play' && S.turn === S.you;
  const legal = new Set(S.legal || []);
  if (!myTurn || !(S.hand || []).includes(armed)) armed = null;
  box.classList.toggle('pick', picking);
  const cards = (S.hand || []).slice().sort((a, b) => suitOf(a) - suitOf(b) || rankOf(b) - rankOf(a));
  const els = cards.map((c, idx) => {
    const cls = [];
    let onclick = null;
    if (picking) {
      if (selected.has(c)) cls.push('sel');
      onclick = () => {
        if (selected.has(c)) selected.delete(c);
        else if (selected.size < 4) selected.add(c);
        renderHand();
        renderActions();
      };
    } else if (myTurn) {
      if (legal.has(c)) {
        cls.push('legal');
        if (armed === c) cls.push('sel');
        onclick = () => {
          if (COARSE && armed !== c) { armed = c; renderHand(); renderStatus(); } else { armed = null; send({ t: 'play', card: c }); }
        };
      } else cls.push('dim');
    }
    const el = cardEl(c, cls.join(' '));
    el.dataset.gap = idx > 0 && suitOf(c) !== suitOf(cards[idx - 1]) ? '1' : '';
    if (onclick) el.addEventListener('click', onclick);
    return el;
  });
  layoutHand(box, els);
}

// Lay the hand out in one row, or two when 16 cards would be squeezed too tightly to tap.
function layoutHand(box, els) {
  box.replaceChildren();
  if (!els.length) return;
  const row1 = h('div', { class: 'hrow' }, els);
  box.append(row1);
  const cw = els[0].getBoundingClientRect().width || 50;
  const avail = box.clientWidth - 12;
  const maxStep = cw * 0.72;
  const stepFor = (list) => {
    const gaps = list.filter((e) => e.dataset.gap).length * SUIT_GAP;
    return list.length > 1 ? (avail - cw - gaps) / (list.length - 1) : maxStep;
  };
  const apply = (list) => {
    const step = Math.min(maxStep, stepFor(list));
    list.forEach((e, i) => { e.style.marginLeft = i === 0 ? '0' : `${step - cw + (e.dataset.gap ? SUIT_GAP : 0)}px`; });
  };
  if (els.length > 9 && stepFor(els) < cw * 0.55) {
    // split near the middle, preferring a suit boundary
    let mid = Math.ceil(els.length / 2);
    for (let d = 0; d <= 3; d++) {
      const k = [mid - d, mid + d].find((x) => x > 2 && x < els.length - 2 && els[x].dataset.gap);
      if (k) { mid = k; break; }
    }
    const a = els.slice(0, mid);
    const b = els.slice(mid);
    row1.replaceChildren(...a);
    box.append(h('div', { class: 'hrow' }, b));
    box.classList.add('two');
    [a, b].forEach((list) => { list[0].dataset.gap = ''; apply(list); });
  } else {
    box.classList.remove('two');
    apply(els);
  }
}

function renderOverlay() {
  const ov = $('overlay');
  if (S.phase !== 'roundEnd' && S.phase !== 'gameOver') { ov.classList.add('hidden'); return; }
  const r = S.roundResult;
  const my = S.you % 2;
  const usScored = r.scoringTeam === my;
  const hakemUs = r.hakemTeam === my;
  const reading = r.reading === 13 ? 'Sheet' : r.reading;
  const headline = r.outcome === 'made'
    ? `${hakemUs ? 'Your team' : 'Opponents'} made ${reading}`
    : `${hakemUs ? 'Your team was busted' : 'Opponents busted'} on ${reading}`;
  const modal = h('div', { class: 'modal' });
  if (S.phase === 'gameOver') {
    const won = S.winner === my;
    modal.append(h('div', { class: 'big' }, won ? '🏆 You win!' : 'You lose'),
      h('div', { class: 'sub' }, won ? 'Your team reached 104 first.' : 'The opponents reached 104 first.'));
  } else modal.append(h('h2', {}, `Round ${S.round}`));
  modal.append(
    h('div', {}, headline, ` (${nameOf(r.hakem)} was Hakem)`),
    h('div', { class: 'sub' }, `Tricks: us ${r.tricks[my]}, them ${r.tricks[1 - my]} (bag included)`),
    h('div', { class: 'vs' },
      h('div', { class: 'us' }, h('div', { class: 'sub' }, 'Us'), h('div', { class: 'n' }, S.scores[my]), usScored ? h('div', { class: 'plus' }, `+${r.points}`) : null),
      h('div', { class: 'them' }, h('div', { class: 'sub' }, 'Them'), h('div', { class: 'n' }, S.scores[1 - my]), !usScored ? h('div', { class: 'plus' }, `+${r.points}`) : null)),
  );
  if (S.phase === 'roundEnd') {
    const iReady = S.ready.includes(S.you);
    const waiting = S.seats.map((s, i) => i).filter((i) => S.seats[i].kind === 'human' && !S.ready.includes(i));
    modal.append(h('button', { class: 'primary', disabled: iReady, onclick: () => send({ t: 'ready' }) }, iReady ? 'Waiting for others…' : 'Next round'));
    if (iReady && waiting.length) modal.append(h('div', { class: 'sub' }, `Waiting for ${waiting.map(nameOf).join(', ')}`));
  } else {
    modal.append(h('button', { class: 'primary', onclick: () => send({ t: 'lobby' }) }, 'Back to lobby'),
      h('button', { onclick: leave }, 'Leave room'));
  }
  ov.replaceChildren(modal);
  ov.classList.remove('hidden');
}

// ------------------------------------------------------------- phones: orientation, sleep, wake lock

window.addEventListener('resize', () => { if (S && S.mode === 'game') renderHand(); });
let wakeLock = null;
async function keepAwake() {
  try {
    if (!('wakeLock' in navigator) || wakeLock || !S || S.mode !== 'game') return;
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch (e) { wakeLock = null; }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (session && (!ws || ws.readyState > 1)) connect(); // phones suspend sockets in the background
  keepAwake();
});
document.addEventListener('pointerdown', keepAwake, { passive: true });

// ------------------------------------------------------------- boot

(function boot() {
  const hash = location.hash.replace('#', '').toUpperCase();
  if (session && (!hash || hash === session.room)) {
    connect();
  } else if (hash.length === 4) {
    $('code').value = hash;
    $('home-msg').textContent = 'Enter your name and press Join room';
  }
  render();
})();
