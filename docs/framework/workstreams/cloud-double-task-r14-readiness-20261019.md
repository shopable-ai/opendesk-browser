# Cloud 双 Task R1.4 · 真实就绪和 Mac Codex 交接

## 当前证据与安全边界

- 当前只做了源码/权限边界审计与 JavaScript 语法检查，未在本次网页环境执行 Mac Chrome、Node 全量测试或端到端远控。
- 以 GitHub 最新 main 为准，不能用以前候选的 CI PASS 代替本次提交的原生证据；queued 仅记 `CI_QUEUED`。
- 已有的 Controller/RunHost/Authority/Offscreen/Provider/Task Installer 是唯一执行路径。
- `tests/cloud-control/native-double-task.mjs --preflight` 只读：不启动网页 fixture、不提交 Job、不创建 Offscreen、不伪造本地授权。
- **前置条件满足之后**，无参数的同一入口才真实提交两个不同 Task；先表单、后关闭 Side Panel 执行 Locator 搜索，并核对原始 Run/Result/Provider receipt。
- 因为 Chrome Offscreen 只支持 `chrome.runtime`，预检从已打开的真实 Side Panel 读取 `chrome.permissions.contains` 和 `chrome.userScripts.getScripts`；不访问 Chrome Preferences。

## 最短执行策略（先 Gate，后 Chrome 真执行）

1. **源码与构建**：仅 main、无将被覆盖的未提交修改、允许安全 fast-forward；Node >=22.12.0；`npm ci`（按已有锁文件）、`npm run check`、`npm run build`、`node scripts/verify-package.mjs dist/production`。确认 Chrome 实际加载的正是这个产物。不要重建或清理别的 Agent 的工作区。
2. **Provider**：检查已有 `43112` 本地 Admin 端口与独立的 HTTPS listener；不要在已有服务上重复启动。正式证书必须可信，SAN 匹配请求主机名；禁止 `NODE_TLS_REJECT_UNAUTHORIZED=0`。表单 Task 已在 Provider 内置，搜索 Task 必须另行注册（启动时 `--task-package`，或通过已有 `register --package`）；Provider `providerId` 与 Chrome 配对记录一致。
3. **Chrome**：经原有 Chrome for Testing 原生 launcher 启动**已有授权且与构建包相同**的扩展，获取浏览器级 CDP WebSocket URL；用户通过浏览器扩展详情手动打开“允许用户脚本”，授权测试网站并打开 Side Panel。启用 Cloud 托管以后应有且仅有一个 Offscreen runner。不要静默改 Preferences、注入权限或伪造 Side Panel。
4. **双 Task**：先由原 Controller 对两份固定 Package 分别完成真实网页运行验证并标记 Available，再安装启用。在 Cloud UI 批准两个 Task 的固定版本/网站范围/结果回传；Provider 有两个相同 `manifestHash/sourceHash` 和 Executor capabilities。
5. **独立客户端**：针对相同 Executor 和本次 Cloud `grantId` 授予两个固定 Task 的外部客户端 token，`allowResult=true`。token 文件必须仅用户可读（0600），只允许安全文件注入。通过新只读 `/v1/client-scope` 检查完整双 Task pins、Executor、Provider、grant 和回传许可。
6. **环境预检**：检查 `43111` 端口空闲（网页 fixture 不需要预启动），所有关键条件完成后才执行下面的 `--preflight`。仅当输出 `READY_FOR_NATIVE_TEST` 才进入下一条。
7. **真实验收**：无参数运行同一脚本。提交表单 Task A 成功前不得启动 B；再原生关闭 Side Panel、确认 Offscreen 保活，提交 Locator 搜索 Task B，核对网页唯一副作用及完整 Run/Result/receipt。Stop/撤权/断线/重启须另列独立真实证据，不能从双 Task PASS 推断它们也通过。

Provider 首次启动示例（仅当未运行，需实际受信证书）：

```sh
node scripts/cloud-control/cli.mjs provider --directory .local/cloud-control --port 43112 \
  --public-port 44443 --public-host 127.0.0.1 \
  --tls-key /secure/provider.key --tls-cert /secure/provider.crt \
  --task-package examples/tasks/modern-search.v1.opendesk-task.json
```

现有 Provider 若尚未登记搜索 Task，不要重启服务来“试试”；使用原本的受认证管理入口：

```sh
node scripts/cloud-control/cli.mjs register --directory .local/cloud-control \
  --package examples/tasks/modern-search.v1.opendesk-task.json
```

在浏览器配对且批准两个 Task 后，使用真实 Executor ID 授予外部客户端（已有 token 不重复创建）：

```sh
node scripts/cloud-control/cli.mjs client:grant --directory .local/cloud-control \
  --executor "<real-executor-id>" \
  --packages examples/tasks/form-fill.v1.opendesk-task.json,examples/tasks/modern-search.v1.opendesk-task.json \
  --allow-result true --token-out /secure/opendesk-remote-client-token
```

最短 Mac 原生入口，所有值必须来自真实环境，不得写假值碰运气：

```sh
cd /Users/shopme/Documents/workspace/opendesk-browser
export OPENDESK_CLOUD_NATIVE_CDP='ws://127.0.0.1:9222/devtools/browser/<actual-browser-id>'
export OPENDESK_CLOUD_NATIVE_HTTPS='https://127.0.0.1:44443/'
export OPENDESK_CLOUD_NATIVE_ADMIN_FILE="$PWD/.local/cloud-control/admin.json"
export OPENDESK_CLOUD_NATIVE_TOKEN_FILE='/secure/opendesk-remote-client-token'
export OPENDESK_CLOUD_NATIVE_BUILD_DIR="$PWD/dist/production"
export OPENDESK_CLOUD_NATIVE_ADMIN_PORT=43112

node tests/cloud-control/native-double-task.mjs --preflight
# 只有真实 READY_FOR_NATIVE_TEST 才继续执行：
node tests/cloud-control/native-double-task.mjs
```

## 结果和止损

- 预检最久 **60 秒**，完整 E2E 最久 **9 分钟**，超时退出当前测试 Node 进程，不杀用户 Chrome、Provider、其它任务；标记 `E_NATIVE_WALL_CLOCK`。
- 真实授权未满足：`HUMAN_ACTION_REQUIRED`，停止依赖授权的后续执行；环境缺口：`BLOCKED_ENV`。源码/打包失败另行标记 `BLOCKED_CODE`。
- 报告位于 `artifacts/cloud-double-task-e2e/native-double-task-report.json`；主张真正双 Task 成功必须有 `CLOUD_DOUBLE_TASK_E2E_PASS`、网页副作用两条、两个独立 Job/Run/Result/sourceHash/receiptId、第二次 Side Panel 已关闭且 Offscreen 在场。
- 不管本次进度，报告里要明确 `NOT_TESTED` 的止损/撤权/重启情形；旧历史文件与无法恢复的 `OUTCOME_UNKNOWN` 永不清空来争取 PASS。
- 若预检不通过，只修对应 Gate；同一错误不得无限重试，不在本地重新进行全库架构审计。
