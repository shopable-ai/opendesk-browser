# Global First R6 · AI → 固定 Task 安装：产品链工程进展（2026-10-13）

> 本文件仅记录 Global First R6 对首次用户成功的源代码修复及证据等级；不取代 R5 原始日志、GF/OPP/EXP 唯一账本。

## 起点、所有权与资源
- GitHub 远端 `main` 起点为 `245aa96dc58957e84e69030e8443a1a077c6b943`，任务书的 `35840e58` 是之前的远端快照。
- 本次执行通过已授权 GitHub Connector 对 `main` 提交；精确写入 `src/ui/task-workbench.js`、`src/ui/tool-shell.css`、`tests/environment/task-workbench.test.mjs`、`.github/workflows/global-first-r5-fixed-task-integration.yml` 及本工作流文档。保持其它 Agent 负责的 SDK/Controller/Task Service/Native/Cloud/依赖代码与公开契约不变。
- 此处仅占用远端 GitHub 文件写入与现有 Linux Node CI 触发；不占用用户 Mac CFT Profile、固定端口、dist/ZIP 或本地 Native Host。无法从当前环境读取用户 Mac 本地 `git status`、真实 Chrome、模型会话或 Native Codex；`LOCAL_STATUS=NOT_INSPECTED`、`MAC_NATIVE=NOT_TESTED`。

## 真正修复的首次使用阻断
1. **旧选择遮挡新 AI Candidate**：历史目录用下拉框当前值非空判断用户已选择，导致新 Workflow 同窗口真实 Candidate 交接无声跳过。现在真实选择变化有 epoch；合法哈希匹配的固定候选可以覆盖旧默认，但异步载入期间用户的新点击仍优先。绝不自动验证、发布或安装。
2. **验证回执串版**：接收另一 Candidate 的新交接时，旧输入框 RunId 不再保留；没有本次源身份对应的 RunId 就清空。用户主动切换 Candidate 也清空先前的 RunId；真实服务仍独立核验可信 Durable Result。
3. **没有源码审阅入口**：正式任务目录现在可展开查看完整冻结 JavaScript，调用已有 `getTaskCandidate` 重新读正式包，并核对 taskId/version/manifestHash/sourceHash；异步回应不能显示在已经切换的候选上。新增参数字段类型、必填及默认值的可读说明；无脚本执行、权限授予或自动安装副作用。
4. 不修改 Permission/Authority/Browser SDK/RunHost/Task 状态机，也不复活第二套 Runner/安装器。

## 历史与本轮证据严格分开
- R5 真实 Linux Chrome [#38368328878](https://github.com/shopable-ai/opendesk-browser/actions/runs/38368328878) 于旧 SHA 对预设 `sample.form-fill` 安装固定 Task 一次运行 PASS；不是新模型源码贯穿、也不是当前 Mac 版本通过。
- R6 UI 和身份防错目前 `SOURCE_IMPLEMENTED`，新增 DOM 假体拒绝性测试并复用现有 GitHub hosted Node CI 路径。**仅在原始 TAP/Job 证实之后才标 `NODE_PASS`**，绝不升级为 Chrome PASS。
- 完整真实 AI 生成 → 单一真实 Chrome Run/Result → Candidate/Verified/Available/Installed → 关闭模型 → 同一固定版本从「我的任务」独立 Run 两次及 Stop/撤权/失败恢复：`NOT_TESTED`。实际模型版本及 token 计费没有可信回执也保持未知。
- 官方全球/地区/任务第一已批准仍为 0；GF-013/GF-014 已证伪，EXP-002 仍归档。竞品真实全成本、用户转化、收入、SEO/GEO 和独立 95 分均 `NOT_SCORED`。

## 接下来唯一应优先关闭的真机验收
在独占合法 Mac Chrome、demo-form 页面与已连接的真实 Codex/模型条件下，采集同一真实 AI 提议、源 sourceHash、manifestHash、物理 PackageHash、Chrome/Extension ID、DocumentId、被审核的 Origin/参数、原生 durable RunId/ResultId/Worker retired、安装 installationId/generation；完全断开模型后，从原「我的任务」按钮同版独立 Run×2 并保存网页实际结果、Stop、撤权、失败恢复。证据不足保持 `NOT_TESTED/BLOCKED`，禁止把不同旧证据拼成 `AI_TO_INSTALLED_REPEAT_NATIVE_PASS`。

优先市场机会：OPP-059/057 企业内受控操作与表单；OPP-015 需真实卖家 Listing 数据；OPP-022/071 可考虑低风险试点。不发明全球第一或新收费成果。
