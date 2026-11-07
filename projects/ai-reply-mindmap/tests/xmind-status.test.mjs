import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createAnswerView} from '../src/view.js';

function setup({ready=Promise.resolve(),onRefresh=()=>{}}={}){
  const {document,window}=parseHTML('<html><body></body></html>');
  const errors=[];
  const owner={on(target,type,listener){
    target.addEventListener(type,listener);
    return ()=>target.removeEventListener(type,listener);
  }};
  const view=createAnswerView({document,window,owner,css:'',
    tree:{title:'Reply',children:[]},nodeCount:1,
    onOriginal(){},onFullscreen(){},onRefresh,onError:error=>errors.push(error),
    rendererFactory:()=>({ready,async fit(){},async destroy(){}})});
  document.body.append(view.host);
  const shadow=view.host.shadowRoot;
  return {view,window,errors,status:shadow.querySelector('.odmm-status'),
    loading:shadow.querySelector('.odmm-loading'),
    refresh:[...shadow.querySelectorAll('[data-action="refresh"]')],
    more:shadow.querySelector('.odmm-more')};
}

test('loading uses an icon and an English accessible status, then clears when ready',async()=>{
  let resolve;
  const h=setup({ready:new Promise(done=>{resolve=done;})});
  try{
    const starting=h.view.start();
    assert.ok(h.loading.querySelector('svg[aria-hidden="true"]'));
    assert.equal(h.status.textContent,'Loading mind map…');
    assert.equal(h.loading.title,'Loading mind map…');
    assert.equal(h.status.getAttribute('aria-live'),'polite');
    assert.ok(h.refresh.every(button=>button.hidden));
    resolve();await starting;
    assert.equal(h.loading.hidden,true);
    assert.equal(h.status.hidden,false);
    assert.equal(h.status.textContent,'');
  }finally{await h.view.destroy();}
});

test('reply updates expose working desktop and menu refresh icons with English context',async()=>{
  let refreshes=0;
  const h=setup({onRefresh:()=>{refreshes++;}});
  try{
    await h.view.start();h.view.markStale();
    assert.equal(h.status.classList.contains('odmm-sr-only'),true);
    assert.equal(h.status.textContent,'Reply updated. Refresh mind map to sync.');
    assert.equal(h.status.getAttribute('role'),'status');
    for(const button of h.refresh){
      assert.equal(button.hidden,false);
      assert.equal(button.getAttribute('aria-label'),'Reply updated · Refresh mind map');
      if(button.getAttribute('role')!=='menuitem')assert.equal(button.querySelector('.odmm-tooltip').textContent,button.getAttribute('aria-label'));
      assert.ok(button.querySelector('.odmm-update-dot[aria-hidden="true"]'));
      if(button.getAttribute('role')==='menuitem')assert.equal(button.getAttribute('data-label'),'Refresh mind map');
      button.dispatchEvent(new h.window.Event('click'));
      await Promise.resolve();await Promise.resolve();
      assert.equal(button.disabled,false);
    }
    assert.equal(refreshes,2);
    assert.ok(h.more.querySelector('.odmm-update-dot'));
    assert.equal(h.more.getAttribute('aria-label'),'More actions · Reply updated');
    assert.equal(h.more.querySelector('.odmm-tooltip').textContent,h.more.getAttribute('aria-label'));
    assert.deepEqual(h.errors,[]);
  }finally{await h.view.destroy();}
});

test('an update received during loading survives renderer readiness',async()=>{
  let resolve;
  const h=setup({ready:new Promise(done=>{resolve=done;})});
  try{
    const starting=h.view.start();h.view.markStale();
    assert.notEqual(h.loading.hidden,true);
    resolve();await starting;
    assert.equal(h.status.hidden,false);
    assert.equal(h.status.getAttribute('data-stale'),'true');
    assert.equal(h.status.textContent,'Reply updated. Refresh mind map to sync.');
    assert.ok(h.refresh.every(button=>!button.hidden));
    h.view.markStale();
    assert.equal(h.status.querySelector('svg'),null);
    assert.equal(h.loading.hidden,true);
  }finally{await h.view.destroy();}
});

test('a refresh blocked by an updating reply keeps the current view and explains how to retry',async()=>{
  const h=setup({onRefresh:()=>false});
  try{
    await h.view.start();h.view.markStale();
    h.refresh[0].dispatchEvent(new h.window.Event('click'));
    await Promise.resolve();await Promise.resolve();await Promise.resolve();
    assert.equal(h.view.host.isConnected,true);
    assert.equal(h.status.textContent,'Refresh mind map · Reply is still updating');
    assert.equal(h.refresh[0].getAttribute('aria-label'),h.status.textContent);
    assert.equal(h.refresh[0].disabled,false);
  }finally{await h.view.destroy();}
});
