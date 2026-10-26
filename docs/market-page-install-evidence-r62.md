# OpenDesk Browser R6.2 — 应用商店网页安装回归证据（增量）

日期：2026-10-26。仓库：`shopable-ai/opendesk-browser`，唯一修改分支 `main`。

## 原始目标（不另起一套）

复用 R5 的 `opendesk.market.intent.v1`、`PROBE / OPEN_INSTALL_REVIEW`、
可信审阅、原 Installer 与 Installed Authority。让用户在独立网页找到固定发行的
`markdown-workbench`，在可信扩展页确认后安装、打开、使用和保留正确状态。
普通网页的 `rel="opendesk-install"` 只是一条只读线索，不能从网页绕过权限审阅。

R6.1 已有市场首页 CTA、真实声明、`src/marketplace/discovery.js`、
扩展中心 React 上下文发现和既有原生 Chrome 测试。**不得重新开发第二个安装器、
Host、安装库或网页扫描体系。**

## 已实施的最小回归修复（以上游提交为实际证据）

1. `4eddaa04c5d804c30308ad95f8f441d2ba5c13a5`：
   `src/marketplace/discovery.js` 从 `link[rel][href]` 改为 `link[rel]`；
   缺少 href 的同名 rel 声明仍占用一个声明名额，杜绝与有效链接共存时误判唯一。
2. `4fe527ef2df55deb8c89d342c0911a2e6296e686`：
   在原 `tests/environment/market-page-discovery-r61.test.mjs` 增加对应组件回归。
3. `039937ca0996624069161ce9c40da29374c0f497`：
   `src/market-site/market.css` 从 R6.1 中误写入的 `undefined` 恢复原 R5
   7,186 字符单行市场样式（源自 `ac559863...` 的真实提交差异），再保留 R6.1 CTA
   补充规则；修复后读回为 7,616 字符，含完整 header/card/grid/详情/响应式规则。
4. `f5404eda3658950a9e0a6213b38c82ba3f85b90d`、
   `587de8f1d1a019785ca1e326bcc2b018a5c8b37d`：
   增加并修正 CSS 完整性测试，防止再次把样式表替换为字面量 undefined。
5. `0ca391d39d40af4fa8105acf87584b283418e659`：
   原 `tests/helpers/app-market-r5-native.mjs` 增加实际 HTTP 详情页的**唯一固定
   版本** link 断言与收据，并把首页测试断点扩展到
   320 / 360 / 400 / 440 / 520 / 960 / 1280px，不增加独立测试框架。

上述是**提交与远端源码读回**证据，不等于执行所有测试。

## 上次在线环境的历史状态（被下方本机实测增量更新）

| 检查项 | 本轮证据与状态 |
| --- | --- |
| 上游实际分支 | GitHub `main` 读回，补丁最新确认 `0ca391d39d40af4fa8105acf87584b283418e659`（后续以最新 HEAD 为准） |
| 正式源码 | 已读回修复文件的 Git blob；`EXISTING / PATCHED` |
| 扫描函数局部行为 | 执行从当时 GitHub 源码抽取的无特权函数，`[有效 href, null]` 返回两条声明；`MICROCHECK_PASS`，非完整项目测试 |
| 预设市场 CI | `40321189250` 的三个作业在本轮查验时均为 `queued`；`CI_QUEUED`，不标 PASS |
| `node --test` / `npm run check` / `npm run build:dev` / `npm run build:market-site` | 当前执行环境没有仓库工作树，`NOT_TESTED`；由已配置的 CI 执行 |
| 原生 Chrome 路径 A：市场首页 → 可信审阅 → 实际安装 → Markdown 使用 | 原测试代码已存在，本轮补充声明与断点；**本轮未运行**，`NOT_TESTED` |
| 原生 Chrome 路径 B：普通网页声明 → 扩展发现 → 可信详情 → 安装 | 组件与源码存在，但仍缺本轮实际 Chrome 收据；`NOT_TESTED` |
| Mac 用户本机 Chrome 持久化安装、卸载、重启 | `LOCAL_CHROME_NOT_TESTED` |
| 正式公众 HTTPS 来源 | `src/marketplace/channel-config.json` 的 production origin/extensionId/acquireUrl/verifiedAt 均为 null；`BLOCKED`，不得用开发 HTTP 配置替代 |

## 历史续接建议（以最新阶段为准）

先查最新 `main` 和真正新产生的市场 CI；若出现 FAIL，下载日志定位第一个
失败断言并最小修复。若 CI 全通过，核查官方构建 Catalog 内的
`markdown-workbench` 固定版本与摘要、核对 native receipts/screenshots，
再执行普通网页路径 B 的独立真实 Chrome 证据；最后才是用户 Mac 本机 Codex
安装、交互、恢复和持久化验收。直到全部 P0 门槛有收据，不宣布 95+ 正式交付。

## 2026-10-26 Mac Codex 实测增量与最新范围

**用户最新纠偏：只需用 1–2 个扩展验证核心可用性，不再大量测试所有扩展，
不反复打开 `http://127.0.0.1:43132/` 造成窗口闪烁。** 原先七环节完整验收、
全应用回归、长时间 TTL、完整独立评分均延期；不能因历史 GOAL 自动恢复。
用户已要求创建新对话继续完善。本节是同一证据文档的增量，不另建交付账本。

### 候选与去重

- 开始时从远端 main 快进到 `642e3151abfa7ae6c90c5cc9662c73beacbbb119`。
  收尾上次观察本地 main 为 `abfe0fcf9891df9e616eed33259b63bc72f08c3b`，
  中间两个并行提交涉及 ai-scroll 与发送队列包。开始新工作时重新只读核对。
- 交接时市场改动**尚未提交/推送**；上述 base SHA 不包含本轮修复。
  续接收尾见文末，提交身份以包含该节的 Git 提交及交付消息为准。
- discovery Git blob `2989cb6040ecfce7b394c0a1065ea08bc92b10d2` 与既有修复一致；
  市场 CSS blob `aa10c56b90c047ebffa43a4d172573b8c5b3ea26` 与恢复补丁一致，未重复修改。
