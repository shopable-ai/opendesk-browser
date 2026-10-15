# AI VIP Share R5.2 · 旧会员经验到现代框架的采纳与缺口方案

> **文档类型：现代方案与本次独立文档任务的工作流记录；不是已部署 Provider 合同，也不是 R5.2 产品验收。**
>
> 日期：2026-10-15；Owner：本次 ChatGPT/GitHub 只读考证与文档落库对话；分支：`main`；起始只读远端 HEAD：`11ea3e7025b76d6ea9b195e06dac2a2a3730bed1`。远端继续有其他 Agent 增量提交；历史 commit 不是写入基线。
>
> 状态：`COMPLETE_DOCS_ONLY / RELEASED`。本次**仅保存知识、设计边界及续接 GOAL**，不宣称任何产品代码已因此完成。无 Mac 工作树、Chrome/CFT、watcher、dist、代理或商业 Provider 资源占用；不更新其他 Agent 的 R5.2 工作记录。

## 0. 文件级归属与参考入口

本对话只负责这三个**新文件**，不抢占 R5.2 的正式源码所有权：

1. `docs/framework/workstreams/ai-vip-share-r52-legacy-adoption-and-plan-20261015.md`（本文；现状、映射、实施顺序、验收矩阵及交接）。
2. `docs/architecture/ai-vip-share/legacy-vip-source-extraction-20261015.zh-CN.md`（逐行历史源码与可抽象能力；不记录现代实现为既成事实）。
3. `docs/framework/prompts/goal-ai-vip-share-r52-legacy-reuse-addendum-20261015.zh-CN.md`（正在执行 R5.2 的增量 GOAL，非重启任务）。

参考的原文件、当前工具源码、`AGENTS.md`、`docs/framework/parallel-development.md` 只读。公共 SDK、商业协议、Host/Proxy、配置及任何历史源码快照**均不写入**。采用 GitHub main 的逐文件创建与核验；没有本机 Git status，因此本地未提交文件占用状态**未核验**；目标文档是独立新路径。

详细旧代码参考：[旧版会员代码提取](../../architecture/ai-vip-share/legacy-vip-source-extraction-20261015.zh-CN.md)；续接执行入口：[R5.2 旧经验增量提示词](../prompts/goal-ai-vip-share-r52-legacy-reuse-addendum-20261015.zh-CN.md)。

## 1. 先区分三个产品领域

| 领域 | 事实与职责 | 禁止误判 |
| --- | --- | --- |
| 历史 `WebAppVip` / CSDN | 第三方目标网站登录状态适配、`vipcode`、卡密调用及返回脚本；旧扩展环境包含 Cookie 与页面执行 | 不能称为已部署 OpenDesk 账号/SKU/权益、账本、ticket 服务 |
| AI VIP Share 商业工具 | `examples/sidebar-tools/ai-vip-share/`，动态 opaque-origin iframe；会员身份、SKU、权益、预检、确认、回执、历史、商城的**消费端** | 不在宿主 `src/` 写业务，也不将第三方 Cookie 当 OpenDesk 登录令牌 |
| AI 网站代理 | `src/ai-smart-access/` 的现有可信 Host 与 `aiAccess` 技术激活/租约/STOP，待已审核 Managed Proxy SDK | 代理可用 ≠ 已付款/有会员；会员兑换 ≠ 自动启用代理 |

历史 `/open/operate/cardonce/use` 是**调查线索**，不是现代 `aiAccess.activate` 的可替换生产 URL。`src/ai-smart-access/provider-config.js` 已明文禁止把历史 todo6 卡密/登录接口复用作代理激活服务器。

## 2. 当前源代码差异（读取时点，不替正在开发者宣布阶段完成）

- `examples/sidebar-tools/ai-vip-share/src/main.js`：会员展示、`serverNow` 的权益剩余天数、服务响应 schema 校验、预检 `voucherPreview`、确认 `voucherRedeem`、客户端幂等键、Unknown Effect 禁盲重试与单次刷新内的兑换记录比对均已有源码。`BUSINESS_ENDPOINTS={member:'',voucherPreview:'',voucherRedeem:''}`、`PRODUCT_CATALOG_URL=''`，没有正式生产会员接线；`tool.config.json` 当前 v1.1.1 只声明 `ai.access`。
- `main.js` 的 `pending`、`uncertainKey` 是页面内存变量；重载会丢失；没有服务端 **按事务标识权威查询** 的消费端调用（`redemptions` 快照只能覆盖服务端实际返回的记录，不能推断列表缺失 = 未消费）。
- `validatePreview` 使用 `Date.now()` 判预检到期，而权益使用 `serverNow`：有跨设备时间偏差风险，需以获批准的服务端时间/预检签发时限契约确认。
- `src/ai-smart-access/service.js` 的 `aiAccess.activate` 是技术代理激活，调用可信 HTTPS POST 与按安装身份绑定的租约；`src/ai-smart-access/provider-config.js` 激活/验证 URL 仍为空。不迁入会员兑换端点。
- 按 `docs/framework/workstreams/ai-vip-share-r51-source-first-20261015.md`，R5.1 13/13 专项 Node PASS，但完整 Browser build/真实 Mac Chrome/生产 Provider **不能由该证据推出 PASS**；报告记载的 AdBlock Trusted pin 阻塞归其 owner，不在本任务绕过。

