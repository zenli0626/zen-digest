#!/usr/bin/env node
// publicize.mjs — the de-personalization step for zen-digest-public.
//
// Given markdown text (or a file), calls the Claude Code CLI headlessly
// (`claude -p "<prompt>" --dangerously-skip-permissions`) to re-voice it from
// a personal briefing into a neutral, public-safe digest: no owner name, no
// private workflow/tooling claims, personalized advice re-voiced to address a
// general AI-builder audience. Facts, links, headlines, dates, and learnings
// are preserved verbatim — only identity/personal-framing language changes.
//
// FAILS LOUD: if the `claude` CLI is not on PATH, or it errors, or it
// produces no/empty output, this throws / exits non-zero. It NEVER falls
// back to emitting the original (un-publicized) content.
//
// Usage (CLI):
//   node bin/publicize.mjs <input.md> [output.md]     # writes cleaned file
//   node bin/publicize.mjs <input.md>                 # prints cleaned text to stdout
//
// Usage (module, e.g. from mirror-to-public.mjs):
//   import { publicize } from "./publicize.mjs";
//   const cleaned = publicize(rawMarkdown, { label: "daily/2026-07-19" });
//
// Dependency-free (Node core only).

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DEPERSONALIZE_PROMPT = `You are the de-personalization gate for a public "learn in public" AI digest repo. Read the markdown file at INPUT_PATH and write a cleaned version to OUTPUT_PATH. Apply exactly these rules — do not summarize, shorten, translate, or add commentary; only edit for the rules below, and preserve markdown structure (headings, links, bold, bullet lists) exactly as given:

1. Remove the owner's real name/handle ("Zen", or any other personal name/handle) everywhere it appears. This repo is authored by "an AI editorial board / agent" — no human is named. Rewrite the surrounding sentence so it reads naturally without the name; never just delete the word and leave a grammatical gap.
2. Remove any first-person claim that "this project" (本报 / 编辑部 / the editorial board) personally built, is building, or privately runs some tool or workflow — e.g. "本报编辑部当天也在自建", "编辑部已看完全文", "编辑部已代读全文". Re-voice these as a neutral observation about the industry or other builders instead (e.g. "本报编辑部当天也在自建" -> "不少独立开发者也在自建同类工作流").
3. Remove references to one specific person's private orchestration setup or tooling — e.g. "Fable 5 主控 + Sonnet 子代理", "经理+子代理的编排打法", or the literal tokens "主控" / "子代理" used to describe a personal setup. Re-voice using generic architecture terms instead, such as "manager + worker agent", "主 agent" / "worker agent", "orchestrator model + worker model".
4. Re-voice personalized second-person advice that assumes ONE specific reader's context (e.g. "这条给 Zen 的可迁移性最高：他本来就是…") into neutral advice addressed to a general audience of AI builders (e.g. "对用 manager/worker-agent 模式编排 agent 的建设者，这条可迁移性最高…"). Keep the actionable substance — only the addressee changes.
5. Remove references to a private memory-file system or private skill/tool names — e.g. "存入长期记忆", "写入记忆", "phone-use", "xhs-brief" — keep the generic technique being described, just drop the private tool/system name.
6. Do NOT remove or alter: facts, dates, headlines, source links (rednote.com / youtube.com / news links / any URL), or model names that are the SUBJECT of a news item (e.g. "Anthropic makes Fable 5 permanent", "Kimi K3 matches Opus") — only strip model/tool names when they describe a person's private setup, per rule 3. Do not touch the substance of any learning or insight.
7. Write ONLY the cleaned markdown to OUTPUT_PATH — no preamble, no explanation, no surrounding code fence, no extra commentary. Do not print the content anywhere else.

INPUT_PATH: {{INPUT_PATH}}
OUTPUT_PATH: {{OUTPUT_PATH}}`;

function ensureClaudeAvailable() {
  try {
    execFileSync("claude", ["--version"], { stdio: "ignore" });
  } catch (err) {
    throw new Error(
      "publicize: `claude` CLI not found on PATH (or failed to run) — " +
        "refusing to emit un-publicized content. Install/auth Claude Code CLI, " +
        "or fix PATH, then retry. Original error: " +
        (err && err.message ? err.message : String(err))
    );
  }
}

/**
 * De-personalize markdown text via the Claude Code CLI.
 * @param {string} markdown - raw markdown to clean.
 * @param {{label?: string, timeoutMs?: number}} [opts]
 * @returns {string} cleaned markdown.
 * @throws if `claude` is unavailable, errors, or produces empty/no output.
 */
export function publicize(markdown, opts = {}) {
  const { label = "content", timeoutMs = 180_000 } = opts;

  if (typeof markdown !== "string" || !markdown.trim()) {
    throw new Error(`publicize: refusing to process empty input for ${label}`);
  }

  ensureClaudeAvailable();

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "zen-digest-publicize-"));
  const inputPath = path.join(tmpDir, "input.md");
  const outputPath = path.join(tmpDir, "output.md");

  try {
    fs.writeFileSync(inputPath, markdown, "utf8");

    const prompt = DEPERSONALIZE_PROMPT
      .replace("{{INPUT_PATH}}", inputPath)
      .replace("{{OUTPUT_PATH}}", outputPath);

    try {
      execFileSync("claude", ["-p", prompt, "--model", "claude-sonnet-5", "--dangerously-skip-permissions"], {
        stdio: ["ignore", "pipe", "pipe"],
        timeout: timeoutMs,
      });
    } catch (err) {
      throw new Error(
        `publicize: claude CLI invocation failed for ${label} — refusing to emit ` +
          `un-publicized content. Original error: ${err && err.message ? err.message : String(err)}`
      );
    }

    if (!fs.existsSync(outputPath)) {
      throw new Error(
        `publicize: claude produced no output file for ${label} — refusing to emit ` +
          `un-publicized content.`
      );
    }

    const cleaned = fs.readFileSync(outputPath, "utf8");
    if (!cleaned.trim()) {
      throw new Error(
        `publicize: claude produced empty output for ${label} — refusing to emit ` +
          `un-publicized content.`
      );
    }

    return cleaned;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);

if (isMain) {
  const [, , inputArg, outputArg] = process.argv;
  if (!inputArg) {
    console.error("Usage: node bin/publicize.mjs <input.md> [output.md]");
    process.exit(1);
  }
  const inputPath = path.resolve(inputArg);
  if (!fs.existsSync(inputPath)) {
    console.error(`publicize: no such file ${inputPath}`);
    process.exit(1);
  }
  try {
    const raw = fs.readFileSync(inputPath, "utf8");
    const cleaned = publicize(raw, { label: inputArg });
    if (outputArg) {
      fs.writeFileSync(path.resolve(outputArg), cleaned);
      console.error(`publicize: wrote cleaned output to ${outputArg}`);
    } else {
      process.stdout.write(cleaned);
    }
  } catch (err) {
    console.error(err && err.message ? err.message : String(err));
    process.exit(1);
  }
}
