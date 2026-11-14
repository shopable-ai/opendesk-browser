# OpenDesk Browser · 框架公共配置

`browser-config.json` 是 Browser 自有的 **非敏感、构建时公共配置** 的统一数据源。按业务命名空间组织，无需预建未使用的配置项。

| 配置项 | 用途 |
| --- | --- |
| `navigation.extensionStore` | 官方线上商店地址；`null` 表示尚未上线。 |
| `navigation.developerGuides` | AI 创作提示词的公开 API 索引、类型选择、本地项目、Sidebar Tool、运行时与依赖参考。 |
| `navigation.developerReferences` | 「开发 → 直接编辑」右上角“示例”和“API 文档”的链接。 |

开发参考链接按 `controller`（自动化 JS）、`page`（网页 JS）、`react`（React JSX）、`vue`（Vue SFC）分组，每组必须同时提供 `examples` 和 `help` 两个完整 HTTPS URL。可以指向不同文档站点，也可包含查询参数或章节锚点。修改对应 JSON 字段即可调整目标；组件只根据当前代码模式选择链接，按钮文案继续由现有 i18n 管理。

帮助采用“按当前模式直达章节”：Controller 与网页 JS 指向各自 main 入门段落；React/Vue 共用组件文档，分别定位 JSX/SFC 入门。配置独立不代表文档必须分开；共同规则在原文档维护，示例入口继续打开实际源码或现有示例说明。链接使用显式稳定锚点，修改章节标题时保留锚点。

`browser-config.js` 负责统一字段校验和不可变数据输出；新增配置域/字段时，应同步扩展校验器和定向测试，遇到不认识的字段必须拒绝，不能默默放行。商店网址的 HTTPS 和 Host 安全规则仍由 `src/marketplace/store-website.js` 检查。

开发参考链接拒绝缺失字段、未知模式、非 HTTPS、带用户名/密码或含原始空白/控制字符的地址。整份配置无效时输出 `null`，编辑器保留草稿与编辑功能并隐藏参考链接。链接始终以 `noopener noreferrer` 在新标签打开，不填入或执行示例，也不授予目标站点安装权限。

**范围边界**：这里只能放可公开分发的链接、展示开关等非特权设置；不能放密钥、令牌、用户偏好、动态执行策略、Chrome 权限、可信安装源、发行身份或安装审核配置。安装通道依旧由 `src/marketplace/channel-config.json` 等原有专用合同管理，与商店导航 URL 无权限继承关系。

**生效方式**：随 WXT 扩展静态打包。持续开发复用现有 `npm run dev`，按原安全更新机制应用；已分发的静态版本需随下一次扩展构建/更新交付。它不是远程实时配置，也不会因为修改 JSON 就自动更新所有已安装版本。

`developerGuides` 必须且只能包含 `apiIndex`、`typeSelection`、`localSidebarProject`、`completeProject`、`sidebarTool`、`sidebarExample`、`runtime`、`dependencies` 八个完整 HTTPS URL，沿用开发参考链接的安全校验，输出独立冻结副本。现有示例入口（包括 React 网络 Import 示例锚点）继续复用，帮助入口按当前模式定位章节。

`createDeveloperAIPrompt(context, {config, locale})` 使用上述配置生成独立提示词，不执行代码或打开链接。仅接收 `mode`、`readOnly`、`projectSelected`、`runtimeKind`（仅 local）、`edition` 的受限值；未提供的布尔状态保持未知，不推断连接、目录或权限。支持 `zh-CN`（默认）、`en`、`ja`、`zh-TW`，不支持的语言回退 `zh-CN`；无效/null 配置只说明参考不可用，不猜测链接。用户在末尾需求标记后追加目标。
