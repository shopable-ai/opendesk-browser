---
name: opendesk-program-publish
description: Create, edit, review, package, validate or publish OpenDesk Browser programs; supports multi-file ESM projects, legacy UserScript imports, Page USER_SCRIPT programs and Controller tasks.
---

# OpenDesk Browser · AI 项目编写与发布规则

本 Skill 是开发流程，不是运行器、打包器或安装授权。复杂项目采用 package.json 中的 opendesk 字段和本地 ESM 模块；简单传统油猴脚本继续接受 @require。

## 读取真实合同
- 首先阅读 **docs/product/program-development-dual-format-and-sidebar.zh-CN.md**（日常操作与 R6 不变性合同）、docs/architecture/browser-framework/program-project-authoring-r1.zh-CN.md、schemas/opendesk-program-project.v1.schema.json、src/platform/tasks/contract.js、src/scripting/user-scripts/page-program-contract.js。
- 重新获取当前 HEAD、工作区与并行 PR，保护他人的修改。不要覆盖其他 Agent、伪造 Native 测试或以历史 SHA 作为固定基线。
- 根据程序行为确定 runtimeKind：页面 DOM 增强为 page-userscript；跨标签页自动化为 controller。不要把第三方 UserScript JS 注入 Controller Worker / SW。

## 编辑源项目
- 每个复杂程序独立一个目录，一个 package.json、一个程序 ID 和 SemVer 版本。项目入口和运行权限统一声明在 package.json.opendesk；标准 npm name/version/dependencies 仅在根部声明一次。
- src/main.js 应明确 export default 入口；分文件采用 import './relative.js'，npm 包须在 dependencies 和 package-lock.json 中锁定。不要通过运行时 import 'https://...'、未审查动态 import 或 eval 绕过构建。
- 页面只批准 USER_SCRIPT，规则由 pageRules 声明；Controller 严格沿用 Task v1 的 page.automation / origin / paramsSchema 合同。
- CSS/JSON/图片只能作为项目资产声明，不能因 JSON 中列出路径就宣称已完成注入。

## 当前真实校验命令
    node scripts/validate-program-project.mjs examples/programs/page-heading
    node --test tests/environment/program-project.test.mjs

检查结果 AUTHORING_VALID_NOT_PACKAGED 表示静态项目结构、ESM 引用、声明及锁文件约束被核对，**并未执行 bundle、导入候选、原生 Chrome 或安装**。

## 本地 ESM 构建命令（已接入真实编译器）

    npm run build:program -- examples/programs/page-heading
    npm run build:program -- examples/programs/controller-title

命令会先严格检查源项目，再使用仓库现有 Webpack 将静态依赖图构建为单个 classic JS，计算最终 SHA-256，并在忽略版本控制的 artifacts/programs/ 下写入不可变 program.js 和 artifact.json。Controller 还会生成可导入的 program.opendesk-task.json（Candidate，绝不是 Available）。Page 只能经**原 R6「发现 → 导入」完整目录转交同窗口 Sidebar 草稿**（或粘贴源码），再在「开发」原有「网页用户脚本 · 依赖与试运行」折叠区手动运行；**不得因此新增页签或替换 R6 底栏按钮**。Page 尚无正式自动安装。CSS/JSON/image 当前只验证声明，不注入；构建时明确拒绝未支持的 assets。

## 发布门槛
- 本地 JS bundling 与产物哈希已可执行，但 artifact.json 的状态仅为 BUILT_UNVERIFIED；它不是已签名或可安装的正式 Page 发行包。项目源码 JSON 不能自称为发行包，源 npm-lock 也不是最终字节哈希。
- Controller 产物只有严格兼容现有 opendesk.task-package.v1 合同时，才能调用现有 Candidate/Verification/Available/Installed 链。Page 尚缺专用 P2 生命周期，不能冒用 Controller 验证或注册描述。
- 区分 Git commit、源码验证、bundle、包生成、Candidate 导入、Available、用户安装和远端市场发布。不得在用户未明确授权时进行自动安装、远端发布或 npm publish。
- 对来路不明的 npm 包，未经审核不执行安装钩子或其他自定义脚本。npm package-lock 不等于最终浏览器代码的 SHA-256 锁。

## 交付回执
简短报告项目路径和入口、运行类型、源码验证结果、发布产物哈希（如果真实存在）、Native 用户验证、尚未实现的发布环节。缺少真实 Browser 回执标 NOT_TESTED，不以 Node Mock 替代。

用户使用本 Skill 的方法：告诉 AI「按 opendesk-program-publish Skill 创建或检查这个程序」。不要每次重复长篇 GOAL。
