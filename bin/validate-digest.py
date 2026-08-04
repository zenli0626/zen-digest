#!/usr/bin/env python3
"""Diversity gate for 每日情报 issues.

Blocks publishing an issue that has fewer than MIN_PLATFORMS distinct source
platforms (each with >=1 item). A headless run that genuinely can't reach the
browser lanes may set top-level "partial": true to pass with a loud warning —
that issue is expected to be backfilled by the next interactive run.

Usage: validate-digest.py [--strict] <digest.json> [...]   (--strict: repetition blocks too)
Exit 0 = all pass (or partial-flagged). Exit 1 = a full issue lacks diversity.
"""
import json, os, sys
from datetime import date, timedelta
from urllib.parse import urlparse

MIN_PLATFORMS = 2          # a "diverse" issue needs at least this many platforms
MIN_TOTAL_ITEMS = 4        # and at least this many items overall
LOOKBACK_DAYS = 7          # no item URL may repeat within this many prior issues
# Platform hosts where the domain is the venue, not the author — exempt from the
# one-item-per-domain cap (the real dedup key there is the channel/account).
PLATFORM_HOSTS = {"youtube.com", "youtu.be", "x.com", "twitter.com", "xiaohongshu.com", "github.com"}

def _domain(url):
    host = (urlparse(url or "").hostname or "").lower()
    return host[4:] if host.startswith("www.") else host

def _item_urls(d):
    return [it.get("url") or it.get("link") or "" for s in d.get("sources", []) for it in s.get("items", [])]

def check_repetition(path, d):
    """URL repeats vs the last LOOKBACK_DAYS issues + >1 item per non-platform domain."""
    problems = []
    urls = [u for u in _item_urls(d) if u]
    counts = {}
    for u in urls:
        dom = _domain(u)
        if dom and dom not in PLATFORM_HOSTS:
            counts.setdefault(dom, []).append(u)
    for dom, us in counts.items():
        if len(us) > 1:
            problems.append(f"{len(us)} items from the same source ({dom}) — max 1 per issue")
    try:
        day = date.fromisoformat(d.get("date", ""))
        digest_dir = os.path.dirname(os.path.abspath(path))
        seen = {}
        for i in range(1, LOOKBACK_DAYS + 1):
            prior = os.path.join(digest_dir, f"{day - timedelta(days=i)}.json")
            if os.path.exists(prior):
                for u in _item_urls(json.load(open(prior, encoding="utf-8"))):
                    seen.setdefault(u, os.path.basename(prior))
        for u in urls:
            if u in seen:
                problems.append(f"already covered in {seen[u]}: {u}")
    except ValueError:
        pass  # no parseable date — skip the lookback, keep the per-domain check
    return problems

def check(path, strict=False):
    try:
        d = json.load(open(path, encoding="utf-8"))
    except Exception as e:
        print(f"  ✗ {path}: cannot parse ({e})")
        return False
    srcs = [s for s in d.get("sources", []) if s.get("items")]
    platforms = sorted({s["platform"] for s in srcs})
    total = sum(len(s["items"]) for s in srcs)
    ok = len(platforms) >= MIN_PLATFORMS and total >= MIN_TOTAL_ITEMS
    repetition = check_repetition(path, d)
    if repetition and not strict:
        # Repetition only blocks the publish paths (--strict). The pre-commit hook runs
        # without it, so copy edits and backfills of existing issues still commit.
        print(f"  ⚠ {path}: repetitive (warn only; blocks at publish) — " + "; ".join(repetition))
        repetition = []
    if repetition:
        print(f"  ✗ {path}: repetitive —")
        for p in repetition:
            print(f"     · {p}")
        print(f"     Fix: swap the repeated item(s) for a different source/story "
              f"(no URL from the last {LOOKBACK_DAYS} issues, max 1 item per non-platform domain).")
        return False
    if ok:
        print(f"  ✓ {path}: {len(platforms)} platforms ({', '.join(platforms)}), {total} items")
        return True
    if d.get("partial"):
        print(f"  ⚠ {path}: only {len(platforms)} platform ({', '.join(platforms) or 'none'}) "
              f"— allowed via partial:true, MUST be backfilled next interactive run")
        return True
    print(f"  ✗ {path}: only {len(platforms)} platform ({', '.join(platforms) or 'none'}), "
          f"{total} items — needs >={MIN_PLATFORMS} platforms & >={MIN_TOTAL_ITEMS} items.")
    print(f"     Fix: sweep another lane (文摘/newsletters + YouTube are both headless; "
          f"X / 小红书 need Chrome) and add its source, "
          f"or set \"partial\": true only if even the headless lanes failed.")
    return False

def main(argv):
    args = argv[1:]
    strict = "--strict" in args
    files = [a for a in args if a != "--strict"]
    if not files:
        print("usage: validate-digest.py <digest.json> ...")
        return 0
    print("每日情报 · 来源多样性校验")
    results = [check(f, strict) for f in files]
    if all(results):
        return 0
    print("\n发布已拦截：有一期来源过于单一（见上方 ✗）。")
    return 1

if __name__ == "__main__":
    sys.exit(main(sys.argv))
