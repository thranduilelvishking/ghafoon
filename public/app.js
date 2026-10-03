'use strict';
// Ghafoon browser client. The server is authoritative; this renders the last state it sent.

const SUITS = ['♠', '♥', '♣', '♦'];
const isRed = (s) => s === 1 || s === 3;
const suitOf = (c) => (c / 13) | 0;
const rankOf = (c) => (c % 13) + 2;
const rankLabel = (r) => I18N.rankLabel(r);
const POS = ['p0', 'p1', 'p2', 'p3']; // relative to me: bottom, left, top, right

// ---- language (the texts live in i18n.js; Persian is the default, English the alternative)
I18N.init();
const { t, num } = I18N;
const iso = (x) => (I18N.isFa() ? `\u2068${x}\u2069` : String(x)); // isolates names so Latin letters cannot scramble a Persian sentence
const dispName = (s) => (s.kind === 'bot' ? I18N.botName(s.name) : s.name);
const cLabel = (k) => t('c.' + k);
const cRule = (k) => t('c.' + k + '.rule');
const cShort = (k) => t('c.' + k + '.short');
const lab = (n) => I18N.numLabel(n);
const rdLabel = (n, raised) => I18N.readingLabel(n, raised);
const suitName = (s) => I18N.suitName(s);

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
let raiseOpen = false;
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
    $('home-msg').textContent = t('home.needName');
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
      if (S) toast(t('conn.lost'));
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
      $('home-msg').textContent = I18N.errorText(m.msg);
    } else toast(I18N.errorText(m.msg));
  } else if (m.t === 'chatLog') {
    chatMsgs = m.msgs.slice();
    chatUnread = 0;
    renderChat();
  } else if (m.t === 'chat') {
    onChat(m.msg);
  } else if (m.t === 'notice') {
    toast(I18N.NOTICE_KEYS[m.code] ? t(I18N.NOTICE_KEYS[m.code], { name: iso(m.name) }) : m.msg, true);
  } else if (m.t === 'left') {
    chatMsgs = []; chatUnread = 0; setChatOpen(false);
    save(null);
    S = null;
    history.replaceState(null, '', location.pathname);
    render();
  }
}

function toast(msg, info) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.toggle('notice', !!info);
  el.classList.remove('hidden');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.add('hidden'), 2600);
}

// ------------------------------------------------------------- home / lobby actions

