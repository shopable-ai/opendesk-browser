# ScrapyJS R2.4.1 · HTTP Adapter 边界及后续准入

> 本文保留 R2.4.1 历史 CI 失败与边界。当前源码、包一致性、本机 Chrome 及评分见 [R2.4.2 本机验收](LOCAL-ACCEPTANCE-R2.4.2.zh-CN.md)。旧运行 `41042514274` 仍为 FAIL；当前 main 已由其他对话晋升 App 1.6.4，本轮不重复发包。公网 HTTP 仍 BLOCKED。

## Header 修改、删除与触发链（2026-10-30，增量）

实际 owner 仍为本目录；复用原 NetworkService、静态字段解析、Node 回显服务与已关闭的自有 CFT155 Profile 副本，没有新建网络 Runtime。下一条产品操作是「配置 Header 后开始 HTTP 试采」，目前阻塞在原 App **没有 HTTP 执行入口**。本轮完成可独立验证的本地传输分支，不把诊断控件接成假的产品按钮。

**两条触发链分别取证：**

- 原安装入口：`src/App.jsx` 的「开始采集」→ `app-model.start()` → `adapters/app-sdk.js` 的 `tasks.read({taskId:'scrapyjs.capture'})` 取得安装 pin → `tasks.start({task,clientRequestId,params})` → `controller/main.js` / `runCapture()` → 受控 DOM `page`。`params` 为 URL、itemConfig、其余声明式 options、选择器和超时；App/Task 配置白名单均无 Header/UA。原安装页面再次打开，仅有 DOM 开始入口；固定 App 1.6.4 / Task 0.4.1 未改。
- 本地诊断入口：在自有 loopback 页面编辑 Header JSON → Chromium 实际输入点击 `Run diagnostic`（`event.isTrusted=true`）→ **原** `createNetworkService().request({method:'GET',url,config:{headers,responseType:'text',timeout}}, {signal})` → 原生 Fetch → 独立 Node 服务保存 `headers/rawHeaders`。每个 URL 带 `runId` + 请求序号，关联同次配置、提交、CDP requestId、服务端观察和完成/错误/停止结果。测试专用 `authorize` 仅允许同一 loopback Origin、GET 和固定路径，不是安装 Authority。

| 操作 | 服务器实际观察及同次结果 |
| --- | --- |
| A → B | A 三页均 `accept:text/html`、`x-client-tag:header-A`；B 三页均 `accept:application/xhtml+xml`、`x-client-tag:header-B`，没有串用 |
| 删除两个字段 | Fetch 提交 `{}`，三页均无 `x-client-tag`；Chromium 默认补 `accept:*/*`，不能把删除配置说成线上没有 Accept |
| 运行中改编辑器 | 首页由服务器挂起后把 A 改 B，再释放；该次三页仍是启动时 A，结果属于原诊断 runId |
| Stop / 超时 | 各只发第一页流式请求；分别 `E_CANCELLED` / `E_TIMEOUT`，服务器均提前关闭，未请求第二、三页；后续独立运行正常 |
| 被拒配置 | UA（含混合大小写）、Cookie、Authorization、Host、Origin、Referer、Sec-CH-UA、换行、非字符串/null/数组，共 12 组；全部 `E_CONFIG_UNSUPPORTED`，零授权回调、零 Fetch、零服务端请求 |

本次共 19 个诊断场景、17 个真实 HTTP 请求，每条均有 Fetch/CDP/server rawHeaders 关联。所有场景结束后另观察实时日志 1000ms，按 runId 核对未出现迟发授权/提交；浏览器与服务器关闭后再次核对最终 URL 顺序及计数。这个有界观察不是无限期保证。普通 Header **本轮实证范围只包括 Accept、X-Client-Tag**；合同中的其他 configurable 名称不据此升级为 Chromium 实测通过。现有 `credentials:omit`、`redirect:manual`、8192 字节响应上限不变；没有上传凭据或改 UA/UA-CH。原始报告和代表性 rawHeaders 见 [证据索引](../evidence/http-header-transitions-20261030.json)。

