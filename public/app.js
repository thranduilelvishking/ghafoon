'use strict';
// Ghafoon browser client. The server is authoritative; this renders the last state it sent.

const SUITS = ['♠', '♥', '♣', '♦'];
const SUIT_NAMES = ['Spades', 'Hearts', 'Clubs', 'Diamonds'];
const isRed = (s) => s === 1 || s === 3;
const suitOf = (c) => (c / 13) | 0;
const rankOf = (c) => (c % 13) + 2;
const RANK_LABEL = { 14: 'A', 13: 'K', 12: 'Q', 11: 'J' };
const rankLabel = (r) => RANK_LABEL[r] || String(r);
const POS = ['p0', 'p1', 'p2', 'p3']; // relative to me: bottom, left, top, right

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
  return n || 'Player';
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
$('btn-solo').onclick = () => connect(() => send({ t: 'join', create: true, solo: true, name: myName() }));
$('btn-create').onclick = () => connect(() => send({ t: 'join', create: true, name: myName() }));
$('btn-join').onclick = () => {
  const room = $('code').value.trim().toUpperCase();
  if (room.length !== 4) { $('home-msg').textContent = 'Enter the 4-letter room code'; return; }
  connect(() => send({ t: 'join', room, name: myName() }));
};
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
  const box = $('lobby-seats');
  box.replaceChildren(...S.seats.map((s, i) => {
    const me = i === S.you;
    const team = i % 2 === 0 ? 'Team A' : 'Team B';
    const partner = (i + 2) % 4;
    return h('div', {
      class: `lseat ${s.kind === 'empty' ? 'empty' : ''} ${me ? 'me' : ''}`,
      onclick: s.kind === 'empty' ? () => send({ t: 'sit', seat: i }) : null,
    },
      h('div', { class: 'nm' }, s.kind === 'empty' ? 'Empty: a bot will play' : s.name + (me ? ' (you)' : '')),
      h('div', { class: `sub ${i % 2 === 0 ? 'team-a' : 'team-b'}` }, `${team}, partner of seat ${partner + 1}`),
      s.kind === 'empty' ? h('div', { class: 'sub' }, 'Click to sit here') : null,
    );
  }));
  const host = S.host === S.you;
  $('btn-start').disabled = !host;
  $('lobby-msg').textContent = host ? '' : 'Waiting for the host to start…';
}

const nameOf = (i) => S.seats[i].name;
const teamClass = (i) => (i % 2 === S.you % 2 ? 'us' : 'them');

function cardEl(c, cls = '') {
  const s = suitOf(c);
  return h('div', { class: `card ${isRed(s) ? 'red' : ''} ${cls}`, 'data-c': c },
    h('div', { class: 'corner' }, h('span', { class: 'r' }, rankLabel(rankOf(c))), h('span', { class: 's' }, SUITS[s])),
    h('span', { class: 'pip' }, SUITS[s]));
}

function renderGame() {
  if (S.round !== lastRound) { selected = new Set(); pickedHokm = null; lastRound = S.round; }
  if (S.phase !== 'hakem') { selected = new Set(); pickedHokm = null; }
  $('g-code').textContent = S.room;
  renderScore();
  renderTable();
  renderStatus();
  renderActions();
  renderHand();
  renderOverlay();
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

function seatPlate(i) {
  const rel = (i - S.you + 4) % 4;
  const info = S.seats[i];
  const badges = [];
  if (i === S.sardast) badges.push(h('span', { class: 'badge sardast' }, 'Sardast'));
  if (i === S.dealer) badges.push(h('span', { class: 'badge dealer' }, 'Dealer'));
  if (i === S.hakem && S.phase !== 'reading' && S.phase !== 'draw') badges.push(h('span', { class: 'badge hakem' }, 'Hakem'));
  if (info.kind === 'bot') badges.push(h('span', { class: 'badge bot' }, 'Bot'));
  if (info.kind === 'away') badges.push(h('span', { class: 'badge bot' }, 'Away, bot'));
  let bid = '';
  if (S.phase === 'reading' || S.phase === 'draw') {
    const b = S.bids[i];
    bid = b == null ? (S.turn === i && S.phase === 'reading' ? '…' : '') : b === 0 ? 'Pass' : b === 13 ? 'Sheet' : String(b);
  } else if (i === S.hakem) bid = S.reading === 13 ? 'Sheet' : `Reading ${S.reading}`;
  const turn = (S.phase === 'reading' || S.phase === 'play') && S.turn === i || (S.phase === 'hakem' && S.hakem === i);
  const backs = rel === 0 ? null : h('div', { class: 'backs' }, Array.from({ length: Math.min(S.counts[i], 16) }, () => h('div', { class: 'back' })));
  return h('div', { class: `seat ${POS[rel]}` },
    rel === 2 || rel === 1 || rel === 3 ? backs : null,
    h('div', { class: `plate t${i % 2 === S.you % 2 ? 0 : 1} ${turn ? 'turn' : ''}` },
      h('div', { class: 'nm' }, info.name + (i === S.you ? ' (you)' : '')),
      h('div', { class: 'badges' }, badges),
      h('div', { class: 'bid' }, bid),
    ),
  );
}

function renderTable() {
  const t = $('table');
  const kids = [];
  for (let i = 0; i < 4; i++) kids.push(seatPlate(i));

  const center = h('div', { class: 'center' });
  if (S.phase === 'draw' && S.draw) {
    center.append(...drawPiles());
  } else {
    const plays = S.phase === 'trickEnd' && S.lastTrick ? S.lastTrick.plays : S.plays || [];
    for (const p of plays) {
      const rel = (p.seat - S.you + 4) % 4;
      center.append(h('div', { class: `slot ${POS[rel]} ${S.trickWinner === p.seat ? 'win' : ''}` }, cardEl(p.card)));
    }
  }
  kids.push(center);

  // info panel
  const info = h('div', { class: 'info' });
  if (S.hokm != null) {
    info.append(h('div', { class: 'hokm-box' },
      h('div', { class: 'lab' }, 'Hokm'),
      h('div', { class: `big ${isRed(S.hokm) ? 'red' : ''}` }, `${SUITS[S.hokm]} ${SUIT_NAMES[S.hokm]}`)));
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
  kids.push(info);

  if (S.lastTrick && S.phase === 'play') {
    kids.push(h('div', { class: 'last' }, 'Last trick',
      h('div', { class: 'cards' }, S.lastTrick.plays.map((p) => cardEl(p.card, `tiny ${p.seat === S.lastTrick.winner ? 'win' : ''}`)))));
  }
  t.replaceChildren(...kids);
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
    return h('div', { class: `slot ${POS[rel]}` }, h('div', { class: 'drawpile' }, cards.map((c) => cardEl(c, 'mini'))));
  });
  return els;
}
function stopDrawTimer() { clearInterval(drawTimer); drawTimer = null; }

