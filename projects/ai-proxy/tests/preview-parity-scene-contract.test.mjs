import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const contract=JSON.parse(readFileSync(new URL('../evidence/pc-parity-20261114/scene-contract.json',import.meta.url),'utf8'));
const design=readFileSync(new URL('../preview/preview.html',import.meta.url));
const optionsRoute=readFileSync(new URL('../src/ui/optionsRoute.ts',import.meta.url),'utf8');

test('current PC approved HTML bytes are pinned independently of historical preview manifests',()=>{
 assert.equal(contract.design.path,'projects/ai-proxy/preview/preview.html');
 assert.equal(contract.design.immutable,true);
 assert.equal(design.byteLength,contract.design.bytes,'design HTML changed size; re-review instead of silent regeneration');
 assert.equal(createHash('sha256').update(design).digest('hex'),contract.design.sha256,
   'approved design changed; do not mask drift by regenerating preview.html');
});

test('current PC route map describes all seven actual preview and official PC sections in order',()=>{
 const text=design.toString('utf8');
 const start=text.indexOf('const navs=['),end=text.indexOf('];',start);
 assert.ok(start>=0&&end>start,'approved design navigation must exist');
 const preview=[...text.slice(start,end).matchAll(/\['([^']+)','[^']+','[^']+'\]/g)].map(m=>m[1]);
 const options=optionsRoute.match(/export const OPTIONS_SECTIONS\s*=\s*\[([^\]]+)\]/);
 assert.ok(options,'formal PC route map must exist');
 const production=[...options[1].matchAll(/'([^']+)'/g)].map(m=>m[1]);
 assert.deepEqual(contract.routeMap.map(x=>x.preview),preview);
 assert.deepEqual(contract.routeMap.map(x=>x.production),production);
 assert.equal(preview.length,7);
});

test('current PC covers PC, Side Panel, cross-surface and failure scenes without duplicate IDs',()=>{
 const ids=contract.scenes.map(x=>x.id);
 assert.equal(new Set(ids).size,ids.length);
 for(const prefix of ['PC-01-','PC-02-','PC-03-','PC-04-','PC-05-','PC-06-','PC-07-','PC-08-','PC-09-','SIDE-01-','CROSS-01-','ERR-01-']){
   assert.ok(ids.some(id=>id.startsWith(prefix)),'missing scene '+prefix);
 }
 for(const scene of contract.scenes){
   assert.ok(scene.assertion?.length>10);
   assert.ok(scene.previewRoute.startsWith('#'));
   assert.ok(['NOT_TESTED','BLOCKED','FAIL','PASS'].includes(scene.status));
   if(scene.status==='PASS')assert.ok(scene.evidence?.path&&scene.evidence?.buildSha,
      'a scene cannot claim PASS without an installed/source identity');
 }
});

test('current PC gate statuses must not silently upgrade fixture evidence to installed acceptance',()=>{
 assert.equal(contract.evidenceLevel,'DESIGN_SOURCE_CONTRACT_ONLY_NOT_COMPONENT_OR_INSTALLED_ACCEPTANCE');
 assert.equal(contract.sourcePreview.forbidOverwriteApprovedHTML,true);
 assert.equal(contract.sourcePreview.simulationOnly,true);
 assert.equal(contract.gates.INSTALLED_PARITY_PASS.status,'NOT_TESTED');
 for(const [name,gate] of Object.entries(contract.gates)){
   assert.ok(['NOT_TESTED','BLOCKED','FAIL','PASS'].includes(gate.status),name);
   if(gate.status==='PASS')assert.ok(gate.evidence?.path&&gate.evidence?.sourceSha,
     'a gate cannot claim PASS without version-bound evidence: '+name);
 }
});
