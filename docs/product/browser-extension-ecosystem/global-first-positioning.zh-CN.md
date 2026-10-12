# OpenDesk Browser：全球第一细分赛道定位 R1

> 研究基准：2026-10-13（Asia/Shanghai）；范围：产品定位、全球竞品、双因素/三因素组合创新、可验证的第一称号。**这是营销研究，不是已经取得的世界纪录、商店上市、用户规模或原生验收证明。**
>
> 本文不更改 R8 188 项能力账本、Browser SDK 逐项验收、商品实验 EXP 或产品工程状态。优先读取：[竞品证据](competitor-research.zh-CN.md)、[UserScript 生态](userscript-ecosystem.zh-CN.md)、[Browser SDK 状态](../../framework/workstreams/browser-sdk-status.md)、[React/Vue 使用与证据](../../api/page-ui-frameworks.zh-CN.md)、[AI 生态 R6](../../architecture/browser-framework/ai-browser-agent-ecosystem-r6-20261008.zh-CN.md)。

## 0. 战略结论

OpenDesk 不以“用户脚本数量多于油猴”作为开局。第一步尝试抢占**Chrome 中的现代网站工具开发/运行环境**：开发者在既有扩展内编写或关联 JS/React/Vue 项目，获得授权，明确 Run，在真实网页交互，并可执行受管 Stop。第二步扩大到项目版本、依赖、安装、升级与分发，最后再向 AI → 审核 → 固定任务 → 长期运行迈进。

核心方法：**有用的市场定义 × 两到三个真实能力 × 可反驳的全球竞品比较 × 正式发布/测试证据**。缩小范围的目的是让用户收益更鲜明，而不是添加人为约束制造“独一家”。

- **全球首个 World's First**：需要证明同类产品在本产品可公开取得该能力以前没有实现同等用户价值；公开源码提交不等于公开发行。
- **全球第一 World's No.1**：必须注明评价指标、同一测试任务、竞品名单、时点和复现证据。
- **全球领先 World-Leading**：仍需要支撑事实，但不能暗示已经取得未被证明的绝对排名。
- **定位语**：“不只是运行用户脚本，更是在浏览器中开发工具 / Build Browser Apps, Not Just Userscripts.” 可用于早期介绍，避免未经验证的排他性。

**当前已核实“全球首个/全球第一”：0 项。** 下文称号全部只是待验证候选；禁止直接复制“全球首个”用于商店、正式官网和广告，除非对应声明台账通过审批。

## 1. 竞争边界与真实产品版本

三个相邻赛道应一起比较：

1. **Userscript Manager**：Tampermonkey、ScriptCat、Violentmonkey、Greasemonkey、OrangeMonkey、FireMonkey、Safari Userscripts。
2. **浏览器自动化/RPA**：Automa、UI.Vision、Browserflow、Browser Use、Playwright MCP、ScriptCat Agent；不是所有都属于用户脚本管理器。
3. **开发工作流/浏览器扩展框架**：vite-plugin-monkey、WXT、Plasmo 及各平台自带开发者工具。重要反例：Vite 工具链早已支持 React/Vue/TypeScript/多文件用户脚本开发，“React + 多文件”本身绝不是全球首创。

不以产品首次发布时间判断是否仍活跃。必须分清**稳定版、Beta、GitHub 推送、浏览器商店更新、功能首次出现、最近实际核验**。仓库当前时序快照：[competitor-timeline.json](competitor-timeline.json)。若尚未核实商店/稳定版发布日期，使用 null，不能从 GitHub push 时间编造发行时间。

已验证反例：
- ScriptCat 在 2026-09-18 发布 v1.5.0-beta.4（安装、权限差异等）；Agent/MCP 的 Beta 与稳定版不能混报。https://github.com/scriptscat/scriptcat/releases/tag/v1.5.0-beta.4
- Violentmonkey 的 2026-10-10 v2.49.5 **Beta** 明确加入 MCP AI Agent integration，且有 cron 修复；不是“仅 OpenDesk 支持 AI/MCP 脚本工具”。https://github.com/violentmonkey/violentmonkey/releases/tag/v2.49.5
- vite-plugin-monkey 于 2026-08-30 发布 v8.1.1，现代前端框架适配长期存在。https://github.com/lisonge/vite-plugin-monkey/releases/tag/v8.1.1
- Automa 的 GitHub 正式 release 最后已查到 v1.29.12（2025-08-11），但其仓库 2026-03-02 仍有代码推送，不据此断言停止维护。https://github.com/AutomaApp/automa
- WXT、Plasmo 都是现代扩展开发框架，不可把“能用 React/Vue 开发扩展”宣传成 OpenDesk 独创。

