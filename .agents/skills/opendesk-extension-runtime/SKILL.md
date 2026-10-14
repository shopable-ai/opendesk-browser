---
name: opendesk-extension-runtime
description: Engineer Chrome MV3/WXT Background/Content/MAIN, SDK/Host/Authority installation, revocation and lifecycle across Controller/Page/Side Panel/Native. Own shared Page Program Authority implementation; not first-party feature logic, unified-list UI, sandbox app packaging or user program publishing.
---

# OpenDesk Browser · 扩展管理员多运行环境与 Chrome API 工程

## 触发范围：维护扩展，不是给用户写脚本

当用户要求修改 OpenDesk Browser 自身 Chrome 插件的 `background / service worker`、Content Script、`page / Controller`、浏览器原生 API、权限、消息桥、扩展入口、WXT Manifest、Native 连接或跨运行环境行为时触发。解决常见混淆：**代码在哪里编译、在哪里实际执行、谁检查来源和授权、结果由谁接收**。

现行五 Tab「我的 / 扩展 / 工作流 / 开发 / 云控」见 [R4 产品规格](../../../docs/product/sidebar-ui-spec.zh-CN.md)。扩展中心是一处管理入口，不能因此让每个应用独立成为 Chrome Extension 或直接拥有 SW/Content 权限。纯 Side Panel/设置/Marketplace 排版用 [扩展 UI Skill](../opendesk-extension-ui/SKILL.md)；第一方 Stay Focus/Time Review 业务与可信 UI 准入用 [可信功能 Skill](../opendesk-trusted-sidebar-feature/SKILL.md)；用户在“开发”输入 JS/React/Vue 则用 [脚本 Skill](../opendesk-script-authoring/SKILL.md)；动态应用包归 `opendesk-sidebar-tool-dev`，Page Program 正式安装归 `opendesk-program-publish`。本 Skill 是既有工程体系的维护规范，不是新 SDK、Host、Runner 或权限注册表。

## 必须先读的权威事实

先检查当前 `main`、`AGENTS.md`、`docs/framework/testing-guide.md`、对应工作流、当前 diff/共享构建资源。按任务读取：

- `docs/api/browser-sdk-prelaunch-contract-20261013.zh-CN.md`：预发布 API 统一、Chrome 官方语义优先、旧接口只迁消费者不保留重复兼容；
- `docs/api/runtime-globals-and-preinstalled-libraries.zh-CN.md`：Controller/USER_SCRIPT/宿主/SW/iframe 可用变量的不同世界；
- `docs/architecture/browser-framework/current-and-target-framework.md`、`docs/architecture/browser-framework/plugin-capability-architecture-r8-adr.zh-CN.md`；
- `docs/architecture/browser-framework/script-runtime-and-dependencies.md`、`docs/architecture/browser-framework/custom-tool-ui-and-local-development.zh-CN.md`；
- 真实源码 `wxt.config.mjs`、`manifest.json`、`src/sw.js`、`src/entrypoints/`、`src/framework/ChromePage.js`、`src/framework/sdk/`、`src/platform/host/`、`src/scripting/user-scripts/`、`src/ui/`、`native-agent/`；只调查本次有关的模块。

**旧 `src-bex` 只读**。新代码需要满足最新 Browser SDK 审定合约，不能盲目迁入旧 `chromePage` 接口或旧的 Source/Worker 全局。文档中的“目标”不等于源码已有、Node PASS 不等于实际 Chrome PASS。

## 先出“代码执行位置与调用电路”，再改跨世界源码

按用户需求为每段代码标注：`source owner` → `build entry` → `runtime world` → `RPC / sender` → `Authority` → `result/stop owner`，不要把 JS 都统称为“在浏览器后台运行”。

| 世界/位置 | 真实职责 | 不应拥有 |
| --- | --- | --- |
| MV3 Service Worker / Background | 受信扩展事件、平台消息路由、原生 Alarm/规则/后台业务；可能被 Chrome 挂起与恢复 | 可直接访问的网页 DOM、永久常驻内存、用户脚本任意源码的特权执行 |
| Content Script / ISOLATED 桥 | 已审核、具站点/文档身份的网页观察/受限桥；交付给正确的 Host | 任意宿主 API、跨站无授权操作、把 MAIN 等同于 ISOLATED |
| 网站 MAIN | 网站自身对象及经严格约束的固定桥能力 | 扩展 SW/Side Panel 权限、Controller `page`、自动注入的私有全局 |
| Page `USER_SCRIPT` | 用户已许可网站的 DOM / 受管 Page UI / 明确 Stop | Controller 的 `page/params/axiosx`、直接扩展 `chrome.*` 全局、Sidebar Tool `request` |
| Controller 独立受控 Worker | Playwright 风格 `page`/Locator/`params` 和受限运行结果 | 网站 `document/window`、特权 `chrome.*`、把 Controller 代码直接注入 MAIN |
| 可信 Side Panel / 扩展页面 | 静态编译的页面 UI、实际 Chrome 用户手势与受信 Host 连接 | 运行动态用户/市场工具包源码并允许直接访问 `chrome.*` |
| 「扩展」应用：动态 Sidebar Tool opaque-origin iframe | 已验证包自有 UI、`OpenDeskTool.root/request` 的被审桥能力 | 任意 Chrome/Native/网页 DOM 直接权限 |
| Native Go / 授权 Node Provider | 已授权本机来源/文件、Native 协议和有界开发服务 | 未授权磁盘访问、云聊天指令直接签发本地权限 |

