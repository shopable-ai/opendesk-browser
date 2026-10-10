# OpenDesk Browser / Native Host R2：先安装本机程序、无 Extension ID 配置、可信自动连接

日期：2026-10-10。状态：**R2 产品与安全设计已确立，部分 Browser 只读重检测已经实施；首次注册与自动配对端到端尚未实现。**

> **R4 原生单文件增量（2026-10-10）**：OpenDesk Go 已新增经过用户显式授权的单 `.js/.mjs` 文件 Provider、私有 grant、`projects.list/project.resolve`、授权变更通知和 Provider epoch；Linux/macOS 组件及真实 macOS 二进制模拟 Chrome 测试已有通过记录。**仍未完成**普通用户 GUI 授权、多文件 ESM/npm/HTTPS、正式 CWS ID 预注册及实际 Chrome 页面 Run/Stop 验收。参见 [Node/Go 分工与退役台账](native-convergence-compatibility-r3.zh-CN.md)。 本文不把设计当作真实 Chrome 验收。与 [Go Native Host R1](native-host-go-provider-r1.zh-CN.md) 和 [原生接管设计](opendesk-native-takeover-r1.zh-CN.md) 配套。

> 运行时双实现不是直接复制合并：传输、安装 Owner、Node/Go CLI/Provider、未知效果与信号生命周期的逐项差异，参阅 [Native Host 双实现融合 R3 兼容台账](native-convergence-compatibility-r3.zh-CN.md)。两仓库的 Desktop/Browser 执行器继续分离。

## 1. 用户需求和非目标

用户应能先安装/启动 OpenDesk，再安装 OpenDesk Browser 扩展。正式用户不需要事先知道扩展 ID、不执行命令行 `node native-agent/cli.mjs setup --extension-id ...`，也不要求为 Native Host 安装 Node.js 或开启固定的本地 HTTP 端口。扩展获得用户认可的 Native 权限后能找到本机程序、连接、显示准确状态，并继续使用已授权的本地项目和原有浏览器自动化。

**不得将“本机 Native 已连接”冒充“本地项目 Provider 已就绪”。** 当前 Go Host 已有 Native/Socket/CLI 兼容候选，但项目 ESM/npm/HTTPS Resolver 仍由 Node MCP 负责。R2 需要单独推进 Go 内原生项目 Provider，普通 JS 文件优先，复杂依赖随后跟进。Browser DOM 执行、用户脚本、目标、权限、RunHost、Controller、持久结果与 Stop 不迁出扩展。

## 2. 受 Chrome 限制的技术事实

Chrome Native Messaging 只能由扩展 `chrome.runtime.connectNative(name)` 或 `sendNativeMessage(name)` 主动开启。Chrome 根据本机 NativeMessagingHosts manifest 的 `allowed_origins` 判断是否允许精确 `chrome-extension://<ID>/`；不接受通配符。未安装扩展时，本机程序无法从 Native Messaging 主动连接不存在的插件。

因此所谓“反向连接”采用**安装先行、浏览器发起通信**的实现，而不是另建浏览器权限旁路。OpenDesk 首次安装可完成可信 Host 注册，之后 Chrome 自动启动 Go Native Host 的纯传输模式；桌面 GUI 无需始终在前台运行。

### 默认链路（发行版）

```text
OpenDesk 安装器先运行（用户的 OS 账户）
   └─ 只对已核验的正式扩展 ID 注册 Native Host manifest
        └─ Chrome 安装 OpenDesk Browser 扩展
             └─ Sidebar / Options 发起一次“连接本机 OpenDesk”
                  └─ 真实用户手势授予 nativeMessaging（已经授予则直接连接）
                       └─ 扩展 Service Worker connectNative
                            └─ Chrome 启动 Go Host（stdio, 无 Node/HTTP）
                                 └─ Native hello/welcome + 原私有 IPC 与 Host 登记
                                      └─ 同一个 Sidebar RunHost / Controller / Page
```

