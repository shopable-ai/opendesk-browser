import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {build} from 'vite';
import config from '../../wxt.config.mjs';
import {inspectScript} from '../../scripts/verify-package.mjs';
import {validateSidebarToolPackage,serializeSidebarToolPackage,SIDEBAR_TOOL_SHARED_UI_RUNTIME} from '../../src/ui/sidebar-tools/package.js';
import {createSidebarToolPackage} from '../../scripts/build-sidebar-tool.mjs';
const read=path=>readFile(new URL('../../'+path,import.meta.url),'utf8');
const sample={format:'opendesk.sidebar-tool.v1',id:'mini-example',version:'1.0.0',
  title:'Demo',description:'isolated',capabilities:[],html:'<div>OK</div>',css:'',js:'void 0;'};

test('shared UI opt-in leaves all old package bytes unchanged',()=>{
  const legacy=validateSidebarToolPackage(sample);
  assert.equal(Object.hasOwn(legacy,'uiRuntime'),false);
  assert.equal(serializeSidebarToolPackage(legacy).includes('uiRuntime'),false);
  const shared=validateSidebarToolPackage({...sample,uiRuntime:SIDEBAR_TOOL_SHARED_UI_RUNTIME});
  assert.match(serializeSidebarToolPackage(shared),/opendesk\.react-ui\.v1/);
  assert.throws(()=>validateSidebarToolPackage({...sample,uiRuntime:'other'}),/共享 UI Runtime/);
});
test('JSX imports map to fixed sandbox globals and opt-in resource path',async()=>{
  const [app,vite,bridge,entry,tool,contract,preview]=await Promise.all([
    read('examples/sidebar-tools/shared-ui-demo/src/App.jsx'),
    read('examples/sidebar-tools/shared-ui-demo/vite.config.mjs'),
    read('src/sidebar-tools/bridge.js'),read('src/entrypoints/sidebar-shared-ui.js'),
    read('examples/sidebar-tools/shared-ui-demo/tool.config.json').then(JSON.parse),
    read('scripts/build-contract.mjs'),read('examples/sidebar-tools/shared-ui-demo/preview/index.html')]);
  assert.match(app,/from '@opendesk\/ui'/);
  assert.match(vite,/'react\/jsx-runtime':'OpenDeskPageReact'/);
  assert.match(vite,/'react-dom\/client':'OpenDeskPageReact'/);
  assert.match(vite,/'@opendesk\/ui':'OpenDeskSidebarUI'/);
  assert.match(bridge,/await loadSharedUI\(\)/);
  assert.match(bridge,/\.\.\/libs\/page-frameworks\/react-19\.2\.0\.js/);
  assert.match(entry,/tokensCSS\+'\\n'\+componentCSS/);
  assert.match(contract,/'sidebar-shared-ui':/);
  assert.match(entry,/E_TOOL_SHARED_UI_CSS_DRIFT/);
  assert.deepEqual(tool.capabilities,[]);
  assert.equal(tool.uiRuntime,SIDEBAR_TOOL_SHARED_UI_RUNTIME);
  assert.match(preview,/\.opendesk-preview\/browser\/sidebar-shared-ui\.js/);
  for(const source of [app,vite,entry,preview])
    assert.doesNotMatch(source,/https?:\/\/.*(?:cdn|jsdelivr|unpkg)/i);
});
test('built bundle contains no React runtime bytes',async t=>{
  const project=new URL('../../examples/sidebar-tools/shared-ui-demo/',import.meta.url);
  try{await Promise.all(['dist/tool.js','dist/build-ready.json'].map(path=>stat(new URL(path,project))));}
  catch{t.skip('requires an existing compiled demo with build-ready proof');return;}
  const pkg=await createSidebarToolPackage(fileURLToPath(project));
  assert.equal(pkg.uiRuntime,SIDEBAR_TOOL_SHARED_UI_RUNTIME);
  assert.ok(Buffer.byteLength(pkg.js,'utf8')<50000);
  assert.doesNotMatch(pkg.js,/ReactDOMRoot|ReactCurrentDispatcher|react\.production\.js/);
});

