# 工作流同源交互 Preview

2026-11-21 更新「新工作流」的 320px、360px 浅色侧栏。全宽多行输入框、AI 来源和发送／停止始终留在工作区底部；上方欢迎、示例和对话独立滚动，正文不被盖住。示例默认收起，展开后可用鼠标或键盘填入或追加草稿，选择后焦点回到输入框。使用 Shift+Enter 换行，发送后可在原位置停止规划。

Ego Lite 在 320×560、320×320、360×560、360×320 实测，检查了空白、展开示例、草稿、长草稿、查找、规划及对话滚动。输入区下边缘与工作区底边保持 8px 间距，四种尺寸均无横向溢出；来源切换、焦点顺序、发送／停止和换行均通过。证据见 `artifacts/workflow-preview/bottom-composer/`。同源指纹检查通过；真实输入法、已安装的 Chromium 侧栏、真实 AI 来源和生产环境未验证。

本轮首版获 **93/100、94/100**；根据评审压缩矮侧栏输入区、分隔运行按钮与草稿、明确示例的「填入草稿」动作并收敛规划态的视觉干扰。两位独立评审对修改后的同一组实拍截图均给出 **96/100**。评分只适用于上述离线候选。

以下为历史全流程验收记录；其中的指纹和评分属于此前交付候选。

上一版将输入放在欢迎标题下。该离线候选当时获得 96/100、97/100，并通过 27 项检查；评审未覆盖底部输入要求，分数不用于本次验收。旧证据见 `artifacts/workflow-workspace-ui/`。

本轮完成标准：连续体验提示词之后的流程，理解方案、执行状态、结果、修订与下一步。证据等级仅 **UI_PREVIEW_ONLY**。目标为本轮离线 UI/交互独立评审 ≥95/100，不能推导真实模型、Chrome、网站或 production 验收通过。

入口：`/Users/shopme/Documents/workspace/opendesk-browser/prototypes/sidebar/workflow/react-preview/index.html`，直接打开即可。沿唯一生成器 `node scripts/preview/build-workflow-react-preview.mjs` 更新，`--check` 检查当前字节与全部依赖来源。无需产品构建、服务器、登录或安装。

默认打开「自动推进演示」和「步骤处暂停检查」：示例 → 手动发送 → 查找 → 必要规划 → 查看/编辑步骤 → 继续执行演示 → 结果 → 继续修改 → 保存 → 历史 → 打开版本。取消「步骤处暂停检查」后，合格的新方案可直接进入执行演示；已匹配的样例程序直接复跑，没有强制采用/批准计划步骤。场景菜单选中关键状态时关闭自动推进，便于定格检查，正常按钮仍可继续。

所有样例和保存版本只存在本页内存，重开页面会清空。自由输入仅支持确定的姓名/邮箱、文章读取、只读检查与受限商品搜索样例；不声称理解任意任务。自然语言商品复用沿正式 `simpleCommerceReplayGoal` 语法，只在内存中存在相应已完成多段版本时命中。可先选择「多段工作流」生成内存版本，再点新对话并发送“搜索 lens，打开 Lens Y 商品详情，核对名称和价格。”检查不调用 AI 的复跑路径。

## 链路与状态覆盖

表中“覆盖”均指离线样例，不能当成真实授权/执行。“正式源码入口”是对照位置，不表示原 controller 已实现相同的模拟状态转换。正式业务所有权继续在 `src/ui/workflow/workflow-view.js`，React 只投影 UI，执行/安装/Authority 未修改。下面另列已核对的正式语义差异。