- 日常 watcher PID 79949 保留，未覆盖根 `dist/development`。
  构建使用 `artifacts/app-market-r62/source-snapshot/` 的普通源码快照，非 Git worktree。
  这是独立静态验收候选，不是日常持续开发加载路径；使用真实源码和原构建器。
- 开发候选 packageHash：
  `7600bc90b6da8768251fe01deb8d6303b18d77633af886fd11e19f27e3a85b43`。
  production 候选：`4d918fb690e3a3bd7ebdf7d835a486e30ac07caed01bac3899db4b64a17a7ea3`。
  市场 siteBuildId：`a874d8e26029f7439c35ae42a1ffda35d3de1d1544eb9b83034437ad6236f470`。
- Markdown 工作台真实正式包：1.0.6，31,179 bytes，SHA256
  `1aed08cfd862d7affe56928f3698d05e61109b31d107a575e070c70a3214253b`。

### 本轮修复及验证边界

1. reading-kit 最新 revision9 固定成员落后于当前官方 Catalog，实际预检没有可安装条目。
   新增不可变 revision10，固定 reading-toc 1.0.11、web-clipper 1.2.9、quick-notes 1.1.10，
   保留 revisions1–9；补齐 revision9 历史索引，reading-toc 1.0.10 的字节/摘要来自原 Git 制品。
   不把历史发行静默映射成最新版；网站仍报告三个缺失历史引用，未伪报可安装。
2. 现有测试驱动按当前 React 入口、Quick Notes 列表优先界面、来源冲突及默认安装策略修正。
   CI 在 `npm ci --ignore-scripts` 后运行既有 pretest 生成可信资产；未新增测试框架。
3. C 中断断点先前因只读观察器在 map 回调读取外层变量得到 ReferenceError；
   改为验证真实立即调用帧后读回局部数据。未改 Installer、存储返回值或安全条件。
   原失败收据保留，后续 `native-final8` 才是通过证据。

### 已完成的真实证据

下列路径均相对仓库；原始日志及截图在本机 ignored artifacts 中，尚未上传为 CI 产物。
收据中的 commit 是源码快照 base；候选身份还须结合以上 packageHash 和本轮未提交 delta。

| 范围 | 实际结果及证据 |
| --- | --- |
| 市场组件 | `artifacts/app-market-r62/components-final-candidate.tap`：117/117 PASS；相关 host/driver 组 `drivers-final.tap`：156/156 PASS；观察器定向 `observers-final.tap`：8/8 PASS。分组重叠，不相加宣传覆盖率 |
| 源码与构建 | `source-check-final.log`：1149 项检查 PASS；`build-development-final.log`、`build-production-final.log`、`build-market-site-final.log` 及 `verify-final.log` PASS |
| 路径 A 市场网页安装与使用 | `native-final8/native-result.json` 和 `native-final8.tap`：`REAL_CHROME_MARKET_R5_PASS`，22 checks；真实 HTTP → R5 sender/document 校验 → 可信审阅 → 明确确认 → 唯一安装读回；Markdown 编辑、预览、真实 UTF-8 文件下载通过 |
| 路径 B 普通网页声明 | 同一 `native-final8/native-result.json` 的 `r5.pathB` 独立记录 11 项 PASS：非法/重复/缺 href、错误版本/来源、声明改变、导航和切换活动标签使旧结果失效；实际点击 React 发现入口进入固定版本详情并确认安装，安装/权限读回通过 |
| 安全与恢复 | 同收据 A1/A2/B/C 均 PASS；错误来源/端口/iframe/字段/扩展 ID 拒绝、独立 intent、未知结果不自动重放、基线变化需重审、停用销毁沙箱、恢复后需显式打开，以及正常 Chrome 重启后笔记数据持久化通过 |
| production 无通道 | `native-production-no-channel/native-result.json`：`REAL_CHROME_MARKET_R61_NO_CHANNEL_PASS`，仅五 Tab、无可信通道时发现入口隐藏且无安装写入。不能等同 production 全生命周期 PASS |
| UI | 真实源码生成的 HTTP 页面执行 320/360/400/440/960 等宽度、深色、200% 和键盘检查；截图在 `native-final8/`。存在阅读目录浮层遮挡，不宣布 UI 全面 PASS |

以上是隔离 CFT 155.0.8059.39 的真实 Mac 浏览器证据；不是用户个人日常 Profile 的安装验收。
路径 A/B 主流程已经真实成功，不是仅有组件 Mock。CDP 下载以 GUID 命名文件，
内容真实完成；普通 Profile 的建议下载文件名仍未验证。

### 仍未通过、未验证与延期项

- CI：原运行 40321189250 实际两个作业失败（已保存原始日志），不能继续称全部 queued。
  最近核查市场运行 40328292202，head `163ce268d3a42394cebb45d91b62e25ec321fddd`，
  当时三作业 `CI_QUEUED`；续接只读重查已变为两个失败、一个排队，详见文末。
  没有包含本轮 delta 的 GitHub PASS。
- 全仓环境测试 `environment-final.tap`：6594 tests，6281 pass / 287 fail / 26 skip；
  多类旧断言、独立功能/来源 pin、fixture 和尚未分类行为失败，不能标全绿。
  一个 owned trusted-settings 用例挂起超过12分钟后终止，记 HARNESS_TIMEOUT/INTERRUPTED。
  `environment-failure-triage.json` 是分类线索，不是全部无关的基线证明；本阶段不扩修全仓。
- production 全生命周期原先因 Quick Notes 旧选择器失败；production 段驱动已有未提交调整，
  **尚未重跑**。按最新范围延期全13应用原生验收，不据此重新打开大量窗口。
- 真实30分钟 TTL 在约18分钟时按用户最新范围停止，`NOT_TESTED`；
  不修改时钟或把等待时间当通过。停止记录 `user-scope-stop.json`。
