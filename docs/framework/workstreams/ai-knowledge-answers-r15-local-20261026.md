# AI 知识问答 R1.5-LOCAL · 本机增量验证与原生阻塞

日期：2026-10-26（Asia/Shanghai）。Owner：Codex `01a17483-3413-72c1-b400-60ce7a2d6081`。

结论：**BLOCKED，已有部分源码与 Node 验证；没有达到 LOCAL_ACCEPTED。** 客户能够在现有真实 Chrome Demo 提交问题并得到唯一客户 DOM 消息；尚未取得可信监听、固定回答发送及客服 DOM 回执。真实 Shared Provider、自动客服和原生异常恢复均未完成，不借 Node fake 结果补齐。

## 最新基线与复用

- 已实际 `git fetch origin main`。开始时本地 HEAD 与 origin/main 均为 `8998da5c8ca8241cb4401a219d88e00cfbc9a3dd`，ahead/behind 0/0。
- R1.4 `b4cfcc83bb4bf5cf099f6cbf9a7979fe2467063e` 是该基线的祖先；其五个可信业务文件及 Runtime 测试没有后续源码差异。
- **REUSED / SOURCE_REVIEWED**：原知识模型、14 条 JSON/CSV 知识、52 个场景、单一 Trusted Host、Shared Provider Consumer、原 DOM Adapter/Runtime、R2.1 管理 UI、R1.3.2 暂停代次/许可隔离/迟到结果保护、同步发送栅栏与 UNKNOWN 不重放。没有重新开发这些功能。
- 开始时 `docs/framework/workstreams/ai-knowledge-answers-r132-local-20261026.md` 已有未提交修改；保留且不纳入本轮提交。上轮本地 owner 已 idle/blocked，本轮复用其交接 Demo 标签。没有向其他对话发消息。
- 唯一修改分支仍为 main；没有分支、worktree、PR、强推、reset、重装扩展或新服务。

## 本轮实际执行的定向验证

运行这些检查是为补齐 R1.4 新增暂停、人工草稿身份和可信 UI 的缺失执行证据，同时确认原 Host/Provider 保护及正式 JSON 同源；不是全仓回归。随后发现两项 P2，四项精准回归先 RED 再 GREEN；最终重跑受影响 Runtime 和 Host/Provider，验证原保护未退化。

| 实际命令 | 退出码与数量 | 证明范围 |
| --- | --- | --- |
| `node --test tests/environment/ai-knowledge-chat-r13.test.mjs` | 0；20/20 PASS | 含 R1.4 三项新增测试；暂停等待/快速恢复、草稿身份/ETag/来源、实际答案字段与回执字段；Chrome/Provider 是明确 fake |
| `node --test tests/environment/ai-knowledge-answers-host.test.mjs tests/environment/ai-knowledge-answers-provider-contract.test.mjs` | 0；34/34 PASS | Host、Shared Consumer 的知识、来源、取消、撤权、迟到结果等契约；不是真实模型调用 |
| `node --test --test-reporter=tap --test-name-pattern=R1.5 tests/environment/ai-knowledge-chat-r13.test.mjs` | 修复前退出1，0/4；修复后退出0，4/4 | 旧连接清理、刷新中停止、自动发送前读取失败与知识变化 |
| `node --test --test-reporter=tap tests/environment/ai-knowledge-chat-r13.test.mjs`，最终 | 0；24/24 PASS | 同一最终 Runtime/Adapter，包含全部原有与新增保护 |
| Host/Provider 两文件加 `--test-reporter=tap`，最终 | 0；34/34 PASS | 可信业务修复后重新核对原 Host/Provider 接线 |
| `node scripts/build-sidebar-tool.mjs examples/sidebar-tools/ai-knowledge-answers --check-project` | 0；PROJECT_PACKAGE_MATCH | 唯一正式包 0.1.4、57,349 字节，SHA-256 `745660cab46fe0009d500a4a948b62fa0553cd2fb762803c95d37835c4044649`；installed=false |
| `node --test --test-reporter=tap tests/environment/sidebar-tool-multiscript-r72.test.mjs`，修复前 | 1；1 PASS / 15 FAIL | 复现共享测试夹具的 `ReferenceError: sandboxToolMessages is not defined` |
| 同一命令，修复后 | 0；16/16 PASS | 真实 helper 注入 VM 后原全部断言通过；没有跳过门禁 |
| 修改 JS/MJS 的 `node --check`、`git diff --check` | 0 | 本轮语法与补丁格式 |

最终 Runtime 24 + Host/Provider 34 + 共享夹具 16 合计 **74/74 PASS**；RED/GREEN 重复用例不另计通过数量。Runtime 内部 37 个 lookup 场景也不再另加到 74。正式 UI/准入/包源码没有变化，未重跑无关 UI/admission 测试；未做全仓测试或手动构建；现有 watcher 按原机制增量更新。

## 已证实缺陷与最小修复

