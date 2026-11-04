/* Import runner (shared by /admin/merge and every admin page): writes updates in safe batches, keeps a backup of what was
   overwritten inside the database, records history, runs scheduled imports when they are due, and handles approvals.
   Needs window.A (admin.js) and window.DBMerge (dbmerge.js). */
(function () {
  const M = () => window.DBMerge;
  const ser = (map) => Object.entries(map || {}).map(([p, v]) => ({ p, v: JSON.stringify(v === undefined ? null : v) }));
  const deser = (list) => { const o = {}; (Array.isArray(list) ? list : Object.values(list || {})).forEach((e) => { o[e.p] = JSON.parse(e.v); }); return o; };
  async function write(updates, onProgress) {
    const bs = M().batches(updates, 60, 600000); let n = 0;
    for (let i = 0; i < bs.length; i++) { if (onProgress) onProgress(i + 1, bs.length); await A.patchRoot(bs[i]); n += Object.keys(bs[i]).length; }
    return n;
  }
  const safeId = (s) => String(s || "import").replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 50);
  const nodeSummary = (undo, updates) => { const s = {}; Object.keys(updates).forEach((p) => { const n = p.split("/")[0], k = undo[p] === null || undo[p] === undefined ? "new" : updates[p] === null ? "removed" : "changed"; (s[n] = s[n] || { new: 0, changed: 0, removed: 0 })[k]++; }); return s; };
  // job: {id, name, updates, undo, risk, patch}
  async function commit(job, opts) {
    opts = opts || {}; const key = safeId(job.id) + "-" + Date.now(), by = (A.session && A.session.email) || "";
    await A.set("import_backups/" + key, { ts: Date.now(), name: job.name, by, paths: ser(job.undo) });         // what was there before (for undo)
    const n = await write(job.updates, opts.onProgress);
    await A.set("import_history/" + key, { ts: Date.now(), by, name: job.name, patch: job.patch || job.id, changes: n, backup: key, risk: (job.risk && job.risk.level) || "low", nodes: nodeSummary(job.undo, job.updates), approvedBy: job.approvedBy || "" });
    await A.push("audit_log", { ts: Date.now(), uid: A.session.uid, email: by, op: "import", path: `patch:${job.id} (${n} changes)` }).catch(() => {});
    return { key, n };
  }
  async function undoPaths(key, filter) {
    const b = await A.get("import_backups/" + key); if (!b) throw new Error("The backup for this import is no longer stored. Use the undo file instead.");
    const all = deser(b.paths), upd = {}; Object.keys(all).forEach((p) => { if (!filter || filter(p)) upd[p] = all[p]; });
    const n = await write(upd); await A.push("audit_log", { ts: Date.now(), uid: A.session.uid, email: A.session.email, op: "import-undo", path: `backup:${key} (${n})` }).catch(() => {}); return n;
  }
  async function schedule(job, at) { const key = safeId(job.id) + "-" + Date.now(); await A.set("import_scheduled/" + key, { at, ts: Date.now(), by: A.session.email || "", name: job.name, id: job.id, risk: (job.risk && job.risk.level) || "low", updates: ser(job.updates), undo: ser(job.undo) }); return key; }
  async function submitForApproval(job) { const key = safeId(job.id) + "-" + Date.now(); await A.set("import_pending/" + key, { ts: Date.now(), byUid: A.session.uid, by: A.session.email || "", name: job.name, id: job.id, risk: (job.risk && job.risk.level) || "high", why: (job.risk && job.risk.why) || [], updates: ser(job.updates), undo: ser(job.undo) }); return key; }
  async function approve(key) { const r = await A.get("import_pending/" + key); if (!r) throw new Error("Request not found"); if (r.byUid === A.session.uid) throw new Error("A different admin must approve this."); const res = await commit({ id: r.id, name: r.name, updates: deser(r.updates), undo: deser(r.undo), risk: { level: r.risk }, approvedBy: A.session.email || "" }); await A.del("import_pending/" + key); return res; }
  async function runDue() {
    let all; try { all = await A.get("import_scheduled"); } catch { return 0; } if (!all) return 0; let done = 0;
    for (const [key, r] of Object.entries(all)) {
      if (!r || !r.at || r.at > Date.now()) continue;
      try { await commit({ id: r.id, name: r.name + " (scheduled)", updates: deser(r.updates), undo: deser(r.undo), risk: { level: r.risk } }); await A.del("import_scheduled/" + key); done++; }
      catch (e) { try { A.toast("Scheduled import failed: " + e.message, true); } catch {} }
    }
    if (done) { try { A.toast(done + " scheduled import(s) applied ✓"); } catch {} }
    return done;
  }
  window.EO_IMPORT = { ser, deser, write, commit, undoPaths, schedule, submitForApproval, approve, runDue, nodeSummary };
})();
