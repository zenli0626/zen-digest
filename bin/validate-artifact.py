#!/usr/bin/env python3
"""Security boundary between the `generate` and `publish` jobs in
.github/workflows/daily-digest.yml.

`generate` runs `claude -p ... --dangerously-skip-permissions` over content swept from
the open web, in a job that holds ONLY ANTHROPIC_API_KEY. Its sole output is a workflow
artifact (digests/<DAY>.json + digests/img/<DAY>.*). `publish` does a FRESH checkout (so
it runs the trusted, committed scripts — not anything a prompt injection in the swept
content may have rewritten) and holds all the deploy secrets (VERCEL_TOKEN, SUPABASE_*,
RESEND_API_KEY, TELEGRAM_*, PUBLIC_REPO_TOKEN, ...). This script is the gate the artifact
must clear before `publish` trusts it enough to copy into the working tree.

Deliberately simple and auditable — this is a security boundary, not a framework.

Checks:
  1. File allowlist — only digests/<DAY>.json and digests/img/<DAY>.<ext> may exist in
     the artifact. Anything else (extra files, path traversal, symlinks) fails closed.
  2. JSON schema — required top-level keys present, `date` must equal <DAY>, `sources`
     must be a list of {platform, items:[...]} objects with the expected string fields.
  3. Size limits — sane caps on file size and per-field string length, so a runaway or
     adversarial generation can't smuggle an oversized payload through.

Usage: validate-artifact.py <artifact_dir> <DAY>   (DAY = YYYY-MM-DD)
Exit 0 = safe to copy into the working tree and publish. Exit 1 = reject (reasons printed).
"""
import json, os, re, sys

MAX_JSON_BYTES = 2_000_000     # a normal issue is a few hundred KB
MAX_IMG_BYTES = 8_000_000      # hero image
MAX_STR_LEN = 20_000           # generous ceiling for any single text field
MAX_ITEMS_PER_SOURCE = 40

REQUIRED_TOP_KEYS = ["date", "banner", "sources"]
STR_FIELDS_TOP = ("banner", "banner_en", "meta_read", "meta_read_en")
ITEM_REQUIRED = ("title", "url", "summary")
ITEM_STR_FIELDS = ("title", "title_en", "summary", "summary_en", "author", "author_en", "url")
DAY_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
IMG_EXTS = {"jpg", "jpeg", "png", "webp"}


def check_allowlist(artifact_dir, day, problems):
    allowed_json = os.path.normpath(f"digests/{day}.json")
    img_re = re.compile(rf"^digests[/\\]img[/\\]{re.escape(day)}\.([A-Za-z0-9]+)$")
    seen_json = False
    for root, _dirs, files in os.walk(artifact_dir, followlinks=False):
        for name in files:
            full = os.path.join(root, name)
            rel = os.path.normpath(os.path.relpath(full, artifact_dir))
            if os.path.islink(full):
                problems.append(f"symlink not allowed in artifact: {rel}")
                continue
            if rel.split(os.sep)[0] == "..":
                problems.append(f"path traversal in artifact: {rel}")
                continue
            if rel == allowed_json:
                seen_json = True
                continue
            m = img_re.match(rel)
            if m and m.group(1).lower() in IMG_EXTS:
                continue
            problems.append(f"unexpected file in artifact: {rel}")
    if not seen_json:
        problems.append(f"missing required digests/{day}.json in artifact")
    return seen_json


def check_size(path, limit, problems):
    sz = os.path.getsize(path)
    if sz > limit:
        problems.append(f"{path} is {sz} bytes, over the {limit} limit")


def check_str_field(label, v, problems):
    if v is None:
        return
    if not isinstance(v, str):
        problems.append(f"{label} must be a string, got {type(v).__name__}")
    elif len(v) > MAX_STR_LEN:
        problems.append(f"{label} exceeds {MAX_STR_LEN} chars ({len(v)})")


def check_schema(path, day, problems):
    try:
        d = json.load(open(path, encoding="utf-8"))
    except Exception as e:
        problems.append(f"{path}: not valid JSON ({e})")
        return
    if not isinstance(d, dict):
        problems.append(f"{path}: top level must be an object")
        return

    for k in REQUIRED_TOP_KEYS:
        if k not in d:
            problems.append(f"{path}: missing required key '{k}'")
    if d.get("date") != day:
        problems.append(f"{path}: date field '{d.get('date')}' != expected {day}")

    for k in STR_FIELDS_TOP:
        check_str_field(k, d.get(k), problems)

    srcs = d.get("sources")
    if srcs is None:
        return
    if not isinstance(srcs, list):
        problems.append(f"{path}: 'sources' must be a list")
        return
    for i, s in enumerate(srcs):
        if not isinstance(s, dict):
            problems.append(f"{path}: sources[{i}] must be an object")
            continue
        if not isinstance(s.get("platform"), str) or not s.get("platform"):
            problems.append(f"{path}: sources[{i}].platform missing/invalid")
        items = s.get("items")
        if items is None:
            continue
        if not isinstance(items, list):
            problems.append(f"{path}: sources[{i}].items must be a list")
            continue
        if len(items) > MAX_ITEMS_PER_SOURCE:
            problems.append(f"{path}: sources[{i}] has {len(items)} items, over the {MAX_ITEMS_PER_SOURCE} cap")
        for j, it in enumerate(items):
            if not isinstance(it, dict):
                problems.append(f"{path}: sources[{i}].items[{j}] must be an object")
                continue
            for f in ITEM_REQUIRED:
                v = it.get(f)
                if not isinstance(v, str) or not v.strip():
                    problems.append(f"{path}: sources[{i}].items[{j}].{f} missing/invalid")
            for f in ITEM_STR_FIELDS:
                check_str_field(f"sources[{i}].items[{j}].{f}", it.get(f), problems)


def main(argv):
    if len(argv) != 3:
        print("usage: validate-artifact.py <artifact_dir> <DAY>")
        return 1
    artifact_dir, day = argv[1], argv[2]
    if not DAY_RE.match(day):
        print(f"  ✗ bad DAY argument: {day}")
        return 1
    if not os.path.isdir(artifact_dir):
        print(f"  ✗ artifact dir not found: {artifact_dir}")
        return 1

    print(f"每日情报 · artifact validation for {day}")
    problems = []
    check_allowlist(artifact_dir, day, problems)

    json_path = os.path.join(artifact_dir, "digests", f"{day}.json")
    if os.path.exists(json_path):
        check_size(json_path, MAX_JSON_BYTES, problems)
        check_schema(json_path, day, problems)

    img_dir = os.path.join(artifact_dir, "digests", "img")
    if os.path.isdir(img_dir):
        for name in os.listdir(img_dir):
            if name.startswith(f"{day}."):
                check_size(os.path.join(img_dir, name), MAX_IMG_BYTES, problems)

    if not problems:
        print(f"  ✓ artifact for {day} passes validation")
        return 0
    print(f"  ✗ artifact for {day} REJECTED — {len(problems)} problem(s):")
    for p in problems:
        print(f"     · {p}")
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
