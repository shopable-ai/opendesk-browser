# AI VIP Share R5.2.1 · 会员兑换恢复安全加固（服务端时钟与账号边界）

日期：2026-10-15。Owner：本次 ChatGPT GitHub main 增量任务。上游：R5.2 real-product 与 legacy adoption；本文件独立，不覆盖其他 Agent 的工作流。
分支：仅 `main`。本轮 GitHub 写入基线：`bdc5986592187aa4a9b06285ed9a977780ead560`；工作范围精确到本文件及下列两个文件，不修改共享 SDK、Host、Proxy、CI、安装器、旧版源码快照。
状态：`SOURCE_PATCH_VERIFIED / CI_PENDING / PROVIDER_BLOCKED / NATIVE_NOT_TESTED`。本文件记录补丁边界，最终 CI 结果另按同提交核对；不得把静态或模拟测试写成生产 95+ PASS。

## 1. 源码事实与增量目标

已复用 R5.2 的 `storage.get/set` 工具命名空间、ETag CAS、写前持久化兑换 journal、手动服务端终态查询和账号绑定；既有 `da64a05873a1` 解决了跨页面未知事务恢复的主要缺口，不重做协议。此次只针对原始 `main.js` 中以下缺口：
- 原预检有效期直接使用设备 `Date.now()`，本机时钟快慢会使预检被错误接受或拒绝；客户端需要依赖已收到的权威 `serverNow` 和单调经过时间。
- 原持久 journal 把 `createdAt > Date.now()+60000` 视为损坏；时钟回拨会使真实未知效果事务不能再次核对。
- 原预检提交、手动恢复状态查询依赖已显示的旧会员快照，缺少操作前的实时身份再核验；关闭/切换账号后必须 fail-closed。

## 2. 本轮文件及行为

- `examples/sidebar-tools/ai-vip-share/src/main.js`：使用 `performance.now()` 与会员响应中的 `serverNow` 估算服务端当前时刻。对提交预检设置保守 5 分钟上限，超过采样窗口或无法核验时阻止提交；这只是 Provider 合同待定期间的 fail-closed 客户端限制，不取代服务端鉴权、签名或真实有效期判断。兑换提交前及恢复终态查询前分别重新 GET 正式会员身份，身份变化不发送 voucher POST、不继承旧结果。会员数据查询失败后清除仅内存的预检，保留未知 journal。journal 创建时间用于诊断而非本机时钟归属信任，继续依托 Host 的工具安装存储隔离及服务端账号/事务验证。
- `tests/environment/ai-vip-share-r51-member.test.mjs`：把模拟 member 的 `serverNow` 改为运行时时钟，提供 `performance` 与设备时钟偏差 fixture；把预检 fixture 有效期限制到 2 分钟；增加时钟 ±24h / 重开、提交前账号切换、身份检查失败、恢复前账号切换、超长预检拒绝五项定向 Node 用例。
- 本文：记录身份边界、约束、验收尚未完成的事实，后续交接勿从旧代码重新搬迁。

不变的安全边界：`BUSINESS_ENDPOINTS` 四项继续为空，`PRODUCT_CATALOG_URL` 为空；不增加 Provider、权限、远程 JS、Cookie、浏览器指纹、明文兑换码存储或 URL 直接启动代理。技术 `aiAccess` 状态和会员权益仍分离。

## 3. 提交前验证证据与限制

- 直接对拟提交 `main.js` Git blob（`7c176bd0ce93d37f49df5284676f06b8afe259d7`）进行了 V8 JavaScript 语法检查：`PASS`。
- 直接加载该 blob 和现有正式 `index.html`，用隔离 Browser SDK / DOM / storage / Provider fixture 执行交互回归，`9 / 9 PASS`：会员初始化、预检展示、账号切换拒绝消费、设备 +24h 预检、journal 写前持久化、-24h 重开恢复、权威拒绝解锁且不重复 POST、存储失败拒绝消费、超长预检拒绝。
- 隔离 V8 测试不等于仓库 Node runner、真实 CI、冻结 Chrome/CFT/Native、生产 Provider、正式网络代理或安装验收。此时 `NODE_CI_PENDING`；既有 R5.2 `18/18` 证据是另一旧提交，不可继承为本提交结果。
- 测试文件拟提交 blob：`60b99ab255d255ac532b4db52ecf95de2b23eb81`。受影响定向命令：`node --test tests/environment/ai-vip-share-r51-member.test.mjs tests/environment/ai-vip-share-r5-ui.test.mjs`；仅针对本工具定向运行，不启动本地 watcher 或共享 build。

## 4. 后续真实交付门禁

1. 在本轮提交对应 GitHub Actions 或等价的稳定源码快照中执行定向 Node 用例，检查新增时钟与身份用例及正式工具包合同；失败不能记 PASS。
2. Provider Owner 审定身份会话与 `serverNow` 新鲜度、预检有效期/事务 TTL、服务端会话-账号-幂等键绑定、权威终态与撤权；仅填四个 URL 不构成可用商业系统。
3. 短效 ticket、独立商品目录、正式 Managed Proxy SDK 和 Chrome 安装升级继续遵循 R5.2 原 Owner/权限审查。
4. 真正同候选 Native Chrome、断网、跨窗口、注销、包升级、Worker 重启及 STOP/所有权验收仍为 `NOT_TESTED`；各产品维度 `NOT_SCORED`，禁止声明 95+。

本次不占用 Mac、本地 Git 工作树、`dist/development`、Chrome/CFT Profile、原生端口或 watcher；GitHub main 写入由无强推的 fast-forward 单提交完成后释放。其他 Agent 无关变更保留。
