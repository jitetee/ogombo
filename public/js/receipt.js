// ============================================================
// Order receipts for paid materials.
//
//  - Builds a receipt from an order (no server needed; it is kept in this
//    browser's localStorage so the buyer can re-open it at /receipt).
//  - Draws the receipt on a canvas -> shows it as a preview, and lets the buyer
//      * send it to Ezra on WhatsApp (chat message with all the details)
//      * send it to Ezra by SMS (short version)
//      * share it with any app (Web Share API, with the image when supported)
//      * download it as a PDF or PNG image
//      * copy the text
//  - Every receipt carries Ezra's support number, email and a QR code that
//    opens a WhatsApp chat with the receipt number already filled in, so the
//    buyer can report late delivery, a wrong file, a broken link, etc.
//
// The receipt is an ORDER receipt: it shows the payment as "pending
// verification" because the M-Pesa message is checked by hand afterwards.
//
// Needs (already on the order page): js/vendor/qrcode.js + js/qr.js (EO_QR).
// The text builders (EO_RECEIPT.text / supportMessage) have no dependencies,
// so the admin page can use them too.
// ============================================================
(function () {
  const STORE = "eo_receipts";
  const ISSUES = [
    ["late", "Late delivery"],
    ["nolink", "Link not working"],
    ["wrongfile", "Wrong or missing file"],
    ["payment", "Payment problem"],
    ["other", "Something else"],
  ];

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const digits = (n) => String(n || "").replace(/\D/g, "");
  function intl(n) { let d = digits(n); if (d.startsWith("0")) d = "254" + d.slice(1); return d; }
  function prettyPhone(n) {
    const d = intl(n);
    return d.length === 12 && d.startsWith("254") ? `0${d.slice(3, 6)} ${d.slice(6, 9)} ${d.slice(9)}` : String(n || "");
  }
  const money = (n) => "KES " + Number(n || 0).toLocaleString("en-KE");
  function when(ts) {
    try {
      return new Date(ts).toLocaleString("en-GB", { timeZone: "Africa/Nairobi", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
    } catch { return new Date(ts).toLocaleString(); }
  }
  const VIA = { whatsapp: "WhatsApp", sms: "SMS", email: "Email" };

  // ---------- build ----------
  // order: the object saved in `material_orders`; cfg: site settings; pay: the `payment` node
  function build(order, cfg, pay) {
    cfg = cfg || {}; pay = pay || {};
    const w = cfg.whatsapp || {};
    const nums = (w.numbers || []).slice();
    const primary = w.primary || nums[0] || (pay.mpesa && pay.mpesa.phone) || "";
    const alt = nums.filter((n) => intl(n) !== intl(primary));
    const mp = pay.mpesa || {};
    return {
      v: 1,
      ref: order.ref, ts: order.ts || Date.now(),
      title: order.material_title || order.title || "Study material", slug: order.material_slug || order.slug || "",
      price: Number(order.price) || 0,
      name: order.name || "", phone: order.phone || "", email: order.email || "",
      via: order.deliver_via || "whatsapp", to: order.deliver_to || "",
      code: order.mpesa_code || "", paid: order.mpesa_amount == null ? null : Number(order.mpesa_amount),
      status: order.status || "pending",
      site: cfg.site_name || "Ezra Ogombo", url: cfg.site_url || (typeof location !== "undefined" ? location.origin : ""),
      support: { phone: primary, alt, email: cfg.email || "" },
      till: { number: mp.till_number || "", name: mp.business_name || "", type: mp.type || "Buy Goods Till" },
      note: (cfg.orders && cfg.orders.delivery_note) || "",
    };
  }

  const STATUS_LABEL = { pending: "Order received - payment being verified", verified: "Payment verified", delivered: "Delivered", rejected: "Payment could not be verified" };
  const statusText = (r) => STATUS_LABEL[r.status] || STATUS_LABEL.pending;

  // ---------- text versions ----------
  function supportMessage(r, issueLabel) {
    return `Hello Ezra, I need help with my order.\nIssue: ${issueLabel || "Support"}\nReceipt no: ${r.ref}\nItem: ${r.title}\nM-Pesa code: ${r.code || "-"}\nName: ${r.name}`;
  }
  // kind: "wa" (WhatsApp, *bold*), "sms" (short), "plain"
  function text(r, kind) {
    const sp = prettyPhone(r.support.phone);
    if (kind === "sms") {
      const t = r.title.length > 60 ? r.title.slice(0, 57) + "..." : r.title;
      return `RECEIPT ${r.ref}\n${t}\n${money(r.price)} | M-Pesa ${r.code || "-"}\n${when(r.ts)}\nStatus: ${statusText(r)}\nHelp: ${sp}`;
    }
    const b = (s) => (kind === "wa" ? `*${s}*` : s);
    return [
      b(`RECEIPT - ${r.site}`),
      `Receipt no: ${r.ref}`,
      `Date: ${when(r.ts)}`,
      `Item: ${r.title}`,
      `Amount: ${money(r.price)}`,
      `M-Pesa code: ${r.code || "-"}`,
      `Name: ${r.name}`,
      `Phone: ${r.phone}`,
      `Link to be sent via: ${VIA[r.via] || r.via} (${r.to})`,
      `Status: ${statusText(r)}`,
      "",
      `Support: ${sp}${r.support.email ? " | " + r.support.email : ""}`,
      r.url,
    ].join("\n");
  }
  const waLink = (r, msg) => `https://wa.me/${intl(r.support.phone)}?text=${encodeURIComponent(msg)}`;
  const smsLink = (r, msg) => `sms:+${intl(r.support.phone)}?&body=${encodeURIComponent(msg)}`;
  const supportUrl = (r) => `https://wa.me/${intl(r.support.phone)}?text=${encodeURIComponent("Support request - receipt " + r.ref)}`;

  // ---------- canvas drawing ----------
  const W = 1000, H = 1414; // A4 ratio
  const C = { ink: "#14201a", dim: "#5b6b62", line: "#d6dfd9", green: "#1f7a4d", dark: "#0f1f17", mint: "#9fe0bd", soft: "#eef7f1", amber: "#8a4b00", amberBg: "#fff1d6" };
  const SANS = "Helvetica, Arial, 'Segoe UI', sans-serif", MONO = "'Courier New', Courier, monospace";

  function wrap(ctx, str, maxW, maxLines) {
    const words = String(str || "").split(/\s+/).filter(Boolean), lines = []; let cur = "";
    for (const w of words) {
      const t = cur ? cur + " " + w : w;
      if (ctx.measureText(t).width <= maxW) cur = t;
      else { if (cur) lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    if (maxLines && lines.length > maxLines) {
      lines.length = maxLines;
      let last = lines[maxLines - 1];
      while (last && ctx.measureText(last + "...").width > maxW) last = last.slice(0, -1);
      lines[maxLines - 1] = last.replace(/\s+$/, "") + "...";
    }
    return lines;
  }
  function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function font(ctx, size, weight, fam) { ctx.font = `${weight || "normal"} ${size}px ${fam || SANS}`; }

  function draw(r) {
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
    ctx.textBaseline = "alphabetic";
    const M = 60; // side margin

    // header band
    ctx.fillStyle = C.dark; ctx.fillRect(0, 0, W, 140);
    ctx.fillStyle = C.green; ctx.fillRect(0, 140, W, 8);
    ctx.fillStyle = "#fff"; ctx.textAlign = "left"; font(ctx, 52, "bold"); ctx.fillText(r.site.toUpperCase(), M, 74);
    ctx.fillStyle = C.mint; font(ctx, 23); ctx.fillText("Study materials | Perioperative Theatre Technology", M, 112);
    ctx.fillStyle = "#fff"; ctx.textAlign = "right"; font(ctx, 30, "bold"); ctx.fillText("ORDER RECEIPT", W - M, 74);
    ctx.fillStyle = C.mint; font(ctx, 22); ctx.fillText(r.url.replace(/^https?:\/\//, ""), W - M, 112);

    // receipt no + date
    ctx.textAlign = "left"; ctx.fillStyle = C.dim; font(ctx, 20, "bold"); ctx.fillText("RECEIPT NO.", M, 200);
    ctx.fillStyle = C.ink; font(ctx, 50, "bold", MONO); ctx.fillText(r.ref, M, 256);
    ctx.textAlign = "right"; ctx.fillStyle = C.dim; font(ctx, 20, "bold"); ctx.fillText("DATE (EAT)", W - M, 200);
    ctx.fillStyle = C.ink; font(ctx, 28, "bold"); ctx.fillText(when(r.ts), W - M, 252);

    // status pill
    const st = statusText(r).toUpperCase();
    ctx.textAlign = "left"; font(ctx, 22, "bold");
    const pw = ctx.measureText(st).width + 56;
    ctx.fillStyle = r.status === "delivered" || r.status === "verified" ? C.soft : C.amberBg;
    rrect(ctx, M, 282, pw, 46, 23); ctx.fill();
    ctx.fillStyle = r.status === "delivered" || r.status === "verified" ? C.green : C.amber; ctx.fillText(st, M + 28, 313);

    // item
    ctx.fillStyle = C.line; ctx.fillRect(M, 356, W - 2 * M, 2);
    ctx.fillStyle = C.dim; font(ctx, 20, "bold"); ctx.fillText("ITEM ORDERED", M, 394);
    ctx.fillStyle = C.ink; font(ctx, 38, "bold");
    const tl = wrap(ctx, r.title, W - 2 * M - 230, 2);
    tl.forEach((l, i) => ctx.fillText(l, M, 442 + i * 46));
    ctx.textAlign = "right"; font(ctx, 44, "bold"); ctx.fillText(money(r.price), W - M, 442);
    ctx.textAlign = "left";
    const afterItem = 442 + (tl.length - 1) * 46 + 16;

    // details rows
    const rows = [
      ["Name", r.name],
      ["Phone", r.phone],
      ["Link sent via", VIA[r.via] || r.via],
      ["Send link to", r.to],
      ["M-Pesa code", r.code || "-", true],
    ];
    if (r.paid != null) rows.push(["Amount in M-Pesa message", money(r.paid)]);
    if (r.till.number) rows.push(["Paid to", `${r.till.type} ${r.till.number}${r.till.name ? " (" + r.till.name + ")" : ""}`]);
    let y = afterItem + 14;
    ctx.fillStyle = C.line; ctx.fillRect(M, y, W - 2 * M, 2);
    const RH = 47;
    rows.forEach((row, i) => {
      const by = y + RH * (i + 1);
      ctx.textAlign = "left"; ctx.fillStyle = C.dim; font(ctx, 22); ctx.fillText(row[0], M, by - 15);
      ctx.textAlign = "right"; ctx.fillStyle = C.ink; font(ctx, 25, "bold", row[2] ? MONO : SANS);
      let v = String(row[1] || "-"); while (ctx.measureText(v).width > W - 2 * M - 300 && v.length > 4) v = v.slice(0, -2);
      ctx.fillText(v === String(row[1] || "-") ? v : v + "...", W - M, by - 15);
      ctx.fillStyle = C.line; ctx.fillRect(M, by, W - 2 * M, 1);
    });
    y = y + RH * rows.length + 24;

    // total
    ctx.fillStyle = C.soft; rrect(ctx, M, y, W - 2 * M, 84, 10); ctx.fill();
    ctx.textAlign = "left"; ctx.fillStyle = C.green; font(ctx, 24, "bold"); ctx.fillText("TOTAL", M + 28, y + 52);
    ctx.textAlign = "right"; ctx.fillStyle = C.ink; font(ctx, 44, "bold"); ctx.fillText(money(r.price), W - M - 28, y + 58);
    y += 84 + 34;

    // what happens next
    ctx.textAlign = "left"; ctx.fillStyle = C.ink; font(ctx, 24, "bold"); ctx.fillText("What happens next", M, y);
    ctx.fillStyle = C.dim; font(ctx, 22);
    const nextTxt = r.note || "Your download link is sent to the number or email above once your payment is verified.";
    const nl = wrap(ctx, nextTxt, W - 2 * M, 3);
    nl.forEach((l, i) => ctx.fillText(l, M, y + 34 + i * 28));
    y += 34 + nl.length * 28 + 16;

    // support box
    const bh = Math.max(215, H - 62 - y);
    ctx.strokeStyle = C.green; ctx.lineWidth = 3; rrect(ctx, M, y, W - 2 * M, bh, 14); ctx.stroke();
    const qs = Math.min(bh - 40, 120), qx = M + 24, qy = y + (bh - qs) / 2;
    try {
      const qc = document.createElement("canvas");
      window.EO_QR.drawQR(qc, supportUrl(r), qs * 4);
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high"; ctx.drawImage(qc, qx, qy, qs, qs);
      ctx.strokeStyle = C.line; ctx.lineWidth = 2; ctx.strokeRect(qx - 6, qy - 6, qs + 12, qs + 12);
    } catch (e) { /* QR library missing: the numbers below still work */ }
    const tx = qx + qs + 38, tw = W - M - 24 - tx;
    ctx.textAlign = "left"; ctx.fillStyle = C.green; font(ctx, 26, "bold"); ctx.fillText("NEED HELP WITH THIS ORDER?", tx, y + 48);
    ctx.fillStyle = C.dim; font(ctx, 20);
    const hl = wrap(ctx, "Late delivery, wrong file, link not working or a payment problem: scan the QR to open WhatsApp with your receipt number filled in, or contact:", tw, 4);
    hl.forEach((l, i) => ctx.fillText(l, tx, y + 80 + i * 26));
    let yy = y + 80 + hl.length * 26 + 14;
    ctx.fillStyle = C.ink; font(ctx, 30, "bold"); ctx.fillText(prettyPhone(r.support.phone) + "  (WhatsApp / call)", tx, yy);
    yy += 30; ctx.fillStyle = C.dim; font(ctx, 20);
    const extra = [r.support.alt.length ? "Alt: " + r.support.alt.map(prettyPhone).join(", ") : "", r.support.email].filter(Boolean).join("  |  ");
    if (extra) { let e = extra; while (ctx.measureText(e).width > tw && e.length > 6) e = e.slice(0, -2); ctx.fillText(e, tx, yy); yy += 28; }
    ctx.fillStyle = C.ink; font(ctx, 20, "bold"); ctx.fillText("Quote receipt no. " + r.ref, tx, yy + 4);

    // footer
    ctx.textAlign = "center"; ctx.fillStyle = C.dim; font(ctx, 17);
    ctx.fillText("Computer-generated order receipt. Keep it until your material is delivered.", W / 2, H - 24);
    return cv;
  }

  // ---------- export helpers ----------
  const fileBase = (r) => "receipt-" + String(r.ref).replace(/[^\w-]/g, "");
  function canvasBlob(cv, type, q) { return new Promise((res) => cv.toBlob(res, type, q)); }
  function trigger(blob, name) {
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }
  // One-page A4 PDF that holds the receipt image (built by hand: no library, works offline).
  function pdfFromJpeg(jpg, w, h, title) {
    const enc = new TextEncoder(), chunks = [], offs = []; let len = 0;
    const add = (x) => { const b = typeof x === "string" ? enc.encode(x) : x; chunks.push(b); len += b.length; };
    const obj = (n, body) => { offs[n] = len; add(`${n} 0 obj\n${body}\nendobj\n`); };
    const PW = 595.28, PH = 841.89;
    add("%PDF-1.4\n");
    obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
    obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
    obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
    offs[4] = len; add(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`); add(jpg); add("\nendstream\nendobj\n");
    const content = `q ${PW} 0 0 ${PH} 0 0 cm /Im0 Do Q`;
    obj(5, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    const t = String(title || "Receipt").replace(/[^\w .-]/g, "");
    obj(6, `<< /Title (${t}) /Producer (ezra-ogombo site) >>`);
    const xref = len;
    add(`xref\n0 7\n0000000000 65535 f \n` + [1, 2, 3, 4, 5, 6].map((n) => String(offs[n]).padStart(10, "0") + " 00000 n \n").join(""));
    add(`trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF`);
    const out = new Uint8Array(len); let p = 0; chunks.forEach((c) => { out.set(c, p); p += c.length; });
    return new Blob([out], { type: "application/pdf" });
  }
  async function pdfBlob(r) {
    const cv = draw(r), jb = await canvasBlob(cv, "image/jpeg", 0.92);
    return pdfFromJpeg(new Uint8Array(await jb.arrayBuffer()), cv.width, cv.height, "Receipt " + r.ref);
  }
  const downloadPdf = async (r) => trigger(await pdfBlob(r), fileBase(r) + ".pdf");
  const downloadPng = async (r) => trigger(await canvasBlob(draw(r), "image/png"), fileBase(r) + ".png");

  async function share(r) {
    const msg = text(r, "wa");
    try {
      if (navigator.share) {
        const png = await canvasBlob(draw(r), "image/png");
        const file = new File([png], fileBase(r) + ".png", { type: "image/png" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: "Receipt " + r.ref, text: msg }); return true; }
        await navigator.share({ title: "Receipt " + r.ref, text: msg }); return true;
      }
    } catch (e) { if (e && e.name === "AbortError") return true; }
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank", "noopener"); // no share sheet: WhatsApp's own "choose a chat"
    return false;
  }
  async function copy(r) {
    const t = text(r, "plain");
    try { await navigator.clipboard.writeText(t); return true; } catch {
      const ta = document.createElement("textarea"); ta.value = t; document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand("copy"); } catch {} ta.remove(); return ok;
    }
  }

  // ---------- storage (this browser only) ----------
  function list() { try { return JSON.parse(localStorage.getItem(STORE) || "[]").filter((x) => x && x.ref); } catch { return []; } }
  function save(r) {
    try { const l = list().filter((x) => x.ref !== r.ref); l.unshift(r); localStorage.setItem(STORE, JSON.stringify(l.slice(0, 30))); } catch {}
  }
  const find = (ref) => list().find((x) => x.ref === ref) || null;

  // ---------- UI ----------
  function mount(host, r) {
    const sp = prettyPhone(r.support.phone);
    const waMsg = text(r, "wa"), smsMsg = text(r, "sms");
    host.innerHTML = `<div class="receipt-panel">
      <h3 class="rc-h">Your receipt <span class="mono">${esc(r.ref)}</span></h3>
      <p class="rc-sub">Save it, or send it to Ezra so he can find your order quickly. The QR code on the receipt opens a WhatsApp chat for support.</p>
      <img class="receipt-preview" alt="Receipt ${esc(r.ref)}" src="">
      <div class="rc-row">
        <a class="btn primary" data-rc="wa" target="_blank" rel="noopener" href="${esc(waLink(r, waMsg))}">Send to WhatsApp</a>
        <a class="btn" data-rc="sms" href="${esc(smsLink(r, smsMsg))}">Send by SMS</a>
        <button class="btn" type="button" data-rc="share">Share…</button>
      </div>
      <div class="rc-row">
        <button class="btn" type="button" data-rc="pdf">Download PDF</button>
        <button class="btn" type="button" data-rc="png">Download image</button>
        <button class="btn" type="button" data-rc="copy">Copy text</button>
      </div>
      <div class="rc-help">
        <label for="rc-issue-${esc(r.ref)}">Need help with this order?</label>
        <div class="rc-row">
          <select id="rc-issue-${esc(r.ref)}" data-rc="issue">${ISSUES.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join("")}</select>
          <a class="btn" data-rc="help" target="_blank" rel="noopener" href="#">Message Ezra on WhatsApp</a>
        </div>
        <p class="rc-sub">Or call / WhatsApp <strong class="mono">${esc(sp)}</strong>${r.support.email ? ` · ${esc(r.support.email)}` : ""}</p>
      </div>
      <p class="rc-status mono" role="status" aria-live="polite"></p>
    </div>`;
    const $ = (k) => host.querySelector(`[data-rc="${k}"]`), say = (t) => { host.querySelector(".rc-status").textContent = t; };
    const img = host.querySelector(".receipt-preview");
    const paint = () => { try { img.src = draw(r).toDataURL("image/png"); } catch { img.remove(); } };
    paint();
    // redraw once the QR code library / fonts are ready (first paint may run before they are)
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(paint);
    const help = $("help"), issue = $("issue");
    const setHelp = () => { const lbl = issue.options[issue.selectedIndex].text; help.href = waLink(r, supportMessage(r, lbl)); };
    issue.addEventListener("change", setHelp); setHelp();
    $("share").addEventListener("click", async () => { const native = await share(r); say(native ? "" : "Opened WhatsApp: pick a chat to send the receipt to."); });
    $("pdf").addEventListener("click", async () => { say("Preparing PDF…"); try { await downloadPdf(r); say("PDF downloaded ✓"); } catch { say("Could not make the PDF. Try Download image."); } });
    $("png").addEventListener("click", async () => { try { await downloadPng(r); say("Image downloaded ✓"); } catch { say("Could not make the image."); } });
    $("copy").addEventListener("click", async () => say((await copy(r)) ? "Receipt text copied ✓" : "Could not copy."));
    return { receipt: r };
  }

  window.EO_RECEIPT = { build, save, list, find, mount, text, supportMessage, waLink, smsLink, supportUrl, draw, pdfBlob, downloadPdf, downloadPng, share, copy, prettyPhone, money, when, ISSUES };
})();
