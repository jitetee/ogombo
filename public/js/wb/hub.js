// Whiteboard hub: project list, templates and JSON import.
(async () => {
  await A.guard("whiteboard");
  const S = EO_WBSTORE, W = EO_WB, IMP = EO_WB_IMPORT, C = EO_WBC, E = C.esc, $ = (s, r) => (r || document).querySelector(s);
  $("#nav").appendChild(C.subnav("hub")); const hub = $("#hub");
  const defaults = (P) => { P.voice = P.voice || { name: "piper:mine", languageCode: "en-US", rate: 1, pitch: 0 }; P.music = P.music || { src: "/assets/music/calm-focus.mp3", vol: 0.12 }; return P; };
  const download = (name, text, type) => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: type || "application/json" })); a.download = name; a.click(); };
  const when = (t) => new Date(t).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

  async function render() {
    const list = await S.list();
    hub.innerHTML = `<div class="wb-row" id="bar"></div><div class="wb-row"><span class="wb-note">Templates:</span><span id="tpls"></span></div><h3 style="margin:1rem 0 .2rem">Your projects (${list.length})</h3><div class="wb-cards" id="cards"></div>${list.length ? "" : '<p class="wb-note">Nothing here yet. Start from a template or import a JSON script.</p>'}`;
    const bar = $("#bar");
    bar.append(A.btn("New blank project", "primary", async () => { const r = await S.create(defaults(Object.assign(W.newProject(), { scenes: [W.newScene()] }))); location.href = "/admin/whiteboard-edit?id=" + r.id; }),
      A.btn("Import JSON script…", "", () => importDialog()),
      A.btn("Download example script", "sm", () => download("whiteboard-example-script.json", JSON.stringify(IMP.EXAMPLE, null, 2))),
      A.btn("Copy AI prompt", "sm", async () => { try { await navigator.clipboard.writeText(IMP.PROMPT); A.toast ? A.toast("Prompt copied") : alert("Prompt copied. Paste it into any AI chat, add your topic, and import the JSON it returns."); } catch { prompt("Copy this prompt:", IMP.PROMPT); } }));
    const t = $("#tpls"); [["checklist", "Checklist explainer"], ["compare", "Compare two things"], ["pie", "Pie chart reveal"]].forEach(([k, l]) => t.append(A.btn(l, "sm", async () => { const r = await S.create(defaults(Object.assign(W.newProject(), JSON.parse(JSON.stringify(EO_WB_TPL[k]))))); location.href = "/admin/whiteboard-edit?id=" + r.id; })));
    const cards = $("#cards");
    list.forEach((p) => { const c = document.createElement("div"); c.className = "wb-card";
      c.innerHTML = `${p.thumb ? `<img src="${E(p.thumb)}" alt="">` : '<div class="ph">no preview yet</div>'}<div class="in"><h3>${E(p.name)}</h3><span class="wb-note">${p.scenes} scene${p.scenes === 1 ? "" : "s"} · ${E(when(p.updated))}</span><div class="wb-row" style="margin:0"></div></div>`;
      const r = $(".wb-row", c);
      r.append(A.btn("Edit", "sm primary", () => (location.href = "/admin/whiteboard-edit?id=" + p.id)), A.btn("Voice & export", "sm", () => (location.href = "/admin/whiteboard-export?id=" + p.id)),
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
  render();
})();
