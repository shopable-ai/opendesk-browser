import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {fileURLToPath} from 'node:url';
import {createSidebarToolPackage} from '../../../scripts/build-sidebar-tool.mjs';
import {resolveToolLocaleState,toolLocaleStorageKey} from '../../../src/ui/sidebar-tools/locale-packs.js';
import {appPageStorage} from '../../../src/scripting/user-scripts/app-page-contract.js';
import {PAGE_MATCHES} from '../src/destinations.js';

const root=fileURLToPath(new URL('../',import.meta.url));
let candidate;
const getCandidate=()=>candidate??=createSidebarToolPackage(root);

test('one v1 application owns the authorized four-site webpage module',async()=>{
  const tool=await getCandidate();
  assert.equal(tool.id,'ai-new-chat-window');
  const project=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
  assert.equal(tool.version,project.version);
  assert.deepEqual(tool.capabilities,['page.module']);
  const page=tool.pageModule;
  assert.equal(page.programId,'app.'+tool.id);
  assert.equal(page.version,tool.version);
  assert.deepEqual(page.pageRules,{matches:[...PAGE_MATCHES],excludeMatches:[],
    runAt:'document_idle',allFrames:false,world:'USER_SCRIPT'});
});

test('an independent language pack updates the sidebar and the authorized page context',async()=>{
  const tool=await getCandidate();
  const {sourceCatalogHash,sourceLocale,messages}=tool.localization;
  assert.deepEqual(Object.keys(messages).sort(),['en','ja','zh-CN','zh-TW']);
  const storage={locale:'en',packs:{en:{format:'opendesk.locale-pack.v1',toolId:tool.id,
    sourceLocale,targetLocale:'en',sourceCatalogHash,messages:{
      intro:{source:messages[sourceLocale].intro,text:'Start fresh and keep your current chat.'},
      projectTab:{source:messages[sourceLocale].projectTab,text:'New project chat in another tab'}
    }}}};
  const prefs=resolveToolLocaleState(tool,storage,'ja');
  const node={dataset:{message:'intro'}},guide={};
  let change;
  const sidebar={root:{querySelector:()=>guide,querySelectorAll:()=>[node]},locale:'zh-CN',
    onLocaleChange(callback){change=callback;}};
  runInNewContext(tool.js,{OpenDeskTool:sidebar});
  assert.equal(node.textContent,messages[sourceLocale].intro);
  sidebar.locale=prefs.locale;
  sidebar.messages={sourceLocale,messages:{[sourceLocale]:messages[sourceLocale],[prefs.locale]:prefs.messages}};
  change();
  assert.equal(guide.lang,'en');
  assert.equal(node.textContent,'Start fresh and keep your current chat.');

  const context=await appPageStorage({api:{storage:{local:{get:async()=>({[toolLocaleStorageKey(tool.id)]:storage})}}},
    owner:{toolId:tool.id},operation:'readContext',authorizeReadParent:async()=>tool,authorize:async()=>{}});
  assert.equal(context.locale,'en');
  assert.equal(context.catalog.messages.en.projectTab,'New project chat in another tab');
  assert.equal(context.catalog.messages.en.chatTab,messages.en.chatTab);
});
