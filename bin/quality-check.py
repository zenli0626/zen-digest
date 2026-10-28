#!/usr/bin/env python3
"""Quality self-check for 每日情报 — the extra bar (beyond the diversity gate) that an
issue must clear to auto-publish to PRODUCTION in the cloud pipeline. A "fail" does NOT
mean broken; it means "not confidently good enough to go live unreviewed" → the CI holds
it at a preview deploy and pings Zen instead.

Fails on: a thin issue (too few items), single-lane, an empty or overlong banner,
too few actions, items missing a link or a real summary, or a missing hands_on / ota section.

Usage: quality-check.py <digest.json>
Exit 0 = good enough to auto-prod. Exit 1 = hold at preview (reasons printed).
"""
import json, re, sys

MIN_ITEMS = 5          # quality bar sits one above the diversity gate's 4
MIN_PLATFORMS = 2
MIN_ACTIONS = 2
MIN_SUMMARY = 15       # chars — an item with a stub summary isn't "read for Zen"
MAX_BANNER_CJK = 20    # STYLE-ZH: Chinese banner <=20 chars, best at 12-18
MAX_BANNER_EN_WORDS = 12

def action_text(a):
    if isinstance(a, str):
        return a.strip()
    if isinstance(a, dict):
        for k in ("text", "title", "label", "action"):
            if a.get(k):
                return str(a[k]).strip()
    return ""

def check(path):
    reasons = []
    try:
        d = json.load(open(path, encoding="utf-8"))
    except Exception as e:
        return [f"cannot parse {path}: {e}"]

    srcs = [s for s in d.get("sources", []) if s.get("items")]
    platforms = {s.get("platform") for s in srcs}
    items = [it for s in srcs for it in s["items"]]

    if len(platforms) < MIN_PLATFORMS:
        reasons.append(f"only {len(platforms)} source platform(s) (need >={MIN_PLATFORMS})")
    if len(items) < MIN_ITEMS:
        reasons.append(f"only {len(items)} items (need >={MIN_ITEMS} to auto-prod)")

    banner = (d.get("banner") or "").strip()
    if not banner:
        reasons.append("empty banner")
    else:
        n_cjk = len(re.findall(r"[㐀-鿿]", banner))
        if n_cjk > MAX_BANNER_CJK:
            reasons.append(f"banner has {n_cjk} Chinese chars (max {MAX_BANNER_CJK})")
    banner_en = (d.get("banner_en") or "").strip()
    if banner_en:
        n_words = len(banner_en.split())
        if n_words > MAX_BANNER_EN_WORDS:
            reasons.append(f"banner_en has {n_words} words (max {MAX_BANNER_EN_WORDS})")

    actions = [a for a in (d.get("actions") or []) if action_text(a)]
    if len(actions) < MIN_ACTIONS:
        reasons.append(f"only {len(actions)} usable actions (need >={MIN_ACTIONS})")

    for i, it in enumerate(items):
        url = (it.get("url") or "").strip()
        if not url.startswith("http"):
            reasons.append(f"item[{i}] '{(it.get('title') or '')[:30]}' has no valid url")
        if len((it.get("summary") or "").strip()) < MIN_SUMMARY:
            reasons.append(f"item[{i}] '{(it.get('title') or '')[:30]}' summary too thin")

    ho = d.get("hands_on") or {}
    if not ho.get("steps"):
        reasons.append("hands_on missing or has no steps")

    ota = d.get("ota") or {}
    if not (ota.get("learned") and ota.get("new_capabilities")):
        reasons.append("ota missing learned / new_capabilities")

    return reasons

def main(argv):
    if len(argv) < 2:
        print("usage: quality-check.py <digest.json>")
        return 1
    path = argv[1]
    reasons = check(path)
    print("每日情报 · 上线质量自检 / auto-prod quality check")
    if not reasons:
        print(f"  ✓ {path}: clears the quality bar — safe to auto-publish to prod.")
        return 0
    print(f"  ✗ {path}: HOLD at preview — {len(reasons)} issue(s):")
    for r in reasons:
        print(f"     - {r}")
    return 1

if __name__ == "__main__":
    sys.exit(main(sys.argv))
