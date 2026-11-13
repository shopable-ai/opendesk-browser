import test from 'node:test';
import assert from 'node:assert/strict';
import {composeExtensionEntries,describeInstalledPageControl} from '../../src/ui/extension-center-model.js';

const page={programId:'reader',title:'Reader',revision:1,manifestHash:'a'.repeat(64),
  enabled:true,nativeState:'registered',authorization:{status:'active'},
  pageRules:{matches:['https://example.com/*']},
  managedCleanup:{scope:'managed-ui-only',state:'unknown',records:150}};

for(const programId of ['reader','opendesk.ai-scroll-navigation','opendesk.ai-reply-mindmap']){
  test(programId+': old-page cleanup does not restrict a registered installation or confirmed disable',()=>{
    const installed={...page,programId},before=structuredClone(installed);
    const control=describeInstalledPageControl(installed);
    assert.equal(control.state,'ready');
    assert.equal(control.enabled,true);
    assert.equal(control.canRestore,false);
    assert.match(control.note,/刷新/);
    const disabled=describeInstalledPageControl({...installed,enabled:false,nativeState:'disabled',authorization:{status:'disabled'}});
    assert.equal(disabled.state,'off');
    assert.match(disabled.note,/刷新/);
    assert.deepEqual(installed,before);
    const [row]=composeExtensionEntries({pages:[installed]});
    assert.equal(row.installed,true);assert.equal(row.enabled,true);
    assert.equal(row.record.installed,installed,'presentation retains the Authority cleanup diagnostics');
  });
  test(programId+': real authorization and registration restrictions survive cleanup uncertainty',()=>{
    for(const override of [{authorization:{status:'suspended'}},{nativeState:'blocked'},
      {error:{code:'E_REGISTER'}},{nativeState:'unregistered'}]){
      const control=describeInstalledPageControl({...page,programId,...override});
      assert.notEqual(control.state,'ready');
      assert.equal(control.canRestore,true,'cleanup must not prevent the existing restore action');
    }
  });
}

test('queue product readiness ignores old cleanup while preserving original Page diagnostics',async()=>{
  const {tool,pagePackage}=await import('../../projects/ai-send-queue/tests/fixtures/legacy-installation.mjs');
  const {SEND_QUEUE_PIN}=await import('../../src/platform/host/send-queue-admission.js');
  const installed={...page,...pagePackage,authorization:{installationId:'queue-install',generation:1,status:'active'}};
  const before=structuredClone(installed);
  const options={installed:[tool],pages:[installed],queueToolHash:SEND_QUEUE_PIN.toolPackageSha256};
  const rows=composeExtensionEntries(options),app=rows.find(row=>row.kind==='app');
  assert.equal(app.pageCompanion.state,'registered');
  assert.equal(app.queueProduct.state,'ready');
  assert.equal(rows.find(row=>row.kind==='page').record.installed,installed);
  assert.deepEqual(installed,before);
  const restricted=composeExtensionEntries({...options,pages:[{...installed,nativeState:'blocked'}]})
    .find(row=>row.kind==='app');
  assert.equal(restricted.queueProduct.state,'restricted');
});
