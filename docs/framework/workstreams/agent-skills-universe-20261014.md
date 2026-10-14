# 2026-10-14 · Skill 宇宙与扩展开发角色补齐

**责任范围**：新增 `.agents/skills/UNIVERSE.zh-CN.md`、两个独立扩展维护 Skill、动态路由/链接静态 Node 检查和轻量 Skills GitHub Action；仅对 `.agents/skills/README.md` 作必要路由增量修改。不修改已有四个 Skill、`src/`、Manifest、编译链和用户数据。

## 读取时的源码事实

- 当前项目使用唯一的 `.agents/skills/`，旧四项分别覆盖用户脚本、程序发布、动态侧栏工具及静态第一方工具业务。
- `docs/architecture/ui-layout-conventions-r27.zh-CN.md`、`sidebar-multi-section-tab-contract-r28.zh-CN.md`、`sidebar-design-system-r20.zh-CN.md` 已具备跨界面尺寸、Tab/Index/Detail/Form、工具 Tab 基准。
- `src/ui/tool.html` 的“我的”包含 `#scheduled-panel`，`src/ui/scheduled-task-workbench.js` 的 `show(view)` 实际切换列表/表单/任务管理/运行概览；`renderPlans()` 仍在列表内包含历史、更多和删除确认。这是需要后续真实 UX/源码修复的已知落差，不在本技能目录任务中顺手改动。
- 扩展跨世界由当前 SW/Content/USER_SCRIPT/Controller/Side Panel/Native 真实边界负责，不将“设计技能”变成第二套 SDK/Host/Authority。

## 变更判断

1. 给全部候选**独立**的 F/I/B/T/C 五维 100 分创建价值评分，使用“≥95 且无重复才本轮创建”门槛；当前新建 `opendesk-extension-ui`（98）与 `opendesk-extension-runtime`（96），视觉测试、a11y、导航和组件规范融合到二者，避免 Skill 泛滥。
2. 已有四个 SKILL.md 保留，README 增两条清晰路由；目录索引和宇宙互为导航而非业务第二权威。
3. `tests/environment/agent-skills-r1.test.mjs` 动态读取全部已安装 Skill 目录，检查 frontmatter/唯一入口、宇宙登记、R27/R28/R30 引用和新 Markdown 相对链接。仅本轻量 GitHub Action 在 Skills 修改时触发 Node，无需 npm/build/真实 Chrome 资源。

## 验证级别与尚未完成

- 文档/元数据/链接可做 `DOC_STATIC_PASS`（以实际跑完的新测试及 CI 为准），不代表用户 Mac 工作区或 Chrome 验收。
- 本次未修改 `src`，因此**没有实施“我的 → 定时计划”详情视图的真实 UI 修复**，没有运行 Chrome 原生 UI/200% zoom/键盘测试。
- `NODE_TEST`、`CHROME_NATIVE`、`MAC_NATIVE`、`PACKAGE/ZIP/F3` 依真实运行结果逐一标记，禁止以当前技能预评分 98/96 宣称产品页面已达到 95+。
- 与其他 Agent 并行主分支时，写入前重新核对目标文件 blob 和最新 HEAD；只以非强推线性提交集成，不覆盖他人工作。
