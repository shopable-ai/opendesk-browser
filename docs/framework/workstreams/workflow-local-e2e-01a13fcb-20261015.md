# Workflow 本地真实 E2E 验收（2026-10-15）

- Owner：Codex App chat `01a13fcb-69fc-71b3-a072-bbbf54699a5d`；ACTIVE。
- 目标：真实一次 Send 填写、搜索及只读续聊、固定 Revision AI-Off Run×2，并保留逐次 Durable Result。
- Browser：仅 `main`；开始 `7c8438abd`，干净工作区安全 fast-forward 至 `2a5b02309`。用户已授权本任务正常提交和推送。
- Go：实际 `master`，`fd59bc8c`；fetch 后落后 11 提交，已有他人 bridge/native UI 修改，保留，先只读诊断，不覆盖。
- 写入范围：本记录及 `docs/framework/workstreams/evidence/workflow-local-e2e-01a13fcb/`。如真实失败证明需要源码修复，先追加精确文件责任范围再编辑；不抢占既有账本。
- 资源：现有日常 Chrome 的正式测试页、现有 Side Panel；端口 43111 的服务已存在，复用不停止。两个 Schedule CFT 是其他 owner，完全不操作。未发现 Browser dev watcher；不启动第二 writer。
- 扩展：`ccfcjegpkdlgbclopjmadlcjedelidmf`；Chrome Secure Preferences 加载路径为本仓库 `dist/development`；当前为静态开发包，dev client 连接未证实。
- Native：manifest allowed_origin 与实际 ID 一致；`/Applications/OpenDesk.app/Contents/MacOS/opendesk browser doctor` 返回 `E_NATIVE_NOT_READY`，socket 存在但未认证连接。产品 Native Codex 同样显示未连接，真实模型调用尚未发生。
- 前置阅读：两仓 AGENTS、Workflow 架构第 13 节、testing-guide 跨会话复用、parallel-development；已有 conversation-direct 账本由只读 subagent 核对。
- 证据级别：本轮真实 Workflow 业务验收尚未通过；历史组件测试不提升为本轮真实 PASS；production/F3/ZIP 不在当前证据中。

## 当前最小阻塞

先恢复同 ID Native 认证连接及当前源码的持续开发加载，再执行任务；不启用 HTTP Provider、不直接改 Native 配对配置、不改 AdBlock trusted pin。

## 22:15 环境恢复与首次 Send（尚未通过）

- 唯一 dev watcher PID 8026，guard 43120 / serve 43119，持续写入原 `dist/development`，未另起 build/dev。
- 日常 Native 连接曾被同用户无监听的陈旧 socket 阻挡；已保留原 inode/备份证据后恢复连接，未改配对配置。日常 Codex 0.162.1 被现有安全版本门拒绝，未放宽。
- 当前独占验收资源：`.runtime/workflow-local-e2e-01a13fcb/Google Chrome for Testing.app`，主进程 12922，专属临时 Profile，使用原 `dist/development` 和相同 extension ID。其他 CFT 不操作。
- 按官方 setup 建立 named Native instance `wf-e2e-01a13fcb`；用户已手动允许 Chrome nativeMessaging，开发者模式与用户脚本权限已在专属 Profile 正常开启。doctor 实际 connected:true。
- 任务限定继承官方 audited Codex 0.159.2 及已有隔离 ChatGPT 登录目录，未修改全局 Codex 配置/凭据；产品界面实际显示 Codex 已就绪。
- 首次真实 Send 创建 Codex thread `01a13fe4-9d0c-7fc0-9386-cb9c22681332`，rollout 22:08:32 已进入用户回合，随后产品报结果未知且未重发。未取得网页观察/合法 Proposal/RunHost 回执，DOM 保持旧的预填内容、搜索次数 0，因此填写尚未 PASS。
- 正在只读核对 Native AI 回合与事件回程；不以 CLI doctor 的 READY_FOR_TURN 代替真实模型验收。

## 2026-10-15 实测修复所有权更新

负责人：本会话 01a13fcb。唯一源码写入：`src/ui/workflow/workflow-view.js`；不修改公开协议、RunHost、Controller、SDK 或 Go。真实复现：撤销 fixture 网站权限并拒绝再授权后，输出显示 E_PERMISSION/未运行，但技术详情仍展示上一轮 e0fcc202 的身份。最小修复：新执行进入 running 时清空旧技术详情，与已有“尚无本次持久结果”同步。通过条件：先有真实成功/停止回执，再次授权失败时不残留旧 runId；当前成功回执仍正常呈现。使用现有 watcher 更新；无第二构建。定向复用 workflow-ui-states/direct-execution，真实 Chrome 重验。

