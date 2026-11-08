# Web Flow · 脚本开发、安装、关联与维护指南

> 更新：2026-11-09。适用仓库：`shopable-ai/opendesk-browser`，项目：`projects/webflow/`。状态：**现有功能的真实使用指南 + 新增脚本体验的设计方案（尚未实施）**。
>
> 本文是操作与交互指南，不是第二份产品需求真相层或项目进度账本。长期目标以 [产品合同](product-contract.zh-CN.md) 为准；功能进度、验证等级与当前阻塞以 [执行计划](execution-plan.zh-CN.md) 和真实源码为准。不得把本文描述的拟议按钮、Codex 自动集成或动态关联视为已发布功能。

> 可点击交互原型：[脚本添加 / Codex 提示词 / 安装流程](../preview/script-onboarding.html)。这是单文件 HTML 设计演示，不连接真实 Task、Codex 或安装权限；正式 Web Flow V0.3.2 预览 `preview/index.html` 保持不变。

## 0. 先看结论

**开发在顶部「开发」，安装由原可信安装器负责，Web Flow 的「脚本」用于查看、关联和运行其获准的 Controller Task。** Web Flow 不建立第二个编辑器、Task Catalog、Runner、安装器或授权层。

普通用户的理想闭环：

1. 在 Web Flow → 脚本中点击拟议的 `+` →「添加脚本」，选择已有任务、直接开发、Codex 辅助或已有包。
2. **创建/修改**：简单脚本到顶部「开发」直接写 JavaScript 并试运行；多文件项目使用已批准的本地目录，Codex 可以帮助修改源码、测试和生成发布候选。
3. **验证与安装**：通过原 `opendesk-script-authoring` → `opendesk-program-publish` 流程冻结来源、核验真实目标网页，再由可信 Installer 审阅固定版本、站点和能力；保存草稿/复制提示词/测试 PASS 都不算已安装。
4. **关联 Web Flow**：核对已安装 Task 是否被 Web Flow 的固定委托清单允许。当前版本不能随意增加新的关联；未来的动态关联必须经过通用 SDK 的独立授权与实现。
5. **使用与维护**：按已批准的网站、参数和触发来源运行；通过原 run/result 查看结果与释放，停止、撤权、版本更新与 UNKNOWN 均沿现有权限和生命周期流程。

## 1. 三个入口各做什么？

| 入口 | 面向用户的职责 | 真实代码/权限归属 |
| --- | --- | --- |
| 顶部「开发」 | 编写/编辑/预览 JS、React、Vue；本地目录开发、明确试运行、生成可验证候选 | 复用已有 Editor、Controller/Page 执行世界及 Native/Local Dev；不是 Web Flow 私有编辑器 |
| 顶部「我的 → 任务目录」 | Controller Task 的固定候选、安装、停用、升级与管理 | 原 Task Catalog / Authority / Installer |
| 顶部「扩展 → 网页增强」 | 已安装 Page USER_SCRIPT 的站点匹配、启停和管理 | 原 Page Authority；不能冒充 Controller Task |
| 「扩展 → Web Flow → 脚本」 | 查看和运行本应用有权委托的任务，搜索/筛选/收藏/查询安装状态 | Web Flow 沙箱只通过已审阅 `OpenDeskTool.request` 委托；不读私有安装数据库 |

注意：「应用 / 网页增强 / 自动化任务」是产品运行方式，不要求额外新增顶部 Tab。Web Flow 是组合式 Sidebar Tool，其内部「脚本」标签页不是通用开发中心。

### 按目标选脚本类型

| 用户目标 | 推荐类型 | 执行世界与安装入口 |
| --- | --- | --- |
| 搜索、填表、点击、提取与结构化结果 | **Controller Task** | 受控 Worker 中使用 `page` / Locator，正式任务归「我的」 |
| 给网页增加按钮、提示、交互面板 | **Page USER_SCRIPT** | 网页 USER_SCRIPT 世界使用 `document`；正式版本归「扩展 → 网页增强」 |
| 创建完整的侧边栏工具 UI | **Sidebar Tool** | 独立沙箱应用，通过 `OpenDeskTool` 与已审阅能力交互 |
| 多步骤任务组合、交接和恢复 | **Web Flow 工作流** | 消费已批准任务；不自己运行任意生成的 JS |

Controller 不得直接使用网站的 `document`；Page 没有 Controller 专用的 `page/params/axiosx`。JavaScript、React 和 Vue 是编写技术，不决定权限或运行世界。

## 2. 当前正式 Web Flow：已实现与未实现

截至本次只读核查的 `main`：

