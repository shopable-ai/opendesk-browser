# 扩展项目目录与测试归属合同

状态：目录设计与渐进整理合同；2026-10-30。本文只规定项目组织和验证选择，整体开发仍走[唯一扩展工作流](../../.agents/workflows/extension-creation.md)。现有项目没有因本文自动迁移，命令能力以实际脚本为准。

## 执行目标与关键条件（2026-10-30 补充）

**总目标：让维护者在扩展的唯一项目中找到业务源码、必要测试、预览和交付入口，用与本次变化相称的验证完成日常修改；减少无关构建与重复检查，保留真实功能及权限保护。** 不以删除多少测试文件、覆盖率数字或目录外观作为成果。

### 目标分解与首轮范围

| 目标 | 要交付的实际结果 | 完成判断 |
| --- | --- | --- |
| G1 归属清楚 | 每个纳入范围的扩展明确唯一 owner、类型、配置、消费者和开发命令；业务源码/测试随项目，公共合同留框架 | README 与实际配置/构建消费者一致；没有同 ID 的第二份正式项目；能找到下一条操作入口 |
| G2 日常验证可控 | 复用或最小修复现有命令，明确区分定向检查、构建、晋升和真实安装 | 单改业务时可以只选相关检查及必要依赖；检查命令不隐式安装、晋升或执行真实业务副作用 |
| G3 测试有效且可维护 | 业务测试按职责归项目，合并已证实重复，保留关键行为与安全负例 | 被整理范围的保留行为逐项有去向；发现入口不漏选、不重复；纯文案/样式不引入新的机械源码断言 |
| G4 有条件的单项目试点 | 后续进入实施阶段时，在最多一个真实项目完成必要入口修复、测试整理及受影响验证 | 不改变工具身份/授权/数据合同；相关结果可复查。规范/模板选择阶段不以启动试点作为完成前置 |

**当前阶段先完善目录存在条件、模板选择和指导入口。** 用最小 HTML、现有 React/Vue、Stay Focus 复杂可信项目及 Page/Task 做静态反例核对；不搬测试、不改 runner、不启动产品。G1–G3 在本轮交付相应规则与可核对入口，不宣称已完成各项目落地。

**后续实施最多选一个试点及其必要依赖。** 只有当前任务进入实际入口修复/测试整理，或新增可执行模板确需验证时才触发；模板只改说明不触发试点。开始时选已有可用入口、具备相关行为测试、没有实际写入冲突且不需要扩权/数据迁移的项目；AI VIP、scrapyjs 不默认作为搬迁对象。按当时的真实 owner/资源状态选定并写进原 README，不能凭此设计宣称已开始迁移。Stay Focus 本轮是复杂结构核对样本，不是业务重构或原生验收目标。

若现有路径参数打包器和定向 Node 命令已满足试点，不强制先改 app:update 或重写 CI。只有它们实际阻断试点下一条操作，才在原模块内最小修复；公共消费者受影响时按影响范围补验证。长期方向可以逐项目推广，但试点完成后本轮即可收尾，不自动扩为全仓迁移。

### 必须同时满足的关键条件

| 条件 | 可核对的通过标准 |
| --- | --- |
| K1 唯一归属 | 首轮范围内所有业务文件、测试与专用 fixture 均有明确 owner；混合测试按职责处理，公共 SDK/宿主接线/跨项目合同保留框架责任 |
| K2 没有无关验证 | 对试点的一次纯业务修改，默认验证中无无关工具的构建和测试；每个保留的共享检查都能说明依赖或安全理由。确有共同依赖变化时按实际影响扩大，不按路径机械跳过 |
| K3 行为保护不缩水 | 整理前记录范围内应保留的行为/安全负例，整理后逐项对照；有明确去向和对应结果才合并/删除。保留已有失败及未测状态，不以删断言、放宽权限换 PASS |
| K4 发现与执行一致 | 迁移后的相关测试在所属执行阶段中被选择一次，无遗漏或新旧双跑；浏览器驱动显式选择，不被 Node 自动发现后启动浏览器、安装或访问用户数据 |
| K5 运行边界不变 | 工具 ID、安装身份、能力、来源 pin、执行世界与撤权/未知副作用保护保持；源路径变化导致 pin 或候选失效时重新绑定受影响证据，不直接继承旧 PASS |
| K6 产物隔离 | 测试和 Mock 不进入安装执行内容；候选、日志、截图沿既有忽略目录，唯一正式包仍按原晋升链管理；不删除历史证据或其他会话输出 |
| K7 变更可控 | 只在 main 修改；不覆盖并行工作，不建分支/worktree；沿用现有 SDK/Host/打包/测试入口，不新增依赖、第二套 runner 或全局登记系统 |
| K8 结论有边界 | 独立评审目录与测试策略的目标为每位 reviewer ≥95/100 且无阻断项；实现是否完成另看真实 diff、相关行为和必要入口证据，设计高分不能代替运行结果 |

### 实施顺序、度量与停止条件

