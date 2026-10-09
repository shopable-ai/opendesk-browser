# GOAL：OpenDesk Browser R15 Built-in Libraries R1 —— 框架预装常用库、Sidebar 零配置使用、双运行世界闭环与 main 真实验收

## 一、任务性质：直接实施，不是再写一份方案

你担任 Chrome MV3 / WXT / npm 与供应链 / Sandbox Worker / Chrome userScripts / Controller / RunHost / Sidebar UX / Playwright / 安全红队 / Git 主干集成联合负责人。

仓库：https://github.com/shopable-ai/opendesk-browser
本机目录（仅实际存在时使用）：/Users/shopme/Documents/workspace/opendesk-browser
默认中文。结论优先，先报告文件位置、可用代码和测试结论，再写技术过程。

**产品角色不能再搞错：我是浏览器扩展框架的开发者。由我在开发、构建、发布扩展时统一选择、锁定并预装第三方库；普通用户安装扩展后，在 Sidebar 的“开发”里直接写 JavaScript 就应能使用常用库。普通用户不安装 npm、不维护 package-lock、不上传构建包、不连接 Codex/MCP，也不需要配置一个依赖选择器。**

本轮依据（按优先级）：
1. AGENTS.md 与实际最新 main 代码、现有权限/回执/构建契约。
2. docs/architecture/browser-framework/preinstalled-libraries-r1.zh-CN.md（唯一正式产品设计和红队验收依据）。
3. docs/architecture/browser-framework/background-dependencies-restoration-r1.zh-CN.md（旧 src-bex 的 npm 打包、Background importScripts、Content/MAIN 三路重复加载，不能混作用户环境）。
4. docs/architecture/browser-framework/third-party-library-map.md、docs/product/program-development-dual-format-and-sidebar.zh-CN.md。
5. docs/framework/testing-guide.md 与相关工作流/原始 Chrome 证据。

必须避免先前两种错误：一是把 Page npm 示例当 Background/框架全局迁移证据；二是把框架用户变成需要每人自行 npm install 的开发者。

## 二、最终可见功能：P0 必须真实打通

用户在 Sidebar“开发 → 运行草稿”直接执行以下 Controller JavaScript，不用导入和项目配置：

    async function main() {
      const title = await page.title();
      return {
        title,
        words: _.words(title),
        today: dayjs().format('YYYY-MM-DD')
      };
    }

同一编辑器的“网页 JavaScript 试运行 → 在当前网页试运行”直接执行以下 Page USER_SCRIPT：

    async function main() {
      const title = document.querySelector('h1')?.textContent ?? '';
      return {
        title,
        normalized: _.trim(title),
        safe: _.escape(title),
        today: dayjs().format('YYYY-MM-DD')
      };
    }

验收必须检查真实返回值、实际 Chrome 执行世界和原 RunHost/Page 回执。Controller 的 page 是自动化代理，Page 的 document 才是 DOM；不能用其中一个世界的成功冒充另一个。普通用户任何情况下都不得被要求运行 npm、上传 JSON 或修改扩展源码。首次必要的网站授权及 Chrome“允许用户脚本”开关照常保留。

建议 API：
- OpenDeskLibs：固定版本的只读目录，包含 lodash 与 dayjs 及受控版本信息；
- _ 和 dayjs：Controller 与 Page USER_SCRIPT 的零配置简写；
- Lodash 默认先提供真实被测试的纯工具子集，如 get/has/trim/words/groupBy/uniq/uniqBy/sortBy/orderBy/isEmpty/cloneDeep/values/pick/omit/chunk/escape/truncate；是否包含 set、debounce、throttle 取决于安全/资源生命周期测试，不假装整套 Lodash API 已提供；
- Day.js 先提供真实需要的核心格式化能力，插件/locale 按需审核；不得承诺完整 Moment 兼容；
- _、dayjs、OpenDeskLibs 在用户隔离世界存在，但不得在网站 MAIN 上制造 window._ / window.dayjs / window.$。

**P0 只有同时打通普通手工 Controller + 普通手工 Page 才算完成。** 本地多文件项目、冻结 Task、已有 Page 候选、受管 UI 也应依据其正式运行入口正确继承同一运行时；如正式安装 Page 现有流程本身未实现，明确记录边界，不可伪造功能。

## 三、开发者一次预装，普通用户零配置

