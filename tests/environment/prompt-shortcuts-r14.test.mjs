// R1.4 source-level contract and package checks; NOT a native Chrome acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {describeBundle} from '../../scripts/bundle-provenance.mjs';
import {runInNewContext} from 'node:vm';
import {webcrypto} from 'node:crypto';
import {createSidebarToolPackage} from '../../scripts/build-sidebar-tool.mjs';
import {validateSidebarToolPackage} from '../../src/ui/sidebar-tools/package.js';
import {CHATGPT_ORIGIN,PROMPT_ID,PROMPT_CAPABILITY,installedPromptTool,
  supportedOrigin,PROMPT_SITE_STORE,changePromptSiteGrant,allowedPromptSite} from '../../examples/sidebar-tools/prompt-shortcuts/trusted/policy.js';
import {cleanupUninstalledToolLocked,PROMPT_SHORTCUTS_SITE_CLEANUP_STORE,TOOL_CLEANUP_STORE} from '../../src/ui/sidebar-tools/installation.js';
import {SIDEBAR_TOOL_STORE,sidebarToolStorageKey} from '../../src/ui/sidebar-tools/package.js';

const ROOT='examples/sidebar-tools/prompt-shortcuts';
async function model(){
  const source=await readFile(ROOT+'/trusted/model.js','utf8'),sandbox={
    Intl,TextEncoder,crypto:webcrypto
  };
  runInNewContext(source,sandbox);
  return sandbox.OpenDeskPromptShortcutsModel;
}
const fixtureId=()=> 'example-123456';
test('R1.4 content-first: Unicode grapheme defaults, explicit fields and full body remain intact',async()=>{
  const m=await model(),cases=[
    ['  中文测试','中文'],[' hello world','he'],['🧑‍💻 开始','🧑‍💻开'],
    ['🎉','🎉'],['\n \t A\nB','AB'],['e\u0301cole','e\u0301c']];
  for(const [body,label] of cases)assert.equal(m.auto(body),label);
  const body='\n🧑‍💻 说明\n第二段\n\n123';
  const record=m.draft({body},null,fixtureId);
  assert.equal(record.body,body);
  assert.equal(record.label,'🧑‍💻说');assert.equal(record.name,'🧑‍💻说');
  assert.equal(record.labelAuto,true);assert.equal(record.nameAuto,true);
  assert.equal(record.enabled,true);assert.equal(record.shape,'square');
  const updated=m.draft({body:'新正文',shape:'round'},record);
  assert.equal(updated.id,record.id);assert.equal(updated.label,'新正');
  assert.equal(updated.name,'新正');assert.equal(updated.shape,'round');
  const manual=m.draft({body:'正文',name:'自定义名称',label:'🎉😀'},record);
  assert.equal(manual.label,'🎉😀');assert.equal(manual.name,'自定义名称');
  assert.equal(manual.labelAuto,false);assert.equal(manual.nameAuto,false);
  assert.throws(()=>m.draft({body:'  \n'},null,fixtureId),{code:'E_PROMPT_DATA'});
  assert.throws(()=>m.draft({body:'文字',label:'ABC'},null,fixtureId),{code:'E_PROMPT_DATA'});
});
test('R1.4 storage validates complete entries and keeps legacy auto flags manual',async()=>{
  const m=await model();
  const row=m.draft({body:'测试正文',enabled:false},null,fixtureId);
  const saved=m.load({schema:1,items:[row],settings:{webButtons:true}});
  assert.equal(saved.items.length,1);assert.equal(saved.items[0].enabled,false);
  assert.equal(saved.settings.webButtons,true);
  const legacy=m.load({schema:1,items:[{...row,labelAuto:undefined,nameAuto:undefined}],settings:{webButtons:false}});
  assert.equal(legacy.items[0].labelAuto,false);
  assert.equal(legacy.items[0].nameAuto,false);
  assert.equal(legacy.settings.webButtons,false);
  assert.throws(()=>m.load({schema:1,items:[row,row],settings:{webButtons:true}}),{code:'E_PROMPT_DATA'});
  assert.throws(()=>m.load({schema:1,items:[{...row,label:'ABC'}],settings:{webButtons:true}}),{code:'E_PROMPT_DATA'});
  assert.deepEqual(Array.from(m.load(null).items),[]);
  for(const legacy of [{...row,name:''},Object.fromEntries(Object.entries(row).filter(([key])=>key!=='name'))]){
    const loaded=m.load({schema:1,items:[legacy],settings:{webButtons:true}});
    assert.equal(loaded.items[0].nameAuto,true);
    assert.equal(loaded.items[0].name,'测试');
    assert.equal(loaded.items[0].body,row.body);
  }
  assert.throws(()=>m.load({schema:1,items:[{...row,name:null}],settings:{webButtons:true}}),{code:'E_PROMPT_DATA'});
});
test('R1.4 single v2 package builds from shared design and pins only one native menu action',async()=>{
  const pack=await createSidebarToolPackage(ROOT);
  assert.equal(pack.id,PROMPT_ID);assert.equal(pack.format,'opendesk.sidebar-tool.v2');
  assert(pack.capabilities.includes(PROMPT_CAPABILITY));
  assert.equal(pack.contributes.contextMenus.length,1);
  assert.deepEqual(pack.contributes.contextMenus[0].documentUrlPatterns,['https://chatgpt.com/*']);
  assert.deepEqual(pack.contributes.contextMenus[0].contexts,['selection']);
  assert.equal(pack.contributes.contextMenus[0].handler,'open-self');
  assert.equal(pack.scripts.length,1);assert.equal(pack.scripts[0].name,'trusted/model.js');
  assert.match(pack.css,/opendesk\.shared-design\.v1/);
  assert.deepEqual(validateSidebarToolPackage(pack),pack);
});
test('R1.13 ChatGPT entry: installed and enabled is sufficient without repeat site authorization',async()=>{
  assert.equal(supportedOrigin('https://chatgpt.com/c/abc'),CHATGPT_ORIGIN);
  for(const url of ['https://chat.openai.com/','https://chatgpt.com.evil.example/',
    'http://chatgpt.com/','https://claude.ai/','https://gemini.google.com/']){
    assert.equal(supportedOrigin(url),null);
  }
  const tool=await createSidebarToolPackage(ROOT);
  assert.equal(installedPromptTool([tool]).id,PROMPT_ID);
  const grants=await changePromptSiteGrant({},tool,'epoch-test',true);
  const args={installed:[tool],grants,enabled:{},epochs:{[PROMPT_ID]:'epoch-test'},
    url:'https://chatgpt.com/c/123'};
  assert.equal(await allowedPromptSite(args),true);
  assert.equal(await allowedPromptSite({...args,url:'https://claude.ai/'}),false);
  assert.equal(await allowedPromptSite({...args,enabled:{[PROMPT_ID]:false}}),false);
  assert.equal(await allowedPromptSite({...args,installed:[]}),false);
  assert.equal(await allowedPromptSite({...args,epochs:{[PROMPT_ID]:'other'}}),true);
  assert.equal(await allowedPromptSite({...args,grants:{
    [PROMPT_ID]:{...grants[PROMPT_ID],packageHash:'0'.repeat(64)}}}),true);
  const revoked=await changePromptSiteGrant(grants,tool,'epoch-test',false);
  assert.equal(await allowedPromptSite({...args,grants:revoked}),true,'legacy grant revocation is no longer a redundant gate');
  assert.equal(await allowedPromptSite({...args,grants:{}}),true,'first use requires no extra site permission');
  assert.equal(await allowedPromptSite({...args,installed:[{
    ...tool,capabilities:tool.capabilities.filter(capability=>capability!==PROMPT_CAPABILITY)
  }]}),false);
});
test('R1.4 fixed controller only uses scoped selectors, native insertion and no auto-send',async()=>{
  const page=await readFile(ROOT+'/trusted/page.js','utf8');
  const shell=await readFile(ROOT+'/src/main.js','utf8');
  const host=await readFile('src/entrypoints/page-relay.js','utf8');
  assert.match(page,/doc\.execCommand\('insertText'/);
  assert.match(page,/event\?\.isTrusted!==true/);
  assert.match(page,/PROMPT_DATA_STORE/);
  assert.match(page,/installed:values\[SIDEBAR_TOOL_STORE\]/);
  assert.match(page,/win\.location\.href/);
  assert.match(host,/initPromptShortcuts\(\)/);
  assert.match(shell,/browser\.launch\.consume/);
  assert.doesNotMatch(shell,/ps-menu|网页授权请在工具详情/);
  assert.doesNotMatch(page,/chrome\.tabs\.executeScript|eval\(|new Function\(/);
  assert.doesNotMatch(page,/\.click\(\).*send|send-button|conversation-history/);
});

test('R1.4 provenance pins only audited trusted tool modules to exact fixed entry points',()=>{
  const fixtures=[
    ['trusted/model.js','dcc138aab6cb3a6d47325f259990c9ddcac0fb2a'],
    ['trusted/policy.js','6544a03db0f11373dccdf67cc9b5ce808920a495'],
    ['trusted/page.js','dea7c3b8916df58e3b11f29d31fe93ce3a0f4868']
  ];
  const examined=(path,target)=>describeBundle({chunk:{fileName:target,
      modules:{[resolve(ROOT+'/'+path)]:{renderedLength:1,originalLength:1}}},
    root:process.cwd(),lock:{packages:{}}}).modules[0];
  for(const [path,sha] of fixtures){
    assert.equal(examined(path,'agents/page-relay.js').reviewedFirstPartyBlob,sha);
    assert.equal(examined(path,'ui/sidebar-tool-host.js').reviewedFirstPartyBlob,sha);
    assert.throws(()=>examined(path,'sw.js'),/Historical\/user\/vendor code cannot enter/);
  }
  assert.throws(()=>examined('src/main.js','agents/page-relay.js'),
    /Historical\/user\/vendor code cannot enter/);
});

test('R1.4 shared uninstall cleanup removes only this tool grant and data, not another tool',async()=>{
  assert.equal(PROMPT_SHORTCUTS_SITE_CLEANUP_STORE,PROMPT_SITE_STORE);
  const other='another-tool',tool=await createSidebarToolPackage(ROOT);
  const stored=new Map([
    [SIDEBAR_TOOL_STORE,[]],
    [TOOL_CLEANUP_STORE,{[PROMPT_ID]:{version:tool.version,createdAt:Date.now()}}],
    [PROMPT_SITE_STORE,{[PROMPT_ID]:{origins:[CHATGPT_ORIGIN]},[other]:{origins:['https://example.org']}}],
    [sidebarToolStorageKey(PROMPT_ID),{library:{schema:1,items:[],settings:{webButtons:true}}}]
  ]);
  const local={
    async get(keys){
      const values=keys==null?[...stored.keys()]:Array.isArray(keys)?keys:[keys];
      return Object.fromEntries(values.filter(key=>stored.has(key)).map(key=>[key,stored.get(key)]));
    },
    async set(value){for(const [key,data] of Object.entries(value))stored.set(key,structuredClone(data));},
    async remove(keys){for(const key of Array.isArray(keys)?keys:[keys])stored.delete(key);}
  };
  const api={storage:{local,session:{async get(){return {}},async remove(){}}}};
  const result=await cleanupUninstalledToolLocked(api,PROMPT_ID);
  assert.equal(result.state,'cleaned');
  assert.equal(stored.has(sidebarToolStorageKey(PROMPT_ID)),false);
  assert.equal(Object.hasOwn(stored.get(TOOL_CLEANUP_STORE),PROMPT_ID),false);
  assert.equal(Object.hasOwn(stored.get(PROMPT_SITE_STORE),PROMPT_ID),false);
  assert.equal(stored.get(PROMPT_SITE_STORE)[other].origins[0],'https://example.org');
  // A stale uninstall recovery intent may not delete new installation data.
  stored.set(SIDEBAR_TOOL_STORE,[tool]);
  stored.set(TOOL_CLEANUP_STORE,{[PROMPT_ID]:{version:tool.version,createdAt:Date.now()}});
  stored.set(PROMPT_SITE_STORE,{[PROMPT_ID]:{origins:[CHATGPT_ORIGIN]}});
  assert.equal((await cleanupUninstalledToolLocked(api,PROMPT_ID)).state,'still-installed');
  assert.deepEqual(stored.get(PROMPT_SITE_STORE)[PROMPT_ID].origins,[CHATGPT_ORIGIN]);
});

test('R1.13 formal source builds a canonical candidate, then CI promotes it only after tests',async()=>{
  const base='examples/sidebar-tools/prompt-shortcuts/';
  const [html,css,js,formal]=await Promise.all([
    readFile(base+'src/index.html','utf8'),readFile(base+'src/style.css','utf8'),
    readFile(base+'src/main.js','utf8'),readFile(process.env.PROMPT_SHORTCUTS_PACKAGE_PATH||base+'prompt-shortcuts.opendesk-tool.json','utf8')
  ]);
  const pkg=await createSidebarToolPackage(ROOT);
  assert.equal(pkg.version,'1.1.0');
  assert.equal(pkg.id,PROMPT_ID);
  // The committed package remains on the previous known-good version until
  // the scoped tests and actual packer pass. CI promotes the same candidate
  // only afterwards; this pre-promotion source test must not require that
  // unverified new package to have already replaced the old project package.
  const lastGood=JSON.parse(formal);
  assert.equal(lastGood.id,PROMPT_ID);
  assert.equal(lastGood.format,pkg.format);
  for(const id of ['ps-count','ps-empty','ps-quota-value','ps-preview-glyph',
    'ps-toggle-settings','ps-setting-fields','ps-body-error','ps-clipboard-buffer']){
    assert(html.includes('id="'+id+'"'),id+' is required by the formal tool');
  }
  assert.match(html,/rows="3"/);
  assert.doesNotMatch(html,/class="ps-permission-strip"|id="ps-copy"|ps-shapes/);
  assert.match(css,/\.ps-switch input:checked\+\.ps-switch-track/);
  assert.match(css,/\.ps-card-main/);
  assert.match(js,/root\.querySelector\('\.ps-delete-cancel'\)/);
  assert.match(js,/model\.bytes\(estimate\)/);
  assert.match(js,/use\.className='ps-card-use od-button od-button--quiet'/,
    'formal list CTA must preserve canonical quiet-button token instead of blue primary button');
  assert.doesNotMatch(js,/request\('clipboard\.writeText'/);
  assert.doesNotMatch(html,/模拟数据|模拟撤销|mockContextMenu|SIMULATED PREVIEW/);
});
