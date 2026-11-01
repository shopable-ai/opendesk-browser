# OpenDesk Web Flow V0.3｜正式应用 UI / UX 与开发工作台设计审查

> 日期：2026-11-01；状态：**UI/UX 设计方案 + 离线 HTML 交互原型；未接入产品，不代表真实浏览器功能验收**。  
> 事实基线：GitHub `shopable-ai/opendesk-browser`，远端 `main` 提交 `3f808dd7300ba71fb19d3526116df3ec0a5c3d17`（2026-11-01 15:44:52 UTC）。  
> 取证范围：**评审依据 GitHub 远端源码；未访问用户 Mac `/Users/shopme/Documents/workspace/opendesk-browser` 工作目录，也没有查看并行未提交改动。**  
> 交付状态（2026-11-02）：**根据用户后续明确指示，直接写入 GitHub 现有 `main` 的 `projects/webflow/`，由单一提交新增本评审与独立 HTML 交互原型。未修改既有 Sidebar、Bridge、Installer 或业务 UI 源码；未新建分支、未发布、未接管 V0.1/V0.2。** 仓库写入不等于原型已集成正式产品。

## 0. 决策摘要（产品、UX、交互、开发工具、扩展安全、前端六方评审）

**决策 D01：Web Flow 是“扩展 → Web Flow”中的单一组合式应用，不是第六个宿主顶层 Tab。** 不改宿主“我的 / 扩展 / 工作流 / 开发 / 云控”导航。应用负责组织 Web Flow 关联的自动化任务、预批准模式、执行证据与交接；真正安装/启停/运行/权限/持久结果仍由现有 Authority、TaskWorkbench、RunHost、原 Installer 提供。

**决策 D02：Web Flow 正式应用内默认四个工作区：概览 / 脚本 / 记录 / 设置。** “流程”是未来多任务编排的条件工作区，直到真实可用的调度/权限/存储/交接接线经过验收才启用正式运行；离线原型为了评审保留概念页，但明确“尚未接入”，没有执行按钮。开发者入口是“设置 → 开发者工具 → 前往宿主‘开发’”，而不是复制代码编辑器。

**决策 D03：将“安装”与“自动运行授权”分离。** 安装且启用、Chrome 站点权限、Web Flow 自动运行总开关、每个精确固定任务版本的持久自动授权、目标页与来源对话绑定分别核验。总开关不会静默向脚本授予权限；普通安装完成后应可立即在合法范围手动使用，不应增加无意义的第二个通用“启用步骤”。

**决策 D04：用户主要看任务名、网站、行为、状态、下一步。** `taskId`、`candidateId`、`requestId`、`runId`、`resultId`、`sourceHash` 属于“开发者技术详情”而非普通列表必读字段。结果“代码运行结束 / 业务成功有证据 / 持久结果保存 / 交付原对话 / AI 继续回复”必须逐项区分。

**决策 D05：原型安全隔离。** HTML 中的安装、授权、运行与状态切换都仅使用当前页内存中的演示数据；不请求 Chrome 权限、不调用 Native、没有网络访问、不读写本地文件、不更改现有用户数据；与真实安装器/Sidebar 不构成同一条运行链。

**暂缓事项 D06：协议更名。** 现行仓库产品合同列出 `opendesk.task.intent.v1` 五字段；用户在并行 V0.1 线程提出希望改成 `webflow.task.intent.v1`。V0.3 UI 不修改实际协议，也不宣称此更名已落地。正式接线前必须从当前 P0 owner 读取真实 parser、旧候选防重放/授权/回传的兼容决议；若实施迁移，只能由原权威进行兼容窗口、版本识别、幂等与拒绝冲突的统一处理，绝不能让两个字符串对应两次独立执行。

## 1. 仓库事实盘点与状态分级

| 观察到的真实入口 | 文件和事实 | 复用动作 | 证据等级 |
|---|---|---|---|
| 宿主 Sidebar | `src/ui/sidepanel.html` → `#opendesk-react-app`、`src/ui/react/main.tsx` → `app-shell.tsx` | 单 React 根；不新建 Web Flow 可信 Shell | `SOURCE_INSPECTED` |
| 宿主一级导航 | `src/ui/react/tabs/navigation.tsx`、`src/i18n/sidebar-navigation.js` | 继续“我的 / 扩展 / 工作流 / 开发 / 云控”；原应用调试/调试条件显示 | `SOURCE_INSPECTED` |
| Controller 安装任务 | `src/ui/react/tabs/my-page.tsx`、`tasks.tsx`、`task-catalog.tsx`、`my-sections.tsx` | 原 Task 目录中的导入/固定版本审阅/安装、手动运行、停止、记录 | `SOURCE_INSPECTED` |
| 扩展与 Page 管理 | `src/ui/extension-center-model.js`、`extension-center.js`、`src/ui/react/tabs/tools.tsx` | App/Page 的启停、卸载、候选更新、来源/授权状态保持权威 | `SOURCE_INSPECTED` |
| 既有开发工作台 | `src/ui/react/tabs/develop.tsx`、`develop-editor.tsx`、`develop-local.tsx`、`develop-diagnostics.tsx` | JS/React/Vue、本地项目、预览、运行、保存、诊断与后续发布的跳转 | `SOURCE_INSPECTED` |
| 既有 AI 工作流 | `src/ui/react/tabs/workflow.tsx`、`src/ui/workflow/` | 继续复用其独立会话/生成能力，不在 Web Flow 重造编辑页 | `SOURCE_INSPECTED` |
| 设计系统 | `src/ui/design-tokens.css`、`design-system.css`、`src/ui/react/components/ui/*` | Tokens、表单、Switch、Button、Card、焦点/深色模式；所有复用先按执行世界核对 | `SOURCE_INSPECTED` |
| Web Flow 业务 owner | `projects/webflow/README.md`、`AGENTS.md`、`docs/product-contract.zh-CN.md`、`docs/execution-plan.zh-CN.md` | 项目内新增业务/预览，不迁移历史 Send Queue、Bridge 主权 | `SOURCE_INSPECTED` |
| Web Flow 离线代码 | `projects/webflow/src/handoff-contract.js`、`src/queue/{state,repository}.js`、`docs/offline-modules.zh-CN.md` | 交接包/单 owner 队列状态作为后续集成候选，但不能展示为运行中服务 | 文档记录 `COMPONENT_TESTED`；本轮未执行仓库测试 |
| 旧 Web Flow V0.1/V0.2 | 所检查的 `projects/webflow/` 远端 main 未看到独立可安装 UI/交付包，存在另一个用户并行开发线程 | 接入前在本机对照已完成代码、HEAD/working tree、消费者 | `LOCAL_NOT_INSPECTED` |
| 离线交互 HTML | `projects/webflow/preview/webflow-v0.3-preview.html`（本轮隔离交付） | 模拟体验、审查和后续 UX 验收参照 | `PROTOTYPE_SMOKE_TESTED`，非产品通过 |

**关键约束：** 仓库现行规则指出 Web Flow 是 **Combined Application**，不同执行世界仍采用原有独立安装/权限合同；尚无通用“把所有职责原子装到一起”的安装器。不得用 Web Flow UI 文案掩盖此事实。已有 AI Send Queue 的唯一业务 owner 为 `examples/sidebar-tools/ai-send-queue/`，不能复制其页面发送引擎；真实持久交付必须复用经验证的 Bridge/authority 通路。

## 2. 当前 UI 问题清单与优先级

以下是根据代码与产品职责的 **设计差距判断**，不是声称已在用户 Mac 上真实点击复现的视觉缺陷。

