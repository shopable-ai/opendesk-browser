# OpenDesk Browser R16.3 — FingerprintJS 固定 Page 库与隐私禁止回传

日期：2026-10-12。实际增量不重新创建 vendor 注册表、加载器或浏览器权限架构。

## 上游来源及关键风险

- 真实 npm 上游：@fingerprintjs/fingerprintjs@5.3.0，MIT，无运行依赖。2026-10-07 官方发布。原包 tarball SHA-512 integrity 已与两个独立的公开 npm lock 对账（pokehunt-xyz/website 与 bronz3beard/react-marketing-tools），根 package.json/package-lock.json 使用固定精确版本。
- 关键风险：npm 版本的 FingerprintJS.load 默认 monitoring=true，官方 docs/api.md 说明可能向 m1.openfpcdn.io 上传安装统计（含网络来源/IP）。**所以不能照抄普通 npm 示例把 load() 自动执行**。
- 官方源码 src/agent.ts 提供 monitoring:false。OpenDesk 的 Page Facade **只在显式声明** // @opendesk-lib fingerprintjs 时创建 FingerprintJS 只读全局，导入和安装阶段完全不调用 upstream.load() 或 agent.get()。用户主动调用 FingerprintJS.load() 时必须强制监测关闭；任何 monitoring:true 直接拒绝。debug:true 也拒绝，避免意外日志暴露浏览器指纹信息。
- 只开放上游 load、hashComponents 和 componentsToDebugString；不默认存储 visitorId、不传给云控、Controller/Service Worker/网页 MAIN，不开新 host_permission 或 CDN。

## 物理资源和验证

唯一合同：src/libs/runtime-contract.js / catalog.js。WXT 独立 IIFE 物理资源 libs/packages/fingerprintjs.js，MIT许可证在 licenses/fingerprintjs-MIT.txt，源码 ABI 随公共契约更新。npm 源码和传递依赖不能进入 SW、Sidebar 或默认 Page 资源。继续使用 scripts/bundle-provenance.mjs、scripts/libs.mjs、libs/manifest.json SHA 校验，不增加 vendor 登记表。

Node 测试验证 API 真实版本、零自动 load、强制关闭 monitoring、非法参数拒绝、声明唯一性、旧 ABI 和 SHA 失败关闭、prod/dev WXT 产物哈希及独立 IIFE。Chrome CFT 测试主动调用 load 但**不调用 get、不记录 visitorId**，同时查网页 MAIN 未被污染。上述是验收设计：任何 CI 未取得同候选通过记录时记工程待验证 / NATIVE_UNVERIFIED，不把提交等价于发布。

仍未完成：Socket.IO 客户端连接授权与生命周期、Tailwind 公共 UI 静态 CSS、Controller 真实 Axios 受授权运输/取消、全部真实浏览器/ZIP 最终验收。
