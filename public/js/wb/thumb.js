// Thumbnail maker: 1920x1080 YouTube thumbnail from a narrator pose + big marker text, exported as JPEG.
(async () => {
  await A.guard("whiteboard");
  const W = EO_WB, S = EO_WBSTORE, C = EO_WBC, $ = (s, r) => (r || document).querySelector(s);
  $("#nav").appendChild(C.subnav("thumb")); const app = $("#app");
  const poses = ((await fetch("/assets/narrators/index.json").then((r) => r.json()).catch(() => ({ poses: [] }))).poses || []).map((p) => p.n);
  const photos = ["", "/assets/theatre-instruments.jpg", "/assets/theatre-lights.jpg", "/assets/theatre-portrait.jpg"];
  const THEMES = { red: ["#fff7ef", "#d7263d", "#1b1b1b"], teal: ["#0f5257", "#ffd23f", "#ffffff"], navy: ["#12263f", "#ffb703", "#ffffff"], paper: ["#f3efe4", "#1b6ec2", "#1b1b1b"], dark: ["#101418", "#35d07f", "#ffffff"] };
  const st = { title: "SURGICAL INSTRUMENTS", sub: "NAMES AND USES", tag: "", pose: poses.includes("point-right-grin") ? "point-right-grin" : poses[0], side: "left", theme: "red", photo: "", logo: true, handle: "@ezraogombo", size: 1 };
  const projects = await S.list().catch(() => []);
  app.innerHTML = `<div class="wb-two" style="align-items:start;gap:1rem"><div id="ctl"></div><div><div class="wb-stagebox"><canvas id="tc" width="1920" height="1080"></canvas></div><div class="wb-row"><button class="btn sm primary" id="dl" type="button">Download JPEG</button><span class="wb-note" id="sz"></span></div><div id="msg"></div></div></div>`;
  const ctl = $("#ctl"), cv = $("#tc"), ctx = cv.getContext("2d");
  const field = (label, el) => { const d = document.createElement("div"); d.className = "field"; d.innerHTML = `<label>${label}</label>`; d.append(el); ctl.append(d); return el; };
  const inp = (k, ph) => { const i = document.createElement("input"); i.value = st[k]; i.placeholder = ph || ""; i.oninput = () => { st[k] = i.value; draw(); }; return i; };
  const sel = (k, opts) => { const s = document.createElement("select"); opts.forEach(([v, l]) => { const o = document.createElement("option"); o.value = v; o.textContent = l; s.append(o); }); s.value = st[k]; s.onchange = () => { st[k] = s.value; draw(); }; return s; };
  if (projects.length) { const ps = document.createElement("select"); ps.innerHTML = '<option value="">Start from a project (optional)</option>' + projects.map((p) => `<option value="${C.esc(p.id)}">${C.esc(p.name || "Untitled")}</option>`).join(""); ps.onchange = () => { const p = projects.find((x) => x.id === ps.value); if (p) { st.title = String(p.name || "").toUpperCase(); tin.value = st.title; draw(); } }; field("Project", ps); }
  const tin = field("Big title (use a new line for 2 lines)", inp("title")), _ = field("Smaller line", inp("sub")), __ = field("Corner tag (for example EP 3)", inp("tag"));
  field("Narrator pose", sel("pose", poses.map((p) => [p, p.replace(/-/g, " ")]))); field("Narrator side", sel("side", [["left", "Left"], ["right", "Right"], ["none", "No narrator"]]));
  field("Colours", sel("theme", Object.keys(THEMES).map((k) => [k, k]))); field("Photo behind", sel("photo", photos.map((p) => [p, p ? p.split("/").pop().replace(/\..+/, "").replace("theatre-", "") : "None"])));
  const sz = field("Text size", (() => { const r = document.createElement("input"); r.type = "range"; r.min = 0.6; r.max = 1.4; r.step = 0.05; r.value = 1; r.oninput = () => { st.size = +r.value; draw(); }; return r; })());
  const imgs = {}; const load = (src) => imgs[src] || (imgs[src] = new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; }));
  const pr = C.progress($("#msg"), "Loading fonts and pictures"); try { await W.loadFonts(); pr.done("Ready"); } catch (e) { pr.fail(e); }
  let busy = false, again = false;
  async function draw() {
    if (busy) { again = true; return; } busy = true;
    try {
      const [bg, ac, ink] = THEMES[st.theme], w = 1920, h = 1080; ctx.clearRect(0, 0, w, h); ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
      if (st.photo) { const im = await load(st.photo); if (im) { const k = Math.max(w / im.width, h / im.height); ctx.save(); ctx.globalAlpha = 0.35; ctx.drawImage(im, (w - im.width * k) / 2, (h - im.height * k) / 2, im.width * k, im.height * k); ctx.restore(); } }
      const g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, "#ffffff10"); g.addColorStop(1, "#00000030"); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = ac; ctx.globalAlpha = 0.9; ctx.fillRect(0, h - 26, w, 26); ctx.globalAlpha = 1;
      const left = st.side === "left", none = st.side === "none"; let tx = none ? 100 : left ? 860 : 90, tw = none ? w - 200 : 960;
      if (!none) { const im = await load("/assets/narrators/" + st.pose + ".png"); if (im) { const r0 = im.width / im.height, ww = Math.min(h * 1.02 * r0, w * 0.42), hh = ww / r0, x = left ? 20 : w - ww - 20; ctx.save(); ctx.shadowColor = "#0006"; ctx.shadowBlur = 30; ctx.drawImage(im, x, h - hh + 10, ww, hh); ctx.restore(); if (left) { tx = ww - 10; tw = w - tx - 70; } else { tx = 80; tw = w - ww - 160; } } }
      const lines = String(st.title).toUpperCase().split(/\n|\\n/).flatMap((l) => l.trim() ? [l.trim()] : []);
      const fam = "WBMarker, 'Permanent Marker', cursive"; let size = 190 * st.size; const lw = (s) => Math.max(...lines.map((l) => { ctx.font = s + "px " + fam; return ctx.measureText(l).width; }), 1);
      // wrap words into lines of at most 3 and shrink to fit
      let L = lines.length ? lines : [""]; if (L.length === 1 && L[0].split(" ").length >= 2) { const ws = L[0].split(" "), mid = Math.ceil(ws.length / 2); L = [ws.slice(0, mid).join(" "), ws.slice(mid).join(" ")]; }
      while (size > 60 && Math.max(...L.map((l) => { ctx.font = size + "px " + fam; return ctx.measureText(l).width; })) > tw) size -= 4;
      const total = L.length * size * 1.08 + (st.sub ? size * 0.8 : 0), y0 = (h - total) / 2 + size * 0.85 - 30;
      ctx.textBaseline = "alphabetic"; ctx.textAlign = "left"; L.forEach((l, i) => { ctx.font = size + "px " + fam; ctx.lineWidth = size * 0.14; ctx.strokeStyle = bg; ctx.lineJoin = "round"; ctx.strokeText(l, tx, y0 + i * size * 1.08); ctx.fillStyle = i % 2 ? ink : ac; ctx.fillText(l, tx, y0 + i * size * 1.08); });
      if (st.sub) { const ss = size * 0.42; ctx.font = ss + "px " + fam; ctx.fillStyle = ink; ctx.fillText(String(st.sub).toUpperCase(), tx, y0 + (L.length - 1) * size * 1.08 + size * 0.8, tw); ctx.fillStyle = ac; ctx.fillRect(tx, y0 + (L.length - 1) * size * 1.08 + size * 0.2, Math.min(tw, 520), 12); }
      if (st.tag) { ctx.font = "70px " + fam; const tw2 = ctx.measureText(st.tag.toUpperCase()).width + 60, x = left || none ? w - tw2 - 40 : 40; ctx.fillStyle = ac; ctx.beginPath(); ctx.roundRect(x, 40, tw2, 110, 18); ctx.fill(); ctx.fillStyle = bg; ctx.textBaseline = "middle"; ctx.fillText(st.tag.toUpperCase(), x + 30, 97); }
      if (st.logo) { const li = await load("/assets/icons/icon-192.png"); if (li) { const r = 54, cx = w - 90, cy = h - 90; ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.clip(); ctx.drawImage(li, cx - r, cy - r, r * 2, r * 2); ctx.restore(); ctx.lineWidth = 6; ctx.strokeStyle = "#fff"; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.stroke(); } }
      $("#sz").textContent = "1920 x 1080, YouTube-ready";
    } catch (e) { C.banner("Thumbnail error: " + (e.message || e)); } finally { busy = false; if (again) { again = false; draw(); } }
  }
  $("#dl").onclick = async () => { await draw(); let q = 0.92, blob; for (; q > 0.5; q -= 0.08) { blob = await new Promise((r) => cv.toBlob(r, "image/jpeg", q)); if (blob.size < 1.9e6) break; } const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = (st.title || "thumbnail").toLowerCase().replace(/[^\w]+/g, "-").replace(/^-|-$/g, "") + ".jpg"; a.click(); $("#sz").textContent = "Saved " + (blob.size / 1024).toFixed(0) + " KB (YouTube limit is 2 MB)"; };
  draw();
})();
