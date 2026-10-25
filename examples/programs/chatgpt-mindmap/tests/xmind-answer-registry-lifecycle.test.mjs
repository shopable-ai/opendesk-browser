import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createAnswerRegistry} from '../src/answer-registry.js';

const deferred=()=>{
  let resolve,reject;
  const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
};

function setup({firstDestroy,firstTheme,firstStart,searchIdentity,createFailure,startFailure}={}){
  const {document}=parseHTML('<html><body><article data-testid="conversation-turn-1"><div data-message-author-role="assistant" data-message-id="A"><div class="markdown"><h2>Answer</h2><p>Original answer body</p></div></div><div data-testid="message-actions"><button data-testid="copy-turn-action-button">Copy</button></div></article></body></html>');
  const content=document.querySelector('.markdown'),handlers=new Map(),observers=[],views=[];
  if(searchIdentity){
    content.parentElement.removeAttribute('data-message-id');
    content.parentElement.setAttribute(searchIdentity,'answer-A');
  }
  // Linkedom does not implement CSS priority; retain the browser style contract.
  const style=content.style,priorities=new Map();
  // Assigning methods to Linkedom's style Proxy creates CSS declarations.
  // Wrap the element's style instead so restoration really checks priority.
  Object.defineProperty(content,'style',{value:{
    getPropertyValue:name=>style.getPropertyValue(name),
    getPropertyPriority:name=>priorities.get(name)||'',
    setProperty(name,value,priority=''){priorities.set(name,priority);style.setProperty(name,value);},
    removeProperty(name){priorities.delete(name);return style.removeProperty(name);}
  }});
  const owner={active:()=>true,on(target,type,listener){
    handlers.set(target,listener);return ()=>handlers.delete(target);
  },observe(target,listener,options){observers.push({listener,options});},
  setTimeout(){return 1;},setInterval(){return 1;}};
  const logs=[];
  const fakeWindow={location:{pathname:'/c/test',search:''},console:{error:(label,json)=>logs.push({label,record:JSON.parse(json)})}};
  const registry=createAnswerRegistry({document,window:fakeWindow,owner,css:'',
    programRevision:{version:'0.2.2',revision:3},
    createView(options){
      if(createFailure)throw createFailure;
      const index=views.length,host=document.createElement('section');
      let retirement;
    const view={host,options,destroyCalls:0,fullCalls:[],focusCalls:0,async start(){if(index===0&&firstStart)await firstStart.promise;if(startFailure)throw startFailure;},focusPrimary(){view.focusCalls++;},markStale(){},
        async setFull(value){view.fullCalls.push(value);},setTheme(){return index===0&&firstTheme?firstTheme.promise:Promise.resolve();},
        destroy(){
          if(!retirement){view.destroyCalls++;retirement=(index===0&&firstDestroy?firstDestroy.promise:Promise.resolve()).finally(()=>host.remove());}
          return retirement;
        }};
      views.push(view);return view;
    }});
  registry.start();
  const triggerHost=document.querySelector('[data-opendesk-chatgpt-mindmap="button"]');
  const trigger=triggerHost.shadowRoot.querySelector('button');
  const matches=trigger.matches.bind(trigger);
  trigger.matches=selector=>selector===':focus-visible'?false:matches(selector);
  return {registry,content,views,triggerHost,trigger,window:fakeWindow,observers,
    logs,assertNoDebugUI(){
      assert.equal(triggerHost.shadowRoot.querySelector('[role="alert"],details,pre'),null);
      assert.deepEqual([...triggerHost.shadowRoot.children].map(node=>node.localName),['style','button']);
    },
    click:()=>handlers.get(trigger)(),
    theme:()=>observers.find(row=>row.options.attributeFilter?.includes('class')).listener()};
}

