# 自由复制 · Free Copy

OpenDesk Browser 中的独立 Sidebar Tool + 受管 Page USER_SCRIPT（不是第二个 Chrome 扩展）。

## 用户体验

- 完成安装及网页范围审阅后默认开启；在侧边栏中可一键暂停/恢复。
- “在当前网站启用”只修改该 HTTP(S) origin 的例外，不影响其他站点。
- 目标是恢复静态网页文本选择、原生右键菜单、Ctrl+C / Cmd+C 和原生复制结果；已实测恢复 CSS / `selectstart` 禁选。`copy`、`contextmenu`、快捷键拦截已有 Node 证据，真实剪贴板及菜单仍为 NOT_TESTED，不能保证覆盖所有事件注册顺序。
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

> 更新：2026-11-12，任务 `OD-FREE-COPY-WORKFLOW-GAP-CLOSURE-R3`。复用现行 [Extension Creation Workflow（九环节、四关卡）](../../.agents/workflows/extension-creation.md)、[Skills 路由](../../.agents/skills/README.md)、[HTML 预览 Skill](../../.agents/skills/opendesk-ui-preview/SKILL.md)。**本段是项目的功能树、已知缺口和下一动作的唯一持续记录；下一轮先读最新 main 与真实 CI/原生证据，只补未完成项，不新建 R3/R4 总文档。**

**当前结论：可交互同源 HTML 预览、限制复制 fixture 和可导入 0.1.1 包已存在；离线晋升门禁通过，尚未证明真实安装后可用，R3 最终验收未完成。** 两个真实网站的源码浏览器测试通过选择恢复对照，不等于 Chrome 安装、权限、原生复制或撤权通过。当前模式为离线预览 + ego 浏览器源码测试，没有启动 Browser 构建、替换 `dist/development` 或重载日常扩展。

### 原始目标与用户操作

用户不必安装第二个 Chrome 扩展：在 OpenDesk Browser「扩展」安装「自由复制」并审阅网站权限后，在「我的」或工具入口打开 Side Panel，以一个总滑块暂停/恢复；在普通 HTTP(S) 网站上恢复浏览器已有的文本拖选、右键菜单与 Cmd/Ctrl+C，另有一个「在当前网站启用」滑块管理每个 origin 的例外。关闭 Side Panel 不等于暂停获准的 Page 模块，不读取、修改或存储剪贴板，也不进行网站内容采集。首版不承诺 OCR、Canvas、浏览器内置 PDF、未授权 iframe、付费内容绕过或所有网站 100% 兼容。

**默认状态和优先级（必须区分配置与真实运行）**：

- 安装并批准所需网站访问后，无已存偏好：应用内 `enabled=true`、`disabledOrigins=[]`，**默认开启**。这不是绕过 Chrome 权限的默认授权。
- 用户保存全局 `enabled=false`：所有网站无效；重新打开工具仍为关闭。不存在“安装后还需额外启用”步骤。
- 当前站点关闭：仅该 HTTP(S) origin 加入 `disabledOrigins`；全局已开启时该站停用，其他站保留开启。
- 有效生效条件：安装与真实网站权限有效 **且** 全局开启 **且** 当前站点未排除 **且** Page 实例有效。网站不支持/未授权和存储读取失败必须明确显示，不冒充“运行中”。
- 关闭总开关时，站点开关仍可编辑例外偏好，但不改变当前实际有效状态；状态明确显示「已全局暂停 · 网站设置将在恢复后生效」。读取/保存中同时禁用两个开关，并显示忙态；保存失败保留错误和读回状态，不虚报成功。
- 全局设置、当前网站设置、**工具安装/停用**及**Chrome 网站权限**是不同层级；关闭 Sidebar UI 不是关闭业务。设置写入与在已开网页的实际生效（约 1.2 秒轮询、可选即时刷新）也是两类回执，不能混报。

### 功能树 / 场景 / 可观察验收（稳定 F/S/A）

