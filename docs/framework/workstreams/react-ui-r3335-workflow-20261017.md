# R33.3.5 · 工作流 Tab R23.10 React 可信 UI 交接（2026-10-17）

> 证据范围：正式源码所有权整改 + 源码同源 Chromium fixture；真实已安装扩展和 Mac Native Host 属于独立验收。本文不是 95+ PASS 证明。

## 继承基线与设计审计

- 工作流：`prototypes/sidebar/workflow/index.html`，R23.9.2 决策文档，仍是离线模拟设计基线；`src/ui/tool.html` 是正式 DOM。
- 开发：`prototypes/sidebar/develop/index.html` 精简参考，`r2-full-preview.html` 用于防功能回退；正式编辑器原 `script-editor.js` 独占 IME / 草稿 / 参数和 Host。
- 扩展：`prototypes/sidebar/extension-center-r47-frequency-first-preview.html` + `src/ui/extension-center.css`；已由 React 管理的行/详情/工具栏保持不变。
- 本轮已实读 `.agents/skills/opendesk-extension-ui/SKILL.md`、`.agents/skills/opendesk-ui-preview/SKILL.md`、`src/ui/design-tokens.css` 与 `design-system.css`。所有宿主共用 `od-*`；不把宿主 CSS 带入 iframe 或网页。

| 区域 | 已确认差异/问题 | 正式源修复 | 保留的差异/阻塞 |
| --- | --- | --- | --- |
| 工作流顶部 | 正式版「＋」二级菜单，与 R23.9.2 独立三操作冲突 | 复用 `od-page-head/title/actions` 与 `od-icon-button`；历史、新对话、新工作流三个独立 React 图标 | 恢复对话移入按需历史管理；未保存工作流仍须明确确认 |
| 工作流 AI 设置 | `details` 嵌入底部输入卡，与 Bottom Sheet 不一致 | 单根 React Portal 模态、背景 inert、独立滚动、Escape/关闭/背景/Tab 约束/焦点恢复；原 Provider 节点无克隆搬入并还原 | 未启用时不得宣称 Native 已连接 |
| 工作流对话 | 旧业务同时直接 append DOM，不具唯一 React child owner | React `WorkflowTranscript` 独占 transcript children；由既有 WorkflowView 单一内存列表驱动，流式 delta 安全渲染纯文本 | 步骤表单、运行结果与输入 textarea 仍是旧业务 DOM；后续逐区域转移 |
| 工作流纵向节奏 | 旧 CSS 混用 9/10px | 流水区 12px 和区块标题 8px，复用 `--space-*` | R23 原型单文件 CSS 历史规则未同步，作为对照不改批准基线 |
| 扩展工具栏 | `gap:7px`、`margin-bottom:10px`、34px 魔法常量 | `--space-2/3`、`--od-icon-size`，保留窄屏例外 | 扩展信息架构与工作流对话当然不同，不机械统一 |
| 开发独立预览 | 原型默认宽 420px、内边距16px，不等于 360px 正式侧栏可用内容宽度 | 本轮未用超宽页面掩盖 Sidebar 评判，以宿主正式 token 为基准 | 原型未来改为可切换 360/420/520px，与正式源码同源属于待办 |

## 每区域 DOM 和业务数据所有权

- 唯一 `createRoot` 位于 `src/ui/react/main.tsx`；`src/ui/react/tabs/workflow.tsx` 只是同根 Portal。
- React：工作流标题操作按钮 children、对话消息 children、AI 设置模态壳及焦点控制。
- WorkflowView（唯一业务来源）：聊天数据/流式 delta、草稿、计划进度、Native/HTTPS provider、网页摘要披露逐轮授权、消息承诺、历史、Run/Stop、编译结果、Revision 与 host 回读；React 仅呈现快照和转发可信原生事件。
- Provider 控件实际 DOM 节点（包括密码 input）仍属原 `workflow-view.js`，只 reparent 到 sheet；关闭不清空配置、不持久化 API Key。
- 开发/扩展原已验收 React 交接不重新创建 Root；用户 sandbox 工具保持 opaque-origin iframe。
- 原会话 origin + 30分钟 Codex 摘要许可复用，HTTPS 每轮单独确认；发生 Provider/配置变化中断未完成的规划。没有把网页摘要批准当成填写/点击/提交授权。

## 验收等级、应当补齐的证据

1. `tests/environment/workflow-ui-states.test.mjs`：三独立图标/Portal/可访问性静态合同。
2. `tests/environment/workflow-focus.test.mjs`：真实业务的 Node 组件焦点/草稿/授权拒绝/历史，不是 Chrome。
3. `tests/environment/react-sidebar-r333.test.mjs`：TSX 转换与可信边界。
4. `scripts/tests/react-sidebar-r3331-browser.mjs`：源代码 Vite + real Chromium CDP 点击、模态焦点/输入保留/卸载、消息文本转义；`SOURCE_UI_SIMULATION_CHROMIUM`，不代替安装验收。
5. 同 SHA 执行 `npm run check`、定向 workflow tests、`npm run build`、`npm run build:dev`、`npm run verify`、`npm run build:size`。只接受该提交原始 CI/命令回执。
6. Mac 本地需先确认工作树和并行 Agent，禁止无条件覆盖；装入真实 `dist` 后在 `http://127.0.0.1:43111/demo-form.html` 验证两轮姓名填写和网页真实读回；分别记录 Commit SHA、Extension ID、安装目录、包哈希、Native Host/Codex、RunId、ResultId、sourceHash、任务退休与无导航/提交证据。
7. 当前会话无法访问用户 `/Users/shopme/Documents/workspace/opendesk-browser` 与 Mac 原生 Chrome，`INSTALLED_EXTENSION_NATIVE_CHROME=NOT_TESTED`；单独 HTML 设计模拟不得当作通过业务执行链的证据。

## 尚未关闭的产品迁移债务与反方审计

- 输入编辑器的 IME/Undo/选区、步骤列表/参数/结果/审批的完整 React owner 仍未转移；迁移前需有明确 snapshots 和取消/撤权边界。
- 三份独立 HTML 原型尚未完全同源生成，正式布局差异未能标注「零个」；不能凭静态视觉宣称全部统一。
- Mac Native 和真实跨网站二轮效果不能从 Node/CI 结果推导；质量专家分数在对应证据缺失时一律 `NOT_SCORED`。
- 反向检查新 modal 在 300/320/360/420/520px、深色、200% zoom、Tab/Shift-Tab/Escape、reduced-motion、Native 断连和 Provider 中途变更下的真实行为，不得编造通过。

