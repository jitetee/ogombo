// ============================================================
// Whiteboard script importer (EO_WB_IMPORT). Turns a JSON "script" into a full whiteboard project.
// A scene can be (a) a LAYOUT ("layout":"steps", "icons", "bullets", ...) that is placed automatically, or
// (b) raw "items" with x/y positions, or both (layout first, then extra items). See assets/whiteboard/import-guide.md.
// ============================================================
(function () {
  const W = window.EO_WB, LAYOUTS = ["title", "bullets", "icons", "steps", "compare", "pie", "quote", "narrator", "cardnotes"];
  const ITEM_TYPES = ["text", "tag", "icon", "figure", "narrator", "shape", "arrow", "pie", "image", "emoji", "ink"];
  const asObj = (x, key) => (typeof x === "string" || typeof x === "number" ? { [key]: String(x) } : x || {});
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  function place(sc, P) {
    const z = W.size(P), w = z.w, h = z.h, wide = w >= h, out = [], L = sc.layout;
    const add = (o) => { out.push(Object.assign({ id: W.newId() }, o)); return o; };
    const lines = (txt, size, maxW) => Math.max(1, Math.ceil((String(txt).length * size * 0.6) / maxW));
    const cueOf = (o) => (o && o.cue) || undefined;
    const fit = (txt, size, maxW, minS) => Math.max(minS, Math.min(size, Math.round(maxW / (Math.max(1, String(txt).length) * 0.62))));
    const title = (txt, cue) => txt ? add({ type: "text", x: w * 0.07, y: h * 0.06, text: txt, size: fit(txt, Math.round(h * (wide ? 0.105 : 0.06)), w * 0.86, Math.round(h * 0.055)), color: P.accent, maxW: w * 0.86, cue }) : null;
    const topY = sc.title ? h * (wide ? 0.27 : 0.2) : h * 0.16;
    const pic = (x, y, pw) => {   // optional narrator pose or doodle figure
      if (sc.narrator) return add({ type: "narrator", pose: sc.narrator, x, y, w: pw }) && pw;
      if (sc.figure) return add({ type: "figure", pose: sc.figure, acc: sc.acc || "hair scrub", x, y, w: pw }) && pw;
      return 0;
    };
    if (L === "title") {
      const has = sc.narrator || sc.figure, tx = has && wide ? w * 0.4 : w * 0.08, tw = has && wide ? w * 0.54 : w * 0.84, size = Math.min(Math.round(h * (wide ? 0.14 : 0.085)), Math.round(tw / (Math.max(...String(sc.title || "").split(/\s+/).map((x) => x.length), 1) * 0.66))), ty = h * (has && !wide ? 0.12 : 0.24);
      if (has) { const pw = wide ? w * 0.3 : w * 0.55; sc.narrator ? add({ type: "narrator", pose: sc.narrator, x: wide ? w * 0.05 : (w - pw) / 2, y: wide ? h * 0.12 : h * 0.55, w: pw }) : add({ type: "figure", pose: sc.figure, acc: sc.acc || "hair scrub", x: wide ? w * 0.07 : (w - pw * 0.6) / 2, y: wide ? h * 0.16 : h * 0.5, w: pw * 0.7 }); }
      add({ type: "text", x: tx, y: ty, text: sc.title || "", size, color: P.accent, maxW: tw, cue: sc.titleCue });
      const ul = ty + lines(sc.title || "", size, tw) * size * 1.18 + 10; add({ type: "shape", shape: "underline", x: tx, y: ul, w: Math.min(tw, String(sc.title || "").length * size * 0.6), h: 30, color: P.blue, lw: 9 });
      if (sc.subtitle) add({ type: "text", x: tx, y: ul + 60, text: sc.subtitle, size: Math.round(h * (wide ? 0.065 : 0.045)), maxW: tw, cue: sc.subtitleCue });
    } else if (L === "bullets") {
      title(sc.title, sc.titleCue); const pts = (sc.bullets || []).slice(0, 7), size = Math.round(h * (wide ? 0.06 : 0.04)), step = Math.min(h * 0.14, (h * 0.88 - topY) / Math.max(1, pts.length)), off = Math.max(0, ((h * 0.88 - topY) - step * pts.length) * 0.3), pw = (sc.narrator || sc.figure) && wide ? w * 0.26 : 0, x0 = w * 0.07 + pw * 1.2;
      if (pw) pic(w * 0.05, h * 0.3, pw);
      pts.forEach((b, i) => { const o = asObj(b, "text"), y = topY + off + i * step; add({ type: "icon", name: o.icon || "circle-check", x: x0, y: y - 4, w: size * 1.25, color: P.blue, cue: o.cue }); add({ type: "text", x: x0 + size * 1.7, y, text: o.text || "", size, maxW: w * 0.93 - x0 - size * 1.7, cue: o.cue }); });
    } else if (L === "icons") {
      title(sc.title, sc.titleCue); const its = (sc.icons || []).slice(0, 8), n = its.length || 1, per = wide ? (n <= 4 ? n : Math.ceil(n / 2)) : (n <= 2 ? n : 2), rows = Math.ceil(n / per), cw = (w * 0.9) / per, iw = Math.min(cw * 0.55, h * (rows > 1 ? 0.2 : 0.3)), size = Math.round(h * (wide ? 0.052 : 0.036)), rowH = (h * 0.9 - topY) / rows;
      its.forEach((o0, i) => { const o = asObj(o0, "label"), r = Math.floor(i / per), c = i % per, cx = w * 0.05 + cw * (c + 0.5), y = topY + r * rowH + Math.max(0, (rowH - iw - size * 2.2) * 0.4); add({ type: "icon", name: o.icon || "star", pack: o.pack, x: cx - iw / 2, y, w: iw, color: o.color, cue: o.cue }); if (o.label) add({ type: "text", x: cx, y: y + iw + 22, text: o.label, size, align: "center", maxW: cw * 0.95, cue: o.cue }); });
    } else if (L === "steps") {
      title(sc.title, sc.titleCue); const st = (sc.steps || []).slice(0, 8), size = Math.round(h * (wide ? 0.07 : 0.05)), tws = st.map((s0) => asObj(s0, "text")).map((o) => String(o.text || "").length * size * 0.72 + size), gap = size * 1.6, rowsA = []; let cur = [], cw0 = 0;
      tws.forEach((tw, i) => { if (cur.length && cw0 + gap + tw > w * 0.9) { rowsA.push(cur); cur = []; cw0 = 0; } cur.push(i); cw0 += (cur.length > 1 ? gap : 0) + tw; }); if (cur.length) rowsA.push(cur);
      const rowH = (h * 0.88 - topY) / rowsA.length;
      rowsA.forEach((row, r) => { const tot = row.reduce((a, i) => a + tws[i], 0) + gap * (row.length - 1); let x = (w - tot) / 2; const y = topY + r * rowH + rowH * (rowsA.length > 1 ? 0.1 : 0.22);
        row.forEach((i, k) => { const o = asObj(st[i], "text"); add({ type: "tag", x, y, text: o.text || "", size, cue: o.cue }); if (o.icon) add({ type: "icon", name: o.icon, x: x + tws[i] / 2 - h * 0.07, y: y + size * 1.9, w: h * 0.14, cue: o.cue });
          if (k < row.length - 1) add({ type: "arrow", x: x + tws[i] + 8, y: y + size * 0.65, x2: x + tws[i] + gap - 8, y2: y + size * 0.65, bend: 0.15, head: 26, cue: asObj(st[row[k + 1]], "text").cue }); x += tws[i] + gap; }); });
    } else if (L === "compare") {
      title(sc.title, sc.titleCue); const size = Math.round(h * (wide ? 0.07 : 0.05)), ps = Math.round(h * (wide ? 0.05 : 0.036));
      [["left", w * 0.06], ["right", w * 0.53]].forEach(([k, x]) => { const c = sc[k] || {}, cw = w * 0.41; add({ type: "tag", x, y: topY, text: c.title || k.toUpperCase(), size, cue: c.cue });
        let y = topY + size * 1.9; if (c.icon) { add({ type: "icon", name: c.icon, x: x, y, w: h * 0.16, cue: c.cue }); y += h * 0.19; }
        (c.points || []).slice(0, 5).forEach((p0) => { const o = asObj(p0, "text"); add({ type: "text", x, y, text: o.text || "", size: ps, maxW: cw, cue: o.cue }); y += lines(o.text || "", ps, cw) * ps * 1.2 + ps * 0.5; }); });
      if (sc.vs !== false) add({ type: "text", x: w / 2, y: topY - 4, text: sc.vsText || "VS", size: Math.round(h * 0.06), align: "center", color: P.accent });
    } else if (L === "pie") {
      title(sc.title, sc.titleCue); const r = h * (wide ? 0.27 : 0.2), px = wide ? w * 0.56 : (w - r * 2) / 2, py = wide ? topY - h * 0.02 : h * 0.4, size = Math.round(h * (wide ? 0.055 : 0.04)), lb = sc.labels || [];
      add({ type: "pie", x: px, y: py, r, pct: sc.pct == null ? 25 : sc.pct, l1: lb[0], l2: lb[1], cue: sc.pieCue });
      let y = topY; (sc.points || []).slice(0, 5).forEach((p0) => { const o = asObj(p0, "text"); add({ type: "text", x: w * 0.07, y, text: o.text || "", size, maxW: wide ? w * 0.42 : w * 0.86, cue: o.cue }); y += lines(o.text || "", size, wide ? w * 0.42 : w * 0.86) * size * 1.2 + size * 0.6; });
    } else if (L === "quote") {
      const size = Math.round(h * (wide ? 0.1 : 0.06)), tw = w * 0.84, ty = h * (sc.narrator || sc.figure ? 0.18 : 0.3); add({ type: "text", x: w / 2, y: ty, text: sc.text || sc.title || "", size, align: "center", maxW: tw, color: sc.color || P.ink, cue: sc.cue });
      const ul = ty + lines(sc.text || sc.title || "", size, tw) * size * 1.18 + 10; add({ type: "shape", shape: "underline", x: w * 0.25, y: ul, w: w * 0.5, h: 30, color: P.accent, lw: 9 }); if (sc.by) add({ type: "text", x: w / 2, y: ul + 50, text: sc.by, size: Math.round(h * 0.05), align: "center", color: P.blue });
    } else if (L === "narrator") {
      const pw = wide ? w * 0.34 : w * 0.7; add({ type: "narrator", pose: sc.narrator || "neutral", x: wide ? w * 0.04 : (w - pw) / 2, y: wide ? h * 0.1 : h * 0.5, w: pw }); const tx = wide ? w * 0.42 : w * 0.08, tw = wide ? w * 0.52 : w * 0.84;
      let y = h * (wide ? 0.14 : 0.06); if (sc.title) { add({ type: "text", x: tx, y, text: sc.title, size: Math.round(h * (wide ? 0.1 : 0.06)), color: P.accent, maxW: tw, cue: sc.titleCue }); y += lines(sc.title, h * (wide ? 0.1 : 0.06), tw) * h * (wide ? 0.12 : 0.07) + h * 0.04; }
      (sc.points || []).slice(0, 5).forEach((p0) => { const o = asObj(p0, "text"), ps = Math.round(h * (wide ? 0.058 : 0.04)); add({ type: "text", x: tx, y, text: o.text || "", size: ps, maxW: tw, cue: o.cue }); y += lines(o.text || "", ps, tw) * ps * 1.2 + ps * 0.55; });
    } else if (L === "cardnotes") {
      // revise a content card: the card is drawn, then highlights, circles and handwritten notes are added on top as it is spoken
      const src = sc.src || "/assets/content/" + sc.card + ".jpg", cw = Math.min(w * 0.9, h * 0.5), cx = (w - cw) / 2, cy = h * (sc.top == null ? 0.19 : sc.top), k = cw / 600, n = clamp(+sc.rows || 4, 3, 5), pitch = 0.43 / n;
      if (sc.title) add({ type: "text", x: w / 2, y: h * 0.045, text: sc.title, size: Math.round(h * 0.042), align: "center", maxW: w * 0.9, color: P.accent, cue: sc.titleCue });
      add({ type: "image", src, x: cx, y: cy, w: cw, h: cw, reveal: "scan", cue: sc.cardCue });
      const j = (a) => Math.round((Math.sin(a * 12.9898) * 43758.5453 % 1) * 6);   // small hand-drawn wobble
      (sc.marks || []).forEach((m, mi) => {
        const type = m.type || "highlight", col = m.color, rc = 0.16 + pitch * ((m.row || 1) - 0.5), yy = cy + rc * 600 * k, hh = pitch * 600 * k;
        if (m.remember) { const x0 = cx + 150 * k, y0 = cy + 360 * k, ww = 310 * k, hq = 170 * k; add({ type: "ink", color: col || P.blue, lw: 9, cue: m.cue, pts: [[x0, y0 + j(1)], [x0 + ww * 0.5, y0 - 6], [x0 + ww + 8, y0 + j(2)], [x0 + ww + 6, y0 + hq * 0.5], [x0 + ww + 8, y0 + hq + 6], [x0 + ww * 0.5, y0 + hq + 10], [x0 - 6, y0 + hq + 4], [x0 - 8, y0 + hq * 0.5], [x0 - 2, y0 - 4]] }); return; }
        const x0 = cx + (m.from != null ? m.from : 0.13) * 600 * k, x1 = cx + (m.to != null ? m.to : 0.93) * 600 * k;
        if (type === "highlight") add({ type: "ink", hl: true, color: col || "#ffe14d", lw: Math.round(hh * 0.72), cue: m.cue, pts: [[x0, yy], [x1, yy + 3]] });
        else if (type === "underline") add({ type: "ink", color: col || P.accent, lw: 8, cue: m.cue, pts: [[x0, yy + hh * 0.3], [x0 + (x1 - x0) * 0.3, yy + hh * 0.3 + 5], [x0 + (x1 - x0) * 0.6, yy + hh * 0.3 - 3], [x1, yy + hh * 0.3 + 4]] });
        else if (type === "box") add({ type: "ink", color: col || P.accent, lw: 8, cue: m.cue, pts: [[x0 - 8, yy - hh * 0.4], [x1 + 8, yy - hh * 0.42 + j(mi)], [x1 + 10, yy + hh * 0.42], [x0 - 10, yy + hh * 0.4 + j(mi + 3)], [x0 - 8, yy - hh * 0.4]] });
        else if (type === "circle") { const mx = (x0 + x1) / 2, rx = (x1 - x0) / 2 + 10, ry = hh * 0.55, pts = []; for (let a = 0; a <= 7.1; a += 0.35) pts.push([mx + Math.cos(a - 1.2) * rx * (1 + a * 0.004), yy + Math.sin(a - 1.2) * ry]); add({ type: "ink", color: col || P.accent, lw: 8, cue: m.cue, pts }); }
        else if (type === "tick") add({ type: "ink", color: col || "#1f9d55", lw: 12, cue: m.cue, pts: [[x1 - 70, yy], [x1 - 45, yy + hh * 0.3], [x1 - 5, yy - hh * 0.35]] });
      });
      let ny = cy + cw + h * 0.035; const size = Math.round(h * 0.03);
      (sc.notes || []).slice(0, 5).forEach((n0, i) => { const o = asObj(n0, "text"); add({ type: "icon", name: o.icon || "pencil", x: w * 0.06, y: ny - 4, w: size * 1.3, color: P.blue, cue: o.cue }); add({ type: "text", x: w * 0.06 + size * 1.7, y: ny, text: o.text || "", size, maxW: w * 0.86 - size * 1.7, color: o.color || P.ink, cue: o.cue }); ny += lines(o.text || "", size, w * 0.86 - size * 1.7) * size * 1.2 + size * 0.7; });
    }
    return out;
  }

  // narrator:"auto" gives each scene a pose that fits the words and does not repeat one used recently
  const POSE_KW = [[/why|what|wonder|question|\?|think|confus/i, ["thinking-chin", "hand-on-forehead", "look-up-closeup", "shrug-wide"]], [/look|here|this one|point|name|called|these/i, ["point-right-grin", "point-up-one", "point-side-front", "point-profile", "point-right-lean", "point-up-lean", "point-hip"]],
    [/important|remember|rule|always|never|must|key/i, ["point-up-lean", "hand-on-chest", "arms-crossed", "point-at-you", "hands-on-hips"]], [/glove|hand|grip|hold/i, ["gloves", "open-hands", "palms-up"]], [/thank|follow|subscribe|join|next|see you/i, ["hands-together-thanks", "thumbs-up", "wave-hello", "heart-hands", "thumbs-up-both"]],
    [/count|check|list|write|record|note/i, ["clipboard-write", "write-on-board", "writing-notes-side", "stethoscope"]], [/welcome|hello|hey|today/i, ["wave-hello", "arms-wide", "wave-back-turned"]], [/wrong|danger|damage|mistake|break|blunt|crush|corrode/i, ["worried", "shocked-sparkles", "shush-quiet", "hands-on-head"]], [/idea|tip|trick|easy|simple/i, ["idea-lightbulb", "ok-sign", "peace-sign"]]];
  const POSE_ANY = ["open-hands", "palms-up", "hands-on-hips", "shrug-wide", "hands-clasped", "hands-down-present", "salute", "ok-sign", "arms-wide", "thumbs-up", "point-right-lean", "neutral", "top-down-smile", "stethoscope"];
  function pickPose(say, used) {
    const cands = []; POSE_KW.forEach(([re, ps]) => { if (re.test(say)) ps.forEach((p) => cands.push(p)); }); POSE_ANY.forEach((p) => cands.push(p));
    const recent = used.slice(-9); let best = cands.find((p) => !recent.includes(p)); if (!best) best = cands.slice().sort((a, b) => used.lastIndexOf(a) - used.lastIndexOf(b))[0]; used.push(best); return best;
  }
  // script -> project. Never throws on content problems: use validate() first to show messages.
  function fromScript(S) {
    const P = W.newProject(); ["name", "format", "font", "handle", "fps", "bg", "ink", "accent", "blue", "pace", "logo", "badge", "flow", "captions"].forEach((k) => { if (S[k] != null) P[k] = S[k]; });
    if (S.voice) P.voice = S.voice; if (S.music) P.music = S.music; if (S.hand) P.hand = S.hand;
    const usedPoses = []; P.scenes = (S.scenes || []).map((sc) => { if (sc.narrator === "auto") sc = Object.assign({}, sc, { narrator: pickPose(String(sc.say != null ? sc.say : sc.narration || ""), usedPoses) }); const sn = W.newScene(); sn.narration = String(sc.say != null ? sc.say : sc.narration || ""); if (sc.hold != null) sn.hold = +sc.hold; if (sc.lead != null) sn.lead = +sc.lead;
      sn.items = (sc.layout ? place(sc, P) : []).concat((sc.items || []).map((it) => Object.assign({ id: W.newId() }, it, it.type === "narrator" && it.pose === "auto" ? { pose: pickPose(sn.narration, usedPoses) } : {}))); return sn; });
    return P;
  }

  function validate(S, sets) {
    const errors = [], warnings = [], icons = (sets && sets.tabler) || null, lucide = (sets && sets.lucide) || null;
    if (!S || typeof S !== "object" || Array.isArray(S)) return { errors: ["The file must be a JSON object with a \"scenes\" list."], warnings };
    if (!Array.isArray(S.scenes) || !S.scenes.length) errors.push("\"scenes\" must be a list with at least one scene.");
    if (S.format && !W.FORMATS[S.format]) errors.push(`format "${S.format}" is not one of: ${Object.keys(W.FORMATS).join(", ")}.`);
    (S.scenes || []).forEach((sc, i) => { const at = "Scene " + (i + 1) + ": ";
      if (!sc || typeof sc !== "object") { errors.push(at + "must be an object."); return; }
      if (sc.layout && !LAYOUTS.includes(sc.layout)) errors.push(at + `unknown layout "${sc.layout}" (use ${LAYOUTS.join(", ")}).`);
      if (!sc.layout && !(sc.items && sc.items.length)) errors.push(at + "needs a \"layout\" or an \"items\" list.");
      const say = String(sc.say != null ? sc.say : sc.narration || ""); if (!say.trim()) warnings.push(at + "no \"say\" text, so it will be silent and use estimated timing.");
      const checkIcon = (n, pack) => { if (!n) return; const set = pack === "lucide" ? lucide : icons; if (set && !set[n]) warnings.push(at + `icon "${n}" not found${pack === "lucide" ? " in Lucide" : ""}; a placeholder square will be drawn.`); };
      const checkCue = (c) => { if (c && say && say.toLowerCase().indexOf(String(c).toLowerCase()) < 0) warnings.push(at + `cue "${c}" is not in the "say" text, so that item follows the normal order.`); };
      const walk = (o) => { if (!o || typeof o !== "object") return; if (o.icon) checkIcon(o.icon, o.pack); if (o.cue) checkCue(o.cue); Object.values(o).forEach((v) => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === "object") walk(v); }); };
      walk(sc);
      if (sc.layout === "bullets" && !(sc.bullets || []).length) errors.push(at + "layout \"bullets\" needs a \"bullets\" list.");
      if (sc.layout === "icons" && !(sc.icons || []).length) errors.push(at + "layout \"icons\" needs an \"icons\" list.");
      if (sc.layout === "steps" && !(sc.steps || []).length) errors.push(at + "layout \"steps\" needs a \"steps\" list.");
      if (sc.layout === "compare" && !(sc.left && sc.right)) errors.push(at + "layout \"compare\" needs \"left\" and \"right\".");
      (sc.items || []).forEach((it, j) => { const a2 = at + "item " + (j + 1) + ": "; if (!it || !ITEM_TYPES.includes(it.type)) { errors.push(a2 + `"type" must be one of ${ITEM_TYPES.join(", ")}.`); return; }
        if (it.type === "ink") { if (!Array.isArray(it.pts) || it.pts.length < 2) errors.push(a2 + "ink needs a \"pts\" list of [x,y] points."); } else if (it.type !== "arrow" && (typeof it.x !== "number" || typeof it.y !== "number")) errors.push(a2 + "needs numeric \"x\" and \"y\"."); if (it.type === "arrow" && ["x", "y", "x2", "y2"].some((k) => typeof it[k] !== "number")) errors.push(a2 + "arrow needs x, y, x2, y2.");
        if ((it.type === "text" || it.type === "tag") && !it.text) errors.push(a2 + "needs \"text\"."); if (it.type === "icon" && !it.name) errors.push(a2 + "icon needs \"name\"."); if (it.type === "icon") checkIcon(it.name, it.pack); if (it.cue) checkCue(it.cue); });
    });
    return { errors, warnings };
  }

  const EXAMPLE = {
    name: "Surgical safety checklist", format: "wide", pace: 1,
    scenes: [
      { layout: "title", title: "WHY PAUSE?", subtitle: "Before the first cut", narrator: "thinking-chin", say: "Hey, theatre family. Ever wondered why we pause before the first cut?" },
      { layout: "steps", title: "THREE PAUSES", steps: [{ text: "SIGN IN", icon: "user-check", cue: "sign in" }, { text: "TIME OUT", icon: "clock", cue: "time out" }, { text: "SIGN OUT", icon: "clipboard-check", cue: "sign out" }], say: "The WHO checklist has three pauses. Sign in, time out, and sign out." },
      { layout: "icons", title: "1. SIGN IN", icons: [{ icon: "user-check", label: "Patient", cue: "patient" }, { icon: "map-pin", label: "Site", cue: "site" }, { icon: "file-check", label: "Consent", cue: "consent" }, { icon: "alert-triangle", label: "Allergies", cue: "allergies" }], say: "Before anaesthesia we confirm the patient, the site, consent and allergies." },
      { layout: "bullets", title: "2. TIME OUT", bullets: [{ text: "Whole team stops", cue: "stops" }, { text: "Introduce yourselves", cue: "introduces" }, { text: "Confirm the plan", cue: "confirms" }], narrator: "point-right-grin", say: "Before the first incision the whole team stops, introduces themselves, and confirms the plan." },
      { layout: "quote", text: "THREE PAUSES, ONE SAFER PATIENT", by: "@ezraogombo", say: "Three short pauses, one safer patient. Follow for more theatre tech." },
    ],
  };
  const PROMPT = "You write JSON scripts for a whiteboard-animation video maker. Reply with ONE JSON object only, no commentary.\nTop level: {\"name\":string,\"format\":\"wide\"|\"short\"|\"square\",\"pace\":1,\"scenes\":[...]}.\nEach scene: {\"say\":\"what the voice says (1-3 short sentences)\", \"layout\":one of title|bullets|icons|steps|compare|pie|quote|narrator, ...layout fields...}.\nLayout fields: title{title,subtitle,narrator?}, bullets{title,bullets:[{text,cue?}]}, icons{title,icons:[{icon,label,cue?}]} (icon = Tabler icon name like user-check, clock, heart-rate-monitor), steps{title,steps:[{text,icon?,cue?}]}, compare{title,left:{title,points:[]},right:{title,points:[]}}, pie{title,pct,labels:[a,b],points:[]}, quote{text,by?}, narrator{pose,title,points:[]}.\n\"cue\" is a word or phrase copied exactly from that scene's \"say\" text; the item is drawn as that phrase is spoken. Keep text short (1-4 words per label). Use no emoji. Do not invent statistics; use only facts you are sure of.";
  window.EO_WB_IMPORT = { pickPose, fromScript, validate, place, LAYOUTS, ITEM_TYPES, EXAMPLE, PROMPT };
})();
