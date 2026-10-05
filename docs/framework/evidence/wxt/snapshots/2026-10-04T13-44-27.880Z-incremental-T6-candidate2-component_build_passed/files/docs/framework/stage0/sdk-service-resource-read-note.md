# SDK、后台公用服务与资源限定读取说明

assemblyStatus: **final-complete**。本轮作者资料已落盘，主作者可开始整合；未评审自己的方案，未改产品、主账本、主计划或门禁。

交付：[sdk-service-resource-draft.json](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/stage0/sdk-service-resource-draft.json)。SHA-256：`529c7271f811e00393b43676b35ade1fb290f9cb1e164974fc0ad95a26f00dec`。

## 范围与建议分母

- capabilityItems 169：已有58项保留，仅修正分母分类及明确错误/全局安装建议；补103个后台逐符号子项、5个注入辅助子项和3个dataURL/Blob/input驱动子项。
- 能力范围：core 116（110正向合同、6纯拒绝合同）、business-deferred 34、excluded 19。generateEventId、codec、relay、DeviceType等正向功能不算guardOnly；缺失Fingerprint等纯拒绝单列，拒绝通过不能代表正向功能完成。
- resourceItems 63：core 13、business-deferred 5、excluded 45。fileDispositions逐项保留实际72来源ID/path/hash/currentDecision；另外15个闭包外依赖/缺失/动态消费记录放closureExtras，不增为冻结来源。
- scopeDenominator建议必需迁移义务 **129 = 116能力 + 13来源资源映射**，逐ID列明；7项cookie/upload驱动与原48成员重叠，不虚增公开API。4个拟产物单位为SDK-main、relay、SW、manifest，两种构建模式共8条目标路径，实际产物hash未知。
- business-deferred明确不进必需迁移分母；excluded同样不进。required case共264项，包含延期/排除/PROV边界义务，不能把case数量当正向功能分母。整体Goal分母由主作者去重整合并冻结，本稿未改主账本。

## 已收口的后台与资源表

后台对network四方法、AppStorage/AppLocal各操作、notification及生命周期、cookies各驱动、JSON与错误回程、设备信息/未支持设备typed拒绝、server检测、dataURL/Blob/input分别写原符号/行号/hash、原行为、修正/限制、确切拟模块、产品调用链、T任务/F阶段依赖和具体case。没有用整个background延期代替公用服务；远程socket、CSDN、时间统计等业务逐符号延期，代理/历史/旧Quasar容器等排除。

13项必要来源资源分别有原consumer（若未定位明确unknown）、新consumer/目标、原文件实际hash、许可证据或unknown、load及failure case。SDK资源建议由`src/framework/sdk/entry.js`编译，`src/platform/page-port/sdk-injection.js`按精确document加载固定MAIN SDK与ISOLATED relay；这些是作者建议的产品接线，尚未构建/连接。所有无本轮consumer的旧vendor/UI/CSS/字体/图片排除，无vendor复制。appendCSS无活跃调用而排除，旧环境业务分支为business-deferred。

保留F013 dom.ts、F014 detect-quasar.ts排除；F029 testMonkey为business-deferred，CMP06.F029.independent-semantics及PROV02.F029.deferred-bundle保持required边界case。不读取其完整内部业务、不算迁移成功。

## 可复核证据与unknown

已完整读取executor.md、goal-migration-v5.txt及实际位于docs/framework/continue-in-new-chat.md的续聊说明；其绝对路径及SHA-256保留在JSON evidence。来源基于source-compatibility-ledger.json实际72条与冻结evidence/upstream-v3原migration-map/public-api-contract；引用已落盘execution-plan.md、compatibility-delta-v5.md。只读限定SDK/background/工具/事件/注入消费闭包，以及必要许可头/声明。直接import的cool/utils/index.ts只读sleep 296–302行，其resolve(true)与SDK sleep的undefined分别记录。

本轮72来源实际hash均与冻结一致（72 same / 0 drift / 0 missing），169个符号锚点已校核；这是文件字节/限定符号证据，未抹除历史153/7/4或11/6观察，未宣称全库语义审计。

- 收口补充（主作者本轮提供的已读证据）：`/Users/shopme/Documents/workspace/todo-user-vue/LICENSE`为MIT，Copyright (c) 2021 cool-team-official；主作者将在canonical许可记录纳入真实path/hash，产品打包必须携带notice。本草稿资源license字段中的unknown保留先前有限读取时的观测，整合以canonical更新为准；未重新搜索或扩大读取。5个被排除vendor的局部MIT头不等于各完整资源许可闭合，vendor仍全部排除，testMonkey局部vConsole MIT不覆盖整包。
- FingerprintJS、3个业务脚本和96图标源码未取得；缺指纹明确E_RESOURCE_UNAVAILABLE，getAppIdInfo整体reject。编译路径缺源不推定旧构建包不存在。
- `src-bex/bridge.ts`仍unknown/未找到，不能与F006 brige.js混同；实际加载辅助符号已在F021逐项列明。F008旧loader consumer unknown，新固定SDK entry是具体建议。
- SDK/relay拟入口、产物hash及产品可达性unknown/未实现；资源ready必须基于真实load/执行/Hello。运行时资源错误建议E_RESOURCE_UNAVAILABLE并带stage；codec统一E_VALUE_SERIALIZATION并带stage；同名全局冲突具体建议E_SDK_GLOBAL_CONFLICT，没有以“主作者以后决定”替代语义。
- Quasar远程字体及testMonkey动态图片hash/许可/白名单unknown，随父资源排除/延期；本轮不联网取得。服务端实际model为unknown。

本地JSON回读验证通过：根字段/唯一ID/72来源hash/169锚点标记/每case四字段/延期分母/必要资源consumer-load-failure字段。全部能力及资源为mapped/not-tested/runtimePass=false；264个case定义，实际执行0、产品PASS 0、构建及原型0、独立评审0。此次验证只核作者资料完整性，不是方案审批或产品验收。
