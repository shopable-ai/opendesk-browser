# 核心链夹具与本轮完成条件

用户最新明确本轮重点是“最近修改的 UI 界面和对应功能”。目标收敛为最新 React 界面的字段即时编辑/排序、合并后的自定义 CSV 设置及其保存、采集、完整下载链。复用 mac96 CFT149 App 1.8.4 的旧候选采集证据；当前 1.8.5 侧栏已补合并控件、独立排序、关闭重置与真实下载增量核验，运行包 SHA 尚未核验。只在现有 main 修改 scrapyjs 自身文件，不提交、推送、晋升正式包或重建 Browser，不触碰真实 UNKNOWN，不发真实 AI 请求。

## 当前目标与增量测试选择（2026-11-02）

用户已允许继续当前窗口且可以不保存。本对话按新指令设置核心开发目标；原对话的暂停目标不自动恢复或迁移。完成标准是补齐最近合并 UI 的实际操作与下载证据，并维护可重复业务夹具，不恢复全量验收。

| 行为 | 已有有效证据 | 本轮增量或停止条件 |
| --- | --- | --- |
| 即时编辑、改名、保存重开、Controller 参数 | 当前两项 UI 集成复验 PASS；1.8.4 原生保存/重开/点选链可复用 | 不重复保存或重新采集；只补必要原生字段排序，读回后恢复本次顺序调整，保留原草稿和规则值 |
| 关联记录、完整记录与原始导出 | 夹具独立手写三条预期及边界值；原 CFT149 20×12 下载核对 | 不重跑采集/全部记录矩阵；本次直接使用当前结果核验变化的导出链 |
| 合并 CSV 与独立顺序 | 夹具已验证表格逐格对应、CSV 全部单元格、关闭重置 | 实际侧栏：默认折叠、表格 URL 首列、CSV price 首列及临时“书名”；互不影响，关闭重开仅重置 CSV |
| 真实文件下载 | 旧 1.8.4 文件不冒充新控件结果 | 新自定义 CSV 及原始 CSV 与同次下载 JSON 对应；核对表头、顺序及受影响的全部单元格 |
| 草稿与显式执行保护 | 夹具已验证无效规则锁住操作、Esc 最后合法值/dirty、编辑不启动 Task | 原生保留“有未保存更改”；不保存、丢弃、重采，不处理未知身份 |

只有当前行为出现新失败、相关输入变化或已有证据失效时，才运行对应增量检查。源码夹具不证明原生权限；版本标题不证明运行字节 SHA。真实 AI、UNKNOWN 恢复、Native 专项、production、评分及正式发布保持延期，不作为本目标完成前置。

## 实施计划

- [x] 挂载当前真实 App/Results/RuleEditor/FieldOrder，复用公开 SDK adapter、Controller 入口及完整引擎建立内存 transport 夹具；采集结果由 Controller 计算，不能预填。
- [x] 在夹具 UI 中修改/改名字段与排序，直接保存/读回，卸载后新实例重开，核对名称、规则、顺序与 CSV 预设持久化。
- [x] 在夹具 UI 中单独采集，进入唯一自定义 CSV 入口，分别调整表格显示顺序和本次 CSV 顺序/名称，逐格核对完整原始 JSON/CSV 及自定义 CSV。
- [x] 取得 1.8.5 临时候选；原 CFT149 侧栏标题及唯一「自定义 CSV 表头」入口已可见。未覆盖并行 watcher 输出，未晋升正式 JSON。
- [x] 在实际侧栏补合并控件、独立排序、字段排序及受影响下载的操作核验。用户明确允许继续且可以不保存；核验后恢复本次顺序调整，保留原有未保存草稿，未保存、丢弃或重新采集。
- [x] 只运行新夹具及受影响的定向检查：原 7 项通过；补强现有两项 UI 场景后定向复验 2 PASS / 0 FAIL，原 5 项 CSV adapter 结果复用。未发现需要修改产品源码的新缺陷。

## 关键条件

