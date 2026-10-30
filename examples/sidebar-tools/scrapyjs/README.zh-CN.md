# scrapyJs 采集应用

## R1.7 当前状态与亲手测试（2026-10-30）

**“实现完成”不等于“普通用户全流程验通”。** 当前源码与唯一正式 App 包均为 **1.7.0**，固定 Controller Task 为 **0.4.0**；已完成实现和本地 Python/Host 联调，真实 Chrome 中的 **AI → 本机试采 → 明确确认长任务 → 重开侧栏 → Stop → 下载落盘** 仍为 `NOT_TESTED`。后文 1.3.1–1.6.0 的版本、安装和验收描述属于此前阶段，不能覆盖本节。当前实现、包身份和已有证据见 [R1.7 说明](R1.7-LOCAL-RUNNER.zh-CN.md) 与 [验证记录](evidence/r17-verification.json)。

**用户最新要求：由 Codex 先自行完成真实测试，全部关键条件成立后，才交付经过验证的使用方式。** 下方六步仅是待验证草稿，不要求用户代跑，也不以说明已保存或环境准备完成作为可用交付。宽度/主题/原生 200% 缩放、睡眠恢复、production 与正式评分继续延期。原浏览器采集入口和 Task 的三个 Origin 保留；本地 Fixture 不扩入原 Controller 授权。

### 当前目标与关键测试条件（唯一当前入口）

目标正文：**在真实安装态 OpenDesk 上自行跑通并保存同候选 ScrapyJS R1.7 核心全链证据，修复实际阻塞并针对性回归，全部关键条件成立后再向用户交付经过验证的使用方式。**

当前唯一 owner 为接续任务 `01a18bd5-be11-7ff2-8d91-e73c88d4e3e8`，原生 Goal 创建时为 `active`，用户要求新任务接续前最新实读为 `paused`；完整八项条件保留且未完成。源任务 `01a18b95-f00c-7fe2-a79e-aa13bf5593cc` 的 blocked Goal 保留，未迁移或伪报完成。已从同 Profile 独立普通 Chrome 窗口的正常工具栏进入侧栏，并完成 ScrapyJS 1.7.0 原链审阅安装。共享开发服务已恢复，真实侧栏已核对新候选；桌面输入暂归 Cookie owner，Python 服务已独立准备。全部八项成立前不得标记 complete 或声称“确保正常 / 可直接使用”。逐项状态与原始证据索引统一记录在 [验证记录的 currentCoreAcceptance](evidence/r17-verification.json)，不另建验收体系。

| 关键操作 | 必须取得的真实证据 | 当前状态 |
| --- | --- | --- |
| 真实入口、同 ID 更新 | 实际扩展身份/加载路径/serve 连接及构建、包指纹；同 ID App 更新后旧配置保留，使用当前真实 Host | IN_PROGRESS：1.7.0 原链首次安装及包 SHA 一致；真实 ID、连接和完整 ed52 revision 已从正常 tooltip 核实。加载路径及旧配置升级仍未核实 |
| 单一 AI 入口 | 安装态 React 经真实 ai.generate、原可信 Provider 与发送审阅返回有效声明式配置；保存实际接收方和请求身份 | NOT_TESTED |
| 三页试采与黄金 | 真实 Python 访问三页恰好六条，id/title/price 全字段与下表一致，F 价格为空串；完整度正确，错误与 worker 退出明确 | NOT_TESTED：已有 Python 集成黄金证据不等于安装态链通过 |
| 试采认证与 full | 试采前 full 不可启动；输入或配置变化使认证失效；明确确认的 full 精确绑定原 previewRunId/configHash/config/scope，不再次 AI 改写或静默重放 | NOT_TESTED：现有 Client/Host 证据仅复用其原验证等级 |
| 活跃任务重开 | full 活跃时真正关闭并重开侧栏，后台继续、恢复同 runId，不创建第二任务 | NOT_TESTED |
| Stop 原任务 | 至少采一页后 Stop，确认原 PID 退出、workerExited，且无后续采集请求；自然完成或停止受理不算通过 | NOT_TESTED_IN_CHROME |
| 下载落盘与读回 | CSV 和 JSONL 经真实 Chrome 保存到磁盘，独立全字段读回与同 run 一致；请求受理不算落盘 | NOT_TESTED |
| 受影响的安全保护 | 针对实际改动核对 Origin、安装身份、权限、撤权及未知回执不重放；保留原浏览器采集主链 | 未变的本地集成证据复用；真实安装及运行链 NOT_TESTED |

当前下一条操作是桌面输入交回后，打开已安装 App 的 AI 入口并经可信 Host 配对。正常「调试→本地开发服务」tooltip 已实际显示扩展 ID `ljclbnojkhhgdpoaaggiihlmidgcoihi` 与完整 revision `ed52e7aea28a2bfe5373a16b8f5024b89bb0ddb06b16d0b0824928eb9b3f5d55`，与共享 owner 的新磁盘回执一致；旧 1d 证据仅保留历史。唯一 watcher 为 PID 27680，仍写原 `dist/development`。Python PID 38045 已手动监听 43231，health 返回 1.7.0 / Scrapling 0.5；私有配对文件已生成但尚未交可信 Host，未创建真实采集 run。共享环境 owner 为 `01a18b96-4e45-7971-b993-28d6dde17f60`。实际加载路径未直接核实；扩展管理页与 Workspace 的既有安全拒绝继续有效，不使用 CLI、配置读取或 CDP 绕过。

### 开始前由 Codex 准备

