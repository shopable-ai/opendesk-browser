# OpenDesk 应用市场网站与可信安装交接 · R5

日期：2026-10-12。实现入口及逐项结果见 [R5 工作流](../../framework/workstreams/app-market-r5.md)。本文描述已写入源码的合同；源码、组件、真实 Chrome、本机 Mac 与正式 HTTPS 的完成状态分别记录，不能互相替代。

## 1. 本轮固定范围与路线

交付范围在实施开始时固定为：独立网站源码和完整构建、官方固定发行的受限交接、一次可信审阅、本地 HTTP 安装及实际使用、必要恢复、开发／生产隔离、版本归档、可部署产物及正式渠道合同。真实安装、使用和恢复是验收要求，不因环境受限而改称后续功能。未完成的证据必须在工作流保留 `BLOCKED`／`NOT_TESTED`。

| 机制 | 用户与更新 | 现有能力复用 | 来源、恢复与维护 | 本轮取舍 |
| --- | --- | --- | --- | --- |
| 网站发现 → 扩展内官方包审阅 | 网站点击、扩展审阅一次、安装后主动打开；官方包更新随扩展发版 | 直接复用现有 Catalog、安装器、存储、权限、沙箱和恢复 | 发行字节来自用户安装的扩展；可离线安装；不新增远程代码供应链 | 本轮实现的端到端路径 |
| 已准入类型的远程固定版本整包 | 应用可独立更新；仍须各类型审阅和准入 | 可复用固定身份和安装提交，但缺少整包分发的发布者信任根 | 需签名、密钥轮换、撤回、制品限额、缓存和故障恢复；Chrome 政策按执行位置分别审查 | 保留独立增量任务，不通过外部消息传 URL 偷渡 |
| 核心随扩展、适合类型独立分发 | 核心宿主稳定，应用按自身合同演进 | 保留 Authority、Broker、RunHost、SDK 及 Page／Task 准入 | 单一安装事实，多个经批准的制品来源；不建第二套权限或执行框架 | 采用此长期架构，本轮先完成第一行 |

网页用户脚本分发可参考 Tampermonkey／Greasy Fork，但 OpenDesk 的 Sidebar、Page 和 Task 运行位置及能力不同，不统一改成 `.user.js`。VS Code 市场中固定版本、兼容性、安装与启用分离的机制可参考，不复制它的权限或运行模型。

## 2. 源码与权威边界

| 内容 | 唯一入口与职责 |
| --- | --- |
| 官方源码登记 | `official-tools/catalog.json`；登记项目、ID、类型和预装策略，不重复记录版本或用户状态 |
| 发行生产者 | `scripts/build-official-tools.mjs`；由原项目生成包、字节数及 SHA-256 |
| 网站展示 | `src/market-site/templates.mjs`、`market.css`、`client.js`；引用共享市场纯数据和 `src/ui/design-tokens.css` |
| 网站构建 | `scripts/build-market-site.mjs`；输入校验、路由、归档合并、完整输出和身份，不承载整页模板／CSS |
| 来源配置 | `src/marketplace/channel-config.json` → `scripts/market-channel.mjs`；同源生成网站配置、Manifest 和扩展私有配置 |
| 外部入口 | `src/entrypoints/market-host.js` → `src/marketplace/external.js`；Service Worker 固定本地 sidecar，只处理连接和打开审阅 |
| 交接元数据 | `src/marketplace/intent.js`；使用现有 `chrome.storage.local`，不是已安装应用数据库 |
| 可信审阅 | `src/marketplace/page.js`；复用现有单应用和批量审阅、基线、原事务与恢复 |
| 实际安装事实 | `src/ui/sidebar-tools/installation.js` 和既有工具存储；网站与 intent 不保存第二份安装状态 |

网站不引入扩展完整 `page.js`、安装器、SDK、权限处理或用户存储；Service Worker 不引入网站搜索、HTML、CSS 或前端依赖。WAR 仍只开放已有固定 SDK 资源，审阅页、channel 配置和安装记录不公开给网页。

## 3. 独立网站与构建身份

默认 `npm run build:market-site` 在没有任何旧 dist 输入时即可构建 `dist/app-market-public`。输入包括原官方生产者及源码、受控发行快照、套装纯数据、模板、样式、客户端、设计 token 和来源配置；构建前后核对输入未变化。

生成：首页和应用列表、搜索及三个实际分类、当前推荐详情、固定版本详情、套装列表及固定 revision、安装交接说明、主扩展／连接帮助、404、robots、sitemap、逐页 title／description／OG／canonical。每个分享路径都有实际 `index.html`，不依赖服务端 SPA fallback。当前推荐路径与固定版本路径分开。

