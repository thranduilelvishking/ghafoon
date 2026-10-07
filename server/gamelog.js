'use strict';
// Records what human players decide in Shelem (their bids, discards and cards) so the bots can learn from them.
// Nothing about who played is stored: no names, no room codes, only the situation and the choice. The file stays on the
// machine that runs the server. Switch it off with GHAFOON_LOG=0 (tests switch it off with GHAFOON_FAST).

const fs = require('fs');
const path = require('path');

const FILE = process.env.GHAFOON_LOG_FILE || path.join(__dirname, '..', 'data', 'human-decisions.jsonl');
const ON = process.env.GHAFOON_LOG !== '0' && !process.env.GHAFOON_FAST;

function record(entry) {
  if (!ON) return;
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.appendFileSync(FILE, JSON.stringify({ ...entry, at: Date.now() }) + '\n');
  } catch (e) { /* logging must never break a game */ }
}

function read(file = FILE) {
  try {
    return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  } catch (e) { return []; }
}

module.exports = { record, read, FILE, ON };
