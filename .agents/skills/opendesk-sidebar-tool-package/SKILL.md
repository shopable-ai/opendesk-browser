---
name: opendesk-sidebar-tool-package
description: Build, validate, synchronize and install portable OpenDesk Sidebar Tool v1/v2 JSON packages and official offline catalog releases; handle reproducible packaging and local upgrade acceptance, not UI authoring, Page/Task publishing or remote marketplace upload.
---

# OpenDesk Browser · Sidebar Tool 编译、打包与本地交付

## 唯一职责、触发与分工

当任务是「编译应用」「生成可导入 JSON」「把安装包放在工具项目目录」「校验安装包是否与源码一致」「离线分发」「官方固定资源打包」「安装/更新验收」时，以本 Skill 为**唯一主 Skill**。常规 UI、交互、业务逻辑的创作以 [工具开发 Skill](../opendesk-sidebar-tool-dev/SKILL.md) 为主；可信 Chrome 服务由 `opendesk-trusted-sidebar-feature`、通用 SDK/Host 由 `opendesk-extension-runtime` 管理；扩展中心的市场列表 UI 由 `opendesk-extension-ui` 管理。Controller/Page Program 的构建和 Authority 归 `opendesk-program-publish`，**不是本格式**。

**远程市场发布并未作为本 Skill 的能力实现。** 已有扩展内官方离线市场、固定 Catalog 与 R5 受限网页交接，不等于作者注册、上传 API、公开审核、版本托管或生产签名发布。未来职责预留在 [市场发布占位说明](../opendesk-marketplace-publish/RESERVED.md)，不能把本地 JSON 或 Git commit 宣称为线上上架成功。

## 权威源码与执行门槛

1. 先读 [AGENTS.md](../../../AGENTS.md)、[测试复用指南](../../../docs/framework/testing-guide.md)、[统一工具开发规范](../../../docs/api/sidebar-tool-development.zh-CN.md) 和 [工具包 API](../../../docs/api/sidebar-tools.zh-CN.md)，核对当前 `main`、并行写入、现有 watcher、输出目录及 Chrome Profile；不要覆盖别的工作流的构建或证据。
2. **唯一打包器**：`scripts/build-sidebar-tool.mjs` 的 `createSidebarToolPackage`、`encodeSidebarToolPackage` 和 `buildSidebarTool`，以及 `src/ui/sidebar-tools/package.js` 的 `validateSidebarToolPackage`、`serializeSidebarToolPackage`。禁止新建每工具 Wrapper、第二个包格式、专用 Installer 或用手写 JSON 绕过 Schema。
3. 官方离线发行继续使用 `official-tools/catalog.json` 与 `scripts/build-official-tools.mjs`，以 [官方 Catalog 合同](../../../docs/api/official-tools-catalog.zh-CN.md) 为准，`version/capabilities` 取自工具自身 `tool.config.json`，不在 Catalog 复制版本。
4. 首先检查工具项目的 `tool.config.json`、`src/index.html`、`src/style.css`、`src/main.js`（如有 `files.dependencies` 也检查）。`tool.config.json` 是输入，`<id>.opendesk-tool.json` 才是可导入文件；后者不是 Chrome Manifest，也不是第二份可以手工编辑的源码。
5. 正式发布时审核源码/版本/许可证/权限差异。Cookie 等敏感数据和密钥不能出现在构建输入、提交文件、日志或交付包中。

## 三条明确构建路径

| 输入场景 | 正确操作 | 交付位置 |
| --- | --- | --- |
| HTML/CSS/经典 JS 独立 Sidebar App | 在仓库根运行统一打包器，不需要 Vite/第二个插件工程 | `artifacts/sidebar-tools/<id>/<version>/<id>.opendesk-tool.json` |
| 工具根已有正规 `<id>.opendesk-tool.json` | 默认打包时同步**刷新这个已有文件**，同时保留原 `artifacts/` 输出；没有选择这种交付的工具不创建此文件 | `examples/sidebar-tools/<id>/<id>.opendesk-tool.json` + `artifacts/` |
| React/Vue 应用 | 按该独立项目的既有构建流程先生成**单个经典 JS 与静态 CSS**，检查 `dist/build-ready.json`，再用**同一** Sidebar Tool 打包器 | 相同便携式 JSON 合同 |

