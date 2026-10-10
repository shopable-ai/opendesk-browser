# OpenDesk Browser R6：无安装顺序、同机自动连接、局域网多设备配对

> 2026-10-10。状态：**DESIGN_ACCEPTED / IMPLEMENTATION_PENDING**。这是新的产品合同，不是声称当前已支持 LAN。先读 [Native R2](native-zero-config-pairing-r2.zh-CN.md)、[Node/Go R3 边界](native-convergence-compatibility-r3.zh-CN.md)、[R5 Mac 验收](https://github.com/shopable-ai/opendesk/blob/master/docs/integrations/browser/native-mac-build-install-test-r5.zh-CN.md) 和两仓库 `AGENTS.md`。真实实施以最新主分支核对为准。

## 1. 用户确认的产品目标

1. **不限定安装顺序**：既可以先安装 OpenDesk Browser 扩展再安装本机 OpenDesk，也可以反过来；同一有效信任身份下最终达到相同可用状态。用户无需手动复制 32 位 extension ID、运行 setup 命令、重启 Chrome 或另开服务（除非 Chrome 实测要求恢复步骤）。不安装 OpenDesk 时 Browser 自身普通功能不应失效。
2. **同机默认自动连接**：有 Host、Chrome Native 权限已被安装时授予、用户没有明确断开时，扩展通过既有 `connectNative` 直接连接。**不应把“打开扩展 Options 申请权限”当成每次连接的步骤**；设置页提供状态、切换设备、断开、重新检测及专家诊断。
3. **局域网多设备为可选模式**：用户在多台电脑有 OpenDesk 时能发现、验证、选择和撤销已配对设备。断开后只允许对同一明确选择的受信设备恢复，**禁止未通知就把本机执行/文件来源切换成另一台电脑**。
4. **权限不等于连接**：Native Messaging 授权可在扩展安装时一次取得；局域网设备首次配对、某设备项目路径读取、网站授权、每次具有副作用的运行是不同授权域，不应一键合并为“全权访问本机/网络”。
5. **普通用户零 Node/CLI 操作**：OpenDesk Go Host 已实现，Go 精确单文件 Provider 已有候选；高级 Node ESM/npm/Codex MCP 仍有消费者，不得搭车删除。

Go 仓库相同版本的网络服务与信任实施合同：[OpenDesk Go R6](https://github.com/shopable-ai/opendesk/blob/master/docs/integrations/browser/native-connection-topology-r6.zh-CN.md)。Browser 的本机执行归属与 Go 的网络设备服务应双向对齐，不要出现两个互不兼容的“配对协议”。

## 2. 已有代码与当前未完成之处（执行前重新核对最新 HEAD）

- Browser `manifest.json` 将 `nativeMessaging` 放于 `optional_permissions`，`src/native-agent/settings.js` 在可信点击中 `permissions.request`，`service-worker.js` 还依赖 `opendesk.native-agent.enabled.v1`。目前只在明确启用后连 Host；Options 已有只读手动重探测。Sidebar `local-project-connect` 只是打开 Options，并非所谓外部授权网页。
- Go `internal/browserbridge/install_unix.go` 的 `SetupAutomatic` 可在**已有可信 Go 安装**时无参数复用。正式发布 ID 尚未经本轮证据核验，空 ID 新安装必须拒绝，不能伪造 wildcard 或用随机 CFT ID 当官方。
- Go `project_store_unix.go`、`project_notify_unix.go` 已有显式授权的单 `.js/.mjs` 文件、精确站点与 `projects.list/project.resolve`；原生 GUI 选择目录、远程授信、静态多文件 ESM 等不由已有 Go Host 组件 PASS 自动证明。
- Go Browser Native Host 是 Chrome 启动的本机独立进程；**只有 Browser 所在电脑安装了 Host，`connectNative` 才能连接它。Native Messaging 本身不跨局域网连接另一台电脑。**
- R16 的本机 Codex App Server 是独立 AI Provider 工作，不因为增设设备列表就获准把远端文件/网页正文交给模型。

## 3. 安装顺序无关的状态机

```text
扩展已安装 (Chrome Native 权限按本次选择的安装策略具备)
  ├─ 本机尚无已注册 Host -> LOCAL_ABSENT (普通脚本照常；静默限频重试/Sidebar 开启重试)
  └─ 本机已注册 Host -> CONNECTING -> HELLO_VERIFIED -> LOCAL_READY
OpenDesk 先安装（可信发布 ID）-> 安装器提前注册精确 allowed_origins -> 扩展后来安装后自动连接
OpenDesk 后安装 -> 安装器注册 Host -> SW 下次受控探测连接（无需重新授予已具备的权限）
用户主动“断开/禁用本机” -> USER_DISABLED (关闭 Port、保留否定状态；不得自动重连)
主程序未安装、版本不兼容、Node 旧 Host 冲突 -> 显示对应恢复说明，不尝试覆盖/删除
```

### Native 权限产品决策

Chrome 官方 `nativeMessaging` 在清单 `permissions` 中可声明成安装时权限。建议以**尚未上线的正式产品**为前提，将其设为 required，改写 `AGENT_ENABLED_KEY` 的迁移和自动启用规则：未设置且拥有权限→自动连接；显式 `false` 代表用户已关闭、必须保持关闭；旧默认关闭 vs 用户显式拒绝应有明确迁移方案，不因版本更新绕过真实的用户拒绝。Chrome 弹出的正常**扩展安装权限**仍需用户接受，不是“绕过权限”。如产品审核/安装警告表明 required 不合适，提供一次可信点击首次 grant 回退，但连接后不再弹窗。

验证点：Service Worker 冷启动、页面打开、Chrome 重启、Go 安装在扩展之后、Host 进程退出、权限移除/扩展禁用；`chrome.runtime.lastError` 和未注册错误映射到用户可理解状态。Chrome **没有通用 Native Host 安装事件**；使用 Sidebar/Options 进入时受限重试、必要时 `chrome.alarms` 30 秒以上节流与退避。不可建立毫秒轮询、常驻无界 Worker、失败后业务 mutation 重放。重连接不是项目或网站许可。

### 官方开发 ID 与发布身份

正式渠道在可信分发包里预置**已核验的准确 ID**，让 Go 安装器不依赖扩展已存在；未取得官方 ID 时不伪造。解包开发版 ID 可临时变化，需可见的显式本机确认配对，或仅在受控 CFT 下由 AI 读取实际 ID 做开发测试。任何 OS 深链/剪贴板/局域网广播提供的 ID 都属于未认证数据。浏览器自动检测本机 Host 仍不能绕过 Chrome `allowed_origins`。

## 4. 三种拓扑，明确所需安装

| 连接类型 | Chrome 所在电脑 A | OpenDesk 所在电脑 B | 建议状态 |
| --- | --- | --- | --- |
| **同机自动（默认）** | Chrome Extension + Go Host/OpenDesk | 与 A 相同 | R6 优先正式实现；原 Chrome 执行权限仍属 A |
| **局域网 Go↔Go（推荐首个远程切片）** | Extension + A 的受信 Native Host | OpenDesk B 的配对服务 | A Go 发起到 B 的认证加密连接；浏览器执行仍为 A |
| **仅扩展、无本机程序的远程模式** | 只有 Extension | OpenDesk B 提供独立的可信 HTTPS/WSS 接口 | 可行但另需有证书可验证的网络传输、浏览器扩展网络权限、Chrome LNA 兼容/审批和严谨认证；**不能**用 `connectNative` 实现、不能报告已具备 |

R6 首先稳定第一种；第二种是 LAN 的**优先实施路径**。第三种是用户多台电脑时很有价值的后续可选目标，需要独立技术验证，不得因 A 没有 OpenDesk 就悄悄开放 B 的 HTTP 执行端口、无 TLS 的 ws://、证书异常绕过、通配 CORS、token URL 查询串或“localhost 随便访问”的服务。Chrome 142 以来 Local Network Access 机制演进，WebSocket/扩展上下文覆盖需用真实 Chrome 目标版本验证，不能推断一切地址/IP 都无感允许。

### 权威和方向必须清晰

```text
Chrome(A) -- Native Messaging --> OpenDesk Go(A) -- 可选 mTLS --> OpenDesk Go(B)
   |                             |                          |
 Sidebar / RunHost(A)          本机通讯/设备路由         获准文件/AI Provider(B)
   |
 Controller(A) --> 当前 Chrome(A) 的明确目标文档
```

远程 B 只提供**经用户授权的项目或 AI 计算能力**，不能因为已配对就访问 Chrome(A) 的任意标签页、Cookie、插件资料或启动网页操作。如果需要“让 B 主动遥控 A 的浏览器”，应当另建具有显式授权、精确会话、目标文档与审计的能力合同，绝不能通过伪造 Native `run.start` 直通 A 的 Controller。

## 5. 局域网发现、配对和设备选择

- **默认关闭 LAN 监听**，在 B 的 OpenDesk 用户主动打开“允许局域网连接”后才运行；默认同机 Native 仍走本地 OS pipe/socket。系统防火墙/本地网络权限失败则给出恢复说明。
- 可选 mDNS/Bonjour 发现同一网段的候选设备，**只用于发现**；设备名/IP/广播内容不能作为信任根。跨子网、AP 隔离或 mDNS 禁止时可使用手动地址输入作为专家回退。
- 首次绑定需要设备 A、B **双端用户确认**，二维码中的高熵一次性邀请 + 双方核对简短校验码（SAS）/设备公钥指纹 + 过期、限次及限速保护；不要只凭 6 位码在弱认证明文通道直接换长期全权 token。
- 用设备级私钥/受保护凭据、相互认证加密连接（Go↔Go 推荐 mTLS，私钥仅存各自机器受限存储）；应用层每条消息还需 `deviceId + sessionId + messageId + epoch + action + capability + deadline`，有界长度和去重。每个项目另绑定 `sourceDeviceId + projectId/bindingId + siteOrigin`；设备重命名、IP 变更不能错指到另一设备。
- UI 明确显示“本机”“局域网：设备名”“离线”“设备未授权”“本机权限已关闭”。默认不扫描/上传所有文件、浏览器标签、消息历史和凭据；远端数据发送前用户应理解作用域。
- 可以**自动重新连接此前明确选中的设备**，但重新出现的新设备只能呈现为待确认；不得发现某个在线的 B 就自动接管 A 的旧绑定。支持撤销信任、单设备退出、设备遗失、证书轮换、审计和恢复。
- 局域网跨设备项目只产生明确允许的 `sourceUtf8/hash/bytes`，绝不隐式把 B 的完整磁盘目录映射给 Browser(A)。异机修改冲突/断线/时钟差异/缓存失效要拒绝过期源码。
- 公开 WAN/互联网中继不在 R6 默认授权范围；即使设备跨 VPN 互通，也须经过同一认证和用户明确启用。

## 6. 程序改动、回归与安全门槛

Browser Owner：`manifest.json`、`src/native-agent/{service-worker,settings,protocol,transport}.js`、`src/ui/{tool.html,local-project}.js` 及受影响测试。先实施安装顺序无关、本机自动连接、保存 user-disabled；LAN 新增独立 `transportKind/deviceId` 路由合同，不能修改现有 Controller/RunHost 目标身份或放宽 Native Config sender 白名单。

OpenDesk Owner：`internal/browserbridge/{install_unix,host_unix,project_store_unix}.go`、`internal/browsercli/command.go` 和实际 macOS 安装/首次启动，优先解决官方 ID 安装时预注册和已存在 Go/旧 Node 安全交接，再实现只接受配对设备的 LAN 服务。非本机网络 listener 不属于 Native Host 的 Chrome stdio，避免 stdout 污染。不要把 Local HTTP SDK、R16 Workflow Provider 和 Browser Native Host 协议混为一谈。

验收矩阵至少覆盖：App-first/Extension-first、无 App 正常 Browser 运行、Chrome 安装与卸载重装、用户明确断开、升级迁移、Go Host 退出恢复、CFT 真实 permissions/manifest、LAN 未配对发现拒绝、伪造广播、重放二维码、证书错配、失窃设备撤销、不同 IP 下设备身份保持、2 台真实设备或隔离网络的**真实网络**流量、断网/隔离/切网、设备离线时原本 Run 不重放、目录/站点/Browser 权限互不越权。

验收至少有同 SHA 的 Go 二进制、扩展包、真实 Chrome、原始 Native 握手、Controller/Page 的真实 Run/Result/Stop/retirement、LAN 端设备日志/配对回执和 Mac GUI 权限/视觉证据。CI loopback/TLS 模拟只能支持组件级，不可替代真实 2 机 LAN。独立多角色反方审计争取 ≥95/100；一旦未经确认配对、明文敏感数据、任意远程 Shell、绕过 Chrome 权限、跨设备 silent fallback、`OUTCOME_UNKNOWN` 重放或未知 Node Host 被覆盖，**不允许**验收通过。

## 7. 官方技术参考

- Chrome Native Messaging / manifest precise origins: https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging
- Chrome runtime/nativeMessaging permission: https://developer.chrome.com/docs/extensions/reference/api/runtime
- Chrome MV3 service worker lifecycle/alarms: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle
- Chrome LNA: https://developer.chrome.com/blog/local-network-access

对应新一轮直接实施 GOAL：[R6 安装顺序无关与局域网连接](../../framework/prompts/goal-native-any-order-local-lan-r6-main.zh-CN.md)。
