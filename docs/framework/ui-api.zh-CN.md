# OpenDesk Page UI API（R1.2，显式预览）

> 源码：[`page-ui.js`](../../src/scripting/user-scripts/page-ui.js)。对应多文件 Demo：[page-ui-basic](../../examples/programs/page-ui-basic/README.md)。**状态：R2.2 候选 99a26c 已完成真实多文件 Page、Shadow DOM、CSS、图片、按钮、异步安全替换、typed Stop 与清理失败拒绝新 UI 的验收；原始回执见 [P3 摘要](evidence/local-dev-r22-c036/p3-ci-summary.json)**。不是 Page 正式安装 API，也不是 Controller Worker 的 DOM 接口。

## 1. 适用范围

项目声明 `opendesk.runtimeKind: "page-userscript"`，并在获准网页使用现有 Sidebar「开发 → 网页用户脚本 · 依赖与试运行」以 **USER_SCRIPT / async main** 执行。本地 MCP / 已连接 Sidebar 也进入同一 USER_SCRIPT 链。代码中可静态写入：

```js
import {createPageUI} from '@opendesk/ui';
export default async function main() {
  const ui=createPageUI({id:'demo.widget'});
  const button=document.createElement('button');
  button.className='od-button';button.textContent='查看标题';
  ui.content.append(button);
  ui.on(button,'click',()=>{button.textContent=document.title;});
  // main 完成后，受管 UI 仍在；关闭、pagehide 或本地受管 Stop / 刷新时清理。
  return {ui:'open'};
}
```

`@opendesk/ui` 是**固定内置构建别名**，指向随本仓库版本提供的原生 DOM 辅助模块；不是 npm 包、URL，也不是扩展特权桥。不能在 Controller 项目里导入。无需安装 React/Vue/Tailwind。没有导入 UI 模块的普通多文件项目保持原构建逻辑，不自动创建 UI。

## 2. API 与生命周期

`createPageUI({id,baseStyles=true,css='',assets={},mount?})` 同步创建一个 `<div>` 宿主、独立 `ShadowRoot`、`content` 内容节点和 `overlay` 弹层节点。未指定 `mount` 时仍按 R1 原样追加到 `document.body` 右上角；指定目标挂载时参见第 6 节。必要参数 `id` 为 1～80 字符，以字母或数字开头，其余字符允许字母、数字、下划线、点与连字符；不同 ID 可以同时存在。普通手工模式重复挂载**同文档同 ID** 时，通过宿主事件通知旧执行世界销毁旧实例，再替换节点；本地受管模式必须先取得原世界的清理回执，不能用同 ID 或 DOM 事件绕过。即使浏览器为两次手动预览分配了不同 USER_SCRIPT 世界，仍可以回收平台登记的旧实例资源。

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
| `ui.verifyMount()` | 同步检查宿主连接、ShadowRoot、可见几何、样式节点与图片状态，并返回可序列化快照；不触发截图 | 不是自动化真实点击证明 |
| `ui.getMountDiagnostics()` | 当前挂载策略、降级原因、有限策略历史、清理状态与建议 | 不包含 DOM 或网页内容 |
| `ui.active()` | 当前实例是否活跃且目标文档/宿主仍有效 | 布尔值 |
| `ui.close()` / `ui.destroy()` | 幂等销毁，移除宿主、样式、受管事件、计时器、观察器、URL 并执行清理回调 | 不会再次执行项目的 `main()` |

`createPageUI` 只接受原生 DOM 环境；无 document、目标失效或 ID 不合法分别抛出 `E_UI_DOCUMENT`、`E_UI_ID`。可使用 `baseStyles:false` 完全关闭 OpenDesk 基础 CSS，改由项目 `css` 或 `addStyle` 控制样式；不导入 SDK 的程序不会加载基础 CSS。

