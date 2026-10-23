# Shared AI Chat R2.3.1-LOCAL · 增量验证记录

日期：2026-10-24（Asia/Shanghai）。Owner：接收对话 `01a16a53-9295-74c3-b6f9-35cee9c26b69`。

## 结论与阶段

当前修复已提交，独立本机测试候选已通过原验证和安装链；「我的」成功运行、跨 Tab 原 RunHost Stop 与历史结果保留已实测。整体真实产品验收尚未通过，独立专家总分 **NOT_SCORED**。按用户最新要求采用增量测试：未改变的操作复用原证据，不重跑历史全量测试、完整尺寸矩阵或 production 构建。旧对话目标上次实读为 paused；本记录不恢复、迁移或完成旧目标。

唯一 ToolShell、`src/ui/react` Root、共享 Provider Runtime、独立 Consumer Adapter 与原 Authority / Compiler / RunHost 保留。共享来源不授予业务权限。

## 本轮修复及独立复审

- `updateSettings()` 返回脱敏公开设置；API Key 继续只归可信 Runtime 内存。
- MyTaskAgent 保留本轮模型授权至确认结束，每次业务写入前复查。TaskWorkbench 在异步文档、版本、安装读取后、`host.start` 紧前重查授权、signal 和 disposed。
- AI Stop 等待所属取消 Promise，期间阻止重发，保留 Native UNKNOWN。AI Stop 不调用 RunHost Stop，也不撤销已提交业务。
- Workflow 来源菜单的高级设置关闭后返回稳定 trigger，Tab 离开菜单会关闭。
- Workflow 输入值同步发布给受控 textarea；示例追加沿 Chromium 编辑记录，保留 Undo/Redo。其余 UI 投影仍批处理。
- 两份原生成器预览随源码更新；Workflow 加入 640/768/960 选项并修复预览深色继承。clipper `preview/stage.html` 的差异由六 Tab 生成器同步既有 workspace-height CSS，未改其业务源码或正式包。

独立 reviewer Averroes 对最终 Agent→Workbench 补丁作限定 **APPROVE**，原 HIGH 核销：挂起 `resolveInstalledTask` 后触发撤权、AI Stop、无事件授权失效，均 `host.start=0 / host.stop=0`；内存移除守卫后三者恢复为 `host.start=1`。已经提交的 run 在 Stop/撤权后保留结果，AI 不冒充停止任务。该复现属于内存 Host，不能提升为真实 Native 证据。

## 验证与复用

| 证据 | 当前结论 | 范围与限制 |
| --- | --- | --- |
| 独立最终 Agent / Workbench 定向检查 | 85/85 PASS | 两文件测试、最终竞态补丁；非真实模型 |
| shared-ai-conversation-r22/r23、workflow-react-page、workflow-react-preview-contract、shared-ai-provider-runtime-r21 | 51/51 PASS | 最终共享输入、公开设置、Lease 与预览合同；`/tmp/opendesk-r231-shared-final-tests.log` |
| 原 Workflow / 六 Tab 生成器 `--check` | PASS | 接入远端 main 后重新生成并核对来源，未写 dist；见下方指纹 |
| 接入远端后的 recent task query 定向用例 | 1/1 PASS | 只核对远端改变的最近运行展示；未重跑以上 85/51 项 |
| 再次整合 Workflow 的交汇点增量 | 4/4 PASS | 受控输入、保留 native edit 的示例追加、disposed 后迟到回调不得改草稿、自动保存后无模型冷对话复用；`/tmp/opendesk-r231-merge-incremental.log` |
| 变更 JS 语法与 `git diff --check` | PASS | 没有可用 LSP，未声称执行 LSP |
| My Dock 开合、跨 Tab 草稿隔离、Workflow 示例/Undo/Redo/来源键盘 | 复用原 Chrome PASS | 相关 React 源输入未继续改变；具体旧证据见交接截图 |
| 320–960、浅深色、浏览器 200% | 复用原 PREVIEW_ONLY | 不提升为真实 Side Panel 尺寸/缩放 PASS |
| Conversation Stop→UNKNOWN | 复用原 RENDER_ONLY | 未运行 `conversation-dock-layout-browser.test.mjs` 的 Playwright 自动驱动 |
| 真实 Native / HTTPS 模型闭环 | BLOCKED / NOT_TESTED | 见下文，不以 mock 代替 |
| 中文粘贴 / 真实 IME composition | 粘贴沿用 PASS；IME NOT_TESTED | 未取得候选/提交证据 |

