# GOAL：在用户当前 Mac 验收并修复 WebCodex 文件请求闭环与 browser dev 临时读写

## 本任务绑定的源码与目标

- Browser：https://github.com/shopable-ai/opendesk-browser，**仅 main**。本次最低来源提交：`c41102d7e2dd13510f718f69061f8194251eb767`。
- OpenDesk Go：https://github.com/shopable-ai/opendesk，核对实际默认分支，当前 **master**。本次最低来源提交：`34649d24ee821298f586abba257e9e41b89a4cec`。
- 两仓当前 HEAD 可以包含后续提交，先确认上述提交为其祖先；不得回退正在使用的主分支。对应源码/构建/组件证据见 Browser `docs/framework/workstreams/evidence/webcodex-request-loop-20261010/delivery.json` 与两仓 R17/R2 工作流。

请直接完成本机必要安装核验、最小修复、测试和主分支交付。不要只评估方案或停在复制按钮、CLI 默认权限和组件测试。不要另开 Codex 线程、换模型、新建 ChatGPT 聊天来替代用户指定的**既有官方网页对话**。

本轮核心代码已实现：新 CLI 临时默认读写、明确只读与模式冲突；Go 公开租约代次与单向失效；Workspace/文件侧栏精确目录定位；结构化 list/read 请求；同一对话输入框回填与独立读回；七字段编辑提案、审阅/采用/显式保存和保存前身份校验。原五字段手工提案兼容。**实现不是 MCP tools 注册。** 不重建 Native Host、Workspace、Resolver、Session、Sidebar 或编辑器。

本次源码开发发生在网页 Linux 执行器，真实 Mac/Chrome 无法访问，AF_UNIX socket 创建被 EPERM 阻断。所有 Mac 项从 **NOT_TESTED** 起算；本次组件、临时磁盘、交叉编译、内存 Demo 与历史候选证据不能改成真机 PASS。

## 1. 先确认环境、工作区与执行授权

确认 `uname -s` 实际为 Darwin；如果还在容器，不假装用户 Mac。找到真实仓库，可能位于 `/Users/shopme/Documents/workspace/`，以存在路径为准。

完整读取两仓 AGENTS.md。Browser 读取 R17 使用说明/工作记录/本机任务、R2 架构/工作记录、本任务、testing-guide；Go 读取 R17 与 webcodex-local-files-demo-r1 文档。需要更新安装时，完整读 Go 现有 Mac Native build/install/acceptance 文档及实际脚本。

逐仓核对远端 URL、主分支、HEAD、未提交和暂存修改、当前其他任务、正在运行的构建/Native/Chrome。**不创建分支或 worktree，不强推，不破坏性 reset/clean，不覆盖别人的未提交修改、Profile、socket 或构建产物。** 先安全 fetch，逐文件集成并行变化；同一工作目录同一时刻一个 writer。用户已授权必要实现、修复、定向测试和主分支提交/交付，无须重复问是否继续。

先用简短表格确认「已复用」「有证据的缺陷」「真正缺失」，随后执行。未知 Host、权限弹窗、安装归属或现有用户草稿不能擅自绕过；先完成所有已授权独立工作，准确指出最后需用户操作的具体步骤。

## 2. 核验真实安装及加载身份，健康版本复用

从当前 Mac 检查：

```bash
command -v opendesk
command -v opendesk-dev
node --version
opendesk browser --version
opendesk browser doctor
opendesk browser bridge.status
```

Node 要求 ≥22.12。沿 managed launcher 找到**真正的 Go App executable**，核对 `go version -m`、`shasum -a 256`、完整 App 签名、Info.plist。不要把 launcher 的 hash 当 executable hash。

选择性读取 `~/.opendesk-browser/native-agent-r1/install.json` 的非秘密字段、native-host launcher、实际 Native manifest 和 `~/.opendesk-browser/dev-tool-r17/entry.json`。install.json 的字段按当前 Go 序列化名称核对，**不输出 clientCredential 或整份秘密配置**。确认 manifest path 指向受信 launcher，launcher 启动正确 Go executable，allowed_origins 精确包含当前扩展 ID。

