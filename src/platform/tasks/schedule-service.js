import {canonical,invariant} from '../protocol.js';
import {permissionPattern} from '../../environment.js';
import {BROWSER_OPERATIONS} from '../../framework/sdk/browser-contract.js';
import {SIDEBAR_TOOL_STORE,sidebarToolPackageHash,validateSidebarToolPackage} from '../../ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE,requireToolEnableRecords} from '../../ui/sidebar-tools/lifecycle.js';
import {createScheduleRepository} from './schedule-repository.js';
import {toolDocumentIdentity} from '../../tool-document-url.js';
import {SCHEDULE_ALARM_PREFIX,scheduleKey,scheduleIdFromRef,validateInstalledToolScheduleRequest,validateScheduleOwner,validateTrustedScheduleIntent} from './schedule-contract.js';

// Only document contexts that actually run createScheduledTaskHost may
// advertise scheduler availability. A regular Task catalog is a registered
// Controller Host, but does not claim scheduled occurrences.
export async function scheduledHostDocumentIds(api){
  if(typeof api?.runtime?.getContexts!=='function')return null; // legacy deterministic test shim
  const contexts=await api.runtime.getContexts({}).catch(()=>[]);
  const base=api.runtime.getURL('ui/tool.html'),ids=new Set();
  for(const row of contexts||[]){
    if(typeof row.documentId!=='string'||!row.documentId||typeof row.documentUrl!=='string')continue;
    if(row.documentLifecycle&&row.documentLifecycle!=='active')continue;
    const route=toolDocumentIdentity(base,row.documentUrl);
    if(!route?.hostInstanceId)continue;
    if(row.contextType==='SIDE_PANEL'&&!route.hasLocator ||
       row.contextType==='TAB'&&route.scheduledRunner===true)
      ids.add(row.documentId);
  }
  return ids;
}

