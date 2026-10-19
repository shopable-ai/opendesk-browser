import {defineUnlistedScript} from 'wxt/utils/define-unlisted-script';
import {CLOUD_RUNNER_DOCUMENT_PATH} from '../tool-document-url.js';
import {createHostClient} from '../platform/host/client.js';
import {createRunHost} from '../run-host.js';
import {createCloudRunnerLoop} from '../cloud-control/runner.js';

export default defineUnlistedScript(async()=>{
  const expected=chrome.runtime.getURL(CLOUD_RUNNER_DOCUMENT_PATH);
  if(location.href!==expected)throw Error('E_CLOUD_RUNNER_IDENTITY');
  const contexts=await chrome.runtime.getContexts({contextTypes:['OFFSCREEN_DOCUMENT'],documentUrls:[expected]});
  if(contexts.length!==1||contexts[0].contextType!=='OFFSCREEN_DOCUMENT')
    throw Error('E_CLOUD_RUNNER_CONTEXT');
  const client=createHostClient(chrome);
  const host=createRunHost({api:chrome,client,document,templateModuleFactory:null});
  const runner=createCloudRunnerLoop({client,host});
  window.addEventListener('pagehide',runner.dispose,{once:true});
  runner.start();
});
