# 同一 main 工作目录按范围并行写入规则修订

日期：2026-10-12（Asia/Shanghai）。负责人：本对话 `01a12f2c`。状态：COMPLETE（文档规则修订）；本轮文件写入已 RELEASED，无后台进程或共享资源占用。

用户明确要求优化 AGENTS.md 的并行写入/单写入约束：一般不同文件无冲突即可继续。本轮只修订协作规则，保留 main 限制、提交/推送/发布授权和全部原生验收合同。

起始 HEAD：`4250715464d743813f669a77c2b9dff5d4c526e7`。首次核查存在其他任务未提交修改；之后另一任务提交使 AGENTS.md 原有 diff 消失，本轮以当前文件内容增量修改，不回写早期快照。原始 AGENTS.md SHA-256：`e1014b43635594fdf3a50cf94bd4a90aeacdad3f0d86c0f9f7b96570143ce2ef`；parallel-development.md：`5e4100e2716f937c8355e3840ab583eb4599644baacff485f6bd9c39316eeb9b`。

写入范围仅 `AGENTS.md`、`docs/framework/parallel-development.md` 和本记录。独立原生 architect 子 Agent 只读评审冲突边界，无写入范围。其他文件/公共产品 API 不修改；不占用 Git 索引/提交、Chrome/CFT、端口、数据库、dist、ZIP 或发布资源。

方案与通过条件：取消整个工作目录单写入和 dirty 全局停工；独立文件/兼容契约直接并行；同文件落盘、公共契约切换、共享 Git 事务与具体输出/测试资源分别协调；漂移结果不冒充当前候选 PASS。修正配套 v1 自动 worktree/PR 规则，保留历史 owner、Sidebar 依赖示例与验收边界。记录明确是协作约定，不伪装成原子锁。

复用：已读 testing-guide.md 跨对话入口、extension-loading-source-20261012.md、sidebar-draft-run-01a12ef0.md。本轮只有文档改变，不重跑产品组件/构建/原生/F3/ZIP 验收，不提升既有证据等级。计划仅做文档 diff、规则一致性、链接和非目标段落保持核对；不暂存、不提交、不推送。

验证：`git diff --check -- AGENTS.md docs/framework/parallel-development.md` 通过；一次性 Python 静态核对通过：以起始 HEAD 内容及 SHA-256 确認基线，AGENTS.md 非并行规则段落逐字保持，旧的全工作目录单写入/自动 worktree 指令移除，本轮三个文件的本地链接、换行、尾部空白和冲突标记有效，并确认当前分支 main。产品测试/构建/Chrome/F3/ZIP 本轮未执行（纯文档变更，不产生新产品 PASS）。

独立 architect 子 Agent 对修改后的实际文本只读评审：无阻塞问题；保留两项限制——工作流声明属于协作约定，不能原子地阻止竞争写入；前后哈希一致不能排除中途输入变化，正式冻结 PASS 仍需稳定窗口或已授权稳定快照。Git 暂存/提交机制对照 git-scm 官方 git-add/git-commit 文档，来源列在协议中。

实际修改仅计划的三个文档；不修改其他任务文件、不暂存/提交/推送。后续任务直接按范围并行；只有实际冲突的文件、契约或资源需要协调，规则本身不构成技术锁或额外授权。
