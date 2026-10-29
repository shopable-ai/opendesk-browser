import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
import {createCookieController} from '../../examples/sidebar-tools/cookie-editor/app/controller/cookie-controller.js';
import {parseTarget} from '../../examples/sidebar-tools/cookie-editor/app/domain/cookie-model.js';

// Execute the real app handlers/effects and real controller, with only the
// transport, leaf components and React scheduling replaced. No browser/storage.
const source=readFileSync(new URL('../../examples/sidebar-tools/cookie-editor/app/CookieEditorApp.jsx',import.meta.url),'utf8');
const code=transformSync(source.replace(/^import .*;\n/gm,'').replace('export default function','function'),
  {loader:'jsx',jsx:'transform'}).code;
const alpha={alias:'acct_alpha',origin:'https://example.com',displayName:'Alpha',version:1,allowAuto:false};
const beta={...alpha,alias:'acct_beta',displayName:'Beta'};
function mount(section='accounts'){
  const slots=[],effects=[],events=new Map(),timers=new Map();
  const copies=[];
  let begin=async()=>({authorized:true,ref:7}),copy=async()=>({copied:true});
  let cursor=0,tree,changed=true,controller,url='https://example.com/',permission=true,rows=[];
  let metadata={configured:true,unlocked:true,revision:1,accounts:[alpha,beta],settings:{autoRefresh:false}};
  let respond=async action=>action==='status'?structuredClone(metadata):
    action==='switch'?{switched:true,verified:true,reloadRequested:false}:
    structuredClone(metadata);
  const React={
    useRef(value){const i=cursor++;return slots[i]??={current:value};},
    useState(value){const i=cursor++;if(!(i in slots))slots[i]=value;
      return [slots[i],next=>{slots[i]=typeof next==='function'?next(slots[i]):next;changed=true;}];},
    useEffect(fn,deps){const i=cursor++,old=slots[i];
      if(!old||deps.some((value,j)=>!Object.is(value,old.deps[j])))
        effects.push(()=>{old?.cleanup?.();slots[i]={deps,cleanup:fn()};});},
    useLayoutEffect(fn,deps){this.useEffect(fn,deps);},
    createElement(type,props,...children){return {type,props:props||{},children:children.flat(Infinity)};}
  };
  const window={setTimeout:()=>Symbol(),clearTimeout(){},setInterval:fn=>{const id=Symbol();timers.set(id,fn);return id;},
    clearInterval:id=>timers.delete(id),addEventListener(){},removeEventListener(){}};
  const document={visibilityState:'visible',addEventListener(){},removeEventListener(){}};
  const adapter={targetFor:async()=>({target:parseTarget(url),reasonCode:null}),checkRead:async()=>({callableNow:permission}),
    list:async()=>structuredClone(rows),accountRequest:(action,payload)=>respond(action,payload),
    beginExportIntent:(target,method)=>{copies.push(['begin',target.url,method]);return begin();},
    copy:text=>{copies.push(['copy',text]);return copy();},
    finishExportIntent:async ref=>{copies.push(['finish',ref]);}};
  const names=[...source.matchAll(/^import (?:\{([^}]+)\}|(\w+)) from /gm)]
    .flatMap(match=>match[1]?match[1].split(',').map(x=>x.trim()):[match[2]])
    .filter(name=>!['createCookieSdkAdapter','createCookieController'].includes(name));
  const Component=new Function('React','window','document','createCookieSdkAdapter','createCookieController',...names,
    code+'\nreturn CookieEditorApp;')(React,window,document,()=>adapter,options=>{
      controller=createCookieController(options);return controller;
    },...names);
  const hostRoot={isConnected:true,querySelectorAll:()=>[],querySelector:()=>null,
    addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name)};
  function render(){cursor=0;changed=false;tree=Component({hostRoot,request(){},initialSection:section});
    for(const effect of effects.splice(0))effect();}
  const nodes=node=>node&&typeof node==='object'?[node,...node.children.flatMap(nodes)]:[];
  const accounts=()=>nodes(tree).find(node=>node.type==='CookieAccounts').props;
  async function flush(){for(let i=0;i<35;i++){if(changed)render();await Promise.resolve();}}
  render();
  return {flush,accounts,copies,get controller(){return controller;},
    copyHandler:()=>section==='accounts'?text=>accounts().onCopyLink(alpha,text):
      nodes(tree).find(node=>node.type==='CookieCustomizePanel').props.onCopyBrief,
    setBegin:fn=>{begin=fn;},setCopy:fn=>{copy=fn;},
    setResponse:fn=>{respond=fn;},setMetadata:value=>{metadata=value;},
    async action(name,...args){const result=accounts()[name](...args);await flush();await result;await flush();},
    async event(name){events.get(name)();await flush();},
    setUrl:value=>{url=value;},setPermission:value=>{permission=value;},setRows:value=>{rows=value;},
    async sync(){await controller.syncMetadata();await flush();},
    async tick(){for(const timer of timers.values())timer();await flush();}
  };
}

