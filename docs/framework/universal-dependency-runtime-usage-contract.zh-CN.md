# Universal Dependency Runtime｜新旧场景、用法、文件与验收的长期合同

> 2026-10-13。**这是“按用户场景看依赖系统”的单一导航文档**，而不是第二个 Dependency Manager 或新源码运行时。仅描述源码核查事实、冻结决策和下一阶段验收标准。运行时库 ID/版本/世界仍以 `src/libs/runtime-contract.js`、`src/libs/catalog.js` 为准；最新实现/证据以指定 SHA 的源码、`docs/framework/workstreams/universal-dependency-file-first-r7-20261013.md` 及原始测试为准。过时的历史 snapshot 不等于 Chrome PASS。

## 0. 不可偏移的用户目标

产品方向是 **用户提出需求 → AI/用户编写脚本 → 直接 Run，系统自动准备第三方库并返回结果 → 需要时授权程序能力并安装固定版本 → 离开 AI 仍可重复使用**。用户无需修改扩展源码、运行 npm、手工编辑多个依赖文件或重建扩展，才能使用此前未预装且受支持的第三方库。高级/大型项目可以采用已有受信本地构建器，但不应把“人人手动写 React/ESM”当作核心用户价值。

**统一资源、自动固定、权限独立、执行世界隔离。** 相同的 SHA 资产可以复用，程序/Revision/执行世界自动各自建立技术固定记录；**锁不是用户必须逐库点击“批准”的表单**。程序对网站和敏感能力的权限、安装/定时/云控授权各自有效，不能互相继承。不存在所有世界通用的 JS 全局变量。

### 2026-10-13 最新产品原则：自己的开发草稿零人工依赖审核

| 场景 | 用户需要做什么 | 系统必须自动做什么 |
| --- | --- | --- |
| 自己写脚本或 AI 代写并主动 Run | **只点击 Run**；不额外点“检查/确认下载/核对 SHA/批准依赖锁” | 解析 Classic/ESM、确定固定版本、校验来源和完整图、获取或复用 SHA 字节、自动固定每程序锁、返回真实结果 |
| 程序 B 使用程序 A 已缓存的同版本库 | **不再人工批准该库** | 共享完全一致的字节，自动派生 B 的程序/Revision/world 记录；不复制 A 的运行或网站权限 |
| 来源/网站缺 Chrome 许可 | 按 Chrome 原生弹窗批准或拒绝必要权限 | 将真实手势连接至 Run；拒绝即安全失败，不伪造权限 |
| 保存、安装，开放定时/云控/外部调用 | 需要时明确授予**程序的站点、数据和操作能力**，不是逐项批准三方 JS | 固定源码/资产/锁与 Program Revision，保持撤权、Stop、离线复用 |
| 版本不明确、内容损坏、不兼容或违反 MV3/CWS 限制 | 必要时选择版本或收到清晰错误 | 不静默选择 latest、不绕过权限、不在特权 Host/SW 运行下载代码 |

**历史事实和待实现体验必须分开**：R7.1 Page / R4 Controller 仍包含多个手动依赖批准动作；这是待消除的 UX 缺口，不能把旧 Node PASS 当作免审核体验已经交付。

## 1. 旧源码已保存在本仓库，不必再寻找原工程

旧源快照基准：`docs/contracts/source-snapshots/todo-src-bex/src-bex/`，以及 `docs/contracts/source-snapshots/scrapyJsChrome/background-sw.js`。旧版网页加载和 ChromePage 方式是**历史使用证据**，不是迁移后安全实现的榜样。

