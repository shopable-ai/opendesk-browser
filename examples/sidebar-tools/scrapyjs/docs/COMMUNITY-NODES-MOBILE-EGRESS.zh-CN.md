# ScrapyJS · 自有设备、手机移动网络与社区协作节点（方案决策）

> 日期：2026-10-30｜状态：DESIGN_ONLY / NOT_IMPLEMENTED / NOT_TESTED
>
> 本文记录“用户自己的电脑或手机作为采集出口/任务节点；用户可主动领取任务；未来自愿互助共享与收益”的长期产品方向。**不是已实现的代理、手机应用或用户网络共享服务。** 下一轮先做小范围架构与真实设备可行性验证，不直接上线开放住宅代理市场。
>
> 唯一产品源码目前仍在 `examples/sidebar-tools/scrapyjs/`；未来正式迁至 `projects/scrapyjs/` 时一起迁移，禁止在两处建立并行实现。现有 Controller Task、可信 Host、权限和安装合同不变。

## 1. 新增的原始用户需求（未来不可漂移）

用户希望：
1. 自己的电脑/手机可以成为采集或网络节点；特别是手机的蜂窝网络可能提供不同的真实公网**出口**地址；
2. 手机若能 Wi-Fi 和移动数据同时使用更理想：Wi-Fi 在本地与电脑通信，4G/5G 用于执行目标网站请求，再把结果返回电脑；
3. 不限于同一局域网：远程设备可以在线注册并**主动领取**经批准的任务；其他人可以在明确授权下互助；
4. 将来允许贡献节点、分享闲置计算/网络资源、以服务额度或其他经合规审查的方式获得收益；
5. 这些能力最终仍应服务 ScrapyJS 的“AI 创建任务 → 小样本试采 → 保存 → 复用 → 按需托管/收费”，而不是另建一套无关浏览器、全局代理或 OA 平台。

**三种产品必须分清**：A 自用私有网络出口；B 用户主动领取的结构化采集任务；C 将用户网络作为他人的代理出口。B 不是一般意义上的开放 HTTP/SOCKS 代理，C 的安全、合同与法律风险最高，不能默认为 A/B 已实现。

## 2. 纠正关键网络误区

- 手机通过蜂窝网络访问公网 ≠ 手机拥有可供其他设备直连的独立公网 IP。运营商可能使用 CGNAT、防火墙、动态 IPv4 或 IPv6 策略；不能以“手机网络是公网”推导必须开入站端口。
- 用户的手机有时重新连接后会出现不同出口地址，**不保证每次改变，也不允许将自动换 IP 作为绕过限速、封禁、验证码或访问控制的产品卖点**。会话若依赖固定出口，应明确要求稳定性、在网络改变时停止/重新授权。
- Android 允许应用请求蜂窝/Wi-Fi 等不同 Network，再为特定 Socket/HTTP 连接绑定网络；这提供“控制走 Wi-Fi，目标采集走蜂窝”的**技术可能性**。设备硬件、系统、运营商、Wi-Fi Internet 状态及省电策略决定是否真能同时保持两条链路，必须在具体机型实测。
- Android 网络绑定应**每条连接**选择合适 Network/解析器，不应简单将整个应用进程默认出口改成蜂窝，否则本地控制连接可能被错误改路由。
- iOS Network.framework 可指定接口类型，但系统后台执行、应用分发与网络路径约束不同；第一阶段以 Android 原生技术 PoC 为先，**iOS 可行性 NOT_TESTED**。
- Android 15/16 对后台/前台服务和后台任务有新的时长及配额限制，不能承诺手机“永远在线”或手机长时间全速运行。

官方技术参考：
- Android ConnectivityManager / Network： https://developer.android.com/reference/android/net/ConnectivityManager ，https://developer.android.com/reference/android/net/Network
- Android NetworkCapabilities： https://developer.android.com/reference/android/net/NetworkCapabilities
- Android foreground service limits： https://developer.android.com/develop/background-work/services/fgs/changes
- Apple NWParameters： https://developer.apple.com/documentation/network/nwparameters
- CGNAT 说明： https://www.cisco.com/c/en/us/support/docs/security/umbrella/225267-configure-cgnat-carrier-grade-nat-ips.html

## 3. 三种拓扑与推荐顺序

### A0. 零代码对照组：手机热点 / 网络共享（优先快速验证）