1. **确认试点与必要基线**：核对唯一 owner、下一条操作和现有相关证据；只对将整理的行为记录保留/合并/迁移去向。缺行为保护时先补必要回归，再动文件；路径迁移不另写镜像测试。
2. **解除实际入口阻塞，再整理测试**：先复用现有命令；必要时只修当前路径解析/测试发现或产物定位问题，再按第 7 节迁移。每次只处理一种问题，避免同时重排业务实现和目录。
3. **核对结果并收尾**：对照迁移前后同一组相关行为，核实 import/cwd、CI 发现、源码 pin 和产物内容；缺失的证据如实保留。只因本次变更需要才构建或启动对应浏览器流程。

前后对照只记在原项目 README/原记录中：实际选择的构建与测试、误带入的无关项目、重复/漏选情况、保留行为、已处理文件及未测项。耗时可获得时记录实际值，不预设“减少 50%”等未经基线支持的承诺；文件减少只作附带结果。

**本轮规范完成**：目录存在条件与消费者可核对，模板/AGENTS/Skill 分工明确，当前入口说明不误导，静态反例、链接及 diff 核对通过，两位独立 reviewer 均 ≥95/100 且无阻断项。**后续试点完成**才要求 G1–G4 在选定项目落地、K1–K8 按实际范围核对，且不存在影响核心操作或受影响安全保护的未解决失败。已延期的正式验收保持 NOT_TESTED，不制造全局阻塞。

本轮未启动上述试点实施；无需产品测试、构建或 Chrome。第 8 节原 97/99 分只对应当时评审版本，不覆盖此次目录条件、模板与指导入口变化；本次另做独立复核。明确延期：旧测试搬迁、全仓一次性整理、独立仓库拆分、全量 CI/跨版本矩阵、缩放宽度专项、正式安装发布与全面原生验收。

## 1. 决定与适用范围

**扩展自己的业务源码、测试、预览和专属脚本由同一个项目维护；框架只持有公共能力与跨项目合同。开发验证按本次行为变化选择，不默认全仓测试。** 测试数量不是质量指标，也不能仅因文件多就删除。

| 类型 | 新项目位置 / 现有 owner | 配置与交付 |
| --- | --- | --- |
| 正式 Sidebar Tool 产品 | 新建于 `projects/<id>/`；已有产品以 README、配置及实际构建/Catalog 消费者共同确认原位置 | `tool.config.json`，交付时唯一 `<id>.opendesk-tool.json` |
| Sidebar 教学示例、Starter、最小复现 | `examples/sidebar-tools/<id>/` | 同一种 Tool 配置与打包器，不复制正式产品 |
| Page USER_SCRIPT / Page Program | 沿用实际项目，默认 `examples/programs/<id>/` | 原 Page 配置、Candidate/Authority；不用 Sidebar JSON |
| Controller Task | 沿用原 Controller 项目 | 原 Task 冻结和发布合同 |
| 第一方可信特权业务 | 原产品的 `trusted/`，或尚未提取的必要 `src/<feature>/` | 固定扩展构建与审计；目录名不产生权限 |
| 公共 Framework / SDK | 原平台模块及根测试目录 | 公共 Host、权限、安装、撤权、执行世界与跨产品合同 |

`projects/` 是正式 Sidebar 产品的新默认，不是要求马上搬走所有 `examples/`。这个约定替代旧文档“所有新 Sidebar 工具默认 examples”的笼统表述；不改变 Page/Task 默认位置。不新建独立仓库、第二套 SDK/Host/打包器或全局测试注册表。

## 2. 一个项目，从最小结构开始

最小 HTML 工具的维护基础是配置、README 和配置选中的业务源码；`src/` 是推荐位置，已有合法文件名/结构继续沿用。准备交付时再按原门禁晋升正式包。测试、预览、构建配置按实际需要出现，**不预建空目录，不要求简单工具安装 React/Vite/独立 npm 依赖**。

```text
projects/<id>/                         # 或已核实的现有项目根
  README.md / README.zh-CN.md           # 使用、开发入口、范围、当前限制
  tool.config.json                     # Sidebar Tool 的唯一包清单
  <id>.opendesk-tool.json               # 交付时唯一正式包；不要手改生成内容
  src/                                 # 唯一业务 UI / 纯业务模型
    index.html                         # Classic HTML 片段；具体文件由配置选择
    main.js
    style.css
  tests/                               # 可选：本项目的 Node 行为与契约测试
    model.test.mjs                     # 按能力命名，避免每轮新增 rN 副本
    lifecycle.test.mjs
    helpers/                           # 本项目专用驱动、Mock、fixture
    fixtures/                          # 固定且脱敏的输入；不是运行日志
    browser/                           # 可选：显式调用的真实浏览器驱动
      core.browser.mjs                 # 不以 .test.mjs 命名，避免被 Node 自动发现
  preview/                             # 可选：预览 Adapter/Mock，复用正式 src
  scripts/                             # 可选：本项目构建、预览辅助入口
  assets/                              # 可选：静态资源
  trusted/                             # 仅已有审计合同需要的固定可信业务
  docs/                                # 可选：README 已无法容纳的稳定产品说明
  app.ci.json                          # 按当前 CI 合同需要时声明额外验证
  package.json / package-lock.json     # 仅项目确实需要独立构建依赖时
  vite.config.mjs                      # 仅实际构建需要时
```

