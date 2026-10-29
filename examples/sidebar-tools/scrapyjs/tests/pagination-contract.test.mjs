import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import {runCapture} from '../controller/capture.js';
import {verifyTaskPackage} from '../../../../src/platform/tasks/contract.js';

const base='http://127.0.0.1:43111/scrapyjs-fixtures/';
// Component evidence: real serialized extraction callbacks and original
// Scheduler execute against fixture DOMs. This is not a Chrome/Authority test.
async function fixturePage(){
  let url='',document,context,documentId=0;
  const timers=new Set(),visits=[];
  const dispose=()=>{for(const timer of timers)clearTimeout(timer);timers.clear();};
  const page={
    visits,dispose,url:async()=>url,content:async()=>document.toString(),
    goto:async target=>{
      dispose();
      const name=new URL(target).pathname.split('/').pop();
      assert.match(name,/^pagination-batches-(?:1|2|empty)\.html$/);
      const source=await readFile(new URL('../fixtures/'+name,import.meta.url),'utf8');
      ({document}=parseHTML('<html><body>'+source+'</body></html>'));
      url=target;visits.push(target);documentId++;
      Object.defineProperty(document,'baseURI',{value:url});
      context=vm.createContext({document,location:{href:url},performance:{timeOrigin:documentId},
        getComputedStyle:node=>({display:node.style.display||'block',visibility:'visible',pointerEvents:'auto'}),
        setTimeout:(callback,ms)=>{const timer=setTimeout(()=>{timers.delete(timer);callback();},ms);timers.add(timer);return timer;}});
      for(const script of document.querySelectorAll('script'))vm.runInContext(script.textContent,context);
    },
    evaluate:async(callback,...args)=>{
      context.args=args;
      const value=vm.runInContext('('+callback.toString()+')(...args)',context);
      return value===undefined?undefined:JSON.parse(JSON.stringify(value));
    },
    locator:selector=>{
      const nodes=()=>[...document.querySelectorAll(selector)];
      return {
        count:async()=>nodes().length,
        getAttribute:async name=>{
          const found=nodes();
          if(found.length!==1)throw Object.assign(new Error('strict locator'),{code:'E_LOCATOR_STRICT'});
          return found[0].getAttribute(name);
        },
        first:()=>({waitFor:async({timeout=30000,state})=>{
          assert.equal(state,'attached');
          const deadline=Date.now()+timeout;
          while(!nodes().length){
            if(Date.now()>=deadline)throw Object.assign(new Error('marker timeout'),{code:'E_LOCATOR_TIMEOUT'});
            await new Promise(resolve=>setTimeout(resolve,10));
          }
        }})
      };
    }
  };
  await page.goto(base+'pagination-batches-1.html');
  return page;
}

const config={url:base+'pagination-batches-1.html',
  itemConfig:{_listContainer:'#rows',_listItem:'article',id:'.id::text',title:'h1::text'},
  nextPageSelector:'a.next',waitForSelector:'.page-ready',timeoutMs:3000,maxPages:5};
test('complete SDK and frozen Task retain the second delayed batch and finish on an empty final document',async t=>{
  const task=JSON.parse(await readFile(new URL('../controller/scrapyjs.opendesk-task.json',import.meta.url)));
  await verifyTaskPackage(task);
  for(const frozen of [false,true])await t.test(frozen?'fixed Task bytes':'source modules',async()=>{
    const page=await fixturePage();
    try{
    let result;
    if(frozen){
      const {url,itemConfig,waitForSelector,timeoutMs,...options}=config;
      const scope=vm.createContext({page,params:{url,configJson:JSON.stringify(itemConfig),waitForSelector,timeoutMs,
        optionsJson:JSON.stringify(options)},URL,setTimeout,clearTimeout,console,TextEncoder,TextDecoder,
        axiosx:undefined,AppStorage:undefined,AppLocal:undefined,storage:undefined});
      vm.runInContext(task.sourceUtf8,scope);
      result=JSON.parse(JSON.stringify(await vm.runInContext('main()',scope)));
    }else result=await runCapture(config,page);
    assert.deepEqual(result.data,[{id:'A',title:'第一页'},{id:'B',title:'首批'},{id:'C',title:'第二批'}]);
    assert.equal(result.engine.status,'completed');
    assert.equal(result.engine.stopReason,'site_exhausted');
    assert.equal(result.stats.pageCount,3);
    assert.deepEqual(page.visits,['1','2','empty'].map(name=>base+'pagination-batches-'+name+'.html'));
    }finally{page.dispose();}
  });
});

test('unsupported same-document controls and ambiguous next controls fail before navigation',async t=>{
  for(const mode of ['button','hash','duplicate'])await t.test(mode,async()=>{
    const page=await fixturePage();
    try{
      await page.evaluate(mode=>{
        const next=document.querySelector('a.next');
        if(mode==='button')next.removeAttribute('href');
        else if(mode==='hash')next.setAttribute('href','#more');
        else document.body.appendChild(next.cloneNode(true));
      },mode);
      await assert.rejects(runCapture(config,page),{code:mode==='duplicate'?'E_LOCATOR_STRICT':'NOT_SUPPORTED'});
      assert.equal(page.visits.length,1);
    }finally{page.dispose();}
  });
});
