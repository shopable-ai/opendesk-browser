# OpenDesk 本机通信接管：实施前基线核对

日期：2026-10-09（Asia/Shanghai）。App 对话/session：`01a120ca-d9a6-7c52-a06a-a0e3d456af5e`（App 工具返回身份）；native-hook state 另记录内部 `thread_id=01a120ca-e017-76e2-91cf-46bc288a79ff`，不将它冒充 App 对话身份。

**本轮结论：实施门槛仍未满足，完成合同核对及实施准备；产品源码未修改。** 继续沿用 PR #40 已合入的 [兼容设计 R1](../../architecture/browser-framework/opendesk-native-takeover-r1.zh-CN.md)，没有重新设计。以下新增的是后来形成的原始证据、输入变化和精确实现触点，不修改原设计、历史 receipt 或其他负责人的状态。

独立工作区：`/Users/shopme/.codex/worktrees/native-takeover-prep-01a120ca/opendesk-browser`；分支：`agent/opendesk-native-takeover-01a120ca`；起始 Browser main：`b18f4f3275cc5307a553548d938a531bdc93421c`。OpenDesk 原仓库只读核对到 `877c852acca28b4658d01fd727b37b883b4792d1`，没有创建产品实现分支或修改其共享目录。共享 Browser main 的 Controller/sandbox dirty 输入单独记录，未带入本工作区。

## 已完成的最小核对

```text
Node 验收基线
  负责人：Native 01a12028；R6.5 01a11fbc；R6.2 01a11ff2
  已有证据：最新已加载包的状态、目标、草稿、结果和 Stop 原始响应
  剩余：保存版/CAS、运行中 pin/document/撤权、ACK 丢失/断线矩阵及完整请求身份
OpenDesk 入口
  已定位：同二进制提前分派；原安装/打包、主线程、窗口、HTTP 和退出链
  剩余：独立工作区源码实现及同发行二进制的原始 stdio/无窗口验证
兼容替换
  已准备：当前输入哈希、新增合同消费者、修改文件及分阶段通过条件
  剩余：Node 基线形成后实施；协议/生命周期 → 构建 → CFT → 迁移
默认切换
  状态：Node 未改；没有安装、注册、端口/profile、dist/ZIP 或发布操作
  剩余：兼容和迁移均通过后，获授权集成者串行切换
```

最新 Native 负责人工作流位于 `/Users/shopme/.codex/worktrees/native-closure-1009/opendesk-browser/docs/framework/workstreams/native-closure-20261009-01a12028.json`，状态为 `IN_PROGRESS`；R6.2 的只读分支为 `READ_ONLY_BRANCH_COMPLETE_NATIVE_ACCEPTANCE_PENDING_PARALLEL_R65`。本轮只读这些记录，没有给其他对话发送消息或接管其资源。

捕获之后又核对一次该负责人最新完成消息：「完成 Native 与 Agent→Task 验收」说明其 GOAL **仍暂停**，待分支合并清理完成记录核实后恢复；这条消息没有新测试、构建或 Native 会话。续接入口为 `/Users/shopme/Documents/workspace/opendesk-browser-handoffs/native-closure-20261009-01a12028/continue-after-branch-integration.txt` 及同目录 `cross-thread-delivery-index.json`。保留工作流 JSON 的旧 `IN_PROGRESS` 观察，补充较新消息；暂停事实不代表 Native 通过，也不授权本对话恢复其 GOAL 或代改 R10.1。

R6.5 的最后实际加载候选是 `996df38fd63f49630f2c8cad4c552b5f82462124`，生产包 hash `5fa629f23a4722a0650d41552ea68fed33a1f423bb5da5c3360027a94dfbb890`，ZIP SHA-256 `03220ecdfceda7a999cc2b30015799d127521025bddc162528e3b287fee717f2`。`fdcec121…`/`native-final` 是较早候选，不再作为最新基线。

从原 `handoff-evidence-index.json` 校验并精确复制了八份响应，见 [本轮只读快照](evidence/opendesk-native-takeover-01a120ca/read-only-baseline.json) 和同目录 `raw/`。这些是既有证据的字节副本，不是本轮新执行的 receipt：

| 观察 | 原始关联与限制 |
| --- | --- |
| 状态/目标 | `current-connected-status-response.json` 为 connected/enabled；`current-modern-http-target-response.json` 给出真实 registration/target |
| 现代草稿 | request `38390189-16d8-47f9-9b03-bcd244765949` → run `6d23e137-e8df-49b5-8492-b445c5fcabf0` → result `f6142f7b-5af9-45aa-92f4-fe2d2cc6c955`；completed/released；结果自身 `revision.sourceHash` 为 `1618934805a4104191be8e2005a608d0537a51ca65c1e291c8a8fb042ed34b2d` |
| Stop | start request `802333e1-2a93-4e69-add6-ee9fd2459593` → run `e05bf323-aa6b-4cdd-8aae-aa3f51688af1` → result `ebf44557-86cf-4363-8845-9cd5e0eaaece`；stopped/released；结果自身 sourceHash `e01632afc59a6f13eb84cfd1e088fd6d7337dc4189809cd5be116eb8238a2cca` |
| 未明确 owner 的 get | 原 `current-modern-http-durable-response.json` 返回 `E_HOST_AMBIGUOUS`；保留原错误，再引用明确 owner 的成功查询，不将其抹掉 |
| 身份缺口 | Native 负责人指出 Stop/get 原输入只保存 body，未保存 CLI 自动生成的完整 envelope；响应 requestId 保留，不能补造原请求封套 |

