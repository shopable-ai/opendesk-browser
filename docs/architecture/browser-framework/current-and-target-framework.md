# CURRENT / TARGET：浏览器自动化与用户脚本的统一框架

> 定位与语义首页：[README](README.md)。本文件承接首页，不再以“保存脚本 / 请求服务”代替完整框架。
> 主线文档修订前：`bb2038f992b1ad79311fc8436433a655f76ff735`，产品源码基线 `6214b5e9132f58cbe0402a34973b7ee38c851d53`。
> P1 候选本轮观察：`426409791a35acb6a6e5eb3f6fcc8b0600f562b5`，分支 `codex/p1-2-sdk-target-origins-20261004`。此前 `38763c7` 已有批准 UI，其后一项提交增加构建/测试相关内容。
> 2026-10-05 静态分析与文档修订。IMPLEMENTED 表示具体代码与关键接线存在，不表示真实浏览器验收通过。主线、候选和 TARGET 不能合并描述成一个已经交付的版本。

## 1. 框架范围与非目标

框架必须同时容纳：

1. **浏览器控制**：普通控制脚本通过 Puppeteer 风格 ChromePage / ChromeElement / Keyboard 操作明确的网页。
2. **网页用户脚本**：脚本在页面执行环境内访问 DOM、增加交互与监听事件，可按网址/时机装载，也可手动触发。
3. **浏览器服务**：两类脚本及获准的普通网页，通过服务 API 请求 HTTP、存储、通知、资源、下载等能力。

前两项是不同运行语义；第三项是能力服务，不是另一种运行世界。脚本管理 UI、工具栏与页面按钮是产品层消费者。自动化任务也可以选择不使用服务 SDK；网页用户脚本也可以选择不使用 ChromePage。

不为这一模型新建第二个 authority、第二个数据库、平行 Broker 或通用 Workflow。允许在现有框架中增加缺失的页面脚本生命周期适配；不能把“只有一个执行底座”解释成所有程序只能塞入无 DOM 的 Controller Worker。

不是全量 Puppeteer 复刻、不是已完成 GM/Tampermonkey 生态兼容，也不把账号、CSDN、TimeReview、设备远程控制等旧业务自动纳入通用核心。后续 Agent/MCP 或其他客户端只能作为同一能力边界的消费者，本轮不建设新的外部入口。

## 2. CURRENT：已存在的三条关键调用链

### 2.1 Puppeteer 风格控制脚本

```text
Script Editor 保存 source
→ commitControllerScript → scriptHeads / scriptRevisions
→ 用户选择版本、参数、目标
→ RunHost.startController → startControllerRun
→ Controller Authority 固定版本与目标
→ 受控 Worker 执行 async-body
→ page / params / axiosx / AppStorage / AppLocal / storage
→ Controller operation → 对应 driver
→ 操作回执与最终 result → 资源退役
```

脚本正文和页面不在同一执行环境。`page.title()` 通过固定包内 DOM 操作读取目标；`page.evaluate(...)` 通过受控页面计算路径。对受控程序而言 Page 可在可信导航后继续使用；旧元素和文档引用不得静默跟随新页面。

源码：[script-editor](../../../src/ui/script-editor.js)、[RunHost](../../../src/run-host.js)、[Worker 参数](../../../src/scripting/sandbox/worker-runtime.js)、[context](../../../src/framework/context.js)、[ChromePage](../../../src/framework/ChromePage.js)、[controller-methods](../../../src/platform/host/controller-methods.js)、[native-driver](../../../src/framework/control/native-driver.js)。

### 2.2 独立 Page SDK 服务

```text
扩展工具选定来源 A 的文档、能力并批准安装
→ Broker.installSdk → Authority.grantSdk
→ 固定 relay（ISOLATED）+ 固定 SDK（MAIN）
→ 页面 OpenDeskSDK / axiosx / AppStorage 等
→ transport → relay → runtime actual sender
→ SDK Authority → service executor → driver
→ journal / result → delivery check → A 的原 Promise
```

来源页面可由自己的业务程序、按钮或 DevTools 调用 SDK，不必先保存 Controller 程序。SDK 安装不等于把后台全局 page 注入网页；CURRENT 的原始 executeScript / executeInBg 服务明确拒绝。

