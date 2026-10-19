// Generic, low-privilege Sidebar App CI. No App IDs, Chrome grants or release credentials here.
// App-specific test declarations live beside each App, not in GitHub Actions YAML.
import {readFile,readdir,realpath,stat,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join,dirname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createSidebarToolPackage,encodeSidebarToolPackage} from './build-sidebar-tool.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const APPS=join(ROOT,'examples/sidebar-tools');
const SHA=value=>createHash('sha256').update(value).digest('hex');
const BASE_TESTS=[
  'tests/environment/tool-stage.test.mjs',
  'tests/environment/sidebar-tool-multiscript-r72.test.mjs',
  'tests/environment/sidebar-tool-enable-r26.test.mjs',
  'tests/environment/browser-cleanup-lifecycle.test.mjs'
];
const fail=message=>{throw Error('E_APP_CI: '+message);};
const has=async p=>stat(p).then(x=>x.isFile()).catch(()=>false);
const safeName=name=>typeof name==='string'&&/^[a-z0-9][a-z0-9-]{0,63}$/.test(name);
function run(command,args,env={}){
  const result=spawnSync(command,args,{cwd:ROOT,env:{...process.env,...env},
    stdio:'inherit',timeout:30*60*1000});
  if(result.error)throw result.error;
  if(result.status!==0)fail(command+' '+args.join(' ')+' failed: '+String(result.status??result.signal));
}
function capture(command,args){
  const result=spawnSync(command,args,{cwd:ROOT,encoding:'utf8',timeout:30000});
  if(result.status!==0)fail('git operation failed: '+result.stderr);
  return result.stdout.trim();
}
async function sourcePath(name,where){
  if(typeof name!=='string'||name.length>240||!name||
     !/^[a-zA-Z0-9][a-zA-Z0-9_./-]*$/.test(name)||
     name.split('/').some(segment=>!segment||segment==='.'||segment==='..'))
    fail('unsafe '+where+' path '+String(name));
  const target=resolve(ROOT,name);
  if(!target.startsWith(ROOT+sep))fail('path escaped checkout');
  if(await realpath(target)!==target||(await stat(target)).isFile()!==true)
    fail('symlink or missing '+where+' file '+name);
  return target;
}
async function projects(){
  const found=[];
  for(const row of await readdir(APPS,{withFileTypes:true})){
    if(!row.isDirectory()||!safeName(row.name))continue;
    if(await has(join(APPS,row.name,'tool.config.json')))found.push(row.name);
  }
  return found.sort();
}
function arr(value,label){
  if(!Array.isArray(value)||value.length>100||new Set(value).size!==value.length||
     value.some(x=>typeof x!=='string'))fail('invalid '+label+' tests');
  return value;
}
async function load(name){
  if(!safeName(name)||!(await has(join(APPS,name,'tool.config.json'))))
    fail('unknown App directory: '+String(name));
  const dir=join(APPS,name),meta=JSON.parse(await readFile(join(dir,'tool.config.json'),'utf8'));
  if(!safeName(meta.id)||typeof meta.version!=='string')
    fail('invalid App identity: '+name);
  const file=join(dir,'app.ci.json');
  const declared=await has(file);
  const profile=declared?JSON.parse(await readFile(file,'utf8')):{schema:'opendesk.app-ci.v1',kind:'ui'};
  if(profile?.schema!=='opendesk.app-ci.v1'||
     !['ui','react','react-candidate','page','dnr','background'].includes(profile.kind)||
     Object.keys(profile).some(k=>!['schema','kind','build','afterBuild','node','browser','native','host','extraCandidate'].includes(k)))
    fail('invalid App CI profile '+name);
  const node=arr(profile.node||[],name+'.node');
  const browser=arr(profile.browser||[],name+'.browser');
  const native=profile.native||null;
  if(profile.host!==undefined&&!['production','development'].includes(profile.host))
    fail('invalid host compatibility mode');
  if(profile.build!==undefined && profile.build!=='auto'&&
     !(typeof profile.build==='string'&&profile.build.startsWith('node:')))
    fail('unsupported compiler; use pinned npm build or audited Node entry');
  arr(profile.afterBuild||[],name+'.afterBuild');
  if(profile.afterBuild?.length>3)fail('too many afterBuild scripts');
  if(profile.extraCandidate!==undefined&&
     (typeof profile.extraCandidate!=='string'||!profile.extraCandidate.startsWith('artifacts/sidebar-tools/')))
    fail('extra candidate must stay in artifacts/sidebar-tools');
  if(native!==null){
    if(!native||typeof native!=='object'||Array.isArray(native)||
       Object.keys(native).some(k=>!['tests','verifier','receipt','env'].includes(k))||
       !arr(native.tests||[],'native.tests').length||!profile.host)fail('invalid native suite');
    if(native.env!==undefined&&(!native.env||typeof native.env!=='object'||
      Object.entries(native.env).some(([key,value])=>!/^OPENDESK_[A-Z0-9_]+$/.test(key)||
        typeof value!=='string'||value.length>160)))fail('invalid native environment');
    if(native.receipt&&!/^artifacts\/[a-zA-Z0-9/_-]+\.json$/.test(native.receipt))
      fail('invalid native receipt');
    if(native.verifier&&!native.receipt)fail('native verifier needs real receipt');
  }
  const caps=meta.capabilities||[];
  if(!Array.isArray(caps))fail('invalid capabilities');
  if(caps.includes('adblock.control')&&(profile.kind!=='dnr'||!native?.verifier||!browser.length))
    fail('DNR capability requires real Chrome, native receipt verifier and DNR suite');
  if(caps.includes('page.toc')&&(profile.kind!=='page'||!native))
    fail('page TOC requires page/installed Chrome suite');
  if(caps.some(x=>/^browser\.cookies\./.test(x))&&!declared)
    fail('cookie privileges require an explicit test profile');
  if(meta.uiRuntime==='opendesk.react-ui.v1'&&!declared)
    fail('React App requires an explicit browser test profile');
  if(profile.kind==='react'&&!browser.length)fail('React installed UI requires browser tests');
  if(profile.kind==='dnr'&&!native)fail('DNR must not silently skip native');
  if(profile.kind==='react-candidate'&&!profile.extraCandidate)
    fail('candidate-only UI must declare its staged artifact');
  for(const file of node){
    if(!(file.startsWith('tests/environment/')||file.startsWith('examples/sidebar-tools/'+name+'/'))||
      !file.endsWith('.test.mjs'))fail('Node test outside approved source namespace');
    await sourcePath(file,'Node test');
  }
  for(const file of browser){
    if(!(file.startsWith('tests/framework/')||file.startsWith('scripts/tests/')||
      file.startsWith('examples/sidebar-tools/'+name+'/'))||!file.endsWith('.mjs'))
      fail('Chrome test outside approved source namespace');
    await sourcePath(file,'Chrome test');
  }
  for(const file of native?.tests||[]){
    if(!file.startsWith('tests/framework/')||!file.endsWith('.test.mjs'))
      fail('macOS native test outside framework');
    await sourcePath(file,'native test');
  }
  if(native?.verifier)await sourcePath(native.verifier,'native verifier');
  if(typeof profile.build==='string'&&profile.build.startsWith('node:'))
    await sourcePath(profile.build.slice(5),'compiler');
  for(const file of profile.afterBuild||[])await sourcePath(file,'afterBuild');
  return {name,dir,meta,profile,declared};
}
async function plan(){
  const names=await projects(),selected=process.env.APP_CI_SELECTED||'';
  let wanted=[];
  if(selected){
    wanted=selected==='all'?names:selected.split(',').map(x=>x.trim());
    if(wanted.length!==new Set(wanted).size||wanted.some(x=>!names.includes(x)))
      fail('invalid dispatch selection: '+selected);
  }else if(process.env.GITHUB_EVENT_NAME==='workflow_dispatch'){
    wanted=names;
  }else{
    const base=process.env.APP_CI_BASE,head=process.env.GITHUB_SHA;
    if(!/^[0-9a-f]{40}$/.test(head||''))fail('missing reviewed Git head');
    const changed=!base||/^0{40}$/.test(base)?['scripts/app-ci.mjs']:
      capture('git',['diff','--name-only',base,head,'--']).split('\n').filter(Boolean);
    // A changed SDK, packer, test harness, or Host affects all App candidates.
    const shared=changed.some(p=>p.startsWith('src/')||
      p.startsWith('tests/')||p.startsWith('scripts/')||
      p.startsWith('.github/workflows/app-ci')||p.startsWith('official-tools/')||
      p==='package.json'||p==='package-lock.json'||p==='wxt.config.mjs');
    wanted=shared?names:names.filter(name=>changed.some(p=>
      p.startsWith('examples/sidebar-tools/'+name+'/')&&!p.endsWith('.opendesk-tool.json')));
  }
  if(wanted.length>200)fail('GitHub matrix budget exceeded: select explicit batches; do not silently skip');
  for(const name of wanted)await load(name);
  const native=[];
  for(const name of wanted)if((await load(name)).profile.native)native.push(name);
  const output={
    apps:JSON.stringify(wanted),native:JSON.stringify(native),
    has_apps:String(wanted.length>0),has_native:String(native.length>0)};
  if(process.env.GITHUB_OUTPUT)
    await writeFile(process.env.GITHUB_OUTPUT,
      Object.entries(output).map(([k,v])=>k+'='+v).join('\n')+'\n',{flag:'a'});
  console.log(JSON.stringify({status:'APP_CI_PLAN',selected:wanted,native,reason:selected?'dispatch':'changed-sources'}));
}
async function inspect(name){
  const x=await load(name);
  const output={chrome:String(x.profile.browser?.length>0),native:String(Boolean(x.profile.native))};
  if(process.env.GITHUB_OUTPUT)
    await writeFile(process.env.GITHUB_OUTPUT,
      Object.entries(output).map(([k,v])=>k+'='+v).join('\n')+'\n',{flag:'a'});
  console.log(JSON.stringify({app:name,...output,kind:x.profile.kind}));
}
async function build(name){
  const x=await load(name);
  // Some React previews consume pinned host assets while compiling, not afterwards.
  if(x.profile.host==='development')run('npm',['run','build:dev']);
  if(x.profile.build?.startsWith('node:'))run(process.execPath,[x.profile.build.slice(5)]);
  else if(await has(join(x.dir,'package.json'))){
    const pkg=JSON.parse(await readFile(join(x.dir,'package.json'),'utf8'));
    if(pkg.scripts?.build){
      // Locked project-local Vue/React dependencies may not exist in root npm ci.
      // Installation hooks are disabled; builds run only in read-only CI jobs.
      if(await has(join(x.dir,'package-lock.json')))
        run('npm',['ci','--prefix','examples/sidebar-tools/'+name,
          '--ignore-scripts','--no-audit','--no-fund']);
      run('npm',['run','build','--prefix','examples/sidebar-tools/'+name]);
    }
    else if(x.meta.uiRuntime==='opendesk.react-ui.v1')fail('missing React compiler');
  }
  for(const script of x.profile.afterBuild||[])run(process.execPath,[script]);
  const out='artifacts/app-ci/'+name+'/candidate.opendesk-tool.json';
  const {buildSidebarTool}=await import('./build-sidebar-tool.mjs');
  await buildSidebarTool(x.dir,{out});
  const bytes=await readFile(resolve(ROOT,out));
  const pkg=createSidebarToolPackage?await createSidebarToolPackage(x.dir):null;
  if(!bytes.equals(encodeSidebarToolPackage(pkg))||
     pkg.id!==x.meta.id||pkg.version!==x.meta.version)
    fail('candidate identity or canonical source mismatch');
  const extra=x.profile.extraCandidate?JSON.parse(await readFile(
    await sourcePath(x.profile.extraCandidate,'React candidate'),'utf8')):null;
  if(extra&&extra.id!==pkg.id)fail('React candidate cannot change App identity');
  if(x.profile.host==='production')run('npm',['run','build']);
  if(x.profile.host==='production'){
    const official=await readFile(resolve(ROOT,
      'dist/production/official-tools/'+pkg.id+'/'+pkg.id+'.opendesk-tool.json'));
    if(!bytes.equals(official))fail('host official package and standalone candidate differ');
  }
  const head=process.env.GITHUB_SHA||capture('git',['rev-parse','HEAD']);
  if(!/^[0-9a-f]{40}$/.test(head))fail('invalid source commit identity');
  const receipt={schema:'opendesk.app-ci-candidate.v1',sourceCommit:head,
    project:'examples/sidebar-tools/'+name,id:pkg.id,version:pkg.version,
    capabilities:pkg.capabilities,sha256:SHA(bytes),bytes:bytes.length,
    output:out,kind:x.profile.kind,status:'BUILT_NOT_TESTED_NOT_RELEASED',
    ...(extra?{extraCandidate:{version:extra.version,sha256:SHA(await readFile(
      resolve(ROOT,x.profile.extraCandidate))),path:x.profile.extraCandidate,
      officialUnchanged:true}}:{})};
  await mkdir(dirname(resolve(ROOT,out)),{recursive:true});
  await writeFile(resolve(ROOT,'artifacts/app-ci/'+name+'/candidate-receipt.json'),
    JSON.stringify(receipt,null,2)+'\n');
  console.log(JSON.stringify(receipt));
}
async function checkCandidate(name){
  const x=await load(name);
  const receipt=JSON.parse(await readFile(resolve(ROOT,
    'artifacts/app-ci/'+name+'/candidate-receipt.json'),'utf8'));
  const bytes=await readFile(resolve(ROOT,'artifacts/app-ci/'+name+'/candidate.opendesk-tool.json'));
  const canonical=encodeSidebarToolPackage(await createSidebarToolPackage(x.dir));
  if(!bytes.equals(canonical)||SHA(bytes)!==receipt.sha256||
     receipt.id!==x.meta.id||receipt.version!==x.meta.version||
     receipt.sourceCommit!==(process.env.GITHUB_SHA||capture('git',['rev-parse','HEAD'])))
    fail('candidate/source/commit drift');
  if(receipt.extraCandidate){
    const bytes=await readFile(resolve(ROOT,receipt.extraCandidate.path));
    if(SHA(bytes)!==receipt.extraCandidate.sha256)fail('React candidate drift');
  }
  console.log(JSON.stringify({status:'CANDIDATE_SOURCE_IDENTICAL',app:name,
    version:receipt.version,sha256:receipt.sha256}));
}
async function testNode(name){
  const x=await load(name);
  run(process.execPath,['--test','--test-concurrency=1',...BASE_TESTS,...(x.profile.node||[])]);
  await checkCandidate(name);
}
async function testBrowser(name){
  const x=await load(name);
  if(!x.profile.browser?.length)return console.log('CHROME_NOT_REQUIRED '+name);
  if(!process.env.CHROME_BIN)fail('real Chrome binary absent; never claim a browser PASS');
  for(const file of x.profile.browser){
    const artifact='artifacts/app-ci/'+name+'/chrome';
    await mkdir(resolve(ROOT,artifact),{recursive:true});
    run(process.execPath,
      file.endsWith('.test.mjs')?['--test',file]:[file,artifact]);
  }
  await checkCandidate(name);
}
async function testNative(name){
  const x=await load(name),native=x.profile.native;
  if(!native)fail('no declared native suite for '+name);
  if(!process.env.CHROME_BIN)fail('real macOS Chrome missing');
  if(process.platform!=='darwin')fail('native macOS acceptance must run on macOS');
  const env=native.env||{};
  for(const file of native.tests)run(process.execPath,['--test',file],env);
  if(native.verifier){
    const evidence=await sourcePath(native.receipt,'real Chrome receipt');
    run(process.execPath,[native.verifier,evidence,'dist/'+x.profile.host,
      process.env.GITHUB_SHA||capture('git',['rev-parse','HEAD'])]);
  }
  await checkCandidate(name);
}
const [mode,name]=process.argv.slice(2);
try{
  if(mode==='plan')await plan();
  else if(mode==='inspect')await inspect(name);
  else if(mode==='build')await build(name);
  else if(mode==='node')await testNode(name);
  else if(mode==='browser')await testBrowser(name);
  else if(mode==='native')await testNative(name);
  else fail('use plan | inspect | build | node | browser | native');
}catch(error){console.error(String(error.stack||error));process.exitCode=1;}
