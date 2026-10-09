# Page USER_SCRIPT：网页 UI、预览与清理

[返回总入口](README.md)。Page 在目标网页 USER_SCRIPT 世界中使用 document/DOM；没有 Controller 的 page/Locator、持久 runId/resultId。先授予网站权限，并在 Chrome 扩展详情开启「允许用户脚本」。

## 普通 main 与项目 main

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

   核对 previewId/sourceHash/documentId/world 与状态。preview-evaluated 只表示求值完成，UI 可以继续存在；返回的 result.resultText 是最多 2048 字符的结果展示，`durable:false`，不能当 Controller 持久 valueWire/resultId。
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

## 预览与固定版本

预览回执只属于此次网页文档。保存固定 Candidate、验证、Available、Installed 是另外的正式生命周期，预览成功或构建 BUILT_UNVERIFIED 不能替代这些状态，也不能宣称下次打开网页自动生效。参见[现有 Candidate 说明](../product/program-development-dual-format-and-sidebar.zh-CN.md#page-试运行后保存固定版本r12-候选入口)。

依据：[受管 UI](../../src/scripting/user-scripts/page-ui.js)、[预览](../../src/scripting/user-scripts/preview.js)、[生命周期](../../src/scripting/user-scripts/managed-ui-lifecycle.js)、[原预览归属](../../src/native-agent/managed-preview.js)。
