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

## R11 · 单批准描述驱动完整自动生成闭环（2026-10-14）

针对“新增一个普通官方接口仍要手改 Registry + Schema”的问题，额外收敛到**单一批准矩阵 → 编译生成 Runtime DIRECT 描述 → Schema / Registry 自动派生 → Wrapper 自动挂载 → 原 Host 自动调用**：

- `deriveBrowserDirectBindings()` 从现有审批矩阵及固定 Chromium Promise API 签名产生可执行的完整 DIRECT 描述，包含 operation、nativeApi、位置参数、Capability、Chrome Permission、允许执行世界、请求和响应 Schema、IPC 限额及浏览器最低版本。原有 53 个非 DIRECT 公共入口维持手工审计合同，不改业务执行语义。
- `deriveBrowserDirectOperations()` 在 `src/framework/sdk/browser-contract.js` 自动合并**新增 DIRECT** 的注册项；`deriveBrowserDirectSchemas()` 在 `src/framework/sdk/browser-schemas.js` 自动合并类型输入/输出；`src/framework/sdk/browser.js` 已根据 Registry 自动生成公共 Wrapper；Host 的 `nativeDirect` 走原 installed-tool Sender、packageHash、epoch、Capability、Chrome Permission 和作用域再次验证，不要求新增逐方法分支。
- `browser-bindings.js` 限制 DIRECT 为同名、批准、无站点作用域、无手势、只读、Promise Native Method；必须是对象自身的数据函数（不执行 getter/继承）；Native 拒绝或无 Promise 有稳定错误；危险 Cookie、Owned Tabs、Owned Downloads、Owned Bookmarks、Scheduler 等仍 SCOPED/CUSTOM。
- 独立回归测试使用**仅测试夹具**的 `browser.runtime.getPlatformInfo` 模拟一次批准，验证自动派生接口目录、Registry、Schema 和 Chrome Mock Promise 运行，全程不真实批准或开放这个 API；伪造 Native 名称、强行升级写操作、权限漂移、异常返回和撤权均为拒绝路径。
- 官方 55 项的 Registry/安全含义及 Manifest 未变化；`src/framework/sdk/browser-direct.generated.js` 暂为 `[]`，说明当前冻结批准合同并没有符合直接透传语义的项。不能把编译器可用性说成已经向工具开放 1,830 项。
- 本轮相关 GitHub CI 在 [先行候选 R5](https://github.com/shopable-ai/opendesk-browser/actions/runs/38597519085) 和 [先行候选 R13](https://github.com/shopable-ai/opendesk-browser/actions/runs/38597527475) 有 PASS；最新编译闭环的 Node / Build / CI 需以本段实际最终源码候选的工作流结论另行核验，不自动继承。真实 Mac Chrome 仍 **NOT_TESTED**。

## SDK R11.2 · Full Bookmarks P0 源码候选（2026-10-15）

- 任务：[Issue #75](https://github.com/shopable-ai/opendesk-browser/issues/75)。起始核查提交 `fca4b56d0654d088e7802534139f5429358efa0d`，提交候选前已有其他 Agent 推进 `main`，写入以最新 `main` 为父并合并重叠文件。最终提交 SHA 由 GitHub commit history 和候选 CI 标识，不得借历史 SHA 冒充验收证据。
- 公开 Registry / Binding 从 53 增至 **65** 项，Host-only **2** 项不变；批准总数 **67** 项。Owned 原 `bookmarks.create` 正式更名为 `bookmarks.createOwned`（保留 `removeOwned`），无旧兼容别名。Full 公开 **12** 个：`getTree`、`get`、`search`、`create`、`update`、`move`、`remove`、`prepareRemoveTree`、`removeTree`、`observe.start`、`observe.read`、`observe.stop`。
- Full 只授予显式声明 `browser.bookmarks.full` 的安装工具；`browser.bookmarks` 只允许 Owned。独立可信 Side Panel 控件请求可选 Chrome `bookmarks` 权限后，将 Full 同意状态绑定安装 ID、package hash、version 与 install epoch；每次 SDK→唯一 Host→Registry Binding→可信 Chrome Driver 操作均重新检查权限。沙箱只获得脱敏普通 JSON，不获得原生 `chrome.bookmarks`。写入必须经过可信用户单次点击及原有 `browser.intent.confirm` 票据，不开第二条 Bridge。
- 新 `bookmarks-full.js` 为 Full 专属的最小可信 Driver，Owned Driver 继续保留工具自有 BookmarkRef/隔离语义。对所有大型树输出有界节点页，快照仅 Worker 内存，最大 20000 节点/8MB、120 秒 TTL、每页 ≤10500 字节，Cursor 绑定工具/package/install。快照冻结意味着分页期间的 Chrome 外部修改不会伪装成同一次新快照；Worker 重启后显式过期，可重新同步。
- 非空目录删除：`prepareRemoveTree` 以完整树快照、目标 metadata、后代节点数及完整子树哈希生成 15 秒、工具安装绑定的票据；`removeTree` 单次消耗票据，Host 在真实 Chrome 调用前再次核验授权、根目录/受管理保护、子树签名。Chrome Bookmarks 无 compare-and-swap 事务；**不能保证 Chrome UI 在最后一次比对与删除之间不存在并发操作**；UNKNOWN 写入不自动重试。
- Chrome `onCreated/onRemoved/onChanged/onMoved/onChildrenReordered/onImportBegan/onImportEnded` 通过 Full Observe 有界缓存间接暴露；超量/缺口/撤权/重启明确失败或产生缺口，按 Chrome 官方语义不假设递归删除每个子项各有事件。
- 消费端只改 `examples/sidebar-tools/bookmark-manager/` 的 Full Manifest、Status 适配，不重做 UI、不迁移 `src/bookmark-manager/`；官方 SDK 验收示例同步迁移 `createOwned`。
- 有关源码与声明式矩阵：`src/framework/sdk/browser-contract.js`、`browser-schemas.js`、`src/platform/chrome/bookmarks.js`、`bookmarks-full.js`、`context-menus.js`、`permission-gate.js`、`src/ui/sidebar-tools.js`、`src/ui/sidebar-tools/package.js`，批准矩阵和生成 Catalog、验收台账、专项测试同步更新。
- **测试证据要求**：本云端 GitHub 仓库写入会话无法访问用户 Mac Chrome、工作目录、已有本地 watcher，也无法运行 Node/npm 构建。提交前的 GitHub blob 创建、接口审计或源码静态核查不是 `npm run check`、`npm test`、`npm run build`、`build:dev`、`verify` 的通过证据；如 Actions 确认运行，应以该 commit SHA 对应的实际结论单独记录。真实 Chrome GUI 和 Service Worker 原生验收均 **NOT_TESTED**，不得把 Issue #75 关闭或产品完成度记 95+。
- 必须由本地 Codex 基于最新 `main` 执行 `AGENTS.md` 开发/生产 Profile 隔离规范、全套 Node/Build/Verify、真 Chrome 安装与拒绝/允许、550+ 页读取、移动/修改/删除、递归删除重检、事件、撤权、Worker 重启、跨工具隔离；保留匹配 source SHA / 包 Hash / profile / extension ID / Chrome Version 的原始证据。可继续修复真实失败，但不得通过减弱权限或删有效测试绿灯。
- 目前不能独立给出 95+ 的专家产品评分；每一维须以实际测试和复核结果单独评定，缺少证据标 **NOT_TESTED** 而不是预估通过。
