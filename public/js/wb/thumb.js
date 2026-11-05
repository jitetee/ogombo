// Thumbnail maker: 1920x1080 YouTube thumbnail from a narrator pose + big marker text, exported as JPEG.
(async () => {
  await A.guard("whiteboard");
  const W = EO_WB, S = EO_WBSTORE, C = EO_WBC, $ = (s, r) => (r || document).querySelector(s);
  $("#nav").appendChild(C.subnav("thumb")); const app = $("#app");
  const poses = ((await fetch("/assets/narrators/index.json").then((r) => r.json()).catch(() => ({ poses: [] }))).poses || []).map((p) => p.n);
  const photos = ["", "/assets/theatre-instruments.jpg", "/assets/theatre-lights.jpg", "/assets/theatre-portrait.jpg"]; window.__thumb = { st: null, draw: null };
  const THEMES = { red: ["#fff7ef", "#d7263d", "#1b1b1b"], teal: ["#0f5257", "#ffd23f", "#ffffff"], navy: ["#12263f", "#ffb703", "#ffffff"], paper: ["#f3efe4", "#1b6ec2", "#1b1b1b"], dark: ["#101418", "#35d07f", "#ffffff"] };
  const st = { title: "SURGICAL INSTRUMENTS", sub: "NAMES AND USES", tag: "", pose: poses.includes("point-right-grin") ? "point-right-grin" : poses[0], side: "left", theme: "red", photo: "", logo: true, handle: "@ezraogombo", size: 1, style: "clean", emoji: "⚠️", arrow: true, fx: 62, fy: 55, line1: "#ffe14d" };
  const projects = await S.list().catch(() => []);
  app.innerHTML = `<div class="wb-two" style="align-items:start;gap:1rem"><div id="ctl"></div><div><div class="wb-stagebox"><canvas id="tc" width="1920" height="1080"></canvas></div><div class="wb-row"><button class="btn sm primary" id="dl" type="button">Download JPEG</button><span class="wb-note" id="sz"></span></div><div id="msg"></div></div></div>`;
  const ctl = $("#ctl"), cv = $("#tc"), ctx = cv.getContext("2d");
  const field = (label, el) => { const d = document.createElement("div"); d.className = "field"; d.innerHTML = `<label>${label}</label>`; d.append(el); ctl.append(d); return el; };
  const inp = (k, ph) => { const i = document.createElement("input"); i.value = st[k]; i.placeholder = ph || ""; i.oninput = () => { st[k] = i.value; draw(); }; return i; };
  const sel = (k, opts) => { const s = document.createElement("select"); opts.forEach(([v, l]) => { const o = document.createElement("option"); o.value = v; o.textContent = l; s.append(o); }); s.value = st[k]; s.onchange = () => { st[k] = s.value; draw(); }; return s; };
  if (projects.length) { const ps = document.createElement("select"); ps.innerHTML = '<option value="">Start from a project (optional)</option>' + projects.map((p) => `<option value="${C.esc(p.id)}">${C.esc(p.name || "Untitled")}</option>`).join(""); ps.onchange = () => { const p = projects.find((x) => x.id === ps.value); if (p) { st.title = String(p.name || "").toUpperCase(); tin.value = st.title; draw(); } }; field("Project", ps); }
  field("Style", sel("style", [["clean", "Clean (calm)"], ["hook", "Click hook (bold, high contrast)"]]));
  const tin = field("Big title (use a new line for 2 lines)", inp("title")), _ = field("Smaller line", inp("sub")), __ = field("Corner tag (for example EP 3)", inp("tag"));
  field("Narrator pose", sel("pose", poses.map((p) => [p, p.replace(/-/g, " ")]))); field("Narrator side", sel("side", [["left", "Left"], ["right", "Right"], ["none", "No narrator"]]));
  field("Colours", sel("theme", Object.keys(THEMES).map((k) => [k, k]))); field("Photo behind", sel("photo", photos.map((p) => [p, p ? p.split("/").pop().replace(/\..+/, "").replace("theatre-", "") : "None"])));
  field("Emoji badge (hook style)", inp("emoji")); const rg = (k, lab) => { const r = document.createElement("input"); r.type = "range"; r.min = 5; r.max = 95; r.value = st[k]; r.oninput = () => { st[k] = +r.value; draw(); }; field(lab, r); }; rg("fx", "Red circle and arrow: across"); rg("fy", "Red circle and arrow: down");
  { const c = document.createElement("label"); c.className = "wb-note"; c.innerHTML = '<input type="checkbox" checked> Show red arrow and circle (hook style)'; c.querySelector("input").onchange = (e) => { st.arrow = e.target.checked; draw(); }; ctl.append(c); }
  const sz = field("Text size", (() => { const r = document.createElement("input"); r.type = "range"; r.min = 0.6; r.max = 1.4; r.step = 0.05; r.value = 1; r.oninput = () => { st.size = +r.value; draw(); }; return r; })());
  const imgs = {}; const load = (src) => imgs[src] || (imgs[src] = new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; }));
  const pr = C.progress($("#msg"), "Loading fonts and pictures"); try { await W.loadFonts(); pr.done("Ready"); } catch (e) { pr.fail(e); }
  let busy = false, again = false;
  async function drawHook() {
    const w = 1920, h = 1080, fam = "WBMarker, 'Permanent Marker', cursive"; ctx.clearRect(0, 0, w, h); ctx.fillStyle = "#111"; ctx.fillRect(0, 0, w, h);
    if (st.photo) { const im = await load(st.photo); if (im) { const k = Math.max(w / im.width, h / im.height); ctx.save(); ctx.filter = "contrast(1.25) saturate(1.35) brightness(0.95)"; ctx.drawImage(im, (w - im.width * k) / 2, (h - im.height * k) / 2, im.width * k, im.height * k); ctx.restore(); } }
    else { const g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, "#d7263d"); g.addColorStop(1, "#4a0d17"); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); }
    const v = ctx.createLinearGradient(0, 0, w * 0.75, 0); v.addColorStop(0, "#000000b0"); v.addColorStop(0.5, "#00000050"); v.addColorStop(1, "#00000000"); ctx.fillStyle = v; ctx.fillRect(0, 0, w, h);
    const rv = ctx.createRadialGradient(w / 2, h / 2, h * 0.45, w / 2, h / 2, h * 0.95); rv.addColorStop(0, "#0000"); rv.addColorStop(1, "#000000aa"); ctx.fillStyle = rv; ctx.fillRect(0, 0, w, h);
    const none = st.side === "none", left = st.side === "left"; let tx = left ? 820 : 70, tw = none ? w - 140 : 1010;
    if (!none) { const im = await load("/assets/narrators/" + st.pose + ".png"); if (im) { const r0 = im.width / im.height, hh = h * 1.0, ww = Math.min(hh * r0, w * 0.46), h2 = ww / r0, x = left ? 0 : w - ww; ctx.save(); ctx.shadowColor = "#fff"; ctx.shadowBlur = 26; for (let i = 0; i < 2; i++) ctx.drawImage(im, x, h - h2 + 14, ww, h2); ctx.restore(); ctx.drawImage(im, x, h - h2 + 14, ww, h2); if (left) tw = w - tx - 60; else tw = x - tx - 30; } }
    const L = String(st.title).toUpperCase().split(/\n|\\n/).map((l) => l.trim()).filter(Boolean); let size = 230 * st.size; const fit = () => Math.max(...L.map((l) => { ctx.font = size + "px " + fam; return ctx.measureText(l).width; }));
    while (size > 70 && fit() > tw) size -= 4; const total = L.length * size * 1.05, y0 = Math.max(size * 0.95, h - total - (st.sub ? 150 : 40) - 40 + size * 0.85);
    L.forEach((l, i) => { const y = y0 + i * size * 1.05; ctx.font = size + "px " + fam; ctx.textAlign = "left"; ctx.lineJoin = "round"; ctx.save(); ctx.shadowColor = "#000"; ctx.shadowBlur = 24; ctx.shadowOffsetY = 10; ctx.lineWidth = size * 0.2; ctx.strokeStyle = "#000"; ctx.strokeText(l, tx, y); ctx.restore(); ctx.fillStyle = i % 2 ? "#ffffff" : st.line1; ctx.fillText(l, tx, y); });
    if (st.sub) { const ss = Math.min(size * 0.5, 96), y = y0 + (L.length - 1) * size * 1.05 + ss * 1.35; ctx.font = ss + "px " + fam; const sw = Math.min(ctx.measureText(String(st.sub).toUpperCase()).width + 60, tw + 40); ctx.fillStyle = "#e11d2e"; ctx.save(); ctx.translate(tx - 10, y - ss * 0.95); ctx.rotate(-0.02); ctx.fillRect(0, 0, sw, ss * 1.3); ctx.restore(); ctx.fillStyle = "#fff"; ctx.textBaseline = "alphabetic"; ctx.fillText(String(st.sub).toUpperCase(), tx + 20, y + ss * 0.1, sw - 40); }
    if (st.arrow) { const cx = w * st.fx / 100, cy = h * st.fy / 100; ctx.save(); ctx.strokeStyle = "#ff2d3d"; ctx.lineWidth = 16; ctx.lineCap = "round"; ctx.shadowColor = "#000"; ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.ellipse(cx, cy, 190, 130, -0.15, 0.2, Math.PI * 2 + 0.25); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - 330, cy + 250); ctx.quadraticCurveTo(cx - 330, cy + 100, cx - 150, cy + 100); ctx.stroke(); ctx.beginPath(); ctx.moveTo(cx - 150, cy + 100); ctx.lineTo(cx - 215, cy + 50); ctx.moveTo(cx - 150, cy + 100); ctx.lineTo(cx - 215, cy + 160); ctx.stroke(); ctx.restore(); }
    if (st.emoji) { const ex = w - 180, ey = 180; ctx.save(); ctx.translate(ex, ey); ctx.rotate(0.14); ctx.fillStyle = "#ffe14d"; ctx.strokeStyle = "#000"; ctx.lineWidth = 12; ctx.beginPath(); ctx.arc(0, 0, 118, 0, 7); ctx.fill(); ctx.stroke(); ctx.font = "150px 'Noto Color Emoji','Apple Color Emoji','Segoe UI Emoji',sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(st.emoji, 0, 8); ctx.restore(); }
    if (st.tag) { ctx.save(); ctx.translate(46, 44); ctx.rotate(-0.05); ctx.font = "78px " + fam; const t2 = st.tag.toUpperCase(), tw2 = ctx.measureText(t2).width + 56; ctx.fillStyle = "#ffe14d"; ctx.strokeStyle = "#000"; ctx.lineWidth = 8; ctx.beginPath(); ctx.roundRect(0, 0, tw2, 112, 16); ctx.fill(); ctx.stroke(); ctx.fillStyle = "#111"; ctx.textBaseline = "middle"; ctx.textAlign = "left"; ctx.fillText(t2, 28, 60); ctx.restore(); }
    if (st.logo) { const li = await load("/assets/icons/icon-192.png"); if (li) { const r = 54, cx = w - 90, cy = h - 90; ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.clip(); ctx.drawImage(li, cx - r, cy - r, r * 2, r * 2); ctx.restore(); ctx.lineWidth = 6; ctx.strokeStyle = "#fff"; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.stroke(); } }
    $("#sz").textContent = "1920 x 1080, YouTube-ready";
  }

  async function draw() {
    if (busy) { again = true; return; } busy = true;
    try {
      if (st.style === "hook") { await drawHook(); return; }
      const [bg, ac, ink] = THEMES[st.theme], w = 1920, h = 1080; ctx.clearRect(0, 0, w, h); ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
      if (st.photo) { const im = await load(st.photo); if (im) { const k = Math.max(w / im.width, h / im.height); ctx.save(); ctx.globalAlpha = 0.35; ctx.drawImage(im, (w - im.width * k) / 2, (h - im.height * k) / 2, im.width * k, im.height * k); ctx.restore(); } }
      const g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, "#ffffff10"); g.addColorStop(1, "#00000030"); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = ac; ctx.globalAlpha = 0.9; ctx.fillRect(0, h - 26, w, 26); ctx.globalAlpha = 1;
      const left = st.side === "left", none = st.side === "none"; let tx = none ? 100 : left ? 860 : 90, tw = none ? w - 200 : 960;
      if (!none) { const im = await load("/assets/narrators/" + st.pose + ".png"); if (im) { const r0 = im.width / im.height, ww = Math.min(h * 1.02 * r0, w * 0.42), hh = ww / r0, x = left ? 20 : w - ww - 20; ctx.save(); ctx.shadowColor = "#0006"; ctx.shadowBlur = 30; ctx.drawImage(im, x, h - hh + 10, ww, hh); ctx.restore(); if (left) { tx = ww - 10; tw = w - tx - 70; } else { tx = 80; tw = w - ww - 160; } } }
      const lines = String(st.title).toUpperCase().split(/\n|\\n/).flatMap((l) => l.trim() ? [l.trim()] : []);
      const fam = "WBMarker, 'Permanent Marker', cursive"; let size = 190 * st.size; const lw = (s) => Math.max(...lines.map((l) => { ctx.font = s + "px " + fam; return ctx.measureText(l).width; }), 1);
      // wrap words into lines of at most 3 and shrink to fit
      let L = lines.length ? lines : [""]; if (L.length === 1 && L[0].split(" ").length >= 2) { const ws = L[0].split(" "), mid = Math.ceil(ws.length / 2); L = [ws.slice(0, mid).join(" "), ws.slice(mid).join(" ")]; }
      while (size > 60 && Math.max(...L.map((l) => { ctx.font = size + "px " + fam; return ctx.measureText(l).width; })) > tw) size -= 4;
      const total = L.length * size * 1.08 + (st.sub ? size * 0.8 : 0), y0 = (h - total) / 2 + size * 0.85 - 30;
      ctx.textBaseline = "alphabetic"; ctx.textAlign = "left"; L.forEach((l, i) => { ctx.font = size + "px " + fam; ctx.lineWidth = size * 0.14; ctx.strokeStyle = bg; ctx.lineJoin = "round"; ctx.strokeText(l, tx, y0 + i * size * 1.08); ctx.fillStyle = i % 2 ? ink : ac; ctx.fillText(l, tx, y0 + i * size * 1.08); });
      if (st.sub) { const ss = size * 0.42; ctx.font = ss + "px " + fam; ctx.fillStyle = ink; ctx.fillText(String(st.sub).toUpperCase(), tx, y0 + (L.length - 1) * size * 1.08 + size * 0.8, tw); ctx.fillStyle = ac; ctx.fillRect(tx, y0 + (L.length - 1) * size * 1.08 + size * 0.2, Math.min(tw, 520), 12); }
      if (st.tag) { ctx.font = "70px " + fam; const tw2 = ctx.measureText(st.tag.toUpperCase()).width + 60, x = left || none ? w - tw2 - 40 : 40; ctx.fillStyle = ac; ctx.beginPath(); ctx.roundRect(x, 40, tw2, 110, 18); ctx.fill(); ctx.fillStyle = bg; ctx.textBaseline = "middle"; ctx.fillText(st.tag.toUpperCase(), x + 30, 97); }
      if (st.logo) { const li = await load("/assets/icons/icon-192.png"); if (li) { const r = 54, cx = w - 90, cy = h - 90; ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.clip(); ctx.drawImage(li, cx - r, cy - r, r * 2, r * 2); ctx.restore(); ctx.lineWidth = 6; ctx.strokeStyle = "#fff"; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.stroke(); } }
      $("#sz").textContent = "1920 x 1080, YouTube-ready";
    } catch (e) { C.banner("Thumbnail error: " + (e.message || e)); } finally { busy = false; if (again) { again = false; draw(); } }
  }
  $("#dl").onclick = async () => { await draw(); let q = 0.92, blob; for (; q > 0.5; q -= 0.08) { blob = await new Promise((r) => cv.toBlob(r, "image/jpeg", q)); if (blob.size < 1.9e6) break; } const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = (st.title || "thumbnail").toLowerCase().replace(/[^\w]+/g, "-").replace(/^-|-$/g, "") + ".jpg"; a.click(); $("#sz").textContent = "Saved " + (blob.size / 1024).toFixed(0) + " KB (YouTube limit is 2 MB)"; };
  window.__thumb = { st, draw }; draw();
})();
