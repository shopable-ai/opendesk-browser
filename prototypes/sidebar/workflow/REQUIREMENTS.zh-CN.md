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

## 十、R23.2 双新建入口、连续对话和模拟授权闭环（2026-10-16）

> 唯一正式预览入口：prototypes/sidebar/workflow/index.html；r232-chrome.mjs 是来源级浏览器测试，不是第二份 HTML。设计仍是 **DESIGN_REVIEW_REQUIRED**；未经用户明确批准，绝不迁入正式 Sidebar。

- **顶部双入口（2026-10-16 用户最新确认的视觉要求）**：历史、新对话、新建工作流始终是三个独立、仅显示 Icon 的顶部操作，不得将文字直接排在 Icon 旁，也不恢复合并「＋」下拉。依次使用时钟/历史、对话框加号、文件加号的同一 SVG 图标语言；提供不混淆的 title、aria-label、键盘焦点及至少 40×40px 点击区域。360/420/520px 及真实 200% 缩放不得遮挡或误触；窄屏应收缩工作流标题，而非缩小/隐藏创建入口。
- **新对话**：递增 chatId，清空当前聊天与规划上下文，保留 workflowId、工作流未保存设计、版本、模拟目标 DOM 和未发送文字。规划/执行中必须先 Stop，授权待决必须先处理，不可静默遗弃。
- **新工作流**：递增 workflowId 和 chatId，清理旧会话与草稿。有真实未保存设计或未发送文字时弹窗选择取消、保存后继续（有设计时）、放弃。空白页不可误报未保存。
- **历史恢复**：跨工作流恢复身份和设计，不能沿用另一工作流的聊天成功、Provider 披露许可或自动写 DOM。取消恢复保留原消息、输入和焦点。
- **模拟读回**：仅操作本页真实存在的 input DOM，再读 input.value；两轮分别严格匹配「给我一个亿的项目」「项目已启动」。提交/跳转均 0；Stop、拒绝、未知、不支持任务均不应产生伪造的成功。
- **授权细化**：Native 同一会话、Provider、Origin、Document、披露范围、有效期且未撤权可模拟复用；Document 变化或撤权需重新请求；Cloud/HTTPS 不继承 Native 披露授权。摘要披露不能推导为任意填表、点击、提交、导航许可。模拟 Document ID 不等于正式浏览器的精确 tab/frame/document 身份证明。
- **预览实验台**：示例指令填充、状态按钮、切换模拟 Document、撤销、宽度、主题都在 Sidebar 产品主体之外；不得迁入正式首屏或 RunHost。

来源级 Chromium 测试：prototypes/sidebar/workflow/r232-chrome.mjs，经 .github/workflows/workflow-r232-preview.yml 执行。必须直接访问仓库 checkout 的真实 index.html，绑定 HEAD/Blob/SHA-256，使用真实 DOM 输入、按钮和截图，而非 page.set_content。状态须以对应 GitHub Actions 的实际结论为准；提交或启动 CI 不是 PASS，旧 55/55 不代表本轮。

**尚未满足的验收门禁**：Mac 正式安装、真实 Provider/RunHost/Native、系统 IME 与实际 Chrome 菜单 200% 缩放均 NOT_TESTED，除非取得同候选专门证据。六维评分需可追溯截图、可访问性审计、反方复核，每维缺证据则 NOT_SCORED。即使离线 Chromium 通过，也不等于 PREVIEW_UX_ACCEPTED_CANDIDATE 或用户确认。


## 十一、R23.4 设置视图与离线交互验收的现行规范（2026-10-16）

> 本节取代 R23.1 中「AI 设置保持底部浮层」等已过时的原型布局约束。唯一正式原型仍是 `prototypes/sidebar/workflow/index.html`，不得以另一份演示 JavaScript、独立 UI 或网页工具取代其行为。**设计仍待用户确认；不自动迁移正式 Sidebar。**

### 11.1 Provider 字段与视图结构

