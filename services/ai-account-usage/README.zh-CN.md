# OpenDesk Browser · AI 账号额度管理中心 R1.1

**阶段：PROBE_READY / LIVE_NOT_TESTED**。本目录只提供独立 Node.js 单账号 Cookie-only 查询实验，不是 HTTP 服务、已完成的管理看板或任何实际额度查询成功证明。

## 原始产品目标

在不切换 Chrome 当前登录账号、不改变 Cookie Editor 现有账号快照的前提下，查询经过授权的公司 ChatGPT / Codex 账号额度、剩余百分比和重置时间。Cookie Editor 仍是唯一账号及 Cookie 管理方；独立 Node.js 是未来的只读采集方；已确认的额度管理 UI 原型在 `examples/sidebar-tools/cookie-editor/preview/ai-account-usage.html`，不得从虚构数据生成真实结果。

## R1.1 单账号实验

- 程序：`probe.mjs` 是没有副作用的核心查询；`cli.mjs` 从**受控本机 stdin** 读取一次性输入，只进行 HTTP GET，不建立长期缓存或服务器。需要 Node ≥22.12。
- 仅发送两个固定目的地：`https://chatgpt.com/backend-api/wham/usage` 和（仅在额度返回有效结构之后）`https://chatgpt.com/api/auth/session`。只提供 Cookie 与 Accept 头，不添加 Bearer、ChatGPT-Account-ID、浏览器指纹模拟或 Codex 会话。
- 禁止自动重试、跳转、跨域请求及调试日志。Cookie 行限定 chatgpt.com HTTPS、同一个 Chrome store，拒绝分区 Cookie，拒绝过期、不匹配路径的 Cookie。响应 JSON 限制字节数。
- 必须将会话的 userId/email 与管理员事先独立确认的预期身份比较，且额度 JSON 中的 account_id 与预期 accountId 相等。**HTTP 200 并不等于通过身份验证**。不返回任何 Cookie、令牌、用户邮箱、workspace ID、原始响应和敏感请求头。
- 多个额度窗口分别解析：`used_percent` 表示已使用，`remainingPercent = 100 - usedPercent`。期限读取 `limit_window_seconds`，不能假定一定同时存在 5 小时及每周两个窗口。
- 可能返回：`OK`、`AUTH_REQUIRED`、`RATE_LIMITED`、`SCHEMA_UNKNOWN`、`UNAVAILABLE`、`IDENTITY_UNVERIFIED`。即使 HTTP 200，只要工作区身份不匹配或无法确认，仍返回 `IDENTITY_UNVERIFIED`。诊断只包含经过脱敏的状态码和固定 reason。
- 不从网页端、普通 Sandbox 或远程服务器读取任何明文凭据；不使用 CLI 参数或环境变量传递敏感值。

## 本地受控输入

实际 Cookie 快照只允许管理员在自己 Mac 上使用明确授权的单账号数据，通过本机安全管道输入。输入 JSON 形状（**下列值全是占位符，严禁提交真实值**）：

~~~json
{
  "snapshot": {
    "origin": "https://chatgpt.com",
    "cookies": [{
      "name": "<cookie-name>", "value": "<secret>", "domain": ".chatgpt.com",
      "hostOnly": false, "secure": true, "path": "/", "storeId": "0", "session": true
    }]
  },
  "expectedIdentity": {
    "userId": "<verified-user-id>", "accountId": "<verified-workspace-id>"
  }
}
~~~

仅在本机运行：`node --test tests/ai-account-usage-probe.test.mjs`（离线模拟），随后 `node services/ai-account-usage/cli.mjs < /private/path/to/temporary-input.json`（真实网络）。输入文件若不可避免，权限设置为 0600 且置于仓库外，实验结束后安全处置；优先由受控本机进程直接经匿名管道传输，**不要将真实 Cookie 粘贴进 ChatGPT 对话或 CI**。`expectedIdentity.email` 可代替 `userId`，但 `accountId` 是最终工作区核验所需；别名不能替代身份。命令退出 0 仅表示 `OK`，其他状态退出 2。

## 已有可信存储边界

Cookie Editor 的 `trusted/account-vault.js` 将明文 Cookie 保存在仅可信 MV3 worker 能访问的 Foundation `frameworkKV` 中；`trusted/account-service.js` 不提供给 Sandbox/React 读取明文 Cookie 的能力。本轮**没有**从该 Vault 自动同步到 Node。下一阶段如需通信，必须建立单账号、按需、可撤销、可审计的可信 Native IPC 边界，不得新增第二份可持久化 Cookie 仓库，更不能将 Vault 的通用读取能力泄露给网页。

## 发布闸门与 NOT_TESTED

- G1 **LIVE_NOT_TESTED**：Mac 上用本人授权快照执行一次真实 Cookie-only 网络请求；记录脱敏 `quotaHttpStatus`、`sessionHttpStatus`、解析结果、身份比对和所用时间。若 401/403，判定 `AUTH_REQUIRED`，停止猜测；是否另行研究合法会话派生短期令牌须作为**另一条验证路径**，不能算 Cookie-only 成功。
- G2 **NOT_TESTED**：只有 G1 真正通过，才使用两个不同真实账号的独立会话测试身份隔离，并独立读回 Chrome 登录、Cookie 快照哈希不变。模拟双账号测试不替代 G2。
- G3 **NOT_IMPLEMENTED**：只有 G2 通过才落实可信 Vault→Native→Node 的单账号桥接、经过认证的 loopback 只读 HTTP 服务，以及 React 真数据展示。不得提前复制静态 HTML 模拟数据。
- 本机程序测试使用虚构 HTTP 响应，绝不代表真实 ChatGPT 端通过；官方内部额度路径没有对第三方客户端的稳定性承诺，可能随时变更。