源码：[SDK entry](../../../src/framework/sdk/entry.js)、[transport](../../../src/framework/sdk/transport.js)、[relay](../../../src/agents/page-relay.js)、[sdk-broker](../../../src/platform/host/sdk-broker.js)、[sdk-methods](../../../src/platform/host/sdk-methods.js)。

### 2.3 已有页面执行机制不等于完整用户脚本产品

旧 `my-content-script.ts` 已将 app scripts、SDK、公共库和环境放入网页，体现真实网页增强需求，不应只被描述成“HTTP SDK 安装”。新项目已有 `scripting/user-scripts/page-evaluator.js` 和 `userScripts.execute` 对应的页面计算机制。

但所核对的当前入口并未证明以下完整闭环：通用用户脚本导入/安装 → 用户启用 → 元数据规则匹配 → 浏览器自动装载 → 每脚本/每文档实例管理 → 停用/升级/清理。CURRENT 只能写成“已有部分机制”，不能计作完整用户脚本管理器；也不能把未闭合的用户需求从 TARGET 中删掉。

源码：[页面计算构造](../../../src/scripting/user-scripts/page-evaluator.js)、[原生 driver](../../../src/framework/control/native-driver.js)、[旧注入层](https://github.com/shopable-ai/todo-user/blob/0dc7b07959f762e5be8f2f3847a71dc8c4b16aa5/src-bex/my-content-script.ts)。

## 3. CURRENT 状态表

| 能力 | 状态 | 不能推断的结论 |
|---|---|---|
| ChromePage / context / Controller | IMPLEMENTED，具有明确接口限制 | 不是完整 Puppeteer 实现或所有浏览器行为已 PASS |
| 固定 DOM 操作与页面 evaluate 机制 | IMPLEMENTED | 有 evaluate 不等于有通用用户脚本管理器 |
| 网页 SDK 与服务 | IMPLEMENTED，能力逐项受限 | 不自动产生 scriptId 级授权与存储隔离 |
| P1.1 引用核验收敛 | 候选 IMPLEMENTED | 主线 Broker 的历史内联核验并未因此自动更新 |
| P1.2 targetOrigins 与批准 UI | 候选 IMPLEMENTED，端到端本轮未验收 | 不能继续说批准 UI 缺失，也不能写原生用户链通过 |
| 受控 SDK 网页按钮样例 | 候选已有实际消费者与测试文件 | 不证明页面按钮可启动整份已保存 Controller |
| 完整 URL 匹配/装载/启停用户脚本管理 | PARTIAL（底层机制）；通用管理闭环 NOT_IMPLEMENTED 于已核对入口 | 不宣称全库证明不存在，也不计迁移完成 |
| GM API 与用户脚本元数据兼容 | 本轮没有完整实现与验证证据；TARGET 中按子集决定 | 不能把 axiosx/AppStorage 直接改名为 GM 接口 |
| 页面按钮启动已有任务 | TARGET / DESIGNED | 不恢复旧网页任意代码到后台 eval 通道 |

## 4. TARGET：浏览器对象、脚本类型与产品入口

### 4.1 对象模型先于文件布局

浏览器运行上下文包含 tab、frame 和当前 document；元素属于具体 document。URL 是文档地址，不是文档身份。一个 tab 导航后可能仍是同一个 tab，但已经不是同一个 document。

控制脚本使用绑定 Page；页面用户脚本运行实例绑定 script/revision 与文档；服务调用有实际来源、请求和 grant。网络目标 origin B 不等于浏览器自动化目标文档 T，更不等于来源文档 A。

### 4.2 程序描述必须分别表达四个维度

| 维度 | TARGET 合同 |
|---|---|
| 来源/版本 | 保存、安装、导入，或可信工具临时调试；运行前固定本次字节与参数，临时调试不必先建长期项目 |
| 触发 | 手动、匹配网址与时机、声明的事件；入口可为工具、页面按钮或调试控制台 |
| 执行环境 | Controller Worker、USER_SCRIPT，或经明确风险说明选择的 MAIN |
| 能力与目标 | Page 控制权限、适用站点/frames、网络目标、存储/通知/下载等分别声明 |

这是设计字段语义，不是已经存在的某个 JSON schema 或新的公开 API 名称。元数据兼容适配只负责解析与规范化；不负责自己授予权限。

### 4.3 技术职责与依赖

```text
产品消费者：用户脚本管理器 / 自动化工作台 / 网页集成
        ↓
公开合同：ChromePage API / 用户脚本描述与生命周期 / Service SDK
        ↓
可信安装与运行准入：识别脚本、版本、来源、目标、批准范围
        ↓
执行语义适配：Controller 任务 | 页面用户脚本实例 | 单次服务
        ↓
平台适配：包内 DOM 操作 / userScripts / tabs / HTTP / 存储等

跨上下文才使用 Transport；页面脚本本地 DOM 不强制 RPC。
Authority 与 Durable repositories 横向提供授权、状态和执行事实。
```

保留八类技术职责：Public Surface、Contracts、Transport、Authority、Runtime、Drivers、Durable State、Feature Modules。它们是责任边界，不是每条操作都必须走八次，也不要求按名字批量搬文件。

业务 Feature 调用 Framework；Framework 核心不依赖具体网站业务。公开 SDK 不直接调用 chrome.*；UI 只提交批准意图；Transport 不合成可信主体；Broker 不重新解释一套 grant；Driver 依赖已有 authority 决策；持久状态不能由 UI 颜色替代。

`framework/control/native-driver.js` 逻辑上属于平台适配。迁移可以先落实依赖检查，再决定是否搬路径。

## 5. TARGET：用户脚本生命周期必须补什么

| 环节 | 核心决定与失败规则 |
|---|---|
| 安装/导入 | 固定代码与依赖版本；显示来源、适用站点和服务能力；不以安装替代授权 |
| 启用/注册 | 由同一 authority 批准注册计划，再调用平台；期望状态与实际注册结果要可对账 |
| 页面匹配 | match/exclude、时机、frame 规则分别定义；匹配本身不是授予网络或其他浏览器特权 |
| 文档实例 | 按脚本/版本/文档记录或追踪实例；防重复注入；页面 DOM 的直接访问不冒充逐操作 Broker 日志 |
| 页面存活 | 支持事件监听和页面 UI；初始化函数返回不代表这份增强逻辑已停止 |
| 停用/卸载 | 区分不再注入、拒绝后续扩展服务、撤销已注册入口和当前页面可清理资源 |
| 升级 | 新版本不替换在途实例代码；扩权重新批准；原生注册与持久元数据不假定可跨系统原子提交 |
| SPA/导航 | SPA 路由变更与新 document 分开；不默认每个 URL 变化重跑全部脚本 |

Chrome userScripts 提供 register/execute/unregister、matches、runAt、world 等机制，仍需要产品管理和身份合同；API 自身不是完成的用户脚本管理器。扩展升级后的注册对账也必须按实际平台行为验证。

### 两个不能伪造的安全保证

**脚本隔离。**当前 Page SDK 以来源文档与 origin 派生 principal/namespace。TARGET 用户脚本需要基于可信安装与实例通道的 script/revision 身份；单凭页面消息中的 scriptId、可公开读取的随机值或同世界的约定，不能宣称脚本间隔离。普通网页 Page SDK 保持文档级授权；脚本级与文档级 grant 可以由同一 authority 管，但不能互相冒用。GM 存储适配需独立验证每脚本命名空间与值合同。

**停止。**受控 Controller Worker 的终止与页面内 JS 的清理不是同一承诺。unregister 不等于中断已执行脚本、移除所有 listener 或回滚 DOM/网络效果。通用页面脚本存在无法完整回收的情形，应显示清理限制或要求重载目标文档，不能虚报已完全停止。MAIN 世界还存在页面脚本相互影响；不得作为高权限隔离环境。

所有授权约束必须说明作用边界：SDK authority 控制扩展代办的请求；页面脚本直接 DOM 或网页自身允许的 fetch，不会自动被它逐次检查，另受执行世界与 CSP 等约束。

## 6. 两类 API 与共同底座的复用规则

| 项目 | 决定 |
|---|---|
| ChromePage | 保留 Puppeteer Page/Element 认知；任务可用，页面脚本不被强制使用 |
| HTTP/storage 等 facade | 可以复用服务语义，不直接复制调用身份或命名空间 |
| Transport/codec | 共享验证和编码规则，可存在不同受控通道；本地 DOM 无需绕行 |
| Authority | 一个逻辑授权 owner，组合 Controller、Page SDK 和未来用户脚本的不同准入合同 |
| 持久化 | 复用 repositories/journal，领域记录分开；不强迫所有状态同 schema |
| 资源预算 | Controller 任务 slot 不自动成为所有用户脚本的全局锁；页面实例和短服务有各自限额 |
| 目标冲突 | Controller 的目标绑定不等于独占整个 DOM；并发页面逻辑仍可能修改 DOM，需业务断言或明确隔离策略 |
| 代码执行 | 包内固定操作、受控用户代码与后台特权代码区分；不把所有字符串代码都列为禁用 |

同一个基础设施可以支持不同运行模型；这是复用，不是新增第二套 Framework。

## 7. 网页按钮与旧 executeScript 的承接

旧网页 executeScript 发 CHROME_PAGE_EXECUTE，后台 wrapAsync/eval 再调用后台 page。它有“网页触发自动化”的真实需求，但没有可靠整段脚本结果 Promise，也不能把该高权限通道原样迁移。

TARGET 组合场景：

```text
用户脚本给订单页添加“生成日报”按钮
→ 点击后提交固定脚本引用、参数、来源实例
→ authority 核验已有有限调用许可，必要时可信工具确认
→ 复用现有 Controller admission / RunHost
→ ChromePage 操作明确目标，服务 API 执行获准服务
→ 展示本次 run 的结果/失败/未知状态
```

页面 DOM 中的按钮无论由谁创建，都不能单凭事件或按钮 ID 证明高权限用户批准。页面按钮可以只执行本页 DOM 逻辑，也可以请求一项服务，或请求启动完整任务；这三种用途要有不同返回合同，但不是三套引擎。

## 8. P1.1 / P1.2 的定位保持稳定

**P1.1：** 原调用效果未知时，由现有 authority 核验 actual sender、document、grant/session、request/digest，提供受限引用。lookup 不写入、不准入、不续期、不重放，不能变成凭任意 ID 读取 payload 的接口。

**P1.2：** A 文档允许通过扩展服务访问哪些 B origins。省略/空列表仍同源；更新替换完整集合而不是静默并集；Chrome host permission 不等于应用层 A→B 许可。当前精确范围是 origin，不是接口 path 或方法白名单，也不证明 DNS rebinding 防护。

候选跨域 grant 与 worker incarnation 绑定；持久记录存在不等于重启后仍有效。ready 可能是缓存 Hello；结果落盘不等于仍允许交付；response_ready 不等于网页已确认接收。

P1.2 是浏览器服务授权切片，不是全部 Browser Framework，更不能当作油猴类产品闭环。已经存在的批准 UI 不应重复实现。

候选：[sdk-approval](https://github.com/shopable-ai/opendesk-browser/blob/426409791a35acb6a6e5eb3f6fcc8b0600f562b5/src/ui/sdk-approval.js)、[SDK authority](https://github.com/shopable-ai/opendesk-browser/blob/426409791a35acb6a6e5eb3f6fcc8b0600f562b5/src/platform/host/sdk-methods.js)、[目标契约](https://github.com/shopable-ai/opendesk-browser/blob/426409791a35acb6a6e5eb3f6fcc8b0600f562b5/src/framework/sdk/target-origins.js)、[页面消费者](https://github.com/shopable-ai/opendesk-browser/blob/426409791a35acb6a6e5eb3f6fcc8b0600f562b5/tests/framework/fixtures/sdk-target-origins/client.js)。

## 9. 三条黄金链：分别证明，不能互相替代

| 黄金链 | 正向证明 | 必测反例/边界 | 当前结论 |
|---|---|---|---|
| 浏览器自动化 | 保存 r1 → 绑定网页 → page.title/type/click → 实际页面变化与本次结果 | 切活动页、导航后旧元素、合法空标题、存 r2 不改变 r1、停止与未知效果 | 有对应实现；本轮未重跑 |
| 页面用户脚本 | 安装/启用 → 匹配文档自动执行 → 增加一个按钮 → 刷新行为明确 → 停用阻止后续注入 | 不匹配 0 注入、重复安装无重复实例、frames/SPA、初始化结束后监听仍存活、清理限制如实报告 | TARGET 验证，不可用 evaluate 单元测试冒充 |
| 共享服务 | 原页面 A 的实际 SDK → authority → B → 持久事实 → 原 A Promise | 未批准 C 请求 0 次、撤权、来源导航、重复 digest、重启后原 grant 不复活 | 候选有 UI/fixture/测试；本轮未做原生验收 |

组合验收在上述基础上增加：页面用户脚本使用受控服务并保有正确 script 身份；两个脚本使用相同 key 不越界；必要时按钮启动同一 Controller 底座。普通网页 SDK 测试不能证明用户脚本隔离。

### 状态和回执不能混为“成功”

脚本资产 ≠ 一次运行；一次运行 ≠ 一次 API；外部效果已发生 ≠ 结果允许释放；允许释放 ≠ 页面已接收；页面增强已装载 ≠ 所有业务目标完成。

保留已有回归：P1.1 零写入与原引用、ID/digest 冲突、目标 scheme/port/subdomain 边界、SDK deadline、权限撤销顺序、journal/result 绑定、资源回收。mock、真实 IDB、浏览器与最终包兼容性分别报告。

## 10. 当前状态 owner 与 TARGET 扩展点

| 事实 | Owner / repository |
|---|---|
| 脚本当前版本与不可变版本 | scriptHeads / scriptRevisions；受控 repository |
| Controller run、epoch、slot | authority + runs；RunHost 管实际任务资源 |
| Page SDK grant / operation | SDK authority；commandJournal |
| Controller 单操作回执 | 对应 operation journal；不是一概写入 results |
| SDK/Controller 服务与最终结果 | results；读取/交付仍受原主体和生命周期核验 |
| AppStorage / AppLocal | frameworkKV / chrome.storage.session 的授权命名空间 |
| 页面用户脚本安装计划/实例 | TARGET：复用 storage，在同一 authority 下增加明确领域记录；不能拿 UI enabled 值代替平台注册事实 |
| 用户脚本的页面 listener/DOM | 对应页面执行实例；不保证所有任意代码资源可强制回收 |
| transport pending/timer/port | 当前上下文临时协作状态，不是恢复权威 |

[authority](../../../src/platform/host/authority.js)、[IDB schema](../../../src/platform/storage/idb.js)、[repository](../../../src/platform/storage/repository.js)、[session](../../../src/platform/storage/session.js)。

## 11. 兼容与工程顺序

兼容声明分开：ChromePage 方法/旧消费者语义、Puppeteer 对应行为、用户脚本产品功能、GM/元数据子集、第三方生态脚本。对不支持项明确报错是正确的安全行为，但拒绝不能计为旧正向能力迁移成功。

工程顺序：

1. 固定本模型与三个黄金切片；不先大规模搬目录。
2. 由现有产品 owner 在唯一 P1 候选完成服务授权链，同时保留主线宿主恢复与资源回收有效修复；禁止整文件旧候选覆盖新主线。
3. 在同一候选验证 ChromePage 实际浏览器操作，不让 SDK 通过替代 Automation 通过。
4. 另行获得实施范围后，先证明只用 DOM 的页面用户脚本管理闭环，再接服务与脚本级隔离；不靠不断扩大 P1 定义完成全部产品。
5. 根据真实旧/目标消费者选取 GM/元数据兼容子集，必要依赖固定版本与来源，扩权重新批准；不照搬任意远程特权执行或声称全生态兼容。

本轮只改两份架构文档，不修改产品、public-owner、machine ledger 或浏览器通过标志，不自动启动新 P2/P3。

文档分工：本目录负责人工 Architecture；有效合同与源码 schema 负责 Contracts/Invariants；source-compatibility-ledger 与详细 map 负责 Migration/Compatibility；tests/test-spec/evidence 负责 Validation。历史 progress/handoff/reviews/prototypes 保持其日期与候选范围，不删除历史失败。

官方参考：[Puppeteer Page](https://pptr.dev/api/puppeteer.page)、[Tampermonkey metadata/APIs](https://www.tampermonkey.net/documentation.php?locale=en)、[Chrome userScripts](https://developer.chrome.com/docs/extensions/reference/api/userScripts)、[Content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)。
