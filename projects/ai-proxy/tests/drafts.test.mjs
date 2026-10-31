import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const result = await build({entryPoints:[new URL('../src/environment.ts',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm'});
const {configureEnvironment}=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
const domainBuild=await build({entryPoints:[new URL('../src/domain/config.ts',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm'});
const {normalizeRuleSiteInput,priorityForSiteQuickRule}=await import(`data:text/javascript;base64,${Buffer.from(domainBuild.outputFiles[0].text).toString('base64')}`);
function fixture(){
 const states=[];
 const env=configureEnvironment({setState:s=>states.push(s)},null,{trusted:true,preview:{service:{
  async load(){return {etag:'initial',config:{managed:false,schemaVersion:2,selection:{mode:'system'},endpoints:[],profiles:[],rules:[],sources:[],defaultTarget:{action:'direct'}}};},async save(){return 'saved';},async status(){return {};}
 }}});
 return {env,states};
}
test('saving or cancelling one form preserves another draft and host dirty state',()=>{
 const {env,states}=fixture();
 try{
  env.setDraftDirty(true,'pac');env.setDraftDirty(true,'proxy');
  env.setDraftDirty(false,'proxy');
  assert.equal(states.at(-1).dirty,true);
  env.setDraftDirty(false,'pac');
  assert.equal(states.at(-1).dirty,false);
 }finally{env.dispose();}
});
test('late save acknowledgement cannot clear newer edits in the same form',()=>{
 const {env,states}=fixture();
 try{
  env.setDraftDirty(true,'rule');const revision=env.getDraftRevision('rule');
  env.setDraftDirty(true,'rule');env.setDraftDirty(false,'rule',revision);
  assert.equal(states.at(-1).dirty,true);
  env.setDraftDirty(false,'rule',env.getDraftRevision('rule'));
  assert.equal(states.at(-1).dirty,false);
 }finally{env.dispose();}
});
test('successful unrelated mutations do not broadcast saved or remove a draft',async()=>{
 const {env,states}=fixture();let saved=0;
 try{
  env.events.addEventListener('ai-proxy-saved',()=>saved++);
  env.setDraftDirty(true,'pac');
  const response=await env.request({type:'SELECT',selection:{mode:'direct'}});
  assert.equal(response.ok,true);
  assert.equal(saved,0);
  assert.equal(states.at(-1).dirty,true);
 }finally{env.dispose();}
});

// Invoke real component event handlers with a minimal React hook scheduler.
// The project has no DOM test dependency; no product service or browser is started.
const {readFile}=await import('node:fs/promises');
const {transform}=await import('esbuild');
const {runInNewContext}=await import('node:vm');
const react={createElement:(type,props,...children)=>({type,props:{...props,children}}),
 useRef:()=>({current:null}),useState:value=>[value,()=>{}],useEffect:()=>{}};
async function loadUI(file,env,extra={}){
 const source=await readFile(new URL(file,import.meta.url),'utf8');
 const {code}=await transform(source,{loader:'tsx',format:'cjs'});
 const module={exports:{}};
 runInNewContext(code,{React:react,module,exports:module.exports,require(name){
  if(name==='react')return react;
  if(name.endsWith('environment'))return {getEnvironment:()=>env};
  if(name.endsWith('LocaleProvider'))return {useI18n:()=>({t:key=>key})};
  if(name.endsWith('proxy-entry'))return {portPresetsForScheme:()=>['7890'],LOCAL_CLIENT_PRESETS:[{scheme:'http',port:'7890'}]};
  if(name in extra)return extra[name];
  return {Button:'button'};
 }});
 return module.exports;
}
function scopedTarget(scope){const form={getAttribute:()=>scope};return {isConnected:true,closest:selector=>selector==='[data-draft-scope]'?form:null,focus(){}};}
test('ClearableInput clear marks its actual form, preserves another draft and clears only the input',async()=>{
 const {env,states}=fixture();
 try{
  const {ClearableInput}=await loadUI('../src/ui/ProxyEntry.tsx',env);const values=[];
  const tree=ClearableInput({value:'proxy.example.com',onValueChange:v=>values.push(v),fieldLabel:'host'});
  tree.props.children[0].props.ref.current=scopedTarget('proxy');
  env.setDraftDirty(true,'pac');
  tree.props.children.at(-1).props.onClick();
  assert.deepEqual(values,['']);
  env.setDraftDirty(false,'pac');
  assert.equal(states.at(-1).dirty,true);
 }finally{env.dispose();}
});
test('host, port and local quick picks mark their owning form without a change event',async()=>{
 const {env,states}=fixture();
 try{
  const ui=await loadUI('../src/ui/ProxyEntry.tsx',env);const chosen=[];
  for(const [name,props] of [['HostQuickPick',{value:''}],['PortQuickPick',{scheme:'http',value:''}],['LocalClientQuickPreset',{scheme:'http',value:''}]]){
   const tree=ui[name]({...props,onChoose:(...values)=>chosen.push(values)});
   await tree.props.children[0][0].props.onClick({currentTarget:scopedTarget(name)});
   assert.equal(env.isDraftDirty(name),true);
   env.setDraftDirty(false,name);
  }
  assert.deepEqual(chosen,[['127.0.0.1'],['7890'],['http','7890']]);
  assert.equal(states.at(-1).dirty,false);
 }finally{env.dispose();}
});
test('host confirmation arriving after a successful save cannot reopen a hidden proxy draft',async()=>{
 for(const dirty of [false,true]){
  const {env}=fixture();const values=[];let accept,saveDone;const dialog={open:true};
  try{
   if(dirty)env.setDraftDirty(true,'settings-proxy');
   env.setConfirmHandler(()=>new Promise(resolve=>accept=resolve));
   const target=scopedTarget('settings-proxy'),closest=target.closest;
   target.closest=selector=>selector==='dialog'?dialog:closest(selector);
   const {HostQuickPick}=await loadUI('../src/ui/ProxyEntry.tsx',env);
   const tree=HostQuickPick({value:'proxy.example.com',onChoose:value=>values.push(value)});
   const save=await handler('../src/Settings.tsx','  async function saveProxy(','  async function editPac(',{
    getEnvironment:()=>env,editingId:'a',endpoints:[{id:'a'}],locale:'en',username:'',password:'',
    proxy:{name:'A',scheme:'https',host:'proxy.example.com',port:'443'},isValidProxyPort:()=>true,
    act:()=>new Promise(resolve=>saveDone=resolve),closeEditor:()=>{dialog.open=false;}
   });
   const saving=save({preventDefault(){},nativeEvent:{}});
   const choosing=tree.props.children[0][0].props.onClick({currentTarget:target});
   saveDone(true);await saving;accept(true);await choosing;
   assert.deepEqual(values,[]);assert.equal(env.isDraftDirty('settings-proxy'),false);
  }finally{env.dispose();}
 }
 const {env}=fixture();const values=[];
 try{
  env.setConfirmHandler(async()=>true);
  const target=scopedTarget('settings-proxy'),closest=target.closest;
  target.closest=selector=>selector==='dialog'?{open:true}:closest(selector);
  const {HostQuickPick}=await loadUI('../src/ui/ProxyEntry.tsx',env);
  const tree=HostQuickPick({value:'proxy.example.com',onChoose:value=>values.push(value)});
  await tree.props.children[0][0].props.onClick({currentTarget:target});
  assert.deepEqual(values,['127.0.0.1']);assert.equal(env.isDraftDirty('settings-proxy'),true);
 }finally{env.dispose();}
});
async function handler(file,start,end,context){
 const source=await readFile(new URL(file,import.meta.url),'utf8');
 const slice=source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
 assert.ok(slice.startsWith(start));
 const {code}=await transform(slice,{loader:'tsx'});
 return runInNewContext(`${code}; ${/function (\w+)/.exec(start)[1]}`,context);
}
// Rules now use a separate list/editor; settings-rules-runtime covers its
// Cancel/late-confirmation behavior through the rendered component.
test('PAC replacement respects Cancel, confirmed discard and newer/sibling draft revisions',async()=>{
 for(const [scope,name,end,item] of [
  ['settings-pac','editPac','savePac',{id:'pac-b',kind:'pac-inline',name:'Saved B',pacText:'function FindProxyForURL(){return "DIRECT";}'}]
 ]){
  const {env}=fixture();const writes=[];
  try{
   env.setDraftDirty(true,scope);env.setDraftDirty(true,'rotation');
   const edit=await handler('../src/Settings.tsx',`  async function ${name}(`,`  async function ${end}(`,{
    setRuleSaved(){},getEnvironment:()=>env,t:key=>key,requestAnimationFrame:fn=>fn(),document:{getElementById:()=>({focus(){}})},
    ...Object.fromEntries(['setEditingRuleId','setRuleError','setRule','setEditingPacId','setPacName','setPacText'].map(key=>[key,value=>writes.push([key,value])]))
   });
   env.setConfirmHandler(async()=>false);
   await edit(item);assert.deepEqual(writes,[]);assert.equal(env.isDraftDirty(scope),true);
   env.setConfirmHandler(async()=>true);
   await edit(item);assert.ok(writes.length>0);assert.equal(env.isDraftDirty(scope),false);assert.equal(env.isDraftDirty('rotation'),true);
   assert.equal(writes[0][1],item.id);
   writes.length=0;env.setDraftDirty(true,scope);
   env.setConfirmHandler(async()=>{env.setDraftDirty(true,scope);return true;});
   await edit(item);assert.deepEqual(writes,[]);assert.equal(env.isDraftDirty(scope),true);assert.equal(env.isDraftDirty('rotation'),true);
  }finally{env.dispose();}
 }
});
test('implicit proxy close preserves a declined or newer draft and clears no sibling scope',async()=>{
 const {env}=fixture();let closes=0;
 try{
  env.setDraftDirty(true,'settings-proxy');env.setDraftDirty(true,'settings-pac');
  const close=await handler('../src/Settings.tsx','  async function requestCloseEditor(','  function openEditor(',{
   getEnvironment:()=>env,t:key=>key,closeEditor:()=>closes++
  });
  env.setConfirmHandler(async()=>false);
  await close();assert.equal(closes,0);assert.equal(env.isDraftDirty('settings-proxy'),true);
  env.setConfirmHandler(async()=>{env.setDraftDirty(true,'settings-proxy');return true;});
  await close();assert.equal(closes,0);assert.equal(env.isDraftDirty('settings-proxy'),true);
  env.setConfirmHandler(async()=>true);
  await close();assert.equal(closes,1);assert.equal(env.isDraftDirty('settings-proxy'),false);assert.equal(env.isDraftDirty('settings-pac'),true);
 }finally{env.dispose();}
});
test('PAC starter confirmation cannot overwrite a newer script revision',async()=>{
 const {env}=fixture();const writes=[];
 try{
  env.setDraftDirty(true,'settings-pac');
  env.setConfirmHandler(async()=>{env.setDraftDirty(true,'settings-pac');return true;});
  const insert=await handler('../src/Settings.tsx','  async function insertPacStarter(','  async function applyRoute(',{
   getEnvironment:()=>env,t:key=>key,endpoints:[{id:'a',name:'A'}],pacStarterEndpoint:'a',pacStarterMode:'all',pacStarterSite:'',pacText:'old',pacName:'',
   createPacStarter:()=> 'generated script',setPacText:v=>writes.push(v),setPacName:v=>writes.push(v),setPacStarterError:v=>writes.push(v)
  });
  await insert();assert.deepEqual(writes,[]);assert.equal(env.isDraftDirty('settings-pac'),true);
  env.setConfirmHandler(async()=>false);
  await insert();assert.deepEqual(writes,[]);
  env.setConfirmHandler(async()=>true);
  await insert();assert.equal(writes[0],'generated script');assert.equal(env.isDraftDirty('settings-pac'),true);
 }finally{env.dispose();}
});
test('late deletion of an edited rule preserves newer input instead of resetting the form',async()=>{
 const {env}=fixture();const writes=[];
 try{
  env.setConfirmHandler(async()=>true);env.setDraftDirty(true,'settings-rule');
  const remove=await handler('../src/Settings.tsx','  async function removeRule(','  async function loadBackupFile(',{
   getEnvironment:()=>env,t:key=>key,editingRuleId:'a',config:{endpoints:[]},
   act:async()=>{env.setDraftDirty(true,'settings-rule');return true;},
   setEditingRuleId:v=>writes.push(v),setRuleError:v=>writes.push(v),setRule:v=>writes.push(v)
  });
  await remove({id:'a',domain:'example.com'});assert.deepEqual(writes,[]);assert.equal(env.isDraftDirty('settings-rule'),true);
  const normal=await handler('../src/Settings.tsx','  async function removeRule(','  async function loadBackupFile(',{
   getEnvironment:()=>env,t:key=>key,editingRuleId:'a',config:{endpoints:[]},act:async()=>true,
   setEditingRuleId:v=>writes.push(v),setRuleError:v=>writes.push(v),setRule:v=>writes.push(v)
  });
  await normal({id:'a',domain:'example.com'});assert.equal(writes[0],'');assert.equal(env.isDraftDirty('settings-rule'),false);
 }finally{env.dispose();}
});
test('invalid backup files and late valid reads preserve the existing backup draft',async()=>{
 const bundled=await build({entryPoints:[new URL('../src/ui/backupImport.ts',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm'});
 const validation=await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
 for(const file of [{size:validation.BACKUP_MAX_BYTES+1},{size:3,text:async()=>'{bad'},
  {size:1,text:async()=>{throw Error('cannot read');}}]){
  const {env}=fixture();const writes=[],errors=[];
  try{
   env.setDraftDirty(true,'settings-backup');
   const load=await handler('../src/Settings.tsx','  async function loadBackupFile(','  async function importBackup(',{
    ...validation,getEnvironment:()=>env,backup:'existing draft',backupReadGeneration:{current:0},t:key=>key,
    setBackup:v=>writes.push(v),setBackupImported(){},setError(){},setErrorKey:v=>errors.push(v)
   });
   await load(file);assert.deepEqual(writes,[]);assert.equal(errors.length,1);assert.equal(env.isDraftDirty('settings-backup'),true);
  }finally{env.dispose();}
 }
 const {env}=fixture();const writes=[];let complete;
 try{
  env.setDraftDirty(true,'settings-backup');env.setConfirmHandler(async()=>true);
  const load=await handler('../src/Settings.tsx','  async function loadBackupFile(','  async function importBackup(',{
   ...validation,getEnvironment:()=>env,backup:'existing draft',backupReadGeneration:{current:0},t:key=>key,
   setBackup:v=>writes.push(v),setBackupImported(){},setError(){},setErrorKey(){}
  });
  const pending=load({size:200,text:()=>new Promise(resolve=>complete=resolve)});
  env.setDraftDirty(true,'settings-backup');
  complete(JSON.stringify({schemaVersion:2,sources:[],endpoints:[],profiles:[],rules:[],defaultTarget:{action:'direct'},selection:{mode:'system'},managed:false}));
  await pending;assert.deepEqual(writes,[]);assert.equal(env.isDraftDirty('settings-backup'),true);
 }finally{env.dispose();}
});
test('successful parsed paste marks QuickPanel and Settings drafts even with prevented default input',async()=>{
 for(const [file,scope,setter] of [['QuickPanel.tsx','quick-server','setServer'],['Settings.tsx','settings-proxy','setProxy']]){
  const {env}=fixture();
  try{
   const updates=[];let prevented=false;
   const paste=await handler('../src/'+file,'  function handleProxyPaste(','  '+(file==='QuickPanel.tsx'?'async function saveProxy(':'useEffect(() => {'),{
    getEnvironment:()=>env,parseProxyAddressPaste:()=>({scheme:'https',host:'proxy.example.com',port:'443'}),
    [setter]:value=>updates.push(value({})),setAddressPasteError(){},setUsername(){},setPassword(){}
   });
   paste({clipboardData:{getData:()=> 'https://proxy.example.com:443'},preventDefault(){prevented=true;}});
   assert.equal(prevented,true);assert.equal(updates[0].port,'443');assert.equal(env.isDraftDirty(scope),true);
  }finally{env.dispose();}
 }
});
test('rotation memory save clears only rotation and retains a PAC draft',async()=>{
 const {env,states}=fixture();
 try{
  env.setDraftDirty(true,'rotation');env.setDraftDirty(true,'settings-pac');
  const values=[];
  const save=await handler('../src/ui/RotationPlan.tsx','  async function save(','  async function clear(',{
   getEnvironment:()=>env,t:key=>key,draft:{targetHost:'example.com',threshold:'3',maxAttempts:'12',intervalMs:'1000',endpointIds:['a','b']},
   endpoints:[],approved:true,saveRotationPlan:async value=>value,
   ...Object.fromEntries(['setBusy','setError','setNotice','setPlan','setApproved','setDraft'].map(key=>[key,value=>values.push([key,value])]))
  });
  await save({preventDefault(){}});
  assert.equal(env.isDraftDirty('rotation'),false);assert.equal(states.at(-1).dirty,true);
  assert.ok(values.some(([key])=>key==='setPlan'));
 }finally{env.dispose();}
});

test('host state updates cannot clear tracked drafts; controls outside draft forms stay clean',()=>{
 const {env,states}=fixture();
 try{
  env.markDraftFrom({closest:()=>null});assert.equal(env.hasDrafts(),false);
  env.setDraftDirty(true,'settings-pac');
  env.setState({dirty:false,busy:false});assert.equal(states.at(-1).dirty,true);
  env.clearDrafts();assert.equal(states.at(-1).dirty,false);
 }finally{env.dispose();}
});
test('Settings partial proxy save failure retains the original draft and editor',async()=>{
 const {env}=fixture();
 try{
  env.setDraftDirty(true,'settings-proxy');const calls=[];
  const save=await handler('../src/Settings.tsx','  async function saveProxy(','  async function savePac(',{
   getEnvironment:()=>env,editingId:'',username:'',password:'',endpoints:[],locale:'en',
   proxy:{name:'draft',scheme:'https',host:'proxy.example.com',port:'443'},
   isValidProxyPort:()=>true,crypto:{randomUUID:()=> 'new'},
   act:async m=>{calls.push(m.type);return m.type==='SAVE_ENDPOINT';},
   closeEditor:()=>assert.fail('partial save closed the draft')
  });
  await save({preventDefault(){},nativeEvent:{}});
  assert.deepEqual(calls,['SAVE_ENDPOINT','SAVE_PROFILE']);assert.equal(env.isDraftDirty('settings-proxy'),true);
 }finally{env.dispose();}
});
test('QuickPanel failed final selection retains the completed endpoint draft for review',async()=>{
 const {env}=fixture();
 try{
  env.setDraftDirty(true,'quick-server');const calls=[];
  const save=await handler('../src/QuickPanel.tsx','  async function saveProxy(','  async function saveSiteRule(',{
   getEnvironment:()=>env,addKind:'server',entryBusy:false,savingRef:{current:false},
   server:{name:'draft',scheme:'https',host:'proxy.example.com',port:'443'},
   isValidProxyPort:()=>true,crypto:{randomUUID:()=> 'new'},setAddedAnother(){},setSaving(){},setEntryFocusRequest(){},
   act:async m=>{calls.push(m.type);return m.type!=='SELECT';},
   setServer:()=>assert.fail('partial save reset inputs'),closeAdd:()=>assert.fail('partial save closed editor')
  });
  await save({preventDefault(){},nativeEvent:{}});
  assert.deepEqual(calls,['SAVE_ENDPOINT','SAVE_PROFILE','SELECT']);assert.equal(env.isDraftDirty('quick-server'),true);
 }finally{env.dispose();}
});
test('PAC save acknowledges only its form and does not release a rotation draft',async()=>{
 const {env}=fixture();
 try{
  env.setDraftDirty(true,'settings-pac');env.setDraftDirty(true,'rotation');
  const cleared=[];
  const save=await handler('../src/Settings.tsx','  async function savePac(','  async function saveRule(',{
   getEnvironment:()=>env,editingPacId:'existing',pacName:'PAC',pacText:'function FindProxyForURL(){return "DIRECT";}',act:async()=>true,
   setPacName:v=>cleared.push(v),setPacText:v=>cleared.push(v),setEditingPacId:v=>cleared.push(v)
  });
  await save({preventDefault(){}});
  assert.equal(env.isDraftDirty('settings-pac'),false);assert.equal(env.isDraftDirty('rotation'),true);assert.deepEqual(cleared,['','','']);
 }finally{env.dispose();}
});

test('late PAC save keeps newer input values and their dirty revision',async()=>{
 const {env}=fixture();
 try{
  env.setDraftDirty(true,'settings-pac');
  const save=await handler('../src/Settings.tsx','  async function savePac(','  async function saveRule(',{
   getEnvironment:()=>env,editingPacId:'existing',pacName:'old',pacText:'old draft',
   act:async()=>{env.setDraftDirty(true,'settings-pac');return true;},
   setPacName:()=>assert.fail('new name reset'),setPacText:()=>assert.fail('new script reset'),setEditingPacId:()=>assert.fail('new editor reset')
  });
  await save({preventDefault(){}});assert.equal(env.isDraftDirty('settings-pac'),true);
 }finally{env.dispose();}
});
test('failed rotation memory save keeps its draft dirty and does not reset inputs',async()=>{
 const {env}=fixture();
 try{
  env.setDraftDirty(true,'rotation');
  const errors=[];
  const save=await handler('../src/ui/RotationPlan.tsx','  async function save(','  async function clear(',{
   getEnvironment:()=>env,t:key=>key,draft:{targetHost:'example.com',threshold:'3',maxAttempts:'12',intervalMs:'1000',endpointIds:['a','b']},
   endpoints:[],approved:true,saveRotationPlan:async()=>{throw Error('write failed');},
   setBusy(){},setError:v=>errors.push(v),setNotice(){},setPlan:()=>assert.fail('failed write changed plan'),setDraft:()=>assert.fail('failed write reset draft')
  });
  await save({preventDefault(){}});assert.equal(env.isDraftDirty('rotation'),true);assert.equal(errors.at(-1),'r83RotationInvalid');
 }finally{env.dispose();}
});

test('late backup completion and QuickPanel cancel/reopen preserve newer and sibling drafts',async()=>{
 const {env}=fixture();
 const observed={};
 try{
  // Finish an older import after the user has supplied a newer backup draft.
  env.setConfirmHandler(async()=>true);
  env.setDraftDirty(true,'settings-backup');
  let backupValue='old backup';
  const importBackup=await handler('../src/Settings.tsx','  async function importBackup()','  async function exportConfig()',{getEnvironment:()=>env,
   backup:backupValue,parseBackupForImport:()=>({schemaVersion:2}),t:key=>key,
   setBackup:value=>{backupValue=value;},setBackupImported(){},
   act:async()=>{backupValue='new backup';env.setDraftDirty(true,'settings-backup');return true;}
  });
  await importBackup();
  observed.backup={value:backupValue,dirty:env.isDraftDirty('settings-backup')};

  // Opening another kind must retain both owners, including after Cancel/Back.
  const context={getEnvironment:()=>env,addKind:null,server:{host:'keep.example.com'},local:{port:'7890'},
   emptyServer:{host:''},emptyLocal:{port:''},entryOrigin:{current:'header'},returnTarget:{current:'header'},returnFocus:{current:false},
   setAddedAnother(){},setSavedHint(){},setAddressPasteError(){},setError(){}};
  for(const [name,key] of [['setAddKind','addKind'],['setServer','server'],['setLocal','local']])context[name]=value=>{context[key]=value;};
  const begin=await handler('../src/QuickPanel.tsx','  function beginAdd(','  function closeAdd(',context);
  const close=await handler('../src/QuickPanel.tsx','  function closeAdd(','  async function readSite(',context);
  begin('server');env.markDraftFrom(scopedTarget('quick-'+context.addKind));
  begin('local');env.markDraftFrom(scopedTarget('quick-'+context.addKind));
  close();
  observed.afterCancel={kind:context.addKind,serverDirty:env.isDraftDirty('quick-server'),localDirty:env.isDraftDirty('quick-local')};
  begin('server');observed.serverAfterReopen=context.server.host;
  begin('local');observed.localAfterSwitch=context.local.port;
  // A successful server save may dismiss the editor, but cannot release local's owner.
  env.setDraftDirty(false,'quick-server',env.getDraftRevision('quick-server'));
  begin('server');close(true);
  observed.afterSave={kind:context.addKind,localValue:context.local.port,localDirty:env.isDraftDirty('quick-local')};
  assert.deepEqual(observed,{
   backup:{value:'new backup',dirty:true},afterCancel:{kind:null,serverDirty:true,localDirty:true},
   serverAfterReopen:'keep.example.com',localAfterSwitch:'7890',afterSave:{kind:null,localValue:'7890',localDirty:true}
  });
 }finally{env.dispose();}
});

test('current-site edit retains saved identity, disabled state, scope and priority without applying',async()=>{
 const {env}=fixture();const calls=[],writes=[];
 try{
  env.setDraftDirty(true,'quick-rule');env.setDraftDirty(true,'settings-pac');
  const existing={id:'parent-rule',domain:'example.com',includeSubdomains:false,enabled:false,priority:500,action:'direct'};
  const save=await handler('../src/QuickPanel.tsx','  async function saveSiteRule(','  async function apply(',{
   getEnvironment:()=>env,siteInput:'https://example.com/path',normalizeRuleSiteInput,
   ruleTarget:'endpoint',quickEndpoint:'proxy-b',includeSubdomains:false,editingSiteRule:existing,config:{rules:[existing]},
   priorityForSiteQuickRule,
   act:async message=>{calls.push(message);return true;},setSiteInput:v=>writes.push(v),setSiteError(){},
   ruleReturn:{current:false},setSiteEditorOpen:v=>writes.push(v),setRuleHint:v=>writes.push(v),setErrorKey:code=>assert.fail(code)
  });
  await save({preventDefault(){}});
  assert.equal(calls.length,1);assert.equal(calls[0].type,'SAVE_RULE');
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0].rule)),{...existing,action:'endpoint',endpointId:'proxy-b'});
  assert.deepEqual(writes,['example.com',false,true]);
  assert.equal(env.isDraftDirty('quick-rule'),false);assert.equal(env.isDraftDirty('settings-pac'),true);
 }finally{env.dispose();}
});
test('both rule editors reject another saved rule instead of silently replacing its identity',async()=>{
 for(const file of ['QuickPanel','Settings']){
  const {env}=fixture();const errors=[];
  try{
   const context={getEnvironment:()=>env,config:{rules:[{id:'other',domain:'example.com',includeSubdomains:true}]},
    normalizeRuleSiteInput:()=> 'example.com',setErrorKey:code=>errors.push(code),setRuleSaved(){},ruleEditorGeneration:{current:0},
    siteInput:'example.com',ruleTarget:'direct',quickEndpoint:'',includeSubdomains:true,editingSiteRule:null,
    rule:{domain:'example.com',includeSubdomains:true,action:'direct',priority:'100'},editingRuleId:'',
    act:()=>assert.fail('duplicate must not be saved')};
   const save=await handler('../src/'+file+'.tsx',file==='QuickPanel'?'  async function saveSiteRule(':'  async function saveRule(',
    file==='QuickPanel'?'  async function apply(':'  function finishRuleEditor(',context);
   await save({preventDefault(){}});assert.deepEqual(errors,['apRuleAlreadyExists']);
  }finally{env.dispose();}
 }
});
test('every current-site rule close intent confirms dirty input and clears only the accepted editor revision',async()=>{
 const {env}=fixture();let closes=0;
 try{
  env.setDraftDirty(true,'quick-rule');env.setDraftDirty(true,'settings-pac');
  const close=await handler('../src/QuickPanel.tsx','  async function closeSiteRule(','  if(siteEditorOpen)',{
   getEnvironment:()=>env,t:key=>key,ruleReturn:{current:false},setSiteEditorOpen:()=>closes++,setError(){}
  });
  env.setConfirmHandler(async()=>false);await close(true);assert.equal(closes,0);
  env.setConfirmHandler(async()=>{env.setDraftDirty(true,'quick-rule');return true;});await close();assert.equal(closes,0);
  env.setConfirmHandler(async()=>true);await close();assert.equal(closes,1);assert.equal(env.isDraftDirty('quick-rule'),false);assert.equal(env.isDraftDirty('settings-pac'),true);
 }finally{env.dispose();}
});
test('a late current-site save keeps newer rule draft open',async()=>{
 const {env}=fixture();
 try{
  env.setDraftDirty(true,'quick-rule');
  const save=await handler('../src/QuickPanel.tsx','  async function saveSiteRule(','  async function apply(',{
   getEnvironment:()=>env,siteInput:'example.com',normalizeRuleSiteInput:()=> 'example.com',ruleTarget:'direct',quickEndpoint:'',
   includeSubdomains:true,editingSiteRule:{id:'r',priority:1},config:{rules:[]},priorityForSiteQuickRule:()=>1,
   act:async()=>{env.setDraftDirty(true,'quick-rule');return true;},
   setSiteEditorOpen:()=>assert.fail('newer editor closed'),setRuleHint:()=>assert.fail('newer draft acknowledged')
  });
  await save({preventDefault(){}});assert.equal(env.isDraftDirty('quick-rule'),true);
 }finally{env.dispose();}
});
