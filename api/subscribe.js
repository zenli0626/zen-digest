// POST /api/subscribe — add an email to the 每日情报 subscribers list.
// Dependency-free Vercel Node function: uses only global fetch (Node 18+).
// Env: SUPABASE_URL, SUPABASE_SERVICE_KEY.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method not allowed' });
    return;
  }

  let body = req.body;
  if (!body || typeof body === 'string') {
    try { body = JSON.parse(body || '{}'); } catch { body = {}; }
  }
  const { email, lang, hp } = body || {};

  // Honeypot: bots fill hidden fields. Pretend success, don't insert.
  if (hp) {
    res.status(200).json({ ok: true });
    return;
  }

  if (typeof email !== 'string' || !EMAIL_RE.test(email)) {
    res.status(400).json({ ok: false, error: 'invalid email' });
    return;
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    res.status(500).json({ ok: false, error: 'server not configured' });
    return;
  }

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/subscribers`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ email, lang: lang || 'both' }),
    });

    if (r.status === 409) {
      res.status(200).json({ ok: true, already: true });
      return;
    }
    if (!r.ok) {
      // Supabase also reports duplicate-key violations as 400/422 with a Postgres error code.
      const text = await r.text().catch(() => '');
      if (text.includes('duplicate key') || text.includes('23505')) {
        res.status(200).json({ ok: true, already: true });
        return;
      }
      console.error('[subscribe] supabase error', r.status, text);
      res.status(500).json({ ok: false });
      return;
    }
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[subscribe] error', err);
    res.status(500).json({ ok: false });
  }
};
