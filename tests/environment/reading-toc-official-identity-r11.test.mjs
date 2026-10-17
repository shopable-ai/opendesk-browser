import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createOfficialToolResources} from '../../scripts/build-official-tools.mjs';
import {officialToolFixture} from '../helpers/official-tools.mjs';
import {OFFICIAL_READING_TOC_RELEASE,matchesOfficialReadingToc,MARKET_PROVENANCE_STORE}
  from '../../src/sidebar-tools/official-reading-toc.js';
import {tocGrantAllowed,verifyOfficialReadingToc} from '../../src/reading-toc/policy.js';
import {serializeSidebarToolPackage} from '../../src/ui/sidebar-tools/package.js';

const pin=OFFICIAL_READING_TOC_RELEASE;
const official=()=>({[pin.id]:{marketId:pin.marketId,sha256:pin.sha256,version:pin.version}});
const url='https://example.com/articles';

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

test('R1.1 only authenticated installed bytes AND provenance enable the official default',async()=>{
  const tool=await officialToolFixture(pin.id),installed=[tool];
  assert.equal(await verifyOfficialReadingToc(installed,official()),true);
  assert.equal(tocGrantAllowed(installed,{},pin.id,url,{},await verifyOfficialReadingToc(installed,official())),true);
  assert.equal(tocGrantAllowed(installed,{},pin.id,url),false);
  assert.equal(await verifyOfficialReadingToc(installed,{}),false,'missing provenance');
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