不开发 Node Agent 也可以先验证“电脑通过手机的蜂窝公网出口访问目标网站”：
- 手机开启移动数据和 Wi-Fi 热点，自己的 Mac/PC 连接手机热点，查看**实际出口 IP**并访问合法测试站点。这时手机是网络共享网关，**电脑整体的网络路径可能改变**，并不是 ScrapyJS 单独使用的代理。对于只需要把电脑网络切换到手机的个人用户，这可能已经满足需求；
- 如果用户必须让电脑同时保持原来的局域网（例如电脑需要连接办公 Wi-Fi），单 Wi-Fi 网卡可能无法同时连接两个不同热点；应将“电脑全局接入手机热点”和“手机原本 Wi-Fi 控制+蜂窝任务出口”区分。不能把热点测试的通过冒充双 Network Agent 测试；
- Android 一般有热点/网络共享能力，但运营商可能限制或额外收费。Google Pixel 官方支持说明指出 **Mac 不能直接使用 Android 的 USB 网络共享**，不要将这项能力作为 Mac 的默认备用方案；iPhone → Mac 可以使用 Apple Personal Hotspot（包括 USB），但并非 Android 原生 Node Agent 的证据；
- 该零代码对照组只证明蜂窝出口可用，不证明远程任务领取、网络隔离、按任务代理、数据回传或后台稳定性；这些仍需下一阶段独立验证。

参考： https://support.google.com/android/answer/9059108?hl=zh-CM ；
https://support.google.com/pixelphone/answer/2812516?hl=en ；
https://support.apple.com/en-gb/guide/mac-help/mchl7403f0ee/27/mac/27 。

### A. 自有 Android 手机 + 电脑，同一 Wi-Fi（首选验证）

```text
OpenDesk Browser (Mac/PC，控制台)
     │ 经过配对的局域网通信 / 授权任务
     ▼
Android Node Agent（同一局域网 Wi-Fi）
     │ 仅将已审阅任务的对外 HTTP(S) 连接绑定 CELLULAR Network
     ▼
允许的测试网站（实际出口为手机运营商连接）
     │
     └── 结果/状态经 Wi-Fi 返回 PC → ScrapyJS 结果视图
```

没有必要把手机开放到公网；电脑和手机在局域网互通即可。推荐让手机成为**受限任务执行节点或应用层 HTTP 请求执行器**，不直接暴露任意 HTTP CONNECT / SOCKS5 端口。采集规则由 ScrapyJS 生成并由受审合同转交，手机不下载任意 JS/Python 脚本。首次只在用户拥有或许可测试的 HTTP(S) Fixture 目标上运行。

技术验证（仅方案）：Android `ConnectivityManager.requestNetwork(TRANSPORT_CELLULAR)` 获取可用蜂窝网络，`Network.openConnection / getSocketFactory / bindSocket` 为具体对外请求选择出口，DNS 同样由选定网络处理；Wi-Fi 本地控制连接单独保持。具体 Kotlin 实现需在下一轮读取项目与 Android SDK 版本后确定，不假设所有机型支持。

失败处理：蜂窝失效时**停止/报错，不自动转 Wi-Fi 继续外发**；本地控制断开时原任务有受控超时与可读回状态；节点端显示每次联网范围与流量消耗。

### B. 跨互联网的自愿任务节点（次选）

```text
用户发布已授权 Recipe → 可信任务协调服务 (Broker / Queue)
                                     ▲
                              设备主动发起 TLS 出站会话
                                     │
                         Android / PC 自愿加入的 Node Agent
                                     │
                  经本机显式同意仅执行受限、签名、可计量任务
                                     ▼
                              已批准目标 / 结果回传
```

- 手机只需**主动向协调服务发起出站连接**，一般不要求公网入站 IP、端口映射或与用户处在同一个 LAN。
- 领取的是具备固定 Schema、目标 Origin、页数/时间/预算的**数据采集任务**，不是让其他用户控制手机浏览器或远程执行代码。
- 控制面与数据面可以使用不同路径：有 Wi-Fi 时控制连接可用 Wi-Fi，任务的目标请求在明确允许且实测可用时走蜂窝；不要求同时可用，退化模式必须显式告知且不能隐式替换出口。
- Broker 只管理节点登记、授权、任务领取、租约/到期、幂等状态、结果索引及最小计量；不是初期就需要实现全功能代理调度平台。
- PC Node Agent 如复用 OpenDesk Desktop/既有可信运行机制，需要审计对应仓库当前模块；不要让 ScrapyJS MV3 Service Worker 伪装成长驻系统守护进程。

