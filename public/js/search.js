// ============================================================
// Site-wide search — builds an in-memory index from the same
// database nodes every page reads (blog posts, content, writing,
// materials) and does a keyword match. Only published items count.
// ============================================================
(function () {
  const U = window.EO_UTIL;

  async function buildIndex() {
    const nodes = await window.EO_DB.getNodes(["writing_projects", "materials"]);
    const bi = await window.EO_DB.getBlogIndex();
    nodes.blog_posts = bi ? bi.items : await window.EO_DB.getNode("blog_posts");
    // content cards come from the light index (title + caption), not the full node with every body
    const ci = await window.EO_DB.getContentIndex();
    nodes.content_highlights = ci ? ci.items : await window.EO_DB.getNode("content_highlights");
    const pub = (list) => (list || []).filter((x) => x && U.isPublished(x));
    const items = [];

    pub(nodes.blog_posts).forEach((p) => items.push({
      type: "Blog post", kind: "blog", slug: p.slug, image: p.thumbnail || p.legacy_thumbnail, tags: p.tags || [], date: p.date, title: p.title, snippet: p.excerpt, url: `/blog/${p.slug}`, body: p.content ? U.stripHtml(p.content) : (p.excerpt || ""),
      haystack: `${p.title} ${p.excerpt} ${p.content ? U.stripHtml(p.content) : ""} ${(p.tags || []).join(" ")}`.toLowerCase(),
    }));
    pub(nodes.content_highlights).forEach((c) => items.push({
      type: "Content", kind: "content", slug: c.slug, image: c.image || c.legacy_image, tags: [], title: c.title, snippet: c.caption, url: `/content/${c.slug}`, body: U.stripHtml(c.body),
      haystack: `${c.title} ${c.caption} ${U.stripHtml(c.body)}`.toLowerCase(),
    }));
    (nodes.writing_projects || []).filter((w) => w && w.slug).forEach((w) => items.push({
      type: "Writing", kind: "book", slug: w.slug, image: "", tags: [], title: w.title, snippet: w.summary, url: `/writing/books/${w.slug}`, body: w.excerpt || "",
      haystack: `${w.title} ${w.summary} ${w.excerpt || ""}`.toLowerCase(),
    }));
    pub(nodes.materials).forEach((m) => items.push({
      type: m.access === "paid" ? "Material · paid" : "Material · free", kind: "material", slug: m.slug, category: m.category, access: m.access === "paid" ? "paid" : "free", price: m.price, drive: m.access === "paid" ? "" : (m.drive_url || ""), image: m.cover || "", tags: (m.tags || []).concat([m.unit, m.year, m.level].filter(Boolean)), title: m.title, snippet: m.description, url: `/materials/item/${m.slug}`, body: m.description || "",
      haystack: `${m.title} ${m.description} ${m.unit || ""} ${m.category || ""} ${(m.tags || []).join(" ")}`.toLowerCase(),
    }));
    return items;
  }

  function search(items, query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const words = q.split(/\s+/).filter(Boolean);
    return items
      .map((item) => ({ item, score: words.reduce((n, w) => (item.haystack.includes(w) ? n + 1 : n), 0) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.item);
  }

  window.EO_SEARCH = { buildIndex, search };
})();
