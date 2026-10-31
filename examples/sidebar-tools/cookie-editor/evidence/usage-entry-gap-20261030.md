# Cookie Editor 额度入口：最小 SDK_GAP 证据（2026-10-30）

## 本轮范围与结论

仅 main；本任务只写本文件和 `../tests/usage-entry-boundary.test.mjs`。保留其他 owner 的改动，不修改 Host、桥接、公开协议、账号配置、工具包或模型路由，不提交或推送。已读取仓库 `AGENTS.md` 与 `/Users/shopme/.codex/MODEL_ROUTING_RULES.md`；未执行模型调用或配置变更。本文件兼作当前限定写范围的工作记录。

下一条目标用户操作是「Cookie Editor → 账号 → 已授权账号 → 额度管理页」。实际业务 owner 为 `examples/sidebar-tools/cookie-editor/`；可信账号入口为 `trusted/account-service.js`，Side Panel 固定转发位于 `src/ui/sidebar-tools.js` 的 `cookieAccount.*` 分支，SW 通过 `installCookieAccountService` 安装原 listener。发现与复用决定：复用原固定服务和 Browser Host 拒绝路径取证，不另建工具、RPC 或安装器。额度子模块由并行 owner 迁入 `ai-account-usage/`，本轮仅只读其源码，未启动或导入其服务。

**SDK_GAP：当前公开能力没有交付 Cookie 账号与经授权 Native/Node 额度来源之间的可信身份映射，也没有交付该来源管理会话的发现与受控打开能力。** 原账号 RPC 不接纳额度/管理操作；这证明当前能力边界，不代表应该向沙箱开放任意 Native、文件或网络访问。授权不足允许记录缺口，不以猜测账号、端口或配对凭据补链。

| 链路 | 当前状态与本轮证据 |
| --- | --- |
| 原账号服务拒绝不存在操作 | NODE_PASS，仅拒绝路径 |
| 原 SW listener 交付拒绝回执 | NODE_PASS，仅 Node 组件 transport |
| 原 Browser Host `handleHost` 拒绝未知 Cookie 操作和伪造 sender | NODE_PASS，仅 Node 组件 fixture |
| Cookie alias → 已授权额度来源的真实身份映射 | NOT_IMPLEMENTED；真实映射 NOT_TESTED |
| Cookie Editor 管理会话发现、交付与正式打开入口 | NOT_IMPLEMENTED；真实入口 NOT_TESTED |
| 真实 Chrome / Native / 上游额度请求 | NOT_TESTED，本轮未执行 |

## 原协议与真实执行入口

先检查 `trusted/account-contract.js`：协议是 `opendesk.cookie-accounts.v1`，操作仅为 `status / create / rename / update / attach / delete / switch / setAutoEnabled / setAutoRefresh / allowAlias`。`quota / usage / openManagement` 是本轮故意提交的**不存在操作**，不是新 API 或待调用的公开方法。

`createCookieAccountService().dispatch` 在检查 sender、安装、权限、Vault 和 Cookie 之前，先检查协议、toolId、operation 与 payload；不在操作白名单中直接抛 `E_ACCOUNT_REQUEST`。`installCookieAccountService` 的真实 listener 将该异常转换为 `{ok:false,error:{code:'E_ACCOUNT_REQUEST',message:'E_ACCOUNT_REQUEST'}}`。Side Panel 的 `cookieAccount.*` 分支同样按 `COOKIE_ACCOUNT_OPERATIONS` 限定动作，未提供额度转发；本轮没有伪造 iframe 点击或原生 ACK 来声称正式 UI 已执行。

同时直接执行既有 `createContextMenuHost().handleHost`。沿用 `tests/environment/browser-sdk-r7-trusted-cookies.test.mjs` 的组件 sender 形状和锁接口，对故意不存在的 `browser.cookies.quota / browser.cookies.usage / browser.cookies.openManagement`：网页 sender 返回 `E_OWNER`，不进入工具锁；扩展组件 sender 经过原 sender 校验和工具/catalog 锁，返回 `E_SERVICE_UNSUPPORTED`。没有替换、抽取或重新实现 `handleHost`。注意这不是账号 RPC 的同义入口，也不构成新的公共调用链。

## 最小复现与零派发观察

从仓库根目录运行：

```sh
node --check examples/sidebar-tools/cookie-editor/tests/usage-entry-boundary.test.mjs
node --test examples/sidebar-tools/cookie-editor/tests/usage-entry-boundary.test.mjs
```

