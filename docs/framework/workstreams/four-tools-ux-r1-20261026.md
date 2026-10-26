# OpenDesk Browser · 四个官方扩展 UI R1.0 — 交付审计（2026-10-26）

## 产品目标、范围与源码所有权

目标：`markdown-workbench`、`web-markdown-clipper`、`knowledge-inbox`、`ai-knowledge-answers` 在现有工具宿主下具备一致、紧凑、无冗余的正式页面；保留已有存储、权限、业务行为和升级通道。仅修改四个扩展的既有 `src/`、现有 README、唯一正式预览生成器及定向测试。不新增 SDK、Host、数据库、AI Provider、应用商店或全局设计框架。

原始核查基线：`main@092989f978d025f03eae629f8d14bc65982eda27`。所有源文件更新均在 GitHub 提交前按最新单文件 blob SHA 进行条件写入（正常提交、无分支/强推）。其他对话可继续提交到 `main`；本文件不可作为永远不变的 HEAD 声明。

## 增量完成与未完成

| 产品 | 已修改正式源码 | 业务和数据保护 | 未完成/待验 |
| --- | --- | --- | --- |
| Markdown 工作台 | `src/index.html`、`src/style.css`、`src/main.js` | 宿主负责名称；共享 od 控件；编辑/预览选择限定为模式按钮；清空确认；下载回执不冒充永久保存；安全文本预览保留 | 本地构建、导入→保存文件→导回真实验证，Chrome 包更新、视觉矩阵 |
| 网页剪藏 | `src/index.html`、`src/style.css`、`src/notes.js` | 摘录、存储、授权、来源/读回/Markdown 备份/旧数据不变；右键说明和备份次级收起 | 本地正式 Chrome 网页剪藏、权限撤回/恢复，保存编辑搜索备份及 UI 矩阵 |
| 知识收件箱 | `src/index.html`、`src/style.css`、`src/main.js` | 分类/标签/排序折叠，技术空间进管理；保留 `knowledge.*`、草稿/归档/导出 | 完整迁移到共享设计 Skin 未完成（已有 Scoped CSS 仍使用 `--ki-*`）；Chrome 数据升级、真实保存和高缩放 |
| AI 知识问答 | `src/index.html`、`src/main.js` | 查询 UI 不叫“测试”；仅显示知识标题作为来源而非底层 UUID；固定答案、候选、未命中、人审边界不变；不重写自动客服 Runtime | 真正业务知识库在 Chrome 运行/旧数据升级；本轮变更后的完整 Native 验收；AI Provider/自动发送不在本轮 |

其他修改：四份 README 更新、`tests/environment/ai-knowledge-answers-ui-r2.test.mjs` 按新来源 UI 合同修复旧测试，以及新增 `tests/environment/four-tools-ux-r1.test.mjs`。

## 正式同源预览：唯一生成器

生产来源：`scripts/preview/build-preview.mjs` 加载 `scripts/build-sidebar-tool.mjs` 编译后的**真实** HTML/CSS/JS、生产 Shared UI 和真实 React Side Panel 外壳；SDK 边界在 iframe 内由隔离 Mock 接管；所有预览均有 `mock:true`、`installed:false`、`permissionsGranted:false` 和 `sourceCommit`、`designSha256`、`uiSha256`、`shellSha256`。没有第二套 UI 渲染框架。

Mock 来源：

- Markdown：`scripts/preview/markdown-workbench-mock.js`（复制、下载）
- 网页剪藏：直接复用 `examples/sidebar-tools/web-markdown-clipper/preview/mock-host.js`，叠加 `scripts/preview/web-markdown-clipper-scenario-mock.js` 用于错误和空态；模拟不会访问当前真实页面
- 知识收件箱：`scripts/preview/knowledge-inbox-mock.js`（仅内存中的 `knowledge.*` 与剪贴板）
- AI 知识问答：`scripts/preview/ai-knowledge-answers-mock.js`（仅内存中的存储、导出与复制）

### 本地重建四份正式预览

在完整 Git 工作副本、依赖安装完毕的项目根目录运行（只写入被忽略的预览输出目录）：

```sh
npm ci
for tool in markdown-workbench web-markdown-clipper knowledge-inbox ai-knowledge-answers; do
  node scripts/preview/build-preview.mjs --tool "$tool" --surface side-panel --scenario success --theme light --width 360
done
```

输出：`artifacts/previews/<tool-id>/side-panel-success-light-360.html` 与 `.context.json`。按同一命令分别用 320/360/400/440，dark，以及 empty/error/loading/permission-denied/untrusted 进行矩阵检查。上述命令为**待执行验收步骤**，不是本轮运行已通过的证据。

