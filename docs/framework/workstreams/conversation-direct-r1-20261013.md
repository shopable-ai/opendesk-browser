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
- 最终源码候选 `3fb26006...`：GitHub Actions [`38429394001`](https://github.com/shopable-ai/opendesk-browser/actions/runs/38429394001) / job `115407270333` **completed/success**。原始日志：定向 Node 测试 **98/98 PASS、0 FAIL**；`npm run check` **PASS**（实际检查 658 个源／测试／构建文件、CSP 和固定运行入口）；`npm run build:dev` **PASS**（真实 WXT/Vite development 构建，133 assets，`packageHash=f6d29d187338dd83c27759e1385afda2d729e2312bdfaa08bfee81ba2e0e1c72`）。该 runner 为 Ubuntu / Node 22，不是用户 Mac Chrome。构建同时报告 `ui/tool-shell.js` 大小 521455/524288，距预算仅余 2833 bytes，属后续构建预算风险而非此次失败。
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
| G5 Node／Build／CI／集成 | PASS | `3fb26006...` GitHub workflow `38429394001`：98/98 Node、npm check、build:dev 均 PASS；工作流记录及两个源码提交均已写入 `main` |

**R1.2 尚不能宣布可进入产品验收：** 至少先补齐 R1.1 十场景同一候选真实 Chrome 正例、权限和 Stop／unknown、持久身份与独立保存后重复执行证据。后续多轮观察／跨文档只扩展既有 Controller／RunHost，不另造 Agent Runtime。没有完成的 Gate、原始日志或独立评审，均不得自评专家 95+。

### 本地 Chrome 的剩余验收操作（没有声称执行）

保留用户既有 `dist/development` 与扩展 ID；复用 `http://127.0.0.1:43111/demo-form.html`，在真实 Chrome Side Panel 仅发送一次「在输入框里填入 ai自动化第一选择」，记录真实 tab/document、页面读回字符串、RunHost `runId/resultId/sourceHash` 与 `workerRetired/retirementState`；扩展为安全按钮点击、填写→搜索、无定位、刷新、Stop、撤权、未知结果、可选 Save 与不调用模型的独立复跑。失败不得重放有副作用的动作；所有原生缺口维持 NOT_TESTED。

## R1.1-P0：真实观察范围与 Codex 目标绑定（2026-10-14）

**工作所有者：** 本轮 GitHub 连接会话；仅操作远端 `shopable-ai/opendesk-browser/main`，通过带预期 HEAD 的非强制原子 ref 更新；不占用用户 Mac 工作目录、Chrome Profile、43111 端口、`dist/development` 或 Native Agent。起始远端 HEAD：`89c3b298dc3cf8927b227b041b101770780ce58a`；执行前仍须重新取最新主干。

**最小写入范围：** `src/ui/workflow/observation.js`、`src/ui/workflow/workflow-view.js`、`src/ui/workflow/local-codex.js`、`tests/environment/workflow-ai-observation.test.mjs`、`tests/environment/workflow-local-codex.test.mjs`、本记录。保持原 RunHost / Workflow Compiler / Native Agent RPC / Chrome 权限路径。

**P0 修改意图：**
- 同一固定、不可由模型提供代码的 Controller 观察源码首先采样有限 body 节点，然后仅按当前用户请求在最多 12 个有 ID 的通用 `section/form` 范围检查语义目标；允许加入至多 24 个可见、有唯一 Locator 的节点；不硬编码 `#lab-search`。不能通过无限增大预算绕过上限。
- 单次原 RunHost 观察的参数仅来自用户当前请求；成功回执增加原始 DocumentId，保留 Run ID、Result ID、Source Hash 和 Origin；Site Permission、Document 重验及单独网页数据发送审批仍有效。
- Codex 若未发起真实获批 `browser.observe`，或填写／点击的 Locator 不存在于该次观察摘要，不允许返回可直接执行的方案；不执行模型 JS，不增加第二次任务运行确认。
- 定向 Node 测试覆盖限额局部观察、回执绑定、模型跳过观察、凭空猜测 Locator、错误 DocumentId、拒绝审批等情况。

**验证等级（本记录随本次远端源码提交，最终以同一候选 CI 实际日志为准）：**
- G0 GitHub `main` 源码与原 RunHost 使用路径：PASS（远端只读与差异核对）。
- G1 真实 Codex Session/Turn 和实际页面内容被模型接收：NOT_TESTED（无用户 Mac Native 会话）。
- G2/G3 三个真实 Chrome 场景与网页副作用读回：NOT_TESTED（无 Mac Chrome）；Node 行为覆盖不能提升状态。
- G4 原生权限撤销、Document/Stop、Native 断连：NOT_TESTED（原生）。
- G5 定向 Node、`npm run check`、`npm run build:dev`、同候选 CI：待新提交 GitHub Actions 执行后逐项更新，禁止预写 PASS。
- 日常 Chrome 扩展路径／ID、真实观察和执行的 Run ID／Result ID／Source Hash、实际页面值、Worker 退出、保存后独立复跑：均为 NOT_TESTED；无伪造日志。

### R1.1-P0 远端实际实施与同候选定向验收结论

- 本次远端 main 原子提交（无分支/PR/worktree、无强推）：
  1. `c29f35fa4ea1a465b144e0a1f7751d774bd1ab24`：有限语义分区观察、DocumentId 绑定、Codex 必须先得到真实观察回执、操作 Locator 与获批观察结果匹配、Node 用例。
  2. `8d6e7a9885f8fb21111485fc284ff03b66bed296`：去除直接执行后已过时的二次采用入口及提议预览代码，回收固定入口体积。
  3. `cc49dc222dc46177d2f528ed3909ce994d4a1625`：在不改权限/执行安全栅栏、不提高构建上限的前提下精简固定观察源码及模型规划提示；复核关闭/未知状态的注释。
- 严格绑定 `cc49dc222dc46177d2f528ed3909ce994d4a1625` 的 GitHub Workflow **[38440556286](https://github.com/shopable-ai/opendesk-browser/actions/runs/38440556286)** / job `115445708572`：**102/102 Node PASS，0 FAIL**；`npm run check` PASS（检查 658 个文件）；`npm run build:dev` PASS（133 资源，`packageHash=43f445005a2d6052b6d1874ce0b243f1b8e4d845297d273b93acfb4fdc42b055`）。开发构建的固定 `ui/tool-shell.js` 为 **524180/524288 B**，仅剩 108 B，后续须在独立工作范围拆包或压缩，不提高硬限制。
- 历史候选 `c29f35fa...` 与 `8d6e7a98...` 的定向 Node/Check 步骤成功，但开发构建分别超预算，保留 FAIL 事实。当前源码候选修复并验证后才有上述 PASS。
- 共享 `site-access` / `sidebar-r1-p0` 等其他 GitHub 工作流有失败，部分与旧 `89c3b298...` 候选相同；**不得把定向 Workflow CI 的 PASS 记为全仓库 CI PASS**。需按各工作流的实际失败记录由所属负责人分开修复。
- 用户 Mac 工作目录 `/Users/shopme/Documents/workspace/opendesk-browser` 在本执行环境不可访问；未读取 Mac git status，未控制 Mac 已加载 `dist/development` 扩展、profile、Native Host 和 Codex Session/Turn。因此 Scenario A/B/C 真正 Send 后的观察/推理/RunHost/网页副作用、原生授权与撤销、Stop/Unknown、保存工作流再运行、原生扩展 ID、Run ID/Result ID/Source Hash、Worker retirement 与原生结果验证 **全部 NOT_TESTED**。未产生此类原生回执，也未宣称真实浏览器 PASS。
- 写入文件占用、GitHub 远端原子写入事务已经完成并释放；未占用任何用户 Mac 的进程或共享资源。源代码改动已经提交在远端 `main`，不是本地 Mac Git 同步或真实 Chrome 交付的替代物。

- 同一源码候选 `cc49dc222dc46177d2f528ed3909ce994d4a1625` 的另一个完整 GitHub Actions **[38440556223](https://github.com/shopable-ai/opendesk-browser/actions/runs/38440556223)** / job `115445708186`：production WXT/固定入口审计 PASS，dev resources + SW allowance PASS，末段构建合同测试 **11/11 PASS**；生产与开发实际 `ui/tool-shell.js` 固定入口均记录 **524180/524288 B**。这是 GitHub Ubuntu runner 上的构建／打包验证，不是用户 Mac 原生 Chrome，剩余预算仍仅 108 B。
