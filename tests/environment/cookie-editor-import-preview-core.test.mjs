import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';

// Execute the actual component handlers with a small hook/element harness.
// No browser, Host, persistent outputs or package build is involved.
const source=readFileSync(new URL('../../projects/cookie-editor/app/components/CookieImport.jsx',import.meta.url),'utf8');
const code=transformSync(source.replace(/^import .*;\n/gm,'').replace('export default function','function'),
  {loader:'jsx',jsx:'transform'}).code;
function mount(overrides={}){
  const slots=[],effects=[];let cursor=0,tree;
  const React={
    useRef(value){const i=cursor++;return slots[i]??=( {current:value});},
    useState(value){const i=cursor++;if(!(i in slots))slots[i]=value;
      return [slots[i],next=>{slots[i]=typeof next==='function'?next(slots[i]):next;}];},
    useId(){return 'import-heading';},
    useLayoutEffect(fn){if(!effects.length)effects.push(fn);},
    createElement(type,props,...children){return {type,props:props||{},children:children.flat(Infinity)};},
    Fragment:'fragment'
  };
  const calls={begin:0,write:[],close:[],notices:[],abandon:0,order:[]};
  const props={onBeginImport:()=>{calls.begin++;calls.order.push('begin');return true;},
    onImportText:async(text,options)=>{calls.write.push({text,options});return false;},
    onAbandonIntent:()=>{calls.abandon++;},
    onClose:value=>calls.close.push(value),onNotice:(...args)=>calls.notices.push(args),...overrides};
  const Component=new Function('React','Button','CookieImportDropzone','CookieIconButton',
    code+'\nreturn CookieImport;')(React,'Button','Dropzone','IconButton');
  function nodes(node){return node&&typeof node==='object'?[node,...node.children.flatMap(child=>nodes(child))]:[];}
  const find=predicate=>{const node=nodes(tree).find(predicate);assert.ok(node,'expected element');return node;};
  const label=node=>node.children.map(child=>typeof child==='object'&&child?label(child):child??'').join('');
  function render(){cursor=0;tree=Component(props);return tree;}
  render();
  const input={value:'',focus(){}};
  const dialog={open:false,showModal(){this.open=true;},close(){this.open=false;},
    getBoundingClientRect(){return {left:20,right:400,top:100,bottom:600};}};
  find(node=>node.type==='dialog').props.ref.current=dialog;
  find(node=>node.type==='textarea').props.ref.current=input;
  find(node=>node.type==='input'&&node.props.type==='file').props.ref.current={value:''};
  const unmount=effects[0]();
  const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();render();};
  return {calls,slots,input,dialog,render,flush,find,label,unmount,
    text:()=>label(tree),
    state:()=>JSON.stringify(slots.filter(slot=>!slot||!Object.hasOwn(slot,'current'))),
    async paste(text){input.value=text;find(node=>node.type==='textarea').props.onInput({currentTarget:input});render();},
    async file(text,name='cookies.json'){
      find(node=>node.type==='dialog').props.onDrop({preventDefault(){},
        dataTransfer:{types:['Files'],files:[{name,size:text.length,text:async()=>{calls.order.push('read');return text;}}]}});
      render();
    },
    async click(text){const node=find(node=>node.type==='Button'&&label(node)===text);
      if(!node.props.disabled)node.props.onClick();await flush();},
    async overwrite(checked){find(node=>node.type==='input'&&node.props.type==='checkbox').props.onChange({currentTarget:{checked}});render();}
  };
}
const secret='SECRET_IMPORT_VALUE_812';
const json=JSON.stringify([{name:'session_id',domain:'.example.com',path:'/app',value:secret}]);

test('pasting remains private and read-only until the single explicit import confirmation',async()=>{
  const app=mount();assert.equal(app.dialog.open,true);await app.paste(json);
  assert.equal(app.calls.begin,0);assert.equal(app.calls.write.length,0);
  assert.ok(!app.text().includes(secret));assert.ok(!app.state().includes(secret));
  assert.doesNotMatch(app.text(),/预览导入/);
  await app.click('确认导入');
  assert.equal(app.calls.begin,1);assert.deepEqual(app.calls.write,[{text:json,options:{overwrite:true}}]);
  assert.equal(app.input.value,json,'failure keeps original input');
  await app.flush();assert.equal(app.calls.write.length,1,'no automatic replay');
});

test('staged files stay unread until confirmation and trusted admission starts before the file read',async()=>{
  for(const text of [json,'session_id='+secret,
    '.example.com\tTRUE\t/app\tFALSE\t0\tsession_id\t'+secret]){
    const app=mount();await app.file(text);
    assert.deepEqual(app.calls.order,[]);assert.equal(app.calls.write.length,0);
    assert.ok(!app.text().includes(secret));assert.ok(!app.state().includes(secret));
    assert.equal(app.calls.begin,0);await app.click('确认导入');
    assert.deepEqual(app.calls.order,['begin','read']);
    assert.equal(app.calls.write[0].text,text);
  }
});