复用现有根开发 watcher 与 `dist/development`，由其恢复 owner 确认产物就绪，再核对实际 Chrome 的加载路径、扩展 ID、开发连接和指纹。沿「扩展」原安装审阅入口更新同 ID 的 App，保留旧配置。Python 使用本工具已有私有 `.venv`，由 Codex 按 [启动合同](local-runner/README.md) 手动启动一次，并用已核实扩展 Origin 和精确 Fixture Origin 配对；不要求普通用户猜 ID、输入命令或处理源码包。

本轮已启动独立 Fixture `http://127.0.0.1:43233/page-1.html`（50 页，每页延迟 1 秒），真实 Chrome 已打开首页；前三页 HTTP 输入逐字段核对为下面六条。这只是**演示输入可用**，不是采集结果。进程归本接续任务管理，当前启动记录与输入检查在本机忽略目录 `artifacts/scrapyjs/r17-manual-demo/`。原 43234 网页为**纯模拟 UI**，不用于证明真实 AI 或采集。

当前真实安装已完成：原审阅显示 `scrapyjs` 1.7.0 与规范包 SHA-256 `cb0de984ebbab77dc63c2d48715011752c472e218bf2f91842683526c5c82b45`，安装成功提示已保存。安装前列表未见 ScrapyJS，本次不能宣称旧配置升级已通过。截图在 `artifacts/scrapyjs/r17-manual-demo/`；正常 tooltip 已核实 ID 和完整当前候选。**六步核心链尚未验通**：Python 已就绪，安装态 AI/Host 配对/采集/Stop/下载尚未执行。

### 六步操作草稿（待 Codex 自测，尚未验通）

1. **打开真实应用。** 在 Chrome 打开演示首页，再从 OpenDesk 侧栏「扩展」打开「scrapyjs 采集」。应看到已安装的 1.7.0，旧配置仍在；点「✧ AI 配置」后应进入「AI 采集工作台」，有「试采页数」和「AI 生成并试采」。不要使用「开发」的只读预览替代安装态。
2. **填写这次要采什么。** 目标 URL 填 `http://127.0.0.1:43233/page-1.html`，粘贴下方演示需求。勾选「目标网址与页面标题（必选）」；这次不需要发送旧配置，可取消「发送当前完整配置」。试采页数保留「3 页（默认）」。应看到实际 Provider、模型和接收地址；此时长任务按钮仍不可用。
3. **审阅后生成并试采。** 点「AI 生成并试采」，在原可信发送审阅中核对接收方与资料后确认。首次本机配对仍使用可信 Host 的文件选择器，由 Codex 协助选择为本次服务准备的文件；不要把凭证贴进应用或 AI。应依次看到真实 AI 返回、试采正在运行、采集完成，访问 3 页、6 条记录、worker 已确认退出；有错误时保留原输入和错误，先修正，不重复点击启动。
4. **逐字段核对，再启动。** 展开六条「完整 JSON」，对照下表；应只有 `id/title/price`，`id/title` 完整度 100%，`price` 为 5/6 非空，最后价格为空串，错误为 0。可先导出这次试采的 JSONL/CSV 留存黄金对照。点「核对试采，准备长任务」，勾选核对确认，再点「确认并开始长任务」。应出现新的长任务 run，配置/hash/目标及 previewRunId 仍绑定刚才的试采；这一步不需要再次让 AI 改写规则。不要先点「应用为配置草稿」或修改输入，它们会使当前试采认证失效。
5. **重开并停止同一次任务。** 趁仍在运行，立即关闭侧栏，再打开该应用的 AI 工作台；需要时点「查询原 run」。应恢复刚才的同一个长任务 runId，页数继续增长，不能新建第二任务。至少采完一页后点「Stop · 停止原 run」，等到「已停止」且「worker 已确认退出」，记录数不再增加。演示配置最多 50 页，若重开前已经自然完成，只记录自然完成，不能把它算作 Stop 通过；未知回执只查询原 run，不换 ID 自动重跑。
6. **下载并打开文件。** 点「导出 JSONL」和「导出 CSV」，完成 Chrome 的保存操作，再实际打开两个文件。应包含该 run 截至导出时的全部已采记录，字段和值相符，空价格仍为空；第 4 步导出的试采应恰好是下面六条。只有真的落盘、读回核对，才记下载通过；“已请求导出”不是落盘证明。

演示需求（可直接复制，无私人网页内容）：

```text
只采集 http://127.0.0.1:43233/page-1.html 及同源下一页的公开测试数据。
列表为 #books 的直接 li 子元素。每条只要三个字段：id 读取当前 li 的 data-id 属性；title 读取 h2 的文本；price 读取 .price 的文本，缺失时保留空字符串，不删记录。
下一页链接为 a.next，最多采集 50 页，以 id 去重。只用静态 CSS 声明式配置，不添加详情、processing、validation 或 fieldRequirements。
先试采 3 页，核对结果后再由我确认长任务。
```

| id | title | price |
| --- | --- | --- |
| A | 浏览器工具 | `19.50` |
| B | 本地任务 | `25.00` |
| C | 声明式采集 | `30.00` |
| D | 持久结果 | `0.00` |
| E | 精确分页 | `42.25` |
| F | 停止与恢复 | `""`（空字符串） |

这里的“核心 Demo 完成”要求六步在同一真实安装态实际走完，并保存同次 Provider/配置/preview/full 身份、重开/退出和下载读回证据。Fixture HTTP 检查、模拟 React 预览、包晋升或旧 Task 的 Chrome 通过记录各自保留范围，不代替这条链。

## 中长期产品规划（2026-10-30）

