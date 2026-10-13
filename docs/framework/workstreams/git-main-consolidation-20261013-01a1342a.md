# 本地与远端 main 合并及分支清理

日期：2026-10-13（Asia/Shanghai）。负责人：当前对话 01a1342a-0539-7333-9127-62036117bed2。用户明确要求在本对话完成本地和远端拉取、合并到 main、删除多余分支；据此授权正常推送集成 main 及安全分支删除。禁止强推、破坏性 reset/clean、创建分支/worktree/PR、发布与安装。

状态：集成候选已完成定向验证；本地应用与远端推送身份以仓库外 final-verification.json 为准。Git 索引/HEAD/推送事务由本对话串行负责。其他对话的未提交源码和证据保留，不收集为本任务提交。读取 testing-guide、parallel-development 及历史 git-main-sync 记录。其他活跃工作流仅核对，不发送跨对话消息。

合并前 main：`f631e0ef5de5e6aecee37e946b65ac431a0c9e8e`；本轮获取远端：`9337d5a44af3acdd866c0e8578f737f8e34c5349`。远端已仅剩 main，过期 origin/agent/local-page-ui-portable-20261012 已 prune；其原 tip becbb0b0 的组合补丁已被 PR #74 的 squash 9b5b131e 完整保留（patch-id de48424c9aacffaedeee4ed421be08c9c2576a30），不重复 cherry-pick。

写入范围：本文件；以下提交合并冲突文件由本对话最终落盘，子代理仅在仓库外生成建议文件：
- `AGENTS.md`
- `docs/api/browser-capability-universe.zh-CN.md`
- `docs/framework/parallel-development.md`
- `examples/cloud-control/README.zh-CN.md`
- `scripts/audit-fixed-entries.mjs`
- `scripts/cloud-control/provider.mjs`
- `scripts/verify-package.mjs`
- `src/cloud-control/service.js`
- `src/platform/chrome/context-menus.js`
- `src/ui/cloud-hosting.js`
- `src/ui/cloud-status-presentation.js`
- `src/ui/scheduled-task-workbench.js`
- `src/ui/sidebar-tools.js`
- `src/ui/tool.html`
- `tests/environment/sidebar-tools-host.test.mjs`
- `tests/environment/sidebar-ui-preview.test.mjs`
另外只读审查自动合并的 src/cloud-control/history-index.js、src/framework/sdk/browser-contract.js 与 browser-schemas.js 的公共契约。若存在实际缺口，在本记录增量列明后修复。

备份：`/Users/shopme/.codex/backups/opendesk-main-integration-20261013-01a1342a`，包含 Git history.bundle、工作区 binary patch、空暂存 patch、逐文件 SHA-256 before.json 和原工作文件 tar.gz。361 个展开后的工作文件先备份；不把备份、原始证据或其他 owner 未提交修改提交进 main。

方法：先在 Git merge-tree 的候选上完成冲突建议与定向检查，最终采用前重新核对 HEAD/索引和文件 SHA。保留原提交的全部 ancestry 和本地工作文件的有效变更；不全局 stash 正在工作的其他对话。

资源：不占真实 Chrome/CFT/Profile/Native/固定端口，不写根 dist 或 ZIP。根 npm run dev 46576 持续负责 dist/development。验证使用独立源码导出及独立日志、复用现有 node_modules，不安装依赖。

通过条件：提交冲突全部解决；本地独有提交均可从最终 main 到达；原未提交改动可从备份恢复并经逐文件/三方对比确认保留；相关安全/菜单/云控/宿主和源检查通过；正常推送后本地 main 与远端 main SHA 一致，两端仅 main，无未合并独有分支。不提升为整体原生/F3/ZIP 验收。

## 未提交改动的三方保留

与远端输入重叠的 24 个未提交文件另作 HEAD → 新 main → 当前工作文件的三方保留预检。普通自动保留与冲突建议均先写仓库外 working-replay，不把这些未提交修改收集进整合提交。明确需要合并保留的额外文件：
- `docs/api/runtime-globals-and-preinstalled-libraries.zh-CN.md`
- `docs/architecture/sidebar-design-system-r20.zh-CN.md`
- `src/platform/host/broker.js`
- `src/scripting/user-scripts/dependency-manager.js`
- `src/scripting/user-scripts/page-program-contract.js`
- `src/scripting/user-scripts/preview.js`
- `src/ui/page-candidate-source.js`
- `src/ui/page-dependencies.js`
- `src/ui/script-editor.js`
- `src/ui/tool-shell.css`
- `tests/environment/dependency-manager.test.mjs`
- `tests/environment/page-dependencies-ui.test.mjs`
相关文件最终落盘前再次核对实时内容 SHA；发生 owner 新写入时重新计算，其他文件继续。不以旧副本覆盖现场。

## 定向验证与实际合并缺陷

首次只执行 8 个受冲突影响的 Node 文件（云控 Provider/历史/撤权/Browser整合、菜单安全、云控侧栏、工具宿主、HTML资源），155 例、132 PASS、23 FAIL，耗时约 2.2 秒；原始输出保存 backupRoot/targeted-core.tap（Node默认 spec reporter）。失败集中于合并遗漏 Provider pairing helper/相关绑定变量、新旧云控宿主重复 DOM ID、以及旧 R28 布局/反馈文字断言。原失败不覆盖，不放宽身份、撤权、未知效果或隐私合同。

新增必要写入范围：tests/environment/cloud-control-sidebar-r28.test.mjs（仅过时入口位置/固定反馈文案合同）；其余仍为已登记文件。修复后只重测失败的 Provider/整合文件与 UI 失败用例；已通过且输入未变的历史/菜单/宿主安全结果直接复用。不全量测试，不真实浏览器/F3/ZIP，不构建。

## 本轮集成结果与验证边界

保留 f631e0ef 的全部本地祖先与远端 49b20f39c862cc7764e8f1f6af1dc55f2f4a98d3，使用普通双亲 merge commit；不重写提交、不强推。提交冲突已解决；Page 静态 ESM、结果撤权、React/Vue 和编辑器当前未提交工作经三方重放继续保持未提交。并行新增 CLI/provider、Host client、wxt 配置已保留；CLI/provider 新增任务包入口仅做语法验证，未扩大测试。

只运行合并冲突所需定向 Node 检查：最新提交云控/浏览器协议/UI 28 项中 25 项通过，剩余 3 项修复后全部通过；未提交重放定向 8 项中的失败已分别复验通过。重复编译、静态世界误拦与测试 URL 常量遮蔽均已修复。此前其他已通过检查直接复用；全部失败日志留存。未运行全量 npm check、浏览器验收、build、F3、ZIP 或发布。

可恢复备份：`/Users/shopme/.codex/backups/opendesk-main-integration-20261013-01a1342a`。history.bundle 已验证完整，初始 working-files.tar.gz 的359项文件哈希一致；应用前另保存最新文件及 hashes，使用 HEAD CAS、index.lock 与逐文件哈希检查保护并行修改。最新本地/远端 SHA、分支清单与保留验证存入 final-verification.json。