选择环境必须基于**行为、生命周期和信任关系**，不能因为“Background 好实现”就塞入全部任务，也不能因关闭 Side Panel 需要持续运行就使用 UI 计时器模拟后台。Controller `page` 是 Worker 词法对象/受控消息路径，不是网站 `window.page`；不要误称一切都在 Content Script 直接运行。

需要解释旧/新实现时输出两张真实路径图，列出旧 `chromePage` 到现有 `page / RunHost` 的职责对应，并标记 `SOURCE_CONFIRMED`、`RUNTIME_TESTED`、`UNKNOWN`，不靠假定的原生调用图。

## Chrome 官方 API、来源与生命周期的硬门槛

1. **Chrome 官方命名/语义优先**，先读取现有 `SDK Registry/Contract`，避免同一能力二次封装/重复别名。涉及 API 清理时迁移所有真实消费者、示例、测试和当前文档；不创建第二 SDK/RunHost/Authority/Broker。
2. **每条消息**必须核对真实 extension/sender、tab/window/`documentId`、站点 `origin`、安装版本/代际、能力、当前有权目标和必要的真实用户手势。`id`、`capabilities`、市场“官方”、客户端声称的 Host 字段都不能替代服务端权威。
3. **授权撤销和生命周期**覆盖导航、SPA/BFCache、标签页关闭、SW 休眠/重启、Native 断连、取消/Stop 和迟到回包。`PENDING` 不是成功；未知副作用保守只读对账，不能盲目重发执行。
4. **CSP/MV3**：不能把任意远程 JavaScript 作为扩展特权入口执行；Chrome `userScripts` 的特殊用途与普通页面/宿主政策不同。只由已审核的固定 WXT entry 静态编译进入可信页面；第三方 JS/用户导入工具留在相应限制世界。
5. **构建目标**由 `WXT` 和既有静态输出合同管理：不私自增加 Manifest 权限、SW bundle、动态 loader、CDN 或第二 Node/Go Runtime。变化触及固定入口体积、资源哈希、独立 Standard/Developer 产物时分别审查，不只看 JS 文件编译成功。
6. **权限最小化**：区分 `permissions`、`optional_permissions`、`host_permissions`、用户网页脚本开关和各 Program/Tool 的独立许可，避免从扩展“拥有全站权限”推导所有工具可以全站读取。

## 一次工程变更的最短闭环

- **事实表**：源码文件、构建入口、执行世界、来源与目标身份、信任边界、代码运行后结果/停止归属、当前观察到的真实缺口。
- **最小修改**：先修既有模块/消费者，保持一个真实入口和一条结果链，不建立重复 Registry、Host、Worker 或灰度兼容副本。
- **定向回归**：从 `tests/environment/browser-tabs-host.test.mjs`、`tests/environment/sidebar-run-host-build-boundary.test.mjs`、`tests/environment/native-page-program.test.mjs`、`tests/environment/runtime-globals-zero-arg.test.mjs` 及实际能力测试选择；如改 SDK/Controller，补相关 `tests/framework/browser-sdk-r106-native.mjs` 等已存在的真实 Chrome 驱动。
- **构建与扩展验收**：资源允许时按 `npm run check` → `npm run test`/影响测试 → `npm run build`/`build:developer`（若有关）→ 包 `verify` → Chrome 原生/用户 Mac 测试。提前核对共享 dist/Profile/测试端口占用；旧成功候选只有输入相同时可复用。
- **证据分级**：SOURCE_WIRED、NODE_PASS、BUILD_PASS、CHROME_NATIVE_PASS、MAC_NATIVE_PASS、INSTALL/ZIP_PASS、CWS_COMPLIANCE_REVIEW 分别记录候选 SHA、Extension ID、版本、包哈希、真实 runId/resultId/previewId 和失效路径；一项不得替另一项。

## 验收评分

架构唯一性、Chrome API 正确性、执行世界/权限边界、生命周期/Stop、实际可靠性、源码与包体积、原生测试证据分别**独立打分**。相关高风险维度要求每项 ≥95 才能称本轮产品达到 95+；未测试标 `NOT_TESTED`，发现未知原生结果就报告阻塞，不伪造通过。
