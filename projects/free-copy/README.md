# 自由复制 · Free Copy

OpenDesk Browser 中的独立 Sidebar Tool + 受管 Page USER_SCRIPT（不是第二个 Chrome 扩展）。

## 用户体验

- 完成安装及网页范围审阅后默认开启；在侧边栏中可一键暂停/恢复。
- “在当前网站启用”只修改该 HTTP(S) origin 的例外，不影响其他站点。
- 恢复静态网页文本选择、原生右键菜单、Ctrl+C / Cmd+C 和原生复制结果。站点的普通 `copy`、`selectstart`、`contextmenu`、快捷键处理不能覆盖这些动作（受浏览器事件注册顺序约束）。
- 不读取、保存或发送选中文字，不读写系统剪贴板，不访问网络、不请求原生 Tab/剪贴板权限。
- 暂停时移除本工具注入的样式；事件监听在受管 Page 生命周期结束时清理。轮询私有设置用于侧栏关闭后、其他网页标签页的设置收敛，约 1.2s；失败安全停用。

## 兼容和边界

- 仅普通已授权 HTTP(S) 顶层网页；不能覆盖受限浏览器页面、浏览器内置 PDF、未授权 iframe、Canvas/图片文字或没有加载的内容。
- 避开输入框、富文本编辑器、按钮、拖动控件等交互区域，不强行覆盖表单、网站自定义编辑器的复制行为。
- 对网页已早于本模块注册的 window capture 监听、`mousedown.preventDefault`、Shadow DOM、虚拟化内容无法保证全部解除；后续可考虑仅在用户授权的网站提供增强兼容模式。
- 鼠标手势若已识别 56px 右拖，则让该次右键事件继续到鼠标手势模块；Chrome/macOS 若在鼠标移动前弹出原生菜单，仍需真实 Chrome 验证时序，不能凭 Node 测试保证共存。
- 软件只恢复浏览器已呈现网页的常规复制；不用于绕过登录/付费访问、DRM 或下载限制。

## 归属及运行

- `tool.config.json` 与 `package.json` 共同声明应用 ID `free-copy` / `app.free-copy`，项目唯一入口 `src/page/main.js`，父工具持有 `storage.local` 和 `currentPage.read`。
- 复用仓库原 Sidebar Tool v2 组合包构建器、现有安装审阅、Page Authority 和私有 CAS 设置，不新增 Browser 宿主权限及特殊安装器。
- 按现有规范先运行本项目的 `node --test projects/free-copy/tests/*.test.mjs` 及 `node --check`，再由原打包器生成临时候选并通过包测试后晋升唯一正式包 `projects/free-copy/free-copy.opendesk-tool.json`；未实际安装 Chrome 时标记 NOT_TESTED。

功能范围：P0 开关、选择/复制/右键恢复；P1 站点例外已实现。OCR、图片、PDF、跨 iframe、强制复制按钮及剪贴板历史不属于首版。


## 需求、交互与验收交接（唯一持续记录）

> 更新依据：2026-11-11 重新核对现行 [Extension Creation Workflow（九环节、四关卡）](../../.agents/workflows/extension-creation.md)、[Skills 路由](../../.agents/skills/README.md)、[HTML 预览 Skill](../../.agents/skills/opendesk-ui-preview/SKILL.md) 与本项目源码。**本段是项目的功能树、已知缺口和下一动作的唯一持续记录；下一轮先读最新 main 与真实 CI/原生证据，只补未完成项，不新建 R3/R4 总文档。**

### 原始目标与用户操作

用户不必安装第二个 Chrome 扩展：在 OpenDesk Browser「扩展」安装「自由复制」并审阅网站权限后，在「我的」或工具入口打开 Side Panel，以一个总滑块暂停/恢复；在普通 HTTP(S) 网站上恢复浏览器已有的文本拖选、右键菜单与 Cmd/Ctrl+C，另有一个「在当前网站启用」滑块管理每个 origin 的例外。关闭 Side Panel 不等于暂停获准的 Page 模块，不读取、修改或存储剪贴板，也不进行网站内容采集。首版不承诺 OCR、Canvas、浏览器内置 PDF、未授权 iframe、付费内容绕过或所有网站 100% 兼容。

