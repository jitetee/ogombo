#!/usr/bin/env python3
"""Build the crawlable, shareable, search-engine-ready files for the whole site.

Run from the site folder, then redeploy:
    python3 tools/build-share-pages.py                 # uses seed/seed-full.json
    python3 tools/build-share-pages.py my-export.json  # a backup exported from Admin -> Data & settings

It writes:
  * one static page per blog post, content item, book (writing/books/) and material (materials/item/) with the real
    title, description, canonical URL, og/twitter image, article text, keywords and JSON-LD (BlogPosting/Article/Book/
    Product + BreadcrumbList). Facebook/WhatsApp/X/LinkedIn show proper previews and Google can index the text without
    running JavaScript. The page still loads the live database and replaces the baked-in text, so admin edits keep working.
  * sitemap.xml  (every public URL, with image entries and last-modified dates)
  * feed.xml     (RSS feed of the blog)
  * a visible "All posts / all content / all materials" archive list inside blog, content, materials and writing pages,
    so every item is linked from a crawlable page.
Re-run whenever you add a post/material or change a thumbnail. After deploying, submit sitemap.xml in Google Search Console
and Bing Webmaster Tools, and ask Facebook to refresh a link at https://developers.facebook.com/tools/debug/ .
"""
import html, json, os, re, sys, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "seed", "seed-full.json")
data = json.load(open(SRC, encoding="utf-8"))
site = (data.get("site_settings") or {})
seo = site.get("seo") or {}
ORIGIN = (site.get("site_url") or "https://ezra-ogombo.web.app").rstrip("/")
NAME = site.get("site_name") or "Ezra Ogombo"
HANDLE = seo.get("handle") or "ezraogombo"
ALT = seo.get("alternate_names") or [HANDLE, "Ogombo"]
DEFAULT_IMG = site.get("default_og_image") or "/assets/icons/icon-512.png"
TODAY = datetime.date.today().isoformat()
tpl = open(os.path.join(ROOT, "read.html"), encoding="utf-8").read()
mtpl = open(os.path.join(ROOT, "material.html"), encoding="utf-8").read()
e = lambda s: html.escape(str(s), quote=True)


OK_STATUS = ("published", "in progress", "completed", "finished", "draft")


def items(node):
    v = data.get(node) or []
    v = v if isinstance(v, list) else list(v.values())
    return [x for x in v if x and x.get("slug") and x.get("title") and x.get("status", "published") in (OK_STATUS if node == "writing_projects" else ("published",))]


def absu(p):
    return p if re.match(r"https?:", p) else ORIGIN + (p if p.startswith("/") else "/" + p)


def strip(s):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html.unescape(str(s or "")))).strip()


def short(s, n=158):
    s = strip(s)
    return s if len(s) <= n else s[: n - 1].rsplit(" ", 1)[0] + "…"


def ld_tag(o):
    return '<script type="application/ld+json" data-prerender>' + json.dumps(o, ensure_ascii=False).replace("</", "<\\/") + "</script>\n"


def person():
    return {"@type": "Person", "@id": ORIGIN + "/#person", "name": NAME, "alternateName": ALT, "url": ORIGIN + "/"}


