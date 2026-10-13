# Browser SDK R9 · 源码实施与四层证据（2026-10-13）

> 这是当前工作流的**追加实施进度**，不是第二份接口设计手册。正式设计与逐接口准入以 `docs/api/browser-sdk-execution-manual.zh-CN.md` 和 `browser-sdk-interface-matrix.json` 为准；唯一运行时注册表仍为 `src/framework/sdk/browser-contract.js`。

## 当前可以核对的完成项

| 能力 | 真实源码 | Node / CI | 生产 Build | Mac Chrome 原生 |
| --- | --- | --- | --- | --- |
| 完整目录 191 个 pinned Schema / 1830 条 interface 行的**结构与审批映射** | 已新增 `scripts/check-browser-sdk-interface-matrix.mjs` + 安全负向测试；原始上游 bytes 尚未重新抓取/解析 | GitHub Actions 排队中，未领取当前候选 PASS | NOT_TESTED（该次候选） | NOT_TESTED |
| SDK 正式 Registry | 29 项在唯一 Registry/Schema；冻结批准合同 55 = 29 个已注册 + 11 个可信 Cookie + 15 个待实施 | 尚未有当前候选绑定的全套 PASS | NOT_TESTED | NOT_TESTED |
| Cookie Trusted Host 11 项 | 已有读写、精准删除、监听生命周期；新增 onChanged 的同 URL Path / HostOnly / StoreId / PartitionKey 过滤与脱敏测试 | 定向 Node 尚未获得本候选成功回执 | NOT_TESTED | NOT_TESTED |
| Tabs 同源导航、固定、重载、创建、激活、自有查询与删除 | 已有 SDK → installed tool → trusted Host → Chrome Driver；增加 TabRef 首个真实 documentId 固定及同 URL Document 替换撤销 | 定向 Node 尚未获得本候选成功回执 | NOT_TESTED | NOT_TESTED |
| Downloads / Clipboard 旧 UI alias 收敛 | **未完成**；SDK wrapper 的 `clipboard.writeText` 与 `file.download` 旧转发仍存在，不应视作 P1 关闭 | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| 自有 DownloadRef、Bookmarks、History、Permissions、Storage、Scheduler 批准新增项 | **未全部实现**。不得把矩阵的 DESIGN_APPROVED 当作已调用。 | NOT_TESTED | NOT_TESTED | NOT_TESTED |

## 本轮可追溯源码提交（main）

- `a0e81f91fe8a349b0abe2066a82be6feb12cd004`：修订单一冻结矩阵，批准同源 `tabs.navigateOwned`，修正 Chrome sidePanel 版本分类，并引入离线目录一致性/安全拒绝检查与 CI 门槛。
- `b50751f649f7752ad97b338b6465f7ba5254b82b`、`b467ec09c41891835814e7e6204daed1894c0d4b`：Cookie onChanged 事件严格匹配 URL Path、HostOnly、Store/Partition，新增元数据不泄漏负向测试。
- `6dc27bf45485f65cf97ebdc916796946ca1542f1`、`eadd2bdc845d2b3f2cef3a9d2325ecd8a0b1030b`：TabRef 首次有效 Document ID 固定，`activateOwned` Native 聚焦前后再次核验；同 URL 页面替换时不再复用旧 Ref。
- `148ccc61dc0acd6d3c29c28dceeab887a76f2f6c`、`9bdff12c5f02aa0a53d7fdb8e50b11446ce14b21`：将上述 Cookie/TabRef 安全细节加入唯一执行手册，未新增第二 Host 或权限数据库。

## 原生与构建限制

此执行环境不能访问用户的 `/Users/shopme/Documents/workspace/opendesk-browser` 工作目录，不得声称已检查 Mac 本地未提交差异。GitHub `main` 由其他任务持续写入，本工作流使用现存文件 blob SHA 条件提交、无分支、无 worktree、无强推。

GitHub Actions 当前任务在排队时不能记为 PASS。上一历史候选的 `tool-shell.js` 生产 IIFE 535,147 字节超过项目固定 524,288 字节硬门槛，只能视为历史构建阻塞；新候选必须重新测量，不允许提高预算、假装构建合格或删除安全测试。

**下一未完成的业务任务：** P1 清理 `browser.clipboard.writeText → clipboard.writeText` 及 `browser.downloads.text → file.download` 的宿主旁路，按冻结矩阵通过同一个可信 Host/受信 UI 做真实授权；同步全部消费者/测试后，再实现 P3 `downloads.download/getOwned/listOwned/cancelOwned` 的真实 opaque DownloadRef 与最终 Chrome 状态。对每个功能独立核对原生 sender/document/权限、unknown effect、worker restart；无 Chrome 实测一律 NOT_TESTED。

不得沿用旧 35 项兼容分母、不得把 55 项设计批准称作已完成，也不能以旧成功 CI 抵扣新功能回归。
