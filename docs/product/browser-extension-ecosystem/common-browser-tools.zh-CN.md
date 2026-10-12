# 通用工具机会与 Side Panel 增量分层

> 工具分类不是实现清单；强制核对 `src/sidebar-tools`、`src/ui/sidebar-tools`、`official-tools` 与 `examples/sidebar-tools` 最新消费者和原生验收。当前工具 iframe 的可用 capability 以 `src/ui/sidebar-tools/package.js` 为准；不要为工具 UI 直接添加 Chrome 高权限。

## 1. 功能归属图

| 常用领域 | 普通用户看到的工具候选 | 建议交付 | 依赖与注意 |
| --- | --- | --- | --- |
| 广告过滤/隐私 | 网站过滤开关、规则集说明、例外站点 | 独立狭窄目的扩展更合理 | DNR 宿主；规则来源与反追踪效果单独审查；非 AdBlock 专项验收 |
| 标签/书签 | 标签搜索、会话保存、分组、失败恢复 | A 工具或独立 Tab 扩展 | tabs/tabGroups/bookmarks 可选权限 |
| 阅读/翻译 | TOC、聚焦阅读、选区翻译、摘录 | Page Script + A 工具 | 现有 reading-toc、web-markdown-clipper、notes 参考 |
| 截图/批注 | 可见区截图、长图、素材批注 | A 工具；复杂产品可独立 | 已存在 screenshot driver，不等于所有工具权限已打通 |
| 表单/文本 | 快捷短语、时间戳、复制、填写预览 | Page Script / A Tool | 高风险表单提交需要用户明确动作 |
| 网站数据 | Cookie 编辑、本地存储检查、数据导入导出 | A 工具 + 可信 Host | cookie-editor 示例已有；Browser SDK cookie 能力需要独立接线与原生验收 |
| 开发者 | JSON 格式、链接检查、DOM 辅助、HTTP 检查 | Page Script / 独立 QA 扩展 | 网络拦截与请求体读写不是普通 UserScript |
| 下载管理 | 按规则命名、下载失败解释、清单导出 | A 工具 | downloads 权限；不抓取付费受版权内容 |
| AI 研究 | 网页来源引用、摘要、笔记版控 | A Tool + 可选 SaaS | 显式云端数据说明，模型不是默认依赖 |
| 网页变化与自动化 | 变更对比、短任务、定时提醒 | Task + 可选 SaaS | SW/alarms 不保证秒级；需幂等日志 |
| SEO/营销 | meta/JSON-LD 预览、UTM、链接检测 | Page Script / 单用途 B | 搜索结果页面和客户网站分开授权 |
| 教育/字幕 | 词典、字幕整理、阅读模式 | Page Script | 合法字幕来源、站点 DOM 适配 |

## 2. 现有代码和仅 UI 工作必须分开

- `examples/sidebar-tools/reading-toc`、`quick-notes`、`web-markdown-clipper`、`cookie-editor`、`time-review` 说明已有示例/工具源码；需要按各自 workstream 查真实能力和验证，不因此认定已发布或拥有全部 API。
- `src/ui/sidebar-tools/package.js` 当前 `MAX_INSTALLED_TOOLS=12`，这是既有沙箱设计边界，**不能**用“全网几百工具”简单解释为无限同时安装；研究存储索引、分组、按需激活/卸载和 UI 虚拟化之后再变更。
- 现有 `browser-contract.js` 登记的接口并非全部可调用，工作流中已有 10/32 实现登记、候选 Chrome 0/32 的历史快照；未来以最新 `browser-sdk-status.md` 为准。
- UI 应复用 `src/ui/design-tokens.css`、`docs/architecture/ui-layout-conventions-r27.zh-CN.md`；普通 Side Panel 保持当前 Tab 结构。增加工具入口优先放「工具」目录内的搜索、分类和管理，不新建多个一级 Tab。

## 3. 安装体积、性能与隐私预算

静态功能按需打包，工具子应用独立 iframe、已选工具才挂载；禁止所有 React+Vue+数据库+模型都进入 SW。对单个工具定义 `packageBytes/runtimeInitMs/storageBytes/domMutations/permissions` 的真实上限，按最终候选做 CFT 观测。用户一键停用自动运行后应保留卸载/恢复途径；每个网站权限在开关与安装前都能查看。

## 4. 不适合 A 的能力

需要长期服务器抓取和海量价格历史、要求独占商店身份的专业 QA/SEO、重度网络拦截与隐私规则、依赖企业 SSO/审核中心的内部流程，宜考虑狭窄 B 或配套云服务；不得因为 SDK 理论上存在 `cookies`、`alarms` 就让不可信 iframe 获得这些功能。
