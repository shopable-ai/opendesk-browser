# OpenDesk Browser · AI 知识问答 R1.3 · 本地真实 DOM 测试闭环

> 2026-10-26。此记录只陈述当前 main 源码与本轮能核对的证据；「源码已接线」「V8 本地模拟通过」「Node 定向测试」「真实 Provider」「原生 Chrome 扩展」不能相互替代。所有规则属于虚构的演示店铺，不代表真实商家政策。

## 最高产品目标和范围

完整目标：独立的知识问答扩展通过 OpenDesk 现有可信 Host 和 Shared AI Provider，根据用户维护的知识回答客户问题，获得授权后可在目标网站真正发送回复。本轮只验**本地 HTTP 模拟客服网站 → 正式可信消费者 → 本地页面 DOM 回执**，不发布第三方客服网站、不新建第二套 Host/Provider、不开发完整知识后台。

### 已有基线（先前 main 已具备）

- `src/model.js`：严格 JSON/CSV、20 条/8192 字节、scope、精确同义匹配及 Top K 词法检索。
- `trusted/ai-request.js`：受审来源、内容与数字约束、Shared AI 消费者，以及非确定答案始终 `REVIEW_REQUIRED`。
- `trusted/host.js`、`src/ui/react/main.tsx`、`src/ui/tool-shell.js`：既有可信 React Root / 单消费者、官方包 admission、真实存储 ETag、真实 Provider 配置与授权。不得把这些标为本轮从零新建。
- R2 并行源码已经将沙箱管理 UI 改为问答/知识/编辑切换，并建立来源链接的 `preview/index.html`。本轮没有覆盖 R2 UI 源文件。
- 当前 `sample-knowledge.json` 使用其他对话 R2 新版政策。R1.3 将 CSV 和所有测试场景的来源 ID 与这份 JSON 对齐，避免跨对话覆盖。

### 本轮新增源码

- `fixtures/sample-knowledge.json`：14 条本地虚构规则，包含一条已停用知识；`sample-knowledge.csv` 是相同 14 条记录。
- `fixtures/answer-test-cases.json`：52 例，其中 `stage=lookup` 的 37 例可用正式 `model.lookup` 自动判定；`stage=e2e` 15 例需真实环境，不能算单测 PASS。
- `examples/tasks/ai-knowledge-chat-demo.{html,js,css}`：两个真实 thread、客户消息 DOM、客服草稿真实按钮、消息 ID/归属/来源/时间、3/6/10 秒有界定时注入、暂停/停止/重置/事件日志。网页自身不调用知识模型，不自动插入伪客服回答。
- `trusted/local-test-adapter.js`：Side Panel 的已存在 `currentPageTarget` 绑定窗口/标签页/`documentId`；Chrome `scripting.executeScript` 在确切文档读取 DOM，验证固定 `127.0.0.1:43111` Origin 与 `/ai-knowledge-chat-demo.html` 路径；回复通过实际 DOM 文本框/发送按钮，随后独立读回。
- `trusted/local-test-runtime.js`：850ms DOM 查询、入站 ID 去重、最多 20 条和 10 分钟，保守结果状态，ETag/会话/Provider 代数校验。不可读回标 `UNKNOWN`，不得重发。
- 原 `trusted/host.js` 接入测试运行时；原 `Workspace.jsx` 侧栏首屏显示测试状态、已读消息/来源/候选/审核；原数据管理仍在折叠区域。原 `src/ui/tool-shell.js` 只传已有 `chrome` 与 `currentPageTarget`。
- `src/ui/conversation/provider-consumer.js` 仅对 **`consumerId='knowledge'` + 精确本地 Origin + 真实 UI 批准的 `documentId` + ETag + Provider 代数 + 10 分钟内存授权** 提供 `beginKnowledgeTestApproval` / `revokeKnowledgeTest`。批准时同步启动 Chrome Provider 权限请求；后续定时推理仅通过 `permissions.contains`，绝不伪造 `event.isTrusted`。其他消费者仍需原真实点击。
- 原 `trusted/ai-request.js` 只转交 opaque grant 给同一个共享消费者。AI 草稿仍 `REVIEW_REQUIRED`，自动模式从不发送 AI 草稿。
- 新增 `tests/environment/ai-knowledge-chat-r13.test.mjs`（包含明确标注 **FAKE Chrome/Provider** 的 Node 场景；待实际 Node 执行）。

