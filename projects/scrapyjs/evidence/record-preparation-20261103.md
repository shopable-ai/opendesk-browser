# 完整字段到逐条采集：当前使用链核实（2026-11-03）

当前核心功能链已补齐。复用既有 `ItemLoader.prepareList` 和唯一逐条抽取器，不重写记录推断算法。完整字段输入中没有 `_listContainer` / `_listItem`；准备成功后保存的是显式记录规则，普通采集和第二页不再准备、不请求模型。简单手工配置仍走原语义，未强制推断。

## 用户入口与作者入口

- Chrome 插件：目标网页 → 插件采集窗口「Config」→ 输入完整字段 →「准备逐条记录」→ 原「保存/更新任务」或「开始采集」→ 数据预览。准备只修改草稿，不自动保存或开始采集；歧义显示诊断，不猜一个记录范围。
- 侧栏源码：采集规则中的列表范围，复用原切换图标；没有列表范围且已有字段时，其提示为「从完整字段准备逐条记录」。成功后原字段和推断范围一次应用，再走原保存/采集入口。原点选列表与手工配置保留。未恢复粘贴 HTML / 技术审阅面板，未改 Chat。
- 公开作者 API：`await ItemLoader.prepareList(pageOrHtml, completeFields, options)`，检查 `status === 'ready'` 后保存返回的 `itemConfig`；以后 `await ItemLoader.parse(pageOrHtml, saved.itemConfig)`。`ambiguous` / `rejected` 时展示诊断而不应用。公开 API 与记录算法原先已完成，本轮只修复浏览器传输适配。

示例完整字段（本轮真实网页实际输入）：

```json
{
  "title": ".row .product_pod h3 a::title",
  "url": ".row .product_pod h3 a::href",
  "price": ".row .product_pod .price_color::text"
}
```

## 首个缺口与最小修复

1. 两个消费者已有准备 helper，但当前 UI 未调用。Chrome 接到显式准备动作；侧栏复用原列表范围动作及原只读检查会话，不复制旧 AI 面板。
2. Chrome 对合法无后缀 CSS 的准备结果缺省读取表达与现有验证器不一致。只将默认单值字段适配回合法字符串规则；显式读属性和多值描述符保留，不放宽验证。
3. 真实 CFT 156 的 `chrome.scripting.executeScript` 在字典参数/结果中省略 `null`。原后台采集因此把“没有外层容器”误报为 `E_AI_STALE`。核心页面回调改用 JSON 字符串封套，保留 `null`；仍执行原抽取器及全记录校验。
4. Chrome 保存后重开，checkpoint 初始化会使保存规则恢复被跳过，或令主采集按钮残留禁用。延迟恢复保留 revision、任务 token、编辑器与选中任务检查；统一重算运行锁。没有自动采集，也没有解开实际运行锁。
5. 侧栏准备中的 unknown 状态原无内联取消入口。加入调用原 close 的「取消检查」；原请求未释放时继续锁定，不重放 Start/Stop，不应用结果。

## 已实际验证

| 行为 | 证据及边界 |
| --- | --- |
| Chrome 完整字段 → 准备 → 原保存 → 关闭重开自动恢复 → 原采集按钮 → 预览 | 独占临时 Profile，源码加载的真实 CFT 156.0.8078.4 扩展，`https://books.toscrape.com/` 在线页面；20 条 × 3 字段 = 60 个完整值与独立 DOM 参考一致。重开未重新准备或请求模型。见 [native/report.json](../../../../artifacts/scrapyjs/record-preparation-20261103/native/report.json)、[actual.json](../../../../artifacts/scrapyjs/record-preparation-20261103/native/actual.json)、[结果图](../../../../artifacts/scrapyjs/record-preparation-20261103/native/result.png)。 |
| 保存规则连续用于第二页，并再次重放 | 侧栏原 `runInspection` → 原编辑器保存/读回 → 原 `runCapture`，真实 Chromium 和上述网站两页；一次准备、两次完整采集，共 240 个字段比较全等。见 [report.json](../../../../artifacts/scrapyjs/record-preparation-20261103/report.json)、[live-values.json](../../../../artifacts/scrapyjs/record-preparation-20261103/live-values.json)、[live-rule.json](../../../../artifacts/scrapyjs/record-preparation-20261103/live-rule.json)。这项是消费者源码在浏览器执行，不冒充已安装侧栏或 Chrome 插件的实际翻页点击。 |
| 中间缺值、多值、重复标题 | 原 Controller 在两页 fixture 上得到 5 条记录、20 个字段完整比较全等；中间记录 `price: ""`、`tags: []`，前一条 `tags: ["x","y"]` 未串到下一条，重复标题以所属记录保留。见 [fixture-values.json](../../../../artifacts/scrapyjs/record-preparation-20261103/fixture-values.json)。 |
| 歧义、隐藏/表单排除、旧配置、unknown | 实际 PageAssistant 组件与原检查会话测试，含 `E_LIST_AMBIGUOUS` / `E_LIST_EXCLUDED`、结果过时拒绝、请求读回、取消后等待释放及丢 Stop 回执不重放。没有由驱动补写记录选择器。 |

