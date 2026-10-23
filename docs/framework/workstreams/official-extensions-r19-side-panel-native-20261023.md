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

## 阶段实证与未完成项（2026-10-23）

> 只记录已经结束的 GitHub Job 实际日志；不能提升为整条 Native/发行 PASS。

1. **AdBlock 原始阻断解除**：`39933509209` 的 macOS CFT 确认 live SIDE_PANEL 身份可附加，DNR 网络与暂停/恢复、Chrome Worker 恢复、12 项真实 CSS 操作、重启、停用/重启/卸载/重装及 DNR 读回通过。整条失败于重装后 React Extension Center 返回。修复 `7cc0151f` 后的 `39935087692` 仍 FAIL：CDP 证据显示 Back aria 为“返回扩展列表”，但 Tool Host 未退出；`0a9c11d1` 新增 React 控件事务 settle 核验及 Back 后真实 DOM/未保存确认状态诊断，**新运行未证明成功**。
2. **Time Review 原始阻断解除**：`39933300441`、`39933546368`、`39934882983` 的 macOS CFT 确认 canonical 与 hostInstanceId 的文档切换可被重新绑定，双授权无二次启动、1200ms 以上合法前台增长、分钟 Canvas 与键盘、200% 缩放、JSON/CSV 文件及哈希获得真实 PASS。整条 Native 继续 FAIL。第一次因测试错误地用未授权本地旧包试图覆盖官方 Reading TOC，已修正为预装身份保护与可选 Stay Focus 合法本地→官方升级；`39934882983` 新失败在 Cookie Editor 内部嵌套 Back 后无法返回管理列表，`0506e1e0` 已增加按真实 UI 层级逐级点击、检查及 SHA 化诊断，**新运行未证明成功**。`39934882983` 的 Linux Node Job 是 PASS。
3. **共享 App CI**：`39933931694` 多个 App Linux 共同失败于 R26 预装审阅合同找不到 Stay Focus 的 `dist/tool.css`；对照 Stay Focus 单项 Job 是 PASS。修复 `2152b364` 在 App CI matrix 候选生成前编译三项官方 React 依赖，仍保留 Node、Chromium、Native、来源锁。其他真实失败（AdBlock 正式 JSON 与新源码不一致、Shared Preview freshness、Clipper 旧预算断言及预览差异）仍独立存在，不能删除断言掩盖。
4. **源和发行**：官方 Catalog 12 项，且只有 Reading TOC / Quick Notes / Cookie Editor 默认预装；AdBlock 仍 `1.2.3`，Time Review `1.6.0`。新正式发行未发生。必须以当前真实 main 和新候选 SHA 校验，同候选 macOS Native 全部通过后才按既有 App Release 合法版本晋升，并核查 `--check-project`。不从历史 Native PASS 推导新候选 PASS。
5. **下一首要动作**：先读取 `0506e1e0` 和 `0a9c11d1` 对应 Native 新运行的首个 FAIL 及完整观察日志；如果是 UI 驱动竞态只改测试，如果实际 Host 不可退出才按证据修产品。并独立核查 App CI 源与预览锁问题，优先保留真实安全约束。

这些状态是审计日志，所有未执行的在线 ChatGPT、DeepSeek、Gemini，以及其他官方应用完整生命周期验收仍为 `NOT_TESTED`；正式发行是 `FAIL`（准入未关闭）。