这里展示可选位置，不要求每个产品具备整棵树。React/Vue 保留本项目现有 `App.jsx/main.jsx/.vue` 和已配置编译入口；不为匹配文件名重写代码。`tests/` 先平铺，复杂后再按业务模块细分；不强制 unit/integration/e2e 三套空层次。

### 2.1 目录选择与存在条件

**必需**是维护/交付该类型项目的基础；**条件必需**由当前功能、配置、构建、测试或固定入口的真实依赖触发；**可选**是尚无该依赖时可按需要增加；**生成物**和**历史资料**分别描述来源与证据用途，不代表可随意删除。普通工具可选的目录，一旦被已有项目消费，就是该项目的必要组成。下表是选择依据，不能作为删目录、压平复杂项目或批量补空文件的清单。

| 文件 / 目录 | 存在条件与实际消费者 | 提交与安装内容 | 删改需要的证据 |
| --- | --- | --- | --- |
| README、类型配置 | **必需**：README 提供唯一 owner、使用/开发/验证/交付入口；Sidebar 用 `tool.config.json`，Page/Task 用原配置 | 提交；README/构建清单不作为执行源码装入 Tool JSON，获准元数据由原打包器派生 | 核对当前配置、Catalog/构建引用及文档入口；不得换类型或重建同 ID owner |
| `src/` 或原业务源码位置 | **必需**：配置选中的 HTML/CSS/JS 或原编译入口；不规定每个项目必须有同名三文件 | 提交源码；只装入配置选中的合法文件或其编译结果 | 所有 import、配置、哈希与用户行为的去向明确；不能以已有 dist 为由删源码 |
| `tests/` | **条件必需**：已有需保护的行为/安全负例，或本次发现覆盖缺口；Node、项目命令与 CI 是消费者 | 提交必要测试；不进入安装执行内容 | 对照保留行为、失败恢复与负例，更新第 7 节消费者；没有 tests 不自动补一套 |
| `tests/helpers/`、`tests/fixtures/` | **条件必需**：测试确有共用驱动/Mock 或固定脱敏输入；少量 fixture 可同测试平铺 | 提交可复现必要输入；不含账号、Cookie、运行日志；不装入工具 | 查测试 import、相对路径与数据语义；第二消费者未出现前不造公共测试库 |
| `tests/browser/` | **条件必需**：确需项目专属真实浏览器驱动；由明确命令或 `app.ci.json.browser` 选择 | 提交驱动；新驱动用 `*.browser.mjs`，不被 Node 自动发现；不装入工具 | 保留真实入口与身份绑定，查显式调用方；现有 native.tests 留原框架允许路径 |
| `preview/` | **可选；已有预览流程依赖后必需**：适配器/模拟宿主、源码绑定的预览生成器；README/开发流程消费 | 适配源码按原约定提交；生成 HTML 沿原约定，临时快照不提交；Mock 不装入执行清单 | 核对源码/产物来源及实际预览消费者；不维护第二份业务实现，不把 Mock 当安装/原生证据 |
| `scripts/` | **可选；被命令引用后必需**：本项目特殊编译/预览辅助；简单项目直接用原根脚本 | 提交维护入口；不装入 Tool JSON | 查 package/CI/README 调用方；复用已有打包器，不再造 wrapper/模板引擎 |
| `assets/`、`locales.json` 或原语言资源位置 | **可选；功能或配置引用后必需**：图像与显式本地化；不强制目录名 `locales/` | 提交必要资源；仅经现行 `assets` 白名单、`locales` 编译或静态构建选入；不递归装整个目录 | 查配置、JS/CSS 引用、翻译源文案/占位符、来源与许可；保留原能力边界 |
| `trusted/` | **条件必需，仅经审计的第一方合同适用**：固定 SW/Content/可信 UI 入口消费；普通工具不创建它求权限 | 提交审计源码；不动态从 JSON 加载特权代码。纯模型可按已批准的 `files.dependencies` 在沙箱另建实例 | 核对固定导入、构建清单/来源 pin、授权、生命周期与跨工具保护；目录名不授予权限 |
| `adapters/`、`controller/`、`engine/`、`vendor/` 等 | **可选；已有组合职责/固定依赖后必需**：原 import、委托任务、转换引擎或固定第三方来源消费 | 维护源码与必要来源/哈希/许可；按各自类型清单选择，Controller/Page 安装身份独立 | 逐一查消费者、许可、身份与功能；不把整树打入 Tool JSON，不因最小树未列出而删 |
| `docs/`、REQUIREMENTS/ROADMAP/DEVELOPMENT | **可选；有独立稳定内容或特殊链路时保留**：README 链接到唯一说明，不每轮建状态副本 | 提交稳定需求/开发说明；不装入执行清单 | 查导航/引用，区分当前事实、未来规划与历史，不能把历史整体改写成当前事实 |
| 项目级 `AGENTS.md` | **可选**：仅该项目有根规则/README 尚未表达的 AI 写入边界、命令或禁改项时 | 提交短的差异规则；不装入工具，不整段复制根 AGENTS/Skill | 查作用范围和是否仍有差异；具体命令事实由 README 维护并链接，第 2.4 节分工不变 |
| `package.json`、Vite/其他构建配置 | **条件必需**：现有 React/Vue、独立编译或命令实际消费；Classic HTML 无此要求 | 提交真实构建输入；不作为工具可执行字节安装 | 核对脚本、外置 runtime、来源收据及依赖闭包；不强制另装一套 npm/React |
| 锁文件 | **条件必需**：使用依赖管理器时遵从已有根/独立项目锁策略，不要求每个项目再建一份 | 提交原合同要求的锁；不含 node_modules/密钥；不装入工具执行内容 | 查安装/CI 的 cwd、锁与依赖来源；不删除有效锁或用不固定版本代替 |
| `app.ci.json` | **条件必需**：接入 App CI 且 load 要求显式 profile（如声明 React uiRuntime/特定能力），或需自定义 build/browser/native；普通 ui 可用现有默认 | 提交所需 profile；不是安装包。未接入该 runner 的 Page/Task 不套此文件 | 查 `scripts/app-ci.mjs` 的 load 与实际阶段、build/profile/驱动路径；不能用删 profile 绕过必需验证 |
| `<id>.opendesk-tool.json` | **交付时必需的生成物**：Sidebar 安装/离线 Catalog 消费，项目中只保留唯一正式包 | 门禁通过后与匹配源码提交；它就是可安装包。文档/测试修订不默认重打 | 只能走原候选→测试→同源晋升→check；不得手改、删旧包再生成或冒称已安装 |

