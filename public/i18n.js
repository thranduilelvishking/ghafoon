'use strict';
// Two languages, one at a time: Persian (default) and English. "Ghafoon" is never translated.
// Strings use {placeholders}. Numbers passed as parameters are shown with Persian digits in Persian.
// Works in the browser (window.I18N) and in Node (for the tests).
(function (root) {
  const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
  const ZWNJ = '‌';

  const en = {
    // settings
    'set.title': 'Settings', 'set.language': 'Language', 'set.cards': 'Persian card names (آس، شاه، بی‌بی، سرباز)', 'set.close': 'Close',
    // home
    'home.tag': 'Four players, two teams, 104 points. Empty seats are played by bots.',
    'home.name': 'Your name', 'home.namePh': 'Pick a name', 'home.solo': 'Quick play vs 3 bots', 'home.create': 'Create a room for friends',
    'home.codePh': 'CODE', 'home.join': 'Join room', 'home.needName': 'Pick a name first', 'home.needCode': 'Enter the 4-letter room code',
    'home.nameAndJoin': 'Enter your name and press Join room',
    // lobby
    'lobby.room': 'Room', 'lobby.chat': '💬 Chat',
    'lobby.help': 'Share the link or code. The seats stay where they are for everyone, and partners sit opposite each other (A with B, C with D). New players fill the first empty seat. Click an empty seat to move there, or ask someone to swap. Empty seats are played by bots.',
    'lobby.copy': 'Copy link', 'lobby.copied': 'Link copied', 'lobby.yourName': 'Your name', 'lobby.start': 'Start game', 'lobby.leave': 'Leave',
    'lobby.seatLine': 'Seat {seat} · Team {team}', 'lobby.hostTag': ' · Host', 'lobby.empty': 'Empty',
    'lobby.botHere': 'A bot plays here. Click to sit', 'lobby.you': 'This is you', 'lobby.askSwap': 'Ask to swap',
    'lobby.wantsSwap': 'wants to swap with you', 'lobby.accept': 'Accept', 'lobby.decline': 'Decline',
    'lobby.waitAnswer': 'Waiting for their answer…', 'lobby.cancel': 'Cancel',
    'lobby.vsWord': 'vs', 'word.bot': 'bot',
    'lobby.localWarn': 'You are on {host}, so this link only works on your own PC. Friends can open your public address instead and type the code {code}.',
    'lobby.youHost': 'You are the host: press Start game when everyone is seated.',
    'lobby.waitHost': 'Waiting for {name} (the host) to start…', 'lobby.theHost': 'the host',
    'n.swapAsk': '{name} would like to swap seats with you', 'n.swapDone': '{name} swapped seats with you',
    'n.swapNo': '{name} would rather stay where they are',
    // game bar and table
    'game.room': 'Room', 'game.leave': 'Leave', 'game.leaveConfirm': 'Leave the game? A bot will take your seat.',
    'score.us': 'Us', 'score.them': 'Them', 'score.to': 'to {n}',
    'badge.sardast': 'Sardast', 'badge.dealer': 'Dealer', 'badge.bot': 'Bot', 'badge.away': 'Away, bot',
    'plate.you': ' (you)', 'plate.cards': '{n} cards', 'chip.pass': 'PASS', 'chip.sheet': 'SHEET', 'chip.all': 'ALL', 'chip.yes': 'YES', 'chip.no': 'NO',
    'crown.title': 'Hakem',
    'info.hokm': 'Hokm', 'info.reads': '{name} reads {r}', 'info.raisedFrom': ' (raised from {n})',
    'info.hakemLine': '{who} (hakem): {a} / {n}', 'info.bustLine': '{who} (bust): {a} / {n}',
    'info.bagTitle': 'The bag counts as a trick for the hakem team', 'info.shuffle': 'Stacks kept, cut {n}×', 'info.last': 'Last trick',
    // reading labels
    'rd.n': '{n}', 'rd.sheet': 'Sheet', 'rd.all': 'ALL', 'rdp.n': '{n}', 'rdp.sheet': 'Sheet', 'rdp.all': 'ALL',
    // status line
    'st.draw': 'Drawing for the first Ace…', 'st.drawDone': '{name} gets the first Ace and reads first',
    'st.myRead': 'Your turn to read', 'st.theyRead': '{name} is reading…',
    'st.hakemMe': 'You are the Hakem with {r}{forced}: pick 4 cards for the bag, then press Discard', 'st.forced': ' (forced 7)',
    'st.hakemOther': '{name} is picking the bag…',
    'st.hokmMe': 'Now pick the Hokm suit and press Hokm', 'st.hokmMeSheet': 'Sheet! Choose how to play: Hokm, Naras, Saras or Tak-Naras',
    'st.hokmOther': '{name} is choosing Hokm…', 'st.hokmOtherSheet': '{name} is choosing: Hokm, Naras, Saras or Tak-Naras…',
    'st.contractLine': '{label}: {rule}. ', 'st.lead': 'Your lead: play any card', 'st.follow': 'Your turn: follow {suit} if you can',
    'st.tapTwice': ' (tap a card twice)', 'st.tapAgain': ' (tap again to play)', 'st.theirTurn': '{name} to play', 'st.trick': '{name} takes the trick',
    'st.voteMe': '{name} wants to raise {a} → {b}. Answer YES or NO', 'st.voteHakem': 'Waiting for the opponents to answer your raise…',
    'st.voteSaidNo': 'You said NO. Waiting for your partner…', 'st.voteWait': 'Waiting…',
    'st.votePartner': '{name} raised {a} → {b}. The opponents are answering…',
    // actions
    'act.read': 'Read:', 'act.pass': 'Pass', 'act.sheet': 'Sheet', 'act.bag': 'Bag: {n} / 4 cards', 'act.discard': 'Discard',
    'act.hokmSuit': 'Hokm suit:', 'act.hokmBtn': 'Hokm', 'act.choose': 'Choose', 'act.play': 'Play {label}',
    // contracts
    'c.hokm': 'Hokm', 'c.saras': 'Saras', 'c.naras': 'Naras', 'c.taknaras': 'Tak-Naras',
    'c.hokm.rule': 'Trump suit: name one suit as Hokm.',
    'c.saras.rule': 'No trump. The highest card of the led suit wins.',
    'c.naras.rule': 'No trump. The lowest card of the led suit wins (Ace is high, so it loses).',
    'c.taknaras.rule': 'No trump. The lowest card wins and the Ace counts as 1, so the Ace wins.',
    'c.saras.short': 'highest wins', 'c.naras.short': 'lowest wins', 'c.taknaras.short': 'lowest wins, Ace = 1',
    // suits
    'suit.0': 'Spades', 'suit.1': 'Hearts', 'suit.2': 'Clubs', 'suit.3': 'Diamonds',
    // raise
    'raise.to': 'RAISE TO:', 'raise.cancel': 'Cancel', 'raise.plus': 'Raise your reading',
    'raise.hint': 'The opponents answer YES or NO. One YES and your number goes up. If both say NO you win your current {r} at once. You can raise only once.',
    'raise.yesHint': 'YES: they must now take {to} and you only need {need} {tricks} to bust them (it was {was}). NO from both of you ends the round: {name}\'s team wins {from}.',
    'unit.trick': 'trick', 'unit.tricks': 'tricks', 'raise.yes': 'YES', 'raise.no': 'NO',
    // banners
    'ban.hokm': 'Hokm', 'ban.named': '{name} named {suit}', 'ban.sheetBy': '{name} plays Sheet',
    'ban.raise': 'Raise!', 'ban.raises': '{name} raises the reading', 'ban.raiseOk': 'Raise accepted', 'ban.needs': '{name} now needs {n} tricks',
    // round end
    'end.round': 'Round {n}', 'end.madeUs': 'Your team made {r}{note}', 'end.madeThem': 'Opponents made {r}{note}',
    'end.bustUs': 'Your team was busted on {r}{note}', 'end.bustThem': 'Opponents busted on {r}{note}', 'end.raisedNote': ' (raised from {n})',
    'end.refusedUs': 'Your opponents refused the raise to {to}: your team wins {r}',
    'end.refusedThem': 'Your team refused the raise to {to}: Opponents win {r}',
    'end.hakemWas': '({name} was Hakem)', 'end.tricks': 'Tricks: us {a}, them {b} (bag included)',
    'end.next': 'Next round', 'end.waitOthers': 'Waiting for others…', 'end.waitNames': 'Waiting for {names}',
    'end.win': '🏆 You win!', 'end.lose': 'You lose', 'end.won104': 'Your team reached 104 first.', 'end.lost104': 'The opponents reached 104 first.',
    'end.lobby': 'Back to lobby', 'end.leave': 'Leave room',
    // chat
    'chat.title': 'Chat', 'chat.open': 'Open chat', 'chat.close': 'Close chat', 'chat.ph': 'Say something…', 'chat.send': 'Send',
    'chat.empty': 'No messages yet. Say hi!', 'q.nice': 'Nice!', 'q.oops': 'Oops', 'q.lead': 'Your lead', 'q.gg': 'Good game',
    // connection and server messages
    'conn.lost': 'Connection lost, reconnecting…',
    'e.generic': 'Something went wrong. Try again.',
    'e.follow': 'You must follow suit', 'e.turn': 'It is not your turn', 'e.card': 'That card is not in your hand',
    'e.bidHigher': 'You have to read more than the highest reading so far', 'e.disc4': 'Discard exactly 4 cards',
    'e.discFirst': 'Discard first, then choose how to play', 'e.sheetOnly': 'Only a Sheet can be played without Hokm',
    'e.notHakem': 'You are not the Hakem', 'e.onlyHakemRaise': 'Only the Hakem can raise', 'e.raiseOnce': 'You can only raise once per round',
    'e.raiseHigher': 'A raise has to be higher than your reading', 'e.raiseReach': 'You cannot reach that: the opponents already have too many tricks',
    'e.raiseNow': 'You cannot raise right now', 'e.onlyOpp': 'Only the opponents answer a raise', 'e.answered': 'You already answered',
    'e.noRaise': 'There is no raise to answer', 'e.reqGone': 'That request is no longer open', 'e.hostOnly': 'Only the host can start the game',
    'e.enterName': 'Enter a name', 'e.chatFast': 'You are sending messages too fast', 'e.seatsLobby': 'Seats can only be changed in the lobby',
    'e.pickSeat': 'Pick another seat', 'e.seatEmpty': 'That seat is empty: just sit there', 'e.inRoom': 'You are already in a room',
    'e.roomNotFound': 'Room not found', 'e.roomFull': 'Room is full', 'e.notNow': 'It is not time for that',
  };

  const fa = {
    'set.title': 'تنظیمات', 'set.language': 'زبان', 'set.cards': 'اسم فارسی کارت‌ها (آس، شاه، بی‌بی، سرباز)', 'set.close': 'بستن',
    'home.tag': 'چهار نفر، دو تیم، ۱۰۴ امتیاز. جاهای خالی رو ربات‌ها پر می‌کنن.',
    'home.name': 'اسمت', 'home.namePh': 'یه اسم انتخاب کن', 'home.solo': 'بازی سریع با ۳ ربات', 'home.create': 'ساخت اتاق برای رفیقا',
    'home.codePh': 'کد', 'home.join': 'ورود به اتاق', 'home.needName': 'اول یه اسم انتخاب کن', 'home.needCode': 'کد ۴ حرفی اتاق رو بنویس',
    'home.nameAndJoin': 'اسمت رو بنویس و «ورود به اتاق» رو بزن',
    'lobby.room': 'اتاق', 'lobby.chat': '💬 گفتگو',
    'lobby.help': 'لینک یا کد رو برای رفیقات بفرست. جاها برای همه ثابته و هم‌تیمی‌ها روبه‌روی هم می‌شینن (A با B، C با D). هر کی تازه بیاد تو اولین جای خالی می‌شینه. برای رفتن به یه جای خالی روش بزن، یا از یکی بخواه جاش رو باهات عوض کنه. جاهای خالی رو ربات‌ها بازی می‌کنن.',
    'lobby.copy': 'کپی لینک', 'lobby.copied': 'لینک کپی شد', 'lobby.yourName': 'اسمت', 'lobby.start': 'شروع بازی', 'lobby.leave': 'خروج',
    'lobby.seatLine': 'جایگاه {seat} · تیم {team}', 'lobby.hostTag': ' · میزبان', 'lobby.empty': 'خالی',
    'lobby.botHere': 'اینجا ربات بازی می‌کنه. برای نشستن بزن', 'lobby.you': 'اینجا تویی', 'lobby.askSwap': 'درخواست جابه‌جایی',
    'lobby.wantsSwap': 'می‌خواد جاش رو باهات عوض کنه', 'lobby.accept': 'قبول', 'lobby.decline': 'رد',
    'lobby.waitAnswer': 'منتظر جوابش…', 'lobby.cancel': 'لغو',
    'lobby.vsWord': 'در برابر', 'word.bot': 'ربات',
    'lobby.localWarn': 'تو الان تو {host} هستی، پس این لینک فقط روی کامپیوتر خودت کار می‌کنه. رفیقات باید آدرس عمومی تو رو باز کنن و کد {code} رو بنویسن.',
    'lobby.youHost': 'تو میزبانی: وقتی همه نشستن «شروع بازی» رو بزن.',
    'lobby.waitHost': 'منتظریم {name} (میزبان) بازی رو شروع کنه…', 'lobby.theHost': 'میزبان',
    'n.swapAsk': '{name} می‌خواد جاش رو باهات عوض کنه', 'n.swapDone': '{name} جاش رو باهات عوض کرد',
    'n.swapNo': '{name} ترجیح می‌ده همون‌جا بمونه',
    'game.room': 'اتاق', 'game.leave': 'خروج', 'game.leaveConfirm': 'از بازی میری بیرون؟ یه ربات جات رو می‌گیره.',
    'score.us': 'ما', 'score.them': 'رقیب', 'score.to': 'تا {n}',
    'badge.sardast': 'سردست', 'badge.dealer': 'پخش‌کننده', 'badge.bot': 'ربات', 'badge.away': 'نیست، ربات بازی می‌کنه',
    'plate.you': ' (تو)', 'plate.cards': '{n} کارت', 'chip.pass': 'پاس', 'chip.sheet': 'شیت', 'chip.all': 'همه', 'chip.yes': 'بله', 'chip.no': 'نه',
    'crown.title': 'حاکم',
    'info.hokm': 'حکم', 'info.reads': '{name} {r} خواند', 'info.raisedFrom': ' (اضافه شده از {n})',
    'info.hakemLine': '{who} (حاکم): {a} از {n}', 'info.bustLine': '{who} (تا حاکم بپکه): {a} از {n}',
    'info.bagTitle': 'زمین برای تیم حاکم یه دست حساب میشه', 'info.shuffle': 'دست‌ها روی هم موند، {n} بار بر زده شد', 'info.last': 'دست قبلی',
    'rd.n': '{n} دست', 'rd.sheet': 'شیت', 'rd.all': 'همه‌ی دست‌ها', 'rdp.n': '{n} دستش', 'rdp.sheet': 'شیتش', 'rdp.all': 'همه‌ی دست‌هاش',
    'st.draw': 'کارت می‌کشیم تا ببینیم اولین آس مال کیه…', 'st.drawDone': '{name} اولین آس رو گرفت و اول می‌خونه',
    'st.myRead': 'نوبت توئه که بخونی', 'st.theyRead': '{name} داره می‌خونه…',
    'st.hakemMe': 'تو با {r}{forced} حاکم شدی: ۴ تا کارت برای زمین انتخاب کن و «خواباندن» رو بزن', 'st.forced': ' (۷ دست اجباری)',
    'st.hakemOther': '{name} داره زمین رو می‌خوابونه…',
    'st.hokmMe': 'حالا خال حکم رو انتخاب کن و «حکم» رو بزن', 'st.hokmMeSheet': 'شیت! نوع بازی رو انتخاب کن: حکم، نرس، سرس یا تک نرس',
    'st.hokmOther': '{name} داره حکم رو انتخاب می‌کنه…', 'st.hokmOtherSheet': '{name} داره انتخاب می‌کنه: حکم، نرس، سرس یا تک نرس…',
    'st.contractLine': '{label}: {rule}. ', 'st.lead': 'تو شروع کن: هر کارتی رو بازی کن', 'st.follow': 'نوبتته: اگه داری از {suit} بازی کن',
    'st.tapTwice': ' (روی کارت دو بار بزن)', 'st.tapAgain': ' (برای بازی دوباره بزن)', 'st.theirTurn': '{name} باید بازی کنه', 'st.trick': '{name} دست رو برد',
    'st.voteMe': '{name} می‌خواد از {a} به {b} اضافه کنه. بله یا نه؟', 'st.voteHakem': 'منتظر جواب رقیبا به اضافه‌ت…',
    'st.voteSaidNo': 'تو «نه» گفتی. منتظر هم‌تیمیت…', 'st.voteWait': 'منتظر…',
    'st.votePartner': '{name} از {a} به {b} اضافه کرد. رقیبا دارن جواب می‌دن…',
    'act.read': 'بخون:', 'act.pass': 'پاس', 'act.sheet': 'شیت', 'act.bag': 'زمین: {n} از ۴ کارت', 'act.discard': 'خواباندن',
    'act.hokmSuit': 'خال حکم:', 'act.hokmBtn': 'حکم', 'act.choose': 'انتخاب', 'act.play': 'بازی {label}',
    'c.hokm': 'حکم', 'c.saras': 'سرس', 'c.naras': 'نرس', 'c.taknaras': 'تک نرس',
    'c.hokm.rule': 'یه خال رو حکم کن.',
    'c.saras.rule': 'بدون حکم. بالاترین کارت از خالی که زمین اومده می‌بره.',
    'c.naras.rule': 'بدون حکم. کمترین کارت از خالی که زمین اومده می‌بره (آس بالاترینه، پس می‌بازه).',
    'c.taknaras.rule': 'بدون حکم. کمترین کارت می‌بره و آس یک حساب میشه، پس آس می‌بره.',
    'c.saras.short': 'بالاترین می‌بره', 'c.naras.short': 'کمترین می‌بره', 'c.taknaras.short': 'کمترین می‌بره، آس = ۱',
    'suit.0': 'پیک', 'suit.1': 'دل', 'suit.2': 'گشنیز', 'suit.3': 'خشت',
    'raise.to': 'اضافه کن به:', 'raise.cancel': 'لغو', 'raise.plus': 'اضافه کردن',
    'raise.hint': 'رقیبا بله یا نه می‌گن. با یه «بله» عددت بالا می‌ره. اگه هر دو «نه» بگن، همون {r} فعلی رو همین الان می‌گیری. فقط یه بار می‌تونی اضافه کنی.',
    'raise.yesHint': 'بله: حاکم حالا باید {to} دست ببره و تو فقط {need} {tricks} لازم داری تا حاکم بپکه (قبلاً {was} بود). اگه هر دوتون «نه» بگید، دور تموم میشه و تیم {name} {from} امتیاز می‌گیره.',
    'unit.trick': 'دست', 'unit.tricks': 'دست', 'raise.yes': 'بله', 'raise.no': 'نه',
    'ban.hokm': 'حکم', 'ban.named': '{name} {suit} رو حکم کرد', 'ban.sheetBy': '{name} شیت خوند',
    'ban.raise': 'اضافه!', 'ban.raises': '{name} اضافه کرد', 'ban.raiseOk': 'اضافه قبول شد', 'ban.needs': '{name} حالا باید {n} دست ببره',
    'end.round': 'دور {n}', 'end.madeUs': 'حاکم ما {r} رو گرفت{note}', 'end.madeThem': 'حاکم رقیب {r} رو گرفت{note}',
    'end.bustUs': 'حاکم ما پکید (روی {r}){note}', 'end.bustThem': 'حاکم رقیب پکید (روی {r}){note}', 'end.raisedNote': ' (اضافه شده از {n})',
    'end.refusedUs': 'رقیبا اضافه به {to} رو رد کردن: تیم ما {r} امتیاز می‌گیره',
    'end.refusedThem': 'ما اضافه به {to} رو رد کردیم: رقیبا {r} امتیاز می‌گیرن',
    'end.hakemWas': '({name} حاکم بود)', 'end.tricks': 'دست‌ها: ما {a}، رقیب {b} (با زمین)',
    'end.next': 'دور بعد', 'end.waitOthers': 'منتظر بقیه…', 'end.waitNames': 'منتظر {names}',
    'end.win': '🏆 بردی!', 'end.lose': 'باختی', 'end.won104': 'تیم ما اول به ۱۰۴ رسید.', 'end.lost104': 'رقیبا اول به ۱۰۴ رسیدن.',
    'end.lobby': 'برگشت به سالن انتظار', 'end.leave': 'خروج از اتاق',
    'chat.title': 'گفتگو', 'chat.open': 'باز کردن گفتگو', 'chat.close': 'بستن گفتگو', 'chat.ph': 'یه چیزی بگو…', 'chat.send': 'ارسال',
    'chat.empty': 'هنوز پیامی نیست. سلام کن!', 'q.nice': 'آفرین!', 'q.oops': 'ای وای', 'q.lead': 'تو شروع کن', 'q.gg': 'بازی خوبی بود',
    'conn.lost': 'اتصال قطع شد، دوباره وصل می‌شیم…',
    'e.generic': 'یه مشکلی پیش اومد. دوباره امتحان کن.',
    'e.follow': 'باید از همون خال بازی کنی', 'e.turn': 'نوبتت نیست', 'e.card': 'این کارت دست تو نیست',
    'e.bidHigher': 'باید بیشتر از بالاترین عددی که خونده شده بخونی', 'e.disc4': 'دقیقاً ۴ تا کارت بخوابون',
    'e.discFirst': 'اول بخوابون، بعد نوع بازی رو انتخاب کن', 'e.sheetOnly': 'فقط شیت رو می‌شه بدون حکم بازی کرد',
    'e.notHakem': 'تو حاکم نیستی', 'e.onlyHakemRaise': 'فقط حاکم می‌تونه اضافه کنه', 'e.raiseOnce': 'تو هر دور فقط یه بار می‌شه اضافه کرد',
    'e.raiseHigher': 'اضافه باید بیشتر از عددت باشه', 'e.raiseReach': 'به اون نمی‌رسی: رقیبا الان دست زیادی دارن',
    'e.raiseNow': 'الان نمی‌تونی اضافه کنی', 'e.onlyOpp': 'فقط رقیبا جواب اضافه رو می‌دن', 'e.answered': 'قبلاً جواب دادی',
    'e.noRaise': 'اضافه‌ای برای جواب دادن نیست', 'e.reqGone': 'این درخواست دیگه باز نیست', 'e.hostOnly': 'فقط میزبان می‌تونه بازی رو شروع کنه',
    'e.enterName': 'یه اسم بنویس', 'e.chatFast': 'پیام‌ها رو خیلی تند می‌فرستی', 'e.seatsLobby': 'جایگاه‌ها فقط تو سالن انتظار عوض می‌شن',
    'e.pickSeat': 'یه جایگاه دیگه انتخاب کن', 'e.seatEmpty': 'اون جایگاه خالیه: بشین همونجا', 'e.inRoom': 'تو الان تو یه اتاقی',
    'e.roomNotFound': 'اتاق پیدا نشد', 'e.roomFull': 'اتاق پره', 'e.notNow': 'الان وقتش نیست',
  };

  // The server sends its errors as English sentences; map them to keys so each player sees their own language.
  const ERROR_KEYS = {
    'you must follow suit': 'e.follow', 'not your turn': 'e.turn', 'card not in hand': 'e.card',
    'reading must be higher than the current highest': 'e.bidHigher', 'discard exactly 4 cards': 'e.disc4',
    'discard first, then choose how to play': 'e.discFirst', 'only a Sheet can be played without Hokm': 'e.sheetOnly',
    'you are not the hakem': 'e.notHakem', 'only the hakem can raise': 'e.onlyHakemRaise', 'you can only raise once per round': 'e.raiseOnce',
    'a raise has to be higher than your reading': 'e.raiseHigher',
    'you cannot reach that: the opponents already have too many tricks': 'e.raiseReach', 'you cannot raise right now': 'e.raiseNow',
    'only the opponents answer a raise': 'e.onlyOpp', 'you already answered': 'e.answered', 'no raise to answer': 'e.noRaise',
    'that request is no longer open': 'e.reqGone', 'only the host can start the game': 'e.hostOnly', 'Enter a name': 'e.enterName',
    'You are sending messages too fast': 'e.chatFast', 'seats can only be changed in the lobby': 'e.seatsLobby',
    'pick another seat': 'e.pickSeat', 'that seat is empty: just sit there': 'e.seatEmpty', 'already in a room': 'e.inRoom',
    'Room not found': 'e.roomNotFound', 'Room is full': 'e.roomFull',
    // moves at the wrong moment: the buttons normally prevent these
    'not the discard phase': 'e.notNow', 'not play phase': 'e.notNow', 'not reading phase': 'e.notNow', 'not drawing': 'e.notNow',
    'game over': 'e.notNow', 'round not finished': 'e.notNow', 'no finished trick': 'e.notNow', 'bad contract': 'e.notNow',
    'bad hokm': 'e.notNow', 'bad reading': 'e.notNow',
  };
  const NOTICE_KEYS = { swapAsk: 'n.swapAsk', swapDone: 'n.swapDone', swapNo: 'n.swapNo' };

  const BOT_NAMES_FA = { Arash: 'آرش', Bahar: 'بهار', Cyrus: 'کوروش', Dara: 'دارا' };
  const FACE_FA = { 14: 'آس', 13: 'شاه', 12: 'بی' + ZWNJ + 'بی', 11: 'سرباز' };
  const FACE_LATIN = { 14: 'A', 13: 'K', 12: 'Q', 11: 'J' };
  // Seats are lettered so that partners are A with B (opposite) and C with D: seat index 0, 2, 1, 3 -> A, B, C, D.
  const SEAT_LETTER = ['A', 'C', 'B', 'D'];

  const dicts = { en, fa };
  const state = { lang: 'fa', faceFa: null };
  const listeners = [];

  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } }
  function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

  function num(n) {
    const s = String(n);
    return state.lang === 'fa' ? s.replace(/[0-9]/g, (d) => FA_DIGITS[+d]) : s;
  }

  function t(key, params) {
    let s = dicts[state.lang][key];
    if (s === undefined) s = dicts.en[key];
    if (s === undefined) return key;
    if (params) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in params ? (typeof params[k] === 'number' ? num(params[k]) : params[k]) : m));
    return s;
  }

  const api = {
    dicts, ERROR_KEYS, NOTICE_KEYS, SEAT_LETTER,
    t, num,
    lang: () => state.lang,
    isFa: () => state.lang === 'fa',
    setLang(l) {
      if (!dicts[l]) return;
      state.lang = l;
      store('ghafoon-lang', l);
      if (state.faceFa === null) state.faceFa = l === 'fa';
      api.applyStatic();
      listeners.forEach((f) => f());
    },
    faceFa: () => (state.faceFa === null ? state.lang === 'fa' : state.faceFa),
    setFaceFa(b) { state.faceFa = !!b; store('ghafoon-faces', b ? 'fa' : 'latin'); listeners.forEach((f) => f()); },
    onChange(f) { listeners.push(f); },
    suitName: (s) => t('suit.' + s),
    seatLetter: (i) => SEAT_LETTER[i],
    teamLabel: (i) => (i % 2 === 0 ? 'A/B' : 'C/D'),
    botName: (name) => (state.lang === 'fa' && BOT_NAMES_FA[name]) || name,
    // card face for a rank 2..14 (Persian names and digits, or the printed A K Q J and 2..10)
    rankLabel(r) {
      if (r >= 11) return api.faceFa() ? FACE_FA[r] : FACE_LATIN[r];
      return api.faceFa() ? String(r).replace(/[0-9]/g, (d) => FA_DIGITS[+d]) : String(r);
    },
    errorText(msg) { return t(ERROR_KEYS[msg] || 'e.generic'); },
    // a reading as words: "10" / "Sheet" / "ALL"; withUnit adds "دست" in Persian ("۱۰ دست")
    readingLabel(n, raised) {
      if (n === 13) return t(raised ? 'rd.all' : 'rd.sheet');
      return t('rd.n', { n });
    },
    // the same, as the object of "got": «حاکم ۱۰ دستش رو گرفت»
    readingPoss(n, raised) {
      if (n === 13) return t(raised ? 'rdp.all' : 'rdp.sheet');
      return t('rdp.n', { n });
    },
    // "ALL" for 13 as a plain number label (chips, raise buttons)
    numLabel: (n) => (n === 13 ? t('chip.all') : num(n)),
    applyStatic() {
      if (typeof document === 'undefined') return;
      const de = document.documentElement;
      de.lang = state.lang;
      de.dir = state.lang === 'fa' ? 'rtl' : 'ltr';
      document.body && document.body.classList.toggle('fa', state.lang === 'fa');
      document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
      document.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
      document.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
      document.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); });
    },
    // read the saved choices (default: Persian, Persian card names in Persian)
    init() {
      const l = load('ghafoon-lang');
      state.lang = l === 'en' || l === 'fa' ? l : 'fa';
      const f = load('ghafoon-faces');
      state.faceFa = f === 'fa' ? true : f === 'latin' ? false : null;
      api.applyStatic();
    },
  };

  root.I18N = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
