# Bookmark Manager R2.5 · SDK R11.2 独立正式工具

> **状态：SOURCE_MIGRATED / OFFICIAL_OPTIONAL_REGISTERED / NATIVE_NOT_TESTED。** 已纳入官方源码目录，不代表用户设备已安装，也不代表 Chrome 原生验收通过。

本项目 `examples/sidebar-tools/bookmark-manager/` 是唯一独立书签工具业务源码：`tool.config.json`、`src/index.html`、`src/style.css`、`src/model.js`、`src/service.js`、`src/main.js`。继续使用官方 Sidebar Tool v2 打包器、Opaque Origin iframe 和 `OpenDeskSDK.browser.bookmarks.*`；没有私有 Host、第二套 SDK 或直接 `chrome.*` 调用。

## 当前 R11.2 合同与安装状态

2026-10-15 的 R11.2 提交 `b63c9e3c` 为正式 Registry、Schema、Host、独立 `browser.bookmarks.full` 和安装工具的可信书签授权按钮完成了**源码接线**。独立 Full 与 Owned 的 `browser.bookmarks.createOwned/removeOwned` 是不同权限；Chrome manifest 已声明 optional `bookmarks`，安装工具的声明并不等于用户已批准 Full 或 Chrome 权限。

- 工具版本 **0.3.5**：`capabilities: ["browser.bookmarks.full", "currentPage.read"]`。安装包更新需按现有流程重新审阅；Full Bookmarks 授权和 Chrome optional 权限仍独立申请。
- **已在 `official-tools/catalog.json` 正式登记为 optional**。发行构建器必须生成签名固定的本地官方资源，用户通过「扩展」中心审阅、安装、授权、打开。源码登记不等于在用户 Chrome 中安装；Node/CI 成功也不是 Native PASS。
- 不满足 Full Capability 状态、Host 权限、包身份或可信回执时，客户端失败关闭并隐藏已失权树；新增识别 `E_BOOKMARK_FULL_CONSENT_REQUIRED` / `E_TOOL_CHANGED` / `E_OWNER` 并在写入失败时清屏，不会回退至 Owned 能力伪造全量结果。
- **已删除旧 `src/bookmark-manager/` 及内置书签面板与专属 R1 CI**。业务消费者仅存在于独立工具，公共 SDK / Host / Chrome Drivers 仍保留；Git 历史保存旧实现，不创建兼容副本。

## 消费端功能

| 需求 | 正式 SDK 方法 / 消费端边界 |
| --- | --- |
| 全量树、搜索与读取 | `getTree({limit:100,cursor?})` 按单一 `snapshotRef` 分页；Host 同时限制每页 100 节点/10.5 KB，可能返回更少节点；`get({id})`、`search({query})` 属于独立 Full 能力 |
| 新建/更新/移动/删除 | `create`、`update`、`move`、`remove`；读取预期节点快照并由 Host 复验 |
| 非空目录递归删除 | `prepareRemoveTree({id,snapshotRef,expected,descendantCount})` → 一次性短期 `ticket` → `removeTree({id,ticket})`；并发子树变化由 Host 拒绝 |
| 跨窗口变动 | `observe.start/read/stop` 有界事件；缺 `gapCount/droppedCount`、丢失事件或 Worker 会话失效时重新读取完整树 |
| 500+ 条书签 | 分页最多 20,000 节点；客户端完整投影和搜索，不把首屏 200 条显示上限当成搜索范围 |
| 当前网页收藏 | 公开 `browser.page.getContext()` 返回当前文档的 Host-issued 不透明 `tabRef/documentRef`，`create({sourcePage})` 在原生写入前复核活动 Tab / Document / URL / 工具与授权；Native 尚待实测 |

业务状态保存在浏览器原生书签中；工具卸载不删除 Chrome 原始书签。界面保留单树、搜索、文件夹、紧凑编辑与确认，不创建第二套 UI。

0.3.1 修复刷新与写入生命周期：先订阅再读取分页快照，读取期间的变更触发后续全量同步；
编辑或移动期间刷新保留原始已审阅节点，外部修改不会被新的快照静默批准覆盖。
Host 快照池仍最多 8 份，达到上限时仅回收同一安装身份的最旧快照；旧游标明确返回
`E_SNAPSHOT_EXPIRED`，重新刷新即可，不跨工具回收。写入前再次检查撤权代际、已观察到的
书签变更及删除票据期限。Chrome 没有原子的 compare-and-swap；未被监听器观察到的最终
读写间竞态仍存在，不能宣称绝对并发原子安全，真实时长尚未测量。