2026-10-30 本轮实际结果：语法检查 exit 0；定向测试 **3 pass / 0 fail / 0 skipped**，exit 0。

1. 原 `dispatch` 对三个操作分别提交 `trustedClick:false / true`，六次均为 `E_ACCOUNT_REQUEST`，不能靠调用方自报点击取得新操作。支持操作 `status` 加无效 sender 的对照返回 `E_ACCOUNT_SENDER`，确认使用真实分派/校验路径。
2. 调用原安装器捕获的 SW listener：三个操作分别收到一次完整拒绝回执；不相关协议返回 false 且不回复。
3. 原 `handleHost` 对每个未知操作分别执行网页 sender 拒绝和扩展组件 sender 不支持路径，检查实际错误码与原两级锁调用。

测试复用现有账号 `serviceFixture`（`tests/environment/cookie-editor-account-switch-host.test.mjs`）及 R7 Cookie Host fixture 的最小外部边界结构。这两个 fixture 是各测试文件私有函数，直接导入会注册无关测试，因此只在本任务测试文件提供必要的 API/锁/listener 接口；没有读取源码字符串生成测试或用 mock handler 代替原服务。没有构造网站/OAuth 账号、安装来源证明、账号 alias 映射或授权成功结果。fixture 中的扩展 ID、文档 ID、Host UUID 仅为组件测试值，不是本机或真实账号身份。

`fetch` 和 `Socket.prototype.connect`（TCP/IPC）被阻断并记录；Chrome `sendMessage / sendNativeMessage / connectNative`、Cookie 读写、tabs 导航/查询、权限检查/请求、local 存储及 Foundation 存储边界同样遇调用就计数并抛错。每轮拒绝后 `effects` 必须严格等于 `[]`；阻断异常不能替代预期产品错误码，所以即使产品吞掉边界异常也会被计数发现。上述所有观测点均为 **0 次调用**。未启动 Node 额度服务、监听端口、读取认证文件或访问上游。

这是所测请求在 Node 中通过原实现的**零派发组件证据**；不是“真实 Chrome 网络已抓包为零”的证明，也不是所有未来代码或全部网络通道的普遍保证。真实 sender、Chrome 网络效果、Native 映射/管理会话及撤权后正向流程一律 NOT_TESTED；未把外部边界 fixture 宣称为真实账号入口已接通。

## 公开 Browser SDK 只读核对

核对 `docs/api/browser-sdk.zh-CN.md`、`docs/api/sidebar-tools.zh-CN.md`、`src/framework/sdk/browser.js`、`browser-contract.js` 及其编译批准绑定。只读构造公开 facade 并枚举 Registry，未调用任何 SDK 请求：当前 **81 项**。按 `account / quota / usage / management / native / oauth / pair` 检索操作名仅命中 `browser.storage.local.getQuota`；其职责为存储容量，不是账号额度。名称枚举只作辅助，结论同时依据原协议、schema、有限 facade 与下述服务边界，不用字符串缺失测试代替功能复现。

- facade 从同一批准 Registry 生成，没有公开的 Native 账号来源映射或管理会话交付方法。Chrome API 的 `nativeApi` 元数据不等于操作系统 Native Messaging 授权。
- `browser.tabs.create` 的 schema 只有必填 `url`（HTTP(S)，不允许额外字段）；导航能力无法证明目标账号、发现本机动态端口或提供已授权服务会话。
- SDK 文档的 `browser.network.*` 是受限网站网络能力，不是读取认证文件、Native 任意 RPC、发现 Node 配对秘密或信任任意 loopback 服务的合同。
- `docs/api/browser-sdk-interface-matrix.json` 的 Chromium 发现项不是开放授权，不因存在 Native/management 等上游接口名称就可调用。

## 为什么工具内部无法解决

`trusted/account-service.js` 的公开账号元数据只有本地 alias、origin、显示名/描述、版本、Cookie 数量和站点信息等。保存快照或回执相等不证明网站登录身份，更不证明同一 Codex OAuth userId/accountId。不得按显示名、域名、alias、Cookie 名称或快照匹配猜测额度来源。

只读核对 `ai-account-usage/account-service.mjs` 与 `authorized-sources.mjs`：Node 来源必须另行装配授权 loader；要求 authorized、snapshot 和 expectedIdentity，并检查已有身份绑定与重复身份。`manage.mjs` 中 `codex_local_01` 只是默认来源配置文本，绝不是 Cookie 账号已映射的证据。本轮未执行 loader、未读取 `~/.codex/auth.json`、未验证任何真实身份。源码 claims 一致性校验也不能被本轮升级为真实跨来源身份认证证明。

