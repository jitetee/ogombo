// Example "pack": drop a file like this in /js/video/packs/, add its name to index.json, and the studio loads it.
// A pack can add layouts, backgrounds, icons (shown in the human-less version), colour themes and text animations.
// Helpers available inside draw functions: ctx (canvas 2D), P (project), th (theme: [name,bg1,bg2,accent,text,panel,accent2]),
// t (seconds), g (geometry: W,H,u = size unit, port, wide, m = margin), and for layouts also sc (scene) and lt (local time).
EO_VID.register({
  themes: { "Savannah": ["#3a1a00", "#b8570b", "#ffd166", "#fff8ec", "#4b2406", "#ffffff"] },
  backgrounds: {
    sunburst: { label: "Sunburst (example pack)", draw(ctx, P, th, t, g, W, H) { ctx.save(); ctx.translate(W / 2, H * 0.35); ctx.rotate(t * 0.05); ctx.fillStyle = "rgba(255,255,255,.07)"; for (let i = 0; i < 16; i += 2) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, Math.max(W, H), (i * Math.PI) / 8, ((i + 1) * Math.PI) / 8); ctx.closePath(); ctx.fill(); } ctx.restore(); } },
  },
  icons: {
    rocket: { label: "Rocket (example pack)", draw(ctx, c, r, lt, th) { ctx.save(); ctx.translate(c.x, c.y + Math.sin(lt * 6) * r * 0.03); ctx.rotate(0.6); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.moveTo(0, -r * 0.95); ctx.quadraticCurveTo(r * 0.5, -r * 0.3, r * 0.3, r * 0.5); ctx.lineTo(-r * 0.3, r * 0.5); ctx.quadraticCurveTo(-r * 0.5, -r * 0.3, 0, -r * 0.95); ctx.fill(); ctx.fillStyle = th[3]; ctx.beginPath(); ctx.arc(0, -r * 0.2, r * 0.17, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = th[6]; ctx.beginPath(); ctx.moveTo(-r * 0.12, r * 0.5); ctx.lineTo(0, r * (0.9 + 0.15 * Math.sin(lt * 20))); ctx.lineTo(r * 0.12, r * 0.5); ctx.fill(); ctx.restore(); } },
  },
});
