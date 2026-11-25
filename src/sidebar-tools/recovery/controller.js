import {extensionRecoveryAccounts} from './account.js';
import {assertSidebarToolRuntime} from '../runtime-compatibility.js';
import {loadBundledOfficialCatalog,loadOfficialTool} from '../official-catalog.js';
import {canonicalSha256,getInstalledSidebarTools,installReviewedSidebarTool,reconcileMarketOperation,
  MARKET_PROVENANCE_STORE,validMarketProvenance,MARKET_OPERATIONS_STORE} from '../../ui/sidebar-tools/installation.js';
import {SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE,requireToolEnableRecords,
  requireToolRevocationEpochs} from '../../ui/sidebar-tools/lifecycle.js';
import {sidebarToolStorageKey,SIDEBAR_TOOL_DATA_LIMITS} from '../../ui/sidebar-tools/package.js';
import {sameStorageValue,writeVerifiedLocalValue} from '../../ui/sidebar-tools/storage-state.js';
import {isPortableSidebarPackage,matchesRecoveryRelease} from './eligibility.js';
import {accountSlot,libraryStorage,validRecoveryAccountId} from './library-storage.js';
import {knowledgeAnswersRecoveryData as dataAdapter} from '../../../projects/ai-knowledge-answers/trusted/recovery-data.js';

export const RECOVERY_DEVICE_STORE='opendesk.extension-recovery.device.v1';
const lockName='opendesk.extension-recovery';
const dataKey=sidebarToolStorageKey(dataAdapter.id);
const appId=/^[a-z][a-z0-9-]{1,39}$/;
const version=/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const hex=/^[a-f0-9]{64}$/;
const operationId=/^[a-f0-9-]{36}$/;
const record=value=>value&&typeof value==='object'&&!Array.isArray(value);
const fail=(code)=>Object.assign(new Error(code),{code});
const bytes=value=>new TextEncoder().encode(JSON.stringify(value)).length;
const qkey=row=>row.kind+':'+row.id;
const exact=(entry,tool,source,hash)=>Boolean(tool&&entry?.source==='official'&&entry.id===tool.id&&
  entry.version===tool.version&&entry.hash===hash&&validMarketProvenance(source)&&
  !source.sourceId&&source.version===tool.version&&source.sha256===hash&&source.marketId==='opendesk/'+tool.id);

function validateSnapshot(value){
  if(!record(value)||!Array.isArray(value.entries)||value.entries.length>250||
    value.entries.some(row=>!record(row)||Object.keys(row).sort().join(',')!=='enabled,hash,id,kind,source,title,version'||
      !['app','page'].includes(row.kind)||typeof row.id!=='string'||
      !(row.kind==='app'?appId:/^[a-zA-Z0-9][\w.-]{0,159}$/).test(row.id)||
      typeof row.title!=='string'||!row.title||row.title.length>180||
      !['official','local','unverified','page'].includes(row.source)||typeof row.enabled!=='boolean'||
      !(row.version===null||typeof row.version==='string'&&version.test(row.version))||
      !(row.hash===null||typeof row.hash==='string'&&hex.test(row.hash)))||
    new Set(value.entries.map(qkey)).size!==value.entries.length||
    !(value.data===null||record(value.data)&&Object.keys(value.data).sort().join(',')==='hash,id,schema,value,version'&&
      value.data.id===dataAdapter.id&&typeof value.data.hash==='string'&&hex.test(value.data.hash)&&
      typeof value.data.version==='string'&&version.test(value.data.version)&&Number.isSafeInteger(value.data.schema)))
    throw fail('E_RECOVERY_SNAPSHOT');
  // Data schema/shape is checked separately, so invalid data cannot block
  // viewing the installation list or overwrite a good local value.
  return value;
}

