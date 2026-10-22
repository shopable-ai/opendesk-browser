import test from 'node:test';
import assert from 'node:assert/strict';
import {settingsReactFixture} from '../helpers/trusted-settings-react-fixture.mjs';

const focusModel={visible:true,canGrant:true,busy:false,clearReview:false,
  phase:'active',currentAction:'add',currentPageHost:'example.com'};
const click=(f,id)=>{
  const event=new f.window.Event('click',{bubbles:true});
  f.find(id).dispatchEvent(event);
  return event;
};

test('Focus phases preserve start, retry, stop and current-site control availability',t=>{
  const f=settingsReactFixture('stayFocus',t);
  for(const [phase,start,retry,stop,quick] of [
    [undefined,null,false,false,false],['checking',null,false,false,false],
    ['first','开启 Stay Focus',false,false,false],
    ['needs-permission','开启 Stay Focus',false,false,false],
    ['reauthorize','重新开启 Stay Focus',false,false,false],
    ['stopped','重新开启 Stay Focus',false,false,true],
    ['active',null,false,true,true],['unverified',null,true,true,true],
    ['error',null,true,false,false],['disabled',null,false,false,false]
  ]){
    f.ui.render({...focusModel,phase});
    assert.equal(f.find('stay-focus-enable-native')?.textContent.trim()??null,start,String(phase));
    assert.equal(!!f.find('stay-focus-status-retry'),retry,String(phase));
    assert.equal(!!f.find('stay-focus-disable'),stop,String(phase));
    assert.equal(!!f.find('stay-focus-current-trusted'),quick,String(phase));
  }
  f.ui.render({...focusModel,phase:'first',canGrant:false});
  assert.equal(f.find('stay-focus-enable-native').disabled,true);
  assert.equal(f.find('stay-focus-more-actions'),null);
  f.ui.render({...focusModel,visible:false});
  assert.equal(f.find('stay-focus-trusted-settings').hidden,true);
  assert.equal(f.find('stay-focus-current-trusted'),null);
  f.ui.render(null);
  assert.equal(f.root.children.length,0);
});

test('Focus current-site buttons forward native clicks synchronously and honor busy state',t=>{
  const f=settingsReactFixture('stayFocus',t),calls=[];
  f.ui.connect({quickAdd:event=>calls.push(event),refreshQuick:()=>calls.push('refresh')});
  for(const [currentAction,id,label,disabled] of [
    ['add','stay-focus-current-add','加入',false],
    ['paused','stay-focus-current-add','恢复',false],
    ['managed','stay-focus-current-pause','暂停',false],
    ['error','stay-focus-current-retry','重试读取',false],
    ['loading','stay-focus-current-add','正在核对',true],
    ['unavailable','stay-focus-current-add','加入',true]
  ]){
    f.ui.render({...focusModel,currentAction});
    const section=f.find('stay-focus-current-trusted'),button=f.find(id);
    assert.equal(section.querySelectorAll('button').length,1);
    assert.equal(button.textContent,label);
    assert.equal(button.disabled,disabled);
    const before=calls.length,event=click(f,id);
    assert.equal(calls.length,before+(disabled?0:1));
    if(!disabled)assert.equal(calls.at(-1),currentAction==='error'?'refresh':event);
    f.ui.render({...focusModel,currentAction,busy:true});
    assert.equal(f.find(id).disabled,true);
    const count=calls.length;click(f,id);assert.equal(calls.length,count);
  }
  f.ui.render({...focusModel,currentPageHost:'<script>private</script>'});
  assert.equal(f.root.querySelector('script'),null);
  assert.match(f.find('stay-focus-current-trusted').textContent,/<script>private/);
});

test('Focus settings preserve native events, clear confirmation and busy guards',t=>{
  const f=settingsReactFixture('stayFocus',t),calls=[];
  let model={...focusModel},clears=0;
  const render=patch=>f.ui.render(model={...model,...patch});
  f.ui.connect({
    grant:event=>calls.push(['grant',event]),stop:event=>calls.push(['stop',event]),
    refreshQuick:()=>calls.push(['refresh']),
    openClear:event=>{calls.push(['open',event]);render({clearReview:true});},
    cancelClear:event=>{calls.push(['cancel',event]);render({clearReview:false});},
    approveClear:event=>{calls.push(['approve',event]);clears++;render({clearReview:false});}
  });
  render({phase:'first'});
  const grant=click(f,'stay-focus-enable-native');assert.deepEqual(calls.pop(),['grant',grant]);
  render({phase:'unverified'});
  const stop=click(f,'stay-focus-disable');assert.deepEqual(calls.pop(),['stop',stop]);
  click(f,'stay-focus-status-retry');assert.deepEqual(calls.pop(),['refresh']);
  assert.equal(f.find('stay-focus-clear-confirm').hidden,true);
  const open=click(f,'stay-focus-clear-open');assert.deepEqual(calls.pop(),['open',open]);
  assert.equal(f.find('stay-focus-clear-confirm').hidden,false);assert.equal(clears,0);
  const cancel=click(f,'stay-focus-clear-cancel');assert.deepEqual(calls.pop(),['cancel',cancel]);
  assert.equal(f.find('stay-focus-clear-confirm').hidden,true);assert.equal(clears,0);
  click(f,'stay-focus-clear-open');calls.length=0;
  const approve=click(f,'stay-focus-clear-approve');assert.deepEqual(calls.pop(),['approve',approve]);
  assert.equal(f.find('stay-focus-clear-confirm').hidden,true);assert.equal(clears,1);
  for(const phase of ['first','unverified']){
    render({phase,busy:true,clearReview:true});
    for(const button of f.find('stay-focus-trusted-settings').querySelectorAll('button')){
      assert.equal(button.disabled,true,button.id);click(f,button.id);
    }
    assert.equal(calls.length,0);assert.equal(clears,1);
  }
  assert.equal(f.find('stay-focus-clear-confirm').hidden,false);
});

