// Paid-material order form: /materials/order/<slug>
// Pay offline via M-Pesa, paste the confirmation SMS, choose where the link should go.
// Saved to `material_orders` (admin-only read). Admin verifies and sends the Drive link.
(async () => {
  const U = window.EO_UTIL, E = U.esc;
  const slug = U.params().get("slug") || decodeURIComponent(location.pathname.split("/").filter(Boolean).pop() || "");
  const $ = (id) => document.getElementById(id);
  const [cfg, mats, pay] = await Promise.all([window.EO_SITE.ready, window.EO_DB.getNode("materials"), window.EO_DB.getNode("payment")]);
  const m = (mats || []).find((x) => x && x.slug === slug);
  if (!m || !U.isPublished(m)) { $("order-box").innerHTML = `<p>That material isn't available. <a href="/materials">Browse materials →</a></p>`; return; }
  if (m.access !== "paid") { location.replace(`/materials/item/${slug}`); return; }

  const mp = (pay && pay.mpesa) || {};
  // ---- discount code (usage-limited): material_coupons/<CODE> {percent|off, materials, max_uses, used, per_user_once, expires, active}
  let coupon = null, price = Number(m.price) || 0;
  const priceNow = () => { if (!coupon) return Number(m.price) || 0; const base = Number(m.price) || 0; return Math.max(0, Math.round(base * (100 - (coupon.percent || 0)) / 100 - (coupon.off || 0))); };
  const hash = async (code, phone) => { let n = String(phone || "").replace(/\D/g, ""); if (n.startsWith("0")) n = "254" + n.slice(1); const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code + "|" + n)); return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("").slice(0, 20); };
  function paintPrice() {
    price = priceNow();
    $("o-price").innerHTML = coupon && price !== Number(m.price) ? `<s style="opacity:.6">KES ${E(m.price)}</s> KES ${E(price)}` : `KES ${E(m.price)}`;
    $("o-mp").hidden = price === 0;
    const li = $("o-pay").querySelector("[data-amt]"); if (li) li.textContent = price === 0 ? "nothing to pay" : "KES " + price;
    $("o-pay").hidden = price === 0;
  }
  $("o-title").textContent = m.title;
  $("o-price").textContent = `KES ${m.price}`;
  $("o-back").href = `/materials/item/${slug}`;
  $("o-pay").innerHTML = `<ol style="color:var(--ink-dim);padding-left:1.2rem;margin:0">
    <li>Open M-Pesa → <strong>Lipa na M-Pesa</strong> → <strong>${E(mp.type || "Buy Goods")}</strong>.</li>
    <li>Till number: <strong class="mono">${E(mp.till_number || "—")}</strong> (${E(mp.business_name || "")}).</li>
    <li>Amount: <strong data-amt>KES ${E(m.price)}</strong>, then enter your PIN.</li>
    <li>Copy the M-Pesa confirmation message and paste it below.</li></ol>`;

  const form = $("order-form");
  async function applyCode() {
    const code = ($("o-coupon").value || "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, ""), msg = $("o-cpmsg"); coupon = null; $("o-coupon").value = code;
    if (!code) { msg.textContent = ""; paintPrice(); return; }
    let c = null; try { c = await window.EO_DB.getPath("material_coupons/" + code); } catch {}
    const today = new Date().toISOString().slice(0, 10), only = String(c && c.materials || "").split(",").map((x) => x.trim()).filter(Boolean);
    if (!c || c.active !== true) msg.textContent = "That code isn't valid.";
    else if (c.expires && c.expires < today) msg.textContent = "That code has expired.";
    else if (c.max_uses && (Number(c.used) || 0) >= Number(c.max_uses)) msg.textContent = "Sorry, that code has been fully used.";
    else if (only.length && !only.includes(slug)) msg.textContent = "That code doesn't apply to this material.";
    else { coupon = { code, percent: Number(c.percent) || 0, off: Number(c.off) || 0, once: c.once !== false, left: c.max_uses ? Number(c.max_uses) - (Number(c.used) || 0) : null }; msg.textContent = (coupon.percent ? coupon.percent + "% off" : "KES " + coupon.off + " off") + " applied ✓" + (coupon.left != null && coupon.left <= 5 ? ` — only ${coupon.left} use${coupon.left === 1 ? "" : "s"} left` : ""); }
    paintPrice();
  }
  $("o-apply").onclick = applyCode;
  const via = () => form.deliver_via.value;
  function syncTo() {
    const e = via() === "email";
    $("to-label").textContent = e ? "Email to receive the link" : "WhatsApp / SMS number to receive the link";
    form.deliver_to.type = e ? "email" : "tel";
    if (!form.deliver_to.dataset.touched) form.deliver_to.value = e ? form.email.value : form.phone.value;
  }
  form.addEventListener("change", syncTo);
  form.deliver_to.addEventListener("input", () => { form.deliver_to.dataset.touched = "1"; });
  form.phone.addEventListener("input", () => { if (via() !== "email" && !form.deliver_to.dataset.touched) form.deliver_to.value = form.phone.value; });
  syncTo();

  // live hint under the pasted message: what we can read from it (same checker as on submit)
  const live = document.createElement("small"); live.id = "o-live"; live.style.display = "block"; live.style.marginTop = ".3rem";
  form.mpesa.parentNode.appendChild(live);
  const paintLive = () => {
    const v = form.mpesa.value.trim();
    if (!v || price === 0) { live.textContent = ""; return; }
    const r = window.EO_MPESA.check(v, { price, pay });
    live.textContent = r.parsed.code ? `Read: code ${r.parsed.code}${r.parsed.amount != null ? " · KES " + r.parsed.amount : ""}${r.parsed.ageSec != null ? " · paid " + Math.max(0, Math.round(r.parsed.ageSec / 60)) + " min ago" : ""} ${r.verdict === "pass" ? "✓" : r.verdict === "review" ? "⚠ will be flagged for approval" : "✗"}` : "Paste the whole SMS so we can read the code.";
  };
  form.mpesa.addEventListener("input", paintLive);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const st = $("o-status"); st.className = "form-status";
    if (form.website.value) return;
    const name = form.name.value.trim(), phone = form.phone.value.trim(), email = form.email.value.trim(), to = form.deliver_to.value.trim(), msg = form.mpesa.value.trim();
    if (!name || phone.replace(/\D/g, "").length < 9) { st.textContent = "Please enter your name and a valid phone number."; return; }
    if (!to || (via() === "email" && !/^\S+@\S+\.\S+$/.test(to))) { st.textContent = "Tell us where to send the download link."; return; }
    if (form.coupon.value.trim() && !coupon) await applyCode();
    if (form.coupon.value.trim() && !coupon) { st.textContent = "The discount code isn't valid. Clear it or fix it."; return; }
    const free = price === 0;
    if (!free && msg.length < 20) { st.textContent = "Paste the full M-Pesa confirmation message."; return; }
    const submitAt = Date.now();
    const chk = free ? null : window.EO_MPESA.check(msg, { price, pay, now: submitAt });
    if (chk && chk.verdict === "reject") { st.textContent = window.EO_MPESA.buyerText(chk); return; }
    const code = free ? "" : chk.parsed.code, amount = free ? null : chk.parsed.amount;
    // one M-Pesa code can only pay for one order: look it up (the registry lets anyone read a single code, never list them)
    const holder = free ? "" : await hash(code, phone);
    if (!free) {
      let used = null; try { used = await window.EO_DB.getPath("mpesa_codes/" + code); } catch {}
      if (used && used.h && used.h !== holder) { st.textContent = "That M-Pesa code has already been used for another order. If this is a mistake, WhatsApp us."; return; }
    }
    const ref = "EO-" + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 4).toUpperCase();
    const order = { ref, material_slug: slug, material_title: m.title, price, name, phone, email, deliver_via: via(), deliver_to: to,
      mpesa_message: free ? "FREE-WITH-CODE " + (coupon ? coupon.code : "") : msg, mpesa_code: code, mpesa_amount: amount, status: "pending", ts: submitAt };
    // advisory verdict for the shop owner; the admin page re-runs the check itself and never trusts this field
    if (chk) order.auto = { v: chk.verdict, s: chk.score, f: chk.flags.join(",").slice(0, 120) };
    if (coupon) { order.coupon = coupon.code; order.list_price = Number(m.price) || 0; order.discount = (Number(m.price) || 0) - price; }
    st.textContent = "Sending order…";
    try {
      if (coupon) {
        // use up one place on the code: one use per phone number first, then the limited counter (both enforced by the database rules)
        try { await window.EO_DB.set(`material_coupon_uses/${coupon.code}/${await hash(coupon.code, phone)}`, true); }
        catch { if (coupon.once) { st.textContent = "This code was already used with that phone number."; return; } }
        try { await window.EO_DB.increment(`material_coupons/${coupon.code}/used`); }
        catch { st.textContent = "Sorry, that code has just been fully used. Clear it to order at the normal price."; coupon = null; paintPrice(); return; }
      }
      await window.EO_DB.push("material_orders", order);
      if (code) { try { await window.EO_DB.set("mpesa_codes/" + code, { ref, h: holder, ts: submitAt }); } catch {} }
      try { const l = JSON.parse(localStorage.getItem("eo_orders") || "[]"); l.push({ slug, ref, ts: order.ts }); localStorage.setItem("eo_orders", JSON.stringify(l)); } catch {}
      form.hidden = true;
      $("o-done").hidden = false;
      $("o-ref").textContent = ref;
      $("o-where").textContent = to;
      $("o-note").textContent = (cfg.orders && cfg.orders.delivery_note) || "";
      const vd = $("o-verdict");
      if (vd) { if (chk) { vd.hidden = false; vd.className = "verdict " + chk.verdict; vd.textContent = window.EO_MPESA.buyerText(chk); } else vd.hidden = true; }
      const wa = $("o-wa"); wa.setAttribute("data-msg", `Hi, I've ordered "${m.title}" (ref ${ref}, M-Pesa ${code}).`);
      try {
        const rc = window.EO_RECEIPT.build(order, cfg, pay);
        window.EO_RECEIPT.save(rc);
        window.EO_RECEIPT.mount($("o-receipt"), rc);
      } catch (err) { /* receipt is a bonus: never block the order confirmation */ }
      window.EO_SITE.refresh();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) { st.textContent = /\b(401|403)\b/.test(String(err && err.message)) ? "We could not accept the order. Please check your phone's date and time is set to automatic, then try again." : "Could not send the order right now. Please try again, or WhatsApp us your M-Pesa message."; }
  });
})();