| 条件 | 必须观察到的行为 |
| --- | --- |
| 配置与执行一致 | 保存重开后的规则及选项原样进入真实 Controller；output 只用于导出，不混入引擎参数 |
| 最新 UI 真实接线 | 没有旧的独立“显示设置”；表格预览排序位于自定义 CSV 的可选折叠项，默认折叠 |
| 逐条记录正确 | 缺失字段留空，同名记录不串行；完整记录与当前行一致 |
| 完整导出 | JSON 保留原 key 和全部记录；自定义 CSV 的表头、列顺序、每一格都与同次原始结果对应 |
| 显式用户操作 | 编辑、排序、保存不自动启动 Task；采集由单独 start 触发，不依赖 Provider |
| 草稿保护 | 无效规则锁住保存/采集和本次自定义导出；Esc 恢复最后合法规则后可继续 |

这里的 DOM、存储、Task 安装身份、退休与下载回执是测试 transport；它们不证明 Chrome 权限、真实安装、Native、系统文件下载或真实 AI。Controller、引擎、配置校验、序列化和导出代码使用当前源码。

## 可重复夹具与命令

- [静态记录页](../fixtures/core-records.html)：三条范围内记录及一条范围外记录；覆盖同名、缺失字段、`0`、`false` 文本、逗号、引号、换行和公式内容。
- [内存业务接线](core-flow-fixture.mjs)：真实 app-model、SDK adapter、Controller main/capture 与完整引擎；只模拟 Host 边界，不预填采集结果。
- [UI 核心链](ui-core-flow.test.mjs)：两项真实组件集成场景，预期记录独立手写；保存不自动采集，CSV 元数据不进入引擎参数。还核对排序后表格的每一格、重开后 CSV 预设直接用于下载，以及 Esc 保留最后合法修改、宿主 dirty 和原存储。

```sh
node --test --test-reporter=tap \
  examples/sidebar-tools/scrapyjs/tests/ui-core-flow.test.mjs \
  examples/sidebar-tools/scrapyjs/tests/custom-csv-export.test.mjs
```

2026-11-02 已执行，退出码 0：新 UI 集成 2 项及原 CSV adapter 5 项全部通过。[原始 TAP](../../../../artifacts/scrapyjs/ui-core-20261102/targeted-tests.tap) 保留。接续时只读核对候选的 35 项构建输入无漂移，先复用原结果。

只读审查发现上述逐格对应、保存预设下载和最后合法草稿三处覆盖缺口，补入同两项场景后，仅重跑受影响文件：

```sh
node --test --test-reporter=tap examples/sidebar-tools/scrapyjs/tests/ui-core-flow.test.mjs
```

最新结果退出码 0，2 PASS / 0 FAIL，见[补强后的 TAP](../../../../artifacts/scrapyjs/ui-core-20261102/targeted-ui-followup.tap)。原 CSV adapter 五项没有变动，未重复运行。补强首轮因新增预期误把表格默认顺序当作原始 CSV 顺序而失败；核对 `resultKeys` 的标题优先语义后只修测试字面量，[失败输出](../../../../artifacts/scrapyjs/ui-core-20261102/targeted-ui-followup-initial.tap) 保留。产品源码和候选构建输入均未改，无需重建。

## 分层证据与待补步骤

