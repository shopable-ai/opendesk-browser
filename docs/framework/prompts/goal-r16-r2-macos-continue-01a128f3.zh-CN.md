# GOAL：继续完成 OpenDesk Browser R16 R2 macOS 真实验收与必要修复

接续已有实施和本机原始证据，完成原始正式任务书 Gate A–F。不要从零开发，不只输出计划，不重复历史阻塞，不把诊断包或组件 PASS 提升为最终验收。

## 仓库、必读材料与授权

Browser：`/Users/shopme/Documents/workspace/opendesk-browser`，只用现有 main。
Go：`/Users/shopme/Documents/workspace/opendesk`，只用现有 master。

完整读取两仓 AGENTS.md，以及：

1. Browser 正式任务书 `docs/framework/prompts/goal-r16-r2-local-macos-repair-acceptance.zh-CN.md`。
2. Browser 最新记录 `docs/framework/workstreams/r16-r2-macos-01a128f3.md`，以文末最新交接为准；保留早期状态和失败。
3. Go 最新记录 `docs/integrations/browser/workflow-codex-app-server-r16-r2-macos-01a128f3.zh-CN.md`。
4. 两仓旧 01a12689 验收记录、Browser `docs/framework/testing-guide.md`、相关工作流及原始 receipt。
5. Browser `.runtime/tests/r16-r2-macos/01a128f3/continuation-handoff-state.json` 和下述命令/构建/业务证据。

授权必要修复、安全本地 Lore 提交和普通可逆操作；不创建分支、worktree 或新聊天，不推送远端主分支、不发布。保留全部并行修改/进程/产物；不得 reset --hard、clean、强推、盲目 pull 或整体暂存 .runtime。Go customui/macOS 和 runtime-api 的用户差异不得覆盖、还原或纳入本轮。

两个人类授权继续有效：

- 用户明确“可以读取或复制 ~/.codex/auth.json，你有权限”，覆盖正式 Gate A 对该文件的原限制。上一轮已一次复制到独立 CODEX_HOME，官方登录已确认；不打印凭据、不修改源文件或个人配置，不再要求重复网页登录。优先直接复用已登录的独立 Home。
- 用户明确授权一次 **精确 PID 激活** 本轮 Chrome PID 1091。原生 helper 已编译但尚未执行；只能核对 PID/bundle/executable 后激活窗口，全部业务点击/输入仍 CUA。先重核 PID/profile，PID 改变不得盲跑旧 helper 或扩大为其他原生 UI 输入。

## 最新代码与正式包边界

交接时本地 Browser main HEAD：`51dc666c2f02e9cd99956700523429a84d2e9824`。
Go master HEAD：`802fb009c8f0c9a6ce85b1b9e4320ffd0a65ae45`。
Go 已验生产候选：`cb35e574760daa390803740f6e3803d6621f2825`，到上述 HEAD 是文档变化；启动时重核后续提交。

已构建正式 Browser 候选：`2cc6879a0b56c4bacf5ded2ada876a6ff9435792`，tree `ded3d6922722145bbb3f8ab5adc7eadcaea138b8`。**它不是当前 main 的等价包**：后续 main 包含 ESM/libs/TOC/Local Project 及测试/CI 输入变化。先核对生产输入影响再确定最终冻结候选；只重测受影响范围。

独立 git archive：`.runtime/tests/r16-r2-macos/01a128f3/browser-final-candidate/`，排除并行未提交输入。
正式 production packageHash：`7752a9a58b2c130f96a4c8c565226d0e89ead953ac6338b5e3159e19193e4dca`（40 files）。
正式 development packageHash：`d9ca61feba925d810e6e89c0be06199bbdefa31a5d154cfeb91290ed18fdc811`（57 files）。
两 receipt 均 237 sourceInputs、sourceDriftDuringBuild=[]，在 `final-build-evidence/build-production.json` / `build-development.json`。

已 PASS：独立 npm ci --offline、check、生产/开发 build、verify；`final-package-regression.tap` 94 PASS / 0 FAIL / 0 SKIP；`final-workspace-tests-after-build.log` 13 PASS。命令、cwd、退出码：`final-build-commands.json` / `final-package-regression-command.json`。首次构建前 Workspace 测试 11 PASS / 2 FAIL（dist ENOENT）保留。旧全量失败、冷恢复 SKIP、网络未知及不确定导航/撤权失败均保留，不能称全量通过。

本轮没有新生产源码修改或自己创建的 commit/push/release；上述合入由并行 owner 完成。交接文档本地未提交。曾有并行 index conflict，但交接时 unmerged 已为空，不沿用旧 BLOCKED。当前 workspace.tailwind.css 差异及 TOC/其他 owner 工作保持原样。

