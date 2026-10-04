from pathlib import Path
import json, hashlib, datetime, re

ROOT = Path('/Users/shopme/Documents/workspace/opendesk-browser')
OLD = Path('/Users/shopme/Documents/workspace/todo-user-vue/src-bex')
OUT = Path(__file__).parent
ledger = json.loads((ROOT / 'docs/framework/source-compatibility-ledger.json').read_text())
files = {r['file']: r for r in ledger['fileRows']}

# All names below were read in the actual sources; a missing anchor is an error.
spec = {
 'assets/js/Env.js': [('src/framework/sdk/bridge.js', 'export const CHROME_PAGE_TYPE')],
 'assets/js/core/brige.js': [('src/framework/sdk/bridge.js', 'export function createSdkBridge'), ('src/framework/sdk/entry.js', 'const ChromeBridgeOperationCompleted')],
 'assets/js/core/axiosx.js': [('src/framework/sdk/http.js', 'export function createHttp'), ('src/framework/sdk/bridge.js', 'const callChromeBridgeInterface')],
 'assets/js/core/appStorage.js': [('src/framework/sdk/storage.js', 'const AppStorage')],
 'assets/js/core/appLocal.js': [('src/framework/sdk/storage.js', 'const AppLocal'), ('src/platform/storage/session.js', 'export function createSessionTyped')],
 'assets/js/core/common.js': [('src/framework/sdk/notifications.js', 'export function createNotifications')],
 'assets/js/core/serverUtils.js': [('src/framework/sdk/servers.js', 'export function createServers')],
 'assets/js/core/utils.js': [('src/framework/sdk/utils.js', 'export function createSleep'), ('src/framework/sdk/utils.js', 'export async function getFingerprint')],
 'assets/js/utils.js': [('src/framework/sdk/utils.js', 'export function createSleep')],
 'assets/js/custom_event.js': [('src/agents/page-relay.js', 'export function installPageRelay')],
 'ChromePage.ts': [('src/framework/ChromePage.js', 'export class ChromePage'), ('src/framework/context.js', 'export function createRunContext')],
 'background.ts': [('src/sw.js', 'const foundation = createFoundationBroker'), ('src/platform/host/broker.js', 'export async function createFoundationBroker'), ('src/platform/host/sdk-broker.js', 'export function createSdkBroker')],
 'my-content-script.ts': [('src/platform/host/broker.js', 'async installSdk'), ('src/platform/chrome/tabs.js', 'export function createTabsService'), ('src/framework/sdk/entry.js', 'export function installPageSdk')],
 'chrome-local-storage-api.js': [('src/framework/sdk/storage.js', 'const storage = Object.freeze')],
 'utils/UtilScrpt.ts': [('src/framework/utils/script.js', 'export function formatJSON'), ('src/framework/utils/script.js', 'export function wrapAsync'), ('src/scripting/sandbox/worker-runtime.js', 'const body = new AsyncBody')],
 'utils/UtilDevice.ts': [('src/framework/utils/device.js', 'export function createDeviceUtils')],
 'utils/UtilInfo.ts': [('src/framework/utils/network-info.js', 'export function createNetworkInfo'), ('src/platform/host/sdk-broker.js', 'networkInfoEnabled:false')],
 'operate/EventOperate.cst.ts': [('src/framework/events.js', 'export const EVENT_OPERATE'), ('src/framework/events.js', 'export function dispatchFrameworkEvent')],
 'operate/Device.cst.ts': [('src/framework/utils/device.js', 'export const DeviceType')],
}