| 用户操作 | 前置条件 | 可见内容 | 下一步 | 取消/返回 | 失败/未知 | 正式源码入口 | Preview 覆盖 |
|---|---|---|---|---|---|---|---|
| 空白、点击示例、自由输入 | 空白或已有草稿 | 欢迎、草稿追加，不自动发送 | Enter / 发送 | 保留输入 | 空输入禁发；重复示例不重复追加 | workflow-view.js `chooseExample`；draft-suggestion.js | 已覆盖；确定内存样例 |
| 发送与多轮输入 | 来源就绪、非忙态 | 本轮请求；查找进度 | 复用/必要规划 | 取消查找回填草稿 | 忙态重复发送、IME Enter 禁发；Shift+Enter 换行 | workflow.tsx `SharedConversationFrame`；conversation.tsx | ego 实测 |
| 来源不可用与恢复 | 未配置/连接中/中断样例 | 来源原因、恢复入口 | 恢复离线样例、继续草稿 | 原 AI 设置可关闭 | 发送禁用，草稿不丢 | workflow-view.js Provider 投影；共享 provider-settings.tsx | 已覆盖；不建立真实连接 |
| 查找复用程序 | 已发送、当前网站样例 | 查找中、单匹配、多个候选 | 单匹配直接复跑；候选明确选择 | 取消恢复原方案与新请求草稿 | 查询失败与无匹配分开；失败不直接进入 AI | workflow-view.js `sendNaturalLanguage`；workflow-reuse.js；installed-task-reuse.js | 单/多/补参/失败及普通输入命中已覆盖 |
| 缺参数追问 | 候选缺商品名称 | 问题及输入框 | 校验商品名后沿同一轮复跑 | 取消复用；新任务退出追问 | 不猜商品；新对话不继承场景覆盖 | workflow-reuse.js `naturalProductReply` / `MISSING_PRODUCT`；workflow-view.js 复用分支 | 场景与普通缺参输入均覆盖；内存查询不证明真实目录匹配 |
| 必要规划与停止 | 查无匹配、来源可用样例 | 理解/规划进度，明确未执行 | 返回语义方案 | 停止规划回填请求 | 格式失败保留原因，可重试规划 | workflow-view.js `plan` | 已覆盖；非真实流式模型 |
| 查看/编辑 1…N 步 | 当前语义方案 | 默认自然语言编号摘要，展开编辑 | 增删、上下移动、参数化 | 收起编辑 | 引用不存在参数/必填值错误会阻断运行 | workflow.tsx `WorkflowStep`；workflow-view.js actions | 2/3/4/5/6 步样例；增删排序实测 |
| 修订与旧结果归属 | 旧轮已执行，再编辑/发送 | 当前轮次/修订与旧执行记录分开 | 新方案明确运行 | 保留旧记录 | 超出原样例的编辑不能继承旧成功结论；复用换参数形成新修订 | workflow-view.js 分段/消息；workflow.tsx | 样例执行快照固定；编辑后保存不会升级为已核验；ego 实测 |
| 原语义准入 | 无新审阅需求样例 | 等待/执行；不增加通用模型授权 | 普通填写可直接运行；受限样例自动复用 | 执行前取消 | 手动点击/跳转/敏感填写沿原纯风险分类审阅；无效步骤阻断 | direct-execution.js `classifyWorkflowRunRisk`；workflow-view.js `run` | 共享纯分类；样例直接复用不等于正式动态 Bundle 验证 |
| 网站权限、风险与失效 | 缺网站权限/包含提交/目标变化 | 精确样例 origin、后果、失效原因 | 允许本轮演示/重查目标 | 拒绝/取消不执行且保留未满足条件 | 修改使旧审阅失效；再次运行重新审阅，无通用模型许可 | workflow-view.js pendingRunReview / run / runManual | 三个分支及反方拒绝后重跑已覆盖；没有真实权限请求 |
| 参数校验 | 方案含必填/参数引用 | 原运行参数表单、持久错误 | 修正后运行 | 返回参数/步骤 | 空白、超长、参数不存在、命名重复 | workflow.tsx params；workflow-view.js setParam | 已覆盖 |
| 等待、运行、停止中 | 合格方案/参数样例 | 当前所处阶段、下一步和停止 | 展示结果/等待停止结算 | 执行前取消与停止后续动作分开 | 部分效果保留，不声称回滚 | workflow-view.js stop；agent-loop.js | 已覆盖；未伪造逐步事件高亮 |
| 已核验成功 | 与内存核验样例兼容 | 做了什么、核对什么、未提交什么 | 继续修改/保存 | 可新对话 | 不能由规划文字推出成功 | execution-feedback.js；workflow-view.js durable result | 样例回执，非真实网站证据 |
| 结束但未确认/失败/部分/未知 | 对应样例或编辑超出核验样例 | 持久原因、原轮次/修订、已发生/未完成、安全下一步 | 核对或修改草稿；可独立只读检查 | 保留原结果 | 未知效果围栏跨新消息、新工作流、历史重开保留；保存/编辑/只读成功不能解除 | workflow-view.js result settlement；execution-feedback.js | 四类及正式复用同义语法已实测，提交不再误报未提交 |
| 保存与重试 | 当前方案或执行记录有更改、非运行 | 未保存/保存中/已保存/失败 | 仅重试保存、查看版本 | 原草稿保留 | 保存失败不重复执行；保存后修改及复跑记录均可保存新版本 | workflow-view.js save / refreshSaved / onHistoryClick | 内存样例；当前视口回执可见；新旧完整记录可重开 |
| 历史空态、列表、打开、返回 | 非忙；有内存版本或空态 | 版本标题/版本号/原完整对话 | 打开版本/再次运行此版本 | 显式返回 | Preview 脏草稿使用统一 Confirmation；网站不匹配禁跑 | workflow.tsx `WorkflowHistory`；workflow-view.js onOpenSavedHistory | 已覆盖；完整对话恢复与该脏稿确认仅内存模型实现，不读取持久存储 |
| 新对话 vs 新工作流 | 非执行中；规划时可先取消 | 新对话退出历史、保留当前方案；新工作流清空当前对象 | 继续输入/新方案 | Preview 脏稿确认默认取消、Escape 返回 | 不清除网站、来源与未满足网站权限上下文 | workflow-view.js onNewSessionClick / onNewWorkflowClick | 已覆盖；新建确认仅模拟行为，不声称原 controller 同步具备；不恢复真实 Codex 历史 |
| 多段工作流与复跑 | 已保存的商品样例 | 搜索页→详情页完整顺序；原结果与当前方案区分 | AI 关闭的保存版本复跑，或继续对话 | 返回工作流 | 完整 Bundle 暂无已核实 Task 导出入口 | segment-replay.js；workflow-view.js bundles | 已覆盖显示与复跑样例；不伪造完整 Bundle 安装 |
| Task 后续交接 | 已保存且未修改单段版本 | 当前对象、目标目录、返回工作流 | 候选→目录审阅/同源码验证→可用→安装→我的→运行/计划 | 返回当前工作流 | 保存≠候选≠验证≠安装≠计划 | task-review-handoff.js；task-workbench.js；scheduled-task-workbench.js | 说明与返回可操作；跨 Tab 实际动作 NOT_TESTED，按钮不会伪装安装成功 |

