# Page USER_SCRIPT：网页 UI、预览与清理

[返回总入口](README.md)。Page 在目标网页 USER_SCRIPT 世界中使用 document/DOM；没有 Controller 的 page/Locator、持久 runId/resultId。先授予网站权限，并在 Chrome 扩展详情开启「允许用户脚本」。

## 第三方独立 Page Program：开发、自动注入与 SDK 缺口

作者默认只需本页、[Page UI 和 React/Vue 开发](page-ui-frameworks.zh-CN.md)、[项目格式](local-projects.zh-CN.md)、[Page Candidate 持久化](page-import-persistence.zh-CN.md)、[开发操作](mcp-local-development.zh-CN.md)、公开 Schema 与工具自己的 README；**无须阅读或修改内部 Broker、Host、Installer、`src/scripting/user-scripts/`**。

1. **建项目**：网页回复栏按钮/DOM 增强优先使用独立 `examples/programs/<id>/` 的 USER_SCRIPT，调用网页 `document`、受管 `@opendesk/ui` 和本地已审阅资源；不将业务代码移入 Browser 框架。Controller Worker 的 `page`/Locator、Sidebar Tool iframe 的 `OpenDeskTool.request` 与 Page 世界彼此不同。
2. **网站与权限**：在项目中声明正确网站范围，并另行取得 Chrome 的网站访问及“允许用户脚本”权限。`createPageUI({pageRules})` 是同文档 SPA 清理保护，不是网站授权，也不等于跨站自动注入。变更 Origin/权限应重新审核。
3. **试运行和正式安装不是一回事**：「开发」显式 Run/Preview 得到 `previewId/sourceHash/documentId`，核对真正的网页 DOM 与 Stop；正式自动运行必须沿 Page Candidate → Verified → Available → 用户确认 Installed/启用的既有流程，另验新文档匹配、扩展重启、停用、撤权、升级与卸载。临时 Chrome 直接脚本注入、Node/离线 HTML 预览不能冒充 Installed PASS。
4. **大型第三方 JS 与真实边界**：按公开项目构建预算、锁定资源许可、世界及生命周期设计评估，不保证几 MB 的 XMind 类 Runtime 能被普通 USER_SCRIPT 直接嵌入。现有 [ChatGPT Mind Map 项目事实](../../examples/programs/chatgpt-mindmap/README.zh-CN.md) 记录 `E_XMIND_RUNTIME_UNAVAILABLE`、资源大小/许可和隔离问题；这是项目证据，不代表全部第三方库均不支持。没有已验证的公共缺口先记 `SDK_GAP_NOT_PROVEN`，无法安全执行的特权请求记 `BLOCKED`，不要要求普通作者改 Host。
5. **证据**：公开规范支持 ≠ 本候选运行成功；SOURCE_WIRED/Node PASS/Browser Native/正式安装与网站自动运行须独立验证。没有最终安装证据记 `NOT_TESTED`，不能虚构 API 或已批准的权限。

## 普通 main 与项目 main

Page 与 Controller 都可以写零参数 main，但**只有 Page USER_SCRIPT 可直接访问 `document`，没有 Controller `page` / `params` / `axiosx`**。默认 `_`、`dayjs`、`OpenDeskLibs` 来自扩展本地固定资源；可选库通过批准声明按需加载，不会自动进入网站 MAIN。见[零参数预置运行变量与多环境区别](runtime-globals-and-preinstalled-libraries.zh-CN.md)以及 [Page 零参数 ESM Demo](../../examples/programs/page-globals-zero-arg/README.md)。


手工草稿或单文件：

```js
async function main() {
  return document.querySelector('h1')?.textContent || '';
}
```

它由 main() 无参调用。Sidebar 选择「在当前网页试运行」，或把单文件 attach 为 page-userscript 后调用 run。预期返回 previewId 和结果文字，不产生 Controller 结果；这类非受管脚本不支持受管 Stop。