0.3.2 补齐观察恢复：启动或读取事件发生可重试的传输故障、会话过期或事件缺口后，
每隔 7 秒最多自动重试 3 次，只重新观察和读取快照，不重放写入。成功读取事件或用户
手动刷新后重置预算；权限或真实点击被拒绝时不自动重试。刷新及 pagehide 使旧 epoch 的
回调失效，关闭后不再展示晚到快照；授权门禁清除列表、菜单及表单中的私有内容。
后续真实 CFT 已安装 0.3.2，导入专用 2151 URL 时暴露首次全树读取的 `E_TOOL`
请求频率错误；保留该候选和失败原始证据，不将旧版本结果登记为 0.3.3 通过。

0.3.3 收敛上述 RPC 预算：加载仅首尾核验完整能力，中间页和每次事件读取直接走公开
SDK，由 Host 逐次鉴权。会话临近到期时先新建、排空旧会话（最多两页共 100 事件）、
停止旧会话，再立即读取新会话；无事件不重读全树，有事件、过期或 gap 仍同步完整快照。
交接中的撤权、关闭、草稿及未知写入保护保留。2159 节点/一分钟 RPC 预算与轮换回归是
Node VM 证据。后续真实 Native 已通过市场正式升级 0.3.3，授权复核后成功显示 2159 节点；
新建文件夹保存被隐藏 URL 输入的原生校验拦截，其他 CRUD 尚待该阻塞解除后验证。

0.3.4 仅修复该表单阻塞：新建/编辑文件夹、移动及详情中的 URL 输入不参与校验，
只有可见的网址编辑保留 `type=url` 原生校验及 SDK 的 URL 检查。写入结束解除 busy
不重新启用隐藏 URL。Node VM 覆盖上述模式与失败后恢复；0.3.4 真机 CRUD 仍为 NOT_TESTED。

0.3.5 R2.5 保存确认补充：SDK 写入调用解析成功**不会**立即显示“保存成功”。客户端重新通过 Full SDK 获取原生书签树，按原生节点 ID 与名称/URL/位置/删除结果核实；没有核实则继续保留草稿、显示未确认状态并阻止重复危险提交。未知写入结果也必须退出本次编辑、重新查看原生书签后才能决定下一次操作。该只读复核不是原子 CAS，也不是 Native 真实设备通过证据。

0.3.5 R2.5 源码候选：在既有独立工具页面新增树与选中详情的主从信息视图，`od-*` 正式设计语义样式来自构建期 canonical Token 和组件 CSS；表单不再让隐藏字段触发原生校验，校验失败显示可见错误；异步刷新时继续捕获输入草稿。危险删除确认绑定最初审阅的节点及子树签名，外部变化拒绝继续。0.3.5 仍需独立真实 Chrome 安装、写入/刷新及多设备验证，不能将源码修改标为 Native PASS。新增 `scripts/preview/bookmark-manager-mock.js`，生产包同源的 `scripts/preview/build-preview.mjs --tool bookmark-manager` 以纯内存数据展示，不拥有真实书签能力。该预览只验证设计/组件与离线事件，不代表实际安装权限。

现有公共合同限制：节点最多 20,000、深度 100、快照 8 MB、读取标题最多 256 字符、
既有 URL 最多 4,096 字符。既有非 HTTP(S) 书签可保留读取，新增 URL 仍只允许 HTTP(S)。
超出合同明确报错，不截断数据；任意长度历史书签兼容仍是后续合同扩展缺口。

## 构建与验收

```sh
node --test tests/environment/bookmark-manager-r2.test.mjs
node --test tests/environment/bookmark-manager-r24-lifecycle.test.mjs tests/environment/browser-sdk-r112-full-bookmarks.test.mjs
npm run build:sidebar-tool -- examples/sidebar-tools/bookmark-manager
# 依据 tool.config.json 当前版本查询 artifacts/sidebar-tools/bookmark-manager/ 产物
npm run check
npm run build
npm run build:dev
npm run verify
```

这些命令用于产生静态/Node/Build 证据；GitHub CI 不能替代用户设备上的真实 Chrome 安装、权限手势、事件、并发和生命周期验收。官方 Catalog 和旧宿主清理已在源码阶段执行；原生验收结果仍应独立标记 NOT_TESTED，未经运行不能宣称 95+。

SDK 公共前置项仍跟踪 [Issue #75](https://github.com/shopable-ai/opendesk-browser/issues/75)，本工具的审计与各候选历史在 [Bookmark Manager R2 workstream](../../../docs/framework/workstreams/bookmark-manager-r2.md)。九维 95+ 仅能根据同一最终候选的 Chrome 原生实测分别评分。
