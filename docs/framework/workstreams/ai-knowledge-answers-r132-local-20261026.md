# AI 知识问答 R1.3.2-LOCAL · 真实入口与暂停竞态

日期：2026-10-26（Asia/Shanghai）。Owner：Codex 对话 `01a1744d-e317-7841-b185-0ebbd40c86de`。状态：WAITING（真实浏览器入口被工具策略阻塞；独立安全修复已完成）。

## 当前阶段与所有权

目标按 A→B→C→D：先完成真实 Chrome 本地固定答案闭环，再真实共享 Provider、定时消息和异常恢复；不以 Node fake Chrome/Provider 代替原生证据。

起点 main / origin/main 均为 `7e6ef79569f31aa836121d89d3f3f08c6e9372a4`。已 fetch，ahead/behind 为 0/0。工作区存在并行 UI、准入、正式包、Native MCP 和开发 Worker 修改，全部保留；本轮不提交它们。

本轮唯一写入范围：

- `examples/sidebar-tools/ai-knowledge-answers/trusted/local-test-runtime.js`
- `tests/environment/ai-knowledge-chat-r13.test.mjs`
- 本记录

依赖原模型、fixtures、Local DOM Adapter 和 Trusted Host；不改协议、Provider、知识存储、UI、正式 JSON 或安装器。现有源码文件在本轮开始时无 diff，旧 Send Fence 记录是前次完成记录；保留其同步重复发送栅栏和 UNKNOWN 不重放语义。

验证输出：`artifacts/ai-knowledge-answers-r132-local-20261026/`。不占用其他候选输出、Git 分支或 worktree。Git 提交事务在验证后单独执行。

## 实际入口与阻塞

- 43111 的现有服务 PID 68658：Python HTTP server，目录为本仓库 `examples/tasks`；未重启或换端口。
- 日常开发 watcher：`npm run dev` PID 91366，输出目录 `/Users/shopme/Documents/workspace/opendesk-browser/dist/development`。只复用，不启动第二 writer。Chrome 实际加载路径、ID、serve 连接与构建指纹尚未读回，不能仅凭进程和磁盘判定持续开发已连接。
- 使用现有 Chrome 工具成功打开 `http://127.0.0.1:43111/ai-knowledge-chat-demo.html`，标签 560068439。页面显示会话 A、客户消息 0、客服回执 0、等待 OpenDesk 监听。尚未输入客户问题，未导入或覆盖用户知识。
- 当前工具调用 `cua.createBrowserTab('chrome','chrome://extensions/', …)` 被自动审批拒绝：仅允许 `http:` / `https:`，并明确禁止间接执行、CDP、原生窗口或其他浏览器表面绕过。用户已获告知。A 阻塞在实际扩展身份核对及官方可信入口；B/C 和原生 D 未执行。

## 最小修复与验证计划

用户明确点名的安全分支：延迟 `readLibrary()`，确认发送后暂停，再释放读取；断言尚未开始的 DOM 发送为 0。另检查快速暂停/恢复不复活旧操作、暂停后自动 AI 许可撤销及迟到草稿不交付。先新增行为回归并记录 RED，再只在原 Runtime 修复，运行相关 GREEN 回归。

仅运行本次暂停/发送/自动 AI 生命周期直接相关测试，以及用户指定的 R1 模型与 Provider 消费者契约测试，检查同步去重、来源/ETag、人工审核和 UNKNOWN 不重放未退化。可信 Runtime 不属于 `tool.config.json` 的沙箱包文件闭包，本轮不更新并行正式包，不构建 Browser；原生生效仍待获授权的 Chrome 工具入口。

## 证据与剩余

### 实际修复

1. 知识回读中的确认在暂停后仍进入原 adapter.send：已用原 Runtime + fake Chrome 复现。捕获暂停代次，读取完成后核对运行状态；即使先恢复，旧确认也返回 `E_KB_TEST_PAUSED`，必须重新实际确认。同步 `sending:Set` 和 UNKNOWN 不重试保持。
2. 暂停保留自动 AI 许可、迟到读取和模型回答可在恢复后复活：清空内存许可，调用原 `onStopAI` 取消 consumer / 撤销 Provider 会话许可；正在检索/生成的记录变 STALE，迟到结果按暂停代次拒绝。固定答案许可独立保留，恢复不会恢复自动 AI。已经进入发送的操作仍读回其实际结果，不把已发送冒称取消。
3. 全 R1.3 测试中原有静态断言 `/data\.messageId/` 与真实 Demo 的 `card.dataset.messageId` 不符：分类为测试断言错误，仅修正测试正则；未改有效 Demo 业务。

新增 6 个行为回归：延迟确认后暂停、延迟确认后快速暂停/恢复、固定与自动 AI 许可独立、旧读取不得借新许可调用 AI、迟到 AI 不交付、已开始发送后暂停仍核对回执。

### 实际验证与复用

以下均为 Node/组件证据，Chrome API 与模型回复使用明确 fake；不能计作场景 A-D 的真实 PASS。原日志保留在本机独立目录，不提交临时 artifacts。

| 命令/证据 | 结果 | 证明范围 |
|---|---|---|
| `node --test --test-name-pattern='R1.3 pause:' tests/environment/ai-knowledge-chat-r13.test.mjs`，`pause-red.tap` | 原代码 0/5，5 个实际失败 | 暂停发送、旧 AI 许可与迟到结果缺陷可复现 |
| 同一命令，`pause-green.tap` | 首次修复 5/5 | 相同延迟条件下缺陷关闭 |
| `node --test tests/environment/ai-knowledge-chat-r13.test.mjs`，`runtime-green.tap` | 初次整文件 16/17 | 唯一失败为上面的旧静态断言，保留失败日志 |
| 同一命令，`runtime-final.tap` | 最终 17/17 | 包含新增第 6 个已发送回执回归、同步去重、UNKNOWN 不重试、文档/线程、人工审核 |
| `node --test tests/environment/ai-knowledge-answers-r1.test.mjs tests/environment/ai-knowledge-answers-provider-contract.test.mjs`，`model-provider.tap` | 32/32 | 真实知识模型和 fake Provider 消费者契约；来源、ETag、撤权/取消、受审知识与数字限制 |
| 两个修改文件的 `node --check`、`git diff --check` | PASS | 语法、补丁格式；本轮无 TS 修改，不启动全仓检查或构建 |

