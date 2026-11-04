// ============================================================
// Floating "Support" button — opens a popup modal (not a new
// tab) containing:
//   1. A scrolling ticker with M-Pesa Till/number for people
//      who'd rather pay offline/manually.
//   2. A QR code linking to the BuyMeSoda page.
//   3. The BuyMeSoda page itself, embedded in an iframe.
//
// Payment details come from the "payment" database node, not
// hardcoded here, so updating the till number or link only ever
// needs a database edit.
// ============================================================

(function () {
  let paymentPromise = null;
  function getPayment() {
    if (!paymentPromise) paymentPromise = window.EO_DB.getNode("payment");
    return paymentPromise;
  }

  function buildWidget() {
    const toggle = document.createElement("button");
    toggle.id = "eo-support-toggle";
    toggle.type = "button";
    toggle.innerHTML = "♥ support";

    const overlay = document.createElement("div");
    overlay.id = "eo-support-overlay";
    overlay.innerHTML = `
      <div id="eo-support-modal">
        <div class="titlebar">
          <span>SUPPORT.EXE</span>
          <button type="button" id="eo-support-close" aria-label="Close">✕</button>
        </div>
        <div class="eo-support-ticker"><span id="eo-support-ticker-text">loading payment details…</span></div>
        <div id="eo-support-qr-row">
          <canvas id="eo-support-qr" width="76" height="76"></canvas>
          <p>Scan to open the support page on your phone, or use the M-Pesa details above for an offline/manual payment.</p>
        </div>
        <div id="eo-support-frame-wrap">
          <iframe id="eo-support-iframe" title="Support Ezra Ogombo" loading="lazy"></iframe>
        </div>
        <div id="eo-support-fallback">
          Widget not loading? <a id="eo-support-fallback-link" href="#" target="_blank" rel="noopener">Open the support page in a new tab</a> instead.
        </div>
      </div>
    `;

    document.body.appendChild(toggle);
    document.body.appendChild(overlay);

    let loaded = false;

    async function open() {
      overlay.classList.add("open");
      const payment = await getPayment();
      if (!payment) return;

      const m = payment.mpesa || {};
      const till = m.till_number || "—";
      const biz = m.business_name || "";
      const store = m.store_number || "—";
      document.getElementById("eo-support-ticker-text").textContent =
        `PAY OFFLINE VIA M-PESA — Buy Goods Till: ${till}  ·  Business Name: ${biz}  ·  Store No: ${store}  ·  Or use the widget below  —  `;

      document.getElementById("eo-support-fallback-link").href = payment.buymesoda_url;

      if (!loaded && payment.buymesoda_url) {
        document.getElementById("eo-support-iframe").src = payment.buymesoda_url;
        if (window.EO_QR) {
          (window.EO_QR.mini ? window.EO_QR.mini(document.getElementById("eo-support-qr"), payment.buymesoda_url, 44) : window.EO_QR.drawQR(document.getElementById("eo-support-qr"), payment.buymesoda_url, 76));
        }
        loaded = true;
      }
    }

    function close() {
      overlay.classList.remove("open");
    }

    toggle.addEventListener("click", open);
    document.getElementById("eo-support-close").addEventListener("click", close);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close(); // click on the dark backdrop closes it
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buildWidget);
  } else {
    buildWidget();
  }
})();
