# EduTool / CourseMapper 全面审计报告

_审计日期：2026-09-01。审计对象：`main` 分支 `44370ac`（v0.18.7）。审计者：Claude（独立、一次性、深度审计）。_

> 这份报告的目的只有一个：把这个网站在代码、架构、安全、性能、UI/UX、产品与工程流程上**所有能看到的问题**一次性列清楚，并给出**具体到技术选型的**未来方向。它不是对半年工作的否定——测试通过率、导出链路、沙箱化的 Agent 工具设计都做得不错——而是把"下一步该往哪走"讲透。

---

## 0. 审计方法与边界

**做了什么（可复现）**

| 步骤                                                                                      | 结果                                                                                                                                                                                          |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 通读源码结构、入口、路由、状态、Provider 调用层、持久化、导出、Agent 工具、本地模型运行时 | 覆盖 `src/` 543 个非测试模块的关键路径                                                                                                                                                        |
| `npm ci` → `npm run build`                                                                | 构建成功，7.8 秒，293 个 chunk，`dist/` 19 MB                                                                                                                                                 |
| `npx eslint .`                                                                            | 0 error / **550 warning**                                                                                                                                                                     |
| `npx vitest run src/`                                                                     | **4541 通过 / 28 跳过**，100 秒                                                                                                                                                               |
| `npm outdated` / `npm audit --omit=dev`                                                   | 2 个 high（`pptxgenjs → image-size`）                                                                                                                                                         |
| jscpd 重复代码检测（`src/`，≥120 tokens）                                                 | 重复率 **0.25%**（很低，这是优点）                                                                                                                                                            |
| Headless Chromium（Playwright + axe-core 4）跑 `vite preview`                             | 截图 36 张：Landing（亮/暗/移动端/OpenAI 模式）、Materials、Configure、Workspace（1440/1024/390，亮/暗）、Lesson Plans、Slide Decks、FAQ、右键菜单、Package 面板、Changelog、Privacy、Contact |
| 用 e2e 的 `exportFixture` 快照灌入 `localStorage` 进入 Workspace                          | 与 e2e 同一条路径，可信                                                                                                                                                                       |

**没做/做不到**

- 沙箱出站代理拒绝 `edutool.dev`，**线上实际响应头、字体是否加载、DNS 指向哪个 host 未能验证**——下文相关结论标注为"按配置推断"。
- 没跑真实的 Scion（Gemma 4 E2B，3.35 GB 下载 + WebGPU）生成，也没用真实 API key 跑付费 Provider；生成内容的教学质量不在本次范围（项目自己已有大量 quality audit）。
- 141 个 Playwright e2e、trellis/evaluation 的证据回放脚本没有全量跑（单次要几十分钟）。

---

## 1. 执行摘要（先看这里）

**一句话结论：这是一个功能野心远超单人维护能力的项目。产品核心（"把 syllabus 变成一套可编辑、可导出、互相对齐的教学材料"）是对的，但它被三层东西压住了：一个 18.6 万行、靠模板和正则硬写的"确定性编译器"；一个 1.5 GB 的仓库 + 402 个 npm scripts + 408 份文档的"证据工厂"；以及一个用了三个名字、十几个内部代号、设计系统采用率约 1% 的 UI。**

十条最重要的发现（按严重度）：

1. **P0 · 仓库 868 MB，模型权重进了 git 历史。** `trellis/tendril/distill/**` 下有 90 MB 的 `model.safetensors` 和二十多个 52 MB / 11 MB 的 adapter checkpoint 被 track。`.gitignore` 里写了 `*.safetensors`，但历史已经污染。每次 clone/CI checkout 都在付这个成本。
2. **P0 · 两套部署流水线同时对同一个域名发布。** `deploy.yml`（Firebase Hosting）和 `emergency-pages.yml`（GitHub Pages，`public/CNAME = edutool.dev`）都在 "Fast verification" 成功后自动跑。谁赢看 DNS。GitHub Pages 那条**没有任何 CSP / 安全响应头**，而 `docs/DEPLOYMENT_SECURITY.md` 的全部安全承诺都建立在 Firebase 的 header 上。
3. **P0 · CSP 会封掉自己的字体。** `index.html` 从 `fonts.googleapis.com` 加载 Inter/Montserrat/Open Sans，但 `firebase.json` 的 CSP `style-src`/`font-src` 都没放行 Google Fonts。按配置推断，Firebase 上线版本的 Inter 根本没加载，全站回退到系统字体；Montserrat 和 Open Sans 则只在 PPTX 导出规格里用到，网页端纯属浪费请求。
4. **P0 · API key 的"安全存储"是固定密钥 XOR。** `secureStorage.js` 用常量 `'CM$ecur3'` 做 XOR 再 base64，文件注释自己承认 "NOT real encryption"。任何 XSS、任何共享电脑、任何浏览器扩展都能拿到明文 key。隐私政策却写着 key 是"stored in your browser's local storage"——技术上对，但用户以为的"安全"并不存在。
5. **P0 · 上帝文件。** `courseBlueprintCompiler.js` **28,664 行 / 1.5 MB**，562 个顶层函数；`useDeliverables.js` 6,515 行；`AppFlow.jsx` 4,420 行（23 个 `useState`、15 个 `useEffect`）；`ChatPanel` 接收 **66 个 props**；`useProjectPersistence` 接收约 55 个参数。50 个非测试文件超过 1000 行。
6. **P1 · Provider 调用层不存在。** 直接 `fetch` OpenAI/Anthropic/Google/DeepSeek 的代码散落在 **11 个文件**，`anthropic-dangerous-direct-browser-access` 头复制了 **9 份**，其中一份在早已"移除"的 `FaqChatbot.jsx`（817 行死代码）。
7. **P1 · 设计系统写了，但没人用。** `docs/DESIGN_SYSTEM.md` 定义了 token 和 `Button/Card/StatusBadge` 原语；实际 `text-ink-*` 用了 23 次，`text-slate-*` 用了 **1,691 次**，`dark:` 前缀 **1,197 次**，`index.css` 里 **187 个 `!important`** 和 186 条 `.dark` 覆盖规则（包括 `[class*='bg-white/']` 这种属性选择器）。`Button` 原语只有 1 个文件在 import。
8. **P1 · 首页在空闲时预加载整个 Workspace 依赖图。** 一次 Landing 访问触发 ~150 个请求（49 个 JS 文件 + 100 多个被中止的 modulepreload），控制台每次都报 "Preload assets timed out"。Privacy/Contact 这种静态页因为 `App` 被 `display:none` 挂在下面，也要下载 **1.6 MB** JS。Changelog 是一个 **617 KB 的 JS chunk**（`releaseManifest.js` 源码 509 KB），页面正文 58.7 万字符。
9. **P1 · 工程流程把"证据"当产品。** `package.json` 402 个 scripts（218 个 `audit:*`）；CI 9 个 job、每个都重新 `npm ci`；`pre-push` 钩子在推 main 前顺序跑 **26 条命令**（含全部单测 + 141 个 e2e + 各种 evidence replay）；`docs/` 408 个文件；README 312 KB；ROADMAP 150 KB；`tests/` 里 88 个测试文件以版本号命名（`v0141-phase1-compiler.test.js`……），测试代码 19.4 万行比产品代码还多。
10. **P1 · 三个名字、十几个代号直接漏到用户面前。** 浏览器标签叫 Course Mapper，logo 是 EDUTOOL.DEV，配置栏写 "Scion V0.18.7 · Connected"，Changelog 满屏 "texture receipts / P1 findings / roundtable"。一个大学老师不知道 Scion 是什么，也不知道 "13 source gaps" 要不要担心。

