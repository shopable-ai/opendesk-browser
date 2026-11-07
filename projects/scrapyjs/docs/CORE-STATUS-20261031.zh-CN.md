# ScrapyJS 核心功能结论与验证记录（2026-10-31）

**已确认：豆瓣的手工配置采集、结果查看、列整理和导出可用。尚未完成：AI 修改配置到实际采集的完整流程，以及本次 CSDN 专栏采集。不能据此宣布整个 ScrapyJS 完成。**

本文汇总前序原 Chrome 核验与本次续接核验，并区分两者证据。续接核验没有新增功能或修复代码；此次文档整理也没有重新运行产品、测试或构建。

## 1. 用户操作结论

| 用户操作 | 结论 | 适用范围与证据 |
| --- | --- | --- |
| 手工修改规则、命名保存、重新打开 | 已通过 | 前序另存“真实核验-20261031-手工”，增加 column_title 后保存、重开仍存在；续接确认已保存配置可选择，CSDN 配置也可重开。本次续接没有新增配置或再执行命名保存 |
| 从已安装的 ScrapyJS 开始豆瓣采集 | 已通过 | 续接真实 Task 返回 20 条、12 字段，正常完成并释放资源；条数是当次页面观察，不是固定测试预期 |
| 结果列改显示名、隐藏、恢复默认 | 已通过 | title 改为“书名核验”后表头更新；隐藏 column_title 后为 11/12 列；恢复后为 12/12，显示名回到 title |
| 打开完整记录、复制、关闭后返回原按钮 | 已通过本次第 1 条记录操作 | 详情保留隐藏字段、数字和 null；复制返回确认；Escape 后焦点回到原详情按钮。未逐条检查所有详情 |
| 下载 CSV 和完整 JSON | 已通过 | 实际下载文件可读；240 个 CSV 单元格与 JSON 原始记录逐值一致；隐藏列仍导出，显示名不改写原字段名 |
| HTTP 经 Node 采集并使用 UA/Header | 前序本机实证通过对应范围 | 真实 Node socket、UA/Header 修改与删除、三页采集有证据；续接没有重跑。前序测试服务已停止、配对已撤销，不代表当前服务仍在线或公网已通过 |
| AI 修改规则→审阅差异→应用→命名保存→执行 | 未完成 | 原请求终态 UNKNOWN，无可用恢复句柄；没有发新请求，后续各步骤没有真实模型成功证据 |
| 本次 CSDN 专栏采集及导出 | 未完成 | 固定目标页出现验证码，任务因页面替换被安全停止；没有可核对的专栏数据与导出 |

手工增加的 column_title 仅是与 title 同选择器的别名，**不能作为 AI 修改成功或真正 CSDN 专栏语义修改的证据**。

## 2. 通过了哪些验证

| 验证 | 结果 | 证明与限制 |
| --- | --- | --- |
| 前序真实 Chrome 配置与 Task 操作 | 通过对应步骤 | 原安装链更新 App/Task，手工命名保存、重开、App 启动固定 Task；不是 AI 流程 |
| 前序独立 HTML 数据核对 | 240 个字段一致，20 个 URL 唯一 | 使用原页面另存 HTML，独立提取比较；不是固定夹具或 ScrapyJS 自己生成的预期 |
| 前序持久结果核对 | 一致 | 原 Developer 下载的持久结果解码后与 App 完整结果相等 |
| 续接真实 Chrome 结果操作 | 列改名、隐藏、恢复及第 1 条详情操作通过 | Native accessibility 观察记录；没有截图证据，不代表所有详情逐值检查 |
| 续接独立导出核对 | 20×12＝240 个单元格一致 | Python csv.DictReader 读取实际 CSV，逐值比较实际下载 JSON；原始字段及隐藏列均保留 |
| 续接数据与前序比较 | 一致 | 同一未刷新豆瓣页面的新 Task 数据与前序已独立 HTML 核对的数据相同；没有再做一次 HTML 提取 |
| 前序本机 HTTP 操作 | 通过已观察的本机核心场景 | App 发起 10 个独立 run，目标收到 11 个请求；四个成功项保留原始下载，Stop、超时、500、302 拒绝、early-close、撤销后拒绝为原生界面与持久查询观察转录，未下载原始失败回执 |

续接没有运行 Node 单元测试套件、全仓测试、全量构建或 CI。上表的“通过”只指列明的实际操作与数据比较，不是全项目测试通过，也不是 production 验收。

## 3. 两个主要未完成点

### AI：旧请求无法确认结束

原 requestId：`cb6d0e92-0e45-4ae0-a30c-96377d535106`。

最新一次面板观察只有 local_codex 标签、空输入及禁用发送按钮，没有关联原 requestId 的恢复、查询或停止控件，也没有可信 sessionId、turnId 或终态。公开 [AI 合同](../../../../docs/api/sidebar-tools-ai.zh-CN.md) 要求原请求身份及真实终态；当前没有公开的跨实例恢复入口。

因此仍记 UNKNOWN。本次续接新 AI 请求为零，没有清 pending/storage、换 Provider/Profile、重放或应用迟到内容。后续先解决原请求状态恢复的实际阻塞；只有可信终态和合法发送条件具备后，才验证一次真实提案，并分别记录格式校验、差异、应用、命名保存、重开和明确启动 Task 的结果。

