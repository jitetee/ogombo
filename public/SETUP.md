# Ezra Ogombo site — setup (10 minutes)

## 1. Create your admin login
1. Firebase console → Authentication → Sign-in method → enable **Email/Password**.
2. Authentication → Users → **Add user** (your email + a strong password). Copy the **User UID**.
3. Your admin UID (`xm9zzjdPQIXq2WvDWgkw5gDR7yj2`) is already in `seed/seed-full.json`. Make sure the Firebase user you create has exactly this UID.
   (Passwords are never stored in the database — they live in Firebase Authentication.)

## 2. Database
1. Realtime Database → **Import JSON** → choose `seed/seed-full.json` (at the root).
2. Deploy rules + site:  `firebase deploy --only database,hosting`
   (`database.rules.json` makes admin-only nodes private: orders, messages, subscribers, analytics, private Drive links.)

## 3. Google Drive files
Your master folder is created: https://drive.google.com/drive/folders/15bhlHdYZgNVy-6NQFOpRJEU2xsaQjVPy
Drag the files from `_upload-to-drive/` into the matching sub-folders. For each file: Share → "Anyone with the link" → copy link →
Admin → Materials → edit the item → paste into **FREE file — Drive share link**. Paid files: keep in the PRIVATE folder and paste the link in the **private link** field.
CV / business-card PDFs: Admin → Data & settings → Site settings → Drive links.

## 4. Day to day
- /admin → Dashboard (analytics), Content (blog editor), Materials (+ orders), Inbox, Data & settings.
- After adding posts/materials: Admin → Data & settings → SEO · backup · tools → Generate sitemap → replace `sitemap.xml` → redeploy.
- New pages created in admin work immediately (served by catch-all templates); no redeploy needed.

## Notes
- Images stay in `assets/` (add new ones to the folder and redeploy, or use a Drive image link in the editor).
- Blog thumbnails currently use picsum.photos placeholders — swap for your own images.
- `nosocomial-infection-prevention` study unit uses the same file as "Sterile technique basics" — check this is intended.

## What's new in this version
- **One page per type**: `read.html` serves every blog post, content item and book (`/blog/<slug>`, `/content/<slug>`, `/writing/books/<slug>`); one page serves every materials section (`/materials/<key>`). New items need no new files.
- **Every page's text is editable**: Admin → Content → *Page text* (home, about, cv, contact, privacy, writing, materials, content, blog, search). Saved text appears on the site immediately.
- **Free smart-search chatbot** (no AI model): searches posts, content, books, materials and FAQs; typo + Swahili tolerant; cards with Open/Download/Order; remembers the visit; saves unanswered questions. Manage it in Admin → Inbox → *Chatbot*.
- **Hidden admin shortcut**: type `/admin` in the chatbot. If you're already signed in it jumps to the admin home; otherwise it shows a sign-in box (same Firebase email + password) and redirects on success. It is never listed or suggested.
- Only things that live in `assets/` (new image files) or `sitemap.xml` need a redeploy. Everything else is live from the database.

## Seed content (this version)
- 30 blog posts (18 new educational ones of about 480–545 words, 12 personal posts expanded lightly). Covers are generated images in `assets/blog/` — swap any for your own photo by editing the post's featured image.
- Four paid **TEST** materials (one per section) to try the order flow. Delete them from Admin → Materials when done.
- Educational posts are general student-level explanations: please review them (or have a lecturer review them) before relying on them, and correct any details that differ from your institution's protocols.

## Order receipts (new)
- After a paid-material order the buyer gets a receipt (preview + PDF/PNG download, send to WhatsApp, SMS, Share, copy text). It carries your WhatsApp number(s) from Site settings and a QR that opens WhatsApp with the receipt number filled in. "Need help" buttons cover late delivery, link problems, wrong file, payment problem.
- Receipts are kept in the buyer's own browser (/receipt re-opens them). Admin → Materials → Orders → **Receipt…** lets you send a receipt to a buyer.
- The receipt says "payment being verified" until you check the M-Pesa message; it is an order receipt, not proof of verified payment.
- Content pages now have 200+ word explanations; every blog post is 400+ words.

