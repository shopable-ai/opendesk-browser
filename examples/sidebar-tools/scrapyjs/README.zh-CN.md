# scrapyJs 采集应用

当前交付为单页核心链，未来业务维护只在本目录。来源仓库保持只读；完整来源源码、输入摘要和第三方通知在 `vendor/scrapyjs/`。本次核心链不代表完整迁移完成。

应用运行在原 opaque iframe；固定 `scrapyjs.capture` Task 在原 Controller Worker 中使用词法 `page/params`。Task 与应用分别经原安装器审阅安装，不能把应用 JSON 当成 Task。Task 当前批准网站仅 `http://127.0.0.1:43111`，其他网站需另一次明确的 Task 范围审阅。

## 使用

打开标准页面 `http://127.0.0.1:43111/demo-form.html`，在同一采集应用刷新当前网页，确认地址和配置，然后开始。默认读取 `#sample-list` 的直接 `li` 子项；字段 `.::text` 是原引擎的 XPath 自身文本语法。可以改选择器，但不能输入任意执行代码。

运行期间可停止原实例。界面分别显示宿主状态、引擎业务状态、Stop 受理及运行退休；宿主 completed 不替代引擎交付状态。结果来自原运行关联，没有示例数据兜底。开始结果未知时不能重复点击开始。

配置使用原 `storage.get/set` 及 ETag；冲突保留草稿，不覆盖他人版本。完整小结果可请求 JSON 下载，下载 ID 仅说明下载已开始。CSV 文件后缀尚不在公开 `file.download` 合同内，保留为后续任务。

## 构建与边界

```sh
node examples/sidebar-tools/scrapyjs/engine/build-browser.mjs
node scripts/build-program-project.mjs examples/sidebar-tools/scrapyjs --out artifacts/scrapyjs/program
node --test examples/sidebar-tools/scrapyjs/tests/engine.test.mjs examples/sidebar-tools/scrapyjs/tests/app-model.test.mjs examples/sidebar-tools/scrapyjs/tests/app-view.test.mjs
```

`engine/browser.js` 是固定来源生成的命名 ESM 消费产物；`engine/browser-loader.cjs` 显式记录消费变体。原浏览器整包 SHA-256 为 `c7a266c1bd5f34ba5e5a85d163c0573fc1d5afb60c07d0ce46af8393e7ada4be`；完整包装 683112 bytes、原首链模块浏览器构建 425398 bytes，均超过 Task 65536 bytes。没有调高预算、伪造 window、模拟 Node 能力或创建第二执行器。

首链保留原 Scrapy/Scheduler/Spider/Request/Item、回调、Page 提取、数组返回、统计与 memory delivery。消费变体要求显式 Page downloader；未开放的 HTML/Cheerio、HTTP/Node 后端、规则跟随和 processing/validation 明确拒绝，不提供空实现。`waitForNavigation` 不是原受控 Page 能力，首链使用实际 `goto`，消费变体删除未使用方法的前置要求。双阶段编译后的实际回调及网页效果由定向验证确认。

固定 Task 的原构建产物位于 `artifacts/scrapyjs/program/`，该目录是临时输出。Sidebar 正式包由唯一 `build-sidebar-tool.mjs` 先构建候选、测试，再 `--promote-from`；不手改正式 JSON。

## 后续完整迁移

| 保留能力 | 维护位置与依赖 | 当前状态 |
| --- | --- | --- |
| 可视选择、高亮、表格、XPath 选择器生成 | `page/` 独立 Installed Page Program，原受控结构化配置通道 | 未实现；XPath 文本提取不等于可视选择迁移 |
| 录制、回放、选择器修复 | `page/` 录制，`controller/` 受控回放；保留来源脏工作区资产 | 未实现 |
| 分页、导航确认、列表详情 | `engine/`、`adapters/`；串行 Page 与导航身份 | 未开放；原源码已保留 |
| 字段规则、处理、质量验证 | `engine/`、配置与结果 UI | 未开放；原源码已保留，配置显式拒绝 |
| 统计与完整结果、CSV/复制 | `src/`、`adapters/`；合法格式及下载合同 | 核心统计/JSON 已接线，CSV 后续 |
| 暂停、继续、长任务 | `controller/` 与原 RunHost；效果状态查询 | 未开放；原引擎能力保留 |
| 检查点、恢复、跨次调度 | `adapters/`；对应阶段再补 CAS、原提交/effect 查询、分片与业务 lease | 未实现；未知效果不重放 |
| Node 文件与 Node 专用后端 | 来源仓库继续维护；未来必要时走现有授权 Provider | 本轮不迁移 |

完整来源功能编号与证据补充仍见 `.omx/plans/scrapyjs-migration-source-function-ledger-20261028.md`；其中“本轮仅设计”描述是历史阶段，不限制本次实施。本目录中的实现和运行证据才是当前产品进度依据。无语音控制、production 全验收、评分、宽度/缩放或压力测试。
