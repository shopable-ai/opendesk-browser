import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
import {createCookieController} from '../app/controller/cookie-controller.js';
import {warnCookieFailure} from '../app/controller/cookie-diagnostics.js';
import {parseTarget} from '../app/domain/cookie-model.js';
import {localExpirationText,parseLocalExpiration} from '../app/domain/cookie-expiration.js';
import {applyCookieAttributePatch,cookieAttributePatch,cookieDraftBinding} from '../app/domain/cookie-editor-draft.js';

const appSource=readFileSync(new URL('../app/CookieEditorApp.jsx',import.meta.url),'utf8');
const editorSource=readFileSync(new URL('../app/components/CookieInlineEditor.jsx',import.meta.url),'utf8');
const importSource=readFileSync(new URL('../app/components/CookieImport.jsx',import.meta.url),'utf8');
function compile(source,React,extra={}){
  const names=[...source.matchAll(/^import (?:\{([^}]+)\}|(\w+)) from /gm)]
    .flatMap(m=>m[1]?m[1].split(',').map(x=>x.trim()):[m[2]]);
  const dependencies=Object.fromEntries(names.map(name=>[name,name]));
  Object.assign(dependencies,extra);
  const code=transformSync(source.replace(/^import .*;\n/gm,'')
    .replace('export default function','function'),{loader:'jsx',jsx:'transform'}).code;
  const name=source.match(/export default function (\w+)/)[1];
  return new Function('React',...Object.keys(dependencies),code+'\nreturn '+name)(React,...Object.values(dependencies));
}
const nodes=node=>node&&typeof node==='object'?[node,...(node.children||[]).flatMap(nodes)]:[];
function runtime(){
  const slots=[],effects=[],layouts=[];
  let cursor=0,changed=true,tree;
  const React={
    useRef(value){const i=cursor++;return slots[i]??={current:value};},
    useState(value){const i=cursor++;if(!(i in slots))slots[i]=typeof value==='function'?value():value;
      return [slots[i],next=>{const value=typeof next==='function'?next(slots[i]):next;
        if(!Object.is(value,slots[i])){slots[i]=value;changed=true;}}];},
    useEffect(fn,deps){schedule(effects,fn,deps);},
    useLayoutEffect(fn,deps){schedule(layouts,fn,deps);},
    useId(){return 'test-id-'+cursor++;},
    createElement(type,props,...children){return {type,props:props||{},children:children.flat(Infinity)};}
  };
  function schedule(queue,fn,deps){const i=cursor++,old=slots[i];
    if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j])))
      queue.push(()=>{old?.cleanup?.();slots[i]={deps,cleanup:fn()};});}
  return {React,get tree(){return tree;},get changed(){return changed;},
    render(Component,props,attach=()=>{}){cursor=0;changed=false;tree=Component(props);attach(tree);
      for(const fn of layouts.splice(0))fn();for(const fn of effects.splice(0))fn();},
    dispose(){for(const slot of slots)slot?.cleanup?.();}};
}
const cookie={name:'sid',domain:'example.com',path:'/',hostOnly:true,storeId:'0',session:true};
function mount({notify}={}){
  const rt=runtime(),events=new Map(),secrets=[{value:'pasted secret'}],outputs=[{textContent:'secret',hidden:false}];
  let controller,url='https://example.com/start',permission=true,resolveTarget=null,tree;
  let rows=[cookie],storeId='0',partitionKey={topLevelSite:'https://example.com'};
  const calls=[],timers=new Map();let nextTimer=0;
  const adapter={targetFor:()=>resolveTarget?resolveTarget():Promise.resolve({target:parseTarget(url),reasonCode:null}),
    checkRead:async()=>({callableNow:permission}),list:async()=>rows,
    accountRequest:async()=>({unlocked:true,accounts:[]}),
    getStore:async()=>({storeId}),
    getPartition:async()=>({partitionKey}),
    readValue:async()=>{calls.push('read');return 'live secret';},
    beginImportIntent:async()=>({authorized:true,ref:9}),finishImportIntent:async ref=>calls.push(['finishImport',ref]),
    beginWriteIntent:async()=>{calls.push('write');return {authorized:false};},
    finishWriteIntent:async ref=>calls.push(['finishWrite',ref])};
  const window={setTimeout:fn=>{const id=++nextTimer;timers.set(id,fn);return id;},
    clearTimeout:id=>timers.delete(id),setInterval:()=>1,clearInterval(){},addEventListener(){},removeEventListener(){}};
  const document={visibilityState:'visible',addEventListener(){},removeEventListener(){}};
  const focus=[];
  const hostRoot={isConnected:true,querySelectorAll:selector=>selector.includes('input')?secrets:outputs,
    contains:node=>Boolean(node),querySelector:selector=>({focus:()=>{
      focus.push(selector);document.activeElement=null;
    }}),addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name)};
  const Component=compile(appSource,rt.React,{window,document,globalThis:{OpenDeskTool:notify?{ui:{notify}}:undefined},
    cookieDraftBinding,warnCookieFailure,createCookieSdkAdapter:()=>adapter,
    createCookieController:options=>(controller=createCookieController({...options,navigationIntervalMs:0}))});
  function render(){rt.render(Component,{hostRoot,request(){}});tree=rt.tree;}
  async function flush(){for(let i=0;i<45;i++){if(rt.changed)render();await Promise.resolve();}}
  render();
  const find=type=>nodes(tree).find(n=>n.type===type)?.props;
  return {flush,calls,secrets,outputs,find,focus,rendered:()=>nodes(tree),get controller(){return controller;},
    focusWithin:selector=>{document.activeElement={closest:value=>value.includes(selector)};},
    selectTab:key=>nodes(tree).find(n=>n.props.id==='cookie-product-tab-'+key).props.onClick(),
    elapse(){for(const [id,fn] of timers){timers.delete(id);fn();}},
    view:()=>find('CookieEditorView'),
    editor:()=>{const view=find('CookieEditorView');return view.selected==='new'?view.newEditor:
      view.selected?view.editor(controller.getRow(view.selected)):null;},
    event(name='opendesk-cookie-path-changed'){events.get(name)();},
    invalidate(name){events.get(name)();},
    setWriteBegin:fn=>{adapter.beginWriteIntent=fn;},
    setClearExecute:fn=>Object.assign(adapter,{
      clearPreview:async()=>({scope:'SITE_EXACT_HOST',matched:2,excluded:1,
        previewRef:'12345678-1234-1234-1234-123456789abc'}),
      beginClearIntent:async()=>({authorized:true,ref:1}),finishClearIntent:async()=>{},clearExecute:fn
    }),
    setImportWrite:fn=>Object.assign(adapter,{exactList:async()=>[],supportsWriteMany:()=>true,writeMany:fn}),
    setList:fn=>{adapter.list=fn;},
    setUrl:value=>{url=value;},setPermission:value=>{permission=value;},hold:fn=>{resolveTarget=fn;},
    setRows:value=>{rows=value;},setStore:value=>{storeId=value;},setPartition:value=>{partitionKey=value;},
    dispose(){rt.dispose();}};
}
function mountEditor(props){
  const rt=runtime(),value={value:'',focus(){}},name={focus(){}};
  const timers=new Map();let nextTimer=0;
  const Component=compile(editorSource,rt.React,{localExpirationText,parseLocalExpiration,applyCookieAttributePatch,cookieAttributePatch,
    setTimeout:fn=>{const id=++nextTimer;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id)});
  let current=props;
  function render(){rt.render(Component,current,tree=>{
    for(const node of nodes(tree)){
      if(node.type==='CookieValueField')node.props.inputRef.current=value;
      if(node.props['aria-label']==='名称')node.props.ref.current=name;
    }
  });}
  async function flush(){for(let i=0;i<20;i++){if(rt.changed)render();await Promise.resolve();}}
  render();
  return {value,flush,update(props){current={...current,...props};render();},
    find:type=>nodes(rt.tree).find(n=>n.type===type)?.props,
    findLabel:label=>nodes(rt.tree).find(n=>n.props['aria-label']===label)?.props,
    all:()=>nodes(rt.tree),dispose(){rt.dispose();}};
}

