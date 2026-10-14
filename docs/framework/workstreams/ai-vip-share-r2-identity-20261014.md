# AI VIP Share R2 · 工具命名与旧安装身份隔离 · 2026-10-14

本文件只记录 R2 分阶段改名，并非宣称 SDK-first 的整个代理架构已经完成。

- 正式 ID、工具源码、官方 Catalog 改为 `ai-vip-share`。
- 发行名 `AI VIP Share`，仍只描述 AI 网站的代理访问，不暗示共享账户凭据。
- 更新 R1 暂存的可信 Host 身份绑定，`ai.access` capability 暂不更改。
- 新安装包采用独立的状态 Store/Alarm/Protocol，不能读取旧 ID 的设备租约；旧 ID 卸载移除旧数据。
- `src/ai-smart-access/` 保留为**待删除的临时宿主遗留模块**，避免把 AI 业务再迁移到另一个框架目录中。
- 旧的 `aiAccess.*` 方法暂为私有过渡 RPC，不是 Chrome API 映射 SDK 批准的公共代理接口。
- 旧代理偏好由宿主恢复时按 `levelOfControl` 清理，STOP 不设 `DIRECT`，不得清理新工具正在持有的 PAC。
- 普通用户须先卸载旧工具，再审核安装新工具；不能静默迁移旧包 Hash、epoch、permission 或激活。
- 当前缺少 R11 通用 Managed Proxy SDK、正式 Provider 和同候选 Chrome Native 证据：`SDK_BLOCKED / PROVIDER_BLOCKED / NATIVE_NOT_TESTED`。
- 下一阶段将工具域名、服务商配置、激活 UI/流程迁回 `examples/sidebar-tools/ai-vip-share/`，移除 `src/ai-smart-access/` 业务接线，独立测试新 ID 的安装/升级/撤权/重启/卸载与全局 proxy 冲突。

分工：本提交不修改 SDK R11 合同、Registry、Dispatcher 或其他工具的运行时。
