import './selector-model.js';
import {createCustomSelectorAdapter,inspectSelectors} from './custom-selector-adapter.js';

const model=globalThis.OpenDeskMindmapSelectors;
const keyFor=origin=>origin==='https://chatgpt.com'?'selectors.chatgpt':'selectors.gemini';
const same=(a,b)=>model.fields.every(field=>a?.[field]===b?.[field]);

export async function createPageSettings({bridge,document,builtin,origin}){
  const href=()=>document.defaultView.location.href;
  function checkTarget(payload){
    if(payload?.url!==href()||model.siteFor(href())!==origin)
      throw Error('网页已切换，请重新检查。');
  }
  if(model.sites[origin]?.builtInOnly){
    return {activeAdapter:builtin,onRequest({operation,payload}){
      checkTarget(payload);
      if(operation!=='mindmap.status')throw Error('当前网站使用内置定位。');
      return {origin,saved:null,reloadNeeded:false,...inspectSelectors(document,builtin)};
    }};
  }
  const key=keyFor(origin);
  async function read(){
    const row=await bridge.storage.get({key,withEtag:true});
    if(typeof row?.etag!=='string'||!row.etag)throw Error('无法确认当前定位规则。');
    return {etag:row.etag,rule:row.value==null?null:model.rule(row.value)};
  }
  async function write(value,ifMatch){
    const receipt=await bridge.storage.set({key,value,ifMatch});
    if(receipt?.saved!==true)throw Error('保存结果未确认。');
  }
  const initial=await read();
  const adapterFor=rule=>rule?createCustomSelectorAdapter(origin,rule,builtin):builtin;
  const activeAdapter=adapterFor(initial.rule);
  let tested=null;

  async function onRequest({operation,payload}){
    checkTarget(payload);
    switch(operation){
      case 'mindmap.status': {
        const saved=await read();
        checkTarget(payload);
        return {origin,saved:saved.rule,reloadNeeded:!same(initial.rule,saved.rule),
          ...inspectSelectors(document,activeAdapter,initial.rule)};
      }
      case 'mindmap.test': {
        tested=null;
        const rule=model.rule(payload.rule);
        const {etag}=await read();
        checkTarget(payload);
        const result=inspectSelectors(document,adapterFor(rule),rule);
        if(result.status==='ready'){
          const ticket=globalThis.crypto.randomUUID();
          tested={ticket,url:payload.url,rule,etag};
          return {...result,ticket};
        }
        return result;
      }
      case 'mindmap.save': {
        const rule=model.rule(payload.rule);
        const proof=tested;
        if(!proof||payload.ticket!==proof.ticket||payload.url!==proof.url||!same(rule,proof.rule))
          throw Error('请重新测试这组规则后再保存。');
        if(inspectSelectors(document,adapterFor(rule),rule).status!=='ready'){
          tested=null;
          throw Error('回复状态已变化，请等回复完成后重新测试。');
        }
        tested=null;
        await write(rule,proof.etag);
        return {saved:rule,reloadNeeded:!same(initial.rule,rule)};
      }
      case 'mindmap.reset': {
        const expected=model.rule(payload.saved);
        const saved=await read();
        checkTarget(payload);
        if(!same(expected,saved.rule))throw Error('规则已被其他窗口修改，请重新检查。');
        tested=null;
        await write(null,saved.etag);
        return {saved:null,reloadNeeded:initial.rule!==null};
      }
      default: throw Error('不支持此操作。');
    }
  }
  return {activeAdapter,onRequest};
}