### C. 受审核的共享代理出口（长期可选，严禁默认启用）

```text
有明确授权的请求者 → 服务端授权/风控/配额 → 独立受控出口节点
                                              │
                         仅允许批准域名、协议与资源预算
                                              ▼
                                          目标服务
```

风险：实际被访问站点可能将出站行为归属到节点贡献者的家庭/手机网络；未经授权的开放出口可能涉及滥用、用户隐私、运营商条款、版权/访问规则和侵权责任。**不推出任意网站访问、裸 TCP 转发、全局住宅代理、隐藏后台分享、自动 IP 轮换或买卖用户网络出口的 MVP**。

若未来确有订单需求，需先完成合法来源、运营商许可、用途/域名白名单、受审业务、实名认证或合理风险识别、速率/流量/并发/预算限制、日志留存最小化、违规投诉与立即封禁、异常退款和责任条款审计。开放代理模式需独立开关与独立授权，不能跟随“加入任务节点”开关自动打开。

## 4. 推荐产品选择（互斥的起步方向）

| 方案 | 能验证的核心 | 边界/代价 | 结论 |
| --- | --- | --- | --- |
| **A：自用手机局域网双网络任务节点** | 最小实物链路，真实 Wi-Fi 控制 / 蜂窝出口 / 结果读回 | 需要 Android 小型 Agent 和真实手机 | **先做，最稳妥** |
| B：远程任务领取 | 穿过 CGNAT、跨设备节点与授权任务 | 需要 Broker、节点认证、租约 | A 验证后做 |
| C：开放互助代理 | 用户网络直接变为收费代理出口 | 安全、合规、欺诈、责任与运维风险高 | 仅研究，不实施 |
| D：仅接第三方商用代理 | 无需维护用户节点 | 无法实现用户设备互助 | 作为独立可选服务，并行保留 |

避免将 A/B/C 合并成一个不透明的“启用代理”按钮。

## 5. 最小数据与权限合同（设计，非现有 API）

Node（不包含设备 IMEI、电话号码、用户 Cookie）：
`nodeId, ownerId, deviceType, appVersion, approvedModes, status, networkCapabilities, cellularAllowed, meteredBudgetBytes, wifiControlEnabled, allowlistedOrigins, maxConcurrency, maxDurationMs, batteryPolicy, createdAt, lastSeenAt, revocationVersion`。

Job（不得发任意代码）：
`jobId, recipeId, immutableRecipeVersion, requesterId, allowedOrigins, method/paramsSchema, maxPages(1..3 for PoC), maxResponseBytes, deadlineMs, maxDataBytes, userApprovalToken, idempotencyKey, leaseId, status, resultHash`。

Execution:
`runId, nodeId, jobId, actualTransport, expectedTransport, egressIpObserved/hashed, bytesIn, bytesOut, duration, outcome, stopRequestedAt, releasedAt, evidenceRef, costEventId`。
IP、节点定位和完整访问日志属于敏感信息，默认不向其他用户公开；公开可只显示用户自愿选择的粗粒度区域/能力/在线状态。

节点提供者能设置：私有/允许协作、是否允许移动数据、单次/每日流量上限、仅充电时、运行时段、允许的任务类型和目标、暂停、立即停止、撤销授权与数据删除。默认 **私有、拒绝分享、每日协作额度 0、禁止蜂窝消耗**，开启后才计费/用流量。

## 6. 贡献、互助与商业化（只保存业务规则，不创建账单服务）

两个激励方向：
- **贡献积分**：按已验证、由用户同意的任务成果或明确资源消耗记录可兑换的额度，用于本平台其他合法任务；不是代币、承诺收益或加密金融产品；
- **商业结算**：未来合规许可与实际产品需求成立后，按验收记录结算，清楚区分任务服务费、蜂窝数据成本、平台费、维护和退款。

早期不得凭上传流量或“切换 IP 次数”直接发奖，防止鼓励滥用、无价值流量、刷量和访问控制规避。平台不能保证贡献者赚取收入。入账/扣账/退款需幂等；防作弊、纠纷、运营商合同与税务法律问题都属独立上线门槛。

市场参考：Mysterium（设备出站节点/带宽市场）及任务型采集平台 Apify，商业与权限风险不同。Mysterium 官方文档 https://docs.mysterium.network/about-mysterium ；Apify https://apify.com/ 。仅作为模式研究，不复制其开放 VPN/代理功能。