默认普通 Chrome manifest 常在 `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/`；CFT/自定义 Profile 按真实配置检查。记录实际 Chrome Profile 路径、目标 tab、既有 conversation URL/ID、扩展 ID、加载目录、manifest 版本、关键文件与包 hash。确认这些对应本次来源提交或包含它们的后继主干。

健康门槛：Native hello/welcome 与 Node authenticated 均真实协商 `localDevAccessVersion:1`（以及既有 localDevMultiVersion/localFilesVersion）；files state 为 `devLeaseEpoch:1`；npm 登记 `localDevAccessVersion:1` 且真实 entry hash 相符。不以 doctor/socketExists 或仓库 HEAD 单独证明这些条件。

### 仅在实际版本不匹配时更新

Browser 使用现有依赖锁、构建和打包命令；先确认输出目录为本任务所有，不覆盖其他任务正在使用的 dist。若现有 dist 正在使用，协调该资源或采用现有脚本支持的安全输出方式，不抢占。

```bash
npm ci --ignore-scripts --no-audit --no-fund
node scripts/pack-opendesk-dev.mjs
npm install -g .runtime/r17-dev-package/shopable-opendesk-dev-0.1.0-r17.1.tgz
opendesk-dev --register-go
node scripts/build.mjs production
node scripts/verify-package.mjs dist/production
```

先核对唯一 tarball 与 hash，再安装；如后继主干版本号变化，用本轮打包实际返回的唯一文件，不能使用包含历史包的 `*.tgz` 通配符。保留实际合法 npm prefix；不把业务目录 node_modules 冒充全局 CLI。不要 npm publish/release。

Go 若确需重建，保留稳定 BUNDLE_ID/CODESIGN_IDENTITY，按现有流程构建完整 App。脚本会删除其输出位置已有 OpenDesk.app，务必选择本任务专有的新目录：

```bash
DIST_DIR="$PWD/.runtime/builds/webcodex-本次Go短SHA" ./scripts/build_macos_app.sh
```

不使用 SKIP_CODESIGN、不关闭正常 App 内容、不伪造正式安装。按既有归属/备份流程更新固定 App；managed CLI 已存在时使用 `bash scripts/install_macos_cli.sh --update --app-bundle "/实际固定/OpenDesk.app"`，未知 launcher 不覆盖。

已有 Go Native 绑定用新版真实 executable 执行 `browser update`；首次绑定才 `browser setup --extension-id <真实ID>`。若 E_SOCKET_IN_USE，先核对归属，通过受控入口断开本任务连接并等待 owner 正常释放；不删除 socket，不结束未知进程。没有 `browser reload` 命令：在 Chrome extensions 精确重新加载目标扩展，重新打开 Workspace，从原 Native 设置连接，再核对新 session/能力与对话绑定。

新 Go 能读取没有 devLeaseFences 的旧 grant store。旧 Go 对含新失效元数据的 store 会 fail closed；不能删标记规避版本校验或让旧代次复活。它不是永久目录授权。

## 3. 先做 P0：独立随机标记到同一对话

在专用路径创建 A/B 两个不同父目录、相同 basename 的目录。不要写真实业务文件，不先 workspace add。可由本地终端生成并在本轮所有步骤复用以下路径：

```bash
WEBCODEX_ACCEPT_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/opendesk-webcodex-accept.XXXXXX")
export WEBCODEX_ACCEPT_ROOT
python3 - <<'PY'
import os, pathlib, secrets
root=pathlib.Path(os.environ['WEBCODEX_ACCEPT_ROOT'])
for side in ('A 路径','B 路径'):
    directory=root/side/'同名目录'
    directory.mkdir(parents=True)
    (directory/'README.md').write_text('# WebCodex 验收\nmarker='+secrets.token_hex(24)+'\n',encoding='utf-8')
print('A:',root/'A 路径'/'同名目录')
print('B:',root/'B 路径'/'同名目录')
PY
```

