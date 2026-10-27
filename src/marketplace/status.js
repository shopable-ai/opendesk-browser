// Read the existing registry and operation journal. This stores no parallel state
// and needs no network, so an unavailable market cannot hide a committed result.
import {SIDEBAR_TOOL_STORE,sidebarToolPackageHash} from '../ui/sidebar-tools/package.js';
import {MARKET_OPERATIONS_STORE,MARKET_PROVENANCE_STORE,requireCompleteInstalledSidebarTools,compareToolVersions} from '../ui/sidebar-tools/installation.js';
import {SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE,requireToolEnableRecords,requireToolRevocationEpochs} from '../ui/sidebar-tools/lifecycle.js';
import {MARKET_BATCH_STORE,readMarketBatch} from './batch.js';
import {getOfficialCollection} from './catalog.js';

export function marketExpectedIdentity(handoff,operation){
  const sha256=handoff.sha256||handoff.pageReview?.sha256||operation?.sha256;
  return {marketId:handoff.subject.marketId,version:handoff.subject.version,...(sha256?{sha256}:{})};
}
export async function readMarketInstallStatus(api,handoff){
  const stored=await api.storage.local.get([SIDEBAR_TOOL_STORE,MARKET_PROVENANCE_STORE,MARKET_OPERATIONS_STORE,SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE,MARKET_BATCH_STORE]);
  return statusFromStored(stored,handoff);
}
async function statusFromStored(stored,handoff){
  const subject=handoff.subject;
  if(subject.kind==='collection'){
    const result={installation:handoff.consumedAt!=null?'unknown':'review',progress:null,
      currentInstallation:'not-installed',installedVersion:null,enabled:null,
      handoffClosed:handoff.closureReason==='unknown-without-journal'&&handoff.settledAt!=null};
    const batch=readMarketBatch(stored[MARKET_BATCH_STORE]),collection=getOfficialCollection(subject.collectionId,subject.revision);
    if(!batch||batch.batchId!==handoff.operationId||batch.collectionId!==subject.collectionId||batch.revision!==subject.revision)return result;
    if(!collection||batch.items.length!==collection.members.length||batch.items.some((item,index)=>
      item.id!==collection.members[index].id||item.version!==collection.members[index].version))return {...result,installation:'unknown'};
    const checked=await Promise.all(batch.items.map(item=>statusFromStored(stored,{subject:{kind:'app',marketId:item.id,version:item.version},
      consumedAt:handoff.consumedAt,operationId:item.operationId})));
    const complete=checked.filter((row,index)=>batch.items[index].status==='skip'?row.currentInstallation==='installed':
      ['succeeded','already-installed'].includes(batch.items[index].status)&&row.installation==='installed').length;
    result.progress='已核对 '+complete+'/'+batch.items.length+' 项';
    result.installation=complete===batch.items.length?'installed':batch.items.some(item=>item.status==='outcome-unknown')?'unknown':
      batch.items.some(item=>['queued','committing'].includes(item.status))?'installing':
      batch.items.every(item=>item.status==='cancelled')?'cancelled':
      batch.items.some(item=>['failed','blocked','interrupted','cancelled'].includes(item.status))?'failed':'unknown';
    return result;
  }
  const tool=subject.kind==='app'?requireCompleteInstalledSidebarTools(stored[SIDEBAR_TOOL_STORE]).find(row=>row.id===subject.marketId.split('/')[1]):null;
  const source=tool&&stored[MARKET_PROVENANCE_STORE]?.[tool.id];
  const verified=Boolean(tool&&source?.marketId===subject.marketId&&source.version===tool.version&&
    /^[a-f0-9]{64}$/.test(source.sha256)&&await sidebarToolPackageHash(tool)===source.sha256);
  const enabled=verified?requireToolEnableRecords(stored[SIDEBAR_TOOL_ENABLE_STORE])[tool.id]!==false:null;
  const currentInstallation=!verified?'not-installed':tool.version===subject.version?'installed':
    compareToolVersions(tool.version,subject.version)<0?'update-available':'different-version';
  const op=handoff.operationId?stored[MARKET_OPERATIONS_STORE]?.[handoff.operationId]:null;
  const cancelled=handoff.cancelledAt!=null||handoff.pageReview?.cancelledAt!=null;
  let installation=handoff.consumedAt!=null?'unknown':cancelled?'cancelled':'review';
  let completedAndRemoved=false;
  if(op){
    const identity=marketExpectedIdentity(handoff,op);
    const matches=op.marketId===subject.marketId&&op.version===subject.version&&op.toolId===subject.marketId.split('/')[1]&&
      /^[a-f0-9]{64}$/.test(op.sha256)&&op.sha256===identity.sha256;
    const epochMatches=!Object.hasOwn(op,'installEpoch')||typeof op.installEpoch==='string'&&
      requireToolRevocationEpochs(stored[TOOL_REVOCATION_EPOCHS_STORE])[op.toolId]===op.installEpoch;
    // A matching acknowledged transaction stays terminal after uninstall. This
    // closes only its handoff; it neither claims a current install nor retries it.
    completedAndRemoved=matches&&op.state==='succeeded'&&handoff.consumedAt!=null&&!cancelled&&
      !tool&&stored[MARKET_PROVENANCE_STORE]?.[op.toolId]===undefined;
    if(!matches)installation='unknown';
    else if(op.state==='failed')installation='failed';
    else if(op.state==='succeeded'&&verified&&tool.version===subject.version&&source.sha256===op.sha256&&epochMatches&&!cancelled)
      installation='installed';
    else installation='unknown';
  }
  return {installation,progress:op?.state||null,currentInstallation,installedVersion:verified?tool.version:null,enabled,
    handoffClosed:completedAndRemoved||handoff.closureReason==='unknown-without-journal'&&handoff.settledAt!=null};
}
