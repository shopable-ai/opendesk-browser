# OpenDesk Browser 多 Agent 并行开发与 main 集成规范（现行 · 2026-10-13）

> **权威规则：以仓库根目录 [AGENTS.md](../../AGENTS.md) 和用户针对具体任务的明确授权为准。** 2026-10-08 旧版“自动建立 `agent/*` 分支、Git Worktree、PR”已被 2026-10-12 的 **main-only** 用户决定替代。旧讨论可查 Git 提交 `7bf72497` 和 [历史治理记录](workstreams/parallel-governance-20261008.json)，但**不得当作当前操作步骤**。

## 当前写入规则

1. 默认仅 `main` 可编辑、提交、推送。未经用户对**具体任务**明确同意例外，禁止建立/切换 `agent/*` 分支、Git Worktree 或 PR。
2. 多个对话可以同时**只读研究和核查**；一个真实本地工作目录同一时刻只能有一个 Agent 修改。同一入口/权限协议/存储 Schema 还必须避免跨工作区重叠修改。
3. 写入前检查工作区分支、`git status`、本地与远端 HEAD、修改文件/并行任务，确认无未提交覆盖风险和共享资源冲突。
4. 检测到其他 Agent 正在编辑、同文件冲突、不能解释的未提交修改或共享 CFT/profile/端口/dist/ZIP 占用时，**先只读核查并明确告知用户**，按串行或用户明确批准的例外继续，不能自行创建分支来规避。
5. 用户授予本轮安全提交时，需完成必要定向测试，提交前重新核对远端 `main` 以及目标文件差异；不存在“因为有授权就允许覆盖新提交”。
6. 禁止 `git push --force`、`git reset --hard`、`git clean`、删除他人未合并的提交、伪造或覆盖旧 `public-owner.json`、旧原生验收记录。
7. 历史非 main 分支只读审计；合并或删除需用户明确要求，必须确认独有提交已安全保存。

## 共享测试资源与证据

受控 Chrome for Testing/profile、IndexedDB、固定端口、临时服务器、build/dist、安装 ZIP、冻结候选等都需要单一写入者或明确交接。Node Mock 不等于原生 Chrome PASS；其他对话的 Chrome PASS 只在证据身份、包哈希、相关输入与合同确实一致时可按 [测试复用指南](testing-guide.md) 沿用。

每个工作流在 `docs/framework/workstreams/` 的专属文件记下：本次 HEAD、目标目录和 API、并行风险、实际 diff、测试命令/结果、Chrome 版本和包哈希、原始日志以及未测试项。`NOT_TESTED` 不可提升为 PASS；原 603＋19、B05、F3、ZIP 合同不允许改写。

## 在真实 Mac 工作区的只读核查命令

```bash
cd /Users/shopme/Documents/workspace/opendesk-browser
git branch --show-current
git status --short
git rev-parse HEAD
git fetch origin main
git rev-parse origin/main
git diff --name-only
```

此处命令是**核查**，不证明当前工作区实际干净，也不授权自动推送。若对话无法访问用户 Mac，必须如实标记本机工作树和 Chrome 测试 `NOT_TESTED`，只可对授权范围内的远端文件做不覆盖的条件式修改。

## 历史规则的优先级

旧版 `parallel-development.md` 曾提议自动创建独立分支、Worktree 和 PR，那是历史候选，已失效。当前 `AGENTS.md` 的 main-only 决策优先于旧提示词、旧 PR 说明和其他对话惯例。任何改变此规则都需要用户针对具体任务明确授权。
