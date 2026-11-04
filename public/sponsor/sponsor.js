// ============================================================
// Sponsor portal core: email+password sign-in / sign-up (Firebase Auth REST),
// authenticated RTDB access, small UI helpers. Sponsors can only read/write their
// own records (enforced by database.rules.json); admins review and publish them.
// ============================================================
(function () {
  const CFG = window.EO_FIREBASE_CONFIG, DB = CFG.databaseURL;
  const LS = "eo_sponsor_session";
  let idToken = null, idExp = 0, session = null;
  const NAV = [["index", "My ads", "/sponsor/"], ["new", "New ad request", "/sponsor/new"]];

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const today = () => new Date().toISOString().slice(0, 10);
  const fmt = (ts) => (ts ? new Date(ts).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");
  const $ = (s, r) => (r || document).querySelector(s);
  const kes = (n) => "KES " + Number(n || 0).toLocaleString("en-KE");
  const addDays = (d, n) => new Date(new Date(d + "T00:00:00Z").getTime() + n * 864e5).toISOString().slice(0, 10);

  // ---------- auth ----------
  async function idt(endpoint, body) {
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:${endpoint}?key=${CFG.apiKey}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json();
    if (!r.ok) {
      const code = (d.error && d.error.message) || "failed";
      const nice = { EMAIL_EXISTS: "That email already has an account — sign in instead.", INVALID_LOGIN_CREDENTIALS: "Wrong email or password.", INVALID_PASSWORD: "Wrong email or password.", EMAIL_NOT_FOUND: "Wrong email or password.", INVALID_EMAIL: "That email address doesn't look right.", TOO_MANY_ATTEMPTS_TRY_LATER: "Too many attempts. Wait a few minutes and try again.", OPERATION_NOT_ALLOWED: "Email sign-in is not switched on for this project yet." };
      throw new Error(nice[code] || (/^WEAK_PASSWORD/.test(code) ? "Choose a password of at least 6 characters." : code.replace(/_/g, " ").toLowerCase()));
    }
    return d;
  }
  function take(d) {
    session = { refreshToken: d.refreshToken, email: d.email, uid: d.localId };
    if (d.displayName) S._gname = d.displayName;
    idToken = d.idToken; idExp = Date.now() + (+d.expiresIn - 60) * 1000;
    try { localStorage.setItem(LS, JSON.stringify(session)); } catch {}
  }
  async function token() {
    if (idToken && Date.now() < idExp) return idToken;
    if (!session) throw new Error("Not signed in");
    const r = await fetch(`https://securetoken.googleapis.com/v1/token?key=${CFG.apiKey}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(session.refreshToken)}` });
    const d = await r.json();
    if (!r.ok) { signOut(); throw new Error("Session expired"); }
    idToken = d.id_token; idExp = Date.now() + (+d.expires_in - 60) * 1000;
    session.refreshToken = d.refresh_token; session.uid = d.user_id;
    try { localStorage.setItem(LS, JSON.stringify(session)); } catch {}
    return idToken;
  }
  function signOut() { try { localStorage.removeItem(LS); } catch {} session = null; idToken = null; location.href = "/sponsor/"; }

  // ---------- database ----------
  async function req(method, path, body, qs) {
    const t = await token();
    const res = await fetch(`${DB}/${path}.json?auth=${t}${qs || ""}`, { method, headers: body !== undefined ? { "Content-Type": "application/json" } : undefined, body: body !== undefined ? JSON.stringify(body) : undefined });
    if (!res.ok) { let m = ""; try { m = (await res.json()).error; } catch {} throw new Error(res.status === 401 || res.status === 403 || /permission/i.test(m) ? "Not allowed (" + (m || res.status) + ")" : `${res.status} ${m || res.statusText}`); }
    return res.json();
  }
  async function pub(path) { try { const r = await fetch(`${DB}/${path}.json`); return r.ok ? await r.json() : null; } catch { return null; } }
  const S = {
    esc, today, fmt, kes, addDays, $, pub,
    get: (p) => req("GET", p), set: (p, d) => req("PUT", p, d), update: (p, d) => req("PATCH", p, d), del: (p) => req("DELETE", p),
    get session() { return session; },
    signOut,
  };

  S.toast = (msg, err) => { const t = document.createElement("div"); t.className = "toast" + (err ? " err" : ""); t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), err ? 6000 : 2800); };
  S.pill = (v) => `<span class="pill ${esc(v)}">${esc(String(v || "—").replace(/_/g, " "))}</span>`;
  S.tabs = (host, tabs, onSelect) => {
    host.innerHTML = `<div class="adm-tabs">${tabs.map(([k, l]) => `<button type="button" data-t="${k}">${esc(l)}</button>`).join("")}</div>`;
    const sel = (k) => { host.querySelectorAll("[data-t]").forEach((b) => b.classList.toggle("on", b.dataset.t === k)); history.replaceState(null, "", "#" + k); onSelect(k); };
    host.querySelectorAll("[data-t]").forEach((b) => (b.onclick = () => sel(b.dataset.t)));
    sel(tabs.find(([k]) => "#" + k === location.hash) ? location.hash.slice(1) : tabs[0][0]);
  };
  S.csv = (name, rows) => { const q = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`; const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([rows.map((r) => r.map(q).join(",")).join("\n")], { type: "text/csv" })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); };

  // shrinks a picked image to a small JPEG data URL that fits in the database (<150 KB)
  S.imageToDataURL = (file) => new Promise((resolve, reject) => {
    if (!/^image\//.test(file.type)) return reject(new Error("Pick an image file (JPG or PNG)."));
    const url = URL.createObjectURL(file), im = new Image();
    im.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read that image.")); };
    im.onload = () => {
      URL.revokeObjectURL(url);
      let w = Math.min(900, im.naturalWidth), q = 0.85;
      for (let i = 0; i < 14; i++) {
        const h = Math.round(im.naturalHeight * (w / im.naturalWidth)), c = document.createElement("canvas");
        c.width = w; c.height = h;
        const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, w, h); x.drawImage(im, 0, 0, w, h);
        const u = c.toDataURL("image/jpeg", q);
        if (u.length < 150000) return resolve(u);
        if (q > 0.5) q -= 0.1; else w = Math.round(w * 0.8);
      }
      reject(new Error("That image is too detailed to shrink. Try a simpler one."));
    };
    im.src = url;
  });

  // help link: WhatsApp number from the public site settings
  S.help = async (text) => {
    const s = (await pub("site_settings")) || {};
    const n = String((s.whatsapp && (s.whatsapp.primary || (s.whatsapp.numbers || [])[0])) || "").replace(/\D/g, "");
    const intl = n.startsWith("0") ? "254" + n.slice(1) : n;
    return intl ? `https://wa.me/${intl}?text=${encodeURIComponent(text || "Hello, I have a question about my sponsor ad on your website.")}` : "";
  };

  // ---------- Google sign-in (Google Identity Services -> Firebase signInWithIdp) ----------
  function googleButton(box, wrap, onCred) {
    const cid = CFG.googleClientId;
    if (!cid || !box) { try { console.warn("Google sign-in hidden: googleClientId is empty in js/firebase-config.js (deploy the latest file)."); } catch {} return; }
    const ru = location.origin + "/sponsor";   // add this exact address to the OAuth client's "Authorized redirect URIs"
    const ss = { get: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch {} }, del: (k) => { try { sessionStorage.removeItem(k); } catch {} } };
    // coming back from Google: the token is in the address hash
    const h = new URLSearchParams(location.hash.replace(/^#/, ""));
    if (h.get("id_token") && h.get("state") && h.get("state") === ss.get("eo_g_state")) {
      const tok = h.get("id_token"); ss.del("eo_g_state");
      try { history.replaceState(null, "", location.pathname + location.search); } catch {}
      wrap.hidden = false; setTimeout(() => onCred(tok), 0);
    } else if (h.get("error")) { try { history.replaceState(null, "", location.pathname + location.search); } catch {} wrap.hidden = false; box.innerHTML = '<p class="hint" style="margin:0">Google sign-in was cancelled. Try again or use email and password.</p>'; }
    wrap.hidden = false;
    const btn = document.createElement("button"); btn.type = "button"; btn.className = "btn"; btn.style.cssText = "display:flex;align-items:center;gap:.6rem;justify-content:center;width:100%;background:#fff;color:#1f1f1f;border:1px solid #dadce0;font-weight:600";
    btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.2 5.5-4.7 7.2l7.5 5.8c4.4-4.1 7-10.1 7-17.5z"/><path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg><span>Continue with Google</span>';
    btn.onclick = () => {
      const st = Math.random().toString(36).slice(2) + Date.now().toString(36), nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
      ss.set("eo_g_state", st);
      location.href = "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({ client_id: cid, redirect_uri: ru, response_type: "id_token", scope: "openid email profile", state: st, nonce, prompt: "select_account" });
    };
    box.innerHTML = ""; box.appendChild(btn);
  }
  async function isVerified() {
    try { const d = await idt("lookup", { idToken: await token() }); return !!(d.users && d.users[0] && d.users[0].emailVerified); } catch { return true; }   // can't check -> don't lock people out; the database rules still enforce it
  }
  const sendVerify = async () => idt("sendOobCode", { requestType: "VERIFY_EMAIL", idToken: await token() });
  // blocks until the sponsor has clicked the link in the verification email
  function verifyGate(email) {
    return new Promise((resolve) => {
      const main = $("main"); main.hidden = true;
      const g = document.createElement("div"); g.className = "adm-gate crt-window"; g.style.maxWidth = "460px";
      g.innerHTML = `<div class="titlebar"><span class="label">verify your email</span></div><div class="body"><p style="margin-top:0">We sent a link to <b>${esc(email)}</b>. Open it to confirm this is your email, then press the button. Check spam if you can't see it.</p><button class="btn primary" type="button" id="v-go">I've verified, continue</button> <button class="btn sm" type="button" id="v-re">Resend link</button> <button class="btn sm" type="button" id="v-out">Sign out</button><p class="form-status mono" id="v-msg"></p></div>`;
      document.body.appendChild(g);
      const m = $("#v-msg", g);
      $("#v-re", g).onclick = async () => { try { await sendVerify(); m.textContent = "Link sent again."; } catch (e) { m.textContent = e.message; } };
      $("#v-out", g).onclick = () => signOut();
      $("#v-go", g).onclick = async () => {
        idExp = 0;   // fetch a fresh token so the database sees the verified email
        if (await isVerified()) { idExp = 0; await token(); g.remove(); main.hidden = false; resolve(); } else m.textContent = "Not verified yet. Open the link in the email first.";
      };
    });
  }

  // ---------- page chrome + sign-in / create-account gate ----------
  S.guard = async (pageKey) => {
    document.body.classList.add("admin", "sponsor");
    const nav = NAV.map(([k, l, h]) => `<a href="${h}" class="${k === pageKey ? "on" : ""}">${l}</a>`).join("");
    document.body.insertAdjacentHTML("afterbegin", `<header class="site"><div class="wrap"><a class="logo" href="/sponsor/">sponsor</a><nav class="adm-nav">${nav}</nav><div class="adm-user"><a href="/" style="color:var(--ink-dim)">view site ↗</a><span id="adm-who"></span><button class="btn sm" id="adm-out" type="button" hidden>Sign out</button></div></div></header>`);
    const main = $("main");
    const saved = (() => { try { return JSON.parse(localStorage.getItem(LS)); } catch { return null; } })();
    const gate = (msg) => new Promise((resolve) => {
      main.hidden = true;
      const g = document.createElement("div"); g.className = "adm-gate crt-window"; g.style.maxWidth = "460px";
      g.innerHTML = `<div class="titlebar"><span class="dot r"></span><span class="dot y"></span><span class="dot g"></span><span class="label">sponsor portal</span></div><div class="body">
        <p style="margin-top:0">Advertise on this site: submit an ad, pay, and follow your views and clicks.</p>
        <div class="adm-tabs" style="margin-top:0"><button type="button" class="on" data-m="in">Sign in</button><button type="button" data-m="up">Create account</button></div>
        <form>
          <div class="field" data-up hidden><label>Your name *</label><input name="name" autocomplete="name"></div>
          <div class="field" data-up hidden><label>Business / brand</label><input name="company" autocomplete="organization"></div>
          <div class="field" data-up hidden><label>Phone (WhatsApp)</label><input name="phone" type="tel" autocomplete="tel" placeholder="07…"></div>
          <div class="field"><label>Email</label><input type="email" name="email" autocomplete="username" required></div>
          <div class="field"><label>Password</label><input type="password" name="pw" autocomplete="current-password" minlength="6" required></div>
          <button class="btn primary" type="submit" id="g-go">Sign in</button> <button class="btn sm" type="button" data-reset>Forgot password</button>
          <p class="form-status mono" id="g-msg">${esc(msg || "")}</p></form>
        <div id="g-google-wrap" hidden style="margin-top:.8rem;border-top:1px solid var(--panel-border);padding-top:.8rem"><p class="hint" style="margin:0 0 .5rem">or</p><div id="g-google"></div></div></div>`;
      document.body.appendChild(g);
      const f = $("form", g), m = $("#g-msg", g);
      let mode = "in";
      googleButton($("#g-google", g), $("#g-google-wrap", g), async (cred) => {
        m.textContent = "Signing in with Google…";
        try { take(await idt("signInWithIdp", { postBody: `id_token=${encodeURIComponent(cred)}&providerId=google.com`, requestUri: location.origin, returnIdpCredential: true, returnSecureToken: true })); g.remove(); resolve(); }
        catch (er) { m.textContent = er.message; }
      });
      g.querySelectorAll("[data-m]").forEach((b) => (b.onclick = () => {
        mode = b.dataset.m;
        g.querySelectorAll("[data-m]").forEach((x) => x.classList.toggle("on", x === b));
        g.querySelectorAll("[data-up]").forEach((x) => (x.hidden = mode !== "up"));
        $("#g-go", g).textContent = mode === "up" ? "Create account" : "Sign in";
        f.pw.autocomplete = mode === "up" ? "new-password" : "current-password"; m.textContent = "";
      }));
      $("[data-reset]", g).onclick = async () => {
        if (!f.email.value) { m.textContent = "Type your email first."; return; }
        try { await idt("sendOobCode", { requestType: "PASSWORD_RESET", email: f.email.value.trim() }); } catch {}
        m.textContent = "If that account exists, a reset email was sent.";
      };
      f.onsubmit = async (e) => {
        e.preventDefault(); m.textContent = mode === "up" ? "Creating account…" : "Signing in…";
        try {
          if (mode === "up") {
            if (!f.name.value.trim()) throw new Error("Please enter your name.");
            const d = await idt("signUp", { email: f.email.value.trim(), password: f.pw.value, returnSecureToken: true });
            take(d);
            try { await sendVerify(); } catch {}
            await S.set(`sponsors/${session.uid}`, { name: f.name.value.trim().slice(0, 80), company: f.company.value.trim().slice(0, 100), phone: f.phone.value.trim().slice(0, 30), email: session.email, created: Date.now() });
          } else take(await idt("signInWithPassword", { email: f.email.value.trim(), password: f.pw.value, returnSecureToken: true }));
          g.remove(); resolve();
        } catch (er) { m.textContent = er.message; }
      };
    });
    if (saved) session = saved;
    let ok = false;
    while (!ok) {
      try {
        if (!session) await gate();
        await token();
        ok = true;
      } catch (e) {
        if (e instanceof TypeError) { await new Promise((res) => { const b = document.createElement("div"); b.className = "adm-gate crt-window"; b.innerHTML = `<div class="body"><p>Can't reach the server. Check your connection.</p></div>`; const bt = document.createElement("button"); bt.className = "btn primary"; bt.textContent = "Retry"; bt.onclick = () => { b.remove(); res(); }; b.firstChild.appendChild(bt); document.body.appendChild(b); }); continue; }
        try { localStorage.removeItem(LS); } catch {} session = null; idToken = null; await gate(e.message);
      }
    }
    if (!(await isVerified())) { try { await sendVerify(); } catch {} await verifyGate(session.email); }
    // make sure there is a profile (e.g. an account created elsewhere)
    let profile = null;
    try { profile = await S.get(`sponsors/${session.uid}`); } catch {}
    if (!profile) { profile = { name: S._gname || (session.email || "").split("@")[0], company: "", phone: "", email: session.email, created: Date.now() }; try { await S.set(`sponsors/${session.uid}`, profile); } catch {} }
    main.hidden = false;
    $("#adm-who").textContent = profile.name || session.email;
    const out = $("#adm-out"); out.hidden = false; out.onclick = () => signOut();
    S.profile = profile;
    return { uid: session.uid, email: session.email, profile };
  };

  window.S = S;
})();
