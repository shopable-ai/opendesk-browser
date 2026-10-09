# OpenDesk 本地源码与 MCP 直接运行（R2.2）

日常开发：**连接允许的项目 → 修改源码 → 直接运行 → 查看结果**。

Controller 多文件直接运行（P0）、Page USER_SCRIPT 本地预览（P1）、真实 Sidebar 目录连接（P2）和受管 UI 显式安全刷新（P3）均已完成实际代码与 macOS Chrome 验收，并通过 PR #37 / #42 合入 main。候选 `99a26c38e576ad0653143dd130582d15820054d6` 的原始结果为 `PASS_P0_P1_P2_P3_REAL_CHROME`，22 项真实断言通过；合并 main `4adf5dc4966f82a71c2c5116f8d5a35c21eafd06` 与它具有相同完整 tree。见 [原始 CI 摘要](evidence/local-dev-r22-c036/p3-ci-summary.json)、[交付报告与未测矩阵](local-development-r22-report.zh-CN.md) 和 [工作记录](workstreams/local-dev-r22-c036.json)。这项定向通过不表示整个框架 F3 或全部异常时序已验收。

本地开发机必须同时拥有项目目录、Node.js 和目标 Chrome。网页版 ChatGPT 的云工作区不能直接读取用户 Mac 的 `/Users/...`；本轮云端开发与独立 macOS CI 的真实浏览器测试，也不等于已经配置好用户本机 Codex。

## 架构选择

| 方案 | 职责 | 选择 |
| --- | --- | --- |
| A：Codex → MCP → 现有 Native | 读取最新目录，运行真实浏览器并取得结果 | 主路径：Controller 使用原 run.start/get/stop；Page 使用类型专用 page.preview/get/dispose，再进入原 USER_SCRIPT |
| B：Sidebar 连接同一项目 | 原运行按钮按需读取源码 | 同一 MCP 进程的 Resolver，通过现有 Native 私有 Socket 和已登记 Host Port 提供源码 |
| C：轻量热加载 | 失效缓存、受管 UI 安全刷新 | 渐进增强；当前显式再运行重新读盘，无文件监听或自动业务重执行 |

旧流程把正式发布的不可变产物当成每次开发运行的前提。自动构建并上传 JSON 仍保留这层交接。Local Dev 把读取、验证和必要的 ESM 合并放进运行请求，在内存中产生本次执行字节，再进入原 Native → 已注册 Host → RunHost → Authority → Controller Worker。

只使用一个 LocalDevResolver 和既有 opendesk.project.v1，没有项目开发服务器、第二套 Controller 或浏览器内 IDE。Node 负责有界文件读取和转换；扩展负责权限和目标；Controller 负责自动化；Page DOM 程序必须通过 USER_SCRIPT 专用入口。

Sidebar 连接需要已配置的 MCP 进程保持运行。它在**原有 agent.sock** 上登记一个只读源码 provider，Native Host 不独立扫描磁盘。当前一个 Native Host 只接纳一个 provider，不要为 Sidebar 另开第二个相同 MCP 进程。MCP EOF 关闭这个 provider；已入场运行不会因此被自动重试或接管。

## 首次配置

开发机使用仓库要求的 Node.js（当前 >=22.12.0）。仓库依赖只需准备一次：

```sh
npm ci --ignore-scripts
```

扩展需要一次加载包含本轮实现的版本。首次在仓库根目录执行，替换 Chrome 展示的真实扩展 ID：

```sh
node native-agent/cli.mjs setup --extension-id "实际扩展ID"
```

Chrome for Testing 使用 `--browser cft`；独立测试 profile 同时传 `--user-data-dir /absolute/profile`。不通过改变 HOME 隔离 macOS Chrome。同一安装绑定明确的浏览器、profile 和扩展；切换前先关闭 Native 连接，再安全 cleanup。

