# 扩展中心「应用」Sidebar Tool API 参考

> 本页说明 **`opendesk.sidebar-tool.v1/v2` 的现行工具包与受限接口合同**；历史 R 章节按其注明的范围阅读。**所有同类型工具的统一开发方法**（选型、目录规范、预览、打包、安装、测试）请先阅读 [Side Panel 工具统一开发规范](sidebar-tool-development.zh-CN.md)。示例见 [examples/sidebar-tools](../../examples/sidebar-tools/README.zh-CN.md)；AI/Codex 用 [开发 Skill](../../.agents/skills/opendesk-sidebar-tool-dev/SKILL.md)。

这是 Side Panel「扩展」中的「应用」类型 HTML/CSS/JS Sidebar Tool 包（现行入口见 [R4 产品规格](../product/sidebar-ui-spec.zh-CN.md)），不是单独的 Chrome 扩展，不是 `opendesk.task.v1`，也不是 Controller/Page USER_SCRIPT 项目。**第三方的开发合同由本文、[统一开发规范](sidebar-tool-development.zh-CN.md)、工具配置、示例及公开 SDK 确定，不依赖 Browser 内部 `src/`**。若文档与行为冲突，由平台维护者凭实际复现再核对 Host、Broker 和打包实现，不能要求第三方直接调用内部函数。

## 1. 工具源配置与运行包的区别

开发者维护的 `tool.config.json`：

```json
{
  "id": "sample-notes",
  "version": "1.0.0",
  "title": "示例笔记",
  "description": "保存个人笔记。",
  "capabilities": ["storage.local"],
  "files": {"html":"src/index.html","css":"src/style.css","js":"src/main.js"},
  "assets": []
}
```

`scripts/build-sidebar-tool.mjs` 输出的 `<id>.opendesk-tool.json` 是扁平包：

```json
{
  "format": "opendesk.sidebar-tool.v1",
  "id": "sample-notes",
  "version": "1.0.0",
  "title": "示例笔记",
  "description": "保存个人笔记。",
  "capabilities": ["storage.local"],
  "html": "<main>...</main>",
  "css": "...",
  "js": "..."
}
```

这里的字符串是**字段示意**，不是可安装的完整示例；请用打包器从真实文件生成。以上展示 v1 基础字段，不是所有版本的字段全集，也不是 `manifest.json`。当前构建器还支持以下严格限定的输入，不能自行添加任意字段：

| 可选内容 | 源配置 → 最终包 | 运行边界 |
| --- | --- | --- |
| v2 SDK 与贡献 | 源配置声明 `format: "opendesk.sidebar-tool.v2"`、`requires`、`contributes`，保留到最终包 | 具体名称与许可见 [Browser SDK](browser-sdk.zh-CN.md)，不是直接授权 |
| v2 固定 Task 委托 | `capabilities` 声明 `tasks.run`，顶层 `delegatedTasks` 保留到最终包 | 每个 pin 为 `{taskId,version,manifestHash,contentHash}`；安装时审阅固定身份，运行合同见下文 |
| v2 多 JS 依赖 | `files.dependencies`：最多 8 个有序、不重复的固定 Classic 文件；构建成 `scripts` 中的 name/sha256/code | 沙箱校验字节后依序加载，再运行主 js；v1 不接受 dependencies/scripts，不开放任意后台 JS |
| v2 App Service（R1.4） | `files.background`：独立本地 Classic JS 入口；生成顶层 `background: {kind,js,sha256}` | 与 UI `js/scripts` 分离；安装前校验源码摘要，不赋予特权 Background/Chrome 权限；详见下节 |
| 固定 Shared UI | v1/v2 均可显式声明 `uiRuntime: "opendesk.react-ui.v1"`，同名字段进入包 | 只选择已支持的固定沙箱 React/UI 资源；工具在自己的文档创建 Root，没有宿主 Chrome 权限 |
| UI 本地化 | 源配置 `locales` 经构建校验后嵌入原 js，不增加最终 locales 字段 | 使用只读展示语言，详见 [本地化合同](sidebar-tool-localization.zh-CN.md) |

[Prompt Shortcuts 配置](../../examples/sidebar-tools/prompt-shortcuts/tool.config.json) 展示纯模型多入口复用，[AdBlock 配置](../../examples/sidebar-tools/adblock/tool.config.json) 展示固定 Shared UI；详细开发和构建流程仍归 [统一开发规范](sidebar-tool-development.zh-CN.md)。源目录名与 package capability 均不能把沙箱代码提升成特权入口。

| 项目 | 当前约束 |
| --- | --- |
| 格式 | `opendesk.sidebar-tool.v1` 或 `opendesk.sidebar-tool.v2` |
| id | `^[a-z][a-z0-9-]{1,39}$`，稳定且安装时按 ID 区分 |
| version | 数字 `major.minor.patch`，没有前缀/预发布标签 |
| title / description | 最长 80 / 300 字符 |
| HTML / CSS / JS | 最长 64,000 / 120,000 / 1,048,576 字符（源文件还有相应字节预算） |
| 完整包 | 最大 2,097,152 UTF-8 bytes（2 MiB，包含 JSON 转义与规范序列化开销） |
| 安装数量 | 最多 12 个 |
| 图片 assets | 最多 16 个；每张 ≤96 KiB；PNG/JPEG/WebP，本地预嵌入 |

HTML 不允许 `script/iframe/object/embed/base/link/meta/style` 标签、内联事件、`javascript:` 等；CSS 不允许远程 `@import`、HTTP/JS 资源；主 JS 及 v2 所选固定依赖必须是 Classic；原始 ESM/JSX/SFC 先按项目构建，不能直接保留顶层 `import/export`。校验器不能代替 CSP、安全审计或真实浏览器验收。