| 旧文件（路径相对于 src-bex） | 真实使用方式 | 要保留的需求 | 不可照搬的问题 |
| --- | --- | --- | --- |
| `background.ts` | TypeScript 静态 import Lodash/Moment/Axios/ChromePage/Socket.IO；旧服务器 SCRIPT_RUN 走 wrapAsync/eval | 受信静态依赖；来自云端的任务触发能力 | 不能把云端脚本 eval 放入特权 SW；必须进入安装、版本和 Authority |
| `manifest.json` | `content_scripts.js/css` 明确列多个 JS 和 CSS，按数组次序加载 | 独立文件、加载次序、每世界归属 | 不应复制全站权限和全局注入 |
| `my-content-script.ts` 79–104、148–189 行 | `appendScript(chrome.runtime.getURL(...))` 加载 brige/axiosx/lodash/moment/axios/js-cookie；有 `type="module"` 和网络 Bridge | Classic 直接加载，不重复打包；确有模块场景才走 ESM | 函数未等待 script.onload/error；注入 MAIN 污染页面、依赖竞态 |
| `ChromePage.ts` 343–465 行 | `page.addScriptTag({url,content,type})`、`page.addStyleTag({url,content})` | Page 按需 JS/CSS 资源与可管理生命周期 | 避免 `new Function`、动态特权执行、孤立 DOM 和无清理 |
| `assets/js/core/brige.js`、`custom_event.js` | MAIN CustomEvent → Content → Background → 回调 | 跨世界异步服务需要安全回程 | 不能将事件冒充授权；改用原 Host/Authority/Broker |
| `assets/js/core/axiosx.js`、`appStorage.js`、`appLocal.js` | 页面全局包装器，通过桥调用后台 HTTP/存储 | 直接调用公共服务的作者体验 | `axiosx` 不等于上游 Axios；存储/网络要重新授权 |
| `assets/js/detect_focus.js` | focus/click/mousemove/keydown 通知 Background | Time Review 的访问行为统计 | 不是通用依赖系统；Stay Focus 拦截属另一产品 |
| `scrapyJsChrome/background-sw.js` | `BACKGROUND_SCRIPTS` + `importScripts(...fixedFiles)` | 受信脚本独立资源的经验 | 只能用受信打包代码，不把用户下载 JS 放入特权 SW |

**历史结论**：继承“独立 JS 优先、顺序和生命周期可验证、按世界按需加载”；不复制不安全 `eval`、网站 MAIN 全局注入、跨世界共享权限和未确认的 onload 顺序。旧 Moment 与新版 Day.js、旧整套 Lodash 与新版受限 `_`、旧 Bridge Axios 与真实 Axios 模块均不能冒充完全等价。

## 2. 实际“执行世界 × 用法 × 源码”矩阵（唯一场景分母）