安装器**可以早于扩展存在**：前提是正式发行版提前拥有经核验、固定的 Chrome Web Store 扩展 ID。不可从未安装的未知随机 ID 预知其身份；当前仓库未保存可核验的正式商店 ID，因此不能填入示例假 ID 或声称正式 auto-enroll 已交付。

## 3. 发行身份（官方零输入 vs 本地开发配对）

| 分支 | 实施方式 | 额外确认 |
| --- | --- | --- |
| 正式发布的 Chrome 扩展 | 发行流水线维护已核验的扩展 ID，Go 安装器携带**精确** allowlist；OpenDesk 启动/安装时预注册，不要求扩展先安装 | 用户首次授予浏览器 nativeMessaging；项目目录与网站仍独立授权 |
| 开发版/CFT 已固定身份 | 使用同一渠道公开 key 且与真实测试 CRX 身份一致的受控 ID，**测试配置单独隔离**；绝不能随意更改生产扩展 ID 或将私钥入库 | 对新开发版/非正式渠道明确提示 |
| 动态 unpacked ID 或第三方 fork | 无法安全“盲自动加入 allowed_origins”；由扩展使用自己读取的 `chrome.runtime.id` 启动一次 OpenDesk 本机配对请求，经原生 UI **显式核准**后原子注册该精确 ID | 用户查看程序和浏览器双侧信息，确认后由扩展重新检测；不要求手工抄 32 位 ID |

开发版的可选跳转采用 OS 应用关联 `opendesk://...`，只把 ID/无权限 nonce 当**不可信配对申请**，不可自动入白名单。链接可以由任意网页伪造，OpenDesk 必须有独立可见的用户确认、短时一次性申请、渠道/安装身份检查和“取消”选项。若原生 URL Handler 跨 Chrome/OS 的真实可行性未通过验证，回退到应用内明确的“配对浏览器”操作，不改成静默扫描浏览器 Profile、剪贴板或开启本机 HTTP 执行端口。URL Handler 不构成签名或扩展来源证明。

生产的 `manifest.key` / CWS ID 必须由发行签名和实际商店产物核对。开发版复制公开 key 并不能证明它是受信任发行者签名的包；仅凭 ID 不应给予额外文件读取、项目安装或网页执行权限。

## 4. 插件连接状态与交互

```text
未请求权限 → [连接本机 OpenDesk]（用户真实点击）
    ├─ 权限拒绝 → 权限未授予；保留普通 Sidebar 功能
    └─ 权限授予 → 连接检测中
          ├─ Native hello/welcome 完成 → 本机已连接
          ├─ Host 不存在/未配对/Chrome 不可读 → 无法连接，提示安装/配对并可重试
          ├─ 协议不兼容 → 提示升级，不隐式覆盖旧 Host
          ├─ 原有 Node Host 冲突 → 明确迁移/保留，禁止强制清理
          └─ 网络或平台异常 → 具体错误诊断，不虚称已配对
```

本机连接层 **不得** 访问网页、读任意项目目录、启动脚本或索取网站权限。成功后可在“开发 → 本地项目”显示「本机已连接；尚未授权项目」等独立状态。用户明确授予目录后才显示项目，点击 Run 时按原 RunHost/文件快照机制执行。文件改动仅刷新状态，不自动重放浏览器动作。

当前已实施的最小代码：`src/native-agent/service-worker.js` 的受信 Options `status` 可以在已启用且 Port 不存在时重新发起一次只读 Native 连接；`settings.js` 显示 connecting 并短暂观察 hello。**它不是首次 ID 配对，也不会在缺少 Chrome manifest 许可时跨越限制。** 不做无限轮询、Chrome 后台常驻定时器或在用户未授权时 connectNative。

