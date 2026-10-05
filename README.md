# Ghafoon (and Shelem)

A browser version of the Ghafoon card game, with Shelem next to it (see below). Four players, two teams (seats 0+2 vs 1+3), first team to 104
wins. Up to 4 humans per room; empty seats are played by bots, and a bot also takes over if a human
disconnects (they can reconnect and get the seat back; a new player can also join a running game into a
bot seat).

## Run

    npm install
    npm start          # http://localhost:3000   (PORT=... to change)
    npm test

Open the page, choose the game (**Ghafoon** or **Shelem**), then pick **Quick play** (you + 3 bots) or **Create a room** and share the link / 4-letter code.

## Layout

- `server/shelem.js`, `server/shelemBots.js`: the Shelem rules engine and its bots (see `SHELEM_RULES.md`).
- `server/engine.js`: the Ghafoon rules (reading, hakem/bag/hokm, tricks, scoring, sardast rotation) and the shuffle.
- `server/bots.js`: bot bidding, bag/hokm choice and card play.
- `server/server.js`: static files + WebSocket rooms. The server is authoritative; clients only see their own hand.
- `public/`: the client (vanilla JS, no build step).
- `test/`: rules/shuffle tests, bot-only self-play, and WebSocket integration tests.

## Shelem

Choose **Shelem** on the home screen before creating a room. A Shelem room always opens in the lobby (quick play too),
where the host picks the mode and options before pressing Start game (everyone else sees them but cannot change them):

- **Mode**: Classic (52 cards, bids from 100), Ace-15 (Aces are worth 15, bids from 120), Joker (two Jokers, the top Hokm
  cards, 6-card widow, bids from 120).
- **Top Hokm must fall** (optional): the holder of the Ace of Hokm (the Color Joker in Joker mode) must play it in the
  first trick.
- **Win at**: the score target (the format's default, changeable in steps of 50); a team that falls to minus half of it loses.

Everything else follows `SHELEM_RULES.md`: the player after the dealer bids first in steps of 5, three passes make the
Hakem, and if the first three speakers all pass the same dealer deals again. The Hakem takes the widow, puts down the same
number of cards (they count as a trick, point cards included), leads the first trick, and the suit of that first card is
Hokm (with a Joker he names the suit). Scoring is exactly the table in the rules: made = all the points taken, failed =
minus the bid, Yasa = minus twice the bid, Shelem = double the round total, and the defenders always keep what they took.

Where the rules file still had open questions, the game uses these defaults: Shelem is double the round total in every mode
(330 / 370 / 460), the defenders get no special bonus for taking every trick, and if both teams pass the target in the same
round the team with the higher total wins (a tie goes to the Hakem's team). Cards are fully shuffled before every deal and
the dealer moves one seat clockwise after each round. The bots bid by simulating the unseen cards, so they bid on what
their hand is likely to take.

## Sheet contracts

After a Sheet (13) the Hakem discards 4 cards and then picks how the round is played:

- **Hokm**: one suit is trump (Boridan / SarBor as usual).
- **Saras**: no trump, the highest card of the led suit wins.
- **Naras**: no trump, the lowest card of the led suit wins (Ace is high, so it is the worst card).
- **Tak-Naras**: like Naras, but the Ace counts as 1, so the Ace is the best card.

In every contract following suit is mandatory and only a card of the led suit (or a Hokm card) can win a trick,
so a 2 of clubs never beats a 3 of spades that was led. The Hakem must still take all 13 tricks (the bag counts as
one): 26 points if they do, 26 to the opponents if they lose a single trick. Readings below Sheet are always Hokm.

## Raising the reading

Once per round the Hakem may raise their reading during play (from right after naming Hokm, any time up to the
end): the **+** next to their bid offers every number above it, up to **ALL** (13). A raise to R is only possible
while the opponents hold fewer than 14 - R tricks, so the list shrinks as they win tricks. Both opponents answer YES or
NO: a single YES makes the raise stand (the opponents then bust the Hakem with 14 - R tricks, for 2 x R points), and if
both say NO the round ends at once and the Hakem's team wins the original reading. ALL scores like a Sheet (26).

## Languages (Persian / English)

The game opens in Persian and each player can switch to English (and back) at any time with the flag buttons (the plain green-white-red
tricolour for Persian, the US flag for English; on phones they are inside the gear panel). The choice is remembered
on that device, and players in the same room can use different languages, because only the screen text changes. The name
"Ghafoon" is never translated.

- All texts live in `public/i18n.js` (English and Persian side by side). `test/i18n.test.js` checks that both languages
  have the same keys and placeholders, that every key the client uses exists, and that the words agreed for the game are
  the ones in use. The Persian is written in an informal, spoken style.
- Persian reads right to left, but the table, the hand and the lobby seats are physical positions and never mirror.
- Cards always show the printed A K Q J and 2-10 (Latin letters and digits), in both languages.
- Seats are lettered A B C D; A with B and C with D are partners and sit opposite each other.
- The font is Vazirmatn (SIL Open Font License, `public/fonts/OFL.txt`), bundled so the game works offline.
- Player names and chat messages are shown exactly as typed.

## Chat

People in a room can chat from the lobby and during the game (bots stay quiet). There is no chat window or history: a text
box with a Send button sits next to your name plate (in the lobby, under the seats), and a message simply pops up as a speech
bubble next to the sender for a few seconds. Messages are plain text, capped at 200 characters, limited to 5 per 10 seconds
per person, and are not stored, so someone who joins later sees nothing of what was said before.

## First round

Only in the first round of a game: whoever wins the reading (the Hakem) takes the Sardast's place for that round, so they
also lead the first trick, even if someone else drew the first Ace. If they make their reading they stay Sardast, otherwise
the player on their left (clockwise) becomes Sardast. From the second round on the normal rule applies: the Sardast stays
while their team's score is not below the opponents', and when it is, the Sardast passes one seat clockwise.

## Shuffling

The first round of a game gets a full Fisher-Yates shuffle (after the "first Ace" draw that picks the Sardast).
Every later round does **not** re-randomise the cards. The previous round's cards are collected as they
fell: the bag, then each trick's four cards stacked on the one before it, then any cards left in hands.
That pile is cut once or twice at arbitrary positions (a break can land mid-trick), exactly as people do at a real
table, and is dealt in the rule's packets (12 to the Sardast, 1 to the yard, and so on). Nothing inspects or steers
the resulting hands; the long suits and voids simply come from the stacks.

`MIX_LINKS` in `server/engine.js` is 0 (stack and cut only). A value like 0.2 would add a light overhand shuffle that
breaks about 20% of the links between neighbouring cards.
