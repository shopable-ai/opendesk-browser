# OpenDesk UI 开发与样式隔离 R1：原生默认、框架可选、资源按容器加载

> 决策日期：2026-10-09（Asia/Shanghai）。初次源码核对基线：main@`36cdb638dc755f1be266eac745d09ce2e384a2c1`；保存前复查 main@`70fb3449ae97cfdf69b4fc83f0466e36f8501006`，本专项引用的 UI 入口、构建器、校验器、Task 合同和 CSP 核心事实未变。
> 本文状态：**设计与缺口已核对；新增 UI 运行能力待实施、待真实 Chrome 验收**。本文不把安装依赖、放置示例或保存设计认定为产品支持。
> 适用范围：插件自身 UI、现有任务参数表单、用户网页内 UI、多文件 UI 工程和未来侧栏内自定义任务界面。沿用现有 Sidebar、RunHost、Authority、Task/Program 和两类执行环境。

## 1. 采用的设计

**默认允许不使用框架；需要时由项目选择 React 或 Vue；基础 CSS 按界面容器启用；Tailwind 在构建时生成项目需要的 CSS。**

“内置但按需使用”与“样式隔离”解决不同问题：前者决定什么时候加载，后者决定加载后影响谁。两者必须同时成立。用户没有创建 UI 的脚本，不应额外加载 UI 依赖或向网页注入任务样式。

React/Vue 主要帮助组织组件、交互和状态，Tailwind 帮助编写样式；视觉质量还取决于字体、间距、层级、状态反馈和可访问性。引入框架本身不是界面质量验收。

实施原则：

- 插件自己的界面沿用目前原生 HTML/CSS/JavaScript，不因支持用户 Vue/React 项目而重写 Sidebar。
- 简单任务优先沿用 `paramsSchema` 自动表单；复杂界面才使用自定义 UI。
- 用户网页内小工具优先使用独立 ShadowRoot；侧栏内任意用户代码使用独立的无扩展特权展示文档。
- 不默认给所有网页注入 React/Vue/Tailwind，不创建全局 `window.React`、`window.Vue` 共享机制。
- 先贯通一个原生界面的资产、显示和清理闭环，再接框架编译适配。
- 保留“我的任务 / 发现 / 开发”三个页签、原底栏及去掉重复品牌的现有设计。框架选择属于开发项目，不增加第四个页签。

## 2. 当前实际支持到哪里

以下均以本次固定源码基线为准；本轮没有重新运行用户 Mac 上的 Chrome 或旧 `src-bex`。

