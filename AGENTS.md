# OpenDesk Browser 工作约束

<!-- AUTONOMY DIRECTIVE — DO NOT REMOVE -->
YOU ARE AN AUTONOMOUS CODING AGENT. EXECUTE AUTHORIZED TASKS TO COMPLETION WITHOUT ASKING FOR PERMISSION FOR ORDINARY REVERSIBLE STEPS.
<!-- END AUTONOMY DIRECTIVE -->

## 默认分支规则（用户于 2026-10-12 再次明确）

**未经用户针对具体任务明确同意，只允许使用主分支 `main` 进行代码编辑、修改、提交与推送。** 普通任务直接在 `main` 开发；不得自行创建、切换到或向其他开发分支写入，也不得自行创建 Git worktree 或 PR。此前允许因“并行开发需要隔离”而自动创建分支的规则被本条取代；不得引用历史提示词、文档或其他 Agent 的惯例绕过此约束。

`main` 上存在其他 Agent 或未提交改动，不构成全局停工条件。先只读核对本任务的写入文件、公共契约和所需资源；范围不重叠、无不兼容依赖变化时，直接继续独立工作，保留他人改动。有实际冲突时仅暂停受影响部分，明确记录冲突文件/接口/资源及协调方案；其余工作继续。不擅自创建临时分支或工作区作为替代方案；只有用户明确同意某个具体例外后，才允许使用约定的其他分支或 worktree。

已有非 `main` 分支允许只读核查。仅在用户明确要求合并/清理时，将应保留的变更安全合入 `main`，确认不丢失独有提交后再删除多余分支。绝不为“只保留主分支”而直接删除未合并工作；禁止强推、破坏性 reset/clean、覆盖并行工作。提交与推送仍遵守当前任务的授权边界。

## React UI 共享组件与自定义 UI 零退化（2026-10-16，R33.1）

**本轮产品 P0 是五个可信 Side Panel Tab 最终统一 React 工作台**，优先「开发」「扩展」，再「工作流」「我的」「云控」；阶段性分模块迁移不等于最终长期保留两套 UI。UI 组件首选评估 shadcn/ui（React Aria base）+ Tailwind v4 + 既有 OpenDesk Tokens，须先以真实依赖、CSS scope、交互/焦点和构建体积确认，再实施正式可信 UI；不是仅创建 Starter/组件包或重写 Browser SDK/Host。

**并列 P0 是用户自定义 UI 零退化，重点是「原有工具不改」而非「所有旧工具改为 React」。** HTML/CSS/JS、Vue、React 原工具与示例保持原状，继续可安装/运行/更新并调用原 SDK；`开发` 的编辑/编译/预览/运行/保存/Stop 与 Standard/Developer 路径保留。新 React 组件只对需要的消费者可选，旧 HTML/Vue 示例不迁移、不增加 React/样式依赖、不改身份/数据/正式包；**只做受影响范围的定向兼容测试，失败才最小修复**。不将用户动态 iframe JS 提权到可信 React 页面。独立完整页面的 UI 重设计为 P2；已有标签页打开工具继续可用。

继续使用现有 WXT/Vite、唯一 Tokens、原 Sandbox/Host/SDK/安装器和安全构建边界；不创建第二套核心基础设施。R32.8「不建共享组件包」和 R33.0「一处 React UI Island 即完成核心目标」都不能取代 R33.1 的五 Tab 产品方向。独立专家评分目标 ≥95，但未获对应最新候选 Chromium 证据标记 NOT_TESTED。**唯一权威产品/架构与验收入口：** [统一 React Side Panel 与自定义工具兼容合同](docs/architecture/react-ui-shared-components-r33.zh-CN.md)。

## Sidebar Tool 单一正式安装包与测试后晋升（2026-10-15）

