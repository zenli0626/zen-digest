#!/bin/zsh
# Nightly digest runner — invoked by launchd (com.zen.daily-digest) at 20:57 local.
# Produces today's issue so Zen can read it + do the hands-on item the same evening.
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$HOME/.pyenv/shims"
LOG_DIR="$HOME/zen-digest/logs"; mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/$(date +%F).log"
cd "$HOME/zen-digest" || exit 1

claude -p --dangerously-skip-permissions >> "$LOG" 2>&1 << 'PROMPT'
Run the /daily-digest skill (read ~/.claude/skills/daily-digest/SKILL.md and follow it
fully). This is the scheduled 9pm run: Zen reads the issue TONIGHT, so the hands-on
section must be tryable this evening. If Chrome/claude-in-chrome is unavailable in this
headless context, skip the XHS sweep with a note; the YouTube sweep always runs. Include
the OTA self-upgrade step and the hands_on section. Write digests/<today America/New_York>.json,
update digests/index.json, commit locally, deploy a Vercel PREVIEW only (never production).
Do not post to any user-visible surface. Finish by printing the deploy URL.
PROMPT
echo "[run-digest] exit=$? $(date)" >> "$LOG"
