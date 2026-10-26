# AI 客服 R3.2 · 多问题与产品界面增量（2026-10-26）

## 文件 owner、最新基线与去重
- 本次由 R3.2 AI 客服业务 owner 在唯一 `main` 上处理；初始读到 `c8b332cd557caf3ba004167dad3630976b4c1fc6`。
- `9fcf243..main` 差异未触及 AI 客服业务目录；R1.3 / R2.1 / R3.1 原 Host、Provider、包、去重、回执、UNKNOWN 不重复开发。
- 本轮写入范围：`trusted/multi-intent.js`（新增纯业务路由）、`trusted/local-test-runtime.js`、`trusted/Workspace.jsx`、`trusted/workspace.css`、`preview/index.html`、`tests/environment/ai-knowledge-multi-intent-r32.test.mjs`、`app.ci.json`、`README.zh-CN.md` 和本记录。必要时仅处理与 UI 去测试化直接相关的 `src/`，必须守住正式包的来源晋升门禁。
- 共享框架 `src/`、Host、Shared Provider、安装器、发行 JSON 默认不写；不得新增第二套工作流或自动发送许可。

## 真实用户操作 → 当前行为 → 最小增量 → 证据（执行前）
| 真实操作 | 现有缺口 | 归属 | 验证目标 |
| --- | --- | --- | --- |
| 客户发「你好」 | 整串被按一个知识问题检索 | 纯路由 + Runtime | 安全问候模板、不调用 Provider、不自动发送 |
| 客户发「退款期限是多少？何时发货？可以上门安装吗？」 | 单条 lookup，无分题来源、无合成 | 纯路由 + Runtime + Workspace | 2 个可靠固定来源、1 个无依据；只生成一条待审草稿 |
| 模糊退款时长/实时订单信息 | 检索可能返回语义不确定候选 | 纯路由 | 澄清/转人工，不编造数据、无业务 API 调用 |
| 人工确认多问题草稿 | 原发送只接受单题固定或 AI 草稿 | 原 Runtime 最小扩展 | 检查 ETag、暂停、来源、原会话、可信点击、一次发送、独立 DOM 回执 |
| 打开正式界面与预览 | 测试功能与产品名称界限不够清晰 | Workspace + 原 preview | 技术详情默认折叠，测试控制保留在预览产品容器之外、提示真实本地适配范围 |

## 执行证据与遗留
- 当前记录是开始实施时的所有权声明，**不是通过声明**。
- 后续仅写经实际检查的 `SOURCE_IMPLEMENTED` / `NODE_PASS` / `PREVIEW_BROWSER_PASS` / `CHROME_PASS` / `REAL_PROVIDER_PASS` / `NOT_TESTED` / `BLOCKED`。
- 原 R3.1 [158/158 Node PASS](https://github.com/shopable-ai/opendesk-browser/actions/runs/40284151167) 不属于本轮新测试。
