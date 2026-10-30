# ScrapyJS 本机 Node HTTP：操作与边界

当前状态：**PASS_REAL_APP_NODE_HTTP_LOCAL**。专用 CFT 155 中，原安装 App v1.8.0 → 固定 Task v0.6.0 → 原 Authority / NetworkService → Node v24.16.0 的 11 条场景已通过。Chrome 对目标的 fetch/XHR 被阻断时仍能采集，Node PID、执行器源码哈希与服务端 socket 一一对应。证据见 [本轮记录](../evidence/node-http-local-20261031.json)。公网 HTTP 与 production 仍为 **BLOCKED**；这不是正式生产验收或独立评分。

## 已发现的 SDK 缺口与复用决定

本次发现时，公开 Controller HTTP 配置仅有 `transport: 'isolated-http'`：目标请求仍由 Chrome 隔离 HTTP 路径发出，不是本机 Node。旧响应没有可核实的 `request.executor`；UA 改成 Node 风格也不能证明执行器是 Node。

ScrapyJS 的 Sidebar App 是 opaque-origin 沙箱，只负责配置和展示，通过原 App SDK 委托固定 `scrapyjs.capture` Controller Task。它不能持有本机服务的配对密钥、会话凭据或控制密钥，也不能直接获得可信扩展页面的权限。将凭据放入业务配置、工具存储、URL 或导出结果无法安全解决缺口。

因此保留原 App → Task → Controller `axiosx` → NetworkService / Authority 路径，由平台新增通用 `transport: 'native-http'` 及受信任 relay adapter；真正目标 GET 由本机 Node 服务发出。业务只选择 transport、传递冻结配置并保留返回审计，不新增沙箱直连、第二个任务执行器或安装器。`response.request.executor` 返回实际 Node PID、版本、执行器源码 SHA-256 和 socket 地址；此哈希与固定 Task 的 `revision.sourceHash` 分别核对。

## 从原 App 开始采集

1. 准备自有 JSON 回显目标 `http://127.0.0.1:43121`。这是采集目标；relay 控制连接使用另一个地址 `http://127.0.0.1:43122`，两者不可混用。
2. 由本机服务 owner 使用下节已核对的 **Node.js v24.16.0** 启动服务，并填写当前实际加载扩展的精确 origin。`status` 返回的真实 `nodeVersion` 才是运行版本证据。
3. 在可信扩展页 `chrome-extension://<真实扩展ID>/native-agent/http-relay.html` 输入本机服务生成的短时邀请，点击「配对本机服务」，再点击「检测状态」。邀请只输入该可信页面，不粘贴到 App、聊天、配置或证据文件。状态发现使用携带实际扩展 Origin 的 JSON POST；随后必须通过带新请求身份的认证状态回执。
4. 经原安装审阅链更新固定 Task，审阅 `page.automation`、`network` 与新增的 `network.localRelay`，并保留精确目标站点范围。`network.localRelay` 必须同时声明 `network`；单独的 `network` 不代表批准本机 relay。配对身份不替代 Task 安装授权、站点权限或当前运行 Authority。
5. 打开目标页，在原 ScrapyJS App 选择「本机 HTTP」或载入本机 HTTP 示例，填写 URL、UA、普通 Headers、JSON 字段点路径及 1–3 页上限；按需保存命名配置。
6. 从 **App 的「开始采集」** 发起原 Task，不从配对页执行采集。启动时冻结 URL、UA、Headers、字段映射、页数及超时；运行期间编辑锁仍生效。
7. 查看原运行状态与结果。审计保留 `requestId`、`runId` 及响应提供的 `executor`，不能仅凭配置中的 transport 或 UA 宣称 Node 已执行。停止沿原 App Stop 链路；停止已受理与原实例退休分别确认，结果未知时不自动重发。

## 固定安全范围

仅允许 `http://127.0.0.1:43121` 的 GET；公网、其他端口、凭据 URL 与 hash 不在本轮范围内。不携带浏览器 Cookie 或登录凭据，不跟随重定向；普通 Headers 拒绝控制字符、大小写重复、身份头与保留传输控制头。

