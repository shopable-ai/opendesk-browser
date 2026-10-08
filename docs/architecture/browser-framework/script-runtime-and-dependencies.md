# R3 页面用户脚本、正式 Task 与第三方依赖：不可变决策

> 2026-10-08；本文件是 **人工架构决策与候选实现说明**，不是第二个机器状态账本或 Chrome 验收报告。
> 基线：`main@7bf72497c14d97a2b5cdedd642c4599c46c1983f`，Legacy `todo-user@0dc7b07959f762e5be8f2f3847a71dc8c4b16aa5`，附件 `third-party-library-map.md` SHA-256 `40d1bb9392f4450b26bb030a082fa393fb867d8b41ca0965a41d79d9c171ee72`。
> 证据等级：源码和本轮局部 Node 测试；**无最新构建 / 原生 Chrome / 完整用户闭环证明**。R3 分支未合并。

## 一、主线与职责

`开发/导入 → Program Revision → Task Candidate → Verification → Available → 安装/启用（不自动执行） → 参数运行或批准 URL 自动匹配 → durable Run/Result → 重启仍可用`。

- **Controller Program**：原 `RunHost → Controller Authority → sandbox Worker → PageProxy/ChromePage → 现有 native-driver → Result/Stop`，脚本返回值使用 `return`；不得复制一套 controller/broker/storage。远端 main 的 Worker 仍使用 `AsyncBody(data.body)`，不能说标准 `async function main()` 主线已合入。
- **Page User Script**：在用户主动安装启用且通过站点批准后，`chrome.userScripts.register` 的 `USER_SCRIPT` world 自动匹配和执行，允许长驻 DOM/事件行为。一次 `async function main()` 的返回不等于 Controller durable Result；需要单独的原生回执/状态观察。
- **Task** 是经验证的交付物；Program Revision 是不可变代码版本；用户脚本的注册**不是** Verification，也不是 Available。保存源码 ≠ 安装 ≠ 执行 ≠ 验收。
- 页面代码不自动接收 `chrome`、`OpenDeskSDK` 或现有 Controller 运行身份。任何扩展服务仍须既有 Broker/Authority 基于可信 sender/target/script identity 与 grant 独立批准。网页自行上报身份不能成为 Authority。

## 二、决策账（Decision ID / 日期 / 依据 / 变更理由）

