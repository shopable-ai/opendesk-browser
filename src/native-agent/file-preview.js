export const PREVIEW_CSP="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
export const escapeHTML=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function inlineMarkdown(text){
  // Escape first: Markdown raw HTML never enters the privileged document.
  return escapeHTML(text).replace(/`([^`]+)`/g,'<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/\*([^*]+)\*/g,'<em>$1</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,'$1 <small>($2)</small>');
}

// Intentionally a dependency-free BASIC Markdown renderer for this demo:
// headings, paragraphs, fenced code, lists, quotes, tables and inline emphasis.
// It does not claim CommonMark/GFM/MDX parity or execute embedded HTML/JSX.
export function renderMarkdown(source){
  const lines=String(source).replace(/\r\n?/g,'\n').split('\n'),out=[];
  let paragraph=[],list=null,fence=null,code=[];
  const flush=()=>{if(paragraph.length){out.push('<p>'+inlineMarkdown(paragraph.join(' '))+'</p>');paragraph=[];}
    if(list){out.push('</'+list+'>');list=null;}};
  const cells=line=>line.trim().replace(/^\||\|$/g,'').split('|').map(cell=>inlineMarkdown(cell.trim()));
  for(let i=0;i<lines.length;i++){
    const line=lines[i],f=line.match(/^\s*(`{3,}|~{3,})(.*)$/);
    if(fence){if(f&&f[1][0]===fence[0]&&f[1].length>=fence.length&&!f[2].trim()){
      out.push('<pre><code>'+escapeHTML(code.join('\n'))+'</code></pre>');fence=null;code=[];
    }else code.push(line);continue;}
    if(f){flush();fence=f[1];continue;}
    if(!line.trim()){flush();continue;}
    const h=line.match(/^(#{1,6})\s+(.+)$/);
    if(h){flush();out.push('<h'+h[1].length+'>'+inlineMarkdown(h[2])+'</h'+h[1].length+'>');continue;}
    if(/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)){flush();out.push('<hr>');continue;}
    if(line.includes('|')&&i+1<lines.length&&/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[i+1])){
      flush();out.push('<table><thead><tr>'+cells(line).map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody>');i++;
      while(i+1<lines.length&&lines[i+1].includes('|')&&lines[i+1].trim())out.push('<tr>'+cells(lines[++i]).map(x=>'<td>'+x+'</td>').join('')+'</tr>');
      out.push('</tbody></table>');continue;
    }
    const li=line.match(/^\s*(?:([-*+])|\d+\.)\s+(.+)$/);
    if(li){const kind=li[1]?'ul':'ol';if(paragraph.length||list&&list!==kind)flush();
      if(!list){list=kind;out.push('<'+kind+'>');}out.push('<li>'+inlineMarkdown(li[2])+'</li>');continue;}
    if(/^>\s?/.test(line)){flush();out.push('<blockquote>'+inlineMarkdown(line.replace(/^>\s?/,''))+'</blockquote>');continue;}
    if(list)flush();paragraph.push(line);
  }
  flush();if(fence)out.push('<pre><code>'+escapeHTML(code.join('\n'))+'</code></pre>');return out.join('\n');
}

