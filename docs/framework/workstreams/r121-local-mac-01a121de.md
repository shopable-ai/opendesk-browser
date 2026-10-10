# R12.1 本机目录开发验收

用户选择日常 Google Chrome。已接通实际扩展 `ccfcjegpkdlgbclopjmadlcjedelidmf`，加载路径仍为现有 `dist/development`；没有覆盖共享工作区、扩展数据或草稿。旧失效 CFT Native 安装先备份到私有 `~/.opendesk-browser/backups/r121-pre-daily-chrome`，再按正式 CLI cleanup/setup 切换到 Chrome。Chrome 正式界面批准 Native Messaging 和 USER_SCRIPT，首次授权后的扩展重载完成。凭据不进入证据或 Git。

标准页面 `http://127.0.0.1:43111/demo-form.html` 使用正式静态服务，原占用已退出后由本任务启动，PID18166。日常 Chrome 实际 `doctor`/MCP handshake connected；Controller 返回标题与 version1，Page 原生按钮点击后计数1；Sidebar 可连接唯一 provider、运行本地项目，107字符草稿往返切换完全一致，关闭重开仍保留项目选择并能再次运行。细节见独立证据目录 `docs/framework/evidence/r121-local-mac-01a121de/`。这部分没有在并行 main writer 活跃时改写示例文件。

默认 Codex MCP 的两个正式示例授权保持原样，入口仍是现有 local-ai-loop-r1 工作区的 `native-agent/local-dev/mcp.mjs`，其源码与 main 对应实现一致，该工作区不能归档。其他既有 MCP 客户端拥有唯一 Sidebar provider，本对话的 provider 状态如实返回 `E_DEV_PROVIDER_CONFLICT`；直接 MCP run/result 成功，Sidebar 使用已注册 provider，不启动第二个默认服务，不终止其他对话进程。

## 已取得的真实证据

- 主干9ebd9536、生产包 `feaf5ca1bbc01c07057fd9c7495322fbcf50ff031f4637536c00fbcdb9293456`：复用 native-12 原始25项 Mac Codex/Page/Sidebar证据；本轮新增 restart-09，同一 profile 完整 Chrome 退出重启、原 MCP/provider 重连、文档/Host 更新、源码1→2→3、结果自身 sourceHash 和不可变旧结果均有原始回执。原始/new Host 读取旧结果被拒绝，不把该查询推断为“防重放测试通过”。
- WXT 随后合入 main c44ccaa9，Native、RunHost、Sidebar等产品输入改变；旧25项没有提升为新包正式 PASS。
- 新生产包 `93117206bfd14bfbf4344ad0e34e303114f1f81f03818860efc914f95ede1586` 已构建，94项受影响组件测试、225文件源码检查通过。实际 Codex0.144.5 已完成101→102→`R1_RUNTIME_DIAGNOSTIC`定位→修复103，四轮持久结果和原始工具事件已保存；没有构建项目、生成JSON交接或上传草稿。
- 最新完整 campaign 暂停在真实 Sidebar 项目菜单。CUA报告 Mac 锁屏且不能自动解锁；仅暂停本任务 runner41452，保留独立 profile 与 Native/MCP，不绕过锁屏。用户解锁后继续定向验证；这不是完整 campaign PASS。

## 本轮改动

仅修改现有两份验收驱动。launcher 可显式选择既有 k5 restart adapter，保持原始 launcher/profile/进程身份，EOF结束 adapter 生命周期，并核验所有 Chrome generation 清理回执，错误强制 FAIL_CLEANUP。Native验收新增 restart slice；原始 stdio MCP与provider必须存活，明确新Host、新文档、主动读取最新源码，旧结果查询只接受精确 `E_HOST_NOT_READY`。external-select路径保留真实菜单输入与实际值检查，跳过会错绑同名Chrome的AppleScript。NetLog只覆盖重启第二代，第一代明确 NOT_TESTED；adapter源码指纹进入 verificationInputs。

不新增运行内核、数据库、依赖、源码服务或产品UI，不放宽权限、CSP、消息大小、安全身份或未知结果规则。

## 历史阻塞与续接记录

以下为上一轮历史状态，已由后文2026-10-10实际恢复记录接续。旧时需用户在本机解锁。暂停 runner 的PID/工作目录校验和恢复条件在 `latest-full-02/lock-pause.json`。恢复后原生菜单选择 project/page-project，不赋值DOM或伪造事件；超时则保留失败，只补尚受影响的场景。完成当前包完整验收和重启后才合入PR。

