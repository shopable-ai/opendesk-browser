# OpenDesk Browser

**定位：Chrome MV3 的浏览器自动化与网页增强工作台。** 跨页面操作走 Controller / RunHost / ChromePage；页面 JavaScript 走 User Scripts API 的 USER_SCRIPT。两者共享可信宿主，但不是同一个运行环境。

## 当前框架与真实进度（先读这里）

**日常操作首选：[保留 Sidebar R6 的单文件运行与多文件项目使用指南](docs/product/program-development-dual-format-and-sidebar.zh-CN.md)**。此文档明确三页签原样保留、旧有按钮位置和「发现 → 导入」的真实路径；不要把示意图当作产品替代设计。

复杂脚本优先使用 **多文件 ESM + package.json 的 opendesk 字段**，传统单文件 JS 仍在 Sidebar「开发」直接运行。`npm run build:program -- <目录>` 将页面项目构建为本地 `program.js`，将 Controller 项目构建为 `program.js` 与可导入的 Task v1 Candidate JSON；**构建和导入仍不意味着已通过 Chrome 验证或已安装**。

- [多文件 ESM 与 AI 编辑/发布规则](docs/architecture/browser-framework/program-project-authoring-r1.zh-CN.md) ｜ [AI 发布 Skill](.agents/skills/opendesk-program-publish/SKILL.md) ｜ [示例程序](examples/programs/page-heading/README.md)

- [一页读懂脚本、依赖、执行与安装（D2）](docs/architecture/browser-framework/userscript-framework-quickstart.zh-CN.md)：先看这篇，避免把「已接线」「组件测试」「真实 Chrome」混为一谈。
- [Browser Framework 架构与 ChromePage](docs/architecture/browser-framework/README.md)：完整框架职责。
- [现代 Page API：Locator / fill / waitFor / page.observe](docs/framework/modern-page-api.zh-CN.md)：Controller 新任务的默认写法及安全边界；[R5.2 组件证据与真实 Chrome 待验收项](docs/framework/workstreams/r5-2-modern-page-api-acceptance.md)。旧 `page.type` 的追加语义保持兼容。
- [D1 依赖 ADR](docs/architecture/browser-framework/userscript-dependencies-d1-adr.zh-CN.md)：@require、哈希、授权与缓存的细节。

**现在可做**：编辑页脚本、识别标准 @require、明确审核并锁定内容字节、进入不保存草稿的 USER_SCRIPT 预览代码路径；具备定向组件和双构建 CI。**尚未验收**：真实 Chrome 用户流程与断网运行。**尚未正式实现**：Page Program 的自动匹配安装、启停、重启注册对账。生成 register 描述符不等于已安装任务。

Controller 的 @require 不会被偷偷下载并运行进 Worker 或 Service Worker；第三方脚本仅进入受控 USER_SCRIPT 页面环境。

## 历史：02A 环境交付范围

独立Chrome MV3工程，当前交付范围为02A基础环境。工具窗口可重复打开/聚焦，固定包内classic健康脚本绑定明确tab/frame/document。采集模块显示“尚未接入”；生产运行、停止、恢复、IDB、下载回执与授权待02B，选区与模板采集待03。

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

开发浏览器的扩展管理页启用开发者模式，加载对应dist目录。点击扩展工具栏入口打开一个工具窗口；并发重复入口复用同一窗口。工具窗口的“授权并创建检查页”在用户点击中请求origin权限，新建专用HTTP(S)标签；原页面不翻页。健康检查只返回readyState与目标绑定，不读取业务数据。原页面检查依赖工具栏点击获得的activeTab，不能假定该权限转移给新tab。目标重载/关闭/跨origin、站点权限撤销或受限页面会明确报错，不自动重新绑定旧文档。

静态选区入口agents/selection-entry.js只声明MODULE_NOT_INSTALLED。健康脚本文件的求值返回值从未被当作选区结果，真实HEALTH消息才构成环境通信证据。

## 后续接口与责任

src/run-host.js固定导入src/features/scraping/index.js一次。createScrapingModule的注入参数及返回方法遵循docs/contracts/contract.json；本阶段只有mountToolPanel/dispose与明确缺席handshake，所有业务方法抛MODULE_NOT_INSTALLED，底座参数为null。02B在同一入口实现生产controller与唯一公共服务；03只填领域模块和UI。不存在第二owner/broker/DB或模拟成功流程。

docs/contracts为阶段01冻结设计与来源证据，当前工程不改写它。来源三项目只读；docs/environment/source-state.*记录baseline/overlay与live差异。最终docs/environment/handoff.json记录真实测试与共享文件移交。CFT环境验收、普通Chrome120/稳定版验收和完整产品验收分开标记；最低120声明是拟定版本，不是已测试支持承诺。
