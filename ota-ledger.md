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

- 2026-07-19 (evening) — **Abstention-aware eval gates**: deepens the same-day
  eval-gated escalation line by fixing its weak point (it assumes a reliable binary eval
  exists). Every eval gate's judge must return one of THREE verdicts — pass / fail /
  **unsure (can't-verify)** — and `unsure` is treated exactly like `fail` (escalate or
  hand to a human), never let through. The judge itself runs at a LOW reasoning tier but
  must attach a checkable reason for any PASS; no reason ⇒ `unsure`. Closes the
  "who-watches-the-watcher" hole so a small judge model's false confidence can't
  rubber-stamp bad output. Motivated by the Capraro/Marcoccia/Quattrociocchi study
  ("a judge that can't say 'I don't know' is more dangerous", accuracy 27%→9% while
  confidence 30%→76%) + Latent Space's harness-engineering frame (第005期, 2026-07-19,
  evening). Completes 07-18 (high-signal binary evals) + 07-19 morning (effort escalation)
  into a loop that can't self-certify. Invoke intent: "give every eval gate an abstain
  verdict, treat unsure as fail; run the judge low-tier but require a checkable reason for
  any pass." *proposed (cloud) — adopt on next laptop session (would extend memory
  `feedback-high-signal-evals` alongside the morning line).*

<!-- next run: append below, deepen a live thread over starting a scattershot new one -->