正式 UX 从 Options 单次连接收敛到 Sidebar 的明确入口；后续 UI 要区分：`unregistered`（未知，不能猜测）/ `native-permission-required` / `connecting` / `host-ready` / `project-provider-unavailable` / `project-ready` / `incompatible`。技术错误码留在诊断折叠中。不能伪称浏览器 Native API 能告诉扩展“本机 App 正在 GUI 前台运行”。

## 5. 两仓库职责与数据权限

- **shopable-ai/opendesk（Go）**：安装/首次启动时预注册可信发行 ID；开发版非自动配对需经显式确认；维护宿主 manifest、安装根、私有 credential、CLI、Go 项目 Provider。要求 Native Host 无 Node、无 localhost server、无第二套浏览器执行器。
- **shopable-ai/opendesk-browser（JS）**：浏览器 Native 权限请求（真实用户手势）、连接与状态；维持精确 extension identity、existing Provider `dev.state/dev.request/dev.response`、同窗口 Host/RunHost/Controller 安全栅栏。只在用户明确点击运行时执行。
- **Node MCP**：开发者高级可选通道，保留当前 npm/HTTPS 等能力，不作为普通用户首次连接的强制步骤；未来 Go Provider 支持等价功能前不能宣布“本地项目完整无 Node”。
- **用户权限**：Native 授权 ≠ 文件目录授权 ≠ 网站授权 ≠ 自动化执行批准。撤销任何一项应收敛 UI 状态，但不能自动补发已分发操作。

原 Native manifest 名称 `com.shopable.opendesk_browser.agent`、`AGENT_VERSION=1`、Go Host 私有 credential/stdio、requestId/ledger、`OUTCOME_UNKNOWN` 的只读恢复语义必须保留。严禁新增可以直接 `run.start` 的 localhost HTTP/WebSocket API，不能把 OS 深链的 ID 或 nonce 当作文件访问令牌。

## 6. 实施阶段（建议由两个仓库同一 owner 串行完成）

### R2.0 实际身份与兼容审计

1. 查询 Chrome Web Store 官方扩展 ID 与对应签名/manifest key；若尚未分配，可由有权发布者**创建未公开的 Store 草稿条目以预留固定 Item ID**（不等于正式上架或同意发布）。从草稿条目得到实际 ID，与 Chrome 实际安装的受控包核对，官方产物签名/渠道仍需独立验证。AI 未获发布账号权限时只记录阻塞，不自行上传或发布；不得硬编码猜测值。
2. 核对 Go R1 真实 Chrome、旧 Node 安装、权限撤销和多 Profile 行为。现有旧安装需要显式迁移和逐字节私有备份，不静默覆盖。
3. CI 增加发布身份一致性校验：签名/渠道 ID → Go 精确 `allowed_origins` → 实际 Chrome `runtime.id` 必须相同。

### R2.1 Go 原生安装器自动预注册

- 官方安装器在 extension 不存在时预注册 Native manifest；必须仅能写它拥有的用户级路径，并做 ACL、所有者、符号链接、冲突检查。
- 新安装可以直接无参数完成可信 identity 注册；旧 setup `--extension-id` 仅作为高级显式 fallback；禁止脚本拼接任意 ID 插进生产 allowlist。
- 真实 CFT/Chrome 证明 app-first、extension-first、单/多 Profile 差异、断开/重连与失败回滚。

### R2.2 开发版一次性配对

- 浏览器在可信用户操作后读取自身 `runtime.id` 并提交配对申请；原生应用显示可核对的 extension/channel/申请来源与风险，确认后只增添被批准的那个 ID。
- 双方短时状态机：`requested → pending-native-approval → manifest-updated → native-acknowledged`，失败终态明确；取消/过期不得留下孤儿 manifest。
- Chrome 可能缓存 Native host manifest；若需浏览器重启，用明确提示和真实测试证据，不宣称一定即时生效。
- 不接受网站、未授权扩展、任意本机进程可悄悄完成配对；测试伪造 deeplink、重放、symlink、跨用户/跨 Profile、恶意 id。