**默认状态和优先级（必须区分配置与真实运行）**：

- 安装并批准所需网站访问后，无已存偏好：应用内 `enabled=true`、`disabledOrigins=[]`，**默认开启**。这不是绕过 Chrome 权限的默认授权。
- 用户保存全局 `enabled=false`：所有网站无效；重新打开工具仍为关闭。不存在“安装后还需额外启用”步骤。
- 当前站点关闭：仅该 HTTP(S) origin 加入 `disabledOrigins`；全局已开启时该站停用，其他站保留开启。
- 有效生效条件：安装与真实网站权限有效 **且** 全局开启 **且** 当前站点未排除 **且** Page 实例有效。网站不支持/未授权和存储读取失败必须明确显示，不冒充“运行中”。
- 关闭总开关时，站点开关在正式源码当前仍可编辑例外偏好，但不改变当前实际有效状态；交互评审应检查是否使用户困惑，必要时最小改成禁用并提示，而不是未经确认增加第三个开关。
- 全局设置、当前网站设置、**工具安装/停用**及**Chrome 网站权限**是不同层级；关闭 Sidebar UI 不是关闭业务。设置写入与在已开网页的实际生效（约 1.2 秒轮询、可选即时刷新）也是两类回执，不能混报。

### 功能树 / 场景 / 可观察验收（稳定 F/S/A）

| ID | 用户场景与关键功能 | 预期成功 / 失败反馈 | 代码或测试归属 | 状态 |
| --- | --- | --- | --- | --- |
| F01 · S01 · A01 | 完成安装审阅、无偏好首次访问普通获准网页 | 默认开启且可选择/复制；无权限则不注入并提示 | `tool.config.json`、`src/page/runtime.js`、`src/main.js` | SOURCE_WIRED；真实安装 NOT_TESTED |
| F02 · S02 · A02 | 在 Side Panel 切换「开启自由复制」 | 关闭后失效，恢复后再次生效；重开后保持；保存失败不虚报成功 | `src/index.html`、`src/main.js`、`tests/panel.test.mjs` | SOURCE_WIRED；原生 NOT_TESTED |
| F03 · S03 · A03 | 只暂停当前网站再切换到另一个网站 | 仅该 origin 被排除；切换后独立显示，禁用站点不影响其他网站 | `src/main.js`、`src/page/runtime.js` | SOURCE_WIRED；多 Tab 原生 NOT_TESTED |
| F04 · S04 · A04 | 遇到禁止选择/右键/复制快捷键的网页 | 启用前限制真实存在；启用后原生行为恢复，复制文本正确；无法解决的机制明确报告 | `src/page/unlock.js`、`tests/unlock.test.mjs` | 基础实现；真实网站 NOT_TESTED |
| F05 · S05 · A05 | 使用输入框、富文本编辑器、鼠标右拖手势 | 不拦截正常输入/粘贴/菜单；与 mouse-gestures 不冲突 | `src/page/unlock.js`、相关共存回归 | 初步防护；原生菜单时序 NOT_TESTED |
| F06 · S06 · A06 | 停用、撤销权限、卸载或页面销毁 | 本工具的注入样式和受管监听被停止清理，失败保留真实状态 | `src/page/runtime.js`、`src/page/unlock.js`、`tests/runtime.test.mjs` | SOURCE_WIRED；原生撤权 NOT_TESTED |
| F07 · S07 · A07 | 交付完整可安装工具 | Node/包测试与版本同源，唯一 JSON 安装包，Chrome 安装回执和同包身份 | `app.ci.json`、现有 Builder、原 Installer | PACKAGE / INSTALLED_CHROME 尚未证明 |

### HTML 交互预览决定（必须补齐，但不重复生产 UI）

