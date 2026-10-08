# OpenDesk Browser R2：多文件 ESM、JSON 包与 AI 发布的最终方向

> 决策日：2026-10-08。本文区分**当前已实现的源码校验**与**未来构建/正式安装**。不重释已有 Controller Task v1，不创建第二套浏览器执行器。

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
        panel.css            # 未来 bundle 资产；源声明不等于浏览器已注入
      README.md

默认只维护一个**开发者手写的描述入口**：package.json 中的 opendesk 对象。不要重复维护 opendesk.json 和另一份手写 manifest。未来发行 manifest 必须由受信构建器从源码 + 最终 JS/资源字节生成。

当前项目描述格式是 opendesk.project.v1，注意它是“可编辑源码项目”，**不是** opendesk.task-package.v1 或可直接安装的 Page 包。示例在 examples/programs/page-heading；机器校验和 JSON schema 在 scripts/validate-program-project.mjs、schemas/opendesk-program-project.v1.schema.json。

## 3. 两个独立维度不能混淆

**源代码写法：** UserScript metadata 或现代 ESM 多文件。

**执行环境：** Page USER_SCRIPT 负责 DOM；Controller / RunHost / ChromePage 负责自动化。

编译适配器要把 ESM 源码依赖图编译为运行环境允许的固定 JS 字节。ESM 写法不代表浏览器运行阶段需要支持远程模块解析，也不应向 Controller Worker 注入页面 UserScript 依赖。

    package.json + src/main.js + src/dom.js
                  │
        静态检查（已实现）
                  │
        可信 bundler（待实现）
                  │
        SHA-256 冻结后的本地 JS + assets（待实现）
             ┌────┴────┐
        Page USER_SCRIPT    Controller RunHost
             │                 │
       Page 类型正式安装待做   已有 Task v1 合同（适配器待做）

允许本地 import './dom.js'。npm 裸包导入必须在依赖声明中且有 package-lock.json。直接 import 'https://cdn.example/lib.js' 和未受控动态 import() 不作为第一阶段默认方案；若将来允许 URL 来源，必须在构建时经用户授权、下载、哈希固定并消除运行期网络依赖。

## 4. 编辑和发布怎么操作

1. **创建/编辑**：AI 在本地多文件源码中开发；不要让 Sidebar 变成大型 IDE。保留单文件立即调试入口。
2. **静态校验（当前可执行）**：运行 node scripts/validate-program-project.mjs examples/programs/page-heading。它核对源码目录、相对模块图、权限声明、npm lock 一致性和源文件哈希，返回 AUTHORING_VALID_NOT_PACKAGED。它不会触发网络、执行第三方代码或发放权限。
3. **构建冻结（下一阶段）**：复用仓库已有 Vite/Rollup 或审查后的轻量 bundler，生成一个或少量确定性的 JS/资源资产；禁止未解析 import、网络模块、偷偷新增动态 chunk。固定实际最终字节 SHA-256。不能只锁 package-lock.json。
4. **导入 Candidate**：Controller 必须严格转换成现有 Task v1 的 async-main / 单 origin / page.automation 合同。Page 必须先建立类型专用的 Revision/Candidate/Verification/Available/Installed，不得把 Page 改称为 Controller Task。
5. **显式安装**：只有真实 Verification 和 Authority 确认 Available 后，用户才在独立任务目录选择安装。Page 将来使用 chrome.userScripts.register/unregister/update 以及重启、撤权、扩展更新对账。
6. **发布给他人**：先支持离线本地包，随后可选 GitHub Release / 目录源；在线插件市场不是当前默认依赖。Git 提交、构建、包生成、安装、在线发布是五个不同动作。不能拿 commit 或 JSON 文件冒充“已发布”。

## 5. 为什么需要 Skill + 机器工具

Skill 指导 AI 按相同顺序读合同、组织源码、运行检查与发布；**机器校验器**拦截不可接受的格式和路径；**Trusted Broker/Authority** 判定实际网页权限和正式安装。三个环节缺一不可。只写提示词无法证明代码可运行，也不能代替真实浏览器回执。

本轮仓库 Skill：.agents/skills/opendesk-program-publish/SKILL.md。它可以让 Codex 在后续对话按同一规则开发，不必每次复制数千字说明。

## 6. 本轮可证明与仍然缺少的

**当前实现**：项目 manifest 静态类型检查、相对模块依赖图检查、禁止 URL/dynamic import、npm lock 声明核对、资源文件路径及哈希、示例与 Agent Skill。页面 D1 的 @require 审核/锁/preview 消费者继续保留。

**尚未实现**：真实 ESM bundler，发行包签名/最终产物锁，源码项目直接导入 Task Catalog，Page 正式安装/对账，Chrome 原生端到端验收。任何校验输出都应明确 installable:false。

下一阶段首个用户闭环只选一个小 ESM 项目：构建固定 JS → 用同一 D1 页面预览执行 → 真实 Chrome 成功回执 → 离线重跑 → 再接入正式安装。不要先扩展脚本市场，也不要继续堆新的任务入口。

官方参考：[npm package.json](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/)、[VS Code 扩展 manifest](https://code.visualstudio.com/api/references/extension-manifest)、[VSIX 打包与发布](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)、[esbuild bundling](https://esbuild.github.io/api/)、[Chrome User Scripts API](https://developer.chrome.com/docs/extensions/reference/api/userScripts)、[MV3 远程代码政策](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements)。
