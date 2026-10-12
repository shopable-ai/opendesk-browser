# OpenDesk 应用市场 R5 实施与证据

日期：2026-10-12。集成者：本轮 `/root`；分支：`main`。

## 固定范围与执行状态

`IN_PROGRESS`，首个 main 实施提交已推送，真实 Linux／Mac CI 已发现兼容性及驱动问题，正在修复并补测。开始基线 `67fefdac3f5576cb7f3dc042149d95ca046810c7`，检出目录 `/workspace/scratch/58f5833cea67/opendesk-browser`，开始时无未提交差异。期间先后安全快进到 `df1ce25a`、`50456353`，保留 R27、Workspace、Page、Cloud Control、Time Review 与计划任务的并行修改。用户已授权在 main 修改、测试、提交与正常推送；不创建分支/worktree，不公网发布。

本轮固定交付：独立网站源码/完整构建、官方固定发行的可信安装交接、开发/生产隔离、本地 HTTP 真实安装/使用及必要恢复、历史版本输入、正式渠道配置合同、逐项证据与独立审阅。安装/更新/卸载/权限/RunHost 继续复用原服务。远程 Page/sandbox/Task 仅定义后续各自准入边界。

| 功能 | 当前实现 | 实际入口 | 已有证据 | R5 缺口 |
| --- | --- | --- | --- | --- |
| 公共网站 | 构建脚本内 HTML/CSS | build:market-site / dist/app-market-public | 历史静态站输出 | 源码拆分、搜索、响应式、交接客户端、完整输出 |
| 官方安装 | 六工具目录；TOC/网页笔记预装 | ui/marketplace.html → 原 installation.js | app-market-mac-01a12a35 原候选 | HTTP 外部入口及新包真实验证 |
| 可信来源 | 未开放 externally_connectable | manifest / verify-package | 旧合同拒绝外部网页 | 受控配置、sender 校验、有限接口 |
| 固定版本/套装 | 现行发行与 reading-kit r1 | official-catalog / catalog.js | 组件与旧候选缺包拒绝 | 不变历史快照与新 revision |
| 恢复 | 安装事务、batch 恢复 | 原市场/安装器 | 组件/历史正常重启 | 交接持久化、去重、开页中断核对 |
| 正式渠道 | 无已核验域名/发行ID/获取地址 | 尚未配置 | 无正式 HTTPS | 配置与验证合同；真实上线 BLOCKED |

## 复用与资源

- `app-market-mac-01a12a35` 的原候选 PASS 保留；R5 新 Manifest、外部入口、网站与 Worker 输入变化，判为 `AFFECTED_INPUTS`，不升级为本轮通过。
- Sidebar tab memory、R26/R27 spacing 的未改部分按原级别保留；不恢复旧导航或改写这些布局文件。
- 本轮独占自己检出的 dist/.wxt 与 `evidence/app-market-r5/`、`docs/framework/workstreams/evidence/app-market-r5/`。原证据不覆写。
- 本地网站拟用 127.0.0.1:43132，标准网页拟用 127.0.0.1:43111，使用前检查真实占用；不结束其他进程。
- 当前环境 Linux，无用户 Mac 目录。Mac Chrome 和正式 HTTPS 不由组件/本地 HTTP 代替。
- 安全、UI/UX、安装恢复三位审阅者均只读；所有源码及证据文件由集成者串行写入。

## 路线决策

选用组合架构的首个可执行阶段：网站只提出固定 app/version 或 collection/revision，扩展打开一次可信审阅并复用随包官方安装。此阶段不增加远程可执行代码，也不把随包发行写成所有应用的永久限制。远程固定版本可减少扩展发版依赖，但需要各类型准入、发布者签名根及撤回策略，不能通过本次外部消息接口偷渡。

## 验收状态

所有新增功能在取得对应证据前均为 `NOT_TESTED`。设计、实现及证据分开记录；核心 P1 未关闭不评分 95+。正式域名、生产发行 ID、经核验的主扩展获取地址尚缺，正式 HTTPS 为 `BLOCKED`。

## 已落地的实现

- 独立 `src/market-site/` 模板、样式、客户端；完整静态路由、搜索、少量分类、帮助、安全头部署合同和逐文件构建身份。现有构建命令保留，新增 `dev:market` 与 `snapshot:market`。
- 同一受控配置生成 dev/prod website、Manifest 和私有 host channel。生产输入为空时关闭外部交接；开发仅精确 `http://127.0.0.1:43132`。
- 独立 SW sidecar，只有 PROBE／OPEN_INSTALL_REVIEW；真实 sender 顶层 tab/document/Origin 校验、全局及 Origin 限流、持久 TTL/容量、同请求去重和开页中断核对。
- 固定内部审阅候选；原安装器继续核对 baseline、摘要、来源、版本、容量和权限。只增加可选的原提交前 intent 消费门；未增加安装库或权限/RPC体系。
- 消费标记防止原日志裁剪后重放。原安装事务恢复与缺日志交接结束分开；后者只结算交接、不写安装事实。套装结果和恢复严格绑定当前 intent 的 batch ID。
- reading-kit r1 保留，新 r2 固定当前三项。受控归档共 11 个有完整发行描述的版本，另有缺完整证据的 quick-notes 1.1.1 历史引用页面。时间回顾整合后的发行使用 1.3.1，保留既有 1.3.0 身份。

