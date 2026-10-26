---
name: opendesk-trusted-sidebar-feature
description: Build or decouple audited first-party Side Panel/Background/Content features (Stay Focus, Time Review, Cookie Editor), separating static privileged sources from 扩展 center dynamic apps and installed Page 网页增强 without elevating user code.
---

# OpenDesk Browser · 第一方可信 Side Panel 功能与最小解耦

## 什么时候使用

R4 正式五 Tab 见 [产品规格](../../../docs/product/sidebar-ui-spec.zh-CN.md)：「我的 / 扩展 / 工作流 / 开发 / 云控」。**显示在扩展中心不等于可信权限**；纯扩展中心 UI 归 extension-ui，通用 SW/SDK 接线归 extension-runtime。

用户要求创建、改造或解耦随 **OpenDesk 扩展静态编译发布**的第一方功能（如 Stay Focus、Time Review、Cookie Editor）时使用。特别针对「具体工具业务散落到通用 Sidebar 宿主、安装器、桥、CSS」的耦合核查与最小修复。

**不是安装版工具开发 Skill**：任何用户/AI/市场导入的 `opendesk.sidebar-tool.v1` HTML/CSS/JS，即使工具 ID 与官方相同，也必须走 [`opendesk-sidebar-tool-dev`](../opendesk-sidebar-tool-dev/SKILL.md) 的 opaque-origin iframe 及原 Host 协议。Controller/Page 脚本走 [`opendesk-script-authoring`](../opendesk-script-authoring/SKILL.md)，冻结/发布走 [`opendesk-program-publish`](../opendesk-program-publish/SKILL.md)。

本 Skill 是工程规则，不创建新的工具安装器、授权系统、后台服务、Worker、Browser SDK 或第二套 UI 运行时。

**第三方与第一方的边界**：普通沙箱 Sidebar Tool、Page USER_SCRIPT 的独立业务仍在各自项目和公开 SDK 中维护，不触发本可信源码 Skill。只有经证实需第一方固定预编译特权、并完成来源/授权审计时，才最小修改其 `src/<feature>/`，通用宿主问题再交 Runtime Skill。缺乏通用能力证据记 `SDK_GAP_NOT_PROVEN`，第三方无法合规取得的 Chrome/Native 特权操作记 `BLOCKED`；不得因工具统一展示在「扩展」Tab 就将动态代码提升到可信页面。

## 先解释产品选择与独立升级边界

普通开发者先读 [五种使用场景与多 JS 分工指南](../../../docs/api/extension-development-selection.zh-CN.md)：Controller、Page、Sidebar Tool 各有现成合同；后台服务是独立使用场景，但没有任意第三方特权后台 JS 安装器；组合式应用是职责组合，不新增 Runtime。源码归产品、入口决定运行环境、权限由 Authority 核验；文件名、目录和 React/Vue 不决定信任。独立工具 UI 可以在自己的沙箱文档创建 React Root，不应因组件复杂就把业务放入主工作台。

独立源码、独立 UI 安装、关闭 UI 后继续运行、独立后台升级是四个不同目标。Stay Focus R2 已完成源码提取，已有 focus.* 支持参数变化；JSON 不替换固定计时/DNR/提醒代码。后续沿 [Stay Focus R4 唯一需求](../../../examples/sidebar-tools/stay-focus/REQUIREMENTS.zh-CN.md) 评估最小声明式公共能力，不能把未实现需求写成 API，不重开迁移或后台运行器。

**现状审计与下一步**：[宿主解耦合同与 AdBlock / Stay Focus 最新源码审计](../../../docs/architecture/browser-framework/sidebar-tool-host-decoupling.zh-CN.md) 已按真实代码列出 AdBlock 与 Stay Focus 留在 SW、Content、可信 Host、Installer 的静态接线和 L1–L4 缺口。固定、审查并精确锁定来源的第一方适配器允许作为安全兼容例外，但新增每工具入口不能被默认当作可扩展框架方案。先验证公共能力、租约与独立策略升级；不为消除静态引用直接放开动态特权代码。仅在行为/权限/重启/DNR/跨工具清理与旧实现同等时移除旧入口。

## 先以当前源码确立可信界限

先核查真实 `main`、`AGENTS.md` 的当前阶段、用户最新优先级及目标文件 diff。只读当前功能源码及直接依赖；涉及开发/安装合同才查[运行边界](../../../docs/architecture/browser-framework/custom-tool-ui-and-local-development.zh-CN.md)与[工具开发规范](../../../docs/api/sidebar-tool-development.zh-CN.md)，调整布局/导航才查 [R27](../../../docs/architecture/ui-layout-conventions-r27.zh-CN.md) / [R28](../../../docs/architecture/sidebar-multi-section-tab-contract-r28.zh-CN.md)，准备运行验证才查[测试指南](../../../docs/framework/testing-guide.md)和相关证据。不要求每次通读，不用旧 GOAL 替代现实或延续已被用户调整的验收目标。

