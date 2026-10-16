import test from 'node:test';
import assert from 'node:assert/strict';
import {transformPinnedReactDomInputTracker} from '../../scripts/react-dom-input-csp.mjs';
import {inspectScript} from '../../scripts/verify-package.mjs';

const modulePath='/repo/node_modules/react-dom/cjs/react-dom-client.production.js';
const target='ui/tool-shell.js';
const source='function trackValueOnNode(node){'+
  'var valueField=isCheckable(node)?"checked":"value";'+
  'var descriptor=Object.getOwnPropertyDescriptor(node.constructor.prototype,valueField);'+
  'if(!node.hasOwnProperty(valueField))return descriptor;}';
const replace=(code,id=modulePath,options={target,reactDomVersion:'19.2.0'})=>
  transformPinnedReactDomInputTracker(code,id,options);

test('pinned ReactDOM input tracker uses the instance prototype without dynamic constructor reads',()=>{
  assert.throws(()=>inspectScript(source,'ui/tool-shell.js'),/Unapproved dynamic constructor reference/);
  const output=replace(source);
  assert.match(output,/Object\.getOwnPropertyDescriptor\(Object\.getPrototypeOf\(node\), valueField\)/);
  assert.doesNotMatch(output,/\.constructor/);
  assert.deepEqual(inspectScript(output,'ui/tool-shell.js'),{approvedAsyncBodyConstructors:0});
  assert.equal(replace(source,modulePath.replace('production','development')),output);
});

test('only the pinned client module in the trusted shell can receive the transform',()=>{
  assert.equal(replace(source,'/repo/node_modules/other/cjs/react-dom-client.production.js'),null);
  assert.equal(replace(source,'\\0'+modulePath+'?commonjs-exports'),null);
  assert.equal(replace(source,modulePath+'?commonjs-proxy'),null);
  assert.equal(replace(source,modulePath,{target:'sw.js',reactDomVersion:'19.2.0'}),null);
  assert.throws(()=>replace(source,modulePath,{target,reactDomVersion:'19.2.1'}),/changed version/);
  for(const tampered of [
    source.replace('node.constructor.prototype','node.constructor.__proto__'),
    source.replace('node.hasOwnProperty(valueField)','node.owns(valueField)'),
    source.replace('"checked"','"active"'),
    source+source,
  ])assert.throws(()=>replace(tampered),/drift/);
});

test('native input prototype descriptor semantics match without trusting an instance constructor',()=>{
  class Input{get value(){return 'sample';}}
  const nativeInput=new Input();
  assert.equal(
    Object.getOwnPropertyDescriptor(nativeInput.constructor.prototype,'value').get,
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(nativeInput),'value').get
  );
  Object.defineProperty(nativeInput,'constructor',{get(){throw Error('overridden constructor must not be read')}});
  assert.equal(typeof Object.getOwnPropertyDescriptor(Object.getPrototypeOf(nativeInput),'value').get,'function');
});
