import test from 'node:test';
import assert from 'node:assert/strict';
import {MessageChannel} from 'node:worker_threads';
import {randomUUID} from 'node:crypto';
import {Blob} from 'node:buffer';
import {parseHTML} from 'linkedom';
import {createXmindFrameRenderer} from '../src/xmind-frame.js';
import {serveXmindFrame} from '../src/xmind-frame-child.js';
import {createAnswerView} from '../src/view.js';
import {verifyXmindZip,verifyPngBlob} from '../src/export.js';

const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('XMind export travels the existing bound child MessagePort and survives state changes',async()=>{
  const window={crypto:{randomUUID}};
  const tree={id:'root',title:'当前回复',children:[{id:'a',title:'分支',children:[]}]};
  const calls=[];
  let child=null,exportCount=0;
  const renderer=createXmindFrameRenderer({
    window,canvas:{},tree,identity:{instanceId:'answer-A',revision:2},timeoutMs:2000,
    frameFactory:async ({identity})=>{
      const {port1,port2}=new MessageChannel();
      child=serveXmindFrame({port:port2,identity,window,canvas:{},
        rendererFactory:({tree:actual,skinMode})=>{
          assert.deepEqual(actual,tree);
          assert.equal(skinMode,'dark');
          return {ready:Promise.resolve(),nodeCount:3,
            async setTheme(value){calls.push(['theme',value]);},
            async toggleAll(){calls.push(['fold']);return true;},
            async exportXmind(){
              calls.push(['export',++exportCount]);
              return new Blob([new Uint8Array([80,75,3,4,1,2,3,4])],{
                type:'application/octet-stream'});
            },
            async exportPng(){
              calls.push(['png']);
              // Transport contract only: real XMind pixels are asserted in Chromium.
              const bytes=new Uint8Array(512),header=new DataView(bytes.buffer);
              bytes.set([137,80,78,71,13,10,26,10]);
              bytes.set([73,72,68,82],12);
              header.setUint32(16,256);header.setUint32(20,192);
              return new Blob([bytes],{type:'image/png'});
            },
            async destroy(){calls.push(['destroy']);}};
        }});
      return {port:port1,async destroy(){await child.destroy();}};
    }
  });
  try{
    await renderer.ready;
    await renderer.setTheme('light');
    assert.equal(await renderer.toggleAll(),true);
    const blob=await renderer.exportXmind();
    await verifyXmindZip(blob);
    assert.equal(blob.size,8);
    const png=await renderer.exportPng();
    assert.equal((await verifyPngBlob(png)).size,512);
    assert.deepEqual(calls.slice(0,4),[['theme','light'],['fold'],['export',1],['png']]);
  }finally{await renderer.destroy();}
  assert.equal(calls.filter(row=>row[0]==='destroy').length,1);
  await assert.rejects(renderer.exportXmind(),{code:'E_XMIND_FRAME_DESTROYED'});
});

test('export menu follows desktop and mobile triggers with only PNG, XMind, and Markdown',async()=>{
  const {document,window}=parseHTML('<html><body></body></html>');
  const owner={on(node,event,handler){node.addEventListener(event,handler);
    return ()=>node.removeEventListener(event,handler);}};
  const downloads=[],revocations=[];
  const create=document.createElement.bind(document);
  document.createElement=(tag)=>{
    const item=create(tag);
    if(tag==='a')item.click=()=>downloads.push(decodeURIComponent(item.download));
    return item;
  };
  window.URL={
    createObjectURL(){return 'blob:fake-download';},
    revokeObjectURL(value){revocations.push(value);}
  };
  const view=createAnswerView({
    document,window,owner,css:'',tree:{title:'本条回复',children:[{title:'节点',children:[]}]},
    nodeCount:1,onOriginal(){},onRefresh(){},onFullscreen(){},
    onError(error){throw error;},
    rendererFactory:()=>({
      ready:Promise.resolve(),
      async fit(){},
      async exportXmind(){return new Blob([new Uint8Array([80,75,3,4,1])]);},
      async exportPng(){
        const bytes=new Uint8Array(512),header=new DataView(bytes.buffer);
        bytes.set([137,80,78,71,13,10,26,10]);
        bytes.set([73,72,68,82],12);
        header.setUint32(16,256);header.setUint32(20,192);
        return new Blob([bytes],{type:'image/png'});
      },
      async destroy(){}
    })
  });
  document.body.append(view.host);
  try{
    await view.start();
    const shadow=view.host.shadowRoot;
    const desktop=shadow.querySelector('.odmm-export-toggle');
    const mobile=shadow.querySelector('.odmm-menu [data-action="export-open"]');
    assert.ok(desktop);assert.ok(mobile);
    desktop.dispatchEvent(new window.Event('click'));
    assert.equal(desktop.getAttribute('aria-expanded'),'true');
    const menu=shadow.querySelector('.odmm-export-menu');
    assert.equal(menu.parentElement,shadow.querySelector('.odmm-export-wrap'));
    assert.equal(menu.hidden,false);
    assert.deepEqual([...menu.querySelectorAll('[data-export]')].map(item=>item.textContent),
      ['PNG','XMind','Markdown']);
    assert.equal(desktop.getAttribute('aria-label'),'Export');
    assert.equal(mobile.getAttribute('aria-label'),'Export');
    for(const removed of ['source','png-hd','svg'])
      assert.equal(menu.querySelector('[data-export="'+removed+'"]'),null);
    menu.querySelector('[data-export="outline"]').dispatchEvent(new window.Event('click'));
    await tick();
    assert.deepEqual(downloads,['本条回复-大纲.md']);
    desktop.dispatchEvent(new window.Event('click'));
    menu.querySelector('[data-export="xmind"]').dispatchEvent(new window.Event('click'));
    await tick();
    assert.deepEqual(downloads,['本条回复-大纲.md','本条回复.xmind']);
    desktop.dispatchEvent(new window.Event('click'));
    menu.querySelector('[data-export="png"]').dispatchEvent(new window.Event('click'));
    await tick();
    assert.deepEqual(downloads,['本条回复-大纲.md','本条回复.xmind','本条回复.png']);
    const more=shadow.querySelector('.odmm-more');
    more.dispatchEvent(new window.Event('click'));
    mobile.dispatchEvent(new window.Event('click'));await tick();
    assert.equal(menu.parentElement,shadow.querySelector('.odmm-menu-wrap'));
    assert.equal(menu.hidden,false);
    assert.deepEqual([...menu.querySelectorAll('[data-export]')].map(item=>item.textContent),
      ['PNG','XMind','Markdown']);
    menu.querySelector('[data-export="png"]').dispatchEvent(new window.Event('click'));
    await tick();
    assert.equal(menu.hidden,true);
    assert.equal(downloads.at(-1),'本条回复.png');
  }finally{await view.destroy();}
  assert.ok(revocations.includes('blob:fake-download'));
});
