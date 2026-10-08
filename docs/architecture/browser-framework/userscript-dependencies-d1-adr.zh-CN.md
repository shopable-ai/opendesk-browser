# ADR D1：用户脚本兼容层与不可变依赖资产

日期：2026-10-08。决策状态：采用 D，实施 P0/P1 源码与组件闭环；原生验收未通过，P2 安装入口未开放。本文不改变已有 Controller Task 的正式语义，不代表完整框架接受。

## 1. 仓库事实与问题

本轮重新检查 GitHub 主干、已有分支、开放 PR、仓库写权限和实际文件。开始时主干仍为 `66f11874fa27f6de438155124a3f772129386f8b`；最终集成以本轮工作记录的最新父提交为准，不把历史 SHA 当成永久基线。当前 Linux 工作区可写，用户给出的 Mac 路径不可访问。并行写入使用已有 main 的独立克隆和 detached worktree，没有创建新 Git 分支；集成前再检查 HEAD、重叠文件及权限，不强推。

复用可信 Host/Broker/Authority、Controller RunHost、Task Candidate/Verification/Available、IndexedDB v2、开发编辑器、页面即时预览、R3 注册描述编译器及固定 jQuery。旧解析器将解析和运行准入混在一起，拒绝常见无哈希 `@require`，头部和依赖限制过小；旧预览只认识 `withJquery`，旧注册锁只认识固定 jQuery。新增同级解析器或给每个库添加 checkbox 都不能解决这些问题。

当前 Task v1 是 Controller 合同，其 `async-main`、验证结果、运行资源和停止语义保持原义。Page Program 必须独立判别；纯注册描述没有把任务标为 Available 的权限。

集成前主干实际推进至 R5 提交 `0874755e8b2902653abe844f658163dbbecbf8c6`（PR #9）。本轮先保存自己未提交的工作，再非强制快进，逐块解决 `tool-shell.css` 与 UI SPEC 两处冲突：保留 R5 紧凑布局、现行说明和已有编辑器结果展开行为，仅接入 D1 依赖控件及局部样式；不回填 R4 的整套 CSS。HTML 与编辑器合并后重新审查差异，相关定向测试与构建以集成后的源码重做。

## 2. 四方案评审

以下为架构适配判断，不是功能完成率、兼容率或用户测评分数。权重：兼容性 20、安全性 20、开发体验 15、性能 10、扩展性 10、维护性 15、可验证性 10。

| 方案 | 兼容 | 安全 | 体验 | 性能 | 扩展 | 维护 | 验证 | 加权分 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| A 固定内置库 UI | 35 | 88 | 40 | 95 | 30 | 72 | 90 | 62.9 |
| B 仅元数据与远程 HTTPS | 80 | 45 | 82 | 45 | 60 | 62 | 60 | 63.1 |
| C 全面 ESM、打包与解析 | 30 | 82 | 60 | 80 | 95 | 65 | 86 | 67.3 |
| D 元数据兼容、内容寻址、多来源、可选 ESM | 88 | 95 | 94 | 95 | 98 | 92 | 95 | 93.3 |

| 方案 | 优点 | 缺点和兼容边界 | 复杂度及迁移成本 |
| --- | --- | --- | --- |
| A | 固定字节、离线、实施简单、供应链范围小 | 源码不能自描述；每加库都改产品和执行接线；内置并不自动消除恶意或漏洞 | 初期低，库数量增长后持续分叉；普通 `@require` 仍需人工配置 |
| B | 接近传统管理器导入方式，已有脚本改动少，来源自由 | URL 不是内容版本；更新、离线、审核、重定向和权限缺内部模型；逐页重取不确定且慢 | 表面低；安全补齐后必然出现资产、审核和锁，实质趋向 D |
| C | 显式导入导出、静态依赖图、按需构建，现代项目扩展好 | 经典 UMD/global 库、IIFE、顶层语义和 GM 兼容需改造；打包工具增加供应链；动态 import 不能绕过锁 | 高，对已有油猴脚本迁移成本最大，不适合第一条兼容链 |
| D | 声明、获取、字节、批准、运行分层；预览与未来安装共享资产；来源可扩展 | 要维护明确合同和准入；不自动获得 GM/MAIN/完整兼容；仍受 Chrome 世界容量约束 | 中高，只建一个资产内核和页面编译器；逐步取代 A，后续可接 C |

**选择 D。95/100 是退出目标，当前不达标。** 原因是正式 Page 生命周期未完成、自动匹配文档的世界容量准入未解决、原生授权与运行缺成功回执，以及仍有明确不支持的油猴语义。上一提案的“97 分”撤回，不作为实施接受依据。

## 3. 职责与数据流

