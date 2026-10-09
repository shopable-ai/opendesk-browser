# OpenDesk Program：多文件 ESM、npm 与受控运行（R9 当前说明）

> **R2.2 当前开发入口：** 授权的 Controller 与 Page 多文件项目均可使用 [连接项目 → 修改源码 → MCP/Sidebar 显式运行](../../framework/local-development-r22.zh-CN.md)。`native-agent/local-dev/resolver.mjs` v2 已接入同一项目构建器的**内存构建**，支持已安装的精确锁定 npm 包和已锁定/缓存的 HTTPS ESM，不必每次生成草稿 JSON。单文件直连、Sidebar 手工草稿没有 npm 项目上下文，仍不能直接解释原始 import。下文 `build:program` 保留给显式正式冻结与兼容导入；Page/Sidebar/受管刷新真实验收范围看 R2.2 工作记录。

更新：2026-10-09。复杂程序用本地目录开发，简单程序继续用 Sidebar 普通 JavaScript 编辑器。源码格式与运行环境是两个独立维度；不再使用旧 @require 图形设置流程。

## 项目和运行类型

每个项目一个 package.json，opendesk 字段声明 `opendesk.project.v1`、id、runtimeKind、entry、权限/网站规则；不另维护重复的项目 manifest。`type:module`、`private:true`、版本和 description 必须符合现有机器校验器。

```text
my-program/
  package.json
  package-lock.json       # 使用 npm 依赖时
  src/main.js             # export default function main(...)
  src/helper.js
  assets/                 # 仅显式声明的受支持资源
```

`page-userscript` 用于 document/DOM；默认 USER_SCRIPT，由 pageRules 约束。`controller` 使用 main({page,params,axiosx,AppStorage,AppLocal,storage})，沿用 Controller/RunHost/Authority，不向其注入网页全局或额外 Chrome 权限。自定义 Side Panel 工具包是另一种已存在的格式，不混作 Program。

## 本地、npm 和 HTTPS 模块

静态 `import './helper.js'` 支持多个 .js/.mjs 文件。npm 包须在该用户项目 dependencies 中按精确版本声明，并提交一致的 npm lockfile v2/v3；直接导入的包需要版本、HTTPS resolved、SHA-512 字段。npm ci 负责真实安装与 tarball 完整性检查，校验器不执行包钩子，也不是第二套 npm。

```sh
# 扩展构建工具依赖只安装一次；用户项目依赖另外安装。
npm ci --ignore-scripts
npm ci --prefix examples/programs/page-npm-lodash --ignore-scripts
node scripts/validate-program-project.mjs examples/programs/page-npm-lodash
npm run build:program -- examples/programs/page-npm-lodash
node --test tests/integration/npm-project-closure.test.mjs
```

首次引入新 npm 包由 Codex 在项目目录操作 `npm install --save-exact --ignore-scripts <包>@<版本>`，审查许可和消费者，提交 package.json 与锁文件；后续使用 npm ci。**这同时适用于 Page USER_SCRIPT 与 Controller 项目**，两者使用不同执行世界和权限；LocalDevResolver 在有权限的本地多文件项目中可直接读取锁定闭包并内存构建。扩展框架 Background/Content 自己使用的 npm 库则在**仓库根 package.json** 安装和各自静态 import，不能把用户项目包装进高权限 Background。详见 [R9.1 旧版重复加载与多执行世界依赖](background-dependencies-restoration-r1.zh-CN.md)。

[HTTPS ESM 导入](https-esm-imports-r1.zh-CN.md)已支持构建阶段**开发者显式**固定，首次 `--lock-remote` 下载并生成远端锁及缓存；随后 Local Dev 可**离线读取现有锁/缓存后直接运行**，也可正式构建产物。MCP `dev.run` 绝不自动联网补锁。它不是 Sidebar 手工草稿原始 URL import、浏览器 CDN 执行或 Webpack buildHttp。运行时动态 import/require/eval 不作为这个源码合同的入口。

