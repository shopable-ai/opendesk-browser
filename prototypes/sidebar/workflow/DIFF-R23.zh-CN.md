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
