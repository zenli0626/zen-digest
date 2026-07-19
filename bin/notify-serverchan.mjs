// Push the daily 每日情报 to Zen's PERSONAL WeChat via Server酱 (方糖 / sctapi.ftqq.com).
// Personal WeChat has no official bot API, so Server酱 is the honest relay: we POST a
// title + markdown body and it delivers as a WeChat service-account message. The full
// broadsheet is large, so WeChat gets a summary card (headline + actions + front-page
// photo + a link to mrqb.space); Telegram still carries the full-res PNG.
//
// Dependency-free (global fetch). No-ops quietly if SERVERCHAN_SENDKEY is unset.
// Usage:
//   node bin/notify-serverchan.mjs paper  <digest.json>
//   node bin/notify-serverchan.mjs status "<message>"
import { readFileSync } from 'node:fs';

const KEY = process.env.SERVERCHAN_SENDKEY;
const [mode, arg] = process.argv.slice(2);

if (!KEY) { console.log('serverchan: no SENDKEY — skipping'); process.exit(0); }

function build() {
  if (mode === 'status') {
    return { title: '每日情报 · 通知', desp: String(arg || '') };
  }
  // paper mode: compose a summary card from the digest JSON
  const d = JSON.parse(readFileSync(arg, 'utf8'));
  const day = d.date || '';
  const img = d.image?.src ? `https://mrqb.space/${d.image.src}` : '';
  const actions = (d.actions || [])
    .map(a => (typeof a === 'string' ? a : a.text))
    .filter(Boolean)
    .slice(0, 3)
    .map((t, i) => `${i + 1}. ${t}`)
    .join('\n\n');

  const desp = [
    `### ${d.banner || '每日情报'}`,
    img ? `![头版要图](${img})` : '',
    '**✅ 今日可行动**',
    actions || '（见全文）',
    `\n📖 读全文 / 完整长图 → https://mrqb.space`,
  ].filter(Boolean).join('\n\n');

  // Server酱 title max ~32 chars — keep it short, headline lives in desp.
  return { title: `🗞 每日情报 · ${day}`, desp };
}

const { title, desp } = build();

try {
  const r = await fetch(`https://sctapi.ftqq.com/${KEY}.send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ title, desp }).toString(),
  });
  const j = await r.json().catch(() => ({}));
  console.log('serverchan:', j.code === 0 ? 'sent' : `failed (${j.code}: ${j.message || 'unknown'})`);
} catch (err) {
  console.log('serverchan: send failed (non-fatal):', err.message);
}
