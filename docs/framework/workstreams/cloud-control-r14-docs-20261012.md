# Cloud Control R1.4 Final 文档 — 2026-10-12

负责人：本次获授权 writer；状态：PAUSED_HANDOFF（用户明确要求暂停以协调 main 合并）。已读取 `~/.codex/prompts/writer.md`、仓库 `AGENTS.md`、测试复用入口、目标当前内容与 diff、只读上位基线。分支为 `main`；三个既有目标初始 diff 为空，本记录初始不存在。

唯一写入范围：

- `docs/architecture/browser-framework/cloud-control-r1.zh-CN.md`
- `docs/contracts/execution-control/v0.2/README.zh-CN.md`
- `examples/cloud-control/README.zh-CN.md`
- 本记录

公共合同协调与源码落盘归主代理及 Provider/UI 负责人；writer 只记录实时事实和上位约束，不创建第二套协议、存储 schema 或运行器。其他路径只读；不执行 Git 写入、构建、服务、浏览器，不占端口、Profile、dist/ZIP。

目标：补齐多端 Authority/Runtime 边界、功能树/完成矩阵、字段所有权、分离状态机/非法转换、可信授权与故障恢复、正式 Provider 后续事务计划；修订旧预算、配对/撤销/输出复核和调试 Tab 描述。Desktop/Mobile 仅计划。历史原生闭环、历史现场恢复、本轮组件与当前候选原生分别登记。

通过条件：全部事实有源码或原始证据链接；行号在本次读取时核对；保留历史 SHA/packageHash 和 BLOCKED 原因；以主工作流最终候选状态为准，不预写 PASS。只做文档链接、结构、源码符号和差异检查；现有操作命令仅静态核对，不运行其副作用。

依赖：[主工作流](cloud-control-r14-final-20261012.md)、[Provider](cloud-control-r14-provider-20261012.md)、[UI](cloud-control-r14-ui-20261012.md)、[历史恢复摘要](evidence/cloud-control-r14-final-20261012/historical-recovery-summary.json)。三方源码可能继续变化，结束前复读相关输入和状态；其他 Agent 修改保留。

## 交接快照

用户最新要求：Git 对话已获合并授权；本 writer 完成最小收尾后停止文档/Git 写入，等待合并完成的明确通知再续接。本记录更新是最后一次文档落盘；四文件写入占用交回，不自动恢复。

已修改前三份文档并新建本记录。架构补齐独立三端边界、功能树/11 列完成矩阵、字段所有权/事务、六对象分离状态机/非法转换、授权与恢复、正式 Provider 后续计划。合同保留 R0.2 上位约束，明确当前无发布的跨端 Schema/OpenAPI 包；示例修正最新「我的」托管、第六开发 Debug、cloud 偏好映射 tasks、撤销 pending 和操作边界。

最新事实按用户与实时源码同步：Provider pairing/generation、持久 revoke、完整 assignment/permit identity、严格 runRef、renew 双 lease 同事务已实施；Browser 定向 122/122 仅 COMPONENT_TESTED。原现场 1 Run/1 Result、无中断后新 dispatch，retirement fenced/slot held/no Receipt，仍 BLOCKED。保留原 SHA/packageHash；未新增当前 candidate native/build PASS。

检查：三份文档及本记录的定向 `git diff --check` 已通过（最后交接段添加前）；本地文档/源码/证据链接只读存在性检查已执行，结果由此次工具输出保存。现有 CLI/包命令及参数已与源码静态核对，未运行示例、产品测试、构建、服务或浏览器。没有 commit/index、分支/worktree/PR、端口/Profile/dist/ZIP 操作。

待续接：合并完成后复读四文件与最新 diff，确认链接/行号和组件输入绑定；最后交接段尚未再次做 whitespace 检查。新布局原生、双构建及五 Gate 继续引用主代理正式结果，不由 writer 推导 PASS。前三文档交接时 diff 为 264 insertions / 28 deletions；不包括本新建工作流。
