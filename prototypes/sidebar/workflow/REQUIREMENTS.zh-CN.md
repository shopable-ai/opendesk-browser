# OpenDesk Browser Workflow R23 — 中文需求与设计基准

> 状态：DESIGN_REVIEW_REQUIRED / PREVIEW_CANDIDATE。
> 日期：2026-10-16；唯一写入分支 main。
> 本目录 index.html 是等待用户确认的离线模拟预览，不是正式扩展、AI、Chrome、Native、RunHost 或真实网页读回。

## 一、来源与设计确认门禁

- 在本轮核查之初，main 的 prototypes/sidebar/workflow/index.html 和 REQUIREMENTS.zh-CN.md 都不存在；两路径没有 GitHub 提交记录。因此不能确认“该路径的预览已得到用户批准”。
- 本轮候选从已跟踪的 prototypes/sidebar/workflow-r15-compact-preview.html（R15.3）**增量复制**，尽量保留其尺寸、图标、标题、紧凑会话布局和多状态演示方式；参考同级 interactive/stateful 两个历史版，但不假设它们中的任一版已获 R23 批准。
- 需求还参考 docs/framework/workstreams/workflow-ui-r17-minimal-20261014.md：简化默认页面与设置、区分“新对话”和“新工作流”、不要让保存列表占据首屏。
- 只有用户明确确认本目录 index.html 是 R23 正式设计基准，才能进入正式 UI 的 PREVIEW→PRODUCT 修改。如果用户此前批准的是另一份原版 HTML，必须先恢复原版，不能以本候选取代它。
- 场景切换、宽度切换、主题切换和“模拟目标网页”属于扩展**外部**预览实验台；不可写入正式 Sidebar 工作流页面。预览脚本的状态切换和 DOM 模拟填写绝不移植到正式 RunHost 执行链。

## 二、正式产品交互合同

1. 默认对话优先：欢迎语、当前会话、输入框以及两处紧凑顶部操作；步骤编辑、参数、工作流源码哈希、持久 Run/Result 身份均按需展开。
2. 用户发送一次真实请求后，将原始消息留在原对话；获必要权限后经现有 Provider Facade → WorkflowCompiler → Authority/Controller/RunHost → 持久 Result，做实际读回。无证据时不能宣称成功。
3. 模型规划与浏览器执行都能 Stop，界面正确指示当前阶段、清理焦点；一个客户端取消不能错误地取消另一个客户端的 Native/Codex/RunHost 资源。
4. 有实际副作用的动作始终经过现有安全门禁；未知结果不自动重放；失败要说明原因和后续安全操作。
5. 发送后不得自动显示整个步骤编辑器、历史列表或复杂技术数据。执行结果在对话中用简洁自然语言说明真实业务效果。保存需用户显式点击。
6. “新对话”只清理聊天/规划会话，保留工作流与已存版本；“新工作流”需保护未保存草稿和区分新的 workflowId。
7. 历史由用户主动打开；已验证冻结版复跑必须脱离 AI、沿用现有正式 RunHost、Revision 与 sourceHash，不把保存等同于验证/安装。
8. 已连接仅显示最小可理解状态；未连接按需展开本机连接恢复；Provider、API Key 和高级参数默认隐藏。
9. 键盘：Enter 发送、Shift+Enter 换行应尊重中文输入法 composition，支持 Tab、Esc、可见焦点及焦点恢复。不得在异步关闭授权框时将焦点丢到 document.body。

## 三、权限与数据矩阵

