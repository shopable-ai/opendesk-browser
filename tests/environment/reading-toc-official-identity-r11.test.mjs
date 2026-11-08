import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createOfficialToolResources} from '../../scripts/build-official-tools.mjs';
import {officialToolFixture} from '../helpers/official-tools.mjs';
import {OFFICIAL_READING_TOC_RELEASE,matchesOfficialReadingToc,MARKET_PROVENANCE_STORE}
  from '../../src/sidebar-tools/official-reading-toc.js';
import {READING_TOC_SITE_STORE,READING_TOC_PAGE_RULES_STORE,READING_TOC_VISIBILITY_STORE,
  tocGrantAllowed,verifyOfficialReadingToc as verifyInstalledReadingToc,changeTocSiteAllowed,changeTocPageAllowed,
  readingTocPageAllowed} from '../../projects/reading-toc/trusted/policy.js';
import {serializeSidebarToolPackage,SIDEBAR_TOOL_STORE,sidebarToolStorageKey} from '../../src/ui/sidebar-tools/package.js';
import {installReviewedSidebarTool} from '../../src/ui/sidebar-tools/installation.js';
import {OFFICIAL_RELEASE_SCHEMA,OFFICIAL_SOURCE_REPOSITORY,OFFICIAL_CATALOG_PATH,officialPackagePath}
  from '../../src/sidebar-tools/official-catalog.js';
import {SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE} from '../../src/ui/sidebar-tools/lifecycle.js';

const pin=OFFICIAL_READING_TOC_RELEASE;
const official=()=>({[pin.id]:{marketId:pin.marketId,sha256:pin.sha256,version:pin.version}});
const url='https://example.com/articles';
// Retain strict-release coverage for the deferred release gate and locale data.
const verifyOfficialReadingToc=(installed,provenance)=>verifyInstalledReadingToc(installed,provenance,true);

// Immutable official release, independent of the currently promoted package.
const historical=JSON.parse(execFileSync('git',['show',
  'cb1643a66f8a7d588b301cd38e2fd2c5ce6d5cb2:examples/sidebar-tools/reading-toc/reading-toc.opendesk-tool.json'],
  {cwd:new URL('../..',import.meta.url),encoding:'utf8'}));
const historicalHash='8d6bf170c92f3093de34f1401f49897d9734f740a0deef87076666a548cc39f0';
const historicalSource=()=>({[pin.id]:{
  marketId:pin.marketId,version:'1.0.10',sha256:historicalHash}});

test('strict release policy retains historical 1.0.10 without overriding disable or site/page denial',async()=>{
  const bytes=serializeSidebarToolPackage(historical);
  assert.equal(historical.version,'1.0.10');
  assert.equal(Buffer.byteLength(bytes),35044);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),historicalHash);
  const installed=[historical],verified=await verifyOfficialReadingToc(installed,historicalSource());
  assert.equal(verified,true);
  assert.equal(tocGrantAllowed(installed,{},pin.id,url,{},verified),true);
  assert.equal(tocGrantAllowed(installed,{},pin.id,url,{[pin.id]:false},verified),false);
  assert.equal(tocGrantAllowed(installed,changeTocSiteAllowed({},pin.id,url,false),pin.id,url,{},verified),false);
  assert.equal(readingTocPageAllowed(changeTocPageAllowed({},pin.id,url,false),pin.id,url),false);
  assert.equal(await verifyOfficialReadingToc([],historicalSource()),false,'uninstalled');
});

test('strict release policy rejects altered historical bytes, forged releases, provenance and duplicate owners',async()=>{
  const source=historicalSource(),record=source[pin.id];
  for(const [reason,provenance] of [
    ['missing provenance',{}],
    ['missing digest',{[pin.id]:{marketId:pin.marketId,version:'1.0.10'}}],
    ['extra assertion',{[pin.id]:{...record,trusted:true}}],
    ['wrong publisher',{[pin.id]:{...record,marketId:'attacker/reading-toc'}}],
    ['wrong version',{[pin.id]:{...record,version:pin.version}}],
    ['wrong hash',{[pin.id]:{...record,sha256:'0'.repeat(64)}}],
    ['current release provenance',official()]
  ])assert.equal(await verifyOfficialReadingToc([historical],provenance),false,reason);
  for(const changed of [
    {...historical,js:historical.js+'\n/* modified */'},
    {...historical,version:pin.version},
    {...historical,version:'1.0.9'},
    {...historical,capabilities:[]}
  ]){
    assert.equal(await verifyOfficialReadingToc([changed],source),false);
    const forgedHash=createHash('sha256').update(serializeSidebarToolPackage(changed)).digest('hex');
    assert.equal(await verifyOfficialReadingToc([changed],{[pin.id]:{
      marketId:pin.marketId,version:changed.version,sha256:forgedHash}}),false,'self-consistent forgery');
  }
  const current=await officialToolFixture(pin.id);
  for(const installed of [[historical,historical],[historical,current],[current,historical]])
    assert.equal(await verifyOfficialReadingToc(installed,source),false,'duplicate reserved ID');
});

