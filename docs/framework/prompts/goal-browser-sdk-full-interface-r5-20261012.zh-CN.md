# GOAL：OpenDesk Browser SDK 全接口目录冻结与实现优先 R5

## 最优先用户需求：Cookie Editor 真正读取/编辑/删除浏览器 Cookie；同时确保 Tabs、Side Panel、HTTP Request、存储、权限等接口形成真实 SDK → Host → Chrome 调用闭环。

### 一、执行仓库与规则

仓库：https://github.com/shopable-ai/opendesk-browser
Mac 本地：`/Users/shopme/Documents/workspace/opendesk-browser`
唯一允许写入：`main`。遵守 AGENTS.md；不创建其他分支、worktree、PR，不强推、reset、clean，不覆盖并行 Agent 未提交修改。安全时直接修改/测试/提交/推送 main。

### 二、必须先读取的长期合同

- `docs/api/browser-sdk-full-interface-inventory.zh-CN.md`（本轮增加；是候选目录，不是权限来源）
- `docs/api/browser-capability-universe.zh-CN.md`（原 18 领域 / 74 能力叶子）
- `docs/api/browser-sdk.zh-CN.md`（已经批准的 SDK）
- `src/framework/sdk/browser-contract.js`（唯一运行时权威 API 注册表）
- `src/framework/sdk/browser-schemas.js`、`src/framework/sdk/browser.js`
- `docs/framework/workstreams/browser-sdk-status.md` 与 `browser-sdk-acceptance.json`
- `src/platform/chrome/cookies.js`；`examples/sidebar-tools/cookie-editor/README.zh-CN.md`
- `docs/framework/testing-guide.md` 与 `AGENTS.md`

### 三、不要再把 32 项当作全部 Chrome 能力

原 32 是已登记操作，不是全 Browser SDK。先核对候选目录中的所有功能簇：Cookie、Tabs/Windows/Groups、Storage、Bookmarks、History、Downloads、BrowsingData、Permissions、WebNavigation、Scripting、DNR、Network Observe、Clipboard、Resources、Scheduler、Side Panel、Recording、Notifications、ReadingList、诊断等。

先生成产品可读的**领域 → 需求 → 已有 Host → SDK 公开程度 → 许可环境 → 参数合同 → 状态 → 测试**矩阵。复用仓库现有代码而非重写，缺失候选不应直接入 `BROWSER_OPERATIONS`，也不应替换现有 32 项分母。建议每个功能域包含 5–20 行用例，明确支持与拒绝边界。

### 四、按优先级实施：先真实逻辑，再 UI 和验收

**P0-A：Cookie Editor 真实功能**

1. 复用内置 Cookie Editor UI 的 JSON/Header/Netscape 导入导出和本地模拟工作区。
2. 复用 `src/platform/chrome/cookies.js`，补缺少的精确 Cookie 身份：domain/path/storeId/partitionKey、getPartitionKey 和 onChanged 等。
3. 先在可信扩展内置 UI/Host 下完成 `cookies.get/getAll/set/remove/clearSite`；默认不把 HttpOnly 会话 Cookie 明文提供给第三方 sandbox。开放能力前必须独立安全审查。
4. Chrome 真实权限与当前选站双重校验，只有显式用户操作可导入/导出/清空；密码/Token 不进日志、草稿、远端。
5. 修改、删除、分区、重名不同路径、前缀、撤权、导航/刷新、工具停用、批量失败和 Chrome restart 都要测试。

**P0-B：核心已登记接口闭环**

完成 R1.3 既有十项、`browser.tabs.open/focus`、`browser.sidePanel.openSelf`、`browser.network.request` 的公开 SDK → 安装包 capability → 可信 Host → Chrome 真实执行 → 正确响应。不得只增加独立驱动或 Schema 来标记 IMPLEMENTED。

**P1：高价值应用能力**

按需求审批书签搜索/写入、浏览历史查询、受控下载管理、Owned tabs/windows/groups、Network Observe、Screenshot、Permissions 查询/明确站点授权、资源读取/释放、声明式拦截规则，优先实现已有消费者（Cookie Editor、AdBlock、定时工具）实际需要的功能。

**P2：可选与受限能力**

Media Recording、Reading List、剪贴板读取、浏览数据删除、浏览器会话、Commands、Omnibox、性能诊断。危险的 debugger/proxy/management/Native arbitrary shell、语音控制按 AGENTS 明确排除或 Host-only，不为数字开放。

### 五、正式 API 合同必须稳定

每个批准的方法确定：命名与版本、参数/返回 Schema、最大字节、错误码、必要 capability、Chrome 权限、Origin、tab/document/owner/epoch、用户手势、后台可行性、运行环境、Chrome 最低版本、并发/TTL/撤权/Worker 冷启动语义。

现有 `browser-contract.js` 仍是唯一运行时操作事实来源；目录只保留未批准候选的设计状态，不建立新 Registry。`browser-sdk-acceptance.json` 必须实时从真实源码和原始测试证据更新，禁止人工将未通过的项写成 PASS。

### 六、可复查的实施与验收

每一簇实现后：实际安装工具 → 复用 SDK → 真实 Host 调用 → 正向/拒绝/撤权与异常测试 → 运行必要 Node/Build/Verify → 有条件的 Mac Chrome 原生测试 → 记录当前 SHA、Package Hash、Chrome 版本、原始日志与截图 → 安全提交 main。不要因本地无法打开 Chrome 就谎报原生 PASS。功能与证据未齐仍标 NOT_TESTED。

最上方进度必须分开显示：①现有批准范围 32 项；②候选总数和逐个批准与否；③真正可调用数量；④真实 Chrome 当前候选 PASS；⑤仍属于内置-only/Controller-only/不开放的能力。

### 七、交付结果

实际 Git 提交、文档链接、完整领域矩阵、逐项接口状态、缺口和原因、Cookie Editor 真实读写演示、剩余核心工作闭环清单、Node/CI/Chrome 证据。**第一阶段不要只做列表：列表核查后立即进入 P0-A Cookie 实际读写和 P0-B SDK/Host 接线。**