上次原始截图位于忽略目录 `artifacts/shared-ai-r231-local-20261024/`：`my-bottom-real-chrome.png`、`development-identity.png`、`render-only-stop-unknown.png`、`preview-workflow-320-dark.png`、`preview-workflow-320-dark-browser200.png`。截图层级与名字中的范围一致，不能替代真实业务回执。旧 `/tmp/opendesk-r231-security-tests.log` 早于最终补丁，不作为最终全量通过证据。

本轮真实 Controller 草稿经原开发 Run 返回 `{check:"shared-ai-r231",title:"OpenDesk Browser · Browser Test Lab",url:"http://127.0.0.1:43111/demo-form.html"}`，界面确认 completed / released。runId `c3bf46fe-f046-447d-8334-db30547e59bd`，sourceHash `21b9698a28bbb59239074ed6f887a2324497848c3cd18b5f22426b7f86d69abf`。同源码保存为 `shared-ai-r231-local-check` r1；开发服务安全更新后，同源码运行 `e562bd25-14d2-4469-9a93-f3ea340ef0ee` 仍 completed / released。

新增原生操作证据：

- 初次候选参数 Schema 漏写 `waitMs.title`，原合同正确拒绝 `E_SCHEMA`。这是测试输入错误；补上 `title:"等待毫秒"` 后保存成功，没有修改或放宽产品校验。
- 原任务目录核对以上真实 runId，显示“本机验证通过”；再经“设为本地可用”及“安装确定版本”，明确显示 `shared-ai-r231-local-check@1.0.0` 已安装。范围固定为 `http://127.0.0.1:43111`、`page.automation`，仅本机标题/URL 读取。
- 返回 demo，在真实 Side Panel「我的」选择“共享 AI 增量测试”，默认等待 0 运行成功并返回相同标题/URL。
- 输入等待 20000 后运行，切到「工作流」仍显示 `停止「共享 AI 增量测试」`。点击后返回「我的」显示“本次任务：已停止”、`E_CANCELLED：Controller fenced`，历史分别保留“已停止 · 最近第 1 次”和“成功 · 最近第 2 次”；展开旧成功记录仍能读取同一结果。最后恢复等待值为 0，没有再次运行。
- 数字控件的 AX `setValue` 曾产生无效输入，原合同以 `E_PARAMS` 拒绝；改为真实聚焦、全选及数字粘贴后正确显示 20000。该驱动输入失败不列为产品缺陷。

新增截图：`artifacts/shared-ai-r231-local-20261024/my-incremental-run-stop-history.png`。旧“我的页核心测试”及其结果保留。以上是手动 RunHost Stop 证据，不冒充 AI Stop 或真实模型闭环。

## 主线整合与预览

修复提交 `fb7dfcf10820444aa1dfcd0a11f4ce4548558778`，随后安全合入远端 `2f256b5fd`，合并提交 `535aae2729f2bce26b52a2aea350303c207aed66`。保留远端最近运行展示、Workflow 与来源校验变化。增量实测记录提交 `d19218034`。随后接入远端 `f278e61d0` 的 Workflow 自动保存及生命周期修复：`chooseExample` 同时保留本轮 native edit 回调和远端 disposed / active Agent 守卫，并增加关闭后迟到回调的定向用例。没有接管另一个 R23.39 owner 的后续任务。