Chrome 原生检查时间为 `2026-11-03T14:31:35Z` 至 `14:31:38Z`，扩展 ID `laladlkiboicgmdfnpdcboeheaillolg`，加载目录 `/Users/shopme/Documents/workspace/scrapyJsChrome`。单页探针设置 `pageLimit=1`，原回执为 `partial / page_limit`，20 accepted / 20 committed / 0 deliveryUnknown，错误为空；这证明限定单页结果正确，不声称自然翻页结束。该实例已关闭；没有接管用户或并行任务的浏览器。

侧栏两页源码探针在新 engine 同步后重跑，时间 `2026-11-03T14:35:17Z` 至 `14:35:20Z`。独立临时浏览器已关闭。

## 定向检查与同步

以下均读取退出码和输出，没有扩展为全量 CI：

- 核心：`npm test -- test/ai-config/browser-descriptors.spec.js test/item-loader-records.spec.js test/list-preparation.spec.js test/record-selection-model.spec.js`：145/145 PASS。新增丢 null 传输回归先失败、修复后通过。
- Chrome 准备入口：`node --test test/list-preparation.test.cjs test/list-preparation-popup.test.cjs`：38/38 PASS。
- Chrome 保存重开竞态：`node --test test/ai-profile.test.cjs test/ai-demo-checkpoint-ui.test.cjs test/list-detail-checkpoint-view.test.cjs`：94/94 PASS；包含两种 checkpoint 完成顺序与三种存储时机、恢复后原采集、用户编辑和运行锁。
- 侧栏：`node --test examples/sidebar-tools/scrapyjs/tests/engine.test.mjs examples/sidebar-tools/scrapyjs/tests/editor.test.mjs examples/sidebar-tools/scrapyjs/tests/page-inspection.test.mjs examples/sidebar-tools/scrapyjs/tests/inspection-session.test.mjs examples/sidebar-tools/scrapyjs/tests/record-preparation-flow.test.mjs`：43/43 PASS。旧 engine 测试桩一并改为在独立 VM 实际执行页面回调，验证新封套与无闭包依赖。
- 两页浏览器探针：`SCRAPYJS_PLAYWRIGHT_MODULE=<playwright 模块路径> SCRAPYJS_CHROMIUM=<headless-shell 路径> node examples/sidebar-tools/scrapyjs/tests/record-preparation-browser.mjs`：2/2 PASS；未新增 npm 依赖。
- 核心源码有真实修复后才运行官方 `node scripts/sdk-sync.cjs build`、`apply`、`check`；最终 `check=current`。Webpack 仅已有体积提示。同步备份在 Chrome `.sdk-backups/1793716244875-35f4cdd3-a256-4289-a51e-bd3c20488a8b`。
- 侧栏先核实旧来源与官方新 receipt，再同步三个变化源码、官方 bundle/receipt/provenance，运行原 `engine/build-browser.mjs`；来源和导出包装检查通过，没有手改 SDK 或 engine 生成字节。

当前 sourceHash：`edceca38feb177908decf3334ddbcb467bc13397e2ecb5ad494a2bd43cb9db77`。

核心 / Chrome / 侧栏 vendor 的 browser SHA256：`fa3321326f1e038a1cef31adfa999d4d85d32d12334f49daddddf4d01373b6c3`。Chrome 原后台采集回执也报告此 SHA。

侧栏导出包装 engine SHA256：`e78b719dc5965a810deb21d815cd3b097bac2f5e9e42423353545bd0779c265c`。

## 本轮写入归属

三个仓库都保留原有大量未提交改动，以下仅列本轮增量触及的文件，不表示独占整个已有 dirty 文件：

- 核心：`src/item/ItemLoader.js`、`src/item/item-loader-extraction.js`、`src/ai/BrowserValidation.js`；`test/ai-config/browser-descriptors.spec.js` 中传输回归；官方浏览器构建产物。
- Chrome：`www/popup_crawl.html`、`www/popup_crawl.js`、`www/demo-checkpoint-view.js`、`www/list-detail-checkpoint-view.js`、`assets/js/ai/crawl-profile.js`；`test/list-preparation.test.cjs`、`test/list-preparation-popup.test.cjs`、`test/ai-profile.test.cjs`；官方同步的 `assets/js/plugins/scrapyJs.js` / `scrapyJs.source.json`。
- 侧栏：`controller/inspect-page.js`、`src/PageAssistant.jsx`、`src/editor.js`、`src/page-inspection.js`；`tests/record-preparation-flow.test.mjs`、`tests/record-preparation-browser.mjs`、`tests/engine.test.mjs`；上述三个 vendor 源码、`browser.original.js` / build receipt / provenance、`engine/browser.js` / build receipt；本报告。

## 未测与延期

- 已安装侧栏工具的真实 Host / Native 权限链及其新入口为 `NOT_TESTED`；本轮未构建、晋升、安装或覆盖正式工具包，不把源码组件通过说成已安装包通过。
- Chrome 插件保存规则后实际翻页点击为 `NOT_TESTED`；第二页与无模型重放已有原 Controller 浏览器证据。
- production / CWS、正式评分、全量 CI、多浏览器、缩放/宽度、压力验收继续延期；Python runner 未改、未测。未发布 Node 包，不宣称 Node dist 已重建。
- Browser Framework 未修改；未停止/覆盖现有 watcher 或其他会话输出；未新建分支/worktree/PR，未提交、推送或发布。原核心跨对话 goal 未读、未修改。
