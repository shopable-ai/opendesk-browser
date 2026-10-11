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