随机生成器在 ChatGPT 网页模型之外运行。第一次给目标 ChatGPT 的上下文不能包含正文、标记或先前读取的日志。终端可独立记录实际文件/hash 作证据，但不要把这份证据贴给网页模型。A 用 `opendesk browser dev "$WEBCODEX_ACCEPT_ROOT/A 路径/同名目录"` 前台保持运行；B 稍后用另一个终端 `opendesk-dev "$WEBCODEX_ACCEPT_ROOT/B 路径/同名目录"`。第二个终端先将 WEBCODEX_ACCEPT_ROOT 导出为第一终端打印的同一个实际根路径，不能重新 mktemp。记录真实路径和 PID，不能假造进程在线。

选择 A 和用户指定的既有官方对话。可使用独立 Workspace 或文件侧栏；若从 Workspace 打开侧栏，先核对 URL 携带 A 的精确 workspaceId，再在侧栏建立上下文。一个 UI 实例内完成本轮绑定、读取与保存。

P0 分步记录：

1. 填写 `README.md` 和任务：「先读取文件；收到真实结果后准确报告 marker，接着提出把标题改成第一轮验收并保留 marker 的单文件修改」。点击「建立读取请求」。保存初始上下文证据，核对无正文/随机值。
2. 点击「回填上下文」，观察它进入原对话输入框。用户检查后通过网页发送。当前实现不自动点击发送；不要宣称已自动发送。
3. 等模型完整回答，点击「处理当前回答」。要求本轮唯一 `opendesk-request` JSON，确认 identity/path、已完成生成、不是旧回复或引用。
4. Native 实际 files.read 的 request/session/workspace/path、脱敏结果、正文和 SHA 必须可对照。UI 展示真实结果，不代表结果已经进入网页。
5. 扩展自动将结果填入同一 tab/conversation/document 的输入框，读取并确认真实 editor 内容。用户检查后通过网页发送。
6. 模型后续回答准确报告未知 marker，并继续输出修改提案或新读取请求。必要时再次点击处理，可观察结果 resultId 已进入同一对话的 user 消息；这个观察不能代替模型使用内容的证据。

必须分别给出：请求生成、自动回答识别、Native 读取、自动回填、网页发送、模型使用结果。仅侧栏读到正文、复制到剪贴板、预先发送正文不能证明 P0。

若失败，定位在以上哪一层，以真实 DOM/回包/输入框状态作最小修复，再复测。页面适配函数使用受支持编辑操作，不改 cookie、不调用未公开 ChatGPT API、不赋值或合成事件来伪造输入成功。手工复制粘贴仅作为明确降级或诊断，自动回填保留 FAIL/NOT_TESTED。原对话确实被阻断时，解释能保留的文件能力与备用路径影响，不能改用新聊天宣布完成。

## 4. 同一对话必须完成两轮

第一轮 P0 的真实读取结果提供七字段 `editProposal`。处理完整模型提案，核对原 workspaceId、bindingId、新编辑 requestId、README.md 和读取 baseSha256。

- 审阅前后：独立终端正文/SHA 不变。
- 「采用为草稿」后：独立终端正文/SHA 仍不变。
- 显式「保存」：原 files.write(expectedSha256, leaseEpoch)、Native 结果、扩展再次 read、独立终端 `cat`/`shasum -a 256` 一致。
- 第一轮回执为 `backend:native-files`、readBackVerified:true，路径/requestId/SHA 与本轮对应。不能只看成功提示或 ack。

第二轮在**同一官方对话、同一磁盘文件**重新「建立读取请求」，让模型读取第一轮保存后的真实内容，再提出不同修改。重复读取→回填→用户网页发送→模型提案→审阅→采用→保存→独立读回。第二轮 requestId/bindingId 新生成，baseSha256 必须等于第一轮真实保存后的 SHA。

