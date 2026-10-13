# AI 制作网页小组件、JS 增强和自动化任务｜AI-assisted page tools and controller tasks

> 2026-10-13 · GF-003 · **公开需求/技术事实候选，不是世界第一认证或当前全部功能已经正式发行的承诺**。本页源于 GitHub，官网 canonical、sitemap、正式 Chrome 安装与 Google/Bing/AI 搜索收录尚未本轮验证。

## 用户问题 / User problem

**适用人群**：既需要小型页面卡片、又需要网页重复流程的人；希望在一个工具列表里找回和停用它们。

**实际痛点**：AI 生成的网页 JS、页面 UI 和 Controller 任务，是否可以审阅后各自走正确的安装和权限渠道，而不拆成三套互不兼容的运行框架？

**Search intent / 搜索意图**：AI create page widget and browser task extension / AI 生成网页增强和自动化脚本

**English summary**: Manage page scripts, interactive widgets and browser tasks through one platform, with edition-specific permissions and installation steps.

## 用户体验应该怎样发生

确定产物是 Page User Script、受控 React/Vue 页面组件还是 Controller → 审查对应脚本来源/依赖/站点 → 单独 Run 和核查原始结果 → 各自用原有 Page/Task Candidate 安装入口管理。

**当前已能从源码核查的基础**：Page USER_SCRIPT 与受控页面组件、Controller RunHost、Tool Tab、src/ui/local-project-install.js、OpenDeskSDK.browser 统一 Browser SDK 的现有代码。

**当前无法作为正式产品承诺的缺口**：三类 AI 产物同发布版正式安装、浏览器真运行/升级/停用矩阵，以及与现有工具组合的一致性对照尚未完成；不同执行世界 API 不会自动相等。

请区分 AI 提案成功、保存源码 Revision、真实 Chrome Run、Task Candidate、Verified、Available、Installed 这几个**不同状态**。登录网页必须属于用户拥有实际授权的账户；对于需要 Native/Node、本机 Codex 或用户自己配置 HTTPS 模型的路径，不能称零配置。Stop 不撤回外站已经发生的业务副作用。

## 公平的最强竞争反例

AI coding + WXT/Plasmo + 用户脚本管理器；ScriptCat Agent、Automa；多个工具组合也可完成等价任务。

竞品可以使用自己合理的工具组合，不能因为第三方有外部开发流程就将其排除。本站未保存同机实际对比原始指标，竞争排名 **NOT_TESTED**。

## 可公开证明哪些指标 / Evidence required

三类分别真实安装，重复两次运行和停用，跨类别维护用户步骤数，对照 WXT + userscript manager。

任何真实 PASS 必须绑定相同来源的实际 Chrome/扩展包、站点许可、版本 hash、RunId、ResultId、retirement、原始时延/费用、失败及恢复过程。世界/区域第一、最快、最安全和全球第2—5名均 **NOT_APPROVED / NOT_SCORED**。

## 可尝试入口 / Reproducible starting point

- [现有源码/使用研究入口](https://github.com/shopable-ai/opendesk-browser/blob/main/docs/api/page-ui-frameworks.zh-CN.md)
- [TOP 5、26 任务机会与最强反例](../global-first-r2-decision.zh-CN.md)
- [原唯一 GF 声明账本](../first-claims-ledger.json) · [竞品时间线](../competitor-timeline.json)
- 最新可独立下载并覆盖上述全部场景的 Chrome 发行包/真实模型关闭后运行录像：**本轮 NOT_TESTED**。

## 可以使用的非排名定位 / Bilingual M0 wording

**中文：** AI 制作网页小组件、JS 增强和自动化任务。OpenDesk Browser 正在将 AI 提议、人工审阅、固定版执行及复用串起来；各模块成熟度、许可和安装前置条件因入口而异。

**English:** Manage page scripts, interactive widgets and browser tasks through one platform, with edition-specific permissions and installation steps.

只有完成发行版本和双方公平实测后，才考虑限定数据集的性能表述；绝不在此页承诺“全球第一、首个、最快或最安全”。
