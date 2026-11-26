# R1 交互与技术决策 · DESIGN_CANDIDATE

> 第七节为当前最小实施合同（R2.2 技术方案 + R2.3 ChatGPT-only 范围）；第 1–6 节为历史设计。7.6–7.7 记录已有源码候选，7.8 记录 R2.4 实测结果。真实 ChatGPT 项目的新对话与归属尚未验证。

## 一、产品与范围
对外名称建议 AI New Chat / AI 新建对话，内部目录及 ID 保留；不建新 Sidebar 工具，不引入项目管理平台。默认直接新标签页（通常前台，原任务在后台继续），正常用户使用无需设置面板。已有其他站点不删除；独立窗口次要能力可在未来审查，不在本轮新增快捷键约定。

## 二、交互选择
| 方案 | 设计自评 | 选择 |
|---|---:|---|
| A 每个项目独立 hover 按钮 | 96 | P0 |
| B 仅官方菜单入口 | 84 | 空间不足时的条件降级，需证明不篡改原菜单 |
| C 项目与普通入口共享图标、语义分别识别 | 97 | 推荐与 A 组合 |
| D 覆盖官方新聊天行为/新增独立管理 UI | 63 | 拒绝 |

项目行：项目名称/折叠控件 → 官方 pencil/+ → 新增 open-in-new 图标 → 官方三点。图标 16–18px、交互命中区约 26–28px，与原生高度保持一致，间距 2–4px，继承主题色；默认隐藏，hover/键盘 focus 显示，无常驻边框、无品牌标签、无布局动画。与官方控件必须为 sibling，不能嵌进 anchor/button；aria-label/tooltip 用明确的项目/普通语义。原生 action 不拦截。点击新增图标时同步核对 DOM 所属及意图，再阻止新增控件事件冒泡，不阻断其他事件。可用空间不足以无回归共存时不覆盖/挤压原生按钮；优先真实 UI 已留 action slot，必要时经验证进入次级菜单（未证实 API/DOM，不能承诺可插）。触屏、键盘及窄屏至少有可发现的可访问入口。长名称正常省略，tooltip 保留完整标题，真实宽度与无扩展基线对照；预览固定预留槽只证明布局模型不跳，不证明真实网站不缩短名称。

原型 preview/index.html 是自包含 HTML，模拟 A/B、多项目、同名项目、独立草稿、首次主动发送才入历史、官方当前页导航、主题/语言、折叠、重绘、停用、失效/阻止/未知结果。模拟 ID/URL 不代表真实 ChatGPT 路由；不访问站点、不发消息。模拟异常不会产生真实 tab；unknown 只演示栅栏，真实恢复以核验为准。

## 三、最小技术链（待验证）
用户手势 → provider 匹配 → 当前行身份重验 → 已验证新对话目标 → opening 去重 → 仅打开 B → 目标 composer 核验 → 用户自己发送 → 原生归属核验。

| 技术 | 自评 | 边界 |
|---|---:|---|
| T-A 原生独立链接 target=_blank rel=noopener noreferrer | 96（路由条件成立时） | 支持浏览器标准新页；无 tabId/成功证明，默认浏览器策略决定 tab/window，避免 nested interactive。 |
| T-B 同步 window.open(url,_blank,noopener,noreferrer) | 93 | 与现有 requestNewChat 最接近；不能把 noopener null 判成拦截，不能确认 tab/window。 |
| T-C 可信后台 chrome.tabs.create | 94（能力本身） | 可得 tabId、在指定窗口创建 tab；Page USER_SCRIPT 无直接权限。只有证实 Page 不满足产品硬约束且通过 Authority/第一方审阅后才使用；既有 trusted driver 非直接授权。 |
| T-D 新 B 内官方动作（仅直接 URL 不成立时） | 88（有条件） | 必须绑定可信的 B tabId/documentId/目标项目及单次 intent；经现有受控链验证后只在 B 内执行唯一官方新对话操作；超时、身份冲突、登录跳转都停止；不使用源 A、私有 API、全局 pending/localStorage 标记或广播猜 tab。 |

