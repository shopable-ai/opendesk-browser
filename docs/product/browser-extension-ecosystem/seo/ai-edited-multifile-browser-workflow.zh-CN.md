# AI 修改多文件项目后，明确地运行在授权网页上｜AI-edited multi-file projects with controlled browser runs

> 2026-10-13 · GF-002 / GF-011 · **公开需求/技术事实候选，不是世界第一认证或当前全部功能已经正式发行的承诺**。本页源于 GitHub，官网 canonical、sitemap、正式 Chrome 安装与 Google/Bing/AI 搜索收录尚未本轮验证。

## 用户问题 / User problem

**适用人群**：用 Codex 或其它编程 AI 改动本地 JS/React/Vue 项目的开发者、运营工程师。

**实际痛点**：AI 修改了多个文件，我是否必须重建浏览器扩展才能在授权网页观察最新效果？首次搭建和第20次重复的真实成本是多少？

**Search intent / 搜索意图**：AI edit React Vue userscript multi file browser / AI 修改多文件网页插件 运行

**English summary**: Use a controlled workflow to prepare and explicitly run AI-edited local browser projects on authorized pages.

## 用户体验应该怎样发生

本地选择受信项目并配对 Native/Node（按实际版本要求） → AI 修改合法目录中的源码 → 使用原依赖/编译链受控准备 → Side Panel 明确 Run → 浏览器记录 SHA/结果 → 修改后再次 Run，不替用户无声更新安装版。

**当前已能从源码核查的基础**：原本地 Native/项目准备/依赖锁/受控 JS 运行；历史 F02 React/Vue 同候选循环 CFT 证明但不等于最新主分支完全验收。

**当前无法作为正式产品承诺的缺口**：OpenDesk 与 vite-plugin-monkey+Tampermonkey/ScriptCat、WXT、Plasmo 的5次完整冷启动、10次热修改、3次故障恢复的同设备原始数据；公开正式版本和首次模型/Native 配置成本。

请区分 AI 提案成功、保存源码 Revision、真实 Chrome Run、Task Candidate、Verified、Available、Installed 这几个**不同状态**。登录网页必须属于用户拥有实际授权的账户；对于需要 Native/Node、本机 Codex 或用户自己配置 HTTPS 模型的路径，不能称零配置。Stop 不撤回外站已经发生的业务副作用。

## 公平的最强竞争反例

vite-plugin-monkey 与 Tampermonkey 或 ScriptCat 的多文件工具链早已实现前端构建；WXT/Plasmo 也可结合 AI 编程。

竞品可以使用自己合理的工具组合，不能因为第三方有外部开发流程就将其排除。本站未保存同机实际对比原始指标，竞争排名 **NOT_TESTED**。

## 可公开证明哪些指标 / Evidence required

同机样本用时、人工操作、安装前置、失败次数、发布成本及20次复用费用；无实测不能叫全球最快。

任何真实 PASS 必须绑定相同来源的实际 Chrome/扩展包、站点许可、版本 hash、RunId、ResultId、retirement、原始时延/费用、失败及恢复过程。世界/区域第一、最快、最安全和全球第2—5名均 **NOT_APPROVED / NOT_SCORED**。

## 可尝试入口 / Reproducible starting point

- [现有源码/使用研究入口](https://github.com/shopable-ai/opendesk-browser/blob/main/docs/api/local-projects.zh-CN.md)
- [TOP 5、26 任务机会与最强反例](../global-first-r2-decision.zh-CN.md)
- [原唯一 GF 声明账本](../first-claims-ledger.json) · [竞品时间线](../competitor-timeline.json)
- 最新可独立下载并覆盖上述全部场景的 Chrome 发行包/真实模型关闭后运行录像：**本轮 NOT_TESTED**。

## 可以使用的非排名定位 / Bilingual M0 wording

**中文：** AI 修改多文件项目后，明确地运行在授权网页上。OpenDesk Browser 正在将 AI 提议、人工审阅、固定版执行及复用串起来；各模块成熟度、许可和安装前置条件因入口而异。

**English:** Use a controlled workflow to prepare and explicitly run AI-edited local browser projects on authorized pages.

只有完成发行版本和双方公平实测后，才考虑限定数据集的性能表述；绝不在此页承诺“全球第一、首个、最快或最安全”。
