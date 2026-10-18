# 扩展运行环境 R1：源码核查与普通开发者指南

- 负责人：当前扩展运行环境 R1 对话；并行子任务只读核查源码与文稿。
- 日期：2026-10-18；状态：COMPLETE（文档/Skill 工作完成；运行验收未执行）；占用资源：RELEASED。
- 用户目标：按需求选择开发类型，并能解释独立扩展多个 JS 的组织、加载、权限、通信和停止。
- 分支：真实 GitHub `shopable-ai/opendesk-browser` 的 `main`；没有新建分支、Worktree 或 PR。
- 环境：本会话不能访问 `/Users/shopme/Documents/workspace/opendesk-browser`。通过 GitHub 固定提交读取、最小提交；不宣称已更新用户 Mac 工作区或 Chrome。
- 资源：未使用 Chrome Profile、Native、端口、dist、用户数据库或构建 watcher；未修改运行代码、正式工具包或公共权限合同。

## 1. 当前读者入口与实际交付

普通开发者只需先看 [四类需求与多 JS 指南](../../api/extension-development-selection.zh-CN.md)，再按选定路线阅读原 API。网页自动化、网页增强、侧栏应用和组合式产品先按需求解释；Background/Worker 等机制放后面。指南包含上手路径、六个概念的区别、项目声明、按钮执行链、Stay Focus 流程图及停止/更新边界。

本轮复用并增补已有指南与 Skills，没有新建第二套规范、Skill、Host、运行器、SDK 或扩展中心。

| 文件 | 实际修订 |
| --- | --- |
| [extension-development-selection](../../api/extension-development-selection.zh-CN.md) | 四类需求与安装入口；六概念；多文件/单文件分流；Stay Focus、Prompt 真实代码和生命周期；五个对照例子；解耦与未实现边界 |
| [runtime-globals](../../api/runtime-globals-and-preinstalled-libraries.zh-CN.md) | 连接指南；区分示例目录与受审构建入口；纠正工具变量/Shared UI 与旧导航；修复过时锚点 |
| [sidebar-tool-development](../../api/sidebar-tool-development.zh-CN.md) | v2 依赖顺序、固定 Shared UI、独立 Root、生命周期、源码和可安装包的分工 |
| [sidebar-tools API](../../api/sidebar-tools.zh-CN.md) | 对齐 v1/v2 源清单与运行包字段；Classic 可复制示例改为真实点击的 async 处理器；历史启停与缺失回执说明 |
| [page-userscript](../../api/page-userscript.zh-CN.md) | JSX/SFC 的 Developer 与 Standard 适用范围；修复旧框架教程锚点 |
| [sidebar-local-projects](../../api/sidebar-local-projects.zh-CN.md) | 当前“安装网页增强”按钮与“扩展”导航；历史 Controller 证明复用限制；缺失历史记录不再作为可点击验收凭据 |
| [extension-runtime Skill](../../../.agents/skills/opendesk-extension-runtime/SKILL.md) | 需求路由、真实 Host/Worker、Page 启动/清理未知、共享模型与权限、文档验证分支 |
| [script-authoring Skill](../../../.agents/skills/opendesk-script-authoring/SKILL.md) | runtimeKind/entry、显式 Run、Page Stop 与安装停用分开、未知清理恢复、作者公开合同优先 |
| [sidebar-tool-dev Skill](../../../.agents/skills/opendesk-sidebar-tool-dev/SKILL.md) | 多环境模块、JSON 更新边界、DNR/idle 权限纠错、沙箱 Root、公开全局与元数据格式 |
| [trusted-sidebar-feature Skill](../../../.agents/skills/opendesk-trusted-sidebar-feature/SKILL.md) | R2 已完成与 R4 未实现分开；信任接入和业务耦合；不同停止操作与 owner |
| [program-publish Skill](../../../.agents/skills/opendesk-program-publish/SKILL.md) | 直接编辑/目录 CLI 优先，MCP 为可选高级分支；ESM edition 与最小验证入口一致 |
| 本记录 | 范围、基线、发现、验证、评分与后续责任 |

原范围为指南、两份 API、四份 Skill 和本记录。只读场景审阅发现已链接材料的真实冲突后，已先在 main 扩充范围，再最小修改另外三份 API 与发布 Skill。API README 与创建工作流的并行导航修改保留，未再编辑。

## 2. 源码基线与并行保护

