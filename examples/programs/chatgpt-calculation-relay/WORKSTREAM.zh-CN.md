# AI 双对话计算接力 R1.1 · 最小真实闭环

- owner：Codex `01a1733d-fbe2-79c3-803d-f09d3b890901`，仅在 `main` 修改独立项目 `examples/programs/chatgpt-calculation-relay/` 和本记录。
- 起始 HEAD：`47b31fb283e31ec8f7cb7ffbe1c2c446daa62109`；执行期间其他 owner 推进 main，隔离输入快照为 `e4bcd1f397d06dd3170ee2f499429e864a8594d0`。这些是源码观察，不是运行候选身份。
- 目标：一次真实 Controller Run 完成官方 ChatGPT 的 A（17+25）→可信保存读回→不同新对话 B（保存的 A×3），通过后再以 19+25 复验。不得用 Mock、写死结果或旧 Send Queue 同对话测试代替。

## 当前源码

`SOURCE_IMPLEMENTED`：公开零参数 ESM Controller；`page.observe/evaluate/goto` 站点适配；A/B 身份、完成与算术独立核验；公开 `AppStorage` 写前日志和读回；导航后重绑并动态传值；不确定时保留 `unknown`，同 runId 只读、未核清旧记录阻止新发送。没有新增 Host、Scheduler、Registry 或公共 SDK。

Node 定向测试调用实际业务模块、AppStorage facade、项目编译器及实际站点函数，真实 DOM 选择器修复后 24/24 `NODE_PASS`，零失败。覆盖 42→126、44→132、历史回复隔离、错误运行标识、流式未完、额外用户轮次、存储错误、跨文档读回失败、导航身份、React 编辑器替换、点击回执丢失不重发和全局时限。项目元数据及 JS 语法另行校验通过，均不代表官网执行。

边界：这是开发草稿；Task v1 正式安装的服务权限尚不足，不宣称正式安装可用。既有 Sidebar 本地项目 Run 固定 30 秒；本项目使用原 MCP `deadlineMs:120000`，内部共享预算并预留落账时间，不修改公共超时。

## 真实入口与资源

最初在日常 Chrome 新标签发现其他测试的非空草稿，未编辑或发送。目录 CLI 成功注册过本项目但未 Run；已退出自己的 CLI。一次原生项目选择误落到历史对话链接，未发送；该操作不算项目运行。

用户随后授权创建新浏览器并指定最新 `/Users/shopme/Documents/temp/chatgpt.com-cookies.json`。已使用技能启动器创建独占 CFT 155，PID `89266`，Profile `/var/folders/b3/0l3tmv5j3hs83hp8l34z89p00000gp/T/codex-cft-_ufs1g7u`，导入 32 条同站 Cookie 后真实首页已登录、编辑器为空。未输出凭据、未复制个人 Profile、未改用户原文件。官网编辑器实际为 `form [contenteditable="true"][role="textbox"][data-composer-markdown]`，候选已补此选择器。

独占 Native 安装使用原安装器与 `OPENDESK_NATIVE_INSTANCE=relay-r11-01a1733d`；Chrome 用户脚本、Native 权限和开发者模式均通过真实设置控件批准。日常 Native 配对与其他 Profile 不改。首次 Native 授权需重载；此时并行 main 更新触发原 watcher `Unapproved WXT entry: chatgpt-fixed-bridge`，共享 `dist/development` 文件消失，导致独占实例入口 `ERR_FILE_NOT_FOUND`。该失败属于当前运行环境阻塞，尚未进入 A 发送。

不停止/覆盖 PID 36366 的原 watcher，不触碰 Send Queue owner、其 CFT PID 74622 或其他并行修改。仅对当前 main 创建非 Git worktree 的只读输入快照，以独立目录、输出与 guard 端口 43159 构建测试入口；缺失 snapshot 输入及依赖符号链接被构建来源校验拒绝时修正快照，不放宽校验。读取并行 owner 当时已修改的 `scripts/bundle-provenance.mjs` 到独立快照，SHA 与未提交来源详见 `snapshot.json`，未改其原文件；这不声称整个 main 已提交或可构建。

