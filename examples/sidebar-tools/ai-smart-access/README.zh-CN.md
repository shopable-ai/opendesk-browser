# AI 智能访问 · 官方独立 Sidebar 工具

此目录是真正的官方安装包 UI 源码，经过 `scripts/build-official-tools.mjs` 发布。
用户无需持有此源代码。该工具不是新的 Chrome 扩展；不提供任意代理地址、PAC 编辑、
Cookie 移植和访问日志。正常页面仅显示启停、状态和一句分流说明。

可信控制逻辑位于 `src/ai-smart-access/`、`src/entrypoints/sidebar-tool-host.js`、
`src/sw.js`。Chrome `proxy` 不能申请可选权限：用户需要在安装/更新 OpenDesk Browser 时授予。
首次启用仍须在 Side Panel 的受信任 Host 真实点击；任何工具沙箱不能自行启停。动态加载的工具沙箱最多
调用 `aiAccess.status`，不允许触发写入或激活。其他网站由本地 PAC 返回 `DIRECT`。

**运营阻塞：** 目前仓库没有经验证且部署可用的 AI 代理线路/激活 API。
`src/ai-smart-access/provider-config.js` 明确使用空服务配置，因此工具可以
安装和查看“不可用”，但**不能声称已代理、不能假装激活成功**。
需要服务端实现明确的短效租约 API，再由扩展发布者审查并在固定可信模块配置。
请勿用旧版 todo6.com 卡密/服务端 JS/Cookie 登录接口代替该 API。

本地定向测试：`node --test tests/environment/ai-smart-access-r1.test.mjs`
构建安装包：`npm run build:sidebar-tool -- examples/sidebar-tools/ai-smart-access`

本机 Chrome 原生验收需要真实签发租约和可工作的代理测试端点，并保存
Chrome `levelOfControl`、PAC 应用/释放、两类域名实际请求路线和扩展状态证据。
