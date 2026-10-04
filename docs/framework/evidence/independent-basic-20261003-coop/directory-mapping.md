# 独立只读目录迁移关系核对

主工程：/Users/shopme/Documents/workspace/opendesk-browser；旧源码：/Users/shopme/Documents/workspace/todo-user-vue/src-bex。依据指定既有映射作有限核对，未重新全库审计。源码取样最终复核时间为 2026-10-03T10:12:15Z。本作者只写本目录报告及读取收据；未修改共享 src/tests/runner/build/gates/ledger/handoff，未构建、执行测试、启动浏览器或联系其他聊天。产品 writer 仍属旧聊天。

**主要事实：旧底座已被拆分为新 SDK、公共服务及控制链，不能称为旧目录整体复制或产品迁移全部完成。** 18 个指定旧文件的原字节 hash 全部与记录一致；其映射的 44 个去重目标中 40 个文件存在、4 个预定路径缺失。74 个“旧文件→现存映射目标”对的整文件字节比较，完全相同为 0；此项不排除片段或算法复用，也不构成历史 Git/版权相似审计。

“适配/替代”下述均指源码层对应；“未落地”指限定映射中未找到既定正向能力的等价入口；“排除/延后”沿用既有台账决定。文件存在、模块 PASS、产品原生 PASS 分别记述，不互相替代。

## 短目录映射

下表旧路径均相对 src-bex，新路径均相对主工程。

| 旧目录/文件组 | 现有去向 | 关系及真实差距 |
|---|---|---|
| 根 ChromePage.ts | src/framework/ChromePage.js、context.js → host/controller-methods、control/native-driver → packaged/page-session 或 user-scripts | 门面适配；共享 page/默认 active-tab 改为每 run 绑定版本和精确目标。48 成员来源对应不等于全部产品验收。[旧单例:1136](/Users/shopme/Documents/workspace/todo-user-vue/src-bex/ChromePage.ts:1136)、[新 context:19](/Users/shopme/Documents/workspace/opendesk-browser/src/framework/context.js:19)。 |
| 根 background.ts、my-content-script.ts、chrome-local-storage-api.js | src/sw.js、platform/host、platform/storage、run-host、framework/sdk、agents/page-relay | 拆分替代：SW 短服务、工作台/Worker 长控制、授权后固定 SDK 注入。后台和 content script 没有整体搬入；部分旧服务未落地。[broker 装配:8](/Users/shopme/Documents/workspace/opendesk-browser/src/sw.js:8)、[固定注入:59](/Users/shopme/Documents/workspace/opendesk-browser/src/platform/host/broker.js:59)。 |
| assets/js/core/ + Env.js、custom_event.js | src/framework/sdk/{bridge,http,storage,notifications,servers,utils,entry,transport,registry,service}.js；platform/chrome/storage；agents/page-relay | 七个 core 文件按职责适配，传输与特权后端替换。详见下表；旧名称存在不表示任意旧脚本/服务仍可执行。[SDK 装配:1](/Users/shopme/Documents/workspace/opendesk-browser/src/framework/sdk/entry.js:1)。 |
| assets/js/vendor、TraceTime*、detect_focus、controller/csdn；根 TimeReview.ts、controller/ | 台账当前 excluded / business-deferred，无本轮公共 runtime 映射 | 未迁入。assets/js/utils.js 的当前 scope 是 core，但只是限定 helper 对应，不等于旧工具全集迁入。[F011:8559](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/source-compatibility-ledger.json:8559)、[CSDN 延后:11041](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/source-compatibility-ledger.json:11041)。未扩读旧 vendor/业务源码。 |
| operate/ | src/framework/events.js、framework/utils/device.js | 常量值适配。SCRIPT_* dispatcher 在限定已读生产集合中仅有定义，未找到调用；设备业务事件明确拒绝。常量不等于 handler 接入。[events:5](/Users/shopme/Documents/workspace/opendesk-browser/src/framework/events.js:5)、[DeviceType:3](/Users/shopme/Documents/workspace/opendesk-browser/src/framework/utils/device.js:3)。 |
| utils/ | src/framework/utils/{device,network-info,script}.js；SDK entry；网络/Worker 底座 | UtilDevice 部分适配；UtilInfo facade 存在但网络信息未启用；formatJSON 接入，wrapAsync 仅定义；指纹正向能力受限。[helper 导出:99](/Users/shopme/Documents/workspace/opendesk-browser/src/framework/sdk/entry.js:99)。 |
| dom/、根 dom.ts | 当前 disposition=excluded，无新模块 | 历史 action=adapt-split 不是当前已实现。不得以早期计划认作已迁移。[F013:11146](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/source-compatibility-ledger.json:11146)、[F014:11267](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/source-compatibility-ledger.json:11267)。 |
| assets/css、head、img、env；icons、logo、.DS_Store、bex-flag | 当前本轮 excluded，无 runtime 消费映射 | 来源/资源记录保留；未迁入，不按“文件曾存在”算功能完成。未扩读这些资源；当前决定见 [fileRows:28](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/source-compatibility-ledger.json:28)。 |
| 根 manifest.json | 新 manifest.json + webpack entries | 合同替代：旧全站自动 content_scripts、泛资源声明改为用户授权和精确 document 的固定注入。源码/配置对应不证明最终包安装闭包。[旧声明:29](/Users/shopme/Documents/workspace/todo-user-vue/src-bex/manifest.json:29)、[新声明:7](/Users/shopme/Documents/workspace/opendesk-browser/manifest.json:7)、[构建入口:14](/Users/shopme/Documents/workspace/opendesk-browser/webpack.config.cjs:14)。 |

