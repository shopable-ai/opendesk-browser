# Side Panel 工具市场兼容合同（R4.1）

状态（R4.5）：本地 JSON 导入、五个随扩展发行但默认未安装的官方工具，以及扩展内离线市场已实现。统一 [官方 Catalog](../api/official-tools-catalog.zh-CN.md) 提供固定身份和原始字节验证，所有入口仍进入原安装器。公网安装桥、远程签名/公钥颁发、后台下载/升级及分发撤销尚未实现。

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


## 未来默认系统功能：设计合同，尚未实施

当前五个工具均为 `optional`，本轮不将 TOC 或其他工具改成默认安装。未来如新增系统功能，应先区分可信宿主核心能力与普通可安装包，提供清楚的功能身份、管理入口和卸载含义。不能把“文件存在”当作“已安装”，也不能伪装成普通第三方 JSON，让用户误以为删除资源文件就完成系统功能卸载。

如确需默认初始化，必须使用可信、持久的一次性迁移标记和幂等提交：成功完成最多一次；失败可安全恢复，不能重复安装。用户停用或卸载的选择必须持久保留并优先于默认策略，扩展升级、Chrome 重启和重开 Side Panel 都不能覆盖它。

默认安装不授予全部网站访问权。系统内部能力仍受 Chrome 权限、逐网站授权、真实 sender/document、撤权及运行会话合同约束。本轮只明确此边界，不新增第二套安装器或数据库；实际默认初始化须另行审阅和验证。