- 50 blog posts in the seed now (20 added); each is 400+ words with its own cover and in-post image.


## Ads & sponsors

1. Deploy rules: `firebase deploy --only database` (new nodes: ad_settings, ad_packages, sponsors, sponsor_requests, ad_images, ad_images_pending, ad_stats, ad_pages). Test them in the Firebase Rules Playground first — they were hand-reviewed, not emulator-tested.
2. Enable Email/Password sign-in in Firebase Auth (sponsors sign up themselves at `/sponsor/`).
3. Admin → Ads → "Load starter ads & settings". Then Packages: set real prices and switch them to active so sponsors can book.
4. Upload the Reliance Africa School of Health Sciences image through Admin → Ads → All ads → edit (it could not be fetched automatically).
5. Sponsor flow: sponsor submits request → pays by M-Pesa (details from your `payment` settings) and enters the code → you verify in Admin → Ads → Requests & payments → "Verify payment & go live".
6. Ad types: Admin → Ads → Ad types. Toggle off = hidden from visitors immediately; on = shown.
7. View/click counts are measured in the visitor's browser (viewable = 50% visible for 1 s); treat them as estimates, not billing-grade numbers.
8. After editing posts/content run `python3 tools/build-share-pages.py` and redeploy so Facebook/Google get static pages.


### Packages, pictures and expiry (updated)

- Three packages are seeded (Starter / Growth / Premium): 5 / 10 / 15 ads, 5 / 10 / 13 website spots, 7 / 14 / 30 days, and social posts on Facebook / +Instagram / +TikTok and YouTube. Set the prices in Admin > Ads > Packages and switch each one to active.
- No pictures are stored in Firebase. Sponsors send pictures to your WhatsApp. Save them in `assets/ads/` (e.g. `<request-id>-1.jpg`), redeploy, then open the request (Admin > Ads > Requests) and paste the paths in the "Pictures" fields, then press Verify payment & go live (or "Save pictures & posts" later). Placeholder pictures for the starter ads are in `assets/ads/` - replace them with your own using the same file names.
- Social posts: after posting on each platform, paste the post link in the request; the sponsor sees it on their page.
- Ads go live within 24 hours of payment verification (stated on the sponsor pages).
- Auto-disable: ads stop showing on the site the day after their end date, with no action from you. Opening Admin > Ads also marks finished campaigns "expired" and switches their ads off.

### New in this version (admin & ads)

- **Ads look:** ads are shown at 50% strength (full strength on hover/tap) and rotate every 10 seconds. If your live database still has 5 stored, set it to 10 in Admin > Ads > Ad types > "Seconds between ads".
- **QR codes** are small (about 40px); tap one to enlarge it for scanning.
- **PDF download** no longer uses an external library: it renders your page in the browser (library vendored in `js/vendor/html2canvas.min.js`), never includes ads, buttons or comments, and only breaks pages between lines, images and table rows.
- **Advertise page** `/advertise`: public packages, spot previews, audience numbers. Press Admin > Ads > Tools > "Refresh audience numbers" to fill in the 30-day figures.
- **Admin > Ads:** Overview now shows "ending soon" (one-tap WhatsApp renewal message) and "to do" (pictures and social posts still owed); **Calendar** shows booked dates per spot; set a **slot limit** per spot in Ad types (sponsors are warned when a spot is full and Verify warns you); **Coupons** tab; **Tools** tab (ad health check for missing pictures/links, smarter rotation by click rate, WhatsApp message templates, database backup download); **Log** tab (every admin change).
- **Targeting:** in the ad form, "Only beside posts tagged…" shows the ad only on posts with those tags (not for header, footer or text links).
- **Blocked words:** list them in Ad types; sponsors can't submit ads containing them.
- **Tracking tags:** external ad links get utm_source / utm_medium / utm_campaign (switch off in Ad types).
- **Reports:** sponsors and you can print a results report; sponsors can print a receipt once payment is verified.
- Deploy the updated rules again: `firebase deploy --only database` (new nodes: ad_coupons, ad_availability, ad_audience).
- Placeholder ad pictures in `assets/ads/` have no text on them; replace each with your own using the same file name.