## assets/js 的拆分及加载关系

| 旧文件 | 新实际职责 | 适配、替代与未完成边界 |
|---|---|---|
| core/brige.js | [sdk/bridge:17](/Users/shopme/Documents/workspace/opendesk-browser/src/framework/sdk/bridge.js:17)、[sdk/entry:82](/Users/shopme/Documents/workspace/opendesk-browser/src/framework/sdk/entry.js:82)、page-port/codec、relay/transport | 保留旧回调名称与 PageBrigeCode 服务结果；新 pending 单次结算并清 Map/timer。executeInBg/executeScript 变为 E_CAPABILITY 拒绝，旧任意后台脚本执行未提供正向等价。[拒绝入口:86](/Users/shopme/Documents/workspace/opendesk-browser/src/framework/sdk/entry.js:86)。 |
| core/axiosx.js | [sdk/http:1](/Users/shopme/Documents/workspace/opendesk-browser/src/framework/sdk/http.js:1) → [sdk/service:10](/Users/shopme/Documents/workspace/opendesk-browser/src/framework/sdk/service.js:10) → platform/chrome/network | 四 HTTP 方法适配；BridgeUrl_Inject 映射为 url。config、origin/grants 与错误行为受约束；不依赖整个旧 axios.min.js 搬迁。 |
| core/appStorage.js | [sdk/storage:2](/Users/shopme/Documents/workspace/opendesk-browser/src/framework/sdk/storage.js:2) → [storage/repository:305](/Users/shopme/Documents/workspace/opendesk-browser/src/platform/storage/repository.js:305) | 旧后台 localStorage 替换为共享 IDB namespace KV；字符串化/missing=null 保留，clear 只清当前 namespace 的 user area。不是旧数据库数据自动迁移。[旧实现:134](/Users/shopme/Documents/workspace/todo-user-vue/src-bex/background.ts:134)。 |
| core/appLocal.js | [sdk/storage:8](/Users/shopme/Documents/workspace/opendesk-browser/src/framework/sdk/storage.js:8) → [storage/session:12](/Users/shopme/Documents/workspace/opendesk-browser/src/platform/storage/session.js:12) | 旧后台 globalThis 替换为 Chrome 浏览器 session + authority namespace，保留 typed undefined。寿命/作用域改变；不宣称 session 与 IDB 跨存储原子事务。[旧实现:142](/Users/shopme/Documents/workspace/todo-user-vue/src-bex/background.ts:142)。 |
| core/common.js | [sdk/notifications:3](/Users/shopme/Documents/workspace/opendesk-browser/src/framework/sdk/notifications.js:3) → [sdk/service:17](/Users/shopme/Documents/workspace/opendesk-browser/src/framework/sdk/service.js:17) → chrome/notifications | createNotify 的 string/body 投影适配；null/body 类型错误改为 typed 拒绝。原生通知权限/回程本轮未验。 |
| core/serverUtils.js | [sdk/servers:8](/Users/shopme/Documents/workspace/opendesk-browser/src/framework/sdk/servers.js:8) → chrome/network | 并发检查后选择最小可用 latency；旧 getFastestServer 按输入顺序等待并取首个 available，存在语义修正。旧六 core 自动注入列表没有 serverUtils，不能推定旧页端已自动加载。[旧选择:31](/Users/shopme/Documents/workspace/todo-user-vue/src-bex/assets/js/core/serverUtils.js:31)、[旧注入:148](/Users/shopme/Documents/workspace/todo-user-vue/src-bex/my-content-script.ts:148)。 |
| core/utils.js；assets/js/utils.js 的限定 helper | [sdk/utils:2](/Users/shopme/Documents/workspace/opendesk-browser/src/framework/sdk/utils.js:2) | sleep 有取消/参数校验；getFingerprint 存在但总抛 E_RESOURCE_UNAVAILABLE。指纹资源未批准/补齐，不计正向支持。F011 只沿已有映射核对，未扩读旧工具全集。[指纹限制:15](/Users/shopme/Documents/workspace/opendesk-browser/src/framework/sdk/utils.js:15)。 |
| Env.js | [sdk/bridge:4](/Users/shopme/Documents/workspace/opendesk-browser/src/framework/sdk/bridge.js:4) → [entry 全局安装:104](/Users/shopme/Documents/workspace/opendesk-browser/src/framework/sdk/entry.js:104) | CHROME_PAGE_TYPE=CHROME_EXTENSION 保留，随固定 SDK 安装，未逐文件复制加载。[旧值:3](/Users/shopme/Documents/workspace/todo-user-vue/src-bex/assets/js/Env.js:3)。 |
| custom_event.js | [agents/page-relay:28](/Users/shopme/Documents/workspace/opendesk-browser/src/agents/page-relay.js:28)、sdk/transport、framework/events | hid_*、active:true、原 detail 对象替换为 SDK 协议/typed 编码；旧 CHROME_PAGE_EXECUTE/chromeCustomEvt 只有明确拒绝，非旧业务 handler 正向迁入。[拒绝:32](/Users/shopme/Documents/workspace/opendesk-browser/src/agents/page-relay.js:32)。 |
| vendor / 时间追踪 / CSDN 等业务 | 当前 excluded / business-deferred | 不整体打包，不以 HTTP/DOM helper 已适配反推这些库或业务的 consumer、许可、产品行为已完成。 |

