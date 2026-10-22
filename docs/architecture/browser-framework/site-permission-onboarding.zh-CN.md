# OpenDesk Browser 默认全站访问与可扩展 API 权限（MV3）

## 定位与设计决策

OpenDesk Browser 是用户主动安装的浏览器自动化扩展。为减少每次切换网页时的授权中断，正式扩展从「首次运行再申请所有网站」调整为 **安装／更新时声明全站访问**。但 Chrome 不存在「所有命名 API 权限」通配符；它们必须逐项列明。Chrome 的权限授权也不代表 OpenDesk 的页面脚本或第三方任务获得了运行、Cookie 或网络调用权。

## 安装后直接使用：统一产品与运行规则（2026-10-17）

**安装确认是正常使用的最后一个通用步骤，而不是“安装 → 启用 → 再次授权 → 才能使用”。** 已安装且符合原有批准范围的功能默认为可用；“停用 / 恢复”只管理用户主动关闭的功能，不是首次安装的必经流程。不同执行类型有不同触发方式，不得把“可用”误解为“立即自动执行所有任务”。

| 类型 | 安装成功后的正常行为 | 不应出现的重复步骤 |
| --- | --- | --- |
| 第一方可信、仅显示页面 UI 的网页增强（官方阅读目录） | 已有 Chrome 网站访问权、原安装仍有效、网站未被主动停用时，在适用的 HTTP(S) 文档自动启动可信 Content Script 并显示目录；关闭 Side Panel 不停止页面目录 | 再点击“启用”、逐站授权、打开 Side Panel 或再点“开始注入” |
| 已审阅的固定网站页面 UI（例如 ChatGPT 提示词基础快捷按钮） | 安装批准中已经明确的网站与能力范围自动复用；网页按钮按固定规则显示，点击后的业务动作仍由用户发起 | 每次打开同一获准网站重复确认基础显示 |
| 普通 Sidebar Tool 应用（HTML/React/Vue 沙箱） | 安装后即处于可打开状态；点击“打开”仅用于显示应用界面，不是另一份启用许可；无须先启用才能打开 | “安装完成”后额外的通用启用关卡 |
| Installed Page USER_SCRIPT | 复用已获准的固定版本、匹配范围及 Chrome 条件，在后续匹配的文档按既有原生规则自动运行；用户主动停用/撤销时停止未来准入 | 同版本、同权限范围每个新文档重复请求授权 |
| Controller / Task / Workflow / 定时操作 | 安装或保存后具备调用资格；用户点击 Run 或已有明确授权的触发条件出现才执行有副作用的任务 | 无意义的第二次安装级启用；同时严禁仅因安装就擅自自动 Run |

**权限边界仍然有效。** Chrome 原生网站访问被限制、User Scripts 被关闭、已安装版本/能力/Origin 改变、用户主动停用、授权撤销、来源不可信时必须停止相应准入。安装审阅已批准的基础能力复用该批准，不再另设逐站白名单作为正常使用前置。Cookie、历史、空闲检测、持续记录、网络或 Native 等额外能力，不因宿主 manifest 拥有权限就自动转授第三方工具；已有合法授权应静默复用，缺失权限只在可信用户动作中按精确范围申请，拒绝后不自动重放。官方阅读目录的自动注入仍须核验官方来源，不能转授给第三方自报的 `page.toc`，更不能扩大为通用 DOM 访问。

### 基础能力一次审阅与站点停用（2026-10-21）

网页剪藏的 `page.clip`、知识保存的 `page.capture` 以及声明式 `browser.contextMenu` 在安装审阅后按各自支持范围直接可用。剪藏仍由用户点击提取；知识保存仅在原有 ChatGPT 网站显示固定入口，点击才读取/保存；右键动作仍仅执行包中已审阅的声明。它们不继承阅读目录专属授权，也不获得任意 DOM/后台代码执行权。真正缺失的 Chrome optional 权限仍从可信用户动作申请。

`src/ui/sidebar-tools/site-grants.js` 统一提供基础能力的站点可用性：未停用即可用，主动停用写入 `{mode:'all-except',blockedOrigins:[精确Origin]}`，恢复移除对应例外。继续使用原 `clip-sites.v1` / `capture-sites.v1` 存储，不增加授权层；宿主、页面与后台使用同一判断。旧正向数组可读，按本次默认可用决策解释；旧系统删除条目后的撤销与从未授权无法区分，不能声称保留不存在的历史负向记录。现有工具级停用和新写入的站点停用均保留；损坏记录拒绝使用/覆盖。单工具最多保留 64 个站点例外。

