# 当前执行约束（v5修订）

本轮以prompts/goal-migration-v5.txt、execution-plan.md及当前审批manifest为准。旧约束全文保存在stage0/goal-constraints-v4.md。当前阶段0审批pending，不实施产品；F1/F2/F3功能false保留。目录、順序、分母和完成标准当前差异见compatibility-delta-v5.md。旧资料暂停和直接先补T10指令为历史，不约束本次新Goal。

# 执行附件：原始约束继续有效

本附件与 goal-prompt.md 是当前 Goal 的执行指令修订，不是新设计批准、后端通过报告或功能完成证书。没有改变本聊天原始用户任务；细节冲突时，服从原始要求及用户后续明确修正。

## 当前证据与门

- 当前新 Goal / 唯一公共 owner：`01a0fda9-8a86-7f72-89be-e292ffc94ed4`。旧owner inactive核验见stage0/initial-state.json与public-owner.json；没有恢复或消息旧任务。
- 设计 manifest SHA256：`acca60edf9031aafb4ecb740f5f0f33777a3694d23499f28ce37af63b38f592f`。同hash旧Architect97/Critic98仅作为历史设计批准保留，不批准当前执行方案；阶段0同一候选需重新独立Architect→Critic。
- F1 旧候选 SHA256：`5cab9686da1ab1fbea307650bb419d7481e21d3292327d9d77b198e43826c815`。旧候选、真实 Chrome 149 结果和独立 PARTIAL_PROOF 报告保持原样。新补测使用新的候选目录、hash 与独立报告，不覆盖旧证据。
- classic Blob 是原已批准 backend 内的加载分支，不是另造 backend。包内 classic/module 与 module Blob 的失败记录必须保留。不能因旧 fixture 的四分支 AND 判断误报整体不可行；也不能将局部 pong、fetch 失败、计数归零和心跳当作完整安全或终止证明。
- designApproved、boundedPrototypeResearchAllowed 为 true。backendPrototypePassed、fullImplementationReleased、frameworkFunctionalMigrationComplete 仍为 false。必须分别由实际原型与独立复核、实施许可、全部 F3 实测与独立复核取得，不能继承旧审计 false 为通过。
- F1 补测包括真实用户 async-body、固定受限 adapter 的 await 与异常、假 peer/global postMessage/重放/global patch 拒绝、有效 policy container/CSP 与网络正对照、while(true) 实际终止和资源清理；userScripts 仅 ScriptSource code/file，授权开关、精确 document、USER_SCRIPT/MAIN 的 Promise/error/撤权及旧文档竞争均要真测。页面死循环不承诺通用 terminate。
- “尚未测试”是待办；“必需前提缺失”必须说明实际缺失的资源、权限、来源或实现条件，以及为何当前授权范围内不能补齐。真实关键 backend 失败仍按原停止条件处理。不得删除必选用例或把失败改成 skip；条件支持、限制与最低/稳定版矩阵须公开并独立复核。

## 写入边界和模型

目标工程保持 native MV3/webpack，不整体覆盖、不迁 WXT/TS、不修改全局模型配置。

主任务请求 `openai/gpt-6.1-sol`、xhigh；原生子代理 `agent_type=default`，完整加载已安装角色提示，请求 `gpt-6.1-sol`、xhigh。不能使用绑定旧模型的角色默认值；server resolved runtime 无独立证据时记录 unknown。

仅写目标工程以下原授权位置：

- `src/run-host.js`、`src/sw.js`、`src/environment.js`。
- `src/platform/**`、`src/framework/**`、`src/agents/**`、`src/scripting/**`、`src/ui/**`、`src/plugins/automation-example/**`。
- `manifest.json`、`webpack.config.cjs`、`scripts/build.mjs`、`scripts/pack.mjs`、`scripts/verify-package.mjs`、`scripts/check-source.mjs`。
- `tests/**`、`docs/contracts/**`、`docs/framework/**`。

`features/scraping`、`plugins/scraping` 仅允许 T13 耦合外移与薄边界；不开发完整采集 UI、AI、引擎或导出业务。package/lock 仅既有 recipe 必需变化，不新增未经授权依赖。资源按实际消费者和许可迁入。先完成阶段0当前方案审批，再补既有F1 v2原型缺口，不要求完整editor/F2；必要临时 adapter 在 F2 归并或删除。

