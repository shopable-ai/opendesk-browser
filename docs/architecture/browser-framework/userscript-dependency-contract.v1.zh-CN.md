# 用户脚本依赖合同 v1（D1）

> 2026-10-08。本文按 D1 实际源码字段描述声明、审核、资产、依赖锁和 Page Program 的边界，不是安装或原生验收回执。Page Program 正式安装、类型验证与启动对账尚未接入。
>
> JSON 示例中的 `<SHA256_…>`、`<UUID>`、`<原始源码>` 均为占位符，不是实测哈希、资源或可直接提交的合法请求。实际 SHA-256 必须是 64 位小写十六进制字符串；真正的摘要和 ID 必须由实现计算，不能照抄示例。

## 1. 合同的实现来源

| 职责 | 实际文件 |
| --- | --- |
| 元数据读取、兼容诊断、执行准入 | [dependency-metadata.js](../../../src/scripting/user-scripts/dependency-metadata.js) |
| 声明摘要、来源读取、审核、资产缓存、不可变锁 | [dependency-manager.js](../../../src/scripting/user-scripts/dependency-manager.js) |
| 扩展内固定资产 | [packaged-dependencies.js](../../../src/scripting/user-scripts/packaged-dependencies.js) |
| classic / async-main 共享编译 | [execution-source.js](../../../src/scripting/user-scripts/execution-source.js) |
| 当前文档预览与回执 | [preview.js](../../../src/scripting/user-scripts/preview.js)、[preview-worlds.js](../../../src/scripting/user-scripts/preview-worlds.js) |
| Page 资产合同、注册描述编译 | [page-program-contract.js](../../../src/scripting/user-scripts/page-program-contract.js)、[page-program-package.js](../../../src/scripting/user-scripts/page-program-package.js) |
| 可信命令入口 | [broker.js](../../../src/platform/host/broker.js) |
| IndexedDB v2 与原始备份 | [storage/index.js](../../../src/platform/storage/index.js)、[storage/idb.js](../../../src/platform/storage/idb.js) |

依赖适配器只获取字节。第三方 JS 不在 Service Worker、Sidebar、Controller Worker 或下载器内部执行。页面执行只由现有可信 Broker 进入 `chrome.userScripts`。

## 2. 必须区分的状态与对象

| 对象 | 实际标识 / 状态 | 代表什么 | 不代表什么 |
| --- | --- | --- | --- |
| 源码声明 | parser 的 `requires`、`directives`、`diagnostics` | 作者要求加载什么，以及当前可理解的语义 | 已下载、已授权或已获准运行 |
| 缓存资产 | `tag: userscript-asset-v1`，`integrityStatus: verified` | 实际字节及 SHA-256；读取时会重新校验 | 已通过恶意代码审计、任意 namespace 可使用 |
| 待审记录 | `tag: userscript-review-v1`，`status: pending-review`，`approvalStatus: pending` | 这一组具体来源与字节已读取，等待用户确认 | 已允许页面执行 |
| 已完成审核记录 | 同一 review 改为 `status: reviewed`、`approvalStatus: approved`，增加 `lockId` | 对应审核已经产生固定锁 | Program Revision、Candidate 或 Available |
| 不可变依赖锁 | `tag: userscript-lock-v1`，`status: locked`，`approvalStatus: approved` | 某 namespace 批准的有序资产、来源、声明摘要 | 页面访问权限、正式安装许可 |
| 引用记录 | `tag: userscript-reference-v1` | review 或 lock 当前引用的资产哈希 | 已实现 Revision/安装/运行历史的完整回收图 |
| Page Program manifest | `format: opendesk.page-program.v1` | 固定源码版本、依赖锁、页面规则及入口类型 | 已持久保存、通过类型验证、Available 或已安装 |
| 当前文档预览结果 | `state: preview-evaluated`，`durable: false`，`registered: false` | 本次受控预览收到符合格式的完成回执 | 自动运行注册、任务验证或持久 Controller Result |

资产字节按哈希共享；来源、审核与锁按 namespace 隔离。另一个 namespace 不能凭相同 `sha256` 直接取得缓存使用授权。`explicitUserAction: true` 也不是独立授权凭证：请求仍必须通过既有 Host 身份校验。