### 正式 controller 与模拟层差异

| 行为 | 正式源码实读 | 本候选状态 |
|---|---|---|
| 编号步骤、字段、参数、历史导航、管理入口与焦点恢复 | 复用 `WorkflowPage` / `WorkflowHistory`；本轮补参数删除焦点、显式请求展开字段 | 正式展示层已改；定向组件验证，安装运行态 NOT_TESTED |
| 普通手动 Run 风险分类 | `run` 调用 `classifyWorkflowRunRisk`，审阅绑定原冻结源码和目标 | Preview 只复用纯分类；演示允许不是权限或执行授权 |
| 自然语言商品目标与补参回复 | `simpleCommerceReplayGoal`、`naturalProductReply`；真实候选还需目录与 Bundle 校验 | 共享受限解析；缺参变体只在内存中补名称后继续，不冒充真实候选校验 |
| 历史遇到脏稿 | `onOpenSavedHistory` 拒绝打开并提示先处理更改 | Preview 使用共享 Confirmation；正式 controller 的确认流程 NOT_IMPLEMENTED_BY_THIS_CHANGE |
| 历史读取后的对话 | `loadSaved` 清空对话后恢复源码与版本 | Preview 恢复内存完整对话和各轮参数；正式完整对话恢复 NOT_IMPLEMENTED_BY_THIS_CHANGE |
| 新建工作流的脏稿保护 | 原 `onNewWorkflowClick` 直接重置 | Preview 有取消/确认；正式 controller 的保护 NOT_IMPLEMENTED_BY_THIS_CHANGE |
| 规划进度、已发生效果与执行记录 | 原 controller/RunHost 有各自回执和分段语义 | 模拟推进器只生成样例；每轮固定步骤、参数、模式和修订，不是真实事件 |
| 持久保存、跨 Tab 候选/安装/计划 | 原 controller 与对应业务 owner | 离线只保存内存及展示交接说明；实际链路 NOT_TESTED |

