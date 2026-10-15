// Rendered HTML -> semantic blocks -> MindNode; no guessing source Markdown.
// Node fields match Mindbank's {id,title,content,depth,children} idea, with
// additional kind for read-only browsing. This is intentionally NOT XMind.
const MAX_NODES=160,MAX_DEPTH=8,MAX_TITLE=72,MAX_NOTE=1200,MAX_TOTAL_NOTE=22000;
const SKIP='script,style,svg,button,input,textarea,select,nav,aside,[contenteditable="true"],'+
  '[data-opendesk-chatgpt-mindmap]';
const trim=value=>String(value??'').replace(/\s+/g,' ').trim();
const slice=(text,n)=>Array.from(text).slice(0,n).join('');

export function extractAnswerTree(content){
  const root={id:'root',title:'本条回复',kind:'root',depth:0,children:[]};
  const state={count:1,next:0,noteBytes:0,truncated:false,headingStack:[],intro:0};
  function note(node,text){
    if(!node)return;
    const value=String(text??'').trim();if(!value)return;
    const available=Math.min(MAX_NOTE-(node.content?.length||0),MAX_TOTAL_NOTE-state.noteBytes);
    if(available<=0){state.truncated=true;return;}
    const output=slice(value,available);
    node.content=(node.content?node.content+'\n':'')+output;
    state.noteBytes+=output.length;
    if(output.length<value.length)state.truncated=true;
  }
  function add(parent,title,kind='paragraph'){
    if(state.count>=MAX_NODES||parent.depth>=MAX_DEPTH){state.truncated=true;return null;}
    const value=trim(title);
    if(!value)return null;
    const label=slice(value,MAX_TITLE);
    const node={id:'n-'+state.next++,title:label,kind,depth:parent.depth+1,children:[]};
    parent.children.push(node);state.count++;
    if(value.length>label.length)note(node,value);
    return node;
  }
  const current=()=>state.headingStack.at(-1)?.node||root;
  function heading(node){
    const level=Number(node.tagName.slice(1));
    while(state.headingStack.length&&state.headingStack.at(-1).level>=level)state.headingStack.pop();
    const created=add(current(),node.textContent||'未命名标题','heading');
    if(created)state.headingStack.push({node:created,level});
  }
  function list(element,parent){
    for(const li of element.children){
      if(li.tagName!=='LI')continue;
      const title=[...li.childNodes].filter(item=>item.nodeType!==1||!
        ['UL','OL','PRE','TABLE'].includes(item.tagName))
        .map(item=>item.textContent).join(' ').trim();
      const child=add(parent,title||'列表项',element.tagName==='OL'?'ordered':'list');
      if(!child)continue;
      for(const sub of li.children){
        if(sub.tagName==='UL'||sub.tagName==='OL')list(sub,child);
        if(sub.tagName==='PRE')note(child,sub.textContent);
      }
    }
  }
  function table(element,parent){
    const node=add(parent,'表格','table');if(!node)return;
    const header=[...element.querySelectorAll('thead th')].slice(0,8).map(th=>trim(th.textContent));
    let rows=0;
    for(const tr of element.querySelectorAll('tr')){
      const cells=[...tr.children].filter(n=>['TH','TD'].includes(n.tagName));
      if(!cells.length)continue;
      if(rows++>=12){state.truncated=true;break;}
      const row=add(node,cells.slice(0,4).map(cell=>trim(cell.textContent)).join(' ｜ ')||'表格行','row');
      if(row&&header.length)note(row,header.join(' ｜ '));
      if(cells.length>4)state.truncated=true;
    }
  }
  function visit(element){
    for(const child of element.children){
      if(child.matches(SKIP)||child.hidden||child.getAttribute('aria-hidden')==='true')continue;
      const tag=child.tagName;
      if(/^H[1-6]$/.test(tag)){heading(child);continue;}
      if(tag==='UL'||tag==='OL'){list(child,current());continue;}
      if(tag==='P'){
        const content=trim(child.textContent);
        if(!content)continue;
        const headingNode=state.headingStack.at(-1)?.node;
        if(headingNode)note(headingNode,content);
        else add(root,content,'paragraph');
        continue;
      }
      if(tag==='PRE'){
        const code=child.querySelector('code');
        const lang=code?.className?.match?.(/language-([\w+-]+)/)?.[1];
        note(add(current(),lang?'代码 · '+lang:'代码','code'),(code||child).textContent);
        continue;
      }
      if(tag==='BLOCKQUOTE'){
        note(add(current(),'引用','quote'),child.textContent);
        continue;
      }
      if(tag==='TABLE'){table(child,current());continue;}
      if(child.children.length)visit(child);
      else if(trim(child.textContent)&&!['HR','IMG','BR','SVG'].includes(tag)){
        const text=trim(child.textContent);
        const headingNode=state.headingStack.at(-1)?.node;
        if(headingNode)note(headingNode,text);
        else add(root,text,'paragraph');
      }
    }
  }
  visit(content);
  if(!root.children.length){
    const value=trim(content.textContent);
    if(value)add(root,value,'paragraph');
  }
  return {tree:root,nodeCount:state.count-1,truncated:state.truncated};
}
