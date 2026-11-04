// Whiteboard project store (EO_WBSTORE): projects + cached voice-overs in IndexedDB, shared by the hub, editor and export pages.
// IndexedDB (not localStorage) so big projects, hand photos and recorded voices fit, and every page sees the same data.
(function () {
  let dbp = null;
  const db = () => dbp || (dbp = new Promise((res, rej) => { const r = indexedDB.open("eo_wb", 1); r.onupgradeneeded = () => { const d = r.result; d.createObjectStore("projects", { keyPath: "id" }); d.createObjectStore("voices"); }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
  const tx = async (store, mode, fn) => { const d = await db(); return new Promise((res, rej) => { const t = d.transaction(store, mode), s = t.objectStore(store); let out; const q = fn(s); if (q) q.onsuccess = () => (out = q.result); t.oncomplete = () => res(out); t.onerror = () => rej(t.error); }); };
  const uid = () => "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const api = {
    uid,
    async list() { const all = (await tx("projects", "readonly", (s) => s.getAll())) || []; return all.sort((a, b) => b.updated - a.updated).map((r) => ({ id: r.id, name: r.name, updated: r.updated, thumb: r.thumb, scenes: r.data && r.data.scenes ? r.data.scenes.length : 0 })); },
    async get(id) { return tx("projects", "readonly", (s) => s.get(id)); },
    async put(rec) { rec.updated = Date.now(); if (rec.data && rec.data.name) rec.name = rec.data.name; await tx("projects", "readwrite", (s) => s.put(rec)); return rec; },
    async create(data, thumb) { const rec = { id: uid(), name: data.name || "Untitled whiteboard", data, thumb: thumb || "", updated: Date.now() }; await tx("projects", "readwrite", (s) => s.put(rec)); return rec; },
    async del(id) { await tx("projects", "readwrite", (s) => s.delete(id)); },
    // voices: key = voice|rate|narration. value = {sr, data:Float32Array}
    voiceKey: (voice, text) => [voice && voice.name, voice && voice.rate, voice && voice.name === "piper:custom" && window.EO_TTS && EO_TTS.cvStamp ? EO_TTS.cvStamp() : "", String(text || "").trim()].join("|"),
    async voiceGet(k) { return tx("voices", "readonly", (s) => s.get(k)); },
    async voicePut(k, v) { await tx("voices", "readwrite", (s) => s.put(v, k)); },
  };
  window.EO_WBSTORE = api;
})();