## 7. 独立真实设备验收矩阵（下轮执行目标，不是已通过）

| 验收 | 实际观测证据 | 失败处理 |
| --- | --- | --- |
| 手机热点零代码出口对照 | Mac/PC 连接本人手机热点，读取目标服务返回的出口 IP；记录原局域网是否受影响 | **只能证明整体网络共享，不算双网络 Agent PASS** |
| Android Wi-Fi 与 CELLULAR 同时检测 | NetworkCapabilities / 路由回执与设备/系统版本 | NOT_SUPPORTED 或 BLOCKED，不能猜 PASS |
| PC↔手机经 Wi-Fi 局域网互通 | 实际配对、签名请求/响应、断链恢复 | 无连接即阻断 |
| 手机到授权测试站点经 CELLULAR 出口 | 两种网络出口的独立服务端 IP / egress 验证 | 若是 Wi-Fi 则 FAIL，不得冒充蜂窝 |
| DNS、TLS、目标限制 | 路由范围与 DNS 出口测试、非法目标拒绝 | 不走期望路径则阻断 |
| 1–3 页真实数据 | jobId/runId 对应真实页面、结果哈希、独立读回 | 不以模拟响应替代真实采集 |
| 断蜂窝 / 断 Wi-Fi / 手机锁屏 | Fail-closed、Stop 与租约释放状态 | 不悄悄直连或重复执行 |
| 流量、预算、电量 | 设备侧与协调侧记录的计量一致性 | 越上限立即停 |
| 安全 | 未配对请求拒绝、过期凭据撤销、无明文秘密、非允许 Origin 拒绝 | 任一破坏则上线阻断 |
| Android 版本兼容性 | 指明手机机型/Android/ROM/运营商、前后台行为 | 兼容列表而不是通用支持承诺 |
| 共享/计费 | P2 才验证并对账 | 本轮 NOT_TESTED |

真实公网测试只使用拥有或明确获授权的域名/Fixture；普通用户不会被要求开放手机网络给陌生人。

## 8. 实施次序与与现有 OpenDesk 的边界

- **R0（下一对话首先执行）**：优先用手机热点/网络共享做零代码蜂窝出口对照，随后只读核对当前 `main`、ScrapyJS 的配置与 Task、OpenDesk Host 代理 API、是否已有可信 Node/移动端 Agent；绘制三种拓扑，分别给出可行性、成本、安全、用户体验的独立评分；给出手机/电脑/侧栏简洁交互 HTML 原型。不要重复 R1 之前已完成的采集功能。
- **R1a（经设计确认后）**：首个真实 Android PoC：仅自有手机 + 自有电脑、同一 LAN、Wi-Fi 控制 + 蜂窝发出 1–3 页采集请求 + 原结果读回；不支持社区、收款、任意代理。
- **R1b**：可选远程 Broker，手机主动连出领取同一受限 Job，不依赖公网入站 IP；证据完整才纳入正式产品。
- **R2**：受邀请节点协作、加入/领取/停止、用量上限、信用与滥用处理；
- **R3**：经独立法律、运营商、隐私和财务审查后再评估是否需要付费代理出口市场；默认长期延期。

与主产品路线的关系：此方向是可选 **Execution/Node Adapter**，不是替换 ScrapyJS 本地运行、AI 规则生成、Scrapling/Crawl4AI 云引擎，也不是改 Chrome 全局代理来让电脑天然得到手机蜂窝出口。节点端实现必须和 MV3 Host/Task 权限合同隔离，只有受审调用可进入原运行链。

## 9. 跨对话去重、评分与交接

下次对话先检查本文、`README.zh-CN.md`、`PRODUCT-ROADMAP.zh-CN.md`、`AI-ENGINE-PROXY-ARCHITECTURE.zh-CN.md` 和最新 `main` 的真实代码/证据。已完成项不重做，只实施未完成的差量。并行开发不能因文档新建而宣布已安装或正式发布。

每维分别按 100 分评估：产品价值、端到端可用性、移动双网络可行性、安全与合规、复用现有架构、成本/可维护性、可扩展性；综合分为算术平均，不得累加。所有设计方案目标 >=95，但不能将设计评分冒充真实 Android/Chrome 功能通过。真实验收独立标注 NODE、ANDROID_DEVICE、MAC_CHROME、REAL_NETWORK、REAL_RUNHOST、CLOUD、BILLING；未测标 NOT_TESTED。
