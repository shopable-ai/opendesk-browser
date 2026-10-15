# AdBlock · 交互预览说明

- **唯一当前交互设计预览**：[index.html](index.html)。在浏览器直接打开，演示全局保护、本站启停、例外管理、设置与模拟网站。此文件不是 Chrome DNR 或正式安装包。
- **顶部标题栏**：沿用原始蓝色盾牌 SVG，并显示与 `tool.config.json` 一致的「广告拦截」名称及有 `title`、`aria-label` 的 34px 设置按钮。首页与二级页面共用同一工具标题；避免原来两层重复标题/装饰性伪窗口栏。
- **用户确认的历史设计原件**：2026-10-15 版本 Git blob `f10b6f6671480b3ea4828a04541e7bffa4e4d58a`，SHA-256 `c0a030441720ee74e599e47d9e61d7725b5f947aa62da9324e5ac5b56356c8b7`。当前 `index.html` 是该原件经用户授权重命名及局部头部改造后的新版本；历史字节可以通过 Git blob 追溯。
- **生产源码同源预览**：`../adblock-r1-interactive-preview.html` 由 `scripts/preview/build-preview.mjs` 生成，不能以其替换当前交互设计预览。两者都不构成真实网络拦截验收。

## 检查

直接打开 `preview/index.html`：确认顶栏盾牌、标题与设置图标始终可见；确认切换「设置」「已停用的网站」后仍保持统一工具身份。检查全局/本站开关、例外恢复、受限网页、重置、浅深色模拟及 320px 宽度下布局，无权限或网络副作用。原型右侧的演示控件在工具画布之外，不属于正式安装 UI。

生产快照仅允许生成到扩展根目录：

```sh
node scripts/preview/build-preview.mjs --tool adblock --surface side-panel --scenario success --theme light --width 360 --out examples/sidebar-tools/adblock/adblock-r1-interactive-preview.html
```
