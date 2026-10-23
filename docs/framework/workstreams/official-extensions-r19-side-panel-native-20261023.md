# 官方扩展 R1.9 — Native Side Panel 文档身份修复

- 状态：IN_PROGRESS（2026-10-23）
- 负责人：本轮 OpenDesk Browser 官方扩展 R1.9 对话，仅负责本文件列出的测试驱动/辅助函数。
- 起始 GitHub main：`cb7caa883fc28ec3e27b55f83cc6f28798118d03`；并行更新时以写入前重新读取的 main/blob 为准。
- 写入范围：`tests/framework/adblock-r12-native.test.mjs`、`tests/framework/time-review-r13-native.test.mjs`、`tests/framework/helpers/verified-side-panel-native.mjs`、`tests/environment/verified-side-panel-native.test.mjs`、`.github/workflows/adblock-r12.yml`、`.github/workflows/time-review-r13-native.yml` 以及本记录。
- 新增最小共享 CI 范围（基于 App CI Actions 39933931694、日志 E_TOOL_STAGE dist/tool.css）：`.github/workflows/app-ci.yml` 的官方 React 编译前置步骤；不改变来源锁、不改变共享安装或业务代码。
- 不占用：AdBlock/Time Review 业务源码、Host/SDK、其他 App 源码、共享 Mac 本地 Chrome/Profile、正式 JSON、Catalog、正式发布槽和全局账本。
- 根因：Time Review 运行 39925657337 用先前的 canonical Side Panel URL/Document ID 匹配后续带 hostInstanceId 的真实 page target；AdBlock 运行 39926177173 的 Side Panel 重新打开时复用已过期的捕获 Document ID。此前通过的 DNR、CSS 和合法时间增长是旧候选的限定成功证据。
- 修复合同：CDP page/other 文档目标、当前 document 局部 URL + hostInstanceId、实时 Chrome SIDE_PANEL Context、唯一 Document ID、已加载 DOM 全部交叉校验；拒绝 tab 包装/普通扩展标签页、多个同时存活的匹配面板及伪造 Context。不得对历史 ID 作强制相等；生命周期重新附加必须重验。
- 验证：优先 Node 辅助函数单元测试、`node --check`，随后 Github macOS Chrome for Testing 新候选日志和原始证据；本会话的运行环境不是用户 Mac，未实跑则为 NOT_TESTED。已有业务 PASS 仅按相同候选来源核对复用，不提升为新 Native PASS。
- 发行：本工作项不执行版本升级或 App Release；完整 Native 和来源身份通过后另行按仓库发行合同执行。