1. 在扩展根 package.json/package-lock.json 引入经安全审计和真实 npm 安装的精确锁版本。Lodash ES 候选 4.18.1、Day.js 候选 1.11.23；执行时查官方 npm 版本与 GitHub Security Advisories，尤其 GHSA-f23m-r3pf-42rh 与 GHSA-r5fr-rjxr-66jc（<=4.17.23 受影响）。不得采用旧 4.17.21 当默认安全库，不手写伪造 npm lock，不直接复制过时的 min.js。
2. 以一个受控的内置库 catalog/contract 定义库名、真实 npm 版本、有限公共 API、许可、可使用的执行世界、固定运行资源路径、ABI/hash。扩展构建时由已存在 WXT/Vite/Rollup 转成可信固定字节。禁止运行时 CDN、动态 npm、第三方 loader/eval、任意仓库脚本自动进入特权 SW。
3. Controller：优先修改 src/scripting/sandbox/worker-runtime.js 与确有必要的原固定入口，让自有 opaque sandbox Worker 运行用户正文前在该 Worker realm 安装只读库对象。继续使用原有 AsyncBody、PageProxy、Authority、RunHost 和资源回收；不新增第二 Worker 执行器、Broker 或任意 chrome 权限。
4. Page：在 src/scripting/user-scripts/preview.js、execution-source.js、page-program-package.js 等**现有真实执行链**中，加载经 WXT 打包的可信固定库资源并在相同已授权 USER_SCRIPT worldId 下运行用户正文。可评估 chrome.userScripts.execute / register 的 ScriptSource.file 与 code 固定顺序，必须与已有依赖锁及完整执行代码身份绑定。优先清晰的 library ready/ABI/hash 门槛，库加载失败时绝不运行用户脚本。不得为了注入库而另分配额外 USER_SCRIPT 世界或消耗每文档最多六个预览世界的额外名额。
5. 每个脚本运行引用唯一的已发布 builtinCatalogHash、库 API 级别与固定字节；原用户源码 sourceHash 不代表库版本。扩展升级后的旧 Candidate/Task 需要版本核对和安全保守迁移：不可悄悄以不兼容新库执行旧任务；不能为了保留旧版本而继续暴露有漏洞的依赖。
6. 保留现有 src/vendor/jquery-3.7.1.min.js 及精确许可、SHA-256、原依赖锁。P0 优先完成 Lodash/Day.js；P1 在不破坏 P0 的前提下，允许 Page 用户用简单、静态的单行声明（例如 // @opendesk-lib jquery）按需使用已预装 jQuery，避免新增复杂选择器/UI 和运行时外网下载；处理与旧 @require 锁的冲突和二次加载。Controller 不默认装 jQuery，MAIN 不开放任意依赖。
7. HTTP/API 仍使用原 axiosx → Broker → Authority → network。第三方库不是网络/网站权限许可。不要引入完整 Axios 让用户脚本绕过受控权限。DOMPurify、Cheerio、Moment、Socket.IO、FingerprintJS、Vue/React 等留作后续明确需求的选配，不在本轮盲目全量预装。

## 四、构建落点与边界

核对并按最小修改触及：
- package.json、package-lock.json；
- src/runtime/builtin-libraries/（仅一个清晰的 catalog/版本合同及运行环境适配器，按需新建）；
- src/scripting/sandbox/worker-runtime.js、src/entrypoints/worker-runtime.js；
- src/scripting/user-scripts/preview.js、execution-source.js、page-program-package.js、必要时其正式 Candidate 服务；
- 新 Page CORE 固定 WXT 入口（仅在经实际评估确有必要时新增），scripts/build-contract.mjs、wxt.config.mjs、scripts/build.mjs、scripts/check-source.mjs、scripts/verify-package.mjs、固定 ZIP/许可证/哈希清单；
- src/ui/script-editor.js 等只做简洁代码示例或帮助说明，不增加“管理依赖”Tab；
- tests/environment/ 和必要的真实 Chrome 测试用例；使用指南和本轮执行/验收报告。

现在生产 sw.js 曾仅距 320 KiB 上限几十字节，**必须重新测量最新 main 的真实构建结果**。默认库放入 Controller Worker 与 Page 固定产物，不因零配置而塞进 sw.js；不能偷偷提高预算、放宽 CSP、放宽 package allowlist、容许新动态代码入口或删测试求通过。构建有固定入口数量合同，增加入口时必须同步且完整核对对应清单、manifest、依赖溯源、精确 ZIP 检查；不要只把文件拷贝到 dist 就算已发布。

## 五、先实施，再独立反方审计

先读代码并简短列出真实 P0 缺口（不要重新写几十页架构评论），按阶段实施：

A. 两库真正锁入扩展、catalog、可信固定产物、许可/完整性和供应链检查；
B. Controller 单文件手工草稿零 import 可用，测试原运行结果与 Worker 隔离/回收；
C. Page 单文件手工草稿零 import 可用，在真实 USER_SCRIPT 的同 world 注入、确认真实 DOM 结果；
D. 补候选/正式程序、升级身份、错误回执、生命周期、Sidebar 最小帮助与用例；
E. 若前述全部通过，再处理 P1 jQuery 按需加载；P2 库本轮不开发；
F. 真实 Chrome for Testing / Mac、生产/开发构建、ZIP 校验和安全反方审计。