知识 fixtures 14 条 JSON/CSV 一致；37 个 lookup 案例由原模型验证。15 个 e2e 案例仍未取得真实证据，不能并入 Node PASS。没有重复运行已通过且输入未变化的 32 项契约测试。

独立原生子 agent `code-reviewer`（继承父模型/provider）只读复核 Runtime/测试 diff 和原 Host/Provider 撤权接线，含最后新增回执测试与断言修正：未发现有证据的 P0/P1/P2。复核者未跑测试或浏览器，结论 COMMENT，不是产品验收 APPROVE。

本机原始证据：`artifacts/ai-knowledge-answers-r132-local-20261026/` 的上述日志、`source-binding.json`（14 项源码/测试/fixture 的 SHA-256）、`native-blocker.json`（原始拒绝、HTTP DOM 实读与运行身份）。这是开发验证绑定，没有冻结 production 候选。

### Chrome 与包身份

实际运行的 Chrome PID 80636 对应 `/Users/shopme/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`，其 app bundle 版本 **155.0.8059.85**（读取 Info.plist，不声称读过 `chrome://version`）。Demo 标签实读 `thread_demo_01`、空 messages、`data-kb-extension-observed` 缺失；客户 messageId、客服 messageId、来源、`data-reply-to` 和 CONFIRMED 均没有真实结果。未通过手工客服输入制造假闭环。

磁盘并行正式包已为 `ai-knowledge-answers` **0.1.4**，56,960 字节，SHA-256 `c05591a1f114e9d4d9c079574290a538048e6856f8f24b6d86f5fa51f2127493`；用户提示中的 0.1.3 是旧观察。该包属于并行 owner，不由本轮构建、晋升或提交。Chrome 安装版本、官方 provenance、扩展真实加载路径/ID、开发客户端连接/指纹、Native 配对均 **NOT_TESTED**，不以磁盘包/进程代替。

### A-D 结果与下一条操作

| 场景 | 状态 | 实际证据/缺口 |
|---|---|---|
| A 固定回答真实闭环 | BLOCKED | Demo 已打开；A1 的实际扩展身份核对及 A4 官方可信入口被 URL 策略阻塞，A5-A11 尚未执行 |
| B 真实共享 AI | NOT_TESTED | A 未通过；无本轮真实模型请求、响应或 sourceIds 校验回执；不重放旧 backend 请求替代 |
| C 3 秒/4 条定时消息 | NOT_TESTED | 按顺序保留，未启动页面定时器 |
| D Chrome 异常恢复 | NOT_TESTED | 本轮暂停/许可/迟到结果和重复点击仅有 Node PASS；原生暂停/停止/撤权/documentId/ETag/未知/人工草稿均未闭环 |

下一项仍是获授权工具中的实际扩展身份核对与官方工具入口，接着保留用户数据导入演示知识，真实点击批准监听，再从客户问题跑 A。未新增 UI、知识后台、自动化框架或第三方站点适配；未使用替代表面绕过拒绝。

### 八维阶段评估（非独立产品交付评分）

可读取的旧记录实际只有七个名称；已向用户询问第八维。当前采用“证据完整性”作为本轮补列，不能冒称已恢复原第八维。以下是有明确原生缺口的工程阶段判断，不能申请 ≥95。

| 维度 | /100 | 当前依据与限制 |
|---|---:|---|
| 业务目标 | 55 | 真实 A 尚未闭合 |
| 技术可行性 | 85 | 原 Runtime 定向验证通过；共享 Provider Chrome 入口待测 |
| 架构复用 | 93 | 只修原 Runtime，复用 Adapter/Host/Provider，无新基础设施 |
| 开发成本 | 86 | 范围局部；原生阻塞仍需解除 |
| 安全 | 82 | 暂停竞态关闭，去重/UNKNOWN 保留；原生撤权/身份尚缺证据 |
| 可测试性 | 86 | 49 项定向测试通过、保留 RED/GREEN；真实 E2E 受阻 |
| 扩展性 | 78 | 仅固定本地 Demo，知识容量与固定站点合同保持 |
| 证据完整性（本轮补列） | 35 | 有原始日志与源码绑定；无本轮真实 Provider/安装/DOM 回复回执 |

算术平均 `(55+85+93+86+82+86+78+35)/8 = 75`。用户明确原第八维后再替换该维并重新计算，不恢复旧评分结论。

### 资源与 Git

本轮 Runtime/测试写入完成。现有 Demo 服务、watcher、Chrome 和所有并行文件均保留，未重启、停止或接管。只新开自己的 HTTP Demo 标签 560068439，标记 handoff 供后续在同页继续；没有占用整个 Chrome Profile。没有正式构建、晋升、重装、Native 配对或新服务。Git 仅提交本轮三文件，实际 SHA 见该记录最近提交以及本机 `commit-receipt.json`；提交后释放 Git 写入事务。

整个产品目标尚未完成；目标状态不假报 complete/paused/blocked。当前只是浏览器能力缺失，按 goal 工具的重复阻塞阈值处理，不借交接或本次局部修复改写原始目标。
