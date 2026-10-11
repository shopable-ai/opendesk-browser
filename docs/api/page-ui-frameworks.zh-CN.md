# R24.1 · 指定网站 Page UI、React 与 Vue

[Page USER_SCRIPT](page-userscript.zh-CN.md) · [项目格式](local-projects.zh-CN.md) · [UI 生命周期](../framework/ui-api.zh-CN.md)

这里仅讨论**修改当前访问的网站 DOM**，不是 Side Panel 小工具或独立 Chrome 标签页应用。全部示例继续使用原有 Page USER_SCRIPT、Shadow DOM、受管清理与项目编译器；不得添加第二套网页执行器、权限系统或 CDN。

## 1. 运行与授权的四种状态

| 阶段 | 意义 | 下次打开网页自动运行？ |
| --- | --- | --- |
| 本地目录项目 | `package.json#opendesk.pageRules` 声明允许 URL，构建器输出普通 JS | 否 |
| 手动试运行 | 用户明确选择实际 tab/document，Chrome Site Access 和 USER_SCRIPT 满足才预览 | 否 |
| Verified / Available | 固定版本得到独立的可信验证与可安装状态 | 否 |
| Installed & Enabled | 明确安装批准后，现有 `chrome.userScripts.register()` 引导可在匹配的**新文档**运行 | 对匹配新文档执行；不承诺 SPA 回到允许路径会自动重新执行 |

每次已安装启动要联合核对：声明的包含/排除、安装授权、Chrome 实际网站许可、原生脚本标记、真实 tab/frame/document、页面 URL 和原有 Page Runtime。手动预览没有形成持久安装；`ui.destroy()` 也不是任意业务回滚器。

## 2. 固定站点、子域名、路径和排除

```json
{
  "pageRules":{
    "matches":["https://chatgpt.com/*","https://*.example.org/articles/*"],
    "excludeMatches":["https://chatgpt.com/admin/*"],
    "runAt":"document_idle","allFrames":false,"world":"USER_SCRIPT"
  }
}
```

- `https://chatgpt.com/*` 仅 HTTPS；`http://` 需要另行声明。
- `https://*.example.org/articles/*` 覆盖根域和真实子域，不匹配相似恶意域。
- 多条包含规则是 OR；排除规则优先。路径匹配包含查询参数，但忽略 `#fragment`。
- Chromium URLPattern 支持 `http://127.0.0.1:43111/*` 等带端口的脚本**匹配范围**；它会拒绝 43112。原有 `http://127.0.0.1/*` 仍覆盖所有端口。**URL 匹配不是 Chrome 网站权限或安装批准**；两者由可信 Host 独立验证，不得仅凭页面字符串授予权限。
- 禁用 file://、chrome://、`<all_urls>`、任意自定义正则。旧系统可能含 `*://*/*`，新项目默认必须缩小范围。

## 3. 三个真实代码示例

| 示例 | 源码 | 清理 |
| --- | --- | --- |
| [原生 DOM](../../examples/programs/page-ui-basic/) | `src/main.js` + `src/enhancement.js`；在标准测试页增加高亮/撤销按钮 | `ui.onDispose` 撤销自有节点和 outline，受管监听器/观察器由 SDK 负责 |
| [React JSX](../../examples/programs/page-ui-react/) | `src/framework.jsx`，真实 `createRoot` 和 Hooks | `ui.onDispose(()=>root.unmount())` |
| [Vue 3 SFC](../../examples/programs/page-ui-vue/) | `src/Widget.vue`，真实 `<script setup>` 和 `createApp()` | `ui.onDispose(()=>app.unmount())` |

都对准 `examples/tasks/demo-form.html` 的 `#lab-text #sample-text`；元素不存在、多个目标、区域重绘都按可恢复原则处理。不修改原表单数据，不复制官方 TOC 扫描器。

React/Vue 示例默认限定在标准测试页的 `127.0.0.1:43111`（协议为 HTTP），且仍为**预编译源码模板，尚非验收完成的成品**：`npm install --package-lock-only` 生成锁后审阅、提交，再使用 `npm ci`，先 `npm run build:framework` 产生 `src/compiled/framework.js`，再走既有 `npm run build:program -- examples/programs/page-ui-react` 或 vue。不要误把 JSX、TSX、.vue 交给只接受 .js/.mjs 的现有项目构建器。

`@opendesk/ui` 是原有 OpenDesk webpack 别名，**不是 npm 包**。ReactDOM 可能超出现有 100000 字节 Page 编译输出/Native 60 KiB 请求等限制。真实构建若失败，应记录 `E_PROJECT_OUTPUT_LIMIT` 等错误，不得通过 CDN、eval、动态执行、放宽预算或特权 MAIN world 绕过。

## 4. SPA / BFCache / Stop

`createPageUI({pageRules})` 新增的是**可选的同文档 UI 路由保护**：初次创建前校验 URL；现代 Chrome 的 Navigation API、popstate/hashchange/pageshow 和有限兼容性回退检测离开范围时销毁本 UI。已安装脚本在可信后台派发前也重新校验当前匹配范围，防止原注入标记在 SPA URL 改变后被错用。

`pagehide` 会销毁受管 UI，BFCache 恢复不默默自动重新创建；返回允许范围也不擅自重播。注意第三方网站代码自行创建的全局监听器、未注册任务以及已发生的业务效果，SDK 无法恢复。**权限撤销后即时通知并清理已安装 UI** 仍需独立可信生命周期/回执工程，本轮不能声称完成。

## 5. 标准测试与证据

```sh
python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks
node --test tests/environment/page-url-scope-r241.test.mjs tests/environment/page-framework-examples-r241.test.mjs
node --test tests/environment/page-ui-mount.test.mjs tests/environment/page-installed-programs.test.mjs tests/environment/local-dev-managed-ui.test.mjs
npm run check
```

真实 Chrome for Testing 需绑定实际已构建扩展 SHA、真实 USER_SCRIPT 回执和目标 document，覆盖：允许/排除/未授权网站、不同本地端口精确 Origin、React/Vue 挂载及 `unmount`、网页重绘、Stop/Run 20 次、SPA、BFCache、CSP、暗色、200% 缩放、窄屏。Node 模拟/静态测试不能当作原生 Chrome PASS。见 [独立工作流记录](../framework/workstreams/page-ui-r241-20261011.md)。

**官方 TOC 的差异：** `src/reading-toc` 使用可信扩展 Content Script + 自有索引/站点授权。普通 Page USER_SCRIPT 只有自身 DOM 和受管 UI，不获得官方 TOC 的后台权限、宿主消息或扫描器。
