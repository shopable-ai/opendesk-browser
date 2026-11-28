import {lexer} from './vendor/marked.js';
import {prism} from './vendor/prism.js';
import {resolveReference,uniqueSlug,blockHash,decodeText} from './policy.js';

// Construct an allowlisted DOM from mature Marked tokens. No Markdown HTML
// enters innerHTML, DOMParser, document.write, or a script-bearing element.
export function renderMarkdown(doc,text,base,{copyLabel='Copy',copy=()=>{},remoteImageLabel='External image blocked'}={}){
  const root=doc.createDocumentFragment(),headings=[],used=new Set(),occurrences=new Map();
  const element=(tag,value)=>{const el=doc.createElement(tag);if(value!==undefined)el.textContent=value;return el;};
  const appendText=(parent,value)=>parent.append(doc.createTextNode(value));
  const mark=(el,token)=>{
    const stem=token.type+':'+blockHash(token.raw??token.text??'');
    const n=occurrences.get(stem)||0;occurrences.set(stem,n+1);
    el.dataset.odmvAnchor=stem+':'+n;return el;
  };
  let count=0;
  function highlight(code,lang){
    const grammar=Object.hasOwn(prism.languages,lang)?prism.languages[lang]:null;
    if(!grammar||!Object.keys(grammar).length||code.length>32000)return null;
    try{
      const out=doc.createDocumentFragment();
      function write(parent,tokens,depth=0){
        if(depth>40)throw Error('highlight depth');
        for(const token of Array.isArray(tokens)?tokens:[tokens]){
          if(typeof token==='string'){appendText(parent,token);continue;}
          const span=element('span');span.className='token '+String(token.type).replace(/[^a-z0-9_-]/gi,'');
          write(span,token.content,depth+1);parent.append(span);
        }
      }
      write(out,prism.tokenize(code,grammar));return out;
    }catch{return null;}
  }
  function walk(parent,tokens,depth=0,inline=false){
    if(depth>80)throw Object.assign(Error('Markdown nesting limit'),{code:'E_RENDER'});
    for(const t of tokens||[]){
      if(++count>120000)throw Object.assign(Error('Markdown node limit'),{code:'E_RENDER'});
      let el;
      const inner=(target,children=t.tokens)=>children?walk(target,children,depth+1,true):appendText(target,decodeText(t.text));
      switch(t.type){
        case 'space':case 'def':break;
        case 'heading':{
          el=mark(element('h'+Math.max(1,Math.min(6,Number(t.depth)||1))),t);
          inner(el);el.id=uniqueSlug(el.textContent,used);
          headings.push({id:el.id,level:Number(t.depth)||1,title:el.textContent,element:el});parent.append(el);break;
        }
        case 'paragraph':el=mark(element('p'),t);inner(el);parent.append(el);break;
        case 'text':case 'escape':
          if(t.tokens)walk(parent,t.tokens,depth+1,true);else appendText(parent,t.type==='escape'?String(t.text??''):decodeText(t.text));
          break;
        case 'strong':case 'em':case 'del':
          el=element(t.type==='del'?'s':t.type);inner(el);parent.append(el);break;
        case 'codespan':parent.append(element('code',t.text??''));break;
        case 'br':parent.append(element('br'));break;
        case 'hr':parent.append(mark(element('hr'),t));break;
        case 'blockquote':el=mark(element('blockquote'),t);walk(el,t.tokens,depth+1);parent.append(el);break;
        case 'html':
          // Raw HTML is deliberately visible literal text, never active markup.
          if(t.block){el=mark(element('pre',t.text??t.raw??''),t);el.className='odmv-literal';parent.append(el);}
          else appendText(parent,t.text??t.raw??'');
          break;
        case 'link':{
          const url=resolveReference(t.href,base);
          el=element(url?'a':'span');
          if(url){el.href=url;el.rel='noreferrer noopener';if(t.title)el.title=String(t.title);}
          inner(el);parent.append(el);break;
        }
        case 'image':{
          const url=resolveReference(t.href,base,{image:true});
          if(!url){el=element('span','['+remoteImageLabel+': '+decodeText(t.text)+']');el.className='odmv-image-placeholder';}
          else {el=element('img');el.alt=decodeText(t.text);el.decoding='async';el.loading='lazy';el.referrerPolicy='no-referrer';
            if(t.title)el.title=String(t.title);el.src=url;}
          parent.append(el);break;
        }
        case 'checkbox':{
          el=element('input');el.type='checkbox';el.disabled=true;el.checked=Boolean(t.checked);
          el.setAttribute('aria-label',t.checked?'Completed task':'Incomplete task');parent.append(el);break;
        }
        case 'list':{
          el=mark(element(t.ordered?'ol':'ul'),t);
          if(t.ordered&&Number.isSafeInteger(t.start)&&t.start!==1)el.start=t.start;
          for(const item of t.items||[]){
            const li=mark(element('li'),item);
            if(item.task){
              li.className='odmv-task';
              if(!item.tokens?.some(token=>token.type==='checkbox')){
                const cb=element('input');cb.type='checkbox';cb.disabled=true;cb.checked=Boolean(item.checked);
                cb.setAttribute('aria-label',item.checked?'Completed task':'Incomplete task');li.append(cb);
              }
            }
            walk(li,item.tokens,depth+1);el.append(li);
          }
          parent.append(el);break;
        }
        case 'code':{
          const wrap=mark(element('div'),t);wrap.className='odmv-code';
          const bar=element('div');bar.className='odmv-codebar';
          const lang=String(t.lang||'').trim().split(/\s+/)[0].toLowerCase();
          bar.append(element('span',lang||'text'));
          const btn=element('button',copyLabel);btn.type='button';
          const pre=element('pre'),code=element('code');
          const content=String(t.text??'');const tokens=highlight(content,lang);
          if(tokens)code.append(tokens);else code.textContent=content;
          btn.addEventListener('click',()=>copy(content,code));bar.append(btn);
          pre.append(code);wrap.append(bar,pre);parent.append(wrap);break;
        }
        case 'table':{
          const wrap=mark(element('div'),t);wrap.className='odmv-table';wrap.tabIndex=0;
          wrap.setAttribute('role','region');wrap.setAttribute('aria-label','Markdown table');
          const table=element('table'),thead=element('thead'),tbody=element('tbody');
          function row(cells,isHeader){
            const tr=element('tr');
            cells.forEach((cell,i)=>{
              const td=element(isHeader?'th':'td');
              if(isHeader)td.scope='col';
              const alignment=t.align?.[i];
              if(['left','center','right'].includes(alignment))td.style.textAlign=alignment;
              walk(td,cell.tokens,depth+1,true);tr.append(td);
            });return tr;
          }
          thead.append(row(t.header,true));for(const cells of t.rows||[])tbody.append(row(cells,false));
          table.append(thead,tbody);wrap.append(table);parent.append(wrap);break;
        }
        default:appendText(parent,String(t.raw??t.text??''));
      }
    }
  }
  walk(root,lexer(text,{gfm:true,breaks:false}));
  return {root,headings};
}
