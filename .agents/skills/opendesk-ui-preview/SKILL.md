---
name: opendesk-ui-preview
description: Generate and check an offline OpenDesk Sidebar App HTML design preview using canonical buttons and tokens, with an attachable ChatGPT prompt OR generate a source-bound offline preview from an existing installed tool package; not arbitrary website design.
---

# OpenDesk 规范化 HTML 设计预览

网页模型不会因仓库中存在 skill 就获得其中内容。给网页对话的是**实际生成的 HTML 附件和提示词全文**，不是本地路径或“已阅读规范”的声明。

先按根 AGENTS.md 核对 main、目标文件 diff、工作流与输出资源。新原型运行：

```sh
node scripts/sidebar-preview-kit.mjs create --out artifacts/sidebar-preview-kit/<本次唯一目录> --title "工具名称"
```

生成的 `preview.html` 内联当前 `src/ui/design-tokens.css` 与 `src/ui/design-system.css`；`chatgpt-prompt.txt` 可直接粘贴，HTML 须实际附给网页模型；`manifest.json` 保留输入与文件 SHA。输出目录已有时换一个新目录，不覆盖旧证据。

这是**独立离线设计文档**。只修改 `#od-preview-app` 内部 HTML 和 `#od-preview-behavior` 模拟 JS；保护其他区域和全部 CSS。用 od-* 公共组件，不另造按钮视觉。支持正常/空/失败/撤权/忙/长文本；主操作、表单错误、取消、危险确认和焦点恢复要实际可演示。实际扩展、Host/SDK、安装包与网站权限不在本阶段调用。

回收模型返回的完整文件后运行：

```sh
node scripts/sidebar-preview-kit.mjs check /absolute/path/returned-preview.html
```

失败则针对错误修订；过期则重生成并迁移两个可编辑区域。lint 通过只证明静态合同，不能证明任意 JS 安全、真实模型读取附件、视觉或原生功能。用独立离线浏览器上下文进行真实点击/键盘、深浅色与 computed style 检查，再独立评审方案；无证据项记 NOT_TESTED。默认不做缩放或 Side Panel 物理宽度专项测试。

完整目标、验收表、网页附件回收、生产迁移边界见 [预览套件合同](../../../docs/api/sidebar-preview-kit.zh-CN.md)。真实实现按 [应用开发 skill](../opendesk-sidebar-tool-dev/SKILL.md) 接续；不可把完整宿主 CSS/脚本从此设计文档注入动态工具 iframe，也不可把静态设计稿当作可安装包。独立方案评分逐维 ≥95 后才报告方案达标；产品通过须另有同候选原生证据。

## R32.3：平台原型、候选评估与结论回写

平台 UI、书签 Tree、反复失效的 Select/Combobox 或 React 选型任务，先读 [现行架构](../../../docs/architecture/browser-ui-r23.zh-CN.md) 的 R32.3 补充与 [续接 GOAL](../../../docs/framework/prompts/goal-ui-platform-r32.3-document-driven.zh-CN.md)。目标是复用成熟视觉和行为，不是每个工具重写树、菜单和焦点系统。

保留原生基线，优先制作书签 Tree/Select/Menu 的最小真实 React 候选。React Aria 与 Radix 加明确 Tree 方案均待验证，不以旧聊天评分封版，不强制制作七套完整产品或先重写五个 Tab。相同数据和场景下比较实际交互；HTML 模拟、实际库运行、静态 Chrome 与已安装工具证据分开。

旧容量是可调整的内部预算，不能在候选筛选前按旧值排除 React；实际容量变更由 [打包 Skill](../opendesk-sidebar-tool-package/SKILL.md) 接续全链一致性，不改变权限、CSP 或安装语义。按需构建并复用同源公共视觉，不能跨 iframe 借用宿主特权。

每阶段审计、原型、选型、预算实验完成后，立即写回架构与 [R32 工作流](../../../docs/framework/workstreams/ui-platform-r32-20261015.md)：状态、决定、理由、证据、版本、限制和下一步；合同变化再同步相关 Skill。用户已要求保存时正常提交授权 main 文档，不以下载文件代替。当前环境不能直接渲染 HTML 时，明确说明并生成完整可打开文件；不得假报模型已读附件或交互通过。

## 生产工具同源预览（Preview Contract R1）

**阶段区别**：前面的 `sidebar-preview-kit.mjs` 是可编辑的网页对话**设计稿**，并非正式工具组件。已存在真实独立工具时，使用以下**安装包同源预览**，不要把设计稿直接冒充可安装工具，也不要创建另一套 UI Skill。新增能力以 [生产预览构建/验收合同](../../../docs/architecture/browser-framework/ui-preview-contract-r1.zh-CN.md) 为准。

源码→共享资源→正式包→预览：`src/ui/design-tokens.css` / `src/ui/design-system.css` → `scripts/preview/shared-tool-design.mjs`（构建期提取非特权视觉规则）→ `scripts/build-sidebar-tool.mjs`（现有正式可安装包）→ `scripts/preview/build-preview.mjs`（同样的 HTML、CSS、业务 JS，只有 SDK 适配边界切换为内存 Mock）。本轮**只有 quick-notes / side-panel** 拥有真实适配；网页注入和独立页面请求必须报未实现，不能用 iframe 假装正式 ShadowRoot。

从仓库根目录执行：

```sh
node scripts/preview/build-preview.mjs --tool quick-notes --surface side-panel --scenario success --theme light --width 360 --height 760
node scripts/preview/check-preview-contract.mjs
node --test tests/environment/sidebar-preview-contract.test.mjs tests/environment/sidebar-quick-notes.test.mjs
```

可选 `--scenario success|empty|error|loading|permission-denied|untrusted`、`--theme light|dark`、`--width 320|360|400|480`，离线自包含结果在 `artifacts/previews/quick-notes/`。输入变动后**先重新生成并审核**，再显式 `node scripts/preview/check-preview-contract.mjs --update-lock`；CI 会依据原始正式资源与源码 SHA 检出陈旧产物。生成 HTML 不允许手修，Mock 无真实 Chrome/网络/存储/任务权限；动态内容仍走业务 JS 的安全文本赋值。不得替 sandbox 注入宿主完整 CSS。

必须运行非法自定义按钮样式与过期 Token 两项反例测试，记录 Node/CI 结果。Mac 实装 Chrome 和网页注入环境是另一证据等级：截图、计算样式、键盘交互、缩放及包身份没有验证，不写 95+ PASS。新工具应在最小范围实现正式共享 UI 及对应 Mock 适配，再扩大 CLI 允许范围；仍由原官方安装器管理权限和生命周期。