**凡在 `examples/sidebar-tools/<id>/` 开发、测试并准备交付可导入的 Sidebar Tool，工具目录最终只保留一个 `<id>.opendesk-tool.json` 正式可安装包。** 用户期望安装/手动验收时不能只给 CI ZIP、忽略的 `artifacts/` 或仓库外附件；测试通过后必须把安装包与源码一起安全提交到 `main`。不对未触及的所有示例批量补包，不制造带 R/日期/版本后缀的重复正式 JSON；历史保留在 Git 提交和既有发行账本。此规则不适用于 Page USER_SCRIPT/Controller Task、Chrome CRX 或 `manifest.json`。

**标准门禁**：源码/React-Vue 预编译 → 用原 `scripts/build-sidebar-tool.mjs --out artifacts/sidebar-tools/<id>/candidate.opendesk-tool.json` 构建临时候选 → 运行受影响 Node/包/安全来源测试并核实包身份与版本 → 仅成功后使用**同一打包器**的 `--promote-from` 对候选与当前源码进行逐字节核对并原子更新工具目录唯一 JSON → `--check-project` 核对同源 → 与源码同时提交。失败、来源漂移和结果未知不得覆盖原正式包。普通打包不再隐式刷新工具目录；CI 可在通过已有门禁后同步，但须保护较新 `main` 的源码。只读 `.opendesk-preview/` 与 `artifacts/` 属本机/CI 临时产物，不提交成堆快照。

**分清自动验证与原生验收**：Node/JSON 包 PASS 允许保存“通过这些门禁的可手动安装候选”，但不证明真实 Chrome/网站/IME/Native PASS；实际安装/升级仍经现有版本、权限及用户确认链。详见 [唯一打包 Skill](.agents/skills/opendesk-sidebar-tool-package/SKILL.md) 和 [扩展开发工作流](.agents/workflows/extension-creation.md)。不新增第二套安装器、打包器或扩展身份。

## 日常扩展加载目录（用户于2026-10-12明确要求）

日常修改扩展源码时，Chrome 固定加载本仓库的 `dist/development`，由 `npm run dev` 持续更新；不得自行复制到 `~/.opendesk-browser/extensions/local-dev-<会话标识>` 等新目录并替换日常扩展。隔离构建、验收包只用于对应工作流的独立 CFT/Profile。修复本地项目开发或 Native 接入问题时，优先保留正常加载目录和扩展 ID，不把某次隔离候选安装进日常 Chrome 作为快捷修复。

**开发修复与最终验收必须分清（用户于2026-10-14明确）：** 日常修复使用已有 `npm run dev` watcher 和上述固定目录，先核对实际加载路径、ID、开发服务连接及构建指纹；不得把每次修改后的全量 `build`、复制静态包、重装扩展作为默认迭代方式。正式版为五个产品 Tab；development 构建额外显示「调试」，但 `npm run build:dev` 仍是静态构建，只有 `npm run dev` 的 serve 客户端连接成功才启用持续更新。Chrome 的「开发者模式」、产品「开发」Tab、Standard/Developer edition 均不能替代这项检查。更新依当前实现分别为 CSS 热加载、工具文档安全刷新或扩展安全重载，不能承诺所有源码都原地 HMR，也不能绕过任务/原生请求/草稿的安全栅栏。

缺陷收敛后再冻结候选，在验收专属 CFT/Profile 加载 production 静态包，验证正式五 Tab、权限和最终包身份；发现缺陷回到持续开发环境修复，随后仅重建和复验受影响的候选。开发模式证据不得冒充 production 验收，旧候选不得冒充新包。已有 watcher 的输出不得由第二个 dev/build 覆盖；收尾构建须先协调该 writer，或依现有协议使用独立快照、输出和守卫，不能擅自停止其他会话服务。首条及模式切换时说明当前是「持续开发 / 静态开发包 / production 验收包」，并给出实际路径与连接状态。

核对 Chrome 实际启用扩展的加载路径、真实 ID、Go doctor 的 `local.extensionId` 及 Native manifest 的 `allowed_origins`，不能用仓库 HEAD、目录名或版本号替代配对检查。用户明确要求切换或删除历史副本时，先保留必要证据和可恢复备份、收尾连接，再使用所属 owner 的官方命令修复配对；跨 ID 的 `E_EXTENSION_ID_CONFLICT` 不得靠直接改写或删除 Native 配置绕过。日常源码开发详见 `docs/framework/extension-development-r131.zh-CN.md`。

