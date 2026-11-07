// Development/test adapter only. Real AccountService, key storage, cryptography
// and relay; only Chrome and Foundation drivers are private synthetic stores.
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createCookieAccountService} from '../../trusted/account-service.js';
import {COOKIE_ACCOUNT_PROTOCOL} from '../../trusted/account-contract.js';
import {SIDEBAR_TOOL_STORE,validateSidebarToolPackage,sidebarToolPackageHash} from '../../../../../src/ui/sidebar-tools/package.js';
import {TOOL_REVOCATION_EPOCHS_STORE} from '../../../../../src/ui/sidebar-tools/lifecycle.js';
import {BROWSER_MENU_GRANTS_STORE} from '../../../../../src/framework/sdk/browser-contract.js';
import {createDeviceKeyStorage} from '../../../../../src/platform/storage/device-keys.js';
import {createShareRelay,createShareHttpServer} from '../../../../../services/cookie-share-relay/server.mjs';

const origin='https://team.example.test',relayOrigin='https://team-relay.invalid';
const copy=v=>structuredClone(v);
function memoryStorage(){
  const records=new Map();let serial=Promise.resolve();
  const factory=async()=>({readOnly:false,transaction(stores,mode,work){
    const run=serial.then(async()=>{
      const draft=copy(records);
      const result=await work({get:async(s,k)=>copy(draft.get(k)),put:async(s,v,k)=>draft.set(k,copy(v)),delete:async(s,k)=>draft.delete(k),
        countPrefix:async(s,p)=>[...draft.keys()].filter(k=>k.startsWith(p)).length,
        keys:async(s,{prefix,limit})=>[...draft.keys()].filter(k=>k.startsWith(prefix)).sort().slice(0,limit)});
      if(mode==='readwrite'){records.clear();for(const [k,v]of draft)records.set(k,v);}return result;
    });serial=run.catch(()=>{});return run;
  }});return factory;
}
async function consumer(label,index){
  const tool=validateSidebarToolPackage({format:'opendesk.sidebar-tool.v2',id:'cookie-editor',version:'1.0.0',title:'Cookie Editor',
    description:'Synthetic team runtime',capabilities:['browser.cookies.read','browser.cookies.values','browser.cookies.write'],
    requires:{browserSdk:'1.0.0'},contributes:{contextMenus:[]},html:'<main></main>',css:'',js:'void 0;'});
  const hash=await sidebarToolPackageHash(tool),epoch='synthetic-install-'+label;
  const document={tabId:index,documentId:'synthetic-document-'+label,url:origin+'/'};
  const sender={id:'synthetic',documentId:'host-'+label,frameId:0,
    url:'chrome-extension://synthetic/sidepanel.html?hostInstanceId=00000000-0000-4000-8000-000000000000&toolId=cookie-editor'};
  const state={[SIDEBAR_TOOL_STORE]:[tool],[TOOL_REVOCATION_EPOCHS_STORE]:{'cookie-editor':epoch},
    [BROWSER_MENU_GRANTS_STORE]:{'cookie-editor':{version:tool.version,packageHash:hash,installEpoch:epoch,
      cookieSites:{[origin]:{read:true,values:true,write:true,grantEpoch:'synthetic-grant-'+label,storeId:'0'}}}}};
  const controls={rows:[],permission:true,writes:0,reloads:0,loseSwitchReceipt:false,document,state};
  const identity=r=>JSON.stringify([r.name,r.domain,r.path,r.storeId,r.partitionKey??null]);
  const api={runtime:{id:'synthetic',getURL:path=>'chrome-extension://synthetic/'+path,
    getContexts:async()=>[{contextType:'SIDE_PANEL',documentUrl:sender.url,documentId:sender.documentId,frameId:0,incognito:false}]},
    storage:{local:{get:async keys=>Object.fromEntries((Array.isArray(keys)?keys:[keys]).filter(k=>Object.hasOwn(state,k)).map(k=>[k,copy(state[k])]))}},
    permissions:{contains:async()=>controls.permission},
    tabs:{get:async()=>({id:document.tabId,url:document.url,active:true,incognito:false}),reload:async()=>{controls.reloads++;}},
    webNavigation:{getFrame:async()=>({...document,documentLifecycle:'active'})},
    cookies:{getAllCookieStores:async()=>[{id:'0',tabIds:[document.tabId]}],getPartitionKey:async()=>({partitionKey:{topLevelSite:origin,hasCrossSiteAncestor:false}}),
      getAll(query,callback){const rows=copy(controls.rows.filter(r=>(r.partitionKey??null)===(query.partitionKey??null)&&(!query.name||r.name===query.name)&&(!query.path||r.path===query.path)));if(callback)callback(rows);else return Promise.resolve(rows);},
      set(details,callback){controls.writes++;
        const row={name:details.name,value:details.value,domain:details.domain??new URL(details.url).hostname,path:details.path,storeId:details.storeId,
          hostOnly:details.domain===undefined,session:details.expirationDate===undefined,secure:details.secure,httpOnly:details.httpOnly,sameSite:details.sameSite,
          ...(details.partitionKey?{partitionKey:copy(details.partitionKey)}:{}),...(details.expirationDate!==undefined?{expirationDate:details.expirationDate}:{})};
        controls.rows=controls.rows.filter(r=>identity(r)!==identity(row));
        if(details.expirationDate===undefined||details.expirationDate>Date.now()/1000)controls.rows.push(row);
        callback(copy(row));}
    }};
  const storage=memoryStorage(),keyStorage=memoryStorage();
  const service=createCookieAccountService({api,storage,deviceKeyStorageFactory:options=>createDeviceKeyStorage({...options,storageFactory:keyStorage})});
  const dispatch=async(operation,payload={})=>{
    const result=await service.dispatch({protocol:COOKIE_ACCOUNT_PROTOCOL,toolId:'cookie-editor',operation,packageHash:hash,installEpoch:epoch,
      trustedClick:true,payload:{origin,document:copy(document),...payload}},sender);
    if(operation==='switch'&&controls.loseSwitchReceipt)throw Object.assign(Error('Synthetic lost response'),{code:'E_OUTCOME_UNKNOWN'});
    return result;
  };
  return {dispatch,controls,scope:async()=>({origin,documentId:document.documentId,tabId:document.tabId,url:document.url,storeId:'0',partitionKey:{topLevelSite:origin,hasCrossSiteAncestor:false},packageHash:hash,installEpoch:epoch}),
    inspect:()=>({driver:'SYNTHETIC_CHROME',writes:controls.writes,reloads:controls.reloads,
      currentSyntheticAccount:controls.rows[0]?.value==='synthetic-operations'?'OPERATIONS':controls.rows[0]?.value==='synthetic-design'?'DESIGN':'NONE'}),
    async createSource(displayName,value){
      controls.rows=[{name:'synthetic_team_session',value,domain:'team.example.test',path:'/',storeId:'0',hostOnly:true,session:true,secure:true,httpOnly:true,sameSite:'lax'}];
      const status=await dispatch('status');
      const saved=await dispatch('create',{revision:status.revision,displayName});
      const account=saved.accounts.find(a=>a.displayName===displayName);return {alias:account.alias,accountVersion:account.version};
    }};
}
export async function createTeamTrustedRuntime({directory}={}){
  const ownDirectory=!directory;directory??=await mkdtemp(join(tmpdir(),'cookie-team-runtime-'));await mkdir(directory,{recursive:true,mode:0o700});
  const relay=createShareRelay({dbPath:join(directory,'relay.sqlite'),publicOrigin:relayOrigin}),server=createShareHttpServer(relay);
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const priorFetch=globalThis.fetch;
  const routedFetch=async(input,options)=>{
    const url=new URL(typeof input==='string'?input:input.url);
    if(url.origin!==relayOrigin)return priorFetch(input,options);
    const response=await priorFetch('http://127.0.0.1:'+server.address().port+url.pathname,options);
    // Virtual HTTPS address -> owned loopback HTTP driver. This deliberately
    // supplies no network URL; it proves relay logic, never TLS/deployment.
    return new Response(response.body,{status:response.status,headers:response.headers});
  };
  globalThis.fetch=routedFetch;let closed=false;
  let sender,members;
  try{sender=await consumer('sender',1);members={A:await consumer('A',2),B:await consumer('B',3)};}
  catch(error){if(globalThis.fetch===routedFetch)globalThis.fetch=priorFetch;
    await new Promise(resolve=>server.close(resolve));relay.close();if(ownDirectory)await rm(directory,{recursive:true,force:true});throw error;}
  return {sender,members,
    async publishSource(source){const status=await sender.dispatch('status');return sender.dispatch('shareCreate',{
      ...source,revision:status.revision,relayOrigin,expiresInSeconds:3600,maxClaims:1,mode:'session'});},
    async deliver(invitation,recipient){
      const pairs=await sender.dispatch('sharePairs',{ref:invitation.ref});
      const requested=await recipient.dispatch('sharePair',{inviteUrl:invitation.url});
      const pair=pairs.pairs.find(p=>p.requestId===requested.pair.requestId&&p.receiverFingerprint===requested.pair.receiverFingerprint);
      if(!pair)throw Object.assign(Error('E_SYNTHETIC_PAIR'),{code:'E_SYNTHETIC_PAIR'});
      const status=await sender.dispatch('status');return sender.dispatch('shareDeliver',{ref:invitation.ref,requestId:pair.requestId,
        receiverFingerprint:pair.receiverFingerprint,revision:status.revision});
    },
    async close(){if(closed)return;closed=true;if(globalThis.fetch===routedFetch)globalThis.fetch=priorFetch;
      await new Promise(resolve=>server.close(resolve));relay.close();if(ownDirectory)await rm(directory,{recursive:true,force:true});}
  };
}