```bash
# 仓库根目录；初次准备依赖时 npm ci --ignore-scripts --no-audit --no-fund
npm run build:sidebar-tool -- examples/sidebar-tools/cookie-editor

# 常规默认产物：
# artifacts/sidebar-tools/cookie-editor/<version>/cookie-editor.opendesk-tool.json
# 已有根目录安装包时，还会刷新：
# examples/sidebar-tools/cookie-editor/cookie-editor.opendesk-tool.json

# 其它项目首次选择“随源码提供可安装包”：
npm run build:sidebar-tool -- examples/sidebar-tools/<id> --out examples/sidebar-tools/<id>/<id>.opendesk-tool.json
# 随后再用不带 --out 的命令，得到默认 artifacts/ 与同步包
```

**`--out` 必须是明确指定的输出，不隐式刷新第二份文件。** 不能把目录中预生成的包误当成最新源码：源码、配置、版本、能力变化时重新打包并提交，增加定向测试比较 `serializeSidebarToolPackage(await createSidebarToolPackage(project))` 与已提交 JSON 的**逐字节一致性**。在未更新 JSON 前拒绝宣布就绪。不要对第三方或全部示例目录强制生成/提交打包产物。

需要不安装的只读预览才使用：

```bash
node scripts/stage-sidebar-tool.mjs examples/sidebar-tools/<id>
# STAGED_NOT_INSTALLED；不是正式安装/授权
```

## 官方离线发行与日常开发扩展

```bash
node scripts/build-official-tools.mjs --out artifacts/official-tools-release
npm run check
# 只有实际需要交付/变更 Chrome 固定可信资源时，才按影响范围执行：
npm run build:dev
npm run build
npm run verify
```

真实发行资源为 `dist/{development,production}/official-tools/<id>/<id>.opendesk-tool.json`。官方 Catalog 固定原始包 SHA-256 与来源审查，仍不能代替第三方发行者签名、在线信任根或生产发布回执。日常 `dist/development` 的持续开发遵守 [AGENTS.md](../../../AGENTS.md) 原有 `npm run dev` watcher；**纯 Sidebar Tool UI 修改不默认重编整个扩展**。

## 安装、升级与质量验收

1. 使用 OpenDesk Browser Side Panel「扩展 → 更多操作 → 导入本地工具包」，核对 ID、版本、SHA/原始文件、能力变化、来源与预计替换内容，明确点击**确认安装/更新**，再主动**打开**。已安装同 ID 数据需要保留时**不要先卸载**。
2. 若当前扩展包含 `official-tools/catalog.json` 登记的候选，也可从官方市场/候选列表经**同一个**可信安装服务选择安装；预装只按 Catalog 可信策略运行，手工导入不能自称 `preinstalled`。
3. 工具安装 ≠ 运行 ≠ 某个站点已授权；任何 Cookies、网页、Chrome 敏感能力必须在既有可信宿主按网站和 capability 分别授权。不要让导入、更新、预览静默执行或提权。
4. 定向测试建议：`node --test tests/environment/sidebar-tools.test.mjs tests/environment/sidebar-tools-host.test.mjs`，具体工具另跑该项目专项（如 `tests/environment/cookie-editor-ui.test.mjs`）。官方发行变更还需 `tests/environment/official-tools-catalog-r45.test.mjs` 及现有包验证。尊重跨会话已通过的未变输入；只对实际变更范围补测。
5. 检验 `version`、可导入文件身份、包字节上限、`html/css/js` 安全限制、路径穿越/符号链接、相同版本不同字节的升级警告、旧数据保存、撤权和更新失败的恢复。不要盲目重试已产生未知效果的写入。
6. **分层报告** `SOURCE_WIRED / BUILD_PASS / COMPONENT_TESTED / NATIVE_TESTED / BLOCKED / NOT_TESTED`；关联真实 commit、包 SHA-256、CI 原始回执、实际 Chrome Profile/构建身份。静态测试、CI 构建和本机实际安装不是同一件事。

## 不得越界

- 不新增市场上传 API、作者账号、仓库签名密钥、计费、审核后台、远端自动更新或公开发布入口来“补齐”本地打包任务。
- 不把 `Page USER_SCRIPT`、Task、Chrome `manifest.json` 与 `.opendesk-tool.json` 混成同一发布格式。
- 不在动态工具包中注入可信 Host、Background、Content Script、`chrome.*` 或任意第三方脚本；新增正式 Capability 必须复用已审批 SDK / Dispatcher / 权限与安全审查流程。
- 不自动安装、自动更新、扩大权限或访问用户私人 Cookie；本地与网页预览都不能冒充正式安装。
- 不删除或覆盖其他工具、构建产物、正在使用的 Chrome Profile、并行提交或原验收证据。