| 场景 / 入口 | 用户/AI 写法与原始示例 | 依赖加载与执行 | 关键源码 | 截至 R7.1 的证据级别 |
| --- | --- | --- | --- | --- |
| Controller 单文件 Classic | `async function main(){ return {title:await page.title(),words:_.words("hi")}; }`；`examples/programs/single-file/controller-globals-zero-arg.js` | 默认 `_`/`dayjs` 已安装在 Controller Worker；词法 `page`/`params`；可选受支持资源需单独验证 | `src/ui/script-editor.js`、`src/libs/loader.js`、`src/scripting/sandbox/controller.js`、`worker-runtime.js` | 既有实现，不能推导任意外部 Classic 库自动可用 |
| Controller 单文件 ESM（Developer） | `// @opendesk-import ... pinned URL` + `import {parse} from '@vanillaes/csv'` + `export default async function main()`；`examples/programs/single-file/controller-vanillaes-csv-esm.js` | 固定三模块图、自动绑定 Controller 锁、受信 Babel 转自包含 Classic（当前 UI 仍有人工依赖审核缺口），最后进入原 RunHost→Authority→opaque Worker | `src/ui/page-component-remote.js`、`page-component-preparer.js`、`src/libs/page-frameworks/controller-esm-linker-r4.mjs`、`src/ui/controller-esm-source.js` | 固定 Babel/真实 @vanillaes CSV Node PASS；首次网络审批 + 全生命周期 Chrome 未关闭 |
| Controller 多文件 ESM | `export default async function main()` + 相对文件/npm/精确 lock | 已有受信多文件构建器，生成 Program 资产，不创建新 npm 系统 | `scripts/build-program-project.mjs`、`scripts/lock-program-remote.mjs`、`src/ui/program-source.js` | 既有构建合同；本次跨场景未新增 Chrome 证据 |
| Page Classic 单文件 | `// @opendesk-lib axios` / `// @require https://.../fixed.umd.js`；`async function main(){return document.title;}` | 固定 USER_SCRIPT；R7.1 **当前**仍要检查→人工确认获取→审核锁→再运行；**目标**点击 Run 后系统自动准备/固定，无额外依赖审查；不是网站 MAIN | `src/ui/page-dependency-install.js`、`page-dependencies.js`、`src/scripting/user-scripts/dependency-manager.js`、`execution-source.js`、`preview.js` | R7.1 IMPLEMENTED + Node/包 PASS；真实新 CDN 库 Chrome A/B 下载/授权/离线 NOT_TESTED |
| Page React/Vue | `import {useState} from 'react'` / Vue SFC；额外固定静态 HTTPS ESM | 复用已有 React/Vue 固定运行时、审核图与受管挂载/Stop，不重复嵌入框架 | `src/ui/page-component-remote.js`、`page-component-preparer.js`、`src/ui/page-component-compiler-worker.js`、`src/libs/page-frameworks/*` | 已有固定编译/部分浏览器用例，额外库场景需按当前包验收 |
| Side Panel 已安装工具 | `tool.config.json` + HTML/CSS/JS；`OpenDeskTool.request` / 受限 `OpenDeskSDK.browser` | 隔离 iframe 当前加载已打包的一份 JS（Blob），不继承 Controller/页面全局或原生 chrome 权限 | `scripts/build-sidebar-tool.mjs`、`src/ui/sidebar-tools/package.js`、`src/sidebar-tools/bridge.js` | 工具框架已有；通用多固定库文件依次加载/跨程序 SHA 批准仍未接入 |
| 网站 MAIN / Content ISOLATED | 仅明确授权的原生网站交互 / 受信框架 Content | 与 USER_SCRIPT 不同，保持世界隔离；MAIN 不是默认依赖执行目标 | WXT Content、现有 Page 桥 | 不因旧 MAIN 全局而开放新权限 |
| Background / SW | 扩展作者静态 `import` | WXT 受信打包与经过审核的资源；不得执行用户下载 JS | `src/sw.js`、WXT 入口 | 保持受信静态，非用户依赖运行世界 |
| 安装、定时、云控 | 固定 Program Revision + 站点、参数与授权 | **不是新运行世界**。必须使用原安装身份和同一 Authority/RunHost；无网络重复执行 | `src/platform/host/controller-methods.js`、`src/ui/scheduled-task-host.js`、已有 Cloud/Task Runner | 已有服务；新增依赖版本的完整重启/撤权/云控回归待原生验证 |

## 3. 冻结的解决方案（下一轮无需重新讨论）

