import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,access,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {buildMarketSite} from '../../scripts/build-market-site.mjs';
import {createSidebarToolPackage,encodeSidebarToolPackage} from '../../scripts/build-sidebar-tool.mjs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function project(root,name,version,js='void 0;',id='market-independent'){
  const path=join(root,name);await mkdir(path);
  await writeFile(join(path,'tool.config.json'),JSON.stringify({id,version,
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
    const outputBefore=await outputIdentity(output);
    await assert.rejects(buildMarketSite({env,projects:[v1,conflict]}),/Immutable release conflict/);
    await assert.rejects(buildMarketSite({env,projects:[conflict]}),/Immutable release conflict/);
    assert.deepEqual(await outputIdentity(output),outputBefore,'cross-build conflicts preserve every previous output byte');
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

async function outputIdentity(root,prefix=''){
  const rows=[];
  for(const entry of await readdir(join(root,prefix),{withFileTypes:true})){
    const path=join(prefix,entry.name);
    if(entry.isDirectory())rows.push(...await outputIdentity(root,path));
    else rows.push([path,hash(await readFile(join(root,path)))]);
  }
  return rows.sort(([a],[b])=>a.localeCompare(b));
}

test('successive publications retain independent tools and fixed versions without resupplying projects',async()=>{
  const root=await mkdtemp(join(tmpdir(),'market-retained-'));
  try{
    const output=join(root,'site'),env={OPENDESK_MARKET_SITE_OUTPUT:output};
    const v1=await project(root,'v1','1.0.0'),v2=await project(root,'v2','1.1.0');
    const other=await project(root,'other','2.0.0','void 0;','market-other');
    await buildMarketSite({env,projects:[v1,other]});
    const otherOriginal=await readFile(join(output,'releases/opendesk/market-other/2.0.0/package.opendesk-tool.json'));
    const original=await readFile(join(output,'releases/opendesk/market-independent/1.0.0/package.opendesk-tool.json'));
    await buildMarketSite({env,projects:[v2]});
    await rm(v1,{recursive:true});await rm(v2,{recursive:true});await rm(other,{recursive:true});
    const last=await buildMarketSite({env});
    const catalog=JSON.parse(await readFile(join(output,'catalog.json')));
    assert(catalog.recommended.some(row=>row.id==='opendesk/market-other'&&row.version==='2.0.0'));
    assert.deepEqual(await readFile(join(output,'releases/opendesk/market-other/2.0.0/package.opendesk-tool.json')),otherOriginal);
    await access(join(output,'apps/opendesk/market-other/index.html'));
    assert(catalog.recommended.some(row=>row.id==='opendesk/market-independent'&&row.version==='1.1.0'));
    assert.match(await readFile(join(output,'index.html'),'utf8'),/Independent market app/);
    assert.match(await readFile(join(output,'apps/opendesk/market-independent/index.html'),'utf8'),/1\.1\.0/);
    for(const version of ['1.0.0','1.1.0']){
      const descriptor=catalog.downloads.find(row=>row.marketId==='opendesk/market-independent'&&row.version===version);
      assert(descriptor);
      const bytes=await readFile(join(output,descriptor.packagePath.slice(1)));
      assert.equal(hash(bytes),descriptor.sha256);
      if(version==='1.0.0')assert.deepEqual(bytes,original);
      await access(join(output,'apps/opendesk/market-independent/versions',version,'index.html'));
      await access(join(output,'install/opendesk/market-independent/versions',version,'index.html'));
    }
    assert.equal((await buildMarketSite({env})).buildId,last.buildId,'retained-only rebuild is deterministic');
  }finally{await rm(root,{recursive:true,force:true});}
});

test('prior build, descriptor, catalog, and actual package corruption fail without replacing output',async()=>{
  const root=await mkdtemp(join(tmpdir(),'market-integrity-'));
  try{
    const output=join(root,'site'),env={OPENDESK_MARKET_SITE_OUTPUT:output};
    const v1=await project(root,'v1','1.0.0');
    await buildMarketSite({env,projects:[v1]});
    const base='releases/opendesk/market-independent/1.0.0/';
    const originals=new Map(await Promise.all(['site-build.json','catalog.json',base+'descriptor.json',base+'package.opendesk-tool.json']
      .map(async path=>[path,await readFile(join(output,path))])));
    for(const [path,mutate,resign] of [
      ['site-build.json',value=>{value.buildId='0'.repeat(64);},false],
      [base+'package.opendesk-tool.json',value=>{value.js='console.log("corrupt");';},false],
      [base+'package.opendesk-tool.json',value=>{value.js='console.log("corrupt");';},true],
      [base+'descriptor.json',value=>{value.version='9.9.9';},true],
      ['catalog.json',value=>{value.releases.find(row=>row.id==='opendesk/market-independent').toolId='other-tool';},true],
      ['catalog.json',value=>{value.downloads=value.downloads.filter(row=>row.marketId!=='opendesk/market-independent');},true]
    ]){
      for(const [file,bytes] of originals)await writeFile(join(output,file),bytes);
      const value=JSON.parse(originals.get(path));mutate(value);
      const bytes=Buffer.from(JSON.stringify(value));await writeFile(join(output,path),bytes);
      if(resign){
        const manifest=JSON.parse(originals.get('site-build.json'));
        const row=manifest.files.find(row=>row.path===path);row.bytes=bytes.length;row.sha256=hash(bytes);
        delete manifest.buildId;manifest.buildId=hash(JSON.stringify(manifest));
        await writeFile(join(output,'site-build.json'),JSON.stringify(manifest));
      }
      const before=await outputIdentity(output);
      await assert.rejects(buildMarketSite({env,projects:[v1]}));
      assert.deepEqual(await outputIdentity(output),before,'failed integrity check preserves output: '+path);
      assert.deepEqual((await readdir(root)).sort(),['site','v1'],'no staging or backup leftovers');
    }
  }finally{await rm(root,{recursive:true,force:true});}
});
