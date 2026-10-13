# AI 做一次，浏览器工具以后重复使用｜AI-assisted creation of a reusable browser task

> 2026-10-13 · GF-007 · **公开需求/技术事实候选，不是世界第一认证或当前全部功能已经正式发行的承诺**。本页源于 GitHub，官网 canonical、sitemap、正式 Chrome 安装与 Google/Bing/AI 搜索收录尚未本轮验证。

## 用户问题 / User problem

**适用人群**：客服、运营、个人用户：每周对同一个已授权网页进行重复检索、填写或校验，不想每次重新提供提示词与花费模型费用。

**实际痛点**：如何让 AI 协助完成一次需求设计，用户审核步骤、网站权限、脚本版本后，把确定性动作保存为可运行 Task，而不是永久依赖模型实时操作？

**Search intent / 搜索意图**：AI browser automation reusable without AI / AI 创建浏览器工具 安装后复用

**English summary**: Create a browser task with AI assistance, review the actions and site permissions, then reuse a verified installed version on supported pages.

## 用户体验应该怎样发生

在真实网页选择工作流 → 明确启动本机 Codex 或自行配置的 HTTPS 模型 → 检查 AI 提出的步骤与参数 → 保存为源码哈希固定的 Controller 修订 → 用户许可后真实 Run → 在原 Task 目录通过 Candidate、Verified、Available、Installed → 关闭 AI 后从「我的任务」运行已批准固定版。

**当前已能从源码核查的基础**：`src/ui/workflow/workflow-view.js`、`src/ui/workflow/local-codex.js`、`src/framework/workflow/compiler.js`、现有 Task/Authority/RunHost，以及正式任务目录 `src/ui/task-workbench.js`。R6 已在 [具体代码提交](https://github.com/shopable-ai/opendesk-browser/commit/ec42e068c749285e39e0f5690e970295bdd3927b) 中补充**安装前的完整冻结源码只读查看、参数/网站审阅以及准确的 Workflow→Candidate 选择与 RunId 清理**。这属于 `SOURCE_IMPLEMENTED`，不是整条流程的真实 Chrome PASS。

**当前无法作为正式产品承诺的缺口**：同一最新 Mac Chrome/发行包的 AI→Verified→Installed→断开模型 Run×2，真实 RunId/ResultId、许可撤销和失败恢复；首次模型费、20 次综合成本及用户第一次成功率尚无测量。

请区分 AI 提案成功、保存源码 Revision、真实 Chrome Run、Task Candidate、Verified、Available、Installed 这几个**不同状态**。登录网页必须属于用户拥有实际授权的账户；对于需要 Native/Node、本机 Codex 或用户自己配置 HTTPS 模型的路径，不能称零配置。Stop 不撤回外站已经发生的业务副作用。

## 公平的最强竞争反例

Axiom 官方 Claude Skill 已提供可保存的 No-code Automation 与 Node 代码路径；UiPath Delegate 于 **2026-08-25 Public Preview、2026-09-22 正式 GA**，提供可复用 Routines 和企业治理；Claude in Chrome 于 **2026-08-26 宣布 GA**，可记录和重复模型工作流；ScriptCat **1.5.0-beta.4（2026-09-18）** 已支持安装前完整源码查看和权限差异。它们均构成真实反例，不能宣称“AI 工具可以保存复用、源码查看或安装权限提示”是全球首创。

竞品可以使用自己合理的工具组合，不能因为第三方有外部开发流程就将其排除。本站未保存同机实际对比原始指标，竞争排名 **NOT_TESTED**。

## 可公开证明哪些指标 / Evidence required

20 次同一表单/搜索任务总费用及成功率；观察每次是否调用模型、同版 SHA、不同 RunId/ResultId、Chrome 真权限。

任何真实 PASS 必须绑定相同来源的实际 Chrome/扩展包、站点许可、版本 hash、RunId、ResultId、retirement、原始时延/费用、失败及恢复过程。世界/区域第一、最快、最安全和全球第2—5名均 **NOT_APPROVED / NOT_SCORED**。

## 可尝试入口 / Reproducible starting point

- [现有源码/使用研究入口](https://github.com/shopable-ai/opendesk-browser/blob/main/examples/tasks/agent-modern-search.v1.opendesk-task.json)
- [TOP 5、26 任务机会与最强反例](../global-first-r2-decision.zh-CN.md)
- [原唯一 GF 声明账本](../first-claims-ledger.json) · [竞品时间线](../competitor-timeline.json)
- [R6 首次成功实现与真实验收边界](https://github.com/shopable-ai/opendesk-browser/blob/main/docs/framework/workstreams/global-first-r6-ai-first-product-proof-20261013.md)，同时公开 Task 目录当前只读源码审阅的实现来源。首选合法表单 [demo-form.html](https://github.com/shopable-ai/opendesk-browser/blob/main/examples/tasks/demo-form.html)。
- 最新可独立下载并覆盖上述全部场景的 Chrome 发行包/真实模型关闭后运行录像：**本轮 NOT_TESTED**。GitHub 源码可见不等于已在商店发行或可从官网直接安装。

## 可以使用的非排名定位 / Bilingual M0 wording

**中文：** AI 做一次，浏览器工具以后重复使用。OpenDesk Browser 正在将 AI 提议、人工审阅、固定版执行及复用串起来；各模块成熟度、许可和安装前置条件因入口而异。

**English:** Create a browser task with AI assistance, review the actions and site permissions, then reuse a verified installed version on supported pages.

只有完成发行版本和双方公平实测后，才考虑限定数据集的性能表述；绝不在此页承诺“全球第一、首个、最快或最安全”。
