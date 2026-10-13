# Time Review R1.5 · 独立网站授权、可信 Host 合同与计时闭环

- 日期：2026-10-13。目标：`shopable-ai/opendesk-browser` 的唯一 `main`。
- 旧基线：`52dda3de00e9e8665339e261027cff9937c2639e`，[Mac 原生成功候选](https://github.com/shopable-ai/opendesk-browser/actions/runs/38348617459)；只复用旧身份，**不提升新包**。
- 审核时 GitHub main 持续有其他 Agent 在写 Global First / Scheduled Tasks，且不能进入用户个人 Mac 工作目录检查 `git status`。每个文件必须按原 Blob 核对并在当前 main HEAD 下条件式提交；无法证明安全时不得改写。用户本机工作区：`NOT_TESTED`。
- 执行范围：Time Review 自有政策、计时模型、Host 控制、Side Panel 工具桥、两个组件夹具、原生 Time Review 脚本、工具包、文档；保持其他 Agent 工作流不变。

## 功能树、用户场景与真实源码

```
Time Review · 已安装工具 (tool ID: time-review)
├── 官方目录 / 安装 / 升级 / 启停 / 卸载 [复用原有安装器]
│   ├── examples/sidebar-tools/time-review/tool.config.json (1.5.1)
│   ├── src/ui/sidebar-tools/installation.js 负责正式安装、撤权代际与卸载清理
│   └── src/ui/sidebar-tools.js 负责安装包身份和受信任工具详情
├── 单独网站采集同意 [R1.5 实施；新候选待验收]
│   ├── src/time-review/policy.js —— 严格 Origin、最多 64 项、显式全部、默认拒绝
│   ├── src/time-review/model.js —— v1 内可选 siteGrants，不丢老数据
│   ├── src/time-review/host-controls.js —— 真点击、当前网站确认、全部二次确认、逐项撤销
│   └── src/time-review/service.js —— 每个 checkpoint 同时查站点范围+Chrome权限
├── 活动统计 / 六分类 / 单行 Canvas V3 / 导出 [继承历史，回归待验]
│   ├── examples/sidebar-tools/time-review/src/{main.js,index.html,style.css}
│   ├── src/time-review/{model.js,service.js}
│   └── tests/environment/time-review-r12.test.mjs 等专项回归
├── 可信后台长期运行 [R1.5 新包待原生验收]
│   ├── src/sw.js → src/entrypoints/time-review-host.js
│   └── tabs/windows/idle/alarms/storage；关闭 UI 与 Service Worker 休眠后依旧有效
├── 可选云同步 [BLOCKED]
│   ├── src/time-review/sync-outbox.js —— 本机准备与重试数据模型
│   └── src/time-review/sync-transport.js —— 幂等 HTTPS PUT/ACK 适配，无生产激活
└── 独立 Stay Focus [OUT OF SCOPE：不做拦截、限制、重定向]
```

## R1.5 冻结行为与迁移

1. 主 Manifest 的 `<all_urls>` 和 `chrome.permissions.contains` 不能代表 Time Review 获得网站采集同意。原工具未安装或停用/卸载、安装代际/包摘要错配、单站点不在显式清单、idle 未授权/空闲、Chrome 失焦/隐身、Chrome 站点权限失效，都不能新建有效检查点。
2. 既有 `opendesk.time-review.v1` 保留原日汇总、分类、分钟明细、导出。新 `siteGrants` 默认 `{allSites:false,origins:[]}`；不迁移旧的扩展级网站权限为单工具同意。旧 checkpoint 无新 Origin 绑定不得计入新候选。
3. 可信 Side Panel 工具详情必须真实点击，沙箱只能请求打开设置；即使工具 JS 自行发送 `time.siteGrant` 也会被桥拒绝。指定站点仅精确 Origin，网页变更后确认作废；全部普通网页二次确认；单独撤权立即使该站点无法启动新计时检查点，所有站点撤权暂停。
4. `TIME_REVIEW_HOST_API = time.review/1.5.0` 为独立工具使用 Host 的简单协议声明，不引入第二套 SDK / Host。新工具前端检测到旧 Host 拒绝提供“开始”入口；更新包的摘要改变，原运行授权失效，必须由用户再明确开始。站点范围不会偷偷增加。
5. 记录口径是浏览器前台、原生 idle 为 active、特定 tab 当前显示且被观察到的“可验证网页前台活动时间”，不是目光注意/音视频实际观看时长。超过 45s 断档、时区/DST/会话不确定性不能自动计入。
6. 网站黑名单、每日娱乐时长限制、强制拦截、重定向属独立 Stay Focus，不放入 Time Review。

## 验收及证据等级

| 范围 | 可验证方式 | 本轮写入前 |
| --- | --- | --- |
| 工具 ID、固定可信 Host、原 v1 数据 | 主分支源码核查 | SOURCE_READ |
| 旧 R1.3 正向 Mac 原生 | 历史 Actions 38348617459 / 52dda3d | HISTORICAL_PASS_ONLY |
| R1.5 独立站点授权/撤权/更新/卸载 | 新 tests/environment/time-review-r15-site-grants.test.mjs 与真实 Mac Chrome | NOT_TESTED |
| R1.5 构建、包 SHA、SW 体积、包校验 | npm run build:sidebar-tool、check、build、build:dev、verify；工作流带 SHA | NOT_TESTED |
| 静态阅读/输入、长视频、后台音频、跨日/DST/Chrome 崩溃 | 同候选真实 Chrome 专项场景 | NOT_TESTED |
| 服务器身份/幂等 ACK/响应丢失后对账 | 正式生产服务的真 HTTPS 回执 | BLOCKED |
| 用户自己 Mac 本地工作区状态和 Chrome Profile | Mac 本机访问才可判定 | NOT_TESTED |

建议依影响范围定向执行的回归命令：
```bash
node --test tests/environment/time-review-r12.test.mjs tests/environment/time-review-r13.test.mjs tests/environment/time-review-r13-service.test.mjs tests/environment/time-review-r13-consent.test.mjs tests/environment/time-review-host-controls-r51.test.mjs tests/environment/time-review-r14-sync-outbox.test.mjs tests/environment/time-review-r15-site-grants.test.mjs
npm run build:sidebar-tool -- examples/sidebar-tools/time-review
npm run check
npm run build
npm run build:dev
npm run verify
```

原生 Mac 工具安装、真实 Side Panel、网站范围单独批准、真实活动、停用/撤权、SW/Chrome 重启、升级/卸载和窄视口需绑定**新源码 SHA、工具包 SHA、SW 哈希、原始 Case 证据**后标记 PASS。不能仅凭旧候选或自动构建过关而声称 R1.5 八维度都达到 95/100；缺证据的维度一律 `NOT_SCORED`。

## 云同步阻塞与解除条件

旧 `https://api.todo6.com` 仅历史接口文档存在；未见可证明生产原子 upsert、稳定幂等 record revision、有效账号连接/作用域及实际数据对账的凭据和 ACK。故本版本仍 **LOCAL_ONLY / NO_UPLOAD / BLOCKED**。不能从 `sync-outbox` 和 `sync-transport` 源文件存在推断云同步上线。完成用户登录、额外上传授权、账号切换隔离、撤销/删除与服务端对账后再单独启用。

## R1.5 后续修复：原生 CI 卡在工具宿主体积硬上限

- 候选 `95d4d29f6af2a2abc50bbe85e06ab1fdcc259fed` 的 [macOS CI 38357310430](https://github.com/shopable-ai/opendesk-browser/actions/runs/38357310430) 结论 **FAIL**（保留失败记录）；Node 74/74 PASS，正式工具包构建 PASS，但生产 WXT `ui/tool-shell.js` 为 **527585 B > 524288 B**，所以 Chrome 原生阶段 **NOT_TESTED**，不能当成 Chrome 行为回归失败或通过。
- 修复设计：不调整 512 KiB 硬门槛、不允许动态 import 绕过自包含 WXT IIFE。把 Time Review 可信操作按钮和确认面板的**静态标记**直接移入现有 `src/ui/tool.html` 的工具设置区；`src/time-review/host-controls.js` 仅负责真实点击、Chrome 空闲权限、Origin 审阅、受限 Host 调用和安全渲染。原工具 UI 沙箱仍不可调用网站授权。
- UI 权责：通用“TOC/Clip/Capture 网站授权”只对真的声明这类能力的工具可见；Time Review 与 Stay Focus 使用各自的独立授权控制，禁止显示“此工具不需要网站授权”的误导性状态。
- 回归：更新 R5.1 / R1.3 / R1.5 组件夹具，直接校验所有静态受信任控件 ID；带真实事件 `isTrusted` 的接口测试保持拒绝伪造权限、跨 Origin 审阅状态失效、取消确认不会改变范围。之后按新 SHA 重跑 Node、工具包构建和 WXT 检查；即使构建通过也不升级旧浏览器 PASS。

## CI 定向回归发现：旧通用工具测试夹具未包含预编译控件

- d888903 的 [Sidebar user tools CI 38360670244](https://github.com/shopable-ai/opendesk-browser/actions/runs/38360670244) **FAIL：117 PASS、70 FAIL**，失败均出现在共享假宿主初始化，提示 `Time Review trusted controls are missing`，未进入实际业务行为测试。已归因：`tests/environment/sidebar-tools-host.test.mjs` 仍假设工具设置动态生成，没有实例化 `tool.html` 的静态授权 ID。
- 修复必须同时保留生产安全：`host-controls.js` 允许与 Time Review 无关的轻量宿主夹具没有该控件，但当实际选择已授权的 Time Review 时，缺静态控件仍抛出并**拒绝受信任权限动作**；共享测试夹具显式加入静态 ID，新增负向测试确保不能以“安全降级”隐藏缺失。
- 修复后按新 SHA 做隔离回归；Mac 原生和包大小不能因以上原因提前标记 PASS。

## 生命周期收窄及原生证据补验（候选待实际 CI）

- 发现安装列表变化时 `service.js` 先前对**全部** `SIDEBAR_TOOL_STORE` 改动一律触发 `invalidate({revoke:true})`，即使仅新增其他工具，也可能不合理地停止 Time Review；本轮收敛为当前 `time-review` 安装记录变化、该工具启停/代际变化或注册表损坏时才强制撤权，其他工具安装正常进行。
- 新增环境回归：一边正常计时，一边安装 `other-tool`，需继续保存真实网站时间；随后修改 `time-review` 固定包身份，则检查点立刻退休。此场景不允许仅凭其他工具的 R1/R2 生命周期结果替代。
- 原生 macOS 测试新增单独网站撤权链路：Chrome `idle` 权限保留的情况下，可信点击撤销 Time Review 网站范围；检查运行暂停和历史保留、没有网站同意时尝试开始被拒绝、再次逐站授权后明确重启。所有动作都应由真实 Side Panel 点击，不准直接预置 business storage。
- 最新实际提交/同 SHA 结果、工具包与 SW SHA 必须在 CI 后写入；本段只描述已改的测试合同，并非声称浏览器 PASS。


## R1.5.1 · 跨工具 Chrome 权限撤销的局部修正（2026-10-13）

- 源码缺口：`installTimeReviewService()` 先前把任意 `chrome.permissions.onRemoved.origins` 都当作 Time Review 整体撤权；例如另一个工具取消一个无关网站的 Chrome host 权限，也会清空 Time Review 已批准的运行身份。
- 修正：单个或多个 Chrome Origin 移除只令活动采样失效，并立即重新查询 Chrome 实际权限和当前网站；保留其他仍经用户独立同意的网站。只有 `idle` 权限移除才清除整个计时运行授权。当前网页站点的实际 Chrome 权限消失时，`observe()` 会拒绝新检查点，不可凭原主扩展的权限扩大网站授权。
- 新增 `time-review-r15-site-grants.test.mjs` 的回归用例，同时检查「撤销无关 Origin 仍允许已授权网站统计」和「撤销 idle 必须停用」。仓库事件处理做过合成回调与语法校验；**未在用户 Mac / 完整 Node 仓库环境执行**，本次环境证据级别为 `NOT_TESTED`，不可升级为原生 PASS。
- R1.5.1 的完整 UI 收敛、生产/开发构建及 macOS Chrome 证据仍为待补项；历史失败与队列中的 CI 不能冒充新候选通过。


## R1.5.1 · 可信原位开始、紧凑 UI（2026-10-13）

- 已实现源码：`src/ui/sidebar-tools.js` 将 Time Review iframe 的 `time.start` 请求改为 **Side Panel 受信任非模态确认条**。沙箱点击只创建待审请求，用户必须实际点击宿主「确认开始记录」才能调用既有 `runTrustedTimeReviewOperation`；已授予范围不再跳转工具设置，宿主重新验证已安装包、启用状态及撤权代际。
- 未批准网站或未授予 idle 时保持原位显示宿主拒绝原因；首次同意网站范围与 Chrome idle 权限仍由顶部「工具设置」的静态可信控件单独完成，不允许从 iframe 自动批准。首次未授权时还需要打开工具设置，**完整原位首次授权尚未完成**。
- Time Review 的真实安装工具 `src/index.html`、`src/main.js`、`src/style.css`（非原型）将暂停/恢复切换到内容页顶部图标栏，压缩重复标题和「历史数据保留」常显状态，状态在失焦、空闲、未授权时说明原因；工具卸载仍由通用宿主顶部操作栏负责。适配 320px 紧凑按钮且保留无障碍标签。
- 新增针对可信手势及 UI 标记的静态回归。尚未在用户 Mac 上取得 320/360/400/600px、200% 缩放截图、真实键盘/焦点或原生 Chrome 证据；这些门槛仍为 `NOT_TESTED`，不能宣称 UI 95+。

## R1.5.1 · 原位首次网站授权体验的保守收敛（2026-10-13）

- 当沙箱工具请求开始记录而网站范围或 Chrome idle 尚未批准时，Side Panel **只读取既有授权状态**，展开预编译的 `time-review-permission-settings`，不直接运行敏感操作。通过已有 `data-time-review-inline` 排序使授权卡位于统计 iframe 上方，且统计 iframe 不被隐藏或销毁。此模式仅适用于 Time Review；其他工具原有设置页保持不变。
- 网站范围仍需用户二次确认精确 Origin 或全部普通网站，idle 权限仍在可信 DOM 的原始 Chrome 用户手势中申请。已有权限时，工具内「开始记录」只弹出原位 Host 确认条；敏感操作不由不可信工具事件执行。成功开始后收起原位卡片，保留当前统计 iframe。
- 缺少真实 macOS Chrome 和 320/360/400/600px、200% 缩放同候选截图，`95/100 UI` 尚不能给出。CI 结果须绑定本次提交 SHA 后再判断；仓库源码级检查不等于原生验收。

- 无障碍收敛：原位授权卡不只用 CSS `order` 提前显示，还在真实 DOM 中将既有可信 `settingsView` 移至 `frameRoot` 前，使键盘 Tab 顺序与视觉一致；收起时还原为 `retiredDraft` 后的默认位置。整个过程不移动或重新挂载 iframe，保护工具运行实例。原生键盘与屏幕阅读器验收仍 `NOT_TESTED`。


## R1.5.1 · 原生 macOS Chrome 测试更新（2026-10-13）

- 既有 `tests/framework/time-review-r13-native.test.mjs` 使用真实 CDP 鼠标点击内容页「开始记录」，验证首次没有网站范围时只展开原位可信授权卡：原 iframe 可见、授权卡实际 DOM 顺序与键盘焦点一致、存储仍未授权且计时未启动；截图名 `first-run-inline-time-review-consent.png`。
- 已启用后原位授权卡会自动收起。为保证此前真实暂停、恢复、网站撤权、idle 撤权、重启用例不误判交互，替换盲目切换设置按钮为幂等 `setTimeReviewSettingsVisible`，只在必要时发送真正 CDP 点击。没有替换 CDP 驱动、没有伪造浏览器或存储写入。
- 当前验证：源文件语法检查 `PASS`；真实 macOS Chrome 执行和同候选截图仍 `NOT_TESTED`，必须等待绑定提交 SHA 的工作流证据。

## R1.5.1 · 工具正式升级版本

- 源码工具版本从 `1.5.0` 升为 `1.5.1`，否则官方市场现有安装器的 `compareToolVersions` 会拒绝同版本内容更新；继续复用单一安装器、目录和清理事务。
- `TIME_REVIEW_HOST_API` 仍为 `time.review/1.5.0`，这与独立工具包发行版本不同。包 SHA 改变必须要求用户再点击可信开始；站点同意保持原有效范围，历史计时保留，禁止暗中扩大。
- 已增加 Node 合同断言版本与 Host API。实际升级旧 1.5.0→1.5.1 的真实 Chrome 流程仍需 macOS CI 另行证据，不得宣称 PASS。

## Time Review R1.5.2 · 原位启动后即时刷新与 iframe 解释（2026-10-13）

- 用户问题：`iframe` 是 Side Panel 中 `src/ui/sidebar-tools.js:mountTool` 创建的`sidebar-tools/sandbox.html` **沙箱内嵌内容区域**，不是另一个页面、插件或授权应用。可信外壳在 `src/ui/tool.html`，时间业务持续运行在已存在的 SW `src/time-review/service.js`，授权 UI 留在宿主的预编译 DOM；用户关闭 Side Panel 不等于停用计时。
- 缺陷：之前可信宿主开始／网站授权成功后，Time Review 内容页可能直到 15 秒轮询才更新暂停／记录状态。修复：成功的受信任操作只向同一沙箱实例发带 `instance/toolId` 的 `state-changed` UI 提示；`src/sidebar-tools/bridge.js` 校验发件者是直接父宿主和实例 ID 后投递内部事件；工具仅通过既有 `time.status` RPC 读取实际状态，**不传递原始记录、Token、授权或 Chrome API**。没有新增 Authority / 安装器 / 第二个 Time Review。
- 首次缺权限的 `E_TIME_PERMISSION_SETUP` 改为普通指引，不展示红色内部错误码。真正授权仍需要可信 DOM 上的真实 Chrome 用户点击。
- 因为已安装工具包的 JS 改变，发行 `time-review` 从 `1.5.1` 升级至 `1.5.2`，避免正式市场同版本覆盖；`TIME_REVIEW_HOST_API` 仍为 `time.review/1.5.0`。已有历史合法统计和用户独立网站范围保留，更新包必须再明确开始。
- 受影响测试：`time-review-host-controls-r51.test.mjs` 新静态信号安全合同、`time-review-r15-site-grants.test.mjs` 版本断言、现有 macOS 原生用例增加 8 秒内可见暂停按钮断言。真实 Mac Chrome、200% 缩放及新的同候选包 hashes 尚未通过，保留 `NOT_TESTED`。

## R1.5.2 · iframe 安全边界与官方原生 UI 简化决策（设计评审）

- 日期：2026-10-13。性质：**目标设计决策，不是已实施/已通过 Chrome 的宣称**。评审对象是 OpenDesk Browser 官方工具与用户/AI 动态工具共存的真实产品；用户反馈是 Time Review 的 iframe 造成重复设置、布局、可信点击桥的过度复杂性。
- 事实：当前 `manifest.json` 中 `cookies`、`tabs`、`storage`、`scripting`、`<all_urls>` 是**整个扩展**的权限，不是每个安装的 Side Panel 工具的权限；仅包装一层 `OpenDeskSDK`、ESM 闭包、Shadow DOM、Proxy、`event.isTrusted` 不能阻止进入可信扩展页面的任意脚本直接调用 `chrome.*`、干扰权限 DOM 或读取共享 Storage。Chrome MV3 扩展页严格 CSP 也不允许通过 `eval/new Function` 无需重建地执行随时安装的任意工具包 JS。
- **产品推荐的简化方向：固定且受审计的第一方官方工具 → 现有可信 Side Panel 直接挂载预编译组件；可由用户/AI 修改、导入、从市场获取的动态 HTML/CSS/JS 工具 → 沿用现有 opaque-origin sandbox iframe 和唯一 Tool/Browser SDK/Host。** 这只是运行位置差异，不是第二个安装器/Service Worker/Browser SDK/授权数据库。普通网页脚本继续优先采用 `chrome.userScripts` 的 USER_SCRIPT 隔离世界，不借用 Side Panel 的 iframe 思路直接注入特权扩展页。
- 当前 Time Review 1.5.2 的 iframe 隔离仍是**已实现的生产路径**。不能仅因为工具 ID=`time-review`、官方描述或能力=`time.review` 就执行已安装工具包里的 JS 于可信页；本机可导入同 ID 的其他来源包。若启用官方直接挂载，必须同时核对当前正式扩展**内置的静态编译组件身份**和既有官方发行目录的确定版 package SHA/安装来源/版本/启用状态/撤权代际；校验失败即不进入受信任组件，绝不自动提升为官方宿主能力。
- 最小实现位置：复用 `src/ui/sidebar-tools.js` 的现有安装工具选择、启停、卸载和权限 UI，以及已经固定的 `src/entrypoints/sidebar-tool-host.js` 构建边界；将 Time Review 可信 UI 静态预编译（模块闭包、局部样式或 Shadow DOM 仅为避免冲突），挂载到 `src/ui/tool.html` 既有工具内容区，直接调用同一个经身份验证的 `time.review/1.5.0` 后台 Host。不得在特权 DOM 执行包字段中的任意 `html/js/css`，不得动态 eval/import/CDN、改 MV3 CSP 或增加 Chrome 权限。后台 `src/time-review/service.js` 的计时、站点同意和持久化语义保持。
- **必须只有一份真实 Time Review 前端业务实现**：若从 `examples/sidebar-tools/time-review/src/*` 迁入预编译 UI，官方包、版本、升级和展示合同要一次同步收敛，不长期开两个随时分叉的可执行 UI，不制造二套运行模式切换页面。升级/卸载保留原工具身份、正式安装器与合法历史数据；任何转入可信执行的安装身份必须经过编译期批准及精确 SHA 约束，旧用户生成同名工具仍只能安全沙箱运行或明确拒绝，不允许继承新特权。
- 设计评估（**预计、未实测**）：`全部去掉 iframe 并直接执行动态工具` 高风险，不可进入正式候选；`全部保留 iframe` 安全且重用度高，但 Time Review UX/可维护性并非最简；`官方受控预编译组件原生渲染 + 动态工具既有 sandbox` 是最有潜力获得 ≥95/100 的方案，实际评分在 build、身份失败关闭、真实原位授权、卸载和 macOS Chrome 证据完成前保持 `NOT_SCORED`。
- 决策执行顺序：先确认官方可信 UI 可以在既定 WXT IIFE/512 KiB 约束下静态编译且不产生第二实现；随后仅迁 Time Review 一个工具，检查正确的 Chrome 权限请求用户手势、现有网站授权和收起/返回/焦点、停用撤权、跨工具隔离及安装更新；全部通过后才评估 Cookie Editor/Stay Focus 等其他第一方工具。若要突破硬预算、复制安装/Host 或破坏安全边界，直接停止迁移，继续保留当前透明 iframe 运行方式。
- 不采用 `package.json` 替代 `manifest.json` 的 Chrome 授权，更不能把扩展级 `<all_urls>` 推断为 Time Review 的采集同意。首次网站授权、可选 `idle` 和明确开始记录属于不同用户意图；官方可信 DOM 中可减少冗余跳页与重复确认，但不能绕过扩大权限的清晰授权。
