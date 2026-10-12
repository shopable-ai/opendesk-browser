## R4 P2 有界操作管理续接（2026-10-12）

- **业务需求**：已经安装的工具能获取属于自己的网络观察 `operationId`，然后调用 `browser.operations.getStatus({operationId})` / `browser.operations.cancel({operationId})`，而不能查询/取消其他工具或任意 Chrome 任务。
- **本轮提交基线**：远端 `main` 为 `e3d5721acfe41e7c2ffbc2dfe61c9be616120237`；本次将更新 SDK / Host / 操作持有者、状态映射 / 取消、安装能力、两类拒绝测试及机器账本。
- **接口完成度**：**22/32（68.75%）** 源码接线；**22 项原生未验收**；PLANNED 7、HOST_ONLY 1、NOT_EXPOSED 2；**同候选真实 Chrome PASS 仍为 0**。不把 Schema、旧 CI 或模拟原生响应视为完成。
- **下一步优先实际任务**：执行当前提交的 CI / Bundle / 拒绝回归，修复失败，再对 P0 标签页首次加载、真实 Side Panel 用户点击、P1 webRequest 授权/撤权/Worker 中断开展同候选 Mac Chrome 试验；之后再评估 Screenshot 的有界资源引用和安装交付。
- **历史最近可追溯 CI**：`c7a5304f289b2b0cab7c7f2a945138503a35b952` 对应 [R2 Node/Check/Build](https://github.com/shopable-ai/opendesk-browser/actions/runs/38243488660) PASS，但不是本轮 P2 修改的同候选验收。

## 本候选接口优先状态（2026-10-12）

- **业务目标**：已安装工具通过 `OpenDeskSDK.browser` 执行获准浏览器能力，无需重编译扩展。
- **源码调用链**：**22 / 32（68.75%）**；仅计完整 SDK/Host/工具能力/Chrome 驱动路径。**22 项待同候选原生验收**；原生验收 **0 / 32**。另有 PLANNED 7、HOST_ONLY 1、NOT_EXPOSED 2。
- **功能簇**：R1.3 原有10项已接线，原生证据待补；P0 Tabs 2、Side Panel 1、HTTP 1 已接线且 faffbc67 定向 CI PASS；P1 Network Observe 与 Events 6 已接线但新候选 CI/Chrome 验证待做；Screenshot 尚无正式 SDK Host 路由；Operations 两项已接到**本工具的网络观察会话**（不扩大为任意任务管理）；Recording 未接线。
- **下一条最优先源码/验证任务**：首先修复当前候选 CI 的定向失败及 SW 大小；随后执行真实 Mac Chrome user gesture、webRequest 精确 Origin、撤权、Worker 重启，并补充原始 receipt；不能把 Node PASS 当成原生 PASS。
- **提交证据**：P0 `faffbc67`，CI https://github.com/shopable-ai/opendesk-browser/actions/runs/38240840545 通过；P1 本次变更仍待实际 push 与 CI。
- **权限防线**：URL 必须是 HTTP(S)，TabRef 为 opaque、工具+包 hash+install epoch 绑定；网络观察只收集 HTTP 元数据，不采集 URL 路径/Query、Cookie/Token、header 或 Body，单会话上限30秒、500项、512KiB，响应强制分页；导出经真实 Chrome 下载而非向沙箱传完整图片或正文。
- **本候选 CI/Chrome 等级**：新增六项 Node、Build、native Chrome 暂为 NOT_TESTED；无本候选 Mac Chrome 真实调用证据。其它过往 CI 不升级为本候选通过。

## R2 P0 实际接线记录（2026-10-12）

- **真实源码路径**：用户工具 OpenDeskSDK.browser → 工具 capability、已安装包、Epoch 校验 → 可信 Side Panel 显式单次确认 → Worker 一次性操作凭证 → Chrome Tabs / Side Panel / Network Driver → 受限响应。
- **安全保护**：没有公开原始 tabId；TabRef 按包 hash 与生命周期绑定；停用、卸载、Chrome 权限撤销使旧批准无效；HTTP 无凭据、禁止重定向及严格响应限制。
- **下一步最优先源码任务**：先验证本候选 Network Observe 的 Node 正反向、SW 体积、构建与真实 webRequest；再以同一 SHA 执行 Mac Chrome 用户点击、导航、撤权、Worker 重启验收；之后接入 Screenshot。
- **最近已完成验证的 P0 提交**：faffbc67e9cd067ca288aacc0197e4cd93b41868；定向 Node / Check / Build / Build:dev / Verify CI PASS，证据：https://github.com/shopable-ai/opendesk-browser/actions/runs/38240840545；原生 Mac Chrome 尚未验收。本次新增 Network Observe 的提交及测试待 CI 确认。

# Browser SDK R1.3 / R2 / R3 / R4 统一进度账本

> **接口范围提醒（2026-10-12）**：本页的 **32 项**仅为当前 Browser SDK 正式合同，**不是所有浏览器能力**。另见 [全接口扩展候选目录](../../api/browser-sdk-full-interface-inventory.zh-CN.md)：27 个功能组、114 个尚未登记的候选方法（包括 Cookie、Bookmarks、History、Storage、Downloads、Windows 等）。候选接口不计入已实现分母；Cookie Editor 目前仍是模拟 UI，真实 Chrome Cookie 读写尚未接线。


## 首屏重点：接口与业务逻辑完成度

**最终需求：已安装的工具开发者可以直接使用 `OpenDeskSDK.browser` 完成浏览器操作，不必重新编译 Chrome 扩展。首先接通 SDK → 工具安装能力 → 可信 Host → Chrome API → 返回值/错误码，然后再完成示例、美化和全面验收。**

**核心接口已接线：22 / 32（68.75%）。已登记实现但未通过当前候选原生验收：22 项；同候选 Mac Chrome 验收：0 / 32。** 新增 Tabs 两项、Side Panel 一项、Network Request 一项的公开方法与 Host 调用。源码状态不等于原生测试 PASS。

**已复用并接线：Tabs、Side Panel、HTTP Driver 与单 Tab/Origin webRequest 观察 Driver、分页/停止/JSON 文件导出。** Screenshot 仍是 1 项未接线 HOST_ONLY，另有 PLANNED 9、NOT_EXPOSED 2。用户必须对每项敏感操作单次确认，普通工具不能自动继承 Chrome 扩展权限。

| 开发优先级 | 用户要实现的功能（语义需求） | 接口范围 | 当前真正的缺口 |
| --- | --- | --- | --- |
| P0 · 旧功能可用 | 在网页右键选区后自动打开工具，选区一次性领取、由用户确认保存；撤权/导航不能泄露旧内容 | `contextMenu.*`、`launch.consume`、`page.*` | R1.3 源码已有调用链；同一候选原生 GUI、Worker 与撤权验收未关闭 |
| P0 · 标签页操作 | 工具经用户批准打开 HTTP(S) 网页，只能重新聚焦自己仍有权限的标签页 | `tabs.open`、`tabs.focus` | 独立驱动已写；缺工具 capability、安装审查、Host RPC 接线及原生测试 |
| P0 · 侧边栏操作 | 用户真实点击工具中的按钮，打开 OpenDesk 自己的 Side Panel，而非任意扩展页面 | `sidePanel.openSelf` | 手势协调器已写；缺前台/Host 真实调用和 Chrome 点击证据 |
| P0 · 受控 HTTP 请求 | 工具向用户批准的 Origin 发送有界网络请求，得到 JSON/文本或稳定拒绝错误 | `network.request` | 旧 Host HTTP Driver 可复用，但未安全接到第三方工具 |
| P1 · 网络观察 | 对本工具打开的 Tab 单个精确 Origin 开始/分页读取/停止/JSON 下载 HTTP 元数据，不包含 Cookie/Token/正文 | `network.observe.*`、`events.*` | Host、持久有界队列与 Worker gap 接线完成；真实 Chrome 验收、完整导出资产策略尚待验证 |
| P1 · 截图 | 用户主动对获准的当前可见标签页截图，仅获得可控资源引用 | `screenshot.captureVisible` | 已有受控驱动和 Controller 能力，缺实际授权资源交付及原生测试 |
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
- 操作总数：**32**；已登记接线 IMPLEMENTED：**22 / 32（68.75%）**；其中**22 项尚无同候选原生验收**；原生实测通过：**0**
- PLANNED：**7**；HOST_ONLY：**1**；NOT_EXPOSED：**2**
- 生态审计：**18 个领域、74 个叶子**（不代表开放全部 74 项特权 API）
- Node / Check / Build / Build:dev / Build:size / Verify：**NOT_TESTED（新增 Network Observe 候选；此前 faffbc67 的 Node/Check/Build/Verify CI PASS）**
- 真实 Mac Chrome GUI / Worker：**NOT_TESTED（当前候选）**
- 阶段 R1.3：**BLOCKED**；R2：**NOT_TESTED**；R3：**NOT_TESTED**；R4：**NOT_TESTED**

## 优先完成的任务

1. R1.3：真实 GUI 权限、右键点击、侧栏打开、一次性选区及撤权/Worker 生命周期。
2. R2：Tabs / Side Panel 的可信用户动作、工具 capability、受控 Host、Chrome 原生正反向测试。
3. R2：Network Observe 单 Tab / 单 Origin 隐私边界、会话有界队列、停止、导出及 Worker Gap。
4. R3：截图与用户可见录制及操作会话；notifications 保持限制；speech 遵守排除范围。
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
| `browser.sidePanel.openSelf` | IMPLEMENTED | APPROVED_TOOL | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.network.request` | IMPLEMENTED | APPROVED_TOOL | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.network.observe.start` | IMPLEMENTED | APPROVED_TOOL | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.network.observe.getStatus` | IMPLEMENTED | APPROVED_TOOL | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.network.observe.stop` | IMPLEMENTED | APPROVED_TOOL | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.network.observe.export` | IMPLEMENTED | APPROVED_TOOL | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.events.read` | IMPLEMENTED | APPROVED_TOOL | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.events.close` | IMPLEMENTED | APPROVED_TOOL | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.screenshot.captureVisible` | HOST_ONLY | HOST_ONLY | NOT_TESTED | NOT_TESTED | NOT_TESTED |
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
- **R3**：NOT_TESTED，Screenshot HOST_ONLY, Recording/Operations not wired and Speech scoped out
- **R4**：NOT_TESTED，Two limited owned-observation operations wired; same-candidate complete Mac Chrome and package evidence remains missing

## 判定依据

- `src/framework/sdk/browser-contract.js` 是唯一操作事实来源。
- `src/framework/sdk/browser-schemas.js` 只描述参数及结果类型，不是权限来源。
- `docs/framework/workstreams/browser-sdk-acceptance.json` 为机器可读的逐项验收记录。
- `scripts/check-browser-sdk-coverage.mjs` 用于核对矩阵/权限/证据；不能只改 JSON 把状态设为 PASS。
- 历史独立候选 CI：<https://github.com/shopable-ai/opendesk-browser/actions/runs/38155035118>，无原生 GUI 完整闭环。
- Mac 本机源码与测试资源未在当前执行容器中挂载；相关测试明确 NOT_TESTED。