| 范围 | 已确认事实 | 能力结论与代码依据 |
| --- | --- | --- |
| 插件自己的 UI | `manifest.side_panel.default_path` 指向 `ui/tool.html`；HTML 引用 `tool-shell.css`，交互由原生 JS 实现 | **已有源码**：[manifest](../../../manifest.json)、[tool.html](../../../src/ui/tool.html)、[tool-shell.js](../../../src/ui/tool-shell.js) |
| 已安装任务的参数界面 | `renderForm()` 根据 `paramsSchema` 创建文本、数字、复选与枚举控件 | **已有源码**：[task-workbench.js](../../../src/ui/task-workbench.js)、[Task 合同](../../../src/platform/tasks/contract.js)；不等于任意用户组件可直接在 Sidebar 运行 |
| 页面 DOM 脚本 | 已有 USER_SCRIPT 单次试运行路径，可由作者使用浏览器 DOM API 创建元素 | **已有入口**：[现行操作指南](../../product/program-development-dual-format-and-sidebar.zh-CN.md)；手写 DOM/样式不等于平台提供完整 UI SDK |
| React/Vue/Tailwind 官方预设 | 本次 `package.json` 没有这些依赖，`src/vendor` 只有固定 jQuery 资源 | **没有现成预设证据**；不能据 npm 可安装便宣称已支持 |
| 多文件 JavaScript | 本地 ESM 校验与单个 classic JS 构建已存在 | **已有源码**：[校验器](../../../scripts/validate-program-project.mjs)、[构建器](../../../scripts/build-program-project.mjs) |
| JSX/TSX、Vue 单文件组件 | 校验器仅接受 `.js/.mjs`，使用普通 Acorn 解析；构建器没有相应组件编译配置 | **未接入正式构建链**。纯 JS 写法或已预编译文件是另一种情况，仍需逐例校验，不宣称整个框架生态已支持 |
| CSS/JSON/图片源资产 | 项目 schema 允许有限资产声明及哈希校验，但构建器对非空 `assets` 抛出 `E_PROJECT_ASSET_BUILD` | **已声明、未贯通构建与运行**；不能把“可写进 package.json”称为“可以显示” |
| 自定义任务 UI 包 | Task v1 是关闭字段的 `sourceUtf8 + manifest + paramsSchema` 合同，没有 HTML/CSS/图片资源通道 | **需要版本化扩展**；不能直接在旧 v1 塞入 `ui` 字段 |
| 现有执行沙箱 | `manifest.json` 中已有 sandbox 的 CSP 包含 `style-src 'none'`、`img-src 'none'` | **它是既有计算运行边界，不是已实现的完整用户 UI 宿主**；不能仅删除 CSP 限制便宣布完成 |
| 产物容量 | 当前构建器 Page 为 100000 字节、Controller 为 65536 字节；Task 包及通信另有准入限制 | **框架支持需要测量真实产物及整条链路预算**，不能仅放大一个常量 |

旧项目确实考虑过 UI。[既有第三方库审计](third-party-library-map.md)确认旧扩展应用使用 Quasar/Vue；旧网页 Vue/Quasar 注入存在被注释的调用，受检 Quasar UMD 文件为零字节。该证据不证明当前已完整继承这些运行能力，也不能据此确认 React 已贯通。旧 UI 可作为需求和样式参考，不能直接恢复旧目录作为当前运行树。

## 3. 从四个使用位置和一个构建环节设计

| 位置/环节 | 谁编写 | 默认做法 | 框架与隔离 |
| --- | --- | --- | --- |
| 插件自身 Sidebar、设置、任务目录 | OpenDesk 维护者 | 延续现有 HTML/CSS/JS 和视觉规范 | 可信宿主代码；CSS 留在扩展自己的文档 |
| 简单任务参数和结果 | 用户声明字段，宿主渲染 | 复用 `paramsSchema`，显示执行状态与结果 | 不需要 React/Vue；不得把参数或返回字符串当可执行 HTML |
| 插入被访问网页的小工具 | 用户脚本/用户项目 | 在获准的 Page USER_SCRIPT 中建立独立 ShadowRoot | 原生、React、Vue 均可；框架代码留在用户代码运行环境 |
| Sidebar/独立扩展标签页内的复杂用户界面 | 用户项目 | 将来使用独立 sandbox 展示文档，或继续由可信宿主渲染声明数据 | 任意用户 JS 不直接作为具有扩展特权的 Sidebar 组件执行 |
| 多文件开发与构建 | 本地开发者/Codex | 编译源文件，固定 JS/CSS/资源及其版本 | React/Vue/Tailwind 是按项目采用的工具，浏览器不执行 npm 安装或开发服务器 |

还有一种不同需求：**直接修改网站原有样式**。它属于明确的网页样式操作或 UserCSS，不应用“独立 UI 样式隔离”偷偷改变其语义。兼容的 `GM_addStyle` 可能就是要作用于网站文档；应保持该语义，不能把它无条件重定向进 ShadowRoot。应用 UI 的 CSS 与网站主题 CSS 必须分开处理。

## 4. 原生、React、Vue、Tailwind 如何组合

