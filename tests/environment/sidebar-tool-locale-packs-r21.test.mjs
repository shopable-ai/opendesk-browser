import test from 'node:test';
import assert from 'node:assert/strict';
import {TOOL_REVOCATION_EPOCHS_STORE} from '../../src/ui/sidebar-tools/lifecycle.js';
import {createToolLocalization} from '../../src/ui/sidebar-tools/localization.js';
import {SIDEBAR_TOOL_STORE,MAX_INSTALLED_TOOLS} from '../../src/ui/sidebar-tools/package.js';
import {LOCALE_PACK_FORMAT,parseLocalePack,evaluateLocalePack,createToolLocaleService,
  toolLocaleStorageKey,LOCALE_PACK_MAX_BYTES,resolveToolLocaleState,LOCALE_PACK_STORE} from '../../src/ui/sidebar-tools/locale-packs.js';

async function fixture(){
  return {format:'opendesk.sidebar-tool.v1',id:'locale-fixture',version:'1.0.0',title:'Fixture',
    description:'Business UI fixture',capabilities:[],html:'<p>Fixture</p>',css:'',js:'void 0;',
    localization:await createToolLocalization({sourceLocale:'en',messages:{
      en:{hello:'Hello',count:'Count {count}',other:'Other'},fr:{hello:'Bonjour'}}})};
}
function pack(tool,language='fr'){
  return {format:LOCALE_PACK_FORMAT,toolId:tool.id,sourceLocale:'en',targetLocale:language,
    sourceCatalogHash:tool.localization.sourceCatalogHash,
    messages:{hello:{source:'Hello',text:'Salut'},count:{source:'Count {count}',text:'Nombre {count}'}}};
}
function host(tool){
  const values={[SIDEBAR_TOOL_STORE]:[tool]},tails=new Map(),order=[],listeners=new Set();
  let mode='',failRead=false;
  const api={storage:{onChanged:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)},local:{
    async get(key){if(failRead){failRead=false;throw Error('read unavailable');}return structuredClone(key===null?values:{[key]:values[key]});},
    async remove(key){delete values[key];},
    async set(update){
      if(mode==='quota')throw Error('QUOTA_BYTES quota exceeded');
      if(mode==='noop')return;
      Object.assign(values,structuredClone(update));
      if(mode==='unknown'){failRead=true;throw Error('lost ack');}
      if(mode==='lost')throw Error('lost ack');
    }
  }}};
  const lockManager={request(name,callback){
    order.push(name);const before=tails.get(name)||Promise.resolve();
    const result=before.then(callback);tails.set(name,result.catch(()=>{}));return result;
  }};
  return {api,lockManager,values,order,listeners,emit(changes){for(const fn of listeners)fn(changes,'local');},setMode(value){mode=value;}};
}

test('pure data contract accepts canonical BCP47 and rejects executable/prototype/accessor fields',async()=>{
  const tool=await fixture(),base=pack(tool);
  assert.deepEqual(parseLocalePack(JSON.stringify(base),tool),base);
  for(const change of [p=>p.script='evil',p=>p.messages.hello.html='evil',p=>p.targetLocale='FR',
    p=>p.targetLocale='bad_locale',p=>p.targetLocale='en',p=>p.toolId='another-tool',
    p=>p.sourceCatalogHash='bad',p=>p.messages.count.text='Missing token',
    p=>p.messages.count.text='Count {count} {count}',p=>p.messages.hello.text='',
    p=>p.messages.hello.text='x'.repeat(381),p=>p.messages=Array(2),
    p=>Object.defineProperty(p.messages,'__proto__',{value:{source:'X',text:'X'},enumerable:true}),
    p=>Object.defineProperty(p,'secret',{get(){throw Error('must not execute');},enumerable:true}),
    p=>Object.setPrototypeOf(p.messages.hello,{malicious:true}),
    p=>p.messages.hello[Symbol('x')]='bad']){
    const value=structuredClone(base);change(value);assert.throws(()=>parseLocalePack(value,tool));
  }
  for(const text of ['<b>Hello</b>','javascript:evil','data:text/html,evil','file:///tmp/a',
    'onload=evil','bad\u0000','bad\u0085','bad\u202e']){
    const value=structuredClone(base);value.messages.hello.text=text;
    assert.throws(()=>parseLocalePack(value,tool));
  }
  const regional=pack(tool,'zh-Hant-TW');parseLocalePack(regional,tool);
  assert.throws(()=>parseLocalePack(' '.repeat(LOCALE_PACK_MAX_BYTES+1),tool));
  const many=pack(tool);many.messages=Object.fromEntries(Array.from({length:161},(_,i)=>['key'+i,{source:'X',text:'Y'}]));
  assert.throws(()=>parseLocalePack(many,tool));
});

