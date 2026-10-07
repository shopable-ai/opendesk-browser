# Legacy → Current → Target：按使用语义查迁移

> 先看 [用法与例子](README.md)，再查本表。此表是人工能力导航，不是第二份机器完成账本。
> 基线：Legacy `todo-user@0dc7b07959f762e5be8f2f3847a71dc8c4b16aa5`；Current 主线产品源码 `6214b5e9132f58cbe0402a34973b7ee38c851d53`；P1 候选 `38763c78209794bec53c8ca848bfa0789dc4796e`。

## 1. 阅读方法

同一名字不保证同一语义；同一按钮不保证同一执行器。先问“用户想完成什么”，再核对来源、调用者、目标、结果和实现。

决策：KEEP 保留明确语义；ADAPT 保留主要用途并明示兼容差异；REPLACE 替换机制；DROP 不提供旧危险/越界机制；DEFER 有明确触发条件的延期。DROP 某条旧执行通道不等于放弃“运行自动化”这个需求。

状态：IMPLEMENTED 为已查源码与关键接线；PARTIAL 为只有部分语义/链路；NOT_IMPLEMENTED 为已查范围内没有该入口；LEGACY_COMPAT_ONLY 为名称、拒绝或兼容形状；DESIGNED 为目标提议。所有状态都不代表本轮浏览器 PASS。

## 2. 脚本资产与运行入口

| Legacy | 原始语义 | Current | Target | 决策 | 状态 |
|---|---|---|---|---|---|
| 脚本管理 UI 的 content / params / 保存 | 保存可重复使用的脚本及参数 | script-editor + scriptHeads / scriptRevisions | 固定版本的脚本资产；保存与执行分离 | ADAPT | IMPLEMENTED；旧资产存储方式不同 |
| 脚本列表的“运行”按钮 | 选择程序并交某个运行环境执行 | 扩展 Script Editor → RunHost | 入口共用一次运行的准入与结果合同 | ADAPT | PARTIAL；旧精确消费者逐项核验 |
| 网页目标内的运行按钮 | 用户不离开业务页触发自动化 | 未在已查入口发现通用已保存 Controller 启动服务 | 脚本引用 + 固定版本 + 参数 + 可信授权，接现有运行管理 | ADAPT | DESIGNED；不是已实现 API |
| F12 / DevTools 调服务 | 在页面上下文调用已注入 SDK | OpenDeskSDK / 兼容 globals | SDK 安装和授权前提明确，不把 F12 当后台权限 | KEEP | IMPLEMENTED；运行前提不可省略 |
| executeScript / executeInBg（页面） | 请求后台执行控制代码 | Page SDK 明确拒绝原始脚本 | 保留启动需求，替换为受控已保存脚本入口 | REPLACE | LEGACY_COMPAT_ONLY；新页面启动入口 DESIGNED |
| CHROME_PAGE_EXECUTE | 传 raw script 给后台 | relay / SDK 拒绝 | 不恢复普通网页任意后台执行 | DROP | LEGACY_COMPAT_ONLY |
| executeScript（background） | wrapAsync 后 eval 控制程序 | RunHost / 受控 Controller Worker | 固定版本、可停止、有结果的一次运行 | REPLACE | IMPLEMENTED |
| 本机或 LAN /SCRIPT_RUN | 将程序送入本机/设备服务 | 不属于本轮 Browser 产品主链 | 有独立部署/认证/权限合同后再做外部适配 | DEFER | NOT_IMPLEMENTED 于 Browser 主链 |
| 服务端 script.run / Socket SCRIPT_RUN | 按设备或用户分发脚本 | 不属于当前 Browser 核心 | 独立远程执行授权与审计，不依赖旧账号协议 | DEFER | NOT_IMPLEMENTED 于 Browser 主链 |

旧消费者发现详见 [Legacy 场景 L4](legacy-src-bex-framework.md)。没有证据证明旧脚本一定保存在扩展本地，不能把 service.add/update 写成 chrome.storage 保存。

## 3. Automation API：操作目标网页