### 构建阻塞的最小扩围

实际证据：已提交的 `5d630f7a0` 在 `src/framework/sdk/browser-schemas.js` 两个正则字符串中重复插入旧文件后缀；Node --check 与唯一 watcher 同时报告 line 56 未终止字符串。扩围只恢复该文件两个正则字面量，不改 API、权限、Host、Provider 或现有 managed proxy 字段。写入前 git diff/status 为空，保持其他路径改动。属于用户“具体证据证明其他模块有问题才扩大范围”的阻塞修复；定向 schema/contract 验证后沿现有 watcher 重测。

## 用户要求跨对话续接

已将完整已完成事实、证据边界、现有资源、两个未提交源码 diff、构建阻塞和下一步写入 `workflow-local-e2e-01a13fcb-handoff-20261015.md`。新对话先读取该文件及 evidence/handoff-checkpoint.json；不重跑已完成真实流程。当前仍有网站权限原生弹窗，用户已明确授权 Agent 直接操作。

## 同日续接：最小恢复与受影响重验

负责人：当前续接 Codex App 会话；承接原 owner 的两个未提交源码文件，不改其他 Agent 的文件。`src/framework/sdk/browser-schemas.js` 仅补回 Registry 已有的三个 `browser.proxy.managed` Schema 映射；`src/ui/workflow/workflow-view.js` 保留新执行清空技术身份的一行修复。共用合同无新增 API/权限。通过条件：受影响 Schema/Workflow Node 测试通过、原 watcher 成功发布、专属 CFT 新构建连接后真实授权拒绝不残留旧身份。唯一 watcher PID8026、serve43119/guard43120、CFT12922、fixture43111 与 Native instance `wf-e2e-01a13fcb` 均复用。官方工具能力失败交由只读子 Agent 定位，禁止放宽合同或改 AdBlock Trusted SHA pin。历史成功证据按原边界复用；production/F3/ZIP 无新证据仍 NOT_TESTED。

定向 Schema 测试恢复导入后暴露两处历史固定计数：生成 catalog 已由既有 proxy 工作更新为 approved75/public73/native映射93，但 `tests/environment/browser-sdk-r11-generated-catalog.test.mjs` 与 `tests/environment/browser-sdk-r116-mapping.test.mjs` 仍断言72/70/90。本会话承接这两个无他人 diff 的测试文件，仅同步预期计数；不删断言、不降低身份/权限验证。

发布阻塞扩围（只读诊断已证实）：`src/sidebar-tools/official-catalog.js` 的 hasSdk 缺少既有 `browser.proxy.managed`，导致 ai-vip-share@1.3.0 发行描述误用 v1 校验。承接此文件和 `tests/environment/official-tools-catalog-r45.test.mjs` 的最小回归，沿用 v2 白名单并验证未知能力拒绝。旧 watcher 日志与新进程失败栈不同，待通过现有 WXT 配置重载读入新合同；不另起 dev/build，不改 AdBlock pin。共享 `wxt.config.mjs` 只触发 mtime 通知，不改他人内容。

## 续接实测结果与提交边界（2026-10-15 23:40 CST）

本段取代上文的“ACTIVE / 待修复”状态，但不改写历史记录。源码修复及定向 UI 复测已完成；完整新候选的真实 Chrome 应用仍受安全栅栏阻挡，未正式关闭完整 E2E / production 验收。

并行 Git 集成会话已将本任务六个源码/测试文件保存到 `1cd236cf8461de2765f3a3fac57a806f3f36fa77`，并通过 `6629e1b4b0a62c901555e0f51f8ae20c51ad0c98` 合入远端恢复：三个 Proxy Schema 使用上游唯一 ops 表顺序；官方目录使用上游已批准 Browser SDK V2 能力分类，保留未知能力拒绝。`3b621c6f6edd36e121c3bfeb48d1e05958b09bb3` 已正常推送。本续接不重复提交源码，只精确提交本记录、原续接材料及本任务证据。

验证复用与新增：