test('editing text, replacing files and changing overwrite stage only the latest input',async()=>{
  const app=mount();await app.paste(json);await app.file(json);
  assert.equal(app.input.value,'');
  await app.paste('changed='+secret);await app.overwrite(false);
  assert.equal(app.calls.begin,0);assert.equal(app.calls.write.length,0);
  await app.click('确认导入');assert.equal(app.calls.write[0].options.overwrite,false);
  assert.equal(app.calls.write[0].text,'changed='+secret);
  assert.deepEqual(app.calls.order,['begin'],'replaced files must not be read');
});

test('cancel and discard never admit or write and unmount clears the secret input',async()=>{
  const app=mount();await app.paste(json);
  await app.click('取消');await app.click('放弃内容');
  assert.equal(app.calls.begin,0);assert.equal(app.calls.write.length,0);assert.equal(app.calls.close.length,1);
  app.unmount();assert.equal(app.input.value,'');assert.equal(app.dialog.open,false);
});

test('empty input and oversized files cannot start admission or writes',async()=>{
  const app=mount();await app.click('确认导入');
  app.find(node=>node.type==='input'&&node.props.type==='file').props.onChange({
    currentTarget:{files:[{name:'oversized.json',size:8*1024*1024+1,
      text:async()=>{throw Error('oversized file must not be read');}}]}});
  app.render();await app.click('确认导入');
  assert.equal(app.calls.begin,0);assert.equal(app.calls.write.length,0);
  assert.match(JSON.stringify(app.calls.notices),/8 MiB/);
});

test('unknown and thrown writes lock further attempts; a denied intent never writes',async()=>{
  for(const result of ['unknown','throw']){
    let writes=0;
    const app=mount({onImportText:async()=>{writes++;if(result==='throw')throw Error(secret);return result;}});
    await app.paste(json);await app.click('确认导入');
    await app.click('确认导入');assert.equal(writes,1);assert.equal(app.calls.begin,1);
    assert.equal(app.input.value,json);assert.ok(!JSON.stringify(app.calls.notices).includes(secret));
  }
  const denied=mount({onBeginImport:()=>false});await denied.paste(json);
  await denied.click('确认导入');assert.equal(denied.calls.write.length,0);
});

test('double confirmation cannot write twice and successful import clears the secret input',async()=>{
  let finish,writes=0;
  const app=mount({onImportText:()=>{writes++;return new Promise(resolve=>{finish=resolve;});}});
  await app.paste(json);
  const confirm=app.find(node=>node.type==='Button'&&app.label(node)==='确认导入').props.onClick;
  confirm();confirm();await app.flush();assert.equal(writes,1);
  finish(true);await app.flush();assert.equal(app.input.value,'');
  assert.deepEqual(app.calls.close,[{committed:true}]);
});


test('confirmation respects the draft guard and unmount while intent is pending prevents writes',async()=>{
  const guarded=mount({onBeforeSubmit:()=>false});
  await guarded.paste(json);await guarded.click('确认导入');
  assert.equal(guarded.calls.begin,0);assert.equal(guarded.calls.write.length,0);
  let admit;
  const app=mount({onBeginImport:()=>new Promise(resolve=>{admit=resolve;})});
  await app.paste(json);await app.click('确认导入');
  app.unmount();admit(true);await app.flush();assert.equal(app.calls.write.length,0);
  assert.equal(app.calls.abandon,1);
});

test('failed file reads retain the selection, abandon unused admission and never write',async()=>{
  const app=mount();
  app.find(node=>node.type==='input'&&node.props.type==='file').props.onChange({
    currentTarget:{files:[{name:'failed.json',size:40,text:async()=>{throw Error(secret);}}]}});
  app.render();await app.click('确认导入');
  assert.match(app.text(),/failed.json/);assert.equal(app.calls.begin,1);assert.equal(app.calls.abandon,1);
  assert.equal(app.calls.write.length,0);assert.ok(!JSON.stringify(app.calls.notices).includes(secret));
});

test('nested file-picker clicks keep the dialog open while an actual backdrop click closes it',()=>{
  const app=mount(),click=app.find(node=>node.type==='dialog').props.onClick;
  click({target:app.input,currentTarget:app.dialog,clientX:0,clientY:0});
  assert.equal(app.calls.close.length,0);assert.equal(app.dialog.open,true);
  click({target:app.dialog,currentTarget:app.dialog,clientX:0,clientY:0});
  assert.equal(app.calls.close.length,1);
});