删除或清空 UA 覆盖时，显式使用 `OpenDesk-NativeHTTP/1.0`。最多三页共享一次最多 15 秒的期限；较短配置仍生效，每页只取得剩余时间。DOM 采集继续使用原路径与原规则。Node relay 不可用、未配对或请求失败时，HTTP 采集失败，不回退到 Chrome `isolated-http` 或浏览器 fetch。

配对撤销在可信页面操作；服务停止由本机服务 owner 执行。二者均不能撤回目标已经收到的请求，也不能作为未知副作用的自动重试许可。

## 本机命令与可信设置

命令合同来自 [relay README](../../../../native-agent/http-relay/README.md) 与 [CLI](../../../../native-agent/http-relay/cli.mjs)。本机已用 `/Users/shopme/.nvm/versions/node/v24.16.0/bin/node` 完成运行验证；CLI 要求 Node 24.x。以下固定使用该二进制，不依赖另一个终端的 PATH。测试服务和专用浏览器已正常关闭；日常扩展没有被替换或自动配对，实际使用时仍须核对当前服务状态。

### 1. 设置目录与真实扩展 origin

在仓库根目录执行；后续每个终端都使用相同的变量定义：

```sh
cd /Users/shopme/Documents/workspace/opendesk-browser
NODE_HTTP_BIN='/Users/shopme/.nvm/versions/node/v24.16.0/bin/node'
RELAY_STATE_DIR="$HOME/.opendesk-browser/http-relay-scrapyjs-local"
RELAY_EXTENSION_ORIGIN='chrome-extension://<填写当前实际加载的32位扩展ID>'
"$NODE_HTTP_BIN" --version
```

**必须先替换 origin 占位符**：从当前实际加载的 OpenDesk 扩展详情读取 32 位 `[a-p]` ID，保留 `chrome-extension://`，不要尾斜线；不使用示例假 ID、旧副本 ID 或沙箱 origin。此 origin 必须与打开可信设置页的扩展相同。更换已绑定的 origin 会被拒绝，不靠修改状态文件绕过。

`RELAY_STATE_DIR` 是本轮专用私有目录示例；已有父任务服务时，改为该 owner 明确给出的实际目录，所有命令使用同一目录。不要另起第二个服务或接管其他 listener。仅在确认这个目录属于本轮后准备权限：

```sh
umask 077
mkdir -p "$RELAY_STATE_DIR"
chmod 700 "$RELAY_STATE_DIR"
```

目录要求 0700，服务状态文件要求 0600；状态包含控制密钥和配对身份，不放入仓库、共享目录、业务存储或证据。CLI 默认目录是 `~/.opendesk-browser/http-relay`，本页命令始终显式传 `--state-dir`，避免误操作默认服务。

### 2. 启动已有自有回显 fixture

在单独终端、仓库根目录使用已有 [fixture 入口](../fixtures/http-echo-server.mjs)：

```sh
"$NODE_HTTP_BIN" examples/sidebar-tools/scrapyjs/fixtures/http-echo-server.mjs
```

它以前台进程独占绑定 `127.0.0.1:43121`，不发起出站请求。遇到 `EADDRINUSE` 停止本次启动并由 owner 核对占用；不复用未知服务、不杀已有进程。打开 `http://127.0.0.1:43121/` 作为原 App 的当前目标页，采集示例使用 `/http-echo`。结束时只在自己启动的 fixture 终端按 Ctrl-C 正常关闭。

### 3. 启动 relay、查看状态并生成邀请

确认 origin 已填写，在另一终端前台启动 relay：

```sh
"$NODE_HTTP_BIN" native-agent/http-relay/cli.mjs start --state-dir "$RELAY_STATE_DIR" --origin "$RELAY_EXTENSION_ORIGIN"
```

`start` 保持前台运行，输出 `status: "listening"`、监听信息、`pid` 和 `nodeVersion`。固定监听 `127.0.0.1:43122`；端口冲突会失败，不接管其他进程。原子状态与目录锁由服务维护，不手删锁或改状态文件。

在使用相同变量定义的控制终端执行：

```sh
"$NODE_HTTP_BIN" native-agent/http-relay/cli.mjs status --state-dir "$RELAY_STATE_DIR"
"$NODE_HTTP_BIN" native-agent/http-relay/cli.mjs invite --state-dir "$RELAY_STATE_DIR"
```

