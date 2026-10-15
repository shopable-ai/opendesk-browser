# OpenDesk Browser 扩展创建工作流 · 兼容入口

**唯一正式规范已迁至：** [`.agents/workflows/extension-creation.md`](../../.agents/workflows/extension-creation.md)。

本文件仅保留旧链接兼容，不再维护第二份需求推理、功能树、十阶段检查点、恢复或升级规则。AI/Codex、现有 Skill 和 GitHub Agentic Workflow 应以新文件为权威。

- [现有 Skill 路由](../../.agents/skills/README.md)
- [本任务的三个案例与原始验收证据](workstreams/browser-tool-creation-workflow-r2-20261015.md)
- [GitHub gh-aw 手动受理入口](../../.github/workflows/extension-creation-intake.md)

说明：`opendesk.workflow.v1` 是浏览器网页任务自动化合同，不是 AI 扩展开发 Runner；`.github/workflows/sidebar-preview-contract.yml` 是传统 CI，不是扩展创建流程。真实部署/安装前仍需原有用户授权、Chrome 及产品结果验证。

## 多语言不是创建工具的前置负担

用户创建一个独立扩展时默认仅生成一种源语言的 UI。若后续说“给这个已有扩展加英文/日文”，**恢复同一项目、原工具 ID 与历史功能树**，提取文字并补充已有语言资源，检查变量、源文字修订、术语、危险 HTML、同源预览后按原安装/更新流程交付；不复制项目、不新建多语言 Skill 或管理器。读取和引用 [唯一 Sidebar Tool 本地化合同](../api/sidebar-tool-localization.zh-CN.md)；一切用户数据和权限保持不变。可信页面 overlay 仍由原 Content Script/Host 所有，绝不作为第三方工具脚本导入网站。
