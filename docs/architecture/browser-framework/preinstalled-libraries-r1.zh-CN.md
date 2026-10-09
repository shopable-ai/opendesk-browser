# OpenDesk Browser：预装第三方库与零配置脚本运行环境 R1

> **状态：产品/架构决策及实施验收合同，尚未实现运行时代码，不能宣称普通用户当前已可用或已得 95 分。** 核心用户是安装扩展后在 Sidebar「开发」直接写代码的人；扩展维护者一次性集成库，不要求每个普通用户安装 npm、维护锁文件、启动 Codex/MCP 或上传 JS 包。

## 0. 结论优先：为什么旧 R9.1 定位不正确

- **核心产品需求不是修复 Background 缺失 npm，而是框架预装通用第三方能力。** 旧 `src-bex` 的库已经在旧 `background.js` 中通过 TS import 打包，另有 `background-sw.js` 的旧全局 `importScripts`、Content ISOLATED 和页面 MAIN 动态注入；不能把这三者混为用户脚本的默认库。
- **框架预装 ≠ 注入 Background。** 对普通用户，主要消费位置是 Controller opaque sandbox Worker 和 Page USER_SCRIPT。把 Lodash 直接放进 `src/sw.js` 并不会让用户在这些世界读到它，还会增加已经接近上限的 SW 体积。
- **建议采用一个内置库目录/注册表、不同运行世界的固定加载适配器**，所有库在编译/发布扩展时本地构建、校验和打包；普通用户安装扩展即具备这些能力，在**明确运行脚本**时自动装载相应库，不在每个网页打开时盲注入。
- `examples/programs/page-npm-lodash` 仅是用户项目 npm 能力测试，不得作为内置库交付证据。普通 Sidebar 代码必须无需 `import` 即能使用内置 API。
- **安全版本纠错：不要把旧 4.17.21 内置到新扩展。** 截至 2026-10-10，Lodash `<=4.17.23` 已有原型污染和 `_.template` 代码生成相关漏洞公告；推荐从 `lodash-es@4.18.1` 的**审计过的方法白名单**生成运行时，不盲发布完整任意方法表。来源：GHSA-f23m-r3pf-42rh、GHSA-r5fr-rjxr-66jc 和 lodash-es 4.18.1 官方发布。Day.js 候选为 `dayjs@1.11.23`；所有锁与实际字节在首次代码实施时核对。
 
## 1. 普通用户需要看到什么

目标：Sidebar「开发」仍是一个普通 JavaScript 编辑器，不增加 npm/库设置 Tab、安装依赖/审批版本操作，也不要求使用自定义工具包功能。

**Controller（运行草稿）**，零 import：

```js
async function main() {
  const title = await page.title();
  return {words: _.words(title), today: dayjs().format('YYYY-MM-DD')};
}
```

**网页 Page（在当前网页试运行）**，零 import：

```js
async function main() {
  return {text: _.trim(document.querySelector('h1')?.textContent || ''),
    today: dayjs().format('YYYY-MM-DD')};
}
```

公开的稳定 API 为 `globalThis.OpenDeskLibs`（版本化、只读的对象属性），内含 `lodash` 与 `dayjs`；在 Controller 和 USER_SCRIPT 自有新隔离世界，额外以 **`_` / `dayjs`** 做零配置简写。跨用户脚本不得共享同一可变库单例；只有框架固定加载器可以安装这些名字。如脚本本身声明同名局部变量，正常词法遮蔽，不改动脚本正文。绝不修改网站 MAIN 的 `window._`、`window.$`、`window.dayjs`。

建议编辑器仅在辅助说明/代码示例加入“内置库：Lodash、Day.js；更多...”的轻量文案，**不建立第二个依赖配置面板**。错误时写清楚库 ID/版本及运行世界，详细哈希只在开发诊断查看。

## 2. 默认目录的取舍

