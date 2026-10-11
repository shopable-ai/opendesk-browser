import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {join,relative} from 'node:path';
import {parse} from 'acorn';

// Side Panel and official tools must use inline choices instead of blocking JS
// dialogs. PermissionConsent.confirm() is a trusted API method (not window.confirm)
// and Chrome-native permission prompts remain owned by the browser.
const TRUSTED_UI=[
  'src/ui/sidebar-tools.js',
  'src/ui/tool-shell.js',
  'src/ui/workflow/workflow-view.js',
  'src/ui/site-access.js',
  'src/ui/sdk-approval.js',
  'src/native-agent/workspace.js',
  'src/native-agent/settings.js',
  'src/marketplace/page.js'
];
const BUNDLED_TOOL_SOURCES=[
  'examples/sidebar-tools/reading-toc/src/main.js',
  'examples/sidebar-tools/web-markdown-clipper/src/main.js',
  'examples/sidebar-tools/knowledge-inbox/src/main.js',
  'examples/sidebar-tools/quick-notes/src/main.js',
  'examples/sidebar-tools/markdown-workbench/src/main.js'
];
test('R5.4 trusted UI and bundled tools contain no blocking JavaScript browser dialogs',async()=>{
  for(const path of [...TRUSTED_UI,...BUNDLED_TOOL_SOURCES]){
    const content=await readFile(path,'utf8');
    assert.doesNotMatch(content,/\b(?:globalThis|window|self)\s*\.\s*(?:confirm|alert|prompt)\s*\(/,
      path+' must not call browser JS dialogs');
    // These selected files have no application-local confirm() callback.
    assert.doesNotMatch(content,/(^|[^.\w])(?:confirm|alert|prompt)\s*\(/m,
      path+' must use inline permission/review controls');
    assert.doesNotMatch(content,/\b(?:onbeforeunload\s*=|addEventListener\s*\(\s*['"]beforeunload['"])/,
      path+' must not trigger a native leave-page confirmation');
  }
});

test('R5.4 no-modal interaction still keeps explicit undo/cancel and Chrome authority boundaries',async()=>{
  const [html,source,workflow,manifestText,markdown]=await Promise.all([
    readFile('src/ui/tool.html','utf8'),
    readFile('src/ui/sidebar-tools.js','utf8'),
    readFile('src/ui/workflow/workflow-view.js','utf8'),
    readFile('manifest.json','utf8'),
    readFile('examples/sidebar-tools/markdown-workbench/src/main.js','utf8')
  ]);
  for(const id of [
    'sidebar-tool-action-review','sidebar-tool-action-continue','sidebar-tool-action-cancel',
    'sidebar-tool-inline-remove','sidebar-tool-inline-remove-confirm','sidebar-tool-inline-remove-cancel',
    'workflow-new-review','workflow-new-discard','workflow-new-cancel'
  ])assert.match(html,new RegExp('id="'+id+'"'),'missing inline action '+id);
  assert.match(source,/requireCompleteInstalledSidebarTools/,'uninstall still verifies installed identities');
  assert.match(source,/writeVerifiedLocalValue/,'installed changes retain verified writes');
  assert.match(workflow,/newReviewSignature!==workflowReviewSignature\(\)/,'workflow discards must verify current draft');
  assert.match(markdown,/mdw-review-cancel/,'editor still exposes inline Cancel');
  const manifest=JSON.parse(manifestText);
  assert.match(manifest.content_security_policy.sandbox,/sandbox allow-scripts/);
  assert.doesNotMatch(manifest.content_security_policy.sandbox,/allow-modals/,
    'untrusted sandbox tools may not open browser modal dialogs');
});


// Future tool modules must obey the same no-modal contract without having to
// edit a hard-coded allowlist. Analyze actual JS syntax, not strings/comments.
const OWNED_UI_ROOTS=[
  'src/ui','src/native-agent','src/marketplace','src/sidebar-tools',
  'src/entrypoints','src/development','src/features','src/agents',
  'src/knowledge','src/reading-toc','src/page-clip','src/time-review','examples/sidebar-tools'
];
async function ownedScripts(directory){
  const entries=await readdir(directory,{withFileTypes:true});
  const paths=[];
  for(const entry of entries){
    const path=join(directory,entry.name);
    if(entry.isDirectory())paths.push(...await ownedScripts(path));
    else if(entry.isFile()&&/\.(?:m?js)$/.test(entry.name))paths.push(path);
  }
  return paths;
}
const browserModalMethods=new Set(['confirm','alert','prompt']);
const browserGlobalNames=new Set(['window','globalThis','self','top','parent']);
function propertyName(node){
  if(node?.type!=='MemberExpression')return null;
  if(!node.computed&&node.property.type==='Identifier')return node.property.name;
  if(node.computed&&node.property.type==='Literal'&&typeof node.property.value==='string')return node.property.value;
  return null;
}
function browserGlobal(node){
  if(node?.type==='Identifier')return browserGlobalNames.has(node.name);
  if(node?.type!=='MemberExpression')return false;
  const member=propertyName(node);
  return (browserGlobal(node.object)&&['window','self','top','parent','frames'].includes(member))||
    (node.object?.type==='Identifier'&&node.object.name==='document'&&member==='defaultView');
}
function visitSyntax(node,callback){
  if(!node||typeof node!=='object')return;
  if(Array.isArray(node)){for(const entry of node)visitSyntax(entry,callback);return;}
  if(typeof node.type==='string')callback(node);
  for(const [key,value] of Object.entries(node)){
    if(key==='start'||key==='end'||key==='loc'||key==='range')continue;
    if(value&&typeof value==='object')visitSyntax(value,callback);
  }
}
test('R5.5 all first-party UI and official tool JS refuse browser modal APIs',async()=>{
  const paths=(await Promise.all(OWNED_UI_ROOTS.map(ownedScripts))).flat().sort();
  assert.ok(paths.length>=75,'no-modal audit must still scan the actual authored UI tree');
  const violations=[];
  for(const path of paths){
    const name=relative('.',path).replaceAll('\\','/');
    const syntax=parse(await readFile(path,'utf8'),{ecmaVersion:'latest',sourceType:'module',allowHashBang:true});
    let localConfirm=false;
    if(name==='src/ui/local-project-install-ui.js')visitSyntax(syntax,node=>{
      if(node.type==='FunctionDeclaration'&&node.id?.name==='confirm')localConfirm=true;
    });
    visitSyntax(syntax,node=>{
      const where=name+':'+(node.start??'unknown');
      if(node.type==='CallExpression'){
        if(node.callee?.type==='Identifier'&&browserModalMethods.has(node.callee.name)&&
          !(localConfirm&&node.callee.name==='confirm'))
          violations.push(where+': unqualified '+node.callee.name+'()');
        if(propertyName(node.callee)==='addEventListener'&&
          node.arguments[0]?.type==='Literal'&&node.arguments[0].value==='beforeunload'&&
          (browserGlobal(node.callee.object)||node.callee.object?.name==='document'))
          violations.push(where+': browser beforeunload event');
      }
      if(node.type==='MemberExpression'){
        const member=propertyName(node);
        if(browserGlobal(node.object)&&browserModalMethods.has(member))
          violations.push(where+': browser.'+member);
        if(browserGlobal(node.object)&&member==='onbeforeunload')
          violations.push(where+': browser.onbeforeunload');
      }
      if(node.type==='VariableDeclarator'&&browserGlobal(node.init)&&
        node.id?.type==='ObjectPattern'&&node.id.properties.some(p=>
          browserModalMethods.has(p.key?.name||p.key?.value)))
        violations.push(where+': destructured browser modal function');
    });
  }
  assert.deepEqual(violations,[],'first-party tools must use inline UI; Chrome-native permission prompts remain browser-owned');
});
