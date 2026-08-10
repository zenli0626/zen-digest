// Fetch today's top 10 trending GitHub repos (unfiltered — github.com/trending?since=daily,
// the same ranking GitHub itself shows: most stars gained in the last 24h).
// Dependency-free (global fetch + regex; no cheerio). Read-only, no auth needed.
// Usage:
//   node bin/fetch-github-trending.mjs            # prints JSON array to stdout
import { writeFileSync } from 'node:fs';

const URL = 'https://github.com/trending?since=daily';
const UA = 'Mozilla/5.0 (compatible; zen-digest/1.0; +https://mrqb.space)';

async function fetchTrending() {
  const res = await fetch(URL, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`github.com/trending HTTP ${res.status}`);
  const html = await res.text();

  const blocks = html.split('<article class="Box-row">').slice(1);
  const repos = [];
  for (const b of blocks) {
    const repoM = b.match(/href="\/([^"/]+)\/([^"]+)"\s+data-view-component="true"\s+class="Link"/);
    if (!repoM) continue;
    const [, owner, name] = repoM;
    const descM = b.match(/<p class="col-9 color-fg-muted my-1 tmp-pr-4">\s*([\s\S]*?)\s*<\/p>/);
    const langM = b.match(/itemprop="programmingLanguage">([^<]+)<\/span>/);
    const nums = [...b.matchAll(/Link--muted d-inline-block"><svg[\s\S]*?<\/svg>\s*([\d,]+)<\/a>/g)].map(m => m[1]);
    const todayM = b.match(/([\d,]+)\s+stars?\s+today/);
    repos.push({
      rank: repos.length + 1,
      name: `${owner}/${name}`,
      url: `https://github.com/${owner}/${name}`,
      description: (descM?.[1] ?? '').replace(/\s+/g, ' ').trim(),
      language: langM?.[1] ?? null,
      stars: nums[0] ? parseInt(nums[0].replace(/,/g, ''), 10) : null,
      stars_today: todayM?.[1] ? parseInt(todayM[1].replace(/,/g, ''), 10) : null,
    });
  }
  return repos.slice(0, 10);
}

const repos = await fetchTrending();
const out = process.argv[2];
if (out) {
  writeFileSync(out, JSON.stringify(repos, null, 2));
  console.error(`wrote ${repos.length} repos to ${out}`);
} else {
  console.log(JSON.stringify(repos, null, 2));
}