仍未关闭：新Host访问原Host旧结果、重启第一代网络观察、完整物理Native60KiB与EOF/入场撤权/导航矩阵、Page正式安装/自动运行/停用/重启、最终框架F3与ZIP。它们不由组件、旧候选或本轮有限原生结果提升为PASS。R10.1 npm/HTTPS能力不在本轮开发。

失败原始材料保持本地，包括旧AppleScript错绑/观察错误、清理失败、receipt不匹配，以及本轮PATH误选旧Python导致缺少tomllib；后者已使用现有Python3.14.6修正。全桌面失败截图不发布，独立文件索引记录其SHA。没有release/publish。


2026-10-09 19:31 UTC 续接核查：PR #58 的已推送提交 `82329882ebefcc4f1368e0b58345a5ef93373169` 三组 GitHub 工作流全部成功（run 37980079454 / 37980079532 / 37980079775）；原始工具回执保存为 `pr58-ci-82329882.json`。CI 不替代本机原生验收。CUA 再次确认 Mac 锁屏，独立 runner41452 仍为 SIGSTOP，Chrome41469 仍存活。最新远端 main `1dfee629` 对当前 main base 的产品差异仅为 Native 安装帮助文本，附带文档与环境断言；没有更改本地源码执行或 Native 协议。merge-tree 无冲突。暂停的冻结产物未改动，尚未集成该后续差异，PR 仍保持草稿。


2026-10-09T19:33:10.723408+00:00：同一物理锁屏阻塞连续三轮核验仍成立。CUA明确报告Mac锁屏；权威进程读数确认验收runner41452为Ts、受控Chrome41469为S，未重启或接管其他profile。独立CI核查已经完成，剩余原生Sidebar/当前包重启及main集成依赖解锁。本目标按阻塞审计标记BLOCKED_PHYSICAL_MAC_UNLOCK；保持冻结产物、原始回执和草稿PR，不将已完成子场景当作整体PASS。

2026-10-10T05:25:01.883690+00:00：续接核查：Mac日常Chrome原生AX可读；旧runner/CFT/静态服务均退出，未恢复PID。latest-full-02保留为无最终回执的未完成campaign。仅补当前包Sidebar和独立重启切片；Codex四轮复用。自己的陈旧Native socket经doctor/lsof/绑定核验后私有备份并清理，日常Native不动。原始核查见 recovery-20261010-01a12441/state-recovery.json。

2026-10-10T05:33:16.740596+00:00：当前93117206包完成current-sidebar-01a12441定向Sidebar、current-restart-01a12441完整Chrome进程重启及current-core-01a12441基础P0/P1/P2/P3真实验收，均完成资源释放。补core是为闭合latest-full-02未落盘的Page DOM/timer断言，不重跑Codex四轮；旧campaign未改。重启522→658，同profile、MCP652、原provider；新Host旧结果和第一代NetLog仍NOT_TESTED。日常Chrome本次MCP run 035729ae-0425-418e-be6b-9d173b5cce61、result dcc27681-cc45-4812-a0c3-b7d7dcd52012、sourceHash 9baa63e05ceed010701668b883b28ce50f2d2a3445d09eaf3004af38bd76886e、completed/released。file://目标拒绝与provider冲突原样保存。最新main 21fc49a3仅settings帮助输入受影响；继续安全集成前补该入口。

2026-10-10T05:41:02.251096+00:00：最新main21fc49a3已无冲突集成。新包af40f325cd9122ba6cf96b6b2d252c4190d6263a48e396f1748708dab972766a仅Native安装帮助HTML输入变化；30项定向组件与226源码检查、构建通过。integrated-native-sidebar-02-01a12441真实Native授权/握手/Sidebar定向PASS，包字节不变、资源释放；首次授权超时FAIL原样保留。原93117206的基础core、Sidebar、重启及Codex四轮依输入一致性复用，不宣称新af40全量原生PASS。证据索引见recovery-20261010-01a12441/acceptance-index.json。日常Google Chrome实际可执行，标准服务PID3387保留；本客户端provider冲突显式存在，不抢占其他客户端。接下来只剩同一推送HEAD的CI、PR58合入及本轮分支删除；排除范围与NOT_TESTED保持原样，未发布。