再补一次**由同一对话发起的 list 正例**：让模型使用结果中的 `nextRequest` 身份，返回 `operation:"list", path:""`；点击处理，记录实际 Native `files.list` 的 `entries/truncated`，确认结果回填原输入框并由用户发送。模型使用新的 nextRequest 继续读取一个列出的受支持文本文件。Workspace 自带目录列表不能替代这一请求链，list 不产生文件修改基准。

最终表格每轮记录：conversation/tab/document、目录绝对路径（仅本机证据）、sourceId/workspaceId/leaseEpoch、文本请求/编辑请求、读前 SHA、Native 保存状态、Native 读后 SHA、独立磁盘 SHA、完整预期与实际差异。此表无证据时填 NOT_TESTED，不能用 Go 单测的 temp 路径冒充用户 Mac。

## 5. 多目录、只读、冲突和失效的真机矩阵

| 项目 | 必须观察的真实结果 |
| --- | --- |
| 新目录默认 RW | A/B 只运行 dev，无 workspace add；实际 files.write/create 可用，独立读回正确 |
| 同 basename A/B | 同时在线，选中、Sidebar 入口、文件路径、内容/保存均不串目录；程序清单不是文件展示前提 |
| 同目录重复启动 | 身份/代次不变，不获得原私有 owner lease、不升级/降级；退出重复命令不影响原会话 |
| A 退出/异常退出 | 只释放 A 的临时接入；B 继续工作；长期授权保留；初始化早断连不遗留 Provider |
| 新 --read-only | Go 返回实际只读；真实写/创建链拒绝，不能只检查按钮禁用 |
| 现有长期 RO | 新默认 RW 不覆盖，显示 persistent-read-only，实际 Native 拒绝写 |
| 显式 RO 模式冲突 | 与长期/在线 RW 冲突时 E_DEV_ACCESS_CONFLICT，不能假报只读成功 |
| 外部编辑 | 读后由外部编辑器修改文件，旧 SHA 保存 E_FILES_CONFLICT，磁盘和草稿各自保留 |
| 旧请求/旧提案 | 原请求重放不再读；已采用/已保存提案不能再次保存，也不能换一个同名目录执行 |
| 权限往返 | RW→RO→RW，或临时 RW→长期 RO→撤长期；即使中间无文件请求，原 epoch 仍失效，B 不受影响 |
| 空 epoch 竞态 | 长期目录读取时无 CLI，写前 CLI 接入，旧 leaseEpoch:"" 必须由 Native 拒绝 |
| SPA A→B→A/刷新/关闭 | 原对话绑定永久失效，迟到结果不回填、不采用；返回原 URL 也须新请求 |
| Regenerate/编辑问题 | 正在生成或答案节点/正文变更，旧已审阅/已采用提案不能保存 |
| 工作区离线/切换 | 保留名称和草稿，全部目录空后 B 上线也不自动选 B；缓存不能恢复授权 |
| 已有输入框草稿 | 文字、附件、富内容，包括 focus 恢复的内容，不覆盖、不拼接；结果保留供重试回填 |
| 回填回滚/重复回调 | 同一结果不重复输入；编辑器替换/响应缺失标 unknown，先检查网页 |
| 断线/保存未知 | 不换 requestId 盲目写；原草稿保留，先读回确定实际效果 |
| 路径/撤权 | 真正 Go 文件服务拒绝越界、错误来源和失效授权；不扩大格式、容量和根路径 |
| 不自动运行 | read、提案、adopt、save 都不触发程序 Run、网页业务或 Shell |

### 使用现有可信入口证明 Go 拒绝

正常 UI 会先阻止只读保存、非法路径或过期请求，这只能计为 UI 保护。后端负例仅在本任务**真实顶层 `chrome-extension://<准确扩展ID>/native-agent/workspace.html`** 的 DevTools/已授权扩展执行上下文调用现有入口，不能在 ChatGPT 网页、content script、preview frame、新增代理页面或测试替身运行。先核对目标 origin、document、绑定及本任务专用目录。

下面是只读预检与一次真实读取，可在该 Workspace 上下文执行；WORKSPACE_ID 必须从当前实际目录 A/只读测试目录的已核验 ID 填入，不能按 basename 猜测：

