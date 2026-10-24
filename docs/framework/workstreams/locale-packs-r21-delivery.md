# OpenDesk 多语言 R2.1 交付与验收记录

2026-10-25；工作目录 `/Users/shopme/Documents/workspace/opendesk-browser`；仅 main。核心源码、正式 Reading TOC JSON 和日语语言包已交付；完整 Browser 构建、真实安装与原生闭环尚未完成，不能宣布总目标验收通过或七项均达到 95。

## 已完成的产品行为

- 扩展中心管理菜单可选择全局语言、管理语言包；原 JSON 选择/拖放按 `format` 分流，语言数据不进入代码安装器。单个支持本地化的工具在原设置中选择「跟随 OpenDesk」或覆盖语言，并打开低频管理入口。
- 导入预览显示工具、语言、原文/译文样本、缺失/过期条目；确认后原子保存语言包与目标语言，读回后生效。支持覆盖、取消、导出、删除与明确的存储恢复。
- 自定义有效译文优先于内置译文，缺失逐条回退。源文案升级后仍匹配的译文可用，改变的词条失效；旧工具无需迁移。确认卸载复用原清理日志清理翻译，不修改原包身份、权限和业务数据。
- 手动 AI 补译使用同一标准包和导入路径。导出完整有效包，仅将缺失键列入 `translationKeys`，防止补两条时丢失其他译文。没有一键 AI 按钮或后台上传。现有 `src/ui/ai/provider-runtime.js` 的受控 consumer 列表不含语言管理，本轮没有扩大 Provider/Native 身份合同。
- Reading TOC 保留 `OpenDeskTool.locale/onLocaleChange()`，新增只读 `OpenDeskTool.messages`。同语言目录更新也通知；沙箱与已验真的可信网页目录原位更新展示，保留目录节点、滚动和当前业务状态。

复用边界与资源格式以 [唯一应用级本地化合同](../../api/sidebar-tool-localization.zh-CN.md) 为准。原来的 i18n、React、Tool Bridge、打包器、安装器及来源锁均继续使用，没有第二框架。Page/Task 后续接入，不在本轮强制迁移。

## 交付物与关键源码

- 正式工具：`examples/sidebar-tools/reading-toc/reading-toc.opendesk-tool.json`，1.0.10，35,044 字节，SHA-256 `8d6bf170c92f3093de34f1401f49897d9734f740a0deef87076666a548cc39f0`。
- 可导入日语包：`examples/sidebar-tools/reading-toc/languages/ja.opendesk-locale.json`，55 条源文案；source hash `3e5cb20769aff8d0038979c4e837171fb57c89bc44f7edb5f86611ece8739da9`。
- 资源校验：`src/ui/sidebar-tools/localization.js`；数据服务：`locale-packs.js` 的 parse/evaluate、createToolLocaleService、resolveToolLocaleState。按工具的独立宿主键不侵占工具 SDK 数据预算。
- UI：`src/ui/extension-center.js`、`src/ui/react/tabs/tools.tsx`、`locale-manager.tsx/css`、`tool-host.tsx`、`src/ui/sidebar-tools.js`、`tool-shell.js`。
- 偏好合同：`src/ui/app-localization.js`、`src/i18n/index.js`。多页面并发收敛、丢回执读回确认、未知结果屏障和恢复代次均有回归。
- Bridge/试点：`src/sidebar-tools/bridge.js`、Reading TOC 的 `src/main.js`、`trusted/page.js/view.js`、官方包 pin 与固定源码 pin。
- 同源预览：`prototypes/sidebar/react-preview/index.html`，由原六 Tab 生成器生成，实际 React 管理组件与实际数据服务；独立预览存储。其所有保存和读回均为 `HTTP_REACT_PREVIEW_ONLY`，没有安装扩展、权限或模型服务。原三个 Reading TOC 预览也由原生成器刷新。

## 已执行验证