优先 T-A / T-B 小型技术 spike，选择一种实际满足核心目标的 opener；严格 tab 与结果回执不达标则不能将 P0 判过，转 T-C 独立审核，不新增裸露桥接。真实 B 仅打开项目首页而不能立即输入，视为不满足；只允许 T-D 在可证实的 B 目标内补齐。若无法安全确认身份/路由/能力，阻断该场景、保留原按钮并如实说明。禁止自动重试或普通 chat 降级。

## 四、现有模块职责与合同
- main.js：复用 createPageUI、顶层/站点资格、原 Page Authority；onDispose 清理子 host、observer、timer 和所有绑定；不要因 owner.host 隐藏而让 toast 不可见。
- destinations.js：分离 provider/ordinary/project，产出临时最小 target（kind, provider, stableProjectId?, verifiedUrl, evidenceKind）；项目 ID 与可变 URL/slug 分开，仅接受实测规则。当前 regex/固定普通路径均需实际核对。禁止同名推断、跨域、URL credentials、未审查 query/hash；禁止把当前对话路径当新建目标。
- buttons.js：保留独立 Shadow DOM，真实 nav row 去重/重绑定、同 row 多 identity 拒绝；属性变化观察限必要属性与 nav 范围，短批次合并；避免全 transcript 扫描和持续高频轮询，SPA remount、BFCache/撤权走现有生命周期。locale 用 document.lang/现有公开机制，小字典 en/zh-CN，不假定可调用框架内部 i18n。若确需新模块，只在本项目按真实职责拆分。
- 发起请求：在可信用户手势内再次解析当前 DOM；每个源 document+kind+provider+stableProjectId 短窗去重（预览 600ms，正式根据真实手势测试确定）。不阻止用户有意连续创建不同任务。状态 NOT_ELIGIBLE / REQUESTED / OPENED（可信 tab 回执时才可用）/ READY（经证据确认 composer）/ FAILED（明确失败）/ OUTCOME_UNKNOWN。未知状态禁止自动重放；原页只能提示/让用户核对，不能擅自关闭标签。仅用户新手势且完成核对后解锁。开页成功与项目归属是两种证据。
- 反馈：Page ui.toast({message,variant,duration})，未知/持续错误 duration:0，避免覆盖其他错误；正常明确成功可低干扰或无 toast。原仓库 Sidebar ui.notify 只用于对应上下文，不跨世界调用。禁止 console-only、alert、confirm、伪造 success。
- 安全：现有固定四 origin 不扩张；首站 ChatGPT，既有站点保留。无后台采集、网络上报、Cookie、凭据、读取对话正文/草稿作为业务前置；无自动发送、删除、迁移旧 chat。无新增权限或第三方依赖。Tab 激活不能保证网站自己持续生成，真实 T04 独立记录自然完成/限流等外因。