## Analytics & customisation (latest)

**Redeploy the database rules** (`firebase deploy --only database`) — new nodes: `ad_templates`, `sponsor_notes`, `ad_share`, `ad_pause`, hourly stat keys, sponsor profile defaults, add-on pricing. The rules have not been run against the Firebase emulator, so test one sponsor order, one pause and one share link after deploying.

Admin → Ads:
- **Analytics tab:** monthly goal and forecast, sponsor leaderboard, spot report card, best-times heatmap (Kenya time; fills from this version on), posts ranked by ad clicks, A/B results, sales funnel, share links, month-end payments (CSV / print).
- **Ad form:** custom hex colour, pin to front, days of the week, hour window (Kenya time), A/B group, save/load templates.
- **Ad types tab:** ad fade %, corner roundness, default label, monthly goal, renewal coupon + reminder days, longest sponsor pause.
- **Packages:** up to 4 add-ons (label, price, "pin first" or manual).
- **Sponsors:** private tags and note per sponsor.
- **Tools → Refresh audience numbers** also saves the site-average click rate that sponsors are compared with.

Sponsor portal: add-ons at checkout, saved business details (Account tab), renewal banner with coupon link, one pause per campaign (days are added back the next time you open Admin → Ads), ad ranking inside the package, comparison with the site average, and a no-login report link (`/report?t=…`) you create in Analytics.

## Notification bell & ad experience (latest)

**Admin bell (🔔, top right on every admin page):** red dot with a count, a dropdown, a toast and an optional browser pop-up. It checks every 20 seconds while an admin tab is open: new ad requests, payments to verify, ad edits, sponsor sign-ups, campaigns ending within 2 days, comments, reactions/likes, contact messages, newsletter sign-ups, material orders and chatbot questions it couldn't answer. "Read" state is remembered per browser. Redeploy the rules again (`firebase deploy --only database`) for the new stat keys and the lead-number field.

**Visitors:** an ⓘ on every ad (why am I seeing this, hide this ad, quiet mode), a "Ads: quiet mode" link in the footer, pop-ups only after ~60% scroll or 20 seconds and never on the first page of a visit, no images on data-saver / 2G connections.
**Admin ad form:** WhatsApp lead number, language (Swahili/English browsers) and country (Kenya/outside) targeting. Ad types tab: "No pop-ups on posts tagged…".
**Sponsors:** phone-frame preview, live ad-quality score, picture checker (runs on their device, nothing uploaded), WhatsApp enquiry number (ad button opens a chat; taps are counted as leads).
**Admin Analytics tab:** weekly WhatsApp digests and renewal/upsell drafts for every running or just-finished campaign. The admin review window also shows an ad-quality score per ad.

## Updates: Import & merge (no more console seeding)
Each release ships a small **patch JSON** (in `data/patches/`, also sent separately).
1. Admin → **Import**. Shipped patches are listed with an "applied" tick; or drop/paste any JSON file.
2. Review per section: **Add** (only new things), **Merge** (update changed values) or **Replace**. Check the preview lists.
3. **Apply**. Download the undo file it offers — Import → Undo restores the earlier state.
Never touched by an import: admin accounts, sponsors and their requests, ad stats/images, orders, messages, comments, analytics, logs.
After deploying a new version, also run `firebase deploy --only database` (new rules for imports and discount codes).

## Discount codes for paid materials
Admin → Materials → **Discount codes**: set percent or KES off, which materials (blank = all), max users, once per phone, expiry, on/off. Buyers type the code on the order page and press Apply. Each use is counted when the order is placed; rejecting an order gives the use back. A 100% code makes a free order you deliver manually.

## Chatbot (free, no AI service)
Runs fully in the browser on your own site data. It remembers the conversation, handles English/Kiswahili/Sheng words, quotes passages, summarises the current post, offers WhatsApp/CV/Advertise/Services buttons, captures leads into Admin → Messages, can show one labelled sponsored suggestion every few answers, supports voice input and copy/share. Switches (greeting bubble, sponsored, leads) are in Admin → Inbox → Chatbot.

