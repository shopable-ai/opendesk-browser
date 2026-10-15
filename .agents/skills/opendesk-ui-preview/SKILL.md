---
name: opendesk-ui-preview
description: Generate and check an offline OpenDesk Sidebar App HTML design preview using canonical buttons and tokens, with an attachable ChatGPT prompt. Use for conversation prototypes that must match extension UI; not runtime tool packaging or arbitrary website design.
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
