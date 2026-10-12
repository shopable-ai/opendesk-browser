## R5 Tabs 三项新增正式接口（2026-10-12）

- **接口登记**：原冻结的 32 项保持 23 IMPLEMENTED、7 PLANNED、2 NOT_EXPOSED。本轮新增并实际接线 R5 `browser.tabs.getOwned`、`browser.tabs.listOwned`、`browser.tabs.closeOwned`，累计 35 项（26 SOURCE_WIRED、7 PLANNED、2 NOT_EXPOSED）；R5+ 原 114 候选晋级 3 项，尚未批准 111 项。前期统计在下方仅作为历史记录。
- **调用路径**：SDK wrapper → 已安装 v2 工具 `browser.tabs` capability → 可信 Side Panel（close 需真实点击）→ 现有单次 intent + Host RPC → `createBrowserTabHost` → Chrome tabs / webNavigation → 精确自有 TabRef / 有界结果。
- **安全约束**：最多八个本工具有效 TabRef；只返回本工具 origin 和可验证的页面信息，无原生 tabId 和任意标签枚举；页面导航、包变化、撤权、停用、Worker 重启均不得复用旧引用。关闭前再次核验 TabRef/Origin/Document；关闭前先消费引用，未知 Chrome 效果不自动重试。
- **回归测试**：`browser-tabs-host.test.mjs`、`browser-sdk-r2-host.test.mjs`、`browser-sdk-contract-compat.test.mjs`，均新增正向、拒绝和反重试断言；本次 CI 要关联新 Git SHA。
- **验收**：Mac Chrome 同候选完整 GUI / Worker 正式验收仍 **0/35 NOT_TESTED**；上轮 P0 修复 CI https://github.com/shopable-ai/opendesk-browser/actions/runs/38266349590 为 PASS，不等于本轮新增三接口 PASS。
- **下一步**：继续 `browser-tabs.js` 的 reload/navigate；基于 `src/platform/downloads/**` 管理本工具下载及落盘状态；可信 Cookie Editor 对接 `src/platform/chrome/cookies.js`；复用现有任务和 Authority；最后补受控 Mac Chrome 实际安装验收。

## R5 P0 实际安全修复：TabRef 完整 URL 与撤权竞态（2026-10-12）

- **不增加空接口**：原正式 32 项中仍有 23 项 SOURCE_WIRED、7 项 PLANNED、2 项 NOT_EXPOSED；原生完整 Mac Chrome 验收仍 **0/32 / NOT_TESTED**。R5+ 114 项尚未晋级正式合同。
- **源码修复**：`src/platform/chrome/browser-tabs.js` 的 `resolve()` 必须比较原始获准完整 URL，而不只比较 Origin；检查 Chrome 当前 document 与 URL 一致，异步 `webNavigation.getFrame` 返回后再检查本工具 TabRef 未被撤销或过期。聚焦前额外检查撤权竞态。
- **回归测试**：`tests/environment/browser-tabs-host.test.mjs` 新增同源不同路径但漏接 `onUpdated`、异步 frame 读取期间撤权、`tabs.get` 期间撤权三类拒绝测试。
- **验证等级**：源码补丁及测试文件已准备，GitHub 远端 CI 结果须对应最终 commit；本环境无 Mac 本地源码/Chrome，不能称原生 PASS。
- **下一步**：优先确认本候选 Node/Check/Build/Verify；再完善 tabs 自有查询、列表、关闭的 SDK→Host→Chrome 真实接线与单次点击，并完成 Mac Chrome 同候选验收。

## R4 开发体验：网络观察短 API（2026-10-12）

