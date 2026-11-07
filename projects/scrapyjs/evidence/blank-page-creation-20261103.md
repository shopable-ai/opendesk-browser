# 空白网页配置创建：核心开发证据

## 当前源码 1.9.12 的真实闭环（2026-11-04 01:08，北京时间）

本节为最新结论，覆盖下节 00:52 的新版本未测试状态；旧候选证据继续保留，不混用版本。本轮设定的关键条件为：真正空白、真实模型、仅首页三字段、原保存、真实 20 条、实际 CSV 20×3、关闭重开不再调用 AI 即可复用，并核对同候选/同源包与退休释放。以下条件均有当前 1.9.12 的实际结果。

### 环境、安装与原生操作

- Host owner `01a1a1b4-4a34-7960-8466-b1ed2df478be` 正常释放后，本任务 `01a1a1ef-4772-78f0-86f6-2dc3b2e93321` 才申请原生 UI 租约。继续已有 `/Applications/Google Chrome.app` CFT 149、原测试 Profile；没有新建/启动 Chrome 克隆 App。个人 Chrome 未操作。
- 原 Chrome 扩展详情核对 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`、路径 `~/文稿/workspace/opendesk-browser/dist/development`、扩展及用户脚本已允许；调试界面显示开发服务已连接、指纹 `0c6b5d570d9ac55101394ac17de1b42c787f300a1f5de13a5b09b45bb135d654`。SW SHA 仍为 `94dd30f256d2ceabc2e9eb995c0b68bcbfda221f23d07f5c4f757d5f3bdf81c9`。这是持续开发环境，不是 production 验收。
- 通过原“扩展 → 筛选和管理扩展 → 导入扩展”选取下节 1.9.12 候选，可信审阅读回 **1.9.11 → 1.9.12、权限未变化、原数据保留**。确认更新后显示已安装，实际工具页头 **v1.9.12**。首次导入入口在选择文件前被 Host 安全更新刷新打断；读回状态后重走入口，仅完成一次实际更新。没有卸载重装 Chrome 扩展，也没有修改浏览器存储。
- 本次安装、实测与唯一正式 JSON 均为 **1381610 bytes / SHA-256 `5c21dad17a33d6bbff5caf66dba0bb722017ed14eaddad85f6587e51c76b23ec`**；固定 Controller SHA `de8c35a26f7345ba9e386a790ca6f76191add4fdae80c31ef9f3985283092134`。01:08 再运行原打包器 `--check-project` 返回 **PROJECT_PACKAGE_MATCH**；其中 `installed:false` 是离线打包器未执行安装，不否定上述独立原生安装回执。
- 原生操作仅使用 CUA，没有 CDP、注入脚本、模拟 Provider 或采集数据。01:08 正常释放租约，回执 `native_ui_owner:null`；已将释放及实际结果交还 Host owner。原 watcher 保留，没有第二 writer。

| 用户环节 | 1.9.12 实际结果 |
| --- | --- |
| 真正空白 | **PASS**；Books 公开首页，原“新建配置”后 `{"url":"","itemConfig":{}}`，零字段、无结果 |
| 真实自然语言创建 | **PASS**；来源“本机 Codex · 模型由本机配置”；下方原话粘贴读回后仅发送一次，真实回复“已更新当前页的单页采集配置草稿。” |
| 规则、范围、输出核对 | **PASS**；`article.product_pod`；完整书名 `h3 a` 读取 `title` 属性，价格 `.price_color::text`，链接 `h3 a::href`；maxPages=1、下一页空、详情采集关闭；中文表头及顺序均保留 |
| 原保存 | **PASS**；原“保存配置 → 创建配置”，名称 `Books三字段单页-1.9.12-20261104`，明确读回“配置已保存”；旧命名配置保留 |
| 实际采集 | **PASS**；原“开始采集”，真实 20 条；网页 UI 的 20 本完整书名及对应价格与结果一致，长标题未截断 |
| CSV 与原始结果下载 | **PASS**；原“自定义 CSV 表头 → 下载 CSV”和原 JSON 下载；下载记录均出现真实文件及 Finder 入口，文件完整落盘可解析；每次 60 个单元格与同次原始结果完全一致 |
| 关闭重开 | **PASS**；原“返回扩展列表”卸载工具界面后重新打开；自动选中同一名称，完整 JSON 保留；重开导出配置与首次逐字节相同 |
| 不问 AI 再次复用 | **PASS**；未打开 Chat、未编辑规则，直接原“开始采集”再得 20 条；两次完整 data 数组相同，两份 CSV 逐字节相同 |
| 历史结果自动回显 | **未提供**；重开实际显示“尚无记录”，本次通过的是保存规则重新采集和导出的复用，不能称作旧结果自动恢复 |

本次真实发送原话：

> 请根据当前网页创建一个采集配置：采集每本书的书名、价格和详情链接，CSV 表头分别为书名、价格、详情链接，只采当前页。

AI 生成、原保存及重开后回读的完整配置如下，未手工补字段或改规则：

```json
{"url":"https://books.toscrape.com/","itemConfig":{"_listItem":"article.product_pod","title":{"selector":"h3 a","read":"attr","attr":"title"},"price":".price_color::text","url":"h3 a::href"},"maxPages":1,"output":{"fieldNames":{"title":"书名","price":"价格","url":"详情链接"},"fieldOrder":["title","price","url"]}}
```

| 实际运行身份 | 首次采集 | 关闭重开后复用 |
| --- | --- | --- |
| clientRequestId | `c6d2a661-4654-4589-998d-11f684dfc513` | `dc755612-214b-4cb2-b639-4b8db8005799` |
| runId | `1c38bfd0-cd78-4a5e-b65d-134908dd1d94` | `dbc05a9a-1d3e-4dc0-90f0-2533429bc519` |
| resultId | `5cfd48f1-0e1d-43a6-8f2b-f6ddda5ae785` | `08b141b8-d3f0-4eff-ae42-b646fc4958e1` |
| 宿主 / 引擎 / 退休 | completed / completed / released，retired=true | completed / completed / released，retired=true |
| engine elapsedMs | 7908 | 8355 |
| 页数 / 条数 / stopReason | 1 / 20 / single_page | 1 / 20 / single_page |

两次 `audit.listUrls` 均只有 `https://books.toscrape.com/`，`detailUrls=[]`、duplicates=0。accepted / committed / emitted 均 20，pending / rejected / deliveryUnknown 均 0，error=null。当前单页场景未再出现 90 秒超时，不外推到其他网站或长任务。

### 实际落盘内容与交付边界

| 原下载文件（均位于 `/Users/shopme/Downloads/`） | bytes | SHA-256 |
| --- | --- | --- |
| `scrapyjs-result (19).csv`、`scrapyjs-result (20).csv` | 各 2270 | `1dcea5e1835f028ad1c00b02f916374f83d4606b9f46b2c823366bd369f03c19` |
| `scrapyjs-result (21).json` | 43712 | `ad77e2caecc0a796686a6f889d3091085b892acd529d86ab4896e498c03caf48` |
| `scrapyjs-result (22).json` | 43712 | `07563635ca6588e61e8d34987e2f6863743031d2ffa81dcd1a2ec7e84ca00707` |
| `scrapyjs-config (4).json`、`scrapyjs-config (5).json` | 各 465 | `3bd8443cb94c2045537532b1620e7daae495042bb9f7340a60d21d07d200f28b` |

