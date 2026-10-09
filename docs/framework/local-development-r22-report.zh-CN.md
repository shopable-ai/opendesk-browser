# R2.2 本地源码直接运行：工程交付与验收报告

> 2026-10-10 当前状态指向：[R10.1 使用说明](../api/README.md)及[后续本机证据](workstreams/r101-development-01a12159.md)。下文保留原候选、失败/未测与云端实施事实；原候选“本机未验收”不代表后续 R10.1 状态。不改写旧结果为新 PASS。

记录日期：2026-10-09。仓库：`shopable-ai/opendesk-browser`。

**核心闭环已经实现并在真实 Chrome 通过：修改多文件项目 → MCP 或已连接 Sidebar 直接读取新源码 → 原 OpenDesk 运行链执行 → 返回实际身份和结果。**项目开发过程中无需手动 build、生成 JSON、上传、覆盖草稿或重新安装扩展。P0–P2 通过 [PR #37](https://github.com/shopable-ai/opendesk-browser/pull/37) 合入；受管 Page 显式安全刷新 P3 通过 [PR #42](https://github.com/shopable-ai/opendesk-browser/pull/42) 合入。

这次实施发生在网页版 ChatGPT 的独立云工作区 `/workspace/scratch/c036cef8c2e4/opendesk-browser`，真实浏览器运行在隔离的 macOS Actions。没有读取或修改用户 Mac 的 `/Users/shopme/...`，也没有把本机 Codex 安装当成已完成。代码和证据以 Git 仓库交付；开发者不需要通过下载压缩包、上传草稿包完成日常开发。

## 1. 根因与架构选择

原开发流程把正式发布时冻结的 `program.js` 和草稿 JSON 当成日常运行来源。增加自动构建、自动上传，只能加快这层交接；仍可能运行旧快照、丢失真实源码位置，并要求开发者维护产物同步。

本轮将目录绑定、读取、验证和必要的模块合并放入一次有明确执行意图的运行请求。多文件沿用 `package.json.opendesk` 和 `opendesk.project.v1`；简单 `.js/.mjs` 可直接绑定文件，显式给出运行类型和精确网站 origin，无需新增项目格式。

| 方案 | 评价与实际采用方式 |
| --- | --- |
| A：Codex → MCP → 现有 Native | 首先完成。MCP 是开发控制层，Resolver 每次读取最新磁盘；Controller 调用原 `run.start/get/stop`，Page 使用严格类型化的 `page.preview/get/dispose`。 |
| B：Sidebar 连接同一项目 | 复用同一 MCP 进程、Resolver 和 Native 私有 `agent.sock`。原 Sidebar 运行按钮获取当前执行字节；没有第二个项目服务器或执行器。 |
| C：轻量热加载 | 在 P0–P2 实测通过后增加显式安全替换。再次运行受管 Page 时先确认旧实例清理，再挂载新源码。没有文件保存触发的业务重执行。 |

Node 环境只负责获准项目的必要源码与资源；扩展核验权限、Host、目标和哈希；Controller 继续由 RunHost/Authority/Worker 执行；Page 继续在原 USER_SCRIPT 世界预览。正式 Task 版本不会指向开发目录。[接口与安全合同](local-development-r22.zh-CN.md)

### 一次运行怎样获得真实身份

1. 捕获真实 Host 与当前目标；绑定只能从启动时明确允许的根目录集合中选择。
2. 通过真实路径、根目录身份、常规文件描述符与前后状态检查读取依赖图、配置和声明资产，拒绝越界、内部符号链接和敏感路径。
3. 无需转换的单文件 Controller 保留原字节。多文件使用仓库固定 Webpack 的冻结内存文件系统，不运行项目的脚本、插件、loader、任意配置或 shell，不输出开发交接文件。
4. `inputHash` 覆盖当前图、配置、资产、框架 helper 和编译器版本。即使缓存命中，也重新读盘验证；发现并发变化或无效源码，本次直接拒绝。
5. `sourceHash` 是最终 UTF-8 执行字节的 SHA-256。浏览器再次核验字节、哈希、目标和连接身份，再进入原执行链。输入注释改变而压缩结果相同时，两个输入可以具有相同的执行哈希。
6. Controller 返回 `runId` 与冻结 revision，随后查询持久 `resultId`、终态和资源收尾；Page 返回独立的 `previewId`、world、document 和求值/清理回执。

[Resolver](../../native-agent/local-dev/resolver.mjs) 与 [读取快照](../../native-agent/local-dev/snapshot.mjs) 是唯一实现；[MCP Session](../../native-agent/local-dev/session.mjs) 保留请求归属、实际字节身份和零动作重试。

## 2. 复用的运行组件与七个工具

| 原有组件 | 本轮使用方式 |
| --- | --- |
| Native Messaging、私有凭据及 Socket | 继续使用可信扩展身份与已有 Node Host；MCP/provider 共用认证通信，不提供普通网页可访问的 HTTP 文件接口。 |
| `bridge.status`、`target.current` | 获取真实连接、登记 Host 和当前窗口/标签/文档；不是由 Node 另选外部 CDP 目标。 |
| `run.start`、`run.get`、`run.stop` | 原 Controller/RunHost/Authority、持久 Run/Result 与停止/收尾；源码和初始入场身份固定，后续受控导航遵守原目标会话合同。 |
| 原 USER_SCRIPT 预览及世界账本 | Page 专用预览、精确目标、独立 world、nonce、原 Host 所有权，以及与 Controller 共用的入场栅栏。 |
| `createPageUI()` | 在原 UI 生命周期登记监听器、定时器、观察器、Object URL、Promise 与 disposer；固定代码在原世界确认清理。 |
| Sidebar 原开发页、Run、Stop | 只增加折叠的本地项目连接与模式选择；手工草稿、手工参数和本地参数分别保留，没有第四个一级页签。 |

| MCP Tool | 实际职责 |
| --- | --- |
| `opendesk.dev.attach` | 绑定明确允许的目录或单文件，返回 `bindingId`。 |
| `opendesk.dev.status` | 返回项目、Native、真实 Host 与目标/目标错误。 |
| `opendesk.dev.run` | 读取当前源文件并派发一次有意执行，返回 Controller `runId` 或 Page `previewId`。 |
| `opendesk.dev.result` | 查询原执行；同一 MCP 会话可用 `admissionRequestId` 只读恢复原 `dev.run` 的入场身份。 |
| `opendesk.dev.stop` | Controller 走原 Stop；受管 Page 使用 typed `page.dispose`，只清理该预览登记的资源。 |
| `opendesk.dev.diagnostics` | 返回真实读取/编译/运行错误及可得位置；没有完成映射时不编造原源码行号。 |
| `opendesk.dev.detach` | 解除绑定和缓存，不改写或自动停止已入场执行。 |

内部只读 `request.get` 不是第八个工具。丢 ACK 后不重新解析已经改变的磁盘，也不重发 `run.start/page.preview`；`NOT_FOUND` 或查询断线不证明原动作没有执行。Page Stop 是变更操作，丢失清理回执同样不自动重试。[完整参数与恢复合同](local-development-r22.zh-CN.md#七个-mcp-tools)

## 3. 最少的实际操作

以下是**以后在用户 Mac 的本地 Codex 环境**执行的初始化指令，本次云会话没有代为操作该电脑。已有兼容的扩展和 Native 安装时，跳过对应初始化步骤。Node 版本遵守仓库 `package.json`。

首次取得并准备仓库：

```sh
cd /Users/shopme/Documents/workspace/opendesk-browser
git pull --ff-only
npm ci --ignore-scripts
```

若需要从源码准备包含本轮能力的扩展，执行一次 `npm run build`，在 Chrome 开发者模式加载 `dist/production`。这是扩展版本初始化；项目 JS 之后的每次修改不需要重复这个命令。

首次 Native 安装：

```sh
node native-agent/cli.mjs setup --extension-id "Chrome 显示的实际扩展 ID"
```

旧 Native Host 是复制安装的快照，更新仓库并不会自动更新它。已有旧版时，在原运行收尾、设置页停用 Native 后，改用一次 `update`；保持相同浏览器、profile 和扩展 ID。Chrome for Testing 显式加 `--browser cft`；独立 profile 按指南加 `--user-data-dir`。通过真实设置页授权 Native，目标网站另行授权；Page 另需 Chrome 的“允许用户脚本”。

Codex 注册同一个 stdio MCP：

```sh
codex mcp add opendesk-dev -- node "/Users/shopme/Documents/workspace/opendesk-browser/native-agent/local-dev/mcp.mjs" --allow-project "/Users/shopme/Documents/workspace/opendesk-browser/examples/programs/local-controller" --allow-project "/Users/shopme/Documents/workspace/opendesk-browser/examples/programs/local-page-ui"
```

命令形式依据 [OpenAI MCP 文档](https://developers.openai.com/codex/mcp)，完整绑定限制见 [本地开发指南](local-development-r22.zh-CN.md#首次配置)。允许目录在 MCP 启动时自动 attach。Sidebar 使用这个仍存活的 MCP provider，不再启动第二份服务。

仅演示时，启动现有测试页面：

```sh
python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks
```

打开 `http://127.0.0.1:43111/demo-form.html` 和同窗口 Sidebar。这个 HTTP 服务只提供测试网页；它不读取或同步项目源码。日常连接完成后，用户无需输入构建命令，只需告诉 Codex：

> 修改当前 OpenDesk 项目，并在当前获准网页测试。使用 opendesk.dev.status/run/result，核对两次 runId 和实际 sourceHash；不要执行 build:program，不生成或上传 JSON。遇到未知效果先查询原执行，不重复业务操作。

## 4. 不构建、不上传的完整实测实例

### 多文件 Controller

入口 `examples/programs/local-controller/src/main.js` 导入 `./extract.js`。第一版返回网页 title 与 version 1。测试驱动通过真正 stdio MCP 调用 run/result，随后只修改依赖模块，加入 h1 提取：

```js
export async function readSummary(page) {
  return {
    version: 2,
    title: await page.title(),
    heading: await page.locator('h1').textContent()
  };
}
```

再次 MCP run 得到新运行。下面结果从原持久 `valueWire` 解读为等价 JSON，原编码和所有身份保留在 [CI 事件摘录](evidence/local-dev-r22-c036/p3-ci-events-from-log.jsonl)：

| 项目 | 第一版 | 修改依赖后的第二版 |
| --- | --- | --- |
| runId | `31b513e7-bc74-43a5-9f6c-ce278928e489` | `c521c696-c415-47c3-8a24-7aa140e1b57d` |
| resultId | `ae5f89ce-eda9-452f-ab0b-1658371ec7ba` | `9525fd54-d27b-4baf-ab6e-747f5fb61a07` |
| sourceHash | `9baa63e05ceed010701668b883b28ce50f2d2a3445d09eaf3004af38bd76886e` | `9e87cad837e6d8841d937d0058c1fa784307fc00b8d86261c283ca9e90b3c1af` |
| 结果 | version 1；title `OpenDesk Browser · Browser Test Lab` | version 2；同一真实 title；heading `Browser Test Lab` |
| 收尾 | completed / released | completed / released |

两次之间没有 build、JSON 交接或扩展重装；再次查第一版仍返回其原身份和 version 1。另一个测试先确认 Controller 正处于 `running`，再把文件从 version 6 改为 7：旧运行 `c3e2a2f8-6d53-4935-bb03-16f03869cb69` 最终返回 6，下一次 `3fe58875-04ef-47c5-b614-28a0b23002ad` 返回 7。

### 多文件 Page 与显式安全刷新

实际项目为 `examples/programs/local-page-ui`：`main.js`、`model.js`、`view.js` 和 CSS/PNG。只修改按钮文字、计数步长和 CSS，再次预览进入 USER_SCRIPT；样式从 `rgb(31, 102, 178)` 更新到 `rgb(178, 47, 89)`，真实按钮点击、PNG、Shadow DOM 与网站原表单均通过。

P3 保留旧 UI 运行后再改源码：旧 preview `d9c35fce-eaac-4d53-967e-594e63e4af91` 的异步 disposer 被等待；旧节点断开，定时器的 `ticks` 保持 9；随后新 preview `f7726029-2c27-4950-8fb2-7aeb2dfe13d5` 在不同 named world 挂载，同 ID 宿主只有一个。

故意让旧 disposer 抛出 `EXPECTED_DISPOSE_FAILURE`，下一次真实回执是 `E_UI_CLEANUP_FAILED / FAILED_CONFIRMED`，新 UI 没有出现。清理回执只保证 `scope:managed-ui-only`：没有登记的资源、未返回的异步任务和既有网页业务效果不在自动清理范围内。

### 真实 Sidebar

原 Sidebar 运行按钮得到 version 3；关闭并重开真正的 Side Panel、更新文件后得到 version 4，Host documentId 已变化，未保存手工草稿仍存在。随后实际导航到新 document，再通过 Sidebar 预览 Page version 6。关闭 MCP 后 Run 禁用；原 Host 拥有的受管 UI 仍可以用原 Stop 按钮清理。全部对应 ID 在 [22 项原始摘要](evidence/local-dev-r22-c036/p3-ci-summary.json)。

## 5. 真实身份、测试与证据保全

| 身份 | 实际值 |
| --- | --- |
| PR42 head | `99a26c38e576ad0653143dd130582d15820054d6` |
| CI 实际 checkout / 原日志 sourceHead | `c98b7a2faa326310942d9222f0721aa2694e5c55` |
| 二者及功能集成 main 的完整 tree | `88e902ac0f29aea2a77885d4598e0feb1d09728e` |
| 功能集成 main SHA（本报告记录时） | `4adf5dc4966f82a71c2c5116f8d5a35c21eafd06` |
| 实际生产包 SHA-256 | `f17ce6197a66be2b308a5c0c24b3e968a8e2a8ded38b5cd17665bd9b42895120` |
| Chrome | Chrome for Testing `155.0.8059.39` |
| Local Dev 真实运行 | macOS-15 ARM64；`PASS_P0_P1_P2_P3_REAL_CHROME`；22 项 PASS；`resourcesReleased:true` |

[Local Dev 真实作业](https://github.com/shopable-ai/opendesk-browser/actions/runs/37933535621/job/113829854169)、[Native ARM](https://github.com/shopable-ai/opendesk-browser/actions/runs/37933535841/job/113829855431)、[Native Intel](https://github.com/shopable-ai/opendesk-browser/actions/runs/37933535841/job/113829855509) 均通过。ARM 和 Intel 各有真实 Host/IPC 3/3、真实 Chrome 握手 2/2；IPC 的模拟 Chrome 帧测试与真正浏览器测试分别记录。

另外三个工作流 [Sidebar](https://github.com/shopable-ai/opendesk-browser/actions/runs/37933535708)、[Page 依赖与包](https://github.com/shopable-ai/opendesk-browser/actions/runs/37933535692)、[站点权限](https://github.com/shopable-ai/opendesk-browser/actions/runs/37933535697) 均通过，共 5 个工作流成功。

组件证据分别为本地 [139/139 定向组件](evidence/local-dev-r22-c036/p3-integrated-components.log)、Native CI 53/53、共享 Sidebar/Controller 72/72，以及完整环境 **421 PASS / 6 SKIP / 0 FAIL**。套件有重叠，不相加冒充去重数量。生产包通过未放宽的预算；`sw.js=327674` 字节，距原 `327680` 上限仅余 **6 字节**，后续相关源码变更需要重新核验。[生产构建日志](evidence/local-dev-r22-c036/p3-integrated-pass-build.log)

新保存的摘要保留原 `LOCAL_DEV_ACCEPTANCE` 对象与 CI sourceHead。事件文件是 decoded job log 的 JSON 行摘录，以日志时间戳注明来源，不声称它与 artifact 内 `events.jsonl` 字节相同。截图与完整回执仍在 Actions artifact `11616254342`，摘要记录其 SHA-256、大小与到期时间；这次收尾没有下载该归档。早期 P0 原图与失败候选原记录保持原样。

功能 main 与验收 tree 完全一致。随后 main `f5886898c1df46e2d6b3c76aa9072f04d52a959c` 合入 PR #43 的 npm/HTTPS 使用文档；这些并行文档已完整保留，其差异没有运行源码、锁文件或测试驱动。最终收尾仅更正文档、Skill 说明和保存证据，未改运行源码、依赖锁、测试驱动、workflow 或示例执行文件，因此复用同一实际输入的原生证据；不声称在证据提交 SHA 上重新运行过 Chrome。[跨对话证据规则](program-evidence-reuse.zh-CN.md)

## 6. 用户要求的异常矩阵

“真实 PASS”只对应下表明确范围；组件支持和未实测项保留等级，不能合并写成全部异常通过。

| 要求 | 本轮证据与状态 | 尚未覆盖的范围 |
| --- | --- | --- |
| 文件修改后直接运行 | 真实 PASS：MCP、Controller、Page 与 Sidebar 最新源码 | 无新增声明 |
| 修改依赖模块后直接运行 | 真实 PASS：extract/model/view 及资源链；组件检查依赖图与缓存变化 | 更广泛 npm 模块不属于本地支持范围 |
| 缺失文件 | 真实 PASS：已连接 MCP 返回 `E_PROJECT_FILE`，`NOT_DISPATCHED` | 无新增声明 |
| JS 语法错误 | 真实 PASS：拒绝当前版本，不执行旧缓存 | 原源码运行堆栈映射尚未完成 |
| 读取期间并发修改 | 组件 PASS：真实文件系统受控写入、同长度内容变动得到 `E_PROJECT_CHANGED` | 精确 Chrome/MCP 读盘中间时刻注入 NOT_TESTED |
| Native Host 未连接 | 组件拒绝离线/目标错误；真实 Native 初始握手 PASS | Host 完全缺席时新运行的独立 Chrome 场景 NOT_TESTED |
| MCP 断开 | 真实 PASS：Sidebar Run 禁用、原 Page Stop 可用；真实 Socket 丢 ACK 只读恢复且单次派发 | 解析中 EOF 及未终态 Controller 时序仅组件；未覆盖所有断线位置 |
| Sidebar 关闭后重开 | 真实 PASS：新 Host、选择恢复、源码更新、手工草稿保留 | 不等同于接管旧 Host 的运行 |
| 导航与 documentId 改变 | 真实 PASS：先真实导航，再在新 document 运行；组件拒绝过期目标 | 读盘到入场之间的导航竞态未在 Chrome 注入 |
| 网站权限撤销 | 组件 PASS，相关站点权限 CI PASS | 本地 MCP 正在入场时真实撤权的精确组合 NOT_TESTED |
| 执行时修改源码 | 真实 PASS：确认运行中的旧 version 6 完成；下一次返回 7 | 不扩展成任意副作用恢复 |
| 旧 UI 清理失败 | 真实 PASS：disposer 抛错，新源码不挂载；异步清理等待、旧 timer 停止 | 5 秒超时、清理 ACK 丢失/持久化失败仅组件 |
| 普通网页访问本地项目 | 真实 PASS：页面没有 `runtime.connectNative/connect`；组件校验注册 Host、路径与认证 | 不是通用渗透测试 |
| 体积超限 | 真实 PASS：单文件超过 256 KiB 在派发前拒绝；Native 60 KiB 校验有组件 | Native 完整报文物理边界 NOT_TESTED；没有分包旁路 |
| Chrome 重启后恢复 | NOT_TESTED | Sidebar 重开和 SW 重建不能替代完整 Chrome 进程退出/启动 |
| 关闭 Local Dev 后已安装 Task | 正式不可变 Task 与可选 Native 架构保留，常规任务测试通过 | 同时停用 MCP/Native 后执行已安装 Task 的组合现场验收 NOT_TESTED |

对应组件入口：[Local Dev](../../tests/environment/local-dev.test.mjs)、[受管生命周期](../../tests/environment/local-dev-managed-ui.test.mjs)、[项目连接](../../tests/environment/local-project-connection.test.mjs)、[Native Host](../../tests/environment/native-agent-host.test.mjs)、[Page 预览](../../tests/environment/page-script-preview.test.mjs)。真实驱动：[local-dev-native-acceptance.mjs](../../tests/framework/local-dev-native-acceptance.mjs)。

## 7. 七个独立质量评分

这是依据本轮功能行为和明确证据作出的工程评估，不是通过率，也不是加权平均。95 分目标没有全部达到；未测项不以推断补分。

| 维度 | 评分 / 100 | 已证明的依据 | 扣分与限制 |
| --- | ---: | --- | --- |
| AI / Codex 开发便捷性 | 94 | 标准 stdio 七工具；真实改文件→run→result；零开发交接文件 | 用户 Mac 实际 Codex 客户端配置未测；首次 Native/网站授权仍必要 |
| 源码更新与运行效率 | 96 | 每次按需读盘；依赖图/缓存检查；无产物同步；旧运行冻结、新运行更新 | 未作规模化性能基准；不提供 watcher/HMR |
| 多文件 JavaScript 兼容性 | 92 | 相对 ESM、传递顶层 await、单文件直接执行、CSS/JSON/图片合同 | Local Dev npm/HTTPS、动态 import、JSX/TSX 等不支持；运行原源码定位未完成 |
| 现有 OpenDesk 架构兼容性 | 97 | 同一 Native、Host、RunHost、Authority、USER_SCRIPT、世界账本及停止合同；5 个工作流 PASS | 定向 R2.2 验收不能代替整个框架 F3 |
| Native / MCP 权限与安全性 | 93 | 明确根目录、字节哈希、认证 Host、权限目标校验、未知效果无重试；真实丢 ACK 和清理失败验证 | 精确撤权/断线矩阵、Native 物理上限和完整渗透测试未测 |
| 真实 Chrome 运行稳定性 | 94 | 22 项实际 Local Dev 断言，ARM/Intel 真实 Native，原生按钮与 Sidebar 重开 | 完整 Chrome 进程重启与若干精确故障时序未测 |
| UI 最小化与普通用户兼容性 | 94 | 无新增一级页签/IDE；原 Run/Stop；未保存草稿、网站表单、断连状态实测 | 停用全部开发能力后已安装 Task 的组合场景未测 |

## 8. 实际修改的源码与文档

以下是 PR #37 / #42 的本轮实现路径，不把合并进来的 R9/R10 独立工作算成本轮新建功能：

| 范围 | 实际文件 |
| --- | --- |
| 统一目录、Resolver、MCP | `native-agent/local-dev/snapshot.mjs`、`resolver.mjs`、`session.mjs`、`provider.mjs`、`mcp.mjs` |
| Node Native 接入与安装 | `native-agent/cli.mjs`、`install.mjs`、`locations.mjs`、`native-host.mjs`、`wire.mjs` |
| 扩展 Native 与 provider | `src/native-agent/host-adapter.js`、`local-project-client.js`、`local-project-service.js`、`managed-preview.js`、`protocol.js`、`service-worker.js`、`transport.js` |
| 原 Host/Authority 薄接入 | `src/platform/host/authority.js`、`broker.js`、`client.js`、`controller-methods.js`、`preview-admission.js`；`src/platform/storage/repository.js`、`src/platform/downloads/index.js`、`src/sw.js` |
| 原 USER_SCRIPT 和 UI 生命周期 | `src/scripting/user-scripts/preview.js`、`preview-worlds.js`、`page-ui.js`、`managed-ui-lifecycle.js` |
| 原 Sidebar 接入 | `src/ui/local-project.js`、`script-editor.js`、`tool-shell.js`、`tool.html` |
| 复用正式解析/编译能力 | `scripts/validate-program-project.mjs`、`scripts/build-program-project.mjs` |
| 两个真实多文件示例 | `examples/programs/local-controller/{package.json,src/main.js,src/extract.js}`；`examples/programs/local-page-ui/{package.json,src/main.js,src/model.js,src/view.js,assets/ui.css,assets/mark.png}` |
| 组件与 Chrome 驱动 | `tests/environment/local-dev*.test.mjs`、`local-project-connection.test.mjs`、既有 Native/Page/Sidebar 定向测试；`tests/framework/local-dev-native-acceptance.mjs`、`local-dev-lost-ack-mcp.mjs`、`native-chrome-consent.mjs` |
| CI | `.github/workflows/local-dev-r22.yml`、`.github/workflows/native-agent-r1.yml` |

`src/run-host.js`、`src/ui/program-source.js`、`src/ui/task-workbench.js` 等按要求核查并通过原消费者复用，没有为了列出文件而改写它们。完整 diff 可在两个 PR 查看。

文档已更新多文件开发说明、Program/Sidebar/UI API、Native 指南、AI 开发 Skill、测试指南与示例 README；本地开发默认流程改为连接/编辑/运行/结果。原 `build:program` 保留给不可变产物、导入、安装和发布。R1 的失败回执与旧验收日期保持历史语义，没有覆盖成当前 PASS。

## 9. 明确未交付的能力

没有实现文件 watcher、CSS 单独增量刷新、React Fast Refresh、Vue HMR、通用模块状态保留、浏览器 IDE 或第二个本地运行服务。当前热加载是开发者显式运行时安全替换受管 UI。清理未知仍保守停止；每文档 6 个预览世界、4096 个会话世界预算不退款或重置来掩盖限制。

Local Dev 当前拒绝 npm/HTTPS 模块，正式构建的锁定依赖能力保持独立。运行期原始文件行号映射尚未完成。用户 Mac 上的实际 Codex 安装、完整 Chrome 重启及异常矩阵中的 NOT_TESTED 仍需对应环境证据。这些限制不影响已经实测的相对 ESM Controller/Page → 真实 MCP/Sidebar → 最新源码闭环，但不能据此宣称用户全部验收项或整个框架已经完成。