test('blank or invisible translations cannot replace a valid saved label',async()=>{
  const tool=await fixture(),env=host(tool),service=createToolLocaleService(env);
  await service.ready;await service.install(pack(tool),tool);
  const before=structuredClone(env.values);
  for(const text of [' ', '\u3000\u00a0', '\u200b\u2060\ufeff']){
    const value=pack(tool);value.messages.hello.text=text;
    assert.throws(()=>service.install(value,tool),{code:'E_TOOL_LOCALIZATION'});
    assert.deepEqual(env.values,before,'rejected import leaves the saved pack unchanged');
    assert.equal(service.getCatalog(tool,'fr').messages.hello,'Salut');
    await assert.rejects(createToolLocalization({sourceLocale:'en',messages:{en:{hello:text}}}),
      {code:'E_TOOL_LOCALIZATION'});
  }
  const padded=pack(tool);padded.messages.hello.text='  Bonjour\u3000';
  assert.equal(parseLocalePack(padded,tool).messages.hello.text,'  Bonjour\u3000');
  service.dispose();
});

test('old source hash reuses exact original rows only, reports stale and missing keys',async()=>{
  const tool=await fixture(),value=pack(tool);value.sourceCatalogHash='0'.repeat(64);
  value.messages.other={source:'Old other',text:'Autre'};
  value.messages.removed={source:'Removed',text:'Supprimé'};
  const evaluated=evaluateLocalePack(value,tool);
  assert.equal(evaluated.hashMatches,false);
  assert.deepEqual(evaluated.messages,{hello:'Salut',count:'Nombre {count}'});
  assert.deepEqual(evaluated.stale,['other','removed']);assert.deepEqual(evaluated.missing,['other']);
  const env=host(tool),service=createToolLocaleService(env);await service.ready;
  const before=structuredClone(env.values);
  await assert.rejects(service.install(value,tool),{code:'E_LOCALE_PACK_STALE'});
  const sameHash=pack(tool);sameHash.messages.other={source:'Old other',text:'Autre'};
  await assert.rejects(service.install(sameHash,tool),{code:'E_LOCALE_PACK_STALE'});
  const unknown=pack(tool);unknown.messages.removed={source:'Removed',text:'Supprimé'};
  await assert.rejects(service.install(unknown,tool),{code:'E_LOCALE_PACK_STALE'});
  assert.deepEqual(env.values,before,'rejected packs never reach storage');
  service.dispose();
});

test('custom > official > source; independent state, manual task export, upgrade preserves matching translations',async()=>{
  const tool=await fixture(),env=host(tool),service=createToolLocaleService(env);await service.ready;
  assert.equal(service.getCatalog(tool,'fr').messages.hello,'Bonjour');
  let notices=0;const unsubscribe=service.subscribe(()=>notices++);
  await service.install(pack(tool),tool);assert.equal(service.getToolLocale(tool.id),null);
  await service.setToolLocale(tool.id,'fr');
  const catalog=service.getCatalog(tool,'en');
  assert.deepEqual(catalog.messages,{hello:'Salut',count:'Nombre {count}',other:'Other'});
  assert.deepEqual(catalog.missing,['other']);assert.equal(service.getToolLocale(tool.id),'fr');
  assert.deepEqual(service.getAvailableLocales(tool),['en','fr']);
  const task=service.exportTranslationTask(tool,'fr');
  assert.deepEqual(task.translationKeys,['other']);
  assert.deepEqual(Object.keys(task.pack.messages),['hello','count','other']);assert.match(task.instructions,/business UI/);
  assert.equal(task.schema.additionalProperties,false);parseLocalePack(task.pack,tool);
  assert.deepEqual(service.exportPack(tool.id,'fr'),pack(tool));
  const external=service.exportPack(tool.id,'fr');external.messages.hello.text='Mutated';
  assert.equal(service.exportPack(tool.id,'fr').messages.hello.text,'Salut');
  const next={...tool,version:'1.1.0',localization:await createToolLocalization({sourceLocale:'en',messages:{
    en:{hello:'Hello',count:'Changed {count}',other:'Other'},fr:{hello:'Bonjour',count:'Officiel {count}'}}})};
  env.values[SIDEBAR_TOOL_STORE]=[next];await service.reload();
  assert.equal(service.getCatalog(next,'fr').messages.hello,'Salut');
  assert.equal(service.getCatalog(next,'fr').messages.count,'Officiel {count}');
  await assert.rejects(service.install(pack(tool),tool),{code:'E_TOOL_CHANGED'});
  assert.ok(env.values[toolLocaleStorageKey(tool.id)]);assert.equal(env.values[SIDEBAR_TOOL_STORE][0].version,'1.1.0');
  await service.remove(tool.id,'fr');assert.equal(service.getCatalog(next,'fr').messages.hello,'Bonjour');
  assert.ok(notices>=4);unsubscribe();service.dispose();await assert.rejects(service.reload(),{code:'E_DISPOSED'});
});

