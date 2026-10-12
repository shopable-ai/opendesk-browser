# GOAL：OpenDesk Browser R16.4 —— 零参数 main 与公共预装库跨执行世界实用化、纠错及真实验收

日期：2026-10-12。默认中文。

仓库：https://github.com/shopable-ai/opendesk-browser ，**唯一允许修改和提交的分支 `main`**。默认本地 Mac 工作目录 `/Users/shopme/Documents/workspace/opendesk-browser`；只有在工具能实际访问该目录时才声称执行了本地原生 Chrome。网页端可继续使用 GitHub 仓库连接安全修改源码和文档，Mac Chrome 回执必须由真实 Runner / Mac Codex 提供，不能把 Node VM 记为 NATIVE PASS。

## 任务目标

直接读取最新真实仓库、实施和修复，而非再讨论目录草案。**长期不能回退的用户需求是零配置脚本体验：**

```js
export default async function main() {
  const title = await page.title();
  const url = await page.url();
  return {
    title,
    url,
    words: _.words(title),
    date: dayjs().format('YYYY-MM-DD')
  };
}
```

上述用于 Controller 多文件 ESM 项目；单文件/Sidebar 直接编辑写 `async function main()`，不写 `export default`。两者在各自模式中由 Runtime 提前提供 `page`、`params`、`axiosx` 受控词法变量和默认 `_`、`dayjs`、`OpenDeskLibs` 公共库，**用户不传 `{page}`、不安装默认库、不通过全局 `window.page`、不输入 CDN 地址**。旧 ESM `main({page})` 仍需兼容而不是一刀切删除。Page USER_SCRIPT 的 `main()` 访问 `document` 与其世界中的 `_`、`dayjs`，没有 Controller `page` 等变量。

## 1. 权威文件必须先读

- `AGENTS.md`、`src/libs/AGENTS.md`、`docs/framework/testing-guide.md`
- `docs/api/runtime-globals-and-preinstalled-libraries.zh-CN.md`（2026-10-12 新增，用户体验和环境矩阵）
- `src/libs/README.md`、`src/libs/runtime-contract.js`、`src/libs/catalog.js`、`src/libs/core.js`、`src/libs/loader.js`、`src/libs/identity.js`
- `src/scripting/sandbox/worker-runtime.js`、`scripts/build-program-project.mjs`、`src/scripting/user-scripts/{execution-source,preview,installed-programs}.js`
- `docs/api/{controller,page-userscript,local-projects,sidebar-tool-development}.zh-CN.md`、`examples/programs/README.md`
- `examples/programs/controller-globals-zero-arg/` 与 `examples/programs/page-globals-zero-arg/`（新规范 Demo）
- `tests/environment/runtime-globals-zero-arg.test.mjs`、`tests/environment/{builtin-libraries,controller-main-entry,program-build}.test.mjs`
- `docs/architecture/browser-framework/public-preinstalled-libraries.contract.zh-CN.md` 和相关 R15/R16 工作流记录。

**旧 R15.7 提示词/320 KiB/目录计划可能过时**。重新读取当前 `scripts/build-contract.mjs` 实际版本、权限合同、资源读取限制与最新 CI，同一配置只能有一个真值；不能为了通过构建擅自放宽体积/CSP、也不能机械恢复旧预算。

## 2. 执行前安全检查

```sh
pwd
git status --short --branch
git rev-parse HEAD
git fetch origin main
git rev-parse origin/main
git log -8 --oneline
```

**仅使用 `main`**，不创建新分支、worktree 或 PR，不强推、不执行破坏性 reset/clean，不覆盖并行 Agent 修改。必须核查同路径竞争性写入和 dist/Chrome profile 占用；无法安全更改则如实注明并暂停该文件，而不是盲目提交或另开分支。

## 3. 直接推进：入口、世界、实际使用

