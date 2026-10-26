import test from 'node:test';
import assert from 'node:assert/strict';
import {setInstalledPageProgramEnabled} from '../../src/ui/installed-page-tools.js';

test('R15 unified Page toggle and suspended restore carry the selected installation identity',async()=>{
  for(const status of ['active','disabled','suspended']){
    const installed={manifestHash:'a'.repeat(64),enabled:status!=='disabled',
      pageRules:{matches:['https://example.com/*']},
      authorization:{installationId:'selected-installation',generation:7,status}};
    const calls=[],checks=[];
    await setInstalledPageProgramEnabled({row:{programId:'script',manifestHash:installed.manifestHash,installed},
      api:{permissions:{contains:async request=>{checks.push(request);return true;}}},
      client:{request:async(method,request)=>{calls.push({method,request});return {};}}});
    assert.deepEqual(calls,[{method:'setInstalledPageEnabled',request:{programId:'script',
      manifestHash:installed.manifestHash,installationId:'selected-installation',
      expectedGeneration:7,enabled:status!=='active'}}]);
    assert.equal(checks.length,status==='active'?0:1);
  }
});

test('R15 unified Page enable still rejects missing Chrome permission before writing',async()=>{
  let writes=0;
  const installed={manifestHash:'a'.repeat(64),enabled:false,
    pageRules:{matches:['https://example.com/*']},
    authorization:{installationId:'selected-installation',generation:7,status:'disabled'}};
  await assert.rejects(setInstalledPageProgramEnabled({
    row:{programId:'script',manifestHash:installed.manifestHash,installed},
    api:{permissions:{contains:async()=>false}},client:{request:async()=>{writes++;}}}),{code:'E_PERMISSION'});
  assert.equal(writes,0);
});
