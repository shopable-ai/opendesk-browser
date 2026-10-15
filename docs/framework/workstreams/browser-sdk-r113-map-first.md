# Browser SDK R11.3 implementation

Owner: SDK map-first session 2026-10-15, main only. State: SOURCE_DELIVERED / NATIVE_NOT_TESTED.
Baseline: 8dc346e0432e11115862b39614b2d46a04f5cebb.
Scope: existing binding generator, compiled DIRECT descriptors, common schema validator,
package capability admission, related tests and existing matrix/ledgers.
Shared Host remains unchanged. sidebar-tools.js received only two capability labels; released.
Bookmark UI, legacy removal and current-page reference implementation already exist; reuse them.
Resources: this checkout only; no Mac, Chrome profile, watcher or other dist writer.
Baseline Node: R11, R112 Full Bookmarks and R124 current-page suites 37/37 PASS.
First batch: platform metadata and language detection/preferences; bounded read-only
Promise APIs, explicit installed-tool capabilities, no new Chrome manifest permissions.
Native: NOT_TESTED. Existing Node/build evidence must not be elevated to native.

## Implemented

- First production DIRECT batch: browser.runtime.getPlatformInfo,
  browser.i18n.getAcceptLanguages, browser.i18n.detectLanguage. Explicit capabilities
  browser.runtime/browser.i18n; no new Chrome permissions. Chrome Promise minimum 99;
  supported product minimum remains 138. Sources: pinned Chromium matrix rows and
  https://developer.chrome.com/docs/extensions/reference/api/runtime and
  https://developer.chrome.com/docs/extensions/reference/api/i18n.
- Generator bootstraps new approved runtime rows before count validation; requires
  explicit read effect. Same generated descriptor feeds Registry, Schema, facade
  and original installed-tool Host. No per-method Host branch or wrapper added.
- Dispatcher enforces declared output Schema after byte budget and authorization
  recheck; input validator reused. Missing Chrome API rejects, no fallback RPC.
- Capability discovery and existing acceptance tool now admit valid namespace digits
  (i18n); acceptance package 11.3.0 explicitly requests its new capabilities.
- 70 approved contracts: 68 public, 2 trusted Host-only. Public mapping:
  DIRECT 3 / SCOPED 49 / EXISTING_SERVICE 11 / COMPOSED 5.
- Historical 114 candidates: 23 promoted by exact name, 91 pending names classified
  in the existing matrix and projected to the existing four-layer ledger.
  39 service / 24 scoped / 3 composed / 1 direct candidate / 20 Host-only / 4 denied.
  13 names have an existing canonical target with explicitly restricted semantics.
  159 current/historical names are not 159 new native methods or a completion rate.

## Bookmark handoff

Latest parallel change a2be6815ad1f58907b10da1dc31df738b1bcacce was fast-forwarded
without overlapping our files. Bookmark package is now 0.3.1. Reused the other
owner's refresh/ticket/write-fence changes; did not recreate UI or legacy business.

Full methods getTree/get/search/create/update/move/remove/prepareRemoveTree/removeTree/
observe.start/observe.read/observe.stop remain source wired. Full capability is
browser.bookmarks.full; owned createOwned/removeOwned retain browser.bookmarks.
Current page is the existing page.getContext() -> {status,title,url,tabRef,documentRef};
create({title,url,parentId?,sourcePage:{url,tabRef,documentRef}}) revalidates the
opaque current-document references in Host. They never grant Owned Tab rights.
Existing probe() gates tree reading on getTree authorization, not write intent.
No consumer contract change is required from this SDK batch. Other owner retains
Bookmark UI/installation/native product acceptance. Legacy src/bookmark-manager is
already deleted in baseline; no duplicate business was restored.

## Verification in this checkout

Before parallel integration: 425/425 SDK/consumer/Host tests; targeted CI subset
124/124; native driver prepare 1/1 (preparation only, not native).
After a2be681 integration: 437/437 SDK/consumer/Host tests and 712 source files checked.
Production/development builds and package verify PASS. All native APIs use fixtures in Node.
Both build receipts have 506 inputs, zero source drift, and exact byte matches with
the delivered remote source commit. Raw logs, failures, hashes and CI jobs are in
evidence/browser-sdk-r113-map-first/summary.json. Three DIRECT entries are promoted
only to explicit Host Node positive/denial PASS and BUILD_PASS, never Native.
One integrated production attempt was blocked by this checkout's completed build
PID lock; no active owner existed. Saved stale lock before removing it, then normal
output-guard acquisition/build succeeded. No other checkout or watcher was stopped.

Mac Chrome, real installed sender/gesture, permission UX, all-method native proof,
product score and independent expert scores: NOT_TESTED / NOT_SCORED.
Remaining SDK batches follow each matrix candidate's explicit nextStep; Bookmark
product release and Issue #75 remain open pending real Chrome evidence.

## 本轮交付与剩余任务