`status` 通过私有控制密钥认证，返回 `pid`、`nodeVersion`、`generation` 和 `paired`；核对 PID 与本轮启动回执一致，版本为预期 `v24.16.0`。`invite` 仅在未配对时成功，输出 JSON 的 `invitation` 是 60 秒短时令牌；只把这个字段的值输入可信页面，令牌不写报告、不发聊天。邀请单次使用，重启后失效。

打开 `$RELAY_EXTENSION_ORIGIN/native-agent/http-relay.html`（将变量展开为真实完整地址），或从可信本机连接设置进入「本地 HTTP 转发」。在 `#relay-invite` 输入邀请，点击「配对本机服务」，再点击「检测状态」。随后回到目标页，再从原 App「开始采集」。可信页配对只建立通道，不授予额外 Task/网络权限。

### 4. 显式撤销与正常停止

正常撤销优先在可信页点击「撤销配对」。需本机清理时，由服务 owner 使用同一私有目录：

```sh
"$NODE_HTTP_BIN" native-agent/http-relay/cli.mjs status --state-dir "$RELAY_STATE_DIR"
"$NODE_HTTP_BIN" native-agent/http-relay/cli.mjs revoke --state-dir "$RELAY_STATE_DIR"
"$NODE_HTTP_BIN" native-agent/http-relay/cli.mjs status --state-dir "$RELAY_STATE_DIR"
```

先确认 PID 仍为原服务；`revoke` 取消活动请求、撤销服务端配对并推进 generation；后续 `status` 应为 `paired: false`。这不是停止服务，也不撤销已经到达目标的请求。CLI 撤销不会直接清除浏览器自己的配对记录；若仍残留旧记录而可信页不能清理，交由该页面 owner 处理，不把 CLI 成功当作浏览器记录也已清除，不手改 IndexedDB。

**未完成配对的显式清理提示**：若确认回包丢失，先用可信页「检测状态」核对，不能自动重做未知配对。用户明确点击「撤销配对」时，尚处于 `confirming` 的本地记录可被清除；返回提示为「已清除未完成配对。本机服务状态未知，请在本机执行 revoke 后重新生成邀请。」这只证明本地清理，不能宣称服务端已经撤销。按上面的 CLI `revoke` 清理本机服务并用 `status` 核对后，再运行 `invite` 生成新邀请。服务离线时先由原 owner 恢复同一目录/真实 origin 的服务，再执行清理；不通过删除目录或重放采集解除 unknown。

正常停止原服务：

```sh
"$NODE_HTTP_BIN" native-agent/http-relay/cli.mjs status --state-dir "$RELAY_STATE_DIR"
"$NODE_HTTP_BIN" native-agent/http-relay/cli.mjs stop --state-dir "$RELAY_STATE_DIR"
```

核对原 PID 后再 stop；CLI 使用认证控制请求，返回 `status: "stopping"`。该回执表示受理，仍需确认原前台进程正常结束、原监听关闭；停止后 `status` 因服务离线而失败是预期。停止不等于撤销配对；它不发进程 kill 信号，不强杀其他 owner 的服务，也不自动重启或重放原 App 请求。

## 验证层级

平台定向测试调用实际 `normalizeConfig`、`createNetworkService` 与 `validateTaskManifest`，验证输入拒绝、native 分派、无浏览器回退、响应执行器投影及 manifest 权限依赖。假 transport 的 PASS 只证明组件行为。

真实产品验证覆盖 UA A、UA B、删除覆盖后的默认 UA、普通 Header、最多三页及运行中配置锁、Stop、超时、500、拒绝重定向、提前断流、撤销配对和服务离线无回退。最终服务 PID 为 `97453`，Node 为 `v24.16.0`；该测试实例已经正常停止，PID 不是下次使用时的固定值。12 条实际目标请求均保留 Run / 请求身份、固定 Task 来源和原安装授权绑定；11 次运行均有真实 Host 终态及实例退休回执。

自动检查：53 项相关业务、NetworkService、adapter 和正式包检查，8 项 relay 协议检查，9 项真实 WebCrypto 通道检查均通过。重启及撤销后旧 generation 的正文不可交付；坏认证、重放和未知效果不自动重试。App 正式 JSON 经原打包器晋升并通过同源核对，Task 正式 JSON 与已安装验证的候选逐字节相同。未执行 production、公网、人工物理界面验收或独立评分。