多文件项目 default export 被构建器调用；**声明并嵌入资产时**传 `{assets}`，没有资产时无参调用。不要解构不存在的 Controller page/params。完整 package 见[项目格式](local-projects.zh-CN.md#参数page-规则和资产)。

## 运行现有受管按钮 / CSS / PNG

复用 [local-page-ui](../../examples/programs/local-page-ui/README.md)。入口：

```js
import {createPageUI} from '@opendesk/ui';
import {label,step} from './model.js';
import {render} from './view.js';
export default async function main({assets}) {
  const ui=createPageUI({id:'sample.local-page-ui',assets});
  ui.addStyle(ui.getAsset('assets/ui.css'));
  render(ui,{label,step});
  return {label,step};
}
```

1. MCP --allow-project 包含此目录；允许目录启动自动绑定，目录显式 attach 也只传 path。
2. 打开 `http://127.0.0.1:43111/demo-form.html` 与同窗口 Sidebar，核对网站和用户脚本权限。
3. 从 status 获取真实 bindingId，MCP 调用：

   ```json
   {"name":"opendesk.dev.run","arguments":{"bindingId":"local-page-ui 的 bindingId","requestId":"tutorial-page-1"}}
   ```

   不传 Controller params 或自定义 deadline。预期网页出现 Shadow DOM 卡片、Local v1 按钮、计数器 0 和 PNG；点击按钮变为 1，再点变为 2，不改变网站表单。
4. 查询原预览：

   ```json
   {"name":"opendesk.dev.result","arguments":{"previewId":"刚返回的 previewId"}}
   ```

   核对顶层 previewId/sourceHash/target，以及回执 `result.documentId` / `result.world` 与状态。preview-pending 时 result 尚未产生，间隔只读再查原 previewId，不重发 run。preview-evaluated 只表示求值完成，UI 可以继续存在；result.resultText 是最多 2048 字符的结果展示，`durable:false`，不能当 Controller 持久 valueWire/resultId。
5. 修改 [model.js](../../examples/programs/local-page-ui/src/model.js) 的 label/step 和 [ui.css](../../examples/programs/local-page-ui/assets/ui.css)，保存后用新 requestId 明确再运行。新 UI 应显示新文字/颜色，旧受管实例清理确认后才挂载。不需要 build、上传 JSON 或重新安装扩展。

## 受管 UI API

| API | 实际用法 |
| --- | --- |
| `createPageUI({id,assets})` | 返回受管实例，content 位于 open Shadow DOM，避免样式扩散到全站 |
| `ui.content.append(node)` | 添加自己创建的 DOM |
| `ui.getAsset(path)` | CSS 返回文本，JSON 返回解析对象，图片返回 data:image URL；只接受声明资产 |
| `ui.addStyle(cssText)` | 将 CSS 文本添加到实例 ShadowRoot，不传文件路径 |
| `ui.on(target,type,callback,options)` | 登记监听器；异步 callback 返回 Promise |
| `ui.setTimeout(callback,ms)` / `ui.setInterval(callback,ms)` | 登记定时器；异步回调返回 Promise |
| `ui.observe(target,callback,options)` | 登记 MutationObserver |
| `ui.objectURL(blob)` | 登记会被回收的 Object URL |
| `ui.onDispose(callback)` | 登记自有资源清理，异步清理返回 Promise |
| `ui.destroy()` | 同步、幂等地开始销毁；其返回值不是异步清理完成证明 |

例如自行持有资源时，登记 `ui.onDispose(async () => { await resource.close(); });`；resource 由程序自己创建，不是框架全局。完整 UI 合同见[UI API](../framework/ui-api.zh-CN.md)。未经登记的异步工作/页面资源不在可证明清理范围。

## Stop、替换与失败

```json
{"name":"opendesk.dev.stop","arguments":{"previewId":"原 previewId","requestId":"tutorial-page-stop-1"}}
```

受管成功回执核对原 previewId/sourceHash、state:preview-retired、receipt.ok:true、receipt.scope:managed-ui-only；它只清理 createPageUI 登记资源。非受管返回 E_PAGE_PREVIEW_STOP_UNSUPPORTED，不能强制取消任意 USER_SCRIPT 或回滚业务。

同 binding、同文档再次预览先验证新代码和世界，再等待原世界的受管回调/清理完成；异步事件与 onDispose 必须返回 Promise。`await ui.destroy()` 不能证明异步清理完成。清理抛错阻止新 UI；5 秒超时、缺回执或状态未知保留栅栏，不能盲目重试，未知清理栅栏需要关闭原标签页。已确认清理失败可重新加载获得新文档后再运行。每文档最多六个预览世界，清理不返还预算。

移除 @opendesk/ui 前先 Stop 原实例，否则 E_UI_MODE_CONFLICT。MCP provider 断开禁用新的源码 Run；原 Sidebar Host 已拥有的受管 UI 可通过「停止受管 UI」清理。新 Host 不静默接管旧文档实例。[恢复规则](dependencies-and-errors.zh-CN.md#断连和未知结果)。

## 已安装版本的受管清理（R396）

已安装 Page 程序也接入现有受管 UI 生命周期。停用、撤销网站授权、卸载及固定版本升级时，现有安装链尝试在原顶层文档和原 USER_SCRIPT 世界中清理旧授权的 `createPageUI` 实例，并等待已登记的异步 `ui.onDispose` 返回。清理绑定原 Program Revision、sourceHash、manifestHash、installationId、grantGeneration、executionKey、文档及固定编译字节 SHA；不会重新执行程序源码。程序自行创建的 iframe、连接等资源应通过 `ui.onDispose` 登记关闭。

安装状态和卸载结果可包含 `managedCleanup: {scope:'managed-ui-only', state:'retired'|'unknown', records:number}`；`records` 是核对的执行记录数量，不能当作 UI 实例数。`retired` 仅证明这部分受管资源已退休或原文档已确认消失。未登记的 DOM 修改、异步工作及其他业务效果仍可能需要刷新，卸载结果继续保留 `livePagesNeedRefresh:true`，现有 UI 刷新提示仍适用。

清理失败、超时、回执缺失、身份不匹配、BFCache 文档或观察失败均保守保留未知/失败栅栏，不自动重试控制、不重放源码；同一文档中的后续安装版本也不能绕过未解决的清理。真实文档退出后才可解除对应文档限制。扩展重载导致账本丢失也不能据此宣布清理成功。

固定子帧资源通过项目 `pageFrames: [{resourceId,path}]` 声明本地已编译 JS，由原打包器冻结字节与 SHA。公开 `ui.createFrame({resourceId,data})` 只解析当前已安装固定源码声明的资源，复用原 Broker/Authority 核对安装身份、授权代数和精确父/子文档，并随受管 UI 清理；普通 iframe DOM 不获得这些能力。资源最多四项、单项 5 MiB、合计 6 MiB，不支持运行时导入。该合同不批准远程代码或厂商再分发。没有获授权资源入口的开发预览报 `E_FRAME_UNAVAILABLE`；不得把它当作绘图成功。

R396 定向 Node 测试覆盖异步 dispose、停用/撤权/卸载及未知态；同候选 build 和真实 Chrome 安装证据由各自验收记录提供，不能从 Node PASS 推导。ChatGPT Mind Map 的真实回复按钮已在开发预览中原生点击，但没有厂商生产资源，转换仍阻塞；前序停用失败的源码修复尚未原生复验。

## 预览与固定版本

预览回执只属于此次网页文档。保存固定 Candidate、验证、Available、Installed 是另外的正式生命周期，预览成功或构建 BUILT_UNVERIFIED 不能替代这些状态，也不能宣称下次打开网页自动生效。参见[现有 Candidate 说明](../product/program-development-dual-format-and-sidebar.zh-CN.md#page-试运行后保存固定版本r12-候选入口)。

仅平台维护者在发生文档与实际行为不符时，才需调查 [受管 UI](../../src/scripting/user-scripts/page-ui.js)、[预览](../../src/scripting/user-scripts/preview.js) 或 [生命周期](../../src/scripting/user-scripts/managed-ui-lifecycle.js) 的内部实现；**这不是第三方开发的前置依赖**。

## R24.1 · 网站范围、原生 DOM、React/Vue

参阅 [完整教程](page-ui-frameworks.zh-CN.md)。`createPageUI({pageRules})` 是可选的同文档 SPA 路由清理保护，不是 Chrome 网站权限或安装授权。固定 Page 版本的已安装自动触发仍通过既有独立安装链；手动试运行不会自动安装。执行资产必须经过对应编译，但作者不必一律手工预编译：Developer 的单文件 JSX/SFC 可由浏览器内现有编译入口准备；Standard 使用 Direct JS 或经本地项目准备的代码。步骤见 [脚本编写 Skill](../../.agents/skills/opendesk-script-authoring/SKILL.md) 与下节；源码模板未通过真实 Chrome 验收不得宣布交付完成。

## R24.2：React/Vue 免手工编译入口

可选新项目字段 `opendesk.framework: "react"|"vue"`。示例：[React 19 纯 JavaScript](../../examples/programs/page-ui-react-direct/README.md)、[Vue 3 纯 JavaScript](../../examples/programs/page-ui-vue-direct/README.md)。只修改 `.js` 文件，保存后显式点击 Run，OpenDesk 自动准备代码并预装框架。无需用户 npm、Vite 或 `.jsx`/`.vue` 编译；组件挂在 `ui.content`，停止时卸载和恢复 DOM。详见 [Page UI 框架开发规范](page-ui-frameworks.zh-CN.md)。
