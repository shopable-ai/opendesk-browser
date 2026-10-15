# GOAL：OpenDesk Browser Workflow R2.3 NEXT — PRODUCT-FIRST REAL EXECUTION & AI-FREE REPLAY

## 自然语言网页任务真实闭环、独立业务效果读回、保存后关闭 AI 的 Run×2、最小源码修复与分级验收

**日期：2026-10-15。默认中文。**

这是 Workflow R2 / R2.1 / R2.2 / R2.3 的**增量续接**。不重新立项、重建执行框架、重做 Phase 0 或只交付分析与另一份 GOAL。最高原则：

**USER OUTCOME FIRST / SOURCE FIRST / EXECUTION FIRST / INDEPENDENT BUSINESS PROOF / AI-FREE REPLAY / NO SECOND ENGINE / SAFE HTTP OPTIONAL / EVIDENCE-BOUND DELIVERY**

### 一、仓库、授权、资料与优先级

- Browser：https://github.com/shopable-ai/opendesk-browser 。唯一允许写入并正常推送 `main`。
- Go：https://github.com/shopable-ai/opendesk 。先核对最新 `AGENTS.md` 与实际允许分支；历史有效分支是 `master`。
- 可作为未来用户 Mac 工作目录：`/Users/shopme/Documents/workspace/opendesk-browser`；普通 ChatGPT 网页模式不能假定能操作 Mac Chrome、Profile、Native 进程及 `dist/development`。
- 用户明确授权在范围内通过已连接 GitHub 直接核对源码、修改、定向验证、提交和正常推送；禁止 PR、新分支、Worktree、强推、重置/覆盖他人改动、生产发布或操作凭据。普通可逆且不冲突的修改不反复请求确认。
- **唯一正式产品/架构合同**：`docs/architecture/browser-framework/workflow-ai-provider-routing-r2.zh-CN.md`，**先读第 13 节**“R2.3 产品优先执行总纲”，再按需读第 0/1/5/6/9/12 节。
- **唯一现有执行账本**：`docs/framework/workstreams/conversation-direct-r1-20261013.md`；UI 历史 `docs/framework/workstreams/workflow-ui-r17-minimal-20261014.md`；两个仓库现行 `AGENTS.md`、最相关的最新文件/blob SHA、与源绑定的 CI。
- 第 9 节历史 F0–F5 和第 10.3 节早期“先 F4 HTTP”是技术历史；**本轮 P0 C/D 实际业务闭环优先**，HTTP F4 不阻塞主线。旧 R16 的“生成→采用建议→再执行”不要恢复。

### 二、真正的用户成功定义（产品优先）

让不懂编程的用户完成：

**自然语言 Send → 受控观察精确当前网页 → Cloud Responses / Native Codex 规划合法 WorkflowProposal → 原 Compiler/RunHost 执行明示安全操作 → Durable Result 和实际网页读回 → 保存固定 Workflow/源码 SHA/Revision → 关闭 AI 后独立 Run×2。**

一次 Send 已明确授权的安全操作直接执行；Chrome 网站许可与单独网页数据分享许可仍是必要安全门禁。模型不能直接调用 chrome、shell、CDP、HTTP 代理进行网页副作用。

三个证据级别不可混用：`PROPOSAL_VALID`、`EXECUTION_RECEIPT_VERIFIED`、`BUSINESS_EFFECT_VERIFIED`。对于 click/search，没有受信且与用户业务目标独立绑定的效果 Oracle 时只报告执行回执；不允许模型自行生成 assert 作为独立业务成功证据。填写值的 `inputValue()` 匹配仅证明该页面输入框值，不能声称远端业务事务成功。

### 三、当前可继承状态（必须复查，不得当作当前验收）

