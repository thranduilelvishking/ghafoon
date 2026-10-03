# Ghafoon: strings to translate (English → Persian)

**197 entries.** Nothing is built yet: this is the list to check together first.

- **"Ghafoon" (the game's name) is never translated.** Neither are room codes, player names, or the suit symbols ♠ ♥ ♣ ♦.
- `{name}`, `{n}` and similar are values filled in by the game.
- The Persian is a first draft from me, not a final translation: please correct anything that does not sound like how you actually talk at the table. Rows marked **Unsure** need your word.

## Decisions I need from you

1. **The glossary words in section 1**, especially: *reading* (خوانش), *Sheet* (شیت), *Bag* (کیسه), *Yard* (زمین), *Clubs* (گشنیز or خاج), *Team A/B* (تیم الف/ب).
2. **Card faces:** keep the Latin letters on the cards (A K Q J, as on real decks) in Persian mode, or show آس / شاه / بی‌بی / سرباز?
3. **Digits:** use Persian digits (۰۱۲۳۴۵۶۷۸۹) for scores, readings and counts in Persian mode, or keep 0–9? (The numbers printed on the cards would stay as they are.)
4. **Bot names:** keep Arash, Bahar, Cyrus, Dara in Latin letters, or show them in Persian script (آرش، بهار، کوروش، دارا) in Persian mode?
5. **Tone:** I used the neutral polite form ("نوبت شماست", "بزنید"). Is that right, or do you want a friendlier, informal tone ("نوبتته", "بزن")?
6. **Which language first:** should the game start in English or in Persian, or follow the phone/browser language?

## How it would work

- A language switch on the home screen and in the game, remembered on each player's device. Everyone in a room can use a different language at the same time, because only the screen text changes.
- In Persian the text and panels read right to left. The table itself does **not** flip, because seats are physical positions: the card layout, who sits where and the trick cross stay exactly the same.
- Persian font: Vazirmatn (free, open licence), bundled with the game so it works offline.
- Chat messages and player names are shown exactly as typed, in any language.

## 1. Game words (the glossary)

These words appear everywhere, so they decide the feel of the whole translation. **Please check these first.**

| English | Persian (draft) | Note |
|---|---|---|
| Sardast | سردست | Same word you use at the table? |
| Hakem | حاکم |  |
| Hokm (trump suit) | حکم |  |
| Dealer | پخش‌کننده | Or the English-style "دیلر"? |
| Reading (the bid) / "to read" | خوانش / خواندن | **Unsure.** How do you say "I read 10" in Persian? e.g. "می~خوانم ۱۰"? |
| Pass | پاس |  |
| Sheet (13) | شیت | **Unsure.** Or another word for taking everything? |
| Trick (one set of 4 cards) | دست | Also what people call a "hand" |
| Bag (the Hakem's 4 discarded cards) | کیسه | **Unsure.** What do you call it? |
| Yard (the 4 cards set aside) | زمین | **Unsure.** What do you call it? (appears rarely in the UI) |
| Discard (button) | دور انداختن |  |
| Boridan / SarBor | بریدن / سربُر | Not shown anywhere in the UI today, listed for completeness |
| Raise (the new rule) | افزایش | Banner "RAISE!" → «افزایش!» |
| ALL (raise to 13) | همه |  |
| YES / NO | بله / نه | Or the more casual آره / نه? |
| Naras | نارس |  |
| Saras | سارس |  |
| Tak-Naras | تک‌نارس |  |
| Team A / Team B | تیم الف / تیم ب | Or "تیم A / تیم B"? |
| Us / Them | ما / آن‌ها |  |
| Opponents | حریفان | Or رقبا? |
| Partner | هم‌تیمی | Or the borrowed "پارتنر"? |
| Host | میزبان |  |
| Room | اتاق |  |
| Seat | جایگاه | Or صندلی? |
| Bot | ربات |  |
| Lobby | سالن انتظار | Only used in one button label |
| Chat | گفتگو | Or "چت"? |
| Round | دور |  |
| Score / points | امتیاز |  |
| Spades | پیک |  |
| Hearts | دل |  |
| Clubs | گشنیز | Or خاج? |
| Diamonds | خشت |  |

## 2. Home screen

| English | Persian (draft) | Note |
|---|---|---|
| Four players, two teams, 104 points. Empty seats are played by bots. | چهار بازیکن، دو تیم، ۱۰۴ امتیاز. جاهای خالی را ربات‌ها بازی می‌کنند. |  |
| Your name | نام شما |  |
| Pick a name (placeholder) | یک نام انتخاب کنید |  |
| Quick play vs 3 bots | بازی سریع با ۳ ربات |  |
| Create a room for friends | ساخت اتاق برای دوستان |  |
| CODE (placeholder) | کد | The code itself stays in Latin letters, e.g. TJSR |
| Join room | ورود به اتاق |  |
| Pick a name first | ابتدا یک نام انتخاب کنید |  |
| Enter the 4-letter room code | کد ۴ حرفی اتاق را وارد کنید |  |
| Enter your name and press Join room | نام خود را وارد کنید و «ورود به اتاق» را بزنید |  |
| Room not found | اتاق پیدا نشد |  |
| Room is full | اتاق پر است |  |
| Language switch (new) | فارسی / English | Each language is always written in its own script |

## 3. Lobby

| English | Persian (draft) | Note |
|---|---|---|
| Room {code} | اتاق {code} |  |
| 💬 Chat | 💬 گفتگو |  |
| Share the link or code. The seats stay where they are for everyone, and partners sit opposite each other (seats 1 + 3 are Team A, seats 2 + 4 are Team B). New players fill the first empty seat. Click an empty seat to move there, or ask someone to swap. Empty seats are played by bots. | لینک یا کد را برای دوستان بفرستید. جایگاه‌ها برای همه ثابت است و هم‌تیمی‌ها روبه‌روی هم می‌نشینند (جایگاه ۱ و ۳ تیم الف، جایگاه ۲ و ۴ تیم ب). بازیکن تازه‌وارد در اولین جای خالی می‌نشیند. برای رفتن به یک جای خالی روی آن بزنید یا از کسی بخواهید جایش را با شما عوض کند. جاهای خالی را ربات‌ها بازی می‌کنند. |  |
| Copy link | کپی لینک |  |
| Link copied | لینک کپی شد |  |
| Start game | شروع بازی |  |
| Leave | خروج |  |
| Seat {n} · Team A · Host | جایگاه {n} · تیم الف · میزبان |  |
| Empty | خالی |  |
| A bot plays here. Click to sit | اینجا ربات بازی می‌کند. برای نشستن بزنید |  |
| This is you | این شما هستید |  |
| Ask to swap | درخواست جابه‌جایی |  |
| wants to swap with you | می‌خواهد جایش را با شما عوض کند |  |
| Accept | قبول |  |
| Decline | رد |  |
| Waiting for their answer… | منتظر پاسخ… |  |
| Cancel | لغو |  |
| {A} + {B} vs {C} + {D} | {A} و {B} در برابر {C} و {D} |  |
| bot (in the matchup line) | ربات |  |
| You are on {host}, so this link only works on your own PC. Friends can open your public address instead and type the code {code}. | شما در {host} هستید، پس این لینک فقط روی رایانهٔ خودتان کار می‌کند. دوستان می‌توانند آدرس عمومی شما را باز کنند و کد {code} را وارد کنند. |  |
| You are the host: press Start game when everyone is seated. | شما میزبان هستید: وقتی همه نشستند «شروع بازی» را بزنید. |  |
| Waiting for {name} (the host) to start… | منتظر شروع بازی توسط {name} (میزبان)… |  |
| {name} would like to swap seats with you (notice) | {name} می‌خواهد جایش را با شما عوض کند |  |
| {name} swapped seats with you (notice) | {name} جایش را با شما عوض کرد |  |
| {name} would rather stay where they are (notice) | {name} ترجیح می‌دهد همان‌جا بماند |  |

## 4. Game table and labels

| English | Persian (draft) | Note |
|---|---|---|
| Leave the game? A bot will take your seat. | از بازی خارج می‌شوید؟ یک ربات جای شما را می‌گیرد. |  |
| Us / Them (scoreboard) | ما / آن‌ها |  |
| to 104 | تا ۱۰۴ | Digits: see decision 3 |
| Sardast (badge) | سردست |  |
| Dealer (badge) | پخش‌کننده |  |
| Bot (badge) | ربات |  |
| Away, bot (badge) | غایب، ربات بازی می‌کند |  |
| {n} cards (landscape phones) | {n} کارت |  |
| PASS (chip) | پاس |  |
| SHEET (chip) | شیت |  |
| ALL (chip) | همه |  |
| Hokm (info box label) | حکم |  |
| {name} reads {n} | {name} {n} خواند | Depends on the word for "reading" |
| (raised from {n}) | (افزایش از {n}) |  |
| Us (hakem): {a} / {n} | ما (حاکم): {a} از {n} |  |
| Them (bust): {a} / {n} | آن‌ها (شکست حاکم): {a} از {n} |  |
| The bag counts as a trick for the hakem team (tooltip) | کیسه برای تیم حاکم یک دست حساب می‌شود |  |
| Stacks kept, cut {n}× | دست‌ها روی هم مانده، {n} بار کات شد |  |
| Last trick | دست قبلی |  |
| Hakem (tooltip on the crown) | حاکم |  |
| Raise your reading (tooltip on the + button) | افزایش خوانش |  |

## 5. Status line (the yellow text under the table)

| English | Persian (draft) | Note |
|---|---|---|
| Drawing for the first Ace… | کشیدن کارت برای اولین آس… |  |
| {name} gets the first Ace and reads first | {name} اولین آس را گرفت و اول می‌خواند |  |
| Your turn to read | نوبت شما برای خواندن است |  |
| {name} is reading… | {name} در حال خواندن است… |  |
| You are the Hakem with {n}: pick 4 cards for the bag, then press Discard | شما حاکم هستید با {n}: ۴ کارت برای کیسه انتخاب کنید و «دور انداختن» را بزنید |  |
| (forced 7) | (۷ اجباری) |  |
| {name} is picking the bag… | {name} در حال انتخاب کیسه است… |  |
| Now pick the Hokm suit and press Hokm | حالا خال حکم را انتخاب کنید و «حکم» را بزنید |  |
| Sheet! Choose how to play: Hokm, Naras, Saras or Tak-Naras | شیت! نوع بازی را انتخاب کنید: حکم، نارس، سارس یا تک‌نارس |  |
| {name} is choosing Hokm… | {name} در حال انتخاب حکم است… |  |
| {name} is choosing: Hokm, Naras, Saras or Tak-Naras… | {name} در حال انتخاب است: حکم، نارس، سارس یا تک‌نارس… |  |
| {Contract}: {short rule}. (play phase reminder) | {Contract}: {short rule}. |  |
| Your lead: play any card | شروع با شماست: هر کارتی بازی کنید |  |
| Your turn: follow {suit} if you can | نوبت شماست: اگر دارید از {suit} بازی کنید |  |
| (tap a card twice) | (روی کارت دو بار بزنید) | Touch screens |
| (tap again to play) | (برای بازی دوباره بزنید) | Touch screens |
| {name} to play | نوبت {name} است |  |
| {name} takes the trick | {name} دست را برد |  |
| Waiting… | منتظر… |  |

## 6. Reading, bag and contract choice

| English | Persian (draft) | Note |
|---|---|---|
| Read: | خواندن: |  |
| Pass (button) | پاس |  |
| Sheet (button) | شیت |  |
| Bag: {n} / 4 cards | کیسه: {n} از ۴ کارت |  |
| Discard (button) | دور انداختن |  |
| Hokm suit: | خال حکم: |  |
| Hokm (confirm button) | حکم |  |
| Choose | انتخاب |  |
| Play {contract} | بازی {contract} | e.g. «بازی نارس» |
| Hokm — rule: Trump suit: name one suit as Hokm. | حکم: یک خال را به عنوان حکم (برنده) اعلام کنید. |  |
| Saras — rule: No trump. The highest card of the led suit wins. | سارس: بدون حکم. بالاترین کارت از خال زمین‌شده می‌برد. |  |
| Naras — rule: No trump. The lowest card of the led suit wins (Ace is high, so it loses). | نارس: بدون حکم. پایین‌ترین کارت از خال زمین‌شده می‌برد (آس بالاترین است، پس می‌بازد). |  |
| Tak-Naras — rule: No trump. The lowest card wins and the Ace counts as 1, so the Ace wins. | تک‌نارس: بدون حکم. پایین‌ترین کارت می‌برد و آس یک حساب می‌شود، پس آس می‌برد. |  |
| Short rules: highest wins / lowest wins / lowest wins, Ace = 1 | بالاترین می‌برد / پایین‌ترین می‌برد / پایین‌ترین می‌برد، آس = ۱ |  |

## 7. Raising the reading

| English | Persian (draft) | Note |
|---|---|---|
| RAISE TO: | افزایش به: |  |
| Cancel | لغو |  |
| The opponents answer YES or NO. One YES and your reading goes up. If both say NO you win your current {n} at once. You can raise only once. | حریفان بله یا نه می‌گویند. با یک «بله» خوانش شما بالا می‌رود. اگر هر دو «نه» بگویند، همان {n} فعلی را همین حالا می‌برید. فقط یک بار می‌توانید افزایش دهید. |  |
| {name} wants to raise {a} → {b}. Answer YES or NO | {name} می‌خواهد از {a} به {b} افزایش دهد. بله یا نه؟ | Arrows in right-to-left text can look flipped: check on screen |
| YES / NO (buttons) | بله / نه |  |
| YES: they must now take {b} and you only need {n} trick(s) to bust them (it was {m}). NO from both of you ends the round: {name}'s team wins {a}. | بله: آن‌ها حالا باید {b} دست ببرند و شما فقط {n} دست لازم دارید تا آن‌ها را بسوزانید (قبلاً {m} بود). اگر هر دوی شما «نه» بگویید، دور تمام می‌شود و تیم {name} {a} امتیاز می‌برد. | "بسوزانید" = bust; is there a better word for this? |
| Waiting for the opponents to answer your raise… | منتظر پاسخ حریفان به افزایش شما… |  |
| You said NO. Waiting for your partner… | شما «نه» گفتید. منتظر هم‌تیمی‌تان… |  |
| {name} raised {a} → {b}. The opponents are answering… | {name} از {a} به {b} افزایش داد. حریفان در حال پاسخ دادن هستند… |  |
| YES / NO (chips on the name bubbles) | بله / نه |  |

## 8. Banners (the big announcements)

| English | Persian (draft) | Note |
|---|---|---|
| Hokm + {suit symbol} | حکم + {suit symbol} |  |
| {name} named {suit} | {name} {suit} را حکم کرد |  |
| {name} plays Sheet | {name} شیت بازی می‌کند |  |
| Raise! | افزایش! |  |
| {name} raises the reading | {name} خوانش را افزایش داد |  |
| Raise accepted | افزایش پذیرفته شد |  |
| {name} now needs {n} tricks | {name} حالا باید {n} دست ببرد |  |

## 9. Round end and game over

| English | Persian (draft) | Note |
|---|---|---|
| Round {n} | دور {n} |  |
| Your team made {n} | تیم شما {n} را برد | "made" = reached the reading |
| Opponents made {n} | حریفان {n} را بردند |  |
| Your team was busted on {n} | تیم شما روی {n} سوخت |  |
| Opponents busted on {n} | حریفان روی {n} سوختند |  |
| (raised from {n}) | (افزایش از {n}) |  |
| Your opponents refused the raise to {n}: your team wins {m} | حریفان افزایش به {n} را رد کردند: تیم شما {m} امتیاز می‌برد |  |
| Your team refused the raise to {n}: Opponents win {m} (the other variant, when your team is the opponents) | تیم شما افزایش به {n} را رد کرد: حریفان {m} امتیاز می‌برند | |
| ({name} was Hakem) | ({name} حاکم بود) |  |
| Tricks: us {a}, them {b} (bag included) | دست‌ها: ما {a}، آن‌ها {b} (با کیسه) |  |
| Us / Them (scores) | ما / آن‌ها |  |
| Next round | دور بعد |  |
| Waiting for others… | منتظر بقیه… |  |
| Waiting for {names} | منتظر {names} |  |
| 🏆 You win! | 🏆 شما بردید! |  |
| You lose | شما باختید |  |
| Your team reached 104 first. | تیم شما اول به ۱۰۴ رسید. |  |
| The opponents reached 104 first. | حریفان اول به ۱۰۴ رسیدند. |  |
| Back to lobby | بازگشت به سالن انتظار |  |
| Leave room | خروج از اتاق |  |

## 10. Chat

| English | Persian (draft) | Note |
|---|---|---|
| Chat (panel title) | گفتگو |  |
| Open chat / Close chat (screen-reader labels) | باز کردن گفتگو / بستن گفتگو |  |
| Say something… (placeholder) | چیزی بگویید… |  |
| Send | ارسال |  |
| No messages yet. Say hi! | هنوز پیامی نیست. سلام کنید! |  |
| Quick reply: Nice! | آفرین! |  |
| Quick reply: Oops | ای وای |  |
| Quick reply: Your lead | شما شروع کنید |  |
| Quick reply: Good game | بازی خوبی بود |  |

## 11. Connection and small messages

| English | Persian (draft) | Note |
|---|---|---|
| Connection lost, reconnecting… | اتصال قطع شد، در حال اتصال دوباره… |  |

## 12. Messages from the server (shown as pop-ups)

These come from the game engine as English sentences. For Persian they would be sent as codes and translated on the player's screen. Most are rarely seen, because the buttons already stop invalid moves.

| English | Persian (draft) | Note |
|---|---|---|
| you must follow suit | باید از همان خال بازی کنید |  |
| not your turn | نوبت شما نیست |  |
| card not in hand | این کارت در دست شما نیست |  |
| reading must be higher than the current highest | خوانش باید از بالاترین خوانش فعلی بیشتر باشد |  |
| discard exactly 4 cards | دقیقاً ۴ کارت دور بیندازید |  |
| discard first, then choose how to play | اول دور بیندازید، بعد نوع بازی را انتخاب کنید |  |
| only a Sheet can be played without Hokm | فقط شیت را می‌شود بدون حکم بازی کرد |  |
| you are not the hakem | شما حاکم نیستید |  |
| only the hakem can raise | فقط حاکم می‌تواند افزایش دهد |  |
| you can only raise once per round | در هر دور فقط یک بار می‌شود افزایش داد |  |
| a raise has to be higher than your reading | افزایش باید از خوانش شما بیشتر باشد |  |
| you cannot reach that: the opponents already have too many tricks | به آن نمی‌رسید: حریفان از قبل دست‌های زیادی برده‌اند |  |
| you cannot raise right now | الان نمی‌توانید افزایش دهید |  |
| only the opponents answer a raise | فقط حریفان به افزایش پاسخ می‌دهند |  |
| you already answered | شما قبلاً پاسخ داده‌اید |  |
| no raise to answer / that request is no longer open | افزایشی برای پاسخ دادن نیست / این درخواست دیگر باز نیست |  |
| only the host can start the game | فقط میزبان می‌تواند بازی را شروع کند |  |
| Enter a name | یک نام وارد کنید |  |
| You are sending messages too fast | پیام‌ها را خیلی سریع می‌فرستید |  |
| seats can only be changed in the lobby | جایگاه‌ها فقط در سالن انتظار عوض می‌شوند |  |
| pick another seat | جایگاه دیگری انتخاب کنید |  |
| that seat is empty: just sit there | آن جایگاه خالی است: همان‌جا بنشینید |  |
| already in a room | شما در یک اتاق هستید |  |
| Other engine messages (bad input, wrong phase, game over): "not play phase", "not reading phase", "game over", "round not finished", "bad contract", "bad hokm", "bad reading", "no finished trick", "not drawing", "not the discard phase" | یک پیام عمومی: «کار نادرست در این مرحله» | These only appear if something unexpected happens, one generic Persian message is enough |