**各维度打分（10 分制，3 分以下需要立即处理）**

| 维度         | 分  | 一句话                                                        |
| ------------ | --- | ------------------------------------------------------------- |
| 产品核心价值 | 7   | 方向对、差异化真实（本地免费 + 结构化 + 导出）                |
| 功能完整度   | 8   | 10 种 deliverable、导出、Agent、云同步、离线模型，全都有      |
| 架构         | 3   | 上帝文件、无 Provider 层、无类型、prop drilling               |
| 代码质量     | 4   | 重复率低、测试多；但可读性、可维护性差                        |
| 安全         | 4   | 没有明显 XSS；但 key 存储、CSP、供应链、注入边界都薄          |
| 性能         | 4   | 构建快；首屏请求风暴、CSS 臃肿、PNG logo 864 KB、3.35 GB 模型 |
| UI 视觉      | 5   | 干净但"AI 默认脸"；品牌感弱；三套按钮                         |
| UX 流程      | 4   | 向导→IDE 的心智跳跃；术语墙；三栏挤压内容                     |
| 无障碍       | 6   | Landing 零 axe 违规；Workspace 有对比度/嵌套交互问题          |
| 工程流程     | 3   | 仓库臃肿、双部署、CI/pre-push 过重、历史被 squash             |
| 文档         | 3   | 数量极多，但是日记不是文档；新人无法上手                      |

---

## 2. 项目体量与仓库健康

| 指标                 | 数值                                                                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| git 对象包           | 866 MiB                                                                                                                                           |
| 跟踪文件             | 4,345（`evaluation` 1,681、`src` 866、`docs` 408、`scripts` 361、`release-contracts` 312、`trellis` 307、`tests` 233、`verification-output` 100） |
| 提交数 / 作者        | 56 / 1（首个提交 2026-08-03，一次性带入 4,079 个文件——半年历史已丢）                                                                              |
| `src/` 非测试代码    | 254,638 行（`src/lib` 186,381、`components` 39,582、`hooks` 13,763）                                                                              |
| 测试代码             | 193,535 行，612 个测试文件                                                                                                                        |
| >1000 行的非测试文件 | 50 个；>500 行 105 个                                                                                                                             |
| `package.json`       | 72 KB，402 个 scripts                                                                                                                             |
| 工作区磁盘           | `trellis/` 1.1 GB、`evaluation/` 88 MB、`docs/` 8.1 MB、`public/` 9.1 MB                                                                          |

### R1 · 模型权重在 git 历史里（P0）

`git ls-files` 里最大的 30 个文件全部是 `trellis/tendril/distill/**/*.safetensors`（90.8 MB `stance-model/model.safetensors`，`adapters-g4v2/` 9 个 52.8 MB checkpoint，`adapters-s3/` 13 个 11.7 MB checkpoint……）。`.gitignore` 最后一段写着 "model artifacts belong in immutable external storage, never in new Git history"，说明作者知道，但只是止损没有清理。

**修：** `git filter-repo --path-glob '*.safetensors' --invert-paths`（或 BFG），强推重写历史（单人仓库可以做）；权重放 Hugging Face Hub / R2 / GitHub Release。做完仓库应回到 100 MB 以内。

### R2 · 仓库是三个项目的混合体（P1）

- `src/` + `public/` + `tests/`：产品。
- `trellis/`（含 Python venv、蒸馏管线、tutor bundle）：ML 研究。
- `evaluation/` + `release-contracts/` + `verification-output/` + `scripts/*Audit*.mjs`：证据/回放系统。

`verification-output/` 在 `.gitignore` 里，却有 100 个文件被 track（先提交后忽略）。`evaluation/scion-source-compiler-replay-v0.16.40` 到 `v0.16.47` 每个版本 1.2 MB 各存一份。`docs/history/v0.15/` 192 份文档。

**修：** 拆成 `edutool-app`、`edutool-research`、`edutool-evidence` 三个仓库；产品仓库只保留能在 5 分钟内跑完的测试。

### R3 · 部署：双流水线 + 安全头只在其中一条（P0）

```
ci.yml (Fast verification) ── success on main ──┬──> deploy.yml          → Firebase Hosting（有 CSP 等 header）
                                                └──> emergency-pages.yml → GitHub Pages（无任何 header，CNAME=edutool.dev）
```

两条都会跑。git log 显示 08-31 一天内 "migrate hosting to Firebase" → "Add emergency GitHub Pages deployment" → "Restore automatic GitHub Pages publishing"。这不是冗余，是不确定性：线上到底是哪个版本、有没有 CSP，取决于 DNS 记录和两条 workflow 谁后完成。

**修：** 只保留一条（建议 Firebase 或 Cloudflare Pages，因为需要自定义 header）；删掉 `public/CNAME` 和 `emergency-pages.yml`；把 `firebase.json` 的 header 复制到 `_headers`（若用 Cloudflare Pages）。

### R4 · `package.json` 402 个 scripts，218 个 `audit:*`（P1）

`audit:scion:base-freeze:v0.16.76`、`audit:scion:semantic-expansion-evidence:v0.16.61` 这种带版本号的 script 是一次性任务，不应该活在 `package.json` 里。新人打开 `npm run` 看到 402 行等于什么都看不到。

### R5 · CI 与 pre-push 门槛过重（P1）

- CI：9 个 job，每个独立 `npm ci`（无缓存共享的 workspace artifact），其中 4 个 job 只是在回放历史证据 JSON（`evidence-lineage`、`evidence-review`、`adapter-readiness`、`texture-quality`）。
- `scripts/prePushGate.mjs`：推 main 前本地顺序执行 26 条命令，包括 `npm test`（4,541 单测）和 `npm run test:e2e`（141 个浏览器测试，`webServer` 会重新 build Scion runtime）。这意味着每次推 main 要等十几到几十分钟，而且是在开发者机器上。
- ESLint 用 `--quiet` 跑，550 个 warning 永远不会挡住任何人，于是从 v0.8 一路累积到现在（410 个 `no-unused-vars`、33 个 `react-hooks/exhaustive-deps`、69 个 `react-refresh/only-export-components`）。

**修：** CI 收敛到 3 个 job（static+build、unit、e2e-smoke），evidence 回放改成 nightly；pre-push 只跑 lint + typecheck + 受影响的单测；`exhaustive-deps` 升为 error 并清零。

### R6 · 依赖（P2）

| 包                | 当前   | 最新   | 说明                                                      |
| ----------------- | ------ | ------ | --------------------------------------------------------- |
| react / react-dom | 18.3.1 | 19.2.x | 差一个大版本；Actions、`use()`、编译器都用不上            |
| tailwindcss       | 3.4.19 | 4.3.x  | v4 的 `@theme` token 正好解决当前双主题系统的问题         |
| pdfjs-dist        | 4.8.69 | 6.3.x  | 差两个大版本                                              |
| pptxgenjs         | 4.0.1  | —      | 传递依赖 `image-size` 有 2 个 high（ICNS/JXL 死循环 DoS） |
| eslint            | 9.39   | 10.9   | —                                                         |
| `engines`         | 无     | —      | CI 用 Node 22，本地不受约束                               |

好的一面：Vite 8 / Rolldown、Vitest 4、Playwright 1.58 都是新的；没有 `overrides` 黑魔法。

---

## 3. 架构

### A1 · 上帝文件与"编译器"（P0）

