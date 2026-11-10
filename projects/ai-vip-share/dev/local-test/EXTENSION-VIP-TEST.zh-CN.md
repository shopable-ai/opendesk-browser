# AI VIP Share：完善扩展到模拟 VIP 网站的真实操作链

<a id="market-vip-integration-20261110"></a>

## 2026-11-10 18:48 本地集成结果：1.4.34 开发实机核心链 DEMO_PASS

**当前可用操作：** 原43132市场识别已安装工具，通过原审阅升级到1.4.34后接续7898；原Controller自动读取7903并无消费预检，用户一次「确认激活」取得3次合成额度。原生Side Panel与原「在新标签页打开」的app.html显示相同3次新额度、原7次额度和2条记录；Provider重启、app.html刷新、侧栏重开后仍可回读。SQLite最终只有本领取项1条新收据，总数2，旧收据逐字节未变。

**身份与模式：** 持续开发 `dist/development`，扩展ID `ccfcjegpkdlgbclopjmadlcjedelidmf`；原生「调试→本地开发服务」实际显示已连接，revision `6b5c3d3384b134389e5bebc9b0b2683d887c16e1ec162996a1e24bf686168771`。唯一正式工具JSON为1.4.34 / 157547 B / SHA-256 `6cf868116f59c957efe9858c0372f57fa553f6b998b6f04a843180dd83fd031f`，原打包器候选、检查、同源晋升及 `--check-project` 通过；原安装界面确认1.4.33→1.4.34、七项能力无新增。43132由本轮承接原服务，当前市场buildId `b989ca66786503cb638dea25f226ee7b6b8e1acc57fc21692b3380c4dcd874e0`，18 apps/45 releases。7898/7903继续共用原SQLite，不清账。

### 当前修复、实机结果与证据范围

| 当前用户操作 / 具体阻塞 | 最小修复与真实结果 | 原件或定向证明 |
| --- | --- | --- |
| 原市场打开带fragment详情，外部sender URL不含fragment | 仅外部导航定位比较剥离fragment；Origin/path/query/document/top-frame仍严格，网站继续在APP_OPENED后核对原fragment。原市场审阅更新后确实返回7898 | `market-navigation-tests.tap` 24 PASS；不把排队/面板打开当领取许可 |
| app.html不能创建侧栏专属列表；其Browser SDK sender又被拒 | 该Surface仅使用原ToolHost，公共sender解析接受原合法app路由；仍检查UUID、安装版本/摘要/epoch/授权与撤权。实际app.html显示同一会员结果 | `app-surface-tests.tap` 19 PASS；installed app Host 21 PASS；两项HEAD已有预览夹具失败未纳入通过结论 |
| 无开发连接控件的正式UI不能接入本地Demo；扩展GET不带Origin被原Provider拒绝 | 仅可信开发profile及精确7898页面可自动选择7903，复核状态/CAS并走原预检；开发会员logical GET以wire POST `{}`调用原只读 `/api/member`。Provider严格空对象及原Origin/X-local保护，生产GET不变 | `vip-v1434-tests.log` 86 PASS；缺Origin GET、错来源/标记和非空POST仍拒绝；`proxy-v1434-tests.tap` 5 PASS |
| 一次明确领取及恢复 | 确认前当前grant零核销；原生按钮点击一次后收据 `b8f339d5-c135-4b58-99a3-a0b23ed4b3dd`，3次额度。重启Provider、刷新app.html、重开侧栏后仍为该收据，总核销2、当前1、原7次不变 | `native-preflight-v1434.json`、`native-confirmation-v1434.json`、`app-success-v1434.png`、`app-reload-v1434.txt`、`native-reopen-v1434.json` |
| 丢回执/unknown后的安全恢复 | 原Controller与真实HTTP/SQLite定向检查证明只查询原键、不自动重兑；本轮真实页面完成正常刷新/重开与Provider重启 | 实际Chrome ACK丢失、Worker故障注入仍NOT_TESTED；不将组件证据冒充这些实机故障 |

本轮取得 **DEMO_PASS（开发环境真实Chromium扩展核心链）**。完整 `CHROME_PASS` 矩阵、production静态候选、真实故障注入、商业Provider/HTTPS/第三方VIP和Cookie登录验收仍未执行或未具备条件；历史评分保持NOT_SCORED，不自动推进这些延期项。共享Profile并非Cookie/权限隔离；本轮只使用TaskSpace58，结束已finish，未操作其他对话页面或其Web Flow业务。Browser原writer自然退出后才启动唯一 `npm run dev`；首次4GB堆不足退出后以12GB堆恢复同目录，未终止他人writer。当前dev、43132市场及7898/7903原DB Provider留存供继续使用。

原件统一在忽略目录 `artifacts/market-vip-20261110-continuation/`，原SQLite继续位于 `artifacts/market-vip-20261110-evidence/receipts.sqlite`，不提交令牌/数据库。以下保留前轮观察，均以其时间点为界；“候选owner阻断”和“等待43132归属”已由用户本轮授权接管解除。后续生产HTTPS连接跨Surface并发的额外复核列为P2，当前 `REVIEWED_SERVICE=null`，不扩为本轮生产实施。

### 历史观察（同日17:53）：Host 可达，app.html 源码修复待原 watcher 产出

以下为2026-11-10后续任务的新观察；下文56/56、29/29及无接收端结果保留前轮时间边界，不是本轮重跑。续接起始 main `f8edc403c85b9373d842a4296311fb298a8c482d`，使用默认共享 Profile 的独立 ego TaskSpace57，未进入登录 owner 的专用 Profile1。

- **原市场真实操作：** 43132的旧1.4.2页面点击安装，仅产生原审阅 intent `f4a510a9-0b1e-446a-a5d3-2be472b3e2b7`。原 `GET_INSTALL_STATUS` 返回 `installation: review`、`currentInstallation: different-version`、`installedVersion: 1.4.18`、`enabled: true`；`GET_APP_STATUS` 同样返回版本不同。没有批准安装、APP_OPENED、激活跳转或兑换；原审阅未清除、未替换、未冒称取消。
- **独立应用页真实故障：** 正确的 `app.html?toolId=ai-vip-share` 已建立真实标签页绑定，却在公共 `createExtensionCenter` 抛出 `E_REACT_LIST_OWNERSHIP`，外层统一显示身份拒绝。React app Surface 原本只渲染 ToolHost，不提供侧栏列表节点。`src/ui/tool-shell.js` 现仅让该路由跳过列表控制器及相应 refresh/dispose，继续复用原 ToolHost；侧栏的严格节点所有权、原安装器、标签页绑定及权限均不变。
- **最小验证：** 新增的真实 ToolShell 初始化回归在修复前抛出同一错误；修复后与侧栏所有权、SSR及关闭围栏共19项定向检查通过。命令为 `node --test --test-skip-pattern='expired preview is projected|a live preview opens' tests/environment/tool-shell-lifecycle-r37.test.mjs tests/environment/react-app-surface-ownership.test.mjs tests/environment/react-sidebar-app-shell-r351.test.mjs`。被排除的两项预览用例已用未修改的HEAD源码及测试复现失败，属于已有夹具/当前预览入口失配，未扩大修复；这不代表整文件或全部测试通过。独立只读审查未发现本次diff退化；模拟侧栏分类不证明Chrome分类通过。
- **编译与运行分层：** 保留原 watcher PID30103；其日志明确拒绝 `projects/webflow/trusted/CurrentTask.tsx` 来源漂移。未替换writer、重建输出或改pin。页面实际加载的旧 `ui/tool-shell.js` SHA-256为 `65975d413f532604a96c3eb59dd240511db1fa0fe0b293d45d770b2e96079911`，与磁盘旧产物相同，重新加载本任务页面仍报原错误；不能把源码修复当作页面已生效。
- **合法Demo入口缺口：** 原「开发→本地项目→在侧栏调试」只允许隔离storage及currentPage.info，原Controller需要的 `proxy.managed.getStatus` 与 `browser.network.request` 均不可调用。仅补 `dev/main.jsx` 构建入口无法接通Demo，故未实施；不能扩大预览权限、写storage伪造profile或自行调整固定开发包pin。下一步仍须候选owner通过原安装审阅链提供可接通Demo的同源候选，并协调43132原服务。

本轮原件位于忽略目录 `artifacts/market-vip-20261110-continuation/`，包含原Host回执、app异常、加载摘要、19项检查及source-evidence索引。没有新发测试码、启用代理、Cookie操作、安装升级或生产发布。当前新goal保持active；未取得完整DEMO/Chrome证据，不将受影响分支的资源阻断当作整目标完成。

### 历史组件阶段：修复与最小验证的关联

1. P0 首跑52项48 PASS/4 FAIL：三项旧 VM 把 ESM 当 script，一项误以为单次 event-loop tick足够完成WebCrypto。夹具注入原模块真实 exports、等待实际请求，保留生产ESM和VIP功能；真实浏览器两模块HTTP200。额外 query、Host等待期间改链、丢审阅回执后刷新和来源拒绝新增回归，防止错误接续。
2. 真实端口失配：CLI原监听7898、Controller新连接默认7903。现在原Provider在两端口共用同一SQLite；任一端口占用就释放自身listener并失败，不杀占用方。本轮独立CLI已实际启动、收到原Controller未经URL重定向的7903请求，并原DB重启回读；第二次启动EADDRINUSE未影响原进程或收据。
3. 预检条款缺结构：原preview增加开发专用 `demoGrant`，Controller验证SKU、数量、起效、期限和使用范围后显示完整中文说明；原四HTTP路由与redeem三字段不变。Provider新增增量 `preview_terms`，与预检同事务存摘要，确认时锁内重查主体/商品/数量/范围/有效期等原条款；改变则409 `E_PREVIEW_CHANGED`。旧无摘要预检要求重新审阅，旧收据仍可查，不删数据。
4. 新Controller测试使用真实源码和ESM、真实HTTP与SQLite；DOM、SDK传输、可信开发profile和开发连接控件是测试夹具。`src/main.jsx`不导入开发连接控件，实机新候选如何通过原合法入口接通Demo仍须核对；不得写storage模拟批准、把夹具点击当真实可信手势，或以Node结果冒充Chrome。

### 用户步骤与原始事实

| 前置条件 | 用户动作 | 原始回执 | 持久状态 | 禁止副作用 | 结果及证据 |
| --- | --- | --- | --- | --- | --- |
| 当前静态市场43134，正式Catalog1.4.32，无宿主receiver | 实际ego点击安装、打开安装帮助 | `E_NO_RECEIVER`，client/接续模块/channel均200；帮助明确正式获取地址未配置与现有开发目录/ID | sessionStorage新安装事务0 | 不静默装Chrome、不声称已装 | 浏览器页面分支PASS；`browser-current.json`、`install-help.json`、`no-host.png` |
| 模拟已安装同固定发行 | 点击打开应用并继续 | 原GET_APP_STATUS→OPEN_INSTALLED_APP，APP_OPENED之后才导航原7898 | 无新安装intent | 不重复安装、不在网站调用兑换 | 组件PASS；`market-p0.tap`；真实Host打开NOT_TESTED |
| 模拟未装、合法原fragment | 点击安装并返回 | 原OPEN_INSTALL_REVIEW→GET_INSTALL_STATUS已装→APP_OPENED | 同intent、仅SHA-256接续摘要；不存原引用 | 不给协议加激活码/URL，不自动重装 | 组件PASS；真实安装及换标签未验证 |
| 安装回执未知，刷新同页 | 核对安装结果 | 原GET_INSTALL_STATUS使用同intent，未知保留；确认已装后原打开操作 | 同session原事务 | 不创建第二安装 | 组件PASS；`lost review receipt…`；真实Worker停止NOT_TESTED |
| 审阅取消、fragment/query被改或Host拒绝provenance | 返回、等待APP_OPENED | 取消/拒绝后零跳转；等待中改链接也停止 | 原取消/事务状态 | 不自动复活、不越过来源校验 | 组件PASS；真实恶意安装包由原安装器保护，本轮原生未测 |
| 独立CLI同SQLite、已批准开发夹具 | 进入7898原链接、Controller自动预检 | landing200，原Controller请求7903 `/api/member`、`/api/preview`；账号l***@fixture.test、demo-quota、7次、确认生效、额度不设到期、领取截止、仅合成用途 | previews/条款摘要；redemptions=0 | 不消费、不写Cookie/开代理 | `controller-fixed-ports.json`；HTTP+SQLite PASS，真实Controller页面NOT_TESTED |
| 原预检有效 | 明确确认一次；重复点击 | 原redeem POST1次、200及原receipt；UI显示7 | SQLite同发放实例1条，恢复记录结清 | 不重复发放、Cookie/代理/开标签均0 | HTTP+SQLite PASS；同原件与`receipts.sqlite` |
| 两个独立Controller客户端同券 | 分别预检、同时确认 | 两个独立幂等键，200/409 E_ALREADY_REDEEMED | SQLite核销仍1条 | 不靠本地锁冒充唯一 | HTTP+SQLite PASS；`vip-p3.tap`；不同物理设备未测 |
| 已领取、Provider进程重启 | 重开Controller、查原键 | 重开只有7903 member GET；原status同redemptionId `8bb65f54-85b5-4f09-beb5-f1f84d6ea72a` | 原7次额度和1条收据保留 | 不新发券、不重新POST | 固定端口实测PASS；`restart.json` |
| POST已提交但丢回执 / 派发前断线未知 | 重启Provider/Controller、显式核对原交易 | 只POST原status与同key；已提交查同receipt，unknown保持锁定 | 原journal保留至可核验终态 | 不换key重兑、不覆盖unknown | HTTP+SQLite PASS；`vip-p3.tap`，实际网络故障/Worker仍未测 |
| 自动预检后取消 | 原账户同服务刷新 | 不再自动preview/redeem | 原持久暂停范围 | 不因重开或换票据复活 | Controller+SQLite及原LAN回归PASS；真实双Surface未测 |
| 预检后账号/SKU/数量/范围/截止被改、预检过期 | 确认 | Provider409 E_PREVIEW_CHANGED；或Controller到期前拒发POST | 零核销，未知记录保留 | 不把旧审阅套到新条款 | HTTP+SQLite PASS；非法结构数量/范围/日期亦零POST |
| 无新版正式候选、旧43132来源占用 | 完整网页→安装→预检→确认→回读 | 本轮尚无对应原生收据 | 正式1.4.32与原服务保留 | 不抢包晋升、不换来源或清账制造成功 | `BLOCKED_BY_VIP_PACKAGE_OWNER`；完整DEMO/Chrome NOT_TESTED |

原始文件统一在本机忽略目录 [`artifacts/market-vip-20261110-evidence/`](../../../../artifacts/market-vip-20261110-evidence/)，含合成领取引用和只用于本实验的SQLite，不是可部署网站、正式包或另一状态报告；本条随代码保存，原件不作为公共制品提交。`source-evidence.json`记录源码、正式包与原件摘要。测试夹具临时DB与正式/历史服务账本分离。

### 已执行命令与边界

```sh
node --test tests/environment/market-site-client-r5.test.mjs tests/environment/market-page-discovery-r61.test.mjs tests/environment/market-vip-continuation.test.mjs
# 56/56 PASS；原件 market-p0.tap
node --test projects/ai-vip-share/tests/controller-demo-provider.integration.test.mjs projects/ai-vip-share/tests/demo-provider.test.mjs projects/ai-vip-share/tests/activation-links.test.mjs projects/ai-vip-share/tests/controller-lan-activation.test.mjs
# 29/29 PASS；原件 vip-p3.tap
npm run build:market-site
# PASS；build-market.log
node --check projects/ai-vip-share/src/main.js
node --check projects/ai-vip-share/server/demo-provider.mjs
node --check src/market-site/client.js
node --check src/market-site/vip-continuation.js
# PASS；任务文件 git diff --check PASS
```

本轮只有相关定向检查，没有重跑整体App/Market CI，历史整体FAIL仍有效，其他68项失败未全量归因或修复。原网站构建 `dist/app-market-public` buildId `f793dedd07c6a19be99548026483d1ce850a2154fa0a867d6a3f546abbef9365`，22 apps/53 releases；独立43134预览 buildId `9ae27c0dae623ab9b3e75c9f17a2d404c84b2391539049ee9b6c4580c65ad829`，18 apps/45 releases；目录的历史发行集合不同，VIP固定包身份相同。构建包括并行Catalog输入，不证明其他工具通过本任务。一次预览重建因本任务截图误放受控产物目录失败，移到独立原件目录后成功；未绕过产物完整性校验。

实际 ego TaskSpace56、Chrome UA156，本轮页面资源与缺宿主分支通过，TaskSpace已finish释放；未选择/占用另一对话专用Profile、未触发安装或Cookie授权。43132/PID81835的旧Python快照仍显示VIP1.4.2；保留原dev watcher PID30103/43119/43120，不以端口监听替代原生serve连接/加载路径验证。完整新包安装、真实标签切换/Worker重启、权限/撤权、Side Panel/app.html一致性为NOT_TESTED；另一owner的完整Cookie登录验收未重跑。

### 五角色评分与反方审计

以下是**单执行者模拟评审，不是独立专家**。曾分派有界executor，因429中止，未取得独立审核报告，部分源码由主执行者接管验证。每角色按所列顺序五项、每项满分20；分数是审阅判断，不是实测性能指标。提示词、可执行方案与实际实现分别评分；缺实机证据的实现项目标NOT_SCORED，不能按余项补满。

| 角色、五项标准（顺序对应分数） | 提示词五项 / 总分 | 方案五项 / 总分 | 实际实现五项 / 总分 |
| --- | --- | --- | --- |
| 产品体验：完整路径、预检、取消、恢复、可读性 | 20/20/20/20/19 =99 | 19/19/19/18/19 =94 | NOT_SCORED/19/19/19/18；总NOT_SCORED |
| 平台架构：唯一owner、严格协议、原权限、双Surface、兼容 | 20/20/20/19/20 =99 | 20/20/19/16/19 =94 | 20/20/NOT_SCORED/NOT_SCORED/19；总NOT_SCORED |
| 安全事务：主体、条款与提交、取消持久、原子唯一、真实权限 | 20/20/20/20/20 =100 | 20/19/19/19/18 =95 | 19/19/19/19/NOT_SCORED；总NOT_SCORED |
| 实现验收：核心代码、定向测试、同源新包、Chrome、Provider | 20/20/19/20/19 =98 | 20/20/17/16/18 =91 | 20/20/NOT_SCORED/NOT_SCORED/19；总NOT_SCORED |
| 指令交付：原目标、理由、执行条件、禁止项、证据边界 | 20/20/20/20/20 =100 | 20/20/20/20/19 =99 | 20/19/20/20/19 =98 |

提示词综合 **99.2**；方案综合 **94.6**；实际实现综合 **NOT_SCORED**（不能把98或部分组件分数当五角平均）。尚未达到完整实现≥95的验收目标；已验证安全项通过，真实候选权限/撤权等硬条件尚未取得本轮证据，整体不判通过。

反方逐项结果：重复安装/unknown新安装有原intent恢复组件证据；来源伪造及等待中改链被拒绝，恶意包仍交原provenance/安装器，原生攻击未测；错误主体与预检条款替换由服务端拒绝；取消后刷新不自动复活；跨客户端同发放只核销一次；丢回执不换key；零Cookie/代理调用；没有复制框架。不能以测试中的可信profile或模拟Host回执证明真实权限与包安全。

### 历史交接边界（已被本页18:48结果更新）

当前 `CODE_READY`、定向 `TEST_PASS`；完整 `DEMO_PASS`、`CHROME_PASS` 均**未取得**，`PRODUCTION_BLOCKED`。

1. 包owner把本次原Controller结构化预检差量纳入最新源码候选，经原打包/晋升/安装审阅；核对实际候选与合法开发服务入口，不能将1.4.32冒称新代码。仍记 `BLOCKED_BY_VIP_PACKAGE_OWNER`，本轮不改正式JSON、版本或来源pin。
2. 由现有43132服务owner协调切换当前市场产物；不能占用或替换旧服务，也不能用43134替代已批准来源来做验收。
3. 同一专用Profile经原Market审阅/打开回执接续7898，再由原Controller预检、一次确认、SQLite发放与原工具回读；补真实Worker/标签切换和双Surface一致性。仅做跨系统必要复核，不重跑另一owner的完整Cookie登录。
4. 正式HTTPS/channel、Chrome获取/发行与商业身份/Provider另按生产条件交付；开发合成权益不能部署成商业会员服务。

该历史轮次自建Demo Provider和43134预览在当时收尾后释放，原件SQLite与收据保留；复现须显式复用原DB路径，不能重新发行同业务实例代替恢复。其他服务、浏览器和未提交改动均保留。本轮只本地提交本任务精确路径到main，不推送。


## 2026-11-10：Market × AI VIP Share 开发 Provider 增量（源码/测试入口；未冒充 Chrome 通过）

**源码 owner 及变更：** 新增 `projects/ai-vip-share/server/demo-provider.mjs`（Node 22 `node:sqlite`，仅 loopback + 显式开发 env + SQLite 原子一次领取）；新增 `tests/demo-provider.test.mjs`；Market 网站 `src/market-site/client.js` 仅对 VIP 使用原已安装状态/打开操作，`src/market-site/vip-continuation.js` 校验精确开发链接和不含原票据的接续摘要，`scripts/build-market-site.mjs` 输出模块，`tests/environment/market-vip-continuation.test.mjs` 是组件闭环；原旧 Market 测试仅替换 VM 的静态 ESM import stub，未更换安装协议或原业务校验。现存 1.4.32 包和本机运行资源不触碰。

**真实结果与边界：** 此条最初只记录已提交代码和命令，非宣称测试 PASS。验收需取得原始 Node 测试/SQLite 文件 WAL/唯一约束回执、网页构建输出和同一 Profile 的原生 Chrome 安装/激活证据；当前仅可据源码确认存在数据库事务与唯一索引设计，不能把它标为已验证跨设备商业核销。SQLite 相同业务意图并发的两个 DB 句柄是开发约束测试，不是多物理设备/正式商业服务。生产 HTTPS/Market channel、商业会员与 Cookie/第三方身份核验均未配置，**BLOCKED**。其他对话正在处理 1.4.32→新候选，不能在此重做晋升或动原历史 journal。

**安全矩阵（前置 → 动作 → 原回执 → 持久状态 → 禁止副作用 → 证据状态）：**

| 前置与动作 | 需要的回执/持久状态 | 禁止副作用 | 当前证据 |
| --- | --- | --- | --- |
| 新短引用，读取 /api/preview | 完整账号、SKU 与固定范围；previews 有效，redemptions=0 | 不核销、不发 Cookie | 源码及新增 Node 用例；待真实 stdout |
| 原卡业务确认一次，两次并发及刷新 | /api/redeem receipt、SQLite 同发放实例唯一行、同 idempotencyKey 返回同笔 | 不重复发放 | Node SQLite 双句柄用例；跨真实设备 NOT_TESTED |
| 已领取，回执丢失/换客户端 | /api/status 按原键或稳定四元组返回先前收据 | 不换新 key 盲目 POST | 代码与 Node 用例；真实断网/Worker 重启 NOT_TESTED |
| 页面改链接、取消、过期、Host 不存在 | 留原 intent/status 或显示手动入口 | 不静默重装/不触发兑换 | 市场 VM 单元用例；真实 Chrome NOT_TESTED |
| 固定发行不符、站点权限与 Cookie | 原 Market provenance / SDK / 原批次显式授权 | 不发凭据、不启动代理 | 原框架代码未改；整条新链 Chrome NOT_TESTED |
| 正式 HTTPS/真实权益 | 必须商业身份、真实 Provider、审核发布渠道 | 不把本地 demo 当正式权益 | BLOCKED |

**命令（Node ≥22.12）：** `node --test projects/ai-vip-share/tests/demo-provider.test.mjs tests/environment/market-vip-continuation.test.mjs tests/environment/market-site-client-r5.test.mjs`；`node --check projects/ai-vip-share/server/demo-provider.mjs`；`npm run build:market-site`。服务运行及发行命令见 [DESIGN §5.5](../../DESIGN.zh-CN.md)。**如果 7898 被本机旧 fixture 占用，不重启、停止或清库；测试使用临时端口/隔离数据库。**



## 2026-11-10：可信专属链接自动预检与取消（Node/fixture 证据，未发布新包）