| 生成物 / 历史资料 | 消费者与存在条件 | 提交 / 打包 | 清理或重建条件 |
| --- | --- | --- | --- |
| 项目 `dist/`、`build-ready.json` | 构建输出；配置若指向 `dist/tool.js/css`，相应产物与有效来源收据是打包/源码预览的**条件必需输入** | 通常忽略；已跟踪产物沿原合同，不借本次批量改忽略。只选入合法 JS/CSS，收据不装入执行清单 | 确认可重建、输入完整、无其他 writer/消费者；不把“生成”解释成正在使用时可删，也不手补旧 SHA |
| `.opendesk-preview/` | stage/watch 生成的只读来源锁快照，预览与开发流程消费 | 本机忽略；`STAGED_NOT_INSTALLED`，不是第二正式包 | 确认预览会话/快照 owner 与引用；不清理他人快照，不以其替代正式晋升 |
| `artifacts/`、日志/截图/TAP | 按现有用途/ID 隔离的临时候选与执行结果；CI 可能消费固定路径收据 | 新运行输出通常忽略；固定跟踪输入/历史证据维持原合同；不进入安装内容 | 查当前会话、CI 路径、来源 pin 和证据引用；未知先保留，不覆盖并行 watcher/输出 |
| 已有 `evidence/`、发行账本/验收报告 | **历史资料**或仍被测试/CI引用的固定输入；可能不是可再生产物 | 保留已有跟踪/忽略合同；脱敏且稳定的测试输入可提交；不装入工具 | 明确每项消费者和保留行为后才能合并/清理；不因旧日期、失败或文件数删除，也不继承其旧 PASS |

删改任何已被消费的目录前，至少确认“谁读它、由谁生成/维护、替代后何处继续证明同一行为及保护”。本轮只补规则，不执行目录清理、移动测试或改忽略项。

### 2.2 复杂项目反例：Stay Focus

2026-10-30 只读核对：[`projects/stay-focus/`](../../projects/stay-focus/README.zh-CN.md) 的一级目录是 `src/`、`trusted/`、`preview/`、`dist/`，另有配置、需求、package/Vite/CI 与唯一正式 JSON。配置选中 `src/index.html` 和 `dist/tool.css/tool.js`；[`vite.config.mjs`](../../projects/stay-focus/vite.config.mjs) 与原 [`build-stay-focus-react.mjs`](../../scripts/build-stay-focus-react.mjs) 绑定源码/产物收据；Catalog 指向同一 owner。

`trusted/` 中策略、DNR、计时、生命周期、限制页与可信 React 控件被 `src/sw.js`、`src/entrypoints/`、`scripts/prepare-public.mjs`、`src/ui/react/tabs/trusted-settings.tsx` 等固定入口消费；其中纯模型也可能被 UI 编译引用，不能按目录名判执行世界。`preview/` 有模拟运行环境和生成器，不能假定旧 HTML 已绑定当前 dist。已有 README 的 R2/R5 历史路径/版本不作为当前命令；当前入口单列，预览同步与真实安装运行均未在本轮验证。

这些目录的必要性来自真实消费者，不能用最小 HTML 树删掉或压平；也不能要求其余工具复制这套复杂结构。

### 2.3 模板选择：复用已有 Starter

本轮选择**已有示例 + 最小说明**，不新增 `templates/` 资产、脚手架 CLI 或模板引擎：已有起点能覆盖本次选择需要，没有发现新资产才能解决的重复工作。

