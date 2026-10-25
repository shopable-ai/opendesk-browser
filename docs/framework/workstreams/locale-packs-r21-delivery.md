# OpenDesk 多语言 R2.1 交付与验收记录

2026-10-25；工作目录 `/Users/shopme/Documents/workspace/opendesk-browser`；仅 main。核心源码、正式 Reading TOC JSON 和日语语言包已交付；真实使用场景尚未完成。用户本次纠偏：以实际产品操作及结果为完成标准，代码测试仅作辅助；本轮不以 production 构建、完整验收矩阵或 95 分为前置条件。

## 当前目标：用户在真实 Chrome 中完成多语言使用闭环

在真实 Mac Chrome 已安装的 OpenDesk「扩展」入口，以官方 Reading TOC 为试点，完成语言选择、语言包导入、即时生效、重开及浏览器重启保留、同语言覆盖、缺词补译回导、删除恢复和错误输入保护。操作中发现真实故障则修对应最小逻辑，回到失败操作复验；不以新增单元测试或文档替代操作完成。

测试对象须是支持 R2.1 的宿主和已安装 Reading TOC 1.0.10 或后续有效版本。先记录实际加载目录、扩展 ID、安装版本、运行模式/serve 连接及候选指纹；仅在旧版确实阻断入口时按原审阅流程升级。正常窗口、默认缩放，使用固定演示页 `http://127.0.0.1:43111/demo-form.html`。日常目录仍为 `dist/development`；保护现有 Profile、watcher、其他会话和未提交改动。

### 关键使用场景与通过条件

下表是本轮核心完成条件。**所有场景目前均为 NOT_TESTED**；此前源码、Node、模拟 DOM 与 HTTP 预览的通过记录不能改变本表状态。

| 使用场景 | 必须完成的真实操作 | 通过条件 |
|---|---|---|
| 打开并使用阅读目录 | 从「扩展」打开已安装阅读目录，在演示页切换目录模式并点击一个章节 | 目录能读取真实页面、切换模式、定位正确章节；建立随后验证语言变更不破坏功能的基线 |
| 全局语言与工具选择 | 工具设为「跟随 OpenDesk」，切换中文/英文；随后为工具选择独立语言，再改变全局语言，最后恢复跟随 | 跟随时实际控件随全局语言变化；独立选择时保持工具语言；恢复跟随后重新采用全局选择，无需重装或通用启用步骤 |
| 导入完整日语包 | 从扩展中心文件选择或拖放导入日语样例，查看 55 条预览；先取消，再重新导入并确认 | 取消不改变原界面；确认后正在打开的工具显示日语提示和辅助标签，已获网站访问授权的网页悬浮目录也同步更新。刷新提示为「現在のページの見出しを再取得」。随后切换模式、点击章节仍可用，正文/章节标题、当前位置与滚动不受翻译影响 |
| 重开与重启后保留 | 关闭重开语言管理、工具和 Side Panel；安全退出并重启本轮验收用 Chrome，再打开同一工具与演示页 | 日语包和语言选择仍存在，实际目录继续显示日语且章节定位可用；不能用刷新 HTTP 页面或重新创建服务代替浏览器重启。不得强停其他 owner 的浏览器会话 |
| 同为日语的覆盖更新 | 导入目标仍为 ja、但一条可见提示已修改的包；先取消覆盖，再确认覆盖 | 取消保留旧提示；确认后同一打开的目录立即出现新提示，沙箱和已授权网页目录一致，不要求切换语言、重新打开或重装工具 |
| 缺两条与 AI 补译往返 | 通过产品导入仅含 53 条的日语包，观察缺词；在产品导出缺失翻译任务，交由当前 Codex 补两条，回导返回的完整包并确认 | 两条缺失文案逐项回退原文；导出的 translationKeys 恰好两条；回导后两条显示日语，另外 53 条保留；任务与语言包均通过真实导出/导入入口，不用测试代码调用服务代替 |
| 删除并恢复原文 | 从语言管理导出备份，先取消删除，再确认删除日语包 | 取消仍显示原日语；确认后工具和已授权网页目录回退可用内置/源文案，工具仍能定位章节，业务状态、原安装及网站授权保留 |
| 错误导入保护 | 在已有有效语言包时，从同一产品入口导入错误工具 ID/坏 JSON，以及空白译文包 | 显示可理解的错误；不替换有效包、不清空正在显示的按钮，也不触发代码安装、业务动作或额外授权 |

每个场景记录实际入口、输入包、操作步骤、可见结果、候选身份和必要截图/录像；持久化场景同时记录重启前后结果。仅弹出「已保存」、查看 storage 值、源码接线或测试断言通过都不算该场景 PASS。用户操作可用真实浏览器 UI 自动化完成，前提是工具明确允许访问对应入口；不得用模拟服务、伪造手势或内部调用替代核心操作。