| 等级 | 库/能力 | 暴露给用户的 API | 执行世界/策略 | 决策 |
| --- | --- | --- | --- | --- |
| **基础常驻（仅在脚本真正运行时装载）** | `lodash-es@4.18.1` 的常用函数白名单 | `_.get/has/set/words/trim/uniq/uniqBy/groupBy/sortBy/orderBy/cloneDeep/isEmpty/values/pick/omit/chunk/debounce/throttle/escape/truncate` 等，以测试清单为准 | Controller + Page USER_SCRIPT | P0；非完整 Lodash API。禁用未审计的 `template`、任意运行时代码生成接口 |
| **基础常驻（同上）** | `dayjs@1.11.23` 固定核心及明确需要的安全插件 | `dayjs().format(...)`；`OpenDeskLibs.dayjs` | Controller + Page USER_SCRIPT | P0；不能声称完整 Moment 兼容，插件及 locale 要有声明 |
| **预装但不自动执行** | 已在 `src/vendor/jquery-3.7.1.min.js` 的 jQuery 3.7.1 | `$` / `jQuery` | Page USER_SCRIPT only | P1；页面工具使用一行 `// @opendesk-lib jquery` 显式选择，扩展中无需安装；不可注入 MAIN，也不占用普通用户的 CDN `@require` 审核锁 |
| **预装可选候选** | DOMPurify（需选择版本并审查 Apache-2.0/MPL-2.0 条款） | `OpenDeskLibs.DOMPurify` | Page USER_SCRIPT only | P2；含 DOM 依赖，不允许引入 Controller/Background |
| **框架已经具备的受限网络服务** | 现有 `axiosx`、`createNetworkService` | Controller 既有 `axiosx.get/post` | 现有 Broker/Authority | **复用，不额外暴露无限制 Axios**；Page 必须通过独立权限服务，不能因为“内置库”而解锁跨域权限 |
| **不作为默认库** | Moment、Cheerio、FingerprintJS、CryptoJS、Socket.IO、Vue/React、完整 Axios | — | 按真正用户需求、世界和权限另行审核 | Moment 体积/时区语义、Cheerio 环境、Fingerprint 隐私、Crypto 原生替代、Socket 网络权限及框架资源均不适合盲预装 |

这里“默认”是**扩展包内开箱可用且实际运行脚本时自动注入**，不是打开网站立即执行所有库。固定 CORE API 的大小和成本需用实际 build receipt 决定，不承诺某个未经测量的字节数字。

## 3. 唯一内置目录、双运行时的架构

```text
扩展维护者（一次性）
  repo 根 package.json + package-lock.json（精确、经安全审核的依赖）
           │
   src/runtime/builtin-libraries/catalog.js   [版本/API/世界/产物/许可证/哈希合同]
           │
           ├── Controller adapter [当前固定 WXT Worker runtime]
           │    src/scripting/sandbox/worker-runtime.js
           │      → 预装安全模块到当前独立 Worker globalThis
           │      → 现有 AsyncFunction 动态用户 body [不新增第二个执行器]
           │
           └── Page adapter [新的经批准 WXT 自包含固定脚本]
                src/entrypoints/builtin-page.js → src/runtime/builtin-libraries/page.js
                  → dist/.../libraries/page-core.js
                  → chrome.userScripts.execute/register 以 USER_SCRIPT、正确 worldId
                  → 校验 ABI 与 readiness，然后才运行现有用户 JS

用户安装扩展后：
  Sidebar 手工 JS → 现有 Controller / Page → 固定内置库自动可用
  复杂本地项目 → 现有 LocalDevResolver/Webpack（npm/HTTPS 仍是高级自定义能力）
```