## 2. OpenDesk 本次可用作定位的事实边界

| 技术基础 | 已有依据 | 不得夸大成什么 |
| --- | --- | --- |
| Chrome Side Panel 的 JS/Page 脚本编辑与网页运行 | src/ui/script-editor.js、src/scripting/user-scripts/preview.js | 直接等于完整用户脚本兼容 |
| React JSX / Vue SFC 浏览器直接编辑和受管 Stop | Developer Edition 固定历史候选有真实 Chrome 测试；见 docs/api/page-ui-frameworks.zh-CN.md | Standard 普通版也原生支持任意 JSX/SFC；任意 npm / TSX 均可直接运行 |
| 已授权本地多文件 ESM 项目、React/Vue 自动准备 | docs/api/local-projects.zh-CN.md、examples/programs/page-ui-react / page-ui-vue | 无 Native/Node 条件就能编辑运行任意磁盘项目 |
| 预置库、依赖锁与 HTTPS 静态 ESM（构建阶段） | docs/api/runtime-globals-and-preinstalled-libraries.zh-CN.md、docs/architecture/browser-framework/https-esm-imports-r1.zh-CN.md | 任意 CDN 运行时执行、任意依赖皆已支持 |
| Browser SDK | R5 状态记 35 项、26 项源码接线、完整 Mac Chrome GUI 0/35 | “35 项都可生产使用”或“所有 Chrome API 已覆盖” |
| 正式 Page 安装/自动匹配/受控授权 | 已有 installed-programs 源码，兼容性/更新/恢复仍需同候选原生闭环 | 可无损替代 Tampermonkey 或 ScriptCat |
| 定时任务 | 固定 R1.11 候选已通过 macOS Chrome 实际定时执行案例 | 7×24 持续运行与所有恢复场景完成 |
| AI/云控/Agent | 有架构、部分组件和工作流；WebCodex 正式模型调用与 Cloud 长期 Runner 有缺口 | “AI 一句话生产发布应用/云端永久托管”已全面交付 |

特别区分 **Standard**（JavaScript 草稿与 React/Vue Direct，浏览器包不内置 JSX/SFC 编译器）、**Developer**（侧栏 JSX/SFC 单组件编译运行）及**本地多文件开发**（已配对/授权的 Native/Node 项目流程）。详细准绳为 docs/architecture/browser-framework/browser-compiler-editions-r245.zh-CN.md。历史 CI 只证明关联的候选 SHA。

## 3. “第一”的交叉策略：两因素赛道

| ID | 两因素组合 | 候选“第一”方向 | 主要反例/比较对象 | 优先级 |
| --- | --- | --- | --- | --- |
| D01 | 侧栏直接编辑 × React/Vue 双框架 | 浏览器内双框架网页应用开发体验 | ScriptCat 编辑器、在线 IDE、其他扩展编辑器 | P0 |
| D02 | 多文件 ESM × 保存后自动准备/明确 Run | 源码到网页功能的最低配置开发 | vite-plugin-monkey + Tampermonkey、WXT | P0 |
| D03 | 网页组件 × 受管 Stop/资源清理 | 可重复编辑/运行/撤销的网页组件工具 | 传统脚本、浏览器组件注入框架 | P0 |
| D04 | 依赖缓存/锁 × 高频库本地复用 | 低重复下载与可信依赖管理 | Vite/pnpm/CDN 缓存、插件管理器 | P1 |
| D05 | Page USER_SCRIPT × Controller/RunHost | 页面增强与自动化统一工具平台 | ScriptCat 后台/定时、RPA 工具 | P1 |
| D06 | Browser SDK × 精细权限审批 | 受控浏览器能力的第三方工具入口 | MV3 Chrome SDK、ScriptCat GM/Agent | P1 |
| D07 | 定时任务 × 用户脚本 | 网站脚本 + 自动调度 | ScriptCat @crontab、Violentmonkey beta Cron | P3（首创性低） |
| D08 | Standard × Developer 独立制品 | 轻量运行版与专业开发版分离 | 众多开源开发工具的不同发行版 | P2（不是强“第一”） |

## 4. 三因素赛道与可争夺的小山头