远端只读结果曾为 Browser main `8f30854f0f2aa4a2b479fc179f8911cc01decdc1`、Go master `f87d240f7efd2a3cedb9eaf0f8f7cc44660ab14c`，不声称本地同步。任何未来提交前重核最新远端、并行 diff、git diff --check 和定向验证，遵守 Lore 协议。

## 已解除的环境阻塞及实际运行身份

Mac 上轮已确认解锁，未绕过锁屏；新对话重新判断桌面状态。

官方 codex-cli 0.159.2，ChatGPT 登录；入口 `/Users/shopme/.local/bin/codex`。
实际二进制：`/Users/shopme/.local/opt/opendesk-codex-0.159.2/node_modules/@openai/codex-darwin-arm64/vendor/aarch64-apple-darwin/bin/codex`。
SHA256：`16593cc2f422d5f398a8e40f550ebbaf1245392528957be342c295920a300704`。
独立 CODEX_HOME：`/Users/shopme/Library/Application Support/OpenDesk/R16R2-01a128f3/codex-home`，0700/auth0600。
个人 Home 全局 AGENTS 的 E_CODEX_POLICY 已用官方独立 Home 解决；保持 instructionSources、精确版本、官方 openai provider、空 environments、MCP/shell/file/外网工具和沙箱门禁。禁止为 PASS 放宽这些检查或改个人配置。官方逐字节源码/hash 在 `upstream-exact-source-index.json` / `upstream-verified/`；0.162.1 仅两份相关源文件审计，未安装或扩展兼容。

网络恢复只给本轮 Chrome/Native/Codex 子进程传现有 `HTTP_PROXY/HTTPS_PROXY=http://127.0.0.1:7897`（含小写），NO_PROXY localhost，不修改系统设置或个人 provider。
Node：`/Users/shopme/.nvm/versions/node/v24.16.0/bin/node`。
Go：`/Users/shopme/.local/opt/go1.25.13-amd64/bin/go`。

侧装 App：`/Users/shopme/Applications/OpenDesk-R16R2.app`，runtime `Contents/MacOS/OpenDesk`，SHA256 `cb4bf080922fde9c0cfc797412a3979cc2d73cc1baae2873ff30b874a238b1ee`。不得覆盖 `/Applications/OpenDesk.app` 或其他 owner 的全局 opendesk CLI。
Native instance：`r16-r2-ping-01a128f3`；wrapper/socket 在 `/Users/shopme/.opendesk-browser/native-agent-instances/r16-r2-ping-01a128f3/`。
受控 CFT：仓库 `tests/.cache/m5-browsers/155.0.8059.39/chrome-mac-arm64/Google Chrome for Testing.app`。
本轮 Chrome PID：1091（必须重核），profile `/Users/shopme/Library/Application Support/OpenDesk/R16R2-01a128f3/cft-ping-profile`，本机 CDP 43129，--disable-gpu。
扩展 ID：`deofeaadofkjjocgijngcjnbeamamjob`。
实际加载路径：Browser `.runtime/tests/r16-r2-macos/01a128f3/browser-ping-candidate/dist/development`，现已是正式 d9ca61fe 包；交接时 57/57 bytes/hash 一致。安装记录 `final-extension-package-install.json`。旧诊断包保留在同父目录 `development-diagnostic-14222c61`。
manifest：上述 profile 的 `NativeMessagingHosts/com.shopable.opendesk_browser.agent.json`，仅允许该扩展，指向本轮 wrapper。
`native-final-doctor.json` 真实 connected=true，requestId `35f76fbb-e0e4-455f-8d78-cc5eb8dcbce4`；hostRegistrations=[]，正式包 Side Panel 尚未打开/补验。

当前实际 UI 缺口：CUA 按同 bundle 绑定了另一任务 Chrome PID 44555/profile codex-cft-cye54vks。未在对方窗口输入。本轮 helper `.runtime/tests/r16-r2-macos/01a128f3/activate-controlled-chrome.swift` 及二进制已编译、尚未执行；先核对本轮1091身份再用已授权的精确激活。必要时按已有资源协调授权与 R22.1 短期协调前台，不停止对方 Chrome。根 dist/.wxt、开发服务以及 43119/43120 不归本轮；不要覆盖或停止。标准 Demo43111 可核对后复用。

reload 后曾出现 AX 更新而窗口绘制冻结/elementHasNoFrame，原生“缩放窗口”曾恢复；不将一次恢复或 --disable-gpu 当永久修复。不要因 CUA 选错 app 再要求重复登录或把未知锁屏当当前结论。

