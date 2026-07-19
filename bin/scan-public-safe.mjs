#!/usr/bin/env node
// scan-public-safe.mjs — the PUBLISH GATE for zen-digest-public.
//
// Scans a directory (recursively) for a denylist of tokens that must never
// appear in public output: the owner's name/handle, and phrases describing
// the owner's private workflow/setup/tooling. Exits non-zero and prints
// every offending file:line if anything is found. Exits 0 (silent success
// message only) when clean.
//
// Usage:
//   node bin/scan-public-safe.mjs <dir> [--extra "token1,token2"]
//
// Extra denylist tokens can also be supplied via the SCAN_PUBLIC_SAFE_EXTRA
// env var (comma-separated), so this stays a small, configurable list rather
// than a hardcoded wall.
//
// Dependency-free (Node core only).

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DENYLIST = [
  "Zen",
  "zenli",
  "主控",
  "子代理",
  "经理\\+子代理",
  "编辑部.*自建",
  "已代读",
  "已看完全文",
  "phone-use",
  "xhs-brief",
];

const SCAN_EXTENSIONS = /\.(md|mdx|json|html|txt)$/i;
const SKIP_DIRS = new Set(["node_modules", ".git", ".gitignore".slice(0, 0)]); // ".git" only

function usageAndExit() {
  console.error('Usage: node bin/scan-public-safe.mjs <dir> [--extra "token1,token2"]');
  process.exit(1);
}

const [, , dirArg, ...rest] = process.argv;
if (!dirArg) usageAndExit();

let extra = [];
const extraIdx = rest.indexOf("--extra");
if (extraIdx !== -1 && rest[extraIdx + 1]) {
  extra.push(...rest[extraIdx + 1].split(",").map((s) => s.trim()).filter(Boolean));
}
if (process.env.SCAN_PUBLIC_SAFE_EXTRA) {
  extra.push(...process.env.SCAN_PUBLIC_SAFE_EXTRA.split(",").map((s) => s.trim()).filter(Boolean));
}

const denylist = [...DEFAULT_DENYLIST, ...extra];
const patterns = denylist.map((tok) => ({ tok, re: new RegExp(tok, "gi") }));

const root = path.resolve(dirArg);
if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
  console.error(`scan-public-safe: no such directory ${root}`);
  process.exit(1);
}

function walk(dir, files) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, files);
    } else if (SCAN_EXTENSIONS.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

const files = walk(root, []);
let offenses = 0;

for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    for (const { tok, re } of patterns) {
      re.lastIndex = 0;
      if (re.test(line)) {
        console.error(
          `${path.relative(root, file)}:${i + 1}: denylist token "${tok}" — ${line.trim()}`
        );
        offenses++;
      }
    }
  });
}

if (offenses > 0) {
  console.error(`\nscan-public-safe: FAILED — ${offenses} offending line(s) in ${root}`);
  process.exit(1);
}

console.log(
  `scan-public-safe: CLEAN — ${files.length} file(s) scanned in ${root}, denylist size ${denylist.length}`
);
process.exit(0);
