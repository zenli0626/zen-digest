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

    exposed = bool(hits) or bool(version)
    print(f"package: {package}" + (f"  affected_version={affected_version}" if affected_version else ""))
    if version:
        flag = " <-- MATCHES AFFECTED VERSION" if affected_version and affected_version in version else ""
        print(f"  installed locally: {version}{flag}")
    else:
        print("  installed locally: not found (pip/npm global)")
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
