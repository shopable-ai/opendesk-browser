# AI New Chat / AI 新建对话 · 项目导航

## 当前任务：OD-AI-NEW-CHAT-R2.3-CLOSE（仅 ChatGPT）

**状态（2026-11-26）：0.1.1 SOURCE_CANDIDATE / NODE_PASS_11 / SYNTHETIC_CHROMIUM_PASS_10 / REAL_CHROME_BLOCKED / BUILD_NOT_RUN / INSTALL_NOT_TESTED。** 继承 58d18b06bd785fa99aa4f9ceb1d517c28092c2ad；本轮已完成可证实源码缺陷的定向修复，不是正式放行版本。

**用户目标：** 鼠标经过 ChatGPT 左侧项目标题行显示新增图标，一次点击在独立标签页打开该项目的空白新对话，首次用户主动发送正确归属，原标签页任务和草稿不被扩展主动影响；普通新聊天也默认独立标签页，两个入口不串线。

**唯一 owner：** projects/ai-new-chat-window/，Program ID opendesk.ai-new-chat-window，main。维持原 Page USER_SCRIPT、权限及 Claude、DeepSeek、Gemini 既有行为；不创建其他项目、不自动发布。

## 本轮已修复

- destinations.js：ChatGPT 只接受现有证据中的 32 位十六进制项目 ID（允许合法连字符 slug）；排除空、仅 query/hash、无效 ID 和未经归一化的 opener 目标。正常 href 继续经现有归一化；其他站点路由保持不变。
- buttons.js：明确无效 href 不再退回容器 ID；无效旧项目行的直接链接不误判为普通新聊天；主区原生入口点击时重新核验；点击时发现目标无效、请求拒绝或同步异常，通过已有 owner.toast 发出可关闭的持久错误提示。正常 noopener 返回 null 不报成功或失败，不重试。保留最小 opener 与原生命周期。
- main.js、package.json、Program ID、Page 权限和安装合同未改；0.1.1 保留为候选版本。

## 文件导航

- [DESIGN.md 第七节](DESIGN.md)：最小技术合同，7.6 为历史候选，7.7 为本轮增量。
- [REQUIREMENTS.zh-CN.md](REQUIREMENTS.zh-CN.md)：原始目标与功能合同。
- [RESEARCH.md](RESEARCH.md)：已有资料与证据，禁止重复研究。
- [ACCEPTANCE.md](ACCEPTANCE.md)：历史证据及本轮测试、剩余真实验收和放行门禁。
- src/、tests/：正式业务源及定向回归；[preview/index.html](preview/index.html) 仅历史模拟原型。

## 实际测试与剩余阻塞

Node 22.16.0：11/11 PASS；Chromium 144.0.7559.96：10 组 PASS。测试使用与 GitHub 基线 blob 一致的源码副本；合成 DOM 及 open 参数记录替身。另有真实 Chromium 新页面事件实验：只创建一个 about:blank 替代页、opener 为 null、原合成草稿不变；这不是 ChatGPT 登录态或实际项目归属证据。错误提示测试验证 Page UI toast 调用参数，不等于已安装 UI 的视觉实测。

本地 CodexPro workspace 连接失败（UNAVAILABLE / Connection failed）；隔离环境没有完整仓库，GitHub git DNS 失败，正式 validate/build 未运行，未安装。没有明确授权的独立已登录 Chrome QA profile 可用，因此不读取或操作用户正在工作的标签，不进行真实发送。

**下一步只补未通过的证据：** 真实两个项目标题 DOM 与右侧插入位置、直达空 composer、首次合成消息项目归属、A 真实流式/草稿、原生入口、错误提示及窄屏/主题；在完整仓库中 validate/build 并沿现有 Authority 安装/撤权验收。直接项目 URL 不成立才按 DESIGN 7.2 调查必要修复，禁止扩大权限或回到源标签。核心 P0 未通过，不生成最终验收交接、不宣称完成。

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