可能涉及的共享边界：`src/ui/tool.html`、`src/ui/tool-shell.js`、`src/ui/sidebar-tools.js`、`src/ui/sidebar-tools/{installation,lifecycle,package}.js`、`src/sidebar-tools/official-catalog.js`、`src/entrypoints/sidebar-tool-host.js`，以及功能自己的 `src/<feature>/` 和 `examples/sidebar-tools/<id>/`。仅追踪本次相关的代码来源、宿主调用、权限、生命周期或安装/撤权依赖，决定最小改动；不要求普通缺陷重画完整架构图，不凭文件名判断业务 owner。

### 唯一安全分流

| 代码来源 | 可以去哪里 | 强制原则 |
| --- | --- | --- |
| 扩展源码中静态导入、编译时确定、经审计的第一方组件 | **在满足严格准入后**挂载可信 Side Panel | 只能执行随当前扩展打包的固定代码，仍审查已安装版本/包摘要/来源、启停与撤权代际 |
| 动态工具包、AI 生成、用户改包、离线同 ID 导入 | 原 `sidebar-tools/sandbox.html` opaque-origin iframe | `OpenDeskTool.request` 经现有 Host 授权；绝不在特权页解释/注入包中 JS |
| 网页 UI、Page `USER_SCRIPT` 或 Controller Worker | 各自当前世界与 Authority | 不能从 Sidebar 显示工具就自动获得站点读取、Chrome API 或 Native 特权 |

扩展级 `chrome.*` 权限**不是每工具的权限**。当前 Manifest 的 declarativeNetRequestWithHostAccess 是必需权限，idle 是可选权限；可信点击、网站授权与已安装包身份仍分别核验。纯模型可以通过明确的 v2 files.dependencies 选入沙箱（Prompt Shortcuts 已使用 trusted/model.js），它在沙箱里不拥有可信入口权限；不得把 trusted/ 目录约定当作权限机制。`toolId`、`capabilities`、签名文字、Shadow DOM、ESM 闭包都不是可信代码来源证明；一旦把任意 JS 放到扩展特权页，简单 SDK 检查不能阻止其直接调用扩展 API。不得以优化 UI 为由打开这条通路。

## 最小职责划分（优先修已有文件）

| 层 | 正确职责 | 反例 |
| --- | --- | --- |
| 已审计工具项目 `trusted/{policy,model}.js`，或尚在 `src/<feature>/` 的唯一业务模块 | 私有数据合同、状态机、站点范围和校验；先查真实调用方 | 把 Stay Focus 域名分类规则放入通用工具包校验器 |
| 对应唯一业务源的 `service.js`、`rule-ownership.js` | Background 计时、DNR/idle、撤销和重启对账；只从固定入口编译 | Side Panel 关闭导致服务停止；iframe 定时器代替后台 |
| 对应唯一业务源的 `host-controls.js` / 可信 UI adapter | 用户可见状态、真实 Chrome 权限点击、危险确认；只由固定可信页面加载 | 不可信 iframe 的合成事件直接授权/删除 |
| `examples/sidebar-tools/<id>/src/` | 需要保留沙箱可安装包时的一份工具 UI 源 | 长期复制两个互相漂移的官方 UI 实现 |
| `src/ui/sidebar-tools*.js` 和 `src/ui/sidebar-tools/` | 通用安装、展示、挂载、生命周期、审查和消息分发 | 新业务判断大段复制进通用 Host，或因一个工具改动破坏其他工具 |
| `src/ui/design-tokens.css` / `design-system.css` | 共享可信 Side Panel token 和语义组件 | 每个功能重新定义全局 reset、动态 Tailwind、跨 iframe 注入 CSS |

**最小解耦顺序**：定位具体耦合及调用方 → 测试复现 → 把纯业务策略/数据归还**已有独立项目的唯一业务源**（已迁移的工具保留 `examples/sidebar-tools/<id>/trusted/`；尚未迁移的第一方模块先核查 `src/<feature>/` 是否真有必须的可信职责）→ 通用 Host 只留固定接线/受限适配 → 原入口与安装/撤权身份不变 → 做受影响回归。不存在代码缺陷时不为了“分层好看”重构所有工具；禁止增加一个通用巨型 Registry 代替旧巨型文件。

## 两个必须区分的具体案例

