# mrqb.space 全站体检 · 2026-08-04

五模型联席审计（Claude 主审 + DeepSeek、Kimi、GPT、Gemini）。两轮：独立审计 → 匿名互评与修订 → 主审裁决合稿。
所有发现均已对照线上实测、源码或截图核实；被证伪的发现记录在文末，不进清单。

严重度口径：**P0** 可造成生产/密钥级事故或数据损坏；**P1** 破坏核心阅读、分享或可靠性；**P2** 体验与完成度。

---

## 优先修复清单（跨版块）

| # | 改什么 | 为什么值得 | 量 |
|---|---|---|---|
| 1 | **拆分 CI job**：生成步（无 secrets、不可写脚本）→ 产物 schema 校验 → 部署步（干净 checkout + secrets） | P0。当前单 job 里，`--dangerously-skip-permissions` 的 Claude 读不可信网页后，同一 checkout 的 `bin/ci-publish.sh` 携 10 个 secrets 执行：提示注入可先改脚本，再借下一步窃密或发 prod | L |
| 2 | **二维码域名写死 `https://mrqb.space`** | P1。`index.html` 里硬编码 `zen-digest.vercel.app`——每张发小红书的长图都在给旧域导流。注意别用 `location.origin`：preview 部署导出会把预览域烤进码里 | S |
| 3 | **`esc()` 实现真转义 + URL 协议白名单** | P1（潜在 P0）。`const esc = s => String(s ?? '')` 没转义任何字符，AI 生成的标题/摘要与抓来的 URL 直接进 `innerHTML`/`href`。今日内容尚安全，但一个 `<T>` 就破版，一个 `javascript:` URL 就是注入 | S |
| 4 | **`loadDay`/`index.json` 错误态** | P1。某期 JSON 404 或损坏时，页面永远停在「排版中…」，无任何提示。无人值守发布必须有兜底 | S |
| 5 | **head 补 OG / description / favicon / robots.txt** | P1。实测全部缺失或 404，微信/X/Telegram 里贴链接是白卡——这正卡住"分享给朋友"这件事 | S |
| 6 | **改写 how-it-works 的发布章节 + 补第 8 步编号** | P1。特稿仍写「launchd 20:57 → 本机 → preview → 次日人工 `vercel --prod`」，真实链路已是 GitHub Actions 云端成稿、过闸自动发 prod；正文步骤 1–7 后直接跳 9 | S |
| 7 | **退订改 GET 确认页 + POST 变更；token 加长** | P1。`api/unsubscribe.js` 用 GET 直接改订阅状态——邮件安全扫描器或链接预取会替用户退订；`ref_code` 仅 8 位十六进制 | M |
| 8 | **URL 同步 `?d=` 与 `?lang=` + 上/下一期 + title 带期号** | P1。切期切语言都不回写 URL，复制地址永远打开最新一期中文版；19 期后唯一导航是在裸日期下拉框里盲选 | S |
| 9 | **期号固化写进 JSON** | P1。期号 = `allDays.length - idx` 现算，回填旧期会让所有历史期号整体位移（回填 08-02/03 时已发生） | S |
| 10 | **生成 feed.xml + sitemap.xml** | P1。日报没有 RSS，而内容本就是结构化 JSON，publish 时顺带产出近乎零成本 | S |
| 11 | 最新一期 prerender 进静态 HTML（或至少 noscript 摘要） | P2。纯客户端渲染，爬虫与链接预览只看到「排版中…」 | M |
| 12 | a11y / 细节包（见下） | P2。单项都很小，合起来是"分享出去第一眼"的完成度 | S |

---

## 逐版块

### 1. 刊头与整体视觉
无重大问题——毛笔报名、报宣红、导读格、楷体按语构成了成立的识别系统，报纸隐喻是加分项。
- 【P1】正文 12.5–13.5px、byline 低至 9.5px，`--faint #8b8577` 对纸色约 3.5:1，不满足 WCAG AA。正文提到 15–16px，`--faint` 加深至 ≥4.5:1。
- 【P2】`.pub-strip` 塞了 7 个控件（编发/日期/期数/合订本/特稿/EN/长图），375px 下折成 3–4 行，更像工具栏。拆成"阅读导航"与"操作区"两组。
- 【P2】报耳「第 — 期」在 JS 加载前长期显示破折号占位。

### 2. 今日可行动
位置正确（banner → 要图 → actions → 正文流），编号与来源链接齐全。
- 【P1】单条 200–300 字重讲新闻，真正的动作埋在段尾。建议固定成「动词开头一句话 ｜ 耗时 ｜ 完成标准」，背景最多一句。
- 【P2】数据结构只有 `text/source/source_url`，缺 `time`/`result`；hands_on 有 `time` 而 actions 没有。
- 【P2】序号 `'一二三四五六'[i]` 超过 6 条会突然跳回阿拉伯数字。

### 3. 版面 items
- 【P1】`esc()` 假转义（见清单 3）。
- 【P2】`id="sec-${platform}"` 产生 `sec-Hacker News`——HTML5 明确禁止 id 含 ASCII 空白，锚点跳转脆弱。slugify 即可。
- 【P2】`likes` 缺失时 byline 渲染出悬空的「赞」字（`fmtN(null)` 返回空串，但「赞」还在）。
- 【P2】标题已链原文，byline 末尾又出现「原文↗」，同一 URL 一条目两次。（少数意见：移动端大标题易误触，保留小按钮更稳——见文末分歧）
- 【P2】"Hacker News/文摘"是发现渠道，byline 里却把 Fortune、Nikkei、Simon Willison 等原始来源混在同一字符串，一手/转述/聚合关系不可辨。

