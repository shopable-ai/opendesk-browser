import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createSidebarToolPackage,encodeSidebarToolPackage}
  from '../../../../scripts/build-sidebar-tool.mjs';
import {validateSidebarToolPackage,SIDEBAR_TOOL_FORMAT}
  from '../../../../src/ui/sidebar-tools/package.js';

const root=new URL('../',import.meta.url).pathname;
test('ui.notify laboratory uses one valid standalone v1 tool and no capabilities',async()=>{
  const pkg=validateSidebarToolPackage(await createSidebarToolPackage(root));
  assert.equal(pkg.id,'ui-notify-demo');
  assert.equal(pkg.version,'1.2.0');
  assert.equal(pkg.format,SIDEBAR_TOOL_FORMAT);
  assert.deepEqual(pkg.capabilities,[]);
  assert.match(pkg.html,/通知组件实验室/);
  for(const key of ['info','success','warning','error','group','separate',
    'persistent','duration','legacy','invalid','loading-success','loading-fail','handle-close','rate-probe','add','stack'])
    assert.match(pkg.html,new RegExp('data-sample="'+key+'"'));
  assert.match(pkg.js,/tool\.ui\?\.notify/);
  assert.match(pkg.js,/notify\.open/);
  assert.match(pkg.js,/handle\.update/);
  assert.match(pkg.js,/record\.handle\.dismiss/);
  assert.match(pkg.js,/retryAfterMs/);
  assert.doesNotMatch(pkg.js,/\bchrome\.(?:tabs|runtime|scripting|storage)\b/);
  assert.equal(typeof pkg.background,'undefined');
  assert.equal(typeof pkg.controller,'undefined');
  assert.equal(typeof pkg.pageModule,'undefined');
});
test('checked-in demo package (when present) matches current tested source bytes',async t=>{
  const pkg=await createSidebarToolPackage(root);
  const bytes=encodeSidebarToolPackage(pkg);
  let existing;
  try{existing=await readFile(process.env.UI_NOTIFY_DEMO_CANDIDATE||new URL('../ui-notify-demo.opendesk-tool.json',import.meta.url));}
  catch(error){
    if(error.code==='ENOENT'){t.skip('Formal package not yet promoted; candidate generated separately');return;}
    throw error;
  }
  assert.equal(existing.toString('utf8'),bytes.toString('utf8'),
    'do not hand-edit installable JSON; promote exact packer output');
});

import vm from 'node:vm';
import {createToolUiNoticeRateGate} from '../../../../src/sidebar-tools/ui-notice.js';
import {createSidebarToolsView} from '../../../../src/ui/sidebar-tools-view.js';
const source=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
function laboratory({legacy=false,deferReady=false}={}){
  class Element{
    constructor(){this.textContent='';this.children=[];this.dataset={};}
    append(...nodes){this.children.push(...nodes);}
    replaceChildren(...nodes){this.children=nodes;}
  }
  const fields=Object.fromEntries(['result','budget','history','position','timeout'].map(key=>[key,new Element()]));
  fields.position.value='top-center';fields.timeout.value='5000';
  let listener,hide,time=1000,interval,cleared=false,sends=0,updates=0;
  const deferred=[],timers=[];
  const view=createSidebarToolsView(),gate=createToolUiNoticeRateGate({now:()=>time});
  const root={ownerDocument:{createElement:()=>new Element()},contains:()=>true,
    querySelector:selector=>fields[selector.replace('#notify-demo-','')],
    addEventListener:(_type,fn)=>{listener=fn;},removeEventListener:()=>{listener=null;}};
  function admit(value){
    sends++;
    const admission=gate.admit('laboratory');
    if(!admission.accepted)return {receipt:{status:'rejected',reason:'rate_limited',retryAfterMs:admission.retryAfterMs}};
    const id=view.addToolToast(value.message,value,'laboratory');
    return {id,receipt:id?{status:'accepted',reason:'host_state'}:{status:'rejected',reason:'overflow'}};
  }
  const notify=value=>{
    if(value?.action)return false;
    sends++;
    if(gate.allow('laboratory'))view.showToast(typeof value==='string'?value:value.message,{...value,owner:'laboratory'});
    return true;
  };
  if(!legacy)notify.open=value=>{
    const opened=admit(value);
    return {
      ready:deferReady?new Promise(resolve=>deferred.push(()=>resolve(opened.receipt))):Promise.resolve(opened.receipt),
      update:async value=>{
        updates++;
        return {status:view.updateToolToast(opened.id,value.message,value,'laboratory')?'accepted':'rejected',reason:'host_state'};
      },
      dismiss:async()=>{
        const found=view.hasToast(opened.id,'laboratory');view.dismissToast(opened.id);
        return {status:found?'accepted':'rejected',reason:found?'host_state':'not_found'};
      }
    };
  };
  vm.runInNewContext(source,{OpenDeskTool:{root,ui:{notify}},
    Date:{now:()=>time},setTimeout:fn=>timers.push(fn),
    setInterval:fn=>{interval=fn;return 1;},clearInterval:()=>{cleared=true;},
    addEventListener:(_type,fn)=>{hide=fn;}});
  return {fields,view,click(sample){
    const button={dataset:{sample},closest(){return this;}};listener({target:button});
  },close(id){const button={dataset:{close:String(id)},closest(){return this;}};listener({target:button});},
  texts:()=>fields.history.children.map(li=>li.children[0].textContent),
  advance(ms){time+=ms;interval();},finishTask(){for(const fn of timers.splice(0))fn();},
  releaseReady(){for(const fn of deferred.splice(0))fn();},hide:()=>hide(),
  get sends(){return sends;},get updates(){return updates;},get cleared(){return cleared;}};
}

