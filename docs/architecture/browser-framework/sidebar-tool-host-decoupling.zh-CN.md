# Sidebar Tool 与 Browser Host 解耦合同：固定可信模块源码审计

> 状态：**CURRENT SOURCE AUDITED / RUNTIME DECOUPLING PARTIAL / NATIVE NOT_TESTED**。审计日期：2026-10-21；证据提交：`ba37bd6c69057402acc7f6130af6f6150b198ba1`（`main` 当时的代码快照）。本文件既记录事实，也制定下一阶段门禁；目标设计不是已实施功能。最新状态必须重新对照 `main`，不能由本文自动推断最新构建或 Mac Chrome PASS。

2026-10-31 的 Cookie 固定后台与开发来源检查增量见第 9 节；不追溯提升上述 AdBlock / Stay Focus 的原生证据。

## 1. 核心决定

**“业务源码移到工具目录”不等于“宿主没有应用耦合”，更不等于“应用业务可以只发 JSON 独立更新”。** 硬目标是：每个独立工具持有自身规则、状态、UI、数据迁移与已支持的声明式策略；通用 Browser 只持有单一 Browser SDK / Dispatcher / Host / Authority / Installer / MV3 Worker、受约束 Chrome Driver 与资源归属。新增某一普通工具，不应要求通用 `src/` 增加工具 ID、私有操作或卸载特例。

已经预编译、经审计的第一方适配器可以作为**现状兼容例外**继续运行，不能仅因移至 `examples/.../trusted/` 就宣布完成独立代码升级；也不能为追求解耦将安装包 JS 注入高权限 Service Worker、Side Panel 或 Content Script。**当前不另建第二套 SDK、Host、Worker、Installer、Registry 或后端运行平台，不拆独立仓库。**

四级能力必须分开报告：

| 层级 | 判定条件 | 当次观察 |
| --- | --- | --- |
| L1 源码归属 | 应用 UI、策略、模型和受审业务源码由 `examples/sidebar-tools/<id>/` 拥有 | AdBlock / Stay Focus 已达到主要源码归属 |
| L2 宿主编译解耦 | 通用入口、通用 UI / Installer 不硬编码应用 ID 或静态编译应用业务 | **两者未达到** |
| L3 已支持策略独立更新 | 浏览器构建及身份不变，只更新合法 JSON 策略，获准后原生效果发生且读回 | Stay Focus 有 `site-budget.v2` 数据合同；真实同宿主双包 Chrome 闭环仍待证据。AdBlock 当前过滤名单没有等效 JSON 合同 |
| L4 特权算法独立升级 | 只更新工具包即可替换新的受信后台 JS 或新的 Chrome 行为 | **当前不支持，也不以任意特权 JS 热加载作为目标**；新算法/新高权限原语仍需 Browser 发行版 |

## 2. 真实源码证据与剩余耦合

### AdBlock：业务已归位，但还有四个静态入口与专属生命周期

