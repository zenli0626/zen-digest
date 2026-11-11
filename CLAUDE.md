# zen-digest

## Cloud sessions (Claude Code on the web, `CLAUDE_CODE_REMOTE=true`)

Zen's Mac safety hooks don't exist in the cloud. `.claude/hooks/cloud-guard.py` (wired in `.claude/settings.json`) blocks the risky actions instead: Robinhood; Vercel deploy/promote/rollback/env; Supabase migrations and non-SELECT SQL; sending email, calendar invites, Drive sharing, Sheets writes, SignWell sends, Meta Ads and Stripe writes; pushes to `main`, force/delete pushes, and merges without `--auto`.

- A BLOCKED message is final: stop and tell Zen what you needed. Never work around it.
- Work on your own branch, push it, open a PR. Zen reviews and merges.
- The cloud environment holds no secrets on purpose. If a task needs a key, stop and say which one.

