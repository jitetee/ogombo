// Detail pages for blog posts, content items and book pages.
// <body data-kind="blog|content|book" data-slug="optional"> — if the slug is
// missing (the catch-all templates used for newly created items) it is read
// from the URL. Everything is rendered from the live database, so edits made
// in the admin show up immediately; the static HTML only exists for SEO.
(async () => {
  const U = window.EO_UTIL, E = U.esc;
  const kind = document.body.dataset.kind || (location.pathname.indexOf("/content/") === 0 ? "content" : location.pathname.indexOf("/writing/") === 0 ? "book" : "blog");
  const CONF = {
    blog:    { node: "blog_posts", base: "/blog", label: "Blog", kicker: "LOG", ld: "BlogPosting" },
    content: { node: "content_highlights", base: "/content", label: "Content", kicker: "CONTENT", ld: "Article" },
    book:    { node: "writing_projects", base: "/writing/books", label: "Writing", kicker: "DRAFTS", ld: "Book", list: "/writing" },
  }[kind];
  const slug = document.body.dataset.slug || decodeURIComponent(location.pathname.split("/").filter(Boolean).pop() || "").replace(/\.html$/, "");
  const $ = (id) => document.getElementById(id);
  if ($("crumb-list")) { $("crumb-list").textContent = CONF.label; $("crumb-list").href = CONF.list || CONF.base; }

  // content cards: fetch just this card from the database and use the light index for prev/next,
  // instead of downloading every card with its full text
  let cfg, all, item;
  if (kind === "content") {
    const [c0, one, ci] = await Promise.all([window.EO_SITE.ready, window.EO_DB.getItem(CONF.node, slug), window.EO_DB.getContentIndex()]);
    cfg = c0; item = one; all = ci ? ci.items : [];
  } else if (kind === "blog") {
    const [c0, one, bi] = await Promise.all([window.EO_SITE.ready, window.EO_DB.getItem(CONF.node, slug), window.EO_DB.getBlogIndex()]);
    cfg = c0; item = one; all = bi ? bi.items : (one ? [one] : []);
  } else {
    const [c0, items] = await Promise.all([window.EO_SITE.ready, window.EO_DB.getNode(CONF.node)]);
    cfg = c0; all = (items || []).filter((x) => x && x.slug); item = all.find((x) => x.slug === slug);
  }

  if (!item || !U.isPublished(item)) {
    $("post-title").textContent = "Not found";
    $("post-content").innerHTML = `<p>This ${CONF.label.toLowerCase()} item isn't available. <a href="${CONF.list || CONF.base}">Browse all ${CONF.label.toLowerCase()} →</a></p>`;
    const m = document.createElement("meta"); m.name = "robots"; m.content = "noindex"; document.head.appendChild(m);
    document.title = `Not found — ${cfg.site_name}`;
    return;
  }

  // ---- normalise fields per kind ----
  const f = {
    title: item.title,
    desc: item.meta_description || item.excerpt || item.caption || item.summary || "",
    image: item.thumbnail || item.legacy_thumbnail || item.image || item.legacy_image || "",
    body: kind === "book"
      ? `<p>${E(item.summary || "")}</p>${item.excerpt ? `<blockquote>${E(item.excerpt)}</blockquote>` : ""}`
      : (item.content || item.body || `<p>${E(item.caption || "")}</p>`),
    date: item.date || "",
    tags: item.tags || [],
  };
  const url = window.EO_SITE.abs(`${CONF.base}/${slug}`);
  const img = f.image ? window.EO_SITE.abs(f.image) : window.EO_SITE.abs(cfg.default_og_image || "/assets/icons/icon-512.png");

  document.getElementById("robots-tag")?.remove();
  window.EO_SITE.setMeta({ title: `${f.title} — ${cfg.site_name}`, description: f.desc, image: img, canonical: url, type: kind === "book" ? "book" : "article" });

  // ---- render ----
  $("post-title").textContent = f.title;
  const dateLabel = f.date ? new Date(f.date + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "";
  const words = U.stripHtml(f.body).split(/\s+/).filter(Boolean).length;
  const mins = item.read_minutes || Math.max(1, Math.round(words / 200));
  if ($("post-kicker")) $("post-kicker").textContent = kind === "blog" ? `LOG · ${dateLabel.toUpperCase()}` : kind === "book" ? String(item.status || "draft").toUpperCase() : CONF.kicker;
  const metaBits = [dateLabel, kind !== "book" ? `${mins} min read` : "", item.author].filter(Boolean);
  if ($("post-meta")) $("post-meta").textContent = metaBits.join(" · ");
  if ($("crumb-title")) $("crumb-title").textContent = f.title;
  const thumb = $("post-thumb");
  if (thumb && f.image) { thumb.src = f.image; thumb.alt = f.title; thumb.style.display = ""; }
  else if (thumb) thumb.style.display = "none";
  $("post-content").innerHTML = f.body;
  window.EO_PAGE_TAGS = (f.tags || []).map((t) => String(t).toLowerCase().trim());   // for ad targeting
  if (window.EO_ADS && (kind === "blog" || kind === "content")) window.EO_ADS.placeInArticle($("post-content"));
  if ($("post-tags")) $("post-tags").innerHTML = f.tags.map((t) => `<a class="tag" href="/blog?tag=${encodeURIComponent(t)}">${E(t)}</a>`).join("");

  // ---- prev / next + related ----
  const ordered = kind === "blog" ? all.filter(U.isPublished).sort((a, b) => (a.date < b.date ? 1 : -1)) : all.filter(U.isPublished);
  const idx = ordered.findIndex((x) => x.slug === slug);
  const newer = idx > 0 ? ordered[idx - 1] : null, older = idx >= 0 && idx < ordered.length - 1 ? ordered[idx + 1] : null;
  if ($("post-nav")) {
    $("post-nav").innerHTML = (newer ? `<a class="btn" rel="prev" href="${CONF.base}/${newer.slug}">← ${E(newer.title)}</a>` : "<span></span>")
      + (older ? `<a class="btn" rel="next" href="${CONF.base}/${older.slug}">${E(older.title)} →</a>` : "<span></span>");
  }
  if ($("related") && kind === "blog" && f.tags.length) {
    const rel = ordered.filter((x) => x.slug !== slug && (x.tags || []).some((t) => f.tags.includes(t))).slice(0, 3);
    if (rel.length) $("related").innerHTML = `<h2>Related posts</h2><div class="grid-cards">${rel.map((p) => `<a class="post-card" href="${CONF.base}/${p.slug}"><img ${(p.thumbnail || p.legacy_thumbnail) ? `src="${E(p.thumbnail || p.legacy_thumbnail)}"` : ""} alt="" loading="lazy"><div class="body"><span class="date">${E(p.date)}</span><h3>${E(p.title)}</h3></div></a>`).join("")}</div>`;
    if ($("related").querySelector(".grid-cards") && window.EO_ADS) window.EO_ADS.placeRelated($("related").querySelector(".grid-cards"));
  }

  // ---- structured data ----
  document.querySelectorAll('script[data-prerender]').forEach((n) => n.remove());
  const crumbs = [["Home", "/"], [CONF.label, CONF.list || CONF.base], [f.title, `${CONF.base}/${slug}`]];
  window.EO_SITE.jsonld({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: crumbs.map(([n, p], i) => ({ "@type": "ListItem", position: i + 1, name: n, item: window.EO_SITE.abs(p) })) });
  const ld = { "@context": "https://schema.org", "@type": CONF.ld, headline: f.title, name: f.title, description: f.desc, image: [img], mainEntityOfPage: url, url,
    author: { "@type": "Person", name: item.author || "Ezra Ogombo", url: window.EO_SITE.abs("/about") },
    publisher: { "@type": "Person", name: "Ezra Ogombo" } };
  if (f.date) { ld.datePublished = f.date; ld.dateModified = item.updated || f.date; }
  if (f.tags.length) ld.keywords = f.tags.join(", ");
  window.EO_SITE.jsonld(ld);

  // ---- engagement (reactions, comments, share, QR, PDF) ----
  window.EO_ENGAGE.mount($("engage-host"), {
    type: kind, slug, title: f.title, url, image: f.image ? window.EO_SITE.abs(f.image) : "",
    kicker: CONF.label, meta: metaBits.join(" · "),
    getContent: () => $("post-content"),
  });
  if (window.renderAdSlot) window.renderAdSlot();
})();