| ID | 优先级 | 代码事实 / 体验风险 | 改进方案 | 通过条件 |
|---|---|---|---|---|
| UI-01 | P0 | 用户要在“我的”找任务、在“扩展”找应用、在“工作流”看生成、在“开发”看源码；Web Flow 缺单一应用级入口 | “扩展 → Web Flow”应用首页提供跨能力的明确关联与下一步 CTA | 首次使用能在 2 次定位动作内找到脚本管理入口 |
| UI-02 | P0 | 安装、启用、网站许可、预批准自动触发容易被一个“已启用”掩盖 | 按层显示总开关 / per-task grant / Chrome 权限 / 固定安装身份；“自动就绪”须全部满足 | 开总开关不改变单脚本授权；权限缺失绝不显示 ready |
| UI-03 | P0 | `completed` 与业务动作成功、结果持久化、聊天交付存在语义混淆风险 | 记录拆为运行、网页业务、持久结果、交付、AI 续答；UNKNOWN 对账优先 | 无法从一次 `completed` 得到“已成功搜索/已发送”的不实结论 |
| UI-04 | P0 | 旧候选/更新/同名脚本若直接按名称触发会冲突或漂移 | 人类名称用于搜索/展示；运行必须精确固定 `taskId`+安装源/版本/hash+授权代次；拒绝歧义 | 同名多包不误运行；更新需重新核验绑定 |
| UI-05 | P0 | V0.1 P0、V0.2 可能在本机平行开发，覆盖公共 UI 风险高 | UI 独立模拟方案；正式接线先做 HEAD/dirty diff/消费者冻结 | 零覆盖、零重复 Host/Installer/React root |
| UI-06 | P1 | 单任务技术数据复杂、普通用户可能不懂 manifest | 卡片默认显示图标/名称/站点/状态/下一步；折叠技术细节 | 新用户无需看 ID 即可完成安装审阅与授权 |
| UI-07 | P1 | 20/100 条时逐项浏览效率下降 | 搜索名称/网站/作者/精确 ID；收藏、状态筛选、按网站/状态分组、分页/虚拟化按规模启用 | 100 条仍能快速查找、键盘可操作，不产生百个重 DOM 编辑器 |
| UI-08 | P1 | 更新、卸载、停用跨多 owner，操作结果可能只更新展示 | 复用原安装/授权 API；持久读回前不得显示成功；变更差异/来源/数据清理明确 | 变更回执与持久安装状态一致 |
| UI-09 | P1 | 新建/导入/调试/发布入口散在宿主多处 | 开发者“创建 → 宿主开发 → 运行验证 → Task 目录固定发布/安装 → Web Flow 关联”的导向路径 | 不复制编辑器，向导跳到已有入口后返回 |
| UI-10 | P1 | 窄侧栏无足够宽度同时展出全部字段 | 320–360px 只放摘要/状态/主动作；技术信息进入详情 | 无横向页面溢出、按钮可点、状态不被截断 |
| UI-11 | P2 | 流程/交接能力还未完成真实接线 | 概念页可看不可执行；正式工作流导航条件显示 | 不把组件测试/离线队列冒充可启动流程 |
| UI-12 | P2 | 长期可能需要按项目/个人标签整理 | 分组（网站、功能、项目）可视图，收藏优先；自定义组后续 | 自定义标签不作为权限或安装身份 |

**推荐顺序：先修“能否找到 + 状态和权限是否可信”，再优化美观和高级管理。** 大幅换肤、另建平台 Tab、第二套 editor、后台新 Runner 都不是 V0.3 成功前提。

## 3. 新版信息架构：两个层级而不是两套系统

```text
OpenDesk Browser · 宿主可信 Sidebar（沿用）
├─ 我的           Controller Task/定时任务：原运行与安装身份 owner
├─ 扩展           Sidebar 应用、Page Program：原 Extension Center owner
│  └─ Web Flow   ← 作为已安装/通过原入口打开的应用；当前仅方案
│     ├─ 概览     全局自动开关；问题提醒；计数；快捷动作；最近结果
│     ├─ 脚本     已关联并真实安装的 Controller Task 投影；搜索/状态/分组/收藏/详情
│     │  └─ 详情：网站、版本、能力、自动授权、更新、停用、卸载、技术信息
│     ├─ 记录     运行事件、结果持久化、聊天交付、错误修复/UNKNOWN 对账
│     ├─ 设置     总开关、逐项授权入口、运行约束、来源/隐私说明、开发者跳转
│     └─ 流程*    跨脚本依赖/队列/恢复，仅通过 Gate 后作为正式入口
├─ 工作流         宿主已有的 AI 工作流编辑与会话
├─ 开发           宿主唯一代码编辑器、本地项目、草稿试跑、诊断
├─ 云控           宿主已有能力
└─ 条件工具：应用调试 / 调试（沿用现有门禁）
```

**为何“脚本”不是整个“扩展”清单？** Web Flow 对接的是已经安装且可受权调用的 **Controller 自动化任务**。Sidebar Tool 可能只有小面板，Page Program 会按照页面匹配自动增强网页，不应为了“都叫脚本”强塞进可自动调用的 Task 列表。可在 Web Flow 设置中提供“相关应用/网页增强”的只读入口，点击回原扩展中心。

**导航命名规则：** 用户可见“脚本”（副标题“自动化任务”）与“流程”（多步骤运行方案）；技术详情保留 Controller Task/Task Package。不要在 Web Flow 二级“开发”页再建编辑区。原型展示了五个应用标签用于一次评审全貌，正式 P0 应把“流程”保持只读/带明确门禁，或在未实现前隐藏。

## 4. 两条完整用户旅程

### 4.1 普通用户：找到 → 安装 → 授权 → 触发 → 查看 → 恢复

| 阶段 | 用户眼中的动作 | 设计反馈 | 后端真实 owner 与限制 |
|---|---|---|---|
| 进入 | “扩展 → Web Flow” | 概览展示“已安装脚本 / 需要关注 / 自动开关” | 通过原 Extension Center 打开应用；Web Flow 不宣称自身已经安装 |
| 找到 | 点击“添加脚本” | 搜索/发现/来源与用途；相同显示名保留开发者和站点区别 | 跳原“我的 → 本地任务目录”，不是 Web Flow 自建 Catalog 权威 |
| 审阅安装 | 阅读网站、功能、开发者、固定版本、数据/权限差异；确认 | 已安装/待核验/安装失败三种结果；成功需持久读回 | 原 Installer/Task Authority，实际扩展站点权限独立 |
| 开自动 | Web Flow 总开关 ON | 提醒“还需逐个脚本自动授权”，不能批量默许 | 总开关只阻止或允许新自动触发；单脚本 grant 另行持久授权 |
| 单条授权 | 进入某脚本“允许自动运行”，核对精确 Origin/行为/版本/参数/目标对话/有效期 | 可取消/授权/撤销；能力扩大提示必须重新审阅 | 必须在可信 UI 中批准；Chrome Permission prompt 有用户手势约束 |
| 触发 | 在指定 AI 对话发出已约定的固定格式任务 | “发现 → 校验 → 已提交 → 运行中”；未获授权则等待批准 | 原 Bridge strict parser + Authority/RunHost；不因自然语言挑选脚本 |
| 结果 | 查看“执行记录” | 分开展示运行、网页业务、持久结果、原聊天送达；支持定位真实历史 | 只显示真实 Run/Result/Delivery 的状态读回，不凭模型猜测 |
| 失败与恢复 | 打开问题条目 | 权限缺失→回原可信权限界面；DOM 变化→告知开发者；UNKNOWN→只读对账 | 不自动重发可能有副作用的点击/提交；撤销不得假称已经回滚 |

**第一版成功体验：** 新用户不必输入 taskId，也无需读 manifest；如果任务尚未安装，点“添加”能进入有权安装它的真正入口。普通用户希望“任务自动运行”与系统“已安装脚本”的差别明确，而非一个开关骗过所有状态。

### 4.2 开发者：创建 → 导入 → 调试 → 冻结 → 验证 → 发布 → 诊断

