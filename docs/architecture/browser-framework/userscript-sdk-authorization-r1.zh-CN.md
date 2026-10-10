# 用户脚本、浏览器原生权限与独立网页 SDK：分层授权 R1

日期：2026-10-10。实现入口：`src/platform/host/sdk-methods.js`、`src/ui/sdk-approval.js`、`src/scripting/user-scripts/dependency-metadata.js`。

## 不允许合并的四个权限层

| 使用方 | 授权身份 | 允许 | 不允许继承 |
| --- | --- | --- | --- |
| 扩展本体 | `manifest.json` 和实时 Chrome Permissions | 已列明的受信任扩展 API | 任意第三方 JS 或 Page Script 不自动获得 `chrome.*` |
| 用户脚本（Page USER_SCRIPT） | 当前网站/文档 + 明确预览；或固定 sourceHash、依赖锁、`@match`、已安装启用版本 | 网页 DOM、自有 JavaScript | 不隐式获得 `GM_*`、Cookie、下载、跨站 HTTP Broker 或独立网页 SDK |
| Controller 任务 | Task / RunHost / 精确目标 + 任务级 Broker | 已准入的 ChromePage 与宿主服务 | 不替换 Host、跨文档重放或直接访问 Worker |
| 独立网页 SDK | `sdk:sourceOrigin`、精确 `tabId/frameId/documentId`、capabilities、allowedOrigins、grantIncarnation | 已批准文档的有限 Network / Storage / Notify 等 SDK 短服务 | 不成为永久站点授权、不代表某个用户脚本已获批 |

Chrome 已声明 `<all_urls>`、`cookies`、`downloads`，只表示扩展本体能在规则下调用这些 API，不代表普通用户脚本获得它们。

### 最重要的风险

**独立网页 SDK 安装到页面 MAIN world，授权主体是整个网页文档。** 同一页面中的第一方及第三方 JavaScript 都可能调用公开 SDK。USER_SCRIPT 虽有独立执行世界，但共享 DOM/事件接口不能用来证明一个调用来自某个获准的 JS 文件。不能把这个入口当作“脚本专属权限”使用。谨慎在不可信网页授予持久存储或跨站网络能力。

当前 `@grant none` 不能切换到 MAIN world，其他 `@grant GM_*` 和 `@connect` 会按 `E_GRANT_UNSUPPORTED` / `E_METADATA_UNSUPPORTED` 拒绝，不静默模拟；普通页面 `fetch` 仍受浏览器 CORS 制约。未来实现 `GM_*` 或 Page USER_SCRIPT 内可直接调用的 `axiosx`，应创建专门 Script Broker，principal 绑定 `programId/revision/sourceHash/dependencyLock/installationId/grantGeneration` 与精确当前 document、站点、能力及目标 Origin。版本升级只复用范围不变且确有原始授权的许可；新增范围必须经可信安装/升级界面批准，不能借用文档级 MAIN SDK grant，也不能自动获得 Cookie、Native 或扩展存储能力。

## 自动安装与固定默认 HTTP 范围（2026-10-10）

扩展通过 manifest 固定的两个 classic 脚本，在允许访问的 HTTP(S) 主文档及子 frame 的 ISOLATED relay 与 MAIN 网页世界自动提供 `window.OpenDeskSDK` / `window.axiosx`。网页无需反复进入高级诊断手工选择 document/安装。只安装 API 外观，页面加载**不触发 HTTP**；首次用户代码执行 API 时，SDK 才向后台进行 Hello。

Authority 仅对 Chrome 原生认证的 sender、精确 frame/document、已允许的站点生成默认 `network` 最小授权。普通网页自动范围只有它自己的精确同源 Origin；本地测试入口 `http://127.0.0.1:43111/demo-form.html` 与 43112 的同路径（主 frame）额外固定允许 `https://httpbingo.org` 和 `https://api.ipify.org`。这不是给任意网页分配跨域代理：其他跨站 Origin、存储、通知、Cookie、GM API 等继续需要可信扩展侧单独审核。底层 axiosx 仍走原 Authority → SDK Broker → 无 Cookie/禁止跟随重定向的受控网络驱动。

首次 Hello 与请求按真实原生权限和 document 检查；Worker 重启后自动重建的只可能是固定网络范围，不恢复额外权限。用户主动撤销的当前 document 或原生权限撤销不能由自动策略复活；已派发但未确认的 HTTP 绝不重放。网站原有的 `window.service` 等名字不能被 SDK 覆写，扩展至少要求 `OpenDeskSDK` / `axiosx` 不冲突。

## 独立网页 SDK 高级授权操作（自动安装无需执行这些步骤）

1. **高级扩权批准**：默认同源 axiosx 和本地固定测试范围无需逐页点击。只有当网页需要额外 Origin 或持久存储、通知等高级能力时，可信扩展 UI 才在必要且缺少原生权限的情况下由真实点击启动 `permissions.request`；复验原生权限、精确当前文档、能力/目标 Origin 和 Authority 回执后，才显示高级授权成功。**该授权面向整个 MAIN 网页 document，并非某一个用户脚本。**
2. **查询**：`inspectSdkGrant` 只在认证过的扩展 Tool Host 生效；核对实时文档、原生来源与目标权限、存储中的活动实例，返回 `present` 和 grantIncarnation；不申请新权限、不添加能力、不证明代码已注入或下一次调用仍有效。
3. **撤销**：`revokeSdkGrant` 只接收精确 `tabId/frameId/documentId/grantIncarnation`；Authority 先围栏化在途实例，再持久撤销并验证旧实例已非活动。并行新授权不被旧撤销误伤。
4. **未知态**：如果 RPC/回执丢失，则标记 Unknown，不自动重放或把旧快照显示为成功。查询与撤销都不会回滚之前网页、网络或存储副作用。
5. **失效**：文档导航、关闭、原生撤权继续受 `permissions.onRemoved`、epoch、session 与原有 Authority 控制；手工跨来源扩权的 Worker 重启恢复保留重新批准栅栏。只有内置固定最小网络范围可以重新建立，不恢复旧的高级权限，也不重复任何未知请求效果。

## 反方审计与评分条件

- 权限提升：未授权页面或脚本直接调用 `chrome.*` / `GM_*` / Host RPC，应 Fail Closed。
- 主体伪造：错误 Host、tab/frame/document、过期授权实例、附加任意参数均须拒绝。
- 权限撤销：原实例在途效果、后台重启、站点撤权、失效目标 origin 不能成功继续授权或复活；旧撤销不能影响新授权。
- 用户状态：查询不能弹原生授权；只有 Authority 回执一致方显示成功；权限移除或选择变动时清除当前有效快照。
- 证据：`node --test tests/framework/k2-sdk-target-authority.test.mjs tests/framework/k2-sdk-ui-approval.test.mjs`；扩展全量 `npm run check && npm test && npm run build:dev`；独立新 Chrome Profile 下进行真实点击和导航/撤权/重启验证。

加权评分标准：权限隔离 30，授权与撤销 20，最小权限 15，交互准确性 15，恢复可靠性 10，回归证据 10。95/100 是**验收目标**，不是未执行测试前的事实。Host 越权、旧授权复活、UI 虚假显示成功、缺失 Chrome 原生复验属于否决项。独立安全审核需要在最终同一候选 SHA 上给分。
