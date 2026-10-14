# Bookmark Manager R2 · SDK-only 独立安装预备包

> **状态：SOURCE_PREPARED / FULL_SDK_BLOCKED。不是已通过原生验收的书签管理工具。**

本目录是可独立维护、可由现有 v2 Sidebar Tool 打包器处理的工具源码：
`tool.config.json`、`src/index.html`、`src/style.css`、`src/model.js`、`src/service.js`、`src/main.js`。模型由 [R1.3 书签树](../../../src/bookmark-manager/model.js) 迁移，界面沿用单树、统一搜索、三操作、紧凑表单、200 条分批/全量搜索的既定产品行为。纯 Classic 文件依赖通过已有 v2 `files.dependencies` 打包，不创建新的 Runtime、Background 或 Chrome 扩展。

## 为什么目前仅是预备包

截至 2026-10-14 的 `main`，`OpenDeskSDK.browser.bookmarks` 只有 `create/removeOwned`，其能力 `browser.bookmarks` **仅操作自建书签**，不能读取现有 Chrome 书签树，也不能用来模拟 Full 权限。因此本候选清单故意将 `capabilities` 留空，版本 `0.1.0`、显示「SDK R2 预备」，**不会**伪装成已授权或已成功读取数据。任何使用缺失接口、能力状态不真实或没有独立 Full Capability 的情形均明确拦截，绝不返回假数据。不要将此版本加入官方 Catalog 或宣传为可正式使用的书签工具。

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
# artifacts/sidebar-tools/bookmark-manager/0.1.0/bookmark-manager.opendesk-tool.json
```

该 JSON 可以按既有流程**作为开发验证包**在「扩展」中审阅导入，但因没有 Full SDK，打开后应看到明确的缺口提示，不能看到或更改书签。这只用于验证独立包结构及失败关闭，不代表 R2 成功交付。用户并不需要浏览器源码来导入生成的包。普通用户不应把 0.1.0 当作正式书签管理发布版。

待 R11 完成后，首先由 SDK owner 将单独批准的 Full Capability 加入 v2 包校验和可信安装审阅，再升级本目录配置与工具版本；实现事件会话、可信首次授权、Host 端条件删除和精确文档快照，然后进行真实浏览器完整 CRUD/500+/撤权/并发/重启/卸载验收。**当前代码主动拒绝文件夹 `removeTree`**：仅在前端读树后删目录存在跨窗口 TOCTOU，不能绕过可信条件票据。前端预检查不代替 Host 原子检查。

测试与分级账本：[Bookmark Manager R2 workstream](../../../docs/framework/workstreams/bookmark-manager-r2.md)。