| 项目需要 | 渲染方式 | 样式方式 | 浏览器实际得到什么 |
| --- | --- | --- | --- |
| 输入框、按钮、结果卡片 | 原生 DOM 或现有参数表单 | 原生 CSS / OpenDesk 基础样式 | 必需的少量 JS 和当前容器的 CSS |
| 原生界面但喜欢工具类 | 原生 DOM | Tailwind 构建产物 | 原生 JS + 编译完成的 CSS |
| 复杂组件和状态，已有 React 工程 | React | 普通 CSS、基础样式或 Tailwind 均可 | 编译后组件 JS、项目所需 React 运行库与 CSS |
| 已有 Vue 工程或 Vue 组件 | Vue | 普通 CSS、基础样式或 Tailwind 均可 | 预编译组件、runtime-only Vue 和 CSS |
| 原有组件库工程 | 该项目原有技术栈 | 项目声明的组件库样式 | 仅验收通过的库与功能子集，不默认承诺所有组件兼容 |

React 和 Vue 不要求在一个任务里同时启用。支持多个框架，首先是允许不同项目独立选择，不是建设一个同页多框架混编平台。现有项目导入时优先识别其依赖与配置，不能受插件全局“偏好框架”影响而自动迁移技术栈。

框架版本以项目依赖锁和产物身份为准，不另造一份容易漂移的版本表。首版项目携带所需依赖；共享缓存可以按内容哈希去重，但不应共享可变全局状态。共享框架运行时仅在包体/性能数据证明必要时再评估。

## 5. 什么适合内置，什么适合按项目构建

### 5.1 内置一个小而稳定的基础样式预设

预设提供字体与字号、间距、颜色变量、按钮、输入框、标签、面板、状态提示、结果区域和焦点样式。它是 CSS 与可复用设计规范，不要求作者使用某个 JavaScript 框架。

- 无 UI：不加载任务 UI 样式。
- 原生 UI 模板：模板选定“OpenDesk 基础样式”，只加载至实例容器。
- 完全自定义：可以选择无基础样式，使用项目 CSS。
- 宿主表单：宿主沿用自己的样式；不让用户项目覆盖平台导航、授权和运行按钮。
- 平台样式变量采用 `--od-*` 等专属命名；只在自有根节点声明，不写进网站 `:root`。
- 基础样式不附带全网站 reset，不用 `* { ... !important }` 争抢宿主样式。
- 明暗主题默认采用平台设置；不因为网页主题变量变化而无意改变工具外观。主题是界面偏好，不是框架开关。

预设如果随平台更新，已安装项目应保留所引用的兼容版本或固定 CSS 字节；不能静默改变旧任务界面的样式身份。

### 5.2 Tailwind 内置“支持能力”，不是万能 CSS 文件

