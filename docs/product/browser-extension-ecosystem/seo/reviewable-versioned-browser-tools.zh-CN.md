# 浏览器工具安装前，先核对源码、依赖和网站授权｜Reviewable, versioned browser tools with site permission controls

> 2026-10-13 · GF-004 · **公开需求/技术事实候选，不是世界第一认证或当前全部功能已经正式发行的承诺**。本页源于 GitHub，官网 canonical、sitemap、正式 Chrome 安装与 Google/Bing/AI 搜索收录尚未本轮验证。

## 用户问题 / User problem

**适用人群**：使用第三方网站脚本的小团队、注重隐私的用户，希望安装或升级前知道工具访问的范围。

**实际痛点**：我怎样确认正在运行的是哪个固定代码版本？新库或网站授权变动后，能否主动拒绝、停用并核查实际结果？

**Search intent / 搜索意图**：review permissions before installing AI generated userscript / 浏览器脚本 来源哈希 审核

**English summary**: Review tool source identity, dependency locks and site permissions, then check traceable run results. Validation is limited to the tested version.

## 用户体验应该怎样发生

查看 Candidate 源码哈希与依赖锁 → 对照授权的网站范围 → 用户实际审批 → 通过原 Authority/RunHost 执行 → 核对 Durable Result/Stop → 实测撤权和升级后是否还可能运行旧版本。

**当前已能从源码核查的基础**：src/scripting/user-scripts/dependency-manager.js、installed-programs.js、src/ui/local-project-install.js、原 Task/Run/Result。

**当前无法作为正式产品承诺的缺口**：最新相同 packageHash 的依赖变化、安装范围差异、站点撤权、停止未知效果、更新与回滚同场景真实 Chrome 完整测试；独立安全审计没有完成。

请区分 AI 提案成功、保存源码 Revision、真实 Chrome Run、Task Candidate、Verified、Available、Installed 这几个**不同状态**。登录网页必须属于用户拥有实际授权的账户；对于需要 Native/Node、本机 Codex 或用户自己配置 HTTPS 模型的路径，不能称零配置。Stop 不撤回外站已经发生的业务副作用。

## 公平的最强竞争反例

ScriptCat v1.5.0-beta.1 的 MCP 分级审核、v1.5.0-beta.4 的安装前兼容和权限提示；Tampermonkey 和企业 RPA。

竞品可以使用自己合理的工具组合，不能因为第三方有外部开发流程就将其排除。本站未保存同机实际对比原始指标，竞争排名 **NOT_TESTED**。

## 可公开证明哪些指标 / Evidence required

12 类恶意/误操作与撤权案例、误授权率、同哈希审阅差异；不将授权管理宣传成全球最安全。

任何真实 PASS 必须绑定相同来源的实际 Chrome/扩展包、站点许可、版本 hash、RunId、ResultId、retirement、原始时延/费用、失败及恢复过程。世界/区域第一、最快、最安全和全球第2—5名均 **NOT_APPROVED / NOT_SCORED**。

## 可尝试入口 / Reproducible starting point

- [现有源码/使用研究入口](https://github.com/shopable-ai/opendesk-browser/blob/main/docs/framework/workstreams/local-project-install-r251.md)
- [TOP 5、26 任务机会与最强反例](../global-first-r2-decision.zh-CN.md)
- [原唯一 GF 声明账本](../first-claims-ledger.json) · [竞品时间线](../competitor-timeline.json)
- 最新可独立下载并覆盖上述全部场景的 Chrome 发行包/真实模型关闭后运行录像：**本轮 NOT_TESTED**。

## 可以使用的非排名定位 / Bilingual M0 wording

**中文：** 浏览器工具安装前，先核对源码、依赖和网站授权。OpenDesk Browser 正在将 AI 提议、人工审阅、固定版执行及复用串起来；各模块成熟度、许可和安装前置条件因入口而异。

**English:** Review tool source identity, dependency locks and site permissions, then check traceable run results. Validation is limited to the tested version.

只有完成发行版本和双方公平实测后，才考虑限定数据集的性能表述；绝不在此页承诺“全球第一、首个、最快或最安全”。
