# GOAL：OpenDesk × OpenDesk Browser R6 —— 安装无先后、同机直接连接、局域网多设备安全配对与 95+ 验收

## 总要求

你是 Chrome MV3/Native Messaging、OpenDesk Go/macOS、局域网发现与 mTLS、设备身份/信任、安全红队、Sidebar UX、Codex/MCP、自动化验收的联合工程负责人。**默认中文，直接实施真实仓库，不要只写计划、模拟截图或重复 R1–R5 已做的代码。**

- Browser: https://github.com/shopable-ai/opendesk-browser — 只修改 `main`
- OpenDesk: https://github.com/shopable-ai/opendesk — 只修改 `master`
- **不新建分支、worktree、强推、reset、覆盖别的 Agent 的未提交修改；先保护工作区和运行中的 Chrome Profile、Native Socket。**
- 首先阅读 Browser `docs/architecture/browser-framework/native-connection-topology-r6.zh-CN.md`（本轮唯一新增产品目标），以及 R2/R3、Go `docs/integrations/browser/native-connection-topology-r6.zh-CN.md`、R2 `docs/integrations/browser/native-zero-config-pairing-r2.zh-CN.md`、R5 `native-mac-build-install-test-r5.zh-CN.md`、两仓库 `AGENTS.md`。查看最新 `git status`、`git log`、CI 和已经完成的 Go 单文件 Provider；不重复重造。
- 浏览器官方 Native API 与 Chrome 本地网络权限参考见上述 R6 文档，不凭记忆假定权限行为。

## 一、用真实代码解决安装无先后与自动连接（最高优先）

产品验收的两条对称路径必须一致：
A. Chrome Extension 先安装→暂未发现本机 OpenDesk→普通脚本照常使用→OpenDesk 后安装/注册→自动重检测→Native READY。
B. OpenDesk 先安装→可信 Host 注册（扩展未安装也可注册正式、固定、受信 ID）→Chrome Extension 后安装→直接连接→Native READY。

用户不输入 32 位 ID、不执行 setup、不打开额外“授权连接”页面。Chrome 必须获得自身所需 Native 权限，**优先研究正式安装时将 `nativeMessaging` 从 optional 移到 required**，并同步修改 `AGENT_ENABLED_KEY` 的首次启用/显式拒绝迁移、`settings.js` 交互和测试。安装/更新中的 Chrome 系统权限确认合法保留；不要伪装成用户根本不需要浏览器授权。手动断开后永不擅自重开。Native Host 未安装时只读重试，不产生无意义常驻轮询或业务执行。

必须核对实际发行 extension ID；未有官方稳定 ID 时**不得**硬编码测试 ID、使用 wildcard 或将开发版误报正式零配置。可以先在受控开发 Chrome/CFT 对安装顺序、重探测和拒绝状态完成真实实现；有账户权限的人可以预留未公开商店草稿身份但不得擅自上传/发布。开发版随机 ID 的可见原生确认配对和回退同时推进，不能因为它阻塞就停止其他可实施部分。

请**直接调整 Sidebar UI**：“连接本机 OpenDesk ↗”改成默认连接状态与“重新检测”；取消正常使用中的独立权限链接；详细设置保留高级诊断/设备管理。Native 已连接不等于项目 Provider 已连接，直接编辑正常运行不被阻断。必要时新增最小 `chrome.alarms` 退避或 Sidebar/Options 进入探测，不要让 MV3 Service Worker 无限存活。连接失败必须区分无 Host/Chrome 权限/未配对/版本不兼容/用户已断开。

## 二、局域网设备模式：优先安全 Go↔Go，保留浏览器仅扩展场景

用户可能拥有电脑 A（Chrome Browser）和电脑 B（OpenDesk），也可能两端都安装 OpenDesk：

- **默认**：A 的 Chrome Extension 用 Chrome Native Messaging 连接 A 的 Go Host，无需局域网授权或网络端口。
- **第一条 LAN 交付路径**：A 有 Go Host，A Go 仅在明确选择后与 B 的 OpenDesk 使用经过双端设备确认的 mTLS 连接。B 提供受授权项目/计算，网页 DOM 和原 RunHost/Controller 始终在 Chrome(A)。不自动切到别的在线设备。
- **第二条可选 LAN 路径**：A 只有浏览器扩展，B 有 OpenDesk。这不能通过 `connectNative` 跨机实现。做真实 Chrome 的 HTTPS/WSS 可行性及 TLS/扩展 host permission/Local Network Access 验证；若可满足同等安全及产品体验，则定义并实现独立版本化的 Browser→B 网络客户端；否则用受限 Go helper 或可信中继的方案明确说明需要在 A 安装什么。不可强迫用户安装本机完整 OpenDesk 而把“远程模式”仍伪装为“无本机程序”。

LAN 服务**默认不监听外部网卡**。用户在 B 明确启用共享后才开放必要端口及 mDNS/Bonjour 公告，候选发现只做 UX 不授信。首次配对：显示候选设备/公钥身份，用一次性高熵邀请、双端确认/SAS、超时/限速后绑定持久 deviceId 和最小 capability，双方可单独撤销、轮换和查看日志；不能用 IP/主机名/广播/OS deeplink/token-in-URL 当信任证明。网络传输加密并经过证书/对端验证；严禁裸 TCP/HTTP/ws、忽略证书、wildcard CORS、默认远程 shell。用 Go 本机受限密钥存储，不能放 `chrome.storage.sync` 或把私钥发送给网页。

