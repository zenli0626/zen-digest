#!/usr/bin/env node
// Assign a stable issue_no to the digest for ONE day, as part of every publish
// (bin/ci-publish.sh + bin/publish.sh). issue_no must never be recomputed from the
// archive's current shape — it's what makes the issue number stable when an older
// date gets backfilled later (backfilling 2026-08-02/08-03 previously renumbered all
// of history, because the frontend derived the number from array position). This
// script only ever writes to the one file for `day`, and only if it doesn't already
// have a valid issue_no — it takes max(every other digest's issue_no) + 1.
//
// For the one-off fix of the 19 pre-issue_no issues already in the archive, see
// bin/backfill-issue-no.mjs instead (assigns 1..N by chronological date, once).
//
// Usage: node bin/assign-issue-no.mjs <YYYY-MM-DD>
import fs from 'node:fs';
import path from 'node:path';

const [, , day] = process.argv;
if (!day) {
  console.error('usage: assign-issue-no.mjs <YYYY-MM-DD>');
  process.exit(1);
}

// Detect the file's own indent width (the archive isn't consistent — some issues use
// 2 spaces, at least one uses 1) so a one-field edit doesn't reformat the whole file.
function detectIndent(raw) {
  const m = raw.match(/^\{\r?\n( +)"/);
  return m ? m[1].length : 2;
}

const file = `digests/${day}.json`;
if (!fs.existsSync(file)) {
  console.error(`assign-issue-no: ${file} not found`);
  process.exit(1);
}
const raw = fs.readFileSync(file, 'utf8');
const indent = detectIndent(raw);
const trailingNewline = raw.endsWith('\n');
const digest = JSON.parse(raw);

if (Number.isInteger(digest.issue_no) && digest.issue_no > 0) {
  console.log(`assign-issue-no: ${file} already has issue_no=${digest.issue_no}, leaving as-is`);
  process.exit(0);
}

let maxNo = 0;
for (const name of fs.readdirSync('digests')) {
  if (!/^\d{4}-\d{2}-\d{2}\.json$/.test(name) || name === `${day}.json`) continue;
  try {
    const other = JSON.parse(fs.readFileSync(path.join('digests', name), 'utf8'));
    if (Number.isInteger(other.issue_no) && other.issue_no > maxNo) maxNo = other.issue_no;
  } catch {
    // ignore unparsable neighbours — this is a best-effort max, not a validator
  }
}

digest.issue_no = maxNo + 1;
const out = JSON.stringify(digest, null, indent) + (trailingNewline ? '\n' : '');
fs.writeFileSync(file, out);
console.log(`assign-issue-no: ${file} → issue_no=${digest.issue_no}`);
