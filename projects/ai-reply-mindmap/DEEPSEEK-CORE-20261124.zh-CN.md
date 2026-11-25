# DeepSeek 开发阶段核心验收 · 2026-11-24

目标：在真实 `chat.deepseek.com` 对话中，从助手回复原有的复制操作旁打开对应的层级导图，并能安全返回同一条原文。无需额外设置 DeepSeek 定位规则。

| 用户操作 | 通过条件 | 本轮证据 |
| --- | --- | --- |
| 从首页点开历史对话 | 无需刷新；每条已完成的助手回复在原生复制后紧邻一个导图入口。首页和用户消息无入口。 | **旧版 FAIL**：旧版无入口，刷新后有一个，但仅与复制同排。新版定向测试通过，真实页面待装载。 |
| 从首页发新问题，观察思考和生成 | 思考区与生成中的回复没有入口；原生复制可用后自动出现一个。 | **旧版 FAIL**：实测生成中无原生操作栏，完成后出现 6 个原生操作，但导图仍未出现。新版定向测试复现了先有正文、后挂载原生操作栏的顺序，并验证入口自动出现；真实深度思考样本未验证。 |
| 点击导图、返回原文，再开关一次 | 图只取同一回复正文，保留标题和列表的层级；关闭后原文内容、结构和可访问性恢复，反复操作始终只有一个入口及至多一个导图组件。 | **旧版部分实测**：刷新后打开看到 10 个节点，关闭后正文文本和 HTML 摘要恢复。新版重复开关定向测试通过，真实 XMind 尚待验证。 |
| 重新生成、切换对话、滚走并返回历史回复 | 重新生成时移除旧入口和导图，完成后读取新正文；切换不留旧组件，返回历史只有一个正确入口。 | 新版定向测试覆盖回复变忙、同文档路由切换和历史节点移除后重新挂载；实际网站操作 **NOT_TESTED**。 |

复现使用 ego(lite) 的日常 OpenDesk 扩展（Chrome ID `ccfcjegpkdlgbclopjmadlcjedelidmf`，扩展版本 2.0.0）。通过 Chrome 原生注册及测试标签的运行记录读回：独立网页增强 `opendesk.ai-reply-mindmap` 为 **0.2.14/r11**，侧栏组合 **0.3.3** 的网页模块 `app.ai-reply-mindmap` 为 **r6**。该站权限已授予；两版只在对话路径注册，DeepSeek 首页的同文档导航不会补注入。[生成时序](../../artifacts/ai-reply-mindmap-deepseek-core/baseline-stream.json) · [旧版开关回执](../../artifacts/ai-reply-mindmap-deepseek-core/baseline-open-close.json)。

修复把精确首页 `https://chat.deepseek.com/` 加到原自动启动范围，仍只在有效对话路由识别回复。不增加网站权限、能力或安装身份。DeepSeek 使用同一回复中唯一且可用的原生复制控件作为入口定位，并在回复刷新、重新生成或切换路由时清理旧状态。ChatGPT 和 Gemini 的入口策略保持原样。

| 本机开发候选 | 版本 | 网页源码 SHA-256 |
| --- | --- | --- |
| [独立网页增强](../../artifacts/ai-reply-mindmap-deepseek-core/r12.local.opendesk-page.json) | 0.2.15/r12 | `d32d7c5421b7b33ae24be7bb40c98502c8db19cbed9f8f2b5707fd54bf6b8d0b` |
| [侧栏组合](../../artifacts/ai-reply-mindmap-deepseek-core/0.3.4.local.opendesk-tool.json) | 0.3.4，网页模块 r7 | `e7025897ceaac1fbd0d35ae433a957108270161c07afcdb9d0dbb66f2c02ab59` |

两份候选构建完成。DeepSeek、ChatGPT、Gemini 适配器、回复视图生命周期、侧栏定位及安装身份的定向测试 **60/60 通过**。本地项目试运行返回 `E_NATIVE_NOT_READY`；新增首页执行路径须在既有「扩展 → 导入」审阅后才能装载。新版安装、原页运行、两种身份同时更新后的去重以及 ChatGPT/Gemini 新版原页冒烟仍 **NOT_TESTED**。新版装载后先从新打开的 DeepSeek 首页进入，核对实际修订及源码摘要，再按上表测试。XMind 候选仅供本机使用；正式发布、评分及完整矩阵不在本轮范围。
