# OpenDesk Browser React UI 共享组件 · 产品目标与零退化合同（R33）

> 2026-10-16 用户目标恢复与历史方案校准。**这是下一轮开发必须读取的产品/架构约束，不是已经完成的实现或已获验收的组件库。** 适用于 React UI 共享组件和可信界面的渐进接入；不影响无关开发任务。

## 一、最重要的产品目标（优先级高于目录名或技术选型）

**让 AI 与开发者在 OpenDesk Browser 可信浏览器 UI、Side Panel 及用户自定义工具开发中，按需复用成熟、视觉统一、可访问的 React UI 组件，避免重复编写按钮、弹窗、菜单和表单；不要求把全部浏览器或旧工具迁移 React。**

**并列 P0：原有自定义 UI 能力零退化。** 用户继续使用 HTML/CSS/JS、React JSX、Vue SFC 与既有 Page/Controller 开发方式；Side Panel「开发」的编辑、编译、预览、运行、保存、Stop、错误恢复；Sidebar Tool 的构建、导入、安装、更新、SDK 调用和已安装版本/数据必须保留。新 React 依赖只由使用它的消费者引入，旧工具不需改代码、重新安装或获取新权限。

**成功体验必须以真实消费者证明，而不是只创建包或 Starter：**
1. 选定一个**低风险的正式可信浏览器 UI** 区域，通过原业务逻辑实际使用共享 React 组件，点击/状态/卸载正确；不预设必须重写「开发」编辑器。
2. 选定一个**独立用户 React Sidebar Tool**，从同一共享组件源码按需编译，经过原打包、沙箱、SDK 与生命周期链；不把可信宿主脚本和特权注入 iframe。
3. 对照基线执行原生 JS、React、Vue、旧工具和两个产品版本的回归；任一旧功能回归均禁止宣称本轮完成。

## 二、已确认的历史边界（本轮继续有效）

- **框架可选：** WXT/Vite 是已有工程基础；React 用于复杂 UI 和需复用组件的区域，原生 JS/Vue/HTML 并存，不因 React 组件化全局改造五个 Tab。
- **唯一视觉基线：** `src/ui/design-tokens.css`、`src/ui/design-system.css` 和 `docs/architecture/ui-layout-conventions-r27.zh-CN.md` 为已有视觉合同。Tailwind v4 可以离线编译使用，但完整 Preflight 不得进入 Side Panel、网站、用户 iframe；不创建第二套色板。
- **运行世界明确分离：** 可信扩展 UI 与公开的独立 Sidebar Tool iframe、网页 Page USER_SCRIPT、Controller、Native Workspace 不共享权限/挂载根。共享 UI **源码** 与视觉规范，不共享特权宿主、Runtime 或无条件全局注入脚本。动态用户/第三方工具仍保持 opaque-origin iframe；可信编译期 UI 的单独优化依其已有架构合同执行。
- **现有开发路径不退化：** 本地 `opendesk browser dev .` 可以保存后自动准备、用户显式 Run；网页直接编译与本地项目不同。Standard 不打包原始 JSX/SFC 浏览器内编译器，Developer Edition 按已有固定 Worker 流程支持，不能把两版混称同一能力，也不能默默把 4MB 级编译器加回普通包。
- **原有打包器唯一：** 工具自己的 `src/` 保留业务逻辑；`scripts/build-sidebar-tool.mjs`、`tool.config.json`、`OpenDeskTool.request`、包候选/晋升/安装更新链不被替换。React/Vue 先本地编译再按既有 IIFE/本地 CSS 合同打包；JS 上限 220000 字符、完整 JSON 320000 字节，不因新组件库随意提升。
- **组件策略：** 先复用维护成熟、可访问的 UI 组件机制，依实际消费选择少量组件，审查包大小、类型、焦点、Dialog/Portal、CSS scope、清理与固定依赖。React Aria/Radix/Base UI/shadcn 是待评估候选，**没有一项被历史方案正式选定**；组件目录名如 `packages/opendesk-ui-react/` 也只是候选，不能先建空包当交付。
- **不重复基础设施：** 禁止第二套编辑器、编译器、Host、Browser SDK、权限系统、安装器、设计令牌或运行时 CDN。已创建、已安装的旧工具不强制迁移。
- **并行开发：** 只写 GitHub `main`，不创建分支/worktree/PR，不强推/reset/clean；对共享代码先核验改动/owner，保留其他 Agent 的修改和无关产物。