| 阶段 | 入口/行为 | 需要的反馈 | 不可越过的边界 |
|---|---|---|---|
| 开始 | Web Flow 设置的“开发者工具”跳宿主“开发” | 选择 Controller / Page / Sidebar 的真实运行世界 | 不从 Web Flow 新建源码编辑器 |
| 开发 | 使用原单文件 JS 或 Native 已授权本地项目，React/Vue 仅用于合适的运行世界 | 当前页面/环境、源码预览、编译与 Stop | 编写/保存/编译不自动安装或执行 |
| 校验 | 在“开发”明确触发草稿运行与诊断 | Schema、参数默认值、站点匹配、业务效果、来源 hash、错误码 | `runId`/日志不是业务成功或发布保证 |
| 冻结 | 生成 Task v1 固定版本候选 | `taskId/version/sourceHash/manifestHash/siteOrigins/paramsSchema` 同一版本 | 不用人类显示名作运行身份；不能同 ID 偷换源码 |
| 安装/发布 | 原“我的 → 本地任务目录”做验证、审阅、固定包安装 | 更新差异、来源与网站新增范围、失败保护 | 复用原可信安装器；`候选`≠`已安装` |
| 关联 Web Flow | Web Flow 展示从现有安装 Authority 读到的身份 | 显示“可手动运行 / 待自动授权 / 自动就绪” | 不凭开发者描述扩大自动授权 |
| 排错 | Web Flow“记录→技术详情” | taskId, candidateId, requestId, runId, resultId, sourceHash/errorCode/deliveryState | 原结果引用最小权限访问，敏感正文不默认外发 |
| 维护 | 升级/撤销/卸载 | 比较真实新旧包、绑定代次、授权影响及残留 | UNKNOWN 只能对账，同名脚本不能自动覆盖 |

## 5. 页面布局与交互规格

### 5.1 概览（P0）

```text
[宿主扩展导航…]                          ← 不属于 Web Flow 业务代码
[← 扩展列表]       Web Flow · 已安装应用
[概览] [脚本] [记录] [设置]             ← Web Flow 内部导航
┌ 自动执行                         [Switch]
│ 当前：总开关关闭 / 开启但 n 个任务待批准
│ 说明：“开关”不代表安装与网站授权完成
└
[已安装 n] [自动就绪 n] [需关注 n]
[＋ 添加脚本] [管理脚本] [执行记录]
[如何开始（前三步）]
[最近活动（执行/结果/交付分开）]
```

优先级：故障/撤权/结果 UNKNOWN 的阻断提示在统计之前；总开关只显示是否接收 **新的** 自动触发，已有 `RUNNING` 不能靠它一键撤销。空状态展示“还未安装脚本→添加第一条”；加载中用列表骨架与“正在核验”，**不能默认开/关/已授权**。无法读回权威数据时显示“安装状态待核验”，禁止夸大 ready。Shift+Tab/Tab 按 DOM 顺序遍历按钮；Switch 使用 Space 激活、焦点可见，状态由文本与 `aria-checked` 同步。

### 5.2 我的脚本（P0；2/20/100 规模策略）

**卡片第一行：** 图标 + 名称 + 收藏；**第二行：** 开发者 · 版本 · 网站；**第三行：** 互斥主要状态（就绪、待授权、已停用、权限不足、运行中、运行失败、结果未知），可并列“可审阅更新”提示；操作“查看详情 / 手动运行 / 更多”。在 320px 默认把详细权限/Task ID 放二级，不让每张卡片出现十列字段。

| 规模 | 组织策略 | 默认可见信息 | 交互/性能 |
|---|---|---|---|
| 2 | 单列卡片直接浏览 | 图标、名称、作者、网站、状态、主要操作 | 不强制搜索，不显示空的高级筛选 |
| 20 | 搜索框、收藏/全部/需关注/更新筛选、网站/状态分组、排序 | 卡片摘要 + 详情 | 保留当前搜索词/滚动位置，筛选后结果数准确 |
| 100 | 相同搜索与分组，但默认 20 条分页或受审虚拟化 | 仍是摘要，不牺牲错误/权限提示 | 跨页收藏/启停状态一致；列表键使用稳定安装身份而非索引；分页/分组读屏有上下文 |

**每个脚本卡片的信息分层（不能把十个字段全部挤在第一屏）：**

| 属性 | 320–360px 列表 | 详情（普通用户） | 高级技术展开 |
|---|---|---|---|
| 图标、名称 | 直接显示（名称至多两行） | 完整名称、来源 | 显示名与真实身份分开 |
| 开发者、版本 | 紧凑次行 | 完整发布者、固定版本与更新说明 | revision/manifestHash/sourceHash |
| 作用网站 | 主机名，如 `baidu.com` | 完整允许的 `https://` Origin，不省略子域 | siteOrigins/安装许可绑定 |
| 触发名称 | 列表一般不显示 | 供用户辨认的可检索别名，明确不是权限键 | alias 解析规则（若真实实现存在） |
| taskId | 不展示 | 可复制“技术任务编号”可选 | 完整 `taskId`，加版本/安装身份 |
| 运行状态 | 单个主要文字状态 | 状态原因、时间、下一步 | runId、errorCode、owner/目标身份 |
| 授权范围 | “待授权/权限不足”状态 | 每脚本自动授权、Chrome 站点权限、允许行为分别说明 | grant generation、origin、范围 pin |
| 更新提醒 | 额外“有更新”提示 | 进入版本差异、来源验证与权限变更审阅 | 版本/包 SHA 对比、回读 |

搜索建立在标题、开发者、明确的网站、稳定 `taskId` 上；展示名与触发名只是别名，**不是授权键**。按任务 ID 精确匹配时可有高级入口；普通搜索输入支持 IME，在拼写阶段不丢焦点。分组标签可保存到 Web Flow 用户偏好，不改变原安装记录；重复显示名须展示不同开发者/网站以及折叠身份。没有结果给“清除搜索与筛选”，真正零安装给“添加第一条”。停用若已运行，仍必须提示“新任务停止接收，已产生的副作用不能回滚”。

### 5.3 脚本详情（P0/P1）

第一屏：`[返回] + 名称 + 状态 + 作用网站/能力 + 手动运行/停用`。第二屏：自动授权状态与唯一授权操作，独立查看 Chrome 网站权限。第三屏：固定版本与更新、卸载、保留/删除数据差异。最后折叠“开发者技术详情”：`taskId、task version、revision、sourceHash、manifestHash、installationId、generation、来源凭据、触发协议兼容状态`。不存在信息时显示“未核实”，不要填假 hash。返回先回原列表保留筛选/滚动并恢复焦点；Escape 可退出详情（不能越过未保存确认）。同名任务在详情必须能区分来源和安装身份。

### 5.4 添加 / 安装审阅（P0 接原安装器）

**不创建 Web Flow 专属 Installer。** 原型中的模拟弹窗只是展示审阅流程：名称、来源、开发者、固定版本、**精确 Origin 列表**、能力、参数范围、默认数据去向、版本 hash/来源是否核实、更新时增减权限。真实点击“添加”应进入原“我的 → 本地任务目录”并携带允许的查找条件，不能通过一个非可信 app iframe 申请 Chrome 权限。

审阅按钮在数据/身份未知时禁用或要求可信复核；权限新增/变更/同版换包/降级应说明来源风险和数据保留影响。用户取消不注册 Page/Task，也不更改自动授权。安装结果需从权威安装状态读回；**安装成功后正常手动使用不额外走通用二次启用**，独立的自动触发仍必须明确批准。

### 5.5 自动运行总开关 / 每条授权（P0；特别重要）

总开关语义：`WebFlowAutoAcceptance = on/off`，只控制 **新** 合法自动触发进入准入流程。单条授权语义：`TaskAutoGrant` 必须绑定精确 `taskId + 安装版本 + 源码身份 + 网站 + 允许操作/参数约束 + 对话/投递范围 + 用户授权代次 + 有效期/次数（如实现）`。这两个名称是 **概念模型，不是已存在公开 API**，接线必须按原 Authority 提供的字段验证。

