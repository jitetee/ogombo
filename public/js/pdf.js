// ============================================================
// "Download as PDF" for any post / content page / material page / CV.
//
// How it works (no third-party PDF library):
//   1. builds a clean light-theme copy of the page (title, hero image, body
//      text + images, small QR code, link) - ads, buttons, comments and every
//      other site chrome are stripped from that copy;
//   2. renders the copy to ONE tall canvas with html2canvas (vendored in
//      /js/vendor, loaded only when someone clicks the button);
//   3. measures where every text line / image / table row sits and chooses page
//      breaks only in the white gaps between them, so a line, an image or a
//      table row is never sliced across two pages; headings are kept with the
//      text that follows them;
//   4. writes the pages into a PDF by hand (JPEG per page, "Page n of N" footer).
// If anything fails it falls back to the browser's own print dialog (Save as PDF).
// ============================================================
(function () {
  const LIB = "/js/vendor/html2canvas.min.js";
  const DOC_W = 760;                         // css px width of the printable copy
  const PT = { W: 595.28, H: 841.89, L: 22.68, R: 22.68, T: 28.35, B: 42.5 };   // A4 in points, margins
  const SCALE_PT = (PT.W - PT.L - PT.R) / DOC_W;                                  // points per css px
  const PAGE_H = Math.floor((PT.H - PT.T - PT.B) / SCALE_PT) - 6;                 // css px of content per page
  let libPromise = null;
  function loadLib() {
    if (window.html2canvas) return Promise.resolve();
    if (!libPromise) {
      libPromise = new Promise((res, rej) => {
        const s = document.createElement("script");
        s.src = LIB; s.onload = res; s.onerror = () => { libPromise = null; rej(new Error("pdf lib")); };
        document.head.appendChild(s);
      });
    }
    return libPromise;
  }

  function qrDataUrl(url, size) {
    try {
      const c = document.createElement("canvas");
      window.EO_QR.drawQR(c, url, size);
      return c.toDataURL("image/png");
    } catch { return ""; }
  }

  // Images must load from the host the page is actually served from.
  function localize(src) {
    if (!src) return "";
    try {
      const u = new URL(src, location.origin);
      const site = window.EO_SITE && window.EO_SITE.settings && window.EO_SITE.settings.site_url;
      if (site && u.origin === new URL(site).origin) return location.origin + u.pathname + u.search;
      return u.href;
    } catch { return src; }
  }

  // Remove everything that must never appear in a PDF: ads (any element whose class starts with "ad-",
  // the header/footer ad bars, ad slots, anything labelled Sponsored), engagement widgets, scripts, buttons...
  const DROP = "script,style,noscript,template,iframe,object,embed,video,audio,canvas,button,input,select,textarea,form,nav,.titlebar,.kicker,a.btn,.btn,.engage,.eng-qr,[data-ad-slot],[data-ad],[data-pl],[aria-label='Sponsored'],[hidden]";
  function isAdNode(n) {
    if (!n.classList) return false;
    for (const c of n.classList) if (c === "hdr-ad" || c.startsWith("ad-")) return true;
    return false;
  }
  function clean(root) {
    root.querySelectorAll(DROP).forEach((n) => n.remove());
    [root, ...root.querySelectorAll("*")].forEach((n) => { if (n !== root && isAdNode(n)) n.remove(); });
    root.querySelectorAll("[style]").forEach((n) => { if (/display\s*:\s*none/i.test(n.getAttribute("style") || "")) n.remove(); });
    root.querySelectorAll("a").forEach((a) => a.removeAttribute("target"));
    root.querySelectorAll("img").forEach((im) => {
      im.src = localize(im.getAttribute("src") || im.getAttribute("data-src"));
      im.setAttribute("crossorigin", "anonymous"); im.removeAttribute("loading"); im.removeAttribute("srcset"); im.removeAttribute("sizes");
      im.removeAttribute("width"); im.removeAttribute("height");
    });
    return root;
  }

  function buildDoc({ title, kicker, meta, image, contentEl, url }) {
    const E = window.EO_UTIL.esc;
    image = localize(image);
    const site = (window.EO_SITE && window.EO_SITE.settings && window.EO_SITE.settings.site_name) || document.title;
    const doc = document.createElement("div");
    doc.className = "pdf-doc";
    doc.style.cssText = `width:${DOC_W}px;background:#fff;color:#111;font:15px/1.6 Georgia,'Times New Roman',serif;padding:0 14px 6px;box-sizing:border-box;overflow-wrap:anywhere;`;
    const body = clean(contentEl ? contentEl.cloneNode(true) : document.createElement("div"));
    const qr = qrDataUrl(url, 240);
    doc.innerHTML = `
      <style>
        .pdf-doc *{box-sizing:border-box;color:#111 !important;background:transparent !important;border-color:#bbb !important;text-shadow:none !important;box-shadow:none !important;animation:none !important;transition:none !important;opacity:1 !important;filter:none !important}
        .pdf-doc h1{font:700 26px/1.25 Helvetica,Arial,sans-serif;margin:6px 0 4px}
        .pdf-doc h2{font:700 19px/1.3 Helvetica,Arial,sans-serif;margin:18px 0 6px}
        .pdf-doc h3,.pdf-doc h4{font:700 16px/1.3 Helvetica,Arial,sans-serif;margin:14px 0 4px}
        .pdf-doc p,.pdf-doc li{margin:0 0 9px}
        .pdf-doc ul,.pdf-doc ol{margin:0 0 10px;padding-left:24px}
        .pdf-doc img{max-width:100%;max-height:760px;width:auto;height:auto;object-fit:contain;display:block;margin:8px auto}
        .pdf-doc figure{margin:10px 0}.pdf-doc figcaption{font:italic 12px/1.4 Helvetica,Arial,sans-serif;text-align:center;color:#555 !important}
        .pdf-doc table{border-collapse:collapse;width:100%;table-layout:auto}.pdf-doc td,.pdf-doc th{border:1px solid #bbb;padding:4px 6px;vertical-align:top}
        .pdf-doc blockquote{margin:10px 0;padding:2px 12px;border-left:3px solid #999}
        .pdf-doc pre,.pdf-doc code{font:13px/1.45 'Courier New',monospace;white-space:pre-wrap;word-break:break-word}
        .pdf-doc a{text-decoration:underline}
        .pdf-doc .row-links,.pdf-doc [class*="links"],.pdf-doc .social{display:flex;flex-wrap:wrap;gap:6px 14px}
        .pdf-doc .k{font:600 11px Helvetica,Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#555 !important}
        .pdf-doc .foot{margin-top:22px;padding-top:12px;border-top:1px solid #bbb;display:flex;gap:14px;align-items:center;font:12px/1.5 Helvetica,Arial,sans-serif}
        .pdf-doc .foot img{width:52px;height:52px;margin:0;max-height:none}
      </style>
      <div class="k">${E(site)}${kicker ? " · " + E(kicker) : ""}</div>
      <h1>${E(title)}</h1>
      ${meta ? `<div class="k" style="margin-bottom:10px">${E(meta)}</div>` : ""}
      ${image ? `<img class="hero" crossorigin="anonymous" src="${E(image)}" alt="">` : ""}
      <div class="pdf-body"></div>
      <div class="foot" data-unit>
        ${qr ? `<img src="${qr}" alt="QR code">` : ""}
        <div><strong>Read online / share:</strong><br>${E(url)}<br>Downloaded ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</div>
      </div>`;
    doc.querySelector(".pdf-body").appendChild(body);
    return doc;
  }

  // ---- where may a page break go? --------------------------------------------------------------
  // Collect the vertical extent of every text line and every image / table row / figure, merge the
  // overlapping ones into "bands", and only ever cut in the gaps between bands.
  function measureBands(doc) {
    const base = doc.getBoundingClientRect().top, rects = [];
    const push = (r) => { if (r.height > 0.5 && r.width > 0.5) rects.push([r.top - base, r.bottom - base]); };
    const walker = document.createTreeWalker(doc, NodeFilter.SHOW_TEXT);
    const rg = document.createRange();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!/\S/.test(n.nodeValue) || (n.parentNode && /^(STYLE|SCRIPT)$/.test(n.parentNode.nodeName))) continue;
      rg.selectNodeContents(n);
      for (const r of rg.getClientRects()) push(r);
    }
    doc.querySelectorAll("img,svg,hr,tr,figure,blockquote,.foot,pre").forEach((el) => {
      if (el.tagName === "PRE" && el.getBoundingClientRect().height > PAGE_H * 0.6) return;   // very long code may split between lines
      if (el.tagName === "BLOCKQUOTE" && el.getBoundingClientRect().height > PAGE_H * 0.6) return;
      push(el.getBoundingClientRect());
    });
    rects.sort((a, b) => a[0] - b[0]);
    const bands = [];
    for (const [t, b] of rects) {
      const last = bands[bands.length - 1];
      if (last && t < last.b - 1.5) last.b = Math.max(last.b, b); else bands.push({ t, b, keep: false });
    }
    const heads = [...doc.querySelectorAll("h1,h2,h3,h4,h5,h6,.k")].map((h) => { const r = h.getBoundingClientRect(); return [r.top - base, r.bottom - base]; });
    bands.forEach((bd) => { if (heads.some(([t, b]) => t < bd.b - 0.5 && b > bd.t + 0.5)) bd.keep = true; });   // keep headings with what follows
    return bands;
  }

  function chooseCuts(bands, total) {
    const cuts = [0];
    let s = 0, guard = 0, hard = 0;
    while (total - s > PAGE_H && guard++ < 500) {
      const limit = s + PAGE_H;
      let best = -1;
      for (let i = 0; i < bands.length - 1; i++) {
        const gapTop = bands[i].b, gapBot = bands[i + 1].t;
        if (gapTop <= s + 1) continue;
        const y = Math.round((gapTop + Math.max(gapTop, gapBot)) / 2 * 10) / 10;
        if (y > limit) break;
        if (bands[i].keep) continue;
        best = y;
      }
      if (best < 0 || best - s < PAGE_H * 0.15) { best = limit; hard++; }     // one thing taller than a page: hard cut
      cuts.push(best); s = best;
    }
    cuts.push(total);
    window.EO_PDF._hard = hard;
    return cuts;
  }

  // ---- tiny PDF writer: one JPEG per page + footer text -----------------------------------------
  const ascii = (t) => String(t || "").replace(/[^\x20-\x7e]/g, "?").replace(/([()\\])/g, "\\$1");
  function writePdf(pages, title, footerLeft) {
    const enc = new TextEncoder(), chunks = [], offs = []; let len = 0;
    const add = (x) => { const b = typeof x === "string" ? enc.encode(x) : x; chunks.push(b); len += b.length; };
    const obj = (n, body) => { offs[n] = len; add(`${n} 0 obj\n${body}\nendobj\n`); };
    const N = pages.length, first = 4;                       // objects: 1 catalog, 2 pages, 3 font, then 3 per page
    add("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n");
    obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
    obj(2, `<< /Type /Pages /Kids [${pages.map((_, i) => `${first + i * 3} 0 R`).join(" ")}] /Count ${N} >>`);
    obj(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    pages.forEach((p, i) => {
      const pg = first + i * 3, ct = pg + 1, im = pg + 2;
      const w = PT.W - PT.L - PT.R, h = p.hCss * SCALE_PT, y = PT.H - PT.T - h;
      obj(pg, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PT.W} ${PT.H}] /Resources << /XObject << /Im0 ${im} 0 R >> /Font << /F1 3 0 R >> >> /Contents ${ct} 0 R >>`);
      const c = `q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${PT.L} ${y.toFixed(2)} cm /Im0 Do Q\nBT /F1 8 Tf 0.45 g ${PT.L} 22 Td (${ascii(footerLeft).slice(0, 90)}) Tj ET\nBT /F1 8 Tf 0.45 g ${(PT.W - PT.R - 60).toFixed(2)} 22 Td (Page ${i + 1} of ${N}) Tj ET`;
      obj(ct, `<< /Length ${c.length} >>\nstream\n${c}\nendstream`);
      offs[im] = len; add(`${im} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpg.length} >>\nstream\n`); add(p.jpg); add("\nendstream\nendobj\n");
    });
    const info = first + N * 3;
    obj(info, `<< /Title (${ascii(title).slice(0, 120)}) /Producer (ezra-ogombo site) >>`);
    const xref = len;
    let x = `xref\n0 ${info + 1}\n0000000000 65535 f \n`;
    for (let i = 1; i <= info; i++) x += String(offs[i]).padStart(10, "0") + " 00000 n \n";
    add(x + `trailer\n<< /Size ${info + 1} /Root 1 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF`);
    return new Blob(chunks, { type: "application/pdf" });
  }
  const toJpeg = (cv) => new Promise((res, rej) => cv.toBlob((b) => (b ? b.arrayBuffer().then((a) => res(new Uint8Array(a))) : rej(new Error("toBlob"))), "image/jpeg", 0.92));

  function isBlank(canvas) {
    try {
      const w = Math.min(canvas.width, 400), h = Math.min(canvas.height, 400);
      const sx = Math.max(0, Math.floor((canvas.width - w) / 2)), sy = Math.max(0, Math.floor((canvas.height - h) / 2));
      const d = canvas.getContext("2d").getImageData(sx, sy, w, h).data;
      let ink = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 20 && (d[i] < 235 || d[i + 1] < 235 || d[i + 2] < 235)) ink++;
      return ink < 40;
    } catch { return false; }
  }

  // Always-works fallback: the browser's own print dialog on the same clean copy.
  function printView(doc) {
    const f = document.createElement("iframe");
    f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
    f.srcdoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><base href="${location.origin}/"><title>${window.EO_UTIL.esc(document.title)}</title>
      <style>@page{size:A4;margin:12mm}body{margin:0;background:#fff}
      p,li,img,tr,figure,blockquote,pre,.foot{break-inside:avoid;page-break-inside:avoid}h1,h2,h3,h4{break-after:avoid;page-break-after:avoid}img{max-height:250mm}</style></head><body>${doc.outerHTML.replace(`width:${DOC_W}px`, "width:auto")}</body></html>`;
    f.onload = () => {
      const w = f.contentWindow;
      const imgs = [...w.document.images];
      Promise.race([Promise.all(imgs.map((im) => (im.complete ? 0 : new Promise((r) => { im.onload = im.onerror = r; })))), new Promise((r) => setTimeout(r, 5000))]).then(() => {
        try { w.focus(); w.print(); } catch { window.print(); }
        setTimeout(() => f.remove(), 60000);
      });
    };
    document.body.appendChild(f);
  }

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  async function download(opts) {
    const btn = opts.button;
    const old = btn ? btn.textContent : "";
    if (btn) { btn.disabled = true; btn.textContent = "Preparing PDF…"; }
    const doc = buildDoc(opts);
    const sy = window.scrollY, sx = window.scrollX;
    let ok = false, host = null;
    try {
      await loadLib();
      // The copy has to be in the page to be laid out and rendered. It is pinned top-left behind the page
      // (the page background hides it) and removed again straight afterwards.
      host = document.createElement("div");
      host.style.cssText = "position:absolute;left:0;top:0;width:" + DOC_W + "px;z-index:-9999;pointer-events:none;";
      host.setAttribute("aria-hidden", "true");
      host.appendChild(doc); document.body.appendChild(host);
      window.scrollTo(0, 0);
      const imgs = [...doc.querySelectorAll("img")];
      await Promise.race([Promise.all(imgs.map((im) => (im.complete ? 0 : new Promise((r) => { im.onload = im.onerror = r; })))), wait(8000)]);
      imgs.forEach((im) => { if (im.complete && !im.naturalWidth) im.remove(); });          // failed images: drop them, no broken icon
      if (document.fonts && document.fonts.ready) await Promise.race([document.fonts.ready, wait(1500)]);
      await wait(60);
      const total = Math.ceil(doc.getBoundingClientRect().height);
      const bands = measureBands(doc), cuts = chooseCuts(bands, total);
      const scale = Math.min(2, 30000 / total);
      const full = await Promise.race([
        window.html2canvas(doc, { scale, useCORS: true, backgroundColor: "#ffffff", logging: false, scrollX: 0, scrollY: 0, windowWidth: DOC_W + 40, x: 0, y: 0, width: DOC_W, height: total }),
        wait(40000).then(() => { throw new Error("timeout"); }),
      ]);
      if (!full || isBlank(full)) throw new Error("blank render");
      const pages = [];
      for (let i = 0; i < cuts.length - 1; i++) {
        const y0 = Math.round(cuts[i] * scale), y1 = Math.min(full.height, Math.round(cuts[i + 1] * scale));
        if (y1 - y0 < 2) continue;
        const pc = document.createElement("canvas"); pc.width = full.width; pc.height = y1 - y0;
        const g = pc.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, pc.width, pc.height);
        g.drawImage(full, 0, y0, full.width, y1 - y0, 0, 0, full.width, y1 - y0);
        pages.push({ jpg: await toJpeg(pc), w: pc.width, h: pc.height, hCss: (y1 - y0) / scale });
      }
      window.EO_PDF._last = { cuts, bands, hard: window.EO_PDF._hard, total, pageH: PAGE_H, pages: pages.length, text: doc.innerText };
      const site = (window.EO_SITE && window.EO_SITE.settings && window.EO_SITE.settings.site_name) || "";
      const blob = writePdf(pages, opts.title, (site ? site + " | " : "") + String(opts.url || "").replace(/^https?:\/\//, ""));
      const name = (opts.filename || window.EO_UTIL.slugify(opts.title) || "page") + ".pdf";
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
      ok = true;
      if (opts.onDone) opts.onDone();
    } catch (e) {
      window.EO_PDF._err = String(e && e.message || e);
      if (doc.parentNode) doc.parentNode.removeChild(doc);
      printView(doc);                                // library blocked / offline / render failed: print dialog instead
    } finally {
      if (host && host.parentNode) host.remove();
      window.scrollTo(sx, sy);
      if (btn) { btn.disabled = false; btn.textContent = old; }
    }
    return ok;
  }

  window.EO_PDF = { download, _measure: { measureBands, chooseCuts }, PAGE_H };
})();
