# OTA 自我升级台账 · Claude Code capability ledger

The compounding record of what Zen's Claude Code has learned/adopted through the daily
digest's OTA step. **Each daily run reads this first**, then picks an upgrade that builds
on or fills a gap in this list (never re-adopts an existing line), and appends its new
entry below. Bias: AI **application / GTM / product** utility — the work Zen actually
benefits from. Keep entries one line: `YYYY-MM-DD — <what was adopted> → <how to invoke>`.

## Adopted

- 2026-07-18 — High-signal **binary (yes/no) evals + held-out validation** over 0–1 vibe
  scores when self-improving any skill/prompt/the OTA loop itself → memory
  `feedback-high-signal-evals` (source: Langfuse "Stop Burning Tokens", 第003期).

- 2026-07-19 — **Tail-guarded defaults**: before promoting any change to a DEFAULT (skill /
  prompt / the OTA loop), gate it on WORST-CASE regression across the held-out set, not the
  mean/median — a change can win most runs and still be a bad default (source: Charles Azam's
  Fable5-vs-Sol `/goal` NP-hard test, 第004期). Deepens the 07-18 binary-evals line → still
  yes/no evals, but now the promotion rule is "no fattened failure tail", not "better average".
  Invoke intent: "gate this change on worst-case, not average." *proposed (cloud) — adopt on
  next laptop session (would extend memory `feedback-high-signal-evals`).*

<!-- next run: append below, deepen a live thread over starting a scattershot new one -->
