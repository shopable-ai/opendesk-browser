> 历史资料：不要再次执行本文件的旧任务清单。
> 当前唯一续作入口：[Scrapling Dev续作提示词](scrapyjs-r17-product-use-and-test-20261031.zh-CN.md)。原始目标保留，按其中已完成/未完成及候选范围复用证据，不把多份历史提示词串行重跑。
> 当前以Dev核心为先；评分各维100分、综合取算术平均，旧权重只作历史。

# 接续：新增 Scrapling 功能的真实核心测试与独立 ≥95 评审

工作目录：`/Users/mac/Documents/workspace/opendesk-browser`。

## 一、用户最新定位与本轮目标

**Scrapling 是现有采集扩展正在增加的功能。本轮主要开发、实际使用和测试对象是 Scrapling 集成，不是重做 ScrapyJS，也不是单独重构 AI、Chat 或 Browser 平台。**

ScrapyJS 与 Scrapling 的规则和执行方式可以不同。按用户需要设计 Scrapling 路径，不要求调用旧 ScrapyJS JS 采集逻辑或完整复刻旧 DSL。复用原应用入口、公共 AI Provider、受控通信与任务生命周期；不复制 Host、Runner、安装器或 AI 配置页。保留旧配置和原有可用功能，不删字段制造兼容。

本轮关键目标：

1. **真实 Scrapling 数据正确**：本机实际运行已锁定的 Scrapling，试采 1–3 个不同分页，核对真实记录、字段、空值、列表范围、分页及去重。
2. **原页面可实际使用**：已有/人工规则不依赖 AI；原页面能发起试采、显示结果，核对后才允许同配置完整采集，支持进度、重开恢复、Stop 与 CSV/JSONL。
3. **补齐真实 AI 到 Scrapling**：AI 仅生成/纠正规则，沿原公共 Provider，经校验后交同一 Scrapling 链试采；AI 请求、规则和 run 必须准确关联。
4. **独立专家分别 ≥95 分**：核心证据齐备后，由两位独立审查者检查本轮 Scrapling 功能。修复有效缺陷并定向复验，直到每位均 ≥95，且无阻断或高风险问题。不得预填分数、用平均分遮盖低分，或用未测项目补分。

完整自然语言描述/纠正和免手写 JSON/CSS/HTML 仍是原产品目标。当前先补固定任务的真实 AI → Scrapling 演示，不扩建自由聊天产品；若仍需人工规则或结构样本，明确标为开发演示限制。**本轮 Scrapling 核心评分不等于整个采集产品、普通用户完整体验或 production 已达 ≥95。**

## 二、先读这些资料，复用已有结论

按顺序读取：

1. `/Users/mac/Documents/workspace/opendesk-browser/AGENTS.md`
2. `/Users/mac/Documents/workspace/opendesk-browser/docs/framework/prompts/scrapyjs-r17-product-use-and-test-20261031.zh-CN.md`
3. `/Users/mac/Documents/workspace/opendesk-browser/examples/sidebar-tools/scrapyjs/README.zh-CN.md` 顶部当前使用说明；其后旧 owner 记录只作历史。
4. `/Users/mac/Documents/workspace/opendesk-browser/examples/sidebar-tools/scrapyjs/docs/R1.7-CORE-EXECUTION-PLAN.zh-CN.md`，重点看“2026-10-31 新方案”、G1–G5/T1–T6，以及原核心评分表；按本提示词的最新测试重点执行。
5. `/Users/mac/Documents/workspace/opendesk-browser/examples/sidebar-tools/scrapyjs/local-runner/README.md`
6. `/Users/mac/Documents/workspace/opendesk-browser/examples/sidebar-tools/scrapyjs/evidence/r17-verification.json` 的 `currentCoreAcceptance.nativeCoreContinuation20261031` 与 `productUseAndRuleBoundary20261031`。

随后只按当前失败展开项目源码、原始证据和必要 Skill。唯一业务 owner 是 `examples/sidebar-tools/scrapyjs/`；框架 `src/` 默认只读。第三方规则、页面结构与 AI 业务逻辑留本项目。真实通用平台故障按已证明的 SDK 缺口处理，不将普通采集工作变成整套 Host/Go 调查。

## 三、已经通过，不要重复制造进展

原安装态 App 1.7.4 / Task 0.4.1 已真实通过：

