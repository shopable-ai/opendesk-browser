# OpenDesk Browser · 框架公共配置

`browser-config.json` 是 Browser 自有的 **非敏感、构建时公共配置** 的统一数据源。按业务命名空间组织，目前只有 `navigation.extensionStore`（官方线上商店地址，`null` 表示尚未上线）。无需预建未使用的配置项。

`browser-config.js` 负责统一字段校验和不可变数据输出；新增配置域/字段时，应同步扩展校验器和定向测试，遇到不认识的字段必须拒绝，不能默默放行。商店网址的 HTTPS 和 Host 安全规则仍由 `src/marketplace/store-website.js` 检查。

**范围边界**：这里只能放可公开分发的链接、展示开关等非特权设置；不能放密钥、令牌、用户偏好、动态执行策略、Chrome 权限、可信安装源、发行身份或安装审核配置。安装通道依旧由 `src/marketplace/channel-config.json` 等原有专用合同管理，与商店导航 URL 无权限继承关系。

**生效方式**：随 WXT 扩展静态打包，填写真实 HTTPS 地址后需重新构建并发布扩展，不是远程实时配置，也不会因为修改 JSON 就自动更新已安装版本。