1. **P2，旧连接操作破坏新会话**：旧启动在 DOM 读取悬挂后停止、新启动成功，旧请求迟到失败会无条件清空新 captured；刷新文档等待期间停止也可被旧启动恢复。两个明确 fake Chrome 的行为回归在原代码均失败。原 Adapter 增加本地绑定代次，start/invoke 的异步边界核对所有权，stop/drop 退休旧代次，catch 只能清理自己仍持有的绑定。没有增加 Host、权限或文档匹配范围。
2. **P2，自动发送前失败不可见**：检索成功后，发送前回读知识失败或 ETag 变化，原自动路径吞异常，仍显示固定回答且异常数为0。两个行为回归在原代码均失败。原 Runtime 在尚未派发且记录/暂停代次仍有效时，将读取失败显式标为 ERROR、知识变化标为 STALE，并显示原错误码；不自动重试。已派发后的 UNKNOWN/CONFIRMED 和暂停后重新确认的原语义保持，最终24项Runtime回归通过。
3. **共享 CI 测试夹具缺少依赖**，如下。

CI 失败属于**共享测试夹具**。`sidebar-tool-multiscript-r72.test.mjs` 将 `initSidebarToolSandbox.toString()` 放入独立 VM，却未提供该函数使用的模块级 `sandboxToolMessages`。生产入口正常模块导入保留作用域，没有证据说明这次 ReferenceError 是知识问答产品故障。

最小修复仅在该测试 import 与 VM globals 补入原真实 helper；没有修改 `src/sidebar-tools/bridge.js`，没有放宽断言或伪造翻译实现。该文件属于 `scripts/app-ci.mjs` 的 BASE_TESTS，确实阻断 ai-knowledge-answers 的 App CI。远端完整 App CI 尚未获得本轮成功回执；本机 16/16 不能代替整个远端 job。

其他两份非本轮 App BASE_TESTS 夹具（`sidebar-tools-host.test.mjs`、`adblock-timeout-r23.test.mjs`）有类似静态线索，未执行、未修改，延期。不因同类线索扩大修复。独立审查识别下述两项P2后才修改原 Trusted Runtime/Adapter；没有修改 UI 或 JSON。

## Chrome 实际操作与阻断

继续复用服务 PID 68658：固定 `127.0.0.1:43111`、目录为本仓库 `examples/tasks`。沿用 Chrome 标签 **560068439**，没有启动第二服务器、改变端口或占用整个 Profile。

本轮通过 Chrome 工具真实填写「几天内可以退款」并点击客户「发送」，读回：

- threadId：`thread_demo_01`
- 客户 messageId：`kb_msg_5ae647f4-b563-41aa-a7ea-78aff59f497e`
- 客户文本：`几天内可以退款`
- 客服消息：0；`data-reply-to` 客服回执：无。
- `data-kb-extension-observed`：未设置；页面显示“网页就绪 · 等待 OpenDesk 监听”。这只证明当前页没有读到监听标记，不能推断产品 Runtime 已失败。

前次实际自动审批拒绝 `cua.createBrowserTab('chrome','chrome://extensions/', …)`：URL 策略仅允许 `http:` / `https:`，且明确禁止间接执行、raw CDP、替代浏览器表面等绕过。该拒绝的原始 JSON 已继承保存；本轮未重试被拒绝 URL，也未改用原生窗口、Playwright/CDP、脚本或 Chrome Profile 来取得同一受限结果。当前真实官方安装身份与可信 UI 入口仍不可核验。

Chrome 已知运行 app bundle 的 Info.plist 为 **155.0.8059.85**，不是 `chrome://version` 实读。工具库存中别的扩展工作区 URL 不证明知识问答目标扩展的真实 ID；加载路径、知识工具已装版本、官方 provenance、Native 配对、当前 Provider/模型、可信许可均 **NOT_TESTED**。

| 核心业务 | 源码 / Node | 本轮原生状态 |
| --- | --- | --- |
| 固定知识回答→实际客服按钮→唯一回执→CONFIRMED | IMPLEMENTED / SOURCE_REVIEWED / TEST_PASS | **BLOCKED**；只产生真实客户 DOM，未形成固定回答 E2E |
| 非精确问题→真实 Shared Provider→来源草稿→审核→同客户回执 | IMPLEMENTED / SOURCE_REVIEWED / TEST_PASS（fake transport） | **NOT_TESTED**，前置入口被阻断；未发真实请求，不存在本轮模型响应或错误可报告 |
| 3 秒/4 条、多消息归属、有限自动处理 | IMPLEMENTED；相关有限 Node 契约通过 | **NOT_TESTED**；未启动定时器，不能称自动客服通过 |
| 暂停读取/文档重校验/快速恢复、已点击后回执、重复确认、UNKNOWN | 对应现有 Runtime 测试 TEST_PASS | **NOT_TESTED**；不声称真实已发生点击可被撤回 |
| 人工草稿占用、切文档/会话、ETag/停用来源、Provider 切换/断线/撤权 | SOURCE_REVIEWED；相关 Host/Provider 单测不等于全场景原生证据 | **NOT_TESTED** |