## Browser SDK 唯一设计封版与实施入口（2026-10-13）

**Browser SDK 的唯一后续执行手册：** [`docs/api/browser-sdk-execution-manual.zh-CN.md`](docs/api/browser-sdk-execution-manual.zh-CN.md)；**全部官方发现与获批准逐接口实施合同：** [`docs/api/browser-sdk-interface-matrix.json`](docs/api/browser-sdk-interface-matrix.json)。本次按固定 Chromium JSON/WebIDL/IDL Schema 扫描，目录中包含私有/特定平台/历史接口，发现不等于批准开放。后续编码任务直接按手册 Phase 0–7、矩阵首项未完成接口实施、测试、保留证据并安全提交，不重开整体架构讨论，不再建立并列总 GOAL。

**原 35 项永久兼容规则已失效。** R7/R8、`browser-sdk-compatibility-map.json` 与旧 8 Namespace Chrome Catalog 是迁移与历史检索资料，不能覆盖唯一 Registry / Host / Authority 或要求保存开发期错误旧 API。接口的 SOURCE_WIRED、NODE_PASS、BUILD_PASS、NATIVE_PASS 独立验证；无同候选真实 Chrome 证据必须标为 NOT_TESTED。

## Browser SDK 预发布 API 一次性收敛授权（2026-10-13）

**用户最新明确：OpenDesk Browser 尚未正式上线使用，现有 35 项 Browser SDK 只是开发期快照，不是必须长期兼容的外部 API。** 对 Browser SDK 中命名、参数、返回值、分层或重复调用设计不合理的旧接口，允许直接合并、改名或删除；一次性同步迁移仓库内全部消费者、示例、测试和当前文档，不增加无意义的兼容别名、deprecated shim、第二套 Registry/Host/Authority 或固定 35 项测试分母。本条在 Browser SDK 范围内优先于历史“保留已约定公开 API”及 R7/R8 的旧接口兼容目标。

优先采用 Chrome Native API 的习惯命名与语义，安全作用域不同则明确标注（如 owned TabRef）。**放弃旧 API 不等于放弃旧功能与安全**：必须保留真实 Sender、安装身份、精确 Origin/Document、用户手势、撤权、未知副作用、隔离和既有 603+19/B05/F3/ZIP 验收事实；正确功能必须迁移到新单一入口。权威决策见 [`Browser SDK 预发布收敛合同`](docs/api/browser-sdk-prelaunch-contract-20261013.zh-CN.md)。

## Global First 第一小山头：长期市场策略约束（2026-10-13）

**仅适用于全球/区域/行业“第一”、小山头竞争定位、营销、SEO/GEO 与 AI 推荐研究任务；不改变其他 Browser SDK、Cloud、Native 工程任务的实施所有权。**

- **R6 最新顺序：先完成真实用户产品闭环，再用实测价值确定竞争位置**。优先复用现有 Workflow/Task/Authority/RunHost，证明真实 AI 新生成的同一源码经审阅、原生验证、正式安装和关闭模型后的独立 Run×2；不能循环写战略 GOAL 替代产品验收。再根据真实用户、重复频率、替代成本及公平竞品测试争取限定区域/任务优势，不为“第一”制造无需求的功能组合。TOP20 是投资优先级，不是世界排名。
- **AI 优先，不等于预设 GF-007 已获胜**。主要用户旅程是提出需求→AI 协助创建→审核权限/结果→受控安装→以后可重复使用；这条全链仍是待实证方向，不得写成已经正式交付。手动在 Side Panel 编写 React/Vue（旧 F01）是技术支撑，不能自动恢复为全球第一营销 P0。
- **先验证竞品，再反推产品缺口**。要比较单产品和真实组合（如 AI 编码器 + Vite + 脚本管理器），分开 Stable、Beta、仓库推送、商店发布日期和关键能力首次公开可用时间。未找到反例不等于世界首创。
- **分清候选顺序与市场排名**。TOP 1—5 的研究优先级不是第 1—5 名产品排名；只有真实日期、范围、地区、充分对手样本、当前发布/原生证据及独立审批才能宣传全球首个/区域第一/最快/Top 5。GF-013/GF-014 保留 DISPROVED，不换词复活；95 分未审则 NOT_SCORED。
- **用户先看一屏可读结果**：每项“谁需要、解决什么、竞争哪种第一、最强对手、已有证据、最小缺口、下一步”，再附技术文档。不能把再写一份 GOAL 当作竞争验证已完成。