1. **File-First, NOT Compiler-First**。扩展安装包内的 Classic 文件可直接按执行世界用，预装库无 npm/无 CDN；下载后经系统自动技术校验的 Classic 资源保留独立 SHA 字节，能安全直接加载就不再为其单独 Babel；真正有 import/export 的静态 ESM 才用受信编译器生成对应世界允许的固定执行资产。
2. **不是所有文件都有一个可见的扩展资源 URL**。扩展包中的 `chrome-extension://...` 固定路径与下载后保存在 IndexedDB 的 SHA 资产不同；`chrome.userScripts` 的 `file` 必须是扩展包根下实际文件，不能指向 SHA 虚拟索引；经允许的用户源码走 `code` 或已经受审的 sandbox/Worker 路径。拆分多个 ScriptSource 前必须实际验证错误 fail-stop、先后依赖、Stop 与页面身份，不可无据替换当前 Page 原子代码。
3. **内容字节共享，能力权限独立，锁由系统自动生成**。资源键包含 SHA、URL/版本/MIME/许可证信息；系统按 Program/Revision/world 自动固定完整依赖图，不要求用户 A/B 逐库分别人工批准。同 URL 不同 SHA 不得静默替换固定版本，确有歧义才请用户选择版本；损坏/缺失拒绝，不能静默联网恢复。
4. **复用已有实现**：`runtime-contract.js` / `loader.js` 是预装库真源；`dependency-manager.js` 及 Page Component 依赖方法是存储/校验/版本锁真源；原 RunHost、Authority、Page USER_SCRIPT、Side Panel Tool sandbox 分别是各世界唯一消费者。禁止第二个 Manager/Browser SDK/Runner/工具宿主。
5. **Standard/Developer**：Standard 不带约 4 MB 的浏览器编译器，Classic 与固定程序照常可用；Developer 使用已打包固定 Babel 处理小型 ESM；大型图走现有受信本地项目构建器，不将 Babel 偷塞进 Standard。
6. **AI-first / Run-first**：AI 或用户写代码→点击 Run→系统自动解析、获取/复用、校验并固定库→返回真实结果→按需保存或授权安装。**不增加人工逐库审核向导**，技术图/SHA/许可证放在可选详情。程序能力/站点/安装/定时/云控才是授权对象，不是 JS 文件。
7. **安全合规**：Chrome 来源/网站权限、程序可调用的敏感能力、安装身份互不替代；开发时免人工库审查不会扩大任何一个权限。对 Chrome MV3/Chrome Web Store 的适用远程代码政策做单独证据核查；Worker/沙箱本身不等于发布合规。Node/CJS/WASM/CSS/dynamic import/循环图/顶层 await 按真实支持程度拒绝或转受信构建；已支持的不要误拒绝。

## 3.1 最终技术取舍：原生执行优先、File-First、按需编译（冻结）

**采用 C 方案，不采用统一远程 `script.src`，也不把 Classic JS 统统送 Babel。** 这是本文件第 3 节的细化，不创建第二个 Dependency Manager 或新 Host。

| 方案 | 结论 | 关键理由 |
| --- | --- | --- |
| A. 在目标网页 `document.createElement('script').src = CDN` | **不作 OpenDesk 默认依赖加载方式** | 默认进入网站 MAIN 世界，可能被页面 CSP/网站代码干扰；与受控 USER_SCRIPT 的 JS 全局隔离，难以保证离线固定版本；普通远程脚本注入也有 CWS 远程代码合规风险 |
| B. 每个 JS 都下载、打包和 Babel 编译 | **不一刀切** | Classic 通常无需编译，大型编译器及重复转换不应成为普通 Run 的成本 |
| C. 原生 API + 直接执行合适的固定 Classic 字节 + SHA 复用 + ESM 必要编译 | **唯一默认执行方向** | 复用 Chrome、现有 SHA 资产库、Authority、RunHost、Tool 沙箱；按世界确定加载方式，兼顾简单与可重复使用 |

此前 62/83/96 分属于**未实测方案估计**，不能写为产品验收结果。“95+”是有条件的目标，只有与指定源码及原生证据绑定后才能评分。

### 执行世界与装载方式（每个场景唯一宿主）