gaps = {
 'assets/js/Env.js': '值为 CHROME_EXTENSION；随固定 SDK bundle 安装，尚无正式 RESOURCE load/error 同包验收。',
 'assets/js/core/brige.js': '固定回调/Map/timer/Promise 单次结算已写入；executeInBg/executeScript 明确 E_CAPABILITY，不能算任意后台脚本正向迁移。',
 'assets/js/core/axiosx.js': '四方法与 BridgeUrl_Inject→url 已接线到共享 network；config 投影/错误/15s/真实四方法仍需原调用式验收。没有 axios npm runtime 依赖。',
 'assets/js/core/appStorage.js': 'namespace IDB KV、字符串化及 missing=null；clear 仅本 namespace user area；需要真实重启/事务/原 Promise 证据。',
 'assets/js/core/appLocal.js': '同 authority namespace 下 chrome.storage.session typed 值；需要 SW 重启和浏览器 session 结束分别证明寿命。',
 'assets/js/core/common.js': 'createNotify string/body→共享 Chrome notification；null/非法输入 typed 拒绝；原生权限/通知/icon/回程待验。',
 'assets/js/core/serverUtils.js': '原方法保留；最快 server 修正为全部可观察结果中最小 latency。旧加载器六 core 列表未包含 serverUtils；真实 timeout/error 待验。',
 'assets/js/core/utils.js': 'sleep 已安装到网页全局；getFingerprint 只有 E_RESOURCE_UNAVAILABLE，旧 fingerprintjs@3.js 实际缺失，不能算指纹支持。',
 'assets/js/utils.js': '本轮仅重复 sleep 对应同一 createSleep，不等于迁移旧业务工具全集。',
 'assets/js/custom_event.js': 'ISOLATED relay 实际 runtime.sendMessage 交给 Chrome 填 sender；旧 chromeCustomEvt/CHROME_PAGE_EXECUTE typed 拒绝；导航/清理待同包证明。',
 'ChromePage.ts': '48 成员门面使用每 run context；最小 goto/title/url durable 已有 GUI 证据，其余 API48 仍须逐合同复验。',
 'background.ts': '拆分到 SW 短服务/唯一 broker；service.log/getTime/bexUrl/requestResource 仍无等价公开注册入口，合同 SVC.F020 四项缺口。',
 'my-content-script.ts': '固定 ISOLATED relay→MAIN sdk-main，准确 documentIds；没有自动执行目录全部 JS。old loader 显式顺序与新 webpack import 顺序分别保存。',
 'chrome-local-storage-api.js': '旧 helpers/service.storage 使用唯一 CHROME_LOCAL routes 和同 IDB namespace；不是第二 storage.local 或第二 DB；真实 missing/undefined 与 clear 待验。',
 'utils/UtilScrpt.ts': 'formatJSON 由 SDK 消费；wrapAsync 符号仅定义，普通 JS 实际由 Worker AsyncBody 执行，需按 EX01 核实返回/异常等价。',
 'utils/UtilDevice.ts': 'UA/DeviceType/稳定 namespace ID helper 已接 SDK；native 拒绝，getAppIdInfo 无可信 extensionId 返回 {}，fingerprint 未提供。',
 'utils/UtilInfo.ts': '原固定 IP URL 保留；networkInfoEnabled=false，UI 禁选，不能算 IP 查询已支持。',
 'operate/EventOperate.cst.ts': '原常量保留；dispatchFrameworkEvent 只有定义，无已查生产消费者；RunHost UI 直接调用 start/stop。设备业务拒绝。',
 'operate/Device.cst.ts': '原枚举值对应 DeviceType；SDK 内部消费，不算独立产品验收。',
}

sdk_load = 'tool.html→tool-shell.js 真实授权/installSdk→broker.installSdk→tabs.injectFixed；webpack entry sdk/entry.js→dist/production/framework/sdk-main.js MAIN；page-relay.js ISOLATED。'
sdk_call = '网页旧 globals→entry/bridge/transport→page-relay runtime.sendMessage→sw→同 broker/sdk-broker→authority.admitSdk→sdk/service→共享 storage/network/notifications→valueWire→relay→固定 ChromeBridgeOperationCompleted→原 Promise。'
control_load = 'tool.html 的 tool-shell.js→mountScriptEditor→createRunHost；UI commit/load/start→同 broker/authority controller methods→固定 sandbox/worker-runtime 产物→per-run ctx.page。'
control_call = 'startControllerRun durable admission→pinScriptRevision→精确 target→RunHost.startController→Worker page proxy→controllerOperation→native-driver→持久 result→retire target/pin→UI。'

