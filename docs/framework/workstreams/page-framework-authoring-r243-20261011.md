# R24.3 · 官方组件开发文档交接

日期：2026-10-11。任务：用户要求将已确认的 React/Vue 方案写入 Markdown，明确四目录修改范围，并提供新对话可直接执行的 GOAL。

## 本次完成范围

**仅文档；新增功能源码尚未实施。** 未改 JS/Vue/JSX、package/lock、运行时资源、导入 JSON、测试代码或历史回执；未在用户 Mac 执行构建或 Chrome 测试。设计自评 96/100 与实现评分分开，新增能力均待真实验证。

核查基线：1d70456638124d79829f761cb71ea9f878dc8b14。执行期间 main 有其他任务提交，更新现有文件使用读取所得内容 SHA；一次 API 指南写入因并发引用变化被拒绝，重新读取确认文件内容未变后更新，没有强推或覆盖其他源码。

已写入/更新九份 Markdown：

1. docs/architecture/browser-framework/page-framework-authoring-r243.zh-CN.md：确认的技术方案、四目录迁移、兼容及评分门槛。
2. docs/api/page-ui-frameworks.zh-CN.md：区分已有 R24.2 路径与待实施 R24.3，保留当前使用方法和历史构建证据入口。
3. docs/framework/prompts/goal-r243-page-framework-authoring.zh-CN.md：下一轮源码实施、测试修复、三轮审计与真实 Chrome 验收 GOAL。
4. examples/programs/page-ui-react/README.md：默认 JSX 目标与当前手工路径的边界。
5. examples/programs/page-ui-vue/README.md：默认 SFC 目标与当前手工路径的边界。
6. examples/programs/page-ui-react-direct/README.md：保留普通 JS，标准导入及自动挂载迁移要求。
7. examples/programs/page-ui-vue-direct/README.md：保留普通 JS，旧入口兼容与产物同步要求。
8. examples/import-ready/README.zh-CN.md：保持当前 JSON 身份，明确新产物生成和旧证据保留。
9. 本工作流：跨对话交接和未实施事项。

## 已确认的关键决策

- 四目录都纳入后续代码迁移，不重建四套框架，不新增替代目录；两个默认 JSX/SFC，两个普通 JS/兼容。
- 用户写标准 import 和组件；createPageUI 移到生成入口，createDemoEnhancer 只留作进阶业务。
- 浏览器基础编辑/源码导入不要求 Native；本地目录仍需已有连接并复用 CLI。两条路径共享纯转换合同，不新建执行器。
- 新 component 入口需显式声明；旧 async-main、Controller、classic-userscript 与固定草稿不被静默改变。
- 新生成入口即使用户不 import @opendesk/ui，也必须纳入原快照闭包、输入指纹和 managedUI 判定。
- JSX/SFC 仍由系统转换；框架预装、转换和挂载不可混为一谈。遵守原权限、CSP、执行身份与预算。
- 源码变化后真实更新当前导入产物和测试，同时保留历史快照/回执，不能替换旧哈希冒用旧 PASS。

## 文档审查与证据级别

已对照读取的源码/文档检查：四目录职责、现有 schema 的默认行为、旧 R24.1 构建边界、direct 普通 JS 操作方式及导入快照身份。官方 React/Vue/Chrome 参考保存在设计末尾；不因官网有新版本自动升级仓库固定依赖。

三轮文档审查关注：用户能否理解入口；共享链与旧合同是否相容；安全、体积、证据和评分是否有明确放行条件。这不是三轮实现审计或真实 Chrome PASS。

写入返回的提交（不包含其他 Agent 的交错提交）：

- 6c6b7366a0e401fb18a4db479226b7eb12fb6796：设计文档。
- 9fc6cb09e4fe8badbf44a75cc8b7e80beb18d8c4：API 使用指南。
- 2e510a4aff0e409ea01e1eeaf38d4bb0f8467a95：完整 GOAL。
- 179036ecc30e1a89c4ae019d324c32147988daee：React README。
- e9e076f28e833154d66951d26cb278255b7e8802：Vue README。
- fdbfa289bea14532f16c8fffe2c4b382119635aa：React direct README。
- 5df2675e22a76c1e15ac301b51c449add09459ec：Vue direct README。
- a065624f358c7caad0db0cda85815a98c5ef49a2：导入指南。

