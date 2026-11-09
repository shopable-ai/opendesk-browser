import test from 'node:test';
import assert from 'node:assert/strict';
import {digestUtf8} from '../../../src/platform/protocol.js';
import {SIDEBAR_TOOL_DATA_LIMITS,sidebarToolStorageKey} from '../../../src/ui/sidebar-tools/package.js';
import {prepareLegacyReadingTocUpgrade,writeLegacyReadingTocUpgrade}
  from '../../../src/ui/sidebar-tools/legacy-reading-toc-upgrade.js';
import {READING_TOC_SITE_STORE as sites,READING_TOC_PAGE_RULES_STORE as pages,
  READING_TOC_VISIBILITY_STORE as visibility,READING_TOC_PLACEMENT_PREFIX as placementPrefix,
  READING_TOC_COLLAPSE_PREFIX as collapsePrefix,changeTocSiteAllowed,changeTocPageAllowed,
  changeReadingTocVisibility,readingTocPlacementKey,readingTocCollapseKey} from '../trusted/policy.js';

const id='reading-toc',key=sidebarToolStorageKey(id),otherKey=sidebarToolStorageKey('other-tool');
const existing={id,version:'1.0.15',capabilities:['page.toc']};
const candidate={id,version:'1.1.0',capabilities:['page.module'],pageModule:{programId:'app.reading-toc'}};
const alpha='https://alpha.example',beta='https://beta.example:8443',gamma='http://gamma.example';
const position={v:1,dock:'right',x:0.95,y:0.2};
const originKey=async site=>'origin.'+(await digestUtf8(site)).slice(0,12);

// Chrome storage reads return independent snapshots. Hooks model writes that
// fail before/after persistence and readbacks whose outcome cannot be known.
function storage(initial={},hooks={}){
  const data=structuredClone(initial),calls=[];
  const api={storage:{local:{
    async get(selection){
      calls.push({operation:'get',selection});
      await hooks.get?.(selection,data,calls);
      return structuredClone(selection===null?data:
        Object.hasOwn(data,selection)?{[selection]:data[selection]}:{});
    },
    async set(values){
      calls.push({operation:'set',values:structuredClone(values)});
      if(hooks.set)return hooks.set(values,data,calls);
      Object.assign(data,structuredClone(values));
    },
    async remove(){assert.fail('migration must retain legacy records');}
  }}};
  return {api,data,calls,writes:()=>calls.filter(row=>row.operation==='set')};
}
function legacy(){
  return {
    [key]:{draft:{text:'keep reader data'}},[otherKey]:{secret:'other tool data'},
    [sites]:changeTocSiteAllowed({'other-tool':['https://other.example']},id,alpha,false),
    [pages]:changeTocPageAllowed({'other-tool':['https://other.example/private']},id,beta+'/blocked?private=1#answer',false),
    [visibility]:changeReadingTocVisibility(
      changeReadingTocVisibility({'other-tool':{hiddenSites:['https://other.example'],hiddenPages:[]}},
        id,beta,'site',true),id,alpha+'/hidden?private=2#part','page',true),
    [readingTocPlacementKey(alpha+'/article')]:position,
    [readingTocCollapseKey(alpha)]:true,
    [readingTocPlacementKey(beta)]:{v:1,dock:'free',x:0.25,y:0.75},
    [readingTocCollapseKey(beta)]:false,
    [readingTocCollapseKey(gamma)]:true,
    unrelated:{setting:['preserve',1]}
  };
}
const prepare=f=>prepareLegacyReadingTocUpgrade({api:f.api,existing,candidate});

test('real legacy settings preserve blocked sites/pages, independent hidden preferences and all original data',async()=>{
  const original=legacy(),f=storage(original),plan=await prepare(f);
  assert.equal(plan.key,key);
  assert.deepEqual(plan.previous,original[key]);
  assert.deepEqual(plan.next.preferences,{blockedOrigins:[alpha],disabledPages:[beta+'/blocked'],
    hiddenSites:[beta],hiddenPages:[alpha+'/hidden']});
  assert.deepEqual(plan.next.draft,original[key].draft);
  assert.deepEqual(plan.next.legacyMigration,{version:1,fromVersion:existing.version});
  assert.deepEqual(f.data,original,'preparing the upgrade is read only');
  assert.equal(f.writes().length,0);
  await writeLegacyReadingTocUpgrade(f.api,plan);
  assert.deepEqual(f.data,{...original,[key]:plan.next});
  assert.deepEqual(f.data[otherKey],original[otherKey]);
  assert.equal(f.writes().length,1);
  assert.deepEqual(Object.keys(f.writes()[0].values),[key],'only the reader namespace may change');
  assert.deepEqual(f.calls.map(row=>[row.operation,row.selection]),
    [['get',null],['get',null],['set',undefined],['get',key]],'success requires reading persisted bytes back');
});

