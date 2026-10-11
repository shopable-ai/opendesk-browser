# browser dev Go Native 迁移与 React 本地运行验证

负责人：本对话 `01a12b39`；2026-10-11；直接在 main 本地编辑。

目标：修复日常 Chrome 的 `opendesk browser dev .`，验证 React Page 项目保存只准备，明确点击后执行最新源码。

已确认缺口：旧 Node Native 安装与 Go CLI 不兼容；NVM 全局 R17.1 CLI 内容落后；切换后真实 Page 执行入口拒绝 Go 聚合 Provider 的 `local-v2-24hex` bindingId，返回 E_SCHEMA。

拟修改范围：Native protocol、host-adapter、managed-preview 共享精确 binding 格式校验及对应定向回归。保留 legacy `local-20hex`，只接纳 Go 已定义的 v1/v2 24hex；目标文档、Host 所有权和受管清理回执校验继续生效。

资源：日常 Chrome Native 连接经用户明确授权切换；原安装与旧全局 CLI 在私有目录备份。真实测试使用独立 CFT profile、随机调试端口、命名 Go Native 实例。复用已有 43111 demo-form 服务，只访问。构建在本次私有源码副本进行，不占用共享 dist/.wxt。未改旧 opendesk 来源工程。

证据目录：`/Users/shopme/.codex/tmp/opendesk-browser-dev-20261011-01a12b39`。备份含凭据，不提交、不公开原始安装配置。

复用：已读 testing-guide 与 R24.2 no-build 记录；既有 Node Host/组件证据不提升为本次 Go 原生 PASS。首次 E_SCHEMA 和测试环境准备失败保留，不覆盖。

通过条件：定向回归、静态检查、隔离构建校验通过；真实原生 Run 获得相同 sourceHash/文档的 USER_SCRIPT 回执；保存期间 preview 身份和网页 UI 不变；再次点击执行新 hash/UI，旧预览真实清理；停止移除受管 UI 并保留页面表单。结果仅属于本次局部验证，不宣称 F3/ZIP 或整体框架正式完成。

当前状态：本次局部目标已完成，2026-10-11。日常 Chrome 使用已验证构建与 Go Native Host；原目录 `opendesk browser dev .` 已重新启动，Sidebar 已选中 `page-ui-react-direct · 页面脚本`，运行按钮可用，未自动执行。

结果与证据：

- 修复 Node→Go 安装边界，并用当前源码打包更新 NVM/Homebrew 的全局开发 CLI；R17.1 版本号原先相同，但安装内容落后。原安装与原全局包在本次私有 backup 中保留。
- 共享精确 binding 校验接受 `local-20hex`、`local-v1-24hex`、`local-v2-24hex`。目标/文档/所有权/清理 nonce 校验保持生效；畸形标识在 Native effect 前拒绝。
- 定向回归：69 PASS、0 FAIL、1 SKIP；`regression-before.log` 保留修复前 E_SCHEMA，`regression-after.log` 保留修复后结果。SKIP 是未传可执行文件环境参数的模拟 Chrome CLI parity 项；本次真实 Go 连接另有独立证据。
- 隔离源码检查：265 个源码/测试/构建文件通过语法及现有源码合同检查，`fixed-check-final.log`。三处产品文件与回归测试和验证副本逐字节一致，限定 diff check 通过。未以其他对话的未提交文件替代本次候选。
- 隔离正式构建与 package verify 通过，66 个资源；packageHash `439a983b23672643ac45471dcbc09032dc682b6463b2d65f2879e396766c75bc`，`fixed-build/build-production.json`。候选基线 `b30b2192640fd7a77ece31bb0a9d5610fb45487e` 加本次四文件覆盖；未写共享 dist/.wxt。为隔离构建恢复的是候选已声明的 axios 1.20.0，不是新增依赖。
- 受控真实 CFT：`native-test/ram-validation.json` 11 项断言 PASS。原始观察 `ram-ready-before-run.json`、`ram-run-1.json`、`ram-after-save-immediate.json`、`ram-saved-before-run-2.json`、`ram-run-2.json`、`ram-stopped.json` 保留。运行与高亮/停止均来自真实 UI 输入，CDP 仅只读观察。
- 首次 previewId `a3f80b2f-4aed-498d-a8f6-ba640ca5657a`，sourceHash `34b22968dacd96ad4f706be99e44aee5f46479f0cd82fb5e07cec5eea7ea4d52`；保存后 world/preview 身份和旧 UI 不变。再次明确点击后 previewId `d3b7fc75-19a0-4e0b-847b-dba8892ef637`，sourceHash `2dd6dc1ec37a91c09da20ec4fedab5330e4c7f78462a64bfcb39cb64c9c5f79b`；两次 Run 均复用自动准备产物，运行时构建 0 次。文档均为 `9BB836678CA7562CAA32DFB1F3C1DD35`。
- 替换与停止均观察到 `opendesk.managed-ui.v1` 的真实 `ok:true`、正确 nonce、`scope:managed-ui-only` 清理回执；最终两个 world 为 retired，UI/标记/outline 清除，表单值保持。
- 日常扩展安装到独立持久目录 `/Users/shopme/.opendesk-browser/extensions/local-dev-01a12b39`，与受测 66 文件逐一 SHA-256 一致，见 `daily-package-binding.json`；新真实 ID `mknncoaonlkeljgcbdncdkenloofpfle`。旧 `ccfcjegpkdlgbclopjmadlcjedelidmf` 保留并停用，其历史数据未删除。`daily-final-doctor.json` 为已认证 nativeConnected:true，目录 Provider 的启动输出及 Sidebar 选择通过本对话原生 UI/终端观察确认；没有把日常 Chrome 的就绪状态提升为另一份受控 CFT Run 验收。

环境与收尾：早期 CFT 因磁盘不足中断，缺少完整持久回执的尝试仍为 INCOMPLETE，不计 PASS。最终使用本次 4 GiB RAM 测试 profile 完成验证；停止并关闭后，四个命名 Native 实例均已清理，专属 RAM 磁盘已卸载。前三个已被 launcher 移除的 profile 仅临时恢复本实例的卸载 manifest，以便原 Go cleanup 验证后删除；见 `test-native-cleanup.json`。其他浏览器/Native 实例、43111 服务、来源工程和共享构建目录保持原样。原 React 示例源码未改动，保存测试仅修改本次副本。

等级与剩余范围：本任务的 CLI 启动、保存/Run/替换/Stop 局部验证通过；不宣称整体迁移、最终 F3、ZIP 安装或正式发布完成。本对话未执行 commit/push/release。当前原目录开发命令保持运行，Ctrl+C 只结束本次 CLI 临时目录接入。
