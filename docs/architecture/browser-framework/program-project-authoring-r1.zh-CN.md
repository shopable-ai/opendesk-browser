# OpenDesk Browser R2：多文件 ESM、JSON 包与 AI 发布的最终方向

> 决策日：2026-10-08。本文区分**当前已实现的源码校验与本地构建**和**未来正式安装**。不重释已有 Controller Task v1，不创建第二套浏览器执行器。**Sidebar UI 以已合并的 R6 为基线，不采用前一轮的双按钮示意布局**。个人使用先读[单文件与多文件日常操作指南](../../product/program-development-dual-format-and-sidebar.zh-CN.md)。

> **R2.2 日常开发入口更新：** 已支持的本地 Controller 使用 [连接项目 → 改源码 → MCP 直接运行](../../framework/local-development-r22.zh-CN.md)。下文生成 program.js/草稿包的内容保留为正式冻结和兼容导入合同，不再作为本地 Controller 每次开发的要求。Page/Sidebar/热替换的实施状态以 R2.2 工作记录为准。

## 1. 一句话原则

**复杂项目按 npm/VS Code 扩展风格开发，采用多文件 ESM；最终运行依旧使用现有 Page USER_SCRIPT 或 Controller。** 油猴 @require 继续作为传统单文件脚本的导入兼容层。

