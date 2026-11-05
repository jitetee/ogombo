// Single material page: /materials/item/<slug>
// Free  -> download button straight to the Google Drive file (counted + logged).
// Paid  -> price + "Order" (offline M-Pesa; admin sends the link after verifying).
(async () => {
  const U = window.EO_UTIL, E = U.esc;
  const slug = U.params().get("slug") || decodeURIComponent(location.pathname.split("/").filter(Boolean).pop() || "");
  const $ = (id) => document.getElementById(id);
  const [cfg, mats, cats, stats] = await Promise.all([window.EO_SITE.ready, window.EO_DB.getNode("materials"), window.EO_DB.getNode("material_categories"), window.EO_DB.getPath(`material_stats/${slug}`)]);
  const m = (mats || []).find((x) => x && x.slug === slug);
  if (!m || !U.isPublished(m)) {
    $("m-title").textContent = "Material not found";
    $("m-body").innerHTML = `<p><a href="/materials">← Browse all materials</a></p>`;
    const r = document.createElement("meta"); r.name = "robots"; r.content = "noindex"; document.head.appendChild(r);
    return;
  }
  const cat = (cats || []).find((c) => c._key === m.category);
  const paid = m.access === "paid";
  const url = window.EO_SITE.abs(`/materials/item/${slug}`);
  const image = m.cover ? window.EO_SITE.abs(m.cover) : window.EO_SITE.abs(cfg.default_og_image || "/assets/icons/icon-512.png");
  window.EO_SITE.setMeta({ title: `${m.title} — Materials — ${cfg.site_name}`, description: m.description, image, canonical: url, type: "article" });

  $("m-title").textContent = m.title;
  if (cat) { $("crumb-cat").textContent = cat.label; $("crumb-cat").href = `/materials/${cat._key}`; }
  $("crumb-title").textContent = m.title;
  const rows = [["Type", U.fileKind(m.file_type)], ["Section", cat && cat.label], ["Unit / course", m.unit], ["Year", m.year], ["Level", m.level], ["Pages", m.pages], ["Size", m.size], ["Downloads", stats && stats.downloads]].filter(([, v]) => v);
  $("m-body").innerHTML = `
    ${m.cover ? `<img class="post-hero" src="${E(m.cover)}" alt="${E(m.title)}">` : ""}
    <p><span class="badge ${paid ? "paid" : "free"}">${paid ? "Paid · KES " + E(m.price) : "Free"}</span>${Number((stats || {}).downloads) >= 5 ? `<span class="badge">⬇ ${E((stats || {}).downloads)} downloads</span>` : ""}${(m.tags || []).map((t) => `<span class="tag">${E(t)}</span>`).join("")}</p>
    <div class="post-body" id="post-content"><p>${E(m.description || "").replace(/\n/g, "<br>")}</p>${m.details_html || ""}</div>
    ${Array.isArray(m.includes) && m.includes.length ? `<h2>What's inside</h2><ul class="mat-inside">${m.includes.map((x) => `<li>${E(x)}</li>`).join("")}</ul>` : ""}
    ${rows.length ? `<table class="mat-meta">${rows.map(([k, v]) => `<tr><td>${E(k)}</td><td>${E(v)}</td></tr>`).join("")}</table>` : ""}
    <div class="row-links" id="m-actions" style="margin:1.2rem 0"></div>
    <div id="m-preview"></div>`;

  const act = $("m-actions");
  if (!paid) {
    if (m.drive_url) {
      act.innerHTML = `<a class="btn primary" id="dl-btn" href="${E(window.EO_DRIVE.download(m.drive_url))}" target="_blank" rel="noopener">${window.EO_DRIVE.isPdfExport(m.drive_url) ? "⬇ Download PDF" : "⬇ Download (Google Drive)"}</a>
        ${window.EO_DRIVE.preview(m.drive_url) ? `<button class="btn" id="pv-btn" type="button">${window.EO_ICON ? window.EO_ICON("eye", 16) + " " : ""}Preview</button>` : ""}
        ${window.EO_DRIVE.isPdfExport(m.drive_url) ? "" : `<a class="btn" href="${E(window.EO_DRIVE.view(m.drive_url))}" target="_blank" rel="noopener">Open in Drive</a>`}`;
      $("dl-btn").addEventListener("click", () => {
        window.EO_DB.increment(`material_stats/${slug}/downloads`).catch(() => {});
        window.EO_DB.push("download_log", { material: slug, title: m.title, category: m.category || "", ts: Date.now() }).catch(() => {});
      });
      const pv = $("pv-btn");
      if (pv) pv.addEventListener("click", () => { $("m-preview").innerHTML = `<iframe src="${E(window.EO_DRIVE.preview(m.drive_url))}" title="Preview" style="width:100%;height:70vh;border:1px solid var(--panel-border);border-radius:4px;background:#fff" loading="lazy"></iframe>`; pv.remove(); });
    } else {
      act.innerHTML = `<span class="btn disabled">Download link coming soon</span><a class="btn" data-whatsapp data-msg="Hi, when will '${E(m.title)}' be available?">Ask on WhatsApp</a>`;
      window.EO_SITE.refresh();
    }
  } else {
    let prior = null;
    try { prior = (JSON.parse(localStorage.getItem("eo_orders") || "[]")).find((o) => o.slug === slug); } catch {}
    const pvu = m.preview_url ? (/^(\/|https?:\/\/[^ ]+\.(png|jpe?g|webp|gif)(\?|$))/i.test(m.preview_url) && !/drive\.google/.test(m.preview_url) ? `<button class="btn" id="pv-btn2" type="button" data-img="${E(m.preview_url)}">${window.EO_ICON ? window.EO_ICON("eye", 16) + " " : ""}Free preview</button>` : (window.EO_DRIVE.preview(m.preview_url) ? `<button class="btn" id="pv-btn2" type="button" data-frame="${E(window.EO_DRIVE.preview(m.preview_url))}">${window.EO_ICON ? window.EO_ICON("eye", 16) + " " : ""}Free preview</button>` : "")) : "";
    act.innerHTML = `<a class="btn primary" href="/materials/order/${E(slug)}">${window.EO_ICON ? window.EO_ICON("shopping-cart", 16) + " " : ""}Order — KES ${E(m.price)}</a>${pvu}
      <a class="btn" data-whatsapp data-msg="Hi, I'm interested in '${E(m.title)}'">Ask on WhatsApp</a>`;
    $("m-body").insertAdjacentHTML("beforeend", `<div class="crt-window"><div class="titlebar"><span class="dot r"></span><span class="dot y"></span><span class="dot g"></span><span class="label">how-it-works</span></div><div class="body">
      <ol style="margin:0;padding-left:1.2rem;color:var(--ink-dim)"><li>Pay KES ${E(m.price)} by M-Pesa (details on the order page).</li><li>Paste the M-Pesa confirmation message in the order form and tell us where to send the file (WhatsApp/SMS number or email).</li><li>After the payment is verified, the download link is sent to you.</li></ol>
      ${prior ? `<p class="mono" style="margin:.8rem 0 0;color:var(--amber)">You already ordered this (ref ${E(prior.ref)}).</p>` : ""}</div></div>`);
    window.EO_SITE.refresh();
    const pb = $("pv-btn2");
    if (pb) pb.addEventListener("click", () => { $("m-preview").innerHTML = pb.dataset.img ? `<img src="${E(pb.dataset.img)}" alt="Preview of ${E(m.title)}" style="max-width:100%;border:1px solid var(--panel-border);border-radius:4px">` : `<iframe src="${E(pb.dataset.frame)}" title="Preview" style="width:100%;height:70vh;border:1px solid var(--panel-border);border-radius:4px;background:#fff" loading="lazy"></iframe>`; pb.remove(); });
    $("m-actions").insertAdjacentHTML("afterend", `<p class="hint">Have a discount code or a bundle code? Enter it on the order page.</p>`);
  }

  // more like this
  const rel = (mats || []).filter((x) => x && x.slug && x.slug !== slug && U.isPublished(x)).map((x) => ({ x, s: (x.category === m.category ? 2 : 0) + (x.unit && x.unit === m.unit ? 2 : 0) + ((x.tags || []).filter((t) => (m.tags || []).includes(t)).length) })).filter((r) => r.s > 0).sort((a, b) => b.s - a.s).slice(0, 3).map((r) => r.x);
  if (rel.length) $("m-body").insertAdjacentHTML("beforeend", `<h2 style="margin-top:2rem">More like this</h2>${rel.map((x) => `<a class="mat-card" href="/materials/item/${E(x.slug)}"><div class="mat-ico">${E(x.file_type || "file")}</div><div><h3>${E(x.title)}</h3><p><span class="badge ${x.access === "paid" ? "paid" : "free"}">${x.access === "paid" ? "KES " + E(x.price) : "Free"}</span></p></div></a>`).join("")}`);

  // structured data
  const ld = { "@context": "https://schema.org", "@type": "CreativeWork", name: m.title, description: m.description, url, image: [image], isAccessibleForFree: !paid,
    author: { "@type": "Person", name: "Ezra Ogombo" }, inLanguage: "en", learningResourceType: cat ? cat.label : "Study material" };
  if (paid) ld.offers = { "@type": "Offer", price: String(m.price), priceCurrency: "KES", availability: "https://schema.org/InStock", url };
  window.EO_SITE.jsonld(ld);
  window.EO_SITE.jsonld({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [["Home", "/"], ["Materials", "/materials"], [cat ? cat.label : "Materials", cat ? `/materials/${cat._key}` : "/materials"], [m.title, `/materials/item/${slug}`]].map(([n, p], i) => ({ "@type": "ListItem", position: i + 1, name: n, item: window.EO_SITE.abs(p) })) });

  window.EO_ENGAGE.mount($("engage-host"), { type: "material", slug, title: m.title, url, image: m.cover ? image : "", kicker: "Materials", meta: [cat && cat.label, paid ? `KES ${m.price}` : "Free"].filter(Boolean).join(" · "),
    getContent: () => $("post-content") });
  if (window.renderAdSlot) window.renderAdSlot();
})();