test('parallel contexts merge writes under existing tool then catalog locks',async()=>{
  const tool=await fixture(),env=host(tool),a=createToolLocaleService(env),b=createToolLocaleService(env);
  await Promise.all([a.ready,b.ready]);
  await Promise.all([a.install(pack(tool,'fr'),tool),b.install(pack(tool,'de'),tool)]);
  await a.reload();assert.deepEqual(a.getAvailableLocales(tool),['de','en','fr']);
  await Promise.all([a.setToolLocale(tool.id,'de'),b.remove(tool.id,'fr')]);
  await a.reload();assert.equal(a.getToolLocale(tool.id),'de');assert.equal(a.exportPack(tool.id,'fr'),null);
  assert.ok(env.order.includes('opendesk.sidebar-tools:tool:'+tool.id));a.dispose();b.dispose();
});

test('quota failure preserves prior data, lost acknowledgement uses durable readback, unknown requires read-only recovery',async()=>{
  const tool=await fixture(),env=host(tool),service=createToolLocaleService(env);await service.ready;
  env.setMode('quota');await assert.rejects(service.install(pack(tool),tool),{code:'E_HOST_STORAGE_QUOTA'});
  assert.equal(env.values[toolLocaleStorageKey(tool.id)],undefined);
  env.setMode('lost');await service.install(pack(tool),tool);assert.ok(service.exportPack(tool.id,'fr'));
  env.setMode('unknown');await assert.rejects(service.setToolLocale(tool.id,'fr'),{code:'E_OUTCOME_UNKNOWN'});
  assert.equal(service.getState().status,'unknown');
  await assert.rejects(service.setToolLocale(tool.id,'de'),{code:'E_LOCALE_RECOVERY_REQUIRED'});
  env.setMode('');await service.reload();assert.equal(service.getToolLocale(tool.id),'fr');
  env.setMode('noop');await assert.rejects(service.setToolLocale(tool.id,'de'),{code:'E_OUTCOME_UNKNOWN'});
  service.dispose();
});

test('uninstall/registry races cannot write a removed tool; corrupt storage is not overwritten',async()=>{
  const tool=await fixture(),env=host(tool),service=createToolLocaleService(env);await service.ready;
  env.values[SIDEBAR_TOOL_STORE]=[];
  await assert.rejects(service.install(pack(tool),tool),{code:'E_TOOL_CHANGED'});
  env.values[SIDEBAR_TOOL_STORE]=[tool];env.values[toolLocaleStorageKey(tool.id)]={locale:null,packs:{},unknown:true};
  await assert.rejects(service.reload());await assert.rejects(service.setToolLocale(tool.id,'fr'),{code:'E_LOCALE_RECOVERY_REQUIRED'});
  assert.equal(env.values[toolLocaleStorageKey(tool.id)].unknown,true);service.dispose();
});

test('pure projection matches service, and same-language pack updates notify subscribers',async()=>{
  const tool=await fixture(),env=host(tool),service=createToolLocaleService(env);await service.ready;
  await service.install(pack(tool),tool);assert.equal(service.getToolLocale(tool.id),null);
  await service.setToolLocale(tool.id,'fr');
  const key=toolLocaleStorageKey(tool.id);assert.equal(key,LOCALE_PACK_STORE+tool.id);
  assert.deepEqual(resolveToolLocaleState(tool,env.values[key],'en'),service.getCatalog(tool,'en'));
  const noticed=new Promise(resolve=>{const stop=service.subscribe(state=>{stop();resolve(state);});});
  env.values[key].packs.fr.messages.hello.text='Coucou';env.emit({[key]:{newValue:env.values[key]}});
  await noticed;assert.equal(service.getToolLocale(tool.id),'fr');
  assert.equal(service.getCatalog(tool,'en').messages.hello,'Coucou');
  // Export follows the requested target even when this tool has an explicit override.
  const next={...tool,localization:await createToolLocalization({sourceLocale:'en',messages:{
    ...tool.localization.messages,de:{hello:'Hallo'}}})};
  assert.deepEqual(service.exportTranslationTask(next,'de').translationKeys,['count','other']);
  service.dispose();assert.equal(env.listeners.size,0);
});