## 已取得的真实诊断闭环（不能升级为正式同包验收）

诊断包：518ef448 基础加当时只读复制的 R23 ping 修复，packageHash `14222c61a216242dafee27546b15b9d3676f761395a322db5a93c61f5ec9310d`，237 inputs/57 files。R23 修复后来已由 owner 提交 `2a5d62bedce328b8a2910268c6240a7b5a5cae97`，诊断副本一致；不要重复制造修复。

- 同一真实 thread `01a1292d-eb09-77d0-8db4-c1a9db4ef232`，两 turn `01a1292d-eb30-7641-8d9d-ddaa4f702410` / `01a1292e-c3b6-7600-9f6f-4101bc0837e6`；事件1–175连续、166 delta、两真实 completed。一次真实拒绝观察，一次审批后真实有界摘要。批准 observe run `49b5faff-b860-4477-8f80-4bb6bb7c63db`，result `5f0daa59-9e12-4ac2-953c-faecbd5c74fb`，retirement released。
- 原 UI 采用 AI 计划，原 Compiler/Controller 执行成功：run `0b74184b-7404-4b62-963e-658049fdd894`，result `d05fc27c-9f9d-4dc8-b481-0fc577577214`。
- 保存 workflow `wf-1ea0bf58-2723-42ca-8465-55d4beb8b84d` / revision 1，sourceHash `6eb434c6861812e8c502bc73b575d48b8dfd85bcb5fb99cbd847fdd0e4cafc36`；持久源码重算与 result 自身 hash/revision 相同。
- 关闭会话/Native后重载执行1：run `a0758cae-f163-4a77-9cbf-f8754d7fab96`，result `22063f31-300b-41b3-bf37-39224982f748`；新 host/document 下执行2：run `46f64609-69cd-4e85-aaab-402bcb652b83`，result `e3bc68b7-8071-4f78-b097-e68d31f4ae04`。两次同 r1/sourceHash、outcome ok、retirement released。
- 原始：`official-sidepanel-tool-exchanges.json`、`official-sidepanel-observe-rollout.jsonl`、`ai-adopted-business-run.json`、`frozen-version-and-observation.json`、`frozen-offline-rerun1.json` / `2.json`、`offline-ai-disconnected-before-rerun.json` / `after-reruns.json`。断连后 socket absent/session null/指定 rollout 不变有据，**完整执行窗口的直接网络侧零额外模型请求证据仍缺**。
- 原生 Side Panel Stop 得到真实 interrupted terminal；导航旧审批返回 E_DOCUMENT_STALE；撤权后旧审批再次申请 Chrome权限，原生拒绝返回 E_AI_PERMISSION，前后 Controller 同6run、newRunIds=[]。原始 `ai-sidepanel-stop-terminal.json`、`ai-navigation2-stale.json`、`ai-permission2-denied.json`、`official-permission2-rollout.jsonl`。首次导航/撤权超时不确定保留，不扩大全部安全分支 PASS。

Go scoped 官方真实 opt-in PASS：Probe、连续17→21两轮、流式取消 interrupted、ambient MCP canary；`go-real-codex-live-ready-command.json` / `.log`。`TestInstalledCodexWorkflowProposal` 真实 PASS，51 events/232 bytes 模型 JSON（落盘含换行233bytes），`go-workflow-proposal-live-command.json` / `.log`。Go 组件/race/vet相关输入不变范围复用旧证据；冷恢复 SKIP/NOT_TESTED，不冒充支持。

只读业务诊断 `read-ui-state.mjs` 不发 Run/Save/审批/模型、不改 DOM；但 connection.read 可重连，Controller snapshot 可处理撤权/retirement，不能称所有状态零副作用。CDP 仅用于诊断/被动观察，不用于业务执行。

## 当前 Gate 与下一步

Gate A：PASS（受控官方0.159.2范围，冷恢复另记SKIP）。
Gate B：NOT_TESTED（完整关闭）；正式构建/94+13定向PASS，当前main输入变化和旧全套FAIL需保留分类。
Gate C：NOT_TESTED（完整兼容）；认证连接PASS，但真实 welcome workflowAiVersion:1、旧十RPC、Node/Go fence未完整关闭。
Gate D：NOT_TESTED（正式候选）；诊断闭环有据，正式同候选和直接网络观察尚缺。
Gate E：NOT_TESTED；已有限定 Stop/导航/撤权证据，矩阵、兼容与布局仍有缺项。
Gate F：NOT_TESTED；未独立接受，未本轮提交/推送/发布。