test('real path handler retains selection, list controls and attribute draft while scrubbing secrets',async t=>{
  const app=mount();t.after(()=>app.dispose());await app.flush();
  app.view().onQuery('sid');app.view().onFilter('session');app.view().onSort('name');
  app.view().onToggleFilters();await app.flush();app.view().onPage(3);
  app.view().onSelect(app.controller.snapshot().rows[0].id);await app.flush();
  const editor=mountEditor(app.editor().props);t.after(()=>editor.dispose());await editor.flush();
  assert.equal(editor.value.value,'live secret');
  editor.find('CookieAdvancedFields').onChange('httpOnly',true);await editor.flush();await app.flush();
  editor.value.value='unsaved secret';editor.find('CookieValueField').onChange();await editor.flush();
  const oldEditor=app.editor().props,oldRevision=oldEditor.navigationRevision;
  let release;app.hold(()=>new Promise(resolve=>{release=resolve;}));app.setUrl('https://example.com/next');
  app.event();assert.equal(app.secrets[0].value,'');assert.equal(app.outputs[0].textContent,'');
  await app.flush();assert.equal(app.controller.snapshot().navigationPending,true);
  editor.dispose();
  assert.equal(editor.value.value,'');
  assert.equal(app.editor(),null,'the old editor does not render during verification');
  assert.equal(app.calls.filter(x=>x==='read').length,1,'no value read during verification');
  await oldEditor.onSave({name:'sid'},{});
  assert.equal(app.calls.includes('write'),false,'direct callback also refuses a pending navigation');
  const view=app.view();assert.equal(view.query,'sid');assert.equal(view.filter,'session');
  assert.equal(view.sort,'name');assert.equal(view.page,3);assert.equal(view.expandedFilters,true);
  app.hold(null);release({target:parseTarget('https://example.com/next'),reasonCode:null});await app.flush();
  const fresh=mountEditor(app.editor().props);t.after(()=>fresh.dispose());await fresh.flush();
  assert.equal(fresh.value.value,'live secret','fresh authorized read after verified navigation');
  assert.equal(fresh.find('CookieAdvancedFields').draft.httpOnly,true);
  assert.equal(app.editor().props.navigationRevision,oldRevision+1);
  app.event();await app.flush();
  assert.equal(app.editor().props.navigationRevision,oldRevision+2,'same URL event also retires the value generation');
});

