# Browser Fingerprint R1.9 · 核心开发结果

2026-10-29，当前阶段 **CORE_DEVELOPMENT / CORE_PASS**。下一条用户操作「打开工具 → 检测当前网页 → 查看六项值及来源」已在真实 Mac Chrome for Testing 的 Side Panel 中跑通。用户已将保存、历史、对比、导出及完整正式验收延期，本记录只证明当前核心范围。

## 目标、复用与实现

最终产品仍为独立可安装的 A 只读环境检测扩展；不实现修改或伪装、代理、IP、Profile、多账号。保留 R1.8 单一 React 根、页面样式、既有模型/历史/比较/报告源码和全部旧用例。未新建工具目录或模拟产品 UI。

初次审计发现正式 SDK 缺口后，用户授权「你拥有权限，直接完成」，并明确先做核心。平台按已提出的最小方案增加 `browser.page.readEnvironment({tabRef,documentRef})`，能力为 `browser.page.environment.read`。只复用已有 Chrome `scripting`、`webNavigation` 和当前页 Authority，不改变 Manifest 或增加权限；不公开通用 evaluate。

固定 collector 在目标顶层文档 MAIN 世界只读六字段；Host 校验安装版本/hash/epoch、可信 sender、工具/Host 实例、精确网站授权和真实 documentId。采集前后与交付前再次检查身份及权限。单项异常返回不可用/未知；错误身份、撤权和超时整次拒绝。网页 JS 可自行覆盖其环境值，结果不表示不可伪造的硬件身份。

工具沿用原「检测」UI，经 adapter 获取 SDK 数据，由 model 严格校验为实时 v2 读数；字段显示真实来源。默认核心模式不访问旧历史存储，也没有保存、历史、比较、导出入口。旧 v1 历史保持不变，新的实时读数不能进入旧快照 schema。导航、切换 Tab 或授权失效后，约 1 秒的身份检查清除已显示结果。

真实测试发现首次可信网站授权可等待 90 秒，但沙箱旧预算仅 8 秒；已为此读取单独设置 100 秒请求预算，实际原生采集仍限 3 秒和 8 KiB。既有其他读取仍为 8 秒。实测等待 8.5 秒再批准后成功，拒绝授权无采集值。

## 关键测试条件与结果

| 条件 | 结果 | 证据边界 |
| --- | --- | --- |
| 固定 collector、六字段状态/来源/类型、绑定文档、导航/迟到/超时拒绝 | PASS，Node 51/51 | 实际 collector + Chrome primitives 测试替身 |
| 真实 Registry/Facade/Host 授权、跨站/跨工具/安装身份、撤权/停用/卸载/重启、bridge 等待预算 | PASS，Node 54/54 | Host 集成测试；不充当原生撤权验收 |
| 实时模型与 adapter、旧 v1 禁止接收新读数、PREVIEW 明示 | PASS，Node 4/4 | 当前实时数据保护 |
| 既有 current-page refs 与受影响调用保护 | PASS，Node 11/11 | 当前 refs 增加 resolve 后的定向回归 |
| 正式 React 构建 | PASS | 本工具 Vite IIFE/CSS；不是 production Browser 构建 |
| 同源 HTML 预览及源码/产物哈希核对 | PASS | 预览字段为明示替身；真实字段证据另见下行 |
| 真实 Mac headless CFT 安装、拒绝/批准、六值匹配、重复检测、导航与 Tab 切换 | PASS，8 项 | 实际 SIDE_PANEL + 真实页面 JS，标准本地 HTTP 演示页 |
| 候选晋升与 `--check-project` 同源检查 | PASS | 同一个原打包器；晋升没有安装进个人 Chrome |
| SDK 矩阵本次新增项及已批准集合文档投影 | PASS（限定范围） | 全量生成见下行，未放宽检查 |
| 全量 SDK 生成 | BLOCKED（既有缺口） | Registry 的 Site Budget 两项尚无批准矩阵记录；本轮不补批或修改生成器 |
| 日常有界面 Mac Chrome、外部公开站点、production 完整正式验收 | NOT_TESTED | 不由 headless 开发证据替代 |
| 保存、历史、对比、导出业务闭环 | DEFERRED | 用户最新明确延期；旧用例保留，本轮不扩测 |

定向 Node 合计 120/120。未因文档、包晋升或无关 main 更新重复执行已通过且输入未变的测试。源码只读复核未发现阻断核心交付的问题。完整旧 R1.8 矩阵与 95 分评价不属于本轮收缩后的完成条件，当前未重新评分。

