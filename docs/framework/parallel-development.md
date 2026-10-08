# OpenDesk Browser 多 Agent 并行开发协议 v1

> 状态：候选协议。以本文件所在分支的 PR **合入 `main` 后**为生效时点；不能把候选分支中的文字视为已解除现有 main/native writer 登记。2026-10-08。

## 目标与三个边界

1. **代码可以并行。** 一个 Agent 对应独立 Git worktree + 独立任务分支 + 独立进度证据，正常编辑、定向测试、提交和推送无需等待其他任务结束。
2. **集成必须可控。** `main` 只接收经过审查的 PR，不允许所有 Agent 共用一个工作目录直接改 main。集成者按最新主干逐个合并；文件冲突、API 冲突与测试失败必须明确解决。
3. **共享外部资源不能乱抢。** Mac 上同一个 CFT/Chrome profile、固定端口、扩展持久库、dist/ZIP、冻结发布候选等资源，需要独占预约、独立资源命名空间，或完成真正释放后交接。独占的是**资源和合入权**，不是整个仓库的阅读/开发权。

旧的 `docs/framework/public-owner.json` 是现有 main/native writer 的历史登记；不删除、不重写、不让新 Agent 伪造 threadId 或 release。过渡期：本协议尚未合入 main 时，原有保护继续适用于 main 与共享 native 资源；在独立分支中形成候选并不等于绕过 main 验收。

## 工作区模型

| 角色 | 可同时存在 | 写入位置 | 不得做的事 |
| --- | --- | --- | --- |
| 功能 Agent | 多个 | 各自 `agent/<主题>-<唯一标识>` 分支和 worktree | 写别人工作目录、强推 main、覆盖他人分支 |
| 审计 Agent | 多个 | 只读；意见记录在 PR 中 | 把审计当成原生验收 |
| 集成 Agent | 可轮换，**同一时刻一个在合 main** | 已验证 PR → `main` | 不检查主干漂移就合并、跳过冲突与关键检查 |
| 原生验收操作者 | 每份共享资源独占，可通过隔离 profile 并发 | 自己的 CFT profile、端口和证据目录 | 把另一个候选/浏览器的证据移用为本候选 PASS |

在本机创建第二个工作区，**不得复用原来的 main 工作目录**：

```bash
cd /Users/shopme/Documents/workspace/opendesk-browser
git fetch origin
git worktree add -b agent/sidebar-p0-<unique-id> ../opendesk-browser-sidebar-p0 origin/main
cd ../opendesk-browser-sidebar-p0
git status --short
git branch --show-current
```

`<unique-id>` 替换为自己唯一的简短标识；worktree 名称、Chrome profile 路径、HTTP 端口及测试产物路径都应不同。别的 Agent 也使用自己的分支和目录。云端 Agent 不能直接写本机时，可在 GitHub 同名独立分支提交候选 PR；**不能据此宣称本机或 Chrome 验收通过**。

## 每个 Agent 的证据合同

每个分支有唯一 `docs/framework/workstreams/<workstream-id>.json`，由该 Agent 更新自己的文件，不修改中央 owner。至少记录：

- 唯一工作流 ID、分支名、起始 main SHA 与工作范围；
- 预期写入文件/API、与其他工作流的先后依赖、冲突风险；
- 实际修改文件、定向测试命令和真实结果；未执行写 `NOT_TESTED`；
- 原生 Side Panel、网页 DOM/HTTP、浏览器关闭重开的证据路径（缺失则标 `NOT_TESTED`）；
- 阻断、剩余任务和 PR 链接。不得把提交、绿色 mock 测试、页面截图替代真实执行证明。

PR 描述应摘要以上字段，并附 `git diff --stat`、协议兼容性和回退说明。冻结候选后的任何产品输入变化，都需要重新识别受影响的测试与证据，不覆盖旧 receipt。

## 编辑冲突与主干集成

- 可以并行修改不同模块；即使不同 worktree 修改同一文件也不会互相覆盖，但 PR 合入前必须进行三方合并和行为审计。
- **同一执行入口、存储 schema、消息协议、RunHost/Controller admission 或 `async function main()` entryFormat 的变更视为高冲突接口**。一个工作流负责协议，其他工作流以接口草案/消费端开发为主，必须在接入时复核接口。
- 每次合入核实 main HEAD、PR 目标和提交列表、未提交变化、合同测试；合并前先同步最新 main 后做定向回归。不得用 `reset --hard`、`clean`、`push --force` 或大段复制旧文件来处理冲突。
- GitHub 推荐对 `main` 配置：必须 PR、必要 CI 检查、至少一次审查、禁止 force push；可用 merge queue 串行合入。**文档不能代替 GitHub 上真实启用的保护规则**。如果尚未配置，集成者必须人工落实同等级检查。
- 单个 Agent 完成工作不代表整体 F3/ZIP 验收；全链路候选仍须按 `AGENTS.md` 的冻结合同单独验收。

## 当前 Sidebar R1 并行分工

**主路径（不能跳过）：**

- **P0 草稿直接运行**：先核对本地最新 `async function main()` 协议；修复新草稿、A→B→C freeze、可信手势权限、精确 document、相同 RunHost/Worker/Result、取消/重连安全语义；真实 Chrome Side Panel 与 DOM/HTTP 验证后才算通过。
- **P1 三页签**：可先独立准备 UI 结构和信息架构，但 `script-editor.js`、`tool.html` 的最终接线须在 P0 完成后集成；不能在 P0 失败时以界面改造取代修复。
- **P2 任务包/安装**：可独立讨论 manifest/schema 与威胁模型，但正式 Available/Installed/run 集成必须等待 P0 正式运行路径以及真实可验证任务候选；未经正式验证不可显示 Available。

**可不等 P0 的隔离工作：** 独立测试设计、文档、API 契约审计、第三方库映射、只读 Legacy 核查。不得另造执行器、持久存储或权限体系。

## 最终交付与回滚

各 PR 可撤回而不影响 main；已合入出现真实缺陷时用显式 revert 或经过审查的修复 PR，不抹掉原记录。普通用户运行交付任务不能依赖 Codex/MCP/Native Messaging；真实运行结果仍受原有受控目标、授权、停止、deadline、unknown-effect 与持久化栅栏约束。