| ID | 三因素组合 | 目标定位 | 当前依据/最大阻断 |
| --- | --- | --- | --- |
| F01 | Chrome 侧栏 × React JSX/Vue SFC × 真网页受管 Stop | **浏览器内双框架网页工具开发环境** | 有专项原生证据；缺同版本全球排他性审查和正式发布 |
| F02 | 本地多文件 × 自动准备 × 无需每次重编译扩展的 Run | **多文件项目直达网页工具** | 现有 Native/CLI；需要标准对照任务的真实效率数据 |
| F03 | JS Script × 交互 Page UI × Controller 自动化 | **三类浏览器程序的统一平台** | 多运行世界必须明确，统一安装交付有缺口 |
| F04 | 受控外部依赖 × 版本哈希 × 原生运行回执 | **可验证网站工具开发链** | 有独立组件；完整流程/竞品对照待验收 |
| F05 | 多文件页面工具 × 权限审批 × 定时任务 | **有界授权的定时网页工具** | 恢复/撤权/跨环境原生测试未闭合 |
| F06 | React/Vue × 固定版本安装 × 工具管理 | **用户自制网站小应用的平台化运行** | 安装升级/分发治理尚未完整 |
| F07 | AI 生成 × 用户批准 × 固定任务重复运行 | **AI 创作到确定性运行** | AI/MCP/Native 闭环尚未全部实现，未来定位 |
| F08 | 创作者后台 × 合法数据导出 × 可视组件/报告 | **创作者后台生产力垂直平台** | 商业假设，尚无客户/付费证据 |
| F09 | 电商卖家后台 × 可定制 UI × 工作流自动化 | **卖家日常运营辅助平台** | 需求验证和行业 MVP 独立于通用平台 |
| F10 | GM 脚本兼容 × 现代项目 × 受信 Browser SDK | **传统脚本向现代工具迁移平台** | GM API 仍缺、SDK 原生验收未完 |

优先验证 F01 → F02 → F04；F07 属下一阶段战略。F08、F09 应服从现有独立商业实验台账，禁止因“全球第一候选”自动立项。D/F 表为**机会库，不代表已获得第一、全球排名或实际用户需求**。

## 5. 五条必须独立测试的获胜方式

1. **历史首创**：定义替代方案、公开发布时间、最早版本与同等用户价值；反例出现即撤销候选。
2. **开发效率**：同样 React/Vue 修改任务，比较首次配置、修改后再 Run、人工步骤、失败恢复耗时，给出中位数与分布。
3. **新手成功率**：完全新用户的安装、站点授权、Allow User Scripts、首次网页实际交互，不能只测试作者机器。
4. **可靠性/安全**：真实 Chrome 的撤权、SPA/BFCache、Worker 重启、Stop、依赖校验、版本差分；把未知副作用当未知。
5. **用户价值/生态**：开发者留存、已安装工具实际使用、问题关闭率与收入；未经访谈/支付实验不得宣称行业首选。

实际测得的“测试第一”必须写成 **日期 + 范围 + 竞品版本 + 任务集 + 指标**，不能省去限定转换成“全球最快/最好/最安全”。

## 6. 验收与推进顺序

- **现在**：以“Build Browser Apps, Not Just Userscripts”定位推广已经实测的流程，不使用未批准的全球第一声称。
- **P0 / F01**：固定 OpenDesk Developer SHA + 对应真实 Chrome 包；找到 ScriptCat、Violentmonkey、Tampermonkey+vite-plugin-monkey 等最强反例；公开源码任务、从编辑到 Stop 的回执、对照录屏。
- **P0 / F02**：对同一多文件 React/Vue 项目做冷启动/热修改/恢复等比，严格记录 Native/Node 预装成本，不通过隐去安装步骤取得虚假优势。
- **P1 / F04**：有界依赖/版本/回执安全测试；测试只谈具体边界，不宣称“世界最安全”。
- **P2 / 生态**：补 GM、安装升级与回滚、浏览器重启、作者发布，不以营销定位替代兼容性。
- **P3 / AI**：在模型/工具连接、权限、版本冻结、运行与回执真实闭环之前，不对外宣称 AI 自治产品已可商用。

逐条宣传声明和反例记录：[first-claims-ledger.json](first-claims-ledger.json)。落地广告、FAQ、对照基准：[marketing-playbook.zh-CN.md](marketing-playbook.zh-CN.md)。

## 7. 文档权威与决策隔离

- 全球排名/首创状态只由 **first-claims-ledger.json** 管理，禁止在宣传页口头升级。
- 竞品日期和来源只由 **competitor-timeline.json** 维护；稳定版、预览版、仓库活跃度、商店更新单独存。
- SDK 接口状态以 docs/framework/workstreams/browser-sdk-status.md 为准。
- GM API 状态以 docs/architecture/browser-framework/userscript-compatibility-matrix-r8.zh-CN.md 为准。
- 商业验证以 commercial-experiments.json、商业 MVP 独立文件为准；Page QA Inspector 已废弃并从 main 移除，不复活。
- 本轮是文档新增，不改变任何源码、真实 Chrome 验收或对外发布状态。