## 三、必须先完成的决策与独立验收

1. **历史恢复并去冲突（Gate 0）：** 检索相关已批准方案、否决事项与历史独立评分，不需穷举全部聊天；以**最新用户明确目标 > 仓库现行合同/实际代码 > 历史方案 > 过时自评**排序。形成「已批准/已实现/待设计/被否决/未验证」清单。为每条决定标明出处/时间/证据；不能把旧 96、98 分当最新代码实测。
2. **架构路线（Gate 1）：** 先找一处可信 UI 与一处真实 React Sidebar Tool 消费方，并测现有 bundle；确认共享源码位置、API、依赖归属及多环境打包。若接入失败，按具体缺口最小修复，不抽象为第二个 UI 平台。
3. **最小功能（Gate 2）：** 共享组件实际导入、可访问交互、主题和卸载在**两个消费者**分别成立；普通 JS/Vue 未引入 React。
4. **零退化（独立 P0 Gate 3）：** 测 HTML/CSS/JS、React JSX、Vue SFC、Standard/Developer 差异、开发界面编辑→编译→预览→运行→保存/重启/Stop、旧 Sidebar Tool 安装/更新/SDK/数据和权限拒绝。任何 FAIL 阻断发布；非同候选 Chrome 实证为 NOT_TESTED。
5. **独立专家审计（Gate 4）：** 产品目标、架构、真实复用、兼容、构建预算、性能、无障碍、样式、Sandbox/权限、依赖/生命周期、维护性、原生 Chrome 分别评分；所有 **≥95 是目标不是既成事实**。反方审计重点寻找过度设计、原框架退化、宿主特权泄漏和 UI/包预算成本。

## 四、已有事实与旧判定的效力

- R24.3/R24.5 说明：`docs/api/page-ui-frameworks.zh-CN.md`、`docs/architecture/browser-framework/browser-compiler-editions-r245.zh-CN.md`，旧候选真实 Chrome 验收不可自动套在最新 HEAD。
- Sidebar Tool 唯一规范：`docs/api/sidebar-tool-development.zh-CN.md`，`.agents/skills/opendesk-sidebar-tool-dev/SKILL.md`，`AGENTS.md`。
- 视觉与隔离：`docs/architecture/ui-layout-conventions-r27.zh-CN.md`、`docs/architecture/sidebar-design-system-r20.zh-CN.md`、`docs/architecture/browser-framework/custom-tool-ui-and-local-development.zh-CN.md`。
- R32.8 历史审计：`docs/framework/workstreams/react-ui-r328-minimal-20261016.md` 的“不创建共享组件包”**仅反映当时验证范围与缺少真实消费者的信息，不是永久禁令**。本轮已有两个拟验收的消费者，是否真正提取公共源码需以复用、预算和安全验证决定。
- 历史 CI 佐证：[Sidebar React/Vue 本地构建及工具包](https://github.com/shopable-ai/opendesk-browser/actions/runs/38878878661)、[Bookmark React 离线预览 Chromium](https://github.com/shopable-ai/opendesk-browser/actions/runs/38878700939)。**并非当前主线的新共享组件或正式安装原生 PASS**。

## 五、文档所有权与避免漂移

- 本文件：**产品目标、已确认架构硬边界、独立 P0 门禁**；不要按每一轮提示词另建一套总规格。
- `docs/api/sidebar-tool-development.zh-CN.md`：仅记录**确实实现**的自定义工具组件导入与打包方法。
- `docs/api/page-ui-frameworks.zh-CN.md`：仅记录**确实支持**的 Page UI / Standard / Developer 组件导入功能，不能照搬 Sidebar Tool 的 Vite 能力。
- `docs/framework/workstreams/`：本轮修改文件、目标 SHA、CI/Chromium 证据、独立评分与未通过缺口。
- `AGENTS.md` 与现有 Skills：只放简短执行指针/重要禁止项，不复制完整技术规格。

**优先级原则：真实用户体验和零退化 > 共享组件实际使用 > 安全/包预算 > 文档/目录命名。**
