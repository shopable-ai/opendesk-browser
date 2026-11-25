import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createDeepSeekSite} from '../src/page/site.js';

const send='M8.3125 0.980206C8.66767',stop='M2 4.88C2 3.68009',loading='M34,18 C34,9.163444';
const svg=(path,box='0 0 16 16')=>'<svg viewBox="'+box+'"><path d="'+path+'"/></svg>';
const user=text=>'<div class="ds-message d29f3d7d"><div class="fbb737a4"><div class="ds-collapsible-text"><div><span>'+text+'</span></div></div></div></div>';
const actions='<div class="ds-flex _0a3d93b"><div class="ds-button" role="button">'+svg('M6.14929 4.02032')+'</div></div>';
const reply=(a='')=>'<section><div class="ds-message"><div class="ds-assistant-message-main-content">Answer</div></div>'+a+'</section>';
function fixture({allowHome=false}={}){
  const {window:win}=new JSDOM('<div id="root"><div class="ds-virtual-list ds-virtual-list--printable">'+
    '<div class="ds-virtual-list-items">'+user('seed')+reply(actions)+'</div>'+
    '<div class="_77cefa5"><textarea name="search"></textarea><input type="file"><div class="bf38813a"><div>'+
    '<div class="ds-button ds-button--primary ds-button--circle" role="button">'+svg(send)+'</div></div></div></div></div></div>',
  {url:'https://chat.deepseek.com/a/chat/s/0405c8f7-638e-476b-8beb-d196812c6cee'});
  win.HTMLElement.prototype.getClientRects=()=>[{}];
  const doc=win.document,form=doc.querySelector('._77cefa5');
  let composing=false;
  return {site:createDeepSeekSite({doc,win,allowHome,isComposing:()=>composing}),win,editor:form.querySelector('textarea'),
    form,control:form.querySelector('[role=button]'),list:doc.querySelector('.ds-virtual-list-items'),
    setComposing:value=>{composing=value;}};
}

test('DeepSeek home needs the reviewed home scope, but no conversation history',()=>{
  const old=fixture(),home=fixture({allowHome:true});
  for(const h of [old,home]){
    h.win.history.replaceState(null,'','/');
    h.list.remove();
    h.editor.value='首条草稿';
  }
  assert.equal(old.site.inspect().ok,false);
  const first=home.site.inspect();
  assert.equal(first.ok,true);
  assert.equal(first.route,null);
  assert.equal(first.sendButton,home.control);
  assert.equal(first.draft,'首条草稿');
  assert.deepEqual(first.history,[]);
  home.win.history.replaceState(null,'','/?other=1');
  assert.equal(home.site.inspect().ok,false);
});

test('DeepSeek waits for the exact new user turn and a completed reply with its separate actions',()=>{
  const {site,list,control}=fixture(),before=site.inspect();
  assert.equal(before.idle,true);
  assert.equal(before.placement.toolbar,control.closest('.bf38813a'));
  list.insertAdjacentHTML('beforeend',user('queued once'));
  control.innerHTML=svg(loading,'0 0 36 36');
  const admission=site.inspect(),confirmed=admission.users.at(-1),gate={};
  assert.equal(site.confirm(before,'queued once',admission),true);
  assert.equal(site.confirm(before,'queued',admission),false);
  assert.equal(admission.busy,true);
  assert.equal(site.replyComplete(before,confirmed,admission,gate),false);
  control.innerHTML=svg(stop);
  list.insertAdjacentHTML('beforeend',reply());
  assert.equal(site.replyComplete(before,confirmed,site.inspect(),gate),false);
  control.innerHTML=svg(send);
  assert.equal(site.replyComplete(before,confirmed,site.inspect(),gate),false);
  list.lastElementChild.insertAdjacentHTML('beforeend',actions);
  assert.equal(site.replyComplete(before,confirmed,site.inspect(),gate),true);
  control.innerHTML=svg('unknown');
  assert.equal(site.inspect().ok,false);
});

test('DeepSeek receipts survive virtual eviction of the prior user if its reply is still mounted',()=>{
  const {site,list,control}=fixture(),before=site.inspect();
  // At the bottom of the live list, the last old assistant remains mounted
  // while the old user leaves the viewport during admission of the queued turn.
  list.firstElementChild.remove();
  list.insertAdjacentHTML('beforeend',user('queued once'));
  control.innerHTML=svg(loading,'0 0 36 36');
  const admission=site.inspect(),confirmed=admission.users.at(-1),gate={};
  assert.equal(site.confirm(before,'queued once',admission),true);
  assert.equal(site.confirm(before,'different text',admission),false);
  assert.equal(site.replyComplete(before,confirmed,admission,gate),false);
  control.innerHTML=svg(send);
  list.insertAdjacentHTML('beforeend',reply(actions));
  assert.equal(site.replyComplete(before,confirmed,site.inspect(),gate),true);
});

test('DeepSeek rejects receipts with no old anchor, extra users, or the reply before the user',()=>{
  const detached=fixture(),before=detached.site.inspect();
  detached.list.innerHTML=user('queued once')+reply(actions);
  assert.equal(detached.site.confirm(before,'queued once',detached.site.inspect()),false);

  const extra=fixture(),initial=extra.site.inspect();
  extra.list.firstElementChild.remove();
  extra.list.insertAdjacentHTML('beforeend',user('other message')+user('queued once'));
  assert.equal(extra.site.confirm(initial,'queued once',extra.site.inspect()),false);

  const reversed=fixture(),old=reversed.site.inspect();
  reversed.list.firstElementChild.remove();
  reversed.list.insertAdjacentHTML('beforeend',reply(actions)+user('queued once'));
  assert.equal(reversed.site.confirm(old,'queued once',reversed.site.inspect()),false);
});

test('DeepSeek preserves draft, IME and uploaded preview and does not click a disabled native div',()=>{
  const {site,form,editor,control,setComposing}=fixture(),initial=site.inspect();
  editor.value='user draft';
  assert.equal(site.prepare('queued',initial).ok,false);
  setComposing(true);
  assert.equal(site.clearForQueue(site.inspect()).ok,false);
  setComposing(false);
  form.insertAdjacentHTML('afterbegin','<div class="b40079d7">test.txt</div>');
  assert.equal(site.inspect().rich,true);
  assert.equal(site.clearForQueue(site.inspect()).ok,false);
  assert.equal(editor.value,'user draft');
  form.firstElementChild.remove();
  editor.value='';
  const prepared=site.prepare('queued',initial);
  assert.equal(prepared.ok,true);
  let clicks=0;
  control.onclick=()=>clicks++;
  control.classList.add('ds-button--disabled');
  assert.equal(site.commit(prepared.token).retry,true);
  assert.equal(clicks,0);
  control.classList.remove('ds-button--disabled');
  assert.equal(site.commit(prepared.token).ok,true);
  assert.equal(clicks,1);
});
