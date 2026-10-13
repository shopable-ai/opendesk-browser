import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import {execFileSync} from 'node:child_process';
import {launchChrome} from '../../../../../tests/framework/k5-sdk-native-launcher.mjs';
import {connect,evaluate} from '../../../../../tests/framework/sidebar-native-session.mjs';
const root='/Users/shopme/Documents/workspace/opendesk-browser';
const dir=path.join(root,'docs/framework/workstreams/evidence/browser-sdk-r106-20261014/bookmarks-get-platform-probe');
await mkdir(dir,{recursive:true});
const fixture=path.join(dir,'readonly-fixture');await mkdir(fixture,{recursive:true});
const files={'manifest.json':JSON.stringify({manifest_version:3,name:'OpenDesk read-only bookmark error probe',version:'0.0.1',permissions:['bookmarks'],background:{service_worker:'worker.js'}},null,2)+'\n','worker.js':'// Read-only platform observer fixture; no mutations or SDK runtime.\n','probe.html':'<!doctype html><meta charset="utf-8"><title>Read-only bookmark probe</title>\n'};
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
for(const [name,bytes] of Object.entries(files))await writeFile(path.join(fixture,name),bytes);
const inputs=await Promise.all(Object.keys(files).sort().map(async name=>({path:name,sha256:digest(await readFile(path.join(fixture,name)))})));
let launched,client;const receipt={scope:'READ_ONLY_CHROME_PLATFORM_BEHAVIOR_NOT_SDK_ACCEPTANCE',status:'NOT_OBSERVED',formalNativePass:0,commitSha:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),fixtureInputs:inputs,fixturePackageHash:digest(JSON.stringify(inputs)),toolPackageHash:null,installEpoch:null,note:'Isolated fixture grants required permission through its test manifest. This does not prove installed-tool optional permission consent or the SDK external-deletion flow.'};
try{
 launched=await launchChrome({root,binary:path.join(root,'tests/.cache/m5-browsers/155.0.8059.39/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'),extension:fixture,headed:false,directory:dir,label:'readonly-bookmarks'});
 receipt.launcher=launched.metadata;
 client=await connect(launched.endpoint);receipt.chromeVersion=await client.send('Browser.getVersion');
 let worker;
 for(let n=0;n<100&&!worker;n++){worker=(await client.send('Target.getTargets')).targetInfos.find(t=>t.type==='service_worker'&&t.url.endsWith('/worker.js'));if(!worker)await sleep(100);}
 assert(worker,'Real probe extension worker missing');
 const session=(await client.send('Target.attachToTarget',{targetId:worker.targetId,flatten:true})).sessionId;
 await client.send('Runtime.enable',{},session);
 receipt.actualExtensionId=await evaluate(client,'chrome.runtime.id',session);
 assert.equal(receipt.actualExtensionId,worker.url.split('/')[2]);
 const target=await client.send('Target.createTarget',{url:'chrome-extension://'+receipt.actualExtensionId+'/probe.html'});
 const pageSession=(await client.send('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId;
 await client.send('Runtime.enable',{},pageSession);
 for(let n=0;n<50;n++){if(await evaluate(client,'document.readyState==="complete"',pageSession))break;await sleep(100);}
 receipt.context=await evaluate(client,'(async()=>({url:location.href,extensionId:chrome.runtime.id,contexts:await chrome.runtime.getContexts({}),permissions:await chrome.permissions.getAll()}))()',pageSession);
 receipt.requests=[];
 for(const id of ['2147483647','not-a-native-id']){
  const request={method:'chrome.bookmarks.get',id,readOnly:true,startedAt:new Date().toISOString()};
  const result=await evaluate(client,'(async()=>{try{return {resolved:true,nodes:await chrome.bookmarks.get('+JSON.stringify(id)+')}}catch(error){return {resolved:false,error:{name:error.name,message:error.message}}}})()',pageSession);
  receipt.requests.push({...request,result,finishedAt:new Date().toISOString()});
 }
 assert(receipt.requests.every(x=>x.result.resolved===false),'Fresh isolated profile unexpectedly contained probe IDs');
 receipt.status='OBSERVED_PLATFORM_BEHAVIOR';
} catch(error){receipt.error={name:error.name,message:error.message};process.exitCode=1;}
finally{
 client?.close();
 if(launched){await launched.copyLog();receipt.cleanup=await launched.stop();}
 await writeFile(path.join(dir,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
 console.log(JSON.stringify({status:receipt.status,extensionId:receipt.actualExtensionId,chrome:receipt.chromeVersion?.product,requests:receipt.requests,error:receipt.error,formalNativePass:0}));
}