| 决策 | 2026-10-08 的结论 | 依据、被否决方案与修订条件 |
|---|---|---|
| R3-DEC-001 | Browser-First，普通用户不依赖 Codex/MCP/Native/HTTP server | R3 正式任务书。否决“先接桌面 Host 才能运行”；后续仅可作为制作端。 |
| R3-DEC-002 | 保留现有 Controller Authority/RunHost/IDB；增加 Page Program 作为另一生命周期 | main `src/run-host.js`、`platform/host/controller-methods.js`、`framework/control/native-driver.js`。否决复刻第二执行器或结果库。 |
| R3-DEC-003 | 冻结源码 `scriptId/revision/contentHash`、manifestHash 和 `dependencyLock`，更换库须产生新 Candidate/Verification | 不应让 r2 改动 r1 Available。main 只有 Controller revision；正式 Task 冻结资产链**未实施**。 |
| R3-DEC-004 | 默认 `USER_SCRIPT`，每个具体 Candidate 独立 `worldId`；`MAIN` 首版 fail-closed | `page-program-package.js` 仅输出原生注册描述。MAIN 不支持 worldId，`noConflict(true)` 不能消除所有副作用；须另行每站点授权、真实 Chrome 实测再放开。 |
| R3-DEC-005 | 初版只支持固定 `jquery@3.7.1` 完整上游包，SHA-256 `fc9a93dd241f6b045cbff0481cf4e1901becd0e12fb45166a8f17f95823f0b1a`、MIT、package `vendor/jquery-3.7.1.min.js` | 官方 `jquery/jquery@3.7.1:dist/jquery.min.js`、`LICENSE.txt`；`scripts/build-contract.mjs` + `check-source.mjs` + `verify-package.mjs` 分别检查代码锁、源文件 bytes/hash 和最终 package allowlist/bytes/hash。否决 CDN 运行时代码、npm 解析器、隐式多版本升级。 |
| R3-DEC-006 | 依赖代码在已批准 USER_SCRIPT world **先注入**，再以同 world 的 `jQuery.fn.jquery` 作为同步 ready 守卫，失败禁止运行 `main` | `page-program-package.js` 将固定依赖 code source 放在用户 code source 前；实际 Chrome 顺序/失败回执仍 `NOT_TESTED`。没有从 SW 或 Controller Worker 执行 vendor。 |
| R3-DEC-007 | 未保存草稿的立即测试是临时授权的独立 admission，不写长期 ScriptRevision/Available | 远端 main 尚无此入口；[草稿运行 PR #4](https://github.com/shopable-ai/opendesk-browser/pull/4) 正在处理。避免冲突，R3 不改 `run-host`、`script-editor` 或 `controller-methods`。 |
| R3-DEC-008 | 注册只由现有受信 Broker 在 **Available+用户启用+权限核验** 后执行；禁用须 unregister、阻止后续服务；旧 DOM/事件仍可能存活 | `preparePageProgramRegistration` 的 `authority.assertAvailable` 是**必须实现的调用方合同**，不是新的 Authority。当前没有可调用的正式 Task 准入；因此未接 Sidebar 或 SW。 |
| R3-DEC-009 | Chrome 原生操作必须绑定获准 tab/frame/document；不能只凭 URL 或 active tab 补位 | 手动 `execute` 需用户动作和文档 fence；`register` 属未来文档 URL 自动匹配，不能假造一次性运行的 documentId。frameScope 必须授权。 |
| R3-DEC-010 | 仍采用机器原账本 `docs/framework/source-compatibility-ledger.json` 和 release/acceptance，不另造状态总账 | 候选 branch 新建的 `implementation-status.md` / workstream JSON 是人工交接与独立工作流证据；不更改历史 owner/receipt。 |

## 三、候选实现：什么真正存在

- `src/scripting/user-scripts/page-program-package.js`：**纯编译器**，不直接调用 Chrome、不拥有权限。检查源码 SHA-256、固定 revision、manifest `entryFormat=async-main-v1`、HTTP(S) matches/excludeMatches、runAt、frameScope、world、依赖锁；调用方须提供现有受信 Authority 的 `assertAvailable(candidateId)` 回执，验证 ID/manifestHash/revision/approvedMatches/安装启用后产出 `chrome.userScripts.register` 描述。
- 同 Candidate 的 `worldId` 为固定 SHA 派生、不同 revision 独立，默认 USER_SCRIPT；包装器用各 world/document 的 Symbol + Set 同身份防重复，随后执行 `async function main()`，错误打印但不冒充持久 Result。
- `src/scripting/user-scripts/packaged-dependencies.js`：只从 `chrome-extension://` 固定文件 URL 取 JS 文本；先 hash 再交给受信侧注册；绝不在 SW 执行。不存在任意 JS 的 HTTP/CDN 载入或注入特权上下文。
- 内置 `src/vendor/jquery-3.7.1.min.js`/许可证。构建脚本复制静态文件到 `vendor/` 和 `licenses/`，package verifier 对该 vendor 实行精确 hash 特例，而不是把其当受控 WXT executable entry。发布需实际 build + ZIP 逐文件校验。

**重要**：上面描述只是即将供正式 Task 调用的可复用实现组件；当前 main 缺少 Candidate/Verification/Available 和安装 UI/registry 对账，注册描述**尚未被产品实际消费**。不能以本文件或 Node 测试说明用户能自动运行。

## 四、反方审计与边界

1. **假冒 Available**：调用方可在 JS 中伪造函数；纯编译器不是安全边界，生产调用必须由现有可信 Host Authority 提供真实事务 CAS 结果；调用前和注册生效前需 recheck，避免撤权竞态。旧版本引用资产需 pin 并禁止 GC。
2. **自动匹配与目标**：matches 不是授权。注册/enable 和刷新、nonmatch、停用应由真实同包 Chrome/Sidebar 观察；SPA 默认不因 URL 变化重复 `main`。注册更新与 SW/扩展重启的重建机制 `NOT_IMPLEMENTED`。
3. **jQuery 冲突**：USER_SCRIPT worldId 隔离不是网站 MAIN jQuery 的来源；MAIN 模式未启用，不能宣称已证明 MAIN 全局保持不变或两版本共存。包内完整 jQuery 与旧 3.2.1 是不同版本与 world。
4. **错误和停止**：`register` 无逐页面 `InjectionResult`，必须额外建立被许可的受信观察与停止/cleanup 合同。移除注册无法撤销已执行 DOM/事件副作用；本候选没有停止器、持久 page-run、error receipt。
5. **跨环境 HTTP**：Legacy 后台 Axios、MAIN 页面 axiosx、普通 Axios 三条链不可合并；Current `credentials:'omit'`/认证头受限，`TimeReview` 不能宣称全兼容。详见 [迁移双表](third-party-library-map.md)。
6. **资源失控**：自定义本地 `.js` 导入、MAIN 单站点授权、混合版本和高权限服务属于后续切片，未验收不启用；第三方资源不得进入 SW/Controller Worker。

## 五、测试与交付等级

2026-10-08：在独立容器对新增模块执行 `node --test tests/environment/page-program-package.test.mjs` **4/4**（包含缺失授权、源码/hash 篡改、MAIN/全 frame 违规、同一文档去重、修订隔离、恶意远端库 URL 禁止）。这是 **组件定向 Node 证据**，不是 `BUILD_VERIFIED`、`CHROME_TESTED` 或 `USER_FLOW_VERIFIED`。

真实退出门槛：最新同 HEAD 构建 verifier/ZIP → Chrome userScripts 许可开关和用户站点授权 → register / reload once / nonmatch zero / disable next-page zero → USER_SCRIPT 中真实 DOM + jQuery 3.7.1 → 网站 MAIN 全局前后同一引用 → 第三方依赖回执与 Run/Result/Stop → 浏览器关闭重启仍可用。原始最终验收 603+19 / F3 保留在独立最终候选，不在本分支重复全量运行。
