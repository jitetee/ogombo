// ============================================================
// Dark/light theme toggle. The actual attribute is set as early
// as possible (see the inline snippet in <head>) so there's no
// flash of the wrong theme — this file just wires up the button.
// ============================================================

(function () {
  function currentTheme() {
    return document.documentElement.getAttribute("data-theme") || "dark";
  }

  function setTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("eo-theme", theme);
    } catch {
      /* localStorage unavailable — theme just won't persist across visits */
    }
    document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
      btn.textContent = theme === "dark" ? "☀ light" : "☾ dark";
      btn.setAttribute("aria-label", theme === "dark" ? "Switch to light theme" : "Switch to dark theme");
    });
  }

  function init() {
    document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
      btn.addEventListener("click", () => {
        setTheme(currentTheme() === "dark" ? "light" : "dark");
      });
    });
    setTheme(currentTheme()); // sync button label with whatever <head> already set
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
