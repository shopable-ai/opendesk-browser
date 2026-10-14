# OpenDesk Browser · Agent Skills 路由

本目录是**项目已有的唯一** Codex/AI Skill 入口；不新建仓库根目录 `skills/`。每个 Skill 的 frontmatter 用于按用户意图选择，不会因此获得执行权限。实际源码/安全合同仍以 `AGENTS.md`、`docs/api/`、`docs/framework/testing-guide.md` 为准。

| 用户意图 | 唯一主 Skill | 不应混淆 |
| --- | --- | --- |
| 「开发」Tab 编写、改错、运行 JS、React JSX、Vue SFC、Controller/Page | [`opendesk-script-authoring`](opendesk-script-authoring/SKILL.md) | 不自动生成安装包，也不能把 Controller `page` 用在 Page |
| 单文件/多文件项目的固定版本、正式验证、Task/Page 安装或发布 | [`opendesk-program-publish`](opendesk-program-publish/SKILL.md) | Run/Preview/Candidate ≠ Installed/Published |
| 「工具」Tab 可安装用户/AI HTML/CSS/JS 或预构建 React/Vue 工具 | [`opendesk-sidebar-tool-dev`](opendesk-sidebar-tool-dev/SKILL.md) | `opendesk.sidebar-tool.v1` 在 opaque-origin iframe，不进入可信 Host |
| 扩展内置的一方可信 Side Panel 功能、Stay Focus/Time Review 解耦及安全准入 | [`opendesk-trusted-sidebar-feature`](opendesk-trusted-sidebar-feature/SKILL.md) | 随扩展静态编译的可信源码 ≠ 任意导入的动态包 |
| 扩展自身的 Tab/Index/Detail/Form、设置/应用市场排版、R27/R28/R30 视觉与导航 | [`opendesk-extension-ui`](opendesk-extension-ui/SKILL.md) | 只管内置页面的 UI 结构/可访问性，不把动态工具变成特权 UI |
| Chrome MV3/WXT Background、Content、Page/Controller/Side Panel、Native 的接口/生命周期/权限工程 | [`opendesk-extension-runtime`](opendesk-extension-runtime/SKILL.md) | 不接管 UI-only 样式或用户创作脚本，不新建第二 SDK/Host |

**增设技能原则**：一个反复使用、拥有不同源码所有权/权限边界、能独立定向验收的工作流才增设 Skill。不要为 JS/React/Vue、每个具体官方工具、每次测试或文档 GOAL 创建重复 Skill。优先维护现有 Skill 与权威文档。

**当前交付范围**：只增加作者路由/安全指导，不修改 `src/` Runtime、Chrome 权限、扩展构建、工具注册表、安装格式或发行渠道。新 Skill 落地后须通过静态路由/链接检查；真实 Node/Chrome 功能验收仍按各业务工作流执行。

**新建 Skill 的先决条件**：先查看 [Skill 宇宙与独立评分](UNIVERSE.zh-CN.md)。建议评分 ≥95 且非重复职责、存在验证入口时才新增；用户页面中的列表/详情/创建不按每个 Tab 再造一个 Skill。
