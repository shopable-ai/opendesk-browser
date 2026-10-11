# R15.9 上游 Axios 1.20.0：Page 按需资源与剩余 Controller 任务

日期 2026-10-11。Axios 1.13.2 受 2026 年公开漏洞影响，故改用已修复版本 1.20.0，不复用旧版手写 lock。新 package-lock 的发布包 SHA-512 和所有传递依赖来自实际公开的 npm lock（step-security/action-download-artifact，含 1.20.0），保持真实 tarball integrity；上游 1.20.0 MIT LICENSE 归入现有发布清单。

仅对显式 `// @opendesk-lib axios` 的 Page USER_SCRIPT 加载一个真实 upstream axios.create() 实例。开放 Axios 函数、get/post/put/delete/request/create/getUri 和实例 interceptors（不能深冻结 interceptors）。该 API 运行普通网页网络，不提供特权跨站或任意 Chrome API，不能冒充 Controller axiosx，更不会在请求失败时自动切换权限通道。

既有 src/libs/adapters/axios-transport.js 保留为 Controller 未来受授权通信的薄转换；仍未把真实 Axios factory 和 RunHost Broker/取消传播接好，不能标记 Controller Axios 全量完成。现有 privileged axiosx API 继续作为可用受控 HTTP 通道。

验收：新增真实 npm API、单一 Page 资源、按需声明、身份/SHA/ABI、production+development WXT 包及 Chrome 本站请求测试。该提交只保证源码到仓库；npm CI、正式 Chrome、ZIP 分开核实，未通过前不得报告最终完成。
