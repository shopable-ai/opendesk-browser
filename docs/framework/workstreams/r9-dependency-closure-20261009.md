# R9 旧新模块加载 / npm 依赖闭包修复记录（2026-10-09）

本 workstream 只记录新增 R9 变更与本轮证据等级；不改写源合同、历史失败、native receipt、完整 603+19/B05/F3 分母。起始 GitHub main 提交：7e80fa8f702e10e1bcda432b7b6aec4c02f12c68。当前工作分支：agent/r9-dependency-closure-20261009；合入后以合并提交及 Actions run identity 为正式复核入口。

## 实施及验收范围

- **源码实现**：Program 校验器拒绝未精确锁定的 npm 裸导入、伪造或不完整的包锁记录；Webpack 输出 npm 模块清单，与声明/锁记录分别存放。
- **可选资源故障**：SW 的 Native Transport 固定 importScripts 仍不改变 classic 生命周期，但失败现在可见；核心 Broker 与侧栏路径不受可选 transport 加载失败阻断。
- **静态运行场景**：示例 examples/programs/page-npm-lodash 中含 src/main.js、src/heading.js 和精确锁定的 lodash-es@4.17.21。tests/integration/npm-project-closure.test.mjs 必须在该示例 npm ci 后，以真实构建 program.js 执行并检查 HTML 转义结果。
- **回归**：tests/environment/program-project.test.mjs 的 npm 锁负向用例、tests/environment/program-build.test.mjs 的缺失已声明包定位用例均不得改变既有错误语义。
- **CI**：.github/workflows/program-project-source.yml PR/main 启用检查，先根目录 npm ci，再单独示例目录 npm ci，按既有 build:program 执行。r3-source-package.yml 在 PR 运行当前生产+开发 WXT 包校验。
- **文档**：第三方迁移总账取代旧 R3 当期结论；同时更新操作文档和 Codex Skill，禁止恢复 @require 复杂 UI 或向 SW 添加无消费者 vendor。

## 证据等级与必须核对的退出门槛

| 层级 | 当前交接状态 | 下一个具名证据 |
| --- | --- | --- |
| GitHub 源码 / 审计 | 已写入独立分支（非 native PASS） | compare main...PR head；审阅变更和目标分支 |
| npm/ESM 组件 | **待 CI** | OpenDesk multi-file source contract PR run: Node tests + real lodash-es npm ci + VM 回执 |
| WXT 生产 / 开发包 | **待同候选 CI** | Page userscript dependencies and package PR run: build、verify、ZIP exact dist |
| Content / Page USER_SCRIPT / Controller / SW 原生 Chrome | **NOT_TESTED（本轮环境无 Mac Chrome 与用户本地工作区）** | 受控 Mac CFT、同一源码/包 SHA、真实 tab/frame/document、权限/重启/撤权/断网与逐项回执 |
| 603+19 / B05 / F3 / 最终 ZIP 安装 | **未由 R9 宣称通过** | 原正式验收流程，沿用原分母和 owner 约束 |

## 风险与最终边界

本次新增的 npm 锁检查只约束**直接导入且在用户项目 dependencies 中列明**的包；它不替代 npm ci 对传递依赖 tarball 的校验、代码审计或真实浏览器运行。编译器记录的模块路径是构建期证据，不证明任意树摇优化后的未调用 API 仍在运行时存在。对于历史 Axios、Moment、PSL 等资源，缺乏新版核心调用者时绝不通过扩大 Background 特权来“补齐”。

在真正取得同一候选的 GitHub CI 和 Chrome 回执前，本 workstream 保持未关闭；不生成伪造评分，也不发布插件。