## 五、实施路线（R2，不在本轮改业务）
G0 本地真实 Chrome 只读确认当前项目条目与 native action；使用独立 QA 项目/无业务草稿标签记录真实路由。先确认 ordinary 与项目空 composer，验证两个项目及同名、重命名（仅 QA 项目），确定 stable identity、直接链接、项目首页与旧 chat 的区别。
G1 验证最小路径：T-A/T-B → A 不变、B 独立且空白 composer；只有用户授权的合成首条消息验证项目归属，刷新后仍可确认。A 流式和草稿分开测试；不得干扰正在工作的真实标签。
G2 在同一 owner 完善 destinations.js/buttons.js/main.js（仅必要改动）、复用现有 fixture/测试。未知结果、授权及可达性负例先测；必要时仅提出并审查 T-C/T-D 真实缺口，不扩平台。
G3 node --test projects/ai-new-chat-window/tests/*.test.mjs；按原本地开发入口显式 Run、Stop，真实 Chrome 测试 ACCEPTANCE.md；如进入冻结交付再使用 node scripts/validate-program-project.mjs projects/ai-new-chat-window 与 npm run build:program -- projects/ai-new-chat-window。沿原 Page Authority 安装/更新，确认版本、sourceHash、grant 与真实页面，非本轮自动发行。
G4 定向回归其他已有站点、实测布局；补真实证据与独立评审后才允许 P0 放行，差量提交 main，避免覆盖其他 Agent。

## 六、下一阶段任务（可直接复制）
GOAL OD-AI-NEW-CHAT-R2：基于当前 main 的 projects/ai-new-chat-window，读取 README.zh-CN.md、REQUIREMENTS.zh-CN.md、RESEARCH.md、DESIGN.md、ACCEPTANCE.md、preview/index.html 及现有 src/tests。不要重做 R1、不要新建 ai-new-chat，不改 ID、不发布、不扩大权限。原始目标：在 ChatGPT 项目条目 hover/focus 点击独立图标，默认新标签页 B 可直接输入同项目新对话，A 的 URL/草稿/生成不受扩展主动影响；普通新聊天独立且不串项目。先在真实已登录 Chrome 使用授权 QA 标签/项目观察 native action、项目稳定 ID、slug/同名、真实目标 URL，验证直达 composer 与用户手动合成首条发送后项目归属，不能只假设 /project；若无可靠链接，证明 Page 限制再评估可信 B-only 官方动作，拒绝私有 API、盲目重试、任何源 A 副作用。随后最小修改已有模块与测试、原 Page 生命周期和 ui.toast，按 G0–G4 及 ACCEPTANCE 矩阵执行定向验证、真实 Chrome A/B/授权/停止/归属；未知与未测明确。仅在有证据时冻结安装候选，不自动上架。保留其他站点、现有工作区及 main 并行改动。提交范围内差量，报告可操作结果、真实 SHA、失败/未测、分项及算术平均评分；目标 ≥95 但关键阻断或证据缺失不得评分伪造。 

## 七、R2.2 最小实现合同（2026-11-26，替代 R2/R2.1 运行时过度设计）

状态：SOURCE_REVIEWED / USER_DOM_AND_ROUTE_SAMPLE / REAL_CHROME_BLOCKED / NOT_IMPLEMENTED。第 1–6 节保留历史决策；本节是当前实施合同，冲突时以本节为准。用户已经提供真实网页 DOM 属性及点击项目后的 URL 样本；本轮没有独立登录网页验证（本机 Browser Core SSE probe 返回 429）。不保存用户真实项目 ID。正式源码、测试、构建、安装均未变更。

### 7.1 核心目标与新增证据

从 ChatGPT 左侧指定项目行，一次点击独立标签页图标，让 B 直接进入该项目可输入的新对话，A 的现有任务、URL 和草稿不受扩展主动操作。普通新聊天单独处理。已观察到的用户样本结构（下列 ID 为合成示例）：

```html
<div data-sidebar-project-kind="local"
     data-sidebar-project-container-id="project:g-p-0123456789abcdef0123456789abcdef">
```

对应点击项目后的 URL 结构：`https://chatgpt.com/g/g-p-0123456789abcdef0123456789abcdef/project`。这是一个具体的 DOM→URL 证据，不再是毫无来源的路径猜测；尚不证明所有项目/工作区变体、属性长期稳定性或直达新 composer 的效果。kind 是网站类型标记，不作为账户认证或只允许 local 的额外限制，除非真实结构证明必要。

### 7.2 本地 Codex 首先完成一个短实验，再直接实现

1. 在已登录且授权的独立 QA 标签，用 DevTools/Playwright DOM 读取 `[data-sidebar-project-container-id]`，检查至少两个不同项目的属性值、项目标题行、该行原生 anchor/href 和右侧 action slot（若存在），识别容器是否还包裹历史列表。原生 href 仅从对应标题行/明确项目链接获取，不读取历史正文。比较项目点击后 URL 与去掉 project: 前缀构造的 URL。使用合成项目或脱敏记录；不要操作当前用户正在执行任务的 A。
2. 在 B 直接打开实际项目地址，确认项目正确、可编辑的空白新 composer、不是旧聊天；与官方新项目对话动作的行为对照。必要时验证刷新后效果。由用户主动或明确授权的一次合成测试消息验证首次发送后项目归属与刷新历史；未经明确授权不发送，未测项如实保留。
3. 如果直达成立，只选一个简单的站点路由来源：优先可靠的原生项目 href（若各条目均可直接取得）；否则按已核实的 container ID 去掉 project: 前缀，复用现有 projectDestination 做固定同源路径校验。仅在实际变体需要时增加相应兼容分支。选择一种 opener，优先现有同步 window.open(url, '_blank', 'noopener,noreferrer')，不传 popup/宽高；真实 Chrome 核对单次点击新建一 tab。若原生 href 带必要参数，按实测处理，不盲目删除。
4. 只有直达失败才继续观察官方新建动作是否有其他可直接打开的公开 URL；再不成立才评估已有可信能力在 B 内执行原生动作。不能改 A、调用私有 API、增加权限、建立消息桥或预建通用编排。若现有能力不足，记录阻塞，不伪造通过。

### 7.3 生产代码保持最小

- destinations.js：保留现有四站 provider 和 projectDestination，按实测增加 ChatGPT DOM→项目目标的纯函数或窄分支，禁止硬编码用户 ID。只做非空、前缀/路径形状和同源等基础校验；不开发身份可信度评分、账户/工作区二次认证或项目身份注册表。
- buttons.js：ChatGPT 优先按明确容器属性发现项目；仅在该项目标题行的真实 action slot 安装一个独立按钮，不以原生新建按钮存在、文本、数量或 hover 后动态出现作为功能前置。若原生按钮仅用于定位插入位置，可复用该 DOM 结构而不执行它。避免把整个含历史的容器当标题行；避免嵌套 interactive 元素、覆盖原生按钮、误把项目新建识别为全局普通聊天。点击时读取所属行最新标识/链接（简单 DOM 读取，不是身份认证）；同步打开 tab，隔离本按钮事件。默认 hover/focus 出现，复用现有样式/生命周期；短时间同按钮重复点击仅需轻量防抖，允许后续真实新意图。其他项目互不阻塞。
- 正常路径不创建 REQUESTED/OPENED/READY/OUTCOME_UNKNOWN 状态机、跨 tab 握手、tabId 回执、持续 B 页面核验、全局未知结果锁或额外操作。window.open 在 noopener 下可返回 null，不以此推断成功或失败；不宣称成功，只有可明确判断的错误用现有 ui.toast（如必要且可见）。登录/项目权限/目标页面加载交给网站处理；不回退普通聊天、不自动重试。
- main.js：沿用 createPageUI；保留现有 SPA 清理和去重，仅为实测缺陷调整观察范围/属性/必要生命周期；不引入新框架或全页高频扫描。保留 Claude、Gemini、DeepSeek 原有行为和站点范围；ChatGPT 的 DOM 规则不传播到其他站，非 ChatGPT 现有行为不因这次修复改变。普通 ChatGPT 新聊天默认独立 tab。没有新增设置、快捷键、后台权限、依赖或发行流程。

### 7.4 最小证据与验收

运行现有 node --test projects/ai-new-chat-window/tests/*.test.mjs，补当前变更相关用例：真实结构脱敏 fixture、ID→URL、普通/项目分离、无效目标不打开、默认 tab、单次点击/重绘不重复、旧站定向回归。按原项目构建/校验及现有授权安装方式真实测试：两个项目、B 空 composer、A 流式/草稿隔离（分别测试）、首条授权合成消息归属、普通聊天及官方控件。相关 ACCEPTANCE 项继续保留，回执、状态机、账号识别不是直达路径的运行时放行条件；这些测试可在 QA 中观察，无须写入生产。现有不相关历史矩阵不重做、不用 Mock 冒充真站证据。没有环境或授权时写明实际阻塞，未经真实验证不宣称核心功能完成、不发布。

目标 ≥95：产品、DOM、Chrome、架构简洁性、测试及反方审计分别 100 分并算术平均；评分对象区分设计与真实实现。独立专家/agent 仅在确实运行时声称，否则为多视角自评；关键真实证据缺失不能靠分数放行。

本轮只更新实施合同，不预写未验证 DOM 适配业务代码。后续本地 Codex 读取本节、src/、tests/，直接按 7.2→7.4 验证、实现、测试、修复并提交 main 范围内差量；不用重新做需求、竞品、交互原型或新项目目录。

### 7.5 多站点适配参考与 R2.3 当前实施范围（2026-11-26）

公开研究与证据边界见 RESEARCH.md 最后一节。按用户最新决定，本轮 OD-AI-NEW-CHAT-R2.3 只完成 ChatGPT 项目与普通新对话；7.2–7.4 为实施技术依据。以下其他网站规则仅保留未来参考，不要求当前研发、登录或专项验收。若与历史实施次序冲突，以本节为准。

- **共用部分**：新增按钮、Hover/focus、事件隔离、轻量防抖、同步独立开页、现有受管 SPA 更新与清理。禁止为每站复制整个 UI、状态或平台框架。
- **站点差异**：现有 providerFor 按精确 HTTPS origin 分派。每站独立确定全局 New Chat、项目标题行（如果有）、插入点、目标 URL 解析规则。当前只需在 destinations.js 的 provider/newChatDestination/projectDestination 和 buttons.js 的 discover 中划清边界；按实际重复量可提取小 helper，暂不新建适配器 SDK、规则 DSL、远程配置或额外平台权限。
- 最小接口概念：入口发现输出现有 {destination,row} 或等价的 {kind,anchor,row}；点击按实际所属 row/anchor 重新读取当前公开地址，复用目标解析与 requestNewChat。项目目标不可默默退化为 ordinary。特别检查现有 isProjectRowAction 只认项目链接的问题：ChatGPT DOM-ID-only 项目中的原生新建按钮也应排除出全局普通入口；不能把包裹历史列表的整个项目容器当标题行。无需额外身份验证。
- 匹配优先级：真实标题行的可用同源 href → 已验证公开 data-* ID + 路由模板 → 站点已实测的具体 testid/aria-label/局部结构作为定位辅助。官方可见的名称用于识别动作而非项目 ID；不使用全局模糊文本、历史 chat href、hash CSS class 或深层父节点猜测。多变体只在实证需要时增加。
- ChatGPT：按 7.2 验证用户提供的 DOM/URL 样本，项目和普通入口分别发现。Claude：既有 /new 和 /project/{UUID} 候选有公开依据；在现有/新版可见 UI 中实测 href、插入点、直接新 composer 和归属后再改项目逻辑，未测不宣称通过。Gemini：普通 /app 与公开观察的 /u/{n}/app 候选，优先原生 href 并核对选中账号路径是否保留；不得删除经证实必要的路由参数或把 Skills 当项目。DeepSeek：只保留已有普通入口，项目能力未证实则不新增。各站保留原始权限/功能，未知站不注入。
- 本轮唯一正式实施和真实验收范围：ChatGPT 项目及普通独立 tab。Claude、Gemini、DeepSeek 的已有行为保持原样（包括现有窗口/tab 模式及站点范围）；不开展其他站点项目开发、多账号适配、专项真实测试或登录。共用代码如有修改，仅运行已有定向自动化回归并修复由本次改动直接引入的缺陷。其他站点研究与专项验收后移，不影响本轮 ChatGPT 交付，不宣称已完成。无需扩 Grok、Kimi 等新站。
- 未来其他站点适配时的参考回归最小样本：全局 New Chat → 一个 B/空 composer/A 不变；具有项目功能的站点额外检查两个真实项目 → 正确项目与首次授权合成消息归属；Gemini 多账号检查从 /u/{n}/ 开启后仍为同一账号。DOM fixture 只保存脱敏最小结构、旧聊天/未知入口负例、SPA 重绘与重复按钮断言；真实浏览器结果单列。对单站失败只修该站分支，复跑共用逻辑回归。
- 本次只补研究及设计，未执行已登录网站操作、业务源码修改、构建、安装或验收。后续在 R2.3 同一次本地实施中读取本节，不再另起重复研究轮次。评分按真实证据区分设计与交付，关键 P0 未测不得放行。

### 7.6 R2.3 源码候选、实际测试与剩余验证（2026-11-26）

状态：0.1.1 SOURCE_CANDIDATE / NODE_PASS_9 / SYNTHETIC_CHROMIUM_PASS / REAL_CHROME_BLOCKED / BUILD_NOT_RUN / INSTALL_NOT_TESTED。基线 a122c9ac6edfa49bb517f466faf3e1973d4633b3。浏览器标签清单独立观察到符合用户提供模板的 /g/g-p-…/project 页面地址，仅证明项目首页路由样本存在，不证明其直接新 composer 或首次发送归属。Browser Core SSE probe 返回 429、本地工作区连接失败；浏览器内容读取明确被权限策略阻止，不绕过、不操作用户正在工作标签。没有真实 DOM 样本二次核验，不能将合成标题行视为官方结构。

本轮先修改可定向验证的最小业务候选：

- destinations.js：增加 ChatGPT 专用容器 ID 解析，按现有样本校验 project:g-p- 后 32 位十六进制 ID；优先同项目合法 href，否则按模板构造地址。若明确 href 与 ID 冲突则不打开，不退回普通对话。现有 query/hash 归一化仍保留；未知实际必要参数需登录态实证。ChatGPT 默认模式 tab；其他 provider 的 popup 默认和显式 tab 行为不变。
- buttons.js：显式容器 ID 优先，候选标题行限定非交互容器、局部项目链接或直接 aria-expanded 标题控件，排除包含历史链接/列表/嵌套项目的行；保留旧 href-only 行。不会要求原生＋存在才显示。真实标题层级、aria-expanded 是否适用及右侧 action slot 未观察到：本实现仅按合成结构测试，实际不匹配时应读取真实 DOM 后最小调整，不继续猜测选择器。ChatGPT 项目 action 与普通入口隔离；点击时重读当前行，保留受管生命周期。项目按钮候选追加至标题行末尾，真实菜单相对位置、窄宽与主题待核验。
- 同步 window.open(url, '_blank', 'noopener,noreferrer')；同按钮 450ms 防双击（本轮工程默认值、未做真实站 UX 调参），无 popup 宽高、消息桥、状态机、额外权限或依赖。返回值只代表调用请求，不当成功回执。目标冲突静默不打开，异常当前仍为原 console.warn，明确失败可见反馈需要按现有 Page UI 合同补测/修复，不能标 T14 完成。
- package.json 候选版本 0.1.1；main.js、Program ID、Page 匹配、运行世界和其他站点代码路径均保持，未发布。测试增加合成 ID-only、真实 Chromium hover/键盘/双击/属性变化/重绘/清理等断言，详见 ACCEPTANCE。

下一步仅执行一次真实本地验证、修复和构建安装：先观察两个授权 QA 项目的实际标题 DOM 与官方 href/动作，直达 B 检查正确空 composer、主动合成首条发送后归属和刷新；成立即沿当前简单 opener，不成立则按 7.2 条件调查，不能用私有 API 或扩权。只修证据指向的当前候选缺陷。执行项目 validate/build，沿现有 Page Authority 安装后验收真实 A/B、草稿、流式、普通入口、原生操作、重复与撤权。真实核心 P0 未测，不能正式放行。

### 7.7 R2.3-CLOSE 定向缺陷修复（2026-11-26）

基线 58d18b06bd785fa99aa4f9ceb1d517c28092c2ad；0.1.1 继续为源码候选。7.6 为历史结果，当前测试证据以 ACCEPTANCE.md 的 R2.3-CLOSE 增量为准。

- 路由：明确的 ChatGPT 项目 href 必须符合已观察的 32 位 hex 项目 ID 模板，可有连字符 slug（沿既有 128 字符上限）；空 href、纯 query/hash、错误 ID、跨域/冲突及未经归一化的 ChatGPT opener 目标拒绝。保留真实链接 query/hash 归一化的既有行为，是否需要特定参数仍待真实 QA。该语法限制仅基于目前已知 ID 样本，不证明所有未来站点 ID 形态。
- 行证据：显式项目样式链接/带 href 的标题 toggle 若不合法，不能忽略后按 ID 模板猜测；旧无容器行的无效直接项目链接也不应导出普通 New Chat。主区候选按钮点击前检查连接状态、原 main 归属及是否仍是新聊天控件。未更改基于已知容器与标题证据的插入位置；真实 DOM 与 action slot 未观察到，继续按真实证据调整，不扩大猜测选择器。
- 错误处理：复用现有 @opendesk/ui createPageUI 返回的 owner.toast（message、variant:error、duration:0、dismissible:true），显示明确无效目标、无法发起请求和同步异常；不另建通知系统、不自动重放。window.open 的正常 noopener null 不代表失败，保留浏览器/网站原生处理登录、权限、项目删除及未知拦截。Toast 实际已安装呈现待测。
- 不改变 450ms 同按钮防双击、同步 window.open(url, '_blank', 'noopener,noreferrer')、现有 Page Program、权限或其他站点业务；不引入跨标签桥、状态机、依赖或平台代码。

实际 11 项 Node 与 10 组 Chromium 用例通过；其中真实新页事件仅使用 about:blank 目标替身。真实站点、正式构建和安装未通过证据门禁：本地 workspace UNAVAILABLE / Connection failed，隔离容器 GitHub git DNS 不可达且无完整仓库，无明确授权独立登录态 QA 环境。未操作用户正在工作的真实页面或发送消息。最小技术原理的核心假设（目标项目空白 composer 与首次发送归属）仍需实证；不提前宣称正式功能完成。

### 7.8 R2.4 真实验证与技术决策（2026-11-26）

本地完整仓库已可用，0.1.1 的项目校验、Page 编译与独立安装包生成均完成。Chrome for Testing 154 的静态开发宿主已展示候选的真实安装审阅，确认后提示 Chrome 尚未开启「允许运行用户脚本」。独立 QA Profile 的 ChatGPT 仍停在网站验证页。两项阻塞及各自证据见 ACCEPTANCE.md 的 R2.4 记录。

Ego 已登录任务空间的两个真实项目标题行是多层容器下的 DIV[role="button"][aria-expanded]，旧路径只找直接行且排除交互标题。0.1.2 优先识别站点标记的唯一标题行：行的 裸项目 ID（g-p-…） 必须与容器 带 project: 前缀的 ID 一致，明确链接不能冲突；仅使用标题末端的已有操作槽。右槽的临时尺寸探针在所测宽度下可见且可命中；探针已移除。新增按钮与原生两个 20 px 操作按钮同高，独立处理自身点击与键盘激活；保留旧布局识别、路由及同步 window.open(url, '_blank', 'noopener,noreferrer')。真实首条消息归属仍待验证。

Ego 任务空间使用共享 Default，当前验证只覆盖 ChatGPT 网页和已观察到的 DOM。独立 Chrome QA 上次复查仍卡在网站验证，原静态开发宿主的用户脚本 API 也不可用。0.1.2 已冻结供原入口安装；安装后再在两个真实项目按「展开左栏、悬停、点击新增按钮」验证，补足归属、原页保护与生命周期证据。

源码评审的待核对项：显式项目容器内若同时出现旧式嵌套行和局部的普通标签，原生项目动作可能被归为全局 New Chat；当前无真站样本证实。另有整棵 documentElement 子树观察范围超出 N4/T24、BFCache 恢复缺少现有受管路径的实证、按钮与错误反馈仅中文。以上分别保留为源码风险和验证缺口，没有作为真实故障记录或依据其猜测站点结构。