```javascript
const probeProtocol = 'opendesk.native-agent.config.v1';
const probeState = await chrome.runtime.sendMessage({protocol:probeProtocol,type:'files.state'});
if (!probeState.ok || !probeState.data.connected || probeState.data.devLeaseEpoch !== 1)
  throw Error('Native file session or epoch capability unavailable');
const probeSession = probeState.data.sessionId;
const probeRPC = (method, params) => chrome.runtime.sendMessage({
  protocol:probeProtocol,type:'files.request',expectedSessionId:probeSession,method,params
});
const probeCatalog = await probeRPC('workspaces.list', {});
if (!probeCatalog.ok) throw Error(JSON.stringify(probeCatalog.error));
const probeWorkspaceId = 'WORKSPACE_ID';
const probeRow = probeCatalog.data.workspaces.find(row => row.workspaceId === probeWorkspaceId);
if (!probeRow) throw Error('Expected verified workspace is absent');
const probeLocation = {workspaceId:probeWorkspaceId,path:'README.md',leaseEpoch:probeRow.leaseEpoch || ''};
const probeRead = await probeRPC('files.read', probeLocation);
if (!probeRead.ok) throw Error(JSON.stringify(probeRead.error));
// Keep the real baseline and epoch for the deliberately rejected requests below.
const probeBaseline = probeRead.data;
```

在专用测试目录做负例，每次只执行一项并保留完整真实结果：

```javascript
// Run in a real RO workspace; Go must reject both. Never use a business file.
await probeRPC('files.write', {...probeLocation,
  expectedSha256:probeBaseline.sha256,content:probeBaseline.content+'\nreadonly-probe\n'});
await probeRPC('files.create', {workspaceId:probeWorkspaceId,leaseEpoch:probeLocation.leaseEpoch,
  path:'readonly-probe-new.md',content:'This creation must be refused.\n'});
// Go path containment negative: it must not disclose a parent file.
await probeRPC('files.read', {...probeLocation,path:'../README.md'});
```

记录 Service Worker 实际发送/接收的 `files.request/files.response` 帧与 requestId 对应，核对响应确实来自 Go；若在 SW 本地会话/权限检查就被拦截，则只能计为 SW 拒绝，另补可到达 Go 的有效 session 负例。不要修改 Native transport 或暴露新 RPC。独立终端核对原正文/SHA 及新文件不存在；仅看到错误标签不能证明未写盘。

旧 epoch/撤权/冲突测试沿用同一个 `probeSession`、旧 `probeLocation` 和 `probeBaseline`。先在本地终端完成对应权限或外部文件变化，再发送一次旧基准的 `files.write`，确认 Go 拒绝和磁盘不变；不得刷新这些旧值后声称测试了重放。Native 连接已更换时，SW 的 expectedSessionId 拒绝另列，不能冒充 Native 旧 epoch 拒绝。

**Native 同 ID 缓存回执是另一个细项**：probeRPC 每次调用都会由生产 file-workspace-service 新建 Native requestId，因此重复调用它只能证明旧 epoch/基准拒绝，不能证明同一 Native requestId 的旧成功回执重放。若已有受信 Native 测试驱动能在该真实安装上保留原完整请求，可单独记录同 ID 重放证据；否则该细项保持 NOT_TESTED，并注明本次 Go 组件/CI 已覆盖。不要为了演示新增网页可控 Native requestId 接口。旧**文本**请求与旧编辑提案仍必须通过实际扩展 UI 分别验收。

权限往返仅用本任务专用目录。先以 `Path.resolve()` 或可用的 `realpath` 将 WEBCODEX_ABA_DIRECTORY 设为无符号链接的真实绝对路径（Mac 的 /var、/tmp 路径可能是链接，WorkspaceAdd 会拒绝）。两组均须原 CLI owner 仍在线，保留非空的 probeLocation.leaseEpoch；纯长期目录无 CLI 的空 epoch 属于另一项竞态。然后在两次 Native 请求之间连续执行实际 CLI：

