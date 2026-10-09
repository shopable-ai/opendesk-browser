# Main 分支整合与清理（2026-10-10）

状态：VALIDATED_PENDING_PR_MERGE。用户授权合并所有已提交分支并删除其他分支；未提交工作保留在原目录。

整合分支：`agent/merge-completion-20261010`；独立工作树：`/Users/shopme/.codex/worktrees/merge-completion-20261010/opendesk-browser`。

原始分支/工作树清单及未提交的 staged/unstaged 补丁保存于 `/Users/shopme/Documents/workspace/opendesk-merge-backups/20261010-main-only/`。该目录不属于发布产物；原工作树和未提交文件不删除。

范围：本地 main 与远端 main 的分叉、已提交的本地 AI / Chrome launcher / npm cache / 使用文档，以及远端 R12 SW 分支。逐项以 Git ancestry 确认保留全部提交；只删除已经进入最终 main 的 branch refs。

冲突处理：旧 sidecar 的 driver/launcher 保留当前较新实现（包括失败启动清理）；文档结合完整教程与当前锁定依赖、离线执行、Native 权限及证据等级边界。原始验收日志保留原字节，不修剪历史日志的空格。

验证复用：遵循 `docs/framework/testing-guide.md`；原生记录仅作为其原候选历史证据。新整合输入执行受影响组件测试、source check、双构建和包校验，不提升为 Native / F3 / ZIP 安装 PASS。

资源占用：仅本工作树的 `dist/`、`.wxt/` 与专属证据目录；不启动 Chrome / Native Host，不占固定端口，不覆盖已有 build/pack receipts。构建通过 `OPENDESK_BUILD_EVIDENCE_DIR` 输出新收据。

新日志目录：`docs/framework/evidence/main-only-integration-20261010/`。

后续：完成受影响验证，通过 PR 串行合入 main；同步本地 main 时保存并恢复原未提交内容；工作树脱离已合并分支后删除 branch refs。最终再次核对本地及远端只保留 main。

验证：239/239 定向检查、source check、双构建/verify、物理包 SHA-256 与固定模块来源 2/2 通过；11 份指南的 128 个本地链接存在。完整环境入口保留 3 项失败：两项读取历史默认收据的失败以受支持参数重测通过；独立 Native 项拒绝普通 Chrome，未宣称原生 PASS。裸无扩展临时 renderer 观察不提升为受控 Native 证据。原始日志与复用边界见 `../evidence/main-only-integration-20261010/verification-summary.json`。
