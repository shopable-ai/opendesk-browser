import {patchDeveloperField,developerOptions} from './develop-view.js';
import {decodeValue} from '../platform/page-port/codec.js';
import {invariant} from '../platform/protocol.js';
import {formatControllerRunResult,formatRunValue,runValueKind} from './run-result-presentation.js';

// Own only durable Controller history/result display. No source, RunHost,
// Page, Local or permission ownership is copied into this view.
export function createControllerResultsView({host,view,resultDownloads,isDisposed,isRunning,
  getOwnedRunId,isLocalPageResultCurrent,onUpdate,onStatus,
  setResultText,setResultKind,displayCopyResult,showRecovery,hideRecovery}){
  const find=id=>view.fields[id],copyResult=find('script-copy-result'),
    runningTargetStatus=find('script-running-target'),scriptsRecovery=find('script-user-scripts-recovery');
  let projection,currentTask,snapshotSequence=0;
  const stateLabels = {preparing:'正在准备',running:'运行中',stopping:'正在停止',settling:'正在保存结果',
    retiring:'正在释放资源',completed:'已完成',failed:'失败',stopped:'已停止',interrupted:'已中断',paused_unknown:'状态待确认'};
  function renderTask(run) {
    if (isDisposed()) return;
    currentTask = run;
    patchDeveloperField(view,find('script-task-id'),{textContent:run ? `runId：${run.runId}` : '尚未运行'});
    patchDeveloperField(view,find('script-task-status'),{textContent:run ? `${stateLabels[run.state] || run.state} · ${run.retirementState === 'released' ? '资源已释放' : '以后台回执为准'}` : ''});
    patchDeveloperField(view,find('script-task-version'),{textContent:run?.revision
      ? run.sourceKind === 'draft' || run.revision.kind === 'draft'
        ? `草稿快照 · SHA-256 ${run.revision.sourceHash}`
        : `${run.revision.scriptId} · r${run.revision.revision} · ${run.revision.sourceHash}` : ''});
    const target=run?.target;
    patchDeveloperField(view,runningTargetStatus,{data:{...runningTargetStatus.data,state:run?.state||'idle'},
      textContent:target?`运行目标：${target.url||target.allowedOrigin||'已冻结文档'}`:'运行目标：尚未建立',
      title:target?JSON.stringify({runId:run.runId,tabId:target.tabId,frameId:target.frameId,
        documentId:target.documentId,url:target.url,origin:target.allowedOrigin||target.origin}):''});
  }
  function showSnapshot(snapshot) {
    if (isDisposed()) return;
    projection = snapshot;
    // Controller history must not overwrite the current local Page result.
    if(isLocalPageResultCurrent({allowResolving:true})){onUpdate();return;}
    // Defense in depth: even a malformed/stale host projection cannot put a
    // revoked result in the visible text, history payload or download selector.
    const deniedRuns = new Set(snapshot.resultDeliveryDenied || []);
    const values = snapshot.results.filter(row => !deniedRuns.has(row.runId)).map(row => {
      return {tag:row.tag,runId:row.runId,resultId:row.resultId,state:row.state,sourceKind:row.sourceKind || 'saved',
        revision:row.revision && {scriptId:row.revision.scriptId,revision:row.revision.revision,sourceHash:row.revision.sourceHash},
        sourceHash:row.revision?.sourceHash,
        ...(row.outcome?.ok === true ? {value:decodeValue(row.outcome.valueWire)} : {error:row.outcome?.error})};
    });
    resultDownloads.showResults(snapshot.results,deniedRuns);
    const task = currentTask && snapshot.runs.find(row=>row.runId === currentTask.runId);
    if (task) renderTask(task);
    else if (!isRunning() && !host.currentRun && snapshot.run) renderTask(snapshot.run);
    else if (!currentTask && !isRunning() && !host.currentRun && snapshot.runs.length) renderTask(snapshot.runs.at(-1));
    if (!snapshot.run) {
      // Publish the complete history once, keeping an existing selection.
      const history = find('script-history-run');
      developerOptions(view,history,[{label:'选择历史任务',value:''},
        ...snapshot.runs.map(row=>({label:`${row.runId} · ${row.sourceKind === 'draft' ? '草稿' : 'r' + (row.revision?.revision ?? '?')} · ${stateLabels[row.state] || row.state}`,value:row.runId}))]);
      patchDeveloperField(view,find('script-history-open'),{disabled:!history.value});
      patchDeveloperField(view,find('script-history'),{textContent:formatRunValue({runs:snapshot.runs,results:values,downloads:snapshot.downloads,resultDeliveryDenied:snapshot.resultDeliveryDenied})});
    }
    onUpdate();
    const focused = snapshot.run || currentTask;
    onStatus('results', focused ? '任务状态：' : '已读取持久结果');
    // The result is the decoded value, not runId/revision/sourceHash/transport metadata.
    // Authorized technical history stays available in the existing collapsed panel.
    setResultText(formatControllerRunResult(values, focused?.runId, snapshot.resultDeliveryDenied));
    const currentValues = values.filter(row => row.runId === focused?.runId);
    const visibleResult = currentValues[0];
    setResultKind(!visibleResult ? '暂无返回值' : currentValues.length > 1
      ? `共 ${currentValues.length} 项结果` : Object.hasOwn(visibleResult,'value')
        ? runValueKind(visibleResult.value) : '执行错误');
    patchDeveloperField(view,copyResult,{disabled:!visibleResult || deniedRuns.has(focused?.runId)});
    displayCopyResult('复制结果');
    if (visibleResult?.error?.code === 'E_USER_SCRIPTS_UNAVAILABLE') {
      if (scriptsRecovery?.data.state !== 'available') showRecovery();
    } else if (visibleResult) hideRecovery();
    // Reveal genuine outcome only for this session's own draft; old history
    // stays collapsed on ordinary entry, preserving editor working space.
    if (getOwnedRunId() && values.some(row => row.runId === getOwnedRunId()))
      patchDeveloperField(view,find('developer-results-panel'),{open:true});
  }
  async function read(runId = find('script-run-id').value.trim(),{reveal=false}={}) {
    if (isDisposed()) return;
    const token = ++snapshotSequence;
    try {
      const snapshot = await host.controller.snapshotControllerRun(runId ? {runId} : {});
      if (!isDisposed() && token === snapshotSequence){
        if(reveal)invariant(snapshot.run?.runId===runId,'E_RUN','原始运行记录不存在或身份已变化');
        showSnapshot(snapshot);
        if(reveal){
          patchDeveloperField(view,find('developer-results-panel'),{open:true});
          patchDeveloperField(view,find('script-history-panel'),{open:true});
        }
      }
    } catch (error) {if (!isDisposed() && token === snapshotSequence) throw error;}
  }
  function clearProjection(){projection=undefined;}
  function setProjection(value){projection=value;}
  return {renderTask,read,setProjection,clearProjection,get projection(){return projection;},get currentTask(){return currentTask;}};
}
