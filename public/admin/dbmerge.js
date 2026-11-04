/* Database merger engine (pure functions, no network). Used by /admin/merge and by the node tests.
   plan(patch, current, modes) -> what would change; nothing is written here.
   Modes per top-level node:
     add     only add things that do not exist yet; never change or delete anything you already have   (safest)
     merge   add new things, update values that differ, keep everything else; explicit null in the patch deletes
     replace the node becomes exactly what the patch says (everything else in that node is removed)
   Protected nodes (accounts, sponsors, requests, comments, messages, statistics, logs…) are never touched. */
(function (root, factory) { if (typeof module === "object" && module.exports) module.exports = factory(); else root.DBMerge = factory(); })(typeof self !== "undefined" ? self : this, function () {
  const PROTECTED = ["admins", "mpesa_codes", "sponsors", "sponsor_requests", "sponsor_fulfil", "sponsor_notes", "ad_stats", "ad_pages", "ad_share", "ad_pause", "ad_audience", "ad_availability", "ad_images", "ad_images_pending", "analytics", "comments", "reactions", "shares", "pdf_downloads", "material_stats", "material_orders", "material_files", "contact_inbox", "newsletter", "download_log", "chat_feedback", "chat_unanswered", "chat_stats", "audit_log", "import_history", "marketing_drafts", "marketing_log", "marketing_settings", "material_requests"];
  // what a node does by default when the patch does not say (settings you may have edited are never overwritten)
  const DEFAULT_MODE = { blog_posts: "merge", content_highlights: "merge", writing_projects: "merge", materials: "merge", material_categories: "merge", chatbot_faq: "merge", occasions: "merge", jokes: "merge", milestones: "merge", interests: "merge", cyber_cafe_services: "merge", side_projects: "merge", gallery: "merge", pages: "merge" };
  const MODES = ["add", "merge", "replace"];
  const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
  const isCont = (v) => v !== null && typeof v === "object";
  const IDK = ["id", "slug", "key", "_key"];
  const eq = (a, b) => { if (a === b) return true; if (!isCont(a) || !isCont(b)) return false; const x = norm(a), y = norm(b), ka = Object.keys(x), kb = Object.keys(y); if (ka.length !== kb.length) return false; return ka.every((k) => k in y && eq(x[k], y[k])); };
  // arrays -> objects with index keys (the way the database stores them)
  function norm(v) { if (Array.isArray(v)) { const o = {}; v.forEach((x, i) => { if (x !== null && x !== undefined) o[String(i)] = x; }); return o; } return v; }
  const BADKEY = /[.$#\[\]\/\u0000-\u001f\u007f]/;

  function validate(patch) {
    const errors = [], warnings = [];
    if (!isObj(patch)) return { errors: ["The file must be a JSON object ({ … })."], warnings };
    const walk = (v, path) => {
      if (Array.isArray(v)) v.forEach((x, i) => walk(x, path + "/" + i));
      else if (isObj(v)) Object.keys(v).forEach((k) => { if (BADKEY.test(k) || k === "") errors.push(`Bad key "${k}" at ${path || "/"} — keys can't contain . $ # [ ] / or be empty.`); else walk(v[k], path + "/" + k); });
      else if (typeof v === "number" && !isFinite(v)) errors.push(`Not a valid number at ${path}`);
    };
    Object.keys(patch).forEach((k) => {
      if (k === "_patch" || k === "_undo" || k === "_readme") return;
      if (k.startsWith("_")) { warnings.push(`Ignoring "${k}" (names starting with _ are not data).`); return; }
      if (BADKEY.test(k)) { errors.push(`Bad top-level key "${k}".`); return; }
      walk(patch[k], k);
    });
    if (!Object.keys(patch).some((k) => !k.startsWith("_")) && !patch._undo) errors.push("There is no data in this file (only _patch / _readme).");
    return { errors, warnings };
  }

  // ---- merging one value. out: {updates, changes, kept} ; path is "node/a/b"
  function mergeInto(inc, cur, path, mode, out) {
    // inc / cur are normalised-on-demand; cur === undefined means "does not exist"
    if (inc === null) { if (mode === "merge" && cur !== undefined && cur !== null) { out.updates[path] = null; out.undo[path] = cur; out.changes.push({ path, kind: "removed", old: cur }); } return; }
    if (cur === undefined || cur === null) { out.updates[path] = inc; out.undo[path] = null; out.changes.push({ path, kind: "new", new: inc }); return; }
    if (Array.isArray(inc) && isCont(cur)) return mergeList(inc, norm(cur), path, mode, out);
    if (isCont(inc) && isCont(cur)) {
      const c = norm(cur), i = norm(inc);
      Object.keys(i).forEach((k) => mergeInto(i[k], c[k], path + "/" + k, mode, out));
      return;
    }
    // leaf vs leaf, or type change
    if (eq(inc, cur)) { out.same++; return; }
    if (mode === "add") { out.kept++; out.keptPaths.push(path); return; }
    out.updates[path] = inc; out.undo[path] = cur; out.changes.push({ path, kind: "changed", old: cur, new: inc });
  }
  function mergeList(inc, cur, path, mode, out) {
    if (mode === "add") { out.kept += inc.length ? 1 : 0; return; }               // an existing list is never edited in add mode
    const keys = Object.keys(cur), nextIdx = () => { const n = keys.filter((k) => /^\d+$/.test(k)).map(Number); return n.length ? Math.max(...n) + 1 : 0; };
    let idx = nextIdx();
    const idKey = inc.length && inc.every((x) => isObj(x)) ? IDK.find((k) => inc.every((x) => x[k] !== undefined)) : null;
    inc.forEach((item) => {
      if (item === null || item === undefined) return;
      if (idKey) {
        const hit = keys.find((k) => isObj(cur[k]) && cur[k][idKey] === item[idKey]);
        if (hit !== undefined) return mergeInto(item, cur[hit], path + "/" + hit, mode, out);
      } else if (keys.some((k) => eq(cur[k], item))) { out.same++; return; }
      const p = path + "/" + idx; idx++;
      out.updates[p] = item; out.undo[p] = null; out.changes.push({ path: p, kind: "new", new: item });
    });
  }

  function countLeaves(v) { if (!isCont(v)) return 1; const o = norm(v); const ks = Object.keys(o); return ks.length ? ks.reduce((n, k) => n + countLeaves(o[k]), 0) : 1; }

  // patch: parsed JSON; current: {node: value|null} for every node in the patch; modes: {node: mode} chosen by the user
  function plan(patch, current, modes, opts) {
    opts = opts || {}; const prot = (opts.protect || []).filter(Boolean);
    const meta = (isObj(patch._patch) ? patch._patch : {}), result = { meta, nodes: {}, updates: {}, undo: {}, totals: { new: 0, changed: 0, removed: 0, kept: 0, same: 0 } };
    modes = modes || {};
    Object.keys(patch).forEach((node) => {
      if (node.startsWith("_")) return;
      const n = result.nodes[node] = { node, mode: null, protected: false, new: 0, changed: 0, removed: 0, kept: 0, same: 0, changes: [], keptPaths: [] };
      if (PROTECTED.includes(node)) { n.protected = true; n.mode = "skip"; return; }
      const mode = MODES.includes(modes[node]) ? modes[node] : MODES.includes((meta.modes || {})[node]) ? meta.modes[node] : DEFAULT_MODE[node] || "add";
      n.mode = mode;
      const cur = current ? current[node] : undefined, inc = patch[node];
      const out = { updates: {}, undo: {}, changes: [], same: 0, kept: 0, keptPaths: [] };
      if (mode === "replace") {
        if (eq(inc, cur === null ? undefined : cur)) out.same = countLeaves(inc);
        else {
          out.updates[node] = inc === null ? null : inc; out.undo[node] = cur === undefined ? null : cur;
          // summarise what the replacement does
          const sub = { updates: {}, undo: {}, changes: [], same: 0, kept: 0, keptPaths: [] };
          mergeInto(inc, cur, node, "merge", sub);
          if (isCont(cur) && !Array.isArray(inc)) deepRemovals(inc, cur, node, sub.changes);
          else if (isCont(cur)) { const i = norm(inc), c = norm(cur); Object.keys(c).forEach((k) => { if (!(k in (i || {}))) sub.changes.push({ path: node + "/" + k, kind: "removed", old: c[k] }); }); }
          out.changes = sub.changes; out.same = sub.same;
        }
      } else mergeInto(inc, cur === undefined ? undefined : cur, node, mode, out);
      if (prot.length) {   // fields you protected are never changed or removed by an import
        const drop = (c) => c.kind !== "new" && prot.some((g) => globMatch(g, c.path));
        const dropped = out.changes.filter(drop); out.changes = out.changes.filter((c) => !drop(c));
        dropped.forEach((c) => { delete out.updates[c.path]; delete out.undo[c.path]; });
        if (dropped.length && out.updates[node] !== undefined) { out.updates = {}; out.undo = {}; out.changes.forEach((c) => { out.updates[c.path] = c.kind === "removed" ? null : c.new; out.undo[c.path] = c.kind === "new" ? null : c.old; }); }
        n.protectedKept = dropped.length; n.kept += dropped.length;
      }
      out.changes.forEach((c) => { c.node = node; const sp = c.path.split("/"); c.item = sp.slice(0, 2).join("/"); c.field = sp.slice(2).join("/"); n[c.kind]++; n.changes.push(c); });
      n.kept = out.kept; n.same = out.same; n.keptPaths = out.keptPaths;
      Object.assign(result.updates, out.updates); Object.assign(result.undo, out.undo);
      ["new", "changed", "removed", "kept", "same"].forEach((k) => (result.totals[k] += n[k]));
    });
    return result;
  }

  // ---------- advanced helpers (all pure; used by /admin/merge) ----------
  function deepRemovals(inc, cur, path, out) {
    const i = norm(inc), c = norm(cur);
    Object.keys(c).forEach((k) => {
      if (!(k in i)) out.push({ path: path + "/" + k, kind: "removed", old: c[k] });
      else if (isObj(i[k]) && isObj(c[k])) deepRemovals(i[k], c[k], path + "/" + k, out);
    });
  }
  // "materials/*/price" matches "materials/abc/price" (and anything below it); * stands for one path segment
  function globMatch(pattern, path) {
    const a = String(pattern).trim().replace(/^\/+|\/+$/g, "").split("/"), b = String(path).split("/");
    if (a.length > b.length) return false;
    return a.every((seg, i) => seg === "*" || seg === b[i]);
  }
  const canon = (v) => (Array.isArray(v) ? "[" + v.map(canon).join(",") + "]" : isObj(v) ? "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}" : JSON.stringify(v));
  // text that is signed in a patch: the data only (everything except _patch / _undo / _readme)
  function signedText(patch) { const o = {}; Object.keys(patch).filter((k) => !k.startsWith("_")).sort().forEach((k) => (o[k] = patch[k])); return canon(o); }
  // build the update from the changes you left ticked
  function select(result, excluded, rules) {
    rules = rules || {}; const upd = {}, und = {}, counts = { new: 0, changed: 0, removed: 0 }, paths = [];
    Object.values(result.nodes).forEach((n) => {
      if (n.protected) return;
      n.changes.forEach((c) => {
        if (excluded && excluded.has(c.path)) return;
        if (c.kind === "removed" && rules.neverDelete) return;
        upd[c.path] = c.kind === "removed" ? null : c.new; und[c.path] = c.kind === "new" ? null : c.old; counts[c.kind]++; paths.push(c.path);
      });
    });
    return { updates: upd, undo: und, counts, paths };
  }
  function risk(counts, nodes) {
    const why = []; let lvl = 0; const tot = counts.new + counts.changed + counts.removed;
    if (counts.removed) { lvl = 2; why.push(counts.removed + " item(s) will be deleted"); }
    const rep = Object.values(nodes).filter((n) => n.mode === "replace" && !n.protected).map((n) => n.node);
    if (rep.length) { lvl = 2; why.push("replace mode on " + rep.join(", ")); }
    if (counts.changed > 25) { lvl = Math.max(lvl, 1); why.push(counts.changed + " existing values will change"); }
    if (tot > 300) { lvl = Math.max(lvl, 1); why.push("a large update (" + tot + " changes)"); }
    return { level: ["low", "medium", "high"][lvl], score: lvl, why };
  }
  // every changed value must keep the type it has now; a few nodes have required fields
  const REQUIRED = { blog_posts: ["title"], materials: ["title"], chatbot_faq: ["answer"], cyber_cafe_services: [], occasions: [], jokes: [] };
  function schemaIssues(result, current) {
    const out = [], typeOf = (v) => (Array.isArray(v) ? "list" : v === null ? "null" : typeof v);
    Object.values(result.nodes).forEach((n) => {
      if (n.protected) return;
      n.changes.forEach((c) => {
        if (c.kind === "changed" && typeOf(c.old) !== typeOf(c.new) && !(isCont(c.old) && isCont(c.new))) out.push({ path: c.path, msg: `type changes from ${typeOf(c.old)} to ${typeOf(c.new)}` });
        if (c.kind === "new" && isObj(c.new) && /^[^/]+\/[^/]+$/.test(c.path)) { (REQUIRED[n.node] || []).forEach((f) => { if (c.new[f] === undefined || c.new[f] === "") out.push({ path: c.path, msg: `missing required "${f}"` }); }); }
        if (c.kind === "new" && c.field && /(^|\/)price$/.test(c.path) && typeof c.new !== "number") out.push({ path: c.path, msg: "price should be a number" });
      });
    });
    return out;
  }
  const slug = (t) => String(t || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const titleOf = (v) => (isObj(v) ? v.title || v.name || v.term || v.question || v.answer || "" : "");
  // new items that look like something you already have under another id
  function duplicates(result, current) {
    const out = [];
    Object.values(result.nodes).forEach((n) => {
      if (n.protected || !isCont(current && current[n.node])) return;
      const have = {}; const c = norm(current[n.node]);
      Object.keys(c).forEach((k) => { const t = slug(titleOf(c[k])); if (t) have[t] = k; });
      n.changes.forEach((ch) => { if (ch.kind !== "new" || !/^[^/]+\/[^/]+$/.test(ch.path)) return; const t = slug(titleOf(ch.new)); if (t && have[t] && ch.path.split("/")[1] !== have[t]) out.push({ path: ch.path, like: n.node + "/" + have[t], title: titleOf(ch.new) }); });
    });
    return out;
  }
  const FILE_RE = /^(\/[A-Za-z0-9_\-./%]+\.(png|jpe?g|webp|gif|svg|pdf|mp4))$/i;
  function assetRefs(result) {
    const refs = {}; const walk = (v, path) => { if (typeof v === "string") { if (FILE_RE.test(v)) (refs[v] = refs[v] || []).push(path); } else if (isCont(v)) { const o = norm(v); Object.keys(o).forEach((k) => walk(o[k], path + "/" + k)); } };
    Object.values(result.nodes).forEach((n) => { if (!n.protected) n.changes.forEach((c) => { if (c.kind !== "removed") walk(c.new, c.path); }); });
    return refs;
  }
  // items you edited by hand lately (from the audit log) -> "node/id" prefixes
  function editedPrefixes(rows, sinceTs) {
    const set = new Set();
    (rows || []).forEach((r) => { if (!r || !r.path || (sinceTs && r.ts < sinceTs) || /^import/.test(r.op || "")) return; const m = String(r.path).replace(/^patch:.*/, ""); if (!m) return; set.add(m.split("/").slice(0, 2).join("/")); });
    return set;
  }
  // small CSV reader (quotes, commas, newlines)
  function parseCSV(text) {
    const rows = []; let row = [], f = "", q = false; text = String(text).replace(/^﻿/, "");
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
      else if (c === '"') q = true; else if (c === ",") { row.push(f); f = ""; } else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(f); rows.push(row); row = []; f = ""; } else f += c;
    }
    if (f !== "" || row.length) { row.push(f); rows.push(row); }
    return rows.filter((r) => r.some((x) => String(x).trim() !== ""));
  }
  // columns: [{name, field, type:'text'|'number'|'list'|'bool'|'skip'}]
  function csvToPatch(rows, node, idCol, cols) {
    const head = rows[0] || [], items = {}, errors = [];
    rows.slice(1).forEach((r, ri) => {
      const o = {};
      cols.forEach((c, i) => { if (c.type === "skip" || !c.field) return; let v = (r[i] || "").trim(); if (v === "") return; if (c.type === "number") { const n = Number(v.replace(/,/g, "")); if (!isFinite(n)) { errors.push(`Row ${ri + 2}: "${v}" is not a number (${c.field})`); return; } v = n; } else if (c.type === "bool") v = /^(1|true|yes|y)$/i.test(v); else if (c.type === "list") v = v.split(/[;|]/).map((x) => x.trim()).filter(Boolean); o[c.field] = v; });
      let id = idCol >= 0 ? (r[idCol] || "").trim() : ""; if (!id) id = slug(o.title || o.name || o.term || "").replace(/ /g, "-");
      id = id.replace(/[.$#\[\]\/]/g, "-"); if (!id) { errors.push(`Row ${ri + 2}: no id or title`); return; }
      if (idCol >= 0 && /^(id|slug)$/i.test(head[idCol] || "")) o[String(head[idCol]).toLowerCase()] = id;
      items[id] = o;
    });
    return { patch: { _patch: { id: "csv-" + node + "-" + Date.now(), name: "CSV import into " + node, notes: Object.keys(items).length + " row(s) from a spreadsheet", modes: { [node]: "merge" } }, [node]: items }, errors };
  }
  // split a big update into several multi-path PATCH bodies
  function batches(updates, maxPaths, maxBytes) {
    maxPaths = maxPaths || 60; maxBytes = maxBytes || 600000;
    const out = []; let cur = {}, n = 0, bytes = 0;
    Object.entries(updates).forEach(([p, v]) => {
      const sz = JSON.stringify(v === undefined ? null : v).length + p.length + 8;
      if (n && (n >= maxPaths || bytes + sz > maxBytes)) { out.push(cur); cur = {}; n = 0; bytes = 0; }
      cur[p] = v === undefined ? null : v; n++; bytes += sz;
    });
    if (n) out.push(cur);
    return out;
  }
  return { PROTECTED, DEFAULT_MODE, MODES, validate, plan, batches, eq, norm, globMatch, canon, signedText, select, risk, schemaIssues, duplicates, assetRefs, editedPrefixes, parseCSV, csvToPatch, titleOf };
});
