#!/usr/bin/env bash
# Cloud publish for 每日情报 (GitHub Actions). Decides prod vs preview by quality:
#   diversity gate (hard) → quality self-check → PASS: vercel --prod + commit + 🟢 notify
#                                              → FAIL: preview only + commit draft + 🟡 notify
# Never touches prod unless BOTH the gate and the quality bar pass. Deploys via VERCEL_TOKEN
# (repo is NOT git-connected to Vercel, so nothing deploys except through this script).
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1
DAY="${1:-$(TZ=America/New_York date +%F)}"
F="digests/$DAY.json"

notify() { bash bin/notify-telegram.sh "$1" || true; }
commit_back() {
  git add -A
  git -c user.name="digest-bot" -c user.email="digest-bot@users.noreply.github.com" \
      commit -m "$1" || true
  git push || true
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

# 2) Quality self-check decides the deploy target.
if python3 bin/quality-check.py "$F"; then
  OUT=$(vercel deploy --prod --yes --token="$VERCEL_TOKEN" 2>&1); RC=$?
  echo "$OUT"
  if [[ $RC -ne 0 ]]; then
    commit_back "Publish 每日情报 $DAY (auto — issue OK, prod deploy FAILED)"
    notify "🔴 每日情报 $DAY：质量达标但 prod 部署失败。见 Actions 日志。"
    exit 1
  fi
  commit_back "Publish 每日情报 $DAY (auto, cloud — quality pass → prod)"
  notify "🟢 每日情报 $DAY 已自动上线 mrqb.space（质量自检通过）。"
else
  OUT=$(vercel deploy --yes --token="$VERCEL_TOKEN" 2>&1); RC=$?
  echo "$OUT"
  PREVIEW=$(echo "$OUT" | grep -oE 'https://[a-z0-9.-]+\.vercel\.app' | tail -1)
  commit_back "Draft 每日情报 $DAY (auto — held for review)"
  notify "🟡 每日情报 $DAY 未过上线质量自检，已停在预览待你过目：${PREVIEW:-见 Actions 日志}。满意就手动 promote 到 prod。"
fi
