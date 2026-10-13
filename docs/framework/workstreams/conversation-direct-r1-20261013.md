# 对话式浏览器任务直接执行 R1

日期：2026-10-13。写入范围为 `shopable-ai/opendesk-browser` 的 `main`。

## 当前提交工作范围
- `src/ui/workflow/workflow-view.js`：发送 → 受控 AI 提议 → 现有 Compiler/RunHost → 持久回执 → 可选保存；不再需要二次点击“采用建议/运行”。
- `src/ui/workflow/direct-execution.js`：精确目标/用户字面量/副作用/回执的安全门禁。
- `src/framework/workflow/compiler.js`：仅直接执行使用的填写后 `inputValue()` 读回；旧工作流默认生成代码与 hash 不变。
- `src/ui/workflow/local-codex.js`、`src/ui/workflow/ai-plan.js`：限制 AI 提议动作在本次用户明确请求内。
- `tests/environment/workflow-direct-execution.test.mjs`：边界用例。

## 安全与后续验收
- Chrome 网站权限从真实 Send 手势申请；网页文字发往模型仍采用既有独立 `browser.observe` 审批，不绕过用户披露确认。
- 只通过原 RunHost 执行，不创建新的执行器、权限系统或代码生成执行世界。
- 高风险、副作用不明、填写值未明确给出及跨文档跳转不自动执行；终态未知不重试。
- 直接执行仅在 runId/resultId/sourceHash/精确文档/retirement 同时成立后报告成功。
- 未读取用户 Mac 本地 Chrome 或工作区：NATIVE_MAC_CHROME=NOT_TESTED；BUILD=NOT_TESTED；F3/ZIP=NOT_TESTED。
- 下一步验证：`node --test tests/environment/workflow-direct-execution.test.mjs tests/environment/workflow-local-codex.test.mjs tests/environment/workflow-r15.test.mjs`；`npm run check`；`npm run build:dev`。
- 在 `examples/tasks/demo-form.html` 真实 Side Panel 用一条「在输入框里填入 ai自动化第一选择」测试 Send→读回与持久回执，测试撤权、换文档、停止及保存 SHA；遵循 `docs/framework/testing-guide.md` 复用和资源独占约束。

## R1.1 GitHub `main` 定向修复与真实证据（2026-10-13）

**执行范围／资源：** 本轮通过授权的 GitHub 连接直接改写 `shopable-ai/opendesk-browser/main`，采用读取最新 main、核对目标文件 blob SHA、创建独立 Git 对象、非强制且带预期 HEAD 的原子推进；没有创建 branch、PR、worktree。访问不到用户 Mac 工作目录，未占用 Mac Chrome、测试端口、既有 `dist/development`、本地 profile 或 Native Host。GitHub Actions 是其自有 runner，不是用户日常 Chrome。源码／测试／workflow 文件已提交，远端 Git 写入事务完成并释放。

### 已提交源码及真实修复