test('path handler keeps import surface but retires raw content, intent and review plans',async t=>{
  const app=mount();t.after(()=>app.dispose());await app.flush();
  app.view().onImport();await app.flush();const old=app.find('CookieImport');
  old.onPendingChange(true);assert.equal(await old.onBeginImport(),true);
  const previousKey=old.key;
  let discardedImport=0,discardedClear=0;
  const discardImport=app.controller.discardImport,discardClear=app.controller.discardClear;
  app.controller.discardImport=()=>{discardedImport++;discardImport();};
  app.controller.discardClear=()=>{discardedClear++;discardClear();};
  let release;app.hold(()=>new Promise(resolve=>{release=resolve;}));app.event();await app.flush();
  const fresh=app.find('CookieImport');assert.ok(fresh);assert.notEqual(fresh.key,previousKey);
  assert.equal(fresh.disabled,true);assert.match(fresh.notice.text,/导入内容已清除/);
  assert.equal(await old.onBeginImport(),false);assert.equal(await old.onImportText('sid=unsafe'),false);
  assert.deepEqual(app.calls.filter(Array.isArray),[['finishImport',9]]);
  assert.equal(discardedImport,1);assert.equal(discardedClear,1);assert.equal(app.secrets[0].value,'');
  app.hold(null);release({target:parseTarget('https://example.com/start'),reasonCode:null});await app.flush();
});

for(const [outcome,expected] of [
  ['not submitted',/本次导入未提交/],
  ['partial',/操作回执：Chrome 已确认导入 1\/3 条；其余条目未写入/],
  ['unknown',/操作结果未确认：.*请勿直接重试/]
])test('same-site navigation leaves the late '+outcome+' import receipt above the workspace',async t=>{
  const app=mount(),dialog=runtime();t.after(()=>{dialog.dispose();app.dispose();});
  const textarea={value:'first=fake-secret; second=secret-two; third=secret-three',focus(){}};
  const nativeDialog={open:false,showModal(){this.open=true;},close(){this.open=false;}};
  const Component=compile(importSource,dialog.React);
  let settle,writes=0;
  app.setImportWrite(()=>{writes++;return new Promise((resolve,reject)=>{settle={resolve,reject};});});
  await app.flush();app.view().onImport();await app.flush();
  const oldImport=app.find('CookieImport');
  dialog.render(Component,oldImport,tree=>{
    for(const node of nodes(tree)){
      if(node.type==='dialog')node.props.ref.current=nativeDialog;
      if(node.type==='textarea')node.props.ref.current=textarea;
    }
  });
  nodes(dialog.tree).find(n=>n.type==='Button'&&n.children.includes('确认导入')).props.onClick();
  await app.flush();assert.equal(writes,1);
  app.setUrl('https://example.com/other');app.event();await app.flush();
  assert.equal(app.find('CookieImport'),undefined,'a new modal cannot cover the earlier operation');
  dialog.dispose();assert.equal(textarea.value,'');
  if(outcome==='partial')settle.resolve({saved:1,verified:1,stopped:true,results:[
    {index:0,saved:true,verified:true},{index:1,saved:false,verified:false,code:'E_COOKIE_CONFLICT'}
  ]});
  else settle.reject(Object.assign(Error('secret'),{code:outcome==='unknown'?'E_OUTCOME_UNKNOWN':'E_COOKIE_NOT_SUBMITTED'}));
  await app.flush();
  const messages=()=>app.rendered().filter(n=>['alert','status'].includes(n.props.role))
    .map(n=>n.children.filter(x=>typeof x==='string').join('')).join('\n');
  assert.match(messages(),expected);
  assert.doesNotMatch(messages(),/重新准备并确认导入|fake-secret|secret-two/);
  if(outcome==='unknown'){
    assert.equal(app.view().onImport,undefined,'unknown results disable opening a new import');
    assert.equal(await oldImport.onBeginImport(),false);
    app.rendered().find(n=>n.type==='Button'&&n.children.includes('已核对')).props.onClick();
    await app.flush();assert.equal(typeof app.view().onImport,'function');
  }
  assert.equal(writes,1);
});

for(const [label,code,prefix,role,expected,locked] of [
  ['明确拒绝','E_COOKIE_CONFLICT',0,'alert',/已确认 0\/3 条；本次写入被明确拒绝/,false],
  ['部分成功','E_COOKIE_CONFLICT',1,'status',/已确认导入 1\/3 条；其余条目未写入/,true],
  ['写入前超时','E_COOKIE_BATCH_EXPIRED',0,'alert',/本次未写入.*失败 0 条，未知 0 条，未执行 3 条/,false],
  ['部分成功后超时','E_COOKIE_BATCH_EXPIRED',1,'status',/确认时限已到.*未执行 2 条/,true],
  ['结果未知','E_OUTCOME_UNKNOWN',1,'alert',/已确认 1\/3 条；其余结果未知/,true]
])test('导入弹窗显示'+label+'并按回执限制原批次',async t=>{
  const app=mount(),dialog=runtime();t.after(()=>{dialog.dispose();app.dispose();});
  const textarea={value:'first=fake-secret; second=secret-two; third=secret-three',focus(){}};
  const nativeDialog={open:false,showModal(){this.open=true;},close(){this.open=false;}};
  const Component=compile(importSource,dialog.React);
  let writes=0;
  app.setImportWrite(async(_,batch)=>{
    writes++;assert.equal(batch.length,3);
    return {saved:prefix,verified:prefix,stopped:true,results:[
      ...(prefix?[{index:0,saved:true,verified:true}]:[]),
      {index:prefix,saved:false,verified:false,code}
    ]};
  });
  await app.flush();app.view().onImport();await app.flush();
  const render=()=>dialog.render(Component,app.find('CookieImport'),tree=>{
    for(const node of nodes(tree)){
      if(node.type==='dialog')node.props.ref.current=nativeDialog;
      if(node.type==='textarea')node.props.ref.current=textarea;
    }
  });
  const button=title=>nodes(dialog.tree).find(n=>n.type==='Button'&&n.children.includes(title));
  render();button('确认导入').props.onClick();await app.flush();render();
  const notice=nodes(dialog.tree).find(n=>n.props.className?.startsWith('cookie-import-inline-notice'));
  assert.match(notice.children.join(''),expected);
  assert.doesNotMatch(notice.children.join(''),/secret|example\.com|确认后写入/);
  assert.equal(notice.props.role,role);
  assert.equal(button('确认导入').props.disabled,locked);
  assert.equal(Boolean(textarea.value),!locked);
  if(locked){
    button('确认导入').props.onClick();await app.flush();
    assert.equal(writes,1);
    button('关闭').props.onClick();await app.flush();
    assert.equal(app.find('CookieImport'),undefined);
  }
  assert.deepEqual(app.controller.snapshot().unknownEffects,code==='E_OUTCOME_UNKNOWN'?['import']:[]);
  assert.equal(writes,1);
});

