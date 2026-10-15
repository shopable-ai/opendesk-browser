---
name: opendesk-sidebar-tool-dev
description: Author, iterate and preview sandboxed 扩展 center Sidebar App UI and business logic in examples/sidebar-tools/<id> with OpenDeskTool.request; hand off packaging, install verification and offline release to opendesk-sidebar-tool-package, not Page/Task or audited trusted runtime features.
---

# OpenDesk Browser · 扩展中心应用（Sidebar Tool）开发 Skill

## 触发与文档优先级

当用户说「在**扩展**里开发、安装、打开或管理一个**小应用**」或要求 AI/Codex 创建、修改、打包、预览、安装和验收 Side Panel 可安装应用时使用。**「扩展」是一级 Tab，「应用」是行级类型标签**，不是单独 Tab。本 Skill 不负责 Controller Task、Page USER_SCRIPT「网页增强」或第一方可信功能。

先读 [R4 现行产品导航与术语](../../../docs/product/sidebar-ui-spec.zh-CN.md)。保留技术模型 `examples/sidebar-tools/<id>/`、`opendesk.sidebar-tool.v1/v2`、opaque-origin iframe、`OpenDeskTool.request`、打包器、Host 和安装协议，**不因产品叫扩展而改变技术身份**。

**零技术输入的前置关卡**：用户只用一句话描述工具目标时，先执行[自然语言扩展开发工作流 R2](../../workflows/extension-creation.md) 的 Phase 0–3，恢复已批准的产品场景/原型和最新源码，生成带 F/S/A 编号、证据来源与 P0/P1 的功能树。未通过 Gate A 不直接生成 HTML 或提交工具源码；仅补全低风险推断，对权限/隐私/不可逆行为保留批准门禁。通过后继续复用本 Skill、现有 Preview Skill 和唯一打包器，不建立新路由器；当前自动化执行入口仍为 `NOT_IMPLEMENTED`。

必读顺序：

1. [仓库根 AGENTS.md](../../../AGENTS.md) 与 [测试指南](../../../docs/framework/testing-guide.md)；核对真实 `main`/工作区/并行资源，遵守不强推、不破坏性清理。
2. **[Side Panel 统一开发规范](../../../docs/api/sidebar-tool-development.zh-CN.md)**：唯一跨工具开发流程。
3. [通用 API 合同](../../../docs/api/sidebar-tools.zh-CN.md)：schema、操作、权限、容量、可信边界。
4. [示例导航](../../../examples/sidebar-tools/README.zh-CN.md)：选择与任务真正相符的原生、React、Vue 或官方可信示例。
5. **只有开发特定工具时**，才补读该工具自己的 README、可选 DEVELOPMENT 与范围内 AGENTS。

源码中的 `src/ui/sidebar-tools/package.js`、`src/ui/sidebar-tools.js`、`scripts/build-sidebar-tool.mjs` 是可执行事实；本文不覆盖它们。

## 工具项目归属与演进顺序（2026-10-14）

**先在同一仓库模块化，不拆仓库、不新增一套工具体系。** `examples/sidebar-tools/<tool-id>/` 是一个工具自己的项目目录；官方条目在此处的 HTML/CSS/JS 是**真实发行源码**，不是待迁移的演示副本。新增或修改一般工具优先只触碰自己的配置、UI、资产、README 和测试，不为独立二字创建 `opendesk-tools` 仓库、独立 Chrome 扩展、额外 Host 或另一套包格式。顶层“我的/扩展/工作流/开发/云控”等 Tab 是宿主产品导航，不能当作各工具的源码边界。

**按执行环境辨认代码，不以一个目录对应一个 JS World：**

