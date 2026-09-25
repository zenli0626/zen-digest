#!/usr/bin/env node
/**
 * Lane triage for the daily-digest sweep — one command, one verdict per lane.
 *
 * The recurring failure this exists to prevent: an empty lane and a dead lane
 * look identical from the parse side. Nine roster YouTube channels returning
 * nothing reads as "the channels were quiet today" unless something else in
 * the same domain is fetched and also comes back empty. Two ledger entries
 * already codified the manual version of this (2026-09-21: check the status
 * code before parsing; 2026-09-24: fire the same request at a known-active
 * control target before writing the empty result down). This is that habit as
 * a command, so the next run does not have to remember to do it.
 *
 * Usage:
 *   node bin/sweep-lanes.mjs              # triage every lane
 *   node bin/sweep-lanes.mjs youtube      # one lane
 *   node bin/sweep-lanes.mjs --json       # machine-readable
 *
 * Verdicts:
 *   LIVE    2xx with entries            — usable, sweep it
 *   EMPTY   2xx with zero entries       — the source really has nothing new
 *   DOWN    4xx/5xx on every target     — the path is broken, do NOT report
 *                                          "no news", report the lane as dead
 *   BLOCKED 403/429 with a challenge     — bot wall, needs a fallback or skip
 *   ERROR   transport/DNS/timeout        — same handling as DOWN
 *
 * Exit 0 when every lane is LIVE or EMPTY (trustworthy sweep), exit 1 when any
 * lane is DOWN/BLOCKED/ERROR (the run must say so rather than pad).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36';

// A channel known to publish constantly. If this is empty too, the whole
// youtube.com/feeds path is down, not the nine channels in the roster.
const YT_CONTROL = ['UCX6OQ3DkcsbYNE6H8uQQuVA', 'UC_x5XG1OV2P6uZZ5FSM9Ttw'];
// A live blog outside the roster, as a control for the whole text lane.
const TEXT_CONTROL = ['https://simonwillison.net/atom/everything/'];

// Atom uses <entry>, RSS uses <item>; a lane is not EMPTY just because it
// picked the other dialect. HN's roster entry points at its Algolia JSON API
// (the front-page HTML is a different, single-quoted shape and is not what the
// sweep reads), so that one counts hits.
const countEntries = (body, kind) => {
  if (kind === 'hn') {
    try { return (JSON.parse(body).hits || []).length; } catch { return 0; }
  }
  return (body.match(/<(entry|item)[ >]/g) || []).length;
};

async function probe(url) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 25000);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: ac.signal, redirect: 'follow' });
    const body = await r.text();
    return { status: r.status, body };
  } catch (e) {
    return { status: 0, body: '', error: e.name === 'AbortError' ? 'timeout' : String(e.cause?.code || e.message) };
  } finally {
    clearTimeout(t);
  }
}

function verdict({ status, body, error }, entryTag) {
  if (error || status === 0) return { v: 'ERROR', n: 0, note: error || 'transport' };
  if (status === 403 || status === 429) {
    const wall = /just a moment|cf-chl|challenge|cloudflare/i.test(body.slice(0, 4000));
    return { v: 'BLOCKED', n: 0, note: wall ? 'bot wall' : `HTTP ${status}` };
  }
  if (status < 200 || status >= 300) return { v: 'DOWN', n: 0, note: `HTTP ${status}` };
  const n = countEntries(body, entryTag);
  return n > 0 ? { v: 'LIVE', n, note: `${n} entries` } : { v: 'EMPTY', n: 0, note: '200, 0 entries' };
}

function rollUp(targets) {
  const vs = targets.map(t => t.verdict.v);
  if (vs.includes('LIVE')) return 'LIVE';
  if (vs.includes('EMPTY')) return 'EMPTY';
  if (vs.includes('BLOCKED')) return 'BLOCKED';
  if (vs.includes('DOWN')) return 'DOWN';
  return 'ERROR';
}

async function youtubeLane() {
  const { channels } = JSON.parse(readFileSync(join(ROOT, 'sources/youtube.json'), 'utf8'));
  const targets = [];
  for (const c of [...channels, ...YT_CONTROL.map(id => ({ handle: `control:${id}`, id }))]) {
    const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${c.id}`;
    targets.push({ name: c.handle, url, verdict: verdict(await probe(url), 'entry') });
  }
  targets.push({
    name: 'control:user=GoogleDevelopers',
    url: 'https://www.youtube.com/feeds/videos.xml?user=GoogleDevelopers',
    verdict: verdict(await probe('https://www.youtube.com/feeds/videos.xml?user=GoogleDevelopers'), 'entry'),
  });
  return { lane: 'youtube', verdict: rollUp(targets), targets };
}

async function textLane() {
  const { sources } = JSON.parse(readFileSync(join(ROOT, 'sources/text.json'), 'utf8'));
  // Probe the endpoint the sweep actually reads: HN's api field is Algolia,
  // everything else is its rss field. Probing s.url for HN would test the
  // front-page HTML the sweep never parses.
  const roster = sources.map(s => ({
    name: s.handle,
    url: s.api || s.rss || s.url,
    kind: /hn\.algolia|news\.ycombinator/.test(s.api || '') ? 'hn' : 'entry',
  }));
  const targets = [];
  for (const s of roster) {
    targets.push({ name: s.name, url: s.url, verdict: verdict(await probe(s.url), s.kind) });
  }
  targets.push({ name: 'control:simonwillison.net', url: TEXT_CONTROL[0], verdict: verdict(await probe(TEXT_CONTROL[0]), 'entry') });
  return { lane: 'text', verdict: rollUp(targets), targets };
}

const want = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null;
const asJson = process.argv.includes('--json');

const lanes = [];
if (!want || want === 'youtube') lanes.push(await youtubeLane());
if (!want || want === 'text') lanes.push(await textLane());

if (asJson) {
  console.log(JSON.stringify(lanes, null, 2));
} else {
  for (const l of lanes) {
    console.log(`\n${l.lane.toUpperCase()} — ${l.verdict}`);
    for (const t of l.targets) {
      console.log(`  ${t.verdict.v.padEnd(7)} ${String(t.verdict.note).padEnd(14)} ${t.name}`);
    }
  }
  console.log('\nReport a lane as "no news" only when its verdict is LIVE or EMPTY.');
}

process.exit(lanes.every(l => l.verdict === 'LIVE' || l.verdict === 'EMPTY') ? 0 : 1);
