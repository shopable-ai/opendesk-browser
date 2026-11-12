import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transform, build } from 'esbuild';
import { runInNewContext } from 'node:vm';

const source = await readFile(new URL('../src/ui/ProxyEditor.tsx', import.meta.url), 'utf8');
// Execute the real submit handler without a browser or a second UI implementation.
const handler = source.slice(source.indexOf('  async function saveProxy('), source.indexOf('  // One form and reading order'));
assert.ok(handler.includes('async function saveProxy('));
const { code } = await transform(handler, { loader: 'tsx' });
const bundled = await build({ entryPoints: [new URL('../src/domain/proxy-entry.ts', import.meta.url).pathname], bundle: true, write: false, platform: 'node', format: 'esm' });
const { isValidProxyPort } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);

function fixture(overrides = {}) {
  const effects = [], errors = [];
  const environment={getDraftRevision:()=>0,setDraftDirty:()=>true};
  const context = {
    environment, busy:false, state:{}, endpoint:undefined,
    draftEtag:'opened', draftId:{current:''}, setSubmitting(){},
    saving:{current:false}, confirmationRequest:{current:null}, closed:{current:false},
    mounted:{current:true}, editorGeneration:{current:0},
    getEnvironment:()=>environment,
    editingId: '', proxy: { name: 'Draft', scheme: 'https', host: 'proxy.example.com', port: '443' },
    username: '', password: '', endpoints: [], locale: 'zh-CN',
    crypto: { randomUUID: () => { effects.push('uuid'); return 'new'; } },
    isValidProxyPort,
    setError: value => errors.push(value), setErrorKey: value => errors.push(value),
    act: async value => { effects.push(structuredClone(value)); return true; },
    closeEditor: saved => effects.push(['close', saved]),
    ...Object.fromEntries(['setEditingId', 'setProxy', 'setUsername', 'setPassword'].map(key => [key, value => effects.push([key, value])])),
    ...overrides
  };
  return { context, effects, errors, submit: async () => {
    const fn = runInNewContext(`${code}; saveProxy`, context);
    await fn({ preventDefault() {} });
  } };
}

test('authenticated add/edit reject before writes or draft resets in every locale', async () => {
  for (const locale of ['zh-CN', 'zh-TW', 'en']) {
    for (const scheme of ['http', 'https']) {
      for (const editingId of ['', 'existing']) {
        const f = fixture({ locale, editingId, username: 'draft-user', password: 'draft-password',
          proxy: { name: 'Keep name', scheme, host: 'keep.example.com', port: '8080' } });
        const before = structuredClone({ proxy: f.context.proxy, username: f.context.username, password: f.context.password, editingId });
        await f.submit();
        assert.deepEqual(f.effects, []);
        assert.equal(f.errors.length, 1);
        assert.match(f.errors[0], /未保存|未儲存|not saved/);
        assert.deepEqual({ proxy: f.context.proxy, username: f.context.username, password: f.context.password, editingId: f.context.editingId }, before);
      }
    }
  }
});

test('partial credentials and SOCKS authentication retain existing validation with no effects', async () => {
  for (const overrides of [{ username: 'user' }, { password: 'password' },
    ...['socks4', 'socks5'].map(scheme => ({ username: 'user', password: 'password', proxy: { scheme } }))]) {
    const f = fixture(overrides);
    await f.submit();
    assert.deepEqual(f.effects, []);
    assert.equal(f.errors.length, 1);
  }
});

test('editing an existing HTTP credential reference also rejects before changing the endpoint', async () => {
  const f = fixture({ editingId: 'existing', endpoints: [{ id: 'existing', credentialRef: 'session-existing' }] });
  await f.submit();
  assert.deepEqual(f.effects, []);
  assert.match(f.errors[0], /未保存/);
});

