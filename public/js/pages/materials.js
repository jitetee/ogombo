// Materials hub (/materials) and category pages (/materials/notes, /materials/past-papers, ...).
// Items come from `materials`, categories from `material_categories`.
(async () => {
  const U = window.EO_UTIL, E = U.esc;
  const view = document.body.dataset.view;           // "hub" | "category"
  const [cfg, mats, cats] = await Promise.all([window.EO_SITE.ready, window.EO_DB.getNode("materials"), window.EO_DB.getNode("material_categories")]);
  const items = (mats || []).filter((m) => m && m.slug && m.title && U.isPublished(m));
  const catList = (cats || []).filter((c) => c && c._key).sort((a, b) => (a.order || 0) - (b.order || 0));
  const catOf = (k) => catList.find((c) => c._key === k);

  const [stats, bundles] = await Promise.all([window.EO_DB.getNode("material_stats").catch(() => null), window.EO_DB.getNode("material_bundles").catch(() => null)]);
  const dlOf = (m) => { const rec = Array.isArray(stats) ? (stats.find((x) => x && x._key === m.slug) || {}) : ((stats || {})[m.slug] || {}); return Number(rec.downloads) || 0; };
  const topDl = items.map(dlOf).sort((a, b) => b - a)[2] || 0;
  const fresh = items.filter((m) => m.created && (Date.now() - new Date(m.created).getTime()) < 14 * 864e5).length;
  const isNew = (m) => fresh <= items.length / 2 && m.created && (Date.now() - new Date(m.created).getTime()) < 14 * 864e5;

  const card = (m) => {
    const paid = m.access === "paid";
    const c = catOf(m.category), d = dlOf(m);
    const meta = [m.unit, m.year, m.level].filter(Boolean).join(" · ");
    const thumb = m.cover ? `<img class="mat-cover" src="${E(m.cover)}" alt="" loading="lazy">` : `<div class="mat-ico">${E(m.file_type || "file")}</div>`;
    return `<a class="mat-card" href="/materials/item/${E(m.slug)}">${thumb}
      <div><h3>${E(m.title)}</h3>
        <p><span class="badge ${paid ? "paid" : "free"}">${paid ? "KES " + E(m.price) : "Free"}</span>${isNew(m) ? `<span class="badge new">NEW</span>` : ""}${d > 0 && d >= topDl && d >= 5 ? `<span class="badge hot">★ POPULAR</span>` : ""}${m.featured === "yes" ? `<span class="badge hot">FEATURED</span>` : ""}${c ? `<span class="badge">${E(c.label)}</span>` : ""}${meta ? `<span class="mono" style="font-size:.8rem">${E(meta)}</span>` : ""}${d >= 5 ? `<span class="mono" style="font-size:.8rem">⬇ ${d}</span>` : ""}</p>
        <p style="margin:0">${E(m.description || "")}</p></div></a>`;
  };

  if (view === "hub") {
    document.getElementById("cat-grid").innerHTML = catList.map((c) => {
      const n = items.filter((m) => m.category === c._key).length;
      return `<a class="cat-card" href="/materials/${E(c._key)}"><h3>${E(c.label)}</h3><p>${E(c.description || "")}</p><p class="mono" style="margin-top:.5rem">${n} item${n === 1 ? "" : "s"} →</p></a>`;
    }).join("") || "<p>No categories yet.</p>";
    const free = items.filter((m) => m.access !== "paid").length, paid = items.length - free;
    document.getElementById("counts").textContent = `${items.length} materials · ${free} free · ${paid} paid`;

    // bundles: groups of materials sold with a discount code created in the admin
    const bl = (bundles || []).filter((b) => b && b.title && (b.status || "published") === "published").sort((a, b) => (a.order || 0) - (b.order || 0));
    if (bl.length) {
      document.getElementById("bundles-box").hidden = false;
      document.getElementById("bundles").innerHTML = bl.map((b) => {
        const list = (Array.isArray(b.slugs) ? b.slugs : String(b.slugs || "").split(",")).map((x) => x.trim()).map((x) => items.find((m) => m.slug === x)).filter(Boolean);
        const sum = list.reduce((t, m) => t + (m.access === "paid" ? Number(m.price) || 0 : 0), 0);
        return `<div class="bundle-card"><h3>${E(b.title)}</h3><p>${E(b.description || "")}</p>
          <ul>${list.map((m) => `<li><a href="/materials/item/${E(m.slug)}">${E(m.title)}</a> <span class="mono">${m.access === "paid" ? "KES " + E(m.price) : "Free"}</span></li>`).join("")}</ul>
          ${sum ? `<p class="mono">Separate price: KES ${sum}</p>` : ""}${b.code ? `<p>Use code <b class="bundle-code" data-code="${E(b.code)}" title="Click to copy">${E(b.code)}</b> on the order page.</p>` : ""}</div>`;
      }).join("");
      document.querySelectorAll(".bundle-code").forEach((el) => el.addEventListener("click", () => { try { navigator.clipboard.writeText(el.dataset.code); el.textContent = "Copied ✓"; setTimeout(() => (el.textContent = el.dataset.code), 1500); } catch {} }));
    }

    // explorer: search + section + access + sort, kept in the URL
    const q = U.params(), tb = document.getElementById("hub-toolbar");
    tb.innerHTML = `<input type="search" id="h-q" placeholder="Search all materials…" value="${E(q.get("q") || "")}">
      <select id="h-cat"><option value="">All sections</option>${catList.map((c) => `<option value="${E(c._key)}">${E(c.label)}</option>`).join("")}</select>
      <select id="h-acc"><option value="">Free &amp; paid</option><option value="free">Free only</option><option value="paid">Paid only</option></select>
      <select id="h-sort"><option value="rec">Recommended</option><option value="new">Newest</option><option value="pop">Most downloaded</option><option value="lo">Price: low to high</option><option value="hi">Price: high to low</option><option value="az">A–Z</option></select>`;
    [["h-cat", "cat"], ["h-acc", "access"], ["h-sort", "sort"]].forEach(([id, k]) => { if (q.get(k)) document.getElementById(id).value = q.get(k); });
    let shown = 12;
    const draw = (reset) => {
      if (reset) shown = 12;
      const v = (id) => document.getElementById(id).value, term = v("h-q").toLowerCase().trim(), cat = v("h-cat"), acc = v("h-acc"), sort = v("h-sort");
      const nq = new URLSearchParams(); if (term) nq.set("q", term); if (cat) nq.set("cat", cat); if (acc) nq.set("access", acc); if (sort !== "rec") nq.set("sort", sort);
      history.replaceState(null, "", location.pathname + (nq.toString() ? "?" + nq : ""));
      let list = items.filter((m) => (!cat || m.category === cat) && (!acc || (acc === "paid") === (m.access === "paid")) && (!term || `${m.title} ${m.description} ${m.unit || ""} ${m.year || ""} ${(m.tags || []).join(" ")}`.toLowerCase().includes(term)));
      const num = (m) => (m.access === "paid" ? Number(m.price) || 0 : 0);
      const sorters = { rec: (a, b) => (b.featured === "yes") - (a.featured === "yes") || (a.order || 0) - (b.order || 0), new: (a, b) => String(b.created || "").localeCompare(String(a.created || "")), pop: (a, b) => dlOf(b) - dlOf(a), lo: (a, b) => num(a) - num(b), hi: (a, b) => num(b) - num(a), az: (a, b) => a.title.localeCompare(b.title) };
      list = list.sort(sorters[sort] || sorters.rec);
      document.getElementById("latest").innerHTML = list.slice(0, shown).map(card).join("") || `<p>No matches. Try different words, or send a request below.</p>`;
      document.getElementById("hub-count").textContent = `${list.length} result${list.length === 1 ? "" : "s"}`;
      document.getElementById("more").hidden = list.length <= shown;
    };
    tb.addEventListener("input", () => draw(true));
    document.getElementById("more").addEventListener("click", () => { shown += 12; draw(false); });
    draw(true);

    // request form
    const rf = document.getElementById("req-form"), rs = document.getElementById("req-status");
    rf.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (rf.website.value) return;
      const text = rf.text.value.trim();
      if (text.length < 3) { rs.textContent = "Please describe what you need."; return; }
      const rec = { text: text.slice(0, 600), ts: Date.now() };
      if (rf.name.value.trim()) rec.name = rf.name.value.trim().slice(0, 60);
      if (rf.contact.value.trim()) rec.contact = rf.contact.value.trim().slice(0, 120);
      rs.textContent = "Sending…";
      try { await window.EO_DB.push("material_requests", rec); rf.reset(); rs.textContent = "Thank you! I've got your request ✓"; } catch { rs.textContent = "Could not send. Try again or use WhatsApp."; }
    });

    window.EO_SITE.jsonld({ "@context": "https://schema.org", "@type": "CollectionPage", name: "Materials", url: window.EO_SITE.abs("/materials"),
      mainEntity: { "@type": "ItemList", itemListElement: catList.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.label, url: window.EO_SITE.abs(`/materials/${c._key}`) })) } });
    if (window.renderAdSlot) window.renderAdSlot();
    return;
  }

  // ----- category view -----
  const key = document.body.dataset.cat || decodeURIComponent(location.pathname.split("/").filter(Boolean).pop() || "").replace(/\.html$/, "");
  const cat = catOf(key);
  if (!cat) {
    document.getElementById("cat-title").textContent = "Category not found";
    document.getElementById("list").innerHTML = `<p><a href="/materials">← All materials</a></p>`;
    return;
  }
  document.getElementById("cat-title").textContent = cat.label;
  document.getElementById("cat-desc").textContent = cat.description || "";
  document.getElementById("crumb-cat").textContent = cat.label;
  const canonBase = window.EO_SITE.abs(`/materials/${key}`);
  const inCat = items.filter((m) => m.category === key).sort((a, b) => (a.order || 0) - (b.order || 0));

  // filters (kept in the URL so every result page is shareable)
  const q = U.params();
  const tb = document.getElementById("toolbar");
  const years = [...new Set(inCat.map((m) => m.year).filter(Boolean))].sort().reverse();
  const units = [...new Set(inCat.map((m) => m.unit).filter(Boolean))].sort();
  tb.innerHTML = `<input type="search" id="f-q" placeholder="Search this section…" value="${E(q.get("q") || "")}">
    <select id="f-access"><option value="">Free &amp; paid</option><option value="free">Free only</option><option value="paid">Paid only</option></select>
    ${years.length ? `<select id="f-year"><option value="">All years</option>${years.map((y) => `<option>${E(y)}</option>`).join("")}</select>` : ""}
    ${units.length > 1 ? `<select id="f-unit"><option value="">All units</option>${units.map((y) => `<option>${E(y)}</option>`).join("")}</select>` : ""}`;
  const set = (id, v) => { const el = document.getElementById(id); if (el && v) el.value = v; };
  set("f-access", q.get("access")); set("f-year", q.get("year")); set("f-unit", q.get("unit"));

  const per = Math.max(1, parseInt((cfg.per_page || {}).materials, 10) || 6);
  function render(resetPage) {
    const val = (id) => (document.getElementById(id) || {}).value || "";
    const term = val("f-q").toLowerCase().trim(), acc = val("f-access"), yr = val("f-year"), un = val("f-unit");
    const nq = new URLSearchParams();
    if (term) nq.set("q", term); if (acc) nq.set("access", acc); if (yr) nq.set("year", yr); if (un) nq.set("unit", un);
    let list = inCat.filter((m) => (!acc || (acc === "paid") === (m.access === "paid")) && (!yr || String(m.year) === yr) && (!un || m.unit === un)
      && (!term || `${m.title} ${m.description} ${m.unit || ""} ${(m.tags || []).join(" ")}`.toLowerCase().includes(term)));
    const total = Math.max(1, Math.ceil(list.length / per));
    const page = resetPage ? 1 : window.EO_SITE.currentPage(total);
    if (page > 1) nq.set("page", page);
    history.replaceState(null, "", location.pathname + (nq.toString() ? "?" + nq : ""));
    document.getElementById("list").innerHTML = list.slice((page - 1) * per, page * per).map(card).join("")
      || `<p>${inCat.length ? "No matches — try different filters." : "Nothing here yet — check back soon, new items are added regularly."}</p>`;
    window.EO_SITE.pager(document.getElementById("pager"), { page, total });
    window.EO_SITE.setMeta({ title: `${cat.label}${page > 1 ? ` — page ${page}` : ""} — Materials — ${cfg.site_name}`, description: cat.description, canonical: canonBase + (page > 1 ? `?page=${page}` : "") });
  }
  tb.addEventListener("input", () => render(true));
  render(false);
  window.EO_SITE.jsonld({ "@context": "https://schema.org", "@type": "CollectionPage", name: cat.label, url: canonBase,
    mainEntity: { "@type": "ItemList", itemListElement: inCat.map((m, i) => ({ "@type": "ListItem", position: i + 1, name: m.title, url: window.EO_SITE.abs(`/materials/item/${m.slug}`) })) } });
  if (window.renderAdSlot) window.renderAdSlot();
})();
