# Sidebar Tool 与 Browser Host 解耦合同：AdBlock / Stay Focus 源码审计

> 状态：**CURRENT SOURCE AUDITED / RUNTIME DECOUPLING PARTIAL / NATIVE NOT_TESTED**。审计日期：2026-10-21；证据提交：`ba37bd6c69057402acc7f6130af6f6150b198ba1`（`main` 当时的代码快照）。本文件既记录事实，也制定下一阶段门禁；目标设计不是已实施功能。最新状态必须重新对照 `main`，不能由本文自动推断最新构建或 Mac Chrome PASS。

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
