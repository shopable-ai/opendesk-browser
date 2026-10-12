## R2 P0 实际接线记录（2026-10-12）

- **真实源码路径**：用户工具 OpenDeskSDK.browser → 工具 capability、已安装包、Epoch 校验 → 可信 Side Panel 显式单次确认 → Worker 一次性操作凭证 → Chrome Tabs / Side Panel / Network Driver → 受限响应。
- **安全保护**：没有公开原始 tabId；TabRef 按包 hash 与生命周期绑定；停用、卸载、Chrome 权限撤销使旧批准无效；HTTP 无凭据、禁止重定向及严格响应限制。
- **下一步最优先源码任务**：CI 定向正向、拒绝和构建修复，随后同 SHA Mac Chrome 真实用户点击、导航、Worker 重启。其后优先实现 Network Observe。
- **最新 P0 功能源码提交**：9a0a5b3a977969bf8d37978a116769972562cbc5。尚无本候选测试证据，Node / Build / Mac Chrome 维持 NOT_TESTED。

# Browser SDK R1.3 / R2 / R3 / R4 统一进度账本

> **接口范围提醒（2026-10-12）**：本页的 **32 项**仅为当前 Browser SDK 正式合同，**不是所有浏览器能力**。另见 [全接口扩展候选目录](../../api/browser-sdk-full-interface-inventory.zh-CN.md)：27 个功能组、114 个尚未登记的候选方法（包括 Cookie、Bookmarks、History、Storage、Downloads、Windows 等）。候选接口不计入已实现分母；Cookie Editor 目前仍是模拟 UI，真实 Chrome Cookie 读写尚未接线。


## 首屏重点：接口与业务逻辑完成度

**最终需求：已安装的工具开发者可以直接使用 `OpenDeskSDK.browser` 完成浏览器操作，不必重新编译 Chrome 扩展。首先接通 SDK → 工具安装能力 → 可信 Host → Chrome API → 返回值/错误码，然后再完成示例、美化和全面验收。**

**核心接口已接线：14 / 32（43.75%）。已登记实现但未通过当前候选原生验收：14 项；同候选 Mac Chrome 验收：0 / 32。** 新增 Tabs 两项、Side Panel 一项、Network Request 一项的公开方法与 Host 调用。源码状态不等于原生测试 PASS。

**已复用并接线：Tabs、Side Panel 和原有 HTTP Driver。** Screenshot 仍是 1 项未接线 HOST_ONLY，另有 PLANNED 15、NOT_EXPOSED 2。用户必须对每项敏感操作单次确认，普通工具不能自动继承 Chrome 扩展权限。

| 开发优先级 | 用户要实现的功能（语义需求） | 接口范围 | 当前真正的缺口 |
| --- | --- | --- | --- |
| P0 · 旧功能可用 | 在网页右键选区后自动打开工具，选区一次性领取、由用户确认保存；撤权/导航不能泄露旧内容 | `contextMenu.*`、`launch.consume`、`page.*` | R1.3 源码已有调用链；同一候选原生 GUI、Worker 与撤权验收未关闭 |
| P0 · 标签页操作 | 工具经用户批准打开 HTTP(S) 网页，只能重新聚焦自己仍有权限的标签页 | `tabs.open`、`tabs.focus` | 独立驱动已写；缺工具 capability、安装审查、Host RPC 接线及原生测试 |
| P0 · 侧边栏操作 | 用户真实点击工具中的按钮，打开 OpenDesk 自己的 Side Panel，而非任意扩展页面 | `sidePanel.openSelf` | 手势协调器已写；缺前台/Host 真实调用和 Chrome 点击证据 |
| P0 · 受控 HTTP 请求 | 工具向用户批准的 Origin 发送有界网络请求，得到 JSON/文本或稳定拒绝错误 | `network.request` | 旧 Host HTTP Driver 可复用，但未安全接到第三方工具 |
| P1 · 网络观察 | 在指定 Tab、指定 Origin 内开始/分页读取/停止/导出脱敏 HTTP 元数据，不包含 Cookie/Token/正文 | `network.observe.*`、`events.*` | 缺正式授权会话、真实 webRequest、Worker gap、资源导出与清理的闭环 |
| P1 · 截图 | 用户主动对获准的当前可见标签页截图，仅获得可控资源引用 | `screenshot.captureVisible` | 已有受控驱动和 Controller 能力，缺实际授权资源交付及原生测试 |
| P2 · 操作管理与录制 | 检查任务真实状态、执行有结果的取消；录制需要用户明确媒体源选择和停止控制 | `operations.*`、`media.recording.*` | 尚缺正式会话、Host 生命周期、真实媒体控制与验收 |
| 维持权限边界 | 普通工具不得静默获得通知、语音控制或其他网站的隐私权限 | `notifications.*`、`speech.*` | 遵守 NOT_EXPOSED 和语音范围限制，不能为增加完成率强行开放 |

