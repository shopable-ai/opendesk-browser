# AI 对话新窗口（R1 源码候选）

**目标**：不覆盖当前 AI 网站标签页，在原生“新对话”及项目新对话入口旁，增加一个 ↗ 图标。原网站按钮与导航行为保持不变；旧标签页的生成过程和草稿不修改。

- 原按钮：仍在当前标签页打开新对话。
- 新 ↗ 按钮：向浏览器请求独立窗口；Alt + 点击请求新标签页。
- ChatGPT / Claude 项目列表：在明确的项目条目旁增加 ↗，从该项目入口建立新会话，不根据普通 `/c/` 对话路径猜测项目身份。
- DeepSeek、Gemini：首版支持普通新对话，不虚构项目能力。

## 工程边界

使用已有 OpenDesk Page Program `USER_SCRIPT` 与 `@opendesk/ui` 生命周期，不改平台宿主、安装、权限或其他扩展。本站源按固定 HTTPS origin 匹配，只扫描导航及项目列表，页面切换时撤销陈旧按钮，停用时清理监听与定时器。不会读取或提交聊天正文及草稿，不修改原生点击事件，也绝不退化为当前页导航。

当前通过 `window.open` + `noopener,noreferrer` 发起请求。**是否产生完整浏览器窗口、浏览器弹窗或被阻止取决于 Chrome 策略**；如要求保证 `chrome.windows.create({type:'normal'})` 效果，必须在现有可信宿主内独立审核接线，不能假称已实现。

## 开发与验证

```sh
node --test projects/ai-new-chat-window/tests/*.test.mjs
npm run build:program -- projects/ai-new-chat-window
```

本工具是独立源码候选，**未加入官方 Page Catalog，未安装到用户 Chrome**。本地 6 项固定路由、同源、项目上下文和请求测试通过；真实网站 DOM、浏览器窗口结果、弹窗拦截、项目会话最终归属和本机安装仍 `NOT_TESTED`。交互预览可用独立的 `ai-new-chat-window-R1.zip` 附件查看；不能将预览视作 Chrome 原生验收。
