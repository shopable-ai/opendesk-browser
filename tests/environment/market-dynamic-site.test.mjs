import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {buildMarketSite} from '../../scripts/build-market-site.mjs';
import {createSidebarToolPackage,encodeSidebarToolPackage} from '../../scripts/build-sidebar-tool.mjs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function project(root,name,version,js='void 0;'){
  const path=join(root,name);await mkdir(path);
  await writeFile(join(path,'tool.config.json'),JSON.stringify({id:'market-independent',version,
    title:'Independent market app',description:'Only distributed by the market site.',capabilities:[],
    files:{html:'index.html',css:'style.css',js:'main.js'}}));
  await writeFile(join(path,'index.html'),'<main>Independent market app</main>');
  await writeFile(join(path,'style.css'),'');await writeFile(join(path,'main.js'),js);
  return path;
}

test('independent releases use canonical downloadable bytes, list normally, and reject fixed-version conflicts',async()=>{
  const root=await mkdtemp(join(tmpdir(),'market-dynamic-'));
  try{
    const output=join(root,'site'),env={OPENDESK_MARKET_SITE_OUTPUT:output,OPENDESK_MARKET_BUILD_MODE:'development'};
    const v1=await project(root,'v1','1.0.0'),v2=await project(root,'v2','1.1.0');
    const officialBefore=await readFile('official-tools/catalog.json');
    assert(!JSON.parse(officialBefore).tools.some(row=>row.id==='market-independent'));
    const first=await buildMarketSite({env,projects:[v1,v2]});
    const second=await buildMarketSite({env,projects:[v2,v1]});
    assert.equal(first.buildId,second.buildId,'project ordering does not affect output');
    const catalog=JSON.parse(await readFile(join(output,'catalog.json')));
    assert(catalog.recommended.some(row=>row.id==='opendesk/market-independent'&&row.version==='1.1.0'));
    assert.match(await readFile(join(output,'index.html'),'utf8'),/Independent market app/);
    assert.match(await readFile(join(output,'apps/opendesk/market-independent/index.html'),'utf8'),/1\.1\.0/);
    for(const path of [v1,v2]){
      const expected=encodeSidebarToolPackage(await createSidebarToolPackage(path)),pkg=JSON.parse(expected);
      const base='/releases/opendesk/market-independent/'+pkg.version+'/';
      const descriptor=JSON.parse(await readFile(join(output,base.slice(1),'descriptor.json')));
      assert.deepEqual(descriptor,{schema:'opendesk.market.release.v1',marketId:'opendesk/market-independent',
        version:pkg.version,bytes:expected.length,sha256:hash(expected),packagePath:base+'package.opendesk-tool.json'});
      assert.deepEqual(await readFile(join(output,descriptor.packagePath.slice(1))),expected);
      assert.match(await readFile(join(output,'apps/opendesk/market-independent/versions',pkg.version,'index.html'),'utf8'),/Independent market app/);
    }
    for(const descriptor of catalog.downloads){
      const bytes=await readFile(join(output,descriptor.packagePath.slice(1)));
      assert.equal(bytes.length,descriptor.bytes);assert.equal(hash(bytes),descriptor.sha256);
    }
    assert(catalog.downloads.some(row=>row.marketId==='opendesk/quick-notes'),'current official packages are downloadable');
    assert(catalog.unavailableReleases.length>0,'metadata-only history remains explicit');
    for(const row of catalog.unavailableReleases)
      await assert.rejects(access(join(output,'releases',row.id,row.version,'descriptor.json')),{code:'ENOENT'});
    const manifest=JSON.parse(await readFile(join(output,'site-build.json')));
    assert.equal(manifest.projectPackages.length,2);
    const conflict=await project(root,'conflict','1.0.0','console.log("changed");');
    await assert.rejects(buildMarketSite({env,projects:[v1,conflict]}),/Immutable release conflict/);
    assert.equal(JSON.parse(await readFile(join(output,'site-build.json'))).buildId,second.buildId,'failed builds preserve output');
    assert.deepEqual(await readFile('official-tools/catalog.json'),officialBefore);
    // CLI uses the same API and packer, with no extension build involved.
    execFileSync(process.execPath,['scripts/build-market-site.mjs'],{env:{...process.env,...env,
      OPENDESK_MARKET_SITE_OUTPUT:join(root,'cli'),OPENDESK_MARKET_PROJECTS:JSON.stringify([v2])}});
    await access(join(root,'cli/releases/opendesk/market-independent/1.1.0/descriptor.json'));
    await assert.rejects(buildMarketSite({env,projects:'not-an-array'}),/Market projects must be an array/);
    await assert.rejects(buildMarketSite({env:{...env,OPENDESK_MARKET_SITE_OUTPUT:v1},projects:[v1]}),/project input/);
  }finally{await rm(root,{recursive:true,force:true});}
});