### 4. 本报社评
无重大问题——楷体、缩进、`break-inside: avoid` 的版式区隔到位，跨新闻并置的判断力是本栏价值所在。
- 【P1】社评仍详细复述条目已述事实，同一故事读者读了三遍（item summary → why → 社评）。在 STYLE-ZH 里加一条硬约束：社评不重复条目事实，只做并置与判断。
- 【P2】200+ 字整段无分段；JSON 若含 `\n\n` 应渲染为 `<p>`。

### 5. 今日上手
无重大问题——盒装、有序步骤、来源标注齐全，是全站可执行性最强的一栏。
- 【P2】`word-break: break-all` 会把英文单词和命令从中间硬断（`cursor.co-m/...`）。改 `overflow-wrap: anywhere`。
- 【P2】数据字段叫 `hands_on`、特稿叫「今日上手」、主页显示「今日试新」——三处命名不一致。
- 【P2】标题写「今晚十分钟」而 `time` 字段写别的时长时，读者会先信标题。

### 6. 升级公告 OTA
无重大问题——「今日所学 —/新增能力 ＋」的符号语言清晰，殿后位置合理。
- 【P1】OTA 常复述当天新闻，构成同一故事的第四次重复。OTA 只该回答"系统改了什么 ｜ 如何验证 ｜ 下期哪里不同"。
- 【P2】未区分"想法/已实施/已验证"，写进台账容易被读成已经生效的能力。
- 提升点：头部加累计计数（「第 N 次自我升级」），把"逐日复利"从叙述变成每天可见的证据。

### 7. 往期合订本
- 【P1】无上/下一期导航；下拉框只有裸日期，无期号无标题，19 期后无法凭记忆找。
- 【P1】期号动态计算（见清单 9）。
- 【P2】`archive.html` 无 EN 切换、无 meta，与主站品牌承诺不一致。
- 【P2】某期加载失败时 archive 静默跳过，但顶部计数仍按总数——缺刊被隐藏且数量对不上。

### 8. 中英切换
- 【P1】语言状态不落盘不回写 URL，刷新/分享即丢失。
- 【P1】覆盖不全：`fmtN` 在英文模式仍输出「万」；`ho.time` 没走 `T()`；archive 与 how-it-works 完全中文。当前更准确的说法是"本期正文英文版"，不是全站双语。
- 【P2】`document.title` 恒为「每日情报」，19 期在书签/历史里无法区分。
- 【P2】英文正文沿用楷体 + `text-indent: 2em` + 两端对齐，窄栏里空格不均。为 `html[lang=en]` 单设 Latin serif、左对齐、`hyphens: auto`。

### 9. how-it-works 特稿页
- 【P1】流程描述已过时 + 第 8 步编号断档（见清单 6）。
- 【P1】入口只有 pub-strip 一个小链接；与特稿最相关的 OTA 盒尾部和 footer 都没有导流。
- 【P2】公开展示 `--dangerously-skip-permissions` 却未解释隔离边界，透明度反而变成安全疑虑。

### 10. 工程与基础面
- 【P0】CI 供应链（见清单 1）。
- 【P1】esc / 错误态 / OG-favicon-robots / 退订 GET / RSS-sitemap（见清单）。
- 【P1】订阅代码与注释矛盾：注释写「后端暂缓 parked，改回 true 即可」，代码里 `SUBSCRIBE_LIVE = true` 且线上 API 实测在线（GET 405）。涉及用户邮箱数据，必须核实哪个是意图。
- 【P1】订阅失败时 `form.style.display='none'` 隐藏整个表单，用户只能刷新才能重试。
- 【P2】a11y 包：hero `alt=""` 与 figcaption 脱节；`select:focus { outline: none }` 无替代焦点样式；`.rise` 未响应 `prefers-reduced-motion`；email input 无关联 `<label>`；结果区无 `aria-live`；导读格无 `:focus-visible`。
- 【P2】性能：4 个 Google Fonts 家族（Ma Shan Zheng 全字库尤大）未子集化；hero 图无宽高（CLS）；CDN 脚本（html2canvas / qrcodejs）无 SRI。
- 【P2】「⬇ 分享长图」按钮的代码与注释都叫 PDF，实际导出 PNG。

---

## 被证伪 / 不采纳的发现

- **"版面上出现了『（截断）』垃圾数据"**（Gemini）——那是审计材料里我方截断的证据文本，线上 JSON 无此问题。
- **"HTML5 允许 id 含空格"**（Gemini 的纠错）——错。HTML5 明确要求 id 不含 ASCII 空白，原始发现成立。
- **"缺 `noreferrer` 会泄露 referrer"**（DeepSeek）——现代浏览器对 `target="_blank"` 已默认 `strict-origin-when-cross-origin`，`noopener` 已够。
- **"how-it-works 表格在 <480px 会撑破布局"**（DeepSeek）——表格 `width:100%`、两列短文本可换行，无不可断长 token。
- **"PWA / Service Worker 离线缓存"**（Gemini）——纯静态日报，收益与维护成本不成正比。
- **"网页正文取消三栏"**（GPT）——三栏是产品身份，移动端已降单栏。接受其"桌面端需要上下回滚"的代价，记为已知取舍，不列为缺陷。

## 存在分歧的一条

byline 末尾的「原文↗」：多数意见认为与标题链接重复，违反"说一次"；Gemini 主张移动端大标题易误触，保留一个明确的小按钮是更稳的触控兜底。两种都讲得通，取决于你自己在手机上点哪个。

---

*方法：五个前沿模型各自独立审计同一份材料（源码 + 整页截图 + 线上实测），互相匿名评阅后修订，主审逐条裁决事实争议。Kimi 在第二轮因额度用尽退出，其第一轮发现已并入。*
