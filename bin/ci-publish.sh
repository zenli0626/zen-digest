#!/usr/bin/env bash
# Cloud publish for 每日情报 (GitHub Actions). Decides prod vs preview by quality, then
# Telegrams Zen the actual FRONT-PAGE BROADSHEET (the same 分享长图 PNG the site exports),
# so every night he gets the whole paper — not just a link.
#   diversity gate (hard) → render broadsheet → quality self-check
#     PASS → vercel --prod + commit + 🟢 paper                (auto-live)
#     FAIL → vercel preview + commit draft + 🟡 paper + preview link (held for review)
# Deploys only via VERCEL_TOKEN (repo is NOT git-connected to Vercel), so prod is only ever
# touched when BOTH the gate and the quality bar pass.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1
DAY="${1:-$(TZ=America/New_York date +%F)}"
F="digests/$DAY.json"
BROADSHEET="/tmp/每日情报-$DAY.png"          # outside the repo → never committed

TG="https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN:-}"

notify() {
  bash bin/notify-telegram.sh "$1" || true
  node bin/notify-serverchan.mjs status "$1" || true
}

commit_back() {
  git add -A
  git -c user.name="digest-bot" -c user.email="digest-bot@users.noreply.github.com" \
      commit -m "$1" || true
  git push || true
}

# Send the front-page PNG as a Telegram document (full resolution, readable). Falls back to
# a plain text message if the broadsheet render didn't produce a file.
send_paper() {  # $1 = caption
  if [[ -s "$BROADSHEET" && -n "${TELEGRAM_BOT_TOKEN:-}" && -n "${TELEGRAM_CHAT_ID:-}" ]]; then
    curl -s -X POST "$TG/sendDocument" \
      -F "chat_id=${TELEGRAM_CHAT_ID}" \
      -F "document=@${BROADSHEET}" \
      -F "caption=$1" >/dev/null && echo "paper sent (document)" || { echo "paper send failed → text"; notify "$1"; }
  else
    notify "$1"
  fi
  node bin/notify-serverchan.mjs paper "$F" || true
}

# Render the broadsheet by driving the site's own export in a headless browser. Best-effort.
render_broadsheet() {
  command -v node >/dev/null 2>&1 || { echo "no node — skipping broadsheet"; return 0; }
  python3 -m http.server 8799 >/tmp/srv.log 2>&1 &
  local srv=$!
  sleep 2
  node bin/render-broadsheet.mjs \
    "http://localhost:8799/index.html?d=$DAY" "$BROADSHEET" \
    || echo "broadsheet render failed (non-fatal) — will send text instead"
  kill "$srv" 2>/dev/null || true
}

if [[ ! -f "$F" ]]; then
  notify "🔴 每日情报 $DAY：云端未生成当期文件（$F 缺失），未发布。见 GitHub Actions 日志。"
  echo "publish: no issue at $F"; exit 1
fi

# 1) Diversity gate — hard requirement even to preview-publish.
if ! python3 bin/validate-digest.py "$F"; then
  commit_back "Draft 每日情报 $DAY (auto — failed diversity gate)"
  notify "🔴 每日情报 $DAY：未过多样性闸门（来源过单一）。已存草稿，未部署。见 Actions 日志。"
  echo "publish: diversity gate failed"; exit 1
fi

# 2) Render the front-page broadsheet (best-effort; before deploy so it reflects this issue).
render_broadsheet

# 3) Quality self-check decides the deploy target.
if python3 bin/quality-check.py "$F"; then
  OUT=$(vercel deploy --prod --yes --token="$VERCEL_TOKEN" 2>&1); RC=$?
  echo "$OUT"
  if [[ $RC -ne 0 ]]; then
    commit_back "Publish 每日情报 $DAY (auto — issue OK, prod deploy FAILED)"
    notify "🔴 每日情报 $DAY：质量达标但 prod 部署失败。见 Actions 日志。"
    exit 1
  fi
  commit_back "Publish 每日情报 $DAY (auto, cloud — quality pass → prod)"
  node bin/send-newsletter.mjs "$F" "$BROADSHEET" || echo "newsletter send failed (non-fatal)"

  # Mirror to the public "learning in public" repo (hhxxttxs) — best-effort, token-gated.
  if [[ -n "${PUBLIC_REPO_TOKEN:-}" ]]; then
    ( rm -rf /tmp/pub \
      && git clone --depth 1 "https://x-access-token:${PUBLIC_REPO_TOKEN}@github.com/zenli0626/hhxxttxs.git" /tmp/pub \
      && node bin/mirror-to-public.mjs "$F" /tmp/pub \
      && node bin/scan-public-safe.mjs /tmp/pub \
      && cd /tmp/pub && git add -A \
      && git -c user.name="hhxxttxs-bot" -c user.email="bot@users.noreply.github.com" commit -m "好好学习天天向上 · $DAY" \
      && git push \
    ) && echo "public mirror pushed" || echo "public mirror failed (non-fatal)"
  fi

  send_paper "🗞 每日情报 $DAY 已自动上线 mrqb.space（质量自检通过）—— 今晚的完整头版在此。🔗 https://mrqb.space"
else
  OUT=$(vercel deploy --yes --token="$VERCEL_TOKEN" 2>&1)
  PREVIEW=$(echo "$OUT" | grep -oE 'https://[a-z0-9.-]+\.vercel\.app' | tail -1)
  commit_back "Draft 每日情报 $DAY (auto — held for review)"
  send_paper "🟡 每日情报 $DAY 未过上线自检，已停在预览待你过目。这是草稿版头版长图，满意就手动 promote 到 prod。预览：${PREVIEW:-见 Actions 日志}"
fi