反方专家必须尝试阻断以下缺陷：
- 把库只导入 Background，页面或 Controller 仍得到 ReferenceError；
- 网站已存在 window._/dayjs/$，脚本错用网站版本或污染 MAIN；
- 同名用户 const、旧 @require、jQuery 多版本、多个 world/脚本之间互相覆盖；
- 库缺失/哈希错误/未 ready 时，用户源码却已经产生 DOM/网络副作用；
- Lodash 原型污染、代码生成与不安全路径输入；不可因为新版本已修复某几个 CVE 就默认 API 都安全；
- 日期格式、时区、locale/插件行为，Node 模拟结果与浏览器结果不同；
- debounce/throttle 的 timer 和 DOM listener 在停止/切换/导航后泄漏；不能承诺停止了所有用户未登记资源；
- 用户源码哈希相同但扩展升级了第三方库，既有已验证 Task 语义被悄然改变；
- Worker 受限 CSP、WXT 经典 IIFE、USER_SCRIPT world CSP/加载顺序不一致；
- 普通用户需要手动安装 npm、上传 JSON 或每次打开页面全站自动加载库；
- 额外扩大网站权限、主世界暴露、远程代码、扩展包无许可或产物字节未锁定。

## 六、必须执行的验收与评分

至少执行（以当前 scripts 为准）：
- npm ci --ignore-scripts；npm run check；npm test（优先受影响的 Node 回归）；npm run build；npm run build:dev；npm run verify；
- 适用时 pack:production/development 或现有 pack、ZIP exact dist 和 build receipt bundleModules 验证；
- 新增纯 Node 测试：函数行为、名称冲突、catalog hash、无权限、缺资源、版本不匹配、篡改、不安全输入、同一库重复加载、回收；
- **真实 Chrome MV3**：用真实扩展、真实 Sidebar、真实目标网页、用户批准的权限测试 Controller 和 Page 两段 P0 代码，确认 Controller runId/resultId/sourceHash、Page previewId/documentId/worldId/sourceHash/返回结果，并看 MAIN 全局在前后未改变；
- 还要测连续运行、窗口重开、导航、撤权、失败后阻断、SW 重启、扩展更新、断网（运行不依赖 CDN）及 Controller Worker 清理；
- 性能记录：库真实 JS 字节、SW before/after、Controller Worker 增量、Page CORE 增量、未运行脚本时零注入、典型首次/再次运行耗时；不要虚构指标；
- 复用仓库既有 Chrome 证据时必须证明相同代码/环境/产物身份；不能以 Node-only PASS、网页 DOM CDP 模拟、历史 R9 CI 冒充完整浏览器真实通过。

目标专家验收 >=95/100，维度按架构文档：零配置25、双运行世界25、安全20、体积与资源15、API/文档15。任何 P0 未通过最高 89，未取得真实 Chrome 回执则标记 NOT_TESTED / BLOCKED，不能自称 95 或“全部完成”。

## 七、main 直接集成及并行保护

**本任务受用户明确要求直接在 main 推进，不创建新分支或 worktree。** 动手前阅读 AGENTS.md；核对最新 main、远端分支和 PR、工作目录 git status、协作者可能重叠的文件；不能覆盖已有未提交变更，不能与其他并行 Agent 抢写同一目录/资源。主分支/仓库保护规则如确实禁止直接写入，停止破坏性提交并明确说明真实限制；**不要擅自创建分支来替代本要求**，也不允许绕过 CI、审批或 branch protection。

源码改动先做定向测试，再复核最新 main 是否前进，安全提交到 main；不得 git reset --hard、git clean、force push、篡改历史证据、删除其他人未合并的分支、擅自发布或改变生产 profile。若仅能使用 GitHub 连接而不能访问用户 Mac 本地目录，应直接实施可用的仓库文件修改；无法真实运行的 Mac/Chrome 测试必须如实标注并给本地 Codex 一段精确续测命令，不能假装本机验收。

每完成可安全提交的阶段，保持代码、测试、使用说明在真实 main 中一致；不生成 ZIP/patch 给用户当作修改完成。要可复现的证据，而不是空口“专家 97 分”。

## 八、最后必须结论优先交付

首先给最直观的五项：
1. **普通用户如今能直接粘贴使用什么？** Controller 和 Page 分别明确 PASS/FAIL/未测。
2. **框架开发者预装了哪些实际库/版本、在哪些真实源码和 dist 文件里？** 给准确路径而非抽象描述。
3. **main 是否真实提交并推送？** 给 commit SHA 和具体文件列表；若受阻准确说明。
4. **真实 Chrome/安全/构建/包体积** 各是什么证据等级和结果、哪些未做。
5. **尚剩什么缺口、下一步最值得做哪两项**；不要长篇 CI 日志代替结论。

此次 GOAL 是直接将普通用户的“内置第三方库、零配置运行”实现为产品功能。**不得再以 page-npm-lodash 示例、再次写架构文档或让用户自己 npm install 代替交付。**