$('name').value = (() => { try { return localStorage.getItem('ghafoon-name') || ''; } catch (e) { return ''; } })();
$('btn-solo').onclick = () => { const name = requireName(); if (name) connect(() => send({ t: 'join', create: true, solo: true, name })); };
$('btn-create').onclick = () => { const name = requireName(); if (name) connect(() => send({ t: 'join', create: true, name })); };
$('btn-join').onclick = () => {
  const name = requireName();
  if (!name) return;
  const room = $('code').value.trim().toUpperCase();
  if (room.length !== 4) { $('home-msg').textContent = t('home.needCode'); return; }
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
  toast(t('lobby.copied'));
};
$('btn-start').onclick = () => send({ t: 'start' });
const leave = () => send({ t: 'leave' });
$('btn-leave-lobby').onclick = leave;
$('btn-leave').onclick = () => { if (confirm(t('game.leaveConfirm'))) leave(); };

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

  // Four fixed slots, the same for everybody: bottom A, top B (partners), left C, right D (partners).
  // The game screen turns the table so that you are at the bottom, but the lobby never moves.
  const seatEls = S.seats.map((s, i) => {
    const me = i === S.you;
    const team = i % 2 === 0 ? 'ta' : 'tb';
    const empty = s.kind === 'empty';
    const asksMe = S.swapIn.includes(i);
    const iAsked = S.swapOut === i;
    const kids = [
      h('div', { class: 'role' }, t('lobby.seatLine', { seat: iso(I18N.seatLetter(i)), team: iso(I18N.teamLabel(i)) }) + (i === S.host ? t('lobby.hostTag') : '')),
      h('div', { class: 'nm' }, empty ? t('lobby.empty') : dispName(s)),
    ];
    if (empty) kids.push(h('div', { class: 'sub' }, t('lobby.botHere')));
    else if (me) kids.push(h('div', { class: 'sub you' }, t('lobby.you')));
    else if (asksMe) {
      kids.push(h('div', { class: 'sub ask' }, t('lobby.wantsSwap')),
        h('div', { class: 'swap-row' },
          h('button', { class: 'small yes', onclick: (e) => { e.stopPropagation(); send({ t: 'swapReply', seat: i, accept: true }); } }, t('lobby.accept')),
          h('button', { class: 'small', onclick: (e) => { e.stopPropagation(); send({ t: 'swapReply', seat: i, accept: false }); } }, t('lobby.decline'))));
    } else if (iAsked) {
      kids.push(h('div', { class: 'sub' }, t('lobby.waitAnswer')),
        h('button', { class: 'small', onclick: (e) => { e.stopPropagation(); send({ t: 'swapCancel' }); } }, t('lobby.cancel')));
    } else {
      kids.push(h('button', { class: 'small', onclick: (e) => { e.stopPropagation(); send({ t: 'swap', seat: i }); } }, t('lobby.askSwap')));
    }
    return h('div', {
      class: `lseat p${i} ${team} ${empty ? 'empty' : ''} ${me ? 'me' : ''} ${asksMe ? 'asks' : ''}`,
      role: empty ? 'button' : null,
      tabindex: empty ? '0' : null,
      onclick: empty ? () => send({ t: 'sit', seat: i }) : null,
      onkeydown: empty ? (e) => { if (e.key === 'Enter' || e.key === ' ') send({ t: 'sit', seat: i }); } : null,
    }, kids);
  });
  const nmL = (i) => iso(S.seats[i].kind === 'empty' ? t('word.bot') : dispName(S.seats[i]));
  const mid = h('div', { class: 'lmid' },
    h('div', { class: 'vsline ta' }, `${nmL(0)} + ${nmL(2)}`),
    h('div', { class: 'vs' }, t('lobby.vsWord')),
    h('div', { class: 'vsline tb' }, `${nmL(1)} + ${nmL(3)}`));
  $('lobby-seats').replaceChildren(...seatEls, mid);

  const host = S.host === S.you;
  $('btn-start').disabled = !host;
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  $('lobby-msg').textContent = local
    ? t('lobby.localWarn', { host: iso(location.host), code: iso(S.room) })
    : host ? t('lobby.youHost') : t('lobby.waitHost', { name: iso(S.seats[S.host] ? dispName(S.seats[S.host]) : t('lobby.theHost')) });
}

const nameOf = (i) => dispName(S.seats[i]);
const nm = (i) => iso(nameOf(i)); // for use inside a sentence

function cardEl(c, cls = '') {
  const s = suitOf(c);
  const face = rankLabel(rankOf(c));
  return h('div', { class: `card ${isRed(s) ? 'red' : ''} ${cls}`, 'data-c': c },
    h('div', { class: 'corner' }, h('span', { class: `r${face.length > 2 ? ' long' : ''}` }, face), h('span', { class: 's' }, SUITS[s])),
    h('span', { class: 'pip' }, SUITS[s]));
}

let prevPhase = null;

function renderGame() {
  if (S.round !== lastRound) { selected = new Set(); pickedHokm = null; pickedContract = null; lastRound = S.round; }
  if (S.phase !== 'hakem') selected = new Set();
  if (S.phase !== 'hokm') { pickedHokm = null; pickedContract = null; }
  if (!S.canRaise) raiseOpen = false;
  $('g-code').textContent = S.room;
  renderScore();
  renderTable();
  renderStatus();
  renderActions();
  renderHand();
  renderOverlay();
  if (S.phase === 'play' && (prevPhase === 'hokm' || prevPhase === 'hakem') && S.contract != null) showHokmBanner();
  if (S.phase === 'raiseVote' && prevPhase !== 'raiseVote') showRaiseBanner('declared');
  else if (prevPhase === 'raiseVote' && S.phase !== 'raiseVote' && S.lastRaise && S.lastRaise.accepted) showRaiseBanner('accepted');
  prevPhase = S.phase;
}

