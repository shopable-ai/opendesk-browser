# AI VIP Share R5.2.1 · 会员兑换恢复安全加固（服务端时钟与账号边界）

日期：2026-10-15。Owner：本次 ChatGPT GitHub main 增量任务。上游：R5.2 real-product 与 legacy adoption；本文件独立，不覆盖其他 Agent 的工作流。
分支：仅 `main`。本轮 GitHub 写入基线：`bdc5986592187aa4a9b06285ed9a977780ead560`；工作范围精确到本文件及下列两个文件，不修改共享 SDK、Host、Proxy、CI、安装器、旧版源码快照。
状态：`SOURCE_WIRED / NODE_23_OF_23_PASS / PACKAGE_PASS / CHECK_PASS / BROWSER_BUILD_BLOCKED / PROVIDER_BLOCKED / NATIVE_NOT_TESTED`。定向 Node 与构建证据严格绑定本轮源码提交，不把隔离测试或旧候选报告提升为生产 95+ PASS。

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

## 3.1 同源码提交的 GitHub CI 回执（2026-10-15，已完成）

- **正式源码提交（仅上述 3 文件）**：[`13a4e2b54c208e0e684a6b3aed9be4ac1c8ec9e9`](https://github.com/shopable-ai/opendesk-browser/commit/13a4e2b54c208e0e684a6b3aed9be4ac1c8ec9e9)，正常 fast-forward 推送 main，未强推、未新建分支/PR。
- **GitHub Actions 同候选**：[`38736889451`](https://github.com/shopable-ai/opendesk-browser/actions/runs/38736889451)，对应 head `13a4e2b54c208e0e684a6b3aed9be4ac1c8ec9e9`；AI VIP job `116428347561`。
- **AI VIP 定向 Node：23 / 23 PASS，0 FAIL**。包含原 R5.2 的 18 项和本轮新增 5 项，完整实际运行日志已核对；并非仅依靠先前 V8 烟测。
- **正式工具打包**：`Package exact v1.2.0 AI VIP Share official tool` PASS，权限仍为 `ai.access` + `storage.local`，商业网络 Provider URL 仍为空。
- **源码检查**：`R5 source validation` / `npm run check` PASS。
- **Browser production/development 构建**：`BROWSER_BUILD_BLOCKED`，本轮 job 的 `R5 production and development Browser candidates` FAILED，因可信 AdBlock 源码指纹核对拒绝：`[opendesk-fixed-sidebar-tool-host] Trusted AdBlock source changed; review and re-pin before fixed build: examples/sidebar-tools/adblock/trusted/host-controls.js`。不修改其他 Owner 的 Trusted pin，不关闭校验。不宣称 Browser build PASS，也没有完成后续 Chrome/Native 正式安装验收。
- **同 run 综合 sidebar-tool job** `116428347308`：`265 tests / 246 PASS / 19 FAIL`；18 项既有 R2.1 代理生命周期/Web Lock、1 项 Cookie Editor R4.8 官方目录检查，均非本轮新增会员专项用例。全局 CI 仍失败，不得把 `23/23` 误称整个产品全部 PASS。
- **测试边界**：Node fixture 可证明确认前二次身份核对、存储未知效果防重、显式状态查询和设备时钟偏差路径；尚未覆盖真实商业 Provider、完整 Chrome 安装升级、跨 Worker、包签名与 Native 代理所有权。以上分别保持 `PROVIDER_BLOCKED / SDK_BLOCKED / NATIVE_NOT_TESTED`，产品质量逐维 `NOT_SCORED`。

### 3.2 文件与资源交接

R5.2.1 正式业务和定向测试文件的写入范围在上述提交后已释放；工作流文档仅作 CI 证据增补。本对话未占用 Mac Git 工作区、watcher、dist、浏览器 Profile、Native 服务、真实 Provider。后续应由对应 Owner 处理 AdBlock 构建门禁、商业 Provider 契约与 Managed Proxy，而不是在此分支重新开发旧的会员/代理框架。

## 3.3 日期无关测试加固与最终同候选复验（2026-10-15）

在正式业务提交 `13a4e2b...` 后，经独立复核发现原定向测试的 `time()` 默认值仍写死到 `2026-10-18`；当服务器时间 fixture 改为实时 `serverNow` 后，这会令“剩余 3 天”测试在次日无关业务地失败。故将默认权益到期时间改为相对 fixture 执行时的 `Date.now()+3*86400000`，**只改测试一行，不改变正式业务代码**。

- 后续单文件测试修复提交：[`14f258ec6a40f117f30de65c56eef82c34a07a8d`](https://github.com/shopable-ai/opendesk-browser/commit/14f258ec6a40f117f30de65c56eef82c34a07a8d)，正式业务 `main.js` blob 仍为 `7c176bd0ce93d37f49df5284676f06b8afe259d7`；更新后的 Node 测试 blob `aa3828d56ed66d003ce4f94f90781b632673f45e`。
- **最新测试源码候选的真实 GitHub Actions**：[`38737465334`](https://github.com/shopable-ai/opendesk-browser/actions/runs/38737465334)，运行 HEAD `14f258ec6a40f117f30de65c56eef82c34a07a8d`；专属 job `116430310283`。
- 最新同候选日志明确输出 **`# tests 23 / # pass 23 / # fail 0`**；`Package exact v1.2.0` PASS，`R5 source validation`/`npm run check` PASS。
- 最新同候选 Browser production/development 构建**仍失败**，相同 Trusted AdBlock `host-controls.js` 指纹审查阻塞；这归 AdBlock Owner，禁止本任务绕过。
- 最新同候选综合 job `116430309717`：**266 tests / 247 PASS / 19 FAIL**；同样是既有 R2.1 代理安全锁与 Cookie Editor 官方目录检查，没有本轮新增 5 项兑换测试失败。
- 主代码和定向测试的写入范围已经释放；本次文档仅更新可追溯测试与最终阻塞回执。没有真 Provider、Native Chrome/CFT、安装升级及代理运行验收，均保持 `NOT_TESTED` / `NOT_SCORED`，**不宣称产品 95+ PASS**。

## 4. 后续真实交付门禁

1. 在本轮提交对应 GitHub Actions 或等价的稳定源码快照中执行定向 Node 用例，检查新增时钟与身份用例及正式工具包合同；失败不能记 PASS。
2. Provider Owner 审定身份会话与 `serverNow` 新鲜度、预检有效期/事务 TTL、服务端会话-账号-幂等键绑定、权威终态与撤权；仅填四个 URL 不构成可用商业系统。
3. 短效 ticket、独立商品目录、正式 Managed Proxy SDK 和 Chrome 安装升级继续遵循 R5.2 原 Owner/权限审查。
4. 真正同候选 Native Chrome、断网、跨窗口、注销、包升级、Worker 重启及 STOP/所有权验收仍为 `NOT_TESTED`；各产品维度 `NOT_SCORED`，禁止声明 95+。

本次不占用 Mac、本地 Git 工作树、`dist/development`、Chrome/CFT Profile、原生端口或 watcher；GitHub main 写入由无强推的 fast-forward 单提交完成后释放。其他 Agent 无关变更保留。
