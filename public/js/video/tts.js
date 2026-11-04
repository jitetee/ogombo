// ============================================================
// Voice + audio for the video studio (EO_TTS).
//  - Google Cloud Text-to-Speech over REST. The API key is typed into the studio and kept only in THIS browser
//    (localStorage); it is never written to the database or the site files.
//  - voices:list is asked at run time, so whatever Kenyan voices (sw-KE / en-KE) Google offers for your key show up first.
//  - every narration is cached in IndexedDB (same text + voice = no second charge).
//  - analyse(): trims leading/trailing silence and builds a loudness envelope (drives the bars and narrator bounce).
//  - mix(): lays all narration + music on one timeline (music ducks under the voice) with an OfflineAudioContext.
// ============================================================
(function () {
  const KEY = "eo_tts_key", API = "https://texttospeech.googleapis.com/v1";
  const SR = 48000;
  const keyGet = () => { try { return localStorage.getItem(KEY) || ""; } catch { return ""; } };
  const keySet = (k) => { try { k ? localStorage.setItem(KEY, k.trim()) : localStorage.removeItem(KEY); } catch {} };

  // ---- IndexedDB cache
  let dbP = null;
  const idb = () => dbP || (dbP = new Promise((res) => { try { const r = indexedDB.open("eo_video", 1); r.onupgradeneeded = () => r.result.createObjectStore("tts"); r.onsuccess = () => res(r.result); r.onerror = () => res(null); } catch { res(null); } }));
  async function cget(k) { const d = await idb(); if (!d) return null; return new Promise((res) => { const q = d.transaction("tts").objectStore("tts").get(k); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); }); }
  async function cput(k, v) { const d = await idb(); if (!d) return; return new Promise((res) => { const t = d.transaction("tts", "readwrite"); t.objectStore("tts").put(v, k); t.oncomplete = () => res(); t.onerror = () => res(); }); }

  let ctx = null;
  const ac = () => ctx || (ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: SR }));

  async function hash(s) { const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)); return [...new Uint8Array(b)].slice(0, 12).map((x) => x.toString(16).padStart(2, "0")).join(""); }

  async function api(path, opts) {
    const key = keyGet(); if (!key) throw new Error("Add your Google text-to-speech key first (Audio tab).");
    const r = await fetch(`${API}/${path}${path.includes("?") ? "&" : "?"}key=${encodeURIComponent(key)}`, opts);
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((d.error && d.error.message) || ("Google said " + r.status));
    return d;
  }

  // voices Google offers; Kenyan ones first, then Swahili, then English, then the rest
  async function listVoices() {
    const d = await api("voices");
    const rank = (v) => { const l = (v.languageCodes || [])[0] || ""; return /-KE$/i.test(l) ? 0 : /^sw/i.test(l) ? 1 : /^en-(GB|US|ZA|NG|IN|AU)/i.test(l) ? 2 : /^en/i.test(l) ? 3 : 9; };
    const type = (n) => (/chirp/i.test(n) ? "Chirp" : /studio/i.test(n) ? "Studio" : /neural2/i.test(n) ? "Neural2" : /wavenet/i.test(n) ? "WaveNet" : /news/i.test(n) ? "News" : /polyglot/i.test(n) ? "Polyglot" : "Standard");
    return (d.voices || []).filter((v) => rank(v) < 9).map((v) => ({ name: v.name, languageCode: v.languageCodes[0], gender: v.ssmlGender, type: type(v.name), rank: rank(v) }))
      .sort((a, b) => a.rank - b.rank || a.languageCode.localeCompare(b.languageCode) || a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
  }

  function chunkText(t, max) {
    const out = []; let cur = "";
    String(t).replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+/).forEach((s) => { if ((cur + " " + s).trim().length > max && cur) { out.push(cur); cur = s; } else cur = (cur + " " + s).trim(); });
    if (cur) out.push(cur); return out;
  }
  async function decode(arrayBuf) { return await ac().decodeAudioData(arrayBuf.slice(0)); }
  function concat(bufs) {
    const n = bufs.reduce((a, b) => a + b.length, 0), out = ac().createBuffer(1, n, bufs[0].sampleRate); let o = 0;
    bufs.forEach((b) => { out.getChannelData(0).set(b.getChannelData(0), o); o += b.length; }); return out;
  }

  // free neural voice: Piper (LibriTTS, CC BY 4.0) running in the browser. eSpeak NG turns text into phonemes.
  const MALE = [184, 736, 805, 483, 414, 851], FEMALE = [23, 46, 92, 207, 874, 621];
  const MODELS = { ryan: "en_US-ryan-low", lib: "en-us-libritts-high", mine: "myvoice", minesw: "myvoice-sw", minebi: "myvoice-bi" };
  const FREE = [{ name: "piper:ryan", languageCode: "en-US", gender: "MALE", type: "Free · Male 1 · Ryan (natural, small file)", rank: -3 }].concat(MALE.map((n, i) => ({ name: "piper:" + n, languageCode: "en-US", gender: "MALE", type: "Free · Male " + (i + 2) + " (natural, in-browser)", rank: -2 }))).concat([{ name: "piper:mine", languageCode: "en-US", gender: "MALE", type: "My own voice (needs assets/voices/myvoice.onnx)", rank: -1 }, { name: "piper:custom", languageCode: "en-US", gender: "MALE", type: "My uploaded voice (any Piper .onnx, kept in this browser)", rank: -1 }, { name: "piper:mine-sw", languageCode: "sw-KE", gender: "MALE", type: "My own voice, Swahili (needs assets/voices/myvoice-sw.onnx)", rank: -1 }, { name: "piper:mine-bi", languageCode: "en-KE", gender: "MALE", type: "My own voice, English + Swahili in one (needs assets/voices/myvoice-bi.onnx)", rank: -1 }]);
  let espMod = null, pip = null;
  async function espIPA(text, vc) {
    espMod = espMod || (await import("/js/vendor/espeak/espeak-ng.js")).default;
    const e = await espMod({ arguments: ["-q", "--ipa", "-v", vc || "en-us", "--phonout", "ph.txt", text], locateFile: (f) => "/js/vendor/espeak/" + f });
    return e.FS.readFile("ph.txt", { encoding: "utf8" }).split("\n").map((x) => x.trim()).filter(Boolean);
  }
  async function phonemize(sentence, vc) {
    const cl = []; String(sentence).replace(/\s+/g, " ").replace(/([^.,!?;:]*)([.,!?;:]*)/g, (m, b, p) => { b = b.trim(); if (b) cl.push([b, p.slice(0, 1)]); else if (p && cl.length && !cl[cl.length - 1][1]) cl[cl.length - 1][1] = p.slice(0, 1); return m; });
    if (!cl.length) return "";
    let lines = await espIPA(cl.map((c) => c[0]).join("\n\n"), vc);
    if (lines.length !== cl.length) { lines = []; for (const c of cl) lines.push((await espIPA(c[0], vc)).join(" ")); }
    return cl.map((c, i) => lines[i] + c[1]).join(" ");
  }
  // "My uploaded voice": the person picks their own .onnx + .onnx.json once; both are kept in this browser (IndexedDB), no deploy needed.
  const cvm = () => new Promise((res, rej) => { const q = indexedDB.open("eo_voicemodel", 1); q.onupgradeneeded = () => q.result.createObjectStore("m"); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
  const cvGet = async (k) => { const d = await cvm(); return new Promise((res) => { const r = d.transaction("m").objectStore("m").get(k); r.onsuccess = () => res(r.result); r.onerror = () => res(null); }); };
  const cvPut = async (k, v) => { const d = await cvm(); return new Promise((res, rej) => { const t = d.transaction("m", "readwrite"); t.objectStore("m").put(v, k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); };
  async function setCustomModel(onnxFile, jsonFile) {
    const cfg = JSON.parse(await jsonFile.text()); if (!cfg.phoneme_id_map || !cfg.audio) throw new Error("That .json is not a Piper model config (.onnx.json).");
    await cvPut("onnx", await onnxFile.arrayBuffer()); await cvPut("json", cfg); try { localStorage.setItem("eo_cvm", String(Date.now())); } catch (e) { /* ignore */ } delete pips.custom;
  }
  async function hasCustomModel() { try { return !!(await cvGet("onnx")); } catch (e) { return false; } }
  const cvStamp = () => { try { return localStorage.getItem("eo_cvm") || ""; } catch (e) { return ""; } };
  const pips = {};
  async function piperLoad(mk) {
    mk = mk || "lib"; if (pips[mk]) return pips[mk];
    if (mk === "custom") {
      const m0 = await import("/js/vendor/ort/ort.wasm.min.mjs"), ort0 = m0.default || m0; ort0.env.wasm.wasmPaths = "/js/vendor/ort/"; ort0.env.wasm.numThreads = 1;
      const buf0 = await cvGet("onnx"), cfg0 = await cvGet("json"); if (!buf0 || !cfg0) throw new Error("Upload your voice files first (Voice and export page, My voice).");
      return (pips.custom = { ort: ort0, cfg: cfg0, sess: await ort0.InferenceSession.create(new Uint8Array(buf0), { executionProviders: ["wasm"] }) });
    }
    const m = await import("/js/vendor/ort/ort.wasm.min.mjs"), ort = m.default || m; ort.env.wasm.wasmPaths = "/js/vendor/ort/"; ort.env.wasm.numThreads = 1;
    const [cfg, buf] = await Promise.all([fetch("/assets/voices/" + MODELS[mk] + ".onnx.json").then((r) => { if (!r.ok) throw new Error("Voice file missing: upload assets/voices/" + MODELS[mk] + ".onnx and .onnx.json"); return r.json(); }), fetch("/assets/voices/" + MODELS[mk] + ".onnx").then((r) => { if (!r.ok) throw new Error("Voice file missing: upload assets/voices/" + MODELS[mk] + ".onnx"); return r.arrayBuffer(); })]);
    const sess = await ort.InferenceSession.create(new Uint8Array(buf), { executionProviders: ["wasm"] });
    return (pips[mk] = { ort, cfg, sess });
  }
  // voice settings per mood: [noise_scale (variation), noise_w (rhythm variation), length_scale (pace), pause after a sentence in seconds]
  const VMOODS = { calm: [0.55, 0.70, 1.06, 0.30], warm: [0.72, 0.85, 0.98, 0.22], serious: [0.50, 0.60, 1.10, 0.36], excited: [0.88, 1.00, 0.90, 0.15], caution: [0.62, 0.72, 1.08, 0.32] };
  const vm = (m) => VMOODS[m] || [0.667, 0.8, 1, 0.22];
  // bilingual voice: each sentence is phonemized in its own language. Start a sentence with "sw:" to force Swahili, "en:" to force English.
  const SW_WORDS = new Set("na ya wa kwa ni la za cha vya katika hii hiyo huu huo hili hilo kuwa sana tu pia lakini kama nini gani yangu wako yako sisi mimi wewe wao asante karibu habari tafadhali mgonjwa upasuaji daktari hospitali kila mara baada kabla wakati kwanza pili tatu leo kesho jana sawa ndiyo hapana sijui nina una ana tuna mna wana kuna hakuna sasa basi kwamba ambayo ambao wetu wenu wangu wake wetu mtu watu vizuri mbaya kubwa ndogo huku hapa pale mahali nyumba kazi chumba vyombo hesabu angalia fanya kuangalia kufanya".split(" "));
  function isSw(t) { const w = String(t).toLowerCase().replace(/[^a-z' ]+/g, " ").split(/\s+/).filter(Boolean); if (!w.length) return false; let n = 0; for (const x of w) if (SW_WORDS.has(x)) n++; return n / w.length >= 0.25 || (w.length <= 3 && n >= 1); }
  // Kenyan English sound rules, applied to the English phonemes (IPA) before the voice speaks. The SAME rules are used when training
  // (see train_my_voice_v10.ipynb), so the voice learns your real Kenyan pronunciation. Full vowels (no "uh" reduction), no American R colouring,
  // short pure vowels, single-sound "ay" and "oh". Only used by models whose .onnx.json says "kenyan": true.
  const KENYAN = [["ɜː","ɛ"],["ɝ","ɛ"],["ɚ","ɛ"],["oʊ","o"],["əʊ","o"],["eɪ","e"],["ᵻ","i"],["ɪ","i"],["ʊ","u"],["æ","a"],["ʌ","a"],["ɐ","a"],["ɑː","a"],["ɑ","a"],["ɒ","ɔ"],["ɔː","ɔ"],["ə","a"],["ɹ","ɾ"],["ː",""]];
  function kenyanFix(ipa, on) { if (!on) return ipa; let o = String(ipa); for (const [a, b] of KENYAN) o = o.split(a).join(b); return o; }
  async function piperSentence(text, sid, rate, mk, mood) {
    let force = ""; { const m = /^\s*(sw|en):\s*/i.exec(text); if (m) { force = m[1].toLowerCase(); text = text.slice(m[0].length); } }
    let [ns, nw, ls] = vm(mood); if (mood) { if (/!$/.test(text)) { ns += 0.08; ls -= 0.05; } else if (/\?$/.test(text)) { ns += 0.05; } }
    const k = await hash(["pp5", mk === "custom" ? "custom" + cvStamp() : mk, sid, rate, mood || "", ns.toFixed(2), force, text].join("|")); let raw = await cget(k);
    if (!raw) {
      const { ort, cfg, sess } = await piperLoad(mk), pm = cfg.phoneme_id_map, sw1 = cfg.phoneme_type === "text" && (force ? force === "sw" : isSw(text)), ph = kenyanFix(await phonemize(text, cfg.phoneme_type === "text" ? (sw1 ? "sw" : "en-us") : ((cfg.espeak && cfg.espeak.voice) || "en-us")), cfg.kenyan === true && !sw1), ids = [pm["^"][0], 0];
      for (const c of ph) if (pm[c]) ids.push(pm[c][0], 0);
      ids.push(pm["$"][0]);
      const feeds = { input: new ort.Tensor("int64", BigInt64Array.from(ids.map(BigInt)), [1, ids.length]), input_lengths: new ort.Tensor("int64", BigInt64Array.from([BigInt(ids.length)]), [1]), scales: new ort.Tensor("float32", Float32Array.from([ns, ls / Math.max(0.5, Math.min(1.6, rate)), nw]), [3]) };
      if (sess.inputNames.includes("sid")) feeds.sid = new ort.Tensor("int64", BigInt64Array.from([BigInt(sid)]), [1]);
      const out = await sess.run(feeds);
      const d = Float32Array.from(out.output.data); let pk = 0; for (let i = 0; i < d.length; i++) pk = Math.max(pk, Math.abs(d[i])); const g = pk > 0 ? 0.9 / pk : 1; for (let i = 0; i < d.length; i++) d[i] *= g;
      raw = d.buffer; await cput(k, raw);
    }
    return new Float32Array(raw);
  }
  // pronunciation fixes: each line "word = how to say it", for example  CSSD = C S S D   or   diathermy = die-a-ther-me
  const PRON_DEFAULT = "CSSD = C S S D\nPACU = pack you\nECG = E C G\nICU = I C U\nHIV = H I V\nWHO = W H O\nmmHg = millimetres of mercury\nSpO2 = S P O two\nSOP = S O P";
  function pronList(user) { const out = []; (String(user || "") + "\n" + PRON_DEFAULT).split(/\n+/).forEach((l) => { const m = /^\s*(.+?)\s*=\s*(.+?)\s*$/.exec(l); if (m) out.push([new RegExp("(?<![A-Za-z0-9])" + m[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?![A-Za-z0-9])", /[a-z]/.test(m[1]) && m[1] === m[1].toLowerCase() ? "gi" : "g"), m[2]]); }); return out; }
  function applyPron(t, list) { for (const [re, to] of list) t = t.replace(re, to); return t; }
  async function piperSynth(text, voice) {
    const onp = voice.onprog || (() => {}); onp(0, 1, "Loading the voice model (first time can take a minute)..."); const mk = voice.name === "piper:custom" ? "custom" : voice.name === "piper:ryan" ? "ryan" : voice.name === "piper:mine" ? "mine" : voice.name === "piper:mine-sw" ? "minesw" : voice.name === "piper:mine-bi" ? "minebi" : "lib", sid = Number(voice.name.slice(6)) || 0, rate = Number(voice.rate) || 1, sr = (await piperLoad(mk)).cfg.audio.sample_rate || 22050, sents = String(text).replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+/).filter(Boolean), parts = [];
    onp(0, sents.length || 1, ""); const pron = pronList(voice.pron), clean = voice.clean !== false && typeof window !== "undefined" && window.EO_POLISH;
    for (const s0 of sents) { const s = applyPron(s0, pron); let a = await piperSentence(s, sid, rate, mk, voice.mood || ""); if (clean) { try { a = window.EO_POLISH.clean(a, sr); } catch (e) { /* keep the raw voice if cleaning fails */ } } parts.push(a); onp(parts.length / 2 + 0.5, sents.length, ""); parts.push(new Float32Array(Math.round(sr * vm(voice.mood)[3] / rate))); await new Promise((r) => setTimeout(r)); }
    parts.pop(); const n = parts.reduce((a, p) => a + p.length, 0), b = ac().createBuffer(1, n, sr), ch = b.getChannelData(0); let o = 0; parts.forEach((p) => { ch.set(p, o); o += p.length; }); return b;
  }
  async function musicFromUrl(url) { const r = await fetch(url); if (!r.ok) throw new Error("Could not load that track"); return await decode(await r.arrayBuffer()); }

  // text -> AudioBuffer (cached). voice = {name, languageCode, rate, pitch}
  async function synth(text, voice) {
    text = String(text || "").trim(); if (!text) return null;
    if (!voice || !voice.name) throw new Error("Pick a voice first (Audio tab).");
    if (/^piper:/.test(voice.name)) return await piperSynth(text, voice);
    const parts = chunkText(text, 4200), bufs = [];
    for (const part of parts) {
      const k = await hash([voice.name, voice.languageCode, voice.rate, voice.pitch, part].join("|"));
      let raw = await cget(k);
      if (!raw) {
        const d = await api("text:synthesize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input: { text: part }, voice: { languageCode: voice.languageCode, name: voice.name }, audioConfig: { audioEncoding: "MP3", speakingRate: Number(voice.rate) || 1, pitch: /chirp|studio/i.test(voice.name) ? 0 : Number(voice.pitch) || 0, sampleRateHertz: SR } }) });
        const bin = atob(d.audioContent), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        raw = u.buffer; await cput(k, raw);
      }
      bufs.push(await decode(raw));
    }
    return bufs.length === 1 ? bufs[0] : concat(bufs);
  }

  // trim silence + loudness envelope (60 values per second, relative to the trimmed start)
  function analyse(buf, narr) {
    const d = buf.getChannelData(0), sr = buf.sampleRate, win = Math.floor(sr / 60), n = Math.floor(d.length / win), rms = new Float32Array(n);
    let mx = 0; for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < win; j++) { const v = d[i * win + j]; s += v * v; } rms[i] = Math.sqrt(s / win); if (rms[i] > mx) mx = rms[i]; }
    const th = Math.max(0.004, mx * 0.04); let a = 0, b = n - 1; while (a < n && rms[a] < th) a++; while (b > a && rms[b] < th) b--;
    a = Math.max(0, a - 3); b = Math.min(n - 1, b + 4);
    const env = new Float32Array(Math.max(1, b - a + 1)); for (let i = a; i <= b; i++) env[i - a] = Math.min(1, rms[i] / (mx * 0.7 || 1));
    for (let i = 1; i < env.length - 1; i++) env[i] = (env[i - 1] + 2 * env[i] + env[i + 1]) / 4;
    return { buf, narr: String(narr || "").trim(), t0: (a * win) / sr, t1: ((b + 1) * win) / sr, env };
  }
  async function fromFile(file, narr) { return analyse(await decode(await file.arrayBuffer()), narr || ""); }
  async function musicFromFile(file) { return await decode(await file.arrayBuffer()); }

  // ---- mix everything for the whole video
  async function mix(P, tl, aud, music) {
    const total = Math.ceil(tl.total * SR) + SR, oc = new OfflineAudioContext(2, total, SR);
    const master = oc.createGain(); const comp = oc.createDynamicsCompressor(); master.connect(comp); comp.connect(oc.destination);
    const spans = [];
    tl.forEach((x) => {
      const a = x.a; if (!a || !a.buf) return;
      const src = oc.createBufferSource(); src.buffer = a.buf; const g = oc.createGain(), st = x.start + x.lead, len = a.t1 - a.t0;
      g.gain.setValueAtTime(0, st); g.gain.linearRampToValueAtTime(1, st + 0.015); g.gain.setValueAtTime(1, st + len - 0.04); g.gain.linearRampToValueAtTime(0, st + len);
      src.connect(g); g.connect(master); src.start(st, a.t0, len); spans.push([st, st + len]);
    });
    if (P.sfx !== false) {   // generated sound effects: whoosh on every scene change, a soft pop as text lands, a ding on the end screen
      const nb = oc.createBuffer(1, Math.floor(SR * 0.6), SR), nd = nb.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      const sg = oc.createGain(); sg.gain.value = 0.55; sg.connect(master);
      const whoosh = (at) => { const src = oc.createBufferSource(); src.buffer = nb; const f = oc.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 0.9; f.frequency.setValueAtTime(250, at); f.frequency.exponentialRampToValueAtTime(3200, at + 0.38); const g = oc.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(0.5, at + 0.16); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.45); src.connect(f); f.connect(g); g.connect(sg); src.start(at, 0, 0.5); };
      const pop = (at, f0) => { const o = oc.createOscillator(); o.type = "sine"; o.frequency.setValueAtTime(f0, at); o.frequency.exponentialRampToValueAtTime(f0 * 0.38, at + 0.13); const g = oc.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(0.5, at + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.16); o.connect(g); g.connect(sg); o.start(at); o.stop(at + 0.2); };
      const ding = (at) => [880, 1320, 1760].forEach((fr, k) => { const o = oc.createOscillator(); o.type = "sine"; o.frequency.value = fr; const g = oc.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(0.28 / (k + 1), at + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.9); o.connect(g); g.connect(sg); o.start(at); o.stop(at + 1); });
      tl.forEach((x, i) => { const st = x.start; if (i > 0) whoosh(Math.max(0, st - 0.06)); if (x.s.layout === "outro") ding(st + 0.75); else if (x.s.layout !== "hook") pop(st + 0.14 + (i > 0 ? 0.04 : 0), 640); if (x.s.layout === "hook") { whoosh(st); pop(st + 0.2, 520); } });
    }
    if (music && P.music && P.music.vol > 0) {
      const src = oc.createBufferSource(); src.buffer = music; src.loop = true; const g = oc.createGain(), v = P.music.vol, dk = v * 0.28;
      g.gain.setValueAtTime(0, 0); g.gain.linearRampToValueAtTime(v, 0.8);
      if (P.music.duck) spans.forEach(([s, e]) => { g.gain.setTargetAtTime(dk, Math.max(0.8, s - 0.15), 0.12); g.gain.setTargetAtTime(v, e + 0.05, 0.35); });
      g.gain.setValueAtTime(g.gain.value, Math.max(0, tl.total - 1.2)); g.gain.linearRampToValueAtTime(0, tl.total);
      src.connect(g); g.connect(master); src.start(0);
    }
    return await oc.startRendering();
  }

  // play a mixed buffer from time t (live preview). returns {stop}
  function play(buf, from) {
    const c = ac(); if (c.state === "suspended") c.resume();
    const s = c.createBufferSource(); s.buffer = buf; s.connect(c.destination); const at = c.currentTime + 0.05; s.start(at, from);
    return { stop() { try { s.stop(); } catch {} }, time() { return from + (c.currentTime - at); } };
  }

  // quick listen with the phone/computer's own voices (preview only: browsers can't record these into a video)
  function browserSay(text, lang) { try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = lang || "sw-KE"; speechSynthesis.speak(u); return true; } catch { return false; } }

  window.EO_TTS = { setCustomModel, hasCustomModel, cvStamp, pronList, applyPron, VMOODS, FREE, musicFromUrl, SR, keyGet, keySet, listVoices, synth, analyse, fromFile, musicFromFile, mix, play, browserSay, ctx: ac };
})();