**旧运行关系（源码声明）：** [manifest:35](/Users/shopme/Documents/workspace/todo-user-vue/src-bex/manifest.json:35) 自动加载内容脚本 → [my-content-script:148](/Users/shopme/Documents/workspace/todo-user-vue/src-bex/my-content-script.ts:148) 逐文件插入六个 core → [axiosx:26](/Users/shopme/Documents/workspace/todo-user-vue/src-bex/assets/js/core/axiosx.js:26) 登记 Promise/派发事件 → [custom_event:9](/Users/shopme/Documents/workspace/todo-user-vue/src-bex/assets/js/custom_event.js:9) runtime 转发 → [background:102](/Users/shopme/Documents/workspace/todo-user-vue/src-bex/background.ts:102) 特权服务 → [background:716](/Users/shopme/Documents/workspace/todo-user-vue/src-bex/background.ts:716) 拼接活动页回程 → [brige:16](/Users/shopme/Documents/workspace/todo-user-vue/src-bex/assets/js/core/brige.js:16) 原 Promise。未执行旧扩展，不能仅凭旧 manifest 声明推断历史包实际运行结果。

**新加载链：** [tool.html:38](/Users/shopme/Documents/workspace/opendesk-browser/src/ui/tool.html:38) → [tool-shell 用户手势授权:106](/Users/shopme/Documents/workspace/opendesk-browser/src/ui/tool-shell.js:106) / [installSdk:121](/Users/shopme/Documents/workspace/opendesk-browser/src/ui/tool-shell.js:121) → [broker:59](/Users/shopme/Documents/workspace/opendesk-browser/src/platform/host/broker.js:59) → [tabs 固定注入:16](/Users/shopme/Documents/workspace/opendesk-browser/src/platform/chrome/tabs.js:16)。ISOLATED=agents/page-relay.js；MAIN=framework/sdk-main.js，由 [webpack:14](/Users/shopme/Documents/workspace/opendesk-browser/webpack.config.cjs:14) 将 sdk/entry.js 打包。不是继续注入旧 core/vendor 文件。