- 正式 HTTPS 通道仍缺 production origin/extensionId/acquireUrl/verifiedAt，
  `PUBLIC_RELEASE_BLOCKED`。检测进行中导航竞态、在途撤权、原生 ACK 丢失等高级验证延期。
- 独立阶段性评分：UX 86、源码实现94、安全91（各100分）；自动化和真实安装维度
  独立评分尚未完成，综合 `NOT_SCORED`。不计算缺项平均、不宣称95分交付。
- 全部本轮测试已停；两个残留专用 CFT 通过 Browser.close 收尾，43132 无监听。
  日常 watcher 79949 及其他对话浏览器/服务保留。新 owner 开始时先重查归属。

### 新阶段下一步

先读取本节与最新 main/diff，继承 `native-final8`，**不重复两条已通过的安装链**。
只处理用户可见的核心完善事项：优先核对市场浮层遮挡是否仍是实际操作阻塞，
有真实失败才在对应 owner 范围最小修复。需要浏览器时单实例、一个市场窗口，
只以 Markdown 工作台（至多再一个辅助扩展）执行一条必要操作。
整理本轮未提交市场文件及证据，安全提交 main；保留其他对话修改。
不为交接、评分、旧 CI 队列或历史清单恢复全量构建/全应用测试。

## 2026-10-26 续接收尾：仅修复详情页安装入口遮挡

### 已继承的核心结果

开始时只读确认 main 为 `abfe0fcf9891df9e616eed33259b63bc72f08c3b`；
`native-final8` 的结果、packageHash、路径 A 的 22 项与路径 B 的 11 项记录均仍存在。
当前 Catalog 和新增 revision9/revision10 归档与该候选源码快照逐字节相同。
直接继承网页安装、可信确认、Markdown 编辑/预览/导出的真实结果，未重复两条安装链。
提交前远端 main 已推进到 `e75abfc29c2c8fa4a6b1daabff15b174db1ab792`；
确认新增 Cookie Editor / ai-scroll 提交与市场文件路径不重叠后安全快进。
没有重建候选；上述收据继续只证明其原 packageHash，不代表最新 main 的全量构建。

### 此次实际修复

既有默认 1280px 截图 `native-final8/r5-web-detail-1280.png` 已显示：
阅读目录浮层遮住 Markdown 详情页右侧安装按钮的一部分，不只是缩放专项问题。
只调整 `src/market-site/market.css` 的详情页头布局：安装入口放在标题、说明与版本
下方，使用原 Token 间距及最大 380px 的按钮区域。应用和套装详情沿用同一规则；
本次实际检查对象仅 Markdown。保留原按钮、固定版本与交接逻辑，不改 TOC、Installer、
Host、Authority、权限、存储或正式工具包。

### 最小验证与身份

- 既有布局合同单项：
  `node --test --test-name-pattern='market layout stylesheet' tests/environment/market-page-discovery-r61.test.mjs`
  1/1 PASS。继承的 Catalog/测试驱动 15 个 JS/MJS 文件仅做 `node --check`，全部通过；
  记录为 `artifacts/app-market-r62/layout-core-only/syntax.json`，不代表 production 驱动已实际运行。
- 仅一个专用 CFT 窗口、一个 Markdown 1.0.6 详情页，正常 1280×817 CSS px、默认缩放；
  这次浏览器为 **Chrome/156.0.8078.4**，与先前安装链的 CFT155 证据分开。
  复用已有静态开发扩展及市场 HTML，由专用 HTTP 服务提供本次源码 CSS；没有重建扩展或市场。
  扩展路径为 `artifacts/app-market-r62/source-snapshot/dist/development`，
  ID 从本次专用 Profile 配置读回为 `akemjkicedgjbpggpoalhndinmkiglof`；
  扩展 packageHash 沿用 `7600bc90b6da8768251fe01deb8d6303b18d77633af886fd11e19f27e3a85b43`。
  这是隔离静态开发候选，无日常 serve 连接验收；日常 Chrome 配对状态仍未核实。
- 新 CSS SHA256：`a6d8e70e9a87621423e23f462c1b74fe200d36680cdfbea5532c469c26180042`。
  这次输出为旧 siteBuildId 加该 CSS 的局部组合，**不是**重新构建的完整市场或 production 包。
  按钮范围为 x=72–452、y=366.53–409.63，阅读目录挂载节点范围为
  x=1014–1268、y=122.55–279.59；两者不重叠。按钮四角和中心均命中原按钮，
  已启用、完整位于首屏、页面无横向溢出。此观察证明当前安装入口布局，未点击安装。
- `artifacts/app-market-r62/layout-core-only/receipt.json`：
  `MARKDOWN_DETAIL_CTA_LAYOUT_PASS`，`installActions=0`，浏览器正常退出；
  `markdown-detail.png` 已人工查看，按钮文字与操作区域完整可见。
  本机 ignored 收据/截图仍未上传，不宣称远端可下载。
- 本次专用服务已关闭，43132 无监听；日常 watcher 79949 保留。
  无全应用循环、全仓测试、TTL 等待、宽度/缩放矩阵或评分追加。

### 提交与延期边界

本节与继承的 19 个市场文件及新增 CSS 改动一并提交 main；只包含明确移交的文件，
并行 ChatGPT/发送队列等改动保留给原 owner。提交采用 `[skip ci]`，避免这次普通推送
重新触发已延期的全应用原生循环和全仓回归；不是新 CI PASS。

只读重查 GitHub 运行 `40328292202`：Linux HTTP 作业 `121590638662` 与 production
作业 `121590638809` 均在组件步骤失败，macOS 作业 `121590638966` 仍排队。
不因此下载更多日志、修复全仓或恢复完整验收。
production 全生命周期驱动调整仍未实际重跑；全13应用、真实30分钟 TTL、个人日常
Profile、正式 HTTPS 发布通道、高级竞态及完整评分继续延期。
`PUBLIC_RELEASE_BLOCKED` / `NOT_SCORED` 不变。当前核心完善已收尾，停止本轮测试。

