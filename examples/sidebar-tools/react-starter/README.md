# React 笔记与第三方图表库：独立 Sidebar Tool 示例

这是现有 `react-starter`（工具 ID `react-notes-starter`）的可运行进阶示例：
**React 19 + 外部来源的第三方 JS 图表库 + 本地打包 + Side Panel 沙箱生命周期**。
保留原笔记读取、显式保存功能；新图表只使用模拟数据，支持“本周 / 上周”切换、
SVG 趋势显示、统计和可展开的无障碍数值表格。图表本身不访问网站、网络或笔记数据。

## 为什么不能在工具里直接加载 CDN.js？

例如下面的 CDN 文件与本示例使用的 npm 包对应相同的**固定发行版本**：

```text
https://cdn.jsdelivr.net/npm/@fnando/sparkline@0.3.10/dist/sparkline.js
```

这是供开发者**查看、审查来源**的地址，**不是运行时的 script src**。
OpenDesk 普通工具运行在隔离沙箱中，`tool.config.json` 只接收单个经典 JS
和本地 CSS；HTML 禁止 `<script>` / `<link>`，也不授权远程脚本或 HTTP 代理。
直接插入 `<script src="https://...">`、`import('https://...')`、
`eval(await fetch(...))` 都不是本工具支持的依赖加载方式。

正确链路：

```text
第三方发布到 npm / CDN（选择、审查、固定版本）
                 ↓
开发机 npm install（生成并审阅 package-lock.json）
                 ↓
Vite 将 React + 图表依赖编译进 dist/tool.js、dist/tool.css
                 ↓
OpenDesk 共用打包器验证大小、格式与本地资源
                 ↓
用户主动导入、审阅权限、确认安装、主动打开
```

当前使用轻量级 `@fnando/sparkline@0.3.10`（MIT），源文件位于
`src/ActivityChart.jsx`，由 `import sparklineLibrary from '@fnando/sparkline'`
引用，**不**假设宿主提供全局库变量。Vite 配置禁止 external，
所以工具离线运行也不需要 CDN 可访问。

## 运行与安装（只构建工具，不必重新编译整个 Chrome 扩展）

在仓库根目录：

```bash
cd examples/sidebar-tools/react-starter
npm install --ignore-scripts --no-audit --no-fund
npm run build
node ../../../scripts/stage-sidebar-tool.mjs "$PWD"
```

`stage` 的输出是 `STAGED_NOT_INSTALLED` 只读快照，**不等于已安装**。
在 Native Workspace 中需要主动点击“只读预览工具”才能预览。

需要在扩展中使用完整功能时，仍在该目录下运行：

```bash
node ../../../scripts/build-sidebar-tool.mjs "$PWD"
```

从仓库根目录找到 `artifacts/sidebar-tools/react-notes-starter/1.1.0/react-notes-starter.opendesk-tool.json`，
在 OpenDesk Side Panel 的“工具 → 导入”选择 JSON、检查
`storage.local` 能力、确认安装或更新，再主动打开。
本地工具的旧笔记数据按工具 ID 保留；请在更新前做好个人数据备份。

项目首次 `npm install` 会生成 `package-lock.json`，请审查并提交该项目专属锁文件；
后续采用 `npm ci --ignore-scripts --no-audit --no-fund`。
模板仓库不预提交第三方库编译后的 `dist`；这些产物由开发机或 CI 构建。
`npm run build:watch` 只在构建成功后刷新 `dist/build-ready.json` 回执，
不会自动安装、覆盖已安装工具或执行后台脚本。

## 为什么不是直接把 ECharts 全量打进去？

这个示例专门证明“React 引入**真实第三方 JS 依赖**”可以在现有工具包下完成。
目前单工具 JS ≤ 220,000 字符、完整 JSON ≤ 320,000 UTF-8 字节，
还需包含 React 运行时；完整 ECharts 体积很可能超预算。
因此先采用体积更小的 SVG 绘图库，**不**为了 Demo 放宽生产安全限制。

若未来确需 ECharts，请使用 `echarts/core` 按需引入图表、组件及单一 SVG
renderer（参见 Apache ECharts 官方树摇文档），测量产物并审查依赖与许可证。
超过预算应单独设计“受信库包/工具依赖”方案，不允许远程执行代码、
盲目增大安装包上限或伪称这种 Demo 已经支持全量 ECharts。

## 验证与限制

```bash
# 仓库根目录：静态契约
node --test tests/environment/sidebar-react-cdn-bundle.test.mjs
# React/Vue 已在各自目录构建后：回执、包上限、本地库代码
node tests/framework/sidebar-tool-starter-build.mjs
```

该示例的编译/打包验收只证明 JSON 可导入及源码无外链，并不等于
真实 Mac Chrome 中已完成手动安装、深色模式、200% 缩放和完整生命周期验收。
预览不写入存储；只有明确安装后、点击保存才能存储笔记。