`src/lib/courseBlueprintCompiler.js`：28,664 行、1,513,332 字节、562 个顶层函数、46 个 `_RE` 正则常量、23 个导出。它不是编译器，它是一个用英文模板 + 正则 + 启发式规则把 LLM 输出"修"成教学材料的巨型脚本。同类文件还有：`deliverablePostProcess.js` 4,334 行、`deepQualityGrader.js` 4,319 行、`nativeGraphAuthoring.js` 4,042 行、`algiKernelComposer.js` 3,641 行、`publicScionProvider.js` 2,525 行（开头 100 行就是 20 个几百字符长的正则）。`src/lib` 总计 18.6 万行。

这带来三个后果：

1. **每一种课程类型都要写新代码。** `musicTheoryQuizFrames.js`（1,057 行）、`bayesianQuizFrames.js`、`scionLanguageCompilerFrames.js`、`verifiedDraftVisualQuizFrames.js`……音乐理论有专门的 quiz 模板，那哲学、护理、法律呢？这条路无穷无尽。
2. **它在和模型对抗而不是使用模型。** 这套东西存在的原因是 Gemma 4 E2B（20 亿参数量级、4-bit）在浏览器里写不出合格的教学材料，于是用 18 万行代码补。但 2026 年的前沿模型（含便宜的 mini 级）用 structured output / tool use 就能直接产出符合 schema 的 JSON。
3. **没人能改。** 单个 843 KB 的 chunk，`vite.config.js` 里 80 多条手写 `manualChunks` 正则只是为了让 bundle budget 脚本不报错。

### A2 · React 层：状态没有归属（P0）

- `AppFlow.jsx` 4,420 行：23 个 `useState`、15 个 `useEffect`、140 行 import，同时负责路由、生成编排、finalizer、导出、菜单、模态框、移动端切换。
- `useDeliverables.js` 6,515 行——一个 hook。
- `useStreamReader.js` 1,604 行，命名是 hook，**内部一个 React hook 都没有**（0 个 `useState/useRef/useEffect`），实际是流式请求的类库，被当 hook 调用只是为了能读 context。
- `ChatPanel` 66 个 props；`useProjectPersistence` 约 55 个具名参数（含 `gen, deliv, rev, version` 四个"兄弟 hook"整个传进去）。
- 四个 Context（`Auth/AIConfig/UI/Course`）+ 一个 reducer store，**没有一个用 `useMemo` 包 value**——任何一个字段变化，所有消费者全部重渲染。
- 84 处 `key={i}`/`key={index}`。

### A3 · Provider 调用层不存在（P1）

直接构造 provider 请求的文件：`ModelConfig.jsx`、`useStreamProcessor.js`、`useStreamReader.js`、`modelCapabilities.js`、`googleProvider.js`、`agentProviders.js`、`detectLessons.js`、`imageSearch.js`、`customDeliverableLibrary.js`、`modelRequestBuilders.js`、`FaqChatbot.jsx`。同一个 Anthropic 浏览器直连头复制 9 份。加一个 provider（比如 OpenRouter 已经半接入）要改 11 处。

### A4 · 路由（P1）

- `main.jsx` 手写 hash 路由，只有 4 个静态页；Workspace 内部（哪个 deliverable、哪一课、哪个面板）**没有 URL**，浏览器后退直接回 Landing，无法分享/收藏某一课。
- 静态页时 `<App />` 被 `display:none` 挂着（为了保状态），代价是 Privacy 页下载 1.6 MB JS、执行 Scion runtime canary、Firebase Auth 监听。
- `#/faq` 重定向逻辑还在，`FaqChatbot.jsx` 817 行死代码还在。

### A5 · 首页预加载与 Bundle 策略（P1）

`App.jsx` 在 `requestIdleCallback` 里 `import('./AppFlow')`；AppFlow 的静态 import 图非常大，于是一次 Landing 访问：49 个 JS 文件实际下载 + 100 多个 `<link rel=modulepreload>` 被中止（headless 里 `DOMContentLoaded` 12.7 s，真实网络会好一些但请求数不变）。`vite.config.js` 里 `resolveDependencies` 手工过滤三个 chunk 不进 HTML，说明作者已经在和这个问题搏斗。

`bundle:check` 的预算（entry 260 KiB raw / 80 gzip）变成了架构决策的驱动力——Changelog 里反复出现 "budget ratcheted down 256→255"。预算应该是护栏，不是目标。

### A6 · 死代码与命名（P2）

从未被 import 的模块：`components/ExamSummary.jsx`、`ExportBar.jsx`、`FileUpload.jsx`、`VersionTimeline.jsx`、`chat/ProgressCard.jsx`、`lib/exporters/exportAll.js`、`rubricExporter.js`，以及只被注释提到的 `pages/FaqChatbot.jsx`。

内部代号：Course Mapper、EduTool、CurriculumOS、Scion、Algi、Trellis、Tendril、Composer、Prof、Crucible、Genome、Foundry、Roundtable、Codex。代码里 `PUBLIC_SCION_PROVIDER_ID === 'public'`，`normalizeStoredProvider` 还要把 `webllm`/`free`/`local`/`public` 四个历史名互相映射。

### A7 · 测试（P2）

4,541 个单测 100 秒跑完、全绿，这是真正的资产。但：

- 88 个测试文件按版本号命名（`v0141-…`、`v01654-…`、`v01710-…`），它们锁定的是"某个版本的行为"而不是"产品应该怎样"，重构时会成片报错且无法判断该不该改。
- 大量 "proof" 测试是回放 `evaluation/` 里的 JSON（`scionBaseFreezeV01676Audit`、`codex-cross-revision-evidence`……），它们证明的是"结果没变"，不是"结果是对的"。
- `screens/`、`pages/` 0 行测试；`hooks/` 13,763 行只有 1,472 行测试。

### A8 · 没有类型（P2）

25 万行 JavaScript，没有 TypeScript、没有 JSDoc 类型检查（`// @ts-check` 只在一个 spec 里）。`CourseIR`、`courseMap`、deliverable 数据形状全靠 `expandKeys/keyMaps` 和运行时 normalize 函数兜底（`normalizeQuizBankQuestionCounts`、`normalizeSlideDeckAccessibility`……几十个）。

---

## 4. 安全与隐私

先说做得对的：`DOMPurify` 在 KaTeX 和 Mermaid SVG 两处都用了且配置正确（`securityLevel: 'strict'`、svg profile）；Markdown 链接协议白名单；自定义 Agent 工具是声明式 plan（无 `eval`/`new Function`）；仓库里没扫到泄漏的 `sk-`/`AIza` 真实密钥；Firestore 规则做到了 owner-only。

### S1 · API key 存储（P0）

```js
// src/lib/secureStorage.js
const XOR_KEY = 'CM$ecur3'; // 固定密钥
export function setSecure(key, value) {
  localStorage.setItem(key, 'obf:' + btoa(xor(value)));
}
```

- 固定密钥 XOR 等于明文。任何注入脚本、任何浏览器扩展、任何能碰到这台电脑的人都能取出用户的 OpenAI/Anthropic key。
- `getSecure` 还兼容旧的明文值。
- 默认行为是"输入即永久保存"（`saveApiKeyForProvider` 在 credit check 通过后自动写入），没有"仅本次会话"选项，登出 Google 账号也不清除。

**修：** 默认只放内存；提供显式 "Remember on this device" 开关；勾选时用 WebCrypto `AES-GCM` + 用户口令派生密钥（PBKDF2/Argon2）或至少 `sessionStorage`；登出/关闭 tab 清空；隐私页如实描述。长期看，BYOK 在浏览器里天然不安全，这也是下文建议加一个极薄后端的原因之一。