## 3. 元数据与依赖声明

### 3.1 Parser 与准入 API

```javascript
parseUserScriptDependencies(sourceUtf8, {importSourceUrl} = {})
assessUserScriptExecution(parsed, {
  entryFormat: 'async-main',
  phase: 'preview',
  dependenciesLocked: false
})
assertUserScriptExecutable(parsed, options)
```

parser 返回深冻结对象，字段为：

- `profile: 'opendesk-d1'`。
- `hasHeader`、`headerRaw`、`headerComplete`、`headerRange`。存在头部时，范围为 `{start, end, startLine, endLine, truncated}`；字符偏移采用 JavaScript 字符串索引。
- `importSourceUrl`：规范化真实导入 URL，缺省 `null`。
- `requires`、`matches`、`excludeMatches`、`runAt`、`noframes`。
- `directives`、`grants`、`resources`、`diagnostics`。

单条 directive 为 `{name, originalName, value, raw, line, kind, known}`；`kind` 为 `descriptive`、`execution` 或 `unknown`。`resources` 保留 `{name, originalUrl, raw, line}`，尚不等于已实现 GM 资源 API。

单条依赖的实际形状：

```json
{
  "raw": "https://cdn.example.org/library.js#sha256=<SHA256_ASSET>",
  "originalUrl": "https://cdn.example.org/library.js#sha256=<SHA256_ASSET>",
  "url": "https://cdn.example.org/library.js",
  "sourceKind": "https",
  "sha256": "<SHA256_ASSET>",
  "integrity": [
    {
      "algorithm": "sha256",
      "digestHex": "<SHA256_ASSET>",
      "encoding": "hex",
      "raw": "sha256=<SHA256_ASSET>"
    }
  ],
  "integrityPolicy": "all-strong",
  "order": 0,
  "line": 4,
  "diagnostics": []
}
```

无哈希标准 `@require` 使用 `sha256: null`、`integrity: []`。无法安全解析地址时保留原文，`url` 与 `sourceKind` 为 `null`，并产生错误诊断。`raw` 是去掉指令名前缀、修剪首尾空白后的声明值；完整注释行仍保存在 directive 的 `raw`。

诊断包含 `{severity, code, message}`，可附 `line`、`directive`。合法但暂不支持的权限声明可以保留导入；不能因此假装可运行。准入结果为：

```json
{
  "status": "needs-review",
  "blockers": [],
  "warnings": [],
  "nativeOptions": {
    "matches": ["https://example.com/*"],
    "excludeMatches": [],
    "runAt": "document_idle",
    "allFrames": true,
    "world": "USER_SCRIPT"
  }
}
```

`status` 仅为 `unsupported`、`needs-review` 或 `executable`。即使作者已声明强哈希，存在依赖而尚未建立可信锁时仍是 `needs-review`。`dependenciesLocked` 是可信消费者在真实加载、复验锁以后传入的断言，不能直接使用 Sidebar 的布尔字段代替。

### 3.2 头部、顺序与兼容边界

只在第一个真正 JavaScript token 之前读取元数据；支持 BOM、空白及前置版权行注释/块注释。字符串、模板字符串、块注释里的示例头部不生效。畸形、未闭合或超限头部会产生阻断诊断，不能通过插入新头部把原来的不支持声明隐藏起来。

依赖按作者原始顺序保留，重复声明也保留执行。相同规范 URL 的重复请求可在同次 prepare 中复用已经取得的字节，但重复声明仍计入执行字节预算。不同 URL 的相同哈希可以共用一个 asset；每条声明仍保留各自的来源与顺序。

相同 URL 的相同强算法声明若给出冲突哈希，准入阻断。不同 URL 或不同版本的库不做未经设计的 semver 合并，也不自动替换全局变量；它们按声明顺序进入同一脚本编译单元，可能发生库自身的全局名冲突。

