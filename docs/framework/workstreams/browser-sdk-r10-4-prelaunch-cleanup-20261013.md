# Browser SDK R10.4 · 预发布接口清理（2026-10-13）

执行来源：GitHub `main` 基线 `3c9a2de501926538827300617e363b9ce13adac4`。本环境无法查看 Mac 工作区 `git status`、未提交文件或真实 Chrome，不据此宣称原生通过。

## 本批已核查与变更
- Registry 48 项、矩阵批准 55 项，仍未注册 7 项；历史 35 项按旧名称为 KEEP 23 / RENAME 3 / DELETE 9。
- 修正 `tabs.create` 不必要的 Chrome `tabs` 权限；保留 OpenDesk 工具 capability、用户意图、Origin、TabRef。
- 将 `activateOwned`、`network.observe.start`、`screenshot.captureVisible` 的矩阵权限数组同步现有 Registry（没有扩大授权）。
- 将 48 个验收账本 Schema 引用改为现行 `browser-schemas.js`，消除 Tabs 三个废弃名称。
- 在既有一致性检查中增加运行时与矩阵的权限/Capability 对齐及旧 Schema 引用拒绝，增加负向测试。
- 修订唯一手册中过期的 Clipboard / Downloads 旧别名待迁移描述，记录 Cookie `get` 与 Chrome 的刻意安全差异。

## 验收
- SOURCE 静态交叉核对：PASS（GitHub 事务内，注册表/矩阵/账本一致）。
- Node / Build / Mac Chrome Native：NOT_TESTED，本环境无完整本地工作树/真实 Chrome；须按本批最终 commit SHA 复查独立 CI。
- 全部历史接口消费者审计：未完成，不能将本批算作 R10.4 全面关闭。