- 先运行新增 Controller/Page 零参数 ESM Demo 的正式 Webpack/Resolver 编译和 VM 合同测试，确保 `page.title()`、`page.url()`、`_.words()`、`dayjs()` 真的执行，而不是仅核查 Markdown 文字。保持原有 ESM 多文件旧入口构建哈希/兼容测试不被破坏。为标准测试网页补同候选真实 Chrome Controller `runId/resultId` 和 Page `previewId` 测试。
- 核实普通 Sidebar 编辑器和独立单文件直接写 `async function main()` 的路径；多文件 ESM `export default async function main()` 不应被当成单文件源码直接送进 AsyncFunction（`export` 在原始脚本中不是合法语法）。
- 核实 `page/params/axiosx` 词法绑定不是 `globalThis.page`，`_`、`dayjs`、`OpenDeskLibs` 只在真实 Controller/Page 世界预装。不得把同一套 globals 注入网站 MAIN 或任何 Background/Side Panel 工具 iframe。
- Background、可信 Side Panel 宿主、扩展自定义页面从**自己受信固定入口**按需静态导入模块；Side Panel 用户工具 opaque iframe 按 `globalThis.OpenDeskTool.root/request` 访问受控能力。分别给真实源码引用与说明示例；没有可行普通用户自动加载接口时明确写未开放，绝不伪装成已接入。
- Page `// @opendesk-lib <id>` 仅为明确的单个可选库声明，不是权限 grant。保留 CDN/eval 禁止、物理按需资源、SHA/版本/ABI/许可、旧回执失效和网站 MAIN 不污染。React+ReactDOM 同一固定资源；Vue 单独资源；静态 Tailwind CSS 不进入 SW。

## 4. 缺口收敛（有源码才能记完成）

按当前真实 Catalog 核对 Lodash、Day.js、my-utils、jQuery、Axios、CryptoJS、js-cookie、query-string、store.js、FileSaver、Cheerio、FingerprintJS、Socket.IO Client、React/Vue 和 Tailwind。不得把 `src/libs/README.md` 的清单当成真实产物。优先完成剩余的 Controller 真实 Axios Broker/取消链、Socket.IO 的明确连接授权与可靠 Stop/撤权断开、静态 Tailwind 用户 UI 资源以及尚缺的独立执行世界调用；不过度扩大 SW、扩大权限、添加不必要代理框架或第二个 Catalog。无法达到兼容或许可/隐私验收要求时列 `PARTIAL` 或 `NOT_IMPLEMENTED`，不得偷换为 axiosx/fetch/WebCrypto 或内存 store。

## 5. 必须跑的最小确定性测试与正式构建

```sh
npm ci --ignore-scripts --no-audit --no-fund
node --test tests/environment/runtime-globals-zero-arg.test.mjs
node --test tests/environment/controller-main-entry.test.mjs tests/environment/builtin-libraries.test.mjs tests/environment/program-build.test.mjs
npm run libs:list
npm run libs:check
npm run check
npm run build
npm run build:dev
npm run libs:doctor -- --strict
npm run verify
npm run build:size
npm test
npm run pack
npm run pack:dev
```

按本机资源与其它任务占用、已保存的成功且输入不变的旧证据做影响分析，不强制重复不相关的全量测试。任何错误先查真实源码、修复再跑受影响范围，不降断言、不增权限。正式报告包括每一类库的 `src`、`dist` 物理入口、npm 来源/version/integrity、许可证 SHA、独立脚本资源 SHA、产物身份、SW/启动真实字节、默认/按需加载图、测试分母、失败/跳过和 Chrome 原始回执。

真实 Chrome 使用独立 Profile 和标准测试页：

```sh
python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks
```

访问 `http://127.0.0.1:43111/demo-form.html`。Controller 与 Page 分开跑；目标网页导航、Stop/撤权、旧 ABI、更换源码、新 `sourceHash`、网站 MAIN 全局未污染、预览次数限制、页面重新加载、离线场景与真实网络授权必须保持失败关闭。**无真实 Mac Chrome 则记 `NATIVE_UNVERIFIED`**。

## 6. 验收评分必须独立

分别给入口语法正确性、零参数用户体验、执行世界隔离、供应链许可与 SHA、运行时 API 完整性、按需构建/体积、权限/停止与恢复、真实 Chrome、文档 Demo/AI 契约九类独立 0–100 分。目标是每类都达到 95 分以上，任一类有 P0 阻断应如实低于 95，不允许平均分掩盖未交付库或假的 Chrome PASS。输出当前完成度的**具体证据与剩余缺口**，不是根据目标文件数量估计进度。

只对安全、可回读的 `main` 提交实施和文档增量，最终给出真实 commit SHA/CI 链接、源码路径、原始测试回执。**不是只交一份下一轮方案**。如果仍有 P0 缺口，在本次会话继续修复；无法实测时明确保留下一轮待验收事项。