test('three rapid adds are independent; fourth rejection stays visible without delayed sending',async()=>{
  const lab=laboratory();
  for(let i=0;i<4;i++)lab.click('add');
  await flush();
  assert.equal(lab.view.getSnapshot().toasts.length,3);
  assert.equal(new Set(lab.view.getSnapshot().toasts.map(row=>row.message)).size,3);
  assert.equal(lab.texts().filter(text=>text.includes('Host 已接纳')).length,3);
  assert.match(lab.texts()[0],/#4.*限频拒绝/);
  assert.match(lab.fields.budget.textContent,/60 秒/);
  lab.close(2);await flush();
  assert.equal(lab.view.getSnapshot().toasts.length,2);
  lab.click('add');await flush();
  assert.match(lab.texts()[0],/限频拒绝/,'closing does not refund creation budget');
  const sends=lab.sends;
  lab.advance(60001);await flush();
  assert.equal(lab.sends,sends,'countdown must not replay rejected requests');
  assert.match(lab.fields.budget.textContent,/手动再试/);
  lab.click('add');await flush();
  assert.match(lab.texts()[0],/Host 已接纳/);
});

test('batch stack stays until close; duplicate legacy uses the original grouping path',async()=>{
  const lab=laboratory();lab.click('stack');await flush();
  assert.equal(lab.view.getSnapshot().toasts.length,3);
  assert.ok(lab.view.getSnapshot().toasts.every(row=>row.timeout===0));
  lab.close(1);await flush();assert.equal(lab.view.getSnapshot().toasts.length,2);
  const grouped=laboratory();grouped.click('group');await flush();
  assert.equal(grouped.view.getSnapshot().toasts.length,1);
  assert.equal(grouped.view.getSnapshot().toasts[0].count,2);
  assert.ok(grouped.texts().every(text=>text.includes('无 Host 回执')));
});

test('outstanding receipts survive later clicks and history stays bounded',async()=>{
  const lab=laboratory({deferReady:true});
  lab.click('add');lab.click('add');lab.releaseReady();await flush();
  assert.equal(lab.texts().filter(text=>text.includes('Host 已接纳')).length,2);
  for(let i=0;i<20;i++)lab.click('add');
  lab.releaseReady();await flush();
  assert.equal(lab.texts().length,12);
  assert.match(lab.texts()[0],/#22/);
});

test('manual close cancels late demo updates; pagehide stops timers and pending writes',async()=>{
  const closed=laboratory();closed.click('loading-success');await flush();
  closed.click('handle-close');await flush();closed.finishTask();await flush();
  assert.equal(closed.updates,0);assert.equal(closed.view.getSnapshot().toasts.length,0);
  const hidden=laboratory();hidden.click('loading-success');await flush();
  hidden.hide();hidden.finishTask();await flush();
  assert.equal(hidden.updates,0);assert.equal(hidden.cleared,true);
});

test('legacy bridge and invalid input remain honest about missing receipts',async()=>{
  const lab=laboratory({legacy:true});lab.click('add');await flush();
  assert.match(lab.texts()[0],/旧 Bridge 无 Host 回执/);
  lab.click('invalid');await flush();assert.match(lab.texts()[0],/本地拒绝/);
  assert.equal(lab.sends,1);
});
