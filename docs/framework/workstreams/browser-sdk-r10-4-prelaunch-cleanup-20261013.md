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

## R10.4 本轮第二批：原生 Download ID 公开泄露闭环
- 已确认实际 `browser.network.observe.export` Driver 将 `chrome.downloads.download()` 原生数字 `downloadId` 直接传回 installed-tool Browser SDK；不是仅 Schema 标注错误，属于安全公开合同缺口。
- 仅在可信 Driver 内校验非负原生下载 ID，不再将该 ID 穿过 Host 返回到不可信工具。保留 Chrome 原生下载执行一次、无盲目重放、原有授权和真实用户意图。
- `browser.screenshot.captureVisible` Driver 已不返回原生下载 ID，本批从其 Schema、批准矩阵删除不真实的公开字段。
- 原有 Node Driver/R2 Host/watch 测试迁移为禁止公开 `downloadId` 的负向断言，并保留原生调用次数、文件数据和其他原有保护检查。
- 修正当前执行手册计数为 Registry 48、批准 55、未注册 7，R10.1 旧 44 标为历史时点。
- 验证级别：源码与预期消费者静态交叉检查；Node/Build/Native 需按本批相同候选 SHA 取得真实 CI/Chrome 结果，本记录不将静态核查写成运行测试 PASS。
