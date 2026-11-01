# OpenDesk Browser · Examples 示例总入口

> 本页是 examples/ 的中文统一导航。GitHub 默认显示 [简短入口](README.md)；技术合同以 [扩展选型](../docs/api/extension-development-selection.zh-CN.md)、[目录与测试归属](../docs/architecture/extension-project-layout.zh-CN.md) 和各项目配置为准。此文档不是新增安装器或文件格式。

## 我想做什么？

| 目标 | 应打开 | 入门样本 | 注意事项 |
| --- | --- | --- | --- |
| 给网页加悬浮 UI 或 DOM 功能 | [programs/](programs/) | [page-ui-basic](programs/page-ui-basic/)、[local-page-ui](programs/local-page-ui/) | Page USER_SCRIPT 在网页文档中运行，不能访问 Controller 的 page |
| 自动填写、点击、观察网页 | [programs/](programs/) | [sidebar-controller-demo](programs/sidebar-controller-demo/)、[local-controller](programs/local-controller/) | Controller 通过已授权的 page/Locator 执行 |
| 安装固定版本的自动化任务 | [tasks/](tasks/) | [百度/Google 搜索任务](tasks/README.zh-CN.md#百度与-google已安装任务的最短入口) | Task 包不等于散装 JS；必须审核 Task ID、版本、源码、网站和用户授权 |
| 制作独立侧边栏工具 | [sidebar-tools/](sidebar-tools/) | [minimal-html-starter](sidebar-tools/minimal-html-starter/)、[react-starter](sidebar-tools/react-starter/)、[vue-starter](sidebar-tools/vue-starter/) | 通过 tool.config.json 和唯一打包器安装；不自动获得 Chrome 特权 |
| 体验固定 React/Vue Page 导入草稿 | [import-ready/](import-ready/) | 四份已冻结的导入 JSON | 草稿的源 SHA 不因移动目录而自动更新 |
| 查看库与网络依赖示例 | [libs/](libs/)、[network-javascript/](network-javascript/) | trusted-imports、Page/Controller 静态 import | 静态 import、运行世界和能力授权是三件事 |
| 查看本地文件、云控或 UI 原型 | [local-workspace/](local-workspace/)、[cloud-control/](cloud-control/)、[ui/](ui/) | 内存工作区、云控表单、离线交互 HTML | 演示与真实 Native/云控/生产安装验收需区分 |
| 找到共享示例素材 | [shared/](shared/) | markdown/ | 非公共 Host API |

**正式项目**默认去 [projects/](../projects/) 找；**通用测试夹具**去 [tests/fixtures/](../tests/fixtures/) 找。历史业务仍留在 examples/sidebar-tools/ 的，以 [官方 Catalog](../official-tools/catalog.json) 和项目 README 为准，不凭路径猜测其是否已经正式交付。

## 为什么暂时保留 programs、tasks、sidebar-tools 三个目录？

三者是不同的**开发与安装合同**，不是三套重复的 JavaScript 源码。programs 中的运行世界由 package.json 里的 runtimeKind 决定；tasks 中冻结的 .opendesk-task.json 携带可安装身份和固定源；sidebar-tools 使用 tool.config.json/打包后运行于隔离工具环境。把三个目录物理合并不会自动减少重复，反而会扩大旧路径、CI、源码来源和已安装任务的迁移范围。

名称里带 sidebar 的旧 Page/Controller 演示（如 sidebar-page-demo 和 sidebar-controller-demo）仍按它们的 runtimeKind 运行。只要没有完整消费者与来源核查，就不要为了名字好看而重命名项目 ID 或移动源码。

## 测试页面和探针是不是垃圾文件？

不是。tasks/demo-form.html 与 workflow-search.html 是本机 Browser Test Lab 既有服务根；dev-hot-preview-p0 检查热预览回归，import-max-probe 保留固定供应商源码/许可证及沙箱安装验证，shared-ui-demo 是 React 共享 UI 独立工具，均有各自的 README 或测试入口。

清理历史生成物、将 Fixture 搬到 tests/ 或把正式业务迁到 projects/，必须先查找真正的运行消费者、当前并行任务和路径 pin。不要因为文件位于 examples/ 就将已安装的 Task 或生产项目当作临时 Demo。

## 本次归属与迁移审计

详见 [逐项目录归属与迁移台账](OWNERSHIP-AUDIT-2026-11-02.zh-CN.md)。它按 KEEP / BLOCKED 等标签记录当前结论、原因与后续必须补的证据；BLOCKED 是暂不迁移，不是废弃。前一轮 browser-sdk-*、minimal-html-starter 的迁移已完成，本轮不重复执行。

## 最短运行入口

- Page/Controller 项目：先读 [programs/README.md](programs/README.md)，再核其 package.json、网站范围与权限，使用现有开发/本地项目流程。
- Sidebar Tool：先读 [sidebar-tools/README.zh-CN.md](sidebar-tools/README.zh-CN.md)；用原 scripts/build-sidebar-tool.mjs 形成候选，测试后才按原晋升链提交唯一正式包。
- Controller Task：先读 [tasks/README.zh-CN.md](tasks/README.zh-CN.md)，逐项校验可安装 JSON、参数与授权。本机页面服务器仍以 examples/tasks 为 root，勿自行搬走测试页面。
- 调试真实 Mac Chrome、Native/MCP 和应用安装必须记录独立证据。Node 或文档检查不能冒充原生测试通过。
