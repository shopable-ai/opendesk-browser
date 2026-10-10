# 安装一次授权与运行静默校验 R3.1

状态：**本轮已支持的 Page DOM／Task page.automation 授权复用已实施并取得真实 Chrome 定向 PASS。** 程序私有特权桥和未测原生异常项仍明确开放，不代表整体框架 F3／ZIP 安装验收完成。最终原生候选：`6d1ab8ff33fe306cb0127b688cb70a002b4a7141`。工作流：`r31-eceef8694f0a`。日期：2026-10-10。

## 提交与资源

- 启动基线：`d98232ee97edcb32547a485ad0cdf13848086630`。全程只在 main 工作，单一仓库写入者；独立审计只读。不创建分支或 worktree，不强推或重置。
- 主要授权实现：[a88919c](https://github.com/shopable-ai/opendesk-browser/commit/a88919c7bd0389bea847d5c00d9e2cf861089835)、[13e02a6](https://github.com/shopable-ai/opendesk-browser/commit/13e02a689e2a3db77ff444e75e7a41d595fb1f93)。
- 原生驱动和回归收敛：[789fa3a](https://github.com/shopable-ai/opendesk-browser/commit/789fa3a35aaa1c7b287f6b47261d21c54a62dcc5)。[992f117](https://github.com/shopable-ai/opendesk-browser/commit/992f11732657171d9691d99a6b114106c0b7782f) 的首次完整成功原件继续保留。本轮固定验收候选为 [6d1ab8f](https://github.com/shopable-ai/opendesk-browser/commit/6d1ab8ff33fe306cb0127b688cb70a002b4a7141)，包含 [7fa53d1](https://github.com/shopable-ai/opendesk-browser/commit/7fa53d15c17fa5a57e9aaa38569888cc8837655b) 的原生注销等待／有界清理和真实可见控件等待；不重试业务点击。
- 通过正常 merge 保留并行 R15／SDK／Native 文档及 `92ddeeb` 的普通脚本默认全部 HTTP(S) 范围。冲突仅在重叠测试预期，保留双方的全站正例、窄授权拒绝负例和真实生命周期检查。
- 最终集成保留并行 `bd76b2d` 工作流 AI、`1f312b7` Native 文件工作区及 `8a50fa0` 测试修正。共享 Host／Native 分流和固定 Schema 解码器经定向只读复核，未向 Page／Task 安装能力接入新特权；用新包的新原生回执验证，未直接沿用旧包 PASS。
- 本地目录：`/workspace/scratch/eceef8694f0a/opendesk-browser`。本任务的本地 dist／日志独占；实际 Chrome 由独立 macOS CI 使用完整 CFT 155.0.8059.39 .app、0700 profile、系统分配 loopback HTTP／CDP 端口。
- 最终原生进程 PID `1988 → 2247`，profile 设备号 `16777228`、inode `3525888` 不变。两进程均 exit 0，profile 已删除、残留为空；资源状态 **released**。

## 为什么之前反复申请

运行按钮把“检查已有 Chrome 权限”和“发起新授权”混在一起：普通 Controller、本地项目、Page Preview、Verify／Enable 等路径会直接调用 `permissions.request`。即使 Chrome 已批准，仍每次走申请逻辑。网站整体状态还混入 Cookie／通知等能力，不能代表本次执行所需网站权限。

Chrome 的扩展级权限和程序安装授权原来没有完整的持久身份／代次绑定。仅移除 UI 中的 request 不足以保护停用、撤销、卸载重装、Worker 恢复与迟到回复，因此本轮同时补齐原有安装记录及 Authority 的执行点检查。

## 已完成的入口与安全行为

1. 普通 Controller Run、本地项目 Run、Task Run、Page Preview、Page Verify／Enable 和工具页测试网页创建只静默检查所需 Chrome 权限。缺权即停止，不能自动申请或续跑。
2. Page／Task Install 预读缺失条目；只有可信安装或恢复点击可以同步申请确实缺少的 Chrome 权限。已满足及同范围升级均零 request。扩权在原面板显示新增网站、取消的排除范围或执行环境变化，再由用户确认。
3. Page 授权保存在原 `page-installed-v1` 行：installationId、generation、status、scope、approvedAt。停启、撤销、恢复及升级轮换 bootstrap token／代次。实际 native sender、固定源码和依赖锁、文档、marker、当前安装授权在派发及结果交付时复查。
4. Task 授权保存在原 `task-installed-v1` 行，现有 RunAuthority 绑定其 installationId／generation。Run／Install／Toggle／Uninstall 的 UI 快照和服务事务均防卸载重装 ABA；运行中操作、旧回复及迟到 finish 不能继承更新后的授权。
5. Chrome `onRemoved` 在任何数据库 await 前同步阻断派发，随后持久暂停。实际 contains=false 或 User Scripts 不可用但无移除事件时也暂停；权限重新出现不自动复活旧安装。未知副作用继续保留，不盲目重放。
6. 五个主页签共用条件显示的“访问受限／恢复全部网站访问”，复用既有 site-access 状态和处理器；Page 管理面板保留本程序的“恢复访问”。恢复会重读同一安装身份，不能启用已被用户停用或替换的程序。
7. 保留 `92ddeeb` 的新默认：普通 JS／无 @match 导入为 `*://*/*`，顶层、默认 document_idle。安装前明确显示全 HTTP(S) 范围及程序能力边界；旧显式规则和已安装窄范围保持冻结，默认值不会替换旧授权。

沿用现有 frameworkKV／commandJournal、Authority／Broker、RunHost、USER_SCRIPT 和 ChromePage／Locator，没有第二套权限数据库或执行器，没有扩大 Manifest 或增加 debugger。普通 JS 不依赖 `@grant none`；旧 GM 元数据仅作兼容输入。独立网页 SDK 的文档授权保持单独边界。

## 安装后怎样使用

在 Chrome 中完成扩展安装，并按需要一次开启“允许用户脚本”。在原开发面板试运行普通 JavaScript，保存固定 Page 版本，核对源码和网站范围，验证后点“安装自动运行”。已存在 Chrome 权限时安装不会再次申请。

此后进入匹配网页自动运行；普通 Controller／本地／Task 使用原 Run 按钮。内部新建 RunAuthority 只是绑定当次执行，不再要求用户授权。缺权时先点独立恢复入口，再自行运行或进入下一个匹配文档；恢复和安装本身不重放当前网页。升级同范围固定版本不重复申请 Chrome 权限，扩权则显示差异并要求明确安装确认。

## 本轮固定候选 6d 的验证与原始证据

[完整证据索引](../evidence/install-once-permissions-r31-final/manifest.json)、[最终原生回执](../evidence/install-once-permissions-r31-final/integration-acceptance.json)、[最终权限观察](../evidence/install-once-permissions-r31-final/integration-permission-observations.json)、[CI 原始状态](../evidence/install-once-permissions-r31-final/ci-workflows.json)。原始 artifact ZIP 按下载字节原样入库，含所有文档快照、事件、截图、launcher／cleanup 与构建输入回执；不是重新生成的 PASS。

| 验证 | 最终事实 | 原始 CI |
| --- | --- | --- |
| 授权定向组件 | 235/235 PASS，0 skip；包括 20 次普通 Controller／Task／Page Preview、20 文档 Installed Page、撤销／恢复／升级／跨程序／竞态；本地项目另有定向覆盖 | [235 项及原生 lane](https://github.com/shopable-ai/opendesk-browser/actions/runs/38044176147) |
| 完整 environment Node 回归 | 721 total，714 pass，0 fail，0 cancelled，7 skip；不与定向集合相加 | [job 114190246945](https://github.com/shopable-ai/opendesk-browser/actions/runs/38044176170/job/114190246945) |
| check、生产／开发构建、verify、pack | PASS。生产 SW 326336 bytes，保持原 327680 bytes 上限；未通过调大预算逃避检查 | [双构建与包合同](https://github.com/shopable-ai/opendesk-browser/actions/runs/38044176139) |
| 网站与 Sidebar 回归 | PASS | [网站权限](https://github.com/shopable-ai/opendesk-browser/actions/runs/38044176204)、[Sidebar](https://github.com/shopable-ai/opendesk-browser/actions/runs/38044176152) |
| Native Page 来源及授权边界 | PASS；7fa→6d 只改可见控件等待及无关测试，不改此授权组件输入 | [专门回归](https://github.com/shopable-ai/opendesk-browser/actions/runs/38043920267) |
| SDK 授权／撤销 | 7fa 专门回归 PASS；至 6d 该合同及相关执行输入未改 | [SDK 原始回归](https://github.com/shopable-ai/opendesk-browser/actions/runs/38043920286) |

最终 production packageHash：`ef73b016a93ac49ba90ee153c0eb6162fe8b9eeacf6d73b7bc11f1689b511a5f`。

最终 development／真实加载包 packageHash：`9e8c25d3da3e2ae643007f8a234b3522ff65214e1025908169e1e149428bc79a`。191 项 sourceInputs、4 项 driver／lifecycle 输入逐字节匹配固定 Git 提交；构建中输入漂移为空。独立复核实际开发 ZIP 的 47 个文件和生产 ZIP 的 32 个文件，原生完整 package report 与实际开发包字节一致。CI 已生成并校验两种 ZIP，但本轮未进行 ZIP 在 Chrome 中的安装验收。

### 真实 Chrome 的已完成结果

- 通过真实 Side Panel 输入保存、验证、安装两个源码保持原样的普通 JS 程序；安装 UI 在可信点击前显示 `*://*/*` 和能力边界。两个 installationId 独立，B 明确停用。
- 连续 20 个不同文档自动运行 A，各一次；B 执行 0，`permissions.request = 0`。
- Worker 实际 stopped／target absent／running，新 executionContext uniqueId 和 observer；安装批准及 20 条旧回执不变，第 21 个新文档成功。
- 完整关闭 Chrome 后，同 profile／同启动参数、新 PID、新 browserSessionIncarnation；A 实际重新注册、B 仍未注册，21 条旧回执不变。第 22 个新文档成功，两个浏览器进程累计 request 仍为 0。
- 观察器透传真实 permissions.request，不替换授权结果、不写安装记录、不通过业务 RPC 代替用户安装；4 个观察上下文、51 个检查点无观察错误。启动前尚未附加观察器的区间保留 NOT_OBSERVED。
- 原始 [CI 38044176147](https://github.com/shopable-ai/opendesk-browser/actions/runs/38044176147)、[artifact 11667456213](https://github.com/shopable-ai/opendesk-browser/actions/runs/38044176147/artifacts/11667456213)。43 原件 ZIP SHA-256：`c109ac3da2746c9fa5938605719480644682869d3bf2085bc47dcc5aeddd0ad1`。

### 保留的历史结果与失败

| 原候选／运行 | 原始结果与后续处理 |
| --- | --- |
| 本地 `050fff1` → `0094cf9`，集成 main 至 `a8f1c08` | 原 230/230、check、build:dev PASS；packageHash `7652a34d70af194f88150377db6c9f90f428a4ca57119461622da3cefae8a832`。原 [证据目录](../evidence/install-once-permissions-r31-local/manifest.json)不改写。 |
| `a88919c`，[38040506574](https://github.com/shopable-ai/opendesk-browser/actions/runs/38040506574) | 安装及 20 文档 PASS，驱动错误要求 Worker targetId 必须变化导致整轮 FAIL。后续以实际 executionContext 与原生生命周期证明重启，保留原 FAIL。 |
| `13e02a6`，[38041934574](https://github.com/shopable-ai/opendesk-browser/actions/runs/38041934574) | 20 文档和 Worker／第 21 文档 PASS；整浏览器恢复只等待持久 registered，实际注册存在性断言失败，整轮 FAIL。后续等待当前 Chrome 实际注册。原生范围是旧单站，不冒充新全站候选。 |
| `789fa3a`，[38042604310](https://github.com/shopable-ai/opendesk-browser/actions/runs/38042604310) | 初次 Worker target 早于权限 API 初始化，业务文档为 0，FAIL；清理曾报目录非空，原 FAIL 一并保留。992 等待真实 API 就绪后才观测，最终清理通过。 |
| `992f117`，[38042717294](https://github.com/shopable-ai/opendesk-browser/actions/runs/38042717294) | 原 4 场景／22 文档／0 request 与两种重启 PASS；原 627 total／620 pass／7 skip、233 定向和 96 分审计保留。此包开发指纹 f7791357…，不与新包混用。 |
| `bd76b2d`，[38043201702](https://github.com/shopable-ai/opendesk-browser/actions/runs/38043201702) | 业务文档 0；仅观察到持久 disabled 就检查 Chrome 注册，异步注销未完成，FAIL；清理 ENOTEMPTY 的 FAIL 同样保留。精确延迟注销组件证明窗口内旧／当前禁用 token 均拒绝，源码读取／执行／回执均 0；驱动改为等待实际注销完成。 |
| `7fa53d1`，[38043920288](https://github.com/shopable-ai/opendesk-browser/actions/runs/38043920288) | 第一个侧栏控件尚未可见，原生输入 0、业务文档 0，FAIL；清理独立 PASS。6d 增加只读布局等待后发送一次可信点击，不重复业务操作。全 environment 另有 712 pass／0 fail／1 cancelled／7 skip 的原始失败，不将 fail=0 当整轮成功。 |
| 本地 13e 扩展定向与环境尝试 | 262/262、check、双构建 PASS。完整环境尝试保留 595 pass／20 fail／7 skip 原日志：旧 fixture／包状态问题后续修复，IPC 本地权限受限；最终 hosted CI 的 620 pass／0 fail／7 skip 是独立的新记录。 |

历史日志与源绑定构建回执保存在 [local-and-ci-regressions.zip](../evidence/install-once-permissions-r31-final/local-and-ci-regressions.zip)、[集成前日志](../evidence/install-once-permissions-r31-final/integration-prior-regressions.zip)及[最终集成日志](../evidence/install-once-permissions-r31-final/integration-regressions.zip)。共享清理新增 16/16 故障自测；仅对 ENOTEMPTY 最多 5 次、总退避 0.75 秒，每次重验原 Popen／0700 inode，失败保留目录和原始错误。最终真实 Chrome 一次删除成功；不宣称观察过原生 ENOTEMPTY 恢复。R13.1／Locator 的未变功能按原输入及原等级复用，不把旧包 PASS 升格为新包全量 F3。分支清理工作流不计入功能回归或评分。

## 独立审计与质量

[安全审计](../evidence/install-once-permissions-r31-final/security-audit.md)、[992 原独立评分](../evidence/install-once-permissions-r31-final/quality-audit.md)保持冻结；[最终集成独立质量附录](../evidence/install-once-permissions-r31-final/integration-quality-audit.md)及[同源原生／实际包字节复核](../evidence/install-once-permissions-r31-final/integration-independent-verification.md)另行绑定 6d 候选。历史复现的高优先级授权问题均关闭，审查范围内未发现开放 P1／P2；未实现能力和未执行原生异常项继续列明。最终独立评分为 **96/100**（功能 25/25、安全 35/35、回归 20/20、原生 16/20），只覆盖已支持的 R3.1 授权复用，不代表产品完成百分比或整体 F3。

### 验收后的测试清理修正

收尾仅对 `development-lock.test.mjs` 修正两处测试时序：先安装 SIGTERM 处理器再报告 LOCKED；finally 只等待仍存活且确已创建的子进程。定向测试 1/1 PASS，受控延迟就绪实验也通过。原 7fa 取消记录保留；实验只证明测试存在该窗口，不断言它是原次取消的唯一原因。`4bedc004` 归档自身只补这两处测试和文档／证据，未修改开发锁实现、构建输入、权限实现或原生驱动。该阶段与 6d 的 191 个构建输入和 4 个原生输入一致；下面的后续 main 集成不适用旧包输入一致声明。

### 固定验收后保留的并行 main 更新

提交最终材料前，已正常合并 `da5ef2a` 的开发热更新、`39c9d35`／`7d7a856` 的 Controller axiosx 精确网络 Origin，以及 `7f87dc2` 的 Native 测试更新。Page／Task 安装授权、权限 gate、Page 管理与本站点恢复代码未改；新增 Controller 草稿范围仍静默检查 Chrome 权限，并拒绝安装 Task 继承额外 networkOrigins。它不是 Page／Task 私有 HTTP 能力。未覆盖、回退或重新实现并行功能。

这些改动改变了 Controller 和实际构建输入。**本页的 22 文档／双重启／包指纹与 96 分严格属于固定候选 6d，不代表后续 main 自动继承原生验收或评分。** `7d7a856928c8a32a59f6540a2ad287107b5c595a` 自身的[双包 CI](https://github.com/shopable-ai/opendesk-browser/actions/runs/38044678557)、[Native Page 边界](https://github.com/shopable-ai/opendesk-browser/actions/runs/38044678590)、[网站权限](https://github.com/shopable-ai/opendesk-browser/actions/runs/38044678507)、[该候选独立的原生任务](https://github.com/shopable-ai/opendesk-browser/actions/runs/38044678535)与[全环境任务](https://github.com/shopable-ai/opendesk-browser/actions/runs/38044678460)均通过。上述自动测试未覆盖下述新发现的附加 Origin 撤权负例，不能用绿色 CI 否定具体复现。收尾不重新触发已通过的 6d 原生任务。

## 当前能力与仍开放的原生验收

- Installed Page v1：顶层、document_idle、USER_SCRIPT 隔离 DOM，`page.dom`；Installed Task v1：`page.automation` 和固定 siteOrigins。两者的宿主 networkOrigins 均为空。
- 程序私有特权跨站 HTTP、浏览器 Cookie、宿主存储和 Native Messaging 授权桥未实现。这里拒绝宿主特权继承，不表示阻止 DOM 程序访问获准网页本身可访问的数据或网络。
- 独立网页 SDK 和工作流仍各用原有授权合同，不宣称整个产品所有入口都零 request；不靠给整个网页安装 SDK 替代程序授权。
- Native `run.start` 直接传已安装 `task:` saved source 尚缺安装快照，安全拒绝。本轮不改 Native 协议，不自动采用“最新安装”补身份。
- Page 停用不回滚既有网页效果，也不承诺立即清除任意监听器／计时器；刷新旧文档可清除。未知结果持续保留，不能在恢复时自动重放。
- 原生 NOT_TESTED：站点撤销／拒绝／主动恢复完整循环、User Scripts 关闭恢复异常排列、同范围升级及扩权 UI、Controller／本地项目各 20 次原生循环、恶意跨程序 RPC／旧回执／多标签竞态。相应组件证据不升级为这些原生场景 PASS。
- 原观察器附加前 startup 区间为 NOT_OBSERVED；完整框架 F3／最终 ZIP 安装仍由原合同单独验收。

后续复用须核对源码及传递依赖、manifest／构建输入、测试／fixture／观察器和真实 packageHash。只改本工作流文档不重跑产品；相关权限、默认范围或执行链发生变化时只补受影响项，保留原始 FAIL／NOT_TESTED。

### 并行 Controller 撤权补丁：组件及构建 PASS

2026-10-10，工作流 `r31-eceef8694f0a`。独立复现确认 `7d7a8569` 新增附加 Origin 后，权限移除的持久筛选和旧结果交付仍只看源站。已仅在现有 Controller Authority 中统一源站及固定网络范围的静默检查，补齐旧响应、操作 pre/post 和 snapshot；明确缺权及撤销事件都复用原持久停止／abort／结果交付拒绝。恢复 Chrome 权限不能复活旧 run；原结果、回执及未知副作用事实保留。

本地定向 **88/88 PASS，0 fail／cancelled／skip**，包括事件前 contains=false 的四个入口、持久写尚未完成的同步事件窗口、在途 HTTP 取消、重复 finish、跨 Worker 撤销恢复，以及正常导航和旧 epoch 的历史结果。检查 **268 文件 PASS**；`npm run build:dev` PASS，开发 packageHash `b1e8b8e3d5f2ce978c833bed74a5a8705f4649814b3bafba431fc2b7eef70f2c`，193 个源输入、构建漂移为空。生产构建 PASS，SW **327663 bytes**，原预算 **327680 bytes** 未改；生产 packageHash `0edece9bc98bc10e7f626fe3dc77c123ef850943ca704d97f736853345c671dc`。该生产回执在合并无关 R16 诊断脚本前生成，192 个源输入，不冒充后续候选的完整输入清单。归档期间正常合并 R16 文档和诊断工具，没有覆盖其他任务代码。

[独立安全附录](../evidence/install-once-permissions-r31-final/controller-network-security-addendum.md)对最终源码再次动态复核，确认该具体 P2 已关闭，限定范围内无剩余 P1/P2；没有重新评分或将旧 96 分移植给新包。[原始补丁回归档案](../evidence/install-once-permissions-r31-final/controller-network-revocation-regressions.zip)保留修复前复现、修复后独立脚本／输出、源文件哈希、完整日志和构建回执。首次测试中未知请求实际返回 `E_EFFECT_UNKNOWN`，已将该特例断言改为准确的现有合同；没有改变 runtime 以放行重放。生产构建曾超预算 63 bytes，通过复用原 `permissionPattern` 消除重复代码后通过；原 FAIL 保留。本地旧 PID 锁通过现有 acquire/release API 确认无活跃原主后正常释放，未删锁、杀他人进程或绕过守卫。

本地 dist 验证结束，资源 **released**；本轮未占用本地浏览器、profile 或端口。新增 Controller 跨站 Origin 的真实 Chrome 撤权交互及在途 HTTP 取消仍为 **NOT_TESTED**。本次 main 提交由既有 CI 按新的提交身份运行，其原生安装复用场景也不能代替这些未新增的负例。

### 最后 main 合并与源绑定复核

发布前正常合并 `5267ffcd` 的固定 Worker 资源哈希、catalog 校验及开发指纹。唯一冲突为双方同时补附加 Origin 的持久撤销匹配：保留统一 `runOrigins`，源站和全部 networkOrigins 都参与判断，双方新增测试完整保留。独立只读复核确认这些并行变更未给 Page／Task／SDK 新增权限。

合并后定向 **104/104 PASS，0 fail／cancelled／skip**。共享生产 SW 曾超原预算 264 bytes，随后只复用相同错误说明并缩短 Controller 诊断文本；机器逐字节等价核对证明权限条件、错误码和控制流程未变，独立撤权脚本再次 PASS。生产构建 **327607 < 327680 bytes**，packageHash `904132dc12a829fa8690dc5df59dfd21b5eaae1c4ae1c5b91a757817b0a0b472`，193 个输入匹配本地固定提交 `ebe1cc9aa181db481a23d464342efcb3aa7541f7`、漂移为空。[新合并原始档案](../evidence/install-once-permissions-r31-final/controller-network-merge-verification.zip)保留合并日志、预算失败、实际构建回执、独立续记及诊断等价证明。前述 88 项／旧包回执保持原身份，本节没有转移 6d 原生或 96 分。新 main 提交的 CI 以随后记录的实际 SHA 和链接为准。

## 已发布 eeb3af02：原生与实际双包完整绑定

授权代码及上述历史证据已发布到 main 的 `eeb3af02ca79eb63d6251195f326f977a7ab5b1d`。该固定提交的 [R3.1 原始 CI](https://github.com/shopable-ai/opendesk-browser/actions/runs/38045996123) **248/248**，`npm run check` **269 文件**、`npm run build:dev` 均通过；[完整环境 CI](https://github.com/shopable-ai/opendesk-browser/actions/runs/38045996010) **728 项，721 PASS、7 skip、0 fail/cancelled**。计数是实际回归结果，不是功能完成比例。

[本版原生独立核验](../evidence/install-once-permissions-r31-final/published-native-independent-verification.md)重新核对原件、193 个构建输入及 4 个驱动输入：20 次不同文档自动运行，加上两次重启后的新文档，共 **22 个唯一文档／回执，51 个检查点零 permissions.request**。4 个权限观察器对应 3 个不同 Worker 原生 context 与 1 个工具页；禁用程序 B 没有执行。Chrome PID **24881→25197**，profile device/inode **16777227/3592551** 不变，旧回执不变、新文档使用新 session，两个进程正常退出、清理一次成功。[原始 Chrome ZIP](../evidence/install-once-permissions-r31-final/native-eeb3af02.zip)保持原始字节。

[双包 CI](https://github.com/shopable-ai/opendesk-browser/actions/runs/38045996052) 及[实际 ZIP 独立核验](../evidence/install-once-permissions-r31-final/published-package-independent-verification.md)确认开发 47、生产 32 个实际文件全部匹配构建报告，ZIP digest 匹配 pack 收据；原生开发包与实际开发 ZIP 完全一致。开发 packageHash `0054113f15c3015829fa31ccdecd1ee01b50d6f1766b5a91e96d2a9d2e8ae5c1`，生产 `a5b44721edd8d842627d029b2dfa72c1630b264bc216a26bf4219c8e2fea4159`。[双包 artifact 原件](../evidence/install-once-permissions-r31-final/packages-eeb3af02.zip)完整保存，不把 ZIP 字节检查当成 ZIP 安装验收。

[重新独立评分](../evidence/install-once-permissions-r31-final/published-quality-audit.md)为 **95/100**：功能 25、安全 35、回归 19、原生 16；限 eeb 的 R3.1 支持范围，无未关闭具体 P1/P2。没有沿用 6d 的 96 分。保留 1 分的交付缺口：eeb 的 [Controller HTML 原始 lane](https://github.com/shopable-ai/opendesk-browser/actions/runs/38045996104) 因旧 Webpack fixture 缺少新 builtin 清单而失败。并行 `4d2fb2a4` 已补齐真实资源、许可证和真实字节清单，本会话复用该修复；[对应 Chrome job](https://github.com/shopable-ai/opendesk-browser/actions/runs/38046278244/job/114196361732) **7 场景 PASS**，但该 workflow 另一个生产构建 job 因随后 jQuery 功能超包预算失败，不能把整个 workflow 写为绿。两阶段原始日志均在[发布验证档案](../evidence/install-once-permissions-r31-final/published-main-regressions.zip)。

## 后续兼容补丁：旧库环境回执不能自动复用

并行 jQuery opt-in 功能使旧版仅作注释处理的 `@opendesk-lib jquery` 产生新执行环境。为满足 R3.1 的旧回执及环境变化边界，只有可信编译器已核实的固定 jQuery SHA 才进入预览／执行回执；安装 Authority 在原身份及完整 receiptHash 检查后，再检查此可选环境证明。UI 请求字段和脚本返回值都不能提供该证明，普通未声明 jQuery 的旧回执保持兼容。

旧回执缺字段或哈希不符时，Install、Enable、Verify、Available 和自动运行安全拒绝。reconcile／boot 沿用原授权记录持久暂停、轮换 token 和 generation。**载入脚本→保存新版本→Verify→Install** 可恢复；同范围继续复用 installationId、approvedAt 与 Chrome 权限，保留旧回执，不自动重放旧文档。[独立安全复核](../evidence/install-once-permissions-r31-final/environment-receipt-security-audit.md)确认该错误只能由可信内部检查产生，不能利用用户异常撤销其他安装。新库实际 DOM 初始化／环境升级仍为原生 NOT_TESTED，相关替身测试明确属于组件证据。

本地 `c650a3c1` 的专项 **38/38 PASS**；合并后的完整相关定向 **254/254 PASS，0 fail/cancelled/skip**，check **270 文件**。生产曾因并行 jQuery 增长和环境检查超原预算；仅在现有 Page 安装与 Controller 模块复用相同表名／tag／错误码常量，机器规范化 AST 完全一致，未改错误值、判断条件或执行顺序。`35608e38` 的生产构建 **327050 < 327680 bytes**，开发 **327216 bytes**；两份 193 输入回执与该本地提交逐字节一致、漂移为空，保留原 FAIL。后续正常合并并行撤回无效 minifier 选项及其 Native/SDK 测试，不修改这些模块；新发布提交的实际 CI 与包身份另行登记，不能直接沿用本地旧构建哈希或 eeb 的评分。
