# scrapyJs 采集应用

当前交付为单页核心链，未来业务维护只在本目录。来源仓库保持只读；完整来源源码、输入摘要和第三方通知在 `vendor/scrapyjs/`。本次核心链不代表完整迁移完成。

应用运行在原 opaque iframe；固定 `scrapyjs.capture` Task 在原 Controller Worker 中使用词法 `page/params`。Task 与应用分别经原安装器审阅安装，不能把应用 JSON 当成 Task。Task 当前批准网站仅 `http://127.0.0.1:43111`，其他网站需另一次明确的 Task 范围审阅。

## 使用

打开标准页面 `http://127.0.0.1:43111/demo-form.html`，在同一采集应用刷新当前网页，确认地址和配置，然后开始。默认读取 `#sample-list` 的直接 `li` 子项；字段 `.::text` 是原引擎的 XPath 自身文本语法。可以改选择器，但不能输入任意执行代码。

运行期间可停止原实例。界面分别显示宿主状态、引擎业务状态、Stop 受理及运行退休；宿主 completed 不替代引擎交付状态。结果来自原运行关联，没有示例数据兜底。开始结果未知时不能重复点击开始。

配置使用原 `storage.get/set` 及 ETag；冲突保留草稿，不覆盖他人版本。完整小结果可请求 JSON 下载，当前 `browser.downloads.text` 回执仅表示下载已开始。原公开能力支持 `.csv`，CSV 按真实记录字段导出，JSON 保留完整结果及状态。

安装使用两个独立包：先通过原任务目录导入、核对真实运行证据并安装 `artifacts/scrapyjs/program-full/program.opendesk-task.json`；再在「扩展」导入本目录唯一正式包 `scrapyjs.opendesk-tool.json`，审阅固定 Task 的版本、源码 SHA 与能力。App 包不携带第二个执行器。正式 App 为 v1.0.0，SHA-256 `a3d4b87dcce3e28d8d2ef0d14d0e59c891432c2cd363b8ad0de1d493df09e179`。

## 本轮核心交付证据（2026-10-29）

本轮核心里程碑 **6/6，100%**；完整来源32项迁移仍为 `fullMigrationComplete=false`，不能将核心百分比当成完整迁移进度。

| 实际操作 | 结果 |
| --- | --- |
| 完整浏览器 SDK 在原 Controller Worker 执行 | PASS；完整源码无压缩、无删模块 |
| 同 App 刷新可信目标并填写声明式配置 | PASS；opaque iframe 无直接 Chrome storage |
| 同 App 启动固定已安装 Task | PASS；原 Task 与 App 各自审阅安装 |
| 同 App 查看真实记录、引擎和宿主状态 | PASS；三条记录与独立网页 oracle 同序，原结果 completed/released |
| Stop 与启动回包前取消 | PASS；原运行 stopped/released；可信 Stop 顺序2，匹配 Start 回包顺序4，仅一次 Start/Stop |
| 保存重开及完整 JSON/CSV 下载 | PASS；配置原 ETag 读回；JSON 20227 bytes、CSV 58 bytes 均完成并读取文件核对 |

环境为原 watcher 的 `dist/development` 不变快照，在本任务独立 Mac CFT 155.0.8059.39/Profile 中运行，测试结束已关闭所属浏览器，日常 Chrome 和 watcher 未替换。原始报告为 `artifacts/scrapyjs/native-driver/app-core-observed-cancel-20261029/report.json`；固定源码、包、快照摘要、原运行/结果身份、事件顺序与下载摘要保存在本目录 `migration-status.json`。JSON 与实际完整快照深比较，CSV 与独立网页三条记录逐行比较，SDK 的“已请求下载”回执没有单独冒充文件完成。

本轮修复配置 codec 改变对象键顺序导致的错误读回失败、Worker 创建前 Stop 无退休回执，以及准入中取消误记宿主关闭。定向 App/引擎/包测试25项、沙箱退休与 RunHost 恢复测试10项通过。旧 `k3-sandbox-error-forwarding.test.mjs` 六项用例在进入沙箱前因过时 Worker URL 夹具收到 `E_RESOURCE_URL_UNSUPPORTED`，本轮保留该验证缺口，未放宽来源校验。production、原生升级/撤权和完整32项验收仍为 `NOT_TESTED`。

