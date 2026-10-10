# Sidebar Dev 源码来源入口：直接编辑 / 本地项目

日期：2026-10-10。范围：`src/ui/tool.html`、`src/ui/tool-shell.css`、`src/ui/local-project.js`、回归合同和对应使用文档。本次不重构 Native Host、MCP Provider 或 `npm run dev` 的热更新机制。

## 用户问题和选择

- 「手工草稿」歧义：改为「直接编辑」，始终是默认输入框，不暗示需要云端网络。
- 「本地项目」入口不透明：开启时就地说明编辑在电脑完成、运行才读取源码；明确提示 Native Host / Codex MCP 前置条件、路径授权、刷新和完整配置文档入口。
- 安全默认：每次 Sidebar 新会话默认 Switch 关闭，不因旧 storage 中的 `local:true` 自动发本地 provider 请求。仅记住所选项目 bindingId 和本地 paramsText，切回不丢直接编辑内容。
- Dev 各处 select 采用一致的右侧箭头，预留 34px 文本安全区、右侧 11px 固定留白；依然使用原生 select 行为、焦点和键盘导航。
- 用户按需读取最新文件；不得自动执行、保存时隐式 run，亦不得与扩展源码热更新混为一谈。

## 验收路径

1. 静态合同：`tests/environment/sidebar-product-contract.test.mjs` 断言 Switch、默认术语、就地说明、外链安全和下拉箭头间距。
2. 状态合同：`tests/environment/script-editor.test.mjs` 验证旧 `local:true` 仍启动在手动输入框，不请求 provider、保留项目选择、只有明确开启后查询连接，且不再保存 mode。
3. 功能回归：`npm run check`、`node --test tests/environment/script-editor.test.mjs tests/environment/sidebar-product-contract.test.mjs`；涉及 `src/ui/tool.html`/CSS 实际显示的 Chrome 人工验收仍需要可访问的 Mac + Chrome。
4. 人工验收：新开 Sidebar「开发」显示直接编辑；开启本地项目前无隐式连接；开启但离线展示连接说明；授权/连接后显示项目，点击运行才读源码；窄宽度下箭头与文本不重叠、键盘 Tab/Space/Enter 可用；关闭开关编辑器草稿保持。

## 本轮边界与风险

- MCP 仍需要 Node.js 和本机 Codex（或其他 stdio MCP 客户端）；普通用户「启动即用」的独立 Native 包装属于后续 Host/Product 规划，不可将本轮 UI 文案视为已实现免 Node。
- 需确认与其他并行主分支提交不存在冲突后才能直接集成；不能替代同包真实 Chrome 测试或正式发布验收。
