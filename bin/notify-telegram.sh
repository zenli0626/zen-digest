#!/usr/bin/env bash
# Post a message to Zen's Telegram via bot API. Needs TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID
# in the environment (GitHub Actions secrets). No-ops quietly if they're absent.
set -uo pipefail
MSG="${1:-}"
if [[ -z "${TELEGRAM_BOT_TOKEN:-}" || -z "${TELEGRAM_CHAT_ID:-}" ]]; then
  echo "telegram: no token/chat set — skipping"; exit 0
fi
curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
  --data-urlencode "text=${MSG}" \
  -d "disable_web_page_preview=true" >/dev/null \
  && echo "telegram: sent" || echo "telegram: send failed (non-fatal)"
