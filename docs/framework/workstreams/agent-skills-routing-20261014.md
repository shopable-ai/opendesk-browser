# 2026-10-14 · Agent Skills 职责收敛与目录补齐

- 仓库：`shopable-ai/opendesk-browser`，只针对 `main`。
- 审核时的历史定位：`50827de6e71e86bdeec98368ec17f032b5f1f8ca`；提交前另行检查实时 HEAD 并使用 ref lease，不能锁定旧 SHA。
- 当前会话写入负责人：Agent Skills 目录（新增 `.agents/skills/README.md`、`opendesk-script-authoring/SKILL.md`、`opendesk-trusted-sidebar-feature/SKILL.md`、此记录）。不编辑原 `opendesk-program-publish`、`opendesk-sidebar-tool-dev` 或任何 `src/` 文件。
- 背景：原有两个技能分别覆盖项目冻结发布和动态 Sidebar Tool；开发 Tab 的脚本作者工作流与第一方可信 Side Panel 的业务边界缺少独立技能。遵循最小新增：两新两旧，不为 JS/React/Vue 或具体业务各造一个技能。
- 代码事实：`src/ui/script-editor.js` 与 `docs/api/page-ui-frameworks.zh-CN.md` 区分 Controller/Page/JSX/SFC；`src/ui/sidebar-tools.js` 与 `src/time-review/trusted-native-ui.js` 同时存在正式 sandbox 和固定静态 UI；`src/stay-focus/` 专门承担业务/规则。技能指导不能把任意已安装包提权。
- 限制：本次只修改纯 Markdown 开发辅助文件，未修改扩展代码/运行器，不运行用户 Mac Chrome、Native/Go、Node 业务回归或重新发布包。新文件已存在与格式检查只构成 `DOC_STATIC_PASS`；产品功能 `CHROME_NOT_TESTED / MAC_NATIVE_NOT_TESTED / F3_NOT_TESTED`。没有可证实的产品 95+ 自评分。
- 后续：按具体功能变更补定向 Node/Chrome/安装/回归证据，不把 Skill 写入视为功能完成。遵守共享资源和其他工作流独立写入。