**本产品需要可点击交互预览**，因为有两个具有关联关系的滑块、已授权/未授权、读取/保存/异常、全局暂停与网站例外等可见状态。当前 `src/index.html` 是**正式 Tool HTML 片段**，并非完整独立预览；检查时项目没有 `preview/`，也没有与正式 Free Copy 代码匹配的生成预览回执，标记 `PREVIEW_MISSING`、`DESIGN_REVIEW_NOT_TESTED`。

应优先按现行 `opendesk-ui-preview` Skill 走已有 **source-bound preview**：核查 `scripts/preview/build-preview.mjs` 的工具 adapter；当前只读核对未见 `free-copy` 适配，应在已有生成器/Mock 边界最小补齐后以正式 HTML/CSS/JS 创建离线交互预览，测试生成字节、来源锁及用户可见状态，不要复制第二套手写正式 UI。若阶段上只能交付独立设计稿，要清楚标记 `DESIGN_REVIEW_ONLY`，不得冒称同源。预览辅助控制（授权/错误/主题/重置等）放在工具区域之外，模拟数据仅在内存，绝不请求真实 Chrome 权限或持久存储。

**必须在预览中点通的场景：** 全局 ON/OFF、本站 ON/OFF、切换域名、总开关关闭覆盖本站开关、加载/保存忙态、未授权/不支持站点、读取失败与刷新恢复、键盘 Tab/Space、Side Panel 约 320–360px 以及至少一种窄屏/浅深色适配。优先展示紧凑 Side Panel：当前简单功能不自动追加 PC 完整管理页；未来确有复杂管理场景再复用单工具多 Surface 的既有 `app.html`，不新建 Host。网页复制行为应在独立测试 fixture/真实网页验证，而不是由外观预览伪装真实复制。

### 既有工作流与阶段状态（不是新流程）

工作流原本已有 Phase 0–8 与 Gate A–D；**缺的是本项目执行证据与交接，不是缺少新 Workflow/Skill**。

| 工作流阶段 | 当前证据边界 | 后续最小动作 |
| --- | --- | --- |
| 0–1 恢复现场/产品目标 | README 和源码、历史提交均存在 | 按最新 main 核对，不重复研究 |
| 2 功能树 | 本节现补 F/S/A | 后续只补实际新增场景 |
| 3 类型与权限 | Sidebar Tool v2 + Page USER_SCRIPT 已固定 | 保留身份、能力、Owner 和原授权 |
| 4–5 HTML 交互预览/UI 评审 | `PREVIEW_MISSING`，无正式 UI 评审回执 | 使用已有预览 Skill 完成同源模拟与键盘/状态评审 |
| 6 真实代码 | `SOURCE_WIRED`，此前仅有限模拟检查 | 不重写；只修测试发现的问题 |
| 7 分级测试 | 已有三个 Node 用例文件；正式 Node/真实 Chrome/真实网站仍需当前回执 | 先本地可控复制限制 fixture，再真实网站启停对照与原生 Chrome |
| 8 保存、晋升与交付 | 项目根未核实有最终 `free-copy.opendesk-tool.json` | 原 Builder 候选 → 定向门禁 → 晋升唯一包 → 用户安装审阅 → 原生读回 |

建议测试 fixture：`tests/fixtures/blocked-copy.html`（区分 CSS 禁选、selectstart/contextmenu/keydown/copy 拦截、mousedown、正常编辑控件），通过本地 HTTP(S) 受授权 origin 测试；再对两个公开演示网站分别执行“OFF 确认限制 → ON 验证恢复 → OFF 验证撤销”，网站若不再限制不得计为 PASS。fixture 与预览是两种交付物，不可互相代替。

**下一步唯一执行入口**：核对最新 main/并行改动 → 补 `free-copy` 同源交互预览并评审（仅已缺场景）→ 在本地建一个限制复制 fixture → 跑现有 Node 定向测试 → 两个真实网站与 Mouse Gestures 共存测试 → 必要修复 → 原打包器生成候选、校验并晋升 → 用户审阅安装与真实 Chrome 验收 → 更新本段状态及证据。任何已有真实 PASS 应先读回并跳过，绝不以分数或旧对话重复覆盖。评分角色各自按 100 分独立评，综合使用算术平均；**设计分数不等于产品验收**。
