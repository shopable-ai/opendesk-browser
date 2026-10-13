# Stay Focus R1.4 — zero-config shared entertainment (2026-10-13)

## R1.6 本机原生验收与源码交付（2026-10-14）

**结论：工具可以从正式 UI 安装，保存设置缺陷已修复；产品仍为 `NOT_ACCEPTED`。** 没有完整的同候选双站 2 分钟耗尽、HTTPS DNR、撤权及跨工具隔离证据。真实失败退出码、旧候选和环境阻断均保留，不能以数据恢复通过代替耗尽规则恢复。

- 负责人：Codex 会话 `01a1364d-3c43-76a0-83d6-25d8c20b38ee`。起始 main/origin：`89c3b298dc3cf8927b227b041b101770780ce58a`；全部正式修改及提交都在 main，没有创建分支、worktree 或 PR。
- 本任务源码修复提交：`f831f5d3f906fca9171e2c9cd662484a07c95ef3`。写入文件：`examples/sidebar-tools/stay-focus/src/index.html`、`examples/sidebar-tools/stay-focus/src/main.js`、`tests/environment/stay-focus-r1.test.mjs`、现有 `tests/framework/stay-focus-r1-native.test.mjs`。追加写入本记录和 `docs/framework/evidence/stay-focus-r16-20261014/`；子 Agent 仅只读审阅。
- 最后实际原生候选源码：`85de6add728a45167583b0308a8e31da7503d044`（candidate-06）；最新实际组件/双构建/verify 源码：`3763a70eed4855be91d597336938611ba9c86352`（candidate-07）。并行负责人之后修改了 WXT 输出格式及 Cookie 安装安全路径，已补跑受影响构建，不能把 candidate-06 的原生结果提升到新字节。最后逐项比较的 main `8321bc8e0a98d4066f8464f1b23b81b113593f8b` 与 candidate-07 的 470 项产品输入一致。候选身份以 receipt 的逐文件 SHA 为准，不能用变化中的 HEAD 标签替代。candidate-04/05、旧 CI 及 MIXED_DIAGNOSTIC 结果均不升级为 candidate-06 PASS。
- 日常开发 watcher 初始 PID 67794 由原负责人持有，后由其他工作流替换为 PID 25149；本任务没有启停 watcher，也没有写入日常 `dist/development`、切换日常 Chrome 扩展 ID 或修改 Native 配对。所有构建仅在 `.runtime/tests/stay-focus-r16-20261014/candidate-01/` 与 `candidate-02/` 的独立快照输出；快照不是 Git worktree。CFT Profile、调试端口与 IPv4/IPv6 HTTP 端口均由原生驱动独立申请并清理。

**真实缺陷及修复。** 工具沙箱只允许脚本，禁止表单提交。原有五个保存入口监听 `submit`，浏览器在监听器执行之前拦截提交，额度修改无法进入可信宿主审阅。五个入口改为明确的 `type="button"` 与 `click`，继续使用原字段校验及 Host 确认，不添加 `allow-forms`、权限、运行器、计时器或 DNR 引擎。新增回归先失败后通过，覆盖额度、网站、共享组、时段和白名单，以及非法额度不得发送操作。真实 Chrome 已经确认保存 2 分钟及两个本机网站。

现有原生驱动补足：正确路由 opaque iframe 的真实输入、检查输入焦点和实际字段值、真实 Side Panel 关闭、实际 Worker 停止/唤醒、同 Profile 完整 Chrome 重启、先收集独立生命周期再保留整体失败。`OPENDESK_FOCUS_NATIVE_MANUAL_SITES=1` 仅等待真实键鼠录入两个域名，不能写 usage、DNR 或权限。原生 idle 连续阻断时停止计时分支并继续独立生命周期；不伪造 active。条件性恢复前台避免重复激活污染观察。测试窗口延长只涉及测试时限，不改变每日额度或固定构建上限。

构建诊断曾临时试验 `wxt.config.mjs`，没有解决固定入口超限，已完全恢复；最终复用其他负责人已经合入 main 的预算修复。本任务不提交该配置或其他工具源码，不放宽 524288 B 固定入口上限。

**实际命令与退出码。** Node `v24.16.0` 满足仓库 `>=22.12.0`。四个指定组件文件原始 61 PASS；增加保存回归后最终 **62 PASS / 0 FAIL**。`node --check tests/framework/stay-focus-r1-native.test.mjs`、独立工具包构建、`npm run check`、`npm run build`、`npm run build:dev`、`npm run verify` 均实际执行并退出 0。最后组件/check/双构建/verify 日志为证据目录的 `candidate-07-*.log` 与相应 `*-result.json`；独立工具包构建为 `candidate-05-tool-build.log`，Focus 输入和生成包 SHA 完全相同，按测试复用规则保留其证据。初次入口超限及不完整包 verify 失败日志仍在原始 artifacts 中，没有删除或登记为成功。

| 最新 candidate-07 产物 | 字节数 | SHA-256 |
| --- | ---: | --- |
| Stay Focus 工具包 | 33024 | `afb91cfb1fecf65544ed2864c08e7eb678e864b2b6b5d2cd0e65ce7fb31413af` |
| production SW | 592119 | `9d85e1370c1dc5c1e896764e6c3bb367d2a94a4d32efc93760d78c313cb56e9f` |
| development SW | 592285 | `e49d69652a5713f4c61a75c50d301ef9269290b0df86aa188b62ecdd1321256b` |

production packageHash：`8de5cf8ca372796d35079ec4cd5f1dc4542571b1716b02ec45ef6593add04294`；development：`87ae7633a6198f6462fc6a4ad2bcbf4c45b5fe9af8124dbc0c91c4e9e73d434a`。工具壳 production 494692 B、development 494932 B，均小于 524288 B；SW 小于 1048576 B 硬上限。原始 receipt 的 `sourceDriftDuringBuild=[]`。source-receipt binding 另存为派生证据，绝不回写原 receipt。