## 2026-10-26 HTTP 手动安装入口与测试窗口配对

本轮目标：从 `http://127.0.0.1:43132/apps/opendesk/web-markdown-clipper/`
发起一次真实网页剪藏 v1.2.9 安装，网页按钮自动交接到唯一可信扩展确认页，确认后
读取实际安装结果。用户无需手动输入 `chrome-extension://`；该地址只是扩展审阅页的
内部位置。网页回执仍只表示审阅页已打开，不冒充安装成功，不另建网页安装器。

### 已复现原因与环境边界

- 用户报错页属于 CFT154 `test-chatgpt-profile`，其已装扩展真实 ID 为
  `ajjjgoapcaonglplhlnlfofmlemdakhk`，位于 Send Queue 独立源码快照。
  HTTP 市场的目标 ID 则是 `ccfcjegpkdlgbclopjmadlcjedelidmf`，二者不同。
  该旧测试包 `marketplace/channel.json` 又保留了第三个构建 ID
  `enjolfckminhfloidmjogjdiohdlbkfm`，不能仅改网页目标便宣称该包配对成功。
- 正常开发窗口为已加载本仓库 `dist/development` 的 CFT155.0.8059.39，
  实际扩展 ID 与市场目标均为 `ccfcjegpkdlgbclopjmadlcjedelidmf`。
  只复用现有开发产物与 watcher，没有重建、复制或重装 Chrome 插件。
  市场 PROBE 可用不等于额外验证过 WXT serve 客户端的热更新连接。
- 收到 Send Queue 协调消息后，已释放其 CFT154 Profile 的 UI 操作；保留
  PID54791、Profile、扩展路径和快照，不修改它的安装状态或输出。
  此后停止所有 CFT UI 操作，避免同 App 的 AX 索引并发失效；未回信或操纵其他对话。

### 实际修复与关键测试条件

1. **HTTP 是入口**：安装帮助明确网页按钮 → 自动打开可信确认页 → 确认安装 → 打开使用，
   不要求用户粘贴扩展 URL；本地帮助显示市场目标 ID，说明独立窗口/个人资料的区别。
2. **可定位连接失败**：原有 `E_NO_RECEIVER` 改为说明本窗口未连接市场指定的扩展，
   连接技术信息包含目标 ID；初始连接失败也能看到技术信息，而非只在点击安装后显示。
3. **重新连接真正刷新配置**：重新读取 `/channel.json`，仅发 `PROBE`，不会自动重放
   安装请求；单次发送绑定其已验证配置。关闭的新通道不得回退到缓存旧 ID 发起安装。
4. **真实安装结果**：保持原 Sender/Origin/Document/扩展身份验证与可信安装确认链，
   不自动扫描其他扩展 ID，不放宽来源，不把网页交接回执变成“已安装”。

### 本轮最小证据

- CFT155 已从上述 HTTP 详情页点击「在 OpenDesk 中审阅安装」，自动打开
  原可信审阅页；核对网页剪藏 v1.2.9 后确认，实际界面显示
  **「已核对本机安装：v1.2.9。安装不会自动运行。」** 与 **「打开使用」**。
  reviewId 为 `751b740a-0a0a-4a31-abea-ce6d23590f64`。
  此观察发生于连接文案/重连改动之前；安装链本身没有改动。
- 新增连接恢复、关闭通道拒绝旧缓存、HTTP 入口帮助三项测试，加原有固定请求/重复点击
  定向测试，共 4/4 PASS；三个受影响 JS/MJS 语法检查通过。未运行全仓测试。
- 仅重启本对话自有 HTTP 市场服务，使修改后的 client/help 可供刷新访问；
  新 siteBuildId 为 `308056d7b0e836df6ef92a7133ed99390f52282d8292c5dde9cdff3dfe4d3c84`。
  HTTP 详情页、帮助页、通道和客户端均返回 200，服务中的客户端与源码逐字节相同，
  SHA256 为 `67e76b6a4bfb8faec3f4fb8b1a5744003d602a9e1d40c52a1fb9548bad58a1d0`。
  服务保留在 `127.0.0.1:43132` 供手动使用，日常 watcher PID79949 保留。
- 本机记录：`artifacts/app-market-r62/http-manual-install/receipt.json`。
  新提示/重连为组件与 HTTP 验证；协调释放后未再做浏览器 UI 复验，不能写成新 UI 原生 PASS。
  正文采集、额外网站授权、全应用、全仓与 production 验收均未执行，不扩张为本轮目标。

## 2026-10-26 R6.3 独立分发与最小可信确认窗

本轮进一步完成的核心操作是：主扩展具备一次通用安装能力后，HTTP 市场可新增不在
扩展内置 Catalog 中的 Sidebar Tool，并发布其新版本；用户从 HTTP 详情页直接打开
简洁可信确认窗，确认后经原安装器安装、打开原沙箱应用。无需先浏览完整扩展市场。
前节网页剪藏证据只证明内置应用交接，不能替代本节的独立新增与升级证据。

### 实现与发行输入

- `scripts/build-market-site.mjs` 接受 `buildMarketSite({env, projects:[项目目录,…]})`，
  CLI 通过 `OPENDESK_MARKET_PROJECTS` JSON 数组传入；开发服务支持同一环境变量。
  同一应用多个固定版本需要同时提供各版本源码目录。构建复用原 Sidebar Tool 打包器，
  生成 `/releases/<marketId>/<version>/descriptor.json` 及规范 JSON 安装包；不会修改
  扩展 Catalog、源码或 `dist/development`。相同 ID/版本而字节不同直接拒绝并保留原输出。
  只有历史元数据、没有包字节的版本继续显示为不可安装。
- `src/marketplace/distribution.js` 只信任扩展编译配置中的市场 Origin 与扩展 ID，
  从确定路径取得固定版本描述与包。核对精确字段、ID/版本、字节数、SHA-256 和规范
  序列化字节；拒绝重定向、任意下载 URL 和超限资源。市场页面不能把包代码交给可信世界执行。