test('refresh restores keyboard focus to the new view and keeps the fullscreen state',async()=>{
  const h=setup();await h.click();
  await h.views[0].options.onFullscreen();
  await h.views[0].options.onRefresh({focus:true});
  assert.equal(h.views[0].destroyCalls,1);
  assert.equal(h.views[1].focusCalls,1);
  assert.deepEqual(h.views[1].fullCalls,[true]);
  await h.registry.destroy();
});

test('refresh during reply streaming keeps the current view for an explicit retry',async()=>{
  const h=setup();await h.click();
  h.content.parentElement.setAttribute('data-is-streaming','true');
  assert.equal(await h.views[0].options.onRefresh({focus:true}),false);
  assert.equal(h.views.length,1);
  assert.equal(h.views[0].destroyCalls,0);
  h.content.parentElement.removeAttribute('data-is-streaming');
  await h.registry.destroy();
});

test('search message identity changes retire the previous reply view',async()=>{
  for(const attribute of ['data-chatgpt-search-message-ids','data-content-search-unit-key']){
    const h=setup({searchIdentity:attribute});await h.click();
    assert.ok(h.observers.some(row=>row.options.attributeFilter?.includes(attribute)));
    assert.ok(h.observers.some(row=>row.options.attributeFilter?.includes('data-talvt-turn-state')));
    h.content.parentElement.setAttribute(attribute,'answer-B');h.registry.scan();
    await Promise.resolve();
    assert.equal(h.views[0].destroyCalls,1);
    assert.equal(h.trigger.getAttribute('aria-pressed'),'false');
    assert.notEqual(h.content.style.getPropertyValue('display'),'none');
    await h.registry.destroy();
  }
});

test('closing fullscreen retires directly and releases the next fullscreen owner',async()=>{
  const h=setup();
  for(let i=0;i<2;i++){
    await h.click();
    h.views[i].options.onFullscreen();
    await Promise.resolve();
    assert.deepEqual(h.views[i].fullCalls,[true]);
    await h.views[i].options.onOriginal();
    assert.deepEqual(h.views[i].fullCalls,[true], 'closing must not wait for an exit reflow');
    assert.equal(h.views[i].destroyCalls,1);
    assert.equal(h.views[i].host.isConnected,false);
    assert.equal(h.trigger.getAttribute('aria-pressed'),'false');
    assert.notEqual(h.content.style.getPropertyValue('display'),'none');
  }
  await h.registry.destroy();
});

test('official actions retain one visible toggle across open close reopen close',async()=>{
  const h=setup(),node=h.content,html=node.innerHTML,text=node.textContent;
  const group=h.triggerHost.parentElement,bar=group.parentElement;
  assert.equal(bar.getAttribute('data-testid'),'message-actions');
  assert.equal(group.hasAttribute('data-opendesk-chatgpt-answer-tools'),true);
  assert.equal(bar.lastElementChild,group);
  assert.equal(group.style.marginInlineStart,'auto');
  assert.equal(group.style.borderRadius,'12px');
  const native=bar.querySelector('[data-testid="copy-turn-action-button"]');
  assert.equal(bar.firstElementChild,native);
  for(let i=0;i<2;i++){
    await h.click();
    assert.equal(h.triggerHost.parentElement,group);
    assert.equal(h.triggerHost.hidden,false);
    assert.equal(h.trigger.textContent,'');
    assert.equal(h.trigger.querySelectorAll('svg').length,1);
    assert.equal(h.trigger.getAttribute('aria-pressed'),'true');
    await h.click();
    assert.equal(h.trigger.textContent,'');
    assert.equal(h.trigger.getAttribute('aria-pressed'),'false');
    assert.equal(h.triggerHost.hidden,false);
    assert.equal(node.isConnected,true);
    assert.equal(node.innerHTML,html);assert.equal(node.textContent,text);
    assert.notEqual(node.style.getPropertyValue('display'),'none');
    assert.equal(node.hasAttribute('aria-hidden'),false);
    assert.equal(bar.querySelectorAll('[data-opendesk-chatgpt-mindmap="button"]').length,1);
    assert.equal(h.views[i].destroyCalls,1);
  }
  await h.registry.destroy();
  assert.equal(group.isConnected,false);
  assert.equal(native.isConnected,true);
});