### S2 · CSP 与部署（P0）

- `firebase.json` CSP：`style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; font-src 'self' data: https://cdn.jsdelivr.net`——`fonts.googleapis.com`/`fonts.gstatic.com` 不在白名单，但 `index.html` 加载它们。按配置推断线上字体被 CSP 拦截。
- GitHub Pages 那条部署没有任何 header。
- `script-src` 放行整个 `cdn.jsdelivr.net` 和 `cdnjs.cloudflare.com`；KaTeX、Mermaid、html2canvas、pdf.js worker 运行时从 CDN 动态 `import()`，**没有 SRI**。CDN 被投毒 = 全站被投毒。
- `'unsafe-inline'` 样式 + `dangerouslySetInnerHTML` 的组合让 CSP 对样式注入没有防护。

**修：** 字体自托管（`@fontsource`）；运行时库打进 bundle（KaTeX 300 KB 可以懒加载但应 self-host）；`script-src 'self'` + nonce；`style-src` 去掉 `unsafe-inline`（Tailwind 编译后不需要）。

### S3 · Firebase（P1）

- 规则 `match /users/{userId}/{document=**}` 允许用户在自己名下建任意子集合、任意文档，`hasReasonableFieldCount()` 只限字段数不限大小；没有 App Check，公开的 Web API key 可被脚本刷 Firestore 配额。
- 没有 Firestore 侧 schema 校验（`sanitizeProjectSnapshot` 只在客户端）。

**修：** 启用 App Check（reCAPTCHA Enterprise / Turnstile）；规则里按集合名 `match` 并校验 `request.resource.size()`；`users/{uid}` 下只允许 `projects`、`customDeliverables`、`developerTemplates` 三个子集合。

### S4 · Prompt 注入边界（P1）

上传的 syllabus 文本、Wikipedia/DOAJ/Europe PMC 抓回来的段落、以及 `.coursemapper` 项目文件里的历史聊天记录，都会进入 system/user prompt；Agent 拥有 31 个工具，其中 `edit_course_map`、`edit_deliverables`、`save_preference`、`update_local_facts`、`forget`、`create_tool`、`run_tool` 是有副作用的。全代码库 grep `injection` 只命中一句无关注释。一个精心构造的 PDF 可以让 Agent 改写整个课程或删掉用户偏好。

**修：** 把文件内容和外部检索结果放进带明确分隔与"数据非指令"声明的 `<document>` 块；副作用工具走 `agentConfirmationPolicy` 强制确认（现在只有部分走）；把 `run_tool/create_tool` 从默认工具集里拿掉。

### S5 · 其他（P2）

- `fileParser.js` 解压 ZIP 没有条目数/总大小上限，zip bomb 会卡死 tab。
- `window.__cmLegacyPathTelemetry` 在生产环境暴露。
- `agentTools.js` 的 `makeImageUrlExportReady` 会 `fetch` 模型返回的任意 http(s) URL（浏览器 CORS 限制了危害，但仍是模型控制的外联）。
- 隐私政策说 Scion 从 Hugging Face 下载权重，`scionBrowserConstants.js` 里实际还有一个 `ryanhlewis/...webgpu` 的第三方镜像仓库作为浏览器交付源——第三方镜像的完整性靠 revision pin，隐私页没提。

---

## 5. 性能

| 观测                                     | 数值                                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------------------ |
| Landing 首屏 JS（entry + modulepreload） | 271 KB raw（9 个文件）                                                                     |
| Landing 实际触发的 JS 请求               | 49 个文件，243 KB 传输；另有 ~100 个被中止的 preload                                       |
| CSS                                      | 148 KB（单文件）                                                                           |
| Logo                                     | `CMlogo.png` 472 KB + `CMlogo-dark.png` 392 KB（两张 PNG 共 864 KB，应为 <10 KB 的 SVG）   |
| 最大 chunk                               | `courseBlueprintCompiler` 843 KB、`Changelog` 617 KB、`ChatPanel` 355 KB、`AppFlow` 285 KB |
| Privacy/Contact 页 JS                    | 1.6 MB（隐藏的 App）                                                                       |
| Scion 模型                               | 3.35 GB GGUF（5 个分片），需要 WebGPU，缓存在 OPFS                                         |
| 构建                                     | 7.8 s（82% 时间在 Tailwind CSS transform）                                                 |
| 单测                                     | 100 s                                                                                      |

### P1 · CSS：两套主题系统互相打架（P1）

`index.css` 1,347 行：前 84 行是干净的 CSS 变量 token（亮/暗各一套，设计正确），之后 186 条 `.dark …` 覆盖规则用 `.dark [class*='bg-white/']`、`.dark [class*='1967D2']` 这种属性包含选择器去"修"没用 token 的组件，配 187 个 `!important`。组件里又有 1,197 个 `dark:` 前缀。三套机制同时存在，任何一处改动都可能被另一处覆盖，而且属性选择器在大表格上有真实的样式计算开销。

### P2 · 主线程（P2）

除了 pdf.js 自带的 worker，`src/` 里没有 `new Worker`。文件解析（mammoth、jszip）、18 万行的编译器、deep grader、ZIP 打包（jszip + docx + pptxgenjs）全部在主线程跑。生成时 UI 卡顿是必然的。

### P3 · 本地模型的漏斗（P1，产品级）

"免费、本地、隐私"是最强卖点，但代价是首次 3.35 GB 下载 + WebGPU（Safari 桌面 26 才完整支持、很多校园电脑没有独显）。Landing 的 `useScionDeviceCapability` 会探测，但**在用户投入描述课程之前，页面没有告诉他"你的机器要下 3.35 GB、要等多久、要不要插电"**。截图里 Scion 状态只写 "Connected"。

---

## 6. UI / UX 全面评审

> 你说你在意 UI/UX 和审美，这一节写得最细。截图见 `verification-output` 之外的审计附件（本报告的 HTML 版内嵌了 15 张）。

### 6.1 整体判断

**视觉：干净、无 bug，但是"2024 年 AI 默认脸"。** Inter + indigo 主色 + glassmorphism（`backdrop-blur 48–64px`、`saturate(180%)`）+ mesh gradient + 44px 网格背景 + 噪点 overlay + emoji 当图标 + 全部居中 + `rounded-[28px]`。每一个元素单独看都精致，合在一起没有一个是"只有这个产品才会有"的。品牌唯一有个性的资产是那个像素风 "ED" logo——而它和整站柔和的玻璃风格完全不搭，还是一张 472 KB 的 PNG。

**UX：一个 3 步向导，走完掉进一个 IDE。** Landing（Brief）→ Materials → Configure 三屏是表单式、宽松、居中；点 Generate 之后进入的 Workspace 是三栏、密集、满屏芯片和状态的"开发者工具"。用户的心智模型在这一刻断裂。而且 stepper 写着 "1 Brief · 2 Materials · 3 Generate"，但实际有四屏，Configure 屏上 stepper 仍高亮 "2 Materials"，标题却是 "Configure materials"。

**文案：内部词汇墙。** package、materials、deliverables、package parts、receipt、readiness、finalizer、texture、source gaps、kernel、evidence、Scion、"Prepare package — Safe fixes run before download"、"4/4 package parts ready"。老师的词汇是：syllabus、week、lesson、quiz、rubric、slides、Word、PowerPoint。

### 6.2 逐屏问题

#### Landing（截图 01–06）