**Stay Focus（R2，2026-10-18 已提取）**：真正业务源在 `examples/sidebar-tools/stay-focus/trusted/`，由 `src/sw.js`、`src/entrypoints/{stay-focus-controls,page-relay,blocked}.js` 等固定入口静态加载；`src/stay-focus/*.js` 只是兼容转发，不得向其中重新写入业务。DNR 拦截规则归属、每日额度、站点识别、页面提醒、撤权与后台状态应有专用职责。参阅 `docs/framework/workstreams/stay-focus-extraction-r2-20261018.md`。工具 UI 展示/发起受限操作，不缓存规则真相、不复制第二套调度器。关闭 UI、focus.session.stop、focus.disable、停用和卸载须分别核查：停用保留设置/使用数据，卸载删除业务存储并回读自有规则清理；不承诺共用 Chrome 权限或所有临时键均被删除；变更通用安装器的卸载清理必须有跨工具负向回归。

**Time Review（尚保留可信业务在 `src/time-review/`）**：`src/time-review/service.js` 经 `src/entrypoints/time-review-host.js` 固定接入 Background；`src/time-review/trusted-native-ui.js` 静态引用 `examples/sidebar-tools/time-review/src/` 的可维护 UI 源，并由 `trusted-admission.js` 核实来源与安装身份；不是从已安装 JSON 读取任意 JS 在可信页执行。不得假定 R1.6 历史通过即意味着当前所有 Chrome 生命周期或其他官方工具也支持可信直挂。服务仍由后台独立完成，撤权、包版本改变和卸载都应销毁相关 UI 会话但不伪造历史数据。后续提取应同时核查通用 sidebar-tools.js 的 time.* 私有处理和 installation.js 对 TIME_REVIEW_KEY 的直接清理；本轮存在并行工具任务时仅记录具体调用方，交由 owner 修复。

**AdBlock** 的可安装 UI 位于 `examples/sidebar-tools/adblock/src/`，固定受信代码位于其 `trusted/`，由 `src/sw.js` / `src/entrypoints/sidebar-tool-host.js` 预编译接入，不能随动态包获得 DNR。对 Cookie Editor、订阅管理、计划、其他工具按同样边界核查，但**不得把所有模块强行迁为可信直挂**。单个试点的结果不能推导其余工具均已迁移。

## 工具专属文档归属

对第一方可信产品，不论受审业务源位于独立项目 `trusted/` 还是既有 `src/<feature>/`，**产品事实归其唯一产品目录维护**，不要把每个工具的功能宇宙、交互细则、AI 设想、商业方案和实现说明复制到 `docs/product/`、`docs/api/` 或通用 Host 文档：

- 以现有唯一项目 README 为产品入口：Stay Focus 使用 `examples/sidebar-tools/stay-focus/README.zh-CN.md`；尚未迁移的 `src/<feature>/` 可沿用原 README。兼容转发目录不能重写第二份业务事实。
- 只有路线足够长、需要持续独立维护时，才增设一份 `ROADMAP.zh-CN.md`；P1–P3、商业实验及隐私限制放其中，不为每次讨论新建分散的 GOAL 或大批 Markdown。
- UI 交互 HTML 可以留在现有 `prototypes/` 统一预览画廊；由模块 README 指向它，不保存两套会漂移的副本。
- `docs/framework/workstreams/` 和 `evidence/` 继续归属跨会话验收身份、原始证据和资源账本。各模块 README 只引用，不能把静态设计自评分提升为 Chrome PASS。
- `docs/architecture/`、`docs/api/` 与本 Skill 仅承载**跨工具可复用的规则和 API 合同**；如历史产品文档链接必须保留，改为模块文档的简短导航入口，不复制正文。
- 用户需求、P0 操作、源码真实能力、未来候选规划和实际验收等级要分开标记；变更时先更新拥有该信息的唯一文件，再核对所有反向引用。

以上是信息归属约定，**不授权改变**工具来源分流、动态沙箱、权限或已批准的 SDK 合同，也不要求为了整理文档移动代码、测试或已有原型。

## UI、测试及交付

