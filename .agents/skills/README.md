# OpenDesk Browser · Agent Skills 路由

本目录是项目**唯一现行 Agent Skills 入口**，不新建根目录 `skills/`；Skill 是 AI/Codex 指导而不是浏览器安装的扩展。保留技术 slug 与运行协议，用户产品术语统一引用 [R4 正式产品规格](../../docs/product/sidebar-ui-spec.zh-CN.md)。

| 主职责（唯一主 Skill） | Skill | 禁止混淆 |
| --- | --- | --- |
| 五 Tab、扩展中心搜索/类型标签/详情/安装管理 UI、R27/R28/R30、定时计划交互 | [`opendesk-extension-ui`](opendesk-extension-ui/SKILL.md) | 只负责界面，不擅改运行授权 |
| 「扩展」中的**应用**（Sidebar Tool），源码、打包、预览、安装、沙箱和 UI | [`opendesk-sidebar-tool-dev`](opendesk-sidebar-tool-dev/SKILL.md) | `opendesk.sidebar-tool.v1/v2`、`OpenDeskTool.request` 仍是原技术合同 |
| 「开发」中创作或调试 Controller Task、Page USER_SCRIPT、React JSX/Vue SFC | [`opendesk-script-authoring`](opendesk-script-authoring/SKILL.md) | 草稿 Run/Preview ≠ 安装/发布 |
| 冻结/验证/安装/发布 Task 和 Page Program，已安装 Page 由「扩展 → 网页增强」管理 | [`opendesk-program-publish`](opendesk-program-publish/SKILL.md) | Page Authority ≠ Sidebar Tool 安装器；Task 属于「我的」 |
| 静态编译/审计的一方可信功能，Stay Focus/Time Review/Cookie Editor 业务解耦 | [`opendesk-trusted-sidebar-feature`](opendesk-trusted-sidebar-feature/SKILL.md) | 不能把动态导入包变为受信 Host 源码 |
| Chrome MV3/WXT SW、Content、MAIN、Controller/Page、Native 的权限/SDK/生命周期 | [`opendesk-extension-runtime`](opendesk-extension-runtime/SKILL.md) | 不创建第二 Host/Authority，不接管 UI-only 改动 |

## 典型需求：每条仅一个主 Skill

| 用户原话 | 唯一主 Skill | 需要协作时才采用 |
| --- | --- | --- |
| 「在扩展里开发一个小应用」 | `opendesk-sidebar-tool-dev` | 需受信后台能力时复核 runtime/trusted |
| 「为网页安装一个增强脚本」 | `opendesk-program-publish` | 在「开发」写脚本时由 script-authoring 辅助 |
| 「修改扩展列表和安装管理界面」 | `opendesk-extension-ui` | 安装器/权限协议另行 runtime 审计 |
| 「开发一个需要后台能力的扩展功能」 | `opendesk-extension-runtime` | 第一方具体业务可按 trusted-feature 所有权细分 |
| 「在我的任务中创建自动化任务」 | `opendesk-script-authoring` | 正式安装由 program-publish，计划视图 UI 由 extension-ui |
| 「开发并发布 React/Vue 网页程序」 | `opendesk-program-publish` | 源码编写时可协同 script-authoring，仍为 Page 世界 |

**产品与底层分离**：OpenDesk Browser 是一款 Chrome Extension；五个正式 Tab 是「我的 / 扩展 / 工作流 / 开发 / 云控」。「扩展」是管理入口；「应用」是 Sidebar Tool 的列表类型标签，「网页增强」是已安装 Page Program 的类型标签；Controller Task 仍属「我的」，一方可信功能与动态安装包必须安全隔离。Agent Skill 不是安装包。不要因为用户称“扩展”就互换包格式、运行世界或权限。

新建 Skill 前读 [Skill 宇宙与评分](UNIVERSE.zh-CN.md)。一个职责对应一个 Skill，绝不为具体工具、JS 框架或一次测试创建重复 Skill。仅静态文档核验标为 `DOC_STATIC_PASS`；Chrome 原生未实测记 `NOT_TESTED`。