**新调用/回程链：** [entry:80](/Users/shopme/Documents/workspace/opendesk-browser/src/framework/sdk/entry.js:80) → [transport:63](/Users/shopme/Documents/workspace/opendesk-browser/src/framework/sdk/transport.js:63) → [relay runtime:70](/Users/shopme/Documents/workspace/opendesk-browser/src/agents/page-relay.js:70) → [SW:45](/Users/shopme/Documents/workspace/opendesk-browser/src/sw.js:45) → [broker SDK route:97](/Users/shopme/Documents/workspace/opendesk-browser/src/platform/host/broker.js:97) → [sdk-broker authority admission:41](/Users/shopme/Documents/workspace/opendesk-browser/src/platform/host/sdk-broker.js:41) → service/共享 storage → [valueWire 返回:67](/Users/shopme/Documents/workspace/opendesk-browser/src/platform/host/sdk-broker.js:67) → relay 固定返回事件 → [transport decode:30](/Users/shopme/Documents/workspace/opendesk-browser/src/framework/sdk/transport.js:30) → [bridge settle:77](/Users/shopme/Documents/workspace/opendesk-browser/src/framework/sdk/bridge.js:77)。installed:true、网页 ready()、原 Promise 交付、durable effect 各为不同事实，不能混算。

## 缺失路径与真实能力差距

| 缺失预定路径 | 已有替代源码 | 判定边界 |
|---|---|---|
| platform/chrome/screenshot.js | [control/native-driver screenshot:209](/Users/shopme/Documents/workspace/opendesk-browser/src/framework/control/native-driver.js:209) | 截图有源码替代；不因文件名缺失判断全部截图未实现，原生效果另验。 |
| platform/chrome/styles.js | [ChromePage.addStyleTag:80](/Users/shopme/Documents/workspace/opendesk-browser/src/framework/ChromePage.js:80) → [packaged/registry.addTag:98](/Users/shopme/Documents/workspace/opendesk-browser/src/scripting/packaged/registry.js:98) | 受限源码替代；包内 allowlist/CSS 限制与 load/error 不等于全旧语义支持。 |
| platform/page-port/sdk-injection.js | [broker.installSdk:59](/Users/shopme/Documents/workspace/opendesk-browser/src/platform/host/broker.js:59) → [chrome/tabs:16](/Users/shopme/Documents/workspace/opendesk-browser/src/platform/chrome/tabs.js:16) | 固定 SDK 加载已接线；旧 bexUrl/requestResource/任意 appendScript 正向能力没有因此补足。 |
| scripting/packaged/revision-resolver.js | [repository immutable revision/CAS:397](/Users/shopme/Documents/workspace/opendesk-browser/src/platform/storage/repository.js:397)、[pin/hash:419](/Users/shopme/Documents/workspace/opendesk-browser/src/platform/storage/repository.js:419) → [controller admission:269](/Users/shopme/Documents/workspace/opendesk-browser/src/platform/host/controller-methods.js:269) | 版本/pin 有源码替代；文件缺失不等于功能不存在，也不能仅据源码宣布原生版本场景完成。 |

