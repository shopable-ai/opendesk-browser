# OpenDesk Browser SDK R11.x × AI VIP Share R5.4 — Managed Proxy source/verification record

- 日期：2026-10-15；Owner：本次 R5.4 GitHub 对话；分支：main；状态：**PARTIAL**。
- 起始源码：公共代理 Driver `src/platform/chrome/browser-managed-proxy.js` blob `a17c4898999a29432c1c01b8c544d7cda6b523ce`；对并行 SDK R11.6 Registry/Schema Owner 文件只读，不覆盖其改动。
- 本任务写入：`src/platform/chrome/browser-managed-proxy.js`、`tests/environment/browser-sdk-managed-proxy-r54.test.mjs`、本独立工作记录。没有占用 Mac、Chrome/CFT Profile、7897/7898、dist/development、Git 本地索引或 watcher。

## SOURCE FIRST：公开 SDK 的当前代码调用链

1. 独立工具 `src/sidebar-tools/bridge.js` 构建 `OpenDeskSDK.browser`；`src/framework/sdk/browser.js` 根据正式 Registry 自动投影方法。
2. `src/framework/sdk/browser-contract.js` 的 `browser.proxy.managed.getStatus/requestEnable/requestDisable` 是批准的有限操作；`browser-schemas.js` 验证声明式配置。并行 R11.6 Owner 已自行修复重复 Schema 损坏（提交 `85f09d0a498c`），本任务未改其文件。
3. `src/ui/sidebar-tools.js` 使用真实可信 Side Panel 确认；`src/platform/chrome/context-menus.js` 按 sender、hostInstanceId、toolInstance、已安装 packageHash、installEpoch、enabled 状态、Chrome proxy 权限检查，复用 `createApprovedBrowserBindings`。
4. `src/platform/chrome/browser-managed-proxy.js` 独占 Chrome Proxy Driver，持久 journal、共享 legacy Web Lock、PAC、`settings.get/set/clear`、STOP readback 和不同安装所有权冲突；没有第二套 Driver。
5. `examples/sidebar-tools/ai-vip-share/src/main.js` 已改为消费该正式公共接口；生产 `APPROVED_PROXY_ENDPOINT=null`，会员 Provider 尚未接通，技术代理和商业权益不可互相伪造。

## R5.4 本次最小修复与测试边界

- 修复：已经持有未释放 Managed Proxy journal 的安装，在 Chrome proxy 权限丢失或其他扩展遮蔽时，状态仍返回 `canStop:true` 以保留显式 STOP/恢复入口。实际 STOP 始终按 Chrome proxy permission、独占 PAC 配置、控制权 readback 验证；绝不静默清理他人的配置。
- 新增 Node 定向测试，经公开 SDK Facade → Registry normalizer → Approved Binding → 公共 Driver 的模拟 Host 授权合同；覆盖独立工具启停、PAC 分流、未授权拒绝、非法端点、跨工具所有权、未知 ENABLE 回执、权限撤销及 Worker reconcile、Web Lock 缺失。
- 测试使用非 Chrome 的受控 Fixture，不是 Chrome Native 网络验收，也不验证全部真实 Side Panel 安装和可信点击（Host 自身仍需真实浏览器验证）。

## 严格分级：外部依赖与未完成事项

| 事项 | 状态 | 理由 |
|---|---|---|
| 正式 SDK 三接口 + Consumer 源码路径 | SOURCE_WIRED | 源码可追溯，不代替真实环境加载与成功回执 |
| SDK/Driver 新 Node 测试 | NOT_TESTED | 以本次提交后的独立 Actions 运行或本机定向运行结果为准 |
| 全量 npm run check / production/dev build | NOT_TESTED | 本会话无可运行的用户 Mac 仓库；不能误用旧候选通过记录 |
| 7897 HTTP CONNECT/SOCKS5 原生出口 | BLOCKED | 需先在用户 Mac 判定真实协议与可达性，生产配置不允许 loopback |
| 7898 本地会员 Provider | SOURCE_WIRED | 已存在 fixture 与测试，商业真实 Provider 未配置 |
| Chrome/CFT 隔离 Profile Native | BLOCKED | **LOCAL_NATIVE_REQUIRED**：本执行环境无用户 Mac/Chrome 网络入口 |
| 生产会员权益 + 代理 Profile 信誉验证 | BLOCKED | 正式商业 Provider、已审代理端点与域名审核流程尚未完成 |

