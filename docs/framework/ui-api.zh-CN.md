# OpenDesk Page UI API（R1，手动预览）

> 源码：[`page-ui.js`](../../src/scripting/user-scripts/page-ui.js)。对应多文件 Demo：[page-ui-basic](../../examples/programs/page-ui-basic/README.md)。**状态：源码实现，真实 Chrome 原生验收 NOT_TESTED**。不是 Page 正式安装 API，也不是 Controller Worker 的 DOM 接口。

## 1. 适用范围

项目声明 `opendesk.runtimeKind: "page-userscript"`，并在获准网页使用现有 Sidebar「开发 → 网页用户脚本 · 依赖与试运行」以 **USER_SCRIPT / async main** 执行。代码中可静态写入：

```js
import {createPageUI} from '@opendesk/ui';
export default async function main() {
  const ui=createPageUI({id:'demo.widget'});
  const button=document.createElement('button');
  button.className='od-button';button.textContent='查看标题';
  ui.content.append(button);
  ui.on(button,'click',()=>{button.textContent=document.title;});
  // main 完成后，受管 UI 仍在。关闭或 pagehide 才清理。
  return {ui:'open'};
}
```

`@opendesk/ui` 是**固定内置构建别名**，指向随本仓库版本提供的原生 DOM 辅助模块；不是 npm 包、URL，也不是扩展特权桥。不能在 Controller 项目里导入。无需安装 React/Vue/Tailwind。没有导入 UI 模块的普通多文件项目保持原构建逻辑，不自动创建 UI。

## 2. API 与生命周期

`createPageUI({id,baseStyles=true,css='',assets={}})` 同步创建一个 `<div>` 宿主、独立 `ShadowRoot`、`content` 内容节点和 `overlay` 弹层节点，并追加到当前网页的 `document.body`。必要参数 `id` 为 1～80 位字母、数字、点、连字符或下划线开头的限定字符串；不同 ID 可以同时存在。重复挂载**同文档同 ID** 时，通过宿主事件通知旧执行世界销毁旧实例，再替换节点；即使浏览器为两次手动预览分配了不同 USER_SCRIPT 世界，仍可以回收平台登记的旧实例资源。

| 接口 | 作用、返回值 | 错误/边界 |
| --- | --- | --- |
| `ui.host`、`ui.shadowRoot` | 当前实例的 DOM 宿主与 ShadowRoot | 仅当前页面 JS 可用；不跨 Worker 传递 |
| `ui.content`、`ui.overlay` | 内容与实例内弹层挂载元素，均在 ShadowRoot 中 | 弹层不要 portal 到网站 `document.body` |
| `ui.addStyle(cssText)` | 向当前 ShadowRoot 添加 `<style>`，返回样式节点 | `E_UI_STYLE`；单项上限 48 KiB |
| `ui.getAsset(path)` | 获取声明资产：CSS 为字符串、JSON 为解析后的值、图片为 data URL | `E_UI_RESOURCE`；未声明的路径会拒绝 |
| `ui.on(target,event,handler,options?)` | 注册有实例归属的监听器，返回主动解绑函数 | `E_UI_LISTENER`；销毁或文档失效后不再调用回调 |
| `ui.onDispose(fn)` | 注册一次性清理回调，返回取消登记函数 | `E_UI_CLEANUP`；回调只在销毁时触发 |
| `ui.setTimeout(fn,ms)`、`ui.setInterval(fn,ms)` | 注册受管定时器，返回原生计时器句柄 | `E_UI_TIMER`；销毁时取消未结束计时器 |
| `ui.observe(target,fn,options?)` | 创建并登记 `MutationObserver`，返回 observer | `E_UI_OBSERVER`；销毁时 disconnect |
| `ui.objectURL(blob)` | 创建 Blob URL，返回字符串；销毁时 revoke | `E_UI_RESOURCE`；小图片默认内联，无须使用 |
| `ui.active()` | 当前实例是否活跃且目标文档/宿主仍有效 | 布尔值 |
| `ui.close()` / `ui.destroy()` | 幂等销毁，移除宿主、样式、受管事件、计时器、观察器、URL 并执行清理回调 | 不会再次执行项目的 `main()` |

`createPageUI` 只接受原生 DOM 环境；无 document、目标失效或 ID 不合法分别抛出 `E_UI_DOCUMENT`、`E_UI_ID`。可使用 `baseStyles:false` 完全关闭 OpenDesk 基础 CSS，改由项目 `css` 或 `addStyle` 控制样式；不导入 SDK 的程序不会加载基础 CSS。