test('initial read failure can recover without replaying a mutation',async()=>{
  const tool=await fixture(),env=host(tool),get=env.api.storage.local.get;
  env.api.storage.local.get=async()=>{throw Error('temporarily unavailable');};
  const service=createToolLocaleService(env);await assert.rejects(service.ready);
  env.api.storage.local.get=get;await service.reload();await service.install(pack(tool),tool);
  assert.equal(service.getState().status,'ready');service.dispose();
});

test('real confirmed uninstall cleans locale namespace, retains journal on failure and preserves installed records',async()=>{
  const {cleanupUninstalledToolLocked,TOOL_CLEANUP_STORE}=await import('../../src/ui/sidebar-tools/installation.js');
  const tool=await fixture(),env=host(tool),key=toolLocaleStorageKey(tool.id);
  env.api.runtime={async sendMessage(){return {ok:true,data:{toolId:tool.id,schedulesRetired:true,alarmsCleared:true}};}};
  env.values[key]={locale:'fr',packs:{fr:pack(tool)}};
  assert.equal((await cleanupUninstalledToolLocked(env.api,tool.id)).state,'not-pending');
  assert.ok(env.values[key]);
  env.values[TOOL_CLEANUP_STORE]={[tool.id]:{version:tool.version,createdAt:Date.now()}};
  assert.equal((await cleanupUninstalledToolLocked(env.api,tool.id)).state,'still-installed');
  assert.ok(env.values[key]);env.values[SIDEBAR_TOOL_STORE]=[];
  const remove=env.api.storage.local.remove;
  env.api.storage.local.remove=async id=>{if(id===key)throw Error('write failed');return remove(id);};
  await assert.rejects(cleanupUninstalledToolLocked(env.api,tool.id),{code:'E_TOOL_UNINSTALL_CLEANUP'});
  assert.ok(env.values[key]);assert.ok(env.values[TOOL_CLEANUP_STORE][tool.id]);
  env.api.storage.local.remove=remove;
  assert.equal((await cleanupUninstalledToolLocked(env.api,tool.id)).state,'cleaned');
  assert.equal(env.values[key],undefined);assert.deepEqual(env.values[TOOL_CLEANUP_STORE],{});
});

test('unknown write fences a mutation already queued on the same service',async()=>{
  const tool=await fixture(),env=host(tool),service=createToolLocaleService(env);await service.ready;
  env.setMode('unknown');
  const result=await Promise.allSettled([service.setToolLocale(tool.id,'fr'),service.setToolLocale(tool.id,'de')]);
  assert.equal(result[0].reason.code,'E_OUTCOME_UNKNOWN');
  assert.equal(result[1].reason.code,'E_LOCALE_RECOVERY_REQUIRED');
  assert.equal(env.values[toolLocaleStorageKey(tool.id)].locale,'fr');service.dispose();
});


test('install atomically persists resources without changing follow or independent language',async()=>{
  const tool=await fixture(),env=host(tool),service=createToolLocaleService(env);await service.ready;
  const writes=[],set=env.api.storage.local.set;
  env.api.storage.local.set=async value=>{writes.push(structuredClone(value));return set(value);};
  await service.install(pack(tool),tool);
  const key=toolLocaleStorageKey(tool.id);
  assert.equal(writes.length,1);assert.deepEqual(writes[0][key],{locale:null,packs:{fr:pack(tool)}});
  assert.equal(service.getToolLocale(tool.id),null);
  assert.equal(service.getCatalog(tool,'en').locale,'en');
  assert.equal(service.getCatalog(tool,'fr').messages.hello,'Salut');
  await service.setToolLocale(tool.id,'fr');
  await service.install(pack(tool,'de'),tool);
  assert.equal(writes.length,3);assert.deepEqual(writes[2][key],{
    locale:'fr',packs:{fr:pack(tool),de:pack(tool,'de')}});
  assert.equal(service.getToolLocale(tool.id),'fr');
  assert.equal(service.getCatalog(tool,'en').locale,'fr');
  await service.setToolLocale(tool.id,null);
  assert.equal(env.values[key].locale,null);assert.equal(service.getCatalog(tool,'en').locale,'en');
  assert.equal(service.getCatalog(tool,'fr').messages.hello,'Salut');service.dispose();
});

