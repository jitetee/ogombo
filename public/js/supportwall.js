// ============================================================
// Support wall (soft paywall) for blog posts and content cards.
//
// After a reader has opened N different posts/cards (default 5) a "please
// support" screen covers the next one. The reader pays by M-Pesa, pastes the
// confirmation SMS, and the page unlocks on that device.
//
// The owner controls everything from admin → Support wall (node `support_wall`):
//   enabled, threshold, min_amount, unlock_days, max_age_min, title, message
// Turning `enabled` off removes the wall instantly for everyone.
//
// PLAINLY: this is a polite gate, not security. Content is public on the web
// and a tech-savvy reader can bypass any browser-side gate; a pasted SMS can
// also be typed by anyone. What it does: asks regular readers to support, catches
// lazy fakes (EO_MPESA checks), allows each M-Pesa code to be used only once
// (stored in `mpesa_codes`), and lists every unlock in the admin so you can match
// the codes against your till statement. Search engines start with no reading
// history, so they are never walled.
// ============================================================
(function () {
  const path = location.pathname.replace(/\/+$/, "").toLowerCase();
  if (!/^\/(blog|content)\/[^/]+/.test(path)) return;      // only posts and cards, not the lists or books

  const LS = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  const CFG = window.EO_FIREBASE_CONFIG || {};
  const base = CFG.databaseURL ? CFG.databaseURL.replace(/\/$/, "") : "";
  if (!base) return;

  const DEFAULTS = {
    enabled: false, threshold: 5, min_amount: 50, unlock_days: 365, max_age_min: 15,
    title: "You've been reading a lot. Thank you!",
    message: "This site is free to read. If it has helped you, please support it with a small M-Pesa donation and keep reading. It pays for hosting and for new episodes, notes and study cards.",
  };

  const jget = async (p, ms) => {
    const c = new AbortController(), t = setTimeout(() => c.abort(), ms || 5000);
    try { const r = await fetch(`${base}/${p}.json`, { signal: c.signal, cache: "no-store" }); return r.ok ? await r.json() : null; }
    catch { return null; } finally { clearTimeout(t); }
  };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function loadScript(src) {
    return new Promise((res, rej) => { if (document.querySelector(`script[src="${src}"]`)) return res(); const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  }

  function device() {
    let d = LS.get("eo_dev");
    if (!d) { d = [...crypto.getRandomValues(new Uint8Array(12))].map((x) => x.toString(16).padStart(2, "0")).join(""); LS.set("eo_dev", d); }
    return d;
  }

  async function run() {
    const S = Object.assign({}, DEFAULTS, await jget("support_wall") || {});
    if (S.enabled !== true) return;                           // wall is off: do nothing
    const th = Math.max(1, Number(S.threshold) || 5);

    // already supported on this device?
    const un = LS.get("eo_wall");
    if (un && un.ts && Date.now() < un.ts + (Number(S.unlock_days) || 365) * 86400000) return;

    // reading history: distinct posts/cards
    let reads = LS.get("eo_reads");
    if (!Array.isArray(reads)) reads = [];
    if (reads.some((r) => r.p === path)) return;              // already counted: always readable
    if (reads.length < th) { reads.push({ p: path, t: Date.now() }); LS.set("eo_reads", reads.slice(-200)); return; }
    show(S, reads.length);
  }

  async function show(S, n) {
    const pay = (await jget("payment")) || {};
    const mp = pay.mpesa || {};
    const till = mp.till_number ? String(mp.till_number) : "";
    const name = mp.business_name || "";
    const min = Number(S.min_amount) || 0;

    const css = document.createElement("style");
    css.textContent = `
      .eo-wall-on #post-content, .eo-wall-on .post-body, .eo-wall-on article{display:none !important}
      #eo-wall{position:fixed;inset:0;z-index:99998;background:rgba(5,9,7,.97);overflow:auto;display:flex;align-items:flex-start;justify-content:center;padding:1rem}
      #eo-wall .box{max-width:560px;width:100%;margin:2rem auto;background:var(--panel,#0e1613);border:2px solid var(--panel-border,#2a4a3c);border-radius:6px;padding:1.2rem 1.3rem;color:var(--ink,#d9f5e6);font-family:inherit}
      #eo-wall h2{margin:.2rem 0 .6rem;color:var(--amber,#ffb703);font-size:1.25rem}
      #eo-wall p{margin:.4rem 0;line-height:1.5}
      #eo-wall .steps{margin:.6rem 0;padding-left:1.2rem;line-height:1.55}
      #eo-wall .till{display:inline-block;background:#0a0e0c;border:1px dashed var(--crt-green,#3ddc84);padding:.15rem .5rem;border-radius:4px;color:var(--crt-green,#3ddc84);font-weight:700;letter-spacing:.04em}
      #eo-wall textarea{width:100%;min-height:110px;background:#0a0e0c;color:var(--ink,#d9f5e6);border:1px solid var(--panel-border,#2a4a3c);border-radius:4px;padding:.6rem;font:inherit;font-size:.9rem}
      #eo-wall .row{display:flex;gap:.6rem;flex-wrap:wrap;align-items:center;margin-top:.6rem}
      #eo-wall button,#eo-wall a.b{background:var(--crt-green,#3ddc84);color:#04120a;border:0;border-radius:4px;padding:.6rem 1rem;font:inherit;font-weight:700;cursor:pointer;text-decoration:none}
      #eo-wall a.b.alt{background:transparent;color:var(--ink,#d9f5e6);border:1px solid var(--panel-border,#2a4a3c);font-weight:400}
      #eo-wall button[disabled]{opacity:.6;cursor:wait}
      #eo-wall .msg{min-height:1.4em;font-size:.9rem}
      #eo-wall .msg.bad{color:#ff7a9c} #eo-wall .msg.good{color:var(--crt-green,#3ddc84)}
      #eo-wall small{color:var(--ink-dim,#7fa898)}`;
    document.head.appendChild(css);
    document.body.classList.add("eo-wall-on");

    const el = document.createElement("div");
    el.id = "eo-wall"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true");
    el.innerHTML = `<div class="box">
      <h2>${esc(S.title)}</h2>
      <p>${esc(S.message)}</p>
      <p><small>You have read ${n} posts and cards on this site.</small></p>
      ${till ? `<ol class="steps">
        <li>Open M-Pesa → <b>Lipa na M-Pesa</b> → <b>Buy Goods and Services</b>.</li>
        <li>Till number: <span class="till">${esc(till)}</span>${name ? ` <small>(${esc(name)})</small>` : ""}</li>
        <li>Pay <b>KSh ${min || "any amount"}</b> or more${min ? "" : ""}.</li>
        <li>Copy the whole M-Pesa confirmation SMS and paste it below.</li>
      </ol>` : `<p>Pay by M-Pesa, then paste the confirmation SMS below.</p>`}
      <textarea id="eo-wall-msg" placeholder="Paste the full M-Pesa message here, for example: ABC1D2E3F4 Confirmed. Ksh${min || 50}.00 paid to ..." autocomplete="off"></textarea>
      <div class="msg" id="eo-wall-out" aria-live="polite"></div>
      <div class="row"><button type="button" id="eo-wall-go">Verify and unlock</button>
        <a class="b alt" href="/">Back to home</a>
        ${pay.buymesoda_url ? `<a class="b alt" href="${esc(pay.buymesoda_url)}" target="_blank" rel="noopener">Other ways to support</a>` : ""}</div>
      <p><small>The code in your message can be used once. Your unlock stays on this phone or computer.</small></p>
    </div>`;
    document.body.appendChild(el);

    const out = el.querySelector("#eo-wall-out"), go = el.querySelector("#eo-wall-go"), ta = el.querySelector("#eo-wall-msg");
    const say = (t, cls) => { out.textContent = t; out.className = "msg " + (cls || ""); };

    go.onclick = async () => {
      const raw = ta.value.trim();
      if (raw.length < 20) return say("Paste the whole M-Pesa message first.", "bad");
      go.disabled = true; say("Checking…");
      try {
        if (!window.EO_MPESA) await loadScript("/js/mpesa-verify.js");
        const res = window.EO_MPESA.check(raw, { price: min, pay, maxAgeMin: Number(S.max_age_min) || 15 });
        const fatal = res.hard.length ? res.hard : res.soft.filter((s) => !["over", "tail"].includes(s.id));
        if (fatal.length) { say(fatal[0].id === "under" ? `The minimum donation is KSh ${min}, but this message shows KSh ${res.parsed.amount}.` : fatal[0].text, "bad"); go.disabled = false; return; }
        const code = res.parsed.code;
        if (!code) { say("We couldn't find the transaction code in that message.", "bad"); go.disabled = false; return; }

        const used = await fetch(`${base}/mpesa_codes/${code}.json`, { cache: "no-store" });
        if (!used.ok) { say("Couldn't reach the server. Check your internet and try again.", "bad"); go.disabled = false; return; }
        if ((await used.json()) !== null) { say("That M-Pesa code has already been used. Please make a new payment or contact me.", "bad"); go.disabled = false; return; }
        const put = await fetch(`${base}/mpesa_codes/${code}.json`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ref: "wall", h: device(), ts: Date.now(), amt: res.parsed.amount, src: "wall", path }),
        });
        if (!put.ok) { say(put.status === 401 || put.status === 403 ? "That M-Pesa code has already been used." : "Couldn't save your unlock. Try again.", "bad"); go.disabled = false; return; }

        LS.set("eo_wall", { code, ts: Date.now() });
        say("Thank you for your support! Unlocking…", "good");
        setTimeout(() => { document.body.classList.remove("eo-wall-on"); el.remove(); css.remove(); }, 900);
      } catch (e) {
        say("Something went wrong. Please try again.", "bad"); go.disabled = false;
      }
    };
  }

  run().catch(() => {});
})();