**运行结束 ≠ 关闭界面 ≠ 用户停止任务。** `main()` 可以返回一个有限序列化结果，但 GUI 事件仍留在文档中。面板“关闭”会释放该面板的受管资源；若要不重跑主逻辑而重新打开，应使用仍活跃的独立 launcher 或原有应用控制器调用 `createPageUI`，如 Demo。完全销毁所有界面后，只有用户再次手动执行源码才能重新创建。此 R1 API 尚未接入正式已安装 Page 的停止/撤权信号；**不能宣称任务停止自动撤销用户任意 DOM 修改**。页面 `pagehide` 释放受管资源，BFCache 返回后不会偷偷自启动。

## 3. 资源声明、限制与身份

已有 `opendesk.project.v1` 的 `assets` 字段继续声明 CSS/JSON/图片（非新版本格式），暂仅在 `page-userscript` 构建时编译。示例：

```json
"assets": [
  {"path":"assets/panel.css","kind":"css"},
  {"path":"assets/mark.png","kind":"image"},
  {"path":"assets/config.json","kind":"json"}
]
```

在有资源声明的 Page 项目，构建器给默认导出的 `main({assets})` 注入固定的本地资源记录。推荐 UI 使用 `const ui=createPageUI({id:'my.widget',assets}); ui.addStyle(ui.getAsset('assets/panel.css')); image.src=ui.getAsset('assets/mark.png');`。无资产项目仍调用原有无参 `main()`。不要把这些记录当网络 URL 的通用加载器。

CSS `url("./mark.png")` 相对 CSS 所在目录解析，必须指向 `assets` 已声明的本地图片，构建时改写为固定 `data:image/*;base64,...`。禁止未声明 URL、远程 URL、CSS `@import`、目录逃逸、外部 symlink、错误扩展名、图片伪造文件头和非法 JSON。当前不支持 SVG、字体包、运行期动态资源文件或独立 HTML 入口。

**预算：** CSS 单项 24 KiB、JSON 单项 16 KiB、图片单项 32 KiB、资源总量 60 KiB；仍受 Page 最终 `program.js` **100000 UTF-8 字节**、源码快照 256000 字节、草稿包 512000 字节、最多 32 个资产等原有额度约束。图片在 CSS 和 UI 属性中重复引用会增加打包字节，并不自动放宽预算。源码和资源变化都会改变冻结产物哈希；`artifact.json` 记录各资产 SHA-256 与大小。所有字节内嵌，导入后不依赖开发服务器、在线 CDN 或额外的 `web_accessible_resources`。

使用方式：在仓库根目录运行 `node scripts/validate-program-project.mjs examples/programs/page-ui-basic` 与 `npm run build:program -- examples/programs/page-ui-basic`；把输出的 `program.opendesk-draft.json` 按 [Demo 指南](../../examples/programs/page-ui-basic/README.md) 导入，不要把目录或 `package.json` 直接导入 Sidebar。

## 4. CSS 隔离与权限边界

基础 CSS 只进入实例 ShadowRoot，变量在实例 `:host` 上使用 `--od-*` 专名，不写网站 `:root`；使用像素/em 而非依赖网站根 `rem` 的组件大小。两个不同实例的普通 `.od-button` 类不会相互选择。页面仍可影响宿主元素、继承值、遮挡、屏幕缩放和 CSS CSP；ShadowRoot **不是 JS 沙箱**，USER_SCRIPT 执行世界不是 CSS 隔离。严格 CSP 页面和 data URL 图片需要真实 Chrome 单项验收，不能由 Node 构建测试推断。

代码本身只有 USER_SCRIPT 的原生 DOM 权限，没有 `page`、`chrome.runtime`、Native、GM 或任意特权 Broker 通道。插件仍由现有 Authority/受控预览验证目标和权限。SDK 的回调在宿主或文档失效后会保守返回，不授予新的网络/自动化能力。普通用户脚本自行在网站注册的监听器、定时器、网站 DOM 改动，不属于可自动清理的受管资源。

## 5. 当前状态及后续复用

源码和定向组件检查与真实浏览器验收分开记录。React/Vue 后续可以把组件根放在 `ui.content`，把 portal/弹窗放在 `ui.overlay`，使用 `ui.onDispose(()=>root.unmount())` 或 Vue `app.unmount()`。Tailwind 后续在本地预编译 CSS，仍通过 `ui.addStyle` 载入。**本 R1 不宣称 JSX/TSX、Vue 单文件组件、Tailwind 预设、正式 Page 安装或 Sidebar sandbox 自定义应用已实现。**
