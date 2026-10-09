# 本地 AI 开发与浏览器执行闭环 R1

状态：IN_PROGRESS（2026-10-09，Asia/Shanghai）。工作流 `01a12158-04de-7621-bccb-b274ce4442b2`；分支 `agent/local-ai-loop-r1-01a12158`；初始远端 main `b49dcc96`。

目标：实际 Mac Codex 修改授权 JS 项目，经已有 stdio MCP / Native / Controller / RunHost 执行最新源码，返回真实持久结果和错误定位；复用现有 npm/HTTPS 锁解析，保持 Sidebar 三页签与发布边界。

已有能力：PR #37（MCP/本地 Resolver）、#38（npm 构建闭包）已合入；R10/R10.1 主干已有统一内存构建、锁缓存及命名 Native 实例。原 Chrome CI P0-P3 成功不提升为用户 Mac Codex PASS。相关证据先读 `local-dev-r22-c036.json`、`r101-resolver-01a120c0.md`、`r101-audit-01a120eb.json`。

已确认缺口：本机没有 OpenDesk MCP 配置；当前原生验收驱动仍将已改为 checkbox 的源码模式开关当 select 操作，并直接启动 CFT。拟修复现有驱动、增加实际 Codex MCP 执行及错误修复案例与文档，不新增运行内核/权限/数据库。

通过条件：实际 Codex MCP 工具调用、两次不同源码 hash 与不同 runId/resultId、旧结果冻结；真实运行失败与定位；修复后真实成功；可信 Chrome 权限/Sidebar 操作和独立 launcher 清理。组件、Mac Native、实际 Codex、最终 F3/ZIP分别记录。

资源占用：仅自己的 worktree `/Users/shopme/.codex/worktrees/local-ai-loop-r1/opendesk-browser`，自己的 dist；命名 Native 实例 `local-ai-r1-01a12158`，独立复制的 CFT155 app 与 launcher 新建 profile；demo-form.html 使用临时 loopback 端口。默认 Native、43111、其他 CFT profile/dist/ZIP 不占用。原证据和主工作区差异保留。

验证顺序：现有记录/输入核对 → 受影响定向单测 → 当前候选 build/check → Mac CFT 原生完整操作 → 实际 Codex 的本地改错再执行 → 最新 main 冲突/身份复核 → 经审查 PR 串行集成。失败与 NOT_TESTED 保留，不强行合并。
