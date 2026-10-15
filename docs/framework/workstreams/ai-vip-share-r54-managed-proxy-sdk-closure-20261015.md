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