- `src/marketplace/install.js` / `market-install.html` 展示来源、版本、本机版本、能力及
  新增能力；确认时重新核对同一包，复用 `installReviewedSidebarTool`、原意图/操作日志、
  来源/基线检查及数据保留机制。未知结果只恢复核对，不自动重装。打开使用进入原工具沙箱，
  并聚焦所在窗口。套装仍沿用原完整市场入口，本节独立分发范围为单个 Sidebar Tool。
- 网站 `GET_INSTALL_STATUS` 只返回有限状态；“已安装”须核对本机版本、包哈希和来源记录，
  有操作日志时还须核对该操作成功。网页交接成功不能冒充安装成功；刷新查询不会重放安装。
- 新确认文档加入既有安装兼容探测/清理入口的精确路径白名单。Stay Focus、Managed Site
  和计划清理继续核对真实扩展、活动文档、顶层 Frame 与 Tab；不授予确认页业务修改能力。

本机演示构建命令（这些目录为 ignored 临时验证输入，不是正式示例发行包）：

```sh
OPENDESK_MARKET_PROJECTS='["artifacts/app-market-r63/independent-project","artifacts/app-market-r63/independent-project-v2","artifacts/app-market-r63/independent-project-v3"]' node scripts/build-market-site.mjs
```

### 核心原生证据与候选区分

- 复用正常 Chrome 应用，新建隔离资料 **OpenDesk Market R63 Test**，加载固定路径
  `/Users/shopme/Documents/workspace/opendesk-browser/dist/development`，真实 ID 为
  `ccfcjegpkdlgbclopjmadlcjedelidmf`。这是持续开发产物，原 watcher PID79949、端口43119
  保留；构建 Source Map 的对应源码已核对。`development-update.json` 标记仍陈旧，
  未据此宣称自动热更新连接或所有窗口已更新。
- 临时应用 `market-install-demo` 不在冻结扩展的 `official-tools/catalog.json` 中。
  从 `http://127.0.0.1:43132/apps/opendesk/market-install-demo/` 选择 v1.0.0，
  HTTP 按钮自动打开 `/ui/market-install.html?intent=1464203d-5743-4636-8abe-1b1ab12957f5`；
  确认后实际读回 v1.0.0，打开沙箱计数器，计数从0增加至1。返回网站显示已安装。
- 随后只更新市场发行输入到 v1.1.0，HTTP 按钮打开升级确认，intent 为
  `74c2672f-16c7-4c15-b405-6e4b4f969ccb`；显示本机 v1.0.0、无新增能力并保留数据。
  确认后打开实际 v1.1.0 沙箱，计数仍为1，点击后变为2。
  **上述新增安装至独立升级期间，扩展全部167个文件指纹一致，changedFiles=[]**；
  记录指纹为 `3a1b00ec1187b332f890e15b44b160ba8859ec430feb983918cd36ce1ca26eff`。
  证据：`artifacts/app-market-r63/host-before.json`、`native-receipt.json`、
  `native-confirmation.png`、`native-site-installed.png`、`native-v2-open.png`。
- 上述观察发现“打开使用”会让应用标签留在确认小窗后方。补上窗口聚焦，并补齐 Stay Focus
  精确只读探测路径后，仅在本轮独立资料重载开发扩展，复验 v1.1.0→v1.2.0。
  HTTP 自动确认 intent 为 `9edda8ed-fca5-438c-9c92-8f3c350f3023`，本机读回 v1.2.0；
  点击一次打开使用，无需点击完成，应用窗口直接前置，沙箱显示 v1.2.0，原计数2保留。
  此次最终交互证据独立记录为 `native-final-receipt.json`、`native-final-v3-open.png`。
  最终复验期间共享 watcher 另更新了 `ui/tool-shell.js` 及其 Map，故此段不宣称全包冻结；
  市场安装 JS、SW、Manifest 和 Catalog 的前后哈希一致。不能将前一候选的全包指纹
  冒充最后两项修复后的指纹。
- 当前 HTTP 服务仍在 `127.0.0.1:43132`，最后市场 siteBuildId 为
  `d12cdb4a87739d62642985dca5e84118630777013bd77f7e3f3dc0909146e6ed`，包含演示3版本。
  原日常资料运行旧缓存 Worker 的现象已记录，未强制重载其活动任务、草稿或 Native 连接；
  因此当前完整原生证据属于上述独立资料。CFT154 / Send Queue Profile、PID54791 继续保留。

### 定向验证与本轮边界

- `market-dynamic-install`、`market-dynamic-site`、`market-site-client-r5`、
  `market-page-discovery-r61` 四文件24/24 PASS：覆盖非内置 ID/版本发行、固定身份与摘要、
  来源/重定向/大小拒绝、同版本冲突保护、简洁窗口、真实结果查询及不重放。
- 原 R5 意图/Sender/去重/恢复及共享安装器相关定向项12/12 PASS。
  更新后的独立网站构建断言验证实际分发包的字节与摘要；其定向项 PASS。
- 新确认入口的计划清理准入1/1、Managed Site只读探测1/1、Stay Focus新旧入口只读探测
  2/2 PASS；仿冒路径、过期文档、错误身份/Frame以及业务修改请求继续拒绝。
  新 Stay Focus 项曾直接复现 `E_FOCUS_SENDER`，仅补精确路径后通过。
  此为组件保护证据，未执行真实 Stay Focus 安装。
- 修改涉及的语法检查及 `git diff --check` 通过；没有新建第二安装器/Authority，没有
  全量扩展构建、全仓回归、全应用原生矩阵、缩放专项、评分或 production 发布。
  production 通道仍关闭，正式 HTTPS 发行、CWS 及日常所有窗口热更新状态为 NOT_TESTED；
  `PUBLIC_RELEASE_BLOCKED` / `NOT_SCORED` 保留。上述 ignored 截图与收据仅在本机，未上传。