以下文件保存本轮 AI 爬虫、代理与商业化讨论中的**长期目标与设计决策**。它们均为 **PLANNED / NOT_IMPLEMENTED**，不改变上方真实采集、安装态及候选验收状态：

- [产品目标与分阶段路线图](docs/PRODUCT-ROADMAP.zh-CN.md)：当前基础、差距、P0/P1/P2、1–3 页 AI 试采及后续验收。
- [AI 引擎、代理与云运行技术架构](docs/AI-ENGINE-PROXY-ARCHITECTURE.zh-CN.md)：Scrapling、Crawl4AI、Apify 等执行适配与安全边界。
- [商业模式、竞品与上下游服务](docs/COMMERCIALIZATION-COMPETITORS.zh-CN.md)：模板复用、定制开发、维护、代理与收费路径。

**当前不创建新 Runtime、云服务、付费功能或扩展权限；后续按最新 main 实际完成状态增量实施。**


## 本轮最新范围（2026-10-29）

当前源码 1.6.0：本轮目标是改进 React 结果排版，完成真实 AI 配置助手及独立专家 95+ 评审。旧文中 AI 排除/95 延期仅描述历史阶段，以本节与 INTERACTIONS 最新决策为准。正式包仍保留 1.3.1，未晋升；本轮只准备开发候选并走原审阅安装。

用户本轮已明确采用并行升级的固定 Task 0.4.0，身份以 `tool.config.json` 与对应 Task 包为准；下文 0.3.0 的安装/运行结果仅保留历史证据，不代表当前候选通过。引擎升级由并行 owner 维护，本轮验证 AI/UI 与新固定 Task 的实际衔接。

结果区提供两行摘要、完整记录详情/复制、列设置和分页，JSON 保留全部原值；CSV 保留全部记录与字段，对可能被电子表格执行的字符串增加安全前缀。AI 入口在应用右上角：描述需求 → 选择当前网页/原配置/可选 HTML 样本 → 核对真实 Provider 和发送资料 → 生成草稿 → 查看差异与完整 JSON → 应用 → 原命名保存或导出配置 → 单独「开始采集」。生成不是网页采集验证，不自动运行，也不扩大固定 Task 的三个 origin。

本轮原生与独立评审证据将绑定当前候选；实现中的状态不能提前写为已通过。正式包晋升/production、完整生命周期、全量宿主、宽度/缩放和压力专项继续延期。

## 此前 1.5.0 核心采集证据（历史）

此前阶段为 **真实扩展持续开发与线上核心采集验证**。当时源码版本 1.5.0，唯一正式 App 包仍为 1.3.1；不因源码版本号认为已晋升或安装。此前 1.4.0 原生证据作为历史保留。完整原浏览器 SDK 保持原样；来源 `scrapyJs` / `scrapyJsChrome` 仓库只读。

## 当前目标与关键测试条件（2026-10-29）

**核心目标：用户能在真实 OpenDesk 侧栏中编辑并保存采集配置，完成豆瓣及可访问的 CSDN 当前页采集，查看正确表格，下载完整结果，并安全停止运行。** 当前 React 源码的可见更新、配置持久化和草稿保护一并取得真实操作证据。

当前接续对话 `01a1880c-2137-7d53-974f-2d85d04090af` 已取得下列七项核心条件的真实证据，开发核心目标已达成。此前对话 `01a186cc-38d5-7592-a41c-089eb98f2d9e` 的 Goal 上次实读仍为 `blocked`，其状态没有被跨对话改写；当时的脚本权限阻塞已在接续对话经用户当次明确授权解除。OpenDesk 启动、Native 连接、目录接入和浏览器控制仍只属于前置子任务。

用户入口固定为工具栏打开 Side Panel →「开发 → 本地项目 → scrapyjs → 在侧栏调试」；不直接导航扩展 URL。开发快照与安装态候选分别记录身份及权限，不以 Mock、历史报告、静态快照或编译成功代替真实操作。

| 关键操作 | 通过条件 | 尚缺的证据 |
| --- | --- | --- |
| 进入真实侧栏与开发更新 | 显示当前源码；核对扩展路径/ID、服务连接和应用快照；可逆 JSX/CSS 修改及还原均在侧栏可见 | PASS：真实本地侧栏显示，JSX/CSS 同会话自动更新及逐字节还原 |
| 配置与编辑 | 命名配置保存后关闭重开仍在；字段修改应用正确且无关规则保留；开发数据不写正式命名空间 | PASS：安装态保存、重开、字段保留；本地调试记录与安装区隔离 |
| 草稿保护 | 无效 JSON、未应用字段/分页草稿跨页签保留；取消切换仍保留原选择及草稿；保存/运行不会悄悄采用旧值 | 安装态 1.5.0 真实侧栏操作 PASS |
| 同源码 App 与固定 Task | 原安装审阅；Task 同源码成功试运行、核对证据后设为本地可用并安装 | PASS：App 1.5.0；Task 0.3.0 同源码 demo completed/资源释放，走原核对→本地可用→安装链 |
| 豆瓣与 CSDN 主链 | `originalSites[2]` / `[3]` 当前页；独立页面内容与记录及表格相符；原运行完成并退休 | PASS：豆瓣 20 条、11 字段，CSDN 9 条、7 字段；两次均 completed/released；条数为本次观察 |
| 下载 | CSV 与完整 JSON 实际落盘并读回，逐值对应同一次结果；不截断、不以下载请求受理代替落盘 | PASS：两站 JSON/CSV 均在 Downloads 落盘；全部记录与字段逐值相符，已保留原件摘要 |
| 运行与 Stop | 运行期间不能改写配置，结果属于启动配置；Stop 作用原请求，区分受理和退休；未知回执禁止重复开始 | PASS：运行控件锁定；切配置清旧结果；原请求 Stop 受理，原 runId/resultId stopped/released |

