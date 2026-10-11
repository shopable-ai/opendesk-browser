# GOAL：OpenDesk Browser R3 —— 应用市场真实代码接线、扩展内安装、公开分享预备与 Mac Chrome 验收

日期：2026-10-11。默认中文。**这是直接操作真实仓库、实现、测试、修复、文档与 Git 提交的任务，不是重新构思原型，也不是只输出报告。**

仓库：https://github.com/shopable-ai/opendesk-browser 。**只在 main 工作**，先核对最新 HEAD、origin/main、git status 与并行任务占用；安全时快进，不创建分支/Worktree、不强推、不 reset/clean、不覆盖其他 Agent 文件、dist、Chrome Profile 或原始证据。若当前执行环境没有本地仓库/真实 Mac Chrome，尽量完成可执行源码及组件测试，并将 Native / 用户 Mac 标为 NOT_TESTED，不能伪称通过。

## 一、必须先读取，避免复写其他会话成果

- AGENTS.md
- docs/framework/testing-guide.md 与相关 workstreams
- docs/product/app-market-r1.zh-CN.md、docs/product/app-market-r2.zh-CN.md
- docs/product/app-market-r2.review.zh-CN.md
- docs/product/app-market-r2.contracts-example.json
- docs/architecture/browser-framework/app-market-deployment-and-install-r21.zh-CN.md
- prototypes/marketplace/app-market-r2.html
- docs/product/sidebar-tool-market-compat-r41.zh-CN.md
- docs/product/sidebar-custom-tools-r1.zh-CN.md
- docs/product/chatgpt-knowledge-inbox-r1.zh-CN.md
- src/ui/sidebar-tools.js、src/ui/sidebar-tools/package.js、src/ui/tool.html、src/ui/design-system.css
- src/scripting/user-scripts/installed-programs.js、src/platform/tasks/service.js
- scripts/prepare-public.mjs、scripts/verify-package.mjs、wxt.config.mjs、manifest.json

先审计当前工具、包、版本和真实安装入口，尤其检查 reading-toc、quick-notes、web-markdown-clipper、markdown-workbench 以及近期 knowledge-inbox 变更，按最新 main 做候选入市清单；不沿用 R2 固定快照去覆盖新版 TOC。

## 二、产品范围和优先级

优先交付 **无需部署外部域名即可真实使用** 的“扩展内官方应用市场 P0”；复用 R2 独立详情、媒体区域、搜索/按网站筛选、我的应用、状态、版本、授权、套装和迁移设计。不要重新建第三套设计系统或第二套 Runner/Installer。

现有 Sidebar「发现」继续找本机任务；不要把它改为远程市场。市场可从「工具」打开独立完整扩展页面，不增加无必要的主导航 Tab。紧凑、无障碍、键盘可用，样式使用当前 R20/R21/R23 共享变量与组件。

### P0：真正安装闭环（必须完成）

1. 基于已有官方包创建单一可信目录，市场元数据与可执行 v1 工具包分离；版本、包哈希、能力摘要以真实源码/包和授权服务为准，不允许目录字段授予额外权限。
2. 使已有官方候选进入内置资源清单，并经现有 validateSidebarToolPackage / reviewCandidate / install 服务安装。重复安装、版本差异、来源冲突、12 工具限额、安装失败、不兼容均给出具体状态。
3. 真实页面：“详情 → 安装确认 → 已安装 → 使用”；目录/剪藏按精确 Origin 分别授权，工作台无需网站读权限。安装后不得自动运行，不能让独立市场 Tab 偷读来源网页。
4. “我的应用”从现有安装记录读取；卸载沿用真实数据和许可语义。若实现通用暂停/恢复，必须补宿主运行阻断与重启对账；做不完就不要展示可点击的假暂停按钮。
5. R2 的演示本地状态不得成为生产安装事实；路由可由扩展内部 hash/path 处理，但固定 app/release 和 collection revision 必须能复现。

### P0.5：批量安装与迁移基础（P0稳定后）

实现可保存/分享的固定应用套装清单、逐项预检、逐项确认及结果回执；不能因单一失败回滚已安装的其他应用。保留已成功、已跳过、失败、待确认状态；断线后同一事务对账，不重复提交。导入/导出只包含应用ID、固定版本和经白名单允许的非敏感偏好，不包含Cookie、Token、站点授权、笔记原文或账户凭证。恢复时先展示冲突与缺项，新设备重新授权。

### P1：公网静态站与可信跳转（有条件交付）

- 复用同一份目录和展示数据，输出能部署到 HTTPS 的静态市场页面与固定路由。不要凭空声称部署了域名；原型中的 market.opendesk.example 必须继续标注未上线。
- 公开站点仅提供详情/图片/短录屏/搜索/套装分享和“请求打开扩展安装确认”；不承载 Chrome 特权或随意下载执行脚本。正式域名与 Chrome 扩展发布 ID 尚未确定时，采用环境配置及明显的 Not Configured 回退，禁止生产通配来源。
- 若可在本轮实现 externally_connectable → onMessageExternal，则只允许明确的 HTTPS Origin，校验 sender.url/origin、协议、长度、appKey、版本/revision 与幂等键，仅允许 OPEN_INSTALL_REVIEW；发来的 packageUrl、任意 JS、权限声明均拒绝。接收只打开扩展自己确认界面，不自行调用 install。跨站恶意网页、重复/伪造消息、连接失败、已安装、无扩展均测试。
- 公开地址应包含应用和版本、固定套装 revision；正式 server rewrite/预渲染/OG 与媒体体积策略要能部署验证。未配置生产域名则只产生可部署产物和文档，标记 NOT_DEPLOYED，不要伪造真实链接。
- 遵循 Chrome MV3 远程代码政策；若某类远程自定义 JS 发行方案无法合规证明，只发布内置官方包并记录受限，不要突破已有安全边界。

## 三、测试门槛和证据

至少覆盖：目录元数据/URL解析、身份与来源、包/能力差异、重复点击、失败恢复、撤权、重启、容量边界、套装部分成功/取消/冲突/损坏文件、XSS/文本展示、恶意外部 sender、WXT 双构建与发行包验证。测试采用真实当前源码入口，不用 mock 完成回执冒充原生结果。

按 docs/framework/testing-guide.md 复用其他工作流未变化的成功证据。新变更优先定向测试，再做 npm run check、npm test、npm run build、npm run build:dev、npm run verify、npm run pack 与受控 Chrome for Testing 正式扩展安装。记录 HEAD、源/包 Hash、Chrome 版本、Extension ID、真实 Side Panel/Tab、安装/权限/卸载状态、截图、失败及恢复。真实 Mac 未验收不得说达到 95/100。

## 四、交付与推进

完成后输出：修改文件及职责、正式入口、四/五个候选的当前真实状态、如何本地启动静态市场原型、如何从 Chrome 加载生产包并完成安装、各层测试通过或未测试、下一步公开域名/扩展 ID/服务器配置依赖、最终 Git commit。把运行说明保存到 docs/architecture/browser-framework/ 或 docs/framework/guides/，API 合同有真实实现再写 docs/api/；保存完整工作流报告到自己的 docs/framework/workstreams/，不覆盖历史记录。**必须先写可运行源码并修复真实问题，再提交，不以新提示词替代实施。**
