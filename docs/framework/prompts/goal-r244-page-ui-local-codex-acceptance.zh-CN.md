# GOAL：OpenDesk Browser R24.4 · 本地 Codex 真实 Chrome 测试修复验收

> 日期：2026-10-12。默认中文。本文件专门用于**直接复制到本地 Codex**；请在真实 Mac 工作区执行必要检查、修复和测试，不要只生成另一份设计。R24.1/R24.2/R24.3 的既有已通过证据必须逐项复用而不是无意义地重跑。

## 1. 目标和安全边界

GitHub：https://github.com/shopable-ai/opendesk-browser

本地：`/Users/shopme/Documents/workspace/opendesk-browser`

**唯一允许写入分支：main。** 禁止新分支、Git worktree、PR、force push、破坏性 reset/clean，不能覆盖其他 Agent 未提交的源码、占用别人的 Chrome Profile、端口、dist、数据库或历史证据。先读取 `AGENTS.md`、`docs/framework/testing-guide.md`、`docs/api/page-ui-frameworks.zh-CN.md`、`docs/architecture/browser-framework/page-framework-authoring-r243.zh-CN.md` 与对应 `docs/framework/workstreams/`。执行任何写操作前核对 `git status --short --branch`、`git rev-parse HEAD`、`git fetch origin main`、`git rev-parse origin/main`、文件级差异及并行资源所有者。发生实际冲突就只读报告并等待用户决定，不擅自隔离或强制处理。

本轮授权在没有并行冲突、关键回归和真正 Chrome 验收满足要求后，在 `main` 直接完成小范围修复、文档、提交并正常推送；**不进行发布商店、重写发行包或擅自更改权限/原 Page Runtime 预算**。

## 2. 用户想要的实际开发方式（必须保留）

普通用户只编写组件，点击「运行」就注入到**获准的目标网页**：

- `examples/programs/page-ui-react/src/App.jsx`：官方 React 19 JSX + Hooks，`export default App`，项目保存自动准备；用户不运行 Vite 或 npm。
- `examples/programs/page-ui-vue/src/App.vue`：Vue 3 `<script setup>`、`<template>`、`<style scoped>`；由 OpenDesk 准备。
- `examples/programs/page-ui-react-direct/src/main.js`：普通 React JS + 官方 import，当前默认可在不同获准 HTTP(S) 页面悬浮显示；用户无需自己调用 `createPageUI`。
- `examples/programs/page-ui-vue-direct/src/main.js`：普通 Vue JS + `h/ref`，由已有组件入口自动挂载。
- **浏览器无 Native 入口**：Side Panel → 开发 → 直接编辑 → 「React JSX」或「Vue SFC」；用户粘贴原始组件源码，明确点击「运行 React/Vue 组件」，转换在扩展固定 Dedicated Worker 中完成，执行仍经过原 Page USER_SCRIPT 及站点授权。浏览器单组件编辑不能冒充 Native 多文件目录同步。
- **Native 本地目录入口**：配对本机服务后在目录运行 `opendesk browser dev .`，保存只自动准备，不得自动注入或重放；必须用户点击「运行本地项目」才执行最新源码。旧 `async-main`、Controller 零参数 `main()`、历史 JSON 草稿仍必须兼容。
- 组件依赖来自扩展内版本固定、SHA-256 校验的 React/Vue 资源，不访问目标网站框架、CDN、MAIN 世界或 eval。每次 Stop 调用原 `previewId` 清理 React root/Vue app、受管样式和自有监听器；不声称已撤销网站业务操作。

## 3. 先核查源码与现有真实证据

关键文件：

- UI / 组件准备：`src/ui/script-editor.js`、`src/ui/page-component-preparer.js`、`src/ui/page-component-compiler-worker.js`。
- 统一组件链接器：`scripts/page-component-entry.mjs`、`src/libs/page-frameworks/page-component-browser-linker.js`、`src/libs/page-frameworks/page-component-linker-r243.mjs`。
- 权限与受管执行：`src/scripting/user-scripts/page-ui.js`、`execution-source.js`、`preview.js`、`managed-ui-lifecycle.js`、`page-program-rules.js`。
- 预装运行时：`src/libs/page-frameworks/contract.js`、`loader.js`、固定 React/Vue 资源。
- 草稿导入：`examples/import-ready/page-ui-react.opendesk-draft.json`、`page-ui-vue.opendesk-draft.json`、`page-ui-react-direct.opendesk-draft.json`、`page-ui-vue-direct.opendesk-draft.json`。JSON 是预先冻结的执行代码，不代表重新编译源码，不能改变历史证据文件。

已验证历史候选（核对 GitHub Actions 日志、真实源码依赖及 packageHash，再决定能否复用）：

- `38154353894`：四种 R24.3 组件与历史两例真实 Chrome 交互/Stop。
- `38155034890`：React 20 + Vue 20 次**不同** previewId/documentId 的真实 Run/Stop。
- `38225425847`：真实 macOS Chrome 中无 Native 的浏览器原始 React JSX / Vue SFC 编译、指针点击、Stop；还覆盖无效 Vue 源码与恢复、Teleport。
- 这些 PASS 都绑定各自旧提交，不能自动升级为当前 main、R24.4 完整矩阵或最终 ZIP/F3 PASS。

