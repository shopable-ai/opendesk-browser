# R4.1 Mac 阅读目录与网页笔记验收（进行中）

2026-10-11，聊天 `01a12924-392e-7230-b0b0-ae8de004fc70`，仅 main。

## 并行资源归属

- 本轮**不占用根目录 dist、node_modules、43111、43119、43120**，其他任务可继续使用。
- 独立冻结源码和生产/开发产物：`.runtime/r41-mac-01a12924/candidate/`；构建保护端口 43271，测试 HTTP/CDP 均随机端口。

## 2026-10-11 新对话交接：未完成最终验收

用户要求提供续接提示词，当前目标已暂停。此交接状态优先于下文历史进度；不得将历史 PASS 提升为最终候选 PASS。

- 当前 main：`2a7bc0be1a71c23890c6fb54f740a16a2a234955`；本地 origin/main：`8f30854f0f2aa4a2b479fc179f8911cc01decdc1`，main ahead 18，未推送。新对话仍需 fetch 并核对最新现场。
- 本任务源码及驱动提交：`2cc6879a`、`6d47bea2a519783ab495733464a66f0e30b3c5c2`；已经保留 R42/R43 和 R22 的 main 提交，禁止回退。当前根源码无本任务未提交修改；工作流与专属证据尚未提交，其他未跟踪文件属于并行任务。
- 快照记录 `candidate/artifacts/final-source-inputs.json` 绑定 `6d47bea2`，共 852 文件。与当前根目录比较发现 `scripts/libs-doctor.mjs` 和 `tests/environment/libs-doctor-r155.test.mjs` 两项差异，最终全量验证前必须核对并同步相关最新输入，保留旧记录。
- 独立快照最新 `check-integrated-final.log`、双构建、`verify-integrated-final.log`、`pack-integrated-final.log` 均通过。production packageHash：`8b8e0631cfca2aeebc393f509f438f2d5dea1b21161465abc2f1bb5236f03805`；ZIP SHA-256：`106bd2ac638d2b5f3ab76091945f10ce76322724a688ddf0189ba7dbbbea2ec0`。这些构建尚未绑定最终全量原生验收。
- 历史证据：`targeted-merged-3.log` 76/76 NODE_PASS；`native-consent-window-final-3.log` 2/2 NATIVE_PASS；`native-r41-final-7.log` 1/1 NATIVE_PASS；`npm-test-final.log` 963 总计、962 PASS、0 FAIL、1 SKIP。最后两项属于旧候选，不能直接作为新候选最终结果。
- Mac 矩阵 attempt10 记录 27 NATIVE_PASS / 2 NOT_TESTED，但两项站点访问观察被旧驱动误计 PASS，应审计为 25 功能 NATIVE_PASS / 2 功能 NOT_TESTED。attempt13 为 25 NATIVE_PASS / 1 FAIL / 4 NOT_TESTED 观察，FAIL 为长对话历史懒加载。最新版驱动已加强原生点击命中检查、手动中断负回执、受限页实际保存和真实文章实际可读跳转，尚未完成新复测。
- Euler 最新只读复审：单工具撤权、堆叠顶栏、确认框 CmdS、BFCache 实现已关闭；composer 避让部分关闭，`src/reading-toc/view.js:107` 在输入框上缘高于视口一半时提前返回仍需修复。Range 多点遮挡实现已补，但现有 mock 缺少 `createRange`，需要证明实际 Range 分支。不得给出 >=95 分数。复审记录暂存 `candidate/artifacts/expert-review-final.json`，需要核对完整原始回复。
- 真实站点：用户授权知乎 `https://zhuanlan.zhihu.com/p/26033573`，真实 CFT 访问受阻，功能 NOT_TESTED；ChatGPT 无获授权测试会话，功能 NOT_TESTED。普通 Chrome 技术文章已有真实访问证据，新驱动实际章节可读断言尚待复测。
- 工具版本已前进：阅读目录 1.0.2、Quick Notes 1.1.5，保留从 1.1.1 导入再升级的数据迁移检查。先核对实际 config、内置 JSON 和生成包，勿降级覆盖上游更新。
- R22 对话 `01a1290f-9027-7b72-8b81-9796498ac8d0` 最新交接报告：已停止源码、构建和测试写入，root dist 占用已释放；独立 CFT PID 44555 经 Browser.close 正常关闭，Profile `codex-cft-cye54vks` 已由 launcher 清理；65132/43119/43120 无监听，私有 Native Host 已退出且 `r22-final-01a1290f/agent.sock` 不存在。以上是 R22 的交接声明，本对话未另行实测；新对话必须重新核查最新任务和资源，不把释放声明当作永久空闲证明。不得修改其他任务的 Profile、端口和 R16/R155 未提交文件。
- R22 报告其 `4e0fc216` 候选七视口/200%及真实 Side Panel 五页通过，完整 Node/Native Mac 复测和最终评分尚未完成；属于 R22 的限定候选证据，不能替代本任务最终验收。