CSV 解析为表头 `书名,价格,详情链接`，其后恰好 20 行、每行 3 列；两次共 120 个数据单元格与各自 JSON 的 title / price / url 全部相同。原文件未改写，原样复制到忽略目录 `artifacts/scrapyjs/blank-threefields-20261104/current-source/` 的 `first.csv`、`reopened.csv`、`first-result.json`、`reopened-result.json`、`first-config.json`、`reopened-config.json`。CSV 内容与下方 1.9.11 的完整 20 行清单同 SHA，£、长书名、逗号及引号均保留。实际开头为：

```csv
"书名","价格","详情链接"
"A Light in the Attic","£51.77","catalogue/a-light-in-the-attic_1000/index.html"
"Tipping the Velvet","£53.74","catalogue/tipping-the-velvet_999/index.html"
```

- 链接仍为网站原始相对 href，以 `https://books.toscrape.com/` 为基准；没有将文件后处理为绝对 URL。绝对 URL 便利性与历史数据自动回显都未实现。
- 实际故障及修复详见下方 1.9.11 节：同一操作反复校验大安装包导致空白观察预算耗尽；旧配置库总量超 8192 导致保存失败。分别用原锁内复用已校验安装绑定、工具内有界压缩目录解决，权限/撤权及 CAS 保护保留。当前 1.9.12 已重复通过真实 AI、保存和两次采集/导出。
- 组件与门禁证据独立：Host 定向 7 项、保存/目录/profile 55 项、runner App/client 31 项、候选包合同 1 项通过；来源和语法检查通过。没有把这些数量算作真实 AI 或浏览器操作证据。
- 本轮实际改动文件共 14 个（保留每个文件的并行改动）：`src/platform/host/controller-methods.js`、`tests/environment/task-delegation-recovery.test.mjs`；工具目录下 `adapters/app-sdk.js`、`src/app-model.js`、`tests/catalog-storage.test.mjs`、`tests/app-model.test.mjs`、`tests/profiles.test.mjs`、`tests/react-fixture.mjs`、`tests/capture-fixture.mjs`、`tests/local-runner-app.test.mjs`、`tool.config.json`、`scrapyjs.opendesk-tool.json`、`README.zh-CN.md`、本证据文件。其余 dirty 不归本轮冒领或清理。
- 当前最小链无剩余阻塞。Host watcher 高内存仍由 Host owner 跟进，不能宣称已修复；本轮未发生 OOM。错误规则/运行中停止的新增原生故障注入、跨站/多页、production、全量 CI、独立评分及长期压力均 **NOT_TESTED**；只读本地项目预览未放开真实 AI/Task/正式写入。未提交、推送或发布。

## 目标条件与同源包收尾（2026-11-04 00:52，北京时间）

用户要求“设置目标和关键测试条件”后，本对话已建立原生 active goal，不设臆测预算。完成条件为：同一冻结候选从真正空白经真实 AI 创建三字段单页规则；原界面保存、实际采集 20 条、CSV 下载并逐值核对；关闭重开后不再生成规则即可再采并得到同内容 CSV；记录 run/result/request、退休释放、文件字节和 SHA；当前源码与唯一正式 JSON 经原门禁保持一致。组件、真实 AI、原生操作及安装证据独立记录，未知请求不重放。下节 1.9.11 已证实真实业务链，本节只补当前源码与包交付，不能把组件 PASS 当成新版本的原生 PASS。

- 当前 `main` 已包含 `0561820a3` 的本机 runner 输入、结构读取和样式修改，与下节已测候选的 UI 字节不同。旧候选晋升拒绝正确，未恢复旧源码或绕过来源检查。AI Panel owner `01a1a234-ba99-7090-b488-8c0d871e8830` 确认未写版本、正式包或主链候选，保留其独立 Profile、unknown 请求和文档修改。
- 工具版本单独递增为 **1.9.12**。保留原 Vite PID68419 / 快照 PID68906，只触发已有 watcher；没有第二 writer、Browser production 构建、Chrome 扩展重装或克隆 App。新 receipt `16f38cf775ac63305bcbb8a93ca6c5b313f1a1c6e7d0ae04398c76207f88b6bb` 的 42 项源码均逐项核对无漂移。
- 原打包器生成独立候选 `artifacts/scrapyjs/blank-threefields-20261104/current-source/candidate.opendesk-tool.json`，**1381610 bytes / SHA-256 `5c21dad17a33d6bbff5caf66dba0bb722017ed14eaddad85f6587e51c76b23ec`**。Controller 字节仍为 `de8c35a26f7345ba9e386a790ca6f76191add4fdae80c31ef9f3985283092134`；权限、来源、固定 Task pin 未增加。
- 定向 runner 检查最初在执行前因 data URL fixture 缺少 `capture-input.js` / `CaptureStructure.jsx` 的模块映射失败；补齐原 fixture 映射，保留其并行 `Results` 导出。随后补齐 `local-structure-state` fixture 行和 linkedom select 的真实 option 选择/回读，未改产品代码。旧断言将只读 `ai.info` 当推理、并要求主 AI 草稿在 unknown 时解锁，与当前源码保护不符；改为明确禁止 `ai.generate/ai.cancel`，确认主草稿仍锁定、独立 runner 可编辑，原 unknown 指针不清除。最终 runner App/client **31 项通过**、无 NaN 驱动告警，包合同 **1 项通过**；这些均为组件/fixture，非真实 AI 或浏览器证据，没有以改产品保护迎合旧断言。
- 门禁顺序：原 `--out` → 上述定向测试/包合同 → 原 `--promote-from` 成功 → 原 `--check-project` 返回 **PROJECT_PACKAGE_MATCH**。唯一 `scrapyjs.opendesk-tool.json` 现为同 SHA **1.9.12**，未提交、推送或发布。旧 1.9.11 不可变候选及实际 CSV/JSON 全部保留。
- **00:52 当时 1.9.12 安装/原生复测：NOT_TESTED；现由上方 01:08 的实际复测覆盖。** 00:51 实读桌面租约仍为 Host owner `01a1a1b4-4a34-7960-8466-b1ed2df478be`，其原生操作 active；已协调在其正常释放后再申请，不抢占其 UI。当时原安装态最后实证仍为下节 1.9.11。新包不是 Chrome 扩展，也没有另建 App；后续只用原受控窗口和原 Sidebar Tool 同 ID 导入更新。

## 三字段真实闭环结果（2026-11-04 00:35，北京时间）