function renderStatus() {
  const me = S.you;
  let msg = '';
  switch (S.phase) {
    case 'draw':
      msg = drawAnim && S.draw && drawAnim.round === S.round && drawAnim.done
        ? `${nameOf(S.draw.seat)} gets the first Ace and reads first`
        : 'Drawing for the first Ace…';
      break;
    case 'reading': msg = S.turn === me ? 'Your turn to read' : `${nameOf(S.turn)} is reading…`; break;
    case 'hakem':
      msg = S.hakem === me
        ? `You won the reading with ${S.reading === 13 ? 'Sheet' : S.reading}${S.forced ? ' (forced 7)' : ''}: pick 4 cards for the bag and name Hokm`
        : `${nameOf(S.hakem)} is picking the bag and Hokm…`;
      break;
    case 'play':
      if (S.turn === me) {
        msg = S.plays.length ? `Your turn: follow ${SUIT_NAMES[suitOf(S.plays[0].card)]} if you can` : 'Your lead: play any card';
      } else msg = `${nameOf(S.turn)} to play`;
      break;
    case 'trickEnd': msg = `${nameOf(S.trickWinner)} takes the trick`; break;
    default: msg = '';
  }
  $('status').textContent = msg;
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
    const g = h('div', { class: 'group' }, h('span', { class: 'lab' }, `Bag ${selected.size}/4 · Hokm:`));
    for (let s = 0; s < 4; s++) {
      g.append(h('button', {
        class: `suitbtn ${isRed(s) ? 'red' : ''} ${pickedHokm === s ? 'on' : ''}`,
        title: SUIT_NAMES[s],
        onclick: () => { pickedHokm = s; renderActions(); },
      }, SUITS[s]));
    }
    g.append(h('button', {
      class: 'primary', disabled: selected.size !== 4 || pickedHokm == null,
      onclick: () => send({ t: 'hakem', discards: [...selected], hokm: pickedHokm }),
    }, 'Done'));
    box.append(g);
  }
}

function renderHand() {
  const box = $('hand');
  const picking = S.phase === 'hakem' && S.hakem === S.you;
  const myTurn = S.phase === 'play' && S.turn === S.you;
  const legal = new Set(S.legal || []);
  box.classList.toggle('pick', picking);
  const cards = (S.hand || []).slice().sort((a, b) => suitOf(a) - suitOf(b) || rankOf(b) - rankOf(a));
  let prevSuit = -1;
  box.replaceChildren(...cards.map((c) => {
    const cls = [];
    if (suitOf(c) !== prevSuit && prevSuit !== -1) cls.push('gap');
    prevSuit = suitOf(c);
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
      if (legal.has(c)) { cls.push('legal'); onclick = () => send({ t: 'play', card: c }); } else cls.push('dim');
    }
    const el = cardEl(c, cls.join(' '));
    if (onclick) el.addEventListener('click', onclick);
    return el;
  }));
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