let bannerTimer = null;
function showHokmBanner() {
  const b = $('banner');
  if (S.contract === 'hokm') {
    b.replaceChildren(
      h('span', { class: 'w' }, t('ban.hokm')),
      h('span', { class: `s ${isRed(S.hokm) ? 'red' : ''}` }, SUITS[S.hokm]),
      h('div', { class: 'by' }, t('ban.named', { name: nm(S.hakem), suit: suitName(S.hokm) })));
  } else {
    b.replaceChildren(
      h('span', { class: 'w' }, cLabel(S.contract)),
      h('div', { class: 'rule' }, cRule(S.contract)),
      h('div', { class: 'by' }, t('ban.sheetBy', { name: nm(S.hakem) })));
  }
  b.classList.remove('raise');
  b.classList.toggle('long', S.contract !== 'hokm');
  b.classList.add('hidden');
  void b.offsetWidth; // restart the animation
  b.classList.remove('hidden');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => b.classList.add('hidden'), S.contract === 'hokm' ? 2700 : 3600);
}

function showRaiseBanner(kind) {
  const b = $('banner');
  const r = S.raise || S.lastRaise;
  if (!r) return;
  if (kind === 'declared') {
    b.replaceChildren(
      h('span', { class: 'w' }, t('ban.raise')),
      h('div', { class: 'big-num' }, `${lab(r.from)} → ${lab(r.to)}`),
      h('div', { class: 'by' }, t('ban.raises', { name: nm(S.hakem) })));
  } else {
    b.replaceChildren(
      h('span', { class: 'w' }, t('ban.raiseOk')),
      h('div', { class: 'big-num' }, lab(r.to)),
      h('div', { class: 'by' }, t('ban.needs', { name: nm(S.hakem), n: r.to })));
  }
  b.classList.add('long', 'raise');
  b.classList.add('hidden');
  void b.offsetWidth;
  b.classList.remove('hidden');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => { b.classList.add('hidden'); b.classList.remove('raise'); }, 2800);
}

function renderScore() {
  const my = S.you % 2;
  const mine = S.scores[my];
  const theirs = S.scores[1 - my];
  $('scoreboard').replaceChildren(
    h('div', { class: 'team us' }, h('span', { class: 'lab' }, t('score.us')), h('span', { class: 'big' }, num(mine))),
    h('div', { class: 'goal' }, t('score.to', { n: 104 })),
    h('div', { class: 'team them' }, h('span', { class: 'lab' }, t('score.them')), h('span', { class: 'big' }, num(theirs))),
  );
}