**运行结束 ≠ 关闭界面 ≠ 用户停止任务。** `main()` 可以返回一个有限序列化结果，但 GUI 事件仍留在文档中。面板“关闭”会释放该面板的受管资源；若仅关闭某一个面板，且要不重跑主逻辑而重新打开，可使用仍活跃的独立 launcher 或原有应用控制器调用 `createPageUI`，如 Demo。本地 `dev.stop` 会清理整次预览登记的资源，包括受管 launcher；Stop 后不保证仍有重开入口。完全销毁所有界面后，只有用户再次手动执行源码才能重新创建。此 R1 API 尚未接入正式已安装 Page 的停止/撤权信号；**不能宣称任务停止自动撤销用户任意 DOM 修改**。页面 `pagehide` 释放受管资源，BFCache 返回后不会偷偷自启动。

## 3. 资源声明、限制与身份

已有 `opendesk.project.v1` 的 `assets` 字段继续声明 CSS/JSON/图片（非新版本格式），暂仅供 `page-userscript` 使用；本地按需内存转换与正式产物构建采用同一资源合同。示例：

```json
"assets": [
  {"path":"assets/panel.css","kind":"css"},
  {"path":"assets/mark.png","kind":"image"},
  {"path":"assets/config.json","kind":"json"}
]
```

在有资源声明的 Page 项目，本地 Resolver 或正式构建器给默认导出的 `main({assets})` 注入本次执行的固定资源记录。推荐 UI 使用 `const ui=createPageUI({id:'my.widget',assets}); ui.addStyle(ui.getAsset('assets/panel.css')); image.src=ui.getAsset('assets/mark.png');`。无资产项目仍调用原有无参 `main()`。不要把这些记录当网络 URL 的通用加载器。

CSS `url("./mark.png")` 相对 CSS 所在目录解析，必须指向 `assets` 已声明的本地图片，转换时改写为固定 `data:image/*;base64,...`。禁止未声明 URL、远程 URL、CSS `@import`、目录逃逸、外部 symlink、错误扩展名、图片伪造文件头和非法 JSON。当前不支持 SVG、字体包、运行期动态资源文件或独立 HTML 入口。

**预算：** CSS 单项 24 KiB、JSON 单项 16 KiB、图片单项 32 KiB、资源总量 60 KiB、最多 32 个资产，Page 执行代码最多 **100000 UTF-8 字节**。正式产物还受源码快照 256000 字节、草稿包 512000 字节等额度约束；Local Dev 必须同时满足更小的 **完整 Native JSON 请求 60 KiB** 预算，包含元数据、转义与内嵌资源。图片重复引用会增加执行字节，不放宽预算。输入依赖或资源内容变化更新 `inputHash`；执行字节变化时更新 `sourceHash`，注释等被压缩消除的变化不一定改变后者。正式 `artifact.json` 另记录各资产 SHA-256 与大小。两条路径都内嵌所需字节，不依赖源码服务器、在线 CDN 或额外的 `web_accessible_resources`。

默认本地开发使用 [R2.2 目录连接与 MCP](local-development-r22.zh-CN.md)，每次运行读取最新 JS/CSS/图片，无需导入草稿包。仅在正式打包、导入或发布时，在仓库根目录运行 `node scripts/validate-program-project.mjs examples/programs/page-ui-basic` 与 `npm run build:program -- examples/programs/page-ui-basic`；把输出的 `program.opendesk-draft.json` 按 [Demo 指南](../../examples/programs/page-ui-basic/README.md) 导入，不要把目录或 `package.json` 直接导入 Sidebar。

## 4. CSS 隔离与权限边界

基础 CSS 只进入实例 ShadowRoot，变量在实例 `:host` 上使用 `--od-*` 专名，不写网站 `:root`；使用像素/em 而非依赖网站根 `rem` 的组件大小。两个不同实例的普通 `.od-button` 类不会相互选择。页面仍可影响宿主元素、继承值、遮挡、屏幕缩放和 CSS CSP；ShadowRoot **不是 JS 沙箱**，USER_SCRIPT 执行世界不是 CSS 隔离。严格 CSP 页面和 data URL 图片需要真实 Chrome 单项验收，不能由 Node 构建测试推断。