| ID | 用户场景与关键功能 | 预期成功 / 失败反馈 | 代码或测试归属 | 状态 |
| --- | --- | --- | --- | --- |
| F01 · S01 · A01 | 完成安装审阅、无偏好首次访问普通获准网页 | 默认开启且可选择/复制；无权限则不注入并提示 | `tool.config.json`、`src/page/runtime.js`、`src/main.js` | SOURCE_WIRED；真实安装 NOT_TESTED |
| F02 · S02 · A02 | 在 Side Panel 切换「开启自由复制」 | 关闭后失效，恢复后再次生效；重开后保持；保存失败不虚报成功 | `src/index.html`、`src/main.js`、`tests/panel.test.mjs` | NODE_PASS、同源模拟交互 PASS；安装后原生 NOT_TESTED |
| F03 · S03 · A03 | 只暂停当前网站再切换到另一个网站 | 仅该 origin 被排除；切换后独立显示，禁用站点不影响其他网站 | `src/main.js`、`src/page/runtime.js` | NODE_PASS、内存站点切换/刷新 PASS；多 Tab 原生 NOT_TESTED |
| F04 · S04 · A04 | 遇到禁止选择/右键/复制快捷键的网页 | 启用前限制真实存在；启用后原生行为恢复，复制文本正确；无法解决的机制明确报告 | `src/page/unlock.js`、`tests/unlock.test.mjs` | CSS/selectstart 源码浏览器 OFF/ON/OFF PASS；原生复制/菜单 NOT_TESTED；mousedown 边界仍在 |
| F05 · S05 · A05 | 使用输入框、富文本编辑器、鼠标右拖手势 | 不拦截正常输入/粘贴/菜单；与 mouse-gestures 不冲突 | `src/page/unlock.js`、相关共存回归 | 初步防护；原生菜单时序 NOT_TESTED |
| F06 · S06 · A06 | 停用、撤销权限、卸载或页面销毁 | 本工具的注入样式和受管监听被停止清理，失败保留真实状态 | `src/page/runtime.js`、`src/page/unlock.js`、`tests/runtime.test.mjs` | SOURCE_WIRED；原生撤权 NOT_TESTED |
| F07 · S07 · A07 | 交付完整可安装工具 | Node/包测试与版本同源，唯一 JSON 安装包，Chrome 安装回执和同包身份 | `app.ci.json`、现有 Builder、原 Installer | PACKAGE_PASS 0.1.1 / Page revision 2；INSTALLED_CHROME NOT_TESTED |

### 同源 HTML 交互预览与评审

入口：[preview/index.html](preview/index.html)，来源回执：[preview/index.context.json](preview/index.context.json)。复用原生成器的 `free-copy` adapter 和正式 Side Panel 外壳、Design Tokens；13 个场景/主题 frame 中的业务 HTML/CSS/JS 来自同一个可安装包，未手写第二套产品 UI。可直接在浏览器打开该自包含 HTML：

```sh
node scripts/preview/build-preview.mjs --tool free-copy --out projects/free-copy/preview/index.html
```

`preview/mock-host.js` 仅实现内存模拟；`controls.html` / `controls.js` 只在工具外部提供站点 A/B、不可用页面、刷新、下一次保存失败、恢复读取等诊断控制。模拟 `page.request` 明确拒绝真实执行；不申请权限、不访问网络/持久存储/系统剪贴板。来源清单记录 UI 与 adapter 的 SHA-256，定向测试核对生成字节和来源。页面刷新重建模拟内存；诊断「刷新」保留当前内存偏好，用于模拟重新读取。

2026-11-11 至 12 日 ego 实际操作已覆盖：全局/本站滑块、全局暂停后的站点偏好、站点切换、读取/保存忙态、读取失败和恢复、未授权/不支持页面、保存失败后读回及再次保存、键盘 Space/Enter、返回列表再进入、模拟确认 Escape 关闭并归还焦点、浅/深色。外壳为正式 360px Side Panel，并生成和查看了 320px 窄侧栏截图；本轮未增加完整 PC 管理页。独立评审发现深色状态字对比不足，已改用原 `--od-accent-ink`（约 9.85:1）并查看最终截图通过。**预览本身可交互已验证；Codex 客户端内嵌渲染仅收到排队回执，`SOURCE_HTML_INLINE=NOT_TESTED`；模拟不证明网页复制已生效。**

### 既有工作流与阶段状态（不是新流程）

工作流原本已有 Phase 0–8 与 Gate A–D；**缺的是本项目执行证据与交接，不是缺少新 Workflow/Skill**。

