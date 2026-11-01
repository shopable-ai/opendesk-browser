import {allowedUrl} from '../adapters/capture-policy.js';
import {runClickedInspection} from './pick-page.js';

const fail=code=>{throw Object.assign(new Error(code),{code});};

// Fixed, read-only inspection. Confirmation and document-identity validation
// remain with the original Task read; this module never navigates or installs UI.
export async function runInspection(input,page) {
  if(!input||!['fields','lists'].includes(input.kind)||typeof input.url!=='string'||
    typeof input.container!=='string'||typeof input.item!=='string'||
    (input.mode!==undefined&&!['snapshot','click'].includes(input.mode)))fail('E_INSPECTION_CONFIG');
  input={url:input.url,kind:input.kind,container:input.container,item:input.item};
  allowedUrl(input.url);
  if(await page.url()!==input.url)fail('E_INSPECTION_URL');
  if(input.mode==='click')return runClickedInspection(input,page);
  const result=await page.evaluate(input=>{
    const fail=code=>{throw Object.assign(new Error(code),{code});};
    if(location.href!==input.url)fail('E_INSPECTION_URL');
    const forbidden=new Set(['input','textarea','select','option','button','script','style','noscript','template','form','iframe','object','embed']);
    function safe(node) {
      for(let current=node;current;current=current.parentElement)
        if(forbidden.has(current.localName)||current.hasAttribute('contenteditable'))return false;
      return true;
    }
    // Never use aggregate textContent: it can include script, form or editable
    // descendants even when their containing candidate is otherwise safe.
    function text(node) {
      if(!safe(node))return '';
      let value='';
      for(const child of node.childNodes){
        if(child.nodeType===3)value+=child.nodeValue||'';
        else if(child.nodeType===1)value+=text(child);
      }
      return value;
    }
    const preview=value=>value.trim().replace(/\s+/g,' ').slice(0,240);
    const query=(root,selector)=>{
      try{return Array.from(root.querySelectorAll(selector));}
      catch{fail('E_INSPECTION_CSS');}
    };
    const container=input.container.trim(),item=input.item.trim();
    // Validate both selectors even when one scope has no matches.
    const scopes=container?query(document,container):[];
    const selected=item?query(document,item):null;
    const selectedSet=selected?new Set(selected):null;
    const token=value=>/^[a-zA-Z_\u0080-\uffff][\w\u0080-\uffff-]*$/.test(value)?value:
      Array.from(value,char=>'\\'+char.codePointAt(0).toString(16)+' ').join('');
    const classes=node=>Array.from(node.classList).filter(name=>
      !/^(?:is-|selected$|active$)|\d{4,}/.test(name)).slice(0,2);
    function relative(node,row) {
      if(node===row)return '.';
      const parts=[];
      for(let current=node;current&&current!==row;current=current.parentElement){
        parts.unshift(current.localName+classes(current).map(name=>'.'+token(name)).join(''));
        const selector=parts.join(' > '),matches=query(row,selector);
        if(matches.length===1&&matches[0]===node)return selector;
      }
      const path=[];
      for(let current=node;current&&current!==row;current=current.parentElement){
        const peers=Array.from(current.parentElement.children).filter(peer=>peer.localName===current.localName);
        path.unshift(current.localName+':nth-of-type('+(peers.indexOf(current)+1)+')');
      }
      return path.join(' > ');
    }
    function unique(node) {
      const one=selector=>{const matches=query(document,selector);return matches.length===1&&matches[0]===node;};
      if(node.id&&one('#'+token(node.id)))return '#'+token(node.id);
      const semantic=node.localName+classes(node).map(name=>'.'+token(name)).join('');
      if(one(semantic))return semantic;
      const parts=[];
      for(let current=node;current;current=current.parentElement){
        const peers=Array.from(current.parentElement?.children||[current]).filter(peer=>peer.localName===current.localName);
        parts.unshift(current.localName+':nth-of-type('+(peers.indexOf(current)+1)+')');
        const selector=parts.join(' > ');
        if(one(selector))return selector;
      }
      return null;
    }
    const choices=[];
    let truncated=false;
    function add(choice) {
      if(choices.length===32){truncated=true;return;}
      choices.push(choice);
    }
    if(input.kind==='fields'){
      const direct=new Set(scopes.flatMap(scope=>Array.from(scope.children)));
      const rows=container?query(document,'*').filter(node=>direct.has(node)&&(!selectedSet||selectedSet.has(node))):
        selected||[document.body].filter(Boolean);
      if(rows.length>100)fail('E_INSPECTION_LIMIT');
      if(rows.length){
        const first=rows[0],seen=new Set();
        for(const node of [first,...query(first,'*')]){
          if(!safe(node)||!(node.children.length===0||['a','img'].includes(node.localName)))continue;
          const selector=relative(node,first);
          const reads=['text'];
          if(node.localName==='a'&&node.hasAttribute('href'))reads.push('href');
          if(node.localName==='img')for(const attr of ['src','data-src'])if(node.hasAttribute(attr))reads.push(attr);
          for(const read of reads){
            const rule=selector+'::'+read;
            if(seen.has(rule))continue;
            seen.add(rule);
            if(choices.length===32){truncated=true;continue;}
            let missing=0,ambiguous=0,empty=0;
            const samples=[];
            rows.forEach((row,index)=>{
              const nodes=(selector==='.'?[row]:query(row,selector)).filter(safe);
              if(!nodes.length)missing++;
              else if(nodes.length>1)ambiguous++;
              const value=nodes.length?(read==='text'?text(nodes[0]):nodes[0].getAttribute(read)||''):'';
              if(nodes.length===1&&!value.trim())empty++;
              if(index<3)samples.push({index:index+1,value:preview(value)});
            });
            add({selector,read,rule,label:node.localName+' · '+read+' · '+(samples[0]?.value||'空值').slice(0,80),
              samples,total:rows.length,missing,ambiguous,empty,status:missing||ambiguous||empty?'warning':'pass'});
          }
        }
      }
    }else{
      for(const node of query(document,'*')){
        if(['html','body'].includes(node.localName)||!safe(node))continue;
        const children=Array.from(node.children).filter(safe);
        let filter=item,rows;
        if(item)rows=children.filter(child=>selectedSet.has(child));
        else{
          const counts=new Map();
          for(const child of children)counts.set(child.localName,(counts.get(child.localName)||0)+1);
          filter=['ul','ol'].includes(node.localName)?'li':Array.from(counts).sort((a,b)=>b[1]-a[1])[0]?.[0];
          rows=children.filter(child=>child.localName===filter);
        }
        if(rows.length<2)continue;
        if(rows.length>100)fail('E_INSPECTION_LIMIT');
        const selector=unique(node);
        if(!selector)continue;
        add({container:selector,item:filter,count:rows.length,
          label:node.localName+' · '+preview(text(rows[0])).slice(0,80),samples:rows.slice(0,3).map(row=>preview(text(row)))});
      }
    }
    return {kind:input.kind,url:input.url,choices,...truncated?{truncated:true}:{}};
  },{url:input.url,kind:input.kind,container:input.container,item:input.item});
  if(new TextEncoder().encode(JSON.stringify(result)).length>48000)fail('E_INSPECTION_LIMIT');
  return result;
}