export function createExtensionRecovery({api,lockManager=globalThis.navigator?.locks,accounts=extensionRecoveryAccounts,
  readPages=async()=>null,openReview=()=>false,openImport=()=>false,notify=null}={}){
  let generation=0,view={loading:true},pending=false,refreshQueued=false,disposed=false;
  const listeners=new Set();
  const publish=next=>{view=next;for(const fn of listeners)fn();};
  const deviceLock=work=>lockManager?.request?lockManager.request(lockName,work):Promise.reject(fail('E_TOOL_LOCK'));
  const toolLock=(id,work)=>lockManager.request('opendesk.sidebar-tools:tool:'+id,work);
  const assertAccount=async account=>{if(await account.isCurrent()!==true)throw fail('E_ACCOUNT_CHANGED');};
  async function snapshot(account){
    await assertAccount(account);
    const result=await account.read();
    await assertAccount(account);
    if(typeof result?.revision!=='string'||!result.revision)throw fail('E_RECOVERY_SNAPSHOT');
    return {...result,value:validateSnapshot(result.value)};
  }
  async function device(account){
    const raw=(await api.storage.local.get(RECOVERY_DEVICE_STORE))[RECOVERY_DEVICE_STORE];
    if(raw!==undefined&&!record(raw))throw fail('E_STORAGE_CORRUPT');
    const slot=accountSlot(account.id),row=raw?.[slot]??{auto:false,data:false,attempts:{}};
    if(!record(row)||typeof row.auto!=='boolean'||typeof row.data!=='boolean'||!record(row.attempts)||
      Object.entries(row.attempts).some(([id,op])=>!appId.test(id)||typeof op!=='string'||!operationId.test(op)))
      throw fail('E_STORAGE_CORRUPT');
    return {row,async put(next){await assertAccount(account);await writeVerifiedLocalValue(api,RECOVERY_DEVICE_STORE,
      {...raw,[slot]:next},raw,'扩展恢复设置');}};
  }
  async function local(){
    const [tools,raw]=await Promise.all([getInstalledSidebarTools(api),api.storage.local.get([
      MARKET_PROVENANCE_STORE,SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE,MARKET_OPERATIONS_STORE])]);
    const sources=raw[MARKET_PROVENANCE_STORE]??{},operations=raw[MARKET_OPERATIONS_STORE]??{};
    if(!record(sources)||!record(operations))throw fail('E_STORAGE_CORRUPT');
    return {tools,sources,operations,enabled:requireToolEnableRecords(raw[SIDEBAR_TOOL_ENABLE_STORE]),
      epochs:requireToolRevocationEpochs(raw[TOOL_REVOCATION_EPOCHS_STORE])};
  }
  function pendingInstall(state,id){
    return Object.entries(state.operations).find(([,op])=>(op?.toolId===id||op?.marketId==='opendesk/'+id)&&
      !['succeeded','failed','cancelled'].includes(op.state))?.[0]??null;
  }
  async function installStatus(state,settings,id){
    const pending=pendingInstall(state,id),attempt=settings.attempts[id];
    if(pending){
      // A registry entry alone cannot authorize data restore while its journal is unresolved.
      await reconcileMarketOperation(api,pending).catch(()=>null);
      return 'unknown';
    }
    if(attempt){
      const receipt=await reconcileMarketOperation(api,attempt).catch(()=>null);
      if(receipt?.state==='succeeded')return 'restored';
      if(receipt?.state==='failed')return 'reviewFailed';
      const original=state.operations[attempt];
      if(original?.state==='succeeded'&&state.epochs[id]!==original.installEpoch)
        return state.tools.some(tool=>tool.id===id)?'installed':'localRemoval';
      return 'unknown';
    }
    if(state.tools.some(tool=>tool.id===id))return 'installed';
    return state.epochs[id]?'localRemoval':null;
  }
  async function catalog(){return (await loadBundledOfficialCatalog({api})).apps;}
  async function save(account,previous,value){
    await assertAccount(account);
    validateSnapshot(value);
    let failure;
    try{await account.write(previous.revision,value);}catch(error){failure=error;}
    let result;
    try{result=await snapshot(account);}catch{throw fail('E_RECOVERY_UNKNOWN');}
    if(sameStorageValue(result.value,value))return result;
    if(failure&&result.revision===previous.revision&&failure.code!=='E_OUTCOME_UNKNOWN')throw failure;
    throw fail(failure?.code==='E_RECOVERY_CONFLICT'?'E_RECOVERY_CONFLICT':'E_RECOVERY_UNKNOWN');
  }
  async function plan(account,saved,settings,releases,state,pages){
    return Promise.all(saved.value.entries.map(async entry=>{
      const tool=state.tools.find(tool=>tool.id===entry.id);
      const release=entry.kind==='app'?releases.find(row=>row.toolId===entry.id):null;
      const review=Boolean(release&&!release.remoteCommit&&!release.sourceId);
      let status='reviewSource';
      if(entry.kind==='page')status=pages?.some(row=>row.programId===entry.id)?'installed':'reviewPage';
      else{
        const installed=await installStatus(state,settings,entry.id);
        if(installed)status=installed;
        else if(entry.source==='official'&&release&&entry.version===release.version&&entry.hash===release.sha256)
          status=matchesRecoveryRelease(entry,release)?(settings.auto?'ready':'off'):'reviewCapabilities';
      }
      return {...entry,key:qkey(entry),status,review,localVersion:entry.kind==='app'?tool?.version??null:null};
    }));
  }
  async function restoreInstall(account,saved,entry){
    const before=await device(account),state=await local();
    if(!before.row.auto||before.row.attempts[entry.id]||state.epochs[entry.id]||
       state.tools.some(tool=>tool.id===entry.id)||pendingInstall(state,entry.id))return;
    const release=(await catalog()).find(row=>row.toolId===entry.id);
    if(!matchesRecoveryRelease(entry,release))return;
    const {tool}=await loadOfficialTool(release,{api});
    if(!isPortableSidebarPackage(tool))throw fail('E_RECOVERY_REVIEW');
    await assertSidebarToolRuntime(api);
    const operation=crypto.randomUUID();
    await installReviewedSidebarTool({api,lockManager,candidate:tool,baseline:null,
      baselineInstallEpoch:null,baselineProvenance:null,
      market:{marketId:release.id,version:release.version,sha256:release.sha256,operationId:operation},
      // Consumed only for this exact previously reviewed release after explicit
      // device consent; the standard installer still owns commit and journal.
      reviewApproved:true,commitIntent:async()=>{
        if((await snapshot(account)).revision!==saved.revision)throw fail('E_RECOVERY_CONFLICT');
        const latest=await device(account);
        if(!latest.row.auto||latest.row.attempts[entry.id]||pendingInstall(await local(),entry.id))
          throw fail('E_RECOVERY_CONFLICT');
        await latest.put({...latest.row,attempts:{...latest.row.attempts,[entry.id]:operation}});
      }});
    if((await reconcileMarketOperation(api,operation,tool)).state!=='succeeded')throw fail('E_RECOVERY_UNKNOWN');
  }
  async function getDataTool(settings){
    const state=await local(),tool=state.tools.find(tool=>tool.id===dataAdapter.id);
    if(!tool||state.enabled[tool.id]===false||!['installed','restored'].includes(await installStatus(state,settings,tool.id)))return null;
    const hash=await canonicalSha256(tool),release=(await catalog()).find(row=>row.toolId===tool.id);
    const entry={id:tool.id,kind:'app',source:'official',version:tool.version,hash,enabled:true};
    if(!exact(entry,tool,state.sources[tool.id],hash)||!matchesRecoveryRelease(entry,release)||
       !isPortableSidebarPackage(tool))return null;
    return entry;
  }
  async function dataStatus(account,saved,settings,{apply=false}={}){
    if(!settings.data)return 'dataOff';
    if(!saved.value.data)return 'dataEmpty';
    const remote=saved.value.data;
    let value;
    try{if(remote.schema!==dataAdapter.schema)throw fail('E_RECOVERY_DATA');value=dataAdapter.validate(remote.value);}
    catch{return 'dataInvalid';}
    return toolLock(dataAdapter.id,async()=>{
      await assertAccount(account);
      const entry=await getDataTool(settings);
      if(!entry||entry.hash!==remote.hash||entry.version!==remote.version)return 'dataWaiting';
      const raw=(await api.storage.local.get(dataKey))[dataKey];
      const slot=libraryStorage(raw??{},account,{claim:true,hash:entry.hash});
      if(slot.incompatible||Object.hasOwn(raw??{},dataAdapter.key))return 'dataConflict';
      if(slot.value!==null)return sameStorageValue(slot.value,value)?'dataRestored':'dataConflict';
      if(!apply)return 'dataAvailable';
      if((await snapshot(account)).revision!==saved.revision)throw fail('E_RECOVERY_CONFLICT');
      await assertAccount(account);
      const next=slot.replace(value);
      checkToolQuota(next);
      await writeVerifiedLocalValue(api,dataKey,next,raw,'扩展恢复数据');
      return 'dataRestored';
    });
  }
  function checkToolQuota(next){
    if(Object.keys(next).length>SIDEBAR_TOOL_DATA_LIMITS.maxKeys||bytes(next)>SIDEBAR_TOOL_DATA_LIMITS.totalBytes)
      throw fail('E_TOOL_DATA_LIMIT');
  }
  async function backupData(account,saved){
    const settings=(await device(account)).row;
    if(!settings.data)throw fail('E_RECOVERY_CONSENT');
    return toolLock(dataAdapter.id,async()=>{
      const entry=await getDataTool(settings);
      if(!entry)throw fail('E_RECOVERY_REVIEW');
      const raw=(await api.storage.local.get(dataKey))[dataKey];
      const slot=libraryStorage(raw??{},account,{claim:true,hash:entry.hash});
      if(slot.incompatible)throw fail('E_RECOVERY_CONFLICT');
      if(slot.value===null)throw fail('E_RECOVERY_NO_DATA');
      const value=dataAdapter.validate(slot.value),previous=saved.value.data;
      if(previous&&!sameStorageValue(previous.value,value))throw fail('E_RECOVERY_CONFLICT');
      const next=slot.replace(value);checkToolQuota(next);
      await assertAccount(account);
      if(!sameStorageValue(next,raw))await writeVerifiedLocalValue(api,dataKey,next,raw,'扩展恢复数据归属');
      return save(account,saved,{...saved.value,data:{id:dataAdapter.id,schema:dataAdapter.schema,
        version:entry.version,hash:entry.hash,value}});
    });
  }
  async function backupList(account,saved,pages){
    const state=await local();
    const apps=await Promise.all(state.tools.map(async tool=>{
      const source=state.sources[tool.id],hash=await canonicalSha256(tool);
      const base={kind:'app',id:tool.id,title:tool.title.slice(0,180),version:tool.version,hash,
        source:'official',enabled:state.enabled[tool.id]!==false};
      return {...base,source:exact(base,tool,source,hash)?'official':source?'unverified':'local'};
    }));
    const pageRows=(pages??[]).map(page=>({kind:'page',id:page.programId,
      title:String(page.title||page.name||page.programId).slice(0,180),version:version.test(page.version??'')?page.version:null,
      hash:hex.test(page.sourceHash??'')?page.sourceHash:null,source:'page',
      enabled:page.enabled===true&&page.authorization?.status==='active'&&!page.error}));
    // Device uninstall is never an account deletion. A save upserts entries.
    const entries=[...new Map([...saved.value.entries,...apps,...pageRows].map(entry=>[qkey(entry),entry])).values()];
    return save(account,saved,{...saved.value,entries});
  }
  async function run(action='refresh',input={}){
    if(disposed||pending)return;
    pending=true;
    const request=++generation;
    const previous=view;
    publish(action==='refresh'?{loading:true}:{...view,busy:true,error:null});
    try{
      const next=await deviceLock(async()=>{
        const account=await accounts.current();
        if(!account)return {unavailable:true};
        if(!validRecoveryAccountId(account.id))throw fail('E_ACCOUNT_CHANGED');
        if(action!=='refresh'&&previous.accountId!==account.id)throw fail('E_ACCOUNT_CHANGED');
        let saved=await snapshot(account),settings=await device(account);
        if(action!=='refresh'&&previous.revision!==saved.revision)throw fail('E_RECOVERY_CONFLICT');
        if(action==='auto'||action==='data'){
          await settings.put({...settings.row,[action]:input.enabled===true});
          settings=await device(account);
        }
        const pages=await readPages().catch(()=>null);
        if(action==='saveList')saved=await backupList(account,saved,pages);
        if(action==='saveData')saved=await backupData(account,saved);
        if(action==='remove'){
          const entry=saved.value.entries.find(row=>qkey(row)===input.key);
          if(!entry||!sameStorageValue(entry,input.entry))throw fail('E_RECOVERY_CONFLICT');
          saved=await save(account,saved,{...saved.value,entries:saved.value.entries.filter(row=>row!==entry)});
        }
        if(action==='removeData')saved=await save(account,saved,{...saved.value,data:null});
        const releases=await catalog().catch(()=>[]);
        let rows=await plan(account,saved,settings.row,releases,await local(),pages);
        let installError=null;
        if((action==='refresh'||action==='auto')&&settings.row.auto){
          for(const entry of rows.filter(row=>row.status==='ready')){
            try{await restoreInstall(account,saved,entry);}catch(error){
              if(error.code==='E_ACCOUNT_CHANGED'||error.code==='E_RECOVERY_CONFLICT')throw error;
              installError=error.code||'E_RECOVERY_INSTALL';
              entry.status=error.code==='E_RECOVERY_REVIEW'?'reviewCapabilities':'reviewFailed';
            }
          }
          const after=await plan(account,saved,(await device(account)).row,releases,await local(),pages);
          rows=after.map((row,index)=>row.status==='ready'?rows[index]:row);
        }
        settings=await device(account);
        const dataState=await dataStatus(account,saved,settings.row,{apply:['refresh','auto','data'].includes(action)});
        await assertAccount(account);
        return {accountId:account.id,accountLabel:account.label,test:account.test===true,revision:saved.revision,
          auto:settings.row.auto,data:settings.row.data,hasData:saved.value.data!==null,dataState,rows,
          pagesKnown:pages!==null,error:installError,feedback:['saveList','saveData','remove','removeData'].includes(action)?'saved':null};
      });
      if(request===generation){
        if(next.feedback&&notify){
          try{if(notify(next.feedback))next.feedback=null;}catch{/* Keep the inline receipt. */}
        }
        publish(next);
      }
    }catch(error){
      if(request===generation)publish({error:error.code||'E_RECOVERY_OFFLINE'});
    }finally{
      pending=false;
      if(refreshQueued){refreshQueued=false;void run();}
    }
  }
  return {getSnapshot:()=>view,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},run,
    start(){
      const stop=accounts.subscribe?.(()=>{
        if(disposed)return;
        ++generation;publish({loading:true});
        // Hide the previous identity immediately. The new snapshot waits for
        // the pending operation to finish its account fence.
        if(pending)refreshQueued=true;else void run();
      });
      if(stop)void run();
      return ()=>{disposed=true;++generation;stop?.();listeners.clear();};
    },
    async review(entry,accountId){
      const account=await accounts.current();
      if(!account||account.id!==accountId||await account.isCurrent()!==true)return false;
      if(entry.review){
        const release=(await catalog()).find(row=>row.toolId===entry.id);
        if(release&&!release.remoteCommit&&!release.sourceId)return openReview(entry.id,release);
      }
      return openImport();
    }};
}
