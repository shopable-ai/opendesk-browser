import test from 'node:test';
import assert from 'node:assert/strict';
import {createPackagedPageSession} from '../../src/scripting/packaged/registry.js';

test('registered script load failure reports the resource contract error and clears both callbacks and held nodes',async()=>{
  const url='chrome-extension://unit/framework/sdk-main.js';
  let node;
  const document={body:{append(value){node=value;}},createElement(){return {removed:false,remove(){this.removed=true;}};}};
  const session=createPackagedPageSession({document,window:{},packageURLs:[url]});
  const pending=session.execute('addScriptTag',[{url}]);
  assert.equal(node.src,url);assert.equal(session.snapshot().resources,1);
  assert.equal(typeof node.onload,'function');assert.equal(typeof node.onerror,'function');
  const failure=assert.rejects(pending,{code:'E_RESOURCE_UNAVAILABLE'});
  node.onerror();await failure;
  assert.equal(node.onload,null);assert.equal(node.onerror,null);assert.equal(node.removed,true);
  assert.deepEqual(session.snapshot(),{waits:0,uploads:0,nodes:0,resources:0});
  session.dispose();assert.deepEqual(session.snapshot(),{waits:0,uploads:0,nodes:0,resources:0});
});