rows = []
selected = sorted(set(p.relative_to(OLD).as_posix() for p in (OLD/'assets/js').rglob('*.js')) | set(spec))
for f in selected:
    p=OLD/f
    assert p.is_file(), f
    b=p.read_bytes(); entry=files.get(f)
    assert entry is not None, f
    capabilities=[r for r in ledger['capabilityItems'] if r.get('source',{}).get('file') == f]
    nodes=[]
    for target, anchor in spec.get(f,[]):
        n=ROOT/target; lines=n.read_text().splitlines(); hits=[i+1 for i,s in enumerate(lines) if anchor in s]
        assert len(hits)==1, (target,anchor,hits)
        nodes.append({'path':str(n),'symbolAnchor':anchor,'line':hits[0],'sha256':hashlib.sha256(n.read_bytes()).hexdigest()})
    core=bool(nodes)
    symbols=[{'name':x['source'].get('symbol'),'lines':x['source'].get('lines'),'id':x['id']} for x in capabilities]
    if not symbols: symbols=[{'name':'本地 bundle/资源（未迁入，无新导出映射）','lines':entry['sourceLines'],'id':entry['id']}]
    if f in ['background.ts','ChromePage.ts','utils/UtilScrpt.ts','operate/EventOperate.cst.ts']:
        load=control_load; consumer=control_call
    else: load=sdk_load; consumer=sdk_call
    if not core:
        load='当前 production 无该文件/入口；原合同处置 '+entry['scope']
        consumer='当前有限生产闭包无对应消费者；旧声明/注入不等于新消费。'+entry.get('behaviorDecision',{}).get('reason','')
    rows.append({'oldFile':str(p),'sourceId':entry['id'],'oldSha256':hashlib.sha256(b).hexdigest(),'sourceHashMatchesLedger':hashlib.sha256(b).hexdigest()==entry['sourceHash'],'oldSymbols':symbols,'newNodes':nodes,'loading':load,'consumer':consumer,'retainedAndGaps':gaps.get(f,'旧 '+entry['scope']+'；当前未迁入。本轮有实际必要消费者且无等价实现时才按用户政策携入原版本/原文件名，不改第三方源码。不能以创建 vendor 目录或复制文件算功能完成。'),'tasks':entry.get('tasks',[]),'caseIds':entry.get('caseIds',[]),'implementationState':'有源码对应/加载接线，具体缺口见本行' if core else '未迁入（旧合同排除/业务延期，未计迁移完成）','formalAcceptance':'NOT_TESTED','evidence':['docs/framework/evidence/independent-basic-20261003-coop/directory-mapping.md','docs/framework/evidence/independent-basic-20261003-coop/evidence-audit.md']})