export function createScheduleService({storage,api,clock,session,assertHost,emitToHost,
  assertToolOwner=null}){
  const namespace=`tool:${api.runtime.id}`;
  const repo=createScheduleRepository({storage,clock,namespace,session});
  const checkSender=async sender=>assertHost(sender);
  async function defaultAssertToolOwner(owner,operation){
    const spec=BROWSER_OPERATIONS[operation];
    invariant(spec?.requiredCapabilities?.includes('browser.scheduler'),'E_CAPABILITY','Scheduler operation is not owned by installed tools');
    invariant(api.storage?.local?.get&&api.permissions?.contains,'E_SERVICE_UNSUPPORTED','Browser scheduler owner verifier is not installed');
    const chromePermissions=spec.requiredChromePermissions??[];
    invariant(!chromePermissions.length||await api.permissions.contains({permissions:chromePermissions}),
      'E_PERMISSION','Required Chrome scheduler permission is not available');
    const local=await api.storage.local.get([SIDEBAR_TOOL_STORE,SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE]);
    const tools=Array.isArray(local[SIDEBAR_TOOL_STORE])?local[SIDEBAR_TOOL_STORE]:[];
    const tool=tools.find(row=>row?.id===owner.toolId);
    invariant(tool,'E_OWNER','Installed scheduler tool is missing');
    const checked=validateSidebarToolPackage(tool);
    invariant(checked.id===owner.toolId&&checked.version===owner.toolVersion&&
      checked.capabilities.includes('browser.scheduler'),'E_OWNER','Installed scheduler tool lacks current capability');
    invariant(await sidebarToolPackageHash(checked)===owner.packageHash,'E_OWNER','Installed scheduler tool package changed');
    invariant(requireToolEnableRecords(local[SIDEBAR_TOOL_ENABLE_STORE])[owner.toolId]!==false,
      'E_TOOL_DISABLED','Installed scheduler tool is disabled');
    const epochs=local[TOOL_REVOCATION_EPOCHS_STORE]??{};
    invariant(epochs&&typeof epochs==='object'&&!Array.isArray(epochs)&&
      Object.entries(epochs).every(([id,value])=>/^[a-z][a-z0-9-]{1,39}$/.test(id)&&typeof value==='string'),
      'E_STORAGE_CORRUPT','Installed scheduler tool revocation state is corrupt');
    invariant((epochs[owner.toolId]??null)===owner.epoch,'E_OWNER','Installed scheduler tool authority epoch changed');
  }
  async function checkOwner(owner,operation,origin=null){
    const normalized=validateScheduleOwner(owner);
    await (assertToolOwner??defaultAssertToolOwner)(normalized,operation,origin);
    return normalized;
  }
  const ownerKey=owner=>canonical(validateScheduleOwner(owner));
  async function currentOwnerValidity(){
    const definitions=await repo.definitions(),owners=[];
    for(const def of definitions)
      if(def.owner&&!owners.some(owner=>ownerKey(owner)===ownerKey(def.owner)))owners.push(def.owner);
    const ownerEntries=await Promise.all(owners.map(async owner=>{
      const key=ownerKey(owner);
      try{await checkOwner(owner,'browser.scheduler.listOwn');return [key,true];}
      catch{return [key,false];}
    }));
    const map=new Map(ownerEntries);
    await Promise.all(definitions.filter(def=>def.owner).map(async def=>{
      const key=ownerKey(def.owner);
      if(map.get(key)===false){map.set(key+':'+def.scheduleId,false);return;}
      try{
        const origin=new URL(def.targetUrl).origin;
        const granted=await api.permissions.contains({origins:[permissionPattern(origin)]});
        map.set(key+':'+def.scheduleId,granted===true);
      }catch{map.set(key+':'+def.scheduleId,false);}
    }));
    return map;
  }
  async function signal(){
    const rows=await storage.transaction(['commandJournal'],'readonly',async tx=>(await tx.all('commandJournal'))
      .filter(row=>row?.tag==='host'&&row.namespace===namespace&&row.active&&!row.revoked&&
        (session===undefined||row.browserSessionIncarnation===session)));
    await Promise.allSettled(rows.map(row=>emitToHost(row.registrationId,{type:'scheduled-fire-ready'})));
  }
  async function syncAlarms(ownerValidity){
    // Test-only broker shims may omit alarms; production MV3 declares the API.
    if(!api.alarms?.getAll||!api.alarms?.create||!api.alarms?.clear)return;
    const definitions=await repo.definitions();
    const expected=new Map(definitions.filter(d=>!d.paused&&d.nextDueAt!==null&&
      (!d.owner||ownerValidity.get(ownerKey(d.owner))!==false&&
        ownerValidity.get(ownerKey(d.owner)+':'+d.scheduleId)!==false))
      .map(d=>[SCHEDULE_ALARM_PREFIX+d.scheduleId,d.nextDueAt]));
    const actual=await api.alarms.getAll();
    for(const row of actual){
      if(!row.name.startsWith(SCHEDULE_ALARM_PREFIX))continue;
      const wanted=expected.get(row.name);
      if(wanted===undefined){await api.alarms.clear(row.name);continue;}
      if(Math.abs(row.scheduledTime-wanted)>1500)await api.alarms.create(row.name,{when:wanted});
    }
    for(const [name,when] of expected)
      if(!actual.some(a=>a.name===name))await api.alarms.create(name,{when});
  }
  async function reconcile(){
    const activeDocumentIds=await scheduledHostDocumentIds(api);
    const ownerValidity=await currentOwnerValidity();
    const changed=await repo.reconcile({activeDocumentIds,ownerValidity});
    await syncAlarms(ownerValidity);
    if(changed.length)await signal();
    return changed;
  }
  async function saveSchedule(request,sender){
    await checkSender(sender);
    // Saving an approval never prompts. Permission may be revoked at any time,
    // and the original Controller Authority checks again on real admission.
    const origin=new URL(request.targetUrl).origin;
    invariant(await api.permissions.contains({origins:[permissionPattern(origin)]}),'E_PERMISSION','Grant website access before scheduling');
    if(request.triggerKind==='once')invariant(request.triggerSpec.at>clock.now(),'E_SCHEMA','One-time execution must be in the future');
    const row=await repo.save(request);
    await reconcile();
    return row;
  }
  async function changeSchedule(request,sender){
    await checkSender(sender);
    invariant(request&&Object.keys(request).length===3&&
      ['scheduleId','expectedGeneration','action'].every(k=>Object.hasOwn(request,k)),
      'E_SCHEMA','Invalid schedule change');
    const row=await repo.changeState(request);
    await reconcile();
    return row;
  }
  async function listSchedules(request,sender){
    await checkSender(sender);
    invariant(request&&Object.keys(request).length===0,'E_SCHEMA');
    await reconcile();
    const schedules=await repo.list();
    const origins=[...new Set(schedules.map(row=>new URL(row.targetUrl).origin))];
    const grants=new Map(await Promise.all(origins.map(async origin=>[
      origin,api.permissions?.contains?await api.permissions.contains({origins:[permissionPattern(origin)]}).catch(()=>false):false
    ])));
    return {schedules:schedules.map(row=>({...row,
      needsAttention:row.needsAttention||grants.get(new URL(row.targetUrl).origin)!==true}))};
  }
  async function listScheduleHistory(request,sender){
    await checkSender(sender);
    invariant(request&&typeof request==='object'&&!Array.isArray(request)&&
      ['scheduleId','offset','limit'].every(key=>Object.hasOwn(request,key))&&
      Object.keys(request).length===3,'E_SCHEMA','Invalid history page request');
    return repo.history(request);
  }
  async function listDueSchedules(request,sender){
    await checkSender(sender);
    invariant(request&&Object.keys(request).length===0,'E_SCHEMA');
    await reconcile();
    return {fires:await repo.ready({ownerValidity:await currentOwnerValidity()})};
  }
  async function setScheduleFireState(request,sender){
    await checkSender(sender);
    invariant(request&&Object.keys(request).length===2&&
      Object.hasOwn(request,'fireId')&&Object.hasOwn(request,'status'),'E_SCHEMA');
    const row=await repo.recordWait(request.fireId,request.status);
    await reconcile();
    return {fireId:row.fireId,status:row.status};
  }
  async function onAlarm(alarm){
    if(typeof alarm?.name!=='string'||!alarm.name.startsWith(SCHEDULE_ALARM_PREFIX))return false;
    await reconcile();return true;
  }
  async function create(request,owner,intent){
    const publicRequest=validateInstalledToolScheduleRequest(request);
    const input=validateTrustedScheduleIntent(intent,publicRequest);
    const checkedOwner=await checkOwner(owner,'browser.scheduler.create',new URL(input.targetUrl).origin);
    invariant(await api.permissions.contains({origins:[permissionPattern(new URL(input.targetUrl).origin)]}),
      'E_PERMISSION','Grant website access before scheduling');
    if(input.triggerKind==='once')invariant(input.triggerSpec.at>clock.now(),'E_SCHEMA','One-time execution must be in the future');
    const row=await repo.saveOwned(input,checkedOwner);
    await reconcile();
    return {scheduleRef:row.scheduleId,status:row.paused?'pending':'active'};
  }
  async function listOwn(request,owner){
    invariant(request&&typeof request==='object'&&!Array.isArray(request)&&
      Object.keys(request).length===0,'E_SCHEMA','Invalid scheduler list request');
    const checkedOwner=await checkOwner(owner,'browser.scheduler.listOwn');
    await reconcile();
    const rows=await repo.listOwn(checkedOwner,{ownerValidity:await currentOwnerValidity()});
    return {schedules:rows.slice(0,100).map(({scheduleRef,taskId,status})=>({scheduleRef,taskId,status}))};
  }
  async function cancelOwn(request,owner){
    invariant(request&&typeof request==='object'&&!Array.isArray(request)&&
      Object.keys(request).length===1&&Object.hasOwn(request,'scheduleRef'),
      'E_SCHEMA','Invalid scheduler cancel request');
    scheduleIdFromRef(request.scheduleRef);
    const checkedOwner=await checkOwner(owner,'browser.scheduler.cancelOwn');
    const result=await repo.cancelOwn(request,checkedOwner);
    await reconcile();
    return result;
  }
  async function prepareAdmission(fireId,expectedScheduleOwner){
    const {definition}=await repo.admissionDefinition(fireId);
    if(!definition.owner){
      invariant(expectedScheduleOwner===undefined||expectedScheduleOwner===null,
        'E_OWNER','Unexpected scheduler owner for unowned schedule');
      return undefined;
    }
    const expected=validateScheduleOwner(expectedScheduleOwner);
    invariant(ownerKey(expected)===ownerKey(definition.owner),'E_OWNER','Scheduled owner no longer matches approval');
    const origin=new URL(definition.targetUrl).origin;
    const checkedOwner=await checkOwner(definition.owner,'browser.scheduler.listOwn',origin);
    invariant(await api.permissions.contains({origins:[permissionPattern(origin)]}),
      'E_PERMISSION','Scheduled target origin permission was revoked');
    return checkedOwner;
  }
  return {saveSchedule,changeSchedule,listSchedules,listScheduleHistory,listDueSchedules,setScheduleFireState,onAlarm,reconcile,
    create,listOwn,cancelOwn,prepareAdmission,
    admit:repo.admit,bind:repo.bind};
}