Global First 权威阅读顺序：[R6 工程进度、TOP20 执行分类及真实验收缺口](docs/framework/workstreams/global-first-r6-ai-first-product-proof-20261013.md) → [R5 TOP20/84 OPP 产品组合](docs/product/browser-extension-ecosystem/global-first-r5-portfolio.zh-CN.md) → [R4/R5 战略历史](docs/product/browser-extension-ecosystem/global-first-r2-decision.zh-CN.md)。唯一正式账本仍是 `docs/product/browser-extension-ecosystem/opportunity-register.json`、`commercial-experiments.json`、`competitor-timeline.json` 和 `first-claims-ledger.json`。原 R5 固定 Task 真实 Chrome 一次 PASS 不等于真实 AI 新源码贯穿的安装及无模型重复 Run×2；无同一原始证据标记 NOT_TESTED。R4 GOAL、R1/R2 与 R3/F01 保留历史参考，不另建总 GOAL。

## 第三方 JS 依赖：开发脚本免人工审核的最高优先级产品决策（2026-10-13）

**用户自己编写、修改或让 AI 生成的脚本，在 Side Panel「开发」主动点击 Run 时，不得被要求逐库核对/勾选 SHA、许可证、依赖图或点击“批准锁”，也不允许程序 B 因使用同一固定库而重复人工审核。** Run 是用户的草稿执行意图；系统自动校验来源、固定版本、SHA、依赖闭包与执行世界，按权限允许的方式取得/复用缓存，自动生成绑定各程序/Revision 的固定锁。可查看高级详情，但不得把它变成每次开发的通行证。

免依赖人工审核不等于免权限：仍须尊重真实 Chrome 来源/网站权限手势、页面/宿主 Authority、安装/定时/云控/第三方 Provider 的能力与数据范围授权、MV3/CWS 远程代码边界、撤权、坏 SHA/私网/重定向及资源上限。不得将用户下载代码直接交给特权 SW/Host，不得静默升级 fixed Revision。只有真实缺失权限或无法解析确切版本才提示必要操作。

**R7.1/R4 现有「检查→下载→人工审阅→批准→运行」是历史实现，不能作为最终正确 UX；需要继续修复源码与测试。** 长期规则：[依赖使用场景合同](docs/framework/universal-dependency-runtime-usage-contract.zh-CN.md)；执行入口：[R7.2 GOAL](docs/framework/prompts/goal-universal-dependency-runtime-r7.2-scenario-first-20261013.zh-CN.md)。本条优先于历史 R4–R7 的逐库人工审核要求，不影响 Browser SDK 与安装安全合同。

## 第三方库用户语法优先普通 JavaScript（2026-10-13）

用户最新明确：AI/用户写 Controller 代码不应出现私有 `// @opendesk-classic` 或无谓的 `globalThis.mitt()`。**首选** Developer 标准版本化 ESM：`import mitt from 'mitt@3.0.1'`，后续直接 `mitt()`，用户点击 Run 后由现有 Compiler/Dependency Manager/SHA/RunHost/Authority 完成精确源码锁定。绝不静默使用 `latest` 或将 `import mitt from 'mitt'` 当成已固定版本，当前未解析的裸包名要明确拒绝。Standard 无 Babel：确实需要 Classic 时仅保留通用 `// @require https://.../versioned.umd.js`，按库在受控 Worker 中真实导出的符号直接调用，不默认注入网站 MAIN。

