// ============================================================
// Facebook-style engagement block: reactions, comments (with
// replies and comment-likes), share menu, QR code and PDF download.
// Mount it on any page:
//     EO_ENGAGE.mount(el, { type:"blog", slug, title, image, getContent, kicker, meta })
// Data (all in RTDB):
//     reactions/<type>/<slug>/<like|love|haha|wow|sad>   counters
//     shares/<type>/<slug>                               counter
//     comments/<type>/<slug>/<id>                        {name,text,ts,status,parent?,likes?}
// Anyone can take part by typing a name — no sign-in.
// ============================================================
(function () {
  const U = window.EO_UTIL;
  const E = U.esc;
  const REACTS = [["like", "👍", "Like"], ["love", "❤️", "Love"], ["haha", "😂", "Haha"], ["wow", "😮", "Wow"], ["sad", "😢", "Sad"]];
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };

  function mount(host, opts) {
    const { type, slug } = opts;
    const base = `${type}/${slug}`;
    const url = opts.url || (window.EO_SITE ? window.EO_SITE.abs(U.clean(location.pathname) + (location.search || "")) : location.href);
    let counts = {}, shares = 0, comments = {}, shown = 5, per = 5;
    let mine = ls.get(`eo_react:${base}`, null);
    const clikes = new Set(ls.get("eo_clikes", []));

    host.innerHTML = `
      <section class="engage" aria-label="Reactions, comments and sharing">
        <div class="eng-counts"><span data-c="react"></span><span class="eng-right"><span data-c="comments"></span><span data-c="shares"></span></span></div>
        <div class="eng-actions">
          <div class="eng-like-wrap">
            <button type="button" class="eng-btn" data-act="like"></button>
            <div class="eng-picker" role="menu">${REACTS.map(([k, e, l]) => `<button type="button" data-react="${k}" title="${l}" aria-label="${l}">${e}</button>`).join("")}</div>
          </div>
          <button type="button" class="eng-btn" data-act="comment">${window.EO_ICON ? window.EO_ICON("message-circle", 16) + " " : ""}Comment</button>
          <button type="button" class="eng-btn" data-act="share">↗ Share</button>
          <button type="button" class="eng-btn" data-act="pdf">⬇ PDF</button>
        </div>
        <div class="eng-share" hidden></div>
        <div class="eng-qr">
          <canvas width="48" height="48" style="width:48px;height:48px"></canvas>
          <div><p style="margin:0">QR code · tap to enlarge and open this on another device.</p></div>
        </div>
        <div class="eng-comments">
          <form class="eng-form" novalidate>
            <input name="name" maxlength="60" placeholder="Your name" autocomplete="name" required>
            <textarea name="text" maxlength="1000" rows="2" placeholder="Write a comment…" required></textarea>
            <input name="website" tabindex="-1" autocomplete="off" class="hp" aria-hidden="true">
            <div class="eng-form-row"><span class="mono eng-msg"></span><button class="btn primary" type="submit">Post</button></div>
          </form>
          <div class="eng-list"></div>
          <div class="eng-more"></div>
        </div>
      </section>`;

    const $ = (s) => host.querySelector(s);
    const form = $(".eng-form");
    form.name.value = ls.get("eo_name", "");
    if (window.EO_QR) (window.EO_QR.mini ? window.EO_QR.mini($(".eng-qr canvas"), url, 40) : window.EO_QR.drawQR($(".eng-qr canvas"), url, 110));

    // ---------- reactions ----------
    const total = () => REACTS.reduce((n, [k]) => n + (counts[k] || 0), 0);
    function paintReactions() {
      const top = REACTS.filter(([k]) => counts[k] > 0).sort((a, b) => counts[b[0]] - counts[a[0]]).slice(0, 3).map(([, e]) => e).join("");
      $('[data-c="react"]').textContent = total() ? `${top} ${total()}` : "";
      const m = REACTS.find(([k]) => k === mine);
      const btn = $('[data-act="like"]');
      btn.textContent = m ? `${m[1]} ${m[2]}` : "Like";
      btn.classList.toggle("on", !!m);
    }
    async function react(k) {
      const prev = mine;
      mine = prev === k ? null : k;                      // same reaction again = undo
      if (prev) counts[prev] = Math.max(0, (counts[prev] || 0) - 1);
      if (mine) counts[mine] = (counts[mine] || 0) + 1;
      ls.set(`eo_react:${base}`, mine);
      paintReactions();
      try {
        if (prev) await window.EO_DB.increment(`reactions/${base}/${prev}`, -1);
        if (mine) await window.EO_DB.increment(`reactions/${base}/${mine}`, 1);
      } catch {}
    }
    $('[data-act="like"]').addEventListener("click", () => react(mine || "like"));
    host.querySelectorAll("[data-react]").forEach((b) => b.addEventListener("click", () => { react(b.dataset.react === mine ? mine : b.dataset.react); }));
    // long-press opens picker on touch screens
    let pressT;
    const lw = $(".eng-like-wrap");
    lw.addEventListener("touchstart", () => { pressT = setTimeout(() => lw.classList.add("open"), 450); }, { passive: true });
    lw.addEventListener("touchend", () => { clearTimeout(pressT); setTimeout(() => lw.classList.remove("open"), 2500); });

    // ---------- share ----------
    const shareBox = $(".eng-share");
    function shareLinks() {
      const u = encodeURIComponent(url), t = encodeURIComponent(opts.title || document.title);
      return [
        ["WhatsApp", `https://wa.me/?text=${t}%20${u}`], ["Facebook", `https://www.facebook.com/sharer/sharer.php?u=${u}`],
        ["LinkedIn", `https://www.linkedin.com/sharing/share-offsite/?url=${u}`], ["X", `https://twitter.com/intent/tweet?text=${t}&url=${u}`],
        ["Telegram", `https://t.me/share/url?url=${u}&text=${t}`], ["Email", `mailto:?subject=${t}&body=${u}`],
      ];
    }
    async function countShare() {
      shares++; paintCounts();
      try { await window.EO_DB.increment(`shares/${base}`, 1); } catch {}
    }
    $('[data-act="share"]').addEventListener("click", async () => {
      if (navigator.share) {
        try { await navigator.share({ title: opts.title || document.title, url }); countShare(); return; } catch { /* cancelled -> show menu */ }
      }
      shareBox.hidden = !shareBox.hidden;
      if (!shareBox.hidden && !shareBox.innerHTML) {
        shareBox.innerHTML = shareLinks().map(([n, h]) => `<a href="${E(h)}" target="_blank" rel="noopener" class="btn">${n}</a>`).join("") + `<button type="button" class="btn" data-copy>Copy link</button>`;
        shareBox.querySelectorAll("a").forEach((a) => a.addEventListener("click", countShare));
        shareBox.querySelector("[data-copy]").addEventListener("click", async (e) => {
          try { await navigator.clipboard.writeText(url); e.target.textContent = "Copied"; } catch { window.prompt("Copy this link:", url); }
          countShare();
        });
      }
    });

    // ---------- pdf ----------
    $('[data-act="pdf"]').addEventListener("click", (e) => {
      window.EO_PDF.download({
        button: e.currentTarget, title: opts.title, kicker: opts.kicker, meta: opts.meta, image: opts.image,
        contentEl: opts.getContent ? opts.getContent() : null, url, filename: slug,
        onDone: () => window.EO_DB.increment(`pdf_downloads/${base}`, 1).catch(() => {}),
      });
    });
    $('[data-act="comment"]').addEventListener("click", () => { form.text.focus(); form.scrollIntoView({ behavior: "smooth", block: "center" }); });

    // ---------- comments ----------
    function paintCounts() {
      const n = Object.values(comments).filter((c) => c.status !== "pending" && c.status !== "hidden").length;
      $('[data-c="comments"]').textContent = n ? `${n} comment${n > 1 ? "s" : ""}` : "";
      $('[data-c="shares"]').textContent = shares ? `${shares} share${shares > 1 ? "s" : ""}` : "";
    }
    const visible = (c) => c && c.status !== "pending" && c.status !== "hidden";
    function commentHtml(id, c, isReply) {
      const liked = clikes.has(`${base}/${id}`);
      return `<div class="eng-c ${isReply ? "reply" : ""}" data-id="${E(id)}">
        <div class="eng-av">${E((c.name || "?").trim().charAt(0).toUpperCase())}</div>
        <div class="eng-cbody">
          <div class="eng-bubble"><strong>${E(c.name)}</strong><p>${E(c.text).replace(/\n/g, "<br>")}</p></div>
          <div class="eng-cmeta"><button type="button" data-clike="${E(id)}" class="${liked ? "on" : ""}">Like${c.likes ? " · " + c.likes : ""}</button>
            ${isReply ? "" : `<button type="button" data-reply="${E(id)}">Reply</button>`}<span>${U.timeAgo(c.ts || Date.now())}</span></div>
          ${isReply ? "" : `<div class="eng-replies" data-for="${E(id)}"></div>`}
        </div></div>`;
    }
    function paintComments() {
      const list = $(".eng-list");
      const all = Object.entries(comments).filter(([, c]) => visible(c));
      const tops = all.filter(([, c]) => !c.parent).sort((a, b) => b[1].ts - a[1].ts);
      list.innerHTML = tops.slice(0, shown).map(([id, c]) => commentHtml(id, c, false)).join("") || `<p class="eng-empty">No comments yet — be the first.</p>`;
      all.filter(([, c]) => c.parent).sort((a, b) => a[1].ts - b[1].ts).forEach(([id, c]) => {
        const box = list.querySelector(`.eng-replies[data-for="${CSS.escape(c.parent)}"]`);
        if (box) box.insertAdjacentHTML("beforeend", commentHtml(id, c, true));
      });
      const more = $(".eng-more");
      more.innerHTML = tops.length > shown ? `<button type="button" class="btn">View ${Math.min(per, tops.length - shown)} more comment${tops.length - shown > 1 ? "s" : ""} →</button>` : "";
      const b = more.querySelector("button");
      if (b) b.addEventListener("click", () => { shown += per; paintComments(); });
      paintCounts();
    }
    $(".eng-list").addEventListener("click", async (e) => {
      const lk = e.target.closest("[data-clike]");
      if (lk) {
        const id = lk.dataset.clike, key = `${base}/${id}`, c = comments[id];
        if (!c) return;
        const on = clikes.has(key);
        on ? clikes.delete(key) : clikes.add(key);
        c.likes = Math.max(0, (c.likes || 0) + (on ? -1 : 1));
        ls.set("eo_clikes", [...clikes]);
        paintComments();
        try { await window.EO_DB.increment(`comments/${base}/${id}/likes`, on ? -1 : 1); } catch {}
        return;
      }
      const rp = e.target.closest("[data-reply]");
      if (rp) {
        const box = $(`.eng-replies[data-for="${CSS.escape(rp.dataset.reply)}"]`);
        if (box.querySelector("form")) return;
        const f = document.createElement("form");
        f.className = "eng-form small";
        f.innerHTML = `<input name="name" maxlength="60" placeholder="Your name" value="${E(ls.get("eo_name", ""))}"><textarea name="text" maxlength="1000" rows="1" placeholder="Write a reply…"></textarea><input name="website" tabindex="-1" class="hp" autocomplete="off"><button class="btn" type="submit">Reply</button>`;
        f.addEventListener("submit", (ev) => { ev.preventDefault(); submit(f, rp.dataset.reply); });
        box.appendChild(f);
        f.text.focus();
      }
    });

    async function submit(f, parent) {
      const msg = f.querySelector(".eng-msg");
      const name = f.name.value.trim(), text = f.text.value.trim();
      const say = (t) => { if (msg) msg.textContent = t; };
      if (f.website.value) return;                                  // honeypot
      if (!name || !text) return say("Please add your name and a comment.");
      const last = ls.get("eo_last_comment", 0);
      if (Date.now() - last < 15000) return say("Slow down a little — try again in a few seconds.");
      const moderated = !!(window.EO_SITE.settings && window.EO_SITE.settings.moderation);
      const data = { name, text, ts: Date.now(), status: moderated ? "pending" : "visible" };
      if (parent) data.parent = parent;
      try {
        const res = await window.EO_DB.push(`comments/${base}`, data);
        ls.set("eo_name", name); ls.set("eo_last_comment", Date.now());
        f.text.value = ""; say(moderated ? "Thanks! Your comment will appear once approved." : "");
        comments[res.name] = data;
        if (parent) f.remove();
        paintComments();
      } catch { say("Could not post right now. Please try again."); }
    }
    form.addEventListener("submit", (e) => { e.preventDefault(); submit(form, null); });

    // ---------- initial load ----------
    window.EO_SITE.ready.then((cfg) => { per = (cfg.per_page && cfg.per_page.comments) || 5; shown = per; paintComments(); });
    Promise.all([
      window.EO_DB.getPath(`reactions/${base}`), window.EO_DB.getPath(`shares/${base}`), window.EO_DB.getPath(`comments/${base}`),
    ]).then(([r, s, c]) => {
      counts = r || {}; shares = typeof s === "number" ? s : 0; comments = c || {};
      paintReactions(); paintComments();
    });
    paintReactions();
  }

  window.EO_ENGAGE = { mount };
})();