| 证据 | 结果与边界 |
|---|---|
| 10 组受影响定向测试 | 首次 137/138；唯一失败为并行 main 更新工具标题栏后已签入预览落后；刷新原三个 HTML 后失败用例 1/1 复验通过。其余已通过用例未因该标记变化重复运行 |
| 管理器最后文案修订 | 12/12 PASS（含正式组件及 CSS 编译）；错误格式、身份、存储失败使用可理解中文反馈，未知结果仍禁写，不改变安全条件 |
| 既有偏好和预览接线 | Workspace/Settings i18n 5/5，冻结增量的原六 Tab 预览根生成 1/1 PASS；排除其他 owner 未提交的界面源码 |
| 来源门禁 | Reading TOC 模型、page/view、坏 hash、非目标固定输出、symlink 拒绝定向 1/1 PASS |
| `npm run check` | PASS：1140 个源码/测试/构建文件，固定入口、CSP、许可证检查 |
| 正式工具 `--check-project` | `PROJECT_PACKAGE_MATCH`，与源码及官方 pin 同源；candidate → tests → promote 已由唯一打包器执行 |
| 真实 Reading TOC 数据试点 | AI 标准任务生成/日语样例回导、服务重开、缺词、模拟源升级与删除，业务数据/权限/原包字节保留，PASS；不是 Chrome 升级证据 |
| CUA HTTP React | 文件选择 → 55 条预览 → 确认 → 已应用 ja；刷新后仍存在。覆盖 53 条预览显示缺失 2；实际下载 AI 任务；Codex 翻译这两条，回导 55 条并确认，再导出逐字核对，另外 53 行不变。删除取消/确认、Tab 焦点约束、Escape 返回菜单均已操作 |
| 窄栏与主题 | CUA viewport 320/360/400/440，body/dialog 横向溢出均为 0，控件均位于视口内；浅色 320 与深色四档有截图。主题选择只在原预览中映射唯一 Tokens |
| Browser `npm run build` | **BLOCKED**：隔离候选在固定 Page Relay 构建被已提交 main 的 Prompt Shortcuts 来源 pin 不匹配拦截，见下文。无成功 production 包 |
| `npm run verify` | **FAIL / 上游构建不完整**：缺少 `dist/production/framework/browser-edition.json`；未把部分产物当正式包，也未重复相同阻断的 build:dev |
| Chrome 原生 A–F | **NOT_TESTED**：当前浏览器工具拒绝 `chrome-extension://`，并明确禁止替代路径绕行。没有将 HTTP、DOM fixture、旧 CI 或历史安装视作原生 PASS |

本机日志与截图位于 `artifacts/locale-packs-r21/`（临时证据，不提交为快照堆积）：`final-targeted-tests.log`、`final-preview-test.log`、`final-manager-tests.log`、`final-provenance-test.log`、`final-workspace-i18n-test.log`、`final-six-tab-preview-test.log`、`final-source-check.log`、`final-package-check.log`、`production-build.log`、`package-verify.log`、`ai-roundtrip-result.json`、`cua-import-320.png`、`cua-dark-*.png`、`cua-ai-roundtrip.png`。完整词条来自实际任务下载与 Codex 输出，不调用另一套模型服务。

## 当前构建阻断与环境保护

持续开发服务仍属于原 owner PID 44689，日常输出 `dist/development`；本轮没有停止它或覆盖其输出。正式候选在 `artifacts/locale-packs-r21/build-snapshot/` 和独立 guard port 43128 构建；依赖为本机依赖的物理克隆，未安装新依赖。候选取已提交 main `6382c54a5e335ce6a6860ec3eb1a5cb54ca4ee8d` 加本轮增量，排除其他未提交业务变更。

读取该已提交 HEAD 即可独立复现：`examples/sidebar-tools/prompt-shortcuts/trusted/page.js` 的 Git blob 为 `02f32ad444df89d5cf4b7dbfbd0eee76228cafc8`，`scripts/bundle-provenance.mjs` 中的允许值为 `cb7dcbd4733ba546c4b50790433f1b3cb4e3fd6f`。工作区同模块还有并行未提交修改，不能由语言任务任意覆盖或重签。该 blocker 不来自语言资源；保留门禁，等待所属 owner 完成来源审查与同步后，才重新冻结当前 main 候选并构建。两个 Reading TOC 固定源码 pin 已按本轮源码及定向安全回归同步，只提交该 hunk，保留并行 Prompt pin hunk。