## 3. 旧能力 → 新职责：采纳矩阵

| 历史能力（两 JS） | 可继承的用户需求 | 当前现代承接/最小缺口 | 结论 |
| --- | --- | --- | --- |
| `WebAppVip.initApp/initLogic` 生命周期模板 | 初次打开时读取身份并进入明确状态 | AI VIP Share 已有页面入口；缺独立**会话身份恢复**合同时保持禁用态 | `REUSE_IDEA`；不移植类 |
| `checkLogin` URL `vipcode` | 外链打开产品后识别用户的兑换意图 | 宿主可信安装/打开交接 + **短效单次 ticket** + 服务端验证 + 账号确认；不能传长效 voucher 给任意页面 | `CLIENT_BOUNDARY_PENDING` / `PROVIDER_BLOCKED` |
| `checkRelogin` 与手动登出节流 | 网络恢复时保留用户登录状态、尊重主动登出 | 通过批准的账号会话；退出后失效旧回执/恢复请求，禁止重新消费 voucher | `AUTH_CONTRACT_REQUIRED` |
| `deviceCode` | 同设备/同安装的授权延续 | 既有 `installEpoch/packageHash` 与获批准可信 Host 身份；不得换成网站指纹 | `REUSE_HOST_IDENTITY` |
| `isused` / `cardcode_...` | 已用、过期、重复使用、历史记录提示 | 服务端按账号 + voucher/事务标识查询权威账本；历史原始 code 不落本地 | `LEDGER_CONTRACT_REQUIRED` |
| `createTime/updateTime/expireAt` | 显示何时生效、到期、被使用 | 结构化服务端时间戳及 `serverNow`；时区、时钟偏差与显示须按合同验证 | `REUSE_SEMANTICS` |
| 按网站传入 `appname` | 多网站定制而不重做基础流程 | 仅在业务确有需求时以受控 `providerId`/批准 origin 的**工具级适配**实现；不新增 SDK/权限来源路由 | `LATER_IF_NEEDED` |
| CSDN `isLogined/initCustomLogout` | 网站身份显示与退出体验 | **OpenDesk 身份**走正式认证 Provider；不注入/清理第三方站点 Cookie | `DO_NOT_PORT_IMPLEMENTATION` |
| `checkSetting` URL 直接设置代理 | 用户完成授权后控制访问网络 | 唯一可信代理按钮 + 已有 STOP/所有权/租约状态机；URL 不能设置代理 | `REJECT_LEGACY_PATH` |
| `scripts[]` 执行站点登录代码 | 给付费用户相应服务能力 | 服务端授权的**结构化权益**；禁止远程脚本/Eval 与修改第三方 Cookie | `REJECT_CODE_EXECUTION` |

## 4. 未来正式 Provider 的最小能力合同（**设计清单，非已有 API**）

商业 Provider Owner 应明确给出**同一个账号与交易语义**的可验证合同，而非根据历史 GET 端点猜测：

1. `identifySession`：已授权用户身份、稳定但最小化的 `accountRef`、会话过期/撤销与无需频繁重复权限弹窗的安全读取路径。Cookie 不跨 iframe 获取；如需要宿主支持，复用已批准 Host/SDK，仅由 owner 明确签发身份票据。
2. `readMember`：`serverNow`、`accountRef`、SKU 列表、`entitlements`、兑换记录以及必要的分页/完整性语义。当前 `member` 端点只是消费端占位。
3. `previewVoucher`：不消费权益的服务端预检，返回 `previewId`、归属账号、掩码、SKU、权益摘要与**服务端定义的有效期**；不能把旧 `/cardonce/use` 当作预检。
4. `commitVoucher`：明确用户确认的 POST，绑定 `accountRef` + `previewId` + `idempotencyKey`，保证同一键幂等而不同账号不能继承；须有服务端持久化交易回执。服务器至少保存跨窗口/重启可核验的状态。
5. `readRedemptionStatus`：按服务器认可的 transaction/idempotency scope 查询 `REDEEMED / REJECTED / PENDING / UNKNOWN` 及可信终态；不能凭历史列表缺项确定失败。缺此能力，客户端只能显示未知与联系客服，不得自动重试。
6. `exchangeActivationTicket`：服务端签发的**短效、一次性、仅限工具与安装上下文**的链接票据；包含明确过期、消费、受众和回跳语义；安装未完成时在正式流程中续接，不能网页静默安装或消费。
7. `catalog`：审阅后的 HTTPS 商品目录/授权打开；账单金额、真实库存和付费流程由商业 owner 提供，工具不造价格/订单。