- 实现主体在并行 main 集成提交 `15e9f9027ea9015e136b79d19666689695e37e58` 中已保存；
  本轮后续交互修复、定向测试和本节在写入时仍为工作区改动，不把并行提交冒称本轮独立提交。

## R6.4 · 同一 HTTP 文档内审阅和安装（2026-10-27，开发中）

### 本轮直接复现与执行位置

在正常 Chrome 的 **OpenDesk Market R63 Test** 独立资料，打开
`http://127.0.0.1:43132/apps/opendesk/market-install-demo/` 并点击安装，实际创建了
`chrome-extension://ccfcjegpkdlgbclopjmadlcjedelidmf/ui/market-install.html?intent=750fe8b9-bc6d-40ec-8aa2-12b4e269b180`。
因此 R6.3 的弹窗证据不能证明 HTTP 内安装，本轮以此为待修复缺口。

本轮代码电路：

| 所有权 / 位置 | 构建入口与运行世界 | 调用与最终权限 |
| --- | --- | --- |
| 网站 `client.js`、`templates.mjs` | 独立 HTTP 市场，网站 MAIN | 仅请求固定应用版本的 REVIEW；不能发送确认、包、URL 或权限批准 |
| `marketplace/page-bridge.js` | 既有 `agents/page-relay.js`，固定 ISOLATED | 仅编译市场 Origin 的顶层文档启用；HTTP 内 closed ShadowRoot 展示后台审阅内容；真实点击同步核对 `isTrusted`、短暂激活、可见和焦点 |
| `marketplace/page-install.js` | 既有 `marketplace/market-host.js`，MV3 Worker | 核对真实内部 Sender、精确 Origin、当前顶层 Chrome DocumentId、固定身份/摘要、本机基线、一次性 token；沿原共享安装器和日志提交 |
| 原 `sidebar-tools/installation.js` | 扩展存储 / Authority | 保留原锁、来源、身份、撤权代际、数据和未知结果保护；包 JS 仅存储，安装时不执行 |

网站不能通过 external message 或网页合成事件直接提交。closed ShadowRoot 用于固定 UI 与闭包隔离，
不是新授权层，也不能把 HTTP 网络内容提升为 HTTPS。`MessageSender` 没有浏览器认证的用户批准字段；
真实手势由固定 ISOLATED 监听器采集，不能替代 Chrome 要求的独立网站/敏感权限手势。
正常单应用路径不创建确认窗、不嵌入扩展 iframe；成功后的“打开使用”才主动进入原工具宿主。
套装与原完整市场入口保留。

### 当前组件证据与原生待办

- `market-page-install.test.mjs`：10/10 PASS，实际调用共享安装器，覆盖新 ID 安装、升级保留数据、
  取消、固定内容变化、本机基线变化、导航/过期/错误 token、双提交、消费回执丢失与同日志恢复。
  Chrome Sender 和存储由组件测试模拟，不是原生安装证据。
- `market-page-bridge`、`market-page-copy`、`market-site-client-r5` 定向检查已通过；
  检查网站仅能请求审阅、可信点击边界、无 iframe、取消与超时不重放，以及套装原入口。
- 旧固定发行下载、来源、摘要、超限/重定向拒绝及 R5 意图保护相关 21 项通过。
- 当前共享持续开发 writer 由 Task owner 恢复为 PID21250，仍写入 `dist/development`。
  本轮保留该 writer、日常草稿与 CFT154/Send Queue，未创建第二 writer 或替换日常扩展路径。
- 临时非内置应用 `market-page-counter` 的 v1.0.0/v1.1.0 源码位于 ignored
  `artifacts/app-market-r64/`；首个市场候选只分发 v1.0.0，原生同页安装/取消/升级正在等待共享
  Chrome 前台与短时源码冻结窗口释放，仍为 **NOT_TESTED**。不以 Node PASS 或新网站文案宣称完成。

正式 HTTPS/CWS/production、全应用矩阵、缩放专项、独立评分继续延期；本轮不改变通道白名单、
Chrome 权限或安装 Authority。最终候选指纹和原生结果将在同节补记。

本轮安全复核另外发现并收敛了待合入项：刷新后为原事务换发仅恢复/打开授权，保留消费标记；
缺失日志的交接由明确操作结束且继续报告未知；外部状态共用固定摘要/取消判定；普通应用旧外部
弹窗操作在创建记录前拒绝。冻结期间用隔离模块快照执行该后台候选的12项定向断言，全部通过，
输出保存在 `artifacts/app-market-r64/candidate-test-output.txt`；这是候选组件证据，尚非已加载扩展证据。
网页确认呈现采用持久模态层与同步可见性/命中/稳定性检查的加固候选；closed ShadowRoot 本身
不构成防点击劫持证明，移除发生在 COMMIT 发出后也不能保证撤回在途事务。

## R6.5 · HTTP 发起、扩展可信审阅、原安装器提交（2026-10-27）

本节是最新核心开发结果，取代 R6.4 的网页最终确认候选；前节保留为历史记录。
HTTP 网站只发起固定版本审阅、查询结果或打开已核对的安装。最终批准统一在原
`ui/market-install.html` 扩展窗口完成，随后调用原 Installer/Authority；没有第二安装器。
旧网页桥已退役，历史 STATUS 仅可读，PREPARE/COMMIT 等旧动作拒绝。

### 当前可用操作与实现

- 网站详情的“安装到OpenDesk / 更新”打开同一通用可信审阅窗，展示版本、市场 Origin、
  本机基线和能力差异；一次确认后写入消费记录并由原安装器提交。Origin 不表示官方认证。
- 取消持久化后返回网站；超时、刷新、重连和未知结果只核对原交接，不自动重放安装。
  成功必须核对原事务身份、固定摘要、来源、实际包字节与适用撤权代际。
  “当前存在安装”独立于“本次事务成功”，缺失或不匹配的日志继续显示未知。
- 网站可直接打开当前合法安装；升级前可另行打开旧版。停用状态仍由原 Authority 阻止运行，
  升级不恢复已停用应用。同包再次审阅也先消费原意图并留日志，不重写数据或撤权代际。
