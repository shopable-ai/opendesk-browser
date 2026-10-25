import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import {load} from 'cheerio';
import {createSidebarToolsView} from '../../src/ui/sidebar-tools-view.js';

test('ToolHost hides an empty product group while preserving product settings and one management area',async t=>{
  const vite=await createServer({configFile:false,root:process.cwd(),
    appType:'custom',server:{middlewareMode:true,ws:false},logLevel:'error'});
  t.after(()=>vite.close());
  const {ToolHost}=await vite.ssrLoadModule('/src/ui/react/tabs/tool-host.tsx');
  const view=createSidebarToolsView();
  t.after(()=>view.dispose());
  // Isolate presentation states without substituting the React projection.
  for(const id of Object.keys(view.fields))view.patch(id,{hidden:true});
  for(const id of ['sidebar-tool-display','sidebar-tool-settings-view','sidebar-tool-enable','sidebar-tool-open-tab']){
    view.patch(id,{hidden:false});
  }
  const css=await readFile('src/ui/tool-shell.css','utf8');
  const emptyRule=[...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find(([,selector,body])=>
    selector.includes('.sidebar-tool-settings-product:not(')&&/display:\s*none/.test(body));
  assert.ok(emptyRule,'the production stylesheet provides empty-product suppression');
  const emptySelector=emptyRule[1].trim();
  function render(){
    const snapshot=view.getSnapshot();
    const $=load(renderToStaticMarkup(React.createElement(ToolHost,{view})));
    assert.strictEqual(view.getSnapshot(),snapshot,'rendering does not mutate controller state');
    assert.equal($('.sidebar-tool-management').length,1);
    for(const id of ['sidebar-tool-enable','sidebar-tool-open-tab']){
      assert.equal($('.sidebar-tool-management #'+id).length,1);
      assert.equal($('#'+id).parents('[hidden]').length,0);
      assert.equal($('#'+id).is('[hidden]'),false);
    }
    return $;
  }
  function assertEmpty(){
    const $=render();
    assert.equal($('.sidebar-tool-site-shortcuts').is('[hidden]'),true,
      'an empty shortcuts wrapper must not keep the product group alive');
    assert.equal($('.sidebar-tool-settings-product').is(emptySelector),true,
      'the real CSS hiding rule must match the rendered empty product group');
  }
  assertEmpty();
  for(const visible of [
    ['sidebar-tool-visibility'],['sidebar-tool-context-menu'],
    ['sidebar-tool-visibility','sidebar-tool-context-menu']
  ]){
    for(const id of visible)view.patch(id,{hidden:false});
    const $=render();
    assert.equal($('.sidebar-tool-site-shortcuts').is('[hidden]'),false);
    assert.equal($('.sidebar-tool-settings-product').is(emptySelector),false);
    for(const id of visible)assert.equal($('#'+id).is('[hidden]'),false);
    for(const id of visible)view.patch(id,{hidden:true});
    assertEmpty();
  }
  // Each existing product entry alone must keep its section available.
  for(const id of [
    'sidebar-tool-adblock-product-settings','sidebar-tool-toc-language','sidebar-tool-language-manage',
    'sidebar-tool-prompt-web-row','sidebar-tool-prompt-nav-advanced','sidebar-tool-prompt-native-row',
    'sidebar-tool-generic-site-scope','sidebar-tool-generic-site-binary','sidebar-tool-settings-hint',
    'sidebar-tool-visibility-settings','sidebar-tool-generic-site-advanced'
  ]){
    view.patch(id,{hidden:false});
    const $=render();
    assert.equal($('.sidebar-tool-settings-product #'+id).length,1,id);
    assert.equal($('#'+id).is('[hidden]'),false,id);
    assert.equal($('.sidebar-tool-settings-product').is(emptySelector),false,id);
    view.patch(id,{hidden:true});
    assertEmpty();
  }
});
