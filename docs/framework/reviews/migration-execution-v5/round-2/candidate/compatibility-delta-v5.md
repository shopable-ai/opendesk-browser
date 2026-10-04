# 当前候选兼容差异

审批对象M5-C1，仅方案决定、未证明产品行为。冻结outputs/compatibility-delta.md七行与type-click-compatibility.md全部继续有效，实际路径/hash由当前manifest绑定。逐项详细决定在唯一账本及test-spec-v5.json。

|旧行为或模糊决定|当前决定|必需测试|
|---|---|---|
|compat/src-bex与旧assets/core运行树|改framework/context、sdk/{bridge,http,storage,notifications,servers,utils}、utils/{script,device,network-info}、events及platform/page-port/codec职责；公开旧名字保留|PROV01/02、目录与入口检查|
|dom.ts/detect-quasar按消费者适配|本轮runtime排除，无占位；保留编码/边界样本|PROV、B03固定编码/边界，不计成功|
|testMonkey独立类adapter|整包旧业务UI延期未迁移，保留CMP06/PROV，不代主ChromePage或复制bundle|CMP06独立对照、包内无旧bundle|
|资源泛写按消费者|固定消费者白名单；无本轮consumer排除，保留hash/许可/来源；SDK必要vendor归framework/sdk/vendor，UI归ui/assets|逐资源load/error/许可/目标/hash；动态未解析不通过|
|共享page/active tab|准入、committed revision pin、精确绑定后每run context，无上下文E_PAGE_CONTEXT_REQUIRED|CMP01/USC06/NAV01；双run/切active/旧元素|
|业务PageBrigeCode误信封、null/参数JSON丢失|用户value与driver外层分层；undefined tag保留，非有限数/BigInt/循环/native/bound前置拒绝，自由变量ReferenceError|CMP10/EX04/B01，无dispatch拒绝与原Promise|
|evaluate字符串与eval含等号启发式|字符串语句true/忽略args/不等自行启动异步；eval所有输入须显式expression或statement mode，无mode统一E_LEGACY_AMBIGUOUS_EXECUTION，停止旧等号猜测；evaluateExpression作为显式替代单列|CMP03函数/字符串/表达式/赋值/语法分测；新增限制不能称旧eval无改动兼容|
|type/click/keyboard|type追加/Typed，click合成mousedown/up/click并clicked；Keyboard仅向document发合成键事件，Backspace不删除input值，native编辑/快捷键未支持；值输入使用type|CMP09及逐keyboard，Unicode/空串/取消/不支持目标；旧缺陷不伪称浏览器原生编辑|
|$/$$搬Worker|可信DOM host detached snapshot；Worker明确E_DOM_SNAPSHOT_CONTEXT与serialized替代；无匹配null/[]；ChromeElement绑定doc|CMP02/03，各宿主/快照改写/导航拒绝|
|cookies多URL/截图fullPage/native|无参只绑定目标，每URL授权去重；截图只明确可见绑定目标复验，fullPage/native typed拒绝|SVC/CMP成员 allow/deny/race；拒绝不计功能实现|
|AppStorage全域clear/任意global AppLocal|持久namespace/String值/missing null，写删clear undefined；session typed JSON/undefined与missing分开，SW保留/新browser session清空|CMP07/B05，真实IDB与两类重启分别验|
|formatJSON eval/pretty误述|strict JSON compact，非法原文透传，非JSON不执行；wrapAsync委托sandbox|CMP12/08，合法/非法/恶意代码/async异常|
|Axios完整响应与失败undefined|四method可序列化响应投影含data/status/statusText/headers/config；配置白名单，未知拒绝；HTTP/network/timeout typed区分|CMP13/SVC/B03，falsy/config/限额/四method|
|serverUtils no-cors/Infinity/第一可用|可观察2xx与实际Abort/latency；失败null，全失败fastestResult null；真实最小延迟/同值输入序|CMP14空/失败/快慢/反序/超时/JSON|
|未知服务undefined|未知method/schema typed拒绝与合法undefined分开；ACK仅accepted，固定callback最终settle|CMP15/B01/B05，重复/未知ID与清理|
|raw userScripts含error字段假设|保留原生throw/rejection四失败和撤权失败；wrapper产品合同与native观察分列，新版/CSP/真实UI/pending/独立复核仍必需|EX04两world原生shape与wrapper独立记录，不宣布native全部通过|
|升级后旧JS回写|升级前rawBackup显式key/hash，abort原子回滚；成功后当前schema只读诊断与前向修复，禁自动覆盖|真实SVC-IDB blocked/versionchange/abort/快照恢复前后故障|

remote控制、native、TimeReview/CSDN/recorder、整包业务UI延期或不支持；旧事件字符串和DeviceType数值保留不等于handler实现。UtilInfo可选显式授权，地址不替换、不主动联网；缺指纹E_RESOURCE_UNAVAILABLE，非授权身份。

当前细化：Cookie后台setCookies尊重显式expiry/默认session，移除旧强制一天；通知统一Chrome notifications，点击无data不打开页面，明确URL仍须grant；storage.get(null)仅返回授权namespace值数组，顺序不保证且不作备份。固定SDK安装同名不同来源全局返回E_SDK_GLOBAL_CONFLICT，不覆盖页面对象；codec坏Base64/UTF8/JSON统一E_VALUE_SERIALIZATION并标stage；raw网页脚本E_CAPABILITY，未知/设备业务E_SERVICE_UNSUPPORTED。读取/等待/ChromeElement支持明确绑定的授权iframe，但selector不自动跨frame。

旧项目根LICENSE完整MIT文本的实际path/hash见stage0/license-evidence.json；只作为项目源码的本地许可依据，最终两个包须带完整notice并核hash。vendor全部排除，许可覆盖不由库名推断；当前仍没有实际产物/资源加载证明。F008旧consumer未在有限闭包中定位，此unknown保留；本轮新增固定SDK entry明确公开serverUtils，是本轮消费者决定，不重做旧全库搜索。

排除/延期/受限拒绝与成功分账。分母保留原ID清单；任何新增排除、缩窄或版本范围变化保存差异理由与受影响范围独立复核。方案hash和产品包hash分开。冻结资料不修改，旧失败不删除。