完成判断以本表的真实用户行为为准。每项记录 `PASS / FAIL / BLOCKED / NOT_TESTED` 及对应源码、快照或候选身份；站点访问限制单独记载，不能填成采集通过。复用仍有效的历史证据，只补当前 React 界面及本次实际受影响行为的验证。连接恢复、测试数量或候选构建成功不替代这些条件。

本地调试的存储/网页读取可直接验证；Task 和下载继续使用原安装审阅链批准的同源码开发候选及固定 Task 0.3.0。该权限边界不因侧栏入口改变。此前核心完成后曾延期 95+；本轮用户已恢复真实 AI 与独立 95+ 评审。正式包晋升、production、完整生命周期、全量 SDK/宿主及宽度/缩放矩阵继续延期。

2026-10-29 已建立上述执行目标，源码与候选未变化，复用已有 6 项定向检查。原先被拒绝的是接管扩展 Workspace 标签页；该拒绝及禁止绕过仍保留。通过原生工具栏已打开 Side Panel；日常 Chrome Native 正常但原生状态读取超时；CFT 149 最初 Native 离线，后续已按用户明确授权恢复独立连接（见下段）。

后续通过 CFT 的 `chrome://version` 核对真实 Profile 为 `~/Library/Application Support/Google/Chrome for Testing/Default`；其用户数据目录没有 `NativeMessagingHosts/com.shopable.opendesk_browser.agent.json`，而日常 Chrome 对应注册存在。CFT 原设置已启用，重新检测仍离线。独立实例 `scrapyjs-react-01a186cc` 最初未安装。用户回复“允许独立注册并继续本地调试”后，已用官方 CLI 完成该 CFT 的独立注册；真实设置页及该实例 doctor 均确认在线，扩展 ID 一致。日常 Chrome 注册文件 SHA-256 保持不变；应用编译、stage、根开发监听和原目录 CLI 均保留。CFT 使用同实例环境变量的独立目录 CLI，文件工作区已可用；Controller Provider 的 `E_PROJECT_SCHEMA` 不影响 Sidebar App 预览。

此前安装与权限观察：通过 CFT 的原安装审阅链安装同源码 React 候选 1.5.0，实际进入采集 App。配置 A 保存后销毁、重开恢复；新增 label 字段后 title 与列表规则保留。字段、坏 JSON、分页草稿跨页签和取消配置切换均保留，未应用时保存/运行禁用。这些配置与草稿证据属于安装态；本地开发更新及存储隔离已另行验证如下。当时固定 Task 0.3.0 仅导入为待验证候选；同源码试运行 `945f880d-d5c3-4a9e-8835-949eee336e9f` 返回 `E_USER_SCRIPTS_UNAVAILABLE` 并释放资源，未自动重放。后续成功链见下段，历史失败及原始身份保留在 `evidence/extension-dev-20261029.json`。

通过原「开发 → 本地项目 → scrapyjs → 在侧栏调试」已显示当前 React 1.5.0。JSX 标题和 CSS 伪元素标记均在同一会话自动出现；还原后原界面自动恢复，源码、构建回执及快照重新匹配原始 `055e93055b66`。初次预览曾中断，通过原入口重开后完成自动更新与还原，未修改框架。隔离调试区最初没有安装区记录，新保存的「本地隔离验证」在预览重开及快照替换后仍在；正式安装区仍仅有 A、B、「豆瓣核心」，没有混入调试记录。当前根开发服务实际连接，revision `35192800cdbe`。固定 Task 的 Chrome 用户脚本授权仍未回复；线上采集、下载、Stop 不报通过。随后复核 Chrome 用户脚本开关仍关闭、该授权仍未答复；同一阻塞满足连续三轮审计后，原生 Goal 已更新为 blocked，未完成项全部保留。

交接复查（2026-10-29 22:20，Asia/Shanghai）：CFT 独立实例 doctor 仍在线，当前 JSX/CSS、构建回执及候选摘要与已验证版本一致。此前根开发、应用编译、stage、Mock 监听及目录 CLI 已不在进程列表，43119/43120/43127 无监听；上述“仍在运行”是此前观察。OpenDesk、日常 Chrome/CFT 两个实例及标准 demo 服务仍在。接收方先只读核对，只在后续源码迭代或目录预览确需时补启缺少的服务，不因监听停止重做已有通过操作。原 Goal 实读仍为 blocked，创建新对话不改变其生命周期。

