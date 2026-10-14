---
name: opendesk-sidebar-tool-dev
description: Develop, preview, package, review, install and verify OpenDesk Browser Side Panel tools (v1/v2). Keep each tool's source in examples/sidebar-tools/<id>, separate execution worlds and trusted extension adapters, and preserve the existing sandbox and host.
---

# OpenDesk Browser Side Panel 小工具统一开发 Skill

## 触发与文档优先级

当用户让 AI/Codex **创建、修改、打包、预览、安装、验收同类型 Side Panel 可安装小工具**时使用本 Skill。不是某个具体工具（如知识收件箱）的专用规则，也不适用于 Controller/Task v1/Page USER_SCRIPT 项目。

必读顺序：

1. [仓库根 AGENTS.md](../../../AGENTS.md) 与 [测试指南](../../../docs/framework/testing-guide.md)；核对真实 `main`/工作区/并行资源，遵守不强推、不破坏性清理。
2. **[Side Panel 统一开发规范](../../../docs/api/sidebar-tool-development.zh-CN.md)**：唯一跨工具开发流程。
3. [通用 API 合同](../../../docs/api/sidebar-tools.zh-CN.md)：schema、操作、权限、容量、可信边界。
4. [示例导航](../../../examples/sidebar-tools/README.zh-CN.md)：选择与任务真正相符的原生、React、Vue 或官方可信示例。
5. **只有开发特定工具时**，才补读该工具自己的 README、可选 DEVELOPMENT 与范围内 AGENTS。

源码中的 `src/ui/sidebar-tools/package.js`、`src/ui/sidebar-tools.js`、`scripts/build-sidebar-tool.mjs` 是可执行事实；本文不覆盖它们。

## 工具项目归属与演进顺序（2026-10-14）

**先在同一仓库模块化，不拆仓库、不新增一套工具体系。** `examples/sidebar-tools/<tool-id>/` 是一个工具自己的项目目录；官方条目在此处的 HTML/CSS/JS 是**真实发行源码**，不是待迁移的演示副本。新增或修改一般工具优先只触碰自己的配置、UI、资产、README 和测试，不为独立二字创建 `opendesk-tools` 仓库、独立 Chrome 扩展、额外 Host 或另一套包格式。顶层“我的/开发/工作流/工具”等 Tab 是宿主产品导航，不能当作各工具的源码边界。

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

- 普通用户只需要发布的 OpenDesk Browser 扩展和既有官方 Catalog 离线工具包；不得要求下载 `examples/`、安装 Node 或复制 Background。普通工具项目仍在 `examples/sidebar-tools/<tool-id>/`。
- 有 UI 修改的正式工具必须提升其三段式版本，经原有 packer/catalog 生成发行资源；不能把同版本不同字节当作升级。不要复制安装器、Host、SDK 或权限模块。
- 普通能力使用现有 Browser SDK；确需 Chrome 原生权限时只能依赖固定、经审计的预编译扩展逻辑。工具审阅、安装确认、启动都应检查目标发行扩展能否实际提供所需可信能力；缺失提示升级，不能假装安装成功。
- Background 管持久计时与 DNR，Content Script 管网页显示，沙箱管 UI，Side Panel 固定 Host 管权限和可信点击。前台授权按钮应在首次打开的可见区域；已停用工具不可触发无效的原生授权。
- 安装→打开→授权→核心运行→停用→卸载→清理失败恢复→重新安装均需有定向证据。Quick Notes/Time Review 是不受影响的对照；任何移除只能处理自有命名空间与自有 DNR ID。
- Node、构建、CI、真实 Chrome 是不同证据等级：没有与本次最终候选身份一致的 Mac Chrome/CFT 原生凭据就标为 `NOT_TESTED`，不能提前给出 95+ 通过分。

## 产品方案与交互预览门槛