现在直接：核对材料/最新主分支/并行资源→按影响冻结最终提交候选→必要构建和定向验证→正确本轮 Chrome 原生 UI 完整闭环。不要以反复审计/规划替代推进：

1. 唯一页面 `http://127.0.0.1:43111/demo-form.html`，Side Panel 本机Codex两轮真实规划、同thread多turn/流式/Stop/取消/生命周期。
2. 逐次实际观察审批、未授权拒绝、导航失效/撤权；同时取得准确前后Controller账本和官方工具响应，不能缺证就声称无网页读取。
3. 原 UI 采用→原 WorkflowCompiler→RunHost/Controller→可信持久 result→保存冻结 revision/sourceHash；不重做R15 Sidebar/Compiler/RunHost/Task v1。
4. 关闭AI会话/Native、选择手动，重新载入保存版两次，新run/result和完全相同冻结hash/revision。提前开启只限定本轮进程/扩展的被动网络观察，覆盖完整窗口，不记录header/body/Token；结合Native/Codex进程/socket缺席证明没有额外模型调用，不采集其他任务流量。
5. 原HTTPS Provider、手动编辑、旧十RPC、Node高级ESM/npm/MCP与迁移fence、安全矩阵回归。十RPC：bridge.status、target.current、script.save、run.start、run.get、run.stop、page.preview、page.get、page.dispose、request.get。Node CLI仅七项，不能当十项。HTTPS合同要求保留/回归，未明文要求第二模型真实推理；无本轮API Key的真实HTTPS推理单列NOT_TESTED，不擅读其他凭据或新增门槛。
6. 正式同包Side Panel 320/360/420/520px、200%缩放、键盘焦点/aria、状态错误和Stop/Run/Save可达性；截图绑定实际包。
7. 独立只读反方审真实原始证据，各项有证据95+为目标，禁止凑分。现有独立结论 **NOT_ACCEPTED**；不得把诊断/组件/旧候选升级为最终接受。必要本地提交只纳入自己文件，先重核远端/并行差异/验证，遵守Lore；未经另授权不push/release。

不要Mock、synthetic events、DOM赋值、伪造native ACK、直接CDP网页业务执行或盲目重放未知effect。只用合成公开数据，网页摘要对应明确审批。保持所有FAIL/BLOCKED/NOT_TESTED原件，不改旧receipt。新聊天和无关文档变化不触发无意义全量重测。

最终交付：Gate A–F状态及证据/命令，双方最终SHA和提交/推送状态，源码/构建hash，实际Chrome/Go/Codex路径/身份，业务runId/resultId/revision/sourceHash，未解决问题及独立验收结论。完整闭环未通过必须明确：**R16 R2 尚未完成最终验收。**


## 资源交接后的最新补充（2026-10-11）

此项晚于上文交接，续接时优先核对此状态：Browser main 最新实查为 `2a7bc0be1a71c23890c6fb54f740a16a2a234955`；Go master 实查仍为 `802fb009c8f0c9a6ce85b1b9e4320ffd0a65ae45`。正式已加载包仍绑定 `2cc6879a`/development `d9ca61fe…`，没有重新构建或升级其验收等级。

R22.1 已报告正常关闭自身 Chrome/Native 并释放 root dist 写入占用。本轮只读核对：PID44555 已不存在，旧 profile codex-cft-cye54vks 和 r22-final-01a1290f/agent.sock 不存在，65132/43119/43120 未发现监听。本轮 PID1091 仍运行，profile/加载路径仍属于 R16，r16-r2-ping-01a128f3 socket 存在。原同 bundle 冲突对象已经退出；新对话先重新选择并确认本轮 CUA 对象，不沿用旧绑定，不把已释放资源当当前 BLOCKED。精确 PID helper 的授权仍有效、尚未执行，正常 CUA 可正确选择时无需 helper。

R22.1 报告其4e候选七视口/200%及真实SidePanel五页通过，但这不等于本轮正式包布局 PASS，也不证明完整 Node/NativeMac 回归或最终评分已关闭。其修复提交 `4e0fc21642b68ae977c064a4b8972f7721c4b8b1` 已在本地主线；候选影响按实际生产输入重核。root dist 即使释放，续接仍优先本轮独立产物，启动写入前确认没有新 owner。

原始核对命令及结果：Browser `.runtime/tests/r16-r2-macos/01a128f3/continuation-resource-update.json`。本次没有 UI 操作、测试、构建、提交或推送。独立结论仍 NOT_ACCEPTED，**R16 R2 尚未完成最终验收。**