在扩展现有设置页点击“授权并启用”，批准 Chrome Native Messaging 权限。目标网站授权独立通过 Chrome/Sidebar 原入口进行。保持同窗口 Sidebar 或真实包内工作台打开；Native 不会另建隐藏执行宿主。

Page 项目还需在 Chrome 扩展详情开启“允许用户脚本”。首次授予可选 Native 权限后，若 Chrome 提示重新加载扩展，应完成这次初始化；后续修改项目文件不需要重新安装或重新加载扩展。

**已有旧版 Native 安装时，只需升级一次。** 安装器复制 Node Host 文件到私有安装目录，仅更新仓库或扩展不会更新这个快照。先确认运行已收尾，在扩展设置页停用 Native，再用原扩展 ID、浏览器和 profile 参数执行：

```sh
node native-agent/cli.mjs update --extension-id "实际扩展ID"
```

更新后重新启用并查看 `dev.status`。`E_SOCKET_IN_USE` 表示旧连接尚在，应先关闭它，不删除正在使用的 socket 绕过检查。同一绑定的升级无需 cleanup；`doctor` 成功也不代表旧安装文件已自动升级。

配置 Codex 本地 stdio MCP：

```sh
codex mcp add opendesk-dev -- node "/Users/shopme/Documents/workspace/opendesk-browser/native-agent/local-dev/mcp.mjs" --allow-project "/Users/shopme/Documents/workspace/opendesk-browser/examples/programs/local-controller" --allow-project "/Users/shopme/Documents/workspace/opendesk-browser/examples/programs/local-page-ui"
```