不要新建 npm Runner、Manager、Host 或第二编译器；用户无需逐库勾选 SHA 或为第二个程序再次人工审核。普通 `import` 在 Developer 是必要时的 ESM 编译，不表示 Classic 全量改 Babel。已冻结/安装 Revision 的字节与 SHA/版本/授权不可静默更新。用户接口权威示例见 `docs/framework/universal-dependency-runtime-usage-contract.zh-CN.md` 及 `examples/programs/single-file/controller-mitt-pinned-esm.js`。新语法当前仅有 SOURCE_WIRED 与测试驱动，独立真实 Chrome/CWS PASS 不可凭空宣称。
## Controller/Page 零参数用户入口及 src/libs 环境合同（2026-10-12）

用户当前明确要求：**推荐示例、AI 生成代码与多文件 ESM Controller 入口使用 `export default async function main()`，Side Panel「开发」直接编辑 Controller 草稿使用 `async function main()`，直接引用受控 Worker 词法 `page`、`params` 及默认 `_`、`dayjs`、`OpenDeskLibs`，不让用户给 `main` 传能力对象、重复 npm 安装或写 CDN。** 历史 `main({page})` ESM 入口只保留兼容，不得再宣传为唯一/推荐格式。

Controller 的 `page` 不是网站 `window.page` 或 Worker `globalThis.page`。Page USER_SCRIPT 使用 `document` 和自己的默认/显式按需库，不拥有 Controller `page/params/axiosx`；SW、Side Panel 宿主、独立扩展页面由各自构建入口静态引入，第三方工具 iframe 使用 `OpenDeskTool`。禁止将各执行世界混成一个全局表、把全部库打进 SW、运行时 CDN 或增加不必要 Chrome 权限。**权威使用说明、示例和验证级别**：[预置变量与世界矩阵](docs/api/runtime-globals-and-preinstalled-libraries.zh-CN.md)。新需求先检查实际 Worker/ESM 编译器及 Page 世界合同，再写提示词。

## 核心功能验收范围：不默认考虑缩放与物理宽度（用户于2026-10-14明确修正）

**本仓库日常开发及当前定时计划 R1.2 验收，不需要考虑浏览器缩放或 Side Panel 物理宽度专项测试。** 不执行多档缩放、分隔线拖拽、目标宽度测量或宽度×缩放矩阵，不将它们作为修复、评分或交付的前置条件。只有用户针对具体任务再次明确要求，才将这些专项测试纳入范围。

当前 R1.2 的核心需求是：真实 Mac Chrome 扩展中，定时计划的创建、编辑、保存、取消、删除确认、未保存草稿保护、任务管理往返、滚动与焦点恢复、Task/计划/执行身份安全，以及多计划和历史记录的正确性。使用正常窗口和默认缩放完成实际用户操作；若当前界面的可见问题确实阻止这些操作，只修复实际复现的问题，不扩展为尺寸研究或 UI 重构。

本条取代此前 R1.2 GOAL 中关于 300/320/360/420/520 物理宽度、100%/125%/150%/200% 缩放及二者组合验收的要求。保留旧测试和原始证据，相关专项项在本轮记为 `OUT_OF_SCOPE`，不得伪报 `PASS`，也不得继续以它们阻塞核心功能收尾。不得因新对话、无关 main 更新或旧专项验收缺口而重复已经有有效证据的核心流程。

## UI 布局与 Tailwind 样式规范（2026-10-12）

