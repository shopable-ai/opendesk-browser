# AI Chat Bridge R1.3 — 核心流程已跑通

当前阶段：按用户 2026-10-25 最新要求，优先完成核心功能。模式 A 和 B 已在真实 Mac Chrome for Testing / 官方 ChatGPT 中完成请求、固定 Task 执行、真实结果单次回传与 AI 续答。完整原生安全矩阵、正式发布验收、95 分、压力/故障注入和全量 CI 巡检继续延期，不自动进入下一阶段。核心结果记录于 2026-10-26。

## 当前用户操作与证据

| 操作 | 当前结果 |
|---|---|
| 建立请求并原生发送 | 严格完整文本回读通过；官方 AI 实际生成唯一请求代码块 |
| 模式 A：点击一次“执行” | 核心流程通过；真实结果作为一条新用户消息回到原请求会话，AI 完成中文总结 |
| 模式 B：仅点击一次“批准本次自动执行” | 核心流程通过；未点击“执行”；完整回复出现后自动运行、单次回传、AI 完成续答 |
| 实际网页内容 | https://httpbingo.org/html；title 合法为空，heading 为 Herman Melville - Moby-Dick，excerpt 为老铁匠 Perth 的正文片段；没有用 H1 替代 title |

| 身份 | 模式 A | 模式 B |
|---|---|---|
| 原请求与结果所在官方会话 | 6ade2663-4cf8-83ee-b56b-890d29064b94 | 6ade26c6-6438-83ee-81e9-bc20096f6e1c |
| requestId | 9472e541-72b9-416a-8c8d-5c219f3f7c01 | 4dcfecb5-9f63-4802-861a-672e40d98736 |
| runId | 443722f2-7319-4785-9edb-e5965b90c382 | 70db3573-f53b-499a-bac4-61c6470f52f0 |
| resultId | 50f4a818-d0c7-43a4-93f3-35e4c3b332a7 | 63154f7c-4e64-4852-8d04-295426cac93d |

两次官网状态均显示“真实结果已回传，官方 AI 已完成回复”。模式 B 最终原生 AX 核对为 3 条 user、3 条 assistant（开场、请求、结果），仅一条消息包含该 resultId。发送前后精确匹配及恰好增加一个 user 的既有门禁保持；没有手工伪造 assistant 请求、手动粘贴结果或二次点击重发。

固定 Task 仍为已安装 page.read.fixed@1.0.0、revision 1；sourceHash 为 c2684b24d3e6ef9b0319703661d8d7b53014df60533608bcd697361cc70a99f4，manifestHash 为 14261d871732d67c97a8fa4e398ec8d2852e025d0ff4ff02e08546ac530de505。复用原 Authority、RunHost、Durable 与资源清理合同，不修改 Task、安装身份或权限，不新增 runner、队列、Host 或授权层。普通 Task 历史 run 0754c5d4-18c3-4654-bc43-673c538c8552 不是本轮 Bridge 证据。

## 实际阻塞与最小修复

1. 官网 composer 的多段落与裸 URL 被 ProseMirror 转成 rich link，原生完整回读出现预期 575 / 实际 606 字符。请求改用单段紧凑 JSON，结果用合法 JSON 转义斜杠与连续空格；解析后的数据保持一致。没有放宽精确读回、草稿、rich、IME、接管或重复发送门禁。
2. 官网 AI 代码块现在是 div[data-code-block="true"] 中的 div[data-code-block-source="true"] > code，没有 pre，导致 E_CHAT_FORMAT。原只读 inspect 增补这一实际结构；语言标记只读取同块 action bar 的首个 div，排除复制按钮文本，仍对所有候选先检查唯一性，再核 nonce。保留引用、文件、嵌套消息、隐藏及 streaming 拒绝。原 workspace fill/verify 与共享 AI 交互入口不变。
3. 较早官网会话 6ade1e92-d298-83ec-a698-68da661798f6 刷新后连续两次显示“无法加载此 ChatGPT 对话”；当时尚未执行 Bridge。通过官网新聊天入口建立上述两个正式会话，再分别完成 A/B。官网历史加载故障未冒充产品修复。

继承修复包括 SPA 来源校验、现代 user/assistant 边界、单占位段落判空、固定可信 DOM adapter 独立归属、消费后撤权永久失效，以及未知发送结果不重放。这些已随并行 Git 同步提交 e080939b4 保存，本轮不重复提交它们。

## 当前候选与验证范围

- 专属环境：Chrome for Testing 155.0.8059.39 arm64 / macOS 26.5.1 (25F80)；应用 artifacts/ai-chat-bridge-r13/browser/Google Chrome for Testing.app；窗口“AI Chat Bridge R1.3 独立验收”。名称保留历史用语，本轮仅做核心开发验证。
- Profile：/var/folders/b3/0l3tmv5j3hs83hp8l34z89p00000gp/T/codex-cft-k00mh1fh。扩展 ID idnngljhejamejbneilnokajkbkaifel，Chrome 详情页实际加载 artifacts/ai-chat-bridge-r13/source-snapshot/dist/production。这是既有静态 production 测试候选，无 HMR；不等于正式发布验收。
- 最新实际载入且通过 A/B 的 build attempt：8b67db4c-a300-44d6-b7ce-75a4caa59e30；packageHash 为 4883893c6ea8092c75d812f27a53284a5d5b7e4f763c2f6caf3cfb601bda22b1；build passed、sourceDriftDuringBuild 为 []。原打包器、独立输出守卫 43171；未覆盖根 dist/development 或停止共享 watcher。
- 格式修复：3 个定向文件 46/46 PASS，artifacts/ai-chat-bridge-r13/plaintext-regression.log；JSON round-trip 保留 URL、双空格、换行与身份字段。
- 现代代码块修复：3 个定向文件 55/55 PASS，artifacts/ai-chat-bridge-r13/code-source-regression.log；包含 mixed legacy/modern 多请求、控制按钮伪标记、inline、旧 nonce、引用/文件/嵌套、生成中和身份版本保护。git diff --check 通过。
- 上轮现代 DOM/SPA 定向 102/102 和 check 1173 文件 PASS 可复用；本轮没有为无关 main 更新重复全量检查。两个新修复均已通过实际 A/B；静态快照只同步自有输入，不声称与并行更新后的完整 main 工作区完全相同。
- 格式修复独立只读复核无阻断（Bohr）；现代代码块独立只读复核无阻断（Laplace），两个文件语法及 9 项内存边界检查通过。LSP 不可用，没有伪报诊断通过。

原始日志、收据与失败候选保留在 artifacts/ai-chat-bridge-r13/；旧 workstream 正文留在该目录 workstream-before-core-completion.md。临时产物不提交。

## 交付边界

本轮只精确提交现代只读 parser、对应定向测试与本证据文档；保留其他 owner 的知识库、React、Send Queue、calculation relay 与 src/ui/tool-shell.js 后续改动。只在 main 工作，未创建分支、worktree 或 PR，未更改其他浏览器或日常服务。

Stop/超时/Worker 重启、实际撤权、发送丢回执、原 tab 关闭、实际 IME 及全量原生安全矩阵仍 NOT_TESTED；组件回归不替代真实验收，当前不评分。核心完成不代表原对话旧 goal 达成、暂停或迁移：本对话未创建新 goal，不能跨对话同步旧目标正文或状态。

交付提交包含本文件、现代只读 parser 与对应定向测试；提交和正常推送的实际回执见本轮最终交付。旧修复的 e080939b4 与本轮增量由 Git 历史区分。本轮不巡检全量 CI、不进入正式验收。