## 本轮已执行证据（提交前）

| 检查 | 实际结果 | 证据等级／边界 |
| --- | --- | --- |
| 当前相关组件 | `82/82 PASS` | Node 组件；含原安装／批量／目录及 R5 sender、消费、TTL、UI恢复，不是 Chrome sender |
| 独立审阅整改 UI 用例 | `31/31 PASS` 的定向子集 | 含 app/collection ACK 丢失同页恢复、同revision其他intent结果隔离；不与82相加 |
| 源码检查 | 505 source/test/build 文件通过 | 语法、固定资源/CSP/构建合同；后续测试脚本小修单独做语法核对 |
| 生产及开发构建／包校验 | 均通过；身份详见机器索引 | 按实际 sourceInputs 绑定，不把合入后的不同包自动记为原包PASS |
| 独立网站构建 | 开发与生产禁用配置均构建通过 | 6 个当前应用、11 个归档发行、2 个固定套装revision、明确的历史缺证据页 |
| 原 Python 启动方式 | 实际 TCP HTTP 12 路由与重复访问通过，404符合原服务器行为 | `REAL_HTTP_STATIC_SERVICE`；没有运行网页 JS 或安装 |
| 新 `npm run dev:market` | 实际 HTTP 12 路由、安全头、404及第二启动 EADDRINUSE 通过 | 只停自己启动的服务；第一服务不受第二启动影响 |
| 本地实际 CFT 启动 | `BLOCKED`，启动阶段 `socket() failed: Operation not permitted` | Linux 环境 AF_UNIX/IPC 限制，未到扩展加载；无真实安装 PASS |
| Linux/macOS CI | 待当前 main 源码提交后执行 | 已接入原 market workflow；固定 CFT 155.0.8059.39、原输入驱动与逐阶段原始 receipt |
| 正式 HTTPS | `BLOCKED` | 缺已核验域名、生产ID、主扩展获取地址与部署条件 |

本地原生失败原件保留，不以组件提升为真实 sender。首次 HTTP 探针在两次自有服务之间使用无复用 bind，遇到 TCP 端口回收窗口；未结束任何他人进程，调整探针的地址复用后原命令和新增命令均实际通过，原 Python 请求日志保留。

## 独立审阅与整改记录

三位只读审阅者不承担产品实现写入，集成者串行修复：

| 发现 | 影响 | 实际整改与新增证据 |
| --- | --- | --- |
| 无界处理队列／TTL及已消费日志裁剪边界 | 洪泛或旧请求重放风险 | 先验证再入有界队列；持久消费与终态结算；组件并发/裁剪/TTL |
| 消费 ACK 丢失、首日志尚未建立 | 原页面缺正常恢复出口 | 锁内本机核对并明确结束交接；页面重新读 intent；app/collection真实页面模块组件 |
| 同套装revision串到另一请求批次 | 结果归属／错误恢复 | 显示、handler入口和锁内均核对 batchId；隔离用例 |
| 迟到连接探测覆盖交接状态 | 用户误解交接结果 | 分离连接与交接状态、generation fence；独立客户端用例 |
| 来源/能力说明及 baseline 重审不足 | 一次审阅难以理解 | 发布者、制品来源、中文能力及新增能力、重新审阅入口 |
| 测试的 iframe点击／拒绝原因／收尾竞态 | 假失败或无接收端假安全通过 | 原生实际子按钮坐标；逐个错误码；安装/结算/卸载清理及Chrome正常退出后才PASS |
| 旧 UI 选择器、r1当前导航与草稿退出 | 当前原生驱动必失败 | 适配现行图标/标题/键盘、明确访问r1、真实内联草稿放弃；未删原用例 |

最终源码及组件复审：安全与 UI／UX 本次已识别未关闭 P0/P1 为 0。证据审阅指出真实中断窗口、安装 ACK 丢失、容量与摘要破坏的原生用例尚未闭合，保留 `NOT_TESTED`，不能因为正常链路PASS把所有恢复评为95。

## 十一维独立评分（当前阶段）

以下为提交前的阶段评审，最终原始 CI 结果回填前不宣布相应实现达标。设计只评价职责、流程和异常合同；实现评分不得由这些设计分推算。

