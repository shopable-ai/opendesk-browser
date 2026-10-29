import test from 'node:test';
import assert from 'node:assert/strict';
import {build,stop} from 'esbuild';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import * as React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {parseHTML} from 'linkedom';

// Render the real permission card with the same shared Button as the sandbox.
// No Host, Chrome APIs or alternate UI markup is substituted.
const require=createRequire(import.meta.url);
let component;
async function render(props){
  component??=(async()=>{
    try{
      const result=await build({
        entryPoints:[resolve('examples/sidebar-tools/cookie-editor/app/components/CookiePermissions.jsx')],
        bundle:true,write:false,platform:'node',format:'esm',jsx:'transform',
        alias:{'@opendesk/ui':resolve('src/ui/react/components/ui/button.tsx')},
        plugins:[{name:'shared-react',setup(builder){
          builder.onResolve({filter:/^react$/},()=>({
            path:pathToFileURL(require.resolve('react')).href,external:true}));
        }}]
      });
      return (await import('data:text/javascript;base64,'+
        Buffer.from(result.outputFiles[0].text).toString('base64'))).default;
    }finally{stop();}
  })();
  const Card=await component;
  return parseHTML('<main>'+renderToStaticMarkup(React.createElement(Card,props))+'</main>').document;
}

test('stable restricted or missing pages show one status card without actions',async()=>{
  for(const reason of ['E_UNSUPPORTED_SCHEME','E_INCOGNITO','E_NO_ACTIVE_TAB','E_WINDOW_UNAVAILABLE']){
    const doc=await render({phase:'blocked',reason});
    assert.equal(doc.querySelectorAll('[role="status"]').length,1);
    assert.equal(doc.querySelectorAll('button').length,0);
    assert.doesNotMatch(doc.querySelector('main').textContent,/离线文件|网页正在切换/);
    assert.match(doc.querySelector('p').textContent,/普通.*网站/);
  }
});

test('an unresolved document describes uncertainty and offers only manual recheck',async()=>{
  const doc=await render({phase:'blocked',reason:'E_DOCUMENT_UNRESOLVED'});
  assert.match(doc.querySelector('strong').textContent,/暂时无法确认当前网页/);
  assert.deepEqual([...doc.querySelectorAll('button')].map(node=>node.textContent),['重新检查']);
  assert.doesNotMatch(doc.querySelector('main').textContent,/离线文件|网页正在切换/);
});

test('ready and Host grant states stay quiet while recoverable failures retain existing recovery actions',async()=>{
  for(const props of [{phase:'ready'}, {phase:'blocked',reason:'E_SITE_GRANT_REQUIRED'}]){
    const doc=await render(props);
    assert.equal(doc.querySelector('main').innerHTML,'');
  }
  const doc=await render({phase:'blocked',reason:'E_CHROME_PERMISSION_REQUIRED',disabled:true});
  assert.deepEqual([...doc.querySelectorAll('button')].map(node=>node.textContent),['重新检查','离线文件']);
  assert.ok([...doc.querySelectorAll('button')].every(node=>node.hasAttribute('disabled')));
});
