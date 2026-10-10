# GOAL：R16 本机 macOS / Chrome / Codex 独立验收

这份提示词交给用户本机、已登录官方 Codex CLI 的 Codex 执行。实施入口是两个真实主分支；先阅读同目录的 R16 工程 GOAL 与两仓 R16 设计合同，以及 `docs/framework/workstreams/r16-local-codex-20261010.md` 的最新证据。Linux 组件、真实 CLI 探测、旧候选 Chrome PASS 不能替代下面的同候选 macOS 验收。

## 工作约束

- Browser 只在 `main`，OpenDesk 默认 `master`。先读两仓 AGENTS、`git status --short`、分支和 HEAD；不建分支或 worktree、不覆盖其他任务修改、不 reset/clean/force push。
- 先检查 `docs/framework/testing-guide.md` 与对应工作流，查已有相同输入证据。为本轮建立独立证据目录，保留原失败与 NOT_TESTED，不改写旧 receipt。
- 同一时间只允许一个操作者占用 CFT profile、端口、dist 和 Go Native Host。核对实际资源后使用自己的 CFT profile；不要关闭用户其它浏览器、Codex 或任务进程。
- 仅通过真实 Chrome Side Panel、可信用户输入及原 Controller/RunHost 执行网页动作。不用 DOM 赋值、合成点击、伪造 sender/ACK、直接 CDP 执行业务动作来替代验收。
- 不读取、打印或上传 Codex auth 文件、账号正文、Token、Cookie、真实网页私密内容。真实模型验证只用下述合成需求与 demo-form。
- 官方 App Server 可以使用在线模型；每次发送需求及当前步骤需要真实同意，网页摘要还需工具审批与 Chrome 站点权限。用户未同意的部分保持待验。
- 新 Page 默认全站 HTTP(S) 调度、全局站点授权恢复均不等于模型内容同意、单次观察审批或 Task 权限。不得用这些入口绕过 R16 的精确文档、批准和持久回执。

## 1. 绑定候选并做必要检查

本轮自动启用范围是已审计的 **Codex CLI 0.159.2**，还会逐次检查实际协议与有效策略。未知版本返回 `CODEX_UNSUPPORTED`，不能靠修改版本白名单或关闭安全检查来验收。该版本支持活动 thread 内连续对话，但关闭进程后的冷恢复无法保持所需空执行环境，因此 `resumeSupported:false`，不展示可恢复成功的暗示。

若当前 Codex home 存在 `environments.toml`，本轮在启动前返回 `E_CODEX_POLICY`：官方 CLI 可能在初始化前启动该文件配置的本机命令或远端环境。不要为通过测试删除、改写或隐藏用户已有配置；记录为明确兼容限制，等待受审计的安全接入方案。

分别在两仓记录完整 `git rev-parse HEAD`、`git status --short`、运行系统/CPU、`node --version`、`go version`、`codex --version`。检查本机已有 Codex 登录状态；不要擅自重新登录或复制授权文件。

Browser：

```bash
npm ci
node --test --test-reporter=tap tests/environment/workflow-r15.test.mjs tests/environment/workflow-ui-states.test.mjs tests/environment/workflow-local-codex.test.mjs tests/environment/workflow-ai-transport.test.mjs tests/environment/workflow-ai-observation.test.mjs
npm run check
node --test --test-reporter=tap tests/environment/native-agent-package.test.mjs tests/environment/builtin-libraries.test.mjs tests/environment/compact-schema.test.mjs tests/environment/compact-schema-fixed.test.mjs
npm run build
npm run build:dev
npm run verify
```

OpenDesk：

```bash
go test -count=1 ./internal/browserai ./internal/browserbridge ./internal/browsercli
go test -race -count=1 ./internal/browserai
OPENDESK_TEST_REAL_CODEX=1 go test -count=1 -v ./internal/browserai -run '^TestInstalledCodexProbe$'
OPENDESK_TEST_REAL_CODEX=1 OPENDESK_TEST_REAL_CODEX_TURNS=1 go test -count=1 -v ./internal/browserai -run '^TestInstalledCodex(Probe|ContinuousSession|AmbientMCPIsNotStarted|Cancellation)$'
```

