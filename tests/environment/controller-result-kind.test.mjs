import test from 'node:test';
import assert from 'node:assert/strict';
import {createDeveloperView} from '../../src/ui/develop-view.js';
import {createControllerResultsView} from '../../src/ui/controller-results-view.js';
import {encodeValue} from '../../src/platform/page-port/codec.js';

for (const [state,expected] of [['stopped','已停止'],['interrupted','已中断'],['failed','执行错误']]) {
  test(`original ${state} run keeps its outcome label and recorded error`,async t=>{
    const view=createDeveloperView();t.after(()=>view.dispose());
    let kind='',text='';
    const run={runId:'original-run',state,retirementState:'released'};
    const result={runId:run.runId,resultId:'original-result',state,
      outcome:{ok:false,error:{code:'E_CLOUD_CANCELLED',message:'Controller fenced'}}};
    const owner=createControllerResultsView({view,
      host:{currentRun:null,controller:{snapshotControllerRun:async()=>({run,runs:[run],results:[result],downloads:[]})}},
      resultDownloads:{showResults(){}},isDisposed:()=>false,isRunning:()=>false,
      getOwnedRunId:()=>'',isLocalPageResultCurrent:()=>false,onUpdate(){},onStatus(){},
      setResultText:value=>{text=value;},setResultKind:value=>{kind=value;},
      displayCopyResult(){},showRecovery(){},hideRecovery(){}});
    await owner.read(run.runId,{reveal:true});
    assert.equal(kind,expected);
    assert.match(text,/E_CLOUD_CANCELLED：Controller fenced/);
    assert.equal(owner.projection.results[0].resultId,'original-result');
    assert.equal(owner.currentTask.state,state);
    result.outcome={ok:true,valueWire:encodeValue('original value')};
    await owner.read(run.runId,{reveal:true});
    assert.equal(kind,'字符串','a real return value keeps its value type');
    assert.equal(text,'original value');
  });
}
