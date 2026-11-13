# Web Flow

**UI 对齐进行中（2026-11-14，R3）：** 唯一正式包 **0.3.40 已沿原审阅链实际安装**，版本与完整 SHA 已读回，权限及固定 Task pin 未变。本轮仅修浅色正文为白色，UI/包检查 **85/85 PASS**、同源检查通过；同候选实际侧栏与 app 页已核对背景、紧凑行、三档宽度、深色、菜单命中、搜索和成功通知，原 UNKNOWN 身份保留。续查已补齐 **WFUI-09 同候选筛选/排序/收藏重载读回**，并证明实际行在 hover/键盘焦点下无几何移动，成功通知不清除已有 busy 错误。正向共享抽屉仍受其他任务/应用身份的准备占用阻塞（`E_TASK_BUSY`），保存、确认执行及 Run/Result 尚未验证；未清空、取消或重放原准备。整体及 goal 未完成，原对话目标未修改。见[执行卡](docs/execution-plan.zh-CN.md)与[R3 分层证据](evidence/ui-alignment-r3-20261114.json)。

> **独立脚本归属与「我的」统一管理（2026-11-14 设计基线）：** [Controller Task 资产、内置脚本与跨扩展消费合同](../../docs/architecture/installed-controller-tasks-and-workflow-consumers.zh-CN.md)。该合同区分脚本源码、内置发行、安装、委托、运行和卸载；**尚未完成目录迁移或改动现有运行链**，以下当前状态和 UNKNOWN 限制继续有效。

## 架构硬约束：WebFlow 只编排固定任务（跨对话接续必须遵守）

> **长期产品原则，不是 R8/R9 某一轮的临时方案。** WebFlow 负责「什么时候触发哪个**已安装、已批准、版本固定的 Task／业务适配器**，以及怎样交接、恢复和展示结果」；具体网站操作由各自 Task／受审站点适配器完成。OpenDesk Browser Framework 仅提供通用 SDK、Installer、Authority、Controller、RunHost、Durable Result 与通用权限/生命周期。**业务脚本不是 WebFlow 内核，WebFlow 也不是第二套 Controller。**

### 三层归属与可执行边界

| 层 | 允许负责 | 不允许负责 |
| --- | --- | --- |
| Browser Framework / 可信宿主 | 独立安装与版本校验、网站及文档身份、授权、一次性执行栅栏、Controller/Run/Result、必要的通用 Host→Task 委托接口 | 在通用 `web-task-ingress`、Controller 或 SDK 中硬编码 GitHub Issue、ChatGPT 分析流程、特定 Task 版本和业务步骤 |
| WebFlow 通用编排 | 用户明确请求 → **固定工作流定义/已安装脚本引用** → 步骤依赖、`workflowId`、`operationKey`、`deliveryKey`、持久状态、UNKNOWN 只读恢复、结果引用与展示 | 在通用状态机/列表/权限内核中直接处理 GitHub API 响应、ChatGPT DOM 点击、百度/Google 搜索细节、某个仓库或具体账号 |
| 固定业务 Task／业务工作流定义／受审站点适配器 | 各自拥有输入 Schema、站点行为、参数/输出校验、Task ID+版本+manifest/content SHA，具体领域步骤与必要范围授权；通过原可信合同执行 | 自建 Runner/Authority/Installer、跨越执行世界提权、拿沙箱代码冒充可信 Host、把网页或 AI 返回文本当作安装/执行授权 |

**固定脚本与工作流不是同一概念：** 一条 A→B→A 业务流程可对应一个**版本固定的工作流配方（Recipe）**，该配方按步骤**引用多个已安装 Task/受审适配器**；不要求把 GitHub 网络读取、ChatGPT 创建 B、回传 A 塞进一个万能 Controller Task。每次有副作用的网站操作仍由对应 Task 或受审第一方站点适配器在其原执行世界完成，WebFlow 只编排调用顺序、关联持久证据。若某一步只有已审阅的受权网络适配器、尚无已安装 Task，必须如实标明适配器身份和能力，不能虚称已触发固定脚本。

**A→B→A 应有的数据流（目标，尚未全链完成）：**

```text
ChatGPT 原 A 的明确请求（来源身份/用户意图）
  → WebFlow 选择已审阅固定业务配方 + 复核持续授权
  → 冻结本轮任务提示词与 send:true（本轮不读取外部仓库数据）
  → 原 Task Catalog/Authority 校验精确已审阅版本（R11 实际为 0.2.2）的安装和权限
  → 原 Controller/RunHost 单次执行该 Task（send:true）创建唯一 B
  → 原 Durable Result + B 专用校验适配器验证完整回复
  → 原可信 ChatGPT A 交付适配器单次发送、官方消息 ID/正文 SHA 读回
  → WebFlow 通用事务 DONE；未知结果只查原 Run/Result/交付回执
```

**每条箭头都是受控接口，不是 WebFlow 内核直接抓网页或点击发送。** 站点账户/Profile、页面 Document、安装身份、能力、撤权和不可逆操作记录必须在可信边界复核，不能因配方已被批准而绕过原 Controller 或站点安全检查。普通 AI 回复中出现 Task 名称或 JSON 只属于**请求数据**；必须由可信调用链审阅/授权才可执行。


## R11 当前状态：原 A 交付 UNKNOWN，禁止重发（2026-11-13）

`OD-WEBFLOW-FIXED-CHAT-TASK-A2B2A-R11` 当前只做 dev 主流程：普通 A 一次能力接入和可信审阅 → 已安装固定 Task 单次创建 B → 完整 Durable Result → 原 A 单次可信交付。不读取 GitHub Issue，不做 0.3.0 两阶段发送，不新建 Runner。

真实入口仍为 `chatgpt-fixed-bridge` → 原 Trigger Ledger → Task Catalog/Authority → Offscreen RunHost/Controller → 固定 Task → 原 Durable Result → 原 A 交付 Adapter。旧 0.2.0 字节保留；0.2.1 修复现代 composer，0.2.2 补齐现代完成标记及官方消息 UUID，均显式审阅，不自动升级旧安装。实际本轮使用 **0.2.2 / generation 3**。

