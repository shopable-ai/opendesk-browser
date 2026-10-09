---
name: opendesk-program-publish
description: Develop, run, review, package and validate OpenDesk Browser programs. Prefer local source with the existing Native/MCP Controller and typed USER_SCRIPT paths; preserve Task v1 and explicit publication boundaries.
---

# OpenDesk Browser · AI 本地开发与发布

本 Skill 指导项目开发，不是运行器，不授予文件、浏览器、安装或发布权限。

## 先读真实合同

1. 阅读 AGENTS.md、docs/framework/testing-guide.md、docs/framework/local-development-r22.zh-CN.md。
2. 优先阅读 docs/product/program-development-dual-format-and-sidebar.zh-CN.md（统一用户操作）；需要 HTTPS ESM 时再读 docs/architecture/browser-framework/https-esm-imports-r1.zh-CN.md；按需查 schemas/opendesk-program-project.v1.schema.json、src/platform/tasks/contract.js、src/scripting/user-scripts/page-program-contract.js。
3. 检查当前 HEAD、未提交修改及并行工作；保护现有内容、遵守集成规则。
4. 按 docs/framework/program-evidence-reuse.zh-CN.md 核对已有候选、相关输入和证据等级，不因新会话重复未变化的全量验收。

## 源码和环境

- 单文件不强制 package.json；本地绑定明确 runtimeKind/siteOrigin。
- 多文件沿用 package.json.opendesk、独立 ID、入口与网站范围，不新增项目格式。
- src/main.js 明确 default export，模块采用静态相对 ESM import。
- Controller 使用原 page/Locator/RunHost/Authority；Page DOM 属于 USER_SCRIPT，不交叉冒用。
- P0 Controller、P1 Page USER_SCRIPT、P2 Sidebar 连接已在候选 45161bcb 通过真实 Chrome 并合入 main；P3 受管热替换已实施，独立原生验收以 workstream 为准。按当前 workstream 身份核对，不能借旧候选通过提前关闭新范围。
- Local Dev 不支持任意 npm/HTTPS import、动态 loader、项目 shell 或运行时代码生成。不改用外部 CDP/eval 来假装通过。

## 先选输入路径：不让简单脚本变复杂

| 源码类型 | 正确工作流 |
| --- | --- |
| 单文件普通 Controller / Page JavaScript | 用户在 Sidebar「开发」直接编写并明确运行；不自动插入 UserScript 声明 |
| 单文件或相对静态 ESM 多文件（Controller/Page） | 既有 `--allow-project` → MCP/Native 或 Sidebar「本地项目连接」→ 重新读取最新源码 → 权限/RunHost，**不需要打包 JSON** |
| 带 npm 包的 Program | 项目明确声明 dependencies + package-lock，项目内 `npm ci --ignore-scripts` → `build:program` 冻结 JS；正式导入/试运行 |
| 带 HTTPS URL 静态 import 的 Program | 开发者审阅 URL/第三方源码后**明确授权** `build:program -- <project> --lock-remote` 进行第一次锁定，后续无该参数离线构建；提交 `opendesk.remote-lock.json` 与 `.opendesk/remote-cache` 的固定原始字节 |

- 项目根 `npm ci` 只安装 OpenDesk 构建工具，**不会替用户项目安装依赖**。支持包的项目另执行 `npm ci --prefix <project> --ignore-scripts`，不可将下载脚本当默认构建权限。
- 不把 `--lock-remote` 设成每次执行或重试时自动开启；`E_REMOTE_UNLOCKED` 时请开发者决定是否批准新 URL。SHA-256 和缓存字节一致不等于依赖可信或许可证合规。
- `E_ESM_BUILD_REQUIRED` 表示 Sidebar 手工编辑区不能直接执行未打包的 ESM；`E_DEV_DEPENDENCY` 表示已连接本地 Resolver 尚不支持 npm/HTTPS。只能选择明确构建后导入，不用网络 eval、普通 fetch 注入页面或独立 CDP 代替。
- 不把构建 `BUILT_UNVERIFIED`、Node VM PASS、实际 Chrome CI PASS 与**用户 Mac Codex** 的验收混为一谈；必须绑定同一候选来源和原始结果证据。

## 默认开发闭环

1. 确认本地 stdio MCP 配置及 --allow-project 的明确允许路径；扩展与复制安装的 Native Host 均需包含当前能力，旧 Host 按指南一次 update。
2. 从 opendesk.dev.status 获取自动绑定目录的 bindingId，或显式 attach；单文件必须指定 runtimeKind/siteOrigin。status 核对 Native、真实 Host、目标和 targetError。
3. 修改真实本地文件，不生成 program.js/草稿 JSON 作为开发交接。
4. opendesk.dev.run 使用代表本次有意执行的 requestId。
5. Controller 保存 runId、revision.sourceHash；Page 保存 previewId、sourceHash，分别用 result 查询原执行。核对实际身份与 source.sourceHash。
6. 依据真实错误修改；再次有意执行用新 requestId，不对未知效果盲目重放。

