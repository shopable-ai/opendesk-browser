// Read-only identity observer around the existing Cookie native UI driver.
// Own fresh profile only; no grants, writes or business API calls from CDP.
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {setTimeout as sleep} from 'node:timers/promises';
import {connect,evaluate} from './sidebar-native-session.mjs';
import {packageFingerprint} from '../../scripts/verify-package.mjs';
import {sidebarToolPackageHash} from '../../src/ui/sidebar-tools/package.js';

const hash=b=>createHash('sha256').update(b).digest('hex');
const root=process.cwd(),driver=path.resolve('tests/framework/cookie-editor-r33-native.mjs');
const extension=path.resolve(process.env.COOKIE_NATIVE_EXTENSION??'');
assert(process.env.COOKIE_NATIVE_EXTENSION&&process.env.COOKIE_NATIVE_CHROME_BIN&&process.env.COOKIE_NATIVE_EVIDENCE);
const directory=path.join(path.resolve(process.env.COOKIE_NATIVE_EVIDENCE),'r106-identity-'+randomUUID());
await mkdir(directory,{recursive:true});
const original=await readFile(driver,'utf8');
// The failed path-delete observation showed a ResizeObserver moving the iframe
// between the hit check and native click. Stabilize coordinates before input;
// never replay an operation or edit the concurrently owned source driver.
const stablePoint=`
  await sleep(150);
  const stable=await read(session,\`(()=>{const n=document.querySelector(\${quote(selector)});if(!n||n.disabled)return null;const r=n.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return n.contains(document.elementFromPoint(x,y))?{x,y}:null;})()\`);
  assert(stable,'Native control moved before input: '+selector);
  const offset=session===toolSession?await read(side,'(()=>{const r=document.querySelector("#sidebar-tool-frame iframe").getBoundingClientRect();return {x:r.x,y:r.y};})()'):{x:0,y:0};
  point.x=stable.x+offset.x;point.y=stable.y+offset.y;
`;
assert(original.includes('  guard();\n  for(const type of'));
const derived=original.replace("const root=fileURLToPath(new URL('../../',import.meta.url));",'const root='+JSON.stringify(root)+';')
  .replace("from './k5-sdk-native-launcher.mjs'",'from '+JSON.stringify(new URL('k5-sdk-native-launcher.mjs',import.meta.url).href))
  .replace("from './sidebar-native-session.mjs'",'from '+JSON.stringify(new URL('sidebar-native-session.mjs',import.meta.url).href))
  .replace('  guard();\n  for(const type of',stablePoint+'\n  guard();\n  for(const type of');
const derivedDriver=path.join(directory,'cookie-native-coordinate-observer.mjs');
await writeFile(derivedDriver,derived);
const receipt={startedAt:new Date().toISOString(),commitSha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  workingStatus:execFileSync('git',['status','--short'],{encoding:'utf8'}),extension,
  extensionPackage:await packageFingerprint(extension),driver:{path:path.relative(root,driver),sha256:hash(original),derivedSha256:hash(derived),coordinateObservation:'Wait 150ms and recompute read-only hit-tested point before one native click; no retries'},
  observations:[],errors:[],status:'RUNNING',scope:'Existing installed Cookie UI driver; supplemental read-only Sender/Document/Install Epoch binding'};
const log=path.join(directory,'driver.log');let output='',finished=false,exitCode,observer;
const child=spawn(process.execPath,[derivedDriver],{cwd:root,env:{...process.env,COOKIE_NATIVE_EVIDENCE:directory},stdio:['ignore','pipe','pipe']});
child.stdout.on('data',b=>{output+=b;const text=b.toString();for(const line of text.split('\n'))if(line.startsWith('COOKIE_NATIVE_'))console.log(line);});
child.stderr.on('data',b=>{output+=b;});
child.on('error',error=>{receipt.errors.push(String(error));finished=true;exitCode=1;});
child.on('close',code=>{exitCode=code;finished=true;});
let last='';
try{
  while(!finished){
    try{
      if(!observer){
        const dirs=(await readdir(directory,{withFileTypes:true})).filter(f=>f.isDirectory()&&f.name.startsWith('native-core-'));
        if(dirs.length===1){
          const nativeDir=path.join(directory,dirs[0].name);
          const meta=JSON.parse(await readFile(path.join(nativeDir,'launcher-cookie-r33-core-verified.json'),'utf8'));
          assert(meta.args.includes('--load-extension='+extension));
          const parent=execFileSync('/bin/ps',['-p',String(meta.launcherPid),'-o','ppid='],{encoding:'utf8'}).trim();
          assert.equal(Number(parent),child.pid,'Observer may only attach to its own child driver');
          observer={meta,client:await connect(meta.endpoint),nativeDir};
          receipt.launcher=meta;
        }
      }
      if(observer){
        const c=observer.client,targets=(await c.send('Target.getTargets')).targetInfos;
        const sw=targets.find(t=>t.type==='service_worker'&&t.url.endsWith('/sw.js'));
        if(sw){
          const {sessionId}=await c.send('Target.attachToTarget',{targetId:sw.targetId,flatten:true});
          try{
            const data=await evaluate(c,`Promise.all([chrome.runtime.getContexts({contextTypes:['SIDE_PANEL']}),chrome.storage.local.get(['opendesk.sidebar-tools.installed.v1','opendesk.sidebar-tools.revocation-epochs.v1','opendesk.browser.context-menu-grants.v1']),chrome.permissions.getAll()]).then(([contexts,r,permissions])=>({contexts,tool:r['opendesk.sidebar-tools.installed.v1']?.find(t=>t.id==='cookie-editor')??null,epoch:r['opendesk.sidebar-tools.revocation-epochs.v1']?.['cookie-editor']??null,grant:r['opendesk.browser.context-menu-grants.v1']?.['cookie-editor']??null,permissions}))`,sessionId);
            const key=hash(JSON.stringify(data));
            if(key!==last){last=key;receipt.observations.push({at:new Date().toISOString(),extensionId:sw.url.split('/')[2],...data,
              toolPackageHash:data.tool?await sidebarToolPackageHash(data.tool):null});}
          }finally{await c.send('Target.detachFromTarget',{sessionId}).catch(()=>{});}
        }
      }
    }catch(error){if(!finished)receipt.errors.push({at:new Date().toISOString(),message:String(error)});}
    await sleep(150);
  }
}finally{
  observer?.client.close();await writeFile(log,output);
  receipt.exitCode=exitCode;receipt.finishedAt=new Date().toISOString();
  receipt.driverUnchanged=hash(await readFile(driver))===receipt.driver.sha256;
  receipt.executedDriverUnchanged=hash(await readFile(derivedDriver))===receipt.driver.derivedSha256;
  receipt.extensionUnchanged=(await packageFingerprint(extension)).packageHash===receipt.extensionPackage.packageHash;
  receipt.identityObserved=receipt.observations.some(x=>x.toolPackageHash&&Object.hasOwn(x,'epoch')&&x.contexts?.some(t=>t.contextType==='SIDE_PANEL'&&t.documentId));
  receipt.status=exitCode===0&&receipt.executedDriverUnchanged&&receipt.extensionUnchanged&&receipt.identityObserved?'PASS':'FAIL_OR_BLOCKED';
  await writeFile(path.join(directory,'identity-report.json'),JSON.stringify(receipt,null,2)+'\n');
  console.log(JSON.stringify({directory,status:receipt.status,identityObserved:receipt.identityObserved,observations:receipt.observations.length,exitCode}));
  if(receipt.status!=='PASS')process.exitCode=1;
}