## 本机实际操作

务必使用唯一 `main`，不要清理其他 Agent 的工作区、创建新分支/Worktree/PR 或强推。先确认 `AGENTS.md`、`git status --short`、`git branch --show-current` 与最新 `origin/main`，保留并行修改。

1. **准备测试知识**：在已安装的官方 `ai-knowledge-answers` 可信 Side Panel 中展开「知识数据与导入」→ 沙箱「知识」→ 导入/导出；选择 `examples/sidebar-tools/ai-knowledge-answers/fixtures/sample-knowledge.json`，先预览，再确认保存；若数据已有重要记录，先备份并选择合并而非覆盖。刷新知识，确认 14 条、ETag 和 `qa_demo_refund`。CSV 应导入相同内容。
2. **启动模拟网站**：先运行 `lsof -nP -iTCP:43111 -sTCP:LISTEN`，若有别的实例先核对所有者而非强杀；没有占用再在仓库根执行 `python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks`。浏览器访问 <http://127.0.0.1:43111/ai-knowledge-chat-demo.html>。只有 HTTP 固定路径受支持，不使用 `file://`、通配第三方网页或带端口的 Chrome Match Pattern。
3. **批准监听**：在**同一 Chrome 窗口**打开已经安装并通过官方 admission 的知识问答工具。可选勾选「允许自动发送固定答案（仅本地）」；点击「批准并监听本地测试页」。观察 Side Panel 显示会话 A、知识 14 条。该批准**只允许监听**及可选固定回答发送，不授予 AI 模型权限。
4. **固定回路**：在网页客户框输入「几天内可以退款」，页面生成 `data-message-id`/`data-thread-id` DOM；Sidebar 应显示来源 `qa_demo_refund`、`ANSWERED_FIXED`。默认手工按「确认发送固定答案」；若步骤 3 明确选了自动固定答复则自动填入/点击。检查网页新增客服气泡，其 `data-reply-to` 与原客户 ID 一致，Sidebar 应为 `CONFIRMED`。
5. **非精确 RAG**：网页客户输入「退款需要几天」，预期 `RETRIEVED_ONLY`，来源 `qa_demo_refund`。可单条点击「使用共享 AI 生成草稿」，在显示模型+接收端点及命中片段后勾选知识披露，点击真实 AI 发送。成功时生成 `REVIEW_REQUIRED`；用户必须逐条审核后点击「人工确认发送」，再读回真实 DOM。不要声称任意模型都能保证正确输出。
6. **定时触发 AI**：如需对定时到达的非精确问题调用共享 Provider，在 Side Panel 活动测试会话里**另外点击**「批准本地自动 AI 草稿生成」，允许当前 Provider 的 Chrome 站点或 Native 权限。网页选择 3/6/10 秒、4/8/12/20 条并按开始。网页只写客户 DOM，Side Panel 的原运行时读取、检索、调用已授权 Provider。固定答复若另获第三项批准可直接发送；非精确 AI 结果仍逐条审核。
7. **暂停/停止**：网页「暂停/停止」控制客户消息定时器；Side Panel「暂停/停止测试」控制回答监听和授权。切换 thread、导航、改变知识、撤销 Provider 权限、关闭已安装工具等事件均应停止旧运行并保守丢弃迟到结果。网页事件日志位于左侧折叠「网页事件记录」。
8. **同源管理 UI 预览**：项目原 `preview/index.html` 通过 `../src/index.html`、`../src/main.js`、`../src/model.js` 加载真正的沙箱 UI；另检查 43112 端口占用，空闲后 `python3 -m http.server 43112 --bind 127.0.0.1 --directory examples/sidebar-tools/ai-knowledge-answers`，打开 <http://127.0.0.1:43112/preview/>。**它使用模拟存储，不等于 Trusted Provider、正式安装或真实 DOM 发送**。

## 真实证据级别