test('verified Alpha/Beta switch survives its metadata refresh and unchanged passive sync',async()=>{
  const app=mount();await app.flush();
  const epoch=app.controller.snapshot().epoch;
  app.setRows([{name:'switched',domain:'example.com',path:'/',storeId:'0'}]);
  await app.action('onSwitch',alpha);
  assert.equal(app.accounts().currentAlias,alpha.alias);
  assert.equal(app.controller.snapshot().epoch,epoch);
  assert.equal(app.accounts().accountReady,true);
  await app.sync();assert.equal(app.accounts().currentAlias,alpha.alias);
  await app.action('onSwitch',beta);
  assert.equal(app.accounts().currentAlias,beta.alias);
});

test('first account creation uses the trusted save action without password or lock handlers',async()=>{
  const app=mount();await app.flush();
  const calls=[];
  app.setResponse(async(action,payload)=>{
    calls.push({action,payload});
    return {configured:true,unlocked:true,revision:2,accounts:[alpha,beta]};
  });
  assert.equal(app.accounts().onUnlock,undefined);
  assert.equal(app.accounts().onLock,undefined);
  await app.action('onCreate','New account');
  assert.equal(calls.length,1);
  assert.equal(calls[0].action,'create');
  assert.equal(calls[0].payload.displayName,'New account');
  assert.equal(calls[0].payload.revision,1);
  assert.equal('passphrase' in calls[0].payload,false);
});

const createdAccount={...alpha,alias:'acct_new',displayName:'New account',description:'',cookieCount:1};
function creationReceipt(){
  return {configured:true,unlocked:true,revision:2,accounts:[alpha,beta,createdAccount],
    currentSnapshot:{alias:createdAccount.alias,version:1,revision:2,
      document:{tabId:7,documentId:'doc-a',url:'https://example.com/'}}};
}

test('a trusted post-save match shows the newly created account without claiming a switch',async()=>{
  const app=mount();await app.flush();
  app.setResponse(async()=>creationReceipt());
  await app.action('onCreate','New account','');
  assert.equal(app.accounts().currentAlias,createdAccount.alias);
  assert.equal(app.accounts().currentKind,'matched');
  await app.sync();
  assert.equal(app.accounts().currentAlias,createdAccount.alias);
});

test('linking a saved account accepts only its new post-save snapshot proof',async()=>{
  const app=mount();await app.flush();
  const receipt=creationReceipt();
  receipt.accounts=[{...alpha,cookieCount:1,version:2},beta];
  receipt.currentSnapshot={...receipt.currentSnapshot,alias:alpha.alias,version:2};
  app.setResponse(async()=>receipt);
  await app.action('onAttach',alpha);
  assert.equal(app.accounts().currentAlias,alpha.alias);
  assert.equal(app.accounts().currentKind,'matched');
});