test('R1.1 committed package pin equals the real official release builder',async()=>{
  const packaged=await officialToolFixture(pin.id);
  const bytes=serializeSidebarToolPackage(packaged);
  const digest=createHash('sha256').update(bytes).digest('hex');
  const release=(await createOfficialToolResources()).catalog.apps.find(row=>row.toolId===pin.id);
  assert.equal(packaged.version,pin.version);
  assert.equal(digest,pin.sha256);
  assert.deepEqual([release.version,release.sha256,release.id],[pin.version,pin.sha256,pin.marketId]);
  const tracked=await readFile(new URL('../../projects/reading-toc/reading-toc.opendesk-tool.json',import.meta.url));
  assert.equal(createHash('sha256').update(tracked).digest('hex'),pin.sha256);
  assert.match(MARKET_PROVENANCE_STORE,/provenance/);
});

test('strict release policy requires authenticated installed bytes AND provenance',async()=>{
  const tool=await officialToolFixture(pin.id),installed=[tool];
  assert.equal(await verifyOfficialReadingToc(installed,official()),true);
  assert.equal(tocGrantAllowed(installed,{},pin.id,url,{},await verifyOfficialReadingToc(installed,official())),true);
  assert.equal(tocGrantAllowed(installed,{},pin.id,url),false);
  assert.equal(await verifyOfficialReadingToc(installed,{}),false,'missing provenance');
  assert.equal(await verifyOfficialReadingToc([tool,{...tool,js:tool.js+'/* other owner */'}],official()),false,
    'duplicate owners cannot inherit the first valid built-in identity');
  for(const provenance of [
    {[pin.id]:{...official()[pin.id],sha256:'0'.repeat(64)}},
    {[pin.id]:{...official()[pin.id],marketId:'attacker/reading-toc'}},
    {[pin.id]:{...official()[pin.id],version:'1.0.7'}},
    {[pin.id]:{...official()[pin.id],extra:true}}
  ])assert.equal(await verifyOfficialReadingToc(installed,provenance),false);
  for(const fake of [
    {...tool,version:'1.0.7'},
    {...tool,js:tool.js+'\n/* modified */'},
    {...tool,capabilities:[]}
  ]){
    assert.equal(await verifyOfficialReadingToc([fake],official()),false);
    assert.equal(tocGrantAllowed([fake],{},pin.id,url),false);
  }
  assert.equal(matchesOfficialReadingToc(tool,official(),pin.sha256),true);
  assert.equal(matchesOfficialReadingToc(tool,{},pin.sha256),false);
});

test('R1.1 unrelated page.toc tools still require positive site permission',async()=>{
  const original=await officialToolFixture(pin.id),other={...original,id:'third-party'};
  assert.equal(tocGrantAllowed([other],{},other.id,url),false);
  assert.equal(tocGrantAllowed([other],{'third-party':['https://example.com']},other.id,url),true);
  assert.equal(tocGrantAllowed([other],{'third-party':['https://example.com']},other.id,'https://evil.example'),false);
});

test('R1.1 the installer reserves the official ID from all local imports and forged reviews',async()=>{
  const tool=await officialToolFixture(pin.id);
  const uuid='123e4567-e89b-42d3-a456-426614174000';
  for(const options of [
    {candidate:tool,market:null},
    {candidate:{...tool,js:tool.js+'/* unreviewed */'},market:null},
    {candidate:tool,market:{marketId:pin.marketId,sha256:'0'.repeat(64),operationId:uuid}}
  ])await assert.rejects(installReviewedSidebarTool({
    ...options,reviewApproved:true
  }),error=>error?.code==='E_OFFICIAL_ID_RESERVED');
});

