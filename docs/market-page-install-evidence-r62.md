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