Tailwind 的正常构建方式是扫描项目源码并生成静态 CSS。固定的一份预编译 CSS 只包含构建时生成的类，不能覆盖用户未来任意类名、任意值或运行时字符串拼接。[源码扫描说明](https://tailwindcss.com/docs/detecting-classes-in-source-files)

采用的方式：

1. 开发模板或本地构建器提供明确版本的 Tailwind 配置。
2. 扫描项目的 HTML/JSX/TSX/Vue 源码，生成项目需要的 CSS。
3. 条件样式使用完整可识别类名；动态枚举按该版本官方方式显式声明。
4. CSS 固定到项目产物，在指定 UI 容器加载。
5. 修改类名后重新构建，错误定位到源码。运行无需访问 Tailwind CDN。

可以提供有限的内置工具类预设，但必须列明支持范围，不能称为“任意 Tailwind 代码即贴即用”。官方 Play CDN 用于开发体验，不作为正式扩展的运行时编译方案。[Play CDN](https://tailwindcss.com/docs/installation/play-cdn)

Tailwind Preflight 会重置标题、列表、边框等基础样式。默认不向网站 document 注入 Preflight；按模板需要选择容器内基线或省略该部分。类名前缀只是防重名措施，不能代替样式隔离，也不能保证 reset 自动被限定范围。Tailwind v3/v4 配置形式不同，实施时固定版本，不能把两代配置混写。[Preflight](https://tailwindcss.com/docs/preflight)

## 6. 样式隔离必须处理的实际问题

### 6.1 网页内 UI：ShadowRoot 是默认样式容器

每个 UI 实例拥有独立宿主节点、内容根节点、样式资源和弹层根节点。普通选择器留在当前 ShadowRoot；同名 `.button` 或 `.card` 不应影响网站及其他任务。

Chrome 的 ISOLATED/USER_SCRIPT 解决 JavaScript 环境的边界，仍共享页面 DOM；它们不自动隔离 CSS。Shadow DOM 主要解决样式与组件封装，也不是安全沙箱。[Chrome content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)、[MDN Shadow DOM](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_shadow_DOM)

需要明确的边界：

- 字体、颜色、行高和 CSS 自定义属性可能继承；平台在自己的根节点提供明确默认值。
- `rem` 仍以所在文档根字号为基准，只设置 Shadow host 字号不够。模板应测试特殊根字号；需要完全独立尺寸基准的复杂界面可使用独立文档。[MDN length](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/length)
- 不把 `all: initial` 当作一行万能隔离；它不会清掉自定义属性等全部继承因素，也要保留语言方向、用户缩放和可访问性。[MDN all](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/all)
- 宿主网站仍能移除、遮挡、隐藏 UI 的宿主元素；不能承诺对恶意页面完全不可破坏。
- 对外只把明确开放的主题变量或部件作为受支持的样式定制入口；这不限制网页通过共享 DOM、继承属性或宿主元素样式施加影响。不把整棵用户内容放入 light DOM 后仍宣称完全封装。

### 6.2 弹窗、下拉菜单也必须留在实例内

React Portal 与 Vue Teleport 都能把实际 DOM 放到别处。若组件库默认把弹层放进网站 `document.body`，弹层会离开原样式范围。

每个实例提供 `overlayRoot`。React 使用 `createPortal(children, overlayRoot)`，Vue 把 Teleport 指向同一实例的真实容器节点。第三方组件库也必须支持配置挂载位置。键盘焦点、Esc、遮罩与滚动按实例验收。[React Portal](https://react.dev/reference/react-dom/createPortal)、[Vue Teleport](https://vuejs.org/guide/built-ins/teleport.html)

### 6.3 Tailwind 的高级 CSS 要验证实际浏览器

不能把“已生成 CSS”或“成功插入 ShadowRoot”直接当成 Tailwind 全功能兼容。尤其应检查所用版本生成的 `@property`、阴影、ring、变换、渐变、关键帧与主题变量。

CSS 自定义名称在 Shadow DOM 中有规范作用域和实现差异；`@property` 还涉及文档级注册语义。按目标 Chrome 与 Tailwind 版本验证，不为解决某个效果而悄悄向网站 document 提升通用注册。必要时采用已验证的 Shadow 模板子集，或使用独立 sandbox 文档承载复杂界面。[Chrome CSS names](https://developer.chrome.com/docs/css-ui/css-names)

### 6.4 生命周期与停止语义

UI 生命周期与计算任务生命周期相关，但不能混同：任务计算完成后，结果界面可以保留；关闭界面不自动重跑任务；停止执行仍走现有 RunHost/权限边界。

拟议的最小容器句柄如下，**这是待实现的契约，不是当前可调用的 OpenDesk API**：

~~~typescript
type UiInstance = {
  mountRoot: HTMLElement;
  overlayRoot: HTMLElement;
  onDispose(callback: () => void): void;
  dispose(): void;
};
~~~

这些 DOM 对象只存在于同一个 DOM 执行环境。Controller Worker 通过现有桥接拿实例标识与可序列化状态，不能把 DOM 节点跨进程返回，也不能在 Worker 中直接挂载 React/Vue。

`dispose()` 至少释放平台登记的事件、观察器、计时器、样式、资源 URL 与实例节点，并调用 React `root.unmount()` / Vue `app.unmount()`。重复创建相同受管实例时，先清理旧实例，不能仅按 DOM ID 覆盖节点而留下监听。

平台只能可靠清理受管资源。任意用户代码自行建立的全局监听、计时器及网站 DOM 修改，不能保证靠移除一个容器全部撤销。Page preview 的一次返回也不证明异步监听已经结束。[React unmount](https://react.dev/reference/react-dom/client/createRoot)、[Vue application API](https://vuejs.org/api/application.html)

## 7. 侧栏自定义 UI 与执行权限

可信 Sidebar 自己的界面可以正常使用维护者选定的组件。用户导入的任意 React/Vue/JS 即使只挂在一个 div 或 ShadowRoot 中，也仍可访问其 JavaScript 所在环境；不能因此给它整个扩展页面的权限。

简单情况继续由宿主渲染表单和数据。确实需要用户自定义完整侧栏界面时，增加**专用于展示的独立 sandbox 文档**：

- 没有扩展 API，不可访问特权父页面 DOM。
- 与现有任务身份、Authority 和受控消息连接，不建设第二套任务执行器、Task DB 或万能代理。
- 对实际发送窗口/通道、实例、任务版本及允许动作做校验；仅看到 `origin === "null"` 不足以信任消息。
- 浏览器要求可信用户激活的操作仍由既有宿主受信按钮/流程完成，不能把 iframe 消息伪装为宿主真实点击。
- CSS/图片只通过声明的本地资产通道显示；不会为了框架 CDN 放宽特权 Side Panel 的 CSP。
- 现有计算 sandbox 继续保留原约束。新展示文档需要独立审查、构建接线、资源和生命周期验证，不能在旧 sandbox 上简单打开 style/img 就交付。

Chrome sandbox 页面有独立来源，并失去直接访问扩展 API 和非 sandbox 页面的能力。扩展特权页面的最低 CSP 与 sandbox 规则不同。[Sandbox](https://developer.chrome.com/docs/extensions/reference/manifest/sandbox)、[Extension CSP](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy)

这里也不能误写成“所有用户代码都必须随扩展安装包发布”。Chrome `userScripts` 正是用于执行用户提供、无法预先包含在扩展包中的代码。扩展自带框架依赖应本地打包；用户工程的固定产物走现有合法用户代码链，不能借框架支持升级到特权宿主。[userScripts](https://developer.chrome.com/docs/extensions/reference/api/userScripts)

## 8. 多文件构建和资源合同怎样补齐

### 8.1 先把源文件与运行产物分清楚

本地作者维护 JSX/TSX、Vue 单文件组件、CSS、图片和锁文件。构建生成项目所需的 JS、CSS、图片及可追溯信息；Sidebar 继续展示可读源码，不能要求用户阅读压缩 bundle 才能修改界面。

React 的源码由适配器编译；Vue 单文件组件预编译后采用 runtime-only 构建，不把运行时模板编译器塞进特权页面以要求放宽 `unsafe-eval`。浏览器运行产物，不运行 npm、安装钩子或任意项目构建插件。[React 现有工程接入](https://react.dev/learn/add-react-to-an-existing-project)、[Vue tooling](https://vuejs.org/guide/scaling-up/tooling.html)

复用现有 `build:program` 外部入口及项目验证结构。首批采用显式、固定的构建预设；不要因为支持框架而直接执行不可信工程自带的任意 Webpack/Vite 配置。是否需要额外本地编译依赖在该实现批次处理，不向扩展运行包加入整套开发工具。

### 8.2 向后兼容和资源加载

当前 `opendesk.project.v1` 与 Task v1 均有明确字段限制。因此 UI 元数据、样式和资源入口应先定义版本演进，再实现校验器和消费者；本文不提供可误认为已经支持的新增 JSON 字段。

资源通道至少规定：

| 项目 | 必须明确的行为 |
| --- | --- |
| 资源类型 | JS/CSS/本地图片/结构化 JSON 的允许类型、用途和 MIME；HTML 入口仅在相应展示目标实现后开放 |
| 身份 | 源文件与运行资源的哈希、相对路径和所属版本；CSS 变更也必须改变执行资产身份 |
| 路径 | 禁止目录逃逸；构建后 CSS `url(...)`、图片引用在导入/导出后仍指向相同包内资源 |
| 外部引用 | 不把 `@import`、远程 script 或运行时 CDN 编译作为未声明依赖的兜底 |
| 大小 | 分开检查脚本入口、每项资产、总解压大小和传输限制；框架实际体积要测，不直接取消当前限制 |
| 去重 | 按不可变内容去重可以共享存储；引用计数和卸载归属不能混乱 |
| 展示 | 仅为被创建的 UI 载入资源；同任务多次挂载避免重复注册 |
| 撤销 | 版本替换/停用/关闭时释放当前受管资源，保留与回滚所需资产的关系明确 |

最小首批可以只支持静态已声明资源，继续拒绝未经支持的动态分片。之后再按实际项目需要增加分片，而不是一开始建设通用微前端平台。

## 9. 普通用户与开发者怎样使用

以下为目标使用流程；当前已实现范围以第 2 节为准，框架模板和自定义 UI 创建流程待对应实施批次交付。

### 普通用户

打开既有任务 → 填参数 → 运行 → 查看状态与结果。无需先选择 React、Vue 或 Tailwind。无参数的任务不增加多余空表单。

新建一个简单工具时，默认选择“原生界面 · 基础样式”，使输入框、按钮、状态和结果自然协调。技术实现默认折叠，不成为每次运行的配置项。

### 开发者/Codex

新项目的创建流程提供三个渲染模板：原生、React、Vue；样式单独选普通 CSS / 基础样式 / Tailwind。已有项目按实际依赖识别技术栈，不强制重新选模板。

完整多文件源码继续由本地编辑器/Codex 维护。当前 Sidebar 文件输入仍只接受 JSON/JS，**尚不能把上传目录、`.vue` 或 `.tsx` 描述为已实现入口**。构建能力接通后再给现有独立管理页准确导入提示，无需把侧栏变成完整 IDE。

普通浏览器网页上的组件预览只验证外观；正式验收仍要经过扩展实际导入、目标绑定和运行链。纯预览不应默默调用网页自动化、申请权限或运行任务主逻辑。真实能力测试应由明确操作触发。

## 10. 最小实施顺序与已有 R8 任务的关系

本需求是**UI 开发能力**，与 R8.6 的完整 UserCSS 管理器不同；不能因为目录里有 CSS-001～CSS-007，就认为 React/Vue、界面容器和多文件样式已覆盖。本节细化现有开发、资源与生命周期责任，不新增第二份 188 行总清单。

| 批次 | 实际交付 | 相关既有责任 | 独立完成条件 |
| --- | --- | --- | --- |
| 当前设计补齐 | 当前能力表、按需规则、隔离方案、资源合同和验收入口 | E33、E40，参考 DEV-003/004/010/011 | 文档与真实源码一致；不提升运行时状态 |
| 第一批：原生网页 UI | 一个输入框、按钮、状态、结果与本地图片的 Page UI；原生 CSS；Shadow 容器；资源和清理 | E33 组织构建/开发，复用 E17/E20 的适用样式/资源底层；安装期对接 E12/E14 | 实际构建→原入口导入→获准网页展示→交互→关闭/重开；原网页既有元素的样式与交互不受影响；受管资源可清理 |
| 第二批：框架与 Tailwind | 在同一已验收的容器和资产链上接 React、Vue 编译适配及可选 Tailwind | E33 与 E40；按具体组件/浏览器范围验收 | 两种框架分别状态更新、弹层、卸载与离线重新运行；Tailwind 产物及资源正确 |
| 第三批：侧栏内复杂用户 UI | 确有任务需要自定义完整侧栏界面时实现独立 sandbox 展示文档及窄消息桥 | E33/E40，复用当前宿主/Authority | 不进入特权宿主；任务调用沿用现有授权；可信点击、错误和关闭状态可验证 |

原生网页 UI 的手动闭环可以在 Page 基础运行边界稳定后推进，不必等待整个 GM 兼容矩阵、Native Agent 或 UserCSS 市场。若尚未完成正式安装/停用对账，只能标注手动预览支持，不能宣布自动安装生命周期通过。

预计改动的责任位置：`scripts/validate-program-project.mjs`、`scripts/build-program-project.mjs`、`schemas/`、`src/scripting/user-scripts/`、现有资源/任务合同及相应 UI 消费者。新增通用容器模块时保持小范围；只有新增的资产协议确实需要时才改 Task/Program 版本。不要在本轮设计阶段预先建立空模块或放宽约束。

## 11. 验收标准

以下是待实施后的验收要求，不是本轮测试结果。人工通用测试继续使用 `examples/tasks/demo-form.html`；自动化压力 fixture 可以独立存在，但不增加另一个误导用户的手工入口。

| 验收面 | 通过条件 |
| --- | --- |
| 原生默认 | 不安装 React/Vue/Tailwind 也能完成输入、操作、状态与结果展示 |
| 按需加载 | 无 UI 的任务不新增 UI 容器/样式/框架；React 任务不因平台预设同时加载 Vue |
| 不改网站 | 开启/关闭前后，选定网页标题、按钮、输入框的计算样式与行为保持一致 |
| 抵抗常见样式干扰 | 宿主有 `*`、button/input、`!important`、特殊根字号时仍可用；记录不能覆盖的宿主遮挡等边界 |
| 多实例 | 同名类、不同主题、不同框架任务同时存在时互不覆盖；关闭其中一个不破坏另一个 |
| 弹层与键盘 | 下拉、弹窗、Tooltip 留在实例容器；焦点、Esc、滚动、Tab 顺序可用 |
| Tailwind | 所声明类、条件状态、阴影/ring/变换/渐变等在指定版本下真实生效 |
| 资源可携带 | 导出再导入后，本地图片与 CSS 引用不丢；不依赖开发服务器或 CDN |
| 生命周期 | 至少连续打开/关闭 20 次，受管根节点和监听不累积；导航、停止、停用分别符合所声明语义 |
| 权限与 CSP | 正式 MV3 包、严格 CSP 页面、离线情况下行为符合约束；用户 UI 不能直接访问特权 Sidebar |
| 窄窗口与可访问性 | 320/400/600 CSS px 宽度和 200% 缩放下关键操作可见；标签、对比、焦点与长结果可读 |
| 可维护性 | 报错可定位原始源码与构建版本；不以压缩 bundle 代替作者源码 |

记录框架/Tailwind 版本、浏览器版本、候选源码 SHA、资源哈希及实际运行证据。视觉、可用性、样式隔离、生命周期与可维护性分别评估；权限、资源或数据正确性未通过时，不用综合高分抵消。设计评审与实现质量评分必须分开，本文不自报“已达到 95 分”。

## 12. 本轮完成与未完成

本轮完成：固定 main 的源码核对、UI 分层设计、按需加载与隔离规则、现有 R8 计划的专项接线说明，以及未来实现的可验证完成条件。

本轮没有：安装 React/Vue/Tailwind、修改运行时 CSP、实现 UI 资产通道/容器/框架编译器、运行用户 Mac 真 Chrome、完成原生 UI 验收。后续实施应从第一批原生网页 UI 的真实闭环开始；不能仅补充依赖后改变支持状态。
