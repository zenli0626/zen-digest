#!/usr/bin/env python3
"""YouTube subtitle-429 fallback — read the transcript from the publisher's own page.

Some podcast/conference publishers (Latent Space, Lenny's, AI Engineer) post a full
timestamped transcript on their own episode page. When yt-dlp's subtitle fetch 429s or
hits a bot-check, that page is the same content on a different host with no YouTube
rate limit. Confirmed repeatedly (2026-09-29, 10-03, 10-05, 10-10, 10-11): a plain GET on
the episode page succeeds when 4/4 parallel yt-dlp subtitle fetches 429 in the same run.

This does a plain GET and strips HTML tags — no browser, no JS rendering. A
client-rendered SPA (React/Astro hydration shell with no server-rendered text) will
fail the transcript heuristic below; escalate to scrapling/jina per SKILL.md instead
of retrying this script.

Usage:
  publisher-transcript.py <episode-page-url> <output-path.txt>

Exit 0 = wrote a transcript-shaped file. Exit 1 = page fetched but found no
timestamped transcript (word count too low, or no timestamp markers like "00:0" /
"[00:"). Exit 2 = fetch failed (HTTP error, timeout, DNS).

Build-to-delete: once YouTube subtitle 429s stop happening for a week (check the
ledger), delete this note and this script's SKILL.md citation, keep the script itself
only if something still links to it.
"""

import html
import re
import sys
import urllib.request

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
)

TIMESTAMP_RE = re.compile(r"\b\d{1,2}:\d{2}(:\d{2})?\b")
MIN_WORDS = 500
MIN_TIMESTAMPS = 5


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", errors="replace")


def strip_tags(raw):
    raw = re.sub(r"(?is)<(script|style|nav|header|footer)\b.*?</\1>", " ", raw)
    text = re.sub(r"(?s)<[^>]+>", " ", raw)
    text = html.unescape(text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n\s*\n+", "\n\n", text)
    return text.strip()


def main(argv):
    if len(argv) != 3:
        print(__doc__)
        return 2
    url, out_path = argv[1], argv[2]
    try:
        raw = fetch(url)
    except Exception as e:
        print(f"fetch failed: {e}", file=sys.stderr)
        return 2

    text = strip_tags(raw)
    words = len(text.split())
    timestamps = len(TIMESTAMP_RE.findall(text))

    if words < MIN_WORDS or timestamps < MIN_TIMESTAMPS:
        print(
            f"not a transcript page: {words} words, {timestamps} timestamp markers "
            f"(need >={MIN_WORDS} words and >={MIN_TIMESTAMPS} timestamps)",
            file=sys.stderr,
        )
        return 1

    with open(out_path, "w", encoding="utf-8") as f:
        f.write(text)
    print(f"wrote {out_path}: {words} words, {timestamps} timestamp markers")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
