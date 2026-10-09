# GOAL：Sidebar 多文件 Demo 自动导入、可见运行与定向优化 R2

你是本仓库的 Sidebar 多文件项目、Page/Controller 执行与真实 Chrome 验收负责人，默认中文。请阅读并执行本提示词，不止输出计划。目标是让我在可见的真实 Chrome 中查看多文件项目从构建产物自动导入多个源码快照，再真实运行的全过程；找出真实问题、修复并做受影响回归，保留完整证据。

## 目标定义与边界

本轮“自动导入多文件”默认指 **一次导入 program.opendesk-draft.json，自动交付多个 JS 源码快照与固定执行字节**；用真实 UI 自动化完成文件选择、切换展示、授权和运行。导入本身不隐式保存、授权、执行或安装。

直接选择原始源码目录、浏览器内自动 npm/ESM 编译尚未实现。若用户明确把本轮目标改为目录导入，先核对已有目录接入合同和实际消费者，记录新增范围与验收条件，再实施受控入口；禁止把 JSON 导入成功当目录导入 PASS，禁止另造执行器、权限/存储体系或自动运行不受控项目 scripts。用户在新对话的明确要求优先于本提示词的默认范围。

不扩展采集、分页、语音或任务树产品，不新增依赖，不修改旧来源工程，不发布 release。正式 F3/ZIP/603+19/B05 等仍按原合同，当前 Demo 的局部验收不关闭整体框架。

## 先读记录、保护现有工作

