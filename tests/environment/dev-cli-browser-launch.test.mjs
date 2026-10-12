import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {workspaceOpenCommand,openWorkspace} from '../../native-agent/local-dev/dev-cli.mjs';

const cfg={browser:'chrome',extensionId:'ccfcjegpkdlgbclopjmadlcjedelidmf',userDataDir:''};
const sourceId='source-'+'a'.repeat(24);
const url='chrome-extension://'+cfg.extensionId+'/native-agent/workspace.html?sourceId='+sourceId;
const homeDirectory='/Users/test';
const userChrome=homeDirectory+'/Applications/Google Chrome.app';
const systemChrome='/Applications/Google Chrome.app';
const systemCft='/Applications/Google Chrome for Testing.app';
const options=apps=>({platform:'darwin',homeDirectory,bundleIdentifier:app=>{
  if(!apps[app])throw Error('missing bundle');
  return apps[app];
}});

test('macOS uses verified daily Chrome when the system Google Chrome.app is CFT',()=>{
  assert.deepEqual(workspaceOpenCommand(cfg,sourceId,options({
    [userChrome]:'com.google.Chrome',[systemChrome]:'com.google.chrome.for.testing'
  })),{executable:'/usr/bin/open',args:['-a',userChrome,url]});
});
test('macOS supports a normal system installation when user Applications has no Chrome',()=>{
  assert.deepEqual(workspaceOpenCommand(cfg,sourceId,options({[systemChrome]:'com.google.Chrome'})),
    {executable:'/usr/bin/open',args:['-a',systemChrome,url]});
});
test('macOS refuses a same-name app with the wrong bundle identity',()=>{
  assert.throws(()=>workspaceOpenCommand(cfg,sourceId,options({[systemChrome]:'com.google.chrome.for.testing'})),
    error=>error.code==='E_BROWSER_OPEN'&&error.message.includes(url));
});
test('macOS keeps CFT pairing distinct and supports its official and renamed app paths',()=>{
  for(const app of [systemCft,systemChrome]){
    assert.deepEqual(workspaceOpenCommand({...cfg,browser:'cft'},sourceId,options({
      [userChrome]:'com.google.Chrome',[app]:'com.google.chrome.for.testing'
    })),{executable:'/usr/bin/open',args:['-a',app,url]});
  }
});
test('custom profiles stay blocked before any application lookup',()=>{
  assert.throws(()=>workspaceOpenCommand({...cfg,userDataDir:'/isolated/profile'},sourceId,{
    ...options({}),bundleIdentifier:()=>assert.fail('must not launch a guessed profile')
  }),error=>error.code==='E_PROFILE_TARGET');
});
test('failed macOS open reports the original workspace URL without a secondary error',async()=>{
  await assert.rejects(openWorkspace(cfg,sourceId,{
    ...options({[userChrome]:'com.google.Chrome'}),spawnProcess:(executable,args)=>{
      assert.equal(executable,'/usr/bin/open');assert.deepEqual(args,['-a',userChrome,url]);
      const child=new EventEmitter();queueMicrotask(()=>child.emit('close',1));return child;
    }
  }),error=>error.code==='E_BROWSER_OPEN'&&error.message.includes(url));
});