右键菜单复用现有 Browser Host，从已安装包声明计算默认状态，设置存于原浏览器授权记录的 `contextMenu` 子项；不改写同记录中的 Cookie/完整书签授权。明确关闭的动作、精确 Origin 例外及升级中断后的限制继续生效。Side Panel 从 Host 读取可用状态，已有 Chrome 菜单权限时不重复申请。

运行仍检查真实安装及 capability、包身份/代际、Chrome 权限、当前活动文档和回包；停用、导航、卸载或撤权必须让旧请求失效。设置显示“恢复 / 停用当前网站”及“已停用的网站”，不再要求用户找到隐藏的“授权”才能完成第一次操作。组件测试不等于当前 Chrome 已加载新框架。

**运行时单一事实来源**：Sidebar Tool 的安装记录为 `SIDEBAR_TOOL_STORE`，停用覆盖为 `SIDEBAR_TOOL_ENABLE_STORE`；默认缺失停用记录即处于可用状态，损坏记录则拒绝。阅读目录由 `src/entrypoints/page-relay.js` 的固定 Content Script 和 `src/reading-toc/page.js` 的存储变更监听启动，安装写入后无需宿主额外启用 RPC。对安装前已打开的网页，可信 Service Worker 在核实官方包内容、来源与 Chrome 网站访问后，仅补注入内置 `agents/page-relay.js`；Content Script 使用文档级单例避免重复目录。被 Chrome 拒绝或其他受限标签页不绕过权限，仍须提示用户刷新网页或恢复网站访问；不能假称已注入。手动停用、升级、卸载、站点例外、SPA/BFCache 和权限撤销必须继续沿原有 Host/Authority 的身份校验和回收规则执行。

**交互文案合同**：阅读目录显示“安装后自动显示目录”“停用/恢复”，Side Panel 的“打开”解释为“查看侧栏目录”。Sidebar 应用显示“安装后可打开”，不要把可打开状态误报为后台代码已执行；Installed Page 显示安装/自动运行/受限实际状态。不要新增通用确认模态框、权限存储副本或第二套安装器。新扩展先按类型与权限评审，不能通过更改名称、工具 ID、CSS 或前缀绕过受信运行资格。

**验收**：官方阅读目录首次安装后在已有 Content Script 的普通网页立即可读取目录，且 `permissions.request=0`、无需写入“启用=true”；主动停用的网站不出现；恢复后自动出现；Side Panel 未打开仍可索引；Chrome 限权/受限网页正确失败；第三方 TOC 不继承官方自动注入资格；剪藏/知识保存按自身已安装 capability 默认可用；显式停用的旧安装更新后仍停用。相关 Node 测试属于组件证据，Mac Chrome 仍需独立验证。


### Extension Lifecycle R1.1：已安装工具的权限与运行类型审计

以下结论来自正式源码声明与现有准入通道，仅表示**源码审计结果**；不把工具已声明能力等同于 Chrome 原生验收 PASS。安装与运行是两回事，默认“可用”不代表自动执行具有副作用的操作。

