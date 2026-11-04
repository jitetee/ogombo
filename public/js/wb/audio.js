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
  async function mix(P, tl, aud) {
    const SR = 48000, oc = new OfflineAudioContext(2, Math.ceil(tl.total * SR) + SR, SR);
    tl.scenes.forEach((x, i) => { const a = aud[i]; if (!a || !a.buf || a.sig !== (x.s.narration || "")) return; const src = oc.createBufferSource(); src.buffer = a.buf; src.connect(oc.destination); src.start(x.t0 + x.lead, a.t0, a.t1 - a.t0); });
    const m = P.music && P.music.src && P.music.vol > 0 ? await getMusic(P.music.src).catch(() => null) : null;
    if (m) { const src = oc.createBufferSource(); src.buffer = m; src.loop = true; const g = oc.createGain(), v = P.music.vol; g.gain.setValueAtTime(0, 0); g.gain.linearRampToValueAtTime(v, 1); g.gain.setValueAtTime(v, Math.max(1, tl.total - 1.5)); g.gain.linearRampToValueAtTime(0, tl.total); src.connect(g); g.connect(oc.destination); src.start(0); }
    return oc.startRendering();
  }
  window.EO_WBA = { loadVoices, makeVoice, fromFile, durs, mix, key };
})();
