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
if git push; then
  # The push is what puts the issue on mrqb.space (Vercel deploys main). Ask GitHub to email
  # subscribers — the keys live in repo secrets; the workflow waits for the live page and
  # skips if this issue was already mailed. Today's issue only: a backfill never emails.
  if [[ "$day" == "$(TZ=America/New_York date +%F)" ]]; then
    gh workflow run newsletter.yml -f day="$day" \
      && echo "newsletter: queued for $day (GitHub Actions → newsletter)" \
      || echo "WARN: could not queue the newsletter — run: gh workflow run newsletter.yml -f day=$day"
  fi
else
  echo "WARN: git push failed — commit is local only, will diverge from origin (newsletter not sent)"
fi
vercel deploy --yes
