// ============================================================
// Video engine (EO_VID): a deterministic canvas renderer. draw(ctx, project, t, assets) paints exactly
// the frame at time t, so the same code drives the live preview AND the frame-by-frame MP4 export.
// Works for any shape (9:16 shorts, 1:1, 4:5, 16:9): layouts read the canvas size and adapt.
// ============================================================
(function () {
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const c01 = (x) => clamp(x, 0, 1);
  const lerp = (a, b, t) => a + (b - a) * t;
  const EXT = { bg: {}, icons: {}, iconLabels: {} };
  const MT = (ctx, t) => ctx.measureText(String(t).replace(/\*\*/g, "")).width;
  const R = (i, k) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };
  const TXT = { type: 1, words: 1, scramble: 1, letters: 1 };
  const out3 = (x) => 1 - Math.pow(1 - c01(x), 3);
  const out5 = (x) => 1 - Math.pow(1 - c01(x), 5);
  const back = (x) => { x = c01(x); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
  const spring = (x) => { x = c01(x); if (x >= 1) return 1; const z = 0.55, w = 11, wd = w * Math.sqrt(1 - z * z); return 1 - Math.exp(-z * w * x) * (Math.cos(wd * x) + ((z * w) / wd) * Math.sin(wd * x)); };
  const lin = (x) => x;
  const io = (x) => { x = c01(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };

  const FORMATS = {
    short: { label: "Shorts / Reels / TikTok · 9:16", w: 1080, h: 1920 },
    portrait: { label: "Portrait post · 4:5", w: 1080, h: 1350 },
    square: { label: "Square post · 1:1", w: 1080, h: 1080 },
    wide: { label: "YouTube / landscape · 16:9", w: 1920, h: 1080 },
  };
  // [name, bg1, bg2, accent, text, panel, accent2]
  const THEMES = [
    ["Teal stage", "#08403f", "#12898a", "#f2a33a", "#ffffff", "#0b3b3a", "#8ff0e4"],
    ["Ezra green", "#07100c", "#0f2a1e", "#4cf0a0", "#f2fff8", "#10201a", "#ffd166"],
    ["Ocean", "#0a1f4d", "#0b5d73", "#5fe0ff", "#f0fbff", "#0d2b5c", "#ffd166"],
    ["Forest", "#0b3d28", "#1d7a52", "#9bffc6", "#f2fff7", "#0f4a31", "#ffd166"],
    ["Plum", "#3d0b2c", "#8f1f66", "#ff9ccf", "#fff0f8", "#4d1238", "#ffe08a"],
    ["Sunset", "#3a1a00", "#b8570b", "#ffd166", "#fff8ec", "#4b2406", "#ffffff"],
    ["Crimson", "#3a0710", "#a5121f", "#ff9a9a", "#fff1f1", "#4d0b15", "#ffe08a"],
    ["Royal", "#1d0f4a", "#5b3fd0", "#c9b6ff", "#f6f2ff", "#27155e", "#ffd166"],
    ["Slate", "#0f172a", "#243449", "#34e0a1", "#f1f5f9", "#1a2538", "#ffd166"],
    ["Paper", "#f4efe3", "#e6dcc3", "#0d6b4f", "#16251e", "#fffaf0", "#b3541e"],
  ];
  const FONTS = {
    sans: { label: "Clean sans", stack: '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif', w: 800 },
    mono: { label: "Retro mono (site style)", stack: '"VT323", "Courier New", monospace', w: 700, scale: 1.18 },
    serif: { label: "Serif", stack: 'Georgia, "Times New Roman", serif', w: 700 },
  };
  const LAYOUTS = { title: "Title", bullets: "Bullet points", quote: "Quote / fact", number: "Big number", narrator: "Narrator speech", checklist: "Ticking checklist", chat: "Chat bubbles (WhatsApp style)", whiteboard: "Whiteboard (hand-drawn)", image: "Photo", outro: "Outro / call to action" };
  const ANIMS = { stamp: "Stamp slam", blur: "Blur in", letters: "Letter bounce", scramble: "Scramble to text", rise: "Rise up (spring)", slide: "Slide in", zoom: "Zoom in", pop: "Pop", type: "Typewriter", words: "Word by word (kinetic)" };
  const BGS = { stage: "Teal gradient + soft stage glow", plain: "Plain gradient", photo: "Photo (from scene image)" };
  const LEAD = 0.4, TAIL = 0.7;

  let sid = 0;
  const newId = () => "s" + Date.now().toString(36) + (sid++).toString(36);
  const newScene = (layout) => ({ id: newId(), layout: layout || "title", title: "", sub: "", lines: [], num: "", label: "", narration: "", dur: 0, anim: "", bg: "", pose: "", posePos: "right", qr: "", cta: "", imgKey: "", trans: "up", plate: "", doodle: "" });
  const newProject = () => ({ v: 1, name: "Untitled video", format: "short", quality: 1, theme: 0, font: "sans", anim: "rise", bg: "stage", captions: true, viz: "none", fps: 60, motion: 1, progress: true, handle: "@ezraogombo", logo: true, plate: "none", watermark: true, endscreen: true, hostSkin: "#8a5638", cover: { title: "", sub: "", pose: "", plate: "" }, end: { title: "Thanks for watching!", sub: "", cta: "Subscribe", qr: "" }, socials: [{ k: "facebook", h: "ezraogombo" }, { k: "instagram", h: "ezraogombo" }, { k: "youtube", h: "@ezraogombo" }, { k: "tiktok", h: "@ezraogombo" }], voice: { name: "", languageCode: "", rate: 1, pitch: 0 }, music: { vol: 0.16, duck: true, src: "/assets/music/sunrise-chill.mp3" }, sfx: true, audio: "full", capStyle: "box", hook: { text: "", dur: 1.8 }, scenes: [] });

  function outSize(p) {
    const f = FORMATS[p.format] || FORMATS.short, q = Number(p.quality) || 1;
    return { w: Math.round((f.w * q) / 2) * 2, h: Math.round((f.h * q) / 2) * 2 };
  }

  // ---- timeline: scene lengths come from the narration audio when there is one
  const isVis = (p) => (p.audio === "music" || p.audio === "none") && p.design !== "same";
  function scenesOf(p) {
    const arr = p.scenes.slice(), last = arr[arr.length - 1];
    if (p.hook && p.hook.text) arr.unshift(Object.assign(newScene("hook"), { id: "__hook", title: p.hook.text, dur: Number(p.hook.dur) || 1.8, trans: "fade" }));
    if (p.endscreen !== false && !(last && last.layout === "outro")) { const e = p.end || {}; arr.push(Object.assign(newScene("outro"), { id: "__end", title: e.title || "Thanks for watching!", sub: e.sub || "", cta: e.cta || "Subscribe", qr: e.qr || "", dur: 7 })); }
    return arr;
  }

  // ---- the non-talking "visual explainer" design: no narrator, no spoken captions; progress rail, step cards, gauges
  function visSentences(txt) { return String(txt || "").replace(/\*\*/g, "").split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean); }
  function visShort(x) { x = x.replace(/[.!?]+$/, ""); const w = x.split(/\s+/); if (w.length <= 12) return x; const cut = x.search(/[,;:—]\s/); if (cut > 18 && cut < 80) return x.slice(0, cut); return w.slice(0, 10).join(" ") + "…"; }
  function visCards(s) { const ls = (s.lines || []).filter((l) => String(l).trim()); if (ls.length) return ls.map((l) => String(l).replace(/\*\*/g, "")); return visSentences(s.narration).slice(0, 3).map(visShort); }
  function visDur(s, fixed) {
    if (fixed) return Math.max(1, fixed); const n = visCards(s).length, w = String(s.title || "").split(/\s+/).length;
    switch (s.layout) { case "number": return 5.2; case "quote": return 4.4 + w / 6; case "chat": return 2.4 + 1.2 * (s.lines || []).length; case "bullets": case "checklist": case "whiteboard": return Math.max(4, 2.6 + 1.3 * n); default: return Math.max(3.8, 2.8 + 1.15 * n); }
  }
  function timeline(p, aud) {
    let t = 0;
    const list = scenesOf(p).map((s) => {
      const vis = isVis(p), a = !vis && aud && aud[s.id] && aud[s.id].narr === (s.narration || "").trim() ? aud[s.id] : null;
      const words = (s.narration || "").trim().split(/\s+/).filter(Boolean).length, fixed = Number(s.dur) > 0 ? Number(s.dur) : 0;
      const dur = a ? Math.max(1.2, a.t1 - a.t0 + LEAD + TAIL) : vis ? visDur(s, fixed) : fixed ? Math.max(1, fixed) : words ? Math.max(2.2, words / 2.8 + 1.1) : 3;
      const r = { s, a, start: t, dur, end: t + dur, lead: a ? LEAD : 0.3 };
      if (!a && words && !vis && !(p.silentCaps === false && (p.audio === "music" || p.audio === "none"))) r.fa = { t0: 0, t1: Math.max(0.8, dur - 0.3 - 0.5) };
      t += dur; return r;
    });
    list.total = t;
    return list;
  }

  // ---- text helpers
  const fstr = (P, size, w) => `${w || P.font.w} ${Math.round(size)}px ${P.font.stack}`;
  function wrap(ctx, text, maxW) {
    const out = [];
    String(text == null ? "" : text).split("\n").forEach((par) => {
      const words = par.split(/\s+/).filter(Boolean); let line = "";
      if (!words.length) { out.push(""); return; }
      words.forEach((w) => { const tr = line ? line + " " + w : w; if (!line || MT(ctx, tr) <= maxW) line = tr; else { out.push(line); line = w; } });
      out.push(line);
    });
    return out;
  }
  function fit(ctx, P, text, maxW, maxH, lo, hi, lh, weight) {
    lh = lh || 1.18;
    for (let s = hi; s >= lo; s -= 2) {
      ctx.font = fstr(P, s * (P.font.scale || 1), weight);
      const L = wrap(ctx, text, maxW);
      if (L.length * s * lh <= maxH && L.every((l) => MT(ctx, l) <= maxW * 1.002)) return { size: s, lines: L, lh };
    }
    ctx.font = fstr(P, lo * (P.font.scale || 1), weight);
    return { size: lo, lines: wrap(ctx, text, maxW), lh };
  }
  function rr(ctx, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }

  // draw wrapped lines with an entrance animation. p = 0..1 progress of this block's entrance.
  function textBlock(ctx, P, lines, x, y, size, lh, align, color, anim, p, opts) {
    opts = opts || {};
    const fs = size * (P.font.scale || 1);
    ctx.font = fstr(P, fs, opts.weight); ctx.textBaseline = "top"; ctx.textAlign = "left";
    const total = lines.join(" ").split(/\s+/).filter(Boolean).length, totalCh = lines.reduce((n, l) => n + l.length, 0);
    let wi = 0, ci = 0;
    ctx.save();
    if (opts.shadow) { ctx.shadowColor = "rgba(0,0,0,.35)"; ctx.shadowBlur = size * 0.2; ctx.shadowOffsetY = size * 0.06; }
    const st = { on: false }, em = P.em || "#ffd166";
    lines.forEach((line0, li) => {
      const line = TXT[anim] ? line0.replace(/\*\*/g, "") : line0;
      const lw = MT(ctx, line0), lx = align === "center" ? x - lw / 2 : align === "right" ? x - lw : x, ly = y + li * size * lh;
      if (anim === "type") {
        const n = Math.floor(c01(p) * totalCh) - ci; ci += line.length;
        if (n > 0) { ctx.fillStyle = color; ctx.fillText(line.slice(0, Math.min(line.length, n)), lx, ly); }
      } else if (anim === "scramble") {
        const n = Math.floor(c01(p * 1.15) * totalCh) - ci; ci += line.length; const G = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#%&?"; let out = "";
        for (let k = 0; k < line.length; k++) out += k < n || line[k] === " " ? line[k] : G[Math.floor(R(k + li * 31, Math.floor(p * 40)) * G.length)];
        ctx.fillStyle = color; ctx.fillText(out, lx, ly);
      } else if (anim === "letters") {
        let cx = lx; const L2 = line.length;
        for (let k = 0; k < L2; k++) { const cp = c01(c01(p) * (totalCh + 8) - (ci + k) * 0.9), w = ctx.measureText(line[k]).width; if (cp > 0) { ctx.save(); ctx.globalAlpha *= c01(cp * 4); ctx.fillStyle = color; ctx.fillText(line[k], cx, ly + (1 - spring(cp)) * size * 0.7); ctx.restore(); } cx += w; }
        ci += L2;
      } else if (anim === "words") {
        let cx = lx; const ws = line.split(" ");
        ws.forEach((w, k) => {
          const wp = c01(c01(p) * (total + 1.5) - wi); wi++;
          const ww = ctx.measureText(w + (k < ws.length - 1 ? " " : "")).width;
          if (wp > 0) { ctx.save(); ctx.globalAlpha *= c01(wp * 3); const sc = 0.6 + 0.4 * spring(wp); ctx.translate(cx + ww / 2, ly + size / 2 + (1 - spring(wp)) * size * 0.5); ctx.scale(sc, sc); ctx.translate(-(cx + ww / 2), -(ly + size / 2)); ctx.fillStyle = color; ctx.fillText(w, cx, ly); ctx.restore(); }
          cx += ww;
        });
      } else {
        let cx = lx; line0.split("**").forEach((part, k) => { if (k > 0) st.on = !st.on; if (!part) return; ctx.fillStyle = st.on ? em : color; ctx.fillText(part, cx, ly); cx += ctx.measureText(part).width; });
      }
    });
    ctx.restore();
  }
  // transform wrapper for block-level animations
  function withAnim(ctx, anim, p, cx, cy, u, fn) {
    ctx.save(); p = c01(p); const sp = spring(p), al = c01(p * 3);
    if (anim === "rise") { ctx.globalAlpha *= al; ctx.translate(0, (1 - sp) * 70 * u); }
    else if (anim === "slide") { ctx.globalAlpha *= al; ctx.translate(-(1 - sp) * 240 * u, 0); }
    else if (anim === "zoom") { ctx.globalAlpha *= al; const s = 0.7 + 0.3 * sp; ctx.translate(cx, cy); ctx.scale(s, s); ctx.translate(-cx, -cy); }
    else if (anim === "stamp") { ctx.globalAlpha *= c01(p * 6); const k = 1 + (1 - sp) * 1.6, shake = p > 0.55 && p < 0.8 ? Math.sin(p * 90) * 6 * u * (0.8 - p) : 0; ctx.translate(cx + shake, cy); ctx.scale(k, k); ctx.translate(-cx, -cy); }
    else if (anim === "blur") { ctx.globalAlpha *= al; if (p < 1) ctx.filter = `blur(${((1 - sp) * 18 * u).toFixed(1)}px)`; }
    else if (anim === "pop") { ctx.globalAlpha *= c01(p * 4); const s = Math.max(0.01, sp); ctx.translate(cx, cy); ctx.scale(s, s); ctx.translate(-cx, -cy); }
    else { ctx.globalAlpha *= al; }
    fn(); ctx.restore();
  }

  // ---- voice energy 0..1 at local time lt (for bars + narrator bounce)
  function envAt(a, lt, lead, off) {
    if (!a || !a.env) return 0;
    const i = Math.floor((lt - lead - (off || 0)) * 60);
    if (i < 0 || i >= a.env.length) return 0;
    return a.env[i];
  }

  // ---- captions (word highlight, timings estimated from the audio length)
  function capTimings(a, text) {
    if (a._cap && a._capText === text) return a._cap;
    const words = String(text).split(/\s+/).filter(Boolean), wts = words.map((w) => w.length + 2 + (/[.!?]$/.test(w) ? 4 : /[,;:]$/.test(w) ? 2 : 0));
    const sum = wts.reduce((x, y) => x + y, 0) || 1, span = Math.max(0.5, a.t1 - a.t0); let acc = 0;
    const tm = words.map((w, i) => { const s = (acc / sum) * span; acc += wts[i]; return { w, s, e: (acc / sum) * span }; });
    const chunks = []; let cur = [];
    tm.forEach((x) => { cur.push(x); if (cur.length >= 6 || (cur.length >= 3 && /[.!?,;:]$/.test(x.w))) { chunks.push(cur); cur = []; } });
    if (cur.length) { if (chunks.length && cur.length < 2) chunks[chunks.length - 1].push(...cur); else chunks.push(cur); }
    a._capText = text; a._cap = chunks; return chunks;
  }

  // ---- geometry
  // when is each item (card / tick / line) spoken? finds its key word in the narration timings so it appears with the voice
  const STOP = new Set("this that with from your have will then also what when into over only each they them their there here very more most some than just like make made does done".split(" "));
  function cuesFor(sc, texts, base, tail) {
    const n = texts.length, aa = sc.a || sc.fa, narr = String(sc.s.narration || "").trim().replace(/\*\*/g, ""), key = texts.join("|") + "@" + (aa ? aa.t1 : 0) + "@" + sc.dur;
    if (sc._cueK === key) return sc._cue;
    let out = new Array(n).fill(null);
    if (aa && narr) {
      const words = [].concat(...capTimings(aa, narr)), nw = words.map((w) => w.w.toLowerCase().replace(/[^a-z0-9]/g, "")); let prev = -1;
      texts.forEach((t, i) => {
        const toks = String(t).toLowerCase().replace(/\*\*/g, "").split(/[^a-z0-9]+/).filter((x) => x.length >= 3 && !STOP.has(x)); let best = -1;
        for (const tk of toks) { const stem = tk.slice(0, Math.min(5, tk.length)); for (let k = prev + 1; k < nw.length; k++) if (nw[k].startsWith(stem)) { if (best < 0 || k < best) best = k; break; } }
        if (best >= 0) { prev = best; out[i] = sc.lead + words[best].s - 0.18; }
      });
      const endT = sc.lead + Math.max(0.5, aa.t1 - aa.t0) * 0.92;
      for (let i = 0; i < n; i++) if (out[i] == null) {
        let a = i - 1; while (a >= 0 && out[a] == null) a--; let b = i + 1; while (b < n && out[b] == null) b++;
        const ta = a >= 0 ? out[a] : sc.lead - 0.1, tb = b < n ? out[b] : endT, ia = a, ib = b;
        out[i] = ta + ((tb - ta) * (i - ia)) / Math.max(1, ib - ia);
      }
      for (let i = 0; i < n; i++) { out[i] = Math.max(i ? out[i - 1] + 0.3 : 0.25, out[i]); }
    } else {
      const st = base == null ? 0.5 : base, en = Math.max(st + 0.5, sc.dur - (tail == null ? 1.0 : tail)), step = Math.max(0.45, Math.min(1.4, (en - st) / Math.max(1, n)));
      out = texts.map((_, i) => st + i * step);
    }
    sc._cueK = key; sc._cue = out; return out;
  }

  function geom(W, H, P, sc, tr) {
    const u = Math.min(W, H) / 1080, port = H / W > 1.3, wide = W / H > 1.3;
    const hasCap = P.captions && (sc.a || sc.fa);
    const g = { W, H, u, port, wide, m: Math.round(70 * u), hl: !!P.hlOn, vis: !!P.visOn };
    g.top = g.vis ? (wide ? H * 0.2 : H * 0.165) : port ? H * 0.085 : H * 0.07;
    g.capH = hasCap ? (port ? H * 0.17 : wide ? H * 0.2 : H * 0.18) : 0;
    g.capY = port ? H * 0.64 : H - g.capH - H * 0.045;
    g.bottom = g.vis ? (wide ? H * 0.88 : H * 0.86) : hasCap ? (port ? g.capY - H * 0.015 : g.capY - H * 0.02) : (port ? H * 0.79 : H * 0.9);
    g.box = { x: g.m, y: g.top, w: W - g.m * 2, h: g.bottom - g.top };
    return g;
  }

  // ---- backgrounds
  const BGC = {};
  function background(ctx, P, th, kind, t, g, sc, lt, A) {
    const { W, H } = g;
    if (kind === "stage" && !EXT.bg.stage && g.brq == null && typeof document !== "undefined") {   // the stage glow only changes slowly: draw it once per brightness step and reuse (much faster on phones)
      const q = Math.round((0.88 + 0.12 * Math.sin(t * 0.45)) * 40) / 40, key = W + "x" + H + "|" + th[0] + "|" + q; let c = BGC[key];
      if (!c) { if (Object.keys(BGC).length > 40) for (const k in BGC) delete BGC[k]; c = BGC[key] = document.createElement("canvas"); c.width = W; c.height = H; background(c.getContext("2d"), P, th, kind, t, Object.assign({}, g, { brq: q }), sc, lt, A); }
      ctx.drawImage(c, 0, 0); return;
    }
    const gr = ctx.createLinearGradient(0, 0, W * 0.4, H); gr.addColorStop(0, th[1]); gr.addColorStop(1, th[2]);
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    const light = th[0] === "Paper";
    if (kind === "photo") {
      const im = A.imgs && A.imgs[sc.s.imgKey];
      if (im) { const k = 1 + 0.1 * c01(lt / sc.dur); cover(ctx, im, W, H, k); ctx.fillStyle = "rgba(0,0,0,.45)"; ctx.fillRect(0, 0, W, H); return; }
      kind = "blobs";
    }
    if (EXT.bg[kind]) { EXT.bg[kind].draw(ctx, P, th, t, g, W, H); }
    else if (kind === "stage") {
      const br = g.brq != null ? g.brq : 0.88 + 0.12 * Math.sin(t * 0.45);
      const cone = ctx.createLinearGradient(0, 0, 0, H * 0.92); cone.addColorStop(0, hexA("#ffffff", 0.13 * br)); cone.addColorStop(1, hexA("#ffffff", 0));
      ctx.fillStyle = cone; ctx.beginPath(); ctx.moveTo(W * 0.40, 0); ctx.lineTo(W * 0.60, 0); ctx.lineTo(W * 1.02, H * 0.92); ctx.lineTo(W * -0.02, H * 0.92); ctx.closePath(); ctx.fill();
      const top = ctx.createRadialGradient(W / 2, -H * 0.04, 0, W / 2, H * 0.06, Math.max(W, H) * 0.78); top.addColorStop(0, hexA("#ffffff", 0.28 * br)); top.addColorStop(0.45, hexA(th[6], 0.10 * br)); top.addColorStop(1, hexA(th[6], 0));
      ctx.fillStyle = top; ctx.fillRect(0, 0, W, H);
      const low = ctx.createRadialGradient(W * 0.85, H * 0.95, 0, W * 0.85, H * 0.95, Math.max(W, H) * 0.55); low.addColorStop(0, hexA(th[3], 0.10)); low.addColorStop(1, hexA(th[3], 0)); ctx.fillStyle = low; ctx.fillRect(0, 0, W, H);
    } else if (kind === "blobs") {
      const cols = [th[3], th[6], th[3]];
      for (let i = 0; i < 3; i++) {
        const r = Math.max(W, H) * (0.45 + 0.1 * Math.sin(t * 0.5 + i)), x = W * (0.5 + 0.45 * Math.sin(t * 0.23 + i * 2.1)), y = H * (0.5 + 0.45 * Math.cos(t * 0.19 + i * 1.7));
        const rg = ctx.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, hexA(cols[i], light ? 0.22 : 0.20)); rg.addColorStop(1, hexA(cols[i], 0));
        ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
      }
    } else if (kind === "kitenge") {
      const cell = 230 * g.u, off = (t * 14 * g.u) % cell, cols = [th[3], th[6], th[4]];
      ctx.save(); ctx.globalAlpha = light ? 0.16 : 0.13;
      for (let cy = -cell + off; cy < H + cell; cy += cell) for (let cx = -cell + off; cx < W + cell; cx += cell) {
        const alt = (Math.round((cx - off) / cell) + Math.round((cy - off) / cell)) & 1, mx = cx + cell / 2, my = cy + cell / 2;
        for (let r = 5; r >= 1; r--) { ctx.fillStyle = cols[(r + alt) % 3]; ctx.beginPath(); ctx.arc(mx, my, (cell * 0.46 * r) / 5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = r % 2 ? th[1] : th[2]; ctx.beginPath(); ctx.arc(mx, my, (cell * 0.46 * (r - 0.55)) / 5, 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = cols[1 - alt]; ctx.beginPath(); ctx.moveTo(cx, my); ctx.lineTo(mx, cy); ctx.lineTo(cx + cell, my); ctx.lineTo(mx, cy + cell); ctx.closePath(); ctx.globalAlpha *= 0.4; ctx.fill(); ctx.globalAlpha = light ? 0.16 : 0.13;
      }
      ctx.restore();
    } else if (kind === "shuka") {
      const w = 130 * g.u, off = (t * 16 * g.u) % (w * 2); ctx.save(); ctx.globalAlpha = 0.2;
      for (let x = -w * 2 + off; x < W + w; x += w * 2) { ctx.fillStyle = "#c1121f"; ctx.fillRect(x, 0, w, H); ctx.fillStyle = "#1d3557"; ctx.fillRect(x + w * 0.9, 0, w * 0.2, H); }
      for (let y = -w * 2 + off; y < H + w; y += w * 2) { ctx.fillStyle = "#c1121f"; ctx.fillRect(0, y, W, w * 0.6); ctx.fillStyle = "#f1faee"; ctx.fillRect(0, y + w * 0.7, W, w * 0.07); ctx.fillStyle = "#1d3557"; ctx.fillRect(0, y + w, W, w * 0.4); }
      ctx.restore();
    } else if (kind === "aurora") {
      ctx.save(); ctx.globalCompositeOperation = "screen";
      for (let i = 0; i < 4; i++) { const cx = W * (0.5 + 0.4 * Math.sin(t * 0.25 + i * 1.7)), cy = H * (0.28 + 0.16 * Math.sin(t * 0.31 + i * 2.3) + i * 0.14); ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.sin(t * 0.2 + i) * 0.35); ctx.scale(2.6, 0.55); const r = Math.max(W, H) * 0.34, rg = ctx.createRadialGradient(0, 0, 0, 0, 0, r); rg.addColorStop(0, hexA([th[3], th[6], "#7c5cff", th[3]][i], 0.34)); rg.addColorStop(1, hexA(th[3], 0)); ctx.fillStyle = rg; ctx.fillRect(-r, -r, r * 2, r * 2); ctx.restore(); }
      ctx.restore();
    } else if (kind === "particles") {
      ctx.save(); for (let i = 0; i < 70; i++) { const sp = 24 + R(i, 1) * 60, x = ((R(i, 2) * W + Math.sin(t * 0.6 + i) * 30 * g.u) % W + W) % W, y = H - ((R(i, 3) * H + t * sp * g.u) % H), r = (3 + R(i, 4) * 9) * g.u; ctx.globalAlpha = 0.12 + R(i, 5) * 0.35; ctx.fillStyle = i % 3 ? th[3] : th[6]; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); } ctx.restore();
    } else if (kind === "stars") {
      ctx.save(); for (let i = 0; i < 140; i++) { const x = R(i, 1) * W, y = R(i, 2) * H, tw = 0.5 + 0.5 * Math.sin(t * (1 + R(i, 3) * 3) + i), r = (1 + R(i, 4) * 2.6) * g.u; ctx.globalAlpha = 0.2 + 0.7 * tw * R(i, 5); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x, y - ((t * 6 * g.u * R(i, 4)) % 40), r, 0, Math.PI * 2); ctx.fill(); } ctx.restore();
    } else if (kind === "grid") {
      const s = 90 * g.u, off = (t * 18 * g.u) % s; ctx.strokeStyle = hexA(th[3], light ? 0.12 : 0.1); ctx.lineWidth = 2 * g.u; ctx.beginPath();
      for (let x = -s + off; x < W + s; x += s) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
      for (let y = -s + off; y < H + s; y += s) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
      ctx.stroke();
    } else if (kind === "stripes") {
      ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(-0.5); const s = 120 * g.u, off = (t * 30 * g.u) % (s * 2); ctx.fillStyle = hexA(th[3], light ? 0.07 : 0.06);
      for (let x = -Math.max(W, H) * 1.2 + off; x < Math.max(W, H) * 1.2; x += s * 2) ctx.fillRect(x, -Math.max(W, H) * 1.2, s, Math.max(W, H) * 2.4);
      ctx.restore();
    } else if (kind === "rings") {
      ctx.strokeStyle = hexA(th[3], 0.18); ctx.lineWidth = 3 * g.u;
      for (let i = 0; i < 5; i++) { const ph = ((t * 0.18 + i / 5) % 1), r = ph * Math.max(W, H) * 0.8; ctx.globalAlpha = 1 - ph; ctx.beginPath(); ctx.arc(W / 2, H * 0.42, r, 0, Math.PI * 2); ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
    // soft vignette
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.8); vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, light ? "rgba(0,0,0,.10)" : "rgba(0,0,0,.35)");
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  }
  function cover(ctx, im, W, H, k, ox) {
    const iw = im.naturalWidth || im.width, ih = im.naturalHeight || im.height, s = Math.max(W / iw, H / ih) * (k || 1);
    ctx.drawImage(im, (W - iw * s) / 2 + (ox || 0), (H - ih * s) / 2, iw * s, ih * s);
  }
  function contain(ctx, im, x, y, w, h) {
    const iw = im.naturalWidth || im.width, ih = im.naturalHeight || im.height, s = Math.min(w / iw, h / ih), dw = iw * s, dh = ih * s;
    ctx.drawImage(im, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh); return { x: x + (w - dw) / 2, y: y + (h - dh) / 2, w: dw, h: dh };
  }

  // ---- narrator: sits on a shape (soap bubble, blob, circle, contact card) so it never floats; head pops out of the top
  function poseBox(g, sc) {
    const s = sc.s; if (g.vis) return null; if (!s.pose && !(g.hl && s.icon)) return null; const big = sc.big || 1; let w, h;
    if (g.port) { h = g.H * 0.32 * big; w = h * 0.8; } else { w = Math.min(g.W * 0.3, g.H * 0.62) * big; h = w * 1.2; }
    const x = s.posePos === "left" ? g.m : s.posePos === "center" ? (g.W - w) / 2 : g.W - g.m - w;
    return { w, h, x, y: g.bottom - h + (!g.port && g.wide ? g.H * 0.02 : 0) };
  }
  function blobPath(ctx, cx, cy, R, t) {
    ctx.beginPath();
    for (let i = 0; i <= 48; i++) { const a = (i / 48) * Math.PI * 2, r = R * (1 + 0.07 * Math.sin(3 * a + t * 1.3) + 0.045 * Math.sin(5 * a - t * 1.7)), x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.closePath();
  }
  function plateShape(ctx, kind, cx, cy, R, t, e) {
    if (kind === "card") rr(ctx, cx - R * 1.05, cy - R * 0.2, R * 2.1, R * 1.25, R * 0.22);
    else if (kind === "blob") blobPath(ctx, cx, cy, R * 1.04, t);
    else { ctx.beginPath(); ctx.arc(cx, cy, R * (1 + 0.012 * Math.sin(t * 2.1) + e * 0.035), 0, Math.PI * 2); }
  }

  // narrator motion: pulses on every spoken word, changes gesture each sentence
  const GEST = ["hand-on-chest", "point-at-you", "open-hands", "point-up-one", "palms-up", "ok-sign"];
  function talkState(sc, lt) {
    const aa = sc.a || sc.fa, narr = String(sc.s.narration || "").trim(); if (!aa || !narr) return { pulse: 0, sent: 0, sentT: -9, wi: 0 };
    const words = [].concat(...capTimings(aa, narr.replace(/\*\*/g, ""))), rt = lt - sc.lead; let wi = -1, sent = 0, sentT = -9, cur = 0;
    for (let i = 0; i < words.length; i++) { if (words[i].s <= rt) { wi = i; if (i === 0 || /[.!?]$/.test(words[i - 1].w)) { sent = cur; sentT = words[i].s; } if (/[.!?]$/.test(words[i].w)) cur++; } }
    if (wi >= 0) { let c2 = 0; for (let i = 0; i <= wi; i++) { if (i === 0 || /[.!?]$/.test(words[i - 1].w)) { sentT = words[i].s; sent = c2; } if (/[.!?]$/.test(words[i].w)) c2++; } }
    const spoken = wi >= 0 && rt <= aa.t1 - aa.t0 + 0.15, pulse = spoken ? Math.exp(-(rt - words[wi].s) * 7) : 0;
    return { pulse, sent: Math.max(0, sent), sentT: rt - sentT, wi: Math.max(0, wi) };
  }
  function drawPose(ctx, g, sc, lt, t, A, th, P) {
    if (g.hl) { drawIconSlot(ctx, g, sc, lt, t, th); return; }
    const s = sc.s, pb = poseBox(g, sc), host = s.pose === "host", im = !host && pb && A.poses && A.poses[s.pose]; if (!pb || (!host && !im)) return;
    const kind = s.plate || (P && P.plate) || "none", u = g.u;
    const ts = talkState(sc, lt), e = 0, enter = spring((lt - 0.12) / 0.7), bob = Math.sin(t * 1.9) * 7 * u + ts.pulse * 16 * u, sway = Math.sin(t * 1.15) * 0.022 + ts.pulse * 0.03 * (ts.wi % 2 ? 1 : -1), breathe = 1 + 0.014 * Math.sin(t * 2.3) + ts.pulse * 0.03;
    ctx.save(); ctx.globalAlpha *= out3((lt - 0.1) / 0.4);
    const cx = pb.x + pb.w / 2, cyb = pb.y + pb.h, R = pb.w * 0.5, pcy = cyb - R * 0.92;
    ctx.translate(cx, cyb + (1 - enter) * pb.h * 0.5 - bob); ctx.rotate(sway + (1 - enter) * -0.12); ctx.scale(1 / breathe * (1 + ts.pulse * 0.012), breathe * (0.85 + 0.15 * Math.min(1.1, enter))); ctx.translate(-cx, -cyb);
    // the shape behind
    if (kind !== "none") {
      ctx.save(); ctx.shadowColor = "rgba(0,0,0,.35)"; ctx.shadowBlur = 26 * u; ctx.shadowOffsetY = 10 * u;
      plateShape(ctx, kind, cx, pcy, R, t, e);
      if (kind === "soap") { const gr = ctx.createRadialGradient(cx - R * 0.3, pcy - R * 0.35, R * 0.1, cx, pcy, R); gr.addColorStop(0, "rgba(255,255,255,.30)"); gr.addColorStop(0.7, hexA(th[3], 0.18)); gr.addColorStop(1, hexA(th[6], 0.38)); ctx.fillStyle = gr; }
      else if (kind === "blob") { const gr = ctx.createLinearGradient(cx - R, pcy - R, cx + R, pcy + R); gr.addColorStop(0, th[3]); gr.addColorStop(1, th[6]); ctx.fillStyle = gr; }
      else ctx.fillStyle = th[5];
      ctx.fill(); ctx.restore();
    }
    // the narrator, cut to the shape from the waist down, head free above
    ctx.save();
    if (kind !== "none") { plateShape(ctx, kind, cx, pcy, R, t, e); ctx.rect(pb.x - pb.w * 0.15, pb.y - pb.h * 0.15, pb.w * 1.3, pcy - (pb.y - pb.h * 0.15)); ctx.clip(); }
    if (host) drawHost(ctx, pb, e, t, th, P, u);
    else {
      if (kind === "none") { ctx.shadowColor = "rgba(0,0,0,.4)"; ctx.shadowBlur = 24 * u; ctx.shadowOffsetY = 8 * u; }
      const fig = (img, al) => { const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height, r = Math.min(pb.w / iw, pb.h / ih), dw = iw * r, dh = ih * r; ctx.save(); ctx.globalAlpha *= al; ctx.drawImage(img, pb.x + (pb.w - dw) / 2, pb.y + pb.h - dh, dw, dh); ctx.restore(); };
      const gl = GEST.filter((n) => n !== s.pose && A.poses && A.poses[n]); let alt = null;
      if (gl.length && s.narration && (sc.a || sc.fa) && s.gestures !== false && s.layout !== "whiteboard") { const h = String(s.id).split("").reduce((a, c2) => a + c2.charCodeAt(0), 0); alt = (k2) => A.poses[gl[(h + k2) % gl.length]]; }
      if (!alt) fig(im, 1); else { const k2 = ts.sent, kf = c01(ts.sentT / 0.28), curI = k2 % 2 ? alt(k2) : im, prevI = k2 === 0 ? im : ((k2 - 1) % 2 ? alt(k2 - 1) : im); if (kf < 1 && prevI !== curI) { fig(prevI, 1 - kf); fig(curI, kf); } else fig(curI, 1); }
    }
    ctx.restore();
    // front decoration
    if (kind === "soap") {
      plateShape(ctx, kind, cx, pcy, R, t, e);
      if (ctx.createConicGradient) { const cg = ctx.createConicGradient(t * 0.4, cx, pcy); [[0, "#ff9ccf"], [0.25, "#8be9ff"], [0.5, "#fff3a0"], [0.75, "#c9a7ff"], [1, "#ff9ccf"]].forEach(([o, c]) => cg.addColorStop(o, c)); ctx.strokeStyle = cg; } else ctx.strokeStyle = "rgba(255,255,255,.7)";
      ctx.lineWidth = 6 * u; ctx.globalAlpha *= 0.85; ctx.stroke(); ctx.globalAlpha = 1;
      ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.lineWidth = 9 * u; ctx.lineCap = "round"; ctx.beginPath(); ctx.arc(cx, pcy, R * 0.86, Math.PI * 1.08, Math.PI * 1.34); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, pcy, R * 0.86, Math.PI * 1.42, Math.PI * 1.46); ctx.stroke();
    } else if (kind === "card") {
      plateShape(ctx, kind, cx, pcy, R, t, e); ctx.strokeStyle = th[3]; ctx.lineWidth = 5 * u; ctx.stroke();
      const rh = R * 0.36, rx = cx - R * 1.05, ry = pcy - R * 0.2 + R * 1.25 - rh;
      ctx.save(); rr(ctx, rx, ry, R * 2.1, rh, R * 0.22); ctx.clip(); ctx.fillStyle = "#e11d2e"; ctx.fillRect(rx, ry, R * 2.1, rh); ctx.restore();
      ctx.fillStyle = "#fff"; ctx.beginPath(); const tx = rx + R * 0.22, ty = ry + rh / 2, ts = rh * 0.26; ctx.moveTo(tx - ts * 0.6, ty - ts); ctx.lineTo(tx + ts, ty); ctx.lineTo(tx - ts * 0.6, ty + ts); ctx.closePath(); ctx.fill();
      ctx.font = `800 ${Math.round(rh * 0.42)}px ${(P && P.font && P.font.stack) || "sans-serif"}`; ctx.textBaseline = "middle"; ctx.textAlign = "left"; ctx.fillText(((P && P.handle) || "@ezraogombo").slice(0, 22), tx + ts * 1.7, ty + 1); ctx.textAlign = "left";
    } else if (kind === "circle" || kind === "blob") {
      plateShape(ctx, kind, cx, pcy, R, t, e); ctx.strokeStyle = kind === "blob" ? "#fff" : th[3]; ctx.lineWidth = (kind === "blob" ? 6 : 8) * u; ctx.stroke();
    }
    ctx.restore();
  }
  function contentBox(g, sc) {
    const b = Object.assign({}, g.box), pb = poseBox(g, sc);
    if (pb && sc.s.posePos !== "center") { if (g.port) b.h -= pb.h * 0.95; else { b.w -= pb.w + g.m * 0.5; if (sc.s.posePos === "left") b.x += pb.w + g.m * 0.5; } }
    return b;
  }

  // ---- illustrations (used instead of the narrator in the non-talking, human-less version)
  const ICON_KEYS = { bulb: "Idea (light bulb)", book: "Book", heart: "Heart", shield: "Shield", clock: "Clock", chart: "Chart", star: "Star", question: "Question", check: "Tick" };
  const ICONS = {
    bulb(ctx, c, r, lt, th) { ctx.fillStyle = th[6]; ctx.beginPath(); ctx.arc(c.x, c.y - r * 0.12, r * 0.55, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "rgba(255,255,255,.55)"; ctx.beginPath(); ctx.ellipse(c.x - r * 0.2, c.y - r * 0.3, r * 0.14, r * 0.22, -0.5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "#cfd8dc"; rr(ctx, c.x - r * 0.28, c.y + r * 0.42, r * 0.56, r * 0.36, r * 0.08); ctx.fill(); ctx.fillStyle = "#90a4ae"; rr(ctx, c.x - r * 0.2, c.y + r * 0.8, r * 0.4, r * 0.14, r * 0.06); ctx.fill(); ctx.strokeStyle = th[3]; ctx.lineWidth = r * 0.07; ctx.lineCap = "round"; for (let i = 0; i < 7; i++) { const a = -Math.PI + (Math.PI * (i + 0.5)) / 7 - 0, ln = 0.12 + 0.1 * Math.sin(lt * 5 + i); ctx.beginPath(); ctx.moveTo(c.x + Math.cos(a) * r * 0.75, c.y - r * 0.12 + Math.sin(a) * r * 0.75); ctx.lineTo(c.x + Math.cos(a) * r * (0.75 + ln + 0.1), c.y - r * 0.12 + Math.sin(a) * r * (0.75 + ln + 0.1)); ctx.stroke(); } },
    book(ctx, c, r, lt, th) { ctx.fillStyle = th[3]; rr(ctx, c.x - r * 0.95, c.y - r * 0.55, r * 1.9, r * 1.2, r * 0.1); ctx.fill(); ctx.fillStyle = "#fff"; rr(ctx, c.x - r * 0.88, c.y - r * 0.62, r * 0.84, r * 1.1, r * 0.06); ctx.fill(); rr(ctx, c.x + r * 0.04, c.y - r * 0.62, r * 0.84, r * 1.1, r * 0.06); ctx.fill(); ctx.strokeStyle = "rgba(0,0,0,.18)"; ctx.lineWidth = r * 0.04; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(c.x - r * 0.74, c.y - r * 0.4 + i * r * 0.2); ctx.lineTo(c.x - r * 0.18, c.y - r * 0.4 + i * r * 0.2); ctx.moveTo(c.x + r * 0.18, c.y - r * 0.4 + i * r * 0.2); ctx.lineTo(c.x + r * 0.74, c.y - r * 0.4 + i * r * 0.2); ctx.stroke(); } ctx.fillStyle = th[6]; ctx.beginPath(); ctx.moveTo(c.x + r * 0.5, c.y - r * 0.62); ctx.lineTo(c.x + r * 0.5, c.y - r * 0.1); ctx.lineTo(c.x + r * 0.62, c.y - r * 0.22); ctx.lineTo(c.x + r * 0.74, c.y - r * 0.1); ctx.lineTo(c.x + r * 0.74, c.y - r * 0.62); ctx.closePath(); ctx.fill(); },
    heart(ctx, c, r, lt, th) { const k = 1 + 0.06 * Math.sin(lt * 7); ctx.save(); ctx.translate(c.x, c.y); ctx.scale(k, k); ctx.fillStyle = "#f26b6b"; ctx.beginPath(); ctx.moveTo(0, r * 0.7); ctx.bezierCurveTo(-r * 1.25, -r * 0.1, -r * 0.7, -r * 0.95, 0, -r * 0.35); ctx.bezierCurveTo(r * 0.7, -r * 0.95, r * 1.25, -r * 0.1, 0, r * 0.7); ctx.fill(); ctx.fillStyle = "rgba(255,255,255,.35)"; ctx.beginPath(); ctx.ellipse(-r * 0.45, -r * 0.35, r * 0.16, r * 0.26, -0.6, 0, Math.PI * 2); ctx.fill(); ctx.restore(); },
    shield(ctx, c, r, lt, th) { ctx.fillStyle = th[3]; ctx.beginPath(); ctx.moveTo(c.x, c.y - r * 0.85); ctx.lineTo(c.x + r * 0.78, c.y - r * 0.55); ctx.quadraticCurveTo(c.x + r * 0.78, c.y + r * 0.45, c.x, c.y + r * 0.9); ctx.quadraticCurveTo(c.x - r * 0.78, c.y + r * 0.45, c.x - r * 0.78, c.y - r * 0.55); ctx.closePath(); ctx.fill(); ctx.fillStyle = "rgba(255,255,255,.2)"; ctx.beginPath(); ctx.moveTo(c.x, c.y - r * 0.85); ctx.lineTo(c.x + r * 0.78, c.y - r * 0.55); ctx.quadraticCurveTo(c.x + r * 0.78, c.y + r * 0.45, c.x, c.y + r * 0.9); ctx.closePath(); ctx.fill(); ctx.strokeStyle = "#fff"; ctx.lineWidth = r * 0.14; ctx.lineCap = "round"; ctx.lineJoin = "round"; polyline(ctx, [[c.x - r * 0.3, c.y + r * 0.02], [c.x - r * 0.06, c.y + r * 0.27], [c.x + r * 0.36, c.y - r * 0.25]], c01((lt - 0.4) / 0.4)); },
    clock(ctx, c, r, lt, th) { ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(c.x, c.y, r * 0.85, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = th[3]; ctx.lineWidth = r * 0.12; ctx.stroke(); ctx.strokeStyle = "#37474f"; ctx.lineWidth = r * 0.05; for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(c.x + Math.cos(a) * r * 0.68, c.y + Math.sin(a) * r * 0.68); ctx.lineTo(c.x + Math.cos(a) * r * 0.76, c.y + Math.sin(a) * r * 0.76); ctx.stroke(); } ctx.lineCap = "round"; const am = lt * 1.6 - Math.PI / 2, ah = lt * 0.13 - Math.PI / 2; ctx.lineWidth = r * 0.09; ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(c.x + Math.cos(ah) * r * 0.4, c.y + Math.sin(ah) * r * 0.4); ctx.stroke(); ctx.strokeStyle = th[3]; ctx.lineWidth = r * 0.06; ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(c.x + Math.cos(am) * r * 0.62, c.y + Math.sin(am) * r * 0.62); ctx.stroke(); ctx.fillStyle = "#37474f"; ctx.beginPath(); ctx.arc(c.x, c.y, r * 0.07, 0, Math.PI * 2); ctx.fill(); },
    chart(ctx, c, r, lt, th) { const hs = [0.45, 0.8, 0.6, 1.1], w = r * 0.34; ctx.fillStyle = "rgba(255,255,255,.14)"; rr(ctx, c.x - r * 1.0, c.y - r * 0.9, r * 2, r * 1.8, r * 0.12); ctx.fill(); hs.forEach((h, i) => { const p = spring(c01((lt - 0.2 - i * 0.14) / 0.6)); ctx.fillStyle = i === 3 ? th[3] : th[6]; rr(ctx, c.x - r * 0.78 + i * (w + r * 0.07), c.y + r * 0.7 - h * r * 1.2 * p, w, h * r * 1.2 * p, r * 0.06); ctx.fill(); }); ctx.strokeStyle = "#fff"; ctx.lineWidth = r * 0.06; ctx.lineCap = "round"; ctx.lineJoin = "round"; polyline(ctx, [[c.x - r * 0.7, c.y + r * 0.1], [c.x - r * 0.2, c.y - r * 0.25], [c.x + r * 0.15, c.y - r * 0.05], [c.x + r * 0.7, c.y - r * 0.7]], c01((lt - 0.8) / 0.6)); },
    star(ctx, c, r, lt, th) { ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(Math.sin(lt * 2) * 0.12); ctx.fillStyle = th[3]; ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rad = i % 2 ? r * 0.38 : r * 0.9; ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad); } ctx.closePath(); ctx.fill(); ctx.fillStyle = "rgba(255,255,255,.3)"; ctx.beginPath(); ctx.moveTo(0, -r * 0.9); ctx.lineTo(r * 0.22, -r * 0.3); ctx.lineTo(0, 0); ctx.lineTo(-r * 0.22, -r * 0.3); ctx.closePath(); ctx.fill(); ctx.restore(); },
    question(ctx, c, r, lt, th) { ctx.fillStyle = th[6]; ctx.beginPath(); ctx.arc(c.x, c.y, r * 0.85, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = th[1]; ctx.font = `900 ${Math.round(r * 1.5)}px Arial, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("?", c.x, c.y + r * 0.06); ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"; },
    check(ctx, c, r, lt, th) { ctx.fillStyle = th[3]; ctx.beginPath(); ctx.arc(c.x, c.y, r * 0.85, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = "#fff"; ctx.lineWidth = r * 0.17; ctx.lineCap = "round"; ctx.lineJoin = "round"; polyline(ctx, [[c.x - r * 0.38, c.y + r * 0.02], [c.x - r * 0.1, c.y + r * 0.3], [c.x + r * 0.42, c.y - r * 0.28]], c01((lt - 0.3) / 0.45)); },
  };
  function autoIcon(s) {
    const w = ((s.title || "") + " " + (s.narration || "") + " " + (s.sub || "")).toLowerCase(), K = [["heart", /heart|care|health|patient|love/], ["check", /check|step|tick|list|done/], ["bulb", /idea|tip|learn|think|why/], ["clock", /time|minute|hour|day|schedule|before|early/], ["shield", /safe|protect|secure|risk|alarm/], ["book", /book|study|read|note|exam|card/], ["chart", /percent|data|number|\d{2}|growth|score/], ["question", /\?|how|what|myth/]];
    for (const [k, re] of K) if (re.test(w)) return k; const keys = Object.keys(ICON_KEYS); return keys[(String(s.id || "x").split("").reduce((a, c) => a + c.charCodeAt(0), 0)) % keys.length];
  }
  function drawIconSlot(ctx, g, sc, lt, t, th) {
    const s = sc.s, pb = poseBox(g, sc); if (!pb) return; const kind = ICONS[s.icon] ? s.icon : (EXT.icons[s.icon] ? s.icon : autoIcon(s)), fn = ICONS[kind] || (EXT.icons[kind] && EXT.icons[kind].draw) || ICONS.star;
    const r = Math.min(pb.w, pb.h) * 0.46, c = { x: pb.x + pb.w / 2, y: pb.y + pb.h / 2 + Math.sin(t * 1.7) * 6 * g.u }, enter = spring((lt - 0.15) / 0.8);
    ctx.save(); ctx.globalAlpha *= c01((lt - 0.1) / 0.3); ctx.translate(c.x, c.y); ctx.scale(Math.max(0.01, enter), Math.max(0.01, enter)); ctx.translate(-c.x, -c.y); ctx.shadowColor = "rgba(0,0,0,.35)"; ctx.shadowBlur = 24 * g.u; ctx.shadowOffsetY = 10 * g.u; fn(ctx, c, r, lt, th); ctx.restore();
  }
  // ---- lip-sync host: a drawn presenter whose mouth follows the loudness of the voice (not phoneme-exact)
  function drawHost(ctx, pb, e, t, th, P, u) {
    const skin = (P && P.hostSkin) || "#8a5638", hair = "#1a1210", cx = pb.x + pb.w / 2, W = pb.w, hy = pb.y + pb.h * 0.44, rx = W * 0.27, ry = W * 0.31;
    const sway = Math.sin(t * 1.7) * 0.025 + e * 0.015;
    ctx.save(); ctx.translate(cx, pb.y + pb.h); ctx.rotate(sway); ctx.translate(-cx, -(pb.y + pb.h));
    // shoulders + shirt
    ctx.fillStyle = th[3]; ctx.beginPath(); ctx.ellipse(cx, pb.y + pb.h + W * 0.05, W * 0.46, W * 0.34, 0, Math.PI, 0); ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,.15)"; ctx.beginPath(); ctx.moveTo(cx - W * 0.1, pb.y + pb.h - W * 0.29); ctx.lineTo(cx, pb.y + pb.h - W * 0.15); ctx.lineTo(cx + W * 0.1, pb.y + pb.h - W * 0.29); ctx.closePath(); ctx.fill();
    ctx.fillStyle = skin; rr(ctx, cx - W * 0.08, hy + ry * 0.7, W * 0.16, W * 0.2, W * 0.04); ctx.fill();
    // hair back, ears, head
    ctx.fillStyle = hair; ctx.beginPath(); ctx.ellipse(cx, hy - ry * 0.12, rx * 1.08, ry * 1.02, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = skin; [-1, 1].forEach((d) => { ctx.beginPath(); ctx.ellipse(cx + d * rx * 0.98, hy + ry * 0.08, W * 0.04, W * 0.06, 0, 0, Math.PI * 2); ctx.fill(); });
    ctx.beginPath(); ctx.ellipse(cx, hy + ry * 0.08, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = hair; ctx.beginPath(); ctx.ellipse(cx, hy - ry * 0.52, rx * 1.02, ry * 0.5, 0, Math.PI, 0); ctx.fill();
    // eyes (blink every ~3 s), brows
    const bl = (t % 3.3) < 0.14 ? 0.1 : 1, ey = hy - ry * 0.05;
    [-1, 1].forEach((d) => {
      const ex = cx + d * rx * 0.42; ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.ellipse(ex, ey, W * 0.052, W * 0.04 * bl, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#1b1210"; ctx.beginPath(); ctx.ellipse(ex + Math.sin(t * 0.8) * W * 0.008, ey, W * 0.026, W * 0.03 * bl, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = hair; ctx.lineWidth = W * 0.017; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(ex - W * 0.06, ey - W * 0.075 - e * W * 0.01); ctx.lineTo(ex + W * 0.06, ey - W * 0.085 - e * W * 0.02); ctx.stroke();
    });
    ctx.strokeStyle = "rgba(0,0,0,.25)"; ctx.lineWidth = W * 0.014; ctx.beginPath(); ctx.moveTo(cx, ey + W * 0.03); ctx.quadraticCurveTo(cx - W * 0.03, ey + W * 0.11, cx + W * 0.012, ey + W * 0.12); ctx.stroke();
    // mouth: opens with the voice
    const m = Math.min(1, e * 1.5), my = hy + ry * 0.5, mw = W * (0.17 - 0.03 * m), mh = W * (0.012 + 0.085 * m);
    if (m < 0.06) { ctx.strokeStyle = "#4a1c1c"; ctx.lineWidth = W * 0.016; ctx.beginPath(); ctx.moveTo(cx - mw, my); ctx.quadraticCurveTo(cx, my + W * 0.05, cx + mw, my); ctx.stroke(); }
    else {
      ctx.fillStyle = "#3b0d12"; ctx.beginPath(); ctx.ellipse(cx, my + mh * 0.3, mw, mh, 0, 0, Math.PI * 2); ctx.fill();
      ctx.save(); ctx.beginPath(); ctx.ellipse(cx, my + mh * 0.3, mw, mh, 0, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = "#fff"; ctx.fillRect(cx - mw, my - mh * 0.7, mw * 2, mh * 0.7 * Math.min(1, m * 2));
      ctx.fillStyle = "#d9606b"; ctx.beginPath(); ctx.ellipse(cx, my + mh * 1.1, mw * 0.6, mh * 0.55, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
    ctx.fillStyle = "rgba(255,120,120,.18)"; [-1, 1].forEach((d) => { ctx.beginPath(); ctx.ellipse(cx + d * rx * 0.6, hy + ry * 0.32, W * 0.05, W * 0.03, 0, 0, Math.PI * 2); ctx.fill(); });
    ctx.restore();
  }

  // ---- voice visualiser
  function viz(ctx, P, th, g, sc, lt, kind) {
    if (!sc.a || kind === "none") return;
    const n = 15, bw = 12 * g.u, gap = 9 * g.u, tw = n * bw + (n - 1) * gap, cx = g.W / 2, y = g.port ? g.capY - 56 * g.u : g.capY - 40 * g.u, hmax = 54 * g.u;
    if (lt < sc.lead || lt > sc.dur - 0.2) return;
    ctx.save(); ctx.fillStyle = th[3]; ctx.globalAlpha *= 0.9;
    if (kind === "wave") {
      ctx.strokeStyle = th[3]; ctx.lineWidth = 5 * g.u; ctx.lineCap = "round"; ctx.beginPath();
      for (let i = 0; i <= 60; i++) { const e = envAt(sc.a, lt, sc.lead, (i - 30) * 0.012), x = cx - tw / 2 + (i / 60) * tw, yy = y - hmax / 2 + Math.sin(i * 0.6 + lt * 12) * e * hmax * 0.5; i ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy); }
      ctx.stroke();
    } else {
      for (let i = 0; i < n; i++) {
        const e = envAt(sc.a, lt, sc.lead, (i - n / 2) * 0.03), h = Math.max(6 * g.u, e * hmax * (0.55 + 0.45 * Math.abs(Math.sin(i * 1.7 + lt * 9))));
        rr(ctx, cx - tw / 2 + i * (bw + gap), y - h / 2, bw, h, bw / 2); ctx.fill();
      }
    }
    ctx.restore();
  }

  function captions(ctx, P, th, g, sc, lt) {
    const aa = sc.a || sc.fa; if (!P.captions || !aa || !sc.s.narration) return;
    const rt = lt - sc.lead; if (rt < -0.05 || rt > aa.t1 - aa.t0 + 0.4) return;
    const chunks = capTimings(aa, sc.s.narration.trim().replace(/\*\*/g, "")); if (!chunks.length) return;
    const style = P.capStyle || "box";
    let ch = chunks[chunks.length - 1];
    for (const c of chunks) if (rt <= c[c.length - 1].e + 0.02) { ch = c; break; }
    if (style === "bigword") {
      const all = [].concat(...chunks); let wd = all[all.length - 1]; for (const w of all) if (rt <= w.e) { wd = w; break; }
      const wp = c01((rt - wd.s) / 0.22), size = (g.port ? 150 : g.wide ? 120 : 130) * g.u * (P.font.scale || 1), cy = g.capY + g.capH * 0.45;
      ctx.save(); ctx.font = fstr(P, size, 900); ctx.textAlign = "center"; ctx.textBaseline = "middle"; const word = wd.w.replace(/[.,!?;:]+$/, "").toUpperCase(), sc2 = 0.55 + 0.45 * spring(wp);
      ctx.translate(g.W / 2, cy); ctx.scale(sc2, sc2); ctx.lineJoin = "round"; ctx.lineWidth = size * 0.16; ctx.strokeStyle = "rgba(0,0,0,.85)"; ctx.strokeText(word, 0, 0); ctx.fillStyle = (all.indexOf(wd) % 3 === 0) ? th[6] : "#fff"; ctx.fillText(word, 0, 0); ctx.restore(); return;
    }
    const size = (g.port ? 62 : g.wide ? 52 : 56) * g.u * (P.font.scale || 1), lh = 1.25;
    ctx.save(); ctx.font = fstr(P, size, 800); ctx.textBaseline = "top";
    const maxW = g.W - g.m * 2.2, words = ch.map((x) => x.w), lines = []; let cur = [];
    words.forEach((w, i) => { const test = cur.concat([w]).join(" "); if (cur.length && ctx.measureText(test).width > maxW) { lines.push(cur); cur = [w]; } else cur.push(w); });
    if (cur.length) lines.push(cur);
    let idx = 0; const boxW = Math.min(maxW, Math.max(...lines.map((l) => ctx.measureText(l.join(" ")).width))) + 56 * g.u, boxH = lines.length * size * lh + 36 * g.u;
    const bx = (g.W - boxW) / 2, by = g.capY + (g.capH - boxH) / 2 + (g.port ? 0 : g.capH * 0.1);
    const cp = c01((rt - ch[0].s) / 0.3), cs = 0.88 + 0.12 * spring(cp), fa = c01(cp * 4 + (ch === chunks[0] ? 1 : 0)); ctx.translate(g.W / 2, by + boxH / 2); ctx.scale(cs, cs); ctx.translate(-g.W / 2, -(by + boxH / 2));
    if (style === "box") { ctx.globalAlpha = 0.86 * fa; ctx.fillStyle = "rgba(0,0,0,.62)"; rr(ctx, bx, by, boxW, boxH, 30 * g.u); ctx.fill(); }
    ctx.globalAlpha = fa;
    lines.forEach((l, li) => {
      const lw = ctx.measureText(l.join(" ")).width; let x = (g.W - lw) / 2;
      l.forEach((w) => { const word = ch[idx++], on = rt >= word.s - 0.02 && rt <= word.e, yy = by + 18 * g.u + li * size * lh; if (style === "outline") { ctx.lineJoin = "round"; ctx.lineWidth = size * 0.2; ctx.strokeStyle = "rgba(0,0,0,.9)"; ctx.strokeText(w, x, yy); } ctx.fillStyle = on ? th[6] : "#ffffff"; ctx.fillText(w, x, yy); x += ctx.measureText(w + " ").width; });
    });
    ctx.restore();
  }

  // ---- layouts
  const L = {};
  L.title = (ctx, P, th, g, sc, lt, A) => {
    const s = sc.s, b = contentBox(g, sc), an = s.anim || P.anim, u = g.u;
    const t = fit(ctx, P, s.title || " ", b.w, b.h * 0.5, 44 * u, (g.port ? 132 : 112) * u, 1.08);
    const sub = s.sub ? fit(ctx, P, s.sub, b.w, b.h * 0.22, 28 * u, 56 * u, 1.25, 500) : null;
    const labH = s.label ? 54 * u : 0, th_ = t.lines.length * t.size * t.lh, subH = sub ? sub.lines.length * sub.size * sub.lh + 40 * u : 0;
    const total = labH + th_ + 30 * u + subH, y0 = b.y + (b.h - total) / 2;
    if (s.label) withAnim(ctx, "rise", lin((lt - 0.05) / 0.5), 0, 0, u, () => { ctx.font = fstr(P, 30 * u * (P.font.scale || 1), 800); ctx.fillStyle = th[3]; ctx.textBaseline = "top"; ctx.textAlign = "left"; const lab = s.label.toUpperCase(); rr(ctx, b.x, y0, ctx.measureText(lab).width + 40 * u, 46 * u, 23 * u); ctx.fillStyle = hexA(th[3], 0.18); ctx.fill(); ctx.fillStyle = th[3]; ctx.fillText(lab, b.x + 20 * u, y0 + 7 * u); });
    withAnim(ctx, TXT[an] ? "none" : an, lin((lt - 0.15) / 0.7), b.x + b.w / 2, y0 + labH + th_ / 2, u, () => textBlock(ctx, P, t.lines, b.x, y0 + labH, t.size, t.lh, "left", th[4], an, (lt - 0.15) / (an === "type" ? 1.4 : 1.1), { shadow: true }));
    const uy = y0 + labH + th_ + 14 * u, uw = Math.min(b.w * 0.5, 360 * u) * io((lt - 0.7) / 0.7);
    ctx.fillStyle = th[3]; rr(ctx, b.x, uy, uw, 10 * u, 5 * u); ctx.fill();
    if (sub) withAnim(ctx, "rise", lin((lt - 0.9) / 0.6), 0, 0, u, () => textBlock(ctx, P, sub.lines, b.x, uy + 36 * u, sub.size, sub.lh, "left", hexA(th[4], 0.82), "none", 1, { weight: 500 }));
  };
  L.bullets = (ctx, P, th, g, sc, lt, A) => {
    const s = sc.s, b = contentBox(g, sc), an = s.anim || P.anim, u = g.u, lines = (s.lines || []).filter((x) => x.trim());
    let y = b.y;
    if (s.title) {
      const t = fit(ctx, P, s.title, b.w, b.h * 0.26, 38 * u, (g.port ? 84 : 72) * u, 1.1);
      withAnim(ctx, TXT[an] ? "rise" : an, lin((lt - 0.05) / 0.6), b.x + b.w / 2, y + 40 * u, u, () => textBlock(ctx, P, t.lines, b.x, y, t.size, t.lh, "left", th[3], "none", 1, { shadow: true }));
      y += t.lines.length * t.size * t.lh + 26 * u;
    }
    const n = Math.max(1, lines.length), avail = b.y + b.h - y, gap = 20 * u;
    let size = Math.min((g.port ? 58 : 50) * u, avail / (n * 2.1)), items = [];
    for (let k = 0; k < 12; k++) {
      ctx.font = fstr(P, size * (P.font.scale || 1), 700); const iw = b.w - 128 * u;
      items = lines.map((l) => ({ l, ls: wrap(ctx, l, iw) })); const h = items.reduce((a, it) => a + it.ls.length * size * 1.18 + 36 * u + gap, 0) - gap;
      if (h <= avail || size < 26 * u) break; size *= 0.92;
    }
    const bq = cuesFor(sc, lines, 0.45); const listH = items.reduce((a, it) => a + it.ls.length * size * 1.18 + 36 * u + gap, 0) - gap; y += Math.max(0, (avail - listH) / 2);
    items.forEach((it, i) => {
      const p = out3((lt - bq[i]) / 0.6), hh = it.ls.length * size * 1.18 + 36 * u;
      withAnim(ctx, TXT[an] ? "slide" : an, p, b.x + b.w / 2, y + hh / 2, u, () => {
        ctx.fillStyle = hexA(th[5], 0.9); rr(ctx, b.x, y, b.w, hh, 26 * u); ctx.fill();
        ctx.fillStyle = th[3]; rr(ctx, b.x, y, 10 * u, hh, 5 * u); ctx.fill();
        ctx.beginPath(); ctx.arc(b.x + 62 * u, y + hh / 2, 24 * u, 0, Math.PI * 2); ctx.fillStyle = th[3]; ctx.fill();
        ctx.font = fstr(P, 26 * u * (P.font.scale || 1), 800); ctx.fillStyle = th[1]; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(i + 1), b.x + 62 * u, y + hh / 2 + 1 * u); ctx.textAlign = "left";
        textBlock(ctx, P, it.ls, b.x + 112 * u, y + 18 * u, size, 1.18, "left", th[4], "none", 1, { weight: 700 });
      });
      y += hh + gap;
    });
  };
  L.quote = (ctx, P, th, g, sc, lt, A) => {
    const s = sc.s, b = contentBox(g, sc), an = s.anim || P.anim, u = g.u, txt = s.title || (s.lines || []).join(" ");
    const t = fit(ctx, P, txt || " ", b.w - 40 * u, b.h * 0.62, 36 * u, (g.port ? 92 : 78) * u, 1.2, 700), th_ = t.lines.length * t.size * t.lh;
    const attrH = s.sub ? 90 * u : 0, total = 150 * u + th_ + attrH, y0 = b.y + (b.h - total) / 2;
    withAnim(ctx, "pop", lin((lt - 0.05) / 0.6), b.x + 60 * u, y0 + 70 * u, u, () => { ctx.font = fstr(P, 260 * u, 800); ctx.fillStyle = hexA(th[3], 0.9); ctx.textBaseline = "top"; ctx.fillText("“", b.x, y0 - 40 * u); });
    withAnim(ctx, TXT[an] ? "none" : an, lin((lt - 0.2) / 0.7), b.x + b.w / 2, y0 + 150 * u + th_ / 2, u, () => textBlock(ctx, P, t.lines, b.x + 20 * u, y0 + 150 * u, t.size, t.lh, "left", th[4], an, (lt - 0.2) / (an === "type" ? 1.8 : 1.4), { weight: 700, shadow: true }));
    if (s.sub) withAnim(ctx, "rise", lin((lt - 1.0) / 0.6), 0, 0, u, () => { ctx.font = fstr(P, 38 * u * (P.font.scale || 1), 700); ctx.fillStyle = th[6]; ctx.textBaseline = "top"; ctx.fillText("— " + s.sub, b.x + 20 * u, y0 + 150 * u + th_ + 28 * u); });
  };
  L.number = (ctx, P, th, g, sc, lt, A) => {
    const s = sc.s, b = contentBox(g, sc), u = g.u, raw = String(s.num || "0"), m = raw.match(/^([^\d-]*)(-?[\d,]*\.?\d+)(.*)$/);
    const pre = m ? m[1] : "", numS = m ? m[2] : raw, suf = m ? m[3] : "", target = parseFloat(numS.replace(/,/g, "")) || 0, dec = (numS.split(".")[1] || "").length, comma = /,/.test(numS);
    const val = target * out5((lt - 0.2) / 1.4), fmtN = (v) => { let r = v.toFixed(dec); if (comma) r = Number(r).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec }); return pre + r + suf; };
    const shown = fmtN(val), full = fmtN(target), size = fit(ctx, P, full, b.w, b.h * 0.45, 60 * u, (g.port ? 300 : 260) * u, 1, 800).size;
    const extra = (s.title ? fit(ctx, P, s.title, b.w, b.h * 0.2, 34 * u, 74 * u, 1.15) : { lines: [], size: 0, lh: 1 }), exH = extra.lines.length * extra.size * extra.lh + (s.sub ? 90 * u : 0), y0 = b.y + Math.max(0, (b.h - size * 1.1 - exH) / 2);
    withAnim(ctx, "pop", lin((lt - 0.05) / 0.5), b.x + b.w / 2, y0 + size / 2, u, () => { ctx.font = fstr(P, size * (P.font.scale || 1), 800); ctx.textAlign = "center"; ctx.textBaseline = "top"; const gr = ctx.createLinearGradient(0, y0, 0, y0 + size); gr.addColorStop(0, th[3]); gr.addColorStop(1, th[6]); ctx.fillStyle = gr; ctx.shadowColor = hexA(th[3], 0.4); ctx.shadowBlur = 50 * u; ctx.fillText(shown, b.x + b.w / 2, y0); ctx.textAlign = "left"; });
    let y = y0 + size * 1.1;
    if (s.title) { const t = fit(ctx, P, s.title, b.w, b.h * 0.2, 34 * u, 74 * u, 1.15); withAnim(ctx, "rise", lin((lt - 0.7) / 0.6), 0, 0, u, () => textBlock(ctx, P, t.lines, b.x + b.w / 2, y, t.size, t.lh, "center", th[4], "none", 1, { shadow: true })); y += t.lines.length * t.size * t.lh + 18 * u; }
    if (s.sub) { const t = fit(ctx, P, s.sub, b.w, b.h * 0.18, 26 * u, 46 * u, 1.25, 500); withAnim(ctx, "rise", lin((lt - 1.0) / 0.6), 0, 0, u, () => textBlock(ctx, P, t.lines, b.x + b.w / 2, y, t.size, t.lh, "center", hexA(th[4], 0.8), "none", 1, { weight: 500 })); }
  };
  L.narrator = (ctx, P, th, g, sc, lt, A) => {
    const s = sc.s, u = g.u; if (!s.pose) s.pose = "wave-hello";
    const b = contentBox(g, sc), an = s.anim || P.anim, txt = (s.lines && s.lines.length ? s.lines.join("\n") : s.sub) || "";
    const head = s.title ? fit(ctx, P, s.title, b.w - 80 * u, b.h * 0.22, 34 * u, 70 * u, 1.1) : null, hh = head ? head.lines.length * head.size * head.lh + 20 * u : 0;
    const body = fit(ctx, P, txt || " ", b.w - 80 * u, b.h - hh - 120 * u, 28 * u, 56 * u, 1.25, 600), bh = body.lines.length * body.size * body.lh;
    const bw = b.w, bhTot = hh + bh + 70 * u, by = b.y + Math.max(0, (b.h - bhTot) / 2);
    withAnim(ctx, "pop", lin((lt - 0.15) / 0.6), b.x + b.w / 2, by + bhTot / 2, u, () => {
      ctx.fillStyle = hexA(th[5], 0.96); rr(ctx, b.x, by, bw, bhTot, 34 * u); ctx.fill(); ctx.strokeStyle = th[3]; ctx.lineWidth = 4 * u; ctx.stroke();
      ctx.fillStyle = hexA(th[5], 0.96); ctx.strokeStyle = th[3]; ctx.beginPath();
      const tx = s.posePos === "left" ? b.x + 80 * u : b.x + bw - 80 * u; const ty = by + bhTot; ctx.moveTo(tx - 24 * u, ty - 2 * u); ctx.lineTo(tx, ty + 40 * u); ctx.lineTo(tx + 24 * u, ty - 2 * u); ctx.closePath(); ctx.fill();
      let yy = by + 35 * u;
      if (head) { textBlock(ctx, P, head.lines, b.x + 40 * u, yy, head.size, head.lh, "left", th[3], "none", 1); yy += hh; }
      textBlock(ctx, P, body.lines, b.x + 40 * u, yy, body.size, body.lh, "left", th[4], TXT[an] ? an : "none", (lt - 0.5) / (an === "type" ? 2 : 1.6), { weight: 600 });
    });
  };
  L.image = (ctx, P, th, g, sc, lt, A) => {
    const s = sc.s, u = g.u, im = A.imgs && A.imgs[s.imgKey];
    if (im) { ctx.save(); const k = 1.14 + 0.1 * c01(lt / sc.dur), dir = (String(s.id).charCodeAt(String(s.id).length - 1) % 2 ? 1 : -1); cover(ctx, im, g.W, g.H, k, dir * g.W * 0.06 * (c01(lt / sc.dur) - 0.5)); ctx.restore(); const gr = ctx.createLinearGradient(0, g.H * 0.4, 0, g.H); gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(1, "rgba(0,0,0,.7)"); ctx.fillStyle = gr; ctx.fillRect(0, g.H * 0.4, g.W, g.H * 0.6); }
    else { ctx.fillStyle = hexA(th[5], 1); ctx.fillRect(0, 0, g.W, g.H); ctx.font = fstr(P, 40 * u); ctx.fillStyle = th[4]; ctx.textAlign = "center"; ctx.fillText("Add a photo to this scene", g.W / 2, g.H / 2); ctx.textAlign = "left"; }
    const b = contentBox(g, sc), an = s.anim || P.anim;
    if (s.title) { const t = fit(ctx, P, s.title, b.w, b.h * 0.3, 40 * u, (g.port ? 92 : 76) * u, 1.1), th_ = t.lines.length * t.size * t.lh; withAnim(ctx, TXT[an] ? "rise" : an, lin((lt - 0.2) / 0.7), b.x, b.y + b.h - th_, u, () => textBlock(ctx, P, t.lines, b.x, b.y + b.h - th_, t.size, t.lh, "left", "#ffffff", "none", 1, { shadow: true })); }
  };
  // ---- social logos (drawn natively, brand colours) centred at cx,cy with radius r
  function socialLogo(ctx, k, cx, cy, r) {
    ctx.save(); ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const sq = (c) => { rr(ctx, cx - r, cy - r, r * 2, r * 2, r * 0.46); ctx.fillStyle = c; ctx.fill(); }, ci = (c) => { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill(); };
    const tx = (s, c, sz, dx, dy) => { ctx.fillStyle = c; ctx.font = `800 ${Math.round(sz)}px Arial, sans-serif`; ctx.fillText(s, cx + (dx || 0), cy + (dy || 0)); };
    if (k === "youtube") { rr(ctx, cx - r * 1.3, cy - r * 0.92, r * 2.6, r * 1.84, r * 0.5); ctx.fillStyle = "#ff0000"; ctx.fill(); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.moveTo(cx - r * 0.34, cy - r * 0.5); ctx.lineTo(cx + r * 0.58, cy); ctx.lineTo(cx - r * 0.34, cy + r * 0.5); ctx.closePath(); ctx.fill(); }
    else if (k === "facebook") { ci("#1877f2"); tx("f", "#fff", r * 1.7, r * 0.12, r * 0.18); }
    else if (k === "instagram") { const g = ctx.createLinearGradient(cx - r, cy + r, cx + r, cy - r); g.addColorStop(0, "#fdc468"); g.addColorStop(0.45, "#df4996"); g.addColorStop(1, "#4f5bd5"); sq(g); ctx.strokeStyle = "#fff"; ctx.lineWidth = r * 0.16; rr(ctx, cx - r * 0.58, cy - r * 0.58, r * 1.16, r * 1.16, r * 0.34); ctx.stroke(); ctx.beginPath(); ctx.arc(cx, cy, r * 0.28, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(cx + r * 0.38, cy - r * 0.38, r * 0.08, 0, Math.PI * 2); ctx.fill(); }
    else if (k === "tiktok") { sq("#010101"); tx("♪", "#25f4ee", r * 1.5, -r * 0.07, 0); tx("♪", "#fe2c55", r * 1.5, r * 0.07, 0); tx("♪", "#fff", r * 1.5, 0, 0); }
    else if (k === "linkedin") { sq("#0a66c2"); tx("in", "#fff", r * 1.15, 0, r * 0.04); }
    else if (k === "x") { ci("#000"); tx("X", "#fff", r * 1.2, 0, r * 0.04); }
    else if (k === "telegram") { ci("#229ed9"); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.moveTo(cx - r * 0.62, cy - r * 0.04); ctx.lineTo(cx + r * 0.6, cy - r * 0.5); ctx.lineTo(cx + r * 0.28, cy + r * 0.56); ctx.lineTo(cx - r * 0.06, cy + r * 0.2); ctx.lineTo(cx - r * 0.14, cy + r * 0.5); ctx.lineTo(cx - r * 0.22, cy + r * 0.12); ctx.closePath(); ctx.fill(); }
    else if (k === "whatsapp") { ci("#25d366"); ctx.strokeStyle = "#fff"; ctx.lineWidth = r * 0.14; ctx.beginPath(); ctx.arc(cx, cy - r * 0.04, r * 0.52, 0.2 * Math.PI, 2.9 * Math.PI); ctx.stroke(); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.moveTo(cx - r * 0.5, cy + r * 0.62); ctx.lineTo(cx - r * 0.42, cy + r * 0.2); ctx.lineTo(cx - r * 0.12, cy + r * 0.45); ctx.closePath(); ctx.fill(); tx("✆", "#fff", r * 0.62, 0, -r * 0.02); }
    else if (k === "web") { ci("#3b82f6"); ctx.strokeStyle = "#fff"; ctx.lineWidth = r * 0.1; ctx.beginPath(); ctx.arc(cx, cy, r * 0.58, 0, Math.PI * 2); ctx.moveTo(cx - r * 0.58, cy); ctx.lineTo(cx + r * 0.58, cy); ctx.moveTo(cx, cy - r * 0.58); ctx.ellipse(cx, cy, r * 0.26, r * 0.58, 0, -Math.PI / 2, Math.PI * 1.5); ctx.stroke(); }
    else { ci("#888"); }
    ctx.restore();
  }
  const SOCIALS = { facebook: "Facebook", instagram: "Instagram", youtube: "YouTube", tiktok: "TikTok" };

  // ---- end screen: logo, thanks, subscribe button, website QR and the four social logos. Sized to fill the screen.
  L.outro = (ctx, P, th, g, sc, lt, A) => {
    const s = sc.s, u = g.u, b = Object.assign({}, g.box), wide = g.wide, soc = (P.socials || []).filter((x) => x && SOCIALS[x.k] && x.h && String(x.h).trim()).sort((x, y) => Object.keys(SOCIALS).indexOf(x.k) - Object.keys(SOCIALS).indexOf(y.k)).slice(0, 4), hasQR = !!(A.qr && s.qr);
    if (!g.vis) b.y = g.H * 0.09; b.h = (g.vis ? g.H * 0.86 : g.H * 0.88) - b.y;
    const SITE = "ezra-ogombo.web.app", lh = typeof location !== "undefined" ? location.host : "", host = /^https?:\/\//.test(s.qr || "") ? String(s.qr).replace(/^https?:\/\/(www\.)?/, "").split(/[/?#]/)[0] : (!lh || /^(localhost|127\.|192\.168\.)/.test(lh) ? SITE : lh.replace(/^www\./, ""));
    const build = (U) => {
      const colW = wide ? b.w * 0.44 : b.w, L1 = [], R1 = [], gap = 34 * U, lg = 190 * U;
      const t = fit(ctx, P, s.title || "Thanks for watching!", colW, b.h * 0.2, 40 * U, (wide ? 84 : 96) * U, 1.1);
      const sb = s.sub ? fit(ctx, P, s.sub, colW, b.h * 0.1, 26 * U, 42 * U, 1.2, 500) : null;
      const bw = Math.min(colW, 520 * U), bh = 116 * U, q = hasQR ? (wide ? Math.min(b.h * 0.5, 380 * u) : 380 * U) : 0, rowH = 112 * U, rows = wide ? soc.length : Math.ceil(soc.length / 2);
      L1.push({ h: lg + 12 * U, d: (y) => { const cx = (wide ? b.x + colW / 2 : b.x + b.w / 2); withAnim(ctx, "pop", lin((lt - 0.05) / 0.6), cx, y + lg / 2, u, () => { if (A.logo) { ctx.save(); ctx.beginPath(); ctx.arc(cx, y + lg / 2, lg / 2, 0, Math.PI * 2); ctx.clip(); ctx.drawImage(A.logo, cx - lg / 2, y, lg, lg); ctx.restore(); } ctx.strokeStyle = "#fff"; ctx.lineWidth = 6 * U; ctx.beginPath(); ctx.arc(cx, y + lg / 2, lg / 2 + 5 * U, 0, Math.PI * 2); ctx.stroke(); }); } });
      L1.push({ h: t.lines.length * t.size * t.lh + (sb ? sb.lines.length * sb.size * sb.lh + 16 * U : 0), d: (y) => { const cx = wide ? b.x + colW / 2 : b.x + b.w / 2; withAnim(ctx, "rise", lin((lt - 0.3) / 0.6), cx, y, u, () => textBlock(ctx, P, t.lines, cx, y, t.size, t.lh, "center", th[4], "none", 1, { shadow: true })); if (sb) withAnim(ctx, "rise", lin((lt - 0.5) / 0.6), 0, 0, u, () => textBlock(ctx, P, sb.lines, cx, y + t.lines.length * t.size * t.lh + 16 * U, sb.size, sb.lh, "center", hexA(th[4], 0.85), "none", 1, { weight: 500 })); } });
      L1.push({ h: bh, d: (y) => { const cx = wide ? b.x + colW / 2 : b.x + b.w / 2, pul = 1 + 0.035 * Math.sin(lt * 5); withAnim(ctx, "pop", out3((lt - 0.7) / 0.5), cx, y + bh / 2, u, () => {
        ctx.save(); ctx.translate(cx, y + bh / 2); ctx.scale(pul, pul); ctx.translate(-cx, -(y + bh / 2));
        ctx.shadowColor = "rgba(0,0,0,.4)"; ctx.shadowBlur = 20 * U; ctx.shadowOffsetY = 8 * U; rr(ctx, cx - bw / 2, y, bw, bh, bh / 2); ctx.fillStyle = "#e11d2e"; ctx.fill(); ctx.shadowColor = "transparent";
        ctx.fillStyle = "#fff"; ctx.font = `900 ${Math.round(48 * U)}px ${P.font.stack}`; ctx.textAlign = "left"; ctx.textBaseline = "middle"; const label = (s.cta || "SUBSCRIBE").toUpperCase().slice(0, 18), tw = ctx.measureText(label).width, bx = cx - (tw + 84 * U) / 2;
        ctx.fillText(label, bx + 76 * U, y + bh / 2 + 2 * U);
        ctx.save(); ctx.translate(bx + 30 * U, y + bh / 2 - 8 * U); ctx.rotate(Math.sin(lt * 7) * 0.3 * (lt % 2 < 0.8 ? 1 : 0)); ctx.beginPath(); ctx.moveTo(-18 * U, 19 * U); ctx.quadraticCurveTo(-18 * U, -4 * U, 0, -21 * U); ctx.quadraticCurveTo(18 * U, -4 * U, 18 * U, 19 * U); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.arc(0, 25 * U, 6 * U, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        ctx.restore(); ctx.textBaseline = "alphabetic"; }); } });
      if (hasQR) R1.push({ h: q + 24 * U + 66 * U, d: (y) => { const cx = wide ? b.x + b.w * 0.76 : b.x + b.w / 2; withAnim(ctx, "pop", lin((lt - 1.0) / 0.6), cx, y + q / 2, u, () => {
        ctx.save(); ctx.shadowColor = "rgba(0,0,0,.35)"; ctx.shadowBlur = 22 * U; ctx.fillStyle = "#fff"; rr(ctx, cx - q / 2 - 14 * U, y - 14 * U, q + 28 * U, q + 28 * U, 22 * U); ctx.fill(); ctx.restore(); ctx.drawImage(A.qr[s.id] || A.qr, cx - q / 2, y, q, q);
        ctx.fillStyle = th[4]; ctx.font = `800 ${Math.round(31 * U)}px ${P.font.stack}`; ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.fillText("SCAN TO VISIT THE WEBSITE", cx, y + q + 34 * U); ctx.fillStyle = th[6]; ctx.font = `700 ${Math.round(28 * U)}px ${P.font.stack}`; ctx.fillText(host, cx, y + q + 34 * U + 38 * U); ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"; }); } });
      if (soc.length) { const cols = wide ? 1 : 2, cw = wide ? Math.min(b.w * 0.44, 560 * u) : b.w / 2; R1.push({ h: rows * rowH, d: (y) => { const cx0 = wide ? b.x + b.w * 0.76 - cw / 2 : b.x; soc.forEach((x, i) => {
        const col = i % cols, row = Math.floor(i / cols), r = Math.min(40 * U, rowH * 0.36), x0 = cx0 + col * cw + (wide ? 0 : cw * 0.06), yy = y + row * rowH + rowH / 2;
        withAnim(ctx, "rise", lin((lt - 1.2 - i * 0.12) / 0.5), 0, 0, u, () => { socialLogo(ctx, x.k, x0 + (x.k === "youtube" ? r * 1.3 : r), yy, r); ctx.fillStyle = th[4]; ctx.font = `700 ${Math.round(Math.min(34 * U, r * 0.9))}px ${P.font.stack}`; ctx.textAlign = "left"; ctx.textBaseline = "middle"; let txt = String(x.h), fs2 = Math.min(34 * U, r * 0.9); const mw = cw * (wide ? 0.8 : 0.86) - r * 3.1; while (fs2 > 16 * U && ctx.measureText(txt).width > mw) { fs2 *= 0.94; ctx.font = `700 ${Math.round(fs2)}px ${P.font.stack}`; } while (txt.length > 4 && ctx.measureText(txt).width > mw) txt = txt.slice(0, -2); ctx.fillText(txt, x0 + r * 2.9, yy + 2 * U); ctx.textBaseline = "alphabetic"; });
      }); } }); }
      return { L1, R1, gap };
    };
    const tot = (arr, gap) => arr.reduce((a, it) => a + it.h, 0) + gap * Math.max(0, arr.length - 1);
    let U = u, B = build(U); const need = wide ? Math.max(tot(B.L1, B.gap), tot(B.R1, B.gap)) : tot(B.L1, B.gap) + tot(B.R1, B.gap) + B.gap;
    const sf = Math.max(0.55, Math.min(1.12, b.h / Math.max(1, need))); if (Math.abs(sf - 1) > 0.02) { U = u * sf; B = build(U); }
    const place = (arr, y0, gap) => { let y = y0; arr.forEach((it) => { it.d(y); y += it.h + gap; }); return y; };
    if (wide) { place(B.L1, b.y + (b.h - tot(B.L1, B.gap)) / 2, B.gap); place(B.R1, b.y + (b.h - tot(B.R1, B.gap)) / 2, B.gap); }
    else { const total = tot(B.L1, B.gap) + tot(B.R1, B.gap) + B.gap; let y = b.y + Math.max(0, (b.h - total) / 2); y = place(B.L1, y, B.gap) + B.gap; place(B.R1, y, B.gap); }
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  };

  // ---- whiteboard: handwriting that is written live by a marker, with hand-drawn doodles
  // hook: a big claim or question for the first ~2 seconds
  L.hook = (ctx, P, th, g, sc, lt, A) => {
    const s = sc.s, u = g.u, b = { x: g.m, y: g.H * 0.18, w: g.W - g.m * 2, h: g.H * 0.5 }, t = fit(ctx, P, String(s.title).toUpperCase(), b.w, b.h, 60 * u, (g.port ? 170 : 140) * u, 1.02, 900), th_ = t.lines.length * t.size * t.lh, y0 = g.H * 0.5 - th_ / 2;
    const k = 1 + 0.06 * c01(lt / 1.8); ctx.save(); ctx.translate(g.W / 2, g.H / 2); ctx.scale(k, k); ctx.translate(-g.W / 2, -g.H / 2);
    textBlock(ctx, P, t.lines, g.W / 2, y0, t.size, t.lh, "center", th[4], "words", c01(lt / 0.9), { weight: 900, shadow: true });
    const sw = c01((lt - 0.5) / 0.5); ctx.fillStyle = th[3]; ctx.fillRect(g.W / 2 - 160 * u * sw, y0 + th_ + 24 * u, 320 * u * sw, 14 * u); ctx.restore();
  };
  // ticking checklist
  L.checklist = (ctx, P, th, g, sc, lt, A) => {
    const s = sc.s, u = g.u, b = contentBox(g, sc), items = (s.lines || []).filter(Boolean); let y = b.y;
    if (s.title) { const t = fit(ctx, P, s.title, b.w, b.h * 0.22, 36 * u, 70 * u, 1.1); withAnim(ctx, "rise", lin((lt - 0.05) / 0.6), 0, 0, u, () => textBlock(ctx, P, t.lines, b.x, y, t.size, t.lh, "left", th[3], "none", 1, { shadow: true })); y += t.lines.length * t.size * t.lh + 30 * u; }
    const n = Math.max(1, items.length), rh = Math.min(140 * u, (b.y + b.h - y) / n), bs = rh * 0.52, cq = cuesFor(sc, items, 0.4);
    items.forEach((it, i) => {
      const t0 = cq[i], yy = y + i * rh;
      withAnim(ctx, "slide", lin((lt - t0) / 0.5), 0, 0, u, () => {
        ctx.fillStyle = hexA(th[5], 0.9); rr(ctx, b.x, yy + 4 * u, b.w, rh - 12 * u, 22 * u); ctx.fill();
        ctx.lineWidth = 6 * u; ctx.strokeStyle = th[3]; rr(ctx, b.x + 26 * u, yy + (rh - bs) / 2 - 2 * u, bs, bs, 12 * u); ctx.stroke();
        const tp = c01((lt - t0 - 0.45) / 0.3); if (tp > 0) { ctx.strokeStyle = th[6]; ctx.lineWidth = 10 * u; ctx.lineCap = "round"; ctx.lineJoin = "round"; const x0 = b.x + 26 * u, y0 = yy + (rh - bs) / 2 - 2 * u; polyline(ctx, [[x0 + bs * 0.18, y0 + bs * 0.55], [x0 + bs * 0.42, y0 + bs * 0.8], [x0 + bs * 1.0, y0 + bs * 0.05]], tp); }
        let fz = Math.min(58 * u, rh * 0.5) * (P.font.scale || 1); const avail = b.w - bs - 90 * u; ctx.font = fstr(P, fz, 700); while (fz > 26 * u && MT(ctx, it) > avail) { fz *= 0.94; ctx.font = fstr(P, fz, 700); } ctx.fillStyle = th[4]; ctx.textBaseline = "middle"; ctx.textAlign = "left"; let txt = it; while (txt.length > 3 && MT(ctx, txt) > avail) txt = txt.slice(0, -2).trimEnd() + "…"; ctx.fillText(txt.replace(/\*\*/g, ""), b.x + bs + 56 * u, yy + rh / 2 - 2 * u); ctx.textBaseline = "alphabetic";
      });
    });
  };
  // chat bubbles (WhatsApp style): lines starting "me:" are on the right, anything else on the left
  L.chat = (ctx, P, th, g, sc, lt, A) => {
    const s = sc.s, u = g.u, b = contentBox(g, sc), msgs = (s.lines || []).filter(Boolean), hh = 96 * u;
    withAnim(ctx, "rise", lin(lt / 0.5), 0, 0, u, () => {
      ctx.fillStyle = "#0b141a"; rr(ctx, b.x, b.y, b.w, b.h, 28 * u); ctx.fill(); ctx.save(); rr(ctx, b.x, b.y, b.w, b.h, 28 * u); ctx.clip(); ctx.fillStyle = "#075e54"; ctx.fillRect(b.x, b.y, b.w, hh);
      ctx.fillStyle = "#cfd8dc"; ctx.beginPath(); ctx.arc(b.x + 54 * u, b.y + hh / 2, 30 * u, 0, Math.PI * 2); ctx.fill(); if (A.logo) { ctx.save(); ctx.beginPath(); ctx.arc(b.x + 54 * u, b.y + hh / 2, 30 * u, 0, Math.PI * 2); ctx.clip(); ctx.drawImage(A.logo, b.x + 24 * u, b.y + hh / 2 - 30 * u, 60 * u, 60 * u); ctx.restore(); }
      ctx.fillStyle = "#fff"; ctx.font = fstr(P, 34 * u * (P.font.scale || 1), 800); ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(s.title || "Chat", b.x + 100 * u, b.y + hh / 2); ctx.restore();
    });
    let y = b.y + hh + 26 * u; const fs = 38 * u * (P.font.scale || 1), mq = cuesFor(sc, msgs.map((m) => m.replace(/^(me|them):\s*/i, "")), 0.8);
    msgs.forEach((m, i) => {
      const mine = /^me:/i.test(m), txt = m.replace(/^(me|them):\s*/i, "").replace(/\*\*/g, ""), t0 = Math.max(0.6, mq[i]);
      ctx.font = fstr(P, fs, 600); const maxW = b.w * 0.72, ls = wrap(ctx, txt, maxW - 50 * u), w = Math.min(maxW, Math.max(...ls.map((l) => ctx.measureText(l).width)) + 50 * u), h = ls.length * fs * 1.25 + 36 * u;
      if (y + h > b.y + b.h - 10 * u) return;
      const typing = lt > t0 - 0.5 && lt < t0, p = c01((lt - t0) / 0.4), x = mine ? b.x + b.w - w - 24 * u : b.x + 24 * u;
      if (typing && !mine) { ctx.fillStyle = "#202c33"; rr(ctx, x, y, 120 * u, 64 * u, 30 * u); ctx.fill(); for (let d = 0; d < 3; d++) { ctx.fillStyle = "rgba(255,255,255," + (0.35 + 0.5 * Math.max(0, Math.sin(lt * 9 - d))) + ")"; ctx.beginPath(); ctx.arc(x + 34 * u + d * 26 * u, y + 32 * u, 8 * u, 0, Math.PI * 2); ctx.fill(); } }
      if (p > 0) { ctx.save(); ctx.globalAlpha *= c01(p * 3); const k = 0.8 + 0.2 * spring(p), cx = mine ? x + w : x, cy = y + h; ctx.translate(cx, cy); ctx.scale(k, k); ctx.translate(-cx, -cy); ctx.fillStyle = mine ? "#005c4b" : "#202c33"; rr(ctx, x, y, w, h, 24 * u); ctx.fill(); ctx.fillStyle = "#e9edef"; ctx.textBaseline = "top"; ctx.textAlign = "left"; ls.forEach((l, k2) => ctx.fillText(l, x + 25 * u, y + 18 * u + k2 * fs * 1.25)); ctx.restore(); }
      y += h + 18 * u;
    });
    ctx.textBaseline = "alphabetic";
  };
  const INK = "#1b2a41", HAND = '"Segoe Print","Bradley Hand","Chalkboard SE","Comic Sans MS","Marker Felt","Ink Free",cursive';
  function polyline(ctx, pts, p) {
    if (p <= 0 || pts.length < 2) return null; let tot = 0; const sg = [];
    for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); sg.push(d); tot += d; }
    let want = tot * c01(p), acc = 0, end = pts[0]; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) { if (acc + sg[i - 1] <= want) { ctx.lineTo(pts[i][0], pts[i][1]); acc += sg[i - 1]; end = pts[i]; } else { const f = (want - acc) / (sg[i - 1] || 1); end = [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f]; ctx.lineTo(end[0], end[1]); break; } }
    ctx.stroke(); return end;
  }
  const ell = (cx, cy, rx, ry, a0, a1, n) => { const o = []; for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n, j = 1 + 0.03 * Math.sin(a * 3); o.push([cx + Math.cos(a) * rx * j, cy + Math.sin(a) * ry * j]); } return o; };
  // doodles: arrays of strokes (polylines) inside the box x,y,w,h
  function doodle(kind, x, y, w, h) {
    const cx = x + w / 2, cy = y + h / 2, m = Math.min(w, h);
    if (kind === "underline") { const a = [], b2 = []; for (let i = 0; i <= 30; i++) a.push([x + (w * i) / 30, y + h * 0.5 + Math.sin(i * 0.9) * h * 0.12]); for (let i = 0; i <= 20; i++) b2.push([x + w * 0.08 + (w * 0.8 * i) / 20, y + h * 0.9 + Math.sin(i * 1.1) * h * 0.08]); return [a, b2]; }
    if (kind === "circle") return [ell(cx, cy, w / 2, h / 2, -2.2, 2 * Math.PI - 1.7, 44)];
    if (kind === "star") { const pts = []; for (let i = 0; i <= 5; i++) { const a = -Math.PI / 2 + ((i * 2) % 5) * ((2 * Math.PI) / 5); pts.push([cx + Math.cos(a) * m / 2, cy + Math.sin(a) * m / 2]); } const o = []; for (let i = 0; i < pts.length - 1; i++) for (let k = 0; k < 6; k++) o.push([pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k / 6, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k / 6]); o.push(pts[pts.length - 1]); return [o]; }
    if (kind === "arrow") { const o = []; for (let i = 0; i <= 24; i++) { const k = i / 24; o.push([x + w * k, y + h * (0.8 - 0.7 * k) - Math.sin(k * Math.PI) * h * 0.25]); } const ex = x + w, ey = y + h * 0.1; return [o, [[ex - w * 0.16, ey - h * 0.02], [ex, ey], [ex - w * 0.03, ey + h * 0.22]]]; }
    if (kind === "bulb") { const r = m * 0.3, by = cy - m * 0.1; const ray = []; for (let i = 0; i < 7; i++) { const a = -Math.PI + (Math.PI * (i + 0.5)) / 7 * 1.0 - 0; const ca = Math.cos(a), sa = Math.sin(a); ray.push([[cx + ca * r * 1.3, by + sa * r * 1.3], [cx + ca * r * 1.75, by + sa * r * 1.75]]); } return [ell(cx, by, r, r, 2.2, 2 * Math.PI + 0.95, 40), [[cx - r * 0.45, by + r * 1.05], [cx - r * 0.45, by + r * 1.5], [cx + r * 0.45, by + r * 1.5], [cx + r * 0.45, by + r * 1.05]], [[cx - r * 0.4, by + r * 1.75], [cx + r * 0.4, by + r * 1.75]], ...ray]; }
    if (kind === "person") { const hr = m * 0.12, hx = cx, hy = y + hr * 1.2; return [ell(hx, hy, hr, hr, 0, 2 * Math.PI, 28), [[hx, hy + hr], [hx, y + h * 0.62]], [[hx - m * 0.28, y + h * 0.38], [hx, y + h * 0.3], [hx + m * 0.28, y + h * 0.38]], [[hx, y + h * 0.62], [hx - m * 0.2, y + h]], [[hx, y + h * 0.62], [hx + m * 0.2, y + h]]]; }
    if (kind === "check") return [[[x + w * 0.1, cy], [x + w * 0.38, y + h * 0.85], [x + w * 0.92, y + h * 0.1]]];
    return [];
  }
  const DOODLES = { "": "Auto", underline: "Underline", circle: "Circle", star: "Star", arrow: "Arrow", bulb: "Light bulb", person: "Person", check: "Tick" };
  function drawHand(ctx, x, y, u) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(-0.6); ctx.shadowColor = "rgba(0,0,0,.25)"; ctx.shadowBlur = 8 * u; ctx.shadowOffsetY = 4 * u;
    ctx.fillStyle = "#d94b3d"; rr(ctx, 8 * u, -12 * u, 130 * u, 24 * u, 8 * u); ctx.fill(); ctx.fillStyle = "#222"; ctx.beginPath(); ctx.moveTo(8 * u, -8 * u); ctx.lineTo(-10 * u, 0); ctx.lineTo(8 * u, 8 * u); ctx.closePath(); ctx.fill();
    ctx.shadowColor = "transparent"; const sk = "#8a5638", dk = "#6e4229"; ctx.fillStyle = sk;
    ctx.beginPath(); ctx.ellipse(120 * u, 14 * u, 62 * u, 38 * u, 0.15, 0, Math.PI * 2); ctx.fill();
    [0, 1, 2].forEach((i) => { ctx.beginPath(); ctx.ellipse((48 + i * 16) * u, (-14 + i * 3) * u, 12 * u, 22 * u, 0.5, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = dk; ctx.lineWidth = 2 * u; ctx.stroke(); });
    ctx.beginPath(); ctx.ellipse(40 * u, 16 * u, 26 * u, 12 * u, -0.5, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = dk; ctx.stroke();
    ctx.restore();
  }
  L.whiteboard = (ctx, P, th, g, sc, lt, A) => {
    const s = sc.s, u = g.u, b = contentBox(g, sc), PP = Object.assign({}, P, { font: { stack: HAND, w: 700, scale: 1 } });
    const f0 = 12 * u, px = b.x + f0 + 36 * u, pw = b.w - f0 * 2 - 72 * u, ph = b.h - f0 * 2 - 60 * u, py = b.y + f0 + 30 * u;
    const lines = (s.lines || []).filter(Boolean), kinds = s.doodle || (lines.length ? "" : "underline");
    // layout
    const tFit = s.title ? fit(ctx, PP, s.title, pw, ph * (lines.length ? 0.3 : 0.45), 44 * u, (g.port ? 100 : 84) * u, 1.15) : null, tH = tFit ? tFit.lines.length * tFit.size * tFit.lh : 0;
    const itemsMaxH = ph - tH - (tFit ? 70 * u : 0), n = Math.max(1, lines.length);
    let isz = Math.min(60 * u, itemsMaxH / (n * 1.9)), items = [];
    for (let k = 0; k < 10; k++) { ctx.font = fstr(PP, isz, 700); items = lines.map((l) => wrap(ctx, l, pw - 90 * u)); const h = items.reduce((a, l) => a + l.length * isz * 1.2 + 26 * u, 0); if (h <= itemsMaxH || isz < 24 * u) break; isz *= 0.9; }
    const need = 24 * u + 60 * u + tH + (tFit ? 70 * u : 0) + items.reduce((a, l) => a + l.length * isz * 1.2 + 26 * u, 0) + ((s.doodle && s.doodle !== "underline") || (lines.length && !s.doodle) ? 190 * u : 30 * u);
    b.h = Math.max(Math.min(b.h, b.h * 0.42), Math.min(b.h, need));
    const bin = out3((lt - 0.05) / 0.5);
    ctx.save(); ctx.globalAlpha *= bin; ctx.translate(0, (1 - bin) * 30 * u);
    ctx.shadowColor = "rgba(0,0,0,.4)"; ctx.shadowBlur = 24 * u; ctx.shadowOffsetY = 10 * u; rr(ctx, b.x, b.y, b.w, b.h, 26 * u); ctx.fillStyle = "#cfd5de"; ctx.fill(); ctx.shadowColor = "transparent";
    const f = 12 * u; rr(ctx, b.x + f, b.y + f, b.w - f * 2, b.h - f * 2, 16 * u); ctx.fillStyle = "#fbfaf4"; ctx.fill();
    ctx.save(); rr(ctx, b.x + f, b.y + f, b.w - f * 2, b.h - f * 2, 16 * u); ctx.clip(); ctx.strokeStyle = "rgba(60,90,150,.08)"; ctx.lineWidth = 2 * u; ctx.beginPath(); for (let x = b.x; x < b.x + b.w; x += 60 * u) { ctx.moveTo(x, b.y); ctx.lineTo(x, b.y + b.h); } for (let y = b.y; y < b.y + b.h; y += 60 * u) { ctx.moveTo(b.x, y); ctx.lineTo(b.x + b.w, y); } ctx.stroke(); ctx.restore();
    // timing: spread over the scene
    const chars = (s.title || "").length + lines.reduce((a, l) => a + l.length, 0) + 1, speed = chars / Math.max(2.5, sc.dur - 1.6 - 0.6), cps = Math.max(8, Math.min(40, speed));
    let T = 0.5, pen = null; const wq = cuesFor(sc, lines, 1.4); const at = (t0, dur) => c01((lt - t0) / dur);
    let y = py; ctx.lineCap = "round"; ctx.lineJoin = "round";
    const writeLines = (ls, x, yy, size, lh, color, t0, wps) => { // reveal left→right line by line
      const tot = ls.reduce((a, l) => a + l.length, 0) || 1; let acc = 0;
      ls.forEach((l, i) => { ctx.font = fstr(PP, size, 700); const w = ctx.measureText(l).width, p = c01(((lt - t0) * wps - acc) / Math.max(1, l.length)); acc += l.length;
        if (p > 0) { ctx.save(); ctx.beginPath(); ctx.rect(x - 8 * u, yy + i * size * lh - size * 0.2, w * p + 10 * u, size * lh + size * 0.3); ctx.clip(); ctx.fillStyle = color; ctx.textBaseline = "top"; ctx.fillText(l, x, yy + i * size * lh); ctx.restore(); if (p < 1) pen = [x + w * p, yy + i * size * lh + size * 0.75]; else if (i === ls.length - 1) pen = [x + w + 6 * u, yy + i * size * lh + size * 0.75]; }
      }); return tot / wps;
    };
    if (tFit) {
      const d = writeLines(tFit.lines, px, y, tFit.size, tFit.lh, INK, T, cps * 0.8); T += d + 0.15; y += tH + 10 * u;
      const ul = (kinds === "underline" || (!kinds && true)) ? "underline" : "";
      if (ul && lt > T) { const bw = Math.min(pw, Math.max(...tFit.lines.map((l) => { ctx.font = fstr(PP, tFit.size, 700); return ctx.measureText(l).width; }))); ctx.strokeStyle = "#d62839"; ctx.lineWidth = 7 * u; const e2 = []; doodle("underline", px, y - 4 * u, bw, 26 * u).forEach((st, i) => { const r = polyline(ctx, st, at(T + i * 0.25, 0.4)); if (r) pen = r; }); T += 0.7; }
      y += 44 * u;
    }
    lines.forEach((l, i) => {
      const ls = items[i], h = ls.length * isz * 1.2; const t0 = Math.max(T, wq[i] - 0.2); ctx.strokeStyle = [ "#1b9e5a", "#1d6fd6", "#d62839", "#e08a00"][i % 4]; ctx.lineWidth = 6 * u;
      const r = polyline(ctx, [[px + 6 * u, y + isz * 0.55], [px + 24 * u, y + isz * 0.8], [px + 56 * u, y + isz * 0.25]], at(t0, 0.2)); if (r && lt < t0 + 0.2) pen = r;
      const d = writeLines(ls, px + 78 * u, y, isz, 1.2, INK, t0 + 0.2, cps); T = t0 + 0.2 + d + 0.2; y += h + 26 * u;
    });
    // bonus doodle bottom-right, after the writing
    const dk = (s.doodle && s.doodle !== "underline") ? s.doodle : (lines.length && !s.doodle ? "star" : "");
    if (dk && lt > T) { const dw = Math.min(pw * 0.3, 220 * u), dx = px + pw - dw - 10 * u, dy = b.y + b.h - f - 60 * u - dw * 0.95; ctx.strokeStyle = "#d62839"; ctx.lineWidth = 7 * u; const sts = doodle(dk, dx, dy, dw, dw * 0.95); sts.forEach((st, i) => { const r = polyline(ctx, st, at(T + (i * 0.5) / sts.length, 0.9 / sts.length + 0.15)); if (r) pen = r; }); }
    ctx.restore();
  };
  L.whiteboard.label = "Whiteboard (hand-drawn)";


  // ======== visual explainer layouts (VL) ========
  const VL = {};
  function visIcon(ctx, s, cx, cy, r, lt, th, u) {
    const kind = ICONS[s.icon] ? s.icon : (EXT.icons[s.icon] ? s.icon : autoIcon(s)), fn = ICONS[kind] || (EXT.icons[kind] && EXT.icons[kind].draw) || ICONS.star, e = spring((lt - 0.1) / 0.7), ga = ctx.globalAlpha;
    ctx.save(); ctx.translate(cx, cy); ctx.scale(Math.max(0.01, e), Math.max(0.01, e)); ctx.translate(-cx, -cy);
    for (let k = 0; k < 2; k++) { const ph = (lt * 0.45 + k / 2) % 1; ctx.globalAlpha = ga * 0.35 * (1 - ph); ctx.strokeStyle = th[3]; ctx.lineWidth = 4 * u; ctx.beginPath(); ctx.arc(cx, cy, r * (1 + 0.5 * ph), 0, Math.PI * 2); ctx.stroke(); } ctx.globalAlpha = ga;
    const gr = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r); gr.addColorStop(0, hexA(th[6], 0.4)); gr.addColorStop(1, hexA(th[5], 0.96));
    ctx.fillStyle = gr; ctx.shadowColor = "rgba(0,0,0,.35)"; ctx.shadowBlur = 24 * u; ctx.shadowOffsetY = 10 * u; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); ctx.shadowColor = "transparent"; ctx.strokeStyle = th[3]; ctx.lineWidth = 6 * u; ctx.stroke();
    fn(ctx, { x: cx, y: cy + Math.sin(lt * 1.7) * 4 * u }, r * 0.62, lt, th); ctx.restore();
  }
  // one step card: number node, text, accent edge; active = the newest one
  function visCard(ctx, P, th, u, x, y, w, h, text, label, p, active, done) {
    if (p <= 0) return; const e = spring(p);
    ctx.save(); ctx.globalAlpha *= c01(p * 2.5); ctx.translate((1 - e) * 110 * u, 0);
    ctx.shadowColor = "rgba(0,0,0,.28)"; ctx.shadowBlur = 16 * u; ctx.shadowOffsetY = 6 * u; ctx.fillStyle = hexA(th[5], active ? 0.98 : 0.86); rr(ctx, x, y, w, h, 26 * u); ctx.fill(); ctx.shadowColor = "transparent";
    ctx.lineWidth = (active ? 4 : 2) * u; ctx.strokeStyle = active ? th[3] : "rgba(255,255,255,.12)"; ctx.stroke();
    const nr = Math.min(34 * u, h * 0.3), nx = x + 58 * u, ny = y + h / 2;
    ctx.fillStyle = done ? th[6] : th[3]; ctx.beginPath(); ctx.arc(nx, ny, nr, 0, Math.PI * 2); ctx.fill();
    if (done) { ctx.strokeStyle = th[1]; ctx.lineWidth = nr * 0.28; ctx.lineCap = "round"; ctx.lineJoin = "round"; polyline(ctx, [[nx - nr * 0.42, ny + nr * 0.02], [nx - nr * 0.1, ny + nr * 0.34], [nx + nr * 0.46, ny - nr * 0.32]], 1); }
    else { ctx.font = fstr(P, nr * 1.15 * (P.font.scale || 1), 900); ctx.fillStyle = th[1]; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(label), nx, ny + 1 * u); ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"; }
    const tx = x + 58 * u + nr + 26 * u, tw = w - (tx - x) - 28 * u, t = fit(ctx, P, text, tw, h - 24 * u, 26 * u, 66 * u, 1.15, 700);
    textBlock(ctx, P, t.lines, tx, y + (h - t.lines.length * t.size * t.lh) / 2, t.size, t.lh, "left", th[4], "none", 1, { weight: 700 });
    ctx.restore();
  }
  VL.title = (ctx, P, th, g, sc, lt, A) => {
    const s = sc.s, u = g.u, b = g.box, cards = s.layout === "image" ? [] : visCards(s), n = cards.length, wide = g.wide;
    const r = Math.min(wide ? b.h * 0.2 : b.h * 0.14, 190 * u);
    const ix = wide ? b.x + b.w * 0.16 : b.x + b.w / 2, colX = wide ? b.x + b.w * 0.34 : b.x, colW = wide ? b.w * 0.66 : b.w;
    const t = fit(ctx, P, s.title || " ", colW, b.h * (wide ? 0.4 : 0.22), 44 * u, (g.port ? 112 : 92) * u, 1.08), tH = t.lines.length * t.size * t.lh;
    const sub = s.sub ? fit(ctx, P, s.sub, colW, b.h * 0.1, 26 * u, 46 * u, 1.2, 500) : null, subH = sub ? sub.lines.length * sub.size * sub.lh + 16 * u : 0;
    const gap = 20 * u, ch = n ? Math.min(210 * u, (b.h * (wide ? 0.6 : 0.4)) / n - gap) : 0, cardsH = n ? n * (ch + gap) : 0, headH = n ? b.h * 0.6 : b.h;
    let y;
    if (wide) { y = b.y + Math.max(0, (b.h - (tH + subH + cardsH + 30 * u)) / 2); visIcon(ctx, s, ix, b.y + b.h / 2, r * 1.4, lt, th, u); }
    else { const total = r * 2 + 36 * u + tH + 24 * u + subH; y = b.y + Math.max(0, (headH - total) / 2); visIcon(ctx, s, ix, y + r, r, lt, th, u); y += r * 2 + 36 * u; }
    withAnim(ctx, TXT[s.anim || P.anim] ? "none" : (s.anim || P.anim), lin((lt - 0.3) / 0.7), colX + colW / 2, y + tH / 2, u, () => textBlock(ctx, P, t.lines, colX + (wide ? 0 : colW / 2), y, t.size, t.lh, wide ? "left" : "center", th[4], s.anim || P.anim, (lt - 0.3) / 1.1, { shadow: true })); y += tH + 14 * u;
    const uw = Math.min(colW * 0.45, 340 * u) * io((lt - 0.8) / 0.6), ux = wide ? colX : colX + colW / 2 - uw / 2; ctx.fillStyle = th[3]; rr(ctx, ux, y, uw, 10 * u, 5 * u); ctx.fill(); y += 24 * u;
    if (sub) { withAnim(ctx, "rise", lin((lt - 1.0) / 0.6), 0, 0, u, () => textBlock(ctx, P, sub.lines, colX + (wide ? 0 : colW / 2), y, sub.size, sub.lh, wide ? "left" : "center", hexA(th[4], 0.85), "none", 1, { weight: 500 })); y += subH; }
    y = wide ? y + 14 * u : b.y + b.h - cardsH; const cq = cuesFor(sc, cards, 1.5, 1.2), k = cq.filter((c) => lt >= c).length;
    cards.forEach((c, i) => visCard(ctx, P, th, u, colX, y + i * (ch + gap), colW, ch, c, i + 1, c01((lt - cq[i]) / 0.55), i === k - 1, i < k - 1));
  };
  VL.narrator = VL.title; VL.image = L.image;
  VL.list = (ctx, P, th, g, sc, lt, A) => {
    const s = sc.s, u = g.u, b = g.box, items = visCards(s), n = Math.max(1, items.length), hr = 64 * u;
    visIcon(ctx, s, b.x + hr, b.y + hr + 4 * u, hr, lt, th, u);
    const hx = b.x + hr * 2 + 30 * u, hw = b.w - hr * 2 - 30 * u;
    if (s.title) { const tf = fit(ctx, P, s.title, hw, hr * 2.1, 32 * u, 66 * u, 1.08), th2 = tf.lines.length * tf.size * tf.lh; withAnim(ctx, "rise", lin((lt - 0.15) / 0.6), hx, b.y + hr + 4 * u, u, () => textBlock(ctx, P, tf.lines, hx, b.y + hr + 4 * u - th2 / 2, tf.size, tf.lh, "left", th[3], "none", 1, { shadow: true })); }
    const y0 = b.y + hr * 2 + 50 * u, meterH = 118 * u, region = b.y + b.h - meterH - y0, gap = 22 * u, ch = Math.min(250 * u, (region - gap * (n - 1)) / n);
    const cq = cuesFor(sc, items, 0.7, 1.6), ps = items.map((_, i) => out3((lt - cq[i]) / 0.55)), k = cq.filter((c) => lt >= c).length, sum = ps.reduce((a, x) => a + x, 0);
    // connector rail behind the nodes
    const nx = b.x + 58 * u, ya = y0 + ch / 2, yb = y0 + (n - 1) * (ch + gap) + ch / 2;
    if (n > 1) { ctx.save(); ctx.lineCap = "round"; ctx.strokeStyle = "rgba(255,255,255,.14)"; ctx.lineWidth = 8 * u; ctx.beginPath(); ctx.moveTo(nx, ya); ctx.lineTo(nx, yb); ctx.stroke(); ctx.strokeStyle = th[3]; ctx.beginPath(); ctx.moveTo(nx, ya); ctx.lineTo(nx, ya + (yb - ya) * c01((sum - 1) / (n - 1))); ctx.stroke(); ctx.restore(); }
    items.forEach((it, i) => visCard(ctx, P, th, u, b.x, y0 + i * (ch + gap), b.w, ch, it, i + 1, ps[i], i === k - 1, i < k - 1));
    // progress meter
    const my = b.y + b.h - meterH + 26 * u, frac = c01(sum / n), mw = g.port ? b.w : b.w - 130 * u;
    ctx.save(); ctx.font = fstr(P, 34 * u * (P.font.scale || 1), 800); ctx.fillStyle = th[4]; ctx.textBaseline = "top"; ctx.fillText("PROGRESS", b.x, my); ctx.textAlign = "right"; ctx.fillStyle = th[3]; ctx.fillText(Math.round(frac * 100) + "%", b.x + mw, my); ctx.textAlign = "left";
    const by = my + 56 * u; ctx.fillStyle = "rgba(255,255,255,.14)"; rr(ctx, b.x, by, mw, 20 * u, 10 * u); ctx.fill(); if (frac > 0) { const gr = ctx.createLinearGradient(b.x, 0, b.x + mw, 0); gr.addColorStop(0, th[6]); gr.addColorStop(1, th[3]); ctx.fillStyle = gr; rr(ctx, b.x, by, Math.max(20 * u, mw * frac), 20 * u, 10 * u); ctx.fill(); }
    ctx.restore();
  };
  VL.bullets = VL.checklist = VL.whiteboard = VL.list;
  VL.number = (ctx, P, th, g, sc, lt, A) => {
    const s = sc.s, u = g.u, b = g.box, raw = String(s.num || "0"), m = raw.match(/^([^\d-]*)(-?[\d,]*\.?\d+)(.*)$/);
    const pre = m ? m[1] : "", numS = m ? m[2] : raw, suf = m ? m[3] : "", target = parseFloat(numS.replace(/,/g, "")) || 0, dec = (numS.split(".")[1] || "").length, comma = /,/.test(numS);
    const pr = out5((lt - 0.25) / 1.6), val = target * pr, fmtN = (v) => { let r = v.toFixed(dec); if (comma) r = Number(r).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec }); return pre + r + suf; };
    const wide = g.wide, R0 = Math.min(wide ? b.h * 0.38 : b.w * 0.36, b.h * 0.3), cx = wide ? b.x + b.w * 0.27 : b.x + b.w / 2, cy = wide || (!s.title && !s.sub) ? b.y + b.h / 2 : b.y + R0 + b.h * 0.06, ratio = /%/.test(suf) ? c01(target / 100) : 1;
    const e = spring((lt - 0.05) / 0.7); ctx.save(); ctx.translate(cx, cy); ctx.scale(Math.max(0.01, e), Math.max(0.01, e)); ctx.translate(-cx, -cy);
    ctx.lineCap = "round"; ctx.lineWidth = 40 * u; ctx.strokeStyle = "rgba(255,255,255,.13)"; ctx.beginPath(); ctx.arc(cx, cy, R0, 0, Math.PI * 2); ctx.stroke();
    const a1 = -Math.PI / 2 + Math.PI * 2 * ratio * pr; if (pr > 0.001) { const gr = ctx.createLinearGradient(cx - R0, cy - R0, cx + R0, cy + R0); gr.addColorStop(0, th[6]); gr.addColorStop(1, th[3]); ctx.strokeStyle = gr; ctx.shadowColor = hexA(th[3], 0.55); ctx.shadowBlur = 26 * u; ctx.beginPath(); ctx.arc(cx, cy, R0, -Math.PI / 2, a1); ctx.stroke(); ctx.shadowColor = "transparent"; ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(cx + Math.cos(a1) * R0, cy + Math.sin(a1) * R0, 12 * u, 0, Math.PI * 2); ctx.fill(); }
    for (let i = 0; i < 3; i++) { const an = lt * 0.8 + i * 2.09, rr0 = R0 + 62 * u; ctx.fillStyle = hexA(i % 2 ? th[3] : th[6], 0.8); ctx.beginPath(); ctx.arc(cx + Math.cos(an) * rr0, cy + Math.sin(an) * rr0, (7 + i * 2) * u, 0, Math.PI * 2); ctx.fill(); }
    const full = fmtN(target), size = fit(ctx, P, full, R0 * 1.55, R0 * 1.0, 40 * u, 240 * u, 1, 900).size;
    ctx.font = fstr(P, size * (P.font.scale || 1), 900); ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = th[4]; ctx.shadowColor = hexA(th[3], 0.4); ctx.shadowBlur = 30 * u; ctx.fillText(fmtN(val), cx, cy + 4 * u); ctx.shadowColor = "transparent"; ctx.restore();
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    const tx = wide ? b.x + b.w * 0.55 : b.x, tw = wide ? b.w * 0.45 : b.w; let y = wide ? cy - 80 * u : cy + R0 + 100 * u;
    if (s.title) { const t = fit(ctx, P, s.title, tw, b.h * 0.2, 34 * u, 76 * u, 1.12); withAnim(ctx, "rise", lin((lt - 0.8) / 0.6), 0, 0, u, () => textBlock(ctx, P, t.lines, wide ? tx : b.x + b.w / 2, y, t.size, t.lh, wide ? "left" : "center", th[4], "none", 1, { shadow: true })); y += t.lines.length * t.size * t.lh + 18 * u; }
    if (s.sub) { const t = fit(ctx, P, s.sub, tw, b.h * 0.14, 26 * u, 46 * u, 1.2, 500); withAnim(ctx, "rise", lin((lt - 1.1) / 0.6), 0, 0, u, () => textBlock(ctx, P, t.lines, wide ? tx : b.x + b.w / 2, y, t.size, t.lh, wide ? "left" : "center", hexA(th[4], 0.82), "none", 1, { weight: 500 })); }
  };
  VL.quote = (ctx, P, th, g, sc, lt, A) => {
    const s = sc.s, u = g.u, b = g.box, pad = 54 * u, t = fit(ctx, P, s.title || " ", b.w - pad * 2 - 20 * u, b.h * 0.5, 36 * u, (g.port ? 84 : 72) * u, 1.18, 800), tH = t.lines.length * t.size * t.lh;
    const sub = s.sub ? 70 * u : 0, cardH = pad * 2 + 110 * u + tH + sub, cy0 = b.y + Math.max(0, (b.h - cardH) / 2), e = spring((lt - 0.05) / 0.7);
    ctx.save(); ctx.globalAlpha *= c01(e * 2); ctx.translate(0, (1 - e) * 60 * u);
    ctx.shadowColor = "rgba(0,0,0,.3)"; ctx.shadowBlur = 24 * u; ctx.shadowOffsetY = 10 * u; ctx.fillStyle = hexA(th[5], 0.95); rr(ctx, b.x, cy0, b.w, cardH, 34 * u); ctx.fill(); ctx.shadowColor = "transparent";
    ctx.fillStyle = th[3]; rr(ctx, b.x, cy0, 14 * u, cardH * io((lt - 0.2) / 0.8), 7 * u); ctx.fill();
    ctx.font = fstr(P, 220 * u, 900); ctx.fillStyle = hexA(th[3], 0.9); ctx.textBaseline = "alphabetic"; ctx.fillText("“", b.x + pad * 0.8, cy0 + pad + 120 * u);
    textBlock(ctx, P, t.lines, b.x + pad + 14 * u, cy0 + pad + 110 * u, t.size, t.lh, "left", th[4], "words", (lt - 0.5) / 1.6, { weight: 800 });
    if (s.sub) { ctx.font = fstr(P, 32 * u * (P.font.scale || 1), 700); ctx.fillStyle = th[6]; ctx.globalAlpha *= c01((lt - 1.8) / 0.5); ctx.fillText("— " + s.sub, b.x + pad + 14 * u, cy0 + cardH - pad * 0.75); }
    ctx.restore();
  };
  VL.chat = (...a) => L.chat(...a); VL.outro = (...a) => L.outro(...a); VL.hook = (...a) => L.hook(...a);
  // top progress rail: one segment per content scene, the current one fills as it plays, plus "STEP 2 OF 6"
  function visRail(ctx, P, th, g, tl, i, lt) {
    const cur = tl[i]; if (!cur || cur.s.layout === "hook" || cur.s.layout === "outro") return;
    const steps = tl.map((x, k) => [x, k]).filter(([x]) => x.s.layout !== "hook" && x.s.layout !== "outro"), N = steps.length, pos = steps.findIndex(([, k]) => k === i); if (N < 1 || pos < 0) return;
    const u = g.u, y = g.wide ? g.H * 0.06 : g.H * 0.092, gap = 10 * u, w = (g.W - g.m * 2 - gap * (N - 1)) / N, h = 10 * u;
    ctx.save();
    steps.forEach(([x], k) => { const sx = g.m + k * (w + gap); ctx.fillStyle = "rgba(255,255,255,.16)"; rr(ctx, sx, y, w, h, h / 2); ctx.fill(); const f = k < pos ? 1 : k === pos ? c01(lt / cur.dur) : 0; if (f > 0) { ctx.fillStyle = th[3]; ctx.shadowColor = hexA(th[3], 0.6); ctx.shadowBlur = k === pos ? 14 * u : 0; rr(ctx, sx, y, Math.max(h, w * f), h, h / 2); ctx.fill(); ctx.shadowColor = "transparent"; } });
    const e = out3(lt / 0.4); ctx.globalAlpha = e; ctx.font = `800 ${Math.round(34 * u)}px ${P.font.stack}`; ctx.fillStyle = th[3]; ctx.textBaseline = "top"; ctx.textAlign = "left"; ctx.fillText("STEP " + (pos + 1) + " OF " + N, g.m, y + 24 * u - (1 - e) * 10 * u);
    ctx.restore();
  }

  // ---- cover: the first frames of every video are a thumbnail (title + narrator), so any platform grabs a good one
  const COVER = 6 / 30;
  function drawCover(ctx, P, th, tl, A) {
    const W = ctx.canvas.width, H = ctx.canvas.height, first = tl[0] ? tl[0].s : {}, cv = P.cover || {};
    const title = cv.title || first.title || P.name || "", sub = cv.sub || first.sub || "", pose = cv.pose === undefined || cv.pose === "" ? (first.pose || "wave-hello") : cv.pose;
    const fake = { s: { id: "cover", pose, title, sub, icon: cv.icon || "", posePos: "center", plate: cv.plate || P.plate || "none" }, a: null, lead: 0, dur: 9, start: 0 }, g = geom(W, H, P, { a: null });
    background(ctx, P, th, P.bg, 1.2, g, tl[0] || fake, 1, A);
    const u = g.u, b = { x: g.m, y: g.top, w: W - g.m * 2, h: g.bottom - g.top };
    const tfit = fit(ctx, P, title.toUpperCase(), b.w, b.h * (g.wide ? 0.62 : 0.34), 60 * u, (g.port ? 150 : 130) * u, 1.04, 900);
    let ty = g.wide ? b.y + b.h * 0.12 : b.y + b.h * 0.04, tx = g.wide ? b.x : b.x + b.w / 2; const al = g.wide ? "left" : "center";
    if (g.wide) { b.w *= 0.55; }
    const tf2 = g.wide ? fit(ctx, P, title.toUpperCase(), b.w, b.h * 0.62, 60 * u, 130 * u, 1.04, 900) : tfit;
    ctx.save(); ctx.fillStyle = th[3]; rr(ctx, g.wide ? tx : tx - 90 * u, ty - 22 * u, 180 * u, 12 * u, 6 * u); ctx.fill(); ctx.restore();
    textBlock(ctx, P, tf2.lines, tx, ty, tf2.size, tf2.lh, al, th[4], "none", 1, { weight: 900, shadow: true }); ty += tf2.lines.length * tf2.size * tf2.lh + 20 * u;
    if (sub) { const sf = fit(ctx, P, sub, b.w, b.h * 0.14, 28 * u, 50 * u, 1.2, 700); textBlock(ctx, P, sf.lines, tx, ty, sf.size, sf.lh, al, th[6], "none", 1, { weight: 700, shadow: true }); }
    if (g.wide) fake.s.posePos = "right";
    fake.big = g.wide ? 1.12 : 1.5; const saved = g.bottom; g.bottom = g.wide ? H * 0.97 : H * 0.95;
    const pb = poseBox(g, fake); if (pb && g.port) { /* keep inside */ }
    drawPose(ctx, g, fake, 3, 3, A, th, P); g.bottom = saved;
  }

  // ---- logo watermark, bottom right: circle with a thin white ring + glossy reflection
  function watermark(ctx, P, g, A) {
    if (P.watermark === false || !A.logo) return;
    const u = g.u, r = 44 * u, cx = g.W - g.m * 0.55 - r, cy = g.H - (g.port ? g.H * 0.035 : g.H * 0.04) - r;
    ctx.save(); ctx.globalAlpha = 0.95; ctx.shadowColor = "rgba(0,0,0,.45)"; ctx.shadowBlur = 12 * u; ctx.shadowOffsetY = 3 * u; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = "#fff"; ctx.fill(); ctx.shadowColor = "transparent";
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r - 2 * u, 0, Math.PI * 2); ctx.clip(); ctx.drawImage(A.logo, cx - r, cy - r, r * 2, r * 2);
    const gl = ctx.createLinearGradient(cx - r, cy - r, cx + r * 0.2, cy + r * 0.6); gl.addColorStop(0, "rgba(255,255,255,.45)"); gl.addColorStop(0.5, "rgba(255,255,255,.08)"); gl.addColorStop(1, "rgba(255,255,255,0)"); ctx.fillStyle = gl; ctx.beginPath(); ctx.ellipse(cx - r * 0.1, cy - r * 0.5, r * 0.95, r * 0.55, -0.4, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    ctx.lineWidth = 2 * u; ctx.strokeStyle = "#fff"; ctx.beginPath(); ctx.arc(cx, cy, r - 1 * u, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  // ---- the frame
  function draw(ctx, P, t, A) {
    const W = ctx.canvas.width, H = ctx.canvas.height, tl = A.tl || timeline(P, A.aud), th = THEMES[P.theme] || THEMES[0];
    const PP = Object.assign({}, P, { font: FONTS[P.font] || FONTS.sans, em: th[6], hlOn: (P.audio === "music" || P.audio === "none") && P.noHuman !== false, visOn: isVis(P) });
    ctx.save(); ctx.clearRect(0, 0, W, H);
    if (tl.length && t < COVER && P.cover !== false) { drawCover(ctx, PP, th, tl, A); watermark(ctx, P, geom(W, H, PP, { a: null }), A); ctx.restore(); return; }
    if (!tl.length) { ctx.fillStyle = "#0b120f"; ctx.fillRect(0, 0, W, H); ctx.fillStyle = "#9fb8aa"; ctx.font = "700 " + Math.round(W / 18) + "px sans-serif"; ctx.textAlign = "center"; ctx.fillText("Add a scene to start", W / 2, H / 2); ctx.restore(); return; }
    t = clamp(t, 0, tl.total - 0.001);
    let i = tl.findIndex((x) => t >= x.start && t < x.end); if (i < 0) i = tl.length - 1;
    const sc = tl[i], lt = t - sc.start, g = geom(W, H, PP, sc), MO = Number(P.motion) || 1, TR = 0.55, last = i === tl.length - 1;
    const intro = i === 0 && P.cover !== false ? c01((t - COVER) / 0.2) : 1;   // first scene melts in from the cover
    if (intro < 1) drawCover(ctx, PP, th, tl, A);
    ctx.save(); ctx.globalAlpha = intro; background(ctx, PP, th, sc.s.bg || P.bg, t, g, sc, lt, A); ctx.restore();
    const tout = last && sc.s.layout !== "outro" ? 1 - c01((lt - (sc.dur - 0.6)) / 0.6) : 1;
    const layer = (j, ltj, fx) => {
      const s2 = tl[j], g2 = geom(W, H, PP, s2), l2 = ltj * MO;
      ctx.save(); ctx.globalAlpha *= fx.a; ctx.translate(W / 2 + fx.dx, H / 2 + fx.dy); const cam = fx.s * (1 + 0.035 * c01(ltj / s2.dur)); ctx.scale(cam, cam); ctx.translate(-W / 2, -H / 2);
      if (!g2.vis && s2.s.layout !== "image" && s2.s.layout !== "whiteboard") drawPose(ctx, g2, s2, l2, t, A, th, PP);
      (g2.vis ? (VL[s2.s.layout] || VL.title) : (L[s2.s.layout] || L.title))(ctx, PP, th, g2, s2, l2, A);
      if (!g2.vis && (s2.s.layout === "image" || s2.s.layout === "whiteboard")) drawPose(ctx, g2, s2, l2, t, A, th, PP);
      ctx.restore();
    };
    const kind = PP.visOn ? ["slide", "wipe", "circle", "zoom"][i % 4] : (sc.s.trans || "up"), CLIPK = { wipe: 1, circle: 1, doors: 1 }, TRk = CLIPK[kind] ? 0.65 : TR, e = out3(lt / TRk), ie = io(lt / TRk);
    if (i > 0 && lt < TRk) { const pj = tl[i - 1]; layer(i - 1, pj.dur + lt, { a: CLIPK[kind] ? 1 : 1 - c01(lt / 0.18), dx: kind === "slide" ? -e * W * 0.14 : 0, dy: kind === "up" ? -e * H * 0.05 : 0, s: kind === "zoom" ? 1 + 0.06 * e : kind === "zoomthru" ? 1 + 0.5 * e : 1 }); }
    ctx.save();
    if (i > 0 && lt < TRk) { if (kind === "wipe") { ctx.beginPath(); ctx.rect(0, 0, W * ie, H); ctx.clip(); } else if (kind === "circle") { ctx.beginPath(); ctx.arc(W / 2, H / 2, Math.hypot(W, H) * 0.52 * ie, 0, Math.PI * 2); ctx.clip(); } else if (kind === "doors") { ctx.beginPath(); ctx.rect(W / 2 * (1 - ie), 0, W * ie, H); ctx.clip(); } if (CLIPK[kind]) background(ctx, PP, th, sc.s.bg || P.bg, t, g, sc, lt, A); }
    layer(i, lt, { a: intro * (CLIPK[kind] ? 1 : c01(i > 0 ? (lt - 0.1) / 0.25 : 1)) * tout, dx: kind === "slide" && i > 0 ? (1 - e) * W * 0.2 : 0, dy: kind === "up" && i > 0 ? (1 - e) * H * 0.06 : 0, s: i > 0 ? (kind === "zoom" ? 0.92 + 0.08 * e : kind === "zoomthru" ? 1.35 - 0.35 * e : 1) : 1 });
    ctx.restore();
    // overlays (not part of the transition)
    ctx.save(); ctx.globalAlpha = tout * intro;
    if (!PP.visOn) { viz(ctx, PP, th, g, sc, lt, P.viz); captions(ctx, PP, th, g, sc, lt); }
    ctx.restore();
    if (PP.visOn) { if (i > 0 && lt < 0.55 && sc.s.layout !== "outro") { const q = io(lt / 0.55), bx = -W * 0.4 + W * 1.8 * q; ctx.save(); ctx.globalAlpha = 0.9 * (1 - c01((lt - 0.35) / 0.2)); ctx.fillStyle = th[3]; ctx.beginPath(); ctx.moveTo(bx, 0); ctx.lineTo(bx + W * 0.28, 0); ctx.lineTo(bx + W * 0.28 - H * 0.12, H); ctx.lineTo(bx - H * 0.12, H); ctx.closePath(); ctx.fill(); ctx.fillStyle = "#fff"; ctx.globalAlpha *= 0.6; ctx.beginPath(); ctx.moveTo(bx + W * 0.30, 0); ctx.lineTo(bx + W * 0.32, 0); ctx.lineTo(bx + W * 0.32 - H * 0.12, H); ctx.lineTo(bx + W * 0.30 - H * 0.12, H); ctx.closePath(); ctx.fill(); ctx.restore(); } visRail(ctx, PP, th, g, tl, i, lt); }
    if (P.progress && !PP.visOn) { ctx.fillStyle = hexA(th[3], 0.25); ctx.fillRect(g.m, H * 0.02, W - g.m * 2, 6 * g.u); ctx.fillStyle = th[3]; ctx.fillRect(g.m, H * 0.02, (W - g.m * 2) * (t / tl.total), 6 * g.u); }
    if (P.handle && sc.s.layout !== "outro" && sc.s.layout !== "hook") { ctx.save(); ctx.globalAlpha = 0.75; ctx.font = fstr(PP, 30 * g.u * (PP.font.scale || 1), 700); ctx.fillStyle = th[4]; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic"; ctx.fillText(P.handle, W / 2, g.wide ? H - H * 0.02 : H * 0.058); ctx.restore(); }
    watermark(ctx, P, g, A);
    ctx.restore();
  }

  // ---- helpers for the studio
  function loadImage(src) { return new Promise((res) => { const im = new Image(); im.crossOrigin = "anonymous"; im.onload = () => res(im); im.onerror = () => res(null); im.src = src; }); }
  async function loadAssets(P, store, aud) {
    const A = { imgs: store.imgs || {}, poses: {}, qr: {}, aud: aud || {}, logo: await loadImage("/assets/icons/icon-192.png") };
    const SC = scenesOf(P), need = new Set(SC.map((s) => s.pose).filter((x) => x && x !== "host")); need.add((P.cover && P.cover.pose) || (SC[0] && SC[0].pose) || "wave-hello"); if (SC.some((s) => s.layout === "narrator")) need.add("wave-hello"); if (SC.some((s) => s.pose && s.narration)) GEST.forEach((n) => need.add(n)); need.delete("host");
    await Promise.all([...need].map(async (n) => { A.poses[n] = await loadImage(`/assets/narrators/${n}.png`); }));
    for (const s of SC) if (s.layout === "outro" && s.qr && window.EO_QR) {
      const c = document.createElement("canvas"); window.EO_QR.drawQR(c, s.qr.startsWith("/") ? (/^(localhost|127\.|192\.168\.)/.test(location.hostname) ? "https://ezra-ogombo.web.app" : location.origin) + s.qr : s.qr, 400); A.qr[s.id] = c;
    }
    if (Object.keys(A.qr).length) await new Promise((r) => setTimeout(r, 350));   // the logo in the middle of the QR loads a moment later
    return A;
  }

  function register(pack) {
    pack = pack || {};
    Object.entries(pack.layouts || {}).forEach(([k, v]) => { L[k] = v.draw; LAYOUTS[k] = v.label || k; });
    Object.entries(pack.backgrounds || {}).forEach(([k, v]) => { EXT.bg[k] = v; BGS[k] = v.label || k; });
    Object.entries(pack.icons || {}).forEach(([k, v]) => { EXT.icons[k] = v; ICON_KEYS[k] = v.label || k; });
    Object.entries(pack.themes || {}).forEach(([k, v]) => THEMES.push([k].concat(v)));
    Object.entries(pack.anims || {}).forEach(([k, v]) => { ANIMS[k] = v; });
  }
  window.EO_VID = { isVis, register, ICON_KEYS, SOCIALS, DOODLES, COVER, scenesOf, FORMATS, THEMES, FONTS, LAYOUTS, ANIMS, BGS, LEAD, TAIL, newScene, newProject, newId, outSize, timeline, draw, loadAssets, loadImage, wrap, fit };
})();
