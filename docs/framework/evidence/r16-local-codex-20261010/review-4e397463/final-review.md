# R16 独立安全与协议审阅

**最终结论：源码与组件在限定范围内通过；总体产品验收为 NOT_ACCEPTED，原生 Chrome 为 NOT_TESTED。**

本原件已在最终 Browser 事件校验、统一停止清理和静态 Schema 压缩应用后冻结。没有仍然打开的、在本审阅范围内已证实的关键源码安全缺陷。各领域评分不提高为原生验收分数，也不取平均值。

## 独立性与方法

审阅者为独立反方安全与协议审阅代理，未编写本轮生产代码、未修改两个仓库或提交代码、未操作浏览器、未执行模型测试。审阅方法是读取正式设计和实际源码、核对官方固定版本实现、读取原始测试和构建回执，并独立重算输入与产物hash。提出修复意见后，代码由其它实现者修改，root负责串行应用；本目录只保存审阅原件。

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

Go 远端 master 为 `005a2f33a640c76565775a398b243f1d66a6caf1`。远端提交/tree由root核对；本审阅独立核对其最终生产8文件、测试3文件以及原始最终13产物hash。生产源码集合为：

`1e96b15cfaaa304408c71edb52ea021e00334df77a75a180f43c638beb6bb22c`

Go最终race日志按含子测试的计数为 browserai 47 PASS/5 SKIP、browsercli 2 PASS、选定Native合同5 PASS；vet三个包通过。真实CLI五个顶层测试通过，冷恢复子测试明确SKIP。Darwin arm64两个测试二进制仅交叉编译通过，未执行。实施说明采集后追加发布链接，旧manifest文档hash冻结保留；生产/测试源码没有漂移。

Browser在main基线 `4e397463a865d6b27562ba853dca19cb8ca2a475` 的最终工作区核对。review在root提交前冻结，最终发布commit由root另行记录；以下输入和产物hash确定本次实际审阅候选。

- 完整TAP含 `1..329`、329个顶层ok、tests=329、pass=329，fail/cancelled/skipped均为0；命令退出码0。
- 源码检查实际259文件通过；22个本次执行测试输入另记完整hash。
- 两次构建各184个sourceInputs，与当前文件全部一致，构建期间无source drift。
- production30文件、development45文件逐项字节/hash全部一致，聚合包hash重算一致。
- npm run verify退出码0，两个完整包报告均通过；privilegedDynamicExecutionFound=false。

| 产物 | 包SHA256 | SW字节 |
|---|---|---:|
| production | `b9cd7fe3795bf619cc1a760329b3a3b2b3a550e6cf2c05cde7f01a462b4dc0a1` | 326826 |
| development | `c8da82fa51e91ae9c595437e8e657a652529935865de1b840ff0e8c0fb8931f8` | 326992 |

相同184个构建输入的紧凑JSON集合SHA256：

`65eca018284bb5fdd6481334fbe0273dd6b599e0bb5a8a6b7f418e02ec17455f`

原production门禁327680字节保持不变，最终326826字节通过。旧失败335273字节、旧235条不完整组件记录、此前324项及a8f1c08包均保留原阶段范围，没有替换或伪称最终证据。

## 最后修复的独立结论

### stdio App Server可解析持久远程控制偏好

固定私有child marker=1，官方0.159.2 DisabledEphemeral，避免持久偏好路径；不修改用户enrollment。

证据范围：最终Go源码hash、owned-child矩阵、官方固定版本源码、最终真实CLI日志。

### 个人MCP/环境/指令和Provider配置不能视为空

固定版本和启动配置、有效配置核验、无环境与根目录、环境注册启动前拒绝、实际1秒MCP canary窗口。

证据范围：Go最终production set与实际CLI日志。

### 停止ACK后UI cleanup生命周期与内部timeout/error清理可能脱钩

独立cancel/close promise，close抢先，准确终态及连续cursor排空；超时/内部错误等待同一关闭；未知状态明确报告，禁止自动重发。

证据范围：最终local-codex.js 8ad27686bfe93facd2edaabd4a11a25693d9719bca1d653d45ef54e9d49c343c；最终329 TAP内含32 planner组件。

### 无turnId或无合法status事件不能作为已知回合终态