data={'createdAtUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'packageHash':'552d3b3fe7cfb8f196142954659702b8440a6acf517e15bde959c7c7beff9f89','scope':'Bounded existing mapping and actual assets/js filenames; no full library audit, no product modifications','rows':rows,'baselineSpecificNativePass':['SAVE-R1-SELECT-PARAMS','MINIMAL-RETURN7','OWNED-GOTO-TYPE-CLICK-WAIT-READ-RETURN (source only goto/title/url)'],'formalLedger':{'original':603,'accepted':0,'additional':19,'f3Accepted':False},'independentReview':'尚未独立评分；两名原生子代理因429终止，未取得任何评分'}
(OUT/'actual-code-map.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
md=['# 本轮实际代码对应表','', '这是现状核对和定点验收动作，沿用唯一 execution-plan/T01–T13/K0–K6/F1–F3，不另造开发规划。实现状态与正式验收状态分列；表中全部新节点已从真实源码核实路径、符号及行号。','', '当前候选 packageHash：`'+data['packageHash']+'`。正式账本 0/603，另有19增项；阶段0/F1保留已通过，F3未通过。原生三个具体场景 PASS 只证明其原 source 实际行为，不推广到父合同。','', '|旧实际文件与符号|新实际文件与符号|加载入口与消费者|保留及具体缺口|合同与实现状态|正式验收/证据|','|---|---|---|---|---|---|']
for r in rows:
    old='['+r['sourceId']+' '+Path(r['oldFile']).relative_to(OLD).as_posix()+']('+r['oldFile']+')<br>'+'；'.join(x['name'] or '' for x in r['oldSymbols'])
    new='<br>'.join('['+Path(x['path']).relative_to(ROOT).as_posix()+':'+str(x['line'])+']('+x['path']+':'+str(x['line'])+') `'+x['symbolAnchor']+'`' for x in r['newNodes']) or '无实际新模块；不使用猜测文件名'
    md.append('|'+ '|'.join(v.replace('|','\\|').replace('\n','<br>') for v in [old,new,r['loading']+'<br>'+r['consumer'],r['retainedAndGaps'],','.join(r['tasks'])+'<br>'+', '.join(r['caseIds'])+'<br>'+r['implementationState'],'NOT_TESTED（正式合同）<br>源码证据见本行链接；GUI三场景见原evidence-audit'])+'|')
md += ['', '## 固定资源实际消费', '', '|资源实际产物|实际来源/声明/消费者|当前验收|','|---|---|---|', '|dist/production/icons/notification.png|scripts/build.mjs:26–30 原本地PNG，verify-package FIXED_ASSETS SHA efb5cadd…，sdk-broker.js:16→Chrome notification.create|NOT_TESTED：待原生通知/icon成功与缺失拒绝|','|dist/production/licenses/todo-user-vue-MIT.txt|docs/contracts/licenses/todo-user-vue-MIT.txt 原1096bytes/SHA e301f131…；build.mjs:25固定copy|NOT_TESTED：来源闭合不等于资源功能PASS|','|dist/production/scripting/sandbox/{sandbox.html,sandbox.js,worker-runtime.js}|manifest sandbox.pages；RunHost→controller→固定包内Worker文本→opaque Blob Worker|最小JS GUI PASS；物理终止/资源基线NOT_TESTED|','', '## 本轮定点动作（实施前须双独立评审 ≥95）', '', '1. 保留共享 writer、冻结当前src/dist及旧Goal；本对话只新增独占检查/runner/证据，原writer负责具体产品修改及串行构建、正式账本写入。', '2. 先修独立runner工具：绑定确切存活owned Chrome/CUA surface；native选择后读真实select.value，核对实际revision；前置未到产品断言记BLOCKED，并保留raw FAIL。只用production/Chrome138当前需要的case，先三个主链再R1/R2/pin/tombstone。', '3. 按原合同复验throw/rejection/typed值/stop/deadline，观察真实Worker target/CPU和≤3s；重开同结果、真实downloads complete、磁盘bytes/SHA、资源基线，证明采集未注册。', '4. 缺口递交writer须附旧合同ID、实际新文件、缺失调用环节及原始事实。当前明确候选缺口：SVC.F020.log/getTime/bexUrl/requestResource；工具/事件仅定义与受限能力分别处理，不能把邻近console/Date/runtime.getURL当作旧接口实现。', '5. 普通JS基本主链通过后，旧SDK原调用式→真实授权/固定资源/Hello/native sender→同authority/broker/IDB→原Promise；原B05和故障矩阵按合同补，不新造演示API。', '6. writer产物变化重新绑定受影响证据；最终同一production包闭合603+明确增项、历史17/R1–R8、1000轮/10重连/2禁用、资源baseline与顺序独立F3评审，checker accepted=true之前Goal不完成。', '', '## 评审现状', '', data['independentReview']+'。评分尺为25（实际对应）/20（类库与加载）/25（普通JS/SDK）/20（包与证据）/10（顺序与边界）。不能用作者自评分放行；当前没有产品修改、构建或浏览器启动。','', '## 加载顺序的实际区别', '', '旧 my-content-script.ts:148–171 是逐次 appendScript(brige/common/axiosx/appStorage/appLocal/utils，再lodash/moment/axios/js.cookie/utils/Env及缺失fingerprintjs@3.js)，append调用没有逐资源onload等待，serverUtils未在六core自动列表中。新 sdk/entry.js 的明确imports由webpack一个MAIN固定产物封装，broker先ISOLATED再MAIN await原生回执，再真实Hello；不能把旧append调用次序直接当ready证据。', '', '新package.json只有webpack/terser开发依赖，没有axios/jQuery/lodash/moment等运行时npm依赖。HTTP/Cookie/storage的必要能力沿已批准driver实现；不把旧vendor的声明或目录存在当消费者。若本轮定点发现实际必要第三方消费者且没有等价实现，交writer携入原文件名/版本并新增明确load/error消费证据，不擅自升级或改vendor源码。']
(OUT/'actual-code-map.md').write_text('\n'.join(md)+'\n')
print('rows',len(rows),'assets/js rows',sum('/assets/js/' in r['oldFile'] for r in rows),'all source hashes match',all(r['sourceHashMatchesLedger'] for r in rows))
print(OUT/'actual-code-map.md')