| 场景 | 推荐加载方式 | 禁止误用 |
| --- | --- | --- |
| 扩展预装 Classic | `src/libs/runtime-contract.js` 唯一 Catalog、固定扩展资源文件和 `loader.js` SHA 校验；Chrome `userScripts.js.file` 只指向扩展包根目录下真实资源文件 | 不能把 IndexedDB 缓存 key 伪装成 `file`，不联网重复获取内置包 |
| Page 新 Classic JS / `@require` | Run 自动通过现有 `dependency-manager.js` 获取/复用并验证原字节，绑定 program/world 技术锁；使用原 `chrome.userScripts.execute` 的 `USER_SCRIPT` 世界及受控 `js:[{code}]`，保持当前原子 fail-stop；**不经过 Babel** | 不使用网站 `document.head.appendChild(<script src=CDN>)` 作为默认路径；不要把 MAIN `window` 和 USER_SCRIPT `globalThis` 混用 |
| Page React/Vue 与 ESM | 继续使用现有 Developer 固定 Babel/linker 和受管 UI/Stop；Standard 不加浏览器编译器，大项目使用既有受信本地构建器 | 不运行未经固定的动态 ESM 图 |
| Controller Classic / ESM | 复用 RunHost → Authority → 当前受控 Worker；Classic 仅在库无需 window/document/eval 且执行环境、CWS 边界允许时使用原固定代码；ESM 走已有 linker，维持零参 `main()`、词法 `page/params` | 不把用户下载 JS 放进特权 SW/Host；Worker 不是自动获得 CWS 豁免 |
| Side Panel 独立工具 | 原 opaque sandbox iframe；工具的多份固定 Classic 资源可从已验证本地字节创建 Blob URL，按声明顺序加载并等待 `onload/onerror`；ESM 先可信构建为固定资产 | `bridge.js` 已存在的本地 Blob `script.src` **不是**允许远程 CDN `script.src`；不开放宿主 chrome.* |
| 后台 SW、Content | 只保留可信静态打包入口 | 不动态运行用户下载的远程库 |
| 已安装、定时、云控 | 原已安装固定 Program Revision、依赖闭包和 Authority；从经过核验的本地 SHA 资产离线运行 | 不在调度时从 CDN 重新获取、重新编译或静默升级 |

**边界**：普通网页的 `script.src` 是可用的浏览器原生下载方式，但其目标 MAIN 世界、CSP、网站脚本及 CWS 条件与受控 USER_SCRIPT/Worker/Tool 不同；“标签加载成功”不等于 OpenDesk 指定世界返回了真实执行回执。只有明确需求与独立风险评审后才可考虑显式 MAIN 兼容模式，绝不作为默认绕行。

### 用户一次 Run / 安装 / 离线的执行合同

1. 草稿 Run 是用户的执行意图；按**预装资源 → 本程序已固定 SHA → 同来源已验证共享 SHA → 必要的首次受控获取**优先级解析。Classic 原字节直用，静态 ESM 才按需编译；保存首次实际 URL、响应 MIME、原始 byteLength、SHA-256、版本和依赖图。自动生成属于当前 programId、world、Revision 的技术锁，**不出现逐库人工审核向导**。
2. Run 无合法 Chrome 源/目标网站权限时，仍必须从**真实用户手势的同步调用栈**调用 `permissions.request()`；可事先只读预热。若检查晚到而手势已失效，只允许显示明确的必要权限操作，不虚构“单击就授予”、不暗中重新播放业务代码。
3. A/B 可以共享完整 SHA 字节，但绝不复用站点、能力、安装或云控授权；B 允许系统自动固定独立技术锁，不能凭借 A 的授信获得执行权。缺失或冲突的精确版本不得静默选 `latest`。
4. 保存/安装冻结 Author Source、执行字节/图、SHA/lock、Program Revision；正式安装需确认站点、数据、能力、定时或云控范围。整个 Chrome 退出重启、断网后的已安装重复运行不得重新联网、重新编译或变更旧锁。HTTP 缓存不能替代内容寻址的固定版本资产。
5. 多库同步顺序、运行异常传播和 Stop 保留现有原子保障；没有同一扩展包的真实 Chrome 证明，不因 File-First 就把多个 ScriptSource 设为默认。坏 SHA/缺字节/撤权/重定向/私网/未知 Native effect 失败时必须阻断，不隐式重新下载或重放。
6. 按执行世界分别审查 Chrome MV3/CWS 远程代码规则：User Scripts API 的特定例外只适用于按文档目的提供的用户脚本，不扩展至特权 Host/SW/普通远程 `<script>`；sandbox/Worker 不自动等于可上架。必须保存真实合规判断与阻塞项。

