---
name: daily-digest
description: Produce today's entry for Zen's personal digest website (~/zen-digest) — run the platform sweeps (headless backbone: YouTube + 文摘/newsletters; optional enrichment when Chrome is up: X + 小红书), distill into actionable items, write digests/<date>.json, and deploy the site. Trigger on "daily digest", "make my digest", "今日情报", "update my digest site", "run the digest". Read-only sweeps; the output is Zen's own website.
---

# daily-digest — sweep platforms → one actionable page on Zen's site

Site repo: `~/zen-digest` (static, no build step: index.html + digests/*.json).
The page leads with **✅ 今日可行动** — every digest must surface 2-4 concrete actions,
not just summaries. Zen reads this instead of the feeds.

## Steps

1. **Sweep each live platform** (skip gracefully if a session is missing, and say so).
   **Two lanes are fully headless (YouTube + 文摘) and are the diversity backbone** —
   sweeping both reaches ≥2 platforms so the gate passes with NO `partial:true`. X and
   小红书 are **optional enrichment** used only when Chrome is available; their absence
   no longer forces a partial issue.
   - **文摘 / Text (LIVE, fully headless — added 2026-07-18)**: roster in
     `~/zen-digest/sources/text.json` (Hacker News + Import AI + TLDR AI + Ahead of AI +
     Simon Willison). Fetch each via its RSS feed / front page (WebFetch or scrapling —
     no login), keep items within `window_hours`, pick the 4-6 most relevant; for
     newsletters/blogs read the linked content enough to write a real takeaway (not just
     the headline); for Hacker News keep only AI/LLM/agents/dev-tools/indie-building
     items and read the comments for the real read. Aggregate all picks into ONE source
     object with `platform: "文摘"` / `platform_en: "Digest"`, each item's `author` = its
     source name. This lane exists so a headless run is genuinely diverse without 小红书.
   - **小红书 (OPTIONAL — needs Chrome)**: follow `xhs-brief` skill (rednote.com in Chrome,
     logged in). 40-80 cards, deep-read top ~5. Skip freely when headless — the 文摘 lane
     already carries headless diversity, so a missing 小红书 does NOT require `partial:true`.
     When Chrome IS up, add it as enrichment: append its source object to `sources`
     (order YouTube → 文摘 → X → 小红书), update `swept` counts + `meta_read`. Only set
     top-level `"partial": true` in the rare case where even YouTube AND 文摘 both fail.
   - **YouTube** (LIVE, fully headless): roster in `~/zen-digest/sources/youtube.json`
     (9 channels + lanes + window_hours). For each channel id, fetch
     `https://www.youtube.com/feeds/videos.xml?channel_id=<id>`, keep entries published
     within window_hours (RSS has title/videoId/published/views). Pick the 3-6 most
     relevant; for each: `yt-dlp --skip-download --write-auto-subs --sub-langs "en.*"
     --extractor-args "youtube:player_client=android"`. The `android` client is
     required as of 2026-07: the default `web` client now hits
     `ERROR: The page needs to be reloaded` because YouTube force-enables SABR
     streaming for it; `android` skips that and downloads subs fine (no PO token
     needed for subtitle-only requests). If yt-dlp itself is missing, install with
     `pip3 install --user yt-dlp` and invoke via `python3 -m yt_dlp` (may land outside
     PATH). strip the VTT (`grep -v -E '^(WEBVTT|Kind:|Language:|$)|-->' |
     sed 's/<[^>]*>//g' | awk '!seen[$0]++'`), read the FULL transcript and summarize
     WHAT WAS SAID. Read the whole thing — a 9-12k-word talk is ~15 min, well within
     reach; that IS the job ("I watch it so Zen doesn't"). NEVER surface a "未读完 /
     已排入明日深读" flag to the reader — exposing my own to-do queue on the page is
     clutter that breaks the promise. If a transcript is genuinely enormous (>25k words,
     a multi-hour session), chunk it and read every chunk (still fully) — the reader
     never sees that it was chunked. On-screen-only lists: download ≤720p + ffmpeg
     1 frame/5s, read the list frames (proven on Zara's video). (`flag` is ONLY for
     reader-useful warnings — unverified rumors, fabricated provenance — never for my
     process.)
   - **X (LIVE, needs Chrome)**: roster in `~/zen-digest/sources/x.json`. On x.com/home
     (logged in): read the "Today's News" sidebar (free AI trending digest), then sweep
     For You + Following with scroll-and-extract (get_page_text returns tweet text +
     reply/RT/like/view counts; ~4 scrolls). Then visit the roster accounts'
     x.com/<handle> pages for their last-48h posts. X is rumor-heavy: cross-check any
     factual claim against a primary source before it enters the digest, and flag what
     can't be verified (the platform's fabricated-provenance rate is the highest of all
     our sources).
   - **TikTok / Instagram** (when enabled): same claude-in-chrome pattern as XHS on the
     logged-in web feed; per-platform notes live in this skill when built.
2. **Distill** — per platform pick the items worth Zen's time (engagement × relevance).
   **Curation tilt (set 2026-07-18): stay AI-centric, but lean toward AI _application /
   GTM / product_ Zen can directly apply given his background — how teams ship & sell AI,
   monetization & S&O/ads patterns, PM/product decisions, pricing & GTM, agent/tooling
   builds he can copy into his own work.** Prefer applied "how-they-did-it" over
   frontier-model research, benchmark/leaderboard news, or pure architecture (surface
   those only when unusually actionable for him). Adjacent career / edu-business /
   trading items still welcome when clearly usable, not merely interesting.
   For each: title/author/likes/summary/why-it-matters/url; flag
   rumors explicitly. **Zen does not watch the videos — I watch them for him** (his
   explicit ask): read the full transcript and put the actual takeaways straight into
   the summary. Do NOT prefix summaries with 已代读/已替你看完/编辑部已代读全文 — that's
   implied by the masthead tagline (长视频均由编辑部代读) and is noise repeated on every
   item; just give the content. An action item is something Zen DOES (a decision to apply, a thing
   to try, a JD to check) — "去看这个视频" is not an action unless the footage itself is
   the value (a demo he must see, entertainment). Read each picked talk in full before
   summarizing it (no "deep-read queue", no half-read items on the page — see the
   YouTube note). Then write the cross-platform 风向 (meta_read) and the 今日可行动 list.
2b. **Editorial pass — say it once (added 2026-07-17: issues felt repetitive).** The
   failure mode is the SAME 2-3 ideas restated in the banner + photo caption + an action
   + the 社评 + a 编者按 + the 升级公告. Prevent it:
   - **List the day's distinct THREADS first** (a thread = one story/idea, e.g.
     "computer-use 产品化", "给目标不给提示词"). Assign each thread ONE home — its single
     best source item. A thread that headlines the banner does NOT also get its own
     action AND fill the 社评 AND appear in OTA; cross-reference instead ("详见 X版").
   - **Sections have non-overlapping jobs — enforce (see docs/STYLE-ZH.md #12-14 for the
     full rules + the calibrated model; audited 2026-08 as unenforced, don't repeat the
     miss):** ① 今日可行动 = 2-3 actions, each on a DIFFERENT thread (never two actions
     about one story), and each one is a verb-phrase action FIRST, then the time cost,
     then how you'll know it's done — background is at most one sentence, never a
     200-300-character news recap with the instruction buried at the end. ② 本报社评
     (meta_read) = the ONE cross-cutting synthesis the items DON'T state — the pattern /
     "so what" / the off-consensus read — and it must NOT restate facts the item
     summaries already gave; if it's re-listing the day's stories, delete and rewrite.
     ③ 版面 items = the stories themselves; the banner's own item adds detail beyond the
     headline, doesn't repeat it. ④ 升级公告 (ota) = ONLY my tool/skill/memory changes,
     verified against what actually happened — never a news recap; tag each entry
     观察/已实施/已验证 and only let 已验证 entries into new_capabilities; if an OTA line
     reads like a headline it's in the wrong section.
   - **Dedupe across platforms:** if the same event is on YouTube AND X (common — X often
     just reacts to a talk), keep the stronger single treatment and note "同一事两处印证"
     once; don't write it twice.
   - **Dedupe across DAYS (7-day lookback):** before selecting, read the last 7
     issues in digests/ and list their item URLs, authors/domains, and story threads.
     Never re-run a URL already covered. Max ONE item per author/domain per issue
     (platform hosts like youtube.com are exempt — the "author" there is the channel).
     An author/domain featured in either of the last 2 issues needs a clearly
     better-than-the-alternatives reason to appear again — "Simon Willison posted
     again" is not a reason. A RUNNING story (open letters/petitions, a product saga)
     may return only on a material new development, and the blurb must state the
     delta in one clause (上次说到X，今天的进展是Y) — otherwise it reads as a repeat.
   - **Theme diversity:** cap ~2 items per thread across the whole issue. Prefer surfacing
     a NEW thread over a 3rd item on the hot one. A day where every item says "agents take
     over execution" is a failed issue — go find the off-consensus / different-topic items
     (a career move, a business-model shift, a trading signal, an odd build).
   - **Chinese style:** follow docs/STYLE-ZH.md (zen-digest repo) for every zh field —
     exact facts/numbers/names, no officialese or tabloid register, why 栏必须是真判断;
     the 2026-08-04 issue is the calibrated sample.
3. **今日上手 / hands_on (one per issue).** Zen wants to TRY one new thing every day
   (his example: trying scroll-world for the first time). Pick exactly one — from
   today's swept content, or from Zen's own toolbox of built-but-untried capabilities.
   Criteria: concrete (a named tool/feature, not a concept), tryable TONIGHT in ≤30
   minutes, and steps I can vouch for (real URLs / paste-ready commands — if I can't
   state the exact steps, pick something else). Fill `hands_on`:
   `{title, why, time, steps[], source}`. Vary the type across days (a product, a
   workflow trick, one of my skills he hasn't used, a hardware/OS feature). Never
   repeat until the backlog is dry.
3b. **头版要图 / image (one per issue, like a real 人民日报 front-page photo).** Pick
   the visual best matching the day's `banner`, source it as a LOCAL same-origin file
   (cross-origin images taint the html2canvas PNG export — always download, never
   hotlink). Easiest: the lead YouTube story's thumbnail —
   `curl -s "https://i.ytimg.com/vi/<id>/maxresdefault.jpg"` (fall back to
   `hqdefault.jpg` if <3KB) into `~/zen-digest/digests/img/<date>.jpg`. XHS note covers
   or an X screenshot also work if downloaded locally. Set
   `image: {src: "digests/img/<date>.jpg", caption: "<一句话说明>（图：<出处>）"}`.
   The page renders it in original color (lightly toned), framed under the banner with a 本期要图 caption.
4. **OTA self-upgrade — the compounding learner (mandatory; this is the point of the
   whole system).** Zen's framing (confirmed 2026-07-18): **the daily learner is HIS
   Claude Code, not Zen directly** — "Claude learns every day and tells me what new it
   can do, like a Tesla OTA update." Each issue should leave me measurably better at his
   real applied work (AI application / GTM / product, his agents & tools), and that gain
   must COMPOUND day over day, not reset. Each run:
   - **Read the ledger first**: `~/zen-digest/ota-ledger.md` lists every capability I've
     already adopted. Pick today's upgrade to BUILD ON or FILL A GAP in that list — never
     re-adopt something already there; prefer going one level deeper on a live thread over
     a scattershot new one.
   - Pick ≥1 technique/insight from today's swept content that genuinely improves how I
     work for Zen (a workflow trick, tool pattern, better prompt/loop structure) —
     weighted to application/GTM/product utility, since that's where he benefits.
   - IMPLEMENT it, don't just note it: update or create a skill under `~/.claude/skills/`,
     write a memory, or improve this very skill. Local/draft changes only; nothing
     outward-facing. If nothing today clears the bar, say so honestly — no fake upgrades.
   - **Append to the ledger**: add a dated one-line entry to `ota-ledger.md` (what was
     adopted + how to invoke it) so tomorrow's run compounds instead of repeating.
   - Fill the digest's `ota` object: `learned` (what I learned today, plain sentences)
     and `new_capabilities` (what I can now do that I couldn't yesterday, with the
     skill/command name to invoke it). The site renders this as 🆕 今日自我升级. Per
     docs/STYLE-ZH.md #14: tag each entry 观察/已实施/已验证 and only put 已验证 entries
     into `new_capabilities` — this section is about my own tooling, never a recap of
     today's news.
4b. **Bilingual — write an `_en` for every text field.** The site has a 中/EN toggle
   (same newspaper format); EN mode renders `<field>_en`, falling back to Chinese if
   missing. So every rendered text field gets a natural-English sibling: `banner_en`,
   `image.caption_en`, `meta_read_en`, each action's `text_en`/`source_en`, hands_on's
   `title_en`/`why_en`/`steps_en`/`source_en`, and each item's `title_en`/`summary_en`/
   `why_en` (+ `flag_en` if flagged), plus `author_en` when the author has Chinese
   (e.g. "X 热榜" → "X Trending"; personal handles like 动察Beating stay as-is), and the
   `ota` object's `learned_en` / `new_capabilities_en`. Write real English, not
   machine-literal — source titles that are already English can reuse the original.
   Don't translate the masthead brand 每日情报. Platform names: X and YouTube stay; 小红书
   renders as **RedNote** in EN (the site auto-localizes the desk/nav/stat via platName;
   also use "RedNote" in any English `source_en` / prose, never "Xiaohongshu").
5. **Write** `digests/YYYY-MM-DD.json` (schema = copy an existing day's file), and add
   the date to `digests/index.json` (keep it a flat sorted JSON array, no dups).
   Re-running the same day overwrites — that's fine.
6. **Verify locally** — `open ~/zen-digest/index.html` renders via fetch: file:// blocks
   fetch in some browsers, so verify with `python3 -m http.server` in the repo +
   Chrome-tool screenshot, or just deploy and check the URL.
7. **Publish through the gate** — `cd ~/zen-digest && bin/publish.sh <date>`. This is
   the ONLY sanctioned publish path: it runs `bin/validate-digest.py` (the DIVERSITY
   GATE — needs ≥2 source platforms & ≥4 items, else it aborts), commits, then
   `vercel deploy` (PREVIEW). A raw `vercel deploy` bypasses the gate — don't use it.
   A single-lane issue only passes if the JSON has top-level `"partial": true` (set
   that ONLY for an unavoidable headless run; the site then shows a 部分来源缺席 banner
   and the next interactive run must backfill). A git pre-commit hook enforces the same
   gate on any digest commit. Prod needs Zen's literal "ship to prod"; never push without Zen.

## Rules
- 中文一律过 DeepSeek 润色:数字报 JSON 由 publish.sh / ci-publish.sh 自动跑
  bin/polish-zh.mjs;任何新增或改动的静态页中文(index.html / how-it-works.html /
  archive.html 等)在发布前手动跑 bin/polish-zh-html.mjs <file>。两者都要
  DEEPSEEK_API_KEY(.env 或 CI secret),API 挂了照常发布,只是不润色。


- **Public-shareable content** (Zen plans to share the site): write in the paper's
  editorial voice — 本报/编辑部, item commentary labeled 编者按. No personal
  identifying info in any field: no job-search/offer specifics, device names, family,
  employers-in-play, or private project context. Personalized relevance is expressed
  as "适用于…的人" instead of "你的…". Layout genre is RED CN-NEWSPAPER
  (参考消息 × 人民日报; Zen chose this over the vintage-letterpress alternative on
  2026-07-17): near-white newsprint (#fbfaf6), red brush-calligraphy masthead + red
  主办条 + red 版面 nav grid + red 黑体 banner, 黑体 heads / 宋体 body / 楷体 编者按.
  Every issue has: a `banner` headline, a `image` front-page photo (see step 3b),
  actions[]/hands_on with `source_url`, and item bylines linking 原文. The 分享长图
  button exports the whole front page as a broadsheet PNG (masthead QR → prod URL,
  photo included). Don't drift to card layouts or the sepia vintage style.
- **中文去 AI 腔 (added 2026-07-19) — write natural Chinese AT GENERATION, don't fix it after.** Follow the `humanizer-zh` principles; the non-negotiables: almost no 破折号 `——` (用句号/逗号/冒号/括号代替); kill 套话 (值得注意的是、总的来说、随着…不断深入、进一步、赋能、打造、助力、聚焦、抓手、闭环); verbs direct (「优化了」not「进行了优化」;「让」not「使得」;「能」not「能够」); no 「不仅…而且」or 三/四字词凑排比; no 升华结尾 (未来可期/值得期待/拭目以待); short sentences, allow dropped subjects; keep facts/numbers/links/术语 as-is. English `_en` fields follow the English `humanizer` skill instead (em dashes, delve/tapestry, etc.).
- **头条 banner = 报纸标题，学顶级新闻标题 (added 2026-07-19).** `banner`/`banner_en` is a SHORT, punchy front-page HEADLINE like a top outlet (参考消息 / NYT / WSJ / The Economist), NOT a summary. Hard caps: **中文 ≤ 20 字**（最佳 12–18）; **English ≤ 12 words**. One idea, concrete and active; an optional single colon may split two tight halves. NEVER pack the whole issue's thesis, multiple clauses, or the "so what" into the headline — that is 本报社评 (meta_read)'s job. 中文用全角标点（，。：），禁止半角逗号; the English banner has NO em/en dash. Example — ✗ 「开源旗舰一周开了三家，Moonshot 却因 Kimi K3 需求太猛停了新订阅。能力越来越不要钱，真正卡脖子的挪到两头：谁还供得上 token…」 → ✓ 「一周三款开源旗舰，护城河搬出模型」 / "Open weights flood in, the moat leaves the model".
- Read-only everywhere. No likes/follows/comments/posts during sweeps.
- Timezone America/New_York for the date stamp.
- If Zen names a topic ("digest on AI agents"), scope the sweeps to it.
- Overnight runs: reading is allowed overnight; publishing the site via `vercel deploy`
  (preview) is allowed; NEVER `vercel --prod` overnight.
