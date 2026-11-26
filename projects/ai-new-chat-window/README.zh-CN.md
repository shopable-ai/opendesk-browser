# AI New Chat / AI 新建对话 · 项目导航

## 当前任务：OD-AI-NEW-CHAT-R2.3（仅 ChatGPT 正式实施）

状态：SOURCE_REVIEWED / USER_DOM_AND_ROUTE_SAMPLE / PREVIEW_MOCK_PASS / REAL_CHATGPT_NOT_TESTED / R2_IMPLEMENTATION_PENDING（2026-11-26）。当前 0.1.0 业务源码尚未按 R2.2 方案修改。R2.3 仅收敛本轮范围，不重新设计。

**目标：** 在 ChatGPT 左侧已有项目条目鼠标经过/键盘聚焦时显示新增图标，一次点击打开独立标签页中的同项目新对话，原页任务和草稿不受扩展主动影响；普通新聊天也默认独立标签页，两个入口不串线。

**唯一 owner：** `projects/ai-new-chat-window/`，Program ID `opendesk.ai-new-chat-window` 不变，main 分支。不要创建新项目、目录、平台框架或增加权限。已有 Claude、Gemini、DeepSeek 代码与功能保持原样；其他站点专项实测、新项目功能及新站点适配后移，不是本轮交付前置。共用代码变更只需已有自动化定向回归，发现直接引入的回归须修复。

## 文件导航

- [DESIGN.md 第七节](DESIGN.md)：R2.2 最小技术合同及 R2.3 当前实施边界（7.5）；优先真实 DOM/href→URL→独立标签页实验，成立即最小实现。
- [REQUIREMENTS.zh-CN.md](REQUIREMENTS.zh-CN.md)：原始目标与功能要求。
- [RESEARCH.md](RESEARCH.md)：已有公开资料、真实 DOM/路由样本、各站候选及证据限制，已保存；不重复网络研究，不把其他站点候选当作当前工作。
- [ACCEPTANCE.md](ACCEPTANCE.md)：相关真实验收、历史 Mock 及放行标准。
- [preview/index.html](preview/index.html)：历史模拟原型，不代表真实安装效果。
- `src/`、`tests/`：现有正式业务源码及测试；在当前目录增量修改。

下一步直接由具备授权登录态 Chrome 的本地 Codex 执行：验证 ChatGPT 实际项目行 DOM 与直接新 composer，修改现有代码、运行相关测试、构建并授权安装、真实验收、修复、提交 main。核心证据未通过时不可宣称完成，不自动发布。此前 Browser Core 连接返回 429；当前仅更新文档，未完成本地验证、实现、构建或安装。

---

## 历史实现说明（0.1.0，保留原文）

### AI 对话新窗口（R1.1 · 项目悬停入口修正）

**目标**：不覆盖当前 AI 网站标签页，在原生“新对话”及项目新对话入口旁，增加一个 ↗ 图标。原网站按钮与导航行为保持不变；旧标签页的生成过程和草稿不修改。

- 原按钮：仍在当前标签页打开新对话。
- 新 ↗ 按钮：向浏览器请求独立窗口；Alt + 点击请求新标签页。
- ChatGPT / Claude 项目列表：在明确的项目条目旁增加 ↗，从该项目入口建立新会话，不根据普通 `/c/` 对话路径猜测项目身份。
- DeepSeek、Gemini：首版支持普通新对话，不虚构项目能力。

## R1.1 为什么要修改项目按钮

ChatGPT 项目列表里的官方「＋ 新建」可在鼠标经过项目行时才显示。旧 R1 在未发现原生＋时，错误地把 OpenDesk ↗ 直接插在项目名称后面；这会造成默认常显和位置错乱。

修复后只有从同一项目行的可信 URL 与唯一原生新对话操作建立对应关系时，才创建 ↗：

- 平常不显示；鼠标悬停项目行时，原生＋与新 ↗ 同时出现，鼠标移出一起隐藏。键盘导航时通过焦点显示；鼠标点击后移出会隐藏。
- 原生＋若在悬停后动态插入或卸载，OpenDesk ↗ 跟随增删。未找到原生＋时，**不再退化为项目名称旁的常驻按钮**。
- 原生＋、项目标题、菜单和折叠行为保持原样；项目 URL 更改后重绑，不能猜项目、误开普通会话。

交互预览位于 `preview/index.html`，悬停专用 DOM fixture 位于 `tests/fixtures/project-hover.html`。本轮独立 Chromium 本地 DOM 模拟已覆盖默认隐藏、悬停、键盘焦点、动态＋、原按钮保留、SPA 重绑和卸载清理；这是模拟网页证据，不等于真实登录网站验收。

## 工程边界

使用已有 OpenDesk Page Program `USER_SCRIPT` 与 `@opendesk/ui` 生命周期，不改平台宿主、安装、权限或其他扩展。本站源按固定 HTTPS origin 匹配，只扫描导航及项目列表，页面切换时撤销陈旧按钮，停用时清理监听与定时器。不会读取或提交聊天正文及草稿，不修改原生点击事件，也绝不退化为当前页导航。

当前通过 `window.open` + `noopener,noreferrer` 发起请求。**是否产生完整浏览器窗口、浏览器弹窗或被阻止取决于 Chrome 策略**；如要求保证 `chrome.windows.create({type:'normal'})` 效果，必须在现有可信宿主内独立审核接线，不能假称已实现。

## 开发与验证

```sh
node --test projects/ai-new-chat-window/tests/*.test.mjs
npm run build:program -- projects/ai-new-chat-window
```

本工具是独立源码候选，**未加入官方 Page Catalog，未安装到用户 Chrome**。本地 6 项固定路由、同源、项目上下文和请求测试通过；Chromium 受控 DOM 悬停测试及交互预览通过。真实已登录 ChatGPT / Claude 的项目新聊天行为、浏览器窗口结果、弹窗拦截、项目会话最终归属和本机安装仍 `NOT_TESTED`。以仓库 `preview/index.html` 为最新交互预览，不将其当作 Chrome 正式验收。
