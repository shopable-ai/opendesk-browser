# Cloud 双 Task R1.4 → R1.5 · 四阶段真实就绪和 Mac Codex 交接

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
6. **环境预检**：先检查 `43111` 端口空闲，确保单 Task 表单真实安装、验证与结果授权，运行 `--smoke-preflight`；仅实际输出 `READY_FOR_SMOKE` 才允许 `--smoke`。
7. **逐阶段真实验收**：先通过 `--smoke` 获得第一个表单 Task 的网页副作用、原始 Run/Result 和 Provider receipt；只有 `CLOUD_SINGLE_TASK_SMOKE_PASS` 才进入 `--preflight`，核对两个不同 Task 固定身份及授权并取得 `READY_FOR_NATIVE_TEST`；最后无参数运行双 Task E2E，关闭 Side Panel 后执行 Locator 搜索。Stop/撤权/断线/重启独立验证，不能由双 Task PASS 推断。

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

## R1.5 关键阻断修复与证据边界

- 原生预检不得在 Offscreen 调用 \`chrome.runtime.getContexts\`：该上下文真实不可用。R1.5 改为在用户真实打开的 Side Panel 内只读枚举原生上下文；关闭面板后仅在 **相同 CDP Offscreen targetId** 仍然存在时沿用已验证的 documentId，不唤醒 Service Worker，也不从同 URL 伪造新身份。
- 本轮远端编辑环境无法访问用户的 Mac Chrome / Provider / 授权凭据。隔离 Node 环境的 helper 三条测试通过不等于当前 GitHub HEAD 的全仓组件测试，更不等于 Chrome 原生 PASS。
- 四阶段证据目录各自独立。默认路径自动包含阶段与唯一运行 ID；若主动传入 \`OPENDESK_CLOUD_NATIVE_EVIDENCE\`，禁止复用已有报告目录。已存在 \`native-double-task-report.json\` 将在提交 Job 前以 \`E_EVIDENCE_EXISTS\` 失败，原文件不覆盖。
- Cloud R3/R5.2 CI 的状态要按对应 commit 和 GitHub Actions 原始结论核查；queued 不是 PASS。历史开发环境单 Task / 关闭面板场景不替代本轮冻结生产构建的双 Task 证据。
- 首先修确实失败的 Gate；不清空旧 Profile/Provider/IDB，不编辑其他 Agent 的工作，不用超时等待替代判断。

Mac Codex 最短执行入口（由实际环境填写，不接受示例 ID 当真）：

\`\`\`sh
cd /Users/shopme/Documents/workspace/opendesk-browser
# 先确保 main 安全快进，无他人未提交改动；Node 与依赖真实可用
node --check tests/cloud-control/native-double-task.mjs
node --test tests/cloud-control/native-context-reader.test.mjs tests/cloud-control/native-readiness-contract.test.mjs tests/cloud-control/remote-https-r52.test.mjs
npm run check
npm run build
node scripts/verify-package.mjs dist/production

# 以下只填写实际 Chrome/Provider/CFT/人工授权中取得的值
export OPENDESK_CLOUD_NATIVE_CDP='ws://127.0.0.1:9222/devtools/browser/<actual-browser-id>'
export OPENDESK_CLOUD_NATIVE_HTTPS='https://127.0.0.1:44443/'
export OPENDESK_CLOUD_NATIVE_ADMIN_FILE="$PWD/.local/cloud-control/admin.json"
export OPENDESK_CLOUD_NATIVE_TOKEN_FILE='/secure/opendesk-remote-client-token'
export OPENDESK_CLOUD_NATIVE_BUILD_DIR="$PWD/dist/production"
export OPENDESK_CLOUD_NATIVE_ADMIN_PORT=43112

# 建议在单独 Bash 会话执行，set -e 保证前一阶段失败时绝不进入后一阶段
set -e
EVIDENCE_ROOT="$PWD/artifacts/cloud-double-task-e2e/r15-$(date -u +%Y%m%dT%H%M%SZ)-$$"
require_status(){
  node -e 'const r=require(process.env.OPENDESK_CLOUD_NATIVE_EVIDENCE+"/native-double-task-report.json");if(r.status!==process.argv[1])process.exit(1)' "$1"
}

export OPENDESK_CLOUD_NATIVE_EVIDENCE="$EVIDENCE_ROOT/01-single-preflight"
node tests/cloud-control/native-double-task.mjs --smoke-preflight
require_status READY_FOR_SMOKE

export OPENDESK_CLOUD_NATIVE_EVIDENCE="$EVIDENCE_ROOT/02-single-smoke"
node tests/cloud-control/native-double-task.mjs --smoke
require_status CLOUD_SINGLE_TASK_SMOKE_PASS

# 此时再逐项确认搜索 Task 的 Available/安装/Cloud 批准和外部固定 scope
export OPENDESK_CLOUD_NATIVE_EVIDENCE="$EVIDENCE_ROOT/03-double-preflight"
node tests/cloud-control/native-double-task.mjs --preflight
require_status READY_FOR_NATIVE_TEST

export OPENDESK_CLOUD_NATIVE_EVIDENCE="$EVIDENCE_ROOT/04-double-e2e"
node tests/cloud-control/native-double-task.mjs
require_status CLOUD_DOUBLE_TASK_E2E_PASS
\`\`\`

四个报告分别为 \`$EVIDENCE_ROOT/01-single-preflight/native-double-task-report.json\`、\`02-single-smoke/...\`、\`03-double-preflight/...\`、\`04-double-e2e/...\`。每次新验收使用新的 \`EVIDENCE_ROOT\`；不要删除旧日志或覆盖历史证据。真实 Provider/SSL/Chrome CDP/手动授权不足时立即报告 \`BLOCKED_ENV\` 或 \`HUMAN_ACTION_REQUIRED\`，不得直接提交第一个 Task。

## 结果和止损

- 预检最久 **60 秒**，完整 E2E 最久 **9 分钟**，超时退出当前测试 Node 进程，不杀用户 Chrome、Provider、其它任务；标记 `E_NATIVE_WALL_CLOCK`。
- 真实授权未满足：`HUMAN_ACTION_REQUIRED`，停止依赖授权的后续执行；环境缺口：`BLOCKED_ENV`。源码/打包失败另行标记 `BLOCKED_CODE`。
- 每阶段报告位于对应 `OPENDESK_CLOUD_NATIVE_EVIDENCE/native-double-task-report.json`；主张真正双 Task 成功必须有 `CLOUD_DOUBLE_TASK_E2E_PASS`、网页副作用两条、两个独立 Job/Run/Result/sourceHash/receiptId、第二次 Side Panel 已关闭且 Offscreen 在场。
- 不管本次进度，报告里要明确 `NOT_TESTED` 的止损/撤权/重启情形；旧历史文件与无法恢复的 `OUTCOME_UNKNOWN` 永不清空来争取 PASS。
- 若预检不通过，只修对应 Gate；同一错误不得无限重试，不在本地重新进行全库架构审计。