代码本身只有 USER_SCRIPT 的原生 DOM 权限，没有 `page`、`chrome.runtime`、Native、GM 或任意特权 Broker 通道。插件仍由现有 Authority/受控预览验证目标和权限。SDK 的回调在宿主或文档失效后会保守返回，不授予新的网络/自动化能力。普通用户脚本自行在网站注册的监听器、定时器、网站 DOM 改动，不属于可自动清理的受管资源。

## 5. 当前状态及后续复用

源码和定向组件检查与真实浏览器验收分开记录。React/Vue 后续可以把组件根放在 `ui.content`，把 portal/弹窗放在 `ui.overlay`，使用 `ui.onDispose(()=>root.unmount())` 或 Vue `app.unmount()`。Tailwind 后续在本地预编译 CSS，仍通过 `ui.addStyle` 载入。**本 R1 不宣称 JSX/TSX、Vue 单文件组件、Tailwind 预设、正式 Page 安装或 Sidebar sandbox 自定义应用已实现。**


## 6. R1.2：在已有网页位置增加 UI（仅 Page USER_SCRIPT 显式预览）

保留第 1 节原有浮动调用不变。仅在明确希望与当前网页融合时提供 `mount`：

```js
const ui = createPageUI({
  id:'sample.read-title',
  mount:{selector:'#page-ui-demo-target', position:'after', mode:'auto'}
});
const button = document.createElement('button');
button.type = 'button';                        // 防止意外表单提交
button.className = 'od-button od-button--primary';
button.textContent = 'AI · 读取标题';
ui.content.append(button);
ui.on(button,'click',()=>{button.textContent=document.title;});
const check = ui.verifyMount();
const diagnostics = ui.getMountDiagnostics();  // JSON 可序列化，无 DOM 引用
ui.onDispose(()=>{/* 若框架有 root/app，应在此处 unmount */});
```

**参数：** `selector` 必须是单一、有效、最长 200 字符的 CSS 选择器；`position` 为 `before`、`after`（默认）、`append`。`mode` 为 `auto`（默认，优先原位）、`inline`（同样优先原位）、`anchored`（跳过原位，使用独立 DOM 对齐）、`floating`（显式浮动）。指定 `mount` 时都需要 `selector`。选择器多个命中抛出 `E_UI_TARGET_AMBIGUOUS`；无效选项/非法选择器/目标属于 OpenDesk 自身 UI 抛出 `E_UI_TARGET`，且先检查、后清理旧同名实例。目标暂不存在则进入浮动备用，不无限等待或扫描页面。

| 策略 | 宿主所在位置 | 选择与转换规则 |
| --- | --- | --- |
| A `inline` | 目标前、后或内部的**新 OpenDesk host**，其内容在独立 ShadowRoot | 唯一且非危险交互容器时首选；网站重绘替换其子节点，先解除观察再迁移到 B |
| B `anchored` | `body` 下独立 host，通过目标矩形计算 `fixed` 对齐 | 显式指定、交互/可编辑容器不宜插入，或 A 丢失；监听目标至多 3 级父边界的 `childList`；只在 B 使用滚动、resize 和可用的 ResizeObserver |
| C `floating` | 原有右上角宿主模式 | 目标缺失/无稳定几何位置，或 B 无法定位；不反复重写网页 DOM |
| D `stopped` | 不再挂载，受管资源清理 | 样式节点明确被阻止则停止；文档失效、pagehide 和主动销毁仍使用既有清理机制，不提权或切换 MAIN World |

不强制识别 React、Vue、Angular、Svelte 或 Web Components 版本：**框架名字不等于冲突**。不访问网站内部私有框架对象，也不接管其 React/Vue 根节点。原位模式使用自有 host，但站点仍可能管理 host 的**父节点**；重绘后的迁移才是保护措施，不能保证任意第三方渲染器永远不删除 host。观察仅发生在指定 `mount` 的实例中，不遍历网站脚本、CSS 或组件树。新按钮必须显式使用 `type="button"`；SDK 不替项目阻断任意原生事件，也不变更网站原控件的事件处理器。