test('unauthenticated add/edit in all four protocols commit once and close after saving', async () => {
  for (const scheme of ['http', 'https', 'socks4', 'socks5']) {
    for (const editingId of ['', 'existing']) {
      const f = fixture({ editingId, endpoints: editingId ? [{ id: editingId }] : [] });
      f.context.proxy.scheme = scheme;
      await f.submit();
      assert.deepEqual(f.errors, []);

      const actions = f.effects.filter(item => item?.type);
      assert.deepEqual(actions.map(item => item.type), ['SAVE_ENDPOINT']);
      assert.equal(actions[0].createProfile,!editingId);
      assert.equal(actions[0].draftScope,'settings-proxy');
      assert.deepEqual(actions[0].endpoint, { id: editingId || 'new', name: 'Draft', scheme, host: 'proxy.example.com', port: 443, sourceId: 'manual' });
      assert.deepEqual(f.effects.at(-1), ['close', true]);
      assert.equal(f.effects.filter(item => Array.isArray(item) && item[0] === 'close').length, 1);
    }
  }
});

test('cancelled or failed endpoint writes keep the draft and do not save a profile', async () => {
  for (const failure of [null, new Error('Save failed')]) {
    const calls = [];
    const f = fixture({ act: async value => {
      calls.push(value.type);
      if (failure) throw failure;
      return false;
    } });
    await assert.doesNotReject(() => f.submit());
    assert.equal(f.errors.length,failure?1:0);
    if(failure)assert.match(f.errors[0],/Save failed/);
    assert.deepEqual(calls, ['SAVE_ENDPOINT']);
    assert.deepEqual(f.effects, ['uuid']);
  }
});

test('late save completion does not clear or close a newer draft', async () => {
  let revision = 3;
  const checked = [];
  const environment={getDraftRevision: () => revision, setDraftDirty: (dirty, scope, expected) => {
      checked.push([dirty, scope, expected]);
      return expected === revision;
    }};
  const f = fixture({
    environment, getEnvironment:()=>environment,
    act: async value => {
      await Promise.resolve();
      if (value.type === 'SAVE_ENDPOINT') revision++;
      return true;
    }
  });
  await f.submit();
  assert.deepEqual(checked, [[false, 'settings-proxy', 3]]);
  assert.equal(revision, 4);
  assert.equal(f.effects.some(item => Array.isArray(item)), false);
  assert.equal(f.effects.includes('close'), false);
});