接续核心结果（2026-10-29）：仍使用 CFT 149、同一扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`、仓库 `dist/development` 和独立 Native 实例 `scrapyjs-react-01a186cc`，没有切换加载目录或重建产物。用户明确允许开启 Chrome 用户脚本后，原开发入口主动发起固定源码 demo 运行 `63b452f5-b7f5-44fe-9487-dbe006334b9d`，完成并释放资源；在原任务目录核对本机持久运行和页面回执，再设为本地可用、安装 Task 0.3.0。

安装态 React App 的豆瓣运行 `1e4c5df5-d8ae-45dc-9746-31dd75627570` 和 CSDN 运行 `2320b540-dd4f-4d43-aa68-87a3bd4a53ab` 均 `completed/released`。独立读取同一 CFT 页面原生 AX 中的当前内容，与表格全部非空单元格及下载记录对照；CSV 全字段与同次完整 JSON 相符。AX 不暴露空单元格，因此空值由 JSON/CSV 读回验证，不能冒称执行过网页 JS 属性探针。CSDN 起初显示滑块，用户授权后再次观察已正常显示内容；未操作验证码、未刷新挑战，不推断访问恢复原因。

另存「原实例 Stop 验证」配置，在同一固定 Task 等待不存在的选择器期间核对配置/字段/完整 JSON/目标及开始按钮锁定，再点击原 Stop。`3e5b6ebd-6491-4609-bf20-08a163d8e00c` 保持原请求和结果身份，回执为 `stopped/released`，编辑解锁。切换配置清除上一份结果及导出入口。完整索引见 [本轮证据](evidence/extension-dev-20261029.json) 的 `coreContinuation01a1880c`；下载原件和读回报告保存在本机 `artifacts/scrapyjs/react-core-20261029-01a1880c/`。本轮仅更新说明与证据，产品源码和正式包未变。

## 真实扩展的持续开发入口

先检查并复用已运行的监听，不重复启动。Browser 自身复用根仓库 `npm run dev`，Chrome 加载 `dist/development`，并在「调试 → 本地开发服务」核对连接。应用有另外两个环节：

```sh
# 应用 JSX/CSS 编译监听；只写本应用 dist。
npm run dev --prefix examples/sidebar-tools/scrapyjs
# 完整编译回执通过后，发布供 Native 读取的不可变快照。
node scripts/watch-sidebar-tool.mjs examples/sidebar-tools/scrapyjs
# 首次目录接入；已经连接时继续用原 Workspace。
opendesk browser dev /Users/shopme/Documents/workspace/opendesk-browser/examples/sidebar-tools/scrapyjs
```

在真正 Chrome 的「开发 → 本地项目」选 scrapyjs，再点击「在侧栏调试」。Vite 编译、stage 发布与 Browser 开发连接分别核验；应用更新通过原 Native 会话替换沙箱实例，不是网页 Vite HMR，也不承诺保留 React 内存状态。修改 JSX/CSS 后必须在真实侧栏看到变化及还原，才算扩展开发更新证据。

当前本地调试只提供隔离 session 存储及 `currentPage.info`，不会继承正式安装版的 Task 委托或下载权限。`tasks.read/start/stop` 需通过原安装态 App：使用唯一打包器生成当前源码的临时候选，经「扩展」原安装审阅链安装，再使用独立安装并批准的固定 `scrapyjs.capture` 0.3.0。候选准备不等于正式包晋升；不修改 Host 以绕过限制。

线上核心场景是 `examples/original-sites.js` 的 `originalSites[2]`（豆瓣读书）与 `[3]`（CSDN）；两者都是当前页采集。实际网页内容、运行退休回执、表格与下载读回分别留证，不使用历史条数作固定预期。当前 React 的两站真实采集已通过；开发更新与还原复用同源码已有证据。历史连接观察不表示 watcher 当前仍在线，后续源码迭代开始时应重查；下节 Mock 不替代扩展证据。

## 辅助 Mock 网页（不证明扩展或线上采集）

需要辅助 UI 检查时才运行 `npm run dev:mock --prefix examples/sidebar-tools/scrapyjs`，访问 `http://127.0.0.1:43127/preview/dev.html`。它直接加载 `src/App.jsx`、CSS、原 App Model 与 adapter，使用内存 SDK；不覆盖 Browser 的 `dist/development`，不安装工具包。此前 JSX/CSS 网页 HMR 结果仅属于该辅助入口。

这是明确标注的内存模拟 UI：命名配置仅保存在该预览实例内，运行返回模拟记录，下载名称带 `SIMULATED-`。模拟场景选择位于工具 iframe 外，支持正常、空结果、失败、持续运行、权限拒绝和不可信文本；不调用真实网页或 Native。配置新建/保存/改名/复制/删除、字段添加/改名/删除、分页应用、无效 JSON 和草稿保护、模拟运行/停止/下载已通过实际浏览器操作。可重复驱动见 `tests/preview-interactions.mjs`，证据见 `evidence/react-ui-dev-20261029.json`；真实网页采集与原生安装仍为 NOT_TESTED。

功能取舍和 React 选择见 `INTERACTIONS.zh-CN.md`。当前只做实际扩展核心流程所需的应用编译、stage 与开发候选准备；正式包晋升、production 和完整验收继续延期。此前临时候选早于本轮 UI 修复，不能作为当前源码产物。

业务只在本目录维护。App 运行在原 opaque iframe，固定 `scrapyjs.capture` Task 运行在原 Controller Worker，使用词法 `page/params`。没有新执行器、宿主或安装器。固定 Task v0.3.0 批准的精确 origin 为 `http://127.0.0.1:43111`、`https://book.douban.com`、`https://download.csdn.net`。安装审阅完整范围，不为每个配置创建 Task；Chrome 网站权限及当前目标 Authority 继续独立检查。

## 历史安装与业务使用

两个包需分别经原入口审阅安装：

1. 「开发」/原任务目录导入 `controller/scrapyjs.opendesk-task.json`，验证固定源码并安装 Task v0.3.0。
2. 「扩展」导入本目录唯一正式 App `scrapyjs.opendesk-tool.json` v1.3.1；它精确委托上述 Task v0.3.0。此包不包含当前 React UI。保留同 ID 的配置，更新时不先卸载。
3. 打开标准页面 `http://127.0.0.1:43111/demo-form.html`，打开采集 App、刷新目标。默认读取 `#sample-list` 的直接 `li`；`.::text` 是原引擎自身文本语法。
4. 打开「采集规则 → 字段与属性」，填写列表容器和列表项；可选填写字段名、CSS 选择器及文本/属性类型，点击「应用字段」。同名更新，其他字段保留。
5. 需要时展开「采集规则 → 分页与列表详情」。填写下一页 CSS、页数上限和去重字段；详情需列表 URL 字段、双方共同身份字段和详情 `itemConfig`。点击「应用分页与详情」，然后开始。

