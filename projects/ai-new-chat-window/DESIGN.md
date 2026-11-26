# R1 交互与技术决策 · DESIGN_CANDIDATE

> R2 执行前新增技术合同与具体路由实验见第七节；真实新对话机制仍未验证。

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

## 七、R2 技术实现合同补充（2026-11-26，候选，非业务完成）

状态：SOURCE_REVIEWED / ROUTE_NOT_VERIFIED / REAL_CHROME_BLOCKED / NOT_IMPLEMENTED。本节补充并细化上面的 R1 技术候选，不重做需求、竞品、预览或验收矩阵。读取基线 `4194fb7b2ea8f05633bc2a2e0ed0c5e4efac9cee`，相比 R1 提交 `91239889481bad3f42edb30e84e1012aa1901fc0` 超前 2 个提交，本项目无差异。已读取 Browser 标签清单（只读），本机 Browser Core status 工具连接返回 429，未对真实项目执行点击、打开新页、发送消息或 DOM 验证；不写入用户真实项目/对话 ID。

### 7.1 业务机制与技术分界

打开 B、B 进入正确项目的新 composer、用户首次发送后服务端归属，分别是三种证据。项目首页如果已经具有正确且可编辑的空 composer，就直接满足第二项，不需要再点击一次或主动建立空聊天记录。旧对话的 composer 不能作为新 composer 证据。不得使用 `/project` 或当前对话 URL 的字符串猜测当作成功证明。

先在已登录、明确授权的独立 QA 项目/标签执行一个最小实验：
1. 观察两个 QA 项目的项目行公开 DOM、原生 action 是否为 anchor/button、真实 href 与可核验 identity 属性；记录脱敏路由、当前 workspace 及项目稳定 ID 的证据。无 anchor 的行不得按标题或猜测定位，子对话链接仅可作 identity 信号。
2. 在专用测试页实际点击官方新项目对话操作，记录 before/after route、项目可见标识、是否为新 composer、是否存在旧对话内容；比较原生新普通聊天、项目首页及旧对话。验证两项目、同名与重命名后仍按稳定 ID 识别；不得假定连字符分隔的全部 path 是 ID。
3. 在独立测试标签直接访问由实际观测得到的候选 URL。若页面进入正确项目空 composer，且不依赖 A 的 SPA 内存/前序点击/草稿，优先选择直接链接方案。若项目首页仅列历史或跳普通/旧聊天，拒绝直达假设。
4. 由用户主动在 B 发送一次不含业务信息的合成消息，核对该新对话 ID、正确项目成员关系及刷新后历史，不能只凭标题、URL 或当前 Recents 判定。扩展自身不发送；没有用户主动发送的证据时归属验收保持 NOT_TESTED。
5. 独立核对 A 正在生成与 A 有未发送草稿两个场景：A 的 tab/document/URL/conversation ID 保持，草稿不变、没有扩展发起的导航/刷新/Stop/发送；只比较测试草稿，生产业务不读取草稿。区分浏览器后台挂起/自然生成结束/服务端限流与扩展副作用。仅对专用 QA 页操作。

记录真实证据后只选择一种 opener：
- 路由直达成立时，优先现有 Page Program 内独立按钮 + 同步 `window.open(verifiedUrl, '_blank', 'noopener,noreferrer')`（与原实现改动最少）；若真实布局及键盘行为更适合原生独立 anchor，则使用 `target="_blank" rel="noopener noreferrer"`，不得双路同时执行。常规 Chrome 请求标签页，不传 popup/width/height；浏览器策略仍需实测。新按钮是唯一动作 owner，不触发原生项目 action，不嵌入原生 anchor/button，不改写原生 href。
- `window.open` 在 noopener 下即使成功也会返回 null。只能显示 REQUESTED_UNCONFIRMED，不能把 null 判作拦截或把 true 判作已创建/READY；Page 不能据此获得 tabId。用户可见新页是人工核验，非程序回执。若真实测试证明这条路不能满足同窗口 tab/必要结果反馈的硬约束，不得靠改文案降级验收，进入可信能力评审。
- 若没有可直接进入 composer 的公开路由，只有具备绑定 B 的授权能力时，才允许在 B 内执行唯一经实测的官方新对话操作：先创建 B 并获得真实身份，核对 B 的当前顶层 document、origin、workspace、project ID、授权代次和唯一官方操作，再单次执行并核对后置条件。A 从不参与该动作。若官方操作要求真实用户手势且受控链无法满足、发生重定向/歧义/超时/文档失效，停止，不绕过。
- 可信 Host 并非已接通能力：实际 `src/platform/chrome/browser-tabs.js` 的 createBrowserTabHost 仅接受 {url}，使用 chrome.tabs.create({url,active:true})，不接受指定 windowId，不直接暴露原始 tabId，只返回所有者绑定的 tabRef；URL 变化/重载、过期、授权失效可使引用作废。其接口依赖 toolId/packageHash/installEpoch 和原 Host 授权；不能直接导入 Page USER_SCRIPT，更不能用裸 postMessage/自报 isTrusted 作为信任证明。原 Page @opendesk/tasks 是固定 Task 审批链，且一个来源槽不自动产生下一次请求，不是静默的一键多次开页 API。若必须采用可信方案，先形成最小可复现 SDK_GAP/BLOCKED 证据并由现有平台 owner 审核；不得借本项目扩大权限、建立第二套通道、预先修改宿主或弱化现有精确 URL/document 栅栏。若获准，所需能力是从可信 sender 获得 A 的 windowId、创建 B、确认 B/document、有限单次官方动作和原意图回执（均为目标合同而非现有 API），合法路由转换需在原权限边界内重新核验，不继承过期引用。