| 工具 / 类型 | 正常安装后行为 | 自动网页运行 | 必须保留的独立权限 / 用户动作 | 依据与 R1.1 结果 |
| --- | --- | --- | --- | --- |
| 阅读目录 / 可信网页 UI | 官方 1.0.8 核验通过后安装即用，现有标签页补注入 | 是：合法页面、未停用且 Chrome 允许时 | 官方包固定 SHA、市场来源、停用与 Chrome Site Access | `src/reading-toc/policy.js`、`page.js`、`src/sidebar-tools/official-reading-toc.js`；已修复 ID 冒用 |
| Prompt Shortcuts / Sidebar + 固定页面 UI | 可直接打开，已批准站点展示快捷入口 | 是：仅原已批准规则 | 第三方网站范围与右键菜单权限，使用文本仍由用户点击 | `examples/sidebar-tools/prompt-shortcuts/trusted/page.js`、`tool.config.json`；未见可直接删除的额外安装授权 |
| ChatGPT Mind Map / Page Program | 固定版本/ChatGPT 范围获准后可使用 | 已安装且启用的固定程序按网页规则运行；导图开关由用户操作 | Installed Page identity、网页规则、Chrome User Scripts | `examples/programs/chatgpt-mindmap/`、`src/scripting/user-scripts/installed-programs.js`；沿用原有授权 |
| Cookie Editor / Sidebar Tool | 预装后可直接打开编辑界面 | 否 | Cookie 值读取/写入/清理与浏览器网站权限，危险删除仍由用户确认 | `examples/sidebar-tools/cookie-editor/tool.config.json`；不可因预装默认读取全部 Cookie |
| Bookmark Manager / Sidebar Tool | 安装后可打开书签管理 | 否 | Chrome Bookmarks 原生许可及写操作 | `examples/sidebar-tools/bookmark-manager/tool.config.json`、`src/platform/chrome/permission-gate.js`；保留按需检查 |
| AdBlock / Sidebar Tool + Trusted Service | 安装后可打开并配置过滤规则 | 不以普通安装替代用户启用拦截 | DNR / 敏感规则及配置生命周期 | `examples/sidebar-tools/adblock/tool.config.json`、`trusted/lifecycle.js`；不自动撤销敏感确认 |
| Quick Notes / Sidebar Tool | 预装后立即可打开笔记 | 否 | Storage 与用户主动打开 Task | `examples/sidebar-tools/quick-notes/tool.config.json`；不增加启用步骤 |
| Knowledge Inbox / Sidebar Tool | 安装后可打开收集界面，支持的 ChatGPT 网站显示保存入口 | 固定入口显示，点击才保存 | 安装审阅中的 `page.capture`、`knowledge.store`，Chrome 访问及站点停用例外 | `examples/sidebar-tools/knowledge-inbox/tool.config.json`；保留原固定网站和正文读取边界 |
| Time Review / Trusted UI | 首次安装默认希望记录；网站范围与 Chrome `idle` 单独批准后自动开始，安装本身不触发采集 | 两项授权满足后；尊重主动暂停 | 明确网站采集范围、Chrome `idle`；撤销、停用后立即停止 | `examples/sidebar-tools/time-review/trusted/service.js` 与原可信 Host；保留独立授权、安装代际及撤权保护 |
| Stay Focus / Trusted Service | 安装后可配置限制 | 不因安装自动创建限制规则 | 规则启用、阻断与可恢复控制 | `examples/sidebar-tools/stay-focus/tool.config.json`、`src/stay-focus/lifecycle.js` |
| AI VIP Share / Sidebar + Proxy | 安装后可打开代理配置 | 否 | `browser.proxy.managed`、`network`、目标站点与明确代理启用 | `examples/sidebar-tools/ai-vip-share/tool.config.json`；不自动切换代理 |
| 其他官方工具 / Sidebar | Markdown Workbench、Web Markdown Clipper 按需安装后可打开；剪藏直接提取 | 剪藏仍由点击触发 | 安装批准的基础能力、Chrome 网站访问及站点停用例外；导出由用户动作触发 | `official-tools/catalog.json` 和各自 `tool.config.json` |
| Page Program / Task / Workflow | 已保存、已安装或已批准才具有运行资格 | 仅固定 Page Program 在匹配范围自动运行 | Task/Workflow 的 Run 或既有定时触发；不可由安装自动执行 | `src/scripting/user-scripts/page-install-authorization.js`、`src/ui/installed-page-tools.js` |

**历史 R1.1 处置**：当时只修复证实的官方 TOC 默认准入漏洞、现有标签页注入缺失、重复脚本实例、Chrome 访问失效与 Side Panel 身份校验。2026-10-21 的基础能力一次审阅规则补充了剪藏、知识保存和声明式菜单的默认准入；敏感授权和用户主动停用仍保留。以上源码结论不代表各工具已有当前候选的原生验收。

### 1. 浏览器层声明（唯一入口：根目录 `manifest.json`）

| 层级 | 权限 | 生效方式 |
| --- | --- | --- |
| 默认全网站 | `host_permissions: ["<all_urls>"]` | 安装或更新时由 Chrome 请求；此后仍可被用户限制网站访问 |
| 默认核心 API | `storage`、`scripting`、`sidePanel`、`activeTab`、`downloads`、`tabs`、`webNavigation`、`userScripts`、`cookies`、`notifications` | 当前框架实际使用的原生 API；安装时统一声明 |
| 后续插件可选 API | `bookmarks`、`history`、`contextMenus`、`clipboardRead`、`clipboardWrite`、`tabGroups`、`webRequest`、`declarativeNetRequestWithHostAccess`、`nativeMessaging` | 只声明可申请范围；必须在对应插件激活时由可信 UI 手势申请，不会默认授权 |
| 高敏／不可选或未接线 | `debugger`、`proxy`、`management` 等 | 不预授权；需求落地时独立审计与升级清单。尤其 `debugger`、`proxy` 不能放进 Chrome 的 `optional_permissions` |

