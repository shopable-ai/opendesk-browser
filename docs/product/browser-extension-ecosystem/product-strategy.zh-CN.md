# 三路线产品战略与发行决策

> 基线：2026-10-12，研究方案。A、B、C 是产品与分发路线，不等于三个独立运行时；以既有受信 Host/Authority/SDK/Page/Task 为中心。

## 1. 产品定位与业务边界

| 路线 | 主要使用者/单一核心价值 | 主要交付 | 可收费的价值 | 硬边界 |
| --- | --- | --- | --- | --- |
| A 通用工作台 | 开发者及主动安装工具的用户；编写、运行、管理自己的浏览器功能 | 一个 OpenDesk 扩展 + 本地工具市场 | Pro 调试/备份/团队管理/企业支持 | 工具 iframe、Page 与 Controller 不相互继承特权 |
| B 行业独立扩展 | 明确岗位或单一工作流程；快速完成一类专业任务 | 每个产品独立 ID/Manifest/品牌/版本/隐私页 | 行业席位、售后、工作流 SaaS | 不要全部复刻 OpenDesk 主工作台；不能换皮骗上架 |
| C 网站脚本生态 | 用户/开发者；一键增强某类页面 | 版本化 .user.js / Page UI / 市场 | 作者工具、维护服务、可选云同步 | USER_SCRIPT API 受限，不继承 Controller/Host |

## 2. 三条路线完整功能树

```text
OpenDesk Product Ecosystem
├─ A 通用平台：工具 / 开发 / 工作流 / 安装更新
│  ├─ Browser SDK / Host / 权限 / 任务 / Page UI
│  ├─ 工具目录：阅读 / Cookie / 标签 / 截图 / 备份 / 隐私
│  ├─ 本地开发：零参数 Controller / JS / JSX / SFC
│  └─ 市场交接、版本管理、诊断与质量治理
├─ B Extension Factory：按单一用途独立发行
│  ├─ ProductConfig / FeatureModules / ManifestPlan
│  ├─ ProductBuild / TestEvidence / StoreReview
│  ├─ 独立身份、版本、存储、最少权限、发行通道
│  └─ 行业产品：QA、SEO、卖家、研究、企业等
└─ C UserScript / Website Tools
   ├─ 元数据、@match、@grant、更新审核、依赖锁
   ├─ Page USER_SCRIPT、React/Vue 编译、脚本数据分区
   ├─ GM G0→G1→G2 分级（绝不等同 Chrome 全权限）
   └─ 网站脚本目录、作者、安全审核、安装与撤销
```


### A：通用工作台优先补齐
- 可解释的工具权限说明和随用随授权；已安装工具分组、搜索、停用、回滚；储存使用量、健康诊断；升级差异；官方内置与社区工具严格区分。
- 任务/定时、受控 Browser SDK、当前页面 UI、零参数本地开发、JS/JSX/SFC 自动准备、结果/错误追踪、可信市场安装交接；不将每个功能塞入常驻 SW。
- 普通用户可见的工具和核心“平台”必须分离：`src/ui/sidebar-tools/package.js` 的 Tool iframe ≠ 完整 Chrome 权限；`src/scripting/user-scripts/` ≠ Controller Runner。

### B：Extension Factory
- 产品研究 → 用户验证 → 窄用途 PRD → `ProductConfig` → Feature 依赖图 → 权限/资源预算 → 独立 Manifest/ZIP → CFT/E2E → 法务/隐私审核 → CWS 人工首发 → 版本化维护。
- 可复用包：Browser SDK、Host/Authority、最小 Chrome adapters、持久化、Page UI、任务、设计 Token、日志；**每种产品的授权与存储必须独立**。
- 对站点/行业适配采用可插拔静态 module + CI fixture；不存在“更换名称即成为新产品”的自动判据。

### C：UserScript / Website Tools
- 脚本/元数据/URL 匹配 → 有界预览和依赖锁 → 安装对话与授权 → USER_SCRIPT 真正注册 → 状态对账 → 自动运行/停用 → 更新差异审查/回滚 → 作者发行/失效处理。
- 开发：单文件 JS、零参数 Controller、Page JS、React/Vue 的可信离线编译及多文件 ESM；源码锁定+清晰日志，React/Vue 不是跨世界共享 chrome.*。
- 市场：作者验证、许可证、信誉、每次更新安全检查、网站故障工单、恶意版本阻断、撤销；先从小规模人工精选目录开始。

## 3. 用户需求如何选择架构？

