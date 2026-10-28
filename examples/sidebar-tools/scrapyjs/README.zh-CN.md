# scrapyJs 采集应用

本批已在真实 OpenDesk Controller 中跑通字段文本/属性、Pipeline 与 BrowserValidation、两页列表去重及自然终止、列表详情关联和价格处理。完整 32 项迁移仍为 `fullMigrationComplete=false`。完整原浏览器 SDK 保持原样；来源 `scrapyJs` / `scrapyJsChrome` 仓库只读。

业务只在本目录维护。App 运行在原 opaque iframe，固定 `scrapyjs.capture` Task 运行在原 Controller Worker，使用词法 `page/params`。没有新执行器、宿主或安装器。批准网站仍只有 `http://127.0.0.1:43111`；不能直接拿此 Task 采集外站。

## 安装与使用

两个包需分别经原入口审阅安装：

1. 「开发」/原任务目录导入 `controller/scrapyjs.opendesk-task.json`，验证固定源码并安装 Task v0.2.1。
2. 「扩展」导入本目录唯一正式 App `scrapyjs.opendesk-tool.json` v1.1.1；它精确委托上述 Task。保留同 ID 的配置，更新时不先卸载。
3. 打开标准页面 `http://127.0.0.1:43111/demo-form.html`，打开采集 App、刷新目标。默认读取 `#sample-list` 的直接 `li`；`.::text` 是原引擎自身文本语法。
4. 展开「字段与属性」，填写列表容器和列表项；可选填写字段名、CSS 选择器及文本/属性类型，点击「应用字段」。同名更新，其他字段保留。
5. 需要时展开「分页与列表详情」。填写下一页 CSS、页数上限和去重字段；详情需列表 URL 字段、双方共同身份字段和详情 `itemConfig`。点击「应用分页与详情」，然后开始。

未应用的表单编辑阻止运行与保存。完整 JSON 保留原选择器/嵌套字段语法，也可填写原 `validation` / `fieldRequirements` / `processing`；配置只接收数据。表格呈现真实记录，完整快照仍保留。宿主、引擎、Stop 受理和实例退休分别显示；结果未知时禁止重复开始。原 Stop、配置 ETag 冲突保护和 JSON/CSV 下载继续使用已有链路。

分页链接通过公开 `page.goto()` 推进原目标会话；普通 DOM 链接点击会因文档替换触发安全栅栏，不能直接沿用旧扩展的点击导航。按钮与同文档锚点仍使用公开 Locator，保留点击处理器；链接按当前文档 base URI 解析。分页只开放 CSS，最多 10 页；达到上限时保留已采集数据及 partial/page_limit，不伪称自然结束；详情最多 100 条、串行执行，严格核对 URL 与 ID，不静默重试。相同身份而内容不同报错；重复详情 URL、详情覆盖列表字段、错误 ID、非法价格均拒绝。详情 `numberFields` 使用来源示例的严格小数 Pipeline。滚动分页、XPath 翻页、断点恢复和重试管理未交付。

## 先脚本验证，再接 UI

可复制的零参数 ESM 入口：

| 脚本 | 输入与独立预期 | 本批真实 Controller 结果 |
| --- | --- | --- |
| `examples/fields.js` | GitHub 旧例三行；文本、href、可空属性；名称经原 Pipeline 大写 | 三行全部字段一致；BrowserValidation 运行，URL 绝对化；completed/released |
| `examples/pagination.js` | 两页共五行，两个重复；首次出现顺序三条 | 两页、三条、重复 2；`site_exhausted` 自然终止 |
| `examples/list-detail.js` | 旧 catalog 的 A/B/C、Ada/Ben/Cara、19.90/25.00/30.00；列表有 A 重复 | 三条 URL/ID 正确关联，价格为 19.9/25/30；列表和详情原引擎均 completed |
| `controller/main.js` | 同样的声明式详情参数，作为固定 Task | 与上述完整黄金一致；经原验证/安装链安装 |

输入、输出和来源差异见 `fixtures/README.md`、`examples/expected.json`。旧 Node HTTP 例子的 PASS 不作浏览器证据；这里用原 ChromeSpider / BaseSpider / Request / Scheduler / ItemLoader / Pipeline，在受控网页世界执行真实 DOM 提取。

复现时保留既有 `npm run dev` watcher、标准 demo 服务和日常 Chrome，使用独立 CFT/Profile 的不变开发快照：