### R1.4 可选 App Service 包合同

只有 v2 可声明 `tool.config.json.files.background`，值为项目内本地 JS 相对路径，与 `files.js` 的 UI 源码分别读取。打包器复用原路径、符号链接和源文件预算检查，计算最终 `background.js` UTF-8 字节的固定 SHA-256。配置不接受手写顶层 `background` 或作者自报摘要。输出包的可选顶层字段严格为：

```text
background: {
  kind: "opendesk.app-service.v1",
  js: <非空 Classic JavaScript 源码字符串>,
  sha256: <该源码 UTF-8 SHA-256 的 64 位小写十六进制字符串>
}
```

必须同时声明既有 `browser.storage` 和 `browser.scheduler` capabilities；`storage.local` 不能替代 `browser.storage`。UI `js` 保持独立，后台源码不合并到 UI 或依赖资产，也不由安装器执行。后台源码沿用 JS 的 **1,048,576 UTF-16 字符及 UTF-8 字节**限制；所有 UI、依赖、后台、数据及 JSON 开销共同占用**2,097,152 UTF-8 bytes** 包预算，没有新增容量。v1 拒绝 `background/files.background`，未声明后台的既有 v1/v2 包保持兼容。

`validateSidebarToolPackage` 同步校验形状、能力、源码及完整包预算；`verifySidebarToolBackground(tool)` 异步返回验证后的工具快照，并核对后台源码 SHA（不匹配为 `E_TOOL_BACKGROUND_SHA`）。后台缺失时仍验证原包，随后直接返回。`serializeSidebarToolPackage` 和 `sidebarToolPackageHash` 包含 `background` 的 kind/js/sha256，以固定字段顺序序列化，不受存储重排字段影响；源码或摘要变化都会改变包身份。`sidebarToolPackageHash` 自身也先调用异步后台校验，拒绝错误的源码摘要；同步序列化仅校验形状，不能代替该检查。

本地审阅安装、市场单项及批量安装沿用同一 `installReviewedSidebarTool`，在任何安装写入和市场意图消费前执行异步 SHA 校验；市场未知结果恢复也验证实际安装的后台源码。来源沿用用户明确本地审阅（`local-reviewed` 语义）或可信调用方核实的既有市场来源记录。后台 SHA 只证明内容一致，**不是发行者签名或信任声明**；包不能自报 publisher/official 来源。

后台入口使用独立文件中的 `async function main()`。它获得受限词法变量 `browser`，不获得 `page`、`params`、`OpenDeskTool` 或 Chrome API。例如：

```js
async function main() {
  const {items} = await browser.storage.local.get({keys: ['input']});
  const result = {sum: (items.input || [1, 2, 3]).reduce((a, b) => a + b, 0)};
  await browser.storage.local.set({items: {result}});
  return result;
}
```

首版后台只开放 `browser.storage.local.get/set/getQuota` 和只读 `browser.capabilities.list/getStatus`。存储归当前安装的应用所有，代码不能选择 owner、namespace、RunId 或安装代次。读响应预算和原工具存储配额继续生效；需要分批读取较大数据。UI 仍通过自己的 `OpenDeskTool.request('browser.storage.local.get', {keys: ['result']})` 读回数据。

UI 通过既有 SDK 创建计划，用户在可信界面确认后生效：

```js
await OpenDeskTool.request('browser.scheduler.create', {
  service: 'background',
  schedule: {kind: 'once', expression: new Date(Date.now() + 120000).toISOString()}
});
```

这一路径不传 Task ID 或网页目标。计划管理复用原 Scheduler，查询自身计划用 `browser.scheduler.listOwn`；后台源码本身不能创建计划。安装审阅后不要求第二次通用启用。Side Panel 关闭、没有网页目标且 Cloud 关闭时，Chrome 仍可通过 Alarm 运行后台；Chrome 退出期间不执行 JavaScript，Alarm 不保证精确到秒。单次执行目前最多 30 秒，复用原单执行槽。停用、升级、卸载会使旧安装代次失效；恢复后新建的计划绑定当前代次，旧计划不会自动获得新授权。网络请求及远程代码装载受原 opaque Sandbox CSP 拒绝，不提供 OS 级内存隔离或任意副作用 exactly-once 保证。真实候选证据与未测项见[动态应用运行验收记录](../framework/workstreams/dynamic-app-runtime-r14-local-20261022.md)；引擎可运行不代表 Chrome Web Store 已批准。

每次新安装或实际升级（含无后台的旧格式包）在既有 `opendesk.sidebar-tools.revocation-epochs.v1` 为该 ID 生成新随机字符串；相同规范包的 noop 不轮换。包和新代际在同一次 `storage.local.set` 提交并分别读回；丢失回执、部分持久化或读回不明保持 `E_OUTCOME_UNKNOWN`，不自动重放。新的市场事务记录绑定该代际，恢复只能核对并补完元数据，不能认可缺失或不同的代际。明确批准的菜单偏好可绑定新代际，其他敏感授权不会因此续期。包测试仅证明包与安装合同；运行、调度和冻结后双应用结论以同候选真实 Chrome 证据为准，不能由 Node 包测试宣称通过。

## 1.1 官方可选发行与安装状态（R4.5）

