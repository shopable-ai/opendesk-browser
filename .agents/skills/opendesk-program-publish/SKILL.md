---
name: opendesk-program-publish
description: Develop, run, review, package and validate OpenDesk Browser programs. Prefer local source with the existing Native/MCP Controller path; preserve Page USER_SCRIPT, Task v1 and explicit publication boundaries.
---

# OpenDesk Browser · AI 本地开发与发布

本 Skill 指导项目开发，不是运行器，不授予文件、浏览器、安装或发布权限。

## 先读真实合同

1. 阅读 AGENTS.md、docs/framework/testing-guide.md、docs/framework/local-development-r22.zh-CN.md。
2. 按需阅读 docs/product/program-development-dual-format-and-sidebar.zh-CN.md、schemas/opendesk-program-project.v1.schema.json、src/platform/tasks/contract.js、src/scripting/user-scripts/page-program-contract.js。
3. 检查当前 HEAD、未提交修改及并行工作；保护现有内容、遵守集成规则。
4. 按 docs/framework/program-evidence-reuse.zh-CN.md 核对已有候选、相关输入和证据等级，不因新会话重复未变化的全量验收。

## 源码和环境

- 单文件不强制 package.json；本地绑定明确 runtimeKind/siteOrigin。
- 多文件沿用 package.json.opendesk、独立 ID、入口与网站范围，不新增项目格式。
- src/main.js 明确 default export，模块采用静态相对 ESM import。
- Controller 使用原 page/Locator/RunHost/Authority；Page DOM 属于 USER_SCRIPT，不交叉冒用。
- 当前 P0 本地运行支持 Controller；Page 专用预览、Sidebar 目录连接、受管热替换属于 P1/P2/P3，未落地不得声称可用。
- Local Dev 不支持任意 npm/HTTPS import、动态 loader、项目 shell 或运行时代码生成。不改用外部 CDP/eval 来假装通过。

## 默认开发闭环

1. 确认 stdio MCP 配置及 --allow-project 的明确允许路径。
2. opendesk.dev.attach 获取 bindingId；status 核对 Native、真实 Host、目标和 targetError。
3. 修改真实本地文件，不生成 program.js/草稿 JSON 作为开发交接。
4. opendesk.dev.run 使用代表本次有意执行的 requestId。
5. 保存 runId、revision.sourceHash、source.sourceHash，再用 result 查询原运行。
6. 依据真实错误修改；再次有意执行用新 requestId，不对未知效果盲目重放。

MCP 参数直接传递，不要求用户创建 frozen-request.json 或 JSON-RPC 文件。PENDING 仅表示入场；成功要有真实终态、持久 resultId 与 retirement。stop 走原 RunHost，再查 result 确认收尾。

attach.connected:true 仅是本地绑定。Sidebar 关闭、Native 断线或权限不足时报告真实阻塞。当前 MCP 重启不自动恢复原 Session 绑定/运行归属。

## 安全边界

- 只读取允许项目必要依赖/资产，不上传工作区、不读凭据、不执行项目配置或 shell。
- 保留 realpath、symlink、UTF-8、大小、真实 SHA-256 和并发修改检查。
- 已入场 Controller 源码和目标冻结，文件变化只影响下次执行。
- 尊重网站授权、documentId、Host 归属与既有运行槽。
- OUTCOME_UNKNOWN 不表示未执行：保留原 requestId/runId，核对真实状态，不自动重复副作用。
- 没有真实映射就不编造运行错误源码行号。
- 不新增 Sidebar 一级页签，不覆盖未保存草稿，不把编辑器改成文件树 IDE。

## 正式打包与安装

仅在需要不可变产物、导入或发布时使用：

    node scripts/validate-program-project.mjs <project>
    npm run build:program -- <project>

build:program 不再是本地 Controller 日常开发前置步骤。依赖锁、最终字节哈希、Candidate → Verification → Available → Installed 合同保留。构建、MCP 成功、Git commit 不等于安装或发布。Page 正式安装按类型合同处理，不冒用 Controller 证据。未授权不远端发布或 npm publish。

## 最小验收与交付

优先 examples/programs/local-controller 与 examples/tasks/demo-form.html：首次 MCP 运行和查结果；修改 src/extract.js 后不 build、不上传再运行；核对新 runId、真实哈希、输入图、新结果。按受影响范围验证缺失、语法、并发修改、断线、目标变化、权限与大小。

报告真实文件、项目/入口、运行类型、两次身份/结果、定向测试和限制。真实 Chrome、实际 Codex、Node 及最终验收分别写 workstream；未测标 NOT_TESTED，不以 mock 或编译成功代替。