**真实 Chrome 证据及分级。** 下表的原生事实只属于注明的 candidate-04 或 candidate-06，不能升级为 candidate-07 原生通过。 CFT `155.0.8059.39`，可执行文件在 `tests/.cache/m5-browsers/155.0.8059.39/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`。candidate-06 实际加载 `.runtime/tests/stay-focus-r16-20261014/candidate-02/dist/production`，扩展 ID `mohemamkpnbkhgeoiahoealmkomamhbo`；candidate-04 为 `oapmdikgnncbedlhnolbfecdfdlcdjpm`，加载 candidate-01/dist/production，其旧 SW 字节与 SHA 已分别记录。candidate-06 原生 SW 为 591798 B / `e324aa5cf9ad7157effc0967408f3e5aec330555112230c1c8e24534846b61ae`，而最新 candidate-07 已重建，原生 NOT_TESTED；相同加载路径和 ID 不能提升不同 SW 的证明。没有混用不同原生身份。

| 功能 | 源码 / 组件 / 构建 | 原生事实与限制 | 产品 |
| --- | --- | --- | --- |
| 首次安装、主动授权、11 站共享 30 分钟，GitHub 排除 | SOURCE_DONE / COMPONENT_PASS / BUILD_PASS | NATIVE_PASS：真实首次状态读回；未授权前无有效自有 DNR，实际 HTTP 可达 | NOT_ACCEPTED |
| 保存额度、两个本机网站进入同一娱乐组 | SOURCE_DONE / COMPONENT_PASS / BUILD_PASS | NATIVE_PASS：原生键鼠及可信 Host 确认，2 分钟实际保存 | NOT_ACCEPTED |
| 双站前台累计、后台/idle 不计费、多标签不重复计费 | SOURCE_DONE / COMPONENT_PASS / BUILD_PASS | candidate-04 原生累计 105331 ms，后台 32 秒不计费；完整 120000 ms 耗尽及多标签整段核验 NATIVE_BLOCKED | NOT_ACCEPTED |
| 10 / 5 分钟提醒 | SOURCE_DONE / COMPONENT_PASS / BUILD_PASS | 使用既有可控时间模型测试；30 分钟实耗原生 NOT_TESTED，未重复制造长耗时场景 | NOT_ACCEPTED |
| 1 分钟提醒 | SOURCE_DONE / COMPONENT_PASS / BUILD_PASS | candidate-04 NATIVE_PASS：实耗 75331 ms、阈值 `[1]`、网页提醒数 1、真实截图；candidate-06 不提升旧候选结果 | NOT_ACCEPTED |
| 耗尽后现有标签、新 HTTP、YouTube/TikTok HTTPS DNR | SOURCE_DONE / COMPONENT_PASS / BUILD_PASS | NATIVE_BLOCKED：未达到真实耗尽，绝不把网络错误或自行写入规则算 PASS | NOT_ACCEPTED |
| 关闭侧栏继续计时与限制 | SOURCE_DONE / COMPONENT_PASS / BUILD_PASS | candidate-04 关闭上下文后真实计时有证据；耗尽限制 NATIVE_BLOCKED | NOT_ACCEPTED |
| Worker 重启与完整 Chrome 同 Profile 重启 | SOURCE_DONE / COMPONENT_PASS / BUILD_PASS | candidate-06 数据恢复子项 NATIVE_PASS；已耗尽 DNR 恢复 NOT_TESTED | NOT_ACCEPTED |
| 逐站暂停/恢复、停用/重新开启 | SOURCE_DONE / COMPONENT_PASS / BUILD_PASS | candidate-06 UI 与持久状态子项 NATIVE_PASS；已有生效限制的即时移除及重开恢复 NATIVE_BLOCKED | NOT_ACCEPTED |
| 卸载 | SOURCE_DONE / COMPONENT_PASS / BUILD_PASS | candidate-06 安装记录/自有数据清除 NATIVE_PASS；活跃 DNR 与活跃提醒清除 NOT_TESTED | NOT_ACCEPTED |
| 撤销 Chrome 权限、Time Review/其他工具数据与规则隔离 | SOURCE_DONE / COMPONENT_PASS / BUILD_PASS | NOT_TESTED：未通过真实 Chrome 权限管理入口撤权，也没有真安装并运行另一工具作为隔离基线 | NOT_ACCEPTED |
| 普通 UI 首屏、折叠高级项、保存与逐站暂停、宽度 | SOURCE_DONE / COMPONENT_PASS / BUILD_PASS | 已实测 360 px iframe，scrollWidth=360；首次开启/停用入口真实使用，无正式全宽度评分 | NOT_ACCEPTED |

原始 `attempt-20-assisted-native` 整体 0 PASS / 1 FAIL / exit 1：末段 Chrome 原生 idle，使用量停在 105331 ms，尽管独立生命周期通过，整体仍要求 quota PASS。`attempt-21` 延长观察与条件恢复前台后仍因真实 idle 未达到额度，exit 1；`attempt-22` 在更新的 Host 候选通过默认池和额度保存，随后另一个相同 CFT 应用的 Profile 占用原生窗口绑定，域名录入等待超时，exit 1。没有停止或修改其他测试 Profile。资源释放后最后 candidate-06 的 `attempt-23-final-native` 再补同候选原生验证，最终状态见其原始 JSON/退出码及下方收尾记录。

**最后同候选收尾。** candidate-06 `attempt-23-final-native`（0 PASS / 1 FAIL，exit 1）实际保存两个本机网站；IPv4 127.0.0.1 与 IPv6 ::1 服务器真实内容核对成功，localhost 两种解析均记录。后台 32 秒不计费；关侧栏后原生 idle 持续，使用量保持 0，quota=`NATIVE_BLOCKED_REAL_IDLE_OR_FOCUS`。Worker 新 target 的数据读回、逐站暂停/恢复通过，随后驱动滚轮滚在 iframe 内，外层设置按钮定位超时，未把该超时当成产品停用失败。