test('navigation after a batch of conflicts preserves the late receipt and stops the next batch',async t=>{
  const app=mount();t.after(()=>app.dispose());
  const rows=Array.from({length:51},(_,i)=>({...cookie,name:'test_'+i,value:'synthetic'}));
  const submitted=[];
  let finish;
  app.setImportWrite((_,batch)=>{
    submitted.push(batch.length);
    return new Promise(resolve=>{finish=()=>resolve({saved:0,verified:0,
      results:batch.map((_,index)=>({index,saved:false,verified:false,skipped:true,code:'E_COOKIE_CONFLICT'}))});});
  });
  await app.flush();app.view().onImport();await app.flush();
  const dialog=app.find('CookieImport');
  assert.equal(await dialog.onBeginImport(),true);
  const result=dialog.onImportText(JSON.stringify(rows));
  await app.flush();assert.deepEqual(submitted,[50]);
  app.setUrl('https://example.com/other');app.event();await app.flush();
  finish();await result;await app.flush();
  assert.deepEqual(submitted,[50]);
  assert.equal(app.controller.snapshot().unknownEffects.includes('import'),false);
  const messages=app.rendered().filter(n=>['alert','status'].includes(n.props.role))
    .map(n=>n.children.filter(x=>typeof x==='string').join('')).join('\n');
  assert.match(messages,/已确认导入 0\/51 条.*跳过 50 条，失败 0 条，未知 0 条，未执行 1 条/);
});

test('a mixed JSON import keeps a redacted receipt that explains which rows were skipped',async t=>{
  const app=mount();t.after(()=>app.dispose());
  const writes=[];
  app.setImportWrite(async(_,batch)=>{
    writes.push(...batch);
    return {results:batch.map((_,index)=>({index,saved:true,verified:true}))};
  });
  await app.flush();app.view().onImport();await app.flush();
  const dialog=app.find('CookieImport');
  assert.equal(await dialog.onBeginImport(),true);
  const json=JSON.stringify([
    {...cookie,name:'test_preference',value:'fake-receipt-value'},
    {...cookie,name:'expired_preference',value:'fake-expired-value',session:false,expirationDate:1},
    {...cookie,name:'other_store',value:'fake-store-value',storeId:'1'}
  ]);
  assert.equal(await dialog.onImportText(json,{overwrite:true}),true);
  await app.flush();app.elapse();await app.flush();
  const findReceipt=()=>app.rendered().find(n=>n.props.className?.startsWith('cookie-import-toast'));
  const receipt=findReceipt();
  assert.ok(receipt,'the mixed receipt remains visible after ordinary success feedback would expire');
  assert.equal(receipt.props.role,'status');
  assert.match(receipt.children.join(''),/确认写入 1 条.*跳过 2 条.*已过期 1 条.*存储区不匹配 1 条/);
  assert.doesNotMatch(receipt.children.join(''),/fake-.*-value|expired_preference|other_store/);
  assert.deepEqual(writes.map(row=>row.name),['test_preference']);
  app.rendered().find(n=>n.props.label==='关闭导入回执').props.onClick();
  await app.flush();assert.equal(findReceipt(),undefined);
});

