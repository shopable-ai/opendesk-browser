# Stay Focus R4.6 · 公共 MV3 执行职责收敛

- 日期：2026-10-19；仓库：`shopable-ai/opendesk-browser`；唯一写入分支：`main`。
- 写入范围：`src/platform/chrome/browser-managed-site-policy.js`、`examples/sidebar-tools/stay-focus/trusted/service.js`、`tests/environment/browser-managed-site-policy-r44.test.mjs`、本记录；不接触 AdBlock、扩展市场和他人工具文件。
- 原有缺口：DNR 原生回读、Alarm 生命周期、已打开标签页补救跳转由 Stay Focus 服务自行串联；其他受管站点应用难以复用同一执行事务。
- 本次方案：沿用唯一预编译 MV3 Worker、已有 Authority/Installer/Storage/SDK，将原生规则与 Alarm 顺序收敛到公共 `reconcileManagedSiteExecution`，固定扩展内部跳转交给 `redirectManagedBlockedTabs`。Stay Focus 保持身份、状态模型、用户操作、规则解释及唯一 DNR 区段。
- 安全边界：只接受已编译可信适配器；动态安装包只能提供合法 `site-budget.v2` 规则数据，不能更新特权后台 JavaScript；需要新算法仍必须升级宿主。DNR 必须原生回读，失败不得宣称成功；同宿主不同应用的 DNR 不互相清理。
- 目标验证：`node --test tests/environment/browser-managed-site-policy-r44.test.mjs tests/environment/stay-focus-service-r1.test.mjs tests/environment/stay-focus-r41-policy-package.test.mjs`，随后原 `stay-focus-r1.yml` CI；真正原生 Chrome/双版本固定宿主升级应依当前候选另行验收。未取得这些证据前分别标记 `NOT_TESTED`；非本次公共模块重构的正式包晋升不提前宣布通过。
