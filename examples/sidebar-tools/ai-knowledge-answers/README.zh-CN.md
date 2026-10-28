# AI 客服（AI 知识问答）· 正式源码、同源交互预览与实测说明

独立 Sidebar Tool v2，ID `ai-knowledge-answers`，当前版本 `0.1.7`。复用原 Tool Host、存储、Shared AI Provider 和唯一 React root。真实 Mac Chrome 已完成本地固定知识自动发送、知识保存失效、UNKNOWN 只读恢复与审核回复去重；其他第三方网站不在本轮范围。下方历史章节保留当时的版本和验证状态，以「本地 MVP 差量验证」的最新证据为准。

## 本地 MVP 差量验证（2026-10-28）

**当前本地核心流程可用，未发现需要修改业务源码的缺陷。** 本轮沿用现有客服模拟页、正式工具 `0.1.7` 和可信侧栏，新增 6 项 UNKNOWN 拒绝/竞态回归；只提交本 README 与定向测试，不改变布局、Runtime、Host、权限或正式安装包。真实 Provider 调用、production 验收和 CI 重跑没有执行。

| 用户操作 | 本轮真实 Chrome 结果 | 原始证据（下述目录内） |
| --- | --- | --- |
| 一次批准固定答案自动发送，随后分别询问退款期限和发货时间 | 两条均自动发送；分别是 7 天申请期限、48 小时发货；每个客户 ID 仅一个精确 `replyTo` 回执，未逐条点击发送 | `01-fixed-refund-*`、`02-fixed-delivery-*` |
| 未批准固定自动发送 | 新退款问题留待确认，网页没有回复 | `03-etag-before-*` |
| 在原知识管理界面保存修改 | 保存并读回成功后监听停止，旧待发按钮消失；重新批准后仅新问题使用新知识，旧问题仍无回复 | `04-etag-saved-invalidated-*`、`05-etag-new-message-*` |
| 真实发送后暂时遮蔽回执，执行只读核对 | 无匹配时保持 UNKNOWN；恢复原节点后转 CONFIRMED，同一回执 ID 保持不变，页面总回执仍为一条，未重发 | `07-unknown-masked-*` 至 `09-unknown-restored-*` |
| UNKNOWN 后停止、切到会话 B、替换文档 | 旧消息不再提供核对/发送入口；会话 B 不继承许可；重载后停止并报告 `E_DOCUMENT_STALE`，新文档消息没有自动回复 | `10-unknown-before-stop-*` 至 `15-document-replaced-*` |
| 暂停后发客户消息，再恢复 | 暂停时零回复，恢复后该发货问题只产生一条回复 | `17-paused-*`、`18-review-gates-*` |
| 询问“退款需要几天”或没有知识的问题 | 分别要求澄清、显示无匹配；不发送 | `18-review-gates-*`、`20-final-dom.json` |
| 问候、多问题消息：审核前等待，审核后双击发送 | 审核前两条均无回复且按钮禁用；审核后各一条 DOM 回执。多问题合并回复保留“上门安装待核实”，不编造答案 | `18-review-gates-*`、`19-reviewed-double-click-*`、`20-final-*` |

审核操作的证据边界：用户先要求亲自审核，随后明确回复“你直接完成”并要求继续；本轮由代理核对这两条虚构演示知识并操作原审核框/发送按钮，**不是用户亲手完成的可用性测试**。未修改或绕过产品审核门禁，也未据此新增 Provider 数据授权。

知识保存使用临时诊断值 `ETag  8`，用来区分新旧答案；它不是商家政策。原生输入驱动未输入预期中文，因此不将其记作产品中文输入缺陷。随后已通过原界面恢复准确的“签收后 7 天内申请退款”，保存读回成功，后续真实回复亦证明恢复生效。旧记录文字可能保留，但发送入口失效；未读取内部原始 ETag 值，不能声称所有旧记录均变成 `STALE`。第一次保存场景被共享 watcher 的扩展重载中断，已排除并重新完成，未作为产品失败或 PASS。

UNKNOWN 使用显式启用、仅作用于当前测试文档的临时诊断：**原网页真实发送完成后**移除该真实回执节点的 `data-direction`，随后恢复同一属性。没有伪造回复、改写适配器、替换模型或再次发送；这是受控故障验证，不是自然网络故障证据。诊断源码已逐字节恢复，页面重载后诊断控件不存在；原文件 SHA-256 为 `78b8a977cda198f632cb5c86fc31fe552ed1aca5f57c4203d794b96fa6a8148a`，恢复后相同。浏览器监听现已停止，原 watcher 和 43111 服务保持运行。

### 环境与证据分层

本机原始证据目录：`artifacts/ai-knowledge-mvp-delta-20261028/`（按仓库规则忽略，不随提交携带）。`environment.json` 记录持续开发模式、扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`、实际加载路径 `dist/development`、原生调试页观察到的连接和 revision，以及共享 watcher 后续重载；不把磁盘 revision 单独当作浏览器加载证明。正式包仍为 `0.1.7`，SHA-256 `516675b817b0618a491695338b452521aab4c87c6a6b746062e01c8fce4122c6`。

| 层次 | 本轮结论 |
| --- | --- |
| 源码 | 原实现完成上述流程；仅补测试和记录，不新建基础设施 |
| Node | **66/66 PASS**：客服 Runtime 36 项、多问题 30 项。新增回执文字不符、原客户文字/范围改变、回执 ID 冲突，以及独立读回进行中停止/文档失效的 6 项保护；均不能错误确认或再次发送 |
| 模拟网页 | 使用原 43111 页面真实表单/DOM；临时诊断已清理，原布局和源文件保留 |
| 真实 Chrome | 上表限定操作通过；属于持续开发环境，异步读取竞态的精确时序仍以 Node 证据为准 |
| 正式包/production | 原包未变；本轮没有重打包、重新安装或 production 候选验收 |
| 真实 Provider | **NOT_TESTED / 无本轮有效数据发送许可**。只读确认“本机 Codex”和本机连接可见，不代表调用成功；固定/问候路径的零模型调用有源码与 Node 保护，独立调用审计未执行 |
| CI | **NOT_RUN**。历史 App CI 188/190 仍是历史结果，本轮本机通过不能替代云端 CI |

本轮命令：`node --test tests/environment/ai-knowledge-chat-r13.test.mjs tests/environment/ai-knowledge-multi-intent-r32.test.mjs`；输出 `node-runtime-multi.log`。当前核心开发验证已收尾。后续需要真实 AI 草稿时，先取得原 Provider 的明确数据范围许可，再验证一次受控调用；不自动扩大到第三方平台、完整验收或评分。

## 模拟对话界面（2026-10-28）

沿用 [客服模拟网页](http://127.0.0.1:43111/ai-knowledge-chat-demo.html)，以客服视角展示：客户 A/B 消息在左侧，使用浅灰气泡与「客」头像；我方回复在右侧，使用蓝色气泡与「我」头像，并标注「我 · 客服」。输入区明确区分「模拟客户发消息」与「我方客服回复」。源码仍为 `examples/tasks/ai-knowledge-chat-demo.{html,css,js}`，复用下方既有 43111 服务。

本次在独立浏览器中验证实际表单收发、键盘选中回复、会话切换及原 DOM 适配器的消息/回复身份读取；只证明模拟页交互，不代表本次重新执行了扩展自动回复或真实 Provider 验收。

## R3.7-AUTO-MVP · 固定知识自动回复实测（2026-10-28）

**核心链路 `CHROME_PASS`**：在原可信侧栏勾选「允许自动发送已核对的固定答案」并点击一次「批准并监听本地测试页」后，客户在 `http://127.0.0.1:43111/ai-knowledge-chat-demo.html` 的会话 A 发送「几天内可以退款」。原 Runtime 命中 `qa_demo_refund`，真实网页表单自动送出一条「演示规则：符合条件的实物订单可在签收后 7 天内申请退款。」，侧栏显示 `CONFIRMED`（DOM 已确认）。未点击单条发送或 AI 生成授权；固定回答路径不调用模型。

