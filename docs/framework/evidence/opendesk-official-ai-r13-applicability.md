# Official Tools AI Conversation R1.3 — 官方工具适用性核查

基线：2026-10-22，`official-tools/catalog.json` 共 12 条。此表是按既有源码结构和功能边界进行的**接入优先级判断**；不是已执行的 Native 验收或对全部工具的数据合同审计。

| Tool ID | 已有 UI / 数据界面 | AI 有意义的动作 | 权限与隐私底线 | 建议 |
| --- | --- | --- | --- | --- |
| prompt-shortcuts | 原 HTML/JS opaque iframe；独立 library（ETag） | 搜索、创建、精确修改、启停、重排、审阅删除和批量修改 | 仅正式审阅包和实例；正文外发先审阅，Host 写入并读回 | **P0 唯一正式试点** |
| bookmark-manager | 已有可信 React + 书签 Host | 搜索、建夹、移动、编辑、整理 | Chrome bookmarks.full 必须经过已有权限控制与危险操作审阅 | 已有共享 AI 基础；回归而非重写 |
| quick-notes | 既有工具界面；本机笔记数据 | 搜索、创建、修改、整理便签 | 只暴露笔记数据；私密正文外发前明确审阅 | **P1 首批候选** |
| web-markdown-clipper | opaque iframe；本机摘录、网页正文 | 查找摘录、汇总、编辑便签、整理标签 | 网站剪藏权限不能被 AI 自动扩大；外发摘录正文需审阅 | **P1 首批候选** |
| knowledge-inbox | 工具沙箱 + 现有 Knowledge Host | 本机知识搜索、整理、归类、去重 | 不跨工具读取，也不自动扩展获准网站 | **P1 首批候选** |
| markdown-workbench | 工具编辑界面；用户 Markdown | 编辑、总结、格式转换 | 对原文发给 Provider 须审阅；写入保护未保存编辑 | P2，先查清草稿与持久化 |
| reading-toc | 原网页阅读目录及授权策略 | 查找章节、导航和概述 | 不新增网页访问权限、不绕开网站开关 | P3，查询收益有限 |
| time-review | 时间记录可信 Host / 本机历史 | 自然语言查询时间统计与趋势 | 时间轨迹高度敏感，默认仅本地聚合、不默认外发 | P2，只读可行 |
| stay-focus | 可信专注/站点限额控制 | 查询状态和解释额度，草拟调整 | 调整拦截规则需可审阅、明确操作授权 | P3，禁止无确认变更 |
| adblock | 可信 DNR 广告规则运行 | 查询拦截状态、帮助解释规则 | 不能让模型任意创建浏览器级规则或权限 | P3，低收益 |
| cookie-editor | Cookies 专用 Host，网站作用域 | 仅解释界面与权限文档 | **不允许向模型发送 Cookie/令牌**，不提供 AI 数据操作 | 暂不接入 |
| ai-vip-share | 可信 Managed Proxy / 账号相关设置 | 仅解释状态或故障信息 | **不允许发送代理凭据、Token、账号秘密**，代理切换不得由模型擅自执行 | 暂不接入 |

## 产品与技术边界

唯一 React Root、共享 Provider / Authority / Host 与原 SDK / Installer 不变；未迁移的工具仍留在 opaque iframe。身份只认现有官方发行内容摘要、已安装包、安装代际和启用状态，不凭同名包提升权限。普通单条低风险写入不增加确认；删除/批量变更与私人正文外发使用可信 Host 审阅。模型只能提出声明式计划，不能执行脚本、Chrome API 或自定义存储命令。

## 验收的严格分层

源码存在和单测 PASS 不代表真实安装包正常运行。R1.3 必须分别验证官方准入、Provider 真实授权、iframe 租约、Host 存储锁及 ETag、独立读回、React 同源交互、恢复及正式发行一致性；Mac Chrome 没有实际运行日志时报告 `NATIVE_NOT_TESTED`。
