# 原生程序授权 R2 工作流

日期：2026-10-10。操作仅 main，不创建分支或 worktree。状态：IN_PROGRESS，等待本候选的远端专项检查回执。

## 需求与已接线范围

将普通 JavaScript 的源码格式与运行设置分开，旧 @grant 等仅作兼容输入。目标设计见 ../../architecture/browser-framework/native-program-authorization-r2.zh-CN.md。

实施：page-program-rules、原生 Candidate 输入、不可变快照、编译合同、Sidebar 保存说明、原生及兼容回归。未实施：Page 私有特权 SDK、统一能力确认界面、完整 GM API；不宣称这些已被批准或可调用。

## 基线与并行保护

读取基线 1c9e33e7474db9297d49eec24579aa863a074d55；集成前核对 main 8c43a2ecb5f63cbc36707de545e03a75dd7432a5。目标旧 blob：dependency-manager f46fbef611e66342243fb8dcb56b7ec7dda63e7f；page-program-contract 4aa7b8feca36a15cb1ca1db63923154e9d26a1f4；page-candidate-source 7710d5efa296cb2f9f50a3d6fb1ae5f8cb7063c4；script-editor 7f448520b2c20fbd8e46ac5fb201505cb5134bd9；原 source 测试 763881e5d988838738b603bf253d50c96128143c。

不改 Native Agent、HTTP Lab、Workflow Sidebar 及其他对话文件。出现并行变更只允许基于新 main 树重新集成、检查目标冲突后快进，不允许强推。

## 证据级别与资源

已读 testing-guide.md。旧 Page/Sidebar 原生包证据不提升为新候选 PASS；本轮保存、编译输入变化属于 AFFECTED_INPUTS。原 SDK 查询/撤销代码不变，不借其 83 项结果证明此新功能。

本地纯规则验证：3 项通过，范围仅独立输入校验，不是完整仓库或真实 Chrome。当前容器无法克隆仓库，完整组件及构建改用仓库的只读 GitHub Actions 专项工作流；不使用用户 Mac 路径、浏览器 profile 或端口。专项工作流运行自己的 checkout/dist，无发布行为。

计划命令：node --test --test-reporter=spec tests/environment/native-page-program.test.mjs tests/environment/page-candidate-source.test.mjs tests/environment/page-candidate-service.test.mjs tests/environment/page-program-package.test.mjs tests/environment/page-installed-programs.test.mjs tests/environment/dependency-manager.test.mjs tests/environment/dependency-metadata.test.mjs tests/environment/user-script-dependency-flow.test.mjs tests/environment/page-script-preview.test.mjs tests/environment/script-editor.test.mjs；npm run check；npm run build:dev。

组件：PENDING。源码检查：PENDING。开发构建：PENDING。真实 Chrome：NOT_TESTED。独立整体 95+ 验收：NOT_TESTED。不得把生成 Git blob 或候选 commit 当成 main 已更新；需要快进回执与重新读取 main。
