# mac24dev 云控表单演示页面

业务页面是后端同源提供的普通 HTML/CSS/JavaScript，不是可信 Side Panel、Provider 或执行器；不引入 React、SDK、第三方资源或前端构建步骤。本目录另有固定 Task 候选和受信维护脚本，页面不加载维护代码或持有 Provider 凭据。后端与 Provider 复用现有开发服务。

## 本轮版本交付接线（2026-10-30，尚未原生执行）

已补齐原先写死 `1.0.0` 的后端、页面和绑定维护入口。受信私有配置可选 `taskPin`，只接受原 `1.0.0` 或本目录独立的 [`1.0.1` 待验证包](form-fill.v1.0.1.opendesk-task.json)；省略仍选原版。不是任意程序上传接口，当前 demo 仍为一个选定 Task。原键的投影从保存的 pin 读取，不能随当前目录版本改写；更换绑定后旧请求保留但拒绝借用新身份查询或执行。

新源码 [`form-fill-upgrade.js`](form-fill-upgrade.js) 仅在同一标准页覆盖填写原姓名、提交一次并核对该网页按原规则去除首尾空白后的完成文字；参数原样传入，不改旧包、站点、权限和 Schema。完整 SHA：manifest `8a39edc5ba519869ac5c74132b46830727d3ef8a8c2e4695bb2a0a995e1523c7`，source `9e74a9e089dda18fadc495e9c90b6851ad686eb20b40159d36547d5326c56153`。包生成及组件通过均不等于验证、安装或网页实际执行。

投递继续使用原 CLI（真实 Executor 配对后才执行，不能填假身份）：

```sh
node scripts/cloud-control/cli.mjs program:deliver --directory .local/cloud-control \
  --executor <真实-executor-id> --package examples/cloud-control/mac24dev-demo/form-fill.v1.0.1.opendesk-task.json \
  --key <本次固定投递键>
```

在真实「云控」审阅源码／版本差异、显式试运行、接收候选、核对原 Run 并验证安装，再批准新安装版本的远程范围。只有这些真实完成后，维护者才选择新包绑定：

```sh
node examples/cloud-control/mac24dev-demo/bind-provider.mjs --executor <真实-executor-id> \
  --login-file /Users/mac/Documents/workspace/opendesk-browser/.runtime/integration-20261030-01a18893/demo-login.private.json \
  --package examples/cloud-control/mac24dev-demo/form-fill.v1.0.1.opendesk-task.json \
  --replace-binding <当前精确-binding-id>
```

首次绑定省略 `--replace-binding`；替换必须给出当前 bindingId，不能默认覆盖。新版本需要新 Grant／Client；脚本在私有锁下复核身份、保留0600旧配置备份后原子替换。其他设备仍使用旧版时拒绝全局切换，不能静默改它们的 Task。结果正文仍需已获批准的双层许可，按需显式 `--allow-result`；未调用本命令前不会切换当前版本或授权。

当前后端已加载本轮云控 service，父闭包为最终支付 runtime，231文件中仅该 service 变化，其他文件 SHA 未变。当前私有配置仍选 `1.0.0`、设备1288未连接、历史空，没有新 Job／Run／Result／回执；**固定版本接线已完成，以上真实交付链和业务执行链仍 NOT_TESTED**。最新证据／owner 见 [本轮工作流](../../../docs/framework/workstreams/cloud-mac24dev-20261030-01a18b96.md)。

可直接打开的演示入口：`http://127.0.0.1:38001/public/opendesk-cloud-demo/index.html`，页面和固定包已部署到现有后端。已通过业务 API 注册专用 demo 账号 `userId:569` 与设备 `deviceId:1288`；注册不等于 Browser 已安装任务、配对或批准托管，是否可提交仍以目录返回的 `READY` 为准。

## 当前运行与启动

当前后端、HTTP 转发、测试页、Provider 和 Browser dev watcher 已运行，直接打开入口即可。日常 Chrome 继续加载 `/Users/mac/Documents/workspace/opendesk-browser/dist/development`，不要重装或换目录。若它们退出，只恢复退出的服务；操作前核对监听和 owner，不能重复启动 watcher。

