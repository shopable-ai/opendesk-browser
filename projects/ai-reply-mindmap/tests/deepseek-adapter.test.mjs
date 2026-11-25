import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import * as adapter from '../src/deepseek-adapter.js';
import {createAnswerRegistry} from '../src/answer-registry.js';
import {extractAnswerTree} from '../src/extract.js';

const icon='<div class="ds-button ds-button--icon" role="button"></div>';
const copy='<div class="ds-button ds-button--icon" role="button"><svg viewBox="0 0 16 16">'+
  '<path d="M6.14929 4.02032 Z"></path></svg></div>';
const reply=(id,heading)=>'<div class="turn"><div class="ds-message" id="'+id+'">'+
  '<div class="ds-markdown ds-assistant-message-main-content"><h2>'+heading+'</h2><p>Answer detail.</p></div></div>'+
  '<div class="footer"><div class="native-row">'+copy+icon+'</div><div><div class="ds-button" role="button">Continue</div></div></div></div>';
const fixture=(path='/a/chat/s/6ac34198-b4ce-48c0-8fb1-b3be868dcaa9')=>new JSDOM(
  '<div id="root"><div class="ds-virtual-list ds-virtual-list--printable">'+
  '<div><div class="ds-message d29f3d7d"><div class="fbb737a4">Not an answer</div></div></div>'+
  reply('a','Garden Plan')+reply('b','Travel Plan')+'</div></div>',{url:'https://chat.deepseek.com'+path}).window.document;

test('DeepSeek attaches only to the native actions and content of the same assistant reply',()=>{
  const doc=fixture(),[a,b,...others]=adapter.discoverAnswers(doc);
  assert.deepEqual(others,[]);
  assert.equal(a.id,'a');
  assert.equal(b.id,'b');
  const {content,bar}=adapter.inspectAnswer(a);
  assert.equal(bar,a.parentElement.querySelector('.native-row'));
  const tree=JSON.stringify(extractAnswerTree(content));
  assert.match(tree,/Garden Plan/);
  assert.doesNotMatch(tree,/Travel Plan|Not an answer|Continue/);
  bar.remove();
  assert.equal(adapter.inspectAnswer(a).ok,false);
  assert.equal(adapter.inspectAnswer(b).ok,true);
  assert.deepEqual(adapter.discoverAnswers(fixture('/')),[]);
});

test('DeepSeek requires a unique copy action and rejects a busy or ambiguous turn',()=>{
  const [root]=adapter.discoverAnswers(fixture()),{content,bar,copy:control}=adapter.inspectAnswer(root);
  assert.equal(adapter.isStreaming(root),false);
  control.classList.add('ds-button--disabled');
  assert.equal(adapter.isStreaming(root),true);
  control.classList.remove('ds-button--disabled');
  root.setAttribute('aria-busy','true');
  assert.equal(adapter.isStreaming(root),true);
  root.removeAttribute('aria-busy');
  adapter.setConcealed(content,true);
  content.setAttribute('aria-hidden','true');
  assert.equal(adapter.inspectAnswer(root).ok,true,'viewer hide must preserve the reply binding');
  bar.append(control.cloneNode(true));
  assert.equal(adapter.inspectAnswer(root).ok,false);
});

