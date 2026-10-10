# R16 独立安全与协议最终审阅（main 789fa3a）

**结论：源码与组件在明确范围内通过；总体产品验收为 NOT_ACCEPTED，原生 Chrome 为 NOT_TESTED。**

本原件覆盖 main92 产品整合及其后至 789fa3a 的测试/文档整合。没有仍然打开的、在本审阅范围内已证实的关键源码安全缺陷；保留一项安全拒绝式旧 Page 兼容限制。评分不提高为原生验收分数，不取平均值。旧 4e397463 审阅原件保持冻结和原 hash，不再作为最新候选。

## 独立性与证据方法

本审阅者未编写本轮生产代码、未修改两个仓库或提交、未操作浏览器、未执行模型测试。方法为读取正式设计、实际源码、固定版本官方实现、原始测试与构建回执，并独立重算源码及产物 hash。提出的修复意见由其它实现者落实，root 串行集成。本目录只保存独立审阅原件。

## 十域限定评分

| 领域 | 限定评分 | 有效证据范围 | 仍缺少的产品证据 |
|---|---:|---|---|
| 用户体验 | 92 | 源码与状态组件；紧凑对话、四种来源、具体提议预览、准确在线推理和线程留存说明。 | 原生尺寸、缩放、键盘和实际用户交互 NOT_TESTED。 |
| Codex 连续 Agent | 90 | 源码、组件及真实 Linux Codex 0.159.2；同线程 17→21、每轮8事件；真实工作流51事件；流式开始后的中断终态。 | 冷恢复 UNSUPPORTED；真实浏览器工具闭环及最早窗口正常中断终态 NOT_TESTED。 |
| 模型 Provider 就绪 | 96 | 源码、组件及真实 Linux Codex 0.159.2；真实CLI发现、登录类型、握手与受限线程；READY_FOR_TURN 不冒充推理成功。 | macOS及实际额度/模型故障矩阵 NOT_TESTED；版本只允许已审阅0.159.2。 |
| 安全 | 97 | 源码、协议组件及有限真实CLI启动验证；固定RPC/工具、无环境/根、个人MCP禁用、启动前环境注册检查、临时关闭远控、精确身份、重放和容量控制。 | 原生全链安全验收 NOT_TESTED；已审阅的关键源码问题均修复并有最终组件证据。 |
| 隐私 | 96 | 源码、协议组件及有限真实CLI启动验证；官方CLI自行使用凭据；固定观测字段与体积；准确披露联网推理及CLI线程保存；远控临时禁用。 | 真实macOS凭据路径、网页内容全链及已启用远控enrollment攻击场景 NOT_TESTED。 |
| 工具授权 | 96 | 源码与组件；一次性逐次同意、canApprove、精确文档和网站权限复验、导航/撤权/取消迟到回执拒绝。 | 实际Codex→Sidebar→Chrome→Codex完整往返 NOT_TESTED。 |
| 浏览器执行 | 94 | 源码、原执行器组件；固定观测源码走原Controller/RunHost/Authority、原slot和持久结果/hash；没有第二套执行器。 | 本轮真实Chrome中的R16运行和持久回执 NOT_TESTED。 |
| 保存复用 | 94 | 源码、实际模型输出编译及模拟执行；真实提议经过原normalize/compiler；确定性hash；显式模拟Page API执行两次不需要AI。 | 真实保存、重新加载、关闭AI后再次执行两次 NOT_TESTED。 |
| Go/Node兼容 | 93 | 源码、组件、真实Linux Codex及Darwin交叉编译；Go race/vet与Native合同；原RPC保留；旧Node缺能力显式拒绝；Darwin交叉编译。 | 实际Go/Node Native安装互通 NOT_TESTED；Node socket 2 PASS/7 EPERM；Darwin未执行。 |
| 原生Chrome测试 | NOT_TESTED | 没有本轮原生证据；本轮不存在同候选macOS Chrome/Native/Go/Codex完整运行证据。 | NOT_TESTED，阻止总体95+验收通过。 |