- [`8875e748896c575910ed7c0f28bb6924d51ad960`](https://github.com/shopable-ai/opendesk-browser/commit/8875e748896c575910ed7c0f28bb6924d51ad960)：一次 Send 后沿既有 Workflow Compiler → RunHost，不新增执行环境；修复 `workflow-view.js` 运行回执引用未定义 `result`；直接执行校验 Run ID／Result ID／Controller 结果状态／源码 SHA／CurrentPageTarget（URL、window/tab/frame/document/origin）／Worker released；编译 `verifyFill` 模式返回实际 Locator `inputValue()` 的读回值；UI 发送文案与失败反馈；修复 CI 陈旧权限调用和 44px 设计断言，并在工作流 CI 加入 7 类定向测试、`npm ci`、`npm run check`、`npm run build:dev`。
- [`3fb26006fa0bd5a3954a870c4ac0b1975cef2a36`](https://github.com/shopable-ai/opendesk-browser/commit/3fb26006fa0bd5a3954a870c4ac0b1975cef2a36)：额外点击必须首先满足用户明确意图，再做敏感目标拦截；剔除填写数据中的“选择”“删除”等词汇造成的虚假执行授权／误阻断；“搜索框”不等于点击搜索；扩大覆盖。
- 本轮实际改动文件：`src/ui/workflow/direct-execution.js`、`src/framework/workflow/compiler.js`、`src/ui/workflow/workflow-view.js`、`src/ui/tool.html`、`tests/environment/workflow-direct-execution.test.mjs`、`tests/environment/workflow-ai-data-sharing.test.mjs`、`tests/environment/workflow-ui-states.test.mjs`、`.github/workflows/workflow-ai-data-r16.yml`、本工作流记录。

### 真实 CI，严格绑定提交

- 历史 R1 CI [`38415718234`](https://github.com/shopable-ai/opendesk-browser/actions/runs/38415718234)：原 57 项 54 PASS／3 FAIL（填写值词汇被误判为点击授权、网站／Provider 同一 Send 权限请求与旧断言不符、36px 测试与现行 44px 样式不符），保留历史失败，不覆盖。
- R1.1 第一源码候选 `8875e748...`：GitHub Actions [`38428906036`](https://github.com/shopable-ai/opendesk-browser/actions/runs/38428906036) 的真实 7 文件 Node 测试 **97 total、96 PASS、1 FAIL**。唯一失败是返回 `E_AI_REVIEW_REQUIRED` 与要求先报告 `E_AI_UNREQUESTED_ACTION` 的断言不符（`#submit` 的敏感目标检查早于用户意图检查）；对应源与测试在第二提交已修复。本次失败使首轮 `npm run check`／`build:dev` 被 CI 跳过，**不得称它们 PASS**。
- 后续候选 `3fb26006...`：GitHub Actions [`38429394001`](https://github.com/shopable-ai/opendesk-browser/actions/runs/38429394001) 触发并排队。仅在读取其 job 原始状态与日志后，才可将 Node／Build 从 NOT_TESTED 改为 PASS 或 FAIL。
- 目标命令：`node --test tests/environment/workflow-direct-execution.test.mjs tests/environment/workflow-local-codex.test.mjs tests/environment/workflow-r15.test.mjs tests/environment/workflow-ai-observation.test.mjs tests/environment/workflow-ai-data-sharing.test.mjs tests/environment/workflow-ai-transport.test.mjs tests/environment/workflow-ui-states.test.mjs`；`npm run check`；`npm run build:dev`。CI 日志和源码身份必须对应同一 `head_sha`。
- Mac 本地 `dist/development` 真正安装版本和页面状态不可从 GitHub HEAD 推定；其产品验收 **NOT_TESTED**。历史 R13.1 Chrome／Locator 验收可作架构参考，但 R1.1 changed compiler／direct-execution／UI 新候选不可继承历史 NATIVE_PASS。

### R1.1 六 Gate 当前含义

| Gate | 当前级别 | 证据与仍需验证 |
| --- | --- | --- |
| G0 最新主干与现有执行契约 | PASS（远端源码核查） | GitHub main、AGENTS、RunHost／Controller 状态投影及两项历史提交已核对；Mac 本地工作树不可见 |
| G1 用户 Send → 实际 RunHost | NOT_TESTED（原生链路） | 代码已接线，Node 源码测试不是实际 Send／RunHost |
| G2 Chrome 填写／点击／读回 | NOT_TESTED | 需同一构建真实 Side Panel、用户可信 Send、真实页面 `inputValue`／持久 Result |
| G3 授权／文档／Stop／未知结果 | NOT_TESTED（原生） | 现有 RunHost 安全栅栏复用，负路径已有组件覆盖；真实撤权／刷新／Stop／Native 中断仍待测 |
| G4 Side Panel 和可选保存 | NOT_TESTED（原生） | 代码已改，缺真实窄视口／焦点／保存后无模型重复 Run 的证据 |
| G5 Node／Build／CI／集成 | FAIL（首轮 CI）；新候选待验 | 已安全提交到 main；按 `3fb26006...` CI 的真实结果另行更新 |

**R1.2 尚不能宣布可进入产品验收：** 至少先补齐 R1.1 十场景同一候选真实 Chrome 正例、权限和 Stop／unknown、持久身份与独立保存后重复执行证据。后续多轮观察／跨文档只扩展既有 Controller／RunHost，不另造 Agent Runtime。没有完成的 Gate、原始日志或独立评审，均不得自评专家 95+。

### 本地 Chrome 的剩余验收操作（没有声称执行）

保留用户既有 `dist/development` 与扩展 ID；复用 `http://127.0.0.1:43111/demo-form.html`，在真实 Chrome Side Panel 仅发送一次「在输入框里填入 ai自动化第一选择」，记录真实 tab/document、页面读回字符串、RunHost `runId/resultId/sourceHash` 与 `workerRetired/retirementState`；扩展为安全按钮点击、填写→搜索、无定位、刷新、Stop、撤权、未知结果、可选 Save 与不调用模型的独立复跑。失败不得重放有副作用的动作；所有原生缺口维持 NOT_TESTED。
