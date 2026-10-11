# R24.3 · 浏览器单组件 JSX/Vue SFC 编译器候选（Babel）

日期：2026-10-12。**候选资格审查，尚未打入扩展、更未接入用户执行链。**

Chrome Worker 不能直接使用根仓 Node `esbuild@0.28.2`。候选 WebAssembly 版的 WASM 需 13,978,850 bytes（[已有审查](page-browser-compiler-r243-20261012.md)），对单组件浏览器编辑体积过大。改用零传递依赖、MIT、固定 `@babel/standalone@7.29.9` 进行独立**静态源码转换**比较；与根锁定 `@babel/parser@7.29.9` 在同一版本系列。本轮只核对 package-lock SHA512、实际 `babel.min.js` 字节与 MIT、源映射、React 官方 JSX + Vue SFC 已预编译 JS 的转换输出、基本 CPU/内存及 CSP 扫描；不在编译阶段执行任何用户源码。

候选必须通过真 Chrome Worker CSP、模块闭包静态白名单、延迟任务取消/超时、受管页面 API 身份和性能测试，才可以考虑注册到 `prepare-public` / `verify-package`。不得让 Babel 编译器进入常驻 SW、目标 Page、网络/CDN 或未审计安装流程。浏览器无 Native 原始源码→实际运行→Stop 在此阶段仍是 NOT_TESTED。