- **先执行原 Runner 的权限/宿主/目标校验，再装库**；不能在普通网页打开时向全站注入 JS。
- **Controller**：由 `worker-runtime.js` 这一已存在的固定 WXT 入口静态引用核心库，在每个 opaque sandbox Worker 安装只读 global descriptor；`controllerProgramBody` / 现有 `AsyncBody('page','params',...)` 不需要另建脚本执行器。依赖只活在 Worker realm，不能触达 `chrome.*` 或扩展私有 Storage。
- **Page**：新增一个**固定、可审查的 WXT 构建入口**，更新 `scripts/build-contract.mjs`、`wxt.config.mjs` 的固定入口数及 `scripts/verify-package.mjs` allowlist/哈希，不复用特权 SW 存储或在 SW 里 `eval` 第三方脚本。现有 `src/scripting/user-scripts/preview.js` 与 `execution-source.js` 在同一获准 USER_SCRIPT world 中先放置固定 CORE ScriptSource，再放用户脚本；**必须在真实 Chrome 验证顺序保证**，消费者有显式 ABI/ready 守卫，失败不执行用户正文。已审核的 `@require` 锁接在 CORE 之后、用户正文之前，不因为 CORE 而扩大远程 URL 授权。
- **版本/身份**：目录含 `id/version/apiLevel/worlds/bundlePath/sha256/license/exports`；每次运行另记录 `catalogHash` 与完整可执行体身份，用户源码 `sourceHash` 本身不假装包含库字节。正式 Task/Candidate 固定 `apiLevel` 和所需库版本。扩展更新后不同版本不可悄悄改变已验证任务的行为；旧版本不可用就报 `E_BUILTIN_VERSION_UNAVAILABLE` 并引导重新验证，不暗中执行旧的有漏洞包。
- **错误模型**：缺固定资源、哈希变化、同名全局冲突、执行世界不符、未就绪、版本不匹配分别明确错误码；不能默默使用目标网站现有 `window._` 或未知 CDN。
- **不向 MAIN 暴露库**：默认 `USER_SCRIPT` 和独立 Controller Worker；网站 MAIN 代码与用户库相互隔离。不自动改 `web_accessible_resources` 为所有站点可直接调用。扩展固定 Content/MAIN SDK 自己需要的内部包仍可通过构建期静态 import，但**不是公开的用户库全局**。
- **体积预算**：保持现有 `sw.js` 320KiB 硬上限；不可增加 SW 实际常驻代码为用户库买单。Page 固定 CORE 独立打包；Controller 库只增加 Worker runtime 的固定产物。源码/工件限制原样保留；库增加的每个固定文件必须在构建与 ZIP 验证内有独立字节/哈希/许可证证据。
- **升级**：扩展版本固定资产和目录；安装升级按安全公告评估。`lodash-es@4.17.21` 仅可作为历史测试快照，不能再宣传为安全默认运行库。旧例子的迁移与变更行为需测试，不静默拿旧 demo 版本当产品版本。

## 4. 实施优先级：先用户真能用，不先造商城

**P0-A：最小可用 CORE（必须先交付）**

1. 新增唯一内置库清单、精确根 npm 锁和供应链检查；以 `lodash-es@4.18.1` 审核常用安全函数，以 `dayjs@1.11.23` 为日期核心候选，真实 `npm ci`/WXT build 和 license 核验。无 npm/网络/构建环境时只写方案，不手写假 package-lock。
2. 复用 `src/scripting/sandbox/worker-runtime.js` 注入 `_`、`dayjs`、`OpenDeskLibs`；Controller 手工 `async function main()` 可直接调用，无 new Function 的新增授权表面。
3. Page 同样提供零配置 `_`、`dayjs`、`OpenDeskLibs`；补 `src/scripting/user-scripts/preview.js`、`execution-source.js` 和 Page Candidate 的共用固定加载规则；复用既有 USER_SCRIPT 验收/授权，不修改页面 MAIN。
4. 不新增 Sidebar 依赖 Tab、用户 npm 安装入口或动态 CDN 下载。更新简短编辑器示例、内置函数支持表和 `E_BUILTIN_*` 错误文案。

**P1：内置 jQuery 按需**

对已有 `src/vendor/jquery-3.7.1.min.js` 做目录登记和最小 `// @opendesk-lib jquery` 声明解析；只有目标 Page 需要它才注入，禁用 MAIN；不要求用户填写 CDN URL、下载文件或批准第三方版本（扩展开发者发布时已固定），但用户仍须批准目标网站执行。保留旧 `@require` 的有限审核兼容；两者冲突必须明确拒绝或去重，不能加载两次。

**P2：可选专项库**

DOMPurify、HTML 解析、URL/编码等，按实际普通用户脚本需求和单独性能测试批准；不是回填旧 Background 17 个脚本，不引入库商店/通用远程模块执行器。

## 5. 反方审计（红队必须能阻止上线）

