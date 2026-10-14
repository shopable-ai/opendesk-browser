# OpenDesk Browser：按用户功能领域理解框架

> **一级阅读导航 / 旧版功能防遗漏索引｜2026-10-14**。本页回答“用户想做什么、通过什么入口、在哪个执行世界、旧版功能由谁接管、尚缺哪种证据”。它**不是**新的 Browser SDK Registry、独立运行时、运行完成百分比或第二套工程任务账本。具体方法、版本和能否调用以实际源码与当次 Chrome 验收为准。
>
> 原有权威资料保持不变：[F01–F18 框架子系统及历史进度](framework-feature-progress-tree-20261013.zh-CN.md) · [旧版 src-bex 14 个用户场景](legacy-to-target-map.md) · [跨运行世界通信审计](page-ui-cross-world-communication.zh-CN.md) · [图解目录（4 张 SVG）](diagrams/README.zh-CN.md)。
>
> **核心范围**：继续保留旧 src-bex 的浏览器自动化、网页增强、跨环境服务和按需 JS 资源能力；绝不以恢复“网页任意 JavaScript → 特权 Background eval”作为兼容目标。

## 0. 一分钟辨认：运行在哪里？

| 你想做什么 | 选择的入口 | 代码真正执行的地方 | 面向开发者的主要对象 | 实际结果 |
| --- | --- | --- | --- | --- |
| 让浏览器填写、点击、导航和读取网页 | 开发 → Controller / 已安装 Controller Task | **sandbox iframe 创建的独立 Controller Worker** | `page`、`params`；无网站 `document` | `runId` / 持久 `resultId` |
| 为网站添加按钮、组件、CSS 和监听器 | 开发 → Page / 已安装 Page Program | 目标网页的 `USER_SCRIPT` 世界 | `document` / DOM / `createPageUI`；无 Controller `page` | Page preview / document / source 身份 |
| 网站 MAIN 中调用已批准的扩展服务 | 获准网页的固定 `OpenDeskSDK` | 网站 MAIN 发起请求；Relay 在 Content ISOLATED；实际服务在受信 Host/SW | `OpenDeskSDK` / `axiosx` / 存储门面 | 原网页 Promise / 服务回执 |
| 开发自己的侧边栏工具 | 工具 → 安装 → 打开 | Side Panel 里的**独立 opaque sandbox iframe** | `OpenDeskTool.request` / 工具的 Browser SDK | 工具实例内的 UI 和有界授权结果 |
| 监听浏览器事件、管理授权、保存结果 | 受信扩展框架 | **Background Service Worker、受信 Host/Driver** | 内部 `chrome.*`、Authority / Broker | 受信服务事实；**不是**用户脚本执行入口 |

**不要混淆**：Controller 的变量 `page` 是 ChromePage/Locator 代理，**不是**“Page USER_SCRIPT”模式；后台标签页 ≠ Background SW；Content Script ≠ 用户工具沙箱；网页 MAIN 的 SDK 全局对象不会自动出现在用户 Page USER_SCRIPT 世界。见 [新架构图](diagrams/current-execution-worlds.svg)。

## 1. 九个功能领域：从用户需求进入现有功能

