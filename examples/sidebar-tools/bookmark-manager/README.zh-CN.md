# Bookmark Manager R2.2 · SDK-only 独立安装预备包

> **状态：SOURCE_PREPARED / FULL_SDK_BLOCKED。不是已通过原生验收的书签管理工具。**

本目录是可独立维护、可由现有 v2 Sidebar Tool 打包器处理的工具源码：
`tool.config.json`、`src/index.html`、`src/style.css`、`src/model.js`、`src/service.js`、`src/main.js`。模型由 [R1.3 书签树](../../../src/bookmark-manager/model.js) 迁移，界面沿用单树、统一搜索、三操作、紧凑表单、200 条分批/全量搜索的既定产品行为。纯 Classic 文件依赖通过已有 v2 `files.dependencies` 打包，不创建新的 Runtime、Background 或 Chrome 扩展。

## 为什么目前仅是预备包

截至 2026-10-14 的 `main`，`OpenDeskSDK.browser.bookmarks` 只有 `create/removeOwned`，其能力 `browser.bookmarks` **仅操作自建书签**，不能读取现有 Chrome 书签树，也不能用来模拟 Full 权限。因此本候选清单故意将 `capabilities` 留空，版本 `0.2.1`、显示「SDK R2 预备」，**不会**伪装成已授权或已成功读取数据。任何使用缺失接口、能力状态不真实或没有独立 Full Capability 的情形均明确拦截，绝不返回假数据。不要将此版本加入官方 Catalog 或宣传为可正式使用的书签工具。

