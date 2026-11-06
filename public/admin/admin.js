// ============================================================
// Admin console core: REST auth (Firebase email+password), admin-uid
// check, RTDB CRUD helpers, modal/toast, rich-text editor, generic
// CRUD table. Only users whose uid exists under /admins can write.
// ============================================================
(function () {
  const CFG = window.EO_FIREBASE_CONFIG, DB = CFG.databaseURL;
  // Admin menu: 6 groups instead of 14 flat tabs. Every page is still here, just grouped under clearer names.
  const GROUPS = [
    ["Dashboard", [["index", "Dashboard"]]],
    ["Publish", [["content", "Content cards"], ["content-generator", "Content studio"], ["materials", "Materials & orders"], ["videos", "Videos page"]]],
    ["Create", [["whiteboard", "Whiteboard videos"], ["video", "Video studio"]]],
    ["People", [["inbox", "Inbox & comments"], ["support-wall", "Support wall"], ["marketing", "Email tool"]]],
    ["Grow", [["ads", "Ads & sponsors"], ["links", "Short links & QR"]]],
    ["Site", [["data", "Settings & data"], ["merge", "Import & merge"]]],
  ];
  const PAGES = GROUPS.reduce((a, g) => a.concat(g[1]), []);
  const LS = "eo_admin_session";
  let idToken = null, idExp = 0, session = null;

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const slugify = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  const today = () => new Date().toISOString().slice(0, 10);
  const fmt = (ts) => (ts ? new Date(ts).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");
  const $ = (s, r) => (r || document).querySelector(s);

  // ---------- auth ----------
  async function signIn(email, password) {
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${CFG.apiKey}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }) });
    const d = await r.json();
    if (!r.ok) throw new Error((d.error && d.error.message || "Sign-in failed").replace(/_/g, " ").toLowerCase());
    session = { refreshToken: d.refreshToken, email: d.email, uid: d.localId };
    idToken = d.idToken; idExp = Date.now() + (+d.expiresIn - 60) * 1000;
    localStorage.setItem(LS, JSON.stringify(session));
  }
  async function token() {
    if (idToken && Date.now() < idExp) return idToken;
    if (!session) throw new Error("Not signed in");
    const r = await fetch(`https://securetoken.googleapis.com/v1/token?key=${CFG.apiKey}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(session.refreshToken)}` });
    const d = await r.json();
    if (!r.ok) { signOut(true); throw new Error("Session expired"); }
    idToken = d.id_token; idExp = Date.now() + (+d.expires_in - 60) * 1000;
    session.refreshToken = d.refresh_token; session.uid = d.user_id;
    localStorage.setItem(LS, JSON.stringify(session));
    return idToken;
  }
  function signOut(silent) { try { if (session && idToken) fetch(`${DB}/admin_unlock/${session.uid}.json?auth=${idToken}`, { method: "DELETE", keepalive: true }); } catch {}
    localStorage.removeItem(LS); session = null; idToken = null; if (!silent) location.reload(); else location.reload(); }

  // ---------- database ----------
  async function req(method, path, body, qs) {
    const t = await token();
    const res = await fetch(`${DB}/${path}.json?auth=${t}${qs || ""}`, { method, headers: body !== undefined ? { "Content-Type": "application/json" } : undefined, body: body !== undefined ? JSON.stringify(body) : undefined });
    if (!res.ok) { let m = ""; try { m = (await res.json()).error; } catch {} throw new Error(`${res.status} ${m || res.statusText}`); }
    return res.json();
  }
  function audit(op, path) { if (!/^audit_log/.test(path)) req("POST", "audit_log", { ts: Date.now(), uid: session.uid, email: session.email, op, path }).catch(() => {}); }
  // visitors keep a browser copy of rarely-changing nodes; any admin save to one of them moves this stamp so they refresh
  const PUBLIC_NODES = /^\/?(site_settings|profile|status|chatbot_faq|chatbot_config|materials|material_categories|material_bundles|writing_projects|ads|ad_settings|ad_packages|cyber_cafe_services|payment|pages|milestones|interests|occasions|jokes|side_projects|gallery|videos)(\/|$)/;
  let bumpT = null;
  function bump(path) { if (!PUBLIC_NODES.test(path)) return; clearTimeout(bumpT); bumpT = setTimeout(() => req("PUT", "site_changed", { ".sv": "timestamp" }).catch(() => {}), 400); }
  const A = {
    esc, slugify, today, fmt, $,
    patchRoot: async (d) => { const r = await req("PATCH", "", d); if (Object.keys(d || {}).some((k) => PUBLIC_NODES.test(k))) bump("site_settings"); return r; },
    get: (p, shallow, qs) => req("GET", p, undefined, (shallow ? "&shallow=true" : "") + (qs || "")),
    set: async (p, d) => { const r = await req("PUT", p, d); audit("set", p); bump(p); return r; },
    update: async (p, d) => { const r = await req("PATCH", p, d); audit("update", p); bump(p); return r; },
    push: async (p, d) => { const r = await req("POST", p, d); audit("push", p); bump(p); return r; },
    del: async (p) => { const r = await req("DELETE", p); audit("delete", p); bump(p); return r; },
    get session() { return session; },
  };
  const rows = (obj) => Object.entries(obj || {}).map(([k, v]) => (v && typeof v === "object" ? Object.assign({ _key: k }, v) : { _key: k, _v: v }));
  A.rows = rows;

  // ---------- UI helpers ----------
  A.toast = (msg, err) => { const t = document.createElement("div"); t.className = "toast" + (err ? " err" : ""); t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), err ? 6000 : 2600); };
  // short links: every new blog post / content card / material gets its own 6-letter code automatically
  const SHORT_BASE = { blog_posts: "/blog/", content_highlights: "/content/", materials: "/materials/item/" };
  const SHORT_NAME = { blog_posts: "blog", content_highlights: "content", materials: "material" };
  const SHORT_RESERVED = new Set(["search", "report", "admin", "sponsor", "writing", "assets", "about", "blog", "content", "contact", "privacy", "order", "receipt", "materials", "subscribe", "advertise"]);
  A.shortCode = () => { const L = "abcdefghjkmnpqrstuvwxyz"; return [...crypto.getRandomValues(new Uint8Array(6))].map((x) => L[x % L.length]).join(""); };
  A.ensureShort = async (url, title) => {
    try {
      const have = await req("GET", "short_links", undefined, `&orderBy=${encodeURIComponent('"url"')}&equalTo=${encodeURIComponent(JSON.stringify(url))}&limitToFirst=1`).catch(() => null);
      if (have && Object.keys(have).length) return Object.keys(have)[0];
      for (let i = 0; i < 6; i++) {
        const c = A.shortCode(); if (SHORT_RESERVED.has(c)) continue;
        if ((await req("GET", `short_links/${c}/url`).catch(() => null)) != null) continue;
        await req("PUT", `short_links/${c}`, { url, title: String(title || "").slice(0, 120), created: Date.now() });
        return c;
      }
    } catch {}
    return "";
  };
  A.SHORT = { BASE: SHORT_BASE, NAME: SHORT_NAME };
  // dropdown panels (notifications, key): moved to <body> and pinned under their button, so nothing on the page can sit over them
  A.place = (panel, anchor) => {
    if (panel.parentNode !== document.body) document.body.appendChild(panel);
    panel.style.cssText = "position:fixed;z-index:2147483000;background:#0e1613;color:#d6e4dc;opacity:1;max-width:calc(100vw - 16px);font:400 .82rem/1.4 var(--font-mono,monospace);text-transform:none;letter-spacing:0;";
    if (document.documentElement.getAttribute("data-theme") === "light") panel.style.background = "#fff", panel.style.color = "#111";
    const a = anchor.getBoundingClientRect(), w = Math.min(380, window.innerWidth - 16), left = Math.max(8, Math.min(a.left, window.innerWidth - w - 8));
    panel.style.width = w + "px"; panel.style.left = left + "px"; panel.style.top = Math.round(a.bottom + 6) + "px"; panel.style.right = "auto";
  };
  // keep a dropdown panel inside the screen (the header wraps, so a panel can end up past the left or right edge)
  A.fit = (panel) => { panel.style.transform = ""; const r = panel.getBoundingClientRect(), w = window.innerWidth; const dx = r.left < 8 ? 8 - r.left : r.right > w - 8 ? w - 8 - r.right : 0; if (dx) panel.style.transform = `translateX(${dx}px)`; };
  A.modal = (title, body, footer, wide) => {
    const bg = document.createElement("div"); bg.className = "modal-bg";
    bg.innerHTML = `<div class="modal" ${wide ? 'style="max-width:1000px"' : ""}><div class="mh"><strong>${esc(title)}</strong><button class="btn sm" data-x type="button">✕</button></div><div class="mb"></div><div class="mf"></div></div>`;
    const m = { el: bg, body: $(".mb", bg), foot: $(".mf", bg), close: () => bg.remove() };
    if (typeof body === "string") m.body.innerHTML = body; else m.body.appendChild(body);
    if (footer) m.foot.append(...footer); else m.foot.remove();
    $("[data-x]", bg).onclick = m.close;
    document.body.appendChild(bg);
    return m;
  };
  A.confirm = (msg) => new Promise((res) => {
    const ok = Object.assign(document.createElement("button"), { className: "btn danger", textContent: "Confirm", type: "button" });
    const no = Object.assign(document.createElement("button"), { className: "btn", textContent: "Cancel", type: "button" });
    const m = A.modal("Please confirm", `<p>${esc(msg)}</p>`, [no, ok]);
    ok.onclick = () => { m.close(); res(true); }; no.onclick = () => { m.close(); res(false); };
  });
  A.btn = (label, cls, fn) => { const b = document.createElement("button"); b.type = "button"; b.className = "btn " + (cls || ""); b.textContent = label; if (fn) b.onclick = fn; return b; };
  A.pill = (v) => `<span class="pill ${esc(v)}">${esc(v || "—")}</span>`;
  A.download = (name, text, type) => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: type || "text/plain" })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); };
  A.csv = (name, data) => { const q = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`; A.download(name, data.map((r) => r.map(q).join(",")).join("\n"), "text/csv"); };
  A.driveImg = (url) => { const m = String(url).match(/\/d\/([\w-]{10,})/) || String(url).match(/[?&]id=([\w-]{10,})/); return m ? `https://drive.google.com/thumbnail?id=${m[1]}&sz=w1200` : url; };
  A.tabs = (host, tabs, onSelect) => {
    host.innerHTML = `<div class="adm-tabs">${tabs.map(([k, l]) => `<button type="button" data-t="${k}">${esc(l)}</button>`).join("")}</div>`;
    const sel = (k) => { host.querySelectorAll("[data-t]").forEach((b) => b.classList.toggle("on", b.dataset.t === k)); history.replaceState(null, "", "#" + k); onSelect(k); };
    host.querySelectorAll("[data-t]").forEach((b) => (b.onclick = () => sel(b.dataset.t)));
    sel(tabs.find(([k]) => "#" + k === location.hash) ? location.hash.slice(1) : tabs[0][0]);
  };

  // ---------- page chrome + login gate ----------
  // ---------- second step: 6-digit access key ----------
  // /access_key {current, next, week_start} lives in the database (nobody can read it until unlocked). After the password
  // works, the admin types the key; the database rules compare it and write /admin_unlock/<uid> (valid 11 h). When the week
  // changes, last week's "next" key becomes the one that works, and the first login of the new week creates the next one.
  const WEEK = 604800000;
  const mondayUTC = () => { const d = new Date(); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); };
  const ALPHA = "abcdefghjkmnpqrstuvwxyz23456789";   // no 0/o/1/l/i, so keys are easy to read out
  const rand6 = () => { for (;;) { const c = [...crypto.getRandomValues(new Uint8Array(6))].map((x) => ALPHA[x % ALPHA.length]).join(""); if (/\d/.test(c) && /[a-z]/.test(c)) return c.slice(0, 3) + "-" + c.slice(3); } };
  // what the person typed -> the forms to try (3r5-t7g, 3r5t7g, 3R5 T7G, or an old 6-digit key)
  function keyForms(t) {
    const c = String(t || "").toLowerCase().replace(/[\s-]/g, "");
    if (!/^[a-z0-9]{6}$/.test(c)) return [];
    const h = c.slice(0, 3) + "-" + c.slice(3);
    return /^\d{6}$/.test(c) ? [c, h] : [h];
  }
  async function isUnlocked() { try { const u = await req("GET", `admin_unlock/${session.uid}/until`); return Number(u) > Date.now() + 60000; } catch { return false; } }
  function keyGate() {
    return new Promise((resolve) => {
      const main = $("main"); main.hidden = true;
      const g = document.createElement("div"); g.className = "adm-gate crt-window";
      g.innerHTML = `<div class="titlebar"><span class="dot r"></span><span class="dot y"></span><span class="dot g"></span><span class="label">access key</span></div><div class="body"><form><div class="field"><label>Access key (like 3r5-t7g)</label><input name="k" maxlength="8" autocomplete="one-time-code" autocapitalize="off" autocorrect="off" spellcheck="false" required autofocus></div><button class="btn primary" type="submit">Unlock</button> <button class="btn sm" type="button" data-out>Sign out</button><p class="form-status mono" id="k-msg"></p></form></div>`;
      document.body.appendChild(g);
      const f = $("form", g), m = $("#k-msg", g); let bad = 0;
      $("[data-out]", g).onclick = () => signOut();
      f.onsubmit = async (e) => {
        e.preventDefault(); m.textContent = "Checking…";
        const forms = keyForms(f.k.value); let last = "";
        for (const k of forms) {
          try { await req("PUT", `admin_unlock/${session.uid}`, Object.assign({ key: k, until: Date.now() + 10 * 3600e3 }, /^\d{6}$/.test(k) ? { keyn: parseInt(k, 10) } : {})); g.remove(); resolve(k); return; }
          catch (er) { last = String(er.message || er).slice(0, 60); }
        }
        bad++; m.textContent = forms.length ? "That key isn't right, or the database rules aren't updated yet. (" + last + ")" : "Type the key like 3r5-t7g.";
        await new Promise((r) => setTimeout(r, Math.min(8000, 800 * bad))); f.k.value = "";
      };
    });
  }
  // after unlocking: swap to the new week's key if it is time, and make sure next week's key exists
  async function rotateKey() {
    try {
      const ak = (await req("GET", "access_key")) || {};
      const wk = mondayUTC(), ws = Number(ak.week_start) || 0;
      const fmtK = (v) => (v == null || v === "" ? "" : /^\d+$/.test(String(v)) ? String(v).padStart(6, "0") : String(v));
      let cur = fmtK(ak.current), nxt = fmtK(ak.next), swapped = false;
      if (nxt && Date.now() >= ws + WEEK) { cur = nxt; swapped = true; }          // the key announced last week is now the active one
      if (swapped || ws < wk || !nxt) {
        do { nxt = rand6(); } while (nxt === cur);
        await req("PUT", "access_key", { current: cur, next: nxt, week_start: ws < wk ? wk : ws > Date.now() - WEEK ? ws : wk });
      }
      return nxt;
    } catch { return ""; }
  }
  // the key button + dropdown panel (same look as the notification bell)
  function mountKeyPanel(autoOpen) {
    const host = $(".adm-user"); if (!host || $("#key-panel")) return;
    const wrap = document.createElement("div"); wrap.className = "bell-wrap";
    wrap.innerHTML = `<button type="button" class="btn sm" id="adm-key" aria-expanded="false" title="Next week's access key">🔑 key</button><div class="bell-panel" id="key-panel" hidden></div>`;
    host.insertBefore(wrap, host.firstChild);
    const btn = $("#adm-key", wrap), panel = $("#key-panel", wrap);
    const close = () => { panel.hidden = true; btn.setAttribute("aria-expanded", "false"); };
    const paint = (nxt, err) => {
      const mail = `mailto:${encodeURIComponent(session.email)}?subject=${encodeURIComponent("Admin access key for next week")}&body=${encodeURIComponent("Your admin access key for next week is " + (nxt || "") + ". It works from Monday 03:00 (Nairobi).")}`;
      panel.innerHTML = `<div class="bell-head"><strong>Access key</strong><span class="hint">from Monday 03:00</span></div>
        <div style="padding:.9rem .8rem">${nxt ? `<p style="margin:0 0 .3rem;font-size:.8rem;color:var(--ink-dim)">Next week's key:</p><p class="mono" style="font-size:1.9rem;letter-spacing:.12em;margin:.2rem 0 .6rem;color:var(--ink)">${esc(nxt)}</p><p class="hint" style="margin:0">Keep it private. This week's key keeps working until then. A new key is made at the first login of each week.</p>` : `<p style="margin:0">${esc(err || "Loading…")}</p>`}</div>
        <div class="bell-foot"><span>${nxt ? `<button class="btn sm" type="button" data-copy>Copy</button> <a class="btn sm" href="${mail}">Email it to me</a>` : ""}</span><button class="btn sm" type="button" data-close>Close</button></div>`;
      const c = $("[data-copy]", panel); if (c) c.onclick = async (e) => { try { await navigator.clipboard.writeText(nxt); e.target.textContent = "Copied ✓"; } catch {} };
      $("[data-close]", panel).onclick = close;
    };
    async function open() {
      panel.hidden = false; btn.setAttribute("aria-expanded", "true"); paint(""); A.place(panel, btn);
      try { let n = await req("GET", "access_key/next"); if (!n) n = await rotateKey(); paint(n ? String(n) : "", "Couldn't read or create the key. Check that access_key exists in the database."); }
      catch (e) { paint("", "Key error: " + e.message); }
    }
    btn.onclick = (e) => { e.stopPropagation(); if (panel.hidden) { const b = document.getElementById("bell-panel"); if (b) b.hidden = true; open(); } else close(); };
    document.addEventListener("click", (e) => { if (!panel.hidden && !wrap.contains(e.target) && !panel.contains(e.target)) close(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
    if (autoOpen) open();
  }

  A.guard = async (pageKey) => {
    document.body.classList.add("admin");
    const href = (k) => `/admin/${k === "index" ? "" : k}`;
    const grp = GROUPS.find((g) => g[1].some((p) => p[0] === pageKey)) || GROUPS[0];
    const nav = GROUPS.map((g) => `<a href="${href(g[1][0][0])}" class="${g === grp ? "on" : ""}">${g[0]}</a>`).join("");
    const sub = grp[1].length > 1 ? `<nav class="adm-sub wrap">${grp[1].map(([k, l]) => `<a href="${href(k)}" class="${k === pageKey ? "on" : ""}">${l}</a>`).join("")}</nav>` : "";
    document.body.insertAdjacentHTML("afterbegin", `<header class="site"><div class="wrap"><a class="logo" href="/admin/">admin</a><nav class="adm-nav">${nav}</nav><div class="adm-user"><a href="/" target="_blank" rel="noopener" style="color:var(--ink-dim)">view site ↗</a><span id="adm-who"></span><button class="btn sm" id="adm-out" type="button" hidden>Sign out</button></div></div>${sub}</header>`);
    const main = $("main");
    const saved = (() => { try { return JSON.parse(localStorage.getItem(LS)); } catch { return null; } })();
    const gate = (msg) => new Promise((resolve) => {
      main.hidden = true;
      const g = document.createElement("div"); g.className = "adm-gate crt-window";
      g.innerHTML = `<div class="titlebar"><span class="dot r"></span><span class="dot y"></span><span class="dot g"></span><span class="label">admin login</span></div><div class="body">
        <form><div class="field"><label>Email</label><input type="email" name="email" autocomplete="username" required></div>
        <div class="field"><label>Password</label><input type="password" name="pw" autocomplete="current-password" required></div>
        <button class="btn primary" type="submit">Sign in</button> <button class="btn sm" type="button" data-reset>Forgot password</button>
        <p class="form-status mono" id="g-msg">${esc(msg || "")}</p></form></div>`;
      document.body.appendChild(g);
      const f = $("form", g), m = $("#g-msg", g);
      $("[data-reset]", g).onclick = async () => {
        if (!f.email.value) { m.textContent = "Type your email first."; return; }
        await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${CFG.apiKey}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestType: "PASSWORD_RESET", email: f.email.value }) });
        m.textContent = "If that account exists, a reset email was sent.";
      };
      f.onsubmit = async (e) => { e.preventDefault(); m.textContent = "Signing in…"; try { await signIn(f.email.value.trim(), f.pw.value); g.remove(); resolve(); } catch (er) { m.textContent = er.message; } };
    });
    if (saved) session = saved;
    let ok = false;
    while (!ok) {
      let msg = "";
      try { if (!session) await gate(msg); await token(); const me = await req("GET", `admins/${session.uid}`); if (me) ok = true; else { msg = "This account is signed in but is not listed under /admins. Add its uid in the database."; localStorage.removeItem(LS); session = null; idToken = null; await gate(msg); } }
      catch (e) {
        if (e instanceof TypeError) {            // network hiccup: keep the saved login, offer a retry
          await new Promise((res) => { const b = document.createElement("div"); b.className = "adm-gate crt-window"; b.innerHTML = `<div class="body"><p>Can't reach the server. Check your connection.</p></div>`; b.firstChild.appendChild(A.btn("Retry", "primary", () => { b.remove(); res(); })); document.body.appendChild(b); });
          continue;
        }
        localStorage.removeItem(LS); session = null; idToken = null; await gate(e.message);
      }
    }
    let typedKey = "";
    if (!(await isUnlocked())) typedKey = await keyGate();
    main.hidden = false;
    $("#adm-who").textContent = session.email;
    if (typedKey) await rotateKey();
    mountKeyPanel(!!typedKey);
    const out = $("#adm-out"); out.hidden = false; out.onclick = () => signOut();
    { const sc = document.createElement("script"); sc.src = "/admin/bell.js"; document.body.appendChild(sc); }
    return session;
  };

  // ---------- rich text editor ----------
  function sanitize(html, keepStyle) {
    const d = document.createElement("div"); d.innerHTML = html;
    d.querySelectorAll("script,iframe,object,embed,link,meta,form" + (keepStyle ? "" : ",style")).forEach((n) => n.remove());
    d.querySelectorAll("*").forEach((n) => { [...n.attributes].forEach((a) => { if (/^on/i.test(a.name) || (a.name === "style" && !keepStyle) || /^javascript:/i.test(a.value)) n.removeAttribute(a.name); }); });
    return d.innerHTML;
  }
  A.sanitize = sanitize;
  A.editor = (host, initial, draftKey) => {
    host.innerHTML = `<div class="ed"><div class="ed-bar"></div><div class="ed-area" contenteditable="true" spellcheck="true"></div><textarea class="ed-src" spellcheck="false"></textarea><div class="ed-foot"><span class="ed-count"></span><span class="ed-saved"></span></div></div>`;
    const bar = $(".ed-bar", host), area = $(".ed-area", host), src = $(".ed-src", host);
    const cmd = (c, v) => { area.focus(); document.execCommand(c, false, v); upd(); };
    const B = [["B", () => cmd("bold"), "Bold"], ["I", () => cmd("italic"), "Italic"], ["U", () => cmd("underline"), "Underline"], ["S", () => cmd("strikeThrough"), "Strike"], "|",
      ["H2", () => cmd("formatBlock", "h2")], ["H3", () => cmd("formatBlock", "h3")], ["¶", () => cmd("formatBlock", "p")], ["❝", () => cmd("formatBlock", "blockquote"), "Quote"], "|",
      ["• List", () => cmd("insertUnorderedList")], ["1. List", () => cmd("insertOrderedList")], "|",
      ["🔗", () => { const u = prompt("Link URL (https://…)"); if (u) cmd("createLink", u); }, "Link"], ["⛓✕", () => cmd("unlink"), "Remove link"],
      ["🖼", () => { let u = prompt("Image path (/assets/blog/pic.jpg) or Google Drive image link"); if (!u) return; u = A.driveImg(u); const alt = prompt("Alt text (describes the image, good for SEO)") || ""; cmd("insertHTML", `<img src="${esc(u)}" alt="${esc(alt)}" loading="lazy">`); }, "Image"],
      ["—", () => cmd("insertHorizontalRule"), "Divider"], ["</>", () => cmd("formatBlock", "pre"), "Code block"], "|",
      ["↶", () => cmd("undo")], ["↷", () => cmd("redo")], ["Tx", () => cmd("removeFormat"), "Clear formatting"], "|", ["HTML", toggleSrc, "Edit HTML source"]];
    B.forEach((b) => { if (b === "|") { bar.insertAdjacentHTML("beforeend", '<span class="sep"></span>'); return; } const el = A.btn(b[0], "", b[1]); if (b[2]) el.title = b[2]; el.onmousedown = (e) => e.preventDefault(); bar.appendChild(el); });
    area.innerHTML = sanitize(initial || "", true);
    let last = area.innerHTML, srcMode = false;
    function toggleSrc() { srcMode = !srcMode; if (srcMode) { src.value = area.innerHTML; src.style.display = "block"; area.style.display = "none"; } else { area.innerHTML = sanitize(src.value, true); src.style.display = "none"; area.style.display = ""; } upd(); }
    function html() { return sanitize(srcMode ? src.value : area.innerHTML, true).trim(); }
    function upd() { const t = (area.textContent || "").trim(); const w = t ? t.split(/\s+/).length : 0; $(".ed-count", host).textContent = `${w} words · ~${Math.max(1, Math.round(w / 200))} min read`; }
    area.addEventListener("input", upd); upd();
    area.addEventListener("paste", (e) => { const h = e.clipboardData.getData("text/html"); if (h) { e.preventDefault(); document.execCommand("insertHTML", false, sanitize(h).replace(/<\/?(span|font|meta)[^>]*>/g, "")); } });
    if (draftKey) { setInterval(() => { const h = html(); if (h && h !== last) { last = h; try { localStorage.setItem("eo_draft:" + draftKey, h); $(".ed-saved", host).textContent = "draft saved " + new Date().toLocaleTimeString(); } catch {} } }, 4000); }
    return { html, set: (h) => { area.innerHTML = sanitize(h || "", true); upd(); }, draft: () => { try { return localStorage.getItem("eo_draft:" + draftKey); } catch { return null; } }, clearDraft: () => { try { localStorage.removeItem("eo_draft:" + draftKey); } catch {} } };
  };

  // ---------- generic CRUD ----------
  // cfg: {node, title, keyField, slugFrom, columns[], fields[], defaults(), view(item), search[], sort(a,b), touch}
  A.crud = async (host, cfg) => {
    let data = {}, q = "", flt = "", pg = 1;
    const PER = cfg.perPage || 40, hasStatus = cfg.columns.some((c) => c.key === "status");
    host.innerHTML = `<div class="toolbar"><input type="search" placeholder="Search ${esc(cfg.title)}…">${hasStatus ? '<select data-flt><option value="">All statuses</option></select>' : ""}<span class="hint" data-n></span><span style="flex:1"></span></div><div class="tbl-wrap"></div><div class="pager-bar" data-pg></div>`;
    const tb = $(".toolbar", host), wrap = $(".tbl-wrap", host), pgBar = $("[data-pg]", host);
    tb.appendChild(A.btn("+ New", "primary", () => edit(null)));
    $("input", tb).oninput = (e) => { q = e.target.value.toLowerCase(); pg = 1; paint(); };
    if (hasStatus) {
      $("[data-flt]", tb).onchange = (e) => { flt = e.target.value; pg = 1; paint(); };
      // set many items live or draft in one go: applies to everything the search and filter currently show
      tb.appendChild(A.btn("Bulk status…", "", async () => {
        const items = list(); if (!items.length) return A.toast("Nothing to change", true);
        const to = (prompt(`Set status of the ${items.length} item(s) shown (after search and filter) to: published or draft`, "draft") || "").trim().toLowerCase();
        if (!["published", "draft"].includes(to)) return;
        if (!(await A.confirm(`Set ${items.length} item(s) to "${to}"?`))) return;
        try { for (let i = 0; i < items.length; i += 400) { const u = {}; items.slice(i, i + 400).forEach((it) => { u[`${cfg.node}/${it._key}/status`] = to; data[it._key].status = to; }); await A.patchRoot(u); } A.toast(items.length + " updated"); paint(); }
        catch (e) { A.toast(e.message, true); }
      }));
    }
    async function load() { data = (await A.get(cfg.node)) || {}; if (cfg.decorate) await cfg.decorate(data); paint(); }
    function list() {
      let r = rows(data).filter((x) => (!flt || (x.status || "") === flt) && (!q || (cfg.search || ["title"]).some((k) => String(x[k] || "").toLowerCase().includes(q))));
      return r.sort(cfg.sort || ((a, b) => (a.order || 0) - (b.order || 0)));
    }
    function cell(it, c) { const v = it[c.key]; if (c.badge) return A.pill(v); if (c.render) return c.render(it); if (Array.isArray(v)) return esc(v.join(", ")); return esc(String(v == null ? "" : v).slice(0, 90)); }
    function paint() {
      const all = list(); $("[data-n]", tb).textContent = `${all.length} item${all.length === 1 ? "" : "s"}`;
      if (hasStatus) { const sel = $("[data-flt]", tb), vals = [...new Set(rows(data).map((x) => x.status).filter(Boolean))].sort(); if (sel.options.length - 1 !== vals.length) sel.innerHTML = `<option value="">All statuses</option>` + vals.map((v) => `<option${v === flt ? " selected" : ""}>${esc(v)}</option>`).join(""); }
      const pages = Math.max(1, Math.ceil(all.length / PER)); pg = Math.min(pg, pages);
      const r = all.slice((pg - 1) * PER, pg * PER);
      pgBar.innerHTML = pages > 1 ? `<button class="btn sm" data-pp ${pg <= 1 ? "disabled" : ""} type="button">← Prev</button><span class="hint">page ${pg} of ${pages}</span><button class="btn sm" data-pn ${pg >= pages ? "disabled" : ""} type="button">Next →</button>` : "";
      if (pages > 1) { $("[data-pp]", pgBar).onclick = () => { pg--; paint(); wrap.scrollIntoView(); }; $("[data-pn]", pgBar).onclick = () => { pg++; paint(); wrap.scrollIntoView(); }; }
      wrap.innerHTML = `<table class="tbl"><thead><tr>${cfg.columns.map((c) => `<th>${esc(c.label)}</th>`).join("")}<th></th></tr></thead><tbody>${r.map((it) => `<tr data-k="${esc(it._key)}">${cfg.columns.map((c) => `<td>${cell(it, c)}</td>`).join("")}<td class="act"></td></tr>`).join("") || `<tr><td colspan="${cfg.columns.length + 1}">Nothing here yet.</td></tr>`}</tbody></table>`;
      wrap.querySelectorAll("tr[data-k]").forEach((tr) => {
        const it = data[tr.dataset.k], act = $(".act", tr);
        if (cfg.view && cfg.view({ ...it, _key: tr.dataset.k })) { const a = A.btn("View", "sm"); a.onclick = () => window.open(cfg.view({ ...it, _key: tr.dataset.k }), "_blank"); act.appendChild(a); }
        act.appendChild(A.btn("Edit", "sm", () => edit(tr.dataset.k)));
        act.appendChild(A.btn("Copy", "sm", () => edit(tr.dataset.k, true)));
        act.appendChild(A.btn("Delete", "sm danger", async () => { if (await A.confirm(`Delete "${it.title || it.name || it.headline || tr.dataset.k}"? This cannot be undone.`)) { try { await A.del(`${cfg.node}/${tr.dataset.k}`); delete data[tr.dataset.k]; paint(); A.toast("Deleted"); } catch (e) { A.toast(e.message, true); } } }));
      });
    }
    function input(f, v) {
      const id = "f_" + f.key, val = v == null ? "" : v;
      const h = (inner) => `<div class="field" ${f.wide ? 'style="grid-column:1/-1"' : ""}><label for="${id}">${esc(f.label)}${f.required ? " *" : ""}</label>${inner}${f.help ? `<small>${esc(f.help)}</small>` : ""}</div>`;
      if (f.type === "textarea") return h(`<textarea id="${id}" rows="${f.rows || 4}">${esc(val)}</textarea>`);
      if (f.type === "lines") return h(`<textarea id="${id}" rows="4" placeholder="One per line">${esc(Array.isArray(val) ? val.join("\n") : val)}</textarea>`);
      if (f.type === "select") return h(`<select id="${id}">${f.options.map((o) => `<option ${String(o) === String(val) ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`);
      if (f.type === "bool") return h(`<input id="${id}" type="checkbox" style="width:auto" ${val ? "checked" : ""}>`);
      if (f.type === "html") return h(`<div id="${id}"></div>`);
      if (f.type === "tags") return h(`<input id="${id}" value="${esc(Array.isArray(val) ? val.join(", ") : val)}" placeholder="comma, separated">`);
      return h(`<input id="${id}" type="${f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}" value="${esc(val)}" ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ""}>`);
    }
    async function edit(key, copy) {
      const isNew = key == null || copy;
      const item = Object.assign({}, key ? data[key] : (cfg.defaults ? cfg.defaults() : {}));
      delete item._key;
      if (copy) { if (cfg.keyField) item[cfg.keyField] = (item[cfg.keyField] || "") + "-copy"; if (item.title) item.title += " (copy)"; }
      const form = document.createElement("div"); form.className = "grid2";
      form.innerHTML = cfg.fields.map((f) => input(f, item[f.key])).join("");
      const editors = {};
      cfg.fields.filter((f) => f.type === "html").forEach((f) => { editors[f.key] = A.editor($("#f_" + f.key, form), item[f.key], `${cfg.node}:${key || "new"}:${f.key}`); const d = editors[f.key].draft(); if (d && d !== item[f.key] && isNew === false && false) editors[f.key].set(d); });
      const save = A.btn("Save", "primary"), cancel = A.btn("Cancel");
      const m = A.modal((key && !copy ? "Edit " : "New ") + cfg.title, form, [cancel, save], true);
      cancel.onclick = m.close;
      if (cfg.keyField && cfg.slugFrom && isNew) { const s = $("#f_" + cfg.keyField, form), t = $("#f_" + cfg.slugFrom, form); if (s && t && !copy) t.addEventListener("input", () => { if (!s.dataset.t) s.value = slugify(t.value); }); if (s) s.addEventListener("input", () => (s.dataset.t = 1)); }
      save.onclick = async () => {
        const out = {};
        for (const f of cfg.fields) {
          const el = $("#f_" + f.key, form); let v;
          if (f.type === "html") v = editors[f.key].html();
          else if (f.type === "bool") v = el.checked;
          else if (f.type === "number") v = el.value === "" ? null : Number(el.value);
          else if (f.type === "tags" || f.type === "lines") v = el.value.split(f.type === "tags" ? "," : "\n").map((s) => s.trim()).filter(Boolean);
          else v = el.value.trim();
          if (f.required && (v == null || v === "" || (Array.isArray(v) && !v.length))) { A.toast(`${f.label} is required`, true); el.focus && el.focus(); return; }
          if (v !== null && v !== "" && !(Array.isArray(v) && !v.length)) out[f.key] = v; else if (f.keepEmpty) out[f.key] = v === null ? "" : v;
        }
        if (cfg.touch) out[cfg.touch] = today();
        let nk = key;
        if (cfg.keyField) { nk = slugify(out[cfg.keyField] || out[cfg.slugFrom]); if (!nk) { A.toast("Slug can't be empty", true); return; } out[cfg.keyField] = nk; }
        else if (isNew) nk = "k" + Date.now().toString(36);
        if ((isNew || nk !== key) && data[nk]) { A.toast(`"${nk}" already exists — choose another slug`, true); return; }
        if (cfg.beforeSave) { const ok = await cfg.beforeSave(out, nk); if (ok === false) return; }
        save.disabled = true;
        try {
          await A.set(`${cfg.node}/${nk}`, out);
          if (key && !copy && nk !== key) await A.del(`${cfg.node}/${key}`);
          if (SHORT_BASE[cfg.node]) A.ensureShort(SHORT_BASE[cfg.node] + nk, SHORT_NAME[cfg.node] + ": " + (out.title || nk));
          if (cfg.afterSave) await cfg.afterSave(out, nk, form);
          Object.values(editors).forEach((e) => e.clearDraft());
          m.close(); A.toast("Saved ✓"); await load();
        } catch (e) { A.toast("Save failed: " + e.message, true); save.disabled = false; }
      };
    }
    A.refresh = load;
    await load();
    return { reload: load, edit };
  };

  window.A = A;
})();