| #   | 问题                                                                                                                                                                                                                                                                        | 严重度 |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| U1  | 首帧 H1 和副标题是淡灰的（`animate-fade-up` 从 `opacity:0` 起）。访客、爬虫、分享预览看到的第一帧是"褪色的标题"。                                                                                                                                                           | P2     |
| U2  | 三个名字同屏：tab "Course Mapper"、logo "EDUTOOL.DEV"、状态栏 "Scion V0.18.7 · Connected"。"Connected" 连到什么？用户没点过任何东西。                                                                                                                                       | P1     |
| U3  | 两个主 CTA 文案是内部逻辑：「Use sources & generate package」/「Customize package」/「Continue to materials」。同一个按钮在三种状态下换三种文案。                                                                                                                           | P1     |
| U4  | 「0/13 lessons ready on this device · 13 source gaps」+ 一整段 "Generating sends only the course title and 13 uncovered lesson topics to DOAJ → Wikipedia" 出现在主流程正中。隐私透明是好意，但这是合规声明的位置，不是决策提示。用户读到 "13 source gaps" 会以为出了问题。 | P1     |
| U5  | 付费 Provider 模式：三列表单，错误徽标被截断成 "No OpenAI text-generation models a…"，红色 pill 和右侧错误框重复表达同一件事；"Saved API key — type to replace" 用 placeholder 承载状态。                                                                                   | P2     |
| U6  | 「Try」当作 shuffle 按钮的标签——看不出可点。示例芯片用 emoji 做图标（🎭📊🏢）。                                                                                                                                                                                             | P2     |
| U7  | 版本号 hover 弹出 "What's new" 卡片——普通用户不关心，且 tooltip 用 `group-hover` 实现，触屏打不开、键盘 `focus-within` 才能开。                                                                                                                                             | P3     |
| U8  | 移动端（390px）：H1 36px 三行、副标题两行，首屏只剩表单的一半；`.coursemapper` 提示文案换行成三行。                                                                                                                                                                         | P2     |
| U9  | 页脚 "v0.18.7 · Privacy · Terms · Contact" 的字号 12px、灰度 `slate-500/80`，在移动端 axe 没报但接近 AA 下限。                                                                                                                                                              | P3     |

#### Materials / Configure（截图 20–21）

| #   | 问题                                                                                                                                                                                                                              | 严重度 |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| U10 | Materials 屏默认 **0 个材料被选**，但 Landing 的 Quick start 默认生成全部。同一产品两个默认值。"Recommended set" 藏在右上小按钮。                                                                                                 | P1     |
| U11 | Materials 屏没有 logo/header，只有 "Back" 和 "Help"；和 Landing/Workspace 三种不同的页眉。                                                                                                                                        | P2     |
| U12 | Configure 屏信息架构混乱：主按钮「Generate package」在页面中部，下面还有 "Course defaults"（折叠）和 "Materials · Optional tuning"（折叠）。用户不知道要不要展开。"Private local generation · Details" 看起来像 chip 实际是按钮。 | P1     |
| U13 | "All (7 lessons)" 的课程数来自对描述文本的猜测（`detectExpectedLessons`），猜错了用户在这一步无法改，只能到 Workspace 再加。                                                                                                      | P2     |
| U14 | 每个 deliverable 的高级设置（Tone/Style/Length 芯片组 ×10 种材料）是同一套通用选项复制十遍。                                                                                                                                      | P2     |

#### Workspace（截图 10–14、22）

| #   | 问题                                                                                                                                                                                                                                                                       | 严重度 |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| U15 | **三栏布局在 1440px 下内容区只剩约 740px。** Agent 面板固定 360px、Export 面板 256px，课程地图 7 列每列 100px 出头，文字逐字换行，"Async activities" 列直接被裁成 "Asy…"，需要横向滚动。内容是主角，却拿到最少的空间。                                                     | P0     |
| U16 | Agent 面板在没有 key 时是一块**永久橙色警告** "Connect AI to edit with the agent / Configure"，输入框 placeholder 也是 "Configure AI to chat with the agent…"，底部再来一个橙色 "Configure AI"。三处催促，占 25% 屏宽，什么也做不了。                                      | P1     |
| U17 | Export 面板把"导出"做成了常驻栏：This tab / Package 两个 tab、"Ready to export 1/1 materials checked"、"4/4 package parts ready"、"Prepare package — Safe fixes run before download"、"Lesson scope All 2 lessons · Edit"。导出是一次性动作，应该是一个按钮 + 一个对话框。 | P1     |
| U18 | 鼠标划过任意单元格弹出 "ALSO UPDATES 'TOPIC SECTION' IN: Lesson Plans · Slide Decks · Study Guides · Discussion Prompts" 大浮层，遮住相邻列；触屏上点一下就**常驻不消失**（移动端截图可见）。这是每次编辑前的"警告"，却在纯浏览时反复出现。                                | P1     |
| U19 | 单元格内嵌了可点击元素（axe `nested-interactive` ×2），"Section" 列表头为空（axe `empty-table-header`），`noise-overlay` 的 `z-index:9999` 伪元素被判为 landmark 外内容。                                                                                                  | P2     |
| U20 | 深色模式：橙色警告条文字 `text-amber-800` 对比度不足（axe serious）；亮色模式 `text-slate-400` 5 处对比度不足。                                                                                                                                                            | P2     |
| U21 | 平板（1024px）：header 右侧按钮组掉到第二行；Content/Agent/Export 三段切换 + deliverable tab 条 + 页眉 = 三层导航。                                                                                                                                                        | P2     |
| U22 | 手机（390px）：页眉堆到 300px 高（Workspace / 课程名 / 元信息 / 四个按钮各一行），tab 条要横向滚动再加圆形箭头，再加 Content/Agent/Export 切换——**首屏 60% 是导航**，表格要"Swipe the table to review every course-map field"。                                            | P1     |
| U23 | 页眉信息 "2 lessons · GPT-4o mini · Autosaved locally"：模型名放在课程名正下方，像是课程的一部分。                                                                                                                                                                         | P3     |
| U24 | 右键菜单 = AI 编辑入口（Improve/Expand/Simplify/Rewrite）。发现性为零：没有任何可见提示告诉用户可以右键；触屏没有右键。                                                                                                                                                    | P1     |
| U25 | 三种按钮体系并存：Landing 的黑色 pill 主按钮、`Button` 原语的 indigo 主按钮、Workspace 里 `WORKSPACE_MENU_ITEM_CLASS` 这类内联 class 串。圆角在 8/12/16/22/28px 之间随机。                                                                                                 | P1     |
| U26 | Slide Decks 视图是全站最好的界面（缩略图 + 16:9 预览 + 主题点）。但幻灯片模板本身是"深蓝 + 黄标 + 大圆圈"的 2015 企业模板；5 个主题只是换色。                                                                                                                              | P2     |
| U27 | Lesson Plans：卡片可读；"Regen" 缩写；Bloom 等级用 ANALYZE/EVALUATE 全大写彩色标签，视觉噪音大于信息。                                                                                                                                                                     | P3     |
| U28 | FAQ：统计块 + 筛选芯片 + 搜索是好模式；但 "LMS Keywords" 标签老师看不懂。                                                                                                                                                                                                  | P3     |
| U29 | "Built by Tian Xing" 出现在 Workspace 底部；Privacy 页面里也是 "built by Tian Xing"。品牌到底是 EduTool 还是个人作品？                                                                                                                                                     | P3     |

#### Changelog / Privacy / Contact（截图 15–17）