## Content studio: header / body / footer layers
All 50 designs now render as three full-width layers. **Header** (title bar), **Body** (photo background, narrator, panels) and **Footer** (bar with an optional label such as "DID YOU KNOW?"). Each layer has its own height, roundness and colours; the four Theme colours recolor everything and "Reset layer colours" returns to the theme. Layout can be narrator-left, narrator-right or stacked. Tip text with `|` becomes bullets. New sizes: A4 print, YouTube/wide. Wide sizes are now drawn natively. Saved presets from before still load.

---

## Advanced import (Admin → Import)

* **Queue & sources**: drop several patch files, paste a URL, or import a CSV (map columns to fields). Files wait in a queue and are reviewed one at a time.
* **Choose what to import**: per-node mode (add / merge / replace), tick individual items and fields, side-by-side "yours now / from the file", risk badge, checksum check, duplicate and missing-image warnings. Items you edited by hand are un-ticked by default.
* **Protected fields** (Settings tab), e.g. `materials/*/price`, are never overwritten.
* **Backups & partial undo**: every import stores a backup in the database; undo all of it or only some paths from History.
* **Schedule** an import for later (runs when an admin page is open) and **approvals** (a second admin must approve; skipped with one admin).
* **Export as patch** to move chosen nodes between sites.
* Deploy the new rules: `firebase deploy --only database` (adds `import_*`, `material_coupons*`, `marketing_*`).

## Email & marketing tool (Admin → Email)

1. Pick a type: subscriber update, announcement, new post, new material, advertise myself, follow-up, enquiry reply, thank-you.
2. Choose recipients (all/selected subscribers, a pasted list, or one person). Big lists are split into Bcc batches (default 50).
3. Fill the form (or pick a post/material to auto-fill), choose tone and English/Kiswahili.
4. Press **Open in my email app** (mailto), **Gmail** or **Outlook web**: the compose window opens with To/Bcc, subject and message filled; you press Send.
5. For the full coloured layout use **Copy designed email** and paste, or **Download .eml** and open it in Outlook/Apple Mail.
6. **Mark batch as sent** logs it and moves to the next batch. Drafts, defaults and the log are stored in `marketing_drafts`, `marketing_settings`, `marketing_log` (admin only).
* Inbox → Messages has **Smart reply**, Inbox → Newsletter has **Email subscribers**.
* Tip: use Bcc batches and send to people who subscribed; Gmail free accounts limit ~500 recipients/day.

---

## SEO — making "ezraogombo", "Ezra Ogombo" and "Ogombo" findable

What the site now does by itself:
* Titles and descriptions on every page include **Ezra Ogombo (ezraogombo)**, **content creator** and **theatre technologist** (no "student" — it says *graduate*). The footer and home page show **@ezraogombo** as visible text.
* Home page JSON-LD (WebSite + Person) tells Google the alternate names `ezraogombo`, `Ogombo`, `@ezraogombo`, and links your Facebook/Instagram/TikTok/LinkedIn as `sameAs`.
* Every blog post, content item, book and material has its own static page (real title, text, image, canonical URL, JSON-LD + breadcrumbs), and each list page has a "Browse all … (A–Z)" list linking to everything.
* `sitemap.xml` (191 URLs with images) and `feed.xml` (RSS) are generated; `robots.txt` hides admin/sponsor/order pages.
* Reliance Africa School of Health Sciences now appears only in the CV (and in the paid ad and its disclosure post).

Re-run after adding posts/materials: `python3 tools/build-share-pages.py` then `firebase deploy`.
Then import **2026-10-16-seo-and-wording** in Admin → Import so the live database matches (page titles are read from the database).

