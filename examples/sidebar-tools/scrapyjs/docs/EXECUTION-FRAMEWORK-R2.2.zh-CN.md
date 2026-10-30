# ScrapyJS R2.2 · Browser / Desktop / Android 统一执行框架（合同权威）

> 状态：**CONTRACT_SOURCE + STATIC_VALIDATION**；真实新执行端均 **NOT_IMPLEMENTED / NOT_TESTED**。2026-10-30；仅新增业务文件，不修改 Host、原 Task 0.4.0、React 产品入口、旧存储或安装包。

## 0. 原始目标与边界

**AI 描述目标 → 受限声明式 Recipe → 审阅目标 / Origin / 请求头 / 执行环境 / 网络预算 → 1–3 页真实试采 → 独立读回 → 保存不可变版本 → 可选长期执行及收费服务。**

- 当前正式业务位置：'examples/sidebar-tools/scrapyjs/'（最新 main 尚无 'projects/scrapyjs/'）；未来迁移**整个目录**，不得复制出第二套实现。
- 复用 'src/App.jsx'、'src/AiPanel.jsx'、'src/app-model.js'、'adapters/app-sdk.js'、'controller/main.js' 与既有 'scrapyjs.capture' 固定 Task。新合同不直接喂给 Task；需要 R2.3 之后的受审 Adapter 明确映射现有字段、校验 Origin / 权限 / Task revision。UI 不能将新模式标记为已安装。
- 旧固定 Task 为 DOM/current-page 采集；本源码 'package.json' Task **0.4.0**，约束为三个固定 Origin、90 秒上限，仍不能自动等同已经安装的旧 0.3.0。没有任何新的 Header、Proxy、Android 权限被本次变更授予。
- 沿用设计依据：[产品路线](PRODUCT-ROADMAP.zh-CN.md)、[AI/代理架构](AI-ENGINE-PROXY-ARCHITECTURE.zh-CN.md)、[移动/社区节点](COMMUNITY-NODES-MOBILE-EGRESS.zh-CN.md)、[竞品/商业路线](COMMERCIALIZATION-COMPETITORS.zh-CN.md)，无需复制其长篇规划。源码审查另读 'src/framework/sdk/registry.js'、'src/platform/chrome/network.js'、'src/platform/chrome/browser-fingerprint.js' 和 'nodes/poc/'。

## 1. 唯一合同与代码文件

| 文件 | 职责 |
| --- | --- |
| 'contracts/execution-v1.mjs' | 合同权威 'CONTRACT_SCHEMA'、声明式结构校验、Header 分类、引擎匹配、Plan 审核、RunReceipt 强一致校验、Recipe 规范化 SHA-256 |
| 'contracts/execution-v1.schema.json' | 从权威模块生成的 JSON Schema Draft 2020-12，供 Android/ Desktop 复制消费；**不得手改** |
| 'contracts/generate-schema.mjs' | 本地更新上述 JSON Schema 的唯一生成器 |
| 'tests/execution-v1.test.mjs' | Node 纯业务测试，验证 Schema 同源、拒绝非法 Header / SSRF / JS 能力漂移、授权、Stop 和结果 |
 
合同标识为 **'scrapyjs.execution.v1'**；Recipe、Profile 自带不可变 SemVer 'version'；同一 Recipe 的 'sha256' 是对 **移除 sha256 后、按键排序、数组保序** JSON 的 UTF-8 SHA-256。计划与回执绑定 Recipe SHA、Plan、节点及所用 Profile 精确版本。仅传入散列不能证明权限或真实性；必须由受信 Adapter 真正重算并验证。

**跨仓库兼容规则：** Browser 'main' 为唯一合同源。R2.3 Android 和后续 Desktop 只能从**明确的 Browser 提交完整 SHA**取 'execution-v1.schema.json' 快照，记录其 SHA-256 与合同标识；需对同一个 Schema 和黄金允许/拒绝 JSON 测试向量做兼容测试。禁止另写可自由演化的 Android / Desktop Schema。变更必先在 Browser 升级合同版本并验证向后兼容，再更新客户端副本。旧版本不得被静默重解读。

建议复核命令（Node 可用后）：

~~~sh
node --test examples/sidebar-tools/scrapyjs/tests/execution-v1.test.mjs
node examples/sidebar-tools/scrapyjs/contracts/generate-schema.mjs
git diff --exit-code -- examples/sidebar-tools/scrapyjs/contracts/execution-v1.schema.json
sha256sum examples/sidebar-tools/scrapyjs/contracts/execution-v1.schema.json
~~~

## 2. 六种合同的边界