- AI 来源设置采用**同一 Sidebar 内完整设置视图**：返回、内容纵向独立滚动、底部完成；打开时原对话区变为 inert，返回后输入草稿与历史不丢失。
- 直接提供「本机 Codex / OpenAI Responses / 自定义 HTTPS」，不把自定义来源藏在高级嵌套项。尚未开放的 OpenDesk AI 不可选择。
- 本机 Codex 只做连接状态与重新检查模拟，无 API Key/假模型列表；正式 Native 连接未受检时始终标明「模拟／未检测 Native」。
- Responses 必须配置 HTTPS Endpoint（默认 `https://api.openai.com/v1/responses`）、Model ID、API Key；自定义 HTTPS 使用旧版 Chat Completions 协议与 Bearer 密钥，不把它误描述成任意 HTTP Header/Body/认证编辑器。
- 预览只允许 `demo-...` 虚拟密钥；默认密码遮蔽，可显示隐藏。字段格式检查绝不等同于 API 实连、模型可用或 Chrome Host 授权。数据不持久化、不发网络请求。

### 11.2 授权失效与沙箱发送

- **同一 Provider 内任何 Endpoint、Model ID 或演示密钥的更改都必须撤销已同意的模拟数据使用范围，并使旧配置检查结果失效。** 不得只在「切换 Provider」时撤销许可；实际接收方变化必须重新审批。首次检查通过不得自动同意网页摘要分享。
- 点击发送必须由用户操作进入 `onSend()`，不单独依赖原生 HTML `form submit`；对 `sandbox="allow-scripts"`、没有 `allow-forms` 的 `srcdoc` iframe 也必须能完成两轮点击、模拟 DOM 读回和会话历史保留。底层默认提交必须被阻止，不能触发导航或重复发送。
- Enter／Shift+Enter／IME 合成输入、Stop 规划和执行、只读、每次确认、高风险拒绝和未知结果只读检查均维持既有约束。
- ChatGPT 对话本身的 iframe/CSP 行为与独立 Chromium 的 `srcdoc` 沙箱不同。未实测 ChatGPT 宿主时只可标记 `CHATGPT_EMBEDDED_NOT_TESTED`，不得外推为 PASS。

### 11.3 取证与评分

- Chromium 测试的断言必须来自已提交的唯一 HTML，真实表单按钮点击，而非绕过 DOM 事件直接调用业务方法。
- 原生 Chrome 200% 缩放用 X11 键盘真实操作验证；**Playwright 的 `page.screenshot` 在原生放大后可能只截取部分窗口**，因此同时保存 X11 物理整屏截图，并校验截图像素尺寸。其浏览器窗口、系统翻译提示等是运行环境证据，不能当产品组件。
- 200% 下必须能滚动到全部必要字段及底部「完成」操作。360／420／520px 的字段不横向裁切。
- 六维独立评分必须有明确的实际操作和截图证据；没有独立 UX、Mac 原生 IME、VoiceOver 或 ChatGPT 宿主体验证时，对应维度仍为 `NOT_SCORED`，不能借以前的 95/100 自评分过关。
- 正式 `src/ui/workflow/*`、RunHost、Chrome 权限、SDK 与 Provider 请求行为保持不变，必须等用户确认 UI 后再考虑迁移。


## 十二、R23.5 紧凑 AI 设置（2026-10-16）

> 继承 R23.4 唯一 HTML，不修改正式 Provider、SDK、Workflow Runtime 或 Chrome 权限；未经用户确认，不迁入正式 Sidebar。以下为原型最终可见布局规范，取代旧版重复协议和大量说明文案。

- **核心设置**：AI 来源为紧凑单行下拉；HTTPS 来源只显示「接口地址 / 模型 ID / API Key」三行字段，每行左 Label、右完整可编辑输入框。响应式覆盖 360 / 420 / 520px，保留 39px 输入框和可见键盘焦点；不再显示独立的「模型连接参数」标题。
- **协议只提示一次**：自定义 HTTPS 仅显示「兼容 Chat Completions」，不再同时展示「自定义 HTTPS · Chat Completions」「协议：旧版... · Bearer」和冗长参数能力声明。认证规则及不支持事项记录在文档而非重复占用页面。
- **虚拟凭据**：API Key 默认 password 输入，眼睛图标按钮具备 aria-label / aria-pressed；示例占位提示 `demo-...`，继续仅允许虚拟密钥，禁止真实模型调用、网络请求和 localStorage。
- **检查状态**：「检查配置」与「未检查 / 待检查 / 格式通过 · 真实连接未验证 / 字段错误」放一行。具体错误紧邻对应字段。检查只验证字段格式，绝不假报远端连接成功。
- **数据披露**：云端来源仅保留一行「允许向此 AI 来源提供页面摘要」复选框；切换来源、修改任意配置、文档变更或网站权限撤销都使旧许可失效。只读／每次确认等操作模式仍在聊天输入区，不混入 AI 来源设置。
- **信息减法**：保留完整 Sidebar 内页路由、返回、固定底部「完成」，将非关键说明折叠至「说明」。删除旧版浮层、多级折叠、重复仿真安全声明和冗长底部脚注。
- **测试网页展示**：仅用「测试表单 · 模拟网页」、可操作的姓名输入框及「读回：…」反映真实模拟 DOM；去掉虚构访问 URL 和没有功能的禁用提交按钮。是否提交/导航仍在 `workflowPreviewState()` 的状态计数里断言为零，不能把 UI 简化当作放松安全。
- **质量门禁**：增加来源级 Chromium compact geometry、唯一协议提示、纯图标密钥按钮和三宽字段无遮挡回归，保留受限 sandbox、两轮读回、200% 原生 Chrome 测试。图像可在 CI 内取证，但本轮面向用户只交付原始 HTML 直接预览，不附运行截图。

 
## 十三、R23.6 AI 来源与 HTTPS 单表单设计（2026-10-16）