### 下一轮必须优先实现的业务闭环

1. **先完成实际调用链**：用户工具调用 SDK，可信 Host 核实包身份/权限，执行 Chrome 操作并返回结果；不允许只添加 Schema 或孤立驱动文件。
2. **再闭合权限与生命周期**：工具启停、Origin 撤权、标签页导航/关闭、Worker 重启、超时取消和身份变更一律校验和清理。
3. **每完成一个功能簇就补证据**：至少包含正向、拒绝、最小真实 Chrome 验证；未完成链路继续保持 PLANNED/HOST_ONLY。
4. **最后再做完整 UI、示例、构建和质量验收**：不以编辑 JSON 或追求 32/32 开放权限为目标。

**进度判定规则：只有公开 SDK → Host → 浏览器能力 → 返回 → 安全拒绝贯通后，才计入“关键接口可调用”；真实 Chrome PASS 还必须有同候选证据。**

---

> `IMPLEMENTED` 是合同登记状态，**不等于真实 Chrome PASS**。本账本只记录可追溯事实，不授予额外权限。

- 本轮账本更新前 main HEAD：9a0a5b3a977969bf8d37978a116769972562cbc5；最新提交见 GitHub main 历史。Mac 本地目录未挂载，原生验证尚未执行。
- Browser SDK 版本：`1.0.0`
- 操作总数：**32**；已登记接线 IMPLEMENTED：**14 / 32（43.75%）**；其中**14 项尚无同候选原生验收**；原生实测通过：**0**
- PLANNED：**15**；HOST_ONLY：**1**；NOT_EXPOSED：**2**
- 生态审计：**18 个领域、74 个叶子**（不代表开放全部 74 项特权 API）
- Node / Check / Build / Build:dev / Build:size / Verify：**NOT_TESTED（当前候选）**
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
| `browser.network.observe.start` | PLANNED | DECLARED_NON_EXECUTABLE | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.network.observe.getStatus` | PLANNED | DECLARED_NON_EXECUTABLE | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.network.observe.stop` | PLANNED | DECLARED_NON_EXECUTABLE | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.network.observe.export` | PLANNED | DECLARED_NON_EXECUTABLE | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.events.read` | PLANNED | DECLARED_NON_EXECUTABLE | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.events.close` | PLANNED | DECLARED_NON_EXECUTABLE | NOT_TESTED | NOT_TESTED | NOT_TESTED |
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
| `browser.operations.getStatus` | PLANNED | DECLARED_NON_EXECUTABLE | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.operations.cancel` | PLANNED | DECLARED_NON_EXECUTABLE | NOT_TESTED | NOT_TESTED | NOT_TESTED |

## 阶段验收

- **R1.3**：BLOCKED，Native GUI right-click + one-time selection and revoke acceptance still missing
- **R2**：NOT_TESTED，Tabs, Side Panel and bounded network observation still lack approved tool Host wiring
- **R3**：NOT_TESTED，Screenshot HOST_ONLY, Recording/Operations not wired and Speech scoped out
- **R4**：NOT_TESTED，No same-candidate full CI, package and Mac Chrome proof

## 判定依据

- `src/framework/sdk/browser-contract.js` 是唯一操作事实来源。
- `src/framework/sdk/browser-schemas.js` 只描述参数及结果类型，不是权限来源。
- `docs/framework/workstreams/browser-sdk-acceptance.json` 为机器可读的逐项验收记录。
- `scripts/check-browser-sdk-coverage.mjs` 用于核对矩阵/权限/证据；不能只改 JSON 把状态设为 PASS。
- 历史独立候选 CI：<https://github.com/shopable-ai/opendesk-browser/actions/runs/38155035118>，无原生 GUI 完整闭环。
- Mac 本机源码与测试资源未在当前执行容器中挂载；相关测试明确 NOT_TESTED。