`dependency-metadata.js` 解析源码并保留原声明和诊断；`assessUserScriptExecution` 单独决定可执行子集。`dependency-manager.js` 生成声明摘要、获取和校验资源，在 `frameworkKV` 保存内容寻址字节、待审记录、批准锁和引用。`execution-source.js` 只把已验证字节编译为 User Scripts API 的文本。`preview.js` 负责可信宿主、当前精确文档、网页权限、世界探针和完成回执。UI 只改声明、展示状态并发送显式操作。

来源适配器统一产出资产，不拥有独立执行器：

- **packaged**：仅精确已知的 jQuery 3.7.1 来源别名映射到已校验包内文件。展示真实扩展 URL，不宣称 CDN 下载；声明的 SRI 仍要匹配实际字节。
- **HTTPS**：来源获得授权后下载一次，按原始响应字节校验，缓存并等待批准。
- **local-file**：明确选择文件及对应声明，保存原文件字节、文件名及本地来源；不保存 `file://` 路径，不冒充远程下载。
- **未来 npm/Git/ESM**：扩展获取或构建层，最终仍产出不可变字节和锁，不自动运行到 Controller 或 Service Worker。

同一 SHA-256 可被多脚本共享，但来源、批准、入口模式和权限仍属于各自锁与 namespace。重复声明保留执行顺序，并按执行次数累计大小；同 URL 新内容生成新锁；不同 URL 相同内容只共享字节，不共享来源批准。声明摘要不含函数正文，正文修改可复用同一锁；每次执行仍重审全部元数据，新增 GM 权限不能借旧锁运行。

## 4. 兼容策略

接受 BOM、CRLF、前置版权注释和规范头部。普通 JS、字符串或注释示例中的伪头不被误识别。保留未知元数据、`@grant`、`@resource` 和原始 `@require`；能导入不等于已实现权限。未知执行指令、不支持的 grant/resource/connect/include/exclude/MAIN 等阻断执行并显示原因。没有元数据的原有普通 JS 不被强制改写。

