// ============================================================
// Site shell: everything that used to be hard-coded in every page
// (nav links, social links, WhatsApp, e-mail, footer, per-page sizes)
// now comes from the `site_settings` node and is filled in here.
//
//   <a data-whatsapp>…</a>  <div data-socials></div>  <a data-email>…</a>
//   <span data-site-name></span>   <a data-drive="<drive url>">…</a>
//
// Also hosts EO_DRIVE (Google Drive link helpers), EO_UI.pager and
// a tiny JSON-LD injector for SEO.
// ============================================================
(function () {
  const U = window.EO_UTIL;
  const DEFAULTS = {
    site_name: "Ezra Ogombo",
    per_page: { blog: 5, content: 5, materials: 6, comments: 5 },
    nav: [
      { label: "home", url: "/", order: 1 }, { label: "about", url: "/about", order: 2 },
      { label: "content", url: "/content", order: 3 }, { label: "videos", url: "/videos", order: 3.5 }, { label: "blog", url: "/blog", order: 4 },
      { label: "writing", url: "/writing", order: 5 }, { label: "materials", url: "/materials", order: 6 },
      { label: "contact", url: "/contact", order: 7 },
    ],
    socials: {},
    whatsapp: { numbers: [], primary: "", message: "Hello Ezra" },
  };

  // ---------------- Google Drive helpers ----------------
  const EO_DRIVE = {
    id(url) {
      if (!url) return null;
      const m = String(url).match(/\/file\/d\/([\w-]{10,})/) || String(url).match(/[?&]id=([\w-]{10,})/) || String(url).match(/\/d\/([\w-]{10,})/);
      return m ? m[1] : null;
    },
    isFolder: (url) => /\/folders\//.test(url || ""),
    // Native Google Docs / Slides / Sheets links: {kind, id}. These are served to visitors as a
    // read-only PDF (Google converts on the fly), so nobody receives an editable .docx.
    gdoc(url) {
      const m = String(url || "").match(/docs\.google\.com\/(document|presentation|spreadsheets)\/d\/([\w-]{10,})/);
      return m ? { kind: m[1], id: m[2] } : null;
    },
    // direct-download URL for a shared file; folders / non-drive links pass through
    download(url) {
      const g = EO_DRIVE.gdoc(url);
      if (g) return g.kind === "document" ? `https://docs.google.com/document/d/${g.id}/export?format=pdf`
        : g.kind === "presentation" ? `https://docs.google.com/presentation/d/${g.id}/export/pdf`
        : `https://docs.google.com/spreadsheets/d/${g.id}/export?format=pdf`;
      const id = EO_DRIVE.id(url);
      if (!id || EO_DRIVE.isFolder(url)) return url;
      return `https://drive.google.com/uc?export=download&id=${id}`;
    },
    isPdfExport: (url) => !!EO_DRIVE.gdoc(url),
    view(url) {
      const g = EO_DRIVE.gdoc(url);
      if (g) return `https://docs.google.com/${g.kind}/d/${g.id}/view`;
      const id = EO_DRIVE.id(url);
      return id && !EO_DRIVE.isFolder(url) ? `https://drive.google.com/file/d/${id}/view` : url;
    },
    preview(url) {
      const g = EO_DRIVE.gdoc(url);
      if (g) return `https://docs.google.com/${g.kind}/d/${g.id}/preview`;
      const id = EO_DRIVE.id(url);
      return id && !EO_DRIVE.isFolder(url) ? `https://drive.google.com/file/d/${id}/preview` : null;
    },
  };
  window.EO_DRIVE = EO_DRIVE;

  // ---------------- settings ----------------
  let settingsPromise = null;
  function load() {
    if (!settingsPromise) {
      settingsPromise = Promise.all([window.EO_DB.getNode("site_settings"), window.EO_DB.getNode("profile")]).then(([s, p]) => {
        const cfg = Object.assign({}, DEFAULTS, s || {});
        cfg.per_page = Object.assign({}, DEFAULTS.per_page, (s && s.per_page) || {});
        cfg.profile = p || {};
        cfg.email = cfg.email || (p && p.email) || "";
        if (Array.isArray(cfg.nav) === false && cfg.nav && typeof cfg.nav === "object") cfg.nav = Object.values(cfg.nav);
        return cfg;
      });
    }
    return settingsPromise;
  }

  function waNumber(n) {
    let d = String(n || "").replace(/\D/g, "");
    if (d.startsWith("0")) d = "254" + d.slice(1);
    return d;
  }
  function waLink(cfg, msg, number) {
    const w = cfg.whatsapp || {};
    const num = waNumber(number || w.primary || (w.numbers || [])[0]);
    const text = encodeURIComponent(msg || w.message || "");
    return num ? `https://wa.me/${num}${text ? "?text=" + text : ""}` : "#";
  }

  function pathNorm(p) { return U.clean(p).replace(/\/$/, "") || "/"; }

  function renderNav(cfg) {
    const nav = document.querySelector("header.site .site-nav");
    if (!nav || !cfg.nav || !cfg.nav.length) return;
    const here = pathNorm(location.pathname);
    const have = (u) => cfg.nav.some((n) => n && pathNorm(n.url || "") === u);
    if (!have("/videos")) cfg.nav = cfg.nav.concat([{ label: "videos", url: "/videos", order: 3.5, visible: true }]);
    const items = cfg.nav.filter((n) => n && n.label && n.url && n.visible !== false).sort((a, b) => (a.order || 0) - (b.order || 0));
    // Grouped menu: the labels and order still come from the database; pages the menu never listed (CV, media kit...) are added.
    const GROUPS = [
      ["", ["/"]],
      ["Learn", ["/materials", "/content", "/videos"]],
      ["Read", ["/blog", "/writing"]],
      ["About me", ["/about", "/cv", "/contact"]],
      ["Work with me", ["/media-kit", "/advertise"]],
      ["Stay in touch", ["/subscribe", "/search"]],
    ];
    const EXTRA = { "/cv": "cv", "/media-kit": "media kit", "/advertise": "advertise", "/subscribe": "subscribe", "/search": "search" };
    const by = {}; items.forEach((n) => { by[pathNorm(n.url)] = n; });
    const used = new Set(), link = (n) => {
      const target = pathNorm(n.url), cur = here === target || (target !== "/" && here.startsWith(target + "/")) ? ' aria-current="page"' : "";
      return `<a href="${U.esc(n.url)}"${cur}>${U.esc(n.label)}</a>`;
    };
    let html = GROUPS.map(([title, urls]) => {
      const links = urls.map((u) => { const n = by[u] || (EXTRA[u] ? { label: EXTRA[u], url: u } : null); if (!n) return ""; used.add(u); return link(n); }).join("");
      return links ? `<div class="nav-group">${title ? `<span class="nav-h">${title}</span>` : ""}${links}</div>` : "";
    }).join("");
    const rest = items.filter((n) => !used.has(pathNorm(n.url)));
    if (rest.length) html += `<div class="nav-group"><span class="nav-h">More</span>${rest.map(link).join("")}</div>`;
    nav.innerHTML = html;
  }

  function socialsHtml(cfg, opts = {}) {
    const out = [];
    Object.entries(cfg.socials || {}).forEach(([k, v]) => {
      if (v && v.url && v.enabled !== false) out.push(`<a href="${U.esc(v.url)}" target="_blank" rel="noopener me">${U.esc(opts.prefix || "")}${U.esc(v.label || k)}</a>`);
    });
    if ((cfg.whatsapp || {}).primary || ((cfg.whatsapp || {}).numbers || []).length) {
      out.push(`<a href="${U.esc(waLink(cfg))}" target="_blank" rel="noopener">${U.esc(opts.prefix ? "Chat on " : "")}WhatsApp</a>`);
    }
    return out.join("");
  }

  function fillSlots(cfg) {
    document.querySelectorAll("[data-socials]").forEach((el) => {
      el.innerHTML = socialsHtml(cfg, { prefix: el.getAttribute("data-prefix") || "" });
    });
    document.querySelectorAll("[data-whatsapp]").forEach((el) => {
      const n = el.getAttribute("data-whatsapp");
      el.href = waLink(cfg, el.getAttribute("data-msg"), n && n !== "true" ? n : null);
      el.target = "_blank"; el.rel = "noopener";
    });
    document.querySelectorAll("[data-whatsapp-numbers]").forEach((el) => {
      el.innerHTML = ((cfg.whatsapp || {}).numbers || []).map((n) => `<a href="${U.esc(waLink(cfg, "", n))}" target="_blank" rel="noopener">${U.esc(n)}</a>`).join(" · ");
    });
    document.querySelectorAll("[data-email]").forEach((el) => {
      el.href = `mailto:${cfg.email}${el.getAttribute("data-subject") ? "?subject=" + encodeURIComponent(el.getAttribute("data-subject")) : ""}`;
      if (!el.textContent.trim() || el.hasAttribute("data-email-text")) el.textContent = cfg.email;
    });
    document.querySelectorAll("[data-site-name]").forEach((el) => { el.textContent = cfg.site_name; });
    document.querySelectorAll("[data-setting]").forEach((el) => {
      const v = el.getAttribute("data-setting").split(".").reduce((o, k) => (o ? o[k] : undefined), cfg);
      if (v != null) el.textContent = v;
    });
    // Drive-backed download buttons: <a data-drive-setting="downloads.cv_pdf">
    document.querySelectorAll("[data-drive-setting]").forEach((el) => {
      const url = el.getAttribute("data-drive-setting").split(".").reduce((o, k) => (o ? o[k] : undefined), cfg);
      if (url) { el.href = EO_DRIVE.download(url); el.rel = "noopener"; el.removeAttribute("hidden"); } else { el.setAttribute("hidden", ""); }
    });
  }

  function renderFooter(cfg) {
    const wrap = document.querySelector("footer.site .wrap");
    if (!wrap || wrap.querySelector(".footer-extra")) return;
    const box = document.createElement("div");
    box.className = "footer-extra";
    box.innerHTML = `
      <div class="socials">${socialsHtml(cfg)}</div>
      <p class="footer-links"><a href="/subscribe">Subscribe</a> · <a href="/materials">Materials</a> · <a href="/contact">Contact</a> · <a href="/advertise">Advertise</a> · <a href="/privacy">Privacy</a></p>
      <form class="newsletter" novalidate>
        <input type="email" name="email" placeholder="Get new posts &amp; materials by email" aria-label="Email address" required>
        <input type="text" name="website" tabindex="-1" autocomplete="off" class="hp" aria-hidden="true">
        <button class="btn" type="submit">Subscribe</button>
        <span class="mono nl-status"></span>
      </form>`;
    wrap.appendChild(box);
    bindSubscribe(box.querySelector("form"));
  }

  // One subscribe handler for every email form: <form data-subscribe> with fields email, website (honeypot), optional name.
  function bindSubscribe(form) {
    if (!form || form.dataset.bound) return;
    form.dataset.bound = "1";
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const st = form.querySelector(".nl-status");
      const email = form.email.value.trim();
      if (form.website.value || !/^\S+@\S+\.\S+$/.test(email)) { st.textContent = "Enter a valid email."; return; }
      try {
        const rec = { email, ts: Date.now(), page: location.pathname };
        if (form.name && form.name.value.trim()) rec.name = form.name.value.trim().slice(0, 60);
        await window.EO_DB.push("newsletter", rec);
        try { localStorage.setItem("eo-subscribed", "1"); } catch {}
        st.textContent = "Subscribed. Thank you!"; form.email.value = "";
      } catch { st.textContent = "Could not subscribe, try again."; }
    });
  }

  // Page text (hero + body) editable from admin: pages/<data-page key>
  async function applyPage(cfg) {
    const key = document.body.dataset.page;
    if (!key) return;
    const rec = await window.EO_DB.getPath("pages/" + key);
    if (!rec || typeof rec !== "object") return;
    const clean = (h) => {
      const d = document.createElement("div"); d.innerHTML = h;
      d.querySelectorAll("script,iframe,object,embed").forEach((n) => n.remove());
      d.querySelectorAll("*").forEach((n) => [...n.attributes].forEach((a) => { if (/^on/i.test(a.name) || /^javascript:/i.test(a.value)) n.removeAttribute(a.name); }));
      return d.innerHTML;
    };
    ["kicker", "heading", "intro", "body"].forEach((f) => {
      if (rec[f] != null && rec[f] !== "") document.querySelectorAll(`[data-pg="${f}"]`).forEach((el) => { el.innerHTML = f === "kicker" ? clean(window.EO_UTIL.displayName(String(rec[f]).replace(/\s*[·|\-–]\s*SESSION ACTIVE\s*$/i, ""))) : clean(rec[f]); });
    });
    const paged = U.params().get("page") || U.params().get("tag");
    if (!paged && (rec.title || rec.description)) setMeta({ title: rec.title, description: rec.description });
    fillSlots(cfg);
    try { if (window.EO_QR) window.EO_QR.renderAll(); } catch (e) {}
    document.dispatchEvent(new Event("eo:page-applied"));
  }

  function jsonld(obj) {
    const s = document.createElement("script");
    s.type = "application/ld+json";
    s.textContent = JSON.stringify(obj);
    document.head.appendChild(s);
  }

  // ---------------- pager (?page=N links) ----------------
  function pager(container, { page, total, param = "page" }) {
    if (!container) return;
    if (total <= 1) { container.innerHTML = ""; return; }
    const url = (p) => { const q = new URLSearchParams(location.search); if (p === 1) q.delete(param); else q.set(param, p); const s = q.toString(); return location.pathname + (s ? "?" + s : ""); };
    const parts = [];
    parts.push(page > 1 ? `<a class="btn" rel="prev" href="${url(page - 1)}">← Prev</a>` : `<span class="btn disabled">← Prev</span>`);
    U.pageWindow(page, total).forEach((p) => {
      parts.push(p === "…" ? `<span class="pg-gap">…</span>` : p === page ? `<span class="btn primary" aria-current="page">${p}</span>` : `<a class="btn" href="${url(p)}">${p}</a>`);
    });
    parts.push(page < total ? `<a class="btn" rel="next" href="${url(page + 1)}">Next →</a>` : `<span class="btn disabled">Next →</span>`);
    container.className = "pager";
    container.setAttribute("role", "navigation");
    container.setAttribute("aria-label", "Pagination");
    container.innerHTML = parts.join("");
  }

  function currentPage(total, param = "page") {
    const n = parseInt(U.params().get(param) || "1", 10);
    return Math.min(Math.max(isNaN(n) ? 1 : n, 1), Math.max(total, 1));
  }

  // Sets canonical + title/description for paged/dynamic pages.
  function setMeta({ title, description, image, canonical, type }) {
    const set = (sel, attr, val) => {
      if (val == null) return;
      let el = document.head.querySelector(sel);
      if (!el) { el = document.createElement(sel.startsWith("link") ? "link" : "meta"); const m = sel.match(/\[(.+?)="(.+?)"\]/); if (m) el.setAttribute(m[1], m[2]); document.head.appendChild(el); }
      el.setAttribute(attr, val);
    };
    if (title) { document.title = title; set('meta[property="og:title"]', "content", title); set('meta[name="twitter:title"]', "content", title); }
    if (description) { set('meta[name="description"]', "content", description); set('meta[property="og:description"]', "content", description); set('meta[name="twitter:description"]', "content", description); }
    if (image) { set('meta[property="og:image"]', "content", image); set('meta[name="twitter:image"]', "content", image); set('meta[name="twitter:card"]', "content", "summary_large_image"); }
    if (canonical) { set('link[rel="canonical"]', "href", canonical); set('meta[property="og:url"]', "content", canonical); }
    if (type) set('meta[property="og:type"]', "content", type);
  }

  const site = {
    ready: null,
    settings: null,
    waLink: (msg, number) => waLink(site.settings || DEFAULTS, msg, number),
    waNumber,
    origin: () => ((site.settings && site.settings.site_url) || location.origin).replace(/\/$/, ""),
    abs: (path) => (/^https?:/.test(path) ? path : site.origin() + path),
    jsonld, setMeta, pager, currentPage,
    refresh: () => site.settings && fillSlots(site.settings),
  };

  // Hamburger menu: the nav links (and the theme switch) live in a dropdown panel so the header row
  // has room for the sticky header ad.
  function initMenu() {
    const head = document.querySelector("header.site"), wrap = head && head.querySelector(".wrap"), nav = head && head.querySelector("nav.site-nav");
    if (!wrap || !nav || head.querySelector("#menu-toggle")) return;
    const panel = document.createElement("div");
    panel.className = "menu-panel"; panel.id = "menu-panel"; panel.hidden = true;
    nav.before(panel); panel.appendChild(nav);
    const theme = head.querySelector("[data-theme-toggle]");
    if (theme) { const row = document.createElement("div"); row.className = "menu-extra"; row.appendChild(theme); panel.appendChild(row); }
    const btn = document.createElement("button");
    btn.type = "button"; btn.id = "menu-toggle"; btn.setAttribute("aria-label", "Menu"); btn.setAttribute("aria-expanded", "false"); btn.setAttribute("aria-controls", "menu-panel");
    btn.innerHTML = '<span></span><span></span><span></span>';
    wrap.appendChild(btn);
    const set = (open) => { panel.hidden = !open; head.classList.toggle("menu-open", open); btn.setAttribute("aria-expanded", String(open)); };
    btn.addEventListener("click", (e) => { e.stopPropagation(); set(panel.hidden); });
    document.addEventListener("click", (e) => { if (!panel.hidden && !panel.contains(e.target)) set(false); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !panel.hidden) { set(false); btn.focus(); } });
    panel.addEventListener("click", (e) => { if (e.target.closest("a")) set(false); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initMenu); else initMenu();

  site.ready = load().then((cfg) => {
    site.settings = cfg;
    const go = () => {
      renderNav(cfg); fillSlots(cfg); renderFooter(cfg); applyPage(cfg);
      document.querySelectorAll("form[data-subscribe]").forEach(bindSubscribe);
      const handle = (cfg.seo && cfg.seo.handle) || "ezraogombo";
      document.querySelectorAll("a.logo").forEach((el) => { el.textContent = handle; });
      document.dispatchEvent(new CustomEvent("eo:site-ready", { detail: cfg }));
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go); else go();
    return cfg;
  });

  window.EO_SITE = site;

  // Holiday / awareness-day greeting popup (js/greetings.js). To switch it off: delete this block, or set window.EO_GREET_OFF = true.
  if (!window.EO_GREET_OFF && !/^\/admin(\/|$)/i.test(location.pathname)) {
    const g = document.createElement("script"); g.src = "/js/greetings.js"; g.defer = true; document.head.appendChild(g);
  }
})();