### App 1.4.0 操作界面与旧 Chrome 对照

先在独立可见 Mac CFT 加载只读来源 `scrapyJsChrome` 的副本，打开真实 `www/popup_crawl.html`，切换数据预览、Config 和 Headers，再与已安装 App 1.3.1 对照。旧 UI 的任务下拉、运行/导出工具栏及数据/配置分区值得保留；其 Headers 实际编辑的是展示列名，不是选择器，未将它误称为完整字段编辑器。旧扩展本次只验证 UI 渲染和这些页签操作，未验证旧采集流程。

| 旧界面习惯 | 当前 App 的改进 |
| --- | --- |
| 命名任务下拉选择 | 配置改为下拉选择，保存就近放置；多份配置不再堆成多行按钮。新建、另存为、重命名、删除及原确认继续保留。 |
| 开始、状态位于数据/配置页签上方 | 共用目标与运行反馈，下方切换「数据预览 / 采集规则」。开始后进入数据预览；切页签保留坏 JSON、未应用字段和分页详情草稿。 |
| Config 保留完整规则；Headers 逐项列出字段 | 已有字段显示名称及原选择器，点击可载入文本/属性规则；复杂描述符、嵌套或 XPath 规则直接打开完整 JSON，不自动改写。所有校验、处理、分页和详情语义保留。 |

常用路径为「选择配置 → 确认目标 → 开始采集」。目标网址默认显示紧凑摘要，点击展开修改；目标与当前网页不同源时，主操作旁提示切换网站、刷新当前网页，真正目标及权限仍由原任务链核验。页签支持方向键、Home/End 和可见焦点。

字段点击载入本身不写存储；修改后仍须「应用字段」，再运行或保存。同名更新其他字段保留；未应用时禁用载入其他字段，避免丢弃草稿。切换配置遇到脏草稿先确认，取消后下拉框仍显示实际原配置。高级完整 JSON 保留原语义，无法表示为普通 CSS/属性的字段不强行转换。

结果仍保留全部字段、原始快照与导出顺序；表格优先显示 title。Stop 受理、原实例退休、未知结果不重放及原 ETag CAS 均未改变。新版本不重冻固定 Task 0.3.0，也不增加权限。

本次同候选 App 1.4.0 经原安装审阅链从 1.3.1 更新，五份原命名配置保留；字段修改/保存/销毁重开、坏 JSON 和未应用字段跨页签及取消切换、切换清旧结果通过。豆瓣样本返回 20 条、11 字段，逐值表格及 JSON/CSV 实际下载字节一致。配置下拉测试采用标准 DOM 选择驱动，其余相关按钮和文本使用浏览器输入；不冒称物理 Mac 下拉菜单点击。证据索引 `evidence/legacy-ui-20261029.json`，旧/新截图与原始报告在 `artifacts/scrapyjs/legacy-ui-20261029/`。

这是独立静态开发扩展快照，没有 serve 连接，未更新日常 Chrome，也不代表 production/正式生命周期验收。1.3.1 首轮改进和原业务证据分别保留在 `evidence/ui-20261029.json`、`evidence/original-sites-20261029.json`，有效未变证据继续复用。

### 豆瓣图书与 CSDN 原例

`examples/original-sites.js` 导出四份完整配置，顺序为豆瓣历史样本、CSDN 历史样本、豆瓣线上、CSDN 线上。将所需条目的 `config` 完整 JSON 粘贴到「采集规则 → 高级 · 完整 JSON」，保存为命名配置；打开对应网址、刷新目标、开始采集。可用下面的本地命令取得线上豆瓣 JSON，索引改为 `3` 即为 CSDN：

```sh
node --input-type=module -e 'import {originalSites} from "./examples/sidebar-tools/scrapyjs/examples/original-sites.js"; console.log(JSON.stringify(originalSites[2].config,null,2))'
```

两份原例均只采当前页：没有分页或详情需求。豆瓣保留 title 属性、url、publication、可空 rating，并按原 `splitPublication` 生成 publication_raw、author、translator、publisher、publication_date、price、currency，共 11 字段；无法解析的价格/币种按原规则保留 null。CSDN 的 title、url、description、price_text、metrics_text、author_display、membership 共 7 字段保留原文本、单位和作者分隔符。

本批 App1.3.0/Task0.3.0 在独立 Mac CFT 的原安装链与真实 App 中通过：历史样本豆瓣 **20 条**、CSDN **9 条**；线上豆瓣 **20 条**、CSDN **9 条**。历史预期来自原 script.json/DOM；线上预期来自运行时独立 DOM 读取，条数并非长期保证。四份配置均完成保存、销毁重开、原 Task 采集、完整表格核对、JSON/CSV 文件下载读回；运行 completed/released，切换配置清除旧结果。CSDN 首条本次为 PCL学习，学习人数文本是线上当前值，不能用历史 8938 强行断言。