test('reply group reuses navigation and retires only its own mindmap host',async()=>{
  const h=setup(),group=h.triggerHost.parentElement,bar=group.parentElement;
  const navigation=bar.ownerDocument.createElement('span');
  navigation.setAttribute('data-opendesk-chatgpt-jump-top','trusted');
  group.prepend(navigation);
  for(let i=0;i<3;i++)h.registry.scan();
  assert.equal(bar.querySelectorAll('[data-opendesk-chatgpt-answer-tools]').length,1);
  assert.equal(group.querySelectorAll('[data-opendesk-chatgpt-mindmap="button"]').length,1);
  assert.equal(navigation.parentElement,group);
  await h.registry.destroy();
  assert.equal(group.isConnected,true);
  assert.equal(navigation.parentElement,group);
  assert.equal(h.triggerHost.isConnected,false);
});

test('reply group returns to the end without reordering its peers or native actions',async()=>{
  const h=setup(),group=h.triggerHost.parentElement,bar=group.parentElement;
  const navigation=bar.ownerDocument.createElement('span');group.prepend(navigation);
  const extra=bar.ownerDocument.createElement('button');bar.append(extra);
  const native=[...bar.children].filter(node=>node!==group);
  h.registry.scan();
  assert.equal(bar.lastElementChild,group);
  assert.deepEqual([...bar.children].filter(node=>node!==group),native);
  assert.deepEqual([...group.children],[navigation,h.triggerHost]);
  await h.registry.destroy();
  assert.equal(navigation.parentElement,group);
});

test('navigation remount keeps its controls before the mindmap',async()=>{
  const h=setup(),group=h.triggerHost.parentElement;
  const navigation=group.ownerDocument.createElement('span');
  navigation.setAttribute('data-opendesk-chatgpt-jump-top','prompt-shortcuts');
  for(let i=0;i<3;i++){
    group.append(navigation);h.registry.scan();
    assert.equal(group.firstElementChild===navigation,true);
    assert.equal(group.lastElementChild===h.triggerHost,true);
  }
  await h.registry.destroy();
  assert.equal(navigation.parentElement,group);
});

test('ambiguous reply groups fail closed without moving peers',async()=>{
  const h=setup(),group=h.triggerHost.parentElement,bar=group.parentElement;
  const duplicate=group.cloneNode(false);bar.append(duplicate);
  const before=[...bar.children];h.registry.scan();
  assert.deepEqual([...bar.children],before);
  assert.equal(h.triggerHost.parentElement,group);
  await h.registry.destroy();
  assert.equal(duplicate.isConnected,true);
});

test('DIL nested navigation background absorbs the outer mindmap without lifting native wrappers',async()=>{
  const h=setup(),oldGroup=h.triggerHost.parentElement,bar=oldGroup.parentElement;
  const row=bar.ownerDocument.createElement('div'),native=bar.firstElementChild;
  const wrapper=bar.ownerDocument.createElement('span');wrapper.append(native);row.append(wrapper);
  const group=bar.ownerDocument.createElement('span');group.setAttribute('data-opendesk-chatgpt-answer-tools','');
  const navigation=bar.ownerDocument.createElement('span');
  navigation.setAttribute('data-opendesk-chatgpt-jump-top','prompt-shortcuts');
  group.append(navigation);row.append(group);bar.prepend(row);
  for(let i=0;i<3;i++)h.registry.scan();
  assert.equal(bar.querySelectorAll('[data-opendesk-chatgpt-answer-tools]').length,1);
  assert.deepEqual([...group.children],[navigation,h.triggerHost]);
  assert.equal(group.parentElement,row);assert.equal(row.lastElementChild,group);
  assert.equal(native.parentElement,wrapper);assert.equal(wrapper.parentElement,row);
  assert.equal(oldGroup.isConnected,false);
  await h.click();await h.click();await h.click();
  assert.equal(h.triggerHost.parentElement,group);assert.equal(h.views.length,2);
  await h.registry.destroy();
  assert.equal(group.isConnected,true);assert.equal(navigation.parentElement,group);
  assert.equal(native.parentElement,wrapper);assert.equal(h.triggerHost.isConnected,false);
});

