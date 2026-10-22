import assert from 'node:assert/strict';

// Exercise native editing, including React's controlled-value restoration.
// DOM-only input fixtures do not model the browser caret or undo stack.
export async function verifyDeveloperSourceInput({call,evaluate,until}){
  const key=async(key,options={})=>{
    await call('Input.dispatchKeyEvent',{type:'keyDown',key,...options});
    await call('Input.dispatchKeyEvent',{type:'keyUp',key,...options});
  };
  const click=async selector=>{
    const point=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});
      e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();
      if(!r.width||!r.height||e.matches(':disabled'))throw Error('Unavailable editing control');
      return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    await call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});
    await call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
  };
  const read=()=>evaluate(`(()=>{const e=document.querySelector('#script-source');
    return{value:e.value,start:e.selectionStart,end:e.selectionEnd};})()`);
  const replace=async value=>{
    await click('#script-source');
    await key('a',{code:'KeyA',commands:['selectAll']});
    await call('Input.insertText',{text:value});
  };
  await click('#tab-develop');
  await until(()=>evaluate(`(()=>{const e=document.querySelector('#script-source');
    return!!e?.getClientRects().length&&!e.readOnly&&!e.matches(':disabled');})()`),'editable Developer source');
  const original=await read(),base='alpha omega';
  try{
    await replace(base);
    await key('Home',{code:'Home',commands:['moveToBeginningOfDocument']});
    assert.equal((await read()).start,0,'Native caret moves to the beginning');
    await call('Input.insertText',{text:'one'});
    const first=await read();
    assert.deepEqual(first,{value:'one'+base,start:3,end:3},'First input retains its native caret');
    await call('Input.insertText',{text:'two'});
    const second=await read();
    assert.deepEqual(second,{value:'onetwo'+base,start:6,end:6},'Next input continues at the edited position');
    await key('z',{code:'KeyZ',commands:['undo']});
    const undone=await read();
    assert.notEqual(undone.value,second.value,'Native undo remains available');
    await key('z',{code:'KeyZ',commands:['redo']});
    assert.equal((await read()).value,second.value,'Native redo restores the exact edit');
    return{first,second,undone,status:'PASS'};
  }finally{
    await replace(original.value);
    assert.equal((await read()).value,original.value,'Diagnostic editing restores the original draft');
  }
}
