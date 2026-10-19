import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transform} from 'esbuild';
import {parseHTML} from 'linkedom';
import * as React from 'react';
import {createDeveloperView, developerAction} from '../../src/ui/develop-view.js';

const compiled = await transform(await readFile(new URL('../../src/ui/react/tabs/develop-controls.tsx', import.meta.url), 'utf8'),
  {loader:'tsx', format:'esm', jsx:'transform'});
const {DevelopProvider, DevelopField} = await import('data:text/javascript;base64,' + Buffer.from(
  compiled.code.replace('"react"', JSON.stringify(import.meta.resolve('react')))).toString('base64'));

test('R37 source input, composition, mode, focus and Run/Stop retain their React nodes and controller actions', async t => {
  const {window, document} = parseHTML('<html><body><div id="mount"></div></body></html>');
  const previous = {window:globalThis.window, document:globalThis.document, act:globalThis.IS_REACT_ACT_ENVIRONMENT};
  globalThis.window=window; globalThis.document=document; globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  const {createRoot} = await import('react-dom/client');
  const root=createRoot(document.getElementById('mount')), view=createDeveloperView();
  t.after(async () => {
    await React.act(async () => root.unmount()); view.dispose();
    globalThis.window=previous.window; globalThis.document=previous.document; globalThis.IS_REACT_ACT_ENVIRONMENT=previous.act;
  });
  const inputs=[], modes=[], runs=[], stops=[], candidates=[];
  developerAction(view,view.fields['script-source'],'input',event=>inputs.push([view.fields['script-source'].value,event]));
  developerAction(view,view.fields['page-component-react'],'change',event=>modes.push(event));
  developerAction(view,view.fields['script-run'],'click',event=>runs.push([view.fields['script-source'].value,event]));
  developerAction(view,view.fields['script-stop'],'click',event=>stops.push(event));
  const releaseCandidate=developerAction(view,view.fields['task-create-candidate'],'click',event=>candidates.push(event));
  view.patch('script-run',{disabled:false}); view.patch('script-stop',{disabled:false});
  await React.act(async () => root.render(React.createElement(DevelopProvider,{view},
    React.createElement('section',{id:'source-editor'},
      React.createElement(DevelopField,{as:'textarea',id:'script-source'}),
      React.createElement(DevelopField,{as:'input',id:'page-component-react',type:'radio'}),
      React.createElement(DevelopField,{as:'button',id:'script-run',title:'运行操作'}),
      React.createElement(DevelopField,{as:'button',id:'script-stop'}),
      React.createElement(DevelopField,{as:'button',id:'task-create-candidate'})))));
  const source=document.getElementById('script-source'), container=source.parentNode;
  const composing=new window.Event('input',{bubbles:true}); composing.isComposing=true;
  await React.act(async () => {source.value='拼'; source.dispatchEvent(composing);});
  assert.deepEqual(inputs,[['拼',composing]],'composition input stays in the same controller draft');
  const committed=new window.Event('input',{bubbles:true});
  await React.act(async () => {source.value='拼音输入'; source.dispatchEvent(committed);});
  const focused=[],scrolls=[];
  source.focus=()=>focused.push(source); source.scrollIntoView=options=>scrolls.push(options);
  await React.act(async () => {view.patch('script-status',{textContent:'轮询更新'});view.focus('script-source');});
  assert.equal(document.getElementById('script-source'),source);
  assert.equal(source.parentNode,container); assert.equal(source.value,'拼音输入');
  assert.deepEqual(focused,[source]); assert.deepEqual(scrolls,[{block:'nearest'}]);
  const radio=document.getElementById('page-component-react'), mode=new window.Event('click',{bubbles:true});
  await React.act(async () => {radio.checked=true;radio.dispatchEvent(mode);});
  assert.deepEqual(modes,[mode],'one mode change invokes one controller action');
  const run=new window.Event('click',{bubbles:true}), stop=new window.Event('click',{bubbles:true});
  document.getElementById('script-run').dispatchEvent(run);document.getElementById('script-stop').dispatchEvent(stop);
  assert.deepEqual(runs,[['拼音输入',run]]);assert.deepEqual(stops,[stop]);
  const candidate=new window.Event('click',{bubbles:true});
  document.getElementById('task-create-candidate').dispatchEvent(candidate);
  assert.deepEqual(candidates,[candidate],'TaskWorkbench can own the same React action API');
  releaseCandidate();
  document.getElementById('task-create-candidate').dispatchEvent(new window.Event('click',{bubbles:true}));
  assert.deepEqual(candidates,[candidate],'TaskWorkbench cleanup releases only its action');
  await React.act(async () => view.patch('script-run',{disabled:true}));
  document.getElementById('script-run').dispatchEvent(new window.Event('click',{bubbles:true}));
  assert.equal(runs.length,1);
  await React.act(async () => view.patch('script-run',{title:''}));
  assert.equal(document.getElementById('script-run').title,'');
});

test('R37 disposed developer views cannot publish a focus request', () => {
  const view=createDeveloperView();
  assert.throws(()=>view.focus('unknown'),/E_DEVELOPER_FIELD/);
  view.dispose();
  const snapshot=view.getSnapshot();
  view.focus('script-source');
  assert.equal(view.getSnapshot(),snapshot);
  assert.deepEqual(view.resourceSnapshot(),{subscriptions:0,actions:0});
});