test('registry limit follows package constant and custom projection supports more than twelve total languages',async()=>{
  const tool=await fixture(),env=host(tool);
  env.values[SIDEBAR_TOOL_STORE]=Array.from({length:MAX_INSTALLED_TOOLS},(_,i)=>({...tool,id:'fixture-'+i}));
  const service=createToolLocaleService(env);await service.ready;
  assert.equal(Object.keys(service.getState().tools).length,MAX_INSTALLED_TOOLS);
  env.values[SIDEBAR_TOOL_STORE].push({...tool,id:'fixture-overflow'});
  await assert.rejects(service.reload(),{code:'E_STORAGE_CORRUPT'});service.dispose();
  const languages=['en','fr','de','es','it','ja','ko','pt','ru','ar','nl','sv'];
  const localized={...tool,localization:await createToolLocalization({sourceLocale:'en',
    messages:Object.fromEntries(languages.map(id=>[id,{...tool.localization.messages.en}]))})};
  const fresh=host(localized),other=createToolLocaleService(fresh);await other.ready;
  await other.install(pack(localized,'zh-Hant-TW'),localized);
  assert.equal(other.getAvailableLocales(localized).length,13);
  assert.equal(other.getCatalog(localized,'en').locale,'en');
  await other.setToolLocale(localized.id,'zh-Hant-TW');
  assert.equal(other.getCatalog(localized,'en').messages.hello,'Salut');
  assert.equal(other.getCatalog(localized,'en').locale,'zh-Hant-TW');other.dispose();
});

test('write notification refresh cannot clear unknown or dispatch the queued second write',async()=>{
  const tool=await fixture(),env=host(tool),service=createToolLocaleService(env);await service.ready;
  const set=env.api.storage.local.set,get=env.api.storage.local.get,writes=[];
  let failReadback=false,reads=0;
  env.api.storage.local.get=async key=>{
    reads++;
    if(failReadback){failReadback=false;throw Error('readback unavailable');}
    return get(key);
  };
  env.api.storage.local.set=async update=>{
    writes.push(structuredClone(update));await set(update);
    env.emit(Object.fromEntries(Object.entries(update).map(([key,newValue])=>[key,{newValue}])));
    if(writes.length===1){failReadback=true;throw Error('durable write lost acknowledgement');}
  };
  const results=await Promise.allSettled([service.setToolLocale(tool.id,'fr'),service.setToolLocale(tool.id,'de')]);
  await env.lockManager.request('opendesk.sidebar-tools:catalog',()=>{});
  assert.equal(results[0].reason?.code,'E_OUTCOME_UNKNOWN');
  assert.equal(results[1].reason?.code,'E_LOCALE_RECOVERY_REQUIRED');
  assert.equal(writes.length,1);assert.ok(reads>=5,'onChanged must cause an actual read-only refresh');
  assert.equal(service.getState().status,'unknown');assert.equal(service.getToolLocale(tool.id),'fr');
  await assert.rejects(service.setToolLocale(tool.id,'de'),{code:'E_LOCALE_RECOVERY_REQUIRED'});
  env.api.storage.local.get=async()=>{throw Error('recovery read failed');};
  await assert.rejects(service.reload(),/recovery read failed/);
  assert.equal(service.getState().status,'unknown');
  env.api.storage.local.get=get;
  await service.reload();assert.equal(service.getState().status,'ready');
  assert.equal(writes.length,1,'explicit recovery only reads');
  await service.setToolLocale(tool.id,'de');assert.equal(writes.length,2);service.dispose();
});