| 可见状态 | 数据组合 | 用户下一步 |
|---|---|---|
| 自动执行已开启 / 关闭 | 全局开关状态，独立于单任务 | 切换开关；关闭新触发不终止已运行任务 |
| 已安装但待自动授权 | 安装有效、人工 Run 可用、缺精确预批准 | 查看网站与能力、明确授权 |
| 已停用 | 原安装 `enabled=false` | 去原 Task 管理界面恢复；不更改自动授权和来源记录 |
| 权限不足 | Chrome Origin 缺失/撤权/脚本需要的能力缺失 | 前往可信权限入口，在真实用户手势内重审 |
| 当前运行中 | 相同 `runId` 有真实 active status | 查看本次运行；只有原 owner 能停止/中止 |
| 运行错误 | 原 Run/业务错误码已读回 | 查看问题与安全可行的修复，不默认重复副作用 |
| 结果未知（UNKNOWN） | run 或交付可能已生效，回执不可靠 | **只读对账原 request/run/delivery**，禁止一键重试 |
| 自动就绪 | 所有开关、固定安装 pin、权限、精确 grant、来源绑定均成立 | 等待合法候选；不是“已在网页执行成功” |

**状态优先级（展示层）：** UNKNOWN ＞ 当前运行 ＞ 已停用 ＞ 权限不足/身份冲突 ＞ 已知错误 ＞ 未授权 ＞ 总开关关闭 ＞ 准备就绪。内部必须保留正交状态字段，不能只把这些合成单个字符串写回数据库。

权限对话框默认只展示本任务的精确站点、操作类型、版本、参数与数据去向；敏感能力如账号/购物/发送/读取受限信息应有独立授权风险提示与撤销。撤销后阻断新增匹配，已提交的执行仍由原 Runtime 处理，不谎称回滚已发生的网页副作用。Chrome optional 权限请求必须在合法用户手势内，且 Chrome 的“允许用户脚本”不能由普通 Web Flow UI 静默开启。

### 5.6 流程（P1/P2：概念展示，不强行落地）

应用将来可以保存“任务链”：名称、目标、依赖步骤、每步独立原站授权、超时/停止条件、输入/结果引用、待人工确认节点、恢复状态。与宿主“工作流”Tab 的职责区分：宿主负责 **AI 规划/会话与代码草稿**；Web Flow 负责 **已固定任务组合的运行状态、交接与恢复**。如果尚无真实调度能力，UI 使用“尚未接入”，不显示可点击“开始执行”。上线必须优先通过已经存在的单 owner 离线队列与公开 SDK 探测，不新建第二 Runner/DB/Authority；需核验中断 UNKNOWN 不重试、持久读回和权限代次。

### 5.7 执行记录 / 诊断（P0/P1）

普通列表：任务名与站点、何时触发、方式（手动/自动）、`运行中/运行完成/运行失败/结果未知`、最后一次结果及交付到哪里、下一步。展开首先显示四段有证据的状态：**运行是否结束**、**网页操作是否被验证成功**、**结果是否持久化**、**是否送达原 AI 对话**；未来 AI 续答为独立第五段。普通失败建议是可操作行为，如“网站结构已变化，请联系脚本开发者”，“授权已撤销，请在可信入口恢复”，“回传未知，请核对原对话”。

技术信息进入再下一层详情：`taskId/version/manifestHash/sourceHash/安装身份/candidateId/requestId/runId/resultId/文档或 origin 身份/错误码/持久结果与交付回执/retirement`。如果某个阶段尚未发生，使用 `NOT_STARTED`；没有证据使用 `UNKNOWN`，不得自动填“成功”。对外部网页正文与工具输出进行明确的不可信数据展示和内容脱敏，结果文本不能用来当指令再触发任务。提供受控复制/下载需要遵守现有数据访问许可，不能直接将整个隐私回执上报遥测。

### 5.8 设置与开发者衔接（P0/P1）

设置入口包括总开关、各脚本授权的管理链接、默认要求人工确认的高风险动作、暂停/撤销与隐私说明、问题诊断、跳宿主“开发”与“我的”目录。最小版不引入用户无法理解的“执行器配置/Native token/SHA 配对”主表单。开发者可展开“检查候选结构”和“诊断摘要”：格式差异、Schema 错误、相同 `taskId` 冲突、同版换源码、版本迁移、无站点范围、权限变化、实际来源 hash 与包 hash 不一致；只有原 Catalog/Authority 能最终判断可安装与可执行。Web Flow 只展示检查结果及前往权威入口链接。

## 6. 脚本身份、显示名称与版本治理（面向 V0.2 接入）

**主键绝不使用显示名。** 列表显示名称可以更改、重复、翻译；运行时严格使用原 Task 的稳定 `taskId`，并绑定已安装版本、sourceHash/manifestHash、installationId/generation 等真实权威字段。不同脚本重名只影响 UI 消歧，不影响准入；同 ID 不同来源不能按字母排序挑一个“优先”。

**人类触发别名**可作为以后帮助用户生成规范任务的 UI 文案，如“搜索百度前三条”，但现阶段模型只能输出仓库五字段完整的固定 `taskId` 候选。未来要支持别名触发，先在**可信 UI + 原 Authority** 建立显式、可撤销、具作用域的别名映射：`normalizedAlias + owner + taskId + versionPin + originScope`；同名/Unicode casefold/大小写/空格/语言本地化冲突在**安装审阅前**拒绝歧义，不能自然语言猜你想调用哪个任务。即使别名命中，最后仍要按稳定身份和原授权执行，不应把别名变成新的权限键。

协议从 `opendesk.task.intent.v1` 迁往 `webflow.task.intent.v1` 时，需要在 P0 owner 的 parser/去重/持久 ledger 中设计统一 canonical candidate key，兼容窗口、拒绝双协议同时有效候选、审查旧批准是否仍适用，以及旧原聊天结果的只读回溯。由 V0.1/V0.2 owner 做兼容性决策；**V0.3 UI 不自行处理并行迁移**。

## 7. 窄侧栏、故障、无障碍与键盘验收

| 维度 | 方案与检查点 | 此离线原型状态 |
|---|---|---|
| 320px / 360px | 保留 1 列主内容；脚本卡片可换行；导航水平滚动；操作不依赖鼠标 hover；长 ID 在折叠详情换行 | 已提供 320/360/440/580 模拟预览，单页 DOM 交互通过；**未在用户 Chrome Side Panel 原生加载** |
| 480px+ / 扩展台 | 宿主原导航与应用内部导航保持层级；宽度不是权限边界 | 580px 预览可切换；独立 HTML 壳不等于真实挂载 |
| 深浅模式 | 使用 OpenDesk 语义 token，前景/焦点/错误不只依赖颜色 | 已提供切换；**尚无自动化 WCAG 对比度审计** |
| 空状态 | 0 脚本有安装 CTA；搜索无匹配有清空筛选 CTA；未加载不可显示已就绪 | 已有模拟状态入口 |
| 故障 / 权限 | 无 Chrome 网站权限、版本漂移、DOM 错误、结果未知均解释“下一步” | 权限不足/运行错误/UNKNOWN 模拟场景可切换 |
| 键盘 Tab / Shift+Tab | 基本焦点顺序为宿主→应用标签→页面内容→弹窗；主动作可用原生键盘 | 已使用可聚焦 button/input/select 和 `:focus-visible` |
| Tab 组件 | Left/Right/Home/End 切页；Enter/Space 激活 | 原型提供键盘路由；正式应直接复用宿主的 Tab/React 行为 |
| 搜索 | `/` 或 Ctrl/⌘+K 定位脚本搜索；IME 期间不破坏编辑 | 原型实现导航与焦点；未做真实日文/中文 IME 原生专项 |
| 模态审阅 | 使用 `role=dialog`/`aria-modal`，初始焦点、焦点环、Escape 关闭、确认禁用、关闭后恢复焦点 | 原型实现基础模式；进一步需覆盖卸载和焦点消失时的 fallback |
| Switch | 开关有文本名称、`role=switch`/`aria-checked`、键盘切换 | 原型支持；正式优先使用已有 React Aria `Switch`，不复制此 DOM 实现 |
| 非视觉提示 | 状态同时包含文字与标签；历史按有名结构展开 | 已提供基础语义；屏幕阅读器/200% 缩放/高对比度需正式测试 |
| 减少动效 | 仅过渡动画、尊重 reduced-motion | 原型 CSS 有 reduced-motion 分支；正式检查宿主已有样式 |
| 安全 CSP | 正式 Chrome MV3 不得加载任意远端/内联执行代码 | 原型独立内联 JS/CSS 只用于隔离 HTML；**不可直接作为已安装 Sidebar 包** |

