# R17 本地目录直连：双 CLI、已有 Workspace、多目录与权限边界

日期：2026-10-10。代码分别位于 OpenDesk Browser 的 `main`、OpenDesk Go 的 `master`。本页是 **R17 日常使用与验收唯一入口**；旧 R2.2 MCP 配置仍供高级开发者使用，不是目录直连前置条件。

## 最短使用方式

首次需要已安装且配对的 OpenDesk **Go Native Host**、包含 R17 协议的浏览器扩展，以及 Node.js ≥22.12。Node 只用于本地项目开发工具和 Resolver；OpenDesk Go Native Host 自身无需 Node。Chrome `nativeMessaging` 权限仅在首次受信交互批准；网站权限和文件写权限另外管理。

从任意已有目录执行：

```bash
cd "/absolute/path/项目 A"
opendesk browser

# 显式等价写法
opendesk browser dev
opendesk browser dev "/absolute/path/项目 B"

# 同一内核的 npm 全局入口
opendesk-dev
opendesk-dev "/absolute/path/项目 B"

# 路径若以减号开头
opendesk browser dev -- "-special-folder"
opendesk-dev -- "-special-folder"
```

CLI 默认前台运行，打开 **现有** `native-agent/workspace.html` 页面并用不透明 `sourceId` 定位目录。无需先打开 Sidebar、运行 Codex、注册 MCP、手动执行 `Command.run()`、启动目录 HTTP 服务器或安装项目依赖。普通 Markdown/HTML 目录可只使用文件工作区，不会猜测 JS 入口、不读取任意 `npm scripts` 并执行。

`opendesk browser` **裸命令** 等价于 `opendesk browser dev .`；其它原有 `setup/update/doctor/cleanup/workspace/project/ai/native-host/bridge.status/run.*/page.*` 子命令仍分别分派，未知子命令不会被当目录授权。`--help`、`help`、`--version` 不启动来源、不打开窗口、不修改授权。

## 从源码安装当前本地 npm CLI（不发布）

在已更新的 **Browser 仓库根目录**：

```bash
npm ci --ignore-scripts --no-audit --no-fund
node scripts/pack-opendesk-dev.mjs
npm install -g .runtime/r17-dev-package/*.tgz
opendesk-dev --register-go
opendesk-dev --version
opendesk browser --help
```

`scripts/pack-opendesk-dev.mjs` 只生成 `.runtime/r17-dev-package/` 下的候选 tarball，并验证包内所需源码/Resolver 图；保留原仓库根包 `private:true`。npm 包为 `@shopable/opendesk-dev`，真实 bin 为 `opendesk-dev`，源代码入口为 `native-agent/local-dev/dev-cli.mjs`。该入口依赖随包分发的 Node 模块与资源；**不能只复制一个 .mjs 文件就称它完全独立**。

注册命令把已安装 npm **全局包入口及入口文件 SHA-256** 写到用户私有的 `~/.opendesk-browser/dev-tool-r17/entry.json`。Go 每次检查此入口、文件身份与哈希，不从当前目录或未登记的同名命令加载组件，也不使用 shell 拼接。升级 npm 工具后需要重新执行 `opendesk-dev --register-go`，不会自动下载 latest。若 npm 全局目录不可写，请使用当前账号允许的 npm prefix；不要把包安装在当前业务项目的 `node_modules` 后冒充全局入口。

本项目没有执行 `npm publish`、官方 release 或远端安装操作。**更新 GitHub 主分支并不等于本机安装的新二进制或 Chrome 已加载新代码**。

## OpenDesk / Chrome 首次配对

使用真实且已安装的 OpenDesk Go 程序，并核对已加载扩展的真实 ID：

```bash
opendesk browser setup --extension-id "从 chrome://extensions 获取的 32 位实际 ID"
opendesk browser doctor
```

在 Chrome 打开 OpenDesk Browser 扩展的「本机连接设置」，按现有真实按钮启用 Native Messaging 并核对 `doctor`。已有受信 Go 安装可按原安装策略安全使用 `setup/update`；不可静默覆盖旧 Node Host、伪造扩展 ID 或绕过首次授权。改动 Go Native 代码后必须重新构建/安装对应程序，改动扩展代码后必须重新构建并确认 Chrome 加载的是本轮包，不以仓库 HEAD 替代实际加载身份。

R17 需要 **Go Host 和 Browser 扩展都协商 `localDevMultiVersion:1`**。旧版不支持则明确报 `E_NATIVE_UPDATE_REQUIRED`，不退化到会抢占旧 MCP 的单 Provider 实现。自定义 Chrome Profile 如果无法可靠定位，CLI 明确提示手动在已配对 Profile 中打开 Workspace，不假装已打开。