官方源码登记于仓库根 `official-tools/catalog.json`，版本和能力以对应 `examples/sidebar-tools/<id>/tool.config.json` 为准。正式构建自动生成 `dist/{production,development}/official-tools/catalog.json` 和 `official-tools/<id>/<id>.opendesk-tool.json`。需要随源码交付或手动安装验收的独立项目，在候选通过实际门禁后按统一开发流程显式晋升项目根**唯一**同 ID JSON；此正式包是生成产物而非第二份业务源码。完整字段、构建和更新合同见 [官方工具 Catalog](official-tools-catalog.zh-CN.md)。

**随扩展发行、已安装、停用覆盖、网站可用和实际执行仍是独立状态。** `SIDEBAR_TOOL_STORE` 是唯一安装事实；新安装没有停用记录时即为可使用状态，**用户无需再点击一次“启用”**。普通 Sidebar 应用的“打开”只是显示 UI，不代表在网页中额外授权或自动执行 JS。固定可信网页增强按获准站点自动呈现；主动停用后仍可在设置中恢复。默认预装由宿主持久计划管理，不因读取 Catalog 执行沙箱 JavaScript。官方入口与本地导入复用原安装器和锁；审核、取消、更新确认、私有数据保留和卸载都遵守既有合同。完整规则见[安装即用与授权边界](../architecture/browser-framework/site-permission-onboarding.zh-CN.md)。

五个官方候选统一显示安装/更新/已安装状态。官方包确认时再次核对固定资源的大小、SHA-256、身份与能力；缺包或不匹配不得安装。更新不自动替换旧安装，卸载后也不会因 Chrome 重启、扩展升级或重开侧栏恢复安装。

内置 `reading-toc` 正式安装成功且未被用户主动停用后，默认可用于普通 HTTP(S) 网页，不需额外点击启用、打开 Side Panel 或逐站点授权。工具停用、网站停用、单页排除、显示偏好和 Chrome 自身的站点访问权限仍独立生效；浏览器受限页面不支持。其他 ID 的 `page.toc` 工具、剪藏、知识保存仍逐工具、逐 origin 授权。

`opendesk.sidebar-tools.toc-sites.v1` 中，`reading-toc` 缺记录或原有正向站点数组表示默认全部可用；停用记录为 `{mode:'all-except',blockedOrigins:[具体 HTTP(S) origin]}`，最多 64 个。恢复最后一个停用网站后移除该工具记录，回到默认可用。其他工具保持原有正向数组；异常内置记录保守拒绝，不自动丢弃。旧白名单不保存历史撤权意图，因此按新的用户要求改为全部默认可用，已有明确单页排除和隐藏偏好保留。

**Browser SDK v2 不是自动授权**：已有工具可以按当前 [Browser SDK API、可调用状态与 v2 菜单合同](browser-sdk.zh-CN.md) 声明受审的 `requires.browserSdk`、`contributes.contextMenus` 和相应 capability；例如 Cookie Editor、Bookmark Manager、Prompt Shortcuts 的真实配置已分别声明受控 Cookie、Bookmark、`page.prompts`/原生菜单能力，但这些能力**不等于所有新第三方工具均已取得原生访问权限**。新增工具必须根据公开能力状态（IMPLEMENTED/HOST_ONLY/NOT_EXPOSED/PLANNED）、权限和安装身份逐项审核；不能把 Browser SDK v2 错误简化成只有下述基础 `request` 操作。

**公开能力分级**：下文 `storage.local`、`currentPage.read`、`tasks.open`、`user.export` 是普通第三方可审阅的基础 capability；v2 另可审阅 `tasks.run` 的固定已安装 Task pins。`page.toc/page.clip/page.capture/knowledge.store/time.review` 为受限一方固定服务，不是任意网页 DOM 或通用 Chrome API。除下述经原 Task Authority 执行的固定委托外，没有向沙箱直接开放任意页面操作、跨域抓取、Native 文件写入或任意宿主消息，不得通过声明一个 JSON capability 伪装成已支持。缺失能力记 `SDK_GAP_NOT_PROVEN` 并提交复现，由平台按通用价值审查；无安全授权时记 `BLOCKED`。

## 2. 工具的运行 API

隔离沙箱的基础工具对象（v2 另按批准合同提供 OpenDeskSDK）。以下 Classic 片段要求工具 HTML 已声明 `#save` 按钮和 `#status` 回显元素，并在用户点击时读写获准的 storage.local：

```javascript
(() => {
  const {root, request} = globalThis.OpenDeskTool;
  const status = root.querySelector('#status');
  root.querySelector('#save').addEventListener('click', async () => {
    try {
      const {etag} = await request('storage.get', {key:'note',withEtag:true});
      await request('storage.set', {key:'note',value:'hello',ifMatch:etag});
      status.textContent = '已保存';
    } catch (error) {
      status.textContent = error?.message || '保存失败，请保留当前草稿';
    }
  });
})();
```

`root` 是该工具 UI 自己的根元素。`request(operation,payload)` 异步返回经过宿主验证的结果，或以错误拒绝。任何需要用户数据/站点内容的操作都应在明确的用户动作后执行，不吞掉异步错误。

需要关闭保护的编辑器可调用 `OpenDeskTool.setState({dirty, busy})`，两个字段必须是布尔值，并且通过一个对象传递。输入后标记未保存；写入期间保持 `busy: true`；只有持久保存确认后才清除 dirty，完成后再清除 busy。宿主据此保护关闭与切换；该消息不提供能力或网站授权，也不能阻止用户明确卸载。

### 普通第三方小工具的基础操作