新建或显著修改工具 UI 时，先执行 [统一开发规范的 8 阶段设计→预览→实施工作流](../../../docs/api/sidebar-tool-development.zh-CN.md#产品设计与对话预览关卡新建显著改造-ui-时适用)；**在当前对话上下文中直接显示可交互 HTML 原型**并提供独立 HTML 文件，不得只展示包 JSON、截图或一个下载链接就宣称完成产品预览。原型使用模拟数据，无 Chrome/Native 写入权限；用户评审设计后再打包/安装。设计原型不同于下文由 stage 产生的只读包预览。

独立工具页不堆静态描述：依照 [R28 多功能区 Tab 契约](../../../docs/architecture/sidebar-multi-section-tab-contract-r28.zh-CN.md)，头部默认只有返回、当前标题和必要操作；文件夹/列表等集合“＋ 新建”放在所属区域标题右侧，条目管理入口必须能在窄屏/键盘下找到。真正的授权/错误等动态提示放到状态区，不借口信息完整性常驻重复描述。

## 任务判断（先选一条，再改代码）

- **普通工具 / UI**：编辑 `examples/sidebar-tools/<id>/tool.config.json` 及 `src/index.html/style.css/main.js`。依赖少则经典 JS，不为简单表单新建 React 应用。
- **复杂组件**：复用 `react-starter` 或 `vue-starter`，编译成一个本地 IIFE + 静态 CSS；Tailwind 仅作为构建期可选工具。先成功本地构建再调用统一打包器。
- **网站按钮、DOM 内容捕获、Native/受信任数据**：先明确操作处于 Background、ISOLATED、MAIN 还是可信宿主；只有确切必要才审计 `src/<feature>/` 与既有固定接线、权限及测试；不能借工具 JSON 的 `page.toc/page.clip/page.capture/knowledge.store` 越权或自行重造框架。
- **普通工具导入**：给用户生成 JSON 即可；**官方可选工具**须维护可信源码与 `official-tools/catalog.json` 的项目登记，再构建整个扩展自动生成发行资源；不要手工维护生成 JSON 副本。

## 最短闭环：编辑 → 快照/打包 → 明确使用

### 经典 JS 工具

```sh
npm run build:sidebar-tool -- examples/sidebar-tools/<id>
# artifacts/sidebar-tools/<id>/<version>/<id>.opendesk-tool.json
node scripts/stage-sidebar-tool.mjs examples/sidebar-tools/<id>
# .opendesk-preview/<id>/<sha256>.opendesk-tool.json
# STAGED_NOT_INSTALLED；并非已安装
```

先审阅生成包及申请权限，再让用户在 Side Panel「工具 → ＋ 导入 → 审核 → 确认安装/更新 → 主动打开」。有本地 Workspace/Native 时，**只读预览**需要用户显式点击，不能真实写入/打开任务/控制页面，即使预览包 ID 与已安装工具相同也不得借用安装权限。

### React/Vue/Tailwind 工具

在对应 starter 的项目目录显式 `npm install` 建锁、审查并保留 lockfile，正式后续使用 `npm ci` → `npm run build` → `node ../../../scripts/stage-sidebar-tool.mjs "$PWD"`。持续构建时一个终端 `npm run build:watch`，另一个 `node ../../../scripts/watch-sidebar-tool.mjs "$PWD"`；只接受最后完成并带 `dist/build-ready.json`/hash 的构建。watcher 不替用户执行 npm、安装工具或授予权限。

### 官方可选发行工具

读取 [官方 Catalog 合同](../../../docs/api/official-tools-catalog.zh-CN.md)，维护 `examples/sidebar-tools/<id>/` 的配置、源码与资产；版本和能力不在 Catalog 重复登记。

```sh
node scripts/build-official-tools.mjs --out artifacts/official-tools-release
npm run check
npm run build
npm run build:dev
npm run verify
```

确认最终固定资源为 `dist/{production,development}/official-tools/<id>/<id>.opendesk-tool.json`，发行目录包含实际包版本、能力、大小和摘要。以当前 `official-tools/catalog.json` 的每项 `installationPolicy` 为准，不能假定所有候选都为 optional；资源存在不等于已安装，不启动代码，不给网站授权。新增候选无需新增硬编码安装按钮或构建复制映射。

仅 UI 工具热迭代**不必**重编整个扩展；修改 `src/` 可信宿主或更新内置发行资源才走完整扩展链路。别把 `dist/production/` Chrome 加载目录与单个 `.opendesk-tool.json` 导入包混为一谈；生成/观看快照也不是自动热安装。

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