## 原生环境与结果

- 模式：持续开发，`npm run dev`，`http://localhost:43119`，输出固定 `dist/development`。独立临时 CFT Profile 由仓库已有 launcher 管理并在脚本结束后清理，未读取个人 Chrome 数据。
- 平台：macOS，Chrome for Testing `154.0.8037.92`，`--headless=new`；真实扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`，`chrome.runtime.getContexts` 确认实际 `SIDE_PANEL`。
- 页面：`http://127.0.0.1:43111/demo-form.html`。安装、能力审阅、站点批准均经现有产品 UI；没有直接写入安装或授权存储。
- 工具：`browser-fingerprint` / `0.2.0`，42019 字节，SHA-256 `e28806bba3fccfc68c4701bb8716fa921535673d467898621586f5b57ec45ab0`。实际安装的候选与晋升后的唯一正式 JSON 完全相同。
- 六项实际值：UA 为该 CFT 的 `HeadlessChrome/154.0.0.0`；语言 `["zh-CN"]`；时区 `Asia/Shanghai`；视口 `370×405`；屏幕 `800×600`；DPR `1`。逐项与目标页独立只读表达式深比较一致。
- 原始运行目录（本机临时证据）：`artifacts/sidebar-tools/browser-fingerprint/native-core/1793258293241/`，含 `result.json`、`core-ui.txt`、`core-detection.png`、launcher 身份及清理回执。
- [结构化核心结果及源码指纹](r19-core-development.json) 保留可提交摘要；[原生脚本](../tests/native-core.mjs) 可复现本轮八项核心条件。截图只覆盖当前可见区域，六字段全文和比较断言来自同次运行的 DOM 与结果 JSON。

## SDK 元数据与未完成边界

本轮新增项已同步原 Registry、Schema、唯一批准矩阵及 reciprocal native mappings，并更新相关计数、当前源 blob 和开发声明。原全量生成命令仍会报 `Public SDK binding count drift`：它在本轮之前即存在的 `browser.siteBudget.getStatus` / `browser.siteBudget.setPolicy` 没有批准矩阵记录。

开发文档使用现有 `deriveBrowserBindingCatalog` / `renderBrowserDeveloperArtifacts` 对矩阵已批准的 76 个公开接口投影，并明确断言未纳入项只能是上述两项；`inspectBrowserSdkInterfaceMatrix` 对此已批准集合通过。这不是全量生成 PASS，不改变运行 Registry、不自动批准无关接口，也没有修改生成器或校验器。

P0 原 SDK 不存在的阻断已通过用户授权的最小实现解除，当前真实核心读取已可用。原始产品的快照、历史迁移、比较/报告一致性和 production Mac Chrome 正式准入仍未完成；不宣布完整 `READY_FOR_LOCAL_CODEX`，不登记官方 Catalog 或发布市场。日常 Profile 尚未安装此工具，本轮实际安装证据属于独立 CFT Profile。

## 实际修改文件

- 工具：`src/adapter.js`、`src/model.js`、`src/App.jsx`、`tool.config.json`、`preview/react/sdk-preview.js`、同源生成的 `preview/react/index.html`、唯一 `browser-fingerprint.opendesk-tool.json`。
- 新增工具测试：`tests/environment.test.mjs`、`tests/native-core.mjs`；说明：`README.zh-CN.md`、历史审计前缀及本核心证据。`src/history.js`、原样式、原测试均未修改。
- 公共平台：`src/platform/chrome/browser-page-environment.js`（新增）、`current-page-refs.js`、`context-menus.js`；`src/framework/sdk/browser-contract.js`、`browser-schemas.js`；`src/ui/sidebar-tools.js`、`src/ui/sidebar-tools/package.js`、`src/sidebar-tools/bridge.js`。
- 平台测试：`tests/environment/browser-page-environment.test.mjs`、`browser-page-environment-host.test.mjs`（新增）。SDK 文档：`docs/api/browser-sdk-interface-matrix.json`、`browser-sdk-binding-catalog.generated.json`、`browser-sdk.developer.generated.d.ts`、`browser-sdk.developer.generated.md`。

仅在 `main` 编辑。本地观察基线为 `90957ba5973468d218a12f6c8b7511488e5a99be`，已取回远端为 `1d1cdcd174eb8aeb087efb44e34efa3132d47e7e`；两者有非本任务独有提交，未擅自合并、创建分支/worktree 或推送。Cookie Editor、scrapyjs、provenance 等并行修改保留且不纳入本任务提交。