- 客户消息 `kb_msg_da4742d6-fc24-45f8-b311-ed277076e1aa`；客服回执 `kb_msg_64ede800-fe0b-4c4b-bd5e-f0455108fbb6`；同属 `thread_demo_01`，客服 `replyTo` 精确指向该客户消息。后续独立读取仍只有一条关联回复。
- 本轮只修复已复现的发行/准入阻塞：旧准入限定 `0.1.5`，已有工具为 `0.1.6`，且正式包与当前样式源码不同。使用原 `npm run app:update -- ai-knowledge-answers` 构建、校验、晋升为 `0.1.7`，同步可信版本门禁；经原官方市场审阅升级后进入原可信 React 工作台。未重写任何发送业务模块。
- 真实 Chrome：未知知识不发送、问候和多问题保留人工审核、暂停/停止不发送新消息、切会话停止旧许可均已观察。`UNKNOWN` 故障及 ETag 变更仍只有定向 Node 证据，未完成本轮 Chrome 故障验证，不记原生 PASS。
- 定向 Node：客服 Runtime / 多问题 **60/60 PASS**，官方准入 / 包一致性 / 原 UI **45/45 PASS**，原更新流程包测试 **8/8 PASS**。历史 GitHub App CI 仍为 **188/190**，不能冒称已重跑通过。
- 环境为日常 `npm run dev` → `dist/development` 的持续开发包，非 production 验收。测试后监听已停止，新窗口保留会话 A 的真实回复。本机完整操作及原始证据索引见 [R3.7 本机实测记录](../../../docs/framework/workstreams/ai-knowledge-answers-r37-auto-mvp-20261028.md)（按仓库忽略规则不提交日志）；核心 DOM 原件为 `artifacts/ai-knowledge-r37-auto-mvp/chrome-core-dom.json`。

独立只读评审根据真实 DOM、侧栏 AX/截图、原始 Node 日志及最小 diff 评分；这是本轮限定 MVP 的证据充分度，各维满分 100，非 production 产品评分：

| 核心闭环 | 知识准确性 | 单次发送/回执 | 授权/来源 | 暂停/停止/会话 | UNKNOWN/变更失效 | 零 AI 边界 | 证据/验证 | 维护/交付 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 96 | 95 | 96 | 94 | 93 | 82 | 94 | 92 | 93 |

算术平均 **835 ÷ 9 = 92.78/100**。主要扣分来自 UNKNOWN/ETag 的 Chrome 缺口、异步安全边界仍以 Node 为主、零模型请求没有独立调用审计，以及真实核心闭环只覆盖一条固定问题。没有以总分替代各项证据。


## R3.6-M0 · 真实客服闭环最小安全增量（2026-10-28）

**原始产品目标**：让 AI 知识问答逐步成为跨平台智能电商客服，最终支持人工辅助、受控自动回复、接管及获授权的业务服务。**当前只验证本地 MVP**：测试网页客户发消息 → 可信 React Side Panel 读取 → 固定知识或共享 AI 草稿 → 默认人工确认 → 网站表单发送一次 → **独立读取 DOM** 核对同一客户的唯一回执。真实 Chrome 完整闭环尚未获得 PASS，不能把源码、Node/fake Chrome 或知识 CRUD 的原生记录提升为客服收发通过。

