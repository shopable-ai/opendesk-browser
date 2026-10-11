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

## GitHub CI 实际结果与边界（2026-10-11）

- 功能提交：[ef35a826aac809fc955d50a4d418e06e72237cac](https://github.com/shopable-ai/opendesk-browser/commit/ef35a826aac809fc955d50a4d418e06e72237cac)，包含 UI、可信知识存储、v1.2.0 工具包源码、文档和回归。
- 初次定向 CI：[Actions 38141783561](https://github.com/shopable-ai/opendesk-browser/actions/runs/38141783561)，源码与相关测试 130/131 PASS：失败为新测试按列表索引 0 查找编辑记录，但双条手动记录按最近新增排列；不是业务数据写入失败。该失败保留原始记录。
- 定向修复提交：[82fcc07f0e7d64b06abc97c27d983a268a9eb7cb](https://github.com/shopable-ai/opendesk-browser/commit/82fcc07f0e7d64b06abc97c27d983a268a9eb7cb)，使用精确 ID 定位编辑记录。
- **定向源码与组件验证 PASS**：修复后的 [Actions 38141940523](https://github.com/shopable-ai/opendesk-browser/actions/runs/38141940523) 中 `Source and affected components` 步骤 SUCCESS；`131 tests / 131 pass / 0 fail`，包括手动新增、无 ChatGPT 授权、伪造来源拒绝、修改、备份、删除和错误回滚。
- **生产构建 BLOCKED（此候选不能称为全绿）**：同一工作流后续 WXT 严格门禁阻断，实际 `sw.js = 330248 B > 327680 B`，超过 2568 B。其直接父提交 `331a765e28f5fb61e97e4ebf2e7d35fd2f330e8b` 的 R3 packaging job `114474760112` 也有**相同** 330248 字节超限（日志可按父提交查核）；不要将此超限误写为新增 `knowledge.create` 引起。此次 knowledge host 通过 `importScripts('knowledge/knowledge-host.js')` 独立固定入口装载，不改变主 `sw.js` 大小。
- **Chrome 控制页面与真实用户 Mac NOT_TESTED**：由于生产构建失败，CI 未走到 real Chrome 阶段；不能从源代码检查和组件通过推导上线已可安装。保持 WXT 自包含、权限和 320 KiB SW 项目硬预算，不为本功能绕过或擅自上调门禁。
- 修复顺序：共享 SW 体积问题应由固定入口容量专项先解决，随后在当前 main 的最新版本重新运行生产/开发 build、verify 与 `tests/framework/knowledge-inbox-native-r1.test.mjs`，获得版本一致的受控 Chrome 和最终用户 Mac 证据，最后再重新给出质量评级。

### 专项测试执行

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run check
node --check examples/sidebar-tools/knowledge-inbox/src/main.js
node --test tests/environment/knowledge-inbox-r1.test.mjs tests/environment/knowledge-inbox-r24-ui.test.mjs tests/environment/sidebar-tools-host.test.mjs
npm run build
npm run build:dev
npm run verify
# 生产构建恢复后：真实 Chrome for Testing + 专用扩展 Profile
node --test tests/framework/knowledge-inbox-native-r1.test.mjs
```