| capability（安装时审阅） | request operation | 行为与限制 |
| --- | --- | --- |
| `storage.local` | `storage.get`：`{key,withEtag?}` | `{value}` 或 `{value,etag}`，数据属于当前工具命名空间 |
| `storage.local` | `storage.set`：`{key,value,ifMatch?}` | `{saved:true}`；若提供 `ifMatch`，按相同工具 Web Lock 下的 ETag 防冲突写入 |
| `currentPage.read` | `currentPage.info` | `{status:'available',title,url}` 或 `{status:'unavailable',message}`；只提供当前目标标题/URL |
| `tasks.open` | `tasks.open`：`{taskId}` | 聚焦已安装、已启用任务的 UI，不执行/停止任务 |
| `user.export` | `browser.clipboard.writeText`：`{text}` | 环境允许时复制纯文本，成功返回 `{copied:true}` |
| `user.export` | `browser.downloads.text`：`{text,filename}` | 请求 Chrome 下载安全文件名的 `.md` / `.txt` / `.json` / `.csv` 纯文本；返回 `{started:true}` 仅表示下载已发起，不证明真实落盘 |

普通 `storage.local` 当前最多 32 个键，每项 JSON ≤8,192 字节，工具数据对象总 JSON ≤32,768 字节。`key` 须以英文字母开头，仅允许英文字母/数字/点/下划线/连字符，最长 60 字符。`withEtag/ifMatch` 是可选的条件更新；发生冲突应重新读回并让用户决定，不自动覆盖。

`browser.clipboard.writeText`、`browser.downloads.text` 的文本须非空且 UTF-8 ≤150,000 bytes。`browser.downloads.text` 仅允许不含路径分隔符等危险字符、且不以点开头的 `.md`、`.txt`、`.json` 或 `.csv` 文件名（长度 ≤90）；一般网络下载、二进制文件和任意绝对路径写入都**不是**此 API 的能力。工具不使用宿主的任意网络代理。

### 固定已安装 Controller Task 委托（v2）

App 在 `tool.config.json` 声明 `format: "opendesk.sidebar-tool.v2"`、capability `tasks.run` 和顶层 `delegatedTasks: [{taskId,version,manifestHash,contentHash}]`，沿用 v2 `requires/contributes`。pins 为 1–16 项、Task ID 不重复；版本为确切三段版本，两项 hash 为实际制品的 64 位小写十六进制 SHA-256，不接受 `latest` 或额外字段。原 builder 保留该字段，安装审阅显示每项 ID、版本和两项 hash，pins 参与 App 包身份。Task 需经原流程独立安装和授权；App 安装不代替 Task 安装，也不扩大其网站范围。

| `OpenDeskTool.request` operation | 精确 payload | 返回 |
| --- | --- | --- |
| `tasks.read` | `{taskId}` | `{task: {taskId,version,manifestHash,contentHash,installationId,generation}}`，仅解析已审阅的固定 Task，不返回源码 |
| `tasks.start` | `{clientRequestId,task,params}` | 下述运行快照；`task` 必须使用 metadata 返回的完整安装 pin |
| `tasks.read` | `{clientRequestId}` | 同一 App iframe 请求对应的运行快照 |
| `tasks.stop` | `{clientRequestId}` | 取消/停止原请求，返回快照；不接受 `runId` 或任意目标 |

`clientRequestId` 由 App 在发起 start 前生成，仅允许英文字母、数字、点、下划线、冒号、连字符，长度 1–80。同一 iframe 内不得将同 ID 用于另一请求；提前 Stop 留下取消标记，晚到的 start 不会重新运行。`params` 须符合 Task 自己的 schema，canonical JSON ≤8,192 UTF-8 bytes、深度 ≤12；例如固定采集 Task 可接收 primitive 字段 `{url,configJson,waitForSelector,timeoutMs}`。

运行快照为 `{clientRequestId,runId,resultId,state,retirementState,result,value}`。admission 前运行/结果 ID 可为 `null`；`result` 是原 Controller 持久结果，成功结果的 `value` 已由 Host 解码，App 无需解析内部 `valueWire`。SDK Promise 直接返回该对象，拒绝时抛带 `code` 的错误。Stop 回包的 `result/value` 固定为 `null`，后续 read 仍须通过授权；只有 `retirementState === 'released'` 证明原运行已释放。`unknown` 表示结果或副作用未知，不自动重放 start。

真实 Run 点击时由可信父宿主采样用户激活，沙箱不能自报手势。可提前读取 metadata，但 start 必须来自真实用户动作；Stop 可在 start 回包前使用原 `clientRequestId` 发出。Host 绑定原 iframe、App 包 hash/撤权代次，以及 Task 的固定版本/hash/`installationId/generation`，捕获并重验可信当前网页的 tab/frame/document/URL/window 身份。start/read/stop 不走 `tasks.open`，不切换或销毁 iframe。关闭 App 时只取消其原请求/停止其原实例；撤权或身份变化后，页面效果和缓存/持久结果均拒绝，重新授权不继承旧运行。

#### SDK Gate 记录（2026-10-29）

本轮通用缺口已证实：旧公开文档只有 `tasks.open`；旧宿主该分支调用 `focusInstalledTask` 后 `suspendTool()` → `destroyFrame()`，不能保留组合 App UI。旧 package validator 不接受新 capability/字段，尝试声明委托得到 `E_TOOL_SCHEMA`。业务 iframe 无法合法取得原 RunHost、可信网页目标或 Task 安装身份/代次，因此不能在工具目录内部补出同实例运行、提前取消和确定结果；通用价值是任意受审 App 可组合固定已安装 Controller Task，而非加入采集业务判断。

