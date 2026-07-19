// GET /api/unsubscribe?token=<ref_code> — mark a subscriber unsubscribed and show a
// small bilingual confirmation page matching the paper's look.
// Env: SUPABASE_URL, SUPABASE_SERVICE_KEY.

function page({ title, heading, body }) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@500;700;900&family=Noto+Sans+SC:wght@700;900&display=swap" rel="stylesheet">
<style>
  :root { --news:#fbfaf6; --ink:#17150f; --ink-2:#3e3a31; --red:#d5111e; --serif:"Noto Serif SC","Songti SC",serif; --hei:"Noto Sans SC","PingFang SC",sans-serif; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:var(--serif); background:var(--news); color:var(--ink); display:flex; align-items:center; justify-content:center; min-height:100vh; padding:24px; }
  .card { max-width:440px; width:100%; border:1.5px solid var(--ink); background:#fff; padding:28px 26px 22px; box-shadow:2px 3px 0 rgba(23,21,15,.12); text-align:center; }
  h1 { font-family:var(--hei); font-weight:900; color:var(--red); font-size:22px; letter-spacing:2px; margin-bottom:14px; }
  p { font-size:14px; line-height:1.9; color:var(--ink-2); margin-bottom:8px; }
  a.back { display:inline-block; margin-top:14px; font-family:var(--hei); font-weight:700; font-size:12.5px; color:var(--red); text-decoration:none; border-bottom:1px dashed var(--red); }
</style>
</head>
<body>
  <div class="card">
    <h1>${heading}</h1>
    ${body}
    <a class="back" href="/">《每日情报》 mrqb.space →</a>
  </div>
</body>
</html>`;
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  if (req.method !== 'GET') {
    res.status(405).send(page({
      title: '每日情报 · 退订',
      heading: '⚠ 405',
      body: '<p>Method not allowed.</p>',
    }));
    return;
  }

  const url = new URL(req.url, 'http://localhost');
  const token = url.searchParams.get('token');

  if (!token) {
    res.status(400).send(page({
      title: '每日情报 · 退订',
      heading: '⚠ 缺少参数',
      body: '<p>退订链接缺少 token。<br>The unsubscribe link is missing a token.</p>',
    }));
    return;
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    res.status(500).send(page({
      title: '每日情报 · 退订',
      heading: '⚠ 出错了',
      body: '<p>服务器未配置。<br>Server not configured.</p>',
    }));
    return;
  }

  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/subscribers?ref_code=eq.${encodeURIComponent(token)}`,
      {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify({ status: 'unsubscribed' }),
      }
    );

    if (!r.ok) {
      console.error('[unsubscribe] supabase error', r.status, await r.text().catch(() => ''));
      res.status(500).send(page({
        title: '每日情报 · 退订',
        heading: '⚠ 出错了',
        body: '<p>退订失败，请稍后再试。<br>Something went wrong — try again later.</p>',
      }));
      return;
    }

    const rows = await r.json().catch(() => []);
    if (!Array.isArray(rows) || rows.length === 0) {
      res.status(404).send(page({
        title: '每日情报 · 退订',
        heading: '⚠ 未找到订阅',
        body: '<p>这个链接无效或已经退订过了。<br>This link is invalid or already unsubscribed.</p>',
      }));
      return;
    }

    res.status(200).send(page({
      title: '每日情报 · 已退订',
      heading: '✓ 已退订',
      body: '<p>你已成功退订《每日情报》，不会再收到邮件。<br>You have been unsubscribed — no more emails from us.</p>',
    }));
  } catch (err) {
    console.error('[unsubscribe] error', err);
    res.status(500).send(page({
      title: '每日情报 · 退订',
      heading: '⚠ 出错了',
      body: '<p>退订失败，请稍后再试。<br>Something went wrong — try again later.</p>',
    }));
  }
};