## 最终候选与独立核对

Browser 当前 main / origin/main 基线为 `789fa3a35aaa1c7b287f6b47261d21c54a62dcc5`。本原件在 root 提交 R16 前冻结，最终发布 commit 由 root 另行记录；下面的输入和包 hash 确定实际候选。产品整合基线为 `92ddeeb43a129942226d2d5c5c2967d7c305a9e8`，其后至 789fa3a 仅 docs、CI、tests 变化。

- 最终原始 TAP 是 `final-acceptance-components.log`：112806 字节，完整 `1..475`，475 个顶层 ok；tests/pass=475，fail/cancelled/skipped/todo=0，退出码 0。
- TAP SHA-256：`6a46aa3ea14c3820adc366f4cc6761e7db6c3e688b9ec60b2b125a7353ad8bf5`。本审阅核对了实际文件结尾及数量，没有采用工具界面的摘要替代原始记录。
- 本次直接执行的 33 个测试入口文件逐项记录 SHA-256；源码检查实际 259 个文件通过。这不是额外声称完整测试依赖图已独立快照。
- 两个构建各 184 个 sourceInputs 与最终工作区全部一致，sourceDriftDuringBuild 为空。
- production 30 文件、development 45 文件逐项字节数和 SHA-256 全部一致，聚合包 hash 独立重算一致。
- `npm run verify` 退出码 0，两份完整报告与构建报告完全一致；privilegedDynamicExecutionFound=false。

| 产物 | 包 SHA-256 | SW 字节 |
|---|---|---:|
| production | `c11a26da9ce32717a6f9d69a106d7914d4fb6a213f64d025789d596c523c0333` | 326336 |
| development | `dfba0b065b6d825d75a5270e2d3b1a0a9372c355983c681396712724a6a251e4` | 326502 |

相同 184 个构建输入的紧凑 JSON 集合 SHA-256：

`15871de418636ebc51fab0abe62810171ab965db22e0db2a45bff623c340199a`

原 production 门禁仍是 327680 字节。最终 326336 字节通过，没有提高预算或删除 CSP 检查。

Go 当前 master / origin/master 为 `15af7bbd93aa836a9320ac27c053cababb6bdd2c`，R16 实施提交仍是其祖先 `005a2f33a640c76565775a398b243f1d66a6caf1`。后续只新增 R6 架构文档，Go 工作区干净。本审阅重新核对 8 个生产、3 个测试文件和 13 个原始最终产物的 hash。R16 生产源码集合仍为：

`1e96b15cfaaa304408c71edb52ea021e00334df77a75a180f43c638beb6bb22c`

Go race 记录（含子测试）为 browserai 47 PASS/5 SKIP、browsercli 2 PASS、选定 Native 合同 5 PASS；三个包 vet 通过。实际 Linux Codex 0.159.2 的五个顶层测试通过，冷恢复明确 SKIP。Darwin arm64 两个测试二进制仅交叉编译通过，未执行。对应 R16 源码未变，所以本次复用的是同源码身份的真实 CLI 证据。

## 新上游 Page 与 ToolShell 权限边界

无显式匹配的新 Page Candidate 默认调度到 `*://*/*`（HTTP/HTTPS），仅主 frame；显式 `@match` 保持原范围。该默认值不修改源码、不创建安装授权，不启用 GM、MAIN 世界、Native 或跨站服务。依赖强哈希、不可变锁及原 Host 校验仍在。

Page 安装仍要求冻结 Candidate、Available 证明、正确 manifestHash、安装 scope 和代次、Chrome 网站权限及明确安装操作。注册器精确核对 approvedPageRules；legacy 全站匹配也必须对应同范围 proof。较窄 proof 不能授权改成全站的候选。

ToolShell 新全局恢复入口只在 Chrome 查询 websites=false 时出现，可信点击同步调用原 siteAccess.grant，再重读 Chrome 权限。它不会自动安装程序、自动恢复 suspended Page、重放旧文档或授权 AI 读取内容。

