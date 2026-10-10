# OpenDesk Browser 默认全站访问与可扩展 API 权限（MV3）

## 定位与设计决策

OpenDesk Browser 是用户主动安装的浏览器自动化扩展。为减少每次切换网页时的授权中断，正式扩展从「首次运行再申请所有网站」调整为 **安装／更新时声明全站访问**。但 Chrome 不存在「所有命名 API 权限」通配符；它们必须逐项列明。Chrome 的权限授权也不代表 OpenDesk 的页面脚本或第三方任务获得了运行、Cookie 或网络调用权。

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

## 验收门槛

- 静态与组件：`npm run check`、`node --test tests/environment/site-access.test.mjs tests/environment/permission-gate.test.mjs`、`npm run build`、`npm run build:dev`、`npm run verify`、`npm test`。
- 实际 Chrome 新建 Profile：安装当前打包扩展，确认新权限提示，`chrome.permissions.getAll()` 包含默认全网站与核心 API；在多个独立 HTTP(S) 网站运行同一任务不重复提示网站授权。
- 撤权测试：将网站访问改为仅点击／特定网站，确认 UI 变更且执行受阻，恢复授予后方可运行；重新启动验证。额外插件权限的拒绝、撤销、重启也必须测试。
- 不可替代边界：Chrome User Scripts 开关、禁用网站、Native Host 缺失、CORS 与 SDK/RunHost 应用授权均应继续被拒绝，不得因清单扩权变成成功。
- 组件测试不等于真实 Chrome。无法从当前环境启动原生浏览器时记录为 `CHROME_NATIVE_NOT_TESTED`，不能伪造 PASS。

日常开发使用同一路径的 `npm run build:dev && npm run dev:chrome` 和稳定专用开发 Profile；原生正式验收继续使用新建隔离 Profile，绝不采用开发 Profile 的已授权状态充当首装证据。