现有 `web-markdown-clipper/preview/index.html`、`knowledge-inbox/preview/index.html`、`ai-knowledge-answers/preview/index.html` 属于先前独立的专项预览，均保留，不被重画覆盖。

当前聊天产生的四个 `CHAT_ADAPTER_NOT_SOURCE_HTML` HTML 是在对话容器中临时生成的**独立体验替身**。已用容器 Chromium `page.set_content()` 检查页面脚本、基本操作和宽度切换，绝不能把它们误作上述正式源码预览或 Mac Chrome 安装/存储验收。

## 验收标准与真实状态

- `PASS`：GitHub 内容 API 经 blob SHA 检查后，源码、预览适配代码、定向测试和 README 正常提交到 `main`。
- `PASS（仅聊天适配层）`：四份非源码 HTML 经容器 Chromium 基本交互烟测；对正式产品**无证据替代效力**。
- `NOT_TESTED`：仓库本地 Node 测试、包编译/晋升、四份真实 SOURCE-BOUND HTML 生成和浏览器渲染、真实数据/旧版本升级、Mac Chrome Native、主题/200%/无障碍矩阵。
- `NOT_TESTED`：本轮对应的 GitHub Actions 工作流若为 queued/pending，不能声称 CI PASS。
- 质量评分：功能、视觉、易用性、反馈、响应式/无障碍、安全、维护性、可验证性八个维度均以 ≥95 为**目标**，目前没有足够执行证据作实际量化评分。各产品综合均值、整体均值暂记 `N/A（不能计算）`；禁止填入编造的 95/96 分。

## 本地 Codex 唯一下一步：测试、修复与验收，不重复重写

在实际 `main` 工作副本先 `git pull --ff-only`，对四个工具运行原有与新增测试，执行统一同源预览生成；任何 FAIL 优先就地修复且不动其他对话的新改动。通过原正式打包、发行晋升及按版本审阅的安装更新，逐个核对旧用户数据/权限。再于 Mac Chrome Native 按本文件四个业务闭环及 320/360/400/440、200%、浅/深、空/错误/权限/未知回执矩阵验证，记录每步命令、截图、版本、提交、包摘要及 PASS/FAIL/BLOCKED/NOT_TESTED。确有真实证据后再逐维独立打分及计算平均，不在缺证据时抬分。

## R1.0 续修：预览构建阻断、隔离适配器验证与 CI（同日增量）

本轮没有重写四个业务工具。先以最新 SHA 只读核对，定位并修复了**两个确实会阻止统一预览生成**的编译错误：

1. `scripts/preview/build-preview.mjs` 的 Knowledge Inbox CSS 安全校验使用了非法正则转义。已更正，源模块移除 import/export 的 JavaScript 语法核对通过；正式 Node `--check` 仍由仓库环境和 CI 执行。
2. 网页剪藏正式预览复用 `preview/mock-host.js` 时，`setNavigation` 匹配比真实文件多一个前导空格，原代码将直接抛出 `existing clipper mock navigation ... changed`。已按真实原文件精确修复。统一预览同时关闭历史模拟 `sessionStorage` 读写，并固定 `empty` 场景的空库；**原独立的网页剪藏预览文件和数据行为未修改**。

新增 `tests/environment/four-tools-ux-r1.test.mjs` 中的真实预览来源断言，以及剪藏 `success / empty / error / permission-denied` 的 SDK 模拟回归；生成内容必须仍来自打包后的 `pkg.html/css/js`，沙箱只启用 `allow-scripts`。

`.github/workflows/sidebar-preview-contract.yml` 已加入四工具的影响路径、Mock 语法检查、对应 Node 测试和四份 360px 浅色正式同源 HTML 构建，并将文件与 `.context.json` 上传到 `four-tools-source-bound-preview` CI 产物。**CI 尚未返回明确成功前，不得标成 PASS，也不得引用产物路径冒充已生成。**

### 本轮实际执行的有限验证（不同证据等级）

