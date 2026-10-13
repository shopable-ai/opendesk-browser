# Stay Focus R1.4 — zero-config shared entertainment (2026-10-13)

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