可提交索引为 `evidence/original-sites-20261029.json`；原始报告 `artifacts/scrapyjs/original-sites-20261029/app-c/report.json`。样本及独立预期见 `fixtures/{douban-books,csdn}.html`、`examples/original-sites-expected.json`。样本仅保留原列表，去除远程脚本与资源，来源哈希和改动已记录；它们不冒充线上访问。本任务的静态开发快照位于 `artifacts/scrapyjs/original-sites-20261029/browser-source/dist/development`，包校验通过，浏览器已关闭、临时样本映射已移除；日常 Chrome/开发输出未切换。完整构建先遇到既有资源清单不一致，修复校验器后对同一编译产物通过完整包校验；不另称 production 或正式发行通过。

### 命名配置

- 初次升级时，原单配置显示为「默认配置」，内容保留；读取不写入，下一次明确保存才转为命名记录。
- 「＋ 新建」创建默认草稿，编辑后「保存配置」填写名称。「配置管理 → 另存为 / 复制」将当前有效配置保存为独立记录，原记录不变。
- 在下拉框选择已保存的名称切换；最后选中的已保存记录会在销毁 App 再打开后恢复。「重命名」用于已保存且没有脏草稿的记录；有修改先保存。名称忽略首尾空格、按 NFC 规范化，大小写不敏感的同名会明确拒绝。
- 切换、新建或删除遇到未保存 JSON / 未应用字段、分页、详情编辑时，先确认丢弃；取消保留原内容与选择。删除总需确认，删完最后一份后显示可继续编辑的默认草稿。复制和新配置名称表单也可取消或按 Escape。
- 保存、切换、重命名和删除共用原 ETag 条件写入。发生冲突或保存回执未知时保留草稿和远端列表，禁止自动重试；「读取保存版本」只读远端，「用保存版本替换草稿」经确认后采用远端完整列表。需要的本地草稿应先复制到外部文本。
- 运行期间锁定配置编辑和管理，Stop 始终作用于原实例。结果显示启动时的配置名称；切换配置后清空上一份结果，不把旧结果归给新配置。配置记录 ID 与固定 `scrapyjs.capture` Task 身份互不替代。

命名配置是 App 自身数据：同一 `capture-config` 存储项使用 `{schemaVersion:1, selectedId, records:[{id,name,config}]}`，最多 10 份，**整个存储项 JSON 合计最多 8,192 UTF-8 字节**；不为每个名称创建 Task。名称 1–60 个字符、最多 180 UTF-8 字节。每份采集配置仍遵守原 itemConfig / options 各 4,096 字节限制。超限、损坏记录和非法配置均拒绝保存，草稿与原保存值保留；较大的旧单配置仍可读取，不会为了迁移自动截断或覆盖。

历史 App 1.2.0 已在独立 Mac CFT 的原安装升级入口验证：A/B 保存切换、销毁重开、改名复制、同名拒绝、删除确认与取消、JSON/字段/分页草稿保护，以及两份不同字段的真实采集均通过；运行均 completed/released。旧列表详情配置与控件来回切换完整保留。36 项定向 Node 检查通过；ETag 冲突/并发保存、容量、损坏存储和详情草稿保护属于组件证据。可提交索引为 `evidence/named-configs-20261029.json`，原始报告为 `artifacts/scrapyjs/native-profiles/candidate-20261029-c/report.json` 与 `supplement-20261029-a/report.json`。原生测试使用上批固定静态开发快照，不代表日常 Chrome 已更新或 production 验收。

未应用的表单编辑阻止运行与保存。完整 JSON 保留原选择器/嵌套字段语法，也可填写原 `validation` / `fieldRequirements` / `processing`；配置只接收数据。表格呈现真实记录，完整快照仍保留。宿主、引擎、Stop 受理和实例退休分别显示；结果未知时禁止重复开始。原 Stop、配置 ETag 冲突保护和 JSON/CSV 下载继续使用已有链路。

当前 P0 引擎升级源码使用固定 Task **0.4.0**：分页链接通过公开 `page.goto()` 推进原目标会话，按 `document.baseURI` 解析，确认新文档后等待配置的完整页标记；标记也须适用于空末页。按钮、同文档锚点和没有可靠完成信号的异步翻页在动作前返回 `NOT_SUPPORTED`，不再把固定 300ms 静止当作加载完成。下一页控件须唯一，字段 DSL 继续交给原 ItemLoader。旧安装 Task 0.3.0 不会自动获得这些修复；来源、候选和未测范围见 [P0 升级记录](PLAYWRIGHT-UPGRADE.zh-CN.md)。分页只开放 CSS，最多 10 页；达到上限时保留已采集数据及 partial/page_limit，不伪称自然结束；详情最多 100 条、串行执行，严格核对 URL 与 ID，不静默重试。相同身份而内容不同报错；重复详情 URL、详情覆盖列表字段、错误 ID、非法价格均拒绝。详情 `numberFields` 使用来源示例的严格小数 Pipeline。滚动分页、XPath 翻页、断点恢复和重试管理未交付。

## 先脚本验证，再接 UI

可复制的零参数 ESM 入口：

| 脚本 | 输入与独立预期 | 本批真实 Controller 结果 |
| --- | --- | --- |
| `examples/fields.js` | GitHub 旧例三行；文本、href、可空属性；名称经原 Pipeline 大写 | 三行全部字段一致；BrowserValidation 运行，URL 绝对化；completed/released |
| `examples/pagination.js` | 两页共五行，两个重复；首次出现顺序三条 | 两页、三条、重复 2；`site_exhausted` 自然终止 |
| `examples/list-detail.js` | 旧 catalog 的 A/B/C、Ada/Ben/Cara、19.90/25.00/30.00；列表有 A 重复 | 三条 URL/ID 正确关联，价格为 19.9/25/30；列表和详情原引擎均 completed |
| `controller/main.js` | 同样的声明式详情参数，作为固定 Task | 与上述完整黄金一致；经原验证/安装链安装 |

