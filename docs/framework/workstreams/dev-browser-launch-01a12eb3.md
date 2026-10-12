# 修复本地 CLI 打开错误的浏览器

日期：2026-10-12（Asia/Shanghai）。会话：01a12eb3。状态：COMPLETE / released（本机 CLI 启动修复）。

目标：`opendesk-dev examples/programs/local-controller` 在日常 Chrome 打开 Workspace，不误启动名称相同的 CFT 并报 ERR_BLOCKED_BY_CLIENT。

已确认缺口：源码和全局旧 CLI 均用 `open -a "Google Chrome"`。本机 `/Applications/Google Chrome.app` 的真实 bundle ID 是 `com.google.chrome.for.testing` / 149.0.7827.55；`~/Applications/Google Chrome.app` 是 `com.google.Chrome` / 154.0.8037.98。真实 CUA 观察证实报错窗口属于前者，日常 Chrome 的扩展详情页实际加载仓库 dist/development。Go doctor connected/nativeConnected/enabled 均 true，扩展 ID ccfcjegpkdlgbclopjmadlcjedelidmf 一致。Native 每实例独占 Socket，已连接默认实例的身份正确。

修改范围：dev-cli.mjs 的 macOS 应用定位；新增定向测试。已有诊断/打包改动保持原字节作为基线。通过条件：精确 app 路径与真实 bundle ID 一致；同名错误应用被拒绝；自定义 Profile 保持阻断；本机更新后的 CLI 正常显示 Workspace 并保留 Native 配对。

并发：另有阅读目录和 R16 工作流活动。本轮写入隔离 worktree `agent/browser-launch-01a12eb3`；不占用其 dist/CFT/profile/端口。不写旧 opendesk 工程，不重建共享扩展。只读核对 testing-guide、扩展加载来源、安装诊断和依赖工作流。本轮相关 launcher 输入变化，只补启动与 CLI 定向验证，不重做业务、F3 或 ZIP。

资源：隔离 worktree .runtime/browser-launch、本次证据目录、日常已连接 Chrome 与全局 npm CLI 的更新/备份；不变更 Native 配置、扩展 ID 或权限。更新前核对活动 CLI 并保留可恢复副本。浏览器仅验证 Workspace 打开，不运行项目。

## 修复与本机结果

`workspaceOpenCommand` 用系统 plutil 核对真实 CFBundleIdentifier，普通 Chrome 与 CFT 分别匹配各自身份，再向 `open -a` 传入精确应用绝对路径。常规 `~/Applications` 和 `/Applications` 均支持；不再按应用显示名猜测。找不到匹配应用则保守拒绝，保留手动打开地址；自定义 Profile 仍返回 E_PROFILE_TARGET。新增失败退出回归，确保打开失败时保留原 Workspace 地址，不产生次生错误。

隔离实现后，核对 main 上 CLI 字节仍与原隔离基线完全一致，再单次串行应用本轮专属 delta，并新增独立测试和本工作流；既有安装诊断改动及其他对话修改全部保留。最终 main 与隔离候选的两个修改输入逐字节一致，完整 SHA 见 [最终验证绑定](evidence/dev-browser-launch-01a12eb3/validation-final2.json)。无本轮 Git commit/push/publish。

- 最终定向测试：隔离 Node 26 和 main Node 24 各 39/39 PASS。覆盖错误同名应用、系统/用户安装、CFT 独立身份、自定义 Profile 阻断、打开非零退出，以及既有权限/连接/安装诊断合同。原始输出：[main 最终测试](evidence/dev-browser-launch-01a12eb3/main-targeted-final2.tap)、[隔离最终测试](evidence/dev-browser-launch-01a12eb3/targeted-final2.tap)。
- 源码检查：隔离 489、main 491 个 source/test/build 文件及严格 CSP/固定入口检查通过；最后失败提示修复另做 Node 语法检查及上述最终定向测试。[main 源码检查](evidence/dev-browser-launch-01a12eb3/main-source-check.log)。
- 本机存在 NVM 与 Homebrew 两份全局 npm CLI；均 offline/ignore-scripts 更新至同一自包含候选。版本仍为 0.1.0-r17.1，完整内容指纹均为 `470281625b49db5885aa785053e92f481f5356d1146426b7f3fb7311f787d1d9`，archive SHA-256 `907cfd48846482edf7998d06003dd9b5d6db27f894ac166d7290fa2ae831a156`。两个 prefix 均 verified，Go 用户级登记明确指向 NVM，已登记入口 doctor ok=true。[打包](evidence/dev-browser-launch-01a12eb3/pack-final2.json)、[安装诊断](evidence/dev-browser-launch-01a12eb3/installed-doctor-final2.json)。
- 真实启动：第一轮 NVM、最终候选 Homebrew 均通过 Native 注册 local-controller Provider，并在既有日常 Chrome 打开正确扩展 Workspace；原 sourceId `source-e7a88657f8a28a4368a6abdc`、workspace `workspace-09acbf8b-bc73-3e4f-808f-77d6bcb4cd6b`。最终 CUA 原生 AX 与截图在本对话工具记录显示标题「OpenDesk · 本地文件工作区」、绿色「Native 已连接」、local-controller 及完整 README；没有 Chromium 屏蔽页。最终原始 CLI 输出：[启动与 Ctrl+C](evidence/dev-browser-launch-01a12eb3/cli-smoke-final2.log)。仅验证工作区打开，未点击运行或保存。
- 两轮均 Ctrl+C 正常退出 0，仅释放本轮临时来源；收尾 Go doctor connected/nativeConnected/enabled=true。Native install.json 和原 manifest 的 SHA-256 与更新前完全一致。[收尾 doctor](evidence/dev-browser-launch-01a12eb3/native-after-final2.json)。日常 dist/扩展 ID/Native 配对及其他工作流 CFT 未变更。
- 可恢复备份：`~/.opendesk-browser/cli-browser-repair-20261012-01a12eb3/cli-before.tar.gz`（原 NVM 包/bin/登记）和 `homebrew-cli-before.tar.gz`。只保存在本机私有目录，不提交备份。

## 单连接边界与已保留限制

旧 opendesk 工程仅只读确认：每安装实例独占 Socket，第二个 Host 返回 E_SOCKET_IN_USE；当前 named instance 仅接受显式 CFT Profile。默认日常 Native 不能同时由多个独立浏览器/Profile 抢占。此次 ERR_BLOCKED_BY_CLIENT 的直接原因是 CLI 按名称选错应用，默认 Native 的已配对 Chrome 自始连接正常；不借此改写多浏览器协议或重授予权限。

Homebrew 的只读 doctor 保留 `E_DEV_ENTRY_DIFFERENT`，因为用户级 Go 登记是 NVM 的绝对入口；两个包的完整内容均一致且真实直接 CLI 启动已分别通过。此报告不能当作 Homebrew 独立登记 PASS。按明确的 NVM Node/已登记入口做 doctor 才是本次配对诊断；不通过放宽身份检查消除这个提示。[原报告](evidence/dev-browser-launch-01a12eb3/homebrew-doctor.json)。早期 candidate 的 pack/版本/测试及启动记录均保留，不覆盖旧原始证据；最终绑定使用 final2。

不支持位置的浏览器安装会返回明确 E_BROWSER_OPEN，可从已配对浏览器打开提示中的地址。Linux/Windows、多个独立浏览器并发、项目业务运行、F3、ZIP 均 NOT_TESTED；本轮结果仅为本机 Workspace 启动修复，不提升为整体框架验收。