[原 A](https://chatgpt.com/c/6af6f83f-6ebc-83e8-8d1a-fa532cc70e38) 已提出自然请求并产生受限候选；唯一[原 B](https://chatgpt.com/c/6af704a4-82d8-83e8-adee-63f161ccecda) 只有一条用户任务，完整回复 **1137 字符**与持久化 Result 逐字相同，Run 已完成并释放。原 A 已有一条结果消息，但其官方正文 **3021 字符**与冻结发送正文 **2947 字符**的 SHA-256 不同，链接与反斜杠有差异；尚未区分发送序列化与页面渲染原因，**不能标记 DELIVERED 或 R11 完成**。

源码补丁保留具体只读失败原因及冻结 SHA，并由原持久/授权栅栏投影 UNKNOWN 原因；定向恢复 **52/52**、结果合同 **19/19**、精确来源 **3/3 PASS**。固定结果适配器另拒绝 0.2.2 的非 UUID B 回执，原脚本/包不变，原 Result 仍通过且冻结正文未改变。当前原记录仍是旧通用拒绝原因，新诊断补丁的现场恢复 **NOT_TESTED**。原 RunHost/侧栏已不在当前扩展上下文中，不伪造 Host 调用或改写数据库。保持原请求、Run/Result、A/B 和发送围栏；禁止补发、另建 B、替换正文或规范化哈希。

全文回传仍遵守原 **8192 UTF-8 字节（含转义封装）**上限，超限明确拒绝并保留完整 Durable Result；工具 JSON 不能替代固定编译代码。本轮无 production build/package verify、全量 CI 或正式评分；R11 六项职责原始名单未恢复，**NOT_SCORED**，不能用历史六视角代替。精确身份、哈希、证据分级和唯一下一步见[当前执行卡](docs/execution-plan.zh-CN.md)及[原请求核对记录](evidence/r11-original-a-reconciliation-20261113.json)。下方 R10/Issue 与 0.3.0 是历史。

### R10 实际依赖边界与剩余风险（2026-11-13；`OD-WEBFLOW-FIXED-TASK-DECOUPLING-R10`）

**已隔离的真实调用：** 普通网页请求仍使用 `src/sw.js → createWebTaskIngress → 原 Trigger Ledger/Authority/Controller/Run/Result`。固定 GitHub Issue 工作流授权则由 **SW 编译期注册** 的 `projects/webflow/trusted/issue-workflow-auth-host.js` 独立接收精确 `workflow-auth-read/approve/revoke` 三个消息，经原 ingress 的同一可信 Side Panel 身份核验，再调用原 `foundation.authority.resolveInstalledTask` 与原 `frameworkKV` 事务。通用 `web-task-ingress.js` **不再导入/处理** GitHub Issue 授权规则；任何其他任务都不能继承该业务授权。此注册仅限代码审阅后编译入 SW，不存在沙箱或 AI 输出动态注册 Host 能力。

```text
WebFlow 通用网站意图 → SW → web-task-ingress → 原 RunHost/Controller/Result
                                      (原 Task Catalog/Authority)
GitHub→ChatGPT 授权 UI → 原可信 Side Panel Host
                       → SW 受审 business handler registry
                       → issue-workflow-auth-host (业务审批适配器)
                       → 原 Side Panel 文档验证 + 已安装 Task pin/权限复核
                       → 旧 frameworkKV 授权记录（原 key/epoch/撤销）
```

**固定配方与安装引用：** `issue-workflow-authorization.js` 新增只读 `ISSUE_WORKFLOW_RECIPE`，声明唯一仓库、GitHub API 来源、ChatGPT 0.2.0 Task ID/版本/Script 修订/目标和四项业务能力；`issueWorkflowScope()` 仍投影**完全相同的 v1 授权字段**，不修改原授权记录、不自动升级。执行前仍必须通过原 Task Catalog/Authority 核对 **manifestHash、contentHash、installationId、generation、siteOrigins、Chrome 权限**。该配方不是任意 Task 的通用 API，也不意味着 GitHub Issue 读取、B 调用与 A 交付已经正式接线。

**受信边界保持不变：** `chatgpt-fixed-bridge-host.js` 的原生手势/冻结审阅、`tool-shell.js` 与 `AutoSettings.tsx` 的原 UI 映射保留为**明确命名的第一方业务入口**；`serial-two-step-run.js`、`md-workflow-engine.js`、原 V1/V2、0.2.0 Task、Authority/Controller/RunHost 与持久 Run/Result 均未重做。后者 `md-workflow-engine.js` 是历史 **Markdown 专用**编排，不是 WebFlow 通用状态机；仍绑定 ChatGPT 0.2.0，若未来要改成其他业务配方，应由该专用适配层单独调整，不得复制通用引擎。

**尚存耦合/缺口：** 原 `web-task-ingress.js` 的 ChatGPT background/settle/delivery 和 `chatgpt-fixed-bridge-host.js` 的 ChatGPT UI 方法仍属第一方站点专用路径；本轮只拆 GitHub→ChatGPT 的 **通用 ingress 授权混入**，不假装所有站点适配均已抽象完毕。Sidebar `tool.config.json` 仍只固定委托百度 1.1.5 和 Google 1.0.3，ChatGPT 0.2.0 的资源存在不意味着已经安装/委托给 Sidebar。Issue 获取 → 创建唯一 B（send:true）→ 验证完整 B → 原 A 以 deliveryKey 单次送达的 **R9 生产闭环仍未完成**；任何 UNKNOWN 均保持原单次围栏，只读原 Run/Result/消息回执。

**R10 验证边界（同源码候选 `4f85cd20`）：** [正式 CI](https://github.com/shopable-ai/opendesk-browser/actions/runs/43263417411) 的授权 12/12、精确 Blob pin 2/2、ingress 70/70 和两步事务/0.2.0 兼容 63/63 全部通过；**production build / package verify 真实 PASS**。Google 专项 PASS；旧百度测试 17/30 FAIL，原广域 0.3.0 测试 2/131 FAIL，故整个 CI **FAIL**，不能宣称全量兼容通过。本机 CodexPro 未连接，`CHROME_NOT_TESTED`、`R9_BUSINESS_NOT_DONE`。独立结论及精确回执在[原执行计划](docs/execution-plan.zh-CN.md)中登记。

---

**概览最终核验 R4（2026-11-12）：** 正式包已按当前源码晋升为 **0.3.33**，修正原请求已释放后首页仍提示待核对、恢复数据读取失败却显示正常的两处状态文案；请求详情、权限和 UNKNOWN 防重放保持原入口。指定五文件 Node 回归 **162/162 PASS**，正式包同源检查通过。真实 Chrome 扩展页面访问被浏览器安全策略拒绝，**CHROME_NOT_TESTED，R4 未完成最终验收**；源码、安装包和实际安装状态须分别核对。

**统一脚本导入与添加入口 R1（2026-11-11；`OD-UNIFIED-TASK-IMPORT-R1`）：**「我的」与全页任务目录新增文件拖放、键盘选择及统一可信文件校验；Web Flow → 脚本正式源码新增 `+` 四路径向导，复用现有固定任务状态，不引入任意 Task 动态授权、Runner 或第二套安装器。JavaScript 仅进入开发草稿，Task Package 仅进入待验证候选；当前 Web Flow 沙箱缺少通用受控宿主“开发/文件导入”导航接口，对这两条路径仅显示真实手动操作。**源码已提交不等于安装包已更新**：正式包基线仍是 0.3.32，本轮 Node/Chromium/打包/真实 Chrome 安装以[执行计划](docs/execution-plan.zh-CN.md)的最新实证为准，不能沿用历史通过记录。

**概览清理 R1（2026-11-11）：** 唯一正式包现为 **0.3.32**，首页收敛为状态、真实脚本统计与最近活动；待核对请求从「查看记录」进入原恢复页，身份信息保留在详情。Markdown 开发卡片和实验入口已从首页移除，相关引擎与数据保留。相关 Node 164/164、候选晋升及同源检查通过；源码组件通过不代表新包已安装，**0.3.32 实际 Chrome 安装验收 NOT_TESTED**。结果与证据边界见[本轮执行卡](docs/execution-plan.zh-CN.md#概览清理-r12026-11-11od-webflow-overview-cleanup-r1)。

**ChatGPT 项目文件浮窗退役（2026-11-11；OD-AI-WORKFLOW-BRIDGE）：** 当前 `main` 的网页文件适配器为 Headless，不再注入「项目文件／停止项目任务／展开」面板；状态、Stop 和审阅通过 Web Flow「运行与授权 → 项目文件」进入现有可信扩展设置。原消息监听、文件授权、Native 回执和 UNKNOWN 防重放保留。**源码已退役不等于用户 Chrome 已更新。**

**R2 正式工具包历史状态（2026-11-11；当前版本以上方 R1 卡为准）：** `tool.config.json` 与唯一正式 `webflow.opendesk-tool.json` 当时均为 **0.3.27**，正式包包含 R2 `createTaskNoticePublisher`；[Web Flow CI 42989278190](https://github.com/shopable-ai/opendesk-browser/actions/runs/42989278190) 的定向 Node 71/71、Chromium 源码组件 320/360/400px、`--promote-from` 和 `--check-project` 均通过（`PROJECT_PACKAGE_MATCH`，包 SHA-256 `4008ed394a171ba91649e97e916d974e0352e1fe8c2c2e89580fa2cc3e02abca`）。**这些不证明用户本机已更新或实站任务已成功。** 工具包与浏览器内容脚本 `agents/chatgpt-fixed-bridge.js` 属于不同发行路径，不能互相代替；实际安装的扩展 ID、unpacked 路径、Host R1.2、脚本 hash 和 Chrome/Native 全链仍待现场核验。完整溯源及待验收入口见[原执行计划 Headless 专项](docs/execution-plan.zh-CN.md)。

**百度首页最新核心测试（2026-11-10，20:10）：** 在自有 ego TaskSpace **61** 的百度首页，经真实「扩展 → Web Flow 0.3.26 → 脚本」保存新关键词 `MDN Web API MutationObserver`，新请求 `webflow:fcd2a5b4-c77e-430e-ae7b-1cd2b5e68caa` 仅点击一次「确认手动运行」。页面随后跳转到 **wappass.baidu.com 的百度安全验证**，回跳地址携带本次关键词；没有取得三条结果。WebFlow 仍显示“原请求仍未确定”、阶段“执行中”、资源释放 `not-started`；这不是底层已释放证明，Run/Result、输入读回和准入次数尚未读回。ego 已将 Space 交由用户控制，按合同停止浏览器操作；未重放、解验证码或修改产品源码。开发服务实读已连接，revision `4fbac865a7b7d5ad4419f3436de5dc5e55e31e75bab596a04cf899e535c9d006`，原 UI 租约已释放。**首页核心链仍未完成**；用户处理验证并明确继续后，先只读核对同一请求及真实资源状态，再决定下一条独立操作。详见[原证据的 homepageCoreAttempt](evidence/baidu-core-ui-20261110.json)和下方历史范围。

**百度固定脚本核心 UI 目标（2026-11-10，18:56 实测）：** 失效状态、原链重新验证/安装、真实 WebFlow 新手动请求及刷新/重开保留均已有证据。新请求 `webflow:e217bd20-4c4c-4ebf-a77d-4037c9db69bb` 明确确认一次，Run `9d983fd5-5a7c-4a0b-b98a-f6f6e57050c8` / Result `9e226e27-2eaa-4331-8cc7-54b106c69eed` 返回 **success / count=3 / workerRetired / released**；刷新安装状态和退出重开后，从“记录 → 查询原请求（只读）”读回同一结果，16 个百度相关 Run ID 集合不变。**本次成功限于精确关键词结果页的只读分支，不代表首页跨文档搜索链通过。** 详见[当前执行卡](docs/execution-plan.zh-CN.md#百度固定脚本核心-ui-目标与关键条件2026-11-10)。

**固定脚本状态与恢复：** 真实 WebFlow 显示“待重新验证”、禁用运行并保留原任务管理入口；当前运行时以同源码开发 Run `301e642d-92f4-4325-a065-2ed29f89b796` 验证三条结果、释放资源后，沿原目录核对、设为可用及确认安装，百度 **1.1.5 / generation 4** 恢复“可手动运行”。并行 owner 更新后的实际 WebFlow 包为 **0.3.25**，真实委托 packageHash 与正式 JSON SHA `68c1b9944256fb6c0b02acc88d22e6b65554c91e3bb29d0fbbf8b167024e350b` 相符。旧取消请求仍为 admissionCount=0，无重放。当前三项运行资源均返回 200，旧 E_BUILTIN_RESOURCE 阻塞已解除；首页试运行的 E_DOCUMENT_REPLACED 和关键词不匹配请求的 E_TARGET 均保留真实停止/释放记录。该续跑未改产品源码、重打包或重复既有 Node 检查，不扩大到 production、评分及其他业务。[完整证据](evidence/baidu-core-ui-20261110.json)保留原快照与 resumedCompletion。

**搜索执行页参数与 Google 核心修复（2026-11-10）：** 当前正式可导入包为 Web Flow **0.3.26**，真实消费者同步百度 **1.1.5**、Google **1.0.3**。Google 修复无关资源拖延 load 以及延迟搜索建议遮挡按钮：收起建议后只提交一次搜索，按 domcontentloaded 交接，UNKNOWN 不重放。Google 1.0.3 已经同源码原生验证、原目录核对及安装至 generation 5；Web Flow 0.3.26 已沿真实侧栏原审阅链更新，权限未变化。`showExecutionTab` 是可选严格 boolean：省略默认 true，显示执行页；false 仍新建后台页、搜索和回执，只不置前。可直接用[Google 短提示词](prompts/02-google-direct.prompt.txt)或[后台提示词](prompts/03-google-background.prompt.txt)，候选严格五字段，参数在 args 内，由原 Host 映射为 Task params。参数或安装身份变化仍独立审阅，Google 不开放可变关键词授权；最后保留默认精确批准。相关 Node 72/72、消费者 2/2、候选晋升 4/4；三条新聊天及原生证据以[当前执行卡](docs/execution-plan.zh-CN.md#google-默认焦点失败修复当前卡2026-11-1001a1c495)和[脱敏记录](evidence/google-focus-repair-20261110.json)为准。production、全量 CI、V2 和评分未执行，未提交推送或发布。

**精确授权的可选默认值（2026-11-10）：** 新审阅的精确授权沿原 `parameterPolicy` 存储可信 Host 从已安装任务取出的固定 Schema，`variableKeys: []` 表示无参数可变，只按该 Schema 比较可选默认值。因此 Google 的显式默认 `true` 批准也匹配省略该选项的请求，`false`、关键词及其他固定值变化仍待批准；required 参数必须显式存在。此规则不按任务或参数名硬编码，不给 Google 增加可变关键词许可。历史无 Schema 授权继续精确匹配，需重新审阅才能采用默认值语义；不改候选原文或发送见证。本次只改固定编译授权与可信展示，不重打无变化的应用 JSON。

> **Markdown 两任务 Demo（2026-11-10；历史源码阶段）：** [真实仓库任务样例](examples/workflows/md-demo.md) 可解析两任务、独立验证 T01/T02 的计算与读回交接规则；**概览清理 R1 已移除首页实验入口**，保留源码、引擎和历史数据。公开 GitHub 读取仍须原 Browser Network SDK 的 `network` 能力及目标站点权限；实际浏览器读取、真实新聊天、跨聊执行/恢复均 **NOT_TESTED / 待接线**，不属于本轮概览清理。权威规范与进度仍只见 [产品合同](docs/product-contract.zh-CN.md) / [执行计划](docs/execution-plan.zh-CN.md)。


> **2026-11-10 本轮源码增量（OD-AI-WORKFLOW-BRIDGE）：** V2 四字段候选已进入 ChatGPT 完整回答识别、可信固定目标校验、独立单候选 Side Panel 批准与原 Controller/Run/Result 查询栅栏；不会继承 V1 的任何任务级批准。新增 `tests/task-v2-live-ledger.test.mjs` 并接入固定桥接 CI；本轮隔离 V8 语法及账本行为检查通过，Node CI 的实际结果、Chrome、打包与新聊天 A→B 业务 **未验收**。未知/当前页/动态目标仍拒绝；启动前自动前台偏好、`chatgpt.conversation.create`、Gemini 均 **未完成**。以[本轮执行卡](docs/execution-plan.zh-CN.md)为准。

> **2026-11-10 · V2 协议 / ChatGPT 新对话 / 执行页可视化（OD-AI-WORKFLOW-BRIDGE）：** 在保留 `webflow.task.intent.v1` 严格五字段与旧授权的基础上，新增 `webflow.task.intent.v2` **四字段独立解析器**及内置百度/Google 的已审阅固定入口解析模块。AI 意图不带 `targetUrl`，执行层仍持有精确目标；V2 独立授权与真实运行、后台任务的**当前运行前台查看**已完成源码接线但仍未执行 Node/Chrome 实测；可在启动前选择的自动前台模式、新对话自动创建/Gemini 仍未完成，**不得把协议解析等于 V2 自动执行**。真实状态和下一步看 [原执行计划当前卡](docs/execution-plan.zh-CN.md#v2-协议--新对话--执行页可视化当前执行卡2026-11-10od-ai-workflow-bridge)；规范看[原产品合同](docs/product-contract.zh-CN.md)。


OpenDesk Browser 中的独立业务扩展应用：把网页操作、AI 对话输入输出、跨对话交接和任务恢复组织成可追溯的连续工作。

**唯一项目根：`projects/webflow/`。固定检索词：`OD-AI-WORKFLOW-BRIDGE`。**

**两份提示词与 Google 核心测试（2026-11-09）：** [一次接入说明](prompts/01-capability-setup.prompt.txt)、[Google 短提示词](prompts/02-google-direct.prompt.txt)及两处设置生成器已进入提交 `d2465192d`，执行回复为中文说明加唯一协议块。开发服务恢复后，在[最新 ChatGPT 新聊天](https://chatgpt.com/c/6af1df79-ab04-83e8-8e06-db19beebafab)直接发送短提示词作为第一条消息，原链复用已批准精确范围，Google **1.0.0** 自动执行，返回 **3 条真实结果**；原聊天只新增一条结果消息并完成 AI 中文整理，结果后没有新候选。首条全链复测 **PASS**，未重放旧候选。本次仅返回标题和 Google 跳转链接，未采集实际摘要或最终目的 URL；早先的资源故障保留为历史，新设置界面的文案仍未现场核对。相关检查 **113/113 PASS**，源码哈希未变。见[记录](docs/execution-plan.zh-CN.md#两份提示词与-google-核心测试2026-11-09)和[证据](evidence/google-prompts-20261109.json)。

**用户可见窗口复测（2026-11-09）：** 按用户要求将原 ego 窗口置前，核对[当前聊天](https://chatgpt.com/c/6af1e0bd-d420-83ec-b602-9fbb7ae213f9)已有一条 Google 成功回执，再发送一条全新明确请求；两条结果均为 `completed / success / count=3`。原侧栏账本由 1 增至 2，并确认新一轮同次持久结果、资源释放、单次回传及 AI 续答。窗口和结果已保留供手动查看。用户报告的失败本次未复现，原因未知；没有为制造修复修改源码或重放旧候选，详见[证据](evidence/google-prompts-20261109.json)。

**最新核心复测通过（2026-11-09；历史提示词）：** 在[修复后的新 ChatGPT 聊天](https://chatgpt.com/c/6af1d06c-4000-83ec-95df-a5bf2f7efac6)复制同一历史能力说明，普通发送浙江、陕西两个博物馆的百度搜索需求；连续两轮均返回三条真实结果、各回传一次并完成 AI 中文续答，同次持久结果和资源释放已核对。后台补齐网页拒绝原因及最终核验失败的记录，相关检查 **94/94**，保留 UNKNOWN 与禁止重发。开发更新曾使上一页面监听断开，两条候选未执行；重新进入空聊天后完成上述复测，没有补跑旧候选。原失败具体原因仍不可恢复，不将本次成功写成所有历史故障已查明。见[本轮记录](docs/execution-plan.zh-CN.md#历史提示词回传诊断修复与连续复测2026-11-09)及[证据](evidence/delivery-repair-20261109.json)。

**修复前复现（2026-11-09；历史观察）：** [原失败聊天](https://chatgpt.com/c/6af1af5a-cf4c-83ee-95f8-932b4eb1d6c8)有合法候选和原请求，账本为“已完成 · 回传未知，禁止补发”，没有结果消息或摘要。该轮结束时未取得完整 Run / Result 或具体错误，也未修复；本轮补读结果及证据边界见上方最新记录。原失败现场及[原证据](evidence/historical-prompt-repro-20261109.json)保留，不重放。

**全新聊天核心链已验证（2026-11-09）：** 在[全新 ChatGPT 聊天](https://chatgpt.com/c/6af1a844-05f0-83e8-97ff-e290f21c604b)复制产品能力说明后，普通发送“请用百度搜索‘南京博物院开放时间’，给我前三条自然网页结果”，原监听自动执行已安装百度 1.1.4，实际返回三条自然结果；同一 Run / Result、资源释放、原聊天单条结果交付与 AI 中文续答均取得真实证据。首次尝试的侧栏明确显示监听断开、账本 0 条；安全进入新的空聊天、确认连接后跑通，旧候选未补跑。该现场不能直接解释用户此前所有失败。本轮未新增产品源码修改，复用含并行修复的持续开发环境；仅更新文档与[本轮证据](evidence/fresh-chat-core-20261109.json)，production 仍未验收。见[全新聊天记录](docs/execution-plan.zh-CN.md#全新聊天核心验证2026-11-09核心开发)。

**已接入原聊天的历史核心验证（2026-11-09）：** 原聊天正常发送“故宫博物院 开放时间”需求后，AI 五字段候选经原监听和既有授权，自动调用已安装百度 1.1.4，返回三条自然结果；同次持久结果、资源释放、结果回填／发送和 AI 中文续答分别取得真实证据。已获准安全接管 writer，原 `dist/development` 与扩展 ID 保持，侧栏服务连接恢复；最小修复 Cloud Host 的包数据依赖，未放宽来源门禁。旧 UNKNOWN 未重放。共享开发树证据不等于 production，正式验收继续延期。见[当前执行卡](docs/execution-plan.zh-CN.md#普通百度需求当前执行卡2026-11-09核心开发)与[证据](evidence/core-request-20261109-current.json)。

**内置任务接入（2026-11-09，V0.3.22）：** 已实现首次访问任务目录、解析任务或后台候选时，通过原 Task 安装事务安装百度 1.1.4 与 Google 1.0.0；只使用原固定包，不要求开发 Run/runId，不运行脚本或开启自动触发。已有安装、停用、数据与授权保持；卸载选择持久保留，恢复进入原目录审阅。普通导入任务仍需原真实运行验证。核心定向 92/92、恢复导航 20/20、包门禁 8/8；唯一正式包已同源晋升，ego 原安装链已更新并读回 **0.3.22**。**该轮当时后台仍为旧产物，只有百度可用；本轮恢复后工具实际显示两项均可运行，但仅执行百度核心链。** 该轮来源锁未核对是历史观察，最新修复与当前入口阻塞以上方执行卡为准；框架实际生效仍须单独核对。该轮自动运行实读 OFF；本轮按既有批准范围开启，旧 UNKNOWN 未重放，正式验收维持原边界。见[本轮记录](docs/execution-plan.zh-CN.md#内置任务接入与恢复2026-11-09v0322)及[证据](evidence/builtin-onboarding-20261109.json)。

**高度宿主已收尾（2026-11-09；01a1bf25）：** 用户已继续移交宿主高度修复与提交。现有持续开发输出已在真实原生 Side Panel 完成正常／矮窗口复验：内容区分别为 **360×665 / 360×365**，iframe 高度 **505 / 205px**，均延伸到窗口底部，外层无尺寸溢出；帮助可滚到底，矮窗口脚本／应用偏好可返回，可信“运行与授权”面板可关闭，自动运行保持关闭。ego 多窗口列表下可按目标页面操作，但此次原生滚轮和窗口缩放未生效，故专项复验使用独立临时 Profile 的 Chromium，直接加载原 `dist/development`，未写输出或接管 writer。矮窗口 Debug 前后实读同一连接指纹 `e5d1061c1be6`。仅高度提交输入搭配原 HEAD 的 More 菜单也通过 16 组源码夹具检查，Host 定向 10/10；并行页头／安装状态改动不纳入本次提交。唯一正式包仍为已原位更新的 **0.3.21**，不用另发版本。见[本次记录](docs/execution-plan.zh-CN.md#高度宿主核心交付2026-11-0901a1bf25)与[证据](evidence/host-delivery-20261109-01a1bf25.json)。下列未安装／未移交／未测高度均为各段当时观察；production、Native 配对、真实 Task、IME 与完整验收继续延期。

**草稿修复已交付（2026-11-09；01a1bf25，V0.3.21）：** 用户已移交正式包与版本收尾。唯一[更新包](webflow.opendesk-tool.json) **0.3.21** 已由原打包器晋升、同源核对，并在 ego 真实侧栏沿原安装器 **0.3.19 → 0.3.21** 同 ID 更新；安装审阅显示权限与固定任务不变，Google 收藏保留，自动运行关闭。安装后的普通工具页已验证搜索清空后帮助／应用偏好可进入、主题保存读回后可导航、返回原脚本 Tab及独立工具设置。复用相同源码的应用／恢复 **55/55**，本轮包门禁 **8/8**。临时主题和收藏已恢复，TaskSpace 56 已释放；未安装、授权或运行 Task，未发送 ChatGPT。并行皮肤 owner 随后启动唯一开发服务，页面实读连接及指纹 `2bbde69c8ae0`；本对话未写共享 dist 或接管 writer。真实矮侧栏高度、IME、Native、production 与完整 CI 仍 **NOT_TESTED**。以下各版本段落保留当时观察，不代表当前包仍未安装。见[交付记录](docs/execution-plan.zh-CN.md#草稿修复同源交付2026-11-0901a1bf25)及[证据边界](evidence/core-delivery-20261109-01a1bf25.json)。

**本轮真实安装（2026-11-09；01a1bcf7）：** 原安装器已同 ID 更新 **0.3.14 → 0.3.19**，确认收藏／主题保留、三 Tab、搜索清空、筛选排序、帮助／应用偏好回退、独立可信设置与中文任务不可用保护。真实检查同时复现矮窗口裁切及搜索／已保存偏好留下草稿标记；后者已在应用通过现有 `setState` 修复，应用／恢复 **55/55**、包门禁 **8/8**。修复仍只在源码和临时候选，未安装；下述并行正式 **0.3.20** 包尚不含本次草稿修复，不能当作当前全部源码的同源交付。正式包／版本收尾待 owner 移交，高度还须 Browser 宿主改动生效。自动运行保持关闭，未执行真实 Task。详见[执行记录](docs/execution-plan.zh-CN.md#真实安装核心检查与草稿状态修复2026-11-0901a1bcf7)及[证据边界](evidence/installed-core-20261109-01a1bcf7.json)。

**统一 Host 高度历史开发验证（2026-11-09，V0.3.20）：** 高度与滚动由框架统一分配给所有沙箱，不再按工具 ID 区分，也不接受内容回报改变 iframe 高度。Web Flow 只以 `100%` 填满画布，原导航、帮助、应用偏好及业务逻辑保留。当时真实 AppShell / Host / opaque Sandbox / bridge 和可信“运行与授权”组件的浏览器夹具通过：五个应用页面、窄矮窗口、控件展开、长列表返回、旧 HTML / Vue / React 保存重开及自然滚动均正常；16 组尺寸记录、Host 9/9、应用与恢复 51/51、包检查 8/8。当时 **0.3.20** 已晋升并同源核对，但未加载宿主、未安装包；该版本历史结果见[证据](evidence/sidebar-host-layout-20261109.json)。现由上方 0.3.21 与宿主收尾接续；单独导入 JSON 仍不能更新 Browser 宿主。原预览不作为本次 Host 高度证据。

**设置入口区分（2026-11-09，V0.3.19）：** 应用入口使用滑杆图标，名称、悬停提示及页标题统一为“应用偏好”；宿主工具设置继续使用齿轮。顶栏保持“帮助 → 应用偏好 → 工具设置 → 卸载”，主题及全部原有内容保留。相关应用导航 5/5、Header 组件 3/3、打包检查 8/8 通过，完整源码预览已更新；唯一[更新包](webflow.opendesk-tool.json) **0.3.19** 已晋升、同源核对，当前运行环境尚未加载。下方 V0.3.18 是入口位置调整的历史记录。

**当前入口位置（2026-11-09，V0.3.18）：** 帮助与应用设置改为宿主右上角、原“…”位置的两个常显图标，与卸载同排；支持时内容区不再重复入口，旧宿主保留回退。原帮助四组内容、主题与设置项、返回原页签均保留。复用公开 `headerActions` 与唯一可信 React Header：1–2 个有图标动作直接显示，更多或无图标动作仍用菜单。ego TaskSpace 50 已在完整源码组件核对键盘打开、主题保存、返回脚本及两个图标与卸载对齐；相关定向检查通过。唯一[更新包](webflow.opendesk-tool.json) **0.3.18** 已晋升、同源核对；**当前 Browser 尚未加载本次宿主代码，新包尚未安装**，仅更新 JSON 不能改变旧宿主工具栏。已同步[可交互源码预览](preview/webflow-v0.3-preview.html)，不继承 0.3.14 的实际安装证据。详见[本轮记录](docs/execution-plan.zh-CN.md#宿主右上角直接图标2026-11-09v0318)。下方段落保留各轮历史结果。

**高度与滚动修复（2026-11-09，V0.3.17）：** 原 `min-height:100%` 的父级高度不确定，短页面只按内容展开。现在复用宿主已有的可用高度提示铺满应用，导航保持可见，正文独立滚动；旧宿主未提供提示时自然展开，避免 iframe 高度反馈增长。ego 真实源码组件通过 13 项高度／滚动检查及旧宿主回退检查，覆盖概览、空记录、设置、长帮助、240px 矮窗口和菜单可达；模拟 Task 派发 **0**。保留并行配色、帮助／设置与存储改动；布局测试截图使用配色合并前的确切源码，不冒称最终配色已截图。唯一[更新包](webflow.opendesk-tool.json) **0.3.17** 已通过相关包门禁并晋升、同源核对，尚未安装。自动更新命令中的一项宿主页头旧样式断言仍失败，已分类记录，未改断言；详见[高度修复记录](docs/execution-plan.zh-CN.md#应用高度与正文滚动2026-11-09v0317)。下方 0.3.16 及更早记录为对应批次证据。

**任务不可用提示修复（2026-11-09，V0.3.16）：** 已复现 `E_PERMISSION：Task is disabled or not installed` 直接出现在脚本列表的问题，现改为中文原因与“我的”安装／恢复后刷新指引；权限、版本／验证变化、读取失败分别提示，原始错误只放在详情的折叠诊断中。任务不可用时不显示无法打开的“宿主管理”，刷新期间清除旧提示并保持运行禁用，恢复有效安装后重新核验，不自动执行或重放。新增两项交互回归修前失败、修后应用检查 **50/50**、打包检查 **8/8** 通过；ego TaskSpace 44 的真实源码组件验证同一错误、折叠诊断及恢复后刷新，模拟派发 **0**，空间和夹具已释放。唯一[更新包](webflow.opendesk-tool.json)已晋升并同源核对，版本 **0.3.16**，尚未安装；真实 Task 安装／百度搜索仍 **NOT_TESTED**。保留原 0.3.14 导航和并行存储读回改动，不修改 Browser Framework、任务 pins、权限或旧请求。详见[本轮执行记录](docs/execution-plan.zh-CN.md#任务不可用提示与恢复2026-11-09v0316)。

**入口展开完善（2026-11-09，V0.3.16）：** 原“…”中的帮助／应用设置现为带文字的“帮助”“设置”常显按钮，并标明当前页面。主题选择、运行与授权说明、开发与安装、多步骤流程说明及四组使用／排障指南完整保留并分组展开；宿主标题与唯一返回保留。ego 源码组件验证键盘打开、主题保存及返回后保留，模拟派发 **0**；相关应用检查 **50/50** 通过。当前唯一[更新包](webflow.opendesk-tool.json)已包含本次改动并同源核对，仍未安装；下方 V0.3.13 安装记录不代表新版已生效。

**ego 核心检查与收藏修复（2026-11-09；01a1bca2）：** 经当次确认安装 0.3.13，真实侧栏已验证脚本搜索百度／清空、三 Tab、筛选与设置。收藏曾实际保存却误报读回不一致；已将工具自己的比较改为忽略 JSON 对象字段顺序，保留内容、类型、数组顺序及缺失字段检查，回归修前 FAIL、修后相关检查 48/48 PASS。复用并行 owner 晋升的同源 **0.3.14**，原安装器同 ID 更新后已实测旧收藏保留、新收藏保存与排序正常，自动运行始终暂停；临时偏好已恢复，空间 42 已释放。ego 实读原 `dist/development` 开发服务已连接。两项固定 Task 未取得有效安装／启用状态，运行禁用，业务链 **NOT_TESTED**；原生 Escape／键盘焦点和空记录展开未证明。后续并行正式包不继承 0.3.14 安装证据。见[执行卡](docs/execution-plan.zh-CN.md#v0313-ui-核心执行卡2026-11-0901a1bc77)与[本轮证据](evidence/ego-ui-core-v0.3.13-20261109.json)。用户已明确授权统一提交并推送本轮 11 个核心文件；交付候选为同源 0.3.19，应用与恢复检查 51/51 PASS。宿主源码和预览继续由原 owner 交付，0.3.19 实际安装仍 NOT_TESTED。本轮提交冻结于已验证的 0.3.19，随后并行的 0.3.20 高度 CSS／版本输入保留在工作区，继续归原 owner。

**V0.3.13 历史基线：** 紧凑 UI 及原任务／恢复保护、49 项 Node、可信组件／Host／历史检查和 320/360/400px 模拟 SDK Chromium 回归已通过；原包 SHA `9447f680…c81381b4` 的 Chrome 安装为源对话交接观察，本轮未操作其 Chrome。完整证据保留在[原组件证据](evidence/ui-core-v0.3.13-20261109.json)，不提升为当前真实任务或后续候选验收。缩放、完整验收与评分继续延期；下方 0.3.11 为历史。

**当前文件核心结果（2026-11-08；01a1b79c）：** 同一原聊天、同一可信审阅页完成全新身份的真实文件链 **2/2**：读取、回填、基于真实正文提出修改、具体确认保存、系统及独立磁盘读回全部相符。第二组读取第一组保存后的版本，最终回执保留[原聊天](https://chatgpt.com/c/6af02448-0cb8-83ec-88bc-b8c6aa809310)草稿，未发送。新聊天 SPA 的入口身份误判已修复，真实首页新建聊天无需刷新即可领取正确来源；详细边界见[当前文件执行卡](docs/execution-plan.zh-CN.md#当前文件核心执行卡2026-11-0801a1b79c)和[本轮证据](evidence/file-core-20261108-01a1b79c.json)。不重复百度链，旧 UNKNOWN 保全，自然语言自主项目发现继续延期。

**网页项目文件 UI（2026-11-08）：** 正式文件能力保留；空闲默认隐藏，显式开启辅助入口也只显示小按钮，手动任务和固定协议按需展开。关闭展示与停用处理分别管理，UNKNOWN 不重放。源码 / 组件验证通过；本轮 ego 已核对实际加载脚本 SHA、紧凑入口、显式展开、关闭后最终草稿保留及恢复隐藏。系统 Chrome 和 production 不继承该证据；前轮来源漂移已解除。边界与组件证据见[网页文件面板](docs/chatgpt-local-files.zh-CN.md#网页文件面板2026-11-08)，不改变下方其他任务阶段。

## 当前 ego 安装与搜索验证（2026-11-08）

本轮 ego 普通需求搜索已 **2/2 完成**：一次能力接入后，分别搜索 `OpenDesk Browser` 和 `OpenDesk Browser automation`，两次均返回三条真实结果、保存同一 Run / Result、释放资源并回到原聊天由 AI 续答。第二条发送前已关闭真实 Side Panel，直到结果交付及 AI 续答结束才重开。**Web Flow 0.3.11、百度任务 1.1.4 已真实安装，关键词范围授权及自动运行有效。**

唯一正式包 SHA256 `44a5f683a1b33c15d0b443681f0a6c9a910f55572c32f94f4820a3ef8e481ed9`；原打包器候选 / 36 项包与恢复检查 / 晋升 / 同源核对通过。扩展详情已核对真实 ID 与 `dist/development` 加载路径。当前仍是旧静态开发产物，serve 未证明连接；没有构建或覆盖 Browser 输出。

**超时处理：** 先读回原失败运行，确认停在搜索按钮点击；现场命中检测发现百度上的阅读目录遮挡按钮。通过原拖动入口移开后做一次必要安装验证成功。首条自动请求仍在同一步超时；将该站点目录移到左侧并核对新页面恢复位置后，以新需求、新候选完成两轮。未修改百度源码、重放旧请求或绕过点击保护。

**防误触发：** 普通闲聊、明确不执行、要求五条结果均未产生任务候选；五条没有被改成三条。回传数据及这些回复未新增原请求，账本保留一次失败和两次成功共三条；raw dispatch 次数仍 **NOT_TESTED**。实际搜索结果可能涉及同名或其他产品，AI 已明确区分。

直接在[已接入的结果聊天](https://chatgpt.com/c/6aef78a7-6c40-83ec-a189-831eec649921)继续用普通中文提出三条结果的搜索需求即可，无需每轮填写 JSON 或重新批准关键词。TaskSpace 22 已释放，仅保留结果聊天和逐字恢复的未发送草稿。源目标保持上次实读的 **paused**，本轮不改变它；production、完整 CI、评分与文件 UNKNOWN 恢复继续延期。详见[本轮执行记录](docs/execution-plan.zh-CN.md#ego-真实安装与核心链2026-11-08)及[安装与运行证据](evidence/ego-core-20261108.json)。

## 两份测试提示词（2026-11-09）

- [完整能力接入提示词](prompts/01-capability-setup.prompt.txt)：新聊天先发送一次，收到确认后正常描述百度或 Google 搜索需求；说明本身不执行任务。
- [简短 Google 直接测试提示词](prompts/02-google-direct.prompt.txt)：可直接作为新聊天的第一条消息，不必先发送完整说明；固定搜索“Chrome extension Side Panel API”的前三条自然网页结果。

执行请求的 AI 回复均要求两部分：先用一小段中文说明准备执行并等待本机结果，再给唯一的 `opendesk-task` 五字段代码块。收到真实回执后再整理实际结果，不重复输出协议。提示词不代替安装、范围审阅、自动运行及网站权限；生成候选也不等于已经执行。扩展“使用说明”和“生成 ChatGPT 指令”同步采用该回复要求；可信界面随 Browser 更新，工具 JSON 不承担这项固定代码更新。

## 百度怎么测、成功看哪里（2026-11-07）

1. Chrome → OpenDesk → 扩展 → Web Flow → **运行与授权**：在“任务授权”复用有效批准，确认自动运行开关已开；缺少范围时走原审阅，不重复批准有效范围。
2. 在“使用说明”复制一次能力说明到普通新聊天；原已接入聊天直接发普通需求，**无需每轮 JSON**。验证后台运行时，在新需求发送前关闭侧栏，结果交付后再重开；也可保持侧栏观察。
3. 先发送第一条；要验证换关键词，完成后再发送第二条：

> 请用百度搜索 OpenDesk Browser，返回前三条自然网页结果。
>
> 请用百度搜索 OpenDesk Browser automation，返回前三条自然网页结果。

**成功看哪里：** “当前任务”核对“已完成”、同一 Run / Result 的持久结果及“已释放”；原聊天核对三条真实网页结果与 AI 续答。沙箱“记录”只含手动请求，空记录不能判自动任务失败；raw dispatch 次数仍 **NOT_TESTED**。

- **已完成：** [最新可视复测 01a1b64a](evidence/visible-retest-20261107-01a1b64a.json)百度 **2/2**、固定文件 **1/2**；文件第一轮保存及独立读回相符，最终回执仅草稿、未发送。
- **仍阻塞：** 文件第二轮原请求仍保留回填 `unknown`，尚未读取或写入。本轮只读核对时，原聊天标签页和可信审阅页已不在列表，不能换文档补跑；原测试文件仍为第一轮正文。
- **延期：** 自然语言文件发现、MCP、production、完整 CI 与当前整体评分；本批开发指纹曾变化，不算同一冻结候选验收。

**历史回填修复状态（本轮新候选及 2/2 以上方为准）：** 原输入框缺失时，可信回填函数明确返回 `NOT_DISPATCHED`；控制器现在保存这项失败依据，并允许用同一请求、同一提示词再次手动填入。超时、失联、插入后核对失败及旧 unknown 仍不重放；没有清除旧账本或换身份。当前开发产物未包含该改动，原生第二轮仍未完成，见[本轮恢复证据](evidence/prompt-recovery-20261107-01a1b688.json)。

**历史批次（2026-11-07，01a1b5f2）：** 百度 **2/2**、固定文件原监听读写 **2/2**，最终文件回执仅草稿未发送；保留[百度证据](evidence/baidu-prompt-loop-20261107-01a1b5f2.json)和[文件证据](evidence/file-prompt-loop-20261107-01a1b5f2.json)，不替代最新复测结论。下方旧 0/2 执行卡同样只属历史。

**页签风格统一（2026-11-04）：** “运行与授权”三个页签已改用主页面的蓝色选中文字与下划线，去掉胶囊外框和按钮底色，保留等宽 40px、键盘切换和草稿。25 项相关检查通过，本轮独立 AI 组件复核 99/100；日常开发产物 `5e9966bf46e8` 已发布，真实侧栏应用及 Native 业务仍分别核验。见[最新样式复核](docs/webflow-v0.3-ui-ux-review.zh-CN.md#151-页签沿用主页面导航风格2026-11-04)。

**运行面板间距与页签（2026-11-03）：** 实际可信组件已调整为等宽 40px 页签、独立的自动运行状态组、同行的任务状态与刷新操作；长网址和提示正文分组阅读，短地址保持标签 / 值对应，授权时间与撤销就近排列。方向键 / Home / End / Escape、焦点归还、跨页签和开合后的授权草稿保留均已在真实 Chromium 组件夹具验证，相关既有检查 **23/23 PASS**。独立 AI UI 评审 **99/100**，限定本轮冻结布局；随后参数授权逻辑的变更及真实侧栏新混合候选不继承该分数。来源、完整图证、扣分与未测边界见[评审第 15 节](docs/webflow-v0.3-ui-ux-review.zh-CN.md#15-运行面板间距与等宽导航2026-11-03)和[本轮证据](evidence/ui-runtime-spacing-20261103.json)。

**运行与授权布局（2026-11-03）：** 打开[原路径单文件 HTML](preview/webflow-v0.3-preview.html)，点“对照运行与授权”。右侧新方案将**参数 JSON 固定为标题在上、完整正文在下**，不再把整个字段塞进第二栏，也不按字符数改变排版；地址等短信息用标签 / 值横向行。批准时间与撤销同行，原蓝色控件、底部 Sheet 及其他业务区保留。左侧明确是固定 654 参考；两侧仍为历史 **0.3.6 应用（246fd012a）+ 9418a5d1a 可信组件**，不冒称当前 0.3.8 或实时安装。

唯一生成入口仍为 `node projects/webflow/preview/build-design.mjs`；候选只保留一条 ScopeSummary 布局 hook 和原七项表现修复，不复制组件、改生产权限或手改生成 HTML。manifest/context 固定来源和字节，本轮 SHA 为 **`4e083d101d2be4e10228e89d0f7296f98e3f51b4ba08f81373635232a8942114`**。冻结来源及三项表现回归通过，完整字段 / 指令 / 长审核 / 焦点图与操作依据见[原评审第 14.6 节](docs/webflow-v0.3-ui-ux-review.zh-CN.md#146-参数-json-作为完整阅读块2026-11-03)。

本轮独立 AI UI 评审按[明确量表](preview/runtime-review-rubric.md)评分 **99/100**，来源 / 安全静态复核限定 PASS；未发现本轮新增产品缺陷。扣 1 分为首个 Tab 落点的可见焦点图证不足，不等于产品焦点不可见。旧双业务列方案已被用户否定，推荐撤回，旧分数不继承。本预览仅模拟边界，不运行真实任务或写系统剪贴板；Chrome 安装 / Native / production / 原生 IME / 读屏仍为 **NOT_TESTED**。正常聊天当前证据以下文为准，布局评分不代替用户验收。

**2026-11-03 UI 排版增量（v0.3.7）：** 首页仅保留紧凑的自动运行开关、状态摘要和“运行与授权”入口。独立面板分为当前任务 / 任务授权 / 使用说明；原始结果、运行身份和诊断默认折叠。沙箱三项主导航与帮助/设置合为一行，移除重复产品标题和大号统计卡。开合保持应用与授权草稿，导航不执行任务。源码、组件截图和独立评审见[现有 UI 评审第 12 节](docs/webflow-v0.3-ui-ux-review.zh-CN.md#12-v037-运行面板与应用布局修复2026-11-03)。此增量尚未在真实扩展安装/更新；下文 v0.3.6 实测与自动双轮证据仍只属于各自候选。可信组件随 Browser 编译，工具 JSON 单独更新不能替换它。

## 当前状态

下列 2026-11-06 两条保留上次观察；2026-11-07 双轮实测结果以上方本轮进度及证据为准。

**后台自动 Task（2026-11-06）：** 已确认安装百度任务 v1.1.4，其自动执行入口仍被运行时检查拒绝；已沿原目录导入同源 v1.1.5，状态为待验证，尚未运行或安装。工具随后拒绝观察扩展页面，关侧栏的真实使用验证仍未完成。具体恢复步骤与观察边界只在[当前执行卡](docs/execution-plan.zh-CN.md#后台-task-当前执行卡2026-11-06接续时先读)维护。下文旧版本成功记录不计入本轮 0/2。

**ChatGPT 本地文件（2026-11-06）：** 固定第一方可信实现位于 `projects/webflow/trusted/`，沿原 Native 文件与具体对话项目授权链工作，不是已安装 Task。本轮补齐固定文件协议与 Task 的双向拒绝、完整回答身份复核及分阶段指引；390 项相关行为检查、4 项来源保护及三份精确源码独立审查通过。普通需求复用原 Web Flow 监听，高级 JSON 测试由保持打开的可信页轮询；完整链路及手动步骤见[本地文件文档顶部](docs/chatgpt-local-files.zh-CN.md#最新链路与本轮补漏2026-11-0601a1afe0)。当前新候选真实 Chrome / Native 全链及评分未继承历史 PASS；当前产品仍 **NOT_SCORED**。

### 历史实现与验证记录

以下事实仅证明各自日期、候选和测试范围，不代替上方当前状态。

**事件驱动监听（2026-11-04）：** 正常新需求沿可信发送见证与完整回复事件自动检查，不依赖刷新网页。已将原 850ms 轮询驱动改为 DOM、输入、可见性及导航事件唤醒同一准入路径；异步操作结束也立即检查，5 秒巡检仅作无事件变化的兜底。“重新检查”核对连接，“刷新当前对话”仅用于安全恢复连接，均不补跑历史或 UNKNOWN 请求。156 项相关监听、首发、准入及来源保护检查通过，原开发服务已生成同源产物 `09f519953ed1`；本轮 Chrome 已加载及真实消息行为仍为 NOT_TESTED，详见[执行计划 12.26](docs/execution-plan.zh-CN.md#1226-事件驱动监听与异步完成唤醒2026-11-04)。

**任务协议可读显示（2026-11-04）：** “生成 ChatGPT 指令”和“一次接入能力说明”的生成逻辑及 AI 约束均已修改，直接显示、复制普通网址、中文与标点；必需的 JSON 编解码由程序处理，用户无需手工转码。原读取器与五字段解析器继续使用标准 JSON；合法转义和字面反斜杠保持原值，非法转义、重复字段及二次编码的网址拒绝准入。相关显示、复制、读取及原授权准入回归通过；真实 Chromium 组件通过（安装与剪贴板边界为模拟）。修改已进入 `dist/development` 并核对相关界面 / 页面 / 后台产物同源，已加载扩展及官网本轮完整链仍为 NOT_TESTED。现用双轮提示词同步更新，历史证据保留原文；本聊天未发送或重放任务。此可信 UI 随 Browser 更新，工具 JSON 无需更换。详见[本轮记录](docs/execution-plan.zh-CN.md#1223-任务协议可读显示与内部编解码2026-11-04)。

**2026-11-04 当前执行断点（恢复授权后）：** 用户已允许恢复原开发服务。唯一 writer **49560** 在固定 `dist/development` 完成首次编译；真实侧栏确认原扩展 ID、开发服务已连接及指纹 `321cf9f4ea14…`，三处新路由源码映射逐字一致。同一项目聊天的新文档中，普通需求“OpenDesk Browser SDK”产生全新 Run `34e46e3b…`，三条真实网页结果、同 Run 持久值、退休 / released、原聊天单次回传和完整 AI 续答已核对。加入同窗口第二个真实 Host 后，普通“时间清单”也路由到同一正确 Host，但 Run `9c700548…` 在已安装 Task 1.1.3 的 **60 秒期限**到期，未交付结果；该失败已留证，不重放。

当前 Task 候选 **1.1.4** 仅将清单期限调整至现有合同支持的 **120 秒**，源码仍为 `14b8dd8d…`，权限、网站和参数不变。新 120 秒草稿 Run **`56321c09-4c89-46aa-b95d-145e7247ab1c`** / Result `6ffbd5d5…` 已真实 `success/count3`、Worker 退休和 released。Task 包检查 18、应用相关检查 36 均通过；WebFlow **0.3.10** 已由原打包器晋升并同源核对，唯一正式包 SHA `01433fba…`。Task 1.1.4 已导入本地目录，仍是**待验证**；两项新版本尚未安装，不把草稿成功记为安装后自动通过。

**下一条操作：** 在已打开的本地任务目录，以以上原 Run ID 核对运行证据 → 设为本地可用 → 安装确定版本 1.1.4；再经原安装器原位更新 WebFlow 0.3.10，并为新安装身份重新审阅关键词规则一次。然后用两条全新普通需求完成不同关键词自动执行与独立整体 ≥95。原 A/B/C/D 候选全部保留且不重放，旧组件 99 分不继承。当前浏览器工具的 URL 安全策略拒绝 `chrome-extension://` 页面，并禁止换控制方式完成同一操作；本任务已停止受影响的浏览器控制，没有尝试绕过。开发服务继续运行，目标未完成（当前状态以本任务目标记录为准），**整体 NOT_SCORED**；production、全矩阵和 MCP 延期。详情继续沿用[执行计划 12.11.20](docs/execution-plan.zh-CN.md#121120-任务范围授权与换关键词免重复批准2026-11-04)和[原生证据](evidence/authorization-runtime-20261104.json)。

**自动运行授权调整（2026-11-04，源码、定向组件及开发产物磁盘发布通过，真实新授权待核验）：** 已定位“自动运行开启但换关键词仍待批准”的原因：旧批准将 `args.query` 与安装身份一并逐字固定。百度搜索现在可在可信审核时一次选择“允许更换搜索关键词”：关键词按该安装版本 Schema 的 1–120 字约束变化，结果数量仍固定为批准的 3，目标地址和安装身份继续固定。高级入口仍可只允许一组精确输入；历史精确授权不静默扩权，可在“任务授权”点击“改为允许更换关键词…”重新审阅一次，或在当前待批准卡片选择“允许更换关键词并执行”。之后合法换词不再重复批准。85 项授权/执行围栏/界面定向测试和 1 项固定源码准入测试通过；开发产物 `97b1997586d5` 已在 `dist/development` 发布，相关输出 SHA 与 10 项源码映射逐字核对一致，实际侧栏加载和客户端连接仍未验证。不代表已修改本机授权或实际执行了用户当前候选。可信源码随 Browser 持续开发更新，单独更新工具 JSON 不会应用此改动。细节及剩余验证见[执行计划 12.11.20](docs/execution-plan.zh-CN.md#121120-任务范围授权与换关键词免重复批准2026-11-04)。下文 11 月 3 日“新精确范围”记录保留为当时固定输入模式的证据。

**普通新范围（2026-11-03，dev 核心已验证）：** 一次可见能力说明现在区分真实已安装 Task Schema 与已批准精确范围。在普通聊天请求搜索“OpenDesk Browser SDK / 前三条”，AI 自行产生五字段新候选，先显示待批准且零执行；在可信“当前任务”审阅并批准后，同候选沿原 Task 执行并单次回传。后续普通消息自动产生新候选、新 Run，无需再次接入或审批。两轮独立百度 DOM、同 Run 完整持久数据、released、单次交付及 AI 完整续答均在开发候选 `d623f73025c1` 核对。新批准按现行合同**替换**该 Task 原精确范围；旧关键词不继承，取消待批准、原生 Stop 和五条不支持请求均未执行。Task 仍为 1.1.2，应用仍为已安装 0.3.8，均未升级。见[本轮证据](evidence/normal-new-scope-20261103.json)及[执行计划 12.11.17](docs/execution-plan.zh-CN.md#121117-普通新范围待批准与同候选执行2026-11-03)。历史固定范围证据继续有效，不能合并为不同构建的同候选验收。

**正常聊天入口（2026-11-03，dev 核心已验证）：** 当前 ChatGPT 项目已完成一次能力说明接入。保持 Web Flow 侧栏打开，正常发送需求即可；AI 每次生成新候选，无需每轮生成/复制 JSON 或重新批准。真实连续两轮百度任务、同 Run 持久结果、资源释放及原聊天单次回传已通过；无关聊天、五条越范围请求与停止回复均明确未执行。普通项目外聊天也已验证“一次可见说明 → 普通需求 → 原 Task/结果”，接入仅限该聊天，不代表全局或 MCP 已连接。应用说明包 **0.3.8 已原位安装**，原 Task/精确批准未变化。[本轮证据](evidence/normal-chat-20261103.json)及[执行计划 12.11.16](docs/execution-plan.zh-CN.md#121116-用户纠偏正常-chatgpt-消息主入口与可见执行状态2026-11-03)记录候选与未测边界。下面的双轮/生成器记录是历史辅助输入证据，不能替代本轮正常消息。

当前核心是 **ChatGPT 新完整回复 → 严格五字段协议 → 已批准的固定脚本 → 持久结果与原聊天反馈**。2026-11-03，当前持续开发环境已完成百度任务 1.1.2 的真实验证与原位升级，并在同一精确批准及开关不变下完成两个空白 ChatGPT 对话的首发自动执行。每轮真实百度 DOM、同 Run 持久结果、资源释放、侧栏及原聊天完整数据的单次交付均已核对，见[本轮实测证据](evidence/authorized-two-rounds-20261103.json)及执行计划第 12.11.13 节。

v0.3.6 同步沙箱中的百度固定任务为已验证的 1.1.2，解决升级后仍显示旧版本不可用的问题；唯一正式包已经原位更新到本机。当前 Browser 的可信“当前任务”展示自动进度、同次持久结果、资源释放和原聊天交付；“任务范围与授权”可从有效批准生成每次新 candidateId 的 ChatGPT 指令，生成本身不运行任务、不改变批准或开关。指令采用单段文本及 JSON Unicode 网址转义，保护精确发送见证。可信组件随 Browser 固定编译，工具 JSON 不替换它；本轮未修改该组件或运行时身份校验。

历史首发反例及修复见[执行计划第 12.11.9 节](docs/execution-plan.zh-CN.md#12119-首条发送临时路由与结果隔离修复真实首发发现已证明执行被运行时身份阻止2026-11-03)及[当时实测记录](evidence/new-conversation-20261103.json)。旧任务的运行时拒绝已沿原 Candidate → Verification → Available → Installed 链解除；1.1.2 与 1.1.1 源码逐字相同，未改 SHA/ABI 校验。原 installationId 保留，generation 升至 2，再经可信原生审核恢复同一百度首页及固定参数批准；本轮两次首发均先绑定正式 `/c/` 再自动准入。

前一候选的单次成功保留在[历史实测结论](evidence/core-auto-20261103.json)。[提示词 A](tests/manual-auto-baidu-a.prompt.txt) 已在用户现场观察到发送，禁止重放；[提示词 B](tests/manual-auto-baidu-b.prompt.txt) 的历史准备状态未重新核实。以后使用新 candidateId；运行时阻塞解除前不要把发送新候选当作补跑。正式 MCP 链仍未验证。

2026-11-02，V0.3.3 正式 Sidebar Tool v2 应用源码已进入 `src/ui/`，配置为 `tool.config.json`（应用 ID `webflow`）。正式信息架构为概览 / 脚本 / 记录，帮助和设置位于标题栏。已实现固定任务核对、派发前保存原步骤、手动委托执行、关闭重开后按原请求查询/停止、结果与资源释放分开显示，以及仅属于本应用的持久摘要；v0.3.3 使用原打包器的候选、定向验证和晋升链；React DOM 交互与隔离 SDK 夹具不等于真实安装或 Task 执行，当前证据见原执行计划 AWB-07。该段为 v0.3.3 初始阶段记录；后续真实安装与自动核心链以执行计划第 12.11.4–12.11.6 节为准，其余手动恢复专项不因此宣称通过。原交接校验与单 owner 离线队列模块保留，详见[离线模块说明](docs/offline-modules.zh-CN.md)，**它们仍未接实际派发或原 ChatGPT 交付**。

现有发送队列、计算接力样例和 Bridge 各有源码及不同范围的证据，详见执行计划的事实表。目录存在不代表这些组件已经接成完整产品。

## 从这里继续

| 要了解什么 | 唯一入口 |
| --- | --- |
| 产品目标、BR-01–12、架构与验收边界 | [产品合同](docs/product-contract.zh-CN.md) |
| 本轮目标、三个交付阶段、通过条件及历史证据 | [执行计划](docs/execution-plan.zh-CN.md#用户目标与任务拆分) |
| ChatGPT 本地文件、权限、手动操作及历史证据 | [本地文件文档](docs/chatgpt-local-files.zh-CN.md) |
| 本项目的代码与文档维护边界 | [AGENTS.md](AGENTS.md)，同时继承[仓库规则](../../AGENTS.md) |
| 脚本怎样开发、安装、交给 Codex 与关联 Web Flow | [脚本开发、安装、关联与维护指南](docs/script-development-installation-guide.zh-CN.md)（明确现有能力与拟议功能） |
| 可点击脚本添加与 Codex 交互预览 | [script-onboarding.html](preview/script-onboarding.html)（独立 HTML 演示，尚未整合正式 UI） |
| 公开 SDK、程序类型和安装流程 | [扩展创建工作流](../../.agents/workflows/extension-creation.md)、[项目目录合同](../../docs/architecture/extension-project-layout.zh-CN.md) |

旧的 `docs/product/ai-workflow-bridge.zh-CN.md` 和 `docs/framework/workstreams/web-flow-20261101.md` 仅保留迁移入口，不再维护第二份正文或进度。后续更新本项目内文档，不按聊天新建总 GOAL。

## ChatGPT 旧任务浮层退役（2026-11-04）

- **用户入口保留在 Web Flow 与 Browser 可信任务面板**。ChatGPT 官网不再注入「OpenDesk · 浏览器任务」旧浮层；原先已批准任务、去重与结果回传不因隐藏而失效。旧 UI 仅能由固定第一方测试/调试入口显式启用，网页与模型不提供开关。
- 旧 Bridge 的站点实现归 `projects/webflow/trusted/chatgpt-bridge-page.js`，旧 DOM 单独归 `projects/webflow/trusted/legacy-chatgpt-panel.js`；`src/native-agent/chatgpt-fixed-bridge-page.js` 仅提供原有命名导出的兼容入口。这两个文件是 **Browser 固定编译的第一方可信 Content 代码**，不是可经 Sidebar Tool JSON 执行的沙箱脚本。旧手动/聊天授权功能仍为兼容路径，不应成为新 UI 的第二入口。
- `scripts/bundle-provenance.mjs` 对两份业务模块各自固定 Git blob SHA，且只允许打入 `agents/chatgpt-fixed-bridge.js`；变更须审查并重置精确 pin，不能扩大到 SW、Sidebar 或通用 Page 程序。
- 暂保留旧 DOM 对象作为历史状态投影及控制器内部依赖，但不挂载到页面；未来如要删除这部分状态，须先将 Bridge 改成不依赖 DOM 的纯状态模型。**本次不宣称侧栏关闭后仍能继续执行**，该能力依赖 Background/RunHost 的独立验收。

## 应用与框架的分工

**WebFlow 是 OpenDesk Browser Framework 的业务消费者，同时在产品层承担通用工作流编排职责。** WebFlow 内核只维护任务引用、依赖、身份、交接与恢复；GitHub、ChatGPT、百度/Google 等领域业务归已审阅的固定任务、业务配方和站点适配器。OpenDesk Browser 提供通用浏览器能力、安装授权、Controller/RunHost、生命周期与存储；既有第一方站点适配器是明确隔离、受来源 pin 保护的业务边界，不应演化成通用 Framework 的业务分支。

| 所属 | 负责内容 | 边界 |
| --- | --- | --- |
| 本项目 WebFlow 编排层 | 固定工作流引用/Task ID、依赖与输入输出契约、持久步骤/副作用键、结果交接、恢复与 UI | 不内置具体 GitHub 仓库、ChatGPT/百度等站点执行逻辑；不直接调用 DOM 或替代原 Task Runner |
| Browser Framework / SDK | 站点与安装权限、Task Catalog、Authority、RunHost、Controller、Page Session、Durable Result、通用存储/调度 | 不加入仅服务于 Web Flow 的站点选择或业务判断；公共缺口按原流程证明后最小补齐 |
| 已安装固定 Task／业务配方／站点 Adapter | 明确的 Task 版本与 Schema、单站网页动作、GitHub 读取/ChatGPT 对话等专用处理、业务结果验证 | 经原安装与权限合同，结果通过受信宿主返回；不自行拥有 Runner、Authority、通用状态机 |
| AI Send Queue | 既有 ChatGPT 单页面消息 FIFO 与发送状态机 | 保留原 owner 和安装身份，不复制一份到本项目 |
| 计算接力与既有 Bridge | 已有可行性样例、原聊天可信交付接线 | 先复用和核验；实际提取业务源码时同步消费者、构建来源与测试，不能只搬文件 |

现有复用入口：

- [AI Send Queue](../../projects/ai-send-queue/README.zh-CN.md)：唯一 owner 为 `projects/ai-send-queue/`。
- [ChatGPT 计算接力](../../examples/tasks/chatgpt-relay-calculator-r1.README.zh-CN.md)：已有 Controller + AppStorage 的固定 A→新对话 B 源码样例，真实 Chrome 仍按该 README 的证据等级。
- [公开 Sidebar API](../../docs/api/sidebar-tools.zh-CN.md)、[Page API](../../docs/api/page-userscript.zh-CN.md)、[Controller](../../docs/api/controller.zh-CN.md)：接入以真实公开能力与目标执行世界为准。

## 扩展类型与执行世界

本项目的产品形态为**组合式应用（Combined Application）**。一个产品入口可以组合多种执行职责，每种职责仍遵守自己的合同。

| 架构项 | 当前决定 |
| --- | --- |
| 产品/源码归属 | `projects/webflow/`；属于业务应用，不新增一个 Browser Framework |
| 应用界面 | 实现时按 Sidebar Tool 沙箱合同接入；不因目录归属取得可信 Host 权限 |
| 网页执行 | 使用原 Controller Task / 必要的 Page 程序；各自站点与安装身份独立 |
| 后台与恢复 | 使用已批准的持久化及调度能力；先完成能力探测，不预设任意后台 JS 可安装 |
| 当前主流程 | v0.3.4 沙箱保留手动委托/原步骤恢复；可信宿主显示自动运行滑块及精确范围审核，接原 ChatGPT Bridge；本沙箱不取得自动授权或全局目录 |
| 框架改动 | 当前未证明需要；不足先记 `SDK_GAP_NOT_PROVEN`，保留可复现缺口后交原 owner |
| 安装包 | `tool.config.json` 为真实工具输入；正式包 `webflow.opendesk-tool.json` 已经由原 `build-sidebar-tool.mjs` 生成、验证、晋升并提交（Git `8a1cf108`）；仍须在「扩展」手动审阅安装 |
| 验收 | 文档结构、源码/组件、真实 Chrome、业务通过与正式发行分别记录 |

## 后续核心代码放在哪里

以下为**归属约定**，对应模块开始实现时再创建目录和文件；目前没有占位代码或空目录。

| 项目内路径 | 后续职责 |
| --- | --- |
| `src/workflow/` | 业务步骤、依赖、参数与推进规则；不实现第二套 RunHost 或执行权限 |
| `src/tasks/` | 确无现成任务可复用时的 Web Flow 专属 Controller 源码；仍走独立的原 Task 安装合同 |
| `src/handoff/` | 最小上下文交接、结果引用、目标仓库证据检查及接收状态 |
| `src/adapters/` | 通过已批准公开能力对接站点任务与产物；不直接导入宿主私有特权模块 |
| `src/ui/`（已实现） | 独立沙箱中的 React UI、固定委托投影及 UI 数据摘要；不直接读宿主 IDB |
| `tests/` | 本应用的业务与边界测试、必要 fixture；框架公共合同测试留原 owner |
| `docs/` | 本项目唯一产品合同、执行计划及确有需要的技术说明 |

`tool.config.json`、构建文件和正式包随实际运行入口及安装需求加入。当前无需预装依赖或先构造一个空的可安装应用。

## 下一步

从[执行计划顶部使用与状态卡](docs/execution-plan.zh-CN.md#百度怎么测成功看哪里2026-11-07)读取当前操作、最新复测及文件回填阻塞；2026-11-06 执行卡仅作历史。新增 Web Flow 业务实现归本项目，既有模块的修复仍由原 owner 负责。

本轮正式 UI 已在项目内实装；工作流/Bridge 的真实恢复等级仍以原记录为准，不要把离线单元成绩转记到正式应用。

## V0.3.6 正式 UI / 安装与验证

以下为 V0.3.6 阶段记录；旧“每次生成新指令”仅属当时辅助入口，当前百度普通聊天流程以顶部为准，不要求每轮 JSON。

- 入口：在 OpenDesk Browser「扩展」使用原安装器审阅 `projects/webflow/webflow.opendesk-tool.json`，安装后打开 Web Flow；本项目不安装第二个 Chrome 扩展，不插入新的宿主 React Root。版本与 SHA 以本次同源包及执行计划 AWB-07 回执为准；升级沿用同一 ID、原安装审阅和原数据，HTML 预览不是安装入口。
- 固定委托：仅 `baidu.search.top3@1.1.2` 与 `google.search.top3@1.0.0`（确切 manifest/content Hash 随工具包冻结）。这不是“所有已安装脚本”的列表；安装变动或权限缺失只给出不可用状态，不尝试回退到同名任务。本机百度已可用；Google 安装/授权不可用，未纳入本轮通过结论。
- 手动运行：在「脚本 → 运行」填写参数，点击「保存运行步骤」后，先通过原 AppStorage 的 CAS 写入并读回稳定 `clientRequestId`、六字段 Task 安装身份和输入；再点击「确认手动运行」，该点击内同步调用 `tasks.start({clientRequestId,task,params})`。这两个动作分别保存步骤和执行网页操作，不增加依赖或权限批准。保存失败不派发，连续点击不会重复派发。本实例尚未提交时，“查询”保留确认入口，“取消未运行步骤”只取消本地步骤且不调用 Task；取消保存失败可重试取消同一步骤，永不恢复运行确认；已重开的未知步骤继续仅查询/停止。
- 恢复与停止：关闭重开后在「记录 → 原步骤 → 查询原请求」使用保存的原 ID 调用 `tasks.read({clientRequestId})`；「停止原请求」调用 `tasks.stop({clientRequestId})`，start ACK 未到时仍可停止。旧摘要也可从原记录查询，但摘要不是权威结果，结果正文仅来自本次通过授权的 SDK 回包。查询超时、无记录、UNKNOWN 和未释放均不生成新 ID 补跑。
- 阶段与边界：同一 Run/Result 的持久结果和 `retirementState === 'released'` 分开显示；未释放时不放开新的步骤，不自动续跑 B。仅保存、未确认运行就关闭的步骤也按未确认状态保留，只允许查询/停止，不把重开当成运行许可。需要包含 J06 恢复实现的 Browser 候选；更新工具 JSON 不会把旧 Browser 的固定 Host/Authority 一并更新。本轮已核实持续开发路径、serve、任务及应用安装；手动恢复的真实 Chrome 专项仍为 NOT_TESTED。
- 自动运行：在 Web Flow 宿主页头下操作可信滑块；展开“任务范围与授权”，先复用已有有效批准，例如 `baidu.search.top3@1.1.2`、`https://www.baidu.com/`、`{"query":"OpenDesk Browser","limit":3}`。点击“生成 ChatGPT 指令”→“复制指令”，确认上方自动运行已开启后，在原 ChatGPT 对话粘贴并发送。每次新任务先生成新指令，不重复用旧候选。只有随后唯一完整助手回复的 `opendesk-task` 代码块内 `webflow.task.intent.v1`（严格 protocol/candidateId/taskId/targetUrl/args）可触发；用户消息、历史、引用和流式内容不触发。批准和开关即时保存，关闭只阻止未来准入；已开始的任务在上方可信“当前任务”停止；手动/一次批准也可从该区操作。进度、同次持久结果、资源释放和原聊天交付分别显示在“当前任务”，结果仍回原聊天，本应用“记录”只显示手动请求。旧 `opendesk.task.intent.v1` 的手动/五分钟路径保留。固定可信组件随 Browser 更新，单独安装此 JSON 不会更新旧 Browser 的监听器/授权控制器。
- 非当前阶段：全局脚本枚举、跨 App/Bridge 的完整历史、多步骤流程与跨对话。原回传保留；本次自动核心链及单次聊天交付已有同一开发候选证据，手动/一次批准/停止的新增侧栏入口原生实测仍为 NOT_TESTED。旧网页浮层暂保留，本次操作未使用它。
- 测试：`node --check projects/webflow/src/ui/{model,main}.js`（shell 不支持括号扩展时分开运行）；`node --test projects/webflow/tests/webflow-ui.test.mjs projects/webflow/tests/webflow-recovery-ui.test.mjs`；`node scripts/build-sidebar-tool.mjs projects/webflow --out artifacts/sidebar-tools/webflow/candidate.opendesk-tool.json`；成功后按打包 Skill 晋升及 `--check-project` 核对。隔离 UI 点击夹具：`node projects/webflow/tests/webflow-ui-server.mjs`，打印独占本地端口、输入 SHA；只加载本项目真实源码与 React，模拟 SDK 不使用真实 Task/用户记录。GitHub `.github/workflows/webflow-package.yml` 在项目 UI 源码变更后执行原打包器和测试，仅在显式 `workflow_dispatch` 时才把通过门禁的 JSON 写回 main；普通推送不自动发布包。既有 CI `41336225689` 已经完成包级写入与读回。
- 真实 Chrome 验收：安装包、安装审阅、固定 Task 已安装、目标网页授权、实际提交/结果/用户手势/关闭恢复、Bridge 交付，须在用户本机 Development Side Panel 使用本仓库真实版本逐项测，不能由 HTML 或 Node 自动通过代替。

具体状态与本轮代码提交以[执行计划](docs/execution-plan.zh-CN.md)的最新增量为准。