## 安全阻塞和剩余设计约束

- 虽然 SDK 配置有域名/端点语法限制及独立 Host 可信点击，尚未以冻结候选证明任意公共端点与目标域名的 **生产级 Profile 审核**；严禁把“有点击”和“Provider/节点已通过审核”等同。
- ENABLE 在已取得 Host 初次授权以后、等待持久化或全局锁期间的撤权栅栏，需要专项竞态及原生验证；STOP 与在途 ENABLE 的优先级也未证明全部失败交错。
- `chrome.proxy.onProxyError`、网络实际通过代理、DNS/WebSocket 与代理失联行为、Chrome Worker 重启均需要原生收集。
- 旧 `src/ai-smart-access/{policy,lifecycle,service,tool-host,host-controls,provider-config}.js` 目前仅为旧 `ai.access` 兼容与安全退出；不得在 Native 验收和依赖审计前删除。保持旧/新状态所有者经同一历史锁和 legacyHold 冲突栅栏隔离。
- 不允许部署任何生产 localhost:7897 或普通 HTTP 会员 Provider 后门。本记录不授权重复 watcher、修改 Mac 日常代理、覆盖 SDK Owner 文件。

## 本地可复核命令（尚未执行，不能记 PASS）

```bash
node --test tests/environment/browser-sdk-managed-proxy-r54.test.mjs
node --test tests/environment/ai-vip-share-r21-lifecycle.test.mjs
node --test examples/sidebar-tools/ai-vip-share/dev/local-test/local-fixture-server.test.mjs
node scripts/check-browser-sdk-freeze.mjs
npm run check
```

验收等级须与实际提交 SHA、原生设置读回、7897 出口日志、7898 模拟合同分离。资源占用：无；Git 提交仅在 GitHub `main` 执行一次正常快进更新。

## Managed Proxy SDK R1.1 — 2026-10-16 · 安全增量（以本候选 CI/Chrome 为准）

- **Profile fail-closed**：可信 Host 的 `src/platform/chrome/browser-managed-proxy-profiles.js` 审批列表为空；尚无商业 Provider 审核批准。新 ENABLE 即使已获 Chrome 权限、工具 capability 与可信点击，仍被 `E_PROXY_PROFILE_NOT_APPROVED` 拒绝。每个未来 Profile 必须在源码审阅中登记 `reviewId/reviewedAt/reviewedBy/toolId/packageHash` 和精确端点、域名全集，不接受 sandbox 自报 `validated:true`。
- **撤权栅栏**：现有 Host 在全局 Proxy Lock 内重验工具身份、启用状态、epoch、capability 与 Chrome 权限，持久 applying journal 后与 Chrome set 前再次重验身份/控制权；未确认时保留明确 STOP 路径。不增加第二个 SDK/Host/Driver，不将生产校验放宽到 loopback。
- **用户实际点击**：Browser 级 ENABLE/STOP 必须来自可信 Side Panel 真正的 `isTrusted` 点击。旧 journal 的 STOP、卸载与 Worker 恢复不受生产 Profile 空名单影响。
- **测试范围**：补充 Node 未审 Profile、未批准端点/包哈希、缺 Host 回调、等待全局锁期间撤权、持久化后撤权、旧状态 STOP。当前用户 Mac / Chrome / 7897 / 7898、商业权益、旧六模块安全删除仍 **NOT_TESTED / BLOCKED**；不得将历史 PASS 计入新候选。

### R1.1 已观察到的严格 CI 证据（2026-10-16）