| Legacy | 原始语义 | Current | Target | 决策 | 状态 |
|---|---|---|---|---|---|
| page / ChromePage | 用页面对象组织自动化 | framework/ChromePage + context | 每运行固定身份与目标的 Page | ADAPT | IMPLEMENTED |
| global page | 后台共享 Page 实例 | 当前 run 的注入参数 | 不跨运行共享隐式目标 | REPLACE | IMPLEMENTED |
| active-tab target | 每次执行/回调选活动标签 | tab / frame / document 绑定 | 焦点变化不改变已准入目标 | REPLACE | IMPLEMENTED |
| title | 读 document.title | packaged registry title | 保留值，包括合法空字符串 | KEEP | IMPLEMENTED |
| content | 读 body.innerHTML | packaged registry content | 明示 body 内容，不假称完整 document HTML | KEEP | IMPLEMENTED |
| url | 读 location.href | packaged registry url | 固定目标的 URL | KEEP | IMPLEMENTED |
| goto / reload | 导航与刷新 | Controller authority + native driver | 准入、导航意图与可信文档交接 | ADAPT | IMPLEMENTED |
| $ / $$ | 返回解析出来的 DOM 快照 | trusted DOM host snapshot / Worker 限制 | 区分快照与 live handle；Worker 使用可序列化 snapshot | ADAPT | IMPLEMENTED；宿主限制 |
| ChromeElement | selector + page 的操作代理 | 文档绑定的 element facade | 导航后旧元素不能跟到新文档 | ADAPT | IMPLEMENTED |
| click | 派发合成鼠标事件 | packaged click | 保留已声明事件/返回语义，不宣称物理点击 | ADAPT | IMPLEMENTED |
| type | 逐字符追加值并发事件 | packaged type | 明示追加；不可编辑目标拒绝 | ADAPT | IMPLEMENTED |
| Keyboard | 向 document 发合成键事件 | bound Keyboard + packaged keyboard | 真实编辑/系统快捷键另列，不伪兼容 | ADAPT | IMPLEMENTED；受限行为 |
| waitFor / waitForTimeout / waitForSelector | 等待时间、元素或条件 | bound context / packaged waits | 有界等待、取消、文档绑定 | ADAPT | IMPLEMENTED |
| waitForFunction | 等待用户定义条件 | userScripts lane | 用户代码和固定包内操作分道 | ADAPT | IMPLEMENTED；需原生能力 |
| evaluate / $eval / $$eval | 在页面计算用户定义函数/语句 | userScripts page-evaluator | 明确 world、参数、返回、权限及限制 | ADAPT | IMPLEMENTED；不是任意后台 eval |
| eval 的含等号猜测 | 猜测赋值或表达式 | 显式 expression / statement mode | 无 mode 拒绝；不猜代码意图 | REPLACE | IMPLEMENTED；兼容差异 |
| _execute(functionString,eventId) | 旧平台分支与字符串注入 | 内部 typed request + driver | 不作为可公开绕过准入的接口 | REPLACE | LEGACY_COMPAT_ONLY |
| pendingEvents | 等待单次 Page 回调 | private pending + operation journal | 内存协作与持久事实分开 | REPLACE | IMPLEMENTED |
| operationCompleted / handleMessage | 用 eventId 完成 Page Promise | 可信内部协议；旧公开入口拒绝 | 验证 run / document / request 对应关系 | REPLACE | LEGACY_COMPAT_ONLY |
| screenshot | 截取可见页面 | 绑定目标的 Chrome driver | 可见区域支持范围与 fullPage 拒绝分账 | ADAPT | IMPLEMENTED；不承诺 fullPage |
| uploadFile / helpers | 向 file input 放数据 | 有预算的 chunk / commit / URL driver | 目标/文件格式/资源预算明确 | ADAPT | IMPLEMENTED；限制分列 |
| cookies / setCookie / deleteCookie | 读写 Cookie | 受限 Chrome cookie driver | 精确范围与权限；不因 Page API 存在而默认允许 | ADAPT | IMPLEMENTED；非 Page SDK 任意 cookies |
| addScriptTag | 插入脚本资源或内联内容 | URL 限定扩展资源；content 走 user-script | 资源与用户代码分道；不恢复任意远程代码后台执行 | ADAPT | IMPLEMENTED；不同来源不同限制 |
| addStyleTag | 插入样式 | 明确允许资源/内容的固定操作 | 资源约束与清理 | ADAPT | IMPLEMENTED；不支持输入需拒绝 |
| Environment.CAPACITOR / WebView | 多宿主同一 Page 意图 | 名称/能力拒绝等兼容面 | 存在真实平台需求与资格测试时独立实现 | DEFER | LEGACY_COMPAT_ONLY |