最后两条分别是无推理探测与会产生在线推理的合成测试。前者的 `READY_FOR_TURN` 不代表模型/额度已验证；后者分别核对真实 turn 终态、多轮上下文、独立 interrupt 终态和 MCP 启动阻断。0.159.2 的 cold-resume 子测试会因明确不支持而跳过，必须另列 `UNSUPPORTED / NOT_TESTED`，不能当作恢复 PASS；连续测试自身不会替代独立取消测试。如果本机网络、模型或额度阻断，记录真实类别，不能切换到其它 Provider 或改用 `codex exec` 冒充。

只有以上当前同候选打包、CSP 校验及定向测试通过才进入下一步。另读现有 `native-go-host-r5-1-delivery-gates-20261010.zh-CN.md` 的 Gate A 与原 R5 本机提示词；不要以旧候选 CI 代替本包，也不要削弱打包安全检查。

## 2. 安装这次 Go 候选并配对原 Native Host

按 OpenDesk 正式 macOS 构建/安装说明操作，典型构建入口：

```bash
./scripts/build_macos_app.sh
```

确认输出的 `OpenDesk.app` 后安装到固定的应用路径；不要把临时目录当成长期 Native Host，也不要无确认覆盖已有不同 owner 的安装。使用实际路径执行：

```bash
bash scripts/install_macos_cli.sh --app-bundle /实际固定路径/OpenDesk.app
opendesk browser setup
opendesk browser doctor
opendesk browser ai doctor
```

`browser ai doctor` 只验证当前本机进程可发现的 Codex，不代替 Chrome Native 配对和站点授权。核对 `command -v opendesk` 与 Native manifest 指向本次 Go 二进制，并记录该二进制 SHA-256。

已正确配对的 Go 安装可以复用原绑定；首次 unpacked CFT 没有已知扩展 ID 时，使用原有 setup 的明确配对参数，不能谎称首次开发安装零配置：

```bash
opendesk browser setup --extension-id 实际扩展ID --browser cft --user-data-dir /实际专属CFT目录
```

保留旧 Node Host/复杂 ESM MCP。若原安装的 owner/migration fence 拒绝，按已有迁移流程处理，不能偷偷覆盖 manifest、私有 Socket 或别的 profile。Chrome 通过 Native Messaging 启动可信 OpenDesk Host，不需要先在终端常驻一个新 HTTP 服务。

## 3. 最短完整正向闭环

在 Browser 仓库启动正式人工测试页：

```bash
python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks
```

1. CFT 加载本次 `dist/development`，记录实际扩展 ID、包文件哈希/加载目录、Chrome 版本和后台 Worker 身份。打开 `http://127.0.0.1:43111/demo-form.html`，从原扩展入口打开「工作流」。
2. 首屏确认对话区简洁。打开齿轮设置，选择「本机 Codex」，点击连接并按真实 Chrome 提示授予 Native Messaging。诊断必须来自真实 Go/CLI，不能由 mock 或 UI 常量给出 READY。
3. 勾选本次发送同意，输入合成需求：“为当前示例表单制作一个可重复使用的工作流，先规划观察步骤，不填写或提交任何内容。”确认需求进入真实 App Server thread/turn；保留经过筛选的类型/序号/终态与身份，禁止记录原始授权正文。
4. 在同一个 Sidebar 再发一轮合成修改：“继续刚才的计划，将标题改为 R16 示例表单检查，并保留已有观察步骤。”确认复用同一个 thread，turnId 不同，事件有序且提议必须经过原 Workflow Schema 校验。
5. 若需要让 Codex了解 DOM，重新同意本次模型内容并勾选网页观察。模型发起 `browser.observe` 后必须出现本次审批卡。用户真实点击允许、Chrome 站点权限获准、精确 window/tab/frame/document/url/origin 复验后，才由原 RunHost 运行固定只读源码。记录原持久 `runId/resultId` 与结果自身 `revision.sourceHash`；确认向模型发送的投影去掉完整文档 URL/query，不额外读取 input value、Cookie 或历史结果。摘要中的网页文字仍可能包含该页展示的敏感内容，审批说明不能承诺它天然不敏感。
6. 检查语义步骤，真实点击「采用这份计划」。如果需要填写/点击，先在对话中明确要求合成操作（不得提交敏感内容），再检查生成的定位、参数和动作。采用提议才改变草稿，模型文本不执行。
7. 使用原生成源码面板查看确定性 JavaScript/hash。真实点击 Run，按现有执行确认和站点授权运行。检查实际 DOM、Controller Durable Result、runId/resultId、结果 revision/sourceHash、stop/retirement 是否一致。
8. 真实点击保存，记录保存后的脚本 ID、Revision、WorkflowDefinition、冻结源码/sourceHash。不要把只保存 UI 元数据当成保存成功；重读原 Controller 源码与 revision 核对。
9. 结束 AI 会话，选择「手动创建/不使用 AI」，禁用此扩展 Native 连接。保持网页正常及必要站点权限，打开刚才保存版本再运行两次。两次使用同一冻结源码/revision，runId/resultId 各自独立；不得调用模型重新生成。记录每次真实结果与清理回执。