**不可省略的专项验收：** 320/360/440/580px，200%/400% 缩放；中文/日文输入法合成；Space/Enter 切换开关；键盘打开/取消多级审阅；Screen Reader 报读名称、权限和错误；长标题/网站/ID；浏览器断连；安装身份漂移；关闭 Sidebar 后重新进入；同步/异步渲染期间焦点归位；真实 Chrome 上的权限用户手势。原型 smoke PASS 不代替以上原生检查。

## 8. 组件复用与消费者清单（先核实才接入）

| UI 或能力 | 现存 owner | Web Flow 最小对接方式 | 禁止事项 |
|---|---|---|---|
| 宿主导航及 React 根 | `src/ui/react/{app-shell,main}.tsx`、`tabs/navigation.tsx` | 仅通过原 `ExtensionCenter → ToolHost` 生命周期打开合法已安装 Web Flow | 不造第二 `createRoot`、不覆盖 `src/ui/sidepanel.html` |
| 设计 token / 控件 | `src/ui/design-tokens.css`、`design-system.css`、`src/ui/react/components/ui/{button,card,input,switch}.tsx` | 执行世界核实后引用共享 token/公开 Sandbox 组件出口；受信 React 只在原 owner 渲染 | 不跨沙箱 import 宿主私有 TSX、不复制样式主题全表 |
| 工具安装与来源 | `src/ui/{extension-center,extension-center-model}.js` + Tool Host | Web Flow 应用本身遵循 Sidebar Tool 原安装规则 | 不造 Web Flow 私有 Installer，不假定原项目已经有正式包 |
| Controller 目录 / 运行 | `src/ui/react/tabs/{my-page,task-catalog}.tsx` 与原 TaskWorkbench | “添加任务”“手动运行”“固定版本管理”先深链接/切换到原入口，必要业务投影只读 | 不从沙箱直接读取 Host 私有 registry/特权 API |
| Page Program 安装 | `src/scripting/user-scripts/installed-programs.js` 等 | 只有确需页面增强时分开展示并跳原“扩展→网页增强” | 不把 Page Program 当 Controller Task 自动调用 |
| 原开发器 | `src/ui/react/tabs/develop*.tsx` | 创建/导入/调试/保存直接复用；只补 Web Flow 所需 schema/诊断反馈（经 owner 审核） | 不再写脚本编辑器 |
| Workflow / AI 会话 | `src/ui/react/tabs/workflow.tsx`、`src/ui/workflow/` | 只关联已有保存定义/结果，先从公开合同核对消费者 | 不复制宿主 AI 引擎或聊天发送队列 |
| Bridge 触发和交付 | `src/native-agent/chatgpt-*` | 按当前 P0 Owner 输出的已审接口接线；状态分阶段读回 | 不采信网页文本为授权、不双重发送 |
| Web Flow 交接/队列 | `projects/webflow/src/handoff-contract.js`、`src/queue/` | 优先单 owner 离线模块，证明公开存储/执行能力后最小对接 | 不宣称多 Host CAS/真实调度已实现 |

**重要实现区别：** 受信 `src/ui/react/components/ui/` 组件存在，不代表动态用户 Sandbox Tool 可以直接 import 并拥有 Host 权限。应先检查 `docs/api/sidebar-tool-development.zh-CN.md`、公开 Shared UI 出口以及实际 ToolHost 沙箱消费方式。如需求确实跨越现有 SDK，记录最小可复现 `SDK_GAP_NOT_PROVEN`，由 Runtime owner 补真正通用出口，而非绕过隔离。

## 9. 增量实施计划与 Gate / 并行协调

| 阶段 | 实际代码 owner / 推荐改动 | 核心交付 | 必须满足的 Gate | 不在本阶段做 |
|---|---|---|---|---|
| G0 · 本轮 | 仅隔离方案文档及 `projects/webflow/preview/` 独立 HTML | 信息架构、模拟交互、源码事实记录、问题优先级 | HTML 可本地打开、内存数据可操作、无真实权限/页面调用 | 任何 main、SW、运行器、真实安装写入 |
| G1 · 对接准备 | 本地 Codex **只读**核对 `git status`、当前 HEAD、V0.1/V0.2 已改文件、`projects/webflow/` 唯一 owner 与构建消费者 | 明确冲突清单、身份协议现状、可用公开 SDK、草稿差异与安装路径 | 不覆盖现有 UI、他人改动；无法证明公开接口时 `SDK_GAP_NOT_PROVEN` | 大重构或另建分支 |
| G2 · 最小正式外壳 | Web Flow 项目 UI owner：只有实际需要时在 `projects/webflow/src/ui/` 创建，复用现有 Tool 包格式/样式与 Host | 概览、脚本只读列表、详情、空/错误状态，进入原 Task Catalog | 读取真实安装记录、对不上身份时只显示 unknown；保留 Sandbox 边界 | 全新 SidePanel 主导航/第二编辑器 |
| G3 · 自动授权集成 | P0 Bridge/Authority 原 owner + Web Flow 业务 UI 投影，边界明确拆分 | 总开关 + 精确任务授权范围审阅/撤销/状态；不双派发 | 独立验证手动与自动两条路径；Chrome 权限不足、版本漂移、UNKNOWN 安全拒绝 | 批量默认永久授权、多站无限循环 |
| G4 · 真实运行与历史 | 原 Task / Durable Result / Bridge owner + Web Flow 投影 | 一条真实已安装任务从 ChatGPT 完整候选到网页动作、持久结果、原聊天交付、续答；分阶段历史 | 同一 `runId`/`resultId` 全链证据；真实网页效果；错误/撤权/重复候选负例 | 把 Node tests 当 Chrome/网页成功 |
| G5 · 规模与发布前 | UI owner + 原安装器 Owner + QA | 100 脚本管理、分组/收藏、更新/卸载差异审阅、键盘/屏幕阅读器、暗色/窄宽 | 类型/来源冲突处理、回归旧工具、停止/撤权、安全与性能、真实 Chrome 安装 | 迁移全部历史工具或推送未经授权版本 |
| G6 · 后续 P1–P3 | Web Flow 队列/交接 owner + 独立平台必要 API Owner | 可恢复多步运行、跨会话结果与期限、队列对账 | 持久化事务、单 owner fencing、跨重启、UNKNOWN 不重放、目标对话/仓库实证 | 为了 UI 显示先制造后台能力 |

### G1 必须先做的只读检查

```bash
cd /Users/shopme/Documents/workspace/opendesk-browser
git status --short
git branch --show-current
git rev-parse HEAD
# 对照项目与 UI 的真实状态；不执行 git reset/clean/switch/checkout
find projects/webflow -maxdepth 3 -type f | sort
# 核对现有脚本与消费者后再决定是否新增文件
```