完成门槛：上述真实场景全部通过，期间发现的核心故障已修复且原失败操作复验通过，没有未解释的核心失败；未执行记 NOT_TESTED，入口限制记 BLOCKED 并说明具体限制，均不能记 PASS。当前已知限制是工具拒绝扩展页访问，尚无真实场景 PASS；Native doctor 连接成功不能解除该限制。保留禁止替代 app、CDP 或间接导航绕过的约束。

后续动作从“合法访问已安装扩展 → 打开目录并定位一个真实章节”开始；入口受限时只处理该具体入口问题，不先跑代码测试、production 构建、旧 CI 清单或评分。生产发布、全量故障注入、来源升级/卸载专项、跨版本、宽度/缩放矩阵和七项 95 分均延期；真实操作若暴露相关安全故障，则定向修复并复验，不放宽校验。

## 历史辅助验证：代码链路（不计核心场景通过）

补齐两处自动化缺口，并执行以下定向命令，**32/32 PASS**：

```sh
node --test tests/environment/extension-center-locale-manager-r21.test.mjs tests/environment/sidebar-tool-locale-pilot-r21.test.mjs tests/environment/sidebar-tool-locale-packs-r21.test.mjs
```

- 真实 React 管理器选择文件、取消、确认 → 原语言服务经模拟 storage 适配器写入并读回 → 原 Tool Host 发送消息 → 原 Sandbox Bridge → 正式 Reading TOC 1.0.10 JS 更新 DOM。确认前不改文案；确认后显示日语；同为 ja 的覆盖也更新；空白译文不写入、不清空按钮；缺词和删除逐项回退。目录 iframe、业务标题节点、模拟滚动/焦点保持，只发生一次初始目录读取，没有附带网页跳转或业务/权限写入。
- 正式 55 条日语样例先导入 53 条，仅导出两个缺失键，补齐回导后重新创建服务仍保留 55 条，另外 53 行文本字节不变。同语言更新触发订阅，安装记录、业务数据及正式包字节不变。

这些是 **Node 集成与 DOM 模拟证据**；未发现需要修改的新增产品源码缺陷。不能据此声称真实 Chrome 安装、沙箱 CSP、原生焦点或浏览器重启已通过。新增沙箱辅助器仅供测试，不进入产品或打包链。

截至本次入口核对：Chrome 日常扩展 ID 为 `ccfcjegpkdlgbclopjmadlcjedelidmf`，磁盘加载目录是本仓库 `dist/development`，Native doctor 连接正常；开发 serve 端口 43119/43120 无监听，属于静态开发产物，不能称为持续开发。下文 PID 44689 与旧候选构建记录是历史观察。当前磁盘包含 1.0.10 正式工具及 R2.1 模块，仍不能证明浏览器已加载对应 UI。原生扩展页访问限制仍在，未采用替代 app、CDP 或间接导航绕过，也未因这次测试改动重跑无关全量构建。

## 用户操作简版（真实 Chrome 尚待执行）

1. 在「扩展」确认已安装的阅读目录是 **1.0.10** 或支持语言元数据的新版本；旧版需先按原安装流程升级。
2. 将 `examples/sidebar-tools/reading-toc/languages/ja.opendesk-locale.json` 拖到「扩展」导入区，确认预览为阅读目录、目标 `ja`、55 条文案，再点「确认导入」。
3. 打开阅读目录，检查刷新按钮的辅助标签为「目次を更新」、悬停提示为「現在のページの見出しを再取得」；「全部」模式辅助标签为「すべての見出し」。文章自己的标题保持原样。
4. 关闭重开工具，再重启 Chrome，检查以上日语仍保留。这里只完成了自动化服务重开测试，真实浏览器重启步骤仍为 **NOT_TESTED**。

通过标准是工具实际文案变化并在重开后保持；仅出现「语言包已保存」不算完成。

## 源码已接线的产品行为（真实场景待验）

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

## 历史辅助验证与未完成项

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

## 历史构建阻断与环境保护

以下为上次构建时的历史观察，开始操作时重查；它们不自动成为当前核心场景的前置条件。持续开发服务当时属于原 owner PID 44689，日常输出 `dist/development`；当时没有停止它或覆盖其输出。正式候选在 `artifacts/locale-packs-r21/build-snapshot/` 和独立 guard port 43128 构建；依赖为本机依赖的物理克隆，未安装新依赖。候选取已提交 main `6382c54a5e335ce6a6860ec3eb1a5cb54ca4ee8d` 加当轮增量，排除其他未提交业务变更。