test('multiple nested navigation groups refuse a guessed destination',async()=>{
  const h=setup(),oldGroup=h.triggerHost.parentElement,bar=oldGroup.parentElement;
  for(let i=0;i<2;i++){
    const row=bar.ownerDocument.createElement('div'),group=bar.ownerDocument.createElement('span');
    group.setAttribute('data-opendesk-chatgpt-answer-tools','');
    const navigation=bar.ownerDocument.createElement('span');
    navigation.setAttribute('data-opendesk-chatgpt-jump-top','prompt-shortcuts');
    group.append(navigation);row.append(group);bar.prepend(row);
  }
  const before=bar.innerHTML;h.registry.scan();
  assert.equal(bar.innerHTML,before);assert.equal(h.triggerHost.parentElement,oldGroup);
  await h.registry.destroy();
  assert.equal(bar.querySelectorAll('[data-opendesk-chatgpt-jump-top]').length,2);
});

test('late old toolbar retirement failure cannot close a replacement and remains a cleanup error',async()=>{
  const firstDestroy=deferred(),h=setup({firstDestroy});
  await h.click();const old=h.views[0];
  // Match the real toolbar: rejection of onOriginal is routed to its onError.
  const oldToolbar=old.options.onOriginal().catch(old.options.onError);
  await h.click();const replacement=h.views[1];
  const failure=Object.assign(new Error('old destroy failed'),{code:'E_OLD_RETIREMENT'});
  firstDestroy.reject(failure);await oldToolbar;
  assert.equal(replacement.destroyCalls,0);
  assert.equal(replacement.host.isConnected,true);
  assert.equal(h.content.getAttribute('aria-hidden'),'true');
  assert.equal(h.triggerHost.hidden,false);
  assert.equal(h.trigger.getAttribute('aria-pressed'),'true');
  h.assertNoDebugUI();
  await assert.rejects(h.registry.destroy(),error=>error instanceof AggregateError&&error.errors.includes(failure));
});

test('late cancellation from an old view cannot retire its replacement',async()=>{
  const h=setup();await h.click();const old=h.views[0];await old.options.onOriginal();
  await h.click();const replacement=h.views[1];
  await old.options.onError(Object.assign(new Error('closed'),{code:'E_XMIND_FRAME_DESTROYED'}));
  assert.equal(replacement.destroyCalls,0);assert.equal(replacement.host.isConnected,true);
  h.assertNoDebugUI();await h.registry.destroy();
});

test('return-to-original cleanup failure is logged when the session has no replacement',async()=>{
  const firstDestroy=deferred(),h=setup({firstDestroy});await h.click();
  const closing=h.views[0].options.onOriginal();
  const failure=new Error('renderer cleanup failed');
  firstDestroy.reject(failure);
  await assert.rejects(closing,error=>error===failure);
  assert.notEqual(h.content.style.getPropertyValue('display'),'none');
  assert.equal(h.content.hasAttribute('aria-hidden'),false);
  assert.equal(h.logs.at(-1).record.error.stage,'view.destroy');
  h.assertNoDebugUI();
  assert.equal(h.registry.diagnostics.at(-1).error.stage,'view.destroy');
  await assert.rejects(h.registry.destroy(),error=>error instanceof AggregateError&&error.errors.includes(failure));
});

