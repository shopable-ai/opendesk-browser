# AdBlock 预览 · 当前 React 产品与历史原型

**当前产品 UI 只维护 `../src/App.jsx` 及其真实依赖。** 该目录不再维护独立 React + HTM `AdBlockApp`、其样式副本或第二个 Mock Service。

## 当前同源交互预览

在仓库根目录执行：

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run build
node scripts/preview/build-preview.mjs --tool adblock --surface side-panel --scenario success --theme light --width 360 --height 760 --out artifacts/previews/adblock/review.html
open artifacts/previews/adblock/review.html
```

预览是真实 JSX 编译包 + 固定 Shared UI Runtime + 仅在预览宿主模拟的 SDK 操作回执，**不是**另一套 React UI；更不是安装的 Chrome 扩展或网络拦截证据。可以用 `--width 320/360/400/440`、`--theme light/dark` 和既有场景选项生成不同状态。真实浏览器 DOM 交互回归运行 `node scripts/tests/adblock-preview-chrome.mjs artifacts/preview-chrome`。

## 手动屏蔽网页元素 · R2 交互评审（待用户确认）

[打开交互评审 HTML](./adblock-element-picker-r2-review.html)：在现有侧栏布局下演示「选择网页元素 → 微调范围 → 预览隐藏 → 确认屏蔽 → 单站规则恢复」。自带固定的新闻、视频和购物网站模拟 DOM，支持受限网页、例外、深浅色与窄屏，规则仅存于此 HTML 的本地演示存储。

**此文件不是正式产品或同源 React 预览。** 它仅用来在用户确认交互之前评审新增功能，不进入构建、发布、Host 或 Chrome DNR。当前 React 产品仍以 `../src/App.jsx` 为唯一 UI；确认后直接在正式源码实现网页元素屏蔽，并在 `artifacts/previews/adblock/` 生成同源验收预览。`index.html` 的 R1 历史哈希保持不变。

## 历史设计档案

`index.html` 是经用户批准的 R1 纯 HTML/JS 模型，保留**原始字节**和自动哈希合同。Git Blob `f10b6f6671480b3ea4828a04541e7bffa4e4d58a`，SHA-256 `c0a030441720ee74e599e47d9e61d7725b5f947aa62da9324e5ac5b56356c8b7`。它的演示状态不属于当前 React 源码，也不执行真实 DNR。

过去用于独立验证设计方向的 `index-react.html`、`app.js`、`style.css`、HTM vendor 及 `acceptance.mjs` 已退出产品开发和 CI 链路，可从 Git 历史按旧提交查看，但不能作为现行 UI 的修改入口。生成快照统一放到被忽略的 `artifacts/previews/`，不在应用根目录追踪大型生成 HTML。

请使用上层 [README.zh-CN.md](../README.zh-CN.md) 了解编译、发布及真实 Chrome 验收边界。
