# browser dev Go Native 迁移与 React 本地运行验证

负责人：本对话 `01a12b39`；2026-10-11；直接在 main 本地编辑。

目标：修复日常 Chrome 的 `opendesk browser dev .`，验证 React Page 项目保存只准备，明确点击后执行最新源码。

已确认缺口：旧 Node Native 安装与 Go CLI 不兼容；NVM 全局 R17.1 CLI 内容落后；切换后真实 Page 执行入口拒绝 Go 聚合 Provider 的 `local-v2-24hex` bindingId，返回 E_SCHEMA。

拟修改范围：Native protocol、host-adapter、managed-preview 共享精确 binding 格式校验及对应定向回归。保留 legacy `local-20hex`，只接纳 Go 已定义的 v1/v2 24hex；目标文档、Host 所有权和受管清理回执校验继续生效。

资源：日常 Chrome Native 连接经用户明确授权切换；原安装与旧全局 CLI 在私有目录备份。真实测试使用独立 CFT profile、随机调试端口、命名 Go Native 实例。复用已有 43111 demo-form 服务，只访问。构建在本次私有源码副本进行，不占用共享 dist/.wxt。未改旧 opendesk 来源工程。

证据目录：`/Users/shopme/.codex/tmp/opendesk-browser-dev-20261011-01a12b39`。备份含凭据，不提交、不公开原始安装配置。

复用：已读 testing-guide 与 R24.2 no-build 记录；既有 Node Host/组件证据不提升为本次 Go 原生 PASS。首次 E_SCHEMA 和测试环境准备失败保留，不覆盖。

通过条件：定向回归、静态检查、隔离构建校验通过；真实原生 Run 获得相同 sourceHash/文档的 USER_SCRIPT 回执；保存期间 preview 身份和网页 UI 不变；再次点击执行新 hash/UI，旧预览真实清理；停止移除受管 UI 并保留页面表单。结果仅属于本次局部验证，不宣称 F3/ZIP 或整体框架正式完成。

当前状态：迁移与开发命令启动已验证；Page 格式修复与真实运行验证进行中。
