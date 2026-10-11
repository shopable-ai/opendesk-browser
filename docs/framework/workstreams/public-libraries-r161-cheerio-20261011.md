# R16.1 真上游 Cheerio slim Page 按需接入

日期：2026-10-11。源码增量，不用目录草图冒充实现。

- 真实 npm `cheerio@1.2.0`（MIT），上游 tag v1.2.0、发布包真实 SHA-512 来自另一公开 npm lock；其运行依赖的精确版本/SRI 来自上游对应 tag 的 package-lock.json。为不影响已有较新 DOM 库和其他并行 Agent，采用 `node_modules/cheerio/node_modules/` 隔离安装依赖；构建使用 `cheerio/slim` 浏览器入口，解析 HTML 字符串，不导入或对外开放 undici、remote fromURL、stream 等 Node/网络抓取接口。
- 仅 `// @opendesk-lib cheerio` 的 Page USER_SCRIPT 可获得 `cheerio.load(html,options,isDocument)`。限制入参为 UTF-8 512 KiB HTML 文本，DOM 查询使用真实上游 CSS 选择器与序列化逻辑。**Cheerio 不会清洗 HTML**，返回的节点/字符串不可未经净化写入宿主特权 DOM。
- 沿用唯一 runtime-contract/catalog、WXT 固定 IIFE、许可证和 SHA-256 清单、页面编译器单项 opt-in 与 ABI 升级，不新增 vendor 注册表、权限、remote JS 或 Service Worker 依赖。
- 测试：真实查询/遍历、选项限额、缺省与碰撞失败关闭、编译器资源身份和篡改、生产/开发 WXT 产物、原生 Chrome Page USER_SCRIPT 不污染网站 MAIN。没有同候选回执时 `NATIVE_UNVERIFIED`，Controller Cheerio 不在本阶段。
- 仍需 Axios Controller 传输取消、双环境部分库、FingerprintJS、Socket.IO Client 与 ShadowRoot Tailwind 静态样式。后续必须满足完整源/构建/原生/ZIP 验收，不得以完成数自评 95 分。
