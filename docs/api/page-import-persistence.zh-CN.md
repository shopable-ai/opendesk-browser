# Page 安装包与开发源码的持久化合同

## 扩展导入正式 Page 安装包

普通安装路径是「扩展 → 导入 → 选择 `.opendesk-page.json` → 查看名称、身份、版本、网站范围和权限 → 确认安装」。安装完成后留在扩展流程；按已批准网站范围自动运行，无需到开发页预览、保存 Revision、验证源码或再次通用启用。用户主动停用的原安装不因重新导入而恢复。

`opendesk.page-install.v1` 是可移植离线安装包，不是 `opendesk.program-draft.v1/v2` 的别名。包中固定 `programId`、`version`、`title`、`revision`、`entryFormat`、`sourceUtf8`、`sourceHash`、`pageRules`，以及前述字段规范化摘要 `packageHash`。只接受已闭合的顶层 `USER_SCRIPT / document_idle` 源码、固定 Page bundle 和内嵌子帧资源；不导入外部依赖锁、权限、验证回执、目标文档或安装授权。包摘要证明字节完整性，不代表发布者签名或网站功能已验收。

`scripts/build-page-install-package.mjs` 从现有编译器生成并校验过的 Page 草稿中提取同一份源码，不重编译、不改源码字节。实际安装通过原 Host 的 `importPageInstallPackage`，复用 Candidate、固定 manifest、Verification、Available、Installed、安装 Authority 和 Chrome `userScripts` 注册机制。系统核验源码、资源、内置运行时及网站范围，并准备原注册描述符；本机生成的 `package-validated` 仅证明固定离线内容与注册材料校验，不冒充 `preview-evaluated` 的真实网站执行证据。Service Worker 不为安装校验执行用户源码。

确认按钮复用原 Chrome 权限手势。安装仍核对 `expectedInstalledManifestHash`、`expectedGeneration`，升级沿既有固定 Revision 和权限范围规则执行。相同已安装 manifest 返回原安装和当前 Chrome 注册状态，保留 installationId、token、generation、enabled，不重新执行或创建身份；主动停用、撤权或缺失注册不会显示为可自动使用的成功。成功界面要求原安装授权 active、enabled、Chrome registered 的回执，详情可查看安装 ID 和 manifest 摘要。请求结果未知时先查询 `listPagePrograms`，不自动重放写操作。

启停及恢复使用 `setInstalledPageEnabled({programId, manifestHash, installationId, expectedGeneration, enabled})`，其中 `installationId` 必填，取自所选安装的 `authorization.installationId`。Authority 初读与写事务均校验安装身份及代数；缺失身份拒绝为 `E_SCHEMA`，错误身份或陈旧代数拒绝为 `E_REVISION`。即使卸载后重装同字节且 generation 重置，旧安装请求也不能作用于新安装。

草稿 JSON 继续用于「开发」的源码导入与本地项目调试；扩展安装入口明确拒绝将草稿当安装包，不自动导航或覆盖编辑器。临时运行不等于持久安装。Sidebar 应用 `.opendesk-tool.json` 保持原独立沙箱安装流程。

## 开发中的静态 import 保存

以下描述作者源码与编译产物的持久化；依赖使用体验以现行[依赖使用场景合同](../framework/universal-dependency-runtime-usage-contract.zh-CN.md)为准，不增加安装用户的人工依赖审核步骤。

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
