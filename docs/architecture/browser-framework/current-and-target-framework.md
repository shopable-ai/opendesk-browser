# CURRENT / TARGET：先定义用户合同，再对应内部架构

> 主线产品源码基线：`6214b5e9132f58cbe0402a34973b7ee38c851d53`。
> P1 候选基线：`38763c78209794bec53c8ca848bfa0789dc4796e`，分支 `codex/p1-2-sdk-target-origins-20261004`。
> 2026-10-05 静态核对。IMPLEMENTED 仅表示源码存在且所述关键接线可追踪，不等于本轮真实浏览器 PASS。两条线不能拼成一个已经交付的包。

## 1. 框架的语义合同

| 用户操作 | 框架必须答清的问题 | 权威归属 |
|---|---|---|
| 保存脚本 | 脚本 ID、版本、内容 hash 是什么？保存是否成功？ | 脚本 repository 与受控写入入口 |
| 启动运行 | 谁要求运行哪一版、用什么参数、在哪个目标？ | Run admission；不是按钮自身 |
| 操作网页 | 当前 run 的 Page 绑定哪个 tab/frame/document？ | Authority + target driver |
| 请求服务 | 谁从哪个文档请求什么能力、允许访问哪里？ | SDK / Controller 对应的 authority 分支 |
| 取得结果 | 对应哪次调用？只是 ACK、效果已发生，还是结果已保存/允许交付？ | Journal / result repository + delivery check |
| 停止/撤销 | 哪些后续动作不得发出？已发出的副作用是否仍可能发生？ | Authority 持久状态 + runtime 取消 |

脚本资产不是运行实例；运行实例不是其中的一次 API 操作；操作的实际效果不是响应是否送达。这四层不能再用一个“运行成功”表示。

## 2. CURRENT：用户可以怎样接触这些能力

### 2.1 扩展工具运行 Controller 脚本

```text
Script Editor 保存 source
→ client.commitControllerScript
→ 持久 scriptHeads / scriptRevisions

用户选择 revision / params / target 后运行
→ RunHost.startController
→ client.startControllerRun
→ Controller Authority 固定脚本与目标
→ 受控 Worker 执行 async-body
→ 注入 page、params、axiosx、AppStorage、AppLocal、storage
→ API 操作或服务调用
→ 本次完成与结果持久化 / 目标资源退役
```

这条能力不能被根 README 的旧“仅 02A 基础环境”描述覆盖。主线已有对应代码，但本轮没有重新证明真实 UI、浏览器和资源回收全链通过。

源码：[script-editor.js](../../../src/ui/script-editor.js)、[run-host.js](../../../src/run-host.js)、[worker-runtime.js](../../../src/scripting/sandbox/worker-runtime.js)、[context.js](../../../src/framework/context.js)、[controller-methods.js](../../../src/platform/host/controller-methods.js)。

### 2.2 网页调用 SDK 服务

```text
扩展工具选定 A 文档、能力并批准安装
→ Broker.installSdk
→ Authority.grantSdk
→ 固定 relay（ISOLATED）+ 固定 SDK（MAIN）
→ 页面 OpenDeskSDK / axiosx / AppStorage 等
→ Window transport → relay → runtime actual sender
→ SDK Authority → service executor → platform driver
→ journal / result → delivery check → A 的原 Promise
```

SDK 安装不是授予网页一个后台全局 `page`。CURRENT 的 `executeScript` / `executeInBg` 原始脚本接口明确拒绝；网页调用服务不要求先创建一份 Controller 脚本。

源码：[SDK entry](../../../src/framework/sdk/entry.js)、[transport](../../../src/framework/sdk/transport.js)、[relay](../../../src/agents/page-relay.js)、[sdk-broker](../../../src/platform/host/sdk-broker.js)、[sdk-methods](../../../src/platform/host/sdk-methods.js)。

### 2.3 主线与候选的关键区别

