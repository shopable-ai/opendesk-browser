# R24.1 · 指定网站 Page UI、React 与 Vue

[Page USER_SCRIPT](page-userscript.zh-CN.md) · [项目格式](local-projects.zh-CN.md) · [UI 生命周期](../framework/ui-api.zh-CN.md)

这里仅讨论**修改当前访问的网站 DOM**，不是 Side Panel 小工具或独立 Chrome 标签页应用。全部示例继续使用原有 Page USER_SCRIPT、Shadow DOM、受管清理与项目编译器；不得添加第二套网页执行器、权限系统或 CDN。

## 先选能运行的示例（2026-10-11）

| 示例 | 当前可否按“连接目录→点击运行”使用 | 入口和限制 |
| --- | --- | --- |
| [React Direct](../../examples/programs/page-ui-react-direct/README.md) | **可以** | 普通 `.js` / `React.createElement`，扩展预装 React 19.2.0；无需用户 Vite/npm 构建 |
| [Vue Direct](../../examples/programs/page-ui-vue-direct/README.md) | **可以** | 普通 `.js` / `h()`，扩展预装 Vue 3.5.22；无需用户 Vite/npm 构建 |
| [React JSX](../../examples/programs/page-ui-react/README.md) | **不可以（已知构建容量阻断）** | Vite 只能先转换 JSX；历史预编译 `961,871` 字节，校验 `E_PROJECT_LIMIT` |
| [Vue SFC](../../examples/programs/page-ui-vue/README.md) | **不可以（已知构建容量阻断）** | Vite 只能先转换 `.vue`；历史预编译 `144,502` 字节，最终 Page 预算不足 |

上表的 “可以” 仍要求已配对的 OpenDesk Native/浏览器扩展、Chrome 用户脚本能力、真实站点授权以及**用户自己点击运行**；只是表示示例本身符合已经实现的运行方式。运行本地目录命令 `opendesk browser dev .` **只连接并准备项目，不会启动 npm/Vite、自动操作网页，也不会把编译失败的 JSX/SFC 变为可运行项目**。即使显示工作区或“已连接”，也不证明项目可用。

### 想立即运行 React/Vue：两条终端命令和一个浏览器操作

假设仓库位于 `/Users/shopme/Documents/workspace/opendesk-browser`；若已经安装并配对 CLI、Native Host 和扩展，不需要为每个项目重复安装。

```sh
# 终端 A：只启动一次标准测试网页（先确认 43111 没被其他程序占用）
cd /Users/shopme/Documents/workspace/opendesk-browser
python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks

# 终端 B：React / Vue 二选一，连接后保持 CLI 前台运行
cd /Users/shopme/Documents/workspace/opendesk-browser/examples/programs/page-ui-react-direct
opendesk browser dev .

# 或另一次连接 Vue
cd /Users/shopme/Documents/workspace/opendesk-browser/examples/programs/page-ui-vue-direct
opendesk browser dev .
```

打开 `http://127.0.0.1:43111/demo-form.html` → Side Panel「开发」→「本地项目」→ 选择已授权项目 →「运行本地项目」。后续保存 `src/main.js` 会自动准备；**不会自动执行**。需要停止网页 UI 时点击对应受管 Stop。

### JSX / Vue SFC 现在如何编译，以及为什么编完仍不能运行？

这两个是**高级语法构建参考项目**，不是现成的成功运行示例。先在**仓库根目录**首次安装构建器（Node.js ≥22.12），再在所选项目目录安装锁定的项目依赖：

```sh
cd /Users/shopme/Documents/workspace/opendesk-browser
npm ci --ignore-scripts --no-audit --no-fund

# 选 React JSX（Vue 则把最后一级目录改成 page-ui-vue）
cd examples/programs/page-ui-react
npm ci --ignore-scripts --no-audit --no-fund
npm run build:framework
# 只得到 src/compiled/framework.js；Vite PASS != OpenDesk Runtime PASS

# 查看真实项目与容量错误（回到仓库根目录）
cd ../../..
node scripts/validate-program-project.mjs examples/programs/page-ui-react
npm run build:program -- examples/programs/page-ui-react --mode development
```

Vue 的命令把 `page-ui-react` 替换为 `page-ui-vue`，入口业务源为 `src/Widget.vue`；React 业务源为 `src/framework.jsx`。修改这些高级语法文件后，**目前必须手动重跑** `npm run build:framework`；`opendesk browser dev .` 不会自动触发 Vite。两种项目历史 Vite 产物均超出可执行 Page 体积预算：React 961,871 字节会在单源码校验时失败（`E_PROJECT_LIMIT`），Vue 144,502 字节虽低于单源码 256 KiB 限额，仍无法满足最终 Page JS 100,000 字节的预算（如 `E_PROJECT_OUTPUT_LIMIT`）。因此**现在不存在仅靠增加启动命令就能直接运行这两个原始示例的流程**；看到上述容量错误不是网站授权或 CLI 连接故障。

### 修复策略（设计目标，**尚未实施**）

