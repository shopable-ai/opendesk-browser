import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createAnswerRegistry} from '../src/answer-registry.js';

const deferred=()=>{
  let resolve,reject;
  const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
};

function setup({firstDestroy,firstTheme}={}){
  const {document}=parseHTML('<html><body><article data-testid="conversation-turn-1"><div data-message-author-role="assistant" data-message-id="A"><div class="markdown"><h2>Answer</h2><p>Original answer body</p></div></div><div data-testid="message-actions"><button data-testid="copy-turn-action-button">Copy</button></div></article></body></html>');
  const content=document.querySelector('.markdown'),handlers=new Map(),observers=[],views=[];
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
  const registry=createAnswerRegistry({document,window:{location:{pathname:'/c/test',search:''}},owner,css:'',
    createView(options){
      const index=views.length,host=document.createElement('section');
      let retirement;
      const view={host,options,destroyCalls:0,fullCalls:[],async start(){},focusPrimary(){},markStale(){},
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
  return {registry,content,views,triggerHost,trigger,error:triggerHost.shadowRoot.querySelector('[role="alert"]'),
    click:()=>handlers.get(trigger)(),
    theme:()=>observers.find(row=>row.options.attributeFilter?.includes('class')).listener()};
}

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
  const bar=h.triggerHost.parentElement;
  assert.equal(bar.getAttribute('data-testid'),'message-actions');
  for(let i=0;i<2;i++){
    await h.click();
    assert.equal(h.triggerHost.parentElement,bar);
    assert.equal(h.triggerHost.hidden,false);
    assert.equal(h.trigger.textContent,'关闭思维导图');
    assert.equal(h.trigger.getAttribute('aria-pressed'),'true');
    await h.click();
    assert.equal(h.trigger.textContent,'思维导图');
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
  assert.equal(h.triggerHost.hidden,false);assert.equal(h.error.hidden,true);
  await assert.rejects(h.registry.destroy(),error=>error instanceof AggregateError&&error.errors.includes(failure));
});

test('late cancellation from an old view cannot retire its replacement',async()=>{
  const h=setup();await h.click();const old=h.views[0];await old.options.onOriginal();
  await h.click();const replacement=h.views[1];
  await old.options.onError(Object.assign(new Error('closed'),{code:'E_XMIND_FRAME_DESTROYED'}));
  assert.equal(replacement.destroyCalls,0);assert.equal(replacement.host.isConnected,true);
  assert.equal(h.error.hidden,true);await h.registry.destroy();
});

test('late theme rejection belongs to the view that issued it',async()=>{
  const firstTheme=deferred(),h=setup({firstTheme});await h.click();
  await h.views[0].options.onOriginal();await h.click();const replacement=h.views[1];
  firstTheme.reject(new Error('old theme failed'));
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(replacement.destroyCalls,0);assert.equal(replacement.host.isConnected,true);
  assert.equal(h.error.hidden,true);await h.registry.destroy();
});

test('current render failure restores original content and reports its own error',async()=>{
  const h=setup();await h.click();
  await h.views[0].options.onError(Object.assign(new Error('render failed'),{code:'E_RENDER'}));
  assert.equal(h.views[0].destroyCalls,1);assert.equal(h.content.hasAttribute('aria-hidden'),false);
  assert.equal(h.triggerHost.hidden,false);assert.equal(h.error.hidden,false);
  assert.equal(h.error.textContent,'XMind 打开失败，原文已恢复。');
  assert.equal(h.trigger.title,'E_RENDER');await h.registry.destroy();
});

test('missing fixed XMind resource reports unavailable conversion and restores the answer',async()=>{
  const h=setup();await h.click();
  await h.views[0].options.onError(Object.assign(new Error('resource not bound'),{code:'E_FRAME_RESOURCE'}));
  assert.equal(h.content.hasAttribute('aria-hidden'),false);
  assert.equal(h.triggerHost.hidden,false);assert.equal(h.error.hidden,false);
  assert.equal(h.error.textContent,'当前版本未包含 XMind 运行资源，暂无法生成导图，原文已恢复。');
  assert.equal(h.trigger.title,'E_FRAME_RESOURCE');
  assert.equal(h.views[0].host.isConnected,false);await h.registry.destroy();
});

test('preview without a fixed-resource capability reports its actual boundary',async()=>{
  const h=setup(),original=h.content.outerHTML;await h.click();
  await h.views[0].options.onError(Object.assign(new Error('no authorized frame entry'),{code:'E_FRAME_UNAVAILABLE'}));
  assert.equal(h.error.textContent,'当前预览没有已授权的 XMind 固定资源入口，暂无法生成导图，原文已恢复。');
  assert.equal(h.trigger.title,'E_FRAME_UNAVAILABLE');
  assert.equal(h.content.outerHTML,original);await h.registry.destroy();
});

test('failure UI cannot arrive after a new view opens during retirement',async()=>{
  const firstDestroy=deferred(),h=setup({firstDestroy});await h.click();
  const failure=h.views[0].options.onError(new Error('render failed'));
  await h.click();const replacement=h.views[1];firstDestroy.resolve();await failure;
  assert.equal(replacement.destroyCalls,0);assert.equal(replacement.host.isConnected,true);
  assert.equal(h.error.hidden,true);await h.registry.destroy();
});