`ui.verifyMount()` 返回 `{strategy,reason,restored,cleaned,checks,transitions,...}`；其中 `checks.hostConnected`、`shadowReady`、`targetConnected`、`visible`、`cssReady`、`imagesReady` 是当前可检查的状态，几何/CSS/图片未知时为 `null`。指定目标的实例在挂载后约 180ms 仅运行一次受管健康检查：样式节点明确不可用时停止；有内容且宿主无可见几何时降级一级。图片还未解码时 `imagesReady:false` 不等于网络错误。检查不抓取网页正文、输入值或截图，不发送 DOM 到 Controller。`transitions` 最多 4 条，诊断建议面向开发者，不新增复杂用户设置 UI。

**边界及无法自动检测：** 特殊 shadow tree、祖先裁剪、遮挡（尤其跨 iframe/top layer）、严格 CSP、缩放、按钮原生默认行为与框架重绘，仍需真实 Chrome 可视交互验收；Node DOM 模拟不证明全部场景。B 对齐依靠 `getBoundingClientRect()`，不是通用避障引擎；此版尚无目标异步长期等待、网站框架版本适配、原控件修改/回滚或 sandbox iframe 挂载。JSX/TSX、Vue SFC、Tailwind 预设仍按现有构建边界拒绝；未来独立打包第三方组件时必须在 `ui.onDispose` 中卸载，React Portal/Vue Teleport 放入 `ui.overlay` 或自有容器。

### 可复现验收（不得用构建通过冒充 Chrome 通过）

仅用 `examples/tasks/demo-form.html`：在手动 Page USER_SCRIPT 预览中运行 `examples/programs/page-ui-basic`，在“文本读取”区域 `#page-ui-demo-target` 旁看到“AI · 读取标题”，点击后显示真实网页标题。点“模拟区域重绘”，网站替换工具栏子节点，原位 host 被删除，应由 B 迁移到独立对齐宿主；再次点击仍能读取标题。验证网页原有点击、搜索、表单、GET 不受影响；重复预览不会重复注册、关闭及 `pagehide` 后 host 数归零。Demo 的右上面板 + 右下重新打开入口 + 原位按钮同时活跃时宿主数为 3（关面板为 2，完全退出为 0）。此外验收全局 CSS、缩放/滚动、严格 CSP、图片、BFCache、无权限和并行实例，并留 DevTools/扩展回执。没有真实 Chrome 时标记 `NOT_TESTED`。

## R2.2：本地受管 UI 的显式刷新

本地 Page 项目通过真实静态 import 使用 `@opendesk/ui`，由原预览链预先创建无特权的世界内生命周期。新源码通过验证后，显式再次运行会先停止旧实例的新回调进入，等待其已开始的 Promise 和异步 `onDispose`，再挂载新版本。`destroy()` 仍同步、幂等；平台另外等待清理完成。所有异步工作应返回 Promise，未登记资源和未返回的异步任务不在此保证中。

MCP Stop 与 Sidebar“停止受管 UI”返回原 previewId/sourceHash 和 `preview-retired` / `scope:managed-ui-only`。它们不会回滚业务效果，也不是任意 USER_SCRIPT 的终止器。项目未创建资源时，可返回 `instances:0` 的空清理。清理失败阻止新版本；5 秒超时、身份不符或结果无法确认，保留共用执行栅栏，关闭原标签页后才能释放未知预览。新 Host 不静默接管旧实例，移除 UI SDK 前须先停止原预览。

受管旧实例的 DOM 标记只用于保守拒绝其他模式的同 ID 替换，不能充当清理证明。实际证明来自原 USER_SCRIPT 世界的词法 registry、原 nonce 和精确文档的原生回执。Promise 原语被替换、原型 then 污染等会保守拒绝，平台不承诺把任意不受管 JavaScript 变成安全沙箱。

本轮没有自动文件执行、通用 HMR、React Fast Refresh、Vue 状态保持或 CSS 增量更新。React/Vue 的异步卸载应通过各自正确的卸载函数接入 onDispose；具体框架集成仍按真实验收范围记录。
