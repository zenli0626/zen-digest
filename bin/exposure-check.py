#!/usr/bin/env python3
"""Local blast-radius check for a platform-breach / poisoned-package digest item.

A supply-chain story (malicious npm/PyPI release, compromised Docker image) is
newsworthy on its own, but SKILL.md's rule is to give it a verdict, not hand
Zen a vague "you should check this" action. This answers the one checkable
question: does any manifest Zen's own machine can see actually reference the
named package, and is a matching version installed locally right now.

Usage:
  exposure-check.py <package> [<affected-version>]

Scans requirements*.txt / pyproject.toml / Pipfile / poetry.lock / package.json
/ package-lock.json / yarn.lock / pnpm-lock.yaml under ~/Claude, ~/BY-Website,
~/zen-digest (the repo roots named in CLAUDE.md) for the package name, and
checks `pip show` / `npm ls -g` for a locally installed copy. Prints a verdict
line first, manifest hits after. Read-only — makes no changes.

Some vulnerable libraries (e.g. Brotli, zlib) ship compiled INTO the Node.js
binary itself rather than as an npm package — `npm ls -g` and a package.json
grep both miss them, because there is no "brotli" dependency to find even
though every Node process on the machine links the vulnerable decoder. For
names in RUNTIME_EMBEDDED, also check `process.versions.<key>` on whatever
`node` is on PATH. Confirmed 2026-10-25: a CVE-2026-111497 (Broccoli2Shell)
check for "Brotli" found the vulnerable pip package but, before this fix,
would have silently cleared the machine's Node 26.0.0 (also vulnerable,
patched at 26.12.1) because Node ships no brotli *npm* package to find.
"""
from __future__ import annotations

import os
import re
import subprocess
import sys
from pathlib import Path

MANIFEST_NAMES = {
    "pyproject.toml", "Pipfile", "poetry.lock",
    "package.json", "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
}
MANIFEST_PREFIXES = ("requirements",)
ROOTS = [Path.home() / "Claude", Path.home() / "BY-Website", Path.home() / "zen-digest"]
SKIP_DIRS = {"node_modules", ".git", "venv", ".venv", "__pycache__", ".next", "dist", "build"}
RUNTIME_EMBEDDED = {"brotli": "brotli", "zlib": "zlib", "openssl": "openssl", "icu": "icu"}


def node_runtime_version(package: str) -> str | None:
    key = RUNTIME_EMBEDDED.get(package.lower())
    if not key:
        return None
    try:
        out = subprocess.run(
            ["node", "-e", f"process.stdout.write(process.version + ' ' + (process.versions['{key}'] || ''))"],
            capture_output=True, text=True, timeout=10,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    return out.stdout.strip() if out.returncode == 0 and out.stdout.strip() else None


def find_manifest_hits(package: str) -> list[str]:
    hits = []
    pattern = re.compile(re.escape(package), re.IGNORECASE)
    for root in ROOTS:
        if not root.is_dir():
            continue
        for dirpath, dirnames, filenames in os.walk(root):
            dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
            for fn in filenames:
                if fn not in MANIFEST_NAMES and not fn.startswith(MANIFEST_PREFIXES):
                    continue
                path = Path(dirpath) / fn
                try:
                    text = path.read_text(errors="ignore")
                except OSError:
                    continue
                if pattern.search(text):
                    hits.append(str(path))
    return hits


def installed_version(package: str) -> str | None:
    for cmd in (["pip3", "show", package], ["pip", "show", package]):
        try:
            out = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        except (OSError, subprocess.TimeoutExpired):
            continue
        if out.returncode == 0:
            m = re.search(r"^Version:\s*(.+)$", out.stdout, re.MULTILINE)
            return m.group(1).strip() if m else "installed (version unknown)"
    try:
        out = subprocess.run(["npm", "ls", "-g", package], capture_output=True, text=True, timeout=10)
        if package in out.stdout:
            return out.stdout.strip().splitlines()[-1]
    except (OSError, subprocess.TimeoutExpired):
        pass
    return None


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    package = sys.argv[1]
    affected_version = sys.argv[2] if len(sys.argv) > 2 else None

    hits = find_manifest_hits(package)
    version = installed_version(package)
    runtime = node_runtime_version(package)

    exposed = bool(hits) or bool(version) or bool(runtime)
    print(f"package: {package}" + (f"  affected_version={affected_version}" if affected_version else ""))
    if version:
        flag = " <-- MATCHES AFFECTED VERSION" if affected_version and affected_version in version else ""
        print(f"  installed locally: {version}{flag}")
    else:
        print("  installed locally: not found (pip/npm global)")
    if runtime:
        node_ver, embedded_ver = runtime.split(" ", 1) if " " in runtime else (runtime, "")
        flag = " <-- MATCHES AFFECTED VERSION" if affected_version and embedded_ver and affected_version in embedded_ver else ""
        print(f"  embedded in local Node runtime ({node_ver}): {embedded_ver}{flag}")
    if hits:
        print(f"  referenced in {len(hits)} local manifest(s):")
        for h in hits:
            print(f"    - {h}")
    else:
        print("  no reference in ~/Claude, ~/BY-Website, ~/zen-digest manifests")

    print()
    print("VERDICT: " + ("local exposure found, see above" if exposed else "no local exposure found"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