源码已提交远端 main：`0c4d4a885efb09b467148009e0ebe4981a1ae2da`。
命令行推送缺少 HTTPS 凭据，改用已连接 GitHub 的 Git objects 写入；26 个 blob
逐一与本地 git hash-object 比对，通过 expected HEAD、force=false 更新。
保留并行的书签、AI VIP Share 与证据提交，未创建分支、worktree 或 PR。
本地原提交 `b3018c4e` 是同批源码的本地身份，不将它当成远端交付 SHA。

| 核心任务 | 结果 |
| --- | --- |
| 正式 API 零手写接入 | 3 个正式 DIRECT；矩阵 → 编译 Binding/Registry/Schema → 自动 Facade → 已安装工具 Bridge → 现有 Host/Dispatcher → Chrome Promise；未新增逐方法 Host 分支 |
| Full Bookmarks 解除阻塞 | 复用最新 Full 12 方法、当前页 opaque 引用、读取/写入分离；组件调用和安全回归通过，消费合同无需再改 |
| 并行接管 | Bookmark 0.3.1、optional Catalog、旧 src/bookmark-manager 删除已在最新 main；均为书签主线成果，本轮没有重复开发 |
| 后续批量工作 | 历史 91 名称已有安全分类、负责人和 nextStep；13 个可对接已有受限 canonicalTarget，不等同扩大权限或新增公开方法 |

新增正式接口及来源：`chrome.runtime.getPlatformInfo`、
`chrome.i18n.getAcceptLanguages`、`chrome.i18n.detectLanguage`，均为 DIRECT。
平台信息需 `browser.runtime`；两个语言方法需 `browser.i18n`。
没有增加 Chrome 权限，已安装包不会自动继承新 capability。

| 验证 | 当前候选结果 |
| --- | --- |
| 统一 Host DIRECT | 8/8；每项真实 Facade/Host 调用、capability/sender/package/epoch/revocation 拒绝；Chrome primitives 为 fixture |
| SDK / Full / 消费端 | 437/437；Full 12 项、100/500/550/1001 分页、当前文档替换及 Owned 隔离均在范围内 |
| npm run check | PASS，712 文件 |
| 矩阵 / 生成 / 账本 | PASS，70 approved / 68 public / 3 DIRECT；没有重解析全部 191 Chromium 源文件 |
| 独立工具包 | SDK acceptance 11.3.0、Bookmark 0.3.1 均 build/validate PASS；installed:false |
| Production / Development | PASS；包 hash 见下方；506 输入均与远端源码一致 |
| npm run build:size / verify | PASS；sw.js 631839 bytes 超过 524288 审阅线但低于 1048576 硬门禁，未放宽限制 |
| SDK R5 CI | [38701274073](https://github.com/shopable-ai/opendesk-browser/actions/runs/38701274073) SUCCESS |
| SDK targeted CI | [38701274046](https://github.com/shopable-ai/opendesk-browser/actions/runs/38701274046) SUCCESS；native-restart SKIPPED |
| Bookmark CI | [38701274129](https://github.com/shopable-ai/opendesk-browser/actions/runs/38701274129) SUCCESS |
| 授权 / 包预算 CI | 38701274063 / 38701274045 SUCCESS |
| 全仓及其他原生 CI | 未宣称全绿；papa-parse-r1 缺失 PAGE_OPTIONAL_LIBRARY_IDS 导出、多个旧 UI 原生选择器仍失败，逐项记录于证据 |
| SDK / Bookmark Chrome Native | NOT_TESTED；市场原生 CI FAIL，未进入本轮 SDK Full 验收 |

Production: `c24842bde26128c0a3b2aa016616e02e46901853383a3388cf8c81bdf086578c`。
Development: `53884afa819ec2c92133debb963dfba9c4d9230c6da3626df0542bd15be19a10`。
Node、生成、Build 与 CI 可证明工程门禁，不构成 Native 产品分数。
架构、安全、扩充能力、书签兼容、回归、Native 产品各维均保留证据但 NOT_SCORED。

精确消费合同：`page.getContext()` 返回 `status/title/url/tabRef/documentRef`；
`bookmarks.create({title,url,parentId?,sourcePage:{url,tabRef,documentRef}})`。
引用只能由 Host 解析，普通当前 Document 不拥有 Tab；同 URL 重载也失效。
书签主线继续持有 `examples/sidebar-tools/bookmark-manager/`；
SDK 本轮释放 `src/ui/sidebar-tools.js`，无需消费端再次修改 probe 或重造私有 Bridge。
下一步：SDK 依现有矩阵批准下一批受限 Service/Scoped 合同；市场/UI 负责人修复
真实入口定位；Mac Chrome 验收负责人执行同候选安装、Full 授权、CRUD、事件和重启。
Issue #75 保持 OPEN。完整修改文件清单及每份原始证据的 SHA256 见 summary.json。
