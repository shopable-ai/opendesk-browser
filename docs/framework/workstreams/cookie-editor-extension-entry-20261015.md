# Cookie Editor · 扩展统一入口与可信预装修复

日期：2026-10-15。写入分支：main。范围负责人：本次 Cookie Editor 入口修复工作流。

## 基线与问题

- 起点提交：`586fd3d7ab29c4d154c6d97b2ed0b3cdc90d1671`。当前正式侧栏以「扩展」替代旧「工具」，业务源码位于 `examples/sidebar-tools/cookie-editor/`，工具版本维持 `2.0.6`。
- `official-tools/catalog.json` 留 Cookie Editor 为 `optional`；统一列表的 `smart` 默认过滤器隐藏未安装候选；未安装行跳转应用市场，已安装且有更新时主操作跳转更新。
- 正式工具包、Browser SDK、安装/启用/撤销/权限 Host 及用户 Cookie 数据均不迁移不重建。

## 本次修复

1. Cookie Editor 官方策略改为 `preinstalled`，只在首次安装且不存在历史 Profile 记录时复用可信 `runtime.onInstalled` 预装。已有 Profile、升级、重启、主动卸载后的保护不变。
2. 「扩展」默认展示已安装应用与可信未安装的预装候选，其他可选应用仍经搜索或筛选。未安装项复用 `sidebarTools.openOfficialReview → reviewOfficial → loadOfficialTool → verifyReviewedOfficialTool → installReviewedSidebarTool`；原市场只在宿主官方目录未就绪时作为后备，不新增 Registry 或 Host。
3. 已安装应用主操作始终「打开」，新版本在详情显示「审阅新版」。停用应用先去设置。
4. 预装不运行 iframe、不读取/修改 Cookie、不授权任何站点；动态 UI 仍运行在 opaque-origin iframe，Cookie SDK Host 仍检查来源、安装包、版本、Epoch 与网站逐项授权。
5. 同步更新 Catalog/Extension Center Node 测试、Cookie CI 发行策略及现有 Chrome 驱动的 fresh-profile 预装断言。

## 验收与风险

- SOURCE_WIRED：单一官方 catalog 控制首次安装计划和默认展示。已安装工具的执行仍走既有 host。
- NODE / BUILD / CI：提交后以该 SHA 的 GitHub Actions 原始结果判定；尚未收到结果前 `PENDING_CI`。
- MAC_CHROME_NATIVE：`NOT_TESTED`。必须使用用户 Mac 原有 `dist/development` 和现有 watcher（不可覆盖共享环境），之后以隔离 CFT/Profile 验证新用户预装但零 Cookie 授权/零自动运行、旧 Profile 不强制补装且可审阅安装、已安装即打开、升级仍可打开旧版、停用/卸载/授权撤销。
- 不用 Node、CI 启动状态或旧候选截图冒充当前 Chrome PASS；独立 95+ 评分须有绑定本次候选的产品证据。

## 修改范围

`official-tools/catalog.json`、`src/ui/extension-center-model.js`、`src/ui/extension-center.js`、`src/ui/sidebar-tools.js`、Cookie Editor README、现行 UI 规格、相关环境与原生测试及 Cookie CI 配置。不修改其他 Agent 的共享构建目录、历史原生证据和用户本地 Cookie 数据。
