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

## R6 TOP20：真正的执行判定（不是全球/产品排名）

**NOW** 代表当前优先使用已有源码实施/验收；**NEXT** 代表已有明确需求但缺一次业务规则或许可；**RESEARCH** 代表缺用户频率、可靠数据或替代成本；**STOP** 代表当前独立项目应终止投入（若新的付费/合规实证出现可重新评估）。所有“节省 X 分钟”“有 X 客户”“收费”“强于竞品”的量化值均 `NOT_MEASURED`。以下按原 `opportunity-register.json.globalFirstR5Portfolio.top20` 顺序引用旧 OPP/EXP/GF，不创建第二个正式账本。

| TOP | OPP / EXP / GF | 用户真实任务与现成替代 | 真实成熟度与最小下一步 | R6 决策 |
| --- | --- | --- | --- | --- |
| 1 | OPP-059 / EXP-001 / GF-007 | 内部运营把已授权表单点击缩成固定按钮；Axiom.ai | 通用 Task 源码已具备；证明真实 AI 提议、用户审核、安装、关闭 AI 后 Run×2 | **NOW** |
| 2 | OPP-057 / EXP-001 / GF-007 | 行政/运营反复填写固定表单；Power Automate Desktop | 复用上条 demo-form；测填错字段、误提交与自然再次使用 | **NOW** |
| 3 | OPP-015 / EXP-005 / GF-009 | 卖家 Listing 标题、图片、属性遗漏；Axiom.ai | 尚无合规卖家数据/误报标注；取得真实字段规则与审核许可 | **NEXT** |
| 4 | OPP-060 / — / GF-004 | 内部 IT 审阅权限、版本、撤权与运行留痕；ScriptCat | SDK/Task 审核组件存在；先完成 R6 同一固定包的实际撤权/升级回执 | **NOW**（共用基础能力） |
| 5 | OPP-022 / EXP-003 / GF-003 | 研究人员保存引用的 URL、时间；Readwise/Glasp 等 | 有 Page/Task 底座但无原生完成的剪藏业务；自有网页一次保存后重访 | **NEXT** |
| 6 | OPP-025 / EXP-003 / GF-004 | 核对引用对应原始片段；Gemini in Chrome | 不得无源假定事实；先测原段定位、失效链接和未知态 | **RESEARCH** |
| 7 | OPP-071 / EXP-006 / GF-003 | 网站管理员核对 title、meta、canonical；Requestly/DevTools | 通用网页观察能力存在，独立 SEO 业务未原生验证；自有测试站提示缺失 | **NEXT** |
| 8 | OPP-072 / EXP-006 / GF-003 | 前端审阅 JSON-LD；Schema Markup Validator / 官方 Rich Results Test | 标准验证器很强；只有误报少、重复使用频繁时再建 | **RESEARCH** |
| 9 | OPP-016 / EXP-005 / GF-009 | 卖家人工核对并导出合法 SKU；平台原生 Export / Power Automate | 禁止恢复通用采集引擎；先证明平台自带导出不足并拿到授权样本 | **NEXT**（许可限制） |
| 10 | OPP-081 / — / GF-009 | 财务人员核对报表字段、币种/账期；Activepieces | 无受权准确样本；先验证官方字段口径和异常判定 | **RESEARCH** |
| 11 | OPP-010 / EXP-007 / GF-007 | 消费者对比到手价；Gemini in Chrome | 税运费/折扣数据缺准确来源；先测真实输入与价格误差 | **RESEARCH** |
| 12 | OPP-038 / — / GF-007 | 客服插入常用回答；Text Blaze | 现有模板工具可能更少步骤，缺独特优势；暂不单建产品 | **STOP** |
| 13 | OPP-031 / — / GF-003 | CMS 发布前遗漏提示；CMS 内置校验 / Text Blaze | 无被认可的审核规则与缺陷频率；先观察具体 CMS 未解决问题 | **RESEARCH** |
| 14 | OPP-013 / EXP-007 / GF-003 | 消费者保存购物规格；Gemini in Chrome | 平台/插件已有替代；无跨站频次与留存实证 | **RESEARCH** |
| 15 | OPP-073 / EXP-006 / GF-004 | 检查网页 301/302 重定向链；Chrome DevTools / Requestly | 替代工具成熟，未见固定 Task 独特价值；停止独立开发 | **STOP** |
| 16 | OPP-078 / — / GF-009 | 已授权表格复制/导出；Browse AI/官方导出 | 通用网页采集超出已排除业务范围；停止开发采集引擎，保留需求观察 | **STOP**（超范围） |
| 17 | OPP-027 / — / GF-004 | 研究者比较 AI 提示词与输出；Claude in Chrome | 需先证明对话/文档版本历史无法满足追溯 | **RESEARCH** |
| 18 | OPP-061 / — / GF-004 | 内部敏感字段发送提醒；1Password for Claude | 合规和误拦截风险；只有企业许可与误报样本后评估 | **RESEARCH** |
| 19 | OPP-082 / — / GF-005 | 运营无人值守定时核查；Apify Actors | Scheduler 组件有历史局部证据；长时间可靠性及未知副作用需真机 | **RESEARCH** |
| 20 | OPP-063 / — / GF-006 | IT 分发可审阅的固定版内部工具；企业软件分发/Microsoft RPA | 未有真实企业签名、安装合同或采购；不造新市场 | **RESEARCH** |