以下路径只读：

- `/Users/shopme/Documents/Codex/2026-10-02/opendesk-design-audit-continuation-01a0fc85`。
- `/Users/shopme/Documents/workspace/todo-user-vue/src-bex`。
- `/Users/shopme/Documents/workspace/scrapyJsChrome`。
- `/Users/shopme/Documents/workspace/scrapyJs`。

不恢复、消息启动旧任务，不发布，不自动启动采集、优化或验收 Goal。

## 完成标准不可省略

沿用原 T01–T13 分工及冻结 design、file-tasks、protocol-contract、compatibility-delta、scraping-delta-contract、migration-complete、test-spec、issues、source-evidence。它们位于只读审计根的 outputs；72 来源实际 rows、48 API 实际 items 位于 evidence/upstream-v3。现有 ledger 是证据基线，不是迁移完成。

只有一个 authority/broker/router/journal/IDB；每 run 的 page、精确 tab/frame/document/version 与真实 sender 身份保持一致。不能伪造 hostDocumentId、放宽 registerHost、从 payload 补缺失必需 sender 字段、共享 global page，或默认 active/allTabs。SDK 独立短服务仍走同底座与真实 sender/grant，不要求先起 controller；同页 token 不是第三方脚本强隔离。

A01 的持久原子前置准入、canonical digest、重复关联原 pending/durable/unknown、grant incarnation 与未知写不重放必须实现。A02 保留原 target，附导航 from/to，旧文档等待和元素失效；新文档身份、权限、lease、取消、deadline 重验后原子更新根 page。stop 不承诺撤销已发副作用。

revision 必须是 committed UTF8 bytes/hash，resolver 固定选中版本，CAS/head 与 pinned revision 分开；tombstone 不 GC 在途源码。所有终态与异常一次结算，late reply 不复活；effect、delivery、receipt、durable 与 download complete 分账。关闭工作台 fence，重开仅读持久状态；显式新 run，不恢复旧 JS 栈。

保留原 48 API 兼容要求：snapshot/serialized 或明确上下文错误、null/[]、type 追加/Typed、click/clicked、synthetic 输入与 Backspace 缺陷、function await/throw/无闭包、legacy string true/忽略 args、eval mode 歧义拒绝、业务 PageBrigeCode 非信封、undefined/有限数、Storage 真方法与 namespace、AppLocal 浏览器会话寿命与 SW 保留、formatJSON strict JSON/非法原文不执行、axiosx 四方法及投影/未知 config 拒绝、serverUtils 可观察状态/真实 latency/sentinel、remote/native/fullPage 等不虚报完成。SDK 使用固定旧 callback 一次 settle，relay/固定 MAIN 资源不是第二 authority 或 CustomEvent；无特权 eval/new Function、无 allow-same-origin、无主线程假 terminate。

F3 原必选 PROV/CMP/RESOURCE/EX/NAV/B01–05/AUTH/USC/CTRL/FIX/PLG/SVC/DLGEN/LEAK 全部实测。真实工作台、禁采集、r1/r2、pin、return/throw/durable/重开、双目标与撤权/停止/超时/host/Worker/port/SW loss、旧 SDK 各结果一次结算、B05 100 并发实际 HTTP 写一次与四 barrier、真实 IDB/CAS/abort/升级/重启、实际下载 complete 与文件 hash、资源基线与版本授权矩阵均不可跳过。R1–R8、历史 17 失败逐条实关，映射只是待办。

历史 153 same/7 drift 与 4 extra 分开；新增 generation 仅处理 11 选定来源中的 6 新漂移及争议闭包，不能重新全来源审计。来源、overlay、recipe、构建闭包和资源产物 manifest 需实际证据；构建不等于功能完成。

最终同一包 hash 绑定 case 报告、截图、日志、IDB、下载文件 hash、48/72 ledger、独立代码和功能 review，以及 execution-gates.json/framework-handoff.json；冻结 SDK/API/schema/version/grants 与公共 owner。全部必选通过才 frameworkFunctionalMigrationComplete=true。完成后停止，不自动进入 F4。
