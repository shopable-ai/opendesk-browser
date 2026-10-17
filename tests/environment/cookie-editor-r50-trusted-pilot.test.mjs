import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {admitsTrustedCookieEditor} from '../../src/ui/trusted-cookie-admission.js';
import {officialPackagePath} from '../../src/sidebar-tools/official-catalog.js';
import {serializeSidebarToolPackage} from '../../src/ui/sidebar-tools/package.js';

const base='examples/sidebar-tools/cookie-editor';
test('R5 trusted Cookie gate admits only exact official installed and enabled package',async()=>{
  const tool=JSON.parse(await readFile(base+'/cookie-editor.opendesk-tool.json','utf8'));
  const bytes=Buffer.from(serializeSidebarToolPackage(tool),'utf8');
  const sha256=createHash('sha256').update(bytes).digest('hex');
  const release={id:'opendesk/cookie-editor',toolId:'cookie-editor',
    version:'2.0.23',packagePath:officialPackagePath('cookie-editor'),sha256};
  const good={tool,installed:[tool],release,enableRecords:{},epochs:{},
    expectedEpoch:null,provenance:{'cookie-editor':{
      marketId:release.id,version:release.version,sha256}}};
  assert.equal(await admitsTrustedCookieEditor(good),true);
  const bad=[
    {installed:[]},{enableRecords:{'cookie-editor':false}},
    {expectedEpoch:'stale'}, {epochs:{'cookie-editor':'rotated'}},
    {tool:{...tool,id:'lookalike'}},{tool:{...tool,version:'2.0.24'}},
    {tool:{...tool,js:tool.js+';/*tampered*/'}},
    {provenance:{}},{release:{...release,sha256:'0'.repeat(64)}},
    {release:{...release,packagePath:'official-tools/other/other.opendesk-tool.json'}}
  ];
  for(const mutation of bad){
    assert.equal(await admitsTrustedCookieEditor({...good,...mutation}),false,
      JSON.stringify(Object.keys(mutation)));
  }
});
test('R5 retains original Cookie installer, Chrome SDK and isolated untrusted execution',async()=>{
  const [cfg,html,js,css,pkg,host]=await Promise.all([
    'tool.config.json','src/index.html','src/main.js','src/style.css',
    'cookie-editor.opendesk-tool.json','../../src/ui/sidebar-tools.js'
  ].map(p=>readFile(p.startsWith('..')?'src/ui/sidebar-tools.js':base+'/'+p,'utf8')));
  const tool=JSON.parse(pkg);
  assert.equal(JSON.parse(cfg).version,'2.0.23');
  assert.equal(tool.version,'2.0.23');
  assert.equal(tool.html,html);assert.equal(tool.js,js);assert.equal(tool.css,css);
  assert.match(host,/createElement\('iframe'\)/);
  assert.match(host,/sidebar-tools\/sandbox\.html/);
});
test('R5 trusted pilot is static, data-free and mounted through the ONE host React root',async()=>{
  const [main,pilot,view,shell]=await Promise.all([
    'src/ui/react/main.tsx','src/ui/react/tabs/cookie-pilot.tsx',
    base+'/ui/CookieEditorView.jsx','src/ui/tool-shell.js'
  ].map(p=>readFile(p,'utf8')));
  assert.equal((main.match(/createRoot\(/g)||[]).length,1);
  assert.match(main,/createPortal\(<CookieTrustedPilot\/>,cookiePilotHost\)/);
  assert.match(main,/root\.unmount\(\)/);
  assert.match(shell,/if\(debugEnabled&&hostUrl\.searchParams\.get\('cookieReactPilot'\)==='1'\)/);
  assert.match(shell,/admitsTrustedCookieEditor/);
  assert.match(view,/components\/ui\/button\.tsx/);
  assert.match(view,/import \{Button,IconButton\}/);
  const preview=await readFile('examples/sidebar-tools/cookie-editor/preview/react/src/App.jsx','utf8');
  for(const name of ['CookieSiteBar','CookieToolbar','CookieSearch','CookieRows'])
    assert(preview.includes('<'+name),name+' must be rendered from shared JSX');
  for(const source of [pilot,view]){
    assert.doesNotMatch(source,/\bOpenDeskSDK\b|\bchrome\.cookies\b|document\.cookie|dangerouslySetInnerHTML|<iframe/i);
  }
  assert.match(pilot,/UI-only 技术试点/);
});
