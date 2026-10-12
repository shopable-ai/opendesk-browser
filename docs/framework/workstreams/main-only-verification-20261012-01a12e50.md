# 主分支补充合并与清理（2026-10-12）

状态：COMPLETE。用户明确授权合并所有远程分支、推送 main、删除已合并分支，并建立持续目标。

主工作区原 HEAD：854b88a722722b5d7f4832a4faad1ac734be7ab3；本轮读取远端 main：fcdab07d50283d57f19abd37e9015d606150ce17。待合入分支 agent/time-review-r13-canvas-v3-20261012：07b2fab0c650a7111b64f4e91916bbce97a63c84，共 3 个独有提交；对应 PR #70。

隔离目录：/Users/shopme/Documents/workspace/opendesk-main-only-20261012-01a12e50，detached HEAD，不创建普通分支。仅占用该目录的 Git 集成、测试日志与构建产物；不占用主目录 dist、Chrome、profile、固定端口、ZIP、正式候选或历史 receipt。

主目录未提交工作按 59 个文件保存到 /Users/shopme/Documents/workspace/opendesk-merge-backups/20261012-main-only-01a12e50/；不将他人未提交工作纳入本次提交。其他工作树保留。

已有测试复用核对：已阅读 testing-guide.md、此前 main-only-integration-20261012-01a12bbc.md，以及新增分支 time-review-r13.md。旧清理已完成 11 个远程分支，但该时间回顾分支重新出现并新增 3 个提交。R1.3 的产品/授权/UI 输入变化，不能复用 R1.2 原生结果作为新包 PASS。此次执行受影响组件、源码检查、独立工具包与双 MV3 构建/校验；真实安装、交互、下载、最终 F3/ZIP 仍按原记录 NOT_TESTED，不以组件结果提升证据等级。

通过条件：候选合入该分支原 tip，受影响验证通过；推送仅 fast-forward main；删除前再次核对分支 tip 与冻结身份相同且是远端 main 祖先；远端实时 heads 和本地普通 heads 最终均只含 main。精确输入与原始差异位于 evidence/main-only-verification-20261012-01a12e50/。不更改旧工作流/owner/receipt。

## 并行新增分支及保守处理

首次产品合并 fb58c53241b246f85e58999d52ee6c4539b9346d 已普通快进推送，GitHub 确认 PR #70 merged；原 canvas 分支在首次推送后快照中已不存在，未执行手动删除。随后其他流程创建 native-acceptance 与 no-modal-toggle-review 两个分支。前者从 main 同头推进到 e5bd5ff1，精确 tip 删除被服务端以 stale info 拒绝，未丢失新提交；继续 fetch 后纳入后续 b6fade86。后者推进到 24014e00，纳入启停确认修复及异步测试修正。

原生 CI 两个字面反斜杠表达式已修复；原生测试必须 OPENDESK_TIME_REVIEW_NATIVE=1 才执行，默认组件测试明确 SKIP。与远端 CFT 表达式修正的单文件冲突仅涉及该开关，保留正确表达式与明确 opt-in；原始冲突 diff 已保存。原生新增文件未执行浏览器测试。

独立只读审查未发现启停修复的明确产品合并阻碍。保留限制：保存中确认可静默返回；锁等待期间状态竞争及新增测试未覆盖的工具替换/关闭/外部启停/持久化失败仍需后续负责人验证；静态 modal 扫描豁免不是词法作用域分析。

新增原生 harness 尚不能作为正式原生验收：它注入打开 Side Panel 的测试按钮而非验证真实产品打开入口；进程终止等待与清理收据、已有非空分钟明细删除、下载原始文件保存、完整包与源码绑定仍有缺口。未运行此 harness，不将文档中的远端 CI 声明或 fixture 提升为本机/最终原生 PASS。主目录 Chrome/profile/dist/ZIP 不占用。

构建通过现有 scripts 写入隔离目录的两个 tracked build receipt 后，复制新结果至本工作流证据，并恢复隔离目录该两文件的原历史内容；不提交覆盖历史 receipt。

## 最终结果与证据复用

最终产品集成提交：7c1ce9b00f46c6e1d6fe289a33771839d19dd8d0。远端最新检查只含 refs/heads/main，本地普通分支只含 main；三个本轮分支的最终 tip 均为该提交祖先。原 canvas 分支随 PR #70 合并消失；native-acceptance 和 no-modal-toggle-review 两分支通过精确 tip 比较的原子事务删除，main 更新只允许普通 fast-forward。stale-tip 拒绝日志保留，未强推/重置主分支、未覆盖并行提交。

最终受影响组件 125/125、fail 0；477 个源码/安全契约检查通过；生产与开发构建、双包校验通过。生产包 1382485027975d3e6e724c910200215a7c95aeb2c227f1c2b95a420261c4914b；开发包 ee45a9c13803f9cd548d749b4ce25de6505b6428252b0031e695c03d76ca755a。最终产品代码绑定 57b892b1；此后的原生测试和说明提交不改变 src/scripts/public/packages/examples/依赖锁/WXT 配置，已验证包按产品输入身份复用。原生默认 gate 明确 1 SKIP、0 PASS，脚本 syntax check 通过；不称原生通过。两份 YAML 经系统 Ruby parser 实际解析，表达式和 explicit opt-in 已核对。

主目录由 854b88a7 普通快进至产品集成提交；同步前后 60 个未提交文件、状态与 SHA-256 完全一致（相比最初 59 个文件，多出的是并行流程新增文件；也已备份）。原始备份及同步前最新备份位于 /Users/shopme/Documents/workspace/opendesk-merge-backups/20261012-main-only-01a12e50/。不把这些工作纳入提交。其他 detached worktree 保留，本次隔离目录也保持 detached，以保存独立产物，不增加普通分支。

此次正式完成的是分支集成和清理。原生测试 harness 缺口、真实安装与产品交互、最终 F3/ZIP 仍按上述范围未测试，分支合并不提升其等级。所有历史工作流、owner、原 receipt 保留。Chrome/profile/固定端口/主目录 dist/ZIP 未占用；本次 Git 集成和验证资源 released。
