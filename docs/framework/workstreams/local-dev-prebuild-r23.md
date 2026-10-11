# R23 本地自动准备实施与交接

状态：IMPLEMENTED_PARTIAL_ACCEPTANCE；整体十项≥95未通过。会话 `01a128f2-a0c9-7913-9df5-ea28062b1586`。用户已授权在Browser main修改、测试并提交；不创建分支/worktree、不推送、不发布。独立文件系统测试快照只用于隔离依赖、dist及测试资源，不是Git worktree。

## 输入和主分支

开工HEAD `97637c12a296c5a7b2c231bfc2124f3073ca1185`，当时origin/main `0c55b8adb9ef3dc21bf9d5dc9e1c5d1cf80c1095`，main领先9；已有未跟踪 `.runtime/` 保留。已执行用户要求的status/HEAD/fetch/origin身份检查，并阅读AGENTS、testing-guide及所列Resolver/CLI/UI/构建/API资料。已复核R22相关旧证据，未把旧候选Chrome记录提升为本轮PASS。

其他会话在保留本任务改动后合并main到 `2dff9dac`，随后到 `518ef4485da0b56b661b9082c9e6f5d6d8388221`。并行fetch后的origin/main为 `7baabd24d0c38aa1f8077a8fff37bff3008e32b1`；提交前工作区有其他会话的reading-toc源码与记录，不pull/rebase/reset这些工作。本轮只暂存自己的明确文件，源码输入以证据清单SHA而非仅HEAD匹配；其余差异原样保留。

## 实施树

本地项目准备
  已实施：授权合法程序自动准备；Direct不构建；普通Workspace不构建
  已实施：400ms合并、作废延长至1600ms、一个active+一个latest pending
  已实施：进程最多两槽、显式FIFO优先、加入既有排队后台任务时升优先级；每四次显式排队入场给后台一轮
  证据：57项调度/CLI、最终取消/公平性/代际错误修复90项核心回归通过；实际30保存与10分钟长测
内容缓存与入场
  已实施：npm绕过移除、文件内容/锁/正负探针/帮助代码身份复核
  已实施：不可变产物/稳定失败缓存、源码错误不回退、关闭排队不编译
  已实施：仍使用原Native/Controller/Page USER_SCRIPT，真实目标双重复核
  证据：真实10次运行零新增编译、冻结旧结果、npm/HTTPS/声明资产
  未实施：持久compiler、模块级增量缓存、同版本工具实现字节全量身份
Sidebar与Codex
  已实施：保留原Tab、按钮、直接编辑/本地模式；准备标签与高级诊断、元数据轮询
  证据：真实Sidebar Controller/Page运行、重开手动Switch、草稿保留；实际Codex CLI四次有意运行与错误修复
  缺口：Go projects.list清洗掉preparation，Go→Sidebar实时细状态未闭环
交付
  已实施：真实源码、技术/操作文档、可复现脚本、独立评审、原始数据
  未接受：整轮网络观察器FAIL；独立最终F3、ZIP安装及正式账本未完成

## 资源归属与释放

没有覆盖根目录共享dist/.wxt或node_modules。测试快照：`/var/folders/b3/0l3tmv5j3hs83hp8l34z89p00000gp/T/opendesk-r23-build-fylwtyev`，独立npm ci与构建、原始receipt保留供复核；共享原dev PID89085不属于本任务，从未由本任务停止。R22.1会话之后报告收到用户授权正常停止旧dev；本任务没有复用该进程。生产/开发构建用独立端口43130的归属检查，不抢43119/43120。

真实CFT155使用本任务 `OPENDESK_NATIVE_INSTANCE=r23-prebuild-01a128f2` 和launcher新建的独立Profile；所有本轮最终Native报告 `resourcesReleased:true`，进程/Profile/该实例安装均按所属清理。没有修改个人Chrome、另一会话R16R2 Profile或OpenDesk Go源码/全局安装。AX许可输入按精确CFT PID、原生控件对象和唯一Allow校验，非名称匹配，不自动授予Chrome权限。

长测最终resolver关闭后watcher/timer/cache/inflight/active/queued为0；没有遗留本任务后台服务。构建快照是静态留存文件，不是运行服务。main提交后本任务释放源码写入；R22.1可基于提交复用CLI lower-camel/instance修复，避免重复覆盖。另一个reading-toc会话的文件不在本次提交。

## 原始证据与等级

全部原始资料在 `docs/framework/evidence/local-dev-prebuild-r23/`；证据清单逐文件SHA、等级和失败状态。较大的Chrome netlog/截图和中间失败本机保留，清单说明未全部纳入Git；关键原始JSON/回归日志/回执选择纳入本任务提交。

