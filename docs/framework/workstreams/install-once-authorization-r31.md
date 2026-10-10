# 安装一次授权与运行静默校验 R3.1

状态：**本轮已支持的 Page DOM／Task page.automation 授权复用已实施并取得真实 Chrome 定向 PASS。** 程序私有特权桥和未测原生异常项仍明确开放，不代表整体框架 F3／ZIP 安装验收完成。工作流：`r31-eceef8694f0a`。日期：2026-10-10。

## 提交与资源

- 启动基线：`d98232ee97edcb32547a485ad0cdf13848086630`。全程只在 main 工作，单一仓库写入者；独立审计只读。不创建分支或 worktree，不强推或重置。
- 主要授权实现：[a88919c](https://github.com/shopable-ai/opendesk-browser/commit/a88919c7bd0389bea847d5c00d9e2cf861089835)、[13e02a6](https://github.com/shopable-ai/opendesk-browser/commit/13e02a689e2a3db77ff444e75e7a41d595fb1f93)。
- 原生驱动和回归收敛：[789fa3a](https://github.com/shopable-ai/opendesk-browser/commit/789fa3a35aaa1c7b287f6b47261d21c54a62dcc5)。最终真实验收固定在 [992f117](https://github.com/shopable-ai/opendesk-browser/commit/992f11732657171d9691d99a6b114106c0b7782f)，包含另一会话的真实 Worker API 就绪等待。
- 通过正常 merge 保留并行 R15／SDK／Native 文档及 `92ddeeb` 的普通脚本默认全部 HTTP(S) 范围。冲突仅在重叠测试预期，保留双方的全站正例、窄授权拒绝负例和真实生命周期检查。
- 本地目录：`/workspace/scratch/eceef8694f0a/opendesk-browser`。本任务的本地 dist／日志独占；实际 Chrome 由独立 macOS CI 使用完整 CFT 155.0.8059.39 .app、0700 profile、系统分配 loopback HTTP／CDP 端口。
- 最终原生进程 PID `4393 → 4666`，profile 设备号 `16777228`、inode `3531772` 不变。两进程均 exit 0，profile 已删除、残留为空；资源状态 **released**。

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

## 最终验证与原始证据

[完整证据索引](../evidence/install-once-permissions-r31-final/manifest.json)、[原生回执](../evidence/install-once-permissions-r31-final/acceptance.json)、[权限观察](../evidence/install-once-permissions-r31-final/permission-observations.json)、[CI 原始状态](../evidence/install-once-permissions-r31-final/ci-workflows.json)。原始 artifact ZIP 按下载字节原样入库，含所有文档快照、事件、截图、launcher／cleanup 与构建输入回执；不是重新生成的 PASS。

| 验证 | 最终事实 | 原始 CI |
| --- | --- | --- |
| 授权定向组件 | 233/233 PASS，0 skip；包括 20 次普通 Controller／Task／Page Preview、20 文档 Installed Page、撤销／恢复／升级／跨程序／竞态；本地项目另有定向覆盖 | [233 项及原生 lane](https://github.com/shopable-ai/opendesk-browser/actions/runs/38042717294) |
| 完整 environment Node 回归 | 627 total，620 pass，0 fail，7 skip；不与定向集合相加 | [job 114186007722](https://github.com/shopable-ai/opendesk-browser/actions/runs/38042717333/job/114186007722) |
| check、生产／开发构建、verify、pack | PASS。生产 SW 327199 bytes，保持原 327680 bytes 上限；未通过调大预算逃避检查 | [双构建与包合同](https://github.com/shopable-ai/opendesk-browser/actions/runs/38042717315) |
| 网站与 Sidebar 回归 | PASS | [网站权限](https://github.com/shopable-ai/opendesk-browser/actions/runs/38042717310)、[Sidebar](https://github.com/shopable-ai/opendesk-browser/actions/runs/38042717338) |
| Native Page 来源及授权边界 | PASS；789→992 只改原生观察等待，不改此组件输入 | [专门回归](https://github.com/shopable-ai/opendesk-browser/actions/runs/38042604290) |
| SDK 授权／撤销 | 13e 相关源码／测试输入未被后续默认规则与 driver 改动触及，按该范围复用 | [SDK 原始回归](https://github.com/shopable-ai/opendesk-browser/actions/runs/38041934496) |

最终 production packageHash：`3d97f5294b66456b32c35002636f98fbff040a4620c37653bf014fb94989520c`。

最终 development／真实加载包 packageHash：`f7791357fce94f7d96870eb4a6c74d805de35433642cc00baf5fcd52429e6aa4`。构建回执列出全部 sourceInputs、bundleModules、输出文件；构建中输入漂移为空。CI 已生成并校验两种 ZIP，但本轮未进行 ZIP 在 Chrome 中的安装验收。

### 真实 Chrome 的已完成结果

- 通过真实 Side Panel 输入保存、验证、安装两个源码保持原样的普通 JS 程序；安装 UI 在可信点击前显示 `*://*/*` 和能力边界。两个 installationId 独立，B 明确停用。
- 连续 20 个不同文档自动运行 A，各一次；B 执行 0，`permissions.request = 0`。
- Worker 实际 stopped／target absent／running，新 executionContext uniqueId 和 observer；安装批准及 20 条旧回执不变，第 21 个新文档成功。
- 完整关闭 Chrome 后，同 profile／同启动参数、新 PID、新 browserSessionIncarnation；A 实际重新注册、B 仍未注册，21 条旧回执不变。第 22 个新文档成功，两个浏览器进程累计 request 仍为 0。
- 观察器透传真实 permissions.request，不替换授权结果、不写安装记录、不通过业务 RPC 代替用户安装；4 个观察上下文、51 个检查点无观察错误。启动前尚未附加观察器的区间保留 NOT_OBSERVED。
- 原始 [CI 38042717294](https://github.com/shopable-ai/opendesk-browser/actions/runs/38042717294)、[artifact 11665844192](https://github.com/shopable-ai/opendesk-browser/actions/runs/38042717294/artifacts/11665844192)。ZIP SHA-256：`e3eba2fee811ffd8aadc0b7cd9e5c55146270e7e9df6ce81360614fc3d24b47d`。

### 保留的历史结果与失败

| 原候选／运行 | 原始结果与后续处理 |
| --- | --- |
| 本地 `050fff1` → `0094cf9`，集成 main 至 `a8f1c08` | 原 230/230、check、build:dev PASS；packageHash `7652a34d70af194f88150377db6c9f90f428a4ca57119461622da3cefae8a832`。原 [证据目录](../evidence/install-once-permissions-r31-local/manifest.json)不改写。 |
| `a88919c`，[38040506574](https://github.com/shopable-ai/opendesk-browser/actions/runs/38040506574) | 安装及 20 文档 PASS，驱动错误要求 Worker targetId 必须变化导致整轮 FAIL。后续以实际 executionContext 与原生生命周期证明重启，保留原 FAIL。 |
| `13e02a6`，[38041934574](https://github.com/shopable-ai/opendesk-browser/actions/runs/38041934574) | 20 文档和 Worker／第 21 文档 PASS；整浏览器恢复只等待持久 registered，实际注册存在性断言失败，整轮 FAIL。后续等待当前 Chrome 实际注册。原生范围是旧单站，不冒充新全站候选。 |
| `789fa3a`，[38042604310](https://github.com/shopable-ai/opendesk-browser/actions/runs/38042604310) | 初次 Worker target 早于权限 API 初始化，业务文档为 0，FAIL；清理曾报目录非空，原 FAIL 一并保留。992 等待真实 API 就绪后才观测，最终清理通过。 |
| 本地 13e 扩展定向与环境尝试 | 262/262、check、双构建 PASS。完整环境尝试保留 595 pass／20 fail／7 skip 原日志：旧 fixture／包状态问题后续修复，IPC 本地权限受限；最终 hosted CI 的 620 pass／0 fail／7 skip 是独立的新记录。 |

历史日志与源绑定构建回执保存在 [local-and-ci-regressions.zip](../evidence/install-once-permissions-r31-final/local-and-ci-regressions.zip)。R13.1／Locator 的未变功能按原输入及原等级复用，不把旧包 PASS 升格为新包全量 F3。分支清理工作流不计入功能回归或评分。

## 独立审计与质量

[安全审计](../evidence/install-once-permissions-r31-final/security-audit.md)、[独立质量与原生证据复核](../evidence/install-once-permissions-r31-final/quality-audit.md)分开记录源码／组件和真实浏览器证明。历史实际复现的高优先级问题均关闭，审查范围内未发现开放 P1／P2；未实现能力和未执行原生异常项继续列明。独立质量评分为 **96/100**（功能 25/25、安全 35/35、回归 20/20、原生 16/20），严格绑定 992f117 的已支持范围，不由测试数量推导产品完成百分比，后续新包不得自动继承此分数。

## 当前能力与仍开放的原生验收

- Installed Page v1：顶层、document_idle、USER_SCRIPT 隔离 DOM，`page.dom`；Installed Task v1：`page.automation` 和固定 siteOrigins。两者的宿主 networkOrigins 均为空。
- 程序私有特权跨站 HTTP、浏览器 Cookie、宿主存储和 Native Messaging 授权桥未实现。这里拒绝宿主特权继承，不表示阻止 DOM 程序访问获准网页本身可访问的数据或网络。
- 独立网页 SDK 和工作流仍各用原有授权合同，不宣称整个产品所有入口都零 request；不靠给整个网页安装 SDK 替代程序授权。
- Native `run.start` 直接传已安装 `task:` saved source 尚缺安装快照，安全拒绝。本轮不改 Native 协议，不自动采用“最新安装”补身份。
- Page 停用不回滚既有网页效果，也不承诺立即清除任意监听器／计时器；刷新旧文档可清除。未知结果持续保留，不能在恢复时自动重放。
- 原生 NOT_TESTED：站点撤销／拒绝／主动恢复完整循环、User Scripts 关闭恢复异常排列、同范围升级及扩权 UI、Controller／本地项目各 20 次原生循环、恶意跨程序 RPC／旧回执／多标签竞态。相应组件证据不升级为这些原生场景 PASS。
- 原观察器附加前 startup 区间为 NOT_OBSERVED；完整框架 F3／最终 ZIP 安装仍由原合同单独验收。

后续复用须核对源码及传递依赖、manifest／构建输入、测试／fixture／观察器和真实 packageHash。只改本工作流文档不重跑产品；相关权限、默认范围或执行链发生变化时只补受影响项，保留原始 FAIL／NOT_TESTED。