## 构建产物和证据

复用 `scripts/build-program-project.mjs` 的 Webpack，不能加载用户自定义 Webpack 配置或增加另一构建器。产物包含 program.js、artifact.json、program.opendesk-draft.json；Controller 另有 program.opendesk-task.json。状态仍为 **BUILT_UNVERIFIED、installable:false**。

artifact.json 的 npmPackages 表示导入声明，npmDependencies 表示锁定来源/版本，npmBundledModules 和 authoring.webpackModules 表示 Webpack 模块记录；npmLockSha256 与 sourceHash 分别绑定锁文件和最终执行字节。记录不等于全部 API 在树摇后仍存在，必须测试真实调用结果。源码快照不包含 node_modules，也不是浏览器将重新编译的源码。

默认生产构建压缩并无 Source Map；`--mode development` 另有本地 program.js.map，位置映射包含最终包装器和头部偏移。不能在没有真实映射时编造错误对应的源文件行号。输出目录同时绑定源码/依赖和运行字节，旧输出不可覆盖。

当前 Page 输出上限 100000 bytes；Controller 65536 bytes；草稿源码快照最多 32 文件、256000 bytes，总信封 512000 bytes。详细合同以校验器及草稿解析代码为准。不得为了完整大库取消容量上限。

## Sidebar 使用（以当前真实控件为准）

**日常本地开发**：保持同窗口 Sidebar 开启，使用“开发 → 本地项目连接”选择已有 Native/MCP `--allow-project` 授权的多文件目录；点击原运行按钮时由 LocalDevResolver 读取最新项目及其精确锁定闭包，在内存中构建后提交原运行链。修改后再次显式运行即可，**无需每次导入 JSON**。

**正式交付/冻结**：通过 **“发现 → 导入”** 的既有完整任务目录导入 `program.opendesk-draft.json`，返回“开发”。源文件下拉显示只读快照；“高级诊断”显示执行代码；“新建”恢复普通可编辑草稿。修改已冻结产物仍须重新构建并重新导入，不能把快照当源码实时开发入口。

Page 展开 **“网页 JavaScript 试运行”**，点击 **“在当前网页试运行”**；Controller 使用底部 **“运行草稿”**。运行前要有真实目标和授权，构建/导入都不自动执行、保存或安装。没有元数据的普通 JS 可声明 main() 返回结果，也可写顶层语句。

旧 @require 保留解析和唯一已批准锁复用；没有新地址输入、审核下拉或 jQuery 复选框。新依赖先本地构建；不能将任意旧 @require 自动改写成语义不同的 import。经典顶层/IIFE 回执不代表所有异步监听器已经完成。

## 资源和正式交付边界

Page 已支持声明的小型 CSS/JSON/PNG/JPEG/WebP 固定内嵌，样式/图片须由项目明确使用，优先原生 DOM/ShadowRoot；Controller 资源构建仍按现有边界拒绝。JSX/TSX、Vue 单文件组件和浏览器内 Tailwind 编译不能由 .js/.mjs 支持推导出来。详见 [UI API](../../framework/ui-api.zh-CN.md)。

Controller Task v1 Candidate 经原有真实运行/核对流程才可能 Available，再显式安装。Page 的完整自动匹配、启停、重启与撤权对账不能拿编译器、注册描述或预览冒充已验收。Git commit、构建、候选、运行、安装和发布是不同操作。

旧新依赖去向与扩展 C1/C2、用户项目 C3 的边界见 [R9 迁移表](third-party-library-map.md)。日常操作见 [单文件与多文件](../../product/program-development-dual-format-and-sidebar.zh-CN.md)；Codex 按 `.agents/skills/opendesk-program-publish/SKILL.md` 继续开发。真实证据见 R9 工作记录，组件/CI 成功不等于同包 Chrome 全流程或最终 F3。
