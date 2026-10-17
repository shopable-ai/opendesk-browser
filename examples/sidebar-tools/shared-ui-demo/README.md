# Shared UI R1.6 · JSX AdBlock Demo

这是独立 Sidebar Tool，模拟「已关闭 → 已开启 → 已关闭」。不启用 DNR，
不修改正式 AdBlock 工具。开发者仅需编写 `src/App.jsx`，可以正常
`import {useState} from 'react'` 和 `import {Card,CardContent,Switch} from '@opendesk/ui'`。

**构建：** 在仓库根执行 `npm ci`（只在浏览器/源码开发阶段），然后：

```sh
npm run build:dev
cd examples/sidebar-tools/shared-ui-demo && npm run build && cd ../../..
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/shared-ui-demo --out artifacts/sidebar-tools/shared-ui-demo/candidate.opendesk-tool.json
node --test tests/environment/sidebar-shared-ui-r16.test.mjs
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/shared-ui-demo --promote-from artifacts/sidebar-tools/shared-ui-demo/candidate.opendesk-tool.json
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/shared-ui-demo --check-project
```

完成并验证候选后，安装唯一的 `shared-ui-demo.opendesk-tool.json`。
静态 `preview/index.html` 只加载同一次编译的 `dist/tool.js` /
`dist/tool.css` 和浏览器 `dist/development` 中真正的 React/UI 产物，
没有另写模拟开关；需先完成两次构建才能打开预览。

工具包仅包含编译后的 JSX 业务与启动模板、布局 CSS 和原有元数据。
React/ReactDOM/JSX 复用浏览器已发布并带哈希登记的
`libs/page-frameworks/react-19.2.0.js`（193163 B）；Card/Switch 和
Token CSS 由新增的固定浏览器产物 `sidebar-shared-ui.js` 按需提供。
Vite `external` 各项都有对应 IIFE 全局解析映射，浏览器安装不需要 npm/CDN。
跨 iframe 仅共用**发布文件字节**，不共用可信 Host 的 React 内存实例。

**组件来源限制：** Card 为 shadcn 风格结构，Switch 为 native input 的
受控实现，兼容 React Aria `isSelected/onChange/isDisabled` 参数，但
**不是官方 react-aria-components**。官方 React Aria 安装、锁版本与
真实键盘/Chrome 验收尚未完成，不能声称官方组件已通过。