| 层次 | 当前状态 |
| --- | --- |
| SOURCE | 诊断触发与关联已接线；产品 HTTP 未接线，原引擎/SDK/包未变 |
| NODE | 新定向检查：DOM Task 对 Header/UA/伪造 browser-http 配置返回 `E_CAPTURE_CONFIG`，受控 page 访问为零；原 SDK/Host Header 历史证据保留，不冒充本轮重测 |
| CHROMIUM | `PASS_CHROMIUM_HEADER_TRANSITIONS_DIAGNOSTIC_ONLY`，CFT155，静态 development 自有快照、无 serve；不是产品网络构建/安装验收 |
| INSTALLED_APP | 原 App 入口已打开，存储中 App 全部正式包字段与 1.6.4 源包一致（SHA `42fdb94d…`），含 Task 0.4.1 委托 pin；这不是独立 Task 安装/运行回执。HTTP `BLOCKED_NO_APP_HTTP_ENTRY`，正式 HTTP runId、退休、持久结果身份及 SHA 读回均 `NOT_TESTED` |
| UA | Browser 路径 `UNSUPPORTED`、发请求前拒绝；本地 Desktop Go HTTP 源码支持把调用者 Header 写入请求，但 Browser→Desktop 受审接入及服务端 UA A/B 实证 `NOT_TESTED` |

