# R1 技术与竞品研究 · 2026-11-26

任务 OD-AI-NEW-CHAT-R1；仓库调查基准 bdb0f4089bb8310f2bb35d7240cf5c7caf216599。证据类型：SOURCE（仓库已读取）、OBSERVED（浏览器只读观测）、DOC（公开资料）、HYPOTHESIS（未验证）。未把社区反馈或已有测试当作当前真实网站验收。

## 仓库实际调查
| 证据 | 结论 |
|---|---|
| projects/ai-new-chat-window/package.json | 0.1.0、opendesk.ai-new-chat-window、page-userscript、四个 HTTPS origin、document_idle、top-frame USER_SCRIPT；现有唯一 owner。 |
| src/main.js、src/buttons.js（相对本项目） | createPageUI 受管生命周期、nav/aside 发现、shadow host、hover/focus、原生操作匹配、50ms 调度/1.6s 轮询、点击 stopPropagation、动态清理。未验证新 UI 变体；MutationObserver 只监听 childList 且从 documentElement 收到全页变更，需关注流式正文负载与 href 原位属性更新。 |
| src/destinations.js | 默认 popup=yes/1240x860，Alt 请求 tab；固定普通路径；ChatGPT 仅接受 /g/g-p-…/project，Claude /project/…；全 URL 当身份且 strip query/hash。regex 可能接受带 slug，但并不证明 composer；requestNewChat 返回 true 只表示请求发出，非新 tab 已创建；缺点击时重新解析与专门去重。 |
| tests/destinations.test.mjs、README.zh-CN.md | 六项旧 Node 测试及历史 Chromium fixture 记录；未在本轮重跑、不能证明真实网站。README 明确未正式安装/发行；项目目录本轮未读到正式包。 |
| ../ai-send-queue/README.zh-CN.md | 发送队列负责 composer/发送与受控网页入口，不能复用为本功能 owner；网页反馈使用 Page ui.toast，不借用 Sidebar ui.notify。 |
| ../../docs/api/page-userscript.zh-CN.md、../../docs/framework/ui-api.zh-CN.md | Page USER_SCRIPT 公开 DOM、@opendesk/ui、on/observe/onDispose/toast；不具备 Sidebar request 或原生 chrome.runtime；现有隐藏 owner.host 的 toast 是否可见须实际验证。 |
| ../../src/platform/chrome/browser-tabs.js | 已有可信 Host 的 createBrowserTabHost，browser.tabs.create 受 packageHash、installation identity、grant、one-use intent 审阅；仅凭存在不能断言 Page 有该能力。../../src/platform/chrome/tabs.js 是精确文档固定注入，非一般打开 API。 |
| ../../src/i18n/、../../manifest.json | 根已有 zh-CN/en/ja/zh-TW 及 tabs/userScripts 等权限，但 Page 不自动拥有 Host 特权；优先业务小字典、现有 locale 合同，禁止增加权限或直接导入 Host 内部。 |
| ../../AGENTS.md、../../docs/architecture/extension-project-layout.zh-CN.md、../../.agents/skills/opendesk-program-publish/SKILL.md | 现有项目保留唯一 owner；独立 Page Program 走原 Authority，安装归 扩展→网页增强；未证明 SDK 缺口不扩平台。 |

## 真实页面只读证据与缺口
本轮读取浏览器标签清单，发现多个当前项目对话 URL 形如 https://chatgpt.com/g/g-p-{id}-{slug}/c/{chat-id}（已脱敏，不将用户真实项目/对话 ID 写入公开仓库）。已证实的是现有项目对话路由；不是项目首页、直接新 composer、DOM anchor 或官方点击行为。原 regex 接受任意部分连字符，不能当作稳定 ID 解析合同。待本地观察真实 project row、official pencil/+、原生导航的 before/after URL、可编辑空白 composer 与首次发送归属；记录稳定 ID 与 slug 在重命名后的变化。不要通过 /c/ 反推无项目的普通 chat；不要将项目标题或同名文字当 ID；不要盲目构造 /project。

若项目 row 不是 anchor，优先同一 row 内可核验公开属性/已渲染项目链接（含明确所属项目的子对话链接，仅作为 identity 信号），不读 React 私有 fiber 或接口。证据不足时 fail closed。只有实际验证的 canonical 新对话/项目入口才允许打开。当前没有对登录态页面执行点击、发送、DOM 选择器验证或新页路由验证。

## 公开研究
- OpenAI Projects：https://help.openai.com/en/articles/10169521-projects-in-chatgpt — DOC：项目原生聊天/文件/指令上下文及访问控制。未声明稳定新对话 URL 开发契约。
- OpenAI Academy：https://openai.com/academy/projects/ — DOC：同一项目聚合上下文与历史。
- Real Links for ChatGPT：https://www.otterpotter.org/real-links/ — 竞品自述，普通新聊天支持中键/Ctrl/Cmd，新标签操作；明确 projects not yet。未安装实测。
- Project Sidebar for ChatGPT：https://chromewebstore.google.com/detail/project-sidebar-for-chatg/cciaaeldlcahjdeejfnechbkchbdfkgk — 竞品商店说明，项目分组与本地管理，非已证实一键新项目对话。
- 普通新聊天中键问题：https://community.openai.com/t/please-support-middle-click-ctrl-click-on-new-chat/1403400 — 2026-10-05 社区需求证据。
- 项目侧栏变化：https://community.openai.com/t/projects-on-side-menu-are-gone/1400483 — 2026-09-28 支持人员回复指向项目名称旁 pencil；另有用户报告项目组展开及 Project Home 改变。不是当前账户 DOM 合同。
- 项目历史：https://community.openai.com/t/project-sidebar-does-not-show-chats-added-to-a-project-afterward/1403758 — 2026-11 社区讨论提示 pinned/recents 可影响显示；归属验收不只看 Recents。
- Chrome Tabs：https://developer.chrome.com/docs/extensions/reference/api/tabs — service worker/extension pages 可 tabs.create，不需要单为创建申请 tabs 读敏感元数据权限；Chrome API 能提供 tab 回执，但不能证明项目 composer。
- MDN anchor：https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/a 和 noopener：https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/rel/noopener — target=_blank 隔离 opener；避免嵌套交互控件；浏览器实际 tab/window 受用户策略影响。
- MDN window.open：https://developer.mozilla.org/en-US/docs/Web/API/Window/open — 无 popup feature 通常请求标签页，浏览器决定；noopener 返回 null，不能将 null 解释成必然拦截，也不能将函数返回 true 解释成已打开。
- MDN MutationObserver：https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver — 观察、属性过滤、disconnect。

## 决策
C：现有独立 ai-new-chat-window 原位迭代 97/100；A 新建 ai-new-chat 68，B 合并发送队列 74，D 新建平台框架 78。均为设计自评。优先公开 DOM + 可信同源链接 + Page Program；若严格 tab/结果回执或 B 内官方操作有已证实的 Page 缺口，才进入可信 Host 方案单独审查。现阶段 SDK_GAP_NOT_PROVEN。未发现已证实全面满足项目独立新聊天的竞品，不等于不存在。