本节为 1.9.11 阶段结果，覆盖下方 23:45 / 23:10 的未测试结论；最新 1.9.12 同源安装及复测见上方。owner `01a1a1ef-4772-78f0-86f6-2dc3b2e93321`；现有 `main`，保留全部并行 dirty，无分支、worktree、PR、提交、推送、发布或 production 构建。没有创建/启动旧 Chrome 克隆 App；继续现有 `/Applications/Google Chrome.app` CFT 149 和原 Chrome 扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`、`dist/development`。真实业务全程为原生 CUA 操作，没有 CDP、注入页面、修改浏览器存储或模拟 AI/采集数据。

### 实际故障、最小修复与边界

- 下方历史权限范围修复加载后，空白观察仍失败：`aeda9cff-9d32-4803-ada4-e38177f016f0`（start 1701ms / maxRead 3699ms）、`30e7f871-4529-4df0-955e-df4242145890`（1703 / 3696）、`4335daba-cdde-4547-a424-7393e1c1e93a`（1774 / 3626）。均经原开发查询准确读回 stopped / E_CANCELLED / released，未知请求没有重放。单凭历史权限范围问题不能解释它们。
- 临时 Host 分段日志定位第一条 `page.url()` 在同一 App 生命周期锁内反复校验整个约 1.35MB 安装包，约 5 秒才返回；相同普通开发 Controller 的 URL / title 只需 102 / 82ms。Authority 组件进一步复现同一个操作读取安装目录 27 次。临时日志已全部删除，未保留业务站点分支或调试开关。
- 经 Host owner `01a1a1b4-4a34-7960-8466-b1ed2df478be` 协调，`controller-methods.js` 在原生命周期锁内只校验同一安装绑定一次，Chrome 站点权限和撤权栅栏仍逐步执行；安装、停用等原 writer 仍被同一锁串行化。目标运行查询不核验无关历史网站权限的前项修复保留。没有延长 5500ms AI 准备预算或 90000ms Controller 上限，没有新建 Host/SDK/权限层。
- 真正加载修复的开发指纹为 `e6138b45099535716698129b082d9dc14ed2a3507792f1ee8b76ee0e0123f7f3`；原调试 UI 显示开发服务已连接，SW SHA-256 `94dd30f256d2ceabc2e9eb995c0b68bcbfda221f23d07f5c4f757d5f3bdf81c9`。随后安装态 1.9.10 的真实 AI 空白创建首次成功。
- 随即实际保存失败：`全部命名配置超过8192字节，未保存；请减少配置数量或内容`。原配置库有 12 份旧配置；未删除或覆盖它们。通过原导出入口备份本轮未保存草稿为 `scrapyjs-config (2).json`，再仅放弃本轮草稿进入同 ID 更新。
- 工具内修复采用原 `capture-config` 键、原 ETag 条件写入和完整回读对账。目录超过 8192 字节时用浏览器原生 gzip；实际持久化 JSON 仍不超过 8192 字节，解压目录最多 32768 字节、最多 32 份配置，单配置和引擎参数上限不变。读取兼容旧明文目录，损坏/超限/冲突拒绝且不无条件覆盖；没有改变 Host 配额。升级后的目录不能由旧的工具代码直接读取，未尝试降级。

### 同一已安装 1.9.11 的实际用户链

候选文件：`artifacts/scrapyjs/blank-threefields-20261104/candidate.opendesk-tool.json`，1361451 bytes，SHA-256 `13f6b2b2b4439ceac27bd34190033f4b7c82555c6c9afc2698333859da76f2b3`；Controller SHA-256 `de8c35a26f7345ba9e386a790ca6f76191add4fdae80c31ef9f3985283092134`。构建时 receipt `7747f2cef7621e226e337d022b04db8159f3f5edbe1962e75663132f8f2757ee`。原可信导入审阅读回 **1.9.10 → 1.9.11、权限未变化、原数据保留**，确认更新后实际页头 v1.9.11。这是 Sidebar Tool 原位更新，没有重装 Chrome 扩展。

| 用户环节 | 同候选实际结果 |
| --- | --- |
| Books 首页与真正空白 | PASS；原“新建配置”，JSON 为 `{"url":"","itemConfig":{}}`，未保存、无记录 |
| 自然语言与真实模型 | PASS；本机 Codex 来源，原发送一次，回复“已更新当前页的单页采集配置草稿。”；非预览占位 |
| AI 规则核对 | PASS；下方完整配置；原规则 UI 核对三字段、中文表头顺序、下一页空、maxPages=1、详情采集未勾选 |
| 原保存 | PASS；命名 `Books三字段单页-AI-20261104`，原“创建配置”后读回“配置已保存” |
| 原开始采集 | PASS；20 条，单页，详细身份见下表；没有用完成状态替代记录 |
| 原自定义 CSV / JSON 下载 | PASS；原下载列表实际文件已完成，文件落盘、逐行读取比对，CSV 20 行 × 3 列 |
| 关闭并重开 | PASS；返回扩展列表再打开同一工具，自动选中命名配置，完整 JSON/中文名称/顺序保留；重开导出的 JSON 与前稿逐字节相同 |
| 保存配置再次采集、数据复用 | PASS；无需再问 AI 或编辑规则，再次原开始采集得 20 条；第二份 CSV 与第一份逐字节相同，JSON 全部 20 条数据相同 |
| 关闭后自动回显旧数据 | 未提供；实际重开显示“尚无记录”，本次验证的是保存规则重新运行和重新导出的复用，不声称历史结果自动恢复 |

实际发送的原话：

> 请根据当前网页创建一个采集配置：采集每本书的书名、价格和详情链接，CSV 表头分别为书名、价格、详情链接，只采当前页。

AI 生成并原 UI 保存、重开的配置（不是手工填写）：

```json
{"url":"https://books.toscrape.com/","itemConfig":{"_listItem":"article.product_pod","title":{"selector":"h3 a","read":"attr","attr":"title"},"price":".price_color::text","url":"h3 a::href"},"maxPages":1,"output":{"fieldNames":{"title":"书名","price":"价格","url":"详情链接"},"fieldOrder":["title","price","url"]}}
```

| 真实运行身份 | 首次 | 关闭重开后复用 |
| --- | --- | --- |
| clientRequestId | `39b1f800-dcd7-41fc-b306-d5196537e074` | `8ddd4fe8-fd95-4233-b16a-4456d4c54bb4` |
| runId | `b928e677-c8f6-475f-9df6-4af16bdc22dd` | `0290444e-ba10-41d7-96a1-11820eac62ae` |
| resultId | `12e8eb5d-4570-4697-b03e-970e1dbd5cde` | `3ad1345f-f8af-4ed5-bcb8-43ad1bea4525` |
| 宿主 / 引擎 / 退休 | completed / completed / released | completed / completed / released |
| 真实 engine elapsedMs | 7934 | 7972 |
| 页数 / 条数 / stopReason | 1 / 20 / single_page | 1 / 20 / single_page |

两次原始结果都包含 `audit.listUrls=["https://books.toscrape.com/"]`、`detailUrls=[]`、duplicates=0；accepted / committed / emitted 均 20，pending / rejected / deliveryUnknown 均 0。两次采集均未出现 90 秒超时。这不证明所有网站或长任务超时都已修复。

### 真实下载文件与数据

- 首次 `/Users/shopme/Downloads/scrapyjs-result (17).csv`，重开后 `/Users/shopme/Downloads/scrapyjs-result (18).csv`，均 **2270 bytes**，SHA-256 均 `1dcea5e1835f028ad1c00b02f916374f83d4606b9f46b2c823366bd369f03c19`，逐字节相同；解析为 20 条、每行恰 3 列。下载面板第二份明确显示“2,270 B • 完成”。
- 原始 JSON 首次 `scrapyjs-result (19).json`，43712 bytes，SHA `c6e84f726ef0bad1392c6d0a8bdf7a6978336b0f4fc0903091819523a6e713fc`；复用 `scrapyjs-result (20).json`，43712 bytes，SHA `027e0fca59f0cfbd51ae14ca2feb38adb0a7be221ceb729dfd049cac97821ebd`。两次完整 data 数组相同，每条 CSV 与同次 JSON 的 title / price / url 对应。第二份 JSON 请求后 CUA 读取超时，完成状态未再从下载页读回；真实文件已完整落盘、JSON 可解析、无 `.crdownload`，运行身份及 20 条全部核对成功。
- 重开配置 `/Users/shopme/Downloads/scrapyjs-config (3).json`，465 bytes，SHA `3bd8443cb94c2045537532b1620e7daae495042bb9f7340a60d21d07d200f28b`，与此前真实 AI 草稿导出的 `(2)` 完全相同。
- 原文件未改写；只读验证后复制到忽略目录 `artifacts/scrapyjs/blank-threefields-20261104/first.csv`、`reopened.csv`、`first-result.json`、`reopened-result.json`、`reopened-config.json` 便于复查。
- **链接实情：** 原引擎 `::href` 返回网页原始相对 href，下方内容保持原样，没有在证据或导出后补绝对 URL；基准是 `https://books.toscrape.com/`。CSV 中的书名含完整长标题，价格保留 £ 和两位小数。独立 CSV 的绝对链接便利性仍未实现，未算作绝对 URL 验收通过。