`src/platform/chrome/permission-gate.js` 是命名权限及全站 pattern 的代码合同；`scripts/verify-package.mjs` 检查根清单完全一致，避免只修改源码而实际打包退化。默认全站并不自动注入内容脚本，也不扩大 `web_accessible_resources` 列表。

### 2. 如何给后续插件接入权限

1. **开发阶段**：先在 `OPTIONAL_PLUGIN_API_PERMISSIONS` 及 `manifest.json` 添加（若已经列明则无需修改），验证该 Chrome API 在 MV3 可选、支持的版本及真实用途；未列明则绝不可私自调用 `permissions.request`。如属不可选权限，须更新正式清单并进行专项审计。
2. **激活时**：仅在扩展可信 UI 的真实点击回调里同步调用 `requestOptionalPluginPermissions({api: chrome, event, permissions: ['bookmarks']})`；不得先 `await`、从 Service Worker 或普通网页自动弹授权。拒绝时提示明确的降级行为，不保存「已授权=true」作为权限凭证。
3. **每次敏感操作前**：调用 `requireOptionalPluginPermissions({api: chrome, permissions: ['bookmarks']})`，并重新核对执行文档、所需网站（`chrome.permissions.contains({origins: [...]})`）及 OpenDesk 自身的 Task/SDK/RunHost 授权；按需要在产生副作用后再次核验。监听 `permissions.onRemoved` 撤销正在使用的模块授权。
4. **运行环境**：只有受信任的扩展 UI / Service Worker / Broker 使用 `chrome.*`；不把其对象交给 USER_SCRIPT、Controller 草稿、远程 JS 或页面端。插件需通过现有 Broker 明确暴露、校验参数、文档身份、来源与能力，按模块接线。清单声明不是插件 API 已实现的证明。

**例子**：已有手工 Controller 和独立网页 SDK 的宿主 HTTP 请求依各自合同经过 Network Service；Installed Task v1 目前只获 `page.automation`，不能继承这些宿主 HTTP、Cookie、存储或 Native 权限。`host_permissions` 全站不使普通网页的 `fetch` 绕过 CORS；获准执行的 DOM 脚本仍可以使用网页本身具有的数据和网络能力。Native Messaging 的声明也不会自动安装 Native Host 或开放任意 IPC 调用。

### 3. Sidebar 与浏览器限制

Sidebar 当前有「我的／发现／工作流／开发／工具」五个主页签。Chrome 确认全站访问受限时，各视图共用一行「访问受限／恢复全部网站访问」；它与开发区高级设置中的完整「网站权限」面板复用同一状态与恢复动作。未知或仍在读取的状态不会自动申请权限。已获得网站访问时，不因可选能力或 Cookie／通知状态而重复申请网站权限。

普通 Controller、本地项目、Task Run 与 Page Preview／Verify／Enable 只检查已有权限；缺权即停止。用户明确点击恢复，或到 Chrome 扩展详情调整网站访问后，再自行运行；恢复不自动续跑失败任务。已暂停的 Page 安装在原脚本管理面板点「恢复访问」，核对同一安装身份后恢复，当前文档不自动重放。实现及原始验收范围见 [安装一次授权 R3.1](../../framework/workstreams/install-once-authorization-r31.md)。

`<all_urls>` **不是绕过所有网站防线**：Chrome 内部页、Chrome Web Store 等受限来源依然不可访问；`file://` 需用户在扩展详情单独启用，隐身仍由本扩展 `incognito: not_allowed` 禁用；Chrome 138+ 的 “Allow User Scripts” 开关也必须手动打开。网站撤权、新安装、换 Profile 或清除配置后均以实时 Chrome 授权状态为准。

**发布注意**：安装时申请全部网站权限与 Cookie 等敏感 API 会增加用户警告并可能触发版本升级再同意；面向 Chrome Web Store 发布前需提供真实功能说明及隐私说明，避免声称无需任何用户确认。若未来产品面向公共分发，应单独评估最小权限发布配置，不得直接继承开发者权限扩张。

## 工具站点设置的统一交互规则（2026-10-11）

