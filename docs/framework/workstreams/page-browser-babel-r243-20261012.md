# R24.3 · 浏览器单组件 JSX/Vue SFC 编译器候选（Babel）

日期：2026-10-12。**候选资格审查，尚未打入扩展、更未接入用户执行链。**

Chrome Worker 不能直接使用根仓 Node `esbuild@0.28.2`。候选 WebAssembly 版的 WASM 需 13,978,850 bytes（[已有审查](page-browser-compiler-r243-20261012.md)），对单组件浏览器编辑体积过大。改用零传递依赖、MIT、固定 `@babel/standalone@7.29.9` 进行独立**静态源码转换**比较；与根锁定 `@babel/parser@7.29.9` 在同一版本系列。本轮只核对 package-lock SHA512、实际 `babel.min.js` 字节与 MIT、源映射、React 官方 JSX + Vue SFC 已预编译 JS 的转换输出、基本 CPU/内存及 CSP 扫描；不在编译阶段执行任何用户源码。

候选必须通过真 Chrome Worker CSP、模块闭包静态白名单、延迟任务取消/超时、受管页面 API 身份和性能测试，才可以考虑注册到 `prepare-public` / `verify-package`。不得让 Babel 编译器进入常驻 SW、目标 Page、网络/CDN 或未审计安装流程。浏览器无 Native 原始源码→实际运行→Stop 在此阶段仍是 NOT_TESTED。

## 2026-10-12 第一轮资格测试结果

[GitHub Actions 原生审查](https://github.com/shopable-ai/opendesk-browser/actions/runs/38157387916) PASS；独立包 `@babel/standalone@7.29.9`，固定来源 `https://registry.npmjs.org/@babel/standalone/-/standalone-7.29.9.tgz`，SHA-512 `sha512-Oztlw9huD3bdgX6HmYqCSBamOtH05qbbF5TGfD2cbetKsqMo/2U9WB24U02qGDqMzmY0wY2bnLhbFAjXW3dWYg==`，MIT 许可证 SHA-256 `117da2af0d4ce0fe1c8e19b5cff9dcd806adf973d328d27b11d4448c4ff24f76`。

`babel.min.js`：**3,141,115 bytes**，SHA-256 `5f8ffa174aa2465f074c85b92421662168cd356eedebaedc3d16fd9d61fadb7c`；零传递依赖。对项目现有 React `App.jsx` 使用官方 JSX + CommonJS 转换插件得到 376 字节 JS，Vue `App.vue` 的既有正式 SFC 编译 JS 经 Babel 生成 954 字节；两者 `sourceMaps:true`，静态检测 `eval\s*\(` 和 `new Function\s*\(` 的字面次数都为 **0**。

Node CI 中加载 Babel 约 144.6ms、React 转换约 30.8ms、Vue 转换约 13.6ms、进程 RSS 约 106MB；这些**仅是 CI Node 指标**，不能写成真实 Chrome Worker 的内存或冷启动证据。与 13,978,850-byte esbuild WASM 相比，单个 Babel JS 资源体积减少约 77.5%。资格结论：**优先继续验证 Babel 自包含编译器，不发布或接入受权 Page 执行链，直到 Chrome Worker/CSP、身份闭包、可取消性、冷/热启动和用户体验正式 PASS。**

独立精确 package-lock 已保存，工作流此后仅执行 `npm ci --ignore-scripts`，不再重复生成 lock；无需用户项目安装该包。