## 构建与边界

```sh
node examples/sidebar-tools/scrapyjs/engine/build-browser.mjs
node scripts/build-program-project.mjs examples/sidebar-tools/scrapyjs --mode development --out artifacts/scrapyjs/program-full
node --test examples/sidebar-tools/scrapyjs/tests/engine.test.mjs examples/sidebar-tools/scrapyjs/tests/app-model.test.mjs examples/sidebar-tools/scrapyjs/tests/app-view.test.mjs
```

`engine/browser.js` 消费完整 `vendor/scrapyjs/browser.original.js`。原浏览器 SDK 为 1,136,734 bytes，SHA-256 `c7a266c1bd5f34ba5e5a85d163c0573fc1d5afb60c07d0ce46af8393e7ada4be`；仅把 classic IIFE 原有的 CommonJS 导出作为词法值返回，再声明命名 ESM 导出。包装后 1,137,057 bytes；没有压缩、删模块、假 window、Node 能力模拟或第二执行器。第三方通知保留在 `vendor/scrapyjs/THIRD_PARTY_LICENSES.txt`。

完整 SDK 保留原 Scrapy/Scheduler/Spider/Request/Item、回调、数组返回、统计、memory delivery，以及后续处理、验证、规则、暂停、检查点等实现。首链 Controller 只接受声明式字段配置，串行提取，无未知效果重试。显式注入受控 Page，原 `goto` 负责导航；适配层覆盖旧 downloader 对未使用 `waitForNavigation` 的要求，实际方法均委托原 Page。

按用户最新容量授权，原公共链采用有界源码预算：源码 2 MiB、作者源链 4 MiB、Task JSON 4 MiB、Controller 草稿 JSON 12 MiB。参数、结果、普通 frame 与业务存储配额不随之扩大。固定 Task 的无压缩构建命令为：

```sh
node scripts/build-program-project.mjs examples/sidebar-tools/scrapyjs --mode development --out artifacts/scrapyjs/program-full
```

原构建产物 `program.js` 为 1,146,776 bytes，sourceHash `91683b92d21aaee8a98c70c95d9edfc4cb2d7221dba4aab62632a753bbcfc0f2`；App 的 `delegatedTasks` 精确绑定其 manifestHash/contentHash。Task 与 App 各走原审阅安装链。临时候选只说明构建通过，实际 Worker、安装与同 App 操作证据单独记录。Sidebar 正式包由唯一 `build-sidebar-tool.mjs` 构建候选、测试，再 `--promote-from`，不手改正式 JSON。

## 后续完整迁移

| 保留能力 | 维护位置与依赖 | 当前状态 |
| --- | --- | --- |
| 可视选择、高亮、表格、XPath 选择器生成 | `page/` 独立 Installed Page Program，原受控结构化配置通道 | 未实现；XPath 文本提取不等于可视选择迁移 |
| 录制、回放、选择器修复 | `page/` 录制，`controller/` 受控回放；保留来源脏工作区资产 | 未实现 |
| 分页、导航确认、列表详情 | `engine/`、`adapters/`；串行 Page 与导航身份 | 未开放；完整 SDK 已保留 |
| 字段规则、处理、质量验证 | `engine/`、配置与结果 UI | 未开放；完整 SDK 已保留，业务入口尚未开放 |
| 统计与完整结果、CSV/复制 | `src/`、`adapters/`；合法格式及下载合同 | 核心统计/小结果JSON/CSV 已原生验证；复制和大结果分片后续 |
| 暂停、继续、长任务 | `controller/` 与原 RunHost；效果状态查询 | 未开放；原引擎能力保留 |
| 检查点、恢复、跨次调度 | `adapters/`；对应阶段再补 CAS、原提交/effect 查询、分片与业务 lease | 未实现；未知效果不重放 |
| Node 文件与 Node 专用后端 | 来源仓库继续维护；未来必要时走现有授权 Provider | 本轮不迁移 |

完整来源功能编号与证据补充仍见 `.omx/plans/scrapyjs-migration-source-function-ledger-20261028.md`；其中“本轮仅设计”描述是历史阶段，不限制本次实施。本目录中的实现和运行证据才是当前产品进度依据。无语音控制、production 全验收、评分、宽度/缩放或压力测试。
