# Workflow R23 — PREVIEW → REAL PRODUCT 差异报告

> 日期 2026-10-16；SOURCE_REVIEWED / PREVIEW_CANDIDATE / PRODUCT_PARITY_NOT_ACCEPTED。
> 这份差异报告是**源码观察**，不是实际 Chrome 视觉录屏或性能测量。

对比输入：prototypes/sidebar/workflow/index.html（R15.3 增量候选、用户确认待定）；src/ui/tool.html 工作流块约 612–748 行；src/ui/tool-shell.css 工作流样式约 429–577 行；src/ui/workflow/workflow-view.js；历史 docs/framework/workstreams/workflow-ui-r17-minimal-20261014.md。

## 一、主要差异与最小修复方向

| 范围 | 正式 main 现有源码 | R23 候选目标 | 本轮结果 |
| --- | --- | --- | --- |
| 默认空页 | workflow-chat-intro 已置于会话上方；管理器 hidden | 主区域只强调任务对话，不复建整套新界面 | 部分符合 |
| 发送后完整步骤 | updatePresentation 中 workflow-plan-panel.hidden = !hasSteps，有步骤就自动展示步骤编辑 | 详细步骤折叠，用户主动展开才显示 | 待修：SOURCE_GAP |
| 对话技术噪音 | 成功 appendChat 含模型 responseId、workflowId、runId、resultId，另有 Result Panel | 对话先显示真实 readback 和业务结论，身份仅按需展开 | 待修：SOURCE_GAP |
| 对话滚动 | workflow-chat-transcript max-height:210px + 工作流外围滚动 | 保留多轮请求和结果，减少嵌套小滚动区域 | 待修：SOURCE_GAP |
| Stop | workflow-ai-cancel（规划）与 workflow-stop（dock）分处两地 | 统一可理解的停止入口/反馈，仍保留不同执行所有权 | 待修：SOURCE_GAP |
| 保存 | workflow-save 须显式点击，Revision 身份已存在 | 在成功附近露出易懂保存入口，不自动存储 | 语义已有，UX 待测 |
| 列表／历史 | workflow-manage-panel 初始 hidden，历史按钮主动打开 | 发送后不自动展开已保存列表 | 源码符合，交互待测 |
| 新对话 vs 新工作流 | ＋ 菜单已经区分，未保存草稿有 review | 不让新对话悄然覆盖工作流 | 源码符合，恢复待测 |
| AI 设置 | workflow-provider-settings 是 details，Native 连接/设置按状态显示 | 已连接精简，未连接按需恢复 | 部分符合 |
| Chrome/模型摘要 | validObservationApproval 按 Native Provider、session、origin、范围、30 分钟；HTTPS 单轮审批 | 同范围减少重复提示，不转授权到远程 Provider | 源码路径存在，原生未测 |
| 真实执行 | plan → prepareDirectExecution → compileWorkflow({verifyFill:true}) → run → 回执与 readback 验证 | 两轮姓名输入精确 readback，无提交或导航 | SOURCE_WIRED，当前候选真实 NOT_TESTED |
| 多客户端/Native | 原框架有 RunHost/Native 生命周期及旧候选验收记录 | 两 Sidebars / 两 Codex 并行、A Stop 不终止 B | 当前候选 NOT_TESTED |
| 深色与宽度 | 现有 CSS 响应布局与 token，但无本轮 200% 的 Chrome 证据 | 360/420/520、200%、暗色与焦点真实验收 | NOT_TESTED |

不得把 preview 模拟执行的 setTimeout、文本结果、DOM 操作移植到正式 src/ui/workflow/workflow-view.js；正式功能只能复用原 Provider、Compiler、Authority、RunHost、Task/Result 存储。

## 二、逐状态核对

| 状态 | 候选预览 | 正式源码可辨能力 | R23 实际 Chrome |
| --- | --- | --- | --- |
| 空页面 | 场景按钮 | chat intro 已有 | NOT_TESTED |
| 已连接 | 场景按钮 | Codex 状态与连接显示已有 | NOT_TESTED |
| 未连接 | 场景按钮 | localFailure/Native status 已有 | NOT_TESTED |
| AI 执行中 | 场景按钮 | planning/plan.updated 事件处理已有 | NOT_TESTED |
| 授权要求 | 场景按钮 | offerObservation 与独立授权区已有 | NOT_TESTED |
| 浏览器执行中 | 场景按钮 | RunHost 状态通路已有 | NOT_TESTED |
| 执行成功 | 场景按钮，只是模拟 | 持久回执与业务读回检查代码已有 | NOT_TESTED |
| 执行失败 | 场景按钮 | fail closed、unknown 不重放路径已有 | NOT_TESTED |
| 已保存工作流 | 场景按钮，只是模拟 | 用户触发 Save/Revision 已有 | NOT_TESTED |
| 历史版本 | 场景按钮 | 按需管理器与载入已有 | NOT_TESTED |
| 窄 Sidebar／深色 | 360/420/520px 与切换按钮（模拟） | CSS 存在，真实 200% 未验 | NOT_TESTED |

## 三、权限提示“前后”对比（**设计预期，非实测弹窗次数**）

| 条件 | 当前源码路径 | R23 设计预期 |
| --- | --- | --- |
| 同一 Native Session＋Origin＋有效摘要范围 | validObservationApproval 允许减少重复披露，但每轮仍重验证 Document | 不重复问已同意的数据共享，准确提示正在做什么 |
| 新 origin、撤权、文档切换 | permissions.contains/onRemoved/revalidate/stopPlanning 处理 | 不借旧文档授权，无权限后合理引导 |
| 切到 HTTPS / Cloud | 与 Native 独立，云端逐轮同意 | 明确远程接收方、精确 origin/document/范围，不静默承接本机许可 |
| 页面填写／点击 | prepareDirectExecution 和原 RunHost 验证 | 网页摘要许可不推导为写入、提交或导航许可 |
| 结果未知 | Fail closed，不自动重放写入效果 | 简明提示未知与检查下一步，不自动发起第二次任务 |

未在真实 Chrome 采集弹窗数量、手势、权限恢复及撤权时间序列，因此不能宣称“弹窗已减少 N 次”或“安全回归 PASS”。

