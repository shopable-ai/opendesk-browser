# Sidebar Tool 应用级本地化合同（R1.2）

**状态：受控首期实现 · 2026-10-15 · 源语言 zh-CN · 首个试点 reading-toc 1.0.6**。

本文件是 OpenDesk **框架 UI 本地化**的唯一开发合同，不是 `chrome.i18n` 或 `OpenDeskSDK.browser.i18n`。实现来源：`src/ui/app-localization.js`、`src/sidebar-tools/bridge.js`、`scripts/build-sidebar-tool.mjs`，实际运行时和安全检验以源码为准。

## 用户语义和所有权

- OpenDesk 应用设置键 `opendesk.ui.locale.v1`（`chrome.storage.local`），缺失、非法或读取失败时以 `zh-CN` 启动。用户在「扩展」→「更多操作」选中「简体中文 / English」，即变更**应用 UI 语言**，不改浏览器语言、网站语言或生成式 AI 的输出语言。
- 每个工具只有一个固定 ID、原工具数据和授权。**没有**本地化资源的工具照常使用原语言，不显示无用的工具级切换器。
- `Intl.getCanonicalLocales` 正规化标签；首先尝试语言地区精确匹配，再尝试语言子标签（如 `en-US` → `en`），同一语言存在多个地区候选且无法唯一解析时回退源语言。不会把 `en-GB`、`en-US` 混为同一条资源。
- 工具资源只允许替换本工具 UI 文字及 ARIA/Tooltip。网页正文/标题、业务记录、导航 ID、时区、币种、索引、浏览器权限和工具身份永不翻译。
- 宿主可信权限和风险文案仍由宿主管理；工具无法写入其他工具的资源或全局语言设置，既有工具沙箱仅从受限 `OpenDeskTool.locale` 读取上下文及 `onLocaleChange(callback)` 订阅。**这是框架 UI 状态，不是新的 Browser SDK 业务 API**。
- 网页悬浮目录由可信 Content Script 根据相同应用偏好在原位 `setLocale`；不向网站注入可执行工具包，不为文字变化重建 TOC 索引或刷新业务状态。

## 最小资源与构建契约

单语言工具保持原来的 `tool.config.json`、`src/index.html`、`src/main.js`，**无需**新增资源。需要其他语言时，在项目根目录新增 `locales.json`，在 `tool.config.json` 增加仅供构建使用的 `"locales":"locales.json"`。此属性**不写入正式 `opendesk.sidebar-tool.v1/v2` 包 Schema**。构建器在运行前读取并验证资源，将 `main.js` 唯一的 `__OPENDESK_TOOL_MESSAGES__` 表达式替换为离线、不可变的 JSON 文案表，复用原始 `html/css/js` 字段、权限、安装和签名摘要：

```json
{
  "sourceLocale": "zh-CN",
  "messages": {
    "zh-CN": {"actionLabel": "刷新", "countLabel": "还有 {count} 项"},
    "en": {
      "actionLabel": {"source": "刷新", "text": "Refresh"},
      "countLabel": {"source": "还有 {count} 项", "text": "{count} more items"}
    }
  }
}
```

目标译文每条都携带其**复核时原文** `source`。源语言修改会使旧译文失效，打包失败而不是静默发布过期文案。键名称、资源体积、语言数、纯文本约束和 `{变量}` 集合由 `compileToolLocaleCatalog` 校验。严禁 HTML、事件处理器、脚本、远程翻译、越权资源引用和任意动态代码。未提供的单条译文以源文案兜底。运行时通过 `textContent`、`title` 和 ARIA 属性显示；网页标题仍来自可信 TOC 快照，原样显示。

读取/语言改变不应卸载或重新挂载工具，也不改变 `toc.snapshot`、`toc.navigate` 或源树。工具发行仍按既有 SemVer、官方 Catalog 指纹、安装审阅、同 ID 受控更新执行；**改变资源字节必须提升版本**，不可对已安装的同版本包做静默替换。离线安装包内不依赖第三方翻译服务。

## 阅读目录第一试点

- 唯一资源：`examples/sidebar-tools/reading-toc/locales.json`；源项目：`examples/sidebar-tools/reading-toc/src/`。Side Panel 的标题、三种模式、刷新、自动跟随、空状态、读取/重试/失败、导航、Tooltip 和 ARIA 复用该资源。
- 网页悬浮：`src/reading-toc/view.js` 导入同一资源（可信构建），更新标题、视图、拖动/归位、更多/空状态，不触发索引或自动滚动。
- 应用 UI 语言选择：`src/ui/extension-center.js`、`src/ui/tool.html`，控制器经 `src/ui/tool-shell.js` 注入既有 Host。
- 官方展示名称/简介仅对身份和源文字**完全符合受控阅读目录**的条目翻译，避免同名恶意工具冒用。可信权限、网站授权和其他仍为中文的框架界面不冒称全应用英语完成。

## 增量开发（复用原 Skill/工作流）

AI/开发者仅在用户要求“给 X 工具增加 Y 语言”时：先恢复该工具真实源码和源文案 → 新建或补充审核资源 → 校验源文案、占位符、术语及无 HTML/脚本 → 复用现有包构建 → 使用同一 UI 生成器预览不同语言与状态 → 同工具 ID 提升版本 → 审核更新 → 定向回归及同候选真实 Chrome 验收。不得创建第二个工具、第二套管理器、新的 Skill 或网络语言 API。

## 验收等级与边界

`SOURCE_WIRED` 源码可核对；`NODE_PASS` Node 定向测试；`BUILD_PASS` 正式工具/Browser 打包；`PREVIEW_PASS` 同源离线预览交互；`NATIVE_PASS` 绑定新候选身份的真实 Chrome 安装/升级与双界面功能；未执行标记 `NOT_TESTED`。测试须覆盖默认/地区语言匹配、缺失词条回退、过期和危险译文拒绝、两工具隔离、离线、原位切换保留目录、SPA、刷新/失败自动恢复、关闭/重启/卸载及同 ID 更新。不得把既往 R4.8 原生通过视作多语言候选的原生通过。

执行及错误证据沿用 `docs/framework/workstreams/`；正式产品 UX 按 `docs/architecture/ui-layout-conventions-r27.zh-CN.md`。