| 工作流阶段 | 当前证据边界 | 后续最小动作 |
| --- | --- | --- |
| 0–1 恢复现场/产品目标 | README 和源码、历史提交均存在 | 按最新 main 核对，不重复研究 |
| 2 功能树 | 原 F/S/A 已保留并更新证据 | 后续只补实际新增场景 |
| 3 类型与权限 | Sidebar Tool v2 + Page USER_SCRIPT 已固定 | 保留身份、能力、Owner 和原授权 |
| 4–5 HTML 交互预览/UI 评审 | SOURCE_BOUND_PREVIEW_PASS；状态、键盘和浅深色已操作 | 原生菜单/手势继续在真实安装后验证 |
| 6 真实代码 | 保留原两个开关；只补读取/保存忙态、暂停说明及原 Tokens | 不重建项目/Host/SDK |
| 7 分级测试 | 项目 + 组合包 52/52；fixture 与两站源码浏览器选择对照通过 | 真实安装后的原生复制、菜单、手势与撤权 |
| 8 保存、晋升与交付 | 0.1.1 唯一 JSON 已由原 Builder 晋升并通过同源检查 | 用户审阅安装 → 同包身份与权限读回 → 原生验收 |

### 实测证据与未通过项

[tests/fixtures/blocked-copy.html](tests/fixtures/blocked-copy.html) 已存在，分别设置 CSS 禁选、`selectstart`、Cmd/Ctrl+C、复制篡改、右键拦截、`mousedown.preventDefault` 和普通 input/textarea/contenteditable/button/draggable；不内置 Free Copy 或虚假 ON/OFF。可在仓库根用本地 HTTP 服务打开它。下列浏览器测试以**当前 `src/page/unlock.js` 原模块和受控测试生命周期**挂载，再用真实浏览器鼠标拖选；没有调用安装 Authority，统一标记 `BROWSER_SOURCE_HARNESS_NOT_INSTALLED`。

