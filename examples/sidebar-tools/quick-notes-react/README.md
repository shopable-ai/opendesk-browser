# Quick Notes React · 双版本独立并存

这是基于真实 Quick Notes 的 React 19 + Shared UI 实现：原版在 `../quick-notes/`，工具 ID `quick-notes`；React 版工具 ID `quick-notes-react`、版本 `1.0.0`。**没有修改原版；安装和数据都按工具 ID 隔离。**

## 功能与开发归属

- 多条笔记新建/编辑/选择/保存/删除，最多 16 条，共用一个 8 KiB `notes` 存储项。
- 手动刷新/可选关联当前 HTTP(S) 网页；切换页面后防止旧关联静默保存。
- Cmd/Ctrl+S 保存、未保存切换确认、内联键盘可操作确认、失败保留草稿。
- ETag `storage.get({withEtag:true})` / `storage.set({ifMatch})` 防止窗口间覆盖；旧字段 `note` 只在**本工具自己的命名空间**恢复与清理。
- `tasks.open` 只打开已安装任务，**不自动执行**。
- `src/model.js`：可单测的无 DOM 业务合同；`src/App.jsx`：正式交互和 SDK 请求；`src/main.jsx`：独立 Root 和清理。
- 从 `@opendesk/ui` 复用 Button、IconButton、Card、CardContent。React/ReactDOM 由 OpenDesk 浏览器既有共享 Runtime 提供，不随工具重复打包。

## AI 连续开发（不更新正式安装包）

在真正的 Mac 项目中，Codex 修改本应用的 `src/`；项目级 Vite 只编译本应用，原 Native watcher 只校验并发布完成的快照。**它们是不同的 watcher**，在启动前先检查是否已有进程，不重复启动，也不覆盖 Browser 的 `dist/development`：

```sh
# 新环境首次准备应用编译依赖；已有正常监听时无需重装或重启。
npm ci --ignore-scripts --no-audit --no-fund --prefix examples/sidebar-tools/quick-notes-react
# 终端一：仅当项目尚无 Vite watch 进程时启动。
npm run watch --prefix examples/sidebar-tools/quick-notes-react
# 终端二：仅当本项目尚无 stage watch 进程时启动。
node scripts/watch-sidebar-tool.mjs examples/sidebar-tools/quick-notes-react
```

Vite 产物由 source-bound `dist/build-ready.json` 证明；stage 只在完整回执通过且源码未漂移时发布 SHA 快照。编译失败不会把错误产物当作新快照，也不会修改 `quick-notes-react.opendesk-tool.json`。实际入口为「开发 → 本地项目 → quick-notes-react → 在侧栏调试」：Native Workspace 标签页保留目录与会话归属，应用显示在同窗口真实 Side Panel。点击「在侧栏调试」即可使用 `storage.get/set`，不再单独批准存储或显示“已批准”状态；开发数据在内部与正式安装版分开。同一来源、工具和能力范围内，成功 JSX 快照使用新实例重新校验，沿用本次调试意图；Stop、归属变化、断连、范围变化或未知写入结果不会自动重启或重放写入。网页信息仍按原目标和能力范围核验。

## 只有应用源码时，哪些步骤能独立使用

本项目已声明自己的固定版本 Vite 和 [package-lock.json](package-lock.json)，`build` / `watch` 不再引用 Browser 仓库的 `../../../node_modules`。拿到应用目录后，在 Node.js 22.12+ 环境中可直接编译：

```sh
# 在你自己的 quick-notes-react 目录中执行，目录不必放在 Browser 仓库内。
npm ci --ignore-scripts --no-audit --no-fund
npm run build
# 持续修改时使用；已有本项目 watch 时不重复启动。
npm run watch
```

这会生成本应用的 `dist/tool.js`、`dist/tool.css` 和 `dist/build-ready.json`。React 与 `@opendesk/ui` 仍是 OpenDesk 沙箱提供的共享运行时，无需再安装一份 React，也不能直接把这些文件当作普通网页打开。

2026-10-29 已在仓库外临时目录验证独立安装、编译、保存 JSX 后的 watch 更新，以及源码/产物摘要匹配；原仓库 stager 也接受该外部项目并生成快照。这证明应用编译与外部目录可用，未证明 stage 已独立发行；本次没有操作 Chrome 或重新验证安装。

