#!/usr/bin/env python3
"""Flag a thread quietly claiming more than one home in a digest issue.

SKILL.md step 2b documents a confirmed failure (2026-10-23): one story occupied
banner + item + hands_on in the same issue. The banner/item pairing is normal
(the item is the banner's own elaboration) and an item/action pairing is the
issue's usual pattern (an action distills an item into something to do) — so
this only flags hands_on quietly repeating a URL or domain that an item or
action already used, which is the specific case that slipped through before.

Usage: check-thread-overlap.py <digest.json>
Exit 0 = clean. Exit 1 = a parse error. Prints warnings but never blocks
publish on its own — it's a signal for the editorial pass, not a gate.
"""
import json, sys
from urllib.parse import urlparse

# Platform hosts where the domain is the venue, not the author (same list as
# validate-digest.py's diversity check) — a shared domain here means nothing,
# so only an exact URL match counts as overlap on these hosts.
PLATFORM_HOSTS = {"youtube.com", "youtu.be", "x.com", "twitter.com", "xiaohongshu.com", "github.com"}

def domain(url):
    host = (urlparse(url or "").hostname or "").lower()
    return host[4:] if host.startswith("www.") else host

def main(path):
    try:
        d = json.load(open(path, encoding="utf-8"))
    except Exception as e:
        print(f"  ✗ {path}: cannot parse ({e})")
        return 1

    hands_on = d.get("hands_on") or {}
    ho_url = hands_on.get("source_url")
    if not ho_url:
        print(f"  (no hands_on.source_url in {path}, nothing to check)")
        return 0
    ho_domain = domain(ho_url)

    item_urls = [it.get("url") for s in d.get("sources", []) for it in s.get("items", [])]
    action_urls = [a.get("source_url") for a in d.get("actions", [])]

    hits = []
    for label, urls in (("item", item_urls), ("action", action_urls)):
        for u in urls:
            if not u:
                continue
            if u == ho_url:
                hits.append((label, u))
            elif ho_domain not in PLATFORM_HOSTS and domain(u) == ho_domain:
                hits.append((label, u))

    if hits:
        print(f"  ⚠ {path}: hands_on ({ho_url}) overlaps {len(hits)} other home(s):")
        for label, u in hits:
            print(f"      - also appears as {label}: {u}")
        return 0
    print(f"  ✓ {path}: hands_on claims its own thread, no overlap with items/actions")
    return 0

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("usage: check-thread-overlap.py <digest.json>", file=sys.stderr)
        sys.exit(1)
    sys.exit(main(sys.argv[1]))