test('late theme rejection belongs to the view that issued it',async()=>{
  const firstTheme=deferred(),h=setup({firstTheme});await h.click();
  await h.views[0].options.onOriginal();await h.click();const replacement=h.views[1];
  firstTheme.reject(new Error('old theme failed'));
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(replacement.destroyCalls,0);assert.equal(replacement.host.isConnected,true);
  h.assertNoDebugUI();await h.registry.destroy();
});

test('current render failure restores original content and reports its own error',async()=>{
  const h=setup();await h.click();
  await h.views[0].options.onError(new Error('render failed'));
  assert.equal(h.views[0].destroyCalls,1);assert.equal(h.content.hasAttribute('aria-hidden'),false);
  assert.equal(h.triggerHost.hidden,false);h.assertNoDebugUI();
  assert.ok(h.logs.length);
  h.registry.scan();
  assert.equal(h.logs.at(-1).record.error.message,'render failed');
  h.assertNoDebugUI();
  await h.registry.destroy();
});

test('missing fixed XMind resource reports unavailable conversion and restores the answer',async()=>{
  const h=setup();await h.click();
  await h.views[0].options.onError(Object.assign(new Error('resource not bound'),{code:'E_FRAME_RESOURCE'}));
  assert.equal(h.content.hasAttribute('aria-hidden'),false);
  assert.equal(h.triggerHost.hidden,false);h.assertNoDebugUI();
  assert.ok(h.logs.length);
  assert.equal(h.logs.at(-1).record.error.code,'E_FRAME_RESOURCE');
  assert.equal(h.views[0].host.isConnected,false);await h.registry.destroy();
});

test('preview without a fixed-resource capability reports its actual boundary',async()=>{
  const h=setup(),original=h.content.outerHTML;await h.click();
  await h.views[0].options.onError(Object.assign(new Error('no authorized frame entry'),{code:'E_FRAME_UNAVAILABLE'}));
  assert.ok(h.logs.length);
  assert.equal(h.logs.at(-1).record.error.code,'E_FRAME_UNAVAILABLE');
  assert.equal(h.content.outerHTML,original);await h.registry.destroy();
});

test('old failure retirement cannot affect a new view',async()=>{
  const firstDestroy=deferred(),h=setup({firstDestroy});await h.click();
  const failure=h.views[0].options.onError(new Error('render failed'));
  await h.click();const replacement=h.views[1];firstDestroy.resolve();await failure;
  assert.equal(replacement.destroyCalls,0);assert.equal(replacement.host.isConnected,true);
  h.assertNoDebugUI();await h.registry.destroy();
});

test('constructor and start failures retain their stage without hiding any original content',async()=>{
  for(const [option,stage] of [['createFailure','view.create'],['startFailure','view.start']]){
    const h=setup({[option]:new TypeError('renderer failed')});
    const node=h.content,html=node.innerHTML,text=node.textContent;
    await h.click();
    assert.equal(node.innerHTML,html);assert.equal(node.textContent,text);
    assert.notEqual(node.style.getPropertyValue('display'),'none');
    assert.equal(node.hasAttribute('aria-hidden'),false);
    const record=h.registry.diagnostics[0];
    assert.equal(record.error.stage,stage);assert.equal(record.error.name,'TypeError');
    assert.deepEqual(record.program,{id:'opendesk.chatgpt-mindmap',version:'0.2.2',revision:3});
    assert.ok(h.logs.length);
    assert.equal(h.logs.at(-1).record.error.stage,stage);
    await h.registry.destroy();
  }
});

test('render exception and cleanup failure remain in console diagnostics',async()=>{
  const firstDestroy=deferred(),h=setup({firstDestroy});await h.click();
  const failed=h.views[0].options.onError(Object.assign(new Error('init failed'),
    {code:'E_INIT',mindmapStage:'frame.init'}));
  assert.equal(h.logs.length,1,'failure is logged before asynchronous retirement completes');
  assert.equal(h.content.hasAttribute('aria-hidden'),false);
  const cleanup=new Error('cleanup failed');firstDestroy.reject(cleanup);await failed;
  const record=h.registry.diagnostics[0];
  assert.equal(record.error.code,'E_INIT');assert.equal(record.error.stage,'frame.init');
  assert.equal(record.cleanup.message,'cleanup failed');
  h.registry.scan();assert.equal(h.logs.at(-1).record.error.code,'E_INIT');
  await assert.rejects(h.registry.destroy(),error=>error.errors.includes(cleanup));
});

