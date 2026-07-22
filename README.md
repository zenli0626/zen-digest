# 每日情报 · Daily Intel Digest

An unattended AI newsroom that publishes a daily Chinese newspaper about AI —
live at **[mrqb.space](https://mrqb.space)**. Every night it sweeps YouTube
long-form videos, newsletters, Hacker News (and optionally X / 小红书), deep-reads
everything, debates what's worth your time, writes a broadsheet-style issue,
polishes the Chinese with DeepSeek, gates it for quality, and ships to prod —
no human in the loop unless the quality bar fails.

How it works, as a story + flowchart: [mrqb.space/how-it-works.html](https://mrqb.space/how-it-works.html)

## Architecture

- **Generate** — GitHub Actions (nightly cron) runs headless Claude Code with
  `automation/ci-prompt.txt`; the skill in `.claude/skills/daily-digest/` is the
  full editorial playbook. Output: `digests/YYYY-MM-DD.json` (+ hero image).
- **Polish** — `bin/polish-zh.mjs` rewrites all Chinese prose to native
  editorial register via DeepSeek (`deepseek-chat`). `bin/polish-zh-html.mjs`
  does the same for static-page copy.
- **Gate & publish** — `bin/ci-publish.sh`: diversity gate (≥2 source
  platforms) → quality self-check → prod deploy on pass, held preview +
  Telegram ping on fail. Local equivalent: `bin/publish.sh`.
- **Render** — `index.html` is a static page that hydrates from the JSON;
  `bin/render-broadsheet.mjs` exports the shareable front-page PNG.

## Run your own

1. Fork, then create a Vercel project for the repo (deploys are CLI-driven via
   `VERCEL_TOKEN`; the repo is not git-connected to Vercel).
2. Set GitHub Actions secrets:
   - `ANTHROPIC_API_KEY` — the AI newsroom (required)
   - `VERCEL_TOKEN` — deploys (required)
   - `DEEPSEEK_API_KEY` — native-Chinese polish (recommended; skipped if absent)
   - `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` — nightly paper to your phone (optional)
   - `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`, `RESEND_API_KEY` +
     `NEWSLETTER_FROM`, `SERVERCHAN_SENDKEY` — email/微信 subscription lanes (optional)
3. Edit `sources/` and the skill prompt to taste (your channels, newsletters,
   language, editorial voice).
4. Enable the `daily-digest` workflow (`.github/workflows/daily-digest.yml`) —
   or run locally: `bin/run-digest.sh` then `bin/publish.sh`.

Costs roughly: one headless Claude Code session/night + ~half a US cent of
DeepSeek per issue. Everything else is free tiers.

## License

MIT — build your own paper.