- Browser 现有 `provider.js`、`ai-plan.js`、`responses.js`、`local-codex.js`、`observation.js`、`direct-execution.js`、`workflow-view.js`、`src/framework/workflow/{contract,compiler}.js` 已组成源代码业务路径；观察使用原 RunHost 可信回执；Save 与固定 Revision 有源码；真实 Mac Chrome/真模型/关闭 AI Run×2 **NOT_TESTED**。
- Browser 一次已确认的 Workflow CI [#38731748525](https://github.com/shopable-ai/opendesk-browser/actions/runs/38731748525)：旧候选 Node 123/123 PASS、`npm run check` PASS，`build:dev` 因并行 AdBlock Trusted source SHA pin 不匹配 FAIL，整条 CI FAIL。新 HEAD 必须重新按源身份判断。
- Go `master@27765894058885ce497f60d52d32582a4e53f82a`：Native Messaging [#38721532953](https://github.com/shopable-ai/opendesk/actions/runs/38721532953) 整体 SUCCESS；Windows Core [#38721532772](https://github.com/shopable-ai/opendesk/actions/runs/38721532772) 编译/构建步骤可通过但测试分类审计 FAIL，整体 FAIL。Go Gateway 同一 Native Host 复用 `h.ai`。
- Browser `local-http.js` 是独立受限协议适配器，**pairingReady=false、没有接入 Facade/UI**。安全配对、Bearer 撤权、Origin/Host/CORS 未闭合，不允许因本轮任务启用它。
- 上一轮给出的约 52% 是带权重的低置信度**规划估算**，不代表产品通过，不得无实证涨百分比或宣称 95+ 已实现。

### 四、按功能任务树实施（不得只提交文档）

**P0-A：用户任务和 Provider 入口。** 保留现有统一 Facade，不重新开发 Cloud、Codex 或新 Executor；核对意图与真实 Locator 校验是否仍有确切缺口。有则最小修复，无则不重复工作。

**P0-B：可信网页观察。** 复用原 CurrentPageTarget、Chrome Permissions、单独的网页数据分享批准、`observation.js` 固定源码/结果、RunHost 回执及相同文档身份。禁止为了展示效果绕过权限或动态执行模型脚本。

**P0-C：真实执行和业务效果（第一实现优先级）。**
1. 从最新 `src/ui/workflow/direct-execution.js`、`workflow-view.js`、Compiler、RunHost/Durable Result、相关测试恢复现状。
2. 对明确授权、低风险、可独立读回的填写、搜索或单次安全点击，设计最小业务 Oracle；必须从用户业务目标及受信页面证据建立验证，不能相信模型的“成功”声明。
3. 在原 RunHost/Task 结果边界实施有界读回与证据分级；若独立 Oracle 不可得，应明确展示“执行已核对，业务效果待确认”，不自动重放未知副作用。
4. 只补与实际缺口对应的定向测试，禁止发明第二 Controller、浏览器 Agent、CDP、shell 执行路径或二次无意义确认。

**P0-D：Save 与无 AI 独立复跑（第二实现优先级）。**
1. 核对 `workflow-view.js`、原 Controller Revision journal、Task、Compiler sourceHash/Definition 的同版本关系；仅修源码缺口。
2. 冻结已提交源码、schema、参数及 Revision；加载时核对持久源码字节和 hash。
3. 确认 AI/Cloud/Codex 不可用时，用户仍可用原 RunHost 触发保存版本（不请求 Provider）。
4. 为后续真实 Chrome 固定 Revision Run×2 提供最小定向验证；没有用户 Mac/Chrome 执行资源则写 `NOT_TESTED`，不得模拟原生已通过。

**P0-E/F：连续任务、Stop/撤权/未知、UI 体验。** 保留精确 `window/tab/frame/document/origin/url`、用户手势、撤权、Worker retirement、晚到回复隔离、未知效果不重试。仅修已复现的产品阻碍；简洁展示实际执行证据，勿增加冗余开关/确认和新状态管理器。

**P1 可选 HTTP。** Native 默认。Go Gateway 仅原 Native Host `h.ai` 的 loopback 子集；只有可信客户端配对、限时 Bearer 颁发/轮换/撤权、精确 Origin/Host/CORS、进程生命周期全部安全闭合并有真实产品需求后，才考虑 Browser HTTP Facade/UI 接入。未闭合保持 `SAFE_DISABLED`，不得放开 CORS 或暴露登录态。

**P2 构建与跨 Agent 阻塞。** AdBlock Trusted source SHA pin 归 AdBlock Owner；Go 测试架构分类账本归对应 Go Owner。记录具体 CI/候选，协调真实阻塞，不擅自重 pin、不修改他人范围、不因无关 CI FAIL 停止 P0 可独立完成的代码。

### 五、验收路径和实施节奏

- T1：现有 Provider/DirectExecution/Observation/Save/Go HTTP 严格协议的最小 Node/Go 定向回归及必要源码检查。
- T2：真实 Mac Chrome 在 `examples/tasks/demo-form.html`：一次 Send → 填入“ai自动化第一选择”→ inputValue 精确读回 + 持久回执。
- T3：同会话后续安全搜索/点击及独立业务结果读回；无 Oracle 则明确 EFFECT_NOT_VERIFIED。
- T4：保存 → 关闭 AI → 固定 Revision 独立运行两次，比较 runId/resultId/sourceHash、页面目标、业务效果；不得偷偷调用模型。
- T5：真实 Stop/撤权/Document 变化/Native 断连/unknown/晚到回复；禁止副作用重复执行。
- T6：经协调的同一 production candidate、构建指纹、正式扩展 ID、Chrome 实际安装、F3/ZIP 和逐维独立评审；没有真机证据不宣称 95+。

**本轮工作以核心功能源码收敛为主，不默认启动完整 Node 全套、全量 Go、二次 `npm run dev` watcher、用户 Mac Chrome、production 发布或最终验收**。只有相关依赖和独占环境具备时执行必要定向检查。Node/模拟 Chrome/真实安装 Chrome 的证据绝不互换。

### 六、立即执行顺序

1. 先读取第 13 节功能树及两个仓库最新 AGENTS/main/master、相关工作账本、最新提交和直接影响 P0 C/D 的文件。用极简“已有/接线/未实证/最小缺口”说明状态。
2. 检查其他 Agent 是否已修复。完成的直接继承，不重新增加 Provider 文件或重新设计。
3. **先实做 P0-C 缺口，再实做 P0-D 缺口**；逐个切片写实际源码、增量测试、最小运行证据，直接提交并正常推送授权分支。
4. 与 P0 无冲突时记录和协调构建问题；HTTP 保持安全禁用，不为满足文件数量强行接入。
5. 更新唯一正式 R2 合同的第 13 节与现有工作账本，保留旧 CI 与历史失败；绝不新建另一套总架构文档。
6. 最终给出：用户可完成的真实行为、修改文件、Browser/Go 本轮 SHA（与其他 Agent 分开）、实际测试及 CI 的绑定候选、哪些仅 SOURCE_WIRED、哪些 COMPONENT_VERIFIED、哪些 NATIVE_NOT_TESTED/OPEN，以及下一个能直接动手的最小源文件与完成条件。

**不要用新 GOAL、规划、演示图、ZIP 或独立 patch 代替实际代码修改。**
