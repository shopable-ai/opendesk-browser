# React Sidebar Tool 第三方 CDN JS 来源示例（2026-10-12）

范围：`examples/sidebar-tools/react-starter`，不修改扩展本身的沙箱、
CSP、HTTP 权限、工具安装协议或共享限额；仅写入 `main`。

- React 19 继续由 Vite 编译为单一 IIFE。
- 选用 npm/CDN 同源版本 `@fnando/sparkline@0.3.10`，作为轻量、可验证的真实外部依赖。
- CDN URL 只用于开发者审阅。工具包中只有本地打包的 JS/CSS；没有浏览器运行时网络取 JS。
- React 示例新增模拟趋势图、周期切换、可访问数据表与 SVG 清理；笔记 ID、权限和显式保存保持原样。
- 工具版本提升至 1.1.0；版本变更不等于用户已经批准更新。
- 静态安全合同 `tests/environment/sidebar-react-cdn-bundle.test.mjs`；编译包与 220,000/320,000 预算由 `tests/framework/sidebar-tool-starter-build.mjs` 核验。
- CI `sidebar-tools-r1.yml` 已接入静态检查与原有 React/Vue 编译打包步骤。

证据等级：仓库源码及静态合同待对应 CI 运行校验；
当前环境不可访问用户 Mac 工作目录和真实 Chrome，不记录 NATIVE_PASS。
首次执行需要生成/审核项目 `package-lock.json`，默认模板内未携带现成锁。
