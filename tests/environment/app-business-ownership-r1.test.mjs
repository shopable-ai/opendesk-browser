import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync,readdirSync} from 'node:fs';
import {resolve,dirname,relative} from 'node:path';
import {describeBundle} from '../../scripts/bundle-provenance.mjs';

const file=path=>new URL('../../'+path,import.meta.url);
const read=path=>readFileSync(file(path),'utf8');
const business={
  'stay-focus':['blocked.js','catalog.js','host-controls.js','lifecycle.js','model.js','page-notice.js','policy.js','rule-host.js','rule-ownership.js','service.js','tool-host.js'],
  'time-review':['host-controls.js','model.js','policy.js','service.js','sync-outbox.js','sync-transport.js','trusted-admission.js','trusted-native-ui.js'],
  'ai-smart-access':['host-controls.js','lifecycle.js','policy.js','provider-config.js','service.js','tool-host.js'],
  'page-clip':['convert.js','page.js','policy.js'],
  'reading-toc':['model.js','overview.js','placement.js','page.js','view.js','policy.js','locales.generated.js']
};

test('R1 app-owned trusted business has one implementation and no src re-export layer',()=>{
  for(const [id,files] of Object.entries(business)){
    assert.equal(existsSync(file('src/'+id)),false,'obsolete src folder must be absent: '+id);
    const app=id==='ai-smart-access'?'ai-vip-share':id==='page-clip'?'web-markdown-clipper':id;
    for(const name of files)assert.ok(read('examples/sidebar-tools/'+app+'/trusted/'+name).length>80,id+'/'+name);
    const config=JSON.parse(read('examples/sidebar-tools/'+app+'/tool.config.json'));
    assert.equal(config.id,app);
    assert.deepEqual(Object.keys(config.files).sort(),['css','html','js']);
    assert.doesNotMatch(JSON.stringify(config.files),/trusted/,'privileged modules must not ship as sandbox UI files');
  }
});

test('R1.3 fixed bundle accepts only audited app-owned blobs in approved Chrome entrypoints',()=>{
  const approved=[
    ['examples/sidebar-tools/web-markdown-clipper/trusted/page.js','agents/page-relay.js'],
    ['examples/sidebar-tools/web-markdown-clipper/trusted/convert.js','agents/page-relay.js'],
    ['examples/sidebar-tools/web-markdown-clipper/trusted/policy.js','ui/marketplace.js'],
    ['examples/sidebar-tools/reading-toc/trusted/page.js','agents/page-relay.js'],
    ['examples/sidebar-tools/reading-toc/trusted/view.js','agents/page-relay.js'],
    ['examples/sidebar-tools/reading-toc/trusted/policy.js','ui/marketplace.js'],
    ['examples/sidebar-tools/reading-toc/trusted/locales.generated.js','ui/tool-shell.js']
  ];
  const check=(name,target)=>describeBundle({chunk:{fileName:target,modules:{
    [resolve(process.cwd(),name)]:{renderedLength:1,originalLength:1}
  }},root:process.cwd(),lock:{packages:{}}});
  for(const [name,target] of approved){
    assert.match(check(name,target).modules[0].reviewedFirstPartyBlob,/^[a-f0-9]{40}$/);
    assert.throws(()=>check(name,'scripting/packaged/page-session.js'),
      /Historical\/user\/vendor/,name+' cannot enter an unreviewed executable world');
  }
  assert.throws(()=>check('examples/sidebar-tools/reading-toc/src/main.js','agents/page-relay.js'),
    /Historical\/user\/vendor/,'arbitrary packaged plugin JavaScript cannot be compiled as trusted');
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

test('R1.3 page clip plugin owns trusted page, policy and converter, with shared browser site grants',()=>{
  assert.equal(existsSync(file('src/page-clip')),false);
  assert.equal(existsSync(file('src/reading-toc')),false);
  const entry=read('src/entrypoints/page-relay.js');
  assert.match(entry,/reading-toc\/trusted\/page\.js/);
  assert.match(entry,/web-markdown-clipper\/trusted\/page\.js/);
  const policy=read('examples/sidebar-tools/web-markdown-clipper/trusted/policy.js');
  assert.doesNotMatch(policy,/reading-toc/);
  assert.match(policy,/site-grants\.js/);
  assert.equal(read('src/ui/sidebar-tools/site-grants.js').includes('changeSiteGrant'),true);
});

test('R1.1 fixed Time Review executable WXT entry is the actual package contract',()=>{
  const contract=read('scripts/build-contract.mjs');
  assert.match(contract,/'time-review\/time-review-host': '\.\/src\/entrypoints\/time-review-host\.js'/);
  const entry=read('src/entrypoints/time-review-host.js');
  assert.match(entry,/defineUnlistedScript\(\(\)=>installTimeReviewService\(\)\)/);
  assert.match(entry,/examples\/sidebar-tools\/time-review\/trusted\/service\.js/);
  assert.match(read('src/sw.js'),/importScripts\('time-review\/time-review-host\.js'\)/);
});

test('R1.1 source modules no longer import removed application-owned src directories',()=>{
  const dead=new Set(['src/stay-focus','src/time-review','src/ai-smart-access','src/page-clip','src/reading-toc']);
  const roots=['src','scripts'];
  function walk(folder){
    for(const item of readdirSync(folder,{withFileTypes:true})){
      const path=resolve(folder,item.name);
      if(item.isSymbolicLink())throw Error('Unexpected symlink in audited source: '+path);
      if(item.isDirectory()){walk(path);continue;}
      if(!/\.(?:js|mjs|cjs)$/.test(path))continue;
      const source=readFileSync(path,'utf8');
      // Validate actual literal import/export/require specifiers, not comments
      // about the migration or user-authored strings in installed packages.
      for(const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s*)['"]([^'"]+)['"]/g)){
        const spec=match[1];
        if(!spec.startsWith('.'))continue;
        const dest=relative(process.cwd(),resolve(dirname(path),spec)).replaceAll('\\','/');
        const obsolete=[...dead].find(root=>dest===root||dest.startsWith(root+'/'));
        assert.equal(obsolete,undefined,
          'obsolete app-owned source import in '+relative(process.cwd(),path)+': '+spec);
      }
    }
  }
  roots.forEach(walk);
});
