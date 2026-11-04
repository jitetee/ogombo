/* Email generator — pure functions, no network, no paid service.
   window.EO_MAIL = { TYPES, build, mailto, gmail, outlook, eml, chunk, parseEmails, esc }  */
(function () {
  "use strict";
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const TYPES = {
    update: { label: "Subscriber update", icon: "📰", hint: "A regular news round-up for your subscribers.", subject: "What's new at {site}", pointsLabel: "What's new (one per line)" },
    announce: { label: "Announcement", icon: "📣", hint: "One big thing — a launch, event, change or date.", subject: "Announcement: {headline}", pointsLabel: "Key details (one per line)" },
    post: { label: "New blog post", icon: "📝", hint: "Share a new post. Pick it from the list to fill everything in.", subject: "New post: {headline}", pointsLabel: "What you'll learn (one per line)" },
    material: { label: "New study material", icon: "📚", hint: "Tell people about a new note, past paper or unit.", subject: "New material: {headline}", pointsLabel: "What's inside (one per line)" },
    promo: { label: "Advertise myself / services", icon: "🎯", hint: "Introduce what you do and invite people to get in touch.", subject: "{headline}", pointsLabel: "Services / what I offer (one per line)" },
    followup: { label: "Follow-up", icon: "🔁", hint: "A polite nudge after a message, quote, order or meeting.", subject: "Following up: {headline}", pointsLabel: "Points to recap (one per line)" },
    enquiry: { label: "Reply to an enquiry", icon: "💬", hint: "Answer a question or request someone sent you.", subject: "Re: {headline}", pointsLabel: "Answer / details (one per line)" },
    thanks: { label: "Thank-you", icon: "🙏", hint: "Thank a subscriber, buyer, sponsor or collaborator.", subject: "Thank you, {name}", pointsLabel: "Highlights (one per line)" },
  };

  const L = {
    en: {
      hi: (n) => (n ? `Hi ${n},` : "Hello,"), hiF: (n) => (n ? `Dear ${n},` : "Dear friend,"),
      bye: "Warm regards,", byeF: "Kind regards,",
      cta: "Open the link here:", unsub: "You're receiving this because you subscribed on {site}. To stop these emails, just reply with “unsubscribe”.",
      ps: "P.S.", intro: { update: "Here's a quick round-up of what's been happening.", announce: "I have something to share with you.", post: "I've just published something new that I think you'll find useful.", material: "A new study resource is now available.", promo: "I'd like to introduce myself and what I can help you with.", followup: "I'm following up on my earlier message in case it got buried.", enquiry: "Thank you for reaching out — here's my reply to your message.", thanks: "I just wanted to say a sincere thank you." },
      close: { update: "Thanks for being part of this — it genuinely means a lot.", announce: "Thank you for reading, and I hope to see you there.", post: "If it helps you, please share it with a friend who'd benefit.", material: "Tell me what you'd like to see next — I read every reply.", promo: "If this sounds useful, just reply to this email or message me and we'll take it from there.", followup: "Whenever you have a moment, I'd love to hear back. No pressure at all.", enquiry: "If anything is unclear, reply here and I'll gladly help further.", thanks: "I really appreciate your support." },
      date: "Date", when: "Date & time", where: "Where", price: "Price",
    },
    sw: {
      hi: (n) => (n ? `Habari ${n},` : "Habari,"), hiF: (n) => (n ? `Mpendwa ${n},` : "Mpendwa msomaji,"),
      bye: "Wako mwaminifu,", byeF: "Wako mwaminifu,",
      cta: "Fungua kiungo hapa:", unsub: "Unapokea barua pepe hii kwa sababu ulijiunga na {site}. Ili kuacha kupokea, jibu na neno “unsubscribe”.",
      ps: "N.B.", intro: { update: "Hii hapa muhtasari mfupi wa yaliyojiri.", announce: "Nina jambo la kukujulisha.", post: "Nimechapisha makala mpya ambayo nadhani itakufaa.", material: "Nyenzo mpya ya kusomea sasa inapatikana.", promo: "Napenda kujitambulisha na kukueleza ninavyoweza kukusaidia.", followup: "Ninafuatilia ujumbe wangu wa awali endapo ulipitiwa.", enquiry: "Asante kwa kuwasiliana — hapa ni jibu langu.", thanks: "Nilitaka kusema asante kwa dhati." },
      close: { update: "Asante kwa kuwa nasi — inamaanisha mengi.", announce: "Asante kwa kusoma, natumai kukuona.", post: "Ikikusaidia, mshirikishe rafiki atakayenufaika.", material: "Niambie ungependa nini kifuatacho — nasoma kila jibu.", promo: "Ikiwa hii inakufaa, jibu barua pepe hii au nitumie ujumbe tuendelee.", followup: "Ukipata nafasi, ningependa kusikia kutoka kwako. Hakuna haraka.", enquiry: "Ikiwa kuna kisichoeleweka, jibu hapa nitakusaidia zaidi.", thanks: "Ninashukuru sana kwa msaada wako." },
      date: "Tarehe", when: "Tarehe na saa", where: "Mahali", price: "Bei",
    },
  };

  const lines = (s) => String(s || "").split(/\r?\n/).map((x) => x.replace(/^\s*[-•*]\s*/, "").trim()).filter(Boolean);
  const fill = (t, f) => t.replace(/\{(\w+)\}/g, (_, k) => f[k] || (k === "name" ? "friend" : ""));
  const paras = (s) => String(s || "").split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);

  function build(f) {
    f = Object.assign({ type: "update", tone: "friendly", lang: "en", accent: "#0b6b5c" }, f || {});
    const T = TYPES[f.type] || TYPES.update, S = L[f.lang] || L.en, formal = f.tone === "formal";
    const site = f.site || "my website";
    const ctx = Object.assign({}, f, { site, headline: f.headline || "" });
    let subject = (f.subject || "").trim() || fill(T.subject, ctx).replace(/^:\s*|:\s*$/g, "").trim() || T.label;
    if (f.emoji && !/^\p{Extended_Pictographic}/u.test(subject)) subject = T.icon + " " + subject;
    const greet = formal ? S.hiF(f.name) : S.hi(f.name);
    const intro = (f.intro || "").trim() || S.intro[f.type] || "";
    const body = paras(f.message);
    const pts = lines(f.points);
    const facts = [];
    if (f.when) facts.push([S.when, f.when]);
    if (f.where) facts.push([S.where, f.where]);
    if (f.price) facts.push([S.price, f.price]);
    const close = (f.closing || "").trim() || S.close[f.type] || "";
    const bye = formal ? S.byeF : S.bye;
    const snd = f.sender || {};
    const sigLines = [snd.name, snd.title, [snd.phone, snd.email].filter(Boolean).join(" · "), snd.site].filter(Boolean);
    const extra = lines(f.signature);
    const ctas = [];
    if (f.ctaUrl) ctas.push({ label: f.ctaLabel || (f.lang === "sw" ? "Fungua" : "Open"), url: f.ctaUrl });
    if (f.cta2Url) ctas.push({ label: f.cta2Label || "More", url: f.cta2Url });
    const unsub = f.unsub ? fill(S.unsub, { site }) : "";

    /* ---------- plain text ---------- */
    const t = [];
    t.push(greet, "");
    if (f.headline && f.type !== "enquiry" && f.type !== "followup") t.push(f.headline.toUpperCase(), "");
    t.push(intro, "");
    body.forEach((p) => t.push(p, ""));
    if (facts.length) { facts.forEach(([k, v]) => t.push(`${k}: ${v}`)); t.push(""); }
    if (pts.length) { pts.forEach((p) => t.push("• " + p)); t.push(""); }
    ctas.forEach((c) => t.push(`${c.label}: ${c.url}`));
    if (ctas.length) t.push("");
    if (close) t.push(close, "");
    if (f.ps) t.push(`${S.ps} ${f.ps}`, "");
    t.push(bye);
    sigLines.forEach((x) => t.push(x));
    extra.forEach((x) => t.push(x));
    if (unsub) t.push("", "—", unsub);
    const text = t.join("\n").replace(/\n{3,}/g, "\n\n").trim();

    /* ---------- HTML ---------- */
    const a = f.accent, font = "-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif";
    const h = [];
    h.push(`<!doctype html><html><body style="margin:0;padding:0;background:#f3f4f6;font-family:${font};color:#1f2937">`);
    h.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px"><tr><td align="center">`);
    h.push(`<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #e5e7eb">`);
    h.push(`<tr><td style="background:${esc(a)};padding:22px 28px;color:#fff"><div style="font-size:13px;letter-spacing:.12em;text-transform:uppercase;opacity:.85">${esc(T.label)}</div><div style="font-size:22px;font-weight:700;margin-top:4px">${esc(snd.name || site)}</div></td></tr>`);
    h.push(`<tr><td style="padding:28px;font-size:16px;line-height:1.6;word-break:break-word;overflow-wrap:anywhere">`);
    h.push(`<p style="margin:0 0 14px">${esc(greet)}</p>`);
    if (f.headline && f.type !== "enquiry" && f.type !== "followup") h.push(`<h1 style="margin:0 0 14px;font-size:24px;line-height:1.25;color:#111827">${esc(f.headline)}</h1>`);
    h.push(`<p style="margin:0 0 14px">${esc(intro)}</p>`);
    body.forEach((p) => h.push(`<p style="margin:0 0 14px">${esc(p).replace(/\n/g, "<br>")}</p>`));
    if (facts.length) h.push(`<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px;background:#f9fafb;border-left:4px solid ${esc(a)};border-radius:4px;width:100%"><tr><td style="padding:12px 16px;font-size:15px">${facts.map(([k, v]) => `<div><b>${esc(k)}:</b> ${esc(v)}</div>`).join("")}</td></tr></table>`);
    if (pts.length) h.push(`<ul style="margin:0 0 16px;padding-left:20px">${pts.map((p) => `<li style="margin:0 0 6px">${esc(p)}</li>`).join("")}</ul>`);
    ctas.forEach((c, i) => h.push(`<p style="margin:0 0 14px"><a href="${esc(c.url)}" style="display:inline-block;padding:12px 22px;border-radius:6px;font-weight:700;text-decoration:none;${i === 0 ? `background:${esc(a)};color:#ffffff` : `border:2px solid ${esc(a)};color:${esc(a)}`}">${esc(c.label)}</a></p>`));
    if (close) h.push(`<p style="margin:0 0 14px">${esc(close)}</p>`);
    if (f.ps) h.push(`<p style="margin:0 0 14px"><b>${esc(S.ps)}</b> ${esc(f.ps)}</p>`);
    h.push(`<p style="margin:18px 0 0">${esc(bye)}<br>${sigLines.map((x, i) => (i === 0 ? `<b>${esc(x)}</b>` : esc(x))).join("<br>")}${extra.length ? "<br>" + extra.map(esc).join("<br>") : ""}</p>`);
    h.push(`</td></tr>`);
    if (unsub) h.push(`<tr><td style="padding:14px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280">${esc(unsub)}</td></tr>`);
    h.push(`</table></td></tr></table></body></html>`);
    return { subject, text, html: h.join("") };
  }

  const enc = encodeURIComponent;
  const crlf = (s) => s.replace(/\r?\n/g, "\r\n");
  function mailto({ to, cc, bcc, subject, body }) {
    const q = [];
    if (cc) q.push("cc=" + enc(cc));
    if (bcc) q.push("bcc=" + enc(bcc));
    q.push("subject=" + enc(subject || ""));
    q.push("body=" + enc(crlf(body || "")));
    return "mailto:" + (to || "").split(",").map((x) => enc(x.trim()).replace(/%40/g, "@")).filter(Boolean).join(",") + "?" + q.join("&");
  }
  function gmail({ to, cc, bcc, subject, body }) {
    return "https://mail.google.com/mail/?view=cm&fs=1&tf=1" + (to ? "&to=" + enc(to) : "") + (cc ? "&cc=" + enc(cc) : "") + (bcc ? "&bcc=" + enc(bcc) : "") + "&su=" + enc(subject || "") + "&body=" + enc(body || "");
  }
  function outlook({ to, cc, bcc, subject, body }) {
    return "https://outlook.live.com/mail/0/deeplink/compose?" + ["to=" + enc(to || ""), cc ? "cc=" + enc(cc) : "", bcc ? "bcc=" + enc(bcc) : "", "subject=" + enc(subject || ""), "body=" + enc(body || "")].filter(Boolean).join("&");
  }
  /* A .eml draft opens in Outlook / Apple Mail / Thunderbird with the full HTML design (X-Unsent = open as draft). */
  function eml({ from, to, bcc, subject, text, html }) {
    const b = "=_eo_" + Math.random().toString(36).slice(2);
    const sub = /[^\x20-\x7e]/.test(subject) ? "=?UTF-8?B?" + btoa(unescape(enc(subject))) + "?=" : subject;
    const b64 = (s) => btoa(unescape(enc(s))).replace(/(.{76})/g, "$1\r\n");
    return ["X-Unsent: 1", from ? "From: " + from : "", "To: " + (to || ""), bcc ? "Bcc: " + bcc : "", "Subject: " + sub, "MIME-Version: 1.0", `Content-Type: multipart/alternative; boundary="${b}"`, "",
      `--${b}`, 'Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: base64", "", b64(text), `--${b}`, 'Content-Type: text/html; charset="UTF-8"', "Content-Transfer-Encoding: base64", "", b64(html), `--${b}--`, ""].filter((x, i) => x !== "" || i > 4).join("\r\n");
  }
  function chunk(arr, n) { n = Math.max(1, n | 0); const o = []; for (let i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n)); return o; }
  function parseEmails(s) {
    const seen = new Set(), ok = [], bad = [];
    String(s || "").split(/[\s,;]+/).map((x) => x.replace(/^<|>$/g, "").trim()).filter(Boolean).forEach((x) => {
      const k = x.toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x)) bad.push(x); else if (!seen.has(k)) { seen.add(k); ok.push(x); }
    });
    return { ok, bad };
  }
  window.EO_MAIL = { TYPES, build, mailto, gmail, outlook, eml, chunk, parseEmails, esc };
})();
