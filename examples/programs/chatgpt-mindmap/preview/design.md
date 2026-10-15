# ChatGPT 思维导图 · 产品功能与预览设计需求

> **状态：PENDING_USER_CONFIRMATION**。本文是基于当前已核实源码建立的可测试设计候选，尚未被用户正式批准，不能冒充此前历史对话中的已确认原版。

- 日期：2026-10-15；Program ID：opendesk.chatgpt-mindmap；运行类型：OpenDesk Page Program（page-userscript）。
- 工作目录：examples/programs/chatgpt-mindmap/。
- 设计候选：preview/chatgpt.html（模拟 ChatGPT 的用户界面）。
- 技术实验台：preview/index.html（保留原始 XMind A/B/C/97 主题测试）。
- 正式程序 UI：src/answer-registry.js、src/chatgpt-adapter.js、src/view.js、assets/ui.css。
- 引擎与内容：src/xmind-adapter.js、src/xmind-convert.js、src/extract.js。
- 本文是**产品需求与设计基准候选**，不替代 docs/framework/workstreams/chatgpt-mindmap-r21.md 的技术证据。

## 1. 用户价值和产品范围

普通用户在 OpenDesk Browser 中安装并批准 chatgpt.com 网站权限一次后，打开真实 ChatGPT 对话；每条已完成的 AI 回复操作区域自动出现「思维导图」。点击该按钮，原文被暂时隐藏，当前回复内部显示来自同一套原始 XMind 引擎的可操作画布；点击「原文」后完整恢复当前回复，其他回复互不影响。

预览必须**模拟 ChatGPT 的布局，而不声称它是真实 chatgpt.com**。模拟页面不运行模型、不发送消息、不访问用户登录信息。真正的思维导图按钮由正式 createAnswerRegistry 自动注入，绝不手写固定的「思维导图」假按钮。

## 2. 页面和文件结构

| 文件 | 单一职责 | 绝对禁令 |
| --- | --- | --- |
| preview/chatgpt.html | 模拟真实聊天、用户提问、三条 AI 回复、原生操作栏与响应式外壳 | 不直接硬编码程序的思维导图按钮 |
| preview/chatgpt.css | 模拟 ChatGPT 外壳和桌面/移动主题 | 不复制正式产品画布 UI CSS |
| preview/chatgpt.js | 模拟外壳主题与复制/评价体验 | 不实现任何导图绘图和节点计算 |
| preview/app.js | 已有功能实验台驱动；引入正式回答注册器和真实 XMind Runtime | 不创建第二个 Renderer |
| preview/index.html | 保留原有引擎测试入口 | 不覆盖、不删除、不迁移原始 4 JS |
| preview/design.md | 本需求合同候选 | 不把 NOT_TESTED 宣告为 PASS |

**目录之外无额外新工具、Chrome Extension、SDK 或安装器。** 原始固定引擎 4,042,573 B 只复用 preview/ 中四份既有 JS，由 tests/xmind-provenance.json 核对原始字节。

## 3. UI 规格：模拟对话

1. **页面层**：桌面左栏展示模拟会话列表，右侧是白色为主的简洁聊天工作区；窄屏隐藏模拟侧栏，正文自适应，无横向整体滚动。
2. **会话层**：用户发言右对齐浅底气泡；AI 回答为自然文档流，不创建多余品牌标题、产品卡片或独立悬浮面板。
3. **按钮位置**：AI 回答的原生复制、喜欢、不喜欢操作栏**同一行**出现「思维导图」按钮；按钮位于操作区域相邻位置，不压住原生控件。真实站点 DOM 未验证前不得声称原生操作栏布局已获准。
4. **打开逻辑**：点击仅作用于该条回复；保留原始正文 DOM，临时隐藏后插入完整 XMind Viewer。画布初始高度约 440px，可缩放、适配、拖动、滚轮、折叠和展开。
5. **操作栏最小集**：原文 / 全屏 / 缩小 / 放大 / 适配 / 折叠或展开。刷新仅在内容变化后出现；失败时恢复原文并提示原因。
6. **视觉**：整体色彩中性、圆角克制、文字清晰，默认浅色；兼容深色，不单靠颜色区分状态。模拟壳的样式在 chatgpt.css，正式程序控件继续单独使用 assets/ui.css。
7. **响应式**：测试 320px 内容容器、狭窄工具栏换行、长中文标题、包含代码和表格的回复；触屏按钮至少 44px 按现有 CSS 条件实现。
8. **开发控件必须隔离**：宽度切换、97 主题、DOM 重建、回复更新和 Stop 只能放在折叠的「预览实验台」，不进入正式安装版。