| 范围 | 当前可声明状态 | 不得推论 |
| --- | --- | --- |
| 当前 main `model.lookup` + R2 JSON | 独立 V8 执行 37/37 lookup 期望一致；CSV 14/14 与 JSON 相同 | 不代表安装或模型成功 |
| Chrome API / DOM adapter 逻辑 | 独立 V8 **假 Chrome** 模拟：固定答案→回执状态 `CONFIRMED`，非精确问题→审核状态 `REVIEW_REQUIRED`，未经确认发送被拒绝 | 不代表真实浏览器按钮点击 |
| 定向 `node --test` | 测试文件已提交，当前无 Mac 仓库运行环境；`NOT_TESTED` | 不得宣称 Node CI PASS |
| 真实 Provider（Native / HTTPS） | 已连接 Shared Consumer，内存会话许可与代码路径可审计；`NOT_TESTED` | 不得虚构模型输出/请求日志 |
| 打包、官方安装 admission | 源码已有官方身份门禁，改动后的完整构建/安装未跑；`NOT_TESTED` | 不得以旧版安装或静态预览替代 |
| Mac Chrome：网页输入/自动生成/实际按钮/DOM 回执 | `NOT_TESTED` | 不得以假 DOM 状态计真实 E2E |
| 15 个 `stage=e2e` 场景 | 等待 Chrome + Provider + 撤权/导航/冲突实测，均 `NOT_TESTED` | 不得计入已通过项 |

### 建议本地 Codex 直接执行（仅在完成源码核对后）

```text
GOAL：OpenDesk Browser · AI 知识问答 R1.3 本地真实闭环验收和最小修复。
仓库 /Users/shopme/Documents/workspace/opendesk-browser，唯一 main，LATEST HEAD。
先核对 AGENTS.md / owner / git status / commit SHA；不要回退、覆盖其他 Agent 变更，不建分支/Worktree/PR，不强推。
不要重新开发 Provider、Host、React Root、R2 知识后台或 R2 preview。
先运行：
  node --test tests/environment/ai-knowledge-chat-r13.test.mjs
  node --test tests/environment/ai-knowledge-answers-r1.test.mjs tests/environment/ai-knowledge-answers-provider-contract.test.mjs
严格区分：fake Chrome/fake Provider、真实共享 Provider、真实安装 Chrome。
校验 14 条 JSON 与 CSV 相同、52 场景的 stage 分组、8192 字节限制。
检查 build、官方已安装 identity/admission；在 Mac Chrome 用 43111 静态测试网页运行：
客户手工 DOM → Sidebar 唯一客户 ID → model.lookup/真实来源 → fixed 人工点击/批准自动 →
真实网站客服输入框+按钮 → 同 ID data-reply-to DOM 回执。
同一授权会话内检查手动真实 AI（含接收方、权限）和定时真实 AI，确保非精确 AI 草稿必须人工审核，绝不默许自动发送。
测试取消、暂停、并发新消息、身份切换、知识 ETag 变化、Provider 撤权、已有人工草稿、重复 ID、发送结果未知不重发。
失败只做最小修复（先改真实业务代码，再补精确测试），按现有 main 正常提交推送。无法实际访问或通过的项目统一 NOT_TESTED/BLOCKED，绝不写假 PASS。
最终按 8 个质量维度独立评分和算术平均，并给出 Chrome DevTools DOM 证据、Provider 实际调用证据、构建/安装回执、测试计数、提交 SHA。
```

## 未完成和风险

1. 尚无真实 Provider 的发送回执、授权弹窗截图或模型账单/调用证据；定时调用机制只是源码接线。
2. 尚未在 Mac Chrome 验证真实安装 admission、`chrome.scripting.executeScript` 的文档绑定与实际 Site DOM 按钮 click/读回。
3. `stage=e2e` 场景 15 例待执行；不要把纯 DOM 假实现或 UI 动画当成功。
4. R2 管理界面并行演进；继续复用 R2 源码与预览，不另造知识 CRUD。
5. ETag、Provider 代数、页面文档在真实切换中的竞态需在本地 Codex 测试，按失效即拒绝处理。

以真实 Chrome + 真实 Provider 证据满足场景 A-D 后，才能考虑用户要求的独立专家评分 ≥95，而非当前根据源码主观评分达到 95。
