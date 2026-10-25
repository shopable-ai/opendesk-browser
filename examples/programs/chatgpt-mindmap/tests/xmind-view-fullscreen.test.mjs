import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createAnswerView} from '../src/view.js';

test('startup failure identifies create, ready or fit while retaining the original exception',async()=>{
  for(const phase of ['create','ready','fit']){
    const {document,window}=parseHTML('<html><body></body></html>');
    const failure=new TypeError('renderer startup failed');
    let destroyed=0;
    const owner={on(target,type,listener){
      target.addEventListener(type,listener);
      return ()=>target.removeEventListener(type,listener);
    }};
    const view=createAnswerView({document,window,owner,css:'',
      tree:{title:'Root',children:[]},nodeCount:1,
      rendererFactory(){
        if(phase==='create')throw failure;
        return {get ready(){return phase==='ready'?Promise.reject(failure):Promise.resolve();},
          async fit(){if(phase==='fit')throw failure;},async destroy(){destroyed++;}};
      }});
    document.body.append(view.host);
    await assert.rejects(view.start(),error=>error===failure&&error.mindmapStage===`renderer.${phase}`);
    assert.notEqual(view.host.dataset.ready,'true');
    await view.destroy();
    assert.equal(view.host.isConnected,false);
    assert.equal(destroyed,phase==='create'?0:1);
  }
});

// DOM call regression only; the parent's real Chromium probe verifies that
// moveBefore actually retains the opaque iframe Document and MessagePort.
async function setup({iframe=true,bodyMove=true,inlineMove=true,moveError,truncated=false}={}){
  const {document,window}=parseHTML('<html><body><article><p>Original answer</p><aside></aside></article></body></html>');
  const inline=document.querySelector('article'),next=document.querySelector('aside');
  const moves=[],insertions=[],reflows=[];
  const install=(parent,supported)=>{
    const insert=parent.insertBefore.bind(parent);
    parent.append=(node)=>{insertions.push({parent,node,reference:null});return insert(node,null);};
    parent.insertBefore=(node,reference)=>{
      insertions.push({parent,node,reference});return insert(node,reference);
    };
    parent.moveBefore=supported?(node,reference)=>{
      if(moveError)throw moveError;
      moves.push({parent,node,reference});return insert(node,reference);
    }:undefined;
  };
  install(document.body,bodyMove);install(inline,inlineMove);
  const owner={on(target,type,listener,options){
    target.addEventListener(type,listener,options);
    return ()=>target.removeEventListener(type,listener,options);
  }};
  let frame;
  const view=createAnswerView({document,window,owner,css:'',tree:{title:'Root',children:[]},nodeCount:1,truncated,
    onOriginal(){},onRefresh(){},onFullscreen(){},onError(error){throw error;},
    rendererFactory:({canvas})=>{
      if(iframe){frame=document.createElement('iframe');canvas.append(frame);}
      return {ready:Promise.resolve(),async fit(){},async reflow(){reflows.push(view.fullscreen);},
        async destroy(){frame?.remove();}};
    }});
  // Initial mounting is intentionally an insertion, before the renderer runs.
  inline.insertBefore(view.host,next);insertions.length=0;
  await view.start();
  const button=view.host.shadowRoot.querySelector('[data-action="fullscreen"]');
  return {view,document,inline,next,frame,moves,insertions,reflows,button};
}

test('fullscreen round trips use state-preserving moves and restore exact sibling position',async()=>{
  const h=await setup();const host=h.view.host,frame=h.frame;
  for(let i=0;i<3;i++){
    await h.view.setFull(true);
    assert.equal(host.parentNode,h.document.body);assert.equal(h.view.fullscreen,true);
    assert.equal(h.button.getAttribute('aria-label'),'退出全屏');
    assert.equal(host.shadowRoot.querySelector('iframe'),frame);
    assert.equal(host.dataset.layoutReady,'fullscreen');
    await h.view.setFull(false);
    assert.equal(host.parentNode,h.inline);assert.equal(host.nextSibling,h.next);
    assert.equal(h.view.fullscreen,false);assert.equal(h.button.getAttribute('aria-label'),'进入全屏');
    assert.equal(host.shadowRoot.querySelector('iframe'),frame);
    assert.equal(host.dataset.layoutReady,'inline');
  }
  assert.equal(h.insertions.length,0);assert.equal(h.moves.length,6);
  assert.deepEqual(h.moves.map(row=>row.reference),[null,h.next,null,h.next,null,h.next]);
  assert.deepEqual(h.reflows,[true,false,true,false,true,false]);
  await h.view.destroy();
});

