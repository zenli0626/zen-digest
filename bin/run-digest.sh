#!/bin/zsh
# Nightly digest runner — invoked by launchd (com.zen.daily-digest) at 20:57 local.
# Produces today's issue so Zen can read it + do the hands-on item the same evening.
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$HOME/.pyenv/shims"
LOG_DIR="$HOME/zen-digest/logs"; mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/$(date +%F).log"
cd "$HOME/zen-digest" || exit 1

# Which brain runs the sweep. Default is Claude, deliberately: this local run bills
# Zen's Claude Code subscription (free at the margin) and it is the ONLY run with
# vision + a logged-in Chrome, which the X / 小红书 lanes and the read-the-frames
# fallback need. DeepSeek cannot see images at all (its Anthropic-compatible endpoint
# swaps an image block for the literal text "[Unsupported Image]" and returns 200, so a
# caption written off one is fabricated, not merely wrong), so flipping this trades those
# lanes away rather than degrading them. Set ZEN_DIGEST_LLM=deepseek if the goal is to
# stop this run consuming the subscription allowance; the cloud nightly
# (.github/workflows/daily-digest.yml) is already on DeepSeek either way.
if [[ "${ZEN_DIGEST_LLM:-claude}" == "deepseek" ]]; then
  [[ -z "${DEEPSEEK_API_KEY:-}" && -f .env ]] && export "$(grep -m1 '^DEEPSEEK_API_KEY=' .env)"
  if [[ -z "${DEEPSEEK_API_KEY:-}" ]]; then
    echo "[run-digest] ZEN_DIGEST_LLM=deepseek but DEEPSEEK_API_KEY is unset" >> "$LOG"; exit 1
  fi
  # claude-sonnet-5 is mapped server-side to deepseek-v4-flash; see the workflow comment.
  export ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic
  export ANTHROPIC_API_KEY="$DEEPSEEK_API_KEY"
  export ANTHROPIC_AUTH_TOKEN="$DEEPSEEK_API_KEY"
  echo "[run-digest] brain=deepseek (no vision: frame-reading + image lanes unavailable)" >> "$LOG"
fi

claude -p --model claude-sonnet-5 --dangerously-skip-permissions >> "$LOG" 2>&1 << 'PROMPT'
Run the /daily-digest skill (read ~/.claude/skills/daily-digest/SKILL.md and follow it
fully). This is the scheduled 9pm run: Zen reads the issue TONIGHT, so the hands-on
section must be tryable this evening. Sweep as many source lanes as you can reach —
YouTube (always, headless), plus X and 小红书 whenever Chrome/claude-in-chrome is
available; a diverse issue is the goal. If you truly can ONLY reach YouTube (headless,
no Chrome), set top-level "partial": true in the JSON so the diversity gate lets it
through and the next interactive run backfills. Include the OTA self-upgrade step and
the hands_on + image steps. Write digests/<today America/New_York>.json, update
digests/index.json. DO NOT run vercel yourself — the runner publishes via bin/publish.sh
(which enforces the diversity gate). Do not post to any user-visible surface.
PROMPT

# Validated publish (diversity gate -> commit -> preview deploy). Never prod.
"$HOME/zen-digest/bin/publish.sh" >> "$LOG" 2>&1
echo "[run-digest] exit=$? $(date)" >> "$LOG"
