# 本次增量的逐文件说明

以下仅列任务拥有的代码/配置/测试入口；14个TSX中Settings另有弹窗与备份修复，其余13个文件只新增一行React导入。原App、环境、服务、词典及其他dirty业务未被本轮重写。

| 范围 | 文件与关键行 | 本轮为什么改 |
| --- | --- | --- |
| 文档 | [projects/ai-proxy/AGENTS.md](/Users/shopme/Documents/workspace/opendesk-browser/projects/ai-proxy/AGENTS.md:3) | 当前任务边界、唯一owner与可信版本 |
| 文档 | [projects/ai-proxy/README.zh-CN.md](/Users/shopme/Documents/workspace/opendesk-browser/projects/ai-proxy/README.zh-CN.md:3) | 增加单一审阅入口与当前结果 |
| 包身份 | [projects/ai-proxy/package.json](/Users/shopme/Documents/workspace/opendesk-browser/projects/ai-proxy/package.json:4) | 最终版本0.3.8 |
| 包身份 | [projects/ai-proxy/tool.config.json](/Users/shopme/Documents/workspace/opendesk-browser/projects/ai-proxy/tool.config.json:4) | 最终版本0.3.8；原权限不变 |
| 生成物 | [projects/ai-proxy/ai-proxy.opendesk-tool.json](/Users/shopme/Documents/workspace/opendesk-browser/projects/ai-proxy/ai-proxy.opendesk-tool.json:4) | 原打包器晋升的唯一0.3.8正式包 |
| 业务 | [projects/ai-proxy/src/Settings.tsx](/Users/shopme/Documents/workspace/opendesk-browser/projects/ai-proxy/src/Settings.tsx:146) | 弹窗标题移出滚动字段区；迟到备份读取绑定原环境/revision/卸载代数；显式React绑定 |
| 布局 | [projects/ai-proxy/src/styles/sidebar-settings.css](/Users/shopme/Documents/workspace/opendesk-browser/projects/ai-proxy/src/styles/sidebar-settings.css:195) | dialog三行布局，字段独立滚动，头尾保持可见 |
| 回归 | [projects/ai-proxy/tests/drafts.test.mjs](/Users/shopme/Documents/workspace/opendesk-browser/projects/ai-proxy/tests/drafts.test.mjs:204) | 备份卸载、替换环境、等待确认和迟到失败不污染新UI |
| 信任 | [projects/ai-proxy/trusted/admission.js](/Users/shopme/Documents/workspace/opendesk-browser/projects/ai-proxy/trusted/admission.js:7) | 固定可信版本0.3.8，复用原精确准入 |
| 信任 | [projects/ai-proxy/trusted/source-lock.json](/Users/shopme/Documents/workspace/opendesk-browser/projects/ai-proxy/trusted/source-lock.json:34) | 独立审查57个真实输入后固定摘要，包含递归CSS闭包 |
| 宿主 | [src/ui/tool-shell.css](/Users/shopme/Documents/workspace/opendesk-browser/src/ui/tool-shell.css:589) | 已准入AIProxy复用剩余高度链与单一滚动owner |
| 宿主 | [src/ui/tool-shell.js](/Users/shopme/Documents/workspace/opendesk-browser/src/ui/tool-shell.js:1) | 使用唯一版本常量，去掉重复0.2.0 |
| Host桥接 | [src/ui/sidebar-tools.js](/Users/shopme/Documents/workspace/opendesk-browser/src/ui/sidebar-tools.js:1140) | 白名单currentPage.info；无载荷页面变化通知，仍经原权限/身份/epoch |
| Root接入 | [src/ui/react/main.tsx](/Users/shopme/Documents/workspace/opendesk-browser/src/ui/react/main.tsx:197) | 将真实container交原环境，支持订阅与清理当前页事件 |
| 构建信任 | [scripts/bundle-provenance.mjs](/Users/shopme/Documents/workspace/opendesk-browser/scripts/bundle-provenance.mjs:530) | 整套固定来源与递归CSS导入检查；不信任展平模块列表 |
| 回归 | [tests/environment/bundle-provenance.test.mjs](/Users/shopme/Documents/workspace/opendesk-browser/tests/environment/bundle-provenance.test.mjs:14) | 改叶子、symlink、漏锁孙级、远端及越界拒绝 |
| 回归 | [projects/ai-proxy/tests/trusted-host-integration.test.mjs](/Users/shopme/Documents/workspace/opendesk-browser/projects/ai-proxy/tests/trusted-host-integration.test.mjs:22) | 实际Host闭包：准入拒绝、当前页权限、unknown和事件生命周期 |
| 浏览器验证 | [projects/ai-proxy/scripts/trusted-dialog-browser.mjs](/Users/shopme/Documents/workspace/opendesk-browser/projects/ai-proxy/scripts/trusted-dialog-browser.mjs:29) | 真实Surface及Host样式，classic JSX，内存服务，无真实代理副作用 |
| JSX接入 | [projects/ai-proxy/src/QuickPanel.tsx](/Users/shopme/Documents/workspace/opendesk-browser/projects/ai-proxy/src/QuickPanel.tsx:1) | 仅加显式React命名空间绑定，适配宿主classic JSX；原业务字节保留 |
| JSX接入 | [projects/ai-proxy/src/i18n/LocaleProvider.tsx](/Users/shopme/Documents/workspace/opendesk-browser/projects/ai-proxy/src/i18n/LocaleProvider.tsx:1) | 仅加显式React命名空间绑定，适配宿主classic JSX；原业务字节保留 |
| JSX接入 | [projects/ai-proxy/src/ui/DiagnosticsPage.tsx](/Users/shopme/Documents/workspace/opendesk-browser/projects/ai-proxy/src/ui/DiagnosticsPage.tsx:1) | 仅加显式React命名空间绑定，适配宿主classic JSX；原业务字节保留 |
| JSX接入 | [projects/ai-proxy/src/ui/FormField.tsx](/Users/shopme/Documents/workspace/opendesk-browser/projects/ai-proxy/src/ui/FormField.tsx:1) | 仅加显式React命名空间绑定，适配宿主classic JSX；原业务字节保留 |
| JSX接入 | [projects/ai-proxy/src/ui/OfficialServicePage.tsx](/Users/shopme/Documents/workspace/opendesk-browser/projects/ai-proxy/src/ui/OfficialServicePage.tsx:1) | 仅加显式React命名空间绑定，适配宿主classic JSX；原业务字节保留 |
| JSX接入 | [projects/ai-proxy/src/ui/OptionsShell.tsx](/Users/shopme/Documents/workspace/opendesk-browser/projects/ai-proxy/src/ui/OptionsShell.tsx:1) | 仅加显式React命名空间绑定，适配宿主classic JSX；原业务字节保留 |
| JSX接入 | [projects/ai-proxy/src/ui/ProxyEntry.tsx](/Users/shopme/Documents/workspace/opendesk-browser/projects/ai-proxy/src/ui/ProxyEntry.tsx:1) | 仅加显式React命名空间绑定，适配宿主classic JSX；原业务字节保留 |
| JSX接入 | [projects/ai-proxy/src/ui/ProxyIcon.tsx](/Users/shopme/Documents/workspace/opendesk-browser/projects/ai-proxy/src/ui/ProxyIcon.tsx:1) | 仅加显式React命名空间绑定，适配宿主classic JSX；原业务字节保留 |
| JSX接入 | [projects/ai-proxy/src/ui/RotationPlan.tsx](/Users/shopme/Documents/workspace/opendesk-browser/projects/ai-proxy/src/ui/RotationPlan.tsx:1) | 仅加显式React命名空间绑定，适配宿主classic JSX；原业务字节保留 |
| JSX接入 | [projects/ai-proxy/src/ui/SourcesPage.tsx](/Users/shopme/Documents/workspace/opendesk-browser/projects/ai-proxy/src/ui/SourcesPage.tsx:1) | 仅加显式React命名空间绑定，适配宿主classic JSX；原业务字节保留 |
| JSX接入 | [projects/ai-proxy/src/ui/Status.tsx](/Users/shopme/Documents/workspace/opendesk-browser/projects/ai-proxy/src/ui/Status.tsx:1) | 仅加显式React命名空间绑定，适配宿主classic JSX；原业务字节保留 |
| JSX接入 | [projects/ai-proxy/src/ui/SubscriptionReader.tsx](/Users/shopme/Documents/workspace/opendesk-browser/projects/ai-proxy/src/ui/SubscriptionReader.tsx:1) | 仅加显式React命名空间绑定，适配宿主classic JSX；原业务字节保留 |
| JSX接入 | [projects/ai-proxy/src/ui/UsageControls.tsx](/Users/shopme/Documents/workspace/opendesk-browser/projects/ai-proxy/src/ui/UsageControls.tsx:1) | 仅加显式React命名空间绑定，适配宿主classic JSX；原业务字节保留 |

审阅附件位于本目录：README.md、changes.md、reviews.md、native-core.json、component-report.json、runtime-build.json、source-review-inputs-0.3.8.json，以及before-dialog.jpg / after-dialog.jpg / after-dialog-expanded.jpg。它们是说明、身份与证据，不是额外产品实现。

修改前的真实dirty字节、最终字节的SHA256及逐文件增删行见artifacts/ai-proxy-trusted-react-20261031/task-files.json。源码补丁省去生成安装包和审阅附件；完整文本补丁保留这些文本。JSON正文是生成物，人工优先看配置、源码、tests和来源锁，不必逐字符审阅压缩包。
