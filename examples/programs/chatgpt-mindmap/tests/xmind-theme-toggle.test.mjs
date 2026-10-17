import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createAnswerView} from '../src/view.js';
import {createAnswerRegistry} from '../src/answer-registry.js';

const KEY='opendesk.chatgpt-mindmap.viewer-theme.v1';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
// linkedom does not implement the browser-only :focus-visible pseudo-class.
// Keep the production interaction unchanged, just model an unfocused opener.
const withoutFocusVisible=button=>{
  const matches=button.matches.bind(button);
  button.matches=selector=>selector===':focus-visible'?false:matches(selector);
  return button;
};
// Reproduce the same inline-style priority behavior used by the existing
// answer-registry lifecycle tests. linkedom omits CSS !important metadata.
const withPriorityStyles=document=>{
  for(const content of document.querySelectorAll('.markdown')){
    const original=content.style,priorities=new Map();
    Object.defineProperty(content,'style',{value:{
      getPropertyValue:name=>original.getPropertyValue(name),
      getPropertyPriority:name=>priorities.get(name)||'',
      setProperty(name,value,priority=''){
        priorities.set(name,priority);
        original.setProperty(name,value);
      },
      removeProperty(name){
        priorities.delete(name);
        return original.removeProperty(name);
      }
    }});
  }
};
const owner={
  active:()=>true,
  on(target,type,handler){
    if(typeof target.addEventListener!=='function')return ()=>{};
    target.addEventListener(type,handler);
    return ()=>target.removeEventListener(type,handler);
  },
  observe(){},setTimeout(){return 0;},setInterval(){return 0;}
};

test('desktop and mobile menu expose a text-free theme action; XMind receives both skin modes',async()=>{
  const {document,window}=parseHTML('<html><body></body></html>');
  const applied=[];
  const view=createAnswerView({document,window,owner,css:'',tree:{title:'Root',children:[]},
    nodeCount:1,onOriginal(){},onRefresh(){},onFullscreen(){},onError(error){throw error;},
    rendererFactory:()=>({ready:Promise.resolve(),async fit(){},async setTheme(mode){applied.push(mode);},
      async destroy(){}})});
  document.body.append(view.host);
  view.host.setAttribute('data-dark','true');
  await view.start();
  const toolbar=view.host.shadowRoot.querySelector('.odmm-toolbar [data-action="theme"]');
  const mobile=view.host.shadowRoot.querySelector('.odmm-menu [data-action="theme"]');
  assert.ok(toolbar);assert.ok(mobile);
  assert.equal(toolbar.textContent,'');
  assert.equal(mobile.textContent,'');
  assert.equal(toolbar.getAttribute('aria-label'),'切换为浅色导图');
  assert.equal(mobile.getAttribute('role'),'menuitem');
  toolbar.dispatchEvent(new window.Event('click'));await flush();
  assert.deepEqual(applied,['light']);
  assert.equal(toolbar.getAttribute('aria-label'),'切换为深色导图');
  assert.equal(mobile.getAttribute('aria-label'),'切换为深色导图');
  mobile.dispatchEvent(new window.Event('click'));await flush();
  assert.deepEqual(applied,['light','dark']);
  assert.equal(toolbar.getAttribute('aria-label'),'切换为浅色导图');
  await view.destroy();
});

test('default dark, explicit light persists across replies and is independent of ChatGPT theme',async()=>{
  const markup='<html><body>'+['A','B'].map((id,i)=>
    '<article data-testid="conversation-turn-'+(i+1)+'">'+
    '<div data-message-author-role="assistant" data-message-id="'+id+'">'+
    '<div class="markdown"><h2>Answer '+id+'</h2><p>Original body</p></div></div>'+
    '<div data-testid="message-actions"><button data-testid="copy-turn-action-button">Copy</button></div>'+
    '</article>').join('')+'</body></html>';
  const {document}=parseHTML(markup),values=new Map(),views=[];
  withPriorityStyles(document);
  const window={location:{pathname:'/c/theme',search:''},
    localStorage:{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)}};
  const registry=createAnswerRegistry({document,window,owner,css:'',createView(options){
    const view={host:document.createElement('section'),options,themes:[],
      async start(){},async destroy(){view.host.remove();},async setFull(){},
      markStale(){},focusPrimary(){},focusFullscreen(){},
      async setTheme(isDark){view.themes.push(isDark);}};
    views.push(view);return view;
  }});
  registry.start();
  const buttons=[...document.querySelectorAll('[data-opendesk-chatgpt-mindmap="button"]')]
    .map(host=>withoutFocusVisible(host.shadowRoot.querySelector('button')));
  assert.equal(buttons.length,2);
  buttons[0].dispatchEvent(new document.defaultView.Event('click'));
  buttons[1].dispatchEvent(new document.defaultView.Event('click'));await flush();
  assert.equal(views.length,2);
  assert.deepEqual(views.map(view=>view.host.getAttribute('data-dark')),['true','true']);
  assert.deepEqual(views.map(view=>view.themes),[[true],[true]]);
  await views[0].options.onToggleTheme();
  assert.equal(values.get(KEY),'light');
  assert.deepEqual(views.map(view=>view.host.getAttribute('data-dark')),['false','false']);
  assert.deepEqual(views.map(view=>view.themes),[[true,false],[true,false]]);
  document.documentElement.classList.add('dark');
  registry.scan();
  assert.deepEqual(views.map(view=>view.host.getAttribute('data-dark')),['false','false']);
  // The button itself still follows the actual ChatGPT background.
  assert.equal(document.querySelector('[data-opendesk-chatgpt-mindmap="button"]')
    .getAttribute('data-dark'),'true');
  await registry.destroy();
});

test('denied storage never prevents the user from switching themes',async()=>{
  const {document}=parseHTML('<html><body><article data-testid="conversation-turn-1">'+
    '<div data-message-author-role="assistant" data-message-id="A">'+
    '<div class="markdown"><h2>Answer</h2><p>Body</p></div></div>'+
    '<div data-testid="message-actions"><button data-testid="copy-turn-action-button">Copy</button></div>'+
    '</article></body></html>');
  withPriorityStyles(document);
  const views=[],window={location:{pathname:'/c/storage',search:''},
    get localStorage(){throw Object.assign(new Error('denied'),{name:'SecurityError'});}};
  const registry=createAnswerRegistry({document,window,owner,css:'',createView(options){
    const view={host:document.createElement('section'),options,async start(){},
      async setTheme(){},async destroy(){view.host.remove();},markStale(){},async setFull(){}};
    views.push(view);return view;
  }});
  registry.start();
  withoutFocusVisible(document.querySelector('[data-opendesk-chatgpt-mindmap="button"]').shadowRoot
    .querySelector('button')).dispatchEvent(new document.defaultView.Event('click'));
  await flush();
  assert.equal(views[0].host.getAttribute('data-dark'),'true');
  await views[0].options.onToggleTheme();
  assert.equal(views[0].host.getAttribute('data-dark'),'false');
  await registry.destroy();
});
