# Global First R4｜2026-10-13 真实研究与远端 main 交付

## R5 补充：重复运行结果不可拼接（2026-10-13）

- 真实工程现状：[Linux CFT 固定 Task 基线 #38368328878](https://github.com/shopable-ai/opendesk-browser/actions/runs/38368328878) 证明指定历史 SHA 的真实 Chrome Installed Task 经计划调度完成一次独立网页执行；该候选并非实时 AI 新生成，用户 macOS、同源 AI→Installed 和关闭模型后的两次真实用户 Run 仍 **NOT_TESTED**。
- 竞争基准工具 `scripts/global-first-r5-benchmark.mjs` 已增加 **R5-T02 同一安装版本身份一致性守卫**：在 OpenDesk 已经观察到的重复运行 PASS 样本中禁止复用 RunId、ResultId，禁止把不同 sourceHash/manifestHash 拼成“同一固定版”的成功率；已有 `REAL_CHROME_RECEIPT` 与 `retirementState=released` 校验保持不变。这是对基准研究/计算器的修复，**不是修复真实 Chrome 产品运行**。
- 新增 `tests/environment/global-first-r5-benchmark.test.mjs` 拒绝性测试：重复 RunId、重复 ResultId、跨版本混合均必须抛错；两次合规合成输入仍只是 `INCOMPLETE / NOT_RANKED`。CI 如无精确完成记录保持 **PENDING**，后续只用 SHA 绑定的 Actions 日志升为 NODE_PASS。
- 其它 Agent 在 `main` 继续编辑 SDK、Cloud、Side Panel；本轮只修改 Global First 独占的计算器/测试及研究记录，不涉及真实 Mac CFT/profile、Native 进程、端口、dist 或共享运行器。
- 研究账本当前仍是 [TOP20/84 OPP](../../product/browser-extension-ecosystem/global-first-r5-portfolio.zh-CN.md)、[45 竞品时间线](../../product/browser-extension-ecosystem/competitor-timeline.json)、[唯一 GF 审批账本](../../product/browser-extension-ecosystem/first-claims-ledger.json)，正式第一 **0**，不自动修改声明级别。

---


## R5 同源输入复用核查与并行 UI 变化影响（2026-10-13）

> 只读源树比较时 `main` 基线为 `cd8cefc5031491f3ad2a18f449b938a6302e28c8`。这是**精确文件 Blob SHA 比较**，没有访问用户 Mac，本轮未重新运行新的 CFT，也未抢别的任务的 Profile/Native/端口。

- **Node 原已通过候选**：[Global First 综合组件 CI #38361795155](https://github.com/shopable-ai/opendesk-browser/actions/runs/38361795155)，固定 `438b423576d63ff021c77a55864cb04b79913e50`，原始 Job TAP 分别 `21/21 + 13/13 + 14/14 = 48/48 PASS`，分别覆盖研究/代码包约束、Task 服务组件、Workflow/本地安装组件。
- **Node 到当前 main 输入核对**：选定 Task Service、Task Contract、Workflow Compiler/Contract、内置库身份/加载、Task 候选文件及 R5 相关测试共 13 路径，**9 路径 Blob 未变化、4 路径有变化/原来不存在**。变化的是 `src/ui/workflow/workflow-view.js`、`src/ui/task-workbench.js`、新 `src/ui/workflow/task-review-handoff.js` 和 R5 独占固定流程测试；因此仅保留原候选 Node PASS，**新 Side Panel 交接体验属于 AFFECTED_INPUTS，不能从旧 TAP 自动认定 UI 通过**。后续应复用已有 `tests/environment/workflow-task-review-handoff-r5.test.mjs` 和对应 UI/安装回归，不重建 Runner。
- **真实 Chrome 到当前 main 输入核对**：对 [Linux CFT #38368328878](https://github.com/shopable-ai/opendesk-browser/actions/runs/38368328878) 的原 `5f2c2c229cf065d4fe70dd9ed852086bfcff6f1c` 与最新 main 的 16 项候选输入（Task Service/Contract/Scheduler/Host/编译器/原 Chrome 驱动/样本/受控构建器/锁），**15 项未变，`src/ui/scheduled-task-workbench.js` 已变**；其他扩展源码、构建输入也可能独立变化，因此不能把旧 physical packageHash 或该 GUI 原生 PASS 直接升级为“最新 main 最新包已验收”。原 1/1 真 Chrome 功能片段 PASS **永久保留在其原 SHA/真实包**。
- **目前正确可复用结论**：既有 Task/Workflow 核心代码路径可复用，固定 Candidate、真实授权与 RunHost 并非需要新造的功能；但原生验证与 AI→真实模型→同一 sourceHash 安装→断开模型后两次用户 Run 的联合证据未被这两组独立测试覆盖。`MAC_USER_PROFILE=NOT_TESTED`，`REAL_AI_SAME_SOURCE_E2E=NOT_TESTED`，`CURRENT_MAIN_NATIVE_RELEASE=NEEDS_AFFECTED_INPUTS_REVIEW`。
- **所有权与执行**：Native 专项继续由 [R5 Native Proof](global-first-r5-native-proof-20261013.md) 和现有 Scheduler/AI/安装工作流串行收敛；此工作流只保留竞争证据归属与不变输入复用说明，绝不把截图/Node 合成回执升级为原生执行或重置对方已验证候选。

---


## R5 真实 Linux Chrome 固定版 Task 首次独立通过（2026-10-13）

- **经过 GitHub 原始日志确认，而不是拼接不同来源的摘要**：[Linux CFT #38368328878](https://github.com/shopable-ai/opendesk-browser/actions/runs/38368328878) 在精确源码 `5f2c2c229cf065d4fe70dd9ed852086bfcff6f1c` 运行，**real Chrome 155.0.8059.39 / 生产包 SHA `f244dc3886ed8a182db2672747726e6aa1614d0713bb7ab13afe4c6246ae192f` / TAP 1 PASS、0 FAIL**。先前两次 #38367416844、#38367685071 是真实构建 FAIL（当时 Chrome 未启动），保留历史、不倒灌。
- 实际原生步骤：`native-install-context` 是真实 SIDE_PANEL；`manual-native-receipt` 的原生验证 RunId 为 `ecbdc898-65e7-4f7b-8c8d-2bd0d21f27b6`；`installed-trusted-task` 为 `sample.form-fill@1.0.0`；真实 `native-chrome-alarm-registered` 后，通过独立可见 Runner 在 Chrome 网页执行，`native-scheduled-result` 的 RunId=`eca86301-43d5-4b8e-83c1-41ab1452728e`、ResultId=`f0279f54-daa9-44f3-9c35-9c061350a7e0`，`retirement=released`、`webEffect={name:"Scheduled Native",done:true}`。
- **正确提升**：该精确 Linux Runner/Task 候选的 **REAL_LINUX_CHROME_FIXED_INSTALLED_TASK_BASELINE_PASS**；它证明真实 Candidate→原验证→安装→定时独立执行链的一项产品底座功能，而不是单纯 Node Mock。
- **严禁越级**：原任务来源是预设 `sample.form-fill`，不是本轮真实模型新生成的同一源码；没有同一用户在 AI 断开后两次人工 Run + 直接模型调用计数，没有实际用户 Mac 的 R16 Native/ChatGPT/Codex 接入同版原始回执。故 **AI_CREATED_TO_INSTALLED_E2E=NOT_TESTED**、`MAC_USER_PROFILE=NOT_TESTED`、竞品对照/模型成本/排行均 `NOT_SCORED`。Linux GitHub hosted CFT 不能变成 macOS 真机结果；此历史候选也不自动晋级到之后连续修改的 main。
- R5 的已有更完整独立实施/Native 记录由其它工作流维护：[R5 Native Proof](global-first-r5-native-proof-20261013.md)。本轮只**引用**其真实证据，不覆盖原 Native 驱动、CFT Profile、Cloud/SDK/Task 执行所有权；非互斥的 Node 产品合同测试见 [Workflow + Task 服务回归](https://github.com/shopable-ai/opendesk-browser/blob/main/tests/environment/global-first-r5-fixed-workflow-to-task.test.mjs)，它自己仅使用合成内存数据，不能证明 Chrome E2E。
- **下一唯一 P0 产品缺口**：用真实模型产生的**同一源版本**完成审阅/验证/安装/无模型重复 2 次，并在用户 Mac 实测权限、Stop、重启和数据边界；之后才对 Chrome Skills/Claude/Axiom/UiPath/ScriptCat 作同任务、同地区、全成本比较。切勿为达到营销名次重复发明 Browser SDK/Authority/RunHost。

---


## R4 独占声明/市场证据测试已实跑（不是 Chrome Native）

- [Global First R4 GitHub Actions 成功运行 #38355637174](https://github.com/shopable-ai/opendesk-browser/actions/runs/38355637174)，绑定代码提交 [059ba495aa0878bae883b27ab0299176a6f0be1c](https://github.com/shopable-ai/opendesk-browser/commit/059ba495aa0878bae883b27ab0299176a6f0be1c)。
- 原始 Job ID 115157757641，Ubuntu / Node 22，命令：node --test tests/environment/global-first-r4-claims.test.mjs；TAP **5 tests / 5 pass / 0 fail**。
- 五类检查：唯一 GF 账本及 GF-013/014 禁用、TOP5 无虚构世界排名、30 竞品唯一 ID/Beta 与 Public Preview 日期、五份双语事实页和24个未执行查询、冻结 Candidate 不冒充安装回执。
- 该 CI **只证明仓库研究和声明文件满足静态门禁**，绝不证明任何真实 Chrome 操作、模型连接、候选正式安装、RunId/ResultId、用户 Mac、生产包构建、竞品实测、95/100 或市场领先；对应状态保持 **NOT_TESTED / NOT_SCORED**。
- 新增的独占文件是 tests/environment/global-first-r4-claims.test.mjs、.github/workflows/global-first-r4-claims.yml，不改已有共享 SDK、Task、Native、Cloud 运行代码或现有测试。


**此段覆盖下方 R2/R3 历史优先级。** 以 [R4 最新决策](../../product/browser-extension-ecosystem/global-first-r2-decision.zh-CN.md) 为权威产品结论；沿用唯一 [GF 声明账本](../../product/browser-extension-ecosystem/first-claims-ledger.json)、[竞品时间线](../../product/browser-extension-ecosystem/competitor-timeline.json)、[营销手册](../../product/browser-extension-ecosystem/marketing-playbook.zh-CN.md)。不创建第二账本或运行框架。

## 本轮真实已完成

- 读取原 R4 GOAL、AGENTS、testing-guide、parallel-development、旧 GF/竞争账本及 AI Workflow / Local Install / Authority / Task / 依赖 / Cloud workstreams；直接经已连接的 GitHub 修改 **main**，没有分支/PR/force/reset。
- 竞争源证据：时间线原 20 → **30** 个产品/方案；记录 ScriptCat/Violentmonkey Beta MCP、UiPath Delegate 2026-08-25 Public Preview Routines、Axiom AI→扩展导入、Bardeen/HARPA 商店、BrowserOS 子组件，不以 push date 或未知首次发行冒充 first。
- 创建实际用户任务双/三因素机会 **26** 个、真实战略 TOP5/TOP10、两个证伪旧称号、五种“第一”核查路径，并按真相保留 14 个 GF claim 的 **0 approved**。
- 五份双语 SEO/GEO 事实页 + 24 条未执行查询及 [独立来源 JSON](evidence/global-first-r4-20261013/research-evidence.json)，明确正式官网部署/搜索收录/商店安装转化 NOT_TESTED。
- [唯一固定 Demo 验收协议](evidence/global-first-r4-20261013/README.md) 复用现存 agent-modern-search v1 Task Candidate 和 demo-form.html，不建第二 SDK/Task DB/RunHost。
- 本轮只修改独占文档、JSON 与事实页；**没有修改 src、native、sdk、安装/云控、共享测试代码**。已有 Mac Chrome/CI 历史结果只在其原候选有效。

## 未完成，不能伪造成功

- 用户 Mac 本地 git status/CFT profile/Native/端口/包 SHA：**LOCAL_NOT_INSPECTED**（本次仅远端 GitHub）。
- 同一最新版外部 AI → 用户步骤/权限审阅 → 真实 Chrome Run/Result → 正式 Verified → Available → Installed → AI 断开后同版两次重复 Run：**NOT_TESTED**。
- 真实同机竞品 5 次冷启动/10 次热修改/3 次恢复、20次总费用、正式区域产品发行和收费用户：**NOT_TESTED**。
- 产品/竞争/技术/营销合规/文档专家独立 95/100：**NOT_SCORED**。世界/区域/任务第一、世界第2—5 的实际通过数 0。
- 共享 AI、Task、Native、Cloud、Dependency 已有专属工作流，不接管他们的 Mac Profile、dist、43111/43112 或修改共享逻辑。缺独占权直接说明 BLOCKED_BY_OWNERSHIP；不足以声称已完成框架闭环。

**下一件真正有用的事情**：在原负责者可独占的 Chrome+Native 环境完成该单版 Demo，保留真正的 runId/resultId/manifestHash/模型费用和同版关闭模型两次运行回执；若缺失，按原始失败/未知保留。随后做 Axiom/UiPath/ScriptCat/Vite 真实同任务比较，不写下一套运行框架。

---

## 以下 R2/R3 历史记录留存，仅作时间线参考

# Global First R2 · 真实研究与原生验证工作流（2026-10-13）

## R4 AI 优先纠偏（覆盖下文旧 F01 市场优先级）

当前执行 [R4 AI 优先 Top 5 GOAL](../prompts/goal-global-first-r4-ai-first-niche-leadership.zh-CN.md)；[读者一页决策](../../product/browser-extension-ecosystem/global-first-r2-decision.zh-CN.md)。旧 R3 手动 JSX/Vue 编辑任务已在原 GOAL 标 SUPERSEDED_FOR_MARKETING，不删除历史证据。战略排序 GF-007→GF-004→GF-003→GF-002/GF-011→GF-009；均为未证明的争夺目标。R4 Chrome/排名/销售实证 NOT_TESTED，所有绝对排名获批 0。下文 R2 进度是原始历史状态。
> 任务归属：竞争研究 / 独立 F01-F02 验证；仅写独占文档及原始实验文件。唯一可写分支 main，不创建 PR / worktree，不覆盖并行 R24/R25、Native、SDK、依赖、Cloud 工作流。

## 历史 R3/F01 工程专项入口（已被 R4 竞争策略取代）

**历史工程 GOAL、非当前营销主线：** [F01 Developer 版本首次成功体验与真实 Chrome 证据](../prompts/goal-global-first-r3-f01-product-proof.zh-CN.md)。读者只需先看 [一页产品决策](../../product/browser-extension-ecosystem/global-first-r2-decision.zh-CN.md)，随后进入执行 GOAL。本工作流余下部分保存 R2 历史证据及未测试项，不代表 R3 已执行成功。

**当前记录状态：** R3 GOAL 已制定，R3 原生测试、Developer 新包公开发行、全球排他性研究与独立质量评分尚未因文档变化而自动完成。最新 SHA 必须由执行者在实际 Mac 工作目录中核查。任何 95+ 是目标不是当前事实。

## 本轮交付与证据等级

- GitHub 远端只读基线在研究中依次经过 `de52893a69d5107b4d60f837c9e570d7298ac588`、`5514f58715ab4ea77f17d64cd3c4056e3595ff73`，最终应用提交以实际 parent SHA 为准；**不能访问用户 Mac 的 git status、Chrome Profile、Native/Node 安装状态**。
- R1 现有 16 个竞品和 14 个 GF ID 原位保留；本轮补充 Stagehand、Midscene、Web Dev Kit、Codelifter 作为独立对象，计 20 个；版本/渠道来源分别在 competitor-timeline.json，不以 GitHub pushed_at 冒充 Release。
- R1 四份正式文档继续是唯一账本，新增 [给人看的单份 R2 决策](../../product/browser-extension-ecosystem/global-first-r2-decision.zh-CN.md)；不成立的 GF-013/014 维持 DISPROVED，**CLAIM_APPROVED = 0**。
- 不修改 `src/`、`native-agent/`、`examples/programs/**/src`、`tests/framework` 的任何运行时或测试原驱动。也未重新运行真实 Chrome。文档核查和 JSON 约束校验不能标作 Chrome PASS。

### 已有真实但仅限历史候选的证明

| 内容 | CI / SHA | 能证明 | 不能证明 |
| --- | --- | --- | --- |
| F01 无 Native 浏览器编辑 React JSX / Vue SFC → 点击交互 → Stop | [38225425847](https://github.com/shopable-ai/opendesk-browser/actions/runs/38225425847), `9cdb3bf98fe410b88c456801855e2635f6b1a7b0` | 该候选的原生功能切片 | 今天可获得版或世界首创 |
| R24.5 Standard/Developer Chrome 真实版间差异、交互、错误修复、Stop | [38247467657](https://github.com/shopable-ai/opendesk-browser/actions/runs/38247467657), `176bb1916006ad98bb3d1b10c1b2f2d93a06d122` | 已固定双包候选 | 当前 main F3 / ZIP 全验收 |
| F02 React/Vue 各 20 次独立本地项目 Run/Stop | [38155034890](https://github.com/shopable-ai/opendesk-browser/actions/runs/38155034890), `1e532a8ba85131d10f666631e6b80a83b1146d75` | 历史 Native Chrome 循环 | 与 Vite 工具链效率排名 |
| 四项目独立 npm tarball 编译与修改后输入变更 | [38231722128](https://github.com/shopable-ai/opendesk-browser/actions/runs/38231722128), `8fe99dc853961b434c238bc68c1d25c3a8062b08` | 安装的 Node CLI 真实自动编译 | 浏览器同包 Native 结果 |

## 历史 F01/F02 工程验收方法（仅专项复用）

1. 在用户 Mac 的独占窗口核查 `git status`、`HEAD`、远端、其他 Agent CFT/profile/43111/dist 归属；若冲突先只读并交接，不通过另开分支规避。
2. 统一网页 `http://127.0.0.1:43111/demo-form.html`；服务由现有 `examples/tasks` 启动，确保没有占用别人的端口。固定受控 CFT 版本、实际 extension ID、packageHash、ZIP SHA、站点授权和 Allow User Scripts。
3. F01 用 **现有** `tests/framework/page-browser-worker-r243-cft.mjs` / R24.5 双版 CFT 测试：真实 Side Panel 输入 React/Vue，真实 Chrome 指针点击按钮，修复编译错误、修改再 Run、Stop；录制原生 sourceHash/previewId/documentId 和 DOM 清理。Standard 应无浏览器 JSX/SFC 直接编辑。
4. F02 用现有 `tests/framework/local-dev-native-acceptance.mjs` 和 `examples/programs/local-page-ui/`、`page-ui-react/`、`page-ui-vue/`、`local-controller/`。`page-framework-r243-loop-native.mjs` 只是导出 helper，**不可直接当 Node CLI 测试执行**。保存改变源码但不自动执行网页；必须主动 Run，并比较 sourceHash。
5. 对照组：OpenDesk；vite-plugin-monkey + Tampermonkey；vite-plugin-monkey + ScriptCat Stable；WXT。按同任务、同机器/Chrome、同网络/权限，分别做冷启动 5 次、热修改 10 次、恢复 3 次（实际可行时），保留每次原始毫秒、人工步骤、外部依赖、错误、录屏。对手使用自然可行流程，不能强制对手使用 OpenDesk 特有 UI。
6. 原始样本从 [未填成绩的 JSON 模板](evidence/global-first-r2-20261013/benchmark-template.json) 复制成新独立报告；`trials=[]` 和 `NOT_TESTED` 不是 0ms 或 FAIL。只在完整样本后计算每任务中位数/分布，并公开局限。现场受保护、CDP 不伪造 JS 执行或用户点击。

## 阻断与移交

- **F01**：Developer 公众实际可获得时间/稳定 ID、最新主线 CFT 完整版本证据、其他浏览器侧栏历史排他性检查：NOT_TESTED。
- **F02**：同设备、同任务冷/热/恢复竞品原始数据：NOT_TESTED。
- **F04**：依赖、版本、来源身份、网站权限、撤销、Stop 同候选 Chrome 完整链：NOT_TESTED。
- 当前与用户 Mac 本地 Git status/未提交并行工作不能互相证明：LOCAL_NOT_INSPECTED。
- 如源代码失败确需改动，先向相应 R24/R25/Native 工作流交接并核对所有权，不在本竞争研究中实现第二套编译器/Runner。
