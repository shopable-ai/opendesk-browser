# OpenDesk Browser

## 先理解框架怎么用

**两个核心用法：保存一份自动化脚本，在明确网页上运行；或由网页通过 SDK 请求扩展提供 HTTP、存储等受控服务。**

从 [Browser Framework：使用场景、语义调用与架构入口](docs/architecture/browser-framework/README.md) 开始。它先说明 `page.title()`、网页 `axiosx.get()`、脚本运行按钮与 DevTools 调用的区别，再对应 Legacy / Current / Target、状态与权限 owner、迁移地图和验证矩阵。

> 以下内容保留原 02A 阶段的环境交付记录，不能作为全部当前产品状态。当前已存在的 Controller、Page SDK、authority、IDB 与运行接线，以及 P1 候选的范围，见上述架构入口；源码存在不代表全部浏览器验收通过。该文档更新不改变历史证据或产品完成标志。

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
