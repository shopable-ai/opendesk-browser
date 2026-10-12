import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {marketScreenshots,pngSize} from '../../src/market-site/media.mjs';
import {appDetail} from '../../src/market-site/templates.mjs';
import {officialMarketApps} from '../../src/marketplace/catalog.js';
import {officialFixtures} from '../helpers/official-tools.mjs';
const index=JSON.parse(await readFile('src/market-site/media-index.json','utf8'));
const fixtures=await officialFixtures(),releases=fixtures.catalog.apps;
const readScreenshot=filename=>readFile('src/market-site/media/'+filename);

test('reviewed actual screenshots bind exact release bytes, dimensions and honest display text',async()=>{
  const rows=await marketScreenshots({index,releases,readScreenshot});
  assert(rows.length>0);
  for(const media of rows){
    const app=officialMarketApps({apps:[releases.find(row=>row.toolId===media.toolId)]})[0];
    assert.deepEqual({width:media.width,height:media.height},pngSize(media.bytes));
    const html=appDetail(app,{current:app,media});
    assert(html.includes('width="'+media.width+'" height="'+media.height+'"'));
    assert(html.includes(media.caption));assert(html.includes('查看原图'));
    assert.equal(html.includes('受控示例内容'),false);
    assert.equal(html.includes('width="960" height="720"'),false);
  }
});

test('unreviewed image bytes, release mismatches and incomplete provenance fail closed',async()=>{
  for(const change of [row=>row.sha256='0'.repeat(64),row=>row.evidence.releaseSha256='0'.repeat(64),
    row=>row.version='999.0.0',row=>row.evidence.capturePath='../unreviewed.png',
    row=>row.evidence.surface='pretend-chrome',row=>row.evidence.sourceCommit='latest',
    row=>row.evidence={...row.evidence,approved:true},row=>row.url='https://untrusted.invalid/a.png']){
    const changed=structuredClone(index);change(changed.items[0]);
    await assert.rejects(marketScreenshots({index:changed,releases,readScreenshot}),/Market screenshot:/);
  }
  const duplicate=structuredClone(index);duplicate.items.push(duplicate.items[0]);
  await assert.rejects(marketScreenshots({index:duplicate,releases,readScreenshot}),/duplicate screenshot/);
});

test('actual PNG headers provide bounded intrinsic dimensions rather than a guessed aspect ratio',async()=>{
  const file=index.items[0].toolId+'-'+index.items[0].version+'.png',raw=await readScreenshot(file);
  for(const kind of ['signature','zero-width','oversized-height']){
    const bytes=Buffer.from(raw);
    if(kind==='signature')bytes[0]=0;
    if(kind==='zero-width')bytes.writeUInt32BE(0,16);
    if(kind==='oversized-height')bytes.writeUInt32BE(8193,20);
    const changed=structuredClone(index);changed.items=[changed.items[0]];
    changed.items[0].sha256=createHash('sha256').update(bytes).digest('hex');
    await assert.rejects(marketScreenshots({index:changed,releases,readScreenshot:async()=>bytes}),/Market screenshot:/);
  }
});