## 目录、程序和现有权限的区别

| 身份 | 当前用途 | 能做什么 |
| --- | --- | --- |
| `sourceId` | 已认证安装作用域下的来源关联与页面定位 | 不透明展示/路由键，不是权限凭证 |
| `workspaceId` | 文件工作区和原有目录授权 | 受现有文件权限限制；CLI 临时目录默认只读 |
| `bindingId` | 已授权可运行的 JS/ESM 程序绑定 | 由 Node Resolver 或原 Go 文件 Provider 提供；执行仍需要网站/RunHost 权限 |
| `providerEpoch` | 当前来源集合和回包防串号 | 来源变更、撤销或重连后旧 epoch 失效 |

R17 使用已有 Go 文件服务、Workspace、Node `LocalDevResolver`、原 Browser RunHost/Controller/Page 链，没有增加第二套编译器或网页执行器。一个目录可以只显示文件，或携带符合 `opendesk.project.v1` 的已声明程序。旧 Go 单文件 `opendesk browser project ...`、Codex stdio MCP 和 `workspace add/list/revoke` 仍有各自用途，不用 R17 命令替代其显式授权与业务归属。

用户在终端明确执行目录命令，只为**当前目录、当前 CLI 会话**建立只读接入；不会扩展到 Git 根目录、HOME 或其它父目录。已有长期 `read-write` 授权可继续允许确认后的保存，但 R17 不替它扩权。文件编辑采用原 SHA-256 冲突检查；修改源文件不会自动重新运行任何网页点击、提交或脚本。

同名不同目录不按 basename 合并：内核使用认证凭据作用域内的目录路径和设备/inode 派生来源身份，浏览器显示区分标签。同目录再次运行不会创建重复来源，第二个命令不能抢占第一会话。Ctrl+C 只关闭本 CLI 所有的 Provider/临时只读目录；持久文件授权、另一个项目和已冻结的旧运行结果不删除。各项状态独立呈现：Native 是否连接、目录文件是否可用、运行源码 Provider 是否在线以及写权限是否存在。

## Workspace 和浏览器程序

默认打开原 `native-agent/workspace.html` **完整标签页**，不是自动弹出 Chrome Side Panel。文件列表、源码编辑、Markdown/HTML 静态预览、对照、另存为、写入读回和冲突提示复用已有实现。侧栏需用户自己点击打开；不能伪造用户手势。Workspace 是扩展页面，**不能成为业务运行目标**；业务程序按原工作台和已授权的真实目标网页运行。

历史名称是展示缓存，不是磁盘或运行权限。未连接显示「尚未连接本机」，已连接无目录显示「尚无已接入目录」；离线列表注明「待连接核验」，不拿缓存访问文件。掉线、迟到响应和 Host 重启后刷新状态，已编辑草稿不被替换为其它目录内容。Demo 内存文件仅用于独立演示构建，正式扩展缺 API/断线不能退回演示数据。

## 已有可复用证据和仍须在 Mac 检查的项目

GitHub Actions `R17 directory CLI and packaged native Workspace` 已在 Ubuntu/macOS 通过：Node CLI 定向测试、真实 npm tarball 全局安装、安装包内 Resolver/Session 模块导入，以及扩展构建。这是**组件/打包级证据**，不是实际用户 Chrome 页面已打开的证据。OpenDesk Go Native Bridge 在 Linux/macOS 现有测试通过；新多来源进程测试必须核对它自己的最终 CI 和对应 SHA。

Mac 本地 Codex 最小验收：核对真实 `opendesk` 和 `opendesk-dev` 安装路径、`doctor`、Chrome 扩展 ID/加载目录/版本、当前 macOS 真实 Go Host，然后在两个终端分别从带空格和中文路径的目录启动。验证 A/B 各自 Workspace 定位、重复启动不夺租约、Ctrl+C 结束 A 仍保留 B、无程序清单只能读文件、已显式授权的写入后读回及外部编辑冲突、可运行项目再次明确 Run 得到新 `sourceHash`，而旧 `runId/resultId` 不变。

只有真实浏览器与 macOS 证据完成，才能将窗口打开、实际文件/业务端到端标记为 PASS。没有真实测试时记为 `NOT_TESTED`，不能宣称专家实施评分达到 95。

相关组件：`native-agent/local-dev/dev-cli.mjs`、`provider.mjs`、`src/native-agent/workspace.js`、`src/ui/local-project.js`；Go：`internal/browsercli/dev_unix.go`、`internal/browserbridge/host_dev_multi_unix.go`、`dev_workspace_unix.go`。