完整产物先生成到唯一临时目录，通过后替换已识别的网站产物；不读取旧网站页面，不把扩展包目录当网站目录，不覆盖未经识别的用户目录。`site-build.json` 记录 source inputs、输出文件 hash、目录身份、构建模式、真实配置及 build ID；它不包含安装清单或用户数据。公开目录不含可执行工具 JSON 包。

源模板对动态文本及属性转义；客户端只使用文本和固定 DOM 更新。无第三方脚本、远程字体、分析 SDK、Cookie 或用户上传执行入口。真实截图只接受仓库受控 PNG；没有媒体时不把结构示意冒充实际截图。截图及响应式实测是否完成以工作流为准。

`src/market-site/media-index.json` 只登记展示图片来源：应用固定版本、图片 SHA-256、对应发行制品 SHA-256、源码提交、真实 Chrome 版本、CI run/artifact 与原始截图路径。它不是应用登记或安装事实。构建拒绝缺登记的图片、缺文件的登记、版本/制品不符、重复图片、字节被改动和超限尺寸；从 PNG IHDR 读取真实宽高，不写虚构比例。`site-build.json` 同时绑定这些展示输入。详情图注明独立工具页/Side Panel/授权网页，以及实际初始或使用状态，并提供完整原图；“初始编辑界面”不能改称已输入示例成果。单张真实截图也不能把其所属失败运行提升为整套通过。

## 4. 开发与生产来源

配置协议为 `opendesk.market.channel-source.v1`，安装协议固定 `opendesk.market.intent.v1`。

| 字段 | 开发 | 生产 |
| --- | --- | --- |
| Origin | 默认 `http://127.0.0.1:43132`，必须显式端口且仅 loopback | 一个经核验的公共 HTTPS Origin，443，拒绝路径、凭据、query、片段、开发域和 IP |
| 扩展 ID | 明确配置，或从实际解压目录生成预期 ID；浏览器验收须比对实际 ID | 固定发行 ID，不能沿用开发目录 ID |
| 获取地址 | 不编造正式发行地址；说明加载 `dist/development` | 核验同 ID 的正式 Chrome Web Store 地址及核验日期 |
| Manifest | 精确开发 Origin 的 matches | 精确 HTTPS Origin 和 443；正式配置为空则没有 externally_connectable |
| 状态 | 仅开发构建可用 | 四项生产输入全为空表示禁用，部分填写或无效配置直接构建失败 |

开发环境可使用 `OPENDESK_MARKET_DEV_ORIGIN`、`OPENDESK_MARKET_DEV_EXTENSION_ID`，并须同时重建扩展和网站。生产解析忽略这些开发变量，不能因运行 shell 留有开发值而开放 HTTP。`OPENDESK_MARKET_SITE_ORIGIN` 只表达部署 metadata；它不会授予安装信任，且启用交接时必须与受控 Origin 相同。

目前正式域名、生产发行 ID、经核验获取地址均未提供，源码中为 `null`。这是一份可审查的配置合同，不是已发布渠道。生产生成器和包校验拒绝未授权来源，不使用占位地址冒充上线。

生产禁用通道的真实工具生命周期与“已配置 HTTPS `:443/*` 的 Chrome 外部交接”是不同证据。后者在真实正式输入和部署到位前保留 `configured-production-manifest-real-chrome: NOT_TESTED`／渠道阶段 `BLOCKED`。

## 5. 仅两个外部操作

连接探测只接受：

```json
{"protocol":"opendesk.market.intent.v1","action":"PROBE"}
```

应用交接只接受：

```json
{"protocol":"opendesk.market.intent.v1","action":"OPEN_INSTALL_REVIEW","intentId":"5318f787-c7f5-4306-8f27-4a1c627d1b63","subject":{"kind":"app","marketId":"opendesk/markdown-workbench","version":"1.0.1"}}
```

套装 subject 为 `{"kind":"collection","collectionId":"reading-kit","revision":2}`。UUID、ID、版本长度和 revision 范围均有界；未知字段、嵌套额外字段、任意代码、包 URL、运行命令、跳转地址、权限批准和用户数据一律拒绝。先检验字段及廉价 sender 身份，再进入有上限的处理队列。

网页使用 Chrome 官方 `chrome.runtime.sendMessage(extensionId, payload)`。后台独立注册 `onMessageExternal`，保留 `return true`／`sendResponse` 异步兼容方式，不转发内部 RPC、SDK、Cloud Control 或 RunHost。

