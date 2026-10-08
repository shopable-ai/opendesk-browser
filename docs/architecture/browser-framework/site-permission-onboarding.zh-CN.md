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

**例子**：网页自动化任务的网络 HTTP 请求走已授权的宿主 Network Service，不能因为 `host_permissions` 是全站就让页面中的 `fetch` 绕过 CORS；Cookie 调用还需要任务/SDK 的单独许可。Native Messaging 的声明也不会自动安装 Native Host 或开放任意 IPC 调用。

### 3. Sidebar 与浏览器限制

Sidebar 保持「我的任务／发现／开发」三个主页签。开发区高级设置中的「网站权限」默认显示 Chrome 读取的实际状态；如果使用者在 Chrome 扩展详情限制为点击时或特定网站，可在明确点击后再次请求被保留的必需网站权限，或者前往扩展详情调整为“所有网站”。不在启动时自动弹窗、不在后台擅自恢复、无需再次勾选已列为核心必选的 Cookie／通知。

`<all_urls>` **不是绕过所有网站防线**：Chrome 内部页、Chrome Web Store 等受限来源依然不可访问；`file://` 需用户在扩展详情单独启用，隐身仍由本扩展 `incognito: not_allowed` 禁用；Chrome 138+ 的 “Allow User Scripts” 开关也必须手动打开。网站撤权、新安装、换 Profile 或清除配置后均以实时 Chrome 授权状态为准。

**发布注意**：安装时申请全部网站权限与 Cookie 等敏感 API 会增加用户警告并可能触发版本升级再同意；面向 Chrome Web Store 发布前需提供真实功能说明及隐私说明，避免声称无需任何用户确认。若未来产品面向公共分发，应单独评估最小权限发布配置，不得直接继承开发者权限扩张。

## 验收门槛

- 静态与组件：`npm run check`、`node --test tests/environment/site-access.test.mjs tests/environment/permission-gate.test.mjs`、`npm run build`、`npm run build:dev`、`npm run verify`、`npm test`。
- 实际 Chrome 新建 Profile：安装当前打包扩展，确认新权限提示，`chrome.permissions.getAll()` 包含默认全网站与核心 API；在多个独立 HTTP(S) 网站运行同一任务不重复提示网站授权。
- 撤权测试：将网站访问改为仅点击／特定网站，确认 UI 变更且执行受阻，恢复授予后方可运行；重新启动验证。额外插件权限的拒绝、撤销、重启也必须测试。
- 不可替代边界：Chrome User Scripts 开关、禁用网站、Native Host 缺失、CORS 与 SDK/RunHost 应用授权均应继续被拒绝，不得因清单扩权变成成功。
- 组件测试不等于真实 Chrome。无法从当前环境启动原生浏览器时记录为 `CHROME_NATIVE_NOT_TESTED`，不能伪造 PASS。

日常开发使用同一路径的 `npm run build:dev && npm run dev:chrome` 和稳定专用开发 Profile；原生正式验收继续使用新建隔离 Profile，绝不采用开发 Profile 的已授权状态充当首装证据。
