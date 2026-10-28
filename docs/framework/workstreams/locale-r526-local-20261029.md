# 扩展语言 R5.26-LOCAL 增量验收

核心功能可正常使用；本轮真实 Mac Chrome 开发环境核心验收 PASS。已修复异步入口阻断，没有已知剩余核心业务阻断。

## 范围与版本

- Owner：`01a183da-5087-7a82-9f64-3423922b7da3`；2026-10-29（Asia/Shanghai）。
- 起始 main：`6c28425c41362d6334accf376beba25ab70d3b79`；已 fetch，无远端缺失。收尾时并行 main 为 `2123a0b2ab581885821821f743df551fb178330b`，相关语言源码无并行提交变化。保留其他 owner 的 Cookie Editor、scrapyJs、Git 索引及服务。
- 持续开发：原 owner 的 `npm run dev` PID 23597；实际加载 `dist/development`，ID `ccfcjegpkdlgbclopjmadlcjedelidmf`。复用现有安装和 writer，没有全量构建/重装。
- 修复后真实 Side Panel 显示：`开发服务已连接 · 构建指纹 657ff15619df；保存源码后自动安全更新。`；实测候选 `657ff15619dffbf63e068a1490bf4ef209fb49915657b38bd26cb6d53adf89d1`。
- 随后并行 writer marker 变为 `defe0eb72f09744aa2d8d78eb1f5e86c35cea4c4e817c3b7beae96722c8eefa5`；语言 UI bundle 仍逐字节同一 SHA `da6f4733d7cc09dc30f890e0fd2e4a82d11607fcc94181c1bcf68a7db32208ce`。不宣称后续 marker 全部输入通过原生验收，不因无关变化重复测试。
- 当前 React、语言服务、应用语言和管理文案的 source map 均与源码逐字节相同，见本机 `artifacts/locale-r526-local-20261029/development-binding-final.json`。
- 唯一设计原型未改；未生成预览 HTML，未创建第二 React 根、Controller、存储层或产品 Mock。

## 复用的可靠 PASS

原始机器记录 `artifacts/locale-r524-local-20261028-01a182d8/regression-final.tap`，实际 72 PASS / 0 FAIL；这里只复用以下 12 项，不将整套 72 项算作本轮执行。对应 commit `e22fa0eb2aa6645d9d63625886d2fe81c9b621f3`；TAP SHA256 `6780d0a0ddc9c8c1bcce530cc8b26b6905167ed7f4ccaa4eb69580e2ef5ad066`。七个源/测试输入仍同 SHA，详见本机 `reuse-evidence.json`。

| 原序号 | 原测试名称 | 原结果 / 本轮决定 |
| --- | --- | --- |
| 55 | pure data contract accepts canonical BCP47 and rejects executable/prototype/accessor fields | PASS / REUSE |
| 56 | blank or invisible translations cannot replace a valid saved label | PASS / REUSE |
| 57 | old source hash reuses exact original rows only, reports stale and missing keys | PASS / REUSE |
| 59 | parallel contexts merge writes under existing tool then catalog locks | PASS / REUSE |
| 60 | quota failure preserves prior data, lost acknowledgement uses durable readback, unknown requires read-only recovery | PASS / REUSE |
| 61 | uninstall/registry races cannot write a removed tool; corrupt storage is not overwritten | PASS / REUSE |
| 64 | real confirmed uninstall cleans locale namespace, retains journal on failure and preserves installed records | PASS / REUSE |
| 65 | unknown write fences a mutation already queued on the same service | PASS / REUSE |
| 68 | write notification refresh cannot clear unknown or dispatch the queued second write | PASS / REUSE |
| 70 | explicit recovery permits fresh requests but never revives the old mutation queue | PASS / REUSE |
| 71 | delete confirmation cannot remove a replaced pack or a reinstalled tool generation | PASS / REUSE |
| 72 | delete accepts the same reviewed resource after storage reorders object keys | PASS / REUSE |