本轮从远端看到的历史协议仍为 `opendesk.task.intent.v1`，用户另有并行 V0.1 更名诉求。G1 应 **先读真实变更/消费者**，不能单纯按这份设计稿全局搜索替换字符串。若 V0.1/V0.2 已实现可运行的自动授权管理，复用其实际记录和语义，不在 V0.3 构造第二个 `grants` store。

### V0.3 最小正式 UI 文件影响建议（**不是立即改动授权**）

**优先候选：** `projects/webflow/src/ui/` 为应用自身业务视图，`projects/webflow/tests/` 写业务/状态/无障碍定向测试；`projects/webflow/preview/` 沿用原型及后续测试适配器，`projects/webflow/README.md` 在功能实际接入后登记真实构建/导入命令和门禁。**必要时才编辑：** `src/ui/react/tabs/tools.tsx`/原 Extension Center，仅用于不可避免的通用展示或导航消费者修复，必须由宿主 UI owner 审核；`src/native-agent/chatgpt-*` 原 Bridge owner 按 P0 变更。**通常不改：** `src/ui/sidepanel.html`、`main.tsx`、`app-shell.tsx`、`manifest.json`、原安装库、RunHost/Authority、Send Queue 项目。

**不要把原型 HTML 直接注入正式 MV3 扩展：** 它是内联独立文件，为了简单评审模拟宿主壳，不符合正式构建/CSP/沙箱包/安装来源合同。真正产品 UI 应从唯一项目业务源码通过现有 build/preview 工具产出合规资源；实时数据由公开受权接口提供，绝不把 mock 状态机带进生产执行链。

## 10. 原型操作验收与交付说明

原型交付位置：`projects/webflow/preview/webflow-v0.3-preview.html`。浏览器直接打开 HTML 查看即可；本轮在隔离 Chromium 使用 `page.set_content` 加载等效 HTML 内容并执行行为烟测（本环境直接导航 `file://` 被策略限制，不将此限制归咎于 HTML）。

可交互项：顶部切换 2/20/100 脚本、混合/空/网站权限不足/运行中/运行错误/结果未知、320/360/440/580、深浅主题；主界面总开关、脚本搜索/状态筛选/按网站或状态分组/收藏/排序/分页、详情、停用/恢复、授权/撤销、模拟安装固定候选、模拟手动运行和执行历史、技术详情、开发者 JSON 字段检查。流程页作为不可真实运行的状态提案，未提供执行能力。弹窗可按 Escape 退出；`/` 或 Ctrl/⌘+K 定位脚本搜索；顶层 Tab 支持 Left/Right/Home/End。

**当前隔离烟测记录：** Chromium 的 36/36 项交互检查通过，包括总开关、20/100 条列表、详情、授撤授权审阅、安装确认前禁用、模拟安装、搜索/空搜索、历史区分、流程非运行、模拟 Schema 冲突、2/100 列表、空/权限/UNKNOWN 状态、320px/深色切换；运行时 JavaScript console/pageerror 未见异常。另做过 Node JS 语法检查。**覆盖边界：** 不是正式 UI、并行代码或用户 Mac 上原生 Chrome Side Panel 回归；未进行真权限、网页运行、原聊天投递、IME/读屏、真实对比度、跨日队列、安全审计。新增“分组”交互之后已重新完成同一 36 项烟测，但按网站/状态分组的具体分组切换还需要额外定向检查。

**最小可量化的产品验收：** ①普通用户从 Web Flow 概览能找到真实安装入口；②不输入 taskId 即可完成合法固定版本安装；③总开关/每任务授权/Chrome 站点权限各自生效且错误状态明确；④可追踪本次任务的网页动作、持久结果、原对话回传，互不冒充；⑤UNKNOWN 无自动重试；⑥100 条脚本下搜索/过滤/键盘可用；⑦旧开发器/其他扩展不退化；⑧合规正式包在用户真实 Chrome Native 实测后才能宣称发布可用。

---

## 11. 原始仓库证据入口（便于工程交接定位）

以下均为所审 GitHub 远端项目的相对路径，仓库当前 `main` 在后续工作中可能变化。完成接入时应以当次 `git status`/当前实际源码与运行收据复查：

- `AGENTS.md`、`projects/webflow/AGENTS.md`、`projects/webflow/README.md`
- `projects/webflow/docs/{product-contract,execution-plan,offline-modules}.zh-CN.md`
- `docs/architecture/{extension-project-layout,react-ui-shared-components-r33,sidebar-product-contract}.zh-CN.md`
- `docs/api/{extension-development-selection,sidebar-tool-development,native-installed-tasks}.zh-CN.md`
- `src/ui/sidepanel.html`、`src/ui/react/{main,app-shell}.tsx`、`src/ui/react/tabs/{navigation,tools,my-page,task-catalog,develop,develop-editor,develop-local,workflow}.tsx`
- `src/ui/extension-center.js`、`src/ui/extension-center-model.js`、`src/ui/design-system.css`、`src/ui/design-tokens.css`
- `src/ui/react/components/ui/{button,card,input,switch}.tsx`
- `examples/tasks/{baidu.search.top3.v1,google.search.top3.v1}.opendesk-task.json`
- `src/ui/user-scripts-access.js`、`src/scripting/user-scripts/installed-programs.js`

**总体评价：** 产品信息架构可在已有框架上成立，P0/P1 划分合理；真正阻断项不是美工，而是“Web Flow 尚未正式接线”与“并行 Bridge 的身份/自动授权/结果状态必须只认唯一权威”。此方案优先解决用户看得懂、做得成、出了错找得回，同时为未来 20/100 脚本管理与多步骤恢复保留明确但不越权的扩展点。

---

## V0.3.1 增量复审与原型重构（2026-11-02）

> 读取基线：`main` HEAD `31036a1189da2273d1ef38d26917e274a4866668`；Web Flow README、AGENTS、产品合同、执行计划、V0.3 原型；宿主 `src/ui/react/{app-shell,tabs/navigation,tabs/workflow,tabs/develop,tabs/task-catalog,tabs/tools}.tsx`、`src/ui/design-tokens.css`、`src/ui/react/components/ui/{button,card,input,switch,sidebar-shared.css}`。本次只更新现有唯一 HTML 预览及本评审文件，**没有访问用户 Mac 本地未提交内容**。
> 状态：`DESIGN_UPDATED`、`PREVIEW_STATIC_CHECKED`；真实 Chromium 交互、Chrome Side Panel 原生安装、授权、真实执行及聊天交付均不能凭修改代码宣称通过。原 V0.3 36/36 测试不可自动继承。

### A. 六专业视角的 P0/P1/P2 问题审查

| 级别 | 旧版具体风险 | V0.3.1 决策 | 主要评审视角 |
|---|---|---|---|
| P0 | 概览三枚同权重按钮、永久“如何开始”及大面积统计卡占主视区 | 改为自动触发状态、待处理与唯一动态主操作；帮助右上角按需打开；空安装时才展示新手引导 | 产品 / UX / UI |
| P0 | 五项导航中“流程”实际只有概念模型，且与宿主“工作流”名称冲突 | 仅保留概览/脚本/记录三个一级区；设置、帮助为图标入口；未来流程说明在帮助和高级设置中，不展示运行按钮 | 产品 / 开发者工具 |
| P0 | 每条脚本“详情/运行/停用”同权重；权限缺失却能点运行 | 列表保留运行与更多菜单；入口检查 `enabled/siteAccess/UNKNOWN/running`；详情再处理权限、更新、卸载 | 交互 / 扩展 |
| P0 | 模拟运行立即插入 completed 易误解为网页成功；交付、持久化混淆 | 新建纯模拟 `running`，点击结束才变 `completed`；记录五阶段分别说明证据；UNKNOWN 永无盲重试 | 交互 / 安全 |
| P1 | 搜索、5 个 chips、分组与排序永久堆叠 | 搜索整行主入口，筛选+排序+可选分组收进单入口；有条件时可清除；2/20/100 分页 | UI / UX |
| P1 | 搜索每输入即重建 DOM 会打断中文/日文 IME | `compositionstart/end` 阶段跳过渲染，完成后恢复输入焦点及光标位置 | 交互 / React |
| P1 | 技术任务 ID、版本等过度挤占主列表 | 名称/用途/网站/状态/运行在摘要；版本、授权、更新入详情；技术 ID 进展开区 | UI / 开发工具 |
| P1 | 设置大卡片/大按钮造成比例失衡 | 单列设置行，Switch 与轻量“查看”入口同一基线，开发者/未来能力折叠 | UI / UX |
| P2 | 品牌区域和宿主双层标题占大量侧栏高度，过多卡片阴影 | 压缩应用标题栏，平面列表边框分隔，统一控制高与字重、深浅主题 | UI / 扩展 |

