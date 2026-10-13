# OpenDesk Browser Cookies R6：框架接口优先任务

> **R8 必补设计差异**：[R8 架构](../../api/browser-sdk-architecture-r8.zh-CN.md) 已明确内置 Cookie Editor 如果仍在 `src/sidebar-tools/bridge.js` 的普通 Sandbox 运行，不能自行声称 `BUILTIN_TRUSTED`。此外现有 `browser.events.read` Schema 是网络观察的 `request/completed/failed`，**无法直接读取 `chrome.cookies.onChanged` 的 Cookie 事件**；建议增加单独 `browser.cookies.observe.read`（第 11 个候选，未进入原 10 项和正式 35 项），先批准独立 Schema/Host 与权限再实施，禁止用已存在的 observe.start/getStatus/stop 冒充完整观察能力。

> [四层总账](../../api/browser-framework-four-layer-ledger.zh-CN.md) 的 P0 实施子任务。**不以 Cookie Editor UI 或本地数据演示作为成果。**

## 当前状态
- Chrome Manifest 已声明 `cookies`，最低 Chrome 138；站点级 Host/用户授权仍须单独确认。
- Driver（R8 已扩展）：`src/platform/chrome/cookies.js` 保留 Controller 原 `getCookies/setCookies/deleteCookiesByUrl`，同时新增 `get/getAll/set/remove/clearSite/getStores/getPartitionKey` 的受信驱动与回读验证。R7 通过既有 Browser Host 接线，仍需 Chrome 原生验收。
- 正式公开 Browser SDK **0/10**：R7 已将十项候选接入 **Host-only 私有调用路径**，但未向任意已安装工具公开，原 35 项 Registry 不变。R7 单元测试只证明逻辑接线，尚未取得相同候选的真实 Chrome 端到端证据；不能标记完成。
- 受信 UI 入口在 `src/ui/tool.html` 的「工具 → Cookie 管理」中，`src/ui/trusted-cookie-workbench.js` 与 `browser-cookie-host.js` 使用原有 `context-menus.js` Browser Host，通过 Chrome Sender、真实点击、活动 Document 与 Cookie/站点权限复核，**不向沙箱传 Cookie 值**。

## 真正需要实现的 10 项接口

| 阶段 | 具体方法 | 实现/验收要求 |
| --- | --- | --- |
| P0-A | `cookies.get`、`cookies.getAll` | 真实 Chrome 查询，精确 Origin/Document、Name/Path/HostOnly/Domain/StoreId/PartitionKey，有界脱敏结果 |
| P0-B | `cookies.set`、`cookies.remove` | 复用旧 Driver，校验 Secure/HttpOnly/SameSite/Expiry、`__Host-`/`__Secure-` 前缀、分区及回读 |
| P0-C | `cookies.clearSite` | 逐 Cookie 用户批准、准确范围、部分失败和未知效果；不允许重复执行未知删除 |
| P1-A | `cookies.getStores`、`cookies.getPartitionKey` | Chrome 版本适配，不泄露无关 Tab ID/Store 数据 |
| P1-B | `cookies.observe.start/getStatus/stop` | `chrome.cookies.onChanged` 可信 Worker 事件、单站过滤、界限、丢失/撤权/重启生命周期 |

## 必须保持的权限边界
- BUILTIN_TRUSTED 第一阶段；可信来源必须由 Chrome Sender、真实 UI 用户点击、权限/工具安装身份共同认证，不能由脚本 self-assert trust。
- 不能把 Manifest 的 `cookies`、`<all_urls>` 当作 Cookie Editor/第三方工具的默认授权。
- 同 URL 新 Document、导航、撤权、停止、Worker 间断时失效；敏感 Cookie 值不得泄漏到不可信 iframe/日志/草稿。
- `getAll({url})` 不是“站点 Cookie 全量”承诺；先核验 Cookie Domain/HostOnly/Path、分区 Cookie 和 Cookie Store。
- PartitionKey Chrome119+、hasCrossSiteAncestor130+、getPartitionKey132+、publicSuffix153+（仅可选，需支持 Chrome138）。
- 任何原生修改/删除的未知效果不自动重放。

## 真实源码/测试路径
- SDK：`src/framework/sdk/browser-contract.js`、`browser-schemas.js`、`browser.js`。
- Host/授权：优先复用现有 Browser Host/Authority；`src/platform/chrome/context-menus.js`、`permission-gate.js`、`src/sw.js`。
- 驱动：`src/platform/chrome/cookies.js`；不要另建 Cookie Host 或权限数据库。
- 测试：新增正常读取/写入/删除/分区/事件、跨域权限拒绝、工具变化、Worker 和效果未知等用例；受控 Chrome for Testing 使用虚构登录标识，记录真实回执、包 Hash 和源码 SHA。
- 只完成 Schema/Doc 不计入 IMPLEMENTED；Node PASS 不晋升 Mac Chrome 原生 PASS。