按 [AGENTS.md 的开发阶段规则](../../../AGENTS.md#开发阶段先完成核心需求与最小验证用户于2026-10-17明确)先完成当前核心操作，再选择受影响的定向验证；本节的场景与评分不构成每次开发的全量清单。仅改文档/Skill 时验证链接、事实、元数据与阶段逻辑，不运行产品测试、构建或浏览器。相关 Chrome、Native、安装升级或恢复项未执行时标 `NOT_TESTED`。

Side Panel 优先复用 `od-page/od-stack/od-surface/od-button/od-field`，真实 token 在 `src/ui/design-tokens.css`；密度遵守 4/8/12/16px、单层 gutter。动态 iframe 的 CSS 独立映射尺寸，不能向特权 Host 借 JS/CSS 作为安全边界。按本次改动验证受影响的中文长文案、暗色、键盘/焦点、停止与卸载后的 DOM/事件清理；宽度、缩放等专项矩阵按用户当前明确要求执行。

**工具详情标题与创建入口（遵循 R28 与共享导航 R2.2）**：独立工具/二级视图默认只有一个当前页短标题（根页工具名；合法子页「设置」「编辑」「详情」「新建」）和必要动作，完整路径只存可信 Header 的 `title` / `aria-label`；禁止父名 flex 拉开文本、设置内重复 H2、固定描述、价值口号、数据来源或可见面包屑；真正的权限/错误/未保存动态状态应独立告知。文件夹等可管理集合的“＋ 新建”必须贴近所属区标题，自定义行级重命名/移动/删除可被键盘和触摸明确发现，根目录不展示不可用动作。新交互确需原型时，可用无真实权限的 HTML 原型检查本轮要求的尺寸及列表→表单→返回路径；既有核心缺陷直接在现有入口修复，不以新建原型为前置条件。右侧评审上下文区域不可成为 Side Panel 实际使用时的唯一操作入口。正式验收评分按功能、信息架构、可发现性、安全/隔离、响应式和证据分别记录，不以总体分掩盖不达标项。

定向测试入口按实际改动选择，不按工具名称整组运行：Stay Focus 的业务/服务可查 `tests/environment/stay-focus-r1.test.mjs`、`stay-focus-service-r1.test.mjs`；Time Review 的可信准入/站点授权可查 `time-review-r16-trusted-native.test.mjs`、`time-review-r15-site-grants.test.mjs`；通用工具合同/Host 可查 `sidebar-tools.test.mjs`、`sidebar-tools-host.test.mjs`。

通用 Host/安装器变更按受影响合同选择跨工具负例：身份/来源变化检查改包与假 ID，撤权/会话变化检查旧 epoch、跨来源拒绝和恢复，卸载清理变化检查自有数据/规则及其他工具不受损。权限、CSP、来源锁定、未知副作用等实际受影响的保护不得省略；纯 UI/文案变更不因此扩成完整生命周期矩阵。

确需编译/产物或浏览器行为证据时再选检查、构建/包校验或 `tests/framework/stay-focus-r1-native.test.mjs` / `time-review-r13-native.test.mjs` 的相关场景；构建失败按 AGENTS 的定位与重试规则处理，相关输入和诊断依据均未变化时不重复全量构建。完整安装更新/撤权矩阵、正式候选验收和独立评分，仅在用户当前明确要求或适用的正式交付合同下执行。先核对相关证据和资源归属，不争抢 Profile；Node mock PASS 不等于新候选 Chrome PASS。

开发交付时说明：哪个核心操作已可用、哪些具体耦合被修复、共享 Host 是否变化、原安装/权限/存储合同是否保持，以及受影响验证和缺口。仅在用户当前明确要求独立评分或适用正式合同要求评分时使用既有 `≥95/100` 目标：安全来源/权限 25、正确业务边界 20、架构复用 15、功能/生命周期 15、跨工具负向回归 15、UI 可访问性 5、文档与证据 5。相关原生项未做同候选实测标 `NOT_TESTED`，不凭文档自报 95+；不为完成普通开发额外启动评分。


**R1.2 例外（统一书签文件树）**：文件夹和书签属于同一父子树时，不能机械套用「按集合拆区/区标题各放新增」；合并为单棵可折叠树，一行「收藏当前页 / ＋书签 / ＋文件夹」。详情见 R28；AI 重排、社区和商业推荐只能在独立已批准阶段开发，私人书签/历史及派生画像不得用于个性化广告。

## 公共后台能力与暂留第一方服务的分界（R1.4）

只有经过 `backgroundPolicy.kind='site-budget.v2'` 和 `browser.siteBudget` 审核的普通应用才进入 `src/platform/chrome/browser-managed-site-budget.js`；侧边栏 Host 负责确认，单一 Worker 负责事件/计量/DNR/Alarm，安装器复用其原有停用/撤权与清理日志。资源按 owner 隔离，记录来源、包摘要、epoch、期望/应用 Revision 并区分未知结果。不得从工具沙箱传任意规则、特权算法或自行指定规则 ID。

Stay Focus 的共享分组、提醒、会话及 AdBlock 过滤清单/picker/cosmetic 目前仍依赖各自固定可信服务；在新普通应用相同 B0 下的真实安装、后台运行、原位升级和撤权清理没有原生 PASS 前，绝不改两产品的正式 DNR 所有者。新增普通受限预算数据可不改 Browser，新算法必须发布 Browser。验收依据 `tests/environment/managed-site-budget-r14.test.mjs` 和独立 Chrome 原生报告，不能把 Node Mock/Preview 记为 Chrome PASS。