当前真实普通 Page 执行链是 context → controllerOperation → native-driver → scripting/packaged/page-session / registry。不要机械采用旧 migration-map 把所有操作都映射为 page-agent。

## 4. Page SDK：网页请求扩展服务

| Legacy | 原始语义 | Current | Target | 决策 | 状态 |
|---|---|---|---|---|---|
| axiosx | 四类 HTTP Promise 请求 | sdk/http → bridge → SDK authority → network driver | 保留便利门面，明确配置/响应兼容范围 | ADAPT | IMPLEMENTED；完整 Axios 不支持 |
| callChromeBridgeInterface | 将方法/参数变成跨上下文调用 | sdk/bridge.callChromeBridgeInterface | 兼容参数转换 + 统一方法合同 | ADAPT | IMPLEMENTED |
| brige.js | 回调与跨环境 await 支撑 | sdk/bridge + sdk/transport | 外观、传输、授权分离 | REPLACE | IMPLEMENTED |
| ChromeBridgeEvents | 页面可见回调 Map | 兼容映射 + 内部 pending | 不作授权或持久状态来源 | ADAPT | LEGACY_COMPAT_ONLY |
| ChromeBridgeOperationCompleted | 页面 Promise 完成接口 | 兼容回调 + 内部 transport | 只影响页面等待，不证明可信后台成功 | ADAPT | LEGACY_COMPAT_ONLY |
| CustomEvent bridge | 页面与 isolated world 通信 | versioned JSON / tagged values | 可以保留载体；事件不是可信身份 | ADAPT | IMPLEMENTED |
| custom_event.js relay | 转 runtime 消息 | agents/page-relay | 校验封装、相关性与生命周期，不授权 | REPLACE | IMPLEMENTED |
| chrome.runtime messaging | Chrome 环境通信 | protocol + host client + relay | 保留通道，身份从 actual sender 派生 | ADAPT | IMPLEMENTED |
| background dispatcher | 按事件调用服务 | sw + foundation broker + domain methods | 组合入口，不变成新授权 owner | REPLACE | IMPLEMENTED |
| AXIOS_* 后台服务 | 代理网络请求 | SDK service + platform/chrome/network | authority 准入；driver 执行与记录效果 | REPLACE | IMPLEMENTED；B 范围在 P1 候选 |
| AppStorage | 后台 localStorage String KV | frameworkKV 命名空间 | 保留明确返回值；clear 只影响授权空间 | ADAPT | IMPLEMENTED |
| AppLocal | 后台 globalThis 临时 KV | chrome.storage.session typed namespace | 临时会话值，不覆盖后台全局属性 | REPLACE | IMPLEMENTED |
| chrome-local-storage helpers / BEX storage.* | 结构化存储与 Promise | storage facade + repository | 与 AppStorage String 语义区别处理 | ADAPT | IMPLEMENTED；逐 helper 验收 |
| service.log / getTime / bexUrl | 请求后台工具服务 | SDK service facade / background-services | 有限服务清单，不开放任意内部方法 | ADAPT | IMPLEMENTED |
| requestResource | 获取资源，旧可被拿来加载远程 JS | packaged resource consumer / contract | 包内受控资源；不恢复远程执行代理 | REPLACE | IMPLEMENTED；旧远程用途不保留 |
| createNotify | 提交通知 | notifications facade / driver | 能力与点击后动作分别授权 | ADAPT | IMPLEMENTED |
| serverUtils | 检测服务可用性与延迟 | server facade + controlled network | 可观察结果、真实超时；失败值明确 | ADAPT | IMPLEMENTED；限制分列 |
| 新 SDK 的 P1.1 reference | 旧缺少持久可核对调用引用 | candidate authority.lookupSdkInvocation | 同 authority 的只读引用核验，不重放 | REPLACE | IMPLEMENTED 于候选 |
| 新 SDK 的 P1.2 target scope | 旧未建立来源文档到目标的精确服务授权 | candidate target-origins + sdk-methods + sdk-approval | UI 明示 A/B，后端持有真正授权 | REPLACE | IMPLEMENTED 于候选；原生验收未在本轮执行 |

