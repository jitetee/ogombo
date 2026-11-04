// ============================================================
// M-Pesa confirmation-message checker (EO_MPESA).
//
// Runs in the buyer's browser at order time (instant feedback) AND again in
// the admin orders page (so the shop owner never has to trust a verdict the
// buyer's browser computed).
//
// IMPORTANT, plainly: a pasted SMS can be typed by anyone, so no browser
// check can PROVE money arrived. What this does is catch lazy fakes and
// honest mistakes, and rank orders:
//   pass    every criterion below matched -> safe to fast-track
//   review  something is off -> tell the buyer "please wait for approval"
//   reject  cannot be an M-Pesa payment for this item (blocked with a reason)
// The final proof is always the till statement (admin → Orders → "Check
// against till statement"), which matches the receipt codes to real money.
//
// Criteria (Buy Goods / Till SMS, English or Swahili):
//   1  message looks like an M-Pesa confirmation ("Confirmed", "Ksh", "paid to")
//   2  a 10-character transaction code that looks like a real one
//   3  amount equals the price exactly (below = reject, above = review)
//   4  paid to this shop (business name or till number appears)
//   5  the date and time in the SMS are within the last N minutes (default 3,
//      +1 minute because SMS times have no seconds) and not in the future
//   6  has the usual tail: "New M-PESA balance" / "Transaction cost"
//   7  no links, not unusually long
//   8  (order page only) the code has not already been used by another buyer
// ============================================================
(function () {
  const EAT = 3 * 3600 * 1000;          // Kenya time is UTC+3, no daylight saving
  const DEFAULTS = { maxAgeMin: 3, futureSlackSec: 90, graceSec: 60 };

  const norm = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim();

  // "9/10/26 at 3:45 PM", "09/10/2026 at 15:45", "9/10/26 saa 3:45 PM"
  function parseTime(t) {
    const m = t.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*(?:at|saa|@|,)?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?/i);
    if (!m) return null;
    let d = +m[1], mo = +m[2], y = +m[3], h = +m[4], mi = +m[5], ap = (m[7] || "").toUpperCase();
    if (y < 100) y += 2000;
    if (ap === "PM" && h < 12) h += 12;
    if (ap === "AM" && h === 12) h = 0;
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
    return Date.UTC(y, mo - 1, d, h, mi, m[6] ? +m[6] : 0) - EAT;
  }

  function codeLooksReal(c) {
    if (!/^[A-Z0-9]{10}$/.test(c)) return false;
    if (!/[A-Z]/.test(c) || !/\d/.test(c) || !/^[A-Z]/.test(c)) return false;   // starts with a letter, mixes letters and digits
    if (/^(.)\1+$/.test(c)) return false;
    if (/(.)\1{4,}/.test(c)) return false;                                    // 5+ identical characters in a row
    if ("ABCDEFGHIJKLMNOPQRSTUVWXYZ".includes(c.slice(0, 5)) || "0123456789".includes(c.slice(-5))) return false;   // obvious sequences
    if (/^(?:TEST|FAKE|SAMPLE|XXXX|ABCD)/.test(c)) return false;
    return true;
  }

  function parse(raw) {
    const t = norm(raw);
    const code = ((t.match(/\b([A-Z0-9]{10})\b\s*(?:Confirmed|Imethibitishwa)/i) || t.match(/^\s*([A-Z0-9]{10})\b/) || t.match(/\b([A-Z]{1,3}[A-Z0-9]{7,9})\b/) || [])[1] || "").toUpperCase();
    const amt = (t.match(/(?:Ksh|KES)\.?\s?([\d,]+(?:\.\d{1,2})?)/i) || [])[1];
    const amount = amt == null ? null : parseFloat(amt.replace(/,/g, ""));
    const rec = (t.match(/(?:paid to|sent to|kwa)\s+(.+?)(?:\.\s|\s+on\s|\s+for account\s|\s+tarehe\s|\s+\d{1,2}\/\d{1,2}\/\d{2,4}|$)/i) || [])[1] || "";
    return {
      text: t, code, amount: amount != null && !isNaN(amount) ? amount : null,
      recipient: norm(rec).replace(/[.\-]+$/, "").toUpperCase(), when: parseTime(t),
      confirmed: /\b(Confirmed|Imethibitishwa)\b/i.test(t),
      paidTo: /\b(paid to|sent to|umelipa|umetuma|kwa)\b/i.test(t),
      balance: /(new\s+m-?pesa\s+balance|salio\s+jipya)/i.test(t),
      cost: /(transaction\s+cost|gharama)/i.test(t),
    };
  }

  // msg: pasted SMS. opts: { price, pay (the `payment` node), now (ms), maxAgeMin }
  function check(raw, opts) {
    opts = opts || {};
    const price = Number(opts.price) || 0;
    const now = opts.now || Date.now();
    const mp = (opts.pay && opts.pay.mpesa) || opts.mpesa || {};
    const cfg = Object.assign({}, DEFAULTS, (opts.pay && opts.pay.verify) || {});
    const maxAge = (Number(opts.maxAgeMin) || Number(cfg.max_age_min) || cfg.maxAgeMin) * 60;
    const p = parse(raw);
    const hard = [], soft = [], ok = [];
    const H = (id, text) => hard.push({ id, text }), S = (id, text) => soft.push({ id, text }), G = (id, text) => ok.push({ id, text });
    let score = 100;

    // 1 looks like an M-Pesa confirmation
    if (p.text.length < 20 || !p.confirmed || p.amount == null || !p.paidTo) { H("format", "That doesn't look like a full M-Pesa confirmation message. Paste the whole SMS exactly as you received it."); score = 0; }
    else G("format", "Looks like an M-Pesa confirmation");

    // 2 code
    if (!p.code) { H("nocode", "We couldn't find the M-Pesa transaction code (10 letters and numbers) in that message."); score = 0; }
    else if (!codeLooksReal(p.code)) { S("code", `The transaction code “${p.code}” doesn't look like a normal M-Pesa code`); score -= 30; }
    else G("code", "Transaction code looks genuine");

    // 3 amount
    if (p.amount != null && price > 0) {
      if (p.amount + 0.001 < price) { H("under", `The message shows KES ${p.amount} but this item costs KES ${price}.`); score = 0; }
      else if (p.amount > price + 0.001) { S("over", `You paid KES ${p.amount} but the price is KES ${price}`); score -= 15; }
      else G("amount", `Amount is exactly KES ${price}`);
    }

    // 4 recipient
    const till = String(mp.till_number || "").replace(/\D/g, ""), store = String(mp.store_number || "").replace(/\D/g, "");
    const biz = norm(mp.business_name).toUpperCase().split(" ").filter((w) => w.length >= 2);
    const digits = p.text.replace(/\D/g, " ");
    const hasNum = (n) => n && new RegExp("(^|\\s)" + n + "(\\s|$)").test(digits);
    const nameOk = biz.length && biz.every((w) => p.recipient.includes(w) || p.text.toUpperCase().includes(w));
    if (!(biz.length || till)) G("to", "Shop details not set (skipped)");
    else if (nameOk || hasNum(till) || hasNum(store)) G("to", "Paid to this shop");
    else { S("to", `The message isn't paid to ${mp.business_name || "this shop"}${till ? " (till " + till + ")" : ""}`); score -= 35; }

    // 5 freshness
    if (p.when == null) { S("nodate", "No date and time found in the message"); score -= 25; }
    else {
      const ageSec = Math.round((now - p.when) / 1000);
      p.ageSec = ageSec;
      if (ageSec < -cfg.futureSlackSec) { S("future", "The time in the message is in the future. Check your phone's date and time"); score -= 35; }
      else if (ageSec > maxAge + cfg.graceSec) { S("stale", `The payment was made more than ${Math.round(maxAge / 60)} minutes ago`); score -= 30; }
      else G("fresh", `Paid ${Math.max(0, Math.round(ageSec / 60))} min ago`);
    }

    // 6 usual tail of the SMS
    if (!p.balance && !p.cost) { S("tail", "The usual “New M-PESA balance” and “Transaction cost” lines are missing"); score -= 10; }
    else G("tail", "Has the usual balance and cost lines");

    // 7 junk
    if (/https?:\/\/|www\.|\.com\b|bit\.ly/i.test(p.text)) { S("link", "The message contains a link, which real M-Pesa confirmations don't"); score -= 30; }
    if (p.text.length > 700) { S("long", "The message is longer than a normal M-Pesa SMS"); score -= 10; }

    const verdict = hard.length ? "reject" : soft.some((s) => ["code", "over", "to", "nodate", "future", "stale", "link", "long"].includes(s.id)) ? "review" : "pass";
    return { verdict, score: Math.max(0, Math.min(100, score)), hard, soft, ok, parsed: p, maxAgeMin: maxAge / 60,
      flags: hard.concat(soft).map((x) => x.id), reasons: hard.concat(soft).map((x) => x.text) };
  }

  // The short line shown to the buyer
  function buyerText(res) {
    if (res.verdict === "pass") return "Your payment details match this order ✓ Your download link will be sent as soon as the payment is confirmed.";
    if (res.verdict === "review") return "We flagged this message (" + res.reasons.slice(0, 3).join("; ") + "). Please wait for approval: we will check the payment by hand and send your link.";
    return res.reasons[0] || "That message can't be used for this order.";
  }

  // For the statement checker in the admin: pull codes (and amounts) out of pasted M-Pesa statement text/CSV
  function parseStatement(text) {
    const rows = {};
    String(text || "").split(/\r?\n/).forEach((line) => {
      const c = (line.match(/\b([A-Z][A-Z0-9]{9})\b/g) || []).find((x) => /\d/.test(x));
      if (!c) return;
      const nums = (line.replace(/\b[A-Z][A-Z0-9]{9}\b/g, " ").match(/\d[\d,]*\.?\d*/g) || []).map((n) => parseFloat(n.replace(/,/g, ""))).filter((n) => !isNaN(n));
      rows[c] = { line: line.trim(), nums };
    });
    return rows;
  }

  window.EO_MPESA = { check, parse, parseTime, buyerText, parseStatement, codeLooksReal };
})();
