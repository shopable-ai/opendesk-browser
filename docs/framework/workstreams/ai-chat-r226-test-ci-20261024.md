# OpenDesk Browser AI Chat R2.2.6 — TEST_BUG 与 CI 业务验证接续（2026-10-24）

**Owner / write scope:** 本次 AI Chat R2.2.6 核验；仅写 `tests/environment/opendesk-conversation-r14-dock.test.mjs`、`.github/workflows/official-tools-ai-r13.yml`、`.github/workflows/shared-ai-chat-r22.yml` 与本独立记录。不涉及任何产品权限、ETag、React 运行代码、Host、SDK、RunHost 或 Controller 存储契约；不会启动 Mac Chrome/Profile、watcher、原生端口或全量构建。

**目标不变：** Bookmark、Prompt Shortcuts、「我的」、Workflow 四页的 AI Chat 必须经原 Service/Host/RunHost 真执行，独立读回业务身份和版本，刷新原页面，不靠 UI 文案或 Node fixture 冒充真实产品 PASS。

**远端集成基准：** main@`5fd63a5f75cc7e8f7ac7eec301a553f64c1be5c0` / tree `94d6a744fad7ce337c545f414359eb1c22960a7a`；读取目标文件 blob SHA、确认与其他 Agent 文件不冲突、非强制 fast-forward 且对原 HEAD 校验。前一个只读阶段在 `d020476` 遇到并行 HEAD 推进并自动拒绝更新，已恢复到此新 main；保留所有他人的改动。

**第一处真实故障 / TEST_BUG：** [Bookmark AI CI 40018229281](https://github.com/shopable-ai/opendesk-browser/actions/runs/40018229281) 和 [Shared AI CI 40018229004](https://github.com/shopable-ai/opendesk-browser/actions/runs/40018229004)，SHA `ef72a7c995eb340c21f887217038b116b2d68ed6`，旧 `r14-dock` 测试有 2 个过时文本断言。实际上 Chat 按钮仍在 ToolHost 主标题栏，但卸载已移进同一 ToolHost 的“更多”菜单；且仅 `writeUnknown` 的已发出/结果未知写入需要恢复审阅。新断言核对真实当前源码位置、入口唯一性和 UNKNOWN 保护，不改变业务语义或 UI。

**Prompt 恢复验证缺口：** [Official Tools AI CI 40018228965](https://github.com/shopable-ai/opendesk-browser/actions/runs/40018228965) Prompt 业务源码测试 26/26 PASS，但原 workflow 没有执行 `opendesk-conversation-r17-prompt-recovery.test.mjs`。本次把恢复文件加入原有 Node 命令与 push paths，不放宽 Web Locks、ETag、私密正文或 UNKNOWN 防护。

**其他历史 CI 与适用范围：** 相同旧候选的 Bookmark Agent 69/69、My Task 28/28、Workflow React 定向 57/57 PASS；整个 workflow 仍有其他 fail（官方工具 catalog、Reading TOC 固定源码 pin、Workflow focus 组件）。这些只作为已变更输入的风险对照；本次新 commit 的 Node/CI 必须按新 SHA 核查，不能宣称自动 PASS。

**执行证据等级：** 已读取真实 GitHub 文件、失败原始 Job 日志与固定 SHA，对正则及现有生产源码做静态前置匹配；本会话无法访问用户 Mac 工作区执行其两组 `node --test` 或实际安装版 Chrome/Native，所以新 commit 的 `NODE_PASS`、`CHROME_PASS`、`NATIVE_PASS` 均不得声明。四页最终业务闭环仍 `NOT_TESTED`。

**后续首要任务：** 在新 main 真运行用户指定的两组 Node 指令和 Workflow React 定向测试，提取首个实质性 PRODUCT_BUG 才修改业务源码；核对新 SHA 的 Actions 具体 Job/Step 状态（QUEUED 不等于 PASS）；用现有 Mac 开发环境/原生验收独立读回 Folder ID + parentId、Prompt full record/ETag、Task RunId/generation/CAS、Workflow Source Hash + Revision/新价格及原页面刷新。安全拒绝与 UNKNOWN 不能自动重试。

## 同一候选 d9a4594b43af 的首次 CI 回读

- [Bookmark run 40068056045](https://github.com/shopable-ai/opendesk-browser/actions/runs/40068056045) 首个 Node 合并步骤：330/331 PASS，剩余失败在 R1.4 旧断言 `onClick={submit}`；[Shared AI run 40068056059](https://github.com/shopable-ai/opendesk-browser/actions/runs/40068056059) 183/184 PASS，同一个断言。正式 JSX 使用原生表单 `onSubmit={submit}`、发送按钮 `type="submit"`，且同步 `submit(event)` → `onSend(event)`；故属 `TEST_BUG`，不能添加独立按钮 click dispatcher 破坏 Enter/IME/授权时机。
- 本次只把旧源形态断言替换为表单 onSubmit、单一 submit 函数和原生 button type 的三项产品真实结构检查，保留 `onSend(event)`、`onStop(event)` 及撤权/UNKNOWN 断言。
- [Official Tools AI run 40068055996](https://github.com/shopable-ai/opendesk-browser/actions/runs/40068055996) 新纳入的 Prompt 业务＋恢复测试首次实跑 **40/40 PASS**；后续 Host regression 133/133 PASS；overall workflow 因原 Catalog 3 项失败并不视为全局 CI_PASS。
- 当前仍然没有用户 Mac 的真实仓库 Node、已安装 Chrome/Native、实际四业务对象独立读回，全部按证据分级。