真实 CSV 的完整内容：

```csv
"书名","价格","详情链接"
"A Light in the Attic","£51.77","catalogue/a-light-in-the-attic_1000/index.html"
"Tipping the Velvet","£53.74","catalogue/tipping-the-velvet_999/index.html"
"Soumission","£50.10","catalogue/soumission_998/index.html"
"Sharp Objects","£47.82","catalogue/sharp-objects_997/index.html"
"Sapiens: A Brief History of Humankind","£54.23","catalogue/sapiens-a-brief-history-of-humankind_996/index.html"
"The Requiem Red","£22.65","catalogue/the-requiem-red_995/index.html"
"The Dirty Little Secrets of Getting Your Dream Job","£33.34","catalogue/the-dirty-little-secrets-of-getting-your-dream-job_994/index.html"
"The Coming Woman: A Novel Based on the Life of the Infamous Feminist, Victoria Woodhull","£17.93","catalogue/the-coming-woman-a-novel-based-on-the-life-of-the-infamous-feminist-victoria-woodhull_993/index.html"
"The Boys in the Boat: Nine Americans and Their Epic Quest for Gold at the 1936 Berlin Olympics","£22.60","catalogue/the-boys-in-the-boat-nine-americans-and-their-epic-quest-for-gold-at-the-1936-berlin-olympics_992/index.html"
"The Black Maria","£52.15","catalogue/the-black-maria_991/index.html"
"Starving Hearts (Triangular Trade Trilogy, #1)","£13.99","catalogue/starving-hearts-triangular-trade-trilogy-1_990/index.html"
"Shakespeare's Sonnets","£20.66","catalogue/shakespeares-sonnets_989/index.html"
"Set Me Free","£17.46","catalogue/set-me-free_988/index.html"
"Scott Pilgrim's Precious Little Life (Scott Pilgrim #1)","£52.29","catalogue/scott-pilgrims-precious-little-life-scott-pilgrim-1_987/index.html"
"Rip it Up and Start Again","£35.02","catalogue/rip-it-up-and-start-again_986/index.html"
"Our Band Could Be Your Life: Scenes from the American Indie Underground, 1981-1991","£57.25","catalogue/our-band-could-be-your-life-scenes-from-the-american-indie-underground-1981-1991_985/index.html"
"Olio","£23.88","catalogue/olio_984/index.html"
"Mesaerion: The Best Science Fiction Stories 1800-1849","£37.59","catalogue/mesaerion-the-best-science-fiction-stories-1800-1849_983/index.html"
"Libertarianism for Beginners","£51.33","catalogue/libertarianism-for-beginners_982/index.html"
"It's Only the Himalayas","£45.17","catalogue/its-only-the-himalayas_981/index.html"
```

### 检查、安装及剩余边界

- 组件验证：Host 相关原 Authority/撤权/停用锁/历史交付共 7 项通过（新增回归先失败再修复）；工具实际 model+adapter 的保存/重开/CAS/压缩及既有 profile 相关组 55 项通过，包含损坏 gzip、解压上限、不可压缩超限拒绝。它们不是模型或网页验收证据。
- 构建/包验证：复用原 Vite watcher（仅触发输入变化，无第二 writer）产生上述 receipt；原打包器候选生成成功，针对确切候选的包/权限/来源/CSP 1 项通过；语法和定向 diff 检查通过。
- **正式包没有晋升：** 实测后按原打包器 `--promote-from` 尝试晋升，被 `candidate is stale or not the same canonical package as current source` 拒绝。只读规范包比较发现并行的本机 runner UI/CSS 已变化；当前 receipt 为 `422ac77a98de5ce30b111341dcde494dbae488a206e8a52e2bd137e427d242b6`。没有绕过同源保护、重建/重装另一个候选或覆盖并行输出。唯一正式 JSON 仍为 **1.9.7 / SHA 7fd4e10f71d82ffaa2619b2ee339f2d2045ff6ece4e032d95db7b94d6c523059**。上方真实闭环只属于已安装且 SHA 明确的 1.9.11，不属于随后变化的源码或正式 1.9.7。后续同步需待相关 owner 冻结当前输入再生成、验证候选。
- CUA 在第二份 JSON 请求后连续两次读取超时并重置。没有改用其他电脑控制技术、启动克隆浏览器、重复点击下载或重试采集；当前没有未退休的本轮采集。文件已完成且可独立核对，最终 UI 交还后的状态未复读。
- 原 dev / Vite / 快照 watcher 保留。00:35 只读进程检查 Host `scripts/dev.mjs` PID19312 RSS 约 8,001,136 KiB，进程仍运行；工具 Vite PID68419 RSS 456448 KiB、快照68906 RSS126544 KiB。未复现本轮 OOM，也不能宣称 watcher 内存问题已解决；已向 Host owner 交接，不擅自重启其服务。
- 00:38 前已通过原 `profiles.py --owner 01a1a1ef-4772-78f0-86f6-2dc3b2e93321 ui-release` 释放桌面租约，回执 `native_ui_owner:null`；已向 Host owner 发回实测结果、CUA 超时和内存观察。没有停止、清理或抢占其他 owner 的资源。
- 本轮未做错误规则/运行中停止的新增真实故障注入、跨网站/多页、长期内存压力、production、完整 CI 或评分，均 NOT_TESTED；相应已有组件保护保留。旧结果自动回显和绝对详情 URL 限制如上，不隐藏。

## 三字段实测与最小 Host 修复（2026-11-03 23:45，北京时间）

本节覆盖下节 23:10 的启动阻塞结论；owner 仍为 `01a1a1ef-4772-78f0-86f6-2dc3b2e93321`。用户指出 ScrapyJS 只是扩展，已撤回历史 Chrome 克隆 App 的命令行启动请求，未执行该启动。改用已存在的 `/Applications/Google Chrome.app`（CFT 149.0.7827.55），没有新建 App/Profile 或安装 Chrome 扩展；个人 `/Users/shopme/Applications/Google Chrome.app` 未操作。

