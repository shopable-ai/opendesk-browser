# Sidebar 本地项目操作

[返回总入口](README.md)。Sidebar 和 Codex 使用同一授权源码 provider 和原执行体系。**直接编辑**无需本地项目服务；**本地项目**在电脑的编辑器/Codex 中修改文件，可经 R17 目录 CLI 或保留的高级 MCP → 已配对 Native Host 提供源码。保存项目文件会自动准备合法的已授权项目，业务仍只在明确点击运行时执行；运行前复核当前内容。

## 首次使用：两种开发方式不要混淆

- **直接编辑（默认）**：打开「开发」就能在 Sidebar 输入 JavaScript，保存或运行由用户操作；无需安装 MCP。
- **本地项目（按需开启）**：在电脑编辑 JS 单文件或多文件目录，推荐在目录执行 `opendesk browser` 或 `opendesk-dev` 接入已有 Workspace，选择授权的可运行程序时才在 Sidebar 明确运行。Node 负责多文件 Resolver，**无需先配置 Codex MCP**；高级 MCP 和受信 Go 单文件授权仍可独立使用。首次需完成 Go Native 配对和 R17 npm CLI 安装，详见 [R17 指南](../framework/local-directory-cli-r17.zh-CN.md)。
- **扩展源码热更新**：开发 OpenDesk Browser 自身时使用 `npm run dev`，输出更新到 `dist/development`，详见 [扩展开发指南](../framework/extension-development-r131.zh-CN.md)。它不会自动连接 MCP、显示本地项目，也不会执行任何项目脚本。

每次打开 Sidebar 的「开发」都默认为**直接编辑、Switch 关闭**。即使旧版本保存过开启状态，也不会自动恢复该模式或连接本地 provider；项目选择和项目参数仍可留存，下一次手动打开 Switch 后核对连接。

## 本地项目与手工导入编译产物的区别

**日常多文件开发仍推荐「本地项目 + 目录 CLI」。** 在本地修改项目文件，保持目录 CLI 前台连接，在「开发」开启「本地项目」、选择项目，再明确点击「运行本地项目」。合法项目保存后会自动准备；每次运行仍复核当前源码，保存文件本身不会执行业务。

```bash
opendesk browser dev "/absolute/path/to/project"
# 同一目录接入能力的 npm CLI 入口，二选一即可
opendesk-dev "/absolute/path/to/project"
```