| 耦合点 | 源码事实 | 影响与结论 |
| --- | --- | --- |
| 后台服务 | [`src/sw.js`](../../../src/sw.js#L7-L9) 静态导入 `trusted/service.js`，第 32–33 行显式安装服务 | 修改过滤、DNR 业务服务必须重建 Browser；属于 L2 阻断，非普通 JSON 热升级 |
| Side Panel Host | [`src/entrypoints/sidebar-tool-host.js`](../../../src/entrypoints/sidebar-tool-host.js#L6-L8) 静态引用 AdBlock `policy`、`host-controls`、`tool-host`，第 25–30 行创建专属受信全局 | 宿主构建认识具体 AdBlock 方法，而非通用受控能力注册 |
| 页面注入 | [`src/entrypoints/page-relay.js`](../../../src/entrypoints/page-relay.js#L3-L16) 固定调用 `initAdblockCosmetics()`；[`trusted/cosmetic.js`](../../../examples/sidebar-tools/adblock/trusted/cosmetic.js#L2-L5) 内有特定网站与固定 CSS | 新页面逻辑或新增固定站点需 Browser 重构建；手动元素屏蔽的数据另存并不等于脚本热升级 |
| UI / 安装器 | [`src/ui/sidebar-tools.js`](../../../src/ui/sidebar-tools.js#L97-L125) 含 AdBlock 运行时身份检查、部分特殊设置分支；[`installation.js`](../../../src/ui/sidebar-tools/installation.js#L68-L72) 与第 207–210 行分别调用 AdBlock 停用/卸载适配器 | 安装器保留通用事务是正确的，但逐个硬编码产品适配器是 L2 维护耦合 |
| 发行来源 | [`scripts/bundle-provenance.mjs`](../../../scripts/bundle-provenance.mjs#L30-L58) 精确固定 12 个 AdBlock 可信源码 blob；[`trusted/service.js`](../../../examples/sidebar-tools/adblock/trusted/service.js#L62-L75) 校验内置官方资源 | 证明固定来源的安全栅栏，**不能为了消除耦合而删掉**；需要改为可审计的通用资源所有权和受限规则准入 |
| 发行状态 | 开发配置 [`tool.config.json`](../../../examples/sidebar-tools/adblock/tool.config.json#L1-L13) 为 1.2.2；快照正式 `adblock.opendesk-tool.json` 为 **1.2.1** | 不能把候选源码、正式 JSON、Worker 内置版本、Native 验证混为一项完成 |

AdBlock 的 DNR ID 属于 **741000–741199**，[`trusted/rules.js`](../../../examples/sidebar-tools/adblock/trusted/rules.js) 按该范围写入/读回；默认网络过滤域名仍来自静态 [`rules/domains.js`](../../../examples/sidebar-tools/adblock/rules/domains.js)。已提供按网站保存的例外及手动选择器（`opendesk.adblock.cosmetic.v1`）；这些**用户数据的独立保存**已经有代码，不表示默认过滤列表和新版 CSS/算法可以随工具 JSON 单独发行。不得把现有规则改成未审核的远端订阅或任意选择器/任意 DNR JSON。

### Stay Focus：R2 迁出源码，R4.x 公共原语部分落地

- `examples/sidebar-tools/stay-focus/trusted/` 是计时、产品策略、额度规则、DNR 与提示的真实受审业务目录；**快照中的 `src/stay-focus/` 已不存在**。早期 [R2 提取记录](../../framework/workstreams/stay-focus-extraction-r2-20261018.md) 提及的“兼容转发仍在”是历史状态，而非本次源码事实。
- [`src/sw.js`](../../../src/sw.js#L7-L8) 和第 32 行仍静态加载 `installStayFocusService`；[`src/entrypoints/stay-focus-controls.js`](../../../src/entrypoints/stay-focus-controls.js) 是专属 Side Panel 接线；[`src/entrypoints/page-relay.js`](../../../src/entrypoints/page-relay.js) 注入 `installFocusPageNotice`；[`installation.js`](../../../src/ui/sidebar-tools/installation.js) 显式调用 Focus 清理；[`src/ui/sidebar-tools.js`](../../../src/ui/sidebar-tools.js#L97-L125) 仍有 `focus.control` 专用检查。
- 已抽取公共部分：[`src/platform/chrome/browser-managed-site-policy.js`](../../../src/platform/chrome/browser-managed-site-policy.js) 提供前台观察、原生 DNR 对账、Alarm 与已开标签页补救；[`managed-site-lifecycle.js`](../../../src/platform/chrome/managed-site-lifecycle.js) 提供事件订阅；[`managed-site-authority.js`](../../../src/platform/host/managed-site-authority.js) 校验安装租约。
- [`background-policy.js`](../../../src/ui/sidebar-tools/background-policy.js) 已校验 `site-budget.v1/v2` 的有界 JSON；[`managed-site-runtime-contract.js`](../../../src/platform/host/managed-site-runtime-contract.js) 明确 `privilegedJs === false`，仅允许 Worker 已理解的策略种类。这是**声明式数据升级**的基础，而不是完整公共多应用后台 SDK，更不是新算法可热更新的证明。
- 当前 [`tool.config.json`](../../../examples/sidebar-tools/stay-focus/tool.config.json) 为 **1.0.9**，带 `site-budget.v2`；本次目录核查未找到根目录唯一正式 `stay-focus.opendesk-tool.json`。固定可信服务和全套原生 Chrome 安装/升级/额度耗尽证据不能仅凭当前配置推断为完成。

Stay Focus 的 DNR ID 是 **730000–730199**，与 AdBlock 不重叠；跨工具停用/卸载必须按独立租约与原生读回确认，不能用清空全局规则或重置所有存储“简化”代码。

## 3. 现有文档覆盖与缺口

相关但各有范围的文档已经存在：

- [Stay Focus R2 源码提取](../../framework/workstreams/stay-focus-extraction-r2-20261018.md)：确认业务搬迁，并明确静态 Worker 未解耦。
- [Stay Focus R4.4 公共后台](../../framework/workstreams/stay-focus-r44-web-runtime-20261019.md) 与 [R4.6 原生能力对账](../../framework/workstreams/stay-focus-r46-runtime-20261019.md)：确认部分受管 Chrome 原语共用，仍保留固定专用服务。
- [五种扩展场景](../../api/extension-development-selection.zh-CN.md)、[Sidebar Tool 开发规范](../../api/sidebar-tool-development.zh-CN.md)、[Skill 路由](../../../.agents/skills/README.md)：规定运行世界、可信来源及打包分工。

此前缺少的是**覆盖 AdBlock 与 Stay Focus 的同一份、按源码证据区分 L1/L2/L3/L4、明确残余耦合、下一阶段架构和验收门槛的跨工具合同**；本文件补足该索引与执行门禁。历史工作记录保留其当时状态，不批量改写为“目前已完成”。

## 4. 最小可行的框架解耦路径

**P0｜冻结业务回流、保留安全**：新功能先核对唯一 SDK 和原安装器。新增业务或默认域名/策略/文案应进入独立项目；不得再把它们复制到 `src/` 通用 UI / Installer。新平台 API 必须先有通用需求、来源/版本校验、资源归属及多个消费者的复用理由。现有固定产品导入列为迁移债务，不直接删去而导致保护功能停摆。

**P1｜在现有 SDK / Host 内补受限能力，而不是新建平台**：完整路线为 `Browser SDK Registry/Schema → 原 Dispatcher/Broker → Authority(工具安装身份+packageHash+epoch+网站授权) → 已存在的 Chrome Driver/Worker → 原生读回/Stop`。公共职责应包括受管订阅、事件恢复、资源命名空间、带代际撤权的 DNR/Alarm/存储操作及清理回执。任何宣称“已开放的 SDK 方法”，须在公开文档、Registry/Schema、Host/Driver、负例测试中全部存在；仅有内部 `src/platform/` 原语不是 API 发布。

**P2｜应用策略以可校验数据独立发行**：Stay Focus 优先验证同一 Browser 构建跨两版 `site-budget.v2` 更新默认建议、额度及时段且不覆盖用户已有配置；AdBlock 可评估有界离线网络过滤集与受限 cosmetic selector 策略包，而不是原样允许任意 Chrome DNR、JavaScript、远程规则或 CSS。规则 Schema 必须控制容量、目标主域、发起域、可执行动作、优先级及所有权，与既有规则 ID 段和权限兼容。无明确公共价值不必强求两种产品共用同一“万能策略模型”。

**P3｜迁移固定入口与生命周期接线**：通用入口只消费经审计的**能力声明和已经批准的策略**；工具特有模型/解释器保留产品所有权。逐步消减 `sw.js`、`page-relay.js`、`sidebar-tool-host.js`、`sidebar-tools.js`、`installation.js` 的逐 ID 分派；优先复用原 Installer 的 Stop/清理日志和原 Authority，不创建第二个“插件注册器”。对于暂时不可用公共能力表达的特权算法，保留现有固定受审代码并标明 `BROWSER_RELEASE_REQUIRED`，**安全优先于表面的零静态 import**。

**P4｜以真实行为放行，而非目录检查**：每次迁移比较原版与新路径的授权、安装、更新、启停、原生 DNR、Chrome 重启、用户数据兼容、撤权 epoch、双工具互不清理及结果未知恢复。新功能如果仍要改宿主专属分支，不得声称已达 L2；只改 JSON 无原生读回不得声称 L3。真实 Chrome/ Mac 凭据未取得标 `NOT_TESTED`。

## 5. 可直接复用的评审与验收清单

- **Ownership**：改一个普通工具 UI/默认业务策略，不修改通用 Installer/SDK/Host；只有证实公共缺口才允许有限 `src/` 改动。
- **Portability**：用同一个 Browser build / extension ID 验证旧→新应用 JSON，记录每项变化属于“UI / 数据策略 / 固定后台算法”；独立策略更新不得覆盖现有用户设置。
- **Authority**：伪造同 ID 包、旧 hash/epoch、未授权来源、禁用后 RPC、非真实手势、版本不兼容及非法 DNR/selector 声明均拒绝；不能从工具 iframe 获取 Chrome 原生权限。
- **Lifecycle**：退出工具 UI 后已授权服务仍按真实 Chrome 事件恢复；Stop、撤权、卸载只影响自身资源；清理失败写入可恢复记录，不报告成功或盲重试未知写入。
- **Isolation**：Stay Focus 730000–730199、AdBlock 741000–741199；不能清理对方范围，不覆盖其它工具存储，不因一个应用的异常关闭全局能力。
- **Release proof**：分别保存 `SOURCE_REVIEWED`、`NODE_PASS`、`BUILD_PASS`、`PACKAGE_PASS`、`CHROME_NATIVE_PASS`、`MAC_NATIVE_PASS`，每份与单一提交/包 hash 绑定；未执行就是 `NOT_TESTED`，**不填“专家 95+ 已通过”**。

## 6. 本轮实际交付边界

本次仅核查源代码并更新文档/Skills，**不修改 AdBlock/Stay Focus 业务、Browser 运行入口、权限、包、DNR 策略或已安装用户数据**，不声称已去除第 2 节的耦合。下一次实施从 P0 源码不回流防护、AdBlock/Stay Focus 真实业务迁移优先级开始；不得先推翻已正常工作的受审可信服务。

## 7. R1.4 公共后台能力实施记录（2026-10-21，覆盖上方历史阶段说明）

Browser main 已提交公共 `site-budget.v2` **源码候选**（首提交 `c6c979e8fb4f37e43e52c9d42ca6d3ff8f6ffa9e`）：`src/platform/chrome/browser-managed-site-budget.js` 是唯一 MV3 Worker 的受审固定执行器，沿用 SDK Registry/Schema、侧边栏可信 Host、Installer、Authority 和每工具 Web Lock；`src/platform/chrome/browser-managed-site-policy.js` 保留原有保守计量。安装工具拥有其包摘要、来源与撤权 epoch；共享资源账本校验所有者和 DNR 自有区间。公共规则优先级 10，位于 AdBlock allow=2 与 Stay Focus redirect>=20 之间，既有 730000–730199、741000–741199 保留。无沙箱 JS 获得特权 Worker 执行能力。

- 普通应用只声明 `browser.siteBudget` 和 `backgroundPolicy.kind='site-budget.v2'`；最多 40 个经过审核的网站，数据模板不是用户批准，UI 通过 `OpenDeskSDK.browser.siteBudget.getStatus()` / `setPolicy({enabled,dailyMinutes,sites,schedule,expectedRev})` 与原可信 Host 确认更新。更新网站与时段不要求在 Browser 注册应用 ID。网站需出现在安装包 `suggestions` 且 `suggestLimit=true`，新版本撤销网站范围时自动停止旧生效意图而保留原数据。
- 受控 DNR 区间由 Host 分配，单个策略只编译已有固定阻断动作；持久化 `desiredPolicyRev/appliedPolicyRev/status`，原生 DNR/Alarm 回读与存储记录分开核对。已停用、撤权、来源改变或卸载只清理自身，未知效果不得报告成功。
- Stay Focus 与 AdBlock 第一方固定执行器**继续保留**，尚无正式生产所有权切换。公共预算不是任意过滤、共享分组、UI picker、CSS 或新算法的通用特权执行器。
- **证据状态**：`SOURCE_COMMITTED`；`NODE_PASS`、`BUILD_PASS`、`B0_FROZEN`、`CHROMIUM_NATIVE_PASS`、`MAC_NATIVE_PASS` 在获得与同一候选绑定的实际报告前均为 `NOT_TESTED`。定向测试入口 `tests/environment/managed-site-budget-r14.test.mjs`；GitHub 工作流 `.github/workflows/site-budget-r14.yml` 输出的产物是 B0 **候选**，尚不能宣称已由 Chrome 实际加载。固定 B0 后，才在普通应用项目确定新的验收应用 ID、发行 1.0.0/1.0.1 并执行真实安装升级闭环。

## 8. R1.10 局部源码实施记录（2026-10-24）

> 状态：**v3 应用授权状态链已修复；旧 Focus → v3 完整安装迁移仍 BLOCKED；未进行 Mac Chrome Native 验收。** 本记录只覆盖实际提交，不将测试源码提交解释为测试 PASS。

- 公共 v3 Host 范围记录现在可只读核实当前 `toolId + installEpoch + packageHash` 是否拥有非空、结构合法的网站审阅记录；错误、伪造代际、被撤权、错包 Hash 全部返回否，不允许用 Chrome 全局 `<all_urls>` 替代。源码：`src/framework/host/managed-site-reviewed-scopes.js`。
- 公共 v3 Driver 的 `getStatus/setPolicy` 回执加入 `siteReviewActive`：只有当前真实安装租约有效、所需网站范围与 Chrome 访问范围核实通过且仍存在当前应用授权记录时才为 true。实际 DNR 生效仍由原有 `appliedPolicyRev/status` 和原生读回独立判定。源码：`src/platform/chrome/browser-managed-site-budget.js`。
- 应用 `FocusController` 不再从已封存的旧 `authorizedHash` 推断 v3 用户授权，使用 Driver 回执；后续变更显式不再把旧授权 Hash/Epoch 写入 `sealedModel`。源码：`examples/sidebar-tools/stay-focus/trusted/focus-controller.js`。
- 增加三个定向测试文件的断言，覆盖错误授权、撤权与 Epoch 更换、用户 STOP 后授权状态，以及应用封存模型不重复携带旧授权。**当前仅确认测试已提交，未取得这些测试在相同候选上的终态 PASS**：`tests/environment/managed-site-v3-scope-r18.test.mjs`、`tests/environment/managed-site-budget-r14.test.mjs`、`tests/environment/stay-focus-app-controller-r17.test.mjs`。
- 相关提交：`c97be9c`、`bf3ed32`、`0ab701b`、`708dedd`、`0514c97`、`cb30788`。由于并行 Agent 可能持续更新 `main`，这些提交是本条证据，不是固定最终 HEAD。

**尚未完成，不得冒称本轮已修复：** 旧 `focus.control → browser.siteBudget` Installer 安全迁移事务、隔离迁移算法入口、原生 DNR/Alarm 安全移交、正式 v3 包和旧 Service 退休、Browser 编译图去 Focus 私有依赖、可信 Ed25519 生产发行公钥/Marketplace 来源、B0 冻结及仅更换独立 Focus 包的 Chrome 原生行为差异证明。保留 `E_MIGRATION_REQUIRED` 安全拦截和旧 Service，不得为交付表面解耦而先删除。

**下一处 P0 实施点：** 在同一 Installer 操作锁与事务日志内，取得有效旧安装的原始 `FOCUS_STORE`、旧包 Hash、撤权 Epoch、来源及原生规则快照，在既有隔离 Sandbox 中运行应用自有 `migrateFocusState`，用公共 v3 Schema 验证策略、用量、Clock、Checkpoint、Notices 并构建幂等升级检查点；完成真实新账本与 DNR/Alarm 交接及来源读回后才提交成功并退休旧服务。期间不在特权安装器执行候选应用 JS，不新增第二套 Runner。

## 9. Cookie 固定后台与日常开发来源检查（2026-10-31）

**结论：当前 Cookie Editor 是沙箱 App 与固定可信账号服务的组合，后台没有独立安装升级。** 在 `6743105031541a43ef00933b0ee17c2790ee8951` 的 `main` 实读，`src/entrypoints/background.js → src/sw.js:12 → examples/sidebar-tools/cookie-editor/trusted/account-service.js` 仍是静态依赖。后者导入 Vault、分享及设备会话加密、服务连接/会话、账号合同和 `app/domain/account-switch-url.js` 的纯 URL 校验；未导入 App 的 JSX、界面 CSS、配置或正式 Tool JSON。业务文件在应用目录，仍可属于共享编译图。

### 引入目的与后续扩张

- **2026-10-26 22:53:04 +08:00，`c3a29ea83`**：新增固定后台账号服务；**22:58:36，`43c74167a`** 将其接入现有 SW。初始代码已含账号快照、精确 Cookie 切换与导航事件，意图是 UI 关闭后仍由可信后台处理批准的自动切换，而非让普通 App 代码取得 Chrome 权限。这证明实现意图；本轮未读取原会话的完整批准记录，不把提交或 `trusted/` 名称当作全部业务均获授权的证据。
- **同日 23:14:24，`f5f63ad4c`** 已修过账号服务导入安装器的耦合；因此初版并非没有架构问题，但静态注册本身不等于算法故障。
- **2026-10-30，`6c80dec1e` / `d408faff4`** 加入配置分享和加密设备会话；**2026-10-31，`20b0d67d3`** 保存并合入服务连接/Native 消费者。这些模块扩大了固定可信代码范围，修改后仍需 Browser 更新，不能用“只改应用目录”宣称后台独立发行。额度采集/报表与 Node 管理服务仍归 Cookie 项目，不进入 SW。

### 可信执行、后台生命周期与普通业务分别判断

**需要可信执行不等于必须在 SW。** 是否需要后台应由关闭 UI 后仍须响应的事件、任务及收尾生命周期证明；权限、私有持久化、密钥和未知结果账本各有可信必要性，不能把它们当作整块前台业务必须 SW 的依据。展示、草稿与流程选择应逐步交还业务 App；静态可信 UI 搬迁只减少后台职责，不等于安装包可替换固定算法。Cookie 的逐模块判断与本轮实现只维护在[项目 README](../../../examples/sidebar-tools/cookie-editor/README.zh-CN.md#sw-职责精简展示模型已退出后台2026-10-31)。

| 行为 | 当前边界与复用判断 |
| --- | --- |
| 普通 App 的打开、安装/升级、HTML/React/CSS、展示/交互模型和配置更新 | 原沙箱、工具打包/本地调试与安装器；不执行包内特权 JS，不要求为新 App 注册 SW。官方目录/JSON 数据发布和固定运行时代码发布分别处理 |
| 已授权 Cookie 的列表、编辑、导入/导出、清理与有界观察 | 复用公开 `OpenDeskSDK.browser.cookies.*`；不为业务另加 Chrome Driver 或 Host 分支 |
| 关闭 UI 后的自动切换、快照恢复、撤权、卸载与未知 Cookie 写入围栏 | 当前固定账号服务检查真实安装/来源、Host Document、Origin、Store/Partition、授权代际及读回；沙箱定时器或普通存储不能替代这些职责 |
| 私有快照、设备密钥、邀请管理秘密、加密交付与未知网络结果账本 | 当前可信 Vault/设备密钥与固定分享消费者；不能为了移出编译图，把秘密交给 App 或把动态 JS 放入 SW |
| Native 连接与受限管理页 | 固定消费者持有真实传输租约和未知操作账本；表单、显示模型与公司/额度业务留原应用/Node 项目。此处不是通用 Host 对任意 Cookie 业务的授权 |

公开 [Sidebar Tool 合同](../../api/sidebar-tools.zh-CN.md) 与 `src/framework/sdk/browser-contract.js` 已有 Cookie CRUD/观察；`cookieAccount` 内部操作及 `trusted/account-contract.js` 不是公开 SDK。App Service 的 `files.background` 也不授予 Chrome/Vault/Native 特权。**完全替代固定账号服务的新公共能力仍为 `SDK_GAP_NOT_PROVEN`**：本轮没有证明可跨工具复用的新 Vault/自动切换 API，也没有批准新的权限/密钥、后台生命周期、撤权和 unknown 合同，故不新增 API、注册器或运行器。需要这类扩展时，须另给公开合同上的可复现缺口、跨工具消费者及最小权限/生命周期方案，不能仅凭“希望移除 import”放行。

### 首轮来源守卫修复及证据边界

`scripts/bundle-provenance.mjs` 的 `recordBundle()` 原来在没有 `OPENDESK_MODULE_EVIDENCE_DIR` 时直接返回；日常 serve 因而跳过其精确来源、目标和 pin 检查。**旧 pin 不能证明开发中间态一定被拦截。** 本轮将同一 `describeBundle()` 检查前移到可选证据写盘之前：现有 WXT `generateBundle` 在输出固定文件前检查，未审核字节、错误目标、应用源码越界、符号链接和缺失 npm 锁仍拒绝；正式构建继续独占写入原证据文件。没有修改任何来源 pin、Cookie/S3 实现或运行时刷新条件。

回归位于根 `tests/environment/cookie-account-provenance-r134.test.mjs`，属于公共固定入口/来源边界：无证据目录的拒绝路径先复现 FAIL，修复后 10 项通过，并直接调用现有 WXT 输出钩子验证拒绝；该调用不是完整构建或 Chrome 发布。另定向执行 `bundle-provenance.test.mjs` 的模块/npm/失败回执/收集 6 项及 `wxt-official-resource-update.test.mjs` 的普通源码发布、正式包晋升 2 项，分别通过；不将它们合写为业务验收。业务测试仍归 Cookie 项目。本轮**未移除运行依赖，也未新增独立升级能力**；实际改进是让开发构建不再跳过既有可信来源检查。既有普通 App 的独立 UI/包更新路径继续使用原机制，共享纯 URL 合同与固定可信算法变更仍需 Browser 更新。

源码级递归展开仅用于追踪 owner；它也会包含可能被 Rollup 摇树移除的导入分支。本轮这类展开中的 `prompt-shortcuts/trusted/asset-contract.js` 被 SW 目标拒绝；由于该诊断没有实际产物图，不能据此报告当前 WXT 构建失败、放宽白名单或修无关工具。固定入口准入仍使用真实 `chunk.modules`。

未启停 watcher、未写 `dist/development`、未安装/重载 Chrome；`BUILD_PASS`、真实 serve 发布、Chrome 应用与原生账号流程均为 `NOT_TESTED`。2026-10-30 中间磁盘候选发布与侧栏关闭只有时间关联，缺少直接 `chrome.runtime.reload` 证据，不能据此认定构建发布导致关闭，更不能称两个普通已安装应用运行冲突。

### 接续实现：将展示合成移出 SW（同日）

Cookie 的两个固定服务现只返回经过核验和脱敏的内部事实 DTO，原可信 Host 用项目的 `trusted/service-view.js` 恢复原 App 返回形状。新展示模块只有该 Host 的精确来源准入，拒绝进入 SW；原后台权限、存储事务、租约、撤权、未知操作和受限管理 URL 校验保留。没有删除现有账号服务静态注册或 Vault/分享/Native 导入，**尚未实现 App 包独立升级**。五份受影响行为检查96项、公共来源边界10项通过，另1项原分享Host转发检查通过；隔离 Cookie 组件减少1151 B，不代表完整 SW/WXT 或 Chrome PASS。实施细节和模块必要性以项目 README 为准，执行边界见[本轮记录](../../framework/workstreams/cookie-editor-react-shared-ui-20261017.md#2026-10-31-增量sw-展示职责拆分)。