## 四、历史证据归属

docs/framework/workstreams/workflow-local-e2e-01a13fcb-20261015.md 记载旧特定开发构建的中文关键词填写、搜索、续聊、Run×2、Stop/撤权等真实演练；该记录也明确更新栅栏阻止“最终完整新候选”的 Chrome 应用。那些证据不是本轮 R23 预览、最新 main、姓名输入框两轮指令的生产验收。需要按真正输入 SHA、加载扩展 ID、构建指纹和环境条件判断是否可复用。

## 五、批准与执行门禁

本轮只交付原 R15.3 派生的候选预览及文档，不改正式 DOM/CSS、执行器、SDK 或 Bridge。用户确认 index.html 或找回真正已确认原版后，才按差异表进行正式 UI 增量变更，跑定向 Node/Build，再用同一构建真实 Chrome 验收双轮姓名输入、Stop/撤权/断线、多客户端与 AI-off 保存版复跑。

当前六维专家实际分数：全部 NOT_SCORED；未确认设计与没有原生实测，不得虚构 95+。

## 六、R23.1 预览实际修复、证据边界（2026-10-16）

| 问题 | R23 旧候选 | R23.1 本次预览增量 | 验证 |
| --- | --- | --- | --- |
| 任意指令伪执行 | 所有文本进入规划/成功、默认值兜底 | 仅解析两条预设指令，不支持的明确未执行 | 隔离 Chromium PASS |
| 多轮记录失真 | 前轮被替换为固定“模拟完成” | 每轮完整保留原消息及真实模拟 DOM 读回值 | 两轮 PASS |
| Stop 仅状态跳转 | 点击 Stop 跳失败且无异步取消 | 规划/执行共享底部 Stop，取消定时器；执行前不改变 DOM | Stop ×2 PASS |
| ＋ 无工作流语义 | 直接清空历史消息，无未保存保护 | 新对话／新工作流二选一；新工作流先处理未保存草稿 | 保护、取消 PASS |
| 授权提示与复用 | 只切状态，续轮重复且缺 Provider 选择 | Native 模拟摘要披露可复用、逐轮计文档核验；Cloud 强制分离 | Native/Cloud 控制 PASS |
| 保存/历史 | 固定搜索 r3 伪数据 | 显式内存保存；新工作流保留旧工作流版本，历史跨工作流可恢复，不自动运行 | PASS |
| 高级细节 | 手工 hidden/open 导致无效状态 | 原生 details 隐藏；仅最新结果出现保存动作，避免多个重复按钮 | PASS |
| 连接/设置 | 不可操作的模拟入口 | 模拟恢复与收起式 AI 设置 | PASS |
| 结果未知 | 缺少独立场景 | 明示未知且无自动重放 | 状态可达 PASS |
| 响应式/深色 | 旧设备布局易挤占 | 对话单滚动区、稳定输入、360/420/520px、浅深色覆盖 | 6 组合无横向溢出 |

**证据归属**：55 项为隔离 Chromium 上同 JS/CSS 与 R23 布局骨架的模拟测试，并非对 GitHub 远端 index.html 的字节级浏览器回归；Chromium 真实页面菜单 200% 缩放、Mac/CFT/Native、WorkflowCompiler/RunHost/DOM 读回、CI 等均 NOT_TESTED，正式 UI 未修改。用户没有明确批准 R23.1 候选，禁止进入 Product Parity。

**逐维专家门禁**：视觉布局、对话交互、流程可理解、权限安全、错误恢复、可访问/维护这六维目标都是 ≥95；当前可以复核上述局部 PASS，但远端封版实测与真实缩放缺失，六维总评一律 `NOT_SCORED`，不声称 95+。

## 七、R23.2 实施差异及来源级验证追踪（2026-10-16）

| 维度 | R23.1 实际问题 | R23.2 源码变更 | 当前证据边界 |
| --- | --- | --- | --- |
| 顶部入口 | 一个「＋」下拉中藏两种新建操作 | 按用户最新反馈修正为 **三个 40×40px 独立纯 Icon 按钮**：历史（时钟）、新对话（气泡＋）、新建工作流（文件＋），文字仅在 tooltip/aria-label，不占标题空间 | SOURCE_IMPLEMENTED；纯 Icon 约束已写入实际 Chrome 断言，截图/CI 以当前 SHA 为准 |
| 新对话 | 清空未发送文字；运行时可静默取消 | 新 chatId、保留当前 workflowId/版本/输入及模拟目标 DOM；运行或授权待决先阻止切换 | SOURCE_IMPLEMENTED；源文件 CI 待实际结论 |
| 新工作流 | 只对工作流 dirty 提示，未发送文本可能丢失 | 保护未保存设计和未发送文字；取消后恢复焦点；空白不误报 dirty | SOURCE_IMPLEMENTED；源文件 CI 待实际结论 |
| 历史恢复 | 仅改 workflowId/title，保留上一个聊天/模拟成功上下文 | 新 chatId、重置当前会话成功及授权状态；旧版本不删除、不自动执行、不修改输入 DOM | SOURCE_IMPLEMENTED；源文件 CI 待实际结论 |
| Native 模拟披露 | 只有 Origin 与语义范围复用条件 | 绑定模拟 Document identity；切换文档或撤权后不继承 | 仅离线模拟；正式 Chrome 授权 NOT_TESTED |
| 对话两轮 | R23.1 独立 JS harness 已 55/55 | 同一仓库 HTML 的 DOM 两轮精确读回由 Chrome CI 覆盖 | 以 CI JSON/截图为准，不沿用旧结果 |
| 浏览器截图 | 过去只有重建 JS/CSS 的隔离证据 | 独立 r232-chrome.mjs 与 workflow-r232-preview.yml，上传 SHA + Chrome version + 截图 | GitHub Actions 专用 workflow；未出结果不能宣称 PASS |
| 正式 Sidebar | 源码与候选存在差异 | 本轮禁止改动 | PRODUCT_PARITY_NOT_ACCEPTED |

**六维专家目标**：视觉布局、对话效率、任务理解、权限安全、失败恢复、可访问性维护性，分别 ≥95/100。没有逐项原始截图/测试/人工核对仍全部 NOT_SCORED；不得将来源级 Chromium 的离线模拟成功提升为原生产品通过。

