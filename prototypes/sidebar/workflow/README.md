# 工作流主版界面

**当前优先评审入口：[`../workflow.html`](../workflow.html)**。

本文件是完整、可离线打开的单页 HTML 交互设计基线。用户界面只显示「工作流」，不带冗长版本号。延续 R23.9.2 的 AI 设置 Bottom Sheet，同时继承已经批准的「历史、新对话、新工作流」独立图标和简洁页面；发送输入区取消「标准/只读/每次确认」切换器，默认只展示左侧设置图标 + 当前模型名称，右侧发送图标。真实需要的网页摘要披露、危险操作确认及拒绝仍作为发生时的对话内处理；不可用视觉删除替代安全撤权。

## 来源、旧版与验收边界

- 正式 React/Host 代码仍为 `src/ui/react/tabs/workflow.tsx`、`src/ui/react/main.tsx`、`src/ui/workflow/workflow-view.js`。**本 HTML 是获批准设计候选，不等于已迁移或已安装的正式 React 产品**。
- `workflow/index.html` 保留原 R23.9.2 的历史测试基线；原有 `r232-chrome.mjs` 不受本轮影响。下一轮迁移正式 React 时以当前 `workflow.html` 的交互设计为视觉基准，并保留单一 React DOM Owner。
- `workflow.html` 的正常、历史、两个创建入口、AI 来源切换、Escape、拒绝与草稿保护均为纯内存 Preview Adapter；不连接 Native/Codex/Provider/真实网站，不得宣称真实运行成功。
- 不在输入框常驻列出权限/授权说明，也不承诺绕过真实权限。变更时仅替换当前主版文件及对应定向合同，历史版与旧 CI 继续保留。 