| 起点 | 用途与选择条件 | 不能直接继承的部分 |
| --- | --- | --- |
| [`runtime-globals-demo`](../../examples/sidebar-tools/runtime-globals-demo/) | 最小 HTML/CSS/Classic JS，配置直接选 src；适合不需组件编译的工具 | 演示 ID/版本/能力与业务；新项目按需求设置最小能力，不复制正式 JSON/预览快照 |
| [`react-starter`](../../examples/sidebar-tools/react-starter/README.md)、[`vue-starter`](../../examples/sidebar-tools/vue-starter/README.md) | 用户选择该框架或确有组件需求时，复用已有源码与本地预编译模式，再走同一 Tool 打包器 | 先查各自配置和依赖/运行时模式；不把 Starter 的自带依赖等同于所有工具默认的 Shared UI，也不复制旧 dist/收据/包身份 |
| [`scripts/templates/`](../../scripts/templates/) | `sidebar-preview.html` 由 [`sidebar-preview-kit.mjs`](../../scripts/sidebar-preview-kit.mjs) 消费；`sidebar-tool-preview-shell.html` 由 [`preview/build-preview.mjs`](../../scripts/preview/build-preview.mjs) 等原预览入口消费 | 设计稿/源码预览壳不是项目源码模板，不生成配置、安装身份或权限，不能替代正式 src/当前候选 |
| 原有复杂/组合项目 | 已有功能迭代直接沿其唯一 owner 与命令；仅借鉴需要的结构 | 不复制 Stay Focus 的特权入口、私有能力、Controller 身份或整个 vendor/engine 树 |

创建时先选类型和 owner，再选最小起点，只带入需要的源码/配置；更新 ID、标题、版本、最小能力和资源引用，并复用实际锁策略。需要 tests、preview、assets、locales 或特殊命令时再加；README 交代可选扩展位置和触发条件，不预建空目录。后续若出现现有示例不能表达的真实重复需求，再以具体消费者和缺口决定最小模板资产，不凭统一外观建立基础设施。

### 2.4 根规则、项目指导与 Skill 分工

- 根 [AGENTS.md](../../AGENTS.md)：跨类型的 owner、main/并行保护、安全与阶段约束，并链接本文；不复制目录细表。
- 项目 README：当前配置、构建/开发/定向验证/交付命令与限制的唯一入口；历史分段标日期，不用旧路径指挥下一步。只有稳定特殊开发链路过长才链接原 DEVELOPMENT。
- 项目 `AGENTS.md`：有项目独有 AI 边界才添加短的差异规则并链接上述事实。简单工具不强制创建；复杂也不自动要求。本轮 Stay Focus 的命令/可信边界由原 README 与可信 Skill 足以表达，无需新增 AGENTS。
- 现有 [Skill 路由](../../.agents/skills/README.md)与[唯一工作流](../../.agents/workflows/extension-creation.md)：按类型发现、选择、开发与交付，目录细则链接本文。开发、打包、可信功能入口同步当前 owner 和适用条件；不为目录工作新增重复 Skill，也不改内置系统 Skill。

组合项目已有 `adapters/`、`controller/`、`engine/`、`vendor/` 等职责子模块时按原合同保留；第三方固定来源、哈希及许可继续随依赖维护。一个项目可以含 Sidebar UI 和受委托 Controller，但二者配置、安装身份、源码摘要及 Authority 各自独立，不能把整棵项目树塞进 Tool JSON。正式 Page 项目例如 `projects/chatgpt-mindmap/` 也保持实际 owner，不因默认示例路径而迁回 examples。

`tool.config.json.files`、dependencies、assets 选择安装内容；不是递归打包整个目录。测试、Mock、日志不能进入执行文件清单。`trusted/` 代码只有通过原静态入口审计编译才有对应执行身份，不能从安装 JSON 动态导入特权世界。预览只做代理和模拟数据，不维护第二份产品实现。

运行日志、截图、TAP、候选包、临时源码副本优先复用已被忽略的根 `artifacts/<用途>/<id>/`；已有 `.opendesk-preview/`、项目构建 `dist/` 保持原约定，不主动清理其他会话输出。稳定测试输入可以提交；原始运行输出不因放进 `tests/` 就成为源码。已有 `evidence/`、验收报告及被测试/CI消费的固定收据保留，不通过改忽略规则追溯删除。摘要优先更新原 README/原证据索引，不每轮另建一份状态报告。

## 3. 测试按责任归属

| 测试证明什么 | 归属 | 处理原则 |
| --- | --- | --- |
| 一个工具的表单、数据转换、业务状态、存储恢复、UI 操作 | `<owner>/tests/` | 工具与测试一起维护；现有专用 fixture 一起迁移 |
| 一个可信产品的业务策略、清理规则 | `<owner>/tests/` | 即使被测源暂在 `src/<feature>/`，仍由业务 owner 负责 |
| 公共 SDK/包 Schema/CSP/身份/权限/安装撤权、公共 Shared UI | 根 `tests/` 现有分区 | 以公共合同命名；用最小项目作 fixture 不改变框架归属 |
| 宿主与某工具的固定编译接线或多个工具共存 | 根 `tests/` | 只保留接线、权限与跨项目不变量；工具表单细节拆回项目 |
| 项目专属浏览器预览操作 | `<owner>/tests/browser/*.browser.mjs` | `app.ci.json.browser` 显式引用；现有可用驱动先保留原路径 |
| 当前 Mac 原生验收驱动 | 现有 `tests/framework/` | 当前 CI 的 native.tests 只允许此处；不移动后声称仍可发现 |

