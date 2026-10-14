# 扩展中心「应用」Sidebar Tool API 参考

> 本页只说明 **`opendesk.sidebar-tool.v1` 的当前接口合同**。**所有同类型工具的统一开发方法**（选型、目录规范、预览、打包、安装、测试）请先阅读 [Side Panel 工具统一开发规范](sidebar-tool-development.zh-CN.md)。示例见 [examples/sidebar-tools](../../examples/sidebar-tools/README.zh-CN.md)；AI/Codex 用 [开发 Skill](../../.agents/skills/opendesk-sidebar-tool-dev/SKILL.md)。

这是 Side Panel「扩展」中的「应用」类型 HTML/CSS/JS Sidebar Tool 包（现行入口见 [R4 产品规格](../product/sidebar-ui-spec.zh-CN.md)），不是单独的 Chrome 扩展，不是 `opendesk.task.v1`，也不是 Controller/Page USER_SCRIPT 项目。**源代码与运行合同的最终依据**为 `src/ui/sidebar-tools/package.js`、`src/ui/sidebar-tools.js`、`src/sidebar-tools/bridge.js`、`src/sidebar-tools/official-catalog.js`、`scripts/build-sidebar-tool.mjs`、`scripts/build-official-tools.mjs`。

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

这里的字符串是**字段示意**，不是可安装的完整示例；请用打包器从真实文件生成。最终 JSON 只允许 `format/id/version/title/description/capabilities/html/css/js`，不是 `manifest.json`。源配置只允许 `id/version/title/description/capabilities/files/assets`。

| 项目 | 当前约束 |
| --- | --- |
| 格式 | `opendesk.sidebar-tool.v1` |
| id | `^[a-z][a-z0-9-]{1,39}$`，稳定且安装时按 ID 区分 |
| version | 数字 `major.minor.patch`，没有前缀/预发布标签 |
| title / description | 最长 80 / 300 字符 |
| HTML / CSS / JS | 最长 64,000 / 120,000 / 220,000 字符（源文件还有相应字节预算） |
| 完整包 | 最大 320,000 UTF-8 bytes |
| 安装数量 | 最多 12 个 |
| 图片 assets | 最多 16 个；每张 ≤96 KiB；PNG/JPEG/WebP，本地预嵌入 |

HTML 不允许 `script/iframe/object/embed/base/link/meta/style` 标签、内联事件、`javascript:` 等；CSS 不允许远程 `@import`、HTTP/JS 资源；JS 必须是单个本地经典脚本，不能直接保留顶层 `import/export`。校验器不能代替 CSP、安全审计或真实浏览器验收。

## 1.1 官方可选发行与安装状态（R4.5）

官方源码登记于仓库根 `official-tools/catalog.json`，版本和能力以对应 `examples/sidebar-tools/<id>/tool.config.json` 为准。正式构建自动生成 `dist/{production,development}/official-tools/catalog.json` 和 `official-tools/<id>/<id>.opendesk-tool.json`，不维护源码目录中的生成包副本。完整字段、构建和更新合同见 [官方工具 Catalog](official-tools-catalog.zh-CN.md)。

**随扩展发行、已安装、工具启用、网站可用和正在运行是独立状态。** `SIDEBAR_TOOL_STORE` 是唯一安装事实。默认预装由宿主持久计划管理，不因读取 Catalog 执行 JavaScript。官方入口与本地导入复用原安装器和锁；审核、取消、更新确认、私有数据保留和卸载都遵守既有合同。

五个官方候选统一显示安装/更新/已安装状态。官方包确认时再次核对固定资源的大小、SHA-256、身份与能力；缺包或不匹配不得安装。更新不自动替换旧安装，卸载后也不会因 Chrome 重启、扩展升级或重开侧栏恢复安装。

内置 `reading-toc` 安装并启用后默认可用于所有 HTTP(S) 网页，不再逐站点点击授权。工具停用、网站停用、单页排除、显示偏好和 Chrome 自身的站点访问权限仍独立生效；浏览器受限页面不支持。其他 ID 的 `page.toc` 工具、剪藏、知识保存仍逐工具、逐 origin 授权。

