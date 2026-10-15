# Bookmark Manager R2.4 · SDK R11.2 独立正式工具

> **状态：SOURCE_MIGRATED / OFFICIAL_OPTIONAL_REGISTERED / NATIVE_NOT_TESTED。** 已纳入官方源码目录，不代表用户设备已安装，也不代表 Chrome 原生验收通过。

本项目 `examples/sidebar-tools/bookmark-manager/` 是唯一独立书签工具业务源码：`tool.config.json`、`src/index.html`、`src/style.css`、`src/model.js`、`src/service.js`、`src/main.js`。继续使用官方 Sidebar Tool v2 打包器、Opaque Origin iframe 和 `OpenDeskSDK.browser.bookmarks.*`；没有私有 Host、第二套 SDK 或直接 `chrome.*` 调用。

## 当前 R11.2 合同与安装状态

2026-10-15 的 R11.2 提交 `b63c9e3c` 为正式 Registry、Schema、Host、独立 `browser.bookmarks.full` 和安装工具的可信书签授权按钮完成了**源码接线**。独立 Full 与 Owned 的 `browser.bookmarks.createOwned/removeOwned` 是不同权限；Chrome manifest 已声明 optional `bookmarks`，安装工具的声明并不等于用户已批准 Full 或 Chrome 权限。

- 工具版本 **0.3.0**：`capabilities: ["browser.bookmarks.full", "currentPage.read"]`。新增当前页读取能力需随版本升级重新审阅；Full Bookmarks 授权和 Chrome optional 权限仍独立申请。
- **已在 `official-tools/catalog.json` 正式登记为 optional**。发行构建器必须生成签名固定的本地官方资源，用户通过「扩展」中心审阅、安装、授权、打开。源码登记不等于在用户 Chrome 中安装；Node/CI 成功也不是 Native PASS。
- 不满足 Full Capability 状态、Host 权限、包身份或可信回执时，客户端失败关闭并隐藏已失权树；新增识别 `E_BOOKMARK_FULL_CONSENT_REQUIRED` / `E_TOOL_CHANGED` / `E_OWNER` 并在写入失败时清屏，不会回退至 Owned 能力伪造全量结果。
- **已删除旧 `src/bookmark-manager/` 及内置书签面板与专属 R1 CI**。业务消费者仅存在于独立工具，公共 SDK / Host / Chrome Drivers 仍保留；Git 历史保存旧实现，不创建兼容副本。

## 消费端功能

| 需求 | 正式 SDK 方法 / 消费端边界 |
| --- | --- |
| 全量树、搜索与读取 | `getTree({limit:80,cursor?})` 按单一 `snapshotRef` 分页；`get({id})`、`search({query})` 属于独立 Full 能力 |
| 新建/更新/移动/删除 | `create`、`update`、`move`、`remove`；读取预期节点快照并由 Host 复验 |
| 非空目录递归删除 | `prepareRemoveTree({id,snapshotRef,expected,descendantCount})` → 一次性短期 `ticket` → `removeTree({id,ticket})`；并发子树变化由 Host 拒绝 |
| 跨窗口变动 | `observe.start/read/stop` 有界事件；缺 `gapCount/droppedCount`、丢失事件或 Worker 会话失效时重新读取完整树 |
| 500+ 条书签 | 分页最多 20,000 节点；客户端完整投影和搜索，不把首屏 200 条显示上限当成搜索范围 |
| 当前网页收藏 | 公开 `browser.page.getContext()` 返回当前文档的 Host-issued 不透明 `tabRef/documentRef`，`create({sourcePage})` 在原生写入前复核活动 Tab / Document / URL / 工具与授权；Native 尚待实测 |

业务状态保存在浏览器原生书签中；工具卸载不删除 Chrome 原始书签。界面保留单树、搜索、文件夹、紧凑编辑与确认，不创建第二套 UI。

## 构建与验收

```sh
node --test tests/environment/bookmark-manager-r2.test.mjs
npm run build:sidebar-tool -- examples/sidebar-tools/bookmark-manager
# artifacts/sidebar-tools/bookmark-manager/0.3.0/bookmark-manager.opendesk-tool.json
npm run check
npm run build
npm run build:dev
npm run verify
```

这些命令用于产生静态/Node/Build 证据；GitHub CI 不能替代用户设备上的真实 Chrome 安装、权限手势、事件、并发和生命周期验收。官方 Catalog 和旧宿主清理已在源码阶段执行；原生验收结果仍应独立标记 NOT_TESTED，未经运行不能宣称 95+。

SDK 公共前置项仍跟踪 [Issue #75](https://github.com/shopable-ai/opendesk-browser/issues/75)，本工具的审计与各候选历史在 [Bookmark Manager R2 workstream](../../../docs/framework/workstreams/bookmark-manager-r2.md)。九维 95+ 仅能根据同一最终候选的 Chrome 原生实测分别评分。
