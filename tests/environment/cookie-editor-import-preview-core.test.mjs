import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
import {inspectImport,rejectImportDuplicates} from '../../examples/sidebar-tools/cookie-editor/app/domain/cookie-model.js';

// Execute the actual component handlers with a small hook/element harness.
// No browser, Host, persistent outputs or package build is involved.
const source=readFileSync(new URL('../../examples/sidebar-tools/cookie-editor/app/components/CookieImport.jsx',import.meta.url),'utf8');
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
  const calls={begin:0,write:[],close:[],notices:[]};
  const props={onBeginImport:()=>{calls.begin++;return true;},
    onImportText:async(text,options)=>{calls.write.push({text,options});return false;},
    onClose:value=>calls.close.push(value),onNotice:(...args)=>calls.notices.push(args),...overrides};
  const Component=new Function('React','Button','CookieImportDropzone','CookieIconButton',
    'inspectImport','rejectImportDuplicates',code+'\nreturn CookieImport;')(
      React,'Button','Dropzone','IconButton',inspectImport,rejectImportDuplicates);
  function nodes(node){return node&&typeof node==='object'?[node,...node.children.flatMap(child=>nodes(child))]:[];}
  const find=predicate=>{const node=nodes(tree).find(predicate);assert.ok(node,'expected element');return node;};
  const label=node=>node.children.map(child=>typeof child==='object'&&child?label(child):child??'').join('');
  function render(){cursor=0;tree=Component(props);return tree;}
  render();
  const input={value:'',focus(){}};
  find(node=>node.type==='textarea').props.ref.current=input;
  find(node=>node.type==='input'&&node.props.type==='file').props.ref.current={value:''};
  const unmount=effects[0]();
  const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();render();};
  return {calls,slots,input,render,flush,find,label,unmount,
    text:()=>label(tree),
    hasConfirm:()=>nodes(tree).some(node=>node.type==='Button'&&label(node)==='确认导入'),
    state:()=>JSON.stringify(slots.filter(slot=>!slot||!Object.hasOwn(slot,'current'))),
    async paste(text){input.value=text;find(node=>node.type==='textarea').props.onInput({currentTarget:input});render();},
    async file(text,name='cookies.json'){find(node=>node.type==='Dropzone').props.onDrop({preventDefault(){},dataTransfer:{files:[{name,size:text.length,text:async()=>text}]}});render();},
    async click(text){const node=find(node=>node.type==='Button'&&label(node)===text);
      if(!node.props.disabled)node.props.onClick();await flush();},
    async overwrite(checked){find(node=>node.type==='input'&&node.props.type==='checkbox').props.onChange({currentTarget:{checked}});render();}
  };
}
const secret='SECRET_IMPORT_VALUE_812';
const json=JSON.stringify([{name:'session_id',domain:'.example.com',path:'/app',value:secret}]);

test('paste preview is redacted and read-only; explicit confirmation alone starts intent and writes',async()=>{
  const app=mount();await app.paste(json);await app.click('预览导入');
  assert.equal(app.calls.begin,0);assert.equal(app.calls.write.length,0);
  assert.match(app.text(),/session_id.*\.example.com.*\/app/);
  assert.match(app.text(),/共 1 条，可导入 1 条/);assert.match(app.text(),/将覆盖/);
  assert.ok(!app.text().includes(secret));assert.ok(!app.state().includes(secret));
  await app.click('确认导入');
  assert.equal(app.calls.begin,1);assert.deepEqual(app.calls.write,[{text:json,options:{overwrite:true}}]);
  assert.equal(app.input.value,json,'failure keeps original input');
  await app.click('预览导入');assert.equal(app.calls.write.length,1,'no automatic replay');
});

test('file, Header and Netscape use the shared parser without displaying values',async()=>{
  for(const text of [json,'session_id='+secret,
    '.example.com\tTRUE\t/app\tFALSE\t0\tsession_id\t'+secret]){
    const app=mount();await app.file(text);await app.click('预览导入');
    assert.match(app.text(),/共 1 条，可导入 1 条/);
    assert.ok(!app.text().includes(secret));assert.ok(!app.state().includes(secret));
    assert.equal(app.calls.begin,0);await app.click('确认导入');
    assert.equal(app.calls.write[0].text,text);
  }
});