`opendesk.sidebar-tools.toc-sites.v1` 中，`reading-toc` 缺记录或原有正向站点数组表示默认全部可用；停用记录为 `{mode:'all-except',blockedOrigins:[具体 HTTP(S) origin]}`，最多 64 个。恢复最后一个停用网站后移除该工具记录，回到默认可用。其他工具保持原有正向数组；异常内置记录保守拒绝，不自动丢弃。旧白名单不保存历史撤权意图，因此按新的用户要求改为全部默认可用，已有明确单页排除和隐藏偏好保留。

## 2. 工具的运行 API

隔离沙箱的唯一工具对象：

```javascript
const {root, request} = globalThis.OpenDeskTool;
const status = root.querySelector('#status');
const {value,etag} = await request('storage.get', {key:'note',withEtag:true});
await request('storage.set', {key:'note',value:'hello',ifMatch:etag});
status.textContent = '已保存';
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
| `user.export` | `clipboard.writeText`：`{text}` | 环境允许时复制纯文本，成功返回 `{copied:true}` |
| `user.export` | `file.download`：`{text,filename}` | 请求 Chrome 下载安全文件名的 `.md` / `.txt` / `.json` 纯文本；返回 `{downloadId}` 不能单独证明真实落盘 |

普通 `storage.local` 当前最多 32 个键，每项 JSON ≤8,192 字节，工具数据对象总 JSON ≤32,768 字节。`key` 须以英文字母开头，仅允许英文字母/数字/点/下划线/连字符，最长 60 字符。`withEtag/ifMatch` 是可选的条件更新；发生冲突应重新读回并让用户决定，不自动覆盖。

`clipboard.writeText`、`file.download` 的文本须非空且 UTF-8 ≤150,000 bytes。`file.download` 仅允许不含路径分隔符等危险字符的 `.md`、`.txt` 或 `.json` 文件名（长度 ≤90）；一般网络下载、二进制文件和任意绝对路径写入都**不是**此 API 的能力。工具不使用宿主的任意网络代理。

### 官方固定网页增强能力（不是任意 DOM API）

| capability | 现有固定操作/服务 | 限制 |
| --- | --- | --- |
| `page.toc` | `toc.snapshot`、`toc.navigate` | 复用阅读目录可信 Content Script、明确网站许可及目标文档再校验；非通用页面选择器 |
| `page.clip` | `clip.article`、`clip.selection`、`clip.link` 等固定剪藏操作 | 复用剪藏可信 Content Script、单独的网站许可及定向结果 |
| `page.capture` | ChatGPT 知识保存专用页面捕获 | 已批准网站和官方扩展固定入口；不能自行定义任意采集脚本 |
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
- 工具安装不会自动授予网站权限；独立标签页的页面目标/剪藏权限不等于原 Side Panel 的已绑定目标。对敏感操作需由实际 UI 授权并处理不可用状态。
- 更新、卸载与工具写入使用既有宿主锁和重新验证，卸载还会删除本工具本地数据。交付前必须明确提醒用户备份重要数据。

## 4. 维护和排错入口

- **Cookie Editor**：[已安装工具与权限说明](../../examples/sidebar-tools/cookie-editor/README.zh-CN.md)。默认通过 `OpenDeskSDK.browser.cookies.*` 管理已授权网站的真实 Cookie；元数据、敏感值和修改分别授权，离线工作区仍只操作临时内存。`cookies.set` 可选 `ifAbsent:true`（须显式 Path）在真实确认后的写入前拒绝同身份冲突，用于新建和改名；Chrome 不提供原子改名。
- **开发方法**：[统一开发规范](sidebar-tool-development.zh-CN.md)。
- **示例**：[quick-notes](../../examples/sidebar-tools/quick-notes/README.md)、[React starter](../../examples/sidebar-tools/react-starter/README.md)、[Vue starter](../../examples/sidebar-tools/vue-starter/README.md)。
- **专项网页工具**：[阅读目录](../../examples/sidebar-tools/reading-toc/README.md)（含文章/AI 对话手工 fixture）、[网页剪藏](../../examples/sidebar-tools/web-markdown-clipper/README.md)、[知识收件箱](../../examples/sidebar-tools/knowledge-inbox/README.zh-CN.md)。
- **开发者与 AI**：[API 首页](README.md)、[AI Skill](../../.agents/skills/opendesk-sidebar-tool-dev/SKILL.md)、[测试指南](../framework/testing-guide.md)。
- **源码合同**：`src/ui/sidebar-tools/package.js`、`src/ui/sidebar-tools.js`、`src/sidebar-tools/bridge.js`、`src/sidebar-tools/official-catalog.js`、`scripts/build-sidebar-tool.mjs`、`scripts/build-official-tools.mjs`。

本页记录现有 `v1` 能力，不表示正在设计中的应用市场远端安装、个人内容批量迁移、自动发布、完整 React 热同步或通用 Native API 已落地。


## 5. 安装后的本地保存位置、扩容和数据恢复（2026-10-11）

以下均为扩展宿主自己的 **`chrome.storage.local`** 持久化键，不是用户可任意访问的文件夹；浏览器的当前 Profile 和此扩展 ID 决定实际存储归属。安装包是完整的 `opendesk.sidebar-tool.v1` 扁平包，不附加来源、作者或支付信息：

| 内容 | 存储键/前缀 | 说明 |
| --- | --- | --- |
| 已安装工具代码及清单 | `opendesk.sidebar-tools.installed.v1` | 最多 12 项，完整 `html/css/js` 均在数组中；更新时不迁移为 IndexedDB |
| 普通工具数据 | `opendesk.sidebar-tools.data.v1:<toolId>` | 工具只能通过批准的 `storage.get/set` 访问自己的命名空间 |
| 知识收件箱数据 | `opendesk.sidebar-tools.data.v1:knowledge-inbox` | 与普通工具共用持久键形式，但专用服务提供 **200 条 / 4 MiB** 的独立上限 |
| 市场来源 | `opendesk.market.provenance.v1` | 安装来源、实际发行版本、规范化 SHA-256；**不放入严格 v1 包** |
| 市场安装事务 | `opendesk.market.operations.v1` | 恢复核对的操作 ID、版本、摘要、状态；未知结果不得直接重放 |
| 部分卸载清理 | `opendesk.sidebar-tools.uninstall-cleanup.v1` | 已确认卸载但清理仍未完成时保留；后续需手动恢复 |
| 工具旧实例撤销代际 | `opendesk.sidebar-tools.revocation-epochs.v1` | 卸载时更新该 ID 的独立随机代际；即使再次安装完全相同包，旧 iframe 及知识收件箱旧会话也不能恢复数据写入权 |

**宿主必须声明 `unlimitedStorage`**，在 `manifest.json` 和 `src/platform/chrome/permission-gate.js` 中同步维护。运行时用 `chrome.permissions.contains({permissions:['unlimitedStorage']})` 检查是否真正生效；若未生效，可读取既有本地工具，但写入仍受浏览器默认配额限制。该权限不是工具包的 capability，不授予工具直接操作 `chrome.storage` 的能力，不自动授权访问网站，也不取消设备物理空间限制。

市场「我的应用」使用 `getBytesInUse()` 显示：扩展 local 总占用、已安装工具包占用、已安装及已知待清理工具的数据占用（包含知识收件箱）、大容量权限状态。显示**实际使用字节数**而非假的总容量/剩余空间；无法读取时显示「暂时无法读取」。完整单个工具包实际分摊存储于共享数组，若进行每工具估计，应注明其不等于独立键的实际占用。页面打开、手动刷新或相关存储变化时更新，不持续扫全库、不读取或记录笔记正文。浏览器清除 Profile、移除扩展等操作仍可能丢失本机数据；关键笔记应先使用知识收件箱备份功能。

扩容仅解除 Chrome 对宿主存储的常规小容量上限，**不放宽产品自身限制**：

- 最多安装 **12** 个工具；单工具包最大 **320,000 UTF-8 字节**。
- 普通工具的单项数据最多 **8,192 字节**、全工具最多 **32,768 字节**，每个工具最多 **32** 个字段。
- 知识收件箱独立保留 **200 条 / 总数据 4 MiB**；不得用普通工具 32 KiB 限制替代。
- `E_TOOL_CAPACITY` / `E_TOOL_LIMIT` / `E_TOOL_DATA_LIMIT` 属于产品限额；`E_HOST_STORAGE_QUOTA` / `E_HOST_STORAGE_WRITE` 属于宿主写入/设备环境问题；`E_STORAGE_CONFLICT` 是版本核对失败；`E_OUTCOME_UNKNOWN` 是读回不足以判断已发生的效果。

**安装与更新**：经审阅确认后，复用 `tool:<id> → catalog` 的既有锁。预提交失败不覆盖已安装旧包和其业务数据。注册表存储写入后**读回比对**，明确失败且读回仍为旧包时报告未成功；写入回执丢失或后续来源/事务记录失败时保留未知状态、要求核对，不声称回滚、不恢复整个旧工具列表。恢复操作从本机安装包计算规范化 SHA-256，核对持久事务的 ID/版本/摘要与来源；经锁与当前安装再次校验后，才允许补完缺失的来源/终态。**不依赖官方目录在线或重新下载包**；不能确认时保持未知，不重复消费旧安装批准。网站授权不会因恢复而自动重新授予。

**工具数据保存**：宿主在相同工具锁下校验版本/会话、字段个数、大小和可选 etag，然后尝试写入并读回确认。仅在持久化确认后返回 `saved:true`；失败返回明确 `error.code` 与受控消息，工具界面应保留用户草稿和未保存提示。知识收件箱消息经后台已有锁处理，Side Panel 转发时**不再重复套锁**。未知写入结果必须先重新加载校验，不能直接把草稿丢弃或静默覆盖。

**卸载**：用户明确确认后，先写卸载恢复意图，再从安装数组中移除指定工具。随后才尝试清理该工具命名空间、网站授权及专用会话；部分清理失败时，安装列表和真实存储状态分别展示，在「我的应用」可点击「恢复清理」。恢复动作持锁重查同 ID 是否重新安装；若已安装，不会删除新实例的数据。不会清空整个 `storage.local`，不会自动删除其他工具、用户笔记或授予新权限。 同 ID 工具卸载时先持久化随机撤销代际（宿主元数据，不进入 v1 包）；旧窗口即使错过存储变更通知，保存请求仍会在持锁状态下被拒绝为 `E_TOOL_CHANGED`，旧窗口中的未保存草稿不因此自动清空。若旧 ID 仍有孤立笔记，新的安装会以 `E_TOOL_ORPHAN_DATA` 拒绝自动清理，防止安装写入失败导致历史数据被提前删除。

**离线打开**：市场目录是发现与校验新发行的来源，**不是本地工具运行依赖**。市场读取错误或条目下架后，「我的应用」仍从本机安装记录展示和打开本地代码；条目不再提供新安装。本地安装列表读失败必须提供重试，不能被解释为「尚未安装」。 严格的共享读取验证会在安装数组含无效条目、重复 ID 或超过 12 项时返回 `E_STORAGE_CORRUPT`，安装/卸载都不会通过过滤条目覆盖旧记录；Side Panel 也会提示读取异常，而不是伪装成没有工具。多个窗口本地安装列表同时刷新时，以较新请求的读回为准，过期结果不会覆盖新状态。官方市场代码匹配单独异步完成，即使某个官方包资源一直无法读取，已安装本地工具也可以打开。这不表示第三方作者发布、下架后台或计费已实施。

相关实现：`src/ui/sidebar-tools/installation.js`、`src/ui/sidebar-tools/storage-state.js`、`src/ui/sidebar-tools/storage-usage.js`、`src/ui/sidebar-tools.js`、`src/sidebar-tools/bridge.js`、`src/knowledge/service.js`、`src/marketplace/page.js`。定向测试：`tests/environment/sidebar-storage-unlimited.test.mjs`、`tests/environment/app-market-r3.test.mjs`、`tests/environment/sidebar-tools-host.test.mjs`；受控浏览器容量验证见 `tests/framework/app-market-r3-native.test.mjs`。


## R4.8 官方默认预装与 Side Panel 入口

正式工具包格式保持 `opendesk.sidebar-tool.v1`，扩展内官方源码 Catalog 的 `installationPolicy` 额外支持 `optional` 和 `preinstalled`。后者不属于普通可导入的工具包字段；用户自行导入 JSON 无权触发预装。

新安装扩展时，可信 Service Worker 只登记一次性意图；后台的可信固定资源立即调用原安装器预装 `reading-toc` 和 `quick-notes`，仅登记到原 `opendesk.sidebar-tools.installed.v1`。未确认的新 Profile、升级、重新打开 Side Panel 不会自动安装。持久初始化状态为 `opendesk.sidebar-tools.bootstrap.v1`；存储异常失败关闭，不重放未知提交。用户卸载或停用选择优先于任何预装策略。

**R4.8 历史导航说明**：当时「工具」Tab 将「我的工具 / 发现工具」分开显示。**现行 Extension Center R4** 在「扩展」使用单列表，默认优先显示已安装应用和网页增强；搜索或筛选可查看官方候选/可安装项，行内「应用 / 网页增强」仅为类型标签，不是额外的 Tab。已安装项使用打开/管理入口，更新仍需审阅。完整应用市场（`ui/marketplace.html`）仍承担套装、版本、来源、批量和存储管理。安装≠启用网站权限≠执行：安装不注入网页、不创建 iframe、不自动获取网页数据。

R4.8 暂不提供新的全局工具启停按钮；原有“当前网站目录显示/授权”是网站级规则，不是整个工具的停用开关。只有在所有启动入口统一拦截后才可发布全局启停。


## Browser SDK v2 菜单贡献（R1.3）

旧 `opendesk.sidebar-tool.v1` 保持严格兼容；`opendesk.sidebar-tool.v2` 支持 `requires.browserSdk: "1.0.0"`、`browser.contextMenu` 能力声明及至多三项 `contributes.contextMenus`。仅允许 `page/selection/link` 和明确 HTTP(S) 网站范围；`handler` 只接受 `open-self`，不得执行任意后台第三方代码。

复用已有安装器、工具身份、Web Locks、版本管理和卸载。可选 Chrome `contextMenus` 权限仅由可信工具详情中的真实点击申请；网站批准绑定工具包完整摘要和撤销代际。沙箱调用 `OpenDeskSDK.browser.contextMenu.*` 与 `launch.consume()`，现有 `OpenDeskTool.request()` 不变。普通网页不取得菜单注册能力。

详情见 [Browser SDK](browser-sdk.zh-CN.md) 和 [可导入示例](../../examples/sidebar-tools/browser-sdk-r13/README.zh-CN.md)。真实 Chrome 状态须以当前候选验收为准。


## Browser SDK R1.3 当前安装与验收（2026-10-12）

v1/v2 JSON 直接导入既有工具安装器，无需开发者另编译 Chrome 扩展；Builder 和官方工具仍遵守原资源与严格 schema/CSP 校验。v2 `requires.browserSdk` 固定为 `1.0.0`，最多三项 `open-self` 菜单，网站必须明确 HTTP(S) host；本轮不新增 tabs/sidePanel 等能力批准字段。

安装/更新仍绑定规范包 SHA-256 和撤销代际；Browser 请求同时带挂载包摘要，在 SW 排队及安装锁后再次复核。菜单注销清除旧启动票据，关闭/实例替换不能继续领取；来源文档、网站批准、Chrome 权限及 TTL 每次复核。工具 JS 等启动绑定 ACK 后运行。普通网页的 Page SDK 只做本地能力发现，不能注册特权菜单或调用 Native Host。

规范 `browser.clipboard.writeText` / `browser.downloads.text` 与便捷层共用原 `user.export`、安装锁和服务；旧操作保持兼容。菜单授权通过可信详情按钮与 Chrome 原生权限，不新增工具 alert/confirm/prompt。

最新实施/组件/原生状态及精确候选见 [R1.3 当前总表](../framework/workstreams/browser-sdk-r13-20261011.md) 和 [验收 JSON](../framework/workstreams/browser-sdk-r13-acceptance.json)。组件通过不能提升为原生菜单、F3 或 ZIP 通过。
