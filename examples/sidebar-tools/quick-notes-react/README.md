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

## 先测试再安装：Mac main

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
OPENDESK_SHARED_UI_EXTENSION_DIR=dist/development npm run compare --prefix examples/sidebar-tools/quick-notes-react > artifacts/quick-notes-comparison.json
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