const CROWN = () => {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 34 26');
  svg.setAttribute('class', 'crown');
  svg.setAttribute('aria-label', t('crown.title'));
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
  if (i === S.sardast) badges.push(h('span', { class: 'badge sardast' }, t('badge.sardast')));
  if (i === S.dealer) badges.push(h('span', { class: 'badge dealer' }, t('badge.dealer')));
  if (info.kind === 'bot') badges.push(h('span', { class: 'badge bot' }, t('badge.bot')));
  if (info.kind === 'away') badges.push(h('span', { class: 'badge bot' }, t('badge.away')));

  // big, bold reading above the bubble while reading; afterwards only the Hakem keeps theirs, with a crown
  const hakemKnown = S.hakem != null && S.phase !== 'reading' && S.phase !== 'draw';
  let chip = null;
  if (S.phase === 'reading' || S.phase === 'draw') {
    const b = S.bids[i];
    if (b == null) { if (S.turn === i && S.phase === 'reading') chip = h('div', { class: 'chip wait' }, '…'); }
    else if (b === 0) chip = h('div', { class: 'chip pass' }, t('chip.pass'));
    else if (b === 13) chip = h('div', { class: 'chip sheet' }, t('chip.sheet'));
    else chip = h('div', { class: 'chip' }, num(b));
  } else if (hakemKnown && i === S.hakem) {
    chip = S.reading === 13 ? h('div', { class: 'chip sheet' }, t('chip.sheet')) : h('div', { class: 'chip' }, num(S.reading));
  }
  if (S.phase === 'raiseVote' && S.raise) {
    if (i === S.hakem) chip = h('div', { class: 'chip raise' }, `${lab(S.raise.from)} → ${lab(S.raise.to)}`);
    else if (S.raise.votes[i] === true) chip = h('div', { class: 'chip yes' }, t('chip.yes'));
    else if (S.raise.votes[i] === false) chip = h('div', { class: 'chip no' }, t('chip.no'));
    else if (i % 2 !== S.hakem % 2) chip = h('div', { class: 'chip wait' }, '…');
  }
  const crown = hakemKnown && i === S.hakem ? CROWN() : null;
  const plus = i === S.you && S.canRaise
    ? h('button', {
      class: `plus-btn ${raiseOpen ? 'on' : ''}`, title: t('raise.plus'), 'aria-label': t('raise.plus'),
      onclick: () => { raiseOpen = !raiseOpen; renderActions(); renderTable(); },
    }, raiseOpen ? '×' : '+')
    : null;

  const turn = ((S.phase === 'reading' || S.phase === 'play') && S.turn === i) || ((S.phase === 'hakem' || S.phase === 'hokm') && S.hakem === i);
  const backs = rel === 0 ? null : h('div', { class: 'backs' }, Array.from({ length: Math.min(S.counts[i], 16) }, () => h('div', { class: 'back' })));
  return h('div', { class: `seat ${POS[rel]}` },
    backs,
    h('div', { class: `plate t${i % 2 === S.you % 2 ? 0 : 1} ${turn ? 'turn' : ''}`, title: crown ? t('crown.title') : null },
      crown || chip || plus ? h('div', { class: 'over' }, crown, chip, plus) : null,
      bubbles[i] && bubbles[i].until > Date.now() ? h('div', { class: 'say' }, bubbles[i].text) : null,
      h('div', { class: 'nm' }, dispName(info) + (i === S.you ? t('plate.you') : '')),
      h('div', { class: 'badges' }, badges),
      rel === 0 ? null : h('div', { class: 'cnt' }, t('plate.cards', { n: S.counts[i] })),
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
      h('div', { class: 'lab' }, t('info.hokm')),
      h('div', { class: `big ${isRed(S.hokm) ? 'red' : ''}` }, `${SUITS[S.hokm]} ${suitName(S.hokm)}`)));
  } else if (S.contract) {
    info.append(h('div', { class: 'hokm-box', title: cRule(S.contract) },
      h('div', { class: 'lab' }, cShort(S.contract)),
      h('div', { class: 'big' }, cLabel(S.contract))));
  }
  if (S.hakem != null && S.reading && S.phase !== 'reading' && S.phase !== 'draw') {
    const hteam = S.hakem % 2;
    const need = S.reading;
    const bust = 14 - S.reading;
    const mineIsHakem = hteam === S.you % 2;
    const hk = mineIsHakem ? 'us' : 'them';
    const ok = mineIsHakem ? 'them' : 'us';
    const who = (mine) => t(mine ? 'score.us' : 'score.them');
    info.append(h('div', { class: 'tricks-box', title: t('info.bagTitle') },
      h('div', {}, t('info.reads', { name: nm(S.hakem), r: rdLabel(need, S.originalReading != null) }) + (S.originalReading != null ? t('info.raisedFrom', { n: S.originalReading }) : '')),
      h('div', { class: hk }, t('info.hakemLine', { who: who(mineIsHakem), a: S.tricks[hteam], n: need })),
      h('div', { class: ok }, t('info.bustLine', { who: who(!mineIsHakem), a: S.tricks[1 - hteam], n: bust })),
    ));
  } else if (S.round > 1 && S.shuffleInfo && S.shuffleInfo.kind === 'stacked' && S.phase === 'reading') {
    info.append(h('div', { class: 'tricks-box' }, t('info.shuffle', { n: S.shuffleInfo.cuts })));
  }

  const last = $('last');
  last.replaceChildren();
  if (S.lastTrick && S.phase === 'play') {
    last.append(t('info.last'), h('div', { class: 'cards' }, S.lastTrick.plays.map((p) => cardEl(p.card, `tiny ${p.seat === S.lastTrick.winner ? 'win' : ''}`))));
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
        ? t('st.drawDone', { name: nm(S.draw.seat) })
        : t('st.draw');
      break;
    case 'reading': msg = S.turn === me ? t('st.myRead') : t('st.theyRead', { name: nm(S.turn) }); break;
    case 'hakem':
      msg = S.hakem === me
        ? t('st.hakemMe', { r: rdLabel(S.reading), forced: S.forced ? t('st.forced') : '' })
        : t('st.hakemOther', { name: nm(S.hakem) });
      break;
    case 'hokm':
      msg = S.hakem === me
        ? t(S.reading === 13 ? 'st.hokmMeSheet' : 'st.hokmMe')
        : t(S.reading === 13 ? 'st.hokmOtherSheet' : 'st.hokmOther', { name: nm(S.hakem) });
      break;
    case 'play':
      if (S.contract && S.contract !== 'hokm') msg0 = t('st.contractLine', { label: cLabel(S.contract), rule: cShort(S.contract) });
      if (S.turn === me) {
        msg = S.plays.length ? t('st.follow', { suit: suitName(suitOf(S.plays[0].card)) }) : t('st.lead');
        if (COARSE) msg += armed != null ? t('st.tapAgain') : t('st.tapTwice');
      } else msg = t('st.theirTurn', { name: nm(S.turn) });
      break;
    case 'raiseVote': {
      const r = S.raise;
      if (S.canVote) msg = t('st.voteMe', { name: nm(S.hakem), a: lab(r.from), b: lab(r.to) });
      else if (me === S.hakem) msg = t('st.voteHakem');
      else if (me % 2 !== S.hakem % 2) msg = r.votes[me] === false ? t('st.voteSaidNo') : t('st.voteWait');
      else msg = t('st.votePartner', { name: nm(S.hakem), a: lab(r.from), b: lab(r.to) });
      break;
    }
    case 'trickEnd': msg = t('st.trick', { name: nm(S.trickWinner) }); break;
    default: msg = '';
  }
  $('status').textContent = msg0 + msg;
}

