HOLIDAY / AWARENESS GREETING POPUP  (update for deploy)

WHAT IT DOES
A friendly popup on your public pages on special days: New Month (1st of every month), New Year, Valentine's, Women's Day,
Nurses Week + Nurses Day, Mother's/Father's Day, Easter, Ramadan, Eid, Diwali, Lunar New Year, Halloween, Thanksgiving,
Christmas, Kenyan days (Labour, Madaraka, Mashujaa, Jamhuri), African and world national days, and WHO / medical
awareness days (Hand Hygiene Day, Patient Safety Day, World Anaesthesia Day, AIDS Day, Diabetes Day ...). 93 built in.
Shows ONCE a day per device (the most important message; others appear as "Also today"). Has a Share on WhatsApp button.
Not shown on /admin, to search bots, or while another dialog is open. Respects "reduce motion".

DEPLOY (2 files, copy over the same paths in your site folder, then deploy)
  js/greetings.js   NEW
  js/site.js        UPDATED (only adds a small loader at the very end)
  firebase deploy --only hosting

YOUR OWN MESSAGES (no code)
Admin > Data > "occasions". Add a row:  Date = MM-DD (e.g. 08-17)  or a range MM-DD..MM-DD (e.g. 11-03..11-07),
Message = your text, optionally starting with an emoji (e.g. "🎓 Exam week: all the best!").
Your message always wins over the built-in one on that day. Your 8 existing occasions (New Year, Labour Day,
Madaraka ...) will now show too; delete any you do not want.

PREVIEW (add to any page address)
  ?greetdate=2026-12-25    shows what visitors would see on that date
  ?greet=christmas         shows one message by its id (list all ids: type EO_GREET.ids() in the browser console)
Previews do not use up the once-a-day limit.

TURN OFF
Delete the 4-line loader block at the end of js/site.js, or put  window.EO_GREET_OFF = true  before it loads.

PLEASE CHECK
* greetings-calendar-2026.txt lists every message by date for 2026. Read it once.
* Ramadan, Eid, Islamic New Year and Lunar New Year come from the browser's own calendar and can be a day off from
  the local moon sighting (Eid is also shown on the day after). Diwali dates are a small table for 2026-2032 inside
  greetings.js (search DIWALI). Kenyan public holidays that are moved by the government are not tracked; add them
  in "occasions".
* I could not read one holiday name in your message ("malebavseef"). Tell me which it is and I will add it,
  or add it yourself in "occasions".
* Medical days are general awareness messages, not medical advice.