**用户体验原则：来源选择优先、配置字段复用、入口紧邻、自动推断接口类型。** 本节覆盖 R23.4／R23.5 中已过时的三来源下拉框布局，不覆盖正式运行时 Provider 的协议约束。

- AI 设置中将下拉框换成使用原生 Radio 的双段切换：`本机 Codex`、`HTTPS 模型`。左侧「AI 来源」使用内容宽度，和切换器间距约 9px，不再为固定 82px 标签列预留大面积空白。原生 Radio 的方向键、Tab 与焦点可见性必须可操作。
- HTTPS 模型**始终只使用一组**接口地址、Model ID、API Key 和检查配置，不再切到另一组「自定义」表单；默认接口地址 `https://api.openai.com/v1/responses` 是完整可编辑输入值，右侧原生可访问的清空图标可一键清空、聚焦并输入自定义地址。
- 在**模拟 UI 适配层**根据 HTTPS Endpoint 的 pathname 是否精确等于 `/v1/responses` 自动选择现有 `cloud_responses`／`custom_https` 适配器标识；其他 HTTPS 路径按旧版 Chat Completions 兼容接口处理。自动识别只用于本原型的字段状态和后续正式实现建议，**不修改正式 Provider、SDK 或 Runtime**。
- 单行轻量提示显示当前识别类型（Responses API／Chat Completions 兼容），不能把任意自定义 Endpoint 宣称为 OpenAI 官方服务，也不能承诺所有第三方服务都兼容。
- Endpoint 一旦改变（包括按清空图标），除了使格式检查与页面摘要同意状态失效，还应清空上一个接收地址下的 API Key，避免先前的密钥被误用在新服务。模型 ID 可以保留供用户编辑，页面不保存密钥、不发起联网。
- 模式从 HTTPS 切到本机、再返回 HTTPS 时，可以保留尚未关闭页面的非持久演示字段，**但不得自动继承上一个来源的摘要发送许可**。调用真实模型与网站操作仍要求正式 Runtime 授权。
- 保留标准／只读／每次确认、高风险阻止、Stop、两轮 DOM 读回等已经通过的行为；顶部三个 Icon 入口不改动。用户未明确批准此原型前，不迁移至正式 Sidebar。
- 质量回归重点：来源标签／开关实际相距 4–16px、360／420／520px 无裁切、Native 200% 可点击、清空后接口路由和状态、Endpoint 更换密钥撤销、虚拟配置检查、受限 iframe 下两轮按钮点击，以及页面授权隔离。视觉评分需要实际可用与用户确认，不凭 AI 自评分宣称六名独立专家 ≥95。


## 十四、R23.7 AI 设置终版候选 · 右对齐紧凑设计（2026-10-16）

> **本节取代 R23.6 对 AI 来源开关 9px 相邻布局的具体视觉规范，不改变双来源的操作和协议适配能力。** 正式 UI 仍待用户确认；唯一 HTML 原型为 `prototypes/sidebar/workflow/index.html`。