所有非session事件先检查非空string turnId，忽略明确历史turn；终态status白名单；batch元数据类型检查；无效时关闭原scope。

证据范围：同一最终生产文件及缺失/空/数字turnId、非法status与batch负例。

### 整合上游后production SW超固定320KiB预算

仅现有静态Schema数据表示采用有界fixed/stored DEFLATE解码；值、顺序、JSON字节保持；无动态执行/新信任入口；原预算不变。

证据范围：实际Schema与畸形/Unicode/多block/边界/确定性回归；最终SW326826字节及两包verify。

## 上游整合后的权限语义

新增Task安装identity/generation仅约束task: saved Controller；R16固定draft观察和wf-*保存脚本不冒用安装身份。

Task v1仅page.automation，不继承手工Controller的HTTP/Cookie/宿主存储/Native。

Native run.start缺Task安装快照时安全拒绝，不自动采用最新身份。

R3.1明确排除原Workflow Run/AI endpoint；本轮保留精确站点请求和执行确认，不宣称全产品permission-silent。

失败Hello只允许下次明确调用重新握手，未重放已派发HTTP。

最终构建后7a5c88b到4e397463的追加只涉及其它CI、SDK原生测试及其记录；本次184产品构建输入和22项执行测试输入未变化，不需要重跑未受影响的真实模型测试。

## 保存复用证据的边界

真实模型提议已通过原normalize和compiler，其三个输入文件hash与当前候选一致。提议SHA256为 `ae2357e4ac927dd07ededdb1d422d94ab0c503384a39fba50a8ee641d809ea8c`；确定性JavaScript SHA256为 `493e87feb66dce68eaec8f0533577103777a4d8f6000bc59880ba5ee2c96ed9a`。两次执行使用显式模拟Page API，没有AI连接；这不能证明真实Chrome、RunHost持久回执、Controller保存/重新加载或实际关闭AI后重复执行。

## 仍需实际完成的验收

1. macOS正式OpenDesk/Native安装、配对与当前用户Codex登录复用。
2. 实际Sidebar持续规划与真实Codex Browser工具请求、逐次授权及返回。
3. 审批期间导航、撤权、停止和Native断线，核对无迟到内容交付。
4. 真实结构化提议经原编译器、原RunHost运行并取得持久结果。
5. 保存、关闭AI、重新打开保存版本并在真实网页执行两次。
6. 原生Sidebar尺寸、缩放、键盘与长会话错误恢复。
7. 实际Go/Node Native安装互通及最早取消时间窗的明确终态。

0.159.2的冷恢复缺少公开的环境覆盖能力，当前实现正确拒绝并返回resumeSupported=false；安全拒绝有证据，恢复成功不记PASS。实际MCP canary只证明记录的1秒进程存活启动窗口，未扩写为无限监测。真实远控enrollment没有被操纵作攻击测试；临时禁用由固定版本官方源码、实际owned-child环境及最终CLI运行支持。

## 原始证据位置

- `opendesk/docs/integrations/browser/evidence/r16-20261010/remote-control-final/final-evidence.json`
- `opendesk/docs/integrations/browser/evidence/r16-20261010/remote-control-final/real-codex.log`
- `opendesk-browser/docs/framework/evidence/r16-local-codex-20261010/final-candidate-components.log`
- `opendesk-browser/docs/framework/evidence/r16-local-codex-20261010/final-candidate-verify-packages.log`
- `opendesk-browser/docs/framework/evidence/r16-local-codex-20261010/builds-final/build-production.json`
- `opendesk-browser/docs/framework/evidence/r16-local-codex-20261010/builds-final/build-development.json`
- `opendesk-browser/docs/framework/evidence/r16-local-codex-20261010/real-model-workflow-compile.json`

## 官方固定版本依据

- https://github.com/openai/codex/tree/rust-v0.159.2
- https://github.com/openai/codex/blob/rust-v0.159.2/codex-rs/cli/src/main.rs
- https://github.com/openai/codex/blob/rust-v0.159.2/codex-rs/app-server-transport/src/transport/remote_control/mod.rs
- https://github.com/openai/codex/blob/rust-v0.159.2/codex-rs/app-server/src/request_processors/thread_processor.rs

不转载第三方源码摘录，不引用不存在的official-source-excerpts归档路径。所有数量、范围和限制以本原件JSON及所列原始回执为准。