R16 固定观测走 Controller draft；保存走 wf-* Controller revision；导出仍为带精确单站 siteOrigins 的 Task v1。它们不走 Page 全站默认安装路径。Task v1 仍仅 page.automation，不继承 Controller 的 HTTP/Cookie/宿主存储/Native；缺安装快照的 Native task: 运行安全拒绝。

R3.1 原范围明确排除 Workflow Run / AI endpoint；R16 保留精确网站请求和本次执行确认，不宣称全产品 permission-silent。全站 Chrome 授权不替代逐次模型内容同意、准确文档身份或危险操作确认。SDK 失败 Hello 仅允许下一次明确调用重新握手，没有重放已派发 HTTP。

### 保留的旧 Page 兼容限制

旧 Page 若通过显式 pageRules 创建，源码有 UserScript header、无 @match、无 @noframes，同时冻结 allFrames:true，新版无 @match 默认 allFrames:false 可能使 verifyPageProgramSource / resolvePageProgramRules 返回 E_PAGE_METADATA_RULES，阻止复验或注册。该判断来自源码分析，实际旧安装迁移 NOT_TESTED。

这是安全拒绝，不会静默扩大到全站或增加 frame。R16 的 Controller / Task 产物不使用这种 Page manifest。需要在原 Page 迁移流程中明确核对匹配与 frame 范围，创建新固定版本并重新授权；本轮没有自动改写旧安装。

## 最后修复与整合的独立结论

固定官方 CLI 0.159.2 的启动隔离、无环境/根、个人 MCP 禁用、启动前环境注册检查、官方 Provider 约束、远程控制临时禁用等已按最终 Go 源码和原始证据核对。官方 CLI 自行使用登录凭据；不读取或复制凭据到 Browser。固定 child marker 使远控选择 DisabledEphemeral，不修改个人 enrollment。

停止清理由独立 cancel/close promise 持有，CANCELLING 只算 ACK；同 session/thread/turn 和连续 cursor 的准确终态才可作为已知结果，未知状态关闭原 scope。内部 timeout/error 同样等待清理。所有非 session 事件必须有非空字符串 turnId，turn.completed.status 只接受合法终态，batch 元数据类型严格检查。最终 planner 源码 SHA-256 仍为 `8ad27686bfe93facd2edaabd4a11a25693d9719bca1d653d45ef54e9d49c343c`，最终 475 项包含 32 项 planner 组件。真实原生取消窗口仍未完整验收。

Schema 合并保留上游 backrefs 帮助函数及 default/adaptive 行为。SW 显式选择 fixedDeflate，避免用未压缩源码长度误选 minified 后更大的 codec；fixed/stored 解码的输入、输出、距离、UTF-8 和 JSON 边界不变。实际 Schema 的值和序列化顺序保持，无 eval、远端脚本或新增信任入口。最终原 SW 预算和 CSP 门禁通过。

main92 两项失败仅作测试修正：旧 undefined pageRules 应拒绝预期改为全站 Candidate 正例，并保留 file://、MAIN 和未信任 Host 拒绝；legacy 全站正例使用同范围合成 proof，另保留窄 proof 拒绝。额外正例明确 verification:null、nativeEffects=0。没有放宽生产权限。

## 历史失败与不完整记录

- 早期integrated-components原log只有235条且无终结汇总，不采用曾显示的298；历史4e阶段另有完整329。
- 4e397463冻结review和双包保留其原hash，仅作为历史阶段。
- main92首轮完整TAP为431 tests / 429 PASS / 2 FAIL；失败是旧undefined规则预期与全站candidate/窄proof不一致的fixture，原日志未改。
- final-main92-candidate-components.command.json报告433，但实际原log91437bytes、381条ok且无plan/counts尾部；本审阅明确弃用其433完成声明，原件保留。
- 最终另名final-acceptance-components同步捕获后fsync原子落盘，独立核得完整1..475 / 475 PASS / 0其它，33测试入口。
- 整合早期上游后的production SW335273>327680预算失败保留；现有静态Schema编码优化后最终326336通过原门禁。
- 立即turn/start ACK后的真实取消此前失败并停止子进程；只有开始流式后的interrupted终态有证据。
- 旧Unix socket环境EPERM与Go架构审计24条既有登记缺口未隐藏。