### B. 两套信息架构

**方案 A（正式原型选择）**：宿主“扩展 → Web Flow”内只有 `概览 / 脚本 / 记录`；应用标题旁放帮助、设置；脚本详情为二级视图，技术数据再展开。优点：少导航、在 320px 仍能扫读、避免复制宿主入口；缺点：设置不在固定 Tab，但提供稳定齿轮与可见标题。

**方案 B（拒绝）**：`概览 / 脚本 / 流程 / 记录 / 设置`。优点：未来业务扩展直接；缺点：流程尚无真实服务，易误导用户，且重复宿主 AI 工作流；设置与一级操作占用侧栏空间。未来仅在证明步骤依赖、逐站授权、持久结果、准确回传、停止/恢复及 UNKNOWN 对账真实可用后再考虑增加“任务链”入口。

### C. 流程的产品价值与能力 Gate

**脚本** = 单个已安装固定版本任务；**流程** = 多个已安装任务组成的步骤依赖、输入/结果引用、逐站准入与恢复策略；宿主现有“工作流”主要承担 AI 规划、聊天/草稿与保存工作流。示例为「百度搜索 Task → 验证并保存网页搜索结果 → 将可核对结果交回原 ChatGPT 对话由 AI 分析」。一旦某步运行或交付 UNKNOWN，禁止自动重复副作用。当前 `projects/webflow/src/queue/` 是离线状态模块，BR-07/P2、BR-08/P3 的真实跨站执行与持久恢复尚未获证；因此流程不应成为可运行独立页。

### D. 组件密度与原有系统复用

原型沿用 OpenDesk 语义色 `--od-ink/sub/line/brand/paper/bg/focus` 和 4/8/12/16 间距单位；不发明第二套全局 Token。建议 12–13px 普通文本、11–12px 次要说明、12px 按钮、32px 常规按钮、34–35px 输入与筛选、30–34px 图标控件，轻边框、克制阴影。正式以 `src/ui/react/components/ui/{button,input,card,switch}.tsx`、`sidebar-shared.css` 的实际变体及 React Aria 交互为准。

宿主导航/React 根属于 `src/ui/react/{app-shell,tabs/navigation}.tsx`；扩展安装/ToolHost 属 `src/ui/react/tabs/tools.tsx` 与既有 Extension Center；任务安装/运行由 `tabs/task-catalog.tsx`、`my-page.tsx`、TaskWorkbench 和原 Authority 负责；代码编辑、AI 规划分别复用 `tabs/develop.tsx` 与 `tabs/workflow.tsx`。HTML 仅模拟这些入口，既不能跨沙箱 import 私有 React 组件，也不能作为真实 MV3 页面直接投产。

### E. 按页面的验证矩阵与交付边界

- 概览：正常/0 脚本/自动开关/待处理；无持续帮助卡；单一 CTA 优先处理异常。
- 脚本：搜索名称、网站、作者、触发别名/ID；状态筛选、清空、排序/分组、2/20/100 条和每页 20 条；摘要/详情/菜单/权限/更新/停用/撤销、运行门禁。
- 记录：运行中/结束/失败/UNKNOWN/交付待核对、执行证据五层拆开；技术字段折叠；纯模拟运行的完成不等于真实网页成功。
- 设置与帮助：平面行式布局、轻量开关、折叠高级内容；未来多步骤示例显著标注未接入。
- 静态：检查新脚本 JavaScript 可解析、导航只有三个 Tab、包含帮助与流程概念入口、IME 保护和 UNKNOWN 无盲重试按钮。
- **待实际测试**：320/360/440/580px 和宽屏渲染、深浅色、300% 缩放、真正中文/日文输入法、菜单 Esc、屏幕阅读器、原 Chrome Side Panel 生命周期与权限用户手势；不得把静态通过写成 Chromium PASS。

### F. 六专家评分规则

六视角分别按 100 分审，最后做算术平均而非累加。≥95 是正式体验目标而非这轮自动获取的成绩；没有完成渲染、输入法、原生安全接线及可用性观察时相应项目标注 `NOT_TESTED / NOT_SCORED`，不能为达标虚报分数。


### G. V0.3.1 提交后定向检查记录（与 V0.3 旧验收证据分开）

- 对已提交的 V0.3.1 HTML 执行 V8 JavaScript 语法解析，并在**隔离 JS 环境 + 模拟 DOM** 中调用页面生成与核心函数：31/31 项通过。覆盖 20 条初始、首页唯一主操作/无常驻教程、2 条规模、网站与开发者搜索、已停用筛选、100 条列表分页与更多菜单、网站权限缺失/UNKNOWN/运行中禁止新运行、总开关不扩张单条授权、记录五阶段、UNKNOWN 无 Retry、未来流程只读、扁平设置、清空搜索。
- 提交后又修正两个侧栏一致性问题：状态筛选重绘后恢复菜单展开与键盘焦点；弹窗与提示只覆盖模拟 Side Panel 窗口，不再遮盖整个评审桌面。模拟运行中/错误/UNKNOWN 场景向对应任务的记录追加相同身份和状态，避免页面间叙事不一致。独立静态核对了各类 DOM 唯一 ID、脚本语法及重要源代码分支。 扩充验证还覆盖四种窗口宽度样式声明、浅深主题/减少动效声明、帮助与未来概念弹窗、模拟运行确认及运行中禁止重复启动、模拟完成不误报业务成功。
- **此处 18/18 是纯逻辑烟测，不是实际 Chromium 页面交互、渲染或视觉 PASS。** 320/360/440/580px 及宽视图的真实截图、亮暗主题的自动对比度、真实中文/日文 IME、200%/400% 缩放、菜单裁切与焦点、读屏、Chrome Side Panel 权限/生命周期、真实浏览器任务及原聊天交付均标记 NOT_TESTED。当前隔离容器没有直接下载远端 GitHub HTML 进行 Chromium 原生加载的网络通路，因此没有伪造截图或原生测试报告。
- 与并行开发的差量：当前 main 有其他 Agent 新增 projects/webflow/src/ui/index.html、projects/webflow/src/ui/model.js、projects/webflow/tool.config.json 等正式应用准备文件；本轮只更新原有 V0.3 HTML 与本评审文档，没有修改这些新增消费者。正式接线须重新核对实际 HEAD 与权威安装/业务状态。新建项目配置不等于已完成授权、真实执行或生产发布。

## 9. V0.3.2 差量设计与实现审查（2026-11-02）

> 本节覆盖 V0.3.1 → V0.3.2 的筛选图标与“添加脚本”闭环，不修订上述 V0.3 历史决策。以本次实读 `main` 的正式配置与源码为准；本节的模拟证据绝不等于 Chrome 扩展或任务安装证据。

### 9.1 真实能力与边界（SOURCE_INSPECTED）