只修正现有驱动的外层滚轮目标，复用同一 candidate-06 / Chrome / SW / 工具包，启用 `OPENDESK_FOCUS_NATIVE_LIFECYCLE_ONLY=1` 做受影响的定向补验。`attempt-24-lifecycle-only` 的 Worker 数据、逐站暂停、停用/重开状态、同 Profile 完整 Chrome 重启、安装记录及自有数据清除均实际通过；report 字段分别为 `PASS_DATA_ONLY_DNR_NOT_TESTED`、`PASS_UI_STATE_ONLY`、`PASS_STATE_ONLY_NO_ACTIVE_DNR`、`PASS_STATE_ONLY_QUOTA_NOT_TESTED`、`PASS_DATA_ONLY_EXHAUSTED_DNR_NOT_TESTED`、`PASS_DATA_ONLY_ACTIVE_DNR_NOTICE_NOT_TESTED`。本次明确不重跑已阻断的额度分支，quota=`NOT_TESTED_LIFECYCLE_ONLY`，整体仍 0 PASS / 1 FAIL / exit 1，绝不登记全套 NATIVE_PASS。原始 log 中旧 step 名称/布尔项不能替代这些限定事实；最终驱动已把重开日志改为读回实际 ownedQuotaRules 计数及 exhaustedQuotaTested，日志改动通过最终语法检查，未再发起新 Chrome 全量复测。

1 分钟实际截图：[真实网页提醒](../evidence/stay-focus-r16-20261014/attempt-20-assisted-native/real-one-minute-page-reminder.png)。账本及一次性去重在同目录 `native-report.json` 的 `reminderProof`，不可升级为另一 SW 候选的证明。

**证据与 CI。** 原始完整日志/失败/截图保存在 `artifacts/stay-focus-r1-native/20261014-r16/`；可随 main 审阅的核心副本在 [本轮证据目录](../evidence/stay-focus-r16-20261014/manifest.json)。目录保存原退出码、两种源码身份、receipt、报告及截图，manifest 逐文件列 SHA-256；旧 artifacts、CI receipt 和 profile 身份没有被覆写。复测基础与缺口保留为 `NATIVE_PASS / NATIVE_FAIL / NATIVE_BLOCKED / NOT_TESTED`，整工具不登记 `PRODUCT_ACCEPTED`。

