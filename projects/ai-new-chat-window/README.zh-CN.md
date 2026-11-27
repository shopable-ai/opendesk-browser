# AI New Chat / AI 新建对话 · 项目导航

## 当前版本：扩展应用 1.0.2

AI New Chat 从「扩展 → 应用」安装和打开。官方 Catalog 将它设为首次安装的默认应用；已有 OpenDesk 安装可从官方应用列表安装，或通过「扩展 → 导入」选择 [正式应用包](ai-new-chat-window.opendesk-tool.json)。如果曾手动安装旧的 AI New Chat 网页增强（0.1.x），先在「扩展 → 网页增强」停用旧项，避免同一网页显示两套按钮。两种安装有不同的身份，应用安装不会静默改动旧项。

侧栏提供站点操作说明。原网页按钮由应用内网页模块提供：ChatGPT 普通或项目对话在新标签页打开；Claude、DeepSeek、Gemini 保留原窗口行为。模块仍限四个站点的顶层页面，需浏览器允许对应网站访问及「允许用户脚本」。关闭侧栏后，已获授权的网页按钮仍可用。

ChatGPT 项目行的 ↗ 按钮在官方「···」左侧，悬停或键盘聚焦时显示。↗ 显隐时，官方「···」和「＋」不会被它推移。

内置简体中文、繁体中文、英文、日语。在「语言与翻译管理」可导入 AI New Chat 的独立语言包；侧栏即时更新，网页按钮的提示、无障碍名称和错误文案在该网页下次正常刷新时更新。原文维护在 [locales.json](locales.json)。

同一项目交付一个应用 JSON，内含侧栏和 `app.ai-new-chat-window` 网页模块。开发检查使用 `npm test --prefix projects/ai-new-chat-window`，打包使用 `node scripts/build-sidebar-tool.mjs projects/ai-new-chat-window`。以下内容保留 0.1.x 的历史验收。

## 旧网页增强记录：OD-AI-NEW-CHAT-R2.4（仅 ChatGPT）

**状态（2026-11-27）：** 已登录 Ego 上一轮通过原审阅入口更新到 0.1.4/r3，并读回原生注册。项目 A 已验证新对话首发和刷新后归属；项目 B 已打开正确项目，首发待验证。一次导航后项目与普通新增入口同时消失；留存页的 A/B 项目行、身份和操作槽仍在，优先核对该文档的安装启动链。当前未完成核心验收。

**用户目标：** 鼠标经过 ChatGPT 左侧项目标题行显示新增图标，原生折叠、菜单和＋仍可操作。一次点击在独立标签页进入正确项目的新对话，首次用户主动发送正确归属，源标签页的生成和草稿保持原样。普通新聊天也默认独立开页。

**旧运行身份：** projects/ai-new-chat-window/，独立 Program ID 为 opendesk.ai-new-chat-window。以下记录对应旧 Page USER_SCRIPT。

## R2.3-CLOSE 历史修复（当时候选 0.1.1）

- destinations.js：ChatGPT 只接受现有证据中的 32 位十六进制项目 ID（允许合法连字符 slug）；排除空、仅 query/hash、无效 ID 和未经归一化的 opener 目标。正常 href 继续经现有归一化；其他站点路由保持不变。
- buttons.js：明确无效 href 不再退回容器 ID；无效旧项目行的直接链接不误判为普通新聊天；主区原生入口点击时重新核验；点击时发现目标无效、请求拒绝或同步异常，通过已有 owner.toast 发出可关闭的持久错误提示。正常 noopener 返回 null 不报成功或失败，不重试。保留最小 opener 与原生命周期。
- main.js、package.json、Program ID、Page 权限和安装合同未改；0.1.1 保留为候选版本。

## 文件导航

- [DESIGN.md 第七节](DESIGN.md)：最小技术合同，7.6–7.7 为已有候选及修复，7.8 为 R2.4 的实测边界。
- [REQUIREMENTS.zh-CN.md](REQUIREMENTS.zh-CN.md)：原始目标与功能合同。
- [RESEARCH.md](RESEARCH.md)：已有资料与证据，禁止重复研究。
- [ACCEPTANCE.md](ACCEPTANCE.md)：历史证据及本轮测试、剩余真实验收和放行门禁。
- src/、tests/：正式业务源及定向回归；[preview/index.html](preview/index.html) 仅历史模拟原型。

## 实际测试与剩余阻塞

0.1.4 已有项目校验、Node 11/11、合成 Chromium 11 组和 Page 打包通过记录。上轮实测普通入口只开一个非项目首页，源 URL 和合成草稿保持原样。ChatGPT 可能在新首页或新项目页恢复普通首页的草稿，原生项目＋也出现同样行为。无旧消息与编辑器为空分别判定；扩展不读写草稿或站点存储。

按 [ChatGPT 核心验收清单](ACCEPTANCE.md#r24-chatgpt-核心验收清单) 从留存异常文档开始，先对照生命周期和真实项目行。待复测原生操作、B 无草稿时的首次发送与刷新归属、源页流式生成、同候选停用与恢复。Ego TaskSpace 37 已暂停浏览器控制；恢复后沿用已有登录态和 QA 页。尚未发布。

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