- 数据库与数据库持久隧道：按 `/Users/mac/Documents/Codex/2026-10-29/mac24dev-cool8-db-cutover/outputs/RUNBOOK.md`，本机 Docker 保持运行；不恢复旧快照。
- 后端：SSH `mac24dev`，进入 `/Users/a0000/Documents/workspace-old/todo-admin-midway-cool8-operate`，使用 Node22 的 `npm run upgrade:start`；活服务直接复用。当前 runtime 为 `runtime-cloud-demo-20261030071501858`，从最终支付父闭包复制，231文件，旧 runtime 保留。
- HTTP 转发退出后：`ssh -fNT -o ExitOnForwardFailure=yes -L 127.0.0.1:38001:127.0.0.1:38001 mac24dev`。
- Provider 使用原 `.local/cloud-control` 身份与状态，管理/Chrome loopback 为43112、受限后端 TLS 为43113；服务启动命令见下方维护说明，不使用另一个目录重建身份。
- 测试页退出后：Browser 仓库执行 `python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks`。Watcher 退出后才执行 `npm run dev`。

登录用户名和密码保留在本机0600私有文件 `/Users/mac/Documents/workspace/opendesk-browser/.runtime/integration-20261030-01a18893/demo-login.private.json`。只在本机查看并用于该页面登录；不要复制进静态文件、日志或提交。页面登录与现有后端账号兼容，可改用自己的合法账号及其设备，但维护者必须对该账号的真实设备另作精确绑定。

## 使用流程

1. 本目录三个静态文件和固定包现已由后端同源提供；使用上述入口。不要以 `file://` 或另外的静态服务打开页面。
2. 用业务账号登录。密码提交后立即清空输入框，JWT 仅在页面内存；刷新或退出后重新登录。HTTP 401 或业务 `code:401` 会清除登录态。
3. 按页面说明下载、审阅并安装固定任务，在当前 Chrome 的真实扩展工作台安装并手动配对与授权；这些设置仍待实际完成。执行设备的标准测试页为 `http://127.0.0.1:43111/demo-form.html`。
4. 选择设备；只有目录报告 `READY`，且 Provider、任务名称/版本、manifestHash、sourceHash 与完整固定参数 Schema 都与本演示一致时可提交。对象字段顺序不影响匹配。`NOT_CONNECTED`、`NOT_AUTHORIZED`、`UNKNOWN` 分别显示，不能用在线代替授权。
5. 点击「新建请求」，填写 1–40 字符姓名，再点击「提交一次」。页面不会自动轮询、自动重试或重复提交。每次点击新建才生成新 UUID，登录和刷新不会生成。
6. 查询原请求，分别核对原始 `state`、`receiptConfirmed`、`retirementState`、取消登记、执行身份与结果。`completed`/`finished` 不自动代表回执或资源释放；`UNKNOWN` 保留原键查询。
7. 刷新后，同账号登录会恢复原请求键；也可输入 UUID 或读取历史并点击「查看原请求」。恢复只调用状态查询。未确认收尾的请求切换到新键/其他键前需内联确认，旧请求仍可从历史恢复。
8. 「请求取消」仅在查到原请求后可用，需内联确认；登记成功不等于已停止或已释放，也不会回滚网页操作。丢失响应后显示 UNKNOWN 并查询原键，不自动重发取消。

姓名按原 Task/后端的 JavaScript UTF-16 长度校验 1–40，普通汉字通常占一个位置，大部分表情占两个；不裁剪空格或重写输入。原1.0.0冻结包与源码未更改。

查询状态和取消时会先隐藏上次结果，查询失败保持 UNKNOWN 及原请求键；读取历史失败不继续显示旧列表。业务登录失效时退出页面账号，云控授权/设备归属/绑定失效则隐藏旧结果与历史、关闭提交，不把重新登录说成可以恢复设备授权。刷新目录明确报告设备授权失效或原设备消失时也隐藏旧结果。

错误只将后端文档内的精确代码翻译为本地中文说明：原请求不存在时核对原键/历史；绑定变化时联系维护者核对原绑定；任务范围不符时核对扩展端授权；连接响应未知时保留原键查询。服务端任意错误正文不显示；查不到记录或未知结果均不代表未执行。

仅本地存储项 `opendesk.mac24dev-demo.request.v1.<userId>` 保存当前 UUID 字符串，不保存 JWT、密码、姓名、结果或 Provider 凭据。存储失败会阻止提交，但仍可查询原键与历史；清除站点数据后可从账号历史或手工原键恢复。查询其他键得到有效投影后才更新本地键，查不到不会覆盖已保存原键。已发送/恢复的请求锁定姓名和设备，不允许通过改名静默复用原键。后端负责同键同数据幂等，页面不提供重提按钮；提交响应丢失也按未知结果查询。只有终态、回执确认且 `retirementState:released` 同时成立才免去切换警示，缺字段仍保守确认。