接口名称仅为**责任命名**，不是需要新增 7 个 SDK API、路径、Registry 或服务。先和真实 Provider Owner 核对现有合同，合并已存在能力，按需补最小必要字段。服务器应固定 HTTPS origin/redirect、审阅认证手段、限流、响应体上限、敏感信息脱敏、操作审计以及错误语义。

## 5. R5.2 建议的最小客户端状态机

`IDLE / UNAUTHENTICATED → INTENT_RECEIVED → (INSTALL_REQUIRED | AUTH_REQUIRED) → PREVIEW_VERIFIED → WAIT_USER_CONFIRM → SUBMITTED_UNKNOWN → RECONCILING → (REDEEMED | REJECTED | STILL_UNKNOWN)`。

核心不可变约束：

- 只有 **REDEEMED 的服务端权威回执**允许展示兑换成功和刷新权益；`isused=true` 仅是旧服务器对使用状态的描述，不能替代账号与订单的验证。
- 在提交请求**之前**安全保存必要恢复标识；请求失败、超时、工具关闭、Worker 重启与重连均**不自动重发消费操作**。恢复时只查服务端状态。
- 可持久化的最小恢复记录只能是已审阅的`toolId + packageHash + installEpoch + accountRef(最小化) + operationId + idempotencyKey(非凭证、有限时效) + createdAt/expiry`；禁止存明文兑换码、登录密码、长期 access token、第三方 AI Cookie、完整激活 URL 或可重放敏感 ticket。存储命名空间、生命周期、撤销权限需要**已有批准机制**，未批准则不创建平行 storage。
- 用户切换账号、注销/撤销权限、卸载、重装、包更新：失效不匹配的本地意图；仍可在新获授权身份下查询合法服务端账本，但不能静默继承旧意图、旧回执或自动消费。
- 手动 STOP 必须优先；会员兑换不启用代理；技术 `aiAccess` STOP 的归属、晚到回执、Worker 恢复仍由既有可信层判断。

## 6. 按外部依赖排序的下一步（不和并行 R5.2 抢文件）

| 优先级 | 最小工程交付 | 阶段完成证据 | 缺失依赖 |
| --- | --- | --- | --- |
| P0 | 把历史业务场景映射给正在开发的 R5.2；不重复已经实现的展示/兑换预检 | 本文 + 旧源码逐行文档 + 增量 GOAL | 无 |
| P1 | 排除确定性的客户端恢复缺陷；若现有已批准 storage 存在，仅保存无敏感最小事务意图、阻止多次副作用 | 状态转换/关闭重开/撤销/身份变化定向测试，产品 UI 无假成功 | 已批准工具级 storage 与事务 scope |
| P2 | 商业身份读取、独立 SKU/权益、权威兑换状态查询 | 真实 Provider 账号、错账号、重复键及未知回执核对 | `PROVIDER_BLOCKED` |
| P3 | 可信安装/未安装/未安装宿主的三路径 ticket 续接 | 实际安装审阅、真实票据失效/重放/回跳测试 | ticket 服务与 Host 安装合同 |
| P4 | 商品 HTTPS 外链、会员与代理独立以及正式安装验收 | v2 能力审阅、同包 Chrome/CFT、STOP/冲突/Worker/撤权 | SDK 审批、生产服务、Native 资源 |
| P5 | 公共 Managed Proxy SDK 如果经 owner 正式批准，再迁消费端 | 独立所有权/STOP/lease 安全回归 | `SDK_BLOCKED` |

优先只做**可以减少实际用户缺口的源码**；Provider 尚未上线不阻塞独立的错误状态、撤权/身份变化保护和可靠恢复边界。禁止扩写通用框架来替代当前最小消费端业务。

## 7. 必要的接受案例：全部为待执行测试设计

