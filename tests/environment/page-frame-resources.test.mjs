import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,readFile,writeFile,rm,symlink} from 'node:fs/promises';
import {writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import vm from 'node:vm';
import {PREFIX,PAGE_FRAME_RESOURCES_FORMAT,PAGE_FRAME_RESOURCES_LIMITS,
  inspectPageFrameSource,readPageFrameResources,wrapPageFrameSource} from '../../src/scripting/user-scripts/page-frame-resources.js';
import {createPageBundle,inspectPageSource,validatePageSource} from '../../src/scripting/user-scripts/page-bundle.js';
import {validateProgramProject} from '../../scripts/validate-program-project.mjs';
import {buildProgramProject,buildProgramProjectInMemory,mapProgramGeneratedPosition} from '../../scripts/build-program-project.mjs';
import {validateProgramDraft} from '../../src/ui/program-source.js';

const sha=code=>createHash('sha256').update(code).digest('hex');
const body='async function main(){return 7;}';
const resource=(resourceId='frame',code='globalThis.frameLoaded=true;')=>
  ({resourceId,code,bytes:Buffer.byteLength(code),sha256:sha(code)});
const header=(resources,source=body)=>PREFIX+JSON.stringify({format:PAGE_FRAME_RESOURCES_FORMAT,resources})+'\n'+source;
const frameError={code:'E_PAGE_FRAME_RESOURCES'};

async function project(t){
  const root=await mkdtemp(join(tmpdir(),'opendesk-r396-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(join(root,'src'));
  const pkg={name:'@local/frame-fixture',version:'1.0.0',type:'module',private:true,description:'frame fixture',
    opendesk:{format:'opendesk.project.v1',id:'local.frame-fixture',runtimeKind:'page-userscript',
      sourceFormat:'esm',entry:'src/main.js',pageFrames:[{resourceId:'frame-1',path:'src/frame.js'}],
      pageRules:{matches:['https://example.com/*'],excludeMatches:[],runAt:'document_idle',allFrames:false,world:'USER_SCRIPT'}}};
  const save=()=>writeFile(join(root,'package.json'),JSON.stringify(pkg));
  await save();
  await writeFile(join(root,'src/main.js'),"export default function main(){\n  throw new Error('frame map');\n}\n");
  await writeFile(join(root,'src/frame.js'),'globalThis.frameLoaded=true;');
  return {root,pkg,save};
}

test('frame header preserves the full body and all fixed UTF-8 bytes without executing resources',async()=>{
  assert.equal(PREFIX,'// OpenDesk Page frame resources v1 ');
  assert.deepEqual(PAGE_FRAME_RESOURCES_LIMITS,{count:4,resourceBytes:5*1024*1024,totalBytes:6*1024*1024});
  assert.equal(inspectPageFrameSource(body),null);
  assert.deepEqual(await readPageFrameResources(body),[]);
  const code='globalThis.__r396="汉字\n\r\u2028\u2029";';
  const source=await wrapPageFrameSource(body,[{resourceId:'frame.1',code}]);
  assert.equal(source.split('\n').length,2,'escaped resource newlines stay inside the single comment line');
  assert.doesNotMatch(source.split('\n')[0],/[\r\u2028\u2029]/);
  assert.deepEqual(inspectPageFrameSource(source),{body,resources:[resource('frame.1',code)]});
  assert.deepEqual(await readPageFrameResources(source),[resource('frame.1',code)]);
  assert.equal(await vm.runInNewContext(source+'\nmain()'),7);
  assert.notEqual(sha(source),sha(body));
  assert.equal(inspectPageSource(source).body,body);
});

test('frame inspection rejects unknown schemas, IDs, duplicates, bad bytes and nested or multiline headers',()=>{
  const row=resource();
  const invalid=[
    {...row,resourceId:'_bad'},{...row,resourceId:'a'.repeat(81)},
    {...row,resourceId:'a/b'},{...row,bytes:row.bytes+1},{...row,bytes:0},
    {...row,bytes:1.5},{...row,sha256:'G'.repeat(64)},{...row,url:'https://example.com/frame.js'},
    {...row,code:''},{...row,code:42},
  ];
  for(const value of invalid)assert.throws(()=>inspectPageFrameSource(header([value])),frameError);
  assert.throws(()=>inspectPageFrameSource(header([row,row])),frameError);
  assert.throws(()=>inspectPageFrameSource(header(Array.from({length:5},(_,i)=>resource('r'+i)))),frameError);
  for(const value of [null,{},'resources'])assert.throws(()=>inspectPageFrameSource(header(value)),frameError);
  for(const source of [PREFIX+'{}\n'+body,PREFIX+'{bad}\n'+body,
    PREFIX+JSON.stringify({format:PAGE_FRAME_RESOURCES_FORMAT,resources:[row],extra:1})+'\n'+body,
    header([row]).replace(PAGE_FRAME_RESOURCES_FORMAT,'opendesk.page-frame-resources.v2'),
    header([row]).replace('\n','\r\n'),header([row],header([row])),header([row],' '),
    header([row]).split('\n')[0]])assert.throws(()=>inspectPageFrameSource(source),frameError);
  assert.doesNotThrow(()=>inspectPageFrameSource(header([resource('A'+'a'.repeat(79))])));
  assert.deepEqual(inspectPageFrameSource(header([])).resources,[]);
});

test('only strict typed framed drafts accept the evidence-based 5 MiB / 6 MiB boundary',async()=>{
  const code='/*'+'x'.repeat(5*1024*1024-4)+'*/',tail='/*'+'x'.repeat(1024*1024-4)+'*/';
  const source=await wrapPageFrameSource(body,[{resourceId:'a',code},{resourceId:'b',code:tail}]);
  const draft={format:'opendesk.program-draft.v1',runtimeKind:'page-userscript',
    project:{id:'local.frames',version:'1.0.0',entry:'src/main.js'},
    build:{mode:'production',sourceHash:sha(source),byteLength:Buffer.byteLength(source)},sourceUtf8:source,
    authoring:{files:[{path:'src/main.js',sourceUtf8:'export default function main(){}',sha256:sha('export default function main(){}')}]}};
  assert.equal((await validateProgramDraft(draft)).sourceUtf8,source);
  await assert.rejects(wrapPageFrameSource(body,[{resourceId:'a',code:code+'x'}]),frameError);
  await assert.rejects(wrapPageFrameSource(body,[{resourceId:'a',code},{resourceId:'b',code:tail+'x'}]),frameError);
  const tampered=structuredClone(draft);tampered.sourceUtf8=tampered.sourceUtf8.replace('"sha256":"','"sha256":"0');
  await assert.rejects(validateProgramDraft(tampered),frameError);
  const plain=structuredClone(draft);plain.sourceUtf8='/*'+'x'.repeat(600000)+'*/'+body;
  plain.build={...plain.build,sourceHash:sha(plain.sourceUtf8),byteLength:Buffer.byteLength(plain.sourceUtf8)};
  await assert.rejects(validateProgramDraft(plain),{code:'E_LIMIT'});
  const oversizedBody=structuredClone(draft);oversizedBody.sourceUtf8=await wrapPageFrameSource(body+' '.repeat(100000),[resource()]);
  oversizedBody.build={...oversizedBody.build,sourceHash:sha(oversizedBody.sourceUtf8),byteLength:Buffer.byteLength(oversizedBody.sourceUtf8)};
  await assert.rejects(validateProgramDraft(oversizedBody),{code:'E_SOURCE'});
  await assert.rejects(wrapPageFrameSource(header([]),[]),frameError);
});

test('read and Page validation verify every resource SHA, while inspection remains synchronous',async()=>{
  const rows=[resource('a'),resource('b','globalThis.b=1;')];
  rows[1].code=rows[1].code.replace('1','2');
  const source=header(rows);
  assert.equal(inspectPageFrameSource(source).resources.length,2);
  await assert.rejects(readPageFrameResources(source),{code:'E_PAGE_FRAME_RESOURCE_HASH'});
  await assert.rejects(validatePageSource(source),{code:'E_PAGE_FRAME_RESOURCE_HASH'});
  const changed=await wrapPageFrameSource(body,[{resourceId:'b',code:rows[1].code}]);
  assert.notEqual(sha(changed),sha(await wrapPageFrameSource(body,[resource('b','globalThis.b=1;')])));
});

test('outer frames preserve plain body budgets and cannot bypass linked byte or SHA validation',async()=>{
  const url='https://library.example.com/v1/index.js',remoteCode='export default 7;';
  const pin={url,bytes:Buffer.byteLength(remoteCode),sha256:sha(remoteCode)};
  const linked=await createPageBundle(body,{remoteModules:[pin],remoteImports:[url],remoteLock:{fixture:true}});
  const framed=await wrapPageFrameSource(linked,[resource()]);
  const verified=await validatePageSource(framed);
  assert.equal(verified.linked,body);
  assert.equal(verified.body,linked);
  assert.deepEqual(verified.descriptor,inspectPageSource(linked).descriptor);
  await assert.rejects(validatePageSource(framed.replace('return 7','return 8')),{code:'E_PAGE_BUNDLE_HASH'});
  await assert.rejects(validatePageSource(framed+'x'),{code:'E_PAGE_BUNDLE'});
  const large=await wrapPageFrameSource(body+' '.repeat(128*1024),[resource()]);
  assert.throws(()=>inspectPageSource(large),{code:'E_SOURCE'});
  const small=await wrapPageFrameSource(body,[resource()]);
  assert.throws(()=>inspectPageSource(small,{plainLimit:Buffer.byteLength(body)-1}),{code:'E_SOURCE'});
  await assert.rejects(createPageBundle(framed,{remoteModules:[pin],remoteImports:[url],remoteLock:{fixture:true}}),{code:'E_PAGE_BUNDLE'});
});

test('project validation accepts only bounded local precompiled .js frame resources',async t=>{
  const {root,pkg,save}=await project(t),valid=structuredClone(pkg.opendesk);
  const checked=await validateProgramProject(root);
  assert.deepEqual(checked.pageFrames,[{path:'src/frame.js',...resource('frame-1')}]);
  for(const frames of [null,{},[{resourceId:'bad/id',path:'src/frame.js'}],
    [{resourceId:'f',path:'src/frame.js',extra:true}],
    [{resourceId:'f',path:'src/frame.js'},{resourceId:'f',path:'src/main.js'}],
    [{resourceId:'f',path:'src/frame.js'},{resourceId:'g',path:'src/frame.js'}],
    [{resourceId:'f',path:'src/frame.mjs'}],[{resourceId:'f',path:'src/main.js'}],
    Array.from({length:5},(_,i)=>({resourceId:'f'+i,path:'src/f'+i+'.js'}))]){
    pkg.opendesk={...valid,pageFrames:frames};await save();
    await assert.rejects(validateProgramProject(root),{code:'E_PROJECT_PAGE_FRAME'});
  }
  for(const path of ['../escape.js','/tmp/escape.js','src/../frame.js','node_modules/frame.js','src\\frame.js']){
    pkg.opendesk={...valid,pageFrames:[{resourceId:'f',path}]};await save();
    await assert.rejects(validateProgramProject(root),{code:'E_PROJECT_PATH'});
  }
  pkg.opendesk={...valid,runtimeKind:'controller'};await save();
  await assert.rejects(validateProgramProject(root),{code:'E_PROJECT_SCHEMA'});
  pkg.opendesk=valid;await save();
  for(const code of ["import x from './missing.js';",'export default 1;',"import('./missing.js');","require('dep');"]){
    await writeFile(join(root,'src/frame.js'),code);
    await assert.rejects(validateProgramProject(root),error=>['E_PROJECT_SYNTAX','E_PROJECT_DYNAMIC_IMPORT'].includes(error.code));
  }
  await writeFile(join(root,'src/frame.js'),Buffer.from([0xff]));
  await assert.rejects(validateProgramProject(root),{code:'E_PROJECT_ENCODING'});
  await writeFile(join(root,'src/frame.js'),'x'.repeat(PAGE_FRAME_RESOURCES_LIMITS.resourceBytes+1));
  await assert.rejects(validateProgramProject(root),{code:'E_PROJECT_LIMIT'});
  const outside=await mkdtemp(join(tmpdir(),'opendesk-r396-outside-'));
  t.after(()=>rm(outside,{recursive:true,force:true}));
  await writeFile(join(outside,'outside.js'),'globalThis.outside=true;');
  await symlink(join(outside,'outside.js'),join(root,'src/outside.js'));
  pkg.opendesk.pageFrames=[{resourceId:'f',path:'src/outside.js'}];await save();
  await assert.rejects(validateProgramProject(root),{code:'E_PROJECT_SYMLINK'});
});

test('existing Program builder freezes frames in sourceHash and keeps draft format, body and source maps',async t=>{
  const {root}=await project(t),out=join(root,'output');
  const built=await buildProgramProject(root,{outputDirectory:out});
  const source=await readFile(join(out,'program.js'),'utf8');
  assert.equal(built.sourceHash,sha(source));
  assert.equal(built.sourceBytes,Buffer.byteLength(source));
  const {code,...pin}=resource('frame-1');
  assert.deepEqual(built.pageFrames,[{path:'src/frame.js',...pin}]);
  assert.deepEqual(built.npmDependencies,[]);
  assert.deepEqual(built.npmBundledModules,[]);
  assert.ok(built.authoring.webpackModules.every(path=>!path.includes('frame.js')),'frame code is not compiled into the Page body');
  assert.doesNotMatch(inspectPageFrameSource(source).body,/frameLoaded|sourceMappingURL/);
  assert.deepEqual(await readPageFrameResources(source),[resource('frame-1')]);
  const draft=JSON.parse(await readFile(join(out,'program.opendesk-draft.json'),'utf8'));
  assert.equal(draft.format,'opendesk.program-draft.v1');
  assert.equal((await validateProgramDraft(draft)).sourceUtf8,source);
  const dev=await buildProgramProjectInMemory(root,{mode:'development'});
  const index=dev.sourceUtf8.indexOf("throw new Error('frame map')");
  assert.ok(index>0);
  const prefix=dev.sourceUtf8.slice(0,index),line=prefix.split('\n').length,column=prefix.length-prefix.lastIndexOf('\n')-1;
  const mapped=mapProgramGeneratedPosition(dev.sourceMapUtf8,{line,column});
  assert.ok(mapped.source.endsWith('/src/main.js'));
  assert.equal(mapped.line,2);
  await writeFile(join(root,'src/frame.js'),'globalThis.frameLoaded=false;');
  const next=await buildProgramProjectInMemory(root);
  assert.notEqual(next.sourceHash,built.sourceHash);
  assert.equal(inspectPageFrameSource(next.sourceUtf8).body,inspectPageFrameSource(source).body);
});

test('frame input changes during compilation reject the build before artifact writes',async t=>{
  const {root}=await project(t);
  await assert.rejects(buildProgramProjectInMemory(root,{
    onCompile:()=>writeFileSync(join(root,'src/frame.js'),'globalThis.frameLoaded=false;')
  }),{code:'E_PROJECT_CHANGED'});
});

test('public project schema exposes pageFrames only on Page projects',async()=>{
  const schema=JSON.parse(await readFile('schemas/opendesk-program-project.v1.schema.json','utf8'));
  const frames=schema.$defs.page.allOf[1].properties.pageFrames;
  assert.equal(frames.maxItems,4);
  assert.equal(frames.items.additionalProperties,false);
  assert.deepEqual(frames.items.required,['resourceId','path']);
  const pattern=new RegExp(frames.items.properties.resourceId.pattern);
  assert.ok(pattern.test('Frame-1.test'));
  assert.ok(!pattern.test('_bad'));
  assert.equal(schema.$defs.controller.allOf[1].properties.pageFrames,undefined);
});
