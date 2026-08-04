#!/usr/bin/env node
// Generate feed.xml (RSS 2.0), sitemap.xml, and robots.txt for 每日情报 (mrqb.space) —
// so search engines and feed readers have something other than a 404 to find.
// Dependency-free: Node fs only. Reads digests/index.json + the last ~20 issues.
//
// Usage: node bin/gen-feed.mjs
// Wired into every publish (bin/ci-publish.sh + bin/publish.sh) so the feed/sitemap
// always reflect the latest issue.

import fs from 'node:fs';

const SITE_URL = 'https://mrqb.space';
const FEED_ITEMS = 20;

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function cdata(s) {
  return `<![CDATA[${String(s ?? '').replace(/]]>/g, ']]&gt;')}]]>`;
}

function rfc822(dateStr) {
  // Issues publish ~21:00 America/New_York; use that as the nominal pubDate.
  const d = new Date(`${dateStr}T21:00:00-04:00`);
  return isNaN(d) ? new Date(`${dateStr}T00:00:00Z`).toUTCString() : d.toUTCString();
}

function loadIndex() {
  const idx = JSON.parse(fs.readFileSync('digests/index.json', 'utf8'));
  return [...idx].sort().reverse(); // newest first
}

function loadDigest(day) {
  try {
    return JSON.parse(fs.readFileSync(`digests/${day}.json`, 'utf8'));
  } catch {
    return null;
  }
}

function buildFeed(days) {
  const items = days.slice(0, FEED_ITEMS).map((day) => {
    const d = loadDigest(day);
    if (!d) return '';
    const title = d.banner || `每日情报 · ${day}`;
    const desc = d.meta_read || d.banner_en || '';
    const link = `${SITE_URL}/?d=${day}`;
    return `  <item>
    <title>${esc(title)}</title>
    <link>${esc(link)}</link>
    <guid isPermaLink="true">${esc(link)}</guid>
    <pubDate>${rfc822(day)}</pubDate>
    <description>${cdata(desc)}</description>
  </item>`;
  }).filter(Boolean).join('\n');

  const latest = days[0] ? rfc822(days[0]) : new Date().toUTCString();

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>每日情报 · Daily Intel Digest</title>
  <link>${SITE_URL}/</link>
  <description>An unattended AI newsroom's daily Chinese newspaper about AI.</description>
  <language>zh-CN</language>
  <lastBuildDate>${latest}</lastBuildDate>
${items}
</channel>
</rss>
`;
}

function buildSitemap(days) {
  const staticPages = ['/', '/archive.html', '/how-it-works.html'];
  const urls = [
    ...staticPages.map((p) => `  <url><loc>${SITE_URL}${p}</loc></url>`),
    ...days.map((day) => `  <url><loc>${SITE_URL}/?d=${day}</loc></url>`),
  ].join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

function buildRobots() {
  return `User-agent: *
Allow: /

Sitemap: ${SITE_URL}/sitemap.xml
`;
}

function main() {
  const days = loadIndex();
  fs.writeFileSync('feed.xml', buildFeed(days));
  fs.writeFileSync('sitemap.xml', buildSitemap(days));
  fs.writeFileSync('robots.txt', buildRobots());
  console.log(`gen-feed: wrote feed.xml (${Math.min(days.length, FEED_ITEMS)} items), sitemap.xml (${days.length} issues), robots.txt`);
}

main();
