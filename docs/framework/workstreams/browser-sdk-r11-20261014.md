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

## R11 · 先完成接口映射：固定 Native 编译入口（2026-10-14）

**用户决定**：本轮仅实现接口声明式映射，不重新设计或修改现有权限申请、真实点击、安装授权、Browser Host 以及 Chrome Driver，也不先迁移 Bookmark Manager UI。

### 实际源码

- **单一批准事实**仍是 `docs/api/browser-sdk-interface-matrix.json`，原有 55 项=53 公开 + 2 Host-only，分母不变。完整 Chromium Discovery 原有 1,830 项仅供发现，未批准即拒绝。
- `scripts/generate-browser-bindings.mjs` 现在从已有 Chromium nativeInterfaces 自动提取这 55 项审批对应的 **66 条 Native API 关系与签名、参数、返回类型**，固化到 `docs/api/browser-sdk-binding-catalog.generated.json`。SCOPED=37、CUSTOM=16、DENIED=2；接口名称映射不是运行时权限批准。
- 同一脚本输出极小的 `src/framework/sdk/browser-direct.generated.js`；**只有**获批、同名、纯读、无站点扩大、无手势、Promise 返回值的 DIRECT 接口才允许进入 Native 运行表。当前批准分母中 DIRECT 为 **0**，故运行表有意为空，不能夸称新开了 Chrome 任意 API。
- `src/framework/sdk/browser-bindings.js` 的现有、受信任 Dispatcher 新增 build-fixed Native DIRECT 名称解析，必须由现有 Host 授权，再用固定路径做一次 Chrome 调用并进行既有结果字节/撤权/未知副作用限制；SCOPED 仍使用可信 `bookmarks/tabs/downloads/storage.local` 自动服务映射，不会绕过当前 Owned、Cookie、Scheduler 的特殊权限处理。
- `src/framework/sdk/browser-schemas.js` 和 `browser-contract.js` 对**仅有**已编译 DIRECT 映射的接口提供通用 JSON Schema 参数验证。新增普通批准 DIRECT 不再要求新增 Wrapper 或 Host if-case。对于有副作用、全局读取、事件、复杂 Scope 的接口仍必须通过单一权限合同及现有可信 Driver。
- `src/platform/chrome/context-menus.js` 仅把同一固定 DIRECT 描述注入原 Host 的现有 Binding Dispatcher。安装方无权提供任何 Native 方法字串、Chrome 权限字典或自定义调用目标。Manifest 和 Optional Permission Gate、安装器、真实点击入口、页面 SDK 隔离没有变动。
- `tests/environment/browser-sdk-r11-native-direct.test.mjs`：合成批准的 `runtime.getPlatformInfo` Fake Chrome 测试证明可通过同一 Registry+编译描述调用，且未批准、非法 Native 目标、getter/继承方法、撤权、不安全 SCOPED 升级失败关闭。该接口**仅存在于测试夹具**，不属于仓库正式 55 项公开 SDK。
- `tests/environment/browser-sdk-r11-generated-catalog.test.mjs`：检查 66 条 Native 精确参数/签名可由固定原生目录重复生成；`scripts/check-browser-sdk-freeze.mjs` 原有检查追加 DIRECT 文件漂移检查，维持一个 CI 入口。

### 验证边界

- SOURCE_WIRED：本轮已真实写入 GitHub main。
- GitHub CI Node / check / production build / development build / verify：**PENDING**，需读取最新与本轮源码绑定的工作流原始结论后改为 PASS/FAIL。
- Mac Chrome 原生 **NOT_TESTED**。不能把 Fake Chrome 示例提升为 Chrome 安装通过，也不能给不存在的 DIRECT 接口宣称 Native PASS。
- R11 全量书签能力仍等待另一轮独立 Full Bookmarks Capability 和原生 CRUD 合同，详见 Issue #75；本轮保留所有已有真实消费者、授权和旧 Host 执行路径。
- 专家独立 95+ 是最终验收门槛而非静态声明分数；Native NOT_TESTED 时不评分 95+。