- 初始核查基线：`4311d0ab8794d9ee092582ce464840cab8069f3a`。
- 复用并行指南提交：`224062ec7202b7d7f69d60aa20c3762037ecba23`；本轮未另建指南。
- 已跟进 `03d46494de1fb360f1f3051541d912a2a82420bd` 的 AdBlock React/Shared UI 正式包和真实请求接线；不再沿用“仍是原生 UI”的旧结论。
- 文档链接与新增安装 UI 核查基线：`3f13d0d50b6702ab9e549d89ed17117f5003a6b4`；随后比较至 `8e9e10fd45c387c8494ec1f73263c8775c920f7c`，后续涉及 Quick Notes 测试、工作记录、Native 工作区 i18n，未改变本轮目标文档和已核查产品入口。
- 范围登记提交：`35dd0f4342232ab2dd469c9cd5534c165d264650`；补充范围提交：`b46b6443d037f5bd683175ab408ac6c3f469463e`。
- 每次写入以最新父提交、`expected_sha` 与 `force:false` 更新 main。更新响应未知时先读回真实 HEAD/文件和差异，确认未写入后才重建补丁；未强推或盲目重放。
- 最终文稿提交前再次比较 main 及目标文件原文；并行产品/工作记录/i18n 改动保留。最终提交身份由本文件 Git 历史和交付报告提供。

## 3. 已核实的运行链

| 事项 | SOURCE_CONFIRMED 的证据与结论 |
| --- | --- |
| 声明与编辑器分流 | `scripts/validate-program-project.mjs` 仅接受 controller/page-userscript；`src/ui/local-project.js` 核验 runtimeKind、binding/provider、源码身份；`src/ui/script-editor.js` 按真实按钮分发 run.start/page.preview，保存不执行 |
| Controller | `src/run-host.js` 属于实际扩展文档，经 opaque iframe 创建受控 Worker；pagehide/dispose 停止自己的运行。SW Authority 管身份和结果，不能恢复时重放旧控制流 |
| Page | `src/scripting/user-scripts/preview.js` 单文档 execute；`installed-programs.js` 先 register 固定 bootstrap，再核验安装/文档后 execute；正式自动入口为顶层 document_idle。预览 Stop 不改安装状态，安装停用/卸载另撤销后续启动；受管清理可能 unknown，任意效果不保证回滚 |
| 固定入口 | `wxt.config.mjs` 移除基础 Manifest 的旧 Background 声明，再从固定 entry 生成唯一 SW；`src/entrypoints/background.js` → `src/sw.js`；page-relay 是 ISOLATED，sdk-main 是 MAIN |
| Stay Focus R2 | `examples/sidebar-tools/stay-focus/trusted/` 已是唯一业务源；旧 `src/stay-focus/*.js` 只转发。UI interval 是刷新显示；service 的事件/Alarm/持久状态与 DNR 不依赖 UI 常开 |
| 工具多 JS / React | 打包器将 v2 dependencies 保留为 scripts，bridge 校验 SHA 并按顺序加载，最后运行主 js；Prompt 纯模型在沙箱和网页分别实例化。AdBlock 的独立 App/Root 与固定 uiRuntime 已进入当前正式包，不进入主工作台 Root |
| 本地安装 | `src/ui/local-project-install-ui.js` 当前 Page 标签为“安装网页增强”；Page 预览不能跨侧栏会话直接复用。Controller 历史 proof 限相同来源、原目标和成功持久回执；Page 正式 Verify 可再次执行冻结源码 |

可点击源码入口集中在 [指南维护者附录](../../api/extension-development-selection.zh-CN.md)，不再复制整套 API 规范。Chrome 官方 SW 生命周期与 userScripts 语义另经官方文档只读核对；未把官方支持等同本候选已运行。

## 4. 正确边界、真实缺口与后续 owner

| 项目 | 本轮结论 / 后续 |
| --- | --- |
| 固定可信接入 | 产品自己的 service/page/controls 经固定构建接入是正常机制；是否耦合取决于真实消费者和业务归属，不按 src/examples 目录判定 |
| Stay Focus 参数与后台升级 | 已有受审 focus.* 可以修改服务支持的参数；JSON 不替换固定计时、DNR、提醒、权限适配或阻止页实现。源码提取完成不等于独立后台升级完成 |
| 最小公共能力候选 | 沿 [Stay Focus R4 唯一需求](../../../examples/sidebar-tools/stay-focus/REQUIREMENTS.zh-CN.md) 评估有界网站观察、持久预算/时段、应用自有访问规则和状态撤销；复用 Registry/Schema/Host/Chrome Driver。候选尚未实现/验收，没有可调用的新 API；现有 scheduler 面向已安装 Task |
| Stay Focus 清理与交付 | 停止本次专注不等于停用全部限制；停用保留设置/使用数据，卸载删除 FOCUS_STORE 并清理/回读自有 DNR。FOCUS_SESSION 未见显式删除；由产品 owner 确认期望与最小清理方案。项目根正式 stay-focus.opendesk-tool.json 尚未提交，原打包/安装任务继续，本轮不生成包 |
| Stay Focus 产品说明差异 | 现有 README 的旧“工具”导航、idle/DNR 可选权限描述和停用/卸载数据概括需产品 owner 同 R4 整理；指南/通用 Skills 已按 Manifest 和真实清理链明确当前事实，不重复写入并行产品文件 |
| Time Review | src/time-review 是真实可信业务，非兼容转发；通用 sidebar-tools.js 中 time.* 私有处理、installation.js 直接清理 TIME_REVIEW_KEY 是具体归属缺口。交已有 Time Review 任务提取，不重构公共安装器/SDK |
| Cookie Editor | 正式 v2 工具通过授权 cookies SDK 到通用 Chrome Driver；该公共能力本身不是业务耦合。src/ui/react/cookie-editor 的产品视图仍未回归独立项目，项目 JSX 是转发；交已有工具任务，不把试点当正式 React 迁移完成 |
| 历史证据缺失 | 当前 main 缺少 developer-project-catalog-stability-20261016.md 和 browser-sdk-r13-acceptance.json；移除失效链接、保留缺失说明，不用后续其他候选替代旧证据 |

