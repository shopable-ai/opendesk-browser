# OpenDesk Browser

> **从这里理解产品与下一步**：[R8 用户目标、188 项能力取舍与真实验收](docs/product/browser-automation-r8-product-guide.zh-CN.md)。先读用户能做什么，再按 [188 项能力总账本](docs/product/browser-automation-feature-catalog-r8.zh-CN.md) 与 [40 项工程任务](docs/product/browser-automation-r8-implementation-plan.zh-CN.md) 追踪实现；规划不代表功能已交付。

**定位：Chrome MV3 的浏览器自动化与网页增强工作台。** 跨页面操作走 Controller / RunHost / ChromePage；页面 JavaScript 走 User Scripts API 的 USER_SCRIPT。两者共享可信宿主，但不是同一个运行环境。

## 当前框架与真实进度（先读这里）

**日常操作首选：[保留 Sidebar R6 的单文件运行与多文件项目使用指南](docs/product/program-development-dual-format-and-sidebar.zh-CN.md)**。此文档明确三页签原样保留、旧有按钮位置和「发现 → 导入」的真实路径；不要把示意图当作产品替代设计。

复杂脚本优先使用 **多文件 ESM + package.json 的 opendesk 字段**，传统单文件 JS 仍在 Sidebar「开发」直接运行。`npm run build:program -- <目录>` 将页面项目构建为本地 `program.js`，将 Controller 项目构建为 `program.js` 与可导入的 Task v1 Candidate JSON；**构建和导入仍不意味着已通过 Chrome 验证或已安装**。

- [多文件 ESM 与 AI 编辑/发布规则](docs/architecture/browser-framework/program-project-authoring-r1.zh-CN.md) ｜ [AI 发布 Skill](.agents/skills/opendesk-program-publish/SKILL.md) ｜ [示例程序](examples/programs/page-heading/README.md)
- [多文件 Page/Controller/资源 Demo](examples/programs/README.md) ｜ [Program API 中文说明](docs/framework/sidebar-project-api-r1.zh-CN.md) ｜ [文件夹与图片资源接入设计](docs/architecture/browser-framework/sidebar-project-intake-r1.zh-CN.md)

- [一页读懂脚本、依赖、执行与安装（D2）](docs/architecture/browser-framework/userscript-framework-quickstart.zh-CN.md)：先看这篇，避免把「已接线」「组件测试」「真实 Chrome」混为一谈。
- [Browser Framework 架构与 ChromePage](docs/architecture/browser-framework/README.md)：完整框架职责。
- [默认全网站权限、插件可选 API 与 Chrome 授权边界](docs/architecture/browser-framework/site-permission-onboarding.zh-CN.md)：安装时请求全站访问，额外原生 API 按可信用户手势启用，SDK/任务依然独立审批。
- [现代 Page API：Locator / fill / waitFor / page.observe](docs/framework/modern-page-api.zh-CN.md)：Controller 新任务的默认写法及安全边界；[R5.2 组件证据与真实 Chrome 待验收项](docs/framework/workstreams/r5-2-modern-page-api-acceptance.md)。旧 `page.type` 的追加语义保持兼容。
- [D1 依赖 ADR](docs/architecture/browser-framework/userscript-dependencies-d1-adr.zh-CN.md)：@require、哈希、授权与缓存的细节。

**现在可做**：编辑页脚本、识别标准 @require、明确审核并锁定内容字节、进入不保存草稿的 USER_SCRIPT 预览代码路径；具备定向组件和双构建 CI。**尚未验收**：真实 Chrome 用户流程与断网运行。**尚未正式实现**：Page Program 的自动匹配安装、启停、重启注册对账。生成 register 描述符不等于已安装任务。

Controller 的 @require 不会被偷偷下载并运行进 Worker 或 Service Worker；第三方脚本仅进入受控 USER_SCRIPT 页面环境。

## 历史：02A 环境交付范围

独立Chrome MV3工程，当前交付范围为02A基础环境。工具窗口可重复打开/聚焦，固定包内classic健康脚本绑定明确tab/frame/document。采集模块显示“尚未接入”；生产运行、停止、恢复、IDB、下载回执与授权待02B，选区与模板采集待03。

## 统一网页交互测试入口

人工检查 DOM、按钮、输入框、现代 Page API、Sidebar 草稿、真实 HTTP GET 和 Locator 专项测试时，**唯一标准页面**是 [`examples/tasks/demo-form.html`](examples/tasks/demo-form.html)（七组场景、左侧导航和可重复 Locator Fixture，见 [R8 Browser Test Lab 规格](docs/framework/browser-test-lab-r8.zh-CN.md)）：

```sh
python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks
```

然后打开 **http://127.0.0.1:43111/demo-form.html**。完整操作说明见 [示例 README](examples/tasks/README.zh-CN.md)，契约测试是 `node --test tests/environment/basic-browser-page.test.mjs`。临时原生验证服务的 `/fixture` 路由不是此页面的替代入口；不要复制旧会话中的临时端口用于人工验收。已有 `tests/prototypes/**/fixture/` 是测试运行器直接依赖的专用资源，除非连同相关运行器、断言、证据审查并确认无引用，否则不要清理。

## 本地构建

```sh
npm ci --ignore-scripts
npm run build
npm run build:dev
npm test
npm run check
npm run verify
npm run pack
npm run pack:dev
```

先构建再执行包安全回归测试。Node仅构建/测试，扩展运行无需Node服务。开发/生产包分别位于dist/development与dist/production；zip在artifacts。每次构建检查classic语法、资源闭包、CSP与禁止动态代码，产物hash recipe在docs/environment/build-*.json。开发使用外部source-map，生产不发source-map；不使用eval devtool、共享runtime或动态chunk。

## 环境安装与检查

开发浏览器的扩展管理页启用开发者模式，加载对应dist目录。点击扩展工具栏入口打开一个工具窗口；并发重复入口复用同一窗口。扩展在安装/更新时请求全部网站访问和核心浏览器 API。工具窗口的“授权并创建检查页”仍在用户点击中核验或恢复被 Chrome 限制的 origin 权限，并新建专用HTTP(S)标签；原页面不翻页。健康检查只返回readyState与目标绑定，不读取业务数据。原页面检查依赖工具栏点击获得的activeTab，不能假定该权限转移给新tab。目标重载/关闭/跨origin、站点权限撤销或受限页面会明确报错，不自动重新绑定旧文档。

静态选区入口agents/selection-entry.js只声明MODULE_NOT_INSTALLED。健康脚本文件的求值返回值从未被当作选区结果，真实HEALTH消息才构成环境通信证据。

## 后续接口与责任

src/run-host.js固定导入src/features/scraping/index.js一次。createScrapingModule的注入参数及返回方法遵循docs/contracts/contract.json；本阶段只有mountToolPanel/dispose与明确缺席handshake，所有业务方法抛MODULE_NOT_INSTALLED，底座参数为null。02B在同一入口实现生产controller与唯一公共服务；03只填领域模块和UI。不存在第二owner/broker/DB或模拟成功流程。

docs/contracts为阶段01冻结设计与来源证据，当前工程不改写它。来源三项目只读；docs/environment/source-state.*记录baseline/overlay与live差异。最终docs/environment/handoff.json记录真实测试与共享文件移交。CFT环境验收、普通Chrome120/稳定版验收和完整产品验收分开标记；最低120声明是拟定版本，不是已测试支持承诺。
