# 应用内网页模块（开发试点）

适用于一个 Sidebar 应用同时提供网站内 UI 的场景。网页业务放在应用项目内，由同一个工具 JSON 更新；它在 `USER_SCRIPT` world 执行，不获得可信 Side Panel、Content Script 或 Background 的权限。阅读目录是首个消费者。

## 包与构建

在原 v2 `tool.config.json` 中声明 `page.module` 与 `pageModule: {"revision": 1}`。同目录 `package.json` 使用现有 `opendesk.project.v1` 的 `page-userscript` 项目，ID 为 `app.<工具 ID>`，版本与工具一致，入口指向项目内 ESM。网页规则仍只支持已审阅的 `matches` / `excludeMatches`、顶层、`document_idle`、`USER_SCRIPT`。

原 `scripts/build-sidebar-tool.mjs` 调用原项目编译器及 Page 安装包构建器，将完整 `opendesk.page-install.v1` 嵌入工具包 `pageModule` 字段。无需另发第二个 Page JSON。源码、规则、版本与摘要都受原候选、晋升和同源检查约束。

安装审阅同时展示网页自动运行范围。确认安装复用原 Chrome 权限手势和 Installed Page Authority；不新增通用启用步骤。网页模块与父应用的包摘要、安装代际绑定。关闭侧栏不停止网页模块；应用停用、卸载、替换以及网站权限撤销会停止相应实例并请求受管清理。结果未知时先核查，不自动重放安装或业务操作。

## 应用网页 API

仅成功安装并通过父应用身份验证的 USER_SCRIPT 实例获得 `globalThis.OpenDeskAppPage`：

```js
const bridge = globalThis.OpenDeskAppPage;
const context = await bridge.readContext(); // 当前语言、应用目录与私有数据
const stopRequests = bridge.onRequest(async ({operation, payload}) => {
  // 应用自行校验领域操作与参数；框架已经固定父应用和目标文档。
  if (operation === 'toc.snapshot') return readOwnOutline(payload);
  throw new Error('Unsupported operation');
});
const {value, etag} = await bridge.storage.get({key: 'preferences', withEtag: true});
await bridge.storage.set({key: 'preferences', value: {...value, hiddenSites: []}, ifMatch: etag});
```

私有存储需要同时声明 `storage.local`，与 Sidebar 的 `storage.get/set` 使用同一命名空间、锁和 CAS 令牌。限额仍为单项 8 KiB、总计 32 KiB、32 个键；冲突时重读并重新应用本次字段变更，不覆盖其他窗口的新值。API 不允许读取宿主或其他应用的存储。

网页入口继续使用公开 `@opendesk/ui` 的 `createPageUI`，在 `onDispose` 中清理自身监听器、观察器、计时器和自建 DOM。桥授权失败后停止工作；不循环重放失败的导航或写入。

## Sidebar 请求

```js
await OpenDeskTool.request('page.request', {
  operation: 'toc.snapshot',
  payload: {refresh: true}
});
```

需要已安装的 `page.module`。宿主从真实当前网页捕获文档身份，再验证父包、安装代际、原生注册与该文档的唯一执行实例；动态应用不能自选其他应用、标签页、world 或注入任意代码。应用仍负责快照修订、领域参数及业务取消语义。

本合同不授权任意网络、Native、Controller 或后台业务。不提供第二套 Host、Registry、安装器或动态可信代码入口。真实 Browser 固定基线下的应用独立更新证据见[阅读目录试点记录](../../projects/reading-toc/DYNAMIC-PILOT.zh-CN.md)。