- 候选 `b89c9093a0f55405ba95ee00f5875a3c8daea6d6`：Browser SDK R5 workflow [38771127654](https://github.com/shopable-ai/opendesk-browser/actions/runs/38771127654) 的 `sdk-host-contracts` **PASS**，包含 Managed Proxy Driver/Host Node 模拟测试、SDK bindings 生成/冻结检查、源代码验证；`sdk-product-bundles` **PASS**，包含 `npm run build` / `build:dev` / `build:size` / `verify`。该 CI 在 GitHub Linux runner 执行，**不是 Mac 原生 Chrome 网络证据**。
- 候选 `b89c909`：Sidebar tools R1 job `ai-vip-share-r5-candidate` 因工作流仍期待 **1.2.0** 而失败（实际正式工具 `tool.config.json` 是 **1.3.0**），与 Proxy Driver 无关。已在 `84ce91cb3d04b9ca9457d4d9e50f79fea8aa9e17` 对工作流的精确版本、输出路径和 production package diff 一并更新，未降低严格比对门禁。修复后的候选 CI 状态以其后续运行结果为准。
- R5 专项补充将 `tests/environment/browser-sdk-managed-proxy-r54.test.mjs` 与 Driver、Host 两套 Node fixture 放在同一步骤执行，确保公共 Facade → Binding → Driver 的正反向测试不被跳过。该新增 CI 测试必须以本次 workflow 修改后的 SHA 运行结果判定。

### R1.1 权限撤销下的正式 SDK STOP 修复

- 在原有 Host `verifyBrowserOwner` 保留工具 capability、已安装 packageHash、installEpoch、启用状态及可信用户点击校验的前提下，**仅** `browser.proxy.managed.getStatus` 和 `browser.proxy.managed.requestDisable` 可在 `proxy` 权限缺失时进入 Driver。实际 Chrome settings 的读取、清理和精确 PAC 所有权核验仍由 Driver 严格要求 `proxy` 权限。
- 权限丢失时 `getStatus` 返回 `permission:false`、拥有者 `canStop:true`；用户真正点击 STOP 后先持久化 `stopping`，等待权限恢复由 Worker 恢复处理，不允许直接清理或覆盖其他代理。ENABLE 无此例外。
- 增加 Host→Facade→Driver Node 回归：代理启用、撤销权限、查询状态、可信 STOP 写意图、禁止 Chrome clear、权限恢复后 reconcile 释放。结果以此提交后 CI 为准。

### R1.1 R5 CI 首次扩大覆盖后的真实失败及修复

- `f401738eac0be409c8293b1c400a36896b7a3875` 的 [Browser SDK R5 run 38772097189](https://github.com/shopable-ai/opendesk-browser/actions/runs/38772097189)：新增 `browser-sdk-managed-proxy-r54.test.mjs` 后，25 条 Managed Proxy Node 测试中 **24 PASS / 1 FAIL**；失败源于 fixture 将 SDK 对非法 `scheme` 的同步 `E_SCHEMA` 抛异常当作异步 Promise rejection 捕捉，非真实 Proxy Driver 行为失败。修复仅调整拒绝断言捕获同步/异步异常，不改变验证规则或 Host 权限。以修复后的新候选 CI 为准。

### R1.1 旧代理生命周期 Node FIFO Web Locks fixture 修复

- 专项 [Sidebar tools R1 run 38771791623](https://github.com/shopable-ai/opendesk-browser/actions/runs/38771791623) 中旧 R2.1 test fixture 从 Node `globalThis.navigator.locks` 直接获取原生 Web Locks，GitHub Linux Node 环境不可用，故 21 条历史代理生命周期测试报 `E_TOOL_LOCK`，并非 Chrome Driver 测试失败。只在 `tests/environment/ai-vip-share-r21-lifecycle.test.mjs` 引入具备实际 FIFO、跨上下文共享命名锁与 `query().pending` 的测试专用锁模拟，**保留无锁拒绝原断言、不更改生产 Host 安全约束**。结果以该提交后 Actions 实测为准。
- 同一运行另有 4 条 `sidebar-tool-multiscript-r72` 的语言 DOM mock 错误，属于并行 Sandbox 工具测试，不能归类 Managed Proxy 失败；本任务不修改无关模块。

### R1.1 CI 验收覆盖增补（不新增架构或关闭门禁）

- R5 Host 专项将已有本地模拟 Provider `local-fixture-server.test.mjs` 与原始线路 `proxy-line-probe.test.mjs` 放在同一候选执行，A/fixture 与真实 Chrome PAC B、正式 SDK C 仍严格分级。
- Sidebar 工具专项加入已经确认 HTML 预览 `preview/test-r41.mjs` 与 `preview/test-ui.mjs` 的现有 Node 交互回归，继续保持安装包 1.3.0 精确版本和 production JSON 二进制级一致比较。
- 尚未完成的隔离 Chrome 7897/7898 原生流量、代理失效网络 fail-closed，以及预览与真实 Side Panel 人工验收不能被这些 Node fixture PASS 代替。

### R1.1 旧代理生命周期 CI 结果与测试同步修复

- [Sidebar tools R1 run 38773039387](https://github.com/shopable-ai/opendesk-browser/actions/runs/38773039387)：引入 test-only FIFO Web Lock 后，270 条中 **265 PASS / 5 FAIL**；相较原 25 FAIL，历史 `E_TOOL_LOCK` 失败大幅消失。最后 1 条旧 STOP race 因原测试轮询 `setImmediate` 30 次太快，未能在异步工具 SHA 检查后观察到等待中的锁请求。修复提交 [8d6b3af](https://github.com/shopable-ai/opendesk-browser/commit/8d6b3afc9de18425f9133048fe91380e0ae16b4a) 将等待改为每 10ms 读取真实 `locks.query().pending`、最多 1.5 秒，超时继续 FAIL，未取消竞态证明或更改生产锁逻辑。另 4 条属于多脚本 Sandbox DOM mock，与 Proxy 任务区分。新候选以 CI 实际运行结果为准。
- [Browser SDK R5 run 38772602668](https://github.com/shopable-ai/opendesk-browser/actions/runs/38772602668) 对 `a670290` 候选的 `sdk-host-contracts`、`sdk-product-bundles` 均报告 **PASS**；[run 38773300409](https://github.com/shopable-ai/opendesk-browser/actions/runs/38773300409) 对增加本地 Provider fixture 的 `0e577277` 候选亦报告双 Job **PASS**。两者均为 GitHub Actions Node/Build 证据，非真实 Chrome。

## Managed Proxy SDK R1.3 · WEB-FIRST 源码及候选证据（2026-10-16）

本节只记录已经通过 GitHub 连接器写入 `main` 的改动与当时可见的 Actions 结果。起点 HEAD 为 `be2ad5faa26b5652afb35d7cab35867b1f618c12`；此后有多个并行项目持续快进 `main`。下列提交是本工作流的增量，不宣称组成一个静止的全仓库冻结候选。

| 本轮提交 | 原因及实际改动 |
| --- | --- |
| [`c68e3b15`](https://github.com/shopable-ai/opendesk-browser/commit/c68e3b15b50b5d306866374318ee0ea05a7e2fa9) | 多脚本 Sandbox Node DOM fixture 补齐真实 `document.documentElement.lang`，并新增语言切换不重新执行脚本的回归 |
| [`ad537c2a`](https://github.com/shopable-ai/opendesk-browser/commit/ad537c2ad850fa82965cf386cdcacd70794dabbe) | Sidebar Actions 追踪 DOM fixture 测试文件变动 |
| [`c892ee5f`](https://github.com/shopable-ai/opendesk-browser/commit/c892ee5fd1e7ad148dfbab211bc0d2419f24be46) | 新建独立 `tests/framework/browser-managed-proxy-chromium-pac.mjs`，A: SOCKS5 + 证书 TLS；B: 隔离临时 MV3 Chrome Proxy PAC 读回、真实 HTTP/HTTPS/WSS 出口、目标/相似域名以及代理中断 fail-closed |
| [`0787cbfa`](https://github.com/shopable-ai/opendesk-browser/commit/0787cbfa7291f97e8a32b9c09236766a154c796a) | 在既有 Browser SDK R5 Actions 中新增独立 Linux Chrome for Testing A/B Job，保留原始 Node/Build/冻结门禁及 SHA 绑定的 JSON receipt |
| [`0977ad55`](https://github.com/shopable-ai/opendesk-browser/commit/0977ad5516f65f493b483a61e3b2fe5070cc0eb7) | 可信 STOP 接受时撤销同一工具仍未使用的旧 ENABLE 手势授权，防止 STOP 后迟到的旧授权重新激活 |
| [`df72bad2`](https://github.com/shopable-ai/opendesk-browser/commit/df72bad2111b2e919e60d832c2e0397cf1ff1eb5) | 真实 Facade→可信 Host→公共 Driver 的 Node fixture 中新增旧 ENABLE 授权被 STOP 撤销与新点击仍可使用的断言 |
| [`c7fde33d`](https://github.com/shopable-ai/opendesk-browser/commit/c7fde33d2d46e712f5d7e358169db6ff33cdcc9a) | WebSocket 成功验收额外要求真实 SOCKS5 CONNECT 记录，杜绝仅凭 WSS 握手误认为经代理 |

### CI 归属与证据等级

- 历史候选 `1858f15b` 的 [Sidebar Actions 38775155128](https://github.com/shopable-ai/opendesk-browser/actions/runs/38775155128) 为 **266 PASS / 4 FAIL / 270**：四个失败都来自 `sidebar-tool-multiscript-r72.test.mjs`，错误为 `Cannot set properties of undefined (setting 'lang')`；定性 **SHARED_HOST_FAILURE / DOM fixture**，并非 Managed Proxy Driver 功能失败。此结果是修改前历史记录。
- 包含 Sandbox 修复的 [Sidebar 38778035955](https://github.com/shopable-ai/opendesk-browser/actions/runs/38778035955) 在记录时是 **QUEUED**，尚未证明 PASS。
- 首个包含新增 A/B Chrome Job 的 [Browser SDK R5 38779787342](https://github.com/shopable-ai/opendesk-browser/actions/runs/38779787342) 在记录时为 **QUEUED**，三个 Job 为 `sdk-host-contracts` / `sdk-product-bundles` / `sdk-real-chromium-pac`；此候选 **早于** STOP 竞态安全补丁及 WSS 代理日志补强，不能替代后续最新候选。
- 测试脚本只在临时隔离 Chrome Profile 写入代理，退出时读回 `chrome.proxy.settings.clear()`，不会修改用户 Mac、物理 7897、生产 Profile Registry 或现有真实代理。临时本会话隔离 SOCKS5→TLS fixture 已观察到握手成功，但不是 GitHub 工作流收据，更不是 Chrome 或商业线路证明。
- **生产受审 Profile 仍为空**，生产商业 ENABLE 必须 `E_PROXY_PROFILE_NOT_APPROVED`；临时浏览器测试的匿名 `pac-proxy.test` 端点完全不进入正式 `REVIEWED_MANAGED_PROXY_PROFILES`、SDK Schema 或生产构建。
- **A/B/C 严格独立**：截至本记录更新，提交后的 Actions A、B 均 `NOT_TESTED / QUEUED`；C（正式安装的 OpenDesk SDK + Side Panel 真实点击 E2E）`NOT_TESTED`；Mac Native `LOCAL_NATIVE_REQUIRED`；商业 Provider `NOT_CONFIGURED`。只有 GitHub Job 实际成功、原始证据与网络日志相互吻合，才可提升 A/B 状态。

### 旧 Host 六文件当前保留原因（逐文件）

| 文件 | 真实保留职责及退出条件 |
| --- | --- |
| `src/ai-smart-access/service.js` | `src/sw.js` 仍调用 `installAiAccessService()`；历史 RPC、订阅/租约及 Worker 恢复路径尚未安全完成迁移，**保留** |
| `src/ai-smart-access/policy.js` | 旧 PAC 身份、状态键、域名、代理匹配与迁移合同仍为历史安全恢复所需，正式新代理归公共 Driver，**保留** |
| `src/ai-smart-access/lifecycle.js` | 安装停用与卸载在 `installation.js` 仍使用历史 `stopAiAccessForTool()/cleanupUninstalledAiAccess()`，并经共享代理锁防止误清理，**保留** |
| `src/ai-smart-access/tool-host.js` | 历史 `aiAccess` operation 可信身份/授权适配，仍由存量入口间接使用，**保留** |
| `src/ai-smart-access/host-controls.js` | 历史可信控制面 UI/停止操作仍存在，正式 AI VIP Share 应继续迁移到唯一公共 SDK，**保留** |
| `src/ai-smart-access/provider-config.js` | 历史 Provider / 测试开关和审批前兼容合同；生产不能因此开放 localhost 代理，**保留** |

下一源码任务：取得 `sdk-real-chromium-pac` Job 的实际结果并检查 raw JSON 网络日志，修复真正复现的问题；在 C 级没有真实安装与可信点击回执前不可宣称 95+ 云端或正式产品上线。

## Managed Proxy SDK R1.4 · CHROMIUM CI REPAIR / REAL A-B ACCEPTANCE（2026-10-16）

本节只记录真正提交 GitHub main 的改动、同 SHA Actions 与原始 Artifact；并行 Owner 的更新不会被覆盖。本轮没有修改正式 Host/Driver/生产 Proxy Profile、AI VIP Share 的正式 UI，也没有操作用户 Mac 和真实代理。

### 已实施与复验的五个提交

| Commit | 真实变更 |
| --- | --- |
| [ef503377](https://github.com/shopable-ai/opendesk-browser/commit/ef503377371e62da885d8928555ea9cd9554a351) | Chrome 启动诊断：保存 stderr、PID、退出信号、参数与 DevToolsActivePort 状态。 |
| [e3558897](https://github.com/shopable-ai/opendesk-browser/commit/e355889799064b0d65497ef60aa76a79a349b3e7) | 在测试脚本及 browser-sdk-r5.yml 严格限制 GitHub-hosted Linux 主分支临时 Chrome 的 no-sandbox 回退，不涉及生产 SDK、Host 或用户 Chrome。 |
| [c19edd3c](https://github.com/shopable-ai/opendesk-browser/commit/c19edd3caf71b29c51f52f740653ab0520a455e6) | 追踪及销毁 HTTPS WebSocket 升级 socket，对 Socks、HTTP、WSS、Profile 清理设置有限时和可记录失败，要求 cleanup 完成才写成功收据。 |
| [6ea22477](https://github.com/shopable-ai/opendesk-browser/commit/6ea224779c6d04ce0f3cfbe921395b028f25fe30) | 移除浏览器全局忽略 TLS 证书错误，改为临时生成证书的 SHA-256 SPKI 公钥测试例外；补齐真实请求结果与出口后端日志。 |
| [7e10e8f8](https://github.com/shopable-ai/opendesk-browser/commit/7e10e8f8dbb3b31e35c3c82be7c0ceec24805afc) | A 阶段补上经独立 Node 完整证书验证的 SOCKS5/TLS 实际 HTTP GET、HTTP 200、正文和后端路径证明，不能仅凭握手冒充真实请求。 |

### 实际根因、失败分类与成功证据

1. [Run 38871566443](https://github.com/shopable-ai/opendesk-browser/actions/runs/38871566443)、[Artifact 12033289063](https://github.com/shopable-ai/opendesk-browser/actions/runs/38871566443/artifacts/12033289063)：Chrome for Testing 155.0.8059.39 在约 505ms 后 SIGABRT；stderr 明确为 FATAL No usable sandbox!；未创建 DevToolsActivePort。根因是 Runner 的 Ubuntu AppArmor / Linux user namespace sandbox 限制，并非安装路径或简单超时过短。
2. [Run 38871947392](https://github.com/shopable-ai/opendesk-browser/actions/runs/38871947392)：隔离脚本已完成 A/B 业务验证，但 Job 因 Node 顶层 await stopServer(httpsServer) 不退出、Exit 13 而失败；已追溯到未回收的 WebSocket 升级 socket。不得把当时报告的 A_B_PASS 当作 CI 成功。
3. [Run 38872346543](https://github.com/shopable-ai/opendesk-browser/actions/runs/38872346543)、[Artifact 12033663769](https://github.com/shopable-ai/opendesk-browser/actions/runs/38872346543/artifacts/12033663769)：真实 sdk-real-chromium-pac Job SUCCESS；A、B、原生代理释放、清理均 PASS，剩余升级 socket=0。
4. [Run 38872668345](https://github.com/shopable-ai/opendesk-browser/actions/runs/38872668345)、[Artifact 12033971189](https://github.com/shopable-ai/opendesk-browser/actions/runs/38872668345/artifacts/12033971189)：同 SHA 候选 sdk-host-contracts、sdk-product-bundles、sdk-real-chromium-pac 三 Job 均 SUCCESS；Chromium HTTPS 使用单证书 SPKI 例外而不是全部 TLS 放行；PAC/native readback、HTTP/HTTPS/WSS、相似域名 DIRECT、断线 fail-closed、clear 和 cleanup 均有对应证据。
5. [Run 38873022185](https://github.com/shopable-ai/opendesk-browser/actions/runs/38873022185)、[Artifact 12034730671](https://github.com/shopable-ai/opendesk-browser/actions/runs/38873022185/artifacts/12034730671)：7e10e8f8 的 sdk-real-chromium-pac Job SUCCESS；A 的 nodeTlsCertificateVerified=true 及 nodeTlsHttpRequestVerified=true，后端日志包含 /verified-node-tls；B、STOP 清理继续 PASS。本节记录时同 SHA 的 sdk-host-contracts 已 SUCCESS，sdk-product-bundles 尚在运行，不提前声称整条 workflow 成功。

### 严格门禁：通过、未测、必须保留

| 层级 | 2026-10-16 实证状态 |
| --- | --- |
| A：隔离 SOCKS5 + Node 已授权 TLS + 实际 HTTP GET | PASS，7e10e8f8；HTTP CONNECT 不被当前 SOCKS fixture 支持，不宣称通过 |
| B：CFT 155 MV3 原生 PAC 字节与 get 回读、HTTP/HTTPS/WSS、代理失联拒绝直连、STOP clear、完整清理 | PASS，7e10e8f8；测试身份是独立 MV3，不是正式 OpenDesk |
| C：正式 OpenDesk 安装包 + AI VIP Share 1.3.1 + 真实 Side Panel 点击 + Browser SDK/Host/Driver | NOT_TESTED，不允许被 A/B 或 Node mock 冒充 |
| ENABLE/STOP/revoke/Worker/跨扩展所有权 | HOST NODE COVERED；真正的 Chromium 多扩展控制权竞争与 Worker 重启仍 NATIVE_NOT_TESTED |
| AI VIP Share 1.3.1 UI 与 HTML Preview | 正式 tool.config.json 1.3.1、公共 Managed Proxy SDK 代理入口已在源码确认；正式已安装 Side Panel 截图/交互 REAL_NOT_TESTED |
| 生产会员 Provider 与受审 Profile | BLOCKED/NOT_READY；正式 APPROVED_PROXY_ENDPOINT=null，REVIEWED_MANAGED_PROXY_PROFILES 为空，新生产 ENABLE 继续被审批拒绝 |
| Mac Native | LOCAL_NATIVE_REQUIRED，不允许以 Linux Chrome for Testing 替代 |
| 旧 src/ai-smart-access 六个模块 | RETAIN：现有 src/sw.js 仍装载 installAiAccessService()，旧 journal/工具卸载 STOP/Worker 恢复的完整迁移证据不足，不安全删除 |

安全注释：GitHub-hosted Runner 的 no-sandbox 回退由脚本同时校验 Linux、GITHUB_ACTIONS、分支、事件、Runner 环境和显式测试开关，只用于隔离测试。浏览器端临时 SPKI 例外仍然是测试例外，不等同受信 CA；A 阶段独立 Node TLS 验证执行完整证书和域名认证。报告没有商业真实节点，7897 是独立 Runner 内受限 loopback，发生端口占用必须失败，不能修改其他进程。

**下一可执行任务**：复用正式构建产物和现有真实 Chrome 自动化，增加 C 级真实已安装工具及 Side Panel 用户点击的原生正反向测试，保留 packageHash、installEpoch、授权与 STOP 恢复回执。生产受审 Profile 空名单不能改；只允许独立测试构建中明确审过的临时 Profile。若 CI headless Side Panel 实际无法触达，记录 Chrome 限制并给出 headed/真实 Mac 验收阻塞，禁止伪造 isTrusted 或 95+ 评分。