function renderActions() {
  const box = $('actions');
  box.replaceChildren();
  if (S.phase === 'raiseVote' && S.canVote) {
    const r = S.raise;
    box.append(
      h('div', { class: 'group' },
        h('button', { class: 'votebtn yes', onclick: () => send({ t: 'vote', yes: true }) }, t('raise.yes')),
        h('button', { class: 'votebtn no', onclick: () => send({ t: 'vote', yes: false }) }, t('raise.no'))),
      h('div', { class: 'hint' },
        t('raise.yesHint', { to: r.to, need: 14 - r.to, tricks: t(14 - r.to === 1 ? 'unit.trick' : 'unit.tricks'), was: 14 - r.from, name: nm(S.hakem), from: r.from })));
    return;
  }
  if (raiseOpen && S.canRaise) {
    const g = h('div', { class: 'group' }, h('span', { class: 'lab raise-lab' }, t('raise.to')));
    for (const n of S.raiseOptions) {
      g.append(h('button', {
        class: `raisebtn ${n === 13 ? 'all' : ''}`,
        onclick: () => { raiseOpen = false; send({ t: 'raise', to: n }); },
      }, lab(n)));
    }
    g.append(h('button', { class: 'small', onclick: () => { raiseOpen = false; renderActions(); renderTable(); } }, t('raise.cancel')));
    box.append(g, h('div', { class: 'hint' },
      t('raise.hint', { r: S.reading })));
    return;
  }
  if (S.phase === 'reading' && S.turn === S.you) {
    const g = h('div', { class: 'group' }, h('span', { class: 'lab' }, t('act.read')));
    for (let v = 7; v <= 12; v++) g.append(h('button', { class: 'bidbtn', disabled: v <= S.highest, onclick: () => send({ t: 'bid', value: v }) }, num(v)));
    g.append(h('button', { class: 'bidbtn', disabled: 13 <= S.highest, onclick: () => send({ t: 'bid', value: 13 }) }, t('act.sheet')));
    g.append(h('button', { class: 'bidbtn', onclick: () => send({ t: 'bid', value: 0 }) }, t('act.pass')));
    box.append(g);
  } else if (S.phase === 'hakem' && S.hakem === S.you) {
    box.append(h('div', { class: 'group' },
      h('span', { class: 'lab' }, t('act.bag', { n: selected.size })),
      h('button', { class: 'primary', disabled: selected.size !== 4, onclick: () => send({ t: 'discard', discards: [...selected] }) }, t('act.discard'))));
  } else if (S.phase === 'hokm' && S.hakem === S.you) {
    const sheet = S.reading === 13;
    if (!sheet) pickedContract = 'hokm';
    const suitRow = () => {
      const g = h('div', { class: 'group' }, h('span', { class: 'lab' }, t('act.hokmSuit')));
      for (let s = 0; s < 4; s++) {
        g.append(h('button', {
          class: `suitbtn ${isRed(s) ? 'red' : ''} ${pickedHokm === s ? 'on' : ''}`,
          title: suitName(s),
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
        }, cLabel(key)));
      }
      box.append(g);
    }
    if (pickedContract === 'hokm') box.append(suitRow());
    const ready = pickedContract != null && (pickedContract !== 'hokm' || pickedHokm != null);
    const label = pickedContract ? cLabel(pickedContract) : t('act.choose');
    const go = h('button', {
      class: 'primary', disabled: !ready,
      onclick: () => send({ t: 'contract', contract: pickedContract, hokm: pickedContract === 'hokm' ? pickedHokm : undefined }),
    }, sheet ? t('act.play', { label }) : t('act.hokmBtn'));
    box.append(go);
    if (sheet && pickedContract) box.append(h('div', { class: 'hint' }, cRule(pickedContract)));
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
  const raised = r.raisedFrom != null;
  const note = raised ? t('end.raisedNote', { n: r.raisedFrom }) : '';
  const headline = r.raiseRefused
    ? t(hakemUs ? 'end.refusedUs' : 'end.refusedThem', { to: lab(r.refusedTo), r: r.reading })
    : r.outcome === 'made'
      ? t(hakemUs ? 'end.madeUs' : 'end.madeThem', { r: I18N.readingPoss(r.reading, raised), note })
      : t(hakemUs ? 'end.bustUs' : 'end.bustThem', { r: rdLabel(r.reading, raised), note });
  const modal = h('div', { class: 'modal' });
  if (S.phase === 'gameOver') {
    const won = S.winner === my;
    modal.append(h('div', { class: 'big' }, t(won ? 'end.win' : 'end.lose')),
      h('div', { class: 'sub' }, t(won ? 'end.won104' : 'end.lost104')));
  } else modal.append(h('h2', {}, t('end.round', { n: S.round })));
  modal.append(
    h('div', {}, headline, ' ', t('end.hakemWas', { name: nm(r.hakem) })),
    h('div', { class: 'sub' }, t('end.tricks', { a: r.tricks[my], b: r.tricks[1 - my] })),
    h('div', { class: 'vs' },
      h('div', { class: 'us' }, h('div', { class: 'sub' }, t('score.us')), h('div', { class: 'n' }, num(S.scores[my])), usScored ? h('div', { class: 'plus' }, `+${num(r.points)}`) : null),
      h('div', { class: 'them' }, h('div', { class: 'sub' }, t('score.them')), h('div', { class: 'n' }, num(S.scores[1 - my])), !usScored ? h('div', { class: 'plus' }, `+${num(r.points)}`) : null)),
  );
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

// ------------------------------------------------------------- chat

let chatMsgs = [];
let chatUnread = 0;
let chatOpen = false;
const bubbles = {}; // seat -> { text, until }
const QUICK = ['q.nice', 'q.oops', 'q.lead', 'q.gg'];

function setChatBadge() {
  document.querySelectorAll('.chat-btn .badge-n').forEach((b) => {
    b.textContent = chatUnread > 9 ? '9+' : String(chatUnread);
    b.classList.toggle('hidden', chatUnread === 0);
  });
}

function renderChat() {
  const log = $('chat-log');
  log.replaceChildren(...chatMsgs.map((m) => h('div', { class: `cm ${S && m.seat === S.you && m.name === S.seats[S.you].name ? 'mine' : ''}` },
    h('span', { class: 'cn' }, m.name), h('span', { class: 'ct' }, m.text))));
  if (!chatMsgs.length) log.append(h('div', { class: 'chat-empty' }, t('chat.empty')));
  log.scrollTop = log.scrollHeight;
  setChatBadge();
}

function onChat(m) {
  chatMsgs.push(m);
  if (chatMsgs.length > 60) chatMsgs.shift();
  const mine = S && m.seat === S.you && S.seats[S.you] && m.name === S.seats[S.you].name;
  if (!chatOpen && !mine) chatUnread++;
  renderChat();
  if (S && S.mode === 'game') {
    bubbles[m.seat] = { text: m.text, until: Date.now() + 6000 };
    renderTable();
    setTimeout(() => { if (S && S.mode === 'game') renderTable(); }, 6100);
  }
}

function setChatOpen(open) {
  chatOpen = open;
  $('chat').classList.toggle('hidden', !open);
  if (open) {
    chatUnread = 0;
    setChatBadge();
    renderChat();
    if (!COARSE) $('chat-input').focus();
  }
}
document.querySelectorAll('.chat-btn').forEach((b) => b.addEventListener('click', () => setChatOpen(!chatOpen)));
$('chat-close').addEventListener('click', () => setChatOpen(false));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && chatOpen) setChatOpen(false); });
$('chat-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = $('chat-input').value.trim();
  if (!text) return;
  send({ t: 'chat', text });
  $('chat-input').value = '';
});
function renderQuick() {
  $('chat-quick').replaceChildren(...QUICK.map((k) => h('button', { class: 'small', type: 'button', onclick: () => send({ t: 'chat', text: t(k) }) }, t(k))));
}
renderQuick();

