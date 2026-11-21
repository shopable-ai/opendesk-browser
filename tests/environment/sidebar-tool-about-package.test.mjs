import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createSidebarToolPackage,encodeSidebarToolPackage} from '../../scripts/build-sidebar-tool.mjs';
import {SIDEBAR_TOOL_FORMAT,SIDEBAR_TOOL_FORMAT_V2,SIDEBAR_TOOL_STORE,sidebarToolPackageHash}
  from '../../src/ui/sidebar-tools/package.js';
import {getInstalledSidebarTools,installReviewedSidebarTool,TOOL_REVOCATION_EPOCHS_STORE}
  from '../../src/ui/sidebar-tools/installation.js';
import {BROWSER_MENU_GRANTS_STORE} from '../../src/framework/sdk/browser-contract.js';

const meta={id:'about-fixture',version:'1.0.0',title:'About fixture',description:'Sidebar package metadata',
  capabilities:['storage.local'],files:{html:'view.html',css:'view.css',js:'view.js'}};
const about={author:'  测试作者 <Team>  ',homepage:' HTTPS://Example.com:443/Ab?x=1 ',supportUrl:'invalid	URL'};
const variants=[
  [SIDEBAR_TOOL_FORMAT,{},'94ac4b23d557878ca3def4874d41c2a5b441c0f0e63e2e57877a2e14e9851221'],
  [SIDEBAR_TOOL_FORMAT_V2,{format:SIDEBAR_TOOL_FORMAT_V2,requires:{browserSdk:'1.0.0'},contributes:{contextMenus:[]}},
    'a301a43f258cae1d6c0ab6162ab8006b5e23f3d965dd59b8fb3e4dc423085c60']
];

for(const [format,extra,legacyHash] of variants){
  test(format+' preserves About bytes through build, review, and reload',async t=>{
    const dir=await mkdtemp(join(tmpdir(),'opendesk-sidebar-about-'));
    t.after(()=>rm(dir,{recursive:true,force:true}));
    await Promise.all(Object.entries({'view.html':'<main>Ready</main>','view.css':'','view.js':'void 0;'})
      .map(([name,content])=>writeFile(join(dir,name),content)));
    const build=async changes=>{
      await writeFile(join(dir,'tool.config.json'),JSON.stringify({...meta,...extra,...changes}));
      return JSON.parse(encodeSidebarToolPackage(await createSidebarToolPackage(dir)));
    };
    const legacy=await build({});
    assert.equal(legacy.format,format);
    for(const key of Object.keys(about))assert.equal(Object.hasOwn(legacy,key),false);
    assert.equal(createHash('sha256').update(encodeSidebarToolPackage(legacy)).digest('hex'),legacyHash);
    const initial={
      [SIDEBAR_TOOL_STORE]:[legacy],
      [TOOL_REVOCATION_EPOCHS_STORE]:{[meta.id]:'legacy-epoch'},
      [BROWSER_MENU_GRANTS_STORE]:{[meta.id]:{version:legacy.version,packageHash:legacyHash,installEpoch:'legacy-epoch'}}
    };
    let storage=JSON.stringify(initial),writes=0;
    const api={storage:{local:{
      async get(keys){const rows=JSON.parse(storage);return Object.fromEntries([keys].flat().map(key=>[key,rows[key]]));},
      async set(rows){writes++;storage=JSON.stringify({...JSON.parse(storage),...rows});},
      async remove(keys){const rows=JSON.parse(storage);writes++;for(const key of [keys].flat())delete rows[key];storage=JSON.stringify(rows);}
    }}};
    const install=(candidate,baseline)=>installReviewedSidebarTool({api,reviewApproved:true,
      lockManager:{request:async(_name,work)=>work()},candidate,baseline});
    assert.equal(await sidebarToolPackageHash((await getInstalledSidebarTools(api))[0]),legacyHash);
    assert.equal((await install(legacy,legacy)).state,'already-installed');
    assert.equal(writes,0);
    assert.deepEqual(JSON.parse(storage),initial);

    const without=await build({version:'1.0.1'});
    const candidate=await build({version:'1.0.1',...about});
    assert.deepEqual(candidate,{...without,...about});
    assert.notEqual(await sidebarToolPackageHash(candidate),await sidebarToolPackageHash(without));
    assert.equal((await install(candidate,legacy)).state,'installed');
    assert.deepEqual(await getInstalledSidebarTools(api),[candidate]);
    assert.equal(await sidebarToolPackageHash((await getInstalledSidebarTools(api))[0]),await sidebarToolPackageHash(candidate));

    const blank=await build({version:'1.0.2',supportUrl:'  '});
    assert.equal(blank.supportUrl,'  ');
    assert.equal((await install(blank,candidate)).state,'installed');
    assert.deepEqual(await getInstalledSidebarTools(api),[blank]);
    for(const key of ['author','homepage'])assert.equal(Object.hasOwn((await getInstalledSidebarTools(api))[0],key),false);

    const bounded={author:'a'.repeat(160),homepage:'x'.repeat(2048),supportUrl:'y'.repeat(2048)};
    assert.deepEqual(await build(bounded),{...legacy,...bounded});
    for(const [key,value] of Object.entries(bounded)){
      await assert.rejects(build({[key]:value+'x'}),{code:'E_TOOL_LIMIT'});
      await assert.rejects(build({[key]:null}),{code:'E_TOOL_LIMIT'});
    }
    await assert.rejects(build({publisher:'OpenDesk'}),/E_TOOL_BUILD/);
  });
}