test('restore uses moveBefore with null when the original next sibling disappeared',async()=>{
  const h=await setup();await h.view.setFull(true);h.next.remove();await h.view.setFull(false);
  assert.equal(h.view.host.parentNode,h.inline);assert.equal(h.moves.at(-1).reference,null);
  assert.equal(h.insertions.length,0);await h.view.destroy();
});

test('live iframe refuses unsupported fullscreen entry before any UI state changes',async()=>{
  for(const options of [{bodyMove:false},{inlineMove:false}]){
    const h=await setup(options);
    await assert.rejects(h.view.setFull(true),{code:'E_XMIND_FULLSCREEN_UNSUPPORTED'});
    assert.equal(h.view.host.parentNode,h.inline);assert.equal(h.view.host.nextSibling,h.next);
    assert.equal(h.view.fullscreen,false);assert.equal(h.view.host.dataset.layoutReady,'inline');
    assert.equal(h.view.host.classList.contains('odmm-fullscreen'),false);
    assert.equal(h.button.getAttribute('aria-label'),'进入全屏');
    assert.equal(h.moves.length,0);assert.equal(h.insertions.length,0);assert.equal(h.reflows.length,0);
    await h.view.destroy();
  }
});

test('live iframe refuses unsupported restore without appending or changing fullscreen state',async()=>{
  const h=await setup();await h.view.setFull(true);h.inline.moveBefore=undefined;
  await assert.rejects(h.view.setFull(false),{code:'E_XMIND_FULLSCREEN_UNSUPPORTED'});
  assert.equal(h.view.host.parentNode,h.document.body);assert.equal(h.view.fullscreen,true);
  assert.equal(h.view.host.classList.contains('odmm-fullscreen'),true);
  assert.equal(h.view.host.dataset.layoutReady,'fullscreen');
  assert.equal(h.button.getAttribute('aria-label'),'退出全屏');assert.equal(h.insertions.length,0);
  await h.view.destroy();
});

test('failed atomic move leaves UI state untouched and never falls back to insertion',async()=>{
  const failure=new Error('atomic move failed');const h=await setup({moveError:failure});
  await assert.rejects(h.view.setFull(true),error=>error===failure);
  assert.equal(h.view.host.parentNode,h.inline);assert.equal(h.view.fullscreen,false);
  assert.equal(h.view.host.dataset.layoutReady,'inline');assert.equal(h.insertions.length,0);
  assert.equal(h.button.getAttribute('aria-label'),'进入全屏');await h.view.destroy();
});

test('standalone renderer without iframe retains unsupported-browser preview behavior',async()=>{
  const h=await setup({iframe:false,bodyMove:false,inlineMove:false});
  await h.view.setFull(true);await h.view.setFull(false);
  assert.equal(h.view.host.parentNode,h.inline);assert.equal(h.view.host.nextSibling,h.next);
  assert.equal(h.insertions.length,2);assert.equal(h.moves.length,0);await h.view.destroy();
});

test('the return control is a text-free back chevron with an accessible label',async()=>{
  const h=await setup({iframe:false});
  const back=h.view.host.shadowRoot.querySelector('[data-action="original"]');
  assert.equal(back.textContent,'');
  assert.equal(back.getAttribute('aria-label'),'返回完整原文');
  assert.equal(back.querySelector('path')?.getAttribute('d'),'M15 18l-6-6 6-6');
  await h.view.destroy();
});

test('truncated mind maps omit the unsolicited banner while keeping toolbar, canvas, and original action',async()=>{
  const h=await setup({iframe:false,truncated:true});
  const shadow=h.view.host.shadowRoot;
  const shell=shadow.querySelector('.odmm-shell');
  assert.equal(shell.firstElementChild.classList.contains('odmm-toolbar'),true);
  assert.equal(shadow.querySelector('.odmm-warning'),null);
  assert.equal(shell.textContent.includes('内容超出导图上限'),false);
  assert.ok(shadow.querySelector('.odmm-canvas'));
  assert.equal(shadow.querySelector('[data-action="original"]').getAttribute('aria-label'),'返回完整原文');
  assert.equal(h.view.host.dataset.ready,'true');
  await h.view.destroy();
});