CLI 形式依据 [OpenAI 官方 MCP 文档](https://developers.openai.com/codex/mcp)。其他标准 stdio MCP 客户端可使用相同 command 和参数。本适配器明确实现 2025-11-25 兼容协议，stdout 每行一条 JSON-RPC，诊断进入 stderr。

`--allow-project` 是文件读取授权，最多重复八次，必须填写明确允许的项目目录或单个 .js/.mjs 文件。attach 不能扩大范围。不需要 HTTP 源码服务或 frozen-request.json。

允许的目录在 MCP 启动时自动 attach，`status.projects` 返回 bindingId；再次显式 attach 同一路径也可以。单文件仍需显式 attach 运行类型和精确 siteOrigin。绑定本身不表示源码、网站或 Native 已通过运行验证。

## 日常多文件实例

在仓库根目录启动唯一标准测试网页：

```sh
python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks
```

打开 `http://127.0.0.1:43111/demo-form.html` 和同窗口 OpenDesk 工作台。该 HTTP 服务只提供测试网页，不读取、转换或同步项目源码。

告诉已配置 MCP 的 Codex：

> 阅读 .agents/skills/opendesk-program-publish/SKILL.md。连接 examples/programs/local-controller，在当前 demo-form.html 上运行并查询结果。修改 src/extract.js，将 version 改为 2，并增加网页 h1 文本，再直接通过 MCP 运行。不要执行 build:program，不生成或上传草稿 JSON。报告两次 runId、实际哈希和结果。

Codex 从 status 获取自动绑定的项目，或调用 attach，然后 status → run → result；参数经 MCP 传递，用户不手写 JSON-RPC 文件。例子入口：

```js
import {readSummary} from './extract.js';
export default async function main({page}) {
  return readSummary(page);
}
```

第一版 extract.js 返回 `{version:1,title:await page.title()}`。第二版依赖文件：

```js
export async function readSummary(page) {
  return {
    version:2,
    title:await page.title(),
    heading:await page.locator('h1').textContent()
  };
}
```

再次 dev.run 使用代表本次有意执行的新 requestId。新结果包含真实 h1 文本；原运行源码与结果仍冻结。两次之间不 build、不上传、不覆盖草稿、不重新安装扩展。完整可编辑例子见 [local-controller](../../examples/programs/local-controller/README.md)。

Page 示例见 [local-page-ui](../../examples/programs/local-page-ui/README.md)。修改 `src/model.js` 的按钮文字、计数步长和 `assets/ui.css` 后再次显式预览，按同一资源合同读取新文件。返回的是 previewId，真实 world 为 USER_SCRIPT。本地受管模式显式再次运行时，先验证新源码，再在原 USER_SCRIPT 世界等待旧受管实例清理，确认后才挂载新版本。P3 的最终原生状态以工作记录为准。

## Sidebar 连接同一目录

在现有「开发」页展开「本地项目连接」，切换为「本地项目」，选择 `--allow-project` 已授权的项目。点击原运行按钮时，浏览器从同一个 MCP provider 获取最新源码，在浏览器再次核对 UTF-8 字节数、SHA-256、连接 epoch 和精确目标，再交给原运行链。

手工草稿和本地模式分别保留。切换不会覆盖未保存的手工源码或参数；本地 Controller 参数有独立输入。保存项目选择、模式与独立的本地 Controller 参数草稿，不把收到的执行源码持久化为导入草稿。Sidebar 关闭后重开会使用新 Host 身份恢复选择，实际连接和网站状态仍需重新核验。

「上次读取」显示已读取版本的哈希，不声称磁盘始终未变化。MCP / Native 断开时本地运行禁用并显示断连；重新连接后通过「刷新连接」获取当前 provider。切换项目、模式或连接身份期间到达的旧源码回包会被拒绝，不能回退到最后一份代码。候选 45161bcb 已验证真实 Sidebar 重开、版本更新、手工草稿保留和 MCP 断连。

## 七个 MCP Tools

| Tool | 参数 | 行为 |
| --- | --- | --- |
| opendesk.dev.attach | path；单文件还需 runtimeKind、siteOrigin，可选 entryFormat | 返回 bindingId，只绑定允许路径 |
| opendesk.dev.status | 可选 bindingId、registrationId | Native 状态、项目、精确目标或 targetError |
| opendesk.dev.run | bindingId、requestId；可选 params、registrationId、deadlineMs | 最新源码入场：Controller 返回 runId/revision；Page 返回 previewId/sourceHash、durable:false |
| opendesk.dev.result | 恰选 runId、previewId、admissionRequestId 之一 | 查询原执行；admissionRequestId 先只读恢复原入场身份，不重跑 |
| opendesk.dev.stop | 同样恰选一个执行身份；可选本次 Stop 的 requestId | Controller 原 RunHost Stop；受管 Page 清理原 previewId 的登记资源，返回 preview-retired；非受管 Page 明确拒绝 |
| opendesk.dev.diagnostics | 可选 bindingId；或 runId / previewId / admissionRequestId | 解析错误、原运行诊断或入场恢复；bindingId + admissionRequestId 核对项目归属 |
| opendesk.dev.detach | bindingId | 解除绑定与缓存，不修改/停止已入场运行 |

attach.connected:true 只表示本地绑定。status.connected:true 只证明 Native 可达；还须检查 target/targetError、Host 列表。多个 Host 时明确选取真实 registrationId。

Controller deadlineMs 为 1000–120000，默认 30000。run.completion:PENDING 只表示入场。核对 `revision.sourceHash === source.sourceHash`，再查原 runId 的 state、retirementState、resultId、value/error。普通成功运行必须完成并释放 Worker；没有持久结果不能当成功。

Page 不接收非空 Controller params，也不能修改 Controller deadline。`preview-evaluated` 表示此次 USER_SCRIPT 求值完成，不代表 UI 已销毁；Page 没有 Controller 的持久 resultId。`dev.stop({previewId})` 仅对受管 Page 执行 typed `page.dispose`，成功返回 `preview-retired` 和 `scope:"managed-ui-only"` 的清理回执；非受管 Page 返回 `E_PAGE_PREVIEW_STOP_UNSUPPORTED`。它不取消任意 USER_SCRIPT、不回滚网页业务效果，也不产生 Controller resultId。

Controller 结果以 `valueProtocol:"opendesk.value.v1"` 和 `valueWire` 为准。仅当值能无损表示为 JSON 时，额外返回 `valueIsJson:true` 和 value；undefined、负零等值不会被悄悄改成 null 或 0。失败返回真实 error。

source.inputHash 绑定源码图、配置、资产、框架 helper 与编译器版本；source.sourceHash 绑定最终执行字节。仅修改注释时输入图可以变化而压缩后执行字节不变，按真实哈希解释。

## 显式热刷新和受管 UI 清理

Controller 文件修改只影响下一次显式运行，已入场 Worker 的源码身份保持冻结。没有自动保存触发的点击、提交或下载，也没有文件监听、独立 HMR 服务、CSS 增量刷新或模块状态保留。

本地 Page 项目真实导入 `@opendesk/ui` 时启用受管生命周期。再次运行同一 binding、同一文档时，平台从既有 world ledger 找到原实例，先验证新代码并证明新的隔离世界可用，再在原世界执行固定清理入口。只有原 nonce、原 documentId、本次清理 nonce、登记 Host 和成功回执全部匹配，才执行新项目代码。清理不退还每文档 6 个预览世界的预算。

`ui.on`、受管 timer/observer、Object URL 与 `ui.onDispose` 登记的资源纳入清理。异步事件和清理函数必须返回其 Promise；未返回的异步任务或自行创建的网页资源无法被平台证明已结束。进入清理后，所有受管实例停止接纳新回调，等待已经开始的回调和异步清理。`ui.destroy()` 保持同步、幂等；平台另行等待其清理状态。没有创建任何受管资源时返回 `instances:0` 的空清理，只代表这项登记范围。

清理抛错或拒绝会阻止新版本。5 秒内未结束、缺少回执或状态不能持久确认，则保留共用执行栅栏，禁止重试；关闭原标签页才能释放未知预览栅栏。已确认清理失败时可重新加载网页获得新文档后再运行。不要用移除 DOM、伪造关闭事件或切换新 Host 冒充清理成功。新 Host 不静默接管旧文档的受管实例；移除 UI SDK 前先显式 Stop 原实例，否则报 `E_UI_MODE_CONFLICT`。

Sidebar 原 Stop 按钮对本地受管 Page 显示“停止受管 UI”，仍核对所选项目、原 previewId、原文档、Host 与网站权限。MCP provider 断开只禁用新的源码运行；原 Host 已拥有的受管 UI 仍可通过这个按钮清理。清理期间禁用 Run。普通手工预览和正式任务的合同保持原样。

## Resolver 和安全边界

每次运行重新读取入口依赖图及声明资产，缓存命中时也重新验证。多文件 ESM 使用唯一现有 program builder 的内存接口，只读冻结内存文件系统，不执行项目配置、loader、plugin、shell 或网络解析，不落盘开发产物。无需转换的单文件 Controller/Page 保留原执行字节；Page 的普通 `async function main(){return document.title;}` 由既有 USER_SCRIPT 消费器调用。

| 范围 | 当前行为 |
| --- | --- |
| 单文件 Controller | async body/main，不强制 package.json，类型和精确 HTTP(S) origin 必填 |
| 多文件 ESM | 既有 package.json.opendesk，静态相对 import，入口 default export；支持依赖中的顶层 await |
| @opendesk/ui 与 Page 资产 | 固定本地别名、CSS/JSON/图片合同；P1 示例已有真实 USER_SCRIPT 回执 |
| npm import | 已安装且 package-lock v2/v3 根依赖一致、直接版本精确、实际消费包具有 HTTPS/SHA-512 锁；读取实际闭包，不扫描整个 node_modules |
| HTTPS import | 仅使用显式 opendesk.remote-lock.json 与 .opendesk/remote-cache 中已锁字节；缺锁、缺缓存、哈希变化立即拒绝，dev.run 不联网或生成新锁 |
| 动态代码 | 不支持 dynamic import、require、项目 loader、eval/Function 等 |
| 路径 | canonical realpath、根 inode、内部 symlink、遍历、隐藏和常见密钥文件检查 |
| 传输 | 只传执行需要的代码和资源，不传源文件树、绝对路径、source map 或整个工作区 |
| 缓存 | 内存缓存；最新图和最终验证一致才复用，源码错误不退回旧版 |
| 并发修改 | 发现读取/转换期间变化则拒绝；新一次有意运行重新读取 |
| 执行时改文件 | 源码 revision 与初始入场身份固定，仅影响下次运行；受控导航只按原 Authority 目标会话推进，不能切换无关会话 |
| 项目 ID/类型变化 | 显式 detach/attach 后才能使用，不暗中切换环境 |
| 已安装任务 | 原不可变版本和既有运行链，不需要 MCP 或开发目录 |

源码/资产快照仍最多 100 文件、384 KiB；现有项目验证器和各资产类型另有更小限制。锁文件单独最多 2 MiB npm 锁 + 128 KiB HTTPS 锁。实际消费的 npm/HTTPS 依赖快照最多 1024 文件、2 MiB，npm 单文件最多 1 MiB；HTTPS 仍受原 32 模块、单模块 128 KiB、总计 256 KiB 合同约束。未读取的 node_modules 文件和无关锁缓存不计入快照。所有已读输入（包括依赖、包身份和锁）在返回前再次检查字节与文件身份；运行后的改动只影响下一次有意执行。

npm 安装是独立动作：对已有精确锁项目执行 `npm ci --ignore-scripts`。HTTPS 首次锁定/更新也是独立明确动作，使用现有正式 builder 的 `--lock-remote`，将 `--out` 指向项目外临时目录并在核对后清理临时产物；保留原锁名、缓存和来源。`opendesk.dev.run` 与 `buildProgramProjectInMemory` 不会隐式锁定或下载代码。日常运行无需 program.js、草稿 JSON 或构建交接文件。

本地执行字节与正式生产 builder 的 canonical `sourceHash` 一致；原始源码映射只在 MCP 本地保留，HTTPS 原文及 URL、npm/本地原文件映射保留。最终 Controller/Page 字节上限仍为 65536/100000；Native **完整 JSON envelope 为 60 KiB**，含转义、参数和元数据，可传源码实际更小。超限如实拒绝，不关闭检查、不加未经验证分包。R10.1 本轮组件与限制见 [resolver 工作流](workstreams/r101-resolver-01a120c0.md)；真实 Chrome/Sidebar 证据由独立验收工作流记录。

Native 继续校验明确扩展 origin、私有安装/凭据/Socket。MCP 不对网页监听 HTTP。浏览器再次检查网站授权和 windowId/tabId/frameId/documentId/url；读取期间导航不能把旧运行送到新文档。

## 错误与恢复

- 源码缺失、语法、越界、体积：拒绝本次；diagnostics 给出真实错误与可得位置。
- Native/Host 不可用：准确报错，不启动备用 CDP 引擎。
- 已发送后断线或 OUTCOME_UNKNOWN：保留原 requestId/runId，核对原结果与网页状态，不换 ID 盲目重复副作用。
- 网站撤权：拒绝新运行，历史结果遵守 Authority 的交付权限。
- MCP 进程重启会重新 attach 明确允许的目录，但不恢复旧请求摘要或 Session 的 Run/Preview 归属；重新 attach 不等于接管旧执行。
- Sidebar 重开产生新 Host 身份，不能冒充旧 registrationId。
- 运行错误保留真实生成堆栈/消息；未完成映射的源码行号不编造。

### 原请求丢失入场回执

在**同一个仍存活的 MCP 会话**中，保留原 dev.run 的 requestId，并调用：

```js
opendesk.dev.result({admissionRequestId:"原来的 requestId"})
// 或只查看恢复状态：
opendesk.dev.diagnostics({admissionRequestId:"原来的 requestId"})
```

适配器用原请求类型、Host 身份和 canonical 输入摘要调用只读 Native `request.get`。它不重新解析现在的磁盘源码，也不重发 run.start / page.preview。只有确认原 ledger 入场身份、执行哈希和初始目标全部一致后，才恢复原 runId / previewId。

`NOT_FOUND` 与 `OUTCOME_UNKNOWN` 均不能证明先前没有执行；恢复查询自身的 Native 断线也不能改变这个结论。较早的未知快照不能覆盖已经验证的 ACK。本地已确认在发送前失败的请求保留原 NOT_DISPATCHED 状态；同一个 requestId 不重新执行。

只读 ledger 可以在原 Host 不在线时返回入场元数据；继续获取结果和 Stop 仍必须满足原 registrationId 归属。MCP 进程重启后缺少这份原请求记录，不能自动接管。`request.get` 是内部只读 Native 方法，不是第八个 MCP Tool。`admissionRequestId` 只指原 `dev.run`，不指 Stop 请求；清理丢 ACK 后只能查询原 previewId 的已有状态，未知结果不换 ID 自动重复清理。

## npm / HTTPS 锁定构建与本地目录运行的边界

- 本地开发 Resolver：读取最新保存的相对静态 ESM 与 Page UI，按原 Native/MCP/Sidebar 授权执行；受管 Page UI 支持显式再次运行和受控清理，**不自动监听磁盘重执行业务**。
- 正式构建器：项目独立 `package-lock.json` 固定 npm；HTTPS ESM 首次只在开发者**明确批准** `npm run build:program -- <项目> --lock-remote` 时联网，生成 SHA-256 锁和缓存。以后不加此参数离线构建，可导入 `program.opendesk-draft.json`。
- Local Dev 直接写 npm/HTTPS import 目前仍报 `E_DEV_DEPENDENCY`；后续贯通必须复用 R9/R10 构建器和现有 Resolver/RunHost，不绕过 Native、项目目录边界、sourceHash、documentId、失联或 Stop 合同，也不新增依赖 UI。

用户操作顺序、错误处理和实例见 [统一使用指南](../product/program-development-dual-format-and-sidebar.zh-CN.md)，下一步本机实现与原生验收见 [R10.1 Codex GOAL](prompts/goal-r10-1-local-codex-https-esm-acceptance.md)。

## 正式打包与验收

只有需要不可变产物、导入或发布时执行：

```sh
npm run build:program -- examples/programs/local-controller
```

既有 program.js、artifact、草稿包和 Task v1 Candidate 输出保留，用于冻结交付。Candidate → Verification → Available → 显式 Installed 合同不变；MCP 成功或 Git commit 不等于安装、发布或最终框架验收。

组件：`node --test tests/environment/local-dev*.test.mjs tests/environment/script-editor.test.mjs tests/environment/native-agent-bridge.test.mjs`。

真实 macOS Chrome：为框架候选准备 dist 后，提供 CHROME_FOR_TESTING_BIN 并执行 `node tests/framework/local-dev-native-acceptance.mjs`。仅在专用测试账号/独立 profile 运行，不覆盖已有 Native 安装。通过系统原生输入批准 Chrome 对话框；CDP 仅测试观察和可信输入，项目始终通过 MCP/Native/原 Controller 或 USER_SCRIPT 执行。此处框架候选打包用于验收扩展版本，不是项目开发每次运行的步骤。

保存 sourceHead、完整包身份、Chrome 版本、原生授权、两次 runId/resultId/sourceHash/documentId、持久结果与收尾。Node、编译、真实包内 tool 标签、真实 Sidebar、Page UI 和实际 Codex 客户端分别记录证据等级。