**不能按文件名前缀整体搬迁。** 例如 `ai-vip-share-r5-ui.test.mjs` 同时断言工具内容和宿主接线，需要按测试职责拆分；`sidebar-shared-ui-r16.test.mjs` 验证公共 runtime、React 复用和离线边界，应留框架。项目 fixture 只有在真实第二消费者出现时才提取到原共享 helper，不能为了路径统一建立万能测试库。

## 4. 控制测试增量

新增或改写测试前，用一句话说明：**哪个用户行为/安全合同会回归，现有哪个测试尚不能证明它**。写在变更说明或原测试注释即可，不建新表单或逐命令台账。

- 优先扩展现有行为测试或参数化数据；不要因 R5→R5.1 就复制一套文件。
- 可逆的文案、间距、普通样式调整，不专门新增匹配字符串/类名的测试；已有组件检查能证明时直接复用。
- 状态、持久化、错误恢复和真实缺陷，按风险补能复现问题的最小行为回归。
- 源码正则只适合少量无法在当前层直接执行的静态边界，例如禁止远程代码、固定编译入口或来源 pin；标明证明范围。不得以它证明点击成功、授权生效或真实 Chrome PASS。
- 不用测试锁死整个 JSX 写法、版本号、完整长文案、文档措辞或某个函数的内部实现。确属发行身份或安全关键文本时保留明确理由。
- 不按测试总数、覆盖率数字或评分目标补用不上的用例；也不通过删掉失败断言、权限保护或旧失败证据换取 PASS。

已存在的文件分别决定“保留 / 按责任拆分迁移 / 语义合并 / 人工操作说明 / 有证据后删除”。合并须核对触发、输入、结果、失败恢复和安全负例；相同场景名字不证明冗余。未知先保留，不能把“本次不运行”误写成“永远无用”。

## 5. 开发、CI、交付分别选验证

| 当前变化 | 默认最小验证 | 扩大的条件 |
| --- | --- | --- |
| 目录设计、文档、Skill | 内容、链接、diff 一致性 | 不启动产品、构建、测试套件或 Chrome |
| 可逆文案/样式 | 受影响的现有预览/组件或正常可见操作，按需做语法检查 | 出现具体操作故障才加对应检查 |
| 业务行为/数据 | 对应文件的 Node/DOM 回归，必要的最短真实操作 | 共同依赖或存储合同确实变化 |
| 权限、来源、身份、执行世界、撤权、未知副作用 | 对应正向行为及拒绝/停止/恢复保护 | 真实权限或生命周期依赖 Chrome 时验证受影响原生链，不拿 Mock 替代 |
| 正式包、安装或发布 | 原候选→验证→同源晋升→版本/身份检查，适用的安装审阅与原生证据 | 只在本轮交付范围或原正式合同适用时执行 |

日常从仓库根直接选已有文件，例如：

```sh
node --test examples/sidebar-tools/ai-vip-share/tests/cookie-journal.test.mjs
# 单个行为可再加 --test-name-pattern，文件选择仍保持明确
```

这只是命令示例，不代表本文执行了它。已有项目 package.json 的命令可复用，但先确认它没有无关 pretest/build。根 `npm test` 当前会触发 `pretest` 并扫全部 environment 测试，是较广的仓库入口，不是单工具开发默认。目录变动本身不触发正式包重建；字节、来源 pin 或构建合同受影响时，按真实影响验证。

CI 是提交后的回归保障，开发是定位本次变化，两者不使用同一默认测试范围。公共能力变化不能仅按项目路径选择测试；按实际消费者和安全合同确定影响闭包，不能为了减少 CI 数量跳过受影响保护。

## 6. 当前支持与明确缺口

以下是 2026-10-30 的源码核对，不是命令执行或产品验收结果：

