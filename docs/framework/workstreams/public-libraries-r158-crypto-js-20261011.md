# R15.8 公共库：CryptoJS Page 资源接线

日期：2026-10-11。

## 范围与实现

本增量使用现有唯一的 runtime-contract/catalog、固定 WXT entry、发布 manifest SHA、根 npm 锁与 USER_SCRIPT 单选依赖声明，不创建第二套 vendor 注册表或远程 JS 载入器。

- crypto-js@4.2.0 固定根 npm 精确版本，MIT，来自真实 registry tarball，npm ci 将验证 lock integrity。上游已停止维护，属于兼容库，不宜用于新密码学设计。
- packages/crypto-js.js / entrypoints/crypto-js.js：显式 // @opendesk-lib crypto-js 之后才在 Page USER_SCRIPT world 安装；仅暴露 SHA256/HmacSHA256、AES.encrypt/decrypt、Hex/Utf8/Base64，不自动采集、联网或暴露弱算法。
- runtime-contract 升级到 v5，旧安装程序不能沿用以前 builtins 回执；扩展页面依赖选择器、preview 和已安装程序的同一资源 SHA 核验机制。
- prepare-public、libs-doctor、WXT config 和 fixed-entry 测试复用原有约束；不扩大权限/CSP/SW 硬限。
- crypto-js-r158 测试验证真实上游方法、显式声明、撞名/ABI/hash 失败关闭及正式 WXT production/development 资源。后两项测试要求对应 dist 实际存在。

## 证据边界

仅有 GitHub 源码变更不构成 npm CI/构建/原生 Chrome/ZIP 验收。执行环境未安装根 npm 依赖，且不是 Mac Chrome，因此本次无同 SHA Mac Chrome 回执：NATIVE_UNVERIFIED。任何新 CI 结果要绑定本次 commit，再决定工程状态。

待继续目标：真实 Axios 接入和取消/权限流，query-string、store、FileSaver、Cheerio、FingerprintJS、Socket.IO、Tailwind。React/Vue 复用既有 Page 固定资源，my-utils 暂保 ABI，不恢复 Moment。