### 7.2 模块内最小实现合同（路由验证之后）

- destinations.js：分离普通/项目目标；projectId 独立于显示名/slug/URL，具体提取规则只来自实验；same-origin HTTPS、固定 provider、无 credentials；保留已验证路由必要参数，不盲目拼接/清除。拒绝旧 chat、共享加入链接、跨账户或未验证目标。不从当前聊天推断用户点击的项目。
- buttons.js：独立图标，与真实 action 同行；点击时重读当前项目行及最新 href，若重绘、身份变更或多义则拒绝而非使用旧闭包。避免嵌套交互元素，隔离本按钮事件而不拦截原生按钮；hover/focus、明暗、zh/en，真页面核对菜单、折叠和窄屏。按源文档+provider+kind+稳定 projectId（普通固定键）设置同步短窗/请求栅栏（600ms 初始测试值，不是最终规定）。不同项目互不阻塞。短窗内忽略同一意图；确定失败可用户重试；不可确认打开时提示核对，下一次同目标动作须为明确新意图，未知副作用不得定时解锁后自动重放。普通/项目不互相降级。
- main.js：使用已有 createPageUI 生命周期；确保 toast 不被隐藏 owner.host 的 CSS 误伤（按 UI API 实测），观察 nav 结构及必要 href/身份属性变化，合并刷新；不扫描正文 token stream，不增加全站事件劫持。停用/撤权/升级按原 Authority dispose 清理节点、监听、timer、observer；不关闭 B、不修改 A 聊天。
- 状态：NOT_ELIGIBLE → REQUESTED_UNCONFIRMED（Page 直接请求）或 OPENED（可信标签回执）→ READY（项目身份及空 composer 后置条件已核验）→ 测试用 MEMBERSHIP_VERIFIED（用户发送并确认项目历史）。FAILED 为明确失败，OUTCOME_UNKNOWN 为可能发生副作用但无法确定；无自动重试。生产不要求读取对话正文/草稿、不自动发消息；不能以测试用户的手动核验声称 Page 已具备程序回执。
- tests：原文件按实际变更扩充，包含 URL/身份/同名重命名/陈旧行/重复点击/普通与项目分离/错误与清理。Node 只证明纯逻辑或模拟，Chrome QA 证明实际标签、composer、项目归属与 A 无扩展主动操作；G1–G8 独立通过后才可称 R2 完成。保留其他站点原有适配，不引入新目录/框架、权限、发布或第三方依赖。

### 7.3 资料与放行

公开依据：[Chrome Tabs API](https://developer.chrome.com/docs/extensions/reference/api/tabs#method-create)、[MDN Window.open](https://developer.mozilla.org/en-US/docs/Web/API/Window/open)、[MDN anchor](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/a)、[OpenAI Projects](https://help.openai.com/en/articles/10169521-projects-in-chatgpt)。OpenAI 产品文档描述项目与聊天关系，但不是公开的新建项目对话路由/API 合同。框架依据：[Page USER_SCRIPT](../../docs/api/page-userscript.zh-CN.md)、[Browser tabs Host](../../src/platform/chrome/browser-tabs.js)。上述资料证明技术原理，不能证明具体 ChatGPT 账户 UI/路由或本项目安装效果。

本轮仅技术合同收敛，未改 src/tests、未构建、未安装或发行。优先执行 7.1 真实 QA 路由实验，证据成立后按所选单一路径修现有业务；没有真实授权测试环境则记录阻塞，不推进 R3，不以自评达到 95 取代真实 G1–G8 或独立专家审查。