输入、输出和来源差异见 `fixtures/README.md`、`examples/expected.json`。旧 Node HTTP 例子的 PASS 不作浏览器证据；这里用原 ChromeSpider / BaseSpider / Request / Scheduler / ItemLoader / Pipeline，在受控网页世界执行真实 DOM 提取。

复现时保留既有 `npm run dev` watcher、标准 demo 服务和日常 Chrome，使用独立 CFT/Profile 的不变开发快照：

```sh
# 前提：canonical demo 服务正在 127.0.0.1:43111 提供 examples/tasks。
# 仅添加有所有权检查的临时映射，不修改 demo-form.html 或重启服务。
node examples/sidebar-tools/scrapyjs/tests/fixture-mount.mjs mount
node examples/sidebar-tools/scrapyjs/tests/build-examples.mjs artifacts/scrapyjs/my-examples
node examples/sidebar-tools/scrapyjs/tests/native-examples.mjs --suite=artifacts/scrapyjs/my-examples/suite.json --out=artifacts/scrapyjs/my-native-run
node examples/sidebar-tools/scrapyjs/tests/fixture-mount.mjs unmount
```

`build-examples.mjs` 为每个入口准备独立源码快照，并调用现有 `build-program-project.mjs`；它不运行引擎。原「开发」入口导入固定草稿并显式 Run，原持久结果绑定 sourceHash/runId/resultId/retirement。`params` 可传 `url`，仍须原任务范围和页面授权。

原始脚本报告：`artifacts/scrapyjs/native-examples/core-d-20261029/report.json`。可提交的证据摘要与每项证据层级见 `migration-status.json` 和 `evidence/core-examples-20261029.json`。本批 App 独立成功报告为 `artifacts/scrapyjs/native-examples/app-d-driver5-20261029/report.json`：同一 App 的三组字段/分页/详情配置应用、未应用保护、三条全字段表格、保存后销毁并重开、完整 JSON 46,312 字节下载读回均通过。前一报告整体 BLOCKED 是后续 App 下拉框驱动失败，四个脚本结果本身均 PASS；未改写历史状态。

## 后续打包阶段（当前延期）

以下仅记录后续交付流程，不是当前 UI 开发的前置步骤。UI 稳定且进入打包阶段后，先执行本工具的 JSX 编译，再候选测试，经原 `--promote-from` 原子晋升和 `--check-project` 同源核对。Task 源码/manifest 改动则重新冻结、运行、验证、安装，并同步 App 的精确委托；不静默更新已安装 Revision。

```sh
# Task 范围或源码变化时，先按原 program build/验证/安装链冻结新 Task 并同步精确 pin。
# 固定 Task 0.3.0；以下仅供后续打包阶段，须先编译当时的 UI 源码。
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/scrapyjs --out artifacts/sidebar-tools/scrapyjs/candidate.opendesk-tool.json
SCRAPYJS_CANDIDATE=artifacts/sidebar-tools/scrapyjs/candidate.opendesk-tool.json node --test examples/sidebar-tools/scrapyjs/tests/{profiles,app-model,app-view,package}.test.mjs
# 测试通过后才执行：
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/scrapyjs --promote-from artifacts/sidebar-tools/scrapyjs/candidate.opendesk-tool.json
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/scrapyjs --check-project
# 本批原生操作使用 tests/native-examples.mjs 的 --app-lane=original-sites --headed；
# suite 参数须遵守固定 Task 的 url/configJson/optionsJson paramsSchema，见原始报告输入。
```

完整原 SDK 为 1,136,734 bytes，SHA-256 `c7a266c1bd5f34ba5e5a85d163c0573fc1d5afb60c07d0ce46af8393e7ada4be`。`engine/browser.js` 只把 classic IIFE 已有导出转为词法 ESM；无压缩、删模块、假 window/DOM 或 Node 能力模拟。通知见 `vendor/scrapyjs/THIRD_PARTY_LICENSES.txt`。无需为日常业务重新生成这份未变 SDK。

Task v0.3.0 sourceHash `12668947ef0f99851986891b911ee3d32deca993e42066b48f496691579feb4f`，manifestHash `1bec7362a33d4aeb4ce051d2eed699aa4876e3c7ae82efc536005f287340f53a`。App 和 Task 包摘要从同源检查及证据账本读取。

## 尚未完成

可视选择/高亮/表格选择与选择器生成、完整处理/质量编辑、自动保存/来源 profile 运行策略/自动重绑定、暂停/继续、检查点恢复/调度及大结果体验尚未完成，不是当前 UI 阶段的完成条件。AI 助手已由本轮恢复实施；克隆 UI、配置任务库和通用录制/回放继续排除，命名配置继续保留。Rule/LinkExtractor/runCheckpointTasks 等完整实现保留不等于已在 OpenDesk 逐项运行。原 `processing.splitPublication` 的本批豆瓣当前页验证见原站点证据；它不代表任意出版格式均受支持。

上轮 v0.1.0 六项单页核心证据保留在 `migration-status.json.coreEvidence`，包括正常 Stop、回包前取消和 JSON/CSV 文件下载。它们是旧候选证据，不提升为新候选的全量验收。旧 `k3-sandbox-error-forwarding.test.mjs` 的过时 Worker URL 夹具缺口继续保留，未放宽来源校验。本轮延期 production、升级/撤权正式验收、完整 32 项验收、宽度/缩放矩阵及压力测试。独立 95+ 评分按本轮要求执行。Node 文件/CLI 专用功能本轮不迁。