| 领域 | 用户能理解的目标和典型场景 | 现有产品入口与源码所有者 | 对应旧需求/现阶段不可误判的边界 | 原 F 子系统 |
| --- | --- | --- | --- | --- |
| **D01 浏览器自动化** | 读取网站、填写表单、点击按钮、导航并返回数据 | Controller → RunHost → Worker → `page` / Native Driver；[Controller API](../../api/controller.zh-CN.md) | 继承旧 `background.ts + ChromePage.ts` 的**用户用途**，但用户代码不再于 SW/Background `eval`；完整 Playwright/Puppeteer 等价未经承诺 | F03 |
| **D02 网页脚本与 UI 增强** | 在正在访问的网站插入按钮、样式、React/Vue UI，保存后按规则启用 | Page USER_SCRIPT、受管 UI、已安装 Page Program；[Page API](../../api/page-userscript.zh-CN.md) | 承接旧 `my-content-script.ts` 的网页增强；不是自动获得 MAIN、Background 或任意 Tool 权限 | F04 |
| **D03 跨环境通信与共享服务** | 网页 UI 请求 HTTP/存储；工具获取网页信息；收到对应结果 | MAIN SDK `CustomEvent` → Content Relay → SW Broker；Controller MessagePort；Tool `postMessage`；[跨环境审计](page-ui-cross-world-communication.zh-CN.md) | 旧 `brige.js / custom_event.js` 便利需求仍在，但**网页启动固定任务和任意工具定向数据桥未全面公开**；绝不把已有 IPC 当通用事件总线 | F02 / F05 / F16 |
| **D04 浏览器原生能力** | 标签页、Cookie、下载、截图、网络/存储、通知等 | 受信 Browser SDK、Chrome Driver/Host；[正式实施手册](../../api/browser-sdk-execution-manual.zh-CN.md) | 通过受限能力面向不同身份开放；“Chrome 有 API”≠“网页/Tool 能直接调用”；候选 API 不算已实现 | F05–F07 |
| **D05 自动化程序、任务与触发** | 保存版本、安装任务、手工执行、定时、云控、查看结果和停止 | Task/Revision → 原 Authority/RunHost/Result；Scheduled/Cloud 使用原宿主 | 旧网页 `executeInBg(script)` 的**网页按钮触发用途**仍需安全替代；保存草稿≠固定 Task 已安装运行 | F09–F12 |
| **D06 开发工具与 AI** | 开发 Tab 手写脚本；Codex 编辑本地 JS；Native/MCP 运行和查看回执 | 开发 Tab / Workspace / MCP / Native Host；[API 导航](../../api/README.md) | 本地构建、浏览器 Worker、网页增强不是三套用户运行时；草稿/正式版本需区分 | F13–F15 |
| **D07 第三方 JS 与依赖资产** | 共享固定 JS、npm、HTTPS ESM、Classic、SHA 缓存、React/Vue 依赖 | `src/libs`、Dependency Manager、原有构建器；[依赖使用合同](../../framework/universal-dependency-runtime-usage-contract.zh-CN.md) | 旧独立 vendor 文件的资源思想已部分保留；共享**字节**、共享物理文件、共享 JS 实例是三种不同承诺，不能等同 | F08 |
| **D08 侧边栏工具与应用市场** | 制作/安装/更新/卸载 HTML/JS、React/Vue 小工具 | `examples/sidebar-tools` / Tool Sandbox / Official Catalog / 市场；[工具开发规范](../../api/sidebar-tool-development.zh-CN.md) | 自定义 Tool 不等于 Content Script；现有 `tasks.open` 只打开已安装任务 UI，不会执行 Task | F15–F17 |
| **D09 安全、数据生命周期与交付** | 精确网站授权、撤权、目标绑定、持久结果、资源清理、发布/回归 | Authority / Broker / Storage / Stop / WXT / Chrome 测试；[测试指南](../../framework/testing-guide.md) | 旧 `active tab`、共享全局、raw eval 和弱回程必须被改进，不作为“兼容”而回退安全；真实版本证据独立记录 | F01 / F02 / F18 |

领域划分是**从用户用途向下索引**，与 F01–F18 不是一一对应；无需新增 F19、重复第二个接口 Registry、复制旧 188 项产品候选，或把源码已接线冒充真实 Chrome PASS。

## 2. 从历史需求出发，不能丢失的完整用户链

这些是跨领域场景，不应被一个领域的 Unit PASS 取代。

