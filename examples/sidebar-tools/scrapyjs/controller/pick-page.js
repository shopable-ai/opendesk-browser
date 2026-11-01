// A bounded user click on the admitted target page; no sidebar DOM access.
export async function runClickedInspection(input,page){
  const fail=code=>{throw Object.assign(new Error(code),{code});};
  const result=await page.evaluate(async spec=>{
    if(location.href!==spec.url)throw Error('E_INSPECTION_URL');
    const forbidden=new Set(['input','textarea','select','option','button','form','script','style','noscript','template','iframe','object','embed']);
    const safe=node=>{
      if(!node||node.nodeType!==1)return false;
      for(let n=node;n;n=n.parentElement)if(forbidden.has(n.localName)||n.isContentEditable||n.hasAttribute('contenteditable'))return false;
      return true;
    };
    const query=(root,selector)=>{try{return [...root.querySelectorAll(selector)];}catch{throw Error('E_INSPECTION_CSS');}};
    const preview=value=>String(value??'').trim().replace(/\s+/gu,' ').slice(0,240);
    function text(node){
      if(!safe(node))return '';
      let out='';
      for(const child of node.childNodes){
        if(child.nodeType===3)out+=child.nodeValue||'';
        else if(child.nodeType===1)out+=text(child);
      }
      return out;
    }
    const token=value=>/^[a-zA-Z_\u0080-\uffff][\w\u0080-\uffff-]*$/u.test(value)?value:
      [...value].map(char=>'\\'+char.codePointAt(0).toString(16)+' ').join('');
    const classes=node=>[...node.classList].filter(name=>!/^(?:is-|selected$|active$)|\d{4,}/u.test(name)).slice(0,2);
    const part=node=>node.localName+classes(node).map(name=>'.'+token(name)).join('');
    function relative(node,row){
      if(node===row)return '.';
      const parts=[];
      for(let n=node;n&&n!==row;n=n.parentElement){
        parts.unshift(part(n));const selector=parts.join(' > '),found=query(row,selector);
        if(found.length===1&&found[0]===node)return selector;
      }
      const path=[];
      for(let n=node;n&&n!==row;n=n.parentElement){
        const siblings=[...n.parentElement.children].filter(sibling=>sibling.localName===n.localName);
        path.unshift(n.localName+':nth-of-type('+(siblings.indexOf(n)+1)+')');
      }
      return path.join(' > ');
    }
    function unique(node){
      const one=selector=>{const found=query(document,selector);return found.length===1&&found[0]===node;};
      if(node.id&&one('#'+token(node.id)))return '#'+token(node.id);
      if(one(part(node)))return part(node);
      const path=[];
      for(let n=node;n;n=n.parentElement){
        const peers=[...(n.parentElement?.children||[n])].filter(peer=>peer.localName===n.localName);
        path.unshift(n.localName+':nth-of-type('+(peers.indexOf(n)+1)+')');
        const selector=path.join(' > ');
        if(one(selector))return selector;
      }
      return null;
    }
    const container=spec.container.trim(),item=spec.item.trim();
    const scopes=container?query(document,container):[];
    const selected=item?query(document,item):null,set=selected?new Set(selected):null;
    const records=container?scopes.flatMap(scope=>[...scope.children].filter(row=>!set||set.has(row))):
      selected||[document.body].filter(Boolean);
    if(spec.kind==='fields'&&records.length>100)throw Error('E_INSPECTION_LIMIT');
    if(spec.kind==='fields'&&!records.length)throw Error('E_PICK_NO_ROWS');
    function options(target){
      if(!safe(target))return null;
      if(spec.kind==='fields'){
        const row=records.find(record=>record===target||record.contains(target));
        if(!row)return null;
        const ancestor=target.closest('a,img'),node=ancestor&&(row===ancestor||row.contains(ancestor))?ancestor:target;
        const selector=relative(node,row);
        if(!selector)return null;
        const reads=node.localName==='img'?['src','data-src'].filter(attr=>node.hasAttribute(attr)):
          node.localName==='a'&&node.hasAttribute('href')?['text','href']:['text'];
        const choices=reads.map(read=>{
          let missing=0,ambiguous=0,empty=0;const samples=[];
          records.forEach((record,index)=>{
            const matched=(selector==='.'?[record]:query(record,selector)).filter(safe);
            if(!matched.length)missing++;
            else if(matched.length>1)ambiguous++;
            const value=matched.length?(read==='text'?text(matched[0]):matched[0].getAttribute(read)||''):'';
            if(matched.length===1&&!value.trim())empty++;
            if(index<3)samples.push({index:index+1,value:preview(value)});
          });
          return {selector,read,rule:selector+'::'+read,label:
            (read==='text'?'文字':read==='href'?'链接地址':'图片地址')+' · '+(samples[0]?.value||node.localName).slice(0,80),
            samples,total:records.length,missing,ambiguous,empty,
            status:missing||ambiguous||empty?'warning':'pass'};
        });
        return choices.length?choices:null;
      }
      const candidates=[];
      for(let node=target;node&&!['html','body'].includes(node.localName);node=node.parentElement){
        if(!safe(node))continue;
        const children=[...node.children].filter(safe);
        if(children.length<2)continue;
        let filter=item,matches;
        if(item)matches=children.filter(child=>set.has(child));
        else{
          const counts=new Map();
          for(const child of children)counts.set(child.localName,(counts.get(child.localName)||0)+1);
          filter=['ul','ol'].includes(node.localName)?'li':[...counts].sort((a,b)=>b[1]-a[1])[0]?.[0];
          matches=children.filter(child=>child.localName===filter);
        }
        if(matches.length<2||matches.length>100)continue;
        const selector=unique(node);
        if(!selector)continue;
        candidates.push({container:selector,item:filter,count:matches.length,
          label:node.getAttribute('aria-label')||node.localName+' · '+preview(text(matches[0])).slice(0,80),
          samples:matches.slice(0,3).map(child=>preview(text(child))),
          priority:(['ul','ol'].includes(node.localName)?1000:0)+matches.length});
      }
      candidates.sort((a,b)=>b.priority-a.priority);
      if(!candidates.length)return null;
      const {priority,...choice}=candidates[0];return [choice];
    }
    return new Promise((resolve,reject)=>{
      const overlay=document.createElement('div');
      overlay.setAttribute('data-opendesk-scrapyjs-picker','');
      overlay.setAttribute('aria-hidden','true');
      overlay.style.cssText='position:fixed;pointer-events:none;z-index:2147483647;box-sizing:border-box;border:2px solid #3478f6;background:rgba(52,120,246,.09);border-radius:3px;display:none;';
      document.body.appendChild(overlay);
      let done=false,timer;
      const cleanup=()=>{
        document.removeEventListener('pointermove',hover,true);
        document.removeEventListener('click',pick,true);
        document.removeEventListener('keydown',keydown,true);
        window.removeEventListener('pagehide',pagehide,true);
        clearTimeout(timer);overlay.remove();
      };
      const finish=(value,error)=>{
        if(done)return;done=true;cleanup();
        if(error)reject(error);else resolve(value);
      };
      const hover=event=>{
        if(location.href!==spec.url)return finish(null,Error('E_INSPECTION_URL'));
        const element=event.target;
        if(!(element instanceof Element)||!options(element)){overlay.style.display='none';return;}
        const rect=element.getBoundingClientRect();
        Object.assign(overlay.style,{left:rect.left+'px',top:rect.top+'px',width:rect.width+'px',height:rect.height+'px',display:'block'});
      };
      const pick=event=>{
        if(location.href!==spec.url)return finish(null,Error('E_INSPECTION_URL'));
        if(!(event.target instanceof Element))return;
        const choices=options(event.target);
        if(!choices)return;
        event.preventDefault();event.stopImmediatePropagation();
        finish({kind:spec.kind,url:spec.url,choices});
      };
      const keydown=event=>{if(event.key==='Escape')finish(null,Error('E_PICK_CANCELLED'));};
      const pagehide=()=>finish(null,Error('E_INSPECTION_URL'));
      document.addEventListener('pointermove',hover,true);
      document.addEventListener('click',pick,true);
      document.addEventListener('keydown',keydown,true);
      window.addEventListener('pagehide',pagehide,true);
      timer=setTimeout(()=>finish(null,Error('E_PICK_TIMEOUT')),25000);
    });
  },{url:input.url,kind:input.kind,container:input.container,item:input.item});
  if(!result||result.url!==input.url||result.kind!==input.kind||!Array.isArray(result.choices))fail('E_INSPECTION_RESULT');
  if(new TextEncoder().encode(JSON.stringify(result)).length>48000)fail('E_INSPECTION_LIMIT');
  return result;
}