// ------------------------------------------------------------- language switch (flags) and settings

const FLAGS = [['fa', 'flags/ir-lion-sun.svg', 'فارسی'], ['en', 'flags/us.svg', 'English']];
function renderLangSwitches() {
  document.querySelectorAll('[data-lang-switch]').forEach((box) => {
    box.replaceChildren(...FLAGS.map(([code, src, name]) => h('button', {
      class: `flag-btn ${I18N.lang() === code ? 'on' : ''}`, type: 'button', title: name, 'aria-label': name,
      'aria-pressed': String(I18N.lang() === code), onclick: () => I18N.setLang(code),
    }, h('img', { src, alt: '', width: 36, height: 24, draggable: 'false' }))));
  });
}
function setSettingsOpen(open) { $('settings').classList.toggle('hidden', !open); }
document.querySelectorAll('.gear').forEach((b) => b.addEventListener('click', () => setSettingsOpen($('settings').classList.contains('hidden'))));
$('settings-close').addEventListener('click', () => setSettingsOpen(false));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setSettingsOpen(false); });
$('set-faces').checked = I18N.faceFa();
$('set-faces').addEventListener('change', () => I18N.setFaceFa($('set-faces').checked));
I18N.onChange(() => {
  renderLangSwitches();
  renderQuick();
  renderChat();
  $('set-faces').checked = I18N.faceFa();
  $('home-msg').textContent = '';
  if (S) render();
});
renderLangSwitches();

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
    $('home-msg').textContent = t('home.nameAndJoin');
  }
  render();
})();
