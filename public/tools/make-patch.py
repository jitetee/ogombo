#!/usr/bin/env python3
"""Make a small update file ("patch") from two seed files: only what is NEW or CHANGED in the newer one.
   python3 tools/make-patch.py old-seed.json new-seed.json out.json --id 2026-10-20-thing --name "Thing" --notes "What it adds"
Import the result in Admin -> Import. Existing accounts, orders, comments etc. are never touched."""
import json, sys, argparse, hashlib
MERGE = {"blog_posts","content_highlights","writing_projects","materials","material_categories","chatbot_faq","occasions","jokes","milestones","interests","cyber_cafe_services","side_projects","gallery","pages"}
def diff(old, new):
    if isinstance(new, dict) and isinstance(old, dict):
        out = {}
        for k, v in new.items():
            if k not in old: out[k] = v
            else:
                d = diff(old[k], v)
                if d is not None: out[k] = d
        return out or None
    return None if old == new else new
ap = argparse.ArgumentParser(); ap.add_argument("old"); ap.add_argument("new"); ap.add_argument("out")
ap.add_argument("--id", required=True); ap.add_argument("--name", required=True); ap.add_argument("--notes", default=""); ap.add_argument("--date", default="")
a = ap.parse_args()
old, new = json.load(open(a.old)), json.load(open(a.new))
patch = {k: d for k, v in new.items() if not k.startswith("_") for d in [diff(old.get(k), v) if k in old else v] if d is not None}
modes = {k: ("merge" if k in MERGE else "add") for k in patch}
def canon(v):
    if isinstance(v, list): return "[" + ",".join(canon(x) for x in v) + "]"
    if isinstance(v, dict): return "{" + ",".join(json.dumps(k, ensure_ascii=False) + ":" + canon(v[k]) for k in sorted(v)) + "}"
    return json.dumps(v, ensure_ascii=False, separators=(",", ":"))
def title(v): return v.get("title") or v.get("name") or v.get("term") or v.get("question") or "" if isinstance(v, dict) else ""
changelog = []
for node, data in patch.items():
    if isinstance(data, dict) and all(isinstance(x, dict) for x in data.values()) and data:
        for k, v in data.items():
            was = isinstance(old.get(node), dict) and k in old[node]
            changelog.append({"path": f"{node}/{k}", "text": (("Updated: " if was else "New: ") + (title(v) or k))})
    else: changelog.append({"path": node, "text": "Updated settings"})
sig = hashlib.sha256(canon({k: patch[k] for k in sorted(patch)}).encode("utf-8")).hexdigest()
out = {"_patch": {"id": a.id, "name": a.name, "notes": a.notes, "date": a.date, "modes": modes, "changelog": changelog, "sha256": sig}}; out.update(patch)
json.dump(out, open(a.out, "w"), indent=2, ensure_ascii=False)
print(f"{a.out}: {len(patch)} node(s): " + ", ".join(f"{k} ({len(json.dumps(v))//1024 or 1} KB)" for k, v in patch.items()))