设备选择：`自动（本机优先）`、`此电脑`、`局域网已配对设备`；“自动”在本机不可用时**不能未告知就改用远端设备**，仅在用户先明确允许并固定过的目标上进行只读重新连接。远端项目必须显示 deviceId/设备名/siteOrigin/项目授权状态，解绑后清除其会话。局域网默认不跨 VPN/WAN，除非用户显式选择；如防火墙、隔离网络或无法发现，应给出准确提示及可选手动私网地址。

远端 AI/Codex 和本地 Browser Run 是不同 capabilities。不能让 B 因为已配对就读取 A 的 Cookie/标签页/任意路径，更不能从远端网络请求跳过 A 浏览器的可信 sender、目标与 run admission。文件改动/网络重连只能刷新 Provider，绝不能自动 `run.start` / `script.save` / `page.preview` 或对未知效果换 requestId 重试。

## 三、项目、应用与安全兼容（不要重做已有能力）

复用 OpenDesk Go `internal/browserbridge/project_store_unix.go` 已有受权单文件 Provider 和 `project_notify_unix.go` epoch 通知；Node `native-agent/local-dev` 仍承担高级 ESM/npm/Codex MCP。远端 B 项目文件留在 B，只有受用户批准的 frozen source 与 hash 通过窄协议到 A；首次项目 grant、siteOrigin、执行来源与目标文档都要精确，未授权不读磁盘。多文件 ESM/UI 属于后续独立子目标，不能为完成 LAN 把原 Node 目录删除。

Node→Go 旧安装必须逐字节备份、禁止互相覆盖；同一安装根/Socket/多 Chrome Profile、多设备并发必须实证无误或正确拒绝，不要抢占其他 Agent 运行资源。OpenDesk GUI 不是 Chrome Native Host 的必需常驻进程；连接时安全地由 Chrome 启动已签名安装路径上的 Go Host。不能把 R16 的 App Server 当作本轮 Native 身份验证后门。

## 四、测试和验收：争取独立评分 ≥95，绝不虚报

先按文档受影响范围进行 Go 单元和 Browser 定向回归；引用已有相同代码和环境的 PASS，不能不分版本复用过期证据。必要测试：
- 正常安装的两种顺序，首次扩展安装权限、明确断开不可恢复、Chrome 冷启动/重启、Go 安装后重检测、无 Native 时直接编辑照常运行。
- 官方稳定 ID 或 CFT 实际受控 ID，不允许 wildcard；Go Host/Node Host 旧安装冲突、manifest 路径和所有权/符号链接/凭据、Profile/Socket 并发、异常进程退出。
- 真实 macOS Chrome/CFT 点击权限、Go Chrome frame、唯一 Sidebar 注册、精确 document、`run.start/get/stop`、结果 resultId、sourceHash、`retirementState:"released"`、Page 预览与清理，实际同 SHA Go 二进制及扩展包。
- **LAN 两台设备或有真实网络隔离特征的可检验环境**：双端配对同意、第一次拒绝、篡改广播/错证书/重放码/错设备重连、mDNS 不可用手动地址、拔网线或跨网切换、失窃设备撤销、跨用户授权拒绝、限制上传文件与源码、凭据不进入网页。
- **仅扩展 A + 远端 B**，明确验证可用的 HTTPS/WSS 浏览器权限及 Chrome Local Network Access 行为；无法通过时必须报告 `NOT_IMPLEMENTED` 与安全阻塞，不得靠关闭证书校验演示成功。
- Real Mac GUI 320/360/420px Sidebar、设置设备选择/断开/重连、可访问性、截图与失败文案。CI 原生模拟 Chrome 不等于真实 Chrome 授权，也不等于真实 LAN 两台电脑。
- 两仓库 GitHub CI（包含并行其他任务的相关失败归因）不得为消除红色检查删除用例、篡改安全规则或提交伪造结果。

从 UX、Chrome、macOS Native、LAN transport、安全 red-team、Browser 执行权威和 QA 七个专业立场写独立理由与反方拒绝清单。设置可核验权重，争取≥95；**未经同意暴露端口、设备伪装成功、越权读取目录/网页、跨设备静默切换、未知效果被重放、既有 Node 安装被覆盖，属于 Critical FAIL，任何分数均不得通过。**

## 五、交付规范

仅在浏览器 `main`、Go `master` 串行集成，不创建分支/worktree，不强推、不覆盖其他对话 dirty files。实现代码、自动测试与产品文档更新到真实仓库，分别报告 commit SHA、真实 Go 可执行文件/扩展包身份、Chrome/CFT/2机 LAN 原始证据、失败/NOT_TESTED 及明确的回滚方案。正式发布/上架、改动用户当前真实 Mac 的长期系统安装或跨设备防火墙设置必须遵守环境授权，不要为了测试静默覆盖生产程序。

最后输出：①真正的普通用户两种安装顺序操作；②本机直接连接与局域网多设备使用方式；③浏览器只有扩展、没有本地 OpenDesk 时能否直连远端；④仍需要哪些系统权限和安全确认，为什么；⑤完成了什么、真实验收分是多少。

**不是再输出一个新规划或提示词：实施并验证所有有条件完成的工作。** 如果实际官方 ID/双机环境不可用，继续完成与这些阻塞无关的真实代码，明确记录待验收边界。