原生旧候选 31a… 的 13 项历史 PASS 仅保留历史，不替代 R5.26 当前 UI。`package.js` 的 12→13 容量变化另做一项定向检查；新增 delegated v2 任务不属于语言代表路径。

## 本轮最小增量清单

| 用户行为 / 保护 | 执行证据 | 结果 |
| --- | --- | --- |
| 全局语言、独立语言、恢复跟随 | `delta-ui.tap`；真实 `native-global-settled`、`native-japanese-settled`、`native-follow-restored` | PASS；顶部可信 React 与页面 TOC 文案实际变化，独立设置不改全局 |
| 正常 JSON 识别、预览、确认、保存读回 | `delta-ui.tap`；真实 `native-valid-preview`、`native-import-saved` | PASS；reading-toc / fr / 55 条，哈希、占位符匹配 |
| 损坏 JSON 不写入 | 新增用例 `malformed JSON from the file picker reports validation failure without a storage write`，`coverage-gaps.tap`；真实 `native-invalid-rejected-final` | PASS；自动断言零写入、全存储不变；原生日语包保留 |
| 超限文件、拖入自动识别、UNKNOWN 禁重放 | `delta-ui.tap` 相关现有用例；复用原服务 PASS | PASS；模拟 DOM drop 与服务保护，未冒称原生拖放 |
| 默认语言仅五选项、整块导入入口 | 增强现有 `R5.26 renders R5.23 full-click JSON drop target without duplicate controls`，`coverage-gaps.tap` | PASS；auto/en/zh-CN/zh-TW/ja |
| 关闭并重开 Side Panel 后语言包与偏好 | `native-panel-closed-stable`、`native-prefs-after-reopen`、`native-packs-persisted` | PASS；ja+fr 均在，English 与 follow 未被导入改变 |
| 备份单击下载 | `backup-verification.json`、`native-backup-download` | PASS；实际 Downloads JSON 深比较等于导入的 55 条 |
| 删除一次确认、列表与持久结果 | `native-delete-confirmation`、`native-delete-complete`、修复后 `native-fixed-packs-persisted` | PASS；只删测试 fr，原 ja 55/55 保留，重开后 fr 不再出现 |
| 模板下载 | `template-verification.json`、`native-template-downloaded` | PASS；55 个 source 与当前资源一致，55 个待译文本为空，不执行 AI |
| 13 上限与 14 拒绝 | `registry-delta.tap` | PASS；只处理已变依赖输入 |
| 异步扩展列表到达后入口恢复 | 新增 `language settings select the first localized tool when installed tools arrive after opening`；`late-tools-before/after.tap` | 修复前 FAIL，修复后 PASS |
| 修复直接回归 | 原 `daily tool choices save their scope, follow the default only when requested, and retain focus`；`late-tools-regression.tap` | PASS |
| 甲改语言/删除不改乙命名空间 | 新增 `changing and deleting one extension locale preserves another extension namespace`；`cross-extension-isolation.tap` | PASS；乙 fr 完整存储行与偏好 deepEqual 不变 |

本轮最终定向执行 14 次 PASS（12 个不同用例；包含增强断言后的复验及修复直接回归），另保留修复前 1 次真实 FAIL。未重跑整组 72 项、全量 build/check/test、其他 Tab 或尺寸/主题矩阵。所有自动用例沿用原生产 React/Controller/服务测试夹具，和真实 Chrome 证据分开记录。

## 真实故障与最小修复

关闭并重新打开 Side Panel 后，在扩展列表仍加载时立即进入“语言与翻译”。预期：列表到达后选中首个可翻译扩展，语言选择和导入可用。实际：下拉看似已显示阅读目录，但 React `toolId` 一直为空；永久显示“正在读取工具语言”，列表假空、导入禁用。AX 记录 `native-language-read-later.json`，并由新增测试复现 0 PASS / 1 FAIL。没有产品错误堆栈；故障属于 React 选择状态，不是数据丢失或 Controller/存储故障。

