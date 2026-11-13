import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
import {createCookieController} from '../app/controller/cookie-controller.js';
import {parseTarget} from '../app/domain/cookie-model.js';
import {localExpirationText,parseLocalExpiration} from '../app/domain/cookie-expiration.js';

const appSource=readFileSync(new URL('../app/CookieEditorApp.jsx',import.meta.url),'utf8');
const editorSource=readFileSync(new URL('../app/components/CookieInlineEditor.jsx',import.meta.url),'utf8');
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
function mount(){
  const rt=runtime(),events=new Map(),secrets=[{value:'pasted secret'}],outputs=[{textContent:'secret',hidden:false}];
  let controller,url='https://example.com/start',permission=true,resolveTarget=null,tree;
  const calls=[];
  const adapter={targetFor:()=>resolveTarget?resolveTarget():Promise.resolve({target:parseTarget(url),reasonCode:null}),
    checkRead:async()=>({callableNow:permission}),list:async()=>[cookie],
    getStore:async()=>({storeId:'0'}),
    getPartition:async()=>({partitionKey:{topLevelSite:'https://example.com'}}),
    readValue:async()=>{calls.push('read');return 'live secret';},
    beginImportIntent:async()=>({authorized:true,ref:9}),finishImportIntent:async ref=>calls.push(['finishImport',ref]),
    beginWriteIntent:async()=>{calls.push('write');return {authorized:false};},
    finishWriteIntent:async ref=>calls.push(['finishWrite',ref])};
  const window={setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},addEventListener(){},removeEventListener(){}};
  const document={visibilityState:'visible',addEventListener(){},removeEventListener(){}};
  const hostRoot={isConnected:true,querySelectorAll:selector=>selector.includes('input')?secrets:outputs,
    querySelector:()=>null,addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name)};
  const Component=compile(appSource,rt.React,{window,document,createCookieSdkAdapter:()=>adapter,
    createCookieController:options=>(controller=createCookieController({...options,navigationIntervalMs:0}))});
  function render(){rt.render(Component,{hostRoot,request(){}});tree=rt.tree;}
  async function flush(){for(let i=0;i<45;i++){if(rt.changed)render();await Promise.resolve();}}
  render();
  const find=type=>nodes(tree).find(n=>n.type===type)?.props;
  return {flush,calls,secrets,outputs,find,get controller(){return controller;},
    view:()=>find('CookieEditorView'),
    editor:()=>{const view=find('CookieEditorView');return view.selected==='new'?view.newEditor:
      view.selected?view.editor(controller.getRow(view.selected)):null;},
    event(name='opendesk-cookie-path-changed'){events.get(name)();},
    invalidate(name){events.get(name)();},
    setWriteBegin:fn=>{adapter.beginWriteIntent=fn;},
    setUrl:value=>{url=value;},setPermission:value=>{permission=value;},hold:fn=>{resolveTarget=fn;},
    dispose(){rt.dispose();}};
}
function mountEditor(props){
  const rt=runtime(),value={value:'',focus(){}},name={focus(){}};
  const timers=new Map();let nextTimer=0;
  const Component=compile(editorSource,rt.React,{localExpirationText,parseLocalExpiration,
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
  editor.find('CookieAdvancedFields').onChange('path','/attribute-draft');await editor.flush();await app.flush();
  editor.value.value='unsaved secret';editor.find('CookieValueField').onChange();await editor.flush();
  const oldRevision=app.editor().props.navigationRevision;
  let release;app.hold(()=>new Promise(resolve=>{release=resolve;}));app.setUrl('https://example.com/next');
  app.event();assert.equal(app.secrets[0].value,'');assert.equal(app.outputs[0].textContent,'');
  await app.flush();assert.equal(app.controller.snapshot().navigationPending,true);
  editor.update(app.editor().props);await editor.flush();
  assert.equal(editor.value.value,'');
  assert.equal(editor.find('CookieValueField').showClear,false);
  assert.equal(editor.all().some(n=>n.props.label==='恢复原值'),false,'old originalValueRef is unavailable');
  editor.value.value='new draft';editor.find('CookieValueField').onChange();await editor.flush();
  assert.equal(editor.all().some(n=>n.props.label==='恢复原值'),false,'original ref cannot restore the previous secret');
  assert.equal(editor.find('CookieAdvancedFields').draft.path,'/attribute-draft');
  assert.equal(app.calls.filter(x=>x==='read').length,1,'no value read during verification');
  await app.editor().props.onSave({name:'sid'},{});
  assert.equal(app.calls.includes('write'),false,'direct callback also refuses a pending navigation');
  assert.equal(app.editor().props.navigationRevision,oldRevision+1);
  const view=app.view();assert.equal(view.query,'sid');assert.equal(view.filter,'session');
  assert.equal(view.sort,'name');assert.equal(view.page,3);assert.equal(view.expandedFilters,true);
  app.hold(null);release({target:parseTarget('https://example.com/next'),reasonCode:null});await app.flush();
  editor.update(app.editor().props);await editor.flush();
  assert.equal(editor.value.value,'live secret','fresh authorized read after verified navigation');
  assert.equal(editor.find('CookieAdvancedFields').draft.path,'/attribute-draft');
  app.event();await app.flush();editor.update(app.editor().props);await editor.flush();
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

test('pending page notification immediately scrubs sensitive DOM and fences an existing editor',async t=>{
  const app=mount();t.after(()=>app.dispose());await app.flush();
  app.view().onSelect(app.controller.snapshot().rows[0].id);await app.flush();
  let release;app.hold(()=>new Promise(resolve=>{release=resolve;}));
  app.event('opendesk-cookie-page-pending');
  assert.equal(app.secrets[0].value,'');assert.equal(app.outputs[0].textContent,'');
  await app.flush();
  assert.equal(app.controller.snapshot().rows.length,1);
  assert.equal(app.controller.snapshot().navigationPending,true);
  await app.editor().props.onSave({name:'sid'},{});
  assert.equal(app.calls.includes('write'),false);
  app.hold(null);release({target:parseTarget('https://example.com/start')});await app.flush();
  assert.equal(app.controller.snapshot().navigationPending,false);
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