以上提交只说明对应文档写入成功，不是构建或产品验收。当前交接记录本身的提交由 Git 历史查询。

## 下一轮必须完成

按 [GOAL](../prompts/goal-r243-page-framework-authoring.zh-CN.md)读取最新 main 后直接实施：共享标准导入和转换、受管挂载、默认两例、direct 两例兼容、真实产品入口、导入产物与测试、真实 Chrome 和文档状态更新。

功能开发、组件/构建测试、无 Native 浏览器路径、真实 Mac Chrome、20 次独立 Run/Stop、撤权/SPA/BFCache、CSP/体积/性能/可访问性均不是本次文档任务已完成项。各验收维度分别 >=95，且关键 P0/P1 与必达未测项全部关闭后才可放行，不以平均分补偿失败。

## R24.3 增量源代码实施记录 · 2026-10-11

当前新增的是**本地目录普通 JS 组件链路**，不是 R24.3 完整验收。保留 R24.2 所有原生回执，不把旧候选 PASS 计入此候选。

- Page 可显式声明 `opendesk.entryMode: "component"` + `framework: "react"|"vue"`。缺省仍为原 async-main，Controller 不受影响。
- Webpack 将标准 `react`、`react-dom/client`、`vue` 静态导入链接到原扩展固定字节，不重复打包 ReactDOM/Vue。运行时现有导出覆盖有限，未支持的 `useCallback/useReducer` 等在准备期给出位置；不能视为完整官方 API。
- 内部生成入口使用原 `@opendesk/ui`、受管 mount 与 React/Vue 官方 unmount；LocalDevResolver 将隐式 UI helper 冻结纳入输入 hash，生成器和固定导入合同纳入 BUILD_INPUTS。
- 新增 Node 组件测试文件。测试结果在可核实 CI/终端日志到达前均为 NOT_TESTED。
- 不修改原四目录源码和 R24.2 导入 JSON，避免没有 JSX/SFC 编译链时把现有示例变成无法运行的入口。JSX/SFC、浏览器无 Native Worker、四目录迁移、导入重新生成、真实 Mac Chrome（含 20 次 Run/Stop）、暗色/缩放、性能/体积仍待完成。不能以此记录称 R24.3 已完成。

新增回归入口：`node --test tests/environment/page-component-entry-r243.test.mjs tests/environment/page-ui-no-build-r242.test.mjs tests/environment/page-ui-import-drafts-r242.test.mjs`。

## R24.3 新增当前可导入组件草稿（2026-10-11）