| 能力 | 既有许可的复用范围 | 必须每次重新验证／不可越界 |
| --- | --- | --- |
| Chrome 网站访问 | 同一 origin 的 chrome.permissions.contains 仍有效 | 不存在时由真实 Chrome 用户手势请求；撤销或换 origin 后立即失效 |
| 本机 Codex 网页摘要 | 同 Provider、本机会话、origin、已披露语义摘要范围、有效期内可复用披露决策 | **每轮**重新捕获 window/tab/frame/document/url、真实 RunHost 观察及 revalidate；页面变化不得借旧文档授权 |
| Cloud Responses / 自定义 HTTPS 网页摘要 | 不得继承本机 Codex 摘要批准 | 每次披露 Provider/会话或请求、origin、目标文档、语义节点及文字范围，明确允许才可发送 |
| 页面 fill、click、导航、提交 | 摘要读取授权不包含写入或点击 | 本轮明示意图、有效 Locator、精确 Document、RunHost Authority；高影响/不支持动作拒绝或另审 |
| 保存版重复执行 | 固定 Revision、sourceHash、来源与结果身份 | 再次绑定当前目标、站点权限、RunHost 生命周期；Save ≠ Verify ≠ Install |
| Stop/未知效果/Native 中断 | 无可自动补发的写入许可 | 原 Controller/RunHost/Worker retirement 对账；结果未知绝不自动重放 |

不得因先前允许向模型发送网页摘要就推定已经同意填写、提交或跳转；不把某个 Codex 实例的授权转移给另一模型或另一 Sidebar。

## 四、真实 Chrome 两轮验收（尚未执行）

固定入口：http://127.0.0.1:43111/demo-form.html 。以当时真实 DOM 定位“姓名”输入框，不以历史示例默认 #keyword 混淆目标，不点击 #submit、不导航。

第一轮在正式 Sidebar 工作流中发送：
> 请在当前网页的姓名输入框中填写：给我一个亿的项目。填写后读取输入框的实际值并告诉我，不要点击提交按钮，不要跳转网页。

要求真实 readback 完全等于：给我一个亿的项目。

在**同一对话**第二轮发送：
> 把刚才填写的内容改成：项目已启动，并重新读取验证。不要提交表单，也不要跳转。

要求真实 readback 完全等于：项目已启动。

每轮证据包括：正式 Side Panel、AI Provider 会话、批准的网页观察、WorkflowCompiler、RunHost 的 runId/resultId、revision/sourceHash、浏览器 tab/document 身份、实际 DOM 读回、Result 与 Worker retirement，以及提交/导航未发生。禁止用测试脚本直接改网页 DOM 冒充产品执行、禁止仅靠模型文本声称成功。此预览的模拟姓名框仅用于理解 UI，不属于上述验收。

## 五、多客户端／生命周期／版本门禁

两个 Sidebar 与两个 Codex 对话并行；A Stop 不能终止 B；关闭窗口释放自己的资源；Native 断线后有正确反馈；换站/换 Document 撤销旧观察/操作资格；规划 Stop 与执行 Stop 均有确定或未知终态区分；已验证版本 AI-off Run ×2 仍由旧正式执行器运行。原结果可按源码/包/环境身份精确复用，但历史测试不能自动变为当前候选 PASS。

## 六、预览与正式 UI 逐状态验收

十组：空白、已连接、未连接、AI 执行中、授权要求、执行成功、执行失败、已保存版本、历史版本、窄 Sidebar / 深色模式。补测“浏览器执行中”作为第十一种细状态。

宽度 360px、420px、520px，真实浏览器 200% 缩放，键盘与焦点；预览的 CSS 模拟与真实 Chrome 实测分开统计。

六维目标各不低于 95/100：视觉一致性、交互效率、真实任务成功率、权限体验、可靠性、架构与维护性。缺少实测和可追溯证据时使用 NOT_SCORED，不预先填写 95+。

## 七、当前证据边界

本轮仅从 GitHub 读取源码并提交候选 HTML/文档。无法从此 GitHub 连接操作用户 Mac 本地目录、现有 Chrome/CFT、Native 进程或 43111 服务；本轮 Node、Build、Native/Chrome 均 NOT_TESTED。历史 docs/framework/workstreams/workflow-local-e2e-01a13fcb-20261015.md 有特定旧构建的真正验收记录，但不是当前 R23 的姓名输入框双轮 readback，也不证明当前 main 的正式产品 UI 已一致。

具体静态差异与权限弹窗前后（设计层面的）对比见 DIFF-R23.zh-CN.md。

## 八、R23.1 交互预览增量（2026-10-16）

> PREVIEW_CANDIDATE / DESIGN_REVIEW_REQUIRED。只更新 `workflow/index.html`，**用户仍未确认设计封版**；不修改正式 `src/ui` 或 SDK、RunHost。
> 所有“已执行”“读回”“已保存”均限离线模拟网页和本页内存，不是 Chrome/Native/AI 的执行证据。