下一步：修复并验证剩余 composer / Range 证据缺口；核对最新源输入；对同一最终候选完成定向、全量及两个原生驱动；保留失败日志，整理原始截图、包 hash、真实站点等级和未测原因；补全本工作流，仅提交本任务文件，不推送远端 main。当前没有最终交付或最终质量评分。

## 以下为历史过程记录
- 仅使用独立临时 CFT Profile，Chrome 155.0.8059.39，模拟钥匙串；既有 R16/R23 CFT 与 Profile 保留。
- main 写入范围：`src/reading-toc/{page,view}.js`、`examples/sidebar-tools/reading-toc/{src/style.css,tool.config.json,README.md}`、`src/sidebar-tools/reading-toc.opendesk-tool.json`、`tests/framework/reading-toc-native-r41.test.mjs`、新 `tests/framework/reading-tools-mac-r41.mjs`、本工作流及专属证据。其余未提交修改归并行任务，不纳入本轮提交。

## 起始身份与失败保留

- HEAD `518ef4485da0b56b661b9082c9e6f5d6d8388221`；fetch origin/main `7baabd24d0c38aa1f8077a8fff37bff3008e32b1`；ahead 11 / behind 5，无法 fast-forward，未做 merge/reset。
- Node 首次核对 v24.16.0；npm 脚本实际运行日志也观测到 v26.3.1，均满足 >=22.12.0。最终记录保存运行版本。
- 源码与并行差异快照：`evidence/reading-toc-r41-mac-01a12924/source-snapshot.json`，包含实际输入 hash；候选不是纯净 HEAD，不将并行未提交源码冒充本轮正式 SHA 内容。
- 首轮 npm test 941 PASS / 17 FAIL / 2 SKIP：缺少双构建产物。双构建后 957 PASS / 1 FAIL / 2 SKIP：CFT 查找未指向独立快照外缓存。显式 CFT 后 958 PASS / 1 FAIL / 1 SKIP：Native CLI 权限驱动在同名 CFT 并行进程下 AppleScript AX 身份不匹配；未放宽身份校验。
- 原 R4.1 测试在本机有窗口 CFT 已 1/1 NATIVE_PASS（修复前限定候选），具体扩展/路径/版本在 `artifacts/reading-toc-r41/browser-identity.json`。不能提升为最终修复候选 PASS。

## 原生发现与修复中

- 固定 140px 顶栏：跳转标题 top=88.16px，被遮挡；改为测量实际 fixed/sticky 遮挡并验证命中节点。
- 内部滚动容器 sticky 110px：标题 top=80.09px，bar bottom=172px；使用相同可读区域测量。
- 400px 会话：卡片 bottom=792px，输入区 top=700px；窄屏避让 `#prompt-textarea` 及其表单，并清理 resize 监听。
- 真实 Side Panel 截图有目录数据但列表零高度：iframe 自动高度与 `100dvh - 180px` 循环依赖；工具列表上限改为 540px，保持 R3 行距、三图标和两行标题。工具包 v1.0.1，与内置资源同一打包器生成。
- 定向组件 57/57 NODE_PASS；最终生产包、最终 Mac 全矩阵与专家审查正在执行，尚未正式关闭。
- 真实 ChatGPT 没有获授权账号；用户提供知乎公开文章 `https://zhuanlan.zhihu.com/p/26033573`，将在空白 Profile 测试，不能把模拟会话提升为真实站点 PASS。

完整最终记录与证据索引将在本次收口后更新，所有旧失败保留。

## 2026-10-11 串行写入交接检查点
独立生产候选上的 Mac matrix attempt10 无功能 FAIL；27 项 NATIVE_PASS 含 2 项仅访问观察，真实站点功能以 NOT_TESTED 单列，最终账本将移除访问观察的 PASS 分类。当前冻结生产哈希 a4f31102906b56c18e0b55a8a8013aae9b6feb1b12a071538567b6bfb9c44bf1。已把全套 npm test 的 Mac Native consent 驱动改为 PID 绑定 AX，保留精确 permission/唯一 Allow 校验；等待真实复测。R22.1 可在接下来约 10 分钟独占根源码写入与提交，本任务仅在自己 snapshot 测试，交还前不写根源码/提交；node_modules/dist 根资源不使用。