**范围**：仅 AI VIP Share 原业务源码与定向测试；提交 [0452bff](https://github.com/shopable-ai/opendesk-browser/commit/0452bff3090718254677fe0b39fb92712bbe2b55)、取消迟到响应修复 [e0d4b43](https://github.com/shopable-ai/opendesk-browser/commit/e0d4b43d1c00af9cc35eb5c4239275e4bc62c4a9)。不修改原 Market/Installed Authority/SDK/Cookie 事实源，不发布安装包；当前历史正式包仍 1.4.32，既有真实 ChatGPT 登录证据不升级为新链接/商业 VIP 验收。

| 前置 → 动作 | 真实测试结果及禁止副作用 | 原始证据 |
| --- | --- | --- |
| 当前合法开发来源、模拟已装/绑定 → 自动预检、用户明确确认 | **PASS**；确认前仅有无核销预检，确认后原兑换仅 1 POST；不写 Cookie、不启代理 | [App CI 42676450891](https://github.com/shopable-ai/opendesk-browser/actions/runs/42676450891)，用例 40 |
| 假源、编码别名、多余参数、跨已批准来源切换 → 检查 | **PASS**；不带码/不擅自预检或兑换；浏览器本机真实地址归一化仍 NOT_TESTED | 同运行用例 38、41–42 |
| 取消 → 同账号不同码/模拟重开 → 人工再预检 | **PASS**；持久暂停自动预检，手动领取合法新兑换仍可完成；真正双 Surface/双客户端未测 | 同运行用例 39、43 |
| 自动预检迟到 → 取消 | **PASS**；晚到预检不恢复待确认状态，零兑换 | 同运行用例 45 |
| 确认期间会员 GET 等待 → 取消再返回 | **PASS**；未发兑换 POST；首轮测试遗漏原 HTTP 请求头造成断言失败，第二提交修复夹具并使取消状态优先 | 首轮 [42675696828](https://github.com/shopable-ai/opendesk-browser/actions/runs/42675696828) 用例 44 FAIL；次轮 42676450891 用例 44 PASS |
| 兑换 POST 已派发 → 取消后回执到达 | **PASS**；仍显示原服务端成功 receipt，不重复发放、不自动写网站 Cookie 或跳转 | 次轮用例 46 |
| LAN 指引及原拒绝策略 → 非法方法/路径/跨源 | **PASS**；静态指引不代替安装许可，HTTP 夹具严格来源 | 次轮用例 180–183 |

本轮新链接/取消 **9/9 PASS**，LAN 安全入口 **4/4 PASS**，**仅受控 Node/fixture 证据**。同次整个 App CI 为 **424 个测试：342 PASS / 68 FAIL / 14 CANCELLED**，状态 **FAIL**；遗留故障包含历史 URL/端口、版本断言与旧 UI 文案不一致，还有部分 HTTP/setup 与 Cookie 测试未完成，**没有证明全部是本轮引入或全部是历史遗留**。旧版 [AI VIP Share R2 专项工作流 42675696733](https://github.com/shopable-ai/opendesk-browser/actions/runs/42675696733) 同样 FAIL，旧断言含 1.4.11 而当前包配置 1.4.32。禁止用局部 PASS 抵消失败；只修具体受影响或安全核心缺口，其他问题分开由原 owner 处理。

**生产阻断（NOT_TESTED）**：正式 HTTPS 入口、Market channel/固定发行、短时受限业务引用、Provider 稳定领取意图及跨客户端原子唯一、完整 SKU 数量/起效/动作范围、双 Surface/宿主安装、实际 Chrome/网站登录与第三方 VIP。没有可验证 Provider 时不开放生产自动核销；旧 voucher/Cookie unknown 记录不能清除或换 key 重兑。下一动作仅本地 Codex 定向核查失败输入、无歧义修复受影响核心项、通过原 App CI/打包链再考虑安装与真实服务验收。


<a id="independent-login-1432-20261107"></a>

## 2026-11-07：独立对话使用当前安装完成 ChatGPT 新登录（1.4.32）

本轮 owner `01a1b52e-2e10-7803-9a56-cc19be2ac0ed`，独立于 URL 体验对话；只验证正常登录核心链，没有修改源码、界面、版本、安装包或 Framework。时间均为北京时间。用户已删除登录状态，本轮没有再次清理网站数据。

| 用户操作 | 本轮新证据 | 边界 |
| --- | --- | --- |
| 正确 Profile 与未登录基线 | 复用 ego `Profile 1 / AI VIP Share Test 20261106`、TaskSpace3；本轮新建 ChatGPT 页显示登录=true、注册=true、消息草稿为空=true | TaskSpace共享Profile，不提供额外Cookie隔离；未登录基线由登录/注册入口证明。初查旧data-testid未匹配，不单独用它证明个人资料菜单不存在；不是复用历史截图或旧登录 |
| 当前真实安装 | 原 Side Panel「扩展 → AI VIP Share」显示 v1.4.32；从现有扩展页只读核对安装记录，完整对象按递归排序后与磁盘正式包一致 | 原始包 143989 字节，SHA-256 `cbffe4776d5530e64b19eb500e9c58b64e41d14bddefde96c59cba2e2367beda`；双方排序 JSON SHA-256 均为 `bfe296e679dbc7c974e35a526f3fd09ba850bc76ca015c6db738b6b3dc9fc2a5`。未安装 URL 对话临时候选 |
| 当前运行身份 | Chrome 扩展详情实读启用、ID `ccfcjegpkdlgbclopjmadlcjedelidmf`、加载路径 `/Users/shopme/Documents/workspace/opendesk-browser/dist/development`；原调试页显示开发服务已连接，revision `e128547b050ffff3822045b7e1283c244e042bd8b4ca376bebd36d6a35a64b19` | 持续开发环境；复用原 writer PID87598 的43119/43120，没有构建、重装或改 Native 配对 |
| 原来源与新实验 | 开始时7903无监听、工具显示会员无法核验。原授权文件经原完整预检仍25项、保留22项、跳过3项过期，批次21+1；原协议新实验 `independent-login-20261107-1648` 精确绑定127.0.0.1与实际扩展Origin | 旧内存账本已退出、不可恢复，不冒称恢复旧权益或事务。新主体及新未消费测试码由原UI预检和确认，未直接HTTP代办兑换 |
| 原卡一次激活 | 16:48:52 原UI预检成功，服务器兑换账本0；16:48:57–58明确确认后 redeem POST仅1次、账本1、20次实验额度，随后原状态查询提供当前会话 | 仅本机测试实现，不是生产会员。代理租约始终0，未点击启用代理；未额外取消或重复兑换 |
| 核对与逐批可信确认 | 原卡显示chatgpt.com、未提供脱敏身份/网站身份未核验、交付截止16:50及25/22/3。每批各自点击原按钮，再确认可信宿主提示；现有精确网站授权可复用，无额外权限申请 | 最终工具显示全部批次已写入并核验并自动打开正确网站。原journal只读内存解码：schema7、7203字节、19条attempt；最新两条分别21/21 saved+verified、1/1 saved+verified，均success。未写存储、删历史或清锁 |
| 网站独立新登录 | 16:50:52 新目标页：登录=false、注册=false、个人资料菜单=true、挑战页=false、草稿为空=true；16:51:05菜单内设置=true、退出登录=true，随后关闭菜单 | 证明本轮未登录→新登录。没有读取账号标识/聊天历史、发送消息或使用付费能力；账号匹配、Plus/VIP、套餐和网站期限均NOT_TESTED |

首次网站观察器使用旧 `data-testid` 等待30秒未匹配；只读诊断发现当前网站使用 `aria-label="打开个人资料菜单"`，改用实际可见控件后核验成功。这是驱动选择器差异，没有把有效产品改成适配旧断言，也没有重写Cookie或重新兑换。原生输入框AX点击未获得焦点时，改用CUA支持的setValue完成输入；可信确认仍经原宿主按钮，未伪造事件或回执。

原授权文件前后均13841字节、mtimeNs `1793896382356555343`、SHA-256 `abfed7ca33b3637806a68be180ef90e52aa1e5d3a9d8b22e9d8a4a2c0061c514`；保留项最早自然到期仍2026-11-13 00:18:02.784。未修改、复制明文、输出名称/值/token或上传LAN/外部Provider。完整结构与Store/Partition声明由原预检及实际可信Host链处理，没有绕过原SDK。

本轮验证限于上述正常原生链、安装对象一致性、原文件摘要及非秘密journal回执；没有源码变化，不重复历史95项测试、构建或全量验收。唯一证据仅追加本节。生产、商业、真实代理流量、完整矩阵、评分及URL体验重设计继续不在本轮范围。

收尾保留本次已登录ChatGPT结果页和所有未知来源页，关闭本任务基线/检查页；TaskSpace3按指南finish一次，原生UI租约释放。新fixture PID907（终端session85816，owner同本节）保留本次一条兑换的内存账本供后续使用，不表示永久运行；原共享dev writer及其他任务资源未停止。后续重查进程/监听与归属，不能用本节历史PID冒称当前仍运行。ego提示有可用更新，本轮没有升级。仅本证据文件精确范围本地提交到main，不推送。

手动复现：在同一专用Profile打开「扩展 → AI VIP Share」，已有本次权益时直接选当前分配并准备登录，核对chatgpt.com与交付期限，分别确认21项和1项的可信操作，最后在网站检查个人资料菜单；来源服务离线或分配过期时先核对服务方，勿重用已消费码或清除恢复记录。

<a id="clean-login-1432-20261107"></a>

## 2026-11-07：清除专用本地登录态后从原服务端链证明新登录（1.4.32）

本轮仅完成用户授权的核心开发和最小验证，全部时间为北京时间。复用ego Profile1 `AI VIP Share Test 20261106`、唯一TaskSpace3；TaskSpace不提供Cookie隔离。只清除该专用Profile的ChatGPT本地站点数据，没有服务端退出或撤销原会话，没有触碰其他Profile、站点及未知来源页面。

### 用户操作与当前结果

| 操作 | 新鲜证据 | 边界 |
| --- | --- | --- |
| 清除并证明未登录 | 沿浏览器原设置的chatgpt.com站点详情删除本地数据；14:44:49新页显示登录/免费注册，无账号菜单。原文件来源未提交 | 不用旧已登录页面代替基线；只影响获授权测试Profile的这个站点 |
| 原卡激活 | 新本机实验14:46预检后取消，账本0；14:48再次预检并明确确认，POST redeem仅1次、账本1、20次实验额度 | 旧7903进程已退出，旧内存账本不可恢复；本次是新实验，不冒充旧事务恢复，额度不等于付费会员 |
| 复现当前阻塞 | 1.4.31首批在原可信确认出现前报恢复容量不足；本次未派发Cookie，原14条历史保留 | 该失败触发1.4.32；不把1.4.31失败与最终候选成功混记 |
| 原安装更新及基线复核 | 原安装器1.4.31→1.4.32，摘要匹配、权限未变、保留原数据。15:00:14刷新仍登录/注册可见、账号菜单不存在；经原设置审阅同一https://chatgpt.com网站权限 | 框架跨包授权承接缺口仍在，未改写grant或扩大站点范围 |
| 准备及可信取消 | 原卡复用已有权益，显示chatgpt.com、共享A、未提供脱敏身份/网站身份未核验；25项保留22项、跳过3项过期，21+1批。首批原可信宿主审阅后取消，返回未提交；15:01:23刷新仍未登录，输入框为空 | 没有直接HTTP代办兑换、前端文件导入、CDP注入或自动重试 |
| 两批主动确认 | 再次主动确认首批21项，经原可信确认成功；独立确认第二批1项后，工具显示全部批次已写入并核验并打开正确ChatGPT目标 | 实际回执分别21/21和1/1 verified；原Store/Partition及逐批手势保留 |
| 网站新登录 | 15:02:18新页登录/注册入口消失且存在个人资料菜单；15:02:40菜单显示设置/退出登录。15:04:51最终仍已登录，输入框为空 | 证明未登录→登录；未读取账号标识、历史会话或发送消息。服务没有合法脱敏身份，匹配、Plus/VIP、套餐和到期均NOT_TESTED |
| 重开安全 | 15:03返回列表再打开v1.4.32，仍20次、一条兑换，无当前待确认批次，代理未启用；服务仅新增GET member，redemptions=1、sessionRequests=2不变 | 两次sessionRequests分别为1.4.31失败前与1.4.32主动准备；重开零领取由服务日志支持，Cookie/开站/START调用级零重放由控制器回归证明，未采全局桥计数 |

### 最小修复与验证

`cookie-journal.js`仅在schema6超过原8192字节预算时选schema7：对作用域组成字段建立字典，对合法连续verified前缀与末项结果无损编码；对外仍schema2。兼容旧3–6版本，保留全部attempt/legacy事实、原键CAS、精确回读、pending/unknown锁、范围与重放约束。规范重编码拒绝损坏引用、额外/重复/未使用字典及非规范结果。没有提高上限、删除历史、改变权限或增加Host/API。

旧代码先在新增累计21项历史回归中失败。修复后该用例从7660字节历史完成取消及21+1批次，最终7197字节，历史逐项不变；真正超限最坏回执8193字节在存储和Cookie派发前拒绝。两个journal文件43项、升级恢复/服务器批次/原生回归三个文件47项、原固定development来源保护5项，共95项PASS。独立只读审查未发现P0–P2，另检查589组合法往返及33组损坏输入；LSP/AST专用工具不可用，不作完整类型安全结论。

15:04:29对实际安装存储仅做内存只读解码：原schema6为7298字节、14条attempt；最终schema7为6615字节、17条attempt，新增三条依次为21项not-submitted且零结果、21项success且21项verified、1项success且1项verified。原legacy就是null，没有清空历史；未输出或保存Cookie名称、值、token或原始存储副本。

`main.js`只递增包版本并承接1.4.31原未决兑换；不更换服务或事务。相关版本/测试同步，工具Vite构建、语法、定向diff与候选校验通过。未跑根npm test、全量CI、production、压力/变异或评分；未变的多站隔离与外部来源保护沿用前节相应证据。

### 同一候选与运行资源

唯一正式包 **1.4.32 / 143989字节 / SHA-256 `cbffe4776d5530e64b19eb500e9c58b64e41d14bddefde96c59cba2e2367beda`**。原打包器临时候选→相关检查→同一打包器晋升→PROJECT_PACKAGE_MATCH；development资源及原安装器原始/规范候选摘要一致。原7项能力未变。只更新既有固定development代理例外的精确包pin与其定向测试，不引入普通运行的Catalog匹配门槛；实际未启用代理。

固定扩展ID `ccfcjegpkdlgbclopjmadlcjedelidmf`，实际加载路径仍`dist/development`。原dev进程已退出，本轮恢复的进程在默认4GiB堆上限OOM后也已退出；确认无其他writer后，用临时8GiB堆上限恢复原npm run dev。最终唯一writer PID71650监听43119/43120，实际调试UI显示开发服务已连接，revision `d74c8f7b906113088b1fb08a7c547c8fab2960d811246d9930e8b867ebd5e6ce`。这是持续开发证据，不是production验收。Native doctor显示未连接，但local.extensionId与manifest allowed_origins匹配；本次不依赖Native，不修改配对。

新实验服务PID69763持续监听127.0.0.1:7903，保留这一条兑换的内存账本，没有为升级重启。原用户文件前后均13841字节、mtimeNs `1793896382356555343`、SHA-256 `abfed7ca33b3637806a68be180ef90e52aa1e5d3a9d8b22e9d8a4a2c0061c514`，未改变或保存副本；保留项最早自然到期2026-11-13 00:18:02.784，没有续期。

TaskSpace3本轮已finish一次，仅保留新登录结果p3及所有未知来源页，关闭本任务检查页；原生UI租约已释放。ego提示有更新，本轮没有升级。服务与dev writer保留，其他owner改动不纳入提交。源码、唯一包、两pin与本三份文档精确提交到main本地，不推送；提交ID以Git及最终回执为准。生产、商业/支付、真实代理流量、身份匹配、Plus/VIP、完整矩阵及评分继续延期。

以下历史候选按各自时间与阶段阅读，不覆盖本节新登录结果。

<a id="real-chatgpt-1431-20261107"></a>

## 2026-11-07：真实服务端会话逐批写入及多站最小修复（1.4.31）

本轮按[现行目标K1–K9](../../ROADMAP.zh-CN.md#current-goal-tests)完成核心开发与最小验证。服务器读取用户授权的原Cookie文件，用户界面继续走原激活/分配、网站授权及逐批可信确认；没有用户导入文件、HTTP代办兑换、CDP注入、清历史或重建旧事务。以下时间为北京时间。

### 当前操作证据

| 条件 | 本轮结果 | 证据边界 |
| --- | --- | --- |
| K1 一次激活 | 新本机实验原UI预检取消：POST preview一次且兑换账本0；随后再次预检并明确确认，POST redeem仅1次，账本1，20次实验额度。后续准备及重开仍账本1 | 旧7903进程已退出，不声称恢复旧账本。新实验不复用已消费码；实验额度不等于付费会员 |
| K2 身份及期限 | 原卡显示chatgpt.com、共享账号A、服务器未提供脱敏账号/网站身份未核验、明确交付截止时间；原文件25项，保留22项，跳过3项过期，21+1两批 | 外部来源没有真实账号摘要，未套用fixture身份；交付窗口不等于网站套餐期限 |
| K3 可信取消及确认 | 03:08前后1.4.31首批原可信宿主审阅21条，点击取消，返回“未提交写入”；主动再确认21条成功，再独立可信确认1条成功，全部核验后才开ChatGPT | 实际宿主取消和两批结果已观察；未取得浏览器全局Cookie/START总计数，调用级零重试由定向控制器回归证明 |
| K4 变化停止 | 当前服务器/控制器回归覆盖分配撤权、Store变化、到期/晚回执、来源文件变化及来源摘要非法；普通A→B→A迟到响应拒绝 | 当前原生服务撤权、所有真实站点到期矩阵NOT_TESTED；1.4.29服务自然到期属于历史 |
| K5 容量与unknown | 1.4.30真实首批在可信确认前因8KiB容量停止，零本次派发；1.4.31结果元组无损压缩后实际两批成功。schema3/4/5可读；legacy事实、CAS、未知锁和真正超限零写入定向通过 | 未扩大8192字节上限、删回执或将unknown改成功；容量仍有限 |
| K6 重开 | 03:09返回扩展列表再打开1.4.31：仍20次、一条兑换，只恢复“上次批次”非秘密结果，无待确认批次，代理未启用。服务日志仅后续GET/member，无新增兑换 | 重开的调用级零领取/写入/开站/START由控制器回归证明；原生可见状态不能替代全量桥计数 |
| K7 网站独立核验 | 全批成功后新开正确ChatGPT目标；账号菜单可见“设置”“退出登录”，当前登录可用 | 写入前刷新原网站就已登录，因此本轮仅证明写入后保留登录，不证明新登录/身份匹配/Plus/VIP。未发送消息或读取历史会话；套餐、到期NOT_TESTED |
| K8 多网站隔离 | 两固定受控站点复用来源授权/交付/原Cookie handler/原键CAS恢复。合法不同脱敏摘要可准备并在确认后写入，非法值零交付日志/SDK写入；同ID跨Host、A/B迟到、重开、重叠范围及unknown围栏检查通过 | 本轮K8为Node/VM隔离证据，未新做两站原生全链；account/delivery/request同值有纯作用域验证，整控制器三ID同时同值未单独新增。固定两个fixture与专用ChatGPT导出适配不等于任意网站即接即用 |
| K9 同源更新 | 原安装器1.4.29→1.4.30→1.4.31，实际标题v1.4.31；审阅明确权限不变、原应用数据保留；正式包和development发行资源同SHA | 跨版本网站授权承接缺口仍在，首次准备被拒绝后沿原设置重新审阅同一https://chatgpt.com站点；未改写grant或扩权 |

### 真实缺陷与最小修复

- `cookie-journal.js`：只在前一存储编码超过原配额时使用schema6结果元组（包括legacy结果），对外仍schema2。规范回读拒绝损坏/非规范元组；保留每条历史、原键CAS、派发前最坏回执预算及未知锁。21项成功历史+新21项最坏结果从8322/8323字节降至7181/7182字节；真正超限案例仍在存储写入和Cookie派发前拒绝。
- `main.js`：新尝试在派发前失败时不把旧成功逐项回执及核验按钮显示为本次结果；正常重开仍可看历史。升级恢复版本承接1.4.29/1.4.30，保留原未决事务，只查原键。
- `site-session.js`：普通站点不再要求固定`o***@fixture.test`；复用受约束的脱敏展示校验，长度/空白/控制及双向字符仍拒绝。来源授权、scope、目标、Store/Partition与能力边界未放宽。无第二套Host、来源管理器或任意远程站点配置。

### 验证与唯一正式包

当前容量/恢复/普通来源/会话/作用域及切站7文件共94项PASS；升级恢复27项PASS；外部文件来源6项PASS（前序同输入）；原固定development来源保护5项及候选晋升/同版本覆盖保护2项PASS。工具Vite构建、JS语法、定向diff与PROJECT_PACKAGE_MATCH通过。旧v4容量断言因新编码已能容纳而调整为v6真实超限输入，没有放宽容量保护。未跑根全量CI、Browser全量构建或production矩阵。

唯一正式包 **1.4.31 / 142684字节 / SHA-256 `a0703d7facab9d651c70236dcdf7509ac21f6db81c489e7fc4dafd6408146d24`**。先原打包器临时候选，经相关检查后用同一打包器晋升并同源核对；原7项能力未变。只同步既有development代理例外的精确包pin及其测试，不新增普通运行的发行匹配门槛。1.4.30中间包（141887字节/SHA `060f599626d8d47ce8c8bc275b1f401806c8836be5ce3ff91bcdaefc1e55324e`）实际容量失败，不能与最终包证据混用。

### 历史恢复、原文件与资源

1.4.18历史证据确有独立Profile未登录→21+1批次→真实登录；1.4.22服务端批次前已登录，仅证明交付/写入和登录保留；1.4.29原分配到期不能提供当前正向会话。三者与本轮1.4.31分别使用，不以源码/包或旧登录代替新证据。

原授权文件只由本机服务源读取，前后均13841字节、SHA-256 `abfed7ca33b3637806a68be180ef90e52aa1e5d3a9d8b22e9d8a4a2c0061c514`、mtimeNs `1793896382356555343`，未变化。保留22项最早自然到期为2026-11-13 00:18:02.784；不会延长原Cookie期限。没有输出Cookie名称/值/token、提交原文件或保存明文副本。

继续使用ego Profile1 `AI VIP Share Test 20261106`和唯一TaskSpace3；TaskSpace不隔离Cookie。本轮finish一次，保留新实站结果p6与全部未知来源页，关闭本任务检查页；原生UI租约已释放。固定扩展ID `ccfcjegpkdlgbclopjmadlcjedelidmf`、真实路径`dist/development`；原调试UI连接指纹`45c47dee67c71a4e6a6b8c8db0ace2ac114442c2473f8251a0591f4766b54621`属本轮初查，后续pin同步触发原安全重载，不冒充最终production指纹。原dev writer PID39535保留，不启第二writer、改Native配对或干扰其他owner。

本轮新实验服务PID54627监听127.0.0.1:7903，内存账本保留，不重启清账；本机服务只记录方法/路径、状态、调用数与兑换数，不记录会话。生产、支付/商业、真实代理流量、Plus/VIP、完整矩阵与评分仍延期。独立只读审查限定本任务diff未发现P0–P2问题；8文件语法、内存预算/往返及两pin核对通过。lsp_diagnostics与ast_grep_search不可用，不冒称完整类型诊断批准。源码、唯一包、两pin及文档仅16文件纳入main本地精确范围提交，不推送；提交ID以Git及本对话最终回执核对。

以下各历史候选按各自时间与阶段阅读。

<a id="allocation-goal-1429-20261106"></a>

## 2026-11-06：原安装更新、分配到期与重开收尾（1.4.29）

阶段保持核心开发及最小验证。原目标与K1–K8见[唯一方案](../../ROADMAP.zh-CN.md#current-goal-tests)。UI资源释放后重新取得本任务租约，继续原Profile1/TaskSpace3；没有扩大为生产、商业、真实ChatGPT Plus、完整矩阵或评分。

### 实际用户操作与完成证据

| 条件 | 当前证据 | 边界 |
| --- | --- | --- |
| K1 一次激活 | 原服务仍一条兑换/20次额度；本轮只读刷新、安装和重开，没有输入/确认兑换码 | 全局最终POST/START计数未取得，不以UI代替全量计数 |
| K2 身份可核对 | 1.4.28新增可选脱敏字段，缺失兼容、合法展示、非法拒绝、不持久化的控制器回归通过 | 当前服务授权已到期，无可用目录；新包正向脱敏字段原生展示NOT_TESTED |
| K3 主动确认与取消 | 当前控制器取消零写入、正常主动提交一次；1.4.27原可信取消是未改动确认/取消路径的历史证据 | 新包有效交付取消和Cookie写入未原生重验；不使用已消费码或旧交付补测 |
| K4 失效停止 | 只读GET /api/member确认20次quota保留、feature截止1793962302665（18:51:42）、sharedAccounts缺失；19:26的1.4.29实际界面明确无可用分配，不能准备或提交 | 服务到期是真实停止，非产品登录故障；服务撤权原生观察仍NOT_TESTED |
| K5 未知不重放 | 本轮未改journal/CAS/容量/未知锁；1.4.28相关批次回归与1.4.27容量证据按受影响范围继承 | 没有清键、删历史、换未知状态或重放旧交付 |
| K6 重开安全 | 19:27返回扩展列表再打开1.4.29：仍一条兑换/20次额度，无当前交付、无批次按钮，网站未登录、代理未启用 | 可见行为通过；调用级零重放由当前控制器回归证明，不伪报本轮全量桥计数 |
| K7 网站独立核验 | 7903网站持续未登录/模拟VIP不可用；服务与工具额度分开 | 1.4.27合成登录/自然到期为历史证据；当前新包写后登录、真实身份/Plus仍NOT_TESTED |
| K8 同源安装 | 原管理菜单审阅1.4.27→1.4.28→1.4.29；各原始/候选SHA与正式包一致，权限未变化、保留原数据，实际标题v1.4.29 | 原设置显示本站未授权，框架跨包授权承接缺口仍保留；本轮未增加或重新授予站点权限 |

### 真实复现、最小修复与验证

19:19安装1.4.28后，会员额度仍有效但原卡既无分配也无说明，仅显示“激活权益→准备会话”。直接只读诊断确认：服务一小时分配授权已过期，返回额度20/兑换1但不返回目录。没有借stdin修改授权、重启账本或重复兑换。

旧源码先在到期/撤权用例失败。1.4.29只在已核验账号有成功兑换但没有当前分配时，显示“当前没有可用的网站会话分配。请联系服务方核对授权；不会自动重复兑换。”不猜缺失原因，不改变授权或兑换按钮语义。新增回归同时核对配额保留、交付清理、兑换一次以及零Cookie/开站/START。恢复兼容承接1.4.28原未决事务。

最新37项展示/升级恢复PASS、5项原development代理来源保护PASS；main语法、工具Vite构建、候选晋升与PROJECT_PACKAGE_MATCH及定向diff通过。未受影响的1.4.28服务器批次、fixture、外部来源与原打包器保护直接复用，不重复全组或相加计数。只读审查1.4.28未发现可操作问题；新1.4.29的两行展示分支由实际UI与针对性回归核对。

### 唯一正式包与持续开发环境

最终包 **1.4.29 / 141754字节 / SHA-256 5823d1147598523739a7c05d77027a16585a17b713df16add6a5ac84104ba1f7**；原打包器候选→定向验证→同一打包器晋升→同源核对，development发行资源同SHA。原7项能力未变；1.4.28中间包SHA 2b59a96700e4555852e11cedf8ed5a11fc98e4e133ac1a1ec90ec71b5025aa05也已实际审阅安装，不再是待安装。

首次目录仍缓存1.4.28且没有新版菜单；正式资源已同步后，关闭空闲侧栏再打开，原审阅入口正常显示1.4.29。没有重装Browser、替换dist目录、第二writer或手工改安装数据。真实扩展ID仍ccfcjegpkdlgbclopjmadlcjedelidmf，路径dist/development，共享dev writer PID68812继续监听43119/43120；只同步原固定development代理例外的版本/字节/SHA，不新增普通运行的发行匹配门槛。

保留PID78467/7903原内存账本和所有历史；只做GET诊断，不触碰此前被审批拒绝的stdin控制路径。原用户Cookie文件、未知来源ChatGPT页、Native配对和其他owner改动均保留。本轮TaskSpace3已finish一次、保留7903结果页p1，原生UI租约已释放，无活动子agent。当前阶段所需源码/包/安装/失效停止及重开证据已齐；外部缺少有效新分配的原生重验明确NOT_TESTED，不把这项限制改写为通过。

以下为各历史候选当时状态，旧“等待UI/待安装”描述不覆盖本节。

<a id="identity-goal-1428-20261106"></a>

## 2026-11-06：目标、关键测试条件与脱敏身份核对（1.4.28）

当前仍为核心开发及最小验证，main本地提交、不推送。已设置本对话原生目标，并在[唯一方案](../../ROADMAP.zh-CN.md#current-goal-tests)固定K1–K8及完成标准：一次激活、身份核对、取消零副作用、变化/失效停止、未知不重放、重开安全、网站独立核验、同源安装。生产、商业、真实ChatGPT Plus、完整矩阵、评分及原生服务撤权继续延期。

### 当前操作与修复证据

- 18:32在原已安装1.4.27入口直接准备：首次因旧核验状态未取得交付，刷新权益后主动再准备成功，显示7903/共享A/提交窗口，但明确缺少脱敏身份。随后主动取消，未打开写入确认；网站仍未登录。没有再次兑换或启用代理。
- 旧源码正向脱敏展示与身份移除回归先失败；1.4.28在原共享目录允许可选 `displayNameMasked`，只用textContent标“服务端提供 / 网站身份未核验”。最多100字符、含连续至少两个星号、无首尾空白或控制/双向字符，非法值拒绝授权快照。摘要只用于展示，不作为登录/VIP事实或持久化数据。
- 提交前沿原会员刷新及分配代次校验：标签、脱敏摘要变化或消失会作废旧交付。原SDK/Host/Authority、网站grant、逐批可信确认、journal/CAS和unknown围栏不变。恢复兼容承接1.4.27原未决兑换，仅查原事务。
- 新合成fixture的共享A/B分别提供a***/b***@fixture.test；外部Cookie来源省略该字段，不能将模拟身份套到真实网站。现有PID78467/7903进程保持旧代码与原账本，未重启、未发被拒绝的stdin控制命令；因此新正向字段展示目前是控制器/新测试实例证据，尚无原生浏览器证明。

### 定向验证与唯一正式包

76项PASS：展示（含缺字段、合法摘要、取消、不持久化、变化/移除、非法值、正常主动写入与重开）、服务器批次（网站授权、撤权、Store、未知锁及晚响应）、升级恢复、fixture完整目录/目标独立核验。6项外部来源测试PASS，明确不泄漏模拟身份；5项既有开发代理来源保护、2项候选晋升/同版本覆盖保护PASS。JS语法、工具Vite构建和定向diff格式检查通过。未跑根npm test、全量CI、Browser静态构建或新评分；未变更journal算法，不重复旧容量全组。

唯一正式包 **1.4.28 / 141586字节 / SHA-256 `2b59a96700e4555852e11cedf8ed5a11fc98e4e133ac1a1ec90ec71b5025aa05`**。原打包器临时候选→相关验证→同一打包器晋升→PROJECT_PACKAGE_MATCH；development发行资源SHA相同。原7项能力不变。公共源码仅同步原固定development代理例外的包版本/字节/SHA与原定向测试pin，不新增发行匹配运行门槛。

独立只读审查覆盖本轮3个业务源码与4个相关测试，未发现可操作P0/P1/P2问题。诊断/AST专用工具不可用，未冒称其通过；审查未重跑已通过的测试、未操作浏览器或服务。

### 原生安装及资源状态

原生安装复核待完成：目前其他owner占用原生UI锁，未强抢。最后实读安装版本为1.4.27，不能以新正式包或发行资源同步代替安装成功。现有7903缺脱敏字段的兼容、取消及重开待在1.4.28实际安装后核对；服务撤权、真实身份匹配、ChatGPT Plus与production仍NOT_TESTED。1.4.27合成登录/自然到期证据只属于下节历史候选。

保留共享dev writer PID68812（43119/43120）、固定dist/development、扩展ID ccfcjegpkdlgbclopjmadlcjedelidmf及Native配对。升级站点grant承接的既有框架缺口未改；相关公共文件已有并行改动，不由工具绕过。复用用户批准ego Profile1/TaskSpace3；未知来源ChatGPT页面和用户真实Cookie文件未读取、复制或改动。浏览器资源收尾与本轮安装最终状态在完成时补记。

本轮源码、唯一正式包、目标/测试条件及证据已本地提交为763f8cd20，未推送；本任务文件无未提交改动。随后连续三轮申请原生UI均返回busy，原生UI owner的官方任务状态仍为active/inProgress；未把超时当作owner退出，未强抢或启动替代Profile。当前仅剩原安装器更新1.4.28及缺字段兼容/取消/重开复核，不能宣称目标完成。继续条件是原生UI资源释放；恢复时先重查租约、实际安装版本及7903账本，不重复已通过的测试或兑换。

本轮ego TaskSpace3已finish一次，保留原7903结果页（本次重新认领后的标签p1），未知来源页面受保护；当前无本任务原生UI租约或子agent。PID68812 dev watcher与PID78467 fixture再次确认仍在运行，没有停止、重启或清账。资源收尾不等于新包已安装；最后原生实读仍为1.4.27。

以下是各历史候选当时的证据，不覆盖本节。

<a id="user-journey-1427-20261106"></a>

## 2026-11-06：用户旅程与合成网站登录闭环（1.4.27）

当前阶段为核心开发及最小验证。需求、普通用户步骤、系统与用户职责见[一屏需求表](../../README.zh-CN.md#user-journey-current)。本轮只在现有main工作、本地提交不推送；唯一业务owner不变。除原有development固定HTTP代理例外的版本/字节/SHA及定向测试pin外，未修改公共Host、权限、Native配对或其他工具。

### 一屏业务结果

| 当前用户操作 | 实际结果 | 证据边界 |
| --- | --- | --- |
| 预检与激活 | 1.4.25在新的合成实验中预检取消后兑换0、权益0；再次明确确认后兑换1、20次演示额度、共享账号A | 新主体、新码、新内存账本，不是旧7903恢复；未再消费DEMO-VIP-01/02 |
| 已有权益准备 | 升级到1.4.27后直接准备7903的当前分配，无须再次兑换；原卡显示目标、分配、提交窗口 | 服务器未提供脱敏网站账号，工具明确“未提供 / 身份未核验”，不假造账号匹配 |
| 原授权与可信取消 | 在活动7903网页旁打开原生Side Panel，经原设置审阅精确http://127.0.0.1:7903；1.4.27两项可信确认先取消，工具确定未提交，网站仍未登录 | 没有全站授权、CDP注入或清除旧登录；升级网站授权承接仍有框架缺口，按原UI重新审阅 |
| 写入与实际登录 | 用户再次主动点击同一有效交付并确认原“本次Cookie操作”；两项均已写入并核验，成功后自动打开正确7903网站 | 18:13:51网站独立显示受控会话有效、a***@fixture.test、公司共享账号A、模拟标准VIP有效；同分配A一致，缺少服务端脱敏字段仍是身份核对缺口 |
| 自然到期 | 网站显示到期18:14:38；18:14:37仍有效，18:14:49已回到未登录/模拟VIP不可用 | 90秒合成Cookie自然过期，没有改时钟、清Cookie、自动续写或重启服务 |
| 重开工具 | 1.4.27关闭界面再打开，仍一条兑换/20次额度，无当前交付；保留上次两项成功回执，代理显示未启用 | 可见行为通过；本轮未完整采集重开前后journal摘要、所有桥START及session计数，不以UI替代全量计数 |
| 真实商业与ChatGPT | 生产Provider/商品/推广/商业线路未配置；本轮未读取或写入真实ChatGPTCookie、聊天内容或发送消息 | 真实身份匹配与Plus/VIP NOT_TESTED；历史1.4.22写入不作为本候选证明 |
| 服务撤权与其他入口 | 本轮未完成真实服务撤权网页观察、LAN/第二设备及生产验收 | 服务撤权/分配变化保护有Node回归；这些原生结果NOT_TESTED，不恢复旧完整矩阵或评分 |

### 已复现阻塞与最小修复

1. 1.4.25激活直接交付时，确认区“已收到会话”与旧网站选择摘要“尚未取得会话”矛盾。1.4.26用已校验交付的目标持有当前展示阶段，不自动存储或调用SDK；原确认说明列明账号、套餐和到期核验。
2. 1.4.26实际点击提交得到“恢复记录容量不足，未提交Cookie”。现有历史保留，没有通过卸载、清键、重启或修改未知状态绕过。先写近满schema4历史回归，在旧源码得到E_COOKIE_LIMIT；1.4.27仅在v4超过原8KiB时，将重复尝试字段名编码为固定12项元组（schema5）。原schema1–4读取、内部schema2校验、作用域/Store/Partition、所有回执/去重事实、CAS、精确读回及写前最坏回执预留保持。真正满额仍在写入前拒绝；它不是无限容量或历史清理方案。更新后同一安装、同一账本通过原可信写入。
3. fixture只增加受校验的进程内voucherAssignments与sessionLifetimeMs，供独立新实验使用，不新增HTTP控制端点、不扩大来源。默认旧码行为不变，已消费旧码不用于本次实验；参数只影响合成Cookie，不改变真实文件来源。

### 包、检查与安装

唯一正式包 **1.4.27 / 141060字节 / SHA-256 `0a5d702ac8cd125f14c6877f12a9e5bc7afd70860ae9c858525196cec4cd932b`**。工具Vite构建→原打包器临时候选→相关检查→同一打包器`--promote-from`→`--check-project`，分别返回PROJECT_PACKAGE_PROMOTED/MATCH；目录没有增加第二个正式包，development发行资源同SHA。

原管理菜单“审阅新版”先从1.4.25到1.4.26，随后到1.4.27；每次确认原权限未变化、保留原数据，最终安装审阅SHA与上述包相同，实际标题v1.4.27。1.4.26摘要SHA `1de990f501dd7227d0c9e20703d3cd5d0fa0edf2cd4ccba07738c441b65b04da`只作为容量阻塞的中间版本证据，不是最终包。

检查按本次行为选取，重叠执行不相加计总数：会话/展示14项、journal与存储33项、升级恢复及存储组合33项、fixture全文件34项、原开发代理来源5项、原打包器候选晋升/版本保护2项通过；此前普通来源集成7项通过且相关输入未再变化。新近满v4用例覆盖无损预留、结算、重开、未知锁、重复拒绝及损坏元组拒绝。语法检查和定向diff格式检查通过。未跑根npm test、全量CI、Browser静态构建或正式验收。

### 实验、资源与未取得的证据

旧7898/7903/7899均已退出且内存账本不可恢复。本轮首个新实验因stdin连接未保留、且只做预检取消（兑换0、会话0），封存后启动另一个明确区分的最终实验；没有冒称旧事务恢复。最终实验`journey-20261106-final-subject`，原fixture进程PID78467监听127.0.0.1:7903，使用新的JOURNEY-20261106-B合成码。首次确认后的非秘密计数为兑换1、会话2（含自动准备）、代理租约0；该计数仅对应17:51:54的观察，不作为最后时点计数。

其后自动审批拒绝向测试进程发送只读stats，返回“approval required by policy, but AskForApproval is set to Never”。未绕过该拒绝发送控制/撤权指令，未重建服务或兑换；因此最终完整请求计数与真实服务撤权未取得。工具可见兑换记录和网站结果如上，HTTP测试不代替原生证据。无秘密操作计数保存在忽略目录`artifacts/sidebar-tools/ai-vip-share/journey-20261106/events.jsonl`；自然到期截图为同目录`site-expired.png`，有效态及原可信确认由本轮CUA观察记录。

仍是持续开发环境：实际扩展ID`ccfcjegpkdlgbclopjmadlcjedelidmf`、路径`dist/development`，共享dev writer PID68812（43119/43120）保留；此前实际调试页已读到开发服务已连接/指纹`f3300cc5c0e0`，本轮随后原serve同步新的发行包，未用旧指纹冒充最终完整构建。没有启动第二writer或覆盖静态包。Native UI锁按个人profile工具申请/释放，结束时已释放。

复用用户授权ego Profile1 / TaskSpace3（Space共享Profile，不是额外Cookie隔离）。任务结束调用finish一次，保留结果页p3，释放临时p2；未知来源ChatGPT页受保护。保留最终fixture及内存账本供必要续接；后续先重查服务与归属，不重启清账。用户真实Cookie文件未读取、复制、上传或修改。其他并行工具与服务均保留。

以下章节是各历史版本当时观察，不覆盖本节结果。


<a id="core-chain-1425-20261106"></a>

## 2026-11-06：原激活卡与安全恢复收尾（1.4.25）

本轮仅继续核心开发和必要验证，不进入正式验收，不创建新目标、分支、worktree 或 PR。业务唯一 owner 是本目录；公共源码只同步原有 development 固定 HTTP 代理例外的包摘要及其测试，不修改 Host、Cookie 权限、Native 配对或其他工具。工作在现有 `main`，仅本地提交、不推送。

### 当前业务结果

| 用户操作 | 本轮结果 | 证据范围与未完成项 |
| --- | --- | --- |
| 打开扩展 | 原安装器从 1.4.23 → 1.4.24 → 1.4.25 审阅升级，权限未变化、保留数据；实际界面 v1.4.25，无前端 Cookie 文件入口和独立登录区域 | 仅批准的 ego Profile1 / TaskSpace3；不是个人 Chrome 或 production |
| 查询会员与兑换 | 原 7903 源已离线，显示“无法核验”，没有假称未激活、过期或付费权益；兑换暂停 | 1.4.22 已有预检取消、明确确认和原事务恢复的历史证据。本轮没有重建旧账本或消费旧码 |
| 激活链接 | 1.4.22 的回环原生带码及已消费码拒绝保留为历史 | 原 LAN `.3` / 本机 `.4` 问题未复测，完整 LAN 链 NOT_TESTED |
| 原卡会话审阅 | 1.4.25 取得独立普通工作台服务会话，在原卡显示 localhost:7901、o***@fixture.test 和交付截止时间；新准备不混入旧成功回执 | 普通工作台为新合成实验，不是原 7903 当前分配或真实 AI 会员 |
| 主动取消 | 1.4.25 实际取消后移除本次脱敏账号、交付期限、待确认按钮与摘要，恢复准备入口；Cookie journal SHA 未变化 | 7903 服务器摘要清理由定向控制器回归证明；该源离线，最新包真实源复测不可用 |
| 恢复存储 | 1.4.24 在真实 7574 字节 / 7 次历史记录上拒绝新站点提交；1.4.25 在同一原键压缩为 schema4 后已可保存确定未提交的第8次事实，6992 字节，历史7次均保留 | 不提高 8192 字节预算，不删历史，不清 unknown；仍在写前预留最坏回执空间 |
| 原可信写入与网站核验 | 当前包此项 NOT_TESTED：本站未授权，原生 UI 锁连续被另一 owner 占用，未强抢或绕过 | 首次提交在原权限链转设置并确定未提交，journal 最后一项为 not-submitted / failed / 0回执。本站写后登录、身份匹配、模拟 VIP 及自然过期/撤权本轮未验证；不能称登录成功 |
| 重开工具 | 当前包重开前后 journal SHA 相同、兑换恢复键仍空；普通服务 authorization=5、session=3 均未增长，网站仍未登录 | 支持“没有重新领取/写入”；全量桥 START 计数本轮未重新采集，历史零 START 与控制器回归单独保留 |
| 更多商品与推广 | 当前包实际点击两按钮，各自明确提示网址未配置/未审核，未新开页面 | 正式 URL 仍空，不编造商城或推广目标 |
| 网站访问代理 | 正式 profile 仍 null，无商业线路；未启动代理 | 固定 development 例外定向保护通过，不证明代理真实转发 |
| ChatGPT 身份与 VIP | 1.4.22 服务器 25/22/3 与 21+1 两批可信写入、写后账号菜单是历史证据；已有登录基线 | 本轮未重读聊天、发送消息或重新写入；真实脱敏身份匹配、Plus/VIP 仍未验证 |

### 修复与边界

`main.js` 区分当前准备与历史回执，明确交付期限只限定提交窗口，主动取消清除 serverSession/sharedNotice，初次快照不误报账号改变；`site-session.js` 对服务器缺少脱敏身份明确提示未提供及未核验。兑换恢复兼容加入 1.4.22–1.4.24；未决状态只可携原 key 查询原来源，不可另行兑换或清锁。

实际容量失败来自本工具原单键恢复记录，不是公共 HTTP 容量。`cookie-journal.js` 继续以 schema2 作为内部校验模型：原 schema1/2/3 可读，schema3 字典在超限时才将六个固定槽位字段编码为 schema4 元组。记录、作用域、Store/Partition、每项回执、未知效果与去重事实全部保留；原 CAS、精确读回、损坏拒绝和写前最坏回执预算不变。回归先在旧源码复现 E_COOKIE_LIMIT，修复后新站点可预留/结算/重开；未知结果、并发、损坏元组、超限回执仍拒绝。

### 安装包与最小验证

唯一正式包 **1.4.25 / 140413 字节 / SHA-256 `63ec75c60de47481d82da40ae9e9807f4abfc23903e44543b4405a425e8a41f5`**。工具源码构建 → 原打包器临时候选 → 本轮相关回归 → `--promote-from` 原子晋升 → `--check-project` 同源通过，目录未新增第二个正式包。开发发行资源逐字节摘要相同，原安装审阅显示同一摘要与权限未变化。

本轮六个相关控制器/恢复测试文件覆盖当前审阅、取消、批次、旧事务和 journal 安全，首次组合70项PASS；追加 1.4.24 升级用例后恢复文件21项PASS（与前组合重叠，不相加）。既有 development 代理例外5项PASS，原打包器晋升/同版本覆盖保护2项PASS；三个业务 JS 语法检查、工具构建和定向 diff 格式检查通过。未跑根 npm test、全量CI或不相关旧检查。

### 环境、历史服务与资源

实际扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`，仍用 `dist/development`。本轮原 dev watcher 已退出且 43119/43120 均释放后，恢复唯一 `npm run dev`（当时 PID59652，终端session85989）；真实调试页曾显示“开发服务已连接”，指纹 `9f7b5839afe3`。随后该进程因并行 Webflow 来源 pin 校验失败退出（exit134），新 owner 的 PID68812 已接管43119/43120。本轮未改该模块或重复启动；重新打开实际1.4.25并读到当前开发客户端已连接，最新观察指纹 `f26e97f111a3`。保留新 owner 的持续开发服务，不覆盖其他 writer，不改 Native 配对；Cloud/Native 诊断未知与本次行为无关，未展开修复。

1.4.25 首次本地包导入曾因旧 dev 发行资源仍为1.4.24得到 E_PUBLISHER_CONFLICT，旧数据保留。原 serve 完成正常同步后，经原管理菜单“审阅新版”更新成功；没有放宽来源校验或把 Catalog 匹配作为正常打开的新门槛。

原 7898/7903/7899 服务已退出，旧内存账本无法恢复。本轮只以现有 `ordinary-site-fixture.mjs` 启动新的 localhost:7901 合成实验，使用一次性合成凭据和两分钟 Cookie，有独立实验标识；没有读取、复制、上传或写入用户原 ChatGPT 文件。原 Profile 登录与未知来源 ChatGPT 页均保留，不清 Cookie 或持久恢复记录。原生 UI 占用按个人 chatgpt-test-profiles 的锁协调，多次申请均返回 native UI busy；只暂停依赖共享原生授权的部分，不强抢其他 owner。测试后关闭本轮新建的合成工作台进程；TaskSpace3结束并保留已安装工具结果页和原p6，未知来源ChatGPT页受保护。没有停止共享dev watcher或其他owner服务。

旧包网站授权跨升级承接缺口仍未修复；本次本站权限若缺失，继续走原可信站点授权。production、商业后台/支付、LAN及第二设备全链、真实代理转发、完整矩阵、压力/变异、宽度缩放、CWS与独立评分均延期。


<a id="core-chain-1423-20261106"></a>

## 2026-11-06：1.4.23 中间进度（历史，已由下述 1.4.25 收尾取代）

原记录在上一轮停止时尚未完成；其中 7903、7898、7899 和 PID98996 的“仍在运行”仅为当时观察。本轮开始重新核对，这些进程均已退出，内存账本不可恢复。没有重启它们、重新消费旧演示码或清除持久 journal。1.4.23 在原卡片取得 25/22/3 交付并取消的观察保留为历史，不能充作最终包实测。

<a id="server-cookie-1422-20261106"></a>

## 2026-11-06：测试服务器真实会话交付与原事务恢复（1.4.22）

本节为 1.4.22 的历史核心开发结果；当前状态以顶部最终记录为准。唯一业务owner仍为本工具目录，现有`main`开发，仅本地提交、不推送。没有创建Vault、账号池、第二Provider/Host、分支或worktree。原来源对话`01a1ad1c-f681-74e1-abe5-a62ac3cb48e7`的goal由用户暂停；本次没有恢复或修改它，也不把创建新对话当作目标迁移。

### 一屏关键操作结果

| 操作 | 实际结果 | 适用版本/边界 |
| --- | --- | --- |
| 预检后取消 | 承接上一轮已安装1.4.22实际操作，7903兑换0、权益0；随后明确确认才产生原唯一兑换 | 没有再次消费DEMO-VIP-01/02 |
| 核对上次兑换 | 本轮按原服务和原idempotencyKey核对，服务端200/redeemed、账号与key匹配；原「核对上次兑换」最终显示成功并经原CAS解除恢复锁 | 7903原进程和账本未重启；未生成新兑换key、未手动清记录 |
| 服务器取得会话 | 修复公共HTTP响应容量后，原「准备登录」取得当前分配的schema2交付；实显总25、保留22、跳过3，第1/2批21项 | 已安装1.4.22，真实授权原文件只读；没有前端文件选择 |
| 两批可信写入 | 首批21项独立点击并确认原「确认本次Cookie操作」，逐项已写入并核验；再对第二批1项重新点击、可信确认，成功后才自动开ChatGPT | 每批原SDK/Host、网站授权、Store/Partition、CAS/journal均保留；未用CDP注入Cookie |
| ChatGPT状态 | 原p6在写前个人资料按钮true、登录按钮false；自动打开的p8在写后菜单、设置、退出均true | 已有登录基线，证明写后登录状态，不称新登录或Plus/VIP；未读取聊天历史、输出账号资料或发送消息 |
| 重开工具 | 持久Cookie journal前后ETag相同，当前兑换恢复记录已清；启动只发会员GET1次，兑换POST/会话领取/Cookie写入/代理START均0 | 只计本工具桥操作名/请求种类，不留载荷；历史unknown保留 |
| 原生带码 | ego工具栏打开真实Side Panel，识别批准的127.0.0.1:7898激活链接并带入已消费码；预检拒绝，没有再次兑换 | 原生侧栏1.4.22、业务仍连接7903；不是LAN全链通过 |
| LAN链接 | 原进程仍监听192.168.30.3:7899，本机`en0`现为192.168.30.4；终端和ego均未能访问原来源 | `NOT_TESTED`：未迁移来源、加网络别名、重启LAN服务或消费第二码 |
| 原文件/旧账本 | 写后原文件13841字节、SHA与mtimeNs均未变；7903仍兑换1/权益2/共享目录1；7898仍兑换1/权益2 | 两个原内存账本保留，没有将LAN作为真实Cookie接口 |

### 根因与最小框架修复

原导出压紧JSON为11892字节，尚不含回执/交付信封。已安装工具通过原`OpenDeskSDK.browser.network.request`查询当前会话时，直接返回`E_LIMIT: HTTP response exceeds byte budget`。原`context-menus`网络驱动硬编码8192字节，HTTP IPC又硬编码12000字节；因此原兑换在服务端提交后，其携带Cookie的回执会因超限被拒绝，前端保留恢复锁。交付过期后，原服务`recoveryReceipt`去掉短时Cookie数据，仍返回持久兑换终态；本轮原UI恢复成功，不能把前轮即时截图停留当作最终失败。

公开网络config没有调整容量或分页选项。业务目录无法让已有服务器原样响应越过驱动硬上限；重启服务器或伪造较小交付会损害本次账本与证据。公共缺口已由真实安装请求和定向回归证明，按Runtime Skill修复唯一`browser-contract.js`的network响应预算为80000字节，驱动与`{status,data}` JSON IPC均从Registry取值、分别拒绝超限。它也适用于其他工具的中等JSON响应，源码不含ChatGPT/本工具业务分支。

请求仍限12000字节；能力、真实sender/document、精确URL/Origin、安装身份、Chrome权限、前后撤权检查、credentials omit、手动重定向与Cookie逐批确认不变。没有新API、第二网络服务、永久无限预算或官方Catalog运行匹配门槛。本轮公共文件改动范围仅`src/framework/sdk/browser-contract.js`、`src/platform/chrome/context-menus.js`、既有R2 Host测试和公开SDK说明；此前development代理pin两处仍仅约束固定HTTP开发例外。**单独更新工具JSON不会更新旧Browser宿主。**

### 运行身份、产物与证据

实际Chrome扩展详情再次读到ID`ccfcjegpkdlgbclopjmadlcjedelidmf`、已启用、加载来源`~/文稿/workspace/opendesk-browser/dist/development`。使用用户批准的ego Profile1 `AI VIP Share Test 20261106`及接管后的同一TaskSpace3；它不代表Cookie/Profile隔离。开始时真实调试页显示开发服务已连接、指纹`85a3d93c8fec`，复用PID98996及43119/43120，未启动第二writer。框架改动后原watcher增量产物更新并安全重载关闭旧工具tab，新宿主真实会话已通过；最后一次重开后调试区未读到连接文字，**最新客户端连接/指纹为未验证**，不沿用旧指纹冒充最新状态，不把Cloud/Native诊断未知扩成无关修复。

唯一正式包为[`../../ai-vip-share.opendesk-tool.json`](../../ai-vip-share.opendesk-tool.json)：版本**1.4.22**、**138909字节**、SHA-256 **`94ce458f359b99cdb54d2c95ed4115d3cd7b2f58f032e9331d914f1175550c30`**。上一轮原安装器已从1.4.20审阅更新1.4.22；本轮实际沙箱和原生侧栏均实读1.4.22。框架修复没有改变工具构建输入，无需同版本重打或另升工具PATCH；本轮再次执行原打包器`--check-project`，结果`PROJECT_PACKAGE_MATCH`。正式目录仍仅一个安装包。

工具`dist/build-ready.json`的buildId为`d2f366480f80f5eade740e93d5b553fa5e2722e7bbd4cc7872a73d3b5aef8891`；同源合成预览为`6e9a17f85eae06137b8cdea2c50e3be9c22d00961ea3e7132f7a7909f7b57960`，本轮逐项复核sources/files摘要匹配。预览不含真实Cookie、不证明原生登录。

原授权文件只读摘要仍为SHA-256 `abfed7ca33b3637806a68be180ef90e52aa1e5d3a9d8b22e9d8a4a2c0061c514`，mtimeNs `1793896382356555343`，13841字节。25/22/3与21+1只属于此次时钟观察，不承诺后续仍有效。没有另存明文或提交秘密；本机成功界面截图留在忽略的`artifacts/sidebar-tools/ai-vip-share/server-cookie-1422-success.png`，其中只显示工具状态和序号回执，不包含Cookie名/值或网站聊天内容。

### 必要验证与未测项

针对真实E_LIMIT新增行为回归：64KiB JSON可通过已安装Host而响应头不泄露；超过80000字节流/编码后IPC各自拒绝；大响应取得后撤权仍不交付。修复前两条相关行为确实失败，修复后既有R2 Host与网络权限链共**31项PASS**，覆盖原身份、精确来源、取消、撤权和权限复用。三个修改JS文件语法检查、任务diff格式检查通过。上一轮未变输入的85项服务端/批次/控制器/旧恢复/源预检、26项VM/原生驱动/离线/LAN、5项开发代理来源保护及2项晋升保护复用已有结果，没有为了计数重复运行或启动全量构建/CI。

旧网站授权跨包升级承接限制仍保留：本轮沿用上一轮通过原可信界面重新审阅的同一`https://chatgpt.com`授权，没有扩大站点或绕过Host。LAN当前地址不匹配、第二设备、旧Browser单独导入包、production、商业后台/支付、真实代理转发、全量矩阵、压力/变异、宽度缩放、CWS及独立评分均未执行。测试服务当前演示权益不是商业会员。

本轮保留原7898、7903、LAN7899与开发watcher，不结束其他owner资源；已调用TaskSpace3的`finish`释放临时p9，保留工具p7、ChatGPT结果p8及用户原p6，保留批准Profile。进程与页面均为本次观察，后续开始时需重查；不要重启内存账本、重放unknown或清除网站登录制造基线。


<a id="server-flow-1420-20261106"></a>

## 2026-11-06：纠正文件优先布局，恢复服务端激活流程（1.4.20）

用户最新决定是「不增加区域，不强调Cookie JSON文件；JSON由服务器保存或提供」。本轮仅完成这项核心纠偏及原激活入口的必要联调；不恢复旧全量验收。本工具仍由本目录唯一持有，现有`main`开发，本地提交不推送；其他owner的Cookie Editor、Webflow、Native与公共Host改动均保留。

| 条件 | 本轮结果与证据边界 |
| --- | --- |
| K1 历史与服务 | 读取历史授权并复用ego TaskSpace13、用户已批准的`Profile 1`。开始时原7898/7899及Browser dev服务均未运行；确认端口空闲后启动原fixture和LAN服务，属于新的内存实验账本，不是旧事务恢复，不清除旧journal/unknown |
| K2 实际安装与布局 | 原安装器从1.4.19审阅更新为1.4.20，权限未变、保留数据。实际界面默认没有独立网站登录卡、文件步骤或文件按钮；原会员→兑换→商品→网络→推广层级保留。服务端会话核对和设置内嵌原「兑换激活」卡 |
| K3 激活与取消 | 在真实安装工具中连接原本地开发服务，手动输入测试码并预检，核对脱敏账号/商品后取消；GET会员记录仍为0条、权益0项。再次填码、预检并明确确认后，服务端及工具均为1条兑换、20次演示额度、一个当前分配。没有通过终端提交兑换 |
| K4 服务端会话与防重复 | 确认后由原服务端交付合成会话，原激活卡显示目标`127.0.0.1:7898`与「设置并打开网站」，无需选择文件。主动取消准备，重复已消费码预检被拒绝；重开工具仍为1条兑换/20次额度，无重复消费或自动写入。本轮没有批准新的Cookie写入或启动代理 |
| K5 LAN与真实ChatGPT边界 | 固定LAN指引页实际可访问；完整宿主标签页不等于原生Side Panel的活动网页上下文，当前候选自动带码流程仍`NOT_TESTED`，不以手动输入替代。此前1.4.18的真实ChatGPT登录在本轮开始时可见账号菜单/设置/退出，未发送消息或查看会话；1.4.20未重新写入。真实ChatGPT服务端会话来源`NOT_CONFIGURED`，fixture只交付自有合成会话，未加载真实文件 |
| K6 定向验证 | 五个控制器文件38项PASS，覆盖默认/旧本机选择不显示导入、主动开发测试、失去开发配置即丢弃准备、服务端分配、激活来源与确认、取消和未知事务升级恢复。既有开发代理来源测试5项PASS，覆盖production拒绝、安装身份/真实owner、撤权和STOP；工具/同源预览构建、原打包器候选→晋升→同源核对通过。不重复未变输入的整组检查，不跑根npm test/完整CI |
| K7 环境与保护 | 实际启用扩展ID`ccfcjegpkdlgbclopjmadlcjedelidmf`，加载路径`~/文稿/workspace/opendesk-browser/dist/development`。原`npm run dev`已运行，实际调试页连接指纹`1119d863079a`。唯一平台变更是更新既有development固定HTTP回环代理例外的源码批准摘要及其定向测试；没有放宽安装器、网站授权、精确来源、逐批确认或CAS/unknown保护。旧包网站授权升级承接问题仍未修复/未通过 |

**验证命令与用途：** 以下控制器检查对应入口显隐与服务端激活行为；平台检查对应本轮更新的精确开发来源批准，防止任意包或production取得固定HTTP例外。两组共43项PASS，工具与预览构建检查当前产物，`--check-project`核对唯一安装包未漂移。文档修订仅核对链接/内容/格式，不触发重复构建。

```sh
node --test examples/sidebar-tools/ai-vip-share/tests/controller-local-file.test.mjs examples/sidebar-tools/ai-vip-share/tests/controller-site-restore.test.mjs examples/sidebar-tools/ai-vip-share/tests/controller-lan-activation.test.mjs examples/sidebar-tools/ai-vip-share/tests/controller-member-site-context.test.mjs examples/sidebar-tools/ai-vip-share/tests/controller-recovery-upgrade.test.mjs
node --test tests/environment/browser-managed-proxy-development.test.mjs
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/ai-vip-share --check-project
```

**唯一安装包：** `ai-vip-share.opendesk-tool.json`，**1.4.20 / 137736 bytes / SHA-256 `7c2a744389ecdbe283769c9296bd32169f4ff8e1ce76c66481e029f50defbec2`**。与`dist/development/official-tools/ai-vip-share/`内同包逐字节一致；首次导入曾因原静态发行仍旧而报`E_PUBLISHER_CONFLICT`，恢复原serve正常同步后再经原安装器更新成功，没有绕过来源保护。工具buildId`e7f7167e2aad828fdc86d2ae66f3dda485ab97ebd7328936cca48b8d5397a978`（14输入/2输出）；预览buildId`39cfed092c80d9a77bc64e40b3da5f994712731c9d67322ae5853c99df68ae2f`（27输入/5输出），本轮逐项字节/SHA核对一致。

**原文件与本机证据：** 用户授权文件仅作一次本机只读解析：13841字节、SHA-256`abfed7ca33b3637806a68be180ef90e52aa1e5d3a9d8b22e9d8a4a2c0061c514`、mtime纳秒`1793896382356555343`；当时25项保留22、跳过3、21+1批。没有重新导入、写入、上传、保存秘密副本或输出名称/值。忽略目录`artifacts/ai-vip-share-server-20261106/`只保存非秘密`original-file-check.json`与`v1420-server-first.png`、`v1420-server-session-inline.png`等运行证据，预览只用合成fixture。

**资源与后续：** 当前原fixture PID29597监听127.0.0.1:7898，已消费测试码01，测试码02未消费；LAN指引PID29611监听192.168.30.3:7899，dev writer PID35245监听43119/43120。保留进程供继续操作，不重启清账，不覆盖其他writer或改Native配对。Space13结束时保留p1真实登录页和p4已更新工具结果，关闭本轮p3检查页；TaskSpace不隔离Cookie。正式服务端ChatGPT配置、当前候选LAN带码原生流程、旧网站授权升级承接、production、支付/商业、代理流量、完整矩阵与评分均未通过；本轮不将其宣称完成。

以下1.4.19及更早的文件优先布局和“当前阶段”按历史阅读，不能恢复为本轮产品要求。

<a id="cancel-expiry-1419-20261106"></a>

## 2026-11-06：独立 Profile 真实登录与取消到期收尾（1.4.19）

当前交付为本地 Cookie 快速登录核心开发，不恢复历史生产验收或全量目标。唯一业务 owner 仍为 `examples/sidebar-tools/ai-vip-share/`，在现有 `main` 承接1.4.19六个未提交文件并同步本文、README、DESIGN、ROADMAP及预览说明；不推送，不创建分支/worktree/PR。源对话目标 paused，未在本轮恢复或改写；下方1.4.18初期的 active/阻塞描述均为当时历史，不代表本节收尾结果。

### 核心操作与版本证据

| 条件 | 结果与证据边界 |
| --- | --- |
| K1 独立环境与登录基线 | 用户明确批准新建 ego Profile `AI VIP Share Test 20261106`（`Profile 1`）。TaskSpace13复用该Profile，开始时实际ChatGPT页显示登录/注册；不是沿用共享Profile里其他任务的账号。TaskSpace本身不隔离Cookie，未接管三个受管专项slot或其他owner页面 |
| K2 可信取消与自然到期 | 1.4.18已执行取消后到期，未写入。1.4.19原安装界面再次准备同一文件，可信宿主显示向 `https://chatgpt.com` 写入21条的精确批次审阅，实际点击“取消”。返回“未提交写入；有效交付可由你重新确认”，到期后显示“当前准备已结束，请重新准备登录”和“剩余22项未提交”，确认按钮隐藏、文件统计清空；没有自动重试或自动开页。本轮没有点击可信继续按钮 |
| K3 原文件与逐批写入 | 真实正向写入属于1.4.18：原文件25条，跳过3条合法过期项，保留22条，按21+1两批分别点击、分别可信确认。首批逐项核验后未冒报全文件完成；第二批成功后才打开网站。仅保留非秘密回执，无Cookie名称/值日志或秘密副本 |
| K4 实站登录 | 同一独立Profile从未登录进入真实ChatGPT账号界面，账号菜单包含设置/退出；这证明本次工具写入后的登录，不证明Plus/VIP、套餐、额度或永久有效。未发送消息、未查看历史会话。1.4.19更新后再次只核对可见账号菜单存在、登录按钮不显示，未重新批准写入 |
| K5 修复与最小验证 | 1.4.19只修正取消历史在准备结束后仍显示可再次确认的误导提示；有效期内仍保留明确重试入口，普通错误/unknown继续锁定。既有时钟行为测试扩展到取消→120001ms→清理并验证无额外调用；旧版恢复测试纳入1.4.18未确认事务。承接的五个相关文件44项及3项包合同/晋升保护PASS，构建/候选/晋升/同源检查PASS；本轮复核来源及实际UI，不重复未变输入的整组测试 |
| K6 原安装更新与保留 | 原安装器1.4.18→1.4.19更新审阅权限不变、保留数据；实际工具显示v1.4.19，旧写入回执及网页登录保留。**网站授权直接复用未通过**：旧记录绑定1.4.18包身份，新Host核验拒绝文件准备。经原权限界面重新审阅同一精确ChatGPT站点后恢复，未扩站点/能力。不能称升级全项PASS |

**框架升级限制的定位：** Chrome的cookies/origin权限仍在，工具设置仍列出原精确站点；只读核对的网站授权记录版本为1.4.18，当前安装包为1.4.19。既有 `src/platform/chrome/context-menus.js` 对授权记录的version/packageHash与当前安装身份做一致性核验并返回 `E_SITE_GRANT_REQUIRED`，解释了界面列有站点却不能准备的现象。工具公开SDK不能迁移这份可信授权，工具内无法安全修复；本轮没有改写授权存储或放宽Host检查。后续应由框架owner按现行安装/升级/撤权合同处理授权承接及设置状态，保留真实安装身份、精确站点、能力变化审阅与撤权保护；这项限制独立保留，不归咎于本地文件或用新包写入掩盖。

**原文件保护：** 原授权文件只经实际安装工具的文件input读取，未进入预览、服务或构建。操作前后13841字节、SHA-256 `abfed7ca33b3637806a68be180ef90e52aa1e5d3a9d8b22e9d8a4a2c0061c514`、mtime纳秒值 `1793896382356555343` 不变。25/22/3是本次时钟下的结果，后续仍重新计算；不续期、不改值、不另存明文。原生chooser点击曾超时，实际文件测试使用ego公开 `setInputFiles`，不能将其记为原生选择器点击PASS。

**唯一安装包与来源：** `ai-vip-share.opendesk-tool.json`，**1.4.19 / 138582 bytes / SHA-256 `d3e015eb1eefd4ae20d484c11e4f61f05a91482c32d270fd4b800bac9d1a2d85`**。工具buildId `5ff89f0171a7b6abc7be9e4e45be5888e71a7e5e75a3e2284f003aa059220fb5`（14输入/2输出），预览buildId `806bd75ca227efb066afcce898b5d5e39d6276059db15e9b8873faf9776ab2b5`（27输入/5输出）。本轮逐条字节和SHA核对一致，没有新建打包器或用手写JSON替代晋升；预览只含合成fixture，不冒充真实权限或登录。

**持续开发与资源：** Browser仍复用原writer PID33443/33463，监听43119/43120，固定 `dist/development`、扩展ID `ccfcjegpkdlgbclopjmadlcjedelidmf`。上次调试页连接指纹 `1fe8e26bcd13` 属1.4.18阶段，当前本轮只重查进程/监听，不编造新指纹或production证据。未启动第二Browser构建、未改Native配对。仅释放本任务Space13的检查页，保留p1真实登录结果与p3工具页及整个Profile，不关闭其他Space、页面或watcher。

非秘密本机证据位于忽略目录 `artifacts/ai-vip-share-chatgpt-20261106/`：1.4.18的 `new-profile-logged-out.png`、`new-profile-first-batch-receipt.png`、`new-profile-all-batches-receipt.png`、`new-profile-original-file-after.json`；1.4.19的 `v1419-trusted-cancel.png`、`v1419-cancel-expired.png`。两版证据分开使用；当前包没有重做完整正向写入，1.4.18成功不等于1.4.19全量原生验收。原文件最终摘要另保留为 `v1419-original-file-after.json`，不含名称、值或原始JSON。

延期项继续为真实商业/支付、代理流量、production、全量矩阵、压力/变异、宽度/缩放与独立95+评分。旧unknown只保留原事实，不自动重放；原生文件选择器点击和框架升级授权承接也不宣称通过。本轮交付是已验证范围内的核心修复、准确文档、同源唯一包与main本地提交。

以下1.4.18及更早章节保留各阶段的原始观察；“当前/未测/下一步/目标状态”均按对应历史时点阅读，最新结论以上节为准。

<a id="expired-filter-1418-20261106"></a>

## 2026-11-06：完整校验、过滤过期项与真实审阅（1.4.18）

目标：完善本地 Cookie 快速登录，保留原文件与有效属性，在原已安装工具中清晰审阅、逐批可信确认并核验真实 ChatGPT 登录。本对话已通过原生 `create_goal` 建立目标，不设 token budget；目标仍 **active / 未完成**，没有将源码、包或已有登录态冒充登录闭环。旧对话 paused 状态仅按交接记录保留，未恢复或完成它。

业务唯一 owner、公开 SDK、Shared UI、原 journal/CAS、原安装器和打包器不变。当前 main 上本任务承接的 1.4.16 改动与本轮修复一起交付；其他 owner 的源码、watcher、Cookie 和 Profile 未改写。安装路径仍为 `dist/development`；实际扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`，Chrome 扩展详情再次实读该路径且启用。调试页显示开发服务已连接、构建指纹 `1fe8e26bcd13`（本轮观察）；PID33443/33463 仍为原 writer。未构建 Browser 本体，未更换扩展 ID 或 Native 配对，Cloud/Native 诊断未知未扩成无关修复。

### 关键条件与本轮结果

| 条件 | 本轮证据与边界 |
| --- | --- |
| T1 完整校验后过滤 | Node/VM 证明总数/保留/跳过正确，有效属性不变，合法过期项从 payload 排除、不发删除操作；全过期 0 批次/0 上下文查询。过期项里的非法来源、结构、重复、Store、分区和超限仍拒绝。独立审查发现过期分区被过滤后漏查当前上下文，已保留过滤前非秘密 contexts 并补回归；混合文件的所有声明都须通过上下文核对 |
| T2 原权限链 | 未添加 Host/Authority 或绕过确认。实际已安装文件入口在 `getCurrentStore` 的网站权限阶段被拒绝，未准备/派发写入；工具设置在完整宿主标签页提示需要普通 HTTP(S) 当前网页，未自动授予或改写网站批准 |
| T3 同包安装/文件审阅 | 原安装器先从 1.4.16 更新 1.4.17，后从 1.4.17 更新最终 1.4.18，均明确审阅、权限不变、保留数据。最终审阅 SHA 与下方正式包一致，实际沙箱显示 v1.4.18、三步骤及原文件“25 项 / 保留22 / 跳过3”。逐批可信取消/写入及本工具引起的实站登录 **NOT_TESTED** |
| T4 防重复/取消/到期/unknown | VM 验证每批新点击、双击单派发、取消零提交、准备到期清理、首批迟到只保留本批回执且不开网站、unknown 重开不重放。文案区分准备到期与 Cookie 本身过期；普通错误/超时不能当零副作用。原生可信确认分支尚未进入，不登记 Chrome PASS |
| T5 可见/折叠/清理 | 实际完整宿主中首屏版本、三步、统计与权限提示可读；折叠后主动刷新代理状态仍保持折叠，重新展开保留非秘密统计。语义快照会包含已折叠内容，折叠判定采用实际截图。取消/结束/准备到期清摘要、重开仅恢复元数据由 VM 证明；本次未做真实确认后的重开 |
| T6 最小检查 | 最终五个定向文件 43 项通过；另 3 项既有包合同/候选晋升/同版本拒绝保护通过。工具与隔离合成预览构建、来源逐字节核对、唯一包候选→晋升→同源核对成功。没有跑根 npm test、全量 Browser build、CI 矩阵或评分 |

**原文件保护：** 北京时间 01:57 本机摘要为 25 条、3 条过期，过滤后 22 条分为 21+1 两批；这是解析结果，不是已获准批次。最终实际工具同样显示 25/22/3。操作前后 13841 字节、SHA-256 `abfed7ca33b3637806a68be180ef90e52aa1e5d3a9d8b22e9d8a4a2c0061c514`、mtime `2026-11-05T16:33:02.357Z` 一致；未另存秘密或输出名称/值，真实文件未进入预览、模型或外部服务。下一次操作仍按当时钟重新计算，不能把22固定为长期有效数。

**当前资源边界：** 本任务 Space9 已按交接重新 claim，另建自己的原宿主页；旧保留页已变成用户未知来源新标签，未导航/关闭。新开自己 ChatGPT 页发现已有账号 UI，仅作共享 Profile 冲突证据，未用作登录成功、未发送消息；随后复用该页核对扩展身份。三个受管 slot status 仍全有其他 owner，01/02 不运行不等于可回收，03 运行中；未申请/抢占/扩容、未启动 CFT。只完成无共享 Cookie 写入副作用的安全分支。

**唯一最终包：** `ai-vip-share.opendesk-tool.json`，**1.4.18 / 138472 bytes / SHA-256 `65f8f3bce68ce2992dd4c7cdeff759eef6d46c4070507da740f4ca29fef8def0`**。工具 buildId `79d0c5078581ab48925383e4eca3249e12bef1b6506486af780655fc9f713860`（14输入/2输出）；预览 buildId `5761c57a260c1c104fafb5469ef3d46688d6157883a260f91ef4e19cc6ab755e`（27输入/5输出），来源与产物逐项匹配。1.4.15–1.4.17 恢复兼容及对应升级行为检查保留。独立只读审查原分区问题已关闭；最后权限摘要/准备到期文案另有行为及实际界面验证，不扩大为独立架构验收。

原始本机证据目录 `artifacts/ai-vip-share-chatgpt-20261106/`：`v1418-installed-filtered.png`、`v1418-collapsed.png`、`v1418-collapsed-after-refresh.png`、`v1417-original-file-before.json`、`v1418-original-file-after.json`、`v1418-summary.json`。只保留非秘密摘要和截图，不提交生成物。当前真实结果页保留供用户查看；本任务检查页关闭后将 Space9 handOff，等待可写入环境的归属决定。未知来源页与其他 Space 不动；目标未完成，不调用 finish 冒充完成。

下一条未完成操作：取得明确归属且允许写入 ChatGPT Cookie 的浏览器环境，经原网站授权设置精确权限，重新选择同一原文件并逐批可信确认，最后从真实目标账号 UI 核验。当前阻塞是网站权限和共享会话/独立资源归属，**不再以过期项要求新文件**。真实写入、可信取消、实站登录、production、商业支付、代理实际转发、宽度缩放、全量矩阵/压力/变异与95+评分均不宣称通过。

<a id="visible-login-1416-20261106"></a>

## 2026-11-06：真实 ego 安装及首屏可见性（1.4.16）

用户最新要求继续完善并授权执行。仍为当前 owner、现有 main；本轮只改 AI VIP Share 自身，沿用原工具与唯一包。原目标未完成，不把安装与过期拦截等同真实登录。

| 用户操作 | 本轮新证据 |
| --- | --- |
| 找到实际入口 | ego 已启用 OpenDesk Developer，ID `ccfcjegpkdlgbclopjmadlcjedelidmf`，Chrome 扩展详情实读 `~/文稿/workspace/opendesk-browser/dist/development`；初始列表无 AI VIP Share |
| 安装当前包 | 原扩展中心菜单导入正式 JSON，审阅显示 1.4.16、精确 SHA 及能力合同，真实点击确认安装；列表显示“已安装，无需再次启用” |
| 打开与重开 | 从列表打开后真实 sandbox 显示 v1.4.16、展开的登录卡、三步、选择文件和打开网站；原页面关闭后在同 TaskSpace 新页重开仍为 1.4.16，未卸载或清数据。关闭原因未知，不算产品关闭按钮测试 |
| 真实文件过期拒绝 | 通过已安装 sandbox 的原生 file input、ego 公开 `setInputFiles` 选择原用户文件；显示第22条到期 01:28:19、重新导出及未提交提示，确认按钮未出现。01:42 CST 只读复核25条中3条已过期、原mtime不变；未进入写入链 |
| 文件选择器点击 | 高层点击及定点点击后 `waitForFileChooser` 均超时，未据此修改业务代码。直接 input 选择可用；chooser 的真实点击/取消仍 NOT_TESTED，不能把驱动超时定性为产品失败 |
| 持续开发身份 | 原调试页显示“开发服务已连接”，构建指纹 `e85fe0c1ea8c`。复用已有 watcher，没有 Browser build、复制目录或 Native 配对变更；云控/Native诊断未知不属于本轮 Cookie 核心链 |
| 真实写入与登录 | 因文件过期，网站权限、逐批可信确认/取消、SDK写入、账号登录仍 NOT_TESTED；不借用共享ego其他TaskSpace的账号，不向ChatGPT发送消息 |

源码改变：登录卡默认open且不在普通render强制open；版本置于首屏，三步与预检数量可见；过期专用错误只包含条目序号/到期时间，不泄漏名称或值。独立复核复现摘要在延迟回执期间“尚未写入”可能不实，已删除该断言；安全拒绝、授权、journal和执行边界保持原实现。

验证由新增过期诊断、摘要清理及版本恢复触发：parser/local controller/站点恢复/旧版恢复/预览隔离共 **35 项 Node/VM PASS**。覆盖格式/大小/过期输入零派发、取消清摘要、Store变更、分批新确认、重复点击、余批过期、unknown重开保护及旧事务只查原ID；名称含native的fixture不作Chrome证据。JS语法和diff检查另行记录；未跑全仓CI、生产、矩阵或评分。

工具buildId `113590d41102c681e6ed785f338921972f2548a4d0242944938aec125b3da765`（14输入/2输出），预览buildId `3c6dcf3dc8f0a0adf845b5c65675f67a618da8633cd56e5bc707fec31df34c9e`（27输入/5输出），所有字节/摘要匹配。唯一包 **1.4.16 / 138235 bytes / SHA-256 `a5217f1c7e253fb8092f61123c0b7209b20229d17d74816f43c42aeb660ce3cd`**，原候选→检查→晋升→`PROJECT_PACKAGE_MATCH`通过，真实导入审阅显示同摘要。

可见截图位于 `artifacts/ai-vip-share-chatgpt-20261106/v1416-installed.png` 与 `v1416-installed-expired.png`（实际已安装页面）；`v1416-initial.png`仅为同源预览。正常窗口/默认缩放人工检查版本、三步、主操作及错误区可读、无遮挡；不签署原生窄侧栏或深色矩阵。该阶段没有剔除或延长过期项；后续处理要求已由顶部 1.4.18 的用户授权与过滤合同替代。


<a id="local-chatgpt-1415-20261106"></a>

## 2026-11-06：本地 ChatGPT 文件核心开发与最小验证（1.4.15）

Owner：接收对话 `01a1acaa-505e-7113-a4c6-d9b29f5cb36c`，现有 main，接收时 HEAD `3b0b90e66`。继承的本工具未提交改动由本轮承接；Framework、Cookie Editor、Web Flow、Native、来源保护及其他任务文件均未改写。原对话 paused 不等于目标完成；本轮目标仍未完成，真实外部步骤未通过。

### 当前操作与证据层级

| 用户操作 | 本轮结果 |
| --- | --- |
| 真实材料取得/预检 | 用户指定原文件只读、仅内存预检；25 条中 1 条过期，最早到期为北京时间 2026-11-06 00:58:19，01:06 检查返回 `E_COOKIE_FILE`。未删行、改值、续期、另存明文或上传。未提交真实 Cookie |
| 实站基线 | ego(lite) TaskSpace 3，本任务新页面访问 `https://chatgpt.com/`，显示“登录/免费注册”；未发送消息、未验证权益、未清除现有会话。它是新的未登录观察，不沿用旧 CFT challenge 结论 |
| 预检界面/取消 | 同一 TaskSpace 的同源 React **合成预览**：无会员服务时仍有本地文件入口；坏 JSON 显示格式错误，合成两分区文件显示第 1/2 批/1 项；取消隐藏确认、清空 input、恢复选择按钮并回焦，页面不显示合成值。未点击批次提交，无真实 SDK/Chrome 调用 |
| 防重复/迟到/恢复/unknown | Node/VM 合成行为：双击只派发一次、下一批须新点击、成功后按钮恢复、重开不写、可信 `E_COOKIE_NOT_SUBMITTED` 才能再明确确认，普通取消保持 unknown；首批晚于 120 秒成功保留 journal，余批未提交数量可见且不开页。不能称原生 PASS |
| 当前候选真实入口/安装/可信确认/写入/登录 | **NOT_TESTED**。ego 扩展列表为空，当前 `task.cdp` 仅支持 Target/Browser，调用 Extensions 加载接口被拒；原生目录选择器未自动操作。受管 test-chatgpt-01/02/03 均有其他 owner，UI 锁也属其他任务；未申请/回收/接管任何 slot，没有启动 CFT、seed/login 或 CDP 注入 Cookie |

现有 `npm run dev`（观察 PID33443，子 Node33463）已监听 43119/43120，固定 `dist/development/manifest.json` 已恢复；这只证明输出与监听存在，**当前本轮 actual extension ID、加载路径、serve 客户端连接及 Native 配对未读取**。未启动第二 Browser writer，也未覆盖/停止已有服务。ego 普通网页和预览不证明持续开发连接或扩展专项通过。

### 修复、检查与包

修复两个 P2：本地文件完整完成与本批成功分开，迟到首批不能误报全文件成功/自动开页；省略与显式 Store 混用在分组前拒绝，不放宽 journal。确认前到期也显示未提交数量。`AI_VIP_REACT_SOURCES` 补齐 `src/local-cookie-file.js`，preview 继续复用原来源列表。包版本、控制器版本升为 1.4.15，恢复兼容列表保留 1.4.14 及更早版本；原 1.4.14 unknown 事务可查询但不被清除或重兑。

本轮检查由新文件来源、两个复现、原控制器接入及版本升级触发：

- parser 9、local controller 7、UI/包同源 5：共 21 项 Node/VM 通过；原始输出 `artifacts/ai-vip-share-chatgpt-20261106/local-and-package-tests.txt`。两个新到期行为测试修复前均失败，修复后通过。
- 原 `controller-native-regressions` 11、站点恢复 10、旧版恢复 6、预览隔离 2：29 项通过；另补 1.4.14 恢复行为 1 项通过。名称含 native 的文件实际为 Node fixture，没有原生浏览器证据。未跑全仓测试或延期矩阵。
- JS 语法、JSON 解析及本工具 `git diff --check` 通过。限定独立复核无可复现发现，额外首批迟到未知结果检查通过；它不代替原生测试或架构/发布签署。
- 工具/预览使用项目原 Vite 脚本构建成功。工具收据 buildId `e0fd306d90a095b60530327c4510acf4add68f05170c35dc9a8a43f2d2d29ed9`，14 输入/2 输出；预览 buildId `857ed97fe1231ef403edcf2c907dcbe8fdcece5afb1bf1b415fe281dc6734240`，27 输入/5 输出；所有来源和产物逐项字节/摘要匹配。
- 原打包器候选→检查→`--promote-from`→`--check-project` 返回 `PROJECT_PACKAGE_MATCH`。唯一正式包 **1.4.15 / 135852 字节 / SHA-256 `19d8bf682db0500697c46c954f25230c738c7bb8a1c29131349ca7182a766892`**，状态 `PACKAGE_READY_INSTALL_NOT_TESTED`。新增 `browser.cookies.read` 尚未真实安装审阅；仅用于核对当前 Store/Partition。

本地合成证据为 `ego-synthetic-preflight.txt/png` 和 `ego-cancel-state.json`，均在上述忽略的 artifacts 目录；未将真实文件带入预览或 fixture。TaskSpace 已 `finish({keep:[]})` 释放本任务两页，临时预览服务 127.0.0.1:54692 已正常停止；未占用 Profile/UI 租约。所有历史 journal/unknown、其他窗口与服务保持原归属。

下一条未完成操作是当前 1.4.15 从原扩展入口安装更新，再用新的有效用户文件完成逐批可信确认、取消、SDK 核验、实站登录及重开。Cookie 回读/HTTP 200 不证明登录，登录不证明套餐。等待有效材料与明确可用的测试资源，不以新 Profile 绕过 unknown。商业、支付、真实代理流量、production/发布、全量矩阵、宽度/缩放与 95+ 评分继续延期。

<a id="design-alignment-20261101"></a>

## 当前目标：按 design.html 对齐实际 UI 与交互（2026-11-01）

用户明确参照为 `ai-vip-share/preview/design.html`，随后要求共享 Neutral shadcn aria-nova 及简化网站登录。原对话 `01a19391-0cc1-7f63-b2b8-7f94aee5d258` 的原生目标创建时为 active；最新交接报告为 **blocked**，本对话未迁移、恢复或完成它。1.4.13 本轮完成已授权的源码、预览、包与本地提交，新原生安装未执行。下文旧轮次目标和证据按原候选及层级保留。

**目标与范围：** 对齐设计稿的紧凑视觉、信息层级和关键交互，使实际侧栏可用且反馈一致。业务 owner 仍为本工具；正式 React/控制器是唯一实现，同源预览只替换能力边界。[当前设计合同](../../DESIGN.zh-CN.md#当前-ui-对齐合同2026-11-01)明确品牌、布局、快速登录和历史模拟的取舍。只在现有 main 编辑，不建分支/worktree/PR，不推送；保留并行改动、Profile、Cookie、journal、旧 unknown 和现有服务。未证明公共缺口前 Framework 只读。

### 本轮基线与第一条真实操作

已在日常 Chrome 通过原工具栏打开 Side Panel →「扩展」→ AI VIP Share → 从设置返回主页；真实标题为 **1.4.8**，扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`，会员/代理均未配置。当前 Chrome 的加载目录、serve 连接及完整已安装摘要本轮尚未重查，不拿另一 Core Profile 的 1.4.11 历史证据代替。运行模式仍须在实施前确认为 `dist/development` 持续开发并核对现有 writer；此轮没有启动、停止或切换产品环境。

用户正在看的本地 `preview/design.html` 默认显示有效会员/代理已启用；已仅将其模拟场景切为“仓库真实基线 · 服务未配置”作同状态对照。基线截图与 AX 位于本机 `artifacts/ai-vip-share-design-alignment-20261101/baseline.png`、`baseline-ax.txt`。随后尝试点击真实商品按钮前，用户切换了应用内容，驱动中止；重查后确认已是其他工具页面，不追加点击，该按钮本轮 **NOT_TESTED**。

初始仓库正式包为 **1.4.11**，不能用日常安装 1.4.8 签署新候选。当时 `preview/dist/build-ready.json` 的 buildId `1476dcd0c8b234e0504452ee2cb287d320ddfb2d933ace9b7cc61248d2cbbae5` 与七项输入不匹配：`src/main.js`、`src/cookie-journal.js`、`tool.config.json`、`package.json`、共享 `design-tokens.css` / `design-system.css` / `button.tsx`。这证明旧产物来源过期，不直接证明 UI 代码有故障；本轮后续已重建，结果见下方 1.4.12 记录。

### 关键通过条件（唯一当前账本）

| ID / 优先级 | 用户操作与可判定通过标准 | 最小证据与本轮状态 |
| --- | --- | --- |
| G1 / P0 来源和同状态 | 明确 design.html 参照摘要、正式包/源码候选、Shared UI 来源、真实安装版本与业务状态；预览回执全部输入/输出匹配。有效会员对有效会员、未配置对未配置，数据差异单列，不用演示成功替代真实缺配置 | 1.4.13 工具 12 输入/2 输出、预览 25 输入/5 输出匹配；会员/未配置对照已保存；**安装配对 NOT_TESTED** |
| G2 / P0 视觉 | 删除内部品牌区，按最新共享 Neutral 设计核对层级、留白、边框/圆角、字体、控件和条件性网站入口，正常窗口/默认缩放操作 | 参照/React 会员与未配置、浅深主题检查通过；业务数据差异见下节，**实际侧栏未签署**，无宽度/缩放矩阵 |
| G3 / P0 兑换与焦点 | 明文输入/清空可用；Enter 仅预检，取消/Escape 不消费并回输入焦点；明确确认至多一次提交；unknown 重开仍锁定，只查原事务，不自动重兑 | React 预览非法码→有效码 Enter→Escape：仅两次 preview POST、redeem 0，清空/Tab 焦点通过；原事务回归通过；**新原生确认 NOT_TESTED** |
| G4 / P0 网站与返回 | 默认无测试站；已批准站按阶段准备/确认，保留精确批次、取消回焦、隔离与恢复；历史写入不等于当前登录 | 预览单站无选择器，准备后取消 Cookie/Tab 0，unknown 一次模拟写入后锁定且不开页；HTTP/VM 覆盖切站、撤权及延迟恢复；**宿主返回/原生 Cookie 实效 NOT_TESTED** |
| G5 / P0 状态反馈 | 加载结束，状态准确；失败有可见恢复动作，在途不重复、旧响应不覆盖新站/账号 | 当前预览未配置、非法码、网站准备失败、会员查询中断通过；51 项定向检查包含恢复/在途/迟到响应；新原生故障分支未测 |
| G6 / P0 代理退出 | 刷新只读；单一 START/STOP，冲突/未知不假报成功；会员离线仍可 STOP，仅释放自己 | React 预览会员 GET 失败后 STOP 可用并回读释放，离线/停止未知回归通过；**新原生回读 NOT_TESTED** |
| G7 / P1 记录与外链 | 记录展开/收起不改变事务；商品/客户端各一入口，缺地址反馈，批准地址才开页 | 当前预览一条记录展开/收起、说明折叠及两个未配置外链提示通过；实际商业地址仍空，原生外链 NOT_TESTED |
| G8 / P0 安全与证据 | 正式包无 fixture/场景开关，预览隔离真实 SDK；不放宽权限/CSP/来源、不清旧 unknown，区分证据层级 | 隔离/包检查、独立审阅及三项发现修复、原候选晋升/同源核对通过；六能力不变；安装更新 **NOT_TESTED** |

### 基线阶段执行记录（历史，当前结果见 1.4.13）

1. **已完成目标设置与基线核查**：指定参照、原生 active 目标、真实打开/返回、版本及过期预览来源核对；没有宣称 UI 修复。
2. **下一条操作**：核对现有项目 watcher/侧栏调试与 Shared UI 运行身份，使用当前正式源码恢复有效的同源预览；不覆盖 Browser `dist/development` 或他人输出。只按同状态差异清单修改本工具 App/CSS/必要控制器，不重做 Host、业务架构或设计稿。
3. **最小浏览器检查先收窄**：现有 `preview/test-react-chromium.mjs` 强制含多宽度与 200% 缩放；先提供本轮默认窗口核心路径，再验证 G2/G3/G5/G7。历史 `archive/r57.html` 测试只算历史模拟；保存 design 截图而没有比较结论不能签 G2。
4. **按改动选择测试**：fixture/别名改变才跑 `tests/preview-isolation.test.mjs`；兑换/会话/代理控制器改变才跑对应用户行为检查；预览回执因当前输入失效，需修复后执行工具 `build:preview` 并校验来源。实际安装 UI 与正式 Shared UI 适配另行操作，不以预览 PASS 替代。
5. **可见交付**：差距修复后给同候选对照图、通过项与未测项；若本轮修改正式运行输入，按原打包 Skill 交付唯一正式包，安装/更新保留数据与原确认链。只完成本轮范围，不自动进入旧全面验收。

商业后台/支付/真实第三方账号、真实代理流量、production/发布、全量矩阵、宽度/缩放专项、95+ 评分和旧 unknown 恢复继续延期。目标设置阶段只修改说明，后续品牌删除的实际结果见下节；没有安装更新或推送。

设置阶段核对：13 个当前章节本地链接目标存在，G1–G8 八项齐备，`git diff --check` 通过；限定独立文档审查 APPROVE。基线参照/正式包 SHA、预览过期输入和本轮身份边界保存于本机 `artifacts/ai-vip-share-design-alignment-20261101/baseline-sources.json`。这些只证明目标设置与文档检查，不是产品测试结果。

### 1.4.13：共享样式与网站登录简化

当前交付 **PACKAGE_READY_INSTALL_NOT_TESTED**。在基线提交 `b298346a0aa3a3af0128a22ff8a3983b494fbd83` 之后只修改本工具及既有 UI 合同测试；Framework 源码、打包器和共享组件保持只读，未新增依赖/能力。保留现有 50910 预览服务、所有 Profile、Cookie/journal、旧 unknown、其他实验服务与 Browser watcher，未构建/覆盖 `dist/development`，未更新可信开发来源 pin。

- **共享设计：** 正式 React 与参照显式使用 `.od-theme-shadcn`，按钮/卡片/输入/焦点/禁用态消费公开 Shared UI，删除私有紫色控件皮肤。预览样式通过正式打包器使用的公共 CSS 抽取器编译，参照引入同源 `design.css`。正常默认窗口检查浅/深主题，没有宽度/缩放矩阵。
- **网站登录：** 默认会员及兑换预览不提供网站目录；单个已核验网站只显示名称/域名行，展开准备后再显示账号、目标及替换提示，只有多站才提供选择。普通站测试需批准开发面板的可信点击；历史普通站偏好/成功 journal 可在原批准 profile 下恢复展示，不产生获取/写入动作。撤权独立于列表显示状态检测，延迟返回的旧偏好不恢复选择。
- **安全与反馈：** 准备/取消回焦没有 Cookie/Tab 操作；unknown 模拟批次调用一次后禁止再次获取且不开页，不宣称登录成功。获取失败可见并提示刷新授权目录；新确认/新警告展开一次，普通刷新尊重用户折叠，历史成功结果保持紧凑。原会话校验、精确批次可信确认、CAS journal、撤权和 STOP 路径未放宽。
- **验证：** 工具/预览构建通过；7 个相关测试文件 **51/51 PASS**，包括会员展示、站点恢复、离线、原生路径控制器回归、独立临时 HTTP 来源、预览隔离及 React/包合同。独立审阅发现三项问题，各有修复前失败与修复后通过证据；限定复审无新阻塞。浏览器预览检查兑换非法码/Enter/Escape/清空与键盘焦点、记录/说明折叠、两个未配置外链、登录准备/取消/失败/unknown、会员断线后 STOP。模拟 SDK 不接触真实网络、Cookie 或 Chrome 代理。

正式包 **1.4.13，127261 字节，SHA-256 `1472645e0046d04170bc5b49b8bb1696cdcd2e043c5e99e9f44bd2b5d040b7bd`**。由单一临时候选经受影响门禁后 `--promote-from` 晋升，`--check-project` 返回 **PROJECT_PACKAGE_MATCH**；目录仍只有一个正式 JSON。源码构建 buildId `615a1d4fafe79a8e928dbcbe16ffcf94be071a141c50656feea619aa16a59a74`（12 输入/2 输出）；预览 buildId `3055b3f8fb6a460d84d3c845ec8355c84d0a4273aaa5484945339c2540eca9be`（25 输入/5 输出），逐项字节和摘要匹配。参照 `design.html` SHA-256 `fd0332c9334a6d0c170604d411999ceeb9f1175e2289e51288301dbd798a9056`。

本机证据目录 `artifacts/ai-vip-share-design-alignment-20261101/`：`ui-targeted-tests.txt`、`review-regressions-before.txt`、`final-sources.json`；同状态截图 `design-final-member.png` / `ui-final-member.png`、`design-final-unconfigured.png` / `ui-final-unconfigured.png`，另有 `ui-final-login-review.png`、`ui-final-dark.png`。参照与正式保留业务差异：假账号/31 天不覆盖实际核验值，刷新不变成假账号管理，不展示未核验进度；实际辅助权益和共享折叠行为按正式合同呈现。截图不是像素完全相同或宿主实际侧栏通过的声明。

本轮下一条未验证操作是由原可信安装器审阅更新 1.4.13，并核对宿主 Shared UI 与同候选真实行为；它不作为本次源码/包本地提交前置。本轮 **原生安装/升级、宿主设置返回、真实网站登录与 Cookie/代理效果均 NOT_TESTED**，历史 1.4.10/11 证据不冒称新候选。原对话目标仍按最新交接的 blocked 报告保留，本对话不控制其生命周期；商业、production、全量矩阵、评分、真实代理流量和旧 unknown 恢复继续延期。未推送。

### 1.4.12：按用户要求删除工具内品牌区

最新要求为同时删除预览与扩展中的品牌图标、`AI VIP Share` 标题和「网站快速登录 · 会员与网络服务」副标题。已从正式 `src/App.jsx` 与选定 `preview/design.html` 删除对应整块，清理专属样式，移除现有浏览器脚本对已删除节点的查询；控制器、权限和安装身份不变。参照调整由用户明确提出，不将此调整视为其余 UI 差距已解决。

- 工具 `build` 与 `build:preview` 均通过。预览新 buildId 为 `8fda06749e9bf6a2e8762df4fb2de12c1db9ea5d5872ca23a133d31a1c8e5156`；未覆盖 Browser 输出或其他项目 watcher。
- `tests/environment/ai-vip-share-ui-parity.test.mjs` 与本工具 `tests/preview-isolation.test.mjs` 合计 **7/7 PASS**，证明控制器必要节点、构建来源、正式包与 fixture 隔离保持有效。只修正既有断言，不新增可逆文案/样式的字符串测试。
- 内置浏览器在正常窗口、默认缩放打开新 React 生成物和设计稿：品牌块均为 0，React 产品可见文本无该副标题，首块直接为网站快速登录（有来源时）或会员。截图保存在本机 `artifacts/ai-vip-share-design-alignment-20261101/header-removal-preview.png` 与 `header-removal-design.png`；这是预览证据，不是已安装侧栏截图。
- 原打包器生成候选、检查后 `--promote-from` 晋升，`--check-project` 返回 **PROJECT_PACKAGE_MATCH**。唯一正式包 **1.4.12，131840 字节，SHA-256 `f22fdcc24f9d429b6f9455a36444b46ff884bbed13a10b6032f8fc992877a537`**；六项 capabilities 不变。

本轮未更新安装、未改可信开发包 pin，原生日常安装 1.4.12 为 **NOT_TESTED**；不接触 Cookie/journal、旧 unknown、代理或实验账本。品牌块删除已完成源码/预览/包交付，G1–G8 的完整 UI 一致性目标仍 active；下一步仍为当前候选与实际侧栏的身份及同状态配对，不恢复延期验收。

以下“本轮/当前”均为各历史阶段的观察。

## 目标与当前阶段
用户要求的核心 UI / 功能续测已有对应证据。**11 月 1 日经用户明确授权启动独立新实验，完成服务恢复、在途保护、两站登录与失效、未知兑换查询及离线 STOP；复现的三项故障已修复，原安装已更新至 1.4.11。** 下节区分候选与测试层级，不把旧版操作称为当前版本全量复测。旧实验 unknown 仍未恢复，商业和 production 验收未执行。

仓库 /Users/shopme/Documents/workspace/opendesk-browser，业务 owner examples/sidebar-tools/ai-vip-share/。当前是核心开发与最小验证；商业接入、production、正式发布、全量原生矩阵、评分、宽度/缩放及代理流量研究延期。仅用现有 main，不创建或切换分支、worktree、PR，不推送。先读当前 AGENTS、opendesk-sidebar-tool-dev Skill、公开 SDK 和原项目说明；证实公共缺口才按 opendesk-extension-runtime 处理平台范围。

<a id="native-1411-20261101"></a>

## 2026-11-01：新实验、1.4.11 修复与原安装更新

### 授权、安装和账本边界

原 7898/7901/7902 服务已离线，旧终端均返回 `Unknown process id`；观察摘要无法重建原内存账本。用户对明确的新实验方案回复 **「允许新实验，保留所有旧记录」**，据此在原固定来源启动标记为 `NEW_EXPERIMENT_20261101` 的新账本，使用新的一次性模拟来源凭据及账号 `new-fixture-account-20261101`。没有以新账本替代或恢复旧账本，没有卸载、清 Cookie、删 journal 或解锁旧 unknown。旧封存记录仍为 **UNKNOWN_NOT_RECOVERED**；两个新 DEMO 码的消费只属于新账本。

真实入口为「扩展 → AI VIP Share」，Profile `AI VIP Core 20261030`、Chrome 测试版 v149.0.7827.55、扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`。持续开发仍加载 `~/文稿/workspace/opendesk-browser/dist/development`；原 watcher PID14632 / 43119、43120 和既有代理 PID43518 / 7897 未停止、替换或覆盖。更新后原调试页实读「开发服务已连接」，构建 revision `43e0cef0b61133f516e93903f551339321edf26134b3935ede4336179e4d5871`；此指纹包括并行输入，不证明其他模块通过本任务检查。Browser production 构建未执行。

唯一正式包 **1.4.11，124706 字节，SHA-256 `3622cb71549c2cef4e58760a64a737b8a111b1133223e52ee28e8b4040293304`**。原导入器审阅完整摘要、1.4.10 → 1.4.11、保留数据、无新增能力，经「确认更新」成功；实际工具标题显示 v1.4.11。随后原「查看详情」读回本机已安装/已启用、版本及完整固定摘要，均与正式包一致（截图 09）。六项 capabilities 不变。可信开发配置只更新独立审阅后的精确包 pin，固定 `127.0.0.1:7897` / 七域范围、生产禁用及 Authority 不变。

### 真实用户操作与结果

| 操作 | 实际结果、版本与证据边界 |
| --- | --- |
| 离线 UI、草稿及辅助入口 | 1.4.10 加载结束并显示无法核验；站点单选/取消/键盘、设置返回、滚动可用。未提交测试草稿触发离开保护，Escape 保留并返回焦点；明确放弃后重开凭据为空，旧 Cookie 写入事实保留。商品/客户端未配置时提示而不导航，代理检测不 START。有效格式的未签发凭据在离线来源被拒，没有 Cookie 确认；该离线阶段没有原生 RPC 计数，不据此推断精确零派发 |
| 离线会员恢复、主动刷新 | 同一 1.4.10 实例由离线错误恢复为新模拟账号；保留普通站选择，不自动取得会员网站会话。新服务延迟一次会员 GET 时双击刷新并尝试切站，只有一次新 GET，在途禁用、选择不变，完成后恢复操作 |
| 普通工作台 1 | 1.4.10 在没有会员权益时取得授权会话；缺精确网站授权先被原可信入口拒绝。明确授权后，可信批次默认取消/Enter 返回触发按钮；再次明确操作并确认两项 Cookie 后，目标 `localhost:7901/session/` 显示有效模拟 VIP。随后同一新账本撤权，目标自动核验为失效并隐藏账号。来源授权 GET 4 / 会话 POST 1；截图 05 |
| 普通工作台 2 与自然到期 | 1.4.10 初次因 journal 容量不足在派发前受阻；修复并更新 1.4.11 后，新明确获取、原设置中授权精确 `127.0.0.1:7902`、原可信两项确认成功，目标显示「受控会话有效 / o***@fixture.test / 本地体验 VIP」。生效 02:47:33、到期 02:48:33，02:48:24 仍有效。02:50 原生观察已为「未登录 / 模拟 VIP 未验证」，Cookie 自然到期，无时钟偏移或自动重写。来源累计授权 GET 5 / 会话 POST 2，有效目标核验 4 次；截图 07/08 是到期后的状态，不冒称有效态截图 |
| 预检、取消及明确兑换 | 1.4.10 新账本 DEMO-01 预检后 Escape 取消：preview 1、redeem 0；重新预检并双击明确确认只消费一次，显示 20 次/1 条。普通站选择不变，没有自动获取会员会话 |
| 丢兑换回执与关闭重开 | 新账本 DEMO-02 丢一次提交回执后显示未知；关闭重开仍锁定、不重提。主动「核对上次兑换」只新增 status POST 1，redeem POST 保持 2，恢复 20 次/2 条；不触碰旧实验 unknown。1.4.11 更新和重开仍显示两条历史 |
| 固定代理 START、离线 STOP | 1.4.10 经原可信确认启用固定开发线路；将同一会员服务置为 GET 503 后，界面保留待核验的历史权益并暂停兑换，STOP 仍可用。停止后显示 Chrome 已确认当前安装代理已释放；没有修改系统代理、停止既有 7897 服务或发送转发流量。1.4.11 未改代理启停实现，保留该候选证据，不称新版本重测 START |
| 1.4.11 写后刷新、关闭重开 | Cookie 写入结束后「刷新会员信息」恢复可用，主动刷新成功。返回列表重开保留工作台 2、两项已写入事实，凭据为空、当前「尚未取得会话」；新普通来源 POST 与兑换 POST 均未增加。工具不把旧写入事实当作目标仍登录；会员 20 次/2 条与已到期的网站会话分别显示，截图 08 |

02:50:26 新服务只读观察：第一站授权 GET 4、会话 POST 1、历史有效目标核验 64；第二站授权 GET 5、会话 POST 2、有效目标核验 4；会员 GET 11、preview POST 3、redeem POST 2、status POST 1，账本两条均 redeemed、leases 0。02:57:58 最终观察只增加会员 GET 至 14，来源与兑换 POST、status 和账本均不变；目标页每五秒只读导航使目标 GET 持续增长，不属于 Cookie 重写或兑换。原始非秘密观察见本机 `new-observations.json`。

### 复现故障、最小修复与历史完整性

1. Cookie 操作将会员刷新设为禁用，但结束时没有恢复。现在按 endpoint、兑换、Cookie 与会话在途状态重算禁用状态；原生 1.4.11 写后按钮可用并成功刷新。
2. 已确认兑换成功、随后权益刷新失败的旧提示，在新 GET 成功后仍残留。只在无兑换/恢复/恢复故障且本次权益新鲜核验成功时清除该精确提示；未知事务和核对失败提示继续保留。此修复有 VM 行为证据，未对 1.4.11 再消费新码制造故障。
3. 原 `aiVipCookieDeliveryR137` schema 2 的九条记录已达 7828 字节，新增操作及最坏回执预留超过公开单值 8192 上限，第二站在 Cookie 派发前被阻止。新存储 schema 3 仅为范围/槽位去重字典，内部 API 仍使用校验后的 schema 2；旧版可读，同 key、单次 CAS、精确读回和最坏回执预留不变。不删除历史、不放宽公共存储预算、不增 Host 或 key；容量仍有限，真正满时明确提示「恢复记录容量不足，未提交Cookie；原记录已保留」。

原生沙箱通过公开 `storage.get` 只读核对，不输出 Cookie 值、凭据或原记录正文。升级前九条为 7828 字节；两次新操作后 schema 3 共十一条、5840 字节。解码后的前九条与 legacy 的 SHA-256 均为 **`db5ca156f39e6f0300b140b9916deb25bcfec29493aa4dab7d5549fb22fc1f17`**，旧事实逐项保留。新两条分别为可信未提交和成功；没有将旧 unknown 变成成功。非秘密元数据保存在 `journal-before.json` / `journal-after.json`。

### 定向验证、交付与保留现场

验证均由上述实际失败或包更新触发，用于证明刷新恢复、日志无损/CAS/容量/unknown、两站隔离和精确候选来源。未运行全仓 CI、Browser 构建、商业或宽度/缩放矩阵。

- 控制器 `controller-native-regressions`、`controller-offline`、`controller-site-restore`、`controller-vm`、`controller-recovery-upgrade`：34 项 PASS。
- `cookie-journal` 与新增 `cookie-journal-storage`：31 项 PASS，覆盖旧未知与过期 seen 保留、近上限无损迁移、坏字典引用拒绝、有限容量、并发冲突和丢回执。
- `controller-ordinary.integration`：7 项 PASS。只将测试监听端口改为自有临时端口、传输映射回原逻辑来源，避免占用需保留的新实验服务；继续验证实际 HTTP、两种不同 Host 与逻辑精确范围。这是测试隔离，不改变工具固定来源或原生合同。
- 精确正式包 UI 契约 1 项、`browser-managed-proxy-development` 5 项 PASS；合计 78 项定向检查，无失败。不是整款产品所有测试的分母。
- 工具 Vite 构建通过；独立限定审阅未发现阻断，canonical 打包结果与候选逐字节一致（包括组合 CSS）。原打包器 `--promote-from` 晋升，`--check-project` 返回 `PROJECT_PACKAGE_MATCH`。没有新增安装器或重复正式包。

本机忽略目录 `artifacts/ai-vip-share-native-20261101/` 保存新实验脚本、非秘密观察和截图：01–04 为离线/草稿/辅助入口，05 为 1.4.10 第一站有效态，06 为新兑换核对恢复，07 为 1.4.11 第二站自然到期，08 为 1.4.11 会员/两条兑换历史与到期页，09 为已安装 1.4.11 完整摘要，10 为更新后开发服务连接。截图不含真实账号、凭据或 Cookie 值；只读截图与摘要不提交为成堆产物。

新实验内存服务继续保留（终端 session 2348），不停止或重启清账；原 Profile、所有 Cookie/journal、旧受限备份与 unknown、watcher 和代理均保留。当前本对话 `get_goal` 实读为 null；下文其他对话的 active 目标是历史记录，本轮没有创建、完成、暂停或迁移其生命周期。商业接入、代理实际转发、production/发布、全量原生矩阵、评分和旧 unknown 恢复仍未执行；核心开发收尾不自动进入这些阶段。

**以下续测表格及章节保留各阶段历史。** 其中未恢复、未改源码、未升版与 NOT_TESTED 是对应时点的观察；本轮新授权和新结果以上节为准。

## 当前续测目标与关键条件（2026-11-01）

用户再次明确「继续，设置目标和关键测试条件」后，本对话 `01a192f6-10a1-77c3-ba16-ff498377cf51` 已建立原生目标，创建及读回状态为 `active`，未设置 token 预算。它是本轮续测目标，不改变下文旧对话目标的历史状态；最终生命周期以本对话最后一次目标工具读回为准。

**本轮目标：补足当前可安全执行的核心 UI / 功能覆盖缺口，实际复现缺陷才最小修复，给出按候选与测试层级区分的证据和剩余未测项。** 优先选择「会员服务离线后恢复，用户主动刷新」及在途重复刷新；到期/撤权保护复用现有有效证据。01:24 原生 1.4.10 与 11 项定向检查是基线，不是本轮新执行结果。

| 条件 | 通过标准 | 本轮选择与现有依据 |
| --- | --- | --- |
| G-UI | 加载可结束，错误可恢复；站点单选/取消、键盘、滚动、设置返回和取消焦点不串站 | 复用下文原生有效 UI 证据；本轮重点检查失败到恢复的状态转换 |
| G-RECOVER | 服务恢复后主动刷新只读核验，清除离线错误，保留所选普通站；凭据不持久化，不自动取会话、兑换、写 Cookie、开页或 START | 同一 fixture/账本恢复组合回归 PASS，见下方本轮结果；原生重连 NOT_TESTED |
| G-INFLIGHT | 请求在途时重复动作不增加请求，结束后按钮可用；切站或旧实例晚响应不污染新身份 | 在途重复会员刷新回归 PASS；站点晚响应与旧事务隔离沿用原有定向依据 |
| G-EXPIRY | 到期/撤权/账号或来源换代后不继续使用授权，不把历史 Cookie 成功事实当作仍登录 | 复用现有 HTTP 到期/撤权与原生撤权证据；原端口服务不可达时，目标页到期原生复测保留 NOT_TESTED，不新建旧账本替身 |
| G-EFFECT | 明确确认至多一次消费；unknown 只查原事务；离线/权益失效仍可 STOP，只有确认释放才显示停止 | 复用原生兑换/配置 STOP 与新增 8 项离线 VM，绝不把 VM 回执计数冒充原生计数 |
| G-EVIDENCE | 每项列出实际操作、候选、层级、结果；修改后仅运行受影响检查，精确路径提交到 main，不推送 | 本文维护；没有新问题时如实收尾，保留未测范围，不无限扩大测试 |

**运行边界：** 本轮开始只读确认 `main`、本工具目录干净，原 watcher 与 7897 代理仍在，7898/7901/7902 无监听。运行身份仍须按需实读；当前没有重新启动任何服务。允许自有隔离 fixture 的 HTTP/VM 行为测试，其账本与原 Profile 完全无关；不清 Cookie/journal、不重装、换来源或重启旧账本来解除 `UNKNOWN_NOT_RECOVERED`。固定来源、六项 capabilities、原 SDK/Host/Authority 与唯一安装器保持原合同。普通站独立于会员/代理。

商业后端、支付/真实账号、第三方目标站、代理转发与竞速、production/商店发布、全量矩阵、宽度/缩放及 95+ 评分继续延期。完成本轮可安全执行的覆盖、必要修复与最小验证后按事实收尾；原生受限分支写 NOT_TESTED/BLOCKED，不伪报完成。

### 本轮恢复与在途检查结果

本轮只增加 `tests/controller-offline.test.mjs` 的两项用户行为检查，没有修改业务源码、正式包或 helper。运行真实控制器和原 fixture handler 的内存实例，不监听端口，不接触原 Profile 的 Cookie、账本或 unknown。

| 操作 | 实际断言 | 结果与层级 |
| --- | --- | --- |
| 在自有 fixture 完成一次兑换，再用同一账本/偏好离线重开；恢复服务可用后主动刷新 | 初始失败 GET 后仅新增一次会员 GET；恢复有效权益、20 次额度和 1 条历史；保留工作台 2，离线错误消失，输入/刷新可用；账本字节不变，凭据为空、会话未取得，零 Cookie/开页/代理 RPC | Node/VM + fixture handler PASS；不是真实 HTTP 重连或原生 UI |
| 拦住恢复 GET 的回执，重复点击刷新并尝试切站，再释放回执 | 在途按钮禁用，仍只有初始失败和本次恢复两次 GET；所选站点不变；回执到达后结束加载、按钮恢复，可再次切站；零 Cookie/开页/代理 RPC | Node/VM + fixture handler PASS；无超时重试或重复提交 |

对应复核命令（只选这两项新增行为，不重复下文已有效的 11 项基线）：

```bash
node --test --test-name-pattern='explicit refresh after|in-flight recovery' examples/sidebar-tools/ai-vip-share/tests/controller-offline.test.mjs
```

**2/2 PASS，0 failed / skipped。** 初次在途检查把“加载期间可切站”当成预期而失败；源码确认这是既有 busy 保护，已改为验证加载期间忽略切站、结束后恢复操作，没有让产品适配错误断言。本轮未发现新的产品缺陷。

独立静态审查未发现这两项测试的虚假 PASS、请求/账本/副作用断言缺口或挂死风险；审查未执行浏览器、服务或构建。新增测试语法、文档目标链接与差异格式检查通过。

原生分支尝试补「有效格式的一次性虚构凭据 → 离线来源拒绝」，两次操作均被 Computer Use 的“用户已改变应用，须重新查询状态”保护中止；每次重查来源凭据仍为空，未取得成功输入/提交证据，**此项 NOT_TESTED**。停止该资源分支，避免争用浏览器；没有把驱动中止算成产品失败或零 RPC 证明。原生服务恢复、目标页到期仍 NOT_TESTED：固定端口未恢复，旧账本存活状态未知，未通过重启/换来源绕过。现有到期 HTTP 与原生撤权证据继续按原候选复用。

本轮交付范围为上述两项新增控制器检查及目标/结果文档；未修改工具运行输入，因此没有重建、升版、晋升或重装。原 watcher、代理、安装身份、六项 capabilities 与旧 unknown 继续保留。

## 2026-11-01：离线 UI、恢复与 STOP 保护补测

本轮接续「继续完善 UI 和功能测试」，先操作当前真实入口，再补覆盖。没有重新创建或推断旧目标状态，没有重启模拟账本、改固定来源、清 journal/Cookie 或重装。业务 owner、公开 SDK 和安装身份不变；本轮仅测试与文档变化，无需编译、升版、候选晋升或安装更新。

### 当前运行条件与身份

- 北京时间 2026-11-01，本轮截至 01:24 的原生观察，正常窗口、默认缩放；既有 `AI VIP Core 20261030` Profile，Chrome 测试版 v149.0.7827.55。通过原扩展菜单打开 Side Panel，再从「扩展 → AI VIP Share」进入。当前网页是 `chrome://extensions/` 时原 Host 先显示权限设置，返回后可进入工具主视图；未改授权。
- Chrome 扩展详情实际显示 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`、加载来源 `~/文稿/workspace/opendesk-browser/dist/development`、已启用；产品「调试 → 本地开发服务」实际显示「开发服务已连接」，构建 revision `4c1ceebec4197ee8985891342e5df43aff6ee619d9c0259a1d3a5f3e7cd41780`。此指纹是本轮观测，不是所有并行宿主源码的测试证明。
- 「扩展 → AI VIP Share → 管理 → 查看详情」实际显示本机已安装/已启用、**v1.4.10**，固定包 SHA-256 `fc82aa89a42a59bdc05926e26803fc63d993178c302a35c12dccbcb42507d3ee`，与磁盘唯一正式包完整摘要一致。六项 capabilities 和正式包均未修改。
- 只读端口检查：watcher PID14632 仍监听 `127.0.0.1:43119/43120`，既有代理 PID43518 监听 `*:7897`；7898/7901/7902 无监听。未启动、停止或替换这些资源。原目标页已显示连接拒绝，不将旧页面或历史 Cookie 回执称为当前有效登录。

### 原生用户操作与观察

| 操作 | 预期 / 实际观察 | 结果与边界 |
| --- | --- | --- |
| 打开工具并等待初始化 | 初始化结束；恢复普通工作台 2，来源为 `127.0.0.1:7902`，来源凭据为空，当前会话「尚未取得会话」；会员「无法核验 / 会员信息暂不可用」，明确没有判为未激活或已到期；兑换输入与预检禁用 | 原生 UI PASS；离线不假报会员有效 |
| 滚动至代理与辅助入口，主动重新检测代理 | 下半部可达；当前没有自有运行代理，未出现可用 START；两个辅助入口分别提示外部网址未配置或未通过审核，原 9 个标签页未增加 | 原生 UI PASS；未开展流量转发或新 START |
| 普通站空凭据点击「获取授权会话」 | 明确提示「请输入此来源为你签发的有效凭据」；没有 Cookie 确认或开页 | 原生拒绝 UI PASS；本轮没有原生 RPC 计数器，零 RPC 由下方控制器边界回归分别证明 |
| 再点工作台 2 取消选择，再 Shift+Tab / Space 选择工作台 1 | 取消后两个站点均未选、来源归位、获取与开页禁用，站点 Cookie 区收起；键盘选择工作台 1 后来源正确变为 `localhost:7901`，出现本站两项旧成功写入事实，当前会话仍「尚未取得会话」 | 原生 UI PASS；历史事实只提示去目标页核验，不证明网站仍登录 |
| 填一次性未提交凭据草稿，点返回，再 Escape | 原 Host 提示未保存内容，默认焦点为取消；Escape 取消离开，草稿保留，焦点回到「返回扩展列表」 | 原生草稿与焦点 PASS；只使用本轮虚构测试文本，未向服务提交 |
| 再次返回，明确放弃上述测试草稿后重开；设置返回主视图 | 恢复工作台 1、正确来源及两项旧结果，凭据为空；会员仍明确无法核验、兑换仍暂停；未出现自动 Cookie 确认、开页或 START | 原生恢复 UI PASS；没有清 Cookie、journal 或旧 unknown；副作用计数见分离的 VM 证据 |
| 查看已安装详情 | 当前版本、来源及完整固定摘要与磁盘一致，已启用 | 原生安装身份只读核对 PASS；未安装/重装 |

**本轮未复现需要修改业务源码的核心缺陷。** 站点选择与两项历史 Cookie 结果可离线恢复；会员快照和兑换列表不是跨重开持久缓存，本轮重开离线显示「无法核验」，不编造上次 20 次额度或两条兑换记录。已有实例刷新失败时保留带「当前状态待核验」标记的历史会员事实，另由下方控制器检查覆盖。

### 新增行为覆盖与验证

新增 `tests/controller-offline.test.mjs`，复用原 `helpers/controller-fixture.mjs`。helper 仅增加可选的 `proxyDisable` SDK 回执故障注入，默认行为不变，不新增 Host/Provider 或真实监听端口。8 项覆盖：

1. 原控制器生成本站成功 journal 后，离线重开恢复偏好/两项结果、凭据为空、当前未取得会话；只有一次会员 GET，空凭据点击不增加来源请求，存储不变，无 Cookie/开页/代理 RPC。
2. 原控制器成功兑换后，同实例刷新会员失败：原账号/额度/历史事实不变且标记待核验，兑换与 START 禁用；即使触发对应 handler 也没有新增兑换或代理 RPC。
3. 服务离线、缺少 development profile、未选 Provider 三种条件 × STOP 已确认/丢回执两种结果：有 ownership 时 STOP 始终可达，仅一次 disable、零 enable；确认释放才显示「已停止」，丢回执保留 STOP，刷新仍不推断已释放或自动重试。

复核命令（仓库根目录）：

```bash
node --test examples/sidebar-tools/ai-vip-share/tests/controller-offline.test.mjs examples/sidebar-tools/ai-vip-share/tests/controller-native-regressions.test.mjs
```

**11/11 PASS，0 failed / skipped**：新增 8 项离线组合行为 + 原有 3 项 SDK 线路/可信取消焦点，后者用于核对 helper 默认路径未退化。这是 Node/VM + 原 fixture handler 的 RPC 边界证据，不能升级为原生离线 STOP、真实网络丢包或实时服务器计数。没有重复其他工具/全仓测试、Browser 构建或已通过的 HTTP 全组。

### 未测及现场保留

- 本轮原生开始时代理已停止，没有为制造离线 STOP 场景重新 START；**原生离线 STOP = NOT_TESTED**，由新增 VM 组合回归覆盖其安全逻辑。10 月 31 日的原生 START/重开/STOP 仍是原候选有效历史证据。
- 模拟服务未重启，原账本存活状态未知；本轮不查询新账本，不复用已消费 DEMO 码，不解除旧 `UNKNOWN_NOT_RECOVERED`。本轮原生兑换/来源/Cookie/代理 RPC 增量 **NOT_MEASURED**；可见 UI 无自动确认/开页，精确零副作用断言仅属于 VM 层。
- 到期/撤权后的目标页正向响应、服务重连、商业后端、支付/真实账号、代理转发与竞速、production/商店、全量矩阵和评分继续延期。原生浏览器交互与画面保留在本对话 Computer Use 记录；本轮未产生新的磁盘截图，历史证据目录不当作本轮截图。
- 最终保留工作台 1 偏好与原历史 journal，未保存来源凭据；原 Profile、固定扩展目录、watcher 与既有代理服务继续保留。共享宿主并行改动仅只读核查，本轮没有写入或提交。

## 当前目标与关键测试条件（2026-10-31）

**目标：完善 AI VIP Share 的核心 UI 与功能，在原 Chrome 扩展入口和自有模拟服务中完成两站快速登录、授权与取消、网站撤权失效、关闭重开恢复，并验证原有本地会员兑换和受控代理配置启停。真实操作可用、关键副作用可核对、失败与未验证状态准确，才算本轮完成。** 普通网站登录不以会员、兑换或代理为前置。本文是本轮条件与证据的维护入口；[ROADMAP](../../ROADMAP.zh-CN.md#2-主要用户流程与界面)继续负责产品方案，不另建产品架构或恢复其历史总目标。

本对话 `01a191aa-c8d2-77f0-81fd-04c168cbeb43` 已按用户本次明确请求建立原生目标，正文与本节范围一致，未设置 token 预算。创建时读回为 active；下表是后续实际执行结果，目标最终生命周期以本对话工具读回为准。没有改变其他对话生命周期。

### 运行前提与证据规则

- 从真实「扩展 → AI VIP Share」操作，保留原 Profile、扩展 ID、安装数据及已批准来源；使用原 `dist/development` 与可用 watcher，不覆盖并行产物。每轮开始核对实际连接、包版本/完整摘要及受影响宿主修订；20:04 的状态只是上次观察。
- 建立目标时基线为 1.4.8、122995 字节、SHA-256 `4a96ffbe5b308a2022e192b5abdd4a8cedec98e974a7e774ad777d5dbca34bd2`；当前为 **1.4.10、123474 字节、SHA-256 `fc82aa89a42a59bdc05926e26803fc63d993178c302a35c12dccbcb42507d3ee`**。未改变的行为复用有效证据；工具或相关宿主输入变化时，只复验受影响操作。新包已经原候选验证、同源晋升、独立来源审阅及安装审阅链，未放宽权限。
- 每项记录 `PASS / FAIL / NOT_TESTED / BLOCKED`，附实际步骤、预期/观察、测试层级、工具包与受影响宿主身份、非秘密请求增量或状态证据。历史其他候选不能直接登记为当前 PASS；未接入状态 UI 通过也不能代替已接入功能通过。
- UI 在正常窗口、默认缩放下操作，确认可见性、滚动、键盘、取消、返回和焦点；不开展宽度/缩放矩阵。真实业务、网站及 Chrome ownership 结果必须来自原生操作；难以安全复现的存储/晚响应/partial/unknown 保护用现有定向回归证明，明确标注 Node/VM/HTTP，不能冒称原生。

### 必须满足的关键条件

下表更新至 **21:01**。PASS 仅指本轮约定的核心范围；真实 Chrome、Node/VM 与 HTTP 分开登记。最新操作见下一节，较早操作见 20:04、19:43 记录；更早候选证据见 [README](../../README.zh-CN.md#148-界面与此前交付记录2026-10-31-历史)。

| ID | 用户操作与通过条件 | 关键证据 | 当前结果 |
| --- | --- | --- | --- |
| UI-01 | 从扩展列表打开，主操作、结果和辅助服务可达；滚动不遮挡操作，设置返回恢复原页面与选择，键盘可选站和到达操作，取消后焦点回到触发处 | 原生步骤与界面；无阻止本流程的空白、遮挡、焦点陷阱或未结束加载 | PASS：1.4.8 打开/滚动/设置返回/键盘；1.4.10 重新打开及设置返回，21:00 可信取消后焦点回到原按钮，Tab 可继续；另有焦点定向 VM |
| UI-02 | 站点单选且来源对应；再次点击取消后主操作禁用；切站清除旧凭据/未提交意图，不混入另一站错误或成功结果 | 原生选中状态、来源、字段与请求增量；迟到响应保护的受影响定向测试 | 已 PASS（20:04）；迟到保护沿用有效定向证据 |
| F-01 | 第一站 `localhost:7901` 与第二站 `127.0.0.1:7902` 分别由有效来源授权取得会话，经原精确批次确认后两项核验，正确目标页显示脱敏账号、有效模拟 VIP、等级与到期；普通来源不请求会员/兑换/代理 | 两站原生操作各绑定实际候选、可信确认、逐项结果及服务端页面；现版只复验受影响操作并说明复用依据；每个明确意图仅一次交付提交 | PASS：1.4.8 第一站 19:39、第二站 20:16；1.4.9 修复普通站兑换后误取会员网站会话，原生恢复与两站 VM 验证；1.4.10 普通站来源/获取/取消复验。未重跑未变的两站正向写入 |
| F-02 | 空/无效来源凭据明确拒绝；缺精确网站授权或在可信批次派发前取消时无 Cookie 派发，取消后仍可合法重新操作；已派发后的关闭/超时不得被归为零写入 | 原生错误/可信取消及相关可信派发或事务证据；来源 POST 数不能单独证明 Cookie 零写入 | PASS：1.4.8 空/无效凭据与第二站取消后明确重新操作成功；1.4.9 缺当前版本授权被拒绝，1.4.10 原可信取消与焦点 PASS。零派发由可信专有码及 Host 定向测试证明，不凭目标页或来源计数推断 |
| F-03 | 写前授权已撤销/交付过期时拒绝新写入；站点端撤权或会话失效后目标页不显示有效 VIP/账号；Cookie 回读成功不冒称网页登录仍有效 | 原生撤权后目标页；相关来源/过期/身份 HTTP 与控制器定向证据 | 网站端撤权 PASS（19:40，20:04仍失效）；其他条件保留已有层级，不要求整组原生故障注入 |
| F-04 | 成功、partial/unknown、回执缺失及写前持久化失败分别保留事实；重复点击、切站、关闭/重开、权限或安装代际变化不重放、不跨站、不释放旧未知锁；日志与持久记录不保存秘密 | 原生成功重开前后请求不变；现有 journal/控制器/Host 定向检查覆盖其余实际受影响保护 | PASS（分层）：1.4.8 两站成功重开；1.4.9 兑换 unknown 重开未提交；1.4.10 原位升级保留选择/历史且凭据为空。Cookie journal、旧版恢复、晚响应/跨站保护为 Node/VM；旧 unknown 为 UNKNOWN_NOT_RECOVERED |
| F-05 | 原本地模拟服务连接后，会员、额度、到期和历史与服务端一致；空/非法码不消费，Enter 只预检，取消零消费；明确确认后同码重复操作不重复授予权益，重开不重提；结果未知只查询原事务 | 原生查询→预检→取消→确认→结果/重开与服务端消费计数；恢复按可复用原生记录和现有定向保护分别登记 | PASS：本轮同一 7898 账本，1.4.8 非法/Enter/取消/双击确认/重复码；1.4.9 丢回执→重开→只查原事务；最终兑换 POST 2、账本 2、历史 2。1.4.10 升级后保持 20 次/2 条，21:01 提交数仍 2 |
| F-06 | 在原批准固定范围内经原可信确认 START，界面与 Chrome 回读均为本安装持有；重开不额外 START；STOP 后 Chrome 确认已释放。Provider 缺失/权益失效时仍可停自有代理，冲突不覆盖他人，未知时不虚报停止 | 原生 START/重开/STOP 与 Chrome ownership 回读；晚 START、离线 STOP 等复用受影响定向检查 | PASS：1.4.10 20:58 START→重开仍已启用→20:59 STOP 后 Chrome 确认释放；未再点 START。没有独立原生 RPC 计数；不重放和异常 STOP 另有 VM/Host 证据。实际转发 NOT_TESTED |
| UI-03 | 会员/兑换/代理未接入或错误时准确提示并禁用无效动作，不伪造失效/开通；商品和客户端入口只打开各自获审固定目标，未配置时明确提示且不导航，不阻塞登录或 STOP | 原生禁用/错误状态、实际点击与导航增量；仅固定合法地址，不输入真实付款/账号 | PASS：1.4.8 未配置 UI、20:27 两辅助入口分别提示未配置且标签页数仍 11；1.4.9 unknown 只提供原事务核对。相关入口源码未变；实际商业目标未配置，未测试商业导航 |

### 执行顺序、完成判定与延期

1. 复用已通过第一站和 20:04 UI 证据；先检查下一条尚未完成操作：第二站来源是否可用、本站原授权是否齐全。只运行能区分该阻塞的诊断，不先做全量测试或构建。
2. 完成第二站最短原生链及可信派发前取消/返回焦点；保留同一第一站服务账本。不得通过重装、换 Profile、清 journal/Cookie、重启清账或改 Origin 消除未知记录。确实缺授权/外部配置时保留具体阻塞，其他安全独立项继续。
3. 复用原 `dev/local-test/local-fixture-server.mjs` 与工具本地连接入口核对会员/兑换，随后核对原固定范围的代理配置 START/STOP 和辅助入口。保留各 owner 服务，不把代理转发研究、商业接入当成本地配置启停的前置。
4. 发现真实产品失败才在本工具 owner 内最小修复；先复现并锁定实际缺口，再验证该操作和直接受影响保护。沿用 `src/App.jsx` / `src/main.js`、原公开 SDK、Host/Authority；无已证实通用缺口不写共享平台。定位入口和既有定向测试见 [README 执行顺序](../../README.zh-CN.md#执行顺序证据与完成判定)及 [ROADMAP 核心测试](../../ROADMAP.zh-CN.md#7-核心测试条件)。

**完成门槛：** 上表适用条件全部有可复核证据，必需的两站原生登录、取消、恢复、本地兑换及代理配置启停不得以未配置 UI 或 Node 成功替代；无未处理的阻止核心操作的 UI/功能故障，也无重复消费、越权写入、未知重放或停止失败。现有有效证据可复用，变更只复验相关项。任一必需项仍 FAIL / NOT_TESTED / BLOCKED，目标就保持未完成；按原生目标工具合同报告状态，不为收尾降标或伪报完成。

**明确延期：** 真实商业后端/付费账号/支付、首个第三方网站接入、代理转发流量与竞速研究、production/商店发布、全量原生故障矩阵、跨浏览器与宽度/缩放矩阵、95+ 评分、旧 unknown 的无法证明恢复。模拟环境不需要用户提供真实账号、Cookie 或付费代理。旧备份和未知事实继续保留；不暂停或完成其他对话目标。

## 2026-10-31 21:01 核心 UI 与功能结果

### 实际安装、修复与复用边界

当前唯一正式包为 **1.4.10 / 123474 字节 / SHA-256 `fc82aa89a42a59bdc05926e26803fc63d993178c302a35c12dccbcb42507d3ee`**。从临时候选经相关检查、独立来源审阅、原打包器 `--promote-from` 及 `--check-project` 同源晋升；原安装器显示 1.4.9 → 1.4.10、权限不变、保留数据，经“确认更新”成功。六项能力仍为 storage.local、network、browser.tabs、browser.proxy.managed、browser.cookies.write、currentPage.read。

仍是持续开发环境、原 `AI VIP Core 20261030` Profile、扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`、原 `dist/development`。21:01 原调试页显示“开发服务已连接”，revision `f9296a458451e5a595e1f2010a89412a415796c905788b665af2442d3e961e1f`；磁盘 SW 含当前精确候选 pin。复用 PID40281 的 watcher，未运行第二个 Browser build、未停止其他服务。该修订含并行开发输入，不宣称这些输入均由本任务审阅或覆盖。

本轮只修复三个实际功能问题及升级恢复：

- 普通网站已选时，会员兑换/恢复曾自动获取 `127.0.0.1:7898` 的会员网站会话。原 Cookie 槽位保护阻止了错误写入，但该自动获取本身不符合普通站独立合同。现在普通选择不展示/调用会员会话入口；明确选择会员网站并主动获取仍保留。1.4.9 原生未知兑换恢复与两站控制器回归均未再跨站。
- 1.4.9 原可信 Cookie 确认中按 Enter 取消后焦点落在 iframe body。1.4.10 仅在可信零派发、journal 已结清、原触发按钮仍可用且用户未改选焦点时返回按钮，不触碰 unknown 或重试。21:00 同一 7902 原授权刷新后，再取有效会话→两枚可信批次确认→Enter 取消，原生焦点为“按钮 设置并打开网站”；随后 Tab 到兑换记录，界面明确未提交、未重试。之后只清除未提交草稿及内存凭据，未清 Cookie/journal。
- 原 SDK 开发线路返回已排序的七个域，工具重建为另一顺序，可信已记住线路与 START 配置比较失败。现在校验原固定端点/域集合后直接保留 SDK 返回顺序，不扩权。1.4.10 原生“允许并记住此线路”后显示已启用；重开仍已启用，STOP 后显示“已停止 / Chrome 已确认当前安装的代理已释放”。Chrome 结果来自原 getStatus 对控制权、安装 owner 和 PAC 的回读，不是模拟回执。未发送代理流量。
- 升版同时允许 1.4.8 / 1.4.9 的原兑换恢复记录继续只查原事务；Node/VM 验证原 accountId / idempotencyKey 不变、重开 POST 为零、查询不明时保留锁。没有改原 Cookie journal 或解锁封存旧 unknown。

公开代理宿主对不同域数组顺序的通用比较问题仍属于并行平台范围；本工具已经复用 SDK 给出的精确合法线路，不声称替所有消费者修复该通用问题。未修改他人 `context-menus.js`、`browser-managed-proxy.js`、SDK contract 或侧栏授权实现；平台改动仅是独立审阅后当前工具的开发来源 pin 及其对应测试，固定范围和生产禁用不变。

### 两站、兑换和辅助入口的本轮原生事实

| 操作 | 实际结果与计数边界 |
| --- | --- |
| 1.4.8 第二站先取消再明确登录 | 20:14:51 原可信两枚 Cookie 确认取消，未提交；20:16:42 新的明确获取、20:16:58 确认后两项已写入并核验，正确目标 `127.0.0.1:7902/session/` 显示 `o***@fixture.test / 有效 / 本地体验 VIP`，生效 20:16:42、到期 21:12:48；重开保留选择/成功事实，凭据为空。21:01 页面仍经服务端核验有效。本服务 stdin 已关闭，未取得实时 POST 计数，不虚报该计数 |
| 第一站正向与撤权 | 复用 19:39、19:40、20:04 的同一 1.4.8 真实操作与 owner 计数，详见下节。来源凭据已由 owner 移除，未恢复凭据或重启账本来重测；两站成功事实不冒称 1.4.10 新写入。站点获取/校验/写入实现未改，受影响的取消和选择隔离另作复验 |
| 1.4.8 7898 连接、兑换与取消 | 20:18 非法码拒绝；DEMO-VIP-01 的 Enter 只预检、Escape 取消后焦点回输入框；重新预检并双击明确确认，20:20 仅 1 次兑换、1 条账本。再用同码预检被拒。20:28 owner 计数 member GET 4、preview POST 4、redeem POST 1、status POST 1；最后一项是当时自动取会员会话产生的旧请求，不能冒称恢复查询 |
| 1.4.9 丢兑换回执后恢复 | 同一服务对 DEMO-VIP-02 仅丢下一次提交回执；20:44:00 服务已消费，redeem POST 由 1→2，账本由 1→2，工具显示未知且只能核对上次。关闭重开后 redeem 仍 2，status 仍 1；明确点击“核对上次兑换”后 status 由 1→2，恢复为 2 条历史/20 次额度，普通站 2 仍选中且未取得会员网站会话。无自动重提或跨站 Cookie 写入 |
| 1.4.10 更新/代理重开后的账本 | 21:01:30 owner 只读观察 member GET 16、preview POST 5、redeem POST 2、status POST 2，账本 2 且均 redeemed、leases 0。与 20:44 恢复后相比没有新增兑换或 status POST；界面仍为 20 次/2 条。GET 增量不冒称额外消费 |
| 1.4.8 辅助按钮 | 20:27 分别点击“查看更多商品”“了解桌面客户端”，显示各自未配置提示，标签页数前后均 11，没有导航；未阻止普通站、会员和 STOP。相关源码在 1.4.10 未改，复用该证据；商业目标仍 NOT_TESTED |

本机非秘密请求观察仍在忽略目录 `artifacts/ai-vip-share-native-20261031-authorized/`；会员计数为 `member-observations.json`，第一站为 `observations.json`。第二站 `second-site-observations.json` 只有启动时观察，不能替代实时计数。当前服务分别为第一站 exec 78320、第二站 49058、会员 39036；全部保留原账本，未重启清账。1.4.8 旧 unknown 的受限封存备份仍保留为 **UNKNOWN_NOT_RECOVERED**，不是本次新成功的事务。

### 定向验证与交付边界

实际失败先经控制器回归复现：线路数组不一致、取消焦点未返回均先 RED，最小修复后 GREEN；普通站兑换混入会员会话和旧版恢复也有用户行为回归。1.4.10 已执行并通过以下相关检查，不用全仓统计代替原生结果：

- 工具控制器：`controller-native-regressions`、`controller-member-site-context`、`controller-recovery-upgrade`、`controller-site-restore`；覆盖精确线路、取消返回/不抢焦点、两站不跨会员会话、1.4.8/1.4.9 原事务恢复及现有切站/晚响应/槽位保护。
- 实际控制器 + HTTP：`controller-member-http.integration`；原本地开发与 Cookie 控制器 `tests/environment/ai-vip-share-local-development.test.mjs`；并保留原页面 54 项 HTTP 来源/失效证据，输入未变不重跑整组。
- 会员/包/界面契约：`ai-vip-share-r51-member`、`ai-vip-share-r5-ui`、`ai-vip-share-ui-parity`、`browser-managed-proxy-development`，晋升后合并执行 50 项 PASS；通用 Sidebar 包检查 8 项 PASS。
- 直接受影响安全保护：`ai-vip-share-r59-proxy-ui` 与工具 `cookie-journal`，21:01 合并 31 项 PASS，覆盖 Provider 缺失/到期仍可 STOP、在途 START/晚响应/未知释放不虚报、可信未派发才结清、partial/unknown 保留和端口非隔离。它们是 Node/VM，不冒称原生故障注入。
- 本工具 Vite 构建、原打包器候选/晋升/同源核对均通过；独立限定来源审阅批准精确 1.4.10 候选，未发现 P0/P1。审阅不替代上述原生证据。Browser production 构建和全仓 CI 未执行。

核心条件满足后仅交付本工具源码、定向测试、唯一正式 JSON、来源 pin 和本文证据；不推进延期商业接入、代理实际访问、production、评分或旧 unknown 恢复。并行宿主可能仍持续更新，本报告绑定上述观察时身份，不保证后续无关修订自动继承测试结论。

## 2026-10-31 20:04 关键 UI 与功能补测

用户追问“有完成关键测试吗？关键是 UI 和功能性测试”后，在同一真实 Chrome for Testing、同一 Profile、同一扩展 ID 与 1.4.8 工具中逐项操作，未使用预览回执替代真实产品。下表区分本次补测和 19:43 已记录的正向链；本次没有重新授权、兑换、写 Cookie 或重置实验。

| 用户实际操作 | 可见结果 | 证据 / 状态 |
| --- | --- | --- |
| 查看工具主页并滚动 | 站点按钮、来源、凭据、主要操作与写入结果可见，正常窗口下未观察到遮挡操作的重叠或截断 | 本次真实 UI PASS；对话内已展示原生截图，不含宽度/缩放专项 |
| 普通工作台 1 → 2 | 只有站点 2 选中，来源切为 `127.0.0.1:7902`，凭据为空，站点 1 的错误与写入结果不混入站点 2 | 本次真实 UI PASS；未获取第二站会话，不表示第二站登录通过 |
| 再次点击站点 2 取消选择 | 两站均未选中，凭据表单收起，“获取授权会话”和“打开网站”禁用 | 本次真实 UI PASS |
| Shift+Tab / Return 选择站点 1 | 可用键盘恢复站点 1，选中状态、来源与对应成功记录一致 | 本次真实 UI PASS；仅覆盖该实际键盘路径 |
| 空凭据点击获取 | 显示“请输入此来源为你签发的有效凭据。”，没有进入待写入状态 | 本次真实功能 PASS |
| 输入明确未签发的测试凭据后获取 | 显示“来源授权或交付无效，未设置 Cookie。请重新取得有效凭据。”，没有出现可提交会话 | 本次真实功能 PASS；来源授权 GET 由 2 增至 3，交付 POST 仍为 1 |
| 清除凭据 | 字段清空，错误恢复为普通来源说明 | 本次真实 UI PASS；未使用真实账号凭据 |
| 工具设置 → 返回 | 显示当前精确网站已授权；返回后标题恢复 AI VIP Share，设置区消失，站点和写入结果保留 | 本次真实 UI PASS；未改变授权或启用状态 |
| 关闭侧栏 / 重开工具、切换产品 Tab 后重开 | 保留站点 1 和两项已写入结果，凭据为空，当前没有待提交会话 | 本次真实 UI / 功能 PASS；来源授权 GET 仍为 3、交付 POST 仍为 1 |
| 点击“打开网站” | 新建一个所选 `localhost:7901/session/` 标签页，仍显示“授权已撤销或失效”；关闭该新标签后回到原现场 | 本次真实功能 PASS；沿已批准入口直接开页，本次没有出现确认框，不能记为“开页确认取消通过” |
| 查看会员、兑换、代理未接入状态 | 明确显示服务未配置，激活码与预检禁用，代理提示暂不能启用 | 本次未接入状态 UI PASS；会员兑换与代理启停不属于本次新鲜功能 PASS |
| 获取有效会话 → 两项可信 Cookie 确认 → 设置并打开 | 服务端显示脱敏账号、有效模拟 VIP、等级、生效与到期时间 | 复用下节 19:39 真实正向链 PASS，本次未重复写入 |
| 同一服务端撤权 → 页面自动核验 | 19:40 撤权后页面显示失效并隐藏账号，20:04 仍为失效状态 | 复用下节撤权操作并新鲜观察页面 PASS |

20:02:12 与 20:04:13 两次直接读取同一 fixture owner 的非秘密计数，来源授权 GET 均为 **3**、会话 POST 均为 **1**；有效目标访问数仍为 38，目标页面 GET 因只读自动核验继续增加。结合补测前授权 GET 为 2，只新增了一次无效凭据授权查询，没有新会话交付。原始计数保存在本机忽略目录 `artifacts/ai-vip-share-native-20261031-authorized/observations.json`，不是提交的新测试服务器或替代安装器。

**纠正一项早期判断：** 本次先把设置与工具同屏误判为 UI 缺陷。定位后确认原共享宿主对 Cookie 工具明确采用 `trustedInline`，让可信授权控件显示在活沙箱上方；返回后设置区确实消失。没有证据支持修改共享宿主，故未为此改平台或工具源码，也没有把源码意图替代上述真实返回验证。

**当前运行环境已变化：** 20:04 原「调试 → 本地开发服务」实读为“开发服务已连接”，扩展 ID 仍为 `ccfcjegpkdlgbclopjmadlcjedelidmf`，构建 revision 为 `d5c5c1b65e93cf4a0b07acc0bfc19aea5019bcedbf12ac58cd5f54c767235de0`；43119/43120 由已有 PID40281 监听。本次没有启动、停止或覆盖该 writer，继续使用原 `dist/development`。下节 19:43 的 serve 断开与体积门禁是当时观察，不再是当前运行状态；此轮属于持续开发证据，仍非 production。工具正式包摘要未变。

本次只补真实 UI / 功能操作与说明，没有源码变更，未以重跑 Node/全仓测试或重新构建代替用户操作。**网站登录核心链及上表 UI 已有真实证据；整款工具所有功能并未完成当前环境复验。** 商业会员、兑换、代理真实接入与流量、第二站新实验及完整原生矩阵仍未完成；此前候选的会员 / 代理证据仍按 README 历史版本保留，旧 unknown 仍未恢复。

## 2026-10-31 19:43 新实验真实扩展链已通过

用户在下方具体处置方案展示后回复“需要我什么配置，需要你继续完善，知道完成。你有权继续推进”，本轮据此执行该已展示范围。不需要真实账号、Cookie、付费会员或代理配置。**这是封存后的新实验，不是旧 unknown 的恢复。** 下方 19:17 及更早的 BLOCKED、服务与待授权说明均为历史观察。

### 封存与安装身份

- 先从原可信扩展页面只读备份本工具完整 namespace、已安装包、安装代际及其他工具的 ID/版本；未直接修改 Chrome Storage。受限备份为 `/Users/shopme/.codex/backups/ai-vip-share-20261031-current-profile/ai-vip-share-sealed-backup-20261031.json`，129,825 字节，SHA-256 `266b7e70e47aa2c44eadadb06a6a3c698f9d06976f1e7716b64e50833508294a`，目录 0700 / 文件 0600，不提交原始数据。
- 备份的四个键为 `aiVipCookieDeliveryR137`、`aiVipLocalDevelopmentR136`、`aiVipRedeemR52`、`aiVipSiteSelectionR1`；原 journal schema 2，四次状态为 success / success / success / unknown，最后一条仍 pending。原 journal validator 与已安装包 validator/hash 离线核对通过。
- 备份核对后，经原管理界面卸载“AI VIP Share 及其本地数据”，界面确认清理成功；其余四个工具保留。再从本项目唯一正式 JSON 经原导入审阅链安装同 ID 1.4.8，界面确认无需二次启用。没有删除网站 Cookie，也未操作其他 Profile 的 1.4.3 unknown。
- 重装后只读核对已安装完整包为 122,995 字节，SHA-256 `4a96ffbe5b308a2022e192b5abdd4a8cedec98e974a7e774ad777d5dbca34bd2`，与磁盘正式包相同，六项能力不变。旧代际 `d9b432eb-94ff-47fc-aa84-08f31dbaf45b`，新代际 `a1b76f70-f00c-4666-bbab-a815d24094f2`，不得混称原事务解锁。

### 实际操作与可见结果

| 本轮原生操作 | 观察结果与证据边界 |
| --- | --- |
| 原浏览器与扩展 | Google Chrome for Testing / `AI VIP Core 20261030`，ID `ccfcjegpkdlgbclopjmadlcjedelidmf`；`chrome://extensions` 再次显示加载本仓库 `dist/development`，未更换 Profile、ID、来源或包 pin |
| 原批准站点 | 仅运行 `http://localhost:7901` 的当前 ordinary factory。原服务和 dev writer 在本轮操作前已不在监听，并非本轮主动终止；原内存账本没有恢复。未重启 7898、7902，也未触碰 58251 或其他项目服务 |
| 写入前页面 | 原浏览器打开 `http://localhost:7901/session/` 显示“未登录”“模拟 VIP：未验证 / 不可用”，没有账号；页面未替工具设置 Cookie |
| 精确网站授权 | 原工具设置显示 `http://localhost:7901 · 未授权`，经原“授权访问”后显示已授权；先完成该授权，再获取和写入会话。没有全站授权 |
| 获取与写前复核 | 原工具选择“普通工作台 1”，在安全凭据字段输入本机临时测试凭据，点击“获取授权会话”；显示 `o***@fixture.test` 及有效交付。普通站独立于会员、额度和代理；未点击“连接本地开发”，未启动会员服务 |
| 可信批次确认 | 点击“设置并打开网站”，原可信提示明确为 `http://localhost:7901`、两条 Cookie、当前已授权 Store/Partition、不可自动重试；确认后两项均显示“已写入并核验”，随后通过原单次开页确认 |
| 新打开的目标页 | 19:39:11 北京时间观察：“受控会话有效”，脱敏账号 `o***@fixture.test`，模拟 VIP“有效”，等级“本地体验 VIP”，生效 `2026-10-31 19:38:09`，到期 `2026-10-31 20:35:37`（北京时间）。已在本对话显示真实原生截图；不是 HTTP 手工 Cookie、预览或 58251 页面 |
| 退出并重开工具 | 保留“普通工作台 1”选择和两项成功结果，安全凭据为空，无待提交会话。重开前后来源授权 GET 均为 2、会话 POST 均为 1；之后只读安装核对也只有一条 count 2 / success / receipt 的 journal。没有再次确认或派发 Cookie，也没有启用代理 |
| 服务端撤权 | 19:40:32 在同一 fixture owner 调用原 `revoke('ordinary-subject')`，返回 true；19:40:36 原页面自动显示“授权已撤销或失效”“模拟 VIP：未验证 / 不可用”，不再展示账号或等级。没有清 Cookie、重新授权、重放或创建第二次交付；19:43:47 仍为失效状态 |

新实验资源为忽略目录 `artifacts/ai-vip-share-native-20261031-authorized/` 的临时 owner harness 与非秘密计数，终端 session 78320（不保证跨对话可控）；仅复用现有 factory 的 in-process 授权/撤权/观察，没有新增 HTTP 管理接口。临时凭据未写入工具存储或日志；私有中转文件已删除，字段已清空，剪贴板已替换为普通站 URL。服务暂保留撤权后的现场，打开[当前目标页](http://localhost:7901/session/)应看到失效状态；不能把本次成功截图理解为撤权后仍有效。

### 验证范围与剩余限制

本轮只改变测试运行状态与这两份说明，工具源码、正式包和三个页面实现模块均未改。真实正向链、未登录页面、撤权失效、重开不重放及安装身份已新鲜核对；缺失单枚、混配、重复、到期、授权换代及共享账号分配失效复用下方原 54 项 HTTP 证据，**没有宣称本轮全部原生矩阵通过**。文档只核对差异、链接与证据一致性，不重跑输入未变的测试，不重打工具包。

运行环境在服务退出后已变为**保留的静态开发产物 / serve 未连接**，不是 production 验收，也不是新静态构建。为恢复原持续开发入口仅尝试一次 `npm run dev`，在 `scripts/build-cookie-editor-react.mjs:30` 遇到并行 Cookie Editor 的 `Cookie React exceeds installer budget`，未进入 WXT 启动。该任务并未修改 Cookie Editor 源码、预算或绕过门禁，也未再构建、强制扩展重载；保留的原宿主实际完成了上述链。持续开发服务恢复由该并行构建问题解决后再执行，不阻塞本轮已观察到的核心结果。

**本轮核心完成：新实验原生链 PASS。** 旧 unknown 为 `UNKNOWN_NOT_RECOVERED`，备份保留；第二站新实验、商业服务、production、全量原生矩阵、评分、缩放/宽度和代理流量研究均未执行，不自动进入下一阶段。

## 2026-10-31 19:17 接收核对与待决定的处置

接收对话 `01a191aa-c8d2-77f0-81fd-04c168cbeb43` 先实读原生 goal 为 null，随后建立本文件所述核心目标，无 token 预算。目标仍为 **active / 未完成**；下面的原生观察不满足登录完成条件，也没有暂停、迁移或完成其他对话的目标。

### 实际入口、复用与本轮证据

这是原沙箱 Sidebar Tool 的既有登录链，业务 owner、`src/main.js` / `src/App.jsx`、唯一 1.4.8 包和原 `OpenDeskTool` / Browser SDK / Host / Authority 全部复用，不另建项目或运行器。本轮没有发现可自主实施、能解除下面两个阻塞的新源码修复。

| 只读核对 | 2026-10-31 19:17 北京时间观察与限制 |
| --- | --- |
| Git / 写入范围 | 开始时 main HEAD `f1fbb9cad`；本工具与 `tests/environment/sidebar-tools-host.test.mjs` 无未提交改动，索引为空。共享平台及其他项目仍有大量并行修改，本轮仅维护本 MD 和工具 README |
| 原 Profile / 扩展 | `/Applications/Google Chrome.app` 实际窗口为 Google Chrome for Testing / `AI VIP Core 20261030`。`chrome://extensions` 显示启用 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`，加载本仓库 `dist/development` |
| 持续开发 | 原侧栏「调试 → 本地开发服务」显示已连接；当前完整 revision `311299080ee88a5b063d6bf101048e2dc2f0bd4379c1d5e7dda68efbd5f68424`。没有强制重载或重装；这不是 production 候选 |
| 原产品操作 | 「扩展 → AI VIP Share」打开原 1.4.8。普通工作台 2 已选择，来源凭据为空，「获取授权会话」禁用；可见“恢复记录仍需核对”与“Cookie 操作结果未知或恢复记录未确认；已禁止重放”。设置只列出 `http://localhost:7901` 的 Cookie 网站授权。未获取新会话、未点击批次写入、未补网站授权 |
| 包身份 | 磁盘唯一正式包 SHA-256 重新核对仍为 `4a96ffbe5b308a2022e192b5abdd4a8cedec98e974a7e774ad777d5dbca34bd2`；版本 1.4.8、六项能力未变。UI 观察到 1.4.8；本轮未通过非公开存储读取已安装完整字节，不把磁盘摘要冒充新的安装核验 |
| 服务 | 只读 lsof 仍见 dev writer PID11774 /43119、43120；会员 PID92522 /127.0.0.1:7898；普通站 PID93579 /[::1]:7901、127.0.0.1:7902；展示页 PID35117 /[::1]:58251。全部保留，未读进程参数或终端秘密 |

当前 UI 足以确认写入屏障。未新增会话 POST 或 Cookie 写入调用；本轮没有读取运行中闭包的服务计数，因此不报告新的计数值或“所有网络请求为零”。1.4.3 unknown 仍仅有历史证据，本轮未操作它所在的其他 Profile。

最小源码核对复用上轮关于静态导入与无热升级入口的结论，不重复搜索未来控制面：原 journal 的 `planCookieReceipt` 只接受原精确批次的回执或当次明确未派发事实；`planCookieAttempt` 对任何 unknown/partial 保留全局屏障。普通站 factory 的授权、交付和请求账本在闭包内，`close()` 会清空；没有导出/导入或 renderer 升级合同。会员 factory 暴露给原进程 owner 的对象也不能由新进程访问。新 SDK 错误码不能反证任何旧批次。

### 具体处置方案（尚未授权，尚未执行）

当前只有两个依赖，均无已证实的自主路径：**旧 Cookie 事务无可验证终态；旧普通站进程无保账本页面升级入口。** 在现有安全合同内继续补权、切站、请求新会话或重启都会绕过已知限制，故受影响副作用分支停止。下面是可供用户决定的“封存旧实验、重新开展原生测试”方案，**不是旧事务恢复方案**。

| 涉及对象 | 拟执行动作及严格范围 | 风险 / 恢复限制 |
| --- | --- | --- |
| 本 Profile 的 `ai-vip-share` 安装数据 | 先用原安装存储的合法只读路径取得本工具非秘密 journal、完整键归属、安装代际与摘要，保存可核对的受限备份和非秘密说明；核对备份前不删除。再经原管理界面的「卸载 AI VIP Share 及其本地数据」和原包审阅链，在同一 Profile 重装同 ID、同 1.4.8 包。此动作须单独得到明确批准 | 当前 `aiVipCookieDeliveryR137` 的旧 unknown 保留在封存证据中，不能改成 failed / not-submitted / success。重装将产生新的安装代际，不能称为原事务解锁或恢复；本工具网站授权、偏好、恢复记录等本地数据会失去原在用状态。当前无已验证的一键备份/还原入口，不能承诺恢复原安装代际；若无法安全取得备份与归属，先停在该步，不删除 |
| 普通站 PID93579、7901/7902 | 备份与批准到位后，仅正常停止本任务的该进程；按现有 factory 在原两个固定 Origin 启动当前源码。该进程同时持有两站，不能把重启描述成只影响 7901；不修改固定来源或精确包 pin | 两站内存授权、交付和请求账本均会丢失，现有授权凭据与旧 Cookie 不再被新服务认可。没有已实现导出/导入，已有非秘密记录不能恢复这些账本。新授权与新交付明确属于新实验，不证明旧 unknown 的结果 |
| 旧 1.4.3 unknown、7898 会员服务、其他资源 | 不处置其他 Profile 的旧 unknown；保留 PID92522 的会员/兑换账本、PID35117 展示页、dev writer、代理和其他项目服务；不删除任何浏览器 Cookie，不用 Cookie Editor 清理数据 | 本轮只争取 `localhost:7901/session/` 的新实验链；7898 与 7902 的同主机 Cookie 槽位冲突保护继续生效。若原管理链发现额外共享影响或 unknown 仍存在，不扩大清理范围 |
| 新实验的真实验证 | 正式重装后经原可信权限审阅，仅对原批准的普通工作台 1 发起新授权会话、写前复核及两枚 Cookie 确认；查看服务端脱敏身份、VIP 等级和期限，再核对本次实际影响的失效保护与重开不重放 | 安装权限必须重新按原链确认，不继承已失效授权。新页面完整链尚未执行；仅成功后记为“新实验原生链 PASS”，旧实验仍为 unknown / 未恢复。失败后保留现场，不重复重置 |

**用户待决定的具体动作：是否接受旧普通站内存账本不可恢复，允许在保留旧 unknown 证据后，对本 Profile 的本工具做上述备份门禁下的卸载重装，并重启同时承载 7901/7902 的 PID93579，开展明确标记的新实验。** 未明确批准前维持原现场，不把“继续完善”解释成该处置授权。不要求用户手工安装、运行测试或提供秘密。

本轮仅增加现场与处置文档，故只核对差异、相对链接、事实和格式；不重跑输入未变的 54 项 HTTP、Host/journal 检查，不构建 Browser 或重打包。上轮有效证据继续保留；新 VIP 页真实扩展链仍为 **BLOCKED / NOT_TESTED**，原生 goal 仍 active，等待该具体决定。

## 2026-10-31 19:11 上轮续接结果

**新 VIP 页经原扩展写入仍为 BLOCKED / NOT_TESTED。** 本轮从既有 `AI VIP Core 20261030` Profile 的「扩展 → AI VIP Share」重开原工具，确认已安装 1.4.8，普通工作台 2 已选择、来源凭据为空、获取会话被禁用，仍显示恢复记录未确认和 Cookie unknown 禁止重放。没有请求新会话或派发 Cookie；打开工具触发的会员 GET 可信确认已取消。

这是持续开发环境：`chrome://extensions` 确认 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`，加载本仓库 `dist/development`；调试 → 本地开发服务显示已连接，观察时 revision 为 `55f7998525a10032a6b4c0a052d0bcd47f78bb7abcd2a9f72d3000273e2feeb5`。未重载或重装扩展、未改变安装身份或授权。7898/PID92522、7901+7902/PID93579、58251/PID35117 与唯一 dev writer/PID11774 仍在监听，全部保留。

**已完成的独立修复：新 Cookie 批次在可信侧栏缺少精确网站 write 授权时，明确返回 `E_COOKIE_NOT_SUBMITTED`。** 拒绝仍发生在批次审阅、批准 RPC 和 Cookie Host RPC 之前，保留精确网站授权提示。单项写入、删除、监听不改码；派发后 Host 的 `E_SITE_GRANT_REQUIRED`、取消或丢回执均保持原码与未知语义。没有补权、自动重试、放宽权限或改写旧 journal。工具源码及唯一正式包未变，继续为 1.4.8。

### 公共缺口与范围依据

- 公开合同为 [Cookie 批次确认取消](../../../../../docs/api/browser-sdk.zh-CN.md#cookie-批次确认取消2026-10-30)；修复前专用未派发码只覆盖可信确认取消/确认前超时。1.4.8 第二站历史操作在可信缺授权 gate 返回通用 `E_SITE_GRANT_REQUIRED`，预存 journal 留下 unknown，本轮原入口仍锁定。
- 沙箱无法观察可信派发边界，同名授权错误也可能来自已派发的 Host，故工具内不能安全推断零写入。任何持久化 `cookies.setMany` 意图的工具均有同类需求。
- 最小公共范围是 `src/ui/sidebar-tools.js` 既有 gate、原公开文档和 `tests/environment/sidebar-tools-host.test.mjs`。复用现有码，无新 RPC、权限、存储、Host、授权层或 AI VIP Share 特判，安装身份、精确来源、撤权、部分回执和未知保护均保留。
- 新事实只绑定本次被拒绝的新请求，不能追溯结清旧 unknown。补授权后仍须交付有效、无其他未知屏障，并由用户重新明确确认；不自动调用。
- 编码前已记录缺口并取得共享文件串行移交：Cookie HTTP owner 已提交 `d2f89afe4` 并释放 `sidebar-tools.js`；AI Proxy owner 明确释放该文件与公开 SDK 文档。本任务只提交 Cookie hunks，保留其 Proxy 改动。

### 本次最小验证

这些检查只验证此次改变的“可信拒绝零派发”与受影响的未知保护，不重跑输入未变的 54 项页面 HTTP 检查，也不构建 Browser 或打包工具。

| 检查 | 本轮证据与限制 |
| --- | --- |
| Sidebar Host：缺精确授权、确认取消/派发后错误、请求预算 | 3 项 PASS。新缺授权用例先因原通用码失败，修复后通过；确认无批准及 Cookie RPC，已派发授权拒绝/取消/transport timeout 不重标 |
| 工具 Cookie journal | 3 项 PASS：只有显式未派发能结清，partial/unknown 保留，端口不能隔离 Cookie 槽位 |
| 既有内存控制器 | 2 项 PASS：可信未派发确认取消可由用户重试；通用取消保留 unknown，重开不重放 |
| 另 2 项普通站 HTTP 控制器检查 | ENV_BLOCKED：测试尝试监听固定 `[::1]:7901`，因原账本服务占用而报 `EADDRINUSE`，尚未进入目标行为。来源合同内含端口，未换端口或改固定配置制造通过，未停止旧进程 |
| 语法与差异 | 可信侧栏及 Host 测试语法检查、任务 diff 空白检查通过 |
| 独立限定审阅 | 未发现阻塞性安全问题；核对派发边界、身份授权和旧 unknown 无追溯解锁。审阅仅静态，未独立重跑测试或 Chrome |
| 原生新批次与新 VIP 页写入 | NOT_TESTED；本轮原生证据仅为原入口、已安装身份/连接及旧 unknown 仍锁定 |

对应命令（已执行，不是后续全量清单）：

```sh
node --test --test-name-pattern='Cookie batch missing exact|Cookie batch review cancellation|sandbox Browser RPC honors Registry' tests/environment/sidebar-tools-host.test.mjs
node --test --test-name-pattern='only explicit pre-dispatch|partial/unknown item|ports do not isolate|ambiguous SDK result|trusted pre-dispatch cancellation' examples/sidebar-tools/ai-vip-share/tests/cookie-journal.test.mjs examples/sidebar-tools/ai-vip-share/tests/controller-ordinary.integration.test.mjs
node --test --test-name-pattern='explicit Cookie confirmation cancellation|generic SDK cancellation' tests/environment/ai-vip-share-local-development.test.mjs
node --check src/ui/sidebar-tools.js
node --check tests/environment/sidebar-tools-host.test.mjs
```

journal 的 3 项最初与上述 2 项 HTTP 控制器合并执行；HTTP 环境阻塞后改用不占端口的既有内存控制器检查。未重复无变化检查。

### 下一条实际操作与阻塞

下一条未完成操作仍是原工具获取授权会话、写入并打开**新 VIP 页**。当前有两个独立阻塞：旧 unknown 没有可核验的合法恢复依据；旧 7898/7901/7902 进程静态导入旧页面并闭包持有内存账本，没有已实现的 renderer setter、watcher、动态 import、信号或升级路由。刷新页面不会加载磁盘新 renderer，重启会丢失账本。本轮未预建未来控制面。

保留 BLOCKED，不重启清账、不把 58251 新账本当作旧事务恢复、不换 Profile/来源/请求 ID 绕过屏障。只有取得旧事务真实可核验恢复依据，以及保留账本、身份和授权的合法运行升级入口后，才可继续原链。新 SDK 修复不满足这两个条件。独立查看地址仍为 [未登录模拟页](http://localhost:58251/session/)，不代表扩展登录成功。

## 原交接事实（历史观察）

本文件由交出对话写入并与新对话首条正文核对，现由接收任务维护，README 保留发现入口。以下保留交出时事实；当前状态以本次续接结果为准。

以下为交出时观察，开始时重查相关状态：
- main HEAD f425785c3 已提交 7 个本工具文件，未推送：共用 vip-session-page.mjs、ordinary-site-fixture.mjs / local-fixture-server.mjs、对应两个 .test.mjs、工具与本地测试两个 README。之前的 689f5ed28 / dbf8a42f7 保留。工具目录在本次交接文档写入前无未提交修改。
- 两个原 /session/ 复用自己的完整 Cookie 对、私有账本、服务端时钟、来源授权及当前分配核验；共用渲染器只接收非秘密展示数据，不接收 Cookie payload、Bearer 或真实账号。普通站 o***@fixture.test / 本地体验 VIP 独立于工具会员、额度和代理；共享账号 A/B 为 a***@fixture.test / 模拟标准 VIP、b***@fixture.test / 模拟高级 VIP。
- 页面显示本地模拟、服务器核验时间、生效/到期；无 Cookie、缺失/混配/重复、到期、撤权/授权换代/分配失效均不显示有效 VIP 或身份。HTML 无脚本、无 localStorage、不读取 HttpOnly Cookie、不输出秘密、不通过 Set-Cookie 代替原扩展。no-store，CSP 仅允许固定 CSS 摘要。每 5 秒普通导航只读重新核验，临近已知到期提前刷新；撤权在下次成功核验时反映，浏览器挂起/断网不保证即时更新。
- 两个受影响 fixture 文件共 54 项 HTTP 检查通过；新增3项曾先失败再实现通过，补充 A/B 及分配失效断言后定向单项通过。3个实现模块语法、diff 检查通过；独立限定源码审阅未发现具体缺陷。HTTP 手工 Cookie 请求头不证明 Chrome 接受或 SDK 写入，未执行项不能宣称原生 PASS；相关输入未变不重复全组测试。
- 独立查看地址 http://localhost:58251/session/，PID35117，exec session61325（不保证跨对话可操作）。已在交出对话 IAB 实际看到未登录/模拟 VIP 不可用和核验时间自动更新。该实例未签发授权、未安装 Cookie、未纳入工具固定开发来源；截图 artifacts/ai-vip-share-vip-page-20261031/not-logged-in.jpg。不能把“打开此页”说成“通过扩展登录”。
- 唯一正式包 ai-vip-share.opendesk-tool.json 仍为1.4.8，122995字节，SHA-256 4a96ffbe5b308a2022e192b5abdd4a8cedec98e974a7e774ad777d5dbca34bd2，身份与六项 capabilities 未变；本轮仅改 fixture，没有重打包或改批准摘要。
- 历史原生证据必须分开：1.4.8 曾在 AI VIP Core 20261030 Profile 经原审阅链升级，扩展 ID ccfcjegpkdlgbclopjmadlcjedelidmf，实际加载 dist/development；localhost:7901 旧页曾经原链写两枚 Cookie 后显示受控会话有效。会员非法码、预检/取消、明确兑换、丢回执后原事务查询也曾通过。这些不证明新 VIP 页面原生通过。
- 127.0.0.1:7902 的1.4.8操作在 Cookie Host RPC 前缺本站 write grant，返回 E_SITE_GRANT_REQUIRED；工具已预存 unknown，全局 Cookie 写入屏障生效，重开仍锁定。历史1.4.3 unknown亦保留。新 VIP 页面原扩展写入目前 BLOCKED / NOT_TESTED，交出对话未重试、未清记录。
- 交出对话01a19173-39de-71c2-a3b1-af082f98a57d当前 get_goal实读为null；前序01a19147-a7c6-7973-afb1-9f01443ee291历史实读null，其他对话goal未知。创建本新对话不暂停、完成或迁移任何旧goal，不用本对话空goal推断其他对话生命周期。

## 交接时任务（历史，当前结果与下一步见上）
1. 先只读核对 main、本工具 diff、最新公开 Cookie 合同、实际已安装版本/ID/加载目录和 serve 连接，以及已有 unknown 当前状态。通过原“扩展 → AI VIP Share”的最短核心链定位下一条失败/未验证操作；已有明确写入屏障时只读观察，不自动请求新会话或重复派发 Cookie，不先跑全仓测试或 Browser build。
2. 核对“新页面运行在哪里、原批准目标如何使用它”这一真实依赖。7901/7902/7898旧 Node进程未因磁盘源码修改升级，仍持有原内存账本与旧页面；58251是全新只读演示实例。找到能保留原账本、身份、授权与 unknown 的合法升级/接线方式再行动；不得重启旧进程清账、把新账本当旧事务恢复，或机械修改固定来源、端口和包hash制造通过。没有合法运行升级通道时如实记录该具体阻塞，其余独立实现继续。
3. 已有公共缺口是可信层对“确定未派发的拒绝”缺少可核验结果。若它仍是当前用户操作的实际阻塞，先写清公开SDK缺项与文档、可复现失败、工具内无法解决的原因、跨工具价值、最小源码/测试范围和权限/生命周期影响，再由平台owner按原框架补最小可信事实与定向回归。src/ui/sidebar-tools.js存在他人并行改动，先协调真实重叠，不覆盖；独立工具/文档工作继续。禁止在工具中把所有 E_SITE_GRANT_REQUIRED 一律转成零写入。
4. 平台未来修复只能为新操作生成可核验事实，不能追溯为旧 unknown 造证明、自动清锁或重放。旧记录无法合法恢复时保留 BLOCKED，不借换窗口/Profile、来源或请求ID绕过。安全条件成立后才完成原链对新 VIP页的真实扩展验证，记录已安装候选、网站、服务端可见状态和非秘密证据；若仍阻断，清楚交付具体原因和已完成的独立修复，不能伪报整条链通过。
5. 更新本MD与工具README，明确每项 SOURCE/HTTP/真实扩展证据和当前下一操作。仅运行变更触发且证明本次用户行为或受影响安全保护的最小检查，保留有效旧证据，不为了统计重跑54项。

## 必须保持的边界
复用原 OpenDeskTool、Browser SDK、Host、Authority、安装器与唯一打包器，业务留本工具；不新建第二套Provider、授权层或用户脚本。`E_COOKIE_NOT_SUBMITTED` 证明可信批次确认取消/确认前超时，或本轮新增的可信缺精确网站授权 gate 的零派发；普通取消、SDK关闭、超时、派发后撤权/丢回执仍unknown。保留 partial/unknown、CAS、精确来源、安装身份、授权、撤权及未知副作用保护。

Cookie不按端口隔离，127.0.0.1:7898与:7902的槽位冲突保护保留。目标页未登录、补授权、切站、到期和重开都不能解除unknown。生产来源仍为空；固定开发代理仍是127.0.0.1:7897和原七个AI域，不改系统代理或把代理测试当前置。仅fixture/文档变化不升工具版本、不打包；确实改工具包时，才按原候选→相关检查→同源晋升→check-project与必要来源审阅流程，不增加第二正式JSON。

## 并行文件、服务与所有权移交
本新对话接收本工具、模拟页及本任务测试资源的实施所有权；交出对话不再重复操作这些文件、Profile、fixture和输出。服务是历史内存账本，接收owner不代表获准重启清空。
- 本次18:39左右只读lsof仍见：唯一Browser dev writer PID11774、43119/43120、dist/development；会员fixture PID92522 /127.0.0.1:7898；普通站 PID93579 /[::1]:7901和127.0.0.1:7902；独立页面PID35117 /[::1]:58251。保留全部，不启动第二dev/build覆盖共享输出，不擅停watcher。源终端session91939/29251/61325不保证可跨对话，不能依赖它们取得凭据或输出进程参数中的秘密。
- 其他服务和浏览器保持：7897代理、43271预览、43111测试页及Cookie Editor、AI Proxy任务；本轮未重查它们的PID。只操作本工具已移交页面/Profile，不接管其他任务弹窗。
- 当前其他Agent有大量未提交修改，包括DESIGN.md、docs/api/browser-sdk*、src/framework/sdk/browser-contract.js /browser-schemas.js、src/platform/chrome/browser-managed-proxy.js、src/ui/sidebar-tools.js、src/ui/design-system.css、src/ui/react/components/conversation.tsx及相关根测试；Cookie Editor、ScrapyJS、AI Proxy、Reading TOC项目和预览也有修改/新增/删除；另有未跟踪chatgpt-mindmap、bookmark-manager和proxy配置/测试。开始时以git status实读为准，不覆盖、回滚、暂存或提交这些文件，不创建分支/worktree规避并行约束。
- 原交接仅新增EXTENSION-VIP-TEST.zh-CN.md与README发现链接；接收任务已维护此文档并完成上方独立修复及最小验证。共享Git索引/HEAD操作串行，仅提交本任务精确路径和 Cookie hunks，不推送。

## 完成与交付
优先交付“原扩展设置并打开目标模拟网站，目标服务端显示真实核验后的脱敏身份和模拟VIP”的可观察结果，并验证本次实际变更影响的失效/撤权保护；HTTP或未登录截图不能代替原生链。旧unknown必须保留，无法合法继续时报告具体BLOCKED与可安全完成部分。输出实际修改文件、可打开地址、原入口操作说明、相关验证、真实扩展是否通过及剩余阻塞；源码改变后按授权在main安全提交本任务文件，不推送。核心操作与最小验证收尾后停止，不自动进入延期验收、评分或代理研究。
