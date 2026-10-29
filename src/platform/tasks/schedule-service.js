import {canonical,invariant} from '../protocol.js';
import {permissionPattern,isToolSender,resolveToolSender} from '../../environment.js';
import {BROWSER_OPERATIONS} from '../../framework/sdk/browser-contract.js';
import {SIDEBAR_TOOL_STORE,sidebarToolPackageHash,validateSidebarToolPackage} from '../../ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE,requireToolEnableRecords,TOOL_CLEANUP_STORE,requirePendingToolCleanups} from '../../ui/sidebar-tools/lifecycle.js';
import {createScheduleRepository} from './schedule-repository.js';
import {toolDocumentIdentity,SIDEPANEL_DOCUMENT_PATH,CLOUD_RUNNER_DOCUMENT_PATH} from '../../tool-document-url.js';
import {SCHEDULE_ALARM_PREFIX,scheduleKey,scheduleIdFromRef,validateInstalledToolScheduleRequest,validateScheduleOwner,validateTrustedScheduleIntent,validateTrustedAppServiceScheduleIntent} from './schedule-contract.js';
import {scheduleSpecFromExpression} from './schedule-time.js';
import {readAppServiceInstallation,assertAppServiceBinding} from './app-service-installation.js';

// Only document contexts that actually run createScheduledTaskHost may
// advertise scheduler availability. A regular Task catalog is a registered
// Controller Host, but does not claim scheduled occurrences.
export async function scheduledHostDocumentIds(api,{profile}={}){
  if(typeof api?.runtime?.getContexts!=='function')return null; // legacy deterministic test shim
  const contexts=await api.runtime.getContexts({}).catch(()=>[]);
  const base=api.runtime.getURL(SIDEPANEL_DOCUMENT_PATH),ids=new Set();
  for(const row of contexts||[]){
    if(typeof row.documentId!=='string'||!row.documentId||typeof row.documentUrl!=='string')continue;
    if(row.documentLifecycle&&row.documentLifecycle!=='active')continue;
    if(profile==='app-service'){
      if(row.contextType==='OFFSCREEN_DOCUMENT'&&row.documentUrl===api.runtime.getURL(CLOUD_RUNNER_DOCUMENT_PATH))
        ids.add(row.documentId);
      continue;
    }
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
  async function uninstalledScheduleOwners(){
    // Capture exact old owners BEFORE reading the installation registry. A
    // concurrent reinstall gets a new epoch and must not be swept by ID alone.
    const definitions=await repo.definitions();
    if(!definitions.some(def=>def.owner)||!api.storage?.local?.get)return new Set();
    const raw=(await api.storage.local.get(SIDEBAR_TOOL_STORE))[SIDEBAR_TOOL_STORE];
    // Missing/unreadable state is not proof of an uninstall.
    if(raw===undefined)return new Set();
    invariant(Array.isArray(raw),'E_STORAGE_CORRUPT','Installed scheduler tool registry is corrupt');
    let ids;
    try{ids=raw.map(tool=>validateSidebarToolPackage(tool).id);}
    catch{invariant(false,'E_STORAGE_CORRUPT','Installed scheduler tool registry is corrupt');}
    const installed=new Set(ids);
    invariant(installed.size===ids.length,'E_STORAGE_CORRUPT','Duplicate installed scheduler tool');
    return new Set(definitions.filter(def=>def.owner&&!installed.has(def.owner.toolId))
      .map(def=>ownerKey(def.owner)));
  }
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
        if(def.profile==='app-service'){
          const {tool}=await assertAppServiceBinding(api,def.appBinding);
          invariant(def.appId===def.owner.toolId&&tool.version===def.owner.toolVersion,
            'E_OWNER','App service owner changed');
          map.set(key+':'+def.scheduleId,true);
          return;
        }
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
  let alarmSync=Promise.resolve();
  function syncAlarms({removedNames}={}){
    // A stale native create must finish before uninstall's clear/readback.
    // Queued synchronizations read definitions only when their turn begins.
    const next=alarmSync.then(async()=>{
      await syncAlarmsNow(await currentOwnerValidity());
      if(removedNames)invariant(!(await api.alarms.getAll()).some(alarm=>removedNames.has(alarm.name)),
        'E_OUTCOME_UNKNOWN','Uninstalled schedule alarm cleanup is not confirmed');
    });
    alarmSync=next.catch(()=>{});
    return next;
  }
  async function syncAlarmsNow(ownerValidity){
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
    const uninstalledOwners=await uninstalledScheduleOwners();
    const activeDocumentIds=await scheduledHostDocumentIds(api);
    const activeAppServiceDocumentIds=await scheduledHostDocumentIds(api,{profile:'app-service'});
    const ownerValidity=await currentOwnerValidity();
    const changed=await repo.reconcile({activeDocumentIds,activeAppServiceDocumentIds,ownerValidity,uninstalledOwners});
    await syncAlarms();
    if(changed.length)await signal();
    return changed;
  }
  async function cleanupUninstalledToolSchedules(request,sender){
    invariant(request&&Object.keys(request).length===1&&/^[a-z][a-z0-9-]{1,39}$/.test(request.toolId),
      'E_SCHEMA','Only an uninstalled tool ID is accepted');
    // This one internal Installer operation also serves Marketplace recovery.
    // Neither Marketplace nor Offscreen gains a general Host registration.
    let source;
    try{source=new URL(sender?.url);}catch{invariant(false,'E_OWNER','Installer URL is invalid');}
    const market=new URL(api.runtime.getURL('ui/marketplace.html'));
    const marketplace=source?.protocol===market.protocol&&source.host===market.host&&[market.pathname,'/ui/market-install.html'].includes(source.pathname);
    if(!marketplace){
      sender=await resolveToolSender(api,sender);
      invariant(isToolSender(api,sender)&&sender.url!==api.runtime.getURL(CLOUD_RUNNER_DOCUMENT_PATH),
        'E_OWNER','Schedule cleanup requires an actual Installer document');
    }
    invariant(sender?.id===api.runtime.id&&typeof sender.documentId==='string'&&sender.documentId.length>0&&
      (sender.frameId===undefined||sender.frameId===0)&&!sender.tab?.incognito&&
      (!sender.documentLifecycle||sender.documentLifecycle==='active'),
      'E_OWNER','Schedule cleanup requires an active Installer document');
    const contexts=await api.runtime.getContexts({documentUrls:[sender.url],documentIds:[sender.documentId]});
    invariant(Array.isArray(contexts)&&contexts.length===1&&contexts[0].documentId===sender.documentId&&
      contexts[0].documentUrl===sender.url&&contexts[0].frameId===0&&!contexts[0].incognito&&
      (sender.tab?contexts[0].contextType==='TAB'&&sender.frameId===0&&
        Number.isSafeInteger(sender.tab.id)&&sender.tab.id>=0&&contexts[0].tabId===sender.tab.id:
        !marketplace&&contexts[0].contextType==='SIDE_PANEL'),
      'E_OWNER','Installer native document is missing or changed');
    invariant(api.alarms?.getAll&&api.alarms?.clear&&api.alarms?.create,
      'E_SERVICE_UNSUPPORTED','Native scheduler cleanup is unavailable');
    // Snapshot exact old owners before checking the registry. The caller holds
    // the existing tool/catalog locks, and its journal blocks reinstalls.
    const definitions=await repo.definitions({includeDeleted:true});
    const local=await api.storage.local.get([SIDEBAR_TOOL_STORE,TOOL_CLEANUP_STORE]);
    const pending=requirePendingToolCleanups(local[TOOL_CLEANUP_STORE]);
    invariant(Object.hasOwn(pending,request.toolId),'E_OWNER','No pending uninstall authorizes schedule cleanup');
    const raw=local[SIDEBAR_TOOL_STORE];
    invariant(Array.isArray(raw),'E_STORAGE_CORRUPT','Installed tool registry is unavailable');
    let ids;
    try{ids=raw.map(tool=>validateSidebarToolPackage(tool).id);}
    catch{invariant(false,'E_STORAGE_CORRUPT','Installed tool registry is corrupt');}
    invariant(new Set(ids).size===ids.length,'E_STORAGE_CORRUPT','Duplicate installed tool identity');
    invariant(!ids.includes(request.toolId),'E_OWNER','Installed tool cannot be cleaned');
    const owned=definitions.filter(def=>def.owner?.toolId===request.toolId);
    await repo.reconcile({uninstalledOwners:new Set(owned.map(def=>ownerKey(def.owner))),
      ownerValidity:await currentOwnerValidity(),activeDocumentIds:await scheduledHostDocumentIds(api),
      activeAppServiceDocumentIds:await scheduledHostDocumentIds(api,{profile:'app-service'})});
    const names=new Set(owned.map(def=>SCHEDULE_ALARM_PREFIX+def.scheduleId));
    await syncAlarms({removedNames:names});
    return {toolId:request.toolId,schedulesRetired:true,alarmsCleared:true};
  }
  async function saveSchedule(request,sender){
    await checkSender(sender);
    invariant(request?.profile!=='app-service','E_USER_GESTURE_REQUIRED','App service schedules require installed-app approval');
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
    const origins=[...new Set(schedules.filter(row=>row.profile!=='app-service').map(row=>new URL(row.targetUrl).origin))];
    const grants=new Map(await Promise.all(origins.map(async origin=>[
      origin,api.permissions?.contains?await api.permissions.contains({origins:[permissionPattern(origin)]}).catch(()=>false):false
    ])));
    const ownerValidity=await currentOwnerValidity();
    return {schedules:schedules.map(row=>({...row,
      needsAttention:row.needsAttention||(row.profile==='app-service'?
        ownerValidity.get(ownerKey(row.owner)+':'+row.scheduleId)!==true:
        grants.get(new URL(row.targetUrl).origin)!==true)}))};
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
    invariant(request&&typeof request==='object'&&!Array.isArray(request)&&
      (Object.keys(request).length===0||Object.keys(request).length===1&&request.profile==='app-service'),'E_SCHEMA');
    await reconcile();
    return {fires:await repo.ready({profile:request.profile,ownerValidity:await currentOwnerValidity()})};
  }
  async function hasPendingAppServices(){
    await reconcile();
    return (await repo.ready({profile:'app-service',ownerValidity:await currentOwnerValidity()})).length>0;
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
    if(publicRequest.service==='background'){
      validateTrustedAppServiceScheduleIntent(intent,publicRequest);
      const checkedOwner=await checkOwner(owner,'browser.scheduler.create');
      const {tool,binding}=await readAppServiceInstallation(api,checkedOwner.toolId);
      invariant(tool.version===checkedOwner.toolVersion&&binding.packageHash===checkedOwner.packageHash&&
        binding.generation===checkedOwner.epoch,'E_OWNER','App service installation differs from owner');
      const timezone='UTC',trigger=scheduleSpecFromExpression(publicRequest.schedule,timezone);
      if(trigger.triggerKind==='once')invariant(trigger.triggerSpec.at>clock.now(),
        'E_SCHEMA','One-time execution must be in the future');
      await reconcile();
      const row=await repo.saveOwned({profile:'app-service',appId:binding.appId,appBinding:binding,
        owner:checkedOwner,title:tool.title,params:{},targetUrl:null,openIfMissing:false,
        timezone,...trigger,misfirePolicy:'skip',startDeadlineMs:300000,paused:false},checkedOwner);
      await reconcile();
      return {scheduleRef:row.scheduleId,status:row.paused?'pending':'active'};
    }
    const input=validateTrustedScheduleIntent(intent,publicRequest);
    const checkedOwner=await checkOwner(owner,'browser.scheduler.create',new URL(input.targetUrl).origin);
    invariant(await api.permissions.contains({origins:[permissionPattern(new URL(input.targetUrl).origin)]}),
      'E_PERMISSION','Grant website access before scheduling');
    if(input.triggerKind==='once')invariant(input.triggerSpec.at>clock.now(),'E_SCHEMA','One-time execution must be in the future');
    await reconcile();
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
    return {schedules:rows.slice(0,100).map(row=>({scheduleRef:row.scheduleRef,
      ...(row.profile==='app-service'?{profile:'app-service',appId:row.appId,service:'background'}:{taskId:row.taskId}),status:row.status}))};
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
    if(definition.profile==='app-service'){
      const checkedOwner=await checkOwner(definition.owner,'browser.scheduler.listOwn');
      const {tool}=await assertAppServiceBinding(api,definition.appBinding);
      invariant(definition.appId===checkedOwner.toolId&&tool.version===checkedOwner.toolVersion&&
        definition.appBinding.packageHash===checkedOwner.packageHash&&
        definition.appBinding.generation===checkedOwner.epoch,'E_OWNER','App service owner changed');
      return checkedOwner;
    }
    const origin=new URL(definition.targetUrl).origin;
    const checkedOwner=await checkOwner(definition.owner,'browser.scheduler.listOwn',origin);
    invariant(await api.permissions.contains({origins:[permissionPattern(origin)]}),
      'E_PERMISSION','Scheduled target origin permission was revoked');
    return checkedOwner;
  }
  return {saveSchedule,changeSchedule,listSchedules,listScheduleHistory,listDueSchedules,setScheduleFireState,onAlarm,reconcile,cleanupUninstalledToolSchedules,
    create,listOwn,cancelOwn,prepareAdmission,hasPendingAppServices,
    admit:repo.admit,bind:repo.bind};
}