**已定位的公共能力缺口：** [公开 API](../../../../docs/api/browser-sdk.developer.generated.md#opendesksdkbrowsernetworkrequest) 已有 `OpenDeskSDK.browser.network.request`，不是“完全没有 HTTP 方法”。但它按每次可信确认执行；ScrapyJS 包没有 network 能力、合法 `browser-http` 类型，既有 DOM Task 也不接收该配置。更关键的是现有公开传输/回执不能提供本任务要求的完整 DNS A/AAAA/CNAME 与最终 peer 安全证明、安装身份绑定的不可变 Recipe/Plan/预算、一次审阅 1–3 页、Stop 退休及持久结果 SHA 独立读回。仅在工具内增加表单或声明能力无法补齐这些可信事实。实际复现是原 App 无 HTTP 入口；向现有 `runCapture` 传入 Header/UA/`browser-http` 均在页面操作前被拒绝。

后续平台范围应复用原 Host/Authority/NetworkService，为多个静态 HTTP 工具补齐上述受审准入、连接安全、预算及可读回运行合同，业务仍留本工具。UA 另需已有受审且证实支持的执行引擎及明确授权；当前不放开拒绝、不使用 DNR/debugger/CDP 改头、不新建 Node/Go 采集服务。本轮只定位此缺口，未实施平台扩权；公网 production HTTP 仍 **BLOCKED**。

```sh
# 仅验证现有 DOM 入口不会静默接受 HTTP 配置；不是 HTTP 产品成功证据。
node --test --test-name-pattern='DOM capture refuses HTTP headers' examples/sidebar-tools/scrapyjs/tests/capture-config.test.mjs
# 需要原已关闭的任务自有 seed Profile；out 必须为新目录，不重复旧基线/外站采集。
node examples/sidebar-tools/scrapyjs/tests/http-header-chromium.mjs --scenario=transitions --out=artifacts/scrapyjs/http-header-transitions-new
```

本机的 seed 报告默认位于 `artifacts/scrapyjs/r242-local-acceptance/native-app-lifecycle/report.json`；可用 `--seed=<已有关闭的自有报告>` 指定，报告必须含关闭状态及 Browser/Profile/静态快照路径。不是可在任意机器无前置安装状态运行的裸 HTTP 命令。测试自行关闭回显服务和自有浏览器；未重放 AI、未访问外站、未晋升包，production/完整 CI/评分仍延期。

## Header 真实请求增量（2026-10-30）

下一条用户操作仍是「审阅允许 Header → HTTP 试采」；本轮从真实「扩展 → scrapyjs」入口只读确认原 App 只有 DOM 采集，没有可运行 HTTP 按钮。复用原业务 owner、解析函数与 NetworkService；诊断在自有已关闭 Profile 副本及隔离静态 development 快照运行，未连接 serve，未更新日常 Chrome、原 unknown AI 请求或正式包。

| 事项 | 新实证及边界 |
| --- | --- |
| 普通 Header | 三个真实本地 HTTP 页面，配置 `Accept:text/html`、`X-Client-Tag:scrapyjs-local-header-proof`；原 NetworkService 传给原生 Fetch 的小写参数、CDP ExtraInfo 和独立服务器收到的值一致，均 200。服务器只有收到这些 Header 才返回列表。不是 Mock fetch。 |
| 真实数据 | 三页分别返回「第一项 / 第二项 / 第三项」及 ID 1/2/3；原静态 HTML 提取与独立预期逐值一致。每页 49 bytes，传输上限沿用 Sidebar 8192 bytes，没有扩大 SDK。 |
| User-Agent | 修复前配置及 Fetch 参数为 `ScrapyJS-Header-Probe/1.0`，服务器却观察到 Chromium 默认 UA。修复唯一 `normalizeConfig()` 禁项后，SDK/Host 与 Chromium 原服务均返回 `E_CONFIG_UNSUPPORTED`，实际 `/agent` 请求为零；不声称 UA 可控。 |
| 凭据与浏览器管理字段 | Cookie、Authorization、Host、Origin、Referer、UA-CH 均在传输前拒绝；普通请求仍 `credentials:omit`、`redirect:manual`，服务器未收到 Cookie/Authorization。未使用 DNR/debugger 改头、导出 Cookie 或修改 TLS/IP。 |
| Stop | 服务器已开始实际流式响应后取消原 AbortSignal，原服务返回 `E_CANCELLED`，服务器观察到未自然结束即关闭；只证明 Fetch 取消，不证明安装态 HTTP operation 退休。 |
| SHA 读回 | fixture 结果写入任务自有 `records.json` 后独立读取、逐值比较并重算 SHA。不是可信 Host 结果存储、安装身份或 v1 RunReceipt 的证明。 |

**可信边界不变**：回显服务器与测试专用 `authorize` 只允许固定 loopback Origin/GET/路径。这不是原安装 Authority、生产批准或公网 DNS/peer 校验；源模块在普通 Chromium 诊断页执行，不是最终 Browser 构建或已安装网络功能验收。旧快照只用于核对原 App 入口，当前网络源码另以逐文件 SHA 绑定。`SOURCE_COMPLETE`、`NODE_PASS`、`CHROMIUM_SOURCE_TRANSPORT_PASS`；生产 `REAL_BROWSER_PASS`、`REAL_DESKTOP_HTTP_PASS`、`MAC_DESKTOP_PASS` 仍 **NOT_TESTED**，公网生产仍 **BLOCKED**。

只运行新缺陷对应检查：原 Header SDK/Host/真实 Node HTTP 三项，以及共享 Driver 四种方法/配置拒绝五项；不重复旧 200 项、全量构建、DOM 安装链、评分或 R2.5。修复前新增 UA 回归先 FAIL，修复后通过。原始两次 Chromium 报告均保留在 artifacts；源码、报告、结果与日志摘要见 [证据索引](../evidence/http-header-proof-20261030.json)。

```sh
node --test tests/environment/browser-sdk-network-headers.test.mjs
node --test --test-name-pattern='CMP13|denied URL and config' tests/framework/k4-network.test.mjs
# 需要已有关闭的任务自有 Profile 与 CFT155；out 必须是尚不存在的新目录。
node examples/sidebar-tools/scrapyjs/tests/http-header-chromium.mjs --out=artifacts/scrapyjs/http-header-proof-new
```

Desktop 只读核查：本机 `opendesk/master` 尚无指定示例，但远端固定提交 [`9d79d3be`](https://github.com/shopable-ai/opendesk/tree/9d79d3be48536adfac9304f15c4c31651ee3921a/examples/scrapyjs-desktop) 确实存在。已读 README / main；沿用 `node tests/scrapyjs-desktop/fixture-server.mjs` 及原 `opendesk ai run … --input-file …` 入口即可做后续本机验证。该示例自己声明 DNS 全结果和连接 peer 不可观察，回执只是本地投影，`fixtureClaimedHeaders` 不等于可信 wire 证明；不能解除生产 BLOCKED。本轮未修改、启动或测试 Desktop。

当前停止条件：安全 Header 的真实传输已取得最小证据；已修复一项真实静默失效。下一次推进需提供可信连接级 DNS/peer 能力与原安装身份/预算/退休/结果读回，才能集成正式 HTTP 试采；目标站点失败 URL/状态/Header 尚未提供，不以本地回显声称豆瓣/CSDN HTTP 或反爬成功。

## 原始需求（不要漂移）
ScrapyJS 是 OpenDesk Browser 的独立扩展产品。用户在当前已授权网页采集 DOM；对受审目标进行最多 1–3 页静态 HTML/JSON 试采、配置安全 Header、真实提取字段、查看和导出结果。电脑 HTTP 是可选底层能力；不将产品迁入 Desktop 自动化框架，不建设第二套 UI / 存储 / HTTP Runtime。

## A / B / C 结论
- **A Browser 优先，但生产静态 GET 目前 BLOCKED**：`browser.network.request` 经 Host 提供 GET、有限 Header、`credentials:omit`、`redirect:manual`、Abort/超时和流式读体。然而浏览器 UI 每次请求需可信点击确认，Side Panel 网络正文上限 8,192 字节、IPC 结果信封上限 12,000 字节；当前 Host 不能证明 DNS 每条结果和实际连接 peer IP 的公网安全。R2.2 的 browser-tab 合同不允许以当前导航声称 Header 可控。
- **B Desktop 可选且尚未联通**：Desktop `master` 已有 `examples/scrapyjs-desktop/` 可信本机 `http.download()` 示例，不是已经通过验证的 Browser→Desktop 交接；也没有对外公开 DNS/peer IP 的可信证明。原样保留，不作为安装前提。
- **C 新本机服务不建设**：没有充分证据证明需要重复开发 Node/Go HTTP Runtime。

## 本轮交付（source-only，不能冒充可用产品）
- `adapters/static-http-trial.mjs`：使用原 Browser `contracts/execution-v1.mjs` 校验完整 Recipe/Plan/Profile/Node，复算 Recipe SHA，强制 1–3 页、公开 HTTPS、单 Origin、GET 宿主合同、零重定向、超时/字节/行限制。将可信 Host 下载的 HTML 解析成真实 CSS 字段，合并记录、SHA256，要求可信存储独立读回的记录哈希与正式 RunReceipt 精确一致；Stop 发 AbortSignal，但不伪造宿主已退休。
- `legacyStaticFields`：仅旧 itemConfig CSS 字段/文本/属性子集；嵌套/XPath 等旧规则保留在 DOM 旧模式，新静态模式遇到不支持的规则明确拒绝。正式 `run()` 另外拒绝没有进入 v1 Recipe SHA 的 `listContainer/listItem`（`E_UNSIGNED_SELECTOR`）；现有列表解析功能只能用于独立解析预检，不能伪称已获完整 v1 签名。
- `extractStaticJson`：对真实 JSON 安全属性路径提取值，不编造字段。**v1 的 extraction kind 仅 dom/static-html，字段仅 CSS；JSON 映射无法写成合法 v1 Recipe。因此 JSON 仅是可复用独立解析函数，不生成虚假的正式 RunReceipt，需先做向后兼容合同扩展。**
- `tests/static-http-trial.test.mjs`：使用测试 Host（非 Chrome 或 Desktop Native）验证字段、SHA、拒绝越权/4页/重定向/未签名选择器/重复启动、超时/响应超限、Stop、真正读回数据一致性。与现有测试互补，不创建第二套业务 Schema。
- 旧 `src/App.jsx` / `src/app-model.js` / `controller/main.js` / `tool.config.json` / `contracts/` 未改；当前 UI 不显示假的“已可运行 HTTP”能力。

## 必须补齐的可信执行缺口（R2.4.2）
1. 可信 Host `admit()`：从已安装包和存储独立读出合法的身份、Recipe SHA、Origin、用户真实权限及节点已实测能力；客户端的 `approved:true`、`approvalRef`、`NodeCapabilities` 只是声明，不能直接授权。
2. 可信 Host `get()`：DNS A/AAAA/CNAME 全链 + 最终连接 peer IP 检查，包括 IPv4-mapped IPv6、重绑定、metadata/私网。每次重定向拒绝或独立检查，强制流式字节、Deadline、Stop，不上传浏览器 Cookie。
3. `persistAndReadback()`：Host 按受审身份写结果，然后重新读取实际记录，返回记录与 v1 RunReceipt，检查 SHA256、预算、运行身份、取消/退休。
4. 现有 Browser 网络操作每次要求可信点击；要实现 1–3 页一次审阅，需评审现有受审 Task/Host 批量执行授权路径，禁止移除现有点击以“改进 UX”。
5. Browser Tool 的网络正文 8,192 字节 / IPC 信封 12,000 字节 ≠ 通用网络服务 256 KiB；不要全局放宽 SDK。必须在可信 Host 内做字段提取和限制后投影，或以受审结果存储独立读取。
6. 正式 JSON 映射需要单一合同的兼容升级，不复写 `execution-v1.schema.json` 人工版本，也不拿 CSS 当 JSONPath。
7. 上述安全能力落实、通过源码/测试/真实 Mac Chrome 后，才将执行位置以最少的选项添加进现有 React；Desktop 仍然仅按需出现。

## 测试证据约束
代码存在只算 SOURCE_COMPLETE；模拟 Host 不算 NODE/CHROMIUM/REAL_BROWSER 之外的任何网络证明。未运行时记 NOT_TESTED，生产公网静态 HTTP 标记 BLOCKED；不以 Cookie/Header 用户配置值声称服务器已观察到相同值。

Browser 仓库根目录建议运行：
```sh
node --test examples/sidebar-tools/scrapyjs/tests/execution-v1.test.mjs
node --test examples/sidebar-tools/scrapyjs/tests/static-http-trial.test.mjs
node --test examples/sidebar-tools/scrapyjs/tests/app-model.test.mjs
node --test examples/sidebar-tools/scrapyjs/tests/extraction-contract.test.mjs
```

## GitHub Actions 真实 Node 证据（不是网络真机验收）
- Browser commit `119f082812b2133d5643f7793f4859f77ec266c7` 对应 workflow run `41042514274`：ScrapyJS App CI Node 测试 **190 项、通过 189 项、失败 1 项**；本轮新增 `static-http-trial.test.mjs` 13 项全部通过。链接：https://github.com/shopable-ai/opendesk-browser/actions/runs/41042514274
- 唯一失败：原有 `examples/sidebar-tools/scrapyjs/tests/package.test.mjs` 的 `E_TOOL_BUILD: project installable package differs from current source`，因此 ScrapyJS 整体 App CI **FAIL**、后续 Chromium 和 Mac 原生验收尚未获得证据。不要写成整套 NODE_PASS。
- **已确认该发行包失败在本轮之前存在**：更早的 Browser commit `82f69d6488d1b3c374de5d63528791fd4901168b`，workflow `41041483759` 的同一个 scrapyjs package 测试已失败（177 项、通过 176、失败 1，错误相同）。基线链接：https://github.com/shopable-ai/opendesk-browser/actions/runs/41041483759
- 不因新静态模块尚未接线就擅自重发旧 App 包、改变安装身份、降低版本检查或覆盖正式包。旧发行包差异由 R2.4.2 本机验明原因，按正式候选构建、测试、版本递增与推广流程处理。
- 分层状态：`SOURCE_COMPLETE`（新增纯业务内核），`NODE_COMPONENT_PASS`（本轮新增 13/13），`APP_CI_FAIL_PREEXISTING_PACKAGE`，`CHROMIUM_PASS=NOT_TESTED`（HTTP），`REAL_BROWSER_PASS=NOT_TESTED`，`REAL_DESKTOP_HTTP_PASS=NOT_TESTED`，`MAC_DESKTOP_PASS=NOT_TESTED`，`PUBLIC_HTTP_PRODUCTION=BLOCKED`。
