# R33.3.3 React Extension/Developer 交接、证据与剩余项

## 唯一所有权及业务边界

本轮在 GitHub `main` 直接修改可信 Side Panel。只使用 `src/ui/react/main.tsx` 的一个 React Root；固定组件通过 Portal 接管对应 DOM 子节点。不改 Browser SDK、Host、Installer、Sandbox、权限、编译器或 `examples/sidebar-tools/`。

- Extension Center：`extension-center-row-menu` 的菜单项交由 `ExtensionRowMenu` Portal 渲染；原 `extension-center.js` 继续独占定位、焦点键盘策略、业务动作、包身份、权限确认和 Host 回读。旧 DOM fallback 仍可在非 React 测试宿主使用。
- Developer：React `DeveloperActions` 接管 `script-run`、`script-save`、`script-stop`。接管前 `Script Editor` 显式解除三个旧监听器；经真实事件 `event.nativeEvent` 转交原 Run/Save/Stop。React 不重新实现 Host、RunId、权限、草稿、取消或清理。
- Developer：React `DeveloperFramework` 接管 JavaScript/React JSX/Vue SFC 代码类型 radio。原 `chooseComponentMode` 仍作 Standard/Developer 版本、项目/预览、源码与草稿切换的唯一裁决；受控 radio 以可信 click/change 驱动且在同一代码类型内去重。
- Developer：React `DeveloperRunStatus` 接管 `script-status` 的文本与状态显示；状态仍由原 `display()` 派生。
- `script-source`、`script-params`、本地项目/源码读取、编译结果与历史均保持既有 DOM 和数据单一所有权。本轮不得因为 React 视觉组件存在就宣布开发 Tab 完整迁移。
- 继续保留 original CSS 和工具 opaque-origin iframe。无第二 Root，无人工合成点击，离线与未知副作用必须继续安全拒绝。

## 修改及验证范围

本轮主要变更：

`src/ui/react/main.tsx`、
`src/ui/react/tabs/develop.tsx`、
`src/ui/react/tabs/tools.tsx`、
`src/ui/script-editor.js`、
`src/ui/extension-center.js`、
`src/ui/tool-shell.js`。

新增和增强回归：

`tests/environment/react-sidebar-r333.test.mjs`、
`tests/environment/react-sidebar-render-r3331.test.mjs`、
`scripts/tests/react-sidebar-r3331-browser.mjs`。

`.github/workflows/extension-center-r4.yml` 在双构建、verify 后加入 `npm run build:size`，让固定入口审查同候选运行。没有削弱安全检查和代码体积上限。

## 证据（不得误用历史 PASS）

- 历史通过基线：[CI #38941304093](https://github.com/shopable-ai/opendesk-browser/actions/runs/38941304093) 属于旧提交，不证明本轮。
- R33.3.3 第一次 [CI #38949353635](https://github.com/shopable-ai/opendesk-browser/actions/runs/38949353635)：React TSX/DOM/安全测试通过，Chromium 对连续 radio 切换的第二次 Vue 点击报 FAIL；随后增加真实 click/change 兼容与去重。此失败不能标记 PASS。
- 后续 [CI #38950864927](https://github.com/shopable-ai/opendesk-browser/actions/runs/38950864927) 已确认源码 React/DOM 安全 16/16 通过，Chromium 在状态 Portal 发现真实文本交接错误：旧静态文案与 React 状态串联为「正在连接可运行」。这是 Portal 保留原静态子节点的问题，不是文案断言问题。提交 `cec20af0fc5dfd89d94b58d61760610a7416f991` 在首次 Portal render 前备份/清理运行状态文本和当前网页状态占位节点，并将正式 HTML 初始提示写进 Chromium fixture；仍须取新候选真实 CI 回执。
- 最新候选与触发 CI 持续以实际 `main` 及 GitHub Actions 为准，测试未返回就记 `NOT_TESTED/IN_PROGRESS`；不得借旧绿色 CI 替代。
- 本聊天无权访问 `/Users/shopme/Documents/workspace/opendesk-browser` 的 Mac 工作树与已安装 Chrome，因此 `INSTALLED_EXTENSION_NATIVE_CHROME` 必须记 `NOT_TESTED`，不能推导真实 Extension ID、Native Host 收据或资源清理成功。

## 必须继续完成

1. 对本轮最终 SHA 的 GitHub Actions 核实静态 React、真实 Chromium 点击、权限/Host 定向测试、Production/Development/verify/build:size 全链路；发现 FAIL 直接定位修复并重新取同 SHA 回执。
2. 在本地 Mac Codex 使用最新 `main`，检查工作树与其他 Agent 修改，不覆写、不 clean/reset；在同一候选执行 `npm run check`、测试、`node scripts/tests/react-sidebar-r3331-browser.mjs`、`npm run build`、`npm run build:dev`、`npm run verify`、`npm run build:size`。
3. 对相同候选的 Mac Chrome 真实已安装扩展核验 Extension ID、包 SHA、Commit SHA、Chrome/Native Host 连接，再操作扩展安装/启停/撤权/清理、详情返回、开发编辑/保存/Run/Stop/重开回读，记录真实 Host 操作证据。
4. 按明确的唯一草稿数据源与 IME/光标保护方案继续迁移源代码输入、参数、保存草稿、本地项目、编译定位、历史；完整回归后才扩展工作流、我的、云控。未执行的一律 `NOT_TESTED`。
