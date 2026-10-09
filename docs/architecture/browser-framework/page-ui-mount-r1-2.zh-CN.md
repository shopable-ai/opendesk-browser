# OpenDesk Page UI R1.2：网页宿主融合与冲突恢复

> 本文件描述已实施的轻量级挂载器，不是框架适配数据库。源码：`src/scripting/user-scripts/page-ui.js`、`page-ui-mount.js`；调用：`@opendesk/ui`；开发演示：`examples/programs/page-ui-basic`。

## 运行位置和权限

- 复用现有 Page USER_SCRIPT 授权、手动预览世界、原生 ShadowRoot、受管生命周期；**不**引入新 Broker、MAIN World 切换、插件安装接口或 DOM 对象跨进程转发。
- 不修改网站既有文本、属性、表单事件与框架组件状态。宿主仅是新的 DOM 元素；若插入点位于 React/Vue 等管理的子树，框架再次渲染仍可销毁该宿主，因此观察实际 DOM 生命周期并切换到独立容器。
- `createPageUI()` 不提供 `mount` 时保持原 R1 右上角固定入口，也不启动 DOM 兼容观察器。没有导入 `@opendesk/ui` 的程序仍不会打包 SDK。

## 轻量状态机

```text
preflight: document、selector 格式/唯一性/归属、交互边界；先检验再替换同 ID
        |
        +-- 唯一且可安全插入 --> A inline (新 host + ShadowRoot)
        |                           | 宿主/目标被网站重新渲染
        |                           v
        +-- 表单/链接/编辑区 -----> B anchored (body 内新 host, fixed 对齐)
        |                           | 目标失联/定位几何失效
        |                           v
        +-- 目标未找到 ----------> C floating (原右上角)
        |
        +-- 错误选择器/歧义 -----> 不修改旧实例、抛出 E_UI_TARGET*
        +-- CSP 导致 CSS 不可用 -> D stopped (清理)
```

监测仅使用最多 3 级上层节点的 `childList`（非持续全树扫描），B 模式另使用窗口滚动/resize、存在时的 `ResizeObserver`，滚动用 `requestAnimationFrame` 合并。实例关闭将 disconnect 所有观察器、释放 RAF/监听器和定时器；页面 `pagehide` 与同 ID 重建使用 R1 原有清理事件。重复调用不会无限重建主程序。

## 验证与诊断边界

`ui.verifyMount()` 不截图、不执行网页按钮、不读取网页内容：检查 host 与 ShadowRoot 是否有效、宿主是否有非零可见矩形、样式节点 CSSOM 是否存在、图像是否完成解码。`ui.getMountDiagnostics()` 提供纯 JSON 形态的当前策略、原因、有限转换历史与清理标记。首次挂载约 180ms 后做一次检查；CSSOM 明确不可用时停止，宿主不可见时下降一级。真实遮挡/祖先裁剪不完全可知，必要时用 Chrome 实际点击进行验收。

框架自身 React/Vue/Svelte 等可以在 `ui.content` 创建自有根，并在 `ui.onDispose` 注册 unmount；Popover/Portal/Teleport 放 `ui.overlay`。当前 **未实现** JSX/TSX、Vue SFC、Tailwind 动态注入、修改网站已有 UI 并回滚、跨 iframe/sandbox 的扩展挂载。避免过度设计，后续按真实失败证据逐项增强。

## 证据要求

基础 Node 模拟用 `tests/environment/page-ui.test.mjs` 和 `page-ui-mount.test.mjs`；构建回归使用 `program-build.test.mjs`、`program-assets.test.mjs`。真正的 Chrome/页面 CSP、可见点击、放大、框架重绘、BFCache 属于另一层验收，在没有真实浏览器运行记录前标 `NOT_TESTED`。所有用户手工交互只使用 `examples/tasks/demo-form.html`，不要创建新测试页面。