| #   | 问题                                                                                                                                                                                                                            | 严重度 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| U30 | Changelog 58.7 万字符、617 KB JS，正文是 "CHECK · Preserve the authored assessment contract (3)"、"AI · Make generated work internally usable"，全是内部证据语言。这不是给用户看的 changelog，是给作者自己看的 release ledger。 | P1     |
| U31 | Privacy/Terms 用 `text-gradient` 渐变标题 + 玻璃卡片——法律页面不需要营销风格；Privacy 页 227 行里只有 1 处 `dark:`，深色模式完全依赖 `index.css` 的 `.dark .glass` 等全局覆盖。                                                 | P3     |

### 6.3 设计系统：写了，没落地

`docs/DESIGN_SYSTEM.md` 是一份好文档：语义色 token、8 级字号、3 级圆角、`Button/Card/StatusBadge`、AA 对比要求、`tests/design-system.test.js` 守门。但数据说明它基本没被采用：

| 指标                       | 数值                 |
| -------------------------- | -------------------- |
| `text-ink-*`（token）      | 23 处                |
| `text-slate-*`（legacy）   | 1,691 处             |
| `dark:` 前缀               | 1,197 处             |
| import `Button` 原语的文件 | 1 个（`Header.jsx`） |
| 含裸 `<button` 的组件      | 73 个                |
| `index.css` `!important`   | 187                  |

原因不是文档不好，而是迁移没有被排进任何一个版本——Changelog 里 v0.15–v0.18 全部在讲 compiler、texture、evidence。

### 6.4 无障碍

- Landing 三种视口 axe **0 违规**，焦点环有，`prefers-reduced-motion` 有，触控目标 44px 有。这是认真做过的。
- Workspace：`color-contrast`（serious ×5 亮色 / ×1 暗色）、`nested-interactive`（serious ×2）、`empty-table-header`、`region`。
- 键盘：Workspace 的表格单元格编辑、右键 AI 菜单、tab 拖拽排序（`useTabDrag`）都没有键盘等价操作。
- 只有英文，没有 i18n 基础设施；`<html lang="en">` 写死。

---

## 7. 产品与文档

### 7.1 产品定位在摇摆

git log 两周内：08-19 "launch CourseMapper $10 concierge pilot" → 同日 "keep EDUTOOL permanently free"；README 第 8 行加粗 "free—and will stay free"。08-31 三次换 hosting。ROADMAP.md 150 KB 里的条目从 v0.15.23 到 v0.15.118 全是 "Source License Trust Gate"、"Texture Tail Cleanup"、"Assessment Echo Guard"——没有一条是关于用户的。`WhatIfRebuild.md` 和 `docs/EDUTOOL_V1_ROADMAP.md` 两份"重来一遍会怎么做"的文档都已经写出了正确的方向（"Course Graph 是唯一真相"、"AI 只提 patch"、"课程是文件格式"），但代码没有跟上。

### 7.2 文档是日记，不是文档

`docs/` 408 个文件：23 个 SCION*\*、6 个 AUDIT*_、4 个 CODEX*RESPONSE*_、2 个 REJOINDER、1 个 SURREJOINDER……这是审计与反驳的往来记录。缺的是：`CONTRIBUTING.md`、架构图、数据模型（CourseIR/CourseGraph 的 schema）、一页纸的"怎么本地跑起来"。README 前 120 行在解释 "Scion 不是一个新的基础模型"，一个想用的老师读不到第三段。

### 7.3 功能面过宽

同一个 SPA 同时是：课程生成器、10 种材料编辑器、导出套件（DOCX/PPTX/PDF/XLSX/CSV/ZIP/Google Drive）、Agent 聊天 + 31 个工具、本地 LLM 运行时（wllama + WebGPU + OPFS 缓存 + adapter registry）、学术检索引擎（DOAJ/Europe PMC/Crossref/Wikipedia）、质量评分器、Developer IDE（CodeMirror + 模板 + 补丁）、云同步、Changelog CMS。每一块都要维护，每一块都在 UI 上占位置。

---

## 8. 未来方向与具体技术建议

### 8.1 先定三件事

1. **产品只做一件事：把老师已有的材料变成一套互相对齐、可编辑、可导出到他们 LMS 的课程包。** Agent、本地模型、学术检索都是手段，不是功能页。
2. **Course Graph 是唯一真相，所有 deliverable 是它的视图。** 这句话你在 `EDUTOOL_V1_ROADMAP.md` 里已经写了，现在把它变成代码：一个 Zod schema、一个 store、一个 patch 协议。
3. **模型负责内容，代码负责结构和校验，不再用代码写内容。** 18.6 万行的模板编译器退役为"校验 + 修复 + 兜底"，规模控制在 1–2 万行。

### 8.2 推荐技术栈（可以逐步迁移，不必重写）

| 层            | 现状                                               | 建议                                                                                                                                        | 为什么                                                                                                     |
| ------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 语言          | JS                                                 | **TypeScript**（`strict`，先 `allowJs` 渐进）                                                                                               | 25 万行无类型代码是所有重构的最大风险；CourseIR/deliverable schema 需要类型                                |
| 数据模型      | `keyMaps` + 几十个 normalize                       | **Zod** schema 作为 CourseGraph / 每种 deliverable 的单一定义，同时生成 provider 的 JSON Schema                                             | 一份定义三处用：类型、运行时校验、structured output                                                        |
| Provider 层   | 11 处手写 fetch                                    | **Vercel AI SDK**（`ai` + `@ai-sdk/openai/anthropic/google` + OpenAI-compatible for DeepSeek/OpenRouter）                                   | 统一 streaming、tool calling、`generateObject`（按 Zod schema 出 JSON）、重试、abort；删掉 9 份重复 header |
| 本地模型      | wllama + 手工 patch 的 fork                        | **WebLLM（MLC）** 或保留 wllama 但作为可选插件；模型改为 Gemma 3n/Qwen 3 1.7B 级别 + Q4，下载 <1.5 GB；**默认不是本地**                     | 3.35 GB + WebGPU 是漏斗杀手；本地应是"隐私模式"而非默认                                                    |
| 免费额度      | 无后端                                             | **极薄后端：Cloudflare Workers + Workers AI / 或代理 Gemini Flash 免费层**，Turnstile 防刷，按天限额                                        | 既保住"免费"承诺，又不用把 key 放浏览器；BYOK 仍可选                                                       |
| 状态          | 4 Context + reducer + 巨型 hook                    | **Zustand**（含 `immer` + `persist` 中间件）拆成 `courseStore / generationStore / uiStore`；生成流程用 **XState** 状态机                    | 生成/重试/取消/finalize 本来就是状态机，现在散在 useEffect 里                                              |
| 路由          | 手写 hash                                          | **TanStack Router**（文件式路由，类型安全 search params）：`/course/:id/lesson/:n/slides`                                                   | 可分享、可后退、可深链                                                                                     |
| 数据获取/缓存 | 无                                                 | **TanStack Query** 管 provider 模型列表、云项目列表、学术检索                                                                               | 去掉手写 debounce + AbortController 模板                                                                   |
| 持久化        | localStorage 4 MB 上限 + IndexedDB 兜底 + 手写分片 | **Dexie**（IndexedDB）作为唯一本地库，`.coursemapper` 只是它的导出格式；云端继续 Firestore 但用 **Firestore Bundle / 文档分片库**           | 消灭 `QuotaExceeded` 那一族问题                                                                            |
| 表格编辑      | 手写 `<table>` + contentEditable                   | **TanStack Table** + 自建 cell editor，或 **Glide Data Grid**（canvas，万级单元格不卡）                                                     | 课程地图是产品的心脏，需要真正的 grid：列宽、冻结列、键盘导航、批量编辑                                    |
| 富文本        | 纯文本 textarea                                    | **Tiptap**（ProseMirror）给 lesson plan / syllabus 的段落字段                                                                               | 老师需要加粗、列表、链接                                                                                   |
| 样式          | Tailwind 3 + 187 `!important` + 三套主题机制       | **Tailwind 4**（`@theme` CSS 变量为唯一 token 源）+ **Radix Primitives / shadcn** 组件 + `data-theme` 切换                                  | 删掉全部 `.dark [class*=…]` 覆盖；无障碍原语（Dialog/Menu/Tooltip/Tabs）免费得到键盘和 ARIA                |
| 图标          | 内联 SVG path ×几百 + emoji                        | **Lucide**（tree-shakable）                                                                                                                 | 一致、可换色、少 100 KB 重复 path                                                                          |
| 重活          | 主线程                                             | **Web Worker + Comlink**：文件解析、ZIP 打包、校验/评分                                                                                     | 生成时 UI 不卡                                                                                             |
| 导出          | docx / pptxgenjs / 手写 xlsx                       | 保留，但补 **IMS Common Cartridge 1.3 + QTI 2.1** 导出，之后 **LTI 1.3**                                                                    | 老师的终点是 Canvas/Moodle/Blackboard，不是 Word                                                           |
| 观测          | `console` + traceLog                               | **Sentry**（关闭 PII、自托管或 EU 区）+ 简单的 PostHog/Plausible 事件                                                                       | 现在完全不知道用户在哪一步流失                                                                             |
| 测试          | Vitest + Playwright（重）                          | 保留；加 **axe-playwright** 到 e2e；用 **Storybook + Chromatic/Playwright 截图**做视觉回归；删除版本号命名的测试                            | 让测试守行为而不是守版本                                                                                   |
| 工程          | 402 scripts、9 job CI                              | `pnpm` workspace 拆 `app / compiler / research`；CI 3 job；**changesets** 管版本和 changelog（changelog 从代码里出去，变成 `CHANGELOG.md`） | 让新人 10 分钟跑起来                                                                                       |