- **身份与资源重新核实：** 原 Chrome 扩展详情读回 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`、加载仓库 `dist/development`，用户脚本允许，原生 AI 设置为本机 Codex、已连接。当前 UI 租约由本轮持有。字段选择器 owner `01a1a1b5-2c6c-78b3-a8c7-9555b76d1ce9` 已 active，使用独立上游项目/测试窗口；Host owner `01a1a1b4-4a34-7960-8466-b1ed2df478be` active，已协调共享输出稳定窗口并确认本轮 Controller 文件无冲突。保留并行改动、原工具 Vite/快照 watcher，不恢复已暂停的旧双站 goal。
- **真实业务基线：** Books 首页实际显示 1–20/1000；无登录或验证码。原工具为 1.9.4，保留旧配置“共享AI验证-20261103”。原“新建配置”后读回 `{"url":"","itemConfig":{}}`、零字段、未保存、无结果。发送完整三字段原话后返回“准备失败，未发送”；未调用模型。原运行 `ddecb2e3-c015-47c3-9ccc-0c02d1c6d1fb` 后经开发历史读回 stopped / E_CANCELLED / Controller fenced / released。
- **同 ID 工具原位更新：** 仅通过原“扩展→筛选和管理扩展→导入扩展”选取既有诊断候选 `/tmp/opendesk-ai-isolated-01a1a139/diagnostic-1.9.10.opendesk-tool.json`，1356055 bytes，SHA-256 `5ee27c06ed7c884ff5b246cefd9aa7c573f9824d118b1d655bac80e4c33d31e1`。可信审阅显示 1.9.4→1.9.10、权限未变化、原数据保留，确认后读回安装成功、工具标题 v1.9.10，旧配置保留。首次文件选择曾被并行 Host 重载打断，读回仍 1.9.4 后才重试；未把中断算更新成功。该不可变候选包含详细观察错误和历史 CSV 顺序修复，但不等于并行变动后的当前工具源码；未重建、晋升正式 JSON 或重装 Chrome 扩展。
- **1.9.10 原话复测失败：** 重新新建并读回同一空白 JSON，粘贴读回完整请求后仅点一次原发送。错误为 `E_OBSERVATION_STAGE read-release`，startMs=1696、firstRunningMs=1696、firstFencedMs=null、readCount=1、maxReadMs=3704，最后状态 running、retirementState=null。原 runId `038701a8-8214-41e6-8758-5dd484ebacff`，resultId `6e6b3101-a63e-4ef1-8d12-e6ccc8d2ccdf`。5500ms 准备预算耗尽，输入/空白配置保留，模型未派发。随后原“开发→运行结果→历史”准确选中此 run，读回 stopped / E_CANCELLED / Controller fenced / released。没有重放未知请求，也没有业务采集。
- **通用缺口与最小范围：** 公开 `controllers.read({clientRequestId})` 应查询原运行；实际进入 `snapshotControllerRun({runId})`，原实现虽只交付目标 results，却串行核验所有历史 runs 的网站/安装权限，`finishControllerSettlement` 同样调用该路径。历史门控诊断在真实 Authority 组件上复现“无关历史 grant 阻塞完成后的交付/释放”；它不能单独证明本次 3704ms 全部来自该点。业务沙箱无法修复 Host 查询范围，跨工具均受影响。已按 runtime Skill 与 Host owner 协调，只修改 `src/platform/host/controller-methods.js`：以目标 run 或全量查询确定 deliveryRuns，权限、持久撤权栅栏和交付锁均沿该范围执行；不改公开 API、不跳过目标权限、不延长业务预算、不加入站点分支。
- **定向验证：** 在 `tests/environment/task-delegation-recovery.test.mjs` 新增“single-run settlement and read do not query unrelated historical grants”，修复前因实际查询无关 origin 失败，修复后通过；同项验证目标站点撤权后结果为空且含 denied。与 App disable 写锁、无关 App 锁、app-service finish/retirement 共 5 项通过；`node --check` 与目标文件 `git diff --check` 通过。均为真实 Authority 加受控浏览器 fixture 的组件测试，不是浏览器网页观察或模型通过证据。
- **安装/加载边界：** 原 dev 33071 已不在，Host owner 恢复为 npm PID19292 / scripts/dev PID19312。调试 UI 读回“开发服务已连接”、指纹 `0c2ac6f5afda51ff85179148f1189d7d7bc83b3b770827298b993e4f6ad89ff6`；但其 sw.js.map 时间 23:41:56、来源尚不含 23:42:10 的 deliveryRuns 修复。已告知 Host owner，未将旧输出当修复后、未另启 writer。修复后真实操作仍待新输出加载复测。

| 三字段用户环节 | 本节真实结果 |
| --- | --- |
| 现有测试 Chrome / Books / 真空白配置 | PASS |
| 自然语言发送及网页观察 | FAIL：上述 read-release；模型未发送 |
| AI 生成三字段及规则核对 | NOT_TESTED：前置失败 |
| 原保存 / 实际采集 / CSV 下载 | NOT_TESTED：前置失败；本轮采集 0 条、无新 CSV，不能引用历史两字段 CSV 代替 |
| 关闭重开三字段规则与数据 | NOT_TESTED：尚无三字段配置或数据 |

本节没有把网站预期 20 条当采集结果，没有 production 构建、提交、推送、发布、分支/worktree/PR。下方历史证据继续只代表各自候选。

## 三字段完整链重查（2026-11-03 23:10，北京时间）

本轮 owner：`01a1a1ef-4772-78f0-86f6-2dc3b2e93321`。最新授权范围是 Books to Scrape 从空白创建书名、价格、详情链接，原界面保存、采集、下载 CSV、关闭重开复用；不恢复下文已暂停的双站 goal，不修改其生命周期。**本轮尚未进入真实操作链，不能宣称完成。**

- 只读核实历史主链 `01a19db8-5d8b-7271-be3a-074fa46cd747`、UI 核对 `01a19db9-0c22-7000-a298-4e94bf03db79` 均为 notLoaded、最新 turn 已完成；后续 `01a1a139-4080-7c61-8539-54c354025ab3` 与实际接续 owner `01a1a182-afd8-7363-9377-4ea52146d971` 为 idle。字段选择器 owner `01a1a1b5-2c6c-78b3-a8c7-9555b76d1ce9` 与添加字段 UI owner 也为 idle。保留所有既有 dirty，未发送跨对话消息或抢占其文件。
- 原生 UI 租约原为空，已由本轮通过 `profiles.py --owner <本轮 ID> ui-acquire` 取得。原专用 Chrome 主进程已不在进程列表；App 和原 Profile 目录仍存在。CUA 按精确 `/tmp/opendesk-ai-isolated-01a1a082/Chrome Scrapy Test.app` 两次取得应用均返回 `timeoutReached`，未取得可操作窗口。当前 CUA 没有可调用的 `computer.launch_app`；未转用日常 Chrome、未改 Profile、未注入页面或修改浏览器存储。已询问用户是否明确允许命令行恢复原 App/原 Profile，尚未获得答复时不执行该启动。
- Browser 处于**开发服务进程运行、浏览器连接未验证**状态：原 `node scripts/dev.mjs` PID 33071 监听 43119/43120；工具 Vite watcher PID 68419、快照 watcher PID 68906 仍运行。未启动第二 writer、未停止服务、未覆盖 `dist/development`。进程与端口不能证明浏览器 serve 已连接，实际扩展 ID、加载路径、Native doctor 与安装版本本轮均未从隔离浏览器重新读回。
- 现行公开调试合同仍只允许隔离 session 存储和 `currentPage.info`；AI、Controller/Task、下载不因本地预览取得安装权限。因此保留“本地连续迭代、安装态集中验证”，不关闭只读或准入保护。
- 只读校验当前 `dist/build-ready.json`：39 项 source、3 项输出、4 项设计输入均无指纹漂移，buildId `6dc4030e3e70d15ec253994f86c8d2cd2188f704d15cea1c1e5e668f6407364b`。这是已有编译回执一致性，非本轮重新构建或浏览器证明。源码版本仍为 1.9.10；唯一正式 JSON 仍为 1.9.7 / SHA `7fd4e10f71d82ffaa2619b2ee339f2d2045ff6ece4e032d95db7b94d6c523059`。历史 1.9.10 候选 SHA 仍为 `5ee27c06ed7c884ff5b246cefd9aa7c573f9824d118b1d655bac80e4c33d31e1`，但其 UI 和 Controller 已不等于当前 dist，不能把相同版本号当同一候选。
  - 历史候选 UI SHA：`265326830fb62459f45d0d22a96167535ed375e14730acdf45acba2e6e886ac2`；当前 UI SHA：`1d4a213c25011a6d165072b1d465965b6acc330e4dc035537ea78a527f8f1614`。
  - 历史候选 Controller SHA：`f8b600cb34335a4b432fa99ee056045b520169706c61b8aee5e79dcd5b57d550`；当前 Controller SHA：`11cd3394809545632e3c378b87e5cb0b51874669dec276bd1dc3a21a0f3cce5d`。

| 本轮用户环节 | 实际状态 |
| --- | --- |
| 专用隔离浏览器恢复及身份核对 | BLOCKED：CUA 启动/绑定超时，未取得窗口 |
| 打开 Books、读取真正空白配置 | NOT_TESTED |
| 真实 AI 观察、生成三字段并检查规则 | NOT_TESTED；本轮未发送模型请求 |
| 原保存入口 | NOT_TESTED |
| 原开始采集、读取实际字段与数量 | NOT_TESTED；本轮没有采集结果，数量未知 |
| CSV 下载、逐行及表头核对 | NOT_TESTED；本轮没有 CSV 文件或实际内容 |
| 关闭重开规则及数据复用 | NOT_TESTED |

未复现当前产品故障前没有改业务源码，未以模拟数据补结果；没有新跑组件测试、全量构建或生产构建。历史 20 条、90 秒超时、watcher OOM 及 `completed/fenced` 均保留各自证据边界，本轮未重新实测，也未宣称解决。证据文档 `git diff --check` 通过；等待启动指示期间已释放原生 UI 租约，返回 `native_ui_owner:null`，原 watcher 均保留。

恢复后的首条操作是核对原 Profile、实际 ID/路径、serve 连接和当前安装摘要，再从配置库新建空白配置，发送：

> 请根据当前网页创建一个采集配置：采集每本书的书名、价格和详情链接，CSV 表头分别为书名、价格、详情链接，只采当前页。

随后使用原保存、开始采集、采集结果中的 CSV 入口，并返回扩展列表后重开。应比较完整配置及同次真实结果，不将历史文件或预计 20 条当成本轮结果。浏览器未恢复前不为此更新正式 JSON；本轮不提交、推送、发布、创建分支/worktree/PR。

## 持续开发入口恢复（2026-11-03）

用户最新要求：“哪种方式合适，就采用它。现在感觉多次扩展安装有点不合适。” 原新站自然语言闭环 goal 实读为 **paused**；本轮仅恢复本地持续开发入口，没有恢复双站 AI/采集，也没有修改目标状态。

- **安装态读回：** 独立诊断窗口的原工具详情已显示 ScrapyJS **1.9.10**、启用，固定包 SHA-256 `5ee27c06ed7c884ff5b246cefd9aa7c573f9824d118b1d655bac80e4c33d31e1`。下文“停在确认更新之前”是上次观察；本轮没有点击安装，也无法据读回确定谁完成更新。该版本仅增加诊断，不证明释放问题已修复。
- **实际配对与目录：** 当前浏览器仍为 `/tmp/opendesk-ai-isolated-01a1a082/Chrome Scrapy Test.app`、原 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`、仓库 `dist/development`。它的 Native 实例为 `scrapy-ai-01a1a082`，官方 doctor 返回 connected/nativeConnected 与启用状态均为 true，ID 一致。起初误用历史 `scrapyjs-react-01a186cc` 导致当前浏览器无法发现来源；已退出本轮误启的该目录 CLI，再按当前真实 Native 子进程配对连接，没有重做注册或改 Native manifest。
- **持续开发链：** 保留原 Browser dev PID 33071，恢复工具自己的 Vite build watcher（子进程 PID 68419）和 `node scripts/watch-sidebar-tool.mjs examples/sidebar-tools/scrapyjs`。当前源码 CLI 为 `OPENDESK_NATIVE_INSTANCE=scrapy-ai-01a1a082 /tmp/opendesk-ai-isolated-01a1a082/OpenDesk.app/Contents/MacOS/opendesk browser dev /Users/shopme/Documents/workspace/opendesk-browser/examples/sidebar-tools/scrapyjs`；文件工作区 `workspace-49a5b778-1f0f-7df0-bea6-39d4414f0914`、source `source-bf12d820c6f9ef9e7fce6ca3`。这只授予当前会话的原目录访问；可运行项目 `E_PROJECT_SCHEMA`、自定义 Profile 自动打开 `E_PROFILE_TARGET` 均未通过旁路修复，手动打开 CLI 给出的当前 source 工作区后，目录与侧栏调试可用。上述 PID/身份是本轮观察，下次先重查，不重复启动 writer。
- **已复现并修复的入口缺陷：** stage 在编译完成后以 `E_TOOL_STAGE` 拒绝合法 `files.controller`，而原 packer 已支持该字段。仅修改 `scripts/stage-sidebar-tool.mjs` 的字段识别，并将 Controller 文件纳入同一来源指纹与路径保护。原 packer 仍验证固定 Controller 元数据、运行时身份和权限；stage 不执行 Controller、不安装或授予权限，没有修改 Browser Host。
- **最小验证：** 新回归先得到上述失败，随后 `node --test tests/environment/tool-stage.test.mjs tests/environment/tool-watch.test.mjs tests/environment/app-controller-package.test.mjs` **18/18 PASS**。覆盖 UI 快照可包含固定 Controller、源码变更影响指纹、越界路径拒绝且不替换旧快照，以及既有 watcher 与包约束。编译成功，只有既有 PURE 注释警告。另一次并行 `src/RuleEditor.jsx` 变更时，watcher 先保留旧预览，待有效编译回执后发布新快照；没有覆盖该并行业务文件。
- **实际打开结果：** 通过当前浏览器「开发 → 本地项目 scrapyjs → 在侧栏调试」，应用调试页显示“scrapyjs 采集 · 只读预览 · v1.9.10”、原配置/目标/结果界面，展开开发信息显示“实时开发预览 · `08d20d72259d` · 未安装；隔离测试数据”。与发布指针 SHA-256 `08d20d72259db7e2e5286985ab55f4ce8129fd35f4b406d6f2e42d5135b0fdfc`、buildId `158c7a1dc5a9d6c04c2f83168a2fe09e8648532d384474ca0903930100a66973` 对应。此预览已包含并行源码，不能当作安装态上述固定 SHA 的同一产物；本轮没有额外改 JSX/CSS 标记来重新测试历史已证实的自动更新。

