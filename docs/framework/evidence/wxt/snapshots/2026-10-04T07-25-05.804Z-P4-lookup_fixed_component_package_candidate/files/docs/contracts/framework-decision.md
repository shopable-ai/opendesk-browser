# 工程与框架决定

推荐原生MV3 manifest + JavaScript ESM源码 + 现有锁定webpack 5.95.0 / webpack-cli 5.1.4 / terser-webpack-plugin 5.3.10 / Terser 5.34.1。继续复用有效HTML/JS布局、CSS和选区模块，修补MV3与合同边界；不统一改写成React/Vue新应用或全量TypeScript。以上开发依赖在scrapyJs快照已有；目标工程仍需02A建立精简独立lock，不拷贝整个scrapyJs依赖树或复用旧bundle作为新runtime。

选择依据是当前需要一个Chrome扩展、保留可用交互、控制新增依赖，以及真实选区代码的隔离打包可行性。WXT并不强制TS或UI框架，也能生成IIFE；不采用它是当前迁移面和依赖边界的取舍，没有宣称性能更差或更难维护。

| 比较点 | 原生结构与必要打包（已选择） | WXT（暂不采用） | 改变决定的条件 |
|---|---|---|---|
| 原HTML/JS/UI复用 | 布局/DOM/事件契约保留，外置内联代码与静态资源路径逐项修复 | 可用JS和现有UI，但要适配entrypoints与HTML打包约定 | 多浏览器需求和开发流程收益足以抵消迁入面 |
| manifest/权限 | 单份人工可读manifest，SW/工具窗口/资源路径直接核验 | 入口和配置生成manifest，仍要审查最终权限 | 生成配置有可验证的单一所有权 |
| classic选区注入 | 每entry独立IIFE，内联runtime，禁共享/异步chunk | 官方content/unlisted也产IIFE，返回值/globalName需注意版本 | 同选区fixture最终产物行为、CSP和清理等价 |
| 资源/CSP | 包内HTML/JS/CSS，手动copy必要资源；devtool禁eval | 静态public/asset与Vite产物约定，不能绕过MV3规则 | 无远程/动态fallback，无多余WAR与权限 |
| 调试 | development静态包/外置source map + unpacked加载，显式错误投影 | 整合开发约定与入口管理；具体版本开发流程须实测 | 能改善可观测性而不永久保持SW活跃 |
| 打包与测试 | 精简Node构建，Script AST/classic VM探针与真实Chrome双版本测试 | 新WXT/Vite环境与锁文件适配，相同浏览器门禁仍必要 | 若引入，先提交依赖决策并重跑同一产物矩阵 |
| 依赖/维护 | 沿用已存在工具版本，02A创建工程基础、handoff后由02B唯一维护 | 当前在线v0.21入口/peer要求需维护；未安装或实测 | 原生链不能闭合资源/产物时提供实际失败证据再换 |

