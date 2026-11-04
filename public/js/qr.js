// ============================================================
// Renders real QR codes in the browser, on a <canvas>, using the
// vendored js/vendor/qrcode.js encoder (MIT, Kazuhiko Arase) — no
// external QR API, no pre-generated PNG files. Codes are built
// fresh from whatever URL is passed in (or the current page's own
// URL), so they never go stale when a domain or slug changes.
//
// Usage:
//   <canvas data-qr="self" data-qr-size="120"></canvas>
//   <canvas data-qr="https://wa.me/254757927084" data-qr-size="96"></canvas>
//
// "self" resolves to the current page URL at render time.
// Nothing here is ever stored as a PNG — every code is drawn live.
// ============================================================

(function () {
  const AVATAR_SRC = "/assets/icons/icon-192.png";
  const AVATAR_RATIO = 0.24; // center logo covers ~22% of the QR width — safe under error-correction level H

  const LOGO = new Image(); LOGO.src = AVATAR_SRC;   // preloaded so every QR can show it straight away

  function drawQR(canvas, text, size, opts) {
    opts = opts || {};
    const qr = qrcode(0, "H"); // type 0 = auto-size, H = highest error correction (needed for the center avatar)
    qr.addData(text);
    qr.make();

    const count = qr.getModuleCount();
    const QZ = 3;                       // white quiet zone (3 modules) so the code scans on dark pages too
    const cell = size / (count + QZ * 2);

    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#000000";
    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count; col++) {
        if (qr.isDark(row, col)) {
          ctx.fillRect((col + QZ) * cell, (row + QZ) * cell, cell + 0.5, cell + 0.5);
        }
      }
    }

    if (opts.noLogo) return;
    // Centre logo: a round avatar on a white disc. Drawn at once if the image is already loaded, otherwise when it arrives.
    const paint = () => {
      const logoSize = size * AVATAR_RATIO, cx = size / 2, r = logoSize / 2, pad = logoSize * 0.1;
      ctx.save(); ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(cx, cx, r + pad, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx, cx, r, 0, Math.PI * 2); ctx.clip();
      ctx.drawImage(LOGO, cx - r, cx - r, logoSize, logoSize); ctx.restore();
    };
    if (LOGO.complete && LOGO.naturalWidth) paint(); else LOGO.addEventListener("load", paint, { once: true });
  }

  function renderAll(selector = "[data-qr]") {
    document.querySelectorAll(selector).forEach((canvas) => {
      const raw = canvas.getAttribute("data-qr");
      const text = raw === "self" ? window.location.href.split("#")[0] : raw;
      const size = parseInt(canvas.getAttribute("data-qr-size") || "120", 10);
      if (!text) return;
      if (canvas.hasAttribute("data-qr-mini")) mini(canvas, text, size); else drawQR(canvas, text, size);
    });
  }

  // Small QR codes: drawn sharp (large backing canvas) but shown tiny; tap/click opens a bigger one to scan.
  function zoom(text) {
    const old = document.getElementById("eo-qr-zoom"); if (old) old.remove();
    const o = document.createElement("div"); o.id = "eo-qr-zoom"; o.setAttribute("role", "dialog"); o.setAttribute("aria-label", "QR code");
    o.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.6);display:grid;place-items:center;padding:1rem;";
    const card = document.createElement("div");
    card.style.cssText = "background:#fff;color:#111;border-radius:8px;padding:12px 12px 8px;text-align:center;max-width:260px;font:12px/1.4 system-ui,sans-serif;";
    const c = document.createElement("canvas"); c.style.cssText = "width:220px;height:220px;display:block;";
    drawQR(c, text, 440);
    const t = document.createElement("div"); t.textContent = "Scan with your phone camera · tap to close"; t.style.cssText = "margin-top:6px;color:#444;";
    card.append(c, t); o.appendChild(card);
    const close = () => { o.remove(); document.removeEventListener("keydown", esc); };
    const esc = (e) => { if (e.key === "Escape") close(); };
    o.onclick = close; document.addEventListener("keydown", esc); document.body.appendChild(o);
  }
  function mini(canvas, text, cssSize) {
    drawQR(canvas, text, 240);
    canvas.style.width = canvas.style.height = (cssSize || 48) + "px";
    canvas.style.cursor = "zoom-in"; canvas.setAttribute("role", "button"); canvas.setAttribute("tabindex", "0");
    canvas.setAttribute("title", "Tap to enlarge"); canvas.setAttribute("aria-label", "QR code - tap to enlarge");
    canvas.onclick = () => zoom(text);
    canvas.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); zoom(text); } };
  }

  window.EO_QR = { renderAll, drawQR, mini, zoom };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => renderAll());
  } else {
    renderAll();
  }
})();
