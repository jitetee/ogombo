// Whiteboard editor page: board canvas, asset panel, inspector, scene strip and per-item timing. Voices come from the cache made on the export page.
(async () => {

  await A.guard("whiteboard");
  const W = EO_WB, T = EO_TTS, S = EO_WBSTORE, C = EO_WBC, IMP = EO_WB_IMPORT, E = A.esc, $ = (s, r) => (r || document).querySelector(s);
  $("main .wrap").insertBefore(C.subnav("edit"), $("#top"));
  if (!C.id) { location.href = "/admin/whiteboard"; return; }
  const rec = await S.get(C.id); if (!rec) { alert("That project was not found. Going back to the list."); location.href = "/admin/whiteboard"; return; }
  let P = Object.assign(W.newProject(), rec.data), cur = 0, sel = null, aud = [], durs = [], playing = null, icons = {}, dragging = null, mixBuf = null, mixSig = "";
  if (!P.scenes.length) P.scenes.push(W.newScene());
  P.voice = P.voice || { name: "piper:mine", languageCode: "en-US", rate: 1, pitch: 0 }; P.music = P.music || { src: "/assets/music/calm-focus.mp3", vol: 0.12 };
  const cv = $("#cv"), ov = $("#ov"), ctx = cv.getContext("2d"), octx = ov.getContext("2d");
  const persist = C.dbn(async () => { try { const r = await S.get(C.id) || { id: C.id }; r.data = P; r.thumb = C.thumb(cv, 320); await S.put(r); } catch (e) { console.warn("save failed", e); } }, 700);
  const save = () => { mixSig = ""; persist(); };
  const sc = () => P.scenes[cur], fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
  const item = () => sc().items.find((i) => i.id === sel);
  const LOW = Math.min(innerWidth, screen.width || 999) < 700;
  const imgs = {}; let assets = { icons: {}, imgs, aud: durs };
  async function reload() {
    const sb = document.getElementById("stagebox"), lo = document.createElement("div"); lo.className = "wb-load"; sb.appendChild(lo); const pr = EO_WBC.progress(lo, "Loading your assets");
    try { const a = await W.loadAssets(P, { imgs, onprog: (f, m) => { pr.set(f, m); } }); Object.assign(assets, a, { aud: durs, imgs }); icons = assets.icons; lo.remove(); }
    catch (e) { pr.fail(e); lo.style.cursor = "pointer"; lo.title = "Click to hide"; lo.onclick = () => lo.remove(); throw e; }
  }
  const ensureImg = async (it) => { const src = it.type === "narrator" ? "/assets/narrators/" + (it.pose || "neutral") + ".png" : it.src; if (src && !imgs[src]) imgs[src] = await W.loadImg(src); };
  function fitStage() { const sb = document.getElementById("stagebox"), z = W.size(P); if (!sb) return; if (matchMedia("(max-width:1100px)").matches) { sb.style.maxWidth = "min(100%," + (56 * z.w / z.h).toFixed(1) + "vh)"; sb.style.margin = "0 auto"; } else { sb.style.maxWidth = ""; sb.style.margin = ""; } }
  function sizeCanvas() { fitStage(); const z = W.size(P), px = LOW ? [z.px[0] * 0.6 | 0, z.px[1] * 0.6 | 0] : z.px; if (cv.width !== px[0]) { cv.width = px[0]; cv.height = px[1]; } ov.width = cv.width; ov.height = cv.height; ov.style.width = "100%"; ov.style.height = "auto"; }
  const recomputeDurs = () => { durs.length = 0; EO_WBA.durs(P, aud).forEach((d) => durs.push(d)); assets.aud = durs; };
  const TL = () => { recomputeDurs(); return W.timeline(P, durs); };

  // ---------- drawing ----------
  function editT(tl) { const s = tl.scenes[Math.min(cur, tl.scenes.length - 1)]; return s.t0 + s.lead + s.lay.end + 0.02; }
  function frame(t) {
    sizeCanvas(); const tl = TL(); assets.tl = tl; assets.hand = playing ? true : false;
    W.draw(ctx, P, playing ? t : editT(tl), assets);
    octx.clearRect(0, 0, ov.width, ov.height);
    if (!playing) overlay(tl);
    const tot = tl.total; $("#tm").textContent = (playing ? fmt(t) : "edit") + " / " + fmt(tot);
  }
  function overlay() {
    const z = W.size(P), k = ov.width / z.w; octx.save(); octx.scale(k, k); const it = item();
    if (it) { const b = W.build(it, P, assets, ctx).bbox; octx.strokeStyle = "#28e8cd"; octx.lineWidth = 3 / k * 1.2; octx.setLineDash([8, 6]); octx.strokeRect(b[0] - 6, b[1] - 6, b[2] + 12, b[3] + 12); octx.setLineDash([]); octx.fillStyle = "#28e8cd"; octx.fillRect(b[0] + b[2] - 6, b[1] + b[3] - 6, 20, 20); }
    octx.restore();
  }
  const redraw = () => frame(0);

  // ---------- pointer interaction ----------
  const toBoard = (e) => { const r = ov.getBoundingClientRect(), z = W.size(P); return [((e.clientX - r.left) / r.width) * z.w, ((e.clientY - r.top) / r.height) * z.h]; };
  function hit(x, y) { const L = sc().items; for (let i = L.length - 1; i >= 0; i--) { const b = W.build(L[i], P, assets, ctx).bbox; if (x >= b[0] - 12 && x <= b[0] + b[2] + 12 && y >= b[1] - 12 && y <= b[1] + b[3] + 12) return L[i]; } return null; }
  ov.addEventListener("pointerdown", (e) => {
    if (playing) return; const [x, y] = toBoard(e), cur0 = item(); ov.setPointerCapture(e.pointerId);
    if (cur0) { const b = W.build(cur0, P, assets, ctx).bbox; if (x >= b[0] + b[2] - 14 && x <= b[0] + b[2] + 26 && y >= b[1] + b[3] - 14 && y <= b[1] + b[3] + 26) { dragging = { mode: "size", it: cur0, x0: x, y0: y, b }; return; } }
    const h = hit(x, y); sel = h ? h.id : null; if (h) dragging = { mode: "move", it: h, x0: x, y0: y }; inspector(); redraw(); strip();
  });
  ov.addEventListener("pointermove", (e) => {
    if (!dragging) return; const [x, y] = toBoard(e), it = dragging.it, dx = x - dragging.x0, dy = y - dragging.y0;
    if (dragging.mode === "move") { it.x += dx; it.y += dy; if (it.type === "arrow") { it.x2 += dx; it.y2 += dy; } dragging.x0 = x; dragging.y0 = y; }
    else { const b = dragging.b, nw = Math.max(30, x - b[0]), nh = Math.max(30, y - b[1]);
      if (it.type === "text" || it.type === "tag" || it.type === "emoji") it.size = Math.max(20, Math.round((it.size || 64) * nh / b[3]));
      else if (it.type === "arrow") { it.x2 = x; it.y2 = y; }
      else if (it.type === "pie") it.r = Math.max(40, Math.round(Math.min(nw, nh) / 2));
      else if (it.type === "shape") { it.w = Math.round(nw); it.h = Math.round(nh); }
      else { it.w = Math.round(nw); delete it.h; } }
    redraw();
  });
  ov.addEventListener("pointerup", () => { if (dragging) { dragging = null; save(); inspector(); } });
  ov.addEventListener("dblclick", (e) => { const it = item(); if (it && (it.type === "text" || it.type === "tag")) { const t = prompt("Text", it.text); if (t != null) { it.text = t; save(); redraw(); inspector(); } } });
  addEventListener("keydown", (e) => { if (/INPUT|TEXTAREA|SELECT/.test((e.target || {}).tagName || "")) return; const it = item(); if (!it) return; if (e.key === "Delete" || e.key === "Backspace") { delItem(); e.preventDefault(); } const st = e.shiftKey ? 20 : 4; if (e.key.startsWith("Arrow")) { if (e.key === "ArrowLeft") it.x -= st; if (e.key === "ArrowRight") it.x += st; if (e.key === "ArrowUp") it.y -= st; if (e.key === "ArrowDown") it.y += st; save(); redraw(); e.preventDefault(); } });
  const stage = $("#stagebox");
  stage.addEventListener("dragover", (e) => e.preventDefault());
  stage.addEventListener("drop", (e) => { e.preventDefault(); let d = null; try { d = JSON.parse(e.dataTransfer.getData("text/plain")); } catch {} if (!d) return; const [x, y] = toBoard(e); addItem(d, x, y); });

  // ---------- items ----------
  function addItem(tpl, x, y) {
    const z = W.size(P), it = Object.assign({ id: W.newId() }, JSON.parse(JSON.stringify(tpl)));
    const bw = it.w || (it.type === "text" ? 400 : it.type === "emoji" ? (it.size || 160) : it.type === "pie" ? (it.r || 150) * 2 : 200), bh = it.h || (it.type === "text" || it.type === "tag" ? (it.size || 64) : it.type === "narrator" ? bw * 1.05 : bw);
    it.x = Math.round((x == null ? z.w / 2 : x) - bw / 2); it.y = Math.round((y == null ? z.h / 2 : y) - bh / 2);
    if (it.type === "arrow") { it.x = Math.round((x == null ? z.w / 2 : x) - 130); it.y = Math.round(y == null ? z.h / 2 : y); it.x2 = it.x + 260; it.y2 = it.y; }
    sc().items.push(it); sel = it.id; save(); redraw(); inspector(); timelineList(); if (it.type === "narrator" || it.type === "image") ensureImg(it).then(redraw);
  }
  function delItem() { const s = sc(); s.items = s.items.filter((i) => i.id !== sel); sel = null; save(); redraw(); inspector(); timelineList(); }

  // ---------- asset panel ----------
  let aTab = "figures", q = "", pack = "tabler", sq = "", siteImgs = null, poseList = null;
  const EMO = { Medical: "🩺💉💊🩹🧪🔬🧬🦠😷🏥🚑🩸🫀🫁🧠🦷🦴👁️🧫🌡️⚕️🧼🧤✂️🔪🪥", People: "👨‍⚕️👩‍⚕️🧑‍🏫👨‍🎓👩‍🎓🧑‍🤝‍🧑👥🙋‍♂️🙌👏👍👎✌️🤝💪🙏☝️👉👈", Symbols: "✅❌⚠️🚫❓❗💡🔔⭐🏆🎯📌📍🔒🔑♻️➕➖➡️⬅️⬆️⬇️🔥💯", Objects: "📚📖📝📋📊📈📉🗂️🖊️✏️📎💻📱🎥🎬🎧📣🕐⏱️📅🧮💰🛏️🧯🚪🔦", Faces: "😀😃😄😁😅😂🙂😉😍🤔😮😱😢😭😴😎🤩🥳😬🙄" };
  const FIG = W.POSES;
  const svgOf = (ps) => `<svg viewBox="0 0 24 24">${ps.map((d) => `<path d="${d}"/>`).join("")}</svg>`;
  function assetsPane() {
    const h = $("#assets"); h.innerHTML = `<div class="wb-tabs">${[["figures", "Figures"], ["narrator", "Narrator"], ["icons", "Icons"], ["emoji", "Emoji"], ["shapes", "Shapes"], ["media", "Media"]].map(([k, l]) => `<button data-k="${k}" class="${k === aTab ? "on" : ""}">${l}</button>`).join("")}</div><div id="apane"></div>`;
    h.querySelectorAll(".wb-tabs button").forEach((b) => (b.onclick = () => { aTab = b.dataset.k; assetsPane(); }));
    const p = $("#apane"), mk = (html, tpl, title) => { const d = document.createElement("div"); d.className = "wb-a"; d.draggable = true; d.title = title || ""; d.innerHTML = html; d.ondragstart = (e) => e.dataTransfer.setData("text/plain", JSON.stringify(tpl)); d.onclick = () => addItem(tpl); return d; };
    if (aTab === "figures") {
      p.innerHTML = `<p class="wb-note">Click or drag. Pose and extras (hair, scrub, cap, mask) are set in the panel on the right.</p><div class="wb-grid" id="g"></div>`;
      FIG.forEach((po) => { const ds = W.figurePaths(po, "hair"); $("#g").appendChild(mk(`<svg viewBox="0 0 120 230" style="width:30px;height:50px;stroke-width:5">${ds.map((d) => `<path d="${d}"/>`).join("")}</svg>${po}`, { type: "figure", pose: po, acc: "hair", w: 220 })); });
    } else if (aTab === "narrator") {
      p.innerHTML = `<p class="wb-note">Your own narrator poses. Click or drag; he is revealed top to bottom.</p><div class="wb-grid" id="g"></div>`;
      const go = (L) => { const g = $("#g"); if (!g) return; L.forEach((n) => g.appendChild(mk(`<img loading="lazy" src="/assets/narrators/${n}.png" style="width:56px;height:56px;object-fit:contain">${n.replace(/-/g, " ")}`, { type: "narrator", pose: n, w: 420 }, n))); };
      if (poseList) go(poseList); else fetch("/assets/narrators/index.json").then((r) => r.json()).then((j) => { poseList = (j.poses || []).map((x) => x.n); go(poseList); });
    } else if (aTab === "emoji") {
      p.innerHTML = Object.entries(EMO).map(([c, str]) => `<p class="wb-note" style="margin:.4rem 0 .2rem">${c}</p><div class="wb-grid" data-c="${c}" style="grid-template-columns:repeat(5,1fr)"></div>`).join("");
      p.querySelectorAll("[data-c]").forEach((g) => [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(EMO[g.dataset.c])].map((x) => x.segment).forEach((ch) => { const d = mk(`<span style="font-size:1.5rem;line-height:1.1">${ch}</span>`, { type: "emoji", char: ch, size: 170 }); d.style.minHeight = "40px"; g.appendChild(d); }));
    } else if (aTab === "icons") {
      const set = pack === "lucide" ? assets.lucide || {} : icons;
      p.innerHTML = `<div class="wb-tabs"><button data-p="tabler" class="${pack === "tabler" ? "on" : ""}">Tabler (4,900)</button><button data-p="lucide" class="${pack === "lucide" ? "on" : ""}">Lucide (2,300)</button></div><input type="search" id="iq" placeholder="Search icons (heart, clock, bed…)" value="${E(q)}" style="width:100%"><div class="wb-grid" id="g" style="margin-top:.4rem"></div><p class="wb-note">Tabler Icons (MIT) and Lucide (ISC).</p>`;
      p.querySelectorAll("[data-p]").forEach((b) => (b.onclick = async () => { pack = b.dataset.p; if (pack === "lucide" && !(assets.lucide && Object.keys(assets.lucide).length)) assets.lucide = await W.loadLucide(); assetsPane(); }));
      const draw = () => { const g = $("#g"); g.innerHTML = ""; const k = q.trim().toLowerCase(); let n = 0; for (const [name, v] of Object.entries(set)) { if (k && !(name.includes(k) || (v.t || "").includes(k))) continue; g.appendChild(mk(svgOf(v.p) + name.replace(/-/g, " "), pack === "lucide" ? { type: "icon", name, pack: "lucide", w: 160 } : { type: "icon", name, w: 160 }, name)); if (++n >= 90) break; } };
      $("#iq").oninput = (e) => { q = e.target.value; draw(); }; draw();
    } else if (aTab === "shapes") {
      p.innerHTML = `<div class="wb-grid" id="g"></div>`; const g = $("#g");
      [["Text", { type: "text", text: "Your text", size: 80 }], ["Black tag", { type: "tag", text: "LABEL", size: 60 }], ["Arrow", { type: "arrow", bend: 0.15 }], ["Box", { type: "shape", shape: "box", w: 360, h: 200 }], ["Circle", { type: "shape", shape: "circle", w: 300, h: 300 }], ["Underline", { type: "shape", shape: "underline", w: 500, h: 30, color: "#2a9fd6" }], ["Cross", { type: "shape", shape: "cross", w: 200, h: 200 }], ["Pie chart", { type: "pie", r: 170, pct: 25 }]].forEach(([l, tpl]) => g.appendChild(mk(`<b style="font-size:1.1rem">${l[0]}</b>${l}`, tpl)));
    } else {
      p.innerHTML = `<p class="wb-note">Your pictures are revealed with a sweep, because a photo has no strokes to draw.</p><input type="file" id="up" accept="image/*"><p class="wb-note" style="margin:.5rem 0 .2rem">Your theatre photos</p><div class="wb-grid" id="g1" style="grid-template-columns:repeat(2,1fr)"></div><p class="wb-note" style="margin:.5rem 0 .2rem">Your explainer cards (${siteImgs ? siteImgs.content.length : "..."})</p><input type="search" id="sq" placeholder="Search cards (asthma, sutures…)" value="${E(sq)}" style="width:100%"><div class="wb-grid" id="g2" style="grid-template-columns:repeat(2,1fr);margin-top:.3rem"></div>`;
      const ph = ["theatre-lights", "theatre-instruments", "theatre-portrait"]; ph.forEach((n) => $("#g1").appendChild(mk(`<img loading="lazy" src="/assets/${n}.jpg" style="width:80px;height:54px;object-fit:cover">${n.replace("theatre-", "")}`, { type: "image", src: `/assets/${n}.jpg`, w: 760 })));
      const cards = () => { const g = $("#g2"); if (!g || !siteImgs) return; g.innerHTML = ""; const k = sq.trim().toLowerCase().replace(/\s+/g, "-"); let n = 0; for (const nm of siteImgs.content) { if (k && !nm.includes(k)) continue; g.appendChild(mk(`<img loading="lazy" src="/assets/content/${nm}.jpg" style="width:80px;height:80px;object-fit:cover">${nm.replace(/-/g, " ").slice(0, 28)}`, { type: "image", src: `/assets/content/${nm}.jpg`, w: 560 })); if (++n >= 40) break; } };
      $("#sq").oninput = (e) => { sq = e.target.value; cards(); }; if (siteImgs) cards(); else fetch("/assets/whiteboard/site-images.json").then((r) => r.json()).then((j) => { siteImgs = j; cards(); });
      $("#up").onchange = (e) => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = async () => { const src = r.result; imgs[src] = await new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = src; }); addItem({ type: "image", src, w: 420 }); }; r.readAsDataURL(f); };
    }
  }

  // ---------- inspector ----------
  function fld(label, key, kind, opts, tgt) {
    const o = tgt || item(), d = document.createElement("div"); d.className = "field"; const id = "f" + Math.random().toString(36).slice(2, 7);
    let inp;
    if (kind === "select") inp = `<select id="${id}">${opts.map((x) => `<option value="${E(x)}" ${o[key] === x ? "selected" : ""}>${E(x)}</option>`).join("")}</select>`;
    else if (kind === "area") inp = `<textarea id="${id}">${E(o[key] || "")}</textarea>`;
    else if (kind === "color") inp = `<input type="color" id="${id}" value="${o[key] || opts || "#1c1c1c"}">`;
    else inp = `<input id="${id}" type="${kind || "text"}" value="${o[key] == null ? "" : E(o[key])}" ${kind === "number" ? 'step="any"' : ""}>`;
    d.innerHTML = `<label for="${id}">${label}</label>${inp}`;
    const el = $("#" + id, d); el.oninput = el.onchange = () => { let v = el.value; if (kind === "number") v = v === "" ? undefined : +v; if (v === undefined || v === "") delete o[key]; else o[key] = v; save(); redraw(); if (key === "narration") timelineList(); };
    return d;
  }
  function inspector() {
    const h = $("#insp"); h.innerHTML = ""; const it = item(), s = sc();
    const add = (el) => h.appendChild(el);
    if (!it) {
      h.insertAdjacentHTML("beforeend", `<h3 style="margin:.2rem 0">Scene ${cur + 1}</h3>`);
      add(fld("Voice-over (what is said)", "narration", "area", null, s)); add(fld("Hold after drawing (s)", "hold", "number", null, s));
      h.insertAdjacentHTML("beforeend", `<p class="wb-note">${aud[cur] && aud[cur].sig === (s.narration || "") ? "Voice ready: " + (aud[cur].t1 - aud[cur].t0).toFixed(1) + " s. Items are timed to it." : "No voice yet, so timing is estimated from the words."} Make or replace voices on <a href="/admin/whiteboard-export?id=${E(C.id)}">Voice &amp; export</a>.</p><p class="wb-note">Click an item on the board to edit it. Drag to move, drag the teal square to resize, double-click text to retype, arrow keys nudge, Delete removes. In "When to draw" put a phrase from the voice-over so the item is drawn as it is spoken.</p>`);
      return;
    }
    h.insertAdjacentHTML("beforeend", `<h3 style="margin:.2rem 0">${E(it.type)}</h3>`);
    if (it.type === "text" || it.type === "tag") { add(fld("Text", "text", "area")); const r = document.createElement("div"); r.className = "wb-two"; r.append(fld("Size", "size", "number"), fld("Align", "align", "select", ["left", "center", "right"])); add(r); add(fld("Max width (wrap)", "maxW", "number")); add(fld("Colour", "color", "color")); }
    if (it.type === "icon") { add(fld("Icon name", "name", "text")); if (it.pack) add(fld("Pack", "pack", "select", ["tabler", "lucide"])); add(fld("Width", "w", "number")); add(fld("Line thickness", "lw", "number")); add(fld("Colour", "color", "color")); const r = document.createElement("div"); r.className = "wb-row"; add(r); }
    if (it.type === "figure") { add(fld("Pose", "pose", "select", W.POSES)); add(fld("Extras (hair scrub cap mask)", "acc", "text")); add(fld("Width", "w", "number")); add(fld("Line thickness", "lw", "number")); }
    if (it.type === "shape") { add(fld("Shape", "shape", "select", ["box", "circle", "underline", "line", "cross"])); const r = document.createElement("div"); r.className = "wb-two"; r.append(fld("Width", "w", "number"), fld("Height", "h", "number")); add(r); add(fld("Colour", "color", "color", "#e63946")); add(fld("Line thickness", "lw", "number")); }
    if (it.type === "arrow") { add(fld("Curve (-0.5…0.5)", "bend", "number")); add(fld("Colour", "color", "color", "#e63946")); add(fld("Line thickness", "lw", "number")); }
    if (it.type === "pie") { add(fld("Percent (first slice)", "pct", "number")); add(fld("Radius", "r", "number")); const r = document.createElement("div"); r.className = "wb-two"; r.append(fld("Label 1", "l1", "text"), fld("Label 2", "l2", "text")); add(r); r.append(fld("Colour 1", "c1", "color", "#f4a261"), fld("Colour 2", "c2", "color", "#2a9fd6")); }
    if (it.type === "image") { add(fld("Width", "w", "number")); add(fld("Reveal", "reveal", "select", ["wipe", "scan"])); }
    if (it.type === "narrator") { add(fld("Pose", "pose", "select", poseList || [it.pose])); add(fld("Width", "w", "number")); }
    if (it.type === "emoji") { add(fld("Emoji", "char", "text")); add(fld("Size", "size", "number")); }
    h.insertAdjacentHTML("beforeend", `<hr style="border-color:var(--panel-border)"><p class="wb-note">Timing: leave all three blank and items are spread across the voice-over in order.</p>`);
    add(fld("When to draw (phrase from the voice-over)", "cue", "text")); const r2 = document.createElement("div"); r2.className = "wb-two"; r2.append(fld("Starts at (s)", "start", "number"), fld("Draw time (s)", "dur", "number")); add(r2);
    const r = document.createElement("div"); r.className = "wb-row";
    const mv = (d) => { const L = s.items, i = L.indexOf(it), j = i + d; if (j < 0 || j >= L.length) return; L.splice(i, 1); L.splice(j, 0, it); save(); redraw(); timelineList(); };
    r.append(A.btn("Earlier", "sm", () => mv(-1)), A.btn("Later", "sm", () => mv(1)), A.btn("Duplicate", "sm", () => { const c = JSON.parse(JSON.stringify(it)); c.id = W.newId(); c.x += 30; c.y += 30; if (c.type === "arrow") { c.x2 += 30; c.y2 += 30; } s.items.push(c); sel = c.id; save(); redraw(); inspector(); timelineList(); }), A.btn("Delete", "sm", delItem)); add(r);
  }

  // ---------- scenes ----------
  function strip() {
    const h = $("#strip"); h.innerHTML = "";
    P.scenes.forEach((s, i) => { const b = document.createElement("button"); b.className = "wb-chip" + (i === cur ? " on" : ""); b.textContent = (i + 1) + ". " + ((s.narration || "").slice(0, 18) || "scene"); b.onclick = () => { cur = i; sel = null; strip(); inspector(); redraw(); timelineList(); }; h.appendChild(b); });
    h.append(A.btn("Add scene", "sm primary", () => { P.scenes.splice(cur + 1, 0, W.newScene()); cur++; sel = null; save(); strip(); inspector(); redraw(); timelineList(); }),
      A.btn("Duplicate", "sm", () => { const c = JSON.parse(JSON.stringify(sc())); c.id = W.newId(); c.items.forEach((x) => (x.id = W.newId())); P.scenes.splice(cur + 1, 0, c); cur++; save(); strip(); inspector(); redraw(); timelineList(); }),
      A.btn("Move left", "sm", () => { if (cur > 0) { const [x] = P.scenes.splice(cur, 1); P.scenes.splice(--cur, 0, x); save(); strip(); redraw(); } }), A.btn("Move right", "sm", () => { if (cur < P.scenes.length - 1) { const [x] = P.scenes.splice(cur, 1); P.scenes.splice(++cur, 0, x); save(); strip(); redraw(); } }),
      A.btn("Delete scene", "sm", () => { if (P.scenes.length < 2) return; if (!confirm("Delete this scene?")) return; P.scenes.splice(cur, 1); cur = Math.max(0, cur - 1); sel = null; save(); strip(); inspector(); redraw(); timelineList(); }));
  }
  function timelineList() {
    const h = $("#tl"); h.innerHTML = ""; const tl = TL(), s = tl.scenes[cur]; if (!s) return; const span = Math.max(1, s.lay.end);
    s.lay.list.forEach((o, i) => { const d = document.createElement("div"); d.className = o.it.id === sel ? "on" : ""; const nm = o.it.type === "icon" ? o.it.name : o.it.type === "text" || o.it.type === "tag" ? String(o.it.text).slice(0, 18) : o.it.pose || o.it.shape || o.it.type; d.innerHTML = `<span style="width:7rem;overflow:hidden;white-space:nowrap">${i + 1}. ${E(nm)}</span><i><b style="left:${(o.t0 / span) * 100}%;width:${Math.max(1.5, ((o.t1 - o.t0) / span) * 100)}%"></b></i><span class="mono">${o.t0.toFixed(1)}s</span>`; d.onclick = () => { sel = o.it.id; inspector(); redraw(); timelineList(); }; h.appendChild(d); });
  }

  // ---------- voice (made on the Voice & export page, cached for this page) ----------
  async function refreshVoices() { aud = await EO_WBA.loadVoices(P); recomputeDurs(); }
  async function getMix() { const tl = TL(), sig = JSON.stringify(P.scenes.map((s) => s.narration + (s.hold || "") + s.items.length)) + P.music.src + P.music.vol + durs.join(","); if (mixBuf && sig === mixSig) return mixBuf; mixBuf = await EO_WBA.mix(P, tl, aud); mixSig = sig; return mixBuf; }

  // ---------- playback ----------
  async function play() {
    if (playing) { stopPlay(); return; } $("#play").textContent = "..."; sel = null; let mb = null; try { mb = await getMix(); } catch {} const tl = TL(); assets.tl = tl;
    const seek = +$("#seek").value / 1000 * tl.total, from = seek > tl.total - 0.5 ? 0 : seek, a = mb ? T.play(mb, from) : null, t0 = performance.now() - from * 1000; playing = { a };
    $("#play").textContent = "Stop";
    const step = () => { if (!playing) return; const t = a ? a.time() : (performance.now() - t0) / 1000; if (t >= tl.total) { stopPlay(); return; } frame(t); $("#seek").value = Math.round((t / tl.total) * 1000); requestAnimationFrame(step); }; step();
  }
  function stopPlay() { if (playing && playing.a) playing.a.stop(); playing = null; $("#play").textContent = "Play"; redraw(); }
  $("#play").onclick = play;
  $("#seek").oninput = () => { if (playing) stopPlay(); const tl = TL(), t = (+$("#seek").value / 1000) * tl.total; assets.hand = true; sizeCanvas(); assets.tl = tl; W.draw(ctx, P, t, assets); octx.clearRect(0, 0, ov.width, ov.height); $("#tm").textContent = fmt(t) + " / " + fmt(tl.total); };

  // ---------- project bar ----------
  const top = $("#top");
  function bar() {
    top.innerHTML = ""; const sel2 = (opts, val, fn) => { const s = document.createElement("select"); s.innerHTML = opts.map(([k, l]) => `<option value="${k}" ${String(k) === String(val) ? "selected" : ""}>${E(l)}</option>`).join(""); s.onchange = () => fn(s.value); return s; };
    const nm = document.createElement("input"); nm.value = P.name; nm.style.maxWidth = "14rem"; nm.oninput = () => { P.name = nm.value; save(); };
    const fm = sel2(Object.entries(W.FORMATS).map(([k, v]) => [k, v.label]), P.format, (k) => { P.format = k; save(); redraw(); });
    const fnt = sel2([["marker", "Marker font"], ["hand", "Handwriting font"]], P.font, (k) => { P.font = k; save(); redraw(); });
    const pc = sel2([["0.8", "Slower drawing"], ["1", "Normal drawing speed"], ["1.25", "Faster drawing"], ["1.5", "Much faster"]], P.pace || 1, (k) => { P.pace = +k; save(); redraw(); timelineList(); });
    top.append(nm, fm, fnt, pc, A.btn("Hand…", "sm", handDialog), A.btn("Logo…", "sm", logoDialog), A.btn("Import JSON…", "sm", importDialog), A.btn("Voice & export", "sm primary", async () => { await persistNow(); location.href = "/admin/whiteboard-export?id=" + C.id; }),
      A.btn("Download JSON", "sm", () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(P, null, 2)], { type: "application/json" })); a.download = (P.name || "whiteboard").replace(/[^\w-]+/g, "-") + ".json"; a.click(); }));
  }
  async function persistNow() { const r = await S.get(C.id) || { id: C.id }; r.data = P; r.thumb = C.thumb(cv, 320); await S.put(r); }
  function importDialog() {
    const d = document.createElement("div"); d.className = "wb-modal";
    d.innerHTML = `<div class="crt-window"><div class="titlebar"><span class="dot r"></span><span class="dot y"></span><span class="dot g"></span><span class="label">import json into this project</span></div><div class="body"><p class="wb-note">Paste a script (see the <a href="/assets/whiteboard/import-guide.md" target="_blank">guide</a>). Choose whether it replaces your scenes or is added after them.</p><div class="wb-row"><input type="file" id="jf" accept=".json,application/json"><select id="jm2"><option value="append">Add after current scenes</option><option value="replace">Replace all scenes</option></select></div><textarea id="jt" spellcheck="false"></textarea><div class="wb-msgs" id="jm"></div><div class="wb-row" id="jb"></div></div></div>`;
    document.body.appendChild(d); const ta = $("#jt", d), msgs = $("#jm", d); let obj = null;
    const check = async () => { obj = null; msgs.innerHTML = ""; if (!ta.value.trim()) return; try { obj = JSON.parse(ta.value); } catch (e) { msgs.innerHTML = `<div class="e">That is not valid JSON: ${E(e.message)}</div>`; return; } const sets = { tabler: await W.loadIcons(), lucide: await W.loadLucide() }, v = IMP.validate(obj, sets); msgs.innerHTML = v.errors.map((m) => `<div class="e">Problem: ${E(m)}</div>`).join("") + v.warnings.map((m) => `<div class="w">Note: ${E(m)}</div>`).join("") + (v.errors.length ? "" : `<div>Looks good: ${obj.scenes.length} scenes.</div>`); if (v.errors.length) obj = null; };
    ta.oninput = check; $("#jf", d).onchange = async (e) => { if (e.target.files[0]) { ta.value = await e.target.files[0].text(); check(); } };
    $("#jb", d).append(A.btn("Import", "primary", async () => { await check(); if (!obj) return; const np = IMP.fromScript(obj); if ($("#jm2", d).value === "replace") { P.scenes = np.scenes; cur = 0; } else { P.scenes.push(...np.scenes); cur = P.scenes.length - np.scenes.length; } sel = null; save(); d.remove(); await reload(); await refreshVoices(); strip(); inspector(); redraw(); timelineList(); }), A.btn("Cancel", "", () => d.remove()));
  }

  // ---------- real hand photo + logo ----------
  function handDialog() {
    const d = document.createElement("div"); d.style.cssText = "position:fixed;inset:0;background:#000b;z-index:50;display:flex;align-items:center;justify-content:center;padding:1rem";
    d.innerHTML = `<div class="crt-window" style="max-width:720px;width:100%;max-height:92vh;overflow:auto"><div class="titlebar"><span class="dot r"></span><span class="dot y"></span><span class="dot g"></span><span class="label">drawing hand</span></div><div class="body">
      <p class="wb-note"><b>Or use your own photo:</b> take a photo of a hand holding a marker (plain light background, forearm coming in from the lower right). Upload it, then <b>click the marker tip</b> in the preview. The tip is where the drawing appears.</p>
      <div class="wb-row"><input type="file" id="hf" accept="image/*"><label class="wb-note"><input type="checkbox" id="hw" checked> remove white background</label></div>
      <div class="wb-two"><div class="field"><label>Arm angle (degrees, 0 = arm points right, 45 = from lower right)</label><input id="hr" type="number" value="45"></div><div class="field"><label>Hand size</label><input id="hs" type="number" step="0.1" value="1.2"></div></div>
      <canvas id="hp" style="max-width:100%;background:repeating-conic-gradient(#ddd 0 25%,#fff 0 50%) 0 0/16px 16px;border:1px solid var(--panel-border);cursor:crosshair"></canvas>
      <div class="wb-row" id="hb"></div></div></div>`;
    document.body.appendChild(d); let img = null, tip = null; const pc = d.querySelector("#hp"), pg = pc.getContext("2d");
    const showImg = () => { if (!img) return; const k = Math.min(1, 640 / img.width); pc.width = img.width * k; pc.height = img.height * k; pc._k = k; pg.clearRect(0, 0, pc.width, pc.height); pg.drawImage(img, 0, 0, pc.width, pc.height); if (tip) { pg.strokeStyle = "#e63946"; pg.lineWidth = 3; pg.beginPath(); pg.arc(tip[0] * k, tip[1] * k, 12, 0, 7); pg.moveTo(tip[0] * k - 20, tip[1] * k); pg.lineTo(tip[0] * k + 20, tip[1] * k); pg.moveTo(tip[0] * k, tip[1] * k - 20); pg.lineTo(tip[0] * k, tip[1] * k + 20); pg.stroke(); } };
    const load = (file) => { const r = new FileReader(); r.onload = () => { const im = new Image(); im.onload = () => { const k = Math.min(1, 1100 / Math.max(im.width, im.height)), c = document.createElement("canvas"); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); const g = c.getContext("2d"); g.drawImage(im, 0, 0, c.width, c.height);
      if (d.querySelector("#hw").checked) { const px = g.getImageData(0, 0, c.width, c.height), a = px.data; for (let i = 0; i < a.length; i += 4) { const m = Math.min(a[i], a[i + 1], a[i + 2]); a[i + 3] = m > 238 ? 0 : m > 205 ? Math.round(255 * (238 - m) / 33) : 255; } g.putImageData(px, 0, 0); }
      img = c; tip = null; showImg(); }; im.src = r.result; }; r.readAsDataURL(file); };
    d.querySelector("#hf").onchange = (e) => e.target.files[0] && load(e.target.files[0]);
    pc.onclick = (e) => { if (!img) return; const r = pc.getBoundingClientRect(); tip = [((e.clientX - r.left) / r.width) * img.width, ((e.clientY - r.top) / r.height) * img.height]; showImg(); };
    const pre = document.createElement("div"); pre.className = "wb-row"; pre.innerHTML = '<label class="wb-note">Ready-made hands:</label>'; const sel = document.createElement("select"); sel.innerHTML = '<option value="">Choose a hand...</option>'; pre.append(sel); d.querySelector(".body").insertBefore(pre, d.querySelector("#hb"));
    fetch("/assets/whiteboard/hands/index.json").then((r) => r.json()).then((ix) => { ix.hands.forEach((h) => { const o = document.createElement("option"); o.value = h.id; o.textContent = h.name; sel.append(o); });
      sel.onchange = async () => { const h = ix.hands.find((x) => x.id === sel.value); if (!h) return; P.hand = { src: h.src, tip: h.tip, rot: h.rot, scale: h.scale, eraser: ix.erasers[0] }; save(); await reload(); redraw(); d.remove(); }; }).catch(() => {});
    const hb = d.querySelector("#hb");
    hb.append(A.btn("Use this hand", "primary", async () => { if (!img || !tip) return alert("Upload a photo and click the marker tip first."); P.hand = { src: img.toDataURL("image/png"), tip: [Math.round(tip[0]), Math.round(tip[1])], rot: +d.querySelector("#hr").value || 0, scale: +d.querySelector("#hs").value || 1.2 }; save(); await reload(); redraw(); d.remove(); }),
      A.btn("Back to narrator hand", "", async () => { delete P.hand; save(); await reload(); redraw(); d.remove(); }), A.btn("Close", "", () => d.remove()));
  }
  function logoDialog() { const f = document.createElement("input"); f.type = "file"; f.accept = "image/*"; f.onchange = () => { const r = new FileReader(); r.onload = () => { const im = new Image(); im.onload = async () => { const c = document.createElement("canvas"); c.width = c.height = 256; const g = c.getContext("2d"), m = Math.min(im.width, im.height); g.drawImage(im, (im.width - m) / 2, (im.height - m) / 2, m, m, 0, 0, 256, 256); P.logo = c.toDataURL("image/png"); save(); await reload(); redraw(); }; im.src = r.result; }; r.readAsDataURL(f.files[0]); }; if (confirm("OK = upload a new logo. Cancel = go back to your site logo.")) f.click(); else { P.logo = "/assets/icons/icon-192.png"; save(); reload().then(redraw); } }
  await reload(); await refreshVoices(); bar(); assetsPane(); strip(); inspector(); redraw(); timelineList(); addEventListener("resize", redraw);

})();
