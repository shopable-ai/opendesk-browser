# OpenDesk Browser Native Agent Bridge R1：正式运行链可选入口

日期：2026-10-08。主干起点 66f11874fa27f6de438155124a3f772129386f8b。
分支：agent/native-agent-bridge-r1-20261008。状态：**NATIVE_HOST_SOURCE_IMPLEMENTED / NATIVE_NOT_TESTED / NOT_READY_FOR_MERGE**。

## 产品边界

普通用户安装扩展后继续直接使用 Side Panel 的 Task/Run；Native Messaging 不是依赖。Developer 在 Chrome 扩展详情的 Options（独立设置页）真实点击“授权并启用”，由该同步点击调用 \`permissions.request(nativeMessaging)\`；Chrome 站点权限必须独立经真实用户批准，Native 回调绝不调用权限请求或伪造可信手势。

R1 不改 Sidebar 三页签、不引入第二 Controller、TargetAuthority、Runner、Page DOM 旁路、权限数据库、Task/Result Store。新增 \`chrome.storage.local\` 中有限且持久的外部请求关联日志，不存脚本源码，不取代 Controller durable Run/Result。

## 组件真实映射

| 历史来源 | 复用内容 | 目标 R1 文件 | 调用者与验证 |
| --- | --- | --- | --- |
| \`opendesk/lab/browser-automation-core/protocol.mjs\` | 32 位小端 Native frame / UTF-8 实际字节、逐行 IPC 和有界 decoder | \`native-agent/wire.mjs\` | CLI / Native Host；\`native-agent-wire.test.mjs\` |
| 旧 \`native-host.mjs\` + \`broker.mjs\` | Chrome origin 约束、客户端凭证认证、私有 Socket、stdout 协议隔离、断连不重放 | \`native-agent/native-host.mjs\` **已实现；需要真实 macOS Chrome 验证** | Chrome connectNative → Host → CLI；需要真实 Mac 验证 |
| 旧 \`setup.mjs\` / \`installation.mjs\` | 绑定明确扩展 ID、注册 manifest、安装隔离、保留同名旧 Demo 文件 | \`native-agent/install.mjs\` | \`native-agent/cli.mjs setup/update/doctor/cleanup\`，Mac 待测 |
| 旧 \`client.mjs\` / MCP demo | 明确 requestId 与零自动动作重试的 CLI 边界 | \`native-agent/cli.mjs\` | Codex CLI；待 Host 实现和本机验证 |
| 旧浏览器 DOM Core + \`todo-user/src-bex\` | **只复用目标快照与结果行为语义，不复用旧执行器** | \`src/native-agent/host-adapter.js\` | 仅消费真实 \`RunHost.start()/stop()\`、Controller 查询 |
| 目标主干 \`src/platform/host/client.js\`、\`src/sw.js\` | 已注册 Host Port、Host Authority、现有连接 | \`src/native-agent/service-worker.js\` + 定向薄改动 | 受控 SW→存活 Host；\`native-agent-bridge.test.mjs\` |
| SW 固定打包入口 | 13 个严格 WXT 输出；可选 Native 协议和配置监听驻留同扩展的本地静态脚本，不放宽动态执行 | `src/entrypoints/transport.js` / `src/native-agent/transport.js` | `native-agent-package.test.mjs` + CI 生产/开发构建与 verify |
| 目标主干 \`src/ui/current-page-target.js\`、\`src/run-host.js\` | 当前窗口精确 document / 正式 Worker、RunId 和保存版本 | \`src/native-agent/host-adapter.js\` | \`native-agent-host.test.mjs\` |

**变化说明：** R1 将旧 Demo 中“独立 Broker 进程 + Native Host”合并为一个由 Chrome 启动的**独立本机 Node Host**，此进程同时负责私有 Unix IPC Socket；不需要另行保活第二个 Broker。Chrome Native Port 断开则 Host 退出，CLI 明确未就绪；任何不确定请求不自动重放。这个简化应在真实 Mac 验证之后才可接受。旧 Demo 的 \`org.opendesk.browser_core_demo\`、\`jpjgepfbapojijlabljgdpbhfmiapkin\`、credential 和 socket 完全保留不碰。

## 受控调用路径

\`\`\`text
Codex CLI --file frozen-request.json (本机 credential)
  → Native Host 私有 Unix Socket
  → Chrome Native Messaging (独立可选端口)
  → 固定包内 native-agent/transport.js (classic MV3 SW importScripts)
  → src/native-agent/service-worker.js (启用状态、requestDigest 和 Host 选择)
  → 已认证的 foundation Host Port (registrationId/documentId)
  → src/native-agent/host-adapter.js (当前 Sidebar window/document + permissions.contains)
  → 同一 scriptEditor.host.start({source,params,target,requestId})
  → startControllerRun (仅持久准入)
  → 同一 Controller / Sandbox Worker / PageProxy / Authority
  → 原有 durable Run / Result / Stop / worker retirement
\`\`\`

关闭/未打开 Sidebar 时没有真实 RunHost，拒绝 \`E_HOST_NOT_READY\`，**不占任务槽**。多个 Sidebar Host 需要选择从 \`bridge.status\` 列出的特定 \`registrationId\`。新页面、新端口、新 Chrome session 重新调用 \`target.current\` 获取实际 tab/document/URL；不修改业务脚本源码 hash。

**API v1**（CLI 参数放在 UTF-8 JSON 文件，CLI 绝不自动 retry）：

- \`bridge.status\`：扩展身份、Native bridge 状态、已登记 Host 列表。
- \`target.current\`：需指定或唯一选择 Host，返回实际 \`registrationId\` 与 \`target\` 快照。
- \`script.save\`：\`scriptId\` / \`expectedRevision\` / \`sourceUtf8\`；复用已有 Controller Revision CAS。
- \`run.start\`：\`source:{kind:'draft',sourceUtf8}\` 或 \`source:{kind:'saved',scriptId,revision,contentHash}\`、精确 \`target\`、\`params\`、可选 \`deadlineMs\`；返回 \`runId\` 和 \`completion:'PENDING'\`，**不是业务成功回执**。
- \`run.get\`：仅对本 Agent 已确认归属的 runId 读取原 Controller 持久 snapshot。
- \`run.stop\`：只停止本 Agent 已确认归属的 runId；走相同 RunHost Stop。

\`target\` 必须来自相同 Host 最近实际 CurrentPage 观察、且在运行时二次核对 \`windowId/tabId/frameId/documentId/URL/origin\`；站点须已有 Chrome grant。外部请求不能批准 Candidate 或 Available，亦不能替换正式 Worker。外部保存脚本与 Task 发布无关。

## 幂等和未知效果合同

SW 在转发每条外部**变更请求**（\`script.save\` / \`run.start\` / \`run.stop\`）之前，在 \`chrome.storage.local\` 的 \`opendesk.native-agent.ledger.v1\` 持久保存外部 requestId、规范化输入 SHA-256、Host registrationId 与 \`OUTCOME_UNKNOWN\` 栅栏。只有真实 Host 回包后填充 result/runId。相同 requestId+digest 只复用原回包或返回未知，不重新执行；不同 digest 返回 \`E_REQUEST_CONFLICT\`。日志容量 256：满额拒绝新请求、不随意丢弃可能存在的副作用记录。

SW / Native / CLI 断连或者超时，只返回 \`OUTCOME_UNKNOWN\`，不能重放；这不意味着页面动作一定成功。只有得到原有 Controller terminal run/result/retirement 的原始证据，才能声称完成。

## 安装与安全

macOS R1 源码安装目录预定 \`~/.opendesk-browser/native-agent-r1\`，使用独立 Native manifest 名称 \`com.shopable.opendesk_browser.agent\`，Chrome \`allowed_origins\` 绑定本次 Extension ID。不要采用旧 Demo ID。\`setup\` 复制本机 Node 组件快照至私有目录，并将证书式随机令牌写在 0600 文件；Native Host stdout 仅允许 UTF-8 长度帧，诊断走 stderr。Host 进程同时作为本地 Broker，不需要二次启动。

**最新实施状态（2026-10-08）：** `native-agent/native-host.mjs` 已在现有 PR #11 分支，Linux/Node 模拟 IPC 与权限/Service Worker/Host 组件测试成功。为严格保留原 **320 KiB** `sw.js` 上限，改为只加载固定的扩展内部 `native-agent/transport.js` 经典脚本：`src/entrypoints/transport.js` 通过 WXT 打包，`src/native-agent/transport.js` 仅注册配置/宿主回包监听并调用原来的 Native Agent Service，复用同一受权 `hostPorts` 和 RunHost，不建第二业务 Controller。`scripts/build-contract.mjs` / `wxt.config.mjs` 固定 **13 个**源码入口；`scripts/verify-package.mjs` 仅为 `sw.js` 中精确字面量 `importScripts('native-agent/transport.js')` 开小范围例外，拒绝远程、动态和其它 importScripts。GitHub Actions 在 `c3e6e0387fa9c0c468008e36ac9bf86edbf51c0a` 的 Native、Sidebar、依赖、站点授权 4 项均通过，其中 Native CI 记录 `npm run check`、生产/开发 build、verify 均成功，未扩大 SW 预算。**这些仍是 Linux CI/Node 级别。真实 macOS setup/doctor、Chrome Native Messaging、Options 可信点击、真实网站授权、Codex draft/saved/Stop/Result 和断连重启行为一律 `NOT_TESTED`；不得标记 `NATIVE_PASS` 或合入 main。**

下一阶段：\`docs/framework/prompts/goal-native-agent-local-acceptance-r1.txt\`。

## 还需核实的反方问题

1. 需要实证 \`chrome.runtime.connectNative\` 在可选权限首次批准后无需刷新 SW 即可调用、Native manifest 路径和稳定扩展 ID。
2. 无 SW 持久监听 Host ACK 的情况下，极小窗口内回包丢失仍可能只有关联日志 \`OUTCOME_UNKNOWN\` 而无 runId；不能因此再执行。可在受控 Controller read-only run journal 内用 requestId 对账，但不能建立新的执行旁路。
3. \`chrome.storage.local\` 相关日志需要显式人工备份、清理策略和原生重启核对；容量达到上限应 fail closed。
4. 必须在同一真实版本 Chrome 和 CI 对齐所有打包文件 SHA、Manifest options 页、Native Host 脚本快照，不将 source check 作为运行证据。
5. PR #9（Sidebar R5）已经合并；PR #7 已关闭但未以原 PR 合并。新的 main 已有集中站点授权代码，候选已逐项保留 `siteAccess` 初始化、权限检查和生命周期清理。下一轮必须核对现行站点授权 UI 与 Agent `permissions.contains` 的一致性，不把 Native 接入当网站授权。