def crumbs(*pairs):
    return {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": i + 1, "name": n, "item": u} for i, (n, u) in enumerate(pairs)]}


def head(page, title, desc, img, url, kind_og="article", keywords=""):
    page = re.sub(r"<title>.*?</title>", lambda m: f"<title>{e(title)}</title>", page, count=1, flags=re.S)
    page = re.sub(r'(<meta name="description" content=")[^"]*"', lambda m: m.group(1) + e(desc) + '"', page, count=1)
    for prop in ("og:title", "twitter:title"):
        page = re.sub(rf'(<meta (?:property|name)="{prop}" content=")[^"]*"', lambda m: m.group(1) + e(title) + '"', page, count=1)
    for prop in ("og:description", "twitter:description"):
        page = re.sub(rf'(<meta (?:property|name)="{prop}" content=")[^"]*"', lambda m: m.group(1) + e(desc) + '"', page, count=1)
    for prop in ("og:image", "twitter:image"):
        page = re.sub(rf'(<meta (?:property|name)="{prop}" content=")[^"]*"', lambda m: m.group(1) + e(absu(img)) + '"', page, count=1)
    extra = ""
    if keywords:
        extra += f'<meta name="keywords" content="{e(keywords)}">\n'
    extra += '<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">\n'
    extra += f'<link rel="canonical" href="{e(url)}">\n<meta property="og:url" content="{e(url)}">\n'
    page = re.sub(r'<link rel="canonical" href="[^"]*">\n?', "", page, count=1)
    page = re.sub(r'<meta name="robots" content="[^"]*">\n?', "", page)
    return page.replace("</head>", extra + "</head>", 1)


def footer_handle(page):
    return page.replace("<span data-site-name>Ezra Ogombo</span>.</p>", f"<span data-site-name>Ezra Ogombo</span> (@{HANDLE}).</p>")


def build(kind, node, img_keys, desc_keys, route=None):
    route = route or kind
    out = os.path.join(ROOT, *route.split("/"))
    if route not in ("content", "blog"):   # blog posts and content cards share read.html; no per-item files
        os.makedirs(out, exist_ok=True)
    made = []
    for it in items(node):
        img = next((it[k] for k in img_keys if it.get(k)), "") or DEFAULT_IMG
        desc = short(next((it[k] for k in desc_keys if it.get(k)), "") or it.get("summary") or it["title"])
        title = f"{it['title']} — {NAME}"
        url = f"{ORIGIN}/{route}/{it['slug']}"
        tags = it.get("tags") or []
        kw = ", ".join(dict.fromkeys([*tags, NAME, HANDLE]))
        page = head(tpl, title, desc, img, url, keywords=kw)
        body = it.get("content") or it.get("body") or f"<p>{e(it.get('summary') or it.get('caption', ''))}</p>"
        page = page.replace('<h1 id="post-title">Loading…</h1>', f'<h1 id="post-title">{e(it["title"])}</h1>', 1)
        page = page.replace('<section class="post-body" id="post-content"><p>Loading…</p></section>', f'<section class="post-body" id="post-content">{body}</section>', 1)
        page = page.replace('<span id="crumb-title">…</span>', f'<span id="crumb-title">{e(it["title"])}</span>', 1)
        listname, listurl = {"blog": ("Blog", "/blog"), "content": ("Content", "/content"), "writing/books": ("Writing", "/writing")}[route]
        page = page.replace('<a id="crumb-list" href="/blog">Blog</a>', f'<a id="crumb-list" href="{listurl}">{listname}</a>', 1)
        page = page.replace('<img class="post-hero" id="post-thumb" src="" alt="" style="display:none;">', f'<img class="post-hero" id="post-thumb" src="{e(img)}" alt="{e(it["title"])}">', 1)
        ldt = "BlogPosting" if kind == "blog" else ("Book" if kind == "book" else "Article")
        ld = {"@context": "https://schema.org", "@type": ldt, "headline": it["title"], "name": it["title"], "description": desc, "image": [absu(img)],
              "mainEntityOfPage": url, "url": url, "inLanguage": "en", "keywords": ", ".join(tags) or None,
              "author": person(), "publisher": person()}
        if it.get("date"):
            ld["datePublished"] = it["date"]; ld["dateModified"] = it.get("updated") or it["date"]
        ld = {k: v for k, v in ld.items() if v}
        tagsx = ld_tag(ld) + ld_tag(crumbs(("Home", ORIGIN + "/"), (listname, ORIGIN + listurl), (it["title"], url)))
        if it.get("date"):
            tagsx += f'<meta property="article:published_time" content="{e(it["date"])}">\n<meta property="article:author" content="{e(NAME)}">\n'
        page = footer_handle(page).replace("</head>", tagsx + "</head>", 1)
        if route not in ("content", "blog"):  # blog posts and content cards share one page (read.html); no per-item files
            open(os.path.join(out, it["slug"] + ".html"), "w", encoding="utf-8").write(page)
        made.append({"slug": it["slug"], "title": it["title"], "url": url, "img": absu(img), "date": it.get("updated") or it.get("date") or it.get("created") or TODAY,
                     "desc": desc, "tags": tags, "route": route})
    return made


def build_materials():
    out = os.path.join(ROOT, "materials", "item")
    os.makedirs(out, exist_ok=True)
    made = []
    cats = data.get("material_categories") or {}
    for m in items("materials"):
        url = f"{ORIGIN}/materials/item/{m['slug']}"
        free = m.get("access") != "paid"
        cat = (cats.get(m.get("category")) or {}).get("label") or m.get("category") or "Materials"
        desc = short(m.get("description") or m["title"])
        title = f"{m['title']} — {cat} | {NAME}"
        img = m.get("cover") or DEFAULT_IMG
        kw = ", ".join(dict.fromkeys([m["title"], cat, "study materials", "Perioperative Theatre Technology", NAME, HANDLE]))
        page = head(mtpl, title, desc, img, url, keywords=kw)
        page = page.replace('<h1 id="m-title">Loading…</h1>', f'<h1 id="m-title">{e(m["title"])}</h1>', 1)
        page = page.replace('<div id="m-body"></div>', f'<div id="m-body"><p>{e(m.get("description") or "")}</p><p>{e(cat)} · {"Free" if free else "KES " + str(m.get("price", ""))}</p></div>', 1)
        page = page.replace('<span id="crumb-title">…</span>', f'<span id="crumb-title">{e(m["title"])}</span>', 1)
        offer = {"@type": "Offer", "price": 0 if free else m.get("price", 0), "priceCurrency": "KES", "availability": "https://schema.org/InStock", "url": url}
        ld = {"@context": "https://schema.org", "@type": "CreativeWork" if free else "Product", "name": m["title"], "description": desc, "image": absu(img), "url": url,
              "inLanguage": "en", "author": person(), "publisher": person(), "offers": offer, "category": cat}
        tagsx = ld_tag(ld) + ld_tag(crumbs(("Home", ORIGIN + "/"), ("Materials", ORIGIN + "/materials"), (m["title"], url)))
        page = footer_handle(page).replace("</head>", tagsx + "</head>", 1)
        open(os.path.join(out, m["slug"] + ".html"), "w", encoding="utf-8").write(page)
        made.append({"slug": m["slug"], "title": m["title"], "url": url, "img": absu(img), "date": m.get("created") or TODAY, "desc": desc, "tags": [], "route": "materials/item", "cat": cat})
    return made


b = build("blog", "blog_posts", ("thumbnail", "legacy_thumbnail"), ("meta_description", "excerpt"))
c = build("content", "content_highlights", ("image", "legacy_image"), ("caption",))
# light index of the content cards (no bodies) so list pages, search and the home page do not
# download every card's full text from the database. Rebuilt on every run of this script.
_ci = sorted(({"s": x["slug"], "t": x["title"], "i": x.get("image") or x.get("legacy_image") or "", "c": x.get("caption", ""), "o": x.get("order") if isinstance(x.get("order"), (int, float)) else 0} for x in items("content_highlights")), key=lambda r: (r["o"], r["t"]))
open(os.path.join(ROOT, "data", "content-index.json"), "w", encoding="utf-8").write(json.dumps({"v": 1, "count": len(_ci), "max": max([r["o"] for r in _ci] or [0]), "min": min([r["o"] for r in _ci] or [0]), "items": _ci}, ensure_ascii=False, separators=(",", ":")))
# light index of the blog posts (no bodies): list page, home page and search read this instead of every full post
_bi = sorted(({"s": x["slug"], "t": x["title"], "d": x.get("date", ""), "e": x.get("excerpt", ""), "i": x.get("thumbnail") or x.get("legacy_thumbnail") or "", "g": x.get("tags") or [], "m": x.get("read_minutes", "")} for x in items("blog_posts")), key=lambda r: r["d"], reverse=True)
open(os.path.join(ROOT, "data", "blog-index.json"), "w", encoding="utf-8").write(json.dumps({"v": 1, "count": len(_bi), "max": max([r["d"] for r in _bi] or [""]), "items": _bi}, ensure_ascii=False, separators=(",", ":")))
w = build("book", "writing_projects", ("cover", "image"), ("excerpt", "summary"), route="writing/books")
mt = build_materials()

# ---------- archive lists on the listing pages ----------
def archive(label, lst):
    li = "".join(f'<li><a href="{e(i["url"].replace(ORIGIN, ""))}">{e(i["title"])}</a></li>' for i in sorted(lst, key=lambda x: x["title"].lower()))
    return (f'<!--seo-archive--><section class="seo-archive wrap"><details><summary>Browse all {len(lst)} {label} (A–Z)</summary>'
            f'<ul>{li}</ul></details></section><!--/seo-archive-->')


def inject(path, block):
    p = os.path.join(ROOT, path)
    t = open(p, encoding="utf-8").read()
    t = re.sub(r"<!--seo-archive-->.*?<!--/seo-archive-->", "", t, flags=re.S)
    t = t.replace("</main>", block + "\n</main>", 1)
    open(p, "w", encoding="utf-8").write(t)


inject("blog.html", archive("blog posts", b))
inject("content.html", archive("content items", c))
inject("materials.html", archive("study materials", mt))
inject("writing/index.html", archive("books and projects", w))

# ---------- sitemap.xml ----------
static = [("/", "weekly", "1.0"), ("/about", "monthly", "0.8"), ("/content", "weekly", "0.9"), ("/blog", "weekly", "0.9"), ("/writing", "monthly", "0.6"),
          ("/materials", "weekly", "0.8"), ("/cv", "monthly", "0.7"), ("/advertise", "monthly", "0.5"), ("/subscribe", "monthly", "0.6"), ("/contact", "yearly", "0.5"), ("/search", "monthly", "0.3"), ("/privacy", "yearly", "0.2")]
for k in (data.get("material_categories") or {}):
    static.append((f"/materials/{k}", "weekly", "0.7"))
u = ['<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">']
for p, cf, pr in static:
    u.append(f"  <url><loc>{ORIGIN}{p}</loc><lastmod>{TODAY}</lastmod><changefreq>{cf}</changefreq><priority>{pr}</priority></url>")
for it in b + c + w + mt:
    pr = "0.8" if it["route"] == "blog" else "0.7" if it["route"] in ("content", "materials/item") else "0.5"
    img = f"<image:image><image:loc>{e(it['img'])}</image:loc><image:title>{e(it['title'])}</image:title></image:image>"
    u.append(f"  <url><loc>{e(it['url'])}</loc><lastmod>{str(it['date'])[:10]}</lastmod><changefreq>monthly</changefreq><priority>{pr}</priority>{img}</url>")
u.append("</urlset>\n")
open(os.path.join(ROOT, "sitemap.xml"), "w", encoding="utf-8").write("\n".join(u))

# ---------- feed.xml ----------
rfc = lambda d: datetime.datetime.strptime(str(d)[:10], "%Y-%m-%d").strftime("%a, %d %b %Y 00:00:00 +0300")
posts = sorted(b, key=lambda x: str(x["date"]), reverse=True)[:30]
f = ['<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>',
     f"<title>{e(NAME)} (@{e(HANDLE)}) — blog</title><link>{ORIGIN}/blog</link><description>{e(site.get('default_description') or NAME)}</description><language>en-ke</language>",
     f'<atom:link href="{ORIGIN}/feed.xml" rel="self" type="application/rss+xml"/>']
for p in posts:
    f.append(f"<item><title>{e(p['title'])}</title><link>{e(p['url'])}</link><guid>{e(p['url'])}</guid><pubDate>{rfc(p['date'])}</pubDate><description>{e(p['desc'])}</description></item>")
f.append("</channel></rss>\n")
open(os.path.join(ROOT, "feed.xml"), "w", encoding="utf-8").write("\n".join(f))
print(f"Wrote {len(b)} blog, {len(c)} content, {len(w)} book and {len(mt)} material pages; sitemap.xml with {len(static) + len(b) + len(c) + len(w) + len(mt)} URLs; feed.xml.")
