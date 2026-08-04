#!/bin/zsh
# Validated publish for 每日情报: diversity gate -> commit -> Vercel PREVIEW deploy.
# The single sanctioned publish path — enforces source diversity before anything
# reaches Vercel (which deploys the working dir, so a raw `vercel deploy` would
# bypass a commit-only gate). Prod is never touched here (Zen ships prod manually).
# Usage: publish.sh [YYYY-MM-DD]   (defaults to today America/New_York)
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$HOME/.pyenv/shims"
cd "${0:a:h}/.." || exit 1
day=${1:-$(TZ=America/New_York date +%F)}
f="digests/$day.json"
[[ -f "$f" ]] || { echo "publish: no issue at $f"; exit 1; }

# Native-Chinese polish pass (DeepSeek). Non-fatal: an unpolished issue still
# publishes — a down API must not block the daily paper.
node bin/polish-zh.mjs "$f" || echo "WARN: polish-zh failed — publishing unpolished zh text"

python3 bin/validate-digest.py --strict "$f" || {
  echo "PUBLISH ABORTED — $day failed the diversity gate. Backfill another source lane (or set partial:true for an unavoidable headless run), then retry."
  exit 1
}

git add -A && git commit -m "Publish 每日情报 $day" 2>/dev/null
vercel deploy --yes