`ai-account-usage/web-server.mjs` 的现有管理会话有随机 localhost hostname/端口、五分钟一次性 pairingCode、同源 POST `/session`、Host/Origin/Sec-Fetch-Site 检查及 HttpOnly/SameSite=Strict 会话 Cookie；成功配对后 code 消耗，session 另有有效期。`manage.mjs serve` 生成配对链接，但本轮没有运行。公开工具 API 没有发现/交付该链接的合同。不能把配对秘密、Cookie 或 Token 交给沙箱/普通 URL 参数，不能绕过同源配对、启动第二个服务或以“能打开网页”代替已授权会话。

## 最小后续可信集成范围（尚未验证的设计边界）

1. Cookie Editor 可信业务 owner：`trusted/account-contract.js`、`trusted/account-service.js`、`app/components/CookieAccounts.jsx`、`app/CookieEditorApp.jsx`；确认 UI 所选账号与可公开元数据，保留原 Vault/Cookie 边界。
2. 现有 Node 额度 owner：`ai-account-usage/authorized-sources.mjs`、`account-service.mjs`、`manage.mjs`、`web-server.mjs`；确认用户明确授权的来源与可核验身份、服务实例和会话生命周期。不得直接暴露 loader/文件路径/凭据。
3. 若经平台 owner 证明需要通用公开能力，再审计原 `browser-contract.js / browser-schemas.js / browser.js`、`src/platform/chrome/context-menus.js`、`src/ui/sidebar-tools.js` 及既有 Native Authority 接入合同；仅审计必要的公开 schema、原 Host/Authority 接入和定向安全测试，不新建 Host/桥接。本轮未实施这些变化，也未证明某个 Native handler 可直接复用。

跨工具价值只在「独立应用受控发现其已批准本机服务、取得不泄密的管理交付」层面可评估；Cookie/OAuth 身份映射和额度策略留业务 owner，不在通用 Host 硬编码账号或网站。

后续必须明确绑定：安装包 hash/version、install/revocation epoch、真实 sender/Host instance/document、所选网站 origin/Store/Partition、Cookie 账号版本与经授权来源身份、Node 服务实例和会话到期。Cookie 许可不能扩成 OAuth/文件/上游刷新许可；只读缓存、刷新和打开管理页须分清授权与效果。停用、卸载、更新、换账号、来源撤权、会话到期和文档变化时旧映射/交付应失效；配对单次消费，未知网络/导航/刷新结果不自动重放。具体实现及真实撤权证据均 NOT_IMPLEMENTED / NOT_TESTED，不能以本次未知操作拒绝代替。

## 输入绑定与验证限度

开始观察 HEAD：`156e842ce2b416ee784518ab7aae1e914d63cd12`（工作区有并行改动，不是冻结候选）。测试前后关键输入 SHA-256 相同：

| 输入 | SHA-256 |
| --- | --- |
| `trusted/account-contract.js` | `48801847fd7426cc881e135eae639fb9280a1ee1fff149aa8bb3122b42fcb5ee` |
| `trusted/account-service.js` | `a989336e5c07866e9e85ddba3a2b9eb5fe023dbe32493b8d5c07cfce6813af0b` |
| `src/platform/chrome/context-menus.js` | `135d6ff4fd6f5f2c2374e635ac3f45b38130765c22e0b184a63feaa25fcc9a5e` |
| `src/framework/sdk/browser-contract.js` | `cce7dd2ec94db6aaee365875a97a53d433926d9776f6e2a82dff5db4265b9834` |
| `src/framework/sdk/browser.js` | `c33b266585eac38ab12d4ba36fcf62fd3d95066fe9b2ca5cffd29c48de37afae` |

Host 文件有其他 owner 的既存改动，本轮只读并保留；这些哈希只绑定所列输入，不冒称完整依赖闭包或 production 包身份。未执行构建、打包、Chrome/上游/模型请求或全仓测试：本轮只新增拒绝路径证据，没有待验证的运行时代码改动。收尾条件是原实现的拒绝复现与公开缺口说明齐备；真实额度入口仍未实现。当前任务已授权归属整改及必要入口完善，但现有来源合同没有提供 Cookie 账号与额度身份的可核验证明，不能据授权猜测映射或传递秘密；后续须先具备该证明并在原可信 owner 实施。