## 同源 API 合同

所有成功响应为 `{code:1000,data:...}`。除登录外，使用 `Authorization: <原始 JWT>`，不添加 `Bearer`。请求禁用重定向和缓存，不附带 Cookie；服务端错误正文不会显示。网络内容通过 `textContent`/DOM 节点渲染，不使用 `innerHTML`；详情只展示请求投影字段，并遮蔽常见凭据字段和 JWT。后端仍必须保证业务投影及 `result/message` 不含任何 Provider 密钥、账号密码或其他秘密。

| 方法与路径 | 请求 | data |
| --- | --- | --- |
| `POST /app/user/login/loginSimple` | `{username,password}` | `{token}` |
| `GET /app/user/info/person` | 无 body | `{id,username,nickName}` |
| `POST /app/operate/cloudcontrol/catalog` | `{}` | `{task:{taskId,version,title,manifestHash,sourceHash,paramsSchema},devices:[{id,nickname,readiness,message}],providerId}` |
| `POST /app/operate/cloudcontrol/submit` | `{requestKey:UUID,deviceId:number,taskId:'sample.form-fill',version:目录选定版本,params:{name}}` | 请求投影 |
| `POST /app/operate/cloudcontrol/status` | `{requestKey}` | 请求投影 |
| `POST /app/operate/cloudcontrol/cancel` | `{requestKey}` | 请求投影 |
| `POST /app/operate/cloudcontrol/history` | `{}` | 请求投影数组 |

请求投影：`{requestKey,deviceId,taskId,version,jobId:null|UUID,state,receiptConfirmed,retirementState?,assignmentId?,trace?:{runId,resultId,receiptId},result?,cancelRequested,message?,createdAt}`。页面保留原始状态名，辅助说明区分未连接、未授权、进行中、完成、取消和 UNKNOWN；未识别的新状态保守视为 UNKNOWN，不推测成功。

Provider 必须为 `9c4f182d-7a5f-403d-9b4d-c2144ef35e5b`，执行设备使用 `http://127.0.0.1:43112`。业务后端必须由维护者用既有私有脚本绑定同一 Provider；不把维护者/Provider Token 或私有脚本输出放进本页，不新增 Token 输入框。页面固定下载链接为 `/public/opendesk-cloud-demo/form-fill.v1.opendesk-task.json`，已逐字节复制并提供，未在此目录重复创建包。

## 维护者绑定与官方 Native 配对

只有真实 Browser 已安装该任务、连接上述同一 Provider 并完成 Cloud 托管授权后，维护者才使用真实 executor ID 执行本目录提供的命令：

```sh
node examples/cloud-control/mac24dev-demo/bind-provider.mjs --executor <real-executor-id> --login-file /Users/mac/Documents/workspace/opendesk-browser/.runtime/integration-20261030-01a18893/demo-login.private.json
```

已明确批准结果回传时可追加 `--allow-result`。真实 client token 仅由维护者脚本通过 SSH stdin 送达服务端，不进入页面、静态文件、URL 或页面输入框。私有登录文件只供维护者脚本读取，不打印内容、不复制到公开目录。该命令先实际登录、核对本人设备和真实配对，再签发固定 Task Client 并原子写入服务端0600配置；同设备重复绑定拒绝，失败会尝试撤销新 Client。不能用它代替 Browser 的安装/授权。

## 开发服务维护说明

只有原服务确已退出时，在 Browser 仓库启动原 Provider：

```sh
node scripts/cloud-control/cli.mjs provider --directory .local/cloud-control --port 43112 \
  --public-port 43113 \
  --tls-key .local/cloud-control/mac24dev-demo-key.pem \
  --tls-cert .local/cloud-control/mac24dev-demo-cert.pem
```

后端到 Provider 的单独反向转发退出后恢复：

```sh
ssh -fNT -o ExitOnForwardFailure=yes -R 127.0.0.1:43113:127.0.0.1:43113 mac24dev
```

不要更换证书绕过错误；服务端只信任固定私有 CA。证书为30天开发证书，过期需由维护者审查更新证书与服务端CA，不关闭TLS验证。网络守卫仅在显式 demo 配置存在且 Provider ID/URL 匹配时允许该端口；其余外网和监听限制不变。

