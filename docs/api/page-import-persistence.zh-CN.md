# 普通 Page 静态 import 的保存合同

Side Panel「开发」中的普通 Page 草稿可以保留静态 HTTPS import。作者使用 `async function main()` 和 `document`；下载准备、查看固定原文、明确批准后，扩展使用批准的缓存与固定编译器离线编译，在 USER_SCRIPT 世界执行。运行时不访问模块 CDN。

成功试运行后，「保存网页脚本版本」保存不可变 Candidate。保存同时保留作者的 import 源码和封闭的编译产物；Save 不安装、不再次执行。重开 Side Panel 后，展开「网页 JavaScript 试运行」并选择「加载源码」，恢复作者源码及其原批准锁。正式验证和安装沿用现有 Candidate → Verified → Available → 显式安装流程。

每个 import Candidate 的身份包括：

- `manifest.sourceHash`：实际执行产物的 SHA-256。
- `manifest.compilation.authorSourceHash`：原作者源码的 SHA-256；作者字节另行持久保存。
- `compilation.dependencyLockId` 和 `dependencyManifestDigest`：作者 ESM 的原批准锁和声明摘要。
- `compilation.compilerVersion`、`compilerSha256`、`compilerProfile`：固定 Babel 及扩展私有 Worker/linker 的身份。
- `manifestHash`：整个规范化 manifest 的身份，联合约束作者、依赖和产物。

经典 Page Candidate 不要求 `compilation`，继续兼容既有保存合同。封闭产物的经典空锁不能替代作者 ESM 的批准锁。

加载、保存、冻结版本验证、手工试运行和安装后的实际派发都会重新检查适用的作者哈希、manifest、批准状态、缓存字节哈希和来源权限。保存写入及自动派发的事务还会重新读取依赖。权限移除后即使立即重新授予，同一次已经开始的操作仍被撤权 epoch 拒绝；已确认执行的效果不自动重放，也不交付旧授权下的成功结果。

原锁超过最近 20 项列表时，重开仍按原锁读取并验证。原锁缺失、批准撤回、缓存缺失或损坏、来源权限撤销、编译器身份变化时操作失败；不会回退到其他锁、下载新字节或静默批准。明确修改作者源码或世界后，旧恢复锁失效；重新准备、审核、批准和试运行，再保存新版本。

该合同由 `page-program-contract.js`、`dependency-manager.js`、`preview.js`、`installed-programs.js` 和编辑器依赖恢复共同实现。编译产物由固定的可信扩展 UI/Worker 生成并与真实试运行回执绑定；Service Worker 核验持久身份和依赖，不承担重新编译作者源码的工作。

组件、构建、实际 Chrome USER_SCRIPT、Native/MCP、工具安装的证据分别记录在本任务工作流。Node Native 的隔离验收不等于官方 Go Native、最终 F3 或 ZIP 安装验收。