| 实际验证操作 | 结果 | 证据等级与限制 |
| --- | --- | --- |
| 逐个读取四工具最新生产主 JS 与预览 Mock，V8 `new Function` 检查基础 JS 语法 | PASS | `SOURCE_JS_PARSE`；不等于 Node 构建/DOM |
| 用仓库当前 `assertLayoutOnly` 检查 Markdown 和 AI 知识问答的 Shared CSS；检查 Clipper Token 标记 | PASS | `CANONICAL_CSS_STATIC`；知识收件箱旧 Scoped CSS 仍未整体迁移 |
| 在隔离 JavaScript 环境直接运行真实 `ai-knowledge-answers/src/model.js` 的固定问答/无命中 | PASS | `MODEL_ISOLATED`；未执行真实 Host/Provider |
| 在隔离 JavaScript 环境运行问答 Mock 的读→写→读、ETag 旧版本拒绝和模拟导出 | PASS | `SDK_MOCK_ISOLATED`；没有持久化 |
| 在隔离 JavaScript 环境运行知识收件箱 Mock 的创建→读取→编辑→冲突拒绝→归档筛选→删除 | PASS | `SDK_MOCK_ISOLATED`；没有授权网站/工作区 |
| 以真实复用的网页剪藏 Mock 构造统一预览 SDK 源码，并运行成功、空态、故障、权限拒绝四种场景 | PASS | `SDK_MOCK_ISOLATED`；未执行工具 iframe 或正式包 |
| 当前聊天中四个 `CHAT_ADAPTER_NOT_SOURCE_HTML` 页面由容器 Chromium `page.set_content` 分别点击主要操作、切换 320px，并观察无 JS 异常 | PASS | `CHAT_ADAPTER_ONLY`；非正式 HTML，不能作为产品评分证据 |
| 本地仓库原始 `node --test`、真实四份正式 SOURCE_HTML 打包及 Chrome iframe 渲染 | NOT_TESTED | 当前执行环境不含完整可构建 Git 项目，GitHub Actions 排队/执行状态须另查 |
| Mac Chrome 正式升级、真实数据持久化、网站授权、200% 缩放及可访问性完整矩阵 | NOT_TESTED | 必须由独立 Mac Codex 验收并留同候选原始证据 |

这些有限 PASS 不能代替四工具 Native Chrome、发行晋升和最终专家评分。后续应该先执行**真实包/预览构建**与定向测试，发现真实 FAIL 则在对应现有文件修最小缺陷；若全部通过，转本地原位升级和完整验收，不重新进行四工具 UI 开发。

## R1.1 · Markdown 工作台单项菜单纠偏（2026-10-26）

用户实际指出：工具栏「更多」只有一个清空按钮，打开菜单后在 320–360px 下挤占布局；此前提供的聊天 HTML 链接无法成功打开评审。**以这条可复现体验问题为新主任务**，不重复开发其余三个工具，也不扩大 Host/SDK。

已改正式业务源码（本轮仅 `examples/sidebar-tools/markdown-workbench/src/`）：

- `index.html`：删除没有信息价值的单项「更多」菜单；常用导入/复制、主要下载、低频危险清空同排。清空为 34px `od-icon-button`，无内容禁用；唯一确认浮层在工具栏内而不是占据编辑区。
- `style.css`：全部使用现有 shared tokens 和 `od-*`，确认浮层靠近触发位置、最大高度有界，不改变编辑视图排版；三种模式使用 `od-segmented`。
- `main.js`：保持导入替换保护，清空取消保留数据，确认后清空；Esc 取消并恢复焦点；清空/覆盖采用明确的「清空内容 / 替换内容」文案；只确认浏览器发起下载，不冒充文件持久化。未触动存储、Markdown 安全渲染和权限合同。
- 定向测试同步：`tests/environment/four-tools-ux-r1.test.mjs`、`tests/environment/markdown-tools-r22.test.mjs`、`examples/sidebar-tools/markdown-workbench/tests/scroll-anchor.test.mjs`；已有 README 同步到 R1.1。

**实际执行过的分层验证：**

1. GitHub 最新业务源码的结构、唯一 ID、三个图标按钮、无更多菜单、canonical CSS `assertLayoutOnly`：`SOURCE_AUDIT=PASS`。
2. 将最新正式 `src/main.js` 用隔离 V8 + 最小 DOM/SDK 替身直接执行：空态清空禁用、输入启用、点击出现确认、取消不删除、确认清空、预览切换、下载回执文案：`ISOLATED_JS=PASS`，非 Chrome。
3. 新聊天交互适配 HTML `markdown-workbench-ux-r1-1-interactive.html` 在容器 Chromium `page.set_content` 执行，320/360/400/440px、编辑/预览、导入、删除取消/确认、Esc、浅深色以及 200% 模拟缩放，未见页面脚本异常/横向溢出：`CHAT_ADAPTER=PASS`。**此文件是模拟交互，非仓库生成的正式 SOURCE_HTML，也不代表 Chrome 安装运行**。