## UI 与源码决策

- 正式组件 `src/ui/react/tabs/workflow.tsx` 继续使用唯一 Root 与 SharedConversationFrame；上下文反馈、示例、历史返回、编号摘要和忙态编辑保护沿现有展示。续接本轮补上参数移除后的相邻字段/输入焦点，以及显式焦点请求对折叠字段的展开与可见性；管理区复用原焦点样式。运行逻辑与权限来源未改变。
- `src/ui/react/tabs/workflow.css` 仅持有工作流展示规则，复用 Tokens，长标题使用共享 disclosure 的单个 span 布局；去掉步骤列表内层限高，使用原页面滚动。
- Preview adapter 和 `workflow-preview-model.js` 独占内存样例、推进器、保存版本与场景切换。结果固定执行时步骤、参数、模式、轮次与修订；编辑后不沿用旧核验。多个候选按真实数量、标题、版本和稳定key列出；无候选补参后先规划；动作切换按正式默认字段重建并清除隐藏引用；等待时长按正式规则转换为数字。新对话撤销待决反馈并恢复保留的方案。首次合法商品请求绑定实际关键词/商品，取消保留期间新草稿或显式清空，补参识别新任务/取消并只覆盖当轮；文章任务不继承商品分段。手动风险分类及目标说明直接复用原纯函数，未知结果保留实际动作，不混写提交；不构成授权。
- 方案、结果与编辑区按上下文出现；顶部轻操作，输入与当前动作在底部。成功/错误状态位于当前视口，不仅追加到对话末尾。
- Preview 高级用途/Schema 编辑禁用并明确提示；正式产品原编辑能力不变。参数字段、参数定义、参数化、步骤编辑可操作。
- 生成器复用已有 `@opendesk/ui` 别名修复预览打包；CSP 保持 `connect-src 'none'`，无网络脚本/网站 iframe；不引入第二套工作流 JSX、执行器或权限系统。

本轮改动文件（其他 dirty 文件属于并行工作）：

```text
src/ui/react/tabs/workflow.tsx
src/ui/react/tabs/workflow.css
src/ui/react/preview/workflow-preview.tsx
src/ui/react/preview/workflow-preview-model.js
scripts/preview/build-workflow-react-preview.mjs
prototypes/sidebar/workflow/react-preview/index.html
prototypes/sidebar/workflow/react-preview/README.zh-CN.md
prototypes/sidebar/workflow/react-preview/AUDIT.zh-CN.md
tests/environment/workflow-react-preview-contract.test.mjs
tests/environment/workflow-preview-simulation.test.mjs
tests/environment/workflow-focus.test.mjs
```

## 最小验证与截图

证据目录：`/Users/shopme/Documents/workspace/opendesk-browser/artifacts/workflow-preview/`。以下文件均重新绑定本轮最终候选，旧候选评分不作本轮签核：

