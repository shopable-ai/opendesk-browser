# Preview Contract R1 · 同源工具 UI 闭环

日期：2026-10-15，执行范围：GitHub API 直连 / main，用户 Mac 工作树、Chrome、npm watcher 不可访问。
当前候选须以最终 main 提交 SHA、源文件 SHA、构建工具与截图身份为准，本文不虚构原生运行结果。

## 已审核源与根因

- 正式 Side Panel：src/ui/design-tokens.css、src/ui/design-system.css、src/ui/tool.html；R31 已完成 od-* 样式所有权收敛。
- 独立 quick-notes：src/style.css 重复定义根 Token、颜色、icon-button、表单、删除确认的视觉，与正式组件分叉。
- 正式包由 scripts/build-sidebar-tool.mjs 打包，src/sidebar-tools/bridge.js 为 opaque-origin iframe 提供受控 OpenDeskTool.request()。
- 另一个并行任务已存在 scripts/sidebar-preview-kit.mjs 和 .agents/skills/opendesk-ui-preview/SKILL.md，用于 ChatGPT 手工设计稿。本任务只增加真实生产源码驱动的相邻流程，不复制第二个 Skill，不更改现有可编辑设计稿逻辑。
- 本轮 rebase 正式打包器时保留并行加入的 Papa Parse Catalog 固定资产逻辑。书签 SDK/AI-VIP/Time Review/安装权限完全不属于本次改动。

## 本次写入文件归属

独占当前任务新增 scripts/preview/{shared-tool-design.mjs,build-preview.mjs,quick-notes-mock.js,check-preview-contract.mjs}，tests/environment/sidebar-preview-contract.test.mjs，contracts/ui-preview/quick-notes.lock.json，.github/workflows/sidebar-preview-contract.yml，docs/architecture/browser-framework/ui-preview-contract-r1.zh-CN.md，本记录。

本轮定向更新：scripts/build-sidebar-tool.mjs（新增 opt-in CSS build-time compiler，保留并行其他逻辑）、examples/sidebar-tools/quick-notes/{tool.config.json,src/index.html,src/style.css,src/main.js}、scripts/tests/sidebar-quick-notes-layout-visual.mjs、已有 .agents/skills/opendesk-ui-preview/SKILL.md 增补“正式工具”路径。

src/ui/design-tokens.css 与 src/ui/design-system.css 均保持不修改，不做通用第二套 Token；没有向业务宿主 src/ 写私有数据逻辑或新增 Chrome 权限。无法通过 GitHub API 观测用户 Mac 未提交工作树，只能核对远端 main，并在 Mac 验收前重新检查 git status/差异。

## 自动门禁与剩余

运行入口：

    node scripts/preview/build-preview.mjs --tool quick-notes --surface side-panel --scenario success --theme light --width 360 --height 760
    node scripts/preview/check-preview-contract.mjs
    node --test tests/environment/sidebar-preview-contract.test.mjs tests/environment/sidebar-quick-notes.test.mjs

**验收尚未擅自认定**：远端 CI/本地 Node 结果按实际执行另报；真实 Mac Chrome 安装、工具 iframe 与离线 HTML 的对照截图、宽度/缩放/主题矩阵、DOM/computed styles、键盘真实事件、应用发行身份均为 NOT_TESTED，不能借用原 Quick Notes 静态视觉脚本或其他会话历史 PASS。

## 下一阶段

1. 获取当前 main，确认 CI preview-contract、Sidebar package 和 quick-notes 定向测试全部真实 PASS，若未通过修复并补证。
2. 当前 SHA 的真实 Chrome 安装及与离线预览同条件视觉/交互比对。
3. 在网页注入、独立页具备真实组件复用边界后，再扩展生成器，不以 iframe 代替 ShadowRoot/弹窗。
4. 依用户五维 25/25/20/15/15 硬性标准证据评分；未获得原生和差异证据前任何 95+ 总分均不可宣布。
