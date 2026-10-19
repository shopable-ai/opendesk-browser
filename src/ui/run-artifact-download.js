import {patchDeveloperField,developerOptions,appendDeveloperOptions} from './develop-view.js';
import {base64ToBytes} from '../platform/page-port/codec.js';
import {hashArtifactBytes} from '../platform/downloads/blob-lifecycle.js';
import {BUDGETS,invariant} from '../platform/protocol.js';

// One ephemeral UI owner for artifact downloads. The original Host/SW still
// own durable attempts, SHA receipts and extension Blob resource authority.
export function createRunArtifactDownload({client,host,document:doc,view=null,onState=()=>{}}){
  const find=id=>view?view.fields[id]:doc.getElementById(id);
  const resultSelect=find('script-download-result'),downloadStatus=find('script-download-status');
  const downloadable=new Map(),downloads=new Map(),preparations=new Map();
  let downloading=false,disposed=false;
  function update(){
    patchDeveloperField(view,find('script-download'),{disabled:downloading||!downloadable.has(resultSelect.value)});
  }
  const notify=()=>{update();onState();};
  function showResults(rows,deniedRuns=new Set()){
    const selected=resultSelect.value;
    downloadable.clear();developerOptions(view,resultSelect,[{label:'请选择要下载的结果',value:''}]);
    for(const row of rows){
      if(deniedRuns.has(row.runId)||row.state!=='completed'||row.outcome?.ok!==true)continue;
      downloadable.set(row.resultId,row);
      appendDeveloperOptions(view,resultSelect,[{label:`${row.runId} · ${row.sourceKind==='draft'?'草稿':'r'+row.revision.revision}`,value:row.resultId}]);
    }
    if(downloadable.has(selected))patchDeveloperField(view,resultSelect,{value:selected});
    update();
  }
  async function observeDownload(attemptId) {
    const entry = downloads.get(attemptId);
    if (!entry || disposed) return;
    entry.timer=null;
    try {
      const observation = await client.request('reconcileDownload',{attemptId});
      if (disposed) return;
      entry.attempt = observation.attempt;
      patchDeveloperField(view,downloadStatus,{textContent:`下载 ${observation.attempt.state} · ${entry.sha256}`});
      entry.localRevoked ||= host.artifactResources.release(observation.attempt);
      if (entry.localRevoked) {
        await client.request('recordResourceRelease',{attemptId}); downloads.delete(attemptId);
        patchDeveloperField(view,downloadStatus,{textContent:observation.receipt?.browserDownloadComplete === true
          ? `浏览器已完成下载 · 产物 SHA-256 ${entry.sha256}（磁盘文件待核对）` : `下载 ${observation.attempt.state}，资源已释放 · ${entry.sha256}`});
      } else entry.timer = setTimeout(() => observeDownload(attemptId),1000);
    } catch (error) {
      patchDeveloperField(view,downloadStatus,{textContent:`${error.code || 'E_EFFECT_UNKNOWN'}：${error.message}；${entry.localRevoked ? '本地 Blob 已释放，等待后台确认' : '保留资源与原尝试'}`});
      if (!disposed) entry.timer = setTimeout(() => observeDownload(attemptId),1000);
    }
  }
  async function retirePreparation(entry) {
    entry.timer=null;
    try {
      const retired=await client.request('retirePreparedArtifact',{artifactId:entry.artifactId});
      for(const attemptId of retired.attemptIds) await client.request('recordResourceRelease',{attemptId});
      preparations.delete(entry.artifactId);
      patchDeveloperField(view,downloadStatus,{textContent:'未提交的下载已取消，本地资源与后台记录已收尾'});
    } catch(error) {
      patchDeveloperField(view,downloadStatus,{textContent:`${error.code || 'E_EFFECT_UNKNOWN'}：未提交的 Blob 已在本地释放，等待后台取消确认`});
      if(!disposed) entry.timer=setTimeout(()=>retirePreparation(entry),1000);
    }
  }
  async function downloadResult() {
    if (downloading) return;
    const row = downloadable.get(resultSelect.value);
    if (!row) throw {code:'E_RESULT',message:'请选择已完成的持久结果'};
    downloading = true; notify(); patchDeveloperField(view,downloadStatus,{textContent:'正在准备持久结果文件…'});
    try {
      const prepared = await client.request('prepareArtifact',{requestId:crypto.randomUUID(),runId:row.runId,
        resultId:row.resultId,filename:`result-${row.runId}.json`,format:'typed-json'});
      const {artifact,blocks} = await client.request('readArtifact',{artifactId:prepared.artifactId});
      invariant(artifact.artifactId === prepared.artifactId && Array.isArray(blocks) && blocks.length > 0 && blocks.length <= 64,
        'E_SCHEMA','Invalid artifact blocks');
      const parts = blocks.map(block => base64ToBytes(block));
      const size = parts.reduce((sum,part) => sum + part.length,0);
      invariant(size <= BUDGETS.maxArtifactBytes && size === artifact.bytes,'E_LIMIT','Artifact byte count differs');
      const bytes = new Uint8Array(size); let offset = 0;
      for (const part of parts) {bytes.set(part,offset); offset += part.length;}
      invariant(await hashArtifactBytes(bytes) === artifact.sha256,'E_HASH','Artifact hash differs');
      const blobUrl = host.artifactResources.create(bytes,artifact.mime);
      const preparation={requestId:crypto.randomUUID(),artifactId:artifact.artifactId,blobUrl};
      preparations.set(artifact.artifactId,preparation);
      let attempt;
      try { attempt = await client.request('prepareAttempt',preparation); }
      catch(error) {
        host.artifactResources.releaseUnsubmitted(blobUrl);
        retirePreparation(preparation); throw error;
      }
      preparations.delete(artifact.artifactId);
      downloads.set(attempt.attemptId,{attempt,sha256:artifact.sha256});
      // Accepted dispatch is distinct from browser download completion.
      try {
        await client.request('dispatchDownload',{attemptId:attempt.attemptId});
        patchDeveloperField(view,downloadStatus,{textContent:`已提交下载，等待浏览器完成 · ${artifact.sha256}`});
      } finally {observeDownload(attempt.attemptId);}
    } catch (error) {patchDeveloperField(view,downloadStatus,{textContent:`${error.code || 'E_EFFECT_UNKNOWN'}：${error.message || error}`});}
    finally {downloading = false; notify();}
  }
  return {showResults,update,downloadResult,
    busy:()=>downloading||preparations.size>0,
    resourceSnapshot:()=>({pending:Number(downloading)+preparations.size,
      timers:[...downloads.values(),...preparations.values()].filter(entry=>entry.timer!=null).length}),
    dispose(){
      disposed=true;
      for(const entry of [...downloads.values(),...preparations.values()]){clearTimeout(entry.timer);entry.timer=null;}
    }};
}
