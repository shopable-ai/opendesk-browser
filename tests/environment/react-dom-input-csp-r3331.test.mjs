import test from 'node:test';
import assert from 'node:assert/strict';
import {transformPinnedReactDomInputTracker,transformPinnedReactDomReplayClone} from '../../scripts/react-dom-input-csp.mjs';
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

test('development ReactDOM separates value-field selection from the tracker itself',()=>{
  const fixture='function trackValueOnNode(node,valueField){'+
    'var descriptor=Object.getOwnPropertyDescriptor(node.constructor.prototype,valueField);'+
    'if(node.hasOwnProperty(valueField))return;'+
    'Object.defineProperty(node,valueField,{configurable:true});}'+
    'function track(node){var key=isCheckable(node)?"checked":"value";return trackValueOnNode(node,key);}';
  const output=replace(fixture,modulePath.replace('production','development'));
  assert.doesNotMatch(output,/\.constructor/);
  assert.deepEqual(inspectScript(output,'ui/tool-shell.js'),{approvedAsyncBodyConstructors:0});
  assert.throws(()=>replace(fixture.replace('Object.defineProperty','Object.unsafeProperty'),
    modulePath.replace('production','development')),/drift/);
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


const replaySource='function replayContinuousEvent(queuedEvent){'+
  'var nativeEvent=queuedEvent.nativeEvent;'+
  'var nativeEventClone=new nativeEvent.constructor(nativeEvent.type,nativeEvent);'+
  'nativeEvent.target.dispatchEvent(nativeEventClone);}';

test('pinned ReactDOM replay constructs only reviewed native browser event subclasses',()=>{
  assert.throws(()=>inspectScript(replaySource,'ui/tool-shell.js'),/Unapproved dynamic constructor reference/);
  const clean=transformPinnedReactDomReplayClone(replaySource,modulePath,
    {target,reactDomVersion:'19.2.0'});
  assert.doesNotMatch(clean,/\.constructor/);
  for(const ctor of ['PointerEvent','DragEvent','FocusEvent','MouseEvent','Event'])
    assert.match(clean,new RegExp('new '+ctor+'\\(event\\.type,event\\)'));
  assert.deepEqual(inspectScript(clean,'ui/tool-shell.js'),{approvedAsyncBodyConstructors:0});
  assert.throws(()=>transformPinnedReactDomReplayClone(replaySource.replace('.dispatchEvent(','.dispatchPrivate('),
    modulePath,{target,reactDomVersion:'19.2.0'}),/drift/);
  assert.equal(transformPinnedReactDomReplayClone(replaySource,'\0'+modulePath+'?commonjs-exports',
    {target,reactDomVersion:'19.2.0'}),null);
  assert.throws(()=>transformPinnedReactDomReplayClone(replaySource.replace(
    'new nativeEvent.constructor(nativeEvent.type,nativeEvent)',
    'new nativeEvent.constructor(nativeEvent.type,otherEvent)'),
    modulePath,{target,reactDomVersion:'19.2.0'}),/drift/);
});