### 本轮最小可验证商业价值（仍未收集用户原始数据）

选 **OPP-059 / EXP-001** 做首个合法自有页面任务。优先观察实际第一次成功时间、人工点击/编辑次数、错误/误提交、两次自然复用是否发生、撤权后的行为、模型调用与维护费用；没有数据不填写“节省时间”数字。正式竞争对照先使用 Axiom.ai 的最佳自然流程，再评估 Google Chrome Skills、Claude in Chrome、ScriptCat、UiPath、Playwright + Tampermonkey。所有未实测竞品保持 `NOT_TESTED`，不能借竞争对象覆盖数宣称世界/区域/任务第一。

**继续投资条件**：至少一个非开发团队真实许可的用户重复同任务并愿意继续使用，且有完整同包原生 Run 回执；否则收敛为内部工具，不凭空扩成面向公众平台。

## 2026-10-13 竞品官方发布事实校正（不等于独立产品试用）

- **UiPath Delegate**：官方 [2026-08-25 Public Preview](https://docs.uipath.com/delegate/standalone/latest/release-notes/august-2026)，但 [2026-09-22 GA](https://docs.uipath.com/delegate/standalone/latest/release-notes/september-2026) 已支持企业内分享 Routines/Skills 及集中治理；不能仍以仅预览版对比。GA 日期与“最新稳定版本发布日期”是不同语义，不能伪造后者。
- **Claude in Chrome**：官方 [2026-08-26 宣布面向付费计划 GA](https://claude.com/resources/articles/claude-in-chrome-generally-available)，[帮助中心](https://support.claude.com/en/articles/12012173-get-started-with-claude-in-chrome) 记录 workflow/shortcut 与定时复用；快捷方式反复调模型与固定 JS 无模型运行是不同合同，尚未同机测算价格。
- **ScriptCat**：官方 [1.5.0-beta.4（2026-09-18）](https://docs.scriptcat.org/en/docs/change/beta-changelog/) 已有源码全屏查看、安装/升级权限差异审阅，并从更早 Beta 有 Agent/MCP。**这不属于其 stable 1.4.0**，但足以反驳“安装前源码可看 + 权限变化提示”为全球首创。
- **Axiom.ai**：[官方 Claude Skill 指南](https://axiom.ai/docs/claude-skill/) 已支持从自然语言生成可保存的无代码自动化，或使用 `@axiom_ai/api` 的 Node 脚本，依赖账户、运行方式和费用需按真实模式公平比较。

这些是来源核查，不是我们亲测：全部竞品 `independentBenchmark=NOT_TESTED`；OpenDesk 的 `GF-007` 仍 `NOT_APPROVED`。只有“真实同一源码包、无模型重复执行、公开/可审核版本、可撤权、具体成本与故障恢复”在双方同任务、真实样本下获证据，才可讲限定竞争优势。