页面 SDK 与 Controller 可以复用 axiosx / storage 外观，但必须按各自身份准入。不能把 Controller 的 tool namespace、页面的 page namespace、两种 grant/lease 混为一个公开 context。

## 5. 注入、资源、工具与非框架业务

| Legacy | 原始语义 | Current | Target | 决策 | 状态 |
|---|---|---|---|---|---|
| my-content-script 的 SDK 注入 | 为网页建立统一 SDK 环境 | installSdk + fixed main/relay | 按授权文档安装，重复安装与清理有合同 | REPLACE | IMPLEMENTED |
| common / 编码 / sleep | 共享轻量工具 | framework utilities / codec | 保留纯工具，不携带权限 | ADAPT | IMPLEMENTED；按符号核验 |
| wrapAsync | 给控制代码加入 async 包装 | Controller async-body runtime | 直接规定执行体/return/throw，不靠正则猜测 | REPLACE | IMPLEMENTED |
| formatJSON 的 eval 解析 | 将输入变成 JSON 文本 | strict JSON formatting utility | 非 JSON 不执行；原文/错误语义明确 | REPLACE | IMPLEMENTED |
| Env / app scripts | 配置环境与启动站点业务 | 公开配置与 feature 分离 | 不将秘密放页面；不让业务脚本成为 SDK 启动依赖 | ADAPT | PARTIAL；不机械复制旧注入列表 |
| 通用库整包注入 | 业务便利用依赖 | 当前不以所有旧 vendor 为默认必需项 | 仅真实消费者需要、许可明确的依赖 | DEFER | DESIGNED；逐资源决定 |
| Device / fingerprint | 设备识别或业务标识 | 部分 util/受限服务，不代表旧设备体系迁移 | 不能作为授权身份；缺能力明确拒绝 | ADAPT | PARTIAL |
| TimeReview / CSDN / VIP / account | 特定业务工作流 | 非通用框架依赖 | 可选产品 feature，维持本轮排除边界 | DROP | NOT_IMPLEMENTED 于通用核心 |
| proxy / broad history / HID / remote control | 旧业务与设备侧能力 | 不进入本轮核心产品 | 有具体合法需求与独立权限设计后另评 | DEFER | NOT_IMPLEMENTED 于本轮范围 |

## 6. 文档、源码与验收不能互相替代

本表的源码依据集中在 [Legacy 模型](legacy-src-bex-framework.md) 的固定来源链接，以及 [CURRENT / TARGET](current-and-target-framework.md) 的实际接线链接。原有 [source-compatibility-ledger.json](../../framework/source-compatibility-ledger.json)、[migration-map-v5.md](../../framework/migration-map-v5.md)、[compatibility-delta-v5.md](../../framework/compatibility-delta-v5.md) 保留其 ID、历史证据和已批准差异职责。

大型 ledger 本轮未能完整读取，不宣称本表穷尽全部内部符号或替代逐项机器验收。下一步按能力族核对受影响 row：保留来源身份，更新过时目标路径，关联真实场景与正反例，不能把“源码存在”批量改为 runtime PASS。

最小验收顺序：保存/版本 → 固定 Page.title → 网页 SDK A/B 调用 → 权限/导航/重启/重复/未知效果 → 回归主线资源回收 → 再扩展其他能力。具体断言见 [验证矩阵](current-and-target-framework.md#8-验证判断语义成立而不是代码相似)。