// Render the real reusable component with a small hook/DOM scheduler. The
// existing project tests use the same approach without a browser dependency.
const componentCode=(await transform(source,{loader:'tsx',format:'cjs'})).code;
function editorFixture(endpoint,{loaded=true,openingEtag='opened',runtime,initialState}={}) {
  const values=[],refs=[],effects=[],calls=[],closes=[],focus=[],drafts=new Map();
  let cursor=0,refCursor=0,effectCursor=0,tree,revision=0,error='',result=true,confirmation=true,uuid=0;
  const body={},document={body,activeElement:null};
  const opener={isConnected:true,focus(){document.activeElement=this;focus.push('opener');}};
  document.activeElement=opener;
  const name={isConnected:true,focus(){document.activeElement=this;focus.push('name');}};
  const dialog={open:false,isConnected:true,showModal(){this.open=true;},close(){this.open=false;},
    contains:node=>node===name,querySelector:()=>name};
  const state=initialState??{configEtag:'opened',config:{endpoints:endpoint?[endpoint]:[]}};
  const env=runtime??{getDraftVersion:()=>revision,getDraftRevision:key=>drafts.get(key)??0,
    beginDraft(key,etag){calls.push({begin:key,etag});},isDraftDirty:key=>drafts.has(key),
    setDraftDirty(dirty,key,expected){
      if(dirty)drafts.set(key,++revision);
      else {if(expected!==undefined&&expected!==(drafts.get(key)??0))return false;drafts.delete(key);}
      return true;
    },
    confirm(text,{signal}){calls.push({confirm:text,signal});return typeof confirmation==='function'?confirmation(signal):Promise.resolve(confirmation);}
  };
  let currentEnvironment=env;
  const react={createElement:(type,props,...children)=>({type,props:{...props,children}}),
    useState(initial){const i=cursor++;if(!(i in values))values[i]=typeof initial==='function'?initial():initial;
      return [values[i],next=>{values[i]=typeof next==='function'?next(values[i]):next;}];},
    useRef(initial){return refs[refCursor++]??=( {current:initial} );},
    useEffect(fn,deps){const i=effectCursor++,old=effects[i];if(!old||deps.some((v,j)=>v!==old.deps[j]))effects[i]={fn,deps,pending:true,cleanup:old?.cleanup};}
  };
  const module={exports:{}};
  runInNewContext(componentCode,{module,exports:module.exports,AbortController,document,
    crypto:{randomUUID:()=>`new-${++uuid}`},require(id){
      if(id==='react')return react;
      if(id==='../environment')return {getEnvironment:()=>currentEnvironment};
      if(id==='../i18n/LocaleProvider')return {useI18n:()=>({t:key=>key,locale:'en'})};
      if(id==='../domain/proxy-entry')return {isValidProxyPort};
      if(id==='./useProxy')return {useProxy:()=>({state:loaded?state:null,busy:false,error,setError:value=>{error=value;},setErrorKey:value=>{error=value;},
        act:async message=>{calls.push(structuredClone(message));if(runtime){const reply=await runtime.request(message);if(!reply.ok){error=reply.errorCode;return null;}return reply;}return typeof result==='function'?result(message):result;}})};
      if(id==='@opendesk/ui')return {Button:({children,...props})=>react.createElement('button',props,...children)};
      if(id==='./FormField')return {FormField:({id,children})=>children[0]({id})};
      if(id==='./ProxyEntry')return {ClearableInput:({onValueChange,...props})=>react.createElement('input',{...props,onChange:e=>onValueChange(e.target.value)})};
      return {ProxyIcon:()=>null};
    }});
  function expand(element){
    if(Array.isArray(element))return element.map(expand);
    if(!element||typeof element!=='object')return element;
    if(typeof element.type==='function')return expand(element.type(element.props));
    if(element.props.ref)element.props.ref.current=dialog;
    return {...element,children:expand(element.props.children)};
  }
  function render(){cursor=refCursor=effectCursor=0;tree=expand(module.exports.ProxyEditor({endpoint,openingEtag,onClose:saved=>closes.push(saved)}));
    for(const effect of effects)if(effect.pending){effect.cleanup?.();effect.pending=false;effect.cleanup=effect.fn();}
  }
  function all(predicate,node=tree){
    if(Array.isArray(node))return node.flatMap(child=>all(predicate,child));
    if(!node||typeof node!=='object')return [];
    return [...(predicate(node)?[node]:[]),...all(predicate,node.children)];
  }
  const flush=async()=>{await new Promise(setImmediate);render();};
  render();
  return {calls,closes,focus,env,state,dialog,all,render,flush,
    setResult:value=>{result=value;},setConfirm:value=>{confirmation=value;},
    setOpeningEtag:value=>{openingEtag=value;},get generatedIds(){return uuid;},
    change(id,value){const input=all(n=>n.props.id===id)[0];if(input.props.disabled)return false;env.setDraftDirty(true,'settings-proxy');input.props.onChange({target:{value}});render();return true;},
    submit(){all(n=>n.type==='form')[0].props.onSubmit({preventDefault(){}});},
    cancel(){tree.props.onCancel({preventDefault(){}});},
    nativeClose(){dialog.open=false;tree.props.onClose({currentTarget:dialog});},
    destroy(){for(const ref of refs)if(ref?.current===dialog)ref.current=null;for(const effect of effects)effect.cleanup?.();},
    replaceEnvironment(){currentEnvironment={...env};}
  };
}

