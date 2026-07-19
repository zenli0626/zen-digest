// Render the 每日情报 front-page broadsheet PNG headlessly by driving the site's OWN
// "分享长图" export (html2canvas, .pdf-mode clone, QR) and capturing the download — so the
// nightly image is byte-for-byte the same as the manual export. Best-effort: any failure
// here must NOT break publishing (ci-publish.sh treats a missing PNG as "send text instead").
//
// Usage: NODE_PATH="$(npm root -g)" node bin/render-broadsheet.mjs <url> <out.png>
import { chromium } from 'playwright';

const [, , url, out] = process.argv;
if (!url || !out) { console.error('usage: render-broadsheet.mjs <url> <out.png>'); process.exit(2); }

const browser = await chromium.launch({ args: ['--no-sandbox'] });
try {
  const ctx = await browser.newContext({ acceptDownloads: true, deviceScaleFactor: 2, viewport: { width: 1200, height: 1400 } });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  // the issue renders via fetch — wait until the front page is actually populated
  await page.waitForSelector('.banner', { timeout: 30000 });
  await page.waitForSelector('.front-flow article, article', { timeout: 30000 });
  await page.waitForTimeout(1500);
  // click the site's own export button and capture the resulting download
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 90000 }),
    page.click('#dl-pdf'),
  ]);
  await download.saveAs(out);
  console.log('broadsheet saved:', out);
} finally {
  await browser.close();
}
