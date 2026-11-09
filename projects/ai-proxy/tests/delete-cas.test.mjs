import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {build,transform} from 'esbuild';

const settings=await readFile(new URL('../src/Settings.tsx',import.meta.url),'utf8');
const sources=await readFile(new URL('../src/ui/SourcesPage.tsx',import.meta.url),'utf8');
const bundle=await build({entryPoints:[new URL('../src/service.ts',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm'});
const {createProxyService}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const copy=value=>structuredClone(value);
const status={state:'disabled',canStop:false,control:'controllable_by_this_extension',reason:null};
const endpoint={id:'a',name:'Old endpoint',host:'proxy.example.com',port:1080,scheme:'socks5',sourceId:'manual'};
const profile={id:'pac',name:'Old PAC',kind:'pac-inline',sourceId:'manual',pacText:'function FindProxyForURL(url,host){return "DIRECT";}'};
const rule={id:'r',domain:'old.example',includeSubdomains:false,priority:1,enabled:true,action:'direct'};
const source={id:'sub',kind:'subscription',displayName:'Old subscription',trustedByUser:true,originHost:'example.com',format:'clash',syncStatus:'not-synced'};
function handler(text,key){
  const confirm=text.indexOf("t('"+key+"'");
  assert.ok(confirm>=0);
  const start=text.lastIndexOf('onClick={',confirm)+'onClick={'.length;
  const end=text.indexOf('}',text.indexOf(';',text.indexOf('DELETE_',confirm)))+1;
  return '('+text.slice(start,end)+')';
}
const cases=[
  ['settings endpoint',handler(settings,'confirmDeleteProxy'),'DELETE_ENDPOINT','endpoints',endpoint,{type:'SAVE_ENDPOINT',endpoint:{...endpoint,name:'New endpoint'}}],
  ['settings PAC',handler(settings,'confirmDeletePac'),'DELETE_PROFILE','profiles',profile,{type:'SAVE_PROFILE',profile:{...profile,name:'New PAC'}}],
  ['settings rule',settings.slice(settings.indexOf('  async function removeRule('),settings.indexOf('  async function loadBackupFile('))+'\nremoveRule','DELETE_RULE','rules',rule,{type:'SAVE_RULE',rule:{...rule,domain:'new.example'}}],
  ['sources local endpoint',handler(sources,'confirmDeleteLocal'),'DELETE_ENDPOINT','endpoints',endpoint,{type:'SAVE_ENDPOINT',endpoint:{...endpoint,name:'New endpoint'}}],
  ['sources subscription',sources.slice(sources.indexOf('  async function deleteSource('),sources.indexOf('  const back ='))+'\ndeleteSource','DELETE_SUBSCRIPTION','sources',source,{type:'SAVE_SUBSCRIPTION',source:{...source,displayName:'New subscription'}}]
];

for(const [name,code,type,collection,target,update] of cases){
  for(const timing of ['before click','during confirmation'])test(`${name}: shared-storage PC2 update ${timing} rejects cached PC1 DELETE without rerender or writes`,async()=>{
    let stored={schemaVersion:2,sources:[{id:'manual',kind:'manual',displayName:'Manual',trustedByUser:true},source],endpoints:[endpoint],profiles:[profile],rules:[rule],defaultTarget:{action:'direct'},selection:{mode:'system'},managed:false};
    let version=0,writes=0;
    const options={async load(){return {config:copy(stored),etag:`v${version}`};},async save(value,etag){assert.equal(etag,`v${version}`);stored=copy(value);writes++;return `v${++version}`;},async status(){return copy(status);}};
    const pc1=createProxyService(options),pc2=createProxyService(options);
    try{
      const opened=await pc1.request({type:'GET_STATE'});assert.equal(opened.ok,true,JSON.stringify(opened));
      const state=opened.state,initialEtag=state.configEtag;
      let approve,confirmationCount=0;const actions=[],responses=[],pending=[];
      const confirm=()=>{confirmationCount++;return new Promise(resolve=>{approve=resolve;});};
      const environment={confirm,getDraftRevision:()=>0,setDraftDirty:()=>true};
      const context={state,config:state.config,configEtag:initialEtag,p:target,endpoint:target,busy:false,
        t:key=>key,confirmIntent:confirm,getEnvironment:()=>environment,
        ruleEditorGeneration:{current:0},sectionContent:{current:null},navigation:{getRoute:()=> 'rules'},parseOptionsHash:()=> 'rules',
        ruleListPosition:{current:null},setRuleSaved(){},finishRuleEditor(){},navigateSubscription(){},
        act(message){actions.push(copy(message));const result=pc1.request(message).then(response=>{responses.push(response);return response.ok;});pending.push(result);return result;}};
      const compiled=await transform(code,{loader:'ts'});
      const click=runInNewContext(compiled.code,context);
      const change=async()=>{const result=await pc2.request(update);assert.equal(result.ok,true,JSON.stringify(result));};
      if(timing==='before click')await change();
      // Keep PC1's rendered state and closure unchanged: no GET_STATE or rerender.
      const clicked=click(type==='DELETE_SUBSCRIPTION'?target.id:target,target.name??target.displayName);
      assert.equal(confirmationCount,1);
      if(timing==='during confirmation')await change();
      const before=copy(stored),writesBefore=writes;
      approve(true);await clicked;await Promise.all(pending);
      assert.equal(actions.length,1);assert.equal(actions[0].type,type);assert.equal(actions[0].id,target.id);
      assert.equal(actions[0].ifMatch,initialEtag);
      assert.equal(responses[0].ok,false);assert.equal(responses[0].errorCode,'E_CONFLICT');
      assert.equal(writes,writesBefore,'stale DELETE must perform zero storage writes');
      assert.deepEqual(stored,before);assert.ok(stored[collection].some(row=>row.id===target.id));
      // Positive control: a fresh ETag can delete this same unreferenced record.
      const fresh=await pc1.request({type:'GET_STATE'});
      const deleted=await pc1.request({type,id:target.id,ifMatch:fresh.state.configEtag});
      assert.equal(deleted.ok,true,JSON.stringify(deleted));assert.equal(writes,writesBefore+1);
      assert.equal(stored[collection].some(row=>row.id===target.id),false);
    }finally{pc1.dispose();pc2.dispose();}
  });
}
