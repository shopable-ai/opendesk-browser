import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {admitsTrustedTimeReview,TRUSTED_TIME_REVIEW_VERSION} from '../../src/time-review/trusted-admission.js';
import {serializeSidebarToolPackage,validateSidebarToolPackage} from '../../src/ui/sidebar-tools/package.js';

function fixture(){
  const tool=validateSidebarToolPackage({format:'opendesk.sidebar-tool.v1',
    id:'time-review',version:TRUSTED_TIME_REVIEW_VERSION,title:'Time Review',
    description:'Reviewed static UI',capabilities:['time.review','user.export'],
    html:'<main></main>',css:'.x{}',js:'void 0;'});
  const bytes=Buffer.from(serializeSidebarToolPackage(tool));
  const sha256=createHash('sha256').update(bytes).digest('hex');
  const release={id:'opendesk/time-review',toolId:'time-review',
    version:tool.version,packagePath:'official-tools/time-review/time-review.opendesk-tool.json',
    bytes:bytes.length,sha256};
  const expectedEpoch='approved-epoch';
  const args={tool,installed:[tool],release,expectedEpoch,epochs:{'time-review':expectedEpoch},
    provenance:{'time-review':{marketId:release.id,version:tool.version,sha256}},
    enableRecords:{'time-review':true}};
  return args;
}
test('R1.6 native admission needs exact built-in version, release hash, provenance and epoch',async()=>{
  const good=fixture();
  assert.equal(await admitsTrustedTimeReview(good),true);
  for(const change of [
    {tool:{...good.tool,js:'malicious()'}},
    {tool:{...good.tool,version:'1.5.2'}},
    {tool:{...good.tool,capabilities:['time.review']}},
    {release:{...good.release,sha256:'0'.repeat(64)}},
    {release:{...good.release,packagePath:'third-party/tool.json'}},
    {release:{...good.release,version:'1.5.2'}},
    {provenance:{}},{provenance:{'time-review':{marketId:'other/time-review',
      version:good.tool.version,sha256:good.release.sha256}}},
    {enableRecords:{'time-review':false}},
    {enableRecords:{'time-review':'true'}},
    {installed:[]},{installed:[{...good.tool,js:'tampered()'}]},
    {epochs:{'time-review':'other'}},{expectedEpoch:null}
  ])assert.equal(await admitsTrustedTimeReview({...good,...change}),false,JSON.stringify(change));
});
test('R1.6 first install with null epoch is admitted only for the exact reviewed release',async()=>{
  const good=fixture();
  good.expectedEpoch=null;
  good.epochs={};
  assert.equal(await admitsTrustedTimeReview(good),true);
  assert.equal(await admitsTrustedTimeReview({...good,tool:{...good.tool,js:'tampered()'}}),false);
  assert.equal(await admitsTrustedTimeReview({...good,provenance:{}}),false);
  assert.equal(await admitsTrustedTimeReview({...good,enableRecords:{'time-review':false}}),false);
  assert.equal(await admitsTrustedTimeReview({...good,expectedEpoch:'stale-epoch'}),false);
});
test('R1.6 source uses one static first-party UI; other tools retain the opaque sandbox',async()=>{
  const host=await readFile('src/ui/sidebar-tools.js','utf8');
  const entry=await readFile('src/entrypoints/sidebar-tool-host.js','utf8');
  const native=await readFile('src/time-review/trusted-native-ui.js','utf8');
  const main=await readFile('examples/sidebar-tools/time-review/src/main.js','utf8');
  const markup=await readFile('src/ui/tool.html','utf8');
  assert.match(host,/sidebar-tools\/sandbox\.html/);
  assert.match(host,/admitsTrustedTimeReview/);
  assert.match(host,/MARKET_PROVENANCE_STORE/);
  assert.match(host,/forceSandbox/);
  assert.match(entry,/trustedTimeReviewUI/);
  assert.match(native,/index\.html\?raw/);
  assert.match(native,/src\/main\.js/);
  assert.doesNotMatch(native,/tool\.(?:html|css|js)/);
  assert.match(main,/__opendeskMountTrustedTimeReview/);
  assert.match(markup,/href="time-review\.css"/);
});
