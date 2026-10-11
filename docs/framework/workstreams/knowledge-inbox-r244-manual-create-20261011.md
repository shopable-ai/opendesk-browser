# Knowledge Inbox R24.4 — 手动新建、删除可见性与运行入口

日期：2026-10-11。目标 `main`。代码范围仅为既有知识收件箱及其 Side Panel 操作分发，不创建第二套知识存储、编辑器或同步体系。

## 真实源代码核查

- 旧 `knowledge-inbox` 是 `official-tools/catalog.json` 里的 **optional** 内置工具，用户经「发现工具」安装；在「我的工具」打开。原有 v1.1.3 保存 ChatGPT 回答入口由 `src/knowledge/page.js` 按网站授权注入页面。
- 实际内容由 `src/knowledge/service.js` 中扩展私有 `chrome.storage.local` 服务读写。UI 在不可信 sandbox 中，仅能经 `OpenDeskTool.request` 向可信 Host 请求许可的操作。
- 旧 UI 的「删除」位于「记录详情 → 更多」；`knowledge.remove` 已有修订号/数据锁及二次确认，但没有可见的常用删除入口。
- 原有 UI 缺少手动新增，即使列表空了也只提示去 ChatGPT 保存。

## 增量方案与边界

1. 列表顶部和空状态新增「新建」入口，单页面表单填写标题、Markdown 正文、分类、标签、备注；支持键盘保存和编辑离开保护。删除移动到详情页工具栏，保留不可撤销的确认。
2. 新增白名单操作 `knowledge.create`，通过已有沙箱 → Side Panel Host → SW `knowledge.store` 权限链，保留 packageHash、installEpoch、锁序列化、已确认写入、配额限制。
3. 数据模型保留版本 1：只有 `mode:'manual'` 且 `source:''` 的记录允许没有站点来源，且无消息 ID、提问和图片计数。ChatGPT 的 `reply/selection` 来源策略保持严格。使用可信 Service 生成随机身份，不以内容去重手工写作。
4. 手写内容导出不添加空的虚假 ChatGPT 来源；详情隐藏「打开来源对话」，后台同样拒绝手动记录的来源跳转。
5. 不增加新权限、依赖、云同步、批量删除、备份导入或全新数据库。容量仍为 200 条、4 MiB 总额、150 KB 正文限制。
6. 官方工具 `tool.config.json` 升级为 **v1.2.0**，构建系统负责派生官方包和发布清单；不直接写 `dist`。

## 改动与受影响测试

- 业务源：`src/knowledge/model.js`、`service.js`、`policy.js`、`src/ui/sidebar-tools.js`
- UI/打包源：`examples/sidebar-tools/knowledge-inbox/src/{index.html,main.js,style.css}`、`tool.config.json`
- 单元与契约：`tests/environment/knowledge-inbox-r1.test.mjs`、`knowledge-inbox-r24-ui.test.mjs`
- Chromium MV3 受控验收驱动：`tests/framework/knowledge-inbox-native-r1.test.mjs`，在原来真实 ChatGPT 保存/去重/撤权路径上新增 UI 手写、持久化、阅读、删除验证；不向 storage 注入 fixture 数据。
- 用户指南：`docs/product/chatgpt-knowledge-inbox-r1.zh-CN.md` 第 8 节。

## 验证合同与待审查事项

- [ ] `npm run check` 通过。
- [ ] `node --check examples/sidebar-tools/knowledge-inbox/src/main.js` 通过。
- [ ] `node --test tests/environment/knowledge-inbox-r1.test.mjs tests/environment/knowledge-inbox-r24-ui.test.mjs tests/environment/sidebar-tools-host.test.mjs` 通过。
- [ ] `npm run build && npm run build:dev && npm run verify` 通过，保持 SW 固定预算。
- [ ] 原生 CFT 驱动能够手动输入并保存数据、详情删除且无需来源链接，同时旧 ChatGPT 抓取不退化；导出截图和关联精确候选 SHA。
- [ ] 用户自己的 Mac Chrome、线上 ChatGPT、实际 200% zoom、真实 OS 剪贴板、Native Workspace 磁盘读写及最终 F3/ZIP 另行验收。

此记录初次创建时只表示**准备了代码和测试驱动，不代表上述检查已通过**。GitHub Actions 具体运行链接、SHA、日志和结果必须在实际运行后另行登记，不从早期 v1.1.3 候选继承 PASS。