MCP 参数直接传递，不要求用户创建 frozen-request.json 或 JSON-RPC 文件。Controller 的 PENDING 仅表示入场；成功要有真实终态、持久 resultId 与 retirement。stop 走原 RunHost，再查 result 确认收尾。Page 只有 USER_SCRIPT 预览回执，不产生 Controller 持久 Result，不能用 Controller Stop 终止；受管 Page 的 dev.stop({previewId}) 通过 page.dispose 清理原世界登记资源，回执为 preview-retired / managed-ui-only；非受管 Page 明确报不支持。不回滚业务效果。

attach.connected:true 仅是本地绑定，status.connected:true 仅表示 Native 可达。Sidebar 使用同一个 MCP 进程和原 Native Socket 的只读 provider，不另起服务。Sidebar 关闭、Native 断线或权限不足时报告真实阻塞。MCP 重启自动重新绑定允许的目录，但不恢复原 Session 请求摘要或 Run/Preview 归属。

丢失入场回执时，在同一个 MCP 会话将原 requestId 作为 admissionRequestId 调用 result/diagnostics，只读核对原 Native ledger；不重新读盘编译，不重发 run.start/page.preview。NOT_FOUND、恢复查询断线和 OUTCOME_UNKNOWN 都不等于原请求未执行。新的 Sidebar registration 不能接管旧 Host 运行。admissionRequestId 仅指原 dev.run，不指 Stop；Page 清理丢回执时只查询原 previewId，不自动重新清理。

## 安全边界

- 只读取允许项目必要依赖/资产，不上传工作区、不读凭据、不执行项目配置或 shell。
- 保留 realpath、symlink、UTF-8、大小、真实 SHA-256 和并发修改检查。
- 已入场 Controller 源码和目标冻结，文件变化只影响下次执行。
- 尊重网站授权、documentId、Host 归属与既有运行槽。
- OUTCOME_UNKNOWN 不表示未执行：保留原 requestId/runId，核对真实状态，不自动重复副作用。
- 没有真实映射就不编造运行错误源码行号。
- 不新增 Sidebar 一级页签，不覆盖未保存草稿，不把编辑器改成文件树 IDE。

## 正式打包与安装

仅在需要不可变产物、导入或发布时使用；npm/HTTPS 的当前可用路径也通过该构建器，而不是绕过 Local Dev Resolver：

    node scripts/validate-program-project.mjs <project>
    npm run build:program -- <project>

build:program 不再是本地 Controller / Page 日常开发前置步骤。依赖锁、最终字节哈希、Candidate → Verification → Available → Installed 合同保留。构建、MCP 成功、Git commit 不等于安装或发布。Page 正式安装按类型合同处理，不冒用 Controller 证据。未授权不远端发布或 npm publish。

下一轮如要实现 Local Dev 对**已锁定 npm + HTTPS 静态 import** 的直连支持及真实 Mac Chrome 验收，读取 `docs/framework/prompts/goal-r10-1-local-codex-https-esm-acceptance.md`；当前不能凭已合并 PR #37/#38/#39 声称该闭环已完成。

## 最小验收与交付

优先 examples/programs/local-controller 与 examples/tasks/demo-form.html：首次 MCP 运行和查结果；修改 src/extract.js 后不 build、不上传再运行；核对新 runId、真实哈希、输入图、新结果。按受影响范围验证缺失、语法、并发修改、断线、目标变化、权限与大小。

Page 使用 examples/programs/local-page-ui：修改模块文字/步长与 CSS，再从 USER_SCRIPT 预览；核对 previewId、世界、documentId、实际哈希、图片、Shadow DOM、原生按钮与网站表单未受影响。显式再运行先验证新代码，再等待旧受管实例清理；异步回调和 onDispose 必须返回 Promise。检查清理失败不挂新 UI、MCP 断开时 Run 禁用而 Sidebar 仍可停止原受管实例。未知清理结果保留栅栏，关闭原标签页后再使用新文档；不盲目重试。

报告真实文件、项目/入口、运行类型、两次身份/结果、定向测试和限制。真实 Chrome、实际 Codex、Node 及最终验收分别写 workstream；未测标 NOT_TESTED，不以 mock 或编译成功代替。

## R9 项目依赖与产物来源（正式构建场景）

- 用户项目 npm 包属于该项目的 package.json 与 package-lock.json；`Local Dev` 即时目录运行暂不接受 npm/HTTPS 模块，不能将正式构建能力当成即时运行权限。
- 新依赖先核实消费者、版本和许可证；用 `npm install --save-exact --ignore-scripts` 固定来源，后续 `npm ci --ignore-scripts`。
- 直接 npm import 要满足精确版本、lockfile v2/v3 根依赖一致、HTTPS resolved、SHA-512 integrity。此静态验证不替代 npm 的真实安装、tarball 校验或安全审计。
- 构建期 HTTPS ESM 按 `docs/architecture/browser-framework/https-esm-imports-r1.zh-CN.md` 锁定缓存，正式发布时只用可追溯离线字节，不运行时动态 CDN import。
- 正式 Webpack 回执分别检查 `npmDependencies`、`npmBundledModules`、`npmLockSha256`、`sourceHash`，扩展固定 WXT 产物另看 `bundleModules`；声明依赖、打包成功、浏览器运行与安装验收不能互相代替。
- 例子：`npm ci --prefix examples/programs/page-npm-lodash --ignore-scripts` 后运行 `node --test tests/integration/npm-project-closure.test.mjs`；完整依赖迁移见 `docs/architecture/browser-framework/third-party-library-map.md`。
