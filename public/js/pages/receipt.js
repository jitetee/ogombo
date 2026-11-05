// /receipt — re-open receipts saved in this browser by the order page. /receipt?ref=EO-XXXX opens one directly.
(async () => {
  const U = window.EO_UTIL, E = U.esc;
  await window.EO_SITE.ready;
  const list = window.EO_RECEIPT.list();
  const host = document.getElementById("rc-list"), view = document.getElementById("rc-view");
  if (!list.length) {
    host.innerHTML = `<div class="crt-window"><div class="titlebar"><span class="label">none</span></div><div class="body"><p>No receipts on this device yet. Receipts appear here after you order a paid material. If you ordered on another phone or browser, WhatsApp us your M-Pesa message and we will help.</p><p><a class="btn" data-whatsapp href="#">Message us on WhatsApp</a> <a class="btn" href="/materials">Browse materials</a></p></div></div>`;
    window.EO_SITE.refresh(); return;
  }
  const want = U.params().get("ref");
  function show(ref) {
    const r = window.EO_RECEIPT.find(ref) || list[0];
    host.querySelectorAll("[data-ref]").forEach((b) => b.classList.toggle("primary", b.dataset.ref === r.ref));
    view.innerHTML = ""; window.EO_RECEIPT.mount(view, r);
  }
  host.innerHTML = `<div class="rc-row">${list.map((r) => `<button class="btn" type="button" data-ref="${E(r.ref)}">${E(r.ref)} · ${E(r.title)}</button>`).join("")}</div>`;
  host.querySelectorAll("[data-ref]").forEach((b) => b.addEventListener("click", () => show(b.dataset.ref)));
  show(want);
})();
