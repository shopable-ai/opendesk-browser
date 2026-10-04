# 四旧公共服务实际实施后的串行交接

交出聊天 `01a10654-4d29-7cc0-8cf3-e491cf07f9bf`；接续聊天 `01a1067b-a17b-7870-8ca4-92af03c934f5`。已通过 read_thread 完整核对新聊天中人类的原始移交与互相协调授权。

**唯一产品写权已释放，可由接续聊天登记。无在途产品写入、构建、测试或本轮浏览器/服务器操作；本聊天原生 Goal 已按人类停止新增执行要求暂停，未完成，不恢复前任旧 Goal。** 所有本聊天子代理已关闭。独立协作聊天已确认四服务原生轮尚未启动：没有 Chrome/launcher/HTTP/CDP/CUA、PID/profile、native case 或截图，窗口已撤回。本聊天从未启动浏览器或服务器。见 [进程/窗口交回](handoff-process-check.json)。

## 本轮实际交付

沿 WXT 0.21.4/Vite MV3，实现以下真实产品接线，没有恢复 webpack、初始化 Git、新依赖、第二底座或运行器。

|旧功能/文件|实际新实现与消费者|本轮结果|待验/兼容边界|
|---|---|---|---|
|background.ts `bridge.on('log')`|registry四项schema→entry `service.log`/`service.bridge.send`→唯一SDK broker→background driver→同journal/result回程|组件证明一次安全sink、原Promise own-undefined、重复同回执、冲突拒绝、unknown恢复不重放；已进入生产包|原生NOT_TESTED；sink仅固定事件名/UTF8字节数/data项数，不输出旧正文|
|background.ts `getTime`|同入口→可信broker clock|组件clock=0实得0；恶意额外字段被empty schema拒绝；已打包|原生有限值/t1..t2待验|
|background.ts `bexUrl`；my-content-script.ts:129 `.data.url`|entry bridge→driver runtime.getURL；resources.js `getBexUrlByBridge`保留旧解构消费者|组件 `.data.url`准确；已打包|真实扩展根待原生验收|
|background.ts `requestResource`；my-content-script.ts:107 `requestResourceByBridge`|resources.js保留 `const bridge=service.bridge; let {data}=await bridge.send('requestResource',{url}); return data`；driver只读固定manifest|两资源实际清单、七旧alias→新MAIN组合包、bytes/SHA/UTF8校验；组件旧 `{data:{success:true,data:text}}` 与非法路径零fetch通过；已打包|原生/截图待验；不恢复远程文本执行；RESOURCE01.F021.getResourceByUrl正式ID保留|

逐项最短步骤、原调用、预期/实际、点击旧→新源码和检查日志见 [旧功能验收清单](acceptance-by-old-feature.md)。四项目前是**已实现/已打包、原生NOT_TESTED、最终F3未验**，没有安装截图冒充功能结果。

新增产品源码：

- `src/platform/chrome/background-services.js`：可信log/clock/runtime/固定资源驱动，pre dispatched/fence→effect receipt→post/fence；不把chrome-extension资源URL送入HTTP授权hook。
- `src/framework/sdk/resource-contract.js`：固定两路径、七旧alias、manifest路径。
- `src/framework/sdk/resources.js`：确切旧bridge读取消费者，导出到 `OpenDeskSDK.resources`；只读文本，不执行。

修改产品源码：`src/framework/sdk/{registry,service,bridge,entry}.js`、`src/platform/host/{sdk-broker,sdk-methods}.js`、`src/ui/tool-shell.js`。保留原18项SDK_METHODS，统一22项ADMITTED_METHODS供normalization/grant/Hello/admission/bridge.ready/tool授权UI。entry增加四方法/冻结bridge及私有service ABI；旧ABI缺四项E_SDK_GLOBAL_CONFLICT，新ABI重注入refresh/Hello。getTime/bexUrl原args交empty schema，不先丢字段。

构建/校验修改：`scripts/{build,verify-package,check-source}.mjs`。实际WXT输出后生成 `framework/sdk-resources.json`；严格schema、资产名单与两个实际资源SHA复算；保持11固定JS入口、原权限/CSP/WAR和预算。资源manifest不是WAR。新增 `tests/framework/k4-background-services.test.mjs`、`tests/framework/k5-package-four-service-resources.test.mjs`；`tests/framework/k2-sdk-broker.test.mjs`增加log一次效果/unknown回归。没有修改原native runner。

普通JS/控制器/旧网页facade的其他产品实现本轮未改；不要重复迁移前任已修的pin准入、错误引用、target Cookie授权和host回收。

## 实际包与身份

production文件树 SHA：`a24b4c7fff62a9ebbd97f5b2fe4fd20b7fafdd0cb6ab72fc9995babff346270d`。
production ZIP字节 SHA：`d9cf788f277517275846094f270bdcf315976a81c879b040bf074177d68c3b5a`。

