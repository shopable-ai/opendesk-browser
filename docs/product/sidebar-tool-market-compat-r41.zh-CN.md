# Side Panel 工具市场兼容合同（R4.1）

状态：本地 JSON 导入与扩展内置官方 TOC 来源已实现。在线市场、签名/公钥颁发、后台下载/升级及分发撤销均未实现，不得宣称已上线。

## 已经交付的统一安装通道

- 三种来源（本地文件、扩展内置、未来市场）最终应统一进入 opendesk.sidebar-tool.v1：format、id、version、title、description、capabilities、html、css、js，不改变已有 v1 兼容性。
- 本地文件和内置官方入口已经使用同一个 validateSidebarToolPackage、reviewCandidate、用户确认、存储、打开和卸载通道；本地不是另一套引擎。
- 安装只保存受审查的 HTML/CSS/JS 沙箱 UI 和能力声明，不自动打开或执行。TOC 所需 page.toc 是扩展发行包预置的受控宿主服务，用户另行逐网站授权。任意导入包 JS 不能作为网页 Content Script 执行。
- 安装/升级的新增能力、回退版本和同版本内容变化均重新提醒。关闭侧栏不影响已授权网站的可信网页卡片；撤权/卸载会释放相应能力。
- 用户提供的标题文本均以 textContent 呈现；工具 JS 始终位于 opaque sandbox，不能获得任意 DOM、Chrome APIs、eval 或主页面执行权限。

## 预留的未来市场来源合同（没有服务端实现）

未来“市场”仅负责给出可信的来源描述符和同格式 v1 JSON 包，本身不提供另外一种执行权限或引擎。建议独立于包内容的 provenance 描述符字段：

schemaVersion: 1
kind: market
toolId / version / publisherId
artifactSha256: 64 hex
signatureAlgorithm: ed25519
signature: base64
keyId: audited trust root identifier
publishedAt: RFC3339
revocationSequence: monotonically increasing integer
minHostVersion: semantic version

未来处理接口约定：

1. ToolSourceResolver.resolve(source)：受控下载或读取包原始字节，返回来源与固定字节，不执行。
2. ToolSourceVerifier.verify(rawBytes, descriptor, trustStore)：对原始字节计算 SHA-256、验证签名/受信发行者/密钥轮换/吊销列表；失败即拒绝，不降级为不可信市场包。
3. ToolInstaller.reviewAndInstall(packageV1, verifiedSource)：经由当前 validateSidebarToolPackage 与 reviewCandidate 审核、用户确认能力、站点与版本差异，保存不可变安装身份和来源审计记录。
4. ToolRevocation.reconcile()：处理上游撤销、权限收回和失败回滚，关闭对应沙箱，撤销网站权限并清除可信网页卡片。

这四个接口名称属于 P1 的目标合同，本轮尚未实现；目前没有可用的市场签名验真、强制撤销分发或静默更新。

## 禁止跨越的边界

网络包不能直接以 content script、用户脚本或未审核的扩展模块执行；远端网页不得静默安装或更新；能力扩权必须来自新版本受信宿主并由用户审阅；已安装工具同一版本发生内容变化必须告知；来源验证无法确认时禁止降级绕过。市场服务器不提供读取/写入用户网页权限，其结果只能进入既有 v1 安装器。

后续 P1 的签名验真、来源哈希、更新原子回滚、publisher 信誉、撤销序列和离线失效政策应各有独立测试与证据，不因 R4.1 的源接口预留而宣告交付。