| 页面/机制 | OFF → ON → OFF 实际读回 | 证据边界 |
| --- | --- | --- |
| 本地 fixture CSS 禁选 | 空 →「CSS 原文：蓝色山谷里有一条安静的小河。」→ 空；`user-select` none → text → none | 选择恢复 PASS |
| 本地 fixture `selectstart` | 空 →「SELECTSTART 原文：午后的阳光落在第七页。」→ 空 | 选择恢复 PASS |
| 本地 fixture `mousedown.preventDefault` | 空 → 空 → 空 | 已知兼容边界，未恢复 |
| [WebBrowserTools](https://webbrowsertools.com/test-right-click/) Method 9 `selectstart` | 空 → `Sample text` → 空 | 真实站点源码测试 PASS；安装后复制/菜单 NOT_TESTED |
| [AWPLife 内容保护演示](https://awplife.com/demo/right-click-ban-and-content-protection-pro/) CSS 禁选 | 空 → 完整演示原文 → 空；none → text → none | 真实站点源码测试 PASS；安装后复制/菜单 NOT_TESTED |

基准文本三阶段均能拖选；普通 input/textarea 在测试结束后可编辑，ON 状态下的原生编辑/粘贴完整流程仍未验收。`https://webbrowsertools.com/test-copy-paste/` 返回 404，未计作有效测试站点。本轮未验证真实复制篡改是否解除、系统剪贴板是否等于原文、原生右键菜单和 Mouse Gestures 共存；Node 的事件模拟不能补齐这些结果。

相关检查（2026-11-11，最终 0.1.1 输入）：

```sh
node --test projects/free-copy/tests/*.test.mjs tests/environment/sidebar-tool-page-module-package.test.mjs tests/environment/sidebar-tool-page-module-install.test.mjs
# 52/52 PASS，其中本项目 18 项
node --test --test-name-pattern='tool contract|tool packer|native tool directory|portable Sidebar|promotion rejects|new sandbox' tests/environment/sidebar-tools.test.mjs
# 7/7 PASS
node --test --test-name-pattern='real package and offline preview|fixed inputs produce' tests/environment/sidebar-preview-contract.test.mjs
# 2/2 PASS
```

`node --check` 已覆盖改动的 main、mock-host、controls 和 generator；`git diff --check` 通过。未运行根完整构建/全仓测试。已观察但未修改的共享历史失败：`sidebar-tools.test.mjs` 整文件 7/8（旧 header CSS 字符串正则）；`sidebar-preview-shell.test.mjs` 4/5（旧无图标「扩展」按钮正则）。对应 shell/CSS 未由本轮修改。`check-preview-contract.mjs` 的既有 quick-notes 来源锁过期，包含多项基线漂移及本轮 generator 变更；未更新无关工具锁来制造全绿。Free Copy 自身 UI/adapter 来源核对通过。

本机原始回执在仓库忽略的 `artifacts/free-copy-r3/`：`final-node-package.log`、`package-focused.log`、`preview-shared-tests.log`、`preview-shell-tests.log`、`package-tests.log`、`preview-states.json`、`fixture-selection.json`、`site-webbrowsertools.json`、`site-awplife.json`、`final-package.json`、`native-boundary.json`、`preview-light-final.png`、`preview-dark-final.png`。这些是本机证据，不是另一个正式包；关键结果及身份已持久写入本 README。

### 唯一安装包与原生阻塞

- [free-copy.opendesk-tool.json](free-copy.opendesk-tool.json)：`free-copy` / `app.free-copy`，**0.1.1**，Page revision **2**，**45248 bytes**。
- SHA-256：`90a54f99c7f3211e48b9821690715d975a795f2f44d1c701717ea65eadfbff03`。
- 原 `scripts/build-sidebar-tool.mjs` 构建临时候选 `artifacts/sidebar-tools/free-copy/candidate.opendesk-tool.json`，定向门禁通过后 `--promote-from` 晋升；`--check-project` 返回 `PROJECT_PACKAGE_MATCH`、`validated: true`、`installed: false`。生成器不是新安装器。
- 两份配置同步到 0.1.1 / revision 2，避免对不同 UI 字节重复使用同版本；不宣称此前 0.1.0 已安装。
- ego 观察到现有 `OpenDesk Browser Developer`，ID `ccfcjegpkdlgbclopjmadlcjedelidmf`、manifest 0.1.0；**实际加载目录、dev serve 连接和应用指纹 UNKNOWN**，不能据此证明本包已经运行。
- 原生入口受阻：CUA 状态获取 30 秒超时并重置；桌面连接器 SSE 探测 HTTP 429；官方 `profiles.py ui-acquire` 报 native UI busy。没有抢占锁、释放他人锁、使用全局剪贴板输入或绕过 Side Panel 安装审阅。未取得本工具安装/授权回执。
- `INSTALLED_CHROME`、系统剪贴板原文读回、原生菜单、Mouse Gestures 共存、真实权限撤销/卸载清理、production 同候选 Chrome 验收全部 **NOT_TESTED**；因此当前仅可交付“通过离线门禁的待安装候选”，不能称正式安装验收通过。

### 独立六维评估与下一步

独立只读 code-reviewer 复核了源码、包/预览字节和最终深色截图；测试命令结果引用本轮执行回执，没有再次运行全部测试。最终发现的中等对比度问题已关闭，未发现新增缺陷；仍以 COMMENT 结论保留真实运行缺口。

| 产品 | 交互 | 架构 | 权限安全 | 测试 | 交付 | 算术平均 |
| --- | --- | --- | --- | --- | --- | --- |
| 90 | 92 | 93 | 89 | 89 | 90 | **90.5 / 100** |

主要扣分依次为：安装后复制闭环、原生菜单/手势时序、Host/Page 运行集成、真实授权/撤权、剪贴板与菜单证据、安装读回。分数低于目标 95，不用设计或源码评分替代实际验收。

**下一条用户操作**：原生入口可用后，从现有 Side Panel「扩展」审阅导入本项目唯一 0.1.1 JSON，读回包身份和网站授权，确认无需第二次启用。随后按优先级：

1. 在 HTTP 本地 fixture 用已安装工具做 OFF → ON → OFF，验证真实选区、Cmd/Ctrl+C 后原文粘贴、复制篡改、右键菜单和正常编辑控件；保留 mousedown 边界，不虚报恢复。
2. 在上述两个有效网站做同包安装后的对照；源码测试无需为制造新回执而重复，但不能替代该集成层级。验证 Mouse Gestures 右拖共存。
3. 撤销网站权限、停用及卸载，读回停止注入和清理；遇到未知副作用不自动重放。
4. 依据这些原生回执更新 F/S/A、评分和最后提交；正式 Chrome 验收完成前不标 R3 完成或 95+。

起始源码提交：`c27fa0520a6ffeb5afbad1bab47b091e119170a7`，当时 main 工作区干净、origin/main 落后本地 6 个提交。**本轮代码、预览、fixture 与安装包交付提交：`4747d63a3ae94d1efda845b4ac292329a90862e7`**；本段随后单独提交文档回执，未推送。预览 context 的 `sourceCommit` 记录生成时的起始基线，当前业务字节由 `uiSha256` 和 adapter 摘要核实，不以基线 SHA 冒充交付提交。没有创建分支/worktree、更改其他扩展业务或中断已有 watcher。已有真实 PASS 先读回再决定是否补测。
