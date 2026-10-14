# Bookmark Manager R2 — SDK-only 独立工具迁移工作账本

日期：2026-10-14；仅 `main`；归属 `examples/sidebar-tools/bookmark-manager/`、专属测试与 CI。

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