test('placement and both collapse values stay isolated by origin, including collapse-only sites',async()=>{
  const f=storage(legacy()),plan=await prepare(f);
  assert.deepEqual(plan.next[await originKey(alpha)],{origin:alpha,placement:position,collapsed:true});
  assert.deepEqual(plan.next[await originKey(beta)],{origin:beta,
    placement:{v:1,dock:'free',x:0.25,y:0.75},collapsed:false});
  assert.deepEqual(plan.next[await originKey(gamma)],{origin:gamma,collapsed:true});
  await writeLegacyReadingTocUpgrade(f.api,plan);
  assert.deepEqual(f.data[key],plan.next);
});

test('missing settings and historical positive site arrays retain the built-in all-sites default',async()=>{
  for(const original of [{}, {[sites]:{[id]:[alpha,beta,alpha]}}]){
    const f=storage(original),plan=await prepare(f);
    assert.deepEqual(plan.next.preferences,{blockedOrigins:[],disabledPages:[],hiddenSites:[],hiddenPages:[]});
    assert.equal(plan.previous,undefined);
    await writeLegacyReadingTocUpgrade(f.api,plan);
    assert.deepEqual(f.data,{...original,[key]:plan.next});
  }
});

test('only a legacy page.toc reader upgrading to its Page module prepares migration',async()=>{
  for(const [prior,next] of [[null,candidate],[{...existing,id:'other-tool'},candidate],
    [{...existing,capabilities:['storage.local']},candidate],[existing,null],
    [existing,{...candidate,id:'other-tool'}],[existing,{id}]] ){
    const f=storage(legacy());
    assert.equal(await prepareLegacyReadingTocUpgrade({api:f.api,existing:prior,candidate:next}),null);
    assert.deepEqual(f.calls,[]);
  }
  const f=storage();await writeLegacyReadingTocUpgrade(f.api,null);assert.deepEqual(f.calls,[]);
});

test('invalid legacy settings fail closed without writing or deleting original data',async t=>{
  const cases=[
    ['private namespace is an array',raw=>raw[key]=[]],
    ['shared site record is damaged',raw=>raw[sites]='broken'],
    ['unknown site policy',raw=>raw[sites][id]={mode:'allow-all',blockedOrigins:[]}],
    ['unknown site policy field',raw=>raw[sites][id].allowAll=true],
    ['invalid blocked origin',raw=>raw[sites][id].blockedOrigins=['https://alpha.example/path']],
    ['historical positive list has invalid scope',raw=>raw[sites][id]=['file:///tmp']],
    ['too many origins',raw=>raw[sites][id].blockedOrigins=Array.from({length:65},(_,i)=>`https://site${i}.example`)],
    ['disabled page query is not a stored scope',raw=>raw[pages][id]=[alpha+'/article?secret=1']],
    ['disabled page list has wrong type',raw=>raw[pages][id]={}],
    ['visibility is an array',raw=>raw[visibility][id]=[]],
    ['unknown visibility field',raw=>raw[visibility][id].enabled=true],
    ['hidden site credentials',raw=>raw[visibility][id].hiddenSites=['https://user:password@alpha.example']],
    ['hidden page fragment',raw=>raw[visibility][id].hiddenPages=[alpha+'/hidden#answer']],
    ['out of bounds placement',raw=>raw[readingTocPlacementKey(alpha)]={...position,x:1.1}],
    ['invalid placement version',raw=>raw[readingTocPlacementKey(alpha)]={...position,v:2}],
    ['nonfinite placement',raw=>raw[readingTocPlacementKey(alpha)]={...position,y:NaN}],
    ['unknown dock',raw=>raw[readingTocPlacementKey(alpha)]={...position,dock:'top'}],
    ['nonboolean collapse',raw=>raw[readingTocCollapseKey(alpha)]='false'],
    ['malformed encoded origin',raw=>raw[placementPrefix+'%ZZ']=position],
    ['non-origin placement key',raw=>raw[placementPrefix+encodeURIComponent(alpha+'/article')]=position],
    ['unsupported collapse origin',raw=>raw[collapsePrefix+encodeURIComponent('file:///tmp')]=true]
  ];
  for(const [name,mutate] of cases)await t.test(name,async()=>{
    const original=legacy();mutate(original);const f=storage(original);
    await assert.rejects(prepare(f),{code:'E_MIGRATION_REQUIRED'});
    assert.equal(f.writes().length,0);assert.deepEqual(f.data,original);
  });
});

