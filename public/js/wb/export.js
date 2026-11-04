// Whiteboard voice + export page: make/cache the voice-over per scene, preview the whole video, export an MP4.
(async () => {
  await A.guard("whiteboard");
  const W = EO_WB, T = EO_TTS, S = EO_WBSTORE, C = EO_WBC, WA = EO_WBA, E = A.esc, $ = (s, r) => (r || document).querySelector(s);
  const root = $("#exp"); $("#nav").appendChild(C.subnav("export"));
  if (!C.id) { location.href = "/admin/whiteboard"; return; }
  const rec = await S.get(C.id); if (!rec) { alert("That project was not found."); location.href = "/admin/whiteboard"; return; }
  const P = Object.assign(W.newProject(), rec.data); P.voice = P.voice || { name: "piper:mine", languageCode: "en-US", rate: 1, pitch: 0 }; P.music = P.music || { src: "/assets/music/calm-focus.mp3", vol: 0.12 };
  let aud = await WA.loadVoices(P), playing = null, mixBuf = null, mixSig = "";
  const assets = await W.loadAssets(P, {}); assets.hand = true;
  const save = async () => { rec.data = P; await S.put(rec); mixSig = ""; };
  const TL = () => { assets.aud = WA.durs(P, aud); assets.tl = W.timeline(P, assets.aud); return assets.tl; };

  root.innerHTML = `<div class="wb-two" style="align-items:start;gap:1rem">
    <div><h3 style="margin:.2rem 0">1. Voice-over</h3><div class="wb-row" id="vopts"></div><div id="rows"></div><div id="vmsg"></div></div>
    <div><h3 style="margin:.2rem 0">2. Preview and export</h3><div class="wb-stagebox"><canvas id="cv"></canvas></div><div class="wb-row"><button class="btn sm primary" id="play" type="button">Play</button><input type="range" id="seek" min="0" max="1000" value="0" style="flex:1"><span class="mono wb-note" id="tm"></span></div><div class="wb-row" id="eopts"></div><div id="prog"></div></div></div>`;
  const cv = $("#cv"), ctx = cv.getContext("2d"), fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
  function size() { const z = W.size(P); if (cv.width !== 960 || cv.height !== Math.round(960 * z.h / z.w)) { cv.width = 960; cv.height = Math.round(960 * z.h / z.w); } }
  function frame(t) { size(); const tl = TL(); W.draw(ctx, P, Math.min(t, tl.total - 0.01), assets); $("#tm").textContent = fmt(t) + " / " + fmt(tl.total); }
  const sel2 = (opts, val, fn) => { const s = document.createElement("select"); s.innerHTML = opts.map(([k, l]) => `<option value="${E(k)}" ${String(k) === String(val) ? "selected" : ""}>${E(l)}</option>`).join(""); s.onchange = () => fn(s.value); return s; };

  function rows() {
    const h = $("#rows"); h.innerHTML = "";
    P.scenes.forEach((s, i) => { const ok = aud[i] && aud[i].sig === (s.narration || ""), d = document.createElement("div"); d.className = "wb-card"; d.style.marginBottom = ".4rem";
      d.innerHTML = `<div class="in"><b>Scene ${i + 1}</b> <span class="wb-note">${ok ? "voice " + (aud[i].t1 - aud[i].t0).toFixed(1) + " s" : (s.narration || "").trim() ? "no voice yet" : "silent scene"}</span><div class="wb-note">${E((s.narration || "").slice(0, 160))}</div><div class="wb-row" style="margin:0"></div></div>`;
      const r = $(".wb-row", d); if ((s.narration || "").trim()) r.append(A.btn(ok ? "Remake" : "Make voice", "sm", () => make(i)), A.btn("Upload my recording", "sm", () => up(i)), ...(ok ? [A.btn("Listen", "sm", () => { try { T.play(aud[i].buf, aud[i].t0); } catch (e) {} })] : [])); h.appendChild(d); });
  }
  async function make(i, pr) { const own = !pr; pr = pr || C.progress($("#vmsg"), `Making voice for scene ${i + 1}`); try { aud[i] = await WA.makeVoice(P, i, (n, tot, msg) => { if (msg) pr.label(msg.replace(/^$/, `Making voice for scene ${i + 1}`)); pr.set(tot ? n / tot : 0); }); if (own) pr.done("Voice ready"); } catch (e) { pr.fail(e); if (!own) throw e; } mixSig = ""; rows(); frame(0); }
  function up(i) { const f = document.createElement("input"); f.type = "file"; f.accept = "audio/*"; f.onchange = async () => { if (f.files[0]) { aud[i] = await WA.fromFile(P, i, f.files[0]); mixSig = ""; rows(); frame(0); } }; f.click(); }
  async function makeAll() { const todo = P.scenes.map((s, i) => i).filter((i) => (P.scenes[i].narration || "").trim() && !(aud[i] && aud[i].sig === P.scenes[i].narration)); if (!todo.length) return C.banner("All voices are already made."); const pr = C.progress($("#vmsg"), "Making all voices (" + todo.length + " scenes)"); try { for (let k = 0; k < todo.length; k++) { const i = todo[k]; aud[i] = await WA.makeVoice(P, i, (n, tot, msg) => { pr.label(msg || `Scene ${i + 1} of ${P.scenes.length} (${k + 1}/${todo.length})`); pr.set((k + (tot ? n / tot : 0)) / todo.length); }); mixSig = ""; rows(); } pr.done("All voices are ready"); frame(0); } catch (e) { pr.fail(e); } }

  const vo = $("#vopts"); vo.append(sel2((T.FREE || []).map((v) => [v.name, v.type || v.name]), P.voice.name, async (k) => { P.voice.name = k; await save(); aud = await WA.loadVoices(P); rows(); frame(0); }),
    sel2([["0.9", "Speed 0.9"], ["1", "Speed 1.0"], ["1.1", "Speed 1.1"], ["1.2", "Speed 1.2"]], P.voice.rate || 1, async (k) => { P.voice.rate = +k; await save(); aud = await WA.loadVoices(P); rows(); frame(0); }),
    sel2([["", "No music"], ["/assets/music/calm-focus.mp3", "Calm focus"], ["/assets/music/sunrise-chill.mp3", "Sunrise chill"], ["/assets/music/mtaa-groove.mp3", "Mtaa groove"]], P.music.src || "", async (k) => { P.music.src = k; await save(); }),
    A.btn("Use my own voice file...", "sm", ownVoice), A.btn("Make all voices", "sm primary", makeAll));
  function ownVoice() {
    const f = document.createElement("input"); f.type = "file"; f.multiple = true; f.accept = ".onnx,.json";
    f.onchange = async () => { const fl = [...f.files], onx = fl.find((x) => /\.onnx$/i.test(x.name)), js = fl.find((x) => /\.json$/i.test(x.name)); if (!onx || !js) return alert("Pick both files together: your model .onnx and its .onnx.json (Ctrl or long-press to select two).");
      const pv = C.progress($("#vmsg"), "Saving your voice in this browser..."); try { await T.setCustomModel(onx, js); P.voice.name = "piper:custom"; await save(); aud = await WA.loadVoices(P); location.reload(); } catch (err) { pv.fail(err); } };
    f.click(); }

  async function getMix() { const tl = TL(), sig = JSON.stringify(P.scenes.map((s) => s.narration)) + P.music.src + P.music.vol + assets.aud.join(","); if (mixBuf && sig === mixSig) return mixBuf; mixBuf = await WA.mix(P, tl, aud); mixSig = sig; return mixBuf; }
  async function play() {
    if (playing) { stop(); return; } $("#play").textContent = "..."; let mb = null; try { mb = await getMix(); } catch (e) {} const tl = TL(), from = (+$("#seek").value / 1000) * tl.total > tl.total - 0.5 ? 0 : (+$("#seek").value / 1000) * tl.total, a = mb ? T.play(mb, from) : null, t0 = performance.now() - from * 1000; playing = { a }; $("#play").textContent = "Stop";
    const step = () => { if (!playing) return; const t = a ? a.time() : (performance.now() - t0) / 1000; if (t >= tl.total) { stop(); return; } frame(t); $("#seek").value = Math.round((t / tl.total) * 1000); requestAnimationFrame(step); }; step();
  }
  function stop() { if (playing && playing.a) playing.a.stop(); playing = null; $("#play").textContent = "Play"; }
  $("#play").onclick = play; $("#seek").oninput = () => { if (playing) stop(); frame((+$("#seek").value / 1000) * TL().total); };

  let res = "720"; const eo = $("#eopts"); eo.append(sel2([["720", "720p (smaller file)"], ["1080", "1080p (sharper)"]], res, (k) => (res = k)), A.btn("Export MP4", "sm primary", async () => {
    if (!window.VideoEncoder) return alert("Export needs Chrome, Edge or a recent Android Chrome (WebCodecs).");
    if (playing) stop(); const box = $("#prog"); box.innerHTML = ""; const pr = C.progress(box, "Rendering the video");
    try { const z = W.size(P), px = res === "1080" ? (z.w >= z.h ? [1920, Math.round(1920 * z.h / z.w)] : [Math.round(1920 * z.w / z.h), 1920]) : z.px; const mb = await getMix(); const blob = await W.exportMP4(P, assets, mb, { px, onProgress: (x) => pr.set(x, x > 0.98 ? "finishing the file" : "") });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = (P.name || "whiteboard").replace(/[^\w-]+/g, "-") + ".mp4"; a.click(); pr.done("Saved " + (blob.size / 1048576).toFixed(1) + " MB"); } catch (e) { pr.fail(e); }
    frame(0); }));
  rows(); frame(0);
})();