test('AI settings preserve toggle/local activation events and interruptible busy actions',t=>{
  const f=settingsReactFixture('aiAccess',t),calls=[];
  f.ui.connect({toggle:event=>calls.push(['toggle',event]),activate:event=>calls.push(['activate',event])});
  const model={visible:true,badge:'已停止',status:'等待启用',actionLabel:'启用代理',
    actionDisabled:false,busy:false,pressed:false,error:'',localTestEnabled:false};
  f.ui.render(model);
  assert.equal(f.root.querySelectorAll('button').length,1);
  assert.equal(f.find('ai-access-local-activate'),null);
  assert.equal(f.find('ai-access-error').hidden,true);
  assert.equal(f.find('ai-access-toggle').textContent,'启用代理');
  const toggle=click(f,'ai-access-toggle');assert.deepEqual(calls.pop(),['toggle',toggle]);
  f.ui.render({...model,busy:true,pressed:true,actionLabel:'停用代理',localTestEnabled:true,
    activateDisabled:false,error:'<script>proxy error</script>'});
  const button=f.find('ai-access-toggle');
  assert.equal(button.disabled,false,'pending enable must remain stoppable');
  assert.equal(button.getAttribute('aria-busy'),'true');
  assert.equal(button.getAttribute('aria-pressed'),'true');
  assert.equal(button.textContent,'停用代理');
  const stop=click(f,'ai-access-toggle');assert.deepEqual(calls.pop(),['toggle',stop]);
  const activate=click(f,'ai-access-local-activate');assert.deepEqual(calls.pop(),['activate',activate]);
  assert.equal(f.find('ai-access-error').hidden,false);
  assert.equal(f.root.querySelector('script'),null);
  assert.equal(f.find('ai-access-error').textContent,'<script>proxy error</script>');
  f.ui.render({...model,busy:true,localTestEnabled:true,actionDisabled:true,activateDisabled:true});
  for(const id of ['ai-access-toggle','ai-access-local-activate']){
    assert.equal(f.find(id).disabled,true);click(f,id);
  }
  assert.equal(calls.length,0);
  f.ui.render({...model,visible:false});assert.equal(f.find('ai-access-trusted-controls').hidden,true);
  f.ui.render(null);assert.equal(f.root.children.length,0);
});

for(const [kind,target] of [['timeReview','time-review-clear-open'],['stayFocus','stay-focus-clear-open']]){
  test(`${kind} effects preserve focus, scroll, dependency and component scope`,t=>{
    const f=settingsReactFixture(kind,t),calls=[];
    const model=kind==='stayFocus'?focusModel:{visible:true,busy:false,origins:[]};
    f.ui.render(model);
    const node=f.find(target);
    node.focus=options=>calls.push(['focus',options]);
    node.scrollIntoView=options=>calls.push(['scroll',options]);
    const effect={target,kind:'focus'};
    f.ui.render({...model,effect});assert.deepEqual(calls,[['focus',{preventScroll:true}]]);
    f.ui.render({...model,effect});assert.equal(calls.length,1,'same effect is not replayed');
    f.ui.render({...model,effect:{target,kind:'scroll'}});
    assert.deepEqual(calls.at(-1),['scroll',{block:'nearest'}]);
    f.ui.render({...model,visible:false,effect:{target,kind:'focus'}});
    assert.equal(calls.length,2,'hidden settings cannot steal focus');
    const outside=f.doc.createElement('button');outside.id='outside-settings';
    outside.focus=()=>assert.fail('effect escaped its settings root');f.doc.body.append(outside);
    f.ui.render({...model,effect:{target:outside.id,kind:'focus'}});
    assert.equal(calls.length,2);
  });
}
