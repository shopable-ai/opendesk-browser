import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {buildProgramProject,mapProgramGeneratedPosition} from '../../scripts/build-program-project.mjs';

const remoteIndexURL='https://cdn.example.org/r101/index.mjs';
const remoteMathURL='https://cdn.example.org/r101/math.mjs';
const remoteIndexSource='export {remoteLabel} from "./math.mjs";\n';
const remoteMathSource=[
  'export function remoteLabel(value){',
  '  const remoteColumnAnchor = "remote-r101-anchor";',
  '  return remoteColumnAnchor + ":" + value;',
  '}',
  ''
].join('\n');
const npmModuleSource=[
  'export function npmLabel(value){',
  '  const npmColumnAnchor = "npm-r101-anchor";',
  '  return npmColumnAnchor + ":" + value;',
  '}',
  ''
].join('\n');
const localMainSource=[
  "import {npmLabel} from 'r101-map-pkg';",
  `import {remoteLabel} from ${JSON.stringify(remoteIndexURL)};`,
  'const LOCAL_COLUMN_ANCHOR = "local-r101-anchor";',
  'export default async function main(){',
  '  const localValue = LOCAL_COLUMN_ANCHOR;',
  '  const remoteValue = remoteLabel("remote");',
  '  const npmValue = npmLabel("npm");',
  '  return {localValue, remoteValue, npmValue};',
  '}',
  ''
].join('\n');

function generatedPosition(source,needle){
  const index=source.indexOf(needle);
  assert.notEqual(index,-1,needle);
  const prefix=source.slice(0,index);
  const line=prefix.split('\n').length;
  const column=prefix.length-prefix.lastIndexOf('\n')-1;
  return {line,column};
}

async function writeFixture(root){
  await mkdir(join(root,'src'),{recursive:true});
  await mkdir(join(root,'node_modules/r101-map-pkg'),{recursive:true});
  const pkg={
    name:'@opendesk-examples/r101-source-map-mixed',
    version:'0.1.0',
    private:true,
    type:'module',
    description:'R101 Source Map mixed npm and HTTPS fixture',
    dependencies:{'r101-map-pkg':'1.0.0'},
    opendesk:{
      format:'opendesk.project.v1',
      id:'test.r101-source-map-mixed',
      runtimeKind:'page-userscript',
      sourceFormat:'esm',
      entry:'src/main.js',
      pageRules:{
        matches:['https://example.com/*'],
        excludeMatches:[],
        runAt:'document_idle',
        allFrames:false,
        world:'USER_SCRIPT'
      }
    }
  };
  await writeFile(join(root,'package.json'),JSON.stringify(pkg,null,2));
  await writeFile(join(root,'package-lock.json'),JSON.stringify({
    name:pkg.name,
    version:pkg.version,
    lockfileVersion:3,
    requires:true,
    packages:{
      '':{name:pkg.name,version:pkg.version,dependencies:pkg.dependencies},
      'node_modules/r101-map-pkg':{
        version:'1.0.0',
        resolved:'https://registry.npmjs.org/r101-map-pkg/-/r101-map-pkg-1.0.0.tgz',
        integrity:'sha512-'+Buffer.alloc(64).toString('base64'),
        license:'MIT',
        type:'module'
      }
    }
  },null,2));
  await writeFile(join(root,'node_modules/r101-map-pkg/package.json'),JSON.stringify({
    name:'r101-map-pkg',
    version:'1.0.0',
    type:'module',
    exports:'./index.mjs'
  },null,2));
  await writeFile(join(root,'node_modules/r101-map-pkg/index.mjs'),npmModuleSource);
  await writeFile(join(root,'src/main.js'),localMainSource);
}

test('R101 development source maps preserve mixed local npm and HTTPS re-export provenance',async t=>{
  const root=await mkdtemp(join(tmpdir(),'opendesk-r101-source-map-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  await writeFixture(root);
  const remoteSources=new Map([
    [remoteIndexURL,remoteIndexSource],
    [remoteMathURL,remoteMathSource]
  ]);
  const fetchImpl=async url=>{
    assert.ok(remoteSources.has(url),url);
    return new Response(remoteSources.get(url),{
      status:200,
      headers:{'content-type':'text/javascript'}
    });
  };

  const out=join(root,'dist');
  const result=await buildProgramProject(root,{
    outputDirectory:out,
    mode:'development',
    lockRemote:true,
    fetchImpl
  });
  assert.equal(result.sourceMapFile,'program.js.map');
  assert.deepEqual(result.npmBundledModules,['node_modules/r101-map-pkg/index.mjs']);
  assert.deepEqual(result.remoteModules.map(row=>row.url),[remoteIndexURL,remoteMathURL]);

  const program=await readFile(join(out,'program.js'),'utf8');
  const sourceMapUtf8=await readFile(join(out,'program.js.map'),'utf8');
  const map=JSON.parse(sourceMapUtf8);
  const sourceContentByName=new Map(map.sources.map((source,index)=>[source,map.sourcesContent[index]]));
  assert.equal(map.file,'program.js');
  assert.equal(sourceContentByName.get(remoteIndexURL),remoteIndexSource);
  assert.equal(sourceContentByName.get(remoteMathURL),remoteMathSource);
  assert.equal(
    sourceContentByName.get('webpack://__opendeskProjectModule/node_modules/r101-map-pkg/index.mjs'),
    npmModuleSource
  );
  assert.equal(
    sourceContentByName.get('webpack://__opendeskProjectModule/src/main.js'),
    localMainSource
  );
  assert.ok(map.sources.every(source=>!source.includes('.opendesk/remote-build/')),map.sources.join('\n'));

  assert.deepEqual(
    mapProgramGeneratedPosition(sourceMapUtf8,generatedPosition(program,'local-r101-anchor')),
    {
      source:'webpack://__opendeskProjectModule/src/main.js',
      line:3,
      column:0,
      name:null
    }
  );
  assert.deepEqual(
    mapProgramGeneratedPosition(sourceMapUtf8,generatedPosition(program,'npm-r101-anchor')),
    {
      source:'webpack://__opendeskProjectModule/node_modules/r101-map-pkg/index.mjs',
      line:2,
      column:0,
      name:null
    }
  );
  assert.deepEqual(
    mapProgramGeneratedPosition(sourceMapUtf8,generatedPosition(program,'remote-r101-anchor')),
    {
      source:remoteMathURL,
      line:2,
      column:0,
      name:null
    }
  );
});