test('shared three-row editor preserves R5 fields, locks duplicate saves and closes exactly once',async()=>{
  const f=editorFixture();
  assert.deepEqual(f.all(n=>n.type==='input'||n.type==='select').map(n=>n.props.id),
    ['ep-name','ep-scheme','ep-host','ep-port','ep-username','ep-password']);
  assert.deepEqual(f.focus,['name']);
  f.change('ep-name','New');f.change('ep-host','proxy.example');f.change('ep-port','443');
  let complete;f.setResult(()=>new Promise(resolve=>complete=resolve));
  f.submit();f.submit();
  assert.deepEqual(f.calls.filter(c=>c.type).map(c=>c.type),['SAVE_ENDPOINT']);
  f.cancel();assert.deepEqual(f.closes,[]);
  complete(true);await f.flush();
  assert.deepEqual(f.closes,[true]);assert.equal(f.env.isDraftDirty('settings-proxy'),false);
  f.nativeClose();f.submit();await f.flush();assert.deepEqual(f.closes,[true]);
  f.destroy();assert.equal(f.focus.at(-1),'opener');
});

test('R5 credentials survive protocol changes, refused saves and background refresh',async()=>{
  const endpoint={id:'existing',name:'Original',scheme:'https',host:'saved.example',port:443,credentialRef:'session-ref'};
  const f=editorFixture(endpoint);
  assert.equal(f.all(n=>n.props.id==='ep-password')[0].props.value,'');
  f.change('ep-username','keep-user');f.change('ep-password','keep-password');f.change('ep-scheme','socks5');
  f.submit();await f.flush();
  assert.equal(f.all(n=>n.props.id==='ep-password')[0].props.value,'keep-password');
  assert.equal(f.calls.some(c=>c.type),false);assert.deepEqual(f.closes,[]);
  f.change('ep-username','');f.change('ep-password','');
  f.state.config.endpoints=[];f.state.configEtag='refreshed';f.render();
  f.submit();await f.flush();
  assert.equal(f.calls.some(c=>c.type),false,'original credentialRef still blocks saving after a refresh');
  assert.equal(f.env.isDraftDirty('settings-proxy'),true);assert.deepEqual(f.closes,[]);
  f.destroy();
});

test('native close and Escape keep drafts on cancel or rejected confirmation; accept closes once',async()=>{
  for(const rejected of [false,true]){
    const f=editorFixture();f.change('ep-host','draft.example');f.env.setDraftDirty(true,'sibling');
    let answer;
    f.setConfirm(()=>new Promise((resolve,reject)=>{answer=()=>rejected?reject(Error('UI rejected')):resolve(false);}));
    f.nativeClose();assert.equal(f.dialog.open,false,'confirmation suspends the native modal');
    f.cancel();assert.equal(f.calls.filter(c=>c.confirm).length,1);
    answer();await f.flush();
    assert.equal(f.dialog.open,true);assert.deepEqual(f.closes,[]);assert.equal(f.env.isDraftDirty('settings-proxy'),true);
    f.setConfirm(true);f.cancel();await f.flush();
    assert.deepEqual(f.closes,[false]);assert.equal(f.env.isDraftDirty('sibling'),true);
    f.nativeClose();await f.flush();assert.deepEqual(f.closes,[false]);f.destroy();
  }
});

test('late save or discard cannot clear newer input, a new generation or replacement environment',async()=>{
  for(const operation of ['save','cancel'])for(const boundary of ['revision','unmount','environment','etag']){
    const f=editorFixture();f.change('ep-host','first.example');f.change('ep-port','443');
    let complete;
    if(operation==='save'){f.setResult(()=>new Promise(resolve=>complete=resolve));f.submit();}
    else {f.setConfirm(()=>new Promise(resolve=>complete=resolve));f.cancel();}
    if(boundary==='unmount'){f.destroy();f.env.setDraftDirty(true,'settings-proxy');}
    else if(boundary==='environment')f.replaceEnvironment();
    else if(boundary==='etag'){f.state.configEtag='newer';f.render();}
    else if(operation==='save')f.env.setDraftDirty(true,'settings-proxy');
    else f.change('ep-host','newer.example');
    complete(true);await f.flush();
    // A save legitimately changes ETag; only discard confirmation requires it unchanged.
    if(boundary==='etag'&&operation==='save')assert.deepEqual(f.closes,[true]);
    else {assert.deepEqual(f.closes,[]);assert.equal(f.env.isDraftDirty('settings-proxy'),true);}
    if(boundary!=='unmount')f.destroy();
  }
});