- Schema / Workflow 受影响测试 48/48 PASS；官方目录 18/18 PASS。首次失败记录一并保留：过期固定计数和旧“禁止正式包”断言分别修正为当前合同，未删除权限/身份断言。
- 合并后的 Schema 顺序和通用 V2 分类复用 Git 集成会话的 67 项定向 PASS，详见 `git-sync-20261015-01a13f27.md`。Workflow UI、direct-execution、observation、compiler 的相关源码 SHA 与已有定向证据一致，不因无关 HEAD 更新重跑。
- 最新 `check-source` PASS：771 个源/测试/构建文件；原始日志为 `recovery-check-source-final.log`。只读子 Agent 审查当前六文件未发现新增确切问题。
- 原 watcher PID 8026 在并行 merge 期间读到临时冲突标记及缓存的旧 catalog；最终源码无标记后，仅触发原 `wxt.config.mjs` 配置重读，未修改该文件内容、未启动第二 writer。最新发布指纹 `046658be8d488c442d7d350ccfe587684082d0cc2652b80ef2e59baa20b5fab8`，112 个声明文件 SHA 全匹配；见 `continuation-candidate.json` 和提取的 watcher 日志。
- CFT PID 12922、原 Profile、`dist/development`、扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf` 未更换。命名 Native doctor 当前 `connected:true`，manifest `allowed_origins`、doctor ID 与实际 Secure Preferences 加载路径匹配；仅读取配对信息，未改 Native 配置。

| 实际功能 / 负路径 | 证据结果 | 边界 / 剩余任务 |
| --- | --- | --- |
| 一次 Send 中文填写并同次精确读回 | REUSED_PASS | 原 `real-chrome-success.json`；无本轮 AI 重发 |
| OpenDesk 单次搜索、续聊只提取 | REUSED_PASS | 搜索次数保持 1，复用原真实证据 |
| 固定 r1、关闭 AI、无密钥 Provider 后独立 Run×2 | REUSED_PASS | 原独立 runId/resultId、同源 SHA、Worker released；不提升为新完整候选 |
| Stop、执行中刷新、撤权拒绝、unknown 不重放 | REUSED_PASS | 原 `negative-ui-evidence.json`；unknown 表示保守拒绝，不代表请求成功 |
| 已有成功身份 → 下一次授权失败 → 清空旧身份 | TARGETED_CHROME_PASS | 新成功 Run `3c9e78e5-7705-49b9-9a7e-b3ec9bbf292d`，r1/SHA 698ed06a…、中文值匹配；随后真实 Deny，E_PERMISSION/未运行，旧 ID 消失，输入恢复预填且提交次数 0 |
| 原权限弹窗的待处理 Run | OBSERVED_FAILURE | 正常 Allow 后观察到 E_TIMEOUT / fenced 终态，未盲目再点 Run；不计成功 |
| 最新磁盘构建、开发连接及 Native 配对 | PASS（分层） | 磁盘 046658be…、112 SHA 匹配；浏览器开发连接仍报告已应用 f19ff445… |
| 同一最新完整 Chrome 候选 | NOT_TESTED / BLOCKED_SAFE_UPDATE | 原生 UI 明确“任务、原生请求或未知结果仍未释放，自动刷新已延后”；未强制重载、清账本或绕过安全栅栏 |
| 执行中 Native 断连、Worker 不释放、晚到 AI/RunHost ack、保存字节/SHA 篡改 | NOT_TESTED | 本轮没有安全且真实的故障注入证据；未伪造回执/DOM/事件 |
| production / 独立最终 F3 / ZIP 安装 | NOT_TESTED | 本轮只用持续开发环境，无同候选正式证据 |

新 Run 技术详情的 AX 文本截断在 Revision 内，未捕获新 resultId / retirement 全字段；其成功值只作为清空旧身份回归的前置，不替代原 Run×2 完整身份/资源释放证据。原生权限已正常恢复，fixture 预填值、提交次数 0；停留在 Workflow 的 E_PERMISSION 结果，无自动重放。

证据提交核对：仅暂存本任务 37 个记录/证据文件，逐个核对暂存 blob 与文件字节、JSON 可读性及证据索引 SHA。`git diff --cached --check` 的空白告警仅来自保留的失败 TAP 与 watcher 输出尾部空格；不改写这些原始/提取输出，排除这两个日志后的差异检查通过。

`permission-retest-before/denied` 的 AX 与 PNG 是实际界面原始采集，`continuation-dev-service.ax.txt/png` 是实际旧应用指纹及安全栅栏。磁盘源码/产物、局部工具页实测、旧 SW 应用基线三者分别记录，不声称完整新构建 Chrome PASS。后续只能通过既有 Authority/RunHost 正常对账与资源释放后应用同候选；不重建基础设施，不把未关闭的安全状态强改为 idle。
