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

## Which model runs the nightly (changed 2026-08-20)

The cloud nightly generates the issue with the **Claude Code harness running on the
DeepSeek API**, via DeepSeek's Anthropic-compatible endpoint
(`ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic`). The harness, the skill, the
sweep lanes and `automation/ci-prompt.txt` are all unchanged — only the model behind the
tool loop moved. Nothing was rewritten into plain API calls.

Why: this workflow was the only thing billing the paid Anthropic key, and its
`sonnet -> opus -> opus` retry ladder made a *failing* night the most expensive one.

**Model names stay Claude names on purpose.** DeepSeek maps them server-side —
`claude-sonnet-*`/`claude-haiku-*` → `deepseek-v4-flash`, `claude-opus-*` →
`deepseek-v4-pro` — so the same cheap-then-strong ladder survives, the CLI never has to
accept a non-Claude `--model` string, and deleting the two `ANTHROPIC_BASE_URL` lines
reverts the whole job to real Claude with sane models. That is the rollback.

**Reliability is unchanged.** If all three DeepSeek attempts produce no
`digests/<date>.json`, the job spends one real-Anthropic Opus attempt as a safety net —
so cheapness never costs an issue. Keep the `ANTHROPIC_API_KEY` secret in place for it;
it is now billed only on a night that already failed.

### Verified against the live API on 2026-08-20
- `POST /anthropic/v1/messages` with `x-api-key` returns real `tool_use` + `thinking`
  blocks and reports `usage` — the whole contract the harness needs.
- `claude-opus-5` in the request came back as `model: deepseek-v4-pro`, confirming the
  server-side mapping above.
- 1M context, 384K max output, tool calls and JSON output supported.
- **No vision.** An image content block does *not* error — the API returns 200 and the
  model silently receives the literal text `[Unsupported Image]`. That makes it a
  **fabrication** risk rather than a crash risk, which is why `ci-prompt.txt` now forbids
  opening images/frames and requires the 头版要图 caption to come from the source page.
- `cache_control` is ignored (DeepSeek does its own automatic prefix caching), and
  `mcp_servers` / server-side MCP blocks are unsupported. Neither matters here: CI has no
  browser and no MCP anyway.

### Cost, with the arithmetic shown
Per-MTok list rates. DeepSeek peak hours are 01:00-04:00 and 06:00-10:00 UTC; off-peak is
half. **The cron fires at 01:37/02:37 UTC, i.e. inside peak** — peak rates used below.

| | input (fresh) | input (cached) | output |
|---|---|---|---|
| Claude Opus 5 | $5.00 | $0.50 | $25.00 |
| Claude Sonnet 5 | $3.00 ($2.00 intro to 2026-08-31) | $0.30 ($0.20) | $15.00 ($10.00) |
| deepseek-v4-pro (peak) | $1.32 | $0.044 | $3.96 |
| deepseek-v4-flash (peak) | $0.44 | $0.014 | $1.32 |

ASSUMED (not measured) nightly volume for an agentic run that reads ~4 transcripts:
~1.5M cumulative input tokens, ~85% of them cache reads, ~60K output.

- Opus 5: 1.275M x $0.50 + 0.225M x $5.00 + 0.06M x $25.00 = **~$3.27**
- Sonnet 5 (intro): 1.275M x $0.20 + 0.225M x $2.00 + 0.06M x $10.00 = **~$1.31**
- v4-pro: 1.275M x $0.044 + 0.225M x $1.32 + 0.06M x $3.96 = **~$0.59**
- v4-flash: 1.275M x $0.014 + 0.225M x $0.44 + 0.06M x $1.32 = **~$0.20**

So a clean night moves from ~$1.31 to ~$0.20, and a night that retried twice into Opus
moves from ~$7.85 to ~$1.38. Call it 3-6x, not the order of magnitude it looks like at
first glance — the Anthropic saving is real but Opus is $5/$25, not $15/$75.

**Cache hits confirmed, so the ~$0.59 figure is the realistic one, not a best case.**
DeepSeek ignores `cache_control`, so the open question was whether its *automatic* prefix
caching engages on Claude Code's message shape at all. Measured 2026-08-20 on a two-turn
tool loop with no `cache_control` sent: turn 2 reported
`cache_read_input_tokens: 384` against `input_tokens: 123` — the prefix was served from
cache. Multi-turn `tool_use` -> `tool_result` round-trips also work end to end
(`stop_reason: tool_use` then `end_turn`, tool result correctly used in the answer), which
is the specific contract an agent loop lives on. Still worth eyeballing
`cache_read_input_tokens` on the first real nightly, since a 40-turn sweep is a bigger
shape than a 2-turn probe.

**Optional further halving:** moving the summer cron from 01:37 to ~00:47 UTC puts the run
in DeepSeek's off-peak window and halves every rate above — at the cost of publishing
~20:47 New York instead of ~21:37. Not done; it is a publish-time decision, not a
technical one.

### The local nightly is deliberately NOT on DeepSeek
`bin/run-digest.sh` still defaults to Claude, because that run bills Zen's Claude Code
subscription (free at the margin) and it is the only run with vision and a logged-in
Chrome — which the X / 小红书 lanes need. Set `ZEN_DIGEST_LLM=deepseek` to flip it if the
goal is to stop it consuming subscription allowance; it trades those lanes away.