独立构建最终 `FAILED/BLOCKED`：`Trusted Reading TOC source changed; review and re-pin before fixed build: examples/sidebar-tools/reading-toc/trusted/locales.generated.js`。本轮不修改 Reading TOC、公共来源锁或放宽校验；没有可用的新扩展候选，不重复相同输入的构建。该失败是本轮真实 Run 入场的环境阻塞，不是 A/B 算术错误。MCP 临时进程已以 EOF 结束，未提交任何 Run；专用登录 CFT 与启动器保留，临时 Native 配对仅属于该 Profile，待入口恢复可继续，不宣称 Native handshake PASS。

本机忽略证据目录：`artifacts/chatgpt-relay-r11-01a1733d/`。源码与 Node 证据不能替代原 RunHost 的 sourceHash/runId/resultId，也不能替代实际官网用户/助手消息。

## 待完成的核心链

真实 A 发送 → A 完成且存储读回 → B 新对话 → B 动态发送 → B 结果保存，目前均 `NOT_TESTED`；原运行入口 `BLOCKED`。没有实际观察到 A=42 或 B=126，不宣称 `CHROME_PASS`。接力运行的 sourceHash/runId/resultId 均无；项目文件 SHA 不能替代它们。随后仍需第二轮 44→132。

下一条用户操作：原 owner 恢复可加载的当前扩展输出后，在已登录的独占空白首页，通过现有 MCP 的一次 120 秒 Run 发送 A；按第一个真实失败最小修复，未知发送仅只读对账。禁止恢复旧全面验收或再造运行入口。

完整安装矩阵、定时、DAG、UI 重构、跨模型、评分与压力测试均延期。本最小闭环通过后即结束当前阶段。

## 第二次 goal turn 的阻塞复核

上轮属于进展：实现并验证候选、取得真实独占登录状态，定位运行入口阻塞。本轮实读 main 仍为 `e4bcd1f397d06dd3170ee2f499429e864a8594d0`，`dist/development/manifest.json` 与 `sidepanel.html` 仍缺失；`ps` 确认原 watcher PID 36366 和本任务 CFT PID 89266 均存活。读取当前来源锁仍为旧 Reading TOC locale blob，未出现可重建的新输入。未重复构建/测试，未发送 A，未把观察超时当成 owner 已停止。相同运行入口阻塞连续两轮，goal 仍保持 active，尚未满足三轮 blocked 审计阈值；不恢复旧验收范围。

## 第三次 goal turn 的阻塞审计

2026-10-25 22:10 +08:00 实读最新 main 为 `9d4a082c205c94249d19bbde8f9e1fd11cd77b75`。共享入口两个文件仍缺失；原 watcher 与专用 CFT 均经进程查询确认存活。Reading TOC locale 期望 blob 仍为 `0484bd67fadb23a88c6a7164435d5bf90acd8295`，实际为 `ffdfc72c479bb16ef27e60eda26255b43870e4ae`。没有新的可用输出，也没有使独立构建可继续的相关输入变化，因此未因无关 main 更新重复构建。

同一运行入口阻塞已连续三轮；当前无法在保护并行 owner、原 watcher 与来源校验的前提下继续真实发送，按 goal 工具合同转为 `blocked`，不是完成或暂停。完整目标仍是两轮真实 A→B，不缩减为源码/Node 通过。无接力 runId/resultId/sourceHash，官网发送仍 `NOT_TESTED`。无凭据审计保存在 `artifacts/chatgpt-relay-r11-01a1733d/blocked-audit-3.json`；下次恢复时重新核对实际入口和专用 Profile，不能把当前进程观察当成未来保证。