## 5. 定向验证结果

本轮仅改文档/Skill，按根 AGENTS 与 [测试指南](../testing-guide.md) 选择链接、示例、事实和 Skill 校验；没有运行产品测试、构建或原生安装。

| 验证 | 结果与实际范围 |
| --- | --- |
| 文档相对链接 | DOC_LINK_PASS：241 处相对链接、121 个不同文件目标、8 个不同标题锚点全部有效；以 8e9e10fd45c3 固定 Git tree 与实际标题核验。已纠正两处旧锚点和两处缺失历史记录链接 |
| Skill 元数据 | 5/5 合法；采用 Skill Creator 的 quick_validate.py。修复 sidebar-tool-dev description 的尖括号路径示意，不改 Skill 名称 |
| JSON 示例 | 5 个 JSON 代码块可解析；Prompt 配置摘录与真实 format/files 一致 |
| 源码摘录与字段 | 5 项精确核对：Prompt 配置、网页 import、Controller 元数据、Page 元数据、Manifest 必需 DNR/可选 idle |
| Classic 示例 | SYNTAX_PASS：Node --check（CommonJS/Classic 输入）退出 0；只解析文档代码，不执行读写、DOM 或 Chrome 操作 |
| 模型只读源码审阅 | 两轮核心链与增量核查；纠正 Page Stop/安装停用/unknown 过度概括，未留下已识别的运行机制错误 |
| 模型场景试读 | 六题覆盖 Controller、React Page、多 JS Sidebar、专注组合产品、模型复用、既有工具身份/Root；发现的编译、MCP、导航、示例和恢复冲突均已修订 |
| 产品 Node 测试 / 构建 | NOT_RUN：运行代码未变，本轮无需运行；没有借用旧 PASS |
| Chrome / Native / 安装升级 / 后台恢复 / 真实清理 | NOT_TESTED；没有同候选 Mac/Chrome 回执 |

## 6. 质量自评与完成边界

以下是模型对本轮方案/文档的自评，不是外部专家评审，也不是产品验收。场景可执行性按试读代理的最终 94 分保留，不为达到目标改分。

| 维度 | 自评 /100 | 实际依据 |
| --- | ---: | --- |
| 核心目标相关性 | 98 | 四类需求、多个 JS、独立安装/升级/停止与 Stay Focus 主线均有交付 |
| 可读性 | 95 | 用户选择和上手路径在前，源码附录在后；六题复验能正确分流 |
| 场景覆盖 | 97 | 主案例完整生命周期、五个对照产品、单/多文件和不同 edition、未知清理 |
| 运行机制正确性 | 98 | 实际声明/构建/执行/权限/收尾逐链核查，已修正审阅发现的措辞错误 |
| 独立扩展解耦 | 97 | R2 已完成、固定可信接入、Time/Cookie 私有耦合和独立后台升级缺口分别说明 |
| 实施可行性 / 操作可执行性 | 94 | 可以按指南和已有公开合同实施支持范围；仍需在对应 API/示例查完整参数和命令，没有新阻塞或新运行器建议 |
| 安全与验收说明 | 96 | 不提升 JSON 权限；保留 identity/epoch、未知状态、未测试和缺失证据边界；主线只修改 docs/Skills |

**没有达到全部维度均 ≥95 的目标，不报告“95+ 产品通过”。** 文档选型和操作指引已可用；后续真正的产品验收应由对应工具任务在真实候选上验证 UI 关闭、网站导航、SW 重启、规则回读、升级、停用/卸载与撤权。相关代码或工具正在其他任务中修改，本轮仅记录发现与可执行边界，未重复写入。