官方参考：
- https://developer.chrome.com/docs/extensions/reference/api/userScripts （`execute`、`USER_SCRIPT/MAIN`、`ScriptSource.code/file`）
- https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements （远程代码限制及 User Scripts 特定用途）
- https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code （普通远程脚本与特殊 API 的区别）

### 八维 95+ 评分所需证据

逐项衡量：易用性（Run 与 Chrome 真正权限点击次数）、库覆盖（真实 Classic/ESM 原函数）、执行场景（Page/Controller/Tool/安装/定时/云控）、缓存效率（原始网络次数与 SHA 字节）、安全（分权和撤销）、诊断（准确错误码与恢复）、真实测试充分性（Node/包/Chrome/Mac 分级）、架构复用（唯一 Manager/Host）。D01–D12 的 sourceHash、lockId、runId/resultId、packageHash、Chrome 版本、下载次数和重启离线回执必须真实保存。无证据不能自评 95。

## 4. 最小用户闭环和测试分母

| Case | 用户真实操作/输入 | 通过条件 | 必须保留的证据 |
| --- | --- | --- | --- |
| D01 预装 Classic | Controller 用 `_`、`dayjs` | 真实函数成功；依赖下载=0；无网站 MAIN 全局污染 | 主包 hash/ABI、runId/resultId、零网络计数 |
| D02 新 Classic Page | 新的固定 Classic UMD（可用 `marked@15.0.12` 作为**待网络核对候选**，不假定 URL 有效） | 普通「开发」用户只点 Run→系统自动准备/固定 SHA→运行真实导出函数；仅缺失真实 Chrome 权限时可弹原生许可，无逐库审核 | URL/response/MIME/bytes/SHA/许可证/approval/真实 Result |
| D03 Classic 程序 A/B | 两个 `programId` 使用相同经系统自动验证的 URL+SHA | B 不用重复人工批准同一库；系统复用 A 的相同字节并自动为 B 生成不同固定锁，下载 0 次；B 的程序能力不继承 A | 原始 fetch 计数、两个锁/namespace/程序 ID、额外库人工审核次数=0 |
| D04 新 Controller ESM | `@vanillaes/csv@4.1.3` 上游三个真实 ESM 文件 | 真正运行库函数，结果 `count=2,total=21`；缺锁/错 SHA/错导出一律失败 | 三模块原始 SHA、图/lockId、runId/resultId |
| D05 Controller Classic 新库 | 自己代码选用的新 Classic 库自动准备到受控 Worker 世界 | 不再要求每次 ESM 编译；与 Page 共享 SHA 字节但不共享程序能力/执行世界；无需再次人工批准库；没有 chrome API | 真实 Worker 输出、系统自动独立固定锁与 Stop |
| D06 Page React/Vue + 第三方 | 真实组件 import 新固定模块并触发交互 | 数据/DOM 更新、Stop 后外部 DOM/监听器全清理 | 实机截图/节点快照、Stop receipt、源和包身份 |
| D07 Tool 多库 | AI 创建工具，含两份固定 JS，点击安装和打开 | 沙箱按序执行，只有本工具许可的 OpenDeskTool/SDK，不暴露 chrome.*；卸载干净 | 工具包 SHA、依赖锁/次序、UI 与权限回执 |
| D08 版本生命周期 | 保存 A r1，再升级依赖为 r2 | 老 r1 保留旧资产、r2 新锁，卸载 r2 不误删 A/r1 或他人资源 | Revision/sourceHash/lock/asset references |
| D09 重启离线 | 彻底结束 Chrome 并断网；重新打开已安装程序 | 不发起 CDN 获取、不重编译；结果一致、SHA/锁校验通过 | 真实 Chrome profile、网络计数、runId/resultId |
| D10 定时云控 | 用同一已批准安装版本执行两种触发 | RunHost/Authority 仍做站点和版本授权；撤权阻断；未知效果不重放 | FireId/云任务身份/源哈希/运行结果 |
| D11 失败安全 | 坏 SHA、重定向、私网、源变更、取消准备、撤权 | 原子拒绝、不偷偷回退到网络/另一个 Program 锁、不执行部分未知代码 | 错误码、下载计数、资源退役/Stop |
| D12 双版本与合规 | Standard、Developer 同候选分别构建与运行 | Standard 编译器物理缺席；Developer 固定资源通过；不同世界符合当前适用政策 | Build/package/ZIP hash、真正 Chrome 而非模拟 |