在 Chrome 本体已加载的情况下，打开真实 OpenDesk 右侧工作台，核对实际32位扩展ID、固定加载路径和 dev client已连接。在原「我的」任务目录导入下载的 Task 包，按原流程完成安装审阅／网站权限和必要验证；不要将 Controller Task 导入为 Sidebar Tool。验证时明确 Run 一次并保存 Run/Result，不能自动重试未知结果。此固定 Task 流程本身不要求 Native；仅当前选择的本地项目／Native 操作实际需要时，才使用官方 `opendesk browser setup --extension-id <真实ID>`、扩展「授权并连接 OpenDesk」及 `browser doctor`，不得手改 manifest 或猜ID。

云控 Tab 配对URL `http://127.0.0.1:43112`，Provider ID见页面；一次性配对码只在本机私有 `.local/cloud-control/admin.json` 查看，不放进本页或日志。批准这一固定 Task、站点范围及所需的最小结果回传。当前源码已有固定 Offscreen 复用原 RunHost；本轮关闭 Side Panel 续跑仍 NOT_TESTED，不能以源码替代证据。刷新状态不等于领取任务。取得真实 Executor ID后再运行上方绑定命令，回页面「刷新设备」；显示READY后「新建请求」→填写name→「提交一次」。主 demo 尚未提交，勿为测试连通性提前发送。

## 历史证据与准确缺口

本节保留此前 owner 的组件数字与 Chrome 原记录；本轮固定版本接线及当前后端状态以上方新增章节和工作流为准，不能把历史「后端未修改」解释为本轮未部署。

2026-10-30 本次源码修复的定向入口：`node --test tests/cloud-control/mac24dev-demo-ui.test.mjs`。测试执行真实 HTML 与事件代码，覆盖固定摘要/Schema、参数长度、错误提示、结果失效、原键恢复、单次提交、取消未知和退出后的迟到响应；HTTP 与存储使用组件夹具，**不代表 Provider/Chrome Worker 真执行**。后端服务与 Provider 本次未修改，已有有效定向证据继续复用。 本次13项组件测试通过；更新后当前Chrome实测登录、本人设备选择、缺失原键的明确提示与取消禁用，退出重登后未把诊断键恢复成执行请求。静态HTTP与本地两文件逐字节一致；证据在 `.runtime/integration-20261030-01a188c1/`。

真实当前后端 HTTP 已验证：密码登录、只返回本人设备1288、未配对状态NOT_CONNECTED、未配对提交/未登录/非法name/未授权Task拒绝、本人历史为空。人工页面及固定包HTTP200。首轮Chrome登录交互超时保留为历史；本轮在当前系统Chrome真实点击登录成功、选择本人设备1288并查询空历史。页面明确NOT_CONNECTED且「提交一次」不可用，没有生成requestKey或派发任务。原始DOM与截图在 `.runtime/integration-20261030-01a18893/demo-chrome-authenticated.ax.txt` / `.png`；这不等于Task执行成功。

后端定向组件22项及两入口TypeScript检查通过；Provider HTTPS/客户端归属/结果隐私与原键恢复两个定向文件通过。以上都是组件或HTTP证据。新元数据表显式迁移，禁止自动schema同步；原键异内容冲突、单次提交、UNKNOWN只读恢复和取消意图与释放区分有组件验证。

**仍未完成**：当前Chrome真实扩展ID/加载路径/dev连接、Task安装/授权、真实Executor绑定及主demo一次执行。Native doctor仅在所选操作实际依赖Native时另检，不是固定Task的前置要求。Provider executors=0/jobs=0，元数据表0行。requestKey/jobId/assignmentId/runId/resultId/receiptId均未产生；没有网页被Task填写的证据，资源释放/原Result/回执也未验证。必须完成这些真实步骤后才能称全链完成。

未知或超时只查询原键。owned 网页会在正常退休时关闭，提交前须准备现有43111被动观察及合法只读原生 target/tab/document 关联；收到回执后核对已持久的原网页 name、每次 submit／done 序列及效果，再对应原Run/Result、retirementState:released和Provider receipt。不能重开同URL替代原文档，缺证记 INCONCLUSIVE；不延迟释放、不重跑原请求、不直接改数据库/IDB或另行填表制造成功。production、发布、全量验收和评分均未执行。
