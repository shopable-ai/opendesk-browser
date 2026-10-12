// R16.5: usable, cross-world dependency examples.
// Actual pinned npm imports and real standalone-tool packer (Node L2 only).
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createSidebarToolPackage,encodeSidebarToolPackage} from '../../scripts/build-sidebar-tool.mjs';
import {summarizeTrustedBackgroundEvent} from '../../examples/libs/trusted-imports/background.mjs';
import {formatTrustedSidebarStatus} from '../../examples/libs/trusted-imports/sidebar-host.mjs';
import {renderTrustedExtensionPageTitle} from '../../examples/libs/trusted-imports/extension-page.mjs';

test('trusted SW and host ESM examples use pinned npm imports, not Controller globals',async()=>{
  const summary=summarizeTrustedBackgroundEvent('https://docs.example.org/foo','2026-10-12T09:00:00.000Z');
  assert.equal(summary.origin,'https://docs.example.org');
  assert.deepEqual(summary.hostWords,['docs','example','org']);
  assert.equal(summary.date,'2026-10-12');
  assert.throws(()=>summarizeTrustedBackgroundEvent('chrome://extensions'),/HTTP/);
  assert.equal(formatTrustedSidebarStatus('https://docs.example.org/?tag=a&tag=b','2026-10-12T09:00:00.000Z'),
    '2026-10-12 · https://docs.example.org/ · 2 tag(s)');
  const node={textContent:''};
  assert.equal(renderTrustedExtensionPageTitle(node,'OpenDesk OpenDesk Browser'), 'Open · Desk · Browser');
  assert.equal(node.textContent,'Open · Desk · Browser');

  for(const file of ['background.mjs','sidebar-host.mjs','extension-page.mjs']){
    const source=await readFile('examples/libs/trusted-imports/'+file,'utf8');
    assert.match(source,/^import\s/m,'trusted module must declare its own dependency');
    assert.doesNotMatch(source,/globalThis\.(?:page|_|dayjs)|chrome\.(?:tabs|scripting|runtime)/);
  }
});

test('an installed Side Panel tool packages HTML/CSS/classic JS, and never gains page/_/dayjs',async()=>{
  const pkg=await createSidebarToolPackage('examples/sidebar-tools/runtime-globals-demo');
  assert.equal(pkg.format,'opendesk.sidebar-tool.v1');
  assert.equal(pkg.id,'runtime-globals-demo');
  assert.deepEqual(pkg.capabilities,['currentPage.read']);
  assert(encodeSidebarToolPackage(pkg).byteLength<320000);
  assert.match(pkg.js,/globalThis\.OpenDeskTool/);
  assert.doesNotMatch(pkg.js,/^\s*(?:import|export)\s|\bpage\.title\(|globalThis\._|globalThis\.dayjs/m);
  assert(!pkg.html.includes('<script'));

  const handlers=new Map(),rows=new Map();
  const node=id=>{
    const item={textContent:'',disabled:false,
      addEventListener(type,handler){handlers.set(id+':'+type,handler)}};
    rows.set(id,item);return item;
  };
  node('#runtime-status');node('#runtime-title');node('#runtime-read');
  const root={querySelector:selector=>rows.get(selector)??null};
  const called=[],states=[];
  const tool={root,
    async request(method){
      called.push(method);
      return {status:'available',title:'OpenDesk Demo Title'};
    },
    setState:state=>states.push(state)
  };
  vm.runInNewContext(pkg.js,{OpenDeskTool:tool},{timeout:1000});
  assert.match(rows.get('#runtime-status').textContent,/点击按钮/);
  assert.deepEqual(called,[],'no currentPage read on initialization');
  await handlers.get('#runtime-read:click')({isTrusted:false});
  assert.deepEqual(called,[],'untrusted synthesized clicks never read a page');
  await handlers.get('#runtime-read:click')({isTrusted:true});
  assert.deepEqual(called,['currentPage.info']);
  assert.equal(rows.get('#runtime-title').textContent,'OpenDesk Demo Title');
  assert.equal(rows.get('#runtime-read').disabled,false);
  // A real VM tool sends a cross-realm object through the narrow bridge.
  // Compare wire values, not realm-specific Object prototypes.
  assert.deepEqual(JSON.parse(JSON.stringify(states.at(-1))),{dirty:false,busy:false});
});

test('public docs and single-file Page syntax distinguish globals from host imports',async()=>{
  const [guide,page,controller,tool]=await Promise.all([
    readFile('docs/api/runtime-globals-and-preinstalled-libraries.zh-CN.md','utf8'),
    readFile('examples/programs/single-file/page-globals-zero-arg.js','utf8'),
    readFile('examples/programs/controller-globals-zero-arg/src/main.js','utf8'),
    readFile('examples/sidebar-tools/runtime-globals-demo/src/main.js','utf8')
  ]);
  for(const term of ['Background','Side Panel','USER_SCRIPT','export default async function main()',
    'OpenDeskTool','按需','examples/libs/trusted-imports','runtime-globals-demo'])
    assert(guide.includes(term),'runtime guide is missing '+term);
  assert.match(controller,/export default async function main\(\)/);
  assert.match(page,/async function main\(\)/);
  // Comments intentionally document forbidden forms. The executable code
  // must not contain them; do not mistake a warning comment for an import.
  const executablePage=page.split('\n').filter(line=>!/^\s*\/\//.test(line)).join('\n');
  assert.doesNotMatch(executablePage,/\bexport\s+default|\bpage\.title\(|\baxiosx\s*\(/);
  assert.doesNotMatch(tool,/async\s+function\s+main\(|globalThis\.dayjs|\bpage\.title\(/);
});