## 为什么仍未达到源码实施门槛

1. 最新负责人仍记录完整 pin、运行中 document/撤权、页面 ACK 丢失、断线与重启去重安全矩阵未关闭。旧候选部分成功只能按原输入、原等级复用；未取得当前相关输入上的闭合证明。
2. R6.5 生产构建的 141 个输入中，本准备分支与其 **114 个相同、27 个变化**，包括 Native 协议/SW/adapter、Authority、Controller 和存储。该构建清单**不包括 Node Host 源码**。另核对 22 个本机通信及直接消费者输入：仅 3 个与 `996df38f` 相同。完整逐文件 hash 在快照中；这里的数量只是输入比较，不代表功能完成率。
3. 归档安装 `/private/tmp/od65c-01a11fbc/.opendesk-browser/native-agent-r1/` 中 `native-host.mjs` 和 `wire.mjs` 的字节均与 `996df38f` 对应源码一致，但与当前 main 不同。该旧安装没有 `locations.mjs`；当前安装源码的 snapshot 已包含三文件。不存在的旧文件不是当前安装器通过的证明。
4. R6.5 在 `2026-10-09T12:40:30.659750+00:00` 确认自身活动进程为空、profile 已移除、没有新增 Native 注册/会话或 build lock；`guardCleanupStatus=FAIL` 仍保留。资源释放只证明记录时的资源现状，不能证明全部未决效果已处置，也不是本轮取得安装切换权。

本门槛来自用户本轮明确要求。标准 Task/43111 的完整序列、603＋19、B05、campaigns、F3/ZIP 继续由原负责人处理，**不额外要求用这些全框架验收阻止本机迁移实现**；目前阻止实施的是上述相关 Node/Native 输入及安全合同缺口。

## R1 之后需要保住的当前合同

以下只记录已存在的 main 变化，不引入新 API。基线负责人应选择一个包含这些变化的 Node 候选，提供相关组件/原生证据及影响分析；不能把这些变化静默从 OpenDesk provider 中删掉。

| 合同 | 当前源码/实际消费者 | 接管要求 |
| --- | --- | --- |
| 核心六接口 | `wire.mjs`、`src/native-agent/protocol.js`；原 Browser 执行链 | 原 envelope/响应、限制、权限和结果归属保持 |
| 新增 wire 方法 | `page.preview`、`page.get`、`request.get`；`native-agent/local-dev/session.mjs` | Host 保留转发；page 生命周期、持久 admission 和未知效果仍归 Browser |
| CLI 查询 | `native-agent/cli.mjs` 现在接受 `request.get`；local-dev 的 admission 恢复 | 保留原参数/响应及只读查询语义，不重发原 `run.start` |
| provider 会话 | `native-agent/local-dev/provider.mjs`、`src/native-agent/local-project-client.js`；Host 的 `provider.register/registered/rejected/changed`、`dev.request/response`、`providerEpoch` | 复用原 resolver/MCP；普通请求仍一次连接，provider 是已存在的协商长连接；保住 epoch、退出和在途限额 |
| 本地能力协商 | Browser `welcome.localDevVersion===1`，Host authenticated 附加 `localDevVersion` | 按实际能力协商，不能无条件声明可用；旧六接口客户端无需新增字段 |
| 安装闭包与平台 | `install.mjs` 的三文件 snapshot；`locations.mjs` 的 Chrome/CFT 显式规范化 userDataDir 及 Darwin/Linux 路径 | 保留已存在入口；首轮 macOS/CFT 接管不表示 Linux 已验收或获准变更其默认 provider |
| 限制和身份 | 当前仍 `v:1`、61440 bytes、8 clients、12 inflight；共享 requestId/digest ledger | 不放宽大小、超时、socket owner 和未知效果保护；包括 devPending 共用 inflight 限额 |

`local-dev-r22-c036.json` 已记录 P0/P1 的隔离 CI Chrome 成功、P2 尚待 CI、真实用户 Mac/Codex `NOT_TESTED`。本轮不重测这些成功，也不把 CI 局部证据提升为全部 Node 安全矩阵或本机迁移通过。

## 已定位的最小实施切片

这是源码落点与通过条件，兼容方案仍是 R1。只有门槛满足后才创建 OpenDesk 独立实现 worktree/`agent/…` 分支；原 OpenDesk 共享目录保持只读。