| 元数据 | D1 行为 |
| --- | --- |
| `@match`、`@exclude-match` | 映射到 Chrome HTTP(S) 匹配规则；支持合法端口、端口通配符和 IPv6。正式规则不接受 `<all_urls>` 或 `file://` |
| `@run-at` | 支持 `document-start/end/idle` → `document_start/end/idle`；不悄悄降级 `document-body` 等时机 |
| 缺省 `@run-at` | D1 为 `document-idle`；与 Violentmonkey 默认值的差异通过警告说明 |
| `@noframes` | 无值标记；存在时 `allFrames: false`，缺省为 `true` |
| `@grant none` | 不自动切换 MAIN；仍用 USER_SCRIPT，并显示兼容差异警告 |
| 其他 `@grant`、`@resource` | 保留导入；因未实现 GM/宿主资源语义而阻断执行 |
| `@inject-into content` | 使用内容隔离语义；`page` / `auto` 不获准 |
| `@include`、`@exclude`、`@connect`、`@sandbox`、`@unwrap`、`@top-level-await`、`@run-in`、`@webRequest`、未知执行语义 | 保留声明，运行准入失败关闭 |
| `@downloadURL`、`@updateURL` | 保留并提示未实现自动更新；不作为真实导入来源身份 |
| 已知说明型与多语言字段 | 保留；不触发网络获取或特权授权 |

不能从解析成功推断源代码中的任意 `GM_*`、`GM.*`、`unsafeWindow` 或 ESM 可用。D1 未实现这些宿主 API 或 ESM 构建器。

### 3.3 SRI 与 `all-strong` profile

D1 读取 Tampermonkey 风格 URL fragment：`algorithm=hash` 或 `algorithm-hash`，支持 Hex、规范 Base64（含无 padding 与 URL-safe 字母表），以及逗号/分号分隔。也理解空白分隔的 SRI token。`+` 不会被 URLSearchParams 转为空格，错误 padding、长度、尾位、百分号编码会阻断。

- 实际验证 SHA-256、SHA-384、SHA-512 的**每一个强声明**。
- 同算法同摘要的重复声明保留并警告；冲突摘要阻断。
- MD5/SHA-1 单独存在时不能批准。与强声明并存时保留为信息，列入 `ignoredWeak`，不声称已经验证弱算法。
- 无 SRI 声明可以进入明确下载和审核流程；实际字节始终计算 SHA-256，批准后写入固定锁。