### R2.3 Node-free 本地项目

- 先实现 Go 受控文件和本地目录项目的只读授权表、`projects.list`、`project.resolve` 与精确撤权；复用旧 providerEpoch/Hash/Source bytes schema 和 Browser 端 `local-project-service`。
- 单文件 Controller / Page 可作为最小正式闭环。多文件 ESM 要对齐已有 Resolver/锁/资产/哈希验证；Go 仓库已有 esbuild 依赖，但必须先验证等价构建产物和文件系统越界防护。
- npm/HTTPS 外部依赖继续高级开发路径，除非 Go 内已有可靠的授权、锁定和离线缓存能力。不可通过执行用户项目的 `package.json scripts` 补功能。
- 初次选择目录必须用户明确允许；AI 可以辅助组织，但不能静默授予全盘权限。

### R2.4 联合验收

分别验收组件、Go/JS 跨进程、受控真实 Chrome、真实 Mac GUI、实际项目 Run/Stop/Result。必要场景：先装 App→后装扩展；反向安装；App 关闭 GUI；Dev ID 变更；Node 安装冲突；权限撤销；两个 Chrome profiles；原生进程崩溃；运行中断线；不联网；重复启动/升级；不可执行内部页。

产物包括身份与 Host manifest 的实际证据、Go/Browser 相同源码 SHA、Chrome permission request 的用户手势证据、原 runId/resultId、`retirementState:released`、未通过矩阵和回滚证明。未通过的场景记 `NOT_TESTED/FAIL`，不能把组件 PASS 宣称产品 95+。

## 7. 反方审计结论

- 不能为追求“零点击”直接把 `nativeMessaging` 改成默认必需权限，并隐藏首次安全选择；正式版可将“第一次连接”的真实点击压缩为一次，不应替用户授予网页/目录权限。
- 固定 localhost discovery 的确可以绕开预知 extension ID，但扩大跨站请求、DNS/rebinding、Origin、端口抢占和令牌窃取风险，并构造第二条受权通道。当前无需采用。只有 Chrome 平台真实测试表明 Native 路径无法达到目标时才能另开受控 ADR。
- 自动检测不等于自动执行；断线重试只读/握手，不重放业务 mutation、Stop 或未知效果。
- 没有正式扩展稳定 ID 时，不能宣称已完成“先安装 App、后装任意未知扩展自动无确认配对”。
- Go Host 接入本身不消除 npm/ESM MCP 的开发依赖，R2.3 是必须独立完成的真实产品功能。

## 8. 当前交付检查

