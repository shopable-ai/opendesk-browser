# AI Panel 默认列表规则：独立开发实测（2026-11-04）

本独立 Profile 的状态：**页面观察完成；AI 请求终态未知；本机连接未授权、保持关闭。** 此 Profile 没有生成配置或开始采集，不将其记为通过。

## 主链最新证据与资源归属

主链 owner `01a1a1ef-4772-78f0-86f6-2dc3b2e93321` 已在原 CFT149/原安装态完成同 SHA 1.9.11 的真实空白 → 本机 Codex 三字段生成 → 命名保存 → 20 条采集 → 中文 CSV → 关闭重开 → 无 AI 再采 20 条。详见[主链完整证据](blank-page-creation-20261103.md#三字段真实闭环结果2026-11-04-0035北京时间)。本独立 Profile 的未测试项不能覆盖该候选的主链实证。

接到交接后仅只读核对落盘文件：`artifacts/scrapyjs/blank-threefields-20261104/first.csv` 与 `reopened.csv` 都为 2270 bytes、20 条数据加表头，逐字节相同，SHA-256 均为 `1dcea5e1835f028ad1c00b02f916374f83d4606b9f46b2c823366bd369f03c19`；两份原始 JSON 的 runId 分别为 `b928e677-c8f6-475f-9df6-4af16bdc22dd`、`0290444e-ba10-41d7-96a1-11820eac62ae`，与主链报告一致。这是复用实证，不是本 Profile 重测。

主链报告的 Host 观察阻塞来自同一生命周期锁内反复全包验证；最小修复加载后真 AI 成功，没有提高准备预算。本 Profile 本机连接关闭、AI 终态未知是独立状态，不将它归因于该历史 Host 故障，也不否定修复后的主链成功。主链未验证同规则两页；旧原插件两页证据继续单列。

当前桌面租约归 Host owner `01a1a1b4-4a34-7960-8466-b1ed2df478be`；本对话不操作任何浏览器、重发请求或更改权限，保留本 Profile 和原 unknown 请求。版本、临时候选晋升与唯一正式 JSON 的后续本地交付由主链 owner 负责；本对话没有写入这些文件或 `blank-threefields-20261104` 候选目录，不与其并行打包。本对话自己的既有候选和报告只位于 `default-ai-panel-20261104`。

## 范围与身份

- 本轮只验证 Books to Scrape 的默认列表规则创建、原采集、命名保存/重开与同规则两页复用；不恢复已暂停的双站、多轮修改任务，不开展 production、CWS 或评分。
- 业务 owner 保持 `examples/sidebar-tools/scrapyjs/`；三个仓库均沿原默认分支。未修改业务源码、框架、Python runner、SDK、正式安装包，未提交或推送。
- 浏览器为本轮独有 Chrome for Testing 155.0.8059.39，Profile 位于 `artifacts/scrapyjs/default-ai-panel-20261104/owned-profile`，应用 bundle ID 为 `com.opendesk.testing.scrapy-default-ai.01a1a234`。没有使用 `/tmp/opendesk-ai-isolated-01a1a082` 或其他任务的浏览器。
- Chrome 原扩展详情读回 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`、加载目录 `dist/development`；产品调试页显示开发服务已连接，revision 为 `e6138b45099535716698129b082d9dc14ed2a3507792f1ee8b76ee0e0123f7f3`。这是持续开发环境证据。
- 复用既有 App 编译/快照 watcher，不启动第二个 writer。仅用原打包器生成临时候选并在该 Profile 经原安装审阅安装一次：ScrapyJS 1.9.11，1,361,451 bytes，SHA-256 `13f6b2b2b4439ceac27bd34190033f4b7c82555c6c9afc2698333859da76f2b3`，Controller sourceHash `de8c35a26f7345ba9e386a790ca6f76191add4fdae80c31ef9f3985283092134`。
- 开始时源码配置为 1.9.11、正式 JSON 为 1.9.7，原 `--check-project` 报同源不一致。没有晋升或覆盖正式包；不能将这份临时候选称为已正式交付。

## 原用户操作与回执

1. 原「扩展 → scrapyjs → 空白配置 → AI」入口，0 个字段、未保存，AI 来源读回「本机 Codex」，模型沿本机配置。输入并读回：**“请把当前页面每本书的完整书名、价格和书籍链接整理成采集配置，先只采集当前页。”** 驱动没有提供 CSS、JSON 或站点预置配置。
2. 首次原发送返回「准备失败，未发送：浏览器未开放用户脚本能力，请在扩展详情中检查『允许用户脚本』开关。」本次模型未发送，原输入和空白配置保留。
3. 用户明确授权「允许，仅本轮独立 Profile」后，经该 Profile 的 Chrome 原扩展详情开启「允许运行用户脚本」，并读回开关已开启。没有修改日常 Chrome 或其他 Profile。
4. 在已知未发送的失败之后，原发送产生 AI requestId `76b8c114-eb7a-47e2-8a9a-3280974f9020`，返回 `E_AI_UNKNOWN`：「原请求结果未知，请查询或停止原请求。」这不能证明模型已接收或未接收。
5. 原「查询 / 停止原请求」点击一次，返回「停止结果尚未确认……返回内容不会应用」。没有再次发送、重载原窗口或清除 unknown 围栏。
6. 原共享 AI 设置只读显示「OpenDesk 本机连接」关闭，来源仍为本机 Codex。尚未获本轮本机访问的动作时授权，因此保持关闭；这是一项观察到的环境条件，尚不能单独证明 `E_AI_UNKNOWN` 的完整根因。

在另一个本轮自有窗口，通过原「开发 → 运行结果 → 运行记录与技术信息」查询已有任务，选中观察运行读回：

- `runId`: `0da05022-1ed4-406e-b976-3012320f3bcb`
- `state`: `completed`
- `retirementState`: `released`
- 原结果下载 `resultId`: `238f45f7-0253-4929-9a70-957877b83d36`
- 原结果协议 `opendesk.value.v1`；内容 `kind=context`、URL `https://books.toscrape.com/`、一个 HTML 样本 11,881 字符、`truncated=true`。
- 下载文件 SHA-256 `eb202d1c26804b3a56fc1740ced9743dc2911b0ab18c2abfa61adc75b61c31c3`，与原下载回执一致。文件保存在本机 `artifacts/scrapyjs/default-ai-panel-20261104/result-0da05022-1ed4-406e-b976-3012320f3bcb.json`。

这证明本轮原操作之后存在已完成并释放的页面观察结果；不将观察 runId/resultId 当作 AI 请求身份，也不证明原 8 秒准备窗口的全部时序。没有从观察结果构造假模型回包。

## 最小检查与未完成项

为确认临时候选身份与原固定 Controller 委托，执行 `SCRAPYJS_CANDIDATE=artifacts/scrapyjs/default-ai-panel-20261104/candidate.opendesk-tool.json node --test examples/sidebar-tools/scrapyjs/tests/package.test.mjs`，1/1 PASS。此前只读 `sdk-sync.cjs check` 返回 current，未重建/同步 SDK。这些检查不代替原 AI 用户流程。

以下在**本独立 Profile** 均 **NOT_TESTED**：真实模型生成完整 `_listItem` 与相对字段、提案同步原草稿、原采集逐值/顺序/记录归属、命名保存后关闭重开、关闭 AI 后重放、原分页界面明确设置第二页并复用同一规则。主链单页成功以本文顶部链接为准；2026-11-03 原插件 40 条/120 字段证据保持独立，不能代替 AI 同规则两页复用。

本 Profile 后续仅在桌面 owner 释放并完成资源协调、且取得本机访问授权后，才能用原设置连接现有 OpenDesk，保持 Provider/模型/配对不变并先查询原 AI requestId；终态未知时继续禁止重发。当前不重复主链已通过的单页验证，不自动执行两页、安装或正式验收。未证明缺少记录准备能力，因此不接入 `prepareListProposal`、不修改受并行任务保护的 Chat/App/AiPanel/RuleEditor/Results 文件。

原始本机摘要为 `artifacts/scrapyjs/default-ai-panel-20261104/report.json`；它是操作记录，不能冒充产品原始回执。现有 watcher、日常扩展目录与并行 Profile 保持原 owner。
