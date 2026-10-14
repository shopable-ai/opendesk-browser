import test from 'node:test';
import assert from 'node:assert/strict';
import {describeInstalledAppSource} from '../../src/ui/extension-center-model.js';
import {sidebarToolPackageHash} from '../../src/ui/sidebar-tools/package.js';

const tool={format:'opendesk.sidebar-tool.v1',id:'source-test',version:'1.0.0',
  title:'来源测试',description:'固定包来源',capabilities:[],html:'<p>Test</p>',css:'',js:'void 0;'};

test('installed source uses the original market record only for the same fixed package',async()=>{
  const sha256=await sidebarToolPackageHash(tool);
  const record={marketId:'opendesk/source-test',version:'1.0.0',sha256};
  assert.deepEqual(await describeInstalledAppSource(tool,record),
    {kind:'market',label:'OpenDesk 官方市场 · opendesk/source-test',sha256});
  for(const changed of [{...record,sha256:'0'.repeat(64)},
    {...record,version:'2.0.0'},{...record,marketId:'opendesk/another-tool'}]){
    const source=await describeInstalledAppSource(tool,changed);
    assert.equal(source.kind,'unverified');
    assert.match(source.label,/不一致/);
  }
});

test('local import cannot inherit official identity from matching catalog or package title',async()=>{
  const source=await describeInstalledAppSource(tool);
  assert.equal(source.kind,'local');
  assert.match(source.label,/本地工具包导入/);
  assert.equal(source.sha256,await sidebarToolPackageHash(tool));
});