精确跨团队缺口登记于 [SDK R11 Issue #75](https://github.com/shopable-ai/opendesk-browser/issues/75)，包括：Full Bookmarks Capability、`getTree/get/search/create/update/move/remove/removeTree`、授权事件流、500+ 树的有界传输和 Host 端并发/删除保护。完整书签读取有额外隐私边界，**不能仅将已有 `browser.bookmarks` 改一个文案**。当前 `src/bookmark-manager/` 可信第一方功能保留，不能提前删除。

### 源码及执行世界

- `src/model.js`：沙箱内的本地树投影、受管标记、搜索及快照签名；不保存用户书签副本。
- `src/service.js`：唯一公开 `OpenDeskSDK.browser.bookmarks.*` 客户端；使用 `capabilities.list/getStatus` 明确检查 Full Capability，失败关闭；不调用 `chrome.*`、`OpenDeskTool.request` 私有 Host、页面 DOM 或网络。
- `src/main.js`：沙箱内书签 UI，空状态不能冒充读到的空书签，保留搜索、展开/折叠、可写目录选择、表单草稿、中文输入法、返回和删除确认。
- `src/index.html/style.css`：工具自身的响应式样式，独立于 `src/ui/bookmark-manager.css` 和宿主固定 DOM。
- 服务按未来 Chrome 同名方法作**待审批消费契约**；尚未证明 R11 最终方法的参数或授权语义与此完全一致。R11 发布后先同步 SDK 方法合同，再启用全量工具身份和 capability。

## 构建、试装与安全边界

```sh
node --test tests/environment/bookmark-manager-r2.test.mjs
npm run build:sidebar-tool -- examples/sidebar-tools/bookmark-manager
# artifacts/sidebar-tools/bookmark-manager/0.2.1/bookmark-manager.opendesk-tool.json
```

该 JSON 可以按既有流程**作为开发验证包**在「扩展」中审阅导入，但因没有 Full SDK，打开后应看到明确的缺口提示，不能看到或更改书签。这只用于验证独立包结构及失败关闭，不代表 R2 成功交付。用户并不需要浏览器源码来导入生成的包。普通用户不应把 0.2.1 当作正式书签管理发布版。

待 R11 完成后，首先由 SDK owner 将单独批准的 Full Capability 加入 v2 包校验和可信安装审阅，再升级本目录配置与工具版本；实现事件会话、可信首次授权、Host 端条件删除和精确文档快照，然后进行真实浏览器完整 CRUD/500+/撤权/并发/重启/卸载验收。**R2.1 已准备 `prepareRemoveTree → removeTree` 公共 SDK 消费路径**：非空目录必须绑定可信 Host 的同一快照与短期一次性票据；最终由 Host 重新检查真实子树与权限。在 R11 接通前，仍会安全拒绝删除，不能仅凭前端核对。

测试与分级账本：[Bookmark Manager R2 workstream](../../../docs/framework/workstreams/bookmark-manager-r2.md)。

## R2.1 SDK-only 消费合同（待 R11 owner 审批）

本目录只调用 `OpenDeskSDK.browser.bookmarks.*`，全部按 SDK 已有的**单对象参数**惯例调用；下表是消费端待对接合同，不代表对应 Host/Driver 已存在。

| SDK 方法 | 待批准的输入、回执和安全边界 |
| --- | --- |
| `getTree({limit:80,cursor?})` | 小树可完整返回 Chrome-shaped roots；500+ 大树采用 `{nodes,snapshotRef,nextCursor}`，每页有界、游标绑定一个可信 Host 快照 |
| `get({id})`, `search({query})` | 独立 Full 权限下按 Chrome 语义读取；UI 可在完整树上本地搜索 |
| `create({title,parentId,url?,sourcePage?})` | 文件夹或书签原生创建；`sourcePage` 带 opaque `tabRef/documentRef/url`，由 Host 在写入前核验 |
| `update({id,changes,expected})` | Host 复验节点条件快照，再执行原生更新 |
| `move({id,destination:{parentId},expected})` | Host 校验父目录、受管根、循环关系及节点条件 |
| `remove({id,expected})` | Host 复核并仅删除书签或空文件夹 |
| `prepareRemoveTree({id,snapshotRef,expected,descendantCount})` | Host 发一次性、短期 `{ticket,targetId,descendantCount,expiresAt}`，绑定安装身份和完整子树 |
| `removeTree({id,ticket})` | Host 在同一受信事务保护下校验全部子树、权限和票据；并发变化则拒绝 |
| `observe.start/read/stop(...)` | 有界事件会话，游标读取、缺口检测、Worker 重启全树同步 |

**当前版本尚未启用 Full 权限。** `tool.config.json` 维持 `capabilities: []`，因 v2 包校验器及可信权限 UI 尚无 `browser.bookmarks.full`。R11 完成 Registry、Package、Host、Chrome optional `bookmarks` 授权、installEpoch/包摘要鉴权后，工具才能更新清单、提升版本、加入官方 Catalog。安装不是授权，旧包不能自动提权。

**当前页收藏安全门禁。** 现有 `browser.page.getContext()` 只有 `status/title/url`，不提供可靠的 Tab/Document 身份。R2.1 不再将两次相等的 URL 视为同一网页，必须等待 R11 提供 Host 可核验的 opaque `tabRef/documentRef` 并于写入前复验。

UI 已预备使用 SDK 的有界事件会话：外部事件触发树同步、缺口全量重读、会话在关闭时释放。由于 Full SDK 仍缺失，这些是仅由独立工具源码及 Node Mock 证明的 SOURCE_PREPARED，非真实 Chrome / 95+ 验收。若 R11 审核最终采用不同签名，本目录和测试必须一并调整，不可维护私有 Host。

### 本轮验收入口

`node --test tests/environment/bookmark-manager-r2.test.mjs`、`npm run check`、`npm run build:sidebar-tool -- examples/sidebar-tools/bookmark-manager`、`npm run build`、`npm run build:dev`、`npm run verify`。

专属 CI：`.github/workflows/bookmark-manager-r2.yml`。真实 Chrome 必须使用 Mac 独立 Profile，并对候选 SHA、工具包摘要及权限/Worker 生命周期建立证据链。

## R2.2 · 书签树完整性保护

校验 Chrome-shaped 完整树的唯一根、文件夹 children 数组、父目录关系和 URL 节点类型；分页模型拒绝多个根节点。异常 SDK 回执不能静默省略子项或将孤立书签当作根节点。专属 Node 测试覆盖失败关闭；此版本仍未获得 Mac Chrome Native 验收，不能开放 Full 权限或删除旧可信模块。