原生成器最终 Workflow input SHA256：`e8644b7607796413b37e02ce432fce09b9f2d2614f6712f17d3d3ea39adf1cc8`；六 Tab input SHA256：`860ad2478dca1e7a76287d93eed85f9445915ab838660735e2a3262b1fd6f0db`，bundle input SHA256：`38a64e122690a991bb75e1c7fb444204f41080527606aa63fd42dee881c2172b`。两者最终 `--check` PASS。只重新生成和核对受整合影响的预览，没有重新执行预览尺寸矩阵。

## 持续开发身份与资源

上次实读：日常 `/Users/shopme/Applications/Google Chrome.app` 的真实 Side Panel，扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`。首次整合后安全更新，调试页再次确认“开发服务已连接”，revision `e19c741a232586a8492332b318c1b64fc50cad9ea92dc20f388c0828d7838a9e`；此前 revision `7fef7fce77dee6eaef1997990a4793b95ab9e410dbfbe2b46e22134e230f4cb9` 仅作先前观察。加载目录沿用 `dist/development`；没有重新安装或复制开发包。真实 Run/Stop 证据早于最终 `f278e61d0` 整合；该次整合没有改变 MyTaskAgent / TaskWorkbench，复用相关行为证据，最新 Workflow 整合只取得上述定向 Node 证据。本项是持续开发证据，不是 production 验收。

保留 npm dev PID 16868 / node 16888、43119 / 43120 守卫、demo Python PID 68658 / 43111、自有只读预览 PID 46214 / 59895；不关闭其他 CFT/Profile，不启动第二个 dist writer。两旧标签页的浏览器自动化句柄仍归原对话，本轮通过确切 Chrome 应用的原生入口操作真实侧边栏。

## Native / HTTPS 的具体阻塞

只读专家查证：当前 `/Users/shopme/.local/bin/codex` 为 `0.162.1`；sibling `opendesk/internal/browserai/process.go` 目前只审计 `codex-cli 0.159.2`，会在启动 App Server 前拒绝当前版本。

本机官方旧版位于 `/Users/shopme/.local/opt/opendesk-codex-0.159.2/node_modules/@openai/codex-darwin-arm64/vendor/aarch64-apple-darwin/bin/codex`，SHA256 `16593cc2f422d5f398a8e40f550ebbaf1245392528957be342c295920a300704`，与历史审计一致。但 2026-10-22 另一 Native 实例曾在版本匹配后被 `E_CODEX_POLICY` 拒绝；未证明当前实例可用。没有切换旧 CLI、放宽白名单或修改全局路由/认证。

当前 manifest → `~/.opendesk-browser/native-agent-r1/native-host` → `~/.opendesk-browser/native-agent-instances/mindmap-local-01a14949/build-r396-maintained/OpenDesk.app/Contents/MacOS/opendesk`，allowed origin 与当前扩展配对。Native SHA256 `c452a756c4e5362e74d903412b192359e9a10880bdb8a3fe12fd0ece70702fbf`；Go provenance 为 modified 源树，不能声称干净提交。

需 Native owner 在 sibling 的 `internal/browserai/process.go` / `manager.go` 及其测试验证版本、实际 Schema、线程和 `instructionSources` 策略；维护入口为 `docs/integrations/browser/workflow-codex-app-server-r16-implementation.zh-CN.md`。本轮只读核对，不接管 sibling master、其他改动或安装配对。HTTPS 两来源缺完整会话配置，真实请求 NOT_TESTED，不读取别处密钥或静默回退。

## 剩余操作

1. Native owner 交付经验证兼容运行时后，按唯一 Workflow 核心冒烟手册完成同对话真实“测试甲→测试乙”、DOM 与持久 Run/Result 读回，及相关确认/撤权/取消。
2. 有合法 HTTPS 会话配置后验证两来源；补真实 IME 和尚无有效证据的 Side Panel 尺寸/200%。未变化的预览矩阵不重复。
3. 仅在同候选真实证据完整后进行整体独立评分；目前 NOT_SCORED。