## 保存复用证据边界

真实模型提议经过原 normalize 和 compiler，三个输入文件 hash 与当前候选一致。提议 SHA-256 为 `ae2357e4ac927dd07ededdb1d422d94ab0c503384a39fba50a8ee641d809ea8c`，确定性 JavaScript SHA-256 为 `493e87feb66dce68eaec8f0533577103777a4d8f6000bc59880ba5ee2c96ed9a`。两次执行使用明确标注的模拟 Page API，没有 AI 连接；这不能证明真实 Chrome、RunHost、Controller 保存/重载或关闭 AI 后真实重复执行。

## 尚需真实完成的验收

1. macOS 正式 OpenDesk / Native 安装、配对及当前用户 Codex 登录复用。
2. 实际 Sidebar 持续规划与 Codex 主动 Browser 工具请求、逐次授权和真实返回。
3. 审批中导航、撤权、停止、Native 断线，无迟到内容交付或自动重放。
4. 真实提议经原编译器、原 RunHost 运行并取得持久结果。
5. 保存、关闭 AI、重新打开保存版本，并在真实网页执行两次。
6. 原生 Sidebar 尺寸、缩放、键盘、长会话及错误恢复体验。
7. 实际 Go / Node Native 安装互通、最早取消时间窗的明确终态及旧 Page 迁移兼容。

冷恢复因 0.159.2 公开协议缺环境覆盖能力而正确拒绝，resumeSupported=false；不记恢复成功 PASS。MCP canary 只证明记录的 1 秒 live startup 窗口，不声称无限监测。个人远控 enrollment 未被操纵进行攻击测试；临时关闭由固定版本官方源码、实际 child 环境矩阵和真实 CLI 运行支持。新增上游 Chrome 测试源文件也不是本轮执行证据。

## 原始证据位置

- `opendesk/docs/integrations/browser/evidence/r16-20261010/remote-control-final/final-evidence.json`
- `opendesk/docs/integrations/browser/evidence/r16-20261010/remote-control-final/real-codex.log`
- `opendesk-browser/docs/framework/evidence/r16-local-codex-20261010/final-acceptance-components.log`
- `opendesk-browser/docs/framework/evidence/r16-local-codex-20261010/final-acceptance-source-check.log`
- `opendesk-browser/docs/framework/evidence/r16-local-codex-20261010/final-main92-verify-packages.log`
- `opendesk-browser/docs/framework/evidence/r16-local-codex-20261010/builds-final/build-production.json`
- `opendesk-browser/docs/framework/evidence/r16-local-codex-20261010/builds-final/build-development.json`
- `opendesk-browser/docs/framework/evidence/r16-local-codex-20261010/real-model-workflow-compile.json`

完整回执、构建 manifest、33 测试入口 hash 和历史原件 hash 在配套 JSON 中逐项列出。

## 官方固定版本依据

- https://github.com/openai/codex/tree/rust-v0.159.2
- https://github.com/openai/codex/blob/rust-v0.159.2/codex-rs/cli/src/main.rs
- https://github.com/openai/codex/blob/rust-v0.159.2/codex-rs/app-server-transport/src/transport/remote_control/mod.rs
- https://github.com/openai/codex/blob/rust-v0.159.2/codex-rs/app-server/src/request_processors/thread_processor.rs

不引用不存在的official-source-excerpts归档路径，不转载第三方源码摘录。原件只按明确输入身份和原始回执评价；正式验收仍须macOS/Chrome现场证据。
