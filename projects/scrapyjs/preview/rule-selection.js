import {normalizeConfig} from '../engine/browser.js';
// Offline DOM only. These helpers never query the target tab or invoke a Task.
const escapeCSS=value=>Array.from(value,char=>'\\'+char.codePointAt(0).toString(16)+' ').join('');
const safeToken=value=>/^[a-zA-Z_][\w-]*$/.test(value)?value:escapeCSS(value);
// Candidate discovery is bounded to the offline sample. A container selector
// must identify one list; its records follow the engine's direct-child rule.
export function listContainerChoices(root,item=''){
  try{
    if(item.trim())root.querySelectorAll(item.trim());
    return Array.from(root.querySelectorAll('ul,ol')).flatMap(node=>{
      const children=Array.from(node.children),filter=item.trim()||'li';
      const rows=children.filter(child=>child.matches(filter));
      if(rows.length<2)return [];
      const byId=node.id?'#'+safeToken(node.id):'';
      let container=byId&&root.querySelectorAll(byId).length===1?byId:'';
      if(!container){
        const parts=[];
        for(let current=node;current&&current!==root;current=current.parentElement){
          const peers=Array.from(current.parentElement?.children||[current]).filter(peer=>peer.localName===current.localName);
          parts.unshift(current.localName+(peers.length>1?':nth-of-type('+(peers.indexOf(current)+1)+')':''));
          const candidate=parts.join(' > ');
          if(root.querySelectorAll(candidate).length===1){container=candidate;break;}
        }
      }
      if(!container)return [];
      if(root.querySelectorAll(container).length!==1)return [];
      return [{container,item:filter,count:rows.length,label:node.getAttribute('aria-label')||'列表',samples:rows.slice(0,3).map(row=>row.textContent.trim().replace(/\s+/g,' ').slice(0,120))}];
    });
  }catch{return [];}
}
export function suggestSelector(element,item){
  if(!item?.contains(element))throw Error('请在列表项内选择元素');
  if(element===item)return '.';
  const parts=[];
  for(let node=element;node&&node!==item;node=node.parentElement){
    const tag=node.localName;
    // Prefer semantic classes to positional paths; never borrow a per-record id.
    const classes=[...node.classList].filter(name=>!/^is-|^selected$|^active$|\d{4,}/.test(name)).slice(0,2);
    const part=tag+classes.map(name=>'.'+safeToken(name)).join('');parts.unshift(part);
    const candidate=parts.join(' > '),matches=item.querySelectorAll(candidate);
    if(matches.length===1&&matches[0]===element)return candidate;
  }
  // Positional fallback is explicit so users can review its fragility.
  const path=[];
  for(let node=element;node&&node!==item;node=node.parentElement){
    const siblings=[...node.parentElement.children].filter(peer=>peer.localName===node.localName);
    path.unshift(node.localName+(siblings.length>1?':nth-of-type('+(siblings.indexOf(node)+1)+')':''));
  }
  return path.join(' > ');
}
export function probeRule(root,rule,container,item){
  const fail=error=>({status:'error',error,total:0,matched:0,missing:0,empty:0,ambiguous:0,rows:[]});
  if(typeof rule!=='string')return fail('复杂规则请在 JSON 中审阅，当前示例验证不支持。');
  const match=/^(.*)::([\w:-]+)$/.exec(rule.trim());
  const selector=(match?match[1]:rule).trim(),read=match?match[2]:'text';
  if(!selector||/^(?:xpath=|\(?\.?\/)/.test(selector)||['html','innerHTML','outerHTML'].includes(read))return fail('当前只验证 CSS 的文本或属性取值。');
  try{
    const plan=normalizeConfig({...container?.trim()?{_listContainer:container}:{},...item?.trim()?{_listItem:item}:{},value:'*'});
    const scopes=plan.listSelector?Array.from(root.querySelectorAll(plan.listSelector)):[root];
    const selected=plan.itemSelector?new Set(root.querySelectorAll(plan.itemSelector)):null; // validate even if scope is empty
    const seen=new Set(scopes.flatMap(scope=>Array.from(scope.children||[])));
    const items=plan.listSelector?Array.from(root.querySelectorAll('*')).filter(node=>seen.has(node)&&(!selected||selected.has(node))):selected?Array.from(selected):[root];
    if(!items.length)return fail('列表范围未匹配任何记录，请先修正列表容器和列表项。');
    const rows=items.slice(0,100).map((row,index)=>{
      const nodes=selector==='.'?[row]:Array.from(row.querySelectorAll(selector));
      const value=nodes.length?(read==='text'?nodes[0].textContent:nodes[0].getAttribute(read)):null;
      return {index:index+1,count:nodes.length,value:value?.trim()??'',issue:!nodes.length?'未匹配':nodes.length>1?'多匹配':!value?.trim()?'空值':''};
    });
    const missing=rows.filter(row=>!row.count).length,ambiguous=rows.filter(row=>row.count>1).length,empty=rows.filter(row=>row.count===1&&!row.value).length;
    return {status:missing||ambiguous||empty?'warning':'pass',total:rows.length,matched:rows.length-missing,missing,empty,ambiguous,rows,truncated:items.length>100};
  }catch{return fail('CSS 语法无效，请检查选择器或列表范围。');}
}
