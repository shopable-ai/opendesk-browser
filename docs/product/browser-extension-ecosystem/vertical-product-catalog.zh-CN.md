# 12 行业产品与 84 个候选功能

> 本文件是**产品机会目录**，不表示 OpenDesk 已实现这些功能。机器可读单条记录、隐私和来源见 [opportunity-register.json](opportunity-register.json)，不要在本 Markdown 中维护第二套独立 ID。每行业 7 个候选，不是 7 个立刻要实现的插件。独立发行前必须通过用户价值、CWS 单一用途、最少权限三门。

## DEV · 开发者、测试与 QA

- **用户**：前端工程师/测试工程师。**高频痛点假设**：反复手动检查页面状态、复现表单与定位异常。
- **目标系统/网站**：企业授权的测试站、localhost、开发环境（仅在用户批准后访问）。站点只是研究样例，不自动授予 Host 范围。
- **竞品/替代品**：[Requestly](https://requestly.com/products/http-interceptor/)、[Selenium IDE](https://www.selenium.dev/selenium-ide/)、[Wappalyzer](https://www.wappalyzer.com/)。
- **R8 关联**：[AUTO-002](https://github.com/shopable-ai/opendesk-browser/blob/main/docs/product/browser-automation-feature-catalog-r8.zh-CN.md)、[DEV-009](https://github.com/shopable-ai/opendesk-browser/blob/main/docs/product/browser-automation-feature-catalog-r8.zh-CN.md)、[SEC-014](https://github.com/shopable-ai/opendesk-browser/blob/main/docs/product/browser-automation-feature-catalog-r8.zh-CN.md)；关联不代表对应代码已能执行。
- **商业化**：免费核心 + 团队测试报告订阅。**适配维护**：中高：站点与 Chrome API。**MVP 判断**：优先深入研究，先做 1 个狭窄工作流。

| 稳定 ID | 功能候选 | 要解决的痛点 | 建议分发 | 风险 | 频次假设 |
| --- | --- | --- | --- | --- | --- |
| OPP-001 | DOM 定位器检查 | 排查选择器不稳定、元素难以定位 | UserScript | low | daily（未证实） |
| OPP-002 | Cookie / Storage 授权编辑 | 调试会话与本地状态耗时 | OpenDesk 工具 | high | weekly（未证实） |
| OPP-003 | 表单 QA 回放 | 重复填写测试表单效率低 | OpenDesk 工具 | medium | daily（未证实） |
| OPP-004 | 无障碍可用性现场检查 | 页面缺乏快速 a11y 提示 | UserScript | low | daily（未证实） |
| OPP-005 | API 请求差异对照 | 请求版本差异难以比较 | OpenDesk 工具 | high | daily（未证实） |
| OPP-006 | 页面截图差异检视 | UI 回归难以发现 | 独立扩展 | medium | weekly（未证实） |
| OPP-007 | HTTP 测试头配置 | 测试环境切换容易出错 | 独立扩展 | high | weekly（未证实） |

## SHOP · 电商购物与优惠

- **用户**：普通购物消费者。**高频痛点假设**：真实到手价难算、历史价不可见、优惠码真实性差。
- **目标系统/网站**：商家商品页/结算页（逐店授权）。站点只是研究样例，不自动授予 Host 范围。
- **竞品/替代品**：[Keepa](https://chromewebstore.google.com/detail/keepa-amazon-price-tracke/neebplgakaahbhdphmkckjjcegoiijjo)、[Honey](https://www.joinhoney.com/)、[Capital One Shopping](https://capitaloneshopping.com/)。
- **R8 关联**：[ECO-003](https://github.com/shopable-ai/opendesk-browser/blob/main/docs/product/browser-automation-feature-catalog-r8.zh-CN.md)、[SEC-014](https://github.com/shopable-ai/opendesk-browser/blob/main/docs/product/browser-automation-feature-catalog-r8.zh-CN.md)、[INS-011](https://github.com/shopable-ai/opendesk-browser/blob/main/docs/product/browser-automation-feature-catalog-r8.zh-CN.md)；关联不代表对应代码已能执行。
- **商业化**：可选 Pro 价格提醒；联盟合作须单独审核披露。**适配维护**：高：商品标识、价格合法来源和联盟合规。**MVP 判断**：进入候选池，需用户访谈/合法数据与合规评估。

| 稳定 ID | 功能候选 | 要解决的痛点 | 建议分发 | 风险 | 频次假设 |
| --- | --- | --- | --- | --- | --- |
| OPP-008 | 商品历史价格 | 促销价缺乏历史依据 | 云端/SaaS | medium | weekly（未证实） |
| OPP-009 | 跨店同款比价 | 同款规格和物流费用难对齐 | 云端/SaaS | medium | weekly（未证实） |
| OPP-010 | 实际到手价计算器 | 税费、运费与优惠条件分散 | UserScript | low | weekly（未证实） |
| OPP-011 | 手动优惠码核验 | 大量过期或无效优惠码 | 独立扩展 | high | weekly（未证实） |
| OPP-012 | 降价与到货提醒 | 人工反复打开商品页查看价格 | 云端/SaaS | medium | weekly（未证实） |
| OPP-013 | 购物清单与规格记录 | 跨网站决策信息容易丢失 | OpenDesk 工具 | low | weekly（未证实） |
| OPP-014 | 商品来源和商家透明度提示 | 用户难判断标价及商家身份 | UserScript | medium | weekly（未证实） |

## SELLER · 电商卖家与运营

- **用户**：中小商家/运营分析师。**高频痛点假设**：商品上架校验、SKU 数据核对、竞争页面变化费时。
- **目标系统/网站**：获授权的 Shopify、Amazon Seller Central、商家后台。站点只是研究样例，不自动授予 Host 范围。
- **竞品/替代品**：[Helium 10](https://www.helium10.com/tools/product-research/chrome-extension/)、[Jungle Scout](https://www.junglescout.com/)、[Keepa](https://chromewebstore.google.com/detail/keepa-amazon-price-tracke/neebplgakaahbhdphmkckjjcegoiijjo)。
- **R8 关联**：[AUTO-008](https://github.com/shopable-ai/opendesk-browser/blob/main/docs/product/browser-automation-feature-catalog-r8.zh-CN.md)、[DEV-003](https://github.com/shopable-ai/opendesk-browser/blob/main/docs/product/browser-automation-feature-catalog-r8.zh-CN.md)、[SEC-001](https://github.com/shopable-ai/opendesk-browser/blob/main/docs/product/browser-automation-feature-catalog-r8.zh-CN.md)；关联不代表对应代码已能执行。
- **商业化**：按账号/团队订阅与企业内部部署。**适配维护**：高：多个后台 DOM、平台条款和数据源。**MVP 判断**：优先深入研究，先做 1 个狭窄工作流。

| 稳定 ID | 功能候选 | 要解决的痛点 | 建议分发 | 风险 | 频次假设 |
| --- | --- | --- | --- | --- | --- |
| OPP-015 | 商品 Listing 完整性清单 | 上架标题、属性、图片检查易漏项 | UserScript | low | daily（未证实） |
| OPP-016 | SKU 表格人工导出 | 已授权表格复制整理复杂 | OpenDesk 工具 | medium | daily（未证实） |
| OPP-017 | 竞品 Listing 变更提醒 | 产品页面变化需定期复核 | 云端/SaaS | high | weekly（未证实） |
| OPP-018 | 平台费用与毛利试算 | 多项费用造成利润估算误差 | UserScript | medium | daily（未证实） |
| OPP-019 | 评价客服答复模板 | 重复答复耗时 | UserScript | medium | daily（未证实） |
| OPP-020 | 商品信息一致性 QA | 后台商品字段相互不一致 | OpenDesk 工具 | medium | weekly（未证实） |
| OPP-021 | 卖家后台操作台 | 多平台操作工作流分散 | 独立扩展 | high | daily（未证实） |

## RESEARCH · AI 与知识研究

- **用户**：研究人员/产品经理/分析师。**高频痛点假设**：网页资料来源丢失、笔记缺乏出处、切换研究上下文成本高。
- **目标系统/网站**：公开文档、新闻网页、知识库（私人页面另授权）。站点只是研究样例，不自动授予 Host 范围。
- **竞品/替代品**：[Readwise Reader](https://docs.readwise.io/reader/docs/saving-content)、[Glasp](https://glasp.co/)、[Tampermonkey](https://www.tampermonkey.net/documentation.php)。
- **R8 关联**：[UX-009](https://github.com/shopable-ai/opendesk-browser/blob/main/docs/product/browser-automation-feature-catalog-r8.zh-CN.md)、[AUTO-004](https://github.com/shopable-ai/opendesk-browser/blob/main/docs/product/browser-automation-feature-catalog-r8.zh-CN.md)、[ECO-007](https://github.com/shopable-ai/opendesk-browser/blob/main/docs/product/browser-automation-feature-catalog-r8.zh-CN.md)；关联不代表对应代码已能执行。
- **商业化**：免费本地研究 + Pro 同步/协作。**适配维护**：中：网页结构与知识库格式。**MVP 判断**：优先深入研究，先做 1 个狭窄工作流。

| 稳定 ID | 功能候选 | 要解决的痛点 | 建议分发 | 风险 | 频次假设 |
| --- | --- | --- | --- | --- | --- |
| OPP-022 | 引用溯源网页剪藏 | 保存资料后原始 URL 与时间丢失 | OpenDesk 工具 | low | daily（未证实） |
| OPP-023 | 选区批注脚本 | 阅读时笔记脱离原文 | UserScript | low | daily（未证实） |
| OPP-024 | 研究标签会话保存 | 多项目上下文频繁切换 | OpenDesk 工具 | medium | daily（未证实） |
| OPP-025 | 来源证据核对 | 报告引文与原始文段难对应 | OpenDesk 工具 | medium | daily（未证实） |
| OPP-026 | 明确授权 AI 摘要 | 长文快速概览占用时间 | 云端/SaaS | high | daily（未证实） |
| OPP-027 | 提示词与输出版本比较 | AI 研究结论难追溯 | OpenDesk 工具 | medium | weekly（未证实） |
| OPP-028 | 来源网页更新观察 | 重要原文修改后未察觉 | 云端/SaaS | medium | weekly（未证实） |

## CONTENT · 内容创作与营销

- **用户**：内容运营/作者/市场团队。**高频痛点假设**：内容排版、来源校验和推广链接加工重复。
- **目标系统/网站**：CMS 编辑页、公开页面、社媒写作界面（各站适配）。站点只是研究样例，不自动授予 Host 范围。
- **竞品/替代品**：[Grammarly](https://www.grammarly.com/)、[Text Blaze](https://chromewebstore.google.com/detail/text-blaze-templates-and/idgadaccgipmpannjkmfddolnnhmeklj)、[Loom](https://www.loom.com/)。
- **R8 关联**：[DEV-010](https://github.com/shopable-ai/opendesk-browser/blob/main/docs/product/browser-automation-feature-catalog-r8.zh-CN.md)、[AUTO-010](https://github.com/shopable-ai/opendesk-browser/blob/main/docs/product/browser-automation-feature-catalog-r8.zh-CN.md)、[UX-011](https://github.com/shopable-ai/opendesk-browser/blob/main/docs/product/browser-automation-feature-catalog-r8.zh-CN.md)；关联不代表对应代码已能执行。
- **商业化**：个人 Pro + 品牌模板团队席位。**适配维护**：中高：编辑器 DOM 经常变化。**MVP 判断**：进入候选池，需用户访谈/合法数据与合规评估。

| 稳定 ID | 功能候选 | 要解决的痛点 | 建议分发 | 风险 | 频次假设 |
| --- | --- | --- | --- | --- | --- |
| OPP-029 | 文章 SEO 片段预览 | 标题/描述显示效果难预测 | UserScript | low | daily（未证实） |
| OPP-030 | UTM 链接生成校验 | 推广链接参数容易配置错误 | OpenDesk 工具 | low | daily（未证实） |
| OPP-031 | 内容发布检查清单 | 图片 alt/授权/出处等遗漏 | UserScript | low | daily（未证实） |
| OPP-032 | 敏感声明合规检查清单 | 广告披露与授权字段易漏 | UserScript | medium | weekly（未证实） |
| OPP-033 | 截图注释素材整理 | 需求说明需要重复圈注 | OpenDesk 工具 | medium | daily（未证实） |
| OPP-034 | 品牌短语模板 | 跨网站重复使用固定术语 | OpenDesk 工具 | medium | daily（未证实） |
| OPP-035 | 站内链接检查 | 文章发布后内部链接失效 | UserScript | low | weekly（未证实） |

## SALES · CRM、销售与客服

- **用户**：销售/客户成功/客服。**高频痛点假设**：跨 CRM 切换、重复录入、标准答复质量不稳。
- **目标系统/网站**：获授权的 Salesforce、HubSpot、Gmail、工单系统。站点只是研究样例，不自动授予 Host 范围。
- **竞品/替代品**：[Apollo](https://knowledge.apollo.io/hc/en-us/articles/4409226637453-Apollo-Chrome-Extension-Overview)、[HubSpot Sales](https://www.hubspot.com/products/sales/email-tracking)、[Text Blaze](https://chromewebstore.google.com/detail/text-blaze-templates-and/idgadaccgipmpannjkmfddolnnhmeklj)。
- **R8 关联**：[AUTO-007](https://github.com/shopable-ai/opendesk-browser/blob/main/docs/product/browser-automation-feature-catalog-r8.zh-CN.md)、[AUTO-008](https://github.com/shopable-ai/opendesk-browser/blob/main/docs/product/browser-automation-feature-catalog-r8.zh-CN.md)、[SEC-011](https://github.com/shopable-ai/opendesk-browser/blob/main/docs/product/browser-automation-feature-catalog-r8.zh-CN.md)；关联不代表对应代码已能执行。
- **商业化**：团队席位 + SaaS 集成计费。**适配维护**：高：OAuth/PII/CRM API 版本。**MVP 判断**：进入候选池，需用户访谈/合法数据与合规评估。

| 稳定 ID | 功能候选 | 要解决的痛点 | 建议分发 | 风险 | 频次假设 |
| --- | --- | --- | --- | --- | --- |
| OPP-036 | CRM 页面上下文笔记 | 客户资料需多窗口查看 | 独立扩展 | high | daily（未证实） |
| OPP-037 | 工单与客户动作面板 | 客户操作跨多个系统 | OpenDesk 工具 | high | daily（未证实） |
| OPP-038 | 客户答复快捷模板 | 重复回复耗时 | UserScript | medium | daily（未证实） |
| OPP-039 | CRM 重复记录提醒 | 客户记录重复造成跟进混乱 | 云端/SaaS | high | daily（未证实） |
| OPP-040 | 线索字段核验 | 客户资料质量难保证 | 云端/SaaS | high | daily（未证实） |
| OPP-041 | 工单完成检查清单 | 客服漏记解决步骤 | UserScript | medium | daily（未证实） |
| OPP-042 | SLA 时间提醒 | 工单处理时间难跟踪 | 云端/SaaS | high | daily（未证实） |

## HR · 招聘与人力资源

- **用户**：招聘顾问/HRBP。**高频痛点假设**：候选人比较、访谈评价、进度追踪分散。
- **目标系统/网站**：企业 ATS、职位发布页、内部办公门户。站点只是研究样例，不自动授予 Host 范围。
- **竞品/替代品**：[Text Blaze](https://chromewebstore.google.com/detail/text-blaze-templates-and/idgadaccgipmpannjkmfddolnnhmeklj)、[Apollo](https://knowledge.apollo.io/hc/en-us/articles/4409226637453-Apollo-Chrome-Extension-Overview)、[Readwise Reader](https://docs.readwise.io/reader/docs/saving-content)。
- **R8 关联**：[AUTO-008](https://github.com/shopable-ai/opendesk-browser/blob/main/docs/product/browser-automation-feature-catalog-r8.zh-CN.md)、[SEC-011](https://github.com/shopable-ai/opendesk-browser/blob/main/docs/product/browser-automation-feature-catalog-r8.zh-CN.md)、[BG-003](https://github.com/shopable-ai/opendesk-browser/blob/main/docs/product/browser-automation-feature-catalog-r8.zh-CN.md)；关联不代表对应代码已能执行。
- **商业化**：HR 团队席位/企业部署。**适配维护**：中高：人事隐私与 ATS 集成。**MVP 判断**：进入候选池，需用户访谈/合法数据与合规评估。

| 稳定 ID | 功能候选 | 要解决的痛点 | 建议分发 | 风险 | 频次假设 |
| --- | --- | --- | --- | --- | --- |
| OPP-043 | 职位信息结构化阅读 | 职位职责和要求难速览 | UserScript | low | daily（未证实） |
| OPP-044 | 候选人阶段工作台 | 招聘流程在多个系统分散 | OpenDesk 工具 | high | daily（未证实） |
| OPP-045 | 面试评价表单 | 多人评价维度不一致 | OpenDesk 工具 | medium | weekly（未证实） |
| OPP-046 | 候选人重名去重 | 资料重复和混淆风险 | 云端/SaaS | high | weekly（未证实） |
| OPP-047 | 简历使用同意审查 | 敏感个人信息处理需记录 | 独立扩展 | high | daily（未证实） |
| OPP-048 | 招聘进度后续提醒 | 跟进时间易遗漏 | 云端/SaaS | high | daily（未证实） |
| OPP-049 | JD 版本差异比较 | 岗位描述更新难追踪 | UserScript | low | weekly（未证实） |

## EDU · 教育与学习

- **用户**：语言学习者/教师/学生。**高频痛点假设**：外文阅读、视频字幕、笔记复习需要多个工具。
- **目标系统/网站**：开放文章、YouTube、教学平台（不规避付费）。站点只是研究样例，不自动授予 Host 范围。
- **竞品/替代品**：[Language Reactor](https://chromewebstore.google.com/detail/language-reactor/hoombieeljmmljlkjmnheibnpciblicm)、[Readlang](https://chromewebstore.google.com/detail/readlang-web-reader/odpdkefpnfejbfnmdilmfhephfffmfoh)、[Readwise Reader](https://docs.readwise.io/reader/docs/saving-content)。
- **R8 关联**：[CSS-001](https://github.com/shopable-ai/opendesk-browser/blob/main/docs/product/browser-automation-feature-catalog-r8.zh-CN.md)、[UX-011](https://github.com/shopable-ai/opendesk-browser/blob/main/docs/product/browser-automation-feature-catalog-r8.zh-CN.md)、[ECO-007](https://github.com/shopable-ai/opendesk-browser/blob/main/docs/product/browser-automation-feature-catalog-r8.zh-CN.md)；关联不代表对应代码已能执行。
- **商业化**：免费基础 + 学习记录同步 Pro。**适配维护**：中高：视频 DOM/字幕权限。**MVP 判断**：进入候选池，需用户访谈/合法数据与合规评估。

| 稳定 ID | 功能候选 | 要解决的痛点 | 建议分发 | 风险 | 频次假设 |
| --- | --- | --- | --- | --- | --- |
| OPP-050 | 学习视频双语辅助 | 跟读与翻译切换影响理解 | UserScript | medium | daily（未证实） |
| OPP-051 | 划词词典及生词本 | 阅读生词记录耗时 | UserScript | medium | daily（未证实） |
| OPP-052 | 课程网页摘录笔记 | 课堂资源与笔记分离 | OpenDesk 工具 | low | daily（未证实） |
| OPP-053 | 学习笔记导出 | 平台笔记难迁移 | OpenDesk 工具 | low | weekly（未证实） |
| OPP-054 | 网页无障碍阅读模式 | 复杂排版干扰学习 | UserScript | low | daily（未证实） |
| OPP-055 | 间隔复习同步 | 学习卡片分布于多个软件 | 云端/SaaS | medium | daily（未证实） |
| OPP-056 | 课程专注模式 | 学习过程被无关界面打断 | UserScript | low | daily（未证实） |

## ENTERPRISE · 企业内部工作流

- **用户**：内部运营/流程负责人/IT 管理。**高频痛点假设**：多门户重复流程、授权难管控、审批不可追溯。
- **目标系统/网站**：企业白名单域名、SSO 后的内部系统。站点只是研究样例，不自动授予 Host 范围。
- **竞品/替代品**：[Automa](https://github.com/AutomaApp/automa)、[Bardeen](https://www.bardeen.ai/)、[Text Blaze](https://chromewebstore.google.com/detail/text-blaze-templates-and/idgadaccgipmpannjkmfddolnnhmeklj)。
- **R8 关联**：[SEC-001](https://github.com/shopable-ai/opendesk-browser/blob/main/docs/product/browser-automation-feature-catalog-r8.zh-CN.md)、[BG-004](https://github.com/shopable-ai/opendesk-browser/blob/main/docs/product/browser-automation-feature-catalog-r8.zh-CN.md)、[ECO-012](https://github.com/shopable-ai/opendesk-browser/blob/main/docs/product/browser-automation-feature-catalog-r8.zh-CN.md)；关联不代表对应代码已能执行。
- **商业化**：企业租户 + 内部分发 + 维护 SLA。**适配维护**：高：审计、SSO 与专属适配。**MVP 判断**：进入候选池，需用户访谈/合法数据与合规评估。

| 稳定 ID | 功能候选 | 要解决的痛点 | 建议分发 | 风险 | 频次假设 |
| --- | --- | --- | --- | --- | --- |
| OPP-057 | 企业表单辅助 | 每周审批系统重复输入 | 独立扩展 | high | daily（未证实） |
| OPP-058 | 内部系统快捷启动 | 常用门户深链接难保存 | OpenDesk 工具 | low | daily（未证实） |
| OPP-059 | 受控网页操作按钮 | 系统工作流步骤过长 | UserScript | medium | daily（未证实） |
| OPP-060 | 审批与操作审计 | 重要流程需要留痕追责 | 云端/SaaS | high | daily（未证实） |
| OPP-061 | 敏感字段发送提醒 | 内部表单可能误传敏感数据 | 独立扩展 | high | daily（未证实） |
| OPP-062 | 内部仪表板健康查看 | 跨系统状态检查手工反复 | OpenDesk 工具 | medium | daily（未证实） |
| OPP-063 | 企业签名工具包投放 | 工具升级和撤销缺统一治理 | 云端/SaaS | high | weekly（未证实） |

## TRAVEL · 旅行与日常生活

- **用户**：频繁出行者/家庭。**高频痛点假设**：行程、时差、预订条件散落多个网站。
- **目标系统/网站**：航空、酒店、地图、旅行计划网站。站点只是研究样例，不自动授予 Host 范围。
- **竞品/替代品**：[Readwise Reader](https://docs.readwise.io/reader/docs/saving-content)、[Keepa](https://chromewebstore.google.com/detail/keepa-amazon-price-tracke/neebplgakaahbhdphmkckjjcegoiijjo)、[Language Reactor](https://chromewebstore.google.com/detail/language-reactor/hoombieeljmmljlkjmnheibnpciblicm)。
- **R8 关联**：[TRG-008](https://github.com/shopable-ai/opendesk-browser/blob/main/docs/product/browser-automation-feature-catalog-r8.zh-CN.md)、[ECO-007](https://github.com/shopable-ai/opendesk-browser/blob/main/docs/product/browser-automation-feature-catalog-r8.zh-CN.md)、[SEC-014](https://github.com/shopable-ai/opendesk-browser/blob/main/docs/product/browser-automation-feature-catalog-r8.zh-CN.md)；关联不代表对应代码已能执行。
- **商业化**：免费工具 + 可选行程同步。**适配维护**：中高：实时价格源/地区规则。**MVP 判断**：进入候选池，需用户访谈/合法数据与合规评估。

| 稳定 ID | 功能候选 | 要解决的痛点 | 建议分发 | 风险 | 频次假设 |
| --- | --- | --- | --- | --- | --- |
| OPP-064 | 酒店预订条件比较 | 取消政策与含税价格不易比较 | UserScript | medium | weekly（未证实） |
| OPP-065 | 行程网页一键剪藏 | 确认页面信息难整理 | OpenDesk 工具 | low | weekly（未证实） |
| OPP-066 | 行程跨时区显示 | 航班/会议时间换算容易误差 | UserScript | low | weekly（未证实） |
| OPP-067 | 机票价格告警 | 重复手动查价耗时 | 云端/SaaS | high | weekly（未证实） |
| OPP-068 | 旅行短语翻译 | 场景语言沟通效率低 | UserScript | medium | weekly（未证实） |
| OPP-069 | 行前任务清单 | 出行证件和物品容易遗漏 | OpenDesk 工具 | low | weekly（未证实） |
| OPP-070 | 政策出处提醒 | 证件/签证变化信息需查官方源 | 云端/SaaS | high | monthly（未证实） |

## SEO · 网站运营与 SEO

- **用户**：站长/SEO 顾问/前端运营。**高频痛点假设**：网页 SEO 与可索引性问题需反复人工检查。
- **目标系统/网站**：客户授权网站、公开页面、搜索结果页。站点只是研究样例，不自动授予 Host 范围。
- **竞品/替代品**：[Ahrefs SEO Toolbar](https://help.ahrefs.com/en/articles/79085-ahrefs-seo-toolbar-installation-and-usage)、[SEOquake](https://chromewebstore.google.com/detail/seoquake-on-page-seo-chec/akdgnmcogleenhbclghghlkkdndkjdjc)、[Wappalyzer](https://www.wappalyzer.com/)。
- **R8 关联**：[AUTO-004](https://github.com/shopable-ai/opendesk-browser/blob/main/docs/product/browser-automation-feature-catalog-r8.zh-CN.md)、[DEV-009](https://github.com/shopable-ai/opendesk-browser/blob/main/docs/product/browser-automation-feature-catalog-r8.zh-CN.md)、[CSS-001](https://github.com/shopable-ai/opendesk-browser/blob/main/docs/product/browser-automation-feature-catalog-r8.zh-CN.md)；关联不代表对应代码已能执行。
- **商业化**：个人 Pro + 团队导出/持续监测。**适配维护**：中：SEO 标准及浏览器渲染。**MVP 判断**：优先深入研究，先做 1 个狭窄工作流。

| 稳定 ID | 功能候选 | 要解决的痛点 | 建议分发 | 风险 | 频次假设 |
| --- | --- | --- | --- | --- | --- |
| OPP-071 | 页面元标签即时审计 | title/meta/canonical 配置易遗漏 | UserScript | low | daily（未证实） |
| OPP-072 | 结构化数据现场检测 | JSON-LD 字段错误难定位 | UserScript | low | daily（未证实） |
| OPP-073 | 重定向链路检查 | 301/302 跳转来源难追踪 | OpenDesk 工具 | medium | weekly（未证实） |
| OPP-074 | 内部失效链接检查 | 死链人工巡检耗时 | OpenDesk 工具 | medium | weekly（未证实） |
| OPP-075 | SERP 截图与注明 | 搜索结果观察记录难存档 | OpenDesk 工具 | medium | weekly（未证实） |
| OPP-076 | Web Vitals 解释面板 | 性能指标与页面原因脱节 | 独立扩展 | medium | weekly（未证实） |
| OPP-077 | 排名和搜索量历史 | 长期趋势无法靠浏览器页面获取 | 云端/SaaS | high | weekly（未证实） |

## DATA · 企业数据分析与报表

- **用户**：运营分析师/财务分析人员。**高频痛点假设**：多系统报表口径不一致、手工导出和更新频繁。
- **目标系统/网站**：获批准的 BI 看板、企业报表/表格页。站点只是研究样例，不自动授予 Host 范围。
- **竞品/替代品**：[Automa](https://github.com/AutomaApp/automa)、[Bardeen](https://www.bardeen.ai/)、[Readwise Reader](https://docs.readwise.io/reader/docs/saving-content)。
- **R8 关联**：[AUTO-014](https://github.com/shopable-ai/opendesk-browser/blob/main/docs/product/browser-automation-feature-catalog-r8.zh-CN.md)、[AUTO-008](https://github.com/shopable-ai/opendesk-browser/blob/main/docs/product/browser-automation-feature-catalog-r8.zh-CN.md)、[SEC-011](https://github.com/shopable-ai/opendesk-browser/blob/main/docs/product/browser-automation-feature-catalog-r8.zh-CN.md)；关联不代表对应代码已能执行。
- **商业化**：团队订阅/连接器/企业本地部署。**适配维护**：高：数据语义、PII、报表模式变更。**MVP 判断**：进入候选池，需用户访谈/合法数据与合规评估。

| 稳定 ID | 功能候选 | 要解决的痛点 | 建议分发 | 风险 | 频次假设 |
| --- | --- | --- | --- | --- | --- |
| OPP-078 | 授权表格复制与导出 | 页面数据转为结构化表格费时 | UserScript | medium | daily（未证实） |
| OPP-079 | 网页数据图表叠层 | 当前 BI 页面缺少特定视角 | UserScript | medium | weekly（未证实） |
| OPP-080 | 报表时点快照 | 同一看板历史状态不易复现 | OpenDesk 工具 | medium | daily（未证实） |
| OPP-081 | 报表字段口径核对 | 不同报表字段不一致 | OpenDesk 工具 | medium | weekly（未证实） |
| OPP-082 | 定时审计报告 | 例行汇总需人工点击多页面 | 云端/SaaS | high | weekly（未证实） |
| OPP-083 | 多平台指标对账 | 来源数据需要口径和权限治理 | 云端/SaaS | high | weekly（未证实） |
| OPP-084 | 看板变化批注 | 最新指标与上次差异难指出 | UserScript | medium | daily（未证实） |


## 组合与退出规则

同一行业的多功能须围绕**一个狭窄可解释的目的**；同一网站上的十个独立按钮宜先组成脚本包/可选模块，不要十次上架。没有持续数据授权、维护者和站点变更测试的行业，默认只做候选研究。高风险领域（CRM、人事、企业数据、购物联盟）须在用户测试之前单独通过安全与隐私审核。