| 用户旅程 | 关联领域 | 已有机制与剩余缺口 | 实际验收入口 |
| --- | --- | --- | --- |
| **U01** 在网页自动搜索、提交并读取结果 | D01 + D05 + D09 | Controller/ChromePage 已有；核对具体正式入口、runId/resultId、目标绑定、停止 | `examples/tasks/demo-form.html` |
| **U02** 给网站加入一个不会重复生成的按钮/面板 | D02 + D09 | Page USER_SCRIPT、受管 UI 已有；停止不会回滚任意非受管 DOM 副作用 | 同一真实网页的 Page 手动/安装链 |
| **U03** 网页内按钮请求被授权的 HTTP 或持久存储 | D02 + D03 + D04 | 网站 MAIN `OpenDeskSDK` 的既有服务链；与 USER_SCRIPT 的 API 可见性分别测试 | 固定 SDK + Content Relay + Broker |
| **U04** 自定义 Tool 打开后读取当前网页信息 | D03 + D08 + D09 | 复用 Tool `postMessage` 和 `currentPage.info`；不直接读取网站 document | 工具导入/打开/关闭 |
| **U05** **Page 注入的按钮启动已安装、固定 Controller Task 并拿到结果** | D01–D03 + D05 + D09 | **P0 产品缺口**：禁止旧 raw `executeInBg`，需要同一 RunHost/Authority 的有界受控触发入口；当前不是已发布通用 API | 安装 Page + 安装 Controller Task + Chrome 真实按钮 |
| **U06** Page 注入 UI 把有限数据送到指定侧栏工具 | D02 + D03 + D08 | **P1 需求缺口**：有工具 Bridge，但没有所有 Page/Tool 通用的带安装/实例身份的点对点业务消息合同 | Page → 活动 Tool instance → 回执 |
| **U07** 网页和侧栏观察任务开始、进行、完成和失败 | D03 + D05 + D09 | **P1 可选缺口**：应复用已持久化的 Run/Result，断线按原 runId 查询，不重放 | RunHost 真实任务 + 断连恢复 |
| **U08** 不重复下载第三方库并保证不同环境隔离 | D02 + D07 + D09 | 固定资产与 SHA 复用已有；旧文件级共享和长期版本/离线完整合同仍需分别验证 | 实际扩展 package/资源 SHA/Chrome |

原 [旧版 14 个场景](legacy-to-target-map.md) 仍是旧功能迁移的检索入口；U01–U08 仅用于选择端到端验收，不替换原合同编号或创造第二套任务引擎。

## 3. 最优先缺口：网页 UI → 固定 Controller Task

请先看 [跨世界通信图](diagrams/cross-world-messaging.svg) 和 [专门审计](page-ui-cross-world-communication.zh-CN.md)。对于这一用户动作，正确的**目标方案（尚未宣布实现）**：

```text
已安装、明确授权的 Page Program 内受管按钮
  → 发出受限“请求运行固定 Task”的命令（不能携带 raw JS）
  → 由受信入口确认 Page/Program/Task 安装身份、Origin、documentId、目标、参数与批准范围
  → 在已有可见 RunHost/Authority 启动已安装 Controller Revision
  → 返回真正 runId → 在原 Durable Result 中观察 resultId / 状态 / 错误
  → Page/Sidebar 按同一 runId 展示结果，不会在通信超时后再次启动
```

**设计边界**：

- 网页 `CustomEvent`、`postMessage` 或页面内按钮触发事件均是**输入**，不是权限凭证。不得信任 JS 自报 `trusted:true`、Task ID、程序版本或任意网页 `event.isTrusted` 作为全部授权依据。
- 仅对明确获准的已安装固定任务请求做有限桥接。不得把 `OpenDeskSDK` 的网站 MAIN 全局变成任意自动化执行权限，不恢复 `executeInBg(source)` / SW `eval`。
- 第一版在 Side Panel/可见宿主缺失时明确报告 `unavailable` 或引导可信交互；不要为了演示成功而暗中建立第二套无人值守 Worker 或后台 RunHost。
- 消息与数据必须绑定真实 sender、tab/frame/document、Program Revision、Task Revision、安装/撤销代际、requestId 和原执行结果；权限撤销、文档切换、重复点击、未知效果均不得误复用授权或自动重放。
- 先复用现有 Page Program、Host/Authority、RunHost、Result；确实缺最小命令路由时才新增**一条**审计过的窄接口，不提前开发泛化 Event Bus。

