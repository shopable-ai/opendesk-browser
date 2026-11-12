import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import vm from 'node:vm';

async function previewFixture(){
  const html=await fs.readFile(new URL('../preview/index.html',import.meta.url),'utf8');
  const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script,'standalone preview script exists');
  const nodes=new Map();
  function element(id){
    if(nodes.has(id))return nodes.get(id);
    const listeners=new Map();
    const item={
      id,listeners,style:{},hidden:false,textContent:'',
      value:id==='mock-trigger'?'right':id==='mock-menu-policy'?'native-first':
        id==='mock-combo'?'left-down':id==='mock-combo-action'?'none':'',
      checked:id==='gesture-enabled'||id==='mock-trace',
      clientWidth:330,clientHeight:140,
      setAttribute(){},focus(){},
      setPointerCapture(){},releasePointerCapture(){},
      getBoundingClientRect(){return {left:0,top:0,width:330,height:140};},
      addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn);}
    };
    nodes.set(id,item);return item;
  }
  const document={listeners:new Map(),
    getElementById:element,
    addEventListener(type,fn){
      if(!this.listeners.has(type))this.listeners.set(type,[]);
      this.listeners.get(type).push(fn);
    }
  };
  new vm.Script(script).runInNewContext({document});
  function emit(id,type,options={}){
    const obj=id==='document'?document:element(id);
    const event={
      pointerId:7,pointerType:'mouse',button:2,buttons:2,altKey:false,
      clientX:210,clientY:70,key:'',prevented:false,stopped:false,
      preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;},
      ...options
    };
    for(const fn of obj.listeners.get(type)||[])fn(event);
    return event;
  }
  return {emit,element};
}

test('right-button practice blocks only the pad native menu and completes a drag',async()=>{
  const f=await previewFixture();
  assert.equal(f.element('mock-trigger').value,'right');
  assert.equal(f.emit('practice-pad','contextmenu',{button:2}).prevented,true);
  assert.equal(f.emit('practice-pad','contextmenu',{button:0}).prevented,false,
    'keyboard context menu is not consumed');
  const down=f.emit('practice-pad','pointerdown');
  assert.equal(down.prevented,true);
  f.emit('practice-pad','pointermove',{clientX:100,buttons:2});
  f.emit('practice-pad','pointerup',{clientX:100});
  assert.match(f.element('practice-status').textContent,/已识别 左.*模拟后退/);
});

test('preview selected Alt-left mode ignores plain right drag and leaves right menu native',async()=>{
  const f=await previewFixture();
  f.element('mock-trigger').value='alt-left';
  f.emit('mock-trigger','change');
  assert.equal(f.emit('practice-pad','contextmenu',{button:2}).prevented,false);
  f.emit('practice-pad','pointerdown',{button:2});
  assert.equal(f.element('practice-status').textContent,'等待拖动（仅模拟）');
  f.emit('practice-pad','pointerdown',{button:0,buttons:1,altKey:false});
  assert.equal(f.element('practice-status').textContent,'等待拖动（仅模拟）');
  f.emit('practice-pad','pointerdown',{button:0,buttons:1,altKey:true});
  f.emit('practice-pad','pointermove',{button:0,buttons:1,altKey:true,clientX:100});
  f.emit('practice-pad','pointerup',{button:0,buttons:1,altKey:true,clientX:100});
  assert.match(f.element('practice-status').textContent,/已识别 左.*模拟后退/);
});

test('practice rejects foreign pointers, stops on Escape and respects disabled toggle',async()=>{
  const f=await previewFixture();
  f.emit('practice-pad','pointerdown');
  f.emit('practice-pad','pointermove',{pointerId:999,clientX:100});
  f.emit('practice-pad','pointerup',{pointerId:999,clientX:100});
  assert.match(f.element('practice-status').textContent,/移动超过/);
  const escape=f.emit('document','keydown',{key:'Escape'});
  assert.equal(escape.prevented,true);
  assert.match(f.element('practice-status').textContent,/Esc 已取消/);
  f.element('gesture-enabled').checked=false;
  f.emit('gesture-enabled','change');
  assert.equal(f.emit('practice-pad','contextmenu',{button:2}).prevented,false);
  f.emit('practice-pad','pointerdown');
  assert.match(f.element('practice-status').textContent,/已关闭/);
});

test('preview keeps formal native-first choice visible while sandbox remains isolated',async()=>{
  const f=await previewFixture();
  assert.equal(f.element('mock-menu-policy').value,'native-first');
  f.element('mock-menu-policy').value='gesture-first';
  f.emit('mock-menu-policy','change');
  assert.match(f.element('mock-menu-note').textContent,/Shift/);
  assert.equal(f.emit('practice-pad','contextmenu',{button:2}).prevented,true);
});