网页只会收到 `CONNECTED` 或 `REVIEW_OPENED` 等交接结果和有限错误码，不会收到已安装清单、用户信息或批准权。连接 5 秒超时显示“无法连接 OpenDesk”，不能断言主扩展未安装。交接成功只显示审阅页已打开；安装成功必须由可信页读取本机实际结果。

## 6. 浏览器提供的发送者验证

必须同时满足：实际 runtime ID 与配置一致；sender 没有扩展／Native 来源身份；`frameId === 0`；有效非隐身 tab；浏览器提供的非零 32 位十六进制 `documentId` 和 `documentLifecycle === active`；精确 sender Origin、URL、端口。URL 拒绝凭据及过长值。Chrome 的 `documentId` 是浏览器 `UnguessableToken` 的表示，与本协议 intent／review UUID 和 Chrome `contextId` UUID 不同，不共用 UUID 正则。

随后使用 `tabs.get` 和 `webNavigation.getFrame({tabId, documentId})` 核对实际 tab 当前／待导航 URL、活跃顶层 document、`parentFrameId === -1`、document ID 与 URL。请求正文不提供 sender，无法以自报字段替代这些检查。缺字段或浏览器条件不支持时拒绝，并返回可理解的错误。跨来源、错误端口、iframe、扩展来源和隐身请求不进入开页及安装逻辑。

浏览器校验与当前文档观察存在正常异步窗口；已经验证并持久化的固定意图是本地审阅记录，不需要官网继续打开。官网关闭或导航不会让另一应用替换用户审阅的对象。

## 7. 去重、限流、开页与恢复

意图键为 `opendesk.market.intents.v1`，最多 64 项，TTL 30 分钟。只记录 request/subject/review/operation 身份、来源、时间、开页状态、消费及结束状态。它没有包、权限、用户数据或“已安装”字段。

按全局及 Origin 限流：每分钟最多 120／60 次请求、12／6 个新意图，Worker 内排队最多 16；持久窗口在 Worker 冷启动后保留。应用不新增按 tab 可无限绕过的限流器。

相同 intentId＋相同 subject 复用原 reviewId、operationId 和实际审阅页；同 ID 不同内容拒绝。新应用／版本／revision 使用独立审阅页，不能更新已有审阅 URL 或内存候选。审阅页从持久记录解析固定对象；手工改变 Hash 也不切换本次候选。

开页顺序为持久化 prepared → 查找实际固定审阅 URL → 聚焦／创建 → 记录 opened。浏览器开页与存储不是原子事务。任一步回执丢失均返回未知交接；同请求重试先找实际标签页，不盲目再开。测试需分别保存 prepared、create、opened 窗口的证据等级。

消费标记在原安装预检之后、首安装日志之前，在共享 intent 锁内持久化。已消费意图不能因安装日志裁剪或全局 batch 被后续批次替换而再次安装。TTL 清理保留原未结事务、原未结 batch 和已消费但未结的交接；不删除安装器日志、工具数据或其他批次的恢复记录。

消费成功但回执丢失时，不继续安装。可信页重新读取持久 intent 及本机日志，不依赖内存里的消费值；页面立即提供适合当前状态的恢复入口。若原事务存在，使用原安装恢复服务；若已消费而首事务日志不存在，用户可以明确“核对本机状态并结束此交接”。该动作取得原 tool／batch、catalog、intent 锁，检查没有相关在途操作，只记交接结束原因，保留 consumedAt，不写安装事实，也不宣称原结果成功。再次安装必须重新发起新意图并审阅。

套装页面及恢复 handler 还必须匹配 `handoff.operationId === batch.batchId`。同一 collection/revision 的另一批次不能成为本页结果；原 handler 在锁内重查 batch 身份。成功批次项保留；未知项不自动重放；队列中尚未派发项目通过现有恢复逻辑标为中断。

## 8. 一次审阅、安装、权限与数据

单应用审阅集中展示用途、运行位置、OpenDesk 发布者、扩展内制品来源、固定版本、当前基线、所需能力、新增能力、数据保留和网站授权说明，摘要放技术详情。套装使用同一能力映射、中文逐项状态和固定 revision。

实际提交仍通过 `installReviewedSidebarTool`：原 tool/catalog 锁、规范化包摘要、来源、固定版本、宿主兼容、容量、权限差异及 baseline 再核对。`commitIntent` 只是新增的可选交接消费门，不建立另一安装器。baseline 变化发生在消费前时，页面提供同一固定候选的新审阅，不沿用已失效批准。

应用自定义 `alert()`、`confirm()`、`prompt()` 不参与正常安装使用；沿用当前内联审阅。安装不运行应用，也不授予网站权限；用户在工具入口主动给需要的网站授权，正常使用复用原许可。Chrome 自身必要权限仍由相应真实操作触发，不由测试直接写授权存储冒充批准。

