// Paginated list for the blog and content pages (5 per page by default —
// change `per_page` in the admin Settings). Pages are real URLs: ?page=2
(async () => {
  const U = window.EO_UTIL, E = U.esc;
  const kind = document.body.dataset.kind;
  const CONF = {
    blog:    { node: "blog_posts", base: "/blog", label: "Blog", img: (p) => p.thumbnail || p.legacy_thumbnail, text: (p) => p.excerpt, sort: (a, b) => (a.date < b.date ? 1 : -1) },
    content: { node: "content_highlights", base: "/content", label: "Content", img: (p) => p.image || p.legacy_image, text: (p) => p.caption, sort: () => 0 },
  }[kind];
  const [cfg, status, items0] = await Promise.all([window.EO_SITE.ready, window.EO_DB.getNode("status"), kind !== "blog" && kind !== "content" ? window.EO_DB.getNode(CONF.node) : null]);
  let items = items0;
  if (kind === "blog") { const bi = await window.EO_DB.getBlogIndex(); items = bi ? bi.items : await window.EO_DB.getNode(CONF.node); }
  if (kind === "content") { const ci = await window.EO_DB.getContentIndex(); items = ci ? ci.items : await window.EO_DB.getNode(CONF.node); }
  if (status && document.getElementById("status-ticker")) document.getElementById("status-ticker").textContent = `STATUS: ${status.note || "building"}  ·  last updated ${status.updated || "recently"}`;

  const tag = U.params().get("tag");
  let list = (items || []).filter((p) => p && p.slug && p.title && U.isPublished(p)).sort(CONF.sort);
  if (kind === "blog") {
    const tags = [...new Set(list.flatMap((p) => p.tags || []))].sort();
    const bar = document.getElementById("tag-bar");
    if (bar && tags.length) bar.innerHTML = `<a class="tag${tag ? "" : " on"}" href="/blog">all</a>` + tags.map((t) => `<a class="tag${t === tag ? " on" : ""}" href="/blog?tag=${encodeURIComponent(t)}">${E(t)}</a>`).join("");
    if (tag) list = list.filter((p) => (p.tags || []).includes(tag));
  }
  let per = Math.max(1, parseInt((cfg.per_page || {})[kind], 10) || 5);
  if (kind === "content" && list.length > 60 && per < 12) per = 24;   // a long card library needs bigger pages
  const totalPages = Math.max(1, Math.ceil(list.length / per));
  const page = window.EO_SITE.currentPage(totalPages);
  const grid = document.getElementById("list");
  if (!list.length) grid.innerHTML = `<p>Nothing here yet — check back soon.</p>`;
  const pageItems = list.slice((page - 1) * per, page * per);
  grid.innerHTML = pageItems.map((p) => `
    <a class="post-card" href="${CONF.base}/${E(p.slug)}">
      ${CONF.img(p) ? U.timg(CONF.img(p), p.title, 'style="filter:none"') : ""}
      <div class="body">
        ${p.date ? `<span class="date">${E(p.date)}</span>` : ""}
        <h3>${E(p.title)}</h3><p>${E(CONF.text(p) || "")}</p>
        <div>${(p.tags || []).map((t) => `<span class="tag">${E(t)}</span>`).join("")}</div>
      </div></a>`).join("");
  window.EO_SITE.pager(document.getElementById("pager"), { page, total: totalPages });

  // SEO: unique title/canonical per page of results
  const q = new URLSearchParams(); if (tag) q.set("tag", tag); if (page > 1) q.set("page", page);
  const canon = window.EO_SITE.abs(CONF.base + (q.toString() ? "?" + q : ""));
  const baseTitle = document.title.replace(/ — .*$/, "");
  window.EO_SITE.setMeta({ title: `${baseTitle}${tag ? " · " + tag : ""}${page > 1 ? ` — page ${page}` : ""} — ${cfg.site_name}`, canonical: canon });
  window.EO_SITE.jsonld({ "@context": "https://schema.org", "@type": "CollectionPage", name: baseTitle, url: canon,
    mainEntity: { "@type": "ItemList", itemListElement: list.slice((page - 1) * per, page * per).map((p, i) => ({ "@type": "ListItem", position: (page - 1) * per + i + 1, url: window.EO_SITE.abs(`${CONF.base}/${p.slug}`), name: p.title })) } });
  if (window.placeAdsInGrid) window.placeAdsInGrid(grid, 4);
  if (window.renderAdSlot) window.renderAdSlot();
})();
