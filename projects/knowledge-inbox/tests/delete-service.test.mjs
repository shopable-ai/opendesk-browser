import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createSidebarToolPackage} from '../../../scripts/build-sidebar-tool.mjs';
import {installKnowledgeService} from '../../../src/knowledge/service.js';
import {KNOWLEDGE_DATA_KEY,KNOWLEDGE_PROTOCOL,knowledgePackageHash} from '../../../src/knowledge/policy.js';
import {SIDEBAR_TOOL_STORE} from '../../../src/ui/sidebar-tools/package.js';

const pkg=await createSidebarToolPackage(fileURLToPath(new URL('..',import.meta.url)));
const packageHash=await knowledgePackageHash(pkg);

function mount(){
  const id='abcdefghijklmnopabcdefghijklmnop';
  const getURL=path=>'chrome-extension://'+id+'/'+path;
  const url=getURL('sidepanel.html?hostInstanceId=12345678-1234-4123-8123-123456789abc');
  const sender={id,url,frameId:0,documentId:'host-doc'};
  const values={[SIDEBAR_TOOL_STORE]:[pkg]};
  let listener,retireAfterWrite=false,active=true;
  const api={runtime:{id,getURL,onMessage:{addListener(fn){listener=fn;}},
    getContexts:async()=>active?[{contextType:'SIDE_PANEL',documentUrl:url,documentId:sender.documentId,frameId:0}]:[]},
    tabs:{},storage:{local:{
      get:async keys=>Object.fromEntries([keys].flat().map(key=>[key,structuredClone(values[key])])),
      set:async patch=>{Object.assign(values,structuredClone(patch));if(retireAfterWrite)active=false;},
    }}};
  installKnowledgeService({api,lockManager:{request:async(_name,run)=>run()}});
  const send=(operation,payload)=>new Promise(resolve=>assert.equal(listener({protocol:KNOWLEDGE_PROTOCOL,
    toolId:pkg.id,packageHash,operation,payload},sender,resolve),true));
  return {send,values,retireAfterWrite(){retireAfterWrite=true;}};
}

const create=async({send})=>{
  const result=await send('knowledge.create',{title:'Fixture',markdown:'Saved draft',kind:'draft',tags:[],note:''});
  assert.equal(result.ok,true);return result.data.record;
};

test('knowledge service only gives a definitive missing code for an authorized record read',async()=>{
  const app=mount(),{id,revision}=await create(app);
  const {send}=app;
  const conflict=await send('knowledge.remove',{id,ifRevision:revision+1});
  assert.equal(conflict.error.code,'E_STORAGE_CONFLICT');
  assert.equal((await send('knowledge.get',{id})).data.record.id,id);
  assert.deepEqual(await send('knowledge.remove',{id,ifRevision:revision}),{ok:true,data:{saved:true,removed:true}});
  assert.equal((await send('knowledge.get',{id})).error.code,'E_KNOWLEDGE_NOT_FOUND');
  assert.notEqual((await send('knowledge.remove',{id,ifRevision:revision})).error.code,'E_KNOWLEDGE_NOT_FOUND');
  app.values[KNOWLEDGE_DATA_KEY]={invalid:true};
  assert.notEqual((await send('knowledge.get',{id})).error.code,'E_KNOWLEDGE_NOT_FOUND');
});

test('the service does not claim a delete was rejected when its trusted document retired after the write',async()=>{
  const app=mount(),{id,revision}=await create(app);
  app.retireAfterWrite();
  const result=await app.send('knowledge.remove',{id,ifRevision:revision});
  assert.equal(result.ok,false);
  assert.equal(result.error.code,'E_OUTCOME_UNKNOWN');
  assert.deepEqual(app.values[KNOWLEDGE_DATA_KEY].records,[]);
  const unauthorized=await app.send('knowledge.get',{id});
  assert.equal(unauthorized.ok,false);
  assert.notEqual(unauthorized.error.code,'E_KNOWLEDGE_NOT_FOUND');
});