## 4. 关键交互与状态

| 场景 | 正确表现 |
| --- | --- |
| 页面加载 | 三条已完成的模拟 AI 回复自动出现独立按钮 |
| 相同标题的 A/B 回复 | 控制器、缩放、折叠、节点身份完全独立 |
| 点击 A 按钮 | A 打开真实 XMind；B/C 不受影响 |
| 点击「原文」 | A 的原始 HTML 无损恢复；B/C 状态不变 |
| 无标题、表格、代码、引用 | 保留原始可见文本语义，不转换成虚假 Markdown 标题 |
| 内容流式中 | 不在不稳定内容上创建快照；完成后再允许交互 |
| 回复内容更新 | 标记该导图过期并允许按该条刷新 |
| 页面切换和操作栏重建 | 不重复按钮、不误绑定其他回复 |
| 全屏、Escape | 退出后回到同一回复；键盘操作与焦点可恢复 |
| 深浅色切换 | 模拟页面与已创建的正式导图同步主题 |
| 禁用、撤权、卸载 | **正式产品待实现/验收**：必须停止继续执行，并清理旧页面实例 |

## 5. 安全、性能与真实性

- 禁止向 ChatGPT MAIN 世界插入原始 Snowbrush，禁止 CDN 动态下载，禁止 Mock Canvas/SVG 假绘图。
- preview/ 的原始 XMind JS 已通过历史 CI 校验；公开 Git 跟踪**不代表整个 Snowbrush、GSAP 3.5.1 及传递依赖获得生产分发授权**。
- 已发现 Snowbrush 全局 style#snowbrush_style 残留：预览环境可能仍有此样式；不能把调用 controller.close() 当作生产隔离验收通过。
- Page Program 正式 Runtime 仍存在 E_XMIND_RUNTIME_UNAVAILABLE；不能把独立模拟页运行成功等同于真实自动安装。
- 开发测试应记录运行截图、实际 .topic 节点数量、控制器结果、异常、未预期网络请求、关闭后的 DOM/全局样式状态。
- 不上传聊天内容，不创建独立安装权限系统，不直接扩大 512KiB 限制以装入 4MB 引擎。

## 6. 来源、状态与验收合同

- **设计来源**：当前功能源码、原始 XMind 预览和用户明确描述的「模拟 ChatGPT，对每条 AI 回复插入按钮并原位生成导图」。本 chatgpt.html 为**本轮提案**，尚不能声称恢复了某份历史获批 UI。
- **设计状态**：PENDING_USER_CONFIRMATION。用户确认后才可更改为 APPROVED，并锁定 Git SHA/文件 Hash。更改设计必须更新本文件、预览和 UI 合同测试。
- **测试状态**以当前真实结果填写，推荐字段：HTML_GIT_TRACKED、DESIGN_GIT_TRACKED、FIXED_ENGINE_HASH、MOCK_CHATGPT_BUTTON_AUTO、ORIGINAL_XMIND_RENDER、ANSWER_ISOLATION、RESTORE_ORIGINAL、RESPONSIVE_320、DARK_MODE、GLOBAL_STYLE_ISOLATION、NATIVE_INSTALLED、CHATGPT_REAL_PAGE。
- **验收目标**：功能完整性、视觉一致性、信息保真、可操作性、响应式、稳定性、性能、安全和生命周期逐维 95/100 以上；未拿到真实 Chrome/真实产品证据的维度应标记 NOT_TESTED，不给虚假分数。
- **工程门槛**：完成设计预览 Git 归位、浏览器真实交互验证并由用户确认后，才能把它作为正式 UI 的视觉合同；随后继续可信 Runtime、许可证和原生安装，不因本阶段视觉预览完成提前宣称正式产品已可安装。
