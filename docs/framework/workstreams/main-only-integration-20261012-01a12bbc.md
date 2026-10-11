# 主分支集成与分支清理（2026-10-12）

状态：COMPLETE。用户授权合并所有分支、推送 main、删除已合并分支，并设置完成目标。

隔离目录：`/Users/shopme/Documents/workspace/opendesk-main-only-20261012-01a12bbc`；独占资源：本目录 Git 集成、独立测试日志/构建产物；不使用 Chrome/profile/固定端口/主工作区 dist。

主目录未提交文件备份：`/Users/shopme/Documents/workspace/opendesk-merge-backups/20261012-main-only-01a12bbc`。主目录与其他工作树的未提交工作保留。

原远端 main：`3e28b9f468dd209d0195f106ded9705903a89a76`；原本地 main：`a38ba0ec3c8f7eee85d3cf27c847b206399d1a86`。

集成后验证：按 testing-guide 核对已有证据，执行受影响组件/source/build 验证；不将其提升为真实原生、正式 F3 或 ZIP 安装 PASS。

分支删除通过条件：每个待删 tip 是最终远端 main 的祖先，并确认 tip 自清单冻结后未变；本地分支删除也需可达性证明。

已集成全部现存 remote branch tip、本地 main 的提交及已完成本地 consent 分支历史。JSX/SFC 的旧 adapter、手工编译入口和旧说明由当前更完整的直接组件、固定离线 runtime/SFC compiler 与冻结 R24.2 snapshot 取代；保留其 commit 与原始历史文档。

冲突逐文件决策位于本工作流 evidence 内。第一次冲突脚本匹配范围过大：未触及主目录，已从可靠主线在隔离目录重建；错误中间提交仅以 ours 合并保留追溯，不改变最终文件。

验证：最终受影响组件 332/332；源码/CSP/固定入口检查 463 文件；生产构建通过，packageHash `2a1f164104a9c7890c1b41dc60ffe3b4ae67ffb70742867e1007bebf0f653edc`。原始首轮失败、修复后的日志和首次构建环境失败均保留。独立只读核对内联选择、精确卸载身份、launchGate 与未知创建保护，未发现实质缺陷。

用户要求避免过度测试：只收尾生产构建，不追加全仓回归、开发包、原生、F3 或 ZIP 安装验收。上述结果不提升为正式 F3/ZIP。

已完成：原子普通推送 main，并以精确 SHA 守卫删除 11 个已合并远端分支；主目录 fast-forward 后 58 个当时未提交文件内容哈希全部保持一致。consent 和本集成 worktree 仅 detach HEAD，保留文件；3 个本地非主 branch refs 经祖先核对后安全删除。远端及本地 branch refs 均只剩 main。独立工作区产物保留，资源 released。