test('saved metadata, mismatched proof and stale revisions never identify the current account',async()=>{
  for(const change of [
    receipt=>{delete receipt.currentSnapshot;},
    receipt=>{receipt.accounts[2].cookieCount=0;},
    receipt=>{receipt.currentSnapshot.alias=alpha.alias;},
    receipt=>{receipt.currentSnapshot.version=99;},
    receipt=>{receipt.currentSnapshot.revision=1;},
    receipt=>{receipt.revision=1;receipt.currentSnapshot.revision=1;},
    receipt=>{receipt.currentSnapshot.document.url='https://example.com/other';},
    receipt=>{receipt.currentSnapshot.document.documentId='';}
  ]){
    const app=mount();await app.flush();
    const receipt=structuredClone(creationReceipt());change(receipt);
    app.setResponse(async()=>receipt);
    await app.action('onCreate','New account','');
    assert.equal(app.accounts().currentAlias,null);
  }
});

test('a delayed create receipt cannot identify an old page, permission or Cookie view',async()=>{
  for(const change of ['path','permission','rows']){
    const app=mount();await app.flush();let release;
    app.setResponse(action=>action==='create'?new Promise(resolve=>{release=resolve;}):
      Promise.resolve({configured:true,unlocked:true,revision:1,accounts:[alpha,beta]}));
    const pending=app.accounts().onCreate('New account','');await app.flush();
    if(change==='path'){app.setUrl('https://example.com/other');await app.event('opendesk-page-changed');}
    if(change==='permission'){app.setPermission(false);await app.event('opendesk-cookie-grants-changed');}
    if(change==='rows'){
      app.setRows([{name:'changed',domain:'example.com',path:'/',storeId:'0'}]);await app.sync();
    }
    release(creationReceipt());await pending;await app.flush();
    assert.equal(app.accounts().currentAlias,null,change);
  }
});

test('site/permission invalidation and delete clear the verified alias',async()=>{
  for(const action of ['page','permission','delete']){
    const app=mount();await app.flush();await app.action('onSwitch',alpha);
    assert.equal(app.accounts().currentAlias,alpha.alias);
    if(action==='page'){app.setUrl('https://other.example/');await app.event('opendesk-page-changed');}
    if(action==='permission'){app.setPermission(false);await app.event('opendesk-cookie-grants-changed');}
    if(action==='delete'){
      app.setResponse(async()=>({configured:true,unlocked:true,revision:2,accounts:[beta]}));
      await app.action('onDelete',alpha);
    }
    assert.equal(app.accounts().currentAlias,null,action);
  }
});

test('outside metadata changes and unrelated epoch loads retire the alias',async()=>{
  for(const change of ['rows','epoch']){
    const app=mount();await app.flush();await app.action('onSwitch',alpha);
    assert.equal(app.accounts().currentAlias,alpha.alias);
    if(change==='rows'){
      app.setRows([{name:'outside',domain:'example.com',path:'/',storeId:'0'}]);await app.sync();
    }else{await app.controller.load();await app.flush();}
    assert.equal(app.accounts().currentAlias,null,change);
  }
});

test('a failed second switch retires earlier verified evidence',async()=>{
  for(const handler of ['onSwitch']){
    const app=mount();await app.flush();await app.action('onSwitch',alpha);
    assert.equal(app.accounts().currentAlias,alpha.alias);
    app.setResponse(async()=>{throw Object.assign(Error('unknown'),{code:'E_OUTCOME_UNKNOWN'});});
    await app.action(handler,beta);assert.equal(app.accounts().currentAlias,null);
  }
});

test('Host metadata cannot establish a current alias; verified current snapshot update retains it',async()=>{
  const app=mount();await app.flush();
  app.setResponse(async()=>({configured:true,unlocked:true,revision:2,
    accounts:[{...alpha,version:2},beta],currentAlias:alpha.alias}));
  await app.action('onRename',alpha,'Renamed Alpha');
  assert.equal(app.accounts().currentAlias,null);
  app.setResponse(async action=>action==='switch'?{switched:true,verified:true,reloadRequested:false}:
    {configured:true,unlocked:true,revision:3,accounts:[{...alpha,version:3},beta]});
  await app.action('onSwitch',{...alpha,version:2});
  assert.equal(app.accounts().currentAlias,alpha.alias);
  await app.action('onUpdate',{...alpha,version:2});
  assert.equal(app.accounts().currentAlias,alpha.alias);
});

