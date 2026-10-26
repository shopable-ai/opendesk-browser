import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createOfficialToolResources} from '../../scripts/build-official-tools.mjs';
import {officialToolFixture} from '../helpers/official-tools.mjs';
import {OFFICIAL_READING_TOC_RELEASE,matchesOfficialReadingToc,MARKET_PROVENANCE_STORE}
  from '../../src/sidebar-tools/official-reading-toc.js';
import {tocGrantAllowed,verifyOfficialReadingToc as verifyInstalledReadingToc,changeTocSiteAllowed,changeTocPageAllowed,
  readingTocPageAllowed} from '../../examples/sidebar-tools/reading-toc/trusted/policy.js';
import {serializeSidebarToolPackage} from '../../src/ui/sidebar-tools/package.js';
import {installReviewedSidebarTool} from '../../src/ui/sidebar-tools/installation.js';

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
  const tracked=await readFile(new URL('../../examples/sidebar-tools/reading-toc/reading-toc.opendesk-tool.json',import.meta.url));
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
