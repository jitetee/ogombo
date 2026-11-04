// ============================================================
// Ads engine. Everything is driven by the Realtime Database:
//   ads            the ads themselves (own promos + paid sponsor ads)
//   ad_settings    {enabled, rotate_seconds, types:{<type>:true|false}}  -> admin "Ads → Ad types" switches
//   ad_stats       per ad / per day counters (views, clicks, uniques, placement, device)
//   ad_pages       per ad / per page counters
//   ad_images      small uploaded pictures (ads whose image is "db:<id>")
//
// An ad has: headline, link (+ body, cta, image, accent, sponsor label), placement, active ("yes"/"no"),
// optional start / end (YYYY-MM-DD). `placement` is one type or a comma list, e.g. "header,inline".
// Legacy value "all" = header + inline. Turning a type off in ad_settings hides it for visitors.
//
// Header, footer, popup, slide-in, side rail and text links mount themselves. Other spots use
//   <div data-ad-slot="inline|end_of_post|materials|home_strip"></div>   (no value = inline)
// plus EO_ADS.placeInGrid / placeInArticle / placeRelated / placeSearch, called by the page scripts.
// ============================================================
(function () {
  const TYPES = [
    { key: "header", label: "Header banner (sticky)", fmt: "banner", desc: "Sits in the sticky header on every page, beside the logo. Rotates every few seconds." },
    { key: "footer", label: "Sticky footer bar", fmt: "banner", desc: "Sticky bar fixed to the bottom of the screen on every page. Rotates; visitors can close it." },
    { key: "inline", label: "Between-post card", fmt: "card", desc: "Card between posts in the blog / content lists and on the home page. Rotates." },
    { key: "in_article", label: "In-article ad", fmt: "card", desc: "Card inside a post after the 3rd paragraph (and the 9th in long posts). Rotates." },
    { key: "end_of_post", label: "End-of-post banner", fmt: "card", desc: "Card right after the article. Rotates." },
    { key: "related", label: "Sponsored related post", fmt: "card", desc: "A card in the 'Related posts' row, labelled Sponsored." },
    { key: "search", label: "Search sponsored result", fmt: "card", desc: "First result on the search page, labelled Sponsored." },
    { key: "materials", label: "Materials page ad", fmt: "card", desc: "Card on study-material pages near the download. Rotates." },
    { key: "home_strip", label: "Home sponsor strip", fmt: "strip", desc: "A row of partner cards on the home page." },
    { key: "text_links", label: "Sponsored text links", fmt: "text", desc: "Plain text links in the footer. Needs only a headline and link." },
    { key: "side_rail", label: "Side rail", fmt: "rail", desc: "Tall card beside the page on wide screens (1280px+). Rotates." },
    { key: "slide_in", label: "Slide-in card", fmt: "card", desc: "Slides in after the reader scrolls 60% of a page; once per visit." },
    { key: "popup", label: "Corner popup", fmt: "card", desc: "Small card in the bottom-left corner after 8 seconds; once per visit." },
  ];
  const TYPE_KEYS = TYPES.map((t) => t.key);
  const ACCENT = { green: "var(--crt-green, #3ddc84)", amber: "var(--amber, #ffb703)", magenta: "var(--magenta, #ff3d81)" };
  const SKIP = /^\/(receipt|materials\/order|admin|sponsor)/;
  const onSkipPage = () => SKIP.test(location.pathname);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const store = {
    get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch {} },
  };
  const local = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  };
  const isExt = (u) => /^https?:/i.test(u) && u.indexOf(location.origin) !== 0;
  let UTM_ON = true;
  // external links get utm tags so a sponsor can see the traffic in their own analytics
  function tagUrl(u, a) {
    if (!UTM_ON || !a || !isExt(u) || /[?&]utm_source=/.test(u)) return u;
    try {
      const x = new URL(u);
      x.searchParams.set("utm_source", location.hostname); x.searchParams.set("utm_medium", "sponsored"); x.searchParams.set("utm_campaign", String(a._key || a.id || "ad"));
      return x.href;
    } catch { return u; }
  }
  // WhatsApp "lead" ads: the button opens a chat with the sponsor (counted separately as a lead)
  const waDigits = (n) => { let d = String(n || "").replace(/\D/g, ""); if (d.startsWith("0")) d = "254" + d.slice(1); return d; };
  const leadUrl = (a) => { const d = waDigits(a && a.lead_wa); return d.length >= 9 ? `https://wa.me/${d}?text=${encodeURIComponent(`Hello, I saw your ad "${a.headline}" on Ezra Ogombo.`)}` : ""; };
  const linkAttrs = (u, a) => { const L = leadUrl(a); if (L) return `href="${esc(L)}" target="_blank" rel="sponsored noopener" data-lead="1"`; return `href="${esc(tagUrl(u, a))}"${isExt(u) ? ' target="_blank" rel="sponsored noopener"' : ""}`; };
  // visitor traits used for language / country targeting and the slow-connection mode (nothing is stored or sent)
  const VIS = window.__EO_VIS || { sw: /^sw/i.test(navigator.language || ""), ke: (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone === "Africa/Nairobi"; } catch { return false; } })() };
  const LITE = (() => { try { const c = navigator.connection; return !!(c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || ""))); } catch { return false; } })();
  function audienceOk(a) {
    if (a.lang === "sw" && !VIS.sw) return false; if (a.lang === "en" && VIS.sw) return false;
    if (a.geo === "ke" && !VIS.ke) return false; if (a.geo === "intl" && VIS.ke) return false;
    return true;
  }
  const hiddenIds = () => (local.get("eo_ad_hidden") || "").split(",").filter(Boolean);
  const isQuiet = () => local.get("eo_ad_quiet") === "1";
  const pageNo = (() => { let n = 0; try { n = Number(sessionStorage.getItem("eo_pv") || 0) + 1; sessionStorage.setItem("eo_pv", String(n)); } catch { n = 2; } return n; })();
  const key = (a) => a._key || a.id || "";
  const today = () => new Date().toISOString().slice(0, 10);
  const HEX = /^#[0-9a-fA-F]{6}$/;
  const accentOf = (a) => (HEX.test(a.color || "") ? a.color : ACCENT[a.accent] || ACCENT.green);
  const AD_LABEL = () => (window.EO_AD_LABEL || "").trim();
  const tag = (a) => `<span class="ad-tag">${esc(a.sponsor || AD_LABEL() || "Ad")}</span><span class="ad-why" role="button" tabindex="0" title="Why am I seeing this ad?" aria-label="Why am I seeing this ad?">ⓘ</span>`;

  // ---------- which ads are eligible ----------
  function placesOf(a) {
    const raw = String(a.placement || "inline").toLowerCase().split(/[,\s]+/).filter(Boolean);
    const out = [];
    raw.forEach((p) => { if (p === "all") out.push("header", "inline"); else if (TYPE_KEYS.includes(p)) out.push(p); });
    return out.length ? Array.from(new Set(out)) : ["inline"];
  }
  function isLive(a) {
    if (!a || !a.headline || !a.link || !key(a)) return false;
    if (a.active === false || String(a.active).toLowerCase() === "no") return false;
    const t = today();
    if (a.start && t < a.start) return false;
    if (a.end && t > a.end) return false;
    return true;
  }
  // Per-ad schedule (Kenya time, UTC+3): days_of_week "1,2,3" (0=Sun) and hour_from/hour_to (0-24).
  function scheduleOk(a) {
    const n = new Date(Date.now() + 3 * 3600e3), dow = n.getUTCDay(), h = n.getUTCHours();
    const days = String(a.days_of_week == null ? "" : a.days_of_week).split(/[,\s]+/).filter((x) => x !== "").map(Number);
    if (days.length && !days.includes(dow)) return false;
    const f = a.hour_from === "" || a.hour_from == null ? null : Number(a.hour_from), t = a.hour_to === "" || a.hour_to == null ? null : Number(a.hour_to);
    if (f != null && t != null && !isNaN(f) && !isNaN(t)) { if (f <= t ? !(h >= f && h < t) : !(h >= f || h < t)) return false; }
    return true;
  }
  // A/B groups: ads sharing the same "ab" name are variants; each visitor session sees one of them.
  function abPick(list) {
    const groups = {};
    list.forEach((a) => { if (a.ab) (groups[a.ab] = groups[a.ab] || []).push(a); });
    const drop = new Set();
    Object.keys(groups).forEach((g) => {
      const v = groups[g]; if (v.length < 2) return;
      let id = null; try { id = sessionStorage.getItem("eo_ab_" + g); } catch {}
      let w = v.find((a) => key(a) === id);
      if (!w) { w = v[Math.floor(Math.random() * v.length)]; try { sessionStorage.setItem("eo_ab_" + g, key(w)); } catch {} }
      v.forEach((a) => { if (a !== w) drop.add(a); });
    });
    return list.filter((a) => !drop.has(a));
  }
  function shuffle(list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  // Targeting: an ad with "tags" only shows beside posts that carry one of those tags. (Header, footer and text links load
  // before the post is known, so they are never targeted.)
  const NO_TARGET = ["header", "footer", "text_links"];
  function tagsOk(a, type) {
    const want = String(a.tags || "").toLowerCase().split(/[,;]+/).map((x) => x.trim()).filter(Boolean);
    if (!want.length || NO_TARGET.includes(type)) return true;
    const have = window.EO_PAGE_TAGS;
    if (!Array.isArray(have)) return true;            // not a post page (home, lists): show normally
    return want.some((t) => have.includes(t));
  }
  // Weighted rotation: ad_settings.weights {adId: 1..5}; heavier ads appear more often in the rotation (max 12 slides).
  function weighted(list, weights) {
    if (!weights || list.length > 6) return list;
    const rounds = [];
    list.forEach((a) => { const w = Math.max(1, Math.min(5, Math.round(Number(weights[key(a)]) || 1))); for (let i = 0; i < w; i++) (rounds[i] = rounds[i] || []).push(a); });
    return rounds.flat().slice(0, 12);
  }
  // Frequency cap for popup / slide-in: at most N per browser per day (0 = no limit).
  function capOk(S) {
    if (!(S.fcap > 0)) return true;
    const d = today(), raw = (local.get("eo_ad_pop_day") || "").split(":");
    return !(raw[0] === d && Number(raw[1]) >= S.fcap);
  }
  function capHit() { const d = today(), raw = (local.get("eo_ad_pop_day") || "").split(":"); local.set("eo_ad_pop_day", d + ":" + (raw[0] === d ? Number(raw[1]) + 1 : 1)); }
  let adsP = null, setP = null;
  const loadAds = () => adsP || (adsP = (async () => {
    try {
      const [r, pz] = await Promise.all([window.EO_DB.getNode("ads"), Promise.resolve(window.EO_DB.getNode("ad_pause")).catch(() => null)]);
      const paused = pz || {};
      const now = Date.now();
      const isPaused = (a) => { const p = a.request && paused[a.request]; return !!(p && now >= p.from_ms && now < p.until_ms); };
      return abPick((Array.isArray(r) ? r : []).filter((a) => isLive(a) && scheduleOk(a) && audienceOk(a) && !isPaused(a) && !hiddenIds().includes(key(a))));
    } catch { return []; }
  })());
  function loadSettings() {
    if (!setP) setP = (async () => {
      let s = null;
      try { s = await window.EO_DB.getNode("ad_settings"); } catch {}
      if (s && s.look && s.look.label) window.EO_AD_LABEL = String(s.look.label);
      s = s && typeof s === "object" && !Array.isArray(s) ? s : {};
      let secs = Number(s.rotate_seconds);
      if (!(secs >= 3 && secs <= 60)) { try { const ss = await window.EO_DB.getNode("site_settings"); secs = Number(ss && ss.ad_rotate_seconds); } catch {} }
      if (!(secs >= 3 && secs <= 60)) secs = 10;
      UTM_ON = s.utm !== false;
      const fc = Number(s.freq_cap);
      const lk = s.look || {};
      try {
        const rt = document.documentElement.style;
        if (lk.fade >= 20 && lk.fade <= 100) rt.setProperty("--ad-fade", String(lk.fade / 100));
        if (lk.radius >= 0 && lk.radius <= 24) rt.setProperty("--ad-radius", lk.radius + "px");
      } catch {}
      return { enabled: s.enabled !== false, secs, types: s.types || {}, weights: s.weights || {}, fcap: fc >= 0 ? fc : 2, look: lk, nopop: String(s.no_popup_tags || "").toLowerCase().split(/[,;]+/).map((x) => x.trim()).filter(Boolean) };
    })();
    return setP;
  }
  const typeOn = (S, t) => S.enabled && S.types[t] !== false;
  const used = new Map();           // how many times an ad has been put on this page (so spots show different ads)
  async function poolFor(type) {
    if (onSkipPage()) return { list: [], secs: 10 };
    const [S, ads] = await Promise.all([loadSettings(), loadAds()]);
    if (!typeOn(S, type)) return { list: [], secs: S.secs };
    const pool = shuffle(ads.filter((a) => placesOf(a).includes(type) && tagsOk(a, type))).sort((a, b) => (used.get(key(a)) || 0) - (used.get(key(b)) || 0));
    if (pool[0]) used.set(key(pool[0]), (used.get(key(pool[0])) || 0) + 1);
    const pins = pool.filter((a) => a.pin === true || a.pin === "yes"), rest = pool.filter((a) => !pins.includes(a));
    return { list: weighted(pins.concat(rest), S.weights), secs: S.secs, S };
  }

  // ---------- images ----------
  function imgTag(a, cls) {
    if (!a.image || LITE) return "";
    if (String(a.image).startsWith("db:")) return `<img class="${cls}" data-db="${esc(String(a.image).slice(3))}" alt="" loading="lazy">`;
    return `<img class="${cls}" src="${esc(a.image)}" alt="" loading="lazy" onerror="this.remove()">`;
  }
  const imgCache = new Map();
  function hydrate(root) {
    root.querySelectorAll("img[data-db]").forEach((im) => {
      const k = im.dataset.db;
      if (!imgCache.has(k)) imgCache.set(k, window.EO_DB ? window.EO_DB.getPath("ad_images/" + k).then((v) => (typeof v === "string" ? v : null)) : Promise.resolve(null));
      imgCache.get(k).then((u) => { if (u) im.src = u; else im.remove(); });
      im.removeAttribute("data-db");
    });
  }

  // ---------- slide markup per format ----------
  const R = {
    banner: (a) => `<a class="ad-slide" ${linkAttrs(a.link, a)} style="--ad:${accentOf(a)}">${imgTag(a, "ad-thumb")}<span class="ad-copy">${tag(a)}<strong>${esc(a.headline)}</strong>${a.body ? `<span class="ad-sub">${esc(a.body)}</span>` : ""}</span><span class="ad-go">${esc(a.cta || "Open")} →</span></a>`,
    card: (a) => `<div class="ad-card" style="--ad:${accentOf(a)}">${imgTag(a, "ad-card-img")}<div class="ad-card-body">${tag(a)}<h3>${esc(a.headline)}</h3>${a.body ? `<p>${esc(a.body)}</p>` : ""}<a class="btn" ${linkAttrs(a.link, a)}>${esc(a.cta || "Learn more")} →</a></div></div>`,
    rail: (a) => `<div class="ad-rail-card" style="--ad:${accentOf(a)}">${imgTag(a, "ad-rail-img")}<div class="ad-card-body">${tag(a)}<h3>${esc(a.headline)}</h3>${a.body ? `<p>${esc(a.body)}</p>` : ""}<a class="btn" ${linkAttrs(a.link, a)}>${esc(a.cta || "Learn more")} →</a></div></div>`,
    strip: (a) => `<div class="ad-mini" style="--ad:${accentOf(a)}">${imgTag(a, "ad-mini-img")}<div class="ad-mini-body">${tag(a)}<strong>${esc(a.headline)}</strong>${a.body ? `<p>${esc(a.body)}</p>` : ""}<a class="btn sm" ${linkAttrs(a.link, a)}>${esc(a.cta || "Open")} →</a></div></div>`,
    text: (a) => `<a class="ad-textlink" ${linkAttrs(a.link, a)} style="--ad:${accentOf(a)}">${esc(a.headline)}</a>`,
  };
  // markup used by the sponsor / admin previews (same CSS as the live site)
  function previewHTML(a, type) {
    const t = TYPES.find((x) => x.key === type) || TYPES[0], f = t.fmt;
    const body = R[f](a).replace(/href="[^"]*"/g, 'href="#" onclick="return false"').replace(/ target="_blank" rel="sponsored noopener"/g, "");
    if (f === "banner") return `<div class="ad-bar" style="border:1px solid var(--panel-border)"><div class="wrap ad-bar-in"><div class="ad-rot"><div class="ad-rs-wrap"><div class="ad-rs on">${body}</div></div></div></div></div>`;
    if (f === "rail") return `<div style="max-width:200px">${body}</div>`;
    if (f === "text") return `<p class="ad-links"><span class="ad-tag">Sponsored links</span> ${body}</p>`;
    return body;
  }

  // ---------- tracking (batched, viewability-based) ----------
  const T = (function () {
    const q = new Map();
    let timer = null;
    const base = () => window.EO_FIREBASE_CONFIG && window.EO_FIREBASE_CONFIG.databaseURL;
    const bot = /bot|crawl|spider|slurp|headless|lighthouse|preview/i.test(navigator.userAgent || "") || navigator.webdriver;
    const enabled = () => !!base() && !onSkipPage() && (window.__EO_AD_TEST || (!bot && !/^(localhost|127\.|\[::1\])/.test(location.hostname)));
    const hr = () => String(new Date(Date.now() + 3 * 3600e3).getUTCHours()).padStart(2, "0");
    const dev = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent || "") ? "m" : "d";
    const day = () => new Date().toISOString().slice(0, 10);
    const pk = () => (location.pathname.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 60) || "home");
    function add(path, k, n) { const o = q.get(path) || {}; o[k] = (o[k] || 0) + (n || 1); q.set(path, o); }
    function schedule() { if (!timer) timer = setTimeout(() => flush(false), 8000); }
    function flush(keep) {
      if (timer) { clearTimeout(timer); timer = null; }
      if (!q.size || !enabled()) { q.clear(); return; }
      q.forEach((o, path) => {
        const body = {}; Object.keys(o).forEach((k) => (body[k] = { ".sv": { increment: Math.min(o[k], 100) } }));
        try { fetch(`${base()}/${path}.json`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: !!keep }).catch(() => {}); } catch {}
      });
      q.clear();
    }
    function view(id, pl) {
      if (!id || !enabled()) return;
      const d = day();
      add(`ad_stats/${id}/${d}`, "v"); add(`ad_stats/${id}/${d}`, "vp_" + pl); add(`ad_stats/${id}/${d}`, "vd_" + dev); add(`ad_stats/${id}/${d}`, "vh_" + hr());
      add(`ad_pages/${id}/${pk()}`, "v");
      const uk = `eo_u:${id}:${d}`;
      if (!local.get(uk)) { local.set(uk, "1"); add(`ad_stats/${id}/${d}`, "u"); }
      schedule();
    }
    function hide(id) { if (!id || !enabled()) return; add(`ad_stats/${id}/${day()}`, "x"); schedule(); }
    function click(id, pl, lead) {
      if (!id || !enabled()) return;
      const d = day();
      if (lead) add(`ad_stats/${id}/${d}`, "ld");
      add(`ad_stats/${id}/${d}`, "c"); add(`ad_stats/${id}/${d}`, "cp_" + pl); add(`ad_stats/${id}/${d}`, "cd_" + dev); add(`ad_stats/${id}/${d}`, "ch_" + hr());
      add(`ad_pages/${id}/${pk()}`, "c");
      flush(true);
    }
    document.addEventListener("visibilitychange", () => { if (document.hidden) flush(true); });
    window.addEventListener("pagehide", () => flush(true));
    return { view, click, hide, flush };
  })();
  // "Why am I seeing this?" popover: hide this ad / quiet mode
  let whyEl = null;
  const closeWhy = () => { if (whyEl) { whyEl.remove(); whyEl = null; } };
  function goneCheck() {
    document.querySelectorAll(".ad-rot").forEach((h) => { if (!h.querySelector(".ad-rs:not(.ad-gone)")) { const box = h.closest(".hdr-ad, .ad-foot, .ad-pop, [data-ad-slot]") || h; box.style.display = "none"; } });
  }
  function openWhy(btn) {
    closeWhy();
    const unitEl = btn.closest("[data-ad]"); if (!unitEl) return;
    const id = unitEl.dataset.ad, r = btn.getBoundingClientRect();
    whyEl = document.createElement("div"); whyEl.className = "ad-why-pop"; whyEl.setAttribute("role", "dialog");
    whyEl.innerHTML = `<p>This is a <strong>paid ad</strong>. Ads keep this site free. They are chosen for the page you are on, never from your personal data.</p><button type="button" data-a="hide">Hide this ad</button><button type="button" data-a="quiet">${isQuiet() ? "Turn quiet mode off" : "Quiet mode: no popups"}</button><a href="/advertise">Advertise here</a><button type="button" data-a="x" aria-label="Close">×</button>`;
    document.body.appendChild(whyEl);
    const w = whyEl.offsetWidth, top = Math.min(innerHeight - whyEl.offsetHeight - 8, r.bottom + 6);
    whyEl.style.top = Math.max(8, top) + "px"; whyEl.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left)) + "px";
    whyEl.addEventListener("click", (e) => {
      const a = e.target.closest("[data-a]"); if (!a) return;
      if (a.dataset.a === "hide") {
        const ids = hiddenIds(); if (!ids.includes(id)) ids.push(id); local.set("eo_ad_hidden", ids.slice(-60).join(","));
        T.hide(id);
        document.querySelectorAll('[data-ad="' + id.replace(/"/g, "") + '"]').forEach((n) => n.classList.add("ad-gone"));
        const on = document.querySelector(".ad-rs.on.ad-gone"); if (on) { const host = on.closest(".ad-rot"), nx = host && host.querySelector(".ad-rs:not(.ad-gone)"); on.classList.remove("on"); if (nx) nx.classList.add("on"); }
        goneCheck();
      } else if (a.dataset.a === "quiet") { local.set("eo_ad_quiet", isQuiet() ? "0" : "1"); if (isQuiet()) document.querySelectorAll(".ad-pop").forEach((n) => n.remove()); }
      closeWhy();
    });
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest(".ad-why");
    if (!b) { if (whyEl && !e.target.closest(".ad-why-pop")) closeWhy(); return; }
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); openWhy(b);
  }, true);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeWhy(); if ((e.key === "Enter" || e.key === " ") && e.target.classList && e.target.classList.contains("ad-why")) { e.preventDefault(); openWhy(e.target); } });
  const trackClick = (e) => {
    const unit = e.target.closest && e.target.closest("[data-ad]");
    if (unit && e.target.closest("a[href]")) T.click(unit.dataset.ad, unit.dataset.pl, !!e.target.closest("a[data-lead]"));
  };
  document.addEventListener("click", trackClick, true);
  document.addEventListener("auxclick", (e) => { if (e.button === 1) trackClick(e); }, true);

  // counts a view once the element is >=50% on screen for 1 second
  function watch(el, ads, pl) {
    const list = Array.isArray(ads) ? ads : [ads];
    if (!("IntersectionObserver" in window)) { list.forEach((a) => T.view(key(a), pl)); return; }
    let t = null, done = false;
    const io = new IntersectionObserver((es) => {
      es.forEach((e) => {
        if (done) return;
        if (e.isIntersecting && e.intersectionRatio >= 0.5 && !document.hidden) { if (!t) t = setTimeout(() => { done = true; io.disconnect(); list.forEach((a) => T.view(key(a), pl)); }, 1000); }
        else if (t) { clearTimeout(t); t = null; }
      });
    }, { threshold: [0, 0.5, 1] });
    io.observe(el);
  }
  const unit = (a, pl, inner, cls) => `<div class="ad-unit ${cls || ""}" data-ad="${esc(key(a))}" data-pl="${pl}">${inner}</div>`;

  // ---------- rotator: shows one ad at a time, changes every few seconds ----------
  function rotator(host, list, pl, o) {
    o = o || {};
    host.classList.add("ad-rot");
    host.innerHTML = `<div class="ad-rs-wrap">${list.map((a, i) => `<div class="ad-rs${i ? "" : " on"}" data-ad="${esc(key(a))}" data-pl="${pl}"${i ? ' aria-hidden="true"' : ""}>${R[o.fmt || "card"](a)}</div>`).join("")}</div>`
      + (list.length > 1 && o.dots !== false ? `<div class="ad-dots">${list.map((_, i) => `<button type="button" aria-label="Show ad ${i + 1}" class="${i ? "" : "on"}" data-i="${i}"></button>`).join("")}</div>` : "");
    hydrate(host);
    const slides = Array.from(host.querySelectorAll(".ad-rs")), dots = Array.from(host.querySelectorAll(".ad-dots button"));
    let cur = 0, timer = null, paused = false, visible = false, vt = null, counted = -1;
    const arm = () => {
      clearTimeout(vt);
      if (visible && !document.hidden && counted !== cur) { const at = cur; vt = setTimeout(() => { if (visible && cur === at) { counted = at; T.view(key(list[at]), pl); } }, 1000); }
    };
    const show = (n) => {
      cur = (n + slides.length) % slides.length;
      for (let g = 0; g < slides.length && slides[cur].classList.contains("ad-gone"); g++) cur = (cur + 1) % slides.length;
      counted = -1;
      slides.forEach((s, i) => { s.classList.toggle("on", i === cur); s.setAttribute("aria-hidden", i === cur ? "false" : "true"); });
      dots.forEach((d, i) => d.classList.toggle("on", i === cur));
      arm();
    };
    const stop = () => { if (timer) clearInterval(timer); timer = null; };
    const start = () => { stop(); if (slides.length > 1) timer = setInterval(() => { if (!paused && !document.hidden) show(cur + 1); }, (o.secs || 5) * 1000); };
    host.addEventListener("mouseenter", () => (paused = true));
    host.addEventListener("mouseleave", () => (paused = false));
    host.addEventListener("focusin", () => (paused = true));
    host.addEventListener("focusout", () => (paused = false));
    dots.forEach((d) => d.addEventListener("click", () => { show(+d.dataset.i); start(); }));
    document.addEventListener("visibilitychange", arm);
    if ("IntersectionObserver" in window) new IntersectionObserver((es) => { visible = es.some((e) => e.isIntersecting && e.intersectionRatio >= 0.5); arm(); }, { threshold: [0, 0.5, 1] }).observe(host);
    else { visible = true; arm(); }
    start();
    return { stop, show };
  }
  const offset = (list, n) => list.slice(n % Math.max(list.length, 1)).concat(list.slice(0, n % Math.max(list.length, 1)));

  // ---------- placements ----------
  async function mountHeader() {
    if (store.get("eo_ad_bar_closed") === "1") return;
    const wrap = document.querySelector("header.site .wrap");
    if (!wrap || wrap.querySelector(".hdr-ad")) return;
    const { list, secs } = await poolFor("header");
    if (!list.length) return;
    const box = document.createElement("aside");
    box.className = "hdr-ad"; box.setAttribute("aria-label", "Sponsored");
    box.innerHTML = `<div class="ad-host"></div><button type="button" class="ad-x" aria-label="Hide ads for this visit">×</button>`;
    const logo = wrap.querySelector(".logo");
    if (logo) logo.after(box); else wrap.prepend(box);
    const r = rotator(box.querySelector(".ad-host"), list, "header", { fmt: "banner", secs });
    box.querySelector(".ad-x").addEventListener("click", () => { r.stop(); box.remove(); store.set("eo_ad_bar_closed", "1"); });
  }
  async function mountFooter() {
    if (store.get("eo_ad_foot_closed") === "1") return;
    const { list, secs } = await poolFor("footer");
    if (!list.length) return;
    const bar = document.createElement("aside");
    bar.className = "ad-foot"; bar.setAttribute("aria-label", "Sponsored");
    bar.innerHTML = `<div class="wrap ad-bar-in"><div class="ad-host"></div><button type="button" class="ad-x" aria-label="Close">×</button></div>`;
    document.body.appendChild(bar); document.body.classList.add("ad-has-foot");
    const r = rotator(bar.querySelector(".ad-host"), list, "footer", { fmt: "banner", secs });
    bar.querySelector(".ad-x").addEventListener("click", () => { r.stop(); bar.remove(); document.body.classList.remove("ad-has-foot"); store.set("eo_ad_foot_closed", "1"); });
  }
  async function mountSlot(slot) {
    const type = slot.getAttribute("data-ad-slot") || "inline";
    if (slot.dataset.adDone) return; slot.dataset.adDone = "1";
    const { list, secs } = await poolFor(type);
    if (!list.length) return;
    if (type === "home_strip") {
      const items = list.slice(0, 4);
      slot.innerHTML = `<h2 class="ad-strip-h">Partners</h2><div class="ad-strip">${items.map((a) => unit(a, type, R.strip(a))).join("")}</div>`;
      hydrate(slot); watch(slot, items, type);
    } else rotator(slot, list, type, { fmt: "card", secs });
  }
  async function renderAdSlot(selector = "[data-ad-slot]") { await Promise.all(Array.from(document.querySelectorAll(selector)).map(mountSlot)); }

  // drops a rotating ad card after every `every` posts of a list grid
  async function placeInGrid(grid, every = 4) {
    if (!grid || onSkipPage()) return;
    grid.querySelectorAll(".ad-card-wrap").forEach((n) => n.remove());
    const cards = Array.from(grid.children).filter((n) => n.classList.contains("post-card"));
    const spots = cards.filter((_, i) => (i + 1) % every === 0 && i !== cards.length - 1);
    for (let i = 0; i < spots.length; i++) {
      const { list, secs } = await poolFor("inline");
      if (!list.length) return;
      const w = document.createElement("div"); w.className = "ad-card-wrap";
      spots[i].after(w);
      rotator(w, offset(list, i), "inline", { fmt: "card", secs });
    }
  }
  async function placeInArticle(root) {
    if (!root || onSkipPage()) return;
    const ps = Array.from(root.querySelectorAll("p")).filter((p) => p.parentElement && (p.parentElement === root || ["DIV", "SECTION", "ARTICLE"].includes(p.parentElement.tagName)) && p.textContent.trim().length > 40);
    if (ps.length < 4) return;
    const marks = ps.length >= 12 ? [2, 8] : [2];
    for (let i = 0; i < marks.length; i++) {
      const { list, secs } = await poolFor("in_article");
      if (!list.length) return;
      const h = document.createElement("div"); h.className = "ad-in-article";
      ps[marks[i]].after(h);
      rotator(h, offset(list, i), "in_article", { fmt: "card", secs });
    }
  }
  async function placeRelated(grid) {
    if (!grid || onSkipPage()) return;
    const { list } = await poolFor("related");
    if (!list.length) return;
    const a = list[0], w = document.createElement("div");
    w.className = "ad-unit ad-related"; w.dataset.ad = key(a); w.dataset.pl = "related";
    w.innerHTML = `<a class="post-card" ${linkAttrs(a.link, a)} style="--ad:${accentOf(a)}">${imgTag(a, "")}<div class="body">${tag(a)}<h3>${esc(a.headline)}</h3>${a.body ? `<p>${esc(a.body)}</p>` : ""}</div></a>`;
    grid.appendChild(w); hydrate(w); watch(w, a, "related");
  }
  async function placeSearch(listEl) {
    if (!listEl || onSkipPage()) return;
    listEl.querySelectorAll(".ad-search").forEach((n) => n.remove());
    const { list } = await poolFor("search");
    if (!list.length) return;
    const a = list[0], w = document.createElement("div");
    w.className = "ad-unit ad-search"; w.dataset.ad = key(a); w.dataset.pl = "search";
    w.innerHTML = R.card(a);
    listEl.prepend(w); hydrate(w); watch(w, a, "search");
  }
  async function mountTextLinks() {
    const foot = document.querySelector("footer.site .wrap");
    if (!foot || foot.querySelector(".ad-links")) return;
    const { list } = await poolFor("text_links");
    if (!list.length) return;
    const items = list.slice(0, 6), p = document.createElement("p");
    p.className = "ad-links";
    p.innerHTML = `<span class="ad-tag">Sponsored links</span> ` + items.map((a) => `<span class="ad-unit" data-ad="${esc(key(a))}" data-pl="text_links">${R.text(a)}</span>`).join('<span class="ad-sep"> · </span>');
    foot.appendChild(p); watch(p, items, "text_links");
  }
  async function mountSideRail() {
    const { list, secs } = await poolFor("side_rail");
    if (!list.length) return;
    const el = document.createElement("aside");
    el.className = "ad-rail"; el.setAttribute("aria-label", "Sponsored");
    document.body.appendChild(el);
    rotator(el, list, "side_rail", { fmt: "rail", secs });
  }
  async function mountSlideIn() {
    if (store.get("eo_ad_slide_seen") === "1" || isQuiet()) return;
    const { list, S } = await poolFor("slide_in");
    if (!list.length || !capOk(S)) return;
    const onScroll = () => {
      const doc = document.documentElement, total = doc.scrollHeight - innerHeight;
      if (total < innerHeight * 0.5 || (scrollY + 0) / total < 0.6) return;
      removeEventListener("scroll", onScroll); store.set("eo_ad_slide_seen", "1"); capHit();
      const a = list[0], el = document.createElement("aside");
      el.className = "ad-pop ad-slide-in ad-unit"; el.dataset.ad = key(a); el.dataset.pl = "slide_in"; el.setAttribute("aria-label", "Sponsored");
      el.innerHTML = `<button type="button" class="ad-x" aria-label="Close">×</button>${R.card(a)}`;
      document.body.appendChild(el); hydrate(el); watch(el, a, "slide_in");
      el.querySelector(".ad-x").addEventListener("click", () => el.remove());
    };
    addEventListener("scroll", onScroll, { passive: true });
  }
  // Pop-ups wait until the visitor is really reading (scrolled ~60% or 20 s on the page), never on the first page of a visit,
  // never in quiet mode, and never on posts tagged in ad_settings.no_popup_tags.
  function whenEngaged(fn) {
    let done = false, t = null;
    const go = () => { if (done) return; done = true; removeEventListener("scroll", on); clearTimeout(t); fn(); };
    const on = () => { const d = document.documentElement, tot = d.scrollHeight - innerHeight; if (tot > 200 && scrollY / tot >= 0.6) go(); };
    addEventListener("scroll", on, { passive: true }); t = setTimeout(go, window.__EO_POP_MS || 20000);
  }
  async function mountPopup() {
    if (isQuiet() || pageNo < 2) return;
    const seen = (store.get("eo_ad_popup_seen") || "").split(",");
    const { list, S } = await poolFor("popup");
    const a = list.find((x) => !seen.includes(key(x)));
    if (!a || !capOk(S)) return;
    whenEngaged(() => {
      if (isQuiet() || (Array.isArray(window.EO_PAGE_TAGS) && (S.nopop || []).some((t) => window.EO_PAGE_TAGS.includes(t)))) return;
      const el = document.createElement("aside");
      el.className = "ad-pop ad-unit"; el.dataset.ad = key(a); el.dataset.pl = "popup"; el.setAttribute("aria-label", "Sponsored");
      el.innerHTML = `<button type="button" class="ad-x" aria-label="Close">×</button>${R.card(a)}`;
      document.body.appendChild(el); hydrate(el); watch(el, a, "popup");
      store.set("eo_ad_popup_seen", seen.concat(key(a)).join(",")); capHit();
      el.querySelector(".ad-x").addEventListener("click", () => el.remove());
    });
  }

  // one clearly-labelled sponsored suggestion for the chat helper (same rules as every other spot: targeting, hidden ads, tracking)
  async function chatAd(host) {
    try {
      const { list } = await poolFor("search"); if (!list.length) return false;
      const a = list[0], el = document.createElement("div");
      el.className = "ad-unit eo-sp"; el.dataset.ad = key(a); el.dataset.pl = "search"; el.innerHTML = R.strip(a);
      host.appendChild(el); hydrate(el); watch(el, a, "search"); return true;
    } catch { return false; }
  }

  // ---------- ad quality score (used by the sponsor form and the admin review) ----------
  function quality(c, o) {
    o = o || {};
    const h = String(c.headline || "").trim(), b = String(c.body || "").trim(), cta = String(c.cta || "").trim(), link = String(c.link || "");
    const all = [h, b, cta, link].join(" ").toLowerCase();
    const rows = [
      [h.length >= 12 && h.length <= 60, `Headline is 12–60 characters (now ${h.length})`, 2],
      [!(h.length > 6 && h === h.toUpperCase()), "Headline is not ALL CAPS", 1],
      [!/[!?]{2,}/.test(h + b), "No “!!!” or “???”", 1],
      [b.length >= 40 && b.length <= 180, `Text is 40–180 characters (now ${b.length})`, 1],
      [cta.length >= 3 && cta.length <= 20, "Button text is short and clear", 1],
      [/^https:\/\//i.test(link) || /^\//.test(link), "Link is secure (https)", 1],
      [!(o.banned || []).some((w) => w && all.includes(w)), "No blocked words", 3],
    ];
    if (o.hasImage !== undefined) rows.push([!!o.hasImage, "Has a picture", 2]);
    const tot = rows.reduce((n, r) => n + r[2], 0), got = rows.reduce((n, r) => n + (r[0] ? r[2] : 0), 0);
    return { score: Math.round((got / tot) * 100), checks: rows.map((r) => ({ ok: !!r[0], label: r[1] })) };
  }

  // ---------- reports (used by the admin and the sponsor portal) ----------
  function dayRange(from, to) {
    const out = [];
    for (let d = new Date(from + "T00:00:00Z"), end = new Date(to + "T00:00:00Z"); d <= end; d = new Date(d.getTime() + 864e5)) out.push(d.toISOString().slice(0, 10));
    return out;
  }
  function summarize(days, from, to) {
    const o = { v: 0, c: 0, u: 0, ld: 0, x: 0, ctr: 0, byDay: [], byPl: {}, byDev: { m: { v: 0, c: 0 }, d: { v: 0, c: 0 } } };
    const list = from && to ? dayRange(from, to) : Object.keys(days || {}).sort();
    list.forEach((d) => {
      const x = (days || {})[d] || {};
      o.v += x.v || 0; o.c += x.c || 0; o.u += x.u || 0; o.ld += x.ld || 0; o.x += x.x || 0;
      o.byDay.push({ d, v: x.v || 0, c: x.c || 0 });
      Object.keys(x).forEach((k) => {
        let m;
        if ((m = k.match(/^vp_(.+)$/))) (o.byPl[m[1]] = o.byPl[m[1]] || { v: 0, c: 0 }).v += x[k];
        else if ((m = k.match(/^cp_(.+)$/))) (o.byPl[m[1]] = o.byPl[m[1]] || { v: 0, c: 0 }).c += x[k];
        else if ((m = k.match(/^vd_([md])$/))) o.byDev[m[1]].v += x[k];
        else if ((m = k.match(/^cd_([md])$/))) o.byDev[m[1]].c += x[k];
      });
    });
    o.ctr = o.v ? (o.c / o.v) * 100 : 0;
    return o;
  }
  function chartSVG(byDay) {
    const W = 640, H = 150, pad = 22, n = byDay.length || 1, max = Math.max(1, ...byDay.map((x) => x.v)), bw = Math.max(2, (W - pad * 2) / n - 2);
    const bars = byDay.map((x, i) => {
      const h = (x.v / max) * (H - pad * 2), ch = (x.c / max) * (H - pad * 2), X = pad + i * ((W - pad * 2) / n);
      return `<g><title>${x.d}: ${x.v} views, ${x.c} clicks</title><rect x="${X}" y="${H - pad - h}" width="${bw}" height="${Math.max(h, x.v ? 1 : 0)}" fill="var(--crt-green-dim,#1f7a4c)"/><rect x="${X}" y="${H - pad - ch}" width="${bw}" height="${Math.max(ch, x.c ? 1 : 0)}" fill="var(--amber,#ffb703)"/></g>`;
    }).join("");
    const first = byDay[0] ? byDay[0].d : "", last = byDay.length ? byDay[byDay.length - 1].d : "";
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Views and clicks per day"><line x1="${pad}" y1="${H - pad}" x2="${W - pad}" y2="${H - pad}" stroke="var(--panel-border,#2a4a3c)"/>${bars}<text x="${pad}" y="${H - 6}" font-size="10" fill="var(--ink-dim,#7fa898)">${first}</text><text x="${W - pad}" y="${H - 6}" font-size="10" text-anchor="end" fill="var(--ink-dim,#7fa898)">${last}</text><text x="${pad}" y="12" font-size="10" fill="var(--ink-dim,#7fa898)">peak ${max} views/day · green = views, amber = clicks</text></svg>`;
  }

  // add several ads' per-day counters together (a package with many ads reports as one campaign)
  function mergeStats(list) {
    const out = {};
    (list || []).forEach((days) => Object.entries(days || {}).forEach(([day, o]) => { out[day] = out[day] || {}; Object.entries(o || {}).forEach(([k, n]) => (out[day][k] = (out[day][k] || 0) + (Number(n) || 0))); }));
    return out;
  }
  // printable report / receipt in a new window (the browser's Print > Save as PDF does the rest)
  function openReport(o) {
    const w = window.open("", "_blank"); if (!w) { alert("Please allow pop-ups to print."); return; }
    const E = esc, num = (n) => Number(n || 0).toLocaleString("en-KE");
    const rows = (o.byPl || []).map((r) => `<tr><td>${E(r.label)}</td><td>${num(r.v)}</td><td>${num(r.c)}</td><td>${r.v ? (r.c / r.v * 100).toFixed(2) : "0.00"}%</td></tr>`).join("");
    const days = (o.byDay || []).slice(-31).map((r) => `<tr><td>${E(r.d)}</td><td>${num(r.v)}</td><td>${num(r.c)}</td></tr>`).join("");
    const soc = (o.socials || []).map((s) => `<li>${E(s.name)}: ${s.url ? (/^https?:/.test(s.url) ? `<a href="${E(s.url)}">${E(s.url)}</a>` : "posted") : "not posted yet"}</li>`).join("");
    const rec = o.receipt ? `<h2>Receipt</h2><table><tbody><tr><td>Receipt for</td><td>${E(o.receipt.name)}</td></tr><tr><td>Package</td><td>${E(o.pkg)}</td></tr><tr><td>Amount paid</td><td>KES ${num(o.receipt.amount)}</td></tr><tr><td>Method / reference</td><td>${E(o.receipt.method)} ${E(o.receipt.code)}</td></tr><tr><td>Verified on</td><td>${E(o.receipt.date)}</td></tr><tr><td>Request no.</td><td>${E(o.id)}</td></tr></tbody></table>` : "";
    w.document.write(`<!doctype html><meta charset="utf-8"><title>${E(o.title)}</title><style>
      body{font:14px/1.5 Helvetica,Arial,sans-serif;color:#111;margin:24px auto;max-width:760px;padding:0 16px}
      h1{font-size:22px;margin:0 0 4px}h2{font-size:15px;margin:22px 0 6px;border-bottom:1px solid #bbb;padding-bottom:3px}
      table{border-collapse:collapse;width:100%;margin:6px 0}td,th{border:1px solid #ccc;padding:5px 8px;text-align:left}th{background:#f3f3f3}
      .cards{display:flex;gap:10px;flex-wrap:wrap}.c{border:1px solid #ccc;border-radius:6px;padding:8px 14px;min-width:120px}.c b{display:block;font-size:20px}
      .muted{color:#555;font-size:12px}tr,li{break-inside:avoid}@media print{button{display:none}}</style>
      <button onclick="print()" style="float:right;padding:6px 14px">Print / Save as PDF</button>
      <h1>${E(o.title)}</h1><div class="muted">${E(o.site || "")} · ${E(o.sponsor || "")} · ${E(o.pkg || "")}${o.start ? " · " + E(o.start) + " to " + E(o.end) : ""}</div>
      ${o.summary ? `<h2>Results</h2><div class="cards"><div class="c"><b>${num(o.summary.v)}</b>views</div><div class="c"><b>${num(o.summary.c)}</b>clicks</div><div class="c"><b>${o.summary.ctr.toFixed(2)}%</b>click rate</div><div class="c"><b>${num(o.summary.u)}</b>unique viewers (daily)</div></div>
      ${rows ? `<h2>Where it showed</h2><table><thead><tr><th>Spot</th><th>Views</th><th>Clicks</th><th>CTR</th></tr></thead><tbody>${rows}</tbody></table>` : ""}
      ${days ? `<h2>Day by day</h2><table><thead><tr><th>Date</th><th>Views</th><th>Clicks</th></tr></thead><tbody>${days}</tbody></table>` : ""}` : ""}
      ${soc ? `<h2>Social posts</h2><ul>${soc}</ul>` : ""}${rec}
      <p class="muted">A view is counted when at least half the ad is on screen for one second. Figures are measured in visitors' browsers and are estimates.</p>`);
    w.document.close();
  }
  // booking slots: avail = {type: [{s,e},...]} (sponsor campaigns), limits = {type: max at the same time}
  const addD = (d, n) => new Date(new Date(d + "T00:00:00Z").getTime() + n * 864e5).toISOString().slice(0, 10);
  function clash(avail, limits, types, start, days) {
    const bad = [];
    types.forEach((t) => {
      const lim = Number((limits || {})[t]); if (!(lim > 0)) return;
      const rs = Object.values((avail || {})[t] || {});
      for (let i = 0; i < days; i++) { const d = addD(start, i); if (rs.filter((r) => r && r.s <= d && r.e >= d).length >= lim) { bad.push(t); break; } }
    });
    return bad;
  }
  function firstFree(avail, limits, types, start, days) {
    for (let i = 0; i <= 180; i++) { const s = addD(start, i); if (!clash(avail, limits, types, s, days).length) return s; }
    return "";
  }
  window.EO_ADS = { chatAd, quality, leadUrl, clash, firstFree, mergeStats, openReport, TYPES, placesOf, isLive, previewHTML, summarize, chartSVG, dayRange, placeInGrid, placeInArticle, placeRelated, placeSearch, renderAdSlot, track: T };
  window.renderAdSlot = renderAdSlot;
  window.placeAdsInGrid = placeInGrid;      // kept for older page scripts

  const boot = () => {
    if (onSkipPage() || !window.EO_DB) return;
    let tries = 0;
    const addQuiet = () => {
      const fl = document.querySelector(".footer-links");
      if (!fl) { if (++tries < 20) setTimeout(addQuiet, 300); return; }
      if (document.getElementById("eo-quiet")) return;
      const q = document.createElement("a"); q.href = "#"; q.id = "eo-quiet"; const paintQ = () => (q.textContent = isQuiet() ? "Ads: quiet mode ON" : "Ads: quiet mode");
      q.title = "Turn off pop-up and slide-in ads on this device"; q.onclick = (e) => { e.preventDefault(); local.set("eo_ad_quiet", isQuiet() ? "0" : "1"); if (isQuiet()) document.querySelectorAll(".ad-pop").forEach((n) => n.remove()); paintQ(); };
      paintQ(); fl.append(" · ", q);
    };
    addQuiet();
    mountHeader(); mountFooter(); mountTextLinks(); mountSideRail(); mountSlideIn(); mountPopup();
    renderAdSlot();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