- `projects/webflow/src/ui/main.js` 与正式 `webflow.opendesk-tool.json` 已存在，Web Flow 是真实 Sidebar Tool，而非仅有 HTML 原型。原包配置版本为 `0.3.0`，界面源码/原型曾标记 V0.3.1。
- `tool.config.json` 声明 `tasks.run` 且 `delegatedTasks` 只锁定 `baidu.search.top3@1.1.1`、`google.search.top3@1.0.0` 的精确 `taskId/version/manifestHash/contentHash`。安装身份和自动授权均不能从 UI 自行扩权。
- 公共合同 `docs/api/sidebar-tools.zh-CN.md`：`tasks.read({taskId})` 只读已审阅固定 Task 的安装元数据，`tasks.open({taskId})` 只聚焦已安装任务管理 UI，`tasks.start({clientRequestId,task,params})` 必须使用读回的完整 pin，`tasks.stop` 作用于同一请求；没有经过本轮证实的普通 Sidebar `tasks.list` 全局安装枚举或动态修改委托 pin 能力。
- 所以正式 Web Flow **不能把任意候选 Task 真正“添加为可委托运行”**。本次只修改 `preview/webflow-v0.3-preview.html`，不修改正在被其他 Agent 集成的 `src/ui/`、Installer、Authority、Bridge、Manifest 或正式安装包。

### 9.2 用户理解：关联、安装、创建不是同一动作

| 操作 | 面向用户的含义 | 正式边界 | 离线原型 |
| --- | --- | --- | --- |
| 关联已安装任务 | 已在 OpenDesk 安装的任务被纳入 Web Flow 的管理与委托 | 仅当当前 App 包已固定声明对应 pin 且可信读回合法身份；当前不支持动态通用关联 | 完整模拟选择、审阅与关联回执，显式写明“未来能力” |
| 从任务目录安装 | 宿主原任务目录提供候选，原安装器审阅来源、版本、网站与能力 | 安装与 Web Flow 委托分离，不能在 Sandbox 中自行安装 | 模拟安装中/成功/失败/UNKNOWN 及独立读回 |
| 创建脚本 | 前往宿主原“开发”工具编辑、调试并由原任务目录安装 | 不复制第二套编辑器，也不承诺可从 Sandbox 直接打开宿主页面 | 展示前往宿主的步骤，不伪称已经实际跳转 |

### 9.3 两方案对比与选择

| 评估点 | 方案 A：侧栏内完整选择页面（采用） | 方案 B：抽屉/多步弹窗（不采用） |
| --- | --- | --- |
| 320/360px | 单一纵向阅读流，搜索、状态和审阅可独立滚动 | 多层浮层压缩正文，键盘焦点与小宽度易拥挤 |
| 440/580px | 同一信息架构自然扩展，无须维护另一套流 | 仅少量任务时较快，复杂审阅仍需跨步骤 |
| 学习成本 | 一级入口直接标明“已安装 / 任务目录 / 创建脚本” | 易把“安装”与“关联”混为一次确认 |
| 交互与成本 | 使用当前路由、列表、详情、回执模式；无需新特权 | 需额外管理抽屉堆栈、遮罩焦点、审阅滚动和返回时状态 |

**决策：** 页面式 Search-first 列表 + 独立审阅 + 处理反馈/结果。弹窗只用于非常短的确认，不应承载任务发现和身份核验。

### 9.4 本次原型行为、保护与异常

- 筛选按钮改为约 34px 三水平线渐短的 `list-filter` 风格 SVG：图标独立触发器，`aria-label` / `aria-expanded` / `aria-controls`，Hover 提示、Focus、Escape 关闭并恢复焦点，有状态圆点；筛选按状态、收藏、更新、排序，数量≥20 才显示分组，清除后状态一致。
- 添加：三个显式标签页，搜索紧凑行只给名称/用途/网站/状态；详情披露网站、用途、发布者、版本、来源、委托范围与自动授权，技术身份放入折叠；确认先勾选阅读再操作。
- 已关联禁止重复添加；停用、委托范围以外、固定版本不匹配、来源不可验均展示不可添加的具体原因；网站权限恢复只模拟由宿主完成；取消回到先前列表；搜索无结果、安装中、成功、失败、UNKNOWN、重新读回及未自动授权均有明示。
- **UNKNOWN 只提供返回与只读对账说明，没有有副作用的一键重试。** 安装成功仅说明模拟安装目录读回已安装，不表示 Web Flow 包已委托、不表示授予自动运行。总开关不能扩大单脚本授权。
- 由于正式 SDK 不提供动态目录/安装能力，以上候选与来源“核验”均是示例内存数据。离线原型无网络/Native/Chrome 授权调用，也不触发真实脚本运行。独立聊天预览只是临时展示镜像；仓库中仍仅维护唯一原型 HTML 路径。

### 9.5 验证证据（严格区分）

| 层级 | 结果 | 证据与限制 |
| --- | --- | --- |
| 静态内容与 SDK 合同检查 | SOURCE_INSPECTED | GitHub main 读取 AGENTS、产品合同、正式 UI/包及公开 Sidebar SDK；不推断缺失的 API |
| 新增脚本语法 | PASS | Node `--check` 检查隔离交互模块与独立演示 HTML 的脚本 |
| Chromium 独立镜像交互 | 39/39 PASS | Chromium Playwright 实测筛选、2/20/100、320/360/440/580、成功/失败/UNKNOWN、重复、来源、权限、返回、浅/深色、可见反馈；无 pageerror；截图为本轮临时产物 |
| GitHub 原型 **逐字** Chromium 复测 | NOT_TESTED | 同源交互模块已合入，但未在可访问 GitHub 文件的本地容器逐字渲染该文件；独立镜像不是字节等同证据 |
| 中文/日文真实 IME、读屏与触屏实机 | NOT_TESTED | 有 composition 与焦点处理，尚无真实 OS/无障碍辅助设备证据 |
| Chrome 扩展安装/升级/权限/执行与原聊天回传 | NOT_TESTED | 原正式包保持未改，本轮无权接管其他 owner 的真实运行验收 |

### 9.6 六角色独立评审（当前原型，不是生产放行）

| 角色 | /100 | 主要扣分 |
| --- | ---: | --- |
| 产品设计总监 | 96 | 目录与宿主跳转尚无可调用的公开实现（−4） |
| 高级 UI 设计师 | 96 | 尚未逐字验证 GitHub 版在全系统字体的真实截图（−4） |
| UX 研究员 | 95 | 缺真实普通用户可理解性测试与任务发现成功率（−5） |
| 交互设计师 | 95 | 中文/日文 IME 和读屏实测尚未完成（−5） |
| 开发者工具设计专家 | 95 | 安装来源与哈希无法通过当前演示获得可信现场数据（−5） |
| Chrome Extension / React 架构师 | 94 | 固定 pin 以外的通用动态添加 SDK 尚不可用；未集成正式生产 UI（−6） |

六角度算术平均 **95.17/100**。虽然平均值超过 95，但**尚未达到“六位均≥95”目标**，架构角色为 94；不能靠给缺口加分伪装达标。评分是专业主观审阅，与 Chromium、真实安装验收分开。

### 9.7 后续正式集成的最小任务（不同 owner 不重叠）

1. **现有 UI Owner：** 在 `src/ui/` 接入 34px 图标筛选、状态点、Escape/Focus 和清除；固定两 Task 数据继续通过 `tasks.read` 可信读取。可提供“当前应用仅含两项委托”的添加说明与原宿主任务管理指引，不显示虚构完整安装目录。
2. **平台 SDK Owner（单独授权/取证后）：** 若要任意脚本添加，首先定义可信安装任务枚举、固定身份/权限的只读快照、受审 App 更新/重新安装和可导航的宿主能力；任何动态委托必须经过新包身份及 Authority 复核，不允许任意 taskId RPC、后台特权侧道。
3. **本机验收 Owner：** 获取 V0.3.2 GitHub HTML 的逐字浏览器截图，测试 320/360/440/580、真实 IME/读屏/触屏，然后在生产代码集成完成后再验收原安装包与 Chrome 扩展。未完成前保留 NOT_TESTED。