旧 CI Run [38428256016](https://github.com/shopable-ai/opendesk-browser/actions/runs/38428256016)：source-and-build 115403285041 成功、native-mac-chrome 115404593802 在本轮查询时仍 queued；只属于 b39be6ab，不替代本机候选。本任务修复提交 f831f5d3 的按 SHA workflow_runs 查询为空。验收与驱动提交 `ada5b7ed76ef3f0993769c753ccfc481d5723bca` 已常规推送 main（exit 0，无强推）；本轮 Stay Focus CI [#38461289169](https://github.com/shopable-ai/opendesk-browser/actions/runs/38461289169) 在 2026-10-13T20:15:21.546677+00:00 的真实状态为 `in_progress`、conclusion=null，未登记 CI PASS。推送及 API 查询回执见 `main-push.log` / `main-push-and-ci.json`；这条 CI 不替代本机原生证据。

交付前复核 main `400b3ec1dec2aefc64cbdd37404845320f1a6176`：candidate-07 的 production/development 各 470 个 product inputs 与该提交逐项 SHA 一致、差异 0；详见 `final-main-product-binding.json`。该比对只证明构建输入一致，不提升原生验收等级。

## R1.5 真实 CI 验证记录（2026-10-14）

**候选源码提交**：[`b39be6ab03714e1da33b646674af44bac984975f`](https://github.com/shopable-ai/opendesk-browser/commit/b39be6ab03714e1da33b646674af44bac984975f)。本轮只修正两条与现有拒绝行为不一致的断言：`tests/environment/fixed-entries-audit.test.mjs` 要求安全审计明确拒绝 `eval`；`tests/environment/stay-focus-r1.test.mjs` 同时断言 `E_FOCUS_DATA` 和原始本机数据保护提示。未修改安全执行器、策略业务逻辑或降低限额。原失败 [#38424281955](https://github.com/shopable-ai/opendesk-browser/actions/runs/38424281955) 为 59/61 PASS、2 FAIL；本候选已修复并实际复测。

**真正执行环境**：GitHub Actions Node 22 Ubuntu；[Stay Focus #38428256016](https://github.com/shopable-ai/opendesk-browser/actions/runs/38428256016)（`source-and-build` Job `115403285041`），原始日志为 61/61 PASS、0 FAIL；`npm ci --ignore-scripts`、独立工具包、`npm run check`、`npm run build`、`npm run build:dev`、`npm run verify` 均在该 CI 中实际执行且退出成功。并非在用户 Mac 本地运行。构建包 [artifact 11829901963](https://github.com/shopable-ai/opendesk-browser/actions/runs/38428256016/artifacts/11829901963) 已保存。

| 证据项 | 当前严格状态（仅本候选） |
| --- | --- |
| 11 个默认娱乐域名、单一 `g:entertainment`、每日默认 30 分钟、排除工作学习网站 | `SOURCE_DONE`; `COMPONENT_PASS`；`NATIVE_NOT_TESTED` |
| 10 / 5 / 1 分钟剩余提醒、计费阈值去重、ISOLATED 页内呈现 | `SOURCE_DONE`; `COMPONENT_PASS`；网页真实截图 `NATIVE_NOT_TESTED` |
| 真实双站共享时长、前台/非 idle、Chrome DNR、HTTPS YouTube/TikTok、现有标签补救 | `SOURCE_DONE`; `COMPONENT_PASS`；`NATIVE_NOT_TESTED` |
| Side Panel 关闭 / Worker、Chrome 重启 / 撤权 / 停用 / 卸载 | `SOURCE_DONE`; `COMPONENT_PASS`（模拟 API 层）；`NATIVE_NOT_TESTED`，原生驱动也未单独覆盖全部场景 |
| Node 组件测试 | `COMPONENT_PASS`，61/61，0 FAIL；CLI 原始 GitHub Job 115403285041 |
| 固定产物审计、双构建、工具包生成与包验证 | `BUILD_PASS`，GitHub Job 115403285041 |
| 真正 macOS Chrome for Testing | `NATIVE_NOT_TESTED`（native Job 115404593802 在本记录时仍 `QUEUED`） |
| 正式产品验收 | `PRODUCT_NOT_ACCEPTED`，缺少同候选原生运行结果 |

构建回执：`artifacts/sidebar-tools/stay-focus/1.0.0/stay-focus.opendesk-tool.json` 与 `dist/production/official-tools/stay-focus/stay-focus.opendesk-tool.json` 的 SHA-256 均为 `e551c906ad7dfb0af635e1602bd6c71f5fd7dcc1d03d45be1a9d3b02895ba2b8`；`dist/production/sw.js` 为 **559479 B**，SHA-256 `3d296325faeb82719212085345949ee02ccf62b494ca14323c11972c6defb3c8`。SW 已超过 **524288 B 软性 review**，但低于 **1048576 B 硬性 gate**；未放宽固定限制。ZIP artifact 的上传压缩包哈希与其中工具包 SHA 必须区分，不可混用。

macOS job 完成后应读取真实退出码、`native-report.json`、截图和 SHA，再按每一场景更新 `NATIVE_PASS/FAIL/BLOCKED`，不得将排队状态认作 PASS。原始 Mac 本地目录在本次连接中不可访问，未声称实际控制用户日常 Chrome Profile。

---

## R1.4 最终源码续接（2026-10-13）

**当前已提交源码候选：** `4a379700c8171c259e5737c7a66c75c7ce5c1f20`（之后若有 main 更新必须重新核对）。本轮直接修改 Stay Focus 现有可信服务、唯一娱乐分类表、共享额度 UI、已有 ISOLATED Page Relay 提醒与 CFT 验收驱动；未新建第二套执行 Runtime、权限或 DNR 引擎。

- **已写入原生验收驱动但尚未通过：** 首次真实授权后默认共享 30 分钟、可信 UI 改为 2 分钟；通过同一个本机额度池，分别在 `127.0.0.1` 和 `localhost` 两个真实 HTTP 主机中累计前台时间；确认 1 分钟网页提醒、已有双标签与新导航的 DNR，以及默认 YouTube 和 TikTok HTTPS 导航限制。旧的停用、重新开启、同 Chrome Profile 整浏览器重启、卸载流程仍保留。没有直接写入模拟 usage、规则或权限。
- **已修复安全收尾：** 未安装/卸载时清除残余网页提示，发生策略损坏时清理，避免卸载后每次标签切换重复广播清理消息；相关组件断言源码已加入。
- **本会话确实执行的有限检查：** 当前 12 个受影响 JS 文件经 V8 语法解析 **12/12 PASS**（仅编译检查；import 语法在隔离检查中作中性去除）；此前从实际仓库源码执行的共享 30m、11 默认站点 DNR、10/5/1 去重等 10 项 V8 逻辑 Smoke PASS。两者均**不得当作 Node 组件 PASS 或真实 Chrome PASS**。
- **同源码 GitHub Actions：** [Stay Focus #38419875206](https://github.com/shopable-ai/opendesk-browser/actions/runs/38419875206)，最后检查为 `QUEUED`，无同候选 Node / npm 双构建 / ZIP / SW 体积哈希 / macOS CFT 原始完成日志。继续记作 `COMPONENT_NOT_TESTED / BUILD_NOT_TESTED / NATIVE_NOT_TESTED`，产品 95+ `NOT_ACCEPTED`。
- **执行环境：** GitHub main 可写，但连接不能直接执行用户 Mac 目录的 Node 或 Chrome；不可把 GitHub 排队运行认定为成功。不重复 30 分钟真实使用，CFT 采用可信 UI 的 2 分钟测试额度。


## R1.4 code-integrated evidence note — 2026-10-13

- **Latest candidate with affected source and native driver:** `cbf84e01839768d3ad842860b819884c693c09fa`. The doc-only tracking commit following this note is not an unrelated product candidate.
- **Confirmed main source writes:** `2780b317` Host classification/persistent reminder, `a2ba84da` one-screen shared budget, `5ac462b6` real Chrome driver, `f1bd9ed2` legacy quick-preset test correction, `ddc35d7f` orphan notice cleanup and service regression, `cbf84e01` YouTube/TikTok native DNR assertions.
- **Verification actually executed in this conversation:** 12 edited JavaScript files passed standalone V8 parsing after neutral import stripping (syntax-only); 10 focused checks of the GitHub-pulled policy/catalog/model/rule-host passed in an isolated V8 harness with minimal URL/structuredClone replacements. This is explicitly `V8_SMOKE`, **not Node COMPONENT, not npm build, not Chrome Native**.
- **Current strict candidate CI:** [Stay Focus Actions #38418376821](https://github.com/shopable-ai/opendesk-browser/actions/runs/38418376821) was **QUEUED** at last query, with `source-and-build` also `QUEUED`. No source/build/ZIP/Chrome result, artifact hash or 95+ acceptance is claimed until original job logs are available.
- **Native scope:** actual install/permission, default 30m, trusted edit to 2m, real HTTP foreground billing, 1m in-page reminder screenshot, quota DNR, YouTube and TikTok cross-domain Chrome navigations, pause/re-enable/Chrome restart/uninstall have test **source**. Two different entertainment sites each consuming time in the same native session, independent Side Panel-closed checks, and actual completed macOS job logs remain specifically **NOT_TESTED**; Node model tests include cross-site shared pooling but cannot replace those native receipts.
- **Known environment boundary:** this remote-only connection cannot read `/Users/shopme/Documents/workspace/opendesk-browser`, cannot run the user's Chrome, and the container has no external GitHub/npm network. Avoid reporting `npm run check/build/build:dev/verify` as executed locally; use exact GitHub Actions receipts when they exist.


**Implementation candidate:** backend `2780b3178e74`, UI `a2ba84da346e`, native driver `5ac462b64440`. Subsequent R1.4 maintenance commits and unrelated main changes must be checked against final source identity. These are SOURCE changes, not native PASS receipts.

| Product scenario | Source | Current component evidence | Current macOS Chrome evidence |
| --- | --- | --- | --- |
| Initial user-approved activation seeds 11 known entertainment sites, daily shared 30 min | SOURCE_DONE | NOT_TESTED | NOT_TESTED |
| Strict offline domain classification, work/study excluded, preexisting custom state retained | SOURCE_DONE | NOT_TESTED | NOT_TESTED |
| One durable g:entertainment usage pool, foreground-only billing, all sites quota DNR | SOURCE_DONE | NOT_TESTED | NOT_TESTED |
| 10/5/1 min charged-only notices with persisted dedupe and isolated in-page renderer | SOURCE_DONE | NOT_TESTED | NOT_TESTED |
| One-screen shared budget, edit minutes, suspend, one-click per-site exclusion, advanced settings folded | SOURCE_DONE | NOT_TESTED | NOT_TESTED |
| Side Panel closed, worker/browser restart, permission revoke, disable and uninstall cleanup | SOURCE_DONE | NOT_TESTED | NOT_TESTED |

Scope and migration: The single Host authority src/stay-focus/catalog.js supplies a bounded offline domain catalog to the trusted service and sandbox UI. Only the first explicit focus.enable with no stored policy seeds the defaults. Merely installing, viewing status or reading a page does not confer native permission. Existing policies and same-day usage are preserved; no silent blanket migration to the shared pool. Manual advanced sites can remain independent. The focus.group.put edit changes the single entertainment group for all enrolled domains at once.

Reminder contract: only previously settled, same-session, focused, non-idle usage crossing a threshold can emit. The durable notice snapshot persists day, revision, budget and consumed thresholds; a late tick crossing several thresholds shows just the most urgent. The existing ISOLATED Page Relay renders hardcoded text in a fixed shadow UI; page content cannot change usage, permissions or DNR. Page timers only hide the card. The existing Chrome native DNR still owns navigation blocking and already-open-tab remediation. The existing host-side disable/uninstall paths clear notices without touching other tools.

Test obligations: the existing model/service suite now contains first-enable, legacy isolation, real pool aggregation, 10/5/1 dedupe and page renderer cases. The existing macOS CFT driver has been revised to approve the default configuration from actual UI, change the shared quota through trusted review, spend a short real session, observe the in-page final-minute card and real DNR, then disable, re-enable, restart Chrome and uninstall. It never writes synthetic usage, native permissions or DNR. A second distinct entertainment-domain native accounting session is still NOT_TESTED, and 10/5-minute physical page visual observations remain NOT_TESTED (component cases cover logic).

CI evidence at writing: Stay Focus workflow runs for these candidates are QUEUED, not PASS, including https://github.com/shopable-ai/opendesk-browser/actions/runs/38413311562 . No current-candidate Node test exit status, WXT source/build/verify outcome, ZIP SHA-256 or macOS screenshots can yet be claimed. The user Mac workspace is not reachable from this GitHub connector environment. Only official GitHub job/artifact IDs or an actual separately verified Mac run may change evidence grades.

Verification owner: GitHub Actions macos-15 isolated Chrome for Testing, own temporary profile and port; no alteration to the user's daily Mac Chrome, dist/development, or another task's independent evidence. Test integrity and failure status must remain explicit.

---

# Stay Focus R1.0 · 独立工具交付账本

## R1.3 易用性改进：默认推荐和当前网站自动识别（2026-10-13）

**用户流程压缩为：打开 Stay Focus → 选择当前网站的推荐额度（或常用网站按钮）→ 在现有可信宿主确认；首次启用另由 Chrome 原生权限确认。** 不再要求普通用户手动输入域名、子域名或组名；原有手动编辑、共享组、工作时段和白名单保留在折叠的高级设置中。

- 已修改 `examples/sidebar-tools/stay-focus/src/index.html`、`src/main.js`、`src/style.css`：首屏自动读取已有 `currentPage.info` 的当前网站域名/标题，在本机识别视频/社交/娱乐/游戏及工作/学习，使用 15/20/30 分钟建议值；内置 YouTube、哔哩哔哩、TikTok、Instagram 快捷入口。
- 安全边界：精确域名优先；标题只做弱提示；不读取 `meta`、Schema.org、网页正文或历史，不请求新的浏览器权限、不上传、不增加第二套 Host。默认推荐不等于已设置规则，写入仍必须经过 `focus.site.put` 与既有可信确认；启用 DNR 仍需原生授权。
- 已同步 `tests/framework/stay-focus-r1-native.test.mjs` 打开默认收起的手动设置；新增 `tests/environment/stay-focus-r1.test.mjs` 定向模拟交互，检查“未点击不写入”、YouTube 域名精确映射、伪装域名不冒充与学习/工作默认不限制。
- **当前证据：** 已完成源码语法与轻量本地行为模拟检查，不等于同候选 Node、打包构建或 Chrome 原生 PASS；功能评定继续按下方账本的原生验收门槛，不能据此宣布正式交付。

## R1.3 核心产品状态（2026-10-13 · 最新源码候选：`95f23ce3014fdd36c6e9c48580e320688e465be7`）

**产品结论：尚不能签收为正式可用（NO-GO）。** 核心代码已存在并完成 R1.3 定向修复，但本候选 GitHub Actions 尚未执行完，真实 Chrome 计时、拦截、整浏览器重启与卸载需要取得同候选原生证据。不要把下表 `DONE` 解释为 `NATIVE_PASS`。

| 核心功能 | 源码实现 | 当前候选组件测试 | 当前候选 Chrome 验收 | 当前缺口 |
|---|---|---|---|---|
| F1 安装与生命周期 | DONE | NOT_TESTED | NOT_TESTED | 真实发现、安装、启停、卸载脚本已覆盖，但本候选未运行 |
| F2 每日娱乐时间额度 | DONE | NOT_TESTED | NOT_TESTED | 1 分钟真实前台使用以及 YouTube 15 分钟配置尚待同候选验证 |
| F3 Chrome 网站拦截 | DONE | NOT_TESTED | NOT_TESTED | 读回现检查额外规则条件；动态 DNR 与 HTTP 导航尚待真实 Chrome |
| F4 网站策略与专注模式 | DONE | NOT_TESTED | NOT_TESTED | 暂停/精确子域/白名单/共享额度/时段/会话已有代码；原生未逐项签收 |
| F5 浏览器可靠性及恢复 | DONE | NOT_TESTED | NOT_TESTED | 已补同 Profile 整个 Chrome 重启、额度与 DNR 持久验证；等待执行 |
| F6 授权、撤权、清理 | DONE | NOT_TESTED | NOT_TESTED | 验证真实授权弹窗、停用/卸载清理与未授权状态的 DNR 规则范围 |
| F7 独立工具与主要 UI | DONE | NOT_TESTED | NOT_TESTED | 已隔离 Time Review；未取得本候选完整 Side Panel 用户操作证据 |

**R1.3 实际写入文件与变更：**

- `src/stay-focus/rule-ownership.js`：DNR readback 除原有 ID / priority / regex / resourceTypes / excludedRequestDomains 外，检查额外 condition/action/redirect 字段；仅把显式的 `isUrlFilterCaseSensitive:false` 视为 Chrome 默认值，避免被错误收窄或改写的规则虚假通过。
- `tests/environment/stay-focus-r1.test.mjs`：针对多余 `requestDomains`、额外 redirect URL、大小写匹配变化补 1 组必要组件断言。
- `tests/framework/stay-focus-r1-native.test.mjs`：原有真实 1 分钟额度/停用/重新启用/卸载链路中，新增整 Chrome 退出→同 Profile 重启→持久额度与 DNR 对账→真实 HTTP 导航再次阻断→可信 Side Panel 继续卸载。没有直接改用量、权限或规则。
- `docs/framework/workstreams/stay-focus-r1.md`：本表放在历史长日志之前；历史候选证据和失败记录原样保留。

**本候选验证进度：** [Stay Focus Actions #38390117463](https://github.com/shopable-ai/opendesk-browser/actions/runs/38390117463) 创建时为 `QUEUED`，并非 PASS。仅做了源码阅读与 V8 语法解析（`tests/framework/stay-focus-r1-native.test.mjs`、`src/stay-focus/rule-ownership.js`），它不能代替 `node --test`、`npm run check/build/build:dev/verify` 或 Mac Chrome。用户 Mac 工作区对当前连接不可访问，也未把未运行命令标为通过。待 Actions 完成后依据原始 job log 填写 component/build/native、独立包 SHA-256、SW 字节数与 SHA；**目前均为 NOT_TESTED/未生成当前候选证据**。无依据的 95 分禁止登记。

**验证资源与所有权：** 只使用 GitHub Actions 自有 macOS Chrome for Testing 独立 Profile；不操作用户日常 `dist/development`、其 Mac Chrome Profile 或其他 Agent 的工作树。额外的浏览器重启验收沿用原本 1 分钟额度测试一次，不再跑第二次 15 分钟实耗；不测试配色、缩放、断点或无关 UI。

**日期：**2026-10-13。目标 `shopable-ai/opendesk-browser` `main`。与 Time Review R1.5 并行存在代码冲突风险：集成时以仓库 HEAD/提交 SHA 的原子校验为准，禁止覆盖并行 Agent 的 Mac 工作目录。

## 用户闭环与责任边界

用户从 Side Panel「工具」安装 *stay-focus* → 添加 YouTube 每日 15 分钟 → 在可信外层设置批准 DNR/idle 原生权限并开启 → 仅聚焦且 active 时计时 → 到额度时 Chrome 动态主框架规则出现并限制已有标签页 → 次日按当地日重置 → 可暂停、撤权或卸载并清理全部本工具规则。

产品区分：Time Review 是独立的网站使用回顾；Stay Focus 是独立的限制决策与执行，协议、业务存储、授权、卸载完全不同。

## 任务树（实施不等于原生验收）

- [x] 旧项目 `blackList/minuMax/duration_/focusState/check2End` 的功能调用链只读蒸馏，参见示例目录的 `LEGACY-DISTILLATION.zh-CN.md`
- [x] 新增独立工具 `tool.config.json`、沙箱 UI、官方网站目录可选安装条目
- [x] 新增 Host 范围的操作协议与安装 hash / revocation epoch 校验、非模态用户审批
- [x] 新增 DNR 自有规则 ID 730000–730199、精确域名/子域名、固定 extensionPath 与规则读回对账
- [x] 新增前台检查点、共享分钟组、工作时段、限时专注与白名单模型，存储不依赖 Time Review
- [x] 增加权限申请、时间规则、禁用/卸载清理与被限制页面资源的源码接线
- [x] 新增模型和 DNR 组件单元测试源码
- [ ] 由 Node 真正执行组件测试，保留完整退出码/日志与输入 SHA
- [ ] 独立工具打包 + 真实 `npm run check && npm run build && npm run build:dev && npm run verify`，保留 ZIP/体积/SHA-256
- [ ] Mac Chrome 真实打开被拦截页面、DNR 日志、Worker/Chrome 重启、授权撤销和卸载无幽灵规则
- [ ] Side Panel 320/360/400/600px、缩放、焦点/键盘与设计系统视觉验收
- [ ] 八维 95+ 专家签收与正式产品级 PASS（不得由作者自评替代证据）

## 运行限制与验收口径

只有同一 session/本地日/时区 offset 下跨度 ≤45s 的有效检查点才能计费，不做每秒精确保证。DNR 动态规则持久化，但每次启动、活动变化、授权撤销、安装/启停变更都要校验本工具拥有的规则片段。读回不一致或 Chrome 拒绝规则应返回错误，不得反馈成功。

Node mock 组件测试只能标为 **COMPONENT**，不能证明真实 Chrome 导航被拒绝。真实原生测试需区分 Chrome DNR 对普通主框架的实际重定向与 SPA/Service Worker 等边界。

## 八维专家验收

| 维度 | 本轮结论 | 阻断理由 |
|---|---|---|
| 功能完整性 | 待原生验收 | UI、服务接线不能取代安装流程证据 |
| 时间额度正确性 | 待测试 | 缺真实 idle/多标签/日界/DST 的原生证据 |
| 网站拦截准确性 | 待测试 | 缺 Chrome getDynamicRules + HTTP 实际导航 |
| 隐私和权限安全 | 待审查 | 须验证页面 sender、可选原生权限和撤权时序 |
| UI/UX | 待测试 | 需要真实 Side Panel 截图和焦点测试 |
| 长期性能 | 待测试 | SW 重启与 30s Alarm 长期运行待测 |
| 独立工具可维护性 | 待审查 | 单独包、官方目录、卸载清理需回归 |
| 测试证据可信度 | **未达到 95** | 未运行原生 Chrome 的不能称为产品级 PASS |

**未经实际执行的项目不登记数值 95 分；不得使用平均分掩盖缺陷。**

## 2026-10-13 实际 CI 续接证据（不得跨候选冒用）

- GitHub Actions [R1 初轮 #38358365844](https://github.com/shopable-ai/opendesk-browser/actions/runs/38358365844)，候选 `e82f83f179ac`：模型/DNR 组件 **10/10 PASS**；独立可安装工具包生成 **PASS**，原工具包 SHA-256 为 `2f4f6dfd5ce76bb5de5e771e4a97f3380cf3dcddbbdf75892386434c7256e2a2`。`npm run check` 因原有 WAR 安全清单未登记新 DNR 目标而 **FAIL**；此包的 SHA 不代表当前版本。
- 继续对照 [Sidebar Tools R1 #38362254766](https://github.com/shopable-ai/opendesk-browser/actions/runs/38362254766)：该候选关联的回归 **187 项通过，0 失败**，但 `npm run build` 的 `ui/tool-shell.js` 535147 B 超出 524288 B 上限，构建 **FAIL**。未修改/放宽上限；后续将 Stay Focus 专用可信 UI 拆至 WXT 固定脚本，并隔离 DNR 清理，保持审计规则。
- 当前修改后的完整来源已保存在远端 `main`，Linux→Mac 分阶段 CI 工作流 `.github/workflows/stay-focus-r1.yml`。针对包含最新组件、Host、WXT 构建修复的候选 [#38365380181](https://github.com/shopable-ai/opendesk-browser/actions/runs/38365380181)，在本次复核时状态 **QUEUED**。该 run 尚不构成 source check/build/verify 或 Native PASS。
- 新增 `tests/environment/stay-focus-service-r1.test.mjs`：测试伪造 Sender、版本/撤权 epoch、真实 Host 对账意图、过限规则、权限撤销、Time Review 业务存储隔离、DNR 失败与持久策略损坏恢复；目前源码已提交，**尚无本候选的执行回执**。
- 安全合同通过收紧 `web_accessible_resources`，现在只开放四个固定被限制 HTML 页；资源自身的 JS/CSS 必须在原扩展内部、固定 WXT 输出与完整包清单中校验。未经真实 Chrome 验证，不宣称网页缓存、SPA 或 Service Worker 导航无条件受阻。

### 后续仅剩阻断点（从用户场景出发）

1. **安装后可见、可授权**：当前候选必须先通过全部离线组件、`npm run check`、工具包生成、双 WXT 构建与 `npm run verify`，附 SW 体积/哈希。不以旧候选成功替代。
2. **浏览网站后真实拦截**：Mac CFT 使用真实用户输入安装和授权，读取实际 DNR 规则、HTTP 导航到扩展阻止页、真实截图和浏览器 PID/候选哈希；不能把 mock 导航记为通过。
3. **额度准确与恢复**：真实前台非 idle 有效使用，1 分钟快速原生门槛，再覆盖 15 分钟产品场景、跨日重置、后台/多标签、Worker/Chrome 重启。
4. **撤权与卸载**：本工具 DNR ID 730000–730199、独立业务存储/撤权 epoch 全部核对清零，不影响 Time Review 或其他工具。
5. **视觉及专家评分**：320/360/400/600px 和 Chrome 实际缩放、键盘焦点、简洁设置动线；每项独立达到 95 之前保持 **NOT_ACCEPTED**。


## R1.0 后续实证与修复记录（本轮）

### 完整失败证据与已实施的对应修复

- [GitHub Actions #38365380181](https://github.com/shopable-ai/opendesk-browser/actions/runs/38365380181)（候选 `cc30892fc4fe`）：定向组件 **33/33 PASS**；独立 Stay Focus 工具包 **生成 PASS**，当前该候选工具包 SHA-256：`5b854467841b6e47a627a40d4d19818adfa0a607a04b9ec9793fb4c5d28e3fbb`。整个扩展 `npm run build` **FAIL**：`ui/tool-shell.js` 536921 B 超过固定 524288 B。未提升这一候选到原生 PASS。
- [GitHub Actions #38367575526](https://github.com/shopable-ai/opendesk-browser/actions/runs/38367575526)（候选 `e736623d737d`）：旧流程中存在已拆出的 `sidebar-tool-host` WXT 入口但尚未登记固定输出白名单，构建拒绝该未知入口。随后已经复用同一 Sidebar Tools Host，补齐构建注册、信任页面加载顺序和静态资源闭包。
- [GitHub Actions #38368166959](https://github.com/shopable-ai/opendesk-browser/actions/runs/38368166959)（候选 `a7c7f209684b`）：Tool Shell 输出转为压缩后的独立 `!function(){...}()`，而安全审计仅接受命名 `var` IIFE。对应检查器**仅为 ui/tool-shell.js** 增加严格等价结构识别，继续拒绝额外顶层语句、动态代码和非批准入口；新增 `tests/environment/fixed-entries-audit.test.mjs` 专项断言。该候选以及后续当前来源的实际 PASS 必须以完整 CI 结果为准。
- 实施更安全的 Worker 持久数据恢复：策略损坏时保留原始本机数据，撤掉 Stay Focus 专属规则并报警，而不是留下无法解除的旧 DNR 限制。
- 与 Time Review 的独立性进一步修复：Chrome 撤销**无关站点权限**不再全局停用 Stay Focus；撤销特定网站权限时只暂停相应网站并同步规则，后续 Chrome 主机权限恢复不自动重新启用。
- 暂停与父/子域名覆盖一致性修复：`enabled:false` 无论是始终封锁、工作时间还是额度均不能生成规则；被精确管理的子域名覆盖父域名时，父域名 DNR `excludedRequestDomains` 主动排除子树。无法由 DNR 安全表达的“父网站含子域名 + 子网站精确主域名但不含子域名”的叠加设置在保存前拒绝，而不产生错误封锁。
- 内部限制页基于 Chrome 官方 `sidePanel.open({windowId})` 使用事先读取的**实际窗口 ID**，保证用户点击时同步发起权限相关操作；首次无历史页时返回安全空白页，保留手动进入 Stay Focus 设置的指引。

### 仍未关闭的交付门槛

- **完整当前候选 `npm run check/build/build:dev/verify`**：必须读取后续 CI 原始日志与候选 SHA；当前修复已提交但尚无本候选完整绿色结论。
- **Mac Chrome 原生网页拦截**：必须使用真实 CFT 安装、Chrome 原生 DNR 规则回读、HTTP 页面导航、最终被限制页截图；不能用 Node DNR 模拟报告代替。
- **1 分钟真实前台额度消耗**：保留真实活动/idle/浏览器窗口的连续证据；缩短额度的真实验收不能伪造 `usage`。
- **Worker/Chrome 重启、隔离和卸载**：比较同一 Chrome profile 内的规则 ID、恢复时间、其他工具不受影响等，原生证据未齐前保持 `NOT_ACCEPTED`。
- **UI 质量评分**：没有真实 Side Panel 尺寸和键盘/缩放截图，任何单维 95+ 都不能自认。

### 域名暂停与父/子域名模型修复（当前代码）

- `src/stay-focus/model.js` 的 `focusReason` 现在必须同时满足**全局启用 + 网站启用**才生成阻断原因；防止“暂停后仍保持 DNR 规则”。
- `focusMatchingSite` 先匹配最长的明确网站规则，再决定该网站是否被暂停。被暂停的具体子域名不会回落到父域名的限制规则。
- `src/stay-focus/rule-host.js` 对覆盖子域名的父规则添加 `excludedRequestDomains`，由更具体子网站的规则独立决定是否阻断。无效的“父域名覆盖子域名 + 子网站仅精确域名”组合拒绝持久保存，以避免 Chrome DNR 宽范围排除造成静默放行。
- `tests/environment/stay-focus-r1.test.mjs` 与 `stay-focus-service-r1.test.mjs` 新增模型、真实受信任 Host 请求和 DNR readback 对账组件用例。还必须完成当前候选上的完整 CI 与真实 Chrome 页面导航，不能将这些新写入测试当成已通过。
- [CI 当前排队候选 #38370141918](https://github.com/shopable-ai/opendesk-browser/actions/runs/38370141918) 源码修复提交 `3b4a157555bc`；本条记录撰写时状态 `QUEUED`，不代表失败或成功。上述新增文档不修改其源码候选。


## R1.1 · 前台时间核对与真实额度原生用例（2026-10-13，待同候选 CI）

- **源码变更（等待当前提交后的 CI 确认）**：计时检查点必须复核同一聚焦 tab/window/host/pool；idle/失焦/切页时丢弃不确定区间，杜绝旧检查点将后台时间算入额度。新增模型组件断言。
- **DNR 规则稳定性**：按完整配置域名表分配保留 ID（而非仅按当前封锁的网站计数），不再因另一域名暂停/触发额度而重编号。增删配置域名仍可能令按字母排列的 ID 重排，未承诺持久固定不变。
- **真实额度原生脚本**：原 macOS Chrome 用例除 `always` 导航外，加入从真实 Side Panel 操作将同网站改为 **1 分钟**、前台网页活动、只读采样 storage 中实际计费、`idle`/focused/active tab、DNR 读回、已打开标签页与新 HTTP 导航的额度页面及截图。绝不写入测试 `usage` 或伪造动态规则。
- **CI 排队防取消**：Stay Focus 自有工作流不再因同一 main 的后续推送取消正在执行的 Mac 原生候选；新候选只使用自己 SHA 的构建/原生证据。
- 本条仅记录**实现和待验证入口**，不是验收回执。此会话尚无法访问用户 Mac 路径；只有 Actions 实际跑完并成功且同候选证据齐备后，才允许更改为 `NATIVE_PASS`。若 Chrome 原生权限弹窗或 GUI 不可用，按实际原因标注 `BLOCKED`。


## R1.1 再推进：焦点事件守恒与完整停用/重启原生用例（2026-10-13）

**此节只保存本轮实际提交和候选验收状态，不把待运行测试升级为 PASS。**

已直接进入 `main` 的修复：

- [`9f9c182961cd`](https://github.com/shopable-ai/opendesk-browser/commit/9f9c182961cd1b7adfc4217d17e0b5ace799b70a)：`src/stay-focus/service.js` 引入 Service Worker 内部观察 epoch。任何 Chrome tab/window/idle/permissions 等事件使此前的计时检查点失效，即使事件队列排队后又回到相同标签，也不结算无法证明持续前台的旧时间。异常/规则对账失败不会把未验证 epoch 标记为已结算。
- [`a95c3fc941b3`](https://github.com/shopable-ai/opendesk-browser/commit/a95c3fc941b3399866356e5055eee5868a26fe1b)：`tests/environment/stay-focus-service-r1.test.mjs` 新增快速切页/回焦、idle→active、重新开始计算的回归用例。源码存在，不等于 Node 已运行通过。
- [`f11222cb83f6`](https://github.com/shopable-ai/opendesk-browser/commit/f11222cb83f6b097819a621002b062e31c980b0e)：原有 `tests/framework/stay-focus-r1-native.test.mjs` 继续扩展同一真实用户链路：达到 1 分钟额度后真实 DNR、已打开页与新导航拦截；然后从可信 UI 停用、读取 Chrome 动态规则为零并证明 HTTP 网站恢复；再次真实启用后确认已耗尽额度重新生效，最后卸载清理。保存扩展 ID 与分阶段证据，不直接伪造 usage/DNR。

核查基准：上述最后一个代码候选触发 [GitHub Actions #38378831778](https://github.com/shopable-ai/opendesk-browser/actions/runs/38378831778)；查询时其 `source-and-build` 为 `QUEUED`，没有运行退出码、包 SHA-256、SW 大小及 Mac Chrome 验收结论。本轮 V8 裁去 ES imports 的只读语法解析可通过新增 JS 源码；**这既不是 `node --test`，也不是 `npm run check/build/verify`，不得冒充 CI**。

当前独立验收门槛：`COMPONENT_NOT_TESTED`（新用例）、`BUILD_NOT_TESTED`（本候选）、`NATIVE_NOT_TESTED`、`UI_NATIVE_NOT_TESTED`。旧候选原有组件通过及包 SHA 只能作为历史。真实 Chrome for Testing 还需覆盖 Chrome/Worker 重启、DST/跨日、1 分钟及正式 15 分钟、后台/锁屏不扣减、白名单/父子域名/工作时段/专注到期、权限撤销、Time Review 隔离、320–600px 焦点缩放，以及工具包和 SW 的本候选 SHA。

**Go/No-Go：所有产品八维的 95+ 均未签收。下一轮应优先提取此候选实际 Actions job logs、同 SHA 包与截图；失败则针对真实日志修源码，不继续以改写任务书或历史静态测试替代。**