- `projects/webflow/tool.config.json` 的应用版本为 **0.3.13**，`delegatedTasks` 只有两项固定身份：`baidu.search.top3@1.1.4`、`google.search.top3@1.0.0`。
- `projects/webflow/src/ui/main.js` 使用固定 `PINNED` 通过 `tasks.read({taskId})` 核对版本、`manifestHash`、`contentHash`、`installationId`、`generation`。这不是“扫描所有已安装脚本”的能力。
- 正式「脚本」目前有搜索、筛选、刷新、收藏、详情、手动运行与宿主管理；**没有“添加脚本”完整业务入口**。设计预览里出现 `+` 不证明正式产品已经实现。
- 现有 `tasks.run` / `delegatedTasks` SDK 只委托安装包审核过的固定 Task；新增任意 Task 不会自动给 Web Flow 运行权。当前 v2 固定委托清单允许 1–16 项；修改 pin 通常涉及应用源码/包审阅和安装生命周期。
- 新 `0.3.13` 包的源码/定向浏览器 UI 检查与正式安装/真实网页运行是不同证据。严格按照 [README 顶部当前状态](../README.md) 和 [执行计划](execution-plan.zh-CN.md) 确认真实装机状态，不套用旧 0.3.6 示例或把历史成功当作新包已验收。
- ChatGPT 普通需求 → 唯一五字段候选 → 可信核验 → 已安装 Task → 真实结果返回，是另一条独立运行链。用户每次不需要手工写五字段；**AI 产出的文本不授予新的脚本安装或执行权限**。

### 现有版本实际可走的路径

**A. 使用已支持的固定任务**：在宿主「我的」确认原 Task 已安装且身份匹配、网站权限有效 → 打开 Web Flow 的「脚本」查看 `tasks.read` 状态 → 按当前合法目标手动运行，或在可信“运行与授权”审阅适用的自动触发范围。若版本或站点不匹配，停止并按真实错误处理。

**B. 开发新任务**：顶部「开发」直接编辑并显式 Run，或经已有 Local Dev/Native/MCP 的已授权目录让 Codex 修改源码；真实验证后按原 Program Publish Skill 安装到宿主。**新 Task 此时不自动出现在 Web Flow，也不自动获得委托许可**。

**C. 把新任务加入 Web Flow**：近期只有在修改 Web Flow 的合法固定委托配置及对应运行入口、通过原打包和重新审阅后，才可能成为其固定任务；不是把名字写进本地收藏或侧栏存储即可使用。动态关联属于下一阶段，不能在本项目沙箱私造目录或扩权。

## 3. 拟议 UI：只增加一个明确的添加入口

设计方向：**保留「概览 / 脚本 / 记录」三个 Tab，不新建开发 Tab，不把运行和版本管理塞进脚本卡片。**

「脚本」列表工具栏在搜索和筛选旁增加一个紧凑 `+` 图标，点击打开底部弹层「添加脚本」，只展示四条路径：

1. **从已有任务中添加**：目前展示说明或跳到原宿主任务目录；动态选择/关联只有在新增受审公共 API 后才可启用。不能以不可用的全局枚举填充假列表。
2. **新建自动化脚本**：解释 Controller/Page 区别，使用**真实支持的宿主导航能力**到顶部「开发」，或明确显示如何打开；禁止在沙箱伪造可信导航事件。
3. **使用 Codex 开发**：轻量表单填写“要做什么”“目标网站”“可选输入输出”，预览可编辑的开发提示词，`复制提示词`；只复制文本，**不自动执行、安装、启动 Codex 或获取仓库权限**。
4. **已有脚本/安装包**：告知原 Task/Page/Sidebar Tool 安装入口，区别版本冻结、安装确认及 Web Flow 关联。若可用公开导航能力尚未核实，保持指引而非假按钮。

主列表卡片只显示**任务名、目标站点、可运行/需核验状态和必要动作**。`详情` 折叠显示 Task ID、版本和哈希；`运行与授权` 继续由可信宿主持有，避免第二套 Switch 或权限弹窗。

### 建议空态和错误文案

- 无任务：「还没有可以使用的脚本。你可以从开发中心创建，或先安装一个 Controller Task。」
- Task 已安装但未在 Web Flow 委托清单：「已安装，但 Web Flow 尚未获准调用它。」不能显示「可运行」。
- 固定版本不匹配：「该脚本版本与 Web Flow 的已审阅版本不同。请核对更新与重新关联。」
- 网站不匹配：「当前网页不在此脚本的批准范围。」
- 无法确认安装：「安装状态待核验；不会自动运行。」
- UNKNOWN：「原请求结果未知。只允许查询/停止原请求，不得直接重新运行。」

## 4. Codex 开发提示词：可复制而非第二套 AI IDE