官方资料对照见official-evidence.md；WXT的ESM页面列出content/unlisted IIFE与background模块策略，webpack的output.iife控制包装。在线文档不等于锁定5.95.0的全部选项，不能照搬新版本功能。[webpack Output](https://webpack.js.org/configuration/output/)、[WXT ES Modules](https://wxt.dev/guide/essentials/es-modules.html)、[WXT Migration](https://wxt.dev/guide/resources/migrate)。维护速度、安装成本、体积/性能优劣均未测量。

## 独立可行性探针（非产品验收）

在当前聊天临时work中，用快照ListSelector.js作为entry，调用来源现有node_modules中的锁定webpack/Terser，不修改来源，不安装依赖。report为classic-probe.json。初次试探`target:chrome120`被webpack5.95.0拒绝，随后用web/es2022目标；这不是Chrome120兼容认证，正式最低版本仍必须实际测试。

| 产物 | 实际字节数 | classic AST | 额外JS分块 | loading状态VM初始化 | 整文件求值 |
|---|---:|---|---:|---|---|
| 未压缩 | 124873 | 成功，无import/export/dynamic import | 0 | ListSelector/initListSelector为function，style1次 | undefined |
| 压缩 | 45146 | 成功，同上 | 0 | 同上 | undefined |

只核了原选区入口的初始化和语法闭合，未测试真实DOM选区、取消、overlay清理、严格CSP或Chrome scripting路径；未构建WXT或比较性能。正式通信使用agent握手/消息与requestId，不能依赖executeScript.files的result携带业务结果。版本/hash和局限在报告内；原始探针产物只留临时work。

## 推荐目录与依赖方向

下面是02A/02B/03应创建的结构，目前只存在docs/contracts与contracts/fixtures及来源证据。02A基础环境和02B关键迁移/可靠底座已按最新用户指示分开验收，已核v5 registry：01→02A→02B→03→04；⑤为01的并行只读审计前置。

```text
opendesk-browser/
  manifest.json, package*.json, webpack.config.cjs                    [02A创建→handoff后02B接管]
  scripts/{build,pack,verify-package}.*                               [02A创建→02B公共维护]
  src/sw.js, src/run-host.js                                         [02A工程占位→02B公共实现]
  src/platform/{host,target,page-port,journal,storage,downloads,entitlement}/ [仅02B实现]
  src/ui/tool.html, tool-shell.js, tool-shell.css                     [02A窗口壳→02B公共接入]
  src/agents/{health,page-agent}.js                                  [02A健康探针/静态槽→02B固定指令]
  src/features/scraping/index.js                                     [02A明确空槽→02B公共桥→03领域入口]
  src/features/scraping/{selection,compiler,templates,runner,formatter,ui}/ [03]
  contracts/fixtures/                                               [01设计→02B公共维护；03领域写集]
  tests/environment/, docs/environment/                              [02A]
  tests/foundation/, docs/{foundation,migration}/                    [02B]
  tests/scraping/, docs/scraping/                                    [03]
  tests/acceptance/, docs/acceptance/                                [04]
  docs/contracts/                                                   [01定版→02B唯一公共维护]
  dist/                                                             [02A构建→02B/03整合→04验证]
```

UI shell负责窗口、装载固定模块槽与持久投影；03的mountToolPanel填领域内容，保留旧布局并外置CSP不允许的事件脚本。selection在用户gesture下使用底座批准的source-target适配，原页面activeTab与正式run target分开。compiler不调用Chrome/IDB；runner只依赖PagePort/storage/runCommands；formatter只读sealed游标、返回卷字节，Blob和downloads由底座管理。UI组件不拥有run loop。

依赖方向：UI→RunHost/模块接口，RunHost→领域runner，领域runner→固定PagePort/存储接口，PagePort→SW→固定agent；所有持久事实→唯一storage服务。两个编译方向独立：ESM源码组织，classic agent/选区最终独立包；extension HTML使用外部包内script，SW拟定静态classic bundle（以后若改静态ESM须更新manifest和资源测试）。无需Node产品服务、Playwright产品执行器、offscreen保活或MAIN world桥，首版仅ISOLATED DOM。

## 决策边界

已选择：单扩展、保留有效HTML/JS、原生manifest/既有构建工具、可见RunHost、短命令SW、唯一IDB、精确执行tab、stage/seal与按attempt回执。

待验证：Chrome120与本机当前普通Stable实际版本、最终CSP/资源、完整选区取消和目标隔离、自然SW失联与窗口冻结、真实下载race/分卷/quota、签名授权和大数据峰值。相同fixture压缩等价需要完整行为测试，本探针不足以证明。

后续范围：桌面OpenDesk只能未来通过版本化PagePort/Artifact接口提出独立适配，不现在引入nativeMessaging、本机host、后台续跑或AI执行。任何桌面协议必须另立权限/生命周期/部署设计，不能悄悄添加第二owner或DB。AI建议最多未来作为需用户确认的数据草稿，首版没有AI执行依赖或远程JS。

02A建立并验证打包/资源/空业务窗口/注入槽，02B接管公共runtime并按第五复用清单迁入能力；同一个目标目录顺序写入，不创建第二工程。具体写集与工作包按task-breakdown及已核v5调度提示核对。

已收到⑤真实最终handoff并核17component hash；54复用/29浏览器边的主审选择见reuse-decision。CodeGraph与专用审计skill仅在开发工具环境，不进目标lock或产品包。目标目录的公共作者/根文件交接按v5；固定captured代来源可迁移，25个live差异先审后采纳，不默认跟随SDK同步。