**特别注意**：GitHub Actions 的测试是对真实保存的 HTML，在独立 Linux Chrome 中运行，而非用户 Mac 的 Sidebar。实际系统输入法、Chrome 用户菜单 200% 缩放、Native Provider/RunHost、开发/生产扩展包加载身份仍 NOT_TESTED。用户没有确认 R23.2 之前正式 src/ui 不可迁移。


## 八、R23.2 纯 Icon 修复的实际来源级 Chrome 证据（2026-10-16）

- **用户反馈已修复**：三个顶部操作只显示时钟（历史）、对话框加号（新对话）、文件加号（新建工作流）；取消按钮中的可见文本、保持 40×40px，保留独立 `aria-label`/`title`、键盘焦点与浅深主题。只改变预览，不修改正式 Sidebar。
- **绑定源文件**：`prototypes/sidebar/workflow/index.html` Git Blob `f1795d85959756cfe23cbabbb811c9c5058308cb`，SHA-256 `460cdec5f52d6eb28559ba80306d7184e61482fafd73c13bc7d330f2bedae68b`。该 Blob 与截图压缩包内的唯一 `index.html` 完全一致。
- **实际验收**：GitHub Actions [run 38875166282](https://github.com/shopable-ai/opendesk-browser/actions/runs/38875166282)，HEAD `9360ee711b9680534a6784616e81b745974e1829`，`exact-saved-html` 与 `native-browser-zoom` 两个 job 均成功。Linux Chrome for Testing 155.0.8059.84：实际浏览器打开源文件并经 UI 运行 22 组检查（含三个 Icon-only 的无障碍命名、最小点击区域、DOM 双轮读回、Stop、授权、草稿及历史）；控制台错误 0。
- **真实 200% Chrome 页面缩放**：X11 原生 `Ctrl+Plus` 连续放大，`devicePixelRatio: 1→2`、`innerWidth: 1280→640`、`outerWidth: 1280`，分别检查 360/420/520px 的三个 Icon 命中区域、标题溢出、遮挡与浏览器横向溢出均通过。不是 CSS transform 或单独 viewport 模拟。
- **归档证据**：[源文件＋八张截图＋结果 JSON](https://github.com/shopable-ai/opendesk-browser/actions/runs/38875166282/artifacts/12034804409)；[真实 200% 缩放截图＋数值 JSON](https://github.com/shopable-ai/opendesk-browser/actions/runs/38875166282/artifacts/12035106340)。
- **结论边界**：`PREVIEW_SOURCE_BOUND_CHROME_PASS`（仅模拟 HTML）。正式 Sidebar、Mac Chrome 用户安装、真实 AI/Native/RunHost 两轮、系统级中文 IME 未测试；六维独立 UX 专家评分仍为 `NOT_SCORED`；用户尚未批准迁移设计。不能把预览证据升级为正式产品 95+ 交付。


## 九、R23.3 / R23.3.1：AI 设置、低摩擦模式及自然语言模拟闭环（2026-10-16）

### 9.1 产品规则与正式源码的边界

- 唯一已修改的 UI 是 \`prototypes/sidebar/workflow/index.html\`。正式 \`src/ui/workflow/*\`、\`src/ui/tool.html\`、RunHost、Authority、Chrome permissions、Compiler、SDK 未修改；用户确认前不迁移到真实 Side Panel。
- 正式 \`provider.js\` 已有 \`local_codex\`（Native App Server）、\`cloud_responses\`（OpenAI Responses）和 \`custom_https\`（旧版 Chat Completions）。\`opendesk_cloud\` 尚未开放。本原型不冒充连接模型；本机来源不伪造模型列表，云端独立输入模型 ID，旧版自定义 HTTPS 放在高级项，不保存 API Key。
- 操作模式「标准」「只读」「每次确认」目前只存在于**离线 HTML 模拟**，不是已落地的正式 RunHost Authority 模式或跨来源授权。标准模式仅默认允许已模拟授权站点内、由当前指令明确指定的非敏感填写和读回；只读不写入；每次确认在填写前审核；风险请求即使确认也不执行本原型不支持的提交、支付或删除。
- 正式 \`workflow-view.js\` 当前仍在 HTTPS 路径逐轮审批网页观察，\`local-codex.js\` 有自身的会话/模型内容 consent，Chrome permission / target document revalidate / RunHost admission 独立存在。因此 **HTML 中默认不弹摘要框 ≠ 正式产品已移除此授权要求**；需经后续明确审批与安全设计映射后才能变更正式实现。
- 不同 AI 来源之间无网页披露授权继承；模拟切来源、文档切换、站点撤权会失效对应许可。不得借当前页任务文本授权对外发送敏感字段、Cookie、令牌或凭据。
- 用户送出「给我一个亿的项目」先获目标澄清，点「填写到姓名输入框并读回」后写入模拟 DOM；第二轮「把刚才的内容改成：项目已启动」保留历史并读回。精确旧格式仍可运行；其他任意非空输入有能力边界回复。不调用大模型、不会发真实 HTTP/Native 或自造可信回执。
- Stop 在规划/执行状态取消仍待触发的模拟定时器，结果未知只读检查，不自动重放任何副作用。保存/恢复限**当前 HTML 页面内存**，刷新丢失。

### 9.2 来源绑定与实际 Chromium 证据

- 最后一次直接在 \`main\` 提交的 UI/测试变更：[\`1da09acc497c462d700ef89a3a7071e0dbcc89f4\`](https://github.com/shopable-ai/opendesk-browser/commit/1da09acc497c462d700ef89a3a7071e0dbcc89f4)（其他 Agent 可能继续推进 HEAD）。
- 唯一 HTML Git Blob：\`a3c5385ffbe4500575991aa86a8cc5dd2de60aba\`；SHA-256：\`e3c742a43d218c9a28ab5b054a9c101d9169f0be5f3eac28317dc38a4090aed0\`。
- [GitHub Actions 真实复验 #38890379147](https://github.com/shopable-ai/opendesk-browser/actions/runs/38890379147)：Chrome 155.0.8059.84，\`R233_SOURCE_BOUND_CHROMIUM_PASS 16\`，无 JS Console/Page Errors；\`R232_REAL_CHROME_UI_200_ZOOM_PASS\`，X11 原生 Ctrl+Plus，DPR 1→2、内部视口宽 1280→640；360／420／520px 标题、三图标与横向溢出断言通过。
- CI 原始截图/JSON：[\`exact-saved-html\` artifact #12041207964](https://github.com/shopable-ai/opendesk-browser/actions/runs/38890379147/artifacts/12041207964)；[原生 200% 缩放 artifact #12041173215](https://github.com/shopable-ai/opendesk-browser/actions/runs/38890379147/artifacts/12041173215)。两份 artifact 均内含相同唯一 \`index.html\`。没有使用旧截图充作新版本通过证明。
- 16 个回归类别包含：首屏纯 Icon 三入口、低摩擦自然语言澄清、DOM 双轮读回、旧完整模板、任意指令反馈、模拟 IME 事件、只读、逐次确认、高风险拒绝、Stop 两阶段、断线恢复、Cloud 接收方隔离、站点撤权/文档切换、内存版本管理、未知结果核验、响应式/深浅场景。

### 9.3 六维独立指标与反方 UX 审计

评分是**仅对可执行 HTML 原型的证据自评，不是六名独立外部人类专家、正式扩展验收或模型能力评分**。缺少人工辅助技术证据的维度保持 NOT_SCORED：

| 独立维度 | 原型自评 | 实际证据 / 尚存缺口 |
| --- | ---: | --- |
| 视觉布局与设计一致性 | 95/100 | 最终 Chromium 首屏/过程截图、顶栏 3 个纯 Icon 40px、AI 来源不再被旧 icon 36px 裁切、研发工具默认折叠、三宽及原生 200% PASS；真实用户高对比偏好和 Mac 字体仍待核对。 |
| 自然语言对话与操作效率 | 95/100 | 16 项中短命令→一键澄清→填入、完整旧模板直达及上下文第二轮通过；只限有限规则模拟，任意真实网页任务未实现。 |
| AI 设置与模型配置合理性 | 95/100（原型结构） | 真实 Provider 来源分类、Native 状态、Cloud 模型 ID、旧 HTTPS 高级折叠与未开放项禁用；未连接实际模型/Key/Endpoint，真实能力 NOT_TESTED。 |
| 权限摩擦与安全边界 | 95/100（原型行为） | 标准无例行弹窗、只读不写、逐次确认和危险动作安全阻止、来源隔离与模拟撤权；正式权限策略未变更，正式安全审核 NOT_TESTED。 |
| 状态反馈与错误恢复 | 96/100 | 用户消息、规划进度、DOM 读回、Stop、断线、历史、新对话、未知只查不重放均有 Chromium 检查；真实网络竞争、宿主中断 NOT_TESTED。 |
| 可访问性与技术可维护性 | NOT_SCORED | 原生 200% 缩放、基础 \`aria-label\`、40px 可点区与合成 composition 测试通过；Mac 系统级中文输入法、VoiceOver、完整键盘辅助技术验收缺失，不能伪造 95 分。 |

**反方意见**：任何摘要自动发送设计都不能继承无关模型授权；Cloud 演示的“模拟完成配置”并不代表 API Key 已核验；前端 95 分不代表真实 AI 任务执行 95 分；对任意指令的回复并不等于理解任何任务；高风险动作也不能因为原型确认按钮而获得真实执行权限。若用户认为首屏上的模拟网页/研发工具影响产品感受，应以本页可折叠 QA 工具、明确的模拟身份与真实目标网页区分，不得通过假运行回执隐藏差异。

### 9.4 明确 NOT_TESTED

- 用户 Mac 已安装 OpenDesk 扩展、真正 Codex 登录模型、真实 OpenAI API、Chrome 权限审批、RunHost Durables / Browser SDK / 多站点执行均 NOT_TESTED。
- Mac 原生中文 IME、VoiceOver、系统级焦点操作均 NOT_TESTED。Chromium 的 JS 合成 composition 只能验证事件级逻辑。
- 本轮不修改正式 Sidebar。唯一下一步是用户实际体验并批准 HTML 之后，再另立生产实现与真机测试范围。


## 十、R23.4：完整 AI 设置与受限沙箱发送修复（2026-10-16）

> **R23.3.1 的「AI 设置 95/100」评级已被用户实际体验否定，本轮不继承该评级。** 仅此原型文件允许实施，正式 \`src/ui/workflow/*\` 和 \`src/ui/tool.html\` 只读。本阶段仍是 \`DESIGN_REVIEW_REQUIRED\`。

### 10.1 已确认的原型缺陷和实施

- 原 \`.r23-settings\` 是底部绝对定位的局限浮层，表单被固定高度压缩；已改成侧边栏内完整覆盖视图，上方返回，中间唯一独立滚动，下方固定完成。原对话和输入草稿不会因进入设置而清空。
- Provider 选择保持三个直接可见选项：Native Codex、OpenAI Responses、自定义 HTTPS；不再将第三方 HTTPS 藏到「高级」。OpenDesk AI 仅展示不可选项。
- 正式 API 只读映射：\`provider.js\` 具有 \`local_codex\`（Native）、\`cloud_responses\`（Responses）、\`custom_https\`（旧版 Chat Completions）；\`workflow-view.js\` 仅为 HTTPS 来源读取 \`endpoint\`、\`model\`、\`apiKey\`；\`ai-plan.js\` 对旧协议用 \`Authorization: Bearer\`；\`responses.js\` 要求 HTTPS 与 \`/v1/responses\`。没有实现原型不存在的自定义 Header、Body 模板、任意认证、HTTP 明文或模型探测。
- 每个 HTTPS 来源具有独立的 Endpoint/Model ID/API Key，默认 password 并支持显示/隐藏；只接受 \`demo-...\` **虚拟**密钥进行离线格式检查，防止把用户真实 Key 输入原型；不向网络发送、不写入 localStorage/模拟聊天/控制台。检查通过只标记「离线字段格式检查通过、真实连接未知」；字段被修改即失效；Native 显示「模拟连接／未检测实际 Native」；未配置 HTTPS 来源不能借「重新连接」跳过验证。
- 摘要使用许可独立于操作模式；切换 Provider、文档或撤销网站权限均清空当前模拟接收方批准；正式云端每轮批准、安全权限与 Native 会话不在原型中绕过或修改。

### 10.2 真实故障根因及证据边界

- 用户报告对话内预览无法发送：旧代码在点击按钮时依赖浏览器原生 \`<form>\` 的 \`submit\`。在允许 JavaScript 但**不允许 form submit** 的 \`iframe sandbox="allow-scripts"\` 中，表单提交被浏览器限制，按钮点击不能推进模拟流程。
- 原型现在由**真实按钮点击**直接调用 \`onSend()\`，同步 \`preventDefault()\` 以防普通浏览器的原生提交重复触发；Enter 与中文 IME 的独立处理保留。
- 已用相同 Git Blob HTML 在 Chromium \`srcdoc\` + \`sandbox="allow-scripts"\` 下点击完成：第一轮「给我一个亿的项目」→ 澄清→ 填写→ DOM 读回；第二轮「把刚才的内容改成：项目已启动」→ 更新→ DOM 读回；提交、导航均 0。此证明**类沙箱**交互，不代表 ChatGPT 宿主已经实测；后者标记 \`EMBEDDED_PREVIEW_NOT_WORKING / NOT_TESTED\`，不可冒充 PASS。
- 原型源文件及 Playwright 场景直接写入 main，\`r232-chrome.mjs\` 包含原始 \`file://\` Chrome 测试及沙箱回归；\`r232-zoom.mjs\` 增加浏览器原生 Ctrl+Plus 到 200% 的设置字段验证。Linux 本地补充截图采用相同 HTML 内容注入，故标记 \`LOCAL_SET_CONTENT_SIMULATION\` 而非直接打开文件的证据。

### 10.3 审计及验收门禁

- **已核对 DOM 行为**：默认/澄清/两轮操作、OpenAI Responses 与自定义 HTTPS 输入与错误、虚拟密钥遮蔽、高风险阻断、只读、每次确认、三个宽度、沙箱两轮按钮点击。
- **不得宣称**：真实 Provider 连接、Mac 已安装扩展、ChatGPT 平台自身内嵌可交互、Mac 原生中文输入/VoiceOver、正式权限与 RunHost 都已验收。
- **评分原则**：六维（视觉、AI 设置完整性、HTTPS 合理性、交互、安全、可访问性）均从本轮新证据独立判定；截图及 CI 证明行为正确，但无独立人类 UX/VoiceOver/ChatGPT 宿主验证时，不能宣称已经六项 ≥95。证据不足维度保留 \`NOT_SCORED\`。
- **反方重点**：配置“模拟通过”是否误导成联网；是否仍有裁切/二次滚动；是否通过 \`reconnect\` 绕过配置；相同业务逻辑在 \`allow-scripts\` 无 \`allow-forms\` 的真实发送；Provider 切换是否继承摘要许可；是否有多余的权限文案。以上以行为测试和截图为准。

## 十一、R23.4 最终来源级回归记录与六维质量门禁（2026-10-16）

### 11.1 唯一来源和可复核 CI

- 最终 UI Git Blob：`5274afa1f12ebff2347ad74e397adc4437c02704`；HTML SHA-256：`74a97b3d0ea2cdabd88324de498a2961c0f368121ed470d1c5cd0e198503e53f`。
- 最终测试提交：[e0b08bfe3fa64655b291233456817fb811a278f1](https://github.com/shopable-ai/opendesk-browser/commit/e0b08bfe3fa64655b291233456817fb811a278f1)；其中 HTML 的最后修改提交为 `6834a8418dd82e9eeee81f8487caabcb0c98d06a`。仓库 HEAD 可能因其他 Agent 后续提交而继续变化；对来源使用 HTML Blob，不把任意后续 HEAD 当作新设计验收。
- [GitHub Actions #38899034961](https://github.com/shopable-ai/opendesk-browser/actions/runs/38899034961) ：`exact-saved-html = success`、`native-browser-zoom = success`。Chrome for Testing 155.0.8059.84，从真实仓库 checkout 的 `file://` HTML 运行，20 组回归全部完成，控制台与 pageerror 均为 0，输出 19 张来源绑定截图。
- 原生 UI 缩放使用 X11/Chrome 实际 Ctrl+Plus：devicePixelRatio 1→2、缩放倍率 2；360/420/520px 的设置项几何、键盘可触达以及截断检查通过；非 CSS transform/viewport 模拟。
- `srcdoc`+`iframe sandbox="allow-scripts"`（不加 allow-forms）按真实按钮点击执行首轮/第二轮，DOM 值最终为「项目已启动」。平台 ChatGPT 本身仍标记 `CHATGPT_HOST_NOT_TESTED`（对话内单源完整 HTML 暂无法验证）；不以普通 Chromium PASS 冒充。
- 修复源级 UX 路径：HTML 按钮 `click` 不依赖 native form submit；远端配置输入校验反馈确保滚动到可见区，错误字段就近显示说明；完整设置视图开启时，底层对话层 inert，避免键盘/辅助技术误入背后控件。

GitHub Actions 原始证据：
- [20 组 Chromium 与 19 张截图](https://github.com/shopable-ai/opendesk-browser/actions/runs/38899034961/artifacts/12045695884)
- [Chrome 原生 200% 缩放记录与截图](https://github.com/shopable-ai/opendesk-browser/actions/runs/38899034961/artifacts/12045630936)

### 11.2 六维逐项独立门禁（不冒充外部专家评分）

| 维度 | 实证通过的范围 | 仍欠缺的证据 / 结论 |
| --- | --- | --- |
| 视觉布局与一致性 | 三宽、浅/深色会话、完整设置路由与截图、原生缩放 | 真实用户视觉评价、设置深色正式 CI 快照、不同字体视觉人工核查仍未独立评审；`NOT_SCORED` |
| AI 设置完整性和易用性 | Native/Responses/custom 三来源直接可选，返回保留草稿、连接态明确区分模拟 | 真 Native 和真实 HTTPS 连接未涉及本轮；独立产品使用测试缺失；`NOT_SCORED` |
| 自定义 HTTPS 配置 | Endpoint、Model、password API Key、Bearer/Chat Completions 边界、HTTPS 校验、错误相邻提示和结果可见 | 未做真实外部服务网络测试（原型严禁真实请求）；`NOT_SCORED` |
| 自然语言对话与操作效率 | 首轮澄清一键填写、第二轮上下文和 DOM 读回；Stop/Enter/IME 合成，sandbox 无 allow-forms 的按钮链路 | ChatGPT 真宿主 UI 点击和真实 AI 自然语言能力没有通过；`NOT_SCORED` |
| 安全边界与状态 | 只读、逐次确认、高风险仍拒绝、模拟站点撤销、来源切换撤销数据许可、结果未知只读查验 | 真实 Chrome permission、RunHost Authority 未变更/未验收；`NOT_SCORED` |
| 可访问性与可维护性 | aria、密码按钮、输入焦点、底层 inert、三宽及 200% 缩放、单一 HTML | Mac 原生 VoiceOver/真实系统 IME、辅助技术全键盘独立复核缺失；`NOT_SCORED` |

**质量声明**：上述是有实际自动化证据的`R23.4_SOURCE_BOUND_PREVIEW_PASS`，**不是**「六名独立专家均 ≥95 分」也不是用户已验收正式功能。六维证据缺口未闭合前整体 `95_PLUS_NOT_CERTIFIED`。原 R23.3.1 自报 95/100 的 AI 设置评分不得沿用。

### 11.3 反方审计与剩余阻塞

1. 对话内“可交互 HTML”需要 ChatGPT 宿主自身可证伪的真实点击；仅确认 Chromium `allow-scripts` 沙箱单源行为已通过，宿主继续 `NOT_TESTED`。
2. “模拟配置通过”不得被误写成在线、真实模型可用或持有用户密钥；本预览只接受 `demo-...` 作为虚拟输入，真实 Provider 是独立产线，不在本轮范围。
3. 原型视觉保留 10–12px 的辅助文字；即使没有技术溢出，也不能仅凭 CI 断言真实用户觉得排版达到 95 分，需要独立视觉评审/用户复核。
4. 完整 HTML 只准作为设计候选；未经用户确认，禁止迁移正式 Side Panel，更不能调整正式权限、工作流 Runtime 或 SDK。

### 10.4 R23.4 安全回归与最终 Chromium 取证（2026-10-16）

- **原型授权修复**：实际验证发现，在同一 `cloud_responses` 来源下先授权模拟网页摘要，再修改 HTTPS Endpoint，原 `shareApproved.cloud_responses` 仍为 `true`。现于 `configEdited()` 清空该 Provider 的批准、`consent`、已检查配置状态，并取消勾选；Endpoint、Model ID、演示 API Key 均触发失效。重新通过离线格式检查也不能自动恢复旧授权。新增源绑定 Chromium 真实 `input.fill` / `checkbox.check` 回归。
- **全屏设置路径**：切换 AI 来源时把设置内容滚动到顶部，避免上一个 Provider 的滚动位置遮住「AI 来源」标题；对话输入及消息历史继续保留。
- **200% 证据修正**：原 `page.screenshot` 在 Chrome 原生 200% 时生成了尺寸约 633×794 的截图，仅覆盖实际浏览器窗口的一部分，不能用它证明真实物理屏幕的视觉布局。新增 CI `scrot`，直接捕获 1366×1024 X11 整屏，展示浏览器实际 UI，并在三个宽度下保留原生放大截图。脚本仍通过 X11 `xdotool` Ctrl+Plus 到 DPR 1→2，不使用 CSS transform 或模拟 device scale。
- **底部「完成」入口**：先关闭研发场景展开区，再将外层文档实际滚动到底部、拍摄物理屏幕，证明原生 200% 下设置操作可以抵达底部「完成」按钮；仅检查虚拟 DOM viewport 的位置不足以声称用户能看见它。
- **最新真实 GitHub Actions**：[Workflow CI #38902325228](https://github.com/shopable-ai/opendesk-browser/actions/runs/38902325228)，HEAD `3d9a4006cdd4a34d4d28588510d651c7c8b6fd7e`，`exact-saved-html` 与 `native-browser-zoom` 均为 SUCCESS。原型 Git Blob `b1caf5a13b1493975868ce00e1f0bcacc3fbec44`，Chrome 155.0.8059.84，**21 类 Chromium 回归通过且 JS Console/Page Error 为 0**，包含只读状态的源绑定截图，原生 200% 独立工作 SUCCESS。
- [来源绑定 Chromium 截图与 JSON Artifact](https://github.com/shopable-ai/opendesk-browser/actions/runs/38901803852/artifacts/12046457043) 与 [原生 200% 物理 X11 截图/JSON Artifact](https://github.com/shopable-ai/opendesk-browser/actions/runs/38901803852/artifacts/12047171112) 均保存同一 Git Blob 的 `index.html`，严格区分真实浏览器证据与本地 `set_content` 辅助截图。

### 10.5 六维复核与反方审计：严禁伪造 95 分

| 维度 | 已有可重现实证 | 尚缺的独立质量门禁 |
| --- | --- | --- |
| 视觉、排版 | 360／420／520，浅深色、原生 Chrome 200% X11 整屏以及底部操作可达 | 用户审美确认、Mac 正式 Sidebar 实际宽度与字体：`NOT_SCORED` |
| AI 设置完整性 | Native、Responses、自定义 HTTPS 三来源，完整 Endpoint/Model ID/API Key、遮蔽及格式错误状态 | 真实供应商连接与最终产品信息架构评审：`NOT_SCORED` |
| 自定义 HTTPS | 旧版 Chat Completions/Bearer、HTTPS 校验、虚拟配置与实际连接状态清晰分离 | 第三方服务真实兼容性、非模拟密钥测试：`NOT_TESTED` |
| 对话操作 | 鼠标真实点击、两轮 DOM 读回、Stop、规则不支持输入有反馈、受限 allow-scripts srcdoc 成功 | ChatGPT 对话实际宿主、任意 AI 真实语义能力：`NOT_TESTED` |
| 权限与状态 | 标准/只读/每次确认、高风险拒绝、跨来源及同来源 Endpoint 变更撤销模拟授权 | 正式 Chrome 权限、RunHost Authority、真实网页跨站策略：`NOT_TESTED` |
| 无障碍与可维护性 | 40px 图标入口、焦点与 inert、键盘 Enter/Shift+Enter、合成 IME、三宽与 200% | Mac 原生 IME、VoiceOver、人工键盘走查：`NOT_SCORED` |

**反方结论**：21 类通过证明当前离线原型在指定条件下可用，不能自动成为六名真实独立专家的 95/100 评分；真实 ChatGPT 宿主交互、实际 Provider、Mac 运行环境均尚未验收。R23.3.1 的 95/100 历史自评分不能继承。唯一 HTML 仍处于 `DESIGN_REVIEW_REQUIRED`，用户批准前不修改正式 Workflow Sidebar/SDK/Runtime。


## 十一、R23.5：AI 设置减法与紧凑布局（2026-10-16）

- 继续只修改唯一原型 HTML、既有回归及同目录文档；不修改正式 Workflow、Provider、Chrome 权限、RunHost 或 SDK，仍是 `DESIGN_REVIEW_REQUIRED`。
- 修复 R23.4 由于冗长文案导致的低效信息结构：AI 来源、接口地址、模型 ID、API Key 采用紧凑标签/控件横向排列，三行配置高度约 186px（隔离 Chromium 中的实际 DOM 测量，不是跨平台视觉评分）。
- 「模型连接参数」标题、重复的 Chat Completions / Bearer 协议条目、大段参数边界提示、固定底栏技术文案均从主设置界面移除；自定义 HTTPS 仅保留一次「兼容 Chat Completions」提示，技术说明留在按需展开的「说明」内。
- API Key 改成纯眼睛图标（密码输入 + aria-label / aria-pressed），保持 `demo-...` 虚拟示例。格式检查结果与「检查配置」相邻，错误按字段内联显示。未检查与联网未验证不是已连通。
- 云端数据摘要授权只占一行，Provider/Endpoint/Model/Key 变化仍撤销旧许可。底部保留「完成」固定操作，不叠加模拟提示。
- 模拟网页测试卡仅展示模拟身份、姓名输入框与读回值，不再展示虚构访问地址、无功能的禁用提交按钮、重复的提交/跳转计数文案；副作用计数仍由回归测试检查为 0。
- 源绑定 Chromium 新增紧凑行对齐、主界面无重复协议文案、眼睛 icon-only 和三宽字段可见性断言；仍然需要完整原始文件 Chromium、200% 原生缩放与受限 iframe 两轮测试全部通过，才可称原型代码验收通过。
- 本轮用户仅要求可点击打开的 HTML，不另行提供运行截图。代码及自动化结果不能代替用户亲自判断视觉是否达到 95 分，独立专家人工评分和 ChatGPT 宿主嵌入仍为 `NOT_SCORED / NOT_TESTED`。


### 11.1 R23.5 最终复验

- HTML Git Blob：`605c05e417c2491d4369d69b400ace6254651989`；由最新唯一 `prototypes/sidebar/workflow/index.html` 生成，未新建第二套行为模拟器。
- Chromium 来源级回归：提交 `951634cc8199c2a3266378dd4b390f7d970c4814`、[GitHub Actions #38906372237](https://github.com/shopable-ai/opendesk-browser/actions/runs/38906372237)；`R234_SOURCE_BOUND_CHROMIUM_PASS 22`，包含 R23.5 新增紧凑三行、去重、纯眼睛图标、读回与三宽回归。
- Chrome 原生 200%：同一提交的独立 CI `R234_REAL_CHROME_UI_200_ZOOM_PASS`。两个 Job 均 `success`。
- 本地无截图 `set_content` 辅助操作复验：三行远端配置块测量 186px，Endpoint/Model/API Key 对齐；虚拟 HTTPS 配置通过，修改配置撤销摘要许可；两轮 DOM 读回最终 `项目已启动`，提交 0、跳转 0。该辅助验证单独标识，不代替 GitHub 源级 CI。
- 按本轮目标不向用户提供截图；交付同字节单文件 HTML 供 Chrome 直接预览。六维所谓「独立专家 95+」没有独立真人参与，不应虚报为已完成；用户仍有最终设计确认权，`DESIGN_REVIEW_REQUIRED`。


## 十二、R23.6：双段 AI 来源与统一 HTTPS 配置（2026-10-16）

### 12.1 根因和解决

R23.5 的「AI 来源」下拉沿用了三种 Provider 并使用与其它表单相同的固定宽标签列，视觉上割裂，实际间距过大；OpenAI Responses 和自定义 HTTPS 虽使用不同协议，但配置字段完全相同。此次不再堆叠调整 CSS，而是一次性复用同一个 HTTPS 配置视图。

- **来源控件**：原生 Radio 形式的双段切换「本机 Codex / HTTPS 模型」，不再显示单独的 OpenAI 与自定义 HTTPS 入口。AI 来源文字与切换器采用约 9px 直接间距，选中块有轻微浮起背景，并保留箭头键／Tab 焦点语义。
- **HTTPS 输入**：默认 `https://api.openai.com/v1/responses` 作为**字段实际值**，不是占位文本；旁边「清空接口地址」图标一键删除后焦点仍停在字段，填入其它 HTTPS 端点即可。
- **自动协议选择**：依据 URL pathname 为 `/v1/responses` 才沿用现有 `cloud_responses`；否则沿用 `custom_https`（旧 Chat Completions）。选择依据是接口路径，不是是否属于 OpenAI 官方域名；非 OpenAI 主机的 Responses 也不能宣称为官方服务。
- **最小安全保护**：Endpoint 一有变动即清空此前输入的演示密钥、全部 HTTPS 模拟配置状态和接收方摘要许可；切换本机/HTTPS 也不能继承许可；仅支持 HTTPS 和 `demo-...` 虚拟密钥。任何已填字段都不意味着已联网。
- **未动范围**：正式 `src/ui/workflow`、SDK、RunHost、Chrome 权限未改；顶部历史／新对话／新工作流、两轮模拟、只读与每次确认、高风险防护继续保留。
- **独立证据门槛**：Chromium 真实来源 Radio 点击/键盘、清空按钮、自动路由、Endpoint 改变密钥清除、授权撤销、三宽间距、200% 原生缩放与无表单沙箱双轮读回。用户没有要求截图，本轮不以截图充当交互证明。六维独立专家 ≥95 仍需真实证据与外部 UX 审核，不能自行宣布。

 
### 12.2 最终实证与反方质量门禁

- 源码版本：Workflow R23.6 单一 HTML Blob `3078aae17eb9101ac1f7588c339259a98d984d59`，没有新增第二份原型或模拟器，正式 Provider/Browser SDK/RunHost 未修改。
- 最新 [GitHub Actions #38913244892](https://github.com/shopable-ai/opendesk-browser/actions/runs/38913244892)，被测 HEAD `0f69552761e9e648ecd247ef216a5037414a31dc`；`exact-saved-html` 与 `native-browser-zoom` 两项 SUCCESS。来源绑定 Chromium `R234_SOURCE_BOUND_CHROMIUM_PASS 22`，原生 Chrome 200% `R234_REAL_CHROME_UI_200_ZOOM_PASS`。
- 独立本地 Chromium 144 复核（非正式 Chrome 155 CI 的替代）：360／420／520px AI 来源文字与开关实际间距均为 **9px**；下方协议小字和接口输入框左边沿偏差为 **0px**；没有横向溢出与脚本错误。两轮模拟最终读回「项目已启动」，提交/导航均为零。点击清空 URL 后自动变成 Chat Completions 来源，旧密钥及旧授权被清空。
- **反方 UX 核查**：避免为简洁而隐藏必填 Endpoint/Model/API Key；不能把两种不同协议当成同一个 HTTP 请求；不能把自定义 Responses 域名误称 OpenAI 官方；旧 Key 不能跟随 Endpoint 换接收方；两段切换不得丢失屏幕阅读器的单选语义；360px/200% 不可裁切。对应布局和代码行为均有回归测试，待用户实体验证视觉观感。
- 质量评分说明：目标仍为六维 ≥95。Chromium PASS、比例几何和内部 UX 复核不等于六名外部独立专家评分。缺少真实 ChatGPT 宿主、Mac VoiceOver、正式扩展实际 UI 和用户主观视觉评审时，相关评分 **NOT_SCORED**；原型仍为 `DESIGN_REVIEW_REQUIRED`。


## 十三、R23.7：AI 设置精细排版与单入口返回（2026-10-16）

### 用户反馈与实施结果

- 问题：R23.6 的 AI 来源 Tab 过宽（最大约 320px）、输入控件标签左对齐导致每行右边界参差、单独「说明」写有技术内部术语、底部固定「完成」与顶部返回重复且远离操作区。
- 本轮只变更单一原型 `prototypes/sidebar/workflow/index.html` 与现有测试及文档，**不触及正式 Workflow/Provider/RunHost/Chrome/SDK**。
- AI 来源与原生 Radio 切换器组成**整体右对齐**的小型工具组；切换器 196px，响应式保持右边缘贴齐设置正文，且保留 Tab、方向键和可见焦点。
- 三个 HTTPS 字段标签 **text-align: right**，宽约 64px，与完整输入框相距 10px；360px 时标签 60px、间距 8px。输入框不会为迁就短标签而损失可输入宽度。
- 删除独立「说明」折叠项（原有协议与权限说明转移到文档）及底部固定「完成」栏：即时生效的模拟设置仅保留顶部「返回对话」，不会给用户造成额外一次提交或真正保存凭据的误解。
- 协议指示简化为「Responses API」／「Chat Completions」，仍严格根据 Endpoint 路径派发到原有模拟来源，不冒充实际联网验证。虚拟密钥遮蔽、Endpoint 改变撤销凭据和摘要同意、二轮填写／只读／Stop／高风险拦截均保持原样。

### 源绑定实证

- 唯一 HTML Git Blob：`1ff1f40497eae4e5d6a3c93aebacc3c7be291df3`。
- CI：[GitHub Actions #38915373224](https://github.com/shopable-ai/opendesk-browser/actions/runs/38915373224)；被测 HEAD `cd154d2a39a5860c93db89bf6a37e95eba5e7c00`；`exact-saved-html` 和 `native-browser-zoom` 两项成功。日志记录 `R234_SOURCE_BOUND_CHROMIUM_PASS 22`、`R237_REAL_CHROME_UI_200_ZOOM_PASS`。
- 附加 Chromium 本地 `set_content` 交互复验（独立于源绑定 CI）：360／420／520px 模式切换器均为 **196px** 并靠右，三行标签与输入框 CSS 计算间距为 **10px**、垂直中心偏差 **0px**，无横向溢出／Page Error。API Key 清理、授权撤销、两轮自然语言填写读回「项目已启动」、提交与导航零次通过。
- 测试明确断言旧「完成」和「说明」不存在、唯一返回按钮可见，原生 Chrome 200% 放大下顶部返回可点击，不能引用旧版固定底栏截图冒充新版本成功。

### 反方评审与评分边界

- 过窄 Tab 触点会影响缩放和无障碍：因此保留 32px 高内部按钮、原生 Radio 与完整可见焦点；200% 验证已通过，Mac VoiceOver 仍 `NOT_TESTED`。
- 纯右对齐来源并非所有屏宽最佳通解：本轮用户明确希望靠右，故优先 196px 控件与右边缘对齐，待用户实际查看以确定最终观感。
- 移除固定「完成」是由**没有独立待提交设置草稿**的当前模拟合同决定，不代表正式产品未来不得设计保存操作。正式实现如有需要必须重新评审。
- UI 视觉、信息密度、交互一致性有自动化／独立截图取证，可作为内部设计评估；没有真正的六名外部独立专家评分、用户 Mac VoiceOver、真实 ChatGPT 对话内预览或正式安装验收，所以**不得声称这些维度已获得客观 ≥95 分**。本轮状态仍是 `DESIGN_REVIEW_REQUIRED`。