1. 读取 AGENTS.md、docs/framework/testing-guide.md 的跨对话入口、docs/framework/parallel-development.md、docs/framework/program-evidence-reuse.zh-CN.md。
2. 读取 [Demo 目录与运行原理](../sidebar-demo-guide-r2.zh-CN.md)、[已有续测记录](../workstreams/sidebar-multifile-native-r1-20261009.md#resume)及对应 JSON、[最终合入证明](../evidence/sidebar-multifile-native-r1-20261009/final-integration.json)、[最终输入核验](../evidence/sidebar-multifile-native-r1-20261009/documentation-followup.json)、[正式项目 API](../sidebar-project-api-r1.zh-CN.md)、[目录/资源接入合同](../../architecture/browser-framework/sidebar-project-intake-r1.zh-CN.md)。使用 opendesk-program-publish skill 时遵守其真实合同和证据复用规则。
3. 重新 fetch 并核对最新 main、dirty inputs、分支和其他会话资源占用。历史产品合入为 PR #29/main c11acf1658b45b6d75f1b2e14c27011b9544dcae，验证 head 为 6fa0ed859661ade021a11486f5ab9e80c921cf16；不能把历史 SHA 当最新基线。
4. 原始工作区 `/Users/shopme/Documents/workspace/opendesk-browser` 保留未提交工作；完整备份为 `/Users/shopme/.codex/backups/sidebar-multifile-native-r1-20261008T175946Z`。已存在最新 Demo 的 worktree 为 `/Users/shopme/.codex/worktrees/sidebar-multifile-native-r1/opendesk-browser`，任务分支 `agent/sidebar-multifile-native-r1-20261009`。优先检查能否安全复用；跨对话写入遵守独立工作区/分支规则，不能让两个 writer 共写此目录，不创建重复的无用分支，也不能 reset/clean/强推覆盖原始工作。
5. 查阅 R6.2 工作流 `docs/framework/workstreams/r62-local-acceptance-01a11c24.json`，不要重复占用其 Native Agent 资源。已知本任务最后自有 Chrome/profile/43111 均已释放；仍须核对当前实际占用。在自己的专属 workstream 登记范围、输入和 IN_PROGRESS 资源，不重写历史 owner/receipt。

## 推荐 Demo 与执行顺序

- **先跑正确性基准**：`examples/programs/sidebar-page-demo`，三个 JS：main.js/fixture.js/proof.js。其标准 production 构建的历史 JS SHA 为 `4d8693b967e4e5e8b2cc1b67ca52e4dc0cde21fa08a145ade0da8364af0c859b`。
- **再跑 Controller 基准**：`examples/programs/sidebar-controller-demo`，三个 JS：main.js/params.js/search.js，参数 `{"keyword":"OpenDesk"}`。历史 JS SHA 为 `d7210dd03e38dd9ded917e816289e2adf9b55e0c409a4f72c644091c8f0684c8`。
- **主要可见展示**：`examples/programs/page-ui-basic`，三个 JS 加 CSS、JSON、PNG；右上方面板、读取本页信息、关闭/重新打开/完全退出。先查是否已有同输入构建/原生证据；没有才补构建和冻结身份。本工作流尚未归档它的最终产物 SHA，禁止虚构。
- `examples/programs/sidebar-assets-contract` 是资源记录探针，仅返回资源信息，不渲染 CSS/PNG。复用其构建/负向验证；实际视觉资源验收用 page-ui-basic。不要把这个探针算作高质量可见资源展示或 CSS/PNG 运行效果 PASS。

标准网页唯一入口：`http://127.0.0.1:43111/demo-form.html`。确认端口未被占用后，从自己的 checkout 启动 `python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks`；不得创建替代手工 HTML 或沿用 /fixture。

## 复用与构建

已有最终 89/89 局部回归、三份 Demo 构建/哈希/draft 校验、production/development 包构建校验和四项远端组件 CI。核对相关产品/传递依赖/测试/fixture/合同/环境及实际包输入；不因换聊天、文档提交、时间或无关 HEAD 变化重跑。缺什么补什么，不为了 Page UI 补建重跑三个已有不变 Demo。组件不能升级为原生 PASS。

如需构建，使用既有 validateProgramProject/buildProgramProject 与命令 `node scripts/validate-program-project.mjs <项目目录>`、`npm run build:program -- <项目目录>`，调试确需可读代码时显式 `--mode development` 并记录模式变化。先核对本地依赖，不无条件重复 npm ci。

从构建返回的实际 outputDirectory 找到 program.js、artifact.json、program.opendesk-draft.json；三者执行字节/hash/字节数对应，authoring.files 的逐文件身份也对应源码。记录程序 id/version/runtimeKind/entry、编译环境、所有 product/verification inputs、outputDirectory、源码与资源 SHA、program JS/draft SHA 及实际扩展包指纹。不要把 package.json、helper.js 或 Controller 的 program.opendesk-task.json 当本流程导入文件。

## 真实 Chrome 自动导入与可见演示

1. 使用受控 CFT、独立 profile 和实际候选 dist，确认 Chrome 参数/版本/扩展 ID/加载包指纹/当前窗口/document。浏览器保持可见，输出我可跟随的步骤和关键截图；截图不能代替执行回执。禁止个人 Chrome profile、DOM 赋值、synthetic events、伪造 native ack。
2. 上次 CUA 报 Mac locked and automatic unlock failed，后续 cgWindowNotFound；核对当前是否已解锁。若仍锁定，继续独立的输入/构建/定向检查，明确标出原生阻断，不假报运行。不要无限重试相同失败。
3. 历史 session-driver.mjs 硬编码旧临时 binary 和旧 evidence/current-main/native；不得原样运行。复制到本次全新独立证据目录，更新真实路径。固定 launcher label 为 program-r3；观察器读取 launcher-program-r3.json。label 对齐、重启退出时序变化尚未实测，先做窄核验。既有观察器 observe 参数是唯一阶段标签，不能与 launcher label 混淆。
4. 从 Sidebar“发现 → 导入”的完整任务目录，通过真实文件选择器选择本次 program.opendesk-draft.json，等待异步校验和同窗口 handoff 真正完成。确认导入不自动运行、不新增授权；不能调用隐藏测试 import API 或注入 UI 状态冒充原生导入。
5. 在“开发”核对项目类型与 id/version、全部三个 JS 路径和只读源码；逐文件切换并截图。查看固定编译产物，核对 artifact.sourceHash/draft.build.sourceHash/实际 JS SHA 一致；切换 helper 文件后执行源仍为整份固定产物。资源文件目前不在独立只读源码列表，明确说明。
6. Page 基准使用“网页用户脚本 · 依赖与试运行”中的 OpenDesk async main()，真实点击 DOM 试运行；标准页 #lab-text 内只有一个 #opendesk-multifile-page-proof，重复运行仍一个；非目标页不写入。保存真实 sender/target/document/sourceHash 与完成回执。试运行不等于正式安装。
7. Controller 从原底栏“运行草稿”，参数 {"keyword":"OpenDesk"}；#results 为“结果：OpenDesk”，#search-count 相对执行前只加 1。保存精确 controller-result、持久 runId/resultId、结果自身 revision/sourceHash 和绑定目标；再次运行各自只加一次。未知 effect/缺回执先观察，禁止盲目重放。
8. Page UI 使用相同 Page 入口；确认 CSS 作用于面板、JSON 文案实际使用、PNG 实际解码并显示、空输入报错、有效输入输出页面标题/输入。统计本示例 data-od-id 为 sample.page-ui-basic.panel/launcher 的 host：打开 2、关面板 1、再打开 2、完全退出 0；其他工具不计入。main 返回 UI_OPEN 后 callbacks 仍存活，必须另验关闭、导航/pagehide、重复运行与清理。
9. 做必要旧 .js 兼容、Stop/撤权/导航/关闭/同 profile 重启核验。保留 retirement released、Save 完整输入及唯一真实 native ack（涉及该路径时）。不用全量无关框架回归代替这些具体缺口。

## 安全与失败处理

Page 资源是有界 CSS/JSON 文本与图片 data URL 内嵌，不新增 CDN/通用 fetch 权限；Controller 资源拒绝 E_PROJECT_ASSET_ENV。资源数量/类型/路径/编码/图片签名/预算仍按现有合同；真实 CSP/网络及 UI 生命周期单列观察。原 R1 全部资源 E_PROJECT_ASSET_BUILD 是历史合同差异，不能回滚已集成 Page 资源或静默修改分母。

本地 Native CLI 握手失败与 macOS CI 裸 Chrome/CDP 基线失败分别处理。Native Host 不可用不能阻断已有手动 Sidebar。只有代码、环境或观察方法实际改变后，才重试同一失败；不能用跳过测试或关闭保护伪造通过。

真实缺陷出现时先记录文件、预期行为、失败证据与通过条件，再直接做最小修复、相关回归、构建输入核对和受影响原生复验。不新增平行 main() 入口、执行器或资源框架。修改聚合后只对同一最终候选做必要完整验证，集中串行 PR 集成到最新 main；原始证据保持不可变，新结果写新目录。release/publish 不在本轮授权范围。

## 交付

- 给出实际 Demo 源目录、各构建输出目录及可导入 JSON；明确主展示/基准/探针用途。
- 给出导入文件、三个 JS 展示、固定执行字节、真实 Page/Controller/资源结果的身份链及关键截图，方便我查看。
- 每项状态为真实 PASS/FAIL/BLOCKED/NOT_TESTED/NOT_IMPLEMENTED，保存命令、候选/包/程序 SHA、原始 receipt 和日志；分别列出复用项、新执行项、失败原因与剩余问题。
- 保存新的 workstream 和可追溯证据，沿用现有复用/续测机制，不覆盖旧 receipt 或争抢全局状态文件。
- 简洁说明本轮实际运行原理与难点，明确目录直接导入的当前状态。只完成局部 Demo 就只关闭对应项，不宣称 Codex/F3/ZIP 或整体迁移完成。
