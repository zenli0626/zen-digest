# 每日情报 — cloud automation (truly hands-off)

The nightly issue is built **in the cloud** (GitHub Actions), so it no longer needs Zen's
laptop to be awake. Flow:

```
GitHub Actions cron (~21:00 ET nightly)
  └─ Claude Code headless runs /daily-digest (YouTube + 文摘 lanes; no browser)
       └─ writes digests/<date>.json + index.json
  └─ bin/ci-publish.sh
       ├─ diversity gate (validate-digest.py)   ── fail → hold, 🔴 Telegram
       ├─ quality self-check (quality-check.py)
       │     PASS → vercel --prod  → live on mrqb.space → 🟢 Telegram
       │     FAIL → vercel preview → held for review     → 🟡 Telegram (you promote)
       └─ commits the issue back to main
```

Deploys go through the **Vercel token in the workflow**, NOT Vercel's git integration — so
prod is only ever touched when the quality bar passes. Manual `workflow_dispatch` ("Run
workflow" button) runs it on demand for testing.

## One-time setup — add 4 repo secrets
`gh secret set <NAME> -R <owner>/zen-digest` (or GitHub → Settings → Secrets → Actions):

| Secret | Where to get it |
|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com → API keys. Nightly Claude usage bills to this key. |
| `VERCEL_TOKEN` | vercel.com/account/tokens → create a token with access to the team that owns `zen-digest`. |
| `TELEGRAM_BOT_TOKEN` | reuse your existing bot from `~/.config/overnight/telegram.json`. |
| `TELEGRAM_CHAT_ID` | the chat id from that same file. |

Then trigger a **shakedown run** (Actions → daily-digest → Run workflow) and watch it.

## Known caveats
- **YouTube in CI:** datacenter IPs are sometimes rate-limited by YouTube, so a nightly run
  may occasionally get fewer transcripts. The 文摘 (RSS) lane is not IP-sensitive and keeps
  the issue diverse. If YouTube gets blocked often, split Hacker News into its own platform
  lane so newsletters + HN alone clear the 2-platform gate without YouTube.
- **OTA is publish-only in the cloud.** The "your Claude Code learns and compounds" upgrade
  edits your laptop's `~/.claude`, which CI can't reach. Cloud runs instead **queue** the
  proposed upgrade in `ota-ledger.md` (marked "proposed (cloud)"); your laptop Claude adopts
  it on the next local session. The daily *publish* is fully automated; the self-improvement
  stays laptop-adopted.
- **Skill copy drift.** `.claude/skills/daily-digest/SKILL.md` here is a snapshot of the
  laptop skill. When you change the laptop skill, re-copy it here (or the cloud runs the old
  version).
- **DST:** GitHub cron is UTC-only; `0 1 * * *` ≈ 21:00 EDT and ≈ 20:00 EST. Adjust the cron
  if the winter hour matters.