“签收后 7 天内申请退款”仍不等于“7 天到账/处理完成/所有订单无条件退款”。现有来源 ID/数字校验不能证明语义蕴含；AI 草稿必须逐条人工审核。没有真实响应，不能声称上述退款事实已获真实 Provider 验收。

## Browser、Tool、安装证据分层

当前仅复用**持续开发输出** `/Users/shopme/Documents/workspace/opendesk-browser/dist/development`，watcher `npm run dev` PID 91366 / `scripts/dev.mjs` PID 91386 存活。43119 开发服务与43120输出守卫存在；OS 可见连接不等于目标知识工作区已连接。

读取已有 `ui/tool-shell.js.map`，五个可信 JS/JSX（含本轮两项修复） 的 sourcesContent 均与当前正式源码逐字节一致；`ui/tool-shell.js` 和 `knowledge/knowledge-host.js` 的磁盘摘要匹配 `development-update.json`。观察到开发 revision 为 `97cee4b614276fea9611fc7e92fb064dcc1233beefd36bbec493403bfda18fd9`。这只证明已有编译产物包含对应源码，不证明 Chrome 正在执行它。

没有修改 Tool 沙箱输入闭包，没有重新构建/晋升/升级 JSON；0.1.4 保持原字节。没有制作 production 候选或替换日常加载目录。`WEB_CORE_READY=true` **仅限定为本轮源码/Node 门禁通过**：四项精准回归和完整24项Runtime通过，独立只读复审确认两项P2已关闭且无剩余P0/P1/P2发现。该复审未运行测试或浏览器，不是原生验收；源码准备就绪仍不足以说明当前用户已能完成真实业务。`NATIVE_E2E_PASS=false`，`LOCAL_ACCEPTED=false`。

## 八项独立维度评估

这是结合当前源码、Node 和缺失原生证据的工程阶段判断，不是独立专家认证；各项分别扣除其证据缺口，不以主观分数制造验收通过。

| 维度 | /100 | 主要依据与扣分原因 |
| --- | ---: | --- |
| 原始业务目标覆盖 | 56 | 现有产品流程较完整，真实固定答复和 AI 回复均未闭合 |
| 核心功能逻辑完整性 | 86 | 24 项 Runtime 通过，实际文档/草稿/自动处理仍缺原生验证 |
| Shared Provider 与现有架构复用 | 96 | 保留唯一 Consumer/Host/React root/Adapter，未新增基础设施；真实调用待测 |
| 消息身份与发送可靠性 | 80 | 同步栅栏、文档身份、回执和 UNKNOWN 有定向证据；无实际客服回执 |
| 知识事实与来源安全 | 80 | 来源/ETag 与数字边界有测试；退款语义和真实模型输出未验证 |
| 自动触发、授权及异常恢复 | 76 | 独立许可、暂停与迟到结果有 Node 证明；3秒4条和原生撤权未测 |
| 可测试性与交付证据 | 78 | 74 项通过、业务竞态与共享夹具修复、源码/包/产物绑定；安装/真实模型证据不足 |
| UI 核心操作与维护成本 | 84 | 复用正式 UI，R1.4 实际答案与回执字段通过；可信 UI 真实操作未测 |

综合分 `(56+86+96+80+80+76+78+84)/8 = 79.5/100`。没有达到各维度 ≥95 或本地候选验收条件。

## 证据、提交与最短下一步

可提交摘要：[verification.json](evidence/ai-knowledge-answers-r15-local-20261026/verification.json)。原始本机输出与截图在忽略目录 `artifacts/ai-knowledge-answers-r15-local-20261026/`：`runtime-r14.log`、`runtime-final.tap`、`business-red.tap`、`business-green.tap`、`host-provider.log`、`host-provider-final.tap`、`package-check.log`、`ci-classification.tap`、`ci-fixture-green.tap`、`test-receipts.json`、`source-binding.json`、`development-artifact-check.json`、`native-blocker.json`、`demo-dom.json`、`demo-customer.png`。不提交大批 artifacts，不把截图冒充客服完成。

本轮修改仅原 Adapter/Runtime、四项 Runtime 回归、共享测试夹具、本文与小型验证摘要；实际提交 SHA 由 Git 提交回执及最终回复给出。保留 R1.3.2 工作记录的并行修改、原 HTTP 服务、watcher 和 Chrome 状态；并行 `scripts/bundle-provenance.mjs` 与 `tests/environment/ai-knowledge-source-provenance.test.mjs` 不纳入本轮提交。总目标未完成，不标 complete；没有新增权限授权，原生阻塞不能由源码修补解除。

**下一条最短操作**：先获得工具侧允许控制的 Chrome 扩展/官方工具 UI 入口，核验真实加载身份，保留已有知识后导入演示知识，再点击“批准并监听本地测试页”，随后发送一条**新的**退款问题。Runtime 按合同排除批准前已有客户消息，不能等待本轮已产生的旧消息自动被接管。闭合固定答案与唯一 DOM 回执后，再执行真实 Shared Provider 和自动客服。此前已有效的 Node/包证据直接复用，不重复跑测试等待策略变化。
