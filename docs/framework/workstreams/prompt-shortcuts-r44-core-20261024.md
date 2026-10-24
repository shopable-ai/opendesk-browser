# OpenDesk Browser R4.4-CORE：正式包已就绪，真实升级未完成

日期：2026-10-24（Asia/Shanghai）。工作目录 `/Users/shopme/Documents/workspace/opendesk-browser`，分支 `main`。本轮继续顺序为：安全同步 → 包一致性 → 更新真实安装 → 实机布局 → 业务回归 → 失败驱动修复。

## 已完成与证据边界

- 开始 HEAD `8638fa27845f6814d384af7061584dcefacd538a`；保护已有未提交文件后，快进到当时最新 `origin/main` `fbd6708a3c3d0a8db4bbc98a7ddea53cee5df6e9`。并行会话仍在推进 main，后续 HEAD 以 Git 实读为准；没有创建分支、worktree、PR，没有 stash、reset、clean 或强推。
- 实际发行差异：源码 `tool.config.json` 已是 1.1.16，唯一正式 JSON 仍是 1.1.15。现有 `npm run dev` watcher 持续写入 `dist/development`，本轮未启动第二个 watcher、静态全量构建或替换加载路径。
- 原 `npm run app:update -- prompt-shortcuts` 成功，完成临时候选、包测试、`--promote-from` 及同源读回。正式包为 **1.1.16 / 141,418 bytes / SHA-256 `90494dc67c32310d2db74195ed2812895c66c7c9de0f8db029115476a16f628d`**，与 `dist/development/official-tools/prompt-shortcuts/prompt-shortcuts.opendesk-tool.json` 逐字节相同。能力、ID 和 SDK 要求未增加。
- Chrome 扩展详情实读：OpenDesk Browser Developer 0.1.0，已启用，ID `ccfcjegpkdlgbclopjmadlcjedelidmf`，实际加载路径为本仓库 `dist/development`。调试页显示开发服务已连接，观察时 revision 为 `5d9c2020a9b931787adabebfeb7ffdc6b0178fd9503158be83754a9671b0bd02`；watcher 随并行源码更新继续产生新 revision，该观察不能证明后续 revision 已在 Chrome 应用。
- 已安装 Prompt Shortcuts 详情实读：**1.1.15**，已启用，来源 OpenDesk 官方市场 `opendesk/prompt-shortcuts`，包 SHA-256 `4085c155d2d8dbac7b55cc5dcaea24229a3fb1d6cfb69431dad2ae5c0eb33ce0`，显示可更新。没有取得更新成功回执，不能把正式 JSON 晋升当作已安装。

## 最小验证

本轮包晋升需要证明导入导出、升级数据及官方身份保护未被破坏，执行了以下现有检查。原始日志位于忽略的本机目录 `artifacts/r44-core-01a16cbd/`，没有把日志堆叠提交进仓库。

| 检查 | 范围 | 结果 |
| --- | --- | --- |
| management 定向 | `R2.7`、`R4.3 export`、`R1.7 official header`、`R1.16.1` | 15/15 PASS |
| Host 与 secondary header 定向 | `Prompt/prompt/download/export/official/forged` | 22/22 PASS |
| `sidebar-tool-export-bridge-host.test.mjs` | 一次点击、intent、重放、撤权、未知结果与下载能力 | 51/51 PASS |
| `app:update` 自带 `sidebar-tools.test.mjs` | 包路径、规范化、候选晋升与沙箱合同 | 6/6 PASS |
| `--check-project` 与实际字节比较 | 唯一正式包、当前源码、开发官方资源 | PROJECT_PACKAGE_MATCH |

management、Host 等测试在执行时含其他会话未提交改动，因此上述是**本机工作树组件结果**，不能冒充干净提交 CI 或真实 Chrome 业务结果。测试源码没有纳入本轮提交。没有为满足断言修改产品，也没有执行 Preview/Mock 来替代真实更新。

## 当前阻断与下一条用户操作

原生 UI 操作过程中，Chrome 的活动窗口及控件身份多次变化。为独立绑定本轮产品页，尝试经浏览器工具打开已安装扩展 `sidepanel.html`，自动安全审查拒绝：允许协议只有 HTTP/HTTPS，不允许 `chrome-extension://`，并明确禁止通过其他路径绕过。本轮随后停止受影响的浏览器操作，未使用 CDP、脚本或其他浏览器路径绕过。

下一步仍是**在原可信安装界面完成 1.1.15 → 1.1.16 同 ID 更新并读回版本/包身份**。已请求用户在「扩展 → 提示词快捷按钮 → 审阅新版」完成该动作并提供实际结果；不得先卸载，必须保护原提示词、图片、网站规则与授权。更新结果明确后才判断布局，不根据旧产品截图修复新源码。

## 源码核对与未验收事项

只读定位确认正式 React 顶栏在 `src/ui/react/tabs/tool-host.tsx`，Scheduler 入口在 `src/ui/react/tabs/my-page.tsx` 并由 `src/ui/scheduled-task-workbench.js` 打开原运行页。JSON 导出预留原生点击的修复 `e71b3fa9e` 已在 `main`，接线位于工具 `src/main.js`、`src/sidebar-tools/bridge.js` 与 `src/ui/sidebar-tools.js`。这些只能标为 `SOURCE_WIRED`；更新后正确运行仍未验证，不能标 `ALREADY_IMPLEMENTED` 产品验收通过。

本轮没有复现更新后产品缺陷，因此没有改 React/CSS/Host/Bridge 或工具业务源码；只晋升已有源码对应的正式包并记录事实。

- 安装与升级、提示词/图片/网站配置/授权保留：NOT_TESTED。
- 更新后右上角 320/360/400/440/520px × 深浅色、30px 按钮/2px gap/透明背景、重复工具栏和滚动条：NOT_TESTED；没有持久化更新后实机截图。
- 新建、编辑、保存、重开；导入预览/追加/替换/冲突；Chrome 导出下载；未保存返回；AI Chat 真执行；设置、启停、卸载；Scheduler 真打开：NOT_TESTED。
- 第三方不能取得官方权限：上述定向组件保护通过，当前安装版真实浏览器隔离仍为 NOT_TESTED。
- 当前提交 CI：待正常推送后的原始 run 核对；不能继承旧 run 的成功。
- 更新可靠性、真实视觉、交互、业务完整性、数据权限安全、发行升级质量六维及算术平均：均 NOT_SCORED，没有最终 PASS。

Goal 仍未完成。本记录不暂停、不迁移或宣告完成该目标。
