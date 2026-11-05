// Whiteboard hub: project list, templates and JSON import.
(async () => {
  await A.guard("whiteboard");
  const S = EO_WBSTORE, W = EO_WB, IMP = EO_WB_IMPORT, C = EO_WBC, E = C.esc, $ = (s, r) => (r || document).querySelector(s);
  $("#nav").appendChild(C.subnav("hub")); const hub = $("#hub");
  const defaults = (P) => { P.voice = P.voice || { name: "piper:mine", languageCode: "en-US", rate: 1, pitch: 0 }; P.music = P.music || { src: "/assets/music/calm-focus.mp3", vol: 0.06 }; return P; };
  const download = (name, text, type) => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: type || "application/json" })); a.download = name; a.click(); };
  const when = (t) => new Date(t).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

  async function render() {
    const list = await S.list();
    hub.innerHTML = `<div class="wb-row" id="bar"></div><div class="wb-row"><span class="wb-note">Templates:</span><span id="tpls"></span></div><h3 style="margin:1rem 0 .2rem">Your projects (${list.length})</h3><div class="wb-cards" id="cards"></div>${list.length ? "" : '<p class="wb-note">Nothing here yet. Start from a template or import a JSON script.</p>'}`;
    const bar = $("#bar");
    bar.append(A.btn("New blank project", "primary", async () => { const r = await S.create(defaults(Object.assign(W.newProject(), { scenes: [W.newScene()] }))); location.href = "/admin/whiteboard-edit?id=" + r.id; }),
      A.btn("Short from a card…", "primary", () => shortDialog()),
      A.btn("Import JSON script…", "", () => importDialog()),
      A.btn("Download example script", "sm", () => download("whiteboard-example-script.json", JSON.stringify(IMP.EXAMPLE, null, 2))),
      A.btn("Copy AI prompt", "sm", async () => { try { await navigator.clipboard.writeText(IMP.PROMPT); A.toast ? A.toast("Prompt copied") : alert("Prompt copied. Paste it into any AI chat, add your topic, and import the JSON it returns."); } catch { prompt("Copy this prompt:", IMP.PROMPT); } }));
    const t = $("#tpls"); [["checklist", "Checklist explainer"], ["compare", "Compare two things"], ["pie", "Pie chart reveal"]].forEach(([k, l]) => t.append(A.btn(l, "sm", async () => { const r = await S.create(defaults(Object.assign(W.newProject(), JSON.parse(JSON.stringify(EO_WB_TPL[k]))))); location.href = "/admin/whiteboard-edit?id=" + r.id; })));
    const cards = $("#cards");
    list.forEach((p) => { const c = document.createElement("div"); c.className = "wb-card";
      c.innerHTML = `${p.thumb ? `<img src="${E(p.thumb)}" alt="">` : '<div class="ph">no preview yet</div>'}<div class="in"><h3>${E(p.name)}</h3><span class="wb-note">${p.scenes} scene${p.scenes === 1 ? "" : "s"} · ${E(when(p.updated))}</span><div class="wb-row" style="margin:0"></div></div>`;
      const r = $(".wb-row", c);
      r.append(A.btn("Edit", "sm primary", () => (location.href = "/admin/whiteboard-edit?id=" + p.id)), A.btn("Voice & export", "sm", () => (location.href = "/admin/whiteboard-export?id=" + p.id)), A.btn("Audio mixer", "sm", () => (location.href = "/admin/whiteboard-export?id=" + p.id + "#mixer")),
        A.btn("Duplicate", "sm", async () => { const rec = await S.get(p.id); const d = JSON.parse(JSON.stringify(rec.data)); d.name = (d.name || "Project") + " copy"; await S.create(d, rec.thumb); render(); }),
        A.btn("JSON", "sm", async () => { const rec = await S.get(p.id); download((rec.name || "whiteboard").replace(/[^\w-]+/g, "-") + ".json", JSON.stringify(rec.data, null, 2)); }),
        A.btn("Delete", "sm", async () => { if (confirm('Delete "' + p.name + '"?')) { await S.del(p.id); render(); } }));
      cards.appendChild(c); });
  }

  function importDialog() {
    const d = document.createElement("div"); d.className = "wb-modal";
    d.innerHTML = `<div class="crt-window"><div class="titlebar"><span class="dot r"></span><span class="dot y"></span><span class="dot g"></span><span class="label">import json script</span></div><div class="body">
      <p class="wb-note">Paste a script or choose a .json file. A script uses layouts (steps, icons, bullets, …) that are placed for you, or raw items with x/y. <a href="/assets/whiteboard/import-guide.md" target="_blank">Read the guide</a>.</p>
      <div class="wb-row"><input type="file" id="jf" accept=".json,application/json"><button class="btn sm" id="ex" type="button">Paste the example</button></div>
      <textarea id="jt" spellcheck="false" placeholder='{"name":"My video","scenes":[{"layout":"title","title":"HELLO","say":"Hello there."}]}'></textarea>
      <div class="wb-msgs" id="jm"></div><div class="wb-row" id="jb"></div></div></div>`;
    document.body.appendChild(d); const ta = $("#jt", d), msgs = $("#jm", d); let obj = null;
    const check = async () => {
      obj = null; msgs.innerHTML = ""; if (!ta.value.trim()) return;
      try { obj = JSON.parse(ta.value); } catch (e) { msgs.innerHTML = `<div class="e">That is not valid JSON: ${E(e.message)}</div>`; return; }
      const sets = { tabler: await W.loadIcons() }; if (JSON.stringify(obj).indexOf('"lucide"') > -1) sets.lucide = await W.loadLucide();
      const v = IMP.validate(obj, sets); msgs.innerHTML = v.errors.map((m) => `<div class="e">Problem: ${E(m)}</div>`).join("") + v.warnings.map((m) => `<div class="w">Note: ${E(m)}</div>`).join("") + (v.errors.length ? "" : `<div>Looks good: ${obj.scenes.length} scene${obj.scenes.length === 1 ? "" : "s"}.</div>`); if (v.errors.length) obj = null;
    };
    ta.oninput = check; $("#jf", d).onchange = async (e) => { if (e.target.files[0]) { ta.value = await e.target.files[0].text(); check(); } }; $("#ex", d).onclick = () => { ta.value = JSON.stringify(IMP.EXAMPLE, null, 2); check(); };
    $("#jb", d).append(A.btn("Create project", "primary", async () => { await check(); if (!obj) return; const P = defaults(IMP.fromScript(obj)); const r = await S.create(P); location.href = "/admin/whiteboard-edit?id=" + r.id; }), A.btn("Cancel", "", () => d.remove()));
  }
  // ---------- short: revise a content card with highlights, circles and notes ----------
  let CARDS = null;
  async function shortDialog() {
    const d = document.createElement("div"); d.className = "wb-modal";
    d.innerHTML = `<div class="crt-window"><div class="titlebar"><span class="dot r"></span><span class="dot y"></span><span class="dot g"></span><span class="label">short from a card</span></div><div class="body">
      <p class="wb-note">Pick one of your explainer cards. The video shows the card, then a hand highlights, circles and underlines its rows and writes your notes under it, with captions. Everything stays editable in the editor.</p>
      <input type="search" id="cq" placeholder="Search cards (wet packs, suction, autoclave...)" style="width:100%"><div class="wb-grid" id="cg" style="grid-template-columns:repeat(4,1fr);max-height:190px;overflow:auto;margin:.4rem 0"></div>
      <div class="wb-note" id="cpick">No card chosen yet.</div>
      <div class="wb-two"><div class="field"><label>Rows on the card</label><select id="rows"><option>3</option><option selected>4</option><option>5</option></select></div><div class="field"><label>Format</label><select id="fmt"><option value="short">Vertical 9:16 (Reels, Shorts, TikTok)</option><option value="square">Square 1:1</option></select></div></div>
      <div id="rowset"></div>
      <label class="wb-note" style="display:flex;gap:.4rem;align-items:center"><input type="checkbox" id="rem" checked> Draw a box round the REMEMBER panel</label>
      <div class="field"><label>Voice-over (what is said)</label><textarea id="say" rows="5" placeholder="Row one. ... Row two. ..."></textarea></div>
      <div class="field"><label>Notes written under the card (one per line, up to 5)</label><textarea id="notes" rows="3" placeholder="Wet = contaminated&#10;Repack and reprocess"></textarea></div>
      <label class="wb-note" style="display:flex;gap:.4rem;align-items:center"><input type="checkbox" id="caps" checked> Auto captions</label>
      <div class="wb-msgs" id="sm"></div><div class="wb-row" id="sb"></div></div></div>`;
    document.body.appendChild(d); let pick = null;
    const g = $("#cg", d), ql = $("#cq", d);
    try { if (!CARDS) CARDS = (await fetch("/data/content-index.json").then((r) => r.json())).items; } catch { CARDS = []; $("#sm", d).innerHTML = '<div class="e">Could not load the card list.</div>'; }
    const list = () => { g.innerHTML = ""; const k = ql.value.trim().toLowerCase(); let n = 0; for (const c of CARDS) { if (k && !((c.t || "").toLowerCase().includes(k) || c.s.includes(k.replace(/\s+/g, "-")))) continue; const b = document.createElement("div"); b.className = "wb-a"; b.title = c.t; b.innerHTML = `<img loading="lazy" src="/assets/content/${E(c.s)}.jpg" style="width:70px;height:70px;object-fit:cover">`; b.onclick = () => { pick = c; $("#cpick", d).textContent = "Chosen: " + c.t; if (!$("#say", d).value) $("#say", d).value = "Let's revise this card together. " + (c.c || ""); }; g.appendChild(b); if (++n >= 48) break; } };
    ql.oninput = list; list();
    const TYPES = [["none", "No mark"], ["highlight", "Highlight"], ["circle", "Circle"], ["underline", "Underline"], ["box", "Box"], ["tick", "Tick"]], rs = $("#rowset", d);
    const paintRows = () => { rs.innerHTML = ""; const n = +$("#rows", d).value; for (let i = 1; i <= n; i++) { const r = document.createElement("div"); r.className = "wb-two"; r.innerHTML = `<div class="field"><label>Row ${i}</label><select data-r="${i}">${TYPES.map(([v, l]) => `<option value="${v}" ${v === (["highlight", "circle", "underline", "highlight", "box"][i - 1]) ? "selected" : ""}>${l}</option>`).join("")}</select></div><div class="field"><label>Mark it when the voice says (optional phrase)</label><input data-c="${i}" placeholder="a phrase from the voice-over"></div>`; rs.appendChild(r); } };
    $("#rows", d).onchange = paintRows; paintRows();
    $("#sb", d).append(A.btn("Make the short", "primary", async () => {
      if (!pick) { $("#sm", d).innerHTML = '<div class="e">Choose a card first.</div>'; return; }
      const say = $("#say", d).value.trim() || "Let's revise this card together.", marks = [];
      rs.querySelectorAll("select").forEach((s2) => { if (s2.value !== "none") { const cue = rs.querySelector(`[data-c="${s2.dataset.r}"]`).value.trim(); marks.push(Object.assign({ row: +s2.dataset.r, type: s2.value }, cue && say.toLowerCase().includes(cue.toLowerCase()) ? { cue } : {})); } });
      if ($("#rem", d).checked) marks.push({ remember: true });
      const notes = $("#notes", d).value.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 5);
      const T = pick.t.replace(/\s+[—-]\s+.*$/, "");
      const obj = { name: "Short: " + T, format: $("#fmt", d).value, pace: 1, flow: true, captions: { on: $("#caps", d).checked }, scenes: [
        { say: "Thirty seconds. " + T + ". Let's revise it.", hold: 0.3, layout: "title", title: "30 SECOND REVISION", subtitle: T, narrator: "auto" },
        { say, hold: 0.8, layout: "cardnotes", card: pick.s, rows: +$("#rows", d).value, title: T.toUpperCase(), marks, notes },
        { say: "Follow for more theatre tech. The full card is free on my website.", hold: 1, layout: "title", title: "FOLLOW", subtitle: "Free card on my website", narrator: "auto" }] };
      const P = defaults(IMP.fromScript(obj)); const r = await S.create(P); location.href = "/admin/whiteboard-edit?id=" + r.id; }), A.btn("Cancel", "", () => d.remove()));
  }
  render();
})();