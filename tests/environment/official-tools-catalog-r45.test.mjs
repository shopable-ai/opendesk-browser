import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {createOfficialToolResources,buildOfficialTools,officialToolInputs,readOfficialSources}
  from '../../scripts/build-official-tools.mjs';
import {createSidebarToolPackage,buildSidebarTool} from '../../scripts/build-sidebar-tool.mjs';
import {validateOfficialSourceCatalog,validateOfficialReleaseCatalog,OFFICIAL_SOURCE_SCHEMA,
  OFFICIAL_SOURCE_REPOSITORY,OFFICIAL_CATALOG_PATH,officialPackagePath,loadOfficialCatalog,loadOfficialTool,
  officialToolStatus,matchesOfficialRelease} from '../../src/sidebar-tools/official-catalog.js';
import {officialFixtures,officialToolFixture,officialFixtureFetch} from '../helpers/official-tools.mjs';
import {officialMarketApps} from '../../src/marketplace/catalog.js';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const api={runtime:{getURL:path=>'chrome-extension://abcdefghijklmnopabcdefghijklmnop/'+path}};
const spec=id=>({id,project:'examples/sidebar-tools/'+id,kind:'sidebar-tool',installationPolicy:'optional'});
async function fixture(t){
  const root=await mkdtemp(join(tmpdir(),'opendesk-official-r45-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const catalog={schema:OFFICIAL_SOURCE_SCHEMA,sourceRepository:OFFICIAL_SOURCE_REPOSITORY,
    tools:[spec('first-tool'),spec('second-tool')]};
  const config=id=>({id,version:'1.0.0',title:'示例 '+id,description:'离线目录边界',capabilities:['storage.local'],
    files:{html:'src/index.html',css:'src/style.css',js:'src/main.js'},assets:[]});
  const write=async(path,value)=>{await mkdir(dirname(join(root,path)),{recursive:true});await writeFile(join(root,path),value);};
  const save=async()=>write(OFFICIAL_CATALOG_PATH,JSON.stringify(catalog));
  await save();
  for(const row of catalog.tools){
    await write(row.project+'/tool.config.json',JSON.stringify(config(row.id)));
    await write(row.project+'/src/index.html','<main>可选工具</main>');
    await write(row.project+'/src/style.css','main{color:navy}');
    await write(row.project+'/src/main.js','globalThis.__officialToolMustNotRun = true;');
  }
  return {root,catalog,config,write,save};
}
test('R4.8 authored catalog has exactly two default tools and three optional projects',async()=>{
  const source=await readOfficialSources();
  assert.deepEqual(source.tools.map(row=>row.id).sort(),
    ['knowledge-inbox','markdown-workbench','quick-notes','reading-toc','web-markdown-clipper']);
  const policies=Object.fromEntries(source.tools.map(row=>[row.id,row.installationPolicy]));
  assert.deepEqual(policies,{'reading-toc':'preinstalled','web-markdown-clipper':'optional',
    'quick-notes':'preinstalled','markdown-workbench':'optional','knowledge-inbox':'optional'});
  for(const row of source.tools){
    assert(['optional','preinstalled'].includes(row.installationPolicy));
    assert.equal(Object.hasOwn(row,'version'),false);assert.equal(Object.hasOwn(row,'capabilities'),false);
    for(const path of ['src/sidebar-tools/'+row.id+'.opendesk-tool.json',row.project+'/'+row.id+'.opendesk-tool.json'])
      await assert.rejects(access(path),error=>error.code==='ENOENT','official source trees contain no generated package copies');
  }
  assert(!source.tools.some(row=>/starter/.test(row.id)));
});
test('R4.8 only trusted source and exact release policy can authorize preinstalled descriptor',async()=>{
  const source=await readOfficialSources();
  const trusted=validateOfficialSourceCatalog(source);
  assert.equal(trusted.tools.find(row=>row.id==='reading-toc').installationPolicy,'preinstalled');
  const releases=(await officialFixtures()).catalog;
  const validated=validateOfficialReleaseCatalog(releases);
  assert.deepEqual(validated.apps.map(x=>[x.toolId,x.installationPolicy]),
    trusted.tools.map(x=>[x.id,x.installationPolicy]));
  assert.throws(()=>validateOfficialSourceCatalog({...source,sourceRepository:'https://other.example'}));
  assert.throws(()=>validateOfficialReleaseCatalog({...releases,apps:releases.apps.map((row,index)=>
    index===0?{...row,installationPolicy:'automatic'}:row)}));
});
test('R4.8 size-limited Service Worker imports only the lightweight first-install intent',async()=>{
  const sw=await readFile('src/sw.js','utf8');
  const intent=await readFile('src/sidebar-tools/preinstall-intent.js','utf8');
  const host=await readFile('src/ui/sidebar-tools.js','utf8');
  assert.match(sw,/from '.\\/sidebar-tools\\/preinstall-intent\\.js'/);
  assert.doesNotMatch(sw,/default-preinstall\\.js/);
  assert.doesNotMatch(intent,/installation\\.js|official-catalog\\.js|loadOfficialTool/);
  assert.match(host,/from '..\\/sidebar-tools\\/default-preinstall\\.js'/);
});
test('R4.5 exact bytes, versions and capabilities are reproducible from the existing packer',async t=>{
  const a=await officialFixtures(),b=await createOfficialToolResources();
  const out=await mkdtemp(join(tmpdir(),'r45-packer-'));t.after(()=>rm(out,{recursive:true,force:true}));
  assert.deepEqual([...a.resources.keys()],[...b.resources.keys()]);
  for(const release of a.catalog.apps){
    const bytes=a.resources.get(release.packagePath);
    assert.deepEqual(bytes,b.resources.get(release.packagePath));
    assert.equal(bytes.length,release.bytes);assert.equal(hash(bytes),release.sha256);
    const config=JSON.parse(await readFile('examples/sidebar-tools/'+release.toolId+'/tool.config.json','utf8'));
    assert.equal(release.version,config.version);assert.deepEqual(release.capabilities,config.capabilities);
    const report=await buildSidebarTool('examples/sidebar-tools/'+release.toolId,{out:join(out,release.toolId+'.json')});
    assert.equal(report.bytes,bytes.length);
    assert.deepEqual(await readFile(report.output),bytes,'individual import and official distribution share exact bytes');
  }
  assert.deepEqual(a.resources.get(OFFICIAL_CATALOG_PATH),b.resources.get(OFFICIAL_CATALOG_PATH));
});
test('R4.5 adding a source catalog entry supplies release and marketplace without new UI mappings',async t=>{
  const f=await fixture(t),result=await createOfficialToolResources({root:f.root});
  const apps=officialMarketApps(result.catalog);
  assert.deepEqual(apps.map(row=>row.id),['opendesk/first-tool','opendesk/second-tool']);
  assert.equal(apps[0].version,'1.0.0');assert.equal(apps[0].title,'示例 first-tool');
  assert.equal(globalThis.__officialToolMustNotRun,undefined,'building/reading never executes tool JS');
});
test('R4.5 source change updates only its release bytes and catalog, with declared input identity',async t=>{
  const f=await fixture(t),a=await createOfficialToolResources({root:f.root});
  await f.write('examples/sidebar-tools/first-tool/src/main.js','void "新内容";');
  const b=await createOfficialToolResources({root:f.root});
  const changed=[...a.resources].filter(([path,bytes])=>!bytes.equals(b.resources.get(path))).map(([path])=>path);
  assert.deepEqual(changed,[officialPackagePath('first-tool'),OFFICIAL_CATALOG_PATH]);
  const inputs=await officialToolInputs(f.root);
  for(const path of [OFFICIAL_CATALOG_PATH,'examples/sidebar-tools/first-tool/tool.config.json',
    'examples/sidebar-tools/first-tool/src/main.js'])assert(inputs.includes(path));
  assert.notEqual(a.sourceInputs.find(row=>row.path.endsWith('first-tool/src/main.js')).sha256,
    b.sourceInputs.find(row=>row.path.endsWith('first-tool/src/main.js')).sha256);
});
test('R4.5 catalog rejects automatic install, duplicate identity, arbitrary paths and foreign sources',async()=>{
  const base=await readOfficialSources();
  for(const patch of [
    {...base,sourceRepository:'https://untrusted.example/repo'},
    {...base,installed:[]}, {...base,tools:[]}, {...base,tools:[base.tools[0],base.tools[0]]},
    ...['automatic','default','enabled'].map(installationPolicy=>({...base,tools:[{...base.tools[0],installationPolicy}]})),
    ...['../escape','/tmp/source','https://example.com/source','examples/sidebar-tools/../reading-toc',
      'examples\\sidebar-tools\\reading-toc','examples/sidebar-tools/%2e%2e/reading-toc'].map(project=>({...base,tools:[{...base.tools[0],project}]})),
    {...base,tools:[{...base.tools[0],version:'2.0.0'}]}
  ])assert.throws(()=>validateOfficialSourceCatalog(patch));
});
test('R4.5 package config identity mismatch, missing source and invalid JavaScript fail before publication',async t=>{
  const f=await fixture(t),out=join(f.root,'output');
  await buildOfficialTools(out,{root:f.root});
  const before=await readFile(join(out,OFFICIAL_CATALOG_PATH));
  const project=f.catalog.tools[0].project;
  await f.write(project+'/src/main.js','const = broken;');
  await assert.rejects(buildOfficialTools(out,{root:f.root}),/syntax error/);
  assert.deepEqual(await readFile(join(out,OFFICIAL_CATALOG_PATH)),before);
  await f.write(project+'/src/main.js','void 0;');
  await f.write(project+'/tool.config.json',JSON.stringify({...f.config('first-tool'),id:'other-tool'}));
  await assert.rejects(buildOfficialTools(out,{root:f.root}),/ID does not match/);
  await f.write(project+'/tool.config.json',JSON.stringify(f.config('first-tool')));
  await rm(join(f.root,project,'src/index.html'));
  await assert.rejects(buildOfficialTools(out,{root:f.root}));
  assert.deepEqual(await readFile(join(out,OFFICIAL_CATALOG_PATH)),before);
});
test('R4.5 official source and output symlinks cannot escape or write outside the selected root',async t=>{
  const f=await fixture(t),outside=await mkdtemp(join(tmpdir(),'r45-outside-'));
  t.after(()=>rm(outside,{recursive:true,force:true}));
  const file=join(f.root,f.catalog.tools[0].project,'src/main.js');
  await writeFile(join(outside,'external.js'),'void 0;');await rm(file);await symlink(join(outside,'external.js'),file);
  await assert.rejects(createOfficialToolResources({root:f.root}),/symlink escaped/);
  await rm(file);await writeFile(file,'void 0;');
  const out=join(f.root,'output');await mkdir(out);await symlink(outside,join(out,'official-tools'));
  await assert.rejects(buildOfficialTools(out,{root:f.root}),/symlink/);
  await assert.rejects(access(join(outside,'first-tool')));
  const insideLink=join(f.root,f.catalog.tools[0].project,'src/link.js');
  await symlink(file,insideLink);
  await f.write(f.catalog.tools[0].project+'/tool.config.json',JSON.stringify({...f.config('first-tool'),
    files:{...f.config('first-tool').files,js:'src/link.js'}}));
  await assert.rejects(createOfficialToolResources({root:f.root}),/symlink/);
});
test('R4.5 source project and catalog symlinks, oversized catalog and unresolved assets are rejected',async t=>{
  const f=await fixture(t),project=f.catalog.tools[0].project;
  await f.write(project+'/src/index.html','<img src="missing.png">');
  await assert.rejects(createOfficialToolResources({root:f.root}),/must be embedded/);
  await f.write(project+'/src/index.html','<img src=missing.png>');
  await assert.rejects(createOfficialToolResources({root:f.root}),/must be embedded/);
  await f.write(project+'/src/index.html','<main>restored</main>');
  await f.write(OFFICIAL_CATALOG_PATH,' '.repeat(32769));
  await assert.rejects(readOfficialSources(f.root),/bounded/);
  await f.save();
  await f.write('source-copy.json',JSON.stringify(f.catalog));
  await rm(join(f.root,OFFICIAL_CATALOG_PATH));await symlink(join(f.root,'source-copy.json'),join(f.root,OFFICIAL_CATALOG_PATH));
  await assert.rejects(readOfficialSources(f.root),/trusted source/);
});
test('R4.5 removing an optional candidate removes only previously generated resource files',async t=>{
  const f=await fixture(t),out=join(f.root,'output');await buildOfficialTools(out,{root:f.root});
  const keep=join(out,'unrelated-evidence.txt');await writeFile(keep,'keep');
  f.catalog.tools.pop();await f.save();
  await buildOfficialTools(out,{root:f.root});
  await assert.rejects(access(join(out,officialPackagePath('second-tool'))));
  assert.equal(await readFile(keep,'utf8'),'keep');
  assert.equal(JSON.parse(await readFile(join(out,OFFICIAL_CATALOG_PATH),'utf8')).apps.length,1);
});
test('R4.5 runtime fetches only extension-owned bytes; catalog alone has no install or execution effects',async()=>{
  const calls=[],fetcher=async(url,options)=>{calls.push({url,options});return officialFixtureFetch(url);};
  const catalog=await loadOfficialCatalog({api,fetcher});
  assert.equal(calls.length,1);assert(calls[0].url.endsWith('/'+OFFICIAL_CATALOG_PATH));
  assert.equal(calls[0].options.redirect,'error');assert.equal(globalThis.__officialToolMustNotRun,undefined);
  for(const row of catalog.apps){
    const {tool}=await loadOfficialTool(row,{api,fetcher});assert.equal(tool.id,row.toolId);
    assert.equal(await matchesOfficialRelease(row,tool),true);
    const reversed=Object.fromEntries(Object.entries(tool).reverse());
    assert.equal(await matchesOfficialRelease(row,reversed),true,'Chrome key ordering does not erase official identity');
    assert.equal(await matchesOfficialRelease(row,{...tool,js:tool.js+'\nvoid 1;'}),false);
  }
  assert.equal(calls.length,1+catalog.apps.length);
  await assert.rejects(loadOfficialCatalog({api:{runtime:{getURL:()=> 'https://example.com/catalog'}},fetcher}),e=>e.code==='E_PACKAGE_SOURCE');
});
test('R4.5 corrupt, missing, redirected and over-limit resources cannot be reviewed as official',async()=>{
  const {catalog,resources}=await officialFixtures(),release=catalog.apps[0],bytes=resources.get(release.packagePath);
  for(const fetcher of [
    async()=>new Response('missing',{status:404}),
    async()=>new Response(Buffer.concat([bytes,Buffer.from(' ')])),
    async()=>new Response('x'.repeat(320001)),
    async()=>({ok:true,url:'https://untrusted.example/package',arrayBuffer:async()=>bytes}),
    async()=>new Response(bytes,{headers:{'content-length':'320001'}})
  ])await assert.rejects(loadOfficialTool(release,{api,fetcher}));
  await assert.rejects(loadOfficialTool({...release,sha256:'a'.repeat(64)},{api,fetcher:officialFixtureFetch}),e=>e.code==='E_PACKAGE_INTEGRITY');
  await assert.rejects(loadOfficialTool({...release,version:'99.0.0'},{api,fetcher:officialFixtureFetch}),e=>e.code==='E_PACKAGE_IDENTITY');
  await assert.rejects(loadOfficialTool({...release,capabilities:[]},{api,fetcher:officialFixtureFetch}),e=>e.code==='E_PACKAGE_IDENTITY');
  const invalid=Buffer.from([0xff,0xfe]);
  await assert.rejects(loadOfficialTool({...release,bytes:2,sha256:hash(invalid)},
    {api,fetcher:async()=>new Response(invalid)}),e=>e.code==='E_PACKAGE_SCHEMA');
});
test('R4.5 generated catalog rejects forged paths, duplicate releases, persisted user state and policies',async()=>{
  const {catalog}=await officialFixtures(),first=catalog.apps[0];
  for(const app of [{...first,packagePath:'../sw.js'}, {...first,packagePath:'https://example.com/tool.json'},
    {...first,installationPolicy:'default'}, {...first,kind:'page-program'}, {...first,sha256:'bad'},
    {...first,bytes:320001}, {...first,sites:['https://example.com']}])
    assert.throws(()=>validateOfficialReleaseCatalog({...catalog,apps:[app]}));
  assert.throws(()=>validateOfficialReleaseCatalog({...catalog,apps:[first,first]}));
  assert.throws(()=>validateOfficialReleaseCatalog({...catalog,installed:[]}));
});
test('R4.5 all official tools derive availability, update and installed states from the same versions',async()=>{
  const {catalog}=await officialFixtures();
  for(const release of catalog.apps){
    const pkg=await officialToolFixture(release.toolId);
    assert.equal(officialToolStatus(release,[]),'available');
    assert.equal(officialToolStatus(release,[{...pkg,version:'0.0.0'}]),'update');
    assert.equal(officialToolStatus(release,[pkg]),'installed');
    assert.equal(officialToolStatus(release,[{...pkg,version:'999.0.0'}]),'newer');
  }
});

// 1.1.0 was already installable before the real Chrome dirty-state correction.
// The fixed package must be an explicit upgrade, never a same-version mutation.
test('R4.5 knowledge lifecycle correction is an upgrade from the shipped 1.1.0',async()=>{
  const {catalog}=await officialFixtures(),release=catalog.apps.find(row=>row.toolId==='knowledge-inbox');
  const current=await officialToolFixture('knowledge-inbox');
  assert.equal(officialToolStatus(release,[{...current,version:'1.1.0'}]),'update');
});