test('a row expiring after preflight invalidates confirmation before any write',async t=>{
  const app=mount();t.after(()=>app.dispose());
  let now=Date.now(),writes=0;
  t.mock.method(Date,'now',()=>now);
  app.setImportWrite(async()=>{writes++;});
  await app.flush();
  const source=JSON.stringify([{...cookie,value:'synthetic',session:false,expirationDate:now/1000+2}]);
  const options={allSites:true,submitDirectly:true};
  assert.equal((await app.controller.previewImport(source,'auto',false,options)).accepted,1);
  now+=3000;
  assert.equal(await app.controller.executeImport(source,'auto',false,options),false);
  const state=app.controller.snapshot();
  assert.equal(writes,0);
  assert.equal(state.importOutcome,'denied');
  assert.deepEqual(state.unknownEffects,[]);
  assert.match(state.message,/已过期.*本次未写入.*失败 0 条，未知 0 条，未执行 1 条/);
});
for(const [code,expected] of [
  ['E_SITE_GRANT_REQUIRED',/已确认导入 1\/4 条.*跳过 1 条，失败 0 条，未知 0 条，未执行 2 条/],
  ['E_OUTCOME_UNKNOWN',/已确认 1\/4 条.*跳过 1 条，失败 0 条，未知 1 条，未执行 1 条/]
])test('a mixed import preserves the confirmed prefix and preflight skip on '+code,async t=>{
  const app=mount();t.after(()=>app.dispose());
  let calls=0;
  app.setImportWrite(async(_,rows)=>{
    calls++;
    if(calls===1)return {saved:1,verified:1,results:[{index:0,saved:true,verified:true}]};
    if(code==='E_SITE_GRANT_REQUIRED')throw Object.assign(Error('fixture secret'),{code});
    assert.equal(rows.length,2);
    return {saved:0,verified:0,stopped:true,results:[{index:0,saved:false,verified:false,code}]};
  });
  await app.flush();app.view().onImport();await app.flush();
  const dialog=app.find('CookieImport');
  assert.equal(await dialog.onBeginImport(),true);
  const source=JSON.stringify([
    {...cookie,name:'fixture_confirmed',value:'fixture secret'},
    {...cookie,name:'fixture_expired',value:'fixture secret',session:false,expirationDate:1},
    {...cookie,name:'fixture_second',value:'fixture secret',path:'/later'},
    {...cookie,name:'fixture_third',value:'fixture secret',path:'/later'}
  ]);
  assert.equal(await dialog.onImportText(source),code==='E_OUTCOME_UNKNOWN'?'unknown':'partial');
  await app.flush();
  const state=app.controller.snapshot(),receipt=state.previousReceipt?.text||state.message;
  assert.match(receipt,expected);
  assert.match(receipt,/跳过原因：已过期 1 条/);
  assert.doesNotMatch(receipt,/fixture|example\.com/);
  assert.deepEqual(state.unknownEffects,code==='E_OUTCOME_UNKNOWN'?['import']:[]);
  assert.equal(calls,2);
});
test('verified import closes the dialog and keeps its visible receipt when the list refresh stalls and fails',async t=>{
  const app=mount();t.after(()=>app.dispose());
  app.setImportWrite(async(_,batch)=>({results:batch.map((_,index)=>({index,saved:true,verified:true}))}));
  await app.flush();app.view().onImport();await app.flush();
  const dialog=app.find('CookieImport');
  assert.equal(await dialog.onBeginImport(),true);
  let failRefresh;
  app.setList(()=>new Promise((_,reject)=>{failRefresh=reject;}));
  let submitted;
  const pending=dialog.onImportText('synthetic_preference=fixture-value').then(value=>{submitted=value;});
  await app.flush();
  assert.equal(typeof failRefresh,'function','a list refresh is still attempted');
  assert.equal(submitted,true,'the submit action settles while the list refresh is pending');
  assert.equal(app.find('CookieImport'),undefined);
  const receipt=()=>app.rendered().find(n=>n.props.className?.startsWith('cookie-import-toast'));
  assert.match(receipt().children.join(''),/确认写入 1 条/);
  failRefresh(Object.assign(Error(),{code:'E_TIMEOUT'}));
  await pending;await app.flush();
  assert.equal(app.controller.snapshot().syncStale,true);
  assert.match(receipt().children.join(''),/确认写入 1 条/);
  assert.equal(app.controller.snapshot().unknownEffects.includes('import'),false);
});

test('pending page notification immediately scrubs sensitive DOM and fences an existing editor',async t=>{
  const app=mount();t.after(()=>app.dispose());await app.flush();
  app.view().onSelect(app.controller.snapshot().rows[0].id);await app.flush();
  const oldEditor=app.editor().props;
  app.focusWithin('.cookie-list');
  let release;app.hold(()=>new Promise(resolve=>{release=resolve;}));
  app.event('opendesk-cookie-page-pending');
  assert.equal(app.secrets[0].value,'');assert.equal(app.outputs[0].textContent,'');
  await app.flush();
  assert.equal(app.controller.snapshot().rows.length,1);
  assert.equal(app.controller.snapshot().navigationPending,true);
  assert.deepEqual(app.view().rows,[],'no old row reaches the rendered list');
  assert.equal(app.editor(),null);
  assert.equal(app.focus.at(-1),'[aria-label="搜索 Cookie"]');
  assert.equal(app.find('CookieSiteBar').site,'');
  await oldEditor.onSave({name:'sid'},{});
  assert.equal(app.calls.includes('write'),false);
  app.hold(null);release({target:parseTarget('https://example.com/start')});await app.flush();
  assert.equal(app.controller.snapshot().navigationPending,false);
  app.event('opendesk-cookie-path-changed');await app.flush();
  assert.equal(app.view().rows[0].name,'sid');
  assert.equal(app.find('CookieSiteBar').site,'example.com');
});

test('pending SPA retires the account detail, keeps safe focus, and allows Retry after the grace period',async t=>{
  const app=mount();t.after(()=>app.dispose());await app.flush();
  app.selectTab('accounts');await app.flush();
  assert.ok(app.find('CookieAccounts'));
  app.find('CookieAccounts').onRoute('auto');await app.flush();
  app.focusWithin('.cookie-account-page');
  let old;app.hold(()=>new Promise(resolve=>{old=resolve;}));
  app.event('opendesk-cookie-page-pending');await app.flush();
  assert.equal(app.find('CookieAccounts'),undefined);
  assert.equal(app.find('CookiePermissions'),undefined);
  assert.ok(app.focus.length);
  app.elapse();await app.flush();
  const recovery=app.find('CookiePermissions');
  assert.equal(recovery.disabled,false);
  app.setUrl('https://example.com/recovered');app.hold(null);
  await recovery.onRetry();await app.flush();
  assert.equal(app.find('CookieSiteBar').site,'example.com');
  assert.ok(app.find('CookieAccounts'));
  old({target:parseTarget('https://example.com/start')});await app.flush();
  assert.equal(app.controller.snapshot().target.url,'https://example.com/recovered');
});

