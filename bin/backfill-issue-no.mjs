#!/usr/bin/env node
// ONE-OFF: assign issue_no = 1..N to every digests/*.json that doesn't already have
// one, in chronological order by date (oldest = 1). Run once to establish the
// baseline for the archive that predates issue_no; going forward, bin/assign-issue-no.mjs
// assigns each new day's number without touching this history.
//
// Usage: node bin/backfill-issue-no.mjs [--write]
//   (no args)  dry run — prints what would change
//   --write    actually writes the files

import fs from 'node:fs';

const WRITE = process.argv.includes('--write');

// The archive isn't consistently formatted (some issues use 2-space indent, at least
// one uses 1) — detect each file's own indent so this only touches the issue_no field,
// not the whole file's formatting.
function detectIndent(raw) {
  const m = raw.match(/^\{\r?\n( +)"/);
  return m ? m[1].length : 2;
}

const days = fs.readdirSync('digests')
  .filter((n) => /^\d{4}-\d{2}-\d{2}\.json$/.test(n))
  .map((n) => n.replace(/\.json$/, ''))
  .sort(); // chronological, oldest first

let n = 0;
for (const day of days) {
  n += 1;
  const file = `digests/${day}.json`;
  const raw = fs.readFileSync(file, 'utf8');
  const digest = JSON.parse(raw);
  if (Number.isInteger(digest.issue_no) && digest.issue_no > 0) {
    console.log(`${file}: already has issue_no=${digest.issue_no}, skipping (chronological slot would be ${n})`);
    continue;
  }
  console.log(`${file}: issue_no=${n}`);
  if (WRITE) {
    digest.issue_no = n;
    const indent = detectIndent(raw);
    const out = JSON.stringify(digest, null, indent) + (raw.endsWith('\n') ? '\n' : '');
    fs.writeFileSync(file, out);
  }
}

if (!WRITE) console.log('\ndry run — rerun with --write to apply');
