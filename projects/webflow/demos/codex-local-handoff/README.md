# WebFlow → OpenDesk MCP → Codex Desktop 可行性 Demo

项目：`shopable-ai/opendesk-browser` · `projects/webflow/demos/codex-local-handoff/`

## 结论及信任边界

- **`codex://new?prompt=...` 只创建/预填未发送草稿。** 启动 URL 的成功退出码也不能证明 Codex UI 已显示该草稿。
- **真正执行任务**使用官方 `codex app-server` 的 `initialize` → `initialized` → `thread/start` → `turn/start` → `turn/completed`。本 Demo 默认 `read-only` + 不自动批准权限请求，避免对项目产生未授权修改。
- 本 Demo 的 `demo.mjs mcp` 是**隔离的本地 MCP 测试服务**，不是现有 `opendesk-mcp` 的新增正式工具。`trigger.mjs` 是**模拟可信 WebFlow Host 的本地触发器**，不是已安装 WebFlow Sandbox/App 的直接原生能力。
- 现有 OpenDesk MCP 没有 `codex.new` 或 `openURL` 工具；现有 WebFlow 的 MCP adapter 是向外暴露已安装 WebFlow Task 的**反方向**。已安装 WebFlow Page JS/Sidebar 沙箱无权直接连接本地 MCP/执行命令。不要把认证凭据塞入网页脚本，也不要把 OpenDesk HTTP 的通用 `POST /executions` 暴露给页面。

## 使用方法（仓库根目录）

**不触发本机动作的安全 Demo**：

```bash
node projects/webflow/demos/codex-local-handoff/trigger.mjs draft --prompt '请检查当前仓库的 README'
node --test projects/webflow/demos/codex-local-handoff/demo.test.mjs
```

**macOS 本机测试打开官方 Codex 草稿**：

```bash
OPEN_DESK_DEMO_ALLOW_LIVE=1 node projects/webflow/demos/codex-local-handoff/trigger.mjs draft --prompt '请检查当前仓库的 README'
```

成功响应 `OPEN_REQUESTED` 只意味着 macOS launcher 接受 URL，必须肉眼检查 Codex 是否新增对话、是否填入正文、**未自动提交**。

**真正提交一个只读 Codex 任务**（Mac 已安装 Codex CLI、已登录、可运行 `codex app-server`，替换 `/absolute/path/to/repo`）：

```bash
OPEN_DESK_DEMO_ALLOW_LIVE=1 node projects/webflow/demos/codex-local-handoff/trigger.mjs run --cwd /absolute/path/to/repo --prompt '只读分析仓库 README，回答项目一句话定位，不修改文件'
```

预期回执：`phase:TURN_TERMINAL`, `threadId`, `turnId`, `status:completed`, `threadUrl`。若提示 `E_APPROVAL_REQUIRED`，请切换官方 Codex 客户端由用户交互处理，不自动授权；若 `E_OUTCOME_UNKNOWN`，禁止盲目重试，要先查原 Codex 会话。`TURN_TERMINAL`、`status:completed` 只证明 Codex 本次 turn 完成，不等于具体开发需求已验收。CLI 配置与官方桌面实际共享会话、深链跳转行为需用本机观察确认。

## 后续正式接入：WebFlow 的实际执行入口

```text
WebFlow 已授权 Task / 可信按钮
  → Browser Framework 已有 Authority + 安装身份 + 固定任务审阅
  → 扩展可信 Background 专用 Native Broker（待集成）
  → OpenDesk MCP 固定工具（demo 中是独立 MCP 服务，未来迁移到真实服务）
  → Codex 深链草稿 或 Codex App Server 运行
  → 同一 operationId 记录状态/结果/未知副作用
  → WebFlow UI 显示真实回执
```

**不可跳过的缺口：** 当前已有扩展公开 SDK 不提供直接的 `native.codex.*` 请求，也没有发现现有 `opendesk-mcp` 可以执行深链。正式跨边界需要 framework owner 添加只允许已审阅安装版本、精确任务、可信点击、绑定进程/机器、撤权及幂等记录的适配器；不能从动态页面/沙箱直接调用本地命令或开放可用于执行任意指令的本机 HTTP。

## 最小验收矩阵

| 检查 | 通过条件 | 本 Demo 能证明 |
|---|---|---|
| URL 编码 | Unicode、特殊字符不丢失，草稿不发送 | Node 自动测试 |
| MCP 标准调用 | `initialize`、`tools/list`、`tools/call` | Node 自动测试 |
| Codex app-server | 初始化、线程、turn、完成事件、threadId | 模拟 app-server Node 自动测试 |
| 安全保护 | 非法参数拒绝、默认预览、不默认批准 | Node 自动测试 |
| Mac `codex://` | 官方 Codex 真实弹出草稿 | **NOT_TESTED**，需用户 Mac 实测 |
| Mac Codex 真正执行 | 真实 `turn/completed`、会话与工作区对得上 | **NOT_TESTED**，需用户 Mac 实测 |
| WebFlow 已安装入口 → OpenDesk MCP | Chrome Host 认证与权限、原执行状态 | **NOT_IMPLEMENTED**，需新增可信 Broker |

## 参考（官方）

- Codex Desktop URI: https://learn.chatgpt.com/docs/app/commands
- Codex App Server JSON-RPC: https://learn.chatgpt.com/docs/app-server