| 反方质疑 | 风险 | 正确门槛 |
| --- | --- | --- |
| “框架有 Lodash，直接 `import` 到 SW 不就可以？” | 用户 Controller/Page 不共享 SW global；SW 已接近体积上限 | 必须在**每个实际用户执行世界**证明 `_.get` 生效，SW bytes 不因用户库上涨 |
| “打开网页时全站注入 $`_/$` 最简单” | 网站冲突、跟踪面、性能及权限扩大 | 无脚本运行时页面 MAIN 绝对不加载；含用户脚本也不改 MAIN globals |
| “把 4.17.21 历史文件直接复制到 vendor” | 已知 2026 原型污染/模板注入漏洞 | P0 锁定已修复版，审计危险 API 和完整依赖图 |
| “默认全套 Lodash、Axios、Moment、Cheerio...” | 重复代码、CSP/DOM 不兼容、网络权限混淆 | CORE 函数白名单+Day.js，已存在 axiosx 走 Broker，其余仅在验证后按需 |
| “用户独立 `const _` 会与隐式 API 冲突” | 代码重声明/脚本运行失败 | 控制在各自 realm 的 global descriptor，普通 lexical shadowing；严测全局冲突与只读性 |
| “注入库早于脚本即可证明准备完成” | Chromium js 数组顺序、跨源错误、库失败后脚本继续执行 | 官方 ScriptSource file/code + 同世界 ABI/ready 守卫 + 真实 Chrome 执行顺序/失败验收 |
| “任务 sourceHash 没变，就不必记录库升级” | 扩展更新导致已验证脚本语义改变 | catalogHash + runtime version 写入不可变 Task/执行回执；不匹配必须重新验证 |
| “预装 Axios 直接 axios.get 就能跨域” | 绕过现有审批/目标/网络日志及凭证策略 | 只能沿既有 axiosx/Authority 网络能力，库不是权限 |
| “Page 小脚本不需要额外安全限制” | jQuery/DOMPurify 可读写获准网页、用户代码本身也有风险 | 网站权限仍单独确认；库运行世界不改变授权范围，代码错误与撤权行为分开回归 |
| “CI Node 输出正确就算真可用了” | Sandbox Worker、USER_SCRIPT 原生世界和 Sidbar 操作可能不同 | Chrome 扩展包真实安装 + Sidebar 手工 Controller/Page 实测；无回执不得宣称 95+ |

## 6. 95+ 验收规则（方案目标，不是假评分）

| 项目 | 满分 | 合格必需证据 |
| --- | ---: | --- |
| 普通用户零配置体验 | 25 | 在干净 Chrome + Sidebar 直接贴 2 段最简 `main`，均运行成功；未使用 npm/MCP/导入文件 |
| Controller + Page 双运行世界 | 25 | Worker 隔离、USER_SCRIPT worldId、权限目标/文档、报错/重试/重启及运行回执真实通过 |
| 依赖安全/升级/授权 | 20 | 锁定修复版、供应链+许可、哈希/ABI/碰撞、无 MAIN 泄漏、旧 Task 不静默错版 |
| 体积/速度/资源 | 15 | 原 SW 体积限额与 package verifier 不回退；真实测量 CORE 增量/每次脚本启动开销；用户未运行时无注入 |
| API 与文档一致性 | 15 | 一张简洁内置库清单、实际代码示例、错误说明、可复制测试；旧文档不再要求普通用户 npm |
| **总分** | **100** | **95+ 且全部 P0 通过才可宣布正式验收** |

任何 P0 失败最高 89 分。没有运行时代码、实际扩展安装和 Chrome 回执时，无论方案设计多好，都只能标为 **DESIGN_APPROVED / IMPLEMENTATION_PENDING**。不拿旧 R9 的 page-npm-lodash/npm 构建 PASS、局部 Chromium DOM 试验或文档提交冒充内置功能已交付。

## 7. 现有文件落点与不做的事情

- 改：根 `package.json` / `package-lock.json`；固定库 catalog；`src/scripting/sandbox/worker-runtime.js`；`src/scripting/user-scripts/{preview,execution-source,page-program-package}.js`；现有 `src/entrypoints` 的固定编译入口；`scripts/{build-contract,build,verify-package}.mjs`；相关测试/产品示例。
- 保留：`src/sw.js` 唯一 Broker/Authority、现有 `RunHost`、UserScripts 准入、Controller Sandbox、项目级 npm 高级工作流、`src/vendor/jquery-3.7.1.min.js`。
- 不做：另造依赖安装 UI、用户每次 `npm install`、运行时 CDN/npm、全站 MAIN 注入、开机加载全部大库、绕开 SW 预算、复制所有旧 libs 或创建第二个 Broker。

**本文件作为产品决策/目标合同已写入仓库并不能直接变成可用功能。** 下一阶段必须修改上述运行时代码并进行真正的 Node/Chrome 质量门验证。