test('real grant, document and origin invalidation still discard the editor',async t=>{
  for(const kind of ['grant','document','origin']){
    const app=mount();t.after(()=>app.dispose());await app.flush();app.view().onNew();await app.flush();
    app.editor().props.onDirty(true);await app.flush();
    if(kind==='grant'){app.setPermission(false);app.invalidate('opendesk-cookie-grants-changed');}
    if(kind==='document')app.invalidate('opendesk-page-changed');
    if(kind==='origin'){app.setUrl('https://other.example/');app.event();}
    await app.flush();assert.equal(app.editor(),null,kind);assert.equal(app.secrets[0].value,'',kind);
  }
});

test('Retry is actionable while reload is still loading and late replies cannot replace it',async t=>{
  const app=mount();t.after(()=>app.dispose());await app.flush();
  app.view().onSelect(app.controller.snapshot().rows[0].id);await app.flush();
  const oldProps=app.editor().props,editor=mountEditor(oldProps);await editor.flush();
  editor.findLabel('名称').onChange({target:{value:'private name'}});await editor.flush();
  editor.find('CookieAdvancedFields').onChange('path','/private-text');await editor.flush();
  editor.find('CookieAdvancedFields').onChange('httpOnly',true);await editor.flush();
  editor.value.value='private value';editor.find('CookieValueField').onChange();await editor.flush();
  editor.all().find(n=>n.children.includes('取消')).props.onClick();await editor.flush();
  let old;app.hold(()=>new Promise(resolve=>{old=resolve;}));
  app.event('opendesk-page-changed');await app.flush();
  editor.dispose();
  assert.equal(app.controller.snapshot().phase,'loading');
  assert.equal(app.editor(),null);
  assert.equal(app.view().listRecovery,null);
  app.elapse();await app.flush();
  const recovery=app.view().listRecovery.props;
  assert.equal(recovery.disabled,false);
  app.setUrl('https://example.com/new-document');app.hold(null);
  await recovery.onRetry();await app.flush();
  old({target:parseTarget('https://example.com/start')});await app.flush();
  const restored=app.editor().props;
  assert.deepEqual(restored.restoredAttributes,{httpOnly:true});
  const fresh=mountEditor(restored);t.after(()=>fresh.dispose());await fresh.flush();
  assert.equal(fresh.findLabel('名称').value,cookie.name);
  assert.equal(fresh.find('CookieAdvancedFields').draft.path,cookie.path);
  assert.equal(fresh.value.value,'live secret');
  assert.equal(fresh.all().some(n=>n.children.includes('放弃当前未保存修改？')),false);
  await oldProps.onSave({...cookie,value:'private value'},{});
  assert.equal(app.calls.includes('write'),false);
  assert.equal(app.controller.snapshot().target.url,'https://example.com/new-document');
  assert.equal(app.view().listRecovery,null);
});

test('hard reload restores only against the original verified scope, unique row and metadata baseline',async t=>{
  for(const [scenario,change] of [
    ['same scope',()=>{}],
    ['different origin',app=>app.setUrl('http://example.com/')],
    ['different Store',app=>{app.setStore('1');app.setRows([{...cookie,storeId:'1'}]);}],
    ['different Partition for an unpartitioned row',app=>app.setPartition({topLevelSite:'https://other.example'})],
    ['different Partition ancestor',app=>app.setPartition({topLevelSite:'https://example.com',hasCrossSiteAncestor:true})],
    ['different identity',app=>app.setRows([{...cookie,path:'/different'}])],
    ['missing row',app=>app.setRows([])],
    ['ambiguous identity',app=>app.setRows([cookie,cookie])],
    ['changed baseline',app=>app.setRows([{...cookie,secure:true}])],
    ['explicit revocation while pending',app=>app.event('opendesk-cookie-grants-changed')],
    ['lost SDK access',app=>app.setPermission(false)],
  ])await t.test(scenario,async t=>{
    const app=mount();t.after(()=>app.dispose());await app.flush();
    app.view().onSelect(app.controller.snapshot().rows[0].id);await app.flush();
    const editor=mountEditor(app.editor().props);await editor.flush();
    editor.find('CookieAdvancedFields').onChange('httpOnly',true);await editor.flush();
    app.hold(async()=>({target:null,reasonCode:'E_DOCUMENT_UNRESOLVED'}));
    app.event('opendesk-page-changed');await app.flush();editor.dispose();
    assert.equal(app.editor(),null);
    app.hold(null);change(app);app.event('opendesk-page-changed');await app.flush();
    if(scenario==='same scope')assert.deepEqual(app.editor().props.restoredAttributes,{httpOnly:true});
    else{
      assert.equal(app.editor(),null);
      app.setPermission(true);app.setUrl('https://example.com/start');app.setStore('0');
      app.setPartition({topLevelSite:'https://example.com'});app.setRows([cookie]);
      app.event('opendesk-page-changed');await app.flush();
      assert.equal(app.editor(),null,'a rejected draft cannot reappear after returning to the original scope');
    }
  });
});

