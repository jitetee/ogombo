// ============================================================
// Floating helper bot — a free "smart search" assistant (no AI model, no running costs: everything runs in the browser).
// It understands typos, English + Swahili phrasing and simple intents,
// searches posts / content / books / materials / FAQs live from the
// database, replies with tappable cards, remembers the visit, learns
// from unanswered questions (saved for admin) and takes thumbs-up/down.
// Config + FAQs are editable in /admin → Inbox → Chatbot.
// ============================================================
(function () {
  const U = window.EO_UTIL, E = U.esc;
  const HKEY = "eo_chat_hist", RATE = "eo_chat_rate";
  const DEFAULT_CFG = { enabled: true, greeting: true, sponsor: true, lead: true, name: "ASK-EZRA.EXE", welcome: "Hey! I'm a helper bot (not a real person, not AI) that can find Ezra's posts, notes, past papers and downloads. What are you looking for?",
    chips: ["Free materials", "Past papers", "Study notes", "Latest posts", "How do I order?", "Contact"], fallback: "I couldn't find that. Try different words, browse below, or send Ezra a message and he'll reply." };
  const STOP = new Set("a an the is are was were be to of in on for and or me my i you your do does did can could would please want need find show give get any some there this that it with about from at as by us we tell what whats where how which who when".split(" "));
  const SYN = { exam: "paper", exams: "paper", papers: "paper", paper: "paper", kcse: "paper", test: "paper", tests: "paper", revision: "notes", note: "notes", notes: "notes", handout: "notes", handouts: "notes",
    buy: "order", purchase: "order", ordering: "order", bei: "price", cost: "price", pay: "pay", payment: "pay", mpesa: "pay", malipo: "pay", bure: "free", gratis: "free", premium: "paid", vitabu: "book", kitabu: "book", books: "book",
    maelezo: "notes", mihtasari: "notes", mitihani: "paper", mtihani: "paper", makala: "post", posts: "post", articles: "post", article: "post", blogs: "post", blog: "post", habari: "hello", hujambo: "hello", mambo: "hello", sasa: "hello", asante: "thanks", shukrani: "thanks", msaada: "help", wasiliana: "contact", punguzo: "coupon", coupons: "coupon", discount: "coupon", voucher: "coupon", promo: "coupon", kuponi: "coupon", wasiliana: "contact", cv: "cv", resume: "cv", wasifu: "cv", tangaza: "advertise", matangazo: "advertise", tangazo: "advertise", advertising: "advertise", advertise: "advertise", sponsor: "advertise", huduma: "service", services: "service", service: "service", kitabu: "book",  template: "template", templates: "template" };
  const stem = (w) => { w = SYN[w] || w; return w.length > 4 ? w.replace(/(ing|ed|es|s)$/, "") : w.replace(/s$/, ""); };
  const norm = (s) => String(s || "").toLowerCase().replace(/[^\p{L}\p{N}\s/]/gu, " ").replace(/\s+/g, " ").trim();
  const toks = (s) => norm(s).split(" ").filter(Boolean);
  const ed = (a, b, max) => { if (Math.abs(a.length - b.length) > max) return max + 1; const d = []; for (let i = 0; i <= a.length; i++) d[i] = [i]; for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; };

  // ---------- data ----------
  let dataP = null;
  function data() {
    if (!dataP) dataP = Promise.all([window.EO_DB.getNode("chatbot_faq"), window.EO_DB.getNode("chatbot_config"), window.EO_SEARCH.buildIndex(), window.EO_DB.getNode("profile"), Promise.resolve(window.EO_DB.getNode("cyber_cafe_services")).catch(() => null), Promise.resolve(window.EO_SITE && window.EO_SITE.ready).catch(() => null)]).then(([faq, cfg, index, profile, services, site]) => {
      const config = Object.assign({}, DEFAULT_CFG, cfg && !Array.isArray(cfg) ? cfg : {});
      if (config.chips && !Array.isArray(config.chips)) config.chips = Object.values(config.chips);
      const vocab = new Set();
      index.forEach((it) => { it.T = new Set(toks(it.title).map(stem)); it.G = new Set(toks([].concat(it.tags || [], it.category || "", it.kind || "").join(" ")).map(stem)); it.B = new Set(toks(it.body || it.snippet).map(stem)); it.T.forEach((t) => vocab.add(t)); it.G.forEach((t) => vocab.add(t)); });
      const faqs = (faq || []).filter((f) => f && f.answer && f.keywords);
      faqs.forEach((f) => (f.K = (Array.isArray(f.keywords) ? f.keywords : Object.values(f.keywords)).map((k) => norm(k)).filter(Boolean)));
      faqs.forEach((f) => f.K.forEach((k) => k.split(" ").forEach((w) => vocab.add(stem(w)))));
      const sv = Array.isArray(services) ? services : Object.values(services || {});
      return { config, index, faqs, vocab, profile, services: sv, site };
    });
    return dataP;
  }
  const correct = (w, vocab) => { if (vocab.has(w) || w.length < 4) return w; const max = w.length <= 6 ? 1 : 2; let best = w, bd = max + 1; for (const v of vocab) { if (Math.abs(v.length - w.length) > max) continue; const d = ed(w, v, max); if (d < bd) { bd = d; best = v; } } return best; };

  // ---------- understanding ----------
  function analyse(q, D) {
    const words = toks(q);
    const stems = words.map(stem).map((w) => correct(w, D.vocab));
    const content = stems.filter((w) => !STOP.has(w) && w.length > 1);
    const has = (...ws) => ws.some((w) => stems.includes(stem(w)));
    return { raw: q, n: norm(q), words, stems, content, has };
  }
  function intent(a) {
    const n = a.n;
    if (/^(hi|hello|hey|hola|good (morning|afternoon|evening)|yo|sup)\b/.test(n) || a.stems.includes("hello") && a.words.length <= 3) return "greet";
    if (a.has("thanks", "thank") && a.words.length <= 5) return "thanks";
    if (/^(bye|goodbye|see you|cya|kwaheri)/.test(n)) return "bye";
    if (/\b(are you|r u)\b.*\b(ai|bot|robot|real|human|chatgpt)\b|\bwho (are|made|built) you\b|\bwhat are you\b/.test(n)) return "botinfo";
    if (/^(help|menu|options|what can you do)/.test(n) || a.has("help") && a.words.length <= 3) return "help";
    if (/\b(more|next|another|others?|zaidi)\b/.test(n) && a.words.length <= 5) return "more";
    if (/\b(how (do|can|to)|jinsi)\b.*\b(order|buy|purchase|pay)\b|\b(how|where).*(order|pay)\b|^order$|^pay$/.test(n)) return "order";
    if (/\b(latest|newest|recent|new)\b.*\b(post|blog|article)/.test(n) || /^(latest|recent) posts?$/.test(n)) return "latest-posts";
    if (/\b(latest|newest|recent|new)\b.*\b(material|download|notes|paper)/.test(n)) return "latest-materials";
    if (/\b(contact|reach|message|email|phone|number|whatsapp|call|wasiliana|kuwasiliana|nipigie|mawasiliano)\b/.test(n) && !a.content.some((w) => !["contact", "reach", "messag", "email", "phone", "number", "whatsapp", "call", "kuwasiliana", "nipigie", "mawasiliano", "wasiliana", "ezra", "him", "you", "nataka", "ninataka", "naomba", "nahitaji", "want", "need", "kwa", "na", "ya"].includes(w))) return "contact";
    return null;
  }
  function score(it, a) {
    let s = 0, hit = 0;
    for (const w of a.content) {
      let h = 0;
      if (it.T.has(w)) h = 3; else if (it.G.has(w)) h = 2; else if (it.B.has(w)) h = 1;
      else if (w.length >= 4) { for (const t of it.T) if (t.startsWith(w) || w.startsWith(t) && t.length >= 4) { h = 1.5; break; } }
      if (h) { s += h; hit++; }
    }
    if (!hit) return 0;
    if (a.content.length >= 3 && hit / a.content.length < 0.5) return 0;
    s *= 0.6 + 0.4 * (hit / a.content.length);
    if (a.n.length > 4 && norm(it.title).includes(a.n)) s += 4;
    return s;
  }
  function filters(a) {
    const f = {};
    if (a.has("free")) f.access = "free"; else if (a.has("paid", "price")) f.access = "paid";
    if (a.has("paper")) f.category = "past-papers"; else if (a.has("notes")) f.category = "notes"; else if (a.has("unit", "units")) f.category = "study-units"; else if (a.has("cv", "template")) f.category = "templates";
    if (a.has("post")) f.kind = "blog"; else if (a.has("book")) f.kind = "book";
    if (a.has("material", "download", "pdf")) f.kind = f.kind || "material";
    if (f.category || f.access) f.kind = "material";
    return f;
  }
  function search(a, D, ctx) {
    const f = filters(a);
    const c2 = Object.assign({}, a, { content: a.content.filter((w) => !["free", "paid", "paper", "notes", "unit", "post", "book", "material", "download", "pdf", "price", "order", "cv", "template"].includes(w) || false) });
    let pool = D.index;
    const apply = (p) => p.filter((it) => (!f.kind || it.kind === f.kind) && (!f.access || it.access === f.access) && (!f.category || it.category === f.category));
    const filtered = apply(pool);
    const hasFilter = f.kind || f.access || f.category;
    if (hasFilter && !c2.content.length) return { items: filtered.slice().sort((x, y) => (y.date || "").localeCompare(x.date || "")), f };   // e.g. "free past papers"
    const base = hasFilter && filtered.length ? filtered : pool;
    const qa = c2.content.length ? c2 : a;
    const ranked = base.map((it) => [it, score(it, qa)]).filter(([, s]) => s >= 2).sort((x, y) => y[1] - x[1]).map(([it]) => it);
    return { items: ranked, f };
  }
  function faqMatch(a, D) {
    let best = null, bs = 0;
    for (const f of D.faqs) {
      let s = 0;
      for (const k of f.K) { if (k.includes(" ")) { if (a.n.includes(k)) s += 2; } else if (a.stems.includes(stem(k)) || (k.length > 3 && a.n.includes(k))) s += STOP.has(stem(k)) ? 0.5 : 1; }
      if (s > bs) { bs = s; best = f; }
    }
    return { faq: best, score: bs };
  }

  // ---------- language (English / Kiswahili) ----------
  const SW = new Set("habari hujambo mambo vipi sasa naomba nataka ninataka nahitaji kuna jinsi bei gani wapi nini nitapata nawezaje tafadhali asante shukrani karibu kwaheri msaada wasiliana huduma tangazo matangazo punguzo kitabu vitabu mitihani mtihani maelezo bure malipo lipa nunua kununua mwalimu somo masomo kozi zaidi ndio hapana pia yako yangu kwa nipe nionyeshe ninaweza naweza unaweza kuhusu ya za wa".split(" "));
  const SW_STRONG = new Set("habari hujambo mambo vipi naomba nataka ninataka nahitaji jinsi nitapata nawezaje tafadhali asante shukrani karibu kwaheri msaada wasiliana huduma tangazo matangazo punguzo vitabu mitihani mtihani maelezo bure malipo nunua kununua nipe nionyeshe ninaweza naweza unaweza kuhusu wapi nini gani".split(" "));
  const L = {
    en: {
      greet: "Hi 👋 What are you looking for?", thanks: "You're welcome! Anything else I can find?", bye: "Bye! Come back anytime 👋",
      bot: "I'm a helper bot that searches this site live — not a person and not an AI model. For anything personal, use the <a href=\"/contact\">contact form</a>.",
      help: "Try: <b>free notes</b>, <b>past papers</b>, <b>study units</b>, <b>latest posts</b>, <b>how do I order</b>, <b>summarise this post</b>, <b>my CV</b>, or just type a topic like <b>anatomy</b> or <b>sterile technique</b>.",
      contact: "The quickest way is WhatsApp, or the <a href=\"/contact\">contact page</a>.", order: "Free materials download directly. For paid ones: open the item → <b>Order</b>, pay by M-Pesa, paste the confirmation message and tell us where to send the link. Got a discount code? Type it on the order page. The link is sent after payment is verified.",
      coupon: "Discount codes work on <b>paid materials</b>: open the item → <b>Order</b>, type the code and press <b>Apply</b>. Codes can be limited to a number of buyers, so use yours early.",
      found: "Here's what I found", foundN: (n) => `Here's what I found (${n}):`, best: "Best match", more: (n) => `${n} more — say <b>"more"</b>.`, allDone: "That's everything for that search.", nothingMore: "That's all I have for that. Try another topic?",
      none: "I couldn't find that. Try different words, browse below, or leave your details and Ezra will reply.", broad: (n) => `That's broad (${n} results). Pick one to narrow it down, or say <b>more</b>:`,
      price: (p) => `It costs <b>KES ${p}</b>.`, free: "It's <b>free</b> to download.", postFree: "That's a free post — just open it.", noItem: "Which one do you mean? Ask me for a topic first, then I can tell you about it.",
      leadHead: "Leave your details and Ezra will get back to you:", leadName: "Your name", leadWhere: "Phone or email", leadMsg: "Your question", leadSend: "Send to Ezra", leadOk: "Sent ✓ Ezra will reply to you soon.", leadBad: "Please add your name and a phone number or email.",
      sponsored: "Sponsored", summaryOf: "Quick summary", related: "Related", noPost: "Open a post or a material page first, then ask me to summarise it.", read: "Read more", open: "Open", download: "Download",
      services: "Here are the services available:", cvText: "Here's Ezra's CV — you can view it online and save it as a PDF.", adText: "Want your business, college or brand in front of our readers? See the advertising options (banners, in-article ads and social posts):",
      waText: "Chat with Ezra on WhatsApp:", rate: "You're sending a lot of messages — give it a few minutes, or use the contact page.", error: "Something went wrong. Please try again.",
      placeholder: "Ask for notes, past papers, posts…", hello: "Need notes or past papers? Ask me 👋", helloPost: "Want a quick summary of this post? 👋", helloMat: "Looking for a specific past paper? Ask me 👋",
    },
    sw: {
      greet: "Habari 👋 Unatafuta nini?", thanks: "Karibu! Kuna kingine ninaweza kukusaidia kutafuta?", bye: "Kwaheri! Karibu tena 👋",
      bot: "Mimi ni roboti msaidizi inayotafuta kwenye tovuti hii moja kwa moja — si mtu wala si AI. Kwa mambo binafsi tumia <a href=\"/contact\">ukurasa wa mawasiliano</a>.",
      help: "Jaribu: <b>maelezo ya bure</b>, <b>mitihani ya zamani</b>, <b>makala mpya</b>, <b>jinsi ya kuagiza</b>, <b>fupisha makala hii</b>, <b>CV yako</b>, au andika mada kama <b>anatomia</b>.",
      contact: "Njia ya haraka ni WhatsApp, au <a href=\"/contact\">ukurasa wa mawasiliano</a>.", order: "Vitabu vya bure vinapakuliwa moja kwa moja. Vya kulipia: fungua kitabu → <b>Order</b>, lipa kwa M-Pesa, bandika ujumbe wa uthibitisho na utuambie tutume wapi kiungo. Una nambari ya punguzo? Iandike kwenye ukurasa wa kuagiza. Kiungo hutumwa baada ya malipo kuthibitishwa.",
      coupon: "Nambari za punguzo zinafanya kazi kwenye <b>vitabu vya kulipia</b>: fungua kitabu → <b>Order</b>, andika nambari na bonyeza <b>Apply</b>. Nambari huwa na idadi ndogo ya wanunuzi, kwa hiyo itumie mapema.",
      found: "Hiki ndicho nilichopata", foundN: (n) => `Hiki ndicho nilichopata (${n}):`, best: "Inayofaa zaidi", more: (n) => `${n} zaidi — andika <b>"zaidi"</b>.`, allDone: "Hizo ndizo zote kwa utafutaji huo.", nothingMore: "Hiyo ndiyo yote niliyo nayo. Jaribu mada nyingine?",
      none: "Sikuweza kupata hilo. Jaribu maneno mengine, au acha maelezo yako na Ezra atakujibu.", broad: (n) => `Hiyo ni pana (matokeo ${n}). Chagua moja kupunguza, au andika <b>zaidi</b>:`,
      price: (p) => `Bei yake ni <b>KES ${p}</b>.`, free: "Ni <b>bure</b> kupakua.", postFree: "Hiyo ni makala ya bure — ifungue tu.", noItem: "Unamaanisha ipi? Niulize mada kwanza, kisha nitakueleza zaidi.",
      leadHead: "Acha maelezo yako na Ezra atakujibu:", leadName: "Jina lako", leadWhere: "Simu au barua pepe", leadMsg: "Swali lako", leadSend: "Tuma kwa Ezra", leadOk: "Imetumwa ✓ Ezra atakujibu hivi karibuni.", leadBad: "Tafadhali weka jina lako na simu au barua pepe.",
      sponsored: "Tangazo", summaryOf: "Muhtasari mfupi", related: "Zinazohusiana", noPost: "Fungua makala au kitabu kwanza, kisha niombe nikufupishie.", read: "Soma zaidi", open: "Fungua", download: "Pakua",
      services: "Huduma zinazopatikana:", cvText: "Hii ni CV ya Ezra — unaweza kuiona mtandaoni na kuihifadhi kama PDF.", adText: "Unataka biashara, chuo au chapa yako ionekane na wasomaji wetu? Tazama chaguo za matangazo:",
      waText: "Ongea na Ezra kwenye WhatsApp:", rate: "Unatuma ujumbe mwingi — subiri dakika chache, au tumia ukurasa wa mawasiliano.", error: "Kuna hitilafu. Tafadhali jaribu tena.",
      placeholder: "Uliza maelezo, mitihani, makala…", hello: "Unahitaji maelezo au mitihani? Niulize 👋", helloPost: "Unataka muhtasari wa makala hii? 👋", helloMat: "Unatafuta mtihani maalum? Niulize 👋",
    },
  };

  // ---------- UI ----------
  function build() {
    const toggle = document.createElement("button");
    toggle.id = "eo-chat-toggle"; toggle.setAttribute("aria-label", "Open helper chat");
    toggle.innerHTML = `<img src="/assets/avatar-illustration.jpg" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"><span class="eo-badge" hidden></span>`;
    const win = document.createElement("div");
    win.id = "eo-chat-window"; win.setAttribute("role", "dialog"); win.setAttribute("aria-label", "Helper chat");
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    win.innerHTML = `<div class="titlebar"><span id="eo-chat-title">ASK-EZRA.EXE</span><span><button type="button" id="eo-chat-clear" aria-label="Clear chat" title="Clear chat">↺</button><button type="button" id="eo-chat-close" aria-label="Close">✕</button></span></div>
      <div id="eo-chat-log" aria-live="polite"></div><div id="eo-chat-chips"></div>
      <form id="eo-chat-form"><input id="eo-chat-input" type="text" placeholder="Ask for notes, past papers, posts…" autocomplete="off" maxlength="200" />${SR ? `<button type="button" id="eo-chat-mic" aria-label="Speak" title="Speak your question">🎤</button>` : ""}<button type="submit">Send</button></form>`;
    document.body.append(toggle, win);
    const log = win.querySelector("#eo-chat-log"), input = win.querySelector("#eo-chat-input"), chips = win.querySelector("#eo-chat-chips");
    const badge = toggle.querySelector(".eo-badge");
    if (!sessionStorage.getItem("eo_chat_seen")) badge.hidden = false;
    let hist = []; try { hist = JSON.parse(sessionStorage.getItem(HKEY) || "[]"); } catch {}
    const CK = "eo_chat_ctx";
    const ctx = Object.assign({ topic: [], item: null, lang: /^sw/i.test(navigator.language || "") ? "sw" : "en", n: 0, spAt: -9, items: [], shown: 0 }, (() => { try { return JSON.parse(sessionStorage.getItem(CK) || "{}"); } catch { return {}; } })());
    ctx.items = []; ctx.shown = 0;
    const saveCtx = () => { try { sessionStorage.setItem(CK, JSON.stringify({ topic: ctx.topic, item: ctx.item, lang: ctx.lang, n: ctx.n, spAt: ctx.spAt })); } catch {} };
    const tr = () => L[ctx.lang] || L.en;
    const save = () => { try { sessionStorage.setItem(HKEY, JSON.stringify(hist.slice(-40))); } catch {} };
    const scroll = () => { log.scrollTop = log.scrollHeight; };
    const pushHist = (m) => { hist.push(m); save(); };
    const hhmm = (d = new Date()) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const plain = (el) => { const c = el.cloneNode(true); c.querySelectorAll(".eo-meta,.eo-fb,form,.eo-actions,.eo-sp").forEach((x) => x.remove()); return c.innerText.trim(); };

    function decorate(d, who, opts) {
      const meta = document.createElement("div"); meta.className = "eo-meta";
      meta.innerHTML = `<small>${hhmm()}</small>` + (who === "bot" && !opts.nocopy ? `<button type="button" class="eo-copy" title="Copy or share this answer" aria-label="Copy this answer">⧉</button>` : "");
      d.appendChild(meta);
    }
    function add(html, who, opts = {}) {
      const d = document.createElement("div"); d.className = "msg " + who; d.innerHTML = html; log.appendChild(d);
      if (!opts.raw) decorate(d, who, opts);
      if (who === "bot" && opts.fb) {
        const f = document.createElement("div"); f.className = "eo-fb"; f.innerHTML = `<button type="button" data-v="1" aria-label="Helpful">👍</button><button type="button" data-v="-1" aria-label="Not helpful">👎</button>`;
        f.addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; window.EO_DB.push("chat_feedback", { q: String(opts.q || "").slice(0, 200), a: opts.kind || "", v: +b.dataset.v, ts: Date.now() }).catch(() => {}); window.EO_DB.increment("chat_stats/" + (b.dataset.v === "1" ? "up" : "down")).catch(() => {}); f.textContent = ctx.lang === "sw" ? "Asante kwa maoni" : "Thanks for the feedback"; });
        d.appendChild(f);
      }
      scroll();
      return d;
    }
    const text = (s) => E(s).replace(/\n/g, "<br>");
    function bot(html, o) { const d = add(html, "bot", o); pushHist({ w: "bot", h: html }); return d; }
    function typing() { return add('<span class="eo-dots"><i></i><i></i><i></i></span>', "bot", { raw: true }); }
    const actions = (list) => `<div class="eo-actions">${list.filter(Boolean).map((a) => `<a class="btn sm${a.p ? " primary" : ""}" href="${E(a.href)}"${a.ext ? ' target="_blank" rel="noopener"' : ""}>${E(a.label)}</a>`).join("")}</div>`;
    const link = (h, t) => `<a href="${h}">${t}</a>`;

    function cardHtml(it) {
      const act = [];
      if (it.kind === "material") {
        if (it.access === "paid") act.push(`<a class="btn primary sm" href="/materials/order/${E(it.slug)}">Order · KES ${E(it.price)}</a>`);
        else if (it.drive) act.push(`<a class="btn primary sm" data-dl="${E(it.slug)}" href="${E(window.EO_DRIVE.download(it.drive))}" target="_blank" rel="noopener">${tr().download}</a>`);
      }
      act.push(`<a class="btn sm" href="${E(it.url)}">${it.kind === "material" ? "Details" : tr().open}</a>`);
      return `<div class="eo-card">${it.image ? window.EO_UTIL.timg(it.image, "") : ""}<div class="eo-card-b"><span class="eo-tag">${E(it.type)}</span><strong>${E(it.title)}</strong><span>${E((it.snippet || "").slice(0, 110))}${(it.snippet || "").length > 110 ? "…" : ""}</span><div class="eo-card-a">${act.join("")}</div></div></div>`;
    }
    // a short passage of the item that talks about the question (so people get an answer, not just a link)
    function excerpt(it, a, n) {
      n = n || 240;
      const body = String(it.body || it.snippet || "").replace(/\s+/g, " ").trim(); if (!body) return "";
      const sents = body.split(/(?<=[.!?])\s+/).filter((x) => x.length > 25);
      let best = -1, bs = 0;
      if (a && a.content.length) sents.forEach((s, i) => { const t = new Set(toks(s).map(stem)); let sc = 0; a.content.forEach((w) => { if (t.has(w)) sc++; }); if (sc > bs) { bs = sc; best = i; } });
      const pick = (best >= 0 ? sents.slice(best, best + 2) : sents.slice(0, 2)).join(" ") || body;
      return pick.length > n ? pick.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : pick;
    }
    const remember = (it, a) => { if (it) ctx.item = { slug: it.slug, kind: it.kind }; if (a && a.content.length) ctx.topic = a.content.slice(0, 4); saveCtx(); };
    const itemOf = (D) => (ctx.item ? D.index.find((x) => x.slug === ctx.item.slug && x.kind === ctx.item.kind) : null);
    const pageItem = (D) => { const p = location.pathname.replace(/\/$/, "") || "/"; return D.index.find((x) => x.url && (x.url === p || x.url === p + "/")) || null; };
    const related = (D, it, n) => { const tg = new Set((it.tags || []).concat(it.category || [])); return D.index.filter((x) => x !== it && x.kind === it.kind && [].concat(x.tags || [], x.category || []).some((t) => tg.has(t))).slice(0, n || 3); };

    function showItems(items, intro, q, kind, a) {
      ctx.items = items; ctx.shown = Math.min(3, items.length);
      let h = `<p>${intro}</p>`;
      const top = items[0];
      if (a && top && top.kind !== "material" && a.content.length) { const ex = excerpt(top, a); if (ex) h += `<div class="eo-quote"><small>${tr().best}</small><strong>${E(top.title)}</strong><p>“${E(ex)}”</p><a class="btn primary sm" href="${E(top.url)}">${tr().read} →</a></div>`; ctx.shown = Math.min(4, items.length); h += items.slice(1, 3).map(cardHtml).join(""); }
      else h += items.slice(0, 3).map(cardHtml).join("");
      if (items.length > ctx.shown) h += `<p class="eo-more">${tr().more(items.length - ctx.shown)}</p>`;
      const d = bot(h, { fb: true, q, kind });
      remember(top, a);
      setChips(ctx.lang === "sw" ? ["Zaidi", "Vitabu vya bure", "Wasiliana"] : ["Show more", "Free materials", "Contact"]);
      return d;
    }
    function setChips(list) { chips.innerHTML = list.slice(0, 6).map((c) => `<button type="button">${E(c)}</button>`).join(""); }
    const pageChips = (D) => {
      const it = pageItem(D), p = location.pathname;
      if (it && it.kind !== "material") return ctx.lang === "sw" ? ["Fupisha makala hii", "Makala zinazohusiana", "Vitabu vya bure"] : ["Summarise this post", "Related posts", "Free materials"];
      if (/^\/materials/.test(p)) return ctx.lang === "sw" ? ["Mitihani ya zamani", "Maelezo ya bure", "Jinsi ya kuagiza", "Nambari ya punguzo"] : ["Past papers", "Free notes", "How do I order?", "Discount code"];
      return D.config.chips;
    };

    // ----- hidden /admin command -----
    function adminLogin() {
      try { if (JSON.parse(localStorage.getItem("eo_admin_session") || "null")) { add("<p>Opening the console…</p>", "bot"); location.href = "/admin/"; return; } } catch {}
      const d = add(`<form class="eo-login"><input type="email" name="e" placeholder="Email" autocomplete="username" required><input type="password" name="p" placeholder="Password" autocomplete="current-password" required><button class="btn primary sm" type="submit">Sign in</button><small class="eo-lerr"></small></form>`, "bot", { raw: true });
      const f = d.querySelector("form"), er = f.querySelector(".eo-lerr");
      f.querySelector("input").focus();
      f.addEventListener("submit", async (ev) => {
        ev.preventDefault(); er.textContent = "…";
        const key = window.EO_FIREBASE_CONFIG.apiKey, db = window.EO_FIREBASE_CONFIG.databaseURL;
        try {
          const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${key}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: f.e.value.trim(), password: f.p.value, returnSecureToken: true }) });
          const j = await r.json(); if (!r.ok) throw 0;
          const me = await (await fetch(`${db}/admins/${j.localId}.json?auth=${j.idToken}`)).json(); if (!me) throw 0;
          localStorage.setItem("eo_admin_session", JSON.stringify({ refreshToken: j.refreshToken, email: j.email, uid: j.localId }));
          er.textContent = "Welcome back. Redirecting…"; location.href = "/admin/";
        } catch { er.textContent = "Sign-in failed."; f.p.value = ""; }
      });
    }

    // ----- lead capture: when the bot can't help, offer to pass the question to Ezra -----
    const leadHtml = (q) => { const T = tr(); return `<p>${T.leadHead}</p><form class="eo-lead"><input name="n" placeholder="${E(T.leadName)}" maxlength="80" required><input name="w" placeholder="${E(T.leadWhere)}" maxlength="120" required><textarea name="m" rows="2" maxlength="400" placeholder="${E(T.leadMsg)}">${E(q)}</textarea><input name="website" tabindex="-1" autocomplete="off" class="hp" aria-hidden="true"><button class="btn primary sm" type="submit">${E(T.leadSend)}</button><small class="eo-lerr"></small></form>`; };
    log.addEventListener("submit", async (ev) => {
      const f = ev.target.closest("form.eo-lead"); if (!f) return; ev.preventDefault();
      const er = f.querySelector(".eo-lerr"), T = tr(); if (f.website.value) return;
      const who = f.w.value.trim(), isMail = /^\S+@\S+\.\S+$/.test(who), digits = who.replace(/\D/g, "");
      if (!f.n.value.trim() || !(isMail || digits.length >= 9)) { er.textContent = T.leadBad; return; }
      if (!rateOk()) { er.textContent = T.rate; return; }
      er.textContent = "…";
      try {
        await window.EO_DB.push("contact_inbox", { name: f.n.value.trim().slice(0, 100), message: ("[Chatbot] " + f.m.value.trim()).slice(0, 3000), email: isMail ? who.slice(0, 150) : "", phone: isMail ? "" : who.slice(0, 30), subject: "Chatbot question", ts: Date.now(), status: "new", page: location.pathname.slice(0, 200) });
        stat("leads"); f.outerHTML = `<p><b>${T.leadOk}</b></p>`;
      } catch { er.textContent = T.error; }
    });

    // ----- answering -----
    function rateOk() { const now = Date.now(); let t = []; try { t = JSON.parse(localStorage.getItem(RATE) || "[]").filter((x) => now - x < 600000); } catch {} if (t.length >= 25) return false; t.push(now); try { localStorage.setItem(RATE, JSON.stringify(t)); } catch {} return true; }
    const stat = (k) => window.EO_DB.increment("chat_stats/" + k).catch(() => {});
    const waLink = (D, msg) => { const w = (D.site && D.site.whatsapp) || {}, n = String(w.primary || (w.numbers || [])[0] || "").replace(/\D/g, "").replace(/^0/, "254"); return n ? `https://wa.me/${n}?text=${encodeURIComponent(msg || w.message || "Hello Ezra")}` : ""; };
    function detectLang(q) {
      const w = toks(q); if (!w.length) return;
      const hits = w.filter((x) => SW.has(x)).length, strong = w.filter((x) => SW_STRONG.has(x)).length;
      if (strong >= 1 || hits >= 2) ctx.lang = "sw"; else if (w.length >= 3 && hits === 0) ctx.lang = "en";
    }
    const FILTERISH = new Set(["free", "paid", "paper", "notes", "unit", "post", "book", "material", "download", "pdf", "price", "order", "cv", "template", "more", "other", "another", "one", "ones", "also", "too"]);

    // sponsored suggestion (labelled, tracked, never in quiet topics): at most once in every 4 answers
    async function maybeSponsor(msgEl, D) {
      if (D.config.sponsor === false || !window.EO_ADS || !window.EO_ADS.chatAd || ctx.n - ctx.spAt < 4) return;
      const host = document.createElement("div"); host.className = "eo-sp-wrap"; host.innerHTML = `<small>${E(tr().sponsored)}</small>`;
      if (await window.EO_ADS.chatAd(host)) { msgEl.appendChild(host); ctx.spAt = ctx.n; saveCtx(); scroll(); }
    }

    async function answer(q) {
      const D = await data();
      detectLang(q); const T = tr();
      let a = analyse(q, D); const a0 = a;
      let it = intent(a);
      stat("total"); ctx.n++;
      // follow-ups: "and the price?", "free ones?", "more about it" — use what we were just talking about
      const topicWords = ctx.topic.slice();
      const onlyFilter = !a.content.some((w) => !FILTERISH.has(w) && !STOP.has(w));
      if (!it && onlyFilter && topicWords.length && /^(and|what about|how about|na|vipi|what of|only|just|ones?)\b/.test(a.n) || (!it && onlyFilter && topicWords.length && a.has("free", "paid", "paper", "notes") && a.words.length <= 4)) { a = analyse(topicWords.join(" ") + " " + q, D); }
      const note = (k) => stat("i_" + k);
      const say = (html, chipsList, o) => { const d = bot(html, o); if (chipsList) setChips(chipsList); return d; };
      if (it === "greet") { note("greet"); return say(`<p>${T.greet}</p>`, pageChips(D)); }
      if (it === "thanks") { note("thanks"); return say(`<p>${T.thanks}</p>`, pageChips(D)); }
      if (it === "bye") return say(`<p>${T.bye}</p>`);
      if (it === "botinfo") { note("botinfo"); return say(`<p>${T.bot}</p>`, pageChips(D)); }
      if (it === "help") { note("help"); return say(`<p>${T.help}</p>`, pageChips(D)); }
      if (it === "contact") { note("contact"); const w = waLink(D); return say(`<p>${T.contact}</p>` + actions([w && { label: "WhatsApp", href: w, ext: 1, p: 1 }, { label: ctx.lang === "sw" ? "Mawasiliano" : "Contact page", href: "/contact" }]), ctx.lang === "sw" ? ["Vitabu vya bure", "Makala mpya"] : ["Free materials", "Latest posts"]); }
      if (it === "order") { note("order"); return say(`<p>${T.order}</p>` + actions([{ label: ctx.lang === "sw" ? "Vitabu vyote" : "All materials", href: "/materials", p: 1 }]), ["Free materials", "Past papers"]); }
      if (it === "more") {
        if (ctx.items.length > ctx.shown) { const nxt = ctx.items.slice(ctx.shown, ctx.shown + 3); ctx.shown += nxt.length; return bot(nxt.map(cardHtml).join("") + (ctx.items.length > ctx.shown ? `<p class="eo-more">${T.more(ctx.items.length - ctx.shown)}</p>` : `<p class="eo-more">${T.allDone}</p>`)); }
        return say(`<p>${T.nothingMore}</p>`, pageChips(D));
      }
      if (it === "latest-posts") { note("latest"); const items = D.index.filter((x) => x.kind === "blog").sort((x, y) => (y.date || "").localeCompare(x.date || "")); return items.length ? showItems(items, ctx.lang === "sw" ? "Makala mpya:" : "Latest blog posts:", q, "latest") : bot("<p>No posts yet.</p>"); }
      if (it === "latest-materials") { note("materials"); const items = D.index.filter((x) => x.kind === "material"); return items.length ? showItems(items, ctx.lang === "sw" ? "Vitabu:" : "Materials:", q, "materials") : bot("<p>No materials yet.</p>"); }

      // ----- site actions -----
      const n = a.n;
      if (/\b(summari[sz]e|tl;?dr|fupisha|muhtasari)\b/.test(n) || /\bwhat('s| is) this (post|page|article)\b/.test(n)) {
        note("summary");
        const cur = pageItem(D) || itemOf(D);
        if (!cur) return say(`<p>${T.noPost}</p>`, pageChips(D));
        const sents = String(cur.body || cur.snippet || "").replace(/\s+/g, " ").split(/(?<=[.!?])\s+/).filter((x) => x.length > 30).slice(0, 3).join(" ");
        const rel = related(D, cur, 2); remember(cur, null);
        return say(`<div class="eo-quote"><small>${T.summaryOf}</small><strong>${E(cur.title)}</strong><p>${E((sents || cur.snippet || "").slice(0, 420))}${(sents || "").length > 420 ? "…" : ""}</p><a class="btn primary sm" href="${E(cur.url)}">${T.read} →</a></div>` + (rel.length ? `<p><b>${T.related}:</b></p>` + rel.map(cardHtml).join("") : ""), pageChips(D), { fb: true, q, kind: "summary" });
      }
      if (/\b(related|similar|more like|zinazohusiana)\b/.test(n) && /\b(post|posts|article|articles|makala)\b|\brelated\b/.test(n)) {
        note("related");
        const cur = pageItem(D) || itemOf(D);
        if (cur) { const rel = related(D, cur, 4); if (rel.length) return showItems(rel, `${T.related}:`, q, "related"); }
        return say(`<p>${T.noPost}</p>`, pageChips(D));
      }
      if (a.has("cv") && a.words.length <= 6) { note("cv"); return say(`<p>${T.cvText}</p>` + actions([{ label: "CV", href: "/cv", p: 1 }]), pageChips(D)); }
      if (a.has("advertise") && a.words.length <= 8) { note("advertise"); return say(`<p>${T.adText}</p>` + actions([{ label: ctx.lang === "sw" ? "Matangazo" : "Advertise", href: "/advertise", p: 1 }, { label: ctx.lang === "sw" ? "Akaunti ya mfadhili" : "Sponsor portal", href: "/sponsor/" }]), pageChips(D)); }
      if (a.has("coupon") || /\bdiscount code|promo code\b/.test(n)) { note("coupon"); return say(`<p>${T.coupon}</p>` + actions([{ label: ctx.lang === "sw" ? "Vitabu vya kulipia" : "Paid materials", href: "/materials", p: 1 }]), ["Free materials", "How do I order?"]); }
      if (/\bwhatsapp\b|\bwa\b|\bchat (with|to) ezra\b|\bpiga simu\b/.test(n) && a.words.length <= 6) { const w = waLink(D); if (w) { note("whatsapp"); return say(`<p>${T.waText}</p>` + actions([{ label: "WhatsApp", href: w, ext: 1, p: 1 }]), pageChips(D)); } }
      if (a.has("service") && a.words.length <= 7) {
        const sv = D.services.filter((x) => x && (x.title || x.name));
        if (sv.length) { note("services"); return say(`<p>${T.services}</p><ul class="eo-list">${sv.slice(0, 8).map((x) => `<li><b>${E(x.title || x.name)}</b>${x.description || x.desc ? " — " + E(String(x.description || x.desc).slice(0, 90)) : ""}</li>`).join("")}</ul>` + actions([{ label: "WhatsApp", href: waLink(D, "Hello, I'd like to ask about your services.") || "/contact", ext: 1, p: 1 }]), pageChips(D)); }
      }
      // follow-ups about the last thing shown
      const cur = itemOf(D);
      if (cur && a0.words.length <= 8 && (/\b(it|this|that|hii|hiyo|huu|huo)\b/.test(a0.n) || !a0.content.length || a0.content.every((w) => FILTERISH.has(w) || w === "much" || w === "tell" || w === "detail"))) {
        if (a0.has("price") || /\bhow much\b/.test(a0.n)) { note("followup"); return say(`<p>${cur.kind === "material" ? (cur.access === "paid" ? T.price(cur.price) : T.free) : T.postFree}</p>` + (cur.kind === "material" ? cardHtml(cur) : ""), pageChips(D)); }
        if (a0.has("order", "download", "pay") || /\b(get|buy|nunua)\b/.test(a0.n)) { note("followup"); return say(cardHtml(cur), pageChips(D)); }
        if (/\b(more about|tell me more|details?|explain|elaborate|zaidi kuhusu|eleza)\b/.test(a0.n)) { note("followup"); const ex = excerpt(cur, null, 480); return say(`<div class="eo-quote"><strong>${E(cur.title)}</strong><p>${E(ex)}</p><a class="btn primary sm" href="${E(cur.url)}">${T.read} →</a></div>`, pageChips(D), { fb: true, q, kind: "followup" }); }
      }

      const fm = faqMatch(a, D), sr = search(a, D, ctx);
      const strongFaq = fm.faq && fm.score >= 2;
      if (strongFaq || (fm.faq && fm.score >= 1 && !sr.items.length && a.content.length <= 2)) {
        stat("answered"); note("faq");
        let ans = fm.faq.answer;
        if (ans.includes("{age}")) ans = ans.replace("{age}", (D.profile && window.EO_AGE(D.profile.birth_date)) || "24");
        const d = bot(`<p>${text(ans)}</p>`, { fb: true, q, kind: "faq" }); setChips(pageChips(D));
        return maybeSponsor(d, D);
      }
      if (sr.items.length) {
        stat("answered"); note("search");
        const f = sr.f, what = f.category ? ({ "past-papers": "past papers", notes: "notes", "study-units": "study units", templates: "templates" }[f.category] || "materials") : "results";
        const hasFilter = f.category || f.access || f.kind;
        const broad = sr.items.length >= 8 && a.content.length <= 1 && !hasFilter;
        const intro = broad ? T.broad(sr.items.length) : f.category || f.access ? `${f.access ? (f.access === "free" ? "Free " : "Paid ") : ""}${what} — ${sr.items.length}:` : T.foundN(sr.items.length);
        const d = showItems(sr.items, intro, q, "search", a);
        if (broad) {   // ask what they mean: offer the most common tags / sections among the results
          const cnt = {}; sr.items.forEach((x) => [].concat(x.tags || [], x.category || []).forEach((t) => { if (t && !a.content.includes(stem(String(t).toLowerCase()))) cnt[t] = (cnt[t] || 0) + 1; }));
          const top = Object.entries(cnt).sort((x, y) => y[1] - x[1]).slice(0, 4).map(([t]) => `${a.raw} ${String(t).replace(/-/g, " ")}`);
          if (top.length) setChips(top.concat(ctx.lang === "sw" ? ["Zaidi"] : ["Show more"]));
        }
        return maybeSponsor(d, D);
      }
      // nothing found: learn from it, and offer to pass it on to Ezra
      stat("unanswered"); note("none");
      window.EO_DB.push("chat_unanswered", { q: q.slice(0, 200), ts: Date.now(), page: location.pathname }).catch(() => {});
      const hasLead = D.config.lead !== false;
      bot(`<p>${text(ctx.lang === "sw" ? T.none : D.config.fallback || T.none)}</p><p>${link("/search?q=" + encodeURIComponent(q), ctx.lang === "sw" ? "Tafuta kwenye tovuti" : "Search the site")}</p>` + (hasLead ? leadHtml(q) : `<p>${link("/contact", ctx.lang === "sw" ? "Tuma ujumbe kwa Ezra" : "Send Ezra a message")}</p>`), { fb: true, q, kind: "none" });
      setChips(pageChips(D));
    }

    async function send(q) {
      q = q.trim().slice(0, 200); if (!q) return;
      add(E(q), "user");
      if (/^\/admin$/i.test(q)) return adminLogin();        // hidden command: not stored, not suggested
      pushHist({ w: "user", h: E(q) });
      if (!rateOk()) { bot(`<p>${tr().rate}</p>`); return; }
      chips.innerHTML = "";
      const t = typing();
      try { await new Promise((r) => setTimeout(r, 350)); await answer(q); saveCtx(); } catch (e) { bot(`<p>${tr().error}</p>`); }
      t.remove();
    }

    // ----- opening, greeting bubble, mobile keyboard -----
    const fit = () => { if (window.visualViewport && innerWidth <= 640 && win.classList.contains("open")) win.style.maxHeight = Math.max(260, visualViewport.height - 24) + "px"; else win.style.maxHeight = ""; };
    if (window.visualViewport) visualViewport.addEventListener("resize", fit);
    let hello = null;
    const closeHello = () => { if (hello) { hello.remove(); hello = null; } };
    async function open() {
      closeHello(); win.classList.add("open"); badge.hidden = true; sessionStorage.setItem("eo_chat_seen", "1"); fit();
      const D = await data();
      document.getElementById("eo-chat-title").textContent = D.config.name;
      if (!log.children.length) {
        if (hist.length) hist.forEach((m) => { const d = document.createElement("div"); d.className = "msg " + m.w; d.innerHTML = m.h; log.appendChild(d); }); else bot(`<p>${text(ctx.lang === "sw" ? "Habari! Mimi ni roboti msaidizi (si mtu, si AI). Naweza kutafuta makala, maelezo, mitihani ya zamani na vitabu vya Ezra. Unatafuta nini?" : D.config.welcome)}</p>`);
        scroll();
      }
      input.placeholder = tr().placeholder;
      if (!chips.children.length) setChips(pageChips(D));
      input.focus();
    }
    function toggleChat() { if (win.classList.contains("open")) { win.classList.remove("open"); fit(); } else open(); }
    toggle.addEventListener("click", toggleChat);
    win.querySelector("#eo-chat-close").addEventListener("click", () => { win.classList.remove("open"); fit(); });
    win.querySelector("#eo-chat-clear").addEventListener("click", () => { hist = []; save(); log.innerHTML = ""; ctx.items = []; ctx.topic = []; ctx.item = null; saveCtx(); open(); });
    win.querySelector("form").addEventListener("submit", (e) => { e.preventDefault(); const v = input.value; input.value = ""; send(v); });
    chips.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) send(b.textContent); });
    log.addEventListener("click", async (e) => {
      const a = e.target.closest("[data-dl]"); if (a) { window.EO_DB.increment(`material_stats/${a.dataset.dl}/downloads`).catch(() => {}); return; }
      const c = e.target.closest(".eo-copy"); if (c) {
        const msg = c.closest(".msg"), t = plain(msg);
        try { if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) await navigator.share({ text: t, url: location.href }); else { await navigator.clipboard.writeText(t); c.textContent = "✓"; setTimeout(() => (c.textContent = "⧉"), 1500); } } catch {}
      }
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") { win.classList.remove("open"); fit(); } });
    // voice input (Chrome / Android) — free, uses the browser's own speech recognition
    const mic = win.querySelector("#eo-chat-mic");
    if (mic && SR) mic.addEventListener("click", () => {
      try {
        const r = new SR(); r.lang = ctx.lang === "sw" ? "sw-KE" : "en-KE"; r.interimResults = false; r.maxAlternatives = 1;
        mic.classList.add("on"); r.onresult = (ev) => { const t = ev.results[0][0].transcript; stat("voice"); send(t); }; r.onend = () => mic.classList.remove("on"); r.onerror = () => mic.classList.remove("on"); r.start();
      } catch { mic.classList.remove("on"); }
    });
    // friendly nudge once per visit (never on admin / sponsor pages, never if already opened)
    data().then((D) => {
      if (D.config.greeting === false || sessionStorage.getItem("eo_chat_seen") || sessionStorage.getItem("eo_chat_hello") || /^\/(admin|sponsor)\b/.test(location.pathname)) return;
      setTimeout(() => {
        if (win.classList.contains("open") || sessionStorage.getItem("eo_chat_seen")) return;
        sessionStorage.setItem("eo_chat_hello", "1");
        const it = pageItem(D), T = tr(), msg = D.config.hello_text || (it && it.kind !== "material" ? T.helloPost : /^\/materials/.test(location.pathname) ? T.helloMat : T.hello);
        hello = document.createElement("div"); hello.id = "eo-chat-hello"; hello.innerHTML = `<button type="button" class="eo-hello-x" aria-label="Dismiss">×</button><span>${E(msg)}</span>`;
        hello.addEventListener("click", (e) => { if (e.target.closest(".eo-hello-x")) closeHello(); else open(); });
        document.body.appendChild(hello); setTimeout(closeHello, 14000);
      }, window.__EO_HELLO_MS || 7000);
    }).catch(() => {});
  }

  // render only when the bot is enabled in chatbot_config
  Promise.resolve(window.EO_DB.getNode("chatbot_config")).then((c) => { if (c && c.enabled === false) return; build(); });
})();