test('partial AI export roundtrip preserves valid custom and official rows while ordinary imports still replace',async()=>{
  const tool=await fixture(),env=host(tool),service=createToolLocaleService(env);await service.ready;
  const partial=pack(tool);delete partial.messages.hello;
  await service.install(partial,tool);
  const task=service.exportTranslationTask(tool,'fr');
  assert.deepEqual(task.translationKeys,['other']);
  assert.deepEqual(task.pack.messages,{
    hello:{source:'Hello',text:'Bonjour'},count:{source:'Count {count}',text:'Nombre {count}'},
    other:{source:'Other',text:'Other'}});
  assert.equal(task.pack.sourceCatalogHash,tool.localization.sourceCatalogHash);
  assert.match(task.instructions,/translationKeys/);
  assert.match(task.instructions,/preserve every other row unchanged/i);
  // Model edits only the requested missing row and returns the full pack JSON.
  const response=JSON.parse(JSON.stringify(task.pack));response.messages.other.text='Autre';
  await service.install(JSON.stringify(response),tool);
  assert.deepEqual(service.getCatalog(tool,'fr').messages,{hello:'Bonjour',count:'Nombre {count}',other:'Autre'});
  assert.deepEqual(service.getCatalog(tool,'fr').missing,[]);
  const fresh=createToolLocaleService(env);await fresh.ready;
  assert.equal(fresh.getCatalog(tool,'fr').messages.count,'Nombre {count}');fresh.dispose();
  const replacement=pack(tool);replacement.messages={other:{source:'Other',text:'Nouveau'}};
  await service.install(replacement,tool);
  assert.deepEqual(service.getCatalog(tool,'fr').messages,{hello:'Bonjour',count:'Count {count}',other:'Nouveau'});
  assert.deepEqual(service.getCatalog(tool,'fr').missing,['count']);service.dispose();
});


test('explicit recovery permits fresh requests but never revives the old mutation queue',async()=>{
  const tool=await fixture(),env=host(tool),service=createToolLocaleService(env);await service.ready;
  const held=Promise.withResolvers(),release=Promise.withResolvers();
  const request=env.lockManager.request.bind(env.lockManager),set=env.api.storage.local.set;
  let acquired=0,writes=0;
  env.lockManager.request=(name,work)=>request(name,async()=>{
    if(name==='opendesk.sidebar-tools:tool:'+tool.id&&++acquired===2){held.resolve();await release.promise;}
    return work();
  });
  env.api.storage.local.set=async update=>{writes++;return set(update);};
  env.setMode('unknown');
  const results=Promise.allSettled([service.setToolLocale(tool.id,'fr'),service.setToolLocale(tool.id,'de')]);
  await held.promise;assert.equal(service.getState().status,'unknown');
  env.setMode('');await service.reload();assert.equal(service.getState().status,'ready');
  release.resolve();
  const settled=await results;
  assert.equal(settled[0].reason?.code,'E_OUTCOME_UNKNOWN');
  assert.equal(settled[1].reason?.code,'E_LOCALE_RECOVERY_REQUIRED');
  assert.equal(writes,1);assert.equal(env.values[toolLocaleStorageKey(tool.id)].locale,'fr');
  await service.setToolLocale(tool.id,'de');assert.equal(writes,2);service.dispose();
});

test('delete confirmation cannot remove a replaced pack or a reinstalled tool generation',async()=>{
  for(const change of ['pack','epoch','package']){
    const tool=await fixture(),env=host(tool),service=createToolLocaleService(env);
    env.values[TOOL_REVOCATION_EPOCHS_STORE]={[tool.id]:'original-install'};
    await service.ready;await service.install(pack(tool),tool);
    const review=structuredClone({tool,pack:service.exportPack(tool.id,'fr'),epoch:'original-install'});
    if(change==='pack')env.values[toolLocaleStorageKey(tool.id)].packs.fr.messages.hello.text='Nouveau';
    if(change==='epoch')env.values[TOOL_REVOCATION_EPOCHS_STORE][tool.id]='reinstalled';
    if(change==='package')env.values[SIDEBAR_TOOL_STORE][0].version='1.0.1';
    const before=structuredClone(env.values);
    await assert.rejects(service.remove(tool.id,'fr',review),{code:'E_TOOL_CHANGED'},change);
    assert.deepEqual(env.values,before,change+' must remain read-only');
    service.dispose();
  }
});

test('delete accepts the same reviewed resource after storage reorders object keys',async()=>{
  const tool=await fixture(),env=host(tool),service=createToolLocaleService(env);
  await service.ready;await service.install(pack(tool),tool);
  const review={tool,pack:service.exportPack(tool.id,'fr'),epoch:null};
  const key=toolLocaleStorageKey(tool.id),current=env.values[key].packs.fr;
  env.values[key].packs.fr=Object.fromEntries(Object.entries(current).reverse());
  await service.remove(tool.id,'fr',review);
  assert.equal(env.values[key].packs.fr,undefined);service.dispose();
});