实现继续使用原 Registry → Host → Authority → 唯一 RunHost → 持久结果链，按 saved-source 引用执行固定 Task；不经 App RPC 传源码，不另建 runner、安装器或授权层，不借草稿/Native 绕过安装。变更范围为 `src/platform/tasks/delegation-{contract,installation}.js`、`src/platform/host/task-delegation.js`、原 `controller-methods.js/run-host.js`，原 `sidebar-tools.js/tool-shell.js/sidebar-tools/package.js`、builder、marketplace 安装审阅及定向 tests。草稿入口的公共源码预算修复独立约束 source admission envelope，不扩大普通 RPC 参数、结果或 frame 预算。

可复核测试位于 [委托合同与 RunHost](../../tests/environment/task-delegation.test.mjs)、[包与原 builder](../../tests/environment/task-delegation-package.test.mjs)、[真实宿主 RPC 组件](../../tests/environment/sidebar-tools-host.test.mjs)、[安装审阅](../../tests/environment/market-trusted-install.test.mjs)、[原安装 Task Authority](../../tests/environment/native-installed-tasks.test.mjs) 和 [Controller Authority](../../tests/framework/k3-controller-authority.test.mjs)。本轮组件证据覆盖固定 pin、手势、同 iframe、提前取消、原实例 Stop、撤权效果及结果拒绝；最新 Authority/安装 Task/委托回归 215/215 PASS，不代表真实 Chrome 同 App 原生链已通过，原生结果须另据实际记录。

### 官方固定网页增强能力（不是任意 DOM API）

| capability | 现有固定操作/服务 | 限制 |
| --- | --- | --- |
| `page.toc` | `toc.snapshot`、`toc.navigate` | 复用阅读目录可信 Content Script、明确网站许可及目标文档再校验；非通用页面选择器 |
| `page.clip` | `clip.article`、`clip.selection`、`clip.link` 等固定剪藏操作 | 安装审阅后在 Chrome 允许的 HTTP(S) 网页按点击直接使用；复用固定 Content Script、当前文档再校验及站点停用例外 |
| `page.capture` | ChatGPT 知识保存专用页面捕获 | 安装审阅后在原有 ChatGPT 网站显示固定保存入口，点击才读取；可主动停用，不另要求逐站授权；不能自行定义任意采集脚本 |
| `knowledge.store` | `knowledge.list/get/update/remove/backup/download/openSource/workspace` 等 | 只有 `knowledge-inbox` 固定宿主与服务识别的工具身份允许相应操作；不是通用存储配额 |
| `time.review` | `time.status/start/pause/revoke/settings/clear/export`、R1.3 `time.day/classify/minuteConsent` | 仅固定 `time-review` 工具使用可信 MV3 后台；空闲检测需要 Chrome 原生授权，开始/清空/分钟采集选择由受信任详情设置区的真实点击批准。默认只保存域名、日期及毫秒日汇总；可选择性保存未来真实分钟/域名/毫秒，不会补造历史 |

### Time Review R1.3 的固定操作及授权边界

`time.review` 是官方固定工具的专用 capability，不是普通可安装第三方工具的通用计时 API。原有 `time.status / time.pause / time.revoke / time.settings / time.export` 保持兼容；`time.start` 与 `time.clear` 以及新增的 `time.minuteConsent` **不能仅凭工具沙箱请求完成敏感操作**：请求会打开受信任的工具详情设置区，并返回 `E_TIME_TRUSTED_CLICK`，由用户在该界面真实点击开始、选择未来分钟采集或二次确认清空。停用、卸载、包 SHA 更新及撤权不会自动恢复旧授权。

- `time.classify`：请求 `{host: 'example.com', category: 0..5}`，用户主动将已有记录的网站分类到未分类/工作生产/阅读学习/聊天新闻/娱乐/生活；重新计算保留期限内的分类聚合，不改变已计入的原始毫秒数。权限和 hostname 由可信后台复验。
- `time.day`：请求 `{date: 'YYYY-MM-DD'}`，仅查询保留期内的本地日期，返回真实当日网站、六分类毫秒统计、`minuteSlots` 与 `timelineStatus`。旧日汇总没有分钟条目，绝不按比例制造 1440 个分钟槽；部分覆盖与 DST/时区不确定日期必须如实提示。
- `time.minuteConsent`：请求 `{enabled: true|false}` 只能引导至**受信任宿主**；开启之后才聚合未来可信活动区间的分钟/域名/毫秒，关闭时须界面内确认并永久删除全部分钟明细。旧历史日汇总和网站分类不随该关闭而删除。
- 重要时间 = 类别 1+2；生产率仅在当天所有已记录时间完成分类时才显示，未分类时应显示 `—` 及覆盖程度。时间线灰色分类 0 表示真正记录但用户尚未归类，浅底无色表示没有真实分钟证据。

细节和限制参考 [Time Review 产品合同](../product/time-review-r12.zh-CN.md)、[Time Review 官方示例](../../examples/sidebar-tools/time-review/README.zh-CN.md)。JSON 可包含自愿保存的本地分钟明细；CSV 在原有四列后追加分类 ID，不修改原有列的意义。

**重要区别**：schema 接受某能力名称，**不代表**任何安装的第三方工具都得到相同的可信宿主逻辑，更不能直接调用 `chrome.tabs`、网页 DOM、Native Messaging 或网络。开发新的跨网页能力必须先设计并实现受信任宿主、站点授权、sender/document 校验、撤权和负向测试。专项工具的具体业务接口与版本由其源码和项目文档维护，不在通用 API 中承诺扩展能力。