test('recovery keeps a parsed expiry but never caches text, invalid dates or approval',()=>{
  const initial={name:cookie.name,domain:cookie.domain,path:cookie.path,session:true,expiration:''};
  const expiration=localExpirationText(Math.floor(Date.now()/1000)+7*86400);
  const privateEdits={name:'typed name',domain:'typed domain',path:'/typed path',
    value:'typed value',confirmation:'confirmed',ref:123};
  const patch=cookieAttributePatch(initial,{...initial,...privateEdits,session:false,expiration});
  assert.deepEqual(patch,{session:false,expirationSeconds:parseLocalExpiration(expiration).seconds});
  assert.deepEqual(applyCookieAttributePatch(initial,patch),{...initial,session:false,expiration});
  assert.equal(cookieAttributePatch(initial,{...initial,...privateEdits,session:false,expiration:'private text'}),null);
});

test('document reload keeps search and filters, retires the old rows, and only offers recovery after the grace period',async t=>{
  const app=mount();t.after(()=>app.dispose());await app.flush();
  app.view().onQuery('sid');app.view().onToggleFilters();app.view().onFilter('session');
  app.view().onSelect(app.controller.snapshot().rows[0].id);await app.flush();
  app.hold(async()=>({target:null,reasonCode:'E_DOCUMENT_UNRESOLVED'}));
  app.invalidate('opendesk-page-changed');await app.flush();
  assert.equal(app.find('CookieSiteBar').site,'');
  assert.equal(app.find('CookieSiteBar').pageStatus,'正在确认当前网页…');
  assert.equal(app.view().query,'sid');
  assert.equal(app.view().expandedFilters,true);
  assert.equal(app.view().filter,'session');
  assert.deepEqual(app.view().rows,[]);
  assert.equal(app.view().busy,true);
  assert.equal(app.view().listRecovery,null);
  assert.equal(app.editor(),null);
  assert.equal(app.secrets[0].value,'');
  app.invalidate('opendesk-page-changed');await app.flush();
  app.elapse();await app.flush();
  assert.equal(app.view().listRecovery.props.reason,'E_DOCUMENT_UNRESOLVED');
  assert.equal(app.view().listRecovery.props.disabled,false);
  app.hold(null);app.invalidate('opendesk-page-changed');await app.flush();
  assert.equal(app.find('CookieSiteBar').site,'example.com');
  assert.equal(app.view().query,'sid');
  assert.equal(app.view().listRecovery,null);
  app.hold(async()=>({target:null,reasonCode:'E_DOCUMENT_UNRESOLVED'}));
  app.invalidate('opendesk-page-changed');await app.flush();
  app.view().onQuery('sid2');await app.flush();
  app.hold(null);app.setUrl('https://other.example/');app.invalidate('opendesk-page-changed');await app.flush();
  assert.equal(app.view().query,'');
  assert.equal(app.view().filter,'session');
});

test('editor retires delayed reads, value-only dirty flags and discard confirmation on every navigation revision',async t=>{
  let finish;const dirty=[];
  const editor=mountEditor({row:{...cookie,id:'sid'},target:parseTarget('https://example.com/start'),
    readValue:()=>new Promise(resolve=>{finish=resolve;}),onDirty:value=>dirty.push(value)});
  t.after(()=>editor.dispose());await editor.flush();
  editor.value.value='typed secret';editor.find('CookieValueField').onChange();await editor.flush();
  editor.all().find(n=>n.children.includes('取消')).props.onClick();await editor.flush();
  assert.equal(editor.all().some(n=>n.children.includes('放弃当前未保存修改？')),true);
  editor.update({navigationRevision:1,navigationPending:true,disabled:true});await editor.flush();
  finish('retired host answer');await editor.flush();assert.equal(editor.value.value,'');
  assert.equal(dirty.at(-1),false);assert.equal(editor.find('CookieValueField').showClear,false);
  assert.equal(editor.all().some(n=>n.children.includes('放弃当前未保存修改？')),false);
  editor.update({navigationRevision:2});await editor.flush();assert.equal(editor.value.value,'');
});


test('path events retire visible clear confirmation and an unfinished clear preflight',async t=>{
  for(const delayed of [false,true]){
    const app=mount();t.after(()=>app.dispose());await app.flush();let finish,executed=0;
    const plan={count:1,hostname:'example.com',excluded:0};
    app.controller.previewClear=()=>delayed?new Promise(resolve=>{finish=resolve;}):Promise.resolve(plan);
    app.controller.executeClear=async()=>{executed++;};
    app.view().onClear();await app.flush();
    const old=app.find('CookieClearDialog');
    if(!delayed)assert.ok(old);
    app.event();await app.flush();
    if(delayed){finish(plan);await app.flush();}
    else{old.onConfirm();await app.flush();}
    assert.equal(app.find('CookieClearDialog'),undefined);
    assert.equal(executed,0,'neither a stale confirmation nor preview may execute');
  }
});