- 复用现有 `examples/tasks/ai-knowledge-chat-demo.{html,js,css}`、`trusted/Workspace.jsx`、`host.js`、`local-test-runtime.js`、`multi-intent.js`、Shared AI 和唯一 React Root；不开发第二套 UI/Runtime/网页，不连接正式电商网站。
- [M0 回执安全修复 `5753ac3`](https://github.com/shopable-ai/opendesk-browser/commit/5753ac300b571a489b67615247afd3945a594d11)：在 `trusted/local-test-adapter.js` 拒绝带 query/hash 的本地测试 URL；网页发送后的第二次独立读取必须证明当前 thread 下仅有**一条**关联客服消息及唯一消息 ID，其他情况维持 `UNKNOWN`，不自动重试。补充 `tests/environment/ai-knowledge-chat-r13.test.mjs` 的越界 URL 和重复回执回归。既有发送栅栏/暂停/ETag/UNKNOWN 只读核对不重写。
- **最新证据分层**：`SOURCE_IMPLEMENTED`（本轮代码已在 main）；本轮新回归 `NODE_PASS` 需以实际 Node/对应 App CI 作证；`CHROME_PASS`、`REAL_PROVIDER_PASS` 对本轮完整客服链均为 `NOT_TESTED`。历史 Mac CFT 0.1.5 仅证明安装、知识保存/编辑/重开。不要把 App CI 的共享发现阶段失败误报为客服用例失败或通过。
- **最短本机闭环**：保留现有 `npm run dev` watcher，确认正式 Browser 编译的 `trusted/` 源码确为本轮版本；确认 43111 端口没有其他 owner 后启动 `python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks`，打开 **http://127.0.0.1:43111/ai-knowledge-chat-demo.html**。从正式可信 React 侧栏按原安装/来源准入批准监听，仅选择会话 A，发送新客户问题「几天内可以退款」，默认**人工确认**，核对网页中一个客服 DOM、原 `messageId`、`thread_demo_01`、`replyTo` 及侧栏 `CONFIRMED`；双击、暂停、切会话和结果未知不允许再发。第二条「你好」需人工确认且不调用 AI；多问题/无依据需形成一条人工待审草稿。无真实 Provider 授权则其调用结果为 `NOT_TESTED`。
- **定向 Node 命令**：`node --test tests/environment/ai-knowledge-chat-r13.test.mjs tests/environment/ai-knowledge-multi-intent-r32.test.mjs`。只在需验证 Host/Provider 修改时追加对应合同测试。M1 编辑、静默等待与倒计时均延后；M2 第三方平台、订单/物流、自动退款、24 小时托管不阻塞本轮。

## R1.0 · 四工具正式界面最小收敛（2026-10-26）

本轮仅优化 `ai-knowledge-answers/src/` 沙箱问答与知识管理：去除「测试知识回答」定位，首页改为「知识检索」，将问题与知识依据放在首屏，降低静态快捷键及重复说明的视觉优先级。来源条目只显示知识问题，不向用户默认展示内部存储 ID。**固定答案是知识条目直接返回；相似问题只是检索候选；这里没有冒充真正 AI 草稿。** 未改动可信客服监听、自动发送、Provider、RAG 或 Host，也不覆盖其他对话推进中的自动客服工作。

统一预览从仓库根目录运行：

```sh
node scripts/preview/build-preview.mjs --tool ai-knowledge-answers --surface side-panel --scenario success --theme light --width 360
```

输出 `artifacts/previews/ai-knowledge-answers/side-panel-success-light-360.html` 与 `.context.json`，可改 320/400/440、dark、empty/error/permission-denied/untrusted。生成器从正式配置打包加载 `src/index.html`、`src/style.css`、`src/model.js`、`src/main.js`；只模拟 `storage.get/set`、下载与剪贴板接口。预览内知识不会写入 Chrome，导出按钮不会写入文件系统，真实 AI Provider 与客服自动发送不可由该离线页面执行。早期 `preview/index.html` 的可信客服专项预览仍保留，不与本轮统一工具预览混淆。**新界面源码发布及 Native Chrome 验收尚需独立执行**，旧版本原生证据不自动证明新代码。

## R3.2 · 多问题、逐项来源与正式 UX（2026-10-26）

**业务目标与边界**：一条真实客户消息识别多个问题，逐题核对旧知识及适用范围，再生成一条待审核的客服草稿。此次仅扩展现有获批准的本地客服页 Runtime；不新增 Host、Shared AI Provider、SDK、站点 Adapter 或 HTTP 服务，不能宣称已支持任意第三方客服网站。正式沙箱工具版本仍为 0.1.5；可信 Browser 编译与工具包发行不能混淆。

### 唯一真实入口及启动

- 同源 HTML：`examples/sidebar-tools/ai-knowledge-answers/preview/index.html`。
- 在本仓库根目录启动（原端口空闲时）：`python3 -m http.server 43112 --bind 127.0.0.1 --directory examples/sidebar-tools/ai-knowledge-answers`。
- 浏览器打开：**http://127.0.0.1:43112/preview/**。页面内知识管理直接加载正式 `src/index.html`、`src/style.css`、`src/model.js`、`src/main.js`，Host 存储仅为预览模拟。
- 产品容器**外**的「多问题处理检查」默认折叠，动态加载真实业务模块 `trusted/multi-intent.js`，用户可以输入任意 300 字以内的消息检查独立来源及一条合成草稿。320/360/400/440 宽度、知识种子、故障注入都在外部折叠开发工具中；它们不出现在真实客服界面。
- **不能**在此 HTTP 预览中执行可信 `Workspace.jsx`、真实 Shared Provider、Chrome 权限或网页发送。可信组件需要原 Browser 构建/发行身份和授权；仍按下方 R3.1 说明打开 `http://127.0.0.1:43111/ai-knowledge-chat-demo.html` 执行真实本地 DOM 测试链。

正式代码位置：

| 层次 | 源码 | R3.2 变化 |
| --- | --- | --- |
| 客服逐题路由 | `trusted/multi-intent.js` | 新增：有界拆题、问候、歧义/订单风控、按原 model 逐题检索、来源隔离、合成草稿；每条消息最多四项诉求 |
| 客服消息 Runtime | `trusted/local-test-runtime.js` | 接入路由；仅候选问题在原模型授权下使用 AI，最多两项；复用原单消息一次发送、ETag、暂停/撤权/UNKNOWN 只读恢复 |
| 可信产品 UI | `trusted/Workspace.jsx`、`trusted/workspace.css` | 「AI 客服」业务信息、逐题状态及一个草稿；知识 IDs/回执/技术统计默认收起；不显示开发场景按钮 |
| 预览 | `preview/index.html` | 仅从正式 `src/` 加载知识管理及业务路由源码，开发控制置于产品容器外；删除旧假的 AI 草稿演示 |
| 定向测试 | `tests/environment/ai-knowledge-multi-intent-r32.test.mjs`，`app.ci.json` | 新增跨问题来源、人工审核、一次发送、暂停/ETag、问候、实时订单等 Node/fake Chrome 合同 |

### 真实客户业务规则

- 「你好」→ 本地安全模板「您好，请问有什么可以帮您？」；不调用 AI，亦**不因固定答案自动发送许可而自行发送**，需要原可信侧栏人工确认。
- 「你好，请问何时发货？」→ 一条含问候与已保存发货知识的待审草稿，不额外发送问候。
- 「你好！退款期限是多少？何时发货？可以上门安装吗？」→ 前两题分别归 `qa_demo_refund` 与 `qa_demo_delivery`；上门安装没有可靠来源。产品显示「2 项有依据，1 项待核实」，**一条完整待审草稿，绝不自动发送**。每个子问题保留各自状态、已证实来源、AI 候选来源；后者不得当作已证实来源。
- 「退款要多久」或「退款需要几天」→ 歧义：申请期限、审核时间、到账时间不同；需客户澄清，不能把「7 天内可申请」当作「7 天到账」。R1.3 使用这一含糊示例来测试语义候选已不再安全；仅将旧回归的**提问输入**改为明确「退款期限需要几天」，保留原 Provider 授权、暂停、回执保护断言。
- 精确标准问法、已配置 aliases 仍调用原 `model.lookup()` 固定答案；非精确问题必须基于**原模型已检索**的候选进行附加主题/时效筛选，缺乏可靠主题来源时不扩大送给 AI 的资料。AI 通过原 Shared Provider 产生的草稿一律人工审核，不能直接解锁自动发送；现有数字事实防漂移并不能替代语义事实验证。
- 未授权实时个人订单查询、代用户办理取消/退款/改地址、缺少依据、来源冲突、超过四题或草稿安全上限，均不产生无条件发送；只提示澄清或转人工。
- 整条消息无论有多少已知知识，都复用**一条客户 ID → 一次有意的网页发送 → 一个独立 DOM 回执**。合成消息及问候不能利用单题固定答案自动发送授权。回执不明维持 `UNKNOWN`，只读核对、绝不盲重发。

### 证据分层与遗留

**SOURCE_IMPLEMENTED**：R3.2 的业务模块、Runtime、可信 UI、预览与定向测试已写入 main；使用原 `src/model.js`、14 条示例和原 `trusted/local-test-runtime.js` 的源码做过隔离 V8 执行：目标消息确实返回 2 项已答/1 项待核实，未经审核 0 次替身发送，人工审核后替身 Adapter 仅发送一次，状态 `CONFIRMED`。隔离执行不等于 Node CI、真实网页或 Provider 通过。

**R3.2 终版隔离烟测（非正式 Node PASS）**：绑定本次最新 GitHub 源码中的 model、router、Runtime、原 Shared AI Consumer/Host 与预览脚本执行 **33/33** 纯业务/语法检查，无失败。另使用原 Shared Consumer + 替身 Provider 真实执行过逐题允许列表：不属于本问题的 `qa_demo_payment` 在调用 Provider 前收到 `E_KB_REFERENCES`（Provider 次数 0）；合法 `qa_demo_refund` 仅把该知识的 `id/question/answer/scope` 交给替身 Provider（次数 1），结果仍是 `REVIEW_REQUIRED`。两个非精确问题在有单文档授权时通过原 Runtime 分别取 `qa_demo_invoice` / `qa_demo_tracking` 的草稿，合成为一条，人工确认前 0 次替身发送、人工确认后 1 次。**这些运行环境都不是 Node 的官方测试入口，也不是真实模型/网页发送**。

**历史证据不可继承**：R3.1 的 158/158 Node PASS 对应旧源码；R3.2 新 Node / CI 结果单独核对实际 Job。`PREVIEW_BROWSER_PASS`、`CHROME_PASS`、`REAL_PROVIDER_PASS` 当前未获得本次真实验收；第三方正式站点 Adapter/授权仍 `BLOCKED_NO_TARGET`。

新增最小命令（Mac、本仓库根目录）：

`node --test tests/environment/ai-knowledge-multi-intent-r32.test.mjs tests/environment/ai-knowledge-chat-r13.test.mjs`

原 `app.ci.json` 已纳入 R3.2 文件，不能把 workflow 触发或队列状态称为 PASS。若影响其它 Provider/Host 合同，只运行确有变化的定向项；真实 Mac Chrome 需另按 R3.1 操作核对当前构建身份、文档/客户/回复 ID 和网页真实按钮回执。

**剩余界面差量**：可信客服界面已去掉「本地测试」业务标题；原沙箱 `src/index.html` 中「测试知识回答」是历史知识查询管理页文字，因未在本轮触及正式沙箱发行输入及单一 JSON 包，仍保留在 0.1.5。若要求该标题也全部去测试化，需要由发行 owner 用原候选构建、校验和晋升流程同时更新 `src/` 与唯一正式安装包，不能仅改预览制造正式效果。

关闭对话后请以本 README、原预览路径及 [R3.2 增量记录](../../../docs/framework/workstreams/ai-knowledge-answers-r32-20261026.md) 复现，不以历史一次性的聊天附件作为持久入口。

---

## R3.1 · 正式入口、真实能力边界与离开对话后的使用方法（2026-10-26）

**唯一持续维护入口就是本 README + 仓库文件，不依赖 ChatGPT 的 `/mnt/data/` 聊天附件。** 历史 `ai_knowledge_answers_interactive_preview.html` 是单文件演示，不是正式产品；如果附件失效，直接使用下方同源 HTTP 预览，不重建知识模型。

| 项目 | 仓库内准确路径 | 使用角色 |
| --- | --- | --- |
| 正式 Sidebar Tool 安装包 | `examples/sidebar-tools/ai-knowledge-answers/ai-knowledge-answers.opendesk-tool.json` | 官方扩展中心导入、更新及身份核验，版本 `0.1.5` |
| 知识问答正式界面 | `examples/sidebar-tools/ai-knowledge-answers/src/index.html`、`style.css`、`main.js`、`model.js` | 沙箱知识查询、CRUD、搜索筛选、JSON/CSV、ETag 写后读回 |
| 正式同源交互预览 | **`examples/sidebar-tools/ai-knowledge-answers/preview/index.html`** | HTTP 载入真实 `src/` 页面脚本；仅模拟 Host 存储和可信 AI 外观 |
| 可信 AI 客服界面 | `examples/sidebar-tools/ai-knowledge-answers/trusted/Workspace.jsx`、`workspace.css`、`host.js` | 真正客服监听、审核、发送、UNKNOWN 只读核对入口；**不属于 HTTP 预览所模拟的权限** |
| 真实客户端业务接线 | `trusted/ai-request.js`、`local-test-runtime.js`、`local-test-adapter.js` | 现有 Shared Provider、固定端口/文档 DOM、去重与只读回执 |
| 客服模拟网页 | `examples/tasks/ai-knowledge-chat-demo.html`、`.js`、`.css` | 独立客户消息和客服 DOM 发送表单；网页本身**不生成客服答案** |
| 示例知识及用例 | `fixtures/sample-knowledge.json`、`sample-knowledge.csv`、`answer-test-cases.json` | 14 条虚构知识、52 个场景，不代表真实商家政策 |
| 自动化测试接入 | `examples/sidebar-tools/ai-knowledge-answers/app.ci.json` | 直接复用仓库既有 App CI，每次定向提交运行知识、Host、Provider 与客服 Runtime 测试 |
| 本轮状态及证据边界 | `docs/framework/workstreams/ai-knowledge-answers-r31-20261026.md` | 已有能力、增量改动、未验证项与下一条真实操作 |

### 启动两个互相独立的网页（Mac，仓库根目录）

先确认 `lsof -nP -iTCP:43111 -sTCP:LISTEN` 与 `lsof -nP -iTCP:43112 -sTCP:LISTEN`；若已有其他 owner 的服务，核对其目录，不抢占、强杀或重复启动。没有监听时分别运行：

```sh
cd /Users/shopme/Documents/workspace/opendesk-browser
python3 -m http.server 43112 --bind 127.0.0.1 --directory examples/sidebar-tools/ai-knowledge-answers
# 打开 http://127.0.0.1:43112/preview/ （知识 UI，同源业务源码 + 假 Host）

# 新终端，在相同仓库根目录
python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks
# 打开 http://127.0.0.1:43111/ai-knowledge-chat-demo.html （独立真实网页 DOM）
```

预览只能测试：切换「问答/知识」、固定回答和候选来源、新建/编辑/启停/删除、JSON/CSV 导入导出，以及冲突/回执丢失模拟。选择空库或 14 条样例数据后，输入问题→查询→编辑→保存→返回再次查询。`43112` 的预览刷新会重置内存；这**不是**真实 Host 持久化或 Shared Provider、客服监听及 DOM 发送。

### 如何在已安装工具验证真实客服闭环

1. 在原「扩展」中心核对官方身份和 0.1.5，同一 Browser 已编译最新 `trusted/` 代码；保留现有数据，导入 `fixtures/sample-knowledge.json` 时先备份并预览。
2. 在 Chrome **当前窗口**打开上方固定 `43111` 客服网页，然后在可信侧栏点击「批准并监听本地测试页」（10 分钟、20 条、单一 `documentId`、默认关闭自动发送）。此授权不是针对任意第三方网站的泛授权。
3. 批准后在网页**新发送**「几天内可以退款」；观察客户 `messageId`、`thread_demo_01`、知识 `qa_demo_refund` 和 `ANSWERED_FIXED`。在侧栏人工确认，或仅在事先明确勾选后允许固定答案自动发送；检查网页实际客服 DOM 的 `data-reply-to` 和唯一客服 `messageId`，侧栏出现 `CONFIRMED`。
4. 新发「退款需要几天」→ `RETRIEVED_ONLY`。逐条审阅将发送给 AI 的问题、条件、来源和 Provider 后，通过原 Shared AI Consumer 获得 `REVIEW_REQUIRED` 草稿；人工审核内容并单独点击「人工确认发送」。定时自动 AI 草稿必须另行授权；**自动生成始终不等于自动发送**。
5. 本地网页可设 3/6/10 秒、4/8/12/20 条定时消息。分别验证两会话切换、暂停/恢复、停止、保存知识后的 ETag 失效、Provider 撤权，以及同客户双击不能重复发送。
6. 对 `UNKNOWN` 使用可信侧栏「只读核对网页回执」：只读取原授权文档，不再次点击发送；若原客户文本/范围/线程及唯一客服回执完整一致则更新 `CONFIRMED`，否则继续 `UNKNOWN` 并人工调查。**停止/撤权/切换文档后不能偷偷重绑旧消息。**

### 状态与排障

| 状态或问题 | 用户应如何处理 |
| --- | --- |
| `ANSWERED_FIXED` | 仅代表准确知识匹配；未授权自动固定发送时，仍需实际点击确认 |
| `RETRIEVED_ONLY` / `REVIEW_REQUIRED` | 候选不等于事实；AI 草稿必须核对来源、申请期限/到账时长等语义后逐条批准 |
| `AMBIGUOUS` / `NO_MATCH` / `INVALID_AI` | 不自动回答，先调整知识、条件或转人工 |
| `SENDING` | 网页结果尚在处理，禁止再次点击同一消息 |
| `UNKNOWN` | 禁止自动或人工盲目重发；原会话仍在时执行只读核对，否则人工检查网页聊天记录 |
| `STALE` / ETag 冲突 | 重新读取并核对知识版本、原消息与授权；旧答案和已废弃 AI 草稿不得沿用 |
| 监听已暂停/停止、授权撤回 | 暂停不会取消已经实际点击的发送；撤权后不派发新操作，重新运行须再次审阅 |
| 页面“等待 OpenDesk 监听” | 证明客户端尚未读到监听标识；先核实正式工具身份、可信 Host、当前窗口与 `43111` URL，不以客户端演示页面冒充侧栏启动成功 |

### 已完成与尚未证明的测试

- **历史真实 Mac CFT 核心 PASS（`0.1.5`）**：通过原安装/升级流程，知识新建、保存读回、编辑、关闭重开侧栏后仍可查询；该证据仅覆盖知识管理，并非本轮浏览器重新验收。
- **历史 Node/fake Chrome/fake Provider PASS**：见 `R1.5-LOCAL` 文档的 24/24 Runtime、34/34 Host/Provider、16/16 共享夹具，均不代替本轮回归或真实 DOM。
- **R3.1 新增 Node 回归已真实执行通过**：GitHub App CI 基于源码提交 `29caf7d45f2b5c2b743338ef6749ea9913d16eb6`，`app-validate (ai-knowledge-answers)` job `121443898437` 为 **158/158 PASS、0 FAIL**，其中 4/4 新增 `R3.1` 用例 PASS。运行地址：https://github.com/shopable-ai/opendesk-browser/actions/runs/40284151167 。测试使用 fake Chrome/Provider，不能计为真实客服 DOM 发送或 Shared Provider。
- **同源正式候选来源校验通过（CI，仅 Node）**：0.1.5、57,435 字节、SHA-256 `e65e942b7715c0801e93f784a7923f4f0a814a076f39aeb31a89a3e6ebb4bc36`，状态 `CANDIDATE_SOURCE_IDENTICAL`；未由本轮重新安装/升级正式 Chrome，也没有声称 Browser trusted 代码获运行验证。
- **本轮仍未实测**：HTTP 43112 预览操作、真实 Chrome 可信监听/只读恢复/DOM 发送、真实 Shared Provider 与用户批准的第三方客服网站；均为 `NOT_TESTED`，不以本次 Node 158 PASS 补齐。
- **未完成**：本轮真实已安装工具中的监听→固定回执→真实 Provider→人工审核→网页确认，三方真实网站适配（须先有用户批准的目标站点及 DOM 契约），以及 production 安装/撤权/原生异常全矩阵。
- **不混淆发行身份**：`trusted/` 改动属于 Browser 内静态编译业务，不应手工修改现有 0.1.5 Sidebar Tool JSON 或冒充包版本升级；部署之前按唯一 Browser 构建和官方 admission 验证新可信代码真正被加载。

本轮新用例的本地最小命令：

```sh
node --test tests/environment/ai-knowledge-chat-r13.test.mjs
node --test tests/environment/ai-knowledge-answers-host.test.mjs tests/environment/ai-knowledge-answers-provider-contract.test.mjs
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/ai-knowledge-answers --check-project
```

历史的 UI/包/Native 分层证据继续见下文及相应 workstream；本 README 和上述仓库路径才是**跨 ChatGPT 对话的长期启动入口**。



## R1.3：从哪里开始测试（原生尚未验收）

本地客服模拟网页源码：`examples/tasks/ai-knowledge-chat-demo.{html,js,css}`。
只在确定端口空闲或服务是当前仓库版本时复用：

```sh
lsof -nP -iTCP:43111 -sTCP:LISTEN
python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks
```

在 Chrome 打开 `http://127.0.0.1:43111/ai-knowledge-chat-demo.html`；若 43111 已被占用，先核对既有服务，不杀进程或重启别的 Agent 的服务。可信适配器固定精确端口与路径，临时换端口不会自动变更适配器授权范围。

先通过官方安装器取得已验证来源的 `ai-knowledge-answers` 安装身份，导入 `fixtures/sample-knowledge.json`（14 条虚构演示政策，非商家事实），在可信侧栏点击**批准并监听本地测试页**，然后在测试网页发送「几天内可以退款」。默认需手动确认发送固定答案；只有开始前单独批准的固定答案才允许自动发送。非精确问题如「退款需要几天」必须经过真实 Shared Provider 和人工审核才可发送；定时消息仅在页面制造客户 DOM，不直接调用模型。

`fixtures/sample-knowledge.csv` 与 JSON 同值；`fixtures/answer-test-cases.json` 包含 52 个场景，37 个检索期可静态检验，15 个真实端到端阶段不得当作 PASS。默认 Side Panel 保持打开；暂停/停止可分别从网页和侧栏操作。来源、撤权、发送结果未知与会话切换的逐项验收步骤见 [R1.3 真实 DOM 测试记录](../../../docs/framework/workstreams/ai-knowledge-answers-r13-20261026.md)。连续点击同一发送确认的最小栅栏修复及证据见 [R1.3 并发回归](../../../docs/framework/workstreams/ai-knowledge-answers-r13-send-fence-20261026.md)。

**已复核的是业务源码和隔离 V8 逻辑，不是完整本机 Chrome/Native Provider/真实网站回执。** 修改的可信宿主代码仍须通过原日常 watcher 编译，并在当前开发 Chrome 中真实验证；不要只导入旧 0.1.2 JSON 就推断最新可信代码已经运行。

## 当前范围

- 原 HTML/CSS/JS 知识管理界面保持沙箱：固定问答、同义问题、限定范围、轻量检索、编辑、启停、删除、JSON/CSV。
- 复用 `storage.get({withEtag:true})` / `storage.set({ifMatch})` 与写后读回；结果未知时停写。单键上限仍为 8192 字节。
- 官方来源核验通过的安装实例，在原沙箱上方显示静态编译的可信 AI 控件。准备知识后审阅接收方及实际外发字段，再由真实 Send 点击同步进入原 Provider 授权路径。iframe 不持有 API Key、Native client 或 Provider lease。
- 模型只接收候选的 `id/question/answer/scope`，aliases 留在本机。发送及交付均核对安装身份，交付时回读 ETag。换 Provider、取消、Native 断线、相关权限撤销和知识更新会丢弃旧结果。
- AI 必须引用本轮真实知识 ID；新增数字事实被拒绝。语义仍需人工证明，所有 AI 答案为 `REVIEW_REQUIRED / needsHuman=true`。

R1.2 历史记录为 58 项定向 Node 测试通过，包含实际编辑器脚本在内存存储下的新建、保存读回、重开、同义回答与未知写入保护；这属于组件证据。已保留并行提交的未知写入恢复和本地测试接线，并验证普通手动问答不会自动读取网站，问题修改后迟到回答失效。0.1.2 修复 R2 UI 的打包失败和过时 AI 提示。旧记录中的真实 Local Codex backend 有来源实答不代表当前包已获原生验收。**0.1.5 已完成下述 CFT 安装、保存及侧栏关闭重开核心链；可信 Send 和原生异常恢复仍为 NOT_TESTED**。历史详见[现有工作记录](../../../docs/framework/workstreams/ai-knowledge-answers-r1-20261025.md)，最新核心结果见文末 0.1.5 原生记录。

## 安装与操作入口

唯一正式文件是本目录 `ai-knowledge-answers.opendesk-tool.json`，不是 `tool.config.json`。已由原打包器晋升；0.1.5 的 CFT 核心验证见文末，完整正式验收未执行。

Browser 须包含本轮静态可信接线。日常开发复用 `dist/development` 已有 watcher；只导入 JSON 不会升级 Browser 的可信代码。

1. 在「扩展」官方可发现列表选择「AI 知识问答」，核对 `0.1.5`、来源、能力与摘要，使用原确认安装/更新流程。安装后打开即可，无通用二次启用步骤。保留原知识数据，不先卸载；可信 Browser 准入版本也须与新包一致。旧开发输出未必包含本轮发行，不能凭源码版本推断 Chrome 已安装。
2. 仅从本地文件导入时，原安装器不会制造官方 provenance；知识管理继续可用，可信 AI 保持关闭。使用可信 AI 须通过同一安装器审阅准确官方发行，不能手写来源记录或借用其他工具身份。
3. 新建明确标为测试数据的知识“退款期限是多少 → 7 天内可退款”，添加别名“多久可以退款”，保存；关闭重开并核对数据。
4. 输入别名验证固定回答；输入“退款需要多少天？”准备候选，核对知识 ID、接收方与外发内容后发送。区分退款申请期限与处理/到账时长，不把测试数据当作企业政策。
5. 核对来源与人工审阅标记，再验证取消、换 Provider、断线、撤权和知识更新后旧答案失效。

上一轮读取现有 Mac Chrome 扩展工作区被浏览器自动审批拒绝：URL 策略仅允许 HTTP/HTTPS，不允许 `chrome-extension:`。已停止该入口，没有改用其他表面、CDP 或 Profile 绕过。以上原生步骤仍待执行；本次改从「开发 → 本地项目」核对入口的结果见文末。

## CSV 与验证

CSV 表头 `id,question,aliases,answer,scope,enabled`，aliases 是 JSON 数组。公式前缀添加单引号，CSV 对此类值不是无损往返；备份优先 JSON。原下载能力仅支持 `.json/.md/.txt`，CSV 当前复制到剪贴板。

在仓库根执行：

```sh
node --test tests/environment/ai-knowledge-answers-r1.test.mjs tests/environment/ai-knowledge-answers-ui-r2.test.mjs tests/environment/ai-knowledge-answers-provider-contract.test.mjs tests/environment/ai-knowledge-answers-admission.test.mjs tests/environment/ai-knowledge-answers-host.test.mjs
npm run build:sidebar-tool -- examples/sidebar-tools/ai-knowledge-answers --out artifacts/sidebar-tools/ai-knowledge-answers/candidate.opendesk-tool.json
# 定向测试及包校验通过后才晋升：
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/ai-knowledge-answers --promote-from artifacts/sidebar-tools/ai-knowledge-answers/candidate.opendesk-tool.json
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/ai-knowledge-answers --check-project
```

Provider 契约及 Host 集成测试使用明确标注的 fake transport，只证明接线与保护；真实推理证据单独记录。晋升不代表已安装、线上上架或 production 验收。


## R2：问答首页／知识列表／独立编辑 UI

已在原 `src/index.html`、`src/style.css`、`src/main.js` 将原纵向堆叠改为互斥视图：问答（默认）、知识列表（搜索、筛选、行级进入编辑）和新建/编辑（返回、单一保存、删除确认）。导入导出是列表内更多操作。保留原 `model.js`、固定 ID、`storage.get({withEtag:true})` / `storage.set({ifMatch})`、写后读回与未知写入禁止重放。

可视化原型 `preview/index.html` **通过同源 HTTP** 加载 `../src/index.html`、`style.css`、`model.js`、`main.js`；唯一模拟的是 Host Storage 与文件导出，不得作为真实 Provider 或 Mac Chrome 验收证据。附带 `fixtures/sample-knowledge.json`（演示规则，不代表真实企业政策）。运行：

```sh
python3 -m http.server 43112 --bind 127.0.0.1 --directory examples/sidebar-tools/ai-knowledge-answers
# http://127.0.0.1:43112/preview/
node --test tests/environment/ai-knowledge-answers-ui-r2.test.mjs
```

若发现该端口被其他 Agent 占用，则复用原端口或选当前会话未占用的端口，不得终止他人的服务。R2 UI 对正式 Chrome 安装及独立 Provider 请求均维持 `NOT_TESTED`。

## R2.1 · 核心 UI 交互与同源预览（2026-10-26）

正式 HTML/CSS/JS 已设计为问答先行，知识加载条数及来源状态持续可见；长问题最多两行，删除入口在编辑页折叠危险区；取消、删除、导入预览进入侧栏可见的 Tab/Escape 确认层；Ctrl/⌘+Enter 快捷查询。

`preview/index.html` 通过 HTTP 继续加载正式 `src/index.html`、`src/style.css`、`src/model.js` 和 `src/main.js`，支持空库/14 条与 Host 保存冲突、回执丢失、读取失败测试。预览的可信 AI 审阅只模拟状态，**不调用 Provider**，不表示原生 Chrome 验收。原知识数据结构、ETag 写后读回、权限及工具 ID 不变；R2.1 初版 deae91c51 为 0.1.3，本轮最小 UI 修复晋升为 0.1.4。旧版测试不能冒充新版验证。

### R2.1-LOCAL 本轮实测（2026-10-26）

HTTP 正式源码预览中，已完成「输入退款期限是多少 → 查询固定答案与 qa_demo_refund 来源 → 知识列表 → 编辑 → 保存读回 → 返回列表 → 再次查询修改后的回答」。全部测试内容均为演示数据，不代表真实商家政策。

本轮仅修复已复现的 UI：保存及主动核对后的焦点恢复、未保存方向键导航的确认层焦点、异步导入取消及格式错误后的焦点、导出成功/失败后的焦点、问题/条件改变后旧结果失效、必填字段定位及 ARIA 错误关联、当前知识面板及行级启停/条件的可访问描述。冲突或回执未知时，文本保留为可选择复制的只读字段，保存及启停仍禁止；确认层背景使用 inert。保留原 ETag、写后读回和未知写入禁重放机制。除可信准入版本常量同步外，未改 Host、Provider、模型或存储实现。

预览在独立 iframe 中直接加载正式源码；仅从唯一正式包复用打包器生成的公共共享设计前缀，不执行包内 JS、不加载完整宿主 CSS。实际样式合成与正式包 CSS 逐字节相同。宽度按钮控制 iframe viewport，因此 320px 媒体查询及固定确认层也在该宽度内生效；这仍不是正式 opaque-origin Sandbox/CSP 验收。

| 证据层 | 本轮结果 |
| --- | --- |
| Node | 指定五份测试 88/88 PASS，含新增 26 条 UI 行为回归；内存 transport 不证明真实持久化或 Provider |
| Chromium 149.0.7827.55 HTTP 预览 | 22 组 PASS：核心链、搜索/停用后重查、歧义来源、空库、CRUD、未保存/取消/键盘、JSON/CSV 导入、实际 JSON 下载及 CSV 剪贴板、冲突/回执丢失后的实际键盘复制、失败与主动核对 |
| 指定四宽 | viewport 与 document/app scrollWidth 均为 320/360/400/440；长问题 180 字、答案 1200 字、条件 60 字无横溢；保存按钮 hit-test 可点；确认层宽 288/328/368/390px |
| 单一正式包 | 0.1.4，57,349 UTF-8 bytes；候选测试 → 同一打包器 promote-from → check-project PASS；SHA-256 745660cab46fe0009d500a4a948b62fa0553cd2fb762803c95d37835c4044649 |
| 现有 Mac Chrome 安装 | BLOCKED：浏览器 URL 策略直接拒绝读取现有 chrome-extension 工作区，仅允许 HTTP/HTTPS；安装版本、关闭重开、真实可信 AI 工作区分离均 NOT_TESTED。未绕过策略、新建 Profile 或重建/替换日常扩展 |

原始本地证据位于忽略目录 `artifacts/sidebar-tools/ai-knowledge-answers/`：`r21-ui-evidence.json`、浏览器原始结果 `r21-browser-result.json`、可复跑的 `r21-ui-browser-check.js`、`r21-node-final.tap`、`r21-source-proof.txt` 及四宽截图。现有其他 Agent 的改动与 watcher 保留。预览刷新会重置内存种子，不可当作关闭重开后的持久化证明。

四个独立子 Agent 分别从 UX、前端架构、无障碍、测试视角只读复评最新 diff 及父任务实际执行证据；测试视角另执行了定向组件回归。下表为 **Node＋源码／HTTP 预览层建议分**，不是 Mac Chrome 或完整 WCAG 认证。

| 维度 | 限定范围分数 /100 | 主要证据 |
| --- | ---: | --- |
| 布局统一 | 97 | 正式公共样式前缀与源码合成逐字节一致，四宽截图 |
| 信息可读性 | 96 | 固定答案、来源、候选、冲突与无依据分态；旧结果失效 |
| 操作效率 | 95 | 查询→编辑保存→返回及再次查询，取消后焦点恢复 |
| 响应式 | 98 | 320/360/400/440 viewport，长文本、保存 hit-test、确认层 |
| 无障碍 | 96 | Tab/Shift+Tab/Escape/方向键、inert、字段错误关联、真实键盘复制 |
| 架构隔离 | 96 | 继续使用 SDK root/request；预览仅模拟 transport，无新增权限或业务副本 |
| 代码可维护性 | 95 | 原 state/show/guard/commit 保留，禁止修改与禁止聚焦分开，无新增抽象层 |
| 测试证据 | 96 | 22 组 Chromium 结果、Node 行为回归、下载及剪贴板内容检查 |
| 异常恢复 | 96 | 冲突/未知写入停写、可复制输入、主动回读；坏 JSON 和导出失败恢复 |

**最终综合平均：未计算。** 原生安装、保存后关闭重开、真实可信工作区与沙箱隔离缺少本轮证据，维持 BLOCKED / NOT_TESTED / NOT_SCORED；不能用预览评分补齐或宣称“全部 ≥95 的完整验收通过”。剩余可选覆盖包括写后读回不一致及连续恢复失败，并非已复现 UI 缺陷，不扩大本轮工程。

### R2.1-LOCAL 续接：开发 → 本地项目入口复核（2026-10-26）

在真实 Mac Chrome 侧栏打开「开发 → 使用本地项目」，当前网页为标准测试页 `http://127.0.0.1:43111/demo-form.html`。侧栏显示「Chrome Native：已连接；源码 Provider：未就绪」及 `E_DEV_PROVIDER_UNAVAILABLE`；可选项目仅有另一工具的离线目录，尚未显示本工具已连接的目录。「关联已安装工具」「保存源码关联」「实时开发预览 ↗」入口存在，后两项当前不可用。这是当前连接状态，不能据此判定 Sidebar Tool 不受本地项目支持，也没有将本工具改成 Controller/Page Program。

已登记 CLI 的只读 `opendesk-dev --doctor --json` 返回 Native 认证成功、`browserReady: true`，且登记内容与安装目录相符；通用 `opendesk browser doctor` 则返回 `connected: false`。这两种诊断都不能替代侧栏中的源码 Provider 就绪证据，也未证明实际加载的扩展路径、构建指纹或 dev serve 连接。保留已有 `npm run dev` 与 `dist/development`，没有重启、复制或替换日常扩展。

按[现行本地预览合同](../../../docs/api/sidebar-tool-development.zh-CN.md#b-本地只读预览改得勤但暂不安装)，「实时开发预览 ↗」将短时、一次性的来源绑定意图交给原 Workspace，仍需校验目录、Native 租约与工具 ID；它不等于直接运行或安装 Sidebar Tool。当前 CLI 连接命令会自动打开原 Workspace，本轮没有用它绕过上一轮 URL 策略限制。共享 Chrome 前台随后被并行任务切换，停止争用窗口；未修改其他工具的目录关联、启动新 Provider 或新增 Profile。本工具的来源关联、实时预览、隔离存储批准及原生保存重开链仍为 **NOT_TESTED**，不是已复现的 UI 缺陷。

本轮另在 HTTP 同源预览重新执行「查询退款期限 → 编辑答案 → 保存并读回确认 → 返回问答 → 再次查询」，可见固定答案包含新增的「本轮界面保存核对。」并保留 `qa_demo_refund` 来源。此次运行使用模拟内存 Host，刷新仍会重置，不证明安装后持久化或真实 AI。未发现新 UI 缺陷；正式源码、预览源码及唯一 `0.1.4` 安装包均未改动，因此复用前述有效定向证据，没有重复构建、全组测试或评分。

续接证据保存在忽略目录 `artifacts/sidebar-tools/ai-knowledge-answers/`：`r21-local-entry-20261026.json` 与 `r21-local-entry-core-20261026.png`。下一条未验证操作仍是通过现有本地项目链连接本工具的准确目录并确认来源身份；原生安装、关闭重开和真实可信 AI 分离未被 HTTP 结果补齐。


### R2.1 原生核心链与保存修复（2026-10-26，0.1.5）

用户授权新建独立 Chrome for Testing 后，在 Mac CFT `154.0.8037.92` 的全新临时 Profile，通过真实工具栏和原安装器安装 0.1.4。实际复现：点击或按 Enter 激活「保存知识」无响应，仍显示未保存修改；DevTools 明确报告沙箱未提供 `allow-forms`，阻止了 HTML 表单提交。此前组件测试直接派发 `submit`，HTTP 预览也没有同样的沙箱限制，未覆盖这条原生故障。

0.1.5 将工具自身编辑区改为带标题的 group，普通按钮 click 调用原 `commit`；Tab 到保存按钮后按 Enter 仍可保存。未放宽沙箱、CSP、权限或未知写入保护。可信 Browser 仅同步固定准入版本至 0.1.5，仍要求准确官方来源、包摘要、安装身份及撤权代际。组件测试改为激活实际按钮：修复前核心保存用例失败，修复后 UI、未知/冲突写入保护、官方准入和原打包/沙箱合同共 **51/51 PASS**。

候选经原打包器构建、定向测试、`--promote-from`、`--check-project` 后晋升唯一正式 JSON：**0.1.5，57,435 字节，SHA-256 `e65e942b7715c0801e93f784a7923f4f0a814a076f39aeb31a89a3e6ebb4bc36`**。已有 watcher 自动同步官方资源，未启动第二个构建器或复制扩展。真实测试 Profile 的扩展详情确认加载 `dist/development`、ID `ccfcjegpkdlgbclopjmadlcjedelidmf`；「调试 → 本地开发服务」显示开发服务已连接，revision `6cdc509d878958bdaccbe7b18c59c4f8f32af9b6f19d10ea3d96328960acfe6f`。Chrome 的开发者模式在重载时阻止扩展继续运行，开启该测试 Profile 的开发者模式后恢复；日常 Chrome 与其他任务服务未操作。

通过官方「审阅新版 → 确认更新」完成同 ID 0.1.4 → 0.1.5，无新增/移除能力，审阅显示的原始及规范 SHA 与正式包一致。原 0.1.4 空库没有已保存记录，因此此次升级不证明已有内容的跨版本迁移。

真实已完成操作：新建唯一虚构测试知识 → 点击保存并独立读回 → 查询蓝色通行卡固定答案及来源 → 编辑为绿色通行卡 → Tab/Enter 保存并读回 → 返回扩展列表、关闭侧栏 → 重新打开同一安装实例 → 已载入 1 条知识 → 查询仍返回绿色通行卡答案及同一来源 `qa_cde066a739cc4e16a6592094f4b66aa3`。重开后的 hostInstanceId 已变化，所见不是未关闭的旧编辑器。可信 AI 控件与独立沙箱同时可见，但没有批准网站监听、自动发送或调用 Provider。

本轮为 **CORE_NATIVE_PASS（持续开发候选）**；上述具体安装、保存、编辑及侧栏关闭重开不再是 NOT_TESTED。真实 AI/Native Provider、本地客服消息链、整浏览器进程重启及 production 正式验收仍 **NOT_TESTED**，不替代其他工作流记录或整体评分。没有执行宽度/缩放矩阵。

原始证据保存在忽略目录 `artifacts/sidebar-tools/ai-knowledge-answers/r21-cft154-core-20261026/`：`result.json` 含身份、各步骤和原始文件 SHA，`04-sandbox-form-error.*`、`07-update-review.*`、`08-save-readback.*`、`09-fixed-answer.*`、`10-edit-save-keyboard.txt`、`11-closed.txt`、`12-reopened-loaded.txt`、`13-reopened-answer.*`、`14-dev-connection.txt` 和 `05-node-gates.tap`。启动记录为同级 `r21-cft154-launch-20261026.json`。历史预览分数和 0.1.4 阻塞记录保留，不提升为本次完整验收。
