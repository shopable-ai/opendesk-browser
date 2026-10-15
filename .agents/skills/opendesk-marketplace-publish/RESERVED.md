# 预留：opendesk-marketplace-publish（尚未启用）

**状态：RESERVED_ONLY / NOT_AN_ACTIVE_SKILL / ONLINE_PUBLISH_NOT_IMPLEMENTED。**

- **未来正式文件名**：`.agents/skills/opendesk-marketplace-publish/SKILL.md`
- **当前保留文件**：`.agents/skills/opendesk-marketplace-publish/RESERVED.md`（即本文件）
- **重要约束**：在真实发布合同和对应测试落地前**不得创建带 frontmatter 的 SKILL.md**，否则自动技能路由可能把尚不存在的在线发布能力误当成可执行能力。本目录不属于正式 Skill 集合。
- **未来主职责**：OpenDesk 插件/应用市场的发行者提交、审核、上架、版本发布、更新、撤销及审计；不负责 Sidebar App 源码编写、通用 JSON 本地打包、扩展中心 UI 或 Chrome Runtime。

## 已有可以复用的实现（不是线上发行）

- `src/marketplace/`、`scripts/build-market-site.mjs`：市场前端与静态站点构建。
- `official-tools/catalog.json`、`scripts/build-official-tools.mjs`、`src/sidebar-tools/official-catalog.js`：扩展**随包发布**的官方固定 Catalog、版本与 SHA-256 校验。
- `src/ui/sidebar-tools/installation.js`：已有可信审阅、安装、升级及用户授权边界。未来市场**必须复用**，不能创建第二个 Installer。
- `src/marketplace/external.js`：R5 有界网站交接；正式 HTTPS Origin / Chrome 扩展 ID / 官网部署条件未满足时不得声称公网渠道可用。

依据：[现有市场实施与缺口](../../../docs/api/app-market-r3.zh-CN.md)、[官网通道合同](../../../docs/architecture/browser-framework/app-market-website-r5.zh-CN.md)、[官方 Catalog](../../../docs/api/official-tools-catalog.zh-CN.md)、[第三方来源边界](../../../docs/product/sidebar-tool-market-compat-r41.zh-CN.md)。

## 未来启用之前必须完成的工作

- [ ] **发布产品规则**：定义谁可提交、发布者稳定 ID 与命名空间所有权、版本不可变性、包大小/能力变化、许可证与内容违规处理；形成版本化文档并明确人工/自动审核责任。
- [ ] **发行服务合同**：真实可用的作者身份、登录授权、上传 API、包存储、上传回执、幂等操作标识、审核状态、发布/撤回/暂停、版本与审计历史；与现有 `opendesk.sidebar-tool.v1/v2` 数据模型衔接，不引入第二个沙箱格式。
- [ ] **签名与可信来源**：明确发布者验证、原始字节哈希、可信密钥/轮换、吊销列表、渠道签名验真、版本与来源冲突处理；单纯本地 SHA-256 或前端展示无法证明第三方来源真实性。
- [ ] **安全与隐私审核**：恶意代码与可执行内容检查、声明能力与最小权限、跨站/用户数据界限、违规和滥用上报/删除、失效或撤权后的已安装工具行为；市场网站不能直接调用 Host 或授予 `chrome.*`。
- [ ] **客户端复用**：服务端只提供可信包与来源描述，Chrome 端继续复用 `validateSidebarToolPackage`、既有安装审阅/确认、单一工具存储、Website Grant 和更新保护；禁止远端网页静默安装/更新。
- [ ] **渠道/升级验收**：绑定正式 HTTPS Origin、正确扩展 ID、真实发布地址与 Chrome 消息配置；测离线、包篡改、并发上传、版本回退、来源冲突、升级失败、撤销、下载中断、用户拒绝、重启、未知操作结果与安全回滚。
- [ ] **发布证据**：在同一候选 commit/包 hash 下记录 CI、服务器发布回执、真实 Chrome、Mac 安装、负向权限/跨源测试与未完成矩阵。未经端到端验收，状态保留 `BLOCKED / NOT_TESTED`。
- [ ] **激活检查**：评审本 Skill 与 [Skills 宇宙规则](../UNIVERSE.zh-CN.md)，确认独立评分门槛、代码消费点、唯一职责和可执行测试；之后才建立 `SKILL.md`，同步 [路由索引](../README.md)、自动化治理测试及只读真实触发验证。

## 当前遇到“发布到插件市场”的请求怎么办？

先把它拆成两个真实结果：**本地生成可导入包** → 走 [Sidebar Tool 打包 Skill](../opendesk-sidebar-tool-package/SKILL.md)；**线上作者上传/审核/正式上架** → 明确标记 `BLOCKED` 并引用上方缺口，不得模拟上传成功、自动声明已上架，亦不创建一个假 API。修改市场列表、搜索或详情 UI 才交给 `opendesk-extension-ui`；页面、运行时安全由已有相应 Skill 负责。