test('editing text, replacing files and changing overwrite invalidate confirmation',async()=>{
  const app=mount();await app.paste(json);await app.click('预览导入');
  await app.paste('changed='+secret);assert.ok(!app.hasConfirm());
  await app.click('预览导入');await app.file(json);assert.ok(!app.hasConfirm());
  await app.click('预览导入');await app.overwrite(false);assert.ok(!app.hasConfirm());
  await app.click('预览导入');assert.match(app.text(),/不覆盖/);
  await app.click('确认导入');assert.equal(app.calls.write[0].options.overwrite,false);
});

test('cancel/discard never admits or writes; invalid input is retained and errors never echo secrets',async()=>{
  const app=mount();await app.paste(json);await app.click('预览导入');
  await app.click('取消');await app.click('放弃内容');
  assert.equal(app.calls.begin,0);assert.equal(app.calls.write.length,0);assert.equal(app.calls.close.length,1);
  const bad=mount();await bad.paste('["'+secret);await bad.click('预览导入');
  assert.equal(bad.input.value,'["'+secret);assert.equal(bad.calls.begin,0);
  assert.ok(!JSON.stringify(bad.calls.notices).includes(secret));
  assert.ok(!bad.hasConfirm());
});

test('invalid, expired and duplicate records are shown as skipped and cannot confirm an empty plan',async()=>{
  const app=mount();await app.paste(JSON.stringify([
    {name:'dup',value:secret,domain:'example.com'},
    {name:'dup',value:secret,domain:'example.com'},
    {name:'expired',value:secret,domain:'example.com',session:false,expirationDate:1},
    {name:'invalid',value:secret,domain:'bad host'}]));
  await app.click('预览导入');assert.match(app.text(),/共 4 条，可导入 0 条/);
  await app.click('确认导入');assert.equal(app.calls.begin,0);assert.equal(app.calls.write.length,0);
});

test('unknown and thrown writes lock further attempts; a denied intent never writes',async()=>{
  for(const result of ['unknown','throw']){
    let writes=0;
    const app=mount({onImportText:async()=>{writes++;if(result==='throw')throw Error(secret);return result;}});
    await app.paste(json);await app.click('预览导入');await app.click('确认导入');
    await app.click('预览导入');assert.equal(writes,1);assert.equal(app.calls.begin,1);
    assert.equal(app.input.value,json);assert.ok(!JSON.stringify(app.calls.notices).includes(secret));
  }
  const denied=mount({onBeginImport:()=>false});await denied.paste(json);
  await denied.click('预览导入');await denied.click('确认导入');assert.equal(denied.calls.write.length,0);
});

test('double confirmation cannot write twice and successful import clears the secret input',async()=>{
  let finish,writes=0;
  const app=mount({onImportText:()=>{writes++;return new Promise(resolve=>{finish=resolve;});}});
  await app.paste(json);await app.click('预览导入');
  const confirm=app.find(node=>node.type==='Button'&&app.label(node)==='确认导入').props.onClick;
  confirm();confirm();await app.flush();assert.equal(writes,1);
  finish(true);await app.flush();assert.equal(app.input.value,'');
  assert.deepEqual(app.calls.close,[{committed:true}]);
});


test('confirmation respects the draft guard and unmount while intent is pending prevents writes',async()=>{
  const guarded=mount({onBeforeSubmit:()=>false});
  await guarded.paste(json);await guarded.click('预览导入');await guarded.click('确认导入');
  assert.equal(guarded.calls.begin,0);assert.equal(guarded.calls.write.length,0);
  let admit;
  const app=mount({onBeginImport:()=>new Promise(resolve=>{admit=resolve;})});
  await app.paste(json);await app.click('预览导入');await app.click('确认导入');
  app.unmount();admit(true);await app.flush();assert.equal(app.calls.write.length,0);
});

test('failed file reads retain the selected file without intent or writes',async()=>{
  const app=mount();
  app.find(node=>node.type==='Dropzone').props.onDrop({preventDefault(){},dataTransfer:{files:[{
    name:'failed.json',size:40,text:async()=>{throw Error(secret);}}]}});
  app.render();await app.click('预览导入');
  assert.match(app.text(),/failed.json/);assert.equal(app.calls.begin,0);
  assert.equal(app.calls.write.length,0);assert.ok(!JSON.stringify(app.calls.notices).includes(secret));
  assert.equal(app.hasConfirm(),false);
});