`opendesk-dev` 是命令名，后面的路径才是项目目录，不要求创建名为 `opendesk-dev` 的目录。安装与配对前提见 [R17 CLI 指南](../framework/local-directory-cli-r17.zh-CN.md#最短使用方式)。

另一条已有路径是：**本地构建固定 `program.js` → 导入程序产物或把完整代码粘贴到「直接编辑」→ 明确点击运行/当前网页试运行**。它适合核对一个确定构建的行为，尚未关联本地项目目录。编辑器识别编译产物后会显示只读产物信息和 SHA-256；没有项目源码快照时，普通代码输入框会隐藏。此时应回本地修改源文件，重新构建并导入。

| 对比 | 本地项目 | 手工导入编译产物 |
| --- | --- | --- |
| 工作台拿到什么 | 已授权的项目来源及当前准备结果 | 本次导入的固定程序字节 |
| 修改源码后 | 保存触发准备，再明确运行并复核当前内容 | 重新构建、重新导入，再明确试运行 |
| 是否需要目录 CLI 连接 | 需要目录来源连接（也可用已有高级 provider） | 导入产物不需要关联目录 |
| 编辑器展示 | 项目选择、准备状态和运行入口 | 只读产物；源码快照存在时也仅供查看 |

两者沿用原有执行和权限体系。Page 使用「在当前网页试运行」，Controller 使用对应运行入口；试运行、保存固定版本与正式安装是不同操作。

**ChatGPT Mind Map R3.9.6 本轮使用的是手工导入路径**：本地专用 builder 把固定 XMind 资源写入临时项目，再生成 `program.js`，粘贴到「直接编辑」后执行 Page 试运行。它没有启动目录 CLI，也没有打开「本地项目」开关，因此改业务源码不会自动更新已导入的程序。原因、具体命令及限制见 [业务开发说明](../../examples/programs/chatgpt-mindmap/README.zh-CN.md#本轮实际开发方式2026-10-17)。这是一条本地调试路径；继续普通项目开发时优先使用上面的目录连接流程。

另一个独立概念是扩展仓库根目录的 `npm run dev`：它更新 OpenDesk 自身的 `dist/development`，不代替业务项目的目录连接、编译或运行。

## 连接、选择和运行

1. 在 Chrome 打开允许的网站和同窗口 OpenDesk Sidebar，进入「开发」。展开「当前网页」核对 URL；首次配置见[快速入门](quickstart.zh-CN.md#首次配置)。
2. 打开「直接编辑 / 本地项目」区域的 **「本地项目」开关**，阅读提示。未连接时优先点击 **「连接本机 OpenDesk」**，它打开扩展原生授权设置，不自动运行脚本或放宽项目/网站权限。当前开发版如 Host 未预配，仍需 [Native 初次配置](quickstart.zh-CN.md#首次配置)；Go 已有合法绑定时重复 setup 无须输入 ID。项目列表才是下拉框，不存在模式下拉菜单。
3. 点击 **「刷新」**。预期显示「已连接 · 点击『运行本地项目』才读取并执行最新源码」，列表包含已授权且 attach 的项目。只有一个项目可自动选中，但不会执行。「暂无已授权项目」时检查允许路径与 attach；「项目名 · 离线（待连接核验）」是经过验证的历史展示缓存，不允许离线文件读盘或运行；同名目录以来源身份区分。
4. 选择 local-controller，展开 **「项目参数 JSON（Controller 可选）」**，输入 `{}`。Page 保持空对象，不传 Controller 参数。
5. Controller 和 Page 本地项目都点击底部 **「运行本地项目」**。点击时读取最新文件，检查目标与授权；Controller 显示持久结果，Page 在网页显示试运行 UI 和预览回执。只有直接编辑模式才使用「运行草稿」或独立的「网页 JavaScript 试运行」。
6. 展开 **「运行目标与版本」** 查看身份；Controller 核对 runId/resultId、版本与释放状态。连接状态详情的「上次读取源码 SHA-256」只代表上一次读取，不保证磁盘始终未变。

目标默认当前网页。高级 Controller 的「创建隔离网页」「手动选择精确文档」沿用原目标合同，初次教程使用 demo-form 即可；Sidebar 自身文档不是目标网页。

## 修改和 Stop

本机修改 local-controller 的 extract.js，保存后明确再点运行。新结果显示 version 2，旧结果保持原身份和值。Sidebar 不把本地文件复制成手工草稿；Sidebar 发起的 Controller 运行从原结果入口读取；只有同一 MCP Session 经 dev.run 发起并登记的运行，才可由该会话 dev.result 查询。共享源码 provider 不等于共享运行归属。

Page 修改 model/CSS 后明确再预览，旧受管实例清理确认后才挂新 UI。**「停止受管 UI」** 清理原 previewId 登记资源。MCP provider 断开时，新本地 Run 禁用；原 Sidebar Host 已拥有的受管 UI 仍可 Stop，但仍要求原项目、Host、文档及网站权限有效。清理期间和清理未知时禁止新 Run。

Controller 的「停止」走原 RunHost；确认终态及 `retirementState:"released"`。Stop 不回滚已经发生的业务效果，详见[Controller](controller.zh-CN.md)与[Page](page-userscript.zh-CN.md)。

## 草稿保存与关闭重开

关闭本地开关恢复「直接编辑」的输入框。手工源码/参数与本地参数分别保留，切换不覆盖未保存草稿；保存不等于运行、安装或发布。仅保存本地项目选择和本地参数，**不持久化开关开启状态**；不把收到的源码持久化成导入草稿。

关闭重开默认直接编辑，但仍保留先前所选项目。再次手动开启本地开关时，使用新 Host 身份重新检查连接/网页；不会恢复旧 MCP Session 或静默接管旧预览。旧项目/provider/文档的迟到源码回包被拒绝，不把缓存旧字节当本次运行。

成功 Page 预览后的「保存网页脚本版本」形成固定 Candidate，须核对源码与文档，详见[统一指南](../product/program-development-dual-format-and-sidebar.zh-CN.md#page-试运行后保存固定版本r12-候选入口)。Candidate 不等于 Installed，不代表下次打开网页自动执行。

| 状态 | 操作与预期 |
| --- | --- |
| 未连接本地开发服务 | 先检查 Native 配对，再核对实际使用的目录 CLI 或 MCP Provider 与当前 Host；区分首次授权和已授权连接丢失，恢复后点「刷新」，不要重复启动同目录 Provider |
| 项目不可用 | 检查 exact path/attach/package，重新选择实际项目 |
| 参数无效 | 输入符合 paramsSchema 的 JSON 对象，local-controller 用 `{}` |
| 网站/文档已变 | 核对新网页范围和授权，只读查原执行，再决定新的有意运行 |
| 清理失败/未知 | 保留 previewId 只读查状态；未知清理栅栏需关闭原标签页，在新文档重新开始 |

重开 Sidebar、反复 Run/Stop 或换项目不能消除未知效果。[完整恢复规则](dependencies-and-errors.zh-CN.md#断连和未知结果)。真实控件：[tool.html](../../src/ui/tool.html)、[本地视图](../../src/ui/local-project.js)。

## 故障复盘与防回归（2026-10-16）

### 已证实的原因与证据边界

这次排查经历了实现回归与现场连接问题，不能合并成一个“Provider 卡死”的结论：

- **此前的实现回归**：把目录发现后的主操作改成「打开文件工作区」，`start()` 的目录分支绕开了 `startLocal()`；目录先出现、可运行程序稍后注册时，也缺少同来源的选择关联。纠正后恢复既有运行链，补上唯一同来源关联，以及异步准备结束后的槽位和 Host 复核。文件工作区仍只是编辑入口，不能替代项目运行。
- **原 local-controller 的现场阻塞**：初始当前标签页是 `chrome-extension://…/native-agent/workspace.html`，不能作为 HTTP(S) 运行目标；当时原项目 Provider 已注册。切到标准 `demo-form.html` 后，「运行本地项目」可见可点，并真实执行了原项目。
- **验证途中另一次连接丢失**：原 CLI 和 Native 进程退出后，Provider 离线；Native doctor 显示连接正常也不能证明项目 Provider 在线。核对配对和实际 attach 成功后，用原已安装 CLI 重新接入恢复。原终端后续 stdout/stderr 未取得，**进程退出原因仍未知**，没有证据归因为 CLI 版本不匹配或项目入口损坏。

原项目已取得 v1、模块 v2、语法错误拒绝、Stop 和资源释放的局部真实 Chrome 证据；先前临时项目和 Node 测试只证明各自范围，不能代替原项目。完整同候选 Native、production、F3、ZIP 仍未验收。具体身份、失败日志和结果见[唯一工作记录](../framework/workstreams/developer-project-catalog-stability-20261016.md#原-local-controller-续修2026-10-16--01a143ac)。

### 下次按同一项目逐段核对

| 阶段 | 必须核对的事实 | 对应处理 |
| --- | --- | --- |
| 实际 CLI 与进程 | 可执行路径、版本、进程是否存活、完整后续 stdout/stderr | 不从两行接入输出推断挂死或注册成功；先保存日志，再核对安装实现与仓库相关文件，不默认重装 |
| Native、目录与 Provider | Native 配对；目录 lease、`sourceId/workspaceId`；Provider 注册回执与 `providerEpoch` | 「Host 已确认目录身份」不等于「可运行源码 Provider 已注册」；只缺 Provider 时排查该连接，不重建权限系统 |
| 发现与选择关联 | `projects.list` 的当前 `bindingId`、来源身份、UI 实际所选对象 | 同名目录不等于同来源；目录先到时，只能关联唯一且身份一致的当前程序，多入口或冲突不能猜选 |
| 入口与源码准备 | 原 `package.json` 的明确入口、依赖、准备状态、`inputHash/sourceHash` 和具体错误 | 保留原项目运行方式；最新源码失败就显示原因，不能执行任意 JS、手工草稿、其他项目或上次成功缓存 |
| 目标与运行条件 | 当前 HTTP(S) 网页及精确文档、网站权限、Host、运行槽位、停止/未知效果栅栏 | CLI 可能打开文件工作区，运行前回到目标网页；按实际原因处理权限或占用，不仅删除按钮的 `disabled` |
| 实际派发与结果 | 主动点击后使用所选源码；Controller 的 `runId/resultId`、结果自身 `revision.sourceHash`、终态与 `retirementState`；Page 的预览与资源身份 | Controller 和 Page 分别走既有 `run.start` / `page.preview`；不以打开文件页、按钮可点或旧结果代替运行成功 |

CLI 身份与连接的只读核对命令：

```sh
command -v opendesk-dev
opendesk-dev --version
opendesk-dev --doctor --json
opendesk browser doctor
```

同时核对真实 Chrome 加载路径、扩展 ID、doctor 的 `local.extensionId`、Native `allowed_origins` 和开发服务连接。磁盘有新产物不代表当前 UI 或后台已加载该版本；分别记录已加载指纹。日常复用已有 `npm run dev` 和 `dist/development`，不另起构建覆盖 watcher，也不绕过安全更新栅栏。

### 修改与验收时保留的约束

- 底部保留「运行本地项目」及 `start → startLocal → resolve/assertReady/assertCaptured → run.start/page.preview`。文件打开只作辅助；准备完成后仍复核来源、版本、目标、权限和槽位。
- 保存、选择与轮询只更新准备状态，不自动执行；相同轮询不重建选项或按钮，保留项目选择与手工草稿。断连重接后重新核对来源和 Provider 身份，不接管旧运行。
- 必须用用户原项目在标准测试网页真实点击验证；修改同一模块后，下一次主动运行应对应新源码哈希，错误版本不得回退执行；再核对 Stop、释放及草稿/选择保留。
- 先按[测试复用规则](../framework/testing-guide.md#什么时候重测)检查输入是否改变，再补受影响验证。保留失败和未知原因；组件、临时项目、原项目局部实测与完整候选验收分别记录。

## R23 自动准备

连接后编辑并保存JS、CSS或声明资源即可后台准备，默认约400ms合并修改。点击现有运行按钮复用已准备版本；最新源码有错误时报告错误，不回退上次成功版本。保存不执行网页业务。

Node Provider提供已就绪、更新、合并与错误状态；现有Go列表转发尚不携带这些细状态，因此Go目录CLI路径的实时显示未闭环。展开连接诊断可查看上次读取的输入版本、sourceHash、命中/构建次数与耗时，它不保证磁盘始终未变。详细实现、实测与未通过项见[R23说明](../framework/local-development-prebuild-r23.zh-CN.md)。

## R25.1：本地项目运行验证后保存固定版本

开发选项卡仍使用原有 `#develop-dock`：直接编辑模式的「保存版本」保存手工 Controller 草稿；开启本地项目后底部按钮先显示「待运行验证」，**不会读取旧运行结果直接安装**。运行成功且来源返回可核对的 `inputHash`、`sourceHash`、`sourceBytes` 后，Page 显示「保存到我的工具」，Controller 显示「保存为任务」。点击后在原页面内审阅名称、版本、当前来源和允许网站，再按「确认安装固定版本」。

确认前再次由已授权 Provider 解析项目，核对 `bindingId`、`providerEpoch`、输入版本、完整源码哈希、字节数和当前网页文档；源文件一旦变化，就要主动重新运行，不能用上次预览为新版本安装背书。文件保存仅触发准备，不自动运行、安装或发布。重复提交、回执不明和版本 CAS 冲突不自动重试。

- **Page USER_SCRIPT**：使用既有 `importPageCandidate → verifyPageCandidate → makePageAvailable → installPageProgram`。正式 Verify **会再次执行同一冻结源码**，确认区会明确提示网页副作用；未通过正式验证不安装。普通 JavaScript 生成的默认匹配只覆盖本次预览的协议和主机，仍需授权审核；有特殊项目规则须单独审阅。安装事实归原 Page Authority，而不是 Side Panel JSON registry。在「工具 → 已安装网页工具」读取、停用或启用；浏览器原生用户脚本开关和站点权限仍适用。
- **Controller**：从同一持久 `runId` 和结果自身 `sourceHash` 建立 `opendesk.task.v1` 候选，使用原 `verifyTaskCandidate → makeTaskAvailable → installTask`，无需重复运行。Task v1 必须有原生页面操作成功回执且仅允许一个确切 HTTP(S) origin；只有返回值而无页面操作回执的运行可能不能正式验证。成功后在「我的」任务列表重复使用。
- **Side Panel JSON 工具**：没有项目格式转换合同就不冒充 `opendesk.sidebar-tool.v1`；继续使用现有包构建、共享安装服务及「工具」导入。
- **升级**：已安装版本与当前项目源码分离。相同稳定身份采用新版本，安装前核对原安装基线，升级保持原停用状态；已经安装的工具无需持续连接开发 Provider 才能执行已冻结源码。
- **市场**：本地保存、运行、安装、升级与远端发布是独立操作。现有市场只有随扩展分发的官方固定 Catalog 和本机安装功能，尚无可确认的在线作者发布 API，不能把「设为本地可用」当作网上发布。

实际 Mac Chrome、真实 Native Provider、浏览器重启及安装失败恢复仍需按 `docs/framework/prompts/goal-r251-mac-final-acceptance.md` 验收；源码提交与组件测试不代表这些已通过。