- **用户提出的问题**：`OpenDeskSDK.browser.network.observe.start()` 把内部操作分类和 `start` 生命周期动词叠加在公开入口上，普通工具编写不便。以 `const {browser}=OpenDeskSDK; const watch=await browser.network.watch({tabRef,origin})` 作为推荐方式，随后 `watch.read()/status()/stop()/export()/cancel()/close()`。
- **实现原则**：**仅修改现有 `src/framework/sdk/browser.js` 的便捷层，不新增 RPC、不新增 Chrome 权限、不改变正式 32 项接口或已安装工具 capability**。`watch()` 内部转为原 `browser.network.observe.start`；句柄方法逐一复用原 `browser.network.observe.*`、`browser.events.*`、`browser.operations.cancel`。原完整方法仍存在，旧工具兼容。
- **源码进度口径不变**：23 / 32 已接线（71.875%），剩余录制四项、语音三项 PLANNED、两项通知 NOT_EXPOSED；**Mac Chrome 同候选原生验收仍为 0/32，全部保持 NOT_TESTED**。短接口不另算实现数。
- **安全条件**：必须提供工具获准的 `tabRef` + 精确单个 HTTP(S) Origin；不允许 `watch()` 无参监听所有网站；工具沙箱持有的便捷句柄不是可转让凭证。每次读取、停止、导出和取消继续经过可信 Host 的工具版本、Epoch、Chrome 权限、站点与会话所有权校验。
- **开发验证**：扩充 SDK→现有 Host 的正向及拒绝测试；示例 JSON 采用推荐短写法，保存原生/高级接口兼容；`node` 定向与构建和真实 Chrome 证据分开记录。此前 [`39b9277` 的 Browser SDK CI](https://github.com/shopable-ai/opendesk-browser/actions/runs/38253245050) 合同与构建 PASS；本次修改需新候选 CI。
- **下一步**：先使 SDK 短接口与工具示例的 CI 通过，再安排同候选真实 Chrome 页面点击、Network Observe / Screenshot 正向、站点撤权、Worker 重启和下载结果验收。不要继续只改文档或把别的候选 PASS 晋升。

## R3 P1 截图实际调用链续接（2026-10-12）

- **首要需求**：安装的工具调用 `OpenDeskSDK.browser.screenshot.captureVisible({tabRef})`，由真实扩展 UI 单次点击确认，只能操作本工具此前打开且仍可见、仍为同一文档的 HTTP(S) 标签页。
- **执行路径**：已安装 v2 工具的 `browser.screenshot` capability → Side Panel 点击 → 一次性 Host intent → 工具包 SHA/epoch 与 Chrome 权限检查 → 现有 `createBrowserScreenshotHost` + `tabs.captureVisibleTab` → 仅受信 SW 暂存 PNG → 再次检查标签及 Origin → Chrome `downloads.download({saveAs:true})` → 向沙箱只返回资源/下载收据、宽高及字节数。
- **安全限制**：最大 8MiB、4096×4096、SW 临时内存最多两张，撤权/导航会清理；没有网页或工具脚本原始 tabId、PNG 数据或其他站点读权限。收据说明“下载请求已发起”，**不等于文件最终保存成功**。
- **源码接线**：**23/32（71.875%）**；未接线核心接口包括媒体录制四项，另外 Speech 三项保持范围外的 PLANNED，不为凑分母开放；2 项通知保持 NOT_EXPOSED。
- **验收限制**：截图的本候选 CI/Chrome 证据未取得前保持 NOT_TESTED；原生完整通过仍为 0。最近 P2 提交 `73dff3f` 的 [Node/Check/Build/Verify CI](https://github.com/shopable-ai/opendesk-browser/actions/runs/38250188550) 已通过。

## R4 P2 有界操作管理续接（2026-10-12）

- **业务需求**：已经安装的工具能获取属于自己的网络观察 `operationId`，然后调用 `browser.operations.getStatus({operationId})` / `browser.operations.cancel({operationId})`，而不能查询/取消其他工具或任意 Chrome 任务。
- **本轮提交基线**：远端 `main` 为 `e3d5721acfe41e7c2ffbc2dfe61c9be616120237`；P2 已提交在 `73dff3f86e020228002ab7bfb4934932154cb92c`，对应定向测试、生产构建、开发构建 PASS；此段保留原工作基线供追溯。
- **接口完成度**：**23/32（71.875%）** 源码接线；**23 项原生未验收**；PLANNED 7、HOST_ONLY 0、NOT_EXPOSED 2；**同候选真实 Chrome PASS 仍为 0**。不把 Schema、旧 CI 或模拟原生响应视为完成。
- **下一步优先实际任务**：本候选先执行 Screenshot / Host / 套件正反向与构建校验；再以真实 Mac Chrome 验收 PNG 保存、活跃标签/文档变化、撤权、Side Panel 手势、Network Observe Worker 中断；录制仍待实现。
- **历史最近可追溯 CI**：`c7a5304f289b2b0cab7c7f2a945138503a35b952` 对应 [R2 Node/Check/Build](https://github.com/shopable-ai/opendesk-browser/actions/runs/38243488660) PASS，但不是本轮 P2 修改的同候选验收。

## 本候选接口优先状态（2026-10-12）

- **业务目标**：已安装工具通过 `OpenDeskSDK.browser` 执行获准浏览器能力，无需重编译扩展。
- **源码调用链**：**23 / 32（71.875%）**；仅计完整 SDK/Host/工具能力/Chrome 驱动路径。**23 项待同候选原生验收**；原生验收 **0 / 32**。另有 PLANNED 7、HOST_ONLY 0、NOT_EXPOSED 2。
- **功能簇**：R1.3 原有10项已接线，原生证据待补；P0 Tabs 2、Side Panel 1、HTTP 1 已接线且 faffbc67 定向 CI PASS；P1 Network Observe 与 Events 6 已接线但新候选 CI/Chrome 验证待做；Screenshot 已接入有界私有 PNG 与 Chrome Save As 收据，但真实保存仍待 Chrome 验收；Operations 两项已接到**本工具的网络观察会话**（不扩大为任意任务管理）；Recording 未接线。
- **下一条最优先源码/验证任务**：首先修复当前候选 CI 的定向失败及 SW 大小；随后执行真实 Mac Chrome user gesture、webRequest 精确 Origin、撤权、Worker 重启，并补充原始 receipt；不能把 Node PASS 当成原生 PASS。
- **提交证据**：P0 `faffbc67`，CI https://github.com/shopable-ai/opendesk-browser/actions/runs/38240840545 通过；P1 本次变更仍待实际 push 与 CI。
- **权限防线**：URL 必须是 HTTP(S)，TabRef 为 opaque、工具+包 hash+install epoch 绑定；网络观察只收集 HTTP 元数据，不采集 URL 路径/Query、Cookie/Token、header 或 Body，单会话上限30秒、500项、512KiB，响应强制分页；导出经真实 Chrome 下载而非向沙箱传完整图片或正文。
- **本候选 CI/Chrome 等级**：新增六项 Node、Build、native Chrome 暂为 NOT_TESTED；无本候选 Mac Chrome 真实调用证据。其它过往 CI 不升级为本候选通过。

## R2 P0 实际接线记录（2026-10-12）

- **真实源码路径**：用户工具 OpenDeskSDK.browser → 工具 capability、已安装包、Epoch 校验 → 可信 Side Panel 显式单次确认 → Worker 一次性操作凭证 → Chrome Tabs / Side Panel / Network Driver → 受限响应。
- **安全保护**：没有公开原始 tabId；TabRef 按包 hash 与生命周期绑定；停用、卸载、Chrome 权限撤销使旧批准无效；HTTP 无凭据、禁止重定向及严格响应限制。
- **下一步最优先源码任务**：以本轮 Screenshot 增量为候选跑定向 Node/Check/Build/Verify，修复后做 Mac Chrome 真正截图/保存、权限撤销及 Worker 重启验收；不得复用旧包伪称原生 PASS。
- **最近已完成验证的 P0 提交**：faffbc67e9cd067ca288aacc0197e4cd93b41868；定向 Node / Check / Build / Build:dev / Verify CI PASS，证据：https://github.com/shopable-ai/opendesk-browser/actions/runs/38240840545；原生 Mac Chrome 尚未验收。本次新增 Network Observe 的提交及测试待 CI 确认。

# Browser SDK R1.3 / R2 / R3 / R4 统一进度账本

> **接口范围提醒（2026-10-12）**：本页的 **32 项**仅为当前 Browser SDK 正式合同，**不是所有浏览器能力**。另见 [全接口扩展候选目录](../../api/browser-sdk-full-interface-inventory.zh-CN.md)：27 个功能组、114 个尚未登记的候选方法（包括 Cookie、Bookmarks、History、Storage、Downloads、Windows 等）。候选接口不计入已实现分母；Cookie Editor 目前仍是模拟 UI，真实 Chrome Cookie 读写尚未接线。


## 首屏重点：接口与业务逻辑完成度

**最终需求：已安装的工具开发者可以直接使用 `OpenDeskSDK.browser` 完成浏览器操作，不必重新编译 Chrome 扩展。首先接通 SDK → 工具安装能力 → 可信 Host → Chrome API → 返回值/错误码，然后再完成示例、美化和全面验收。**

**核心接口已接线：23 / 32（71.875%）。已登记实现但未通过当前候选原生验收：23 项；同候选 Mac Chrome 验收：0 / 32。** 新增 Tabs 两项、Side Panel 一项、Network Request 一项的公开方法与 Host 调用。源码状态不等于原生测试 PASS。

**已复用并接线：Tabs、Side Panel、HTTP、Network Observe、Screenshot 驱动。** 截图返回有界私有 PNG 下载收据，不向沙箱传 Base64。剩余 PLANNED 7、NOT_EXPOSED 2；原生验收仍为 NOT_TESTED。用户必须对每项敏感操作单次确认，普通工具不能自动继承 Chrome 扩展权限。

| 开发优先级 | 用户要实现的功能（语义需求） | 接口范围 | 当前真正的缺口 |
| --- | --- | --- | --- |
| P0 · 旧功能可用 | 在网页右键选区后自动打开工具，选区一次性领取、由用户确认保存；撤权/导航不能泄露旧内容 | `contextMenu.*`、`launch.consume`、`page.*` | R1.3 源码已有调用链；同一候选原生 GUI、Worker 与撤权验收未关闭 |
| P0 · 标签页操作 | 工具经用户批准打开 HTTP(S) 网页，只能重新聚焦自己仍有权限的标签页 | `tabs.open`、`tabs.focus` | 独立驱动已写；缺工具 capability、安装审查、Host RPC 接线及原生测试 |
| P0 · 侧边栏操作 | 用户真实点击工具中的按钮，打开 OpenDesk 自己的 Side Panel，而非任意扩展页面 | `sidePanel.openSelf` | 手势协调器已写；缺前台/Host 真实调用和 Chrome 点击证据 |
| P0 · 受控 HTTP 请求 | 工具向用户批准的 Origin 发送有界网络请求，得到 JSON/文本或稳定拒绝错误 | `network.request` | 旧 Host HTTP Driver 可复用，但未安全接到第三方工具 |
| P1 · 网络观察 | 对本工具打开的 Tab 单个精确 Origin 开始/分页读取/停止/JSON 下载 HTTP 元数据，不包含 Cookie/Token/正文 | `network.observe.*`、`events.*` | Host、持久有界队列与 Worker gap 接线完成；真实 Chrome 验收、完整导出资产策略尚待验证 |
| P1 · 截图 | 用户点击确认后截取自己获准的当前可见标签页，通过 Chrome Save As 获得 PNG 与短期私有收据，绝不直接返回原始 Base64 | `screenshot.captureVisible` | SDK → Host → TabRef → Chrome captureVisibleTab → 私有资源 → 下载已接线；同候选 Chrome 文件保存/撤权/切换验证待完成 |
| P2 · 操作管理与录制 | 查询与取消本工具的网络观察操作；录制需用户明确媒体源和停止控制 | `operations.*`、`media.recording.*` | 两个 Operations 方法已接到持久化网络观察会话；录制未实现，且缺同候选真实 Chrome 证据 |
| 维持权限边界 | 普通工具不得静默获得通知、语音控制或其他网站的隐私权限 | `notifications.*`、`speech.*` | 遵守 NOT_EXPOSED 和语音范围限制，不能为增加完成率强行开放 |

### 下一轮必须优先实现的业务闭环

1. **先完成实际调用链**：用户工具调用 SDK，可信 Host 核实包身份/权限，执行 Chrome 操作并返回结果；不允许只添加 Schema 或孤立驱动文件。
2. **再闭合权限与生命周期**：工具启停、Origin 撤权、标签页导航/关闭、Worker 重启、超时取消和身份变更一律校验和清理。
3. **每完成一个功能簇就补证据**：至少包含正向、拒绝、最小真实 Chrome 验证；未完成链路继续保持 PLANNED/HOST_ONLY。
4. **最后再做完整 UI、示例、构建和质量验收**：不以编辑 JSON 或追求 32/32 开放权限为目标。

**进度判定规则：只有公开 SDK → Host → 浏览器能力 → 返回 → 安全拒绝贯通后，才计入“关键接口可调用”；真实 Chrome PASS 还必须有同候选证据。**

---

> `IMPLEMENTED` 是合同登记状态，**不等于真实 Chrome PASS**。本账本只记录可追溯事实，不授予额外权限。

- 本轮 Network Observe 变更的准备基线 main HEAD：faffbc67e9cd067ca288aacc0197e4cd93b41868；最新提交以 GitHub main 为准。Mac 本地目录未挂载，原生验证尚未执行。
- Browser SDK 版本：`1.0.0`
- 操作总数：**32**；已登记接线 IMPLEMENTED：**23 / 32（71.875%）**；其中**23 项尚无同候选原生验收**；原生实测通过：**0**
- PLANNED：**7**；HOST_ONLY：**0**；NOT_EXPOSED：**2**
- 生态审计：**18 个领域、74 个叶子**（不代表开放全部 74 项特权 API）
- Node / Check / Build / Build:dev / Build:size / Verify：**NOT_TESTED（新增 Network Observe 候选；此前 faffbc67 的 Node/Check/Build/Verify CI PASS）**
- 真实 Mac Chrome GUI / Worker：**NOT_TESTED（当前候选）**
- 阶段 R1.3：**BLOCKED**；R2：**NOT_TESTED**；R3：**NOT_TESTED**；R4：**NOT_TESTED**

## 优先完成的任务

1. R1.3：真实 GUI 权限、右键点击、侧栏打开、一次性选区及撤权/Worker 生命周期。
2. R2：Tabs / Side Panel 的可信用户动作、工具 capability、受控 Host、Chrome 原生正反向测试。
3. R2：Network Observe 单 Tab / 单 Origin 隐私边界、会话有界队列、停止、导出及 Worker Gap。
4. R3：截图本候选真实 Chrome 文件保存与用户可见录制；notifications 保持限制；speech 遵守排除范围。
5. R4：按同一候选完成 CI、生产与开发构建、大小限制、包身份和 Mac Chrome 验收。

## 全接口实施与验收矩阵

| 操作 | 实施状态 | 对外开放 | 正向测试 | 拒绝测试 | Chrome 原生 |
| --- | --- | --- | --- | --- | --- |
| `browser.capabilities.list` | IMPLEMENTED | APPROVED_TOOL | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.capabilities.getStatus` | IMPLEMENTED | APPROVED_TOOL | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.contextMenu.getStatus` | IMPLEMENTED | APPROVED_TOOL | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.contextMenu.register` | IMPLEMENTED | APPROVED_TOOL | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.contextMenu.unregister` | IMPLEMENTED | APPROVED_TOOL | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.launch.consume` | IMPLEMENTED | APPROVED_TOOL | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.page.getContext` | IMPLEMENTED | APPROVED_TOOL | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.page.getSelection` | IMPLEMENTED | APPROVED_TOOL | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.clipboard.writeText` | IMPLEMENTED | APPROVED_TOOL | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.downloads.text` | IMPLEMENTED | APPROVED_TOOL | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.tabs.open` | IMPLEMENTED | APPROVED_TOOL | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.tabs.focus` | IMPLEMENTED | APPROVED_TOOL | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.tabs.getOwned` | IMPLEMENTED | APPROVED_TOOL | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.tabs.listOwned` | IMPLEMENTED | APPROVED_TOOL | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.tabs.closeOwned` | IMPLEMENTED | APPROVED_TOOL | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.sidePanel.openSelf` | IMPLEMENTED | APPROVED_TOOL | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.network.request` | IMPLEMENTED | APPROVED_TOOL | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.network.observe.start` | IMPLEMENTED | APPROVED_TOOL | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.network.observe.getStatus` | IMPLEMENTED | APPROVED_TOOL | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.network.observe.stop` | IMPLEMENTED | APPROVED_TOOL | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.network.observe.export` | IMPLEMENTED | APPROVED_TOOL | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.events.read` | IMPLEMENTED | APPROVED_TOOL | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.events.close` | IMPLEMENTED | APPROVED_TOOL | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.screenshot.captureVisible` | IMPLEMENTED | APPROVED_TOOL | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.media.recording.prepare` | PLANNED | DECLARED_NON_EXECUTABLE | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.media.recording.getStatus` | PLANNED | DECLARED_NON_EXECUTABLE | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.media.recording.stop` | PLANNED | DECLARED_NON_EXECUTABLE | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.media.recording.discard` | PLANNED | DECLARED_NON_EXECUTABLE | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.speech.transcribe` | PLANNED | DECLARED_NON_EXECUTABLE | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.speech.speak` | PLANNED | DECLARED_NON_EXECUTABLE | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.speech.stop` | PLANNED | DECLARED_NON_EXECUTABLE | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.notifications.create` | NOT_EXPOSED | NOT_EXPOSED | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.notifications.clear` | NOT_EXPOSED | NOT_EXPOSED | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.operations.getStatus` | IMPLEMENTED | APPROVED_TOOL | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.operations.cancel` | IMPLEMENTED | APPROVED_TOOL | NOT_TESTED | NOT_TESTED | NOT_TESTED |

## 阶段验收

- **R1.3**：BLOCKED，Native GUI right-click + one-time selection and revoke acceptance still missing
- **R2**：NOT_TESTED，P0 和网络观察 Host 代码已接线；同候选 Chrome 原生权限/用户交互/WebRequest/Worker 证据尚未关闭
- **R3**：NOT_TESTED，Screenshot and owned Operations now Host-wired; recording remains PLANNED and Speech intentionally out of scope
- **R4**：NOT_TESTED，Two limited owned-observation operations wired; same-candidate complete Mac Chrome and package evidence remains missing

## 判定依据

- `src/framework/sdk/browser-contract.js` 是唯一操作事实来源。
- `src/framework/sdk/browser-schemas.js` 只描述参数及结果类型，不是权限来源。
- `docs/framework/workstreams/browser-sdk-acceptance.json` 为机器可读的逐项验收记录。
- `scripts/check-browser-sdk-coverage.mjs` 用于核对矩阵/权限/证据；不能只改 JSON 把状态设为 PASS。
- 历史独立候选 CI：<https://github.com/shopable-ai/opendesk-browser/actions/runs/38155035118>，无原生 GUI 完整闭环。
- Mac 本机源码与测试资源未在当前执行容器中挂载；相关测试明确 NOT_TESTED。
