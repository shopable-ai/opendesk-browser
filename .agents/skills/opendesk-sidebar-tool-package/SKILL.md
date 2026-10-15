---
name: opendesk-sidebar-tool-package
description: Build, validate, synchronize and install portable OpenDesk Sidebar Tool v1/v2 JSON packages and official offline catalog releases; handle reproducible packaging, evidence-based capacity changes and local upgrade acceptance, not UI authoring, Page/Task publishing or remote marketplace upload.
---

# OpenDesk Browser · Sidebar Tool 编译、打包与本地交付

## 唯一职责、触发与分工

当任务是「编译应用」「生成可导入 JSON」「把安装包放在工具项目目录」「校验安装包是否与源码一致」「离线分发」「安装/更新验收」时，以本 Skill 为**唯一主 Skill**。常规 UI、交互、业务逻辑的创作以 [工具开发 Skill](../opendesk-sidebar-tool-dev/SKILL.md) 为主；可信 Chrome 服务由 `opendesk-trusted-sidebar-feature`、通用 SDK/Host 由 `opendesk-extension-runtime` 管理；扩展中心的市场列表 UI 由 `opendesk-extension-ui` 管理。Controller/Page Program 的构建和 Authority 归 `opendesk-program-publish`，**不是本格式**。

**远程市场发布并未作为本 Skill 的能力实现。** 已有扩展内官方离线市场、固定 Catalog 与 R5 受限网页交接，不等于作者注册、上传 API、公开审核、版本托管或生产签名发布。未来职责预留在 [市场发布占位说明](../opendesk-marketplace-publish/RESERVED.md)，不能把本地 JSON 或 Git commit 宣称为线上上架成功。

## 权威源码与执行门槛

1. 先读 [AGENTS.md](../../../AGENTS.md)、[测试复用指南](../../../docs/framework/testing-guide.md)、[统一工具开发规范](../../../docs/api/sidebar-tool-development.zh-CN.md) 和 [工具包 API](../../../docs/api/sidebar-tools.zh-CN.md)，核对当前 `main`、并行写入、现有 watcher、输出目录及 Chrome Profile；不要覆盖别的工作流的构建或证据。
2. **唯一打包器**：`scripts/build-sidebar-tool.mjs` 的 `createSidebarToolPackage`、`encodeSidebarToolPackage` 和 `buildSidebarTool`，以及 `src/ui/sidebar-tools/package.js` 的 `validateSidebarToolPackage`、`serializeSidebarToolPackage`。禁止新建每工具 Wrapper、第二个包格式、专用 Installer 或用手写 JSON 绕过 Schema。
3. 官方离线发行继续使用 `official-tools/catalog.json` 与 `scripts/build-official-tools.mjs`，以 [官方 Catalog 合同](../../../docs/api/official-tools-catalog.zh-CN.md) 为准，`version/capabilities` 取自工具自身 `tool.config.json`，不在 Catalog 复制版本。
4. 首先检查工具项目的 `tool.config.json`、`src/index.html`、`src/style.css`、`src/main.js`（如有 `files.dependencies` 也检查）。`tool.config.json` 是输入，`<id>.opendesk-tool.json` 才是可导入文件；后者不是 Chrome Manifest，也不是第二份可以手工编辑的源码。
5. 正式发布时审核源码/版本/许可证/权限差异。Cookie 等敏感数据和密钥不能出现在构建输入、提交文件、日志或交付包中。

## R32.3：容量可调整，安全机制不跳过

用户于 2026-10-15 明确允许重评和调整早期 AI 设置的工具容量。现行政策与来源见 [UI 架构文档](../../../docs/architecture/browser-ui-r23.zh-CN.md)，不在 Skill 新建另一份容量数值表。

**不能因为 React/Tree/Combobox 超出旧预算就拒绝组件路线。** 旧值是当前版本的实际校验值，不是不可修改的 Chrome 硬限制。具体容量实施获授权后允许直接同步更新预算、消费者及回归，不必仅因越过旧值重复申请同类批准；不得只改测试、跳过安全检查或改成无限制。

先分类外部限制、内部预算与身份安全机制，记录原值/单位/来源、代表性应用、目标设备、新值理由与验证范围。初期证据不足可用明确标注的暂定预算，继续原型和核心开发。同步源文件读取、打包/编码、导入、Host、消息/预览/stage、存储、Sandbox Bridge 及升级全链，不能出现“打包通过、运行按旧值拒绝”。UTF-16 长度、UTF-8 字节、JSON 转义、gzip/Brotli 和 ZIP 分别测量。

