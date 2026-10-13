# Global First R4 — 真实来源与单版 Chrome 验收门槛

> 2026-10-13。此目录的 [原始研究索引](research-evidence.json) **不是第二套 GF 声明账本**；声明审批继续使用 docs/product/browser-extension-ecosystem/first-claims-ledger.json。来自公开官方来源的产品版本不是同机性能测量，历史发布记录若无法证实首次功能时间则必须 UNKNOWN。

## 本轮已真正完成

- 30 个竞品对象与其来源/channel 时间，保留 Stable / Beta / Web Store update / monorepo subcomponent 的区别。
- 26 个真实任务候选、战略 TOP 5、五份中英文说明、24 个 Google/Bing/AI 搜索意图。
- 实际读取远端 main 的 workflow-view、local-project-install、Task、依赖锁、云控和既有旧浏览器证据；没有接管任何 Mac/CFT/Node/Native 资源。
- 没有新增或运行可声称实际 Mac Chrome 通过的代码、录像、真实 AI 成本或排名。全部浏览器原生、竞争实测、公众下载和 SEO 推荐 **NOT_TESTED**。

## 原版 Demo：从 AI 生成到断开 AI 重用

原有文件 examples/tasks/agent-modern-search.v1.opendesk-task.json 与 examples/tasks/modern-search-draft.js，演示网页 http://127.0.0.1:43111/demo-form.html。原 Candidate 声明 sourceHash=1618934805a4104191be8e2005a608d0537a51ca65c1e291c8a8fb042ed34b2d、manifestHash=a40fe6471506743a785ab32fd85a48f3991a641fb3c28741735c20e799d13812，**绝非本轮 Chrome 真回执**。

1. 独占资源负责人先检查本机 main、git status、CFT Profile、43111/Native/包哈希、并行 Agent 占用。不能确定独占即保持 BLOCKED/NOT_TESTED。
2. 用户在有权页面用真的本机 Codex 或自有模型提出搜索/表单计划，审阅脚本、目标、步骤、参数、许可。任何源码变化生成新 hash、不能冒用旧 Candidate。
3. 实际 Chrome 授权和用户动作，经原 Authority/RunHost 执行，获得可信 documentId、runId、resultId、result.revision.sourceHash、页面效果与退休状态 released；出错时 UNKNOWN 不能自动重放。
4. 相同冻结代码进入原 Task Candidate→Verified→Available→Installed，核对 taskId/version/manifestHash/installationId/generation。关闭模型/开发工作区后**独立 Run 两次**，必须产生两个不同 runId/resultId 且不调用 AI。
5. 做 Stop、失联、权限撤销、升级、重启后的合法恢复检查；Stop 不回滚已产生的业务副作用。
6. 同机同任务再对照 ScriptCat Beta、Axiom Claude+扩展、UiPath Delegate Preview、Automa、AI coding+Vite+管理器，用真实首用、5 次冷启动、10 次热运行、3 次恢复和 20 次全费用、成功率及人工步骤统计，不得将没测试的产品判输。

本轮结论：源码链有可复用基础，但缺少该同一当前产品包的完整原生验证，评分 NOT_SCORED。后续只需实施上述单一可信 E2E，**无需重建 Browser SDK、Task Store、Authority、RunHost 或 Cloud Runner**。

## 原研发工作的所有权

- docs/framework/workstreams/r16-local-codex-r2-20261010.md：AI/Native Codex 真实执行边界。
- docs/framework/workstreams/local-project-install-r251.md：原版安装和核验。
- docs/framework/workstreams/cloud-control-r5-01-generic-task.md：已安装多任务云端回执仍待本机。
- docs/framework/testing-guide.md：同包与证据复用要求。
- docs/product/browser-extension-ecosystem/global-first-r2-decision.zh-CN.md：竞争优先级。