test('DeepSeek starts on its home page, mounts only completed replies and retires the prior route',async()=>{
  const doc=fixture('/'),win=doc.defaultView;
  const cleanup=[];
  const owner={active:()=>true,on(target,type,handler){target.addEventListener(type,handler);return()=>target.removeEventListener(type,handler);},
    observe(target,handler,options){const observer=new win.MutationObserver(handler);observer.observe(target,options);cleanup.push(()=>observer.disconnect());},
    setTimeout:(handler,ms)=>win.setTimeout(handler,ms),setInterval:(handler,ms)=>win.setInterval(handler,ms)};
  const views=[];
  const registry=createAnswerRegistry({document:doc,window:win,owner,css:'',adapter,
    createView(options){
      const host=doc.createElement('section');
      views.push(options);
      return {host,async start(){},async setTheme(){},async destroy(){host.remove();},
        markStale(){host.dataset.stale='true';},focusPrimary(){}};
    }});
  const query='[data-opendesk-chatgpt-mindmap="button"]';
  const turn=doc.querySelector('#a').parentElement;
  const firstBody=turn.querySelector('.ds-assistant-message-main-content');
  const footer=turn.querySelector('.footer');
  const control=turn.querySelector('.native-row').firstElementChild;
  const waitFor=async fn=>{
    const deadline=Date.now()+2200;
    while(!fn()&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,15));
    assert.ok(fn());
  };
  try{
    assert.equal(adapter.deepseekEntry(win.location),true);
    assert.equal(adapter.deepseekEntry(new URL('https://chat.deepseek.com/settings')),false);
    registry.start();
    assert.equal(doc.querySelectorAll(query).length,0,'home must not bind even retained conversation DOM');
    footer.remove();
    win.history.pushState({},'','/a/chat/s/6ac34198-b4ce-48c0-8fb1-b3be868dcaa9');
    await waitFor(()=>doc.querySelector('#b').parentElement.querySelector(query));
    assert.equal(turn.querySelector(query),null,'streaming text with no native operations has no trigger');
    turn.append(footer);
    await waitFor(()=>turn.querySelector(query));
    let host=turn.querySelector(query);
    const html=firstBody.innerHTML;
    assert.equal(control.nextElementSibling,host.parentElement);
    for(let i=0;i<2;i++){
      const trigger=host.shadowRoot.querySelector('button');
      trigger.click();
      assert.equal(views.length,i+1);
      assert.deepEqual(firstBody.nextElementSibling.tagName,'SECTION');
      assert.equal(firstBody.getAttribute('aria-hidden'),'true');
      trigger.click();
      await waitFor(()=>!turn.querySelector('section'));
      assert.equal(firstBody.innerHTML,html);
      assert.equal(firstBody.getAttribute('aria-hidden'),null);
      assert.equal(turn.querySelectorAll(query).length,1);
    }
    host.shadowRoot.querySelector('button').click();
    const opened=turn.querySelector('section');
    const heading=firstBody.querySelector('h2');
    heading.replaceWith(heading.cloneNode(true));
    await waitFor(()=>opened.dataset.stale==='true');
    registry.scan();
    await Promise.resolve();
    assert.equal(turn.querySelector('section'),opened,'editing completed markup must not close the open map');
    assert.equal(host.shadowRoot.querySelector('button').getAttribute('aria-pressed'),'true');
    turn.setAttribute('aria-busy','true');
    await waitFor(()=>!turn.querySelector(query)&&!turn.querySelector('section'));
    assert.equal(firstBody.getAttribute('aria-hidden'),null);
    firstBody.innerHTML='<h2>Updated Garden Plan</h2>';
    turn.removeAttribute('aria-busy');
    await waitFor(()=>turn.querySelector(query));
    host=turn.querySelector(query);
    host.shadowRoot.querySelector('button').click();
    assert.match(JSON.stringify(views.at(-1).tree),/Updated Garden Plan/);
    const list=turn.parentElement;
    win.history.pushState({},'','/a/chat/s/121c3419-8b4c-48c0-8fb1-b3be868dcaa9');
    list.innerHTML=reply('new','Other Conversation');
    await waitFor(()=>list.querySelector(query));
    assert.equal(host.isConnected,false);
    assert.equal(firstBody.getAttribute('aria-hidden'),null);
    assert.equal(list.querySelectorAll(query).length,1);
    const otherTurn=list.firstElementChild;
    otherTurn.remove();
    await waitFor(()=>registry.count===0);
    list.append(otherTurn);
    await waitFor(()=>list.querySelector(query));
    assert.equal(list.querySelectorAll(query).length,1,'reinserted history mounts one fresh trigger');
  }finally{
    cleanup.forEach(dispose=>dispose());
    await registry.destroy();
    win.close();
  }
});