调整数值不改变 capability、真实 sender、安装代际、来源/哈希、CSP、沙箱、路径或撤权语义；保留临界值、超限和异常拒绝回归及旧包可读性。每次结论形成后同步架构、工具开发/API 文档、对应 Skill 和工作流证据；未修改代码和实测时不宣称新容量已生效。

## 单一正式包：临时构建 → 验证 → 显式晋升

**2026-10-15 用户决策，适用于已有可安装 Sidebar Tool 与新建工具。** 真正需要用户下载/安装/手动验收的项目，在自己的 `examples/sidebar-tools/<id>/` 最终保留**一个**稳定文件 `<id>.opendesk-tool.json`。**不是每个编译过程都改这个文件**。不要把临时包或下载 ZIP 冒充已提交的正式 JSON，也不因代码目录增加 `xxx-v2.opendesk-tool.json`、`xxx-r1.5-final.opendesk-tool.json` 等并行发行文件。工具包内的 `version` 和 Git 历史承担版本标识；未涉本轮交付的其他示例不要批量生成。

| 时机 | 唯一正确产物 | 是否提交 |
| --- | --- | --- |
| 开发/自动编译/失败重试 | `artifacts/sidebar-tools/<id>/candidate.opendesk-tool.json`（稳定临时路径；已有版本化 artifacts 亦属本地临时） | **否**，仓库忽略 |
| HTML/Native 只读预览 | 工具自身 `.opendesk-preview/` 的源码锁快照，`STAGED_NOT_INSTALLED` | **否**；快照不当安装包 |
| 源码、能力和 JSON 包自动门禁通过 | **显式晋升**到 `examples/sidebar-tools/<id>/<id>.opendesk-tool.json`；仅一个正式 JSON | **是**，与匹配源码一起提交 |
| 官方浏览器的内置发行资源 | 既有 `dist/{development,production}/official-tools/<id>/` 从同一源码/Catalog 构建 | dist 不提交；不要创建第二套 Catalog |

**流程命令（在仓库根；将 `<id>` 换成真实工具 ID）：**

```sh
# ① 生成或覆盖单一临时候选，不修改项目中的正式 JSON。
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/<id> \
  --out artifacts/sidebar-tools/<id>/candidate.opendesk-tool.json

# ② 先完成受影响的 Node、UI、安全/包测试以及必要的预编译。
node --test tests/environment/sidebar-tools.test.mjs
# 还应运行该工具现有的专项测试，失败不得执行步骤③。

# ③ 测试确认成功后，核对当前源码和候选字节相同，原子晋升。
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/<id> \
  --promote-from artifacts/sidebar-tools/<id>/candidate.opendesk-tool.json

# ④ 再次检查正式目录内文件与当前可重现构建逐字节完全一致。
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/<id> --check-project
git diff -- examples/sidebar-tools/<id>/
```

**唯一打包器实现这些门禁**：`--out` 构建单一目标文件；**禁止**直接 `--out examples/sidebar-tools/<id>/<id>.opendesk-tool.json` 绕过晋升；不带参数的默认构建只产生忽略目录下的临时 artifacts，不再自动覆盖任何项目根正式文件。`--promote-from` 要求正常候选文件、唯一正确文件名与匹配当前源码的规范原始字节；旧候选、损坏、符号链接、目录多份正式包时拒绝，原文件不被提前覆盖；成功时原子更新/如完全一致则不改。`--check-project` 做正式包同源审计，缺失/过期/多份拒绝。失败时保留最后一次可用的包，不能先删除再生成，也不得伪称晋升即安装。

**测试先于正式包并不等于真实 Chrome 验收已过**：Node/安全来源/规范包成功代表可提交并手动安装的候选（`PACKAGE_PASS`）；独立 Mac Chrome 实测未获得时标为 `INSTALLED_CHROME_NOT_TESTED` 等，不得凭提交包宣布 95+。需要用户真实安装/授权/更新的动作仍使用唯一 Side Panel 安装链；对已经公开给用户的工具，源码/发行字节改变应遵守正式版本升级和同 ID 数据迁移策略，不将同版本不同内容静默升级。

对于 HTML/CSS/JS 工具直接执行流程①；React/Vue 项目先按本项目固定依赖生成 IIFE + CSS，并确认 `dist/build-ready.json` 与本次源码一致再执行①。现有 `scripts/stage-sidebar-tool.mjs` 提供只读预览快照，**不作为正式安装包的持久副本**。无本地真实 Chrome/用户安装条件时，可在静态/Node gate 通过后晋升供手动安装，但必须清楚写明未实测的项。

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