所有新增或调整的 Side Panel、Native Workspace/Settings、应用市场、侧栏工具及网页注入 UI，先按 [`docs/architecture/ui-layout-conventions-r27.zh-CN.md`](docs/architecture/ui-layout-conventions-r27.zh-CN.md) 的**跨界面**规则选择布局密度、间距、容器 gutter、断点、焦点和验证级别；Side Panel 特殊细节继续以 [R20/R26 文档](docs/architecture/sidebar-design-system-r20.zh-CN.md) 为准。权威变量只有 `src/ui/design-tokens.css`，不要为每个 Tab 重建颜色、间距和按钮系统。R31 的 HTML 复用及 CSS 所有权补充见 [R20 的 R31 章节](docs/architecture/sidebar-design-system-r20.zh-CN.md) 和 UI Skill：一级折叠 `od-disclosure`、内部诊断 `--flat`、公共视觉归 `design-system.css`、页面只负责布局。

Native Workspace 已采用 Tailwind v4 的离线固定构建，必须保持 `rem` 尺寸锚点正确；其他页面可继续用原生 CSS 映射 token。严禁为了统一样式让 Tailwind Preflight 进入 Side Panel、用户沙箱或第三方网页；不要使用在线 CDN/JIT 或降低权限边界。视觉更改须附受影响的组件/静态宽度测试；**没有真实 Mac Chrome 实测及候选身份绑定，不得自评“全面 95+ PASS”**。

## 当前目标与范围（用户于2026-10-07明确修正）

本工程的当前主线是旧项目 `/Users/shopme/Documents/workspace/todo-user-vue/src-bex` 的浏览器自动化核心迁移与升级。按明确职责迁入 OpenDesk Browser，保留已约定的公开 API、页面 SDK、公共服务与资源语义，修复执行、目标绑定、异步回程、停止、持久结果和生命周期缺陷，再完成必要真实验收与安装交付。

**不继续完善网页采集、模板、分页。** 不开发采集产品 UI、选区、预览、采集引擎、模板工作流、分页采集或采集业务导出。已有采集模块只允许为框架迁移所必需的薄边界与去耦；保留现状，不擅自删除或补齐业务。

**语音控制不是本期目标。** 用户没有提出该功能。旧来源快照中的 `www/lib/txt2voice.js/css` 不能作为语音产品需求或实现证据，不新增语音输入、识别、指令解析或控制流程。

**任务树只是沟通方式。** 用缩进展示当前解决方案、大任务、小任务、依赖与状态；不开发可视化任务树产品界面。默认使用纯文本缩进，节点名称使用实际功能，不以K/G/CMP编号代替说明。

前两份历史提示词 `new-goal-prompt-implementation-first.txt`、`product-function-tree-and-goal.txt` 中扩展采集/语音/任务树产品目标的内容已被本次用户修正取代；“5/8、63%产品功能覆盖率”作废。保留历史文件和原始证据，不将它们作为需求来源或当前进度。
当前续接提示词：`docs/framework/prompts/goal-src-bex-migration-20261007.txt`。

## 人工网页测试唯一入口（2026-10-08）

浏览器插件手工调试、Sidebar 草稿和现代 Page API 的标准测试页面为 `examples/tasks/demo-form.html`。启动 `python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks` 后，统一访问 `http://127.0.0.1:43111/demo-form.html`；参照 `examples/tasks/README.zh-CN.md` 和 `tests/environment/basic-browser-page.test.mjs`。不要沿用历史会话或旧测试服务产生的临时 `/fixture` 地址，也不要因手工演示入口统一而删除 `tests/prototypes/**/fixture/`、`contracts/fixtures/` 或原生测试专用路由。任何删除必须先核对运行器和证据引用。已在其他会话做过的真实 Chrome 测试，首先核对结果绑定的候选 SHA；没有新增差异就不重复无意义的全量验收。

## AI 自然语言创建扩展的唯一 Workflow 入口（2026-10-15）

用户只用一句话要求新建/完善 Sidebar Tool 时，先读取 [`.agents/workflows/extension-creation.md`](.agents/workflows/extension-creation.md) 恢复已确认需求与进度，再按既有 `.agents/skills/README.md` 选主 Skill；不得重新写第二份总工作流。GitHub 自动推理入口仅在 [`.github/workflows/extension-creation-intake.md`](.github/workflows/extension-creation-intake.md) 中只读接入，权限/安装/升级仍由既有产品机制和用户确认负责；`src/framework/workflow/contract.js` 的网页任务自动化与扩展创建编排不是同一个运行器。

