# GOAL ADDENDUM：OpenDesk Browser AI VIP Share R5.2 — LEGACY VIP KNOWLEDGE REUSE

## 从旧 WebAppVip/CSDN 代码恢复需求与通用业务思想，继续 R5.2 正式闭环

**日期：2026-10-15。默认中文。**

目标：[`shopable-ai/opendesk-browser`](https://github.com/shopable-ai/opendesk-browser)，唯一允许写入/正常提交的分支 `main`。正式独立工具：`examples/sidebar-tools/ai-vip-share/`，工具 ID `ai-vip-share`。

**这是当前正在执行的 R5.2 的增量补充，不是新版本任务，也不是重新设计通用框架。继续继承对话已经完成的代码修改、测试证据、Owner 范围和阻塞结论。** 不停止无冲突源码工作，不覆盖其他 Agent 的文件。

## 一、先读已经保存的两份参考，不必重新全库考古

1. **历史源码事实与已提炼代码片段**：[`docs/architecture/ai-vip-share/legacy-vip-source-extraction-20261015.zh-CN.md`](../../architecture/ai-vip-share/legacy-vip-source-extraction-20261015.zh-CN.md)。
2. **现代架构采纳矩阵、当前缺口、实施次序和测试**：[`docs/framework/workstreams/ai-vip-share-r52-legacy-adoption-and-plan-20261015.md`](../workstreams/ai-vip-share-r52-legacy-adoption-and-plan-20261015.md)。

证据对应的重点旧源码：

- `docs/contracts/source-snapshots/scrapyJsChrome/assets/app_script/app_vip_base.js`（`WebAppVip`，通用生命周期、`vipcode`、恢复、历史卡密 API）。
- `docs/contracts/source-snapshots/scrapyJsChrome/assets/app_script/app_csdn.js`（实例级 CSDN Adapter，登录检查/DOM 按钮；部分函数存在真实缺陷）。
- 辅助 `docs/contracts/source-snapshots/todo-src-bex/src-bex/{controller/csdn.ts,background.ts,assets/js/controller/csdn.js}`（另一套 Quasar BEX 实现，不可把两套签名拼成一个可靠合同）。

**已经完成的历史提取不必复述；有源码与文档冲突时以实际源码和最新 main 为准，只更正具体误差。**

## 二、此次补充的核心设计决策

- 保留“**通用会员业务生命周期 + 必要的平台适配器**”的抽象思路；现代业务代码必须属于独立工具，宿主 `src/` 只负责经过批准的 SDK/Host/权限/代理。
- **分清三个概念**：第三方 CSDN 网站登录 ≠ OpenDesk 商业会员身份；历史兑换码使用 ≠ 账号绑定的正式 SKU/权益入账；`aiAccess` 技术代理租约 ≠ 会员支付或兑换。
- 旧源码中的 `/open/operate/cardonce/use`、`isused`、`expireAt` 仅帮助确定历史需求。它是 GET 请求、可能产生消费副作用；**绝不把它当现代兑换预检，也不擅自作为已获批准生产 Provider。**
- 旧 `WebAppVip` 的 `checkLogin/checkRelogin` 已表明用户需要链接激活与恢复；现代实现需要短效一次性 ticket、真实账户授权、用户预检/确认、幂等服务端账本、未知状态查询及受安装身份约束的恢复。
- `app_csdn.js` 里的 `initCustomRelogin` 存在错误判断/未定义变量，且基础 `initLogic` 未调用该钩子；`doCustomLogoutBefore` 未见真实接线。不得把这些历史声明冒充已可用功能。
- 禁止复制历史浏览器指纹、明文 voucher 本地长期保存、第三方 Cookie 读取/上传/删除、远程 `scripts` 执行、URL `proxy/redirect` 改设置、未受控 iframe HTTP/`chrome.proxy` 或跨账号恢复。
- 可以支持未来多个批准的网站/Provider，但不因通用化新建第二套 SDK/Registry/身份代理/权限数据库；当前优先完成已定义的 AI VIP Share 商业闭环。

## 三、按最小变更实际执行，而不是只写设计

**Phase 0｜与正在执行的 R5.2 合并真实差异**

读取最新 `origin/main`、`AGENTS.md`、并行协议、R5.1/R5.2 已有工作流、当前独立工具与相关 SDK/Host。确认其他 Agent 正在写的精确文件。只列出**旧知识带来的新增真实缺口**，不重做会员 UI 或旧测试。

**Phase 1｜客户端可以独立完成的缺陷**

优先检查 `pending/uncertainKey` 仅页面内存、页面重开丢失未知事务、用户切换账号、预检 `Date.now` 与服务端时间偏差等实际问题。

若现有**已批准**存储和服务端状态查询可用，绑定 `toolId/packageHash/installEpoch/accountRef`，仅保存有时效的非敏感事务标识；提交前持久化，提交后未知不自动重发，只读服务器状态，失效后不继承。

若缺少权威状态接口，不伪称恢复成功；继续完成独立错误态与阻断逻辑，并列明精确 Provider 依赖。

**Phase 2｜生产会员合同接线**

与现有账号、SKU、Entitlement、商业 Provider Owner 的**真实合同**核对 `identifySession/readMember/previewVoucher/commitVoucher/readRedemptionStatus` 所需的语义。这些只是建议能力名，**不是让你新建 5 个正式 SDK API**。

优先复用现有 `OpenDeskSDK.browser`、权限、Host、认证路径及现有端点。缺失就保持 `PROVIDER_BLOCKED`，不能用 CSDN cookie/历史 todo6.com 登录接口填补。

**Phase 3｜链接 ticket 与代理边界**

采用正式短效一次性 ticket，区分宿主与工具已安装、工具未安装、宿主未安装三种路径。用户总是确认后才消费；无 ticket/安装合同时完成安全入口与错误态，不模拟成功。

继续复用既有 `src/ai-smart-access/` 可信 STOP/所有权/Worker 恢复；公共 Managed Proxy SDK 未获批准时保留原可信实现并标 `SDK_BLOCKED`。不增加第二个代理按钮，不让兑换自动启用代理。

**Phase 4｜定向验证、提交与交接**

只执行受影响定向 Node/独立工具打包与必要安全检查；同候选实际 BUILD / Native / Provider 分开记账。AdBlock pin 失败由原 owner 处理，不绕过。存在真实 Chrome/CFT 环境才进行原生安装/回跳/撤权等验收，无则 `NOT_TESTED`。

遵守最新 `main`、文件级所有权、并行 Git 事务、AGENTS 和用户现有 R5.2 授权；只提交自己真正修改的文件，不强推，不创建 branch/worktree/PR，不提供 ZIP/工具包/独立 HTML。

## 四、必须证明的用户场景（实施后才可标 PASS）

1. 链接收到 ticket → 必要安装/账号确认 → SKU 预览 → 明确确认；无票据/伪票据不消费。
2. 过期、重复使用、已入账、撤销及账号改变有明确且可验证的状态；`isused` 不是会员成功证据。
3. 兑换 POST 后断网、重启或关闭 → 不重发消费，按同一账号/事务服务端权威查询。
4. 身份退出、换账号、工具更新/卸载、撤销权限 → 不继续旧兑换意图。
5. 客户端时间偏差、旧回执晚到、代理 STOP、其他工具持有代理 → 会员业务与代理业务相互不越权。
6. 正式服务尚未配置 → 明确禁用、无假会员、无假成功；不把 Node 模拟通过记为 Provider PASS。

## 五、交付要求

先给一个**不超过一屏**的“已存在 / 新发现的缺口 / 此轮要修改的文件 / 阻塞依赖”摘要，然后直接继续 R5.2 的**实际源码实施**。不要再次仅交付新 GOAL。若并行文件冲突，只暂停该文件；其他代码与定向验证继续。

完成后给出：新增真实用户能力、仍阻塞的功能、精确源码文件、定向测试与构建/Native/Provider 的真实级别、commit 与 main 推送、下一轮最少剩余任务。

**专家方案静态目标 ≥95/100 ≠ 产品各维已达到 95 分。没有真实证据的维度必须 `NOT_SCORED`。**

**本 GOAL 的唯一新增价值：让早期 WebAppVip/CSDN 源码中已解决的用户场景发挥作用，同时不把旧风险迁移到现代 OpenDesk Browser。**