| 能力 | 主线 6214b5e | 候选 38763c7 | 正确报告方式 |
|---|---|---|---|
| Page / Controller 运行 | 已有主要实现 | 已有对应基础，但不能假设包含主线全部后续修复 | 实现存在；验收分列 |
| 同源 Page SDK / 工具安装 | 已有 | 已有 | 实现存在 |
| P1.1 reference 核验 | Broker 内仍解释部分持久 SDK 绑定 | 调唯一 authority 的 lookupSdkInvocation | 候选修正方向正确 |
| P1.2 精确额外 targetOrigins | 主线没有候选的新契约 | parser / grant / dispatch / delivery 检查已有 | 候选后端 IMPLEMENTED |
| A/B 批准 UI | 主线安装参数未传 targetOrigins | 新 sdk-approval.js + tool-shell + tool.html 已接入 | 候选 UI IMPLEMENTED；不是当前缺失项 |
| 受控网页按钮示例 | 不包含新 fixture | SDK 消费者、A/B/C 受控站点与相关测试已增加 | 示例存在，不代表原生链已 PASS |
| 网页启动已保存 Controller 的通用公开接口 | 未在已查入口发现 | SDK 服务按钮不能证明此能力 | NOT_IMPLEMENTED 于已查入口；TARGET 设计 |

