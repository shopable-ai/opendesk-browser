# Global First R5 · 从真实 Workflow 源码到固定 Task 安装的独立证据记录

> 2026-10-13；此文件是 R5 技术切片专项工作流，**不是新的 GF 声明账本**。GF 世界首创审批仍在 `docs/product/browser-extension-ecosystem/first-claims-ledger.json`；TOP20 和 84 个 OPP 不重新编号。用户目标是 AI 协助创建、用户核查、固定版本安装、关闭 AI 后真实复用，不是把 Node 测试/历史来源冒充全链功能。

## 本轮独立代码改动和通过的组件证据

- [真实 Compiler → 原 Task Service → Candidate/Verify/Available/Install/重复准入/停用 Node 回归](https://github.com/shopable-ai/opendesk-browser/blob/main/tests/environment/global-first-r5-fixed-workflow-to-task.test.mjs)：使用 **真实原生产编译器和 Task Service**，测试专用内存 DB/合成 Controller 结果与操作回执均明确标注 `component-only`；不能据此说 Chrome Native 已通过。候选哈希变化、新版本不能复用旧 Run、未验证不可安装、停用后不准入已覆盖。
- [CI #38366561260](https://github.com/shopable-ai/opendesk-browser/actions/runs/38366561260)，源提交 `9c5fa5aa6a13deb0757adc921d3c04b5c367ce86`，**11/11 PASS**，原始 TAP/输入 SHA 上传为构建工件，属于 Node 组件。
- [原生报告交叉核对器](https://github.com/shopable-ai/opendesk-browser/blob/main/scripts/global-first-r5-native-baseline-audit.mjs) 强制报告 source SHA、物理扩展 packageHash、Task 原始 sourceHash、可信驱动声明的手工 Run、安装、独立 scheduled RunId/ResultId 和网页实际效果一致；**交叉核对器不能独立证明报告是实机产生的**，仍需 CI/launcher/Chrome 原始证据。
- [交叉核对负面测试](https://github.com/shopable-ai/opendesk-browser/blob/main/tests/environment/global-first-r5-native-baseline-audit.test.mjs) 用合成报告测试包哈希/源变化、状态伪装、重复 RunId、缺 Result、Worker 不释放及网页效果错误。测试专用的 fake report 不得写进原始 Chrome 成绩。
- [CI #38367224795](https://github.com/shopable-ai/opendesk-browser/actions/runs/38367224795)，源提交 `6f29428425f8167a9ac4c3b3db99149639145d91`，**15/15 PASS**；只证明 Node 组件/审计约束，不提升为浏览器真实验收。

## 真实 Chrome 接入：直接调用现有正规测试，不创建第二 RunHost

已核查 `tests/framework/scheduled-tasks-r1-native-mac.test.mjs`（仓库原始驱动）含真实 Chrome CFT 创建固定 Task Candidate → 用真实网页 Run/Result/操作回执 Verify → Available → Install → 已安装 Task 经原 Scheduler/RunHost 完成后续独立网页操作 → 原 Result/Worker released → 可选真实 Host/浏览器恢复。**它没有真实 AI 参与生成那份源码，不能被拼接冒充 AI→Installed E2E**。

- [独占 macOS CFT 工作流](https://github.com/shopable-ai/opendesk-browser/blob/main/.github/workflows/global-first-r5-native-task-baseline.yml)，首轮 CI [#38366786793](https://github.com/shopable-ai/opendesk-browser/actions/runs/38366786793) 绑定 `1d1a5c2735038a483d6165210b6329db50bbc44e`，当前候选在 WXT 入口白名单修复之前生成。**不要用这项旧候选代替修复后的主线**；报告以真实 Job 为准。
- [独占 Linux 真实 Chrome 基线](https://github.com/shopable-ai/opendesk-browser/blob/main/.github/workflows/global-first-r5-linux-chrome-task-baseline.yml)，首次 [#38367416844](https://github.com/shopable-ai/opendesk-browser/actions/runs/38367416844) **FAIL_BUILD**，尚未启动 Chrome。失败在 WXT `Unapproved WXT entry: sidebar-tool-host`；它不属于 Controller/Task 网页执行失败，也不是 Native PASS。
- 共享构建源码由其它并行工作流在 [4ee890c](https://github.com/shopable-ai/opendesk-browser/commit/4ee890c8833cae96bf5ae403317d27aaf0e3b509) 正式登记 `sidebar-tool-host` 到受控 `FIXED_OUTPUTS`，**未放松入口安全检查**；本 R5 只读核查后复用修复，不擅自改 WXT 配置。
- 仅因上述明确受影响输入变化，启动新的 Linux CFT [#38367685071](https://github.com/shopable-ai/opendesk-browser/actions/runs/38367685071)，源提交 `50c99883f89d84ba60c22974d1a99f87c9573d62`。最终 PASS/FAIL 和加载包哈希只以其实际原始 CI/工件为准，不事先将新工作流存在标为 Native PASS。

## 2026-10-13 · 第二次真正 Linux Chrome 前置构建失败（源码已变，未重放失败）

- 修正 `sidebar-tool-host` 的严格入口白名单后，新的 CI [#38367685071](https://github.com/shopable-ai/opendesk-browser/actions/runs/38367685071)，候选 `50c99883f89d84ba60c22974d1a99f87c9573d62`，**FAIL_BUILD，Chrome 仍未启动**。
- WXT 代码打包日志明确 `[success] Built extension in 46.4 s`，随后 `scripts/verify-package.mjs:257` 严格校验失败：`Non-classic IIFE output in ui/tool-shell.js: top=1, ExpressionStatement, ... expr=UnaryExpression, unaryArg=CallExpression, unaryCallee=FunctionExpression`。原始失败及构建诊断工件保留于该 run，artifact ID `11797586965`。
- 实际源码审查：`scripts/verify-package.mjs` 的 `assertClassicIIFE` 只允许顶层单个 `var <entry> = (function(){...})()`，防止未知产物/保留 WXT 私有库名称边界；`wxt.config.mjs` 的 `ui/tool-shell.js` 特殊压缩含 `compress:{passes:6,toplevel:true}`。输出出现顶层一元 FunctionExpression，与压缩保留根变量的冲突相符；**具体构建器导致何种命名变化需由 Side Panel/构建负责人核查实际产物**。
- 禁止为了凑 R5 native PASS 降低 `assertClassicIIFE`、放宽 CSP/权限、跳过 `npm run build` 或用 `dist` 旧包冒充新 Candidate；正确修复路径应在源构建侧恢复仍符合原严格固定 IIFE 合约且通过 512KiB 预算的 WXT 产物。该路径属于并行 Side Panel/构建工作流，不由 Global First Agent 抢写共享 `wxt.config.mjs` 或 `verify-package.mjs`。
- **重新触发前提**：负责人确实修改和测试相关构建输入后，获取新的源码 SHA，重新执行定向 build/verify，然后再验本轮真实 Chrome Task；无变化时本轮不循环重试。旧 macOS 任务绑定修正之前的候选，不能被借用为最新主线成功。

### 后续并行代码修复与第三次合法重测条件

- 原 Side Panel/构建负责人于 [a7c7f209](https://github.com/shopable-ai/opendesk-browser/commit/a7c7f209684b59ea759eb104f30d80e9f955ca32)修改 `scripts/verify-package.mjs`，严格只对固定 `ui/tool-shell.js` 接受单一、同步、零参数的 `!function(){...}()` Terser 表达式形式。一般非经典入口、额外顶层语句、其它文件和带参数执行仍继续拒绝；后续另有针对错误 IIFE 的拒绝性测试。**这是一条由构建负责人确定的狭义受控构建格式，而非本 R5 通过关闭验证器放行。**
- 因共享校验器输入确有明确变更，按既有 testing-guide 允许重新跑受影响的 `npm run build / verify / CFT`。第三次 [Linux 真实 Chrome CFT #38368328878](https://github.com/shopable-ai/opendesk-browser/actions/runs/38368328878) 绑定 `5f2c2c229cf065d4fe70dd9ed852086bfcff6f1c`；**在原始报告完成前保留 QUEUED/RUNNING，不提前认定 PASS**。
- 与前两次不一样的是测试输入变更有 GitHub 证据，因此这不是没有代码变化的循环重试；若再次失败必须记录新失败点及受影响输入，不能借 Node green 或旧发行包代替。

## 这两种测试还缺哪一道连接？

`WorkflowCompiler` 组件验收生成的 `wf-*` 固定源码，与 scheduled Task Native 测试加载的 `sample.form-fill` **不是同一个源码候选**，即使两个单独 PASS 也只能说两个独立切片存在。真正关闭 GF-007 的完整证明必须让**同一个真实模型生成的同一源码 hash**经过用户当前 Mac 的真实审阅 → Run/Result → Candidate/Verify/Available/Installed → 明确关闭模型/Native Provider → 在当前账号合法目标文档重复用户 Run 两次；其中模型调用计数不可臆写 0，必须具备真实可观察回执。

如果市场比较或产品验收发现不满足最重要环节，用户价值目标仍是 P0，不为“全球第一”去增加平行 Browser SDK、Task DB、RunHost/Controller 或宽松的权限后台。

## 单资源与声明边界

本次在已授权 GitHub `main` 只创建独立测试/CI/审计文件；**没有修改** `src/platform/tasks`、`src/framework/workflow`、SDK、Native Agent、Cloud、R7 依赖、`wxt.config.mjs` 或 shared CI 运行器。没有访问用户 Mac `/Users/shopme/Documents/workspace/opendesk-browser`、其 Chrome profile、端口与固定构建产物。Github macOS hosted runner 的真实 Chrome 与用户本人 Mac 的原生交付环境仍应分别标注。

**当前通过的级别**：Node 集成/审计（11/11、15/15）；真实 Mac 当前候选、同一模型-to-installed 贯通、同机竞品与 95/100 独立质量评价为 **NOT_TESTED / NOT_SCORED**。新 Linux CFT 的结果以 CI 真实状态复核。

## 后续最短可执行次序

1. **先读新的 Linux CFT原始 log**，若通过则仅升级“原生 Task 固定版已独立运行”的指定 SHA，不晋级 AI E2E；若再遇同一个 build failure，只有在来源代码/环境发生实质变化后才重试，不为凑 PASS 隐藏失败。
2. 由实际拥有 Mac/Native/Codex/真实 Chrome 独占资源的 Agent，在已有 Workflow→Task 实施链中完成同一真实模型源码到原 Task 安装的原生 E2E，绑定 sourceHash、manifestHash、packageHash、documentId、runId/resultId、retirement、installationId/generation 和真实 AI 调用来源。
3. 公平对照 Google Chrome Skills、Claude in Chrome、Axiom+Claude、UiPath、ScriptCat 和 AI+Vite+userscript manager 最自然可用工作流，在真实完整成本和成功率上检验；未测方案 `NOT_TESTED`，不同会话/包/浏览器不可混合。
4. 必须通过现有唯一 GF 账本的独立核查，才允许发表指定时间/地区/测试样本名次；一切“世界首个/最安全/全球 Top 5”当前仍禁止。

完整业务方向和研究退出规则：`docs/product/browser-extension-ecosystem/global-first-r5-portfolio.zh-CN.md`。
