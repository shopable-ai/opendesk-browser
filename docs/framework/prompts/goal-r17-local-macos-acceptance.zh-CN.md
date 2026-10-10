# GOAL：R17 在当前 Mac 本机完成真实安装、双 CLI、双目录并行、文件/程序与 Chrome 95+ 验收

请直接在当前 Mac 已有两个仓库继续执行，不重新做产品选型：

- Browser：https://github.com/shopable-ai/opendesk-browser，`main`；
- OpenDesk：https://github.com/shopable-ai/opendesk，实际默认 `master`。

**只在现有主分支，不能创建新分支或 Worktree，不强推、不 reset、不清理其他 Agent 的未提交文件或共享 Chrome Profile / Socket。** 禁止将 GitHub 代码与本机旧 dist/旧 Go Host/旧 Profile 混同。先核对 AGENTS.md、相应 testing-guide/工作流、两仓库 HEAD 和已有改动；冲突时保留双方、逐文件核对并解决。

本任务的代码主干已经在两个主分支落地，**不要重新建设 Native Host、Workspace、Resolver、Sidebar、RunHost 或 AI 工作流**。仅定位影响真实 R17 入口、发包、目录身份、状态显示、连接和实际文件/程序操作的缺陷，修到真机验收有证据为止。

## 先检查现有源码和测试

Browser：
- `docs/framework/local-directory-cli-r17.zh-CN.md`
- `docs/framework/workstreams/local-directory-cli-r17.md`
- `native-agent/local-dev/{dev-cli,provider,resolver,session}.mjs`
- `packages/opendesk-dev/package.json`
- `scripts/pack-opendesk-dev.mjs`
- `src/native-agent/{workspace,service-worker,file-workspace-service,source-label}.js`
- `src/ui/local-project.js`
- `tests/environment/r17-dev-cli.test.mjs`
- `tests/framework/r17-package-smoke.mjs`
- `.github/workflows/r17-directory-cli.yml`

OpenDesk：
- `docs/integrations/browser/local-directory-cli-r17.zh-CN.md`
- `internal/browsercli/{command,dev_unix}.go`
- `internal/browserbridge/{host_unix,host_dev_multi_unix,dev_workspace_unix,files_service_unix}.go`
- `internal/browserbridge/{host_dev_multi_unix_test,dev_workspace_unix_test}.go`
- 现有 Mac Native Host 安装与配对文档

## 第一部分：从真实发行产物验证

1. 用 `git status --short`、`git branch --show-current`、`git rev-parse HEAD`、`git fetch` 核对两仓库确在最新主分支。别覆盖工作区未提交修改；不要因为出现修改就自动 reset/clean。必要时仅对本任务影响文件做差异审阅。
2. Mac 上核对 `node --version` ≥22.12、`which opendesk`、`which opendesk-dev`、`opendesk browser --version`、`opendesk browser doctor`，并分别确认 app bundle 主二进制、Go Native Host、Chrome 实际扩展 ID 和加载的 `dist/production`（或明确使用 development）。不能把仓库源码版本当本机安装版本。
3. Browser 根目录执行：
   ```bash
   npm ci --ignore-scripts --no-audit --no-fund
   node --test tests/environment/r17-dev-cli.test.mjs tests/environment/local-project-connection.test.mjs tests/environment/file-workspace.test.mjs
   node tests/framework/r17-package-smoke.mjs
   npm run build
   ```
   若包依赖缺失/打包不完整，必须修源码或 packages/files 声明，并重新用实际 tarball 安装，不能使用作者仓库路径替代。不要执行 npm publish/release。
4. 使用 Browser R17 使用指南的 `npm install -g .runtime/r17-dev-package/*.tgz` 和 `opendesk-dev --register-go` 完成受信安装。全局 npm prefix 在当前 Mac 实际可能不同，核对 bin 真路径、entry.json 和哈希。不要把业务项目下的 `node_modules/opendesk-dev` 用作 Go launcher。
5. OpenDesk 按实际 Mac 构建/安装流程重建 Go Host；遵守当前 Host 的原有受信绑定和迁移策略。原 Node Host 未完成明确安全迁移时不得覆盖或自动清理。确认 Native hello/welcome 均协商 `localDevMultiVersion:1`、`localFilesVersion:1`，缺版本报 `E_NATIVE_UPDATE_REQUIRED`。
6. Go 运行 `go test -count=1 ./internal/browserbridge ./internal/browsercli ./internal/browserai`，核对本次 R17 test 包括双来源反向路由、文件只读、跨来源伪造回复。其它 Go 大规模测试只跑受影响项，旧证据按输入 SHA 复用。