仅把已填写的普通用户需求、目标网站、输出目标和真实项目上下文拼成一份完整提示词。不要默认生成伪造的 Task ID、`installationId`、`sourceHash` 或已授权声明。用户首次应先选择运行类型，若不确定由 Codex 阅读仓库公开文档后决定。

### 可直接给本地 Codex 的模板

```text
GOAL：为 OpenDesk Browser 开发一个可以正式安装的网页自动化脚本，并在合法情况下交给 Web Flow 使用。

仓库：shopable-ai/opendesk-browser；默认主分支 main。
用户目标：[用一句话说明要自动完成什么]
目标网站：[完整 URL 或确切 origin]
输入/参数：[可填写；没有则说明]
预期结果：[网页行为、字段及结构化返回]
是否需要定时/自动触发：[默认否；具体条件需另行审核]

开始前先阅读 AGENTS.md、projects/webflow/AGENTS.md、项目 README；
核对当前 HEAD、未提交/并行修改及既有候选，不重复建相同任务。
阅读 .agents/skills/opendesk-script-authoring/SKILL.md；
正式发布阶段再阅读 .agents/skills/opendesk-program-publish/SKILL.md。
先按 docs/api/extension-development-selection.zh-CN.md
判断 Controller Task / Page USER_SCRIPT / Sidebar Tool；若是 Web Flow 的
网页操作任务，优先 Controller，不额外新建 Web Flow 内部编辑器/Runner。

优先复用已有 SDK、示例、受审 Runner/Authority/Installer、现有源代码 owner。
开发、编译、预览/运行、冻结、验证、安装、关联是不同状态；
只改/保存源码不能视为执行、测试、安装、发布或授权。
明确运行前遵守真实网站权限与用户确认，不擅自对有副作用任务试跑。
验证实际网页行为、同一源码哈希、Controller Run/Result、资源释放。
若结果 UNKNOWN，只读查询原 requestId/runId，不换身份重放。
若用户要求 Web Flow 关联，先核对 tool.config.json delegatedTasks 现有
固定 pin/公开 API；若不支持动态关联，报告缺口和最小通用接口方案，
不要通过沙箱、私有 Host 或伪造安装身份实现。

输出：实际修改文件、任务类型/参数 schema、站点/权限、运行验证证据、
候选/安装/关联各自状态、未完成事项及最短的用户下一步操作。
不自动向其他分支提交；不覆盖其他任务的修改。
```

建议复制内容允许用户先预览、再修改。未来如果要增加「在 Codex 中打开」，必须先验证本机有明确授权的外部入口、真实项目绑定、是否能创建新对话及其确认回执；**不能把剪贴板或打开链接描述成已在 Codex 执行**。

## 5. 安装、关联与授权不能合并成一个状态

拟议用户可读状态：

| 状态 | 事实含义 | 不代表 |
| --- | --- | --- |
| 草稿 Draft | 已编写源码 | 可执行或已安装 |
| 已验证 Verified | 有真实同源码的验证证据 | 用户批准安装 |
| 可安装 Available | 候选满足对应审核合同 | 已安装 |
| 已安装 Installed | 可信 Installer 已确认真实安装身份 | Web Flow 获得委托权 |
| 已关联 Associated | Web Flow 委托范围明确允许该固定任务 | 任意来源、站点、参数、聊天可自动运行 |
| 已获触发许可 | 当前来源/站点/参数及安装代际获可信批准 | 网页业务结果一定成功 |

当前系统中“已关联”的技术语义是 **Web Flow 安装包已审阅固定 `delegatedTasks`，且运行时读回同一真实 Task 安装身份**；未来关联应复用/扩展原 Authority，但不得直接把普通沙箱的“关联按钮”当成授权。

运行状态必须区分：请求入场、Controller 已运行、执行终态、业务数据核对、持久化 Result、`retirementState:released`、结果回原聊天及 AI 续答。`completed` 只表示脚本执行终态，不证明网站业务操作已按用户预期完成。

权限变更必须以版本及能力差异提示，至少审阅：站点 origin、`permissions`、`paramsSchema`、安装版本/源码摘要、触发来源与可变化参数范围；敏感字段（付款金额、收件人、上传、Cookie、网络等）不能由 AI 自行扩大批准。

## 6. 脚本配套：先做必要能力，再做市场

