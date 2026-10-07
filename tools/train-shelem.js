#!/usr/bin/env node
'use strict';
// Learns from the Shelem decisions humans made (data/human-decisions.jsonl, written by the server while people play).
//
//   node tools/train-shelem.js            report + update server/shelem-tuning.json
//   node tools/train-shelem.js --dry      report only
//
// What it learns: how bold the bots should bid. For every bid or pass a human made, it looks at what the bot's own
// simulation says about that hand, and picks the confidence threshold that agrees best with the humans. It also reports how
// often the bots would have played the same card as the humans did (card play is only measured, not changed).

const fs = require('fs');
const gamelog = require('../server/gamelog');
const bots = require('../server/shelemBots');
const { FORMATS } = require('../server/shelem');

const MIN_BIDS = 40;
const GRID = [0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8];

// how far a threshold is from what the human did: a human who bid more than the bot would have makes the bot look timid, a
// human who passed where the bot would have bid makes it look reckless
function bidLoss(rec, best) {
  if (rec.choice > 0) return Math.max(0, rec.choice - best);
  return Math.max(0, best - Math.max(rec.highest, FORMATS[rec.format].minBid - 5));
}

function calibrate(decisions, { sims = 60, grid = GRID, minBids = MIN_BIDS } = {}) {
  const bids = decisions.filter((d) => d.game === 'shelem' && d.kind === 'bid');
  if (bids.length < minBids) return { ok: false, have: bids.length, need: minBids };
  const prepared = bids.map((rec) => {
    const opts = { format: rec.format, topHokm: !!rec.topHokm, target: FORMATS[rec.format].win };
    return { rec, cfg: FORMATS[rec.format], samples: bots.sampleBids(opts, rec.seat, rec.hand, sims) };
  });
  const scores = grid.map((t) => ({
    threshold: t,
    loss: prepared.reduce((a, p) => a + bidLoss(p.rec, bots.bidFromSamples(p.cfg, p.samples, t)), 0) / prepared.length,
  }));
  scores.sort((a, b) => a.loss - b.loss || Math.abs(a.threshold - 0.62) - Math.abs(b.threshold - 0.62));
  return { ok: true, bids: bids.length, best: scores[0], scores: scores.slice().sort((a, b) => a.threshold - b.threshold) };
}

// A bare-bones game object with just what the bot's card choice looks at.
function rebuild(rec) {
  const cfg = FORMATS[rec.format];
  return {
    cfg, opts: { format: rec.format, topHokm: !!rec.topHokm }, hands: { [rec.seat]: rec.hand }, hokm: rec.hokm, plays: rec.plays,
    trickLog: [{ plays: rec.played.map((card) => ({ card })) }], discard: rec.discard || [], firstTrick: rec.firstTrick,
    legalFor: () => rec.legal, turn: rec.seat, hakem: rec.hakem,
  };
}

function playAgreement(decisions) {
  const plays = decisions.filter((d) => d.game === 'shelem' && d.kind === 'play' && d.legal && d.legal.length > 1);
  let same = 0;
  const by = { lead: [0, 0], follow: [0, 0] };
  for (const rec of plays) {
    const kind = rec.plays.length === 0 ? 'lead' : 'follow';
    let pick;
    try { pick = bots.choosePlay(rebuild(rec), rec.seat).card; } catch (e) { continue; }
    by[kind][1]++;
    if (pick === rec.choice) { same++; by[kind][0]++; }
  }
  return { total: plays.length, same, by };
}

function main() {
  const dry = process.argv.includes('--dry');
  const decisions = gamelog.read();
  console.log(`${decisions.length} human decisions in ${gamelog.FILE}`);
  const cal = calibrate(decisions);
  if (!cal.ok) console.log(`Bidding: only ${cal.have} human bids so far, ${cal.need} are needed before the bots change anything.`);
  else {
    console.log(`Bidding, from ${cal.bids} human bids and passes (lower loss = closer to the humans):`);
    for (const s of cal.scores) console.log(`  threshold ${s.threshold.toFixed(2)}  loss ${s.loss.toFixed(2)}${s.threshold === cal.best.threshold ? '  <- best' : ''}`);
    if (!dry) {
      fs.writeFileSync(bots.TUNING_FILE, JSON.stringify({ bidThreshold: cal.best.threshold, from: cal.bids, at: new Date().toISOString() }, null, 2) + '\n');
      console.log(`Saved ${bots.TUNING_FILE}: bots now bid when they are ${(cal.best.threshold * 100).toFixed(0)}% sure. Restart the server to use it.`);
    }
  }
  const pa = playAgreement(decisions);
  if (pa.total) {
    const pct = (a) => (a[1] ? `${Math.round((a[0] / a[1]) * 100)}% of ${a[1]}` : 'n/a');
    console.log(`Card play: the bots would play the same card as the humans in ${Math.round((pa.same / pa.total) * 100)}% of ${pa.total} choices (leads ${pct(pa.by.lead)}, following ${pct(pa.by.follow)}).`);
  }
}

module.exports = { calibrate, bidLoss, rebuild, playAgreement };
if (require.main === module) main();