test('stale and unverified switch receipts never claim an alias',async()=>{
  for(const kind of ['unverified','page','permission']){
    const app=mount();await app.flush();let finish;
    app.setResponse(()=>new Promise(resolve=>{finish=resolve;}));
    const pending=app.accounts().onSwitch(alpha);await app.flush();
    if(kind!=='unverified'){
      app.setResponse(async()=>({configured:true,unlocked:true,accounts:[alpha,beta]}));
      await app.event(kind==='page'?'opendesk-page-changed':'opendesk-cookie-grants-changed');
    }
    finish({switched:true,verified:kind!=='unverified',reloadRequested:false});
    await pending;await app.flush();assert.equal(app.accounts().currentAlias,null,kind);
  }
});

test('unknown results distinguish Cookie writes from account storage changes',async()=>{
  for(const [handler,args,pattern] of [
    ['onCreate',['Alpha'],/账号保存.*未确认/],
    ['onSwitch',[alpha],/可能发生部分 Cookie 写入/]
  ]){
    const app=mount();await app.flush();
    app.setResponse(async()=>{throw Object.assign(Error('unknown'),{code:'E_OUTCOME_UNKNOWN'});});
    await app.action(handler,...args);
    assert.match(app.accounts().feedback.text,pattern);
    if(handler==='onCreate')assert.doesNotMatch(app.accounts().feedback.text,/Cookie 写入/);
  }
});

test('account links and custom briefs synchronously enter and finally finish the one-use copy gate',async()=>{
  for(const section of ['accounts','custom']){
    const app=mount(section);await app.flush();
    let admit;app.setBegin(()=>new Promise(resolve=>{admit=resolve;}));
    const pending=app.copyHandler()('nonsecret text');
    assert.deepEqual(app.copies,[['begin','https://example.com/','copy']],section);
    admit({authorized:true,ref:7});await pending;await app.flush();
    assert.deepEqual(app.copies,[['begin','https://example.com/','copy'],
      ['copy','nonsecret text'],['finish',7]],section);
  }
});

test('both nonsecret callers refuse denied gates and context changes; dispatched failures still finish',async()=>{
  for(const section of ['accounts','custom'])for(const failure of ['denied','stale','copy']){
    const app=mount(section);await app.flush();let admit;
    app.setBegin(()=>new Promise(resolve=>{admit=resolve;}));
    if(failure==='copy')app.setCopy(async()=>{throw Error('clipboard unavailable');});
    const pending=Promise.resolve(app.copyHandler()('nonsecret text')).catch(()=>{});
    if(failure==='stale')await app.event('opendesk-cookie-grants-changed');
    admit(failure==='denied'?{authorized:false}:{authorized:true,ref:7});
    await pending;await app.flush();
    assert.equal(app.copies.some(([kind])=>kind==='copy'),failure==='copy',section+': '+failure);
    assert.equal(app.copies.some(([kind])=>kind==='finish'),failure!=='denied',section+': '+failure);
  }
});

test('context changes after clipboard dispatch suppress successful receipts for both nonsecret callers',async()=>{
  for(const section of ['accounts','custom']){
    const app=mount(section);await app.flush();let finish;
    app.setCopy(()=>new Promise(resolve=>{finish=resolve;}));
    let outcome='pending';
    const pending=Promise.resolve(app.copyHandler()('nonsecret text'))
      .then(result=>{outcome=result?.copied===true?'copied':'unconfirmed';},()=>{outcome='rejected';});
    await app.flush();await app.event('opendesk-page-changed');
    finish({copied:true});await pending;await app.flush();
    assert.notEqual(outcome,'copied');
    assert.equal(app.copies.at(-1)[0],'finish');
    if(section==='accounts')assert.notEqual(app.accounts().feedback?.kind,'success');
  }
});