**测试层级必须分开**：SOURCE/UNIT_PASS、BUILD/PACKAGE_PASS、CFT Chrome PASS、用户 Mac Native PASS、安装/重启/离线 PASS、CWS COMPLIANCE REVIEW。之前某个 SHA 的 CI PASS 不是新候选 Chrome PASS；没有原始证据不填写“95分达标”。

测试入口：`tests/environment/controller-esm-runtime-r4.test.mjs`、`tests/environment/page-dependency-r71-ui.test.mjs`、`tests/environment/dependency-manager.test.mjs`、`tests/environment/page-component-dependencies.test.mjs`、`tests/framework/page-browser-worker-r243-cft.mjs`、`tests/framework/sidebar-tools-native-session.mjs`、`tests/framework/scheduled-tasks-r1-native-mac.test.mjs`。实际 Page 测试网页：`examples/tasks/demo-form.html`，受信本机 HTTP 服务见 `AGENTS.md`。

## 5. 2026-10-13 核查时的进度基线（**历史快照，不能覆盖未来 main**）

- **已有**：旧源码快照与迁移记录；默认/可选内置库 SHA；Page 受控 @require；R4 Controller 小型 ESM；R7 SHA 跨程序字节来源索引；R7.1 Page Classic 首次依赖安装 UI、每程序锁与依赖共享来源展示；React/Vue 固定运行时；工具单 JS 沙箱；Saved/Task 既有 Runner。
- **已有定向证据**：`docs/framework/workstreams/universal-dependency-file-first-r7-20261013.md` 的 R7.1 实现提交 `bc6dc46a` 和补丁 `d61eea48`、Node/构建成功 CI `38352293156` / `38352293233`。R24.5 的 macOS Chrome 基础 Side Panel/React/Vue PASS **没有覆盖新 CDN Classic/A/B 审核**。R4 中 @vanillaes/csv 真实上游源码编译测试有 Node 记录，不推导 Chrome。
- **未正式关闭**：D02/D03 直接 Run 自动准备、无多步人工依赖审批及实际 Chrome 首次下载/第二程序离线复用、D05 Controller 新 Classic、D07 工具多库、D08–D10 安装/重启/离线/定时云控/撤权全链路、D11 跨世界失败安全、D12 Chrome Web Store 合规。新增代码前重新核实最新 `main`，此清单不是永久完成态。
- **官方依据**：`https://developer.chrome.com/docs/extensions/reference/api/userScripts` 和 `https://developer.chrome.com/docs/webstore/program_policies`；不可把文件式加载偏好误写成允许任意远程代码在扩展特权页运行。

## 6. 新对话的唯一工作入口

1. 先读 `AGENTS.md`、`docs/framework/testing-guide.md`，然后本合同及 R7 工作流，再读实际相关源码。
2. 以 D01–D12 用户代码、执行世界、授权身份及**原始测试**决定缺口；已有且证据相同直接复用，不重做。
3. 新增能力先扩展既有模块和 UI；不能只更新 MD 或重复设计架构。
4. 下一轮实施合同：`docs/framework/prompts/goal-universal-dependency-runtime-r7.2-scenario-first-20261013.zh-CN.md`。