**剩余阻断 / 下一步 owner：** 当前没有可用的同候选正式扩展安装、Mac Chrome 浏览器、旧数据恢复及真正 `scripts/preview/build-preview.mjs` 生成后 UI 截图的原始证据。需要本地 Codex 在最新 `main` 上运行定向测试、正式预览及发行包构建，只有通过后再执行版本升级/包晋升，并记录 Native PASS/FAIL。不能以聊天适配体验分数宣称整个扩展 95+。

## R1.2 · 在线同源交付与正式包差异（2026-10-26）

目标继续保持：四个现有官方 Sidebar Tool 的真正可交互同源预览及可安装包，绝不重画 UI、重建 SDK/Host 或覆盖并行 trusted/ 工作。

### 已完成、无需重复开发

- R1.1 Markdown 源码已经移除仅有清空项的「更多」，保留单层工具栏、清空浮层、Esc、取消、输入保护：原提交 64b6cf6cbb49e6250e78483d7fd0063c6d1db305。避免再次重复修改工具栏。
- 最新 main 读取时配置版本：Markdown 1.0.6、网页剪藏 1.2.9、知识收件箱 1.2.9、AI 知识问答 0.1.5。
- 本轮 GitHub 正常提交：ebb7b3a7282d72a74ed922c09b352dfcd3b68d53（修复下载状态旧断言），1cee2cc8275c8eaace0932205166913772b72ef4（README 版本及正式包规范），86fce1dabeb0a177e734cdaa35d70366bd947a2a、4196f9e304f8ed4759fedb4b616ec4e2c91cb6ae、8d0337eaec2e19039811d2a569dee94dd3c5e821（新增并改进实际 Chrome 交互测试），adb160433cea26e5659de6f662add7284604625d（原工作流内新增独立 four-tools-delivery job）。
- 新任务继续复用 scripts/preview/build-preview.mjs，生成四工具 360px 浅色真实 HTML、Markdown 320/360/400/440px 浅深色，同源 SDK Mock、Node 定向检查、Chromium 基本交互及产物上传；不是第二套预览。

### 正式包差异：下次只做这些未完成增量

| 工具 | 正式源码和目录包现状 | 下一步 |
| --- | --- | --- |
| markdown-workbench | 配置与包同为 1.0.6，HTML 一致，但包内 JS 少源码一行清空/导入替换确认按钮文案 | 定向测试通过后按补丁版本安全晋升，不用相同 1.0.6 覆盖 |
| web-markdown-clipper | 配置与包同为 1.2.9，包 HTML 和主 JS 已与源码相同 | 仅补 --check-project 等规范字节核查 |
| knowledge-inbox | 源码/配置 1.2.9，目录缺少唯一 knowledge-inbox.opendesk-tool.json | 定向测试后用原打包器生成唯一正式包 |
| ai-knowledge-answers | 配置与包同为 0.1.5，但包 HTML/主 JS 已不同于 src | 仅沙箱 src 增量升级补丁版，不能触碰并行 trusted/ |

### 不能虚报的验收与当前阻断

- 历史 Sidebar Preview CI 40309794751 于 Validate syntax 阶段失败：E_UI_PREVIEW_LOCK: stale preview input src/ui/design-system.css；失败发生在四工具预览生成之前，不能判定四工具失败。
- 独立 four-tools-delivery 已添加到既有 Sidebar Preview Contract 工作流，运行 40321999119、40323062540 核查时均为 queued，没有可验证的 HTML、context.json、Node/Chromium 执行结果或截图。
- PASS（GitHub 内容级）：正式源码、README、测试与工作流提交的存在性、原始内容和 blob SHA 已实读。PASS（隔离语法）：新 Chrome 测试 JS 经 V8 基础解析；这不是 Node --check 或运行 PASS。
- NOT_TESTED：四份正式 SOURCE_BOUND_HTML、Node 定向测试、真实 headless Chrome UI、正式包 --check-project / --promote-from、Mac Native Chrome 安装和原位升级、200% 与键盘/ARIA 完整验收。
- CHAT_ADAPTER_NOT_SOURCE_HTML 只属于本对话 SDK 模拟交互适配，不是正式预览源文件或已验证可访问的四份 HTML。
- 正式产品四工具八维评分、独立提示词/原型/正式 Chrome 评分和各综合算术平均全部为 N/A，未获得执行证据前不能编造 95+。

唯一下一步顺序：先查看 independent four-tools-delivery 的实跑结果并核验真正的四个 HTML 和 context.json；失败只修该项；通过后按上表执行安全包晋升；最后 Mac Native 验收。不得重做 R1.1 菜单或其他扩展已经完成的 UI。
