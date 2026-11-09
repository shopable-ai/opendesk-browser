# 统一确认与反馈：框架能力与扩展业务目标

日期：2026-11-09（Asia/Shanghai）。状态：框架 Bridge/Host、统一 React 展示及 Quick Notes/AI Proxy 代表接入已实现，当前进行受影响行为与真实 Chromium 离线源码夹具验证；日常已安装扩展与原生权限未验。对应[关键测试条件](shared-confirmation-r1-test-spec-20261109.md)；设计原则见 [DESIGN.md](../../DESIGN.md#统一确认与反馈2026-11-09独立作用域)。

## 1. 用户结果与完成范围

用户发现“Web Flow 有未保存内容”的确认直接插入框架，提出按“扩展业务代码修改＋框架提供公共能力”完善设计。

总目标：让用户在原界面完成必要决策，避免顶部确认块挤占正文、普通反馈抢焦点、同一意图重复确认；扩展通过公开能力复用展示，数据、执行和权限仍归原 owner。

原对话交付方案、文档/Skill/规范和交接，不修改业务源码、API 实现、正式包、安装记录或浏览器环境。接收对话获授权完成下列 P0 核心开发；不必再次询问是否实施。P0 是下一轮核心开发的完成标准；P1 不自动成为 P0 前置。计划条目不是已运行的 Goal Mode 或产品 PASS。

| 目标 | 可观察结果 | 优先级 |
| --- | --- | --- |
| G1 统一交互选择 | 保存成功等普通消息不需确认；丢弃、删除、覆盖等简短决策使用同一宿主内浮层；长表单与差异审阅保持合适的业务界面 | P0 |
| G2 框架公共能力 | HTML/JS、Vue、React 工具可通过同一异步 SDK 请求普通确认，无需导入宿主内部代码或迁移技术栈 | P0 |
| G3 两方职责清楚 | 框架只有通用展示与生命周期；业务拥有必要性、上下文、数据版本、执行与回执；普通确认不授权 | P0 |
| G4 核心入口实际可用 | Web Flow 关闭/切换的草稿保护改用统一浮层；Quick Notes HTML 与 AI Proxy React 各完成普通确认试点 | P0 |
| G5 原工具与保护不退化 | 原 HTML/Vue 不改照常使用；取消不丢稿，保存未知不重放，身份/来源/代际/撤权继续有效 | P0 |
| G6 渐进收敛 | 按 owner 完成其余行内确认和重复简短模态确认的分类、适配、删除重复展示；复杂表单可选复用公共外壳 | P1 |
| G7 异步链完整 | 同步 guard/boolean adapter 正确迁移，确认 Promise 全部结算，异常可见、旧实例不执行、finally 不伪造成功 | P0 |

不包含：新增全局 prompt 表单系统、跨 Profile/跨文档持久弹窗队列、统一所有业务页面、重写权限/安装器、Page/Controller 新 API、主动网站注入提示、production/全 CI/跨浏览器矩阵、独立评分。敏感操作原有审阅只调整展示时，不扩大或缩小原授权范围。

## 2. 已核对事实及复用判断

本节记录实施前 SOURCE_CONFIRMED 基线，保留作为变更原因；当前实现与验证见第 9 节。当前 main 有并行修改，不把工作树等同于已安装版本。

| 事实 | 当前证据 | 本方案使用方式 |
| --- | --- | --- |
| Web Flow 报 dirty/busy，框架负责离开保护 | `projects/webflow/src/ui/main.js:106`；`src/ui/sidebar-tools.js:1569` | 保留业务状态来源与框架导航 owner，不要求 Web Flow 自己再弹一次 |
| 现有确认保存 pendingAction/run，点击后继续 | `src/ui/sidebar-tools.js:923`、`:938` | 调整既有 owner 的展示接线；不建立第二套权限执行器 |
| 现有确认是 role=group、sticky，显示时聚焦取消 | `src/ui/react/tabs/tool-host.tsx:358`、`:370`；`src/ui/tool-shell.css:399` | 可证明“页面内插入确认块”的源码问题；真实页面布局仍需实施时验证 |
| 公共异步业务确认尚未导出 | `src/sidebar-tools/bridge.js:491`；`src/entrypoints/sidebar-shared-ui.js:35` | `ui.confirm` 需新增公开合同；不得冒充现有可调用 API |
| `ui.notify` 已有最小源码实现 | `src/sidebar-tools/bridge.js:473`；`src/sidebar-tools/ui-notice.js:1`；`src/ui/sidebar-tools.js:3727`；`docs/api/sidebar-tools.zh-CN.md:44` | 复用现有纯文本 Toast，不重建消息系统；只承诺源码事实，运行 NOT_TESTED |
| HTML/Vue 已有 `OpenDeskTool`；React 共享导出未含 Dialog | `src/sidebar-tools/bridge.js:491`；`src/entrypoints/sidebar-shared-ui.js:35` | P0 用命令式纯数据接口；复杂表单公共 React 外壳仅后续按需求评估 |
| 可信 AI Proxy 注入尚无 ui；沙箱手势端口限制操作白名单 | `src/ui/react/main.tsx:197`；`projects/ai-proxy/src/environment.ts:155`；`src/sidebar-tools/bridge.js:146`；`src/ui/sidebar-tools.js:1921` | 必须接通原可信 environment adapter 和沙箱两端白名单，不能只新增 Bridge 导出 |
| 已有遮罩和焦点管理分散在不同实现 | `src/ui/react/tabs/tools.tsx:74`；`src/ui/react/tabs/tool-host.tsx:949`；`projects/ai-proxy/src/App.jsx:20` | 抽取唯一通用展示原语，保留领域 review 内容与状态机 |
| 原生权限已有同步可信入口 | `src/platform/chrome/permission-gate.js:98` | 继续原 Authority，普通确认结果不能替代事件或许可 |
| 沙箱没有 allow-modals | `manifest.json:48`；`src/sidebar-tools/bridge.js:134` | 不放开同步原生弹窗，也不把动态 DOM 放入可信宿主 |
| R50 曾明确要求确认行内化 | `docs/architecture/browser-framework/site-permission-onboarding.zh-CN.md:112`；`tests/environment/no-modal-ui-r50.test.mjs:8` | 实施时只修订过时展示断言，保留来源、权限、草稿和无同步原生弹窗保护 |

前轮库存口径：共用顶部区在宿主有 19 个直接触发位置；框架另有 14 个行内确认/审阅表面；工具有 7 套严格模态确认、29 个调用位置。表面、封装和调用位置不能相加为缺陷数；迁移开始重查当前消费者及真实入口。源码重复不证明每处都应删除。

平台缺口：已有内部确认未给普通扩展公开；单个工具只能复制自己的浮层，无法统一框架跨工具离开保护，也无法在现有公开边界复用宿主的焦点/取消/撤权管理。这是跨工具展示缺口，允许在原 Bridge/Host/React owner 最小扩展；不是新增权限能力。真实运行触发状态仍待复现。

### 异步调用审查（2026-11-09，静态；运行开始时重查）

- AI Proxy `App.jsx:42` 用单个 confirmation 槽保存 resolver，重复请求会覆盖，cleanup 仅清 handler；`environment.ts:155` 的 pending 在 finally 释放。需复现连续请求/卸载的悬挂风险，再修恰好一次结算。
- AI Proxy `Settings.tsx:178/:582` 等调用有确认 reject 消费缺口风险；已有 revision/generation/ETag 与 environment 存活检查必须保留。不能把 `App.jsx` 的 busy:false 直接判为覆盖，environment 当前会重新计算状态。
- Quick Notes 的真实配置指向 `projects/quick-notes/src/main.js:69`，现有 ask→finishConfirmation→action 是回调模型，删除内部已有 catch/finally；新接口迁移要覆盖切换、新建、返回、删除，不把 void 本身判为遗漏异常。
- `src/ui/sidebar-tools.js:1569` 的 canLeave 是同步 boolean＋批准回调；必须逐个核对当前全部调用点，不能仅改 async 后继续 `!canLeave()`，也不能既 await 后导航又保留批准回调执行。
- `requestBrowserClick` 的 run/event 与 settle 回执是原可信链；不能改成普通 boolean 后再执行权限操作。Web Flow `main.js:368/:398` 已分开持久准备与真实点击同步 start，原 then/catch 与 epoch 保护不能被异步确认打断。

这些是源码事实/迁移风险，不是已运行的故障证明。限定范围未发现 `new Promise(async executor)`；没有理由批量重写 then。

## 3. 两部分职责与交互选择

### A. 扩展业务修改

- 判断是否真的需要用户作决定：已确认保存、复制成功、一般失败用已有 notify 或就近状态；字段错误保留在字段旁。Toast 不作为唯一的长期错误/结果未知提示。
- 提供业务目标、后果、明确动作标签；删除前保留具体对象 ID 与版本，返回确认后再验其仍有效，再调用原业务服务。成功提示只在真实持久回执/读回后出现。
- 准确维护 `setState({dirty,busy})`。搜索、筛选和只读浏览不应误报草稿；未提交执行参数是否为应保护草稿按业务产品语义决定，不能一概当“搜索输入”清除。自动草稿恢复须由业务独立设计，不假定已有。
- 内部路由由业务 guard 发起；关闭工具、跨工具/主 Tab 离开由框架 guard 发起。同一离开意图只有一个 owner 发起确认：原 owner 保留实例、原目的地和待决状态，重复点击不替换目的地，取消清除待决，确认核验后消费一次。requestId 只去重消息，不能代替这项业务去重；不为此新增公共权限令牌。
- 普通业务确认调用原公开 `ui.confirm`；敏感操作若原 SDK 本来会显示可信审阅，直接走该 SDK 审阅，不先加通用 confirm。Chrome 原生缺权限提示按实际缺口保留。
- HTML/Vue/React 均只传纯数据。业务不能传 DOM、JS、HTML、回调、假 isTrusted、权限令牌或“跳过审阅”标志给宿主。

### B. 框架公共能力

- 唯一展示原语放在 `src/ui/react/`，使用已有 React Aria/Buttons/Tokens；从现有 UninstallDialog/ImportSheet 等真实消费者提取共性，复杂审阅 body 仍由原可信 owner 组合。名称 `ConfirmationDialog` / `DialogHost` 是实现候选，不是另一个 React 根或独立基础设施包。
- 单一当前 ownerDocument 协调普通确认、导航 guard、可信审阅：单宿主最多一个决策浮层，后续新请求明确拒绝 busy，不覆盖当前目的地、不无限排队、不嵌套。相同传输 requestId 只结算一次。现有 `requestActionReview` 会取消并替换 pendingAction，必须由原 owner 改成明确拒绝新请求，并结算普通/可信旧调用方；只换 React 外观不满足目标。
- 复杂编辑器不是待决确认：需要关闭前确认时，由业务 adapter 暂时让出自己的模态/焦点锁，保留同一组件、字段、选区、滚动与 draft revision，再请求唯一决策浮层。取消、busy 或明确不可用时恢复原编辑器与焦点；确认且版本有效后才调用原关闭清理。临时让出不能触发原 onClose 的丢稿/卸载逻辑。AI Proxy 通过原 environment 的项目私有接线实现；不让框架扫描或控制沙箱业务 DOM，不新增通用表单 API。已有安装/权限审阅或另一待决确认不被暂停，返回 busy。
- 支持 Side Panel 与固定工具标签页；浮层位于该宿主的既有 Portal/主题边界，不能撑开正文，不跨 iframe/ShadowRoot 挂载业务节点，不锁其他窗口。
- 管理可访问名称/说明、焦点进入/循环/恢复、Escape、关闭、遮罩策略、scroll lock 的恢复和全部终态清理。
- 普通确认的可信外层标识来自当前安装信息，明确是“应用请求”；工具不能覆盖成平台权限标题/官方来源标识。纯文本按文本渲染，框架不接受应用自定义安全图标/HTML。
- 可信权限审阅复用展示原语，但保留原 `requestBrowserClick`/Authority 的操作参数、实例和真实 click 处理器；不公开其执行回调或 approvalRef。

| 场景 | 目标呈现 | 决策/执行 owner |
| --- | --- | --- |
| 保存成功、短状态 | 已有非阻断 Toast；需要保留的信息在业务状态区 | 业务验证回执，框架展示 |
| 字段错误、结果未知 | 就近错误/持久状态与原查询入口 | 业务；不靠弹窗反复打断 |
| 放弃草稿、普通删除/覆盖 | 统一简短确认浮层，默认取消 | 普通业务或框架导航 guard |
| 新权限、敏感 Cookie/Native/数据披露 | 原可信审阅内容＋统一展示外壳，必要时原生权限 UI | 原 Authority/Chrome；不是普通 confirm |
| 长表单、配置编辑、复杂差异 | 原业务页面/Sheet；逐步可选复用同世界展示壳 | 业务 owner；不强塞进双按钮确认 |
| 菜单、Tooltip、非阻塞详情 | 保留合适的现有非模态交互 | 原 owner，不纳入确认迁移 |

## 4. 公共接口的唯一合同

`OpenDeskTool.ui.confirm(options, {signal}?)` 的完整签名、输入白名单、结果与错误、手势、取消、期限及安全回退集中维护在[原 Sidebar Tool API](../api/sidebar-tools.zh-CN.md#异步确认opendesktooluiconfirm拟议尚未实现)。本计划不复制签名；当前实现已接通 Bridge/Host、可信 adapter 和统一 React 展示；源码与定向 Node 证据已具备，实际安装及原生运行仍须分别验证。

展示、业务/框架职责和 Promise/then 的当前规范见[统一确认、反馈与异步调用合同](../architecture/browser-framework/confirmation-and-feedback.zh-CN.md)。实施调用链须检查同步 guard 改异步、对象真值、return/await、reject、pending resolver、finally、原目标版本与真实点击，不做全仓 then 改写。

## 5. 生命周期与数据不丢失

- 初始化能力声明先于发送：旧 Host 缺声明、只读预览无私有通道时，本地明确 unavailable/零发送，不能等旧端口为未知操作回新错误。真实支持声明后的失败不触发本地二次确认。
- 沙箱页头内部返回经原 navigation-action 私有关联原实例/page/快照 revision/动作，仅在原同步派发栈让业务 guard 发起一次展示；自行 CustomEvent/迟到回调不能借用。关联只展示、不授予激活/Browser 权限；不新增公共令牌。跨工具离开仍由框架 guard 单独负责。
- 编辑器 Escape 的原生 cancel 进入合法关闭确认；暂让模态的 close、取消恢复及重开必须按原 opening generation/暂停状态核验。busy/unavailable/reject/过期恢复仍有效的原编辑器，旧 close 不清新草稿；销毁不重开。
- 每请求绑定原 sender/iframe、instance、toolId、宿主文档与安装代际；切换、关闭、卸载、停用/撤权、更新换代后原请求退役，迟到按钮/回包不能继续原操作。Page/Native 精确文档校验仍在其原执行链。
- 导航 guard 只保留原目的地和实例；busy/unknown 时拒绝丢弃，展示原持久状态，不能靠关弹窗或重开窗口绕过未知栅栏。选择“放弃修改”前再核对当前状态和绑定目的地。
- dirty 判定采用业务基线/修订语义。等待期间若真实保存回执已清除 dirty、异步业务改变目标或保存开始，关闭过时确认并保留现场，不悄悄跳转旧目的地。下一次明确导航按当前状态处理。
- 点击“继续编辑”或 Escape 后字符、选择、滚动和业务组件实例不重建。框架记录 iframe 外层焦点，Bridge 协作保存/恢复当前工具内可用触发点；节点已移除时聚焦当前界面安全入口，绝不聚焦旧实例。
- P0 只提供“继续编辑／放弃修改”。“保存并离开”仅在业务已有可调用、可验证的保存流程并能处理冲突/unknown 后另行接入，不让框架猜业务保存按钮或伪造保存成功。
- 不自动缓存敏感正文到日志、磁盘或全局队列。诊断仅保留请求 ID、终态、错误码、计数及必要脱敏身份。

## 6. 实施顺序、owner 与交付

| 阶段 | 具体动作与主要文件范围 | 完成出口 |
| --- | --- | --- |
| S0 真实核心链与基线 | 现有已安装/开发入口：Web Flow 输入真实草稿→返回/切 Tab；核对实际路径、ID、serve、版本与并行 owner。再取 HTML/React 试点确认的最短操作。源码分析不能代替此基线 | 首次操作/布局、草稿、焦点及已有失败有证据；不先跑全组测试 |
| S1 展示原语与协调 | `src/ui/react/components/`、现有 `tool-host.tsx`/`tools.tsx`、`sidebar-tools-view.js`、最小样式；将已有顶部区接到统一浮层，保留 pendingAction/run 的可信 owner | Web Flow 离开草稿不挤正文，取消保稿、放弃后只执行原导航一次 |
| S2 SDK 展示出口 | 原 `src/sidebar-tools/bridge.js`、最小纯 schema/lifecycle 模块、`src/ui/sidebar-tools.js`；初始化支持声明、发送前不可用判断；原端口白名单、键盘/dialog-cancel 与导航消息私有关联；可信 `main.tsx` environment 注入；根定向测试 | 沙箱和可信 adapter 接同一展示服务；旧 Host 零发送回退；内部返回/原生 Escape 合法发起展示但不获得权限；异步终态、来源与失效正确；不新建 Authority |
| S3 业务试点 | Quick Notes HTML 的普通删除/覆盖；AI Proxy React 的普通删除、内部草稿导航及编辑器关闭确认，由项目 adapter 接新接口；Web Flow 仅修实际复现的 dirty 问题 | 两技术栈复用能力；每意图一次确认；编辑器可取消恢复/放弃退出且不嵌套；删除/保存/取消回执与原语义一致；AI Proxy 不改变日常真实代理 |
| S4 P0 核心验证 | 按相邻规格选择公共行为、权限负例、两个业务 owner 的定向测试及必要真实流程 | 如实报告源码、编译/运行/安装证据；P0 行为通过才称核心开发完成 |
| S5 其余消费者迁移 | 重新核对 14 个框架表面和工具调用库存，按普通确认/敏感审阅/复杂表单分类；各真实 owner 分批接入 | P1 按批列完成/保留理由，不把统一浮层当作批量删确认授权 |

并行约束：只在各仓库现有默认分支工作；本仓库 main；不建分支/worktree/PR。当前 `sidebar-tools.js`、`tool-host.tsx`、`tool-shell.css`、API 文档、Web Flow 多文件及 AI Proxy 的 App/Settings/样式/测试等已有其他任务修改。静态审查后代码仍可能变化，实施开始重查实际重叠，与共享 owner 协调仅受影响文件；其余独立工作继续。不覆盖他人改动，不停止 watcher，不改其他扩展业务。

源码/测试归属：业务测试留 `projects/<真实owner>/tests`；根测试只验证公共 SDK/Host、展示、授权与跨项目合同。优先扩展现有行为测试；新测试仅填实际缺口，不创建每版字符串断言。候选公共 `sidebar-tool-ui-confirm` schema 测试与 React 焦点测试的文件名在实现时核实，不能将拟议文件名说成现有命令。

Vue 兼容证据：选一个现有 Vue 工具保持源码和正式包不变，验证打开、原交互与 SDK；新 confirm 调用只补最小既有 Vue fixture，不迁移完整工具。HTML＋React 试点本身不构成全栈兼容证据。

文档交付：本目标和测试规格、DESIGN 作用域；实施时在原公开 API/开发文档及原权限交互合同维护稳定签名与规则，更新与展示有关的 R50 过时断言。新 API 不先写成已实现；不另建第二份权限/SDK 总合同。

构建与安装：日常复用当前已有 `npm run dev` / `dist/development`，先查调试页真实连接和 revision，不能据历史 PID 启第二 writer。本方案不启动或切换产品环境。若本次需要交付正式工具 JSON，按原候选→定向门禁→同打包器晋升→同源核对流程；可信框架代码需原本体安全刷新，JSON 不能替代。真实安装、production 与独立评分只在相应阶段触发。

## 7. 方案取舍与风险

- 选择“框架托管简短确认＋业务 adapter”：HTML/Vue 可用，统一导航体验，业务不侵入宿主。代价是跨 iframe 焦点与生命周期需要精确测试。
- 不选“每工具复制 React Alert”：会继续重复取消、焦点、堆叠管理，且不能处理框架导航 owner；既有 fallback 只服务旧 Host，不建立第二条公共产品路径。
- 不选“所有状态都全局模态”：增加打断，长表单/差异审阅不适合双按钮；状态反馈复用 notify，复杂 UI 保持业务归属。
- 不选“普通 confirm 自动批准特权”：会混淆信任与手势，必须由原 Authority 独立决定；共享只发生在展示原语。
- 风险：双重确认、误报 dirty、旧实例执行、背景滚动/焦点泄漏、丢失深色主题/跨 iframe 样式、RPC 先超时而弹窗仍活着。均对应关键测试，不以扩大权限或放宽断言解决。
- 最大未验证项：当前日常安装/serve/渲染路径、各试点真实触发行为、旧 Host 回退；实施时在 S0 重查，不能承接前轮静态计数为浏览器事实。

## 8. 官方依据与状态

- [React Aria Modal](https://react-aria.adobe.com/Modal)：受控关闭、对话框语义与模态行为；当前滚动文档未锁定已装 1.22.1，具体 props 需对照本机类型/行为确认，不据此升级依赖。
- [WAI-ARIA APG Alert Dialog](https://www.w3.org/WAI/ARIA/apg/patterns/alertdialog/examples/alertdialog/)：不可逆丢弃默认聚焦保留动作、Tab 循环、Escape/取消及名称/说明。
- [Chrome permissions.request](https://developer.chrome.com/docs/extensions/reference/api/permissions#method-request)：用户手势要求及浏览器实际许可结果。
- [MDN User activation](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/User_activation)：瞬时激活可能超时/被消费，异步结果不构成通用激活凭证。

当前状态：框架接口与代表扩展接入 SOURCE_IMPLEMENTED，公共与业务定向 Node 验证已有证据；真实 Chromium 离线源码夹具结果见第 9 节。真实已安装 Side Panel、Chrome 权限、Native、production 仍 NOT_TESTED。独立方案审查不能提升为产品验收。

独立静态审查：架构与交互两位 reviewer 均认为方向可行；已纳入编辑器模态让出/恢复、业务意图去重、可信 adapter 与手势接线、abort 竞争和明确回退条件。该结论只针对方案，不是产品行为 PASS。
