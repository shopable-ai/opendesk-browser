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

## R10.5 · 真实回执与 CI 证据（2026-10-13）

- `44f715a64f832ea2b6d3498e280a369bab8d222e`：修正 Network 虚假的 ResourceRef 与 Screenshot 原生 downloadId 公开泄露；使用单一既有 Host、临时内存资源、一次性下载请求和真正 `status:'started'` 回执。受信 Host 在 Network 原生执行后重新验证 Origin 与工具身份；撤权和未知 Chrome 副作用不重试。
- 更新 Network/Screenshot/R2 Host/Schema 回归断言：Chrome `tabs.create` 无需原生 `tabs` permission，失效 TabRef 或被撤销 Origin 可以在真实用户确认环节提前拒绝；不降低安全约束。
- 真实既有 CI：`97df746b` 的 Browser SDK R5 implementation contracts 为 101 PASS / 4 FAIL，构建因 Time Review 入口 provenance 禁止进入特权 bundle 而失败；两批 R10.4 提交的其他 CI 存在 FAILURE。新候选的 NODE/BUILD/NATIVE 状态必须依据新运行单独确认，不能将该源修复自动提升为 PASS。