| 合同 | 核心含义 | 绝不是 |
| --- | --- | --- |
| Recipe | 目标 HTTPS Origin、字段 CSS 规则、'dom' 或 'static-html'、限制、版本/哈希 | 可执行任意 JS、Task 安装权限、登录凭据 |
| HeaderProfile | allowlisted headers，受审 UA override 意图和 opaque credentialRef | 原始 Cookie/Authorization/密钥明文 |
| NetworkProfile | 'browser-current/direct/approved-proxy/cellular'，代理仅保留 profileRef | 修改公网 IP、设置 TLS、任意代理 URL |
| NodeCapabilities | 明确节点引擎、每项实际已验证支持、Origin、预算与证据引用 | UI 自行声明的授权/设备检测结果 |
| ExecutionPlan | 试采/长跑、引擎、锁定版本、Origin、审批引用、最终预算 | 一个可以越权执行的 JSON token |
| RunReceipt | 原 runId、状态、真实流量与结果 SHA、Stop / 退休 / 独立读回 | 仅 HTTP 200 / 成功提交 / Mock 样本即完成 |

本模块 'validateShape' 负责完整对象字段与类型白名单、有限数组、深度、未知字段拒绝；'validate*' 负责结构和业务边界；'evaluateExecution' 返回所有不兼容原因，'assertExecutable' 供实际调度前短路。它们是**业务准入第一层**，不代替 Host/设备的真实鉴权、DNS、网络证明或 Budget enforcement。

## 3. 引擎语义：不能把静态 HTML 当 JS/DOM

| 执行类型 | DOM JS | 原始 HTML | 请求头覆盖 | 网络出口 | 当前实际状态 |
| --- | --- | --- | --- | --- | --- |
| 'browser-tab'（默认） | 有；现有受控网页 Task | 非独立静态 HTTP Adapter | **不能承诺修改原网页导航请求头**，本合同拒绝自定义 entries | 当前 Chrome 网络 / 当前授权 Tab | 旧固定 DOM Task 有历史证据；新合同尚未接入 |
| 'desktop-http' | 无 | 候选；须引擎/解析器与收据验证 | 仅节点通过测试、声明支持且用户批准的项 | 直连或受审**任务级**代理 | Desktop HTTP API 存在，ScrapyJS Adapter NOT_IMPLEMENTED |
| 'desktop-browser' | 需真正渲染 JS 且独立读回 | 可选 | 依目标页面网络拦截能力单项测试；不能默认认为支持 | Desktop 自有浏览器上下文 | ScrapyJS Adapter NOT_IMPLEMENTED |
| 'android-cellular' | 当前 PoC **无 JS 浏览器渲染** | 受控 HTTPS GET PoC | 每个 Header 独立真实测量后才能宣称可用 | Android 已验证蜂窝 Network | 独立 Java / Mac PoC 源码存在，**真机验证 NOT_TESTED** |

未列出的 Cloud 仅留后续合同版本；不能现在标记 available。对 'dom' Recipe，'desktop-http' 与 'android-cellular' 即使宣称支持也会被拒绝（代码检查其不应报告 dom/JS），须用户审阅切换为新的 'static-html' Recipe 才能运行；不得自动修改提取语义。当前 DOM Task 的选择器 DSL 与本 v1 **通用 CSS 字段**尚需映射 Adapter；这不是直接兼容保证。

## 4. Header 真实性四分类

| 分类 | v1 政策 | 不应向用户承诺 |
| --- | --- | --- |
| **允许配置** | 小集合 'Accept', 'Accept-Language', 'Cache-Control', 'Pragma', 'Content-Type' 及受限自定义 'x-*'；小写规范化、拒绝 CRLF / 重名 / 超长 | 在 Browser Tab 里能改页面请求头；所有 Node 都支持 |
| **运行环境管理** | 'User-Agent' 只经 'userAgent.mode=override' 进入受审能力；'Sec-CH-UA*' 由浏览器/客户端环境生成；TLS、DNS、出口 IP 是网络属性 | 修改 JS UA 就等于所有网络 UA-CH/TLS/IP 一致 |
| **需要独立授权** | 'credentialRef' 由可信 Vault / 权限明确解析；当前页会话靠另行允许的 'session-use'；UA override / proxy / cellular 需匹配权限与实测节点能力 | 在 Recipe 中放明文 Cookie/Token 或偷偷携带登录态 |
| **明确不支持** | 原始 'Host/Origin/Referer/Connection/Content-Length/Transfer-Encoding/Proxy-Authorization'、'Sec-*' 注入、'X-Forwarded-*' 来源伪装及其他高风险头 | 配置就可突破浏览器禁用请求头、改变 TLS ClientHello 或伪装真实出口 |