- 自动状态读取合并并限频，为显式安装保留原请求额度；未放宽后台限流或 Sender 校验。
  套装状态读取原批次，核对固定成员和原安装日志；没有并列安装状态库。
- 独立市场发行保留经过完整清单、描述、实际包及摘要核验的旧固定版本和独立项目。
  同身份不同字节、旧输出损坏或来源变化时拒绝替换；网站发布不要求重建扩展。

### 本次真实 Chrome 核心证据

环境为独立资料 **OpenDesk Market R63 Test**，持续开发路径
`/Users/shopme/Documents/workspace/opendesk-browser/dist/development`，真实扩展 ID
`ccfcjegpkdlgbclopjmadlcjedelidmf`。Chrome 扩展管理页实际核对路径、ID 和启用状态；
调试页显示“开发服务已连接”，revision 为
`d100ace886a2a6dd1f9fa478c0a828c3b18e087f73234c44357e062c328a5ff6`。
原 watcher PID21250 /43119、HTTP 市场 /43132 保留。云控诊断显示 E_DIAGNOSTICS，未作为本轮
市场安装故障处理，也不宣称云控已通过。

从 `http://127.0.0.1:43132/apps/opendesk/market-page-counter/` 实际执行：

| 用户操作 | 实际结果与原审阅 ID |
| --- | --- |
| 取消首次审阅 | 扩展窗保存“已取消，未提交安装”，网站读回取消；`a7beb1de-9fdb-4daa-9660-3e311ec60566` |
| 再次显式安装 v1.0.0 | 一次确认后核对成功，网站直接打开原沙箱；`5feb849e-0c72-4610-a532-5078a040991a` |
| 原 SDK 保存数据 | 计数从0增至3，关闭原工具后由网站重开仍为3 |
| 仅市场发行 v1.1.0 | 网站显示“更新”及当前1.0.0，审阅显示无新增能力、保留数据；`06763a1a-d1b0-48c7-bce7-bf27b654e2f4` |
| 确认升级并打开 | 一次确认读回1.1.0；网站直接打开，新 JavaScript 写出“v1.1.0 新代码已运行”，计数仍为3 |
| 保存并重载扩展 | 再加一为4，关闭本轮工具标签，在独立资料扩展管理页 Reload；刷新网站仍核对原事务成功，直接打开后新代码标记与计数4均保留 |

两版固定包的实际下载字节与描述摘要已核对：

- v1.0.0：949 bytes，SHA-256 `814812108ce1a575dcef2d66255f76d99e24fc4c5a0286e3c6f6ca9873e7dea8`。
- v1.1.0：1058 bytes，SHA-256 `1f1d7b2a19834f5fb565f36b33c9859535a6e55ba0d7b7bb2740a84e04d0d4c5`。

市场输出 siteBuildId：`2741b7bc65b97677e3b492aa0e5648f3ee620fc71aa8d79687736205325e5df4`，
15个应用、36个固定发行。**从新市场发布前到升级及扩展重载后，全部167个扩展文件前后指纹
一致，changedFiles=[]，无排除项**；完整指纹
`242346e00bbc7bb7688f8e4c39326a3170f9bb938fb27e3acf9dba2323f63ff2`。
内部 dev revision 与全部文件清单指纹是不同算法的证据，不相互替代。

本机 ignored 证据位于 `artifacts/app-market-r65/`：`01`—`17` AX/PNG、
`native-receipt.json`、`release-verification.json`、`site-build-final.json`、
`host-b0-final.json`、`host-b1-final.json`、`host-comparison.json`。
`host-b0.json` 是此前源码修复前的历史基线，不用于本次全包冻结结论。
证据由真实 UI 操作取得，未读取浏览器私有存储，未操作日常资料或并行测试 Profile。

### 定向检查与未执行范围

受本次状态、审阅和 Installer 改动触发的 client/page-install/trusted-install/dynamic-install
检查88/88通过，覆盖真实 Installer 组件中的数据/停用保留、消费回执丢失、未知结果、
固定 SHA、日志身份、撤权代际、Sender/Origin/Document 和共享限流。
发行保留、损坏拒绝、旧桥无副作用及页面文案检查15/15通过；相关 JavaScript 语法及
`git diff --check` 通过。Node 模拟 Sender/存储的结果不冒充原生证据。

原生停用应用升级、原生套装安装、整个 Chrome 进程重启为 NOT_TESTED；本次已执行的是独立
资料的扩展 Reload。production、公网 HTTPS/CWS、全量回归、缩放/宽度专项及独立评分继续延期，
`PUBLIC_RELEASE_BLOCKED` / `NOT_SCORED` 不变。本轮在 main 保留可审阅工作区改动，未提交或推送。

## R6.6 · 单应用审阅迁入原 React Side Panel ImportSheet（2026-10-27）

本节取代 R6.5 的单应用独立审阅窗；历史证据保留。HTTP 市场只发起固定版本请求，
真实 Side Panel 在原 React ImportSheet 中呈现并一次确认，仍由原 Installer/Authority、
intent 和 operation journal 提交与核对。套装继续原批次入口，不新建安装器或状态库。

### 当前实现与边界

- `src/marketplace/install.js` 将原单应用事务接入可订阅审阅模型，原浮层显示版本、Origin、
  当前安装、新增能力、数据与停用状态说明，SHA 等技术字段默认折叠。历史
  `ui/market-install.html` 只显示工具栏指引，不能批准或取消。
- `src/marketplace/panel.js` 与原 intent 校验原来源 tab/window/document，CLAIM 绑定实际
  Side Panel document；普通 TAB、跨窗口和活跃旧 owner 不能抢领。Chrome 本机原生 panel
  的 `windowId=-1`、大写文档 ID、缺失 sender frame/document 通过共享 `resolveToolSender`
  归一化，再精确核对原生 SIDE_PANEL。全局 panel 的窗口由固定可信调用方通过
  `windows.getCurrent()` 取得；后台 `windows.get()` 证明窗口存在，不构成独立的原生窗口归属证明。
  网站消息不能提供这个 windowId。