更新保留用户数据并遵循原来源／迁移规则；结果未知先恢复核对，失败不得覆盖已可用状态。卸载沿用原注册表、授权、来源和数据清理及恢复。代码回退不意味着应用数据能够回滚，界面和文档都不承诺未实现的数据恢复。

## 9. 固定版本和历史输入

`official-tools/releases/*.json` 是原发行生产者／已绑定原始证据的发布快照，不是另一份源码登记。`npm run snapshot:market -- <新文件名.json>` 只追加新文件；同版本但不同摘要／字节／元数据、同 revision 不同成员都会拒绝构建，必须发新版本／revision。

本轮保存开始候选及整合后候选，历史 Mac 记录中的五个发行描述保留原来源身份。reading-kit r1 不变；r2 固定为 reading-toc 1.0.3、web-markdown-clipper 1.0.0、quick-notes 1.1.6。整合 `3134e2b1` 的网页笔记 1.1.8 后，新增推荐 r3，只将新组合的笔记固定为 1.1.8；r2 原成员和 1.1.6 发行仍留在历史快照。历史 r1 的 quick-notes 1.1.1 仅有固定套装引用、没有完整发行快照，因此其 URL 显示“发行记录待核对”，不编造 hash，也不替换为当前笔记。

并行 main 将 time-review 1.3.0 的代码继续修改后，本轮保留此前 1.3.0 快照，将整合后的制品发布为 1.3.1；功能修改保留。归档存在只表示可解释旧链接，不保证用户当前扩展包含该包，也不是签名／审核状态。摘要、包来源、发布者和审核状态分别表达。

## 10. 启动、部署与实际验收

从仓库根执行已有命令：

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run build:dev
npm run build:market-site
python3 -m http.server 43132 --bind 127.0.0.1 --directory dist/app-market-public
```

在 Chrome 加载 `dist/development`，核对实际 ID 与 `dist/development/marketplace/channel.json` 相同，再访问 `http://127.0.0.1:43132/`。构建网站的默认开发 Origin 与服务器完全一致。若目录发生变化或实际 ID 不同，在同一 shell 设置开发 ID 后重建两端。改端口也必须重建两端；不终止占用端口的其他会话。

新增 `npm run dev:market` 会先独占绑定同一 loopback 端口，再构建网站并服务产物；失败不会杀其他进程。它是网站构建＋服务入口，扩展仍按已有构建／加载方式准备。

Python 原命令能服务实际静态页面，但不会应用 `_headers` 文件，也不会为无效路由返回定制 404 内容。新增开发服务会应用安全头和生成的 404。正式托管必须把 `_headers` 转换为实际平台响应头，保留目录 index、404、正确 MIME、HTTPS 和 CSP；不能把文件“已生成”当成响应头“已部署”。

生产构建：

```bash
npm run build
OPENDESK_MARKET_BUILD_MODE=production npm run build:market-site
```

正式配置未完成时产物显示渠道未配置，不能进行正式安装。确认域名／发行 ID／获取地址、HTTPS 和头部后，必须用该真实 Chrome 发行包验证正式网页消息、审阅及安装。部署凭据和公开发布动作没有因本地通过自动获得授权。

自动化复用 `tests/framework/app-market-r3-native.test.mjs` 的原 CFT 原生输入驱动，新增 R5 helper，不使用伪 sender 或直接写安装记录。

```bash
CHROME_BIN=/实际/Chrome可执行文件 \
OPENDESK_NATIVE_MARKET_R5=1 \
OPENDESK_NATIVE_EXTENSION_PATH=dist/development \
OPENDESK_NATIVE_BUILD_MODE=development \
OPENDESK_NATIVE_ARTIFACT_DIR=artifacts/app-market-r5/native \
node --test tests/framework/app-market-r3-native.test.mjs
```

CI 在 Linux 和 macOS 上使用固定 Chrome for Testing，分别保存输入身份、网站 build ID、实际扩展 ID/Origin、真实操作、事务、数据摘要、截图、正常重启和失败原件。CI 状态、原始 receipt 和未测试数组必须一起核对；没有最终原始 PASS 不能凭绿色 job 验收。

原生中断测试复用未修改产物中的四个实际调用位置：prepared持久化后/开页前、创建审阅页后/记录opened前、消费标记确认后/首事务日志前、注册表写入确认后/结果终态前。位置通过 AST、加载脚本 SHA 和 CDP 精确 call 断点绑定；只读观察后停止实际 Worker 或关闭可信审阅页，再由原 HTTP 意图恢复。不把这些调用者中断称为 Chrome API 原生回执丢失。原始错误、未知状态和具体未测范围必须保留。

