# Browser Fingerprint · 当前 React 核心功能

2026-10-30：按用户最新要求优先更新当前页面和核心配置流程，延期宽度/缩放矩阵、全量验收及九项评分。

## 当前入口

- 正式业务源码：`src/App.jsx`、`src/style.css`。首页是「配置」，另外两个 Tab 是「我的环境」「检测」。
- 最新同源 React 预览：[`preview/react/index.html`](preview/react/index.html)。可修改 UA、语言、时区、视口，选择原始/美国/德国/日本，保存与管理档案；预览始终拒绝修改真实 Chrome，不显示虚假生效。
- [`preview/index.html`](preview/index.html) 是保留的 **R3.1 设计基准**，不代表当前正式 React UI。
- 唯一可导入包：[`browser-fingerprint.opendesk-tool.json`](browser-fingerprint.opendesk-tool.json)，版本 **0.2.6**。从原有「扩展 → 更多操作 → 导入扩展」安装/更新；已在独立 Mac CFT 通过原安装流程更新，权限未变化。

**日常 Chrome 的入口核对（2026-10-30 续接）**：已从原生 UI 确认「您的 Chrome」加载本仓库 `dist/development`，扩展 ID 为 `ccfcjegpkdlgbclopjmadlcjedelidmf`。其「全部 / 已安装」列表为 15 项，未见浏览器指纹；不能将上面的独立 CFT 安装结果理解为日常实例已更新。当前待办是在该实例通过原安装器导入 0.2.6、打开并核对三 Tab。浏览器接口拒绝打开扩展内部 URL，自动安装未完成；未更换加载目录、扩展 ID 或 Native 配对。详见[当前入口记录](evidence/r33-core-20261030.zh-CN.md#日常-chrome-入口续接核对)。

## 本轮结果

档案保存继续使用原 `fingerprint.r21.presets.v1`、ETag/CAS 和写后读回。新增编辑基线检查：同一档案已被其他窗口修改或删除时，拒绝旧草稿覆盖；不阻止其他档案的独立修改。可通过「刷新网页身份」刷新档案列表，再从「我的环境」重新载入，旧草稿仍需明确丢弃。

相关 Node **72/72 PASS**，正式 Vite 构建和预览同源核对通过，Chromium 完成三 Tab、四预设、草稿保护、保存重开/编辑/复制/删除、表单恢复零 Host 调用、拒绝假应用与 unknown 不重放的核心检查。所有预览 SDK 结果均为 **FIXTURE_ONLY**。

真实 Mac Chrome 核心链路已运行：保存档案并读回、重开载入、授权、应用、独立网页读回、停止和恢复基线。最终 0.2.6 安装 JS/CSS 与正式包一致；停止后调试解除，UA/UA-CH、语言及完整语言数组、时区、视口恢复。不保存直接应用已在本轮 0.2.4 验证，最终包复验保存档案的应用链。复用原 R2.5 production Host，没有重建宿主；详细原始读数见 [Mac 核心证据](evidence/r33-native-core-20261030.json)。

本轮还修复了结果归属问题：停止后切换新预设，完成记录与报告仍绑定原会话，不再错误显示新表单的名称/配置。旧 R2.5 Host 首次授权确认较慢时曾超时；界面如实进入 unknown，没有自动重放，独立网页也未被修改。最终候选及时确认授权后的完整链路通过，但不能据此宣称慢授权问题或当前 main Host 全量验收通过。

「恢复原始参数」只改表单；「停止并恢复网页」继续走原 Session 和独立读回。unknown、invalidated、restore_unknown 保护不放宽。产品不承诺独立 Profile、Cookie 隔离、代理或完整指纹浏览器能力；专业方案为自愿入口，不阻断免费配置功能。

本轮完整范围、来源哈希、证据与剩余项见 [核心交付记录](evidence/r33-core-20261030.zh-CN.md)。

<details>
<summary>R2.x 历史实现记录（不作为当前 UI、Host 或发行状态）</summary>

# Browser Fingerprint R2.2 · 历史记录

**原始产品目标（最高优先级）：** 选择环境预设 → 修改并保存 → 对当前明确授权 Tab 应用真实 Chrome 环境覆盖 → 独立读取网页实际值 → 停止并核对恢复。不是只读检测器。R2.0 原型 preview/r20-reference.html 继续作为设计基线，正式 React Root 为 src/App.jsx。

## 本轮精简目标与关键测试（2026-10-30）

目标：扩展负责「选预设 / 修改保存 → 应用 → 停止」，独立 [浏览器环境诊断页](http://127.0.0.1:43111/browser-fingerprint.html) 负责详细前后读数。默认界面只显示当前目标、运行状态、配置和两项主操作；核验明细、技术边界与历史按需展开。应用和停止后自动执行原有可信读回，省去手动切换「网页验证」再读回的步骤。

实施计划：先用现有预设 / 会话测试锁定行为，再精简 App 与专属 CSS；保留原存储键、权限、文档绑定及来源校验。移除默认八字段三值卡片和重复说明，报告导出与旧检测仍可在折叠区找到。只在本工具目录改动，不扩展 Host / SDK，不增依赖。

关键条件：

- 预设修改可保存，切换时保留未保存草稿确认；折叠详情不影响会话。
- 应用只提交一次，独立读回后才显示有限验证；读回失败不自动重放应用，并仍可停止已受理会话。
- 停止自动读回原始基线；缺少网络证据保持「网页已恢复 / 请求头未验证」，不能宣称完整恢复。
- 超时、拒绝授权、旧文档失效清楚显示；身份失效和未知副作用不重放；停止入口不被默认长报告挤走。
- 在同一候选包、同一 Mac CFT Host 中核对 UA、UA-CH、语言及完整 languages 数组、时区的变化和停止恢复；键盘能切换视图、取消对话框且焦点归还。

独立评审目标：信息精简、核心操作、状态真实性、安全与恢复、可操作性，每维 ≥95/100；不能用平均分掩盖短板。新界面在取得同候选原生证据前保持 `NOT_SCORED / NOT_TESTED`。宽度/缩放矩阵、全量生命周期与官方 Catalog 发行不在本轮范围，历史证据仅按原范围复用。

## 当前独立网页核验入口（2026-10-30）

打开 [HTTP 浏览器环境诊断页](http://127.0.0.1:43111/browser-fingerprint.html)，复用 `examples/tasks` 的 43111 服务；也可从标准演示页进入。本页自行读取 UA、UA-CH、语言、完整语言数组、时区等实际值，对比本页基线，支持暂停和报告导出。扩展继续负责配置、应用、停止与可信恢复报告，本次未修改扩展业务源码或安装包。

真实 Mac 上美国 Windows 与德国预设的网页变化、停止后回到基线均已核对。诊断页独立评审八项平均 97、最低 95，见[操作证据与评分](evidence/http-diagnostic-20261030.zh-CN.md)。该分数不代表整套 Host/发行验收；正式包仍为 0.2.1，0.2.2 晋升门禁尚未完成。以下 R2.2 和历史章节保留当时状态，以本节及原始证据的具体范围为准。

同一 d57 production Host 的安装、应用与恢复，以及切 Tab、刷新、停用、Chrome 网站撤权、卸载、0.2.1 → 0.2.2 更新已取得[当前 Mac 原生证据](evidence/mac-lifecycle-20261030.zh-CN.md)。DevTools 在该 Chrome 可并存，未证明外部断开；其余未测原生项及当前 CI 旧路径阻断均单独保留，不影响诊断页专项评分，也不视为正式发行通过。

## R2.2 正式源代码已做的增量（2026-10-29）

- Manifest 及 permission-gate.js 声明必需的高敏 debugger 权限。Chrome 不允许动态申请可选 debugger；用户必须经过 Chrome 原生安装/升级提示，另需独立当前网站授权。扩大 Manifest 权限必须经真实安装安全审查，**此版本不得提前发布官方 Catalog**。
- src/platform/chrome/browser-fingerprint.js：仅固定的 CDP Emulation.setUserAgentOverride、setLocaleOverride、setTimezoneOverride、setDeviceMetricsOverride；调用者不能供应原生 tabId、任意 CDP 命令或可执行 JS。
- Trusted Host、SDK Registry/Schema、Side Panel 使用已有工具身份、版本、packageHash、installEpoch、TabRef/DocumentRef、实时 Chrome 权限及站点授权。首次可信授权只记录权限而不执行 native 命令；仅在授权后旧文档引用旋转时自动续接一次。
- 正式 React 三个 Tab 复用，配置应用结果和独立网页读回分离。报告展示原始基线、目标、实际、原生命令逐字段状态及来源。未知命令不能假报网页匹配。
- 原生 Session：导航、Tab 关闭、切换活动 Tab、权限撤销、安装变化、DevTools 接管时失效并尝试释放本扩展的 debugger；最长 8 分钟租期。恢复必须独立采集原网页值，detach 回执不等于恢复成功。
- 新增 restored_limited，表示已停止调试、网页受控可观测字段恢复，但未得到网络请求头独立证据，不报告 restored_verified。
- User-Agent、UA-CH 低熵平台、网页 JS 语言、时区、视口提供真实执行与读回路径。地理位置配置暂 UNSUPPORTED；HTTP Accept-Language 缺网络独立证据时 UNVERIFIABLE；公网 IP、物理屏幕及独立 Profile 不在范围内。
- 新增 tests/r22.test.mjs 和 CI 权限断言，保留 R1.9/R2.1 原始测试事实。

## R2.2 不能声明完成的环节

1. 旧 browser-fingerprint.opendesk-tool.json 是 0.2.1 预构建静态包；源码 tool.config.json 已是 0.2.2，必须先构建 dist 和 candidate，再安装。不得手工只改旧包版本号制造已安装的假象。
2. 本轮 Node / React BUILD 的 GitHub Actions 运行结果尚未读回；静态检查或模拟执行不能充当 PASS。
3. Chromium 真实原生命令及 Mac Chrome 正式安装/原生授权/恢复：NOT_TESTED。
4. 可信 HTTP 请求头证据、定位独立读回、浏览器重启后恢复以及高敏全局 debugger 权限发行审查仍需专门完成。

## 新增核心验证命令

在本地最新 main 运行 npm ci --ignore-scripts --no-audit --no-fund，然后分别运行：

    npm --prefix examples/sidebar-tools/browser-fingerprint test
    npm --prefix examples/sidebar-tools/browser-fingerprint run build
    npm --prefix examples/sidebar-tools/browser-fingerprint run stage:candidate

候选包审阅通过后，在 Mac Chrome 正式安装，分别核验美国环境 apply → 网页读回 → stop → 基线读回；德国环境、拒绝授权、切 Tab、导航、DevTools 接管及撤权。各级证据分开标注 NODE、REACT BUILD、CHROMIUM MOCK、CHROME NATIVE、MAC CHROME INSTALLED，缺证据项为 NOT_TESTED。

---

## 历史 R2.1 基线（以下旧章节的“未接入 debugger”陈述仅指 R2.1 当时状态）

# 浏览器指纹 · Browser Fingerprint R2.1（正式 React）

**产品方向：** 选择环境预设 → 修改参数 → 保存 → 当前授权 Tab 应用 → 独立网页读回 → 停止并核对恢复。**只读检测是辅助工具，不是主产品。**

设计基线：`preview/r20-reference.html`，原始 SHA256：
`f9aaacc486311c8344a3e1128e060c32349301f67d8cb523ce9a1f52cbf0b2a8`。
这是独立的 R2.0 设计原型，含明确标注的模拟 Host，**不能作为生产运行时或真实网页验证证据**。
生产唯一 React 入口为 `src/App.jsx`，`preview/react/index.html` 从同一套 React 源码编译生成。

## 本轮实现的正式业务

- 默认环境设置；原始 / 美国 / 德国 / 日本；UA / 语言 / 时区 / 定位 / 视口；新建、修改、保存、删除自定义预设和草稿保护。
- 自有持久化：`fingerprint.r21.presets.v1`、`fingerprint.r21.runs.v1`；8 KiB 上限、ETag/CAS 和写后读回。旧快照键 `fingerprint.a.history.v1` 完全保留，未迁移或覆盖。
- 三个业务 Tab：环境设置、网页验证、运行记录。只读六字段检测收起在运行记录内；旧历史及对比实现保留，默认核心诊断不访问旧历史。
- 严格区分 `idle/applying/applied_unverified/verified_limited/partial/blocked/denied/unknown/invalidated/restoring/restore_unknown/restored_verified`。应用回执不等于网页独立验证；不可验证字段不显示一致。

## 当前真实能力的阻断：高敏原生接口尚未审查

- 现有 Host 提供 `browser.page.getContext` 和只读 `browser.page.readEnvironment`（UA、语言、时区、视口、屏幕、像素比）；`browser.fingerprint.apply/readback/restore` 目前仅是 `src/run-session.js` 内待审的最小接口名称，**没有加入 Host 的白名单，不存在原生实现**。
- Chrome Manifest 当前**没有** `debugger` 权限。应用前先通过可信 `browser.capabilities.getStatus` 检测；没有受审的 Host 接口则返回 **BLOCKED**，不操作当前网页，不伪造任何成功。
- 当前版本不修改公网 IP、代理、物理屏幕、独立 Profile；不承诺防关联、WebRTC/Canvas/WebGL 指纹隔离。

要让 P1 真正生效，必须先完成权限与生命周期审计：

1. 经明确授权仅绑定当前 HTTP(S) 活动 Tab 的原生调试权限；Host 复核安装包 hash、epoch、Chrome 原生权限与一次点击；绝不信任 Sandbox 传入的任意 CDP 指令或 tabId。
2. 最小命令白名单只覆盖 UA/UA-CH、JS 语言与请求语言、时区、Geolocation、视口设备指标；每项实际执行与独立读取分开。
3. 受信 Session 绑定固定 TabRef+DocumentRef；导航、Tab 关闭、撤权、DevTools 接管、Host 重启即失效；不重放未知副作用。
4. 真实基线必须先采集；恢复后再次独立采集。不能因 debugger.detach 成功就宣布已恢复。
5. 高敏 debugger 权限及相应 Chrome 官方提示需要专门审查；**不得未经审批扩大 Manifest 或将此版提升官方 Catalog**。

## 保留与新增文件

- `src/App.jsx`：已确认 R2.0 三个业务 Tab 的正式 React。
- `src/ReadOnlyDiagnostics.jsx`：合入 R1.9 的真实六字段只读诊断，保留在运行记录下方；原 `src/model.js`、`src/history.js` 及测试未重写。
- `src/env-config.js`：R2.0 预设与可验证字段模型。
- `src/presets.js`：预设与运行记录 CAS 持久化。
- `src/run-session.js`：严格的 Host 预检查、当前文档一致性、独立读回与恢复状态。
- `preview/react/sdk-preview.js`：离线测试替身，所有真实 Chrome 环境修改一律拒绝。
- `tests/r21.test.mjs`：新增预设、CAS、状态、报告来源拒绝测试。

## 本地增量核验命令

```sh
npm --prefix examples/sidebar-tools/browser-fingerprint test
npm --prefix examples/sidebar-tools/browser-fingerprint run build
npm --prefix examples/sidebar-tools/browser-fingerprint run preview:build
npm --prefix examples/sidebar-tools/browser-fingerprint run preview:check
```

**不要虚报：** Mac Chrome 安装/权限/真实环境修改/恢复依然 NOT_TESTED，P1 Chrome Native 环境修改 BLOCKED。开发测试（Node/BUILD/Chromium）也必须按本轮实际运行记录另行给出，旧 R1.8 PASS 不等于 R2.1 PASS。

## 合并前 R1.9 只读诊断的既有记录

以下保留原只读诊断的安装方式与验证记录；它们不证明合并后的 R2.1 组合已通过构建或原生验收。保存、历史、对比与导出仍为该诊断的延期项。

## 运行与授权

唯一可导入文件为 [browser-fingerprint.opendesk-tool.json](browser-fingerprint.opendesk-tool.json)，工具版本 `0.2.1`。需要同时包含新 SDK 的 OpenDesk Browser；只导入工具 JSON 不能升级 Browser 的可信 Host。当前开发扩展使用本仓库 `dist/development` 与 `npm run dev`。

通过「扩展 → 更多 → 导入」审阅安装后打开应用，在普通 HTTP(S) 网页点击检测。首次使用某个网站时，由可信 Host 审阅六字段读取授权；同一安装和网站后续复用授权。Chrome 网站访问权限仍须有效；拒绝、撤权、停用或卸载后不能继续采集。

- `browser.page.getContext`：取得可信 Host 核验的网页上下文与 opaque 文档引用。
- `browser.page.readEnvironment({tabRef,documentRef})`：固定六字段白名单，只读目标顶层文档 `MAIN` 世界；不接收脚本、URL 或原生 Tab ID。
- 来源标记为「目标网页 JS · MAIN · 顶层文档」，表示网页观察到的 JS 环境值，不是硬件认证或 HTTP 请求头。
- 正常值、不可用与未知分别展示；整次未授权或身份失效则拒绝并清除结果。导航和标签切换后，界面在下一次身份检查时清除旧值（约 2.5 秒）。每次检查的两次 SDK 查询留出宿主请求预算，避免窗口持续打开后因限流清空读数。
- 原生采集限时 3 秒、回执最多 8 KiB；首次可信授权另有等待预算。迟到或其他文档的回执不采用。

## 已验证的当前核心链

真实 Mac Chrome for Testing `154.0.8037.92` 的 headless 与有界面窗口均通过实际 Chrome `SIDE_PANEL` 和原安装审阅 UI 完成八项检查：安装、拒绝授权无值、等待超过旧 8 秒限制后授权读取、六值与独立目标读取一致、再次检测无需重复授权、导航清除、重新检测新文档、切换 Tab 清除。有界面续测后保留检测结果；系统窗口列表确认该任务窗口在屏幕上且位于前台，开发服务已连接。

本轮定向 Node 测试 120/120、React 构建、同源预览与正式 JSON 同源检查 PASS。Node 中另覆盖文档/安装身份、撤权/卸载、跨站拒绝和超时。证据与边界见 [核心开发结果](evidence/r19-core-development.zh-CN.md)；初次能力缺口保留在 [历史 SDK 审计](evidence/r19-sdk-admission.zh-CN.md)。

这是独立 CFT Profile 的开发阶段真实核心证据。个人日常 Chrome、production 候选完整验收、保存/历史/比较/报告闭环及官方 Catalog 发布仍未执行，不宣称完整 R1.9 `READY_FOR_LOCAL_CODEX`。

## 源码与定向复现

`src/ReadOnlyDiagnostics.jsx` 为只读诊断 React UI，`src/adapter.js` 只调用公开 SDK；`src/model.js` 严格校验实时 v2 回执，并禁止其静默进入旧 v1 历史。`preview/react/sdk-preview.js` 仅为显式离线演示替身，不产生真实网页证据。

```sh
node --test tests/environment/browser-page-environment.test.mjs tests/environment/browser-page-environment-host.test.mjs tests/environment/browser-sdk-r124-current-page.test.mjs examples/sidebar-tools/browser-fingerprint/tests/environment.test.mjs
npm --prefix examples/sidebar-tools/browser-fingerprint run build
npm --prefix examples/sidebar-tools/browser-fingerprint run preview:build
npm --prefix examples/sidebar-tools/browser-fingerprint run preview:check
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/browser-fingerprint --check-project
```

真实核心脚本复用仓库原 launcher/transport，需要既有 CFT 154、开发扩展及标准演示页面服务；使用独立临时 Profile，不操作个人 Chrome 数据。默认无界面，完成后清理浏览器：

```sh
node examples/sidebar-tools/browser-fingerprint/tests/native-core.mjs
```

需要用户实际查看和操作时，在保留 stdin 的终端运行：

```sh
node examples/sidebar-tools/browser-fingerprint/tests/native-core.mjs --headed --keep-open
```

`--headed` 通过 Chrome 自身 UI 开启该临时 Profile 的开发者模式，加载固定 `dist/development`；安装与网站授权仍走原产品审阅 UI。`--keep-open` 必须与 `--headed` 一起使用，结束后保留成功结果（失败时保留现场），不会自动关闭窗口。证据目录的 `session.json` 记录本任务进程与 Profile。终端输入 `close` 或向记录的 `driverPid` 发送 `SIGTERM`，由原 launcher 关闭所属浏览器并清理临时 Profile；保留期间不要手动删除该 Profile。

</details>
