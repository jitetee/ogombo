// ============================================================
// Firebase RTDB integration (REST, no SDK needed for visitors).
//  - READS  : EO_DB.getNode("blog_posts")  -> live DB first, then the
//             bundled data/seed-db.json if the DB is unreachable.
//  - WRITES : public, rule-validated writes only (comments, reactions,
//             contact form, orders, analytics...). Admin writes live in
//             /admin/admin.js and need a signed-in admin token.
// Collection nodes are stored as {key: item}; getNode() hands them back
// as plain arrays (each object item gets a `_key`), so pages can just
// .filter/.map/.find them.
// ============================================================
(function () {
  const FALLBACK_URL = "/data/seed-db.json";
  let localCachePromise = null;
  const cache = new Map();

  // Editable collections: when the DB is reachable but the node is empty
  // we show "nothing yet" instead of silently resurrecting old seed copy.
  const STRICT_NODES = new Set([
    "blog_posts", "writing_projects", "materials", "content_highlights",
    "material_categories",
  ]);

  // Nodes that are collections (read back as arrays).
  const ARRAY_NODES = new Set([
    "blog_posts", "writing_projects", "content_highlights", "materials",
    "study_units", "jokes", "occasions", "milestones", "interests",
    "cyber_cafe_services", "side_projects", "gallery", "ads", "chatbot_faq",
    "material_categories", "material_bundles",
  ]);

  function normalize(node, data) {
    if (!ARRAY_NODES.has(node) || data == null) return data;
    if (Array.isArray(data)) return data.filter((x) => x != null);
    if (typeof data !== "object") return data;
    const rows = Object.keys(data).map((k) => {
      const v = data[k];
      return v && typeof v === "object" ? Object.assign({ _key: k }, v) : v;
    });
    const hasOrder = rows.every((r) => r && typeof r === "object" && typeof r.order === "number");
    if (hasOrder) rows.sort((a, b) => a.order - b.order);
    return rows;
  }

  function dbUrl() {
    const cfg = window.EO_FIREBASE_CONFIG;
    return cfg && cfg.databaseURL ? cfg.databaseURL : null;
  }

  function loadLocalFallback() {
    if (!localCachePromise) {
      localCachePromise = fetch(FALLBACK_URL).then((r) => r.json()).catch(() => ({}));
    }
    return localCachePromise;
  }

  // Raw read of any path (no normalising, no fallback). Returns undefined on failure.
  async function getPath(path) {
    const base = dbUrl();
    if (!base) return undefined;
    try {
      const res = await fetch(`${base}/${path}.json`);
      if (!res.ok) return undefined;
      return await res.json();
    } catch { return undefined; }
  }

  async function fetchNode(node) {
    let reachable = false;
    const data = await getPath(node);
    if (data !== undefined) {
      reachable = true;
      if (data !== null) return normalize(node, data);
    }
    if (STRICT_NODES.has(node) && reachable) return null;
    if (STRICT_NODES.has(node) && !reachable) {
      // offline / rules blocked: seed copy is better than a blank site
      const local = await loadLocalFallback();
      return normalize(node, local[node] ?? null);
    }
    const local = await loadLocalFallback();
    return normalize(node, local[node] ?? null);
  }

  // ---------- browser cache for rarely-changing nodes ----------
  // Every admin save bumps /site_changed (a timestamp). A visitor keeps a copy of these nodes in localStorage and
  // re-downloads one only when site_changed moved (one tiny request replaces a whole node download). If the stamp
  // can't be read, a copy under 10 minutes old is used. Nothing older than 6 hours is ever trusted.
  const CACHED = new Set(["site_settings", "profile", "status", "chatbot_faq", "chatbot_config", "materials", "material_categories", "material_bundles", "writing_projects", "ads", "ad_settings", "ad_packages", "cyber_cafe_services", "payment", "pages", "milestones", "interests", "occasions", "jokes", "side_projects", "gallery"]);
  let stampP = null;
  function getStamp() {
    if (!stampP) stampP = (async () => {
      const base = dbUrl(); if (!base) return null;
      try { const r = await fetch(`${base}/site_changed.json`); if (!r.ok) return null; const v = await r.json(); return Number(v) || 0; } catch { return null; }
    })();
    return stampP;
  }
  const lsGet = (k) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  async function fetchCached(node) {
    const key = "eo_n_" + node, hit = lsGet(key), stamp = await getStamp(), age = hit ? Date.now() - hit.t : Infinity;
    if (hit && age < 6 * 3600e3 && (stamp !== null ? hit.s === stamp : age < 600e3)) return hit.d;
    const data = await fetchNode(node);
    if (data !== undefined && stamp !== null) lsSet(key, { s: stamp, t: Date.now(), d: data });
    return data;
  }

  // ---------- ads load first ----------
  // The ad nodes are requested the moment this script runs, and every other database/index read waits for them
  // (at most 1.5 s, so a slow ad request can never hold the site up).
  const AD_NODES = new Set(["ads", "ad_settings", "ad_pause"]);
  const skipAds = /^\/(admin|sponsor)(\/|$)/.test(location.pathname);
  let adsFirst = Promise.resolve();
  const afterAds = () => Promise.race([adsFirst, new Promise((r) => setTimeout(r, 1500))]);

  function getNode(node) {
    if (!cache.has(node)) {
      const run = CACHED.has(node) ? fetchCached : fetchNode;
      cache.set(node, AD_NODES.has(node) ? run(node) : afterAds().then(() => run(node)));
    }
    return cache.get(node);
  }
  if (!skipAds && dbUrl()) adsFirst = Promise.all([...AD_NODES].map((n) => getNode(n).catch(() => null)));

  async function getNodes(nodes) {
    const entries = await Promise.all(nodes.map(async (n) => [n, await getNode(n)]));
    return Object.fromEntries(entries);
  }

  // ---------- public, rule-validated writes ----------
  async function send(method, path, body) {
    const base = dbUrl();
    if (!base) throw new Error("No database configured");
    const res = await fetch(`${base}/${path}.json`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`DB write failed (${res.status})`);
    return res.json();
  }
  // Spam brake for the public forms (the real protection is App Check / Cloudflare; this stops bots that use the page).
  // A form can't be sent in the first 2.5 s after the page opens, nor twice within the cooldown, nor more than the daily cap.
  const PAGE_AT = Date.now();
  const LIMITS = { contact_inbox: [30, 8], newsletter: [20, 4], material_requests: [30, 6], material_orders: [20, 12], comments: [15, 25], chat_unanswered: [3, 60], chat_feedback: [3, 40] };
  function brake(path) {
    const k = Object.keys(LIMITS).find((x) => path === x || path.indexOf(x + "/") === 0);
    if (!k) return;
    if (Date.now() - PAGE_AT < 2500) throw new Error("Please wait a moment and try again");
    const [gap, cap] = LIMITS[k], day = new Date().toISOString().slice(0, 10), key = "eo_brake_" + k;
    let st = { d: day, n: 0, t: 0 };
    try { const x = JSON.parse(localStorage.getItem(key) || "null"); if (x && x.d === day) st = x; } catch {}
    if (Date.now() - st.t < gap * 1000) throw new Error("You're sending too fast. Please wait a few seconds");
    if (st.n >= cap) throw new Error("Daily limit reached. Please try again tomorrow");
    st.n++; st.t = Date.now();
    try { localStorage.setItem(key, JSON.stringify(st)); } catch {}
  }
  // Security record: for posts the visitor submits (comments, messages, requests, orders) the IP address, browser, time zone,
  // page and time are saved in /evidence (admin-only read, never shown in the admin screens). Disclosed in privacy.html.
  const EVID = { comments: "comment", contact_inbox: "contact", material_requests: "request", material_orders: "order", newsletter: "newsletter" };
  let ipP = null;
  const getIp = () => ipP || (ipP = (async () => {
    for (const u of ["https://www.cloudflare.com/cdn-cgi/trace", "https://api.ipify.org?format=json"]) {
      try { const r = await fetch(u, { cache: "no-store" }); const t = await r.text(); const m = /(?:^|\n)ip=([^\n]+)/.exec(t) || /"ip"\s*:\s*"([^"]+)"/.exec(t); if (m) return m[1].trim().slice(0, 64); } catch {}
    }
    return "";
  })());
  async function record(path, name) {
    const k = Object.keys(EVID).find((x) => path === x || path.indexOf(x + "/") === 0);
    if (!k || !name) return;
    try {
      const rec = { ts: Date.now(), ip: await getIp(), ua: String(navigator.userAgent || "").slice(0, 300), tz: (Intl.DateTimeFormat().resolvedOptions().timeZone || "").slice(0, 60), lang: String(navigator.language || "").slice(0, 20), page: location.pathname.slice(0, 200), ref: path.slice(0, 100) + "/" + name };
      await send("PUT", `evidence/${EVID[k]}/${name}`, rec);
    } catch {}
  }
  const push = async (path, data) => { brake(path); const r = await send("POST", path, data); record(path, r && r.name); return r; };        // -> {name: "-Nxyz"}
  const set = (path, data) => send("PUT", path, data);
  const patch = (path, data) => send("PATCH", path, data);
  const increment = (path, by = 1) => send("PUT", path, { ".sv": { increment: by } });


  // ---------- light content index ----------
  // /data/content-index.json (rebuilt at every deploy) lists every content card WITHOUT its body, so list
  // pages, search and the home page stay small. Cards added in the admin after the last deploy are
  // appended from a small database query (needs ".indexOn": "order" on content_highlights).
  let ciPromise = null;
  function getContentIndex() {
    if (!ciPromise) ciPromise = (async () => {
      await afterAds();
      let idx = null;
      try { const r = await fetch("/data/content-index.json"); if (r.ok) idx = await r.json(); } catch {}
      if (!idx || !Array.isArray(idx.items)) return null;
      const items = idx.items.map((x) => ({ slug: x.s, title: x.t, image: x.i, caption: x.c, order: x.o, status: "published" }));
      const have = new Set(items.map((x) => x.slug));
      const base = dbUrl();
      if (base) {
        // cards added in the admin after the last deploy: new ones get an order below the lowest (or above the highest) in the index
        const q = (qs) => fetch(`${base}/content_highlights.json?orderBy=%22order%22&${qs}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
        const [hi, lo] = await Promise.all([q(`startAt=${(Number(idx.max) || 0) + 1}`), q(`endAt=${(Number(idx.min) || 0) - 1}`)]);
        [hi, lo].forEach((d) => Object.keys(d || {}).forEach((k) => { const v = d[k]; if (v && v.slug && v.title && !have.has(v.slug) && (v.status || "published") === "published") { have.add(v.slug); items.push({ slug: v.slug, title: v.title, image: v.image || v.legacy_image || "", caption: v.caption || "", order: Number(v.order) || 0, status: "published" }); } }));
      }
      items.sort((a, b) => a.order - b.order);
      return { count: items.length, items };
    })();
    return ciPromise;
  }

  // light blog index: same idea. Posts written in the admin after the last deploy are fetched with a small query
  // (needs ".indexOn": "date" on blog_posts) and appended.
  let biPromise = null;
  function getBlogIndex() {
    if (!biPromise) biPromise = (async () => {
      await afterAds();
      let idx = null;
      try { const r = await fetch("/data/blog-index.json"); if (r.ok) idx = await r.json(); } catch {}
      if (!idx || !Array.isArray(idx.items)) return null;
      const items = idx.items.map((x) => ({ slug: x.s, title: x.t, date: x.d, excerpt: x.e, thumbnail: x.i, tags: x.g || [], read_minutes: x.m, status: "published" }));
      const have = new Set(items.map((x) => x.slug));
      const base = dbUrl();
      if (base) {
        try {
          const r = await fetch(`${base}/blog_posts.json?orderBy=%22date%22&startAt=%22${encodeURIComponent(idx.max || "")}%22`);
          const d = r.ok ? await r.json() : null;
          Object.keys(d || {}).forEach((k) => { const v = d[k]; if (v && v.slug && v.title && !have.has(v.slug)) { have.add(v.slug); items.push({ slug: v.slug, title: v.title, date: v.date || "", excerpt: v.excerpt || "", thumbnail: v.thumbnail || v.legacy_thumbnail || "", tags: v.tags || [], read_minutes: v.read_minutes, status: v.status || "published" }); } });
        } catch {}
      }
      items.sort((a, b) => (a.date < b.date ? 1 : -1));
      return { count: items.length, items };
    })();
    return biPromise;
  }

  // One item by key (slug) without downloading the whole node. Falls back to the full node.
  async function getItem(node, slug) {
    await afterAds();
    const v = await getPath(`${node}/${encodeURIComponent(slug)}`);
    if (v && typeof v === "object") return Object.assign({ _key: slug }, v);
    const all = await getNode(node);
    return (all || []).find((x) => x && x.slug === slug) || null;
  }

  window.EO_DB = { getContentIndex, getBlogIndex, getItem, getNode, getNodes, getPath, push, set, patch, increment, serverTime: { ".sv": "timestamp" } };

  // ---------- small shared helpers ----------
  window.EO_UTIL = {
    esc(s) {
      return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    },
    stripHtml(html) {
      const d = document.createElement("div");
      d.innerHTML = html || "";
      return d.textContent || "";
    },
    // Small copy of a content card image for lists.
    // mode "local" (default): /assets/content/t/<name>.webp made at build time.
    // mode "cdn": ONE original image; a free resizing proxy (wsrv.nl) fetches it from this site and returns just the size asked for,
    // so the browser downloads a few KB instead of the full picture. Switch with  window.EO_IMG_MODE = "cdn"  (before db.js) or localStorage eo-img-mode.
    imgMode() { try { return window.EO_IMG_MODE || localStorage.getItem("eo-img-mode") || "local"; } catch (e) { return window.EO_IMG_MODE || "local"; } },
    sized(src, w) { return "https://wsrv.nl/?url=" + encodeURIComponent(location.host + src) + "&w=" + w + "&output=webp&q=76"; },
    thumb(src, w) {
      const m = /^\/assets\/content\/([^\/]+)\.jpg$/.exec(src || "");
      if (!m) return src;
      return window.EO_UTIL.imgMode() === "cdn" && !/^(localhost|127\.)/.test(location.hostname) ? window.EO_UTIL.sized(src, w || 320) : `/assets/content/t/${m[1]}.webp`;
    },
    // <img> markup for lists: thumbnail first, original if the thumbnail is missing
    timg(src, alt, extra) {
      const t = window.EO_UTIL.thumb(src), cdn = t !== src && /^https:\/\/wsrv\.nl/.test(t), q = (x) => String(x == null ? "" : x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
      return `<img src="${q(t)}"${cdn ? ` srcset="${q(window.EO_UTIL.sized(src, 240))} 240w, ${q(window.EO_UTIL.sized(src, 480))} 480w, ${q(window.EO_UTIL.sized(src, 720))} 720w" sizes="(max-width:600px) 50vw, 240px"` : ""} alt="${q(alt)}" loading="lazy" decoding="async"${t !== src ? ` onerror="this.onerror=null;this.src='${q(src)}'"` : ""} ${extra || ""}>`;
    },
    slugify(s) {
      return String(s || "").toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
    },
    timeAgo(ts) {
      const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
      const units = [[31536000, "y"], [2592000, "mo"], [604800, "w"], [86400, "d"], [3600, "h"], [60, "m"]];
      for (const [n, u] of units) if (s >= n) return `${Math.floor(s / n)}${u} ago`;
      return "just now";
    },
    // /blog.html -> /blog, /index.html -> /
    clean(path) {
      return path.replace(/\/index\.html$/, "/").replace(/\.html$/, "") || "/";
    },
    params() { return new URLSearchParams(location.search); },
    // Items visible to the public: not draft, and not scheduled in the future.
    isPublished(item) {
      if (!item || item.status === "draft" || item.status === "hidden") return false;
      if (item.date && item.date > new Date().toISOString().slice(0, 10)) return false;
      return true;
    },
    // Page-number list with ellipses, e.g. [1,"…",4,5,6,"…",21]
    pageWindow(cur, total) {
      const out = [];
      for (let p = 1; p <= total; p++) {
        if (p === 1 || p === total || Math.abs(p - cur) <= 1) out.push(p);
        else if (out[out.length - 1] !== "…") out.push("…");
      }
      return out;
    },
  };

  window.EO_AGE = function (birthDateStr) {
    if (!birthDateStr) return null;
    const birth = new Date(birthDateStr + "T00:00:00");
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    const had = now.getMonth() > birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() >= birth.getDate());
    return had ? age : age - 1;
  };

  document.querySelectorAll("[data-year]").forEach((el) => { el.textContent = new Date().getFullYear(); });
})();