- Browser 已新增“已授权后在 Settings 状态查询时重新探测 Native”的只读能力及定向测试；CI 与原生验收必须核对当前 main 的具体 SHA。
- Go 原生自动预注册、开发版 OS 配对、普通用户**图形文件授权及多文件项目**仍待实施；Go 精确单文件 Provider 已有可验收源码与跨进程测试。全新未发布渠道仍不允许无 ID 猜测安装。
- Go 仓库产品配套任务见 [Go 自动配对实施文档](https://github.com/shopable-ai/opendesk/blob/master/docs/integrations/browser/native-zero-config-pairing-r2.zh-CN.md)。

## 9. 六角色对抗式架构复审与专家评分口径（2026-10-10）

**评审方法**：以产品设计、Chrome MV3、Go/Desktop、系统安全、AI/MCP、真实 Chrome QA 六个专业立场开展同一回答中的交叉质疑。不是六位真实外部专家的独立认证，分数为证据约束下的工程判断：设计成熟度暂评 **86/100**，完整产品交付成熟度暂评 **62/100**，均不能对外声明“95+ 已验收”。

| 专业立场 | 主张 | 反方否决点及收敛决策 |
| --- | --- | --- |
| UX / 普通用户 | 先装 OpenDesk 后装扩展、正常路径零命令行；首次最多一次浏览器 Native 权限确认 | 扩展 ID 不应向普通用户询问；连接按钮不能暗示已经有 Go 项目 Provider |
| Chrome MV3 / Native Messaging | `connectNative` 只能由扩展发起，Chrome 必须预有 Host manifest；`allowed_origins` 精确匹配 | 没有正式扩展 ID 时不可凭空识别；禁止 wildcard/默认信任任意 unpacked ID |
| Go / Desktop lifecycle | 复用 OpenDesk 同一发行二进制的 `browser native-host` 专用模式，Chrome 按需启动 | **存在 Host/CLI ≠ GUI 已完成安装前置注册**；验证签名程序绝对路径、安装器执行点、Profile 与 socket 并发 |
| Security red team | 目录、Native、网站和 Run 四重许可完全独立，未知效果只读恢复 | 任何网页可以伪造 OS deep-link，严禁收到链接就写入 manifest；单用户私有文件、原始绑定、旧 Node 必须 fail-closed |
| AI / Codex / ESM | AI 可以在受控 CFT 测试时读实际 extension ID 并内部调用高级 CLI；正式用户不能被要求手动执行 | Node MCP/ESM Resolver 仍在另一进程，Go Host 接管不能被宣称为“本地项目完整免 Node” |
| QA / Chrome / Release | 架构与实现分开评分，当前 macOS Go 模拟 Chrome 通过只是组件证据 | 没有同一候选真实 App-first / Extension-first / 受控授权 / Run+Result+Stop+recovery，就不能加到 95 分 |

### 9.1 按证据加权评分（不是虚构的测试通过率）

| 维度 | 权重 | 当前可交付评估 | 95+ 目标证据 |
| --- | ---: | ---: | --- |
| 零命令行与可理解性 | 20 | 13 | 正式安装 App→扩展→真实授权；不询问 ID、不碰终端 |
| Chrome 平台遵循 | 15 | 14 | 精确 Native manifest、Chrome 权限、不同宿主 lifecycle |
| 发行 ID / 安全 / 迁移 | 20 | 11 | 官方 ID 证据、伪造配对拒绝、Node 备份/回滚、无越权 |
| Go 原生 Host 与安装器 | 15 | 11 | 真实签名二进制、无 Node、安装器自动登记、Mac/CFT 互通 |
| 原生本地项目功能 | 15 | 3 | 受授权单文件及多文件、Provider、源码 SHA、Controller/Page |
| 失败与生命周期恢复 | 10 | 7 | 断连、撤权、并发、重复/未知效果、Profile 冲突正确 |
| 独立真实交付证据 | 5 | 3 | 同提交、同发布包、多端验收及用户级可重复操作 |
| **合计** | **100** | **62** | **至少 95 且关键门槛全 PASS** |

设计成熟度暂评 **86/100** 是对目标方向及安全约束的非量化专家判断，并非用上述“已交付”表相加得出。正式分数由最终受控证据复核，不得以“文档已经写好”提高分数。任一 Critical 安全项 FAIL、`OUTCOME_UNKNOWN` 被重放、未经许可读取目录、非官方 ID 静默授权、Node 安装被覆盖，即使算术分超过 95 也必须判 **NOT_ACCEPTED**。

### 9.2 当前真实差距（禁止将代码存在写成完成）

1. `shopable-ai/opendesk/internal/browserbridge/install_unix.go` 已有真实 Go Native Host/安装实现，但官方商店稳定 ID 尚未核验，`verifiedOfficialExtensionID` 仍故意为空。当前 `SetupAutomatic` 可在**已有合法 Go 安装**时不传参数复用身份；**全新未发布环境不支持无条件 `setup` 成功**，报 `E_OFFICIAL_ID_UNAVAILABLE`。
2. OpenDesk 原生 GUI/安装包**尚未证明**在首次启动/安装阶段调用官方 Host 注册。Chrome 只能按已有 manifest 拉起 Go Host；GUI 关闭不等于 Host 永久进程存活。
3. 随机 unpacked 开发版 ID 未实现独立原生确认配对。OS 深链提案仍为设计，不能把只读尝试连接冒充配对成功。
4. `native-agent/local-dev/mcp.mjs` 仍是 Node 高级 ESM/npm/HTTPS 项目 Provider。OpenDesk Go 已有明确用户授权的**单文件** `projects.list/project.resolve` 与 epoch 刷新，但图形文件选择/目录项目/npm/ESM 仍未实现，不能将它宣传为全项目去 Node。
5. 一个安装根、一个 `agent.sock` 和单个 `ExtensionID` 的当前 Go R1 默认合同不支持可靠的并行多 Chrome Profiles。要明确限制或设计可验证的多 Host 实例/身份，不可用全局锁竞争后假称支持。
6. 现有 Go Setup 文件写入顺序和迁移语义必须进行崩溃/断电/已存在文件的事务性回滚验收，不能覆盖未知 Node Host。Windows Native 当前代码返回 `E_PLATFORM`，不可声明跨平台产品全部完成。
7. Browser 已提供 Sidebar「连接本机 OpenDesk」→ 扩展 Settings 的可信点击导航，以及已授权时重试 Host 连接；它不会申请目录权限或自动执行。Native Settings 连接成功不等于本地项目源码 Provider 已连接。

### 9.3 统一状态机与安全不变量

UI 顶层区分 `permission-required`、`connecting`、`native-ready`、`project-provider-unavailable`、`project-ready`、`incompatible`；底层无法连接时只能说“无法连接/原因待诊断”，**不可**仅凭 connectNative 失败确定应用未安装。高级诊断可展示实际 runtime.id；普通用户不填写、不抄写、不黏贴。

- 不变式 A：生产默认 ID 必须来自已核验的发行身份；公开 unpacked manifest key 并不是安全签名证明。
- 不变式 B：只由浏览器可信用户手势申请 `nativeMessaging`；目录授权和网站授权另行明确执行。
- 不变式 C：Native 探测、重连接以及文件更新事件都绝不能调 `run.start`、`script.save`、`run.stop`、`page.preview`，也不能重试已入场的请求。
- 不变式 D：Native Host 只转发，唯一浏览器 Run 权威仍为 Sidebar RunHost / Controller / Page；旧结果来源、文档身份、revision 与 sourceHash 不变。
- 不变式 E：旧 Node provider 迁移必须有实际备份与原 run/result 状态核对；未知效果拒绝切换，不准 `reset --hard`、删除其他 Host manifest、粗暴清理 socket。
- 不变式 F：当前未发布渠道启动无参数 `setup` 时，必须返回明确 `E_OFFICIAL_ID_UNAVAILABLE`（除非已有可信 Go 安装）；不是产品“失败”，而是拒绝安全伪装。

### 9.4 单一执行规格和下一轮验收

在 Mac 本地 Codex **按以下唯一 Prompt** 串行处理两个仓库，勿并行写入相同现场：

[Mac 实施与验收 GOAL](../../framework/prompts/goal-native-zero-config-r2-mac-codex-20261010.zh-CN.md)。

完成定义需同时满足：① 已验证正式 ID 或对无正式 ID 的受控开发版显式登记；② App 安装先行和扩展安装先行；③ 浏览器真实 Native 权限手势；④ Go Host 的真实 Chrome 帧/Hello/CLI；⑤ 本地目录确切授权与 Provider；⑥ Controller/Page 实际 Run/Stop/Result；⑦ 断线/取消/重入/迁移；⑧ macOS 原生视觉和发布程序同一 SHA；⑨ 旧 Node 可回滚；⑩ 与浏览器的当前 `main` 和 Go 的当前 `master` 提交证据对应。

未完成这些，不写“最终完成”也不以主分支提交替代验收。官方 Chrome 规范：https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging 。