源码核对：
- 'src/framework/sdk/registry.js' 的 'normalizeConfig' 过滤 cookie / authorization / host / origin / referer / sec-*；'src/platform/chrome/network.js' 使用 'credentials: omit' 和 'redirect: manual'。该 API 是**受限网络请求**，不是 ScrapyJS 当前页 DOM 下载器的全权 Header 注入。
- Browser Fingerprint 已具 CDP 'Emulation.setUserAgentOverride'，但是独立的高敏授权 Session；没有自动暴露给 ScrapyJS，也未证明所有网络 Client Hints 与 UA 一致。
- Managed Proxy 是**浏览器级持有锁、已审批路由**；不得当作 ScrapyJS 任务级代理。现有 Android PoC 使用 Android 'Network.openConnection'；其 Header 覆盖能力、双网络出口及设备兼容必须在 R2.3 按项验证。

## 5. 网络、鉴权、安全与独立结果验证（执行端必须实际实现）

1. **Origin / SSRF**：合同默认只支持公开 HTTPS 单 Origin；唯一局域网 Fixture 'http://127.0.0.1:43111' 只允许已经审批的 'browser-tab' 老 Task，Desktop/Android 明确拒绝。所有引擎应先验证 Origin 和用户 grants；对每次 DNS A/AAAA 的所有候选地址以及最终选中的连接 IP 都要拒绝环回、内网、链路本地、元数据等地址；防范 DNS rebinding、CNAME 路径和 IPv4-mapped IPv6。不能仅凭本模块的主机名语法通过。Android DNS **按选中 cellular Network 解析**。
2. **重定向**：按 'limits.maxRedirects' 分跳手动判定目标 Origin / DNS / IP / 登录携带规则；超过上限、离开审批范围及不可观测的隐式跳转立即拒绝；不自动跟随跨 Origin。浏览器 DOM 跳页仍以原 Document 绑定和可信 RunHost 路径核验。
3. **最小权限**：v1 仅公开只读采集模式。真实授权由安装身份、Task sourceHash/Origin、用户审批及设备配对/撤权共同核验。'NodeCapabilities.evidenceRef'、'approvalRef' 是**opaque 查找引用而不是签名或授权证明**，UI 输入、AI 生成的 JSON 不得填充为真；Host 验签/信任建链并检查租期、撤权、设备所有权。
4. **预算**：'maxPages/Requests/ResponseBytes/TotalBytes/DeadlineMs/Redirects' 同时受 Recipe、节点及用户 Plan 限制；有效预算取每项最小值。每次请求与响应流式计数，必须强制 Stop / 中断 / 阻止追加请求；计费或移动蜂窝流量上限需另加真实账本，不能把这里的 maxTotalBytes 视作移动套餐精确计量。
5. **状态未知**：必须持久化 'planId + runId + idempotencyKey'；未知开始/未知 Stop 不得“重试开始”。先读取原 run 状态；Stop 请求受理 ('accepted') 与原执行实例已释放 ('retirementState:released') 分开。未释放不展示“已安全停止”。
6. **结果**：必须保留原始响应或 DOM 提取源证据、提取记录、结果 SHA-256 和预算计数，并使用**独立于执行请求**的读取通道复核。完成态 ('completed') 只有回读成功 + 实例 released 才合法；蜂窝完成态还要求独立出口证明，未知出口应保留 unknown，不伪装为已走蜂窝。
7. **数据与安全**：不上传 Cookie/完整已登录页面/手机号/设备 IMEI；证书校验不可跳过；禁止隐藏转发、公网代理开放、未授权自动改出口、自动轮换 IP、验证码或访问控制绕过。敏感值只用 Vault 引用，日志/Receipt 输出脱敏。

本轮实现的是 **静态合法性与能力审计**；真实 Host 尝试、DNS 解析器、长任务 Broker、金钱账本、设备实测均为后续任务，不能把 Node 测试当作运行能力证明。

## 6. React 入口与交互方案（本轮只显示交互 Mock，不造第二套正式 UI）

保持 'src/App.jsx' 的原「采集配置 / 采集目标 / 开始停止 / 采集结果、采集规则、配置 JSON」流程。未来在「采集目标」与开始操作的同一区域增设：