## 4. 文档分层与权威归属（避免又做二十轮但没有结论）

| 需要知道什么 | 应在哪里找 | 这页只应做什么 |
| --- | --- | --- |
| 当前用户有哪些用途/运行入口 | **本页 D01–D09 + U01–U08** | 做一个稳定导航，不重复另一份接口数和百分比 |
| 旧 `src-bex` 的哪个场景还未承接 | [旧新版迁移总账](legacy-to-target-map.md) | 指到原场景、保留历史证据 |
| 实际执行世界及传输位置 | [4 张 SVG 图](diagrams/README.zh-CN.md) + [新架构](current-and-target-framework.md) | 区分图示的实线源码链与待实现建议 |
| Page/Controller/Tool 脚本怎样写 | [Controller](../../api/controller.zh-CN.md) / [Page](../../api/page-userscript.zh-CN.md) / [Tool](../../api/sidebar-tools.zh-CN.md) | 引用真实可复制示例；不虚构 API |
| Browser SDK 哪些方法真正公开 | `src/framework/sdk/browser-contract.js`、`src/framework/sdk/registry.js`、[唯一实施手册](../../api/browser-sdk-execution-manual.zh-CN.md) | 不维护第二套 operation 列表 |
| 实际实现/测试/发布是否可宣布完成 | 最新 HEAD、受影响源码、Node/Build/Package/CFT/Mac Native 的**原始回执** | 给到具名证据位置；无证据只写 NOT_TESTED |

### 状态标记与维护规则

对每个新需求都单独记录 `SOURCE_WIRED`、`NODE_PASS`、`BUILD_PASS`、`CHROME_CFT_PASS`、`MAC_NATIVE_PASS`、`SECURITY_PASS` 或 `NOT_TESTED/BLOCKED`，至少绑定 Git SHA、实际构建 hash、目标 document 与 result/preview 身份。**运行过单个 D3 函数 ≠ 跨环境任务触发与数据回程都已交付。**

变更任何公共接口前按 `AGENTS.md`、`docs/framework/parallel-development.md` 检查最新 `main`、并行任务和现有合同；能复用原执行器就不新建 Loader、RunHost、Broker、Tool Host 或 Runner。此导航本身没有新增任何运行时代码或权限。

## 5. 下一轮执行顺序：先产品闭环，后按需扩展

1. **P0：重新读最新源码并核对 U05 是否已经被并行工作实现**；若是，直接真实 Chrome 复验，不重复研发。
2. **P0：完成 U05 实际产品入口**：Page 的真实 UI 按钮 → 已安装固定 Controller Task → 原 RunHost → Durable Result，含无授权、错误目标、重复点击/不确定结果/退出等负向测试。
3. **P1：按真实消费者判断 U06 / U07**：若已有明确的 Page-to-Tool 数据场景，就在单一 Host/Bridge 上新增最窄定向能力；若仅是能力设想，保留缺口，不提前开发全局消息总线。
4. **P1：确认关键跨环境资源和权限没有回归**，更新原迁移账本对应行以及实际测试证据。
5. **最后再谈综合评分与发布**：设计维度可给独立专家评分，代码与原生验收达标须另有当次原始证据，不能仅凭文档自评 95+。

**停止条件**：无需更多“规划版”GOAL，至少交付一个可复制、可点击、可追踪、可安全失败的真实网页 → 固定任务闭环；已通过的 Controller/Page/D3/工具路径不重复扩展。
