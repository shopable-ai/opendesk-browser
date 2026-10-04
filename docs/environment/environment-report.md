# 02A 环境工程交付

状态：ready（仅环境范围）。唯一产品目录 /Users/shopme/Documents/workspace/opendesk-browser。合同 1.0.0 / 1486ff9c442807c0d447e542252830731faeede5f81cd685c5f146daecdba2a1。

可用功能：独立MV3扩展、可重复开发/生产构建打包、单例工具窗口、固定classic健康探针及精确tab/frame/document准入、原页面不导航、新诊断目标需要实际站点授权。src/features/scraping/index.js准确显示MODULE_NOT_INSTALLED；src/run-host.js仅工程入口。

工程采用01已批准的原生MV3/JS ESM/webpack版本；源窗口交互意图映射EXT-R01。其余环境代码为新实现，没有复制旧SDK、ListSelector或todo源码，没有修改三原项目、01或⑤证据。初次审计442baseline/23delta；末次复核540既有路径、13项自初次审计后独立变化。01合同树504文件、24artifactIndex与675delivery artifacts均保持原hash。02B/03复用前须刷新来源，不覆盖dirty。

验证：20/20单元和对抗回归通过；语法检查、包内classic AST/CSP/资源和动态代码扫描通过；开发/生产重复构建及ZIP字节一致。普通Chrome Google Chrome 154.0.8037.93 实际加载当前生产hash，8项环境烟测通过（单例、认证document/nonce、重复初始化、reload/closed/restricted拒绝、观察到的工具JS错误为空）。独立⑥最终包复测：passed，普通Chrome154/CFT149各开发/生产25项，共100实际case；独立最终审查：APPROVE。

production: efaab5e9d0fe8e971eb73898888d4efd1e993ce7fa5c8db4a1603fefbf03328b
development: 2867a88ab02272f1b21a368944508629d9654d49940ddb8cacaa319dafcd4fd3

复现：npm ci --ignore-scripts --no-audit --no-fund；npm run build；npm run build:dev；npm run pack；npm run pack:dev；npm test；npm run check；npm run verify。测试依赖先构建产物。Node用于开发/构建/测试，消费者运行不需要Node或本地服务。

尚未实现：生产RunHost/PagePort、journal/停止/恢复、IDB stage/seal、download回执、授权账户，以及选区、字段、模板、分页与采集。Chrome120最低版本与原生人工permission prompt待后续验收；CFT/自动化环境通过不能替代完整产品普通Chrome验收。后续只能串行启动02B，03尚未放行。

共享入口：manifest.json、package*.json、webpack.config.cjs、scripts、src/sw.js、src/environment.js、src/run-host.js、src/agents、ui。02A移交后停止写这些文件，02B接管公共底座；03接入src/features/scraping固定槽。
