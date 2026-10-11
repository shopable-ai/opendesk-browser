# R15.9 query-string 真上游预装资源实施

日期：2026-10-11。单一源码：package.json + package-lock.json + src/libs/runtime-contract.js / catalog.js。继续沿用原 WXT、固定资源清单、SHA-256、许可证与 USER_SCRIPT 按需机制。

- 固定 upstream query-string@9.5.1（MIT），真实发布 tag v9.5.1；lock 及三个传递依赖均采用另一实际 npm lock 中的真实 registry resolved/integrity，不发明 integrity：decode-uri-component@0.5.0、filter-obj@5.1.0、split-on-first@3.0.0。
- src/libs/packages/query-string.js 暴露真实 parse/stringify/parseUrl/stringifyUrl/extract/pick/exclude。USER_SCRIPT 需写 // @opendesk-lib query-string 才加载，不自动向网页 MAIN 或 Service Worker 注入。
- WXT classic IIFE 资源 libs/packages/query-string.js、MIT 文件、manifest hash 和 ABI v6 同步升级。旧 v5 程序候选要求重新验证。
- tests/environment/query-string-r159.test.mjs 与 Mac Chrome 固定资源入口分别验证模块、声明、哈希、URL 参数、运行世界与拒绝。
- 不以本文件当作运行验收；同候选 npm ci、production/dev build、完整 test、Mac Chrome、ZIP 需真实结果。Controller API 尚未开放 queryString，不能宣传双世界全部完成。

剩余 Axios 上游 + broker 授权绑定、store、Cheerio、FingerprintJS、Socket.IO、Tailwind 用户 CSS 是独立待实施目标。