## 实施与验收

按旧功能/旧符号→新职责模块→实际消费者→真实产品入口→必要验证组织任务。每项区分已实施、已有组件证据、已有原生证据、正式关闭与具体缺口。历史 blocker 必须对照当前代码确认，不制造修改，不重新审计已冻结材料以替代实施。

有实际缺口时，先说明文件、预期行为、通过条件，再直接修复并做必要定向验证。无缺口就补真实驱动或推进验收。实现与验证驱动收敛后集中执行同一最终候选的完整验收；不得为观察器小修复反复全量回归。同一失败仅在代码、环境或观察方法明确变化后重试。

保留已批准框架验收合同，包括原603＋19、独立B05、1000 mixed／10 reconnect／2轮禁插件、六项资源baseline、独立最终F3和ZIP安装一致性。若某个具体合同项与最新排除业务范围实际冲突，记录caseId及证据差异；不静默删改分母、不假报PASS，也不为凑分母开发采集业务。

最终成功仅在逐项身份一致的完整原始证据、正式账本关闭、独立最终F3接受、与已验收dist一致的ZIP安装验收通过后成立。组件、旧候选、超时、NOT_TESTED、限定静态review不算正式PASS或最终F3。

## 多 Agent 并行写入与可信边界（2026-10-12 修订）

**默认只有 `main` 可写；同一工作目录允许按文件分工并行编辑，互斥范围是重叠文件、冲突契约和共享资源。** 不得仅因存在其他 Agent、其他文件的未提交改动或无关 HEAD 更新而要求用户确认、暂停整个仓库。未经用户就该任务明确同意，禁止自行创建其他分支、Git worktree 或 PR。只读审计可并行。详细流程及示例见 [并行开发协议](docs/framework/parallel-development.md)；历史单写入/自动隔离要求由本次修订替代。

写入前读取当前文件和相关 diff，并在自己的 `docs/framework/workstreams/` 记录负责人、写入文件/契约、依赖和需要的资源；明确路径，目录范围只在确实需要时声明。不同文件且契约兼容时直接并行；同一文件即使修改不同行，也由一个负责人落盘，其他 Agent 提供建议/补丁或等待交接。消息协议、存储 schema、公开 API、执行入口等跨文件契约由一个负责人协调，兼容消费端可按已约定接口并行。写入前复核目标文件是否漂移；发现他人新增修改时重新读取和协调，禁止整文件回写旧副本、批量格式化他人文件或覆盖他人改动。

`main` 是默认工作分支和唯一正式集成分支。**源码编辑可并行；共享 Git 索引/HEAD 的修改必须串行。** `git add`、commit、stash、merge/rebase、checkout/switch、pull 等修改共享 Git 状态的操作由当次获授权负责人协调，不能与另一 Git 写入同时进行；从暂存到提交核对期间保持同一负责人。commit/push 及另行授权分支上的 PR 操作仍须按当前用户明确授权执行；**不得未经授权直接推送远端 main，不得强推或重置 main**。暂存只指定本任务路径，核对完整 staged diff；不得使用 `git add .`、`git add -A`、`git commit -a` 混入他人改动，也不得擅自撤销他人暂存。远端集成/推送仍由获授权集成者串行核查最新 main、依赖、冲突和必要验证；局部验证不等于正式交付。仓库保护规则应在 GitHub 中配置，文档不能替代服务端保护。

冲突先由当前负责人通过已有授权协作通道拆分、排队或交接，不扩大为全仓库停工；确实无法确定归属、不能安全协调或需要改变用户授权边界时，说明具体阻塞再询问用户。旧记录、沉默和超时不等于当前占用，也不等于释放；需结合实际进程、最新文件和明确交接核实，不自动抢占资源。