正式交付 JSON 仅通过工具包合同的 Node/来源/同源门禁，不代表完整扩展 production 构建或真实安装通过。

## 独立开发阶段评分

三个独立 native subagent 按各自负责的证据分别评分；没有按目标倒填 95。评分形成时尚无完整构建与原生证据，后续 HTTP 验证不自动改为发布分数。

| 维度 | 得分 | 主要限制 |
|---|---:|---|
| 1 产品目标与真实可用性 | 88 | 核心数据和 HTTP UI 闭环，已安装扩展未证 |
| 2 架构复用与维护成本 | 94 | 复用原安装/存储/投影，完整候选未构建 |
| 3 安全隔离与兼容 | 94 | 已报告恢复边界缺陷均修复，原生权限/撤权未证 |
| 4 多语言与翻译正确性 | 93 | 缺词/旧源/占位符与部分 AI 往返通过，原生未证 |
| 5 UI/UX 与无障碍 | 89 | 四档宽度/主题/焦点有 HTTP 证据，真实侧栏/读屏未证 |
| 6 测试与交付完整性 | 93 | 包、预览、定向回归有证；production/native/提交后 CI 缺口 |
| 7 增量与去重 | 92 | 唯一生成器与限定回归；既有轻量 DOM fixture 有维护重复 |

算术平均 **91.86/100**。没有发现仍未修复的本轮 P0 或安全问题；完整构建来源冲突、原生验收与 95 目标仍未关闭。Git 提交 SHA 与推送结果以本轮最终回复和实际 Git 记录为准。

## 本地 Codex 原生续验提示词

在 `/Users/shopme/Documents/workspace/opendesk-browser` 的最新 main 继续 R2.1。先读最新 AGENTS、Git 状态、本报告及应用级本地化合同，保护并行改动、原 watcher/Profile/输出。不要建分支、worktree、PR，不覆盖其他 owner 的 Prompt/Mindmap 修改。源码和 Node/HTTP 已完成，不重复研究架构，不恢复全工具迁移；七项 95 与原生尚未通过。

下一步先核对上述 Prompt 来源 blocker 是否已由所属 owner 修复。未修复则只记录，不盲目重建或重签；若确有该模块修复授权，独立审查实际源码后按原来源合同修复，并保留证据。解除后在独立冻结快照、独立 guard/output 中执行一次 production build；成功才继续静态 development 与 verify，不能覆盖 `dist/development` watcher。

只有当前工具确实允许访问已安装扩展时，执行真实 Mac Chrome：核对加载路径、ID、开发 serve 连接与本候选指纹；通过原安装审阅升级 Reading TOC 到 1.0.10（原身份 `reading-toc`、能力 `page.toc`）。已有 `localization` 元数据才支持语言包，旧 1.0.9 不能误判。访问正常演示网页；必要时按项目固定 43111 页面启动流程。先运行最短核心链：扩展中心拖入 `examples/sidebar-tools/reading-toc/languages/ja.opendesk-locale.json` → 预览 55 条 → 确认 → 工具实际显示日语 → 关闭重开仍为日语。

再完成本轮 A–F：缺两条回退原文；同 ID 升级源文案时保留未变译文、失效改变项；错误 ID/坏 JSON/恶意内容/占位符/重复导入反馈；存储失败和未知结果不重放且可显式恢复；导出后移除只恢复文案、保留业务数据/授权；导出两条缺失任务给 Codex/已有 AI，回导完整包确认，原有其余译文保持。检查沙箱和已授权网页目录均更新，同语言替换也更新，焦点/滚动不丢失；未授权网页不得因翻译而获得权限。确认卸载仅使用可丢弃试点，先导出翻译并保留原业务数据证据。

修真实缺陷时只改对应业务/公共边界并复验失败场景；不放宽来源、权限、撤权、CSP、身份或占位符检查。原生入口若被工具安全策略拒绝则停止该入口，不通过 CDP、替代 app 或间接导航绕行。记录当前候选、A–F 每一步结果/截图、未验证项，再由独立评估者重新评分，仍不得无证据宣称 95。