采用“本地连续迭代，安装态集中验证”：预览仍只提供隔离 session 存储与 `currentPage.info`，不发送真实 AI、不运行 Controller/Task、不下载。实际推理、观察、采集与下载需在相关修复集中完成后，通过原安装身份和权限链验证；本轮未进行这些操作。正式 JSON 仍为 1.9.7，未晋升、提交或推送。`completed/fenced` 根因、双站闭环、production 与评分均未完成。

## 续接实测增量（2026-11-03，专用隔离 Chrome）

下方原 1.9.0 的 NOT_TESTED 是历史记录。本次仅使用 `/tmp/opendesk-ai-isolated-01a1a082/Chrome Scrapy Test.app`，原 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`、`dist/development`，dev PID 33071 / 43119；产品调试页读回“开发服务已连接”，指纹 `2c77ce889e82`。扩展详情的“允许运行用户脚本”读回 on，开发页重读显示当前网页可运行。没有修改浏览器设置或重启服务。

- **真实安装 1.9.5：创建、应用、保存通过。** 从空白规则在 Books to Scrape 发送“帮我创建当前页的图书采集配置，采集书名和价格，CSV 表头为书名、价格，只采当前页。”，经原 prepareAI / 只读 Controller 观察和本机 Codex 返回“已更新配置草稿”。原 JSON 显示当前 URL、`_listItem: article.product_pod`、`title: h3 a::title`、`price: .price_color::text`、`maxPages: 1`，表头书名/价格、顺序 title/price。用户无需提供选择器。原保存按钮命名“当前页图书-AI-1103”，读回“配置已保存”。
- **真实自然修改失败已定位。** 原话“价格这一列叫售价，书名那列叫图书名称，其它保持原样。”被本地固定整句范围校验拒绝，原 JSON 不变、输入保留。修复在 `src/ai-actions.js`：以现有字段名/显示名定位唯一字段，组合列名/表头动作与显式新值，仍比较完整最终配置。歧义、矛盾、额外动作和附带配置变化整批拒绝；澄清不再要求用户写选择器。
- **1.9.6 真实更新、自然修改、保存重开通过。** 用户确认后经原导入 UI 更新成功，权限不变、数据保留。再次发送上述原话，返回“已更新配置草稿”；只将 price 改为“售价”、title 改为“图书名称”，选择器、URL、maxPages=1、fieldOrder=[title,price] 保持原样。原 Save 保存成功，回到扩展列表再打开，配置“当前页图书-AI-1103”及完整 JSON 均保留。
- **1.9.6 真实当前页采集、下载通过，发现顺序缺陷。** 原 Start 仅执行一次，clientRequestId `6e8ecbe2-ed31-43e2-8de0-f78152e791eb`，runId `463506be-4194-4d69-a365-51a8216a5bce`，resultId `d21200b4-79ee-4c4b-867b-eb16fd36edee`；刷新原请求得到 completed / FOUND_RESULT / released，20 条数据，audit.listUrls 仅当前首页、detailUrls=[]、duplicates=0。Chrome 下载列表明确完成 `scrapyjs-result (15).csv`（1010 bytes）和 `scrapyjs-result (17).json`。文件逐行比较全部 20 条 price/title 与原始 JSON 一致，长书名完整、价格正确，未重放未知请求。
- **导出顺序缺陷的最小修复。** 自定义面板错误使用结果对象键顺序 price/title，忽略保存的 title/price。`src/Results.jsx` 仅将面板初始化改为沿用保存 fieldOrder，仍过滤不在结果中的字段、补全新字段，不修改原始下载或采集规则。真实 React 组件新增回归先失败后通过；组件、CSV 完整性、重复名、公式注入及 UTF-8 上限定向检查共 13/13 PASS。
- **1.9.7 已原位安装，保存配置与真实导出顺序通过。** 用户明确确认后点击原可信安装器“确认更新”，读回安装成功；工具标题 v1.9.7。原配置“当前页图书-AI-1103”及完整 JSON（title/price 顺序、图书名称/售价、原选择器、maxPages=1、URL）均保留。原 Start 仅执行一次，clientRequestId `ecef6cf1-b0d3-48ab-b225-f73664907f8d`，runId `a460f6f5-f313-4dda-91a5-54fbb0eb02f1`，resultId `c4d4dbb9-1cbb-43c1-9180-b2711792c17e`，completed / FOUND_RESULT / released，20 条，listUrls 仅首页、detailUrls=[]、duplicates=0。自定义面板预览正确为图书名称/售价。Chrome 两个下载均显示完成，文件逐行核对 20 条 title/price 与同次 JSON 完全一致，未修改或重排下载文件：
  - `/Users/shopme/Downloads/scrapyjs-result (16).csv`，1010 bytes，SHA-256 `63db2d6a82215f19e2791eba27527c28be90da21fb761e96153146bdaf97c11e`。
  - `/Users/shopme/Downloads/scrapyjs-result (18).json`，35385 bytes，SHA-256 `501335b0373d4151c4bb68054f49fd04c986abd0019970f3dbab4eda6e926b6e`。
- **1.9.7 同源正式安装文件已晋升。** 工具构建成功，候选与唯一正式 `scrapyjs.opendesk-tool.json` 均为 1355729 bytes，SHA-256 `7fd4e10f71d82ffaa2619b2ee339f2d2045ff6ece4e032d95db7b94d6c523059`。组件/CSV 13/13、包身份/固定源码/权限/CSP 1/1 PASS；原打包器 `--promote-from` → `--check-project` 返回 PROJECT_PACKAGE_MATCH。打包器 installed:false 仅表示该命令不安装，不覆盖上方原生安装回执。保留并行工作，未提交或推送。
- **前一候选测试复用：** 1.9.6 AI actions/panel/page/request 100/100 PASS、包 1/1 PASS；1.9.7 只增加 CSV 面板保存顺序修复及版本升级，未重复无变化的 AI 测试。构建只有既有 engine PURE 注释警告。

- **证据边界：** 创建/观察/推理/应用来自 1.9.5，自然修改及保存重开来自 1.9.6，升级保留、当前页采集和正确顺序下载来自 1.9.7；未重复在 1.9.7 执行 AI 创建/修改。自然语言范围仍对无法可靠消歧的请求澄清，不声称支持任意表达或自动采集。

所有产品操作通过 cua_repl 原 UI，未用脚本注入/CDP 伪造交互。早先一次 native typeText 丢失中文只输入 CSV，界面显示两条正常解释；随后改用 paste 并先读回完整原文再发送。没有把这些解释算作创建成功。正式 production、完整 CI/矩阵、评分及发布继续延期。

## 历史记录（原 1.9.0；以下状态不代表当前状态）

日期：2026-11-03，北京时间。工作目录 `/Users/shopme/Documents/workspace/opendesk-browser`，现有 `main`，基线 HEAD `24fa6344cea4cc21425967995f50f30cbc453d73`。保留并行 dirty，未提交/推送。

## 范围与当前状态

当前目标为 `https://books.toscrape.com/` 当前页书名、价格、详情链接，不翻页、不访问详情批量采集、不下载电子书文件。真实安装/AI 创建/采集/CSV/关闭重开复用：**待桌面租约释放后验证，NOT_TESTED**，不以 Node 或安装包通过替代。