- 同 ID 更新，旧完整配置保留。
- 人工三页、6 条记录全字段独立黄金核对。
- 同配置 preview 后明确确认 full，绑定原 previewRunId/configHash。
- 任务活跃时关闭并重开，恢复同 run，无第二任务。
- Stop 原 Worker，确认真实进程退出。
- Chrome CSV/NDJSON 实际落盘，12 条全字段独立读回一致。

复用其候选及行为范围；无变化、无新失败、证据未失效时，不重装、不重跑长任务和整组测试。新规则或新源码影响到哪项行为，才差量复验哪项；不能把旧候选证据用于证明新字节已在 Chrome 生效。

前任务 `01a190e9-7fe7-7a93-9e49-55f5e6462d32` 的新增工作：

- `src/ai-config.js` 已将本机 AI 提示词与浏览器复杂规则分开，明确当前支持字段、描述符读取、直接子项、空值、静态分页和预算。
- `src/ai-capture.js` 不再追加另一份相反规则。浏览器提示词、Python 执行器和任务生命周期未改。
- 受影响 `ai-config.test.mjs` / `ai-capture.test.mjs` 共 15 项通过，日志 `artifacts/scrapyjs/r17-core-execution/01a190e9/rule-boundary-node.log`；文档链接、账本 JSON 和最终源码 hash 核对通过。
- **这些修改仍是未提交源码，未编译、未打包、未安装；正式包仍为原 1.7.4。Node 使用测试夹具，不证明真实模型或新 Chrome 候选通过。** 不覆盖或遗漏这些修改。

当前 Scrapling 锁定 0.5，实际能力是 Selector 静态 HTML 解析 + 原受限下载器。不要为追新版本升级依赖，也不要宣传已支持全部浏览器 fetcher、动态渲染或反爬能力。

## 四、关键任务：围绕 Scrapling 当前缺口执行

先用一屏中文报告：Scrapling 用户目标、原实际入口、已通过操作、下一条未通过操作、当前能独立推进什么。当前入口为“扩展 → scrapyjs 采集 → 本机试采 / 任务”。

### T1：核对当前规则合同，直接定位实际阻塞

- 从现有用户入口和已保存证据开始；已知入口阻塞时只做能取得新证据的必要诊断。
- 核对本机 AI 提示词、工具侧校验与 `local-runner/scrapyjs_runner/dsl.py` 的真实语义。不要把 Scrapling 原生 Python API、现有本机 JSON 协议和旧 ScrapyJS 语法混为一谈。
- 按采集需求选规则表达；旧代码可复用但不是验收目标。除非当前需求确实无法表达，不重写 DSL 或另建执行器。
- 只修影响当前 Scrapling 操作的有效缺陷。没有复现问题或覆盖缺口，不为制造进展而改源码或新增测试。

### T2：补真实 AI 规则 → Scrapling 三页 → 页面结果

先遵守第五节旧 unknown 围栏。合法条件具备后，由你实际执行：

原页面按钮 → 共享 Provider 真实生成规则 → 目标/规则/代际校验 → 原可信 localTasks → 原 Python Scrapling → 三个不同分页 → 页面显示结果 → 独立逐字段核对。

保存原 AI requestId、Provider generation、实际规则、configHash、preview runId、页面来源与结果关联。不能用硬编码规则、模拟 AI、另一次 run 或旧候选冒充本次通过。必要的候选编译、同 ID 更新仅在这条操作确实需要且合法安全时，按原开发/打包/安装合同执行；先完成测试后晋升唯一包，不手改正式 JSON。

### T3：按 Scrapling 行为选择核心验证

- 数据：列表范围、相对字段、文本/属性读取、单值/多值、缺失空串、同源分页、去重和数量；依据同次原始输入独立核对，不用同一提取器生成自己的黄金答案。
- 权限/失败：只验证受影响的目标来源、安装身份、撤权、robots、拒绝响应、未知创建不重放、过时 AI 不应用。不得放宽保护制造 PASS。
- 任务/结果：复用已通过的同配置 full、活跃重开、Stop 和落盘读回；变化触及其语义或身份时才复验对应部分。
- 每组命令先简短说明：哪项实际缺陷或变更触发、证明哪个 Scrapling 用户行为，以及不执行会留下什么必要缺口。无法说明关联就不运行。

测试必须由 agent 实际执行，不交给用户代跑。测试数量、源码存在、包生成、下载受理均不能替代真实行为成功。

### T4：两位独立专家评审，分别 ≥95 才能收尾