| 入口 | 当前支持 | 约束 / 后续动作 |
| --- | --- | --- |
| `scripts/app-ci.mjs` | 扫描 `projects/` 与 `examples/sidebar-tools/`，拒绝重复 ID；递归发现项目 `tests/**/*.test.mjs`，与 profile.node 去重 | 最深 5 层、最多 100 文件是现有安全预算，不是建议用满；Node 自动发现范围内只放无真实浏览器/安装副作用的测试 |
| 同一 CI 的 browser/native | browser 可引用项目内 `.mjs`；native.tests 限定 `tests/framework/*.test.mjs` | 浏览器驱动须显式声明；暂不迁 native 驱动、不静默放宽路径检查 |
| 同一 CI 的 `node` 子命令 | 运行公共 BASE_TESTS 与项目测试，然后检查候选收据 | 依赖前面的 build 产物；不是无需构建的本地快速入口 |
| 同一 CI 的 plan | 根 `tests/`、`scripts/`、`src/` 等变化会选择全部应用 | 路径过宽是候选优化点；迁本工具测试后可减少部分无关选择，不能声称已实现精确影响分析 |
| `scripts/build-sidebar-tool.mjs` | 接受实际项目路径，按配置选文件，原打包器负责同源晋升 | 不创建第二打包器；移动构建输入后原来源证据可能失效 |
| `scripts/app-update.mjs` | 目前固定解析 `examples/sidebar-tools/<id>/`；只运行硬编码的部分根测试 | 尚不支持任意 projects owner，也不自动发现项目 tests；不能用“app:update 成功”替代项目业务验证。迁移前由平台 owner 最小修复该入口，或使用原路径参数打包/晋升命令并显式执行相关项目测试 |
| Page / Controller | 各自已有配置、验证与安装链 | Sidebar app-ci 发现规则不自动适用；在原项目 README 显式保留定向命令，不伪造统一 runner |

## 7. 渐进整理顺序与完成标准

本次先交付目录合同并接入已有指导入口；**未执行旧测试搬迁、合并或删除，也未修改 runner/CI 行为**。后续每次只整理一个已取得写入归属的业务范围：

1. 从真实 README/配置/消费者确认唯一 owner；检查该项目及目标测试是否正被其他会话修改。冲突仅暂停对应文件，不停无关工作，不建分支或 worktree。
2. 列出该范围现有测试要保留的行为与安全负例，先锁定缺失的必要回归，再移动/拆分；纯路径迁移不另造一套镜像测试。
3. 更新 import、基于 `import.meta.url` 的 fixture/源码定位、运行 cwd、`app.ci.json`、GitHub paths、脚本引用、README 和来源 pin 的实际消费者。新旧只保留一份测试实现；历史证据中的旧路径保留历史语义。
4. 运行迁移前后同一组相关测试，核对被发现的文件及行为未减少、无重复运行；必要产物检查以实际输入变化为依据。新失败先分清产品/断言/环境，不扩大到全仓修复。
5. 确认没有测试/Mock 混入包内容、无能力或执行世界变化，核对 diff 与并行改动，再保存同一次 main 变更；只有正式包实际变化才进入原晋升与版本合同。

优先级：先阻止新增散落业务测试；其次按 owner 处理正在维护的工具；最后只在相关维护触发时整理历史文件。`ai-vip-share` 当前业务与测试均有并行改动，暂不移动；`bookmark-manager` 的正式 owner 是 `projects/bookmark-manager/`，残留 examples 路径不构成重建授权；`scrapyjs` 当前源码没有正式 Catalog 记录，按它自己的配置/README维持项目，不借本次设计启动采集产品工作。

验收必须能回答：项目是否只有一个正式 owner；下一次改业务是否只需打开该项目；Node 测试是否可明确选取且被 CI 发现；真实浏览器是否显式启动；公共权限/生命周期保护是否保留；产物是否隔离；迁移是否可追溯且没有改变工具身份。仅有新目录树不算迁移完成。

## 8. 证据与设计评审

只读审计快照：当时工作区 `tests/environment` 根有 628 个 `*.test.mjs`，Sidebar examples 项目递归有 49 个（排除 node_modules、.opendesk-preview，其中 43 个在各自 tests 子树）。这是含未跟踪文件的文件数量，不是执行数或覆盖率；没有把 projects 下测试混入该口径。抽样发现工具内容/宿主接线混合测试、精确重复断言和过度绑定源码顺序的检查，证明需要按责任收敛，不能证明所有测试过量。

审计另发现 AI VIP 的会员测试读取 `artifacts/sidebar-tools/.../candidate`，而通用 CI 构建写入 `artifacts/app-ci/.../candidate`；干净环境是否失败尚未运行验证。scrapyjs 声明 React runtime 却没有 app.ci.json，当前通用 CI 的显式 profile 要求不满足。二者作为原 owner 的具体待办，不在本文假报修复，也不触碰正在并行修改的文件。它们不改变新目录设计，但相应项目的自动执行状态不能报 PASS。

源码依据：根 [package.json](../../package.json) 的 pretest/test；[app-ci](../../scripts/app-ci.mjs) 的 projects/ownedTests/load/plan/testNode；[app-update](../../scripts/app-update.mjs) 的 updateApp；[唯一打包器](../../scripts/build-sidebar-tool.mjs) 的 create/promote；[正式 Catalog](../../official-tools/catalog.json) 的 project；[现行测试指南](../framework/testing-guide.md)。测试分类样例：[混合工具/宿主测试](../../tests/environment/ai-vip-share-r5-ui.test.mjs)、[公共 Shared UI](../../tests/environment/sidebar-shared-ui-r16.test.mjs)、[项目内行为测试](../../examples/sidebar-tools/ai-vip-share/tests/cookie-journal.test.mjs)。

本次补充的静态反例核对（只读源码/配置，不是运行结果）：