这是明确的 D1 安全配置，不声称等价于 Tampermonkey 的算法选择策略，或 HTML SRI 的最强算法任选匹配规则。参见 [Tampermonkey SRI](https://www.tampermonkey.net/documentation.php?q=sri)、[Violentmonkey 元数据](https://violentmonkey.github.io/api/metadata-block/)、[W3C SRI](https://www.w3.org/TR/sri/)。

## 4. 声明身份与不可变摘要

`describeDependencyManifest(request)` 为纯读取/哈希 API，返回 `{parsed, manifest, entryFormat, manifestDigest}`；不访问 Host、存储或网络。管理器与 Page 合同共用这一实现。

内部依赖 manifest 的完整字段为：

```json
{
  "lockVersion": 1,
  "entryFormat": "async-main",
  "importSourceUrl": null,
  "world": "USER_SCRIPT",
  "requires": [
    {
      "order": 0,
      "raw": "https://cdn.example.org/library.js",
      "originalUrl": "https://cdn.example.org/library.js",
      "url": "https://cdn.example.org/library.js",
      "integrity": []
    }
  ]
}
```

`manifestDigest = SHA-256(UTF-8(canonical(manifest)))`。对象键递归排序，数组顺序保留；调用方应使用共享函数计算，不能自行维护第二套规范化。

该摘要故意不包含函数正文、名称或网页匹配规则。只改正文可以复用依赖锁；改入口模式、真实导入身份、依赖原始值/规范 URL/SRI 或顺序，会改变依赖身份。源码语义准入会在每次执行时重新检查，新增不支持的 `@grant` 仍会阻断，即使依赖摘要未变。

固定 Program 的 `sourceHash` 另行覆盖完整源码；Page 的 `manifestHash` 再覆盖完整程序合同。不能把这三个摘要混用。

## 5. 来源读取、审核条目与权限

### 5.1 三种实际来源

| `sourceKind` | `resolvedUrl` | 首次 `acquisition` | 来源与完整性表示 |
| --- | --- | --- | --- |
| `https` | 精确 Fetch 响应 URL | `download` | `integrityRepresentation: fetch-response-bytes`；哈希对象是 Fetch 暴露的响应体字节，不是网络压缩传输帧 |
| `packaged` | `chrome-extension://…/vendor/jquery-3.7.1.min.js` | `extension-package` | `packaged-utf8-bytes`；对固定扩展资源进行哈希校验，不宣称访问过 CDN |
| `local-file` | `local:<文件名>` | `local-import` | `original-file-bytes`；保留用户导入的原始字节及 UTF-8 BOM |

复用获准缓存时 `acquisition` 改为 `approved-cache`，`sourceKind`、原始实际来源、许可证和完整性表示继续保留，`reusedFrom` 为 `{lockId}`。缓存不是第四种原始来源。

当前内置适配器只为以下三个**规范化后无 query、无非默认 port**的 jQuery 3.7.1 URL 提供固定扩展字节（HTTPS 默认端口 443 会由 URL 标准规范化）：

- `https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js`
- `https://unpkg.com/jquery@3.7.1/dist/jquery.min.js`
- `https://code.jquery.com/jquery-3.7.1.min.js`

这属于来源适配器，不是编译器里的 jQuery 分支。其他普通 HTTPS JS 使用相同资产、review、lock 与执行源码链。本地文件绑定既有 HTTPS `@require` 声明，不引入 `file://` 或 `asset:` 声明协议；当前 UI 不提供真实脚本 URL 导入器，剪贴板源码没有相对 URL 基址。

### 5.2 每条 review/lock entry 的实际字段

| 字段 | 含义 |
| --- | --- |
| `order`、`raw`、`originalUrl`、`url` | 原始顺序、原始声明值、规范 URL |
| `name`、`version` | 从已知内置描述或 URL 推导的显示信息；`version` 可为 `null`，不是可信 npm/semver 解析结果 |
| `sourceKind`、`resolvedUrl`、`acquisition`、`reusedFrom` | 原始来源、实际读取身份与本次获取方式 |
| `sha256`、`byteLength` | 实际字节的 SHA-256 和大小 |
| `world` | 固定 `USER_SCRIPT`；共享 asset 不共享运行世界 |
| `integrity` | 原始强/弱声明的规范化数组 |
| `integrityResult` | `{verified: [...], ignoredWeak: [...]}`；没有声明时两个数组为空 |
| `integrityRepresentation` | 被哈希字节的实际获取表示 |
| `license` | `{status, name, source}`，见下文 |
| `mime` | HTTPS 的规范 MIME、内置资源的 `text/javascript`，或本地文件的 `null` |
| `risk` | 供审核展示的真实 DOM/数据访问与网络外发风险说明 |

许可证状态：内置已知库使用 `{status:'known', name:'MIT', source:'extension-package'}`；用户给本地文件声明许可证时为 `{status:'declared', name:<文本>, source:'user-provided-file'}`；未核实为 `{status:'unknown', name:null, source:null}`。不把声明或 URL 显示名冒充许可证审计。

### 5.3 下载与网页运行是不同授权

HTTPS 下载器只接受无凭据的公共主机名，拒绝 IP 字面量、localhost、本地主机后缀等；这不是 DNS pinning，实际 DNS 由浏览器处理。相对依赖先用真实 `importSourceUrl` 解析；元数据中的下载地址或当前页面不提供该身份。

下载权限使用 `https://<hostname>/*`。UI 在可信点击中请求来源权限；管理器读取前后检查 `permissions.contains`。Fetch 固定 `GET`、`credentials:'omit'`、`referrerPolicy:'no-referrer'`、`cache:'no-store'`、`redirect:'error'`。拒绝全部重定向及不相等的响应 URL，不自动申请新跳转域名权限。

允许 MIME 为 `application/javascript`、`text/javascript`、`application/x-javascript`、`application/ecmascript`、`text/ecmascript`、`text/plain`。拒绝 HTML/JSON MIME、明显 HTML 错误页、无可限长响应流、无效 UTF-8 或声明不兼容编码；`us-ascii` 响应还须全部字节为 ASCII。校验失败不产生可执行锁。

页面运行另行核对 Host、当前活动 tab/window、精确 `documentId`、网页权限及 Controller run slot。第三方 JS 可以读取或修改获准网页 DOM，也可能通过网页允许的网络渠道外发网页数据；USER_SCRIPT 隔离与 hash 校验都不是恶意代码分析或网络沙箱。

## 6. 可信命令参数与返回值

以下 payload 都必须经过 Broker 的真实 sender/Host 校验。管理器还在关键异步边界复核 `namespace`、`registrationId`、`hostDocumentId`、`hostInstanceId`、`browserSessionIncarnation`、`hostUrl`，并在事务内检查 commandJournal 中 Host 仍 active 且未 revoked。未知请求字段会被拒绝。

### 6.1 `inspectPageDependencies` → `manager.inspect`

输入：`{sourceUtf8, entryFormat?, importSourceUrl?}`。`entryFormat` 缺省为 `async-main`；新的 UI 和 Page 合同应始终明确提供。只读缓存和授权状态，不下载、不批准。

返回：`{manifestDigest, requires, locks, admission, permissionOrigins}`。

- `requires` 在 parser 结果上附加显示名、来源类型、`status`、`cacheChoices`、`downloadError`、风险和许可证。条目 `status` 为 `unsupported`、`approved-cache` 或 `needs-review`，不能作为最终执行授权。
- `cacheChoices` 来自同 namespace、同规范 URL 的已批准锁，含原 entry、`lockId` 和 `status:'approved-cache'`。
- `locks` 为当前依赖摘要下最多 20 个公开锁视图。
- `permissionOrigins` 列出可能下载且当前尚无权限的来源；是否实际申请仍取决于用户选择缓存、本地文件还是下载。

### 6.2 `preparePageDependencies` → `manager.prepare`

```json
{
  "sourceUtf8": "<原始源码>",
  "entryFormat": "classic-userscript",
  "explicitUserAction": true,
  "selections": [
    {"order": 0, "assetSha256": "<SHA256_APPROVED_CACHE>"},
    {"order": 1, "localFile": {"name": "helper.js", "bytesBase64": "<原始字节Base64>", "license": "MIT"}}
  ]
}
```

可选 `importSourceUrl`；`selections` 缺省 `[]`。每个 `order` 只能出现一次；`assetSha256` 与 `localFile` 互斥。未选择的条目使用精确内置适配器或 HTTPS 读取。缓存必须已有同身份、同声明 URL 的批准来源，不能随意指定 asset 哈希。`localFile` 只允许 `name`、`bytesBase64`、可选 `license`；文件名不带路径。

返回：`{reviewId, manifestDigest, status:'pending-review', approvalStatus:'pending', entries, totalBytes}`。此时资产已经缓存，但尚未批准。源代码不在该步骤执行，也不要求先保存 Program Revision。

### 6.3 `approvePageDependencies` → `manager.approve`

```json
{
  "reviewId": "dep-review-<UUID>",
  "explicitUserAction": true,
  "acceptedHashes": ["<SHA256_ORDER_0>", "<SHA256_ORDER_1>"]
}
```

必须明确接受 review 中全部哈希，顺序与重复次数都相同。批准前校验审核摘要、依赖 manifest 摘要、真实资产字节及声明 SRI；在原子提交内再次校验资产。重复批准同一未变审核会返回同一锁，不创建新锁。

公开锁返回字段：`{lockId, lockVersion, manifestDigest, status, approvalStatus, world, approvedAt, entries}`。它故意不返回 asset 字节，不是任意 namespace 的授权令牌。

### 6.4 内部 `manager.loadForExecution`

输入：`{sourceUtf8, entryFormat?, importSourceUrl?, lockId?}`。有依赖时必须提供正确 `dep-lock-<SHA256>`；无依赖时不提供其他锁。它不是 Broker 的独立 UI 命令，由可信预览/未来 Page 服务调用。

返回：`{lockId, manifestDigest, entries, world:'USER_SCRIPT'}`；`entries` 在锁条目上增加已复验的 `code` 字符串。无依赖时为 `{lockId:null, manifestDigest, entries:[], world:'USER_SCRIPT'}`。

该路径重新验证 Host、锁本体、namespace、当前声明、资产 SHA-256、大小、编码和全部强 SRI，完全不联网。缓存缺失/损坏时失败关闭，不能回退到“现取 CDN 最新版”。

### 6.5 `previewPageScript`

```json
{
  "sourceUtf8": "<原始源码>",
  "entryFormat": "async-main",
  "lockId": "dep-lock-<SHA256_LOCK_CORE>",
  "target": {
    "tabId": 123,
    "frameId": 0,
    "documentId": "<精确当前文档ID>",
    "expectedUrl": "https://example.com/",
    "expectedWindowId": 7
  }
}
```

可选 `importSourceUrl`；无依赖时锁可省略或为 `null`。返回固定的 `state`、`durable:false`、`registered:false`、`tabId`、`documentId`、`sourceHash`、`world`、`worldId`，以及新路径的 `entryFormat`、`lockId`、`manifestDigest`、`dependencies`、`warnings`、最长 2048 字符的 `resultText`。`dependencies` 只投影 `{order, url, sha256, sourceKind}`。

运行前检查原生 named world 隔离，并配置受限 CSP；不能把 `configureWorld` 成功或预览预算当成自动注册隔离证明。完成信封使用 `opendesk.page-preview-receipt.v1` 和本次 nonce，区分合法的 `undefined` 与缺失回执；它不是脚本安全证明或 Available 回执。

## 7. IndexedDB 记录与摘要范围

复用 `opendesk-browser` 默认 **version 2** 的 `frameworkKV`，事务同时读取 `commandJournal` 校验 Host。D1 没有新数据库、object store、index 或 v3 迁移。原始字节使用 **ArrayBuffer**，不是 `Uint8Array`、Blob 或 Base64 字符串；既有 raw backup 编码已经支持 ArrayBuffer。当前工作没有另建迁移、恢复或回滚协议。

所有 key 由 `DEPENDENCY_STORAGE_KEYS` 生成；其中 JSON 元组采用 `JSON.stringify`：

| 对象 | key 模板 | 记录字段 |
| --- | --- | --- |
| asset | `userscript-asset:v1:sha256:<hash>` | `tag, sha256, bytes, byteLength, integrityStatus, createdAt` |
| review | `userscript-review:v1:<[namespace,reviewId]>` | `tag, reviewId, namespace, status, approvalStatus, manifest, manifestDigest, entries, totalBytes, createdAt, reviewDigest`；批准后加 `lockId` |
| lock | `userscript-lock:v1:<[namespace,lockId]>` | `tag, lockVersion, namespace, manifestDigest, manifest, world, reviewId, approvedAt, entries, lockId, status, approvalStatus` |
| source index | `userscript-source:v1:<[namespace,url]>` | `tag:'userscript-source-index-v1', namespace, url, choices:[{lockId,order,sha256}]` |
| manifest index | `userscript-manifest:v1:<[namespace,manifestDigest]>` | `tag:'userscript-manifest-index-v1', namespace, manifestDigest, lockIds` |
| reference | `userscript-reference:v1:<[namespace,ownerType,ownerId]>` | `tag:'userscript-reference-v1', namespace, ownerType, ownerId, assetHashes` |

`asset.bytes` 不能直接表示成普通 JSON；上述表是存储形状说明，不能把一个字符串占位写入数据库。资产已有哈希时复验原字节而不覆盖。`createdAt`、`approvedAt` 为非负安全整数毫秒时间戳。

`reviewDigest` 仅覆盖 `{reviewId, namespace, manifest, manifestDigest, entries, totalBytes, createdAt}`。review 从 pending 改为 reviewed 时不会伪造或重算原审核内容。

`lockId = 'dep-lock-' + SHA-256(canonical(lockCore))`，`lockCore` 精确为 `{lockVersion, namespace, manifestDigest, manifest, world, reviewId, approvedAt, entries}`。同 URL 下载到新字节或重新审核另一组资源，会形成新锁；旧锁和字节引用不被修改。

source index 对每个哈希保留可追溯的批准来源，manifest index 保留锁列表。它们是检索索引，执行时仍验证真实 lock 和 asset，不能凭索引字段获得执行权限。

当前只写入 `ownerType: review` 和 `ownerType: lock` 引用；**尚未实现依赖 GC、review 清理、全局容量回收或安装/历史引用遍历**。删除编辑草稿不会删除这些 asset。未来 GC 必须追加追踪真实 Program Revision、安装版本和历史运行，再进行独立验证，不能沿用“删除草稿就删字节”。

## 8. Page 与 Controller 的入口分型

| 模型 | 判别与入口 | 执行行为 |
| --- | --- | --- |
| 标准页面用户脚本 | `runtimeKind: page-userscript`，`entryFormat: classic-userscript` | 保留顶层 JS、全局 `var` 和 IIFE；不要求 main，不加函数壳或主动 strict 指令 |
| OpenDesk 页面开发 | `runtimeKind: page-userscript`，`entryFormat: async-main` | 作者通常定义 `async function main()`；编译器在独立 async 入口中检查 main 为函数并等待其返回 |
| Controller Task v1 | 原 `opendesk.task.v1` 合同，既有 `entryFormat: async-main` | 继续使用 Controller Worker、RunHost、ChromePage、page、params 和既有宿主授权；不接收 @require 资产执行 |
| R3 旧页面描述 | 显式 `prepareLegacyPageProgramRegistration`，旧 `async-main-v1` / 固定 jQuery 形状 | 仅兼容旧测试和迁移入口；不能自动解释为新 Page 或 Controller 合同 |

`classic-userscript` 和依赖通过同一编译单元保持同步依赖异常失败停止。该选择会让首个依赖的顶层 strict 指令或全局 lexical 声明影响其他源码，D1 会发出 `W_SHARED_COMPILATION_UNIT`；不宣称完全等价于所有脚本管理器的包装方式。

classic 预览只确认顶层同步代码完成；不等待异步 IIFE、事件监听器和定时器，也不会在预览返回时停止它们。async-main 返回也不会自动撤销已写入 DOM 或已经注册的监听器。ESM 的构建、静态依赖图和模块转换未实现，远程动态 import 不是默认依赖路径。

## 9. 新 Page Program 合同与可信注册描述

完整的新 manifest：

```json
{
  "format": "opendesk.page-program.v1",
  "runtimeKind": "page-userscript",
  "programId": "example-page",
  "revision": 1,
  "sourceHash": "<SHA256_COMPLETE_SOURCE>",
  "entryFormat": "classic-userscript",
  "sourceProfile": {"metadataProfile": "opendesk-d1", "importSourceUrl": null},
  "dependencyLockId": "dep-lock-<SHA256_LOCK_CORE>",
  "dependencyManifestDigest": "<SHA256_DEPENDENCY_MANIFEST>",
  "pageRules": {
    "matches": ["https://example.com/*"],
    "excludeMatches": [],
    "runAt": "document_idle",
    "allFrames": false,
    "world": "USER_SCRIPT"
  }
}
```

`programId` 为 1–128 个合法 ASCII ID 字符，首字符为字母或数字；`revision` 为正安全整数。新 manifest、`sourceProfile`、`pageRules` 均为闭合字段集合。无依赖时 `dependencyLockId` 为 `null`，仍有对应的依赖 manifest 摘要。

若源码声明了 `@match`，冻结规则必须与其一致；源码有元数据时，excludeMatches、runAt、allFrames 必须符合声明及 D1 默认 profile。无头部普通 JS 可以通过显式 Page 设置给规则。`allFrames:false` 的上述示例因此应配套 `@noframes`，或者使用无头部源码加显式 Page 设置，不能静默缩改一份已有头部的默认 frame 语义。

合同导出 `validatePageProgramManifest`、`validatePageProgramRules`、`hashPageProgramManifest`、`createPageProgramManifest`、`verifyPageProgramSource`。`createPageProgramManifest` 接收源码、programId/revision、明确入口、可选真实 importSourceUrl、真实 `loadForExecution()` 结果及可选 pageRules；返回固定合同对象。它不是保存或安装命令。

`preparePageProgramRegistration` 输入为 `{candidate, sourceUtf8, authority, dependencyResolution}`；candidate 的身份部分为 `{candidateId, namespace, manifestHash, manifest}`。`dependencyResolution` 必须来自可信管理器，不能由 Sidebar 拼出一组 entries。

`authority.assertAvailable(candidateId)` 的可信回执必须同时给出并匹配：

- `candidateId`、`namespace`、完整 `manifestHash`；
- `status:'Available'`、`installationEnabled:true`；
- `runtimeKind:'page-userscript'`、`entryFormat`；
- `programId`、`revision`、`sourceHash`；
- `dependencyLockId`、`dependencyManifestDigest`；
- 完整 `approvedPageRules`，包括 matches、excludeMatches、runAt、allFrames、world。

仅 `approvedMatches`、候选对象上的状态字符串或 UI 布尔值都不够。编译器复验完整 manifest 哈希、源码 hash、依赖声明摘要、锁身份、顺序、来源、每条 code 的 SHA-256，然后调用与预览相同的 `compileLockedPageSource`。

输出只有 Chrome 注册描述 `{id, matches, excludeMatches, runAt, allFrames, world, worldId, js}`。ID 为 `opendesk-page-d1-` 加上 `SHA-256(canonical({namespace,candidateId,manifestHash}))` 的前 48 个十六进制字符；worldId 与 ID 相同。这为未来对账提供稳定身份，**不构成已经执行 register、update、unregister 或防重复运行的原生证据**。

## 10. 已实现限额、错误与未完成边界

| 限额 | 当前数值 / 行为 |
| --- | --- |
| 元数据头部 | 64 KiB，无旧的 64 行限制 |
| 依赖条数 | 64；保留顺序与重复 |
| match / exclude-match | 各最多 128；Page 合同单条规则最多 4096 字符 |
| parser 的单条 @require | 原值最多 8192 字符；下载器规范 URL 最多 4096 字符 |
| 新页面源码 | 128 KiB；过渡 withJquery 预览路径仍有自己的 32 KiB 限额 |
| 单个依赖 / 整组依赖 | 1 MiB / 4 MiB；重复声明仍计入整组预算 |
| 单次 HTTPS 读取 | 20 秒；流式大小检查 |
| 本地文件名 / 声明许可证 | 各最多 128 字符；文件名不可带路径 |
| inspect 返回历史锁 | 当前摘要下最多 20 个公开锁视图 |

主要失败分类：元数据/语义 `E_METADATA_*`、`E_GRANT_UNSUPPORTED`、`E_RESOURCE_UNSUPPORTED`、`E_RUN_AT_UNSUPPORTED`；来源与下载 `E_DEPENDENCY_URL/BASE_URL/PERMISSION/REDIRECT/FETCH/TIMEOUT/CONTENT_TYPE/ENCODING/LIMIT`；审核与锁 `E_DEPENDENCY_REVIEW/UNLOCKED/LOCK/LOCK_STALE/ASSET/HASH/INTEGRITY`；页面身份与回执 `E_OWNER`、`E_DOCUMENT_STALE`、`E_WORLD_ISOLATION`、`E_USER_SCRIPTS_UNAVAILABLE`、`E_PAGE_SCRIPT_EXECUTION`。错误代码应按实际失败展示，不能统一吞成“库不可用”。

本轮尚未实现：正式 Page Program 的持久 Revision/Candidate/Verification/Available 服务、Page 安装与启停、扩展启动/更新/授权变化后的注册对账、正式运行历史引用、依赖 GC、npm/Git/ESM 适配器、自动更新、MAIN 风险批准、GM/resource API。

尤其是未来文档自动注册的 named-world 数量限制及可能回落到默认世界的问题，不能用当前文档预览探针替代证明。正式 Page 服务须在后续先解决该隔离准入和调度条件，再接 register 生命周期并做真实 Chrome 验证。已有 Controller Task 生命周期继续使用原合同；不能借用其 Available 或测试回执宣布 Page 安装完成。

本合同的组件测试、build、原生和最终框架验收必须分别报告；本文中的 JSON、稳定 ID 公式和源码实现均不能代替真实验收记录。