### 8.3 UI 重建方案（不是重画，是重新定义）

**信息架构（Workspace）**

```
┌────────────────────────────────────────────────────────────┐
│ ⌘K  课程名 ▾           [Preview] [Share] [Export ▾]   ● 已保存 │
├──────────┬─────────────────────────────────────┬───────────┤
│ 课程大纲  │  当前视图（Course map / Lesson 3 /   │  (可收起)  │
│ Week 1   │  Slides / Quiz …）—— 拿到 ≥70% 宽度  │  AI 助手   │
│ Week 2   │                                     │  抽屉      │
│ …        │                                     │           │
│ 材料      │                                     │           │
│  Syllabus│                                     │           │
│  Slides  │                                     │           │
│  Quiz    │                                     │           │
└──────────┴─────────────────────────────────────┴───────────┘
```

- **左侧是课程本身的结构**（周/课 + 材料类型），不是 deliverable tab 条。选中一课，右边所有材料按这一课过滤。这是 Notion/Linear/Figma 用户已经会的模型。
- **AI 助手是抽屉**，默认收起；没有 key 时显示一行"用 AI 编辑需要连接模型 →"，不占 25% 屏宽。
- **导出是右上角一个按钮**，打开一个对话框：选范围（整门课/本周/本材料）→ 选格式（Word / PowerPoint / PDF / Common Cartridge / Google Drive）→ 一个"检查并下载"。"Prepare package"、"package parts"、"receipt" 这些词消失，检查结果变成对话框里的一张清单。
- **级联提示改为编辑后的 toast**："已更新 Week 3 的学习目标 · 3 份材料需要同步 [同步] [稍后]"，而不是 hover 时的常驻浮层。
- **AI 编辑的入口做可见**：单元格 hover 出现一个 ✦ 按钮（触屏常显），右键作为快捷方式保留。
- **移动端**：Workspace 只读 + 评论/审阅；编辑是桌面场景。承认这一点比塞三层导航好。

**向导（Landing → 生成）**

- 一屏：描述/上传 → 一个主按钮「生成课程包」+ 一个次级链接「先选材料和设置」。默认选中推荐集。
- 模型选择做成设置项，不放主流程；Scion 的 3.35 GB 与 WebGPU 要求在用户选它时用一个明确的对话框说清（体积、时长、设备要求、只做一次）。
- 生成过程是一页"正在构建"的进度视图（每周一行，材料逐个点亮），做完直接落到 Workspace。这个进度视图你已经有 `BuildRibbon`，把它做成整页而不是条。

**视觉身份（给一个可执行的起点）**

要点是"只有这个产品会有"。课程地图的本质是**时间 × 结构的网格**——学期是一条时间轴，每一周是一格。把这个网格做成品牌语言：

- **色**：一个偏冷的纸墨系。底 `#F6F5F1`（暖灰纸）/ 深色底 `#15171C`；墨 `#1D2230`；主色一个**深绿松石** `#1C7C74`（区别于满街的 indigo/violet，且在教育语境里稳重）；强调一个**赭黄** `#D9A441` 只用于"当前周/当前项"；语义色（成功/警告/危险）单独一组、不与主色混用。
- **字**：标题 **Fraunces** 或 **Newsreader**（可变字重的现代衬线，带学术气但不古板）；正文与界面 **Geist**、**IBM Plex Sans** 或 **Source Sans 3**（Inter 不是错，但它是"没选"的默认）；数据/表格 **JetBrains Mono / Geist Mono** 做 tabular 数字。全部自托管。
- **形**：圆角只留 2 档（6px 控件、12px 面板），阴影只留 1 档，玻璃效果全部删除，网格线用 1px 实线而不是 `rgba(0,0,0,0.06)` 的幽灵边。
- **logo**：把 "ED" 像素字重画成同一套网格语言的矢量标（一个 4×4 的课程格子里点亮的路径），SVG，<5 KB，亮暗两版用 `currentColor`。
- **动效**：只在两处：生成进度（格子逐个点亮）和保存状态。其他一律 `transition: 150ms`。

### 8.4 编译器的去向

把 `courseBlueprintCompiler.js` 及其 40 多个 `courseCompiler*` / `compiler*` 兄弟文件当作一个**独立 npm 包**（`@edutool/curriculum-checks`）处理，分三步：

1. **拆出"校验"**：所有判断"这段输出合不合格"的函数（正则、长度、重复、对齐检查）→ 保留，写成 Zod `refine` 或独立 `validate*` 函数，这是真正的资产。
2. **拆出"修复"**：所有"把不合格的输出改成合格"的函数 → 保留最通用的 20%，其余改为"退回模型重试并附上校验失败原因"。
3. **删除"生成"**：所有产出正文英文的模板（`*CopyVariants`、`*TextureCopy`、`*RubricCopy`、`*QuizFrames`……）→ 由 `generateObject` + schema + few-shot 替代。这一步减掉的是十万行量级。

同时，`evaluation/` 里那套 gold sample / deep grader 是有价值的——把它变成一个离线 eval harness（像 `promptfoo` 或自写脚本），每次改 prompt/schema 时跑，而不是每次 push 都回放。

### 8.5 分阶段路线图

**阶段 0 · 止血（1–2 周，不动功能）**

