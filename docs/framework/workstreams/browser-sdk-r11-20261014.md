# Browser SDK R11 — Declarative Chrome Binding (2026-10-14)

**Ownership:** SDK R11. Only `main` writable; do not overwrite other agents. Web GitHub connector; no access to the user's Mac repo or Chrome Profile. No local watcher, native browser, or dist touched.

## Source contract and scope

- Approved runtime registry: `src/framework/sdk/browser-contract.js` (53 public operations). Trusted-only History/permissions: 2. Total approved contract **55**, unchanged. 1,830 discovered native rows are a *catalog*, not permissions or delivery count.
- Existing trusted installed-tool Browser Host: `src/platform/chrome/context-menus.js`; sender, document, packageHash, installEpoch, explicit permissions and one-shot click remain authoritative.
- First-party bookmark tree: `src/bookmark-manager/service.js`, **not** the installed-tool Browser SDK.
- `browser.bookmarks.create` currently returns opaque owned ref; cannot be represented as Chrome-native create without renaming and consumer migration. Full-bookmark access cannot piggyback on `browser.bookmarks` owned capability.
- No additional branches or worktrees. Target independent files only; check current file blob and main before writing.

## Implemented source slice

- `src/framework/sdk/browser.js`: generate the finite, deep-frozen public method tree from approved `BROWSER_OPERATIONS`; preserve current `network.watch` composite, clipboard positional convenience, local Page SDK discovery/denial and all existing Host operation strings. Commit `72b0f59345c4d57945a88d7a61908f0b7e6ed750`.
- `tests/environment/browser-sdk-r11-declarative.test.mjs`: approved method, namespace denial, exact request argument and Page isolation tests. Commit `0efdb5e1bd6d5503d3dead62488582805f8ba80d`.
- This is **not** yet the full declarative Host adapter or full bookmarks SDK; do not mark P0 accepted.

## Validation and evidence (this R11 source slice)

- Node: **NOT_TESTED locally** — GitHub interface has no Node execution; GitHub CI still pending when checked.
- Build: **NOT_TESTED locally** — same limitation; pending CI is separate.
- GitHub CI: **IN_PROGRESS** for `0efdb5e1` at https://github.com/shopable-ai/opendesk-browser/actions/runs/38578029413 and https://github.com/shopable-ai/opendesk-browser/actions/runs/38578029427.
- Mac real Chrome: **NOT_TESTED**; same-source candidate/extension id/installed package/permissions/real gesture and native receipt not collected.
- Prior unrelated global regression at https://github.com/shopable-ai/opendesk-browser/actions/runs/38577935799 failed `static import review ... explicit approval`. No evidence the SDK facade caused that failure. Never attribute/waive without logs and change analysis.

## Remaining

Finish finite approved Host Binding dispatcher with no raw `chrome[namespace][method]`, full bookmark service authorization/methods after independent capability and consent, matrix contract coordination, P0 Node/Build/CI and real Chrome acceptance. Do not alter evidence PASS counts without same candidate provenance.

## R11 · 命名空间自动绑定纠偏（2026-10-14）

用户指出按每个 `browser.x.y` 手写 `(input,owner)=>host.y(input,owner)` 并不是期望的声明式接口映射。在 R11.1 并行收敛到 18 个显式路由后，R11 采用更少样板代码的方案：

- `createApprovedBrowserBindings()` 现在接受已审计的 **可信命名空间服务**（如 `bookmarks:bookmarkHost`、`tabs:tabHost`），通过唯一 `BROWSER_OPERATIONS` 中已批准的 `namespace + leaf method` 自动构建固定分发表；原显式 `browser.x.y:handler` 仅保留作为特殊组合接口逃生门。
- **只读取服务对象自己的数据属性描述符**，不会调用 getter、继承原型方法、遍历不受信任包提供的 Native 路径。服务内部 `resolve/revokeAll/diagnostics` 不在批准 Registry 时不可用。
- `context-menus.js` 的 18 个显式路由收敛为 `bookmarks/tabs/downloads` 3 个受信服务 + 一个 `storage.local` 同命名空间服务；一次性点击操作名由现有 Registry `requiresUserGesture` 自动导出，保留 `sidePanel.openSelf` 特殊前台流程。
- 保留已有可信 Sender/Host Document、包摘要、installEpoch、工具能力、Chrome Permission、精确 Origin、一次性点击批准、生命周期再次核验、IPC 输出限制和未知副作用保护，没有放宽权限。
- 提交：[namespace resolver](https://github.com/shopable-ai/opendesk-browser/commit/2580454197a268c610dadcf690e6311cd18c7e8e)、[Host use](https://github.com/shopable-ai/opendesk-browser/commit/bdac57df6a430a68daa526877338193fea9b4018)、[gesture registry](https://github.com/shopable-ai/opendesk-browser/commit/e6ef5500124318d5511924fe69a647d113b0009b)、[tests](https://github.com/shopable-ai/opendesk-browser/commit/c80704299ba4dcb2d633e4531959e1241ec50741)。
- 新增约束测试覆盖命名空间派生、不可批准的方法拒绝、getter 不执行、嵌套 storage 通用 handler、已有授权/撤权与响应预算；最终 CI 结果必须按最终候选查询，不复制历史 PASS。

**边界**：这一步实现的是“**SCOPED/Owned 可信服务自动映射**”，尚不是 `DIRECT` 普通 `chrome.*` 原生 Promise 映射；全量书签 P0 仍受 [Issue #75](https://github.com/shopable-ai/opendesk-browser/issues/75) 的独立 Full Capability、Native 签名、分块/分页、事件和 Host 条件删除约束。不可把 53 个 SDK 方法的可见性等同于 53 个真实 Chrome API 的映射/原生验收。

**验证账本（本条写入时）**：SOURCE_WIRED；最新 Node/Build/CI = QUEUED/NOT_YET_PASS；Mac Chrome = NOT_TESTED。待最终同候选 CI 和实际 Chrome 证据后再更新。目标独立评分 >=95 只是验收门槛，当前不得据静态评审冒充正式 PASS。
