// Audits the CURRENT source-matched local Program candidate, not a Chrome installation.
// Run immediately after: npm run build:program -- examples/programs/chatgpt-mindmap
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFile,readdir,stat,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const repo=resolve(fileURLToPath(new URL('../../../../',import.meta.url)));
const project=join(repo,'examples/programs/chatgpt-mindmap');
const pkg=JSON.parse(await readFile(join(project,'package.json'),'utf8'));
const id=pkg.opendesk.id;
assert.equal(id,'opendesk.chatgpt-mindmap');
assert.equal(pkg.opendesk.runtimeKind,'page-userscript');
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const outputRoot=join(repo,'artifacts/programs',id,pkg.version,'r31-production');
const candidates=await readdir(outputRoot,{withFileTypes:true}).then(rows=>
  rows.filter(row=>row.isDirectory()).map(row=>join(outputRoot,row.name)));
const found=[];
for(const dir of candidates){
  try{
    const [source,artifactBytes,draftBytes]=await Promise.all([
      readFile(join(dir,'program.js')),
      readFile(join(dir,'artifact.json')),
      readFile(join(dir,'program.opendesk-draft.json'))
    ]);
    const artifact=JSON.parse(artifactBytes.toString('utf8'));
    const draft=JSON.parse(draftBytes.toString('utf8'));
    if(artifact.programId!==id||artifact.version!==pkg.version||
       artifact.runtimeKind!=='page-userscript'||artifact.status!=='BUILT_UNVERIFIED'||
       artifact.installable!==false||artifact.buildMode!=='production')continue;
    const actualHash=sha256(source);
    assert.equal(artifact.sourceHash,actualHash);
    assert.equal(artifact.buildHash,actualHash);
    assert.equal(artifact.sourceBytes,source.length);
    assert.equal(draft.build.sourceHash,actualHash);
    assert.equal(Buffer.byteLength(draft.sourceUtf8,'utf8'),source.length);
    assert.equal(draft.sourceUtf8,source.toString('utf8'));
    assert.ok(Array.isArray(artifact.sourceFiles)&&artifact.sourceFiles.length>0);
    // Reject stale candidates even when they contain internally consistent files.
    let matchesCurrentSource=true;
    for(const row of artifact.sourceFiles){
      const now=await readFile(join(project,row.path));
      if(now.length!==row.bytes||sha256(now)!==row.sha256){
        matchesCurrentSource=false;break;
      }
    }
    if(!matchesCurrentSource)continue;
    const dated=await stat(join(dir,'artifact.json'));
    found.push({dir,dated:dated.mtimeMs,source,artifact,draftBytes,artifactBytes});
  }catch(error){
    if(error.code==='ENOENT')continue;
    throw error;
  }
}
if(!found.length)throw Error('E_XMIND_CURRENT_BUILD_CANDIDATE_MISSING_OR_STALE');
found.sort((a,b)=>b.dated-a.dated);
const row=found[0];
const gitSha=execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim();
const audit={
  scope:'LOCAL_BUILD_CANDIDATE_ONLY',gitSha,programId:id,version:pkg.version,
  runtimeKind:row.artifact.runtimeKind,status:row.artifact.status,
  installable:row.artifact.installable,sourceFreshness:'MATCHES_CURRENT_PROJECT_SOURCE',
  absoluteOutputDirectory:row.dir,
  files:{
    'program.js':sha256(row.source),
    'program.opendesk-draft.json':sha256(row.draftBytes),
    'artifact.json':sha256(row.artifactBytes)
  },
  sourceBytes:row.source.length,
  sourceHash:row.artifact.sourceHash,
  buildHash:row.artifact.buildHash,
  browserDistInclusion:'NOT_TESTED',
  chromeNativeInstalled:'NOT_TESTED',
  xmindProductionRuntime:'BLOCKED_E_XMIND_RUNTIME_UNAVAILABLE',
  note:'Matching source/build Hash is not runtime verification or native installation.'
};
const arg=process.argv.indexOf('--out');
const path=arg>=0?resolve(process.argv[arg+1]):join(row.dir,'build-audit.json');
await mkdir(dirname(path),{recursive:true});
await writeFile(path,JSON.stringify(audit,null,2)+'\n');
console.log('PROGRAM_BUILD_CANDIDATE_AUDIT '+JSON.stringify(audit));