test('failure history is bounded and remains available after successful reopen',async()=>{
  const h=setup();
  for(let index=0;index<10;index++){
    await h.click();await h.views[index].options.onError(new Error('failed '+index));
  }
  assert.equal(h.registry.diagnostics.length,8);
  assert.equal(h.registry.diagnostics[0].viewSession,3);
  const copy=h.registry.diagnostics;copy[0].error.message='changed';
  assert.notEqual(h.registry.diagnostics[0].error.message,'changed');
  await h.click();h.assertNoDebugUI();
  h.assertNoDebugUI();

  assert.equal(h.registry.diagnostics.length,8);
  await h.views.at(-1).options.onOriginal();
  h.assertNoDebugUI();
  await h.click();await h.views.at(-1).options.onError(new Error('new failure'));
  h.assertNoDebugUI();
  assert.equal(h.registry.diagnostics.at(-1).error.message,'new failure');
  await h.registry.destroy();
});

test('intentional return during startup does not report its cancelled view as a new failure',async()=>{
  const firstStart=deferred(),h=setup({firstStart});
  const opening=h.click();
  await h.views[0].options.onOriginal();
  firstStart.reject(Object.assign(new Error('cancelled'),{code:'E_XMIND_FRAME_DESTROYED'}));
  await opening;
  h.assertNoDebugUI();
  assert.equal(h.registry.diagnostics.length,0);
  assert.notEqual(h.content.style.getPropertyValue('display'),'none');
  await h.click();assert.equal(h.trigger.getAttribute('aria-pressed'),'true');
  await h.registry.destroy();
});

test('a replaced answer retains console history without inserting debug UI',async()=>{
  const h=setup();await h.click();
  await h.views[0].options.onError(new Error('previous answer failed'));
  h.content.parentElement.setAttribute('data-message-id','B');h.registry.scan();
  h.assertNoDebugUI();
  assert.equal(h.registry.diagnostics.length,1);
  await h.registry.destroy();
});

test('mind-map icon toggles in place without a text label',async()=>{
  const h=setup();
  assert.equal(h.trigger.textContent,'');
  assert.equal(h.trigger.querySelectorAll('svg').length,1);
  assert.equal(h.trigger.getAttribute('aria-pressed'),'false');
  await h.click();
  assert.equal(h.triggerHost.hidden,false);
  assert.equal(h.trigger.getAttribute('aria-pressed'),'true');
  await h.views[0].options.onOriginal();
  assert.equal(h.trigger.getAttribute('aria-pressed'),'false');
  await h.registry.destroy();
});

test('return-to-original compensates nested-scroll drift back to opener position',async()=>{
  const h=setup();
  const scroller=h.triggerHost.closest('article');
  Object.defineProperty(scroller,'scrollHeight',{configurable:true,value:2000});
  Object.defineProperty(scroller,'clientHeight',{configurable:true,value:300});
  scroller.scrollTop=150;
  let screenY=190;
  h.triggerHost.getBoundingClientRect=()=>({top:screenY,bottom:screenY+36});
  h.window.innerHeight=900;
  h.window.getComputedStyle=node=>({overflowY:node===scroller?'auto':'visible'});
  await h.click();
  screenY=320; // original content replaces a taller mind-map viewport
  await h.views[0].options.onOriginal();
  assert.equal(scroller.scrollTop,280);
  assert.equal(h.trigger.getAttribute('aria-pressed'),'false');
  await h.registry.destroy();
});