async function newerBundledRelease({updating=false}={}){
  const previous=await officialToolFixture(pin.id),parts=previous.version.split('.');
  parts[2]=String(Number(parts[2])+1);
  const candidate={...previous,version:parts.join('.'),
    js:previous.js+'\nglobalThis.readingTocInstallMustNotRun = true;'};
  const bytes=serializeSidebarToolPackage(candidate),sha256=createHash('sha256').update(bytes).digest('hex');
  const release={id:pin.marketId,toolId:pin.id,kind:'sidebar-tool',installationPolicy:'preinstalled',
    version:candidate.version,packageTitle:candidate.title,description:candidate.description,
    capabilities:candidate.capabilities,packagePath:officialPackagePath(pin.id),
    bytes:Buffer.byteLength(bytes),sha256};
  const resources=new Map([
    [OFFICIAL_CATALOG_PATH,JSON.stringify({schema:OFFICIAL_RELEASE_SCHEMA,
      sourceRepository:OFFICIAL_SOURCE_REPOSITORY,apps:[release]})],
    [release.packagePath,bytes]
  ]);
  const values=updating?{
    [SIDEBAR_TOOL_STORE]:[structuredClone(previous)],
    [MARKET_PROVENANCE_STORE]:official(),
    [TOOL_REVOCATION_EPOCHS_STORE]:{[pin.id]:'previous-install'},
    [SIDEBAR_TOOL_ENABLE_STORE]:{[pin.id]:false},
    [sidebarToolStorageKey(pin.id)]:{note:'保留原目录设置与数据'},
    [READING_TOC_SITE_STORE]:{[pin.id]:['https://example.com']},
    [READING_TOC_PAGE_RULES_STORE]:{[pin.id]:['https://example.com/private']},
    [READING_TOC_VISIBILITY_STORE]:{[pin.id]:{hiddenSites:['https://example.com'],hiddenPages:[]}}
  }:{};
  const writes=[],requests=[];
  const api={runtime:{getURL:path=>'chrome-extension://abcdefghijklmnopabcdefghijklmnop/'+path},
    storage:{local:{
      async get(key){return {[key]:structuredClone(values[key])};},
      async set(rows){writes.push(structuredClone(rows));Object.assign(values,structuredClone(rows));}
    }}};
  const fetcher=async address=>{
    requests.push(address);
    const url=new URL(address),path=url.pathname.slice(1);
    return url.protocol==='chrome-extension:'&&resources.has(path)
      ?new Response(resources.get(path)):new Response('',{status:404});
  };
  const options={api,lockManager:{request:async(_name,work)=>work()},candidate,
    baseline:updating?previous:null,reviewApproved:true,fetcher,
    market:{marketId:pin.marketId,sha256,operationId:crypto.randomUUID()}};
  return {options,values,writes,requests,resources,release,previous};
}

test('a newer byte-verified bundled Reading TOC installs without rebuilding the original installer pin',async()=>{
  const f=await newerBundledRelease();
  assert.notEqual(f.options.candidate.version,pin.version);
  const result=await installReviewedSidebarTool(f.options);
  assert.equal(result.state,'installed');
  assert.deepEqual(f.values[SIDEBAR_TOOL_STORE],[f.options.candidate]);
  assert.equal(f.values[MARKET_PROVENANCE_STORE][pin.id].sha256,f.release.sha256);
  assert.equal(f.requests.filter(url=>url.endsWith('/'+f.release.packagePath)).length,1);
  assert.equal(globalThis.readingTocInstallMustNotRun,undefined,'installing never runs package JS');
});

test('a newer reviewed Reading TOC update preserves data and the user stop while rotating install identity',async()=>{
  const f=await newerBundledRelease({updating:true}),dataKey=sidebarToolStorageKey(pin.id);
  const saved=structuredClone(f.values[dataKey]);
  const settings=Object.fromEntries([READING_TOC_SITE_STORE,READING_TOC_PAGE_RULES_STORE,
    READING_TOC_VISIBILITY_STORE].map(key=>[key,structuredClone(f.values[key])]));
  const result=await installReviewedSidebarTool(f.options);
  assert.equal(result.state,'installed');
  assert.deepEqual(f.values[dataKey],saved);
  for(const [key,value] of Object.entries(settings))assert.deepEqual(f.values[key],value,key);
  assert.equal(f.values[SIDEBAR_TOOL_ENABLE_STORE][pin.id],false);
  assert.notEqual(f.values[TOOL_REVOCATION_EPOCHS_STORE][pin.id],'previous-install');
  assert.equal(f.values[MARKET_PROVENANCE_STORE][pin.id].version,f.options.candidate.version);
  assert.equal(globalThis.readingTocInstallMustNotRun,undefined);
});

test('newer Reading TOC admission rejects unreviewed, unlisted, altered and stale candidates without writes',async t=>{
  for(const [name,change,code] of [
    ['no user approval',f=>{f.options.reviewApproved=false;},'E_REVIEW_REQUIRED'],
    ['unverified local source',f=>{f.options.market=null;},'E_OFFICIAL_ID_RESERVED'],
    ['self-reported digest',f=>{f.options.market.sha256='0'.repeat(64);},'E_OFFICIAL_ID_RESERVED'],
    ['missing trusted catalog',f=>{f.resources.delete(OFFICIAL_CATALOG_PATH);},'E_PACKAGE_MISSING'],
    ['altered bundled bytes',f=>{f.resources.set(f.release.packagePath,
      f.resources.get(f.release.packagePath).slice(0,-1)+' ');},'E_PACKAGE_INTEGRITY'],
    ['changed reviewed candidate',f=>{f.options.candidate={...f.options.candidate,js:'void 0;'};},'E_PACKAGE_IDENTITY'],
    ['stale installation baseline',f=>{f.options.baseline=null;},'E_TOOL_CHANGED']
  ])await t.test(name,async()=>{
    const f=await newerBundledRelease({updating:true});change(f);
    const saved=structuredClone(f.values);
    await assert.rejects(installReviewedSidebarTool(f.options),{code});
    assert.deepEqual(f.values,saved);
    assert.equal(f.writes.length,0);
  });
});
