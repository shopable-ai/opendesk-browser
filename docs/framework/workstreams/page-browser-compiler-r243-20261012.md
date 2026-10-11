# R24.3 · 浏览器无 Native 转换器供应链资格审查

日期：2026-10-12。状态：**资格审查，不是运行链、浏览器 Worker 或产品功能完成**。

当前根仓已有 `esbuild@0.28.2`：这是 Node 原生二进制，不能在 Chrome 扩展 Worker 直接运行。React JSX 无 Native 编译需要浏览器兼容的**成熟转换器**。候选 `esbuild-wasm@0.28.2` 与根工具链精确同版本、MIT、npm 单一包且无传递依赖；由维护者专用 `scripts/page-browser-compiler/` 独立锁定，不让用户安装，也不写入目标网站或后台 SW。官方运行方式：https://esbuild.github.io/api/#browser 。

本次仅将精确 npm 来源、SHA-512 锁、许可证与 `esm/browser.min.js` + `esbuild.wasm` 的实际字节、SHA-256、体积输出为**审查产物**。验证资格后才能决定：单独包体预算、按需 Worker、CSP、取消与超时、输入图/生成入口闭包和真正 Chrome 速度、内存。不得将大二进制偷偷塞进 SW，绕过固定资源白名单或单次 Page 100KB 输出预算。

签入 package-lock 后 CI 应改用纯 `npm ci --ignore-scripts`，不得每次重新执行 package-lock-only。正式发布转换资源需要明确登记来源和哈希，保留完整 npm/许可证证据，更新 `prepare-public` 和 `verify-package` 的封闭清单，同时拒绝未登记资源。

前几轮真实 CFT 的四组件及 40 次 Run/Stop 属于**Native 本地路径**；它们不能当成这个浏览器独立编译器的验收。浏览器无 Native 的原始 JSX/SFC 编辑→准备→授权运行→停止仍为 NOT_TESTED。