| 世界 | 工具的典型责任 | 当前源码落点与接入方式 |
| --- | --- | --- |
| Sandbox 工具 UI | 表单、展示、`OpenDeskTool.request` | `examples/sidebar-tools/<id>/src/`；独立构建安装的 JSON，opaque-origin iframe；不接触 `chrome.*` |
| 扩展 Background / MV3 SW | 长期策略、Alarm、Chrome DNR、事件恢复 | 确需可信服务时由 `src/<feature>/` 的**固定预编译**代码通过现有 `src/sw.js` 接线；SW 可休眠，业务状态须持久化 |
| Content Script / ISOLATED | 限定目标文档中的提醒、授权后的 DOM 操作 | 确需时经既有静态 `src/entrypoints/page-relay.js` 接线；不能依赖 Side Panel 持续打开 |
| Page / MAIN | 极少数需要网页 JS 上下文的操作 | 默认**无**此入口；如必须使用，沿用既有明确授权的 SDK/User Script 世界合同，严禁把可信宿主权限送入网站 |
| 可信 Side Panel / 扩展页面 | 真实点击、Chrome 原生权限申请、危险操作确认 | `src/<feature>/tool-host.js`、`host-controls.js` 等审计代码由固定扩展构建入口引用；不能从动态工具包导入 JS |
| 扩展拦截说明页 | DNR 导航说明、无敏感信息显示 | 经固定资源清单编译；不加载可安装 UI 的动态字节 |

**以已经完成最小整理的 Stay Focus 为完整例子**：`examples/sidebar-tools/stay-focus/` 保留为官方 UI 项目；`src/stay-focus/` 保留为可信后台、产品模型、页面提醒和规则适配模块；既有 `tool-host.js`、`lifecycle.js` 与 `src/sidebar-tools/sender.js` 已承担明确职责。见 [业务目录说明](../../../src/stay-focus/README.zh-CN.md) 及 [现有整理证据](../../../docs/framework/workstreams/stay-focus-boundary-r1-20261014.md)。**不为路径美观二次搬动已通过的代码**。

依赖方向以 `工具 UI → 受控工具请求 → 现有可信宿主/授权 → 工具受信任服务 → Chrome 能力` 为准。共用宿主可以有**固定、审计的组合入口**，但不得继续长出某个工具的业务策略、确认文案、私有存储/DNR 清理细节；这些属于该工具的受信任模块。反过来，工具也不能复制通用安装器、消息授权、SW 或构建器。

**未来抽离的触发条件**：只有当独立发布节奏、跨产品复用或跨团队维护出现可验证的实际需求，并且现有 Catalog、源码哈希、固定入口、调试与验收可安全消费外部版本化源码时，才评估单独仓库或包。当前不引入跨仓库同步、符号链接式运行时加载、远程特权 JS 或自动扫描工具目录并授予权限。目录独立与安全隔离是两个不同指标。

## R3.1 发行、安装与真实能力门槛

**网页对话 HTML 设计预览**：需要与扩展按钮/表单一致时，先用 [opendesk-ui-preview](../opendesk-ui-preview/SKILL.md) 生成带 canonical CSS、源 SHA 与网页提示词的离线套件，实际附给模型；回收后检查保护区并做交互评审。本地 skill 路径不等于网页模型已获得规范；离线模板不是可安装包，完整宿主 CSS 不可注入动态工具 iframe。

- 普通用户只需要发布的 OpenDesk Browser 扩展和既有官方 Catalog 离线工具包；不得要求下载 `examples/`、安装 Node 或复制 Background。普通工具项目仍在 `examples/sidebar-tools/<tool-id>/`。
- 有 UI 修改的正式工具必须提升其三段式版本，经原有 packer/catalog 生成发行资源；不能把同版本不同字节当作升级。不要复制安装器、Host、SDK 或权限模块。
- 普通能力使用现有 Browser SDK；确需 Chrome 原生权限时只能依赖固定、经审计的预编译扩展逻辑。工具审阅、安装确认、启动都应检查目标发行扩展能否实际提供所需可信能力；缺失提示升级，不能假装安装成功。
- Background 管持久计时与 DNR，Content Script 管网页显示，沙箱管 UI，Side Panel 固定 Host 管权限和可信点击。前台授权按钮应在首次打开的可见区域；已停用工具不可触发无效的原生授权。
- 安装→打开→授权→核心运行→停用→卸载→清理失败恢复→重新安装均需有定向证据。Quick Notes/Time Review 是不受影响的对照；任何移除只能处理自有命名空间与自有 DNR ID。
- Node、构建、CI、真实 Chrome 是不同证据等级：没有与本次最终候选身份一致的 Mac Chrome/CFT 原生凭据就标为 `NOT_TESTED`，不能提前给出 95+ 通过分。

## R3.2 真实运行能力与权限分级

区分 **工具已安装、工具已启用、后台/网页服务真实可用、Chrome 原生权限已批准**。声明 capability、侧栏出现一个 JS 适配器、源码构建通过，都不能证明 Background/Content Script 具有真实工作能力。先核查真实消费者和已有 Browser SDK、Page Relay、Controller/USER_SCRIPT、可信 Host，不为工具新建运行器。