test('shared editor remains visible and cancellable while its independent state read is unavailable',async()=>{
  const f=editorFixture(undefined,{loaded:false});
  assert.equal(f.dialog.open,true);
  assert.equal(f.all(n=>n.type==='button'&&n.props.type==='submit')[0].props.disabled,true);
  f.submit();await f.flush();assert.equal(f.calls.some(c=>c.type),false);
  f.cancel();await f.flush();assert.deepEqual(f.closes,[false]);f.destroy();
});

// Use the actual environment/service/CAS rather than a beginDraft call recorder.
const environmentBuild=await build({entryPoints:[new URL('../src/environment.ts',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm'});
const {configureEnvironment}=await import('data:text/javascript;base64,'+Buffer.from(environmentBuild.outputFiles[0].text).toString('base64'));
function storageFixture(endpoint) {
  let stored={schemaVersion:2,managed:false,sources:[{id:'manual',kind:'manual',displayName:'Manual',trustedByUser:true}],
    endpoints:endpoint?[structuredClone(endpoint)]:[],
    profiles:endpoint?[{id:'profile-'+endpoint.id,kind:'endpoint',name:endpoint.name,endpointId:endpoint.id,sourceId:'manual'}]:[],
    rules:[],defaultTarget:{action:'direct'},selection:{mode:'system'}},version=0,pause;
  const writes=[];
  const env=configureEnvironment(null,null,{trusted:true,preview:{service:{
    load:async()=>({config:structuredClone(stored),etag:'etag-'+version}),
    save:async(config,etag)=>{
      assert.equal(etag,'etag-'+version,'CAS write must use the current version');
      if(pause){const pending=pause;pause=null;await pending;}
      writes.push(structuredClone(config));stored=structuredClone(config);return 'etag-'+(++version);
    },
    status:async()=>({state:'disabled',canStop:false,control:'controllable_by_this_extension',reason:null})
  }}});
  return {env,writes,current:()=>structuredClone(stored),read:()=>env.request({type:'GET_STATE'}),
    replaceHost(host){stored.endpoints[0].host=host;version++;},
    pauseNextSave(){let finish;pause=new Promise(resolve=>finish=resolve);return ()=>finish();}
  };
}
async function settingsOpening(endpoint,state) {
  const settings=await readFile(new URL('../src/Settings.tsx',import.meta.url),'utf8');
  const start=settings.indexOf('  function openEditor('),end=settings.indexOf('  useEffect(',start);
  const code=(await transform(settings.slice(start,end),{loader:'tsx'})).code;
  const props={},context={state,editorOpen:false,editorGeneration:{current:0},editorOriginHash:{current:null},
    navigation:{getRoute:()=>'#/profiles'},setProxyNotice(){},setEditorOpen(){},
    setEditingEndpoint:value=>{props.endpoint=value;},setProxyOpeningEtag:value=>{props.openingEtag=value;}};
  runInNewContext(code+';openEditor',context)(endpoint);
  return {props,context};
}

test('Settings pairs the original endpoint and opening ETag; refreshed environment rejects stale edits without a write',async()=>{
  const endpoint={id:'a',name:'Original',scheme:'https',host:'old.example',port:443,sourceId:'manual'};
  for(const stale of [false,true]){
    const storage=storageFixture(endpoint);
    let f;
    try{
      const opened=await storage.read();
      const {props,context}=await settingsOpening(endpoint,opened.state);
      if(stale)storage.replaceHost('newer.example');
      const refreshed=await storage.read();context.state=refreshed.state;
      f=editorFixture(props.endpoint,{openingEtag:props.openingEtag,runtime:storage.env,initialState:refreshed.state});
      // Neither the hook's read nor a changed caller prop can rebase old input.
      f.setOpeningEtag(refreshed.state.configEtag);f.render();
      f.change('ep-name','My rename');f.submit();await f.flush();
      assert.deepEqual(f.calls.filter(c=>c.type).map(c=>c.type),['SAVE_ENDPOINT']);
      if(stale){
        assert.equal(storage.writes.length,0);assert.equal(storage.current().endpoints[0].host,'newer.example');
        assert.ok(f.all(n=>n.props.role==='alert').some(n=>n.children.includes('E_CONFLICT')));
        assert.deepEqual(f.closes,[]);assert.equal(storage.env.isDraftDirty('settings-proxy'),true);
      }else{
        assert.equal(storage.writes.length,1);assert.equal(storage.current().endpoints[0].name,'My rename');
        assert.equal(storage.current().endpoints[0].host,'old.example');assert.deepEqual(f.closes,[true]);
      }
    }finally{f?.destroy();storage.env.dispose();}
  }
});

test('pending save disables every real input and repeated submissions store one endpoint and profile',async()=>{
  const storage=storageFixture();let f;
  try{
    const opened=await storage.read();
    f=editorFixture(undefined,{openingEtag:opened.state.configEtag,runtime:storage.env,initialState:opened.state});
    f.change('ep-host','first.example');f.change('ep-port','443');
    const revision=storage.env.getDraftRevision('settings-proxy'),finish=storage.pauseNextSave();
    f.submit();f.submit();await f.flush();
    const controls=f.all(n=>n.type==='input'||n.type==='select');
    assert.equal(controls.length,6);assert.ok(controls.every(n=>n.props.disabled===true));
    for(const [id,value] of [['ep-host','second.example'],['ep-name','Second'],['ep-scheme','socks5'],['ep-port','7890'],['ep-username','user'],['ep-password','password']])
      assert.equal(f.change(id,value),false,'disabled '+id+' cannot receive user input');
    assert.equal(storage.env.getDraftRevision('settings-proxy'),revision);
    finish();await f.flush();f.submit();await f.flush();
    assert.equal(storage.writes.length,1);assert.equal(f.generatedIds,1);
    assert.equal(storage.current().endpoints.length,1);assert.equal(storage.current().profiles.length,1);
    assert.equal(storage.current().endpoints[0].host,'first.example');
    assert.deepEqual(f.calls.filter(c=>c.type).map(c=>c.type),['SAVE_ENDPOINT']);
    assert.deepEqual(f.closes,[true]);
  }finally{f?.destroy();storage.env.dispose();}
});

test('external revision during a successful add cannot make its retry create another endpoint or profile',async()=>{
  const storage=storageFixture();let f;
  try{
    const opened=await storage.read();
    f=editorFixture(undefined,{openingEtag:opened.state.configEtag,runtime:storage.env,initialState:opened.state});
    f.change('ep-host','first.example');f.change('ep-port','443');
    const finish=storage.pauseNextSave();f.submit();await f.flush();
    storage.env.setDraftDirty(true,'settings-proxy');storage.env.setDraftDirty(true,'sibling');
    finish();await f.flush();assert.deepEqual(f.closes,[]);
    assert.equal(f.change('ep-host','second.example'),true);f.submit();await f.flush();
    assert.equal(storage.writes.length,2);assert.equal(f.generatedIds,1);
    assert.equal(storage.current().endpoints.length,1);assert.equal(storage.current().profiles.length,1);
    assert.equal(storage.current().endpoints[0].host,'second.example');
    const actions=f.calls.filter(c=>c.type);
    assert.deepEqual(actions.map(c=>c.type),['SAVE_ENDPOINT','SAVE_ENDPOINT']);
    assert.deepEqual(actions.map(c=>c.endpoint.id),['new-1','new-1']);
    assert.equal(storage.env.isDraftDirty('sibling'),true);assert.deepEqual(f.closes,[true]);
  }finally{f?.destroy();storage.env.dispose();}
});
