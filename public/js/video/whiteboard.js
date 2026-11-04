// ============================================================
// Whiteboard animation engine (EO_WB). Deterministic canvas renderer: draw(ctx, project, t, assets) paints the exact
// frame at time t, so the same code drives the editor preview AND the frame-by-frame MP4 export (and headless tests).
// A hand + marker draws each item stroke by stroke (line icons, doodle figures, arrows, boxes, circles, pies),
// writes text with a marker font, and an eraser hand wipes the board between scenes.
// Board units: wide 1600x900, short 900x1600, square 1200x1200 (the canvas is scaled to fit).
// ============================================================
(function () {
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const c01 = (x) => clamp(x, 0, 1);
  const lerp = (a, b, t) => a + (b - a) * t;
  const io = (x) => { x = c01(x); return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; };
  const out3 = (x) => 1 - Math.pow(1 - c01(x), 3);
  const FORMATS = { wide: { label: "Wide 16:9 (YouTube)", w: 1600, h: 900, px: [1280, 720] }, short: { label: "Vertical 9:16 (Reels/Shorts)", w: 900, h: 1600, px: [720, 1280] }, square: { label: "Square 1:1", w: 1200, h: 1200, px: [1080, 1080] } };
  const FONTS = { marker: "WBMarker, 'Permanent Marker', cursive", hand: "WBHand, 'Patrick Hand', cursive", sans: "700 sans-serif" };
  const R = (i, k) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };
  let uid = 0; const newId = () => "i" + Date.now().toString(36) + (uid++).toString(36);

  const newProject = () => ({ v: 1, name: "Untitled whiteboard", format: "wide", fps: 30, bg: "#fbfaf6", ink: "#1c1c1c", accent: "#e63946", blue: "#2a9fd6", orange: "#f4a261", font: "marker", handle: "@ezraogombo", badge: "EO", logo: "/assets/icons/icon-192.png", scenes: [] });
  const newScene = () => ({ id: newId(), narration: "", items: [], hold: 0.6 });
  const size = (P) => FORMATS[P.format] || FORMATS.wide;

  // ---------- doodle figure generator (120 x 230 box) ----------
  const ARMS = {
    stand: ["M42 68q-14 30-10 62", "M78 68q14 30 10 62"],
    point: ["M42 68q-14 30-10 62", "M78 68q28 2 52 -6"],
    up: ["M42 68q-26-6-30-42", "M78 68q26-6 30-42"],
    think: ["M42 68q-14 30-10 62", "M78 68q10 22 8 30q-14-4-26-50"],
    hips: ["M42 68q-20 14-8 36q6 4 12 2", "M78 68q20 14 8 36q-6 4-12 2"],
    shrug: ["M42 68q-26 10-32 36", "M78 68q26 10 32 36"],
    wave: ["M42 68q-14 30-10 62", "M78 68q24-6 34-44"],
    hold: ["M42 68q-14 30-10 62", "M78 68q18 18-8 40"],
  };
  function figurePaths(pose, acc) {
    const P = ["M40 30a20 20 0 1 0 40 0a20 20 0 1 0 -40 0", "M52 28v4", "M68 28v4", "M52 39q8 7 16 0", "M56 50v12", "M64 50v12",
      "M42 64q18-8 36 0l5 70h-46z", "M46 134l-2 82h-14", "M74 134l2 82h14", "M60 134v40"];
    (ARMS[pose] || ARMS.stand).forEach((a) => P.push(a));
    if (acc && acc.indexOf("hair") >= 0) P.push("M41 26c1-14 12-22 23-19c9 2 15 10 15 19");
    if (acc && acc.indexOf("scrub") >= 0) { P.push("M50 64l10 18l10-18", "M66 104h11v12h-11z"); }
    if (acc && acc.indexOf("cap") >= 0) P.push("M39 25c0-18 11-24 21-24s21 6 21 24z");
    if (acc && acc.indexOf("mask") >= 0) P.push("M45 35h30l-5 14h-20z");
    return P;
  }
  const POSES = Object.keys(ARMS);

  // ---------- stroke primitives: {len, draw(ctx,l), at(l)->[x,y]} in LOCAL coordinates ----------
  let svgEl = null;
  function svgHost() { if (!svgEl) { svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg"); svgEl.setAttribute("width", "0"); svgEl.setAttribute("height", "0"); svgEl.style.cssText = "position:absolute;left:-9999px;top:0;visibility:hidden"; document.body.appendChild(svgEl); } return svgEl; }
  const DCACHE = new Map();
  function domStroke(d) {
    if (DCACHE.has(d)) return DCACHE.get(d);
    const el = document.createElementNS("http://www.w3.org/2000/svg", "path"); el.setAttribute("d", d); svgHost().appendChild(el);
    let len = 0; try { len = el.getTotalLength(); } catch (e) {}
    const p2d = new Path2D(d);
    const s = { len: len || 0.01, draw(ctx, l) { if (l >= len - 0.001) { ctx.stroke(p2d); return; } if (l <= 0) return; ctx.setLineDash([l, len + 50]); ctx.stroke(p2d); ctx.setLineDash([]); }, at(l) { try { const p = el.getPointAtLength(clamp(l, 0, len)); return [p.x, p.y]; } catch (e) { return [0, 0]; } } };
    DCACHE.set(d, s); return s;
  }
  function polyStroke(pts) {
    const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const len = cum[cum.length - 1] || 0.01;
    const at = (l) => { l = clamp(l, 0, len); let i = 1; while (i < cum.length - 1 && cum[i] < l) i++; const a = pts[i - 1], b = pts[i], seg = cum[i] - cum[i - 1] || 1, f = (l - cum[i - 1]) / seg; return [lerp(a[0], b[0], f), lerp(a[1], b[1], f)]; };
    return { len, at, draw(ctx, l) { if (l <= 0) return; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length && cum[i] <= l; i++) ctx.lineTo(pts[i][0], pts[i][1]); const e = at(l); ctx.lineTo(e[0], e[1]); ctx.stroke(); } };
  }
  const wob = (it, i, a) => (R(i, it.seed || 3) - 0.5) * a;
  function shapePts(it) {
    const w = it.w || 300, h = it.h || 160, a = it.wobble == null ? 3 : it.wobble, pts = [];
    if (it.shape === "circle") { const n = 70, cx = w / 2, cy = h / 2, turns = 1.12; for (let i = 0; i <= n; i++) { const th = -Math.PI * 0.6 + (i / n) * Math.PI * 2 * turns, r = 1 + (i / n) * 0.05; pts.push([cx + Math.cos(th) * (w / 2) * r + wob(it, i, a), cy + Math.sin(th) * (h / 2) * r + wob(it, i + 50, a)]); } }
    else if (it.shape === "underline") { const n = 30; for (let i = 0; i <= n; i++) pts.push([(i / n) * w, h / 2 + Math.sin(i * 0.9) * a * 1.2 + wob(it, i, a)]); }
    else if (it.shape === "line") { pts.push([0, 0], [w, h]); }
    else if (it.shape === "cross") { pts.push([0, 0], [w, h], [w / 2, h / 2], [w, 0], [0, h]); }
    else { const c = [[0, 0], [w, 0], [w, h], [0, h], [0, -2]]; for (let k = 0; k < 4; k++) { const A = c[k], B = c[k + 1], n = 12; for (let i = 0; i <= n; i++) pts.push([lerp(A[0], B[0], i / n) + wob(it, k * 13 + i, a), lerp(A[1], B[1], i / n) + wob(it, k * 13 + i + 90, a)]); } }
    return pts;
  }
  function arrowStrokes(it) {
    const x2 = it.x2 - it.x, y2 = it.y2 - it.y, bend = it.bend || 0, mx = x2 / 2 + (-y2) * bend, my = y2 / 2 + x2 * bend, n = 36, pts = [];
    for (let i = 0; i <= n; i++) { const u = i / n, a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, c = u * u; pts.push([a * 0 + b * mx + c * x2 + wob(it, i, 1.5), a * 0 + b * my + c * y2 + wob(it, i + 40, 1.5)]); }
    const e = pts[n], q = pts[n - 3], ang = Math.atan2(e[1] - q[1], e[0] - q[0]), hl = it.head || 34;
    const h1 = [e[0] - Math.cos(ang - 0.45) * hl, e[1] - Math.sin(ang - 0.45) * hl], h2 = [e[0] - Math.cos(ang + 0.45) * hl, e[1] - Math.sin(ang + 0.45) * hl];
    return [polyStroke(pts), polyStroke([h1, e, h2])];
  }

  // ---------- text helpers ----------
  function fontStr(P, size) { return size + "px " + (FONTS[P.font] || FONTS.marker); }
  function wrapText(ctx, text, maxW) {
    const out = [];
    String(text).split("\n").forEach((para) => { let line = ""; para.split(/\s+/).forEach((w) => { const t = line ? line + " " + w : w; if (maxW && ctx.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; }); out.push(line); });
    return out;
  }

  // ---------- item geometry / draw -----------
  // Each item resolves to {strokes?, local transform, draw(ctx, p, P, A) , pen(p) -> [x,y] board coords}
  function build(it, P, A, ctx) {
    const k = it.type;
    if (k === "icon" || k === "figure") {
      const ic = k === "icon" ? ((it.pack === "lucide" ? A.lucide : A.icons) || {})[it.name] : null;
      const ds = k === "icon" ? (ic ? ic.p : ["M3 3h18v18h-18z"]) : figurePaths(it.pose || "stand", it.acc || "hair");
      const vw = k === "icon" ? 24 : 120, vh = k === "icon" ? 24 : 230, w = it.w || (k === "icon" ? 160 : 150), h = it.h || (k === "icon" ? w : w * vh / vw);
      const sx = w / vw, sy = h / vh, strokes = ds.map(domStroke), total = strokes.reduce((a, s) => a + s.len, 0), lw = (it.lw || (k === "icon" ? 2 : 3.2));
      const ang = (it.rot || 0) * Math.PI / 180, cx = it.x + w / 2, cy = it.y + h / 2, ca = Math.cos(ang), sa = Math.sin(ang);
      const toB = (lx, ly) => { const dx = lx * sx - w / 2, dy = ly * sy - h / 2; return [cx + dx * ca - dy * sa, cy + dx * sa + dy * ca]; };
      return {
        bbox: [it.x, it.y, w, h],
        pen(p) { let l = p * total; for (const s of strokes) { if (l <= s.len) { const q = s.at(l); return toB(q[0], q[1]); } l -= s.len; } const s = strokes[strokes.length - 1], q = s.at(s.len); return toB(q[0], q[1]); },
        draw(ctx, p) {
          ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang); ctx.translate(-w / 2, -h / 2); ctx.scale(sx, sy); ctx.lineWidth = lw; ctx.strokeStyle = it.color || P.ink; ctx.lineCap = "round"; ctx.lineJoin = "round"; let l = p * total;
          for (const s of strokes) { if (l <= 0) break; s.draw(ctx, Math.min(l, s.len)); l -= s.len; }
          ctx.restore();
        },
      };
    }
    if (k === "shape") {
      const pts = shapePts(it), st = polyStroke(pts), ox = it.x, oy = it.y;
      return { bbox: [it.x, it.y, it.w || 300, it.h || 160], pen(p) { const q = st.at(p * st.len); return [ox + q[0], oy + q[1]]; }, draw(ctx, p) { ctx.save(); ctx.translate(ox, oy); ctx.lineWidth = it.lw || 6; ctx.strokeStyle = it.color || P.accent; ctx.lineCap = "round"; ctx.lineJoin = "round"; st.draw(ctx, p * st.len); ctx.restore(); } };
    }
    if (k === "arrow") {
      const ss = arrowStrokes(it), tot = ss[0].len + ss[1].len, ox = it.x, oy = it.y;
      return { bbox: [Math.min(it.x, it.x2), Math.min(it.y, it.y2), Math.abs(it.x2 - it.x) || 40, Math.abs(it.y2 - it.y) || 40], pen(p) { let l = p * tot; const s = l <= ss[0].len ? ss[0] : ss[1]; if (s === ss[1]) l -= ss[0].len; const q = s.at(l); return [ox + q[0], oy + q[1]]; },
        draw(ctx, p) { ctx.save(); ctx.translate(ox, oy); ctx.lineWidth = it.lw || 9; ctx.strokeStyle = it.color || P.accent; ctx.lineCap = "round"; ctx.lineJoin = "round"; let l = p * tot; ss[0].draw(ctx, Math.min(l, ss[0].len)); l -= ss[0].len; if (l > 0) ss[1].draw(ctx, l); ctx.restore(); } };
    }
    if (k === "text" || k === "tag") {
      const size = it.size || (k === "tag" ? 54 : 64); ctx.save(); ctx.font = fontStr(P, size);
      const maxW = it.maxW || 0, lines = wrapText(ctx, it.text || "", maxW), lh = size * 1.18, ws = lines.map((l) => ctx.measureText(l).width), tw = Math.max(...ws, 10); ctx.restore();
      const padX = k === "tag" ? size * 0.5 : 0, padY = k === "tag" ? size * 0.28 : 0, bw = tw + padX * 2, bh = lines.length * lh + padY * 2, al = it.align || "left";
      const bx = al === "center" ? it.x - bw / 2 : al === "right" ? it.x - bw : it.x, by = it.y; const tot = ws.reduce((a, b) => a + b, 0) || 1;
      return {
        bbox: [bx, by, bw, bh],
        pen(p) { let acc = p * tot; for (let i = 0; i < lines.length; i++) { if (acc <= ws[i] || i === lines.length - 1) { const x0 = al === "center" ? bx + (bw - ws[i]) / 2 : al === "right" ? bx + bw - ws[i] : bx + padX; return [x0 + Math.min(acc, ws[i]), by + padY + i * lh + lh * 0.72]; } acc -= ws[i]; } return [bx, by]; },
        draw(ctx, p) {
          ctx.save(); ctx.font = fontStr(P, size); ctx.textBaseline = "alphabetic";
          let acc = p * tot;
          if (k === "tag") { ctx.save(); ctx.beginPath(); ctx.rect(bx - 2, by - 2, (bw + 4) * p, bh + 4); ctx.clip(); ctx.fillStyle = it.fill || "#111"; ctx.fillRect(bx, by, bw, bh); ctx.restore(); }
          for (let i = 0; i < lines.length; i++) {
            const w = ws[i], x0 = al === "center" ? bx + (bw - w) / 2 : al === "right" ? bx + bw - w : bx + padX, y = by + padY + i * lh + lh * 0.78, vis = clamp(acc, 0, w); acc -= w;
            if (vis <= 0) continue; ctx.save(); ctx.beginPath(); ctx.rect(x0 - 4, y - lh, vis + 6, lh * 1.4); ctx.clip();
            if (k !== "tag") { ctx.lineWidth = size * 0.04; ctx.strokeStyle = it.color || P.ink; ctx.strokeText(lines[i], x0, y); }
            ctx.fillStyle = k === "tag" ? (it.color || "#fff") : (it.color || P.ink); ctx.fillText(lines[i], x0, y); ctx.restore();
          }
          ctx.restore();
        },
      };
    }
    if (k === "pie") {
      const r = (it.r || 150), cx = it.x + r, cy = it.y + r, pct = clamp((it.pct == null ? 20 : it.pct) / 100, 0.01, 0.99), c1 = it.c1 || P.orange, c2 = it.c2 || P.blue;
      const ring = polyStroke(Array.from({ length: 61 }, (_, i) => [cx + Math.cos(-Math.PI / 2 + (i / 60) * Math.PI * 2) * r, cy + Math.sin(-Math.PI / 2 + (i / 60) * Math.PI * 2) * r]));
      return {
        bbox: [it.x, it.y, r * 2, r * 2],
        pen(p) { if (p < 0.25) { const q = ring.at((p / 0.25) * ring.len); return q; } const a = -Math.PI / 2 + ((p - 0.25) / 0.75) * Math.PI * 2; return [cx + Math.cos(a) * r * 0.7, cy + Math.sin(a) * r * 0.7]; },
        draw(ctx, p) {
          ctx.save(); ctx.lineWidth = 6; ctx.strokeStyle = P.ink; ctx.lineCap = "round";
          ring.draw(ctx, Math.min(1, p / 0.25) * ring.len);
          if (p > 0.25) { const f = (p - 0.25) / 0.75, end = -Math.PI / 2 + f * Math.PI * 2, s1 = -Math.PI / 2 + pct * Math.PI * 2;
            const sl = (a0, a1, col) => { if (a1 <= a0) return; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r - 3, a0, a1); ctx.closePath(); ctx.fillStyle = col; ctx.fill(); };
            sl(-Math.PI / 2, Math.min(end, s1), c1); sl(s1, end, c2); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke(); }
          if (p > 0.9) { ctx.globalAlpha = c01((p - 0.9) / 0.1); ctx.font = fontStr(P, r * 0.34); ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.strokeStyle = "#0004"; ctx.lineWidth = 3;
            const a1 = -Math.PI / 2 + pct * Math.PI, a2 = -Math.PI / 2 + pct * Math.PI * 2 + (1 - pct) * Math.PI; ctx.fillText(it.l1 || Math.round(pct * 100), cx + Math.cos(a1) * r * 0.62, cy + Math.sin(a1) * r * 0.62 + r * 0.12); ctx.fillText(it.l2 || Math.round((1 - pct) * 100), cx + Math.cos(a2) * r * 0.52, cy + Math.sin(a2) * r * 0.52 + r * 0.12); }
          ctx.restore();
        },
      };
    }
    if (k === "image" || k === "narrator") {
      const src = k === "narrator" ? "/assets/narrators/" + (it.pose || "neutral") + ".png" : it.src, im = A.imgs && A.imgs[src], w = it.w || (k === "narrator" ? 420 : 300), h = it.h || (im ? w * im.height / im.width : w);
      const scan = k === "narrator" || it.reveal === "scan";
      return { bbox: [it.x, it.y, w, h], src, pen(p) { return scan ? [it.x + w * (0.5 + 0.35 * Math.sin(p * 18)), it.y + h * p] : [it.x + w * p, it.y + h * (0.5 + 0.45 * Math.sin(p * 40))]; },
        draw(ctx, p) { if (!im) { ctx.save(); ctx.strokeStyle = "#999"; ctx.setLineDash([10, 8]); ctx.lineWidth = 3; ctx.strokeRect(it.x, it.y, w, h); ctx.restore(); return; }
          ctx.save(); ctx.beginPath(); if (scan) ctx.rect(it.x - 4, it.y - 4, w + 8, (h + 8) * p); else ctx.rect(it.x, it.y, w * p, h); ctx.clip(); ctx.drawImage(im, it.x, it.y, w, h); ctx.restore(); } };
    }
    if (k === "emoji") {
      const size = it.size || 160;
      return { bbox: [it.x, it.y, size * 1.15, size * 1.15], pen(p) { return [it.x + size * 0.58, it.y + size * 0.58]; },
        draw(ctx, p) { const e = io(p), sc = 0.4 + 0.6 * (e + (p > 0.6 ? 0.08 * Math.sin((p - 0.6) * 9) * (1 - p) : 0)); ctx.save(); ctx.globalAlpha = c01(p * 2.2); ctx.translate(it.x + size * 0.58, it.y + size * 0.58); ctx.rotate((1 - e) * -0.35); ctx.scale(sc, sc); ctx.font = size + "px 'Noto Color Emoji','Apple Color Emoji','Segoe UI Emoji',sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(it.char || "🙂", 0, 0); ctx.restore(); } };
    }
    return { bbox: [it.x || 0, it.y || 0, 10, 10], pen: () => [it.x || 0, it.y || 0], draw() {} };
  }
  const BCACHE = new WeakMap();
  function built(it, P, A, ctx) {
    const sig = JSON.stringify(it) + P.font; let b = BCACHE.get(it);
    if (!b || b.sig !== sig) { b = { sig, g: build(it, P, A, ctx) }; BCACHE.set(it, b); }
    return b.g;
  }

  // ---------- timeline ----------
  const COMPLEX = { icon: 0.9, figure: 1.7, shape: 0.8, arrow: 0.7, pie: 2.2, image: 1.2, narrator: 1.6, emoji: 0.6, tag: 0.9, text: 0 };
  function itemDur(it) { if (it.dur) return it.dur; if (it.type === "text" || it.type === "tag") return clamp(String(it.text || "").length * 0.075, 0.6, 5); return COMPLEX[it.type] || 1; }
  // gives every item {t0,t1} relative to the scene's body start (= when the voice starts).
  // Priority: explicit start > cue (a phrase from the narration: drawing begins just before it is spoken) > next in order.
  function cueTime(s, it, nd) {
    const n = String(s.narration || ""); if (!it.cue || !n || !(nd > 0)) return null;
    const i = n.toLowerCase().indexOf(String(it.cue).toLowerCase()); if (i < 0) return null;
    return clamp((i / Math.max(1, n.length)) * nd - 0.25, 0, nd);
  }
  function layoutScene(s, narrDur, pace, flow) {
    pace = pace || 1; const items = s.items, nd = narrDur || 0, has = (it) => it.start != null && it.start !== "";
    const base = items.map((it) => (it.dur ? +it.dur : itemDur(it) / pace)), anyCue = items.some((it) => cueTime(s, it, nd) != null);
    const sum = base.reduce((a, b) => a + b, 0) + 0.15 * Math.max(0, items.length - 1);
    const avail = Math.max(nd * 0.92, 1.2), k = (items.some((i) => i.dur) || anyCue) ? 1 : (sum > 0 ? clamp(avail / sum, 0.55, 1.6) : 1);
    const out = []; let t = 0;
    items.forEach((it, i) => {
      const d = base[i] * k, c = has(it) ? null : cueTime(s, it, nd), p = out[i - 1]; let t0;
      if (has(it)) t0 = +it.start;
      else if (c != null) { if (p && !has(p.it) && p.t1 > c - 0.1) p.t1 = p.t0 + Math.max((p.t1 - p.t0) * 0.5, c - 0.1 - p.t0); t0 = Math.max(c, p ? p.t1 + 0.08 : 0); }
      else t0 = t;
      out.push({ it, t0, t1: t0 + d }); t = Math.max(t, t0 + d) + 0.15;
    });
    if (flow) out.forEach((o, i) => { if (has(o.it) || o.it.dur) return; const d = o.t1 - o.t0, nx = out[i + 1], lim = nx ? nx.t0 - 0.12 : Math.max(nd * 0.94, o.t0 + d); if (lim - o.t0 > d) o.t1 = o.t0 + Math.min(lim - o.t0, d * 2.4); });   // keep the pen busy: draw slower rather than wait
    const end = out.reduce((m, o) => Math.max(m, o.t1), 0);
    return { list: out, end };
  }
  // timeline: {scenes:[{i,s,t0,lead,body,end,lay}],total}
  function timeline(P, aud) {
    let t = 0; const out = [];
    P.scenes.forEach((s, i) => {
      const nd = (aud && aud[i]) || estDur(s), lead = s.lead != null ? +s.lead : i === 0 ? 0.35 : 0.75, lay = layoutScene(s, nd, P.pace, P.flow !== false), body = Math.max(nd + 0.35, lay.end + (s.hold == null ? 0.6 : s.hold), 1.2);
      out.push({ i, s, t0: t, lead, body, lay, nd, end: t + lead + body }); t += lead + body;
    });
    return { scenes: out, total: t + 0.4 };
  }
  const estDur = (s) => { const w = String(s.narration || "").trim().split(/\s+/).filter(Boolean).length; return w ? Math.max(1.5, w / 2.6) : 0; };

  // ---------- hand ----------
  // Default hand = the narrator's own arm + marker (baked from /assets/narrators/write-pen-side.png). A project can replace it
  // with a photo (P.hand = {src, tip:[x,y] in image pixels, rot (deg the arm is turned), scale}).
  const DEFAULT_HAND = { src: "/assets/whiteboard/hand-narrator.png", tip: [4.3, 111.2], rot: 48.5, scale: 1.7 };
  function drawHand(ctx, x, y, s, mode, A, ang, lift) {
    lift = lift || 0;
    ctx.save(); ctx.translate(x, y);
    let h = A && A.handImg, cfg = (A && A.handCfg) || DEFAULT_HAND;
    if (mode === "eraser" && A && A.eraserImg && cfg.eraser) { h = A.eraserImg; cfg = Object.assign({}, cfg, { tip: cfg.eraser.tip, rot: cfg.eraser.rot || 0, noBlock: true }); }
    if (h) {
      const k = s * (cfg.scale || 1.7) * (1 + 0.05 * lift); ctx.rotate((cfg.rot || 0) * Math.PI / 180); ctx.scale(k, k);
      ctx.shadowColor = "rgba(0,0,0," + (0.22 - 0.06 * lift) + ")"; ctx.shadowBlur = 14 + lift * 16; ctx.shadowOffsetY = 8 + lift * 16;
      ctx.drawImage(h, -cfg.tip[0], -cfg.tip[1]);
      ctx.shadowColor = "transparent";
      if (mode === "eraser" && !cfg.noBlock) { ctx.fillStyle = "#f4f4f1"; ctx.strokeStyle = "#8a8f94"; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(-6, -cfg.tip[1] + 78, 78, 46, 8); ctx.fill(); ctx.stroke(); ctx.fillStyle = "#3b82c4"; ctx.fillRect(44, -cfg.tip[1] + 78, 20, 46); }
      ctx.restore(); return;
    }
    ctx.scale(s * 0.62, s * 0.62); ctx.rotate(ang || 0);
    const skin = "#f2c9a6", shade = "#d9a77f", line = "#a8754f";
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(60, -40); ctx.bezierCurveTo(120, -70, 230, -20, 330, 70); ctx.lineTo(420, 190); ctx.lineTo(250, 250); ctx.bezierCurveTo(170, 200, 110, 120, 60, 60); ctx.closePath();
    ctx.fillStyle = skin; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = line; ctx.stroke();
    if (mode === "pen") {
      ctx.save(); ctx.rotate(-0.62); ctx.fillStyle = "#6b7077"; ctx.strokeStyle = "#2c2f33"; ctx.lineWidth = 3; ctx.beginPath(); ctx.roundRect(8, -10, 210, 20, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#1c1c1c"; ctx.beginPath(); ctx.moveTo(8, -9); ctx.lineTo(-6, -3); ctx.lineTo(-6, 3); ctx.lineTo(8, 9); ctx.closePath(); ctx.fill(); ctx.fillStyle = "#cfd3d8"; ctx.fillRect(150, -10, 14, 20); ctx.restore();
    } else { ctx.save(); ctx.rotate(-0.25); ctx.fillStyle = "#f4f4f1"; ctx.strokeStyle = "#8a8f94"; ctx.lineWidth = 3; ctx.beginPath(); ctx.roundRect(-10, -34, 130, 68, 12); ctx.fill(); ctx.stroke(); ctx.fillStyle = "#3b82c4"; ctx.fillRect(70, -34, 40, 68); ctx.restore(); }
    ctx.fillStyle = skin; ctx.strokeStyle = line; ctx.lineWidth = 3;
    const fg = (cx, cy, rx, ry, a) => { ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, a, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); };
    fg(78, 2, 52, 22, -0.45); fg(104, 30, 48, 20, -0.35); fg(66, -22, 40, 17, -0.75); fg(124, 58, 40, 17, -0.2);
    ctx.restore();
  }

  // ---------- frame ----------
  function paper(ctx, P, W, H) {
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, W, H);
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75); g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(60,50,30,0.07)"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  function drawItems(ctx, P, A, sc, lt, upTo) {
    for (const o of sc.lay.list) { const p = upTo ? 1 : c01((lt - o.t0) / Math.max(0.01, o.t1 - o.t0)); if (p <= 0) continue; built(o.it, P, A, ctx).draw(ctx, io(p) * 0.35 + p * 0.65); }
  }
  function penAt(sc, P, A, ctx, lt) {
    const L = sc.lay.list; if (!L.length) return null;
    const pos = (o, p) => built(o.it, P, A, ctx).pen(io(p) * 0.35 + p * 0.65), OFF = [820, 620];
    let act = null; for (const o of L) if (lt >= o.t0 && lt < o.t1) act = o;          // the item that started last is the one being drawn
    if (act) { const q = pos(act, (lt - act.t0) / (act.t1 - act.t0)); return { xy: [q[0] + Math.sin(lt * 43) * 1.6, q[1] + Math.cos(lt * 37) * 1.6], lift: 0 }; }
    let prev = null, next = null; for (const o of L) { if (o.t1 <= lt && (!prev || o.t1 > prev.t1)) prev = o; if (o.t0 > lt && (!next || o.t0 < next.t0)) next = o; }
    if (!prev) { const s0 = pos(next, 0), f = c01(1 - (next.t0 - lt) / 0.5); return { xy: [lerp(s0[0] + OFF[0], s0[0], out3(f)), lerp(s0[1] + OFF[1], s0[1], out3(f))], lift: 1 - f }; }
    if (!next) { const e = pos(prev, 1), f = c01((lt - prev.t1 - 0.3) / 0.55); if (f >= 1) return null; return { xy: [lerp(e[0], e[0] + OFF[0], io(f)), lerp(e[1], e[1] + OFF[1], io(f))], lift: f }; }
    const e = pos(prev, 1), s2 = pos(next, 0), dist = Math.hypot(s2[0] - e[0], s2[1] - e[1]), tt = clamp(dist / 2200, 0.2, 0.6), tm = Math.max(prev.t1 + 0.05, next.t0 - tt), f = c01((lt - tm) / Math.max(0.12, next.t0 - tm));
    if (next.t0 - prev.t1 > 0.9) {   // long wait: the hand leaves the board instead of hovering, then comes back
      const fo = c01((lt - prev.t1 - 0.15) / 0.4), fi = c01(1 - (next.t0 - lt) / 0.5);
      if (fo >= 1 && fi <= 0) return null;
      if (fi > 0) return { xy: [lerp(s2[0] + OFF[0], s2[0], out3(fi)), lerp(s2[1] + OFF[1], s2[1], out3(fi))], lift: 1 - fi };
      return { xy: [lerp(e[0], e[0] + OFF[0], io(fo)), lerp(e[1], e[1] + OFF[1], io(fo))], lift: fo };
    }
    if (lt < tm) return { xy: e, lift: 0.1 };
    const arc = Math.sin(f * Math.PI) * Math.min(70, dist * 0.12);                   // the pen lifts off the board while travelling
    return { xy: [lerp(e[0], s2[0], io(f)), lerp(e[1], s2[1], io(f)) - arc], lift: Math.sin(f * Math.PI) };
  }
  function draw(ctx, P, t, A) {
    A = A || {}; const sz = size(P), W = ctx.canvas.width, H = ctx.canvas.height, k = W / sz.w; ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); paper(ctx, P, W, H); ctx.scale(k, k);
    const tl = A.tl || timeline(P, A.aud); if (!tl.scenes.length) { ctx.font = fontStr(P, 60); ctx.fillStyle = "#999"; ctx.textAlign = "center"; ctx.fillText("Add a scene to start", sz.w / 2, sz.h / 2); ctx.restore(); return; }
    t = clamp(t, 0, tl.total - 0.001); let sc = tl.scenes[tl.scenes.length - 1]; for (const s of tl.scenes) if (t < s.end) { sc = s; break; }
    const lt = t - sc.t0, hs = sz.h / 900, hand = A.hand !== false;
    let handPos = null, eraser = null;
    if (sc.i > 0 && lt < sc.lead) {   // eraser wipe over the previous board
      const prev = tl.scenes[sc.i - 1]; drawItems(ctx, P, A, prev, 0, true); const f = io(lt / sc.lead), wx = -300 + (sz.w + 600) * f;
      ctx.save(); ctx.fillStyle = P.bg; ctx.beginPath(); ctx.moveTo(-10, -10); ctx.lineTo(wx, -10); ctx.lineTo(wx - 140, sz.h + 10); ctx.lineTo(-10, sz.h + 10); ctx.closePath(); ctx.fill(); ctx.restore();
      eraser = [wx - 70 + Math.sin(f * 14) * 80, sz.h * 0.5 + Math.sin(f * 9) * sz.h * 0.35];
    } else {
      const bt = lt - sc.lead; drawItems(ctx, P, A, sc, bt, false); if (hand) { const pa = penAt(sc, P, A, ctx, bt); if (pa) handPos = pa; }
    }
    if (eraser) drawHand(ctx, eraser[0], eraser[1], hs, "eraser", A, 0);
    else if (handPos) drawHand(ctx, handPos.xy[0], handPos.xy[1], hs, "pen", A, 0, handPos.lift);
    // logo badge: the project's real logo (round) or initials
    if (P.badge || P.logo) { const r = 38 * hs, bx = sz.w - 62 * hs, by = sz.h - 62 * hs; ctx.save(); ctx.beginPath(); ctx.arc(bx, by, r + 4 * hs, 0, Math.PI * 2); ctx.fillStyle = "#fff"; ctx.fill(); ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2); ctx.clip();
      if (A.logoImg) ctx.drawImage(A.logoImg, bx - r, by - r, r * 2, r * 2); else { ctx.fillStyle = "#5b5b5b"; ctx.fillRect(bx - r, by - r, r * 2, r * 2); ctx.fillStyle = "#fff"; ctx.font = fontStr(P, 26 * hs); ctx.textAlign = "center"; ctx.fillText(P.badge, bx, by + 9 * hs); } ctx.restore(); }
    if (P.handle) { ctx.save(); ctx.globalAlpha = 0.55; ctx.font = fontStr(P, 26 * hs); ctx.fillStyle = P.ink; ctx.textAlign = "left"; ctx.fillText(P.handle, 28 * hs, sz.h - 26 * hs); ctx.restore(); }
    ctx.restore();
  }

  // ---------- assets ----------
  const PACKS = {}; const loadPack = (n, url) => { if (!PACKS[n]) PACKS[n] = fetch(url).then((r) => r.json()).catch(() => ({})); return PACKS[n]; };
  const loadIcons = () => loadPack("tabler", "/assets/whiteboard/tabler-outline.json"), loadLucide = () => loadPack("lucide", "/assets/whiteboard/lucide.json");
  async function loadFonts() {
    try { const a = new FontFace("WBMarker", "url(/assets/whiteboard/fonts/marker.woff2)"), b = new FontFace("WBHand", "url(/assets/whiteboard/fonts/hand.woff2)"); await Promise.all([a.load(), b.load()]); document.fonts.add(a); document.fonts.add(b); } catch (e) {}
  }
  const loadImg = (src) => new Promise((res) => { const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
  async function loadAssets(P, extra) {
    const needLucide = P.scenes.some((s) => s.items.some((it) => it.pack === "lucide"));
    const op = (extra && extra.onprog) || (() => {}); let step = 0; const tot = 3 + P.scenes.reduce((n, s) => n + s.items.filter((it) => it.type === "narrator" || it.type === "image").length, 0); const tick = (m) => op(Math.min(1, ++step / tot), m);
    op(0, "Loading icons and fonts..."); const [icons, lucide] = await Promise.all([loadIcons(), needLucide ? loadLucide() : Promise.resolve({}), loadFonts()]); tick("Loading pictures..."); const imgs = (extra && extra.imgs) || {};
    for (const s of P.scenes) for (const it of s.items) { const src = it.type === "narrator" ? "/assets/narrators/" + (it.pose || "neutral") + ".png" : it.type === "image" ? it.src : null; if (src && !imgs[src]) imgs[src] = await loadImg(src); if (src) tick("Loading pictures..."); }
    const hc = P.hand && P.hand.src ? P.hand : DEFAULT_HAND, handImg = await loadImg(hc.src), logoImg = P.logo ? await loadImg(P.logo) : null, eraserImg = hc.eraser && hc.eraser.src ? await loadImg(hc.eraser.src) : null;
    tick("Ready"); return Object.assign({ icons, lucide, imgs, aud: [], handImg, handCfg: hc, logoImg, eraserImg }, extra || {}, { imgs });
  }

  // ---------- MP4 export (WebCodecs + mp4-muxer) ----------
  async function exportMP4(P, A, audioBuf, opts) {
    opts = opts || {}; const FPS = P.fps === 60 ? 60 : 30, sz = size(P), px = opts.px || sz.px, W = px[0], H = px[1], tl = timeline(P, A.aud); A.tl = tl;
    if (typeof VideoEncoder === "undefined" || typeof Mp4Muxer === "undefined") throw new Error("This browser can't export MP4 directly. Use Chrome, Edge or a recent Android Chrome.");
    let vc = null; for (const codec of ["avc1.640033", "avc1.640032", "avc1.4d0032", "avc1.42003e", "avc1.42001f"]) { try { const c = { codec, width: W, height: H, bitrate: 6e6, framerate: FPS }; if ((await VideoEncoder.isConfigSupported(c)).supported) { vc = { cfg: c, mux: "avc" }; break; } } catch (e) {} }
    if (!vc) throw new Error("No video encoder for " + W + "x" + H + " here.");
    let ac = null; const sr = audioBuf ? audioBuf.sampleRate : 48000;
    if (audioBuf) for (const [codec, mux] of [["mp4a.40.2", "aac"], ["opus", "opus"]]) { try { const c = { codec, sampleRate: sr, numberOfChannels: 2, bitrate: 128000 }; if ((await AudioEncoder.isConfigSupported(c)).supported) { ac = { cfg: c, mux }; break; } } catch (e) {} }
    const target = new Mp4Muxer.ArrayBufferTarget(), mux = new Mp4Muxer.Muxer({ target, fastStart: "in-memory", video: { codec: vc.mux, width: W, height: H, frameRate: FPS }, audio: ac ? { codec: ac.mux, numberOfChannels: 2, sampleRate: sr } : undefined });
    let err = null; const venc = new VideoEncoder({ output: (c, m) => mux.addVideoChunk(c, m), error: (e) => (err = e) }); venc.configure(vc.cfg);
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H; const ctx = cv.getContext("2d"), N = Math.ceil(tl.total * FPS);
    for (let i = 0; i < N; i++) {
      if (opts.signal && opts.signal.aborted) { try { venc.close(); } catch (e) {} throw new Error("Cancelled"); } if (err) throw err;
      draw(ctx, P, i / FPS, A); const f = new VideoFrame(cv, { timestamp: Math.round((i * 1e6) / FPS), duration: Math.round(1e6 / FPS) }); venc.encode(f, { keyFrame: i % (FPS * 2) === 0 }); f.close();
      while (venc.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 4)); if (i % 6 === 0) { opts.onProgress && opts.onProgress((i / N) * (ac ? 0.9 : 1)); await new Promise((r) => setTimeout(r)); }
    }
    await venc.flush(); venc.close();
    if (ac) { const aenc = new AudioEncoder({ output: (c, m) => mux.addAudioChunk(c, m), error: (e) => (err = e) }); aenc.configure(ac.cfg); const L = audioBuf.getChannelData(0), Rr = audioBuf.numberOfChannels > 1 ? audioBuf.getChannelData(1) : L, frames = Math.min(audioBuf.length, Math.ceil(tl.total * sr));
      for (let o = 0; o < frames; o += 4800) { const n = Math.min(4800, frames - o), d = new Float32Array(n * 2); d.set(L.subarray(o, o + n), 0); d.set(Rr.subarray(o, o + n), n); const ad = new AudioData({ format: "f32-planar", sampleRate: sr, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((o * 1e6) / sr), data: d }); aenc.encode(ad); ad.close(); while (aenc.encodeQueueSize > 16) await new Promise((r) => setTimeout(r, 4)); }
      await aenc.flush(); aenc.close(); }
    if (err) throw err; mux.finalize(); opts.onProgress && opts.onProgress(1); return new Blob([target.buffer], { type: "video/mp4" });
  }

  window.EO_WB = { FORMATS, FONTS, POSES, newProject, newScene, newId, size, timeline, layoutScene, draw, build: built, drawHand, loadAssets, loadIcons, loadLucide, loadFonts, loadImg, DEFAULT_HAND, exportMP4, estDur, itemDur, figurePaths };
})();
