# React 普通 JS 网页组件 · 现有 R24.2 与 R24.3 兼容迁移

**本次只更新 README，现有 src/main.js 和导入产物未改变。** 本目录继续保留，不是被删除的旧方案。createElement/Hooks 是官方 API，适合不使用 JSX 的开发者。

[四目录总览](../../../docs/api/page-ui-frameworks.zh-CN.md) · [R24.3 方案](../../../docs/architecture/browser-framework/page-framework-authoring-r243.zh-CN.md) · [下一轮 GOAL](../../../docs/framework/prompts/goal-r243-page-framework-authoring.zh-CN.md)

## 现在怎样使用

编辑本目录 `src/main.js`，在已安装配对的本地项目连接中运行。现有示例使用普通 JS、React.createElement/Hooks；不需要在本目录 npm install、运行 Vite 或生成 compiled 目录。OpenDesk 内部自动准备 JS 模块，框架来自扩展中固定校验的 React 19.2.0/ReactDOM 资源。

1. 在仓库根目录启动 `python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks`，打开 `http://127.0.0.1:43111/demo-form.html`。
2. 已有 CLI/Native 开发连接完成安装配对后，在本目录运行 `opendesk browser dev .` 并保持连接；Sidebar → 开发 → 本地项目 → 选择本项目 → 运行。
3. 满足 Chrome 网站访问与用户脚本能力。组件显示在 #page-ui-demo-target 附近；高亮/撤销按钮修改 #sample-text 的轮廓与标记，不提交原网页表单。
4. 停止受管 UI 或用原 previewId Stop，确认 root.unmount、受管观察器与网页标记清理。

连接前置条件见[目录 CLI 指南](../../../docs/framework/local-directory-cli-r17.zh-CN.md)。只想体验时，也可导入 [现成草稿](../../import-ready/README.zh-CN.md)，不用连接源码目录。

保存只自动准备，下一次明确运行才应用；不是保存后自动操作网页。pageRules 限定 HTTP 127.0.0.1:43111 并排除 private 路径，但不等于 Chrome 权限或安装批准。这里不是 Side Panel 工具，不借用网站 React、不从 CDN 加载、不改用 MAIN。

现有 main.js 仍含 @opendesk/ui 与 enhancement.js 导入，不能原样贴进普通网页控制台；“direct”不等于单文件，也不等于侧栏的“直接编辑”模式。

## R24.3 接下来修改什么

- 保留目录、项目 ID 与普通 JS 选择；简化 src/main.js，使用标准 `import { createElement, useState } from 'react'` 并默认导出组件。
- 系统生成受管挂载入口，不让入门代码手动使用 createPageUI 或内部全局对象；共享链完成后再切换源码。
- enhancement.js 高亮逻辑移出最小入门依赖，但保留进阶可逆 DOM 示例及回归。
- 旧 async-main 和旧草稿继续测试；项目入口声明需显式区分组件与旧 main，不能靠函数名猜测。
- 源码变化时真实重建当前 import-ready JSON 和一致性测试，同时保留旧快照及历史证据，不仅修改预期哈希。

以上是待实施迁移，不是当前标准 import 或自动组件入口已经上线。R24.3 默认 JSX 入口在原 [page-ui-react](../page-ui-react/README.md) 中完成，两者复用同一框架，而不是另建两套执行器。