Worker 的 DevTools target ID 可能跨执行重启保留。观察器先对同一 session 的浏览器 uniqueContextId 作只读正对照，断点命中时再次核对；停止后只接受本次匹配 version/registration/source 的 stopped 事件，加实际 target 消失，或旧 context 真实销毁和同一 target/session 上的新执行证据。后者要求旧 unique ID 精确返回原生 `-32602 / uniqueContextId not found`、新 unique ID 正对照成功、实际脚本 SHA 不变；断开、超时、旧 stopped 事件都不能替代。动态保存实际 Target 快照，避免把延迟消失误判为复用。仅在旧执行已销毁而 target 留存时，可点击原 HTTP 网页的连接按钮发送一次 PROBE 唤醒；这不是安装重放，也不能代替终止证明。PROBE 正常维护限流和过期记录，不能宣称整个存储完全无写入。

浏览器正常关闭时，Chrome 可能拒绝后到的被动清理 API。产品仍执行原清理，只将四个明确被动阶段的精确 `The browser is shutting down.` 拒绝记为“清理被中断”警告；其他消息、启动、授权、活动调用和 Foundation 身份错误仍为错误。原生验收保留每个原始警告，要求实际固定入口、原生 Error、同一 Chrome generation、真实 Browser.close 至观察到 code=0/signal=null 正常退出的时间区间同时匹配。警告不表示清理完成，不改变安装事务或恢复状态；错误和未解释异常门禁继续保留。

可信审阅“打开使用”沿用内部 `tool.html`。导航和 Foundation 宿主边界共用纯 URL 形态：零参数、单 hostInstanceId，或该host加唯一有效toolId/previewId。有定位参数必须是真实顶层TAB sender；不进入缺documentId的SidePanel恢复分支。定位值只选择已有界面，不能代表安装批准、任务执行或权限；原 Authority/任务工作台/工具能力核对均保留。正常工具页需观察原资源诊断中的真实已连接端口，并在完整关闭前后拒绝未解释的产品运行异常。

## 11. 后续远程分发的独立接入边界

现有能力不能回退：Page 的 `dependency-manager.js` 仍支持显式准备／批准的受控 HTTPS `@require` 依赖；执行仅使用锁定本地字节。Page／controller／Task 开发构建已有 `lock-program-remote.mjs`、`remote-esm-modules.mjs`、`remote-esm-network.mjs` 的远程 ESM 审阅、锁、限额和离线编译。这些不是应用市场远程整包安装。

| 类型 | 保留的准入及执行合同 | 未来分发新增部分 |
| --- | --- | --- |
| Sidebar sandbox | 自包含包验证、原审阅、来源／版本／权限、opaque sandbox 和受控 SDK；不允许运行时远程 privileged JS | 固定制品获取与缓存、发布者签名和信任根；按 sandbox 实际执行能力核对 MV3 政策 |
| Page Program | 原候选导入、依赖锁、真实验证、Available／Installed、网站授权和 USER_SCRIPT 合同 | 将验证过的固定远程制品输送到现有候选入口，不通过市场消息直接调用 Broker |
| Task | 原 taskId/version 身份、候选验证、durable effects、准入、安装和 RunHost | 增加固定包输送及发布者证明，保留 Task 本身所有验证和运行控制 |

独立任务必须定义：信任根、发布者 ID、签名算法和被签字段、密钥轮换／撤销、撤回的已安装影响、制品限额、托管允许来源、离线缓存、宿主兼容性、数据迁移与失败恢复。哈希仅证明所比对字节相同，不等同来源签名；签名也不等同代码全面安全审核。R5 外部协议仍保持两个有限操作，不演变为远程运行 RPC。

## 12. 官方机制核对

本轮核对日期为 2026-10-12。以下资料用于验证适用机制，不自动形成设计分或实际验收证据：

- [Chrome 消息机制](https://developer.chrome.com/docs/extensions/develop/concepts/messaging)
- [externally_connectable](https://developer.chrome.com/docs/extensions/reference/manifest/externally-connectable)
- [Match patterns](https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns)
- [Runtime MessageSender](https://developer.chrome.com/docs/extensions/reference/api/runtime#type-MessageSender)
- [MV3 要求与远程代码边界](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements)
- [Chrome userScripts](https://developer.chrome.com/docs/extensions/reference/api/userScripts)
- [VS Code 扩展市场](https://code.visualstudio.com/docs/configure/extensions/extension-marketplace)
