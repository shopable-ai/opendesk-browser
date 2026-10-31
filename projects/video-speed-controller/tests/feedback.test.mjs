import test from 'node:test';
import assert from 'node:assert/strict';
import {notifyVideoSpeed} from '../trusted/host.js';
import {showPageToast} from '../../../src/scripting/user-scripts/page-toast.js';

function fixture(){
  const calls=[],target={windowId:1,tabId:4,documentId:'video-doc',url:'https://media.example/watch',origin:'https://media.example'};
  return {calls,access:{api:{scripting:{executeScript:async request=>{
    calls.push(request);return [{frameId:0,documentId:target.documentId,result:{shown:true}}];
  }}},currentPageTarget:{capture:()=>target,revalidate:async()=>{}},assertCurrent(){},assertInstalled:async()=>{}}};
}
test('feedback shows independently verified speed, reset and actual player override',async()=>{
  const f=fixture();
  for(const [result,message,variant] of [
    [{status:'available',speed:0.25,requested:0.25,verified:true},'视频倍速 · 0.25×','success'],
    [{status:'available',speed:4,requested:4,verified:true},'视频倍速 · 4×','success'],
    [{status:'available',speed:1.25,requested:1.25,verified:true},'视频倍速 · 1.25×','success'],
    [{status:'available',speed:1,requested:1,verified:true},'视频倍速 · 已恢复 1×','success'],
    [{status:'available',speed:1,requested:2,verified:false},'视频倍速 · 目标 2× 未生效，实际 1×','warning']
  ]){
    await notifyVideoSpeed({...f.access,result});const request=f.calls.at(-1);
    assert.equal(request.func,showPageToast);assert.deepEqual(request.target,{tabId:4,documentIds:['video-doc']});
    assert.equal(request.args[0].position,'top');
    assert.equal(request.args[0].message,message);assert.equal(request.args[0].variant,variant);
  }
});
test('no-video and unknown outcomes do not claim success or expose uncontrolled exception text',async()=>{
  const f=fixture();
  await notifyVideoSpeed({...f.access,error:{code:'E_VIDEO_NOT_FOUND',message:'secret page text'}});
  assert.equal(f.calls.at(-1).args[0].message,'视频倍速 · 未找到可调速的视频');
  await notifyVideoSpeed({...f.access,error:{code:'E_OUTCOME_UNKNOWN',message:'secret page text'}});
  assert.equal(f.calls.at(-1).args[0].message,'视频倍速 · 操作未确认，请在侧栏重新检测');
  assert.equal(f.calls.at(-1).args[0].variant,'warning');
  assert.deepEqual(await notifyVideoSpeed({...f.access,result:{status:'no-video'}}),{shown:false});
  assert.equal(f.calls.length,2);
});

test('feedback transport failure is attempted once and never requests a media write',async()=>{
  const f=fixture();
  f.access.api.scripting.executeScript=async request=>{
    f.calls.push(request);throw Error('feedback transport lost');
  };
  await assert.rejects(notifyVideoSpeed({...f.access,
    result:{status:'available',speed:2,requested:2,verified:true}}),/feedback transport lost/);
  assert.equal(f.calls.length,1);
  assert.equal(f.calls[0].func,showPageToast);
  assert.equal(f.calls[0].args[0].position,'top');
});
