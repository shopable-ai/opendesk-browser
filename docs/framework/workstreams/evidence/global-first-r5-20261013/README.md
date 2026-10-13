# Global First R5 · 45 竞品、84 OPP、TOP20 与公平实验原始证据

> 2026-10-13。**仅研究索引与冻结试验合同；没有产品/竞品实机成绩。** 正式 GF 申报在 `docs/product/browser-extension-ecosystem/first-claims-ledger.json`；84 OPP/8 EXP 在原正式主账本，本文不能独立批全球、地区或任务第一。

## 这次实际写入了什么？

- [R5 17 份重要官方来源的时间、版本与渠道索引](source-index.json)，Google Chrome Skills 2026-04-14、Claude Chrome 2026-07-24 Beta 录制重复、UiPath Delegate 2026-08-25 公开预览是最具实质性的 GF-007 反例。
- [真实同任务竞争基准预注册合同](benchmark-contract.json)：10 组强对手或组合、6 类公平实验、真实 Mac 扩展来源/任务安装身份/模型调用与成本字段。所有原始试验数组为空、所有名次 NOT_TESTED。
- [实际使用旧生产模块的代码合同回归](../../../tests/environment/global-first-r5-product-evidence.test.mjs)：verifyTaskPackage/createTaskPackage 与 compileWorkflow 并非复制新包解析器；对 Candidate 来源、哈希、权限、参数和版本变化做离线拒绝测试。
- [公平证据结算器](../../../scripts/global-first-r5-benchmark.mjs) 与 [合成单元测试](../../../tests/environment/global-first-r5-benchmark.test.mjs)。只有预先选择的比较组都完成真实证据后才能统计**限定参与方案**的中位成功耗时，不会形成“全球第一、世界首个、最安全或全球 TOP5”的声明。所有测试用模拟数值属于纯粹单元测试，不是用户/竞品测量，不存入原始试验数组。
- 45 个真实竞品来源、全部 84 OPP 和 20 个小山头研究优先级的权威最新信息分别在原 [competitor-timeline.json](../../../../product/browser-extension-ecosystem/competitor-timeline.json)、[opportunity-register.json](../../../../product/browser-extension-ecosystem/opportunity-register.json)、[GF Ledger](../../../../product/browser-extension-ecosystem/first-claims-ledger.json)。

## 如何实施唯一有意义的原生 Chrome 验收

**用户目的**：不需要手写 React/Vue；让真实 AI 为有权访问的 `http://127.0.0.1:43111/demo-form.html` 生成一个可重复关键词查询工具，经审阅、可信 Task 验证、安装后断开 AI 独立 Run 两次。

第一道硬门：Mac 真实工作区 `git status`、main/远端、其它会话的 CFT/profile/Native/43111/43112/dist/ZIP 占用，只有明确独占才能启动；如果已被 R16/R25/SDK/Cloud 等专职 Agent 使用，不抢资源或新建分支。原 fixture 不允许借此触碰真实第三方网站、绕过登录/权限、制造用户副作用。

第二道硬门：在 OpenDesk 当前实际 Chrome 扩展、对应 Native（如入口需）内，让真实模型提出步骤；用户可见审阅网站、源码、参数、模型发送内容。必须有真正 Chrome 发起的 RunHost 执行、实际 `documentId/runId/resultId/result.revision.sourceHash/retirement=released` 和网页效果。模型改动任何源字节，旧原 Candidate Hash 都立即失效。

第三道硬门：只通过现存 `verifyTaskCandidate`→`makeTaskAvailable`→`installTask`，同版身份固定 sourceHash/manifestHash/installationId/generation；明确断开所有模型/AI Provider，本机未联网时以**同一 installed 版本**用户再次独立执行两次，记录不同 RunId/ResultId、实际 DOM 效果及 `modelCalls=0` 的独立真实计量依据。如果没有可追溯模型调用计数，填写 null，不写 0。

第四道硬门：真实 Chrome 撤销站点许可/停止/卸载/升级/重启恢复；不能暗中重放 UNKNOWN。Stop 受控资源不代表回滚网站已提交的业务交易。

第五道硬门：竞品允许用自己最佳自然流程，Chrome Skills 的提示词重用、Claude 的录制、Axiom 的 import、UiPath 预览的 Routine、Playwright+管理器组合、Apify Actor 的云执行与 Power Automate 本机要求都要分别记录**可获得性、版本渠道、登录/计费/站点权限差异**。不适用的对手状态为 NOT_EQUIVALENT，不能判 FAIL；无法安装的为 NOT_TESTED/BLOCKED_BY_ELIGIBILITY，不得判输。

## 竞争基准的字段与唯一结算器

合同定义 R5-T01 首用 5 次、R5-T02 重复 20 次、R5-T03 撤权/导航 3 次、R5-T04 恢复 3 次、R5-T05 版本升级 2 次、R5-T06 用户自然第二次使用 2 次。每次都应由实际执行负责人保存自身系统的原始日志、目标、截图/录像、版本、真实模型计费来源、网站副作用和原始出错行为。

Node 工具不会扫描用户 Mac 的 Chrome/Native，不会调用模型，也不会自动把单元测试映射为真实回执。示意调用：

```js
import {readFileSync} from 'node:fs';
import {evaluateR5Benchmark} from './scripts/global-first-r5-benchmark.mjs';
const plan=JSON.parse(readFileSync('docs/framework/workstreams/evidence/global-first-r5-20261013/benchmark-contract.json','utf8'));
const reviewedTrials=[]; // 只有独立人工/真实运行的受信原始收据通过审核后才能写入
const report=evaluateR5Benchmark(plan,reviewedTrials,{scenarioId:'R5-T02',
  comparatorIds:['opendesk','gemini-in-chrome']});
console.log(report.status,report.scopedTimeRanking); // NOT_TESTED, NOT_RANKED
```

只有完整的日期、同一环境、公平任务和预注册参赛样本存在才能解释中位成功耗时；**中位耗时快不等于成功率/可靠性/安全性好**。即使某个试验组领先，也必须按 `first-claims-ledger.json` 独立声明审批，不能凭结算器自动发布世界排名。

## 证据分级：下一位 AI 不能提升

| 当前证据 | 本轮事实 | 不得冒称 |
| --- | --- | --- |
| 代码 Candidate integrity / deterministic compiler | Github Actions 真实 Node 组件测试（以固定 SHA CI 为准） | 实际 Chrome Native Worker 操作 |
| R4 原现代搜索固定 Task | 已有版本候选源码/哈希与示例 fixture | 已 Verified/Available/Installed |
| 竞争日期与渠道 | 公开官方/供应商资料，其中有 Stable、Beta、docs update 和商店 update | 竞品功能最早已穷尽/全球首创 |
| Mac 本机 AI → Installed → Run 两次 | **NOT_TESTED** | 正式产品闭环 |
| Google/Bing/AI 引用、真实安装和付费 | **NOT_TESTED / NOT_MEASURED** | 搜索与 AI 推荐、商业第一 |
| 专家评分与同行样本 | **NOT_SCORED** | 95/100 PASS |

以上仅是 R5 研究回归与可复现实验合同，不新增或重构原 `src/` 浏览器运行系统。
