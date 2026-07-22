#!/usr/bin/env node
// polish-zh.mjs — native-Chinese polish pass for 每日情报 digests.
//
// Sends every Chinese PROSE field of a digest JSON to DeepSeek (deepseek-chat)
// and writes back a rewrite in native 中文报刊 register: idiomatic collocations,
// full-width punctuation, no translation-ese. Facts, numbers, proper nouns,
// English terms, and URLs must survive verbatim — the prompt forbids changing
// them and the script verifies structure before writing anything back.
//
// Fields polished:  banner, image.caption, actions[].text, hands_on.title,
//   hands_on.why, hands_on.steps[], meta_read, ota.learned[],
//   ota.new_capabilities[], sources[].meta_read, sources[].items[].summary,
//   sources[].items[].why_matters
// Fields NEVER touched: all *_en fields, URLs, sources[].items[].title /
//   .author (those cite real source titles), platform names, dates.
//
// FAILS LOUD: missing key, API error, or malformed response → non-zero exit,
// file left untouched. Never writes a partially-polished digest.
//
// Usage:
//   node bin/polish-zh.mjs digests/2026-07-20.json [more.json ...]
// Env: DEEPSEEK_API_KEY (from .env in repo root if not already set)

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

// -- load DEEPSEEK_API_KEY from repo .env if not in the environment ----------
if (!process.env.DEEPSEEK_API_KEY) {
  const envFile = path.join(ROOT, ".env");
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
      const m = line.match(/^DEEPSEEK_API_KEY=(.+)$/);
      if (m) process.env.DEEPSEEK_API_KEY = m[1].trim();
    }
  }
}
const KEY = process.env.DEEPSEEK_API_KEY;
if (!KEY) {
  console.error("polish-zh: DEEPSEEK_API_KEY not set (env or .env in repo root)");
  process.exit(1);
}

// -- collect the zh prose fields of a digest as { jsonPath: text } -----------
// Generic walk: day-to-day digest schemas drift (some days have items[].why /
// items[].flag etc.), so polish ANY string field containing CJK except the
// protected ones below.
const PROTECTED_KEYS = new Set([
  "date", "src", "source", "source_url", "url", "platform", "author", "time",
]);
const PROTECTED_PATH = /\bitems\.\d+\.(title|author)$/; // cited source titles

function collectFields(d) {
  const out = {};
  (function walk(o, p) {
    if (typeof o === "string") {
      const key = p.split(".").at(-1);
      if (
        o.trim() &&
        /[一-鿿]/.test(o) &&
        !key.endsWith("_en") &&
        !PROTECTED_KEYS.has(key) &&
        !PROTECTED_PATH.test(p)
      )
        out[p] = o;
    } else if (Array.isArray(o)) {
      o.forEach((v, i) => walk(v, `${p}.${i}`));
    } else if (o && typeof o === "object") {
      for (const [k, v] of Object.entries(o)) walk(v, p ? `${p}.${k}` : k);
    }
  })(d, "");
  return out;
}

// deterministic pangu-style spacing: one space between CJK and ASCII words —
// the model is unreliable at this, so enforce it in code
function fixSpacing(s) {
  return s
    .replace(/([一-鿿])([A-Za-z0-9(])/g, "$1 $2")
    .replace(/([A-Za-z0-9)])([一-鿿])/g, "$1 $2");
}

function setByPath(d, p, v) {
  const parts = p.split(".");
  let o = d;
  for (const k of parts.slice(0, -1)) o = o[/^\d+$/.test(k) ? Number(k) : k];
  o[parts.at(-1)] = v;
}

const SYSTEM = `你是一位资深中文报刊编辑。用户会给你一个 JSON 对象,键是字段路径,值是 AI 生成的中文段落(常带翻译腔)。把每个值改写成地道的简体中文报刊/编辑部文风,并原样返回同样键的 JSON。

改写规则(必须全部遵守):
1. 只改语言,不改内容:所有事实、数字、比例、人名、公司名、产品名、模型名、英文术语(如 agent、prompt、API)必须原样保留,不得增删或换算。
2. 全部改用全角中文标点(,。:;?!""),数字与英文单词前后保留正常空格习惯即可。
3. 大胆重写句式,不要只改标点。原文是从英文思路直译过来的,你要按中文的表达习惯重新组织:拆掉英语式长从句,换成中文短句节奏;该换词就换词(如"落地"→"跑出结果"、"检验方法"→"验法"等,视语境定);删掉『』引号式概念标注(仅确有必要的引用处保留)。
4. 以下 AI 套话【禁止出现在输出里】,必须换成自然表达:"不是…而是…"、"合在一起看"、"值得注意的是"、"换句话说"、"某种程度上"、"本质上"。若原文用了,重写那句话。
5. 语气:克制、干练的编辑部口吻,像《财新》或老牌周报的编辑在写,不营销、不煽情、不添加原文没有的评价。中英文之间保留一个空格(如"Ludic 那篇"、"agent 判定")。
6. 长度与原文相当,不得明显扩写;键名为 banner 的值是报头标题,必须不超过 20 个汉字。
7. 输出必须是合法 JSON,键与输入完全一致,一个不多一个不少;值只含改写后的文本。`;

async function polishBatch(batch, label) {
  const body = {
    model: "deepseek-chat",
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: JSON.stringify(batch) },
    ],
    response_format: { type: "json_object" },
    temperature: 1.0,
    max_tokens: 8000,
  };
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error(`polish-zh: ${label} attempt ${attempt} HTTP ${res.status}`);
      if (attempt === 3) throw new Error(`DeepSeek HTTP ${res.status}`);
      continue;
    }
    const data = await res.json();
    try {
      const out = JSON.parse(data.choices[0].message.content);
      const missing = Object.keys(batch).filter(
        (k) => typeof out[k] !== "string" || !out[k].trim()
      );
      const extra = Object.keys(out).filter((k) => !(k in batch));
      if (missing.length || extra.length)
        throw new Error(`key mismatch (missing: ${missing}; extra: ${extra})`);
      return out;
    } catch (e) {
      console.error(`polish-zh: ${label} attempt ${attempt} bad response: ${e.message}`);
      if (attempt === 3) throw e;
    }
  }
}

// batch fields so each request stays well under the output token cap
function makeBatches(fields, maxChars = 2200) {
  const batches = [];
  let cur = {}, size = 0;
  for (const [k, v] of Object.entries(fields)) {
    if (size + v.length > maxChars && Object.keys(cur).length) {
      batches.push(cur); cur = {}; size = 0;
    }
    cur[k] = v; size += v.length;
  }
  if (Object.keys(cur).length) batches.push(cur);
  return batches;
}

const files = process.argv.slice(2);
if (!files.length) {
  console.error("usage: polish-zh.mjs <digest.json> [...]");
  process.exit(1);
}

for (const file of files) {
  const d = JSON.parse(fs.readFileSync(file, "utf8"));
  const fields = collectFields(d);
  const batches = makeBatches(fields);
  console.log(`${file}: ${Object.keys(fields).length} zh fields in ${batches.length} batches`);
  const polished = {};
  const results = await Promise.all(
    batches.map((b, i) => polishBatch(b, `${path.basename(file)}#${i + 1}`))
  );
  for (const r of results) Object.assign(polished, r);
  for (const [p, v] of Object.entries(polished)) setByPath(d, p, fixSpacing(v));
  fs.writeFileSync(file, JSON.stringify(d, null, 2) + "\n");
  console.log(`${file}: polished ${Object.keys(polished).length} fields ✓`);
}
