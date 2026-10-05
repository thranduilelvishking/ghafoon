'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const I18N = require('../public/i18n.js');

const { en, fa } = I18N.dicts;
const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const hasPersian = (s) => /[؀-ۿ]/.test(s);

test('English and Persian have exactly the same keys', () => {
  const only = (a, b) => Object.keys(a).filter((k) => !(k in b));
  assert.deepStrictEqual(only(en, fa), [], 'keys missing in Persian');
  assert.deepStrictEqual(only(fa, en), [], 'keys missing in English');
});

test('every string uses the same {placeholders} in both languages', () => {
  for (const k of Object.keys(en)) {
    assert.deepStrictEqual(placeholders(fa[k]), placeholders(en[k]), `placeholders differ for ${k}`);
  }
});

test('no string is empty and every Persian string is really Persian (or a deliberate Latin label)', () => {
  for (const [k, v] of Object.entries(fa)) {
    assert.ok(v.trim().length > 0, `${k} is empty`);
    // a string made only of {placeholders} and punctuation (like "{label}: {rule}. ") needs no Persian letters
    const withoutPlaceholders = v.replace(/\{\w+\}/g, '');
    if (k === 'sh.ghafoon') continue; // the game name stays Latin
    if (/[A-Za-z]/.test(withoutPlaceholders) || /[\u0600-\u06FF]/.test(withoutPlaceholders) || !/\{/.test(v)) {
      assert.ok(hasPersian(v), `${k} has no Persian letters: ${v}`);
    }
  }
  for (const [k, v] of Object.entries(en)) assert.ok(v.trim().length > 0, `${k} is empty (en)`);
});

test('the game name is never translated', () => {
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  assert.match(html, /<title>Ghafoon<\/title>/);
  for (const v of [...Object.values(en), ...Object.values(fa)]) assert.ok(!/قفون|غفون|گفون/.test(v), 'the name must stay Ghafoon');
});

test('every translation key used by the client exists', () => {
  const src = ['app.js', 'shelem.js'].map((f) => fs.readFileSync(path.join(__dirname, '../public', f), 'utf8')).join('\n');
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  const keys = new Set();
  for (const m of src.matchAll(/'((?:[a-z]+)\.[A-Za-z0-9.]+)'/g)) keys.add(m[1]);
  for (const m of html.matchAll(/data-i18n(?:-ph|-aria|-title)?="([^"]+)"/g)) keys.add(m[1]);
  const skip = (k) => /^(chat|localStorage|document|window|history)\./.test(k) || /\.(js|svg|png|css|webmanifest)$/.test(k);
  for (const k of keys) {
    if (skip(k)) continue;
    // keys built at run time: c.<contract>[.rule|.short], suit.<n>, e.* and n.* come from the server tables
    assert.ok(k in en || /^(c|suit|sh\.home\.hint|sh\.fmt)\.$/.test(k), `unknown translation key in the client: ${k}`);
  }
  for (const c of ['hokm', 'saras', 'naras', 'taknaras']) for (const sfx of ['', '.rule']) assert.ok(`c.${c}${sfx}` in en);
  for (const c of ['saras', 'naras', 'taknaras']) assert.ok(`c.${c}.short` in en);
  for (let s = 0; s < 4; s++) assert.ok(`suit.${s}` in en);
  for (const g of ['ghafoon', 'shelem']) assert.ok(`sh.home.hint.${g}` in en);
  for (const f of ['classic', 'ace', 'joker']) assert.ok(`sh.fmt.${f}` in en && `sh.fmt.${f}.d` in en);
  for (const o of ['made', 'failed', 'yasa', 'shelem']) for (const w of ['Us', 'Them']) assert.ok(`sh.end.${o}${w}` in en);
});

test('server messages: every known error and notice maps to a key in both languages', () => {
  for (const [msg, key] of Object.entries(I18N.ERROR_KEYS)) {
    assert.ok(key in en && key in fa, `${msg} -> ${key}`);
  }
  for (const key of Object.values(I18N.NOTICE_KEYS)) assert.ok(key in en && key in fa);
  // every message the engine and server can throw is covered, or falls back to the generic one
  const code = fs.readFileSync(path.join(__dirname, '../server/engine.js'), 'utf8') + fs.readFileSync(path.join(__dirname, '../server/server.js'), 'utf8');
  const thrown = [...code.matchAll(/GameError\('([^']+)'\)/g)].map((m) => m[1]);
  const important = thrown.filter((m) => /follow suit|your turn|not in hand|raise|answer|host|name|too fast|seat|reading must|discard|Sheet|hakem/i.test(m));
  const uncovered = important.filter((m) => !(m in I18N.ERROR_KEYS));
  assert.deepStrictEqual(uncovered, [], 'player-facing server messages without a translation key');
  assert.strictEqual(I18N.errorText('some brand new message'), I18N.t('e.generic'));
});

test('digits: Persian digits in Persian, plain digits in English', () => {
  I18N.setLang('fa');
  assert.strictEqual(I18N.num(104), '۱۰۴');
  assert.strictEqual(I18N.t('score.to', { n: 104 }), 'تا ۱۰۴');
  I18N.setLang('en');
  assert.strictEqual(I18N.num(104), '104');
  assert.strictEqual(I18N.t('score.to', { n: 104 }), 'to 104');
});

test('readings read the way the table says them: «امیر ۱۰ دست خواند», «امیر شیت خواند»', () => {
  I18N.setLang('fa');
  assert.strictEqual(I18N.t('info.reads', { name: 'امیر', r: I18N.readingLabel(10) }), 'امیر ۱۰ دست خواند');
  assert.strictEqual(I18N.t('info.reads', { name: 'امیر', r: I18N.readingLabel(13) }), 'امیر شیت خواند');
  assert.strictEqual(I18N.t('end.madeUs', { r: I18N.readingPoss(10), note: '' }), 'حاکم ما ۱۰ دستش رو گرفت');
  assert.strictEqual(I18N.t('end.bustUs', { r: I18N.readingLabel(10), note: '' }), 'حاکم ما پکید (روی ۱۰ دست)');
  I18N.setLang('en');
  assert.strictEqual(I18N.t('info.reads', { name: 'Amir', r: I18N.readingLabel(10) }), 'Amir reads 10');
});

test('the words you chose', () => {
  I18N.setLang('fa');
  assert.deepStrictEqual([0, 1, 2, 3].map(I18N.suitName), ['پیک', 'دل', 'گشنیز', 'خشت']);
  assert.strictEqual(I18N.t('c.naras'), 'نرس');
  assert.strictEqual(I18N.t('c.saras'), 'سرس');
  assert.strictEqual(I18N.t('c.taknaras'), 'تک نرس');
  assert.strictEqual(I18N.t('act.discard'), 'خواباندن');
  assert.strictEqual(I18N.t('badge.dealer'), 'پخش‌کننده');
  assert.strictEqual(I18N.t('score.them'), 'رقیب');
  assert.strictEqual(I18N.t('score.us'), 'ما');
  assert.ok(I18N.t('info.shuffle', { n: 2 }).includes('بر زده'));
  I18N.setLang('en');
});

test('card faces are always the printed A K Q J and 2..10, in both languages', () => {
  I18N.setLang('fa');
  assert.deepStrictEqual([14, 13, 12, 11, 10, 7].map(I18N.rankLabel), ['A', 'K', 'Q', 'J', '10', '7']);
  I18N.setLang('en');
  assert.deepStrictEqual([14, 13, 12, 11, 10, 7].map(I18N.rankLabel), ['A', 'K', 'Q', 'J', '10', '7']);
});

test('seat letters: A/B and C/D are partners (opposite seats)', () => {
  const partner = (s) => (s + 2) % 4;
  for (let s = 0; s < 4; s++) {
    const pair = [I18N.seatLetter(s), I18N.seatLetter(partner(s))].sort().join('');
    assert.ok(pair === 'AB' || pair === 'CD', `seat ${s} and its partner are ${pair}`);
    assert.strictEqual(I18N.teamLabel(s), I18N.teamLabel(partner(s)));
  }
  assert.strictEqual(I18N.teamLabel(0), 'A/B');
  assert.strictEqual(I18N.teamLabel(1), 'C/D');
});

test('bot names are shown in Persian script only in Persian', () => {
  I18N.setLang('fa');
  assert.deepStrictEqual(['Arash', 'Bahar', 'Cyrus', 'Dara'].map(I18N.botName), ['آرش', 'بهار', 'کوروش', 'دارا']);
  assert.strictEqual(I18N.botName('Sara'), 'Sara');
  I18N.setLang('en');
  assert.strictEqual(I18N.botName('Arash'), 'Arash');
});