仅在 `src/ui/react/tabs/locale-manager.tsx` 加四行 effect：toolId 为空且 tools 后到达时补选首项；已有明确选择保持原状。没有修改服务或 Controller。失败用例先转绿，再跑一条直接语言设置回归。

真实复验 `native-fixed-early-settings.json` 证明在扩展尚未到达时入页，`native-fixed-late-tools-settled.json` 证明到达后自动出现可用“显示语言 / 跟随 OpenDesk（简体中文）”。`native-fixed-packs-persisted.json/png` 证明原 ja 55/55 存在、fr 已删除、导入入口启用。

## 证据边界与收尾

- 本轮完整原生链在原 UI 字节执行；最终候选只增加上述初始化 effect，受影响入口已在同源码候选复验，其余未变 CRUD/校验/偏好路径复用本轮前述真实结果。不是声称最终候选重新执行全部动作。
- CUA 读取当前原生 Chrome 超时后，用户明确授权 AppleScript/原生 AX；所有产品操作通过真实 Mac Chrome 正式 Side Panel 与系统文件选择器完成，未用脚本模拟 UI 产品行为。
- 备份文件 `/Users/shopme/Downloads/reading-toc.fr.locale-pack.json`，JSON 等于导入内容；模板 `/Users/shopme/Downloads/reading-toc.fr.locale-template (1).json`。原始 AX、截图、TAP、下载副本与 SHA 在本机 `artifacts/locale-r526-local-20261029/`；索引 `core-evidence-index.json`。
- 已恢复原显式简体中文与阅读目录 follow；原日语包保留，只删除本任务新增法语包。只关闭自建窗口 560068871，UI 租约已释放并通知原 owner；保留其他窗口、数据和服务。
- 本轮核心 A–E 没有整体 NOT_TESTED 维度。未执行：整个 Chrome 进程重启、production 静态包、全部语言/其他工具逐一原生验证、原生拖放（DOM drop 已过）。这些不能宣称 PASS，也不是本轮最小链的额外前置条件。
- 宽度/缩放/主题矩阵、全量视觉/无障碍和其他 Tab、自动 AI 翻译属于 OUT_OF_SCOPE。

## 独立评价与提交

独立 verifier Hooke 只读核对原始证据和源码 diff，没有重跑测试或操作浏览器。本轮限定范围评分如下；未执行项未冒称 PASS。

| 维度 | 分数 / 100 |
| --- | ---: |
| 语言管理入口可用性 | 100 |
| 全局语言切换正确性 | 97 |
| 单扩展语言隔离正确性 | 96 |
| JSON 导入与校验正确性 | 95 |
| 数据持久化和读回可靠性 | 95 |
| 备份、删除与模板功能完整性 | 100 |
| 错误处理与数据安全 | 96 |
| 增量测试证据与真实运行可靠性 | 97 |

综合算术平均：`(100+97+96+95+95+100+96+97) / 8 = 97/100`。八维均有有效证据，全部达到本轮 ≥95 门槛；不是 production 全面验收评分。

评分口径留痕：初评 94.5 将键盘/焦点专项与备份再导入作为入口、下载维度的缺口；这两项不在用户本轮最小要求内。保留初评记录，verifier 按 A–E 明确范围仅纠正这两项，未新增测试，其余六项不变。两项 100 只表示限定行为无已识别扣分，不表示所有未来情况完美。完整记录在 `independent-review-initial.json` 与 `independent-review-final.json`。

实际修改仅三文件，同一次 main 提交：

- `src/ui/react/tabs/locale-manager.tsx`：四行异步首项选择修复。
- `tests/environment/extension-center-locale-manager-r21.test.mjs`：三条必要增量测试，增强五语言选项断言。
- `docs/framework/workstreams/locale-r526-local-20261029.md`：本验收与证据复用记录。

本地原始 artifacts 不批量提交；已记录路径、源版本与关键 SHA。最终提交号随最终答复交付，Git 历史可由本记录路径直接查询。