| 优先级 | 模块 | 所属及边界 | 当前状态 |
| --- | --- | --- | --- |
| P0 | 一个 `+` 入口和四条可理解的添加路径 | Web Flow UI；不创建新顶部 Tab | 设计，未实现 |
| P0 | Codex 提示词生成、预览、复制 | Web Flow；文本操作非代码执行 | 设计，未实现 |
| P0 | 当前固定任务的真实安装状态、版本不一致/未授权/未知提示 | 复用 `tasks.read` 与现有 UI/Authority | 基础能力已有，按真实证据定向补全 |
| P0 | 开发/安装/运行/关联状态解释、帮助入口 | Web Flow 帮助 + 本指南 | 文档已定义，UI 待实现 |
| P1 | 从真实已安装 Task 目录选择、授权关联、撤销关联 | 通用 Browser SDK/可信 Host owner；需先证明公开 API 缺口 | **SDK_GAP_NOT_PROVEN / 未实现** |
| P1 | 新版本差异审核与关联兼容提示 | 原 Installer / Authority + Web Flow 状态投影 | 待针对真实消费者设计 |
| P2 | 示例模板、可审计分享、签名/来源与完整性信息 | 复用原发布和安装体系 | 规划，不视为已提供脚本商店 |
| P2 | 多步骤可恢复任务编排 | 复用 Web Flow 原队列计划与公共调度 | 本轮不接入新执行器 |

P1 动态任务关联应先证明通用 SDK 缺口：给出当前 `delegatedTasks` 固定 pin 的真实限制、具体用户动作、既有 API 无法满足的复现、最小通用 API、安装身份/代际/撤权与并发恢复边界，并交 Browser 平台 owner 审查。**不能先开放“任意 taskId + run”再补权限**。

## 7. 定向验收矩阵（对后续实施的要求）

验收 P0 的最短用户链为：**打开 Web Flow → 脚本 → 添加 → 选择开发路径或复制正确 Codex 提示词 → 通过现有可信入口继续下一步**。不要把 HTML 模拟点击算作发布版功能。

1. 侧栏 320/360/400px：搜索/筛选/添加图标同排，不遮挡；可用键盘、Escape、焦点恢复；新增控件可访问。
2. 已安装固定 Task：原 `tasks.read` 版本、哈希、代际与当前页面资格仍核验，不改变原运行链。
3. 未安装/版本不符/网站不匹配/撤权：不可通过“添加”绕过；提示准确下一步。
4. Codex 复制：内容包含真正仓库、源规范、目标网站和输入输出；复制不触发 Run、Install、导航或授权。
5. 进入开发：使用受支持的真实宿主导航能力；没有则说明入口，不伪造 CustomEvent。
6. 原手动运行、原步骤持久恢复、Stop 与 UNKNOWN 防重放无退化。
7. ChatGPT 正常消息的五字段候选与原聊天单次结果交付无回归，不要求每轮粘贴手工协议。
8. P1 单独验收动态任务列表、按安装身份授权、撤销、重装/升级变化、跨工具隔离及原生 Chrome；不能使用 P0 的 UI 成绩替代。

分层报告 **SOURCE / NODE / CHROMIUM / CHROME_NATIVE / INSTALL / BUSINESS / RELEASE** 的证据等级，没测写 `NOT_TESTED`。若做独立专家评审，UX、架构复用、安全、可用性、可实施性、测试能力各按 100 分分别计分，综合采用算术平均，目标 ≥95；没有真实独立评审不能宣称已达成。

## 8. 开发者必读链接（唯一事实源）

- [项目 README（当前实装与证据）](../README.md)
- [Web Flow 长期目标](product-contract.zh-CN.md)、[当前执行计划](execution-plan.zh-CN.md)
- [Web Flow 早期 UI / UX 审查](webflow-v0.3-ui-ux-review.zh-CN.md)：提供既有“添加脚本”构想，属于历史原型资料，**不是**本版功能证明
- [场景与执行世界选择](../../../docs/api/extension-development-selection.zh-CN.md)
- [Controller API](../../../docs/api/controller.zh-CN.md)、[Page USER_SCRIPT API](../../../docs/api/page-userscript.zh-CN.md)、[Sidebar Tool API](../../../docs/api/sidebar-tools.zh-CN.md)
- [本地开发快速入门](../../../docs/api/quickstart.zh-CN.md)、[本地项目](../../../docs/api/local-projects.zh-CN.md)
- [脚本创作 Skill](../../../.agents/skills/opendesk-script-authoring/SKILL.md)、[程序发布 Skill](../../../.agents/skills/opendesk-program-publish/SKILL.md)
- [统一扩展创建工作流](../../../.agents/workflows/extension-creation.md)

**维护约束：** 本指南只解释 Web Flow 如何使用上述公共能力。实际需求或阶段进度变化，更新既有 `product-contract.zh-CN.md` / `execution-plan.zh-CN.md`，然后同步修订指南中与之冲突的说明，不另造第二套 BR/ AWB 编号或状态账本。