候选源码：[sdk-approval.js](https://github.com/shopable-ai/opendesk-browser/blob/38763c78209794bec53c8ca848bfa0789dc4796e/src/ui/sdk-approval.js)、[tool-shell.js](https://github.com/shopable-ai/opendesk-browser/blob/38763c78209794bec53c8ca848bfa0789dc4796e/src/ui/tool-shell.js)、[受控页面消费者](https://github.com/shopable-ai/opendesk-browser/blob/38763c78209794bec53c8ca848bfa0789dc4796e/tests/framework/fixtures/sdk-target-origins/client.js)。

上轮 `dc25c048...` 未包含批准 UI 的结论已过时。不要重复提出已经实现的 UI 缺口，也不要因此跳过原生验收。

## 3. TARGET：语义框架与技术层次的对应

```text
用户场景 / Feature
    ├─ 脚本资产与运行入口
    ├─ 网页 SDK 消费者
    └─ 编辑器、采集等具体功能
                ↓
Public API：Automation API | Page SDK / Service API
                ↓
Contracts：调用参数、返回值、错误、支持范围、版本
                ↓
Transport：跨上下文传递与相关性
                ↓
Authority：实际身份、准入、授权与持久状态迁移
                ↓
Runtime：管理长运行或短服务的生命周期
                ↓
Drivers：固定 DOM 操作、受控用户脚本、HTTP、Storage、Chrome API

Durable State / Journal 在 Authority 与 Runtime 旁记录执行事实。
```

八类技术职责保留，但不是用户首页的第一张图：Public Surface、Contracts、Transport、Authority、Runtime、Drivers、Durable State、Feature Modules。脚本资产及启动运行分别映射到 Public Surface、Runtime、Durable State，不额外制造一套平行基础设施。

### 两类 API 共用什么，不共用什么

| 项目 | 决定 |
|---|---|
| 能力门面 | 可复用 HTTP/storage 外观，保留 Automation 与 Service 两个公开表面 |
| 传输 | 共享协议原则与 codec，不强制相同 wire envelope |
| 授权 | 一个逻辑 authority owner，按 SDK / Controller 组合领域方法 |
| 身份 | 同一信任原则，但 SDK 来源文档 grant 与 Controller run/revision 是不同身份 |
| 状态 | 复用 repository 与 journal 基础设施，不强制每条记录相同 schema |
| 生命周期 | 长 Controller 运行与短 SDK 服务分开；不要求每个 SDK 请求占用长运行 slot |
| 数据命名空间 | 由 authority 分配；同名 AppStorage 不代表网页与 Controller 必然共享同一键空间 |

### 必须保持的依赖方向

Feature 调用 Framework；核心不依赖某个具体网站或账号业务才能启动。SDK 不直接调 chrome.*。UI 提交批准意图但不拥有授权事实。Transport 不合成可信身份。Broker 不另建授权解释。Driver 回调 authority 检查，不自己决定业务授权。Storage 存放持久事实，UI 只是投影。

当前 `src/framework/control/native-driver.js` 逻辑上属于 Platform Driver；先记录职责，再有选择地搬文件。不能为满足图上的目录名称而启动全面重构。

## 4. 明确的 TARGET 使用场景：在网页按钮启动已保存脚本

下面是语义合同，不是已经存在的 JavaScript API，也不在本轮实施新功能：

```text
用户点击页面里的“运行日报脚本”
→ 提交已保存的脚本引用（ID + 固定版本）、参数、来源文档
→ 框架确定目标，验证预批准范围，必要时由可信扩展界面确认
→ 进入现有 Controller admission / RunHost
→ page 操作目标，服务 API 请求获准能力
→ 按本次 run 返回结果/状态
```

不允许页面发任意 source 给高权限后台 eval。不能因为按钮由扩展注入 DOM，就把来自页面的数据当可信授权。页面内已有脚本也可访问页面 SDK；授权粒度是文档/主体与限定能力，不能声称只允许“开发者本人从 F12 键入的那段代码”。

网页按钮、扩展工具和 DevTools 可以是不同入口，但不能分别创建三套运行引擎。网页 DevTools 调用 SDK 与扩展后台 DevTools 直接调内部代码也必须分开记录，不能把后者作为公开用户链验收捷径。

## 5. P1.1 / P1.2 的语义定位

### P1.1：查的是原调用的合法引用，不是重新执行

当调用发生效果未知时，同一个 authority 验证真实 sender、原文档、grant/session、request ID/digest，再提供受限引用。`lookupSdkInvocation` 不是 Page SDK 新增的任意结果读取 API。查引用不能写入、准入、续期、恢复授权或重放副作用。

### P1.2：A 页面被允许向哪些 B 请求服务

来源 A 和目标 B 是不同维度。批准网络能力不等于批准所有目标；Chrome host permission 不等于某个网页拥有这项服务权。候选批准列表省略/空列表保留同源，目标列表更新替换旧集合而非静默并集。

当前精确范围是 origin（协议、主机、端口），不是单一接口 path 或 HTTP method 白名单。不能把“批准某个 origin”说成“只允许 /status GET”。候选明确不提供 DNS rebinding 证明。

跨域 grant 与 worker incarnation 绑定，重启后要求重新批准。持久记录仍在，不代表执行权限继续有效。`ready()` 可能是缓存 Hello，每次请求必须独立核验。

执行事实与结果交付分开：撤权后可以保留已经发生的效果事实，但不能继续向失去权限的文档释放结果；`response_ready` 也不证明网页已经接收。

候选源码：[sdk-methods.js](https://github.com/shopable-ai/opendesk-browser/blob/38763c78209794bec53c8ca848bfa0789dc4796e/src/platform/host/sdk-methods.js)、[target-origins.js](https://github.com/shopable-ai/opendesk-browser/blob/38763c78209794bec53c8ca848bfa0789dc4796e/src/framework/sdk/target-origins.js)、[broker.js](https://github.com/shopable-ai/opendesk-browser/blob/38763c78209794bec53c8ca848bfa0789dc4796e/src/platform/host/broker.js)。

## 6. 两条 Golden Vertical Slice

### Slice A：网页 A → axiosx → 扩展 → 目标 B → A

实际步骤：可信工具批准 A 文档和 B origin → 安装固定 SDK/relay → 网页自身按钮或网页 DevTools 调真实 SDK → actual sender 进入后台 → authority 准入 → journal 记录 dispatch → network driver 调 B → 记录响应/效果 → 重新验证交付 → 原页面断言。

期望：B 实际收到请求，C 未批准时收到 0 请求；切活动页不改来源，A 导航/撤销时不能将响应送往新文档。不能用直接调用后台内部函数、伪造 sender 或测试脚本注入替身 SDK 代替本链。

候选 network driver 采用受限配置、credentials omit、manual redirect。它是受控服务而非完整 Axios 替身；特殊配置、任意认证头和自动跨目标跳转不能由同名 facade 推断支持。[network driver](../../../src/platform/chrome/network.js)、[SDK registry](../../../src/framework/sdk/registry.js)。

### Slice B：保存的程序 → page.title() → 固定目标 → 运行结果

实际步骤：Script Editor 保存版本 → 用户选目标 → Controller admission → RunHost/Worker → Page request → Controller authority → native-driver → `scripting/packaged/page-session.js` → registry 的 `document.title` → journal / 对应 Promise → 脚本最终 result。

普通 title 不经过任意页面 evaluate，不需要借用 Page SDK 的 grant。`src/agents/page-agent.js` 是模板采集通道，不是所有 ChromePage 方法的执行器；旧大型 migration-map 中的泛化路径不能代替本调用链。

## 7. 状态、授权和生命周期 owner

| 事实 | 当前存放 / owner |
|---|---|
| 当前脚本与不可变版本 | scriptHeads / scriptRevisions；受控 repository |
| 长运行身份、状态与 slot | runs + authority；RunHost 管实际运行资源 |
| SDK grant | commandJournal 中的 grant；SDK authority |
| SDK 请求与未知效果 | commandJournal 中 request lock / sdk-operation |
| Controller 单次操作回执 | 对应 operation journal；不是所有操作都统一放 results |
| SDK / Controller 服务与最终运行结果 | results，读取和交付继续受权限约束 |
| AppStorage | frameworkKV 的授权命名空间 |
| AppLocal | chrome.storage.session 的命名空间化 typed value |
| 当前 Promise / timer / Port | 对应 transport/runtime 的临时资源，不是持久真相 |

源码：[authority](../../../src/platform/host/authority.js)、[IDB schema](../../../src/platform/storage/idb.js)、[storage repository](../../../src/platform/storage/repository.js)、[session adapter](../../../src/platform/storage/session.js)。

## 8. 验证：判断语义成立而不是代码相似

| 场景 | 正例 | 必测反例 | 证据 |
|---|---|---|---|
| 保存并运行 | r1 保存、实际执行 r1 | 新存 r2 不改变在途 r1 | revision/hash、run 绑定、返回结果 |
| title | 读取固定目标标题 | 切活动标签、原文档导航、合法空标题 | 固定身份、实际目标值、错误 |
| 点击/输入 | 测试表单值和事件序列符合声明 | 不存在元素、只读输入、导航后旧元素 | 页面观察，不只检查 API resolve |
| SDK 服务 | A→B 实际响应回 A | 未批准 C、scheme/port/subdomain 变化 | B/C 计数、原页面调用、journal/result |
| 撤销 | 新批准只作用于新合法调用 | 请求中撤销、落盘后交付前撤销 | 时序与执行事实、拒绝交付 |
| 重复调用 | 相同 ID/digest 合法查询原事实 | ID 相同参数不同、未知效果后重试 | submissionCount 与原始 operation |
| P1.1 lookup | 合法调用得到受限引用 | 错 sender/grant/digest；并发查询 | 零写入、零副作用、原错误保留 |
| 生命周期 | 停止、关闭、重启有明确投影 | 未确认回收时不能复用目标/名额 | resources、journal、native observations |

组件测试、真实 IDB、真实浏览器、发布兼容性分别报告。新增 UI/fixture 和 mocked tests 只能证明对应范围，不能自动计入原生产品通过数。

## 9. 后续顺序与文档归属

先明确上述场景与返回合同；在唯一 P1 候选内保留主线有效修复并整合；验证已有 A/B UI 与真实 SDK 用户链；同包运行 title 对照；再逐能力更新 machine ledger。最后才讨论局部目录调整与页面脚本启动新入口。

不能整文件用候选 broker 覆盖主线 broker：主线有宿主 live/missing/unknown 判断与资源回收更新；候选有 reference-authority 收敛，必须保留两者有效部分。

| 材料 | 继续拥有的职责 |
|---|---|
| 本目录 | 人工语义、架构与当前/目标视图 |
| docs/contracts 中的阶段01设计 | 有历史阶段范围的设计/来源支撑，不当成全部当前架构 |
| 有效协议、schema、已批准 compatibility delta | Contracts / Invariants；只采用明确批准的版本与修订 |
| source-compatibility-ledger / migration-map-v5 | 原有详细迁移 ID 与机器状态；本轮不改通过标志 |
| tests / test-spec / gates / evidence | Validation 与绑定版本的证明 |
| progress / handoff / reviews / prototypes | 有时间与候选范围的进展、交接、历史证据；不是永久状态权威 |

本轮仅文档修改；不调整 public-owner、不实现新 P2/P3、不重跑浏览器、不宣称全量 ledger 复核完成。当前候选被其他会话继续推进时，以新 SHA 的源码重新核对变动项。
