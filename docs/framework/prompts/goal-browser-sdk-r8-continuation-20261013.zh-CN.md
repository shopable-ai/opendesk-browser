# GOAL：OpenDesk Browser R8 续接实施 — 完整 Chrome API 与统一 Browser SDK

日期：2026-10-13。默认中文。

## 目标与执行约束

**继续修改真实源码，而不是重新设计第二套框架、停留于接口清单或下一份提示词。** 仓库：https://github.com/shopable-ai/opendesk-browser ，用户 Mac 目录（仅在实际可访问时）：`/Users/shopme/Documents/workspace/opendesk-browser`。唯一允许写入分支 `main`。按 `AGENTS.md`：不自建分支/worktree/PR、不强推或执行破坏性 reset/clean；修改前检查最新 HEAD、本机未提交工作和其他并行 Agent，安全测试通过后才提交推送。

**当前 R8 已有实际成果，不要从零重做：** 已固定 Chromium JSON 的首批 8 个 Namespace（不是全量 Chrome），使用 `scripts/sync-chrome-api-catalog.mjs` / `--check` 与 `docs/api/chrome-native-api-{sources,catalog}.json`；35 项正式 Browser SDK 有现成的 `browser-sdk-compatibility-map.json`；现有 WXT 和 Authority/Host 仍复用。执行前必须重新检查最新 `main`，不要依据这里的静态数字判断今天的状态。

## 第一批必读

- `AGENTS.md`、`docs/framework/testing-guide.md`、`docs/framework/parallel-development.md`
- `docs/api/browser-sdk-architecture-r8.zh-CN.md`、`docs/api/browser-sdk-open-source-reuse.zh-CN.md`、`docs/api/browser-sdk-compatibility-map.json`
- `docs/api/chrome-native-api-sources.json`、`docs/api/chrome-native-api-catalog.json`、`scripts/sync-chrome-api-catalog.mjs`
- `docs/framework/workstreams/browser-sdk-r8-execution.json`、`browser-sdk-acceptance.json`、`browser-sdk-status.md`
- `src/framework/sdk/browser-contract.js`、`browser-schemas.js`、`browser.js`
- `src/sidebar-tools/bridge.js`、`src/ui/sidebar-tools.js`
- `src/platform/chrome/context-menus.js`、`cookies.js`、`browser-tabs.js`、`permission-gate.js`
- `src/platform/host/authority.js`、`sdk-broker.js`、`src/platform/downloads/`、`src/platform/storage/` 和现有 Scheduled Tasks、`manifest.json`、`package.json`

## 必须遵守的架构

唯一开发者入口 `OpenDeskSDK.browser`。唯一可信执行通道是既有 Bridge → Trusted Host / Authority → Chrome Driver；原有 35 项正式接口的签名、返回、错误和授权行为保持兼容。官方 Native Catalog 只提供离线发现/差异/类型生成，不自动生成任意 `chrome[namespace][method]` RPC。

Google `chrome-types` 仅为候选的开发期类型复用来源；WXT `0.21.4` 保留；`webext-core` 按模块许可证、版本和冲突成本判断，**不新建**第二套 Broker/Storage/Scheduler。最低 Chrome 138；`runtime.onMessage` 异步回执必须兼容 Chrome 138，不能假定 148 的 Promise listener 已经全量可用。

普通第三方工具沙箱（包括当前沙箱中的官方 Cookie Editor）不能自称 `BUILTIN_TRUSTED`。Cookie 明文等敏感数据只能由真实可信扩展 UI 的 Chrome Sender、用户操作和 Host 专项授权获取。

## 严格按价值/依赖顺序继续

1. **P0 安全核查 + 测试现有 R8 生成器**：检查 pinned Chromium JSON blob 哈希、离线 `--check`、现有 Catalog Schema/回归测试和真实 CI；不篡改历史冻结通过项。
2. **P0 官方 API 全目录**：继续补齐 Chromium IDL 与缺少的 Namespace，复用上游已有解析工具；修复自动 diff / 来源/版本/权限/环境信息，并明确未知字段，不把未验证的 Chrome 138 功能标为支持。可离线重放，生成器不进 Service Worker。
3. **P0 Cookie 真正 Host 闭环**：原地增强 `createCookieService()`，建立可信内置扩展 UI/Host → Authority → `chrome.cookies`。原历史 10 项：get、getAll、set、remove、clearSite、getStores、getPartitionKey、observe.start/getStatus/stop；另外必须完成 Cookie 事件的**可读取路径**。既有 `browser.events.read` 只支持网络事件 Schema，优先把 `browser.cookies.observe.read` 作为额外候选审核后实现，不能未经授权增加注册表。验证 HostOnly/Domain/Path/Partition/StoreId、敏感值脱敏、撤权、Worker 重启与未知副作用。
4. **P1 高价值组**：Tabs 自有 getActive/reload/navigate/duplicate/pin；Downloads 自有查询/取消/打开/完成回执；Permissions 显式站点/能力授权；Storage 工具隔离 Facade；Scheduler 复用既有 Scheduled Tasks + Chrome Alarms。
5. **P2 其余 Chrome 能力**：Windows、TabGroups、Bookmarks、History、BrowsingData、WebNavigation、Scripting、DNR、ReadingList 等以真实需求和安全等级排序。Debugger/Proxy/Native Messaging/Enterprise/ChromeOS 可以在全量目录登记为 HOST_ONLY/UNSUPPORTED/OUT_OF_SCOPE，不能漏项或强制公开。
6. **持续验证**：每个接口必须分别证明正式注册、Host/Authority 正反向、Chrome Driver、撤权/升级/导航/Worker 生命周期、原生结果。运行受影响 Node 测试、`npm run check`、必要 Build/Verify、可用时真实 CFT。只给 Node PASS 不给 Native PASS。
7. **持续提交**：每组通过后检查最新 `main`、并行文件与测试产物占用，安全时提交 push，更新 `browser-sdk-r8-execution.json` 与正式账本。遇真实冲突只读核查和说明，不自行开分支；无法接入 Mac 标记 `NOT_TESTED`。

## 必须提供的最终结果

按四层独立报告：①官方 Chrome Namespace/Method/Event/Property 实际发现数量与未覆盖；②实际 Driver/Host 接线；③正式 SDK 已公开/未公开；④逐项 Node/Native 原始证据。并报告 Cookie 事件读取、开源依赖的实际固定版本和许可证、修改文件、Git SHA、CI/构建、提交和剩余具体阻塞。**不以综合百分比、漂亮的目录或 95 分主观判断代替真实完成证据。**