| 层级 | 当前证据及限制 |
| --- | --- |
| 源码业务测试 | 两项 UI 场景补强后 PASS，另五项 CSV adapter 复用原 PASS；覆盖即时编辑/改名/排序、保存重开、采集、完整记录、原始/自定义导出、临时设置重置与无效草稿保护；不证明原生拖动、IME 或权限 |
| 临时候选构建 | [1.8.5 候选](../../../../artifacts/sidebar-tools/scrapyjs/candidate.opendesk-tool.json)，772087 bytes，SHA-256 `47dfbd7fdfe228b331e1084e8879befa00e807a6e220da3be60e99b5cad70fad`；[构建输入](../../../../artifacts/scrapyjs/ui-core-20261102/source-inputs.json) 与 [包回执](../../../../artifacts/scrapyjs/ui-core-20261102/package-receipt.json)。能力、权限与固定 Task 绑定未因版本提升改变 |
| 当前安装态观察 | mac96 原 CFT149 侧栏标题显示 1.8.5；原生输入完成合并控件、独立排序、关闭重置及规则字段排序增量，详见下节。安装器最终确认及该次运行发起过程未完整记录，标题不证明运行字节与候选 SHA 一致 |
| 当前真实下载增量 | 自定义 CSV `(9)`、原始 CSV `(10)`、原始 JSON `(14)` 已实际落盘；以同次 JSON 为基准，两份 CSV 各 20×12 单元格一致，见[核对结果](../../../../artifacts/scrapyjs/ui-core-20261102/native-download-check.json) |
| 真实下载旧证据 | App 1.8.4 + Task 0.6.2 已在同一 CFT149 下载 JSON/CSV，20×12 单元格一致；[原始记录](../../../../artifacts/scrapyjs/recovery-20261102/)。这不证明 1.8.5 合并控件的自定义下载 |
| 正式包与环境 | 项目唯一正式包仍为 1.8.2，未晋升。Browser 继续使用原 `dist/development`，保留根 dev watcher；serve 客户端持续连接未确认，不宣称 HMR 或 production 验收通过 |

## 本轮原生 UI 与下载增量

2026-11-02 在 mac96 原 CFT149（149.0.7827.55）通过 CUA 原生输入操作，沿用已有 20 条结果，没有重新发起采集：

- 唯一「自定义 CSV 表头」入口打开成功；「表格预览列顺序（可选）」默认折叠，展开后可操作。
- 用空格/Home/Enter 将表格 `url` 移到首列，AX 读回第一条链接与标题仍对应；本次 CSV 独立将 `price` 移到首列，把 `title` 临时命名为「书名」。表格保持 `url` 首列，CSV 预览保持 `price` 首列。
- 关闭再重开，CSV 恢复原始列顺序、临时「书名」清空，表格仍保留 `url` 首列，可选排序项再次默认折叠。随后恢复默认表格顺序并关闭设置。
- 在采集规则中将末尾 `rating` 移到首位，再移回末尾。最终顺序恢复 `title/url/column_title/publication/rating`，五条规则仍分别为 `h2 > a::text`、`div.info h2 a::href`、`div.info h2 a::title`、`div.pub`、`span.rating_nums`。
- 回到结果页：仍为 20 条，原有未保存更改保留，结果仍提示来自上次运行。未保存、丢弃或重采；未覆盖原配置。

实际文件为 `/Users/shopme/Downloads/scrapyjs-result (9).csv`（自定义）、`scrapyjs-result (10).csv`（原始）、`scrapyjs-result (14).json`（同次原始结果）。[只读核对脚本](../../../../artifacts/scrapyjs/ui-core-20261102/check-native-downloads.py) 使用 Python 标准 CSV 解析逐格比较，退出码 0；[结果及文件 SHA](../../../../artifacts/scrapyjs/ui-core-20261102/native-download-check.json) 记录两份 CSV 各 240 个单元格一致。原始 CSV 仍以 `author` 开头并保留 `title`，自定义 CSV 以 `price` 开头并使用「书名」，JSON 保留原 key。

本次下载结果的身份为 `clientRequestId=0a36fbab-8956-4066-a29d-bf0e327586c4`、`runId=f8018553-82ba-483e-9fd4-3bacc2aedc35`、`resultId=f8fbc165-740d-48e9-af9c-2cc5ba28d0fc`，文件中为 `completed/released/retired=true`。这是进入本轮时已存在的结果，不补写为本轮发起的采集。

当前核心增量条件已满足。真实 AI、UNKNOWN 恢复、Native 专项、production、运行包字节 SHA 及完整发布验收仍为 `NOT_TESTED`；旧对话暂停目标未改，不进入这些后续阶段。
