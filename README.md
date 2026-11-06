# Ezra Ogombo: site, study materials and admin

Source of **https://ezra-ogombo.web.app**, the personal site of Ezra Ogombo, a Kenyan writer, developer and
perioperative theatre technologist. It carries a blog, books and writing, study materials and order pages,
teal study cards for theatre technology, videos, a CV and media kit, and a private admin area.

It is a static site on **Firebase Hosting** with a **Firebase Realtime Database** for content and orders.
There is no build step: what is in `public/` is what gets served.

## What is where

| Path | What it is |
|---|---|
| `public/*.html` | Site pages: home, blog, writing, materials, content cards, videos, CV, media kit, contact, order, search |
| `public/js/` | Site scripts. `site.js` (menu, shell), `db.js`, `js/pages/` (list, detail, materials, order, receipt, videos), `card-renderer.js` and `qr.js` (content card images and QR codes), `chatbot.js` |
| `public/css/` | Styles (`retro.css`, `extras.css`, `wb.css`) |
| `public/admin/` | Admin: dashboard, content cards, content studio, materials and orders, videos, inbox, support wall, email tool, ads, short links, settings and data, import and merge |
| `public/assets/` | Images. `assets/content/` holds the content card images (`<slug>.jpg`) |
| `public/seed/seed-full.json` | The full database as a seed, for first-time import |
| `public/data/seed-db.json` | The same data as the site's static fallback when the database is unreachable |
| `public/data/patches/` | Dated content patches listed in Admin, Site, Import and merge (`index.json` lists them) |
| `public/database.rules.json` | Realtime Database rules (admin-only nodes stay private) |
| `public/firebase.json` | Hosting and database settings. Deploy from inside `public/` |
| `.github/workflows/` | Deploys to Firebase Hosting on every push to `main` |
| `push.sh`, `join-large-files.sh` | Helper scripts for pushing a large folder in batches (see below) |
| `tests/screenshots/` | Screenshots from checks run on the site |

Longer guides: [`public/SETUP.md`](public/SETUP.md) (first-time setup, 10 minutes) and
[`public/FIREBASE.md`](public/FIREBASE.md) (how the database is wired in).

## Deploying

Every push to `main` runs the **Deploy to Firebase Hosting** workflow. To deploy by hand:

```sh
cd public
firebase deploy --only hosting  --project ezra-ogombo
firebase deploy --only database --project ezra-ogombo   # when database.rules.json changed
```

## Adding content

1. **Content cards** (the teal study cards). Put the images in `public/assets/content/<slug>.jpg`.
   Then import the matching patch in **Admin, Site, Import and merge**. Patches use "merge" mode, so existing cards are
   left alone. Each card's QR code points to `https://ezra-ogombo.web.app/content`.
2. **Other updates** (chatbot answers, materials, books). Same route: add a patch to `public/data/patches/`,
   list it in `index.json`, deploy, then merge it in Admin.
3. **First-time database**: import `public/seed/seed-full.json` in the Firebase console. See `SETUP.md`.

The content card images are made with the site's own renderer (`public/js/card-renderer.js`,
Teal palette). The generator is in **Admin, Publish, Content studio**.

## Admin

Sign in at `/admin/`. The menu has groups that open as dropdowns: **Publish** (content cards, content studio,
materials and orders, videos page), **Create** (whiteboard videos, video studio), **People** (inbox, support wall,
email tool), **Grow** (ads and sponsors, short links and QR), **Site** (settings and data, import and merge).
Access is checked against the admin account and a key (see `SETUP.md`). Passwords live in Firebase Authentication only.

## Pushing large folders

`push.sh` force-pushes a folder to `main` in batches (default 200 files or 40 MB). Files over 50 MB are split into
`.partNN` pieces with an `.md5` file; `join-large-files.sh` rebuilds and checks them. Run `bash push.sh "message"`.
Read the header of `push.sh` before use, because it force-pushes.

## Credits and sources

- Study cards on instruments use photos from the ACS Division of Education *Common Surgical Instruments* module, the
  Surgical Holdings General Instruments Catalogue (2023) and *Eye Surgery in Hot Climates* (ICEH). Each card carries
  its own credit line. Check the licence before reusing these images elsewhere.
- Workplace study cards are short study notes written from the TVET CDACC *Learning Guide for Basic Competencies Level 6* (2019).
- `public/js/vendor/espeak/` is GPL-3.0 licensed. See `LICENSE-GPL3.txt` there.

## Licence

Copyright (c) Ezra Ogombo. All rights reserved, see [`LICENSE`](LICENSE). Third-party material keeps its own licences.

Study aids on this site are for learning only. Follow your hospital's protocol and your supervisor's instructions.
