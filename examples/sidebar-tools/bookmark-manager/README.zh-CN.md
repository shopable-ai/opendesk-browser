# Bookmark Manager R2.3 · SDK R11.2 源码接线候选

> **状态：SOURCE_WIRED / NATIVE_NOT_TESTED / OFFICIAL_NOT_RELEASED。** 不等于已通过真实 Chrome 验收。

本项目 `examples/sidebar-tools/bookmark-manager/` 是唯一独立书签工具业务源码：`tool.config.json`、`src/index.html`、`src/style.css`、`src/model.js`、`src/service.js`、`src/main.js`。继续使用官方 Sidebar Tool v2 打包器、Opaque Origin iframe 和 `OpenDeskSDK.browser.bookmarks.*`；没有私有 Host、第二套 SDK 或直接 `chrome.*` 调用。

## 当前 R11.2 合同与安装状态

2026-10-15 的 R11.2 提交 `b63c9e3c` 为正式 Registry、Schema、Host、独立 `browser.bookmarks.full` 和安装工具的可信书签授权按钮完成了**源码接线**。独立 Full 与 Owned 的 `browser.bookmarks.createOwned/removeOwned` 是不同权限；Chrome manifest 已声明 optional `bookmarks`，安装工具的声明并不等于用户已批准 Full 或 Chrome 权限。

- 工具预备版本 **0.2.4**：`capabilities: ["browser.bookmarks.full"]`。原 **0.2.2** 仍是 `capabilities: []` 的 SDK-gated 预备包，禁止以相同版本发行不同权限和字节。
- **尚未进入 `official-tools/catalog.json`，未通过正式扩展中心安装或 Chrome Native 验收。** R11.2 的 Mock/Node 成功不能替代真实浏览器、用户手势、批准/拒绝和包/epoch 栅栏；严禁把构建产物标记为 Installed。
- 不满足 Full Capability 状态、Host 权限、包身份或可信回执时，客户端失败关闭并隐藏已失权树；新增识别 `E_BOOKMARK_FULL_CONSENT_REQUIRED` / `E_TOOL_CHANGED` / `E_OWNER` 并在写入失败时清屏，不会回退至 Owned 能力伪造全量结果。
- 已有 `src/bookmark-manager/` 第一方可信功能保持不变；独立扩展真正通过 Chrome 原生完整验收前不允许删除。

## 消费端功能

| 需求 | 正式 SDK 方法 / 消费端边界 |
| --- | --- |
| 全量树、搜索与读取 | `getTree({limit:80,cursor?})` 按单一 `snapshotRef` 分页；`get({id})`、`search({query})` 属于独立 Full 能力 |
| 新建/更新/移动/删除 | `create`、`update`、`move`、`remove`；读取预期节点快照并由 Host 复验 |
| 非空目录递归删除 | `prepareRemoveTree({id,snapshotRef,expected,descendantCount})` → 一次性短期 `ticket` → `removeTree({id,ticket})`；并发子树变化由 Host 拒绝 |
| 跨窗口变动 | `observe.start/read/stop` 有界事件；缺 `gapCount/droppedCount`、丢失事件或 Worker 会话失效时重新读取完整树 |
| 500+ 条书签 | 分页最多 20,000 节点；客户端完整投影和搜索，不把首屏 200 条显示上限当成搜索范围 |
| 当前网页收藏 | 必须提供 Host 可验证的 `tabRef/documentRef`；当前公开 `browser.page.getContext()` 的 Schema 仍未返回这两个引用，因此该入口**不能宣称 Native 可用**，保持失败关闭 |

业务状态保存在浏览器原生书签中；工具卸载不删除 Chrome 原始书签。界面保留单树、搜索、文件夹、紧凑编辑与确认，不创建第二套 UI。

## 构建与验收

```sh
node --test tests/environment/bookmark-manager-r2.test.mjs
npm run build:sidebar-tool -- examples/sidebar-tools/bookmark-manager
# artifacts/sidebar-tools/bookmark-manager/0.2.4/bookmark-manager.opendesk-tool.json
npm run check
npm run build
npm run build:dev
npm run verify
```

这些仅提供静态/Node/Build 证据；GitHub CI 也不是用户真实 Chrome 安装。只有 SDK、包身份、Chrome optional 权限和真实浏览器测试全部通过，才可另行决定官方 optional Catalog、发行及旧宿主清理。

SDK 公共前置项仍跟踪 [Issue #75](https://github.com/shopable-ai/opendesk-browser/issues/75)，本工具的审计与各候选历史在 [Bookmark Manager R2 workstream](../../../docs/framework/workstreams/bookmark-manager-r2.md)。九维 95+ 仅能根据同一最终候选的 Chrome 原生实测分别评分。
