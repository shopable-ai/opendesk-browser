# mac24dev 云控表单演示页面

先看[云控能做什么、怎么判断做对了](../../../docs/architecture/browser-framework/cloud-control-r5.2-complete-function-tree.zh-CN.md)，或在[本机阅读页](http://127.0.0.1:43121/review.html#cloud-overview)直接查看。

## 11 月 19 日 · 已有请求复核与框架设计

从[业务页](http://127.0.0.1:38001/public/opendesk-cloud-demo/index.html)用账号 `test`（569）登录，密码沿原私有记录使用。选 #1288、查询原键 `378df70d-0d16-47a6-a69a-c85df871da8f`。在[请求管理的原 Job](http://127.0.0.1:43121/?job=05a6e7a2-a5b7-400b-a82a-4bab42d989d5#detail)对照 Provider completed、回执确认和 released，再看[网页效果](http://127.0.0.1:43111/cloud-proof.html)的一次提交。Chrome 原 Run / Result 与观察文档关联仍待核。复查已有结果只需查询；另一次有意手测的步骤见下文。

直接在浏览器阅读[需求如何提出与确认](http://127.0.0.1:43121/review.html#cloud-needs)、[其他业务和故障用例](http://127.0.0.1:43121/review.html#cloud-acceptance)，或[看本次原表单的证据](http://127.0.0.1:43121/review.html?job=05a6e7a2-a5b7-400b-a82a-4bab42d989d5#review-evidence)。正式资料见[业务需求与实施顺序](../../../docs/architecture/browser-framework/cloud-control-business-design-20261119.zh-CN.md)、[测试计划与执行记录](../../../docs/framework/cloud-control-business-test-plan-20261119.zh-CN.md)和[本版独立设计评审](../../../docs/framework/cloud-control-business-design-review-20261119.zh-CN.md)。下方状态均以各自标注的观察日期为准。

## 当前完整链路查看与单次实测（2026-11-18，owner 01a1eda2）

当前仍为持续开发。用户可在 [本机请求管理](http://127.0.0.1:43121/) 搜索姓名 `CloudChain-1118-080652-eda2` 或原键 `992ac642-87c4-4923-b2d3-decad8bdf9ac`，点「查看」；同一详情展示准备条件、十个执行环节、预期/实际/关联/时间/来源，以及 PASS / FAIL / NOT_TESTED。自动查询只读，刷新保留搜索与选择，过期或失败不沿用 READY。

本轮在 [原业务入口](http://127.0.0.1:38001/public/opendesk-cloud-demo/index.html) **仅新提交一次**，Job `906b236c-9e6f-4b79-8f3b-9ed8e7285a88`。已采集提交前保存原键、一次 submit、同姓名网页 ready → submit → done、Provider completed / 回执确认 / released，及同账号刷新重登后恢复同键、禁止重提、历史仍为同一 Job。原 huigege 键和证据保留，未重放。

**完整链未通过：执行证据 7/10、准备条件 5/8；失败 0 项、未验证 6 项。** 本机详情已分别显示 Provider completed / 回执 / released 与核验状态；只有准备和执行全部 PASS 才能判完整。网页/native 证据与响应均绑定精确原键＋Job，旧缓存不会串入当前 Job。 未确认的是 Chrome 原宿主实际运行、原生文档与观察文档的关联、原 Run / Result 结束。Provider admission 引用、同姓名网页效果及最终 completed 不能替代这些证据。本轮没有可见填字事件或动画证据，也没有重新核验当前 Chrome 加载路径、revision、serve、安装审阅或权限；上轮值仅为历史。原生侧栏 URL 被浏览器工具安全策略拒绝（协议不允许），没有换控制面绕过。用户恢复后，原生证据访问阻塞连续三轮仍未解除，goal 已重新登记 blocked，完整目标仍未完成。blocked 是核验工作状态，不是本次业务执行失败。

BFF 原键经原 `cloudcontrol.s.ts` 的固定命名空间哈希后，与 Provider 原持久幂等索引及同一 Client / Job 精确匹配；不是只按姓名或 Job 复用证明。私有读取只在原远端进程中进行，页面仅取得有限状态与关联是否匹配；不公开凭据、原生 Run / Result ID 或结果正文，`allowResult=false` 保持。新请求未回执数为 0；另外两项历史未回执记录保留，不能视为当前 Chrome 槽已实读空闲。

逐步证据表、实际 UTC 时间、最短手测清单、文件与验证范围见 [本轮证据报告](../../../.runtime/cloud-ui-20261118-01a1eda2/REPORT.zh-CN.md)。本机查看页源码在 `.runtime/cloud-ui-20261118-01a1ecae/admin-view/`（忽略目录，本机交付，非正式后台）。仅重启本任务 43121 服务；43111、Provider/BFF 隧道与其他服务保留。远端业务页文案补丁仍未部署，未构建或重装 Browser，未提交/推送。production、全量矩阵及评分延期。

## 上轮观察与手测说明（2026-11-18，owner 01a1ed6a；Chrome 与服务状态开始时重查）

当前为持续开发的核心流程验证，不是 production 验收。下方 11 月 6 日及更早内容保留为历史，不能覆盖本节最新实读。真实 Chrome 扩展 ID 为 `ccfcjegpkdlgbclopjmadlcjedelidmf`，沿用 `dist/development`；本轮「调试 → 本地开发服务」显示已连接，运行 revision 为 `8c9fa26ba4a8816b799d9bbe6abeb74eaa1cc60edbb1b4d670a77c018c0c93c8`。单一 watcher 原 PID 89207 保留，未重建/重装扩展。

用户反馈「刷新设备里没有云控客户端」后，本轮实际点击刷新：当前演示账号返回 **#1288 / READY**，昵称仍是「当前 Mac Chrome（待配对）」。原 `huigege` 请求恢复后设备和姓名被锁定，不能再次提交同键；旧页面却提示「可以明确提交一次」，这是已复现的 UI 误导。昵称不表示真实配对状态，业务目录也不是所有 Provider 客户端目录。

已在真实 Chrome 展示「云控 → 连接设置与解除配对」并核对已配对、已连接、托管及对账完成、执行槽空闲、目标网站已授权；`sample.form-fill@1.0.2` 为当前已批准，结果正文不回传。连接区的空输入框是新配对表单；当前 Provider/Executor 在「运行环境与历史统计」，不能据空框要求重新配对。

### 当前身份对应

| 身份 | 本轮只读实读 |
| --- | --- |
| 业务账号 / userId | `opendesk-demo-20261030-4ac956` / `569` |
| 本账号业务设备 | `1288`，旧昵称「当前 Mac Chrome（待配对）」 |
| Provider | `9c4f182d-7a5f-403d-9b4d-c2144ef35e5b` |
| 执行浏览器连接 URL | `http://127.0.0.1:43112`；后端仍使用原 CA 验证的 `https://127.0.0.1:43113/` |
| 执行端 Executor | `460154c0-4cec-449a-8075-734d86f7f686` |
| 后端 binding | `aeece16a-0c09-4c73-81c9-ad34954fafb5` |
| Client / Grant | `55063ef9-2f7f-4ae3-8cc3-dcc90bacbf33` / `3d6cbea9-54b2-447b-8c8c-ada627759ee7` |
| 托管范围 | `sample.form-fill@1.0.2`，固定包摘要不变；站点 `http://127.0.0.1:43111`；`allowResult=false` |

设备归属、后端 binding、Provider 的原 Client scope 与 Chrome Executor 已核对一致。不是修改数据库、重复签发 Client 或重新配对所得。「刷新设备」携当前业务账号 JWT 读取 catalog，只返回本账号业务设备；配对成功不会自动登记到所有业务账号。不同账号/电脑/Profile 必须另核归属、安装、配对、托管和精确绑定。

### 一次性准备（本演示设备已完成，无需重复授权）

1. 使用系统 Google Chrome 中已有的 OpenDesk / GrayDove 扩展，打开侧栏「云控」并点刷新图标；应见「已连接」「托管已启用」「目标网站已授权」。保持侧栏打开。
2. 展开「运行环境与历史统计」，核对上表 Provider 与 Executor。展开「连接设置与解除配对」查看可用状态；已有有效配对不填新码、不点解除配对。
3. 在「允许远程调用的任务」找到「示例：网页表单填写 · v1.0.2 · 当前已批准」，展开「查看授权状态与固定版本详情」，核对任务、版本、原安装身份及站点。结果正文保持不回传，不为看状态扩大授权。
4. 维护者已把账号 569 的设备 #1288 精确绑定到此 Executor/Client/Grant。只有新设备缺项时，才经原任务目录安装、原云控配对及批准、维护者原绑定入口逐项处理；刷新不是配对/安装/绑定按钮。本轮未执行这些写入操作。

### 每次完整手测步骤

1. 打开业务入口 [云控表单演示](http://127.0.0.1:38001/public/opendesk-cloud-demo/index.html)，使用演示账号 `test` 登录，账号 ID 仍为 `569`。使用单独提供的演示密码，刷新整页后需重登。
2. 点「刷新设备」，选择/核对 **#1288**。READY 仅为当前固定范围和连接的目录状态，不代表任何请求已完成。找不到时先核页面账号是否一致；再用 [本机查看页](http://127.0.0.1:43121/) 的「设备与云控客户端关联」核对身份，不能以其他账号的 READY 代替。
3. 先复制保留当前 requestKey。若恢复了原请求，设备与姓名锁定是保护行为，先「查询原请求」。真正决定新测试时才点「新建请求」；未确认收尾时切换会要求确认，切换不取消旧请求。
4. 选择 #1288、填写本次唯一姓名（1–40 个 UTF-16 位置）、保存新 requestKey，再点一次「提交一次」。任务在已配对 Chrome 的 owned 页面执行，正常释放会关闭；不保证置前、持续显示或可见打字，不能以没有动画判断未执行。
5. 业务页点「查询原请求」取 Provider 状态并由原 BFF 保存投影，业务页不自动轮询。也可在 [本机只读查看](http://127.0.0.1:43121/) 搜索姓名/原键、点「查看」；可见时每 5 秒查询，查询时间、Provider 结果与数据库快照分别显示。
6. 打开 [原网页效果](http://127.0.0.1:43111/cloud-proof.html)，输入完全相同姓名并点「查询原网页记录」。核对同一原文档的连续 ready/submit/done、一次提交和完成文字；该页不自动查询，也不能单独证明原生回执。
7. 同一原请求/Job 的 **completed + 回执已确认 + released** 仅证明 Provider 结果与收尾；同姓名效果仅证明原网页的被动观察。完整链还须在原 Chrome 可信诊断中将同一 assignment 的原 Run / Result、原生文档与观察文档关联，并逐项取得证据。缺原生关联时仍为 NOT_TESTED，不能据同姓名确认全链成功。accepted 只表示后台接单；assigned、HTTP 成功、设备 READY 都不等于完成。
8. 超时、断线、UNKNOWN、查不到或缺证时保留原键，仅查询；不另建任务重试。刷新后重登同账号会恢复原键，也可「按请求键恢复」或「读取历史 → 查看原请求」。取消登记不等于已停止、回滚或释放。

### 修复生效与验证边界

- **已生效（本机查看页）**：增加实时设备→Executor→Client/Grant→托管范围展示及完整手测步骤；只读 `/v1/client-scope` 使用原服务端私有 Client 和 CA，浏览器不接触凭据。并发刷新曾复现 `E_READ_BUSY`（503）；现在重叠观察共享同轮查询，后续请求仍重新读取，不把历史快照当最新。仅重启本任务本机 43121 查看服务，保留 BFF、Provider、43111 和 dev watcher。
- **仅本地源码，未部署**：本目录 `app.js` / `index.html` 修正原请求锁定时的 READY 误导，区分未新建、空目录和读取失败，明确刷新边界与旧昵称含义；现有 UI 定向测试 20/20 通过。远端处于非默认分支，未擅自覆盖业务页；当前业务入口仍可能显示旧文案。
- **真实原请求复核**：`huigege` requestKey `301d8490-a9d2-4c61-abeb-0333ce118190`，Job `3be28edc-4fef-4e27-9d5f-83db9f2db39e`。本轮通过业务 UI 查询到 completed / 回执 true / released；原 BFF 正常将缓存由 assigned 更新为 completed（保存时间 `2026-11-18 14:59:40.790`），未手改数据库。Provider 原回执时间仍为 `2026-11-18T06:06:42.283Z`。同姓名原文档 `8f010330-87a9-461f-93f2-7823dda23302` 只有一次 submit/done；本轮未重跑。
- **本轮重新登录**：在原业务页面退出后，以同一演示账号重新登录，密码输入已清空；自动恢复上述同一原请求键，设备、姓名和提交按钮保持锁定。「查询原请求」再次显示 completed / 回执 true / released，没有新建请求或任务。
- **NOT_TESTED / 延期**：本轮新的任务提交、可见填表动画、远端文案部署、正式后台菜单/登录、production、全量矩阵、压力及评分。历史真实单次提交证据保留，不能说成本轮新执行。

### 关键链路核对表

以下证据文件均相对仓库根 `.runtime/cloud-ui-20261118-01a1ed6a/`；PASS 指本轮对应操作或原执行结果的复核，不代表本轮重新执行任务。

| 操作 | 预期 | 本轮实际 | 状态 | 证据 |
| --- | --- | --- | --- | --- |
| 同账号重新登录、恢复原请求 | 登录成功，保留原键且不能重提 | 同一 huigege 键恢复，提交仍锁定 | PASS | `business-relogin.txt`、`business-completed.png` |
| 刷新设备、核对客户端关联 | 本账号设备对应真实 Executor 与 Client/Grant | #1288、绑定及固定 1.0.2 范围匹配，连接 READY | PASS | `admin-browser-verified.json`、`device-client-visible.png` |
| Chrome 核对配对、托管及开发连接 | 已配对、已连接、已批准、站点授权，serve 连接正常 | 原配对有效、任务已批准、执行槽空闲；原开发路径与 revision 已核对 | PASS | `chrome-cloud.ax.txt`、`chrome-development.ax.txt`、`chrome-pairing.png` |
| 查询原请求与真实回执 | 同一 Job 完成、回执确认、资源释放 | completed / true / released；原 BFF 正常同步快照 | PASS | `post-status-read.json`、`business-relogin.txt` |
| 查询原网页效果 | 同姓名原文档仅一次提交并完成 | ready/submit/done 连续，提交 1 次，显示「已提交：huigege」 | PASS（原执行复核） | `huigege-web-effect.txt`、`huigege-web-effect.png` |
| 查看页加载、重叠及自动查询 | 无锁超时，显示本次读取结果 | 三个重叠请求均 200；可见页面自动更新 9 次，错误区隐藏 | PASS | `overlapping-reads-fixed.json`、`admin-browser-verified.json` |
| 业务页误导文案修复 | 原请求锁定时不再提示可以提交，目录状态明确 | 本地源码和 20 项定向 UI 检查通过，远端仍为旧页面 | 本地 PASS / 未部署 | `business-ui.patch`、`tests/cloud-control/mac24dev-demo-ui.test.mjs` |
| 新提交、可见打字及 production | 分别取得本轮新执行和正式候选证据 | 保留原执行，不为截图重放；当前阶段未开展 | NOT_TESTED | 以上步骤及验证边界 |

本轮原始证据在忽略目录 `.runtime/cloud-ui-20261118-01a1ed6a/`；查看页源码及本机测试仍由原 `.runtime/cloud-ui-20261118-01a1ecae/admin-view/` 持有。未提交或推送，不影响并行源码。仅本机运行的查看入口不是正式后端功能。

## 历史开发状态（2026-11-06，owner 01a1ad30）

当前系统 Chrome 持续开发包为 `dist/development`，扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`；原生调试页确认 serve 已连接，观察指纹 `9a6427060a0f73117e391d721917feea914b0022113838940b68bb35a0d18fa2`。原 1.0.1 固定任务因内置运行时摘要变化正确拒绝重新批准；没有放宽身份保护。相同源码与权限的独立 1.0.2 已经源码审阅、真实单次试运行、验证、安装和重新批准，目前仅允许状态回传。

新增原生证据：等待输入时停止原请求，原页面没有 input/submit/done，Run `ed89087f-a58c-494c-a8ed-b0c5b675d046` 停止且资源释放；侧栏关闭且未打开 SW DevTools 时，原 Provider 的单次回执响应丢失故障被消耗，Job `15d9f9ba-2e79-4ddd-bb1b-79467330cad9` 只产生一次真实 submit/done。重开侧栏仍关联同一 Run `2b505cf1-9e8b-4b60-90f1-b6067f38f9b9`、Result 和已确认回执，Provider Job 总数保持 6。两条新回执只包含状态与资源释放信息。强制 SW 休眠仍 NOT_TESTED。

源码修复了取消意图对 resolve/bind/permit/renew/reconcile 的围栏、原 Run 缺失时保持未知、效果页的异步代际与输出白名单，并为内置运行时改变提供安全恢复说明。变更行为 44 项、隐私授权 13 项、后台归属和只读界面 49 项定向检查通过。原始证据与分项状态见 `.runtime/cloud-core-20261106-01a1ad30/matrix.json`、`native-observations.json`、`evidence-correlation.json`；原四条业务正向链继续保留为历史证据。

**尚未恢复业务入口，不能宣称整体完成。** 为验证撤权，旧 Client `71001906-40d2-41f6-b16f-ccce47a597de` 已撤销；旧业务提交和结果查询均被拒绝，未新增 Job。当前 BFF 仅接受 1.0.0/1.0.1，恢复需增加已验证 1.0.2 精确 pin，再经原维护入口替换同一绑定。远端后端当前为非默认 `upgrade/cool8-operate` 分支，保持只读，已准备并验证最小补丁，等待本任务分支例外授权；未修改远端源码、数据库或支付。安装/网站撤权的全部原生组合、production、CWS、完整矩阵及评分仍 NOT_TESTED。新增独立 `examples/cloud-control/mac24dev-demo/form-fill.v1.0.2.opendesk-task.json`，未替换历史包；本地 JS/Python 绑定入口的精确版本清单已同步，6 项定向检查确认新版本必须有新 Grant、错哈希/改写源码拒绝且失败不覆盖绑定。远端未执行这些维护动作。证据索引为 `.runtime/cloud-core-20261106-01a1ad30/evidence-index.json`；没有提交或推送。

补充 K2 原生证据：仅停用本轮表单任务后，「我的」运行按钮禁用、云控标记已停用与需重新批准；恢复任务并刷新后仍需新批准，已按原网站和不回传结果正文范围恢复连接，未执行新任务。Provider 停用快照仍保留旧 capabilities，因此不将本次 UI 证据写成 Provider 已删除能力；网站权限撤销保持 NOT_TESTED，未触碰共享 Chrome 权限。

以下为此前观察，当前安装与绑定状态以上文为准。

业务页面是后端同源提供的普通 HTML/CSS/JavaScript，不是可信 Side Panel、Provider 或执行器；不引入 React、SDK、第三方资源或前端构建步骤。本目录另有固定 Task 候选和受信维护脚本，页面不加载维护代码或持有 Provider 凭据。后端与 Provider 复用现有开发服务。

## 当前核心结果（2026-11-06，owner 01a1acfe）

四条真实系统 Chrome 持续开发链已完成：业务页经原 mac24dev BFF、本人设备1288和原 mac4g Provider 执行；固定版本新键重复及同键幂等／冲突；关闭全部 Side Panel 后的新请求由原 offscreen 宿主完成；原有1.0.1投递、源码／差异审阅、单次试运行、原生验证安装、新 Grant、精确 BFF 绑定及真实业务调用。四个业务 Job 都关联原目标 document 的一次 submit/done、原 Run/Result/sourceHash、一次释放和 Provider 回执。

当前已安装并批准 `sample.form-fill@1.0.1`，仅 `http://127.0.0.1:43111` 和必要结果回传。最后业务键 `f9cb597d-e618-4181-911e-5154d618e807`、Job `ad773edc-4ce1-42f0-b0e9-8c31bf38ca3a` 已显示 `completed / receiptConfirmed:true / released`。Executor `460154c0-4cec-449a-8075-734d86f7f686`；新 Grant `ec437ccb-803d-42db-ad05-c583178cdf05`；新 binding `296cf33d-90d2-4d7d-adc1-9f210dfc606e`。旧版本 Grant 没有继承为新版本授权。

本机原始证据索引 `.runtime/cloud-development-20261106-01a1acd5/evidence-index.json`，关联原生只读快照、原 Provider 四个 Job、两版独立观察会话及 `verify-evidence.py` 的关联检查 PASS。源码仅补固定包观察会话及效果页的两版精确 pin 识别，16项定向组件检查通过；未改变冻结包、Authority 或执行链。无后端代码部署、数据库变更、提交或推送。

实际扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`，加载 `/Users/shopme/Documents/workspace/opendesk-browser/dist/development`，真实「调试」显示 serve 已连接，观察到指纹 `7941a451b4a872aafbfb83211943cc26306e3945e26bd5cc0d441044c855bdd8`。收尾只读核对发现 dev writer 已由并行任务更替为35245（43119与原锁一致），本任务未启停它；以上指纹为 UI 上次观察，不能替代新 writer 的最新构建身份。原 Provider 和日常转发保留，本任务临时绑定维护转发已关闭；当前43111为本任务 `page-observation-v101` 会话。临时只读原文档观测器已移除，本任务 DevTools 已关闭。关闭 Side Panel 的验证期间 DevTools 保持 Service Worker 活跃，不能宣称验证了休眠 SW 恢复。production、CWS、跨设备、全矩阵及评分仍 NOT_TESTED。

下文2026-10-30记录均为历史观察，旧 blocked 目标状态不由本次完成自动改写；其中“待安装／未连接／仅1.0.0”等不代表当前状态。后续开始时重查服务和身份，未知结果只查原键，不重放。

## 当前人工 demo（2026-10-30，owner 01a18c80）

接续任务 `01a18c80-2e69-7760-9d09-4e7f1383b805` 已创建无预算完整原版 demo 目标；同一扩展页面策略阻断连续3轮、Provider仍无Executor后，已正式标为 blocked、未完成；旧目标仍 blocked、未完成，交接不改变旧目标生命周期。原服务全部复用，不提交／推送。共享开发恢复已获明确回执，不再等待旧维护或已确认扩展 ID。

本轮真实操作已在独立 Chrome 窗口完成：打开标准页，正常 SidePanel「调试 → 本地开发服务」显示已连接、当前指纹 `ed52e7aea28a`；「我的 → 添加任务 → 浏览任务目录」成功打开，目录为 0 个版本。恢复后的完整客户端 revision 和实际加载路径仍未独立核对。随后浏览器工具对真实任务目录扩展页面明确给出 URL 安全策略拒绝；不换桌面驱动、CDP 或其他控制面绕过。没有导入、验证、安装、配对、Run 或云控 submit 在途，全局输入已释放。

当前需要用户在已打开目录手工导入原包 `examples/tasks/form-fill.v1.opendesk-task.json`，沿原流程验证并安装，再于云控配对同一 Provider、批准原固定任务和需要的结果范围。取得非敏感真实 Executor ID 后继续本文维护绑定和业务页单次提交。新接续原始记录：`.runtime/cloud-mac24dev-20261030-01a18c80/session-status.json`；已有组件证据复用，没有为交接重跑构建或测试。下方旧 owner、桌面占用及目标状态记录均为历史，不替代本段与唯一工作流顶部。

当前只接通原 `sample.form-fill@1.0.0`，不要求执行下方历史1.0.1交付流程。

- 业务入口：`http://127.0.0.1:38001/public/opendesk-cloud-demo/index.html`。
- 独立原网页观察：`http://127.0.0.1:43111/cloud-proof.html`，业务页「原请求状态」中也有链接。原样输入本次任务姓名、明确查询后，显示原文档ID、HTML摘要、逐次submit/done和接收时间。重复提交不会合并；缺号或非ready起点会标为不完整。没有记录不等于未执行，不能据此重发。
- 效果页只投影43111服务**当前观察会话**已写盘的被动事实，不访问Provider，不调用Task，不查询浏览器私有存储；不展示同文档其他姓名内容。查询无自动轮询，姓名不进入URL或存储。它不是原生Run/Result/回执校验器，不能单独判定真实云控成功。
- 本轮重载43111后，旧观察会话原样保留在 `.runtime/cloud-mac24dev-20261030-01a188d9/page-observation/`，前任 owner 的三个会话在 `.runtime/cloud-mac24dev-20261030-01a18bb3/` 下的 `page-observation/`、`page-observation-r2/` 和 `page-observation-root/`。**当前使用 `.runtime/cloud-mac24dev-20261030-01a18c80/page-observation-root-html/`**，为根路径提供普通 HTML 后的新独立会话。完成文字必须独立精确匹配查询姓名（按原页去首尾空白）；残留或不一致文字只标记已隐藏，原始私有记录不改写。不要将旧文档的后续事件拼成新会话；实际任务开始前应由原任务入口打开新文档。若观察服务退出，使用下方命令和**尚不存在**的私有目录恢复；普通Python静态服务器不提供效果查询。

```sh
node tests/cloud-control/passive-form-proof.mjs /absolute/path/to/fresh-private-evidence-directory
```

观察服务默认绑定原 `1.0.0`。观察现有 `1.0.1` 时，在确认原监听已由其 owner 正常释放后，用全新目录启动，并显式选择固定包：

```sh
node tests/cloud-control/passive-form-proof.mjs /absolute/path/to/new-private-evidence-directory \
  --package examples/cloud-control/mac24dev-demo/form-fill.v1.0.1.opendesk-task.json
```

只接受本文两个固定包的精确版本及摘要；新会话将所选身份写入 `session.json`，不重标旧会话或随包文件后续变化改写身份。效果页同时识别这两组精确 pin，混合或未知摘要仍拒绝。会话标签只表示观察基线，不能代替原生目标／文档与 Run／Result 的关联。若 `43111` 被其他服务占用，先协调该 owner，不停止他人服务，也不换端口修改冻结 Task。

当前服务已运行，无需执行启动命令。已实测业务登录、本人设备1288选择、空历史和效果页空查询。最后Provider实读executors=0/jobs=0、设备NOT_CONNECTED，本轮尚无本地Run或云控submit。正常SidePanel tooltip现已确认真实扩展ID为 `ljclbnojkhhgdpoaaggiihlmidgcoihi`，完整客户端revision为 `ed52e7aea28a2bfe5373a16b8f5024b89bb0ddb06b16d0b0824928eb9b3f5d55`，与发布磁盘记录一致；不再要求重给ID。实际Chrome加载路径、Task安装／配对／授权及执行关联ID仍未取得，旧网页SDK重注入与Native功能未验证。正式GOAL实读为blocked、未完成；当前Cookie持有桌面A/B短段，云控在明确交接前不并发输入／Run／Native。

### 一次性人工准备与后续单次提交

1. 复用上方已确认的真实扩展ID、完整revision及开发连接，不重复索取。实际加载路径仍须独立核对是否为 `/Users/mac/Documents/workspace/opendesk-browser/dist/development`；不能由目录／指纹补造。取得明确操作窗口后继续正常SidePanel流程，不用扩展管理页、Workspace或替代控制面绕过既有拒绝。
2. 下载业务页原1.0.0包。现行源码中Controller Task入口仍在「我的 → 添加任务 → 浏览任务目录」，并非「扩展」中的Sidebar应用；导入后应为待验证。按原目录流程，用同源、同源码且released的真实Run核对验证，再设为本地可用并安装确定版本。若确需本地验证，仅明确Run一次，保留原Run/Result，不对未知效果重试。已存在有效验证则复用，不额外运行。
3. 普通固定Task不以Native为前提。只有当前操作确实需要Native且已协调操作窗口时，才运行官方 `opendesk browser setup --extension-id ljclbnojkhhgdpoaaggiihlmidgcoihi`，在扩展明确授权连接，再用 `opendesk browser doctor` 核对；此前doctor仅曾观察到未安装／未连接，不能用扩展ID确认替代Native配对。不要手改allowed_origins。Provider后续生成的Executor ID与此32位扩展ID是两个字段，不能互换。
4. 「云控 → 连接设置与解除配对」填写原Provider地址 `http://127.0.0.1:43112`、本页列出的固定Provider ID和本机私有admin.json中的一次性配对码，勾选「使用本机演示连接」，点击「完成配对」。只批准原1.0.0、原43111站点及所需最小结果回传，不选择其他任务。
5. 保留云控页面显示的真实Executor ID，由维护者运行本文已有 `bind-provider.mjs --executor <真实ID> --login-file <私有登录文件>`。本demo需查看结果及关联身份，明确批准结果回传后追加 `--allow-result`。该脚本另作受限外部Client授权，Token只交服务端；不要在网页或对话中粘贴凭据。当前没有Executor，所以**此步尚未执行**。
6. 业务页登录、选择本人设备、刷新至READY。点击「新建请求」，填写唯一姓名，再只点一次「提交一次」。以后只用「查询原请求」或历史恢复；UNKNOWN、超时或回执缺失都不换键重提。
7. 分别核对状态、原Result、released和回执，保存requestKey/jobId/assignmentId/runId/resultId/receiptId；另开效果页输入同一姓名，核对原文档唯一提交及完成文字。观察文档ID不是Chrome原生documentId，仍需与原执行身份关联。取消登记、Worker停止、资源释放须分别核对，不能用其中一项替代其他项。

首轮三个相关组件文件26项通过；收紧完成文字后，观察查询／页面11项通过，业务页面16项有效组件证据复用，未重复执行。这些不是Chrome任务执行证据。真实取消／幂等保护须在正常demo成功后继续按当前合同完成，不用组件结果冒充。当前完整实况以[唯一联调工作流顶部](../../../docs/framework/workstreams/mac24dev-chrome-integration-20261029-01a1884d.md)为准。

### Root快捷URL的独立接收日志

为Cookie既有 `http://127.0.0.1:43111/#od-account=<alias>` 合同提供辅助网络证据，服务仅对精确 `GET /` 写私有 `root-requests.jsonl`，每行只有 `path:"/"`、服务端 `receivedAt`、递增 `requestSeq`。不保存Cookie、header、query或hash，HEAD和其他路径不计入，不提供日志下载接口。2026-10-30 19:41起，根路径在日志写盘后返回 HTTP200 普通 HTML；页面无脚本、observer、重定向或账号处理，仅含标准测试页链接，保持 no-store。HEAD返回同一文档头和空正文，query路径仍404；demo-form原页面、观察事件和冻结Task不变。此前root404属于旧会话行为。

当前日志路径：`/Users/mac/Documents/workspace/opendesk-browser/.runtime/cloud-mac24dev-20261030-01a18c80/page-observation-root-html/root-requests.jsonl`。当前会话 `ea89e280-f720-48bb-9bcd-e3e43af1c2ad`，激活PID24146。交接基线为1行：`requestSeq:1`、`2026-10-30T11:41:18.505Z` 是维护者明确登记的根GET自检，**不是Cookie导航或额外reload证据**。实际操作前后均只读最新序号对照，不清空或手写；后续探活用HEAD，不拼接旧documents/events。最多4096条，写入失败或上限时返回503，应记EVIDENCE_INCOMPLETE。完整激活回执 `.runtime/cloud-mac24dev-20261030-01a18c80/root-html-activation.json` 保留原目录7文件摘要未变、同源输入摘要及自检基线。

此记录只证明根路径HTTP请求到达，**不直接证明是哪一Tab、SW额外reload或业务成功**。须与Cookie owner独占窗口、实际Tab、首导航／同文档hash起点及无额外人工reload的操作时序关联；无法关联就保留缺证。根文档和原保护的9项定向HTTP检查通过，live根GET实读200／363B，但Chrome能否正常访问及原生ERR_BLOCKED_BY_CLIENT是否解除仍NOT_TESTED。重载只替换本任务43111服务并保留所有旧文件；未访问38001、未占桌面或运行Task，已将明确回执交给Cookie owner01a18c92。云控完整目标仍blocked、未完成。

## 本轮版本交付接线（2026-10-30，尚未原生执行）

已补齐原先写死 `1.0.0` 的后端、页面和绑定维护入口。受信私有配置可选 `taskPin`，只接受原 `1.0.0` 或本目录独立的 [`1.0.1` 待验证包](form-fill.v1.0.1.opendesk-task.json)；省略仍选原版。不是任意程序上传接口，当前 demo 仍为一个选定 Task。原键的投影从保存的 pin 读取，不能随当前目录版本改写；更换绑定后旧请求保留但拒绝借用新身份查询或执行。

新源码 [`form-fill-upgrade.js`](form-fill-upgrade.js) 仅在同一标准页覆盖填写原姓名、提交一次并核对该网页按原规则去除首尾空白后的完成文字；参数原样传入，不改旧包、站点、权限和 Schema。完整 SHA：manifest `8a39edc5ba519869ac5c74132b46830727d3ef8a8c2e4695bb2a0a995e1523c7`，source `9e74a9e089dda18fadc495e9c90b6851ad686eb20b40159d36547d5326c56153`。包生成及组件通过均不等于验证、安装或网页实际执行。

投递继续使用原 CLI（真实 Executor 配对后才执行，不能填假身份）：

```sh
node scripts/cloud-control/cli.mjs program:deliver --directory .local/cloud-control \
  --executor <真实-executor-id> --package examples/cloud-control/mac24dev-demo/form-fill.v1.0.1.opendesk-task.json \
  --key <本次固定投递键>
```

在真实「云控」审阅源码／版本差异、显式试运行、接收候选、核对原 Run 并验证安装，再批准新安装版本的远程范围。只有这些真实完成后，维护者才选择新包绑定：

```sh
node examples/cloud-control/mac24dev-demo/bind-provider.mjs --executor <真实-executor-id> \
  --login-file /Users/mac/Documents/workspace/opendesk-browser/.runtime/integration-20261030-01a18893/demo-login.private.json \
  --package examples/cloud-control/mac24dev-demo/form-fill.v1.0.1.opendesk-task.json \
  --replace-binding <当前精确-binding-id>
```

首次绑定省略 `--replace-binding`；替换必须给出当前 bindingId，不能默认覆盖。新版本需要新 Grant／Client；脚本在私有锁下复核身份、保留0600旧配置备份后原子替换。其他设备仍使用旧版时拒绝全局切换，不能静默改它们的 Task。结果正文仍需已获批准的双层许可，按需显式 `--allow-result`；未调用本命令前不会切换当前版本或授权。

当前后端已加载本轮云控 service，父闭包为最终支付 runtime，231文件中仅该 service 变化，其他文件 SHA 未变。当前私有配置仍选 `1.0.0`、设备1288未连接、历史空，没有新 Job／Run／Result／回执；**固定版本接线已完成，以上真实交付链和业务执行链仍 NOT_TESTED**。最新证据／owner 见 [本轮工作流](../../../docs/framework/workstreams/cloud-mac24dev-20261030-01a18b96.md)。

可直接打开的演示入口：`http://127.0.0.1:38001/public/opendesk-cloud-demo/index.html`，页面和固定包已部署到现有后端。已通过业务 API 注册专用 demo 账号 `userId:569` 与设备 `deviceId:1288`；注册不等于 Browser 已安装任务、配对或批准托管，是否可提交仍以目录返回的 `READY` 为准。

## 当前运行与启动

当前后端、HTTP 转发、测试页、Provider 和 Browser dev watcher 已运行，直接打开入口即可。日常 Chrome 继续加载 `/Users/mac/Documents/workspace/opendesk-browser/dist/development`，不要重装或换目录。若它们退出，只恢复退出的服务；操作前核对监听和 owner，不能重复启动 watcher。

- 数据库与数据库持久隧道：按 `/Users/mac/Documents/Codex/2026-10-29/mac24dev-cool8-db-cutover/outputs/RUNBOOK.md`，本机 Docker 保持运行；不恢复旧快照。
- 后端：SSH `mac24dev`，进入 `/Users/a0000/Documents/workspace-old/todo-admin-midway-cool8-operate`，使用 Node22 的 `npm run upgrade:start`；活服务直接复用。最新第二次认证owner恢复通知为 `runtime-admin-login-20261030101345939-29485b`／PID54921，231文件，三认证JS修复且其余228含pay／cloud保留；原owner的 `backend-auth-v2-app-compatibility.json` 已验证app登录／本人设备／固定pin／空历史。操作前重新实核实际进程和runtime，后续必须保留此最新父闭包，不回8055、未激活的0938或旧cloud闭包；全部旧runtime保留。
- HTTP 转发退出后：`ssh -fNT -o ExitOnForwardFailure=yes -L 127.0.0.1:38001:127.0.0.1:38001 mac24dev`。
- Provider 使用原 `.local/cloud-control` 身份与状态，管理/Chrome loopback 为43112、受限后端 TLS 为43113；服务启动命令见下方维护说明，不使用另一个目录重建身份。
- 测试页及效果观察服务退出后：Browser 仓库执行本页顶部的 `passive-form-proof.mjs` 命令并选全新私有证据目录；不要与已有43111服务并行启动。Watcher 退出后才执行 `npm run dev`。

登录用户名和密码保留在本机0600私有文件 `/Users/mac/Documents/workspace/opendesk-browser/.runtime/integration-20261030-01a18893/demo-login.private.json`。只在本机查看并用于该页面登录；不要复制进静态文件、日志或提交。页面登录与现有后端账号兼容，可改用自己的合法账号及其设备，但维护者必须对该账号的真实设备另作精确绑定。

## 使用流程

1. 本目录三个静态文件和固定包现已由后端同源提供；使用上述入口。不要以 `file://` 或另外的静态服务打开页面。
2. 用业务账号登录。密码提交后立即清空输入框，JWT 仅在页面内存；刷新或退出后重新登录。HTTP 401 或业务 `code:401` 会清除登录态。
3. 按页面说明下载、审阅并安装固定任务，在当前 Chrome 的真实扩展工作台安装并手动配对与授权；这些设置仍待实际完成。执行设备的标准测试页为 `http://127.0.0.1:43111/demo-form.html`。
4. 选择设备；只有目录报告 `READY`，且 Provider、任务名称/版本、manifestHash、sourceHash 与完整固定参数 Schema 都与本演示一致时可提交。对象字段顺序不影响匹配。`NOT_CONNECTED`、`NOT_AUTHORIZED`、`UNKNOWN` 分别显示，不能用在线代替授权。
5. 点击「新建请求」，填写 1–40 字符姓名，再点击「提交一次」。页面不会自动轮询、自动重试或重复提交。每次点击新建才生成新 UUID，登录和刷新不会生成。
6. 查询原请求，分别核对原始 `state`、`receiptConfirmed`、`retirementState`、取消登记、执行身份与结果。`completed`/`finished` 不自动代表回执或资源释放；`UNKNOWN` 保留原键查询。
7. 刷新后，同账号登录会恢复原请求键；也可输入 UUID 或读取历史并点击「查看原请求」。恢复只调用状态查询。未确认收尾的请求切换到新键/其他键前需内联确认，旧请求仍可从历史恢复。
8. 「请求取消」仅在查到原请求后可用，需内联确认；登记成功不等于已停止或已释放，也不会回滚网页操作。丢失响应后显示 UNKNOWN 并查询原键，不自动重发取消。

姓名按原 Task/后端的 JavaScript UTF-16 长度校验 1–40，普通汉字通常占一个位置，大部分表情占两个；不裁剪空格或重写输入。原1.0.0冻结包与源码未更改。

查询状态和取消时会先隐藏上次结果，查询失败保持 UNKNOWN 及原请求键；读取历史失败不继续显示旧列表。业务登录失效时退出页面账号，云控授权/设备归属/绑定失效则隐藏旧结果与历史、关闭提交，不把重新登录说成可以恢复设备授权。刷新目录明确报告设备授权失效或原设备消失时也隐藏旧结果。

错误只将后端文档内的精确代码翻译为本地中文说明：原请求不存在时核对原键/历史；绑定变化时联系维护者核对原绑定；任务范围不符时核对扩展端授权；连接响应未知时保留原键查询。服务端任意错误正文不显示；查不到记录或未知结果均不代表未执行。

仅本地存储项 `opendesk.mac24dev-demo.request.v1.<userId>` 保存当前 UUID 字符串，不保存 JWT、密码、姓名、结果或 Provider 凭据。存储失败会阻止提交，但仍可查询原键与历史；清除站点数据后可从账号历史或手工原键恢复。查询其他键得到有效投影后才更新本地键，查不到不会覆盖已保存原键。已发送/恢复的请求锁定姓名和设备，不允许通过改名静默复用原键。后端负责同键同数据幂等，页面不提供重提按钮；提交响应丢失也按未知结果查询。只有终态、回执确认且 `retirementState:released` 同时成立才免去切换警示，缺字段仍保守确认。

## 同源 API 合同

所有成功响应为 `{code:1000,data:...}`。除登录外，使用 `Authorization: <原始 JWT>`，不添加 `Bearer`。请求禁用重定向和缓存，不附带 Cookie；服务端错误正文不会显示。网络内容通过 `textContent`/DOM 节点渲染，不使用 `innerHTML`；详情只展示请求投影字段，并遮蔽常见凭据字段和 JWT。后端仍必须保证业务投影及 `result/message` 不含任何 Provider 密钥、账号密码或其他秘密。

| 方法与路径 | 请求 | data |
| --- | --- | --- |
| `POST /app/user/login/loginSimple` | `{username,password}` | `{token}` |
| `GET /app/user/info/person` | 无 body | `{id,username,nickName}` |
| `POST /app/operate/cloudcontrol/catalog` | `{}` | `{task:{taskId,version,title,manifestHash,sourceHash,paramsSchema},devices:[{id,nickname,readiness,message}],providerId}` |
| `POST /app/operate/cloudcontrol/submit` | `{requestKey:UUID,deviceId:number,taskId:'sample.form-fill',version:目录选定版本,params:{name}}` | 请求投影 |
| `POST /app/operate/cloudcontrol/status` | `{requestKey}` | 请求投影 |
| `POST /app/operate/cloudcontrol/cancel` | `{requestKey}` | 请求投影 |
| `POST /app/operate/cloudcontrol/history` | `{}` | 请求投影数组 |

请求投影：`{requestKey,deviceId,taskId,version,jobId:null|UUID,state,receiptConfirmed,retirementState?,assignmentId?,trace?:{runId,resultId,receiptId},result?,cancelRequested,message?,createdAt}`。页面保留原始状态名，辅助说明区分未连接、未授权、进行中、完成、取消和 UNKNOWN；未识别的新状态保守视为 UNKNOWN，不推测成功。

Provider 必须为 `9c4f182d-7a5f-403d-9b4d-c2144ef35e5b`，执行设备使用 `http://127.0.0.1:43112`。业务后端必须由维护者用既有私有脚本绑定同一 Provider；不把维护者/Provider Token 或私有脚本输出放进本页，不新增 Token 输入框。页面固定下载链接为 `/public/opendesk-cloud-demo/form-fill.v1.opendesk-task.json`，已逐字节复制并提供，未在此目录重复创建包。

## 维护者绑定与官方 Native 配对

只有真实 Browser 已安装该任务、连接上述同一 Provider 并完成 Cloud 托管授权后，维护者才使用真实 executor ID 执行本目录提供的命令：

```sh
node examples/cloud-control/mac24dev-demo/bind-provider.mjs --executor <real-executor-id> --login-file /Users/mac/Documents/workspace/opendesk-browser/.runtime/integration-20261030-01a18893/demo-login.private.json
```

已明确批准结果回传时可追加 `--allow-result`。真实 client token 仅由维护者脚本通过 SSH stdin 送达服务端，不进入页面、静态文件、URL 或页面输入框。私有登录文件只供维护者脚本读取，不打印内容、不复制到公开目录。该命令先实际登录、核对本人设备和真实配对，再签发固定 Task Client 并原子写入服务端0600配置；同设备重复绑定拒绝，失败会尝试撤销新 Client。不能用它代替 Browser 的安装/授权。

## 开发服务维护说明

只有原服务确已退出时，在 Browser 仓库启动原 Provider：

```sh
node scripts/cloud-control/cli.mjs provider --directory .local/cloud-control --port 43112 \
  --public-port 43113 \
  --tls-key .local/cloud-control/mac24dev-demo-key.pem \
  --tls-cert .local/cloud-control/mac24dev-demo-cert.pem
```

后端到 Provider 的单独反向转发退出后恢复：

```sh
ssh -fNT -o ExitOnForwardFailure=yes -R 127.0.0.1:43113:127.0.0.1:43113 mac24dev
```

不要更换证书绕过错误；服务端只信任固定私有 CA。证书为30天开发证书，过期需由维护者审查更新证书与服务端CA，不关闭TLS验证。网络守卫仅在显式 demo 配置存在且 Provider ID/URL 匹配时允许该端口；其余外网和监听限制不变。

在 Chrome 本体已加载的情况下，打开真实 OpenDesk 右侧工作台，核对实际32位扩展ID、固定加载路径和 dev client已连接。在原「我的」任务目录导入下载的 Task 包，按原流程完成安装审阅／网站权限和必要验证；不要将 Controller Task 导入为 Sidebar Tool。验证时明确 Run 一次并保存 Run/Result，不能自动重试未知结果。此固定 Task 流程本身不要求 Native；仅当前选择的本地项目／Native 操作实际需要时，才使用官方 `opendesk browser setup --extension-id <真实ID>`、扩展「授权并连接 OpenDesk」及 `browser doctor`，不得手改 manifest 或猜ID。

云控 Tab 配对URL `http://127.0.0.1:43112`，Provider ID见页面；一次性配对码只在本机私有 `.local/cloud-control/admin.json` 查看，不放进本页或日志。批准这一固定 Task、站点范围及所需的最小结果回传。当前源码已有固定 Offscreen 复用原 RunHost；本轮关闭 Side Panel 续跑仍 NOT_TESTED，不能以源码替代证据。刷新状态不等于领取任务。取得真实 Executor ID后再运行上方绑定命令，回页面「刷新设备」；显示READY后「新建请求」→填写name→「提交一次」。主 demo 尚未提交，勿为测试连通性提前发送。

## 历史证据与准确缺口

本节保留此前 owner 的组件数字与 Chrome 原记录；本轮固定版本接线及当前后端状态以上方新增章节和工作流为准，不能把历史「后端未修改」解释为本轮未部署。

2026-10-30 本次源码修复的定向入口：`node --test tests/cloud-control/mac24dev-demo-ui.test.mjs`。测试执行真实 HTML 与事件代码，覆盖固定摘要/Schema、参数长度、错误提示、结果失效、原键恢复、单次提交、取消未知和退出后的迟到响应；HTTP 与存储使用组件夹具，**不代表 Provider/Chrome Worker 真执行**。后端服务与 Provider 本次未修改，已有有效定向证据继续复用。 本次13项组件测试通过；更新后当前Chrome实测登录、本人设备选择、缺失原键的明确提示与取消禁用，退出重登后未把诊断键恢复成执行请求。静态HTTP与本地两文件逐字节一致；证据在 `.runtime/integration-20261030-01a188c1/`。

真实当前后端 HTTP 已验证：密码登录、只返回本人设备1288、未配对状态NOT_CONNECTED、未配对提交/未登录/非法name/未授权Task拒绝、本人历史为空。人工页面及固定包HTTP200。首轮Chrome登录交互超时保留为历史；本轮在当前系统Chrome真实点击登录成功、选择本人设备1288并查询空历史。页面明确NOT_CONNECTED且「提交一次」不可用，没有生成requestKey或派发任务。原始DOM与截图在 `.runtime/integration-20261030-01a18893/demo-chrome-authenticated.ax.txt` / `.png`；这不等于Task执行成功。

后端定向组件22项及两入口TypeScript检查通过；Provider HTTPS/客户端归属/结果隐私与原键恢复两个定向文件通过。以上都是组件或HTTP证据。新元数据表显式迁移，禁止自动schema同步；原键异内容冲突、单次提交、UNKNOWN只读恢复和取消意图与释放区分有组件验证。

**仍未完成**：当前Chrome真实扩展ID/加载路径/dev连接、Task安装/授权、真实Executor绑定及主demo一次执行。Native doctor仅在所选操作实际依赖Native时另检，不是固定Task的前置要求。Provider executors=0/jobs=0，元数据表0行。requestKey/jobId/assignmentId/runId/resultId/receiptId均未产生；没有网页被Task填写的证据，资源释放/原Result/回执也未验证。必须完成这些真实步骤后才能称全链完成。

未知或超时只查询原键。owned 网页会在正常退休时关闭，提交前须准备现有43111被动观察及合法只读原生 target/tab/document 关联；收到回执后核对已持久的原网页 name、每次 submit／done 序列及效果，再对应原Run/Result、retirementState:released和Provider receipt。不能重开同URL替代原文档，缺证记 INCONCLUSIVE；不延迟释放、不重跑原请求、不直接改数据库/IDB或另行填表制造成功。production、发布、全量验收和评分均未执行。