完整提示词：

> 请根据当前网页创建一个采集配置：采集当前页每本书的书名、价格和详情链接，CSV 表头分别为书名、价格、详情链接，只采当前页。

必须新建独立配置并记录空白基线，不从旧配置复制规则。预计空白模型 `{ "url": "", "itemConfig": {} }`，真实基线尚未读取。生成的最终配置、记录/CSV逐行核对和重开复用结果在完成真实操作后补录。

## 已定位与修复的阻塞

- 原真实消费者为 `src/AiPanel.jsx` → 公共 Dock/Frame/session → prepareAI → 受控 AI bridge → 原 business.config.propose/apply。先前只发 title/URL，sample 为空，且窄意图语法将原话判为 needs-input。单项诊断已复现；没有手填最终配置冒充 AI。
- 固定 Controller 新增只读 context 样本，最多 12000 字符、过滤表单/编辑区/脚本等；`ai-page.js` 复用原 controllers.start/read/stop，5500ms 有界准备，原请求不重放。应用前重读原观察身份；同 URL 的不同文档不作为同一文档。
- 从空规则明确创建单页列表时才启用此链；精确表头编辑继续原差异校验。提案仍是数据，不授予权限，不自动保存/采集/导出。
- 仅为本轮真实操作在固定 Controller 审阅范围增加 Books to Scrape 的精确 origin；没有域名业务分支或专用选择器。独立旧 HTTP Task 包及 pin 保留。

## 当前验证与产物