- **一次用户动作只确认一次**：可信宿主的“可用／不可用”“授权此网站／撤销此网站”开关本身即是用户意愿，不再叠加 `window.confirm` 或 `globalThis.confirm`。覆盖阅读目录、网页剪藏、知识收件箱，也适用于后续沿用该通道的本地工具。页面加载、恢复配置或切换标签页不可自动新增授权。
- **权限边界绝不省略**：基础能力按安装批准默认可用，以独立 Origin 保存主动停用例外；敏感能力保留独立授权。复核安装包身份、能力、当前文档、现有 Web Lock、后台执行时的 Chrome 网站访问及撤权状态。不得绕过 `chrome.permissions.request` 所需的原生提示，也不可把应用级开关当作浏览器级新权限。
- **风险操作例外**：卸载并删除本机数据、丢弃未保存编辑、跨来源替换工具、增加敏感能力等仍需明确审阅／必要确认；普通开关、显示与隐藏、撤销历史站点不应反复出现 JavaScript 模态框。
- **统一控件密度**：并列状态按钮采用 Side Panel 常规按钮规模（约 34px 最小高度、12px 文本、按内容宽度），不能用两块大面积 50% 宽的授权按钮；保持键盘焦点、`aria-pressed`、禁用状态、当前目标来源说明。未知网页目标时只提供准确的行内状态，不误判“用户没打开普通网页”。
- **定向回归**：覆盖首次直接使用、用户停用/恢复、无额外 JS 对话、锁与站点隔离。宽度和缩放专项只在当前任务明确要求时执行。Chrome 原生提示、撤权和失败降级需独立真实验收。

## 非弹窗交互统一规范（2026-10-11，R50）

- OpenDesk 自有 UI **不再调用**浏览器 JavaScript 模态框 `alert()`、`confirm()`、`prompt()`，也不因工具内的普通设置反复弹窗；阅读目录、网页剪藏、知识收件箱的精确网站开关点击即提交应用级选择。
- 卸载并清理本地数据、放弃未保存编辑等不可逆操作使用**当前页面内**的确认区域，显示准确后果与继续/取消。取消保留原数据；确认时重新核对安装身份、当前工具实例和持久存储锁。工具升级、来源替换在**已有安装审阅页**完整说明风险，明确确认一次后不再额外询问。
- 工具沙箱拦截导入脚本直接调用的 `alert` / `confirm` / `prompt` / `open` / `print`，返回保守结果（confirm 为 false、prompt/open 为 null），将提示留在受限工具界面。该交互限制不替代可信宿主的能力/消息/站点授权；也不是对恶意 JS 的浏览器级沙箱证明。
- 禁用 OpenDesk 两个工具视图的 `beforeunload` JavaScript 离开确认，以免浏览器弹出离开警告。**局限**：用户直接关闭浏览器页时，尚未持久保存的第三方工具编辑内容无法保证恢复；工具应尽量自动保存，用户仍需先保存重要草稿。内部切换通过非模态确认保留防误删体验。
- **例外不是应用自己的弹窗**：`chrome.permissions.request` 的 Chrome 原生权限申请、用户明确点击导入文件的系统文件选择器，以及浏览器自身的安全提示不能由扩展静默关闭或假装已授权。新权限仍需真实用户手势；拒绝时停止并显示行内错误。
- 控件规范：站点可用/不可用为常规约 34px 的按钮，高度与文本尺寸保持一致，不使用 45px 填满半行的授权卡片。未能绑定目标网页时提供明确行内提示。
- 不通过对第三方网页注入 `window.alert` 等全局改写来消除目标网站自身对话框；这会破坏网站代码并扩大权限边界。

## 验收门槛

- 静态与组件：`npm run check`、`node --test tests/environment/site-access.test.mjs tests/environment/permission-gate.test.mjs`、`npm run build`、`npm run build:dev`、`npm run verify`、`npm test`。
- 实际 Chrome 新建 Profile：安装当前打包扩展，确认新权限提示，`chrome.permissions.getAll()` 包含默认全网站与核心 API；在多个独立 HTTP(S) 网站运行同一任务不重复提示网站授权。
- 撤权测试：将网站访问改为仅点击／特定网站，确认 UI 变更且执行受阻，恢复授予后方可运行；重新启动验证。额外插件权限的拒绝、撤销、重启也必须测试。
- 不可替代边界：Chrome User Scripts 开关、禁用网站、Native Host 缺失、CORS 与 SDK/RunHost 应用授权均应继续被拒绝，不得因清单扩权变成成功。
- 组件测试不等于真实 Chrome。无法从当前环境启动原生浏览器时记录为 `CHROME_NATIVE_NOT_TESTED`，不能伪造 PASS。

日常开发使用 `npm run dev` 持续更新固定的 `dist/development`，复用已有服务并核对客户端连接；不反复静态构建或更换加载目录。原生正式验收继续使用新建隔离 Profile，绝不采用开发 Profile 的已授权状态充当首装证据。