## 4. 必须验证的失败与撤销场景

| 场景 | 必须观察到的结果 |
| --- | --- |
| Native 未连接/未配对/权限拒绝 | 显示相应引导，不启动 Codex；手动编辑和已保存 JS 保持可用 |
| CLI 不存在、未登录、协议不兼容 | 分别显示真实状态，不伪装 READY，不要求浏览器收集 Codex Token |
| 模型不可用、限额、网络失败 | 显示真实失败类别；不自动上传到 custom HTTPS/云服务，不自动重放 turn |
| 规划时停止、结束会话、换 Provider、新建/加载草稿 | 已发请求被取消或关闭；迟到事件不能恢复旧会话、旧提议或旧审批 |
| Stop 后立即再次发送，或规划内部超时/事件游标失效 | 取消 ACK 的 `CANCELLING` 不算终态；旧轮准确终态或关闭收尾之前，新轮不能开始。收尾无法确认时移除旧会话并显示 UNKNOWN，不自动重发 |
| 缺失或非法 turnId、非法终态/status、无效事件批元数据 | 提议、工具观察和完成提示均不得交付；关闭受影响会话，保留原错误和清理证据 |
| 取消发生在 session.open 或权限检查尚未完成时 | 旧请求不能在关闭完成后开启新进程/新会话 |
| 模型请求 shell、文件、网络执行、任意其它 MCP 工具 | Go 阻断，UI 不允许批准，不产生网页或本机副作用 |
| 拒绝 browser.observe | 没有观察 run；模型最多继续根据已同意的需求规划 |
| 审批前导航/切换标签或窗口、撤销站点权限 | 精确 document fence 拒绝；不观察其它页面，不发送旧摘要 |
| 观察中 Stop/关闭 Sidebar/撤销权限 | 使用原 RunHost 停止；缺可信终态或结果时保留 UNKNOWN，不重放 |
| Native 断开/重连、重复 requestId、跨窗口 sessionId | 请求不重复执行、其它 Host 看不到会话/事件、旧审批失效 |
| 新 Go 与原十个 RPC；旧 Node Host | 原能力继续工作；旧 Node 缺 AI capability 时不收到未知 AI 帧 |
| 同站导航和跨 origin 提议 | 原 Task v1 同 origin 规则保持；跨 origin 拒绝，不加后门 |
| 原 Page 兼容回归 | 另记录旧冻结 header / 无 @match / 无 @noframes / 显式 allFrames:true 的 Page 在新 main-frame 默认下的安全拒绝；不能为通过验收取消元数据/冻结权限一致性校验 |

不要为了缺失/未登录场景删除用户真实 CLI 或认证。先用现有组件 fixture 验证该分支；要做原生隔离场景时使用明确拥有的测试安装/账号，保留权限边界。

## 5. UI 与独立验收报告

检查真实 Side Panel 320/360/420/520px 和 Chrome 200% 缩放：无横向溢出、发送/停止可见、齿轮可开关、状态与错误可读、键盘焦点和屏幕阅读语义合理。这些不能用静态 HTML 字符串断言代替。

由未编写对应模块的 reviewer 分别评价 UX、Provider 真就绪、Codex 连续 Agent、工具授权、隐私/凭据隔离、安全/撤权、效果未知与恢复、浏览器执行、冻结保存复用、Go/Node 兼容、真实 Native Chrome。每项百分制独立评分，目标 ≥95；无足够证据写 NOT_TESTED，不能拿平均分填平缺口。关键安全失败直接 NOT_ACCEPTED。

交付报告必须列出两仓完整 commit、实际 Go 二进制/Browser 包身份、Codex/Chrome/OS 版本、原始测试命令和退出码、受影响文件哈希、真实 runId/resultId/revision/sourceHash、资源释放状态、保留失败与剩余项。源码修复后只补受影响验证；若最终候选变化，不得把旧包结果当作新包 PASS。不要发布 release/ZIP 或替用户发送消息，除非另有明确授权。