- **共享运行时**：沿用 `src/libs/page-frameworks/contract.js` 中固定 React/Vue 资源及 SHA 校验、原 USER_SCRIPT 权限；不要把 ReactDOM/Vue 完整运行时混入 `src/compiled/framework.js`。
- **React JSX**：受控转换 JSX 为普通 JavaScript，Hooks、`createRoot`、`createElement` 必须来自现有 `OpenDeskPageReact` 同一实例；项目显式声明 `opendesk.framework: "react"`。
- **Vue SFC**：受控转换 `<script setup>` 和模板；现有 `OpenDeskPageVue` 只暴露部分 Composition/render API，尚缺生成模板所需辅助函数，不能只把 `vue` 标记为 Vite external。须独立扩充并重新审计/固定框架运行时资源、版本和 SHA，且维持体积预算。
- **自动准备**：复用 R23 `LocalDevResolver` 的监听/哈希/内存缓存，在已验证的语法转换产物上继续原 Webpack 构建；不自动运行 `npm scripts`、不下载 CDN、不开 MAIN world、不断开原 Stop/清理合同。
- **完成标准**：两例最终业务 `program.js` 均符合原 100,000 字节预算，真实 Mac Chrome USER_SCRIPT 能挂载/点击/Stop、多轮编辑后运行版本正确，错误可定位到源码，且安装/权限/哈希回执通过。达成前不能将本高级语法示例标成“可直接运行”。

原有 [R24.1 工作记录](../framework/workstreams/page-ui-r241-20261011.md) 保留失败证据；[R24.2 Direct 工作记录](../framework/workstreams/page-ui-no-build-r242-20261011.md) 记录了真正可运行的纯 JS React/Vue 证据。不要把两种模式的成功等级混用。


## R24.2 · 默认免手工编译的 React/Vue 网页增强

**只编辑 .js、保存并点击「运行」。** 原有 OpenDesk 本地项目链负责在后台准备多文件普通 JavaScript。React 19.2.0 / ReactDOM 和 Vue 3.5.22 被编译一次、作为单独的 SHA-256 固定资源随扩展发布；用户不必安装 npm、使用 Vite 或打包依赖。资源在现有获准的 USER_SCRIPT 世界中执行，不借用目标网站的框架实例、不使用 CDN/MAIN/eval。

| 推荐示例 | 用户业务源码 | 卸载 |
| --- | --- | --- |
| [React 免手工编译](../../examples/programs/page-ui-react-direct/README.md) | `src/main.js` 使用 `React.createElement()` + Hooks | `ui.onDispose(()=>root.unmount())` |
| [Vue 免手工编译](../../examples/programs/page-ui-vue-direct/README.md) | `src/main.js` 使用 `createApp()` + `h()` + `ref()` | `ui.onDispose(()=>app.unmount())` |

项目清单额外声明 `opendesk.framework: "react"` 或 `"vue"`，由**已有**构建器给 Page 源码头写入 `// @opendesk-lib react|vue`。单文件纯 JS UserScript 可以在文件顶部声明同一注释，但没有自动获取 `@opendesk/ui` 受管清理；推荐选择多文件项目。框架资源仅决定被载入的代码，不会赋予网站授权或改变 URL、权限、运行方式。

标准网页为 `http://127.0.0.1:43111/demo-form.html`。用户仅需授权项目目录和 Chrome 网站、打开 USER_SCRIPT 开关，再在本地项目中点击 **运行**；看到网页原位按钮后点击高亮/撤销，最后 **停止受管 UI**。保存文件不会自动运行，也不会自动安装。React 19 已无官方 UMD 发行形式，因此这里由 OpenDesk 维护者一次性离线生成固定 classic 脚本；无需用户自己生成。

**JSX/TSX/.vue SFC 不是浏览器能直接理解的 JavaScript。** 如果用户希望写这些高级语法，需要以后由系统在保存/运行时自动转换，不能宣称无需任何编译。历史的 [React JSX](../../examples/programs/page-ui-react/) / [Vue SFC](../../examples/programs/page-ui-vue/) 仅为高阶构建参考，不是默认用户路径。

### 无需本地项目连接：直接导入已生成的测试草稿

为了方便手动测试，已将原生构建器输出的两份固定草稿放在 [examples/import-ready](../../examples/import-ready/README.zh-CN.md)。**这两个文件无需用户编译**，可以直接从「发现 → 导入」中的「导入任务包 JSON 或 JavaScript 草稿」选择：

- `examples/import-ready/page-ui-react-direct.opendesk-draft.json`
- `examples/import-ready/page-ui-vue-direct.opendesk-draft.json`

若在完整目录标签页导入，请先打开同窗口 Sidebar；导入后回到「开发 → 直接编辑」，确认只读的 Page 代码快照，再点击「在当前网页试运行」。此导入是**临时草稿**，未安装、未授予权限、没有自动运行。要反复修改代码，优先授权对应源码项目目录；已导入快照不会自动跟随源码变化。

自动检查：`node --test tests/environment/page-ui-import-drafts-r242.test.mjs tests/environment/page-ui-no-build-r242.test.mjs`。

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

React/Vue 示例默认限定标准测试页 `127.0.0.1:43111`（HTTP）。真实 CI 已生成并锁定两套 `package-lock.json`，本地使用 `npm ci`、`npm run build:framework`，再运行既有 `build:program`。**当前不是可运行成品**：React 预编译 961,871 字节、Vue 144,502 字节，均超出原 Page 预算；不能以 Vite PASS 替代 Runtime PASS。

`@opendesk/ui` 是原有 OpenDesk webpack 别名，**不是 npm 包**。真实 CI 表明 ReactDOM/Vue 预编译产物分别为 961,871 / 144,502 字节，超出现有 100000 字节 Page 编译输出预算；React 项目实际报告 `E_PROJECT_LIMIT`。真实构建若失败，应记录 `E_PROJECT_OUTPUT_LIMIT` 等错误，不得通过 CDN、eval、动态执行、放宽预算或特权 MAIN world 绕过。

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
