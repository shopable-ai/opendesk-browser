import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {initChatGPTProjectRuntimeUI} from '../trusted/chatgpt-project-runtime-ui.js';

const task={sourceTabId:7,sourceDocumentId:'original-document',projectId:'project-1',
  sourceUrl:'https://chatgpt.com/c/abc12345-1234-1234-1234-abcdef123456',phase:'watching'};
const ids=['choice','source-choice','source-open','refresh','inspect','stop','review','status','receipt'];
const settle=()=>new Promise(resolve=>setImmediate(resolve));

function harness(handler){
  const html='<html><body>'+ids.map(id=>{
    if(id==='choice'||id==='source-choice')return '<select id="chatgpt-file-run-'+id+'"></select>';
    if(id==='receipt')return '<pre id="chatgpt-file-run-receipt" hidden></pre>';
    if(id==='status')return '<p id="chatgpt-file-run-status"></p>';
    return '<button id="chatgpt-file-run-'+id+'"></button>';
  }).join('')+'</body></html>';
  const {document:doc}=parseHTML(html);
  for(const id of ids){
    const node=doc.getElementById('chatgpt-file-run-'+id),listeners=new Map(),add=node.addEventListener.bind(node);
    node.handlers=listeners;
    node.addEventListener=(kind,fn)=>{listeners.set(kind,fn);add(kind,fn);};
    node.fire=(kind='click',isTrusted=true)=>listeners.get(kind)?.({isTrusted});
  }
  const events=new Set(),calls=[],api={
    runtime:{sendMessage:async value=>{calls.push(value);return handler(value);}},
    storage:{onChanged:{addListener:fn=>events.add(fn),removeListener:fn=>events.delete(fn)}}
  };
  const destroy=initChatGPTProjectRuntimeUI({api,document:doc});
  const get=id=>doc.getElementById('chatgpt-file-run-'+id);
  const choose=()=>{const selector=get('choice');selector.value=JSON.stringify([task.sourceTabId,task.sourceDocumentId,task.projectId]);selector.fire('change');};
  return {doc,calls,destroy,get,choose,change:(changes)=>{for(const listener of events)listener(changes,'local');}};
}
test('trusted file manager lists persisted tasks and never reads files by selecting',async()=>{
  const h=harness(msg=>msg.action==='project-list'?{ok:true,data:{tasks:[task]}}:
    {ok:true,data:{...task,phase:'watching',message:'original status',
      resultText:'private bytes',result:{status:'success'}}});
  try{
    await settle();
    assert.deepEqual(h.calls.map(x=>x.action),['project-list']);
    assert.equal(h.get('inspect').disabled,true);
    h.choose();
    assert.equal(h.calls.length,1,'selection never launches a request');
    h.get('inspect').fire();await settle();
    assert.deepEqual(h.calls.map(x=>x.action),['project-list','project-status']);
    assert.match(h.get('receipt').textContent,/private bytes/);
    h.change({'opendesk.chatgpt.files.grants.v1':{newValue:{}}});
    assert.equal(h.get('receipt').hidden,true);
    assert.equal(h.get('receipt').textContent,'');
    h.get('refresh').fire(false);await settle();
    assert.equal(h.calls.length,2,'synthetic click cannot dispatch');
  }finally{h.destroy();}
});
test('stop binds persisted source and task ID; a wrong response cannot expose a receipt',async()=>{
  let stopCount=0;
  const h=harness(msg=>{
    if(msg.action==='project-list')return {ok:true,data:{tasks:[task]}};
    if(msg.action==='project-status')return {ok:true,data:{...task,projectId:'other-project',phase:'completed',resultText:'secret'}};
    if(msg.action==='project-stop'){stopCount++;return {ok:true,data:{...task,phase:'paused'}};}
    if(msg.action==='project-review')return {ok:true,data:{opened:true}};
    throw Error('unexpected action');
  });
  try{
    await settle();h.choose();h.get('inspect').fire();await settle();
    assert.equal(h.get('receipt').hidden,true,'foreign result is never displayed');
    assert.match(h.get('status').textContent,/E_PROJECT_SOURCE/);
    h.get('stop').fire(false);await settle();assert.equal(stopCount,0);
    h.get('stop').fire();await settle();assert.equal(stopCount,1);
    assert.equal(h.calls.at(-1).sourceTabId,7);
    assert.equal(h.calls.at(-1).sourceDocumentId,'original-document');
    assert.equal(h.calls.at(-1).projectId,'project-1');
    assert.match(h.get('status').textContent,/已停止/);
    h.get('review').fire();await settle();
    assert.equal(h.calls.at(-1).action,'project-review');
  }finally{h.destroy();}
});
test('closed trusted page does not show late status or retain historical bytes',async()=>{
  let settleStatus;
  const h=harness(msg=>msg.action==='project-list'?{ok:true,data:{tasks:[task]}}:
    new Promise(resolve=>{settleStatus=resolve;}));
  await settle();h.choose();h.get('inspect').fire();await settle();
  h.destroy();settleStatus({ok:true,data:{...task,phase:'completed',resultText:'late private data'}});
  await settle();assert.equal(h.get('receipt').hidden,true);assert.equal(h.get('receipt').textContent,'');
});


test('manual review selects only a live original ChatGPT document, never makes a file request',async()=>{
  const source={sourceTabId:7,sourceDocumentId:'original-document',sourceUrl:task.sourceUrl,sourceWindowId:3};
  const h=harness(msg=>{
    if(msg.action==='project-list')return {ok:true,data:{tasks:[],sources:[source]}};
    if(msg.action==='review-source')return {ok:true,data:{opened:true}};
    throw Error('unexpected route: '+msg.action);
  });
  try{
    await settle();
    assert.equal(h.get('source-open').disabled,true);
    const picker=h.get('source-choice');
    picker.value=JSON.stringify([source.sourceTabId,source.sourceDocumentId]);picker.fire('change');
    assert.equal(h.get('source-open').disabled,false);
    h.get('source-open').fire(false);await settle();
    assert.equal(h.calls.length,1,'untrusted synthetic click cannot launch source');
    h.get('source-open').fire();await settle();
    assert.deepEqual(h.calls.map(x=>x.action),['project-list','review-source']);
    assert.deepEqual(Object.keys(h.calls[1]).sort(),['action','protocol','sourceDocumentId','sourceTabId'].sort());
    assert.equal(h.calls[1].sourceTabId,source.sourceTabId);
    assert.equal(h.calls[1].sourceDocumentId,source.sourceDocumentId);
    assert.match(h.get('status').textContent,/一次性可信审阅页/);
  }finally{h.destroy();}
});