Things only you can do (10 minutes, free):
1. **Google Search Console** → add `https://ezra-ogombo.web.app` → submit `https://ezra-ogombo.web.app/sitemap.xml` → "Request indexing" for `/`, `/about`, `/blog`, `/content`, `/cv`. Do the same in **Bing Webmaster Tools**.
2. **Get a custom domain** (e.g. `ezraogombo.com` or `ezraogombo.co.ke`) and connect it in Firebase Hosting → Add custom domain. A domain that *is* your name is the single biggest boost for people typing "ezraogombo". Then change `site_url` in Admin → Data & settings and re-run the build script.
3. Put the same name and link in your bios: Instagram, TikTok, Facebook, LinkedIn → "ezraogombo.web.app". Profiles that link to the site and a site that links back are how Google confirms they are the same person.
4. Share each new post once on your socials; new links get discovered faster.

---

## Identity (one name everywhere)

* Brand name: **Ezra Ogombo** · handle: **@ezraogombo** · logo text: **ezraogombo**.
* Titles read "… Ezra Ogombo (@ezraogombo)"; the footer reads "© Ezra Ogombo (@ezraogombo)". The logo text comes from `site_settings.seo.handle`.

## Home page

* Primary buttons: study materials, subscribe, content. A proof strip shows live counts; add your own items in Admin → Data & settings → `site_settings.proof`, e.g. `[{"value":"12K","label":"TikTok followers"}]`.
* Shows 3 content cards, 3 posts, 3 featured materials (tick "Feature on home page?" on a material, otherwise the most downloaded), a subscribe form and a "Work with me" strip.

## Materials page

* Search, section, free/paid and sort filters (kept in the URL), "Show more", cover images (set a cover on the material), NEW / POPULAR / FEATURED badges and download counts.
* On each material: "What's inside" list, free preview for paid items (`preview_url`), "More like this".
* **Bundles** (Admin → Materials → Bundles): list the material slugs and a discount code made under Discount codes; the code is shown on the hub.
* **Requests**: visitors can ask for materials; read them in Admin → Inbox → Requests.
* Deploy the rules again (`firebase deploy --only database`): they add `material_bundles` and `material_requests`.


## The 100-post batch (2026-10-17 patch)
- Import `data/patches/2026-10-17-100-posts.json` in Admin -> Import (after the earlier patches). It adds 100 posts and fixes one thumbnail path.
- Every blog thumbnail (162 posts) now shows a narrator pose chosen at random from `assets/narrators/`. To re-roll them, use the scratchpad renderer or replace a `/assets/blog/<slug>.jpg` file; the thumbnail path in the database does not change.
- Book posts are guides to each book's published scope, not personal reviews. College, KMTC and regulator posts tell readers to verify with the official body; news posts name their source.
- After adding posts run `python3 tools/build-share-pages.py` to refresh static pages, sitemap.xml and feed.xml.

## Content card explanations (2026-10-17 patch)
`data/patches/2026-10-17-content-explained.json` rewrites the text and caption of all 108 content cards (summary, explanation, common mistakes, self-test, revision points). Import it after the 100-posts patch. The content text lives in `content_highlights/<slug>/body`.

## Content list speed-up and M-Pesa message check (2026-10-20)

**Light content lists.** `data/content-index.json` lists every content card without its body (about 350 KB, 100 KB gzipped). The Content list pages, search and the home page read it instead of downloading every card from the database. Each card page fetches only its own card. Rebuild it with `python3 tools/build-share-pages.py` before each deploy (it runs with the share pages). Cards added later in the admin appear in lists via a small query on `order` (needs the `.indexOn` rule, so deploy `database.rules.json`). Edits to the title or caption of an existing card show on the card page at once and in the lists after the next deploy.

**M-Pesa message check.** `js/mpesa-verify.js` checks pasted M-Pesa messages: it looks like a confirmation, the code looks real, the amount equals the price, it is paid to your till or business name, the time in the SMS is within the last 3 minutes (plus the minute the SMS rounds off), and it has no links. Change the window with `payment/verify/max_age_min`. Orders that fail a soft test are flagged and the buyer is told to wait for approval. The admin Orders page re-runs the check itself, shows AUTO-PASS or FLAGGED, and can match pending orders against your till statement. A pasted SMS can be faked, so the statement match is the real proof.

Deploy `database.rules.json` too: it adds the `mpesa_codes` registry (one code, one order), checks the order time against the server clock and indexes `content_highlights` by `order`.