Stay Focus 安装提交前，静态 Side Panel 适配器的 `focus.probe` 对当前 MV3 Service Worker 验证服务协议与必要 Chrome API。此请求不是沙箱公开能力，不需要先安装，也不申请原生权限。缺失、错误版本或不可达服务是 `RUNTIME_UNAVAILABLE`，阻止继续持久化安装并保留已有用户数据；尚未批准 `idle` 或 `declarativeNetRequestWithHostAccess` 是 `PERMISSION_REQUIRED`，在真实可信点击之后申请，不应误报缺失后台。探测正常并不证明计时、提醒、DNR 已在 Chrome 实测。

逐项核对「应用/用户场景 → Sandbox、Side Panel、SW、ISOLATED 或 MAIN → 实际操作 → Manifest/原生权限 → 显式网站授权 → 重启/撤权/停用副作用 → 测试和真实证据」。状态用 `SUPPORTED`、`PERMISSION_REQUIRED`、`RUNTIME_UNAVAILABLE`、`UNSUPPORTED`、`NOT_TESTED`；没有同候选真实 Chrome 证据不能判原生通过。独立安装不要求普通用户有项目源码，但预编译特权服务必须随正式扩展发行。

## 产品方案与交互预览门槛

新建或显著修改工具 UI 时，先执行 [统一开发规范的 8 阶段设计→预览→实施工作流](../../../docs/api/sidebar-tool-development.zh-CN.md#产品设计与对话预览关卡新建显著改造-ui-时适用)；**在当前对话上下文中直接显示可交互 HTML 原型**并提供独立 HTML 文件，不得只展示包 JSON、截图或一个下载链接就宣称完成产品预览。原型使用模拟数据，无 Chrome/Native 写入权限；用户评审设计后再打包/安装。设计原型不同于下文由 stage 产生的只读包预览。

独立工具页不堆静态描述：依照 [R28 多功能区 Tab 契约](../../../docs/architecture/sidebar-multi-section-tab-contract-r28.zh-CN.md)，头部默认只有返回、当前标题和必要操作；文件夹/列表等集合“＋ 新建”放在所属区域标题右侧，条目管理入口必须能在窄屏/键盘下找到。真正的授权/错误等动态提示放到状态区，不借口信息完整性常驻重复描述。

## 与编译、发行和未来市场 Skill 的明确分工

- **本 Skill 主责**：HTML/CSS/JS、React/Vue 组件的功能实现、用户界面、源码正确性、隔离预览和开发侧功能测试。修改 `examples/sidebar-tools/<id>/src/`、`tool.config.json` 等真实业务源码。
- **编译/JSON/独立目录安装包/安装确认**：转交 [Sidebar Tool 打包 Skill](../opendesk-sidebar-tool-package/SKILL.md)，它持有 `build-sidebar-tool.mjs`、可再现性、版本、输出、生成包一致性、离线 Catalog 和安装验收的详细流程。本 Skill 不建立第二种构建命令或打包器。
- **第三方线上市场上传/审核/上架**：当前仅 [预留说明](../opendesk-marketplace-publish/RESERVED.md)，尚无可调用发布接口；不得标记已上架。市场 UI 属 `opendesk-extension-ui`，授权/Host 属 Runtime。

## 任务判断（先选一条，再改代码）

- **普通工具 / UI**：编辑 `examples/sidebar-tools/<id>/tool.config.json` 及 `src/index.html/style.css/main.js`。依赖少则经典 JS，不为简单表单新建 React 应用。
- **复杂组件**：复用 `react-starter` 或 `vue-starter`，编译成一个本地 IIFE + 静态 CSS；Tailwind 仅作为构建期可选工具。先成功本地构建再调用统一打包器。
- **网站按钮、DOM 内容捕获、Native/受信任数据**：先明确操作处于 Background、ISOLATED、MAIN 还是可信宿主；只有确切必要才审计 `src/<feature>/` 与既有固定接线、权限及测试；不能借工具 JSON 的 `page.toc/page.clip/page.capture/knowledge.store` 越权或自行重造框架。
- **普通工具导入**：给用户生成 JSON 即可；**官方可选工具**须维护可信源码与 `official-tools/catalog.json` 的项目登记，再构建整个扩展自动生成发行资源；不要手工维护生成 JSON 副本。

## 最短开发交接：源码 → 只读预览 → 打包 Skill

```bash
# 普通 Sidebar App 源码在此目录维护：
# examples/sidebar-tools/<id>/tool.config.json + src/index.html/style.css/main.js

# 可选：不安装的只读测试/预览快照
node scripts/stage-sidebar-tool.mjs examples/sidebar-tools/<id>
# STAGED_NOT_INSTALLED，不授予网站、Cookie 或浏览器权限
```

React/Vue 可复用项目本身的已有预编译配置，源码创建和 UI 调试由本 Skill 负责；**正式 JSON 生成、项目目录预构建包、版本/原始字节核对及本地导入/离线发行**统一按 [`opendesk-sidebar-tool-package`](../opendesk-sidebar-tool-package/SKILL.md) 执行。源码/UI 调整本身不意味着已经安装、运行、获准读 Cookie 或完成 Chrome 原生测试。不重复定义 `--out`、Catalog、Host、SW 或市场上传协议。

## 必须始终保护的合同

- 封闭 JSON 字段、稳定 toolId 和三段版本；审阅是否超包/字符/资产/存储配额。密钥/私人记录不可入包。
- sandbox 只有 `globalThis.OpenDeskTool.{root,request}`；`chrome.*`、任意站点 DOM、Native、跨域请求、下载任意文件与远程可执行脚本不得变成隐式权限。
- 授权按具体 capability、真实 sender/document、当前安装包、显式站点许可和真实用户行为落实。装了工具不等于网页已授权。
- 数据原文、用户编辑、修订冲突、异步结果未知和卸载时清理/备份均需按当前代码及用户需求设计。不使用定时器假装持久后台。
- 视觉遵守现有 Side Panel R19/R20/R21/R23 设计原则：紧凑、一致、浅深模式、键盘和无障碍。但 iframe 样式不会自动继承宿主 token；需在工具自己 CSS 实现，不能未经审查改变公共设计系统。
- 单一 writer，尊重并行 main 修改、构建锁、Chrome Profile、既有证据；未经授权不推送远端或执行完整发布/强推/重置。

## 质量门槛与交付

1. `npm run check`、`node --test tests/environment/sidebar-tools.test.mjs tests/environment/sidebar-tools-host.test.mjs`；增改权限/宿主/具体工具时加影响范围对应回归。Stay Focus 类可信工具先复核已有 `stay-focus-boundary-r1`、`stay-focus-service-r1` 和其他被影响的测试，检查目录源码归属、跨 World 接线、撤权、旧 epoch、未知副作用、DNR 自有规则与跨工具清理；不要重复创建一份空洞的目录专用测试。
2. 官方扩展变更：`npm run build` + `node scripts/verify-package.mjs dist/production`；如执行 `npm run build:dev`，则 `npm run verify`。组件 PASS 不等于 Chrome PASS。
3. 真实 Chrome 检查文件选择/审批/安装、iframe 主动打开/关闭、预览只读、窄屏/暗色/键盘、拒绝未知权限、更新/撤权/卸载和数据处理。官网实际网页与 Mac Native 只能用各自真实证据判定。
4. **文档归属**：通用方法仅改 `docs/api/sidebar-tool-development.zh-CN.md`；公共 API `docs/api/sidebar-tools.zh-CN.md`；具体使用 `examples/sidebar-tools/<id>/README`；特殊开发说明 `DEVELOPMENT.zh-CN.md`；AI 局部约束 `AGENTS.md`；产品路线 `docs/product/`；原始测试 `docs/framework/workstreams/`。
5. 汇报 `PASS/FAIL/BLOCKED/NOT_TESTED`，带候选 commit SHA、工具包 hash、具体测试与未测边界。`STAGED_NOT_INSTALLED`、构建通过和受控网页 fixture 都不能声称真实用户已安装、网站已测试或文件已落盘。

当真实代码/合同与本 Skill 不一致时，先纠正文档或报告差异，不要静默添加新的私有 API 或绕过包验证。


**R1.2 同类资源树例外**：书签/文件夹这类父子文件树共用创建工具栏，不为文件夹和书签各增加一行区域标题。回归检查 320px 单行三个按钮、折叠/搜索和自定义行菜单；特殊 Chrome 全量书签能力必须落在受审第一方源码，不可由沙箱工具借用。