| 维度 | 设计评分 /100 | 实现评分 /100 | 证据等级与状态 | 未关闭问题 | 文件、结果与下一步 |
| --- | ---: | ---: | --- | --- | --- |
| 产品定位与架构边界 | 96 | 待评 | 源码/独立审阅通过 | 实际集成待CI | R5架构；核对当前包执行边界 |
| 网站 UI 与响应式 | 95 | 待评 | 静态及组件，真实UI未测 | 实际媒体/缩放/焦点 | templates/market.css；真实截图与布局 |
| UX 与可理解性 | 95 | 待评 | 页面/客户端组件通过 | 原生操作未测 | page/client；CI点击及错误路径 |
| 安装、更新、卸载、使用 | 96 | 待评 | 原服务组件；本地Chrome阻塞 | 正常真实闭环未验证 | R5 native helper；Linux/Mac CI |
| 来源、权限与执行安全 | 96 | 待评 | 源码+模式包+组件 | 真实sender拒绝未验证 | external/intent/verify-package |
| 隐私与最小暴露 | 97 | 待评 | 源码及消息组件 | 原生响应/数据边界待核对 | 两操作有限回执、无安装清单 |
| 固定版本、套装、事务 | 96 | 待评 | 归档构建、组件通过 | 当前batch实际交接待测 | releases/batch/page |
| 本地 HTTP 开发可用性 | 95 | 待评 | HTTP静态服务通过 | HTTP→Chrome安装未测 | 两个实际启动命令、原生helper |
| 正式 HTTPS 与官方渠道 | 95 | 待评 | 配置合同/生产禁用包；BLOCKED | 正式渠道三项核验输入缺失 | channel-config；核验并部署再实测 |
| 兼容性、性能与维护 | 95 | 待评 | 独立构建和模块检查 | 真实Chrome表现待测 | 固定sidecar/无网站SW依赖 |
| 恢复与验收完整性 | 95 | 待评 | 中断/ACK组件，原生部分待测 | 开页持久化窗口、安装ACK等 | 保留失败/未测清单，不算整体通过 |

## 提交与后续核对

首个实施提交 `5d1d87431188d74a7d23900ff7477ddef3b585a4` 已通过带期望父 SHA 的非强制 main 更新推送，本地已正常快进。随后保留并整合 main 到 `3134e2b1` 的网页笔记 1.1.8 和计划任务 UI 修改，没有创建分支/worktree或覆盖并行文件。后续修复提交与实际 CI 原件继续回填；没有公网部署或正式 release 动作。

操作和配置说明见 [R5 架构](../../architecture/browser-framework/app-market-website-r5.zh-CN.md)；原授权范围保存在 [实施 GOAL](../prompts/goal-app-market-r5-implementation.zh-CN.md)。后续远程整包信任根、发布者、轮换、撤回和各类型准入是独立任务，不能替代本轮仍要求的实际 HTTP 和恢复验收。

## 首次真实 CI 失败与纠正（2026-10-12）

[run 38219728571](https://github.com/shopable-ai/opendesk-browser/actions/runs/38219728571) 绑定已推送 `5d1d8743`，Linux R5、macOS 15 R5 与原生产包三个 job 均为 **FAILED**。Linux／Mac 已实际加载扩展、打开真实 Side Panel 并核对默认预安装；两者的首个 HTTP PROBE 被 `E_SENDER` 拒绝，尚无网站安装成功。完整原始 receipt（无改写 gzip）及下载归档摘要见 [失败证据索引](evidence/app-market-r5/ci-38219728571/index.json)。

根因：将 Chrome `documentId` 与意图 UUID 共用正则。真实 Chrome 的 documentId 为 32 位十六进制；[Chromium 原始解析代码](https://github.com/chromium/chromium/blob/main/extensions/browser/extension_api_frame_id_map.cc)使用 `UnguessableToken`，而 contextId 另用 UUID。已修正浏览器标识类型，保留所有实时 tab/frame/origin/getFrame 核对；组件 sender 形态也纠正，添加半零合法、全零/错长/非HEX/UUID拒绝及另一document返回不匹配。先前组件和审阅采用UUID的假设错误，原组件通过不能覆盖这个真实失败。

新增 source-bound 原生观察在实际 validator 调用前只读投影真实 sender，要求实际加载脚本 hash、精确断点和原 context 绑定；不替换API、不伪 sender、不修改运行值。后续只有 OBSERVED＋实际 CONNECTED 才关闭此兼容性项。生产包失败时卸载确认框未关闭，安装表未变；驱动增加真实工具就绪及确认消耗核对，禁止盲点重试。

UI 审阅指出 R5 分支没有执行旧分支键盘／缩放用例。已补网站详情和可信审阅 320/1280、深色、真实 Chrome 125%/200% tab zoom、Tab/Shift+Tab/Enter；首页增加跳转主内容与 Space 分类操作，套装/历史/帮助增加窄屏检查，等待实际截图审阅。不是将旧证据直接算作 R5 通过。

整合网页笔记 1.1.8 后追加官方生产者快照与 reading-kit r3，保留 r1/r2 原成员，当前归档为 12 个完整发行描述、3 个套装revision；不把原 r2 的1.1.6换成1.1.8。当前相关组件修复重新验证见本目录 TAP；开页/写入窗口与安装未知结果原生恢复仍待补测，十一维实现评分继续待评。
