import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {digestUtf8} from '../../src/platform/protocol.js';
import {scrollSiteInstallMatches} from '../../src/scripting/user-scripts/scroll-config-contract.js';
import {pageHostPermissionOrigins} from '../../src/scripting/user-scripts/page-install-authorization.js';
import {buildScrollSiteUpgradePackage} from '../../src/scripting/user-scripts/scroll-site-upgrade.js';

test('exact site request is bounded to URL path, never wildcard Origin',()=>{
  assert.deepEqual(scrollSiteInstallMatches('https://example.com','/chat'),
    ['https://example.com/chat','https://example.com/chat?*','https://example.com/chat/*']);
  assert.deepEqual(pageHostPermissionOrigins(scrollSiteInstallMatches('https://example.com','/chat')),
    ['https://example.com/*']);
  for(const [origin,path] of [['https://*.example.com','/'],
    ['https://example.com','/chat*'],['https://example.com','/../secret'],
    ['https://example.com','//bad'],['http://localhost:43111','/']]){
    assert.throws(()=>scrollSiteInstallMatches(origin,path));
  }
});

test('scoped package is a distinct revision, not a grant or mutation of installed source',async()=>{
  const base=JSON.parse(await readFile('examples/programs/chatgpt-jump-top/ai-scroll-navigation.opendesk-page.json','utf8'));
  const source=base.sourceUtf8.includes('__openDeskScrollConfig')?base.sourceUtf8:
    base.sourceUtf8+'\\n// __openDeskScrollConfig\\n';
  const sourceHash=await digestUtf8(source),manifestHash='a'.repeat(64);
  const candidate={sourceUtf8:source,manifestHash,manifest:{
    programId:'opendesk.ai-scroll-navigation',revision:3,sourceHash,
    pageRules:base.pageRules,entryFormat:base.entryFormat}};
  const installed={programId:'opendesk.ai-scroll-navigation',revision:3,sourceHash,
    manifestHash,pageRules:base.pageRules,title:'AI 对话滚动导航',enabled:true,
    nativeState:'registered',authorization:{status:'active'},error:null};
  const args={installed,candidate,origin:'https://example.com',pathScope:'/chat',revision:4};
  const next=await buildScrollSiteUpgradePackage(args);
  assert.equal(next.revision,4);
  assert.equal(next.version,base.version+'+site.r4');
  assert.equal(next.pageRules.matches.length,base.pageRules.matches.length+3);
  assert.equal(next.sourceHash,await digestUtf8(next.sourceUtf8));
  assert.equal(next.packageHash.length,64);
  assert.deepEqual(installed.pageRules,base.pageRules);
  await assert.rejects(()=>buildScrollSiteUpgradePackage({...args,installed:{...installed,enabled:false}}),
    {code:'E_PAGE_AUTHORIZATION'});
  await assert.rejects(()=>buildScrollSiteUpgradePackage({...args,origin:'https://chatgpt.com'}),
    {code:'E_SITE_ALREADY_ALLOWED'});
});