当前 development 仍是前任包：文件树 `ea1a596897d713aa861463938cb908f05ad1216695baef9069f6a60e8c51f676`；ZIP `439f549fc5b432556e6fd8913377aed257b632c97a975769c745738ed0b3e323`。**未重新构建development，不包含本轮四服务，不能解释为当前源码双包通过。**

交接时product/input SHA：`cfc03abbda3c6243d7389478f5794af685f33e26109077e038e574f9b9481d4e`；verification/input SHA：`41b5d090b8f7b05872267b6af47ab7e22b4eab8c32f01ba8c5644b76292e4389`。完整路径、字节和各自SHA、两包文件树及ZIP在 [交接身份](handoff-candidate-identity.json)。此前candidate的d290/e1a等input SHA早于owner/checkpoint串行释放元数据，不作最新输入身份；实际可执行构建源逐文件核对与production build sourceInputs一致，`productionSourceDriftSinceBuild=[]`。

MAIN实际26347bytes、SHA `c124401bca4570129e27fb283a5f3628964063279cab4bf1af9c4b5457e99d3f`；relay实际14595bytes、SHA `2a2f57ddab6401ca881a3ebfece6de2f12864f5c6505032ebe4dad4c61ea7804`。SW260524bytes，小于未变的256KiB单入口预算。

已保存真实 [生产ZIP](opendesk-browser-production.zip)、[冻结manifest](frozen-production/manifest.json)、[资源清单](frozen-production/framework/sdk-resources.json)、[构建回执](build-production-receipt.json)、[pack回执](pack-production-receipt.json)、[strict包校验日志](verify-production.log)、[构建日志](build-production.log)。旧dist被后续覆盖也不能改这些证据。

相关组件/检查通过：四服务及SDK重注入/error/Hello相关结果 [sdk-components.log](sdk-components.log)；唯一broker日志语义 [log-broker-components.log](log-broker-components.log)；旧SDK接口兼容 [old-sdk-compat-components.log](old-sdk-compat-components.log)；源码检查 [source-check.log](source-check.log)。资源子代理报告纯组件53/53，详情对应新增资源清单测试，尚未形成独立native证明。不要由组件、构建或方案评分登记正式原生PASS。

## 保留的失败与接续工作

本轮未产生新的原生FAIL，也没有原生PASS。前任全部原始失败与未复验必须保留。原始列表、包身份和责任边界见 [前任最新交接](../wxt/p4-p5/handoff-20261004-to-old-features.md)。

- addScriptTag历史FAIL来自MAIN写/USER_SCRIPT读；后续同真实Worker48/48通过属于99d6候选，不删除原FAIL、不直接当本包PASS。
- 前任完整控制轮仍27项未同最终包整轮验收；终止定点6PASS/21NOT_TESTED与SDK17/17/18方法/同profile重启均归各自旧包/输入。
- `docs/framework/evidence/wxt/p4-p5/b05-native-diagnostic-20261004-0935/report.json`：3PASS/7FAIL/8NOT_TESTED，原raw-cdp/server/results/barrier-plan全保留。CP1精确callee.property断点、targetDestroyed/Hello恢复观察器及CP3 deadline补丁未原生复验；F018恢复KV启动观察空窗仍须按最新合同修。只读准备不算事务abort证明。
- 历史slot/pin host-close、权限和无限Worker原失败保留，后续定向证据不能消除最终同包要求。

新聊天已有人类更晚指令：**先完成功能与真实消费者，再集中验收，原生PASS不作接续功能实现前置门**。可直接接续普通JS版本/目标/终态/持久下载、旧网页AppStorage/AppLocal/axiosx/ChromeBridgeOperationCompleted、B05恢复观察器及模板独立性；只做必要语法/构建/最小阻断诊断。四服务组件/打包已完成，不要重造接口。

独立协作准备文件在 `docs/framework/evidence/independent-migration-20261003-01a1021b/four-service-native-acceptance-plan.json` 与 `four-service-native-observation-calls.mjs`。仅调用真实旧接口/观察结果，没有伪sender/实现/DB；语法通过，runner尚未组合，全部原生NOT_TESTED。

唯一ledger本轮仅更新四服务及旧资源consumer实现接入状态、旧→新链、owner/证据；正式603 case及19追加结果未改，F3仍false。wxt-status/progress/checkpoint/owner已消除旧writer指针矛盾；新writer登记后会改变元数据input SHA，重新记录身份即可，不应因此重复构建没有变化的源码。

[合同读取侧任务](contract-read-sidecar-report.md)记录已读正文与未完成递归附件；完整原始答复及hash receipt在本聊天子代理完成通知。暂停移交不能伪称全部引用闭包已经完整读取。原603+19、1000混合/10重连/2禁插件、故障矩阵资源baseline、Chrome138/stable及同最终包顺序独立F3的条件一项未减。

暂停/移交不是完成证书。本聊天此后保持只读，不自动恢复Goal、不再发起构建或浏览器。
