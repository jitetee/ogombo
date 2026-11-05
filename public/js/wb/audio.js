// Shared audio helpers for the whiteboard editor + export pages (EO_WBA): cached voice-overs and the final mix.
(function () {
  const W = window.EO_WB, T = window.EO_TTS, S = window.EO_WBSTORE; let music = null, musicSrc = "";
  const key = (P, s) => S.voiceKey(P.voice, s.narration);
  const toBuf = (v) => { const b = T.ctx().createBuffer(1, v.data.length, v.sr); b.copyToChannel(v.data, 0); return b; };
  // aud[i] = {buf,t0,t1,sig} or null, from the cache
  async function loadVoices(P) { const out = []; for (const s of P.scenes) { const v = (s.narration || "").trim() ? await S.voiceGet(key(P, s)) : null; out.push(v ? Object.assign(T.analyse(toBuf(v), s.narration), { sig: s.narration }) : null); } return out; }
  async function saveVoice(P, i, buf) { const s = P.scenes[i]; await S.voicePut(key(P, s), { sr: buf.sampleRate, data: buf.getChannelData(0).slice() }); return Object.assign(T.analyse(buf, s.narration), { sig: s.narration }); }
  async function makeVoice(P, i, onprog) { const s = P.scenes[i]; if (!(s.narration || "").trim()) throw new Error("Scene " + (i + 1) + " has no voice-over text."); return saveVoice(P, i, await T.synth(s.narration, Object.assign({}, P.voice, { onprog }))); }
  async function fromFile(P, i, file) { const buf = await T.musicFromFile(file); return saveVoice(P, i, buf); }
  const durs = (P, aud) => P.scenes.map((s, i) => (aud[i] && aud[i].sig === (s.narration || "") ? aud[i].t1 - aud[i].t0 : 0));
  async function getMusic(src) { if (!src) return null; if (!music || musicSrc !== src) { music = await T.musicFromUrl(src); musicSrc = src; } return music; }
  // ---- sound effects, made in code so no files are needed ----
  const DEF = { voice: 1, music: { vol: 0.06, duck: true, duckTo: 0.35, fadeIn: 1.5, fadeOut: 2.5 }, sfx: { vol: 0.5, whoosh: true, pop: true, ding: true } };
  function settings(P) { P.music = Object.assign({}, DEF.music, P.music || {}); P.sfx = Object.assign({}, DEF.sfx, P.sfx || {}); if (P.voiceVol == null) P.voiceVol = DEF.voice; P.layers = P.layers || []; return P; }
  function noise(oc, d) { const b = oc.createBuffer(1, Math.ceil(oc.sampleRate * d), oc.sampleRate), x = b.getChannelData(0); for (let i = 0; i < x.length; i++) x[i] = Math.random() * 2 - 1; return b; }
  const SFX = {
    whoosh(oc, out, t, v) { const s = oc.createBufferSource(); s.buffer = noise(oc, 0.7); const f = oc.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 0.9; f.frequency.setValueAtTime(250, t); f.frequency.exponentialRampToValueAtTime(3800, t + 0.45); const g = oc.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v * 0.9, t + 0.22); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.62); s.connect(f); f.connect(g); g.connect(out); s.start(t); s.stop(t + 0.7); },
    pop(oc, out, t, v) { const o = oc.createOscillator(); o.type = "sine"; o.frequency.setValueAtTime(720, t); o.frequency.exponentialRampToValueAtTime(240, t + 0.09); const g = oc.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13); o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.15); },
    ding(oc, out, t, v) { [1318, 1976].forEach((fr, k) => { const o = oc.createOscillator(); o.type = "sine"; o.frequency.value = fr; const g = oc.createGain(); g.gain.setValueAtTime(v * (k ? 0.45 : 0.8), t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55); o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.6); }); },
  };
  const POPS = { icon: "pop", figure: "pop", image: "pop", narrator: "pop", pie: "pop", tag: "ding", emoji: "ding" };
  function sfxPlan(P, tl) { const out = []; if (!P.sfx || !(P.sfx.vol > 0)) return out; let last = -9;
    tl.scenes.forEach((x, i) => { if (i > 0 && P.sfx.whoosh) out.push([x.t0 + 0.05, "whoosh"]); (x.lay.list || []).forEach((o) => { const k = POPS[o.it.type]; if (!k) return; if (k === "pop" && !P.sfx.pop) return; if (k === "ding" && !P.sfx.ding) return; const t = x.t0 + x.lead + o.t0; if (t - last < 0.35) return; last = t; out.push([t, k]); }); });
    return out; }
  async function layerBuf(l) { return T.musicFromUrl(l.src); }
  async function mix(P, tl, aud) {
    settings(P); const SR = 48000, oc = new OfflineAudioContext(2, Math.ceil(tl.total * SR) + SR, SR), M = P.music, total = tl.total;
    const vbus = oc.createGain(); vbus.gain.value = P.voiceVol; vbus.connect(oc.destination); const vint = [];
    tl.scenes.forEach((x, i) => { const a = aud[i]; if (!a || !a.buf || a.sig !== (x.s.narration || "")) return; const src = oc.createBufferSource(); src.buffer = a.buf; src.connect(vbus); src.start(x.t0 + x.lead, a.t0, a.t1 - a.t0); vint.push([x.t0 + x.lead, x.t0 + x.lead + (a.t1 - a.t0)]); });
    const m = M.src && M.vol > 0 ? await getMusic(M.src).catch(() => null) : null;
    if (m) { const src = oc.createBufferSource(); src.buffer = m; src.loop = true; const g = oc.createGain(), v = M.vol; g.gain.setValueAtTime(0, 0); g.gain.linearRampToValueAtTime(v, Math.max(0.1, M.fadeIn));
      if (M.duck && vint.length) { const mg = []; vint.forEach((iv) => { const l = mg[mg.length - 1]; if (l && iv[0] - l[1] < 0.8) l[1] = iv[1]; else mg.push(iv.slice()); }); mg.forEach(([a, b]) => { if (a < M.fadeIn) return; g.gain.setTargetAtTime(v * M.duckTo, Math.max(0, a - 0.15), 0.12); g.gain.setTargetAtTime(v, b + 0.1, 0.35); }); }
      g.gain.setValueAtTime(v, Math.max(M.fadeIn + 0.2, total - M.fadeOut)); g.gain.linearRampToValueAtTime(0, total); src.connect(g); g.connect(oc.destination); src.start(0); }
    const sg = oc.createGain(); sg.gain.value = P.sfx.vol; sg.connect(oc.destination); sfxPlan(P, tl).forEach(([t, k]) => SFX[k](oc, sg, t, 0.8));
    for (const l of P.layers) { if (!l.src || !(l.vol > 0)) continue; const b = await layerBuf(l).catch(() => null); if (!b) continue; const st = Math.max(0, +l.start || 0), en = l.end ? Math.min(total, +l.end) : total, src = oc.createBufferSource(); src.buffer = b; src.loop = !!l.loop; const g = oc.createGain(); g.gain.setValueAtTime(0, st); g.gain.linearRampToValueAtTime(l.vol, st + 0.15); const stop = l.loop ? en : Math.min(en, st + b.duration); g.gain.setValueAtTime(l.vol, Math.max(st + 0.15, stop - 0.3)); g.gain.linearRampToValueAtTime(0, stop); src.connect(g); g.connect(oc.destination); src.start(st); src.stop(stop); }
    return oc.startRendering();
  }
  const sig = (P) => JSON.stringify([P.music, P.sfx, P.voiceVol, (P.layers || []).map((l) => [l.name, l.start, l.end, l.vol, l.loop, (l.src || "").length])]);
  window.EO_WBA = { loadVoices, makeVoice, fromFile, durs, mix, key, settings, sig, sfxPlan, DEF };
})();