| 需求判别 | 应选方案 | 触发升级的条件 | 不允许偷换的实现 |
| --- | --- | --- | --- |
| 仅匹配一两个网页，修改 DOM/样式，不要浏览器特权 | C · Page UserScript | 需要可分享/版本更新则在 C 市场发布 | 不可通过网站注入获取 chrome.cookies/tabs |
| 需要 OpenDesk 侧栏入口、受控存储、当前页读取或已有 Runner | A · OpenDesk 工具/Task | 需要普通用户独立安装并能说清单一用途才考虑 B | Side Panel 工具 iframe 不等于 extension trusted host |
| 明确用户群+狭窄目的+独立品牌/获客/版本+不同权限预算 | B · 独立扩展 | 具持续高频需求和用户验证才上架 | 不允许纯换标、克隆目录和过度权限 |
| 需要公开价格历史、服务端抓取/队列、OAuth、多用户团队协作、远端计算 | 配套 SaaS；可搭配 A/B/C 前端 | 数据合规、API 预算、隐私/合同/运维 SLO 已通过 | 不要把服务器端数据源伪造成扩展已有能力 |
| 需要大量细微网站差异，但相同操作主线 | C 内网站 Adapter 集合 | 若某行业独立目的被用户验证，再抽 B | 不要每个站点一个 CWS 换壳应用 |

## 4. 分发模式对比
| 模式 | 适用情景 | 优势 | 成本 | 主要风险 |
| --- | --- | --- | --- | --- |
| 单一 A 总平台 | 开发者需要多工具且自主安装 | 分发和运行底座统一 | 权限审核/模块隔离/UI 复杂 | 过度权限、商店单一用途争议 |
| 按行业 B | 行业内部几个功能共同服务一个狭窄目的 | 品牌和定价贴近岗位 | 每个产品有版本、支持和审核 | 行业 DOM/隐私/维护成本 |
| 按单用途 B | 截图、SEO 页面检查、QA 调试等明确目的 | 权限最少、容易被理解 | 同类功能归组需要取舍 | 过多相似品触发重复内容规则 |
| B 内可选模块 | 同一用途内部扩展相近流程 | 用户按需启用，体积可控 | 打包剪裁、依赖验证 | 不能通过远程脚本变相增加特权功能 |
| C 大量网站脚本 | 长尾 DOM 增强/页面交互 | 验证快、迭代快 | 单站适配与审核成本 | 网页变化、恶意脚本与 URL 匹配 |

官方 `Single Purpose` 并不等于“只能有一个按钮”：同一狭窄领域的一组功能可能符合单一用途，但必须一致、必要；见[质量 FAQ](https://developer.chrome.com/docs/webstore/program-policies/quality-guidelines-faq)。[重复内容规则](https://developer.chrome.com/docs/webstore/program-policies/spam-faq)判断的是用户体验，不只判断代码是否相同；特定 Host、企业私有分发等例外有明确条件，不能自动套用。

## 5. 商业化与冲突治理

- A：免费 JS/Page 核心；收费候选为团队审计、长期日志、同步、标准技术支持和可选云服务。付费功能不应隐藏用户已授权的数据，也不靠“把免费工具失效”为增长设计。
- B：行业 Pro、团队账号、企业分发及部署、垂直 API 集成；定价在访谈、真实愿付测试前不设虚假的市场平均。
- C：免费开放元数据与脚本执行、收费作者工作台/脚本质量服务、可选团队分发/可信更新；保证开源许可证与作者权益。
- 购物联盟是独立账：需在 CWS 页面、安装前和 UI 明示；每次加入联盟链接/代码/Cookie 前有相关用户动作，且当下有直接、透明收益。不得静默覆盖别人联盟归属。见[Affiliate Ads](https://developer.chrome.com/docs/webstore/program-policies/affiliate-ads)。
- 数据原则：默认本地、最少访问；明确云端传输范围；企业财务/医疗/人事等敏感数据的持续收集和用途严格按[Limited Use](https://developer.chrome.com/docs/webstore/program-policies/limited-use)审查。
- 获客成本、留存、单用户每月维护/支持成本、毛利均为 `NOT_MEASURED`；第一个付费 MVP 后再建立真实成本表。

## 6. 决策门（未通过不能宣传完成）

`用户高频痛点证据` → `独立用途与竞品差异` → `数据来源与授权合法` → `最小权限及供应链` → `独立 Chrome 运行与失败回滚` → `CWS/法律审查` → `付费验证`。任何一项 `BLOCKED`，停止上线，不以综合分抵消。