test('fixed shared UI compiles against pinned React with zero module imports',async()=>{
  const input='\0shared-ui-build-contract';
  const entry=fileURLToPath(new URL('../../src/entrypoints/sidebar-shared-ui.js',import.meta.url));
  const buildConfig={configFile:false,logLevel:'silent',mode:'development',
    define:{'process.env.NODE_ENV':JSON.stringify('development')},plugins:[{
    name:'shared-ui-build-contract',
    resolveId(id){if(id===input)return input;},
    load(id){if(id===input)return `export {default as entry} from ${JSON.stringify(entry)};
      export {default as React} from 'react';
      export {jsx,jsxs,Fragment} from 'react/jsx-runtime';`;}
  }],build:{lib:{entry,name:'sharedUIContract'},rollupOptions:{input},terserOptions:{},
    sourcemap:false,minify:false,write:false,emptyOutDir:false}};
  config.hooks['vite:build:extendConfig']([{name:'sidebar-shared-ui',type:'unlisted-script'}],buildConfig);
  const result=await build(buildConfig);
  const output=(Array.isArray(result)?result:[result]).flatMap(row=>row.output);
  assert.equal(output.length,1);
  const chunk=output[0];
  assert.equal(chunk.fileName,'sidebar-shared-ui.js');
  assert.deepEqual(chunk.imports,[]);
  assert.deepEqual(chunk.dynamicImports,[]);
  assert.deepEqual(inspectScript(chunk.code,chunk.fileName),{approvedAsyncBodyConstructors:0});
  assert.equal(Object.keys(chunk.modules).some(id=>/node_modules\/react(?:\/|$)/.test(id)),false);
  assert.equal(Object.keys(chunk.modules).some(id=>/node_modules\/react-dom\/(?:client|cjs\/react-dom-client)/.test(id)),false,
    'The shared UI must reuse the pinned client renderer');
  const pinnedContext=vm.createContext({});
  vm.runInContext(await read('src/libs/page-frameworks/react-19.2.0.js'),pinnedContext);
  const runtime=pinnedContext.OpenDeskPageReact;
  const styles=[];
  const context=vm.createContext({OpenDeskPageReact:runtime,AbortController});
  vm.runInContext(chunk.code,context);
  context.document={createElement:()=>({dataset:{}}),head:{append:style=>styles.push(style)}};
  const compiled=context.sharedUIContract;
  for(const name of ['jsx','jsxs','Fragment'])assert.equal(compiled[name],runtime[name]);
  assert.equal(compiled.React,runtime);
  compiled.entry.main();
  assert.equal(typeof context.OpenDeskSidebarUI.Button,'function');
  assert.equal(typeof context.OpenDeskSidebarUI.IconButton,'function');
  assert.equal(context.OpenDeskSidebarUI.Button({children:'运行'}).type,'button');
  assert.equal(context.OpenDeskSidebarUI.IconButton({label:'操作'}).type,'button');
  assert.throws(()=>context.OpenDeskSidebarUI.IconButton({}),/accessible label/);
  assert.equal(typeof context.OpenDeskSidebarUI.Card,'function');
  assert.equal(typeof context.OpenDeskSidebarUI.Switch,'function');
  assert.equal(context.OpenDeskSidebarUI.Card({}).type,'div');
  const ui=context.OpenDeskSidebarUI;
  assert.deepEqual(Object.keys(ui).sort(),['Button','Card','CardContent','IconButton',
    'SharedConversationFrame','Switch','createConversationSession'].sort());
  assert.equal(Object.isFrozen(ui),true);
  for(const forbidden of ['TrustedConversationWorkspace','TrustedConversationHeaderSlot',
    'Provider','authority','privateConfig','credentials'])assert.equal(ui[forbidden],undefined);
  const modules=Object.keys(chunk.modules);
  assert.ok(modules.some(id=>id.endsWith('/ui/conversation/session.js')));
  assert.ok(modules.some(id=>id.endsWith('/conversation-frame.css?raw')));
  assert.equal(modules.some(id=>/conversation-dock\.css|trusted-settings|conversation\/.*(?:controller|provider)|platform\/|projects\//.test(id)),false);
  assert.equal(/TrustedConversationWorkspace|当前扩展未连接可执行的可信 AI 业务能力|reconcileStorage|apiKey|authorization|privateConfig|credentialStore/i.exec(chunk.code)?.[0],undefined);

  // These identities and signals own only local presentation; no bridge exists here.
  const session=ui.createConversationSession({identity:{consumerId:'demo',instanceId:'one',hostInstanceId:'local'},rowsLimit:2});
  let notifications=0;
  const unsubscribe=session.subscribe(()=>notifications++);
  const raw='<img src=x onerror=alert(1)><script>bad()</script>';
  session.update({open:true,draft:'x'.repeat(4100)});
  assert.equal(session.getSnapshot().draft.length,4000);
  session.append('你',raw);session.append('助手','a'.repeat(3600));session.append('系统','third');
  assert.equal(session.getSnapshot().rows.length,2);
  assert.equal(session.getSnapshot().rows[0].message.length,3500);
  assert.equal(Object.isFrozen(session.getSnapshot().rows[0]),true);
  const round=session.begin({providerGeneration:1});
  assert.throws(()=>session.begin(),{code:'E_CONVERSATION_BUSY'});
  assert.throws(()=>round.assertCurrent(2),{code:'E_CONVERSATION_STALE'});
  session.cancel();
  assert.equal(round.signal.aborted,true);
  assert.equal(session.getSnapshot().busy,true);
  assert.throws(()=>session.begin(),{code:'E_CONVERSATION_BUSY'});
  round.finish();assert.equal(session.getSnapshot().busy,false);
  assert.ok(notifications>0);unsubscribe();session.dispose();
  assert.throws(()=>session.append('你','late'),{code:'E_TOOL_CHANGED'});

  // Execute the compiled component with hook stubs, without browser/model activity.
  const displayRuntime={...runtime,useRef:()=>({current:null}),useEffect:()=>{},useLayoutEffect:()=>{}};
  const displayContext=vm.createContext({OpenDeskPageReact:displayRuntime,AbortController});
  vm.runInContext(chunk.code,displayContext);
  displayContext.document={createElement:()=>({dataset:{}}),head:{append(){}}};
  displayContext.sharedUIContract.entry.main();
  const frame=displayContext.OpenDeskSidebarUI.SharedConversationFrame;
  const expand=node=>{
    if(node==null||typeof node!=='object')return [];
    if(Array.isArray(node))return node.flatMap(expand);
    if(typeof node.type==='function')return expand(node.type(node.props));
    return [node,...expand(node.props?.children)];
  };
  let sends=0,stops=0,draftChange=null;
  const nodes=expand(frame({inputId:'demo-input',draft:'hello',rows:[{id:'raw',speaker:'你',message:raw}],
    maxLength:123,inputLabel:'输入需求',onSend:event=>{assert.equal(typeof event.preventDefault,'function');sends++;},
    onDraftChange:value=>{draftChange=value;}}));
  assert.equal(nodes.find(node=>node.type==='p').props.children,raw);
  for(const node of nodes)assert.equal(node.props?.dangerouslySetInnerHTML,undefined);
  const inputNode=nodes.find(node=>node.type==='textarea');
  assert.equal(inputNode.props.maxLength,123);
  assert.equal(nodes.find(node=>node.type==='label').props.children,'输入需求');
  inputNode.props.onChange({currentTarget:{value:'changed'}});assert.equal(draftChange,'changed');
  const key=(extra={})=>({key:'Enter',preventDefault(){},nativeEvent:{},...extra});
  inputNode.props.onKeyDown(key({shiftKey:true}));
  inputNode.props.onKeyDown(key({nativeEvent:{isComposing:true}}));
  inputNode.props.onKeyDown(key({nativeEvent:{keyCode:229}}));
  inputNode.props.onCompositionStart();inputNode.props.onKeyDown(key());
  assert.equal(sends,0);
  inputNode.props.onCompositionEnd();inputNode.props.onKeyDown(key());assert.equal(sends,1);
  for(const guard of [{busy:true},{blocked:true},{canSend:false},{open:false},{draft:'  '}]){
    const guarded=expand(frame({draft:'hello',onSend:()=>sends++,...guard}));
    guarded.find(node=>node.type==='form').props.onSubmit(key());
  }
  assert.equal(sends,1);
  const defaults=expand(frame({}));
  assert.equal(defaults.find(node=>node.type==='textarea').props.maxLength,4000);
  assert.equal(defaults.find(node=>node.type==='label').props.children,'对话输入');
  const busyNodes=expand(frame({busy:true,stopLabel:'取消生成',onStop:()=>stops++}));
  const stop=busyNodes.find(node=>node.type==='button');
  assert.equal(stop.props['aria-label'],'取消生成');stop.props.onClick(key());assert.equal(stops,1);
  assert.equal(expand(frame({busy:true})).find(node=>node.type==='button').props['aria-label'],'停止对话');
  const css=nodes.find(node=>node.type==='style').props.children;
  assert.equal(css,await read('src/ui/react/components/conversation-frame.css'));
  assert.match(css,/\.od-conversation-composer\{/);
  assert.doesNotMatch(css,/@import|url\(|expression\(|<script|od-shared-provider|od-conversation-workspace|od-conversation-settings/i);
  const dockCSS=await read('src/ui/react/components/conversation-dock.css');
  assert.doesNotMatch(dockCSS,/^\.od-conversation-(?:log|entry|composer|input)\s*\{/m);
  assert.equal(styles.length,1);
  assert.match(styles[0].textContent,/\.od-button\{/);
  assert.match(styles[0].textContent,/\.od-icon-button\{/);
  assert.throws(()=>compiled.entry.main(),/E_TOOL_SHARED_UI_COLLISION/);
  for(const supplied of [undefined,{...runtime,version:'19.1.0'}])
    assert.throws(()=>vm.runInNewContext(chunk.code,{OpenDeskPageReact:supplied}),/E_TOOL_SHARED_REACT_VERSION/);
  const policy=buildConfig.plugins.find(plugin=>plugin.name==='opendesk-fixed-sidebar-shared-ui');
  for(const change of [{imports:['react']},{dynamicImports:['remote.js']}])
    await assert.rejects(policy.generateBundle({}, {[chunk.fileName]:{...chunk,...change}}),/Non-self-contained/);
});