```bash
# Permanent RW -> RO -> RW: capture original epoch before both commands.
opendesk browser workspace add --path "$WEBCODEX_ABA_DIRECTORY" --access read-only
opendesk browser workspace add --path "$WEBCODEX_ABA_DIRECTORY" --access read-write
# In a separate temporary-RW case: add permanent RO, then revoke that exact returned ID.
opendesk browser workspace add --path "$WEBCODEX_ABA_DIRECTORY" --access read-only
# Read that add result and set WEBCODEX_ABA_WORKSPACE_ID to its actual workspaceId.
# A newly permanent workspace can have a different ID from the temporary workspace.
opendesk browser workspace revoke --workspace-id "$WEBCODEX_ABA_WORKSPACE_ID"
```

预先设置真实目录变量；临时→长期 RO 这一组在 add 完成后，从该次返回 JSON 取得新永久 workspaceId，再设置 WEBCODEX_ABA_WORKSPACE_ID 并立即 revoke。不能误用之前临时目录的 ID。两组是独立场景，不能在同一旧 owner 上连续混用；两条权限变更之间不发文件 RPC。变更后旧 epoch 请求需由 Go 拒绝，B 保持可写；同 ID 旧成功写回执按上段单独取证，无法取得时不冒充通过。随后停止旧 owner、重新 CLI 接入、重新绑定并读取，验证新 epoch 可用。无 CLI→新 CLI 的空 epoch 竞态同理，明确保留空字符串而非省略。

未取得自动网页发送授权时，请用户执行已准备好的网页发送，继续可独立完成的其他验收。

## 6. 定向回归、证据与交付

Browser 相关代码变化后运行：

```bash
node --test tests/environment/r17-dev-cli.test.mjs tests/environment/local-project-connection.test.mjs tests/environment/file-workspace.test.mjs tests/environment/workspace-chat-edit.test.mjs tests/environment/workspace-chat-request.test.mjs tests/environment/workspace-integration.test.mjs
node --test --test-name-pattern='^R17 access capability' tests/environment/native-agent-bridge.test.mjs
node tests/framework/r17-package-smoke.mjs
```

Go 在真实 Mac 补跑当前网页执行器被阻断的 Socket 测试及两个受影响包：

```bash
go test -race -count=1 ./internal/browserbridge ./internal/browsercli
```

按 testing-guide 复用输入未变的旧证据；有具体缺陷才补相应测试，不反复扩大为无关全框架验收。改 UI 后按原生成器更新内存 Demo，但生成器会改 examples/local-workspace 样本，所以真实文件必须用本任务独立目录。保持 SW/严格包校验预算，不放宽门槛制造 PASS。完整 App 构建与签名仍按现有 Mac 文档验证。

在两仓本任务专有证据目录记录脱敏原始日志、关键截图、原候选和修复候选、实际加载包/binary、每个文件 SHA。不得覆盖历史失败、其他任务产物或把组件等级升级成 Native。

完成必要修复后分别在 Browser main / Go master 串行核对远端、逐文件保留并集成，提交并报告实际推送状态；不创建分支、强推或发布 release。释放本任务拥有的 CLI/临时目录接入，确认用户已有长期授权与其他会话仍在。

最终中文报告严格按此顺序：

1. 用户现在真正能做什么、最短步骤；
2. 本次实际修复、两个提交 SHA、提交/推送状态；
3. 实际 CLI、Go、Native manifest、扩展/Profile/加载 hash；
4. P0 各环节证据和结论；
5. 两轮同一对话的实际路径、前后 SHA、Native 结果、独立读回；
6. 多目录、只读、冲突、重放、退出、导航与迟到结果矩阵；
7. 自动识别/执行读取/回填/网页发送/手工导入各自结果，哪些仍由用户操作；
8. 未完成的具体环节、证据、修复或下一步。

只有以上真机证据齐全，才报告 MAC_NATIVE_CHATGPT_PASS；保留未测与失败，不用总分或组件数量替代闭环完成。