| 样本 | 核对到的边界 | 对本设计的约束 |
| --- | --- | --- |
| [最小 HTML Demo](../../examples/sidebar-tools/runtime-globals-demo/tool.config.json) | 直接选 src，无项目独立 npm/Vite | 不强制构建依赖、CI profile、空测试目录或项目 AGENTS |
| [React Starter](../../examples/sidebar-tools/react-starter/tool.config.json) / [Vue Starter](../../examples/sidebar-tools/vue-starter/tool.config.json) | 配置 ID 与目录名不同；自带固定框架依赖，预编译 IIFE/CSS 与来源收据 | 不沿用示例身份，不复制旧产物，不把一方修改变成双 Starter 必跑，也不冒称 Shared UI |
| [Stay Focus](../../projects/stay-focus/tool.config.json) | src UI、trusted 固定入口、preview 模拟与 dist 输入各有消费者 | 允许复杂目录，生成物可能是当前必要输入；旧预览不自动等于当前可安装 UI |
| [Mindmap Page](../../projects/chatgpt-mindmap/package.json) | 正式 owner 在 projects，Page USER_SCRIPT 配置/站点与资源合同 | 不因新默认 examples 或最小 Sidebar 树搬家/改类型，不用 Tool JSON 与 App CI 代替 Page 安装链 |
| [零参数 Controller](../../examples/programs/controller-globals-zero-arg/package.json) | 原 Controller 配置、受控 page/Locator 与独立冻结合同 | 不注入 Page DOM/Sidebar bridge，不复制 Sidebar 身份/包格式 |

独立评审采用同一 100 分量表：所有权与类型边界（含目录存在条件）20；测试归属与有效性 20；开发验证成本 15；现有入口、模板/指导分工与缺口诚实性 15；权限/生命周期/产物隔离 15；渐进迁移与并行安全 10；证据与完成边界 5。每项扣分须引用具体缺陷；有丢失覆盖、隐藏扩权、绕过安装审阅或伪造验证等阻断项时不通过。

目标：两位独立 reviewer 各自 ≥95/100 且无阻断项。分数只评价本文的架构设计；不评价产品运行、已完成迁移或真实 Chrome。

2026-10-30 **此前版本**的两位 Codex 原生子 agent 分别独立读源评分，并在作者修订后只读复核；保留原分数，不因修订抬分（不覆盖本次新增内容）：

| 评审 | 七项得分（顺序同上） | 总分 | 修订后结论 |
| --- | --- | --- | --- |
| Architect / Faraday | 18、20、14、15、15、10、5 | **97/100** | CLEAR，无阻断；当前 owner 旧引用与后续验收触发歧义已解决 |
| Critic / Nietzsche | 19、20、15、15、15、10、5 | **99/100** | OKAY，无阻断；Skill 索引旧 owner 引用已解决，无新增阻断 |

复核同步了 Prompt Shortcuts、Stay Focus、Mindmap 的当前项目引用，保留历史记录原路径；补充组合项目子模块和独立安装身份。本文及接入文档只做了内容/本地链接/差异格式核对；没有运行产品测试、构建、浏览器或迁移。目录迁移完成、runner 改造及原生验收继续分别为 `NOT_IMPLEMENTED / NOT_TESTED`，不能由设计评分替代。

### 本次目录条件、模板与指导入口复核（2026-10-30）

本次复核按修改前镜像与当前文件逐项比较，排除 main 上其他 owner 的并行改动；两位 reviewer 各自读源检查第 2 节新增内容、上述静态样本及本轮指导修改，不继承前表分数。

| 独立评审 | 七项得分（顺序同上） | 总分 | 修订后结论 |
| --- | --- | --- | --- |
| Architect / Rawls | 20、20、15、14、15、10、5 | **99/100** | CLEAR，无阻断；通用文档首次安装建锁的旧指令已改为复用有效锁、以 Starter README 为准 |
| Critic / Curie | 20、20、15、14、15、10、5 | **99/100** | OKAY，无阻断；打包 Skill 已在首屏命令前说明 app:update 的 examples 限制，projects 走原路径参数链 |

两处问题修订后均经对应 reviewer 静态复核，保留原分不因修订抬分。源码/配置引用、此次新增/调整本地链接目标与锚点、diff 格式已核对。开发 Skill 原有 `sidebar-tool-title-r22-local-20261026.md` 历史证据引用目标缺失，未发现可靠替代，保留为历史引用缺口；不宣称全库历史链接有效。Stay Focus README 只修正移动后多退一级的证据链接，不改其历史候选/版本内容。

本轮沿用已有 HTML/React/Vue 示例与两类预览壳，只改说明；未新增模板资产、模板引擎、Skill、项目级 AGENTS 或依赖。已有 knowledge-inbox AGENTS 的无条件双构建要求已对齐根阶段规则。业务代码、测试、runner、构建配置及正式包没有因本轮修改；旧测试整理、G4 试点、构建/预览同步、Chrome/安装发布与全面原生验收均未执行（`NOT_IMPLEMENTED / NOT_TESTED` 按各自性质保留）。本次 99 分只评价规范与指导设计，不证明项目运行、迁移或原生通过。
