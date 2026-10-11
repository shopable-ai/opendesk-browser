# Side Panel 工具市场兼容合同（R4.1）

状态：R4.5 历史阶段交付了本地 JSON 导入、五个随扩展发行的可选官方工具及离线市场；R4.8 在不改变原安装数据库的前提下，为新安装用户启用两项默认预装。统一 [官方 Catalog](../api/official-tools-catalog.zh-CN.md) 提供固定身份和原始字节验证，所有入口仍进入原安装器。公网安装桥、远程签名/公钥颁发、后台下载/升级及分发撤销尚未实现。

## 已经交付的统一安装通道

- 三种来源（本地文件、扩展内置、未来市场）最终应统一进入 opendesk.sidebar-tool.v1：format、id、version、title、description、capabilities、html、css、js，不改变已有 v1 兼容性。
- 本地文件、官方候选与离线市场复用 validateSidebarToolPackage、installation.js 的 installReviewedSidebarTool、用户审核、原安装存储、打开与卸载通道。官方入口提交前复验同一固定资源。
- 安装只保存受审查的 HTML/CSS/JS 沙箱 UI 和能力声明，不自动打开或执行。TOC 所需 page.toc 是扩展发行包预置的受控宿主服务，用户另行逐网站授权。任意导入包 JS 不能作为网页 Content Script 执行。
- 新增能力必须明确审核；本地导入的回退版本和同版本内容变化沿用风险确认，官方入口直接拒绝降级和同版本不同内容替换。关闭侧栏不影响已授权网站的可信网页卡片；撤权/卸载会释放相应能力。
- 用户提供的标题文本均以 textContent 呈现；工具 JS 始终位于 opaque sandbox，不能获得任意 DOM、Chrome APIs、eval 或主页面执行权限。

## 预留的远程签名市场来源合同（没有服务端实现）

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

离线包原始字节 SHA-256 已由 R4.5 实施；后续 P1 的远程签名验真、更新原子回滚、publisher 信誉、撤销序列和离线失效政策应各有独立测试与证据，不因 R4.1 的源接口预留而宣告交付。


## R4.8 首次安装默认预装（已新增源码，待独立原生验收）

R4.5 当时五项全为 `optional` 的表述仅对应历史包；本轮可信 Catalog 把阅读目录（`reading-toc`）与网页笔记（`quick-notes`）设为 `preinstalled`，其余三项继续需要用户审阅安装。发行时验证来源、固定路径、版本、能力、字节长度及 SHA-256，不由网页/第三方声明。

后台 `reason=install` 只登记可信初始化意图；受信后台固定资源在首次安装时执行原安装流程，Side Panel 只负责中断恢复。一次性标记使用 `opendesk.sidebar-tools.bootstrap.v1`，权威安装记录仍为 `opendesk.sidebar-tools.installed.v1`；首次部分失败可以使用固定计划恢复。升级和重开面板不补装，卸载撤销代际在恢复前优先核对。未知写入结果需人工恢复，不会盲目二次安装，且默认初始化不授予网站权限、运行工具代码或自动打开沙箱。

Side Panel 的「我的工具」是已安装工作区；「发现工具」默认只显示未安装候选，可搜索/切换全部，已安装版本只提供打开或管理，新版本标记回到已安装行。完整市场保留原套装、批量、版本、权限及恢复逻辑。工具全局启停尚无跨入口可信强制拦截，本轮不提供伪开关；网站显隐与网站授权是独立规则。

测试、已验证边界与尚未完成验收见 [R4.8 工作流](../framework/workstreams/sidebar-tools-default-preinstall-discovery-r48-20261011.md)。
