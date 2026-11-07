import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {buildSync} from 'esbuild';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

test('the installed App renders all six tabs, including enterprise HTTP wiring, without unresolved callbacks or render-time side effects',()=>{
  const require=createRequire(import.meta.url),module={exports:{}};
  const build=buildSync({entryPoints:[new URL('../app/CookieEditorApp.jsx',import.meta.url).pathname],
    bundle:true,write:false,format:'cjs',platform:'node',external:['react','@opendesk/ui'],jsx:'automatic'});
  new Function('require','module','exports',build.outputFiles[0].text)(name=>name==='@opendesk/ui'
    ?{Button:({children,...props})=>React.createElement('button',props,children)}:require(name),module,module.exports);
  const request=()=>{throw Error('Render must not perform privileged IO');};
  for(const initialSection of ['cookie','accounts','enterprise','market','custom','circle']){
    const html=renderToStaticMarkup(React.createElement(module.exports.default,{initialSection,request,hostRoot:{}}));
    assert.equal((html.match(/role="tab"/g)||[]).length,6);
    if(initialSection==='enterprise'){
      assert.match(html,/服务连接/);assert.match(html,/无需安装本机辅助程序/);
      assert.ok(!html.includes('旧 Native 连接记录'));
    }
  }
});
