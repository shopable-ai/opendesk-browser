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

## 历史设计档案

`index.html` 是经用户批准的 R1 纯 HTML/JS 模型，保留**原始字节**和自动哈希合同。Git Blob `f10b6f6671480b3ea4828a04541e7bffa4e4d58a`，SHA-256 `c0a030441720ee74e599e47d9e61d7725b5f947aa62da9324e5ac5b56356c8b7`。它的演示状态不属于当前 React 源码，也不执行真实 DNR。

过去用于独立验证设计方向的 `index-react.html`、`app.js`、`style.css`、HTM vendor 及 `acceptance.mjs` 已退出产品开发和 CI 链路，可从 Git 历史按旧提交查看，但不能作为现行 UI 的修改入口。生成快照统一放到被忽略的 `artifacts/previews/`，不在应用根目录追踪大型生成 HTML。

请使用上层 [README.zh-CN.md](../README.zh-CN.md) 了解编译、发布及真实 Chrome 验收边界。