- 创建范围测试先失败（needs-input 代替 create），修复后通过；真实 React 夹具先失败（sample 为空），修复后通过正常应用及同 URL 换文档拒绝。
- AI actions/panel/request/pending：90/90 PASS；AI App/page/inspection/session：63/63 PASS；包、原页面适配、CSV：13 项通过（包测试独立复跑通过，修正了 origin 数组顺序断言，不改权限语义）。仅表示各自组件控制逻辑。
- `npm run build --prefix examples/sidebar-tools/scrapyjs` 编译成功；原 `build-sidebar-tool.mjs --out` → 定向门禁 → `--promote-from` → `--check-project` 成功。
- 唯一正式包 1.9.0，SHA-256 `62f51de1819af73d0a8834810e83c0a8168a7662c21d648d21cbcbc9d4623ff2`，1352966 bytes。这是包检查结果，尚不证明本轮已安装或运行。
- Browser 仍使用原 `dist/development`。原开发服务由 Toast 测试 owner 恢复，实读 PID 10656 监听 43119/43120；尚未由本对话核对运行指纹/连接。未停止或复制其服务。
- 原生桌面租约仍属 `01a1a001-0b30-7562-b5a5-34d2a1b6c71f`，本对话未抢占、清锁或另开副本。

豆瓣已有配置的表头、原保存及回读证据复用 [1.8.20 直接发送记录](csv-title-direct-send-20261103.md)，它不证明本轮空白创建。production、评分、完整矩阵、复杂网站及长期服务稳定性均 NOT_TESTED。
# 新站纠偏后的 1.9.8 原生增量

用户确认此次安装后，原隔离 Chrome 中的 ScrapyJS 页头实读为 v1.9.8；原已保存配置“当前页图书-AI-1103”保留。候选 SHA-256 为 `c587231c6995ecbeca2b2ea51177febe80161f3803682b7ff968eb115d3a3a60`，不继承此前候选的原生结论。

在豆瓣新建空白配置，发送前核对原话“把这一页的书名、评分和书籍链接整理成一个采集配置，先只要这一页。”。此次确实进入观察（区别于 1.9.7 的空样本），但准备阶段返回 `E_OBSERVATION_STAGE read-release`：原运行 `19537ddb-ff5d-407f-b99f-2915e108bcfb`，结果 `46888098-9d43-4080-943d-97e8801771de`，最后观察为 `state:completed, retirementState:fenced`，5.5 秒预算内未证明 released，AI 未发送。原输入和空配置保留。源码显示请求清理仍须 retire 后 CAS 清 preparing，界面恢复 Send；没有取得独立原 clientRequestId 和最终 released 回执，不将恢复按钮当作该回执。

未自动重发该请求。随后在既有 Quotes 标签页发起新的不同站点操作，原空配置仍无规则，未给模型选择器/内部键：发送“我想把这一页每条名言的内容和作者整理出来，先只要这一页。”。同样准备失败且 AI 未发送：`E_OBSERVATION_STAGE read-release`，运行 `bf181ee6-bf6d-45d3-96fe-621faa009faf`，结果 `44f6ce2e-f9eb-48a0-b838-154df38593c5`，最后 `completed/fenced`。续接时隔离浏览器实际仍显示该错误、原输入和空配置；未重发或重载。两站尚无真实模型生成或采集结果。

**后续只读核对：** 在同一隔离浏览器中新开独立窗口，通过「开发 → 运行结果 → 运行记录与技术信息」分别选中上述原 runId，完整历史均读回 `state: completed, retirementState: released`；豆瓣同时显示 `workerRetired: true` 和原 resultId。调试页显示执行槽空闲、开发服务已连接，构建指纹 `2c77ce889e826baa8e32865bbcd2425e99cc2c0eaf4b2f546a5ab637018d4abf`。该回执只证明后来释放，不能证明首次 5.5 秒内已释放、精确释放时间或延迟根因，也不证明原窗口加载字节；没有重复发送原请求。原窗口切换开发页触发未保存内容警告，已取消以保留草稿。

**诊断候选 1.9.9：** 工具内仅在原观察未知错误增加准备启动完成和首次看到 `fenced` 的相对毫秒数，保留原期限、结果身份和停止/不重放栅栏。新增定向测试先按预期失败再通过，页面观察及 AI 请求相关测试 40/40 通过。React 构建与临时包校验通过：`/tmp/opendesk-ai-isolated-01a1a139/diagnostic-1.9.9.opendesk-tool.json`，1355859 字节，SHA-256 `d83f91ba8169803510aea0e36ef7c1f2471912b41f2ec31d5c37b65075a8a0f8`；候选包专用身份/来源测试通过。默认包测试因正式 JSON 仍为旧版而报同源不匹配，改用既有候选环境变量后通过；正式包未晋升。对比 1.9.8 候选，只有版本与 UI JS 不同，权限、Controller 和固定 Task 相同。

隔离浏览器独立窗口的原安装审阅曾读回“当前 v1.9.8 → 新 v1.9.9”“权限未变化”“原有应用数据保留”，当时停在确认更新之前，未由本次自动操作点击确认。随后重新查看时该窗口已显示 v1.9.9 和保存的 Books 配置；无法从此观察确定是谁完成更新，也不据此声称旧实例未保存草稿仍在。该候选仅用于收集后续诊断，不是释放问题的修复。

**1.9.9 原生诊断：** 在 Quotes 新建空白配置，发送“请把当前页面每条名言的正文和作者整理成采集配置，只采集这一页。”。准备阶段仍返回 `E_OBSERVATION_STAGE read-release`，`startMs:838`、`firstFencedMs:5134`、`state:completed`、`retirementState:fenced`；runId `94999b7a-a50c-46eb-b4d9-aef1dbfd1e51`、resultId `2b10367f-c8e9-440d-9fca-d114f1637c4e`。模型未收到请求，输入与空配置保留。之后在另一个独立窗口的原运行历史中按同一 runId 读回 `completed/released`。首次看到 fenced 的时间不等于实际进入该状态的时间；当前计时无法区分观察执行耗时和轮询读取耗时，也无法推算释放时刻。

**诊断候选 1.9.10：** 增加首次看到 running 的时间、观察读取次数和最长单次读取耗时，包含超时的未返回读取；不改变运行、观察期限、权限或释放条件。新断言先失败后通过，观察和请求定向测试 40/40 及候选包测试通过。构建候选 `/tmp/opendesk-ai-isolated-01a1a139/diagnostic-1.9.10.opendesk-tool.json`，1356055 字节，SHA-256 `5ee27c06ed7c884ff5b246cefd9aa7c573f9824d118b1d655bac80e4c33d31e1`；与 1.9.9 包相比只有版本和 UI JS 改变。独立窗口安装审阅显示“当前 v1.9.9 → 新 v1.9.10”“权限未变化”“原有应用数据保留”，停在确认更新之前。更新可能使另一窗口的未保存输入失效，原话和回执已记上方；尚未安装或原生测试，不是问题修复。

**离线故障路径取证：** 使用仓库现有真实 Authority 测试夹具的临时副本 `/tmp/opendesk-ai-isolated-01a1a139/history-permission-diagnostic.test.mjs`，对一条无关历史运行的来源授权查询人为设置等待。当前委托运行持久化为 `completed/fenced` 且 `workerRetired:true`，但 `finishControllerRun` 尚未返回；放开该查询后完成返回，再执行原退休流程得到 `released`。单项测试 PASS。源码原因是单条运行快照在交付前仍逐条检查全部历史运行的授权；这证明一个可复现的潜在阻塞路径，**不证明真实 Chrome 的两次失败由该路径造成**，测试使用模拟浏览器和存储，并无真实权限查询耗时。尚未修改 Browser Framework，也未放宽授权或释放规则。

**原始时间证据可见性核对：** Authority 的持久结果记录有 `committedAt`，但现有开发页的完整历史投影丢弃该字段；原按钮的 typed-json 下载也仅输出运行/结果身份及值，不包含提交时间。故当前可见的 `deadlineAt` 和后来 released 回执不能还原首次运行的完成或释放耗时；没有为了取时间直接访问浏览器 Profile、注入脚本或改动可信 Host。