[file-tasks.md 全文设计合同](/Users/shopme/Documents/Codex/2026-10-02/opendesk-design-audit-continuation-01a0fc85/outputs/file-tasks.md:1) 预定的 framework/assets/js/core/* 与 compat/src-bex/session.js、page-codec.js、storage.js 未按该位置落地，实际由 sdk/*、context.js、page-port/codec.js、storage/repository/session 承接。此为路径/职责对应差异，不修改设计合同或共享台账。既有行为表的 [123/130:16](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/evidence/continuation-20261003-current/source-behavior-map.md:16) 只是预定路径检查，不是 123 个产品能力通过。

明确未完成或受限：

- 旧 background 的 log/getTime/bexUrl/requestResource（811/816/970/987 行），新 [SDK_METHODS:102](/Users/shopme/Documents/workspace/opendesk-browser/src/framework/sdk/registry.js:102) 与 [entry.service:96](/Users/shopme/Documents/workspace/opendesk-browser/src/framework/sdk/entry.js:96) 未提供等价注册入口；console/Date/runtime.getURL/普通 HTTP 的邻近存在不能代替这些服务。
- UtilDevice 部分 helper 已从 SDK entry 接入；原生 Electron 信息拒绝，getAppIdInfo 无可信 extensionId 返回空对象，指纹受限。[device:8](/Users/shopme/Documents/workspace/opendesk-browser/src/framework/utils/device.js:8)、[appIdInfo:28](/Users/shopme/Documents/workspace/opendesk-browser/src/framework/utils/device.js:28)。
- UtilInfo facade 存在，但 [networkInfoEnabled:false:15](/Users/shopme/Documents/workspace/opendesk-browser/src/platform/host/sdk-broker.js:15) 与 [UI 禁选:60](/Users/shopme/Documents/workspace/opendesk-browser/src/ui/tool-shell.js:60) 表明当前未启用 IP 查询。
- formatJSON 有 [SDK consumer:100](/Users/shopme/Documents/workspace/opendesk-browser/src/framework/sdk/entry.js:100)；[wrapAsync:5](/Users/shopme/Documents/workspace/opendesk-browser/src/framework/utils/script.js:5) 与 [dispatchFrameworkEvent:8](/Users/shopme/Documents/workspace/opendesk-browser/src/framework/events.js:8) 在限定已读消费者集合中只有定义。没有把这一有限查找扩大成全库结论。
- 普通 controller 分支不编译模板是源码事实；[tool-shell:6](/Users/shopme/Documents/workspace/opendesk-browser/src/ui/tool-shell.js:6) 仍创建 [createEnvironmentHost:12](/Users/shopme/Documents/workspace/opendesk-browser/src/run-host.js:12) 环境采集模块，不能据静态分支认定“采集完全未注册”产品回归通过。

## 证据层级与最新产品进展

| 层级 | 已有事实 | 可证明的范围 |
|---|---|---|
| 源码与来源 | 40/44 映射目标存在；18/18 旧原文件 hash、129/129 规范化 excerpts、48/48 API 原字节 span 对应；74 对无整文件字节复制 | 来源与调用结构可复核，不等于接口全语义或产品验收。 |
| 历史模块 | [243/243 记录:11025](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/evidence/progress-20261003/current-verification.json:11025)、environment 20/20；shared oracle 43/43；K4 66/66 | 沿用已有报告，未重跑。现已读输入中 23 个有历史 hash 的文件发生变化，历史 PASS 不背书全部当前源码。K4 旧报告环境 16/20、4 失败仍保留；后来的通过不删除原失败。 |
| 产品最新说明 | 主线程用户明确更新：同包 prod138 真实 3 PASS——save/version/params、return 7、minimal page.goto/title/url durable | 这是最新产品进展，应保留，不再笼统称“没有任何产品 PASS”。本作者未独立读取这三项的新原生证据文件或包 hash；不能推广到其他场景、版本或最终 F3。 |
| 当前失败/剩余 | 用户更新：原始 runner 的 native 下拉选择失败已保存，主线程正在解决工具 | 失败尚未在本报告中获得关闭证据；未重试、修改 runner 或启动测试。 |
| 台账取样状态 | [603 原 case:52333](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/source-compatibility-ledger.json:52333) 为 not-tested/pass=null/packageHash=null；[19 附加 case:57292](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/source-compatibility-ledger.json:57292) 为 unit-passed-native-pending/componentPass=true，产品 pass/hash=null | 这是所读台账快照，可能尚未回填最新三项产品结果；不据此否定用户新证据，也不越权更新台账或宣布 F3。 |

F1/原生组件资格沿用 [既有行为表的层级记录:53](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/evidence/continuation-20261003-current/source-behavior-map.md:53)，没有重审或推广为最终产品 PASS。

## 完整读取收据、校验与完成边界

已存在的 [full-read-receipt-mapping.json](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/evidence/independent-basic-20261003-coop/full-read-receipt-mapping.json:1) 列 87 个完整读取输入的 SHA256、原字节大小、行数；JSON 文件另列递归值节点数、对象字段数、全 JSON Pointer 遍历 digest。两份指定 Markdown 有全行及表格单元遍历 digest。非 JSON 的 jsonTraversalNodes=null，未伪装为 JSON 节点。

| 指定完整材料 | 字节 / 行 | JSON 值节点 |
|---|---:|---:|
| source-compatibility-ledger.json | 2,282,490 / 57,541 | 49,014；另有 32,523 对象字段 |
| file-tasks.md | 7,888 / 25 | 非 JSON，全文逐行/单元遍历 |
| old-key-files.json | 116,211 / 1,717 | 1,383；另有 716 对象字段 |
| source-behavior-map.md | 438,819 / 318 | 非 JSON，全文逐行/单元遍历 |

台账全部 fileRows/apiItems/capabilityItems/resourceItems/sourceClosureExtras/caseResults/additionalCaseResults 及嵌套字段均解析遍历，不只读 summary；分母分别 72/48/183/63/15/603/19。capabilityItems 为 core 130、business-deferred 34、excluded 19。完整读取允许重复值机器去重，聊天输出节选不作为读取凭据。

129 excerpts 有 17 项仅 CRLF 行尾差异；规范化并仅裁剪末尾换行后全部一致。48 API 校验为 inclusive 原字节行 span SHA256，含原行尾。来源验证不构成新语义等价测试。最终复核时 87 个输入与各自读取 hash 一致；本保证只限取样窗口，不约束其他作者后续修改。

适用规则为用户提供的 AGENTS 契约及已读旧工程 AGENTS.md；使用 analyze 的证据/推断/未知分层。目录关系与明确源码限制的置信度高；未读取的新原生证据只按用户说明标记，不宣称独立核验。没有新规划或跨聊天派单。

本轮有限检查已完成：指定材料完整读取、来源对应、目录/关键文件去向、加载与回程、排除/延后及真实差距均已交付。校验方式为原字节 SHA256、完整 JSON/Markdown 遍历、目标文件存在、74 对字节比较、限定消费者查找；本轮未执行测试。

功能迁移完成条件仍沿用 file-tasks.md 与各条 completionCondition：同一最终产品包、普通脚本/采集未注册、版本/hash pin、双 tab/frame/导航/权限与故障、实际 IDB、SDK/控制两条真实回程、下载 complete/落盘 hash、1000 轮资源回收、B05 四窗口、R1–R8/历史 17 映射、规定 Chrome 矩阵及独立验收后冻结。最新三项 prod138 PASS 只覆盖对应场景；其余 required fail/not-tested 不得推为通过。**本报告不宣布 F3 完成，不修改共享门禁或填充产品包 hash。**
