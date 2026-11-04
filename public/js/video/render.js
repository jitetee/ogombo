// ============================================================
// MP4 export (EO_RENDER). Draws every frame with EO_VID.draw (same code as the preview), encodes with the
// browser's WebCodecs (H.264 + AAC) and packs it with mp4-muxer. Everything happens in this browser.
// Fallback for browsers without WebCodecs: real-time WebM recording (takes as long as the video).
// ============================================================
(function () {
  const DEF_FPS = 30;
  const supported = () => typeof VideoEncoder !== "undefined" && typeof AudioEncoder !== "undefined" && typeof VideoFrame !== "undefined" && typeof Mp4Muxer !== "undefined";

  async function pickVideo(w, h, bitrate, FPS) {
    for (const codec of ["avc1.640033", "avc1.640034", "avc1.640032", "avc1.4d0032", "avc1.42003e", "avc1.42001f"]) {
      try { const c = { codec, width: w, height: h, bitrate, framerate: FPS }; const s = await VideoEncoder.isConfigSupported(c); if (s.supported) return { cfg: c, mux: "avc" }; } catch {}
    }
    try { const c = { codec: "vp09.00.40.08", width: w, height: h, bitrate, framerate: FPS }; const s = await VideoEncoder.isConfigSupported(c); if (s.supported) return { cfg: c, mux: "vp9" }; } catch {}
    return null;
  }
  async function pickAudio(sr, ch) {
    for (const [codec, mux] of [["mp4a.40.2", "aac"], ["opus", "opus"]]) {
      try { const c = { codec, sampleRate: sr, numberOfChannels: ch, bitrate: 128000 }; const s = await AudioEncoder.isConfigSupported(c); if (s.supported) return { cfg: c, mux }; } catch {}
    }
    return null;
  }

  // P project, A assets ({imgs,poses,qr,aud,logo}), audioBuf = mixed AudioBuffer or null. opts: {onProgress(0..1), signal}
  async function renderMP4(P, A, audioBuf, opts) {
    opts = opts || {};
    const FPS = P.fps === 60 ? 60 : DEF_FPS, V = window.EO_VID, tl = V.timeline(P, A.aud), size = V.outSize(P), W = size.w, H = size.h;
    if (!tl.length) throw new Error("Add at least one scene first.");
    if (!supported()) throw new Error("This browser can't export MP4 directly. Use Chrome, Edge or a recent Android Chrome.");
    A.tl = tl;
    const bitrate = Math.round(Math.min(8e6, Math.max(3e6, W * H * FPS * 0.05)));
    const vc = await pickVideo(W, H, bitrate, FPS); if (!vc) throw new Error("No video encoder for " + W + "×" + H + " here. Try a lower quality (720p).");
    const sr = audioBuf ? audioBuf.sampleRate : 48000, ac = audioBuf ? await pickAudio(sr, 2) : null;
    const target = new Mp4Muxer.ArrayBufferTarget();
    const mux = new Mp4Muxer.Muxer({ target, fastStart: "in-memory", video: { codec: vc.mux, width: W, height: H, frameRate: FPS }, audio: ac ? { codec: ac.mux, numberOfChannels: 2, sampleRate: sr } : undefined });
    let err = null;
    const venc = new VideoEncoder({ output: (c, m) => mux.addVideoChunk(c, m), error: (e) => (err = e) }); venc.configure(vc.cfg);
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H; const ctx = cv.getContext("2d");
    const N = Math.ceil(tl.total * FPS), prog = (x) => opts.onProgress && opts.onProgress(x);
    for (let i = 0; i < N; i++) {
      if (opts.signal && opts.signal.aborted) { try { venc.close(); } catch {} throw new Error("Cancelled"); }
      if (err) throw err;
      V.draw(ctx, P, i / FPS, A);
      const f = new VideoFrame(cv, { timestamp: Math.round((i * 1e6) / FPS), duration: Math.round(1e6 / FPS) });
      venc.encode(f, { keyFrame: i % (FPS * 2) === 0 }); f.close();
      while (venc.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 4));
      if (i % 6 === 0) { prog((i / N) * (ac ? 0.9 : 1)); await new Promise((r) => setTimeout(r)); }
    }
    await venc.flush(); venc.close();
    if (ac) {
      const aenc = new AudioEncoder({ output: (c, m) => mux.addAudioChunk(c, m), error: (e) => (err = e) }); aenc.configure(ac.cfg);
      const L = audioBuf.getChannelData(0), R = audioBuf.numberOfChannels > 1 ? audioBuf.getChannelData(1) : L, CH = 4800, frames = Math.min(audioBuf.length, Math.ceil(tl.total * sr));
      for (let o = 0; o < frames; o += CH) {
        const n = Math.min(CH, frames - o), d = new Float32Array(n * 2); d.set(L.subarray(o, o + n), 0); d.set(R.subarray(o, o + n), n);
        const ad = new AudioData({ format: "f32-planar", sampleRate: sr, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((o * 1e6) / sr), data: d });
        aenc.encode(ad); ad.close();
        while (aenc.encodeQueueSize > 16) await new Promise((r) => setTimeout(r, 4));
      }
      await aenc.flush(); aenc.close();
    }
    if (err) throw err;
    mux.finalize(); prog(1);
    return new Blob([target.buffer], { type: "video/mp4" });
  }

  // real-time fallback -> WebM
  async function renderWebM(P, A, audioBuf, opts) {
    opts = opts || {};
    const FPS = P.fps === 60 ? 60 : DEF_FPS, V = window.EO_VID, tl = V.timeline(P, A.aud), size = V.outSize(P); A.tl = tl;
    const cv = document.createElement("canvas"); cv.width = size.w; cv.height = size.h; const ctx = cv.getContext("2d");
    const stream = cv.captureStream(FPS); let ac = null, src = null;
    if (audioBuf) { ac = new AudioContext(); const dest = ac.createMediaStreamDestination(); src = ac.createBufferSource(); src.buffer = audioBuf; src.connect(dest); dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t)); }
    const rec = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus") ? "video/webm;codecs=vp9,opus" : "video/webm", videoBitsPerSecond: 5e6 }), parts = [];
    rec.ondataavailable = (e) => e.data.size && parts.push(e.data);
    const done = new Promise((r) => (rec.onstop = r)); V.draw(ctx, P, 0, A); rec.start(500); if (src) src.start();
    const t0 = performance.now();
    await new Promise((res) => { const step = () => { const t = (performance.now() - t0) / 1000; if ((opts.signal && opts.signal.aborted) || t >= tl.total) return res(); V.draw(ctx, P, t, A); opts.onProgress && opts.onProgress(t / tl.total); requestAnimationFrame(step); }; step(); });
    rec.stop(); await done; if (ac) ac.close();
    return new Blob(parts, { type: "video/webm" });
  }

  window.EO_RENDER = { supported, renderMP4, renderWebM, FPS: DEF_FPS };
})();