## 3. 页面变更、生命周期与安全边界

- 只有用户**主动打开**工具才创建 iframe。切换/关闭销毁旧 iframe 与未完成请求；iframe 的定时器不是可持续执行的后台任务。
- 已安装工具和只读开发预览彼此隔离；只读预览对 `storage.get` 仅返回模拟空值，对 `currentPage.info` 返回 unavailable，拒绝真实写入、任务打开或网页控制。
- 可信宿主使用 sandbox `event.source`、opaque `origin`、`instance`、工具 ID、当前安装包和能力权限约束消息。`origin=null` 本身并不是可信身份。
- 宿主可给工具的 `root` 派发 `opendesk-page-changed` 事件，用于在页面目标变化后重新查询信息；不能假定旧目标仍可继续使用。
- 工具里显示不可信正文时应使用 `textContent`，避免把用户输入、网页内容或远端 HTML 当成可信 DOM 注入。
- 工具安装批准的基础能力直接复用，不再要求剪藏/知识保存逐站二次授权；Chrome 网站访问仍须有效，独立标签页仍须绑定自身目标文档。Cookie 等独立敏感操作继续按原授权处理。统一规则见[安装即用合同](../architecture/browser-framework/site-permission-onboarding.zh-CN.md)。
- 更新、卸载与工具写入使用既有宿主锁和重新验证，卸载还会删除本工具本地数据。交付前必须明确提醒用户备份重要数据。

## 4. 维护和排错入口

- **Cookie Editor**：[已安装工具与权限说明](../../examples/sidebar-tools/cookie-editor/README.zh-CN.md)。默认通过 `OpenDeskSDK.browser.cookies.*` 管理已授权网站的真实 Cookie；元数据、敏感值和修改分别授权，离线工作区仍只操作临时内存。`cookies.set` 可选 `ifAbsent:true`（须显式 Path）在真实确认后的写入前拒绝同身份冲突，用于新建和改名；Chrome 不提供原子改名。
- **开发方法**：[统一开发规范](sidebar-tool-development.zh-CN.md)。
- **示例**：[quick-notes](../../examples/sidebar-tools/quick-notes/README.md)、[React starter](../../examples/sidebar-tools/react-starter/README.md)、[Vue starter](../../examples/sidebar-tools/vue-starter/README.md)。
- **专项网页工具**：[阅读目录](../../examples/sidebar-tools/reading-toc/README.md)（含文章/AI 对话手工 fixture）、[网页剪藏](../../examples/sidebar-tools/web-markdown-clipper/README.md)、[知识收件箱](../../examples/sidebar-tools/knowledge-inbox/README.zh-CN.md)。
- **开发者与 AI**：[API 首页](README.md)、[AI Skill](../../.agents/skills/opendesk-sidebar-tool-dev/SKILL.md)、[测试指南](../framework/testing-guide.md)。
- **源码合同**：`src/ui/sidebar-tools/package.js`、`src/ui/sidebar-tools.js`、`src/sidebar-tools/bridge.js`、`src/sidebar-tools/official-catalog.js`、`scripts/build-sidebar-tool.mjs`、`scripts/build-official-tools.mjs`。

本页记录现有 `v1/v2` 工具能力，不表示正在设计中的应用市场远端安装、个人内容批量迁移、自动发布、完整 React 热同步或通用 Native API 已落地。


## 5. 安装后的本地保存位置、扩容和数据恢复（2026-10-11）

以下均为扩展宿主自己的 **`chrome.storage.local`** 持久化键，不是用户可任意访问的文件夹；浏览器的当前 Profile 和此扩展 ID 决定实际存储归属。安装包按 v1/v2 封闭字段保存，不附加来源、作者或支付信息：

| 内容 | 存储键/前缀 | 说明 |
| --- | --- | --- |
| 已安装工具代码及清单 | `opendesk.sidebar-tools.installed.v1` | 最多 12 项，完整 `html/css/js` 均在数组中；更新时不迁移为 IndexedDB |
| 普通工具数据 | `opendesk.sidebar-tools.data.v1:<toolId>` | 工具只能通过批准的 `storage.get/set` 访问自己的命名空间 |
| 知识收件箱数据 | `opendesk.sidebar-tools.data.v1:knowledge-inbox` | 与普通工具共用持久键形式，但专用服务提供 **200 条 / 4 MiB** 的独立上限 |
| 市场来源 | `opendesk.market.provenance.v1` | 安装来源、实际发行版本、规范化 SHA-256；**不放入严格 v1 包** |
| 市场安装事务 | `opendesk.market.operations.v1` | 恢复核对的操作 ID、版本、摘要、状态；未知结果不得直接重放 |
| 部分卸载清理 | `opendesk.sidebar-tools.uninstall-cleanup.v1` | 已确认卸载但清理仍未完成时保留；后续需手动恢复 |
| 工具旧实例撤销代际 | `opendesk.sidebar-tools.revocation-epochs.v1` | 新安装、实际升级、卸载及启停转换更新该 ID 的独立随机代际；相同包安装 noop 不更新；即使再次安装完全相同包，旧 iframe 及知识收件箱旧会话也不能恢复数据写入权 |

**宿主必须声明 `unlimitedStorage`**，在 `manifest.json` 和 `src/platform/chrome/permission-gate.js` 中同步维护。运行时用 `chrome.permissions.contains({permissions:['unlimitedStorage']})` 检查是否真正生效；若未生效，可读取既有本地工具，但写入仍受浏览器默认配额限制。该权限不是工具包的 capability，不授予工具直接操作 `chrome.storage` 的能力，不自动授权访问网站，也不取消设备物理空间限制。