test('confirmed clear reports verified counts once without depending on a Host toast, even after navigation',async t=>{
  for(const navigates of [false,true]){
    const notices=[];
    // If called, the Host would show the toast but never acknowledge it.
    const notify=Object.assign(options=>notices.push(options),{open:options=>{
      notices.push(options);return {ready:Promise.resolve({status:'unknown'})};
    }});
    const app=mount({notify});t.after(()=>app.dispose());await app.flush();
    const receipts=()=>app.rendered().filter(node=>node.props.className?.includes('cookie-clear-toast'));
    let complete,clears=0;
    app.setClearExecute(()=>{clears++;return new Promise(resolve=>{complete=resolve;});});
    app.view().onClear();await app.flush();
    assert.equal(app.find('CookieClearDialog').count,2);
    app.find('CookieClearDialog').onConfirm();await app.flush();
    assert.equal(clears,1);
    assert.deepEqual(notices,[],'nothing is announced before a verified receipt');
    assert.equal(receipts().length,0);
    app.setRows([]);
    if(navigates){
      app.setUrl('https://new.example/');app.event('opendesk-page-changed');await app.flush();
      assert.equal(app.controller.snapshot().settlingPrevious,true);
    }
    complete({preview:false,scope:'SITE_EXACT_HOST',matched:2,removed:2,remaining:0,excluded:1});
    await app.flush();
    assert.deepEqual(notices,[],'no competing Host toast, even when acknowledgments are unreliable');
    assert.equal(receipts().length,1);
    assert.equal(receipts()[0].props.role,'status');
    assert.equal(receipts()[0].children.filter(child=>typeof child==='string').join(''),
      '已清理 example.com 的 2 条 Cookie，本次清理范围剩余 0 条。 已保留 1 条超出本次清理范围的 Cookie。');
    assert.equal(app.controller.snapshot().previousReceipt,null);
    assert.equal(app.find('CookieClearDialog'),undefined);
    assert.equal(app.rendered().some(node=>node.children.includes('关闭回执')),false);
    assert.deepEqual(app.view().rows,[]);
    assert.equal(clears,1);
    app.elapse();await app.flush();
    assert.equal(receipts().length,0);
    assert.equal(clears,1);
  }
});

test('clear opens pending immediately, suppresses repeat clicks, and retires late replies after cancel',async t=>{
  const app=mount();t.after(()=>app.dispose());await app.flush();
  const requests=[];let executions=0;
  app.controller.previewClear=()=>new Promise(resolve=>requests.push(resolve));
  app.controller.executeClear=async()=>{executions++;};
  const trigger=app.view().onClear;
  trigger();trigger();await app.flush();
  const pending=app.find('CookieClearDialog');
  assert.equal(pending.hostname,'example.com');
  assert.equal(pending.busy,true);
  assert.equal(pending.count,null);
  assert.equal(requests.length,1);
  pending.onConfirm();pending.onCancel();await app.flush();
  assert.equal(app.find('CookieClearDialog'),undefined);
  app.view().onClear();await app.flush();
  requests[0]({count:5,hostname:'example.com'});await app.flush();
  assert.equal(app.find('CookieClearDialog').count,null);
  requests[1]({count:2,hostname:'example.com'});await app.flush();
  assert.equal(app.find('CookieClearDialog').count,2);
  assert.equal(executions,0);
});

test('clear scope change retires the old confirmation and retries only on demand',async t=>{
  const app=mount();t.after(()=>app.dispose());await app.flush();
  const requests=[];let executions=0;
  app.controller.previewClear=(shared=true)=>new Promise(resolve=>requests.push({shared,resolve}));
  app.controller.executeClear=async()=>{executions++;};
  app.view().onClear();await app.flush();
  requests[0].resolve({count:2});await app.flush();
  const old=app.find('CookieClearDialog');
  old.onScopeChange(false);old.onConfirm();await app.flush();
  assert.equal(app.find('CookieClearDialog').count,null);
  assert.equal(requests[1].shared,false);
  requests[1].resolve({problem:'清理预览超时。可以重试或取消。'});await app.flush();
  const failed=app.find('CookieClearDialog');
  assert.equal(failed.busy,false);
  assert.match(failed.problem,/超时/);
  assert.equal(requests.length,2);
  failed.onConfirm();failed.onRetry();await app.flush();
  assert.equal(requests[2].shared,false);
  requests[2].resolve({count:1});await app.flush();
  const ready=app.find('CookieClearDialog');
  assert.equal(ready.count,1);
  ready.onConfirm();ready.onConfirm();await app.flush();
  assert.equal(executions,1);
});

test('new editor keeps attributes but discards its unsaved sensitive value',async t=>{
  const saved=[],dirty=[];
  const editor=mountEditor({target:parseTarget('https://example.com/start'),
    onSave:(...args)=>saved.push(args),onDirty:value=>dirty.push(value)});
  t.after(()=>editor.dispose());await editor.flush();
  editor.findLabel('名称').onChange({target:{value:'draft-name'}});await editor.flush();
  editor.value.value='new secret';editor.find('CookieValueField').onChange();await editor.flush();
  editor.update({navigationRevision:1,navigationPending:true,disabled:true});await editor.flush();
  assert.equal(editor.findLabel('名称').value,'draft-name');assert.equal(editor.value.value,'');
  assert.equal(dirty.at(-1),true,'the attribute draft is still dirty');
  editor.update({navigationPending:false,disabled:false});await editor.flush();
  editor.all().find(n=>n.props.className?.includes('cookie-editor-save')).props.onClick();
  assert.equal(saved[0][0].value,'','no old sensitive draft is replayed');
});


test('a delayed write admission cannot replay a value after even a same-URL navigation',async t=>{
  const app=mount();t.after(()=>app.dispose());await app.flush();app.view().onNew();await app.flush();
  let admit,saves=0;
  app.setWriteBegin(()=>new Promise(resolve=>{admit=resolve;}));
  app.controller.save=async()=>{saves++;return true;};
  const pending=app.editor().props.onSave({...cookie,value:'retired secret'},{});await app.flush();
  app.event();await app.flush();
  admit({authorized:true,ref:12});await pending;await app.flush();
  assert.equal(saves,0);assert.deepEqual(app.calls.filter(Array.isArray),[['finishWrite',12]]);
});