## 第二部分：真实 Chrome/目录测试

创建两个当前用户拥有、包含中文/空格、**相同 basename** 但不同 inode 的测试目录 A/B；每个都有 README.md、index.html。第三个合法 OpenDesk Controller 测试项目使用已知 `examples/programs/local-controller`，不要凭 `package.json` 任意执行项目 scripts。

- 终端 A：`cd "目录A"; opendesk browser`；终端 B：`cd "目录B"; opendesk-dev`。验证两个来源同时在线，Workspace 真实打开同一现有 `native-agent/workspace.html` 页面并各自选中正确目录；不抢 Side Panel 正在编辑项目或执行中的 Target。
- 各目录读取真实 README / HTML 的文件字节与 SHA。默认临时目录尝试写入必须拒绝；原永久 read-write workspace 经过用户明确 `workspace add --access read-write` 可另行测试写入后实际读回、外部编辑冲突、失败或未知回执不得自动重复保存。
- 同一目录再次通过另一入口启动：幂等复用或明确提示已有会话，不能有第二套 Provider；第二命令退出不能令第一个来源离线。 Ctrl+C 停止 A，只 A 的临时目录/来源下线，B 继续可读；不能清理 B 的 socket、长期 Workspace 授权或旧 Browser 运行结果。
- Browser Developer Sidebar 项目列表与 Workspace 对相同来源给出一致名称；相同 basename 不按文字合并。断开 Native 后历史名称仍可展示但明确离线且不可磁盘操作；空授权目录区分「已连接但尚无目录」与「尚未连接」。Host 重启、撤权、源码 Provider 断开、刷新异常、迟到回包不能恢复过时在线/旧项目或覆盖不同目录的未保存草稿。
- 可运行 Controller 项目先明确 Run 得到真实 `runId/resultId/sourceHash`，修改源码并保存后再次主动 Run 获得新的实际输出；旧结果、Stop、目标文档身份保持原语义。文件保存和扩展热更新绝对不能自动重放网页业务。
- 将独立 Demo 入口和正式 Extension 核对，正式 Native 断连时不能出现固定 demo-workspace/我的创作工作区的伪真实文件。页内预览和 Side Panel 打开必须保留真实用户手势；workspace URL 仅带不透明 ID，不得出现路径、凭据或 token。预览 frame 不可调用文件 RPC。
- 使用真实 Chrome 页面观察扩展加载路径、version/manifest、extension ID、Profile、Native 进程、状态标签及保存回执，必要时取得截图。不是只执行 Playwright mock 或模拟 Chrome 帧就标记 Chrome PASS。

## 第三部分：安全回归和收口

确认未知 browser 子命令不会授权目录；`help/--help/--version` 无文件和窗口副作用；空、特殊、相对、中文、空格目录均有边界处理；坏 inode/symlink/隐藏目录/../穿越、未授权写盘、跨来源 ACK 不得绕过原鉴权。核对 Node 缺失/组件不匹配/旧 Host/错误 Profile 对应精确诊断。

根据真实失败直接做最小修复、重跑受影响测试。两仓分别对照当前远端主分支串行提交，不创建分支，不无脑覆盖并行任务或旧工作流记录。日志、真实运行截图和机器产物放各自独立 `.runtime/tests/r17/`，只把可维护的正式代码、测试和摘要交付写入 Git，绝不伪造 native ack / PASS。

最终按 CLI 30、复用25、改动量20、安全15、维护10 出评审；**设计分与验收分必须分开**。缺少真实 Mac Chrome / 文件 / 业务闭环时保留 `NOT_TESTED`，不宣布完成 95。

交付用中文简报：各入口真实安装路径、两个仓库最终 SHA、逐类 PASS/FAIL/NOT_TESTED、CLI 终端输出、A/B 真实 Workspace 截图或结构化验收日志、写入读回和运行结果身份、剩余阻塞、用户日常仅需执行的最短命令。
