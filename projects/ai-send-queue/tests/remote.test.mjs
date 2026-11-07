import test from 'node:test';
import assert from 'node:assert/strict';
import {createSendQueueRemote,SEND_QUEUE_REMOTE_GLOBAL} from '../src/page/remote.js';

function fixture(){
  const world={},destructors=[];let active=true,route='c/12345678',phase='waiting';
  let rows=[{id:'q1',text:'hello',state:'queued'},{id:'q2',text:'world',state:'queued'}];
  let remote,editCount=0,nowCount=0,removeCount=0;
  const owner={active:()=>active,onDispose:fn=>destructors.push(fn)};
  const site={inspect:()=>({ok:true,route})};
  const emit=()=>remote?.changed();
  const engine={
    view:()=>({route:'c/12345678',phase,reason:'',answerGate:null,inFlight:null,items:rows.map(x=>({...x}))}),
    pause:id=>{const x=rows.find(x=>x.id===id);if(x?.state!=='queued')return false;x.state='paused';emit();return true},
    resume:id=>{const x=rows.find(x=>x.id===id);if(x?.state!=='paused')return false;x.state='queued';emit();return true},
    move:(id,index)=>{const i=rows.findIndex(x=>x.id===id);if(i<0||index<0||index>=rows.length)return false;const [x]=rows.splice(i,1);rows.splice(index,0,x);emit();return true},
    remove:id=>{removeCount++;rows=rows.filter(x=>x.id!==id);emit();return true}
  };
  const actions={edit:()=>{editCount++;emit();return true},sendNow:()=>{nowCount++;emit();return true}};
  remote=createSendQueueRemote({owner,site,engine,actions,world,randomId:()=>'test-instance'});
  return {request:world[SEND_QUEUE_REMOTE_GLOBAL],world,remote,setRoute:v=>route=v,setPhase:v=>phase=v,
    counts:()=>({editCount,nowCount,removeCount}),rows:()=>rows,
    destroy:()=>{active=false;destructors.forEach(fn=>fn())}};
}
test('snapshot is memory-only and cleanup revokes world handle',()=>{
  const x=fixture(),s=x.request({operation:'snapshot'});
  assert.equal(s.status,'ready');assert.equal(s.items.length,2);
  assert.equal(s.memoryOnly,true);assert.equal(s.revision,0);
  x.destroy();assert.equal(x.world[SEND_QUEUE_REMOTE_GLOBAL],undefined);
});
test('pause and resume bump revision, stale requests cannot repeat writes',()=>{
  const x=fixture(),s=x.request({operation:'snapshot'});
  const a=x.request({operation:'pause',id:'q1',instance:s.instance,revision:s.revision});
  assert.equal(a.effect,'applied');assert.equal(a.items[0].state,'paused');assert.equal(a.revision,1);
  const b=x.request({operation:'pause',id:'q1',instance:s.instance,revision:s.revision});
  assert.equal(b.status,'stale');assert.equal(b.revision,1);
  const c=x.request({operation:'resume',id:'q1',instance:s.instance,revision:a.revision});
  assert.equal(c.effect,'applied');assert.equal(c.items[0].state,'queued');x.destroy();
});
test('a changed ChatGPT route hides contents and denies commands',()=>{
  const x=fixture(),s=x.request({operation:'snapshot'});x.setRoute('c/elsewhere');
  const a=x.request({operation:'snapshot'});
  assert.equal(a.status,'wrong-session');assert.equal(a.items,undefined);
  const b=x.request({operation:'remove',id:'q1',instance:s.instance,revision:s.revision});
  assert.equal(b.status,'wrong-session');assert.equal(x.rows().length,2);x.destroy();
});
test('unknown state rejects deletion and does not remove queue rows',()=>{
  const x=fixture(),s=x.request({operation:'snapshot'});x.setPhase('unknown');
  const a=x.request({operation:'remove',id:'q1',instance:s.instance,revision:s.revision});
  assert.equal(a.effect,'rejected');assert.equal(x.counts().removeCount,0);x.destroy();
});
test('edit and now reuse only existing Page actions',()=>{
  const x=fixture(),s=x.request({operation:'snapshot'});
  const a=x.request({operation:'now',id:'q1',instance:s.instance,revision:s.revision});
  assert.equal(a.effect,'applied');assert.equal(x.counts().nowCount,1);
  const b=x.request({operation:'edit',id:'q2',instance:s.instance,revision:a.revision});
  assert.equal(b.effect,'applied');assert.equal(x.counts().editCount,1);x.destroy();
});