支持强哈希 Hex/Base64、TM fragment 写法和标准 SRI token 正规化。D1 采用明确的 **all-strong**：所有声明的 SHA-256/384/512 都要匹配，冲突拒绝，弱哈希不能单独作为批准依据。这与 TM 选择最后支持值、W3C SRI 最强算法下候选集合的选择行为不同，不能标为完全兼容。[TM SRI 官方说明](https://www.tampermonkey.net/documentation.php?q=sri)。

相对依赖只在提供真实导入来源时解析，不用当前网页、`@homepage` 或 `@downloadURL` 猜测安装来源。底层支持 `importSourceUrl`，D1 UI 尚无完整远程导入身份流程；直接粘贴相对 URL 会因来源缺失被拦截。[Violentmonkey 元数据说明](https://violentmonkey.github.io/api/metadata-block/)。

`@match/@exclude-match` 映射 HTTP(S) Chrome 规则；`@noframes` 映射 `allFrames:false`，未声明时正式合同允许匹配子 frame。`@run-at` 映射 `document_start/end/idle`；D1 默认 idle，而 VM 默认 end，依赖时机的脚本应显式声明。预览只在用户批准的主文档即时执行，不重放加载时机，也不按自动注册规则重新选择当前文档。

`classic-userscript` 接受顶层/IIFE，不要求 main；`async-main` 在局部入口作用域等待 main。依赖与正文按序合成一个编译单元，以保证依赖同步异常阻断后续执行，换行和分号保护注释及 ASI。顶层严格模式和词法声明可能互相影响，IIFE 内的严格模式保持其作用域；UI 明确提示此差异，不声称每个文件的所有语义独立保留。[TM @require 官方说明](https://www.tampermonkey.net/documentation.php?q=externals)。

经典模式不接受静态 ESM；普通用户脚本不采用远程动态 import。显式 CSP 不含 `unsafe-eval` 或远程 script-src。未来 ESM 必须独立构建、锁图并转换目标环境；CSP 的具体原生行为仍待验收。

## 5. 供应链与运行边界

用户先选择获取来源，下载后再审核实际来源、大小、完整 SHA-256 和风险。浏览器下载域名许可与网页运行许可分开。审核不是代码无害证明，许可证未知明确展示，不伪造自动许可证审计。

HTTPS 拒绝账户信息、非 HTTPS、本地名称及 IP 字面量，限制 URL 长度；不声称浏览器 DNS 已固定。所有重定向拒绝，需明确声明最终地址。请求不带凭据/referrer，不使用可变 HTTP 缓存回退；响应须成功、最终 URL 一致、可限长读取、JS 或 text/plain 类型，拒绝 HTML/JSON 类型及明显 HTML 错误页，按有效 UTF-8 解码并保留 BOM。限制为源码 128 KiB、头部 64 KiB、64 条依赖、每项 1 MiB、按执行顺序总计 4 MiB，每次 HTTPS 获取 20 秒；网络结束后再核对权限。

批准和每次执行前都重新核验资产哈希及强 SRI。锁损坏、字节丢失、权限/宿主/文档变化均失败关闭，不自动从 CDN 补取。旧锁读取没有网络调用，撤销下载许可不应阻断仍获准网页上的缓存执行；网页运行许可撤销则阻断。

第三方代码只作为文本进入 `chrome.userScripts`，不在 Service Worker、Sidebar、Controller 中 eval。默认 USER_SCRIPT，关闭 messaging；`@grant none` 不切 MAIN，不隐含 GM、unsafeWindow 或宿主权限。依赖仍能读改 DOM，并可能经网页允许的网络渠道外传数据，USER_SCRIPT 不是网络沙箱。

MV3 远程代码例外限于特定 API 内的执行，不授予整个扩展远程执行豁免，也不能据此保证商店审核通过。[Chrome Web Store 官方政策](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements)。

## 6. 世界隔离与完成回执：反方推动的修订

核对的 Chromium HEAD `script_injection.cc`（blob `4c032bed25466e13a829ccbc0cd6637c9dee45d6`）设置每扩展、每文档 10 个活动 USER_SCRIPT 世界上限；新命名世界超限回退默认 USER_SCRIPT，默认世界也计数。这不是 MAIN 回退，但会影响身份隔离，随机 worldId 不足以证明隔离。[官方源码](https://chromium.googlesource.com/chromium/src/+/HEAD/extensions/renderer/script_injection.cc)。

`preview-worlds.js` 用 `storage.session` 保存每文档分配次数，最多六次；三次精确文档探针确认默认世界的随机全局 const 可跨注入读取，而新世界无法读取它。探针不依赖可被修改的 Object/Reflect。确认该世界已创建且隔离后才发送依赖和用户代码。分配、配置、探针和导航清理串行，预算跨 Service Worker 重启保存。

世界配置可能跨浏览器会话保存，而 session 账本不会。每次 allocate 先读取并清理仅属于 D1 预览前缀的配置，再设置新配置，不碰 Controller、默认或正式 Page world。关闭标签页释放账本；导航不退款旧 document 计数，避免 BFCache 绕过。配置 reset 不销毁旧上下文、监听器或 DOM 效果。[世界管理头文件](https://chromium.googlesource.com/chromium/src/+/HEAD/extensions/renderer/isolated_world_manager.h)；[已核对的配置持久化实现](https://chromium.googlesource.com/chromium/src/+/42b022b36244f99067ec9a6aabbcb00d28c7beaf/extensions/browser/user_script_world_configuration_manager.cc)。

公开渲染器路径回传可选执行结果，因此缺少 error 不能充分证明成功。这是源码风险判断，不是本次原生观察。预览要求随机 nonce、格式版本和布尔 ok 的完成信封；async-main 等待并捕获错误，classic 只在顶层同步结束后追加标记。语法错误、依赖同步异常、空 error、缺少结果或文档错误均不报告成功。信封不具备抗恶意脚本的安全证明效力，更不能授予 Available。[程序化注入源码](https://chromium.googlesource.com/chromium/src/+/HEAD/extensions/renderer/programmatic_script_injector.cc)。

这些预览检查不能保护未来所有自动注册文档。**P2 必须统一盘点本扩展全部 USER_SCRIPT 消费者，为重叠正式程序提供每文档容量与身份准入，容量不足时在执行前拒绝。** 安装时 configureWorld 或预览检查一次，都不能证明未来文档隔离。

## 7. 存储、版本和正式 Page 边界

复用 IndexedDB v2 `frameworkKV` 的无索引键空间，不升级 v3、不另建数据库。原字节用 `ArrayBuffer`，兼容既有原始备份，不存被备份器拒绝的 typed-array view。既有事务泵支持等待 WebCrypto 后继续原子读写；依赖内核使用这一真实接口，提交审核/锁时同时检查 `commandJournal` 宿主有效性，不另造存储层。

资产按哈希共享，审核/批准/来源索引/锁归 namespace；review 和 lock 有持久引用。D1 不自动 GC，删除草稿不会误删批准资产。未来清理须先接入正式 Revision、安装和历史运行引用，再列可删除集合并原子删除未引用字节；当前无 GC 的代价是缓存增长，不能称完整资产生命周期。

Page 合同以 `format:opendesk.page-program.v1`、`runtimeKind:page-userscript` 判别，绑定 programId/revision/sourceHash、entryFormat、声明摘要、lockId、网址/时机/frame/world 规则。通用注册描述复用 `compileLockedPageSource`；旧固定 jQuery 路径改为显式 legacy adapter。可信 proof 绑定全部字段，不信页面或 Sidebar 自称 Available。

P2 尚缺 Page Revision/Candidate 持久化、Page 专用 Verification、Available、显式安装启用、register/unregister/update 和启动/更新/撤权对账。Chrome 文档说明扩展更新会清除注册，需要从真实安装状态恢复；不能重释旧 Task v1 来假装具备这些能力。[Chrome User Scripts API](https://developer.chrome.com/docs/extensions/reference/api/userScripts)。

## 8. 产品与验收

Sidebar 保留“我的任务 / 发现 / 开发”和独立完整任务目录；发现只检索已安装任务。依赖区自动识别、选来源、读取、审核、选锁、添加规范声明并明确切换入口。添加只改真实头部，畸形头部必须先修复；依赖变化清空旧锁，正文变化复用锁。关闭面板或改变声明后，迟到的权限/文件读取不再触发准备。Controller 草稿入口遇用户脚本头明确提示转页面入口。

旧 checkbox 暂留折叠迁移备用，真实 Chrome 迁移验收前不删除。UI 双确认及消费者接线已有组件证据，DOM/client 替身不能证明真实用户手势或浏览器授权。

| 等级 | 可证明的范围 | 不可替代的证据 |
| --- | --- | --- |
| SOURCE_IMPLEMENTED | 文件、Broker、UI、真实预览消费者接通 | 实际浏览器执行 |
| COMPONENT_TESTED | 模块锁、权限、竞态、VM 执行和合同拒绝 | Chrome USER_SCRIPT、权限 UI、真实 DOM |
| BUILD_VERIFIED | 构建、CSP、manifest、依赖完整性和体积限制 | 安装包验收、F3 |
| CHROME_NATIVE_VERIFIED | 必须有真实浏览器回执 | 不能由 VM 或手写 JSON 填充 |
| USER_FLOW_VERIFIED | 用户真实走完声明、批准、执行及离线重试 | 不能由模块测试拼接冒充 |
| FINAL_FRAMEWORK_ACCEPTED | 同最终候选机器账本、原生、F3、ZIP 一致性全门槛 | 代码提交或单次构建 |

真实 CFT155 预检在加载扩展前因 AF_UNIX socket EPERM 中止，见[环境证据与手工验收步骤](../../framework/workstreams/2026-10-08-d1-native-environment-evidence.zh-CN.md)。最短后续是在可启动受控 Chrome 的环境，对同一候选验证 jQuery 和另一普通 HTTPS 库、无保存调试、旧锁离线、MAIN 引用、异常/世界预算及重启；不是继续增加下载器或相似 mock。

## 9. 独立反方评分

多轮只读审计对实际源码修订给出以下判断，与第二节架构适配评分用途不同；不是兼容率测量，不按测试数推导产品完成比例。

| 角度 | 分数 | 保留意见 |
| --- | ---: | --- |
| 用户脚本兼容 | 87 | 明确子集，GM/resource/include/exclude/MAIN 未实现 |
| JavaScript Runtime | 94 | 共享编译单元差异；classic 异步任务不在完成证明中 |
| 供应链 | 95 | 哈希不证明无恶意；许可证/DNS 边界需保留 |
| Chrome MV3 | 92 | 自动文档世界容量未关闭，当前原生行为未验收 |
| 存储与版本 | 94 | 正式 Revision/Installed/history 引用及 GC 未接通 |
| 产品体验 | 91 | 原生 UI/授权未验收，相对来源导入入口未完成 |
| 可维护性 | 95 | 继续复用一个内核，避免不同运行类型复制下载器 |
| 反方验证与证据 | 92 | 组件隔离模型、合同编译不等于原生安装 |

审计推动修复了前置注释隐藏元数据、批准幂等路径错指另一合法锁、全局 main 冒充入口、依赖异常后可能继续注入、世界耗尽回退、配置残留、缺少完成回执，以及面板关闭后迟发下载。这些修复进入真实消费者，未用新增断言替代接线。

不以平均分掩盖硬门槛。达到至少 95 的条件是关闭原生 P1 和安全的 P2 生命周期，并证明明确覆盖的兼容范围；调整评分或将 descriptor 改名为安装不会改变结论。

## 10. 官方资料核对范围

本轮访问 TM/VM 文档、Chrome API 和商店政策现行网页；这些页面没有统一的包语义版本，不能伪造“文档版本号”。Chrome API 页显示更新日期 2026-09-11：基础 API 120+、worldId 133+、execute 135+；Chrome138+ 通过每扩展 Allow User Scripts 开关准入。实现检查实际能力和 API 可用性，不仅检查版本字符串。公开 Chromium 源码是实现风险依据，仍需目标 Chrome 原生验证。
