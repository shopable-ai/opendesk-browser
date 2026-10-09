---
name: opendesk-program-publish
description: Create, edit, review, build and validate OpenDesk multi-file ESM programs, Page USER_SCRIPT programs and Controller tasks using existing contracts.
---

# OpenDesk Browser · AI 项目编写与发布规则（R9）

本 Skill 是工作指南，不是新的运行器、构建器或授权入口。普通单文件 JavaScript 不要求 UserScript 元数据；复杂程序用独立本地项目开发。

## 先读取当前合同与证据

阅读 AGENTS.md、docs/framework/testing-guide.md、docs/framework/program-evidence-reuse.zh-CN.md、docs/product/program-development-dual-format-and-sidebar.zh-CN.md，以及 docs/architecture/browser-framework/ 下的 program-project-authoring-r1.zh-CN.md 和 third-party-library-map.md。机器合同包括 schemas/opendesk-program-project.v1.schema.json、src/platform/tasks/contract.js、src/scripting/user-scripts/page-program-contract.js。

核对最新 main、工作区和并行 PR，保护他人修改。按相关源码/测试/包身份复用真实证据；不把旧候选、Node 组件或安装截图升级为本候选完整 Chrome/F3 通过。

## 选择项目类型与依赖层

Page DOM 程序使用 page-userscript / USER_SCRIPT；自动化使用 controller，经原 RunHost/Authority/ChromePage 执行。Controller 可以使用适合其环境的 npm 包，但不得注入网页 UserScript 全局库或扩展权限。用户 Side Panel 工具使用已有独立工具格式，不能当作特权 Sidebar 模块。

每个项目一个 package.json，opendesk 字段声明 id/runtimeKind/entry/网站规则，src/main.js 默认导出函数。源码只采用受支持的 .js/.mjs 静态 ESM 图。npm dependencies 属于该用户项目，不自动添加到扩展根 Background。

新增第三方包先审查实际消费者、运行环境和许可证，再在项目目录执行 npm install --save-exact --ignore-scripts <包>@<版本>，提交 package.json 与 package-lock.json；后续 npm ci --ignore-scripts。直接导入的包须精确 SemVer、lockfile v2/v3、版本一致的 HTTPS resolved 与 SHA-512 字段。npm ci 负责真实安装与 tarball 完整性，静态校验器不替代 npm 或第三方代码审计。

构建期 HTTPS ESM 已有明确远端锁/缓存流程，参考 https-esm-imports-r1.zh-CN.md；首次显式 --lock-remote，后续离线。禁止把它理解为浏览器运行时 CDN import/eval。

## 使用已有校验和 Webpack 构建器

```sh
npm ci --ignore-scripts
npm ci --prefix examples/programs/page-npm-lodash --ignore-scripts
node scripts/validate-program-project.mjs examples/programs/page-npm-lodash
npm run build:program -- examples/programs/page-npm-lodash
node --test tests/integration/npm-project-closure.test.mjs
```

AUTHORING_VALID_NOT_PACKAGED 只表示源项目校验。真实 Webpack 构建输出不可变 program.js、artifact.json、program.opendesk-draft.json；Controller 另有原 Task v1 Candidate JSON。保留 BUILT_UNVERIFIED/installable:false，不冒称 Available 或 Installed。

检查 npmDependencies（锁定版本/来源）、npmBundledModules 与 authoring.webpackModules（编译模块记录）、npmLockSha256、最终 sourceHash。构建图不证明所有树摇后的 API 可用，应实际执行关键消费者。扩展自身 WXT build receipt 的 bundleModules 是另一层证据，不能与用户项目混同。

Page 小型 CSS/JSON/图片已支持声明、校验和固定打包，仍需项目明确使用/挂载；Controller 资源按现有边界拒绝。JSX/TSX/.vue 或浏览器内 Tailwind 编译不在普通 .js/.mjs 支持承诺中。优先原生 DOM/ShadowRoot，不向网站全局注入 CSS reset。

## 沿用当前 Sidebar 入口

同窗口 Sidebar 打开，从“发现 → 导入”既有任务目录导入 program.opendesk-draft.json。源文件是只读快照，真正执行字节在高级诊断中；修改回本地重建，“新建”恢复普通草稿。Page 使用“网页 JavaScript 试运行 → 在当前网页试运行”，Controller 用底部“运行草稿”。不新增页签、替换底栏或创建依赖配置面板。

旧 @require 仅解析及复用唯一合法已批准锁；无锁/多锁必须拒绝并提供本地构建路径，不静默下载批准，不无条件转换为 ESM。经典顶层/IIFE 回执不表示所有异步监听器完成。

## 验收与发布

开发构建 --mode development 另有本地 Source Map，生产无映射；没有准确映射不编造错误源码位置。遵守输出、草稿、资源大小上限，不为引入大型库放宽。

运行需原 Broker/Authority 的真实站点和目标准入。Controller Candidate 必须经过原验证链，Page 完整自动安装/启停/重启/撤权不能由注册描述推导为已通过。Git 提交、构建、导入、运行、安装、发布是不同动作；没有明确授权不自动安装、发布或执行 npm publish。

交付报告实际文件、运行类型、源码与产物哈希、已执行检查、真实 Chrome 证据和阻塞。保留原603+19/B05/F3与历史失败，不用主观评分或模拟 ack 关闭验收。
