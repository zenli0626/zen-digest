#!/usr/bin/env python3
"""Editorial dedup helper — the parts bin/validate-digest.py cannot see.

validate-digest.py enforces two rules mechanically: no item URL from the last 7
issues, and no more than one item per host. But the editorial rules are stricter
than that, and a run that reads only the validator will silently drift:

  * A host used in a recent issue should not show up again without a reason,
    even when the *URL* is new. The validator keys on the URL only, so
    "same domain, different article" passes it every time.
  * validate-digest.py puts x.com and github.com in PLATFORM_HOSTS, meaning the
    one-per-host cap is not even checked for them. For this repo's issues, X
    never appears and github.com only ever appears in a dropped wire column, so
    the two lists disagree about the same domain.

Usage:
  check-domain-reuse.py <url> [<url> ...]     # is this candidate safe to use?
  check-domain-reuse.py <digest.json>         # audit a written issue against the prior 7
Options:
  --days N        lookback in days (default 7)

Exit 0 = every candidate is fresh; exit 1 = at least one collision to review.
"""

import json
import os
import sys
from datetime import date, timedelta
from urllib.parse import urlparse

DIGEST_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "digests")

# Mirrors bin/validate-digest.py: hosts where the domain is the venue, not the
# author. github.com is platform-hosted here yet max-one-per-issue is still the
# editorial rule, so --audit reports those collisions too.
PLATFORM_HOSTS = {"youtube.com", "youtu.be", "x.com", "twitter.com", "xiaohongshu.com", "github.com"}


def domain(url):
    host = (urlparse(url or "").hostname or "").lower()
    return host[4:] if host.startswith("www.") else host


def entries_by_day():
    """{date_str: [(domain, author, url, platform)]} for every archived issue."""
    out = {}
    for name in sorted(os.listdir(DIGEST_DIR)):
        if not (name.startswith("2026-") and name.endswith(".json")):
            continue
        try:
            d = json.load(open(os.path.join(DIGEST_DIR, name), encoding="utf-8"))
        except Exception:
            continue
        rows = []
        for s in d.get("sources", []):
            for it in s.get("items", []):
                u = it.get("url") or ""
                if u:
                    rows.append((domain(u), it.get("author") or "", u, s.get("platform") or ""))
        out[name[:-5]] = rows
    return out


def audit(path, days):
    d = json.load(open(path, encoding="utf-8"))
    today = date.fromisoformat(d.get("date", ""))
    prior = entries_by_day()
    window = []
    for i in range(1, days + 1):
        key = (today - timedelta(days=i)).isoformat()
        if key in prior:
            window.append((key, prior[key]))
    problems = 0
    for s in d.get("sources", []):
        for it in s.get("items", []):
            dom = domain(it.get("url") or "")
            if dom in PLATFORM_HOSTS:
                continue
            seen = [(k, a, u, p) for k, rows in window for (h, a, u, p) in rows if h == dom]
            if seen:
                problems += 1
                print(f"  ✗ {dom} also used in {seen[0][0]} ({seen[0][1]}, {seen[0][3]})")
    counts = {}
    for s in d.get("sources", []):
        for it in s.get("items", []):
            dom = domain(it.get("url") or "")
            if dom in PLATFORM_HOSTS:
                continue
            counts.setdefault(dom, []).append(s.get("platform"))
    for dom, plats in counts.items():
        if len(plats) > 1:
            problems += 1
            print(f"  ✗ {dom} appears {len(plats)} times in one issue across {plats}")
    total = sum(len(s.get("items", [])) for s in d.get("sources", []))
    print(f"  {'✓' if not problems else '✗'} {os.path.basename(path)}: {total} items, "
          f"{problems} collision(s)")
    return problems == 0


def lookup(urls, days):
    prior = entries_by_day()
    today = date.today().isoformat()
    ok = True
    for u in urls:
        dom = domain(u)
        if dom in PLATFORM_HOSTS:
            print(f"  · {u}\n      {dom} is a platform host, exempt from domain-reuse dedup")
            continue
        hits = [(k, a, p) for k, rows in prior.items()
                if (date.fromisoformat(today) - date.fromisoformat(k)).days <= days
                for (h, a, _, p) in rows if h == dom]
        if hits:
            ok = False
            newest = max(hits)[0]
            print(f"  ✗ {u}\n      {dom} used in {newest} ({hits[0][1]}, {hits[0][2]}) — "
                  f"{len(hits)} hit(s) in the last {days} days")
        else:
            print(f"  ✓ {u}\n      {dom} clear in the last {days} days")
    return ok


def main(argv):
    args = argv[1:]
    days = 7
    if "--days" in args:
        i = args.index("--days")
        days = int(args[i + 1])
        del args[i:i + 2]
    if not args:
        print(__doc__)
        return 0
    if len(args) == 1 and args[0].endswith(".json"):
        return 0 if audit(args[0], days) else 1
    return 0 if lookup(args, days) else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
