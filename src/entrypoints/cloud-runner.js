import {defineUnlistedScript} from 'wxt/utils/define-unlisted-script';
import {CLOUD_RUNNER_DOCUMENT_PATH} from '../tool-document-url.js';
import {createHostClient} from '../platform/host/client.js';
import {createRunHost} from '../run-host.js';
import {createCloudRunnerLoop} from '../cloud-control/runner.js';
import {WEB_TASK_PROTOCOL} from '../page-events/web-task-contract.js';

export default defineUnlistedScript(async()=>{
  const expected=chrome.runtime.getURL(CLOUD_RUNNER_DOCUMENT_PATH);
  if(location.href!==expected)throw Error('E_CLOUD_RUNNER_IDENTITY');
  // Offscreen documents expose messaging, not runtime.getContexts(). The
  // existing SW broker checks the live OFFSCREEN_DOCUMENT sender before
  // registering this Host or granting cloud execution capabilities.
  const client=createHostClient(chrome);
  const host=createRunHost({api:chrome,client,document,templateModuleFactory:null});
  const stopOwned=(message,sender,reply)=>{
    if(message?.protocol!==WEB_TASK_PROTOCOL||message.kind!=='stop-owned'||sender?.id!==chrome.runtime.id||sender.tab||
      sender.url!==undefined&&sender.url!==chrome.runtime.getURL('sw.js'))return false;
    host.cancelStart(message.requestId);
    Promise.resolve().then(()=>message.runId&&host.currentRun===message.runId?
      host.stop({controller:true,runId:message.runId,requestId:message.requestId+':stop',reason:'E_CANCELLED'}):null)
      .then(()=>reply({ok:true}),()=>reply({ok:false}));
    return true;
  };
  chrome.runtime.onMessage.addListener(stopOwned);
  const webRequest=async(kind,payload={})=>{
    const reply=await chrome.runtime.sendMessage({protocol:WEB_TASK_PROTOCOL,kind,...payload});
    if(reply?.ok!==true)throw Object.assign(Error(reply?.error?.message||'Web task receipt unknown'),
      {code:reply?.error?.code||'E_WEB_TASK_UNKNOWN'});
    return reply.data;
  };
  const runner=createCloudRunnerLoop({client,host,webTasks:{claim:()=>webRequest('claim'),
    settle:requestId=>webRequest('settle',{requestId}),reconcile:()=>webRequest('reconcile')}});
  window.addEventListener('pagehide',()=>{chrome.runtime.onMessage.removeListener(stopOwned);void runner.dispose();},{once:true});
  runner.start();
});