export function sanitizeHTML(source,doc=globalThis.document){
  // Template contents are inert, including image/frame loads during parsing.
  const template=doc.createElement('template');template.innerHTML=String(source);
  const allowed=new Set('a abbr article aside b blockquote br button caption code col colgroup dd del details div dl dt em figcaption figure footer h1 h2 h3 h4 h5 h6 header hr i img label li main nav ol p pre s section small span strong style sub summary sup table tbody td th thead tr u ul'.split(' '));
  const clean=node=>{
    if(node.nodeType===3)return escapeHTML(node.textContent);
    if(node.nodeType!==1)return '';
    const tag=node.localName;
    if(!allowed.has(tag))return '';
    if(tag==='style')return '<style>'+node.textContent.replace(/<\//g,'<\\/')+'</style>';
    const attrs=[];
    for(const {name,value} of node.attributes){
      if(['class','style','title','aria-label','role'].includes(name)||name==='id'&&/^[\w-]{1,100}$/.test(value)||
        ['colspan','rowspan'].includes(name)&&/^\d{1,2}$/.test(value)||
        tag==='img'&&name==='alt'||tag==='a'&&name==='href'&&/^#[\w-]+$/.test(value)||
        tag==='img'&&name==='src'&&/^data:image\/(?:png|jpeg|gif|webp);base64,[a-z\d+/=\s]+$/i.test(value))
        attrs.push(name+'="'+escapeHTML(value)+'"');
    }
    const open='<'+tag+(attrs.length?' '+attrs.join(' '):'')+'>';
    return open+(['br','hr','img','col'].includes(tag)?'':[...node.childNodes].map(clean).join('')+'</'+tag+'>');
  };
  return [...template.content.childNodes].map(clean).join('');
}

export function previewDocument(path,content,doc=globalThis.document){
  const type=/\.(md|markdown)$/i.test(path)?'markdown':/\.html?$/i.test(path)?'html':'source';
  const body=type==='markdown'?renderMarkdown(content):type==='html'?sanitizeHTML(content,doc):'<pre><code>'+escapeHTML(content)+'</code></pre>';
  return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<meta http-equiv="Content-Security-Policy" content="'+escapeHTML(PREVIEW_CSP)+'"><title>'+escapeHTML(path)+'</title>'+
    '<style>body{font:15px/1.8 system-ui,-apple-system,"PingFang SC",sans-serif;color:#263247;background:#fff;margin:0;padding:28px;overflow-wrap:anywhere}h1{font-size:26px;line-height:1.3}h2{font-size:20px;margin-top:28px}h3{font-size:17px}pre{white-space:pre-wrap;background:#f3f5f9;padding:16px;border-radius:8px;line-height:1.6}code{font:13px/1.7 ui-monospace,monospace}p code,li code{background:#eef1f7;padding:2px 5px;border-radius:4px}blockquote{border-left:3px solid #608be3;margin-left:0;padding:6px 16px;color:#4f6487}table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #e5e9f1;text-align:left;padding:9px}th{background:#f7f9fc}img{max-width:100%}hr{border:0;border-top:1px solid #e7ebf2}small{color:#718096}</style></head><body>'+body+'</body></html>';
}

export function validatePreviewURL(value){
  let url;try{url=new URL(value);}catch{throw new Error('请输入完整的本机开发服务地址');}
  if(url.protocol!=='http:'||!['127.0.0.1','localhost'].includes(url.hostname)||
    !url.port||url.username||url.password||url.hash)throw new Error('仅支持带端口的本机 HTTP 地址，例如 http://127.0.0.1:3000/');
  return url.href;
}

// Serialized by chrome.scripting; deliberately has no file bridge or callbacks.
export function displayPagePreview({html,title,remove=false}){
  const key='__opendeskFilePreviewR1';
  globalThis[key]?.remove();globalThis[key]=null;
  if(remove)return {removed:true};
  const host=document.createElement('div');
  const lifecycle=new AbortController();
  const cleanup=()=>{lifecycle.abort();host.remove();if(globalThis[key]?.remove===cleanup)globalThis[key]=null;};
  host.style.cssText='position:fixed;right:20px;top:76px;width:min(440px,calc(100vw - 40px));height:75vh;z-index:2147483600;';
  const root=host.attachShadow({mode:'closed'}),style=document.createElement('style');
  style.textContent=':host{all:initial}.panel{height:100%;display:flex;flex-direction:column;background:#fff;border:1px solid #d4ddeb;border-radius:12px;box-shadow:0 18px 70px #122a4d40;overflow:hidden;color:#233449;font:13px system-ui}header{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 16px;background:#f4f7fc}strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}button{border:1px solid #cfdae9;background:#fff;border-radius:6px;padding:4px 9px;color:#233449;font:inherit}iframe{width:100%;flex:1;border:0;background:#fff}';
  const panel=document.createElement('section');panel.className='panel';
  const header=document.createElement('header'),label=document.createElement('strong'),close=document.createElement('button');
  label.textContent='OpenDesk · '+title;close.textContent='关闭';close.type='button';
  const frame=document.createElement('iframe');frame.title='本地文件静态预览';frame.setAttribute('sandbox','');frame.referrerPolicy='no-referrer';frame.srcdoc=html;
  close.addEventListener('click',cleanup,{signal:lifecycle.signal});
  header.append(label,close);panel.append(header,frame);root.append(style,panel);document.documentElement.append(host);globalThis[key]={remove:cleanup};
  addEventListener('pagehide',cleanup,{once:true,signal:lifecycle.signal});
  return {displayed:true,title};
}
