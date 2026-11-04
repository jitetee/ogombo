/* Admin notification bell: new requests, payments, comments, reactions, messages, orders, subscribers.
   Checks the database every 20 s while the tab is open (and when you come back to it). Admin pages only. */
(function () {
  if (!window.A || !document.getElementById("adm-who")) return;
  const E = A.esc, KEY = "eo_bell_v1", EVERY = 20000;
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } };
  const save = (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} };
  let st = load(), items = [], rx = {}, rxNew = {}, firstScan = true, lastIds = new Set();
  if (!st) { st = { open: Date.now(), rx: null, rxAt: {} }; save(st); }

  // ---- UI
  const host = document.querySelector(".adm-user");
  const wrap = document.createElement("div"); wrap.className = "bell-wrap";
  wrap.innerHTML = `<button type="button" class="bell" id="bell" aria-label="Notifications" aria-expanded="false" title="Notifications">🔔<span class="bell-dot" id="bell-dot" hidden></span></button><div class="bell-panel" id="bell-panel" hidden></div>`;
  host.insertBefore(wrap, host.firstChild);
  const btn = wrap.querySelector("#bell"), dot = wrap.querySelector("#bell-dot"), panel = wrap.querySelector("#bell-panel");
  const baseTitle = document.title.replace(/^\(\d+\+?\)\s*/, "");

  const ago = (ts) => { const s = Math.max(1, Math.round((Date.now() - ts) / 1000)); if (s < 60) return "just now"; if (s < 3600) return Math.round(s / 60) + " min ago"; if (s < 86400) return Math.round(s / 3600) + " h ago"; return Math.round(s / 86400) + " d ago"; };
  const flat = (o) => (Array.isArray(o) ? o.filter(Boolean).map((v, i) => [String(i), v]) : Object.entries(o || {}));
  const unreadOf = (it, since) => (it.kind === "like" ? !!it.fresh : it.ts > since);

  async function scan() {
    const g = (p) => A.get(p).catch(() => null);
    const [com, rea, con, nl, ord, un, req, sp] = await Promise.all(["comments", "reactions", "contact_inbox", "newsletter", "material_orders", "chat_unanswered", "sponsor_requests", "sponsors"].map(g));
    const out = [], day = 864e5 * 14, cut = Date.now() - day;
    flat(com).forEach(([t, bySlug]) => flat(bySlug).forEach(([slug, cs]) => flat(cs).forEach(([cid, c]) => {
      if (c && c.ts > cut) out.push({ id: "c" + t + slug + cid, ts: c.ts, kind: "comment", icon: "💬", text: `<b>${E(c.name || "Someone")}</b> commented on <b>${E(slug)}</b>${c.status === "pending" ? " — <i>waiting for approval</i>" : ""}: “${E(String(c.text || "").slice(0, 70))}”`, href: "/admin/inbox" });
      const k = "cl:" + t + "/" + slug + "/" + cid;
      if (c && Number(c.likes) > 0) rx[k] = Number(c.likes);
    })));
    // reactions: totals per post (and comment likes) compared with what you last saw
    flat(rea).forEach(([t, bySlug]) => flat(bySlug).forEach(([slug, r]) => { const n = Object.values(r || {}).reduce((a, v) => a + (Number(v) || 0), 0); rx[t + "/" + slug] = n; }));
    flat(con).forEach(([id, m]) => { if (m && m.ts > cut) out.push({ id: "m" + id, ts: m.ts, kind: "message", icon: "✉️", text: `New message from <b>${E(m.name || "someone")}</b>${m.subject ? ": " + E(String(m.subject).slice(0, 50)) : ""}`, href: "/admin/inbox" }); });
    flat(nl).forEach(([id, m]) => { if (m && m.ts > cut) out.push({ id: "n" + id, ts: m.ts, kind: "sub", icon: "📰", text: `New newsletter subscriber <b>${E(m.email || "")}</b>`, href: "/admin/inbox" }); });
    flat(ord).forEach(([id, o]) => { if (o && o.ts > cut) out.push({ id: "o" + id, ts: o.ts, kind: "order", icon: "🛒", text: `Material order <b>${E(o.ref || id)}</b> — ${E(o.material_title || "")} (${E(o.status || "new")})`, href: "/admin/materials" }); });
    flat(un).forEach(([id, q]) => { if (q && q.ts > cut) out.push({ id: "q" + id, ts: q.ts, kind: "chat", icon: "🤖", text: `Chatbot couldn't answer: “${E(String(q.q || "").slice(0, 70))}”`, href: "/admin/data" }); });
    const today = new Date().toISOString().slice(0, 10), soon = new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10);
    let act = 0;
    flat(req).forEach(([id, r]) => {
      if (!r) return;
      const who = E(r.sponsor_name || r.sponsor_email || "A sponsor");
      if (r.created > cut && r.status !== "draft") out.push({ id: "rq" + id, ts: r.created, kind: "req", icon: "📣", text: `<b>${who}</b> sent a new ad request (${E(r.package_name || "")})`, href: "/admin/ads" });
      if (r.status === "payment_submitted") { act++; out.push({ id: "pay" + id, ts: (r.payment && r.payment.submitted) || r.updated || 0, kind: "pay", icon: "💰", need: 1, text: `<b>${who}</b> sent a payment to verify — KES ${E((r.payment && r.payment.amount) || r.price || "")}`, href: "/admin/ads" }); }
      if (r.status === "edit_submitted") { act++; out.push({ id: "ed" + id + (r.updated || ""), ts: r.updated || 0, kind: "edit", icon: "✏️", need: 1, text: `<b>${who}</b> changed their ad — approval needed`, href: "/admin/ads" }); }
      if (r.status === "live" && r.end && r.end >= today && r.end <= soon) out.push({ id: "end" + id + r.end, ts: new Date(r.end + "T00:00:00Z").getTime() - 2 * 864e5, kind: "end", icon: "⏳", text: `<b>${who}</b>'s campaign ends ${r.end === today ? "today" : r.end} — time to offer a renewal`, href: "/admin/ads" });
    });
    flat(sp).forEach(([id, s]) => { if (s && s.created > cut) out.push({ id: "sp" + id, ts: s.created, kind: "acct", icon: "👤", text: `New sponsor account: <b>${E(s.name || s.email || "")}</b>${s.company ? " (" + E(s.company) + ")" : ""}`, href: "/admin/ads" }); });
    // reactions
    if (!st.rx) { st.rx = Object.assign({}, rx); save(st); }
    Object.entries(rx).forEach(([k, n]) => {
      const was = st.rx[k] == null ? n : st.rx[k];
      if (n > was) { st.rxAt[k] = st.rxAt[k] || Date.now(); out.push({ id: "lk" + k + n, ts: st.rxAt[k], kind: "like", fresh: 1, icon: k.startsWith("cl:") ? "👍" : "❤️", text: `<b>${n - was}</b> new ${k.startsWith("cl:") ? "comment like" : "reaction"}${n - was > 1 ? "s" : ""} on <b>${E(k.replace(/^cl:/, "").split("/").slice(1).join("/"))}</b>`, href: "/admin/inbox" }); }
    });
    out.sort((a, b) => b.ts - a.ts);
    items = out.slice(0, 40);
    // announce new unread things (not on the very first scan)
    const fresh = items.filter((it) => unreadOf(it, st.open) && !lastIds.has(it.id));
    if (!firstScan && fresh.length) {
      A.toast("🔔 " + fresh[0].text.replace(/<[^>]+>/g, "") + (fresh.length > 1 ? ` (+${fresh.length - 1} more)` : ""));
      try { if (document.hidden && window.Notification && Notification.permission === "granted") new Notification("Ezra Ogombo admin", { body: fresh[0].text.replace(/<[^>]+>/g, "") }); } catch {}
    }
    items.forEach((it) => lastIds.add(it.id)); firstScan = false;
    paint(act);
  }
  function paint(act) {
    const n = items.filter((it) => unreadOf(it, st.open)).length;
    dot.hidden = !n; dot.textContent = n > 9 ? "9+" : String(n);
    document.title = (n ? `(${n > 9 ? "9+" : n}) ` : "") + baseTitle;
    if (!panel.hidden) render(act, st.open);
  }
  function render(act, since) {
    const perm = window.Notification && Notification.permission === "default" ? `<button class="btn sm" id="bell-perm" type="button">Allow pop-up alerts</button>` : "";
    panel.innerHTML = `<div class="bell-head"><strong>Notifications</strong><span class="hint">${act ? act + " need action" : "live · every 20 s"}</span></div>
      <div class="bell-list">${items.length ? items.map((it) => `<a class="bell-it${unreadOf(it, since) ? " new" : ""}${it.need ? " need" : ""}" href="${it.href}"><span class="bi">${it.icon}</span><span class="bt">${it.text}<small>${ago(it.ts)}</small></span></a>`).join("") : `<p class="hint" style="padding:1rem">Nothing yet. New requests, payments, comments, likes and messages will show up here.</p>`}</div>
      <div class="bell-foot">${perm}<button class="btn sm" id="bell-read" type="button">Mark all as read</button></div>`;
    const p = panel.querySelector("#bell-perm"); if (p) p.onclick = () => Notification.requestPermission().then(() => render(act, since));
    panel.querySelector("#bell-read").onclick = () => { markRead(); render(act, st.open); };
  }
  function markRead() { st.open = Date.now(); st.rx = Object.assign({}, rx); st.rxAt = {}; save(st); items.forEach((it) => { if (it.kind === "like") it.fresh = 0; }); paint(); }
  let lastAct = 0;
  btn.onclick = (e) => {
    e.stopPropagation();
    const show = panel.hidden;
    panel.hidden = !show; btn.setAttribute("aria-expanded", String(show)); if (show) { const k = document.getElementById("key-panel"); if (k) k.hidden = true; A.place(panel, btn); }
    if (show) { const since = st.open; render(items.filter((i) => i.need).length, since); setTimeout(() => { markRead(); }, 1500); }
  };
  document.addEventListener("click", (e) => { if (!panel.hidden && !wrap.contains(e.target) && !panel.contains(e.target)) { panel.hidden = true; btn.setAttribute("aria-expanded", "false"); } });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") panel.hidden = true; });
  const tick = () => { if (!document.hidden) scan().catch(() => {}); };
  setInterval(tick, EVERY); document.addEventListener("visibilitychange", tick); scan().catch(() => {});
  // scheduled imports run from any admin page once their time has come (there is no server, so an admin page must be open)
  const load2 = (src) => new Promise((r) => { if (document.querySelector(`script[src="${src}"]`)) return r(); const sc = document.createElement("script"); sc.src = src; sc.onload = r; sc.onerror = r; document.body.appendChild(sc); });
  const due = async () => { if (document.hidden || /\/admin\/merge/.test(location.pathname)) return; await load2("/admin/dbmerge.js"); await load2("/admin/importrun.js"); if (window.EO_IMPORT) EO_IMPORT.runDue().catch(() => {}); };
  setTimeout(due, 4000); setInterval(due, 60000);
  window.EO_BELL = { scan };
})();