- `baseline-verified.json`：原Resolver + 计时，同Node26/Webpack5.111.1配置；M2Max/96GiB。此前Node24 baseline不作为同设备同runtime对照。
- `optimized-priority-fifo.json`：当前FIFO候选，六组12次命中都0编译。npm命中p50/p95=7.66/9.88ms，基线31.77/36.40ms且12次构建。其他已有缓存路径增加数毫秒验证开销，修改后仍整份编译，没有虚构compiler加速。
- `sustained-verified.json` + JSONL：602221ms，11658真实写入，2Webpack，业务0，最终value文件SHA匹配11658；CPU9.105855秒，RSS采样101187584–115851264字节，资源释放0。计时轮询覆盖缺陷随后修复，旧1995ms通知延迟不可代表当前；调度策略与长测内容语义不变，FIFO由新回归独立验证。
- `components-verified.log`：隔离快照953PASS、1SKIP；skip的全局安装环境测试不等于PASS。后期新增FIFO/CLI/隐私/通知计时定向回归独立记录，不用简单求和冒充统一全量分母。
- `core-final.log`：88/88；最后代际/撤队/后台配额修复 `core-lifecycle-final.log` 90/90；`priority-regression.log` 57/57；`source-check-complete.log` 343文件语法、构建入口和CSP通过。没有可用的单独TS/lint npm脚本，不猜命令。
- `builds-verified/`：production packageHash `61deb08f998e3c391434b9d96c7cce3758784f044a756b4b300e1e93fe716594`；development `2e83df8853f31e7ca56e40b67d2091f96c09ec883233dd549f9b3fea7db9afdf`。verify-package均PASS；后期Node准备和测试修改不影响扩展产物字节，源UI/NativeDriver已在这两份包中。
- `cli-installed-lifecycle-final.json`（此前priority-fifo记录保留）：最终源码真实tarball安装、Webpack5.111.1、prepare命中零编译，PASS_PACKAGED_NODE_ONLY。Go真实配置只读解析 `go-installed-config.json` PASS；**完整R17 Go lease→Sidebar运行 NOT_TESTED**，不能把读取配置或Node安装当Go集成验收。
- `chrome-static/codex-*`：实际Codex CLI0.159.2、4次有意run/result与修复，原始JSONL/receipts保留；该候选只在后续Node准备调度入口有差异，不冒充最后scope；该整轮后来因旧Sidebar reopen错误期待而FAIL，不能整体改写PASS。
- `chrome-complete/acceptance.json`：29功能PASS，含真实npm/静态HTTPS、PageCSS/PNG/受管UI/Sidebar/持久结果/丢ACK只读恢复；最终短暂iframe CDP disconnected使网络观察合同FAIL，整轮FAIL。资源释放true。
- `chrome-lifecycle-complete/acceptance.json`：FIFO调度候选8个定向Native用例PASS，真实单文件Direct、10prepared零编译、30保存、native权限撤回恢复、所属Host SIGTERM断开只读恢复、owned/external导航与runtime-no-remote-JavaScript，状态PASS_R101_NATIVE_LIFECYCLE_TARGETED；不覆盖上项整轮FAIL。最后Node主动撤队/后台配额/代际修复后，`chrome-admission-final/acceptance.json` 5项相关定向PASS，当前源文件与隔离快照一致，沿用同一扩展/Native安装合同。
- FIFO候选 `chrome-lifecycle-complete/r23-performance.json`：本地复核p50/p95=4.44/13.74ms，Native admission18.38/56.75ms，端到端187.17/250.55ms。上一批分别p95=4.14/26.40/194.03ms，三批均保留；最终 `chrome-admission-final/r23-performance.json` 为本地p50/p95=4.45/5.18ms、Native20.22/26.94ms、端到端191.71/198.80ms。Native admission不是纯传输，端到端包含150ms轮询，真实浏览器执行单独阶段尚未完全测量。
- 原错误安装名、AX名称歧义、pageReady端口关闭、旧SHA观察器、重开默认Switch和unsafeHTTPS依赖等失败均保留。仅有代码、环境或观察依据明确变化后重试；生产pageReady修复仅只读ping初始化固定session，业务execute不重放。

## 独立评审与未关闭门槛

独立只读Codex评价，设计与实施十项分别列于R23说明；其依据提供的源码/证据摘要，没有亲自核验全部回执。Claude401和Gemini认证不可用的原始失败保留；不伪称三名专家全通过。最后delta审查补充FIFO及定向Native证据，评分按其原文保留，负责人不自行加分。该评审的后台饥饿、退出未主动撤队、旧错误覆盖新代三个源码问题随后已定向修复，90/90核心测试证明组内FIFO、每四显式后台一轮、占槽任务未释放前关闭项目已撤队以及旧语法错误不覆盖新代。其核心96/96是先前摘要引用，最终scope以90/90原始日志为准。

Go实时状态接口缺少字段是明确跨仓库阻碍，本轮遵守只读Go范围。256 admission长会话策略、完整七阶段真实尾延迟、更大/更多项目资源证明、完整最终网络观察、F3/ZIP仍未关闭。缓存和静态依赖的95只在可信锁定工具及已验证静态依赖合同范围内有效，其他维度低于95，**整体不通过**。

## 重现真实Native命令

命令从上面的独立快照根目录执行，使用新证据目录。先确认独立Native实例、Profile、package receipt与端口归属；不要复制旧Profile或共享安装。

```sh
CHROME_FOR_TESTING_BIN='/Users/shopme/Documents/workspace/opendesk-browser/tests/.cache/m5-browsers/155.0.8059.39/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' \
OPENDESK_NATIVE_INSTANCE=r23-prebuild-01a128f2 \
OPENDESK_R23_ACCEPTANCE=1 OPENDESK_R101_ACCEPTANCE=1 OPENDESK_R23_NATIVE_AX=1 \
OPENDESK_DEV_SLICE=lifecycle OPENDESK_DEV_LIFECYCLE_CASES=permission,port,navigation,external \
OPENDESK_DEV_PACKAGE_DIR="$PWD/dist/production" \
OPENDESK_DEV_BUILD_RECEIPT='/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/evidence/local-dev-prebuild-r23/builds-verified/build-production.json' \
OPENDESK_DEV_EVIDENCE='/tmp/opendesk-r23-native-new' \
GIT_DIR='/Users/shopme/Documents/workspace/opendesk-browser/.git' \
node tests/framework/local-dev-native-acceptance.mjs
```

完整Sidebar/npm/Page一轮删除SLICE/CASES并用新输出；实际Codex路径另加`OPENDESK_R101_CODEX=1`。这不是现成PASS承诺，最后完整轮次的观察器FAIL仍需按真实目标生命周期修复，不可过滤错误以凑PASS。
