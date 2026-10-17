import test from 'node:test';
import assert from 'node:assert/strict';
import {MessageChannel} from 'node:worker_threads';
import {randomUUID} from 'node:crypto';
import {Blob} from 'node:buffer';
import {parseHTML} from 'linkedom';
import {createXmindFrameRenderer} from '../src/xmind-frame.js';
import {serveXmindFrame} from '../src/xmind-frame-child.js';
import {createAnswerView} from '../src/view.js';
import {verifyXmindZip} from '../src/export.js';

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
    assert.deepEqual(calls.slice(0,3),[['theme','light'],['fold'],['export',1]]);
  }finally{await renderer.destroy();}
  assert.equal(calls.filter(row=>row[0]==='destroy').length,1);
  await assert.rejects(renderer.exportXmind(),{code:'E_XMIND_FRAME_DESTROYED'});
});

test('original toolbar offers one desktop download, a mobile export entry, and safe format gates',async()=>{
  const {document,window}=parseHTML('<html><body></body></html>');
  const owner={on(node,event,handler){node.addEventListener(event,handler);
    return ()=>node.removeEventListener(event,handler);}};
  const downloads=[],revocations=[];
  const create=document.createElement.bind(document);
  document.createElement=(tag)=>{
    const item=create(tag);
    if(tag==='a')item.click=()=>downloads.push(item.download);
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
    assert.equal(shadow.querySelectorAll('[data-export]').length,6);
    const source=shadow.querySelector('[data-export="source"]');
    assert.equal(source.getAttribute('aria-disabled'),'true');
    source.dispatchEvent(new window.Event('click'));await tick();
    assert.equal(downloads.length,0);
    assert.match(shadow.querySelector('.odmm-export-status').textContent,/原始 Markdown/);
    desktop.dispatchEvent(new window.Event('click'));
    shadow.querySelector('[data-export="outline"]').dispatchEvent(new window.Event('click'));
    await tick();
    assert.deepEqual(downloads,['本条回复-大纲.md']);
    desktop.dispatchEvent(new window.Event('click'));
    shadow.querySelector('[data-export="xmind"]').dispatchEvent(new window.Event('click'));
    await tick();
    assert.deepEqual(downloads,['本条回复-大纲.md','本条回复.xmind']);
    assert.equal(shadow.querySelector('[data-export="png-hd"]').getAttribute('aria-disabled'),'true');
    assert.equal(shadow.querySelector('[data-export="svg"]').getAttribute('aria-disabled'),'true');
  }finally{await view.destroy();}
  assert.ok(revocations.includes('blob:fake-download'));
});
