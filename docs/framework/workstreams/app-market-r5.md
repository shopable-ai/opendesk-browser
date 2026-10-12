# OpenDesk 应用市场 R5 实施与证据

日期：2026-10-12。集成者：本轮 `/root`；分支：`main`。

## R5 双平台真实 Chrome 验收与最新 main 影响核对（2026-10-12）

**原始候选：** `3744be088240124d3ab803ef10c2c0256e787b37`，仅写入 `main`，未创建分支或 Worktree。完整 [GitHub Actions run 38237391020](https://github.com/shopable-ai/opendesk-browser/actions/runs/38237391020) 的三个关键 Job 均为 `success`：Linux R5 HTTP Native、macOS 15 R5 HTTP Native、生产包 Market Native。以下是真实运行候选的事实，不表示未来任意 `main` 构建自动继承。

**本轮结果：本地 HTTP 官网到扩展的官方工具真实安装、使用和必要恢复已在 Linux 与 macOS Chrome 通过；正式 HTTPS 上线未测试且被配置输入阻塞。** 当前官网版本数由源目录决定，不再沿用历史“五个工具全部未安装”假设。

| 验收项 | Linux Chrome for Testing | macOS 15 Chrome for Testing | 证据及边界 |
| --- | --- | --- | --- |
| 网站 `http://127.0.0.1:43132` → 外部消息 → 可信页 → 安装 → 打开使用 | **PASS，16/16** | **PASS，16/16** | 原生扩展与实际 sender/document，`r5.result=PASS`、`publicWebsite=REAL_HTTP_CHROME_PASS`；不直接写安装记录 |
| 网站布局与键盘 | 布局 23、真实缩放 4、键盘观察 101 | 布局 23、真实缩放 4、键盘观察 101 | 原始截图含 320px、深色、可信审阅、125%/200% 和用户可见焦点；仅对实测界面有效 |
| 外部不可信请求拒绝 | 8 项实测 | 8 项实测 | 错协议、额外字段、任意运行入口、错误扩展 ID/端口、iframe、重复 ID 冲突等；未运行通用 RPC |
| 交接中断与恢复 | A1/A2/B/C **PASS** | A1/A2/B/C **PASS** | 真实 Worker 停止、可信页关闭，恢复沿用原事务与候选；C 恢复期间安装注册表再次提交 **0 次** |
| 五秒连接超时、固定套装、版本、更新数据、网站授权、卸载和重启 | **PASS** | **PASS** | 分别验证真实超时后连接、固定 reading-kit、网页笔记迁移数据及标准 demo 网页，浏览器各正常退出 2 次 |
| 产品运行错误 | 0 项未解释异常／0 项控制台错误 | 0 项未解释异常／0 项控制台错误 | 原执行上下文 ID 及加载包摘要有证据；应用正常流程没有自定义 JS 弹窗 |
| 生产插件独立回归 | **REAL_CHROME_FIXTURE_PASS** | 本 Job 在 Linux；不能记为 macOS 生产包测试 | 环境 **1528 PASS、0 FAIL、7 SKIP**；独立生产扩展 ID 与包 SHA，三次正常 Chrome 退出 |
| 正式 HTTPS 官网和用户本机 Chrome | **BLOCKED / NOT_TESTED** | **BLOCKED / NOT_TESTED** | 缺经核验的正式 HTTPS Origin、发行扩展 ID、官方下载 URL、部署权限和真实线上操作 |

实际身份必须逐平台保存，不能把 Linux 的扩展 ID 或 build ID 写到 Mac：

| 绑定字段 | Linux R5 | macOS R5 |
| --- | --- | --- |
| 扩展 ID | `nmeilgnolfnnlopgjoijdafbkelekcbj` | `oibdecbpklpnlljpiolnkgpohmpflnmj` |
| 插件包 SHA-256 | `df3e2a7552577d0a6386075a6cb017fdf8145a2c1886635c80265dad090efcc2` | `20672ab1f074cc086920039ad6498d5c8e533e42ea699d4eda466700375af158` |
| 站点 build ID | `0526637ef3accd46a6c150e0d3f4d6eeefbbec36941a06700b161af6a80025f5` | `ba4c16d2de8ddea656e0bde112e2f4aea009218f8c5c3e79f052ee67542ccec8` |
| 原生结果 JSON SHA-256 | `7954e6fbbed41c8c9977a055685dedef57fd542199718d509345274df9b9f93b` | `56c326cb266a92f290bf372897f1893b14ce666797f096fa7321a9babdce9ee8` |

两站均为精确开发 Origin `http://127.0.0.1:43132`。本候选官方目录摘要 `80bd653266e4c378ffd8b372fd12dc0f5c9a9d53f8617296c99e7e9bd98f302c`；7 个当前推荐工具、13 个受控固定发行、reading-kit revision 1/2/3 未改写。`quick-notes@1.1.1` 旧页面仍标记缺发行快照，没有伪造哈希或代换当前版。

生产包独立 ID `jhajepcnohiplmafaiokjlcagcfjgaap`、包 SHA-256 `4ad4bc83493acfaf2325a9df8b4ca7857a8086a5806606e919018d257a313cb7`、原生结果 JSON SHA-256 `723402e199fbe4ce24755eeef7caf23fba028232c05b10986a2dbc8e233050ba`。

**证据索引：** [`ci-38237391020/index.json`](evidence/app-market-r5/ci-38237391020/index.json)。它固定 CI Job、构建及实际身份、16 条原生检查名称、原始 GitHub Artifact ID、未经修改的 JSON SHA-256、重点截图 SHA-256 和未测试边界。原始 ZIP 可从该 CI 的 Artifacts 取回；若超出 Actions 保留期限，索引不会冒充仍能下载原件。旧候选的 FAIL/TAP/索引均原样保留。

### 独立维度评分（仅针对 `3744be08` 的受测范围）

分数是依据该候选设计、源码、原生 CI 与截图的**阶段工程评价**，不是用户可用性样本或正式商店审核结论。UI 和 UX 分开；本地 HTTP 和正式 HTTPS 分开。标 `待评`、低于 95 或缺必要证据的维度未验收完成，不能用平均分抵消。

| 维度 | 设计 /100 | 实现 /100 | 证据等级及状态 | 未关闭问题／下一步 |
| --- | ---: | ---: | --- | --- |
| 产品定位与架构边界 | 97 | 96 | 代码与双平台真实 Chrome，候选 PASS | 各类型远程分发仍独立准入任务 |
| 网站 UI 视觉、响应式 | 96 | 95 | Linux/Mac 真实截图、窄屏／深色／缩放／键盘 PASS | 低影响文字与更多实际屏宽可继续优化 |
| 用户交互与可理解性 | 96 | 95 | 双平台网页点击、可信页、超时恢复和使用 PASS | 尚未开展外部非开发者观察研究 |
| 真实安装、更新、卸载、使用 | 97 | 96 | 16+16 原生检查、生产真实生命周期 PASS | 用户私人 Mac Profile 未实测 |
| 来源、权限与执行安全 | 97 | 95 | 真实 sender、开发 Origin、8×2 拒绝路径 PASS | 正式 HTTPS 源尚未启用；其他 Chrome 版本待测 |
| 隐私与最小暴露 | 97 | 96 | 实际有限消息与源码拒绝规则 PASS | 公网上线后仍需检查部署日志及第三方资源 |
| 固定版本、套装、事务一致性 | 96 | 95 | 3 个固定 revision、批次锁、四个中断窗口 PASS | 历史缺包保持不可用，30 分钟原生 TTL 未测 |
| 本地 HTTP 开发可用性 | 97 | 97 | Linux/macOS 实际 43132/43111 与浏览器动作 PASS | 修改端口须重建对应两端来源 |
| 正式 HTTPS 部署与渠道 | 95 | 待评 | 生产来源默认关闭的合同已测；**BLOCKED** | 需正式域名、扩展 ID、官网获取地址、部署与线上原生测试 |
| 兼容性、性能与维护成本 | 96 | 94 | 两平台真实 Chrome 155 与包校验 PASS | 跨版本／性能样本不足；之后主分支输入变更 |
| 故障恢复与真实验收完整性 | 97 | 93 | A1/A2/B/C 双平台原生中断 PASS，原始失败保留 | API ACK 丢失、实际配额不足/损坏、自然空闲 Worker/完整 30 分钟 TTL 等未原生验证 |

适用于**本次已执行的测试集合**的 P0/P1 未发现未关闭项；它不等于所有未来异常路径已被证明无缺陷。对于最后两项实现低于 95 的维度和正式渠道，状态维持未达完整门槛。

### 新 `main` 的复用边界

**重要：`3744be08` 之后的并行 `main` 已修改受影响输入，不能将以上三个 Job 的 PASS 自动升格为新主分支 PASS。** 按仓库测试指南标记 `AFFECTED_INPUTS`：

- `src/sw.js`：新增 Chrome Alarms / 定时任务唤醒入口，会影响 Worker 生命周期与异常清理。
- `src/ui/sidebar-tools/package.js`：扩大已定义的 v2 Browser SDK 能力集合，应核对权限/候选验证不被绕过。
- `src/ui/sidebar-tools.js`：新增 SDK／Side Panel 协调逻辑，影响工具宿主调用路径。
- `src/ui/tool.html`、`src/ui/tool-shell.css`：定时任务界面和布局变动，需做受影响的焦点、标签与空间验证。

本候选的 `official-tools/catalog.json`、`src/marketplace/external.js`、`intent.js`、`page.js`、`installation.js`、`scripts/build-market-site.mjs`、`scripts/market-channel.mjs` 的 Git blob 在该次比对中一致；以上五个变化文件为已证实的影响项，其他传递依赖仍须由新 CI 做实际构建和行为核对。以最新 `main` R5 workflow 的原始结果判断复验是否通过，不应重复运行全部无关框架测试，也不覆盖别的 Agent 的代码。

### 仍需执行且不得改称已完成

- 完整 30 分钟意图自然过期与 Chrome 自然空闲 Worker 关闭；
- `tabs.create`、`chrome.storage.local.set` 浏览器 API 回执丢失的真实容错，非仅关闭调用者；
- 真正的配额不足、损坏包与更多异常源的故障注入；
- 正式 HTTPS（已核验域名、实际发行 ID、正式获取渠道和线上 Chrome 交接），以及用户本地 Mac Profile 的确认。

启动方式：`npm run build:dev` → `npm run build:market-site` → `python3 -m http.server 43132 --bind 127.0.0.1 --directory dist/app-market-public`；或用已提交的 `npm run dev:market` 统一启动本地网站。两种方式均需要加载同一来源配置构建的开发扩展，扩展实际 ID 应与生成的 channel 一致；正式构建默认不接受 loopback。

---

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

## 十一维独立评分（首个实施提交前的历史阶段）

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

后续修复提交 `b392b7f0` 已推送。run `38221688395` 在组件门禁因同批次隔离 fixture 将 r2 Notes 1.1.6 错配到当前 1.1.8 而失败，原 batch 精确版本检查正确拒绝，未进入新一轮 native。用例改用 r3 并同时匹配ID和版本；受影响的82项组件重新全部通过，r1/r2缺包用例保留。原失败与修复 TAP 见 [该轮索引](evidence/app-market-r5/ci-38221688395/index.json)。

## 真实发送者通过后的进一步整改（2026-10-12）

`b177a7bb` 对应 [run 38222122668](https://github.com/shopable-ai/opendesk-browser/actions/runs/38222122668) 的 Linux 和 macOS 都已取得真实 sender `OBSERVED`：加载脚本摘要匹配、32HEX documentId、顶层 frame、active lifecycle、精确 Origin/URL、真实非隐身 tab，HTTP PROBE 已连接。两者随后因搜索“Markdown”应命中工作台和剪藏两项、旧断言仅要求一项而失败。现在核对具体主链接集合，并追加唯一词“Markdown 工作台”的搜索；不是删除搜索失败。尚不能宣称此轮网站安装通过。

同轮生产包在跨页撤权阶段失败：原件证明授权存储已清空、剪藏安全关闭包含正文的 sandbox 并返回工具列表；隐藏设置容器保留禁用 DOM。驱动改为核对真实持久化、可见完成状态、内容 iframe 消失和当前列表，而不要求隐藏节点必须删除。

独立证据/安全审阅同时发现真正的 P1：六个独立工具页出现 Foundation 登记拒绝。导航生成器保留有效 `toolId/previewId`，原 `environment.js` 却只允许 `hostInstanceId`。新增纯 `tool-document-url.js` 统一有限内部 URL 形态；有定位参数时只允许真实顶层 TAB 和浏览器 documentId，禁止进入 Side Panel 缺 documentId 的恢复分支。现有 `tasks.open` 工作台、Authority、工具对应关系、权限和运行准入保留；外部市场消息与来源没有扩大。新回归读取原 `OpenDeskResourceDiagnostics` 确认真正连接的宿主端口。修复需由新原生结果关闭，不能用初始工具画面代替。

最终 native gate 现记录 `Runtime.exceptionRevoked`，在正常 Chrome 退出前后检查未解释异常和 console errors，防止把未处理产品错误写成 PASS。87项相关组件已通过，独立安全审阅未发现该纯 URL 修复引入的 P0/P1；原生验证仍待新提交。

四个真实中断窗口已加入原 CDP 驱动：A1 持久 prepared 后开页前；A2 实际创建审阅页后 opened 持久化前；B 消费确认后首条原事务日志前；C 原注册表写入确认后、读回和来源终态前。精确 AST 绑定实际未修改产物、加载摘要、真实 context 与原始调用断点，分别物理停止 Worker 或关闭审阅页；同一 HTTP 请求恢复原身份。C 恢复期间另只读计数原注册表写调用，要求零次再次提交。它们没有模拟API结果或写安装表。断点缺失或实际销毁未观察到即失败，不能扩大为原生 API ACK 丢失通过。

三个原始失败 receipt 与源码、包、网站、浏览器、artifact/hash 绑定见 [本轮原件索引](evidence/app-market-r5/ci-38222122668/index.json)。旧失败保留。严格原生 `tabs.create`/`storage.set` ACK 丢失、真实容量/损坏故障、30分钟TTL和自然空闲关闭尚未验证，正式 HTTPS 仍缺核验后的渠道输入。表中的阶段评分继续适用；实现分等待实际证据。

并行 main 的 Time Review 分类/生命周期、Page 浏览器验收和编辑器用例已在核对不重叠的文件差异后快进到 `df3b96c8`，没有分支、worktree、强推或覆盖其他会话文件。

## 精确原生调用位置与后续结果（2026-10-12）

`66da8d77` 已在保留并行 main 的正常父提交上推送。[run 38224251074](https://github.com/shopable-ai/opendesk-browser/actions/runs/38224251074) 的生产包已证明六个实际独立工具宿主全部连接，runtimeExceptions/consoleErrors均为零；完成实际网站授权/撤销、超过10MiB本机存储验证以及第一次正常完整Chrome重启。后续失败在 `grantSite()` 已检查完成UI并返回列表清空notice后，又冗余要求那条临时成功文案。改为保留已发生的UI检查和返回后的持久授权核对，不删撤权/卸载场景。最终未完成的生产尾段仍需新原件。

Linux与macOS已通过公共页面、搜索、首页320/360/520/1280与深色、历史/套装/帮助窄屏和分享刷新，随后A1在设置断点时 `NOT_OBSERVED`，没有开始中断或网站首次安装。原假设“AST调用节点首字符等于V8 call位置”不正确；V8将成员调用的位置标在表达式内部。修复只接受同一精确AST调用范围内唯一浏览器 `type=call` 位置，AST先拒绝所有嵌套Call/New/TaggedTemplate；保存所有原始possible位置及选择理由，仍要求setBreakpoint实际位置完全一致，不接受相邻语句、范围外、多调用或自行迁移。独立审阅确认这不改变四个事务边界；Node V8仅编译、不执行产品代码的五个位置验证通过，不能代替Chrome实测。

正常首次安装/打开/使用在独立中断案例之前执行，四个中断案例保持必需，改用仍未安装的可选知识收件箱验证A/B，更新时继续验证C；没有删除失败场景或降低最终PASS门槛。完整失败与定位原件见 [索引](evidence/app-market-r5/ci-38224251074/index.json)。

`93b636449ad0600601cce4a3b025be686cc49a34` 已正常推送 main；父提交 `f1dbd58c677957e3bf849fa869bff67971e473cc` 保留八项并行 Side Panel 身份识别、Cloud 第六页与 Page 编辑器修改。与本轮待提交文件无重叠，直接快进整合，没有新分支或 worktree。该候选的 [run 38225774632](https://github.com/shopable-ai/opendesk-browser/actions/runs/38225774632) 状态随原件更新，不能预写 PASS。

## 展示图片与低影响焦点提示整改

独立 UI 审阅实际查看 `66da8d77` 的16张网站图和6张工具图：首页、历史、套装、帮助在已覆盖视口未发现视觉P1；详情、可信审阅和缩放当轮没有执行，不能算完整 UI/UX 通过。macOS 首页截图保留 skip link 后滚动位置，驱动仅把后续拍摄视口恢复到页面顶部，不改变产品状态。

新增受控图片索引与构建校验，四张知识收件箱、Markdown、网页笔记、时间回顾初始界面 PNG 直接来自该生产原件，字节不编辑；图注明确真实初始状态，宽高为原件894×809。来源同时绑定应用发行摘要和截图所在源码/包/run/artifact，保留失败运行状态；不会把初始图当成实际内容保存、剪藏或时间统计成果。网页详情使用真实尺寸、正确替代文本和完整原图链接。23项受影响组件与514文件源码检查通过，浏览器最终媒体布局仍待实际新候选。

工具页返回按钮的黑色残留为 `:focus-visible::after` 顶部裁切，原生移鼠不能消除，记录为P2。最小修复只将该提示放在按钮下方并按文字取得宽度，继承原最大宽度、颜色和焦点环，不改变按钮、gutter、Tab顺序或并行导航。原生产流程的既有打开阶段增加真实Tab/Shift+Tab和320px几何截图；TOC/剪藏仅在已有真实授权/成功结果后增加截图，无新增授权或读取。原生结果出来前不关闭该视觉问题。

独立复审确认四张图片与原 artifact 逐字节一致，媒体来源与完整构建闭包成立。焦点测量按实际 `box-sizing` 加入伪元素 padding/border，并使用滚动容器真实内框作裁切范围；Tab后单独观察焦点已离开，再验证Shift+Tab返回，避免只凭初始焦点误判。

新增真实五秒超时观察，位于正常首次安装/使用之后：通过实际包脚本的唯一两参数handler调用，核对真实PROBE action/protocol及帮助页sender，只读观察后保持Worker暂停；HTTP页面自己的未修改计时器显示超时，不断言未安装。try/finally释放观察器、记录清理错误，再原生重新连接并核对安装/事务/意图/来源未变。它不是伪回复或组件timer，仍待实际Chrome原件；此前A1/A2运输错误不能算超时通过。A2等待浏览器提交同一精确review URL，hash防替换同时核对实际location，不以导航前旧标题通过。

## 主要闭环已取得真实证据，最终退出门禁与观察器整改

`93b63644` 的 [run 38225774632](https://github.com/shopable-ai/opendesk-browser/actions/runs/38225774632) 在 Linux 和 macOS 各完成15项真实HTTP检查，包括首次Markdown安装和实际预览、不同候选防替换、官网关闭后继续审阅、A1/A2/B/C四个中断窗口、原operation恢复、C恢复零次再写注册表、固定缺包、套装、baseline变化、笔记数据更新、标准demo授权/目录操作、卸载以及第一次正常Chrome重启后的数据核对。两份**最终结果仍为FAILED**：第一次正常关闭时的精确Chrome退出拒绝被原console门禁记录为错误，第二代Chrome最终正常关闭尚未执行。不能将15个分项PASS改成整套PASS。

`f8602601` 的 [run 38228139922](https://github.com/shopable-ai/opendesk-browser/actions/runs/38228139922) Linux完成16项，新增真实未修改五秒超时及主动重新连接；macOS完成前6项，真实超时分别在暂停后5095/5189ms首次由DOM观察到。macOS随后A2收到真实tabs.create回执并命中正确源码位置，但等待target消失超时；原事件有executionContextsCleared，旧驱动未保存本次version停止事件，不能事后补写执行已终止。Linux仍在退出console门禁失败。上述各轮原始JSON/TAP/构建输入无改写压缩、artifact下载SHA及边界见 [93原件](evidence/app-market-r5/ci-38225774632/index.json) 和 [f860原件](evidence/app-market-r5/ci-38228139922/index.json)。

两轮原生产包native均为`REAL_CHROME_FIXTURE_PASS`，三代Chrome全部正常退出且产品console/runtime错误为零；生产job仍因随后完整环境测试失败，不能把native PASS当job PASS。f860还取得真实返回按钮键盘提示几何与TOC/剪藏使用图。六个当前应用详情现均绑定真实原图：Markdown实际预览、笔记更新后数据、授权demo目录、授权网页剪藏，以及收件箱/时间回顾真实初始状态；图片来自失败run不使该run变为通过。原图总计276691字节，无生成或编辑图片。

本次整改保持原清理和错误门禁：新增`platform/chrome/lifecycle-errors.js`，只有明确的被动关闭阶段和精确Chrome退出错误转为“清理被中断”警告，原生gate仍要求固定入口、原生错误及同进程的真实正常关闭时间窗。新增反例覆盖未知阶段、其他错误、错误来源、跨generation、时间窗外和强制退出，均不能通过。安装日志与未知结果未改变。

Worker观察器补本次version事件、source/script/live uniqueContext身份、命中时重核、动态Target快照，以及目标复用时的同session旧unique拒绝/新unique正对照。只有真实旧context销毁后才能由已有HTTP连接按钮发一次PROBE唤醒，不能先解除旧断点或发新的安装请求来制造通过。安全独立审阅认可这条证明合同，**新候选真实复验仍待执行**。

UI补充：待核对批次的`reviewed`状态使用中文；未知安装提示明确不自动重试；完成提示解释“打开使用”和单独网站授权。网站连接文案去除重复前缀。窄屏及125%/200%真实缩放增加原生Tab到主要操作后的布局原件，超时提示也在原生键盘滚动可见后留图；DOM结果与屏幕可见性分别记录。

`32d27822`加本次未提交差异的本地check517、开发/生产build、双模式verify、独立站build均通过（6应用/12归档）。57项定向组件与95项市场组件通过。完整环境为1467通过/10失败/7跳过：9项受当前容器Unix socket/子进程限制影响；Node选择fixture又因当前运行二进制UID65534与进程UID0不符被原可信所有者策略拒绝。未放宽策略、未伪造socket通过，详见 [本地原件](evidence/app-market-r5/fix7-20261012/index.json)。

原CI的七项环境问题中，过时工具导航断言、异步摘要等待、浏览器Babel维护目录依赖已定向修正。main随后并行修复了Cloud宿主/选项卡及Page验证输出，直接复用；不重复替代新的验证合同。已核对并快进至`93c6b0d7`，保留Cloud Observer及Page/库/工具修改。工具区域断言改为实际DOM子树，同时保留并行增加的第六页断言；没有恢复旧导航。新候选的最终独立数值评分仍待源码和完整receipt绑定，既有历史设计分不是最终签定分数。

必须继续分级：原生错误ID无接收端不等于正确ID下独立禁插件profile；等待限流窗口不等于原生限流拒绝；官网关闭不等于断网；真实大容量写入不等于容量不足；A2/C调用者中断不等于Chrome API ACK丢失。严格字段全集、来源冲突/摘要/容量拒绝、TTL和限流等已有组件证据保留，未执行的原生注入仍标NOT_TESTED。正式HTTPS缺真实域名、发行ID、获取地址和部署条件，继续BLOCKED。

随后已快进至`2ca8f0c5`并保留第七项可选`cookie-editor@1.0.0`（并行作者明确为本地临时工作区，真实浏览器Cookie API尚未接入）。网站自动从原生产者增加应用；共享说明明确限制，不宣称真实Cookie管理，不借用其他工具截图。新增由原生产者生成的不可变快照`r5-20261012-cookie-editor-1.0.0.json`，当前合并为13个完整发行描述，reading-kit仍为原3个revision。未来修改此发行内容必须增加版本，不能覆写当前固定身份。原生首页从固定6改为逐个匹配实际包目录身份，原生产驱动增加该工具真实就绪和“临时工作区”提示核对；其余批量/预安装选择本已由当前目录驱动。独立证据审阅另指出组件仍固定六项，已改为逐项对照唯一源码登记，同时完整保留r1/r2/r3成员断言。

## FIX8：连接唤醒观察必须取得本次真实回执

FIX7 已于 2026-10-12 09:53 UTC 以 `13afc33f62f606fe8edf39124ebeb4acf0c89f60` 正常推送 main；对应 [run 38232767659](https://github.com/shopable-ai/opendesk-browser/actions/runs/38232767659)。最终独立安全复审发现一个证据 P1：观察器在调用唤醒 callback 前已保存 truthy 标记，callback 抛错可被通用等待器吞掉，后续又可能读取旧 CONNECTED 文案。不得用该候选的目标复用分支签定最终验收；其他不受此路径影响的真实阶段可按输入复用。

FIX8 将主动观察失败变成不可重试的结果并在外层立即抛出，保存 `NOT_OBSERVED`、原始错误及完整 DOM 转移。成功标记只在实际 callback 完成后写入。网站客户端是 ES module；没有猜测读取模块局部变量，也没有增加产品测试接口。临时只读观察器要求同一个真实 HTTP 页面恰好一次 `isTrusted` 点击、按钮禁用且显示“正在连接”、再恢复可用并取得新 CONNECTED 回执；旧文案、非可信点击、导航、超时、缺少中间状态全部拒绝。真实按钮点击仍走原有限 PROBE，未修改 sender、按钮状态、产品响应或安装存储。

新增组件分别验证回执拒绝条件和失败不可被下一次“目标已消失”覆盖；它们只是观察器组件证据，不能替代 Mac/Linux Chrome 新候选复验。原运行失败记录与 FIX7 原件继续保留。已检查并正常快进至 `7aac9968` 的并行 Page/浏览器 SDK 文件，未与本轮写入文件重叠。


## 最新主分支重新验收：Service Worker target 与实际执行分离

在既有双平台 PASS 候选 `3744be08` 后，其他工作流修改了 Worker 定时唤醒、Sidebar Tool Browser SDK 能力及 UI。必须遵照上方 `AFFECTED_INPUTS` 重新验收。新候选 [CI 38250231218](https://github.com/shopable-ai/opendesk-browser/actions/runs/38250231218) 发现：

- Linux R5 原生到 `r5-worker-stop-and-http-cold-reconnect` 之前的官网首装、真实 5 秒超时、A1/A2/B 中断等阶段已经执行；在 `actual prior worker target ended` 上超时，原验收仅等待 `Target.closeTarget` 后原 DevTools target ID 消失。**整轮失败**，不能把已运行阶段等同最终 PASS。
- macOS R5 同次候选 Job 通过；两平台行为差异说明不能用目标 ID 生命周期代表 Worker V8 执行生命周期。
- 生产原生生命周期本身仍 `REAL_CHROME_FIXTURE_PASS`，但完整环境回归出现两项 jQuery／Page 框架指令测试失败（`builtin-jquery.test.mjs`、R24.2 opt-in 合同）；属于并行 Page/公共库输入变化，保留原件、由对应工作流核对，不通过删除断言或改变 R5 来源/权限来消除。

本轮对 `tests/helpers/app-market-r5-native.mjs` 的冷重连验证作最小重构：Chrome 的 `ServiceWorker.stopWorker` 只能指定当前真实 running version ID；成功后必须观察同 registration/script 的真实 `stopped` 事件，再核对原 target 确实消失，或同一 session 下旧 V8 uniqueContextId 已销毁且 `Runtime.evaluate` 返回精确 `-32602 uniqueContextId not found`。同时保证 HTTP PROBE 之前没有新的 running 版本；随后官网真实连接按钮动作唤起 Worker，验证新旧 uniqueContextId 不同、原 intent/review/operation 身份一致。保存 stopped event、上下文和 target 快照；不自行替换 browser sender、模拟 Worker 响应、直接写安装库或忽略失败。此修改必须由**下一次真实 Linux/macOS Chrome CI**确认，在取得完整原生收据前不能改写为 PASS。


## 新 main 对 Worker 与 SDK 修改的 R5 影响复验（2026-10-12）

受验候选 `6d71854b49fc2fcbace0047b8703b9c2c154211b`，原始 [Actions run #38262192082](https://github.com/shopable-ai/opendesk-browser/actions/runs/38262192082)。与首次 R5 成功候选 `3744be08` 分开记录，绝不跨包混用哈希。新候选继承定时任务 Chrome Alarms 与 Browser SDK 扩展等并行改动，R5 此轮不是重新建立市场安装服务。

| 执行 | 当前结论 | 受验输入和明确证据 |
| --- | --- | --- |
| Linux CFT 155，官网到扩展真实安装 | **PASS**，16/16 原生专项、98/98 组件；来源拒绝 8 项、四个中断点 A1/A2/B/C、笔记更新数据保留、固定套装、网站单独授权、卸载和两次正常 Chrome 退出 | job `114855249892`；开发扩展 ID `nmeilgnolfnnlopgjoijdafbkelekcbj`、包 hash `23ed7262d092e29c903e175c837d669ced84aa0be06ac55780131549d35d3e0b`；`native-result.json` SHA-256 `8c3c0c88cc22d72c11d92fc7f2961af924154c50f218399adc117ad742646fc2` |
| 本轮 Worker 真实停止再连接 | **PASS**。原生 `ServiceWorker.stopWorker`，匹配 running-version ID、stopped 事件和原 target 消失或原 uniqueContextId 实际失效，随后官网真实 PROBE 恢复；没有伪造 sender 或重复写安装表 | 该 Linux 原件 `r5.workerRestart`：本次走 `physical-target-absent`；目标 ID 不消失时仅接受严格上下文身份反证；相关修复 `52b7c9b3` |
| 生产包 Chrome 安装、权限、两次重启、卸载和环境回归 | **PASS**，`REAL_CHROME_FIXTURE_PASS`，原生生命周期 13 阶段、正常 Chrome 退出 3 次、环境测试 1634 PASS／0 FAIL／7 SKIP | job `114855249452`；扩展 ID `jhajepcnohiplmafaiokjlcagcfjgaap`、包 hash `3d2f3031376e1fc7c136bb4e60182824b377f933b395a4f412f73fe5b239fdfd`；原始结果 SHA-256 `ce5fc5828b201b6ff5d813004bce647584456b620a76f334c60228f178c4d36d` |
| macOS 15 CFT 155，官网到扩展真实安装 | **PASS**，16/16 原生专项、8 项负面拒绝、A1/A2/B/C 四个中断恢复与 Worker 真实停止后重连；0 次安装表重提交、2 次正常 Chrome 退出 | job `114855249827`；实际扩展 ID `oibdecbpklpnlljpiolnkgpohmpflnmj`、包 hash `c7ed813e6412f4ebb2976694c5798f9089ee7303b2e161adcffb6ddff3896bea`、站点 build ID `ba4c16d2de8ddea656e0bde112e2f4aea009218f8c5c3e79f052ee67542ccec8`；原始 `native-result.json` SHA-256 `f236b360effb8bbdfe54c6550d5b8eccd8122850b00419b32651f3331267c86b` |
| 正式 HTTPS 实际安装 | **BLOCKED**，生产默认关闭外部通道 | 缺正式域名/Origin、Chrome Web Store 发行扩展 ID、经核验的官方获取 URL、部署访问权限；必须以真实线上 Chrome 验收 |

这批 Linux/macOS 原生页面均源于 `http://127.0.0.1:43132`，受控目录 SHA-256 `80bd653266e4c378ffd8b372fd12dc0f5c9a9d53f8617296c99e7e9bd98f302c`；网站 build ID `0526637ef3accd46a6c150e0d3f4d6eeefbbec36941a06700b161af6a80025f5`、59 个产物。真实恢复期间观察到 **0 次工具安装注册表重新提交**、未解释 runtime exception 和 console error 均为 0。**两平台分别**有 23 项布局、4 次真实浏览器缩放、101 条键盘操作记录；真实用户网站按 Chrome 浏览器提供的扩展 ID 而非固定开发包 ID 连接。

上一轮生产全环境的 jQuery 声明与多库错误码失败，已经通过其对应公共库工作流修复与本候选绿色结果关闭；市场没有另造依赖解析器、破坏多库 API 或删除失败测试。原失败仍留在旧 run。较早 Linux CI 因 Chrome 保留 Worker target ID 而失败，修复后现在以真实 version、V8 context 和 HTTP 网站现有 PROBE 实测。

[机器可读原始证据索引](evidence/app-market-r5/ci-38262192082/index.json) 同步绑定 commit／job／原件路径与 SHA-256／包／网站 ID／原生检查／未测试项，Actions Artifact 原始 ZIP 有 GitHub 保留期限，索引不假装 ZIP 永久可获取。

**复用限制与单项评分：** 当前候选已执行的定位架构、UI、UX、安装、来源安全、隐私、固定发行、开发 HTTP 部分沿用上文有来源的设计/实现评分（分别 ≥95）；兼容性能维护仍是设计 96／实现 94，恢复与真实验收完整性仍是设计 97／实现 93，正式 HTTPS 是设计 95／实现待评 BLOCKED。不得用本次 Linux/macOS 或生产包 PASS 自动把这三项改为 ≥95。新的 `main` 如修改 Service Worker、工具包准入、权限、官方目录或测试观察器，先按测试指南核对具体变化，再判 `AFFECTED_INPUTS` 并只对受影响路径补验。

仍须原生验证：浏览器 `tabs.create` / `storage.local.set` API **本身 ACK 丢失**（区别于已测调用者中断）、真实配额不足与损坏包、完整 30 分钟 TTL、Worker 自然空闲关闭、用户自己的 Mac Profile 与正式 HTTPS。远程 Page、sandbox、Task 整包分发另需签名信任根/撤回/密钥轮换/各类型准入，不在 R5 扩大网站消息能力。

