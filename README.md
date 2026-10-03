# Ghafoon

A browser version of the Ghafoon card game. Four players, two teams (seats 0+2 vs 1+3), first team to 104
wins. Up to 4 humans per room; empty seats are played by bots, and a bot also takes over if a human
disconnects (they can reconnect and get the seat back; a new player can also join a running game into a
bot seat).

## Run

    npm install
    npm start          # http://localhost:3000   (PORT=... to change)
    npm test

Open the page, pick **Quick play** (you + 3 bots) or **Create a room** and share the link / 4-letter code.

## Layout

- `server/engine.js`: the rules (reading, hakem/bag/hokm, tricks, scoring, sardast rotation) and the shuffle.
- `server/bots.js`: bot bidding, bag/hokm choice and card play.
- `server/server.js`: static files + WebSocket rooms. The server is authoritative; clients only see their own hand.
- `public/`: the client (vanilla JS, no build step).
- `test/`: rules/shuffle tests, bot-only self-play, and WebSocket integration tests.

## Shuffling

The first round of a game gets a full Fisher-Yates shuffle (after the "first Ace" draw that picks the Sardast).
Every later round does **not** re-randomise the cards. The previous round's cards are collected as they
fell: the bag, then each trick's four cards stacked on the one before it, then any cards left in hands.
That pile is only cut once or twice at arbitrary positions (a break can land mid-trick) and dealt in the
rule's packets (12 to the Sardast, 1 to the yard, and so on). Nothing inspects or steers the resulting hands;
the long suits and voids simply come from the stacks.