- 网站能区分已打开、待处理与需要工具栏手势的回执，不把 `sidePanel.open()` 调用成功
  当成审阅已经显示。源码编辑、未保存内容或其他审阅占用时，原页面保留并显示待处理入口；
  异步 CLAIM 后再核对占用状态。更新同一工具在原消费标记前同步检查保存/草稿，不能覆盖草稿。
- “取消安装”保存原取消记录；关闭浮层、关闭或销毁 panel 只结束当前呈现。
  新文档接续同一请求；已消费、journal、结果未知仅核对原事务，不重新下载安装。
  未消费且无 journal 的旧来源文档失效返回 `E_INTENT_EXPIRED`，网站只在下一次显式点击时
  新建请求；不会换绑原目标或复活已消费事务。
- 原 JSON 选择、拖入和本地安装分支保留，同一浮层与市场审阅互斥；本轮没有迁移旧工具业务。

### 同候选真实 Chrome 核心结果

使用独立资料 **OpenDesk Market R63 Test**，实际路径
`/Users/shopme/Documents/workspace/opendesk-browser/dist/development`，扩展 ID
`ccfcjegpkdlgbclopjmadlcjedelidmf`。扩展管理页核对路径/ID/启用状态，调试页实际显示
“开发服务已连接”，revision 为
`d689f432f4827c58922537502eba3be1368efb4b1bfb071fa9781b000c1c32c4`。
模式为持续开发，非 production 静态验收包。

共享 watcher 原 PID21250 因旧配置缓存与固定 Host 超限未能发布。用户明确同意后温和重启
这一个 watcher；当前 PID71072，端口仍为43119、输出路径与扩展 ID 不变。测得
`ui/sidebar-tool-host.js` 为525455 bytes；仅此固定 entry 的工程上限从512 KiB改为516 KiB，
余量2929 bytes，其他 entry 上限及代码来源、CSP、固定自包含门禁不变。没有另起并行 writer。

临时非内置应用为 `market-sheet-counter`，只使用 `storage.local`，测试源码位于 ignored
`artifacts/app-market-r66/counter-1.0.0/` 与 `counter-1.1.0/`。从
`http://127.0.0.1:43132/apps/opendesk/market-sheet-counter/` 实际执行：

| 用户操作 | 真实结果 |
| --- | --- |
| 首次发起并取消 | 原 Side Panel 浮层显示版本/来源/能力；取消持久化，市场读回“本次安装已取消” |
| 再次显式安装 | 新审阅在侧栏一次确认后成功，网站核对本机记录，没有独立安装窗 |
| 打开并保存 | 原沙箱运行v1.0.0，原 SDK 保存计数2并显示“保存成功” |
| 仅市场发布v1.1.0 | 网站显示更新，当前安装仍为1.0.0；没有重建或替换扩展 |
| 开发页接收更新 | 保留“开发”页与原编辑器，只显示“opendesk/market-sheet-counter · v1.1.0 · 审阅安装” |
| 关闭、重开 Side Panel | hostInstanceId由`9d3b4d1b-71ed-4aa4-a977-532a60d33349`变为`661bb5a1-f67b-4a8b-8ae0-51809fd2633c`，原待处理请求仍在，重新打开显示原升级基线 |
| 接续并确认升级 | 核对v1.1.0成功；新代码写出“v1.1.0 新代码已运行”，计数仍为2 |
| 普通同URL标签页 | 显示“无法核对真实 Side Panel 文档身份”，没有安装确认资格 |
| 旧弹窗URL | 只显示“在侧边栏继续安装”指引，无安装或取消按钮 |
| 原本地导入入口 | 原“导入扩展”浮层、文件选择与JSON拖入提示正常显示；关闭后回到原列表 |

两版固定发行均1151 bytes，HTTP实际下载字节与描述摘要一致：

- v1.0.0：SHA-256 `907612087b9e07cff7d020102acaa81d005cce1ab54f17aa3a57ecb592400ef0`。
- v1.1.0：SHA-256 `a1093011a0364bc994f5e4d75fe4159c132ef05c3702ac868550ff66367462ed`。

市场最终siteBuildId：`e0adfd3262f869baccb4e799b0b00c9cf7405c2205c7a107229a48d44dfcebaf`，
16个应用、38个发行。网站发布前后扩展**全部167个文件、无排除项**指纹一致，
`changedFiles=[]`，完整指纹
`730c1b93396068dbe26ffb77e01df652e25c228ea70b9ffcb689c060018c9934`。

ignored证据：`artifacts/app-market-r66/01`—`18` AX/PNG、`native-receipt.json`、
`release-verification.json`、`host-before-site-update.json`、`host-after-site-update.json`、
`host-comparison.json`、`site-build-v1.1.txt`、`site-copy-tests.txt`与`dev-watch.log`。
没有读取浏览器私有存储或操作其他测试资料；临时应用保留在上述专用资料，计数2。

### 定向验证与保留缺口

panel handoff、原trusted installer、coordinator、React状态及网站client/copy定向检查通过。
其中trusted-install/coordinator/React状态29项通过，最终网站client/copy34项通过；
原生sender归一化、source失效、跨窗口/owner/普通TAB、最终同步草稿guard由后端定向用例覆盖。
WXT持续开发产物成功发布并与实际Chrome连接revision一致；相关语法与diff格式检查通过。

本轮原生只验一个非内置应用的两版。停用升级、未知结果故障注入、跨窗口攻击、本地JSON安装
重跑和原生套装安装未执行；相关组件保护不冒充这些原生证据。production、公网HTTPS/CWS、
完整回归、宽度/缩放及独立评分继续延期，`PUBLIC_RELEASE_BLOCKED` / `NOT_SCORED`不变。
main工作区保留可审阅改动，未提交或推送；无关并行改动与服务保留。
