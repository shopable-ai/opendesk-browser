# Google 搜索任务

本目录是两个 Controller Task 的业务源码、固定包和定向测试 owner。它们使用同一公开 Controller SDK，身份独立；本轮没有修改稳定版、内置目录或框架。

| 任务 | 固定版本 | 行为 |
| --- | --- | --- |
| `google.search.top3` | `1.0.7` | 稳定直达版；同关键词结果页只读，否则直接导航搜索结果。 |
| `google.search.interaction.top3` | `1.0.0` | 输入与点击测试版；填写、读回、等待建议层搜索按钮、点击一次，再读取前三条自然结果。 |

输入与点击版源码为 [google-search-interaction-top3.js](src/google-search-interaction-top3.js)，包为 [google.search.interaction.top3.v1.opendesk-task.json](releases/google.search.interaction.top3.v1.opendesk-task.json)。它不是稳定任务的升级包。

参数示例：

```json
{"query":"时间清单","limit":3,"showExecutionTab":true}
```

只接受 `https://www.google.com` 的首页、`/webhp` 或 `/search`。从结果页运行时，先用 `goto` 返回首页；同关键词也重新执行输入与点击。提交前两次读回输入，核对页面未变，再对建议层的第一个 `input[name="btnK"]` 调用一次 Locator `click`。不会点击建议项、使用 Enter、直接拼接搜索 URL 兜底或在失败后自动重放。输入与点击是 ISOLATED 世界的 DOM 操作，不代表可信系统键鼠事件。

Google 建议层可能覆盖首页原按钮，故本版等待建议层自己的搜索按钮可见。建议层不出现、结构改变、验证码、超时、取消、权限错误或效果未知均停止并保留错误；不切换其他提交方式。导航完成后另外等待 `#rso`，过滤已识别的广告、隐藏项、无效或重复链接。结果中的 Google `/goto` 链接保留页面真实地址，只移除 `gsessionid`。

## `await page.goto` 与 `waitUntil`

现有 SDK 支持等待导航，无需修改框架。详见[公开 Controller 文档](../../docs/api/controller.zh-CN.md)和[类型](../../types/opendesk-page.d.ts)。

| 调用 | 支持的值 | 语义 |
| --- | --- | --- |
| `page.goto(url, options)` | `complete`（默认）、`load`、`domcontentloaded` | `complete` 与 `load` 均等待 Chrome `webNavigation.onCompleted`；`domcontentloaded` 等待 `onDOMContentLoaded`。默认超时 30 秒。 |
| `locator.click(options)` | `load`、`domcontentloaded` | 声明点击将触发新文档导航，并等待原目标的可信文档交接；不接受 `complete`。 |

`goto` 返回 `Promise<void>`，不能把返回值当 Playwright `Response`。不支持 `networkidle`、`networkidle0` 或 `networkidle2`；加载事件也不证明业务内容已经准备好。本版首页准备使用 `load`，提交使用 `domcontentloaded`，之后重新创建结果 Locator 并等待结果区域。

## 本轮验证与安装状态（2026-11-15）

日常 Chrome，扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`，沿用 `dist/development` 和原 `npm run dev`。收尾时「调试 → 本地开发服务」实读已连接，应用的构建 revision 为 `b6af992b337ca2569526f998780b77514f092ad5c294decfcc5dd00def6793fa`；此状态本身不证明旧网页重新注入 SDK。以下为直接编辑区的完整源码草稿实测，不是已安装任务运行或 production 验收。

最终源码 SHA-256：`97792794894702ecb81e2ef30011222b01df3a88514c90de5a59c0999542d8f3`。

| 操作 | runId | 实际回执 |
| --- | --- | --- |
| 首页查询「时间清单」 | `f9c81953-6bf2-49a3-9031-db6ac0a9e416` | `success`、3 条、已完成、资源已释放。 |
| 结果页再次查询「时间清单」 | `815027ea-8305-4ee7-aad4-bd75a239557f` | `success`、3 条、已完成、资源已释放。 |
| 结果页更换为「OpenDesk Browser」 | `67a23be1-2249-4087-9958-c94fc093a4e6` | `success`、3 条、已完成、资源已释放。 |

第一条运行通过产品「下载结果 JSON」导出；本机原始下载与解码副本位于 `artifacts/google-search-interaction-20261115/`，不作为发行文件。第二、三条依据原 Side Panel 可见结果、运行详情和源码哈希记录。

旧候选尝试通过点击 logo 收起建议层，完整运行 `22cfe8d9-8f8c-4417-b46c-11337e019f47` 超时并释放资源；没有自动重放。当前代码已改用建议层内按钮，上述三个成功 run 均绑定最终源码。中途一个测试页持续显示导航中，改用本任务新建 Google 页后恢复；未重启日常 Chrome 或其他会话。

最终 JSON 已经由「我的 → 添加任务 → 选择任务文件」导入为 `google.search.interaction.top3@1.0.0` 待验证候选；尚未验证、设为可用、审阅安装或从已安装列表运行。浏览器工具拒绝读取 `chrome-extension://` 任务目录页（仅允许 HTTP(S)），未绕过这一限制。后续应在原产品链选择该候选，核对 Manifest 和上述同源码 runId，完成原验证、设为可用与安装审阅；稳定版保持不动。Node 包验证不能替代这些步骤。

定向检查：

```sh
node --check task-packs/google.search/src/google-search-interaction-top3.js
node --test task-packs/google.search/tests/google-search-actions.test.mjs task-packs/google.search/tests/google-search-interaction.test.mjs
```

25/25 通过，涵盖独立包身份/哈希、输入读回、建议按钮等待、重复与换词查询、一次提交调用、结果提取及错误不重放。另有 17 项现有导航定向测试通过，覆盖事件/文档交接、错误、取消和未知效果；没有修改框架实现。真实 Chrome 撤权、取消、无建议层/无结果、完整安装与生产验收仍为 `NOT_TESTED`，未运行全量矩阵、压力测试或评分。