基于当前可运行的 `App.jsx` / `App.vue` 默认项目，通过原 `scripts/build-program-project.mjs` 在 [R24.3 导入构建 CI](https://github.com/shopable-ai/opendesk-browser/actions/runs/38153296137) 生成 **真实生产模式 JSON**。分别为 React 20,085 bytes（源码 hash `97ff050d29977932156b130a01f2149799a2c821a65a25778c2f269591e3c557`）和 Vue 20,416 bytes（源码 hash `747838ef6225583e6128f906ec2491f0ce141b7f8f50f3d01e2bcf7877f8f0c0`）。两个 JSON 与构建身份有固定哈希及 CI 源产物对照测试；保留 R24.2 两个 direct JSON 的历史字节与独立回执，不把其旧 PASS 复用为 R24.3。

新增路径：`examples/import-ready/page-ui-react.opendesk-draft.json`、`examples/import-ready/page-ui-vue.opendesk-draft.json`、`tests/environment/page-component-import-ready-r243.test.mjs`、`.github/workflows/page-framework-r243-import-ready.yml`。CI 会检查新草稿实际重新构建值；下一次源码或编译器变化时必须重新生成，而不是改 expected SHA 或继续引用旧组件源码。浏览器源代码直接转换、独立 20 次 Run/Stop、固定程序安装和完整 UI 仍未验收。

## R24.3 direct 两目录源码迁移（2026-10-11）

- 原 `page-ui-react-direct` 的默认 `src/main.js` 改为标准 React `createElement/useReducer/useCallback` 函数组件；`page-ui-vue-direct` 使用 Vue `h/ref` Options 组件，系统生成 UI 挂载与卸载。
- 原 `src/main.js` 字节分别冻结为 `src/legacy-main.js`，保留 `enhancement.js` 高亮/撤销进阶业务、旧 `async-main` 语义与真实 Chrome 回归。原 R24.2 import-ready JSON 完整复制到 `examples/import-ready/history/`，保留历史 hashes/receipts；不会把它们冒充当前组件。
- 真实 Mac CFT 的既有 R24.2 两例使用隔离测试项目显式切至 `legacy-main.js`；新增 R24.3 direct 组件真实点击/Stop，用独立 previewId/sourceHash/documentId 和停止回执记录。新增 `tests/environment/page-direct-component-r243.test.mjs`；所有结果仍以实际 CI 新候选为准。
- 对应的 **当前** 两份 direct JSON 需要从本次源码重新构建并替换，不能只修改哈希或沿用历史 PASS。浏览器内无 Native 即时 JSX/SFC 编译、20 次独立 Run/Stop、F3、ZIP 仍待完成。

## R24.3 当前 direct 导入产物已重建

来源：[R24.3 四目录构建](https://github.com/shopable-ai/opendesk-browser/actions/runs/38154353845)。React direct `sourceHash=29186e6f09cc72a2e2671e1dfbc777dbf62c24b0b5c90dd3d013029b383118ba`，JSON 20,575 bytes；Vue direct `sourceHash=f83a08b3e2d9952cf5729276b01388b1fca8a5334ea683b5df00ad4e372618f5`，JSON 20,267 bytes。当前 `examples/import-ready/page-ui-*-direct.opendesk-draft.json` 已替换为真实组件产物；R24.2 原始 JSON 单独保留在 `history/r242-...`，其历史 PASS 不继承给本候选。新 `tests/environment/page-direct-import-ready-r243.test.mjs` 每次 CI 按当前源码重新构建比较，禁止只改期望 hash。Chrome Native/F3/20×Run-Stop 证据仍逐项核验，不能由此作为总体验收。


## R24.3 真实 Chrome 四十次独立 Run/Stop 证据（2026-10-12 核查）

- 候选 Git HEAD：`1e532a8ba85131d10f666631e6b80a83b1146d75`。
- 原生 CI：https://github.com/shopable-ai/opendesk-browser/actions/runs/38155034890 （macOS CFT + 原 Native/MCP + 实际 Chrome USER_SCRIPT，非 Node mock）。
- `PASS_R243_20X_EACH_REAL_CHROME`：React `App.jsx` **20/20**、Vue `App.vue` **20/20**。逐次新网页文档，`40` 个独立 `previewId`、`40` 个独立 `documentId`，`40` 次原生 Stop 回执 `ok:true`，`40` 次受管 DOM 清理为真，使用真实 Chrome 指针交互。
- 当前组件源码身份 React `97ff050d29977932156b130a01f2149799a2c821a65a25778c2f269591e3c557`，Vue `747838ef6225583e6128f906ec2491f0ce141b7f8f50f3d01e2bcf7877f8f0c0`。首条 React previewId `f4e6dd34-cef6-4f84-bf79-26d5691f904f`，末条 Vue previewId `b3415fb6-1055-47d5-87a6-0c2d299a461c`。本次 `resourcesReleased:true`。
- 单独六场景 Chrome：https://github.com/shopable-ai/opendesk-browser/actions/runs/38154353894 ，四个 R24.3 组件（JSX/SFC/direct React/direct Vue）和旧 R24.2 React/Vue 高亮/撤销实际挂载、点击、Stop，均 PASS。当前四份 R24.3 JSON 的构建与哈希检查见 https://github.com/shopable-ai/opendesk-browser/actions/runs/38154353845 。
- 两个默认项目 `npm run build:program` 已改为**直接原项目编译器**，不再强制调用 `build:framework`，其维护者独立构建与许可证保留。专门测试 `tests/environment/page-framework-build-commands-r243.test.mjs` 由 CI 执行。

### 尚未通过的原目标

浏览器中不安装 Native、不用 node_modules、直接编辑 React JSX/Vue SFC 之后的**实时源码转换 → 受管运行 → 停止**尚未具备完整路径；当前浏览器无 Native 仅可导入已预编译冻结 JSON。esbuild-wasm 候选正在独立进行版本/许可证/SHA/体积审查，不能把候选审查自动计为产品功能。SPA/BFCache、网站撤权、200% 缩放、暗色/窄屏、Portal/Teleport 外部 DOM 和固定程序 Installed/Update 的新候选全部要求独立验收。性能、可访问性/文档与产品易用性评分不能因其他维度高分而自动达到 95。

### 三轮审计增量记录

第一轮（源码入口与 UX）：消除“组件源码仍需 Vite”和旧 README 的误导，四目录入门都是官方组件语法；预编译导入与原始源码编辑分开标注。第二轮（API/兼容）：固定运行时导出与 Node JSX/SFC 链通过源码/CI，R24.2 原始 JSON、async-main、高亮/撤销保留独立身份。第三轮（安全/生命周期）：原 Chrome world、网站许可、原 Stop 40 次独立回执验证通过；浏览器无 Native Worker 与权限撤销/性能矩阵仍是阻断项。未闭环项目不得把本轮实现评分写为 95+。

## 2026-10-12 · 浏览器直编链与受管异常恢复增量核查

**历史真实浏览器闭环已经完成，但不得外推到随后每一次提交。** [macOS Chrome CI 38225425847](https://github.com/shopable-ai/opendesk-browser/actions/runs/38225425847) 在 `9cdb3bf98fe410b88c456801855e2635f6b1a7b0` 的实际扩展中，验证了无 Native 的 Side Panel 选择 React/Vue、Babel/Vue Worker 准备、当前网页 `USER_SCRIPT`、真实指针更新、按原预览身份受管 Stop 和 DOM 清理；React `previewId=55fa4b70-0d37-497d-9f2a-fa1750ab7316`，Vue `previewId=10c188da-05d3-4a1a-a947-9453636058f3`。该 CI 的 20447/21025 分别是 JavaScript **字符长度**，不是 UTF-8 字节大小。

**本轮针对原生命周期发现并修复的三个输入身份漏洞：**

- [`2ca8f0c`](https://github.com/shopable-ai/opendesk-browser/commit/2ca8f0c580a299bbb407ebe18cee34692be08fa8)：浏览器效果未知或 Page 回执不匹配时，不再因为没有 `previewId` 而永久锁死或被瞬时 `resolving` 状态解锁；按实际 `tabId/documentId` 保留隔离状态。
- [`d2abfe9`](https://github.com/shopable-ai/opendesk-browser/commit/d2abfe93fb96bda4cdac9869ac8ad9e518c2a66c)：保留跨标签页受管组件的所有权，返回旧标签页后可用其原始 `previewId` 停止；切换到别的标签页**不是**旧 UI 已清理的证据。只有原标签页真实新文档或被关闭才允许释放旧保护。
- [`7a7df1d`](https://github.com/shopable-ai/opendesk-browser/commit/7a7df1ddb911074e96b48b9c1d0c837742526e6a)：已确认的组件运行失败可保留 Stop，但必须完整匹配原 `previewId/sourceHash/tabId/documentId`；空回执、错误的 managed 身份和伪造状态一律隔离当前文档。修复涉及 `src/ui/script-editor.js` 与已有 `tests/environment/script-editor.test.mjs` 的多组 Node 回归，未创建新权限或执行器。

**本轮证据状态：** 上述新候选已直接写入唯一 `main`；[项目合同 CI 38232831807](https://github.com/shopable-ai/opendesk-browser/actions/runs/38232831807) 与 [浏览器 UI 实机 CI 38232831583](https://github.com/shopable-ai/opendesk-browser/actions/runs/38232831583) 触发后截至本次核查仍处于 `queued`，不是 PASS。之后的本次修复需要按新的 SHA 复核 CI，不能自动继承早前 CFT 成功。当前也没有对用户 Mac 的 `/Users/shopme/Documents/workspace/opendesk-browser` 进行本地读取或占用端口/Profile。

**保留的 P0/P1 放行门槛：** 新候选浏览器直接模式 20×React/20×Vue 独立 Run/Stop、异常 Stop 的真实回执、SPA/BFCache、主动撤权清理、200%/暗色/窄屏、固定程序安装/更新及完整生产包候选须单独验收。不能以本轮两三个缺陷的修复代替六维独立 95+ 评分或 R24.4 最终放行。

## 2026-10-12 · 无 Native 40 次真实运行的独立验收候选

提交 [`b77a2a8`](https://github.com/shopable-ai/opendesk-browser/commit/b77a2a80ae026c30746ab0329f957d467fddb72e) 在**现有** `tests/framework/page-browser-worker-r243-cft.mjs` 上仅增加可选 `OPENDESK_R243_BROWSER_STRESS=1` 测试切片；原有非 Stress 行为不变。

新增 `tests/framework/page-browser-ui-r243-cycles.mjs` 与 `.github/workflows/page-browser-ui-r243-40-loop.yml`。测试真实 Chrome 无 Native Side Panel 的 React JSX 和 Vue SFC 各 20 次明确运行：每次 `Page.navigate` 创建不同文档，原 `chrome.webNavigation` 读取真实 `tabId/documentId`，真实鼠标点击组件并验证计数变化，等待原 `managedPreviewId`、`sourceHash`、框架身份以及可信 `retirePagePreview` 回执，确认 UI 和受管 DOM 已移除。总计要求 **40 个独立预览身份、40 个独立文档、40 次 Stop 成功、40 次 DOM 清理**，同输入从第二轮起还须出现固定编译器缓存命中。四张首末轮真实截图及每轮回执保存为 CI 附件。

[对应 macOS Chrome CFT run 38233706775](https://github.com/shopable-ai/opendesk-browser/actions/runs/38233706775) 已创建。**截至本轮交付其状态为 QUEUED / NOT_TESTED，并非 PASS**，不能借用 [历史本地 Native 40 次 Run/Stop](https://github.com/shopable-ai/opendesk-browser/actions/runs/38155034890) 或 [历史无 Native 单次组件 CI](https://github.com/shopable-ai/opendesk-browser/actions/runs/38225425847) 代替这一轮新的独立浏览器验证。当前候选和 GitHub Actions 排队不构成最终 F3/ZIP 或完整产品评分。

## 2026-10-12 · 重新核对无 Native 40× 原生回执（已完成）

此前本文件记录的 [Chrome CFT run 38233706775](https://github.com/shopable-ai/opendesk-browser/actions/runs/38233706775) **已由 QUEUED 转为 SUCCESS，原生完成报告已核实**。本记录修正历史状态，不伪造新的候选验收。

- 验收提交：`b77a2a80ae026c30746ab0329f957d467fddb72e`；扩展 ID：`pnhiokdnhhpbidgojhbjknpldipijdfa`。
- 原生报告：`PASS_BROWSER_UI_NO_NATIVE_20X_EACH_RUN_STOP`。React JSX `20/20`、Vue SFC `20/20`，合计 40 个独立 `previewId` 与 40 个独立 `documentId`，40 次原 `retirePagePreview` 受管成功停止回执及 DOM 清理。每轮使用真实 Chrome 指针输入，全部 `noNative: true`，重复输入缓存命中得到回执。
- 源码身份（此次浏览器直编产物）：React `a48fe4ddd903c078337b3a0b0e0241aa5e777b3c1a7faf1e49eff58dac2b8926`；Vue `d7071713db0fed4d16fee1b7ab2f6ec3ff4f1254b71a8de06ded4bca30c27f59`。
- CI 附件：`r243-browser-native-free-40-cycles-b77a2a80ae026c30746ab0329f957d467fddb72e`，artifact ID `11740568040`，包含原生截图和逐次证据。
- **判定：**这项 P0 核心功能已达到对应候选的真实 Chrome 测试要求。但 `b77a2a8` 并非最新 `main`；最新生产包、安装/更新、撤权、SPA/BFCache、Portal/Teleport、暗色/200%/键盘及全部独立评分仍需要对应候选证据，不能自动继承这一项通过结论。
