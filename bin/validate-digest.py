#!/usr/bin/env python3
"""Diversity gate for 每日情报 issues.

Blocks publishing an issue that has fewer than MIN_PLATFORMS distinct source
platforms (each with >=1 item). A headless run that genuinely can't reach the
browser lanes may set top-level "partial": true to pass with a loud warning —
that issue is expected to be backfilled by the next interactive run.

Usage: validate-digest.py <digest.json> [<digest.json> ...]
Exit 0 = all pass (or partial-flagged). Exit 1 = a full issue lacks diversity.
"""
import json, sys

MIN_PLATFORMS = 2          # a "diverse" issue needs at least this many platforms
MIN_TOTAL_ITEMS = 4        # and at least this many items overall

def check(path):
    try:
        d = json.load(open(path, encoding="utf-8"))
    except Exception as e:
        print(f"  ✗ {path}: cannot parse ({e})")
        return False
    srcs = [s for s in d.get("sources", []) if s.get("items")]
    platforms = sorted({s["platform"] for s in srcs})
    total = sum(len(s["items"]) for s in srcs)
    ok = len(platforms) >= MIN_PLATFORMS and total >= MIN_TOTAL_ITEMS
    if ok:
        print(f"  ✓ {path}: {len(platforms)} platforms ({', '.join(platforms)}), {total} items")
        return True
    if d.get("partial"):
        print(f"  ⚠ {path}: only {len(platforms)} platform ({', '.join(platforms) or 'none'}) "
              f"— allowed via partial:true, MUST be backfilled next interactive run")
        return True
    print(f"  ✗ {path}: only {len(platforms)} platform ({', '.join(platforms) or 'none'}), "
          f"{total} items — needs >={MIN_PLATFORMS} platforms & >={MIN_TOTAL_ITEMS} items.")
    print(f"     Fix: sweep another lane (X / 小红书 / YouTube) and add its source, "
          f"or set \"partial\": true if this is an unavoidable headless run.")
    return False

def main(argv):
    files = argv[1:]
    if not files:
        print("usage: validate-digest.py <digest.json> ...")
        return 0
    print("每日情报 · 来源多样性校验")
    results = [check(f) for f in files]
    if all(results):
        return 0
    print("\n发布已拦截：有一期来源过于单一（见上方 ✗）。")
    return 1

if __name__ == "__main__":
    sys.exit(main(sys.argv))
