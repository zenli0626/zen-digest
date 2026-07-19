#!/usr/bin/env node
// mirror-to-public.mjs — mirror ONE private 每日情报 digest issue into the public
// "learning in public" companion repo (~/zen-digest-public).
//
// Usage: node bin/mirror-to-public.mjs <digest.json> <public-repo-dir>
//
// Dependency-free (Node core only). Idempotent: safe to re-run for a date
// that's already been mirrored — no duplicate knowledge/LEARNING entries,
// daily/*.md and README.md are simply regenerated deterministically.
//
// Does NOT touch git. No commit, no push, no repo creation.
//
// This is the SAME script used for the historical backfill and for the
// nightly pipeline (call it as one more step after digests/<date>.json lands).

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { publicize } from "./publicize.mjs";

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const [, , digestPathArg, publicDirArg] = process.argv;

if (!digestPathArg || !publicDirArg) {
  console.error("Usage: node bin/mirror-to-public.mjs <digest.json> <public-repo-dir>");
  process.exit(1);
}

const digestPath = path.resolve(digestPathArg);
const publicDir = path.resolve(publicDirArg);

if (!fs.existsSync(digestPath)) {
  console.error(`mirror-to-public: no such file ${digestPath}`);
  process.exit(1);
}

const digest = JSON.parse(fs.readFileSync(digestPath, "utf8"));
const { date } = digest;
if (!date) {
  console.error("mirror-to-public: digest JSON has no top-level 'date'");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function readIfExists(p) {
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
}

function shortHash(s) {
  return crypto.createHash("md5").update(s).digest("hex").slice(0, 8);
}

function ymd(dateStr) {
  const [y, m, d] = dateStr.split("-");
  return { y, m, d };
}

const READ_MORE = (d) => `https://mrqb.space/?d=${d}`;

// ---------------------------------------------------------------------------
// 1. daily/YYYY/MM/YYYY-MM-DD.md
// ---------------------------------------------------------------------------

function renderDailyMd(digest) {
  const lines = [];
  const banner = digest.banner || "";
  const bannerEn = digest.banner_en || "";

  lines.push(`# ${banner}`);
  if (bannerEn) lines.push(`*${bannerEn}*`);
  lines.push("");
  lines.push(`📅 ${digest.date} · 完整版（含配图与全部原文链接）→ [${READ_MORE(digest.date)}](${READ_MORE(digest.date)})`);
  lines.push("");

  // what it read, grouped by platform
  lines.push("## 📡 今日读了什么 / What it read");
  lines.push("");
  for (const src of digest.sources || []) {
    const swept = src.swept != null ? ` (共扫读 ${src.swept} 条)` : "";
    lines.push(`### ${src.platform}${swept}`);
    lines.push("");
    for (const item of src.items || []) {
      const takeaway = item.why || item.summary || "";
      const title = item.url ? `[${item.title}](${item.url})` : item.title;
      const by = item.author ? ` — ${item.author}` : "";
      lines.push(`- **${title}**${by}${takeaway ? ` — ${takeaway}` : ""}`);
    }
    lines.push("");
  }

  // actions
  if ((digest.actions || []).length) {
    lines.push("## ✅ 今日可行动 / Do this today");
    lines.push("");
    for (const a of digest.actions) {
      const src = a.source_url ? `[${a.source}](${a.source_url})` : a.source;
      lines.push(`- ${a.text}${src ? ` *(${src})*` : ""}`);
    }
    lines.push("");
  }

  // meta_read
  if (digest.meta_read) {
    lines.push("## 🧭 本报社评 / Editorial read");
    lines.push("");
    lines.push(digest.meta_read);
    if (digest.meta_read_en) {
      lines.push("");
      lines.push(`*${digest.meta_read_en}*`);
    }
    lines.push("");
  }

  // learned
  const learned = digest.ota?.learned || [];
  if (learned.length) {
    lines.push("## 🆕 今日所学 / What I learned");
    lines.push("");
    for (const l of learned) lines.push(`- ${l}`);
    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}

function writeDailyMd(digest, publicDir) {
  const { y, m } = ymd(digest.date);
  const dir = path.join(publicDir, "daily", y, m);
  ensureDir(dir);
  const file = path.join(dir, `${digest.date}.md`);
  const raw = renderDailyMd(digest);
  // Born clean: every day's generated markdown is re-voiced to the public,
  // anonymous standard BEFORE it's ever written to the public repo. publicize()
  // fails loud (throws) if the `claude` CLI is unavailable or errors — this
  // script must never fall back to writing un-publicized content.
  const cleaned = publicize(raw, { label: `daily/${digest.date}` });
  fs.writeFileSync(file, cleaned);
  return file;
}

// ---------------------------------------------------------------------------
// 2. knowledge/<category>.md — compounding, idempotent append
// ---------------------------------------------------------------------------

const CATEGORY_ORDER = [
  ["evals.md", [
    "eval", "评测", "benchmark", "基准", "二元", "binary", "worst-case", "尾部",
    "regression", "回归", "高信号",
  ]],
  ["agents.md", [
    "agent", "loop", "编排", "子代理", "computer-use", "kill switch", "护栏",
    "guardrail", "feature flag", "沙盒", "sandbox", "autonom", "自治", "/goal",
    "receipts", "回执", "multi-agent", "orchestrat",
  ]],
  ["ai-economics.md", [
    "cost", "成本", "price", "定价", "token", "推理账", "自建", "自托管",
    "quota", "额度", "$", "便宜", "性价比", "inference",
  ]],
  ["ai-product-ux.md", [
    "ux", "体验", "design", "设计", "checklist", "用户", "product",
  ]],
  ["gtm-monetization.md", [
    "gtm", "商业化", "采纳", "adoption", "fde", "组织", "团队规模", "岗位",
    "打法", "business model", "商业物理学",
  ]],
];
const FALLBACK_CATEGORY = "industry-moves.md";

function categorize(text) {
  const lower = text.toLowerCase();
  for (const [file, keywords] of CATEGORY_ORDER) {
    for (const kw of keywords) {
      if (lower.includes(kw.toLowerCase())) return file;
    }
  }
  return FALLBACK_CATEGORY;
}

const KNOWLEDGE_HEADER = (title) =>
  `# ${title}\n\n` +
  `Durable, dated learnings that compound over time — one bullet per distilled\n` +
  `insight, sourced back to the issue it came from. Append-only; never edit past\n` +
  `entries, only add new ones below.\n\n` +
  `<!-- format: - **YYYY-MM-DD** — insight. ([source](url)) <!-- id:HASH --> -->\n`;

const CATEGORY_TITLES = {
  "evals.md": "Evals — 评测方法论",
  "agents.md": "Agents — 编排与自治",
  "ai-economics.md": "AI Economics — 成本与定价",
  "ai-product-ux.md": "AI Product & UX",
  "gtm-monetization.md": "GTM & Monetization",
  "industry-moves.md": "Industry Moves — 行业动态",
};

function appendKnowledge(digest, publicDir) {
  const dir = path.join(publicDir, "knowledge");
  ensureDir(dir);

  const learned = digest.ota?.learned || [];
  const touched = new Set();

  for (const insight of learned) {
    const file = categorize(insight);
    const filePath = path.join(dir, file);
    const existing = readIfExists(filePath) || KNOWLEDGE_HEADER(CATEGORY_TITLES[file] || file);

    // Hash/dedupe key is on the ORIGINAL insight text so re-runs stay idempotent
    // regardless of publicize() wording drift between runs.
    const id = `${digest.date}-${shortHash(insight)}`;
    if (existing.includes(`id:${id}`)) continue; // already appended — idempotent no-op

    // Born clean: de-personalize the insight text before it ever lands in the
    // public, append-only knowledge file. Fails loud if `claude` is unavailable.
    const cleanedInsight = publicize(insight, { label: `knowledge/${file}:${digest.date}` }).trim();

    const link = READ_MORE(digest.date);
    const bullet = `- **${digest.date}** — ${cleanedInsight} ([source](${link})) <!-- id:${id} -->\n`;
    fs.writeFileSync(filePath, existing.trimEnd() + "\n" + bullet);
    touched.add(file);
  }

  return [...touched];
}

// ---------------------------------------------------------------------------
// 3. LEARNING.md — public self-upgrade log, per-issue append from ota-ledger.md
// ---------------------------------------------------------------------------

function findLedgerPath(digestPath) {
  // digests/<date>.json -> ../ota-ledger.md
  const digestsDir = path.dirname(digestPath);
  return path.join(digestsDir, "..", "ota-ledger.md");
}

function redactLedgerLine(line) {
  return line
    .replace(/→\s*memory\s*`[^`]*`/g, "")
    .replace(/\(would extend memory[^)]*\)/g, "")
    .replace(/编辑部/g, "this project")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,)])/g, "$1")
    .trim();
}

function extractLedgerEntriesForDate(ledgerText, date) {
  // Ledger entries are "- YYYY-MM-DD — ..." possibly wrapped over multiple
  // lines (continuation lines are indented). Split on top-level "- " bullets.
  const entries = [];
  const bulletLines = ledgerText.split("\n");
  let current = null;
  for (const line of bulletLines) {
    const trimmed = line.trim();
    const isStandaloneComment = /^<!--.*-->$/.test(trimmed);
    if (/^- \d{4}-\d{2}-\d{2}/.test(trimmed)) {
      if (current) entries.push(current.trim());
      current = trimmed;
    } else if (current && trimmed && !isStandaloneComment) {
      current += " " + trimmed;
    }
  }
  if (current) entries.push(current.trim());

  return entries
    .filter((e) => e.startsWith(`- ${date}`))
    .map((e) => e.replace(/^-\s*/, ""));
}

const LEARNING_HEADER =
  `# LEARNING.md — public self-upgrade log\n\n` +
  `Every entry here is a technique this project adopted about *how it works on\n` +
  `itself* (evals, defaults, guardrails) — not a domain-news item (those live in\n` +
  `\`knowledge/\`). Dated, append-only, public-safe: internal tooling names and\n` +
  `paths are stripped, the technique + the "why it matters" stays.\n`;

function appendLearning(digest, digestPath, publicDir) {
  const learningPath = path.join(publicDir, "LEARNING.md");
  let existing = readIfExists(learningPath) || LEARNING_HEADER + "\n";

  const ledgerPath = findLedgerPath(digestPath);
  const ledgerText = readIfExists(ledgerPath);
  if (!ledgerText) return false;

  const entries = extractLedgerEntriesForDate(ledgerText, digest.date);
  let changed = false;

  for (const raw of entries) {
    const redacted = redactLedgerLine(raw);
    const id = `${digest.date}-${shortHash(redacted)}`;
    if (existing.includes(`id:${id}`)) continue; // idempotent
    // Born clean: de-personalize on top of the existing memory/path redaction
    // before this ever lands in the public LEARNING.md. Fails loud if `claude`
    // is unavailable.
    const cleaned = publicize(redacted, { label: `LEARNING:${digest.date}` }).trim();
    existing = existing.trimEnd() + "\n\n" + `- ${cleaned} <!-- id:${id} -->\n`;
    changed = true;
  }

  if (changed) fs.writeFileSync(learningPath, existing);
  return changed;
}

// ---------------------------------------------------------------------------
// 4. README.md — regenerated from current state of the public dir
// ---------------------------------------------------------------------------

function listDailyFiles(publicDir) {
  const dailyRoot = path.join(publicDir, "daily");
  if (!fs.existsSync(dailyRoot)) return [];
  const files = [];
  for (const y of fs.readdirSync(dailyRoot)) {
    const yDir = path.join(dailyRoot, y);
    if (!fs.statSync(yDir).isDirectory()) continue;
    for (const m of fs.readdirSync(yDir)) {
      const mDir = path.join(yDir, m);
      if (!fs.statSync(mDir).isDirectory()) continue;
      for (const f of fs.readdirSync(mDir)) {
        if (!f.endsWith(".md")) continue;
        const dateStr = f.replace(/\.md$/, "");
        files.push({ date: dateStr, relPath: path.join("daily", y, m, f) });
      }
    }
  }
  files.sort((a, b) => (a.date < b.date ? 1 : -1)); // newest first
  return files;
}

function sumSweptAcrossDaily(publicDir, dailyFiles) {
  // We don't have the swept counts once mirrored into markdown without
  // re-parsing; re-derive from the "(共扫读 N 条)" markers we wrote.
  let total = 0;
  for (const f of dailyFiles) {
    const text = readIfExists(path.join(publicDir, f.relPath));
    for (const m of text.matchAll(/共扫读 (\d+) 条/g)) total += Number(m[1]);
  }
  return total;
}

function listKnowledgeFiles(publicDir) {
  const dir = path.join(publicDir, "knowledge");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort();
}

function lastLearningEntries(publicDir, n = 3) {
  const text = readIfExists(path.join(publicDir, "LEARNING.md"));
  const bullets = [...text.matchAll(/^- (.+?) <!-- id:[^>]*-->\s*$/gm)].map((m) => m[1]);
  return bullets.slice(-n).reverse();
}

function daysBetweenInclusive(d1, d2) {
  const a = new Date(d1 + "T00:00:00Z");
  const b = new Date(d2 + "T00:00:00Z");
  return Math.round(Math.abs(b - a) / 86400000) + 1;
}

function renderReadme(publicDir) {
  const dailyFiles = listDailyFiles(publicDir); // newest first
  const knowledgeFiles = listKnowledgeFiles(publicDir);
  const issueCount = dailyFiles.length;
  const sweptTotal = sumSweptAcrossDaily(publicDir, dailyFiles);
  const dayN = issueCount
    ? daysBetweenInclusive(dailyFiles[dailyFiles.length - 1].date, dailyFiles[0].date)
    : 0;
  const latestLearnings = lastLearningEntries(publicDir, 3);

  const lines = [];
  lines.push("# 好好学习天天向上 · hhxxttxs");
  lines.push("");
  lines.push(
    "> **好好学习，天天向上.** An AI agent that reads the AI world every night and " +
      "learns in public — watch it get smarter, one day at a time.\n" +
      "> 每日情报 · Learning in Public：一个每晚扫读 AI 世界的智能体，把自己的成长完全公开——一天天变强。"
  );
  lines.push("");
  lines.push(
    `🧠 Day ${dayN} · ${issueCount} issues · ${sweptTotal} sources read · ${knowledgeFiles.length} knowledge domains`
  );
  lines.push("");

  lines.push("## 🆕 Latest learnings");
  lines.push("");
  if (latestLearnings.length) {
    for (const l of latestLearnings) lines.push(`- ${l}`);
  } else {
    lines.push("- *(none yet)*");
  }
  lines.push("");
  lines.push("See the full log in [`LEARNING.md`](./LEARNING.md).");
  lines.push("");

  lines.push("## 🗂 Knowledge domains");
  lines.push("");
  if (knowledgeFiles.length) {
    for (const f of knowledgeFiles) {
      const title = CATEGORY_TITLES[f] || f;
      lines.push(`- [${title}](./knowledge/${f})`);
    }
  } else {
    lines.push("- *(none yet)*");
  }
  lines.push("");

  lines.push("## 📅 Recent issues");
  lines.push("");
  for (const f of dailyFiles.slice(0, 10)) {
    lines.push(`- [${f.date}](./${f.relPath.split(path.sep).join("/")})`);
  }
  lines.push("");

  lines.push("---");
  lines.push("");
  lines.push("📖 Read the full paper at [mrqb.space](https://mrqb.space) · subscribe for the daily issue.");
  lines.push("");

  return lines.join("\n").trimEnd() + "\n";
}

function writeReadme(publicDir) {
  fs.writeFileSync(path.join(publicDir, "README.md"), renderReadme(publicDir));
}

// ---------------------------------------------------------------------------
// 5. .gitignore (created once, left alone after)
// ---------------------------------------------------------------------------

function ensureGitignore(publicDir) {
  const p = path.join(publicDir, ".gitignore");
  if (fs.existsSync(p)) return;
  fs.writeFileSync(p, ".DS_Store\nnode_modules/\n*.log\n");
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

ensureDir(publicDir);
ensureGitignore(publicDir);

const dailyFile = writeDailyMd(digest, publicDir);
const touchedKnowledge = appendKnowledge(digest, publicDir);
const learningChanged = appendLearning(digest, digestPath, publicDir);
writeReadme(publicDir);

console.log(`mirror-to-public: ${date}`);
console.log(`  daily -> ${path.relative(publicDir, dailyFile)}`);
console.log(`  knowledge touched -> ${touchedKnowledge.join(", ") || "(none)"}`);
console.log(`  LEARNING.md changed -> ${learningChanged}`);
console.log(`  README.md regenerated`);