- **默认一行**：执行位置「当前浏览器」（默认），旁可切换「电脑 HTTP / 电脑浏览器 / 安卓蜂窝」。只有能力已验证且与 Recipe 匹配才可点击试采；不可用显示具体原因/替代位置。
- **一次确认**：展示目标 Origin、当前浏览器登录会话状态、预计 1–3 页、允许的 Header 个数与选择的出口；点击「试采」只是对**真实已授权**节点生成计划并交给相应适配器，Mock 不能显示运行成功。
- **高级折叠**：Header Profile（参数编辑及 UA 是否可控）、Network Profile（直连/受审代理/蜂窝，不自动全局改代理）、登录/预算、技术证据；非专业用户不被这些选项挤占空间。
- **结果页沿用**：原表格与 JSON/CSV 导出、状态 unknown/Stop / released；新增来源、运行收据与独立回读标签。保留脏草稿确认，不自作主张替换配置。
- **预览**：在当前对话可交互的 HTML 仅模拟兼容判断与按钮状态；无真实任务/真实网络、无增 Host 权限。正式 React 后续接入须复用 App 与同一 SDK，禁止平行产品 UI。

## 7. R2.3 交接：Android 直接消费什么、不再重做什么

**直接消费**：'contracts/execution-v1.schema.json'（固定 Browser commit SHA + 文件 SHA-256）、Recipe / HeaderProfile / NetworkProfile / ExecutionPlan / NodeCapabilities / RunReceipt 六结构、大小/状态/错误分类规则及同一批成功/失败 JSON Fixtures。R2.3 只开发 Android **静态 HTML / 蜂窝 Network** Adapter，先在 'todo-user' 中按用户批准的独立目录集成 PoC，做机器可判定的 schema/能力一致性测试，最终对齐 Browser Authority 的冻结 SHA。

**R2.3 不重复**：合同定义、Browser React 重设计、Task 0.4.0 重冻、社区代理、收费、云 Broker、Desktop Worker。只做手机真机网络隔离、DNS/TLS/重定向、独立 Receipt、停止/结果回读；先 1–3 页同源授权站点，不能满足条件则明确 BLOCKED/NOT_TESTED。跨仓库修改必须另得授权并保持原 Runtime 责任边界。

## 8. 验收门禁

| 层级 | 本轮预期 |
| --- | --- |
| 合同 JSON / JS 结构与失败分类 | 以真实 Node 单测输出为准；不因文件存在即 PASS |
| UI | 对话内互动 Mock 可预览，**不等于正式 React/扩展 UI 已接入** |
| Browser 新合同 → 原 Task / Host | NOT_TESTED，未集成 |
| Desktop HTTP / Desktop Browser Adapter | NOT_IMPLEMENTED |
| Android build / 真机双网络 | NOT_TESTED |
| Mac Chrome / REAL_RUNHOST / REAL_NETWORK / CLOUD / BILLING | NOT_TESTED |

通过后仍需隔离安全评审：源代码能拒绝违规配置 ≠ 所有潜在 DNS、重定向、Cookie 与出口问题已经被真实运行时阻断。


### R2.2 GitHub CI 的隔离运行边界

本工具声明 `app.ci.json` 且自动发现本目录的 `*.test.mjs`。由于全仓 `npm run build:dev` 当前存在跨产品迁移后的旧路径未解析（`src/ui/conversation/provider-consumer.js` 引用 `examples/sidebar-tools/ai-knowledge-answers/trusted/ai-request.js`），**ScrapyJS 的 CI 不应通过扩 Host 路径或修改 Runtime 绕过该阻断**。因此该 App CI profile 不设置 `host: development`，单独编译当前 ScrapyJS React IIFE；Chromium 测试实际加载该 IIFE 与原 React 19.2.0，但 **仅以最小 Button shim + 既有 memory mock** 测通操作（不是原生安装和完整设计系统截图）。全仓 Host 正式构建仍为 BLOCKED，并需产品迁移专项处理；该浏览器模拟测试不提升此事实。

## 9. Android / Desktop 可复制的互操作测试向量

`contracts/fixtures/execution-v1-vectors.json` 是**纯 JSON、可跨语言读取**的稳定样例：包含六份完整合同、具备真实 SHA-256 的 Recipe 黄金值、一个静态 HTML Desktop HTTP 允许例、DOM / Header / Authorization / DNS / 网络路由拒绝例，以及完成收据的正/负例。`fixturesOnly: true` 明确其 `approvalRef` 和 `evidenceRef` **是虚构测试值，不代表用户授权、真机可用或实际抓取**。

Browser 的 `tests/execution-interop.test.mjs` 对全部跨语言样例执行验证；R2.3 Android 将相同 JSON 文件以本轮最终 `main` 提交 SHA 和自身文件 SHA-256 固定拷贝，逐一复现 expected supported/reason/error，先验证静态合同，再进行独立真机网络测试。失败码不能在 Android 被吞掉或改解释，不需要复制 JS 引擎或建立第二套 Schema。
