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

## Sheet contracts

After a Sheet (13) the Hakem discards 4 cards and then picks how the round is played:

- **Hokm**: one suit is trump (Boridan / SarBor as usual).
- **Saras**: no trump, the highest card of the led suit wins.
- **Naras**: no trump, the lowest card of the led suit wins (Ace is high, so it is the worst card).
- **Tak-Naras**: like Naras, but the Ace counts as 1, so the Ace is the best card.

In every contract following suit is mandatory and only a card of the led suit (or a Hokm card) can win a trick,
so a 2 of clubs never beats a 3 of spades that was led. The Hakem must still take all 13 tricks (the bag counts as
one): 26 points if they do, 26 to the opponents if they lose a single trick. Readings below Sheet are always Hokm.

## Shuffling

The first round of a game gets a full Fisher-Yates shuffle (after the "first Ace" draw that picks the Sardast).
Every later round does **not** re-randomise the cards. The previous round's cards are collected as they
fell: the bag, then each trick's four cards stacked on the one before it, then any cards left in hands.
That pile gets a light overhand-style disturbance (it breaks about 20% of the links between neighbouring cards,
`MIX_LINKS` in `server/engine.js`; 0 keeps the stacks fully intact), is cut once or twice at arbitrary positions
(a break can land mid-trick) and is dealt in the rule's packets (12 to the Sardast, 1 to the yard, and so on). Nothing inspects or steers the resulting hands;
the long suits and voids simply come from the stacks.