`docs/framework/public-owner.json` 是旧的全局 writer 登记及历史交接证据，**不要覆写、伪造释放或修改历史身份**，不以它阻止符合本文件规则的独立工作。真实 Chrome/CFT profile、固定端口、共享数据库、同一路径的 dist/ZIP、最终候选与发布仍按具体资源独占并明确交接。独立输出目录和独立测试资源可并行；已有 `npm run dev` watcher 是 `dist/development` 的写入者，不另起进程覆盖其输出。验证期间仅稳定相关输入及资源，其他源码编辑可继续；前后核对相关文件/依赖/配置和产物身份，出现相关漂移的结果不得登记为当前候选 PASS，只补受影响验证。每个任务只更新自己的工作流和证据，不争抢全局状态文件；另行获授权使用独立分支时，同时记录在对应 PR 中。

旧 `src-bex`、`/Users/shopme/Documents/workspace/opendesk` 及其他来源工程只读。保留工作区差异、旧 receipt 和全部原始证据；不新增依赖，不扩大 ChromePage.js 范围，不恢复旧目录运行树。分支提交不等于发布；没有额外授权不执行 release/publish。冲突要显式解决和审计，禁止 `git reset --hard`、`git clean`、强推他人分支或覆盖并行 `main()` 入口升级。

原 owner 与冻结候选的 sourceFingerprint、product/verification inputs、receipt、dist 和 ZIP 均属于可追溯证据。元数据变化不等于正式验收变更，禁止重写旧 receipt 冒充新冻结。

仅使用受控 CFT、真实 sender、可信原生输入；禁止 DOM 赋值、synthetic events、伪造 native ack 或放宽合同/身份。保留精确 controller-result/runId/resultId、result 自身 revision/sourceHash、retirement released、Save 完整输入观察与唯一真实 native ack。未知 native effect、缺失回执、撤权、document/owner 变化继续保守拦截，禁止盲目重放。

## 跨对话测试复用

执行测试或构建前，先读 `docs/framework/testing-guide.md` 的跨对话复用入口及对应 `docs/framework/workstreams/` 记录，核对其他对话负责人、原始证据和相关输入身份。成功且相关输入/合同/环境未变的结果直接引用，不因新聊天、无关提交或更新时间重跑；有变化只做受影响验证。不同包、组件/原生/AI/F3/ZIP 的证据等级不得互相提升。执行范围及浏览器/端口/dist 资源占用写在自己的工作流，保留失败和 `NOT_TESTED`；不覆盖旧 receipt，不争用其他对话的测试资源。

## 进度表达

首条说明目标、具体缺口、拟修改文件、通过条件。约60秒报告实际成果。任务树使用实际功能名及缩进，每个节点显示实施/证据/剩余任务；编号只作为追溯附注。不得以测试数量或任意等权功能组推导产品完成百分比。


## 侧栏工具可信 UI 与动态沙箱边界（2026-10-13）

**新增目标，尚未代表已实施：** Time Review R1.6 优先试点「**编译期审计的第一方 UI 直接挂载已有 Side Panel**，用户/AI/第三方动态包继续使用现有 opaque-origin iframe」。统一生命周期、Host、Browser SDK、授权存储和后台；不创建新安装器/权限系统。不能以工具 ID、官方市场标签、签名字符串或 `capabilities` 将安装包里的动态 HTML/JS 提权；宿主可用的 `chrome.*` 是**扩展级权限**，只经 SDK 检查不足以阻止进入特权页的任意脚本直接调用。闭包、ESM、Shadow DOM 是工程隔离，不是恶意脚本安全沙箱。当前动态工具路径仍有效，未做真实迁移不得称已移除 iframe。权威规则：[官方预编译 UI 与动态工具隔离决策](docs/architecture/browser-framework/custom-tool-ui-and-local-development.zh-CN.md)；执行入口：[Time Review R1.6 GOAL](docs/framework/prompts/goal-time-review-r16-trusted-native-ui-pilot.zh-CN.md)。