| 方案 | 主要用途 | 结论 |
| --- | --- | --- |
| 单文件 .user.js + @require | 导入 Tampermonkey/Violentmonkey 小脚本 | 保留；不强迫迁移 |
| package.json + ESM src/*.js | AI / Codex 开发复杂任务、多模块、npm、资源 | **主开发方式** |
| runtime HTTPS import / CDN 动态代码 | 网页打开时临时获取 JS | 不采用 |
| 新的第四种脚本执行引擎 | 为多文件单独执行 | 不需要 |

## 2. 项目结构

    example-program/
      package.json           # OpenDesk 配置、程序 ID、版本、入口和网站权限
      package-lock.json      # 只有 npm 依赖时需要
      src/
        main.js              # export default async function main()
        dom.js
        utils.js
      assets/
        panel.css            # R1 小型 Page 资源可打包；真正应用样式仍需 UI 显式调用
      README.md

默认只维护一个**开发者手写的描述入口**：package.json 中的 opendesk 对象。不要重复维护 opendesk.json 和另一份手写 manifest。未来发行 manifest 必须由受信构建器从源码 + 最终 JS/资源字节生成。

当前项目描述格式是 opendesk.project.v1，注意它是“可编辑源码项目”，**不是** opendesk.task-package.v1 或可直接安装的 Page 包。示例在 examples/programs/page-heading；机器校验和 JSON schema 在 scripts/validate-program-project.mjs、schemas/opendesk-program-project.v1.schema.json。

## 3. 两个独立维度不能混淆

**源代码写法：** UserScript metadata 或现代 ESM 多文件。

**执行环境：** Page USER_SCRIPT 负责 DOM；Controller / RunHost / ChromePage 负责自动化。

Controller 侧现代浏览器自动化默认参考 [Page API 文档](../../framework/modern-page-api.zh-CN.md)：`page/params` 仅由获准的 Controller Worker 注入；`getByRole/getByLabel/fill/waitFor/observe` 不属于 Page USER_SCRIPT 的原生全局环境。源码采用多文件 ESM，不会给页面脚本授予新的能力或权限。

编译适配器要把 ESM 源码依赖图编译为运行环境允许的固定 JS 字节。ESM 写法不代表浏览器运行阶段需要支持远程模块解析，也不应向 Controller Worker 注入页面 UserScript 依赖。

    package.json + src/main.js + src/dom.js
                  │
        静态检查（已实现）
                  │
        本地 Webpack 单文件 bundler（R2 已实现，尚缺 Chrome 原生回执）
                  │
        SHA-256 冻结后的本地 JS（R1 小型 Page CSS/JSON/图片随固定 JS 内嵌）
             ┌────┴────┐
        Page USER_SCRIPT    Controller RunHost
             │                 │
       Page 类型正式安装待做   已有 Task v1 Candidate 构建适配器

允许本地 import './dom.js'。npm 裸包导入必须在依赖声明中且有 package-lock.json。直接 import 'https://cdn.example/lib.js' 和未受控动态 import() 不作为第一阶段默认方案；若将来允许 URL 来源，必须在构建时经用户授权、下载、哈希固定并消除运行期网络依赖。

## 4. 正式冻结、兼容导入与发布怎么操作

1. **创建/编辑**：AI 在本地多文件源码中开发；不要让 Sidebar 变成大型 IDE。保留单文件立即调试入口。
2. **静态校验（当前可执行）**：运行 node scripts/validate-program-project.mjs examples/programs/page-heading。它核对源码目录、相对模块图、权限声明、npm lock 一致性和源文件哈希，返回 AUTHORING_VALID_NOT_PACKAGED。它不会触发网络、执行第三方代码或发放权限。
3. **构建冻结（已实现源码 + CI 部件验收）**：运行 `npm run build:program -- examples/programs/page-heading` 或 `npm run build:program -- examples/programs/controller-title`。复用仓库已有 Webpack，不加载项目自定义配置；静态 ESM 编译成单个 classic JS、校验其语法与大小，生成 SHA-256、`artifact.json` 和 `program.js`。若是 Controller，再生成合法 `program.opendesk-task.json`。R1 对 Page 项目的小型 CSS/JSON/PNG/JPEG/WebP 声明进行校验和固定内嵌（详见 [Page UI API](../../framework/ui-api.zh-CN.md)）；Controller 带资源构建仍拒绝，不改变 Task v1。
4. **沿用原 R6 试运行或导入 Candidate**：Page 构建结果 `program.js` 可直接复制到 Sidebar「开发」原编辑器；或者在「发现 → 导入」进入**已有完整任务目录**，把 `.js` 导入同窗口 Sidebar 的未保存草稿。随后在「开发」展开「网页用户脚本 · 依赖与试运行」，使用原有的 **「在当前网页试运行 DOM 脚本」**按钮。Controller 编译 JS 用原底栏 **「运行草稿」**；完整任务目录也能导入生成的 Task v1 JSON 为待验证 Candidate。不得因为增加多文件项目而改动 R6 底栏和三个一级页签。Page 正式安装仍须实现类型专用 Revision/Candidate/Verification/Available/Installed。
5. **显式安装**：只有真实 Verification 和 Authority 确认 Available 后，用户才在独立任务目录选择安装。Page 将来使用 chrome.userScripts.register/unregister/update 以及重启、撤权、扩展更新对账。
6. **发布给他人**：先支持离线本地包，随后可选 GitHub Release / 目录源；在线插件市场不是当前默认依赖。Git 提交、构建、包生成、安装、在线发布是五个不同动作。不能拿 commit 或 JSON 文件冒充“已发布”。

### R3.1 build / draft / diagnostics contract

`scripts/build-program-project.mjs` defaults to production mode. Production output preserves frozen `program.js` bytes and excludes source maps. `--mode development` keeps the single JavaScript runtime output and may add only one local diagnostic file, `program.js.map`; that map is for raw generated positions in the final `program.js`, including UserScript header offsets. Browser runtime stacks must not be rewritten as source positions unless a separate runtime contract explicitly preserves and maps the raw generated stack.

Every build also writes `program.opendesk-draft.json` with format `opendesk.program-draft.v1`. The draft contains exact `sourceUtf8`, `{mode, sourceHash, byteLength}`, `{id, version, entry}`, `runtimeKind`, and authoring files from the validated local ESM graph only. It does not include `node_modules` source. UI import must validate the runtime hash and byte length, each authoring hash, and entry presence, with bounds of `source<=100000` bytes, authoring total `<=256000` bytes, `files<=32`, and envelope `<=512000` bytes. The Sidebar source viewer is a snapshot viewer; local rebuild is required for new runtime bytes. Controller Task v1 packages remain unchanged and separate from this draft envelope.

## 5. 为什么需要 Skill + 机器工具

Skill 指导 AI 按相同顺序读合同、组织源码、运行检查与发布；**机器校验器**拦截不可接受的格式和路径；**Trusted Broker/Authority** 判定实际网页权限和正式安装。三个环节缺一不可。只写提示词无法证明代码可运行，也不能代替真实浏览器回执。

本轮仓库 Skill：.agents/skills/opendesk-program-publish/SKILL.md。它可以让 Codex 在后续对话按同一规则开发，不必每次复制数千字说明。

## 6. 本轮可证明与仍然缺少的

**当前源码已实现**：项目 manifest 静态校验、模块依赖图、npm lock 声明核对、单文件 JS bundler 和最终 SHA-256 构建记录；Controller 可以生成真实 Task v1 Candidate JSON，Page 可经现有 USER_SCRIPT 预览编译 JS。**Sidebar R6 三页签、原底栏「运行草稿」和折叠的页面脚本试运行入口保持不变**；`.js` 草稿通过现有独立任务目录导入或粘贴，不保存、不自动执行。最终用户原生体验仍需受控 Chrome 验收。

**R1 已有源码**：Page 小型 CSS/JSON/图片资源打包、固定输出 SHA-256 与 [原生 UI Demo](../../../examples/programs/page-ui-basic/README.md)；**尚未实现或验收**：通用资源平台、公开发行包签名/自动升级、Page 正式安装与恢复对账、真实 Chrome 内原生 UI/CSP 端到端验收。当前 artifact 明确 `status: BUILT_UNVERIFIED` 且 `installable:false`；Controller Task JSON 仍必须独立走原有核对证据后才能 Available。

下一阶段的首个**原生验收闭环**：用同一构建产物，在受控真实 Chrome 经原完整任务目录导入 `program.js`、回到 Sidebar「开发」原页面脚本折叠区点击试运行，取得可信回执，再验证离线重跑与权限撤销。之后再接 Page 正式安装；不以 Node/VM 测试代替真实用户操作。不要先扩展脚本市场，也不要继续堆新的任务入口。

官方参考：[npm package.json](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/)、[VS Code 扩展 manifest](https://code.visualstudio.com/api/references/extension-manifest)、[VSIX 打包与发布](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)、[esbuild bundling](https://esbuild.github.io/api/)、[Chrome User Scripts API](https://developer.chrome.com/docs/extensions/reference/api/userScripts)、[MV3 远程代码政策](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements)。

## UI 与样式资源的后续扩展

[UI 开发与样式隔离 R1](ui-development-and-style-isolation-r1.zh-CN.md)补齐本项目的界面开发决策：原生 UI 默认、React/Vue 按项目可选、Tailwind 在构建期生成 CSS；资源只进入其所属界面容器。R1 已贯通小型 Page 资源构建，但未完成真实 Chrome 验收；当前 `.js/.mjs` 入口和 R1 原生 UI 也不代表 JSX/TSX 或 Vue 单文件组件已经支持。

下一批先完成原生网页 UI 的 CSS/图片资产、挂载与清理闭环，再接框架编译。扩展项目/产物合同前需定义向后兼容，不能直接向现行 v1 增加未被接受的 UI 字段，也不能为加入完整框架随意取消脚本/通信容量上限。本文既有构建命令和状态在相应实现及验收完成前保持原义。
