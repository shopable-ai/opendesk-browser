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