- 在原 R15.3 → R23 候选 DOM、图标、Tab 与视觉语言上保留结构，仅增量替换不正确的 demo 状态脚本与必要 CSS；默认对话为主，设置保持底部浮层，步骤及技术数据仅在结果中主动展开。
- 唯一 ＋ 菜单明确区分“新对话”（清空聊天，保留现有草稿／已保存版本／模拟目标 DOM）和“新工作流”（新 ID，新草稿，未保存时先出现可取消确认）。
- 首轮固定中文姓名指令：原文 → 规划 → 本机 Codex 摘要范围披露模拟授权 → 浏览器执行模拟 → **在模拟网页 input 元素写入后从 DOM 读回** `给我一个亿的项目`。第二轮保留原消息与结果、模拟复用 Native 同范围披露决定并重新计入文档核验，然后在相同模拟 DOM 读回 `项目已启动`；提交/跳转计数保持 0。
- 模拟 Stop 在规划与执行阶段都位于底部发送位置；取消尚未触发的定时推进，执行前 Stop 不改变模拟 DOM。拒绝摘要、任意不支持指令、结果未知都不伪造完成，更不会自动重试。
- 授权界面逐项展示接收方、Origin、Document、24 项语义节点上限，明确摘要披露 != 网页写入/提交授权；Cloud 与本机授权隔离，换接收方清除复用资格。
- 模拟草稿版本仅保存于此页面内存（刷新丢失）；**新工作流不删除旧工作流的已存版本**，历史按需跨工作流检索并恢复；恢复版本不自动 Run、也不将 Save 误表述为验证或安装。
- 键盘设计：Enter 发送、Shift+Enter 换行、IME 组合输入不误提交、Esc 关闭菜单/设置/未保存确认、确认框 Tab 焦点约束、主要操作焦点恢复。
- 调试实验台可主动访问空白、已连接、未连接、规划、授权、执行中、成功、失败、结果未知、已保存、历史共 11 个状态；场景切换不会冒充真实执行证据；响应目标 360/420/520px、浅/深两主题。
- 正式产品权限合同保持本文件第三节的矩阵；本页模拟许可复用不证明正式 Browser Authority 的批准次数、Document revalidate 或 Chrome 原生手势。
- 隔离容器 Chromium（Playwright `page.set_content`，非用户 Mac）对新 JS/CSS 与保留的原版布局骨架运行 55 个功能断言均通过；另对 360/420/520px × 浅/深 6 组合检查页面和设备横向溢出均通过。该本地 harness 与最终仓库完整文件并非同一个字节级 HTML，因此属于 `ISOLATED_PREVIEW_SIMULATION_PASS`，不是远端 index 的实装浏览器封版证据。
- `node --check` 对模拟 JS 通过；浏览器控制台 `pageerror=0`。实际 Chrome **菜单 200% 缩放**、完整远端文件浏览器回归、CI、Mac Native、真实运行均 `NOT_TESTED`。分数仍需以这些真实证据逐维核验，不能自报全部 ≥95。

## 九、R23.1 授权体验矩阵补充

| 条件 | 预览反馈 | 正式产品不可放松的要求 |
| --- | --- | --- |
| Native Codex，同会话 / 同 Provider / 同 Origin / 同摘要范围、有效期 | 同意一次，续轮减少重复披露；仍展示重新检查文档的进度 | 每次实际观察必须重验证当前 tab/frame/document/url，撤权立即失效 |
| 换 Provider 至 Cloud / HTTPS | 清除本机模拟披露授权，重新询问 | Cloud 不继承 Native 披露许可；披露接收方与数据范围必须重新同意 |
| 摘要读回批准后网页填写 | 单独在进度中解释用户的填写指令；提交始终禁用 | 摘要批准 != write/click/submit/navigation；保留原 RunHost Authority |
| Stop / 拒绝 / 效果未知 | 解释未完成与检查当前网页，永不自动重放 | `E_OUTCOME_UNKNOWN` 不得自动重跑副作用，资源退休按既有 Controller |