1. **来源行**：AI 来源及原生 radio 两段式选择组成一个约 244px 的小型工具组，**整体靠右**。切换器宽 196px（<=380px 时优先 184px），紧贴设置内容区右边缘；不要为整行预留 320px 的固定拉伸区域，也不要把标签和开关隔出大段空白。
2. **字段行**：接口地址／模型 ID／API Key 的标签列宽约 64px，**统一右对齐**；与控件保持约 10px 一致间距。360px 时标签列约 60px、间距约 8px。输入框保留剩余宽度、长度与焦点操作，不通过缩窄 URL 控件追求所谓紧凑。
3. **协议文字**：原较长的「Responses API · 自动识别」等文案仅保留精确类型「Responses API」或「Chat Completions」的小字体指示，紧贴 Endpoint 下方左对齐。**删除独立「说明」折叠项**；精确安全规则放在文档及离线检查状态，不再强迫用户读技术段落。
4. **返回与完成**：页面配置在模拟状态中即时保存于内存，检查按钮验证字段格式，不存在需要提交的另一份设置草稿。因此**移除底部悬空的「完成」栏，只保留顶部返回图标**。返回应恢复对话草稿和消息历史，不发生真正网络请求，也不得提示“连接成功”。
5. **不回退功能**：本机 Codex／HTTPS 模型双段切换、默认完整 Responses 地址、清空图标、API Key 显示隐藏与 Endpoint 变更自动清除旧密钥／许可、数据范围勾选、两轮自然语言读回、三种权限模式和高风险限制保持不变。
6. **测试门禁**：来源切换组宽约 184–196px 且贴齐右边缘；字段标签 CSS text-align:right、中心高度一致、无横向溢出；360／420／520px 和 Chrome 原生 200% 可点顶部返回；旧的固定底部完成栏及技术说明不能残留；沙箱发送、虚拟配置和 DOM 读回不得退化。
7. **95+ 评分治理**：内部设计自评仅表示候选质量，不能替代真实用户反馈或六名独立外部专家评分。真正满足 95+ 必须分别具备视觉、完整性、效率、状态／安全、无障碍、维护质量的证据；未验收的 ChatGPT 宿主、Mac VoiceOver 和正式扩展应保持 `NOT_TESTED`。

## 十五、R23.8 默认宽度优先的统一排版（2026-10-16）

> 本节覆盖 R23.6/R23.7 关于「AI 来源必须整行靠右」「HTTPS 标签必须右对齐」的布局要求；保留此前功能、安全和运行时边界。目标是改善默认 420px Chrome 侧栏的视觉质量，而不是机械满足左/右对齐指令。

### 设计判断与布局合同

- R23.7 本机 Codex 中「来源靠右、状态靠左、操作孤立在右」形成三个不同视觉锚点，属于信息分组错误，不是再缩窄分段选择器可以修好的问题。
- 设置正文使用单一左侧视觉起点：AI 来源作为顶部标签，其下是 248px 原生 Radio 双段选择；本机和 HTTPS 共享相同的起点及间距节奏，不添加硬横向分隔线。
- 本机 Codex 在来源下提供与正文同宽、背景极浅的连接状态组：左侧「本机连接」及「模拟就绪 · 未检测 Native」，右侧「模拟检查」。状态和操作均归属这一组，垂直居中，长文案不得填满剩余自然留白。
- HTTPS 模式使用纵向字段：接口地址、模型 ID、API Key 标签各位于完整宽度输入框正上方，提供足够 URL 阅读空间，不再采用挤压文本的窄标签列。协议小字在 Endpoint 下方，配置检查与许可继续存在。
- 原生 Radio、顶部单一返回、离线演示标识、默认 Responses URL、清空端点、眼睛按钮、虚拟密钥校验、来源/Endpoint 变更撤权、两轮模拟 DOM 读回均保留。正式 Workflow Provider、RunHost、Chrome 权限及 SDK 不得修改。

### 测试和评分边界

- 默认 420px 的 Chrome 侧栏是本轮主要设计基准；360/520px 和原生 200% 仅保留已有回归，不为了特殊尺寸牺牲默认布局。
- 关键几何断言：来源标题与切换器共左边缘、标题位于切换器上方；Codex 连接状态与检查操作在同一个容器中居中排列；HTTPS 三组标签在完整宽度输入框上方，共享同一视觉起点。
- 实际按钮测试须保留 Radio 键盘操作、离线检查、清空 URL 后撤销 API Key、授权隔离、两轮任务、Stop、只读和 sandbox 的点击发送。
- 独立专家 ≥95 是目标不是自我评分。用户视觉确认、外部设计复核、Mac VoiceOver、ChatGPT 宿主嵌入及正式扩展安装尚未实测的维度依然标记 NOT_SCORED 或 NOT_TESTED。