```sh
# 前提：canonical demo 服务正在 127.0.0.1:43111 提供 examples/tasks。
# 仅添加有所有权检查的临时映射，不修改 demo-form.html 或重启服务。
node examples/sidebar-tools/scrapyjs/tests/fixture-mount.mjs mount
node examples/sidebar-tools/scrapyjs/tests/build-examples.mjs artifacts/scrapyjs/my-examples
node examples/sidebar-tools/scrapyjs/tests/native-examples.mjs --suite=artifacts/scrapyjs/my-examples/suite.json --out=artifacts/scrapyjs/my-native-run
node examples/sidebar-tools/scrapyjs/tests/fixture-mount.mjs unmount
```

`build-examples.mjs` 为每个入口准备独立源码快照，并调用现有 `build-program-project.mjs`；它不运行引擎。原「开发」入口导入固定草稿并显式 Run，原持久结果绑定 sourceHash/runId/resultId/retirement。`params` 可传 `url`，仍须原任务范围和页面授权。

原始脚本报告：`artifacts/scrapyjs/native-examples/core-d-20261029/report.json`。可提交的证据摘要与每项证据层级见 `migration-status.json` 和 `evidence/core-examples-20261029.json`。本批 App 独立成功报告为 `artifacts/scrapyjs/native-examples/app-d-driver5-20261029/report.json`：同一 App 的三组字段/分页/详情配置应用、未应用保护、三条全字段表格、保存后销毁并重开、完整 JSON 46,312 字节下载读回均通过。前一报告整体 BLOCKED 是后续 App 下拉框驱动失败，四个脚本结果本身均 PASS；未改写历史状态。

## 包与最小检查

App 唯一正式包先候选测试，再经原 `--promote-from` 原子晋升和 `--check-project` 同源核对。Task 源码/manifest 改动则重新冻结、运行、验证、安装，并同步 App 的精确委托；不静默更新已安装 Revision。

```sh
node scripts/build-program-project.mjs examples/sidebar-tools/scrapyjs --mode development --out artifacts/scrapyjs/my-task
node --test examples/sidebar-tools/scrapyjs/tests/*.test.mjs
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/scrapyjs --out artifacts/sidebar-tools/scrapyjs/candidate.opendesk-tool.json
# 测试通过后才执行：
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/scrapyjs --promote-from artifacts/sidebar-tools/scrapyjs/candidate.opendesk-tool.json
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/scrapyjs --check-project
```

完整原 SDK 为 1,136,734 bytes，SHA-256 `c7a266c1bd5f34ba5e5a85d163c0573fc1d5afb60c07d0ce46af8393e7ada4be`。`engine/browser.js` 只把 classic IIFE 已有导出转为词法 ESM；无压缩、删模块、假 window/DOM 或 Node 能力模拟。通知见 `vendor/scrapyjs/THIRD_PARTY_LICENSES.txt`。无需为日常业务重新生成这份未变 SDK。

Task v0.2.1 sourceHash `dfc2dfec08656ec8956db24220256a7753407e4095c9d7def109b20aa8d0d2fa`，manifestHash `033617f17a27566f942ecfacf0adf7ed4a3e4878801e406bd10f4d8e6b9b71e6`。App 和 Task 包摘要从同源检查及证据账本读取。

## 尚未完成

可视选择/高亮/表格选择与选择器生成、录制/回放、完整处理/质量编辑、命名任务/profile、暂停/继续、检查点恢复/调度、AI/配方、复制与大结果体验仍待后续。Rule/LinkExtractor/runCheckpointTasks 等完整实现保留不等于已在 OpenDesk 逐项运行。原 `processing.splitPublication` 已开放配置与组件校验，本批未做对应原生样本，不宣称它已通过原生验收。

上轮 v0.1.0 六项单页核心证据保留在 `migration-status.json.coreEvidence`，包括正常 Stop、回包前取消和 JSON/CSV 文件下载。它们是旧候选证据，不提升为新候选的全量验收。旧 `k3-sandbox-error-forwarding.test.mjs` 的过时 Worker URL 夹具缺口继续保留，未放宽来源校验。本轮延期 production、升级/撤权正式验收、完整 32 项验收、95+ 评分、宽度/缩放矩阵及压力测试。Node 文件/CLI 专用功能本轮不迁。
