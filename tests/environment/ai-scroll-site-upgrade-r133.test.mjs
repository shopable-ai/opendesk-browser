import test from 'node:test';
import assert from 'node:assert/strict';
import {realScrollPackage} from './ai-scroll-build-support.mjs';
import {digestUtf8} from '../../src/platform/protocol.js';
import {scrollSiteInstallMatches} from '../../src/scripting/user-scripts/scroll-config-contract.js';
import {pageHostPermissionOrigins} from '../../src/scripting/user-scripts/page-install-authorization.js';
import {buildScrollSiteUpgradePackage,scrollSiteRevision} from '../../src/scripting/user-scripts/scroll-site-upgrade.js';

test('exact site request is bounded to URL path, never wildcard Origin',()=>{
  assert.deepEqual(scrollSiteInstallMatches('https://example.com','/chat'),
    ['https://example.com:443/chat','https://example.com:443/chat?*','https://example.com:443/chat/*']);
  assert.deepEqual(pageHostPermissionOrigins(scrollSiteInstallMatches('https://example.com','/chat')),
    ['https://example.com/*']);
  for(const [origin,path] of [['https://*.example.com','/'],
    ['https://example.com','/chat*'],['https://example.com','/../secret'],
    ['https://example.com','//bad'],['https://example.com:invalid','/']]){
    assert.throws(()=>scrollSiteInstallMatches(origin,path));
  }
});

test('scoped package is a distinct revision, not a grant or mutation of installed source',async()=>{
  const base=await realScrollPackage();
  const source=base.sourceUtf8;
  assert.ok(source.includes('__openDeskScrollConfig'));
  const sourceHash=await digestUtf8(source),manifestHash='a'.repeat(64);
  const candidate={sourceUtf8:source,manifestHash,manifest:{
    programId:'opendesk.ai-scroll-navigation',revision:base.revision,sourceHash,
    pageRules:base.pageRules,entryFormat:base.entryFormat}};
  const installed={programId:'opendesk.ai-scroll-navigation',revision:base.revision,sourceHash,
    manifestHash,pageRules:base.pageRules,title:'AI 对话滚动导航',enabled:true,
    nativeState:'registered',authorization:{status:'active'},error:null};
  const revision=await scrollSiteRevision(manifestHash,[...base.pageRules.matches,...scrollSiteInstallMatches('https://example.com','/chat')]);
  const args={installed,candidate,origin:'https://example.com',pathScope:'/chat',revision};
  const next=await buildScrollSiteUpgradePackage(args);
  assert.equal(next.revision,revision);
  assert.equal(next.version,base.version+'+site.r'+revision);
  assert.equal(next.pageRules.matches.length,base.pageRules.matches.length+3);
  assert.equal(next.sourceHash,await digestUtf8(next.sourceUtf8));
  assert.equal(next.packageHash.length,64);
  assert.deepEqual(installed.pageRules,base.pageRules);
  await assert.rejects(()=>buildScrollSiteUpgradePackage({...args,installed:{...installed,enabled:false}}),
    {code:'E_PAGE_AUTHORIZATION'});
  await assert.rejects(()=>buildScrollSiteUpgradePackage({...args,origin:'https://chatgpt.com'}),
    {code:'E_SITE_ALREADY_ALLOWED'});
});


test('R134 native and SPA paths share exact segment/query semantics',async()=>{
  const {pageProgramUrlMatches}=await import('../../src/scripting/user-scripts/page-program-rules.js');
  const matches=scrollSiteInstallMatches('https://example.com','/chat');
  const rules={matches,excludeMatches:[],runAt:'document_idle',allFrames:false,world:'USER_SCRIPT'};
  for(const url of ['https://example.com:443/chat','https://example.com:443/chat?q=x','https://example.com:443/chat/123#anchor'])
    assert.equal(pageProgramUrlMatches(rules,url),true,url);
  for(const url of ['http://example.com/chat','https://evil.example/chat','https://example.com:443/chatter',
    'https://example.com/chat%2Fadmin','https://example.com/admin?next=/chat'])
    assert.equal(pageProgramUrlMatches(rules,url),false,url);
  for(const path of ['/chat*','/a/../chat','/%2e%2e/chat','/a%2fchat','/a%5Cchat','/a%252fchat','/chat#x','/chat?q=x'])
    assert.throws(()=>scrollSiteInstallMatches('https://example.com',path),undefined,path);
});

test('R134 custom port and localhost are exact native ranges under a coarse Chrome grant',async()=>{
  const {scrollProgramUrlMatches}=await import('../../src/scripting/user-scripts/scroll-config-contract.js');
  for(const [origin,pattern] of [['http://localhost:43111','http://localhost:43111/*'],
    ['http://localhost','http://localhost:80/*'],['https://example.com:8443','https://example.com:8443/*']]){
    const matches=scrollSiteInstallMatches(origin,'/');assert.deepEqual(matches,[pattern]);
    const rules={matches,excludeMatches:[],runAt:'document_idle',allFrames:false,world:'USER_SCRIPT'};
    assert.equal(scrollProgramUrlMatches(rules,origin+'/chat'),true);
    assert.equal(scrollProgramUrlMatches(rules,origin.replace(/:\d+$/,'')+':444/chat'),false);
  }
});

test('R134 widening a reviewed child prefix deduplicates all matches before revision and source derivation',async()=>{
  const base=await realScrollPackage(),manifestHash='b'.repeat(64);
  const makeArgs=async(pkg,hash,pathScope)=>{
    const candidate={sourceUtf8:pkg.sourceUtf8,manifestHash:hash,manifest:{
      programId:pkg.programId,revision:pkg.revision,sourceHash:pkg.sourceHash,
      pageRules:pkg.pageRules,entryFormat:pkg.entryFormat}};
    const installed={...candidate.manifest,manifestHash:hash,title:pkg.title,enabled:true,
      nativeState:'registered',authorization:{status:'active'},error:null};
    const matches=[...pkg.pageRules.matches,...scrollSiteInstallMatches('https://custom.example.org',pathScope)];
    const revision=await scrollSiteRevision(hash,matches);
    assert.equal(revision,await scrollSiteRevision(hash,[...new Set(matches)]));
    return {installed,candidate,origin:'https://custom.example.org',pathScope,revision};
  };
  const child=await buildScrollSiteUpgradePackage(await makeArgs(base,manifestHash,'/chat/'));
  const args=await makeArgs(child,'c'.repeat(64),'/chat');
  const expanded=await buildScrollSiteUpgradePackage(args);
  assert.deepEqual(expanded,await buildScrollSiteUpgradePackage(args));
  const expected=[...new Set([...child.pageRules.matches,...scrollSiteInstallMatches(args.origin,'/chat')])];
  assert.deepEqual(expanded.pageRules.matches,expected);
  assert.deepEqual([...expanded.sourceUtf8.matchAll(/^\/\/ @match ([^\r\n]+)$/gm)].map(m=>m[1]),expected);
  assert.equal(expanded.sourceHash,await digestUtf8(expanded.sourceUtf8));
  assert.equal(expanded.revision,args.revision);
});
