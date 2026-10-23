# Shared AI Chat R2.3.1-LOCAL · 增量验证记录

日期：2026-10-24（Asia/Shanghai）。Owner：接收对话 `01a16a53-9295-74c3-b6f9-35cee9c26b69`。

## 结论与阶段

当前修复候选可保存，整体真实产品验收尚未通过，独立专家总分 **NOT_SCORED**。按用户最新要求采用增量测试：未改变的操作复用原证据，不重跑历史全量测试、完整尺寸矩阵或 production 构建。旧对话目标上次实读为 paused；本记录不恢复、迁移或完成旧目标。

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
| 原 Workflow / 六 Tab 生成器 `--check` | PASS | 检查离线 source pin，未写 dist |
| 变更 JS 语法与 `git diff --check` | PASS | 没有可用 LSP，未声称执行 LSP |
| My Dock 开合、跨 Tab 草稿隔离、Workflow 示例/Undo/Redo/来源键盘 | 复用原 Chrome PASS | 相关 React 源输入未继续改变；具体旧证据见交接截图 |
| 320–960、浅深色、浏览器 200% | 复用原 PREVIEW_ONLY | 不提升为真实 Side Panel 尺寸/缩放 PASS |
| Conversation Stop→UNKNOWN | 复用原 RENDER_ONLY | 未运行 `conversation-dock-layout-browser.test.mjs` 的 Playwright 自动驱动 |
| 真实 Native / HTTPS 模型闭环 | BLOCKED / NOT_TESTED | 见下文，不以 mock 代替 |
| 中文粘贴 / 真实 IME composition | 粘贴沿用 PASS；IME NOT_TESTED | 未取得候选/提交证据 |

上次原始截图位于忽略目录 `artifacts/shared-ai-r231-local-20261024/`：`my-bottom-real-chrome.png`、`development-identity.png`、`render-only-stop-unknown.png`、`preview-workflow-320-dark.png`、`preview-workflow-320-dark-browser200.png`。截图层级与名字中的范围一致，不能替代真实业务回执。旧 `/tmp/opendesk-r231-security-tests.log` 早于最终补丁，不作为最终全量通过证据。

本轮真实 Controller 草稿经原开发 Run 返回 `{check:"shared-ai-r231",title:"OpenDesk Browser · Browser Test Lab",url:"http://127.0.0.1:43111/demo-form.html"}`，界面确认 completed / released。runId `c3bf46fe-f046-447d-8334-db30547e59bd`，sourceHash `21b9698a28bbb59239074ed6f887a2324497848c3cd18b5f22426b7f86d69abf`。同源码保存为 `shared-ai-r231-local-check` r1。后续候选保存暂未取得成功回执，**未安装、未证明「我的」Run/Stop 通过**；旧“我的页核心测试”与旧结果保留。Chrome 原生操作被用户活动打断时不重复点击未知结果。

## 持续开发身份与资源

本轮实读：日常 `/Users/shopme/Applications/Google Chrome.app` 的真实 Side Panel，扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`，调试页显示开发服务已连接，revision `7fef7fce77dee6eaef1997990a4793b95ab9e410dbfbe2b46e22134e230f4cb9`。加载目录沿用 `dist/development`；没有重新安装或复制开发包。本项是持续开发证据，不是 production 验收。

保留 npm dev PID 16868 / node 16888、43119 / 43120 守卫、demo Python PID 68658 / 43111、自有只读预览 PID 46214 / 59895；不关闭其他 CFT/Profile，不启动第二个 dist writer。两旧标签页的浏览器自动化句柄仍归原对话，本轮通过确切 Chrome 应用的原生入口操作真实侧边栏。

## Native / HTTPS 的具体阻塞

只读专家查证：当前 `/Users/shopme/.local/bin/codex` 为 `0.162.1`；sibling `opendesk/internal/browserai/process.go` 目前只审计 `codex-cli 0.159.2`，会在启动 App Server 前拒绝当前版本。

本机官方旧版位于 `/Users/shopme/.local/opt/opendesk-codex-0.159.2/node_modules/@openai/codex-darwin-arm64/vendor/aarch64-apple-darwin/bin/codex`，SHA256 `16593cc2f422d5f398a8e40f550ebbaf1245392528957be342c295920a300704`，与历史审计一致。但 2026-10-22 另一 Native 实例曾在版本匹配后被 `E_CODEX_POLICY` 拒绝；未证明当前实例可用。没有切换旧 CLI、放宽白名单或修改全局路由/认证。

当前 manifest → `~/.opendesk-browser/native-agent-r1/native-host` → `~/.opendesk-browser/native-agent-instances/mindmap-local-01a14949/build-r396-maintained/OpenDesk.app/Contents/MacOS/opendesk`，allowed origin 与当前扩展配对。Native SHA256 `c452a756c4e5362e74d903412b192359e9a10880bdb8a3fe12fd0ece70702fbf`；Go provenance 为 modified 源树，不能声称干净提交。

需 Native owner 在 sibling 的 `internal/browserai/process.go` / `manager.go` 及其测试验证版本、实际 Schema、线程和 `instructionSources` 策略；维护入口为 `docs/integrations/browser/workflow-codex-app-server-r16-implementation.zh-CN.md`。本轮只读核对，不接管 sibling master、其他改动或安装配对。HTTPS 两来源缺完整会话配置，真实请求 NOT_TESTED，不读取别处密钥或静默回退。

## 剩余操作

1. 原安装链完成独立 demo 测试候选的验证/安装，再验证「我的」原 Run/Stop 与持久结果；未成功不得写 PASS。
2. Native owner 交付经验证兼容运行时后，按唯一 Workflow 核心冒烟手册完成同对话真实“测试甲→测试乙”、DOM 与持久 Run/Result 读回，及相关确认/撤权/取消。
3. 有合法 HTTPS 会话配置后验证两来源；补真实 IME 和尚无有效证据的 Side Panel 尺寸/200%。未变化的预览矩阵不重复。
4. 仅在同候选真实证据完整后进行整体独立评分；目前 NOT_SCORED。
