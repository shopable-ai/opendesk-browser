# R17 本地目录直连：双 CLI、已有 Workspace、多目录与权限边界

> **当前契约：R17.1 临时默认读写 + WebCodex 结构化请求往返。** 本轮源码已经实现；组件与打包证据见专属工作流，用户 Mac 的安装、P0 和两轮真实网页修改仍须单列验收。实施前的 R3 决策作为历史保留。


日期：2026-10-10。代码分别位于 OpenDesk Browser 的 `main`、OpenDesk Go 的 `master`。本页是 **R17 日常使用与验收唯一入口**；旧 R2.2 MCP 配置仍供高级开发者使用，不是目录直连前置条件。

## 最短使用方式

首次需要已安装且配对的 OpenDesk **Go Native Host**、包含 R17 协议的浏览器扩展，以及 Node.js ≥22.12。Node 只用于本地项目开发工具和 Resolver；OpenDesk Go Native Host 自身无需 Node。Chrome `nativeMessaging` 权限仅在首次受信交互批准。目录授权由本次 CLI 接入建立，正常读取与显式保存沿用该授权；程序 Run 和网页权限仍独立管理。

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

# 显式只读（选项放在目录参数前）
opendesk browser dev --read-only "/absolute/path/项目 C"
opendesk-dev --read-only "/absolute/path/项目 C"

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
npm install -g .runtime/r17-dev-package/shopable-opendesk-dev-0.1.0-r17.1.tgz
opendesk-dev --register-go
opendesk-dev --version
opendesk browser --help
```

`scripts/pack-opendesk-dev.mjs` 只生成 `.runtime/r17-dev-package/` 下的候选 tarball，并验证包内所需源码/Resolver 图；保留原仓库根包 `private:true`。npm 包为 `@shopable/opendesk-dev`，真实 bin 为 `opendesk-dev`，源代码入口为 `native-agent/local-dev/dev-cli.mjs`。该入口依赖随包分发的 Node 模块与资源；**不能只复制一个 .mjs 文件就称它完全独立**。

注册命令把 `localDevAccessVersion:1`、已安装 npm **全局包入口及入口文件 SHA-256** 写到用户私有的 `~/.opendesk-browser/dev-tool-r17/entry.json`。Go 每次检查此入口、文件身份与哈希，不从当前目录或未登记的同名命令加载组件，也不使用 shell 拼接。升级 npm 工具后需要重新执行 `opendesk-dev --register-go`，不会自动下载 latest。若 npm 全局目录不可写，请使用当前账号允许的 npm prefix；不要把包安装在当前业务项目的 `node_modules` 后冒充全局入口。

本项目没有执行 `npm publish`、官方 release 或远端安装操作。**更新 GitHub 主分支并不等于本机安装的新二进制或 Chrome 已加载新代码**。

## OpenDesk / Chrome 首次配对

使用真实且已安装的 OpenDesk Go 程序，并核对已加载扩展的真实 ID：

```bash
opendesk browser setup --extension-id "从 chrome://extensions 获取的 32 位实际 ID"
opendesk browser doctor
```

在 Chrome 打开 OpenDesk Browser 扩展的「本机连接设置」，按现有真实按钮启用 Native Messaging 并核对 `doctor`。已有受信 Go 安装可按原安装策略安全使用 `setup/update`；不可静默覆盖旧 Node Host、伪造扩展 ID 或绕过首次授权。改动 Go Native 代码后必须重新构建/安装对应程序，改动扩展代码后必须重新构建并确认 Chrome 加载的是本轮包，不以仓库 HEAD 替代实际加载身份。

R17.1 需要 **Go Host 和 Browser 扩展协商 `localDevMultiVersion:1`、`localFilesVersion:1`、`localDevAccessVersion:1`**。新请求闭环还要求文件服务状态 `devLeaseEpoch:1`。旧 npm 登记由 Go 报 `E_DEV_COMPONENT_UPDATE_REQUIRED`；更新 tarball 后重新 `--register-go`。旧版不支持则明确报 `E_NATIVE_UPDATE_REQUIRED`，不退化到会抢占旧 MCP 的单 Provider 实现。自定义 Chrome Profile 如果无法可靠定位，CLI 明确提示手动在已配对 Profile 中打开 Workspace，不假装已打开。

## 目录、程序和现有权限的区别

| 身份 | 当前用途 | 能做什么 |
| --- | --- | --- |
| `sourceId` | 已认证安装作用域下的来源关联与页面定位 | 不透明展示/路由键，不是权限凭证 |
| `workspaceId` | 文件工作区和原有目录授权 | 新目录为本次 CLI 临时读写；已有明确长期只读保持只读 |
| `bindingId` | 已授权可运行的 JS/ESM 程序绑定 | 由 Node Resolver 或原 Go 文件 Provider 提供；执行仍需要网站/RunHost 权限 |
| `providerEpoch` | 当前来源集合和回包防串号 | 来源变更、撤销或重连后旧 epoch 失效 |
| `leaseEpoch` | 公开的 CLI 文件会话代次 | 绑定读取/保存，重接后不能复用；不同于私有 owner `leaseId` |

R17 使用已有 Go 文件服务、Workspace、Node `LocalDevResolver`、原 Browser RunHost/Controller/Page 链，没有增加第二套编译器或网页执行器。一个目录可以只显示文件，或携带符合 `opendesk.project.v1` 的已声明程序。旧 Go 单文件 `opendesk browser project ...`、Codex stdio MCP 和 `workspace add/list/revoke` 仍有各自用途，不用 R17 命令替代其显式授权与业务归属。

用户在终端执行命令，为**参数指定的根目录**建立本次 CLI 生命周期的临时读写接入；省略路径时只使用当前工作目录，不扩大到 Git 根、父目录或用户主目录。新目录不需要先 `workspace add`。Go 对实际权限作最终裁决：

| 接入状态 | 默认申请读写 | 显式 `--read-only` |
| --- | --- | --- |
| 新目录、无长期授权 | 临时 read-write | 临时 read-only |
| 已有长期 read-only | 继续只读，原因 `persistent-read-only` | 继续只读 |
| 已有长期 read-write | 复用长期读写 | `E_DEV_ACCESS_CONFLICT`，不假报只读 |
| 同目录已有在线 CLI | 复用 ID、代次和实际权限，不夺租约 | 已在线只读则复用；已在线读写则模式冲突 |
| 旧客户端省略 access | 保持旧的新目录只读语义 | 不适用 |

新 CLI 发送严格消息 `{"v":1,"kind":"dev.attach","path":"/明确目录","access":"read-write"}`；新旧组件能力不匹配会明确诊断，不能静默退化。Node 展示 Go 返回的 `access` 和 `accessReason`，不会自行用申请值覆盖实际权限。

同名目录由不透明 `sourceId/workspaceId` 和设备/inode 区分，第二次运行不会取得原 owner 私有 lease，只重新定位原 Workspace。Ctrl+C、异常退出、owner socket 关闭会释放当前会话拥有的临时接入；初始化尚未完成时断连也会停止 Provider。B 和长期授权保持。临时目录不进入永久 `Workspaces` 授权数组；现有 grant store 中有界的 `devLeaseFences` 仅记录失效代次，不含路径、访问授权或秘密，用于防止永久权限 RW→RO→RW 等往返恢复旧 CLI 权限，退出时按归属清理。

文件服务的 `leaseEpoch` 三种语义：省略兼容旧客户端；空字符串表示“执行时仍无 CLI 接入”；非空表示必须仍为这次 CLI 代次。新 Workspace 在 `devLeaseEpoch:1` 下始终发送该字段，包括空字符串。Native 在文件执行锁内、重复写回执返回前核验；目录 ID 本身不是授权。文件保存仍用读取时 SHA-256 做乐观冲突检测，不自动运行程序，也不宣称对不协作外部编辑器拥有跨进程强事务。

## Workspace 和浏览器程序

默认打开原 `native-agent/workspace.html` **完整标签页**，不是自动弹出 Chrome Side Panel。文件列表、源码编辑、Markdown/HTML 静态预览、对照、另存为、写入读回和冲突提示复用已有实现。侧栏需用户点击「在侧栏打开」；入口把当前已核验的 `workspaceId` 显式传入文件 Workspace URL，不能依赖“最近选中目录”。不能伪造用户手势。Workspace 是扩展页面，**不能成为业务运行目标**；业务程序按原工作台和已授权的真实目标网页运行。

历史名称是展示缓存，不是磁盘或运行权限。未连接显示「尚未连接本机」，已连接无目录显示「尚无已接入目录」；离线列表注明「待连接核验」，不拿缓存访问文件。掉线、迟到响应和 Host 重启后清除旧操作能力并保留名称与草稿；A 离线、全部目录暂空、B 再上线也不自动改选 B。新连接须重读文件；过期 AI 草稿须重新建立请求和审阅，或明确「丢弃草稿并重读」。Demo 内存文件仅用于独立演示构建，正式扩展缺 API/断线不能退回演示数据。

## 当前对话读取与修改

选择目录和用户指定的**已有官方 ChatGPT 对话**，在原「ChatGPT 对话编辑」区域填写相对路径，点击「建立读取请求」和「回填上下文」。初始上下文只含身份、相对路径、任务及协议，不含正文。用户检查后通过网页发送；完整回答返回后点击「处理当前回答」，扩展经 Go 执行受限 list/read，把真实结果回填同一输入框，再由用户发送。模型的单文件提案在扩展审阅、采用，最后显式保存并读回。第二轮重新建立读取请求，以第一轮保存后的真实文件为基准。

这是结构化文本往返，不是给模型注册 MCP 工具。复制按钮只是辅助。自动识别、Native 读取、输入框回填、网页发送分别显示；输入框已有草稿、回答生成中、导航或迟到结果会拒绝。新结果的独立网页输入框读回通过也只代表“已回填”，没有自动发送。完整协议与使用说明见 [R2 当前实现](../architecture/browser-framework/webcodex-chat-edit-r2.zh-CN.md)。

## 验证等级与本机交接

本轮 Node CLI、请求/回填/提案、Workspace 集成测试、真实 npm tarball 安装和生产构建的结果见 [R17 工作记录](workstreams/local-directory-cli-r17.md) 与 [R2 工作记录](workstreams/webcodex-chat-edit-r2.md)。历史 Actions 只代表其原候选与环境；新的组件测试和 Go 临时磁盘测试不证明用户 Mac 已安装或网页 P0 已通过。

本次网页执行器是 Linux，不能访问用户当前 Mac/Chrome。实际 executable、Native manifest、全局 npm 登记、Chrome Profile、扩展加载 hash、P0 及两轮真实 ChatGPT 修改均为 `NOT_TESTED`。本地 Codex 执行 [完整 Mac 验收任务](prompts/goal-webcodex-chat-edit-r2-local-acceptance.zh-CN.md)，优先复用健康安装，按文件保留并集成并行改动，不新建分支/worktree，不强推。

相关组件：`native-agent/local-dev/dev-cli.mjs`、`provider.mjs`、`src/native-agent/workspace.js`、`src/ui/local-project.js`；Go：`internal/browsercli/dev_unix.go`、`internal/browserbridge/host_dev_multi_unix.go`、`dev_workspace_unix.go`、`files_service_unix.go`、`workspace_store_unix.go`。

### 明确权限变化后的恢复

长期授权变化会单向淘汰该目录的旧 CLI 代次。即使后来改回 RW 或撤销新加的 RO，旧请求、旧提案和旧回执也不能恢复。停止原 owner CLI 后重新接入，再重新绑定对话并读取真实文件；重复启动不能代替这一步。其他目录的有效会话不受影响。
