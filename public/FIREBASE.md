# Wiring this up to Firebase Realtime Database

**Status: your real config is already wired into the site** (`js/firebase-config.js`,
loaded before `js/data-loader.js` on every page). The site tries that
database first and silently falls back to the bundled `data/seed-db.json`
if the database isn't seeded yet or its rules aren't open for reading —
so nothing breaks while you finish the steps below.

Right now the website reads `data/seed-db.json` as a plain static file when
the live database isn't reachable. Moving to Firebase RTDB is worth it once
you want to update content — a status line, a new blog post — from the
Firebase console directly, without touching code or redeploying.

## 1. Create the project
1. https://console.firebase.google.com → Add project → free "Spark" plan is enough.
2. Build → Realtime Database → Create Database → start in **locked mode**.

## 2. Import the seed data
Realtime Database →⋮ menu → **Import JSON** → upload `data/seed-db.json`.
This becomes your database's root — `/profile`, `/status`, `/blog_posts`, etc.

## 3. Rules — public read, signed-in write
```json
{
  "rules": {
    ".read": true,
    ".write": "auth != null",
    "contact_inbox": {
      ".read": "auth != null"
    }
  }
}
```
Anyone can read (needed for the floating chatbot, support widget, search,
and every page to render), but writing anywhere requires a signed-in
Firebase user. In practice that means: enable Email/Password sign-in
under Authentication in the Firebase console, create yourself one user,
and that's the only account that can write. See `admin.html` — a simple
login + content editor built against exactly this rule.

## 4. Point the website at it
The live database URL already lives in `js/firebase-config.js`
(`window.EO_FIREBASE_CONFIG.databaseURL`) — `js/db.js` reads from it
automatically. Nothing to change here unless you create a new Firebase
project and need to swap that URL out.

You don't need any of this for the site to work — it already falls back
to `data/seed-db.json` for most nodes if the live database isn't reachable
(two nodes, `blog_posts` and `writing_projects`, are "live only" by
design — see below). Setting up the database just means you can edit
content from the Firebase console directly instead of editing this file
and redeploying.

## How the site reads it (node by node)

`js/db.js` is the integration layer. Every page calls `EO_DB.getNode("profile")`,
`EO_DB.getNode("blog_posts")`, etc. — one REST request per node
(`https://.../<node>.json`), not one giant fetch of the whole tree. If a node
read fails (database not seeded yet, rules not open, offline), that one call
falls back to the matching key in the bundled `data/seed-db.json` — so a
partially-seeded database doesn't break pages that need other nodes.

Nodes currently read by the site: `profile`, `status`, `blog_posts`,
`writing_projects`, `chatbot_faq`, `content_highlights`, `materials`,
`ads`, `payment`. Add a new top-level key to the database and a page can
start reading it the same way, no other code changes needed.