核心证据具备后，使用两位独立只读审查者；工具允许时可分别派发只读审查子代理，不创建用户任务、分支或 worktree。审查范围为本轮 Scrapling 核心功能及实际受影响的接入与安全。

沿原执行计划的 100 分表：目标与交互 20、三页数据正确性 25、AI 与采集解耦 20、长任务可靠性 20、安全与可维护性 15。分别提供评分、扣分原因、文件位置和可复核证据。一位重点查产品/数据，一位重点查执行/安全；每位都按完整表评估，不只评自己偏好的维度。

每位最终分数均须 **≥95**；不能只看平均分。存在阻断、高风险问题、真实 AI 三页缺证或本轮核心行为未测时，不判定通过。有效问题先复现和修复，再运行对应检查并请原审查者复核；不为分数堆测试、降标准、改断言或缩写失败范围。审查工具不可用时写 `NOT_SCORED`，不得用主执行者自评分冒充两位独立专家。

## 五、旧 AI unknown：复用审计，只报告一次解除条件

原请求 `f5b15a33-8a29-4d5b-b429-a13d475bef5e` 仍为 unknown。原回执未找到可恢复的精确 Native 关联，owner 关闭也没有已证实的资源退休回执；这些已有审计，不重新搜索同一材料、点击同一查询或无限协调。

解除条件：原可信 Provider/Native owner 提供**精确关联该原请求**的合法终态或安全退休回执，并按原 pending 合同处置。新 Host 空闲、UI 关闭、进程不可见或刷新保护源码通过，都不构成证明。不得换请求 ID/Provider/窗口重发，不清记录或锁。

`b6b1ed37e` 只补当前存活 Host 的开发刷新保护，85 项 Node 通过，未部署 Chrome；不能据此宣称历史请求已结束。unknown 只约束相关推理及其环境依赖，无依赖的 Scrapling 规则、解析和源码工作继续，但只验证实际变化或证据缺口。

如果没有合法新入口或关联证明，不重复等待。完成能独立推进的工作后，一次报告具体阻塞、所需证据和下一步；整体保持 `BLOCKED/INCOMPLETE`，评分 `NOT_SCORED`，不能为了达到 95 分越过此边界。

豆瓣已有 robots403，未通过；不重试或绕过，不用 Fixture 成功替代豆瓣成功。Fixture 只能证明明确标注的可控输入范围。

## 六、环境、所有权与交付

- 只用现有 `main`，保留并行修改；不建分支/worktree/PR，不自行推送。只提交本任务获授权的变更，不夹带其他 owner 的资料或源码。
- 不擅自恢复、重启、停止或重建共享 writer，不覆盖 `dist/development`。日常 Browser 继续原 `npm run dev` / `dist/development`；历史 PID25735 暂停只是一条旧观察，不是当前状态证明。
- 真正需要产品环境时，先说明“持续开发 / 静态开发 / production”的实际模式、路径和连接状态；核对当前操作需要的身份和候选。不得绕过既有 chrome://extensions/ 或 Workspace 拒绝，不能经 CLI/OS/Profile/CDP 复刻被拒操作；不抢其他任务的 Chrome 窗口。
- 凭证只交原可信选择器，不进入模型、iframe、源码、截图预览或日志；不自动读取 Cookie/私人正文，不扩大授权。
- ≥95 针对本轮核心，不自动触发 production、全仓测试、宽度缩放、跨浏览器、压力或长时间故障注入。
- 唯一状态/评分/证据继续写入 `examples/sidebar-tools/scrapyjs/evidence/r17-verification.json.currentCoreAcceptance`；使用原 README 和执行计划，不另建总 Goal 或平行验收账本。接手后写实际新 owner，保留前 owner 的历史；实读目标状态，不能伪报迁移、暂停或完成。
- 前任务 `get_goal` 最后实读为 null，无新 AI、采集、浏览器、安装、服务或构建动作在途；历史 AI unknown 仍未收尾。此前中断不构成允许重发或恢复服务的授权。接收后按实际证据核对本任务依赖，不做环境普查。

最终先回答“用户现在怎样使用新增 Scrapling 功能”，再列：已完成、部分完成、阻塞、未测，以及两位专家实际评分/缺证状态。附按按钮操作说明和最小证据入口；明确当前候选与实际验证范围。工作完成必须同时有真实核心证据和独立达标评审，不能仅交计划、测试数或承诺。
