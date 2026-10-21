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

## 手动屏蔽网页元素 · 点击即隐藏交互合同

[打开交互评审 HTML](./adblock-element-picker-r2-review.html)：在现有侧栏布局下演示「开始选择 → 网页区域单击即隐藏并保存本地 → 立即撤销 / 从规则列表恢复 → 刷新后自动保持」。。自带固定的新闻、视频和购物网站模拟 DOM，支持受限网页、例外、深浅色与窄屏，规则仅存于此 HTML 的本地演示存储。

交互边界：**选择中，操作说明与取消入口只在左侧侧栏；模拟目标网页只做元素蓝框高亮，不放置模式提示条。** 正式页面的 `trusted/picker.js` 同样不在选择开始、Esc 取消、超时或标签页切换时向网页插入说明浮层；选择完成后的轻量撤销反馈与持久化规则独立保留。若测试仍看到旧提示，应确认正式候选重新编译、开发扩展更新并刷新测试网页。

**此文件不是正式产品或同源 React 预览。** 它用于审核已确认的单击即隐藏交互，不进入构建、发布、Host 或 Chrome DNR。当前 React 产品仍以 `../src/App.jsx` 为唯一 UI；正式功能应在其真实授权运行链中实现网页元素屏蔽，并在 `artifacts/previews/adblock/` 生成同源验收预览。`index.html` 的 R1 历史哈希保持不变。

## 历史设计档案

`index.html` 是经用户批准的 R1 纯 HTML/JS 模型，保留**原始字节**和自动哈希合同。Git Blob `f10b6f6671480b3ea4828a04541e7bffa4e4d58a`，SHA-256 `c0a030441720ee74e599e47d9e61d7725b5f947aa62da9324e5ac5b56356c8b7`。它的演示状态不属于当前 React 源码，也不执行真实 DNR。

过去用于独立验证设计方向的 `index-react.html`、`app.js`、`style.css`、HTM vendor 及 `acceptance.mjs` 已退出产品开发和 CI 链路，可从 Git 历史按旧提交查看，但不能作为现行 UI 的修改入口。生成快照统一放到被忽略的 `artifacts/previews/`，不在应用根目录追踪大型生成 HTML。

请使用上层 [README.zh-CN.md](../README.zh-CN.md) 了解编译、发布及真实 Chrome 验收边界。

## R2 图标动作优化（正式 React 与独立交互评审）

- **「选择网页元素」保留文字**并作为醒目的主操作；选择中的「取消选择」和成功后的「撤销」也保留文字，避免增加误操作风险。
- 正式 `src/App.jsx` 复用宿主已有 `IconButton`：定位、临时显示／重新隐藏、编辑、删除使用一致的 SVG 和触发器；`title` 与 `aria-label` 保留可翻译的语义文本，不把“无文字”误当作“无需本地化”。
- 此目录的 `adblock-element-picker-r2-review.html` 是可操作的**独立演示**，新增图标定位、临时显示、编辑预设选择器、删除；不具备真实 Host／DNR 权限，不能作为正式 React 的源码同源证据。正式同源 React 预览仍需通过 `scripts/preview/build-preview.mjs --tool adblock` 生成并验收。
- `index.html` 是 R1 固定历史基准，不修改。正式安装包、构建回执和真实 Chrome 验收必须另外完成，不可使用此 HTML 代替。
