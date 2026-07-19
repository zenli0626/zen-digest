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

- 2026-07-19 — **Eval-gated effort escalation** (default-cheapest routing): when I fan out
  sub-agents / workflow stages, start every subtask at the LOWEST reasoning-effort tier and the
  cheapest adequate model, and escalate a subtask ONE tier only when its output FAILS that
  subtask's binary eval — never escalate the whole fan-out on a hunch, and only let a higher tier
  become the DEFAULT once the cheaper tier's worst-case failures (not its average) prove
  unacceptable. Turns the 07-18 binary-evals line into an operational routing rule and folds in
  worst-case/tail gating as the promotion test. Motivated by Ahead of AI's reasoning-effort
  modes + Kimi/GLM open-weight commoditization (第004期, 2026-07-19). Invoke intent: "route this
  at the cheapest effort tier; escalate only the subtasks that fail their eval, and only make a
  tier the default if its worst case beats the cheaper tier's." *proposed (cloud) — adopt on next
  laptop session (would extend memory `feedback-high-signal-evals`).*

<!-- next run: append below, deepen a live thread over starting a scattershot new one -->