读取该已提交 HEAD 即可独立复现：`examples/sidebar-tools/prompt-shortcuts/trusted/page.js` 的 Git blob 为 `02f32ad444df89d5cf4b7dbfbd0eee76228cafc8`，`scripts/bundle-provenance.mjs` 中的允许值为 `cb7dcbd4733ba546c4b50790433f1b3cb4e3fd6f`。工作区同模块还有并行未提交修改，不能由语言任务任意覆盖或重签。该 blocker 不来自语言资源；保留门禁，等待所属 owner 完成来源审查与同步后，才重新冻结当前 main 候选并构建。两个 Reading TOC 固定源码 pin 已按本轮源码及定向安全回归同步，只提交该 hunk，保留并行 Prompt pin hunk。

正式交付 JSON 仅通过工具包合同的 Node/来源/同源门禁，不代表完整扩展 production 构建或真实安装通过。

## 续跑：空白文案保护

`cb1643a66` 续跑时复核 main 与工作区，Prompt Shortcuts 的来源不匹配仍存在，故没有重复完整构建。通过真实 Reading TOC 日语包复现：把 `refreshLabel.text` 改为全角空格、不换行空格与普通空格后，验证器仍接受，投影后的按钮标签为空白。新增回归先确认失败，再由原 `localization.js` 的纯文本校验统一拒绝全空白或仅含 Unicode 默认不可见字符的源文案/译文；真实文字前后的空白原样保留，不修改源摘要的字节合同。

写入范围限于该校验器、现有 React 管理器的对应反馈、两份定向测试及本地化合同/本记录；原正式 JSON、工具身份、权限、源语言资源与来源 pin 不变。回归检查无效导入不会替换已经保存的有效译文；空白文案提示明确说明补全或删除词条以回退原文，文件错误不再误报存储异常。共享六 Tab 预览输出仍有并行 owner 写入，补充预览使用原生成器输出到本轮独立证据目录 `artifacts/locale-packs-r21/react-preview.html`，保留其工作区修改。

补充证据：`blank-label-before.log` 为修复前失败回归，`blank-label-after.log` 为语言包/metadata/试点/管理器 37/37 PASS（含实际组件 CSS 编译）；`blank-label-final-source-check.log` 为最终 `npm run check` PASS（1140 文件）。CUA 在同源 HTTP 页面实际选择无效包，显示空白文案与原文回退提示、已导入包仍为 0，没有进入安装预览；截图 `cua-blank-label-rejected.png`。这些补充证据仍不提升为原生 A–F 或完整 Browser 构建通过。正式 Reading TOC 1.0.10 JSON 与日语样例字节未改，原晋升证据继续有效。

## 历史独立开发阶段评分（不作当前完成门槛）

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

在 `/Users/shopme/Documents/workspace/opendesk-browser` 的最新 main 继续 R2.1。先读最新 AGENTS、Git 状态、本报告顶部的当前目标与关键使用场景，以及应用级本地化合同，保护并行改动、原 watcher/Profile/输出。不要建分支、worktree、PR，不覆盖其他 owner 的 Prompt/Mindmap 修改。源码和 Node/HTTP 只作辅助证据；当前目标是通过真实产品入口完成顶部八个核心使用场景，不恢复全工具迁移、production 发布或七项 95 目标。

下一步先核对当前工具是否允许合法访问已安装扩展；允许时记录实际候选、路径、ID、版本和 serve 状态，然后打开阅读目录并定位一个真实章节。只修该操作的具体阻塞；旧 Prompt 来源 pin 或 production 构建若不阻断当前入口，就记录并延期，不重签、不先构建、不覆盖 `dist/development`。日常迭代按原持续开发合同复用已有 watcher，模式切换前先确认输出 owner。

只有当前工具确实允许访问已安装扩展时，执行真实 Mac Chrome：核对加载路径、ID、开发 serve 连接与本候选指纹；通过原安装审阅升级 Reading TOC 到 1.0.10（原身份 `reading-toc`、能力 `page.toc`）。已有 `localization` 元数据才支持语言包，旧 1.0.9 不能误判。访问正常演示网页；必要时按项目固定 43111 页面启动流程。先运行最短核心链：扩展中心拖入 `examples/sidebar-tools/reading-toc/languages/ja.opendesk-locale.json` → 预览 55 条 → 确认 → 工具实际显示日语 → 关闭重开仍为日语。

继续按顶部八个使用场景依次操作并记录结果，覆盖工具/网页目录、全局与独立语言、重开与浏览器重启、同 ja 覆盖、真实 AI 任务导出/回导、删除与错误输入保护。每发现失败先区分产品故障、驱动错误与环境限制，再最小修复并重做失败操作；不以增加单元测试或重复 HTTP 预览替代。

修真实缺陷时只改对应业务/公共边界并复验失败场景；不放宽来源、权限、撤权、CSP、身份或占位符检查。原生入口若被工具安全策略拒绝则停止该入口，不通过 CDP、替代 app 或间接导航绕行。记录当前候选、每个场景的操作结果/截图和未验证项；八个核心场景未全部通过，不宣称当前目标完成。评分及正式发布仍为延期事项。
