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

<a id="developer-permission-defaults-20261115"></a>

## 开发工作台默认预选（2026-11-15，默认值已实施）

用户最新要求：方便新用户开发、减少点选与事后排障，开发权限应尽量全选。**当前已支持的 SDK 服务全部默认预选，独立脚本 Cookie 选项也默认勾选；预选仍是待批准输入，只有原授权链校验及回执一致后才能显示实际新增授权。** 此决定覆盖此前“五项基础服务预选、持久存储/通知/ID/Cookie 单独勾选”的方案。既有自动同源 HTTP 策略继续有效，普通 Controller / Page / React / Vue 运行不以进入 SDK 管理、批准 SDK 为前提。本节只调整可信开发工作台的输入与引导，不调整 manifest、自动策略、安装权限或网页/工具的执行世界。

### 默认值与理由（本表是唯一默认策略）

| 选项/能力 | 新 SDK 授权草稿默认值 | 范围与理由 |
| --- | --- | --- |
| HTTP 网络请求 `network` | 勾选 | 常用开发服务；额外目标默认空白，仅精确同源。包含原已准入的读写 HTTP 方法，不标成“只读”；无 Cookie、重定向及目标校验沿原驱动 |
| 浏览器会话存储 `storage.session` | 勾选 | 支持临时调试数据读写；仍受原 SDK principal/命名空间、预算与授权限制，不表示可读任意网页或扩展的存储 |
| 受限调试日志 `service.log`、时间 `service.time`、内置资源 `resources.packaged` | 勾选 | 复用已准入的基础调试服务；不新增日志捕获、远程资源、文件或 Native 访问，原固定资源清单与完整性检查保留 |
| 持久存储 `storage.persistent` | 勾选 | 减少保存配置时才发现缺权限；集中审阅说明可读写、删除和清空，授权属于整个网页文档，同页第三方 JS 也可能调用 |
| 通知 `notifications` | 勾选 | 减少首次通知失败；原 Chrome 权限仍实时检查，预选/批准本身不发送通知 |
| 稳定应用 ID `device.id` | 勾选 | 减少依赖此项的开发漏配；审阅说明是稳定应用标识，不将其描述为硬件设备 ID |
| 外部网络信息 `network.info` | 不勾选且禁用 | 当前未启用，不能通过预选造成可用假象 |
| 脚本 Cookie 访问 `script-allow-cookies` | 勾选 | 仅在原本支持此选项的 Controller/本地开发运行预检中生效，仍归原脚本/Chrome 权限链；不加入 SDK grant、不自动读取 Cookie、不向 MAIN SDK 传递登录态、不改变已安装任务/工具权限 |
| 其他能力/未来新增项 | 不勾选 | 默认集使用上述明确白名单与当前 Registry 的交集，禁止按“全部可用项”推导；仅有 UI label 的 `network.localRelay` 不构成已准入服务 |

SDK 默认预选共八项：`network`、`storage.session`、`storage.persistent`、`notifications`、`device.id`、`service.log`、`service.time`、`resources.packaged`，加上独立 Cookie checkbox 默认勾选。适用范围是当前开发工作台的新草稿，不替代原安装/升级审阅，不强制改写用户已经取消的项。未实现、未准入及未来未经审定能力保持未选；不把目标 Origin 自动改为全网，不新增绕过校验的开发开关。

### 新用户主流程与最少操作

- 普通示例：选择可用目标 → 编辑或使用已有示例 → Run → 看结果；网站/依赖/执行能力已有合法许可时，不要求先进入诊断、逐项勾选或额外“启用”。
- 确需网页 SDK 服务：新草稿采用全部可用服务预选，优先只读定位当前可运行网页及主文档，用户可更换；一次集中展示用途、网页范围和可修改的服务，明确批准后复用原真实回执。精确 document/原始 capability key 放可展开技术详情，不能成为要求新用户手填的字段。
- 当前有效授权覆盖所需范围时直接复用；只读查询核对后，不要求重复批准或重新安装 SDK。权限已撤销、精确文档变化或范围扩大时，按原 Authority 重新审阅；不将开发便利做成永久全站 grant。
- 缺权限应在当前编辑/运行状态旁给出人话原因和原合法“恢复访问/审阅权限”入口，自动带入可验证的目标/缺项，避免让用户自己去诊断页查勾选框。恢复成功显示“已恢复，可以运行”并回到原操作，保留源码/参数/选择；Run/Preview 仍只读检查权限，不暗中弹授权、不自动重跑已提交或未知操作。
- 只根据原权限查询、受信项目声明或确切错误事实引导；任意 JS 可能动态调用服务，不承诺静态分析能提前识别全部需求。无可验证范围时保留草稿并说明需要选择的具体目标，不猜全网范围。

### 草稿、真实授权与生命周期