- `A01` 无 Provider/身份未批准 → 明确锁定兑换，代理 UI 不假显示会员。
- `A02` 新链接参数恶意/过期/重放/跨安装 → 不存储、不消费、不自动安装。
- `A03` 预检成功，账号在确认前变化 → 拒绝提交、重新核对，旧权益不进入新账号。
- `A04` 同幂等键重复到达后端 → 至多一笔兑换；不同键与未知结果不被猜测。
- `A05` POST 之后断网或关闭页面 → 保留非敏感最小标识，重开查询，不重发 POST。
- `A06` 服务端账本短列表缺项 → 仍 UNKNOWN；只有权威查询/完整性保证可结算。
- `A07` 客户端时钟错误 +24h/-24h → 不以本机时间宣称权益或预检有效。
- `A08` 主动退出、账号变更、卸载重装、`installEpoch/packageHash` 变化 → 旧恢复操作不触发。
- `A09` STOP、晚到 ENABLE、Worker 重启及其他扩展代理所有权 → 不被会员逻辑影响。
- `A10` 真实 Chrome 审核、安装与回跳三路径 → 只有获许可的工具接受 ticket，完成前保持确认态。

当前这些是 `TEST_SPEC_ONLY / NOT_TESTED`，不是新一轮已通过的测试数字。历史 R5.1 13/13 的有效性只覆盖当时输入。

## 8. 方案评分与真实验收边界

本方案的**静态方案自评**目标为 `96/100`，评分项如下（主观设计审查，**不是第三方独立评审或产品 PASS**）：

| 维度 | 自评 / 满分 | 判据 |
| --- | --- | --- |
| 旧源码溯源与函数可核查性 | 20/20 | 完整路径、blob SHA、行区间、两个 JS 的共性与真实缺陷 |
| 新旧边界隔离 | 20/20 | 历史卡密/目标网站登录、商业会员、技术代理明确分离 |
| 安全与未知副作用控制 | 20/20 | 不移植远程脚本/Cookie/指纹/GET 兑换；账号、安装、事务绑定 |
| 最小实施路线与复用率 | 18/20 | 保留现有业务、Host、SDK；未取得 Provider 与安装 owner 的最终契约 |
| 验收和并行可执行性 | 18/20 | 给出高风险用例及文件归属；真实 Mac Chrome/商业服务未验收 |

**不允许**将本表的 `96` 写成 AI VIP Share 的视觉、交互、安全、商业或原生正式验收成绩。产品逐维 `95+` 只能在同一候选下有相应实测与独立审核时认定，否则 `NOT_SCORED`。

## 9. 交接与验证状态

- 任务归属：仅本文、旧源码提取 MD 与续接 GOAL；没有改变正式产品源码、业务合同、SDK、Native/Chrome 或历史快照。
- 调研输入：GitHub 现行 `main` 读取的原始文件、R5.1 工作流、SDK 执行手册、`AGENTS.md`、并行协议；文档源码引用需按链接及行号再次核对。
- 验证类型：只读源代码查证与文档完整性检查；`NODE_NOT_RUN` / `BUILD_NOT_RUN` / `NATIVE_NOT_TESTED` / `PROVIDER_NOT_TESTED`。
- 当前版本可能随并行 R5.2 改变；下一个 Agent 以**最新 main 的实际 diff**决定剩余缺口，不能用本文读点回写旧 `main.js`。
- 文档文件独立完成后，写入范围视为释放；不存在仍被本对话占用的 Mac/Chrome 资源。


## 10. 本次仅文档落库的实际结果（2026-10-15）

- 现代方案/本工作流首次创建：`e1402498a72aefeae81e9d96545d5ebe97b3ee04`。
- 历史 `WebAppVip` + CSDN Adapter 函数/调用链/代码节选创建：`a40a63e5d991a80152ce87194618cb5c4d9f7eb1`；后续修复跨目录相对引用：`67648dae36f6e76e9d969a2d97b915fc49e732a2`。
- 可复制的现行 R5.2 增量执行 GOAL 创建：`b043c679f59113d6f7484fbd6d9bf1b6f41ed2e9`。
- GitHub 重新读取三个实际文件，核实相对 Markdown 链接共 `7/7` 目标路径存在，代码围栏均成对；未发现未替换的节选标记。此为**静态文档验证**，非 CI / Node / 产品功能验证。
- **GitHub 直接保存于 main**，未创建额外分支/worktree/PR，也未写入 R5.2 正式工具代码或历史快照；没有下载工具包、HTML 或 ZIP。
- 本次文档写入范围：`RELEASED`。未占用本机 Git 索引、Chrome/CFT、watcher/port、dist/ZIP、商业 Provider、代理或 SDK 合同；产品验证仍 `NOT_TESTED`。
- 交接方式：继续正在运行的 R5.2，按最新 `main` 只对未完成的真实产品缺口实施；避免同本文重新考古。产品是否 95+ 必须另有同候选实测与独立审查。
