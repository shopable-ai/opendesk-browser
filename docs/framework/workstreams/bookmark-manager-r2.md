# Bookmark Manager R2 — SDK-only 独立工具迁移工作账本

日期：2026-10-14；仅 `main`；归属 `examples/sidebar-tools/bookmark-manager/`、专属测试与 CI。

## R2.4 独立工具正式接管（2026-10-15）

> 本节是 **R2.4 实际源码状态更新**；上文 R2/R2.3 记录均为当时历史候选，不再代表最新正式入口。

- 已从 `main` 删除全部 `src/bookmark-manager/` 五个遗留源码/文档文件、内置书签 UI CSS、旧 R1 测试及专属 R1 CI，不建立备份兼容目录。已有行为回归由 `tests/environment/bookmark-manager-r2.test.mjs`、`browser-sdk-r112-full-bookmarks.test.mjs` 及新增 `browser-sdk-r124-current-page.test.mjs` 承接。
- 唯一书签管理业务位于 `examples/sidebar-tools/bookmark-manager/`，版本 `0.3.0`，正式 Full Capability `browser.bookmarks.full` 与 `currentPage.read`。
- `official-tools/catalog.json` 已登记 `optional`。已移除 `tool.html` 内置入口及 `sidebar-tools.js` 对 `createBookmarkManager` 的依赖，普通用户使用现有「扩展」目录内的安装、审阅授权、启动/停用/卸载路径；不是 GitHub Artifact/ZIP 导入。
- `browser.page.getContext()` 的可信 Side Panel 调用通过原 Browser Host 发放短期 `tabRef/documentRef`，与 Owned TabRef 不可互换；Chrome 标签窗口、活动状态、URL、主 Document 和工具身份均被复核，刷新、撤权、导航和 Worker 重启使旧引用失效。书签写入前二次核验；SDK 客户端把读取授权与写入需用户点击的授权状态区分开。
- `scripts/prepare-public.mjs` 与 `scripts/verify-package.mjs` 的资源白名单已同步删除旧 CSS。独立 R2 CI 已更新到 v0.3.0 和新身份回归。
- 验收证据边界：本轮 GitHub 源码提交与隔离 V8 语法/单元冒烟检查**不能**代替 Node、`npm run check`、构建、GitHub CI 或真正 Mac Chrome。各门禁应凭最终提交对应结果单独标为 PASS / FAIL / QUEUED / NOT_TESTED；原生 1001 项、跨窗口并发删除、真实授权与 Worker 生命周期在完成原生测试之前均为 **NOT_TESTED**。不能宣称九维 95+。

## 真实核查（R11 前置）

核查基线远端 `main` 提交 `ac472c41abc6bacef22a67180505e5416cc4b84a`，后续主线会变化，执行 Native 前必须重读 HEAD：

| 层级 | 2026-10-14 事实 | R2 P0 结论 |
|---|---|---|
| `src/framework/sdk/browser-contract.js` | 只有 `bookmarks.create`、`removeOwned` | Full 缺口 |
| `src/framework/sdk/browser.js` | Wrapper 同上 | Full 缺口 |
| `src/platform/chrome/bookmarks.js` | 真实 Owned Host，opaque ref / 64 限制 | 不等于 Full |
| `src/ui/sidebar-tools/package.js` | v2 支持 `browser.bookmarks`，未定义独立 Full | 不能安全声明 Full |
| `src/ui/sidebar-tools.js` | 现行安装审阅明确称“自建书签，不读取书签树” | 不能静默提升 |
| `src/bookmark-manager/` | 完整可信 R1 模型、CRUD、静态 UI | 迁移参照，暂保留 |
| SDK 通用响应 | 普通响应上限 12000 bytes | 500+ 需专门有界/分页合同 |
| 已安装工具 Full Bookmarks 原生证据 | 未发现同候选闭环 | NOT_TESTED |