## 4. 最小可信 Node 回归

只在无并行 `node_modules` 或构建冲突时执行：

```sh
cd /Users/shopme/Documents/workspace/opendesk-browser
node --version
node --test \
  tests/environment/page-component-entry-r243.test.mjs \
  tests/environment/page-jsx-component-r243.test.mjs \
  tests/environment/page-vue-component-r243.test.mjs \
  tests/environment/page-vue-sfc-transform-r243.test.mjs \
  tests/environment/page-direct-component-r243.test.mjs \
  tests/environment/page-component-browser-linker-r243.test.mjs \
  tests/environment/page-component-preparer-r243.test.mjs \
  tests/environment/page-component-import-ready-r243.test.mjs \
  tests/environment/page-component-draft-import-r243.test.mjs \
  tests/environment/page-ui-no-build-r242.test.mjs
npm run check
```

缺少依赖时按既有 lock 使用 `npm ci --ignore-scripts --no-audit --no-fund`，不得自动升级 React/Vue、Babel 或 compiler-sfc。受影响时运行 `npm run build:dev`、`npm run build` 和 `npm run verify`，但先检查 dist、证据目录与构建锁无人占用。记录命令、退出码、文件身份、失败的首个真实堆栈，不能用改断言掩盖产品缺陷。

## 5. Mac Chrome for Testing 验收（浏览器交互必须真实）

统一标准网页（若 `43111` 由其他 Agent 占用，停止启动自己的服务并报告，不杀已有进程）：

```sh
python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks
```

用受控独立 CFT Profile 加载刚构建并核实 packageHash 的 unpacked MV3 扩展，开启 Chrome「允许用户脚本」，在目标网页确认 Site Access。不要复用日常 Chrome 或其他测试者 Profile。依照以下**现成原生驱动/CI 合同**运行，而不是编造新执行器：

- `tests/framework/page-browser-worker-r243-cft.mjs` + `.github/workflows/page-browser-ui-r243-cft.yml`：无 Native 的直接编辑、React/Vue 运行、真实指针点击/计数、受管 Stop、无效源码拒绝、恢复、Teleport。
- `tests/framework/page-framework-r243-loop-native.mjs` + `.github/workflows/page-framework-r243-long-loop.yml`：40 次独立 Run/Stop；该模块是现有验收驱动的导出助手，**不要当成独立可执行测试直接 `node`**。
- `tests/framework/page-frameworks-r242-native.mjs` 及 `tests/framework/local-dev-native-acceptance.mjs`：Native/MCP 本地目录、冻结源码与清理回执。请先读源文件和所绑定工作流，再决定是否复测。

浏览器手动点击时，React/Vue 默认按钮最初应显示「已点击 0 次」，真实指针点击后变为「已点击 1 次」；停止后 Shadow DOM/宿主消失。侧栏技术详情应记录 `state=preview-evaluated`、`packagedFrameworkId`、`sourceHash`、`managedPreviewId`、`documentId` 与真正 Stop receipt；不得只靠页面截图认定执行成功。无效源码必须报清楚的转换错误，不得把上一次成功源码/回执重新运行。

R24.4 还需独立完成：**浏览器无 Native 的 React 20×/Vue 20×「修改源码 → 编译 → Run → 实际交互 → Stop」**，每次独立 sourceHash/previewId/document 绑定；SPA 同文档离开/返回、BFCache、撤权、目标网页拒绝/新许可、暗色/200%/窄屏/键盘及强 CSP。必须在真实可控制的环境按场景验证；不擅自放宽命名世界预算，不伪造 CDP Native Ack，不用 JS `element.click()` 代替真实用户指针。

## 6. 故障修复与交付

如果失败：定位源文件、复现条件、是否属于当前相关输入；增量修复现有消费者与源实现、补回归测试，不重建第二套 SDK/编译器，不放宽权限、CSP、代码预算。写清楚安全阻止情形和受影响文件，变动之后只重测受影响链。其他 Agent 占用就停止对该文件写入并报告。保存到本 GOAL **以外** 的对应工作流专属记录与证据路径，不覆盖历史成功或失败。

最终向用户输出：

1. 实际更改文件清单、所在目录、提交 SHA、push 结果及与最新 main 的关系；
2. 四种示例源码、浏览器直接编辑、Native 本地编译、预生成 JSON 各自的实际使用路径；
3. Node/构建/真实 Chrome 的具体 PASS/FAIL/NOT_TESTED、来源、候选及回执身份；
4. R24.4 安全、兼容、权限、生命周期、官方组件语法、UX、性能/无障碍、文档 **分别评分**；缺真实原生证据标 `NOT_TESTED`，不得凑出 >=95；
5. 确切阻塞与需人工处理的权限/浏览器/并行资源，按 P0/P1/P2 排序，必要修复继续在 main 完成，不能只产出下一份提示词。

**完毕标准：** 对已授权可写且未被他人占用的项真实修复、原生证据闭环，正式不合格项继续开放；不能因为源码存在或历史 CI 成功就声称全产品已完成。