1. 新的精确文档授权草稿采用表中默认值。当前 owner 内打开/关闭诊断、返回编辑或刷新相同文档列表，不覆盖用户修改，包括主动全部取消；不将默认集写到全局 `createDeveloperView` 的 checkbox 初值。
2. 更换网页或精确 document 后，新草稿按八项默认集重新准备，不携带前文档手填目标、个别修改或实际 grant；同 URL 的新 document 也重新绑定。跨重启持久化预选、本地项目自动推断权限不属于本轮。
3. 既有本地 HTTP 实验页预填继续只识别 `sdkHttpLabPreset` 的精确入口；增加基础预选后须修正旧“零个已选项”触发条件，避免实验页失去原预填。只对未编辑的新草稿生效；离开实验文档清除该自动目标，用户主动取消或改写后不反复覆盖。不得新增实验 Origin、端口、路径或迁移到任意回环/局域网页。
4. 选择区标明“本次申请，尚未批准”；真实授权由原只读查询/回执单独显示，至少区分自动基础范围、待批准、已确认快照、已失效及未知。查询不改勾选草稿，勾选不伪造已授权状态。既有授权不会因打开页面、预选或取消勾选而被修改。
5. 批准前显示原精确 tab/frame/document、来源、服务及完整目标；明确提交的是替换快照，不与旧范围静默合并。已查询到有效旧范围时展示新增/移除差异；未知时说明当前范围未确认，保留只读查询入口。更新拒绝不能声称旧授权已撤销或已扩大。
6. 实际批准仍由原可信点击直接交给 `createSdkApproval.approve`；Chrome 许可、当前文档复验和 Authority 回执检查保持。撤权、导航、关闭、原后台恢复约束及 Unknown 不重放继续按前文执行；撤销后不会因默认项仍勾选而自动恢复授权。

### 本次实施与文案决定

`develop-host-controls.js` 已实施八项默认集、同文档草稿保留、跨文档隔离及原实验页预填；Cookie 仅在自身字段设置默认值。HTTP checkbox 简化为“HTTP 网络请求”，日志、时间和内置资源使用中文标签；统一说明“勾选仍需批准”，网络设置与原批准摘要展示访问范围。重复的“仅本次精确批准的来源与目标”不放在 checkbox 标签里，但原精确 Origin、document 与 Authority 校验继续保留。同源自动可用、额外跨站明确批准的分层不变，不以全选代表全网代理。

网页选择已复用本窗口的 `currentPageTarget` 默认准备主文档，标题/地址直接可读，手动更换网页/子框架收进折叠区；手选固定目标，“使用当前网页”恢复跟随。刷新采用具名图标按钮，只读重查并保留同文档草稿。默认跟随不绕过精确文档核对，不在当前网页不可用时选择其他窗口或实验页，也不提交授权。具体交互和完成条件归[开发目标12.5](../../framework/developer-ui-ux-r1-20261114.zh-CN.md#developer-sdk-page-target-20261115)。

工作台目标、文件归属与实施顺序见[开发目标第 12 节](../../framework/developer-ui-ux-r1-20261114.zh-CN.md#developer-permission-defaults-20261115)，验证与未测项见[关键测试条件 P01–P15](../../framework/developer-ui-ux-r1-test-spec-20261114.zh-CN.md#developer-permission-defaults-tests-20261115)。本次交付默认值、草稿与标签；更完整的新用户就近恢复、有效授权差异展示不在本增量完成声明内。真实新增授权、服务调用和原生撤销未执行，均为 **NOT_TESTED**。

## 反方审计与评分条件

- 权限提升：未授权页面或脚本直接调用 `chrome.*` / `GM_*` / Host RPC，应 Fail Closed。
- 主体伪造：错误 Host、tab/frame/document、过期授权实例、附加任意参数均须拒绝。
- 权限撤销：原实例在途效果、后台重启、站点撤权、失效目标 origin 不能成功继续授权或复活；旧撤销不能影响新授权。
- 用户状态：查询不能弹原生授权；只有 Authority 回执一致方显示成功；权限移除或选择变动时清除当前有效快照。
- 证据：`node --test tests/framework/k2-sdk-target-authority.test.mjs tests/framework/k2-sdk-ui-approval.test.mjs`；扩展全量 `npm run check && npm test && npm run build:dev`；独立新 Chrome Profile 下进行真实点击和导航/撤权/重启验证。

加权评分标准：权限隔离 30，授权与撤销 20，最小权限 15，交互准确性 15，恢复可靠性 10，回归证据 10。95/100 是**验收目标**，不是未执行测试前的事实。Host 越权、旧授权复活、UI 虚假显示成功、缺失 Chrome 原生复验属于否决项。独立安全审核需要在最终同一候选 SHA 上给分。
