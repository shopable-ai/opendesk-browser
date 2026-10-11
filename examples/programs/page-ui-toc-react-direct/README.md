# Page UI TOC · React Direct 网页目录 Demo

这个项目是一个**可独立运行的 Page USER_SCRIPT React 组件示例**，用于学习「本地文件保存 → 自动准备 → 明确运行 → 悬浮 UI → 停止后清理」。它不是 `examples/sidebar-tools/reading-toc` 的替代实现，也不会安装到 Side Panel「我的工具」。

## 文件与职责

- `package.json`：独立项目 ID `sample.page-ui-toc-react-direct`、React 固定运行时、组件入口、限定测试网站。
- `src/main.js`：标准 `react` Hooks + `createElement()`；展示悬浮章节目录、三种视图、当前位置、点击滚动、动态更新。
- `src/toc-model.js`：只读取**当前网页 DOM** 的 H1–H6；选一个主要正文区域；保留元素引用以区分重复标题/ID；最多扫描 160 个标题。
- `src/toc-model.test.mjs`：无需依赖安装的模型回归测试。

OpenDesk 负责 React 19/ReactDOM 的固定包、受管 Shadow DOM 挂载和 Stop 卸载；本目录**不需要** `node_modules`、手动 Vite/Webpack 或从 CDN 下载 React。这里特意演示普通 JavaScript React，不使用 JSX。

## 使用：连接新项目后点击运行

从仓库根目录开启本地网页测试服务：

```sh
python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks
```

在 Chrome 中打开：

- `http://127.0.0.1:43111/reading-toc-article.html`（推荐，1 个 H1 + 20 个 H2，包含重复标题与 DOM ID）
- `http://127.0.0.1:43111/demo-form.html`（通用回归目标）

在**另一个**终端连接本项目（不要继续选择原 `page-ui-react-direct`，它只是计数器）：

```sh
cd "/Users/shopme/Documents/workspace/opendesk-browser/examples/programs/page-ui-toc-react-direct"
opendesk browser dev .
```

必要前提：已经安装/配对相容版本的 OpenDesk Native Host 与浏览器扩展，Chrome 已允许该扩展使用用户脚本，并获得测试网站的访问授权。

在 Chrome Side Panel →「开发」→「直接编辑本地项目」里：

1. 点击「刷新」，选择 `page-ui-toc-react-direct · 页面脚本`；确认显示「已连接 / 保存后自动准备」。
2. 点击「运行本地项目」。页面右上角出现 `CONTENTS` 浮动卡片；默认「当前」，也可以选择「概览」与「全部」。
3. 点击第 20 节，检查准确定位与高亮；修改测试页章节内容后，目录自动刷新。
4. 编辑并保存 `src/main.js` 中的 `CONTENTS` 或样式值，确认**只自动准备，不自动运行**。再次手动运行才能看到新代码；旧实例由运行时按原规则清理。
5. 点击 Side Panel 中「停止」，检查网页卡片消失；不应保留额外 DOM、MutationObserver、scroll/resize 监听。刷新网页不应因为曾经运行 Demo 而自动注入。

**注意**：包规则只覆盖 `http://127.0.0.1:43111/*`，不是 `localhost`，不授予任何远程网站权限。另一个端口或域名需要在项目规则与网站授权层同时调整，不能只改 URL。网站中的 `h1` 及其 `id` 不会被这个 Demo 修改。

## 测试

```sh
node --test examples/programs/page-ui-toc-react-direct/src/toc-model.test.mjs
node --test tests/environment/page-ui-toc-react-direct.test.mjs
```

第二项须在完整仓库、已安装其现有根依赖的环境执行，测试项目校验与自动生成的 React 组件入口；不要求运行本示例的 npm install。真实 Chrome 执行与 Stop 仍需在 Mac 本机人工验收，不能由 Node 组件测试代替。

## 与官方阅读目录的区别

| 项目 | 本 Demo | `reading-toc` 正式工具 |
| --- | --- | --- |
| 所在目录 | `examples/programs/page-ui-toc-react-direct` | `examples/sidebar-tools/reading-toc` |
| UI 运行位置 | 当前网页中的受管 React 悬浮组件 | Side Panel + 可信 Content Script 页面目录 |
| 权限/接口 | Page USER_SCRIPT 网站授权，直接读取同一网页 DOM | `page.toc` + `toc.snapshot` / `toc.navigate` 的受控能力 |
| 复杂场景 | 单一主要正文、简单概览，便于理解源码 | AI 多回答来源、网站适配、拖动和站点位置记忆等 |
| 退出 | 开发 Tab 点击 Stop，React 卸载并断开监听 | 网站开关/卸载，按正式工具生命周期清理 |

这个项目是**简化的教学实现**，不与官方目录复用特权调用链，也不声称完全复制官方阅读目录的算法或权限行为。

参考：[React Direct 标准入口](../page-ui-react-direct/README.md) · [阅读目录正式工具](../../sidebar-tools/reading-toc/README.md) · [Page 框架说明](../../../docs/api/page-ui-frameworks.zh-CN.md)。
