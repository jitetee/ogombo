// ============================================================
// Greeting popup: a friendly message on holidays, observances and health-awareness days.
//
//  * Built-in calendar (this file): New Month, New Year, Valentine's, Nurses Week and Nurses Day, Easter, Eid, Ramadan,
//    Halloween, Christmas, Kenyan national days, many world and African national days, and WHO / medical awareness days.
//  * Your own messages: Admin > Data > "occasions" (date as MM-DD, or MM-DD..MM-DD for a range, plus a message).
//    Your wording always wins over the built-in one on the same day.
//  * Shows ONCE per day per device, only the most important message (the others appear as "Also today").
//  * Never on /admin. Never for crawlers. Respects "reduce motion". Close with the button, Esc or a tap outside.
//
// Preview any day:   ?greetdate=2026-12-25      Preview one message:   ?greet=christmas      List all ids:   EO_GREET.ids()
// Turn it off for good: set  window.EO_GREET_OFF = true  before this script, or delete the loader line at the end of site.js.
// ============================================================
(function () {
  "use strict";
  if (window.__eoGreet) return; window.__eoGreet = true;
  if (window.EO_GREET_OFF) return;
  if (/^\/admin(\/|$)/i.test(location.pathname)) return;
  if (/bot|crawl|spider|lighthouse|headless/i.test(navigator.userAgent || "")) return;

  // ---------- date helpers (all on a plain local date: year, month 1-12, day) ----------
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const pad = (n) => String(n).padStart(2, "0");
  const key = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const at = (y, m, d) => new Date(y, m - 1, d);
  const addDays = (d, n) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; };
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  // Western Easter Sunday (Meeus/Jones/Butcher)
  function easter(y) {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3),
      h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
      mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1;
    return at(y, mo, da);
  }
  // n-th weekday of a month (dow 0=Sun..6=Sat), n>=1
  function nth(y, m, dow, n) { const first = at(y, m, 1).getDay(); return at(y, m, 1 + ((dow - first + 7) % 7) + (n - 1) * 7); }
  // lunar calendars come from the browser's own Intl data; a missing calendar simply means no match
  function lunar(d, cal) {
    try {
      const p = new Intl.DateTimeFormat("en-u-ca-" + cal + "-nu-latn", { day: "numeric", month: "numeric" }).formatToParts(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12)), o = {};   // noon avoids midnight edge cases
      p.forEach((x) => { o[x.type] = x.value; });
      return [parseInt(o.month, 10), parseInt(o.day, 10)];
    } catch (e) { return [0, 0]; }
  }
  const hijri = (m, dd) => (d) => { const [mm, day] = lunar(d, "islamic-umalqura"), [pm, pd] = lunar(addDays(d, -1), "islamic-umalqura"); return (mm === m && day === dd) || (pm === m && pd === dd); }; // the day after counts too (moon sighting can differ by a day)
  const chinese = (m, dd) => (d) => { const [mm, day] = lunar(d, "chinese"), [pm, pd] = lunar(addDays(d, -1), "chinese"); return (mm === m && day === dd) || (pm === m && pd === dd); };
  const DIWALI = { 2026: [11, 8], 2027: [10, 29], 2028: [10, 17], 2029: [11, 5], 2030: [10, 26], 2031: [10, 26], 2032: [11, 13] };

  // ---------- rule builders ----------
  const F = (m, d) => (x) => x.getMonth() + 1 === m && x.getDate() === d;                       // fixed day
  const R = (m1, d1, m2, d2) => (x) => { const y = x.getFullYear(); return x >= at(y, m1, d1) && x <= at(y, m2, d2); };   // range inside one year
  const N = (m, dow, n) => (x) => sameDay(x, nth(x.getFullYear(), m, dow, n));                  // n-th weekday
  const E = (off) => (x) => sameDay(x, addDays(easter(x.getFullYear()), off));                  // days from Easter
  const DI = (x) => { const t = DIWALI[x.getFullYear()]; return !!t && x.getMonth() + 1 === t[0] && x.getDate() === t[1]; };
  const FIRSTOFMONTH = (x) => x.getDate() === 1 && x.getMonth() !== 0;

  // Palette names: teal, gold, rose, green, red, purple, blue, orange, night
  // [id, rule, emoji, title, message, priority, palette]
  // priority: 100 your own | 90 big holiday | 80 national / religious | 70 nurses and health-worker days | 60 world observance | 50 health awareness | 30 New Month
  const nm = (d) => MONTHS[d.getMonth()];
  const C = [
    // ----- new year, new month -----
    ["newyear", F(1, 1), "🎆", (d) => "Happy New Year " + d.getFullYear() + "!", "Wishing you good health, steady hands and big wins this year. Thank you for learning with me.", 90, "gold"],
    ["newyearseve", F(12, 31), "🥂", () => "Happy New Year's Eve!", "Thank you for a year of learning. Rest well, celebrate safely and see you in the new year.", 80, "night"],
    ["newmonth", FIRSTOFMONTH, "🌅", (d) => "Happy New Month! Welcome to " + nm(d) + ".", "May this month bring good health, peace and new wins. Small steps every day add up.", 30, "teal"],

    // ----- love, women, family -----
    ["valentines", F(2, 14), "💝", () => "Happy Valentine's Day!", "Love your patients, your team, your family and yourself. Kindness is the best medicine.", 90, "rose"],
    ["womens", F(3, 8), "👩🏾", () => "Happy International Women's Day!", "To every woman who heals, teaches, leads and cares: we see you and we thank you.", 80, "purple"],
    ["mothers", N(5, 0, 2), "🌸", () => "Happy Mother's Day!", "Thank you to every mother and mother figure. Your love and sacrifice keep the world going.", 80, "rose"],
    ["fathers", N(6, 0, 3), "👔", () => "Happy Father's Day!", "To fathers and father figures: thank you for showing up, guiding us and working so hard.", 80, "blue"],

    // ----- faith and culture -----
    ["goodfriday", E(-2), "✝️", () => "Blessed Good Friday", "A day of reflection, peace and thanks. Travel safely and rest well.", 80, "night"],
    ["easter", E(0), "🐣", () => "Happy Easter!", "Wishing you hope, renewal and a peaceful day with your loved ones.", 90, "gold"],
    ["eastermonday", E(1), "🌿", () => "Happy Easter Monday!", "Enjoy the long weekend, rest, and stay safe on the road.", 70, "green"],
    ["ramadan", hijri(9, 1), "🌙", () => "Ramadan Kareem!", "Wishing everyone observing a blessed, peaceful and healthy month. If you are on night shifts, take care of yourself.", 80, "night"],
    ["eidfitr", hijri(10, 1), "🌙", () => "Eid Mubarak! (Eid al-Fitr)", "Wishing you and your family joy, peace and blessings today and always.", 90, "green"],
    ["eidadha", hijri(12, 10), "🐑", () => "Eid al-Adha Mubarak!", "May your sacrifice and generosity be accepted. Wishing you a blessed celebration.", 90, "green"],
    ["islamicnewyear", hijri(1, 1), "🕌", () => "Happy Islamic New Year!", "Wishing you a year of health, peace and blessings.", 70, "night"],
    ["lunarnewyear", chinese(1, 1), "🧧", () => "Happy Lunar New Year!", "Wishing all who celebrate health, luck and prosperity.", 70, "red"],
    ["diwali", DI, "🪔", () => "Happy Diwali!", "May the festival of lights bring joy, health and good fortune to you and your family.", 80, "orange"],
    ["halloween", F(10, 31), "🎃", () => "Happy Halloween!", "Let only the costumes be scary. Enjoy the treats, then wash your hands.", 90, "orange"],
    ["thanksgiving", N(11, 4, 4), "🦃", () => "Happy Thanksgiving!", "To our friends who celebrate: a day to give thanks. We are thankful for you.", 70, "orange"],
    ["christmaseve", F(12, 24), "🎅", () => "Merry Christmas Eve!", "Wishing you a calm, safe evening. If you are on duty tonight, thank you.", 80, "red"],
    ["christmas", F(12, 25), "🎄", () => "Merry Christmas!", "Wishing you and your family joy, peace and good health. A special thank you to everyone working today.", 100, "red"],
    ["boxingday", F(12, 26), "🎁", () => "Happy Boxing Day!", "Rest, share and enjoy. Travel safely.", 80, "red"],

    // ----- Kenya -----
    ["labour", F(5, 1), "🛠️", () => "Happy Labour Day!", "Honouring everyone who works with their hands and hearts. Rest well today.", 90, "gold"],
    ["madaraka", F(6, 1), "🇰🇪", () => "Happy Madaraka Day!", "Celebrating the day Kenya attained internal self-rule in 1963. Heri ya Siku ya Madaraka!", 90, "green"],
    ["mashujaa", F(10, 20), "🇰🇪", () => "Happy Mashujaa Day!", "We honour all Kenyan heroes, past and present, including our health workers. Heri ya Siku ya Mashujaa!", 90, "green"],
    ["jamhuri", F(12, 12), "🇰🇪", () => "Happy Jamhuri Day!", "Celebrating Kenya's independence and republic. Heri ya Siku ya Jamhuri!", 90, "green"],
    ["kiswahili", F(7, 7), "🗣️", () => "Happy World Kiswahili Language Day!", "Kiswahili ni lugha yetu ya fahari. Tuienzi na kuieneza!", 60, "teal"],

    // ----- world and Africa national days -----
    ["ghana", F(3, 6), "🇬🇭", () => "Happy Independence Day, Ghana!", "Congratulations to all Ghanaians at home and abroad.", 70, "gold"],
    ["freedomsa", F(4, 27), "🇿🇦", () => "Happy Freedom Day, South Africa!", "Celebrating the first democratic elections in 1994.", 70, "green"],
    ["zimbabwe", F(4, 18), "🇿🇼", () => "Happy Independence Day, Zimbabwe!", "Congratulations to all Zimbabweans.", 70, "green"],
    ["canada", F(7, 1), "🇨🇦", () => "Happy Canada Day! Happy Rwanda and Burundi Independence Day!", "Warm wishes to everyone celebrating today.", 70, "red"],
    ["usindependence", F(7, 4), "🇺🇸", () => "Happy Independence Day, USA! Happy Liberation Day, Rwanda!", "Warm wishes to everyone celebrating today.", 70, "blue"],
    ["malawi", F(7, 6), "🇲🇼", () => "Happy Independence Day, Malawi!", "Congratulations to all Malawians.", 60, "green"],
    ["india", F(8, 15), "🇮🇳", () => "Happy Independence Day, India!", "Warm wishes to all Indians at home and abroad.", 70, "orange"],
    ["nigeria", F(10, 1), "🇳🇬", () => "Happy Independence Day, Nigeria!", "Congratulations to all Nigerians at home and abroad.", 70, "green"],
    ["uganda", F(10, 9), "🇺🇬", () => "Happy Independence Day, Uganda!", "Congratulations to our neighbours in Uganda.", 70, "gold"],
    ["zambia", F(10, 24), "🇿🇲", () => "Happy Independence Day, Zambia!", "Congratulations to all Zambians.", 60, "green"],
    ["tanzania", F(12, 9), "🇹🇿", () => "Happy Independence Day, Tanzania!", "Hongera kwa Watanzania wote, majirani zetu.", 70, "green"],

    // ----- world observances -----
    ["aprilfools", F(4, 1), "🃏", () => "Happy April Fools' Day!", "The only joke today: skipping hand hygiene. Stay sharp and stay clean.", 40, "purple"],
    ["earthday", F(4, 22), "🌍", () => "Happy Earth Day!", "A healthy planet means healthy people. Reduce, reuse and dispose of waste safely.", 60, "green"],
    ["friendship", F(7, 30), "🤝", () => "Happy Friendship Day!", "Thank you to every classmate, colleague and friend who makes the journey lighter.", 50, "gold"],
    ["youth", F(8, 12), "🌱", () => "Happy International Youth Day!", "The future of healthcare is you. Keep learning and keep growing.", 60, "teal"],
    ["literacy", F(9, 8), "📚", () => "Happy International Literacy Day!", "Reading changes lives. Keep reading, keep learning.", 60, "blue"],
    ["peace", F(9, 21), "🕊️", () => "International Day of Peace", "Peace in our homes, our hospitals and our communities.", 60, "blue"],
    ["teachers", F(10, 5), "🍎", () => "Happy World Teachers' Day!", "Thank you to every teacher, tutor and mentor who shaped us.", 70, "gold"],
    ["unday", F(10, 24), "🌐", () => "Happy United Nations Day!", "Working together for health, peace and development.", 50, "blue"],
    ["childrens", F(11, 20), "🧒", () => "Happy World Children's Day!", "Every child deserves health, safety and a chance to learn.", 60, "orange"],
    ["humanrights", F(12, 10), "⚖️", () => "Human Rights Day", "Health is a human right. Dignity and respect for every patient.", 60, "blue"],

    // ----- nurses, doctors and health workers -----
    ["doctorsday", F(3, 30), "🩺", () => "Happy Doctors' Day!", "Thank you, doctors, for your skill, long hours and sacrifice.", 70, "blue"],
    ["midwives", F(5, 5), "🤱", () => "Happy International Day of the Midwife!", "Thank you, midwives, for welcoming new life and protecting mothers and babies.", 70, "rose"],
    ["nursesweek", R(5, 6, 5, 11), "👩🏾‍⚕️", () => "Happy Nurses Week!", "To every nurse: thank you for your care, your courage and your calm. The week runs until 12 May, International Nurses Day.", 90, "teal"],
    ["nursesday", F(5, 12), "🕯️", () => "Happy International Nurses Day!", "Nurses are the heartbeat of healthcare. Thank you for everything you do, every single day.", 100, "teal"],
    ["pharmacists", F(9, 25), "💊", () => "Happy World Pharmacists Day!", "Thank you to every pharmacist who keeps medicines safe and patients informed.", 60, "green"],
    ["physio", F(9, 8), "🦵", () => "World Physiotherapy Day", "Thank you to physiotherapists who help people move, heal and live fully. (Date: 8 September.)", 50, "blue"],
    ["periop", R(11, 10, 11, 16), "🏥", () => "Perioperative Nurses Week", "Thank you to every theatre, anaesthesia and recovery nurse. Safe surgery is a team effort.", 60, "teal"],

    // ----- health awareness (WHO and others) -----
    ["cancerday", F(2, 4), "🎗️", () => "World Cancer Day", "Early detection saves lives. Know the signs, get screened, and support people living with cancer.", 60, "purple"],
    ["fgm", F(2, 6), "✋", () => "International Day of Zero Tolerance for FGM", "Protect girls. Every girl has the right to health and safety.", 50, "purple"],
    ["hearing", F(3, 3), "👂", () => "World Hearing Day", "Protect your hearing. Turn the volume down and get checked early.", 50, "blue"],
    ["obesity", F(3, 4), "⚖️", () => "World Obesity Day", "Small, steady habits matter: move more, eat well and sleep enough.", 40, "orange"],
    ["kidney", N(3, 4, 2), "🫘", () => "World Kidney Day", "Drink enough water, check your blood pressure and sugar, and avoid unnecessary painkillers.", 50, "teal"],
    ["oral", F(3, 20), "🦷", () => "World Oral Health Day", "Brush twice a day and visit your dentist. A healthy mouth means a healthy body.", 50, "blue"],
    ["downsyndrome", F(3, 21), "💛", () => "World Down Syndrome Day", "Include, support and celebrate every person.", 50, "gold"],
    ["water", F(3, 22), "💧", () => "World Water Day", "Safe water prevents disease. Drink clean water and store it safely.", 60, "blue"],
    ["tbday", F(3, 24), "🫁", () => "World TB Day", "A cough for two weeks or more? Get tested. TB is curable.", 60, "teal"],
    ["autism", F(4, 2), "🧩", () => "World Autism Awareness Day", "Understanding and patience open doors. Support every learner.", 50, "blue"],
    ["healthday", F(4, 7), "🌍", () => "World Health Day", "Health for everyone, everywhere. Look after yourself and the people around you.", 80, "teal"],
    ["immunization", R(4, 24, 4, 30), "💉", () => "World Immunization Week", "Vaccines protect children and communities. Check the clinic card and catch up on missed doses.", 50, "green"],
    ["malaria", F(4, 25), "🦟", () => "World Malaria Day", "Sleep under a treated net. Fever? Get tested early.", 60, "green"],
    ["handhygiene", F(5, 5), "🧼", () => "World Hand Hygiene Day", "Clean hands save lives. Remember the five moments for hand hygiene.", 80, "teal"],
    ["hypertension", F(5, 17), "❤️", () => "World Hypertension Day", "Know your numbers. Check your blood pressure regularly.", 50, "red"],
    ["menstrual", F(5, 28), "🩸", () => "Menstrual Hygiene Day", "Dignity, clean products and good information for every girl and woman.", 50, "rose"],
    ["notobacco", F(5, 31), "🚭", () => "World No Tobacco Day", "Every day without tobacco is a gift to your lungs and heart.", 60, "green"],
    ["blooddonor", F(6, 14), "🩸", () => "World Blood Donor Day", "Thank you to every donor. One donation can save more than one life.", 70, "red"],
    ["sicklecell", F(6, 19), "🔴", () => "World Sickle Cell Day", "Early diagnosis and good care allow people to live well.", 50, "red"],
    ["drowning", F(7, 25), "🌊", () => "World Drowning Prevention Day", "Watch children near water. Learn to swim and learn CPR.", 50, "blue"],
    ["hepatitis", F(7, 28), "🧬", () => "World Hepatitis Day", "Hepatitis B is preventable by vaccine. Get vaccinated and get tested.", 60, "orange"],
    ["breastfeeding", R(8, 1, 8, 7), "🍼", () => "World Breastfeeding Week", "Breast milk is the best start for a baby. Support every mother.", 50, "rose"],
    ["suicide", F(9, 10), "💚", () => "World Suicide Prevention Day", "You matter. If you are struggling, talk to someone you trust or a health worker today.", 60, "green"],
    ["sepsis", F(9, 13), "🌡️", () => "World Sepsis Day", "Sepsis is an emergency. Infection plus fever, fast breathing or confusion: get help fast.", 60, "red"],
    ["patientsafety", F(9, 17), "🛡️", () => "World Patient Safety Day", "Speak up, double check, and make every procedure safer for every patient.", 90, "teal"],
    ["alzheimers", F(9, 21), "🧠", () => "World Alzheimer's Day", "Patience and care for people living with dementia and for their families.", 50, "purple"],
    ["heartday", F(9, 29), "❤️", () => "World Heart Day", "Move daily, eat well, avoid tobacco and know your blood pressure.", 60, "red"],
    ["pinkoctober", R(10, 1, 10, 31), "🎀", () => "Breast Cancer Awareness Month", "Know your body, check regularly and get screened. Early detection saves lives.", 25, "rose"],
    ["mentalhealth", F(10, 10), "🧠", () => "World Mental Health Day", "It is okay to ask for help. Look after your mind and check on a friend.", 70, "purple"],
    ["sightday", N(10, 4, 2), "👁️", () => "World Sight Day", "Get your eyes checked. Protect them from injury and sun.", 50, "blue"],
    ["handwashing", F(10, 15), "🚰", () => "Global Handwashing Day", "Wash with soap and clean water at the key moments. It prevents diarrhoea and pneumonia.", 70, "blue"],
    ["anaesthesia", F(10, 16), "😴", () => "World Anaesthesia Day", "Thank you to every anaesthesia provider. Safe anaesthesia makes safe surgery possible.", 90, "teal"],
    ["stroke", F(10, 29), "🧠", () => "World Stroke Day", "Remember FAST: Face drooping, Arm weakness, Speech difficulty, Time to call for help.", 50, "red"],
    ["pneumonia", F(11, 12), "🫁", () => "World Pneumonia Day", "Vaccinate, breastfeed, keep air clean and treat fast breathing early.", 50, "blue"],
    ["diabetes", F(11, 14), "🍬", () => "World Diabetes Day", "Know your risk. Check your blood sugar, move daily and eat well.", 60, "blue"],
    ["prematurity", F(11, 17), "👶", () => "World Prematurity Day", "Kangaroo mother care and warmth save small babies.", 50, "rose"],
    ["amr", R(11, 18, 11, 24), "💊", () => "World AMR Awareness Week", "Use antibiotics only when prescribed and finish the course. Resistance is a threat to everyone.", 60, "orange"],
    ["aids", F(12, 1), "🎗️", () => "World AIDS Day", "Test, treat and support. Stigma harms; knowledge and care save lives.", 80, "red"],
    ["disability", F(12, 3), "♿", () => "International Day of Persons with Disabilities", "Access and inclusion for everyone, including in our hospitals.", 60, "blue"],
  ];

  const PAL = {
    teal: ["#0f766e", "#14b8a6"], gold: ["#a16207", "#f59e0b"], rose: ["#be185d", "#f472b6"], green: ["#166534", "#22c55e"], red: ["#b91c1c", "#f87171"],
    purple: ["#6d28d9", "#a78bfa"], blue: ["#1d4ed8", "#60a5fa"], orange: ["#c2410c", "#fb923c"], night: ["#1e1b4b", "#6366f1"],
  };

  // ---------- which messages apply on a date ----------
  function builtIn(d) {
    const out = [];
    for (const [id, rule, emoji, title, msg, pri, pal] of C) {
      let ok = false; try { ok = rule(d); } catch (e) { ok = false; }
      if (ok) out.push({ id, emoji, title: title(d), msg, pri, pal });
    }
    return out;
  }
  // custom messages from the database node "occasions": {date:"MM-DD" or "MM-DD..MM-DD", message:"..."}; the message may start with an emoji
  function fromCustom(list, d) {
    const out = [], md = pad(d.getMonth() + 1) + "-" + pad(d.getDate());
    for (const o of list || []) {
      if (!o || !o.date || !o.message) continue;
      const ds = String(o.date).trim(), parts = ds.split("..");
      const hit = parts.length === 2 ? md >= parts[0] && md <= parts[1] : ds === md;
      if (!hit) continue;
      const m = /^((?:\p{Regional_Indicator}{2}|\p{Extended_Pictographic}[\p{Extended_Pictographic}‍️\u{1F3FB}-\u{1F3FF}]*))\s*(.*)$/u.exec(String(o.message).trim());
      out.push({ id: "custom-" + ds + "-" + String(o.message).length, emoji: m ? m[1] : "🎉", title: m ? m[2] : String(o.message), msg: o.note || "", pri: 100, pal: o.palette && PAL[o.palette] ? o.palette : "teal", custom: true });
    }
    return out;
  }
  const rank = (a) => a.sort((x, y) => y.pri - x.pri);
  function on(d, custom) { return rank(fromCustom(custom, d).concat(builtIn(d))); }

  // ---------- the popup ----------
  const LS = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
  let open = false;
  function css() {
    if (document.getElementById("eo-greet-css")) return;
    const s = document.createElement("style"); s.id = "eo-greet-css";
    s.textContent = `
#eo-greet{position:fixed;inset:0;z-index:99990;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(5,20,20,.55);backdrop-filter:blur(3px);opacity:0;transition:opacity .35s}
#eo-greet.on{opacity:1}
#eo-greet .g{position:relative;width:min(440px,100%);max-height:92vh;overflow:auto;border-radius:24px;color:#fff;text-align:center;padding:34px 26px 24px;box-shadow:0 24px 70px rgba(0,0,0,.45);transform:translateY(24px) scale(.96);transition:transform .45s cubic-bezier(.2,1.2,.3,1);font-family:inherit}
#eo-greet.on .g{transform:none}
#eo-greet .e{font-size:76px;line-height:1;margin-bottom:10px;display:inline-block;filter:drop-shadow(0 6px 10px rgba(0,0,0,.3));animation:eoG 2.4s ease-in-out infinite}
#eo-greet h2{margin:0 0 10px;font-size:clamp(22px,5.4vw,28px);line-height:1.2;color:#fff}
#eo-greet p{margin:0 0 6px;font-size:16px;line-height:1.55;color:rgba(255,255,255,.94)}
#eo-greet .also{margin-top:14px;font-size:13px;opacity:.9;line-height:1.5}
#eo-greet .from{margin-top:12px;font-size:13px;opacity:.85}
#eo-greet .b{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:18px}
#eo-greet button,#eo-greet a.s{appearance:none;border:0;cursor:pointer;font:inherit;font-weight:700;font-size:15px;padding:11px 20px;border-radius:999px;text-decoration:none;display:inline-block}
#eo-greet .c{background:#fff;color:#0b2b29}
#eo-greet a.s{background:rgba(255,255,255,.18);color:#fff;border:1px solid rgba(255,255,255,.45)}
#eo-greet .x{position:absolute;top:10px;right:12px;width:36px;height:36px;padding:0;border-radius:50%;background:rgba(255,255,255,.18);color:#fff;font-size:20px;line-height:36px}
#eo-greet :focus-visible{outline:3px solid #fff;outline-offset:2px}
#eo-greet .cf{position:absolute;inset:0;overflow:hidden;pointer-events:none;border-radius:24px;z-index:0;opacity:.5}
#eo-greet .g>*:not(.cf):not(.x){position:relative;z-index:1}
#eo-greet .cf i{position:absolute;top:-24px;font-style:normal;font-size:20px;animation:eoF linear forwards}
@keyframes eoG{0%,100%{transform:translateY(0) rotate(-3deg)}50%{transform:translateY(-8px) rotate(3deg)}}
@keyframes eoF{to{transform:translateY(520px) rotate(360deg);opacity:.2}}
@media (prefers-reduced-motion:reduce){#eo-greet,#eo-greet .g{transition:none}#eo-greet .e{animation:none}#eo-greet .cf{display:none}}`;
    document.head.appendChild(s);
  }
  function show(list, markKey) {
    if (open || !list.length) return; open = true; css();
    const g = list[0], p = PAL[g.pal] || PAL.teal, rest = list.slice(1, 4);
    const wrap = document.createElement("div"); wrap.id = "eo-greet"; wrap.setAttribute("role", "dialog"); wrap.setAttribute("aria-modal", "true"); wrap.setAttribute("aria-labelledby", "eo-greet-t");
    const card = document.createElement("div"); card.className = "g"; card.style.background = p[0];
    const x = document.createElement("button"); x.className = "x"; x.type = "button"; x.setAttribute("aria-label", "Close"); x.textContent = "×"; card.appendChild(x);
    const h = document.createElement("h2"); h.id = "eo-greet-t"; h.textContent = g.title; card.appendChild(h);
    if (g.msg) { const pp = document.createElement("p"); pp.textContent = g.msg; card.appendChild(pp); }
    if (rest.length) { const a = document.createElement("div"); a.className = "also"; a.textContent = "Also today: " + rest.map((r) => r.title.replace(/[!.]+$/, "")).join("  ·  "); card.appendChild(a); }
    const fr = document.createElement("div"); fr.className = "from"; fr.textContent = "With love from Ezra Ogombo"; card.appendChild(fr);
    const bar = document.createElement("div"); bar.className = "b";
    const ok = document.createElement("button"); ok.type = "button"; ok.className = "c"; ok.textContent = "Thank you!"; bar.appendChild(ok);
    const sh = document.createElement("a"); sh.className = "s"; sh.target = "_blank"; sh.rel = "noopener";
    sh.href = "https://wa.me/?text=" + encodeURIComponent(g.title + (g.msg ? "\n" + g.msg : "") + "\n" + location.origin); sh.textContent = "Share on WhatsApp"; bar.appendChild(sh);
    card.appendChild(bar); wrap.appendChild(card); document.body.appendChild(wrap);
    const prev = document.activeElement;
    const close = () => { wrap.classList.remove("on"); document.removeEventListener("keydown", kd); setTimeout(() => { wrap.remove(); open = false; if (prev && prev.focus) try { prev.focus(); } catch (e) {} }, 350); };
    const kd = (e) => { if (e.key === "Escape") close(); else if (e.key === "Tab") { const f = [x, ok, sh]; const i = f.indexOf(document.activeElement); e.preventDefault(); f[(i + (e.shiftKey ? f.length - 1 : 1)) % f.length].focus(); } };
    x.onclick = ok.onclick = close; wrap.addEventListener("click", (e) => { if (e.target === wrap) close(); }); document.addEventListener("keydown", kd);
    requestAnimationFrame(() => { wrap.classList.add("on"); ok.focus(); });
    if (markKey) LS.set(markKey, g.id);
  }

  // ---------- start ----------
  const q = new URLSearchParams(location.search);
  async function loadCustom() {
    const cfg = window.EO_FIREBASE_CONFIG || {}, base = cfg.databaseURL ? cfg.databaseURL.replace(/\/$/, "") : "";
    if (!base) return [];
    const c = new AbortController(), t = setTimeout(() => c.abort(), 4000);
    try { const r = await fetch(base + "/occasions.json", { signal: c.signal }); if (!r.ok) return []; const j = await r.json(); return j ? (Array.isArray(j) ? j : Object.values(j)) : []; } catch (e) { return []; } finally { clearTimeout(t); }
  }
  async function start() {
    let d = new Date(); const gd = q.get("greetdate");
    if (gd && /^\d{4}-\d{2}-\d{2}$/.test(gd)) d = at(+gd.slice(0, 4), +gd.slice(5, 7), +gd.slice(8, 10));
    const custom = await loadCustom();
    let list = on(d, custom); const forced = q.get("greet");
    if (forced) { const all = on(d, custom).concat(C.map(([id, , emoji, title, msg, pri, pal]) => ({ id, emoji, title: title(d), msg, pri, pal }))); const f = all.find((a) => a.id === forced); if (f) list = [f]; }
    if (!list.length) return;
    const markKey = "eo_greet_" + key(d);
    if (!forced && !gd && LS.get(markKey)) return;                       // already greeted today on this device
    setTimeout(() => { /* skip if another dialog is open; hidden ones such as the chat window do not count */ if ([...document.querySelectorAll('[role="dialog"]:not(#eo-greet)')].some((e) => { const c = getComputedStyle(e); return c.display !== "none" && c.visibility !== "hidden" && !e.hidden && e.getClientRects().length; })) return; show(list, forced || gd ? null : markKey); }, forced || gd ? 400 : 1600);
  }
  window.EO_GREET = { on: (d, custom) => on(d, custom), ids: () => C.map((c) => c[0]), count: C.length, show: (id) => { const f = C.find((c) => c[0] === id); if (f) show([{ id, emoji: f[2], title: f[3](new Date()), msg: f[4], pri: f[5], pal: f[6] }]); } };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
