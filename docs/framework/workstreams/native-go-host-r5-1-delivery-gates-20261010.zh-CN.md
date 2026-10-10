# Native Go Host R5.1：从当前 CI 红灯到 Mac + Codex 的放行清单

更新：2026-10-10。性质：**跨仓库当前差距与下一轮执行次序**，不声称修改了运行时代码、重编译了用户 Mac 应用或已获得真实 Chrome 的权限回执。R5 本机执行主入口仍在 OpenDesk `master`：[`prompts/automation/native-messaging-host-mac-codex-r5.zh-CN.md`](https://github.com/shopable-ai/opendesk/blob/master/prompts/automation/native-messaging-host-mac-codex-r5.zh-CN.md)。

## 1. 原生链路与范围

Browser Service Worker / Sidebar / Controller / RunHost 依旧是浏览器 DOM、目标、网站授权、结果和 Stop 的唯一 Owner。OpenDesk Go `opendesk browser native-host` 只承接 Chrome Native Messaging stdio、认证 Socket 和 CLI。桌面 GUI 不需要常驻；普通用户**不需要 Native Node.js Host**。保留 Browser Node/WXT/Vite/webpack/npm 构建和高级 `native-agent/local-dev` ESM/npm/Codex MCP 真实消费者，旧 Node Native Host 留待受控迁移与回滚。不得因为文件包含 Node 字样而删除整个目录。

当前实际两个不同的 Codex 方向，**不可混称**：
- 已有开发者链路：**Codex 的本地 shell → Go CLI → Go Host → Browser**，入口 `opendesk browser doctor/bridge.status/target.current/run.start/run.get`，需要真实注册和网页许可。
- R16 待实施产品链路：**Browser Sidebar → Go Native Adapter → Codex App Server → AI 提案 → Browser RunHost**。以 `docs/architecture/browser-framework/workflow-ai-provider-routing-r16.zh-CN.md` 为界。Native 连通不证明本地 Codex 已安装、登录、真实 turn 成功、模型可用或工作流自动规划已实现。

## 2. 2026-10-10 主分支回归快照：先复现并修，不要直接跳到 Chrome PASS

Browser 候选 `e1d10b241ef77e5328abf917781b48d336db1042` 的 GitHub Actions（SHA 只对这一时点成立）：

| CI | 可核验情况 | 修复归属与放行要求 |
| --- | --- | --- |
| [Native Agent R1 #38038526216](https://github.com/shopable-ai/opendesk-browser/actions/runs/38038526216) | `native-agent-package.test.mjs` 断言固定入口数 **expected 14 / actual 15**；当前 `PACKAGE_ENTRIES` 新增 `runtime/builtin-libraries/page-core`。Mac Intel/Apple 两 job 在打包验证报 `Dynamic execution in runtime/builtin-libraries/page-core.js: Function`，**未进入真实 Chrome 握手阶段** | Browser Native + 内置库实现方共同核对第 15 个入口与可执行上下文；审查 WXT 输出的危险构造来源、安全边界和 CSP。不直接放开整个动态执行检查，也不单纯改测试期望使其绿 |
| [Page userscript/dependencies #38038526380](https://github.com/shopable-ai/opendesk-browser/actions/runs/38038526380) | 部分脚本预览回归报 `E_BUILTIN_RESOURCE` / “扩展内置资源无法读取” | 内置库模块 Owner 检查真实打包资源清单、`src/runtime/builtin-libraries/loader.js` 的 `chrome.runtime.getURL/fetch`、单测的受控 fetch mock 与扩展上下文；兼容原 userscript 权限，不退化脚本行为 |
| [Sidebar user tools #38038526178](https://github.com/shopable-ai/opendesk-browser/actions/runs/38038526178) | 组件通过，WXT production/package 同样被 `page-core.js: Function` 阻断 | 属于上游共用打包失败，不应由 Sidebar Tools 随意降级验证规则 |
| [Go bridge #38035362786](https://github.com/shopable-ai/opendesk/actions/runs/38035362786) | Ubuntu/macOS Go 传输、macOS Go 真实二进制对**模拟 Chrome 帧**、Go 单文件 Provider / 旧 Node 协议兼容 PASS（旧候选 SHA） | 只作为组件基线，**不能**替代当前完整 OpenDesk.app、真实扩展安装、真实 Chrome 用户授权和网页 Run/Result/Stop |

**Gate A（第一优先级）**：当前两仓库实际最新 SHA 固定后，修复新扩展构建及相关安全测试，使 `npm run check`、定向 Native/内置库测试、`npm run build`、`npm run build:dev`、`npm run verify` 在同候选上通过。每个旧失败都应解释原因与修复，不可删除测试或随意豁免 `Function/eval`。由独立任务 Owner 修改其实际责任模块；Native Host Agent 不抢占正在进行的 R15 内置库工作。所有远端改变串行落实到 `main`，不创建分支或 worktree，不覆盖他人未提交状态。

## 3. 可顺序执行的交付门槛

**Gate B：真实可执行 App 而非 `go run`。** 在真实 Mac 本地 Codex 使用现有 OpenDesk `master`，先运行 `go test -count=1 ./internal/browserbridge ./internal/browsercli`、`go test ./cmd/opendesk` 与 `./scripts/build_macos_app.sh`，验证 `dist/OpenDesk.app` 含默认 App Mode、其 Contents/MacOS/opendesk 可执行、版本/签名/hash。使用固定的**独立稳定安装路径**，对正在使用的 `/Applications/OpenDesk.app` 只读审计，先备份再审批升级；现有 Node 旧安装/未知结果不得覆盖。

**Gate C：真实 Chrome/CFT Native 首次连接。** 在隔离私有 CFT Profile 安装**同一候选** Browser package，读取真实 `chrome.runtime.id`，用固定 Go App 里的 `browser setup --extension-id <真实 ID> --browser cft --user-data-dir <已存在的绝对 Profile>` 预注册精确 origin。当前 Go `verifiedOfficialExtensionID=""`，全新开发安装无参 `setup` 返回 `E_OFFICIAL_ID_UNAVAILABLE` 是正确安全结果，不能伪造 CWS ID。通过真实 Options 手势授权 nativeMessaging，再检查 manifest、Go `doctor.connected`、`bridge.status.nativeConnected`、唯一注册的 Sidebar Host；用户网站授权独立完成。安装目录、`~/.opendesk-browser/native-agent-r1` 和 Chrome manifest 的 owner/权限/Socket 均需实际验证，隐藏凭据。

**Gate D：Codex → Go CLI → Browser 的真实执行闭环。** 先只读 `doctor` / `bridge.status` / `target.current`，从实际返回获取 registrationId、documentId、tabId、URL；受控 Demo `http://127.0.0.1:43111/demo-form.html` 上完成一次 `run.start` 的 draft，只读 title/url/params；用原 runId `run.get` 取得唯一持久 resultId、sourceHash、正确页面和 `retirementState:released`。另测 `run.stop`、重启、撤权、断线与 `request.get` 对 `OUTCOME_UNKNOWN` 的只读恢复。断线不可重新生成 requestId 盲目执行。Go 宿主不得混入另一套浏览器 DOM Driver。

**Gate E：真正方便普通用户的安装与维修。** 核实官方真实发布 extension ID 后由 OpenDesk 安装器预注册（先安装 App 和先安装扩展两个次序都应通过）；unpacked 开发版需要 OpenDesk 本地可见确认与精确来源绑定，不能通配符或从不可信深链自动批准。统一入口应显示“未安装 / 未授权 / 连接中 / 已连接 / 网站未授权 / 运行准备就绪 / 需要修复”，并提供一键诊断/重连（敏感日志隐藏在高级页）。这是待实施/待真实验收功能，开发者一次显式 ID 注册**不等于**普通用户零配置。

**Gate F：迁移和发布安全。** Node→Go 旧安装需 owner、真实 admission 账本、所有 `OUTCOME_UNKNOWN`、私有逐字节 manifest/wrapper/install.json 备份、受控切换及可恢复回退。不能仅凭 Socket 不存在就删除旧 Host。多 Chrome Profiles、升级后 App 路径改变、App 关闭后的 Chrome 重启、错误 manifest、权限撤销、资源竞争均需要验证。Go 单安装根单 Socket 不能宣称已支持多 Profile 并行。Windows 当前 `E_PLATFORM`，如产品目标覆盖 Windows，则需独立实现 Registry + Host/安全验收，不拿桌面 Windows 打包结果充当 Native PASS。

**Gate G：R16 Codex Agent 单独实施。** Gate D 的 CLI 是开发者测试，不是用户在 Sidebar 内已拥有“本地会员 Codex AI 工作流”。后者按照 R16 受限 `codex app-server` 设计独立实施 read-only probe、用户同意数据上传、thread/turn/event、人工批准和受限浏览器 Tool。它依赖稳定 Go Native 配对，但不得反向修改原 Native v1 的十个 RPC 或让 Native 安装被新模型功能阻塞。

## 4. 独立反方放行和下一轮交付物

按安全身份/权限、macOS 原生安装、CSP 与构建、浏览器真实 E2E、可用性/无 Node Native、兼容/迁移/回滚、Codex 真实能力分别给出 **PASS / FAIL / NOT_TESTED**、精确 SHAs、实测浏览器扩展 ID、App 二进制 hash、匿名化原始回执路径和证据级别。安全/CSP、真实安装迁移或效果未知防重放任一 FAIL，完整 95+ 放行一律 `NOT_ACCEPTED`。历史 R4 71/100 是当次自评，不得无新实证机械调高。

**执行顺序**：先 Gate A（与 R15 代码 Owner 串行协调）→ B → C → D，成功后再 E/F 的用户零配置与迁移，R16 Agent 独立排程。不要并行新增纯 Go ESM/npm resolver、删除其他 Node、实施云端 SaaS 或将多个尚未接通的模型入口强加进 Sidebar。

**唯一默认下一轮提示词**：沿用上述 OpenDesk R5 本地 Codex 提示词，先完成最新打包绿灯，再调用同一 Go 二进制做真实 Mac/CFT 的 Gate B/C/D；本页是其最新前置证据及通过规则，避免继续创建含糊的多份 GOAL。