市场「我的应用」使用 `getBytesInUse()` 显示：扩展 local 总占用、已安装工具包占用、已安装及已知待清理工具的数据占用（包含知识收件箱）、大容量权限状态。显示**实际使用字节数**而非假的总容量/剩余空间；无法读取时显示「暂时无法读取」。完整单个工具包实际分摊存储于共享数组，若进行每工具估计，应注明其不等于独立键的实际占用。页面打开、手动刷新或相关存储变化时更新，不持续扫全库、不读取或记录笔记正文。浏览器清除 Profile、移除扩展等操作仍可能丢失本机数据；关键笔记应先使用知识收件箱备份功能。

宿主空间与工具数量分别处理（2026-10-29）：**框架不设置安装总数上限**。导入、更换安装包、市场批量安装和迁移均读取完整有效注册表，不因超过旧 12/13 项而拒绝或截断。未来 VIP 等数量权益属于独立产品策略，本轮未实现；不得再用存储或沙箱预算冒充安装名额。仍保留以下实际资源保护：

- 单工具包最大 **2,097,152 UTF-8 字节（2 MiB）**。容量策略与旧数量预算的替代关系见 [R32.3](../architecture/browser-ui-r23.zh-CN.md#2026-10-29取消框架安装数量限制)。安装多少工具不等于同时启动多少沙箱。
- 普通工具的单项数据最多 **8,192 字节**、全工具最多 **32,768 字节**，每个工具最多 **32** 个字段。
- 知识收件箱独立保留 **200 条 / 总数据 4 MiB**；不得用普通工具 32 KiB 限制替代。
- `E_TOOL_LIMIT` / `E_TOOL_DATA_LIMIT` 是单包/工具数据资源保护；`E_MANAGED_DNR_CAPACITY` 仅表示受管网站原生规则槽位不足或待清理，不限制工具安装总数；`E_HOST_STORAGE_QUOTA` / `E_HOST_STORAGE_WRITE` 属于宿主写入/设备环境问题；`E_STORAGE_CONFLICT` 是版本核对失败；`E_OUTCOME_UNKNOWN` 是读回不足以判断已发生的效果。旧安装错误 `E_TOOL_CAPACITY` 已移除。

**安装与更新**：经审阅确认后，复用 `tool:<id> → catalog` 的既有锁。预提交失败不覆盖已安装旧包和其业务数据。注册表存储写入后**读回比对**，明确失败且读回仍为旧包时报告未成功；写入回执丢失或后续来源/事务记录失败时保留未知状态、要求核对，不声称回滚、不恢复整个旧工具列表。恢复操作从本机安装包计算规范化 SHA-256，核对持久事务的 ID/版本/摘要与来源；经锁与当前安装再次校验后，才允许补完缺失的来源/终态。**不依赖官方目录在线或重新下载包**；不能确认时保持未知，不重复消费旧安装批准。网站授权不会因恢复而自动重新授予。

**工具数据保存**：宿主在相同工具锁下校验版本/会话、字段个数、大小和可选 etag，然后尝试写入并读回确认。仅在持久化确认后返回 `saved:true`；失败返回明确 `error.code` 与受控消息，工具界面应保留用户草稿和未保存提示。知识收件箱消息经后台已有锁处理，Side Panel 转发时**不再重复套锁**。未知写入结果必须先重新加载校验，不能直接把草稿丢弃或静默覆盖。

**卸载**：用户明确确认后，先写卸载恢复意图，再从安装数组中移除指定工具。随后才尝试清理该工具命名空间、网站授权及专用会话；部分清理失败时，安装列表和真实存储状态分别展示，在「我的应用」可点击「恢复清理」。恢复动作持锁重查同 ID 是否重新安装；若已安装，不会删除新实例的数据。不会清空整个 `storage.local`，不会自动删除其他工具、用户笔记或授予新权限。 同 ID 工具卸载时先持久化随机撤销代际（宿主元数据，不进入 v1 包）；旧窗口即使错过存储变更通知，保存请求仍会在持锁状态下被拒绝为 `E_TOOL_CHANGED`，旧窗口中的未保存草稿不因此自动清空。若旧 ID 仍有孤立笔记，新的安装会以 `E_TOOL_ORPHAN_DATA` 拒绝自动清理，防止安装写入失败导致历史数据被提前删除。

**离线打开**：市场目录是发现与校验新发行的来源，**不是本地工具运行依赖**。市场读取错误或条目下架后，「我的应用」仍从本机安装记录展示和打开本地代码；条目不再提供新安装。本地安装列表读失败必须提供重试，不能被解释为「尚未安装」。严格的共享读取验证在安装数组含无效条目或重复 ID 时返回 `E_STORAGE_CORRUPT`，与安装数量无关；安装/卸载都不会通过过滤条目覆盖旧记录；Side Panel 也会提示读取异常，而不是伪装成没有工具。多个窗口本地安装列表同时刷新时，以较新请求的读回为准，过期结果不会覆盖新状态。官方市场代码匹配单独异步完成，即使某个官方包资源一直无法读取，已安装本地工具也可以打开。这不表示第三方作者发布、下架后台或计费已实施。

相关实现：`src/ui/sidebar-tools/installation.js`、`src/ui/sidebar-tools/storage-state.js`、`src/ui/sidebar-tools/storage-usage.js`、`src/ui/sidebar-tools.js`、`src/sidebar-tools/bridge.js`、`src/knowledge/service.js`、`src/marketplace/page.js`。定向测试：`tests/environment/sidebar-storage-unlimited.test.mjs`、`tests/environment/app-market-r3.test.mjs`、`tests/environment/sidebar-tools-host.test.mjs`；受控浏览器容量验证见 `tests/framework/app-market-r3-native.test.mjs`。


## R4.8 官方默认预装与 Side Panel 入口

R4.8 当时的预装工具包使用 `opendesk.sidebar-tool.v1`；当前其他工具亦可使用 v2。扩展内官方源码 Catalog 的 `installationPolicy` 额外支持 `optional` 和 `preinstalled`。后者不属于普通可导入的工具包字段；用户自行导入 JSON 无权触发预装。

新安装扩展时，可信 Service Worker 只登记一次性意图；后台的可信固定资源立即调用原安装器预装 `reading-toc` 和 `quick-notes`，仅登记到原 `opendesk.sidebar-tools.installed.v1`。未确认的新 Profile、升级、重新打开 Side Panel 不会自动安装。持久初始化状态为 `opendesk.sidebar-tools.bootstrap.v1`；存储异常失败关闭，不重放未知提交。用户卸载或停用选择优先于任何预装策略。

**R4.8 历史导航说明**：当时「工具」Tab 将「我的工具 / 发现工具」分开显示。**现行 Extension Center R4** 在「扩展」使用单列表，默认优先显示已安装应用和网页增强；搜索或筛选可查看官方候选/可安装项，行内「应用 / 网页增强」仅为类型标签，不是额外的 Tab。已安装项使用打开/管理入口，更新仍需审阅。完整应用市场（`ui/marketplace.html`）仍承担套装、版本、来源、批量和存储管理。安装≠启用网站权限≠执行：安装不注入网页、不创建 iframe、不自动获取网页数据。

R4.8 当时尚未提供全局启停；当前安装器已有工具级启停，仍需与网站级授权分开理解。停用、卸载和关闭界面的效果按 [生命周期指南](extension-development-selection.zh-CN.md) 及各工具实际清理合同核验，不能把停用一律解释为删除业务数据。


## Browser SDK v2 菜单贡献（R1.3）

旧 `opendesk.sidebar-tool.v1` 保持严格兼容；`opendesk.sidebar-tool.v2` 支持 `requires.browserSdk: "1.0.0"`、`browser.contextMenu` 能力声明及至多三项 `contributes.contextMenus`。仅允许 `page/selection/link` 和明确 HTTP(S) 网站范围；`handler` 只接受 `open-self`，不得执行任意后台第三方代码。

复用已有安装器、工具身份、Web Locks、版本管理和卸载。可选 Chrome `contextMenus` 权限仅由可信工具详情中的真实点击申请；网站批准绑定工具包完整摘要和撤销代际。沙箱调用 `OpenDeskSDK.browser.contextMenu.*` 与 `launch.consume()`，现有 `OpenDeskTool.request()` 不变。普通网页不取得菜单注册能力。

详情见 [Browser SDK](browser-sdk.zh-CN.md) 和 [可导入示例](../../examples/sidebar-tools/browser-sdk-r13/README.zh-CN.md)。真实 Chrome 状态须以当前候选验收为准。


## Browser SDK R1.3 当前安装与验收（2026-10-12）

v1/v2 JSON 直接导入既有工具安装器，无需开发者另编译 Chrome 扩展；Builder 和官方工具仍遵守原资源与严格 schema/CSP 校验。v2 `requires.browserSdk` 固定为 `1.0.0`，最多三项 `open-self` 菜单，网站必须明确 HTTP(S) host；本轮不新增 tabs/sidePanel 等能力批准字段。

安装/更新仍绑定规范包 SHA-256 和撤销代际；Browser 请求同时带挂载包摘要，在 SW 排队及安装锁后再次复核。菜单注销清除旧启动票据，关闭/实例替换不能继续领取；来源文档、网站批准、Chrome 权限及 TTL 每次复核。工具 JS 等启动绑定 ACK 后运行。普通网页的 Page SDK 只做本地能力发现，不能注册特权菜单或调用 Native Host。

规范 `browser.clipboard.writeText` / `browser.downloads.text` 与便捷层共用原 `user.export`、安装锁和服务；`OpenDeskTool.request()` 使用这两个规范操作名。菜单授权通过可信详情按钮与 Chrome 原生权限，不新增工具 alert/confirm/prompt。

R1.3 历史实施、组件和原生状态及精确候选见 [R1.3 总表](../framework/workstreams/browser-sdk-r13-20261011.md)。该记录曾引用的 `browser-sdk-r13-acceptance.json` 已不在当前 main，不能据失效链接确认验收；后续能力和当前可调用状态查 [Browser SDK](browser-sdk.zh-CN.md)。组件通过不能提升为原生菜单、F3 或 ZIP 通过。

### 通用结构化 AI 请求

安装能力 `ai.generate` 提供 `ai.info` / `ai.generate` / `ai.cancel`；先读取 generation，发送时以 `providerGeneration` 原样绑定。每次发送经过可信 Host 的真实点击确认。完整字段、容量、取消与证据语义见 [Sidebar Tool AI bridge](sidebar-tools-ai.zh-CN.md)。
### 受限本机长任务（v2 增量）

工具可声明 `localTasks`，通过原 `OpenDeskTool.request` 使用首次可信配对、精确目标审阅及自身任务读取/停止/导出。凭证不进入沙箱，也不开放任意 localhost。完整端点、预算、未知结果及撤权合同见 [本地任务桥接](local-task-bridge.zh-CN.md)。
