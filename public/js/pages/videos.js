// Videos page: pasted YouTube links from the `videos` node (long form + shorts), plus the channel's own upload lists when a channel ID is saved.
(async () => {
  const U = window.EO_UTIL, E = U.esc, $ = (s) => document.querySelector(s);
  const [cfg, raw] = await Promise.all([window.EO_SITE.ready, window.EO_DB.getNode("videos").catch(() => null)]);
  const yt = ((cfg && cfg.socials) || {}).youtube || {};
  const list = (Array.isArray(raw) ? raw : Object.values(raw || {})).filter((v) => v && v.id).sort((a, b) => (b.added || 0) - (a.added || 0));
  const sub = $("#yt-sub");
  const chUrl = yt.channel_id ? `https://www.youtube.com/channel/${yt.channel_id}` : yt.url;
  if (chUrl) { sub.href = chUrl + (chUrl.includes("?") ? "&" : "?") + "sub_confirmation=1"; sub.hidden = false; }
  let kind = "all";
  const grid = $("#vids");
  function paint() {
    const rows = list.filter((v) => kind === "all" || (kind === "short") === (v.kind === "short"));
    if (!rows.length) { grid.innerHTML = `<p>${list.length ? "Nothing in this tab yet." : "Videos will appear here soon."}</p>`; return; }
    grid.innerHTML = rows.map((v) => `<article class="vid ${v.kind === "short" ? "short" : ""}"><button type="button" class="vid-play" data-id="${E(v.id)}" aria-label="Play ${E(v.title || "video")}"><img src="https://i.ytimg.com/vi/${E(v.id)}/hqdefault.jpg" alt="" loading="lazy"><span class="vid-btn" aria-hidden="true">${window.EO_ICON ? window.EO_ICON("play", 28) : "Play"}</span></button><h3>${E(v.title || "Video")}</h3><p class="vid-meta">${v.kind === "short" ? "Short" : "Video"}</p></article>`).join("");
  }
  grid.addEventListener("click", (e) => {
    const b = e.target.closest(".vid-play"); if (!b) return;
    const f = document.createElement("iframe"); f.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(b.dataset.id)}?autoplay=1&rel=0`; f.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen"; f.allowFullscreen = true; f.title = "YouTube video"; f.loading = "lazy";
    b.replaceWith(f);
  });
  function chan() {
    const box = $("#chan"), id = yt.channel_id; if (!/^UC[\w-]{20,}$/.test(id || "")) { box.hidden = true; return; }
    const pl = (kind === "short" ? "UUSH" : "UULF") + id.slice(2);
    if (kind === "all") { box.hidden = false; $("#chan-box").innerHTML = `<div class="vid-chan"><iframe src="https://www.youtube-nocookie.com/embed/videoseries?list=${"UULF" + id.slice(2)}" title="Channel videos" loading="lazy" allowfullscreen></iframe></div><div class="vid-chan short"><iframe src="https://www.youtube-nocookie.com/embed/videoseries?list=${"UUSH" + id.slice(2)}" title="Channel shorts" loading="lazy" allowfullscreen></iframe></div>`; return; }
    box.hidden = false; $("#chan-box").innerHTML = `<div class="vid-chan ${kind === "short" ? "short" : ""}"><iframe src="https://www.youtube-nocookie.com/embed/videoseries?list=${pl}" title="Channel uploads" loading="lazy" allowfullscreen></iframe></div>`;
  }
  document.querySelectorAll(".vid-tabs button").forEach((b) => b.addEventListener("click", () => { kind = b.dataset.k; document.querySelectorAll(".vid-tabs button").forEach((x) => x.classList.toggle("on", x === b)); paint(); chan(); }));
  paint(); chan();
})();