- [ ] `git filter-repo` 清权重；`trellis/`、`evaluation/`、`release-contracts/`、`verification-output/` 移出产品仓库。
- [ ] 只保留一条部署；补 CSP 的字体域名（或改自托管字体）；删 Montserrat/Open Sans 网页加载；logo 换 SVG。
- [ ] API key 默认不落盘 + "记住"开关 + WebCrypto；隐私页同步改。
- [ ] 删死代码 8 个文件；`exhaustive-deps` → error 并清零；`package.json` 砍到 <40 个 scripts。
- [ ] `npm audit` 的 `image-size`（升 pptxgenjs 或 override）。
- [ ] Changelog 从代码里移到 `CHANGELOG.md`，页面只渲染最近 5 个版本的用户语言摘要。
- [ ] 去掉 Landing 的 idle 预加载或只预加载 AppFlow 入口 chunk。

**阶段 1 · 地基（4–6 周）**

- [ ] TypeScript + Zod schema（CourseGraph、10 种 deliverable）。
- [ ] Vercel AI SDK 替换 11 处 fetch；`generateObject` 接 schema。
- [ ] Zustand + XState 替换 AppFlow/useDeliverables 的状态；AppFlow 目标 <500 行。
- [ ] TanStack Router；Workspace 可深链。
- [ ] Tailwind 4 `@theme` + Radix；删除全部 `.dark` 覆盖与 `!important`。

**阶段 2 · 新 Workspace（4–6 周）**

- [ ] 按 8.3 的 IA 重建：左侧大纲、中间视图、右侧抽屉。
- [ ] TanStack Table / Glide 做课程地图；Tiptap 做长文本。
- [ ] 导出对话框；Common Cartridge + QTI。
- [ ] Storybook + 视觉回归；axe 进 e2e。

**阶段 3 · 编译器瘦身 + 本地模型定位（持续）**

- [ ] 按 8.4 拆包；目标 `src/lib` <5 万行。
- [ ] 本地模型改为"隐私模式"可选项，换 <1.5 GB 模型；免费额度走薄后端。

**阶段 4 · 增长（之后）**

- [ ] LTI 1.3 / Canvas、Moodle 一键发布；多人协作（Yjs）；i18n（先中文）；学生端只读课程站。

---

## 9. 附录

### 9.1 问题总表

| ID     | 严重度 | 领域     | 位置                                                                             | 摘要                                                   |
| ------ | ------ | -------- | -------------------------------------------------------------------------------- | ------------------------------------------------------ |
| R1     | P0     | 仓库     | `trellis/tendril/distill/**`                                                     | 90 MB + 20×52 MB 权重在 git 历史，仓库 868 MB          |
| R3     | P0     | 部署     | `.github/workflows/deploy.yml`, `emergency-pages.yml`, `public/CNAME`            | 双流水线同域名，其中一条无安全头                       |
| S2     | P0     | 安全     | `firebase.json`, `index.html`                                                    | CSP 未放行 Google Fonts；CDN 无 SRI；`unsafe-inline`   |
| S1     | P0     | 安全     | `src/lib/secureStorage.js`                                                       | API key 固定密钥 XOR，自动永久保存                     |
| A1     | P0     | 架构     | `src/lib/courseBlueprintCompiler.js` 等                                          | 28,664 行单文件；50 个 >1000 行文件                    |
| A2     | P0     | 架构     | `AppFlow.jsx`, `useDeliverables.js`, `ChatPanel.jsx`, `useProjectPersistence.js` | 4,420/6,515 行；66 props；Context 无 memo              |
| U15    | P0     | UX       | Workspace 三栏                                                                   | 内容区 <740px，表格被裁                                |
| A3     | P1     | 架构     | 11 个文件                                                                        | Provider fetch 分散，Anthropic 头 ×9                   |
| A4     | P1     | 架构     | `src/main.jsx`                                                                   | 手写 hash 路由；静态页挂着隐藏 App（1.6 MB）           |
| A5     | P1     | 性能     | `src/App.jsx`, `vite.config.js`                                                  | 首页 idle 预加载整图；80 条 manualChunks               |
| A6     | P2     | 代码     | 8 个文件                                                                         | 死代码                                                 |
| A7     | P2     | 测试     | `tests/v0*`                                                                      | 88 个版本号测试；测试 > 产品代码                       |
| A8     | P2     | 代码     | 全部                                                                             | 无 TypeScript                                          |
| R2     | P1     | 仓库     | 根目录                                                                           | 三个项目混在一起；`verification-output` 被 track       |
| R4     | P1     | 工程     | `package.json`                                                                   | 402 scripts                                            |
| R5     | P1     | 工程     | `ci.yml`, `prePushGate.mjs`, `eslint --quiet`                                    | CI 9 job；pre-push 26 命令；550 warning 不挡           |
| R6     | P2     | 依赖     | `package.json`                                                                   | React 18、Tailwind 3、pdfjs 4；2 high vuln；无 engines |
| S3     | P1     | 安全     | `firestore.rules`, Firebase 控制台                                               | 无 App Check；通配子集合；无大小校验                   |
| S4     | P1     | 安全     | prompts / `agentTools.js`                                                        | 文件与检索内容直接进 prompt；副作用工具 31 个          |
| S5     | P2     | 安全     | `fileParser.js`, `main.jsx`, `agentTools.js`                                     | zip 无上限；全局 telemetry；模型控制的外联             |
| P1     | P1     | 性能     | `src/index.css`                                                                  | 187 `!important`、186 `.dark` 覆盖、1,197 `dark:`      |
| P2     | P2     | 性能     | `src/`                                                                           | 无 Worker，重活在主线程                                |
| P3     | P1     | 产品     | Scion                                                                            | 3.35 GB + WebGPU 未在投入前告知                        |
| A7'    | P1     | 性能     | `src/lib/releaseManifest.js`, `pages/Changelog.jsx`                              | 617 KB changelog chunk                                 |
| Logo   | P2     | 性能     | `public/CMlogo*.png`                                                             | 864 KB PNG                                             |
| U1–U31 | 见 6.2 | UI/UX    | 各屏                                                                             | 31 条                                                  |
| DS     | P1     | 设计系统 | `docs/DESIGN_SYSTEM.md` vs 代码                                                  | 采用率约 1%                                            |
| A11    | P1     | 产品     | UI 文案、README                                                                  | 三个名字、十几个代号外泄                               |
| Docs   | P1     | 文档     | `docs/`, `README.md`, `ROADMAP.md`                                               | 408 文件是日记；缺架构与上手文档                       |

### 9.2 值得保留的东西（别在重构里丢掉）

- 4,541 个单测、100 秒、全绿；jscpd 重复率 0.25%。
- `DOMPurify` / Mermaid `strict` / 链接协议白名单——XSS 防线是对的。
- 声明式 Agent 自定义工具（无 eval）。
- `secureStorage` 之外的持久化设计：localStorage → IndexedDB 兜底、`.coursemapper` 文件格式、云端分片。
- Slide Decks 视图、FAQ 视图的交互模式。
- Landing 的无障碍基线（axe 0、44px、reduced-motion）。
- `WhatIfRebuild.md` 与 `EDUTOOL_V1_ROADMAP.md` 里的产品判断——它们是对的，照着做。
- deep grader / gold sample 作为离线 eval 的价值。

### 9.3 数据来源

所有数字来自本次会话在 `44370ac` 上执行的命令（`git count-objects -vH`、`git ls-files | xargs du -b`、`wc -l`、`grep -c`、`npm run build`、`npx eslint . --format json`、`npx vitest run src/`、`npm outdated`、`npm audit --omit=dev`、jscpd 4、Playwright 1.58 + axe-core 4.10 on Chromium 1194）。截图基线：`vite preview` 于 `http://127.0.0.1:4173`，视口 1440×900 / 1024×768 / 390×844@2x。
