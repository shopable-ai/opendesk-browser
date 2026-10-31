import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as contract from '../../src/ui/sidebar-tools/package.js';

const formal=JSON.parse(await readFile('projects/video-speed-controller/video-speed-controller.opendesk-tool.json','utf8'));

test('the packer/importer capability contract identifies the actual supported formats and budgets',async()=>{
  const value=contract.sidebarToolPackageContract();
  assert(value.formats[formal.format].includes('page.videoSpeed'));
  assert(!value.formats[formal.format].includes('browser.proxy.managed'));
  assert(value.formats['opendesk.sidebar-tool.v2'].includes('browser.proxy.managed'));
  const hash=await contract.sidebarToolPackageContractHash();
  assert.match(hash,/^[a-f0-9]{64}$/);
  value.formats[formal.format].push('fake.capability');
  assert.equal(await contract.sidebarToolPackageContractHash(),hash,'callers cannot change supported capabilities');
  assert.equal(contract.validateSidebarToolPackage(formal).version,'1.2.1');
});

test('unknown capabilities remain rejected with a distinct code and no unconditional update advice',()=>{
  assert.throws(()=>contract.validateSidebarToolPackage({...formal,capabilities:['page.notSupported']}),error=>{
    assert.equal(error.code,'E_TOOL_CAPABILITY_UNSUPPORTED');
    assert.match(error.message,/page.notSupported/);
    assert.match(error.message,/格式/);
    assert.doesNotMatch(error.message,/更新.*后重新导入/);
    return true;
  });
});
