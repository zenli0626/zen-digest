#!/usr/bin/env node
// Send tonight's 每日情报 issue to subscribers via Resend.
// Dependency-free: Node global fetch only.
//
// Usage: node bin/send-newsletter.mjs <digest.json> [broadsheet.png]
// Env: SUPABASE_URL, SUPABASE_SERVICE_KEY, RESEND_API_KEY, NEWSLETTER_FROM
//
// If RESEND_API_KEY is unset, this is a deliberate no-op (exit 0) so the send
// step stays wired into ci-publish.sh but does nothing until Resend is
// provisioned.

const SITE_URL = 'https://mrqb.space';

// Single-recipient send via Resend's non-batch endpoint, used as a fallback when a batch
// gets rejected (e.g. one bad address in an otherwise-good chunk). Returns true on success.
async function sendOne(email) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(email),
    });
    if (r.ok) return true;
    const text = await r.text().catch(() => '');
    console.error(`[send-newsletter] send failed for ${email.to} (${r.status}): ${text}`);
    return false;
  } catch (err) {
    console.error(`[send-newsletter] send error for ${email.to}:`, err.message);
    return false;
  }
}

async function main() {
  const [, , digestPath] = process.argv;
  if (!digestPath) {
    console.error('usage: node bin/send-newsletter.mjs <digest.json> [broadsheet.png]');
    process.exit(1);
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    console.log('no RESEND key, skipping send');
    return;
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const NEWSLETTER_FROM = process.env.NEWSLETTER_FROM;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !NEWSLETTER_FROM) {
    console.error('missing SUPABASE_URL / SUPABASE_SERVICE_KEY / NEWSLETTER_FROM — skipping send');
    return;
  }

  const fs = await import('node:fs');
  let digest;
  try {
    digest = JSON.parse(fs.readFileSync(digestPath, 'utf8'));
  } catch (err) {
    console.error(`could not read/parse ${digestPath}:`, err.message);
    process.exit(1);
  }

  // 1) Pull active subscribers.
  let subscribers;
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/subscribers?status=eq.active&select=email,lang,ref_code`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
      }
    );
    if (!r.ok) throw new Error(`supabase ${r.status}: ${await r.text()}`);
    subscribers = await r.json();
  } catch (err) {
    console.error('failed to fetch subscribers:', err.message);
    process.exit(1);
  }

  if (!subscribers.length) {
    console.log('no active subscribers, nothing to send');
    return;
  }
  console.log(`sending to ${subscribers.length} subscriber(s)`);

  // 2) Build the email body per language variant, then substitute the
  //    per-recipient unsubscribe link.
  const bodyZh = buildBody(digest, 'zh');
  const bodyEn = buildBody(digest, 'en');
  const bodyBoth = buildBody(digest, 'both');
  const subjectZh = `每日情报 · ${digest.date} · ${digest.banner || ''}`.trim();
  const subjectEn = `Daily Intel · ${digest.date}`;

  let sent = 0, failed = 0;

  // Resend batch endpoint: chunks of 100.
  const chunks = [];
  for (let i = 0; i < subscribers.length; i += 100) chunks.push(subscribers.slice(i, i + 100));

  for (const chunk of chunks) {
    const emails = chunk.map((sub) => {
      const unsubUrl = `${SITE_URL}/api/unsubscribe?token=${encodeURIComponent(sub.ref_code || '')}`;
      const html = (sub.lang === 'zh' ? bodyZh : sub.lang === 'en' ? bodyEn : bodyBoth)
        .replace('{{UNSUB_URL}}', unsubUrl);
      const subject = sub.lang === 'en' ? subjectEn : subjectZh;
      return {
        from: NEWSLETTER_FROM,
        to: sub.email,
        subject,
        html,
      };
    });

    try {
      const r = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(emails),
      });
      if (r.ok) {
        sent += emails.length;
      } else {
        // The batch endpoint validates every recipient before sending any of them, so one
        // bad address (e.g. a stray @example.com test row) zeroes out the whole chunk.
        // Fall back to sending this chunk one at a time so the good addresses still go out.
        const text = await r.text().catch(() => '');
        console.error(`[send-newsletter] batch failed (${r.status}): ${text} — retrying chunk individually`);
        const results = await Promise.all(emails.map((email) => sendOne(email)));
        sent += results.filter(Boolean).length;
        failed += results.filter((ok) => !ok).length;
      }
    } catch (err) {
      console.error('[send-newsletter] batch error:', err.message, '— retrying chunk individually');
      const results = await Promise.all(emails.map((email) => sendOne(email)));
      sent += results.filter(Boolean).length;
      failed += results.filter((ok) => !ok).length;
    }
  }

  console.log(`done: sent=${sent} failed=${failed}`);
}

// Build a simple, inline-styled bilingual (or single-language) HTML email
// from the digest JSON: masthead line, banner/headline, the 3 今日可行动
// actions, a read-full-edition button, and an unsubscribe footer.
function buildBody(digest, lang) {
  const T = (o, k) => {
    if (lang === 'en') return o?.[k + '_en'] ?? o?.[k] ?? '';
    if (lang === 'zh') return o?.[k] ?? '';
    // both: prefer zh with en as a secondary line where available
    return o?.[k] ?? '';
  };
  const esc = (s) => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const showZh = lang !== 'en';
  const showEn = lang !== 'zh';

  const banner = digest.banner || '';
  const bannerEn = digest.banner_en || '';

  const actionsHtml = (digest.actions || []).slice(0, 3).map((a, i) => {
    const zh = esc(a.text);
    const en = esc(a.text_en || '');
    return `<tr><td style="padding:8px 0;border-top:1px dotted #c9c2b1;font-family:Georgia,serif;font-size:14px;color:#17150f;">
      <b style="color:#d5111e;">${i + 1}.</b>
      ${showZh ? `<div>${zh}</div>` : ''}
      ${showEn && en ? `<div style="color:#3e3a31;font-size:13px;margin-top:2px;">${en}</div>` : ''}
    </td></tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#fbfaf6;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fbfaf6;padding:24px 0;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #17150f;max-width:600px;width:100%;">
  <tr><td style="background:#d5111e;color:#fdf6ec;padding:8px 18px;font-family:Arial,sans-serif;font-weight:bold;font-size:12px;letter-spacing:2px;">
    每日情报 · AI 编辑部 · ${esc(digest.date)}
  </td></tr>
  <tr><td style="padding:20px 22px 8px;">
    ${showZh && banner ? `<div style="font-family:Arial,sans-serif;font-weight:900;font-size:22px;color:#d5111e;line-height:1.3;">${esc(banner)}</div>` : ''}
    ${showEn && bannerEn ? `<div style="font-family:Arial,sans-serif;font-weight:700;font-size:15px;color:#3e3a31;margin-top:4px;">${esc(bannerEn)}</div>` : ''}
  </td></tr>
  <tr><td style="padding:6px 22px 4px;">
    <div style="font-family:Arial,sans-serif;font-weight:900;font-size:13px;letter-spacing:2px;color:#17150f;border-bottom:1px solid #17150f;padding-bottom:6px;">
      ${showZh ? '今日可行动' : ''}${showZh && showEn ? ' · ' : ''}${showEn ? 'DO THESE TODAY' : ''}
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${actionsHtml}</table>
  </td></tr>
  <tr><td style="padding:18px 22px 22px;" align="center">
    <a href="${SITE_URL}" style="display:inline-block;background:#d5111e;color:#fdf6ec;text-decoration:none;font-family:Arial,sans-serif;font-weight:bold;font-size:13px;letter-spacing:1px;padding:10px 22px;">
      ${showZh ? '读全文' : ''}${showZh && showEn ? ' / ' : ''}${showEn ? 'Read the full edition →' : ''}
    </a>
  </td></tr>
  <tr><td style="padding:14px 22px;border-top:1px solid #c9c2b1;font-family:Arial,sans-serif;font-size:11px;color:#8b8577;text-align:center;">
    ${SITE_URL} ·
    <a href="{{UNSUB_URL}}" style="color:#8b8577;">${showEn && !showZh ? 'unsubscribe' : '退订 / unsubscribe'}</a>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

main().catch((err) => {
  console.error('[send-newsletter] fatal:', err);
  process.exit(1);
});