| 文件（相对各自独立工作区） | 必要修改 | 通过条件 |
| --- | --- | --- |
| OpenDesk `cmd/opendesk/main.go` | 在 `init():235` 的 bundled App 探测/锁线程前识别 browser；在 `main():401` 的 cwd/console/flags/HTTP 路径前分派 | 同一发行二进制 Native 模式无窗口、无 HTTP/单实例依赖；原 CLI/Desktop 行为保留 |
| OpenDesk `internal/browsercli/command.go`（拟新增） | 首参数精确分派 native-host/CLI；file/request-id 优先级、原 JSON 和退出码 | 复用 Node 输入；没有 AI/MCP envelope、自动 retry 或常驻 HTTP |
| OpenDesk `internal/browserbridge/{wire,client,host}.go`（拟新增） | 原帧/认证/单请求/协商 provider 转发；Chrome EOF/信号、pending/未知、owner inode 清理 | Node/Go 同一边界输入；拆/合帧、UTF-8/上限、认证、迟到 ACK、超时、断开和 socket 替换合同均保持 |
| OpenDesk `internal/browserbridge/install_darwin.go`（拟新增） | 固定 launcher 背后 exec 同二进制；原身份/路径/credential；独立候选安装及迁移 | 原安装器回执/冲突语义；精确备份、原子切换、中断及回退验证；共享安装保持不变直到获授权集成 |
| Browser `tests/environment/native-agent-*.test.mjs`、`tests/framework/r62-native-acceptance.mjs` | 现有请求/断言增加 provider spawn 注入，增加已有 local-dev 消费者的兼容比较 | 不复制业务运行器、不伪造 sender/ACK；Node 成功且输入未变则复用；当前候选受影响项定向验证 |
| Browser `native-agent/cli.mjs`、`install.mjs`、`local-dev` | 仅在需要公开候选接入时作薄适配 | Node 保留且默认不变；新 provider 不建立另一套 executor/权限/结果库 |

OpenDesk `internal/aicli/aicli.go:22` 是可参考的首参数分派模式。`scripts/install_macos_cli.sh` 是 `.app` launcher 安装器，不能覆盖 Browser 私有安装；`scripts/build_macos_app.sh` 已构建 `./cmd/opendesk`，没有理由先修改其打包流程。`pkg/nativeextension` 是子进程 V0 协议，不能充当 Chrome Native Messaging。静态读取确认 robotgo/Cocoa 仍在同二进制 import/link 闭包，提前分派不能证明 C 初始化无 stdout 污染；必须对真实发行二进制收集原始 stdout 及窗口/进程证据。

## 接续顺序、切换与回退

```text
相关 Node 基线形成：明确候选 + 安装/Host/CLI hash + 核心及新增消费者合同 + 安全异常证据
  → 两个独立实现工作区；先 Go 协议/客户端/Host 与原合同对比
  → 同二进制初始化/stdio/无窗口/EOF；原 Desktop/HTTP/MCP 定向回归
  → 受影响构建及隔离真实 CFT；持久结果与异常语义仍由原 Browser 产生
  → 原 owner 汇集 pending=0 和无未决效果证据；取得安装资源明确交接
  → 原安装精确备份 bytes/uid/mode/缺席状态/hash；私有、Git 外保存 credential
  → stage/原子切换/新连接/迁移验收；失败只恢复后续入口，不重放旧 request
  → 兼容和真实迁移通过后，由获授权集成者串行切默认；不 release/publish
```

如果不能证明 pending=0 或未决效果已处置，保持 `MIGRATION_BLOCKED_UNKNOWN_EFFECT`。没有“socket 不存在即安全”的捷径。原 manifest/name/allowed_origins/path、credential、Browser ledger/durable Run/Result 均保持。备份应包含活动安装实际闭包；当前三文件及元数据不能套用旧两文件清单，增加/缺席项目须逐项记录。回退核对备份 hash/metadata，恢复原入口字节与文件缺席状态，只建立后续连接并查询原身份；不清空 ledger、重置结果或重放未知请求。

当前退役清单：**无文件获准删除或退役。** `native-host.mjs`/`wire.mjs` 只有在 provider 验收后才可能退出默认 Host 运行依赖；Node CLI/安装器、`locations.mjs`、`native-agent/local-dev/**` 及它们的真实消费者继续保留，直到相应消费者兼容和回退验证完成。Browser 执行/权限/结果代码、旧工程、原始 receipt/dist/ZIP 始终不由本工作流退役。

## 本轮验证与五项状态

执行 [证据捕获器](evidence/opendesk-native-takeover-01a120ca/capture.py)，只读原文件/git/hash，生成自身证据；随后 `--check` 核对八份复制响应及 gate/status 完整性。Python 语法和 `git diff --check` 为准备产物验证；没有产品测试、构建、Native 请求、CFT 或迁移验收。原文档和证据未修改。

| 状态项 | 本轮结论 |
| --- | --- |
| SOURCE_IMPLEMENTED | NO |
| CONTRACT_COMPATIBLE | NOT_VERIFIED |
| NATIVE_CHROME_VERIFIED | NOT_TESTED |
| MIGRATION_VERIFIED | NOT_TESTED |
| DEFAULT_PROVIDER | NODE_UNCHANGED |

本地复查：`python3 docs/framework/workstreams/evidence/opendesk-native-takeover-01a120ca/capture.py --check`。捕获器拒绝覆盖已有快照；新基线须使用新证据身份。复查原响应副本的 hash 不表示历史证据仍适用未来产品输入。
