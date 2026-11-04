// ============================================================
// First-party, cookie-free analytics. One tiny multi-path write to
// /analytics per page view (page totals, daily views, daily unique
// visitors, device, referrer). Read by the admin dashboard only.
// Respects Do-Not-Track. Never runs on /admin pages.
// ============================================================
(function () {
  if (navigator.doNotTrack === "1" || /^\/admin/.test(location.pathname)) return;
  const safe = (s) => String(s).replace(/[.#$\/\[\]\s]/g, "_").slice(0, 110) || "home";

  function send() {
    try {
      const q = new URLSearchParams(location.search);
      let path = window.EO_UTIL.clean(location.pathname);
      if (q.get("slug")) path += ":" + q.get("slug");
      if (q.get("page")) path += ":p" + q.get("page");
      const key = safe(path === "/" ? "home" : path);
      const day = new Date().toISOString().slice(0, 10);
      const inc = { ".sv": { increment: 1 } };

      let vid = localStorage.getItem("eo_vid");
      if (!vid) { vid = Math.random().toString(36).slice(2); localStorage.setItem("eo_vid", vid); }
      const hadBefore = !!localStorage.getItem("eo_seen_day");
      const newVisitorToday = localStorage.getItem("eo_seen_day") !== day;
      if (newVisitorToday) localStorage.setItem("eo_seen_day", day);

      const device = /Mobi|Android|iPhone/i.test(navigator.userAgent) ? "mobile" : /iPad|Tablet/i.test(navigator.userAgent) ? "tablet" : "desktop";
      let ref = "direct";
      try { if (document.referrer) { const h = new URL(document.referrer).hostname.replace(/^www\./, ""); if (h && h !== location.hostname) ref = h; } } catch {}

      const upd = {};
      upd[`totals/${key}/views`] = inc;
      upd[`totals/${key}/title`] = (document.title || key).slice(0, 150);
      upd[`totals/${key}/path`] = location.pathname.slice(0, 150);
      upd[`daily/${day}/views`] = inc;
      if (newVisitorToday) upd[`daily/${day}/visitors`] = inc;
      upd[`devices/${device}`] = inc;
      upd[`referrers/${safe(ref)}`] = inc;
      window.EO_DB.patch("analytics", upd).catch(() => {});
      // extra signals go in a separate write so a missing rule can never stop the basic counters above
      const ext = {};
      const eatHour = new Date(Date.now() + 3 * 3600e3).getUTCHours();
      ext[`hours/${eatHour}`] = inc;
      if (device === "mobile") ext[`daily/${day}/mobile`] = inc;
      if (newVisitorToday) { ext[`daily/${day}/${hadBefore ? "returning" : "fresh"}`] = inc; }
      window.EO_DB.patch("analytics", ext).catch(() => {});
    } catch {}
  }

  // ---- events: clicks on the things that make money or grow the audience, and search terms ----
  const inc1 = { ".sv": { increment: 1 } };
  const evKey = (s) => String(s).toLowerCase().replace(/[^a-z0-9_ -]/g, "").trim().replace(/\s+/g, "_").slice(0, 40);
  function track(name) { const k = evKey(name); if (k) window.EO_DB.patch("analytics", { [`events/${k}`]: inc1 }).catch(() => {}); }
  function trackSearch(term, n) {
    const k = evKey(term); if (!k || k.length < 2) return;
    window.EO_DB.patch("analytics", { [`${n > 0 ? "searches" : "searches_miss"}/${k}`]: inc1 }).catch(() => {});
  }
  document.addEventListener("click", (e) => {
    const a = e.target.closest && e.target.closest("a,button"); if (!a) return;
    const h = a.getAttribute("href") || "", t = a.getAttribute("data-track");
    if (t) return track(t);
    if (/wa\.me|whatsapp/i.test(h)) track("whatsapp_click");
    else if (/\/materials\/order/.test(h)) track("order_click");
    else if (/buymesoda/.test(h)) track("support_click");
    else if (/tiktok\.com/.test(h)) track("social_tiktok");
    else if (/instagram\.com/.test(h)) track("social_instagram");
    else if (/youtube\.com|youtu\.be/.test(h)) track("social_youtube");
    else if (/drive\.google\.com/.test(h)) track("download_click");
    else if (/^mailto:/.test(h)) track("email_click");
  }, true);
  window.EO_TRACK = { event: track, search: trackSearch };

  // wait for page scripts to set the final <title>
  window.addEventListener("load", () => setTimeout(send, 1800));
})();