test('item, total byte and key capacity failures occur before any persistent change',async t=>{
  const limits=SIDEBAR_TOOL_DATA_LIMITS;
  for(const [name,previous] of [
    ['item bytes',{oversized:'x'.repeat(limits.itemBytes)}],
    ['total UTF-8 bytes',Object.fromEntries(Array.from({length:5},(_,i)=>['data'+i,'界'.repeat(2400)]))],
    ['key count',Object.fromEntries(Array.from({length:limits.maxKeys-1},(_,i)=>['data'+i,i]))]
  ])await t.test(name,async()=>{
    const original={[key]:previous,unrelated:{unchanged:true}},f=storage(original);
    await assert.rejects(prepare(f),{code:'E_MIGRATION_REQUIRED'});
    assert.deepEqual(f.data,original);assert.equal(f.writes().length,0);
  });
});

test('an existing origin hash slot bound to another origin rejects before writes',async()=>{
  const original=legacy();original[key][await originKey(alpha)]={origin:beta};
  const f=storage(original);
  await assert.rejects(prepare(f),{code:'E_MIGRATION_REQUIRED'});
  assert.deepEqual(f.data,original);assert.equal(f.writes().length,0);
});

test('concurrent mutations to private or legacy source data reject the reviewed plan',async t=>{
  const cases=[
    ['private reader data',raw=>raw[key].draft.text='new draft'],
    ['blocked sites',raw=>raw[sites][id].blockedOrigins.push(beta)],
    ['disabled pages',raw=>raw[pages][id].push(alpha+'/new')],
    ['hidden settings',raw=>raw[visibility][id].hiddenSites.push(alpha)],
    ['placement',raw=>raw[readingTocPlacementKey(alpha)].x=0.1],
    ['collapse',raw=>raw[readingTocCollapseKey(alpha)]=false],
    ['deleted legacy record',raw=>delete raw[visibility]],
    ['new origin preference',raw=>raw[readingTocCollapseKey('https://new.example')]=true]
  ];
  for(const [name,mutate] of cases)await t.test(name,async()=>{
    const f=storage(legacy()),plan=await prepare(f);mutate(f.data);
    const concurrent=structuredClone(f.data);
    await assert.rejects(writeLegacyReadingTocUpgrade(f.api,plan),{code:'E_MIGRATION_REQUIRED'});
    assert.equal(f.writes().length,0);assert.deepEqual(f.data,concurrent);
  });
});

test('unrelated tool mutation survives migration and storage key reordering is harmless',async()=>{
  const f=storage(legacy()),plan=await prepare(f);
  f.data[otherKey].newDraft='concurrent work';
  f.data[key]=Object.fromEntries(Object.entries(f.data[key]).reverse());
  f.data[sites]=Object.fromEntries(Object.entries(f.data[sites]).reverse());
  const other=structuredClone(f.data[otherKey]);
  await writeLegacyReadingTocUpgrade(f.api,plan);
  assert.deepEqual(f.data[otherKey],other);assert.deepEqual(f.data[key],plan.next);
});

test('lost write acknowledgement succeeds only when the exact migrated value is read back',async()=>{
  const f=storage(legacy(),{set(values,data){
    Object.assign(data,structuredClone(values));throw Error('acknowledgement lost');
  }}),plan=await prepare(f);
  await writeLegacyReadingTocUpgrade(f.api,plan);
  assert.deepEqual(f.data[key],plan.next);assert.equal(f.writes().length,1);
  assert.deepEqual(f.calls.at(-1),{operation:'get',selection:key});
});

test('unverified writes never report success or automatically replay the migration',async t=>{
  const cases=[
    ['fulfilled write not persisted',{set(){}},'E_OUTCOME_UNKNOWN'],
    ['different value persisted',{set(_values,data){data[key]={unexpected:true};}},'E_OUTCOME_UNKNOWN'],
    ['readback unavailable',{get(selection){if(selection===key)throw Error('offline');}},'E_OUTCOME_UNKNOWN'],
    ['quota failure leaves original',{set(){throw Error('QUOTA_BYTES quota exceeded');}},'E_HOST_STORAGE_QUOTA']
  ];
  for(const [name,hooks,code] of cases)await t.test(name,async()=>{
    const original=legacy(),f=storage(original,hooks),plan=await prepare(f);
    await assert.rejects(writeLegacyReadingTocUpgrade(f.api,plan),{code});
    assert.equal(f.writes().length,1,'unknown effects must not be replayed');
    assert.deepEqual(Object.fromEntries(Object.entries(f.data).filter(([name])=>name!==key)),
      Object.fromEntries(Object.entries(original).filter(([name])=>name!==key)));
    if(code==='E_HOST_STORAGE_QUOTA')assert.deepEqual(f.data[key],original[key]);
  });
});
