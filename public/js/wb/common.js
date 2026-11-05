// Shared bits for the whiteboard pages: sub-navigation, query parsing, debounce, thumbnails.
(function () {
  const q = new URLSearchParams(location.search), id = q.get("id") || "";
  const dbn = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms || 500); }; };
  function subnav(active) {
    const items = [["hub", "Projects", "/admin/whiteboard"], ["edit", "Editor", "/admin/whiteboard-edit?id=" + encodeURIComponent(id)], ["export", "Voice, audio & export", "/admin/whiteboard-export?id=" + encodeURIComponent(id)], ["thumb", "Thumbnail maker", "/admin/whiteboard-thumb"], ["guide", "Import guide", "/assets/whiteboard/import-guide.md"]];
    const el = document.createElement("div"); el.className = "wb-subnav"; el.style.cssText = "display:flex;gap:.4rem;flex-wrap:wrap;margin:.3rem 0 .8rem";
    items.forEach(([k, l, href]) => { if ((k === "edit" || k === "export") && !id) return; const a = document.createElement("a"); a.className = "btn sm" + (k === active ? " primary" : ""); a.textContent = l; a.href = href; if (k === "guide") a.target = "_blank"; el.appendChild(a); });
    return el;
  }
  const thumb = (cv, w) => { const c = document.createElement("canvas"); c.width = w || 320; c.height = Math.round((w || 320) * cv.height / cv.width); c.getContext("2d").drawImage(cv, 0, 0, c.width, c.height); return c.toDataURL("image/jpeg", 0.6); };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ---- progress bars with a rough time-left, and visible errors (no silent blank screens)
  const fmtT = (sec) => sec < 60 ? Math.max(1, Math.round(sec)) + " s" : Math.floor(sec / 60) + " min " + String(Math.round(sec % 60)).padStart(2, "0") + " s";
  function progress(host, label) {
    const box = document.createElement("div"); box.className = "wb-pbox";
    box.innerHTML = '<div class="wb-ptxt"><b></b><span></span></div><div class="wb-prog"><i></i></div><div class="wb-perr"></div>';
    host.prepend ? host.prepend(box) : host.appendChild(box); const t0 = Date.now(), $b = box.querySelector("b"), $s = box.querySelector("span"), bar = box.querySelector("i"), er = box.querySelector(".wb-perr");
    $b.textContent = label || "Working..."; let last = 0, ind = true, tick = setInterval(() => { if (ind) $s.textContent = " " + fmtT((Date.now() - t0) / 1000) + " elapsed"; }, 500); bar.classList.add("ind");
    const o = {
      set(f, text) { ind = false; bar.classList.remove("ind"); f = Math.max(0, Math.min(1, f || 0)); last = f; bar.style.width = (f * 100).toFixed(1) + "%"; const el = (Date.now() - t0) / 1000; $s.textContent = " " + Math.round(f * 100) + "%" + (f > 0.03 && el > 2 && f < 1 ? " - about " + fmtT(el * (1 - f) / f) + " left" : "") + (text ? " - " + text : ""); return o; },
      wait(text) { ind = true; bar.classList.add("ind"); if (text) $b.textContent = text; return o; },
      label(text) { $b.textContent = text; return o; },
      done(text) { clearInterval(tick); ind = false; bar.classList.remove("ind"); bar.style.width = "100%"; $s.textContent = " " + (text || "Done") + " (" + fmtT((Date.now() - t0) / 1000) + ")"; return o; },
      fail(e) { clearInterval(tick); ind = false; bar.classList.remove("ind"); bar.classList.add("bad"); er.textContent = "Error: " + (e && e.message ? e.message : e); box.classList.add("bad"); console.error(e); return o; },
      remove() { clearInterval(tick); box.remove(); },
    }; return o;
  }
  function banner(msg) {
    let b = document.getElementById("wb-err"); if (!b) { b = document.createElement("div"); b.id = "wb-err"; b.innerHTML = '<span></span><button type="button">Dismiss</button>'; b.querySelector("button").onclick = () => (b.style.display = "none"); document.body.appendChild(b); }
    b.querySelector("span").textContent = String(msg).slice(0, 400); b.style.display = "flex";
  }
  addEventListener("error", (e) => { if (e && e.message && !/ResizeObserver/.test(e.message)) banner("Something went wrong: " + e.message); });
  addEventListener("unhandledrejection", (e) => { const m = e.reason && e.reason.message ? e.reason.message : String(e.reason); banner("Something went wrong: " + m); });
  window.EO_WBC = { id, q, dbn, subnav, thumb, esc, progress, banner, fmtT };
})();