跨主线阻塞正式登记：[SDK R11 P0 Issue #75](https://github.com/shopable-ai/opendesk-browser/issues/75)。该 Issue 是统一 Registry/Binding/Authorization/Dispatcher 的需求输入；**本任务不新增 Host、Chrome Driver 或包权限别名**。

## 独立工具迁移准备

创建 `examples/sidebar-tools/bookmark-manager/`（v2 包格式、Classic 源依赖、独立 HTML/CSS、模型、SDK-only Service、视图），仅使用现有打包器和 `OpenDeskSDK.browser`。这是未来功能代码与明确失败关闭的**可打包预备源码**，并非完整功能完成的标志。0.1.0 暂不登记 `official-tools/catalog.json`；`capabilities: []` 不申请已存在的 Owned 书签权限，也不偷偷声明不支持的 Full Capability。

沿用 R1 的单树/三按钮、500+ 搜索及滚动上限、目录菜单、受管理节点保护、删除确认和失败草稿。不克隆 Host UI。SDK 尚不提供授权事件/Host 端原子删除条件：当前只能手动刷新，非空目录删除会安全拒绝，等待 R11 补齐；保存当前页的文档绑定仍需 R11 可信核对，前端二次检查不构成原子一致性证明。

## 验收（严格分级，不互相替代）

| Gate | 状态 | 说明 |
|---|---|---|
| GitHub 真实源码 | SOURCE_PREPARED（待提交后校验） | R2 独立项目 |
| SDK R11 Full Binding / Host / Permission | BLOCKED | Issue #75 |
| 静态 SDK-only / fail-closed Node | NOT_TESTED | 新增 `tests/environment/bookmark-manager-r2.test.mjs` |
| 独立工具打包 | NOT_TESTED | `npm run build:sidebar-tool -- examples/sidebar-tools/bookmark-manager` |
| Check / Production Build / Development Build / Package Verify | NOT_TESTED | CI 与本地分别记录 |
| CI 同候选 | NOT_TESTED | 独立 R2 Workflow |
| Mac 本机 Profile、真实 Chrome Full CRUD、首次允许/拒绝、500+、事件、并发、撤权、重启、卸载 | NOT_TESTED | 无 Mac/Chrome GUI 权限，不能由 GitHub 或 Mock 冒充 |

## Native 放行条件

先将 Issue #75 P0 条件全部在 **统一 SDK** 中实现并提供同候选证据；再更新工具 manifest Full capability、批准语言、事件订阅、Host 条件删除和本地服务调用，以真实安装包证明正常 CRUD。安全/核心/性能/无障碍/维护性每维需原生证据才能独立 ≥95。删除 `src/bookmark-manager/` 和旧入口的最后步骤必须以原生数据一致性与消费者审计完成为前提。

## R2 `0.1.0` 首轮 GitHub CI 验证（2026-10-14）

- **经过测试的候选 SHA**：[`fa1eacc9f47616da6e4bf89aee67f31a889db03c`](https://github.com/shopable-ai/opendesk-browser/commit/fa1eacc9f47616da6e4bf89aee67f31a889db03c)；不引用其他 Agent 的后续 `main` 作为该测试身份。
- **GitHub Actions**：[`38580453628`](https://github.com/shopable-ai/opendesk-browser/actions/runs/38580453628)，job `115908647618`，`completed/success`。
- **PASS — Node**：`tests/environment/bookmark-manager-r2.test.mjs` **7 / 7**，覆盖工具包、隔离、不能伪造空树、550 项完整搜索、Owned 能力不可访问 Full、缺 Full 绑定拒绝、无 Host 条件票据不删除文件夹。
- **PASS — Check**：`npm run check`。
- **PASS — Independent Package Build**：`npm run build:sidebar-tool -- examples/sidebar-tools/bookmark-manager`，生成 `artifacts/sidebar-tools/bookmark-manager/0.1.0/bookmark-manager.opendesk-tool.json`，**31,548 bytes**，构建器 `validated: true, installed: false`；该测试包只会明确阻断缺失的 Full SDK。
- **PASS — Production Build / Package Verify**：`npm run build` 和 `node scripts/verify-package.mjs dist/production`；生产扩展构建哈希 `c90bea2a13e845c519cb464052eb2e037f9ff5b4d58f39b4bdd4eec35c8a105f`。
- **PASS — Development Build**：`npm run build:dev`；开发扩展构建哈希 `ad97b97df620d2c61d76a194d2954ad9a5b8a593bd546d8e511118b798bf0ec2`。
- **CI 发行证据**：[预备包与构建回执 ZIP](https://github.com/shopable-ai/opendesk-browser/actions/runs/38580453628/artifacts/11902529683)（GitHub Actions artifact ID `11902529683`，ZIP SHA-256 `5e28f6b7ed17cae4f76d1fb9839cd11976f054f915432647ea52d1045d7eb41f`，非 Chrome 原生安装证据）。首轮 `d321c55b` CI 失败为测试文案正则与原错误消息不匹配，已通过 `fa1eacc9` 修复并复验。
- **BLOCKED — Full SDK & Real Chrome**：Issue #75 尚未关闭，缺独立 Full Bookmarks 注册/权限/Host/事件/大树/条件删除。没有用户 Mac Profile 的原生真实安装、读写、跨窗口、撤权、SW 重启、卸载记录；均明确 **NOT_TESTED**。**PASS 仅用于上述实际运行过的 CI 组件，绝不宣称 R2 正式完成。**


## R2.1 · SDK 消费端增量与失败修复（2026-10-14）

**执行边界**：只写独立工具 `examples/sidebar-tools/bookmark-manager/`、专属 Node 测试、CI 和此账本。不修改 SDK R11 owner 正在负责的 `src/framework/sdk/*`、Chrome Driver、权限/Host；无 Mac 本地工作区挂载，不能声明执行了真实本机 Chrome。

- GitHub 主分支真实提交：[`411dce0b`](https://github.com/shopable-ai/opendesk-browser/commit/411dce0bd35255afd141def5415736d050c4a4eb) 增加 Full SDK 单对象 CRUD、500+ 分页快照、条件写入、目录 Host 票据及有界事件会话消费。
- 上述提交的 [CI #38592116547](https://github.com/shopable-ai/opendesk-browser/actions/runs/38592116547) **FAIL**：Node 13 项中 11 PASS、2 FAIL。旧 Mock 缺新增的 `prepareRemoveTree` 导致旧测试未更新；Check/Build 被跳过。绝不将历史 CI 结果冒充此候选成功。
- 后续 [`53f5d954`](https://github.com/shopable-ai/opendesk-browser/commit/53f5d95418725b08f3afdf020ae054adb0cdb7af) 修复旧 Mock、同步 Node 测试；在独立 UI 加入 observe.start/read/stop 会话消费、事件缺口时全量同步、输入草稿保存、pagehide 清理；当前页收藏必须 Host 校验的 opaque Tab/Document，不能两次比较 URL。
- 工具清单保持 `0.2.0` 与 `capabilities: []`；CI 更正工具包产物路径并追加 `npm run verify`，没有通过 Chrome Full 权限的事实不得加入官方 Catalog。

**未来 R11 owner 接口/Host 前置**（Issue [#75](https://github.com/shopable-ai/opendesk-browser/issues/75)）：需要审批 Full Bookmarks Capability、唯一 Registry/Wrapper/Host/Chrome Driver、完整书签树绑定快照分页、书签 CRUD 的原子条件检查、非空目录可信删除票据、Chrome optional bookmarks 真手势授权、身份/包摘要/epoch、撤权/卸载/Worker 重启/事件缺口隔离，以及当前页 documentRef 可信绑定。R11 若修改方法签名，本工具按最终正式合同同步，不自行新增私有 RPC。

**后续状态和验收分级**：本轮 Node/Check/Build/CI 必须以最终候选 SHA 的 Actions 证据来报告；真实 Chrome 安装/Full CRUD/500+/撤权/Worker/升级/卸载与九维 95+ 在 Mac 没有同候选原始收据，均 NOT_TESTED。`src/bookmark-manager/` 在原生闭环完成前保留。旧候选 R2 的 7/7 Node 和生产/开发 Build PASS 只作为历史基线，不覆盖新候选。

### R2.1 同源候选 CI 实测回执（2026-10-14）

- **PASS — source SHA**：[`054b4f0cdf0279a43955ad18025364c730458bc5`](https://github.com/shopable-ai/opendesk-browser/commit/054b4f0cdf0279a43955ad18025364c730458bc5)（此前的失败候选 `411dce0b` 和 `53f5d954` 仍保留失败历史，不被覆盖）。
- **PASS — GitHub Actions**：[`38593735852`](https://github.com/shopable-ai/opendesk-browser/actions/runs/38593735852)，job `115954977381`，completed/success。
- **PASS — Node**：`node --test tests/environment/bookmark-manager-r2.test.mjs` **14/14**，0 failures；涵盖 Owned/Full 权限隔离、550 项树与分页、坏游标、SDK 单对象 CRUD、目录可信票据失败关闭及正向 Mock、文档绑定和事件会话。
- **PASS — Check/Build**：`npm run check`、`npm run build:sidebar-tool -- examples/sidebar-tools/bookmark-manager`、`npm run build`、`node scripts/verify-package.mjs dist/production`、`npm run build:dev`、`npm run verify`，均为相同 Actions job 成功步骤。
- **PASS — package schema, NOT INSTALLED**：唯一打包器生成 `artifacts/sidebar-tools/bookmark-manager/0.2.0/bookmark-manager.opendesk-tool.json`，**41,252 bytes**、`validated:true`、`installed:false`。该包仍 `capabilities: []`，没有 Full Chrome 读取权限；CI 上传 Artifact 不代表安装。
- **BLOCKED — R11**：当前 Registry/Wrapper/Host 仍未声明独立 Full Bookmarks；Issue #75 未关闭。SDK Node Mock/打包成功不等于 Chrome 原生映射可调用。
- **NOT_TESTED — Native**：实际 Mac Chrome Profile 的 Full 书签 CRUD、500+ 原生树、Chrome optional 权限、拒绝/撤权、Worker 重启、并发删除、工具升级/卸载均没有同一候选原始收据。九维产品专家 95+ 不能据此打分。

后续如有无关主线提交，引用以上精确 SHA 及 Actions 结果；若本目录或 Browser SDK 相关输入发生变化，必须补受影响的定向验证。`src/bookmark-manager/` 旧可信模块仍需保留至真实迁移门禁关闭。

## R2.2 · SDK 前置受阻下的独立树完整性修复（2026-10-15）

**Owner：Bookmark Manager 独立消费端；仅改独立工具、定向测试、专属 CI 和本账本。**

- Chrome-shaped getTree 新增唯一根、文件夹 children 完整性、父子 parentId 一致性及节点类型检查；分页平面快照拒绝多个根，避免数据静默缺失。
- Node 回归覆盖部分文件夹、伪造 parentId、URL 节点混有 children、多根与拒绝后续写入。
- 预备包提升版本 0.2.1，调整 README、定向 CI 产物路径，不进入官方 Catalog，不改变 SDK/Host/Driver/权限架构。
- R11 Full SDK：BLOCKED；真实 Mac Chrome、Native CRUD/500+/撤权/Worker/卸载：NOT_TESTED；旧宿主 src/bookmark-manager 保留。

**本轮测试**：以同候选 GitHub Actions 最终 Node、Check、Build、Package Verify、Verify 为准；无 Mac Profile 时不能报告 Native 通过。

### R2.2 增量：权限失效即时保护

- Full SDK Registry 存在而 capability status 不可调用时，消费端区分 E_BOOKMARK_PERMISSION 与 E_R11_BOOKMARKS_INCOMPLETE；Node Mock 验证撤权后不请求 getTree/create/observe.read。
- 事件启动/读取、CRUD 遇到已知 SDK/权限/工具身份失效，独立 UI 立即隐藏旧书签树；不改 Host，实际 Chrome revoke 时序仍 NOT_TESTED。
- 仍是未正式发行的预备包 0.2.1；Native 和官方安装 BLOCKED/NOT_TESTED。

## R2.3 · 撤权异步回包与事件缺口失败关闭（2026-10-15）

- **Owner / 文件范围**：Bookmark Manager 消费端；仅修改 `examples/sidebar-tools/bookmark-manager/src/{main,service}.js`、专属 Node 测试/CI、`tool.config.json`、本工具 README 和本工作流。依赖 SDK R11 Issue #75；**不改**公共 SDK、Chrome Host、权限/安装器、官方 Catalog 或旧 `src/bookmark-manager/`。
- **修复事实**：权限/API 状态失效时 `gate()` 同步注销 in-flight UI session、清除书签树并恢复被挂起的 UI 操作状态，阻止晚到的成功加载回包将旧书签数据重新展示；`E_SDK_MISSING/E_SDK_STATUS` 同样触发隐藏而非残留旧视图。
- **事件可靠性**：`observe.read` 必须返回两个非负安全整数 `gapCount/droppedCount`；缺少、类型错误、负值时拒绝异常回执，不能把无法证明连续的事件流当成零丢失。
- **回归**：专属 Node 测试新增坏事件计数与未完成 `load()`/写入遭遇失权 gate 的运行时模拟。预备版从 `0.2.1` 升至 `0.2.2`，CI artifact 路径同步调整，仍为 `capabilities: []`、**未进入 Catalog、未正式安装**。
- **证据级别**：写入前仅确认 R2.2 同源 CI #38598911425 在 `c115a821` 为历史 PASS。R2.3 Node/Check/Build/Verify/CI 须按本轮候选的真实 GitHub Actions 另行核查。Mac Chrome Native / SDK Full CRUD / 500+ / 撤权 / Worker / 安装 / 卸载仍 `NOT_TESTED / BLOCKED by R11`。未完成前不允许删除旧可信模块或自评九维 95+。

## R2.3 · R11.2 并行 SDK 接线后的消费者身份收敛（2026-10-15）

- SDK Owner 已向 `main` 提交 `b63c9e3c`：正式 Full Bookmarks Registry/Schema/Trusted Host、`browser.bookmarks.full`、用户授权 UI 和 Native Driver 源码已接线（`SOURCE_WIRED`，并非 Mac Chrome PASS）。
- 本任务未修改公共 SDK/Host/Permission，复核发现 `tool.config.json` 在首次把 `capabilities: []` 改为 `["browser.bookmarks.full"]` 后仍使用原预备版本 `0.2.2`，存在同版本不同包字节/权限声明问题。本轮将工具版本提升至 **0.2.3**，同时更新测试、专属 CI 构建产物路径与独立工具 README。旧 `0.2.2` 历史包不变，绝不自动提权。
- `browser.page.getContext()` 公开响应 Schema 仍仅含 `status/title/url/message`，无法给独立工具 Host 可核验的 `tabRef/documentRef`；当前页收藏维持 `BLOCKED / FAIL_CLOSED`，公共 SDK owner 需显式完成该合同及真实 Native 验证。
- 其他全量读写、分页、事件、并发删除与授权路径已有源码接线，待同候选 Node/Check/Build/Chrome Native 实际证据，不能因声明 Full 就登记官方 Catalog。正式安装、权限撤销、跨窗口、Worker、550 项、升级/卸载仍 `NOT_TESTED`；保留 `src/bookmark-manager/`。

### R2.3 · R11.2 撤权错误码对齐 / 0.2.4（2026-10-15）

真实 Full Host 新增 `E_BOOKMARK_FULL_CONSENT_REQUIRED`，旧安装包身份失效返回 `E_TOOL_CHANGED`，无效身份返回 `E_OWNER`。消费者的写入回包错误若不识别这些代码，可能在用户撤权后继续展示旧书签树。本轮仅修改独立工具 `src/main.js` 的 `authorityLost`，在失效时同步清树、注销未完成读取；在既有 UI VM 回归中注入实际异步拒绝验证。为避免 0.2.3 同版本不同源码包，更新预备版本为 **0.2.4** 并同步专属测试、CI artifact 路径和 README。其 Native、Catalog、旧模块清理仍未放行。
