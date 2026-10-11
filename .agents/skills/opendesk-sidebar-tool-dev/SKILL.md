---
name: opendesk-sidebar-tool-dev
description: Develop, preview, package, review, install and verify any OpenDesk Browser opendesk.sidebar-tool.v1 Side Panel tool. Use existing vanilla/React/Vue templates and strict trusted-host boundaries; do not confuse tool snapshots with installation or extension builds.
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

## 任务判断（先选一条，再改代码）

- **普通工具 / UI**：编辑 `examples/sidebar-tools/<id>/tool.config.json` 及 `src/index.html/style.css/main.js`。依赖少则经典 JS，不为简单表单新建 React 应用。
- **复杂组件**：复用 `react-starter` 或 `vue-starter`，编译成一个本地 IIFE + 静态 CSS；Tailwind 仅作为构建期可选工具。先成功本地构建再调用统一打包器。
- **网站按钮、DOM 内容捕获、Native/受信任数据**：只有确切必要才审计 `src/` 的既有 Content Script、宿主路由、权限与测试；不能借工具 JSON 的 `page.toc/page.clip/page.capture/knowledge.store` 越权或自行重造框架。
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

确认最终固定资源为 `dist/{production,development}/official-tools/<id>/<id>.opendesk-tool.json`，发行目录包含实际包版本、能力、大小和摘要。五个当前官方候选均为 optional；资源存在不等于已安装，不启动代码，不给网站授权。新增候选无需新增硬编码安装按钮或构建复制映射。

仅 UI 工具热迭代**不必**重编整个扩展；修改 `src/` 可信宿主或更新内置发行资源才走完整扩展链路。别把 `dist/production/` Chrome 加载目录与单个 `.opendesk-tool.json` 导入包混为一谈；生成/观看快照也不是自动热安装。

## 必须始终保护的合同

- 封闭 JSON 字段、稳定 toolId 和三段版本；审阅是否超包/字符/资产/存储配额。密钥/私人记录不可入包。
- sandbox 只有 `globalThis.OpenDeskTool.{root,request}`；`chrome.*`、任意站点 DOM、Native、跨域请求、下载任意文件与远程可执行脚本不得变成隐式权限。
- 授权按具体 capability、真实 sender/document、当前安装包、显式站点许可和真实用户行为落实。装了工具不等于网页已授权。
- 数据原文、用户编辑、修订冲突、异步结果未知和卸载时清理/备份均需按当前代码及用户需求设计。不使用定时器假装持久后台。
- 视觉遵守现有 Side Panel R19/R20/R21/R23 设计原则：紧凑、一致、浅深模式、键盘和无障碍。但 iframe 样式不会自动继承宿主 token；需在工具自己 CSS 实现，不能未经审查改变公共设计系统。
- 单一 writer，尊重并行 main 修改、构建锁、Chrome Profile、既有证据；未经授权不推送远端或执行完整发布/强推/重置。

## 质量门槛与交付

1. `npm run check`、`node --test tests/environment/sidebar-tools.test.mjs tests/environment/sidebar-tools-host.test.mjs`；增改权限/宿主/具体工具时加影响范围对应回归。
2. 官方扩展变更：`npm run build` + `node scripts/verify-package.mjs dist/production`；如执行 `npm run build:dev`，则 `npm run verify`。组件 PASS 不等于 Chrome PASS。
3. 真实 Chrome 检查文件选择/审批/安装、iframe 主动打开/关闭、预览只读、窄屏/暗色/键盘、拒绝未知权限、更新/撤权/卸载和数据处理。官网实际网页与 Mac Native 只能用各自真实证据判定。
4. **文档归属**：通用方法仅改 `docs/api/sidebar-tool-development.zh-CN.md`；公共 API `docs/api/sidebar-tools.zh-CN.md`；具体使用 `examples/sidebar-tools/<id>/README`；特殊开发说明 `DEVELOPMENT.zh-CN.md`；AI 局部约束 `AGENTS.md`；产品路线 `docs/product/`；原始测试 `docs/framework/workstreams/`。
5. 汇报 `PASS/FAIL/BLOCKED/NOT_TESTED`，带候选 commit SHA、工具包 hash、具体测试与未测边界。`STAGED_NOT_INSTALLED`、构建通过和受控网页 fixture 都不能声称真实用户已安装、网站已测试或文件已落盘。

当真实代码/合同与本 Skill 不一致时，先纠正文档或报告差异，不要静默添加新的私有 API 或绕过包验证。
