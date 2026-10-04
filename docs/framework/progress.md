# OpenDesk Browser 通用框架迁移 Goal 进度

## 当前真实状态 — 2026-10-03T09:00:42.131909+00:00

阶段0与F1已通过，唯一owner为 `01a1007d-556c-7783-b5dd-c09312a10236`，Goal active。双包已用原构建体系build/pack/verify，77源码输入无漂移；syntax71与392/392组件测试通过。production SW252486 bytes、development SW513045 bytes均在原预算内，未放宽预算或CSP。

当前F2 production候选 `552d3b3fe7cfb8f196142954659702b8440a6acf517e15bde959c7c7beff9f89`；development候选 `1527fb90d335e70690aba5035cb933c1ad24a5ec8d3ea5397f57402eeaa6bc60`。SDK四组合原生验收正在执行；production/138真实127.0.0.1授权已由Main CUA允许，工具显示选定精确document installed=true，尚不是独立B05通过。

接续：SDK原生矩阵 → 控制脚本真实入口及下载落盘 → CP1与独立B05 → 同一最终包原始603及明确增项/F3顺序独立审查。原603和19明确增项未因本次组件/安装证据增加产品PASS；nativeB05=false、F3=false、finalProductPackageSha256=null。同profile真实浏览器重开寿命仍NOT_TESTED，全局launcher不允许复制profile。

以下既有记录按其日期保留，历史等待状态不再构成当前门禁。


本文件由唯一账本 source-compatibility-ledger.json 的原分母、产品状态和 prototypeMechanismEvidence 派生。原生 Goal active；公共 writer 01a0fda9-8a86-7f72-89be-e292ffc94ed4。

有效方案 M5-C1 round6：da443272…；同候选独立 Architect98 / Critic98 APPROVE，方案门已通过。F1机制门仍未通过，F2产品迁移未放行。

72来源原ID/hash、48成员、191必需合同（184正能力/7受限边界）、183 SDK/服务子项、63资源子项及603必选产品用例均保留。成员runtimePass 0/48；必需合同产品通过0/191；产品用例0/603。103项排除/延期不计成功。原型通过也不计产品迁移完成。

|关键任务|旧能力与交付|当前真实状态|
|---|---|---|
|K0|主计划、逐项映射、兼容决定、同候选方案审批|完成，round6正式双批准|
|K1|控制脚本Worker与网页userScripts执行机制|修复后完整双版本已冻结；同union独立Architect已APPROVE/CLEAR 12/12；顺序后续Critic/code/function进行中|
|K2|后台公共服务、唯一数据库、授权与broker/SW实际装配|等待K1真实资格；R1–R8共9个回归已实际red，storage实施准备已完成|
|K3|48成员、每run page/context、控制脚本运行和结果|待K2；尚无产品迁移通过|
|K4|独立页面SDK、短服务、工具及必要资源|待K2；必须无controller单独验收|
|K5|现有工作台保存/执行/停止/结果/下载入口|待K3/K4；验证同一框架实际集成|
|K6|同一最终production包逐项验收与独立确认|待前项；603必选、1000轮/10重连/2禁插件、真实下载hash等均未完成|

当前F1合并候选 a9ce67f8… 绑定17份源码快照、130份实际证据和12机制合同。控制源码4666d1e…在真实138.0.7204.183与154.0.8037.92各56/56 PASS；同源码原生权限Promise期间stop回归，两版首次迟到dispatch为0、服务器导航请求为0，后续合法run正常。DOM资源取消测试在实际pageWaits=1后停止。原711f26eb候选46 PASS和CR-F1-CTRL-001真实独立HIGH均保留，待当前同候选独立关闭。3s物理终止合同已批准，原严格2s失败保留。

页面源码f29dc4af…同两版各102项正向观察、9项保留原生诊断/旧历史合同FAIL；批准合同的4子项24真实情景无缺失或当前失败；102正向记录中4项仅assessmentOnly，不增加原生执行数；最终pending/monitor/timer/rawPending等资源均为0。作者userScriptsRequiredCasesPassed=false原样保留，独立复核尚未决定F1资格。未观察到的原生OFF→ON历史不保证回溯取消；该限制经round6批准，原expected和反例保留，不能记旧历史fence已实现。真实观察OFF、origin/自有grant、取消、超时、文档/宿主失效仍要求单调fence。

backendPrototypePassed=false；fullImplementationReleased=false；frameworkFunctionalMigrationComplete=false。产品代码未提前修改，历史17与R1–R8仍open。

下一项具体交付：精确同union独立资格通过后，立即修复嵌套schema引用、封闭字段与日期校验，升级唯一数据库并接入唯一后台broker；不再新建方案轮次或重复全库审计。旧能力对应见 migration-map-v5.md；测试/预期见 test-spec-v5.json；依赖/写范围见 execution-tasks.json。


## 2026-10-02T23:14:23.717624+00:00 — F1通过，F2核心迁移开始

同一最终原型候选 a9ce67f85964f2512212430d56b488b5b0e2c11f6afdff2ea562428c3e77da66 经 Architect、Critic 顺序独立复核均12/12、零阻塞；168项绑定无漂移。K1完成，K2开始：协议R1/R2/R7、唯一数据库v2及R3–R8运行状态修复。原603产品案例及F3附加门禁全部保留待验收，未增加产品PASS。

## 产品续接检查点（2026-10-02，新对话执行入口）

阶段0/F1已通过，F2产品接线继续；K3/K4模块已存在，K5/K6未完成。最新主检查：syntax64、foundation122/122、K2/K4 75/75，输入无漂移；不是F3或主SDK原生验收。参见 `product-continuation-checkpoint.json` 和 `evidence/continuation-20261002/verification.json`；原始603项未由本检查点关闭。下一步是唯一broker/sessionTyped/原生生命周期、固定打包入口、控制主接线、独立页面SDK及同包验收。

## 基础能力测试现状更新

当前syntax65通过；foundation+K2/K3/K4 208/210，两项单独重跑1/2；environment16/20仍受旧dist最低Chrome120阻断。源码已有sessionTyped及SDK原生失效事件接线，尚需真实原生验收。旧122/122与75/75不是最新源码结论。见 `basic-capability-test-entry.md` 与 `evidence/basic-capability-readiness-20261002/verification.json`；F3及原603关闭状态不变。

## 当前续接执行：F2实际接线

唯一公共owner为 `01a1007d-556c-7783-b5dd-c09312a10236`；保留阶段0/F1，176条冻结文件绑定全部匹配。共享SDK authority、原生session typed storage及生命周期已写，43/43事务与回调回归通过并保留红日志。控制routes已接入同authority/broker，现包过期，需主接线稳定后重建。原603 caseResults和分母历史未变；明确增项16条仅组件通过、原生待验收。SDK真实权限UI诊断尚未完成，F3=false。证据见 `evidence/f2-shared-integration/verification.json` 与 `state-transition.json`。