**编译独立可用，连续侧栏调试工具尚未独立交付。** `stage:preview`、`compare` 是仓库内的维护者对照预览；Native 快照监听和正式 JSON 打包也仍使用 Browser 仓库脚本。仅复制本应用目录还不能独立完成「保存 → 真实侧栏更新」。目前可由维护者用原 `watch-sidebar-tool.mjs` 指向你的应用绝对路径，你在原 Native 界面连接并授权该目录后再进入侧栏调试。后续最小交付是把原 stage/watch/打包器及所需固定资源一起分发为开发工具，详见[现有能力与剩余缺口](../../../docs/api/sidebar-tool-development.zh-CN.md#没有-browser-源码普通用户能否这样开发)；当前没有可宣称已发布的独立 npm CLI。

## 现在手动试：改一个字符就看到界面变化

AI 已启动或确认已有监听时直接使用，不再启动第二份。Chrome 进入「开发 → 本地项目 → quick-notes-react → 在侧栏调试」，在 VS Code 打开 [src/App.jsx](src/App.jsx)，搜索第 261 行附近的 `我的笔记`：

1. 将标签文字改为 `我的笔记 · 手动修改`，按 Cmd+S。
2. 等编译与快照发布完成，在真实侧栏看到新标签；无需安装、导入或刷新浏览器。
3. 把文字改回并保存，看到原标签恢复。若应用里有未保存笔记，先保存或结束编辑，才能自动替换界面。

样式入口是 [src/style.css](src/style.css)；React 挂载及 SDK 接线是 [src/main.jsx](src/main.jsx)。先只改自己的 UI 文件，不改应用 ID 或能力，也不改 Browser 共享组件。完整[手动步骤、更新原理及无 Browser 源码的现状](../../../docs/api/sidebar-tool-development.zh-CN.md#手动改文字观察真实侧栏quick-notes-react)见统一开发规范。

```sh
# 仓库根执行，只打开编辑器，不修改源码。
code --new-window examples/sidebar-tools/quick-notes-react \
  --goto examples/sidebar-tools/quick-notes-react/src/App.jsx:261
```

## 日常最小验证（2026-10-29）

当前先确认几个基本 SDK 调用与开发更新，不遍历全部 SDK：

1. 在真实 Side Panel 调试界面读取、保存一条隔离笔记，按需读取一次标准测试页标题/地址。
2. 修改本项目 `src/App.jsx` 的可见文字，确认现有 Vite/stage watcher 更新真实侧栏，再恢复源码。双更新与编译失败保留已有证据可复用，不反复重测。
3. 本应用还使用 `@opendesk/ui` 的共享 Button/Card 等组件。共享组件源自 `src/ui/react/components/ui/`，通过固定 `sidebar-shared-ui` 入口提供给沙箱；需另做一次相关组件的可见变更/恢复检查。它可能触发 Browser 的安全刷新或重载，不承诺 React Fast Refresh 或保留原 iframe。

React JSX、共享 UI 资源与 iframe 内 SDK 是不同链路；任何一项没有真实可见证据都不能由另一项代替。只运行本次失败或改动直接涉及的定向检查。2026-10-29 已在真实侧栏完成隔离读写、标准页标题/地址、JSX 可见更新/恢复和共享 CardContent 可见更新/恢复。两处临时源码均已逐字节恢复；共享资源变更经过 Browser 安全重载后从原入口重开，不承诺原 iframe 或 session 数据跨扩展重载保留。不为此进入全 SDK、正式安装、评分或全量回归。

## 正式安装前的可选验证：Mac main

以下是明确进入安装/正式验收时才使用的步骤，不是日常修改、热更新或本轮收尾的前置条件。

从仓库根目录执行；使用已有 watcher 时**不要覆盖正在运行的 dist/development**，应先检查它对应的 Chrome 与扩展构建。项目内的 JSX 编译不重构整个浏览器。

```sh
npm ci --ignore-scripts
# 若 dist/development 不存在，且当前没有并行开发任务占用它，才运行：
npm run build:dev
npm run build --prefix examples/sidebar-tools/quick-notes-react
OPENDESK_SHARED_UI_EXTENSION_DIR=dist/development npm run stage:preview --prefix examples/sidebar-tools/quick-notes-react
node --test tests/environment/sidebar-quick-notes.test.mjs tests/environment/sidebar-quick-notes-react-r21.test.mjs
node --test tests/environment/sidebar-quick-notes-react-pack-r21.test.mjs
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/quick-notes --out artifacts/sidebar-tools/quick-notes/native-candidate.opendesk-tool.json
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/quick-notes-react --out artifacts/sidebar-tools/quick-notes-react/react-candidate.opendesk-tool.json
OPENDESK_SHARED_UI_EXTENSION_DIR=dist/development node examples/sidebar-tools/quick-notes-react/scripts/compare.mjs > artifacts/quick-notes-comparison.json
node --test tests/environment/sidebar-quick-notes-react-r22-compare.test.mjs
```

浏览器访问（需确认端口闲置，再以仓库根作为根目录运行 `python3 -m http.server 43129 --bind 127.0.0.1`）：

`http://127.0.0.1:43129/examples/sidebar-tools/quick-notes-react/preview/compare.html`

左边由原版**正式源码**生成，右边使用 React **正式 JSX 编译字节**。预览 SDK 为仅驻内存的演示适配，绝对不能用于证明真实数据持久、Host ETag/权限或已安装 Chrome；不会访问原版已有用户数据。

在 OpenDesk 扩展中心，分别选择两个 candidate JSON → 核对 ID / 权限 / 版本 → 用户主动确认安装；切勿用 `quick-notes-react` 覆盖 `quick-notes`，也不能自动卸载原版腾出安装名额。测试只用临时 Chrome Profile 与等价测试笔记。**升级前不要卸载，卸载会清除对应工具自己的数据。**

全部正式检查通过后才能把 React 候选晋升为根目录唯一安装包：

```sh
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/quick-notes-react --promote-from artifacts/sidebar-tools/quick-notes-react/react-candidate.opendesk-tool.json
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/quick-notes-react --check-project
```

未执行 Mac 构建、宿主 E2E、Chrome 真实安装或资源采样的环节，必须写 `NOT_TESTED`，不得把本项目的预览或模拟 SDK 当作 PASS。详细公平性、分项评分与验收门槛见 `COMPARISON.zh-CN.md`。

## 实际扩展 Host SDK 交叉验收（本轮延期）

沿用 `scripts/tests/quick-notes-react-r21-installed-chrome.mjs`：在**隔离临时 Chrome Profile** 中加载真正的 OpenDesk MV3 扩展，核验 Chrome 返回的 `SIDE_PANEL` 上下文和最终 `hostInstanceId` URL，从扩展中心经真实审阅安装 React 工具（原生 Quick Notes 若已预装则验证原版包 SHA）。普通 `tool.html` 标签页只显示任务目录，不能替代真实 Side Panel。

测试通过真实 SDK 验证隔离读写、浏览器完整重启、ETag、8 KiB/16 条上限、未知结果草稿保护、关联网页、Chrome 收回站点访问后的离线保存、更新拒绝、停用撤销已打开 iframe、恢复、卸载确认及重装。Chrome 设置里的 Site Access 选择由实际 WebUI 处理，并以 `permissions.contains` 独立核对；没有模拟 SDK。缩放与不同宽度不属于本轮要求，默认跳过；保留的历史诊断仅在显式设置 `OPENDESK_QN_LAYOUT_CHECKS=1` 时执行。

先在独立终端启动标准页面；`CHROME_BIN` 指向用于验收的 Chrome/CFT。Mac 有界面模式使用 `OPENDESK_QN_HEADFUL=1`，Linux CI 与 Mac 结果分别记录。若共享构建正被其他会话更新，应使用已校验的只读 Host 产物快照设置 `OPENDESK_SHARED_UI_EXTENSION_DIR`，不能覆盖日常 watcher 输出。

```sh
python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks
# 另一个终端；先完成上方构建与候选包门禁。
OPENDESK_QN_HEADFUL=1 node scripts/tests/quick-notes-react-r21-installed-chrome.mjs
```

Mac 自动化 PASS 不代表 Linux CI、VoiceOver 人工体验或性能测试 PASS。当前发布状态和必要的未测项见 `RELEASE-STATUS.zh-CN.md`。