| 当前证据 | 实测范围 | 结果 |
|---|---|---|
| `interaction-results.json` | 正常按钮连续链、IME/Enter/Shift+Enter、编号/编辑/参数、修改/保存/历史、脏稿 Escape | 21项通过 |
| `adversarial-interaction-results.json` | 拒绝/取消/跨保存重开、审阅过期、网站不匹配、旧方案/结果与复跑、忙态参数、返回不重跑 | 34项通过 |
| `scenario-results.json` | 来源故障恢复、单/多候选、补参/查询失败、停止/失败/部分/未知、保存失败仅重试、后续交接说明 | 44项通过 |
| `revision-audit-results.json` | 新商品目标、忙时草稿/清空、补参转新任务、文章无商品段、旧执行邮箱快照、英文点击/跳转/敏感填写审阅 | 21项通过 |
| `final-review-fixes-results.json` | 3个真实内存候选/第三个选择、零候选补参后规划审阅、等待时长、删除/支付/购买的准确审阅和未知围栏、新对话恢复与动作切换隐藏字段、三来源恢复入口 | 38项通过 |
| `keyboard-results.json` | 完整仅键盘主链；欢迎/编号步骤/长字段/管理与参数/历史/320px 的6组完整 Tab 与 Shift+Tab；确认安全焦点/循环/Escape恢复 | 390条逐焦点及行为断言通过；不将其当390个独立场景 |
| `node-checks.txt` | 110项模型、8项同源/CSP/SSR合同 | 118通过，0失败，2项旧CFT检查跳过 |
| `focus-checks.txt` | 参数移除、管理字段展开/返回，以及原步骤排序/删除/外部焦点保护 | 7项定向组件检查通过 |
| `source-check.json` | 原生成器 `--check`、输入及全依赖指纹 | 通过，浏览器实读相同 |

两项新增正式组件焦点回归及第二轮8项和第三轮4项新增模型回归有修前失败/修后通过证据。新增模型回归首次运行时主执行者已并行修复部分问题，`revision-regression-before.txt` 如实注明这一点，不能称全部问题都有修前失败证据。模型审计探针和当前ego实际路径共同支持问题关闭。

当前关键截图：`01-steps-360.png`、`02-result-360.png`、`03-history-360.png`、`04-reopened-360.png`、`05-unknown-360.png`、`06-editor-320.png`、`07-dark-320.png`、`11-audit-return-360.png`、`12-audit-editor-320.png`、`13-audit-reopened-risk-360.png`、`14-keyboard-editor-320.png`、`15-lens-result-360.png`、`16-captured-params-360.png`、`17-three-candidates-360.png`、`18-action-uncertainty-360.png`、`19-ready-360.png`、`20-source-recovery-360.png`。`08`–`10`和旧 `review-fix-results.json` / `state-boundary-results.json` 仅为历史补充，不冒充本候选重跑。

360px/320px 无横向溢出；底部输入/动作、长字段及统一确认焦点均有当前候选证据。六组正反遍历实际前向15/24/42/54/12/34次、反向15/24/42/54/12/34次停点，含外部场景控件和浏览器边界；浏览器自身 chrome 停点以 body 表示，不算业务控件。确认框测试则单独验证焦点不能离开浮层。未连接真实模型、网站、Native、安装存储；未启动或接管 Browser watcher。

## 证据层级与边界

- Preview：可交互、同源生成，证据仅 **UI_PREVIEW_ONLY**。
- 正式源码：本轮展示焦点修复可进入产品；SDK、Host、Authority、Compiler、安装/执行 controller 未修改。内存模型独有行为见正式差异表。
- 当前产品安装/运行态、真实 Provider/Native/网站效果、持久存储、权限弹窗、跨 Tab 安装/计划、production、全量CI、正式验收与独立原生评分：**NOT_TESTED**。
- 独立 TypeScript typecheck 未执行；本轮生成器和组件检查验证了 TSX 转换，不等于完整类型检查。未为此新增无关配置。
- 两路当前候选独立反方复评：Boole **98/100 APPROVE**，Nash **97/100 APPROVE / CLEAR**，开放阻塞均0。详见 [AUDIT.zh-CN.md](AUDIT.zh-CN.md) 与 `expert-review.json`，保留实际初审否决及全部后续修复，不沿用旧候选分数。

最终来源：输入指纹 `67a9525be27ade656890d71790092402a2bb6a935632aa596ac71df7a2b61eaa`；全部打包依赖指纹 `3f4dffe86287b066c2f082dc42aeb5fdf57253ce006e56e1d0dc4cc41fb7553e`。文档不进入运行源码指纹。来源以后漂移时仍沿唯一生成器同步，不将本快照当作未来源码证明。

只在现有 main 工作，保留并行 dirty 文件；没有创建分支、worktree、PR、提交或推送。既有产品服务、watcher 和 `dist/development` 未操作。