### CSDN：目标页验证与页面替换停止

原已打开 `https://download.csdn.net/list/blog/100-0-0-0-0-1.html` 可见专栏列表。原“CSDN 核心”配置的固定目标为 `https://download.csdn.net/list/blog/100-0-0-0-5-1.html`；从 App 开始采集并导航后，该目标页显示“请进行安全验证”，要求拖动拼图。

原 App 及 Developer 按确切 runId 的持久查询显示 `stopped / released`，错误 `E_DOCUMENT_REPLACED: Controller fenced`。App 没有请求 Stop。页面替换触发安全停止与站点验证码都是实际观察，**尚不能据此认定采集器解析代码有缺陷**。

没有操作验证码、重试、换 Profile 或放宽权限。后续仅在固定目标页合法可用后继续最短采集链；本次 CSDN 数据、导出和真正语义修改仍未通过。

## 4. 候选、运行身份与原始证据

以下是 2026-10-31 的最近核验记录，不是服务持续在线的保证。原环境为 Chrome for Testing 149.0.7827.55，扩展 `ccfcjegpkdlgbclopjmadlcjedelidmf`，实际加载仓库 `dist/development`；调试页当时显示开发服务 connected，revision `f1f15cda72f98fd203954d510e179134687ea2304e2131016090305cf8384269`。这是持续开发证据，不能代替 production；也不证明所有已打开网页重新注入 SDK。

| 对象 | 固定身份 |
| --- | --- |
| App | 1.8.0；正式文件 SHA256 `675002c85a52beef494c0ab77694fd29b1a051cb41aa407cb744b3443abbc641` |
| Task | scrapyjs.capture 0.6.0；文件 SHA256 `4b8db4f5158fb765b50e201c092514f5551861038a4ff426072af38b2877f01e` |
| Task manifestHash | `e240de3001be0e4c990bb8ed19ecc0cb7a97615bd94d4e5e1992c904c954ae1f` |
| Task sourceHash | `bf6effdd38365ab07b4daaebfa95296d08b361b5aef4c571a52edb7d6eae1791` |
| 前序豆瓣成功 run / result | `5bdfe9ee-fd0d-400d-90aa-2d1ca1b99655` / `1551e434-5c5d-45a8-bc21-c17e8eb0c5a9`；completed / released |
| 续接豆瓣成功 run / result | `6c9d2d26-7311-440e-b90d-5b4149794c47` / `97a83f0a-3f41-40f7-857c-3509ef31d662`；completed / released |
| 本次 CSDN run / result | `b1da06b1-26c7-4558-90d3-ef27ea4aa269` / `63ddc4de-c7da-4fed-bfc2-633ee08eb0f3`；stopped / released |
| 续接 JSON 下载 SHA256 | `3c35eb22434d154fb28d205426ac4867e30521a38fcff9d323b9bd041fba4dab` |
| 续接 CSV 下载 SHA256 | `0249763e0008ef7f4093e443718224ed9fcd340668851ac988c0e8a5ead668f6` |

本次文档整理重新读取源码配置及正式文件摘要，与上述候选一致；没有重新核验浏览器安装态。原始文件位于 ignored 本机 artifacts，可能不随 Git checkout 存在；下列链接用于本机追溯，不能把文档已保存当成原始附件已提交：

- [前序原 Chrome 记录](../../../../artifacts/scrapyjs/product-truth-20261031-original/handoff-report.md)、[独立 HTML 比较](../../../../artifacts/scrapyjs/product-truth-20261031-original/dom-comparison.json)、[持久结果比较](../../../../artifacts/scrapyjs/product-truth-20261031-original/durable-comparison.json)、[HTTP 记录](../../../../artifacts/scrapyjs/product-truth-20261031-original/http-comparison.json)。
- [续接操作记录](../../../../artifacts/scrapyjs/core-ui-20261031-continuation/report.md)、[原生界面观察转录](../../../../artifacts/scrapyjs/core-ui-20261031-continuation/native-ui-observations.json)、[CSV 自动比较](../../../../artifacts/scrapyjs/core-ui-20261031-continuation/douban-export-comparison.json)。
- [本次实际 JSON 下载](../../../../artifacts/scrapyjs/core-ui-20261031-continuation/douban-result.json)、[隐藏列状态下实际 CSV 下载](../../../../artifacts/scrapyjs/core-ui-20261031-continuation/douban-hidden-column.csv)。

## 5. 保留的开发边界

续接核验没有修改实现或包，没有提交、推送、重载/重装 Browser、切换模型/Provider 或启动/停止服务。最后留在 CSDN 验证页，重开的 App 仍为已保存的“CSDN 核心”，无活动 Task；Developer 的源码 Provider 未就绪问题未处理。

活跃请求中撤权、已配对时服务退出、公网 HTTP、production、完整生命周期/CI/矩阵、宽度/缩放、压力及 95+ 评分仍未执行。前序只证明空闲撤销及随后拒绝，不能称为活跃撤权中断通过。后续按当前核心操作推进，不因这些延期项恢复全量验收，也不为没有复现的缺陷修改代码。
