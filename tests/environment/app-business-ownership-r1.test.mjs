import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';

const file=path=>new URL('../../'+path,import.meta.url);
const read=path=>readFileSync(file(path),'utf8');
const business={
  'stay-focus':['blocked.js','catalog.js','host-controls.js','lifecycle.js','model.js','page-notice.js','policy.js','rule-host.js','rule-ownership.js','service.js','tool-host.js'],
  'time-review':['host-controls.js','model.js','policy.js','service.js','sync-outbox.js','sync-transport.js','trusted-admission.js','trusted-native-ui.js'],
  'ai-smart-access':['host-controls.js','lifecycle.js','policy.js','provider-config.js','service.js','tool-host.js']
};

test('R1 app-owned trusted business has one implementation and no src re-export layer',()=>{
  for(const [id,files] of Object.entries(business)){
    assert.equal(existsSync(file('src/'+id)),false,'obsolete src folder must be absent: '+id);
    const app=id==='ai-smart-access'?'ai-vip-share':id;
    for(const name of files)assert.ok(read('examples/sidebar-tools/'+app+'/trusted/'+name).length>80,id+'/'+name);
    const config=JSON.parse(read('examples/sidebar-tools/'+app+'/tool.config.json'));
    assert.equal(config.id,app);
    assert.deepEqual(Object.keys(config.files).sort(),['css','html','js']);
    assert.doesNotMatch(JSON.stringify(config.files),/trusted/,'privileged modules must not ship as sandbox UI files');
  }
});

test('R1 approved fixed runtime entrypoints use app-owned sources and existing Host',()=>{
  const sw=read('src/sw.js');
  assert.ok(sw.includes("examples/sidebar-tools/stay-focus/trusted/service.js"));
  assert.ok(sw.includes("importScripts('time-review/time-review-host.js')"));
  assert.ok(read('src/entrypoints/time-review-host.js').includes('examples/sidebar-tools/time-review/trusted/service.js'));
  assert.ok(read('src/ui/sidebar-tools.js').includes('examples/sidebar-tools/time-review/trusted/host-controls.js'));
  assert.ok(read('src/ui/sidebar-tools/installation.js').includes('examples/sidebar-tools/time-review/trusted/model.js'));
  assert.ok(sw.includes('examples/sidebar-tools/ai-vip-share/trusted/service.js'));
  const sidebarHost=read('src/entrypoints/sidebar-tool-host.js');
  assert.ok(sidebarHost.includes('examples/sidebar-tools/time-review/trusted/trusted-native-ui.js'));
  assert.ok(sidebarHost.includes('examples/sidebar-tools/ai-vip-share/trusted/tool-host.js'));
